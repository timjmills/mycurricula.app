// planner-dispatch-surface.test.ts — the PUBLIC API of the planner seam, pinned.
//
// ── WHY A PIN AND NOT JUST A CODE REVIEW ─────────────────────────────────────
// `plannerDispatch` is a `'use server'` boundary — an HTTP endpoint taking a
// method name off the wire. It used to admit any own, callable property of the
// source object, so the list of public endpoints was a SIDE EFFECT of the
// `PlannerDataSource` interface: add a method, ship an endpoint, no diff line
// anywhere says so. That is exactly how `getGradeSchoolId` — a server-internal
// helper for the seed's workspace label — became client-callable.
//
// So the surface is now stated explicitly (lib/planner/dispatch-surface.ts) and
// asserted here. Two mechanisms, because they fail at different moments:
//
//   COMPILE TIME. `CLIENT_CALLABLE` is a `Record<keyof PlannerDataSource,
//   boolean>`, so adding a method to the seam without classifying it is a type
//   error. You cannot forget; you can only decide.
//
//   TEST TIME. The list below is the surface as it shipped. Flipping a method to
//   `true` — publishing an endpoint — fails this test and has to be an explicit,
//   reviewable edit to a list of names, not an invisible consequence of adding a
//   helper.
//
// SEEN RED, each mutation applied to the source and reverted:
//   • adding `dummyInternalRead()` to `PlannerDataSource` → tsc fails with
//     "Property 'dummyInternalRead' is missing in type ... Record<keyof
//     PlannerDataSource, boolean>". The pin catches it before a test runs.
//   • `getGradeSchoolId: true` → "pins the exact set of client-callable methods"
//     and "refuses to dispatch a server-internal method" both fail.
//   • removing the `isClientCallable` guard from plannerDispatch → the
//     behavioural test fails.

import { describe, expect, it, vi } from "vitest";
import {
  CLIENT_CALLABLE,
  isClientCallable,
} from "@/lib/planner/dispatch-surface";
import { plannerMockSource } from "@/lib/planner/mock-source";

// The action module statically imports the server-only Supabase source
// (`next/headers`), which cannot load here. The mock source is what
// `plannerDispatch` selects anyway — `isPlannerSupabaseConfigured()` is false
// without the env flag — so stubbing this changes nothing about what is tested.
vi.mock("@/lib/planner/supabase-source", () => ({
  plannerSupabaseSource: {},
}));

import { plannerDispatch } from "@/lib/planner/actions";

/**
 * THE PUBLIC SURFACE. Every name here is reachable from a browser. Adding one is
 * a decision about the app's API; deleting one breaks a caller. Neither should
 * be possible to do by accident, which is the whole point of writing it twice.
 */
const EXPECTED_PUBLIC_SURFACE = [
  "addSectionResource",
  "createLesson",
  "createUnitAssessment",
  "deleteUnitAssessment",
  "getActiveGradeLevelId",
  "getSections",
  "getSectionsBatch",
  "listLessons",
  "listStandards",
  "listSubjects",
  "listUnitAssessments",
  "listUnits",
  "moveLesson",
  "removeSectionResource",
  "reorderUnitAssessments",
  "setLessonStatus",
  "setSections",
  "softDeleteLesson",
  "unarchiveLesson",
  "updateLesson",
  "updateUnitAssessment",
  "updateUnitFields",
].sort();

describe("the planner dispatch surface is explicit, not inherited", () => {
  it("pins the exact set of client-callable methods", () => {
    const actual = Object.entries(CLIENT_CALLABLE)
      .filter(([, callable]) => callable)
      .map(([name]) => name)
      .sort();

    expect(actual).toEqual(EXPECTED_PUBLIC_SURFACE);
  });

  it("classifies EVERY method the source implements — none unclassified", () => {
    // The cross-check that survives a cast around the type. `plannerMockSource`
    // is a plain object literal implementing the seam, so its own keys ARE the
    // real method list. If a method is added to the sources but never
    // classified, these two disagree — even if someone bypassed the compile-time
    // exhaustiveness with an `as unknown as PlannerDataSource`.
    expect(Object.keys(CLIENT_CALLABLE).sort()).toEqual(
      Object.keys(plannerMockSource).sort(),
    );
  });

  it("keeps the seed's label resolver OFF the wire", () => {
    // Named rather than merely absent from the list above, so deleting the line
    // is not the same as deleting the intent.
    expect(CLIENT_CALLABLE.getGradeSchoolId).toBe(false);
    expect(isClientCallable("getGradeSchoolId")).toBe(false);
  });

  it("fails closed on prototype properties and unknown names", () => {
    // `CLIENT_CALLABLE["toString"]` without an own-property guard is truthy.
    expect(isClientCallable("toString")).toBe(false);
    expect(isClientCallable("constructor")).toBe(false);
    expect(isClientCallable("__proto__")).toBe(false);
    expect(isClientCallable("definitelyNotAMethod")).toBe(false);
  });

  it("refuses to dispatch a server-internal method", async () => {
    await expect(
      plannerDispatch(
        "getGradeSchoolId" as keyof typeof plannerMockSource,
        ["g5"] as never,
      ),
    ).rejects.toThrow(/not client-callable/);
  });

  it("still dispatches a public one (the control)", async () => {
    // Without this, the rejection above could be a broken harness rather than
    // the allowlist doing its job.
    await expect(
      plannerDispatch("getActiveGradeLevelId", ["owner-uuid"]),
    ).resolves.toBe("g5");
  });

  it("says the same thing for an unknown method as for an unexposed one", async () => {
    // No enumeration oracle: a caller must not be able to learn which methods
    // exist by comparing error messages.
    const messageFor = async (method: string): Promise<string> => {
      try {
        await plannerDispatch(
          method as keyof typeof plannerMockSource,
          [] as never,
        );
        return "(resolved — no error)";
      } catch (err) {
        return (err as Error).message;
      }
    };

    const unexposed = await messageFor("getGradeSchoolId");
    const unknown = await messageFor("noSuchMethod");

    expect(unexposed.replace("getGradeSchoolId", "X")).toBe(
      unknown.replace("noSuchMethod", "X"),
    );
  });
});
