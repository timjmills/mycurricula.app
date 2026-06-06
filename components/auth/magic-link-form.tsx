"use client";

// magic-link-form.tsx — email magic-link sign-in form.
//
// Calls POST /auth/magic-link with { email, next } and shows a "check your
// email" confirmation state. No email enumeration: the server returns the
// same generic success whether or not the address is registered.
//
// The `next` prop preserves the in-app destination through the sign-in flow
// exactly as the Google sign-in button does — it is embedded in the server's
// emailRedirectTo so the callback URL carries it forward.

import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import styles from "./magic-link-form.module.css";

interface MagicLinkFormProps {
  // Where to land after a successful sign-in. Passed through to the server
  // so Supabase embeds it in emailRedirectTo → callback → final redirect.
  next?: string;
}

type FormState = "idle" | "sending" | "sent" | "error" | "rate_limited";

/**
 * Email magic-link sign-in form. Renders an email input and a send button;
 * on success transitions to a "check your email" confirmation view with a
 * resend link.
 */
export function MagicLinkForm({ next }: MagicLinkFormProps): ReactNode {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function sendLink(emailVal: string, isResend = false): Promise<void> {
    setState("sending");
    setErrorMsg(null);

    try {
      const res = await fetch("/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailVal, next, resend: isResend }),
      });

      if (res.status === 429) {
        setState("rate_limited");
        setErrorMsg(
          "Too many requests — please wait a minute then try again.",
        );
        return;
      }

      if (!res.ok) {
        // Other server errors — rare; show a generic retry message.
        setState("error");
        setErrorMsg("Something went wrong. Please try again.");
        return;
      }

      // Generic success — "check your email" whether or not account exists.
      setState("sent");
    } catch {
      setState("error");
      setErrorMsg("Couldn't reach the server. Please check your connection.");
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) return;
    void sendLink(trimmed);
  }

  function handleResend(): void {
    const trimmed = email.trim();
    if (!trimmed) return;
    void sendLink(trimmed, true);
  }

  // ── Sent state — "check your email" confirmation ─────────────────────────
  if (state === "sent") {
    return (
      <div className={styles.sent} role="status" aria-live="polite">
        <span className={styles.sentIcon} aria-hidden="true">✉</span>
        <p className={styles.sentHeading}>Check your inbox</p>
        <p className={styles.sentBody}>
          We sent a sign-in link to{" "}
          <strong className={styles.sentEmail}>{email}</strong>. Click it to
          continue — the link is valid for one hour.
        </p>
        <p className={styles.resendRow}>
          Didn&rsquo;t get it?{" "}
          <button
            type="button"
            className={styles.resendBtn}
            onClick={handleResend}
            title="Re-send the magic link to the same email address"
          >
            Resend link
          </button>
        </p>
      </div>
    );
  }

  // ── Sending / idle / error — the form ────────────────────────────────────
  const isBusy = state === "sending";

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit}
      aria-label="Sign in with email"
      noValidate
    >
      {/* Error notice — shown above the input so it appears before the action
          in reading order; aria-live informs AT users of late-arriving errors. */}
      {(state === "error" || state === "rate_limited") && errorMsg && (
        <p className={styles.error} role="alert" aria-live="assertive">
          {errorMsg}
        </p>
      )}

      <label htmlFor="magic-link-email" className={styles.label}>
        Your school email
      </label>

      <input
        id="magic-link-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@school.edu"
        required
        disabled={isBusy}
        className={styles.input}
        aria-describedby={
          state === "error" || state === "rate_limited"
            ? "magic-link-error"
            : undefined
        }
      />

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className={styles.submitBtn}
        loading={isBusy}
        disabled={isBusy}
        tooltip="Send a sign-in link to your school email — no password needed"
      >
        {isBusy ? "Sending…" : "Send sign-in link"}
      </Button>

      <p className={styles.hint}>
        We&rsquo;ll email you a secure one-click link. No password needed.
      </p>
    </form>
  );
}
