// callback/route.ts — OAuth callback for Supabase Auth (Google SSO).
//
// Supabase redirects here after Google sign-in with a `?code=` param.
// We exchange that code for a session (cookies are written by the
// server client), then forward the teacher on to wherever they were
// originally headed.

import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/** Post-login landing route when no `?next=` was preserved. */
const DEFAULT_NEXT = "/weekly";

/** A `next` value is safe only if it's a relative, in-app path. */
function safeNext(next: string | null) {
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return DEFAULT_NEXT;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Behind a load balancer the public host arrives on x-forwarded-host;
      // use it so the redirect lands on the deployed domain, not localhost.
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // Missing code or a failed exchange — send them back to sign in.
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
