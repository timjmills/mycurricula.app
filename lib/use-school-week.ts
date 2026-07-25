"use client";

// use-school-week — the TEAM-scoped school week: which weekdays the
// school runs.
//
// CLAUDE.md §1 mandates this be configurable: schools in Qatar run
// Sun–Thu, US schools run Mon–Fri, and some programs run a 3-day week.
// Every calendar surface (Weekly grid columns, Daily day list, Schedule)
// must derive its days from this configuration — never hard-code a
// 5-day Mon–Fri assumption.
//
// ── ONE STORE: `schools.school_week` ──────────────────────────────────
// This hook used to be localStorage-only while the planner derived every
// lesson's day column from `schools.school_week` in the database
// (lib/planner/supabase-source.ts `resolveSchoolWeek`). Two stores meant
// the week a teacher picked and the surface it governs disagreed on the
// same device in the same session — the column HEADERS moved, the
// lessons under them did not. The database column is now the single
// source of truth (see lib/school-week-remote.ts for the read/write seam
// and why no migration was needed), and localStorage drops to a CACHE.
//
// Resolution order, deployed path:
//   1. SSR default (DEFAULT_SCHOOL_WEEK) — server HTML == first client
//      render, so there is no hydration mismatch.
//   2. localStorage cache, post-mount — instant, avoids a flash of the
//      default week while the network read is in flight.
//   3. The server value — authoritative. Overwrites both of the above
//      and refreshes the cache. Fetched ONCE per page load and shared by
//      every mounted instance (a dozen surfaces call this hook).
// On the prototype path (Supabase not configured) steps 1–2 are the
// whole story and behaviour is exactly what it was before.
//
// Writes go to the database and the result is REPORTED (`saveState`), so
// a write the server refuses — only a workspace admin may change a
// team-wide setting — is visible rather than silently diverging. A
// refused write rolls the UI back onto the server's value; leaving a
// rejected week on screen is how the split-brain started.
//
// Same-tab fan-out: the `storage` event fires only on OTHER tabs, but
// one tab mounts many instances of this hook (the chrome clock, the
// grid, the settings card…) and long-lived chrome outlives a route
// change. A custom event mirrors every persisted change to siblings in
// THIS tab, so changing the week updates the planner without a reload —
// the same channel `lib/use-schedule-settings.ts` uses for time blocks.
//
// The setter normalizes — clamps to the seven valid weekday tokens,
// dedupes, sorts by weekday position (Sun=0..Sat=6), and refuses to
// shrink the selection to zero (we always keep at least one day so the
// Weekly grid has at least one column to render).

import { useCallback, useEffect, useState } from "react";
import { isPlannerSupabaseConfigured } from "@/lib/planner/source";
import {
  onSchoolWeekScopeInvalidated,
  readSchoolWeekRemote,
  resolveSchoolWeekScope,
  saveSchoolWeekRemote,
  type SchoolWeekSaveResult,
  type SchoolWeekScope,
} from "@/lib/school-week-remote";
import {
  isCacheInScope,
  resolveWeekSettlement,
  shouldApplyRemoteRead,
} from "@/lib/school-week-settle";

// ── Types + constants ──────────────────────────────────────────────────────

/** The seven weekday tokens, in Sunday-first order (Sun=0..Sat=6). */
export type Weekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

/** Canonical Sunday-first order for normalization + display. */
export const WEEKDAY_ORDER: readonly Weekday[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
] as const;

/**
 * Position of each weekday in the Sun-first order, so we can sort a
 * user's selection deterministically without depending on Array index
 * lookups in hot paths.
 */
export const WEEKDAY_INDEX: Readonly<Record<Weekday, number>> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

// ── Weekday display labels ────────────────────────────────────────────────
//
// Token-keyed labels for the seven weekdays. Consumers should look up by
// token (`WEEKDAY_LABEL[WEEKDAY_ORDER[i]]`) rather than indexing the
// legacy `WEEK_DAYS[i]` / `WEEK_DAYS_SHORT[i]` arrays in `lib/mock`, which
// were locked to the Sun–Thu beta week and broke whenever a school chose
// a different week (e.g. Mon–Fri).
//
// These maps cover all seven days unconditionally — the configured school
// week (via `useSchoolWeek()`) decides which days are rendered; the label
// map just provides the display string for whatever token the consumer
// already resolved.

/**
 * Short (3-letter) labels for a compact header / pill / chip context.
 * Indexed by Weekday token so labels follow the configured school week
 * rather than position in the legacy Sun-first array.
 */
export const WEEKDAY_LABEL: Readonly<Record<Weekday, string>> = {
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
};

/**
 * Full weekday names for headings, breadcrumbs, and accessible labels.
 * Same lookup pattern as WEEKDAY_LABEL.
 */
export const WEEKDAY_LABEL_LONG: Readonly<Record<Weekday, string>> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

/**
 * Default school week — matches the beta Qatar school (Sun–Thu) and
 * the existing mock fixtures. Treat this as sample data, not a
 * constraint (CLAUDE.md §1).
 */
export const DEFAULT_SCHOOL_WEEK: readonly Weekday[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
] as const;

/**
 * Named preset registry. The settings UI offers Sun–Thu / Mon–Fri /
 * Mon–Sat by default; `custom` is the implicit selection when the
 * user's set matches no named preset.
 */
export const SCHOOL_WEEK_PRESETS = {
  sunThu: ["sun", "mon", "tue", "wed", "thu"] as Weekday[],
  monFri: ["mon", "tue", "wed", "thu", "fri"] as Weekday[],
  monSat: ["mon", "tue", "wed", "thu", "fri", "sat"] as Weekday[],
} as const;

export type SchoolWeekPresetKey = keyof typeof SCHOOL_WEEK_PRESETS;

// ── Storage ────────────────────────────────────────────────────────────────

/**
 * localStorage key — a CACHE of `schools.school_week`, not the store.
 *
 * It exists for two jobs only: paint the right week immediately on the
 * next load instead of flashing the default while the server read is in
 * flight, and BE the store on the prototype path (Supabase not
 * configured), where it behaves exactly as it always did. On the
 * deployed path the server value always wins and refreshes this key.
 *
 * Keeping the `mycurricula:team:*` name is deliberate: the probe scripts
 * and the v1 wizard seed it, and a rename would strand them.
 */
const STORAGE_KEY = "mycurricula:team:school-week-days";

/**
 * Same-tab change channel. The `storage` event fires on OTHER tabs only,
 * but a single tab mounts this hook a dozen times (WeeklyGrid,
 * ChromeClock, DailyView, SchedulePanel, the settings card…) and the
 * chrome shell survives route changes. Without this, changing the school
 * week left every already-mounted surface on the old shape until a full
 * reload. Dispatched only after a SUCCESSFUL persist, so listeners that
 * re-read storage always observe the value the writer stored.
 */
const SCHOOL_WEEK_EVENT = "mycurricula:school-week-updated";

/**
 * Normalize a list of weekday tokens: keep only valid tokens, dedupe,
 * and sort by Sun-first position. If the result is empty (invalid
 * input, or the caller passed `[]`), fall back to the default so the
 * Weekly grid is never asked to render zero columns.
 */
function normalize(input: unknown): Weekday[] {
  if (!Array.isArray(input)) return [...DEFAULT_SCHOOL_WEEK];
  const seen = new Set<Weekday>();
  for (const v of input) {
    if (typeof v !== "string") continue;
    if (v in WEEKDAY_INDEX) {
      seen.add(v as Weekday);
    }
  }
  if (seen.size === 0) return [...DEFAULT_SCHOOL_WEEK];
  return Array.from(seen).sort((a, b) => WEEKDAY_INDEX[a] - WEEKDAY_INDEX[b]);
}

/**
 * Read + parse the stored value. Returns null when unset or when the
 * stored JSON is malformed (private mode, quota exhaustion, etc.).
 */
/** A cached week plus WHOSE it is. `scope` is null for a legacy/prototype
 *  entry (a bare weekday array), which belongs to no particular tenant. */
interface CachedWeek {
  days: Weekday[];
  scope: SchoolWeekScope | null;
}

/**
 * Read the cache, accepting BOTH shapes:
 *   • `["sun", …]`               — the legacy/prototype form. Still written on
 *     the prototype path, and seeded directly by the probe scripts
 *     (scripts/probe-lane-*.mjs) and the v1 wizard, so it must keep working.
 *   • `{ scope, days: [...] }`   — the deployed form, which records the teacher
 *     + workspace the value belongs to.
 */
function readFromStorage(): CachedWeek | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return { days: normalize(parsed), scope: null };
    if (typeof parsed === "object" && parsed !== null) {
      const obj = parsed as { days?: unknown; scope?: unknown };
      return {
        days: normalize(obj.days),
        scope: typeof obj.scope === "string" ? obj.scope : null,
      };
    }
    return null;
  } catch {
    // Malformed JSON or storage disabled — fall through.
    return null;
  }
}

/**
 * Refresh the cache and tell this tab's other instances. Returns true
 * when the write landed; the same-tab event is dispatched only then, so
 * a listener re-reading storage can never be handed a stale value the
 * writer failed to persist (private mode, quota exhaustion).
 *
 * `scope` is stamped in on the deployed path so a later read can tell whose
 * week it is; the prototype path keeps writing the bare array (no tenants
 * exist, and the probe scripts read that shape).
 */
function writeToStorage(
  days: Weekday[],
  scope: SchoolWeekScope | null = null,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(scope == null ? days : { scope, days }),
    );
    window.dispatchEvent(new Event(SCHOOL_WEEK_EVENT));
    return true;
  } catch {
    // Storage disabled / quota exceeded — callers still update in-memory.
    return false;
  }
}

// ── Module-scoped server state ─────────────────────────────────────────────
//
// A dozen surfaces call useSchoolWeek() on one page, so the server answer and
// the write queue live at module scope and are shared. Four properties this
// state must have — each one the fix for a defect the first review found:
//
//   1. SCOPED. It is keyed by teacher + governing school. A workspace switch in
//      this app is a soft router.refresh(), not a reload (lib/workspaces/
//      client.ts says so explicitly), so an unscoped module cache would serve
//      one tenant's school week inside another. The WORKSPACE_CHANGED_EVENT
//      listener clears it eagerly; the scope check is the belt underneath.
//   2. CONFIRMED-ONLY. `confirmed` holds what the SERVER acknowledged, never
//      what a teacher optimistically clicked. It is the rollback target, so a
//      refused write always has somewhere exact to land — no re-read, no
//      "unknown" hole where the rejected value survives.
//   3. SERIALIZED. Writes run one at a time. Two rapid preset clicks would
//      otherwise race to Postgres and could land in the opposite order from the
//      clicks, leaving the database on a week the teacher did not choose last.
//   4. VERSIONED. `writeSeq` increments per write, so a stale response — or the
//      once-per-load server read resolving after an edit — is recognised and
//      discarded instead of overwriting a newer choice.

interface RemoteWeekState {
  scope: SchoolWeekScope;
  /** The last week the SERVER acknowledged (read or accepted write). */
  confirmed: Weekday[];
}

/**
 * A resolved shared read, stamped with the counters it was ISSUED under.
 *
 * The stamps must travel with the request, not be sampled by whoever happens to
 * be waiting on it: the read is shared, so a hook mounting midway through would
 * otherwise compare its own (newer) sample against a response created long
 * before — and accept a week the teacher has already changed.
 */
interface RemoteReadResult {
  state: RemoteWeekState | null;
  issuedAtWriteSeq: number;
  issuedAtScopeGen: number;
  issuedAtReadGen: number;
}

/**
 * Monotonic READ generation. Bumped whenever the memoized answer is retired —
 * by an invalidation OR a plain refresh. Dropping the memo does not cancel a
 * request already in flight, so without this stamp an older read could resolve
 * after a newer one and reinstate the week it replaced (two tabs, one saving
 * while the other reads). Neither `scopeGen` nor `writeSeq` moves in that case,
 * so it needs its own counter.
 */
let readGen = 0;

let remoteState: RemoteWeekState | null = null;
let remoteRead: Promise<RemoteReadResult> | null = null;

/** Monotonic write counter. Bumped when a write is ISSUED, so any response or
 *  read that sampled an older value knows it has been superseded. */
let writeSeq = 0;

/**
 * Monotonic SCOPE generation. Bumped whenever the answer "whose week is this?"
 * changes — a workspace switch or a signed-in identity change.
 *
 * Clearing the cache on those events is not enough on its own: requests already
 * in flight for the OLD scope still resolve, and would then write the previous
 * tenant's week into the new tenant's UI and cache. Every async result — reads
 * and writes alike — therefore carries the generation it was issued under and
 * is discarded if it no longer matches. A queued write whose generation is
 * stale is dropped BEFORE it is sent, so it never reaches the wrong workspace
 * at all.
 */
let scopeGen = 0;

/** Serializes writes so the database applies them in click order. */
let writeChain: Promise<unknown> = Promise.resolve();

/**
 * Broadcast by the workspace switcher after a successful switch/create.
 * Declared here rather than imported: lib/workspaces/client.ts pulls in the
 * `"use server"` actions module, which this widely-imported client hook must
 * not drag along. KEEP IN LOCKSTEP with WORKSPACE_CHANGED_EVENT there.
 */
const WORKSPACE_CHANGED_EVENT = "mycurricula:workspace-changed";

/**
 * Internal "the cached week is no longer yours — re-read it" signal. Fired for
 * a signed-in identity change (see onSchoolWeekScopeInvalidated); the workspace
 * switch above fires the sibling event. Both land on the same handler.
 */
const SCHOOL_WEEK_INVALIDATE_EVENT = "mycurricula:school-week-invalidate";

/**
 * Wire the identity watch ONCE for the whole app, not once per mounted hook.
 * The clear happens here, before the re-read signal goes out, so every
 * listening instance re-reads through the SAME fresh memo — one query, not one
 * per surface.
 */
let scopeWatchWired = false;
function ensureScopeWatch(): void {
  if (scopeWatchWired) return;
  if (typeof window === "undefined") return;
  scopeWatchWired = true;
  onSchoolWeekScopeInvalidated(() => {
    clearRemoteWeek();
    // A previous teacher's save outcome is not this teacher's news.
    publishSaveState({ status: "idle" });
    window.dispatchEvent(new Event(SCHOOL_WEEK_INVALIDATE_EVENT));
  });
}

/** The server's week, fetched at most once per page load and shared. Resolves
 *  null for UNKNOWN (sync off, no session, read error) — never "no week". */
function loadRemoteWeekOnce(): Promise<RemoteReadResult> {
  if (remoteRead == null) {
    const issuedAtScopeGen = scopeGen;
    const issuedAtWriteSeq = writeSeq;
    const issuedAtReadGen = readGen;
    const stamp = { issuedAtWriteSeq, issuedAtScopeGen, issuedAtReadGen };
    remoteRead = readSchoolWeekRemote()
      .then((res) => {
        // Stale on either axis:
        //   • scopeGen moved → a workspace/identity switch happened in flight;
        //     applying this would re-poison the cache with the old tenant.
        //   • writeSeq moved → the teacher has since changed the week, and a
        //     write already owns the value. Assigning remoteState here would
        //     overwrite what that write CONFIRMED, corrupting the rollback
        //     target for the next failure.
        //   • readGen moved → this read was retired (invalidated or refreshed)
        //     and a newer one has taken over; letting it land would reinstate
        //     the week that newer read replaced.
        if (
          res == null ||
          issuedAtScopeGen !== scopeGen ||
          issuedAtWriteSeq !== writeSeq ||
          issuedAtReadGen !== readGen
        ) {
          return { state: null, ...stamp };
        }
        const state: RemoteWeekState = {
          scope: res.scope,
          confirmed: normalize(res.week),
        };
        remoteState = state;
        return { state, ...stamp };
      })
      .catch(() => ({ state: null, ...stamp }));
  }
  return remoteRead;
}

/**
 * Whether a resolved shared read is still safe to apply to the UI.
 *
 * Both the READ's issuance stamps and the current counters are compared, so a
 * consumer that mounted after an edit cannot accept a response created before
 * it. `shouldApplyRemoteRead` covers the write axis; the scope axis is checked
 * alongside it.
 */
function readIsCurrent(res: RemoteReadResult): boolean {
  if (res.issuedAtScopeGen !== scopeGen) return false;
  if (res.issuedAtReadGen !== readGen) return false;
  return shouldApplyRemoteRead(
    res.state?.confirmed ?? null,
    res.issuedAtWriteSeq,
    writeSeq,
  );
}

/** Record a week the server just accepted, and memoize it so a later mount
 *  does not re-query for something we already know. The memo is re-stamped
 *  with the CURRENT counters — it is as fresh as this write. */
function commitRemoteWeek(scope: SchoolWeekScope, days: Weekday[]): void {
  remoteState = { scope, confirmed: days };
  remoteRead = Promise.resolve({
    state: remoteState,
    issuedAtWriteSeq: writeSeq,
    issuedAtScopeGen: scopeGen,
    issuedAtReadGen: readGen,
  });
}

/**
 * Drop the memoized answer so the next read re-asks the server, WITHOUT
 * retiring the scope (that is `clearRemoteWeek`'s job). Used to reconcile after
 * a write whose true outcome is unknown — an aborted request may or may not
 * have committed, and only the server can say which.
 */
function refreshRemoteWeek(): void {
  // Retire any read still in flight — dropping the memo does not cancel it.
  readGen += 1;
  remoteRead = null;
}

/**
 * The caller's scope, resolved at most once per scope generation.
 *
 * Kept SEPARATE from the week read on purpose: a write needs to name its target
 * workspace, and that answer is not invalidated by the teacher changing the
 * week. Sharing the week read's memo for this meant a second rapid click could
 * retire the read the first click's write was waiting on, and both writes then
 * failed with no request sent. Bounded inside resolveSchoolWeekScope, so a
 * queued write always settles and the queue always advances.
 */
let scopeResolve: Promise<SchoolWeekScope | null> | null = null;

function resolveScopeOnce(): Promise<SchoolWeekScope | null> {
  scopeResolve ??= resolveSchoolWeekScope().catch(() => null);
  return scopeResolve;
}

/**
 * Forget the server answer entirely (identity or workspace changed) and retire
 * every request issued under the old scope. The localStorage cache goes too:
 * it is unscoped, so leaving it would seed the NEXT page load with the previous
 * tenant's week — the one persistent form of this leak.
 */
function clearRemoteWeek(): void {
  scopeGen += 1;
  readGen += 1;
  remoteState = null;
  remoteRead = null;
  scopeResolve = null;
  // A write issued under the old generation returns early without publishing a
  // terminal status, so the shared state would otherwise stay "saving" forever
  // — and the onboarding finish buttons with it. The previous workspace's save
  // is not this one's news either way.
  publishSaveState({ status: "idle" });
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage disabled — nothing cached to leak.
  }
}

/** Run `fn` after every previously-queued write has settled. */
function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  // Swallow on the CHAIN only — the returned promise keeps its own result.
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * The outcome of the most recent `setDays`, SHARED across every mounted
 * instance so any surface can be honest about whether a team-wide change
 * actually landed — including one that did not perform the write. The
 * onboarding summary depends on that: the schedule step issues the write, and
 * the summary two steps later must not claim the week is "saved for your whole
 * team" when the database refused it.
 *
 *   idle   — nothing written this session.
 *   saving — the write is in flight.
 *   saved  — the database accepted it; the whole team's planner follows.
 *   local  — prototype path: stored in this browser only.
 *   denied — the database refused it (not a workspace admin). The UI has
 *            been rolled back onto the server's value.
 *   failed — no session / transport error. Also rolled back.
 */
// One member per status (rather than a grouped `"idle" | "saving" | …`
// member) so `status` is a true discriminant and narrowing reaches `message`.
export type SchoolWeekSaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "local" }
  | { status: "denied"; message: string }
  | { status: "failed"; message: string };

/** Shared save state + its change channel (see the type's note on WHY it is
 *  shared rather than per-instance). */
const SAVE_STATE_EVENT = "mycurricula:school-week-save-state";
let saveStateShared: SchoolWeekSaveState = { status: "idle" };

function publishSaveState(next: SchoolWeekSaveState): void {
  saveStateShared = next;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SAVE_STATE_EVENT));
}

/**
 * Returns the team's school week plus a setter and the setter's outcome.
 *
 * The state is a sorted list of weekday tokens. The setter accepts any
 * Weekday[] — the hook normalizes (clamps to valid tokens, dedupes,
 * sorts, refuses empty) before persisting.
 *
 * `days` and `setDays` are unchanged from the localStorage-only version,
 * so every existing consumer keeps working untouched. `saveState` is
 * additive, for the two surfaces that WRITE the week (Settings →
 * Calendar and the onboarding schedule step) to report the result.
 */
export function useSchoolWeek(): {
  days: Weekday[];
  setDays: (d: Weekday[]) => void;
  saveState: SchoolWeekSaveState;
} {
  // Start with the SSR-safe default. We intentionally do NOT read
  // localStorage during the initial render — that would diverge the
  // server-rendered HTML from the first client render and produce a
  // hydration mismatch.
  const [days, setDaysState] = useState<Weekday[]>(() => [
    ...DEFAULT_SCHOOL_WEEK,
  ]);
  // SSR-safe mirror of the shared save state (see SchoolWeekSaveState).
  const [saveState, setSaveState] = useState<SchoolWeekSaveState>({
    status: "idle",
  });

  // Post-mount: the cache first (instant), then the server (authoritative).
  // The server read is shared module-wide, so N instances cost one query.
  useEffect(() => {
    // PROTOTYPE PATH: the cache IS the store, and there are no tenants to
    // confuse — paint it immediately, exactly as before this change.
    const cached = readFromStorage();
    if (!isPlannerSupabaseConfigured()) {
      if (cached != null) setDaysState(cached.days);
      return;
    }

    // DEPLOYED PATH: the cache is NOT painted before it is verified. Which
    // workspace is active is server state, so any synchronous paint is a guess
    // — and on a shared browser, or after a workspace switch in another tab,
    // the guess shows one tenant's school week inside another's planner. Worse,
    // if the authoritative read then fails, the wrong week stays. So the
    // tenant-neutral SSR default holds until the server answers.
    //
    // COST: a brief default-week paint on each load. Accepted deliberately —
    // a wrong week rendered confidently is the failure this whole change
    // removes, and a scope-keyed cache written at sign-in would restore the
    // fast paint later without reopening it.

    let cancelled = false;
    void loadRemoteWeekOnce().then((res) => {
      if (cancelled) return;
      // A null state is UNKNOWN, not "no week" — keep whatever we already show
      // rather than yanking a teacher back to the default on a hiccup. The
      // currency check uses the READ's own issuance stamps, so mounting midway
      // through a shared request cannot make a stale answer look fresh.
      if (!readIsCurrent(res)) return;
      const confirmed = res.state!.confirmed;
      setDaysState(confirmed);
      // Refresh the cache so the next page load paints the server's week
      // immediately. Safe to broadcast: this value IS the server's.
      writeToStorage(confirmed, res.state!.scope);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // A workspace switch is a soft router.refresh() in this app, and a same-tab
  // sign-out/sign-in keeps module state too — so the cached server answer can
  // outlive the teacher (or the tenant) it belongs to. Both signals land here:
  // forget it and re-read, rather than showing the previous one's week.
  useEffect(() => {
    if (typeof window === "undefined") return;
    ensureScopeWatch();
    const reread = (): void => {
      clearRemoteWeek();
      if (!isPlannerSupabaseConfigured()) return;
      void loadRemoteWeekOnce().then((res) => {
        if (!readIsCurrent(res)) return;
        setDaysState(res.state!.confirmed);
        writeToStorage(res.state!.confirmed, res.state!.scope);
      });
    };
    window.addEventListener(WORKSPACE_CHANGED_EVENT, reread);
    window.addEventListener(SCHOOL_WEEK_INVALIDATE_EVENT, reread);
    return () => {
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, reread);
      window.removeEventListener(SCHOOL_WEEK_INVALIDATE_EVENT, reread);
    };
  }, []);

  // Mirror the SHARED save state so a surface that did not perform the write
  // still reports the truth about it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = (): void => setSaveState(saveStateShared);
    sync();
    window.addEventListener(SAVE_STATE_EVENT, sync);
    return () => window.removeEventListener(SAVE_STATE_EVENT, sync);
  }, []);

  // Sync from other tabs (`storage`) and from sibling instances in THIS
  // tab (SCHOOL_WEEK_EVENT — see the constant's note). Both re-read the
  // cache, which the writer refreshed before announcing the change.
  //
  // The cache is one key shared by every tab of this browser, so on the
  // deployed path a change written by a tab sitting in a DIFFERENT workspace
  // must not be adopted here — two workspaces open side by side would otherwise
  // show each other's school week. Entries are accepted only when their scope
  // matches the one this tab has confirmed.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const adopt = (): void => {
      const next = readFromStorage();
      if (next == null) {
        setDaysState([...DEFAULT_SCHOOL_WEEK]);
        return;
      }
      if (
        isPlannerSupabaseConfigured() &&
        !isCacheInScope(next.scope, remoteState?.scope ?? null)
      ) {
        // Another workspace's write, or an entry we cannot attribute. Leave the
        // display alone and let the authoritative read settle it.
        refreshRemoteWeek();
        void loadRemoteWeekOnce().then((res) => {
          if (!readIsCurrent(res)) return;
          setDaysState(res.state!.confirmed);
        });
        return;
      }
      setDaysState(next.days);
    };
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue == null) {
        // CLEARED ELSEWHERE. On the deployed path this is almost always another
        // tab switching workspace (clearRemoteWeek removes the shared key) —
        // which says nothing about THIS tab's workspace. Snapping to the
        // default here would replace a confirmed week with a guess in a tab
        // that is perfectly healthy, so re-ask the server instead.
        if (isPlannerSupabaseConfigured()) {
          refreshRemoteWeek();
          void loadRemoteWeekOnce().then((res) => {
            if (!readIsCurrent(res)) return;
            setDaysState(res.state!.confirmed);
          });
          return;
        }
        // Prototype path: the cache IS the store, so cleared means default.
        setDaysState([...DEFAULT_SCHOOL_WEEK]);
        return;
      }
      // Re-read through the same parser as everything else, so the scoped and
      // legacy cache shapes are both understood.
      adopt();
    };
    const onSameTab = (): void => adopt();
    window.addEventListener("storage", onStorage);
    window.addEventListener(SCHOOL_WEEK_EVENT, onSameTab);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SCHOOL_WEEK_EVENT, onSameTab);
    };
  }, []);

  // Setter. Normalizes, shows the choice immediately (the chips must respond
  // to a click), then writes through to the database — and, crucially, only
  // PROMOTES the value to the cache + sibling surfaces once the server has
  // accepted it. A refused write rolls back to the last confirmed week.
  //
  // The optimistic display is deliberately writer-local: broadcasting an
  // unacknowledged week to every mounted surface, and to the cache that seeds
  // the next page load, would recreate exactly the settings-vs-planner
  // disagreement this hook exists to remove.
  const setDays = useCallback((next: Weekday[]): void => {
    const normalized = normalize(next);
    const seq = ++writeSeq;
    setDaysState(normalized);

    if (!isPlannerSupabaseConfigured()) {
      // Prototype path: localStorage IS the store, so committing immediately
      // is correct — there is no server that could disagree.
      writeToStorage(normalized);
      publishSaveState({ status: "local" });
      return;
    }

    // Bind the scope generation at click time, and bind the SCOPE ITSELF
    // before any request goes out. A write must name the workspace it is for:
    // letting the server resolve "wherever you are now" at execution time is
    // how a change made in workspace A ends up rewriting workspace B's week.
    // The scope comes from the shared read — already in flight or memoized, so
    // this costs no extra round trip — and if it cannot be resolved we refuse
    // to write rather than write blind.
    const gen = scopeGen;

    publishSaveState({ status: "saving" });
    // Queued, so two rapid clicks reach Postgres in click order. The guards run
    // INSIDE the queued function, so a write superseded by a workspace switch
    // while it waited is dropped before any request is sent.
    void enqueueWrite(async (): Promise<SchoolWeekSaveResult | null> => {
      if (gen !== scopeGen) return null;
      // Bounded (see resolveSchoolWeekScope), so this await always settles and
      // the queue behind it always advances.
      const targetScope = remoteState?.scope ?? (await resolveScopeOnce());
      if (gen !== scopeGen) return null;
      if (targetScope == null) {
        return {
          outcome: "failed",
          message:
            "We could not reach your workspace, so the school week was not changed. Try again in a moment.",
        };
      }
      return saveSchoolWeekRemote(normalized, targetScope);
    }).then((result) => {
      // Dropped pre-flight, or the scope moved while in flight: this result
      // belongs to a workspace the teacher is no longer in. Say nothing, touch
      // nothing — the new scope's own read owns the displayed week.
      if (result == null || gen !== scopeGen) return;

      // Roll back only onto a confirmed week that belongs to the SAME teacher +
      // workspace this write targeted. The write already resolved the current
      // scope, so this costs nothing — and it stops a cache entry left over
      // from another tenant becoming the value we restore.
      const cached = remoteState;
      const rollbackTarget = isCacheInScope(
        cached?.scope ?? null,
        result.scope ?? null,
      )
        ? (cached?.confirmed ?? null)
        : null;

      const settlement = resolveWeekSettlement<Weekday>({
        outcome: result.outcome,
        attempted: normalized,
        confirmed: rollbackTarget,
        // Nothing the server ever confirmed for THIS scope. Deliberately NOT
        // the localStorage cache: an entry left by another workspace would
        // restore that tenant's week here. The SSR default is tenant-neutral,
        // and the reconciling read below replaces it with the truth.
        fallback: [...DEFAULT_SCHOOL_WEEK],
        superseded: seq !== writeSeq,
      });

      // Record what the DATABASE now holds, even for a superseded write — the
      // next write's rollback target depends on it being current.
      if (settlement.confirm != null && result.scope) {
        commitRemoteWeek(result.scope, [...settlement.confirm]);
      }
      if (settlement.apply != null) {
        const applied = [...settlement.apply];
        setDaysState(applied);
        // Only an ACCEPTED week reaches the cache + sibling surfaces.
        if (settlement.commit) writeToStorage(applied, result.scope ?? null);
      }
      if (settlement.status === null) return; // superseded — a newer write owns it
      if (settlement.status === "saved" || settlement.status === "local") {
        publishSaveState({ status: settlement.status });
        return;
      }
      publishSaveState({
        status: settlement.status,
        message: result.message ?? "The school week was not saved.",
      });

      // RECONCILE. The rollback above is immediate and deterministic, but for
      // some failures it is only a best guess: an ABORTED request may have
      // committed server-side before the browser stopped waiting, so "failed"
      // does not prove "unchanged". Ask the server what it actually holds and
      // correct the display. The scope generation is untouched, so this is a
      // refresh, not an invalidation.
      refreshRemoteWeek();
      void loadRemoteWeekOnce().then((res) => {
        if (!readIsCurrent(res)) return;
        setDaysState(res.state!.confirmed);
        writeToStorage(res.state!.confirmed, res.state!.scope);
      });
    });
  }, []);

  return { days, setDays, saveState };
}

// ── Preset helpers ─────────────────────────────────────────────────────────

/**
 * Find the preset key whose weekday set matches the given selection
 * exactly. Returns "custom" if no preset matches. Order-insensitive
 * because both sides are normalized through `Set`.
 */
export function detectSchoolWeekPreset(
  days: Weekday[],
): SchoolWeekPresetKey | "custom" {
  const set = new Set(days);
  for (const [key, value] of Object.entries(SCHOOL_WEEK_PRESETS)) {
    if (value.length !== set.size) continue;
    if (value.every((d) => set.has(d))) {
      return key as SchoolWeekPresetKey;
    }
  }
  return "custom";
}
