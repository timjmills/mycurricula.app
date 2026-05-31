"use server";

// lib/planner/actions.ts — the SERVER bridge between client components and the
// Supabase-backed PlannerDataSource. The Supabase source (lib/planner/supabase-
// source.ts) is server-only (it imports lib/supabase/server.ts → `next/headers`
// and runs under the authed user's RLS), so it cannot be bundled into a client
// component. Client code reaches it through ONE generic server action that
// dispatches by method name to the server-resolved data source.
//
// Selection: when the planner is pointed at Supabase
// (isPlannerSupabaseConfigured() — set NEXT_PUBLIC_PLANNER_USE_SUPABASE=1
// alongside a real Supabase project) the call hits Postgres under RLS;
// otherwise it falls back to the in-memory mock so behavior is byte-identical
// pre-backend. The CLIENT facade (lib/planner/client.ts) decides whether to
// call this action at all, so the default prototype path never round-trips.
//
// Type safety: the action is generic over the PlannerDataSource method name `M`,
// so its args + return type are exactly that method's signature — no `any`
// leaks across the boundary, and a renamed/removed method is a compile error.
//
// PRIVACY (§11.4): only STRUCTURE crosses this boundary — lessons / units /
// subjects / standards / sections / resources. Never student names.

import type { PlannerDataSource } from "./source";
import { isPlannerSupabaseConfigured } from "./source";
import { plannerMockSource } from "./mock-source";
import { plannerSupabaseSource } from "./supabase-source";

/** The server-resolved data source: real Supabase when configured, else the
 *  in-memory mock. Resolved per-call so an env flip is picked up without a
 *  module-load-time freeze. */
function source(): PlannerDataSource {
  return isPlannerSupabaseConfigured()
    ? plannerSupabaseSource
    : plannerMockSource;
}

/**
 * Generic dispatch: invoke `PlannerDataSource[method](...args)` on the server.
 * The client facade (lib/planner/client.ts) is the only caller; it passes the
 * method name + the exact tuple of that method's args and awaits its result.
 * Typed end-to-end via the method-name generic so the boundary stays sound.
 */
export async function plannerDispatch<M extends keyof PlannerDataSource>(
  method: M,
  args: Parameters<PlannerDataSource[M]>,
): Promise<Awaited<ReturnType<PlannerDataSource[M]>>> {
  const src = source();
  const fn = src[method] as (
    ...a: Parameters<PlannerDataSource[M]>
  ) => Promise<Awaited<ReturnType<PlannerDataSource[M]>>>;
  // Bind to the source so `this` is correct for object-method implementations.
  return fn.apply(src, args);
}
