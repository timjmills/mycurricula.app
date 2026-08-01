// planner-seed-disabled.test.ts — the switch is OFF, and this is what that means.
//
// ⚠ THIS FILE MUST NOT MOCK `@/lib/planner/server-seed-enabled`. Every other
// seed suite force-enables the feature so its logic stays covered; this one runs
// against the REAL constant, so it fails the moment someone flips it — which is
// the point. A switch nothing asserts is a switch that gets moved by accident.
//
// WHY THE FEATURE IS OFF, in one line: the seed path skips the Server Action
// round trip, so it loses the RLS re-scoping that makes the ordinary path safe
// BY CONSTRUCTION, and its strongest available replacement is a local
// `getSession()` read — which can be stale, expired, or revoked. The full
// argument, and the four conditions for turning it on, are in
// lib/planner/server-seed-enabled.ts.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlannerHydrateBundle } from "@/lib/planner/hydrate-bundle";
import type { PlannerSeedResult } from "@/lib/planner/hydrate-seed";
import { PLANNER_SERVER_SEED_ENABLED } from "@/lib/planner/server-seed-enabled";

const SCHOOL = "school-uuid";

const bundle = (tag: string): PlannerHydrateBundle => ({
  gradeLevelId: `grade-${tag}`,
  schoolId: SCHOOL,
  lessons: [],
  subjects: [],
  units: [],
  standards: {},
  sections: {},
  sectionsFailed: false,
});

const seed = (tag: string): PlannerSeedResult => ({
  ok: true,
  ownerId: "teacher-a",
  scope: { seam: "home", schoolId: SCHOOL, gradeLevelId: `grade-${tag}` },
  bundle: bundle(tag),
});

describe("the server-seed switch is OFF", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/planner/actions");
    vi.doUnmock("@/lib/planner/seed-scope");
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("is off in the shipped constant", () => {
    // The plainest possible assertion, and the one that fails first if the
    // constant is flipped without the rest of this file being reconsidered.
    expect(PLANNER_SERVER_SEED_ENABLED).toBe(false);
  });

  it("consumes NO seed and reads the backend instead", async () => {
    // A seed is armed and delivered — a perfectly good one, for the right owner,
    // the right workspace, internally consistent. With the switch off it must be
    // ignored entirely and the hydrate must go through
    // `plannerHydrateBundleAction`, where RLS re-scopes it under the browser's
    // own cookies.
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_PLANNER_USE_SUPABASE", "1");
    vi.stubGlobal("window", {});

    const action = vi.fn().mockResolvedValue(bundle("from-backend"));
    vi.doMock("@/lib/planner/actions", () => ({
      plannerDispatch: vi.fn(),
      plannerHydrateBundleAction: action,
    }));
    // If the identity resolver is ever reached, that is itself a failure — the
    // disabled path must not spend a request on validating a seed it will not
    // use. Throwing here would surface as a rejected hydrate.
    const identity = vi.fn().mockResolvedValue(null);
    vi.doMock("@/lib/planner/seed-scope", () => ({
      readExpectedSeedIdentity: identity,
    }));

    const channel = await import("@/lib/planner/hydrate-seed");
    const client = await import("@/lib/planner/client");
    channel.__resetServerSeedForTests();
    channel.armServerSeed("r1");
    channel.deliverServerSeed("r1", seed("a"));

    const doc = await client.loadPlannerHydrateBundle("teacher-a");

    expect(doc).toEqual(bundle("from-backend"));
    expect(doc).not.toEqual(bundle("a"));
    expect(action).toHaveBeenCalledWith("teacher-a");
    // No identity round trip either: the disabled path is not "validate and
    // reject", it is "never ask".
    expect(identity).not.toHaveBeenCalled();
  });

  it("has SSR identity forwarding off as well", async () => {
    // The root condition, and the reason the seed could be dangerous at all —
    // gated separately so it can be reasoned about on its own. What that
    // actually does to a request is asserted where it belongs, against the real
    // constant, in tests/middleware-user-header.test.ts ("does NOT forward an id
    // at all"). This is the tripwire: flip the constant and this fails.
    const flags = await import("@/lib/planner/server-seed-enabled");
    expect(flags.SSR_USER_ID_FORWARDING_ENABLED).toBe(false);
  });

  it("the PRODUCER does no work at all — not even an auth read", async () => {
    // "RETURNED NOTHING" AND "DID NOTHING" ARE DIFFERENT, and only the second is
    // what off should mean. So this asserts the STUBS WERE NOT CALLED, not that
    // the result was `ok: false` — a `buildServerSeed` that performed the whole
    // hydrate and then discarded it would satisfy the weaker assertion while
    // still hitting the auth server and the database on every planner render.
    //
    // ⚠ `isPlannerSupabaseConfigured` is forced TRUE deliberately. Left false,
    // the function short-circuits on its mock-path branch and this test would
    // pass without the flag guard existing at all — green for a reason unrelated
    // to its subject, which is the failure mode this lane keeps finding.
    vi.resetModules();

    const getUser = vi.fn();
    const getActiveGradeLevelId = vi.fn();
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({ auth: { getUser } }),
    }));
    vi.doMock("@/lib/supabase/helpers", () => ({
      withSharedServerClient: <T,>(fn: () => T): T => fn(),
    }));
    vi.doMock("@/lib/planner/supabase-source", () => ({
      plannerSupabaseSource: { getActiveGradeLevelId },
    }));
    vi.doMock("@/lib/planner/source", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/planner/source")>()),
      isPlannerSupabaseConfigured: () => true,
    }));

    const { buildServerSeed } = await import("@/lib/planner/server-seed");
    const result = await buildServerSeed();

    // THE ASSERTIONS THAT MATTER, AND THEREFORE FIRST: no session was resolved,
    // no document was read. Asserted before the return value so that when this
    // test fails it names the property that was actually lost — a mutation that
    // re-enables the producer should report "you did work", not "your reason
    // string changed".
    expect(getUser).not.toHaveBeenCalled();
    expect(getActiveGradeLevelId).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("disabled");

    vi.doUnmock("@/lib/supabase/server");
    vi.doUnmock("@/lib/supabase/helpers");
    vi.doUnmock("@/lib/planner/supabase-source");
    vi.doUnmock("@/lib/planner/source");
  });

  it("the ORDINARY hydrate issues no extra query on the feature's behalf", async () => {
    // THE ONE THAT WOULD HAVE REACHED USERS. `getGradeSchoolId` exists only to
    // LABEL a server seed, and it was awaited inside the ordinary hydrate's
    // `Promise.all` unconditionally — so a switched-off feature still added a
    // `grade_levels` lookup to every hydrate, on the single path 100% of
    // teachers take. The `.catch` on it covered a failure, not LATENCY: a slow
    // lookup delays the document itself.
    //
    // "did nothing", not "returned null" — again. A gate that issued the query
    // and discarded the answer would satisfy `schoolId === null` while still
    // costing every teacher a round trip.
    vi.resetModules();

    const source = {
      getActiveGradeLevelId: vi.fn(async () => "grade-uuid"),
      listLessons: vi.fn(async () => []),
      listSubjects: vi.fn(async () => []),
      listUnits: vi.fn(async () => []),
      listStandards: vi.fn(async () => ({})),
      getSectionsBatch: vi.fn(async () => ({})),
      getGradeSchoolId: vi.fn(async () => "school-uuid"),
    };

    const { buildPlannerHydrateBundle } = await import(
      "@/lib/planner/hydrate-bundle"
    );
    const doc = await buildPlannerHydrateBundle(
      source as unknown as Parameters<typeof buildPlannerHydrateBundle>[0],
      "owner-uuid",
    );

    // THE ASSERTION THAT MATTERS, FIRST.
    expect(source.getGradeSchoolId).not.toHaveBeenCalled();
    // …and the document is otherwise exactly what it always was: every ordinary
    // read still issued, so this is a removed extra, not a removed feature.
    expect(source.getActiveGradeLevelId).toHaveBeenCalledTimes(1);
    expect(source.listLessons).toHaveBeenCalledTimes(1);
    expect(source.listSubjects).toHaveBeenCalledTimes(1);
    expect(source.listUnits).toHaveBeenCalledTimes(1);
    expect(source.listStandards).toHaveBeenCalledTimes(1);
    expect(doc.gradeLevelId).toBe("grade-uuid");
    // Unresolved, and safe: the only readers refuse a null school.
    expect(doc.schoolId).toBeNull();
  });

  it("refuses at the channel too, so neither end alone can re-enable it", async () => {
    // The consumer is gated in TWO places — `loadPlannerHydrateBundle` never
    // asks, and `takeServerSeed` refuses if it is asked anyway. A one-sided edit
    // must not be enough to bring the feature back.
    vi.resetModules();
    vi.stubGlobal("window", {});

    const channel = await import("@/lib/planner/hydrate-seed");
    channel.__resetServerSeedForTests();
    channel.armServerSeed("r1");
    channel.deliverServerSeed("r1", seed("a"));

    await expect(
      channel.takeServerSeed("teacher-a", async () => ({
        userId: "teacher-a",
        seam: "home" as const,
        schoolId: SCHOOL,
        revalidate: async () => "teacher-a",
      })),
    ).resolves.toBeNull();
  });
});
