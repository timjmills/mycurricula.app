// planner-server-seed.test.ts — what a server-rendered seed is allowed to CLAIM.
//
// ── THE FINDING THIS FILE EXISTS FOR ─────────────────────────────────────────
// The seed carries a workspace identity so the client can refuse a document
// built for a workspace it is no longer in (lib/planner/hydrate-seed.ts). The
// first version of that label was produced by BRACKETING the read: resolve the
// teacher's active-workspace pointer, run the ~4.4 s hydrate, resolve it again,
// publish only if it had not moved.
//
// A bracket cannot observe the middle of what it brackets. A switch to another
// workspace and back inside that window passed the check, and the seed then
// asserted an identity the code had never verified — a check that passes while
// the data came from somewhere else, which is the exact defect class the whole
// mechanism exists to remove.
//
// The fix is not a tighter bracket, it is a different SOURCE for the label:
// `buildPlannerHydrateBundle` now reports the school that owns the grade its
// reads were actually scoped by, and the seed is labelled with THAT. A grade
// does not change schools, so there is no window left to slip through. These
// tests pin that the label really does come from the bundle, and that a bundle
// which cannot be named is never published.
//
// The infrastructure below the seam is stubbed (there is no `next/headers` here
// and no database); `buildServerSeed` and `buildPlannerHydrateBundle` are the
// real thing.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlannerDataSource } from "@/lib/planner/source";

const OWNER = "owner-uuid";
const GRADE = "grade-uuid";
const SCHOOL = "school-uuid";

// FORCE-ENABLED. `buildServerSeed` now gates itself on the shipped switch
// (lib/planner/server-seed-enabled.ts, OFF), so without this every test below
// would assert against a function that returns `{ ok: false, reason: "disabled" }`
// before doing anything. The labelling logic stays fully covered so turning the
// feature on is a reviewed flip; `tests/planner-seed-disabled.test.ts` asserts
// the OFF behaviour — including that the producer does no work — against the
// real constant.
vi.mock("@/lib/planner/server-seed-enabled", () => ({
  PLANNER_SERVER_SEED_ENABLED: true,
  SSR_USER_ID_FORWARDING_ENABLED: true,
}));

const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  authError: null as { message: string } | null,
  /** What the stubbed source reports for the grade's school. */
  gradeSchoolId: null as string | null,
  /** Records the grade id the label lookup was keyed on. */
  schoolLookupArgs: [] as string[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: h.user },
        error: h.authError,
      }),
    },
  }),
}));

// The per-request client-sharing wrapper is a pass-through here: it exists to
// make the real reads share one Supabase client, and there is no client.
vi.mock("@/lib/supabase/helpers", () => ({
  withSharedServerClient: <T,>(fn: () => T): T => fn(),
}));

vi.mock("@/lib/planner/source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/planner/source")>()),
  isPlannerSupabaseConfigured: () => true,
}));

// The planner source itself — server-only in production (it pulls
// `next/headers`), so the seam is stubbed and the BUNDLE above it is real.
vi.mock("@/lib/planner/supabase-source", () => ({
  plannerSupabaseSource: {
    getActiveGradeLevelId: async () => GRADE,
    listLessons: async () => [],
    listSubjects: async () => [],
    listUnits: async () => [],
    listStandards: async () => ({}),
    getSectionsBatch: async () => ({}),
    getGradeSchoolId: async (gradeLevelId: string) => {
      h.schoolLookupArgs.push(gradeLevelId);
      return h.gradeSchoolId;
    },
  } as unknown as PlannerDataSource,
}));

import { buildServerSeed } from "@/lib/planner/server-seed";

describe("buildServerSeed — a seed may only claim what the read established", () => {
  beforeEach(() => {
    h.user = { id: OWNER };
    h.authError = null;
    h.gradeSchoolId = SCHOOL;
    h.schoolLookupArgs = [];
  });

  it("labels the seed with the school the BUNDLE resolved, keyed on the grade it read", async () => {
    const result = await buildServerSeed();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ownerId).toBe(OWNER);
    expect(result.scope.schoolId).toBe(SCHOOL);
    expect(result.scope.gradeLevelId).toBe(GRADE);
    // BY CONSTRUCTION, and this is the assertion that says so: the identity was
    // looked up with the grade the reads were scoped by — not by asking where
    // the teacher is now, which is a question whose answer can change while the
    // read is running.
    expect(h.schoolLookupArgs).toEqual([GRADE]);
    // And the label agrees with the bundle it travels with, rather than being a
    // second opinion about it.
    expect(result.scope.schoolId).toBe(result.bundle.schoolId);
  });

  it("REFUSES to publish a bundle it cannot name", async () => {
    // The fail-closed end. A grade whose school is unreadable — RLS refusing it
    // because the teacher's active workspace has moved away from it is exactly
    // this case — yields no seed at all. The client falls back to the hydrate
    // action, so the cost is a round trip and never a mislabelled document.
    h.gradeSchoolId = null;

    const result = await buildServerSeed();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("scoped");
  });

  it("produces no seed when there is no session", async () => {
    h.user = null;

    const result = await buildServerSeed();

    expect(result.ok).toBe(false);
  });

  it("never throws — every failure is an ok:false the client falls back from", async () => {
    h.authError = { message: "auth server unreachable" };
    h.user = null;

    await expect(buildServerSeed()).resolves.toMatchObject({ ok: false });
  });

  it("states the SEAM its build resolves identity with", async () => {
    // `home` here because MULTI_WORKSPACE is off in this environment. The value
    // must follow the build flag, because a seed built by one seam must never
    // satisfy a consumer running the other (see `PlannerSeedScope`).
    const result = await buildServerSeed();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scope.seam).toBe("home");

    // …and with the flag on, the same code must say `workspace`.
    vi.resetModules();
    vi.doMock("@/lib/multi-workspace-flag", () => ({ MULTI_WORKSPACE: true }));
    try {
      const fresh = await import("@/lib/planner/server-seed");
      const onResult = await fresh.buildServerSeed();
      expect(onResult.ok).toBe(true);
      if (!onResult.ok) return;
      expect(onResult.scope.seam).toBe("workspace");
      expect(onResult.scope.schoolId).toBe(SCHOOL);
    } finally {
      vi.doUnmock("@/lib/multi-workspace-flag");
      vi.resetModules();
    }
  });
});
