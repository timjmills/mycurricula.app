// admin.ts — Supabase service-role client.
//
// **DANGER: this client bypasses Row-Level Security.** Only use it from
// server-side code paths that have been audited for safety (admin route
// handlers, server actions that need to look up another user's record,
// the Claude auth-bypass below). Never import this client from a
// component, a client-side hook, or any file that ends up bundled to the
// browser.
//
// Used by:
//   • lib/claude-bypass.ts — to look up / provision the Claude-access
//     user and to mint a one-shot magic-link token that the request's
//     server client then exchanges into a Supabase session cookie.
//
// Service-role key lives in SUPABASE_SERVICE_ROLE_KEY (never prefixed
// NEXT_PUBLIC_; never exported to a client manifest). When the env var
// is missing this helper throws so a misconfigured deploy fails loudly
// instead of silently bypassing intended checks.

import { createClient } from "@supabase/supabase-js";

let cached: ReturnType<typeof createClient> | null = null;

/** Get the service-role Supabase client (memoised per process). */
export function getAdminClient(): ReturnType<typeof createClient> {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.",
    );
  }
  cached = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cached;
}
