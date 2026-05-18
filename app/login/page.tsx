// login/page.tsx — the sign-in screen.
//
// A Server Component rendering a single centered card: the MyCurricula
// wordmark, a one-line product description, the Google sign-in button, and
// small print noting sign-in is via Google. There is no separate registration
// form — Google OAuth handles sign-up and sign-in as one flow.
//
// app/login lives outside the (planner) route group, so it renders with only
// the root layout (ThemeProvider + fonts) — no top bar, no side panels.
//
// The OAuth callback route redirects back here with `?error=auth` when a
// sign-in attempt fails; that case renders an inline alert above the button.

import type { ReactNode } from "react";
import { GoogleSignInButton } from "@/components/auth";
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

  return (
    <main className={`cp-root ${styles.page}`}>
      <section className={styles.card} aria-labelledby="login-heading">
        {/* ── Wordmark ──────────────────────────────────────────────── */}
        <div className={styles.wordmark}>
          <span className={styles.wordmarkApp}>MyCurricula</span>
        </div>

        <h1 id="login-heading" className={styles.heading}>
          Sign in to your planner
        </h1>
        <p className={styles.tagline}>
          Weekly curriculum planning for teaching teams.
        </p>

        {/* ── Sign-in failure notice ────────────────────────────────── */}
        {hasAuthError && (
          <p className={styles.error} role="alert">
            We couldn&rsquo;t sign you in. Please try again.
          </p>
        )}

        {/* ── Google OAuth — sign-up and sign-in are one flow ───────── */}
        <div className={styles.action}>
          <GoogleSignInButton next={next} />
        </div>

        <p className={styles.fineprint}>
          MyCurricula uses Google to sign in. No separate account or password to
          manage — your first sign-in creates your account.
        </p>
      </section>
    </main>
  );
}
