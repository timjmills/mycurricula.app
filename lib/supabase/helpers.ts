// helpers.ts — shared server-side Supabase plumbing for the data-source
// repositories (lib/planner/supabase-source.ts, lib/teach/supabase-source.ts).
// Previously each repository carried its own identical copy of these.

import { AsyncLocalStorage } from "node:async_hooks";
import { createClient } from "./server";

// The server client is async (it awaits `cookies()`), so every method resolves
// it first. Resolving per call keeps the request-scoped auth session correct.

export type ServerClient = Awaited<ReturnType<typeof createClient>>;

// ── Shared-client scope (opt-in) ────────────────────────────────────────────
// `sb()` builds a NEW client on every call, and several per-request memos in the
// repositories are WeakMaps keyed on the client object
// (lib/planner/supabase-source.ts — schoolWeekCache, activeYearCache, the three
// index caches). Their comments say "a fresh client per request", but nothing
// enforced that: a server action that calls six source methods built six
// clients, so every one of those memos missed and the same reference tables were
// re-read once per method.
//
// `withSharedServerClient(fn)` opens a scope in which the FIRST `sb()` builds the
// client and every later `sb()` inside the same async context — including inside
// a `Promise.all` — resolves to that same instance, so the memos finally hit.
// The scope is entered explicitly (today only by the planner hydrate bundle), so
// every other caller keeps today's exact behaviour: no scope → a fresh client,
// byte-for-byte as before.
//
// WHY THIS IS SAFE TO SHARE. A supabase-js client is a stateless query builder
// over one auth session; concurrent use is already the norm inside a single
// method (see the `Promise.all` of four loaders at the top of `listLessons`).
// Sharing widens that from one method to one action, not across requests: the
// store is `AsyncLocalStorage`, so a scope belongs to exactly one async context
// and can never be observed by a concurrently-running request.
//
// WHAT IT IS NOT: a cache of DATA. It shares the CLIENT; whether a given read is
// memoized is the repository's decision, and every memo is scoped to that same
// client object, so nothing survives the scope.
type ServerClientScope = { client?: Promise<ServerClient> };

const clientScope = new AsyncLocalStorage<ServerClientScope>();

/** Run `fn` with a single shared server client for every `sb()` inside it
 *  (including nested awaits and `Promise.all` branches). Returns `fn`'s result;
 *  the scope — and therefore every client-keyed memo — is discarded when it
 *  settles. Nesting is harmless: an inner scope simply gets its own client. */
export function withSharedServerClient<T>(fn: () => Promise<T>): Promise<T> {
  return clientScope.run({}, fn);
}

export async function sb(): Promise<ServerClient> {
  const scope = clientScope.getStore();
  if (!scope) return createClient();
  // Store the PROMISE, not the resolved client, and assign it in the same
  // synchronous turn as the check. `scope.client ??= await createClient()` would
  // be a race: every branch of a `Promise.all` would see `undefined`, each would
  // build its own client, and each would receive the one IT built — the memos
  // would still miss and the bug would look fixed.
  scope.client ??= createClient();
  return scope.client;
}

/** Build an `unwrap` for one repository. Wraps a supabase-js `{ data, error }`
 *  envelope: throw a descriptive Error (prefixed with `scope`) on `error`,
 *  otherwise return `data`. Centralises the error-handling contract so every
 *  call site stays terse and no error is silently swallowed. */
export function makeUnwrap(scope: string) {
  return function unwrap<T>(
    result: { data: T | null; error: { message: string } | null },
    context: string,
  ): T {
    if (result.error) {
      throw new Error(`${scope} ${context} failed: ${result.error.message}`);
    }
    if (result.data == null) {
      throw new Error(`${scope} ${context} returned no data.`);
    }
    return result.data;
  };
}

/** Like `makeUnwrap`, but the built function tolerates a null `data` (for
 *  `.maybeSingle()` reads where "no row" is a valid answer). Still throws on a
 *  transport/SQL error. */
export function makeUnwrapMaybe(scope: string) {
  return function unwrapMaybe<T>(
    result: { data: T | null; error: { message: string } | null },
    context: string,
  ): T | null {
    if (result.error) {
      throw new Error(`${scope} ${context} failed: ${result.error.message}`);
    }
    return result.data;
  };
}
