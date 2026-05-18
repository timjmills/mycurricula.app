// server.ts — Supabase server client (Server Components, Route Handlers,
// Server Actions).
//
// Built on @supabase/ssr so the auth session is read from / written to
// Next.js cookies. In Next 15 `cookies()` is async, hence the await.
//
// Writing cookies from inside a Server Component throws — that path is
// caught and ignored; session refresh is expected to happen in
// middleware (added when auth is wired, once a real project exists).

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Create a Supabase client for use on the server (per-request). */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — cookie writes are not
            // allowed there. Safe to ignore when middleware refreshes
            // the session on each request.
          }
        },
      },
    },
  );
}
