"use client";

// components/invite/InviteAccept.tsx — invite acceptance state machine.
//
// Displayed on /invite/[token] after authentication is confirmed. Auto-redeems
// the invite on mount (no extra button click) and renders the result status
// with appropriate copy and CTAs for every case.
//
// Status matrix (SQL §A2 return contract):
//   accepted         → success → route into the app (team notebook)
//   already_member   → success (idempotent) → same CTA
//   already_accepted → friendly notice (invite already used)
//   email_mismatch   → mismatch error + fallback
//   expired          → invite stale + fallback
//   revoked          → invite cancelled + fallback
//   seat_full        → team at capacity + fallback
//   invalid          → bad/unknown token + fallback
// (The W-A 'existing_workspace' case is gone — the multi-workspace migration
// made redeeming a non-destructive ADD, so joining multiple workspaces just
// works; there is no "coming soon" dead-end to render anymore.)
//
// The "Join this team" primary button (shown in the interim loading/ready state
// before auto-redeem completes) is consequential (joins the teacher to a team)
// so it carries an always-on tooltip (required: true) per CLAUDE.md §4.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  redeemInviteAction,
  type RedeemResult,
  type RedeemStatus,
} from "@/app/invite/[token]/actions";
import styles from "./InviteAccept.module.css";

// ── Copy ──────────────────────────────────────────────────────────────────

const STATUS_COPY: Record<
  RedeemStatus | "loading" | "error",
  { heading: string; body: string; isSuccess: boolean }
> = {
  loading: {
    heading: "Joining your team…",
    body: "Verifying your invite — just a moment.",
    isSuccess: false,
  },
  accepted: {
    heading: "Welcome to the team!",
    body: "Your invite has been accepted. You now have access to your team's curriculum.",
    isSuccess: true,
  },
  already_member: {
    heading: "You're already on the team",
    body: "Good news — you're already a member of this team. Jump straight in.",
    isSuccess: true,
  },
  already_accepted: {
    heading: "Invite already used",
    body: "This invite link has already been accepted by another account. If you think this is a mistake, ask a team member to send a new invite.",
    isSuccess: false,
  },
  email_mismatch: {
    heading: "Wrong email address",
    body: "This invite was sent to a different email address. Sign in with the email your team lead invited, or ask them to re-send the invite to your current address.",
    isSuccess: false,
  },
  expired: {
    heading: "Invite link expired",
    body: "This invite link has expired. Ask your team lead to send a fresh one — they take just a moment to generate.",
    isSuccess: false,
  },
  revoked: {
    heading: "Invite was cancelled",
    body: "This invite link was cancelled by a team member. Ask your team lead to send a new invite.",
    isSuccess: false,
  },
  seat_full: {
    heading: "Team is at capacity",
    body: "The team has reached its maximum number of seats. Ask your team lead to free up a seat or contact support to expand your plan.",
    isSuccess: false,
  },
  invalid: {
    heading: "Link not recognised",
    body: "This invite link isn't valid or has already been fully used. Double-check the link in your email, or ask your team lead to send a new one.",
    isSuccess: false,
  },
  error: {
    heading: "Something went wrong",
    body: "We couldn't process your invite right now. Please try again, or contact support if the problem continues.",
    isSuccess: false,
  },
};

// ── Component ─────────────────────────────────────────────────────────────

interface InviteAcceptProps {
  // The raw URL token from the path segment — hashed server-side in the action.
  rawToken: string;
}

type UiState = "loading" | RedeemStatus | "error";

export function InviteAccept({ rawToken }: InviteAcceptProps): ReactNode {
  const [uiState, setUiState] = useState<UiState>("loading");
  const [result, setResult] = useState<RedeemResult | null>(null);
  // Guard against StrictMode double-invoke in dev
  const hasAttempted = useRef(false);

  useEffect(() => {
    if (hasAttempted.current) return;
    hasAttempted.current = true;

    void redeemInviteAction(rawToken).then((res) => {
      setResult(res);
      setUiState(res.error ? "error" : res.status);
    });
  }, [rawToken]);

  const copy =
    STATUS_COPY[uiState] ??
    STATUS_COPY["invalid"];
  const isSuccess = copy.isSuccess;

  // Destination for the "Go to planner" CTA — use the grade if available.
  const plannerHref = "/weekly";

  return (
    <div
      className={[
        styles.card,
        isSuccess ? styles.success : "",
        uiState === "loading" ? styles.loading : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-live="polite"
      aria-busy={uiState === "loading"}
    >
      {/* ── Status icon ────────────────────────────────────────────────── */}
      <div className={styles.iconWrap} aria-hidden="true">
        <StatusIcon state={uiState} />
      </div>

      {/* ── Copy ───────────────────────────────────────────────────────── */}
      <h1 className={styles.heading}>{copy.heading}</h1>
      <p className={styles.body}>{copy.body}</p>

      {/* Show unexpected error detail under the copy in non-production for
          debugging; never shown in production (no PII in the error field). */}
      {result?.error &&
        uiState === "error" &&
        process.env.NODE_ENV === "development" && (
          <p className={styles.devError}>{result.error}</p>
        )}

      {/* ── CTAs ───────────────────────────────────────────────────────── */}
      <div className={styles.actions}>
        {isSuccess ? (
          // Success path — navigate into the planner. Self-evident text "Go
          // to your planner" is the explanation; no onboarding tooltip needed
          // (CLAUDE.md §4: self-evident text buttons skip the tooltip).
          <Button
            variant="primary"
            size="lg"
            className={styles.cta}
            onClick={() => {
              window.location.assign(plannerHref);
            }}
          >
            Go to your planner
          </Button>
        ) : uiState !== "loading" ? (
          // Non-success terminal states — fallback CTA. The action of
          // "starting your own space" is consequential enough to warrant
          // an always-on tooltip (it creates a workspace for the user).
          <>
            <Tooltip
              content="Start your own planning workspace — independent of the invite"
              required
            >
              <Button
                variant="honey"
                size="lg"
                className={styles.cta}
                onClick={() => {
                  window.location.assign("/weekly");
                }}
              >
                Create your own space instead
              </Button>
            </Tooltip>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ── Status icon ───────────────────────────────────────────────────────────
// Simple inline SVG icons — no external icon library per the no-new-deps rule.

function StatusIcon({ state }: { state: UiState }): ReactNode {
  if (state === "loading") {
    return (
      <svg
        className={styles.spinner}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="42"
          strokeDashoffset="14"
        />
      </svg>
    );
  }

  const isSuccess = state === "accepted" || state === "already_member";

  if (isSuccess) {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={styles.icon} aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="var(--done)" />
        <path
          d="M7 12.5l3.5 3.5 6.5-7"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // All other non-loading states — a neutral info circle.
  return (
    <svg viewBox="0 0 24 24" fill="none" className={styles.icon} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="var(--ink-150)" />
      <path
        d="M12 8v4M12 16h.01"
        stroke="var(--ink-soft)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
