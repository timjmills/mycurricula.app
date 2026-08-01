// planner-seed-identity.test.ts — the REAL `readExpectedSeedIdentity`, and one
// end-to-end pass through it into the seed channel.
//
// ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────
// The cross-user tests in planner-hydrate-seed.test.ts mock
// `@/lib/planner/seed-scope` wholesale. They prove the CHANNEL refuses a
// diverging identity — which is worth proving — but they exercise nothing of the
// resolver that produces it, so its no-session branch, its error branch, and its
// behaviour when the session changes mid-lookup were guarded by nothing at all.
//
// That is the same defect as the `forwardUserId` helper this repo just deleted:
// a security test asserting against a stand-in for the thing it guards. A mock
// agrees with itself forever. So the resolver is driven directly here, with only
// the Supabase browser client stubbed, and one test wires the real resolver into
// the real channel so the two halves are known to fit.
//
// MULTI_WORKSPACE is off in this environment, so the resolver takes its HOME
// branch (`teachers.school_id`). That is the branch under test; the workspace
// branch differs only in which query supplies `schoolId`, and the identity
// handling — which is what this file is about — is shared.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER_A = "teacher-a";
const USER_B = "teacher-b";
const SCHOOL = "school-uuid";

const h = vi.hoisted(() => ({
  /** Who the browser's session currently reports. Mutable mid-test on purpose. */
  sessionUserId: null as string | null,
  /** Force `getSession()` to fail. */
  sessionError: null as { message: string } | null,
  /** What `teachers.school_id` returns. */
  schoolId: null as string | null,
  /** Runs when the workspace/home-school query is issued — the hook that lets a
   *  test change the session DURING the await the snapshot spans. */
  onSchoolLookup: null as null | (() => void),
  /** How many times the session was read, so a test can prove a re-read. */
  sessionReads: 0,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => {
        h.sessionReads += 1;
        if (h.sessionError) return { data: { session: null }, error: h.sessionError };
        return {
          data: {
            session: h.sessionUserId ? { user: { id: h.sessionUserId } } : null,
          },
          error: null,
        };
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            h.onSchoolLookup?.();
            return { data: h.schoolId ? { school_id: h.schoolId } : null, error: null };
          },
        }),
      }),
    }),
  }),
}));

// The resolver no-ops unless the planner backend is configured.
vi.mock("@/lib/planner/source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/planner/source")>()),
  isPlannerSupabaseConfigured: () => true,
}));

// FORCE-ENABLED FOR THIS SUITE. The feature ships switched OFF
// (lib/planner/server-seed-enabled.ts) because its fast path is strictly less
// strict than the RLS-scoped round trip it replaces. The logic below stays fully
// covered so the switch can be flipped on review rather than rewritten, and
// tests/planner-seed-disabled.test.ts asserts the OFF behaviour against the real
// constant.
vi.mock("@/lib/planner/server-seed-enabled", () => ({
  PLANNER_SERVER_SEED_ENABLED: true,
  SSR_USER_ID_FORWARDING_ENABLED: true,
}));

import { readExpectedSeedIdentity } from "@/lib/planner/seed-scope";
import {
  __resetServerSeedForTests,
  armServerSeed,
  deliverServerSeed,
  takeServerSeed,
  type PlannerSeedResult,
} from "@/lib/planner/hydrate-seed";
import type { PlannerHydrateBundle } from "@/lib/planner/hydrate-bundle";

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

const seedFor = (userId: string, tag = "a"): PlannerSeedResult => ({
  ok: true,
  ownerId: userId,
  scope: { seam: "home", schoolId: SCHOOL, gradeLevelId: `grade-${tag}` },
  bundle: bundle(tag),
});

describe("readExpectedSeedIdentity — the real resolver", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    h.sessionUserId = USER_A;
    h.sessionError = null;
    h.schoolId = SCHOOL;
    h.onSchoolLookup = null;
    h.sessionReads = 0;
    __resetServerSeedForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetServerSeedForTests();
  });

  it("resolves who is looking and where they are", async () => {
    const identity = await readExpectedSeedIdentity(USER_A);
    expect(identity).toMatchObject({
      userId: USER_A,
      seam: "home",
      schoolId: SCHOOL,
    });
  });

  it("returns null when there is NO session", async () => {
    h.sessionUserId = null;

    expect(await readExpectedSeedIdentity(USER_A)).toBeNull();
  });

  it("does not even ask for the school when there is no session", async () => {
    // Fail closed AND fail cheap: a signed-out browser must not spend a round
    // trip resolving a workspace whose answer will be thrown away.
    h.sessionUserId = null;
    let asked = false;
    h.onSchoolLookup = () => {
      asked = true;
    };

    await readExpectedSeedIdentity(USER_A);

    expect(asked).toBe(false);
  });

  it("returns null when the session read ERRORS", async () => {
    // Unknown is not agreement. An error here must refuse, not fall through to a
    // workspace-only check that would accept any teacher in the workspace.
    h.sessionError = { message: "session storage unavailable" };

    expect(await readExpectedSeedIdentity(USER_A)).toBeNull();
  });

  it("returns null when there is no school to scope by", async () => {
    h.schoolId = null;

    expect(await readExpectedSeedIdentity(USER_A)).toBeNull();
  });

  it("returns null for an empty owner without touching the network", async () => {
    let asked = false;
    h.onSchoolLookup = () => {
      asked = true;
    };

    expect(await readExpectedSeedIdentity("")).toBeNull();
    expect(asked).toBe(false);
    expect(h.sessionReads).toBe(0);
  });

  it("re-reads the session rather than replaying the snapshot", async () => {
    // THE RACE, AT THE RESOLVER. The session is A when the identity is built and
    // B afterwards. `userId` is necessarily the old value — it was read before
    // the school lookup — so the guarantee has to come from `revalidate` going
    // back to the source. If it returned the captured value instead, the channel
    // would confirm a teacher who has already gone.
    const identity = await readExpectedSeedIdentity(USER_A);
    expect(identity?.userId).toBe(USER_A);

    h.sessionUserId = USER_B; // the account switches
    await expect(identity?.revalidate()).resolves.toBe(USER_B);
  });

  it("revalidate resolves null — never throws — when the session read fails", async () => {
    const identity = await readExpectedSeedIdentity(USER_A);
    h.sessionError = { message: "gone" };

    await expect(identity?.revalidate()).resolves.toBeNull();
  });
});

describe("the real resolver, wired into the real channel", () => {
  // The two halves are developed against each other's contracts; these prove
  // they actually fit, with nothing between them mocked.
  beforeEach(() => {
    vi.stubGlobal("window", {});
    h.sessionUserId = USER_A;
    h.sessionError = null;
    h.schoolId = SCHOOL;
    h.onSchoolLookup = null;
    __resetServerSeedForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetServerSeedForTests();
  });

  it("serves the seed when the session holds throughout (the control)", async () => {
    armServerSeed("r1");
    deliverServerSeed("r1", seedFor(USER_A));

    await expect(
      takeServerSeed(USER_A, () => readExpectedSeedIdentity(USER_A)),
    ).resolves.toEqual(bundle("a"));
  });

  it("REFUSES when the session switches during the resolver's own lookup", async () => {
    // The end-to-end version of the finding: the identity is captured as A, the
    // account switches to B while the school query is in flight, and the seed
    // built for A must not be handed to B. Nothing here is mocked between the
    // session read and the refusal.
    h.onSchoolLookup = () => {
      h.sessionUserId = USER_B;
    };

    armServerSeed("r1");
    deliverServerSeed("r1", seedFor(USER_A));

    await expect(
      takeServerSeed(USER_A, () => readExpectedSeedIdentity(USER_A)),
    ).resolves.toBeNull();
  });

  it("REFUSES when the session vanishes during the resolver's own lookup", async () => {
    h.onSchoolLookup = () => {
      h.sessionUserId = null;
    };

    armServerSeed("r1");
    deliverServerSeed("r1", seedFor(USER_A));

    await expect(
      takeServerSeed(USER_A, () => readExpectedSeedIdentity(USER_A)),
    ).resolves.toBeNull();
  });
});
