// lib/planner/server-seed-enabled.ts — the switch for the server-rendered
// planner seed, and for the SSR identity forwarding it was built on.
//
// ⚠ BOTH ARE OFF, AND FLIPPING EITHER IS A REVIEWED CODE CHANGE — NOT CONFIG.
// Deliberately plain module constants: not `process.env`, not `NEXT_PUBLIC_*`,
// nothing a deploy setting can move. Turning these on means a commit, a diff,
// and someone reading the conditions below and asserting they are met. The
// feature they gate is a performance optimisation whose failure mode is one
// teacher seeing another teacher's plan; that is not a knob.
//
// ── WHAT THE FEATURE IS ───────────────────────────────────────────────────────
// The planner document, read during the page's SERVER render and handed to the
// client so the browser does not repeat the round trip. Measured on production
// (scripts/probe-f3-ttu.mjs, n=5, cold): the hydrate POST could not leave the
// browser until 1961–2519 ms, all of it time the server spent idle holding the
// session cookie it needed to answer. The saving is real and it is worth having.
//
// ── WHY IT IS OFF ─────────────────────────────────────────────────────────────
// The fast path is STRICTLY LESS STRICT than the path it replaces, and that is
// the whole reason:
//
//   • The ordinary path round-trips through a Server Action, so every row is
//     re-scoped by RLS under the browser's own cookies. Safety is a property of
//     the transport — it does not depend on any check we wrote.
//   • The seed path skips that round trip. Acceptance therefore rests on the
//     client comparing identities, and its strongest available reading is a
//     LOCAL `getSession()` — which can be stale, expired, or revoked. Detecting
//     divergence between two legitimate sessions is what that read is good for;
//     being the authorization boundary is not.
//
// So the seed cannot be "as safe as" the fallback by adding more comparisons.
// Ten review rounds produced two cross-user HIGHs and a string of Mediums, all
// the same shape: an identity checked at one moment and used at another. Each
// fix was correct and each revealed the next instance.
//
// ── THE ROOT CONDITION, WHICH OUTLIVES THE SEED ───────────────────────────────
// `currentUser.id` is the SERVER's answer — the `x-mc-user-id` header, via
// `initialUserId` (lib/app-state.tsx) — for the whole window between mount and
// the browser's own auth subscription resolving. The seed did not introduce
// that; it inherited it, and it was simply the one consumer that ACTED on that
// identity without a server round trip to correct it.
//
// That is why `SSR_USER_ID_FORWARDING_ENABLED` is off too. Leaving forwarding on
// would keep the condition while removing only its most visible consumer — and
// the other readers of `currentUser.id` in that window have never been audited.
// With it off, `initialUserId` is null, `currentUser` stays FALLBACK_USER until
// the browser confirms who it is, and the app behaves exactly as it did before
// any of this work: correct, and one auth round trip slower.
//
// ⚠ The middleware's defensive STRIP of an inbound `x-mc-user-id` stays ON
// unconditionally (lib/supabase/middleware.ts). It costs nothing, and it means a
// forged header cannot reach a render even now that nothing legitimately sets
// one. Do not couple that to this flag.
//
// ── WHAT MUST BE TRUE BEFORE EITHER GOES ON ───────────────────────────────────
// All four, and the last one has never been done at all:
//
//   1. THE RECONCILIATION GATE, one level up. When the browser's session
//      resolves and disagrees with `initialUserId`, the WHOLE document is stale —
//      chrome, name, seed, every `currentUser.id` consumer — and the honest
//      response is to discard and re-render it, not to have each consumer defend
//      itself. In `AppStateProvider`, with its own review (a flapping session
//      must not produce a redirect loop).
//   2. WORKSPACE RE-VALIDATED AT THE FINAL CHECK. `identityStillHolds` re-reads
//      the USER but not the WORKSPACE, so a same-user A→B workspace switch inside
//      the last gap passes every check — the original HIGH, resurfacing at the
//      revalidate step. Known, deferred with the feature, and part of turning it
//      on.
//   3. THE ACCEPTANCE BOUNDARY RECONSIDERED. Either the seed is validated by
//      something with the authority the round trip had, or its weaker guarantee
//      is accepted explicitly and in writing by whoever owns the risk.
//   4. LIVE VERIFICATION ON A DEPLOYED BUILD. None of this has ever run outside
//      the mock path — localhost has no Supabase planner backend, so `getSession`
//      behaviour in a stale tab, cross-tab session flipping, and the seed path
//      end-to-end are all REASONED AND STUBBED, never observed. Turning this on
//      without that is turning on an untested code path.
//
// Everything the feature needs is committed and fully tested; the tests force
// these on locally. Nothing here is a revert — it is a switch.

/**
 * Whether the planner hydrate may be served from the SERVER-RENDERED seed
 * instead of the client's own Server Action round trip.
 *
 * OFF. Gates BOTH ends — the producer (`app/(planner)/layout.tsx` renders no
 * seed components) and the consumer (`takeServerSeed` refuses, and
 * `loadPlannerHydrateBundle` never asks). Either alone is enough to make the
 * feature inert; both are gated so a one-sided edit cannot switch it back on by
 * accident.
 */
export const PLANNER_SERVER_SEED_ENABLED = false;

/**
 * Whether middleware forwards its resolved auth user id to the render on
 * `x-mc-user-id`, seeding `currentUser.id` before the browser has confirmed who
 * it is.
 *
 * OFF, and separately from the seed on purpose: it is the ROOT CONDITION rather
 * than a consumer of it (see the header above). The seed cannot work without it,
 * so turning the seed on requires turning this on first — and this one needs
 * condition 1 above, because it is what that gate exists to reconcile.
 *
 * Does NOT gate the middleware's strip of an INBOUND header. That stays
 * unconditional.
 */
export const SSR_USER_ID_FORWARDING_ENABLED = false;
