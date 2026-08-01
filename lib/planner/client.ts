// lib/planner/client.ts — the CLIENT-SIDE planner data facade.
//
// Client components (and the planner store) import `plannerClient` — never the
// server-only Supabase source. It exposes the full PlannerDataSource. In the
// default prototype path every method delegates straight to the in-memory mock
// — byte-for-byte identical to the pre-source reducer behaviour, no server
// round-trip. When the app is explicitly pointed at a real backend
// (NEXT_PUBLIC_PLANNER_USE_SUPABASE=1, alongside a real Supabase project),
// every method instead routes through the single generic server action
// `plannerDispatch`, which runs the server-only Supabase source under the
// authed user's RLS.
//
// Implemented as a typed Proxy so the facade tracks the PlannerDataSource
// interface automatically — no per-method transcription to drift out of sync.
// Every method's args + return type are exactly the interface's (no `any`
// surfaces to callers). Next server actions accept/return serializable values,
// which every PlannerDataSource method already satisfies (plain Lesson / Unit /
// Subject / StandardsMap / LessonSectionContent objects).
//
// IMPORTANT: this module must NOT statically import `./supabase-source` (it is
// server-only — it pulls in `next/headers`). The Supabase path is reached only
// through the `plannerDispatch` server action, exactly like lib/teach/client.ts.
//
// PRIVACY (§11.4): only STRUCTURE crosses the boundary — never student names.

import type { PlannerDataSource } from "./source";
import { plannerMockSource } from "./mock-source";
import { plannerDispatch, plannerHydrateBundleAction } from "./actions";
import {
  buildPlannerHydrateBundle,
  type PlannerHydrateBundle,
} from "./hydrate-bundle";
import { takeServerSeed } from "./hydrate-seed";
import { readExpectedSeedIdentity } from "./seed-scope";
import { PLANNER_SERVER_SEED_ENABLED } from "./server-seed-enabled";

/** Whether the running app persists planner data to Supabase via the server
 *  action layer. Defaults OFF: the prototype renders against the mock. Flip on
 *  with NEXT_PUBLIC_PLANNER_USE_SUPABASE=1 once a real Supabase project is
 *  wired. Read from a NEXT_PUBLIC_ var so the client bundle can branch at load.
 *  Kept separate from the Teach flag so each surface cuts over independently. */
const USE_SUPABASE = process.env.NEXT_PUBLIC_PLANNER_USE_SUPABASE === "1";

/**
 * The client-facing planner repository. Same shape + types as
 * `PlannerDataSource`; swapping a direct mock call to `plannerClient.*` makes
 * that surface backend-capable with zero other change. A Proxy forwards each
 * method:
 *   • USE_SUPABASE → the generic server action (real backend, RLS), OR
 *   • default      → the in-memory mock directly (prototype).
 */
export const plannerClient: PlannerDataSource = new Proxy(
  {} as PlannerDataSource,
  {
    get<M extends keyof PlannerDataSource>(
      _target: PlannerDataSource,
      prop: M,
    ) {
      return (...args: Parameters<PlannerDataSource[M]>) => {
        if (USE_SUPABASE) {
          return plannerDispatch(prop, args);
        }
        const fn = plannerMockSource[prop] as (
          ...a: Parameters<PlannerDataSource[M]>
        ) => Promise<Awaited<ReturnType<PlannerDataSource[M]>>>;
        return fn.apply(plannerMockSource, args);
      };
    },
  },
);

export type { PlannerHydrateBundle };

/**
 * The planner document load as ONE call — grade + lessons + catalog + sections.
 *
 * Same branch as the Proxy above, and that is the whole point of putting it
 * here: there is exactly one place in the client bundle that decides mock vs.
 * server, so the flag can never disagree with itself.
 *
 *   • USE_SUPABASE → the bundle the SERVER already built during this page's
 *     render if one is waiting (see below), otherwise one Server Action
 *     (`plannerHydrateBundleAction`). The reads it performs run inside that
 *     single invocation, so they overlap instead of queueing. See
 *     ./hydrate-bundle.
 *   • default (the mock, which is how localhost runs) → the SAME bundle
 *     function, executed directly against `plannerMockSource` in the browser.
 *     No server action, no round trip, and the identical sequence of source
 *     calls the store made before — so the mock path is unchanged in both
 *     behaviour and cost.
 *
 * ── THE SEED SHORT-CIRCUIT, AND WHY IT IS HERE ────────────────────────────────
 * The store cannot ask for the document until React has mounted and the auth
 * session has resolved. Measured on production (scripts/probe-f3-ttu.mjs, n=5,
 * cold cache) that put the hydrate POST on the wire at 1961–2519 ms — time the
 * server spent idle holding the session cookie it needed to answer.
 * `app/(planner)/layout.tsx` therefore starts the identical read during the page
 * render, and `takeServerSeed` collects it here.
 *
 * THIS FUNCTION IS THE ONLY PLACE THAT KNOWS. The store still performs exactly
 * one hydrate, at the same point in its lifecycle, through the same call — so
 * its undo/redo reset, prior-owner leak guard, retry budget and
 * cancelled-vs-failed classification are all untouched, because none of them
 * were ever about where the bytes came from. A seed that is absent, late,
 * failed, or belongs to a different owner OR A DIFFERENT WORKSPACE returns null
 * and this falls through to the action, which is the behaviour that shipped
 * before it existed.
 */
export async function loadPlannerHydrateBundle(
  ownerId: string,
): Promise<PlannerHydrateBundle> {
  if (USE_SUPABASE) {
    // THE OTHER HALF OF THE CONSUMER GATE (./server-seed-enabled). With the
    // switch off this is the whole of the seed path: one constant, and the
    // hydrate is the Server Action round trip it has always been — re-scoped by
    // RLS under the browser's own cookies, which is the safety property the seed
    // could not match. `takeServerSeed` refuses independently.
    if (!PLANNER_SERVER_SEED_ENABLED) {
      return plannerHydrateBundleAction(ownerId);
    }
    // The second argument answers WHO is looking and WHERE they are, read from
    // the browser's own session rather than from anything the server put in the
    // page — `ownerId` above is the server's answer forwarded through
    // `x-mc-user-id`, so it cannot check itself. Passed as a thunk so it costs a
    // request only when a seed is actually waiting to be checked:
    // `takeServerSeed` calls it after it has claimed one, and lets it overlap
    // the wait for a seed that is usually still streaming.
    const seeded = await takeServerSeed(ownerId, () =>
      readExpectedSeedIdentity(ownerId),
    );
    if (seeded) return seeded;
    return plannerHydrateBundleAction(ownerId);
  }
  return buildPlannerHydrateBundle(plannerMockSource, ownerId);
}
