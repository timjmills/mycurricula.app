// ⚠ THIS SUITE MUST STUB `window`, AND THAT IS THE POINT, NOT A WORKAROUND.
// The channel refuses to store anything unless `window` exists — the guard that
// stops one teacher's document being parked in process-global module state
// during SSR. The repo's vitest environment is `node`, where there is never a
// window, so WITHOUT the stub below every delivery test would pass vacuously
// (null in, null out) and the tenancy test would assert a condition that was
// already true. Measured, not assumed: with the stub removed, SEVEN of these
// tests fail and "refuses to store anything when there is no window" still
// reports green — a test that cannot fail is not a test.
//
// Guards the server-seed channel (lib/planner/hydrate-seed.ts) — how a hydrate
// the SERVER performed reaches the client facade that would otherwise have made
// a round trip for it.
//
// WHY A CHANNEL AT ALL. The announcing component and the delivering component
// never meet in the React tree: the announcer must ship in the first flush
// (before the store's hydrate effect decides to fetch), and the deliverer sits
// behind a Suspense boundary because it awaits the database. Module state is the
// only thing they share — which is also what makes the tests below necessary,
// because module state on a SERVER is shared between requests.
//
// SEEN RED — each guard was deleted from the module and the suite re-run, so
// every claim below is a result rather than an intention:
//   • dropping `if (result.ownerId !== ownerId) return null` kills TWO tests:
//     "refuses a seed built for a different owner" and "spends a REJECTED seed
//     too" (2 failed / 11 passed). The wrong teacher's bundle comes back.
//   • dropping `spent = true` killed NOTHING on the first attempt — 13/13 green.
//     That is how the suite's real gap was found: clearing `pending` already
//     covers a repeat read, so the latch's only job is refusing to RE-ARM after
//     consumption, which nothing tested. "stays spent when the gate re-renders"
//     was written for it and now fails (1 failed / 12 passed) without the latch.
//     A latch that looked redundant was hiding a 20 s stall on workspace switch.
//   • removing the `window` stub from this suite's setup fails 7 of 13 — see the
//     note at the top of the file.
//   • dropping the `scopeAccepted(...)` line kills FOUR of the tenancy tests
//     below; dropping the `pending === waiting` guard around the cleanup kills
//     the superseded-channel test. Both were re-measured, and the exact failure
//     text is recorded in each test.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetServerSeedForTests,
  armServerSeed,
  deliverServerSeed,
  takeServerSeed,
  type ExpectedSeedIdentity,
  type PlannerSeedResult,
} from "@/lib/planner/hydrate-seed";
import type { PlannerHydrateBundle } from "@/lib/planner/hydrate-bundle";

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


const SCHOOL_A = "school-a-uuid";
const SCHOOL_B = "school-b-uuid";

const bundle = (
  tag: string,
  schoolId: string | null = SCHOOL_A,
): PlannerHydrateBundle => ({
  gradeLevelId: `grade-${tag}`,
  // The bundle now carries the school its reads were scoped by, and the seed's
  // label is taken FROM it — so the fixtures keep the two consistent, the way
  // `buildServerSeed` does.
  schoolId,
  lessons: [],
  subjects: [],
  units: [],
  standards: {},
  sections: {},
  sectionsFailed: false,
});

/** A well-formed `ok` seed: owner `teacher-a`, workspace A, unless overridden. */
const seed = (
  tag: string,
  over: {
    ownerId?: string;
    schoolId?: string;
    seam?: "workspace" | "home";
    /** Break the payload's INTERNAL consistency: the bundle's own school, when
     *  it is meant to disagree with the label attached to it. */
    bundleSchoolId?: string | null;
    /** Same, for the other scoping key. */
    bundleGradeLevelId?: string | null;
    /** The LABEL's grade key, when it must be something other than the default
     *  — including null, which is what `===` would wrongly call agreement. */
    scopeGradeLevelId?: string | null;
  } = {},
): PlannerSeedResult => {
  const schoolId = over.schoolId ?? SCHOOL_A;
  const carried = bundle(
    tag,
    over.bundleSchoolId === undefined ? schoolId : over.bundleSchoolId,
  );
  if (over.bundleGradeLevelId !== undefined) {
    carried.gradeLevelId = over.bundleGradeLevelId;
  }
  return {
    ok: true,
    ownerId: over.ownerId ?? "teacher-a",
    scope: {
      seam: over.seam ?? "workspace",
      schoolId,
      gradeLevelId:
        over.scopeGradeLevelId === undefined
          ? `grade-${tag}`
          : (over.scopeGradeLevelId as string),
    },
    bundle: carried,
  };
};

/**
 * The BROWSER's own identity read, stubbed — who is looking, and where they are.
 * Defaults to teacher-a in workspace A, the agreeing case, so every test that is
 * not about identity or tenancy reads as it did before these checks existed.
 * `null` stands for the resolver's "unknown", which refuses.
 */
const expecting =
  (identity: ExpectedSeedIdentity | null = identityOf()) =>
  () =>
    Promise.resolve(identity);

/**
 * The default identity with fields overridden — for the divergence cases.
 *
 * `revalidate` defaults to AGREEING with `userId`, i.e. the session did not
 * change between the resolver reading it and the seed being used. Override it to
 * model the session changing under the check.
 */
const identityOf = (
  over: Partial<ExpectedSeedIdentity> = {},
): ExpectedSeedIdentity => {
  const base = {
    userId: "teacher-a",
    seam: "workspace" as const,
    schoolId: SCHOOL_A,
    ...over,
  };
  return { ...base, revalidate: over.revalidate ?? (async () => base.userId) };
};

describe("planner server-seed channel", () => {
  beforeEach(() => {
    // Stand in for the browser the channel is only ever allowed to run in.
    // Nothing here touches a DOM API — the guard is a bare `typeof window`
    // check — so an empty object is a faithful stand-in and avoids pulling a
    // whole DOM implementation into a suite that tests module state.
    vi.stubGlobal("window", {});
    __resetServerSeedForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    __resetServerSeedForTests();
  });

  it("delivers the bundle to the owner it was built for", async () => {
    armServerSeed("r1");
    deliverServerSeed("r1", seed("a"));
    await expect(takeServerSeed("teacher-a", expecting())).resolves.toEqual(
      bundle("a"),
    );
  });

  it("refuses a seed built for a different owner", async () => {
    // THE SECURITY-RELEVANT ASSERTION. The server resolves the owner from the
    // session cookie and the client from its own Supabase session; a sign-out,
    // an account switch or a stale tab can separate them. Handing one teacher's
    // document to a store that believes it belongs to another is exactly the
    // leak the store's prior-owner guard exists to prevent — so the seed is
    // discarded and the caller falls back to the backend read.
    armServerSeed("r1");
    deliverServerSeed("r1", seed("a"));
    await expect(takeServerSeed("teacher-b", expecting())).resolves.toBeNull();
  });

  // ── IDENTITY: THE OWNER CHECK IS NOT INDEPENDENT ───────────────────────────
  // `ownerId` reaches `takeServerSeed` from `currentUser.id`, which
  // `AppStateProvider` seeds from `initialUserId`, which is the `x-mc-user-id`
  // header the SERVER resolved. So `result.ownerId === ownerId` compares the
  // server's answer to the server's answer. Only a reading of THIS BROWSER's own
  // session can see the case below.

  it("refuses a seed for teacher A when the BROWSER is signed in as teacher B", async () => {
    // THE FAILURE, EXACTLY. A page is server-rendered for A — so the seed, and
    // the `x-mc-user-id` that becomes `ownerId`, both say A. Before hydration the
    // browser's session becomes B: an account switch in another tab, a shared
    // classroom laptop, a stale tab resumed after someone else signed in. The
    // hydrate effect runs BEFORE the auth subscription can correct
    // `currentUser` — which is the entire reason the seed exists — so `ownerId`
    // is still A and the owner check is satisfied by construction.
    //
    // The workspace is SHARED, so the scope check passes too. Without the
    // browser-identity check, B is shown A's planner document, including A's
    // personal lesson forks. That is cross-USER exposure; RLS cannot see it,
    // because nothing was fetched improperly — the wrong person is being shown a
    // correctly-fetched document.
    armServerSeed("r1");
    deliverServerSeed("r1", seed("a", { ownerId: "teacher-a" }));
    await expect(
      takeServerSeed(
        "teacher-a", // the SSR-forwarded id: still A
        expecting(identityOf({ userId: "teacher-b" })), // the browser: now B
      ),
    ).resolves.toBeNull();
  });

  it("refuses when the browser has no session at all", async () => {
    // Signed out between render and hydrate. Unknown is not a match.
    armServerSeed("r1");
    deliverServerSeed("r1", seed("a"));
    await expect(
      takeServerSeed("teacher-a", expecting(null)),
    ).resolves.toBeNull();
  });

  it("refuses when the session changes AFTER the identity was resolved", async () => {
    // THE WINDOW THE SNAPSHOT LEFT OPEN. The resolver reads the session, then
    // awaits a workspace query before returning — so by the time the seed is
    // accepted its `userId` describes a past moment. Here the browser was A when
    // the identity was built and is B by the time the bundle would be handed
    // over. Only a read taken AFTER every other await can see that.
    armServerSeed("r1");
    deliverServerSeed("r1", seed("a"));
    await expect(
      takeServerSeed(
        "teacher-a",
        expecting(
          identityOf({
            userId: "teacher-a", // what the resolver saw
            revalidate: async () => "teacher-b", // who is there NOW
          }),
        ),
      ),
    ).resolves.toBeNull();
  });

  it("refuses when the session has vanished by the time the seed is used", async () => {
    armServerSeed("r1");
    deliverServerSeed("r1", seed("a"));
    await expect(
      takeServerSeed(
        "teacher-a",
        expecting(identityOf({ revalidate: async () => null })),
      ),
    ).resolves.toBeNull();
  });

  it("refuses when the re-read THROWS rather than treating it as agreement", async () => {
    armServerSeed("r1");
    deliverServerSeed("r1", seed("a"));
    await expect(
      takeServerSeed(
        "teacher-a",
        expecting(
          identityOf({
            revalidate: async () => {
              throw new Error("storage unavailable");
            },
          }),
        ),
      ),
    ).resolves.toBeNull();
  });

  it("refuses a browser identity that is present but empty", async () => {
    armServerSeed("r1");
    deliverServerSeed("r1", seed("a"));
    await expect(
      takeServerSeed("teacher-a", expecting(identityOf({ userId: "" }))),
    ).resolves.toBeNull();
  });

  // ── TENANCY: THE OWNER CHECK CANNOT SEE A WORKSPACE ────────────────────────
  // Multi-workspace has been live in production since 2026-07-24, so a teacher
  // really does hold several, and switching between them does not change who
  // they are. Every test in this block passes the owner check and must still be
  // refused.

  it("refuses a seed built for a DIFFERENT WORKSPACE, though the owner matches", async () => {
    // The finding, exactly: a page rendered while workspace A was active, a
    // switch to B before the store hydrated, and a store that would otherwise
    // fill B's chrome with A's lessons, units, subjects and standards. Same
    // teacher on both sides, so `ownerId` agrees and cannot arbitrate.
    armServerSeed("r1");
    deliverServerSeed("r1", seed("a", { schoolId: SCHOOL_A }));
    await expect(
      takeServerSeed(
        "teacher-a",
        expecting(identityOf({ schoolId: SCHOOL_B })),
      ),
    ).resolves.toBeNull();
  });

  it("refuses a seed when the consumer cannot establish its OWN workspace", async () => {
    // FAIL CLOSED. The identity read returns null for no session, no school, or
    // a failed request. "I don't know which workspace I am" must not resolve to
    // "then any workspace will do" — the fallback read is right there, and it
    // costs a round trip rather than a wrong plan.
    armServerSeed("r1");
    deliverServerSeed("r1", seed("a"));
    await expect(
      takeServerSeed("teacher-a", expecting(null)),
    ).resolves.toBeNull();
  });

  it("refuses a seed that states NO workspace identity", async () => {
    // ABSENCE IS NOT A MATCH. TypeScript says `scope` is always present, but
    // this value crosses the RSC wire as plain JSON from whatever build rendered
    // the page — a stale worker mid-deploy emits the old shape. The type is an
    // intention on this side of the seam; the runtime check is what holds on the
    // other.
    armServerSeed("r1");
    deliverServerSeed("r1", {
      ok: true,
      ownerId: "teacher-a",
      bundle: bundle("a"),
    } as unknown as PlannerSeedResult);
    await expect(takeServerSeed("teacher-a", expecting())).resolves.toBeNull();
  });

  it("refuses a seed whose workspace id is present but empty", async () => {
    // The other shape of absence, and the one a `!==` comparison alone would
    // wave through if the consumer's own id were empty too.
    armServerSeed("r1");
    deliverServerSeed("r1", seed("a", { schoolId: "" }));
    await expect(
      takeServerSeed("teacher-a", expecting(identityOf({ schoolId: "" }))),
    ).resolves.toBeNull();
  });

  it("refuses a seed resolved by a DIFFERENT SEAM, even with the same id", async () => {
    // `workspace` (the ACTIVE workspace, MULTI_WORKSPACE on) and `home` (the
    // teacher's home school, flag off) are different questions. Equal uuids from
    // different questions are a coincidence, not an agreement — and a
    // half-rolled deploy is exactly where the two builds meet.
    armServerSeed("r1");
    deliverServerSeed("r1", seed("a", { seam: "home", schoolId: SCHOOL_A }));
    await expect(
      takeServerSeed(
        "teacher-a",
        expecting(identityOf({ schoolId: SCHOOL_A })),
      ),
    ).resolves.toBeNull();
  });

  it("refuses a seed whose LABEL does not describe the bundle it arrived with", async () => {
    // The invariant that the label equals `bundle.schoolId` is established on
    // the SERVER side of the RSC wire and was never re-established here — so a
    // payload claiming workspace A while carrying a bundle built for B passed
    // every check in the module. Not a crafted-payload worry (anyone injecting
    // into the RSC stream has already won) but a MIXED DEPLOYMENT one: a
    // half-rolled release serving HTML from one artifact to a browser holding JS
    // from another, where a valid-but-legacy label rides along with a bundle
    // built under different rules.
    armServerSeed("r1");
    deliverServerSeed(
      "r1",
      seed("a", { schoolId: SCHOOL_A, bundleSchoolId: SCHOOL_B }),
    );
    // The consumer is in workspace A and the seed SAYS workspace A. Owner
    // matches, seam matches, expectation matches — and it is still refused,
    // because the bundle underneath is B's.
    await expect(
      takeServerSeed(
        "teacher-a",
        expecting(identityOf({ schoolId: SCHOOL_A })),
      ),
    ).resolves.toBeNull();
  });

  it("refuses a seed whose bundle carries no school of its own", async () => {
    armServerSeed("r1");
    deliverServerSeed("r1", seed("a", { bundleSchoolId: null }));
    await expect(takeServerSeed("teacher-a", expecting())).resolves.toBeNull();
  });

  it("refuses a seed whose label names a different GRADE than the bundle", async () => {
    // The other scoping key. It is not compared against the CLIENT — resolving
    // the grade is what the hydrate is for, so the consumer has no independent
    // expectation — but it can be checked for internal consistency against the
    // bundle it labels, which needs no outside knowledge.
    armServerSeed("r1");
    deliverServerSeed("r1", seed("a", { bundleGradeLevelId: "grade-other" }));
    await expect(takeServerSeed("teacher-a", expecting())).resolves.toBeNull();
  });

  it("does not read null === null as agreement about the grade", async () => {
    // THE CASE THE EXPLICIT NULL HANDLING EXISTS FOR, and the only one where it
    // is what refuses. The schools agree and are valid, so the label passes
    // every other check — but both grade keys are null, and `===` alone would
    // call that a match and hand over a bundle nothing had established the scope
    // of. A published seed always has a grade (the bundle only resolves a school
    // when a grade resolved first), so a seed without one is incoherent.
    armServerSeed("r1");
    deliverServerSeed(
      "r1",
      seed("a", { scopeGradeLevelId: null, bundleGradeLevelId: null }),
    );
    await expect(takeServerSeed("teacher-a", expecting())).resolves.toBeNull();
  });

  it("refuses values a payload merely INHERITS from a prototype", async () => {
    // Every field checked here arrives as plain JSON across an RSC wire, and a
    // plain read (`scope.schoolId`) walks the prototype chain — so an object
    // carrying nothing of its own but inheriting matching values satisfied the
    // comparisons. Low severity (it takes control of the payload to produce one)
    // but it is the same shape as every other defect in this file: a check that
    // appears to inspect the thing and does not. `isClientCallable`
    // (lib/planner/dispatch-surface.ts) already guards this way; this makes the
    // two consistent, so a reader need not work out which style a check uses.
    const inheritedScope = Object.create({
      seam: "workspace",
      schoolId: SCHOOL_A,
      gradeLevelId: "grade-a",
    }) as PlannerSeedResult extends { scope: infer S } ? S : never;

    armServerSeed("r1");
    deliverServerSeed("r1", {
      ok: true,
      ownerId: "teacher-a",
      scope: inheritedScope,
      bundle: bundle("a"),
    });
    await expect(takeServerSeed("teacher-a", expecting())).resolves.toBeNull();
  });

  it("refuses an inherited browser identity too", async () => {
    const inherited = Object.create({
      userId: "teacher-a",
      seam: "workspace",
      schoolId: SCHOOL_A,
    }) as ExpectedSeedIdentity;

    armServerSeed("r1");
    deliverServerSeed("r1", seed("a"));
    await expect(
      takeServerSeed("teacher-a", expecting(inherited)),
    ).resolves.toBeNull();
  });

  it("returns null when the server reported a failure", async () => {
    armServerSeed("r1");
    deliverServerSeed("r1", { ok: false, reason: "no session" });
    await expect(takeServerSeed("teacher-a", expecting())).resolves.toBeNull();
  });

  it("returns null immediately when no seed was ever announced", async () => {
    // The mock path and any non-planner route never arm. This must not wait.
    await expect(takeServerSeed("teacher-a", expecting())).resolves.toBeNull();
  });

  it("does not pay for the identity read when there is no seed to check", async () => {
    // The check is a REQUEST. Making it on every hydrate — including the common
    // case where nothing was ever armed — would spend a round trip on an answer
    // nobody reads. It is a thunk for exactly this reason.
    const probe = vi.fn(expecting());
    await expect(takeServerSeed("teacher-a", probe)).resolves.toBeNull();
    expect(probe).not.toHaveBeenCalled();
  });

  it("waits for a seed that is still streaming rather than racing it", async () => {
    // The deliverer is behind Suspense, so it can arrive AFTER the store's
    // effect has already asked. If `takeServerSeed` resolved null on an
    // unsettled seed, the hydrate would fall through to the Server Action and
    // the whole optimisation would be a no-op — while the seed still arrived,
    // paying for the read twice.
    armServerSeed("r1");
    const pending = takeServerSeed("teacher-a", expecting());
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    deliverServerSeed("r1", seed("late"));
    await expect(pending).resolves.toEqual(bundle("late"));
  });

  it("gives the seed to ONE consumer even when a second asks while it is still streaming", async () => {
    // FOUND BY THE §4a REVIEW GATE, and it is the sharpest bug in this change.
    // `spent` is set AFTER the await, so it cannot separate two consumers that
    // both arrive while the seed is in flight. That window is reachable and its
    // consequence is a WRONG-WORKSPACE DOCUMENT:
    //
    //   the store's hydrate blocks on the seed → the teacher switches workspace
    //   → the workspace epoch bumps and the effect re-runs → the second attempt
    //   asks with the SAME ownerId, because switching workspace does not change
    //   who you are, so the owner check cannot tell them apart.
    //
    // Without a synchronous claim both callers await the same deferred, both
    // receive it, and the second — the live one — hydrates the NEW workspace
    // with the OLD workspace's lessons and catalog. Exactly one of these two may
    // receive the bundle; the other must fall back to a backend read. (The scope
    // check now catches the same case by identity; this one-shot property is a
    // separate guarantee and is asserted separately.)
    armServerSeed("r1");
    const first = takeServerSeed("teacher-a", expecting());
    const second = takeServerSeed("teacher-a", expecting()); // the post-switch re-hydrate
    deliverServerSeed("r1", seed("a"));

    const [a, b] = await Promise.all([first, second]);
    const served = [a, b].filter((x) => x !== null);
    expect(served).toHaveLength(1);
    expect(served[0]).toEqual(bundle("a"));
  });

  it("spends the seed, so a later re-hydrate goes to the backend", async () => {
    // One seed serves ONE hydrate. A re-hydrate happens on an account switch or
    // a workspace switch — a different owner, or the same owner in a different
    // workspace — and replaying the page-load bytes would show the teacher the
    // workspace they just left.
    armServerSeed("r1");
    deliverServerSeed("r1", seed("a"));
    await expect(takeServerSeed("teacher-a", expecting())).resolves.toEqual(
      bundle("a"),
    );
    await expect(takeServerSeed("teacher-a", expecting())).resolves.toBeNull();
  });

  it("stays spent when the gate re-renders, instead of arming a seed nobody will deliver", async () => {
    // THE `spent` LATCH EXISTS FOR THIS CASE AND ONLY THIS CASE — found by
    // deleting it and watching every other test still pass. Clearing `pending`
    // on consumption already covers a repeat read; what `spent` prevents is
    // `armServerSeed` ARMING A SECOND TIME when the gate re-renders after the
    // seed was consumed. The deliverer has already rendered and will not run
    // again, so that second deferred would never settle, and the next hydrate —
    // an account switch, a workspace switch — would sit behind the 20 s
    // delivery ceiling before falling back to a backend read it could have made
    // immediately. A twenty-second stall on a workspace switch, from a latch
    // that looks redundant.
    //
    // Fake timers are the instrument, not a wait: the assertion is that the
    // promise settles WITHOUT any clock advancing. With the latch removed it
    // cannot, and the test times out rather than passing slowly.
    vi.useFakeTimers();
    armServerSeed("r1");
    deliverServerSeed("r1", seed("a"));
    await expect(takeServerSeed("teacher-a", expecting())).resolves.toEqual(
      bundle("a"),
    );

    armServerSeed("r1"); // the gate re-renders after the seed was spent
    let settled = false;
    const next = takeServerSeed("teacher-a", expecting()).then((v) => {
      settled = true;
      return v;
    });
    await Promise.resolve();
    expect(settled).toBe(true);
    await expect(next).resolves.toBeNull();
  });

  it("spends a REJECTED seed too, so it is not re-examined", async () => {
    armServerSeed("r1");
    deliverServerSeed("r1", seed("a"));
    await expect(takeServerSeed("teacher-b", expecting())).resolves.toBeNull();
    // Even the owner it WAS built for gets nothing now: the seed is spent.
    await expect(takeServerSeed("teacher-a", expecting())).resolves.toBeNull();
  });

  it("falls back rather than hanging when an announced seed never arrives", async () => {
    // The safety valve. An aborted RSC stream is the only way to get here; the
    // alternative to falling back is a teacher stuck behind a skeleton forever.
    vi.useFakeTimers();
    armServerSeed("r1");
    const pending = takeServerSeed("teacher-a", expecting());
    await vi.advanceTimersByTimeAsync(20000);
    await expect(pending).resolves.toBeNull();
  });

  it("does not let a timed-out waiter destroy a NEWER render's live channel", async () => {
    // §4a gate, Medium. The waiter from render r1 keeps its own deferred after
    // r2 has superseded the channel. An unconditional `pending = null` in its
    // cleanup destroys r2's ACTIVE deferred, so r2's delivery resolves nothing
    // and the hydrate awaiting it sits out its own 20 s ceiling before falling
    // back — the teacher paying, occasionally and unreproducibly, exactly the
    // latency this whole feature exists to remove.
    vi.useFakeTimers();
    armServerSeed("r1");
    const stale = takeServerSeed("teacher-a", expecting());

    armServerSeed("r2"); // a fresh server render takes over the channel
    await vi.advanceTimersByTimeAsync(20000); // r1's waiter hits the ceiling
    await expect(stale).resolves.toBeNull();

    // r2's channel must still be alive and deliverable.
    const fresh = takeServerSeed("teacher-a", expecting());
    deliverServerSeed("r2", seed("fresh"));
    await expect(fresh).resolves.toEqual(bundle("fresh"));
  });

  it("releases a superseded waiter at once instead of stalling it for 20s", async () => {
    // §4a gate, Medium: `armServerSeed` runs during RENDER, and React may
    // abandon a render (a transition the user navigates away from, a Suspense
    // retry). The abandoned render still took the channel — and the waiter it
    // orphaned will never be resolved by anyone, because the deliverer for ITS
    // render is now dropped as stale. Before this it sat out the full 20 s
    // ceiling behind a skeleton. Reachable without a workspace switch: any
    // `router.refresh()` re-renders the layout and mints a new id, and no newer
    // hydrate arrives to make the stall moot.
    //
    // Fake timers are the instrument, not a wait: the assertion is that the
    // orphan settles with NO clock advance at all.
    vi.useFakeTimers();
    armServerSeed("r1");
    const orphan = takeServerSeed("teacher-a", expecting());
    let settled = false;
    void orphan.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false); // still waiting on r1's delivery

    armServerSeed("r2"); // a newer — possibly abandoned — render takes over
    await vi.advanceTimersByTimeAsync(0); // microtasks only; the clock stands still
    expect(settled).toBe(true);
    await expect(orphan).resolves.toBeNull();

    // …and the release must not have damaged the new channel.
    const fresh = takeServerSeed("teacher-a", expecting());
    deliverServerSeed("r2", seed("fresh"));
    await expect(fresh).resolves.toEqual(bundle("fresh"));
  });

  it("ignores a re-announcement so a consumer's promise is not swapped", async () => {
    armServerSeed("r1");
    const pending = takeServerSeed("teacher-a", expecting());
    armServerSeed("r1"); // a re-render must not orphan the awaiting consumer
    deliverServerSeed("r1", seed("a"));
    await expect(pending).resolves.toEqual(bundle("a"));
  });

  it("ignores a second delivery rather than swapping the payload", async () => {
    armServerSeed("r1");
    deliverServerSeed("r1", seed("first"));
    deliverServerSeed("r1", seed("second"));
    await expect(takeServerSeed("teacher-a", expecting())).resolves.toEqual(
      bundle("first"),
    );
  });

  it("delivers even if the announcement never ran", async () => {
    // Defensive: the gate renders outside Suspense so this should be
    // unreachable, but dropping a good payload on the floor would be a silent
    // regression to the slow path.
    deliverServerSeed("r1", seed("a"));
    await expect(takeServerSeed("teacher-a", expecting())).resolves.toEqual(
      bundle("a"),
    );
  });

  it("seeds a SECOND planner navigation, not just the first page load", async () => {
    // A document hosts more than one planner mount. Leaving for /settings (a
    // different route group) unmounts the planner layout; coming back
    // re-renders it on the server, which performs the whole hydrate again. With
    // a permanent latch that second render's work was thrown away and the
    // teacher paid the client round trip anyway — the server had done the read
    // and nobody read the result. A new render supersedes the old channel.
    armServerSeed("r1");
    deliverServerSeed("r1", seed("first"));
    await expect(takeServerSeed("teacher-a", expecting())).resolves.toEqual(
      bundle("first"),
    );

    // …navigate away and back: a NEW server render of the planner layout.
    armServerSeed("r2");
    deliverServerSeed("r2", seed("second"));
    await expect(takeServerSeed("teacher-a", expecting())).resolves.toEqual(
      bundle("second"),
    );
  });

  it("drops a payload whose render has already been superseded", async () => {
    // The other side of the same coin. If a slow render's deliverer arrives
    // after a newer render has taken over the channel, publishing it would hand
    // the current hydrate a document built for a page the teacher has left —
    // the stale-workspace case the §4a gate raised.
    armServerSeed("r1");
    armServerSeed("r2"); // a newer render takes the channel
    deliverServerSeed("r1", seed("stale"));

    let settled = false;
    const pending = takeServerSeed("teacher-a", expecting()).then((v) => {
      settled = true;
      return v;
    });
    await Promise.resolve();
    expect(settled).toBe(false); // the stale delivery did NOT satisfy it

    deliverServerSeed("r2", seed("fresh"));
    await expect(pending).resolves.toEqual(bundle("fresh"));
  });

  it("refuses to store anything when there is no window", async () => {
    // TENANCY. Module scope on a Next server is per-PROCESS. If the SSR pass
    // stored the bundle it renders, two teachers' requests would share it. Both
    // writers must be inert without a `window`.
    vi.stubGlobal("window", undefined);
    armServerSeed("r1");
    deliverServerSeed("r1", seed("a"));
    // Nothing was armed and nothing was stored, so a consumer falls straight
    // through to the backend read.
    await expect(takeServerSeed("teacher-a", expecting())).resolves.toBeNull();
  });
});

// ── THE CALLER, NOT JUST THE CHANNEL ─────────────────────────────────────────
// The channel returning null is only half the requirement: the hydrate must then
// GO AND READ THE DOCUMENT, not settle for an empty one. These two run the real
// `loadPlannerHydrateBundle` with the Supabase flag on, its Server Action
// stubbed, and the identity read stubbed to agree or disagree — so the mismatch
// is the only difference between them, and the agreeing case is the control that
// proves the harness can deliver a seed at all.

describe("loadPlannerHydrateBundle — a refused seed falls through to the backend", () => {
  const SEEDED = seed("workspace-a", { schoolId: SCHOOL_A });

  async function loadWith(
    expected: ExpectedSeedIdentity | null,
    payload: PlannerSeedResult = SEEDED,
  ) {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_PLANNER_USE_SUPABASE", "1");
    vi.stubGlobal("window", {});
    const action = vi.fn().mockResolvedValue(bundle("from-backend"));
    // 'use server' modules pull next/headers, which cannot load under node.
    vi.doMock("@/lib/planner/actions", () => ({
      plannerDispatch: vi.fn(),
      plannerHydrateBundleAction: action,
    }));
    vi.doMock("@/lib/planner/seed-scope", () => ({
      readExpectedSeedIdentity: vi.fn().mockResolvedValue(expected),
    }));

    // Both halves must come from the SAME fresh module registry, or the client
    // facade would be talking to a different channel instance than the one this
    // test arms.
    const channel = await import("@/lib/planner/hydrate-seed");
    const client = await import("@/lib/planner/client");
    channel.__resetServerSeedForTests();
    channel.armServerSeed("r1");
    channel.deliverServerSeed("r1", payload);

    const doc = await client.loadPlannerHydrateBundle("teacher-a");
    return { doc, action };
  }

  afterEach(() => {
    vi.doUnmock("@/lib/planner/actions");
    vi.doUnmock("@/lib/planner/seed-scope");
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("serves the seed when the consumer's workspace agrees (control)", async () => {
    const { doc, action } = await loadWith(identityOf({ schoolId: SCHOOL_A }));
    expect(doc).toEqual(bundle("workspace-a"));
    expect(action).not.toHaveBeenCalled();
  });

  it("reads the backend when the consumer is in a different workspace", async () => {
    const { doc, action } = await loadWith(identityOf({ schoolId: SCHOOL_B }));
    // NOT workspace A's document, and not an empty one either.
    expect(doc).toEqual(bundle("from-backend"));
    expect(action).toHaveBeenCalledWith("teacher-a");
  });

  it("reads the backend when the BROWSER is a different teacher than the render", async () => {
    // The cross-user case at the caller. The SSR page and its seed are both for
    // teacher A, and `loadPlannerHydrateBundle` is called with A — because that
    // id came from the server too. Only the browser's own session says B. The
    // hydrate must go to the backend, where RLS will serve B their own document,
    // rather than hand B the bundle rendered for A.
    const { doc, action } = await loadWith(
      identityOf({ userId: "teacher-b", schoolId: SCHOOL_A }),
    );

    expect(doc).toEqual(bundle("from-backend"));
    expect(doc).not.toEqual(bundle("workspace-a"));
    expect(action).toHaveBeenCalledWith("teacher-a");
  });

  it("reads the backend when the seed's LABEL does not describe its own bundle", async () => {
    // Owner matches. Seam matches. The label matches what this consumer
    // expects. The only thing wrong is that the bundle underneath was built for
    // a different workspace than the label claims — the mixed-deployment case —
    // and the hydrate must still go to the backend rather than take it.
    const { doc, action } = await loadWith(
      identityOf({ schoolId: SCHOOL_A }),
      seed("workspace-a", {
        schoolId: SCHOOL_A,
        bundleSchoolId: SCHOOL_B,
      }),
    );

    expect(doc).toEqual(bundle("from-backend"));
    expect(doc).not.toEqual(bundle("workspace-a", SCHOOL_B));
    expect(action).toHaveBeenCalledWith("teacher-a");
  });
});
