"use client";

// labels.tsx — renameable hierarchy labels for the planner.
//
// The planner uses four nested concepts — Subject, Unit, Lesson, Section —
// across every surface. Schools sometimes call these by different names
// ("Strand" instead of "Subject", "Module" instead of "Unit", etc.). This
// context lets a teacher rename ANY of the four from Settings → Appearance
// without changing what the concepts DO; only the visible captions follow.
//
// Surfaces that need a caption (e.g. the ResourceComposer's routing-row
// pickers, or future breadcrumb chrome) read the labels via the
// `useLabels()` hook. The Settings page mutates them via `useSetLabels()`.
//
// Persistence: writes through to localStorage under the
// `mycurricula:hierarchy-labels` key so a teacher's overrides survive
// reloads even before the Supabase backend lands. The persistence layer is
// SSR-guarded (no `window` reads on the server) and hydration-safe — the
// useState initializer always returns the DEFAULTS so the server-rendered
// HTML and the first client render match exactly; saved overrides are
// loaded in a post-mount effect and applied after hydration completes.
//
// Contract — frozen across agents. Other agents (e.g. the resource-composer
// agent rendering the four routing pickers) import `useLabels` and read
// `subject / unit / lesson / section`. Do not rename or add fields without
// coordinating across all consumers.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

// ── Public types ─────────────────────────────────────────────────────────

/**
 * The renameable captions for the four planner hierarchy levels. Field
 * names match the underlying concepts (which are NOT renameable); only the
 * string VALUES change when a teacher overrides them.
 */
export interface HierarchyLabels {
  subject: string;
  unit: string;
  lesson: string;
  section: string;
}

/**
 * The factory-default captions. Used as the SSR + first-client-render
 * value (so hydration matches), and as the target of the
 * "Restore defaults" affordance in Settings.
 */
export const DEFAULT_LABELS: HierarchyLabels = {
  subject: "Subject",
  unit: "Unit",
  lesson: "Lesson",
  section: "Section",
};

// ── Storage ──────────────────────────────────────────────────────────────

/** localStorage key for the persisted overrides. App-namespaced. */
const STORAGE_KEY = "mycurricula:hierarchy-labels";

/**
 * Load the saved labels from localStorage, merging onto the defaults so a
 * partial / stale record never produces an undefined caption. Returns the
 * defaults unchanged when storage is unavailable (SSR), empty, or the
 * stored JSON is malformed.
 */
function loadLabels(): HierarchyLabels {
  // SSR + private-mode guard — `window` and `localStorage` may both throw.
  if (typeof window === "undefined") return DEFAULT_LABELS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LABELS;
    const parsed = JSON.parse(raw) as Partial<HierarchyLabels> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULT_LABELS;
    // Merge onto the defaults so missing fields and non-string values both
    // fall back gracefully; we never want an undefined caption to reach
    // the UI.
    return {
      subject:
        typeof parsed.subject === "string" && parsed.subject.trim().length > 0
          ? parsed.subject
          : DEFAULT_LABELS.subject,
      unit:
        typeof parsed.unit === "string" && parsed.unit.trim().length > 0
          ? parsed.unit
          : DEFAULT_LABELS.unit,
      lesson:
        typeof parsed.lesson === "string" && parsed.lesson.trim().length > 0
          ? parsed.lesson
          : DEFAULT_LABELS.lesson,
      section:
        typeof parsed.section === "string" && parsed.section.trim().length > 0
          ? parsed.section
          : DEFAULT_LABELS.section,
    };
  } catch {
    // JSON.parse or storage access failed — fall back to defaults silently.
    return DEFAULT_LABELS;
  }
}

/** Persist the labels, silently ignoring storage failures (private mode). */
function saveLabels(labels: HierarchyLabels): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(labels));
  } catch {
    // Swallow — quota or disabled-storage errors are non-fatal here.
  }
}

// ── Context ──────────────────────────────────────────────────────────────

interface LabelsContextValue {
  labels: HierarchyLabels;
  /**
   * Apply a partial patch — any omitted keys keep their current value.
   * Empty / whitespace-only strings are coerced back to the DEFAULT for
   * that field so a teacher can never blank a caption out completely.
   */
  setLabels: (patch: Partial<HierarchyLabels>) => void;
}

const LabelsContext = createContext<LabelsContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────────────

interface LabelsProviderProps {
  children: ReactNode;
}

/**
 * Hosts the hierarchy-label state for everything beneath it. Mount once,
 * near the app root (app/layout.tsx), so every surface — including
 * Settings, the ResourceComposer routing pickers, and any future
 * breadcrumb chrome — reads the same captions.
 *
 * Hydration model: the initial render uses DEFAULT_LABELS so the
 * server-rendered HTML and the first client render are byte-for-byte
 * identical. A post-mount effect then loads saved overrides and updates
 * state — any difference paints in the SECOND client render, after
 * hydration has completed, so React never sees a hydration mismatch.
 */
export function LabelsProvider({ children }: LabelsProviderProps): ReactNode {
  // ALWAYS initialize with the defaults so SSR + first CSR match. The
  // saved overrides come in via the post-mount effect below.
  const [labels, setLabelsState] = useState<HierarchyLabels>(DEFAULT_LABELS);

  // Post-mount: load any saved overrides and apply them. Runs once on the
  // client; SSR never sees this path. A guard ensures we only call
  // setState when the saved record actually differs from the defaults —
  // otherwise mounting always triggers a no-op re-render.
  useEffect(() => {
    const saved = loadLabels();
    if (
      saved.subject !== DEFAULT_LABELS.subject ||
      saved.unit !== DEFAULT_LABELS.unit ||
      saved.lesson !== DEFAULT_LABELS.lesson ||
      saved.section !== DEFAULT_LABELS.section
    ) {
      setLabelsState(saved);
    }
  }, []);

  // Partial setter: merge → coerce empties to defaults → persist → store.
  // Persistence is immediate (every change syncs to localStorage in the
  // same tick) so a teacher's edits survive a reload even if they navigate
  // away before any debounced flush.
  const setLabels = useCallback((patch: Partial<HierarchyLabels>): void => {
    setLabelsState((prev) => {
      const next: HierarchyLabels = {
        subject:
          patch.subject !== undefined
            ? patch.subject.trim().length > 0
              ? patch.subject
              : DEFAULT_LABELS.subject
            : prev.subject,
        unit:
          patch.unit !== undefined
            ? patch.unit.trim().length > 0
              ? patch.unit
              : DEFAULT_LABELS.unit
            : prev.unit,
        lesson:
          patch.lesson !== undefined
            ? patch.lesson.trim().length > 0
              ? patch.lesson
              : DEFAULT_LABELS.lesson
            : prev.lesson,
        section:
          patch.section !== undefined
            ? patch.section.trim().length > 0
              ? patch.section
              : DEFAULT_LABELS.section
            : prev.section,
      };
      // Persist the merged result rather than the patch — keeps storage
      // self-contained and tolerant of partial reads.
      saveLabels(next);
      return next;
    });
  }, []);

  const value = useMemo<LabelsContextValue>(
    () => ({ labels, setLabels }),
    [labels, setLabels],
  );

  return (
    <LabelsContext.Provider value={value}>{children}</LabelsContext.Provider>
  );
}

// ── Hooks ────────────────────────────────────────────────────────────────

/**
 * Read the current hierarchy labels. Returns the four caption strings
 * directly — consumers typically destructure
 * `const { subject, unit, lesson, section } = useLabels();`.
 *
 * Throws when called outside a `<LabelsProvider>` so the missing provider
 * surfaces immediately in development rather than producing silent
 * undefined captions.
 */
export function useLabels(): HierarchyLabels {
  const ctx = useContext(LabelsContext);
  if (!ctx) {
    throw new Error("useLabels must be used within a <LabelsProvider>");
  }
  return ctx.labels;
}

/**
 * Read the partial-patch setter for the hierarchy labels. Pass any subset
 * of `{ subject, unit, lesson, section }`; the omitted fields keep their
 * current value. Persists to localStorage on every call.
 *
 * Throws when called outside a `<LabelsProvider>`.
 */
export function useSetLabels(): (patch: Partial<HierarchyLabels>) => void {
  const ctx = useContext(LabelsContext);
  if (!ctx) {
    throw new Error("useSetLabels must be used within a <LabelsProvider>");
  }
  return ctx.setLabels;
}
