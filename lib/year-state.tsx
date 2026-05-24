"use client";

// year-state.tsx — client-side state shared by the Year view's surfaces.
//
// Today the only piece of state in here is `useMinimizedSubjects` — the set
// of subject lanes a teacher has collapsed on the Year view. Both
// <YearView> (desktop/tablet) and <YearMobile> (phone) read from the same
// store so a teacher's pinned focus survives the responsive swap.
//
// Persistence model mirrors lib/unit-notes.tsx and lib/labels.tsx:
//   • SSR-safe: no window reads at module load time.
//   • Hydration-safe: the first render returns an empty Set so the
//     server-rendered HTML and the first client render match. The
//     post-mount effect loads any stored value before the second render.
//   • Writes are gated on a hydratedRef so the first effect (loading) does
//     not immediately overwrite localStorage with the empty default.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { SubjectId } from "./types";

// ── Storage ───────────────────────────────────────────────────────────────

const STORAGE_KEY = "mycurricula:year-minimized-subjects";

/** Load the persisted Set, returning an empty Set on any failure. */
function loadMinimized(): Set<SubjectId> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is SubjectId => typeof v === "string"));
  } catch {
    return new Set();
  }
}

/** Persist the Set as an array, swallowing quota/disabled-storage errors. */
function saveMinimized(set: Set<SubjectId>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // Non-fatal — state persists for the session.
  }
}

// ── Context ───────────────────────────────────────────────────────────────

interface MinimizedSubjectsContextValue {
  minimized: Set<SubjectId>;
  toggle: (id: SubjectId) => void;
  isMinimized: (id: SubjectId) => boolean;
}

const MinimizedSubjectsContext =
  createContext<MinimizedSubjectsContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────

export function MinimizedSubjectsProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [minimized, setMinimized] = useState<Set<SubjectId>>(() => new Set());
  const hydratedRef = useRef(false);

  // Post-mount hydration. Do not persist on this first effect — only on
  // subsequent toggles.
  useEffect(() => {
    const stored = loadMinimized();
    if (stored.size > 0) setMinimized(stored);
    hydratedRef.current = true;
  }, []);

  const toggle = useCallback((id: SubjectId): void => {
    setMinimized((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (hydratedRef.current) saveMinimized(next);
      return next;
    });
  }, []);

  const isMinimized = useCallback(
    (id: SubjectId): boolean => minimized.has(id),
    [minimized],
  );

  const value = useMemo<MinimizedSubjectsContextValue>(
    () => ({ minimized, toggle, isMinimized }),
    [minimized, toggle, isMinimized],
  );

  return (
    <MinimizedSubjectsContext.Provider value={value}>
      {children}
    </MinimizedSubjectsContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useMinimizedSubjects(): MinimizedSubjectsContextValue {
  const ctx = useContext(MinimizedSubjectsContext);
  if (!ctx) {
    throw new Error(
      "useMinimizedSubjects must be used within a <MinimizedSubjectsProvider>",
    );
  }
  return ctx;
}
