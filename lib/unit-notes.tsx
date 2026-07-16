"use client";

// unit-notes.tsx — per-unit "Don't miss" callout persistence.
//
// Each unit can have a lead-teacher-authored free-text callout reminding the
// team of the one move not to forget. The callout is keyed by
// `${subjectId}:${unitId}` (see "Keying" below — unit slugs are unique only
// within a subject) and persisted to localStorage under
// `mycurricula:unit-dontmiss` so edits survive reloads without a backend.
//
// Pattern matches lib/labels.tsx:
//   • SSR-safe: no window reads at module load time.
//   • Hydration-safe: the first render always returns the seed value; the
//     post-mount effect loads any stored override before the second render.
//   • The `useUnitNote(subjectId, unitId)` hook returns one unit's text.
//   • The `useSetUnitNote()` hook returns a `(subjectId, unitId, text) =>
//     void` setter.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

// ── Storage key ───────────────────────────────────────────────────────────

const STORAGE_KEY = "mycurricula:unit-dontmiss";

/** Load the full note map from localStorage, returning {} on failure. */
function loadNotes(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    // Keep only string values to guard against stale/corrupt entries.
    const safe: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") safe[k] = v;
    }
    return safe;
  } catch {
    return {};
  }
}

/** Persist the full note map, silently ignoring quota/disabled-storage errors. */
function saveNotes(notes: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch {
    // Non-fatal — the edit still lives in React state for this session.
  }
}

// ── Context ───────────────────────────────────────────────────────────────

interface UnitNotesContextValue {
  /** Note map — keys are `${subjectId}:${unitId}` (legacy entries may still
   *  be bare unit ids; reads fall back to them, writes never create them). */
  notes: Record<string, string>;
  setNote: (key: string, text: string) => void;
}

const UnitNotesContext = createContext<UnitNotesContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────

export interface UnitNotesProviderProps {
  /**
   * Seed values — the design-handoff defaults for each unit's callout,
   * keyed by `${subjectId}:${unitId}`. The post-mount load merges stored
   * overrides ON TOP of these seeds, so a stored empty string can
   * effectively clear a seed.
   */
  seeds?: Record<string, string>;
  children: ReactNode;
}

/**
 * Hosts the unit-note state. Mount once, inside the <AppStateProvider>,
 * so the callout text is consistent across every Subject-view mount.
 */
export function UnitNotesProvider({
  seeds = {},
  children,
}: UnitNotesProviderProps): ReactNode {
  // Initialise from seeds only — stored overrides come in via the
  // post-mount effect so the server render and first client render match.
  const [notes, setNotes] = useState<Record<string, string>>(seeds);

  useEffect(() => {
    const stored = loadNotes();
    if (Object.keys(stored).length > 0) {
      // Merge: stored values win over seeds (the teacher's edit overrides
      // the design default).
      setNotes((prev) => ({ ...prev, ...stored }));
    }
  }, []);

  const setNote = useCallback((key: string, text: string): void => {
    setNotes((prev) => {
      const next = { ...prev, [key]: text };
      saveNotes(next);
      return next;
    });
  }, []);

  const value = useMemo<UnitNotesContextValue>(
    () => ({ notes, setNote }),
    [notes, setNote],
  );

  return (
    <UnitNotesContext.Provider value={value}>
      {children}
    </UnitNotesContext.Provider>
  );
}

// ── Keying ────────────────────────────────────────────────────────────────
//
// Notes are keyed by `${subjectId}:${unitId}`, NOT by unit id alone. Unit
// ids (slugs) are unique only WITHIN a subject — AERO-style catalogs give
// two subjects a "launching" unit — so a bare-slug key silently shares one
// note between different subjects' units (the cross-subject collision both
// redesign sessions flagged and deferred).
//
// Legacy entries: earlier builds stored bare unit-id keys. Reads fall back
// to the bare key so an existing dev-machine note still appears; writes
// always use the composite key (which then wins the read). The bare entry
// is deliberately NOT deleted on migration — with two same-slug subjects
// there is no way to know which subject the old note belonged to, so
// deleting could destroy the other subject's note. Nothing on master ever
// wrote these keys (no consumer existed there), so no prod data is at risk.

/** Composite storage key for one subject's unit. */
function noteKey(subjectId: string, unitId: string): string {
  return `${subjectId}:${unitId}`;
}

// ── Hooks ─────────────────────────────────────────────────────────────────

/** Read the "Don't miss" callout text for a single subject's unit. */
export function useUnitNote(subjectId: string, unitId: string): string {
  const ctx = useContext(UnitNotesContext);
  if (!ctx) {
    throw new Error("useUnitNote must be used within a <UnitNotesProvider>");
  }
  // Composite key first; legacy bare-slug entry as a read-only fallback.
  return ctx.notes[noteKey(subjectId, unitId)] ?? ctx.notes[unitId] ?? "";
}

/**
 * Returns the setter for a single unit's callout. The setter accepts the
 * subject id, the unit id, and the full replacement text; an empty string
 * clears the callout. Writes always land on the composite key.
 */
export function useSetUnitNote(): (
  subjectId: string,
  unitId: string,
  text: string,
) => void {
  const ctx = useContext(UnitNotesContext);
  // Hooks must run unconditionally — memoize BEFORE the provider guard.
  const setNote = ctx?.setNote;
  const setter = useCallback(
    (subjectId: string, unitId: string, text: string): void => {
      // Unreachable without a provider (the guard below throws first).
      setNote?.(noteKey(subjectId, unitId), text);
    },
    [setNote],
  );
  if (!ctx) {
    throw new Error("useSetUnitNote must be used within a <UnitNotesProvider>");
  }
  return setter;
}
