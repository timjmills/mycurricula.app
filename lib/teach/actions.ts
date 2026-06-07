"use server";

// lib/teach/actions.ts — the SERVER bridge between client components and the
// Supabase-backed TeachDataSource. The Supabase source (lib/teach/supabase-
// source.ts) is server-only (it imports lib/supabase/server.ts → `next/headers`
// and runs under the authed user's RLS), so it cannot be bundled into a client
// component. Client code reaches it through ONE generic server action that
// dispatches by method name to the server-resolved data source.
//
// Selection: when Supabase is configured (isSupabaseConfigured() — incl. the
// TEACH_USE_SUPABASE=1 local-stack opt-in) the call hits Postgres under RLS;
// otherwise it falls back to the in-memory mock so behavior is identical
// pre-backend. The CLIENT facade (lib/teach/client.ts) decides whether to call
// this action at all, so the default prototype path never round-trips a server.
//
// Type safety: the action is generic over the TeachDataSource method name `M`,
// so its args + return type are exactly that method's signature — no `any`
// leaks across the boundary, and a renamed/removed method is a compile error.
//
// PRIVACY (§11.4): only STRUCTURE crosses this boundary — boards/widgets/pages/
// themes/repeat/tags. Never student names.

import type { TeachDataSource } from "./queries";
import { isSupabaseConfigured } from "./queries";
import { mockTeachSource } from "./mock-source";
import { supabaseTeachSource } from "./supabase-source";

/** The server-resolved data source: real Supabase when configured, else the
 *  in-memory mock. Resolved per-call so an env flip is picked up without a
 *  module-load-time freeze. */
function source(): TeachDataSource {
  return isSupabaseConfigured() ? supabaseTeachSource : mockTeachSource;
}

/**
 * Generic dispatch: invoke `TeachDataSource[method](...args)` on the server.
 * The client facade (lib/teach/client.ts) is the only caller; it passes the
 * method name + the exact tuple of that method's args and awaits its result.
 * Typed end-to-end via the method-name generic so the boundary stays sound.
 */
export async function teachDispatch<M extends keyof TeachDataSource>(
  method: M,
  args: Parameters<TeachDataSource[M]>,
): Promise<Awaited<ReturnType<TeachDataSource[M]>>> {
  const src = source();
  // SECURITY: this is a `'use server'` boundary — compiled to an HTTP endpoint
  // any client can POST to — and the `keyof` generic is erased at runtime, so
  // `method` is an attacker-controlled string. Dispatch ONLY to an OWN, callable
  // property of the source (every TeachDataSource method is an own prop of the
  // source object literal); fail closed on anything else, so an inherited member
  // (constructor / hasOwnProperty / __proto__ / …) can't be invoked or throw an
  // uncaught error past the boundary.
  if (
    !Object.prototype.hasOwnProperty.call(src, method) ||
    typeof src[method] !== "function"
  ) {
    throw new Error(`teachDispatch: unknown method "${String(method)}"`);
  }
  const fn = src[method] as (
    ...a: Parameters<TeachDataSource[M]>
  ) => Promise<Awaited<ReturnType<TeachDataSource[M]>>>;
  // Bind to the source so `this` is correct for object-method implementations.
  return fn.apply(src, args);
}
