// lib/planner/hydrate-seed.ts — the channel a SERVER-RENDERED hydrate arrives on.
//
// ── WHAT PROBLEM THIS SOLVES ──────────────────────────────────────────────────
// Even after the hydrate collapsed to one Server Action (lib/planner/hydrate-
// bundle.ts), the planner document could not START loading until the browser had
// downloaded and executed the app bundle, mounted React, and resolved the auth
// session — because the thing that asks for the document is a client effect.
// Measured on production (scripts/probe-f3-ttu.mjs, n=5, cold cache): the single
// hydrate POST left the browser at 1961–2519 ms, and time-to-usable was
// 10914–12916 ms. Roughly 2.5 s of that is spent BEFORE the request is even sent,
// and every millisecond of it is time the server spent idle.
//
// The server already holds the session cookie. It can start the identical read
// the instant the request arrives, while the browser is still downloading
// JavaScript. This module is how the result gets from that server render to the
// client facade that would otherwise have made the round trip.
//
// ── WHY AT THE FACADE, AND NOT IN THE STORE ───────────────────────────────────
// `lib/planner-store.tsx` owns some of the most delicate logic in the repo: the
// cancelled-vs-failed classification, the prior-owner leak guard, the retry
// budget, and a `hydrate` dispatch that REPLACES the document and resets
// undo/redo. A second way into that document is exactly where a data-loss bug
// would hide — a second `hydrate` landing after a teacher has started editing
// would discard the edit and its history.
//
// So nothing here touches the store. The seed is consumed inside
// `loadPlannerHydrateBundle` (lib/planner/client.ts), which the store already
// awaits: the store still performs ONE hydrate, at the same point in its
// lifecycle, from a single code path. All that changed is where the bytes came
// from. Undo/redo, the retry, the owner gating and the leak guard are untouched
// because they were never in scope.
//
// ── SERVER-SIDE MODULE STATE IS A CROSS-REQUEST LEAK, AND IS REFUSED ─────────
// Module scope in a Next server is per-PROCESS, not per-request: two teachers'
// requests share it. Parking one teacher's lessons in a module variable during
// SSR would therefore be a tenancy bug of the worst kind. Both writers below
// return immediately unless `window` exists, so the seed only ever lives in the
// browser tab it belongs to. The delivering component renders on the server too
// (that is how its props cross the wire) — it just does not store anything
// there; the value is captured when React runs the same component in the
// browser.

import type { PlannerHydrateBundle } from "./hydrate-bundle";
import { PLANNER_SERVER_SEED_ENABLED } from "./server-seed-enabled";

/**
 * WHICH TENANT'S DOCUMENT THIS IS — the seed's identity, not a description of it.
 *
 * `ownerId` alone cannot answer that question. Multi-workspace has been live in
 * production since 2026-07-24, so a teacher routinely belongs to more than one
 * workspace, and switching between them does not change who they are. A seed
 * built while workspace A was active and consumed after a switch to B would
 * hydrate B's chrome with A's lessons, units, subjects and standards — and every
 * owner check in this file would agree it was fine.
 *
 * So the seed states what its queries were actually scoped by, and the client
 * states what it expects, and the two must agree before a byte is handed over.
 *
 *   `seam`        — WHICH resolver produced `schoolId`. Under MULTI_WORKSPACE the
 *                   planner scopes to the ACTIVE workspace
 *                   (`auth_teacher_school_id()`); with the flag off it resolves
 *                   the teacher's HOME school and knows nothing about
 *                   workspaces. The two are different questions with different
 *                   answers, so a seed built by one build must never satisfy a
 *                   consumer running the other.
 *   `schoolId`    — `schools.id`. Always a non-empty string on an `ok: true`
 *                   seed: `buildServerSeed` refuses to produce a seed it cannot
 *                   name (see lib/planner/server-seed.ts).
 *   `gradeLevelId`— the OTHER key every read in the bundle was scoped by, mirrored
 *                   from the bundle itself. NOT compared by the consumer, and
 *                   deliberately so: resolving the active grade is part of what
 *                   the hydrate is FOR, so the client has no independent
 *                   expectation to check it against. It is carried because it is
 *                   a scoping key and a seed should be able to say what it is —
 *                   for diagnosis, and so a future notebook-scoped client has
 *                   something to compare.
 */
export interface PlannerSeedScope {
  seam: "workspace" | "home";
  schoolId: string;
  gradeLevelId: string | null;
}

/**
 * WHO IS LOOKING, and WHERE they are — resolved by the browser itself, from its
 * own Supabase session, never from the seed and never from anything the server
 * put in the page. See `readExpectedSeedIdentity` (lib/planner/seed-scope.ts).
 *
 * ── WHY `userId` IS HERE, AND WHY ITS ABSENCE WAS A REAL HOLE ─────────────────
 * `takeServerSeed` compares `result.ownerId` against the `ownerId` its caller
 * passed, and an earlier version of this file called that the security-relevant
 * check. It was not, and the comment was wrong in the way this repo keeps
 * getting caught by — it asserted a guarantee the code did not provide:
 *
 *   • `ownerId` comes from `currentUser.id` (lib/planner-store.tsx),
 *   • which `AppStateProvider` SEEDS from `initialUserId` (lib/app-state.tsx),
 *   • which is the `x-mc-user-id` header the SERVER resolved and forwarded.
 *
 * The browser's own auth subscription only corrects `currentUser` after an async
 * round trip — and the seed exists precisely so the hydrate runs BEFORE that. So
 * the check compared the server's answer against the server's answer, and could
 * not see the case it was written for: a document rendered for teacher A landing
 * in a browser whose session is now teacher B (an account switch in another tab,
 * a shared classroom laptop, a stale tab resumed after someone else signed in).
 * If A and B share a workspace the scope check passes too, and B is shown A's
 * plan — including A's personal forks. RLS cannot help: nothing was fetched
 * improperly, the wrong person is being shown a correctly-fetched document.
 *
 * `userId` is the independent reading that closes it.
 *
 * `null` (the resolver's answer for "unknown": no session, no school, a read
 * error, the prototype path) is NOT a wildcard — it REFUSES the seed. An
 * identity that could not be established is not an identity that matched.
 */
export interface ExpectedSeedIdentity {
  /** `auth.users.id` as THIS BROWSER's session reported it WHEN THIS OBJECT WAS
   *  BUILT. A snapshot — see `revalidate`. */
  userId: string;
  seam: PlannerSeedScope["seam"];
  schoolId: PlannerSeedScope["schoolId"];
  /**
   * Re-read the browser's user id, for the check that runs ADJACENT TO THE USE.
   *
   * ── WHY A SNAPSHOT IS NOT ENOUGH, AND WHY THIS IS THE SHAPE ──────────────────
   * `userId` above is read, and then the resolver awaits a workspace query
   * before returning. The session can change across that await, so by the time
   * the seed is accepted the snapshot may describe a teacher who is no longer at
   * this browser — a narrower window than the one it replaced, and the identical
   * consequence.
   *
   * Narrowing it again would be the fourth patch of the same shape. A check
   * separated from the thing it guards by an `await` is not a check, it is a
   * snapshot; the fix is to put the LAST read on the far side of every await, so
   * `takeServerSeed` can confirm the identity with nothing left to happen
   * between the confirmation and the hand-over.
   *
   * Resolves null on any failure, which refuses. Must never throw.
   */
  revalidate: () => Promise<string | null>;
}

/**
 * What the server render produced.
 *
 * `ok: false` is a FIRST-CLASS ANSWER, not an error: no session, the mock path,
 * or a failed read all resolve this way so the client falls back to the Server
 * Action it would have used anyway. Nothing here ever rejects — an unhandled
 * rejection in the seed path would take down a page that has a perfectly good
 * fallback.
 */
export type PlannerSeedResult =
  | {
      ok: true;
      ownerId: string;
      scope: PlannerSeedScope;
      bundle: PlannerHydrateBundle;
    }
  | { ok: false; reason: string };

/**
 * How long `takeServerSeed` will wait for a seed that was announced but never
 * delivered, before falling back to the Server Action.
 *
 * THIS IS A SAFETY VALVE, NOT A TIMING ASSUMPTION. The delivering component
 * cannot fail to render in normal operation — the server component that wraps it
 * catches its own errors and delivers `ok: false` — so the only way to reach this
 * bound is an aborted RSC stream, where the alternative is waiting forever behind
 * a skeleton. It is set well beyond anything measured (the pre-fix server read
 * peaked at 10.5 s on production) precisely so that it never arbitrates a normal
 * load; if it ever fires, the page degrades to exactly today's behaviour rather
 * than hanging.
 */
const SEED_DELIVERY_CEILING_MS = 20000;

type Deferred = {
  promise: Promise<PlannerSeedResult>;
  resolve: (r: PlannerSeedResult) => void;
};

/** Non-null once a server render has ANNOUNCED that a seed is coming. Null means
 *  "no seed path in play" and every consumer falls straight through. Stays
 *  non-null while a consumer awaits it, because `deliverServerSeed` still has to
 *  be able to resolve it. */
let pending: Deferred | null = null;
/**
 * A consumer has taken ownership of the seed. Set SYNCHRONOUSLY, before any
 * await, and that is the whole point of it.
 *
 * ── THE RACE THIS CLOSES (found by the §4a review gate) ───────────────────────
 * `spent` below is set AFTER the await, so it cannot arbitrate between two
 * consumers that arrive while the seed is still streaming. That window is
 * reachable and its consequence is a wrong-workspace document:
 *
 *   1. The store's hydrate effect runs, calls in here, and blocks on the seed.
 *   2. Before it resolves, the teacher switches workspace. The workspace epoch
 *      bumps, the effect re-runs, and its first attempt is abandoned (`alive`
 *      goes false, so its result is discarded).
 *   3. The SECOND attempt calls in here with the SAME `ownerId` — a workspace
 *      switch does not change who you are — so an owner check cannot separate
 *      them. Without a synchronous claim it would await the same deferred and
 *      hydrate the NEW workspace with the OLD workspace's lessons and catalog.
 *
 * With the claim, the second caller sees the seed already taken, returns null,
 * and reads the new workspace from the backend. The abandoned first caller may
 * still resolve; its result is discarded by the store's own `alive` guard.
 *
 * ⚠ THE CLAIM IS NOT AN ACCESS CONTROL, AND WAS NEVER ASKED TO BE. It arbitrates
 * between two COMPETING consumers; it says nothing about a single LATE one — a
 * hydrate that arrives after a workspace change and claims a seed built before
 * it. An earlier revision of this file argued that case away from mount ordering
 * (nothing listens for `WORKSPACE_CHANGED_EVENT` until `PlannerProvider` has
 * mounted, and its first hydrate effect claims the seed on that same mount).
 * That argument is a timing property of one component tree, not a guarantee, and
 * the §4a gate was right to refuse it: ordering is not access control, and the
 * data at stake is a whole planner document from the wrong workspace. The seed
 * now carries `scope` (see `PlannerSeedScope`) and `takeServerSeed` compares it
 * against the consumer's OWN resolved identity before returning a byte, so the
 * late-claimant case is closed by identity rather than by ordering. The claim
 * below stays for what it does do: making the channel one-shot.
 */
let claimed = false;
/** Set once a consumption has FINISHED. Distinct from `claimed`: it is what
 *  stops `armServerSeed` re-arming a deferred nobody will ever deliver after the
 *  seed has been used (see the re-render test). */
let spent = false;
/**
 * Which SERVER RENDER the current channel belongs to.
 *
 * ── WHY THE LATCH IS PER-RENDER AND NOT PER-DOCUMENT ─────────────────────────
 * The latch used to be permanent, which was wrong in both directions:
 *
 *   TOO PERMISSIVE. A seed built by one page render could, in principle, be
 *   claimed by a hydrate belonging to a different workspace — the case the §4a
 *   gate raised twice. A workspace switch does not change `ownerId`, so the
 *   owner check cannot separate them, and the synchronous claim only arbitrates
 *   between COMPETING consumers, not a single late one.
 *
 *   TOO RESTRICTIVE, AND THIS ONE COST REAL TIME. A document hosts more than one
 *   planner mount: leaving for /settings (a different route group) unmounts the
 *   planner layout, and returning re-renders it on the server. With a permanent
 *   latch that second render still performed the whole hydrate — and then found
 *   the channel spent and threw the result away, so the teacher paid the client
 *   round trip anyway. Every planner navigation after the first was unseeded.
 *
 * Keying the channel to the render that produced it fixes both: a new render
 * supersedes the previous channel outright, and a seed can only ever be consumed
 * by a hydrate that started after it. The id is generated once per server render
 * of the planner layout and handed to BOTH halves of the handshake, so the gate
 * and the deliverer can only ever agree about the same render.
 */
let renderId: string | null = null;

/**
 * Announce that a server-rendered seed is on its way.
 *
 * ── THIS RUNS DURING RENDER, AND IT HAS TO ────────────────────────────────────
 * Arming is a render side effect, which React does not promise to run exactly
 * once: a render can be started and ABANDONED (a transition the user navigates
 * away from, a Suspense retry), and a discarded render still armed the channel.
 * The §4a gate raised that, correctly, as a mutation-during-render.
 *
 * MOVING IT TO AN EFFECT MAKES IT WORSE, NOT BETTER, and the reason is worth
 * writing down so the next person does not have to rediscover it. The gate ships
 * in the FIRST flush and never suspends; the DELIVERER (`PlannerServerSeed`)
 * awaits the database behind a Suspense boundary and therefore commits later, in
 * a later flush. Arming during render guarantees the arm precedes any delivery
 * from the same render. Arming on commit does not: on a `router.refresh()` the
 * new render's deliverer can reach `deliverServerSeed` while `renderId` is still
 * the OLD id, get dropped as stale, and then the gate's effect arms a channel
 * nobody will ever deliver to — a stall on EVERY refresh instead of a rare one.
 * The ordering the render-time arm buys is the whole mechanism.
 *
 * So the exposure is handled where it actually bites — below — rather than by
 * moving the arm. An abandoned render can still take the channel from a live
 * waiter; what it can no longer do is leave that waiter hanging.
 *
 * ⚠ KNOWN, ACCEPTED, AND NOT A TOTAL ORDER (§4a gate, Medium — deferred
 * deliberately, not overlooked). "Newer" here means ARRIVED LATER, not
 * LOGICALLY LATER. `renderId` is a `crypto.randomUUID()` minted per server
 * render of the planner layout: it carries identity but no ordering, so this
 * function cannot tell a fresh render from a logically-OLDER one whose client
 * chunk happened to execute late (a slow chunk, a re-ordered stream). Such a
 * render would supersede a live channel it should have yielded to.
 *
 * The consequence is bounded to a MISSED OPTIMISATION: the superseded waiter is
 * released immediately (below) and falls back to the Server Action, which is
 * what shipped before this feature existed. No wrong document can result — the
 * seed's own `scope` check decides what may be consumed, and it is independent
 * of arrival order.
 *
 * Making it a total order needs an ORDERING TOKEN the client owns, because the
 * server cannot supply one: a monotonic navigation epoch incremented in the
 * browser and compared here (`if (epoch < currentEpoch) return`). That is a
 * larger change than the exposure justifies, so it is written down rather than
 * built.
 *
 * Idempotent: re-renders re-enter this and must not replace a deferred that a
 * consumer is already awaiting.
 */
export function armServerSeed(id: string): void {
  if (typeof window === "undefined") return; // see the tenancy note above
  if (renderId === id) {
    // Same render re-rendering (a parent state change, a StrictMode double
    // render). Must NOT replace a deferred a consumer is already awaiting, and
    // must not un-spend a seed that has already been used.
    return;
  }
  // A NEW server render supersedes whatever the previous one left behind —
  // including a spent latch, which is what makes a second planner navigation
  // seedable.
  const superseded = pending;
  renderId = id;
  claimed = false;
  spent = false;
  let resolve!: (r: PlannerSeedResult) => void;
  const promise = new Promise<PlannerSeedResult>((r) => {
    resolve = r;
  });
  pending = { promise, resolve };

  // ── RELEASE THE OLD RENDER'S WAITER NOW, INSTEAD OF IN 20 SECONDS ──────────
  // A consumer that claimed the previous channel is still awaiting its deferred,
  // and it no longer owns anything: the deliverer for its render will be dropped
  // as stale by `deliverServerSeed`, so nothing will ever resolve it. Before
  // this, it sat out the full `SEED_DELIVERY_CEILING_MS` before falling back —
  // a 20-second skeleton for a teacher, caused by a render they never saw. This
  // is reachable without a workspace switch (any `router.refresh()` re-renders
  // the layout and mints a new id) and it is exactly the abandoned-render case
  // the gate described, where no newer hydrate arrives to make the stall moot.
  //
  // It publishes NO DATA — a refusal only, so the waiter falls back to the
  // Server Action it would have used if the seed had never existed. Resolving an
  // unclaimed deferred is inert, and resolving one whose waiter has already
  // settled is a no-op, so this needs no claim bookkeeping of its own.
  superseded?.resolve({ ok: false, reason: "superseded by a newer render" });
}

/**
 * Hand over the server-rendered result. Idempotent — resolving an already
 * settled promise is a no-op, so a re-render cannot swap the payload underneath
 * a consumer.
 */
export function deliverServerSeed(id: string, result: PlannerSeedResult): void {
  if (typeof window === "undefined") return; // see the tenancy note above
  if (renderId !== id) {
    // Either the gate for this render has not run (it ships in the first flush,
    // so this should be unreachable) or a NEWER render has already superseded
    // this one. Arming here covers the first case; the second is a stale
    // payload that must be dropped rather than published to the current channel.
    if (renderId === null) armServerSeed(id);
    else return;
  }
  pending?.resolve(result);
}

/**
 * Is `key` the object's OWN property — not something it inherited?
 *
 * ⚠ WITHOUT THIS, A PROTOTYPE SATISFIES THE CHECKS. Every value validated in
 * this module arrives as plain JSON across an RSC wire, and a plain read
 * (`scope.schoolId`) consults the prototype chain, so an object carrying nothing
 * of its own but inheriting matching values passes. Low severity — producing one
 * requires control of the payload — but it is the same shape of defect as
 * everything else here (a check that appears to inspect the thing and does not),
 * and `isClientCallable` in ./dispatch-surface already guards exactly this way.
 * Consistency is the point: a reader should not have to work out which of the
 * two styles a given check uses.
 */
function own(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** `own`, plus the value being a non-empty string — the shape every id here
 *  must have before it is compared to anything. */
function ownString(obj: object, key: string): boolean {
  if (!own(obj, key)) return false;
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0;
}

/**
 * Does a seed's stated identity match what the consumer is hydrating FOR?
 *
 * FAILS CLOSED AT EVERY STEP, and each step is a separate way to be wrong:
 *
 *   • The consumer could not establish its own identity (`expected` is null — no
 *     session, no school, a failed read). Unknown is not "matches"; a seed is an
 *     optimisation and the backend read is right there.
 *   • The seed does not state one. TypeScript says `scope` is always present,
 *     but this value CROSSES THE RSC WIRE as plain JSON from whatever build
 *     rendered the page — a stale worker, a half-rolled deploy — so the type is
 *     an intention on this side of the seam and a runtime check is the only
 *     thing that holds on the other. A missing or empty field is refused, never
 *     read as a match.
 *   • The two disagree about which seam produced the id. `workspace` (the ACTIVE
 *     workspace) and `home` (the teacher's home school) are different questions;
 *     equal uuids from different questions are not an agreement.
 *   • The ids differ — the case this whole mechanism exists for.
 */
function scopeAccepted(
  scope: PlannerSeedScope | null | undefined,
  expected: ExpectedSeedIdentity | null,
): boolean {
  if (!expected) return false;
  if (!scope) return false;
  if (!ownString(scope, "schoolId")) return false;
  if (!ownString(expected, "schoolId")) return false;
  if (!own(scope, "seam") || !own(expected, "seam")) return false;
  if (scope.seam !== expected.seam) return false;
  return scope.schoolId === expected.schoolId;
}

/**
 * Does the BROWSER's own session agree that this document is for the person
 * looking at it?
 *
 * Compared against BOTH ids on purpose, though they are equal by the time this
 * runs. `ownerId` is what the store asked for and `result.ownerId` is what the
 * server built; asserting the browser matches each of them separately means
 * deleting either of the other checks cannot silently widen this one. See
 * `ExpectedSeedIdentity` for why the pre-existing `ownerId` comparison was not
 * an independent check at all.
 */
function browserIdentityAgrees(
  identity: ExpectedSeedIdentity | null,
  requestedOwnerId: string,
  seedOwnerId: string,
  // A type predicate, so the caller's later use of `identity` — notably the
  // final re-read — cannot be reached without having passed through here.
): identity is ExpectedSeedIdentity {
  if (!identity) return false;
  if (!ownString(identity, "userId")) return false;
  if (identity.userId !== requestedOwnerId) return false;
  return identity.userId === seedOwnerId;
}

/**
 * THE LAST THING BEFORE THE BUNDLE IS HANDED OVER: is the browser still signed
 * in as the teacher every check above was about?
 *
 * Deliberately placed after every other await in `takeServerSeed` rather than
 * folded into the identity read, because the whole class of defect this lane
 * kept producing is a guard separated from its use by an await — the before/
 * after bracket around the server read, the label that outlived the data it
 * described, the owner id that traced back to the server, the identity snapshot
 * taken before a workspace query. Each was fixed by narrowing a window. This one
 * closes by position instead: nothing awaits between this answer and the
 * `return`.
 *
 * ⚠ WHAT IT DOES NOT CLOSE, STATED PLAINLY. The caller still has work to do
 * after this returns — `loadPlannerHydrateBundle` resolves, the store dispatches
 * a hydrate — and a session can change during that too. That residual is not
 * removable here and it is not specific to the seed: it is exactly the residual
 * the ordinary Server-Action path carries, guarded by the store's own `alive`
 * and prior-owner checks. The bar this meets is that the fast path is no longer
 * WORSE than the path it replaces.
 *
 * Never throws — a failed re-read is "unknown", which refuses.
 */
async function identityStillHolds(
  identity: ExpectedSeedIdentity,
): Promise<boolean> {
  if (typeof identity.revalidate !== "function") return false;
  let current: string | null;
  try {
    current = await identity.revalidate();
  } catch (err) {
    console.debug("[planner] seed identity re-read failed; ignoring the seed", err);
    return false;
  }
  if (typeof current !== "string" || current.length === 0) return false;
  return current === identity.userId;
}

/**
 * Is the label TRUE OF THE BUNDLE IT ARRIVED WITH?
 *
 * ── WHY THIS IS NOT REDUNDANT WITH `scopeAccepted` ────────────────────────────
 * `scopeAccepted` asks whether the seed's CLAIM matches what the consumer
 * expects. It takes the claim at its word. In-process the claim is sound by
 * construction — `buildServerSeed` reads `scope.schoolId` straight off
 * `bundle.schoolId`, which `buildPlannerHydrateBundle` resolved from the grade
 * its reads were scoped by — but that invariant is established on the SERVER
 * side of an RSC wire and was never re-established on this side. A payload
 * claiming workspace B while carrying A's bundle satisfied every check in this
 * module.
 *
 * The case worth two lines is not a crafted payload — anyone who can inject into
 * the RSC stream has already won — it is a MIXED DEPLOYMENT: a half-rolled
 * release serving HTML from one artifact to a browser holding JS from another,
 * where a valid-but-legacy label rides along with a bundle built under different
 * rules. That is the same scenario `seam` exists to survive, one level down.
 *
 * So the by-construction property is re-checked where it lands rather than
 * assumed to have travelled: the label must describe THIS bundle.
 *
 * BOTH SCOPING KEYS ARE COMPARED, and the grade is compared here even though
 * `scopeAccepted` deliberately does not gate on it. The two are different
 * questions: the consumer has no independent expectation for a grade (resolving
 * it is what the hydrate is FOR), so it cannot be checked against the CLIENT —
 * but it can be checked for internal consistency against the bundle it labels,
 * where no outside knowledge is needed.
 *
 * Nulls are handled explicitly rather than by `===`, which would happily accept
 * `null === null`. A published seed always has both keys: `buildServerSeed`
 * refuses a bundle with no school, and the bundle only resolves a school when a
 * grade resolved first. A seed missing either is incoherent, and incoherent
 * fails closed.
 */
function scopeDescribesBundle(
  scope: PlannerSeedScope | null | undefined,
  bundle: PlannerHydrateBundle | null | undefined,
): boolean {
  if (!scope || !bundle) return false;
  if (!ownString(bundle, "schoolId")) return false;
  if (!ownString(scope, "schoolId")) return false;
  if (bundle.schoolId !== scope.schoolId) return false;
  if (!ownString(scope, "gradeLevelId")) return false;
  if (!own(bundle, "gradeLevelId")) return false;
  return scope.gradeLevelId === bundle.gradeLevelId;
}

/**
 * The bundle for `ownerId` if the server produced one FOR THE SAME TENANT, else
 * null.
 *
 * TWO CHECKS, AND BOTH ARE THE SECURITY-RELEVANT HALF OF THIS MODULE.
 *
 * WHO. Two comparisons, and only the second one is independent — an earlier
 * version of this comment claimed the first was, which was wrong. `ownerId` and
 * `result.ownerId` BOTH originate in the server's `getUser()`, forwarded into
 * the page as `x-mc-user-id`, so comparing them catches an internally
 * inconsistent payload and nothing else. The check that can actually see a
 * document rendered for teacher A arriving in teacher B's browser is
 * `browserIdentityAgrees`, which reads THIS BROWSER's session. See
 * `ExpectedSeedIdentity` for the full chain and the failure it closes.
 *
 * WHERE. The owner check cannot see a workspace switch at all — the same teacher
 * is on both sides of it — and multi-workspace has been live in production since
 * 2026-07-24, so teachers really do hold several. `expectScope` is the
 * consumer's own answer to "which workspace am I hydrating?", resolved from its
 * own session (never from the seed), and a seed that cannot prove it was built
 * for that workspace is discarded.
 *
 * `expectScope` is a THUNK, not a value, for two reasons. It must not run when
 * there is no seed to check — the common case on every re-hydrate, where a
 * request whose answer nobody reads would be pure cost. And when there IS a
 * seed, starting it immediately after the claim lets it overlap the wait for a
 * seed that is usually still streaming, so the check is normally free rather
 * than serialised in front of the hydrate it is protecting.
 *
 * A mismatch is not an error: the caller falls through to the Server Action it
 * would have used if the seed had never existed.
 */
export async function takeServerSeed(
  ownerId: string,
  expectScope: () => Promise<ExpectedSeedIdentity | null>,
): Promise<PlannerHydrateBundle | null> {
  // THE CONSUMER HALF OF THE SWITCH (./server-seed-enabled). Off, nothing is
  // ever accepted — and the producer is gated too, so the channel is empty
  // anyway. Both are gated so a one-sided edit cannot bring the feature back
  // silently. First line of the function, before the claim, so a disabled build
  // does not even mark a seed as consumed.
  if (!PLANNER_SERVER_SEED_ENABLED) return null;
  if (!pending || claimed || spent) return null;
  // CLAIM BEFORE THE FIRST AWAIT. `pending` deliberately stays non-null —
  // `deliverServerSeed` still needs to resolve it — so the claim is what makes
  // this one-shot, not the nulling. See the `claimed` declaration for the
  // wrong-workspace race this closes.
  claimed = true;
  const waiting = pending;

  // Started NOW so it overlaps the delivery wait. Its rejection is swallowed
  // here rather than at the callsite: an unawaited rejection on a path the seed
  // check may never reach (the ceiling below returns early) would surface as an
  // unhandled rejection, and a hydrate must never fail because an optimisation's
  // safety check did. A failed check is simply "unknown", which refuses.
  let expected: Promise<ExpectedSeedIdentity | null>;
  try {
    expected = Promise.resolve(expectScope()).catch((err) => {
      console.debug("[planner] seed scope check failed; ignoring the seed", err);
      return null;
    });
  } catch (err) {
    console.debug("[planner] seed scope check threw; ignoring the seed", err);
    expected = Promise.resolve(null);
  }

  let result: PlannerSeedResult;
  try {
    result = await Promise.race([
      waiting.promise,
      new Promise<PlannerSeedResult>((r) =>
        setTimeout(
          () => r({ ok: false, reason: "delivery ceiling" }),
          SEED_DELIVERY_CEILING_MS,
        ),
      ),
    ]);
  } catch {
    // Defensive: nothing above rejects, but a hydrate must never fail because
    // an optimisation did.
    result = { ok: false, reason: "seed threw" };
  }

  // ── RELEASE ONLY WHAT IS STILL OURS (§4a gate, Medium) ──────────────────────
  // Spend the seed whatever the outcome: a rejected or failed seed must not be
  // re-examined by a later hydrate, and a consumed one must not be replayed.
  //
  // BUT ONLY IF THIS WAITER STILL OWNS THE CHANNEL. A consumer from render r1
  // keeps its own `waiting` reference after r2 has superseded the channel. When
  // r1 finally hits the 20 s ceiling, an unconditional `pending = null` would
  // destroy r2's LIVE deferred: r2's `deliverServerSeed` would then resolve
  // nothing, and the hydrate awaiting it would sit out its own full ceiling
  // before falling back — the teacher paying, occasionally and unreproducibly,
  // exactly the latency this feature exists to remove. Comparing the deferred
  // identity (not the render id) is the precise test: it is the object the
  // waiter actually raced.
  if (pending === waiting) {
    spent = true;
    pending = null;
  }

  if (!result.ok) return null;
  if (result.ownerId !== ownerId) return null;

  const identity = await expected;
  // WHO IS LOOKING — the browser's own reading, not the server's forwarded one.
  // Both of the ids above trace back to the same server answer (see
  // `ExpectedSeedIdentity`), so without this the owner check compared the server
  // to itself and a document rendered for A could land in B's browser.
  if (!browserIdentityAgrees(identity, ownerId, result.ownerId)) return null;
  // Is the payload internally coherent — does its label describe its bundle? —
  // BEFORE asking whether that label is the one we want. A label that is not
  // true of what it arrived with is worth nothing even when it says the right
  // thing.
  if (!scopeDescribesBundle(result.scope, result.bundle)) return null;
  if (!scopeAccepted(result.scope, identity)) return null;

  // ⚠ THIS MUST BE THE LAST AWAIT, AND THE NEXT LINE MUST BE THE `return`.
  // Every check above ran against an identity read BEFORE the workspace query
  // that produced it, so each one is an assertion about a past moment. This
  // re-reads the browser's session with nothing left to happen afterwards, which
  // is the only way a check about "now" stays true at the point of use. Adding
  // any await between here and the return re-opens the window this closes.
  if (!(await identityStillHolds(identity))) return null;
  return result.bundle;
}

/** Test-only reset. The channel is module state by design (it bridges two
 *  components that never meet in the tree), so a suite that exercises more than
 *  one scenario needs a way back to a clean slate. */
export function __resetServerSeedForTests(): void {
  pending = null;
  claimed = false;
  spent = false;
  renderId = null;
}
