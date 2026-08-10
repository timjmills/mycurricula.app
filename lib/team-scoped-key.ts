// team-scoped-key — the one place a `mycurricula:team:*` storage key learns
// which tenant it belongs to.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────
// Every `mycurricula:team:*` value started life as a FLAT key: one entry per
// browser, shared by every notebook and every workspace on the machine. That
// is correct only while a teacher has exactly one of each. It stopped being
// true when the multi-workspace seam landed, and the symptom is silent — a
// rename, an archive, a holiday, or an academic year set in one place quietly
// applies in another (tasks #19, #26, #25).
//
// Two hooks already solved this independently (`teamSubjectOrderStorageKey`,
// `teamSubjectOverridesStorageKey`), and a third and fourth copy of the same
// three lines is how the four of them eventually disagree about what an empty
// scope means. This module is that shared decision, stated once.
//
// ── THE TWO SCOPE TIERS, AND WHY A KEY MUST PICK ONE DELIBERATELY ──────────
// Choosing the wrong tier is worse than staying flat, because a wrong scope
// SPLITS a value teachers expect to share, and the split is as invisible as
// the leak it replaced. The rule:
//
//   NOTEBOOK (`grade_levels.id`, from `useNotebookState().activeNotebookId`)
//     — the value differs per grade. Subject overrides and both subject
//       orders are notebook-scoped; so is the schedule rotation (a rotating
//       timetable is a grade's pattern, USER-RULED) and the curriculum label
//       ("Grade 5" names the notebook, not the school).
//     Notebook ids are already per-workspace UUIDs on the MULTI_WORKSPACE ON
//     path, so notebook scoping isolates workspaces for free.
//
//   WORKSPACE (`schools.id`, from `useNotebookState().workspaceId`)
//     — the value is one school's, shared by every grade in it. The CALENDAR
//       is the whole of this tier: holidays, the academic year, and the school
//       months. Notebook-scoping those would be a NEW bug — a holiday added
//       on Grade 5 would vanish on Grade 6 in the same school.
//     They are also one concept and must move together: a teacher holding an
//     academic year that disagrees with its own month set is worse than the
//     leak.
//
// ── THE DEGRADED STATE IS EXPLICIT, NOT INCIDENTAL ─────────────────────────
// Both ids can legitimately be absent, and the two cases are NOT the same:
//
//   • `activeNotebookId` is "" only for the instant before identity resolves
//     on the ON path.
//   • `workspaceId` is null for that same instant AND for the ENTIRE
//     MULTI_WORKSPACE OFF path — it is hard-coded null there
//     (lib/notebook-state.tsx). So on an OFF build every workspace-scoped key
//     degrades to its bare form, permanently.
//
// That degradation is honest rather than a hole: with the flag off there is
// exactly one workspace, so there is no second tenant for a value to leak to.
// It also means a workspace-scoped key's bare form stays live indefinitely,
// which is why `isScoped()` exists — a caller that needs to know whether it is
// actually isolated must be able to ask, instead of inferring it from a string.
//
// ── WHY THE BUILDER IS EXPORTED, NOT THE STRING ────────────────────────────
// Ten committed probe scripts write these keys by hand-writing the flat
// literal. The moment a key is scoped, those probes keep "succeeding" while
// configuring nothing — they set an entry the app no longer reads, then assert
// against an unconfigured app and pass. That is the fail-open pattern this
// repo keeps paying for, so the mitigation is structural: the key BUILDER is
// the contract, the string never is. A probe that imports this cannot
// construct a stale key by hand.
//
// ⚠ THIS MODULE MUST STAY DEPENDENCY-FREE — that property is load-bearing,
// not tidiness. The probes are plain `.mjs` run by `node`, and they can import
// this file ONLY because Node 24 strips types from a `.ts` file that pulls in
// nothing else (verified: `node probe.mjs` importing `lib/team-scoped-key.ts`
// resolves and returns the built key; it emits a cosmetic
// MODULE_TYPELESS_PACKAGE_JSON warning and nothing more). Add a React import,
// a `"use client"` directive, or a `@/`-aliased import here and every probe
// that depends on it breaks at once — and breaks in the direction of
// configuring nothing while still passing, which is the exact failure this
// module exists to prevent. Keep the hooks' own key builders (which DO import
// React) as the app-side surface; this stays the shared, importable core.

/**
 * A resolved tenant id, or the absence of one. `null` and `""` both mean "not
 * resolved" — the empty string matters because `activeNotebookId` really is
 * `""` while identity loads, and `"base:"` would be a junk scope that no
 * later read could match.
 */
export type TeamScope = string | null | undefined;

/**
 * Build the storage key for a scope.
 *
 * `base` is the flat key the value used before scoping — kept verbatim as the
 * prefix so the pre-scoping entry is still addressable for a one-time
 * migration, and so a human reading localStorage can still tell what a key is.
 *
 * An unresolved scope returns the BARE base key. Callers must treat that as a
 * real state, not an edge case: see the degradation note above.
 */
export function teamScopedKey(base: string, scope: TeamScope): string {
  return scope ? `${base}:${scope}` : base;
}

/**
 * Whether a scope actually isolates. Exported so a caller can branch on
 * "am I tenant-isolated right now" without re-deriving the truthiness rule or,
 * worse, string-matching the key for a colon.
 */
export function isScoped(scope: TeamScope): boolean {
  return Boolean(scope);
}
