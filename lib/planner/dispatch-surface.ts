// lib/planner/dispatch-surface.ts — WHICH planner source methods a browser may
// invoke, stated once, deliberately, and checked at compile time.
//
// ── THE HAZARD THIS CLOSES ────────────────────────────────────────────────────
// `plannerDispatch` (lib/planner/actions.ts) is a `'use server'` boundary: an
// HTTP endpoint whose `method` argument is an attacker-controlled string. It used
// to admit anything that was an own, callable property of the source object —
// which meant the set of public endpoints was defined by whatever happened to be
// on `PlannerDataSource`. Adding a method to that interface silently published a
// new endpoint.
//
// That is how `getGradeSchoolId` became callable: it was added as an internal
// helper for the server-rendered seed's workspace label, and shipped as a public
// API nobody decided to publish. RLS still gated the data (this was never an
// authorization bypass), but "the seam is a list of things the client may call"
// and "the seam is a list of things the source can do" are different lists, and
// only one of them belongs on the wire.
//
// ⚠ WHY REMOVING A METHOD FROM THE *INTERFACE* WOULD NOT HAVE FIXED IT. The old
// check was `Object.prototype.hasOwnProperty.call(src, method)` — a RUNTIME test
// against the source OBJECT. `M extends keyof PlannerDataSource` is erased at
// runtime, so a method deleted from the TypeScript interface but still present on
// `plannerSupabaseSource` would have remained just as callable. The exposure was
// never controlled by the type; it has to be an explicit runtime list.
//
// ── EXHAUSTIVE BY TYPE, SO EXPOSURE IS A DELIBERATE ACT ───────────────────────
// A `Record<keyof PlannerDataSource, boolean>` cannot omit a method. Adding one
// to the seam without classifying it here is a COMPILE ERROR ("Property 'x' is
// missing"), not a silent new endpoint — the reviewer has to write `true` or
// `false` and mean it. tests/planner-dispatch-surface.test.ts then pins the
// resulting public surface, so flipping one to `true` also has to be a
// deliberate, visible change.

import type { PlannerDataSource } from "./source";

/**
 * `true`  — reachable from the browser through `plannerDispatch`.
 * `false` — server-internal; the server may call it directly, the wire may not.
 *
 * Every method the planner store and the view surfaces have always called is
 * `true`: this is the surface as it shipped, written down rather than inferred.
 * The one exception is the reason the file exists.
 */
export const CLIENT_CALLABLE: Record<keyof PlannerDataSource, boolean> = {
  // ── Reads the client genuinely makes ──────────────────────────────────────
  getActiveGradeLevelId: true,
  listLessons: true,
  listUnits: true,
  listSubjects: true,
  listStandards: true,
  getSections: true,
  getSectionsBatch: true,

  // ── Mutations, all reached from the store ─────────────────────────────────
  updateLesson: true,
  moveLesson: true,
  setLessonStatus: true,
  createLesson: true,
  softDeleteLesson: true,
  unarchiveLesson: true,
  updateUnitFields: true,
  listUnitAssessments: true,
  createUnitAssessment: true,
  updateUnitAssessment: true,
  deleteUnitAssessment: true,
  reorderUnitAssessments: true,
  setSections: true,
  addSectionResource: true,
  removeSectionResource: true,

  // ── SERVER-INTERNAL ───────────────────────────────────────────────────────
  /**
   * Resolves the school that owns a grade, to LABEL a server-rendered seed with
   * the workspace its reads were scoped by (lib/planner/hydrate-bundle.ts).
   *
   * Its only caller is `buildPlannerHydrateBundle`, which runs on the server
   * inside `plannerHydrateBundleAction` / `buildServerSeed` — and on the mock
   * path in the browser against `plannerMockSource` DIRECTLY, never through the
   * dispatch action. So nothing loses a capability by this being false.
   */
  getGradeSchoolId: false,
};

/**
 * May `method` — an arbitrary string off the wire — be dispatched?
 *
 * The `hasOwnProperty` guard is not decoration: a bare `CLIENT_CALLABLE[method]`
 * would consult the prototype chain, and `"constructor"` or `"toString"` are
 * truthy there. Fails closed on anything not explicitly listed as `true`.
 */
export function isClientCallable(
  method: string,
): method is keyof PlannerDataSource {
  if (!Object.prototype.hasOwnProperty.call(CLIENT_CALLABLE, method)) {
    return false;
  }
  return CLIENT_CALLABLE[method as keyof PlannerDataSource] === true;
}
