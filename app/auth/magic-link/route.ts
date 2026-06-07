// auth/magic-link/route.ts — magic-link OTP sign-in (+ resend).
//
// **Why magic-link alongside Google.**
// Some teachers may not have a Google account linked to their school email,
// or may prefer an email-only flow. This route calls Supabase's standard
// `signInWithOtp()` (magic-link OTP) and confirms via the EXISTING
// `/auth/callback` route, exactly as Supabase's hosted OAuth does. No new
// session or cookie is written here — Supabase's own magic-link email contains
// a confirmation URL that lands on `/auth/callback?code=…` and that route
// handles the cookie + provisioning gate.
//
// **Resend:** POST with `{ email, resend: true }` re-sends the OTP for the
// same address. There is a 60-second Supabase-side rate limit per email.
//
// **Security posture — no email enumeration.**
// We return the SAME generic response regardless of whether the email is
// known to Supabase. The UI shows "Check your email" whether or not an
// account exists. A timing difference is inherent to any email-based flow;
// the message text reveals nothing.
//
// **`?next=` preservation.**
// The caller POSTs `{ email, next }` where `next` is the sanitized in-app
// destination. We encode it into Supabase's `emailRedirectTo` so the callback
// URL arrives with `?next=<safe-path>`. The same `safeRelativePath` guard used
// throughout the auth surface validates `next` before embedding it.
//
// **CSRF / origin guard.**
// Matches the GSI route: a present-but-mismatched Origin header is rejected
// (403); a missing Origin (same-origin fetch) is allowed through.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRelativePath } from "@/lib/safe-path";

interface MagicLinkBody {
  email?: unknown;
  next?: unknown;
  resend?: unknown;
}

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── CSRF / origin guard ────────────────────────────────────────────────
  // Matches the posture in /auth/gsi: a present-but-mismatched Origin is
  // rejected; a missing Origin (same-origin fetch, some non-browser clients)
  // is allowed through. This stops a cross-origin form from triggering OTPs
  // on behalf of another user.
  const originHeader = request.headers.get("origin");
  if (originHeader && originHeader !== request.nextUrl.origin) {
    return jsonError("invalid_origin", 403);
  }

  let body: MagicLinkBody;
  try {
    body = (await request.json()) as MagicLinkBody;
  } catch {
    return jsonError("invalid_json", 400);
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    return jsonError("invalid_email", 400);
  }

  // Validate and sanitize the `next` destination using the shared guard.
  // Embeds into the Supabase emailRedirectTo so callback preserves it.
  const nextPath = safeRelativePath(
    typeof body.next === "string" ? body.next : null,
  );

  // Build the callback URL with the sanitized next path. The callback route
  // reads `?next=` and forwards the teacher to that destination after
  // provisioning succeeds.
  const callbackUrl = new URL("/auth/callback", request.nextUrl.origin);
  callbackUrl.searchParams.set("next", nextPath);

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // shouldCreateUser: true is Supabase's default. Leaving it true means
      // a teacher who has never signed in can click the magic link and their
      // account is created on the Supabase side (provisioning still runs in
      // /auth/callback before the session cookie is allowed to stick —
      // fail-closed posture is unchanged).
      emailRedirectTo: callbackUrl.toString(),
    },
  });

  // No email enumeration: return the SAME success response whether or not
  // the email is registered. Surface the error only in the server log so
  // we can diagnose Supabase misconfigurations.
  if (error) {
    // Rate-limit is the one case where we CAN tell the user something
    // meaningful (Supabase returns a recognizable error code).
    const isRateLimit =
      error.message?.toLowerCase().includes("rate") ||
      error.status === 429 ||
      // Supabase wraps this as a specific message on their side
      error.message?.toLowerCase().includes("email rate limit");

    if (isRateLimit) {
      return NextResponse.json(
        {
          ok: false,
          error: "rate_limited",
          // Client-friendly hint the UI surfaces
          hint: "Too many requests. Please wait a minute before trying again.",
        },
        { status: 429 },
      );
    }

    // All other errors → generic success so we don't enumerate emails.
    // Log for internal visibility.
    console.warn("[auth] magic-link OTP error (suppressed in response)", {
      message: error.message,
      status: error.status,
    });
  }

  // Generic "check your email" response — identical whether the account
  // exists or not.
  return NextResponse.json({ ok: true });
}
