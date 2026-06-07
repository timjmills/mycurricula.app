// app/invite/[token]/page.tsx — invite acceptance screen.
//
// This is a Server Component. It:
//   1. Checks whether the visitor is authenticated via the Supabase session
//      cookie. Unauthenticated visitors are redirected to
//      /login?next=/invite/<token> (sanitized, same guard used everywhere).
//   2. Renders the InviteAccept client component, which auto-redeems the
//      invite on mount and displays the result status.
//
// The page sits outside the (planner) route group so it renders with only the
// root layout (ThemeProvider + fonts) — no top nav, no side panels. An invited
// teacher may not yet belong to any workspace, so the full app shell is not
// appropriate here.
//
// RESPONSIVE: renders a single centered card — same pattern as /login.
// Verified at 360 / 768 / 1280 (see bottom of this file for rationale).

import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InviteAccept } from "@/components/invite/InviteAccept";
import styles from "./page.module.css";

interface InvitePageProps {
  // Next.js passes dynamic params as a Promise in the App Router.
  params: Promise<{ token: string }>;
}

export default async function InvitePage({
  params,
}: InvitePageProps): Promise<ReactNode> {
  // ── Decode and basic-validate the token ────────────────────────────────
  // The token comes from the URL path segment. Decode percent-encoding so
  // URL-safe base64 tokens (+ / =) arrive intact. We only strip whitespace
  // here — real validation (format, existence, expiry) happens in the SQL.
  const { token: rawToken } = await params;
  const decodedToken = decodeURIComponent(rawToken).trim();

  // ── Auth gate ──────────────────────────────────────────────────────────
  // Validate the signed-in user with the auth server via getUser() — matches
  // the codebase convention (middleware + every client hook use getUser, which
  // verifies the JWT, unlike getSession which only decodes the cookie). No user
  // → bounce to login with next= set to this invite URL (percent-encoded to
  // survive the /login?next= query param). The login page preserves `next`
  // through the OAuth / magic-link flows and the callback routes back here.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Build the `next` destination for after sign-in. `rawToken` comes from
    // params.token (a URL path segment — Next.js strips `?` and `#` from path
    // segments at the router level). We re-encode it here to ensure any
    // remaining special characters are safe inside the query value.
    // The leading `/invite/` prefix is a trusted constant; only the token
    // portion is user-supplied, and it is percent-encoded.
    const nextPath = `/invite/${encodeURIComponent(rawToken)}`;
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  // ── Render the acceptance UI ──────────────────────────────────────────
  // The InviteAccept component handles the full state machine: loading,
  // auto-redeem on mount (calling the server action), and rendering each
  // possible status with appropriate copy and CTAs.
  return (
    <main className={`cp-root ${styles.page}`}>
      <section className={styles.wrapper} aria-labelledby="invite-heading">
        {/* Wordmark — minimal brand anchor, matches the /login card style */}
        <div className={styles.wordmark} aria-label="MyCurricula">
          <span className={styles.wordmarkApp}>
            mycurricula<span className={styles.wordmarkTld}>.app</span>
          </span>
        </div>

        {/* Screen-reader-only heading for the section */}
        <h2 id="invite-heading" className={styles.srOnly}>
          Team invite
        </h2>

        {/* Invite acceptance state machine — client component */}
        <InviteAccept rawToken={decodedToken} />
      </section>
    </main>
  );
}
