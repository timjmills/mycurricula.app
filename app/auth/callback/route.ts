// callback/route.ts — OAuth callback for Supabase Auth (Google SSO).
//
// Supabase redirects here after Google sign-in with a `?code=` param.
// We exchange that code for a session (cookies are written by the
// server client), then forward the teacher on to wherever they were
// originally headed.

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { ensureTeacherRecord } from "@/lib/supabase/ensure-teacher";
// Shared open-redirect guard (audit #21). Only same-origin relative paths
// survive; anything absolute / protocol-relative / backslash-tricked falls
// back to the safe default. Defined once in claude-bypass.ts and reused here.
import { safeRelativePath } from "@/lib/claude-bypass";

/**
 * Expire every Supabase auth cookie (`sb-`-prefixed) on the outgoing response.
 * Mirrors the guarantee in `/auth/gsi`: the fail-closed property must NOT depend
 * on `signOut()` succeeding — a transient logout failure after a successful code
 * exchange would otherwise leave the just-minted session cookie alive on a
 * denial redirect. Never throws (a cookie-cleanup error must not turn a
 * fail-closed denial into an unhandled 500 that skips the redirect).
 */
async function clearSupabaseCookies(res: NextResponse): Promise<void> {
  try {
    const store = await cookies();
    for (const cookie of store.getAll()) {
      if (cookie.name.startsWith("sb-")) {
        res.cookies.set(cookie.name, "", { maxAge: 0, path: "/" });
      }
    }
  } catch {
    // Reading the cookie store can't meaningfully fail here; swallow defensively.
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeRelativePath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data: exchanged, error } =
      await supabase.auth.exchangeCodeForSession(code);

    if (!error && exchanged?.user?.id) {
      const authUser = exchanged.user;

      // ── FAIL-CLOSED tenant provisioning (audit #3) ──────────────────────
      // Identical posture to /auth/gsi. Without this, a valid-Google-account-
      // but-wrong-tenant user could bypass the GSI gate entirely by driving
      // Supabase's hosted OAuth flow straight to this callback and keep a live
      // session despite a provisioning denial. Provisioning MUST succeed before
      // the session cookie is allowed to stick.
      let provisioned = false;
      try {
        const provision = await ensureTeacherRecord(getAdminClient(), {
          id: authUser.id,
          email: authUser.email,
        });
        provisioned = provision.ok;
        if (!provision.ok) {
          console.warn("[auth] SSO teacher provisioning denied", {
            reason: provision.reason,
            email: authUser.email,
          });
        }
      } catch (err) {
        // Admin client unconfigured / transient DB error — fail closed.
        console.error("[auth] SSO teacher provisioning failed", err);
      }

      if (!provisioned) {
        try {
          await supabase.auth.signOut();
        } catch (err) {
          console.warn(
            "[auth] SSO signOut failed (cookies cleared on response)",
            err,
          );
        }
        const denied = NextResponse.redirect(
          `${origin}/login?error=provisioning`,
        );
        await clearSupabaseCookies(denied);
        return denied;
      }

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
