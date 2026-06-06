// claude-bypass.ts — token-gated auth bypass for Claude surfaces.
//
// **Why this exists**
// `mycurricula.app` gates every planner route behind Google SSO. That works
// for human teachers signing in via a browser, but not for AI assistants
// (Claude Code, Claude Chat, Claude Co-work, Claude Code Cloud) that need
// to view + use the site as the owner. This module wires a token-gated
// bypass: presenting a long random shared secret on a request proves
// "this is Claude acting on the owner's behalf", and the request is then
// authenticated as `CLAUDE_USER_EMAIL`.
//
// **Two consumers**
//   • `lib/supabase/middleware.ts` calls `tryClaudeBypassInMiddleware()`
//     before the SSO gate. If a `?claude=<token>` URL param is present,
//     valid, and rate-limited within reason, the bypass mints a session
//     cookie on the response and the regular auth check passes (because
//     the cookie now reads as a real Supabase session).
//   • `app/auth/claude-login/route.ts` calls `mintClaudeSession()` from a
//     route handler. Same flow, but the response is a 302 redirect to the
//     `?next=` path. This is the cookie-friendly variant useful for any
//     Claude surface that has a browser/cookie jar (Co-work, etc).
//
// **Threat model + mitigations**
//   • The token effectively grants full account access. Treat it as a
//     password. Never commit it (.env.local is gitignored). Rotate
//     regularly. Wrangler secrets carry it to the Cloudflare worker.
//   • Constant-time comparison via `crypto.timingSafeEqual` so the token
//     can't be guessed via timing attacks.
//   • Every successful + failed bypass is audit-logged to
//     `claude_access_log` (see `docs/claude-bypass.sql`). Visible to the
//     account owner; queryable by date / path / success.
//   • In-process rate limiting (`MAX_HITS_PER_MIN`) caps the request rate
//     so a token-guess flood can't grind through. Cloudflare's own rate
//     limiting should be layered in front of this for production.
//   • The bypass auto-provisions `CLAUDE_USER_EMAIL` if the user doesn't
//     already exist. If you don't want Claude to be able to provision
//     itself, pre-register the email in Supabase and set the env var
//     `CLAUDE_BYPASS_PROVISION=0`.
//
// **Disabling**
//   Unset `CLAUDE_BYPASS_TOKEN` in env. The bypass becomes a no-op and
//   every request goes through the normal SSO gate.

// NOTE: this module runs on the Edge runtime (Cloudflare Workers in
// production, Next.js's edge-like middleware in dev). `node:crypto`
// isn't available there, so all hashing uses the Web Crypto API via
// the global `crypto.subtle` available in every modern runtime.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getAdminClient } from "@/lib/supabase/admin";
import { ensureTeacherRecord } from "@/lib/supabase/ensure-teacher";
// The open-redirect guard (audit #21) now lives in a dependency-free module so
// client components can share it. Re-exported below for the existing importers
// that pull `safeRelativePath` from this module (auth callback + tests).
import { safeRelativePath } from "@/lib/safe-path";

// ── Config ───────────────────────────────────────────────────────────────

/** URL query parameter the bypass listens on. */
const BYPASS_PARAM = "claude";

/** Soft rate limit: drop bypass hits above this rate per minute. The
 *  counter is in-memory per worker instance, so it's not a hard cap —
 *  Cloudflare's own rate-limit rules should sit in front. */
const MAX_HITS_PER_MIN = 120;

/** Per-instance hit counter buckets (key: minute-of-epoch). */
const hits = new Map<number, number>();

function recordHit(): boolean {
  const minute = Math.floor(Date.now() / 60_000);
  const n = (hits.get(minute) ?? 0) + 1;
  hits.set(minute, n);
  // Clean up older buckets so the map doesn't grow unbounded.
  for (const k of hits.keys()) if (k < minute - 1) hits.delete(k);
  return n <= MAX_HITS_PER_MIN;
}

// ── Token check ─────────────────────────────────────────────────────────

/** Where the bypass token was found on the request. Lets the caller
 *  pick the right post-mint behavior: URL params get redirected (so
 *  the secret is stripped from the visible URL); a Bearer header is
 *  not visible in the URL bar anyway, so we just continue with cookies
 *  attached — that avoids an infinite redirect loop when a follower
 *  re-sends the header on the redirected request (curl -L's default). */
type TokenSource = "url" | "header";

interface ExtractedToken {
  token: string;
  source: TokenSource;
}

/** Read a query-string value while preserving literal `+` bytes.
 *  WHATWG `URLSearchParams` decodes `+` to space (form-urlencoded
 *  semantics inherited from HTML form posts). Our bypass token is
 *  base64 and can legitimately contain `+`, so the default decode
 *  corrupts the bytes (`a+b` → `a b`) and the constant-time compare
 *  then fails. Reading the raw query and decoding only `%xx` escapes
 *  — leaving `+` alone — round-trips the token correctly regardless
 *  of whether the caller URL-encoded `+` as `%2B` or sent it raw.
 *
 *  Returns null when the key is absent. */
function readRawQueryParam(rawQuery: string, key: string): string | null {
  // Strip leading `?` if present, then split on `&`.
  const q = rawQuery.startsWith("?") ? rawQuery.slice(1) : rawQuery;
  if (!q) return null;
  for (const pair of q.split("&")) {
    const eq = pair.indexOf("=");
    const k = eq === -1 ? pair : pair.slice(0, eq);
    if (k !== key) continue;
    const v = eq === -1 ? "" : pair.slice(eq + 1);
    // decodeURIComponent handles `%xx` but leaves `+` as-is — exactly
    // what we want for a base64 value. Fall back to the raw string if
    // the value happens to contain a malformed escape so the bypass
    // can still report an "invalid_token" reason instead of throwing.
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  }
  return null;
}

/** Pull the token from a NextRequest. Looks at `?claude=<token>` first
 *  (the middleware-bypass convention used on any URL), then `?token=`
 *  (the explicit /auth/claude-login route-handler convention), then
 *  `Authorization: Bearer <token>` for command-line clients that prefer
 *  headers. Accepting all three keeps every Claude surface working
 *  without per-surface translation.
 *
 *  URL params are read off the raw query string via `readRawQueryParam`
 *  rather than `searchParams.get()` — see that helper for why (`+` in
 *  a base64 token gets corrupted to space under form-urlencoded rules,
 *  and we want both `?claude=a+b` and `?claude=a%2Bb` to work). */
function extractToken(request: NextRequest): ExtractedToken | null {
  const rawQuery = request.nextUrl.search;
  const fromClaude = readRawQueryParam(rawQuery, BYPASS_PARAM);
  if (fromClaude) return { token: fromClaude, source: "url" };
  const fromToken = readRawQueryParam(rawQuery, "token");
  if (fromToken) return { token: fromToken, source: "url" };
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return { token: auth.slice("Bearer ".length).trim(), source: "header" };
  }
  return null;
}

/** Hash a UTF-8 string with SHA-256 via the Web Crypto API. The Edge
 *  runtime provides `crypto.subtle` as a global; this works in Node 18+
 *  too, so the function is identical across runtimes. */
async function sha256(input: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

/** Constant-time compare two Uint8Arrays. Loops over every byte
 *  regardless of mismatch position so a timing channel can't reveal
 *  which byte differed. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** True when `presented` matches `CLAUDE_BYPASS_TOKEN`. */
async function isValidToken(presented: string): Promise<boolean> {
  const expected = process.env.CLAUDE_BYPASS_TOKEN;
  if (!expected || expected.length < 16) return false;
  const [hp, he] = await Promise.all([sha256(presented), sha256(expected)]);
  return constantTimeEqual(hp, he);
}

// ── Audit log ───────────────────────────────────────────────────────────

interface AuditEntry {
  ok: boolean;
  pathname: string;
  userAgent: string | null;
  reason?: string;
}

/** Fire-and-forget insert to claude_access_log. Failures are swallowed —
 *  the audit log is observability, never a request blocker.
 *
 *  The cast through `unknown` is intentional: the project doesn't have a
 *  generated Database schema yet, so the supabase-js client types this
 *  table as `never`. Once `supabase gen types typescript` lands the cast
 *  can be dropped. */
async function audit(entry: AuditEntry): Promise<void> {
  try {
    const admin = getAdminClient();
    const row = {
      ok: entry.ok,
      pathname: entry.pathname,
      user_agent: entry.userAgent,
      reason: entry.reason ?? null,
      created_at: new Date().toISOString(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin.from("claude_access_log") as any).insert(row);
  } catch {
    // Non-fatal — the table may not exist yet, network may be down, etc.
    // The bypass still works; only the audit row is dropped.
  }
}

// ── Provision + session-mint ────────────────────────────────────────────

/** The auth-user fields the bypass needs downstream (teacher provisioning). */
interface BypassUser {
  id: string;
  email: string;
}

/** Look up the Claude-access user; create it if missing (when allowed).
 *  Returns the auth user (id + email), or throws if provisioning is
 *  disabled and the user does not exist. */
async function ensureUser(email: string): Promise<BypassUser> {
  const admin = getAdminClient();
  // listUsers is the only stable way to find a user by email on the
  // admin client. The page size of 1000 covers any school deployment.
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) throw listErr;
  const existing = list.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (existing) return { id: existing.id, email: existing.email ?? email };

  if (process.env.CLAUDE_BYPASS_PROVISION === "0") {
    throw new Error(
      `Claude bypass user ${email} is not registered and provisioning is disabled.`,
    );
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser(
    {
      email,
      email_confirm: true,
    },
  );
  if (createErr) throw createErr;
  const newUser = created?.user;
  if (!newUser?.id) {
    throw new Error("createUser returned no user id");
  }
  return { id: newUser.id, email: newUser.email ?? email };
}

/** Mint a Supabase session for the Claude-access user and write the
 *  auth cookies onto the supplied NextResponse. The flow:
 *
 *   1. Ensure the user exists (provision if needed).
 *   2. Use the admin client to generate a magic-link token_hash for the
 *      user (no email is actually sent — we just want the hash).
 *   3. Construct a per-request server client whose cookies write to the
 *      supplied response. Call `verifyOtp({ token_hash, type: 'email' })`
 *      on that server client to redeem the hash → session cookies are
 *      written onto the response.
 *
 *  Returns the response (with session cookies attached). On any failure
 *  the response is returned unchanged and the bypass falls through to
 *  the normal SSO redirect. */
async function mintSession(
  request: NextRequest,
  response: NextResponse,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const email = process.env.CLAUDE_USER_EMAIL;
  if (!email) return { ok: false, reason: "CLAUDE_USER_EMAIL not set" };

  let bypassUser: BypassUser;
  try {
    bypassUser = await ensureUser(email);
  } catch (err) {
    return {
      ok: false,
      reason: `ensureUser failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const admin = getAdminClient();

  // Provision the teacher + grade-assignment rows so RLS-gated reads/writes
  // work for the bypass user (ultraplan §6). Gated behind the same provisioning
  // flag as auth-user creation: CLAUDE_BYPASS_PROVISION="0" disables it. When
  // provisioning is ENABLED, denial is FATAL — minting a session whose user has
  // no valid tenant/grade anchor is an authorization ambiguity (a live session
  // for an account that may not belong to this tenant). Return ok:false so no
  // session is left behind; both callers audit `result.reason` (which carries
  // the `teacher_provision: …` detail) so the denial signal is preserved.
  if (process.env.CLAUDE_BYPASS_PROVISION !== "0") {
    // CONVERGENCE (ultraplan Wave 1): the single provisioning hook, shared with
    // /auth/gsi and the OAuth callback. `ensureTeacherRecord` branches on
    // `PROVISIONING_MODE` internally (default "domain"); under "individual" the
    // bypass user gets its own workspace too (ultraplan §8 R9) once Wave 3 lands.
    const provision = await ensureTeacherRecord(admin, bypassUser);
    if (!provision.ok) {
      return {
        ok: false,
        reason: `teacher_provision: ${provision.reason ?? "unknown"}`,
      };
    }
  }
  const { data: linkData, error: linkErr } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
  if (linkErr || !linkData?.properties?.hashed_token) {
    return {
      ok: false,
      reason: `generateLink failed: ${linkErr?.message ?? "no hashed_token"}`,
    };
  }
  const tokenHash = linkData.properties.hashed_token;

  // Per-request server client whose setAll mutates the SAME response we
  // hand back to Next.js. The cookies it writes are the Supabase auth
  // session cookies the middleware-side getUser() call will read on the
  // next pass.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { error: verifyErr } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });
  if (verifyErr) {
    return { ok: false, reason: `verifyOtp failed: ${verifyErr.message}` };
  }
  return { ok: true };
}

// ── Strip the token from the response-cookie / redirect URL ────────────

/** Remove every bypass-related param (`?claude=`, `?token=`) from a URL
 *  so a downstream redirect or log line doesn't echo the secret back. */
export function stripBypassParam(url: URL): URL {
  const next = new URL(url);
  next.searchParams.delete(BYPASS_PARAM);
  next.searchParams.delete("token");
  return next;
}

// ── Middleware entrypoint ───────────────────────────────────────────────

interface BypassResult {
  /** True when the request has been authenticated as the Claude user;
   *  the middleware should skip the normal SSO check and let the request
   *  proceed with the response we mutated. */
  bypassed: boolean;
  /** Response object with session cookies (or unchanged if not bypassed). */
  response: NextResponse;
}

/** Strip the bypass secret from the LIVE request URL, in place, so a downstream
 *  fall-through (the SSO gate's `/login?next=<original-url>` bounce) cannot copy
 *  `?claude=`/`?token=` into history / logs / Referer. Mutating
 *  `request.nextUrl.searchParams` is reflected in `request.nextUrl.search`,
 *  which `lib/supabase/middleware.ts` reads when it builds the login redirect.
 *  Used on every URL-sourced fall-through (rate-limited, invalid, mint-failure)
 *  so no valid-or-otherwise token survives into the next hop. */
function scrubBypassParamsInPlace(request: NextRequest): void {
  request.nextUrl.searchParams.delete(BYPASS_PARAM);
  request.nextUrl.searchParams.delete("token");
}

/** Called from `lib/supabase/middleware.ts` before the SSO gate. When
 *  the request carries a valid Claude bypass token this mints a session
 *  on the response and reports bypassed=true. Otherwise it reports
 *  bypassed=false and the caller falls through to the normal auth flow. */
export async function tryClaudeBypassInMiddleware(
  request: NextRequest,
): Promise<BypassResult> {
  const extracted = extractToken(request);
  if (!extracted)
    return { bypassed: false, response: NextResponse.next({ request }) };

  const pathname = request.nextUrl.pathname;
  const userAgent = request.headers.get("user-agent");

  if (!recordHit()) {
    void audit({
      ok: false,
      pathname,
      userAgent,
      reason: "rate_limited",
    });
    // Scrub before falling through so a rate-limited (but possibly VALID) token
    // doesn't ride the SSO bounce into /login?next=… (token-leak hardening).
    if (extracted.source === "url") scrubBypassParamsInPlace(request);
    return { bypassed: false, response: NextResponse.next({ request }) };
  }

  if (!(await isValidToken(extracted.token))) {
    void audit({
      ok: false,
      pathname,
      userAgent,
      reason: "invalid_token",
    });
    if (extracted.source === "url") scrubBypassParamsInPlace(request);
    return { bypassed: false, response: NextResponse.next({ request }) };
  }

  // Response shape depends on where the token came from:
  //
  //   • URL param (?claude= or ?token=) → redirect to a clean URL so
  //     the secret doesn't echo in the browser URL bar or history. On
  //     /auth/claude-login the clean URL is the `?next` value; on any
  //     other route it is the same URL with the token param stripped.
  //
  //   • Authorization Bearer header → continue with the current
  //     response (NextResponse.next) and just attach the freshly-minted
  //     session cookies. Redirecting in the header case causes follow-
  //     redirect clients (curl -L, fetch with redirect:follow) to
  //     re-send the header on the redirected request, which fires the
  //     bypass again, which redirects again — an infinite loop until
  //     the client hits its max-redirect ceiling. Skipping the redirect
  //     short-circuits the loop and is safe because a header doesn't
  //     show up in the URL bar.
  let response: NextResponse;
  if (extracted.source === "url") {
    const isLoginEndpoint = request.nextUrl.pathname === "/auth/claude-login";
    const target = isLoginEndpoint
      ? new URL(
          safeNext(request.nextUrl.searchParams.get("next")),
          request.nextUrl.origin,
        )
      : stripBypassParam(request.nextUrl);
    response = NextResponse.redirect(target);
  } else {
    response = NextResponse.next({ request });
  }

  const result = await mintSession(request, response);
  if (!result.ok) {
    void audit({
      ok: false,
      pathname,
      userAgent,
      reason: result.reason,
    });
    // Fall through to the normal SSO gate (no session was minted). For a
    // URL-sourced token we must NOT let the secret ride along — it still sits
    // in `?claude=`/`?token=`, and the SSO gate would copy `request.nextUrl`
    // (including the secret) into `/login?next=…` (browser history, logs,
    // Referer). Scrub it from the live request URL IN PLACE so the downstream
    // bounce is clean. A redirect here would be discarded — the middleware only
    // returns our response when `bypassed` is true — so the in-place scrub is
    // the mechanism that actually works. The header-sourced case carries no URL
    // secret. (This path is now more reachable since provisioning denial is
    // fatal.)
    if (extracted.source === "url") scrubBypassParamsInPlace(request);
    return { bypassed: false, response: NextResponse.next({ request }) };
  }

  void audit({ ok: true, pathname, userAgent });
  return { bypassed: true, response };
}

// ── Route-handler entrypoint (cookie redirect) ──────────────────────────

/** Called from `/auth/claude-login` route handler. Validates the token,
 *  mints a session, and returns a redirect to the next path. */
export async function handleClaudeLogin(
  request: NextRequest,
): Promise<NextResponse> {
  const extracted = extractToken(request);
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const pathname = request.nextUrl.pathname;
  const userAgent = request.headers.get("user-agent");

  if (!extracted) {
    void audit({ ok: false, pathname, userAgent, reason: "no_token" });
    return new NextResponse("Missing token", { status: 401 });
  }
  if (!recordHit()) {
    void audit({ ok: false, pathname, userAgent, reason: "rate_limited" });
    return new NextResponse("Too many requests", { status: 429 });
  }
  if (!(await isValidToken(extracted.token))) {
    void audit({ ok: false, pathname, userAgent, reason: "invalid_token" });
    return new NextResponse("Invalid token", { status: 401 });
  }

  const target = new URL(next, request.nextUrl.origin);
  const response = NextResponse.redirect(target);

  const result = await mintSession(request, response);
  if (!result.ok) {
    void audit({ ok: false, pathname, userAgent, reason: result.reason });
    // REDIRECT to a clean URL rather than returning an inline body on the
    // original `/auth/claude-login?token=<secret>` URL. The redirect both
    // (a) removes the secret from the address bar / history going forward and
    // (b) avoids echoing the internal `result.reason` to the client. The full
    // reason is preserved in the audit log above for the owner to inspect.
    // (Mint failure is now more reachable since provisioning denial is fatal.)
    return NextResponse.redirect(
      new URL("/login?error=auth", request.nextUrl.origin),
    );
  }
  void audit({ ok: true, pathname, userAgent });
  return response;
}

// Re-export the open-redirect guard so existing importers that pull it from
// this module (`app/auth/callback/route.ts`, `tests/claude-bypass.test.ts`)
// keep working unchanged. The implementation now lives in `lib/safe-path.ts`
// (dependency-free) so client components can share it (audit #21).
export { safeRelativePath };

/**
 * Back-compat alias used throughout this module. Identical to
 * {@link safeRelativePath}; kept so existing call sites read naturally.
 */
function safeNext(next: string | null): string {
  return safeRelativePath(next);
}
