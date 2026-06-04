"use client";

// instance-labels.tsx — per-INSTANCE renaming for the planner hierarchy.
//
// Sibling to lib/labels.tsx. Where `labels.tsx` renames the TERM ("Week" →
// "Module", affecting every week), THIS module renames a SPECIFIC instance —
// e.g. give Math Unit 3 the name "Fractions Deep Dive", or rename a single
// week within a unit. The underlying entity ids never change; only the
// visible name a teacher reads is overridden.
//
// Two scopes, chosen per rename (see components/rename/InstanceRename.tsx):
//   • personal — only the current teacher sees the override.
//   • team     — every teacher on the team sees it (high-consequence).
// Resolution is personal → team → the entity's own default name.
//
// Keys:
//   • subject / unit / lesson  →  the entity id.
//   • week                     →  `${unitId}:${weekNumber}` (per-unit weeks,
//                                  per the product decision: a week is renamed
//                                  inside a specific unit's context, not
//                                  globally).
//
// Persistence: localStorage today (one record per scope), SSR-guarded and
// hydration-safe exactly like lib/labels.tsx — the initial render is always
// "no overrides" so server HTML matches the first client paint; saved
// overrides load in a post-mount effect. The load/save helpers are the single
// seam the Phase 1B Supabase backend swaps: team-scope rows move to a
// team-shared table (RLS), personal-scope rows to a per-user table. The
// resolver/mutator contract below does not change when that happens.
//
// SHARED-BROWSER ISOLATION (finding #6): both scopes' overrides used to live
// under GLOBAL localStorage keys, so on a shared machine (or across schools)
// one teacher inherited another's renames. Every key is now namespaced by the
// authenticated user id resolved from the Supabase session (the app's existing
// auth path — mirrors lib/teach/use-teach-groups.ts + lib/catchup-state.tsx).
//   • PERSONAL — namespaced by the teacher uid. Genuinely per-teacher.
//   • TEAM     — conceptually shared across a team/school, but today it is
//                localStorage-only (no backend). We cannot derive a
//                school/team id client-side from the session, so team is ALSO
//                namespaced by uid and keeps its "device-local until backend
//                sync" semantics (real cross-teacher team sync is Phase 1B).
//                The hard requirement this satisfies: a DIFFERENT logged-in
//                user on the same browser must never read the previous user's
//                team overrides.
// Before a real uid resolves we use an anonymous namespace that is wiped on
// sign-in; switching accounts drops the in-memory overrides and re-hydrates
// from the new user's namespace.

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
import { createClient } from "@/lib/supabase/client";

// ── Public types ───────────────────────────────────────────────────────────

/** The renameable instance levels. Mirrors the hierarchy minus "section". */
export type InstanceLevel = "subject" | "unit" | "week" | "lesson";

/** Who a rename applies to. Chosen explicitly on every rename. */
export type LabelScope = "personal" | "team";

/** One scope's overrides: level → (entity key → custom name). */
type OverrideRecord = Record<InstanceLevel, Record<string, string>>;

const EMPTY_RECORD = (): OverrideRecord => ({
  subject: {},
  unit: {},
  week: {},
  lesson: {},
});

/** Compose the per-unit week key. Weeks are renamed within a unit's context. */
export function weekKey(unitId: string, week: number): string {
  return `${unitId}:${week}`;
}

// ── Storage ────────────────────────────────────────────────────────────────

const STORAGE_PREFIX: Record<LabelScope, string> = {
  personal: "mycurricula:instance-labels:personal",
  team: "mycurricula:instance-labels:team",
};

/** Namespace used before a real auth uid resolves (signed out / session not
 *  yet loaded). Cleared on sign-in so it can never leak into an account. */
const ANON_UID = "__anon";

/** Compose the uid-scoped localStorage key for one scope. */
function storageKey(scope: LabelScope, uid: string): string {
  return `${STORAGE_PREFIX[scope]}:${uid}`;
}

/** Remove every anonymous-namespace blob. Called when a real uid resolves so
 *  pre-auth scratch overrides never linger for the next signed-in user. */
function clearAnonStorage(): void {
  if (typeof window === "undefined") return;
  for (const scope of ["personal", "team"] as const) {
    try {
      window.localStorage.removeItem(storageKey(scope, ANON_UID));
    } catch {
      // Storage disabled — nothing to clear.
    }
  }
}

/** Load one scope's overrides, tolerating absent/malformed storage. */
function loadScope(scope: LabelScope, uid: string): OverrideRecord {
  if (typeof window === "undefined") return EMPTY_RECORD();
  try {
    const raw = window.localStorage.getItem(storageKey(scope, uid));
    if (!raw) return EMPTY_RECORD();
    const parsed = JSON.parse(raw) as Partial<OverrideRecord> | null;
    if (!parsed || typeof parsed !== "object") return EMPTY_RECORD();
    const base = EMPTY_RECORD();
    for (const level of Object.keys(base) as InstanceLevel[]) {
      const m = parsed[level];
      if (m && typeof m === "object") {
        for (const [k, v] of Object.entries(m)) {
          if (typeof v === "string" && v.trim().length > 0) base[level][k] = v;
        }
      }
    }
    return base;
  } catch {
    return EMPTY_RECORD();
  }
}

/** Persist one scope's overrides; swallow quota / disabled-storage errors. */
function saveScope(
  scope: LabelScope,
  uid: string,
  record: OverrideRecord,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(scope, uid), JSON.stringify(record));
  } catch {
    // non-fatal
  }
}

// ── Context ────────────────────────────────────────────────────────────────

interface InstanceLabelsContextValue {
  /** Resolve the effective name: personal → team → fallback. */
  resolve: (level: InstanceLevel, key: string, fallback: string) => string;
  /** Does an override (either scope) exist for this entity? */
  hasOverride: (level: InstanceLevel, key: string) => boolean;
  /** The raw override for a scope, if any (drives the rename popover state). */
  overrideFor: (
    level: InstanceLevel,
    key: string,
    scope: LabelScope,
  ) => string | undefined;
  /** Rename an instance in a scope. Empty/whitespace clears that scope's
   *  override (falling back to the other scope or the default). */
  rename: (
    level: InstanceLevel,
    key: string,
    name: string,
    scope: LabelScope,
  ) => void;
  /** Clear both scopes' overrides for an entity (restore the default name). */
  reset: (level: InstanceLevel, key: string) => void;
}

const InstanceLabelsContext = createContext<InstanceLabelsContextValue | null>(
  null,
);

// ── Provider ─────────────────────────────────────────────────────────────────

/**
 * Hosts the per-instance override state. Mount once near the app root
 * (app/layout.tsx) alongside LabelsProvider so every surface — planner views,
 * Teach, Settings — resolves the same names.
 *
 * Hydration model identical to LabelsProvider: initial state is empty (SSR +
 * first CSR match), saved overrides arrive in a post-mount effect.
 */
export function InstanceLabelsProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [personal, setPersonal] = useState<OverrideRecord>(EMPTY_RECORD);
  const [team, setTeam] = useState<OverrideRecord>(EMPTY_RECORD);

  // Gate persistence so the (re)hydration effect below never writes the loaded
  // state straight back to storage. Only subsequent mutations persist.
  const hydratedRef = useRef(false);

  // ── Authenticated user id (finding #6) ────────────────────────────────────
  // Held in a ref so the stable mutator callbacks always persist under the
  // CURRENT user's namespace without being re-created on every auth change.
  // Anon until a real uid resolves. `uidVersion` bumps on every uid change to
  // retrigger the (re)hydration effect below so an account switch on a shared
  // browser swaps the visible overrides instead of leaking the prior teacher's.
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

  // (Re)hydration. Runs post-mount AND whenever the resolved uid changes. On a
  // uid change (account switch / sign-out) we RESET to empty first so the prior
  // user's overrides never linger when the new user's namespace is empty, then
  // load the new user's own namespace. Hydration itself must not persist —
  // hydratedRef gates the mutators below.
  useEffect(() => {
    hydratedRef.current = false;
    const uid = uidRef.current;
    const p = loadScope("personal", uid);
    const t = loadScope("team", uid);
    setPersonal(p);
    setTeam(t);
    hydratedRef.current = true;
  }, [uidVersion]);

  const stateFor = (scope: LabelScope) => (scope === "personal" ? personal : team); // prettier-ignore

  const resolve = useCallback(
    (level: InstanceLevel, key: string, fallback: string): string =>
      personal[level][key] ?? team[level][key] ?? fallback,
    [personal, team],
  );

  const hasOverride = useCallback(
    (level: InstanceLevel, key: string): boolean =>
      personal[level][key] !== undefined || team[level][key] !== undefined,
    [personal, team],
  );

  const overrideFor = useCallback(
    (
      level: InstanceLevel,
      key: string,
      scope: LabelScope,
    ): string | undefined => stateFor(scope)[level][key],
    // stateFor reads the latest personal/team via closure on each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [personal, team],
  );

  const rename = useCallback(
    (
      level: InstanceLevel,
      key: string,
      name: string,
      scope: LabelScope,
    ): void => {
      const trimmed = name.trim();
      const setter = scope === "personal" ? setPersonal : setTeam;
      setter((prev) => {
        const nextLevel = { ...prev[level] };
        if (trimmed.length > 0) nextLevel[key] = trimmed;
        else delete nextLevel[key];
        const next: OverrideRecord = { ...prev, [level]: nextLevel };
        if (hydratedRef.current) saveScope(scope, uidRef.current, next);
        return next;
      });
    },
    [],
  );

  const reset = useCallback((level: InstanceLevel, key: string): void => {
    setPersonal((prev) => {
      if (prev[level][key] === undefined) return prev;
      const nextLevel = { ...prev[level] };
      delete nextLevel[key];
      const next = { ...prev, [level]: nextLevel };
      if (hydratedRef.current) saveScope("personal", uidRef.current, next);
      return next;
    });
    setTeam((prev) => {
      if (prev[level][key] === undefined) return prev;
      const nextLevel = { ...prev[level] };
      delete nextLevel[key];
      const next = { ...prev, [level]: nextLevel };
      if (hydratedRef.current) saveScope("team", uidRef.current, next);
      return next;
    });
  }, []);

  const value = useMemo<InstanceLabelsContextValue>(
    () => ({ resolve, hasOverride, overrideFor, rename, reset }),
    [resolve, hasOverride, overrideFor, rename, reset],
  );

  return (
    <InstanceLabelsContext.Provider value={value}>
      {children}
    </InstanceLabelsContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Access the per-instance label resolver + mutators. Throws outside a
 * provider so a missing mount surfaces immediately in development.
 *
 * SSR-safe fallback: the provider always renders, so this never returns null
 * in the app; the guard is a developer aid.
 */
export function useInstanceLabels(): InstanceLabelsContextValue {
  const ctx = useContext(InstanceLabelsContext);
  if (!ctx) {
    throw new Error(
      "useInstanceLabels must be used within an <InstanceLabelsProvider>",
    );
  }
  return ctx;
}
