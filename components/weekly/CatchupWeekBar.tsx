"use client";

// CatchupWeekBar.tsx — the Layer-2 in-grid "🔥 N items not covered" banner.
//
// Sits between the WeeklyShell's body chrome and the WeeklyGrid. Renders
// only when:
//   1. The global Catch-up feature is enabled (Settings toggle ON), AND
//   2. The current week has at least one uncovered item, AND
//   3. The current week has NOT been dismissed by the teacher.
//
// Dismissing the bar via the ✕ marks the current week as dismissed, so the
// banner disappears for that week — but reappears on any OTHER week with
// uncovered lessons. The top-bar flame badge surfaces the rollup count
// regardless of bar dismissal (see catchup-flame-button.tsx).
//
// This component reads all of its state from hooks (useCatchup, useAppState,
// usePlanner) — no props. That keeps the WeeklyShell injection a one-liner
// and lets the bar continue working if the shell ever reorders panels.

import Link from "next/link";
import type { ReactNode } from "react";
import { useAppState } from "@/lib/app-state";
import { useCatchup } from "@/lib/catchup-state";
import { countForWeek } from "@/lib/catchup-data";
import { usePlanner } from "@/lib/planner-store";
import styles from "./CatchupWeekBar.module.css";

export function CatchupWeekBar(): ReactNode {
  const { week } = useAppState();
  const { enabled, isWeekDismissed, dismissWeek, actions } = useCatchup();
  const { lessons } = usePlanner();

  // Layer-1 gate: feature flag off ⇒ no bar.
  if (!enabled) return null;

  // The dismissed-week set determines whether THIS week is hidden.
  if (isWeekDismissed(week)) return null;

  // Re-derive on each render — the count is cheap (single pass over the
  // week's lessons) and stays in lockstep with the planner-store mutations.
  const count = countForWeek(lessons, week, actions);
  if (count === 0) return null;

  return (
    <div className={styles.bar} role="region" aria-label="Catch-up summary">
      {/* Eyebrow + headline — flame icon + "N items not covered" copy. */}
      <span className={styles.eyebrow}>
        <FlameIcon />
        Catch-up
      </span>
      <span className={styles.count}>
        {count === 1
          ? "1 item not covered this week"
          : `${count} items not covered this week`}
      </span>

      {/* Push the trailing actions to the right edge. */}
      <span className={styles.spacer} aria-hidden="true" />

      {/* "View all" — the deep-link into the dedicated Catch-up screen. */}
      <Link href="/catch-up" className={styles.viewAll}>
        View all
      </Link>

      {/* Dismiss — marks THIS week as dismissed. The bar reappears on any
          other week with uncovered items; the rollup count still surfaces
          in the top-bar flame badge. */}
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => dismissWeek(week)}
        aria-label="Dismiss catch-up bar for this week"
        title="Hide the catch-up summary for this week — it'll come back when new lessons fall behind"
      >
        <CloseIcon />
      </button>
    </div>
  );
}

// ── Inline SVGs ──────────────────────────────────────────────────────────
// Match the in-bar icon vocabulary used by top-bar.tsx — single-stroke,
// 18×18 viewBox, currentColor. The flame is a teardrop body with a flick
// at the top.

function FlameIcon(): ReactNode {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8.5 14.5C8.5 17 10 19 12 19c2 0 4-2 4-4.5 0-1.5-1-2.5-2-3.5.5 2-1 2.5-1 2.5 0-2-1-3-1-4.5 0-1 .5-2 1-2.5C9 8 8.5 12 8.5 14.5z" />
    </svg>
  );
}

function CloseIcon(): ReactNode {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 2L12 12M12 2L2 12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
