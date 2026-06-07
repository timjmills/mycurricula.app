// gsi/route.ts — server-side Google Identity Services sign-in completion.
//
// **Why this runs on the server (the core fix).**
// The login button receives a Google ID token IN THE BROWSER. The old flow
// then called `supabase.auth.signInWithIdToken()` client-side, which writes
// the session cookie immediately — BEFORE any fail-closed tenant provisioning
// could run. That let a valid-Google-account-but-wrong-tenant user land a live
// session and only discover RLS-denied emptiness afterward (and, worse, kept
// an authenticated session alive for a disallowed domain).
//
// Completing the exchange here keeps the gate server-side: we sign in, then
// require `ensureTeacherRecord` to succeed under the email-domain allow-list,
// and on ANY failure we `signOut()` so NO session cookie is left behind.
//
// Nonce: the RAW nonce arrives in the request body and is forwarded to Supabase
// (Supabase hashes it and matches the hashed nonce baked into the token by
// google.accounts.id.initialize). See the button's file header for the split.

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { getAdminClient } from "@/lib/supabase/admin";
import { ensureTeacherRecord } from "@/lib/supabase/ensure-teacher";
import { createClient } from "@/lib/supabase/server";

interface GsiRequestBody {
  credential?: unknown;
  nonce?: unknown;
}

function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * Build an error response that is GUARANTEED to carry no live Supabase session,
 * even if `supabase.auth.signOut()` failed or threw. The fail-closed property
 * of this route must NOT depend on signOut() succeeding (its result is not
 * something we can rely on): a transient logout failure after a successful
 * `signInWithIdToken()` would otherwise leave the just-minted session cookie on
 * a 403/500 response, keeping a disallowed account signed in.
 *
 * Supabase auth cookies are written into the Next `cookies()` store by the
 * server client; we explicitly EXPIRE every `sb-`-prefixed cookie on the
 * outgoing response so it overrides any set-cookie the sign-in wrote.
 */
/** Sign out without letting a logout failure throw. The cookie-clearing in
 *  jsonErrorNoSession is the real fail-closed guarantee; this is best-effort
 *  server-side session teardown on top of it. */
async function safeSignOut(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn("[auth] GSI signOut failed (cookies cleared on response)", err);
  }
}

async function jsonErrorNoSession(
  error: string,
  status: number,
): Promise<NextResponse> {
  const res = jsonError(error, status);
  try {
    const store = await cookies();
    for (const cookie of store.getAll()) {
      // Supabase SSR cookies are prefixed `sb-` (e.g. `sb-<ref>-auth-token`).
      // Expire any we find so no auth cookie survives on this response.
      if (cookie.name.startsWith("sb-")) {
        res.cookies.set(cookie.name, "", { maxAge: 0, path: "/" });
      }
    }
  } catch {
    // Reading the cookie store can't meaningfully fail here, but never let a
    // cookie-cleanup error turn a fail-closed denial into a thrown 500 that
    // skips the error status entirely.
  }
  return res;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // CSRF/origin guard: reject cross-origin POSTs. A missing Origin header
  // (same-origin GET-like fetches, some non-browser clients) is allowed
  // through; a present-but-mismatched Origin is rejected.
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return jsonError("invalid_origin", 403);
  }

  let body: GsiRequestBody;
  try {
    body = (await request.json()) as GsiRequestBody;
  } catch {
    return jsonError("invalid_json", 400);
  }

  const credential =
    typeof body.credential === "string" ? body.credential.trim() : "";
  const nonce = typeof body.nonce === "string" ? body.nonce : "";
  if (!credential || !nonce) return jsonError("missing_credentials", 400);

  // The server client writes session cookies onto the response. Sign in first;
  // the cookie only "sticks" if provisioning below also succeeds (we signOut
  // and return an error otherwise, so the response carries no live session).
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: credential,
    // RAW nonce — Supabase hashes it and matches against the hashed nonce baked
    // into the token (see the button's file header).
    nonce,
  });

  if (error || !data.user?.id) {
    // No valid session expected, but sign out + clear cookies defensively in
    // case a partial session was written. jsonErrorNoSession guarantees the
    // response carries no auth cookie regardless of signOut()'s outcome.
    await safeSignOut(supabase);
    return jsonErrorNoSession("auth_failed", 401);
  }

  try {
    // Fail-closed tenant provisioning (audit #3). The service-role admin client
    // upserts the teacher + grade-assignment rows, gated on the email-domain
    // allow-list. A denial means this account is not provisioned for any tenant.
    // CONVERGENCE (ultraplan Wave 1): this is the single provisioning hook — the
    // OAuth callback and the Claude bypass call the same `ensureTeacherRecord`,
    // which branches on `PROVISIONING_MODE` internally.
    const provision = await ensureTeacherRecord(getAdminClient(), {
      id: data.user.id,
      email: data.user.email,
    });
    if (!provision.ok) {
      console.warn("[auth] GSI teacher provisioning denied", {
        reason: provision.reason,
        email: data.user.email,
      });
      await safeSignOut(supabase);
      return jsonErrorNoSession("provisioning_denied", 403);
    }
  } catch (err) {
    // Admin client unconfigured, transient DB error, etc. Fail closed: tear the
    // session down so an un-provisioned account never keeps a live session, and
    // leave a breadcrumb (the previous design swallowed this silently).
    console.error("[auth] GSI teacher provisioning failed", err);
    await safeSignOut(supabase);
    return jsonErrorNoSession("provisioning_failed", 500);
  }

  return NextResponse.json({ ok: true });
}
