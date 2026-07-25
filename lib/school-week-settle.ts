// school-week-settle.ts — the PURE decision layer for a school-week write.
//
// React-free and Supabase-free, so the rules below are unit-testable in node
// (tests/school-week-settle.test.ts). lib/use-school-week.ts owns the effects —
// setState, localStorage, the same-tab broadcast — and asks this module WHAT to
// do; nothing here performs any of them.
//
// WHY THIS IS A SEPARATE MODULE. The school week is optimistic-write: the chips
// must respond to a click before the server answers. Optimism is only safe if
// the rollback is exact, and the rollback rules have four interacting inputs
// (the outcome, the value the write attempted, the last value the SERVER
// acknowledged, and whether a newer write has since been issued). Written
// inline in a `.then()` those rules are unreviewable and untestable; the first
// review of this change found three real defects in exactly that code.
//
// THE INVARIANT EVERYTHING SERVES: never leave a week on screen — or, worse, in
// the cache that seeds the next page load — that the database did not accept.
// Showing a week the planner does not use is the bug this whole change exists
// to remove, so re-introducing it on the failure path would be self-defeating.

/** What the server did with a write (mirrors SchoolWeekSaveOutcome). */
export type WeekSaveOutcome = "saved" | "local" | "denied" | "failed";

export interface WeekSettlementInput<T> {
  outcome: WeekSaveOutcome;
  /** The week this write tried to store. */
  attempted: readonly T[];
  /** The last week the SERVER acknowledged, or null if it never has. */
  confirmed: readonly T[] | null;
  /** Where to land when a write is rejected and nothing was ever confirmed. */
  fallback: readonly T[];
  /**
   * True when a NEWER write was issued after this one. Writes are serialized,
   * so a superseded response is stale by definition — applying it would
   * resurrect an older week over the teacher's latest choice.
   */
  superseded: boolean;
}

export interface WeekSettlement<T> {
  /** The week to display + cache, or null to leave the current state alone. */
  apply: readonly T[] | null;
  /**
   * Promote `apply` to the localStorage cache and announce it to sibling hook
   * instances. FALSE for every rejected write — an unacknowledged week must
   * never become the value that seeds the next page load.
   */
  commit: boolean;
  /**
   * Record this as the week the SERVER now holds (the rollback target for a
   * later failure), or null to leave the recorded value alone.
   *
   * SEPARATE FROM `commit` on purpose. A superseded write is stale for the UI
   * but not for the database: if write 1 SUCCEEDS and write 2 is then denied,
   * the server holds write 1's week, so that is what write 2 must roll back to.
   * Folding this into `commit` made a succeeded-then-denied pair roll back to a
   * week the database no longer had — the divergence all over again.
   */
  confirm: readonly T[] | null;
  /** The status to report, or null to report nothing (a superseded write). */
  status: WeekSaveOutcome | null;
}

/**
 * Decide what a settled write means for the UI, the cache, and the recorded
 * server value.
 *
 *   saved         → always CONFIRM (the database holds it, superseded or not);
 *                   display + commit only when it is still the newest write.
 *   local         → prototype path (no backend): localStorage IS the store, so
 *                   committing is correct — there is nothing to be wrong about.
 *                   Nothing to confirm; no server is involved.
 *   denied/failed → roll back to the last confirmed week, or to `fallback` when
 *                   the server has never answered. Never commit, never confirm.
 *   superseded    → suppress everything the UI would see; a newer write owns it.
 *
 * Pure: no I/O, no clock, no randomness. Same inputs, same result.
 */
export function resolveWeekSettlement<T>(
  input: WeekSettlementInput<T>,
): WeekSettlement<T> {
  if (input.outcome === "saved") {
    // The database took it either way — record it even when superseded.
    return {
      apply: input.superseded ? null : input.attempted,
      commit: !input.superseded,
      confirm: input.attempted,
      status: input.superseded ? null : "saved",
    };
  }
  if (input.superseded) {
    return { apply: null, commit: false, confirm: null, status: null };
  }
  if (input.outcome === "local") {
    return {
      apply: input.attempted,
      commit: true,
      confirm: null,
      status: "local",
    };
  }
  return {
    apply: input.confirmed ?? input.fallback,
    commit: false,
    confirm: null,
    status: input.outcome,
  };
}

/**
 * Should a resolved SERVER READ be applied to the UI?
 *
 * The authoritative read is fired once per page load and shared by every
 * mounted instance, so it can resolve LONG after a teacher has already changed
 * the week — at which point applying it would silently undo their edit and,
 * because the write is still in flight, leave the screen and the database
 * disagreeing again.
 *
 * The guard is a write counter sampled when the read was requested: if any
 * write has been issued since, the read is stale and the write's own settlement
 * owns the value.
 *
 * @param week           - the week the read returned; null means UNKNOWN (sync
 *                         off, no session, read error) and is never applied.
 * @param writeSeqAtRead - the write counter when this read was requested.
 * @param writeSeqNow    - the write counter now.
 */
export function shouldApplyRemoteRead<T>(
  week: readonly T[] | null,
  writeSeqAtRead: number,
  writeSeqNow: number,
): boolean {
  if (week == null || week.length === 0) return false;
  return writeSeqAtRead === writeSeqNow;
}

/**
 * Is a cached server value still usable, given who is asking?
 *
 * The cache is module-scoped and survives a workspace switch, which is a soft
 * `router.refresh()` in this app rather than a reload (see
 * lib/workspaces/client.ts). Without a scope check, one tenant's school week
 * would be served inside another tenant — and a write issued from that stale
 * assumption would target the wrong workspace. The scope is the caller's
 * identity plus the governing school, so any change to either invalidates it.
 */
export function isCacheInScope(
  cachedScope: string | null,
  currentScope: string | null,
): boolean {
  if (cachedScope == null || currentScope == null) return false;
  return cachedScope === currentScope;
}
