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
import { USER_ID_HEADER } from "./user-header";
import { SSR_USER_ID_FORWARDING_ENABLED } from "@/lib/planner/server-seed-enabled";
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
 * response, a rewrite (a signed-out root visit serves the /welcome marketing
 * page in place, keeping the clean "/" URL), or a redirect (every other
 * protected path bounces to /login) — all carrying those same cookies.
 */
export async function updateSession(request: NextRequest) {
  // ── SANITISE THE INBOUND USER-ID HEADER, BEFORE ANYTHING CAN RETURN ───────
  // `x-mc-user-id` is a header WE set for the render (see below). A client can
  // send one too, so it is stripped here — at the very top of the only function
  // every matched request passes through — rather than next to the code that
  // sets it.
  //
  // WHY THE POSITION IS THE WHOLE POINT. The obvious home for this is beside the
  // `set` further down, and that is where it was: a `set`/`delete` pair, with a
  // comment claiming an inbound value "can never survive". It was wrong, because
  // the Claude bypass RETURNS EARLY on the next line, seventy lines above that
  // pair. On the `?claude=` URL path that is harmless — it answers with a
  // `NextResponse.redirect`, which does not carry request headers into a render
  // — but the BEARER-HEADER path answers with `NextResponse.next({ request })`,
  // which forwards the inbound headers verbatim. A caller holding a valid
  // CLAUDE_BYPASS_TOKEN could therefore have put any id it liked in front of the
  // server render.
  //
  // Not a privilege escalation: the value is a performance hint, RLS decides
  // every read, and on the Bearer path the render sees no session at all
  // (`mintSession` writes cookies to the RESPONSE, never to `request.cookies`),
  // so a read attempted as the forged id returns nothing. The reason it is fixed
  // anyway is that the COMMENT asserted a guarantee the code did not provide —
  // and the next person to build on "middleware guarantees this header" would
  // have been relying on us. Stripping first makes the guarantee true on every
  // path, including any early return added later.
  request.headers.delete(USER_ID_HEADER);

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

  // ── HAND THE RESOLVED USER ID DOWN TO THE RENDER ─────────────────────────
  // `getUser()` above is a real round trip to the Supabase auth server, and its
  // answer was previously used only for the gate below and then discarded — so
  // the browser paid for a SECOND, identical call after hydrating
  // (`lib/app-state.tsx`) before `currentUser.id` existed. Nothing in the
  // planner can read a lesson until that resolves, because the store keys the
  // hydrate on the owner id.
  //
  // Forwarding it on the request costs zero additional calls: the header rides
  // the `NextResponse.next({ request })` that the @supabase/ssr pattern already
  // rebuilds, so the RSC render below reads what this call already learned.
  //
  // ⚠ THIS `set`/`delete` PAIR IS NOT WHAT MAKES THE HEADER UNFORGEABLE, and an
  // earlier version of this comment claimed it was. It is only reached on
  // requests that get past the Claude-bypass early return above, so on its own
  // it would leave the Bearer-bypass path (which answers with
  // `NextResponse.next({ request })`, forwarding inbound headers) able to carry
  // a client-supplied id into the render. The unconditional guarantee comes from
  // the `request.headers.delete(USER_ID_HEADER)` at the TOP of this function,
  // before any return; the delete below is the ordinary no-user case.
  //
  // TRUST MODEL UNCHANGED (lib/planner/actions.ts): this is a PERFORMANCE HINT,
  // not a credential. Every query still runs under the caller's own session
  // through RLS, exactly as it does for the `ownerId` the client already
  // supplies to `plannerHydrateBundleAction`. A wrong value here cannot widen
  // what anyone may read; at worst it costs a re-hydrate when the client's own
  // session resolves to someone else, which the store's owner guard handles.
  //
  // ID ONLY — not the name, email or avatar. Those would end up in the HTML for
  // a cosmetic first paint, and the identity this puts in the document should be
  // the smallest thing that unblocks the data path. The display name continues
  // to arrive from the client's own auth subscription, as it does today.
  //
  // ⚠ THE REBUILD MUST CARRY THE COOKIES FORWARD. `setAll` above writes the
  // REFRESHED session cookies onto `response`; a bare
  // `response = NextResponse.next({ request })` here would silently drop them
  // and break session refresh for every request — the same footgun the redirect
  // branch below already guards against. So the cookies are copied across, and
  // the old response is read before it is replaced.
  // ⚠ THE SET IS GATED OFF (lib/planner/server-seed-enabled.ts); THE DELETE IS
  // NOT, AND MUST NOT BE. Forwarding this id is the root condition behind two
  // cross-user findings — it makes `currentUser.id` the server's answer before
  // the browser has confirmed who it is — so nothing legitimately sets the
  // header today. Stripping an inbound one still costs nothing and still
  // protects any future reader, so it happens unconditionally here as well as at
  // the top of this function.
  if (SSR_USER_ID_FORWARDING_ENABLED && user?.id) {
    request.headers.set(USER_ID_HEADER, user.id);
  } else {
    request.headers.delete(USER_ID_HEADER);
  }
  const refreshedCookies = response.cookies.getAll();
  response = NextResponse.next({ request });
  for (const cookie of refreshedCookies) response.cookies.set(cookie);

  const { pathname } = request.nextUrl;

  // No session on a protected path. The root path is REWRITTEN (served in
  // place) to the public marketing page so signed-out visitors see it at the
  // clean "/" URL — the address bar stays "/", not "/welcome". Every other
  // protected path is REDIRECTED to /login, preserving the originally-
  // requested path so the OAuth callback can return there.
  if (!user && !isPublicPath(pathname)) {
    let gateResponse: NextResponse;
    if (pathname === "/") {
      const welcome = new URL("/welcome", request.nextUrl.origin);
      gateResponse = NextResponse.rewrite(welcome);
    } else {
      const loginUrl = request.nextUrl.clone();
      loginUrl.search = "";
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
      gateResponse = NextResponse.redirect(loginUrl);
    }

    // Carry the refreshed-session cookies onto the rewrite/redirect response.
    for (const cookie of response.cookies.getAll()) {
      gateResponse.cookies.set(cookie);
    }
    return gateResponse;
  }

  return response;
}
