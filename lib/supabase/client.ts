// client.ts — Supabase browser client.
//
// Use this in Client Components ("use client"). It reads the public
// anon key, so it is safe to ship to the browser; Row-Level Security
// (see supabase/migrations) is what actually gates data access.
//
// The project URL + anon key come from .env.local — copy
// .env.local.example and fill them in from your Supabase project's
// Settings → API page. Until then these are empty and any call will
// fail; nothing in the app calls this client yet.

import { createBrowserClient } from "@supabase/ssr";

/** Create a Supabase client for use in the browser / Client Components. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
