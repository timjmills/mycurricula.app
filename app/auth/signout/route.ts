// signout/route.ts — ends the teacher's Supabase session.
//
// POST-only: signing out is a state change, so it should never happen on
// a plain link/navigation. signOut() clears the auth cookies via the
// server client; we then bounce to /login.

import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/login", request.url), {
    // 303 forces the browser to follow the redirect with a GET.
    status: 303,
  });
}
