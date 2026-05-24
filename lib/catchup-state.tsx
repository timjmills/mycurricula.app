"use client";

// catchup-state.tsx — client-side state for the three-layer Catch-up
// control system (planning-doc §1262).
//
// The "Catch-up" feature surfaces every uncovered or incomplete lesson so the
// teacher can triage it. The three layers it threads through the app:
//
//   1. Global on/off  — a Settings toggle. Default ON. When OFF, no in-grid
//      bar appears above the Weekly grid, no top-bar flame badge surfaces,
//      and no ambient catch-up chrome shows anywhere. The dedicated
//      Catch-up screen (`/catch-up`) is still reachable from Settings.
//
//   2. Per-week dismissible bar — "🔥 N items not covered" above the
//      Weekly grid. The teacher can ✕-dismiss it for the current week; the
//      dismissal is per-week so a different week re-surfaces the bar.
//
//   3. Top-bar flame badge — appears once the teacher has dismissed the
//      per-week bar (so the count remains discoverable without crowding the
//      grid). Clicking it lets the teacher restore the bar or jump to the
//      Catch-up screen.
//
// On top of those three layers this store also tracks per-item local
// actions: the "Mark done", "Skip for now", "Carry over to…" and "Add a
// note" decisions a teacher makes inside the Catch-up screen. These are
// session-local overrides that wrap each CatchupItem so the screen + bar
// + badge stay in sync as the teacher resolves uncovered items.
//
// Persistence model mirrors lib/year-state.tsx and lib/unit-notes.tsx:
//   • SSR-safe: no window reads at module load time.
//   • Hydration-safe: the first render returns defaults so the
//     server-rendered HTML and the first client render match. The
//     post-mount effect loads any stored values before the second render.
//   • Writes are gated on a hydratedRef so the first effect (loading)
//     does not immediately overwrite localStorage with the empty default.

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
import type { CatchupAction } from "./catchup-data";

// ── Storage keys ─────────────────────────────────────────────────────────

const ENABLED_KEY = "mycurricula:catchup-enabled";
const DISMISSED_WEEKS_KEY = "mycurricula:catchup-dismissed-weeks";
const ACTIONS_KEY = "mycurricula:catchup-actions";
const NOTES_KEY = "mycurricula:catchup-notes";

// ── Loaders ──────────────────────────────────────────────────────────────

function loadEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(ENABLED_KEY);
    if (raw === null) return true; // default ON
    return raw === "1";
  } catch {
    return true;
  }
}

function loadDismissedWeeks(): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_WEEKS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is number => typeof v === "number"));
  } catch {
    return new Set();
  }
}

function loadActions(): Map<string, CatchupAction> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = window.localStorage.getItem(ACTIONS_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return new Map();
    const out = new Map<string, CatchupAction>();
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const kind = (v as { kind?: unknown }).kind;
      if (kind !== "done" && kind !== "skipped" && kind !== "carried") continue;
      const carriedToRaw = (v as { carriedTo?: unknown }).carriedTo;
      out.set(k, {
        kind,
        carriedTo: typeof carriedToRaw === "string" ? carriedToRaw : undefined,
      });
    }
    return out;
  } catch {
    return new Map();
  }
}

function loadNotes(): Map<string, string> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = window.localStorage.getItem(NOTES_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return new Map();
    const out = new Map<string, string>();
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") out.set(k, v);
    }
    return out;
  } catch {
    return new Map();
  }
}

// ── Savers ───────────────────────────────────────────────────────────────

function save<T>(key: string, serialize: () => T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(serialize()));
  } catch {
    // Non-fatal — state persists for the session.
  }
}

function saveEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    // Non-fatal — state persists for the session.
  }
}

function saveDismissedWeeks(set: Set<number>): void {
  save(DISMISSED_WEEKS_KEY, () => [...set]);
}

function saveActions(map: Map<string, CatchupAction>): void {
  save(ACTIONS_KEY, () => Object.fromEntries(map));
}

function saveNotes(map: Map<string, string>): void {
  save(NOTES_KEY, () => Object.fromEntries(map));
}

// ── Context ──────────────────────────────────────────────────────────────

interface CatchupContextValue {
  /** Layer 1 — global feature flag. */
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  toggleEnabled: () => void;

  /** Layer 2 — per-week dismissal of the in-grid "N items not covered" bar. */
  dismissedWeeks: Set<number>;
  isWeekDismissed: (week: number) => boolean;
  dismissWeek: (week: number) => void;
  restoreWeek: (week: number) => void;

  /** Per-item action overlays — the Catch-up screen's "Mark done /
   *  Skip / Carry over" decisions. Null on a key means "no action yet". */
  actions: Map<string, CatchupAction>;
  getAction: (id: string) => CatchupAction | undefined;
  setAction: (id: string, action: CatchupAction) => void;
  clearAction: (id: string) => void;

  /** Inline notes attached to an uncovered item — distinct from a Lesson's
   *  pre-existing `reasonNotDone` field (which comes from the mock fixture
   *  and represents an older snapshot). Notes added through the Catch-up
   *  screen layer on top. */
  notes: Map<string, string>;
  getNote: (id: string) => string;
  setNote: (id: string, note: string) => void;
  clearNote: (id: string) => void;
}

const CatchupContext = createContext<CatchupContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────────────

export function CatchupProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  // Defaults match an empty/fresh teacher (enabled = true, no dismissals,
  // no per-item actions). Post-mount we hydrate from localStorage.
  const [enabled, setEnabledState] = useState<boolean>(true);
  const [dismissedWeeks, setDismissedWeeks] = useState<Set<number>>(
    () => new Set(),
  );
  const [actions, setActions] = useState<Map<string, CatchupAction>>(
    () => new Map(),
  );
  const [notes, setNotes] = useState<Map<string, string>>(() => new Map());

  const hydratedRef = useRef(false);

  // Post-mount hydration. Do not persist on this first effect — only on
  // subsequent mutations (gated below by hydratedRef).
  useEffect(() => {
    setEnabledState(loadEnabled());
    const dw = loadDismissedWeeks();
    if (dw.size > 0) setDismissedWeeks(dw);
    const a = loadActions();
    if (a.size > 0) setActions(a);
    const n = loadNotes();
    if (n.size > 0) setNotes(n);
    hydratedRef.current = true;
  }, []);

  // ── Layer 1 — global toggle ─────────────────────────────────────────
  const setEnabled = useCallback((v: boolean): void => {
    setEnabledState(v);
    if (hydratedRef.current) saveEnabled(v);
  }, []);

  const toggleEnabled = useCallback((): void => {
    setEnabledState((prev) => {
      const next = !prev;
      if (hydratedRef.current) saveEnabled(next);
      return next;
    });
  }, []);

  // ── Layer 2 — per-week dismissal ────────────────────────────────────
  const isWeekDismissed = useCallback(
    (week: number): boolean => dismissedWeeks.has(week),
    [dismissedWeeks],
  );

  const dismissWeek = useCallback((week: number): void => {
    setDismissedWeeks((prev) => {
      if (prev.has(week)) return prev;
      const next = new Set(prev);
      next.add(week);
      if (hydratedRef.current) saveDismissedWeeks(next);
      return next;
    });
  }, []);

  const restoreWeek = useCallback((week: number): void => {
    setDismissedWeeks((prev) => {
      if (!prev.has(week)) return prev;
      const next = new Set(prev);
      next.delete(week);
      if (hydratedRef.current) saveDismissedWeeks(next);
      return next;
    });
  }, []);

  // ── Per-item action overlays ────────────────────────────────────────
  const getAction = useCallback(
    (id: string): CatchupAction | undefined => actions.get(id),
    [actions],
  );

  const setAction = useCallback((id: string, action: CatchupAction): void => {
    setActions((prev) => {
      const next = new Map(prev);
      next.set(id, action);
      if (hydratedRef.current) saveActions(next);
      return next;
    });
  }, []);

  const clearAction = useCallback((id: string): void => {
    setActions((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      if (hydratedRef.current) saveActions(next);
      return next;
    });
  }, []);

  // ── Per-item notes ──────────────────────────────────────────────────
  const getNote = useCallback(
    (id: string): string => notes.get(id) ?? "",
    [notes],
  );

  const setNote = useCallback((id: string, note: string): void => {
    setNotes((prev) => {
      const trimmed = note.trim();
      // Empty note → remove the entry so the map stays tidy.
      if (trimmed === "") {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        if (hydratedRef.current) saveNotes(next);
        return next;
      }
      const next = new Map(prev);
      next.set(id, trimmed);
      if (hydratedRef.current) saveNotes(next);
      return next;
    });
  }, []);

  const clearNote = useCallback((id: string): void => {
    setNotes((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      if (hydratedRef.current) saveNotes(next);
      return next;
    });
  }, []);

  const value = useMemo<CatchupContextValue>(
    () => ({
      enabled,
      setEnabled,
      toggleEnabled,
      dismissedWeeks,
      isWeekDismissed,
      dismissWeek,
      restoreWeek,
      actions,
      getAction,
      setAction,
      clearAction,
      notes,
      getNote,
      setNote,
      clearNote,
    }),
    [
      enabled,
      setEnabled,
      toggleEnabled,
      dismissedWeeks,
      isWeekDismissed,
      dismissWeek,
      restoreWeek,
      actions,
      getAction,
      setAction,
      clearAction,
      notes,
      getNote,
      setNote,
      clearNote,
    ],
  );

  return (
    <CatchupContext.Provider value={value}>{children}</CatchupContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useCatchup(): CatchupContextValue {
  const ctx = useContext(CatchupContext);
  if (!ctx) {
    throw new Error("useCatchup must be used within a <CatchupProvider>");
  }
  return ctx;
}
