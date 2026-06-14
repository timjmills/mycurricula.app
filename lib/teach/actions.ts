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
import { BoardCapError } from "./limits";
import { mockTeachSource } from "./mock-source";
import { supabaseTeachSource } from "./supabase-source";

/** The server-resolved data source: real Supabase when configured, else the
 *  in-memory mock. Resolved per-call so an env flip is picked up without a
 *  module-load-time freeze. */
function source(): TeachDataSource {
  return isSupabaseConfigured() ? supabaseTeachSource : mockTeachSource;
}

/** Result envelope for {@link teachDispatch}. A Server Action that THROWS has its
 *  error redacted by Next.js before it reaches the client — the message is replaced
 *  with a generic string and the custom error class (and its `name`) is stripped —
 *  so a thrown `BoardCapError` would arrive as an opaque `Error` and the client
 *  could no longer tell "you hit the 50-board cap" from any other failure. We
 *  instead RESOLVE with this discriminated envelope (the action never rejects for an
 *  operational error): expected, client-safe errors travel as DATA with their
 *  `name` + message intact so the client facade can rebuild a real typed error;
 *  every unexpected error collapses to a generic message (preserving Next's
 *  don't-leak-server-internals property) and is logged server-side. */
export type TeachDispatchResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { name: string; message: string } };

/** Opaque message returned for any UNEXPECTED error, so DB/RLS internals never
 *  cross the boundary. Expected errors (BoardCapError) forward their own
 *  teacher-facing message instead. */
const GENERIC_TEACH_ERROR = "That didn't work — please try again.";

/**
 * Generic dispatch: invoke `TeachDataSource[method](...args)` on the server.
 * The client facade (lib/teach/client.ts) is the only caller; it passes the
 * method name + the exact tuple of that method's args and unwraps the envelope.
 * Typed end-to-end via the method-name generic so the boundary stays sound.
 */
export async function teachDispatch<M extends keyof TeachDataSource>(
  method: M,
  args: Parameters<TeachDataSource[M]>,
): Promise<TeachDispatchResult<Awaited<ReturnType<TeachDataSource[M]>>>> {
  const src = source();
  // SECURITY: this is a `'use server'` boundary — compiled to an HTTP endpoint
  // any client can POST to — and the `keyof` generic is erased at runtime, so
  // `method` is an attacker-controlled string. Dispatch ONLY to an OWN, callable
  // property of the source (every TeachDataSource method is an own prop of the
  // source object literal); fail closed on anything else, so an inherited member
  // (constructor / hasOwnProperty / __proto__ / …) can't be invoked.
  if (
    !Object.prototype.hasOwnProperty.call(src, method) ||
    typeof src[method] !== "function"
  ) {
    return {
      ok: false,
      error: { name: "Error", message: GENERIC_TEACH_ERROR },
    };
  }
  const fn = src[method] as (
    ...a: Parameters<TeachDataSource[M]>
  ) => Promise<Awaited<ReturnType<TeachDataSource[M]>>>;
  try {
    // Bind to the source so `this` is correct for object-method implementations.
    const value = await fn.apply(src, args);
    return { ok: true, value };
  } catch (e) {
    // EXPECTED, client-safe error → forward its name + message so the client facade
    // can rebuild a real BoardCapError and the UI shows the friendly cap prompt. Its
    // message is authored for teachers (lib/teach/limits.ts), never a server
    // internal. Anything else is UNEXPECTED: log it server-side for diagnosis and
    // return an opaque message so DB/RLS details never reach the client.
    if (e instanceof BoardCapError) {
      return { ok: false, error: { name: e.name, message: e.message } };
    }
    console.error(`teachDispatch("${String(method)}") failed:`, e);
    return {
      ok: false,
      error: { name: "Error", message: GENERIC_TEACH_ERROR },
    };
  }
}
