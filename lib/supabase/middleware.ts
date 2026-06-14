// middleware.ts — Supabase session refresh + auth gate for the Edge
// middleware.
//
// Built on @supabase/ssr. On every matched request this:
//   1. creates a server client whose cookies read from the incoming
//      request and write to the outgoing response,
//   2. calls supabase.auth.getUser() to refresh an expiring session,
//   3. redirects unauthenticated visitors of protected paths to /login —
//      except the root path "/", which forwards to the public marketing
//      page (/welcome) so signed-out visitors land there, not on login.
//
// Footgun: the response object the client mutates cookies on is the
// one we must ultimately return. If a redirect is issued we copy those
// cookies onto the redirect response so the refreshed session survives.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { tryClaudeBypassInMiddleware } from "@/lib/claude-bypass";

/**
 * Path prefixes that must pass through without an authenticated user.
 * `/welcome` is the public marketing landing page — anyone can view it
 * signed-out; its CTAs funnel into `/login`.
 */
const PUBLIC_PATHS = ["/login", "/auth", "/welcome"];

/** True when `pathname` is a public route or a Next internal / static asset. */
function isPublicPath(pathname: string) {
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    // Static files (images, fonts, etc.) carry an extension.
    /\.[^/]+$/.test(pathname)
  ) {
    return true;
  }
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Refresh the Supabase session and enforce auth for the current request.
 * Returns the NextResponse to send — either the cookie-mutated passthrough
 * response, or a redirect (to /welcome for a signed-out root visit, else to
 * /login) carrying those same cookies.
 */
export async function updateSession(request: NextRequest) {
  // Claude auth-bypass (lib/claude-bypass.ts). When the request carries
  // a valid `?claude=<token>` URL param (or a Bearer header) this short-
  // circuits the SSO gate, mints a Supabase session for CLAUDE_USER_EMAIL,
  // and redirects to a clean URL with the session cookies attached.
  // Falls through on invalid / missing / rate-limited tokens — those
  // land on the normal auth flow below.
  const bypass = await tryClaudeBypassInMiddleware(request);
  if (bypass.bypassed) return bypass.response;

  // The response whose cookies the Supabase client writes to. Recreated
  // alongside the request whenever a cookie is set, per the @supabase/ssr
  // middleware pattern.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Refresh the session. Do NOT run code between createServerClient and
  // getUser() — that is the documented @supabase/ssr ordering rule.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // No session on a protected path → redirect. The root path forwards to
  // the public marketing page so signed-out visitors land there; every
  // other protected path bounces to /login, preserving the originally-
  // requested path so the OAuth callback can return there.
  if (!user && !isPublicPath(pathname)) {
    const target = request.nextUrl.clone();
    target.search = "";
    if (pathname === "/") {
      target.pathname = "/welcome";
    } else {
      target.pathname = "/login";
      target.searchParams.set("next", pathname + request.nextUrl.search);
    }

    const redirect = NextResponse.redirect(target);
    // Carry the refreshed-session cookies onto the redirect response.
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  return response;
}
