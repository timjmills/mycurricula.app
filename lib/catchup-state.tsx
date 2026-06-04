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
  useReducer,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { CatchupAction } from "./catchup-data";
import { createClient } from "@/lib/supabase/client";

// ── Storage keys ─────────────────────────────────────────────────────────
//
// SHARED-BROWSER ISOLATION (finding #19): Catch-up actions and especially the
// free-text per-item NOTES can hold teacher-private content (including student
// names a teacher types in). On a shared machine these must never bleed across
// accounts, so every key is namespaced by the authenticated user id resolved
// from the Supabase session (the app's existing auth path — mirrors
// lib/teach/use-teach-groups.ts). Before a real uid resolves we use an
// anonymous namespace that is wiped on sign-in; switching accounts re-hydrates
// from the new user's namespace.

const KEY_PREFIX = "mycurricula:catchup";

/** Namespace used before a real auth uid resolves (signed out / session not
 *  yet loaded). Cleared on sign-in so it can never leak into an account. */
const ANON_UID = "__anon";

type CatchupKeyKind = "enabled" | "dismissed-weeks" | "actions" | "notes";

/** Compose the uid-scoped localStorage key for one Catch-up sub-store. */
function storageKey(kind: CatchupKeyKind, uid: string): string {
  return `${KEY_PREFIX}:${kind}:${uid}`;
}

/** Remove every anonymous-namespace blob. Called when a real uid resolves so
 *  pre-auth scratch state never lingers for the next signed-in user. */
function clearAnonStorage(): void {
  if (typeof window === "undefined") return;
  for (const kind of ["enabled", "dismissed-weeks", "actions", "notes"] as const) {
    try {
      window.localStorage.removeItem(storageKey(kind, ANON_UID));
    } catch {
      // Storage disabled — nothing to clear.
    }
  }
}

// ── Loaders ──────────────────────────────────────────────────────────────

function loadEnabled(uid: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(storageKey("enabled", uid));
    if (raw === null) return true; // default ON
    return raw === "1";
  } catch {
    return true;
  }
}

function loadDismissedWeeks(uid: string): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey("dismissed-weeks", uid));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is number => typeof v === "number"));
  } catch {
    return new Set();
  }
}

function loadActions(uid: string): Map<string, CatchupAction> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = window.localStorage.getItem(storageKey("actions", uid));
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

function loadNotes(uid: string): Map<string, string> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = window.localStorage.getItem(storageKey("notes", uid));
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

function saveEnabled(uid: string, enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey("enabled", uid),
      enabled ? "1" : "0",
    );
  } catch {
    // Non-fatal — state persists for the session.
  }
}

function saveDismissedWeeks(uid: string, set: Set<number>): void {
  save(storageKey("dismissed-weeks", uid), () => [...set]);
}

function saveActions(uid: string, map: Map<string, CatchupAction>): void {
  save(storageKey("actions", uid), () => Object.fromEntries(map));
}

function saveNotes(uid: string, map: Map<string, string>): void {
  save(storageKey("notes", uid), () => Object.fromEntries(map));
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

  // ── Authenticated user id (finding #19) ───────────────────────────────────
  // Held in a ref so the stable saver callbacks always persist under the
  // CURRENT user's namespace without being re-created on every auth change.
  // Anon until a real uid resolves. `uidVersion` bumps on every uid change to
  // retrigger the (re)hydration effect below so an account switch on a shared
  // browser swaps the visible Catch-up state instead of leaking the prior
  // teacher's notes/actions.
  const uidRef = useRef<string>(ANON_UID);
  const [uidVersion, bumpUidVersion] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const applyUid = (nextUid: string): void => {
      if (!active) return;
      if (uidRef.current === nextUid) return; // no-op — same user
      // Switching INTO a real account: clear the pre-auth scratch namespace so
      // it can never be re-read by (or bleed into) the signed-in user.
      if (nextUid !== ANON_UID) clearAnonStorage();
      uidRef.current = nextUid;
      bumpUidVersion();
    };

    supabase.auth.getUser().then(({ data }) => {
      applyUid(data.user?.id ?? ANON_UID);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUid(session?.user?.id ?? ANON_UID);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // (Re)hydration. Runs post-mount AND whenever the resolved uid changes. Do
  // not persist on this effect — only on subsequent mutations (gated below by
  // hydratedRef). On a uid change we RESET to defaults first so the prior
  // user's state never lingers when the new user's namespace is empty.
  useEffect(() => {
    hydratedRef.current = false;
    const uid = uidRef.current;
    setEnabledState(loadEnabled(uid));
    setDismissedWeeks(loadDismissedWeeks(uid));
    setActions(loadActions(uid));
    setNotes(loadNotes(uid));
    hydratedRef.current = true;
  }, [uidVersion]);

  // ── Layer 1 — global toggle ─────────────────────────────────────────
  const setEnabled = useCallback((v: boolean): void => {
    setEnabledState(v);
    if (hydratedRef.current) saveEnabled(uidRef.current, v);
  }, []);

  const toggleEnabled = useCallback((): void => {
    setEnabledState((prev) => {
      const next = !prev;
      if (hydratedRef.current) saveEnabled(uidRef.current, next);
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
      if (hydratedRef.current) saveDismissedWeeks(uidRef.current, next);
      return next;
    });
  }, []);

  const restoreWeek = useCallback((week: number): void => {
    setDismissedWeeks((prev) => {
      if (!prev.has(week)) return prev;
      const next = new Set(prev);
      next.delete(week);
      if (hydratedRef.current) saveDismissedWeeks(uidRef.current, next);
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
      if (hydratedRef.current) saveActions(uidRef.current, next);
      return next;
    });
  }, []);

  const clearAction = useCallback((id: string): void => {
    setActions((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      if (hydratedRef.current) saveActions(uidRef.current, next);
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
        if (hydratedRef.current) saveNotes(uidRef.current, next);
        return next;
      }
      const next = new Map(prev);
      next.set(id, trimmed);
      if (hydratedRef.current) saveNotes(uidRef.current, next);
      return next;
    });
  }, []);

  const clearNote = useCallback((id: string): void => {
    setNotes((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      if (hydratedRef.current) saveNotes(uidRef.current, next);
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
