// claude-login/route.ts — cookie-redirect entrypoint for the Claude
// auth-bypass.
//
// GET /auth/claude-login?token=<CLAUDE_BYPASS_TOKEN>&next=/weekly
//
// On success the response is a 302 redirect to `?next=…` carrying a
// fresh Supabase session cookie for `CLAUDE_USER_EMAIL`. Any subsequent
// request from the same client (browser, cookie jar, Co-work headless)
// passes the regular SSO gate automatically — no token needed on
// follow-up requests.
//
// This endpoint is the cookie-friendly variant of the bypass. For
// Claude surfaces that don't preserve cookies (one-shot WebFetch, curl
// without --cookie-jar), the middleware-side `?claude=<token>` pattern
// works on every page directly. Both paths share the same validation +
// session-mint + audit-log code in `lib/claude-bypass.ts`.

import type { NextRequest } from "next/server";

import { handleClaudeLogin } from "@/lib/claude-bypass";

export async function GET(request: NextRequest) {
  return handleClaudeLogin(request);
}
