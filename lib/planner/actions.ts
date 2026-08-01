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
import {
  buildPlannerHydrateBundle,
  type PlannerHydrateBundle,
} from "./hydrate-bundle";
import { withSharedServerClient } from "../supabase/helpers";

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
  // SECURITY: see teachDispatch — a `'use server'` boundary (HTTP endpoint) with
  // a runtime-erased generic, so `method` is an attacker-controlled string. Only
  // dispatch to an OWN, callable property of the source object literal; fail
  // closed otherwise.
  if (
    !Object.prototype.hasOwnProperty.call(src, method) ||
    typeof src[method] !== "function"
  ) {
    throw new Error(`plannerDispatch: unknown method "${String(method)}"`);
  }
  const fn = src[method] as (
    ...a: Parameters<PlannerDataSource[M]>
  ) => Promise<Awaited<ReturnType<PlannerDataSource[M]>>>;
  // Bind to the source so `this` is correct for object-method implementations.
  return fn.apply(src, args);
}

/**
 * The whole planner hydrate — grade + lessons + catalog + sections — in ONE
 * action. ADDITIVE: `plannerDispatch` above is untouched and still serves every
 * other caller, so reverting is a one-line change at the store's call site.
 *
 * WHY IT IS A SEPARATE ACTION RATHER THAN A `plannerDispatch` METHOD. The whole
 * point is to stop paying the client action queue six times; a bundle reached
 * through `plannerDispatch` would still be one queued call, but making it a
 * distinct action keeps `PlannerDataSource` — the frozen seam both sources
 * implement — free of a method that is really a call-ordering strategy.
 *
 * TRUST MODEL, UNCHANGED. `ownerId` is supplied by the client, exactly as it is
 * for every read `plannerDispatch` already forwards (`listLessons`,
 * `getSectionsBatch`, …). It is not an authorization token: every underlying
 * query runs under the caller's own session through the RLS-scoped server
 * client, so a forged owner id cannot widen what the rows the caller may see —
 * at worst it fails to resolve their personal forks. This action adds no new
 * surface; it re-orders calls that were already reachable.
 *
 * `withSharedServerClient` makes the six reads share ONE Supabase client, which
 * is what lets the per-request memos (school week, active school year, and the
 * subject/unit/standards indexes) actually hit — see lib/supabase/helpers.ts.
 * With the mock source selected it is inert: nothing inside calls `sb()`.
 */
export async function plannerHydrateBundleAction(
  ownerId: string,
): Promise<PlannerHydrateBundle> {
  // A `'use server'` boundary is an HTTP endpoint, so the generic's type is
  // erased at runtime and the argument is attacker-controlled. Fail closed on a
  // non-string rather than handing an object/array to PostgREST and letting it
  // decide what that means. An EMPTY string is not an error — the bundle treats
  // it as "no owner" and returns the empty document without a query.
  if (typeof ownerId !== "string") {
    throw new Error("plannerHydrateBundleAction: ownerId must be a string");
  }
  const src = source();
  return withSharedServerClient(() => buildPlannerHydrateBundle(src, ownerId));
}
