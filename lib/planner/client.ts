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
import { plannerDispatch } from "./actions";

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
