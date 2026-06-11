// helpers.ts — shared server-side Supabase plumbing for the data-source
// repositories (lib/planner/supabase-source.ts, lib/teach/supabase-source.ts).
// Previously each repository carried its own identical copy of these.

import { createClient } from "./server";

// The server client is async (it awaits `cookies()`), so every method resolves
// it first. Resolving per call keeps the request-scoped auth session correct.

export type ServerClient = Awaited<ReturnType<typeof createClient>>;

export async function sb(): Promise<ServerClient> {
  return createClient();
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
