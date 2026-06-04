// callback/route.ts — OAuth callback for Supabase Auth (Google SSO).
//
// Supabase redirects here after Google sign-in with a `?code=` param.
// We exchange that code for a session (cookies are written by the
// server client), then forward the teacher on to wherever they were
// originally headed.

import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { ensureTeacherRecord } from "@/lib/supabase/ensure-teacher";
// Shared open-redirect guard (audit #21). Only same-origin relative paths
// survive; anything absolute / protocol-relative / backslash-tricked falls
// back to the safe default. Defined once in claude-bypass.ts and reused here.
import { safeRelativePath } from "@/lib/claude-bypass";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeRelativePath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data: exchanged, error } =
      await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Idempotently provision the teacher + grade-assignment rows so RLS-gated
      // queries succeed for this user (ultraplan §6). The SSO path ALWAYS
      // ensures the teacher record (unlike the bypass, which gates on a flag).
      // Failure is non-fatal — login still proceeds; the user sees denied data
      // until a later request provisions successfully.
      const authUser = exchanged?.user;
      if (authUser?.id) {
        try {
          await ensureTeacherRecord(getAdminClient(), {
            id: authUser.id,
            email: authUser.email,
          });
        } catch {
          // Admin client unconfigured or transient failure — never block login.
        }
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
