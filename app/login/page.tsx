// login/page.tsx — the sign-in screen.
//
// A Server Component rendering a single centered card: the MyCurricula
// wordmark, a one-line product description, and a tabbed sign-in section
// offering Google (the fast path) and email magic-link (for teachers who
// prefer email-only or lack a school Google account). There is no separate
// registration form — both flows handle sign-up and sign-in as one.
//
// app/login lives outside the (planner) route group, so it renders with only
// the root layout (ThemeProvider + fonts) — no top bar, no side panels.
//
// The OAuth callback route redirects back here with `?error=auth` when a
// sign-in attempt fails, or `?error=provisioning` when the account signed in
// successfully but is not allow-listed for any school (fail-closed tenant
// provisioning, audit #3); each case renders an inline alert above the buttons.

import type { ReactNode } from "react";
import { SignInTabs } from "./SignInTabs";
import styles from "./page.module.css";

interface LoginPageProps {
  // Next.js 15 passes searchParams as a promise to Server Components.
  // `next` is set by the middleware when it bounces a logged-out deep link.
  searchParams: Promise<{ error?: string; next?: string }>;
}

export default async function LoginPage({
  searchParams,
}: LoginPageProps): Promise<ReactNode> {
  const { error, next } = await searchParams;
  const hasAuthError = error === "auth";
  const hasProvisioningError = error === "provisioning";

  return (
    <main className={`cp-root ${styles.page}`}>
      <section className={styles.card} aria-labelledby="login-heading">
        {/* ── Wordmark + brand mottos ───────────────────────────────────
            Two-motto stack sits directly under the wordmark — the brand
            voice for every teacher landing on the sign-in screen. Motto
            1 is the manifesto (italic, slightly larger, deeper ink);
            motto 2 is the product promise, broken onto two lines so the
            two halves of the idea — curriculum, then teaching + learning
            — sit visually parallel. */}
        <div className={styles.wordmark}>
          <span className={styles.eyebrow}>For teaching teams</span>
          <span className={styles.wordmarkApp}>
            mycurricula<span className={styles.wordmarkTld}>.app</span>
          </span>
          <p className={styles.motto}>Built for teachers, by teachers.</p>
          <p className={styles.mottoSecondary}>
            Connecting curriculum
            <br />
            to your teaching and their learning
          </p>
        </div>

        <h1 id="login-heading" className={styles.heading}>
          Sign in to your planner
        </h1>

        {/* ── Sign-in failure notice ────────────────────────────────── */}
        {hasAuthError && (
          <p className={styles.error} role="alert">
            We couldn&rsquo;t sign you in. Please try again.
          </p>
        )}
        {hasProvisioningError && (
          <p className={styles.error} role="alert">
            Your account isn&rsquo;t set up for this school yet. Please contact
            your school lead.
          </p>
        )}

        {/* ── Sign-in methods — Google + email magic-link ────────────── */}
        <div className={styles.action}>
          <SignInTabs next={next} />
        </div>

        <p className={styles.fineprint}>
          Your first sign-in creates your account. No separate registration
          needed — sign in with Google or a one-click email link.
        </p>
      </section>
    </main>
  );
}
