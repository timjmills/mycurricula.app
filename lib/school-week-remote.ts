"use client";

// school-week-remote.ts — the SUPABASE side of the school week.
//
// WHY THIS EXISTS. The school week had two stores. The planner derives every
// lesson's day column from `schools.school_week` (lib/planner/supabase-source.ts
// `resolveSchoolWeek`), but the only WRITE path shipped — Settings → Calendar
// and the onboarding wizard, both via lib/use-school-week.ts — was localStorage.
// So the week a teacher picked and the surface it governs disagreed on the same
// device in the same session: the grid HEADERS moved, the lessons under them did
// not. CLAUDE.md §1 is explicit that the school week is chosen at setup and that
// every calendar surface derives its columns from it; two stores meant half the
// app obeyed the teacher and half obeyed the database. This module is the
// convergence: the DB column the planner already reads becomes the one store,
// and localStorage drops to an SSR/offline cache (see lib/use-school-week.ts).
//
// NO MIGRATION NEEDED. `schools.school_week` (weekday[], default sun..thu) has
// existed since 20260518102823_initial_schema.sql, `authenticated` already holds
// SELECT + UPDATE on `schools`, and the shipped RLS policies are the gate:
//   • schools_read  — `id = auth_teacher_school_id() or is_school_admin(id)`
//   • schools_write — `is_school_admin(id)` (USING + WITH CHECK)
// So a workspace admin's write lands and a plain member's is refused server-side.
// That refusal is REPORTED, never swallowed — silently accepting a write the
// database rejected is how the split-brain got here in the first place.
//
// SCHOOL RESOLUTION MIRRORS THE PLANNER, BRANCH FOR BRANCH. supabase-source
// resolves the teacher's school via `auth_teacher_school_id()` on the
// MULTI_WORKSPACE ON path and `teachers.school_id` on the OFF path (ON reads the
// ACTIVE workspace; OFF reads the HOME school, and a joined workspace would
// otherwise silently render home's week shape). If this module resolved a
// DIFFERENT school than the planner, we would have rebuilt the same bug one
// layer down — so the branch is copied verbatim rather than simplified.
//
// FAIL-SAFE POSTURE mirrors lib/onboarding-v2-remote.ts: the read resolves to
// `null` ("unknown") on every error path so a hiccup never rewrites a teacher's
// week, and neither function ever throws.
//
// GATE: both no-op unless the planner Supabase backend is configured
// (isPlannerSupabaseConfigured). On the mock/prototype path they never touch the
// network, so the localStorage-only prototype behaviour is unchanged.

import { createClient } from "@/lib/supabase/client";
import { isPlannerSupabaseConfigured } from "@/lib/planner/source";
import { MULTI_WORKSPACE } from "@/lib/multi-workspace-flag";

/**
 * What happened to a school-week write.
 *
 *   "saved"  — the row was updated; the planner now reads this week.
 *   "local"  — Supabase is not configured (prototype path); the value lives in
 *              this browser only, exactly as it always did.
 *   "denied" — the database refused the write. The caller is not an admin of
 *              this workspace, so the team's week is not theirs to change.
 *   "failed" — no session, no school, or a transport error. Unknown, not denied.
 */
export type SchoolWeekSaveOutcome = "saved" | "local" | "denied" | "failed";

export interface SchoolWeekSaveResult {
  outcome: SchoolWeekSaveOutcome;
  /** Teacher-facing explanation for the two failure outcomes. */
  message?: string;
  /** The scope this write targeted (see `SchoolWeekScope`), when resolved. */
  scope?: string;
}

/**
 * A cache key identifying WHOSE week a value is: the signed-in teacher plus
 * the school that governs their planner.
 *
 * Both halves matter. The caller's module-level cache survives a workspace
 * switch — this app switches with a soft `router.refresh()`, never a reload
 * (lib/workspaces/client.ts documents exactly that) — so without a scope one
 * tenant's school week would be served inside another. Including the uid
 * additionally covers a same-tab sign-out/sign-in on a shared device, the same
 * hazard the onboarding gate's uid-keyed latch exists for.
 */
export type SchoolWeekScope = string;

/**
 * Hard ceiling on a school-week write.
 *
 * The onboarding wizard disables its finish buttons while a write is in
 * flight, so "in flight" must be a bounded state — a request that hangs on a
 * dead connection would otherwise trap a teacher on the last step with no way
 * out. The request is genuinely aborted (not just ignored), so a write that
 * times out has not silently landed somewhere behind the reported failure.
 */
const SAVE_TIMEOUT_MS = 15_000;

/** A resolved server read: the week, plus whose week it is. */
export interface RemoteSchoolWeek {
  scope: SchoolWeekScope;
  /** Raw weekday strings, straight from the column. */
  week: string[];
}

/** The Supabase browser client, narrowed to what this module uses. */
type BrowserClient = ReturnType<typeof createClient>;

/**
 * Resolve the school whose `school_week` governs this teacher's planner —
 * the SAME school `resolveSchoolWeek` reads server-side — together with the
 * caller's identity, so results can be scope-checked.
 *
 * Returns null when there is no session or no school (a teacher mid-provision),
 * which callers treat as "unknown", never as "no week configured".
 */
async function resolveGoverningSchool(
  supabase: BrowserClient,
): Promise<{ uid: string; schoolId: string } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  if (MULTI_WORKSPACE) {
    // ACTIVE workspace, via the same membership-validated funnel the RLS
    // policies read. Never teachers.school_id (that is the HOME school).
    const { data, error } = await supabase.rpc("auth_teacher_school_id");
    if (error) {
      console.debug(
        "school-week: active workspace lookup failed",
        error.message,
      );
      return null;
    }
    const schoolId = (data as string | null) ?? null;
    return schoolId ? { uid: user.id, schoolId } : null;
  }

  const { data, error } = await supabase
    .from("teachers")
    .select("school_id")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    console.debug("school-week: home school lookup failed", error.message);
    return null;
  }
  const schoolId = (data as { school_id: string } | null)?.school_id ?? null;
  return schoolId ? { uid: user.id, schoolId } : null;
}

/** Build the cache key for a resolved teacher + school pair. */
function scopeOf(resolved: { uid: string; schoolId: string }): SchoolWeekScope {
  return `${resolved.uid}:${resolved.schoolId}`;
}

/**
 * The server's authoritative school week, as raw weekday strings.
 *
 * Returns `null` for UNKNOWN — sync off, no session, no school, a read error,
 * or a row whose `school_week` is empty. Callers must treat null as "keep what
 * you have"; only a non-empty array is a real answer. Raw strings (not the
 * `Weekday` union) so this module has no dependency back on the hook that
 * imports it — lib/use-school-week.ts runs the result through its own
 * `normalize()`, which is the single validator for the weekday vocabulary.
 *
 * Never throws.
 */
export async function readSchoolWeekRemote(): Promise<RemoteSchoolWeek | null> {
  if (!isPlannerSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
    const resolved = await resolveGoverningSchool(supabase);
    if (!resolved) return null;

    const { data, error } = await supabase
      .from("schools")
      .select("school_week")
      .eq("id", resolved.schoolId)
      .maybeSingle();
    if (error) {
      console.debug("school-week: remote read failed", error.message);
      return null;
    }
    const week = (data as { school_week: string[] | null } | null)?.school_week;
    if (!week || week.length === 0) return null;
    return { scope: scopeOf(resolved), week };
  } catch (err) {
    console.debug("school-week: remote read error", err);
    return null;
  }
}

/**
 * WHO the caller is and WHERE they are, with NO week read.
 *
 * Deliberately separate from `readSchoolWeekRemote`. The week VALUE is
 * freshness-sensitive — a response that predates an edit must be discarded —
 * but the scope is not: "which workspace am I in" does not go stale because the
 * teacher clicked a weekday. Deriving the write's target scope from the week
 * read conflated the two, so a second rapid click could invalidate the read
 * that the first click's write was waiting on for its target, and both writes
 * failed without ever being sent.
 *
 * Bounded by the same timeout as the write: a queued write awaits this before
 * it can name its target, so an unbounded hang here would stall the whole write
 * queue — and, through it, the onboarding finish buttons.
 *
 * Returns null on the prototype path and on every unresolved path; a null scope
 * never matches a cached one (isCacheInScope fails closed).
 */
export async function resolveSchoolWeekScope(): Promise<SchoolWeekScope | null> {
  if (!isPlannerSupabaseConfigured()) return null;
  try {
    const resolved = await withTimeout(
      resolveGoverningSchool(createClient()),
      SAVE_TIMEOUT_MS,
      null,
    );
    return resolved ? scopeOf(resolved) : null;
  } catch (err) {
    console.debug("school-week: scope resolve error", err);
    return null;
  }
}

/** Resolve `promise`, or `onTimeout` if it has not settled in `ms`. The losing
 *  promise is abandoned, never awaited — the point is that the CALLER is
 *  never left waiting. */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: T,
): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(onTimeout), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(onTimeout);
      },
    );
  });
}

// ── Identity-change watch ─────────────────────────────────────────────────
//
// The caller memoizes the server's week for the page's lifetime, and Next.js
// keeps module state across soft navigations — so a sign-out/sign-in WITHOUT a
// full reload would let the next teacher on a shared device inherit the
// previous one's cached week. The onboarding gate treats exactly this scenario
// as a High-severity defect and solves it by keying on the uid; this is the
// same fix, pushed down to the one place that can observe the change.
//
// ONE subscription for the whole app, however many hooks are mounted: listeners
// are collected in a Set and the Supabase subscription is created lazily on the
// first registration. TOKEN_REFRESHED and INITIAL_SESSION are deliberately NOT
// invalidating — token refresh is routine and would thrash the cache.

const scopeListeners = new Set<() => void>();
let scopeWatchStarted = false;

function startScopeWatch(): void {
  if (scopeWatchStarted) return;
  if (typeof window === "undefined") return;
  if (!isPlannerSupabaseConfigured()) return;
  scopeWatchStarted = true;
  try {
    createClient().auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
      for (const listener of scopeListeners) listener();
    });
  } catch (err) {
    // No client / no storage — the cache simply keeps its page-load lifetime.
    console.debug("school-week: scope watch unavailable", err);
  }
}

/**
 * Run `onInvalidate` whenever the signed-in identity changes, so a cached
 * school week can be dropped before it is shown to a different teacher.
 * Returns an unsubscribe function. No-ops on the prototype path.
 */
export function onSchoolWeekScopeInvalidated(
  onInvalidate: () => void,
): () => void {
  scopeListeners.add(onInvalidate);
  startScopeWatch();
  return () => {
    scopeListeners.delete(onInvalidate);
  };
}

/**
 * Persist the school week for the teacher's governing school.
 *
 * DENIAL DETECTION. PostgREST does not error when RLS filters an UPDATE — it
 * reports zero affected rows. So the write asks for the updated row back
 * (`.select("id")`) and treats an empty result as "denied": the row exists (we
 * just resolved its id through a policy that requires membership) and the only
 * thing that can drop it from an UPDATE is `schools_write`. Without this check a
 * non-admin's change would appear to succeed and re-open the exact divergence
 * this module closes.
 *
 * Never throws — every failure path resolves to a result object.
 */
export async function saveSchoolWeekRemote(
  days: readonly string[],
  /**
   * The scope the caller BELIEVES it is writing to, when known. The school is
   * resolved here, at execution time — so without this a write queued in
   * workspace A and executed after a switch would silently update workspace B's
   * week. When the resolved scope does not match, nothing is written.
   * Omitted (or null) on a first write, before any read has told us the scope;
   * there is no prior workspace to confuse it with in that case.
   */
  expectedScope?: SchoolWeekScope | null,
): Promise<SchoolWeekSaveResult> {
  if (!isPlannerSupabaseConfigured()) return { outcome: "local" };
  if (days.length === 0) {
    // Defensive: the hook normalizes an empty selection back to the default
    // before calling, and `school_week` is NOT NULL with a non-empty default.
    return {
      outcome: "failed",
      message: "A school week needs at least one weekday.",
    };
  }
  try {
    const supabase = createClient();
    // BOUNDED. A queued write blocks every write behind it, so an unbounded
    // hang here — auth.getUser() or the workspace RPC on a dead connection —
    // would stall the queue and leave the onboarding finish buttons disabled
    // for good. The update below has its own abort; this covers the resolution
    // that precedes it.
    const resolved = await withTimeout(
      resolveGoverningSchool(supabase),
      SAVE_TIMEOUT_MS,
      null,
    );
    if (!resolved) {
      return {
        outcome: "failed",
        message:
          "We could not tell which workspace to save this to. Reload and try again.",
      };
    }
    const scope = scopeOf(resolved);
    if (expectedScope != null && expectedScope !== scope) {
      // The active workspace (or the signed-in teacher) changed between the
      // click and this moment. Writing now would apply one workspace's choice
      // to another's row — refuse rather than cross the tenant boundary.
      return {
        outcome: "failed",
        message:
          "Your workspace changed before that saved, so nothing was written. Try again here.",
        scope,
      };
    }

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), SAVE_TIMEOUT_MS);
    let data: { id: string }[] | null;
    let error: { message: string } | null;
    try {
      ({ data, error } = await supabase
        .from("schools")
        .update({ school_week: days })
        .eq("id", resolved.schoolId)
        .select("id")
        .abortSignal(abort.signal));
    } finally {
      clearTimeout(timer);
    }
    if (error) {
      console.debug("school-week: remote save failed", error.message);
      return {
        outcome: "failed",
        // An abort stops the browser waiting; it does NOT prove the database
        // declined the update, which may have committed just before the
        // cancellation. Claiming "nothing changed" would be exactly the kind of
        // false certainty this whole change exists to remove — so the copy says
        // the result is unknown, and the caller reconciles with a fresh read.
        message: abort.signal.aborted
          ? "Saving the school week timed out, so we are not sure it went through — check the days below."
          : "We could not save the school week. Check your connection.",
        scope,
      };
    }
    if (!data || data.length === 0) {
      return {
        outcome: "denied",
        message:
          "Only a workspace admin can change the school week — it applies to everyone on the team.",
        scope,
      };
    }
    return { outcome: "saved", scope };
  } catch (err) {
    console.debug("school-week: remote save error", err);
    return {
      outcome: "failed",
      message: "We could not save the school week. Check your connection.",
    };
  }
}
