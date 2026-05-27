"use client";

// catchup-flame-button.tsx — the Layer-3 top-bar flame badge.
//
// A small icon button placed in the top bar's right cluster (before the
// to-do button). Renders only when:
//   1. The global Catch-up feature is enabled (Settings toggle ON), AND
//   2. There is at least one uncovered lesson across the year so far.
//
// The badge complements (not replaces) the per-week in-grid CatchupWeekBar:
// the bar surfaces the count for THIS week and is per-week dismissible; the
// flame badge surfaces the rollup across every past-or-current week and
// stays visible as long as anything remains uncovered.
//
// Click → navigate to /catch-up (the dedicated triage screen).

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useAppState } from "@/lib/app-state";
import { useCatchup } from "@/lib/catchup-state";
import { coverageSummary } from "@/lib/catchup-data";
import { usePlanner } from "@/lib/planner-store";
import { Tooltip } from "@/components/ui";
import topBarStyles from "./top-bar.module.css";
import styles from "./catchup-flame-button.module.css";

export function CatchupFlameButton(): ReactNode {
  const router = useRouter();
  const { week } = useAppState();
  const { enabled, actions } = useCatchup();
  const { lessons } = usePlanner();

  // Layer-1 gate: feature flag off ⇒ no badge.
  if (!enabled) return null;

  // Rollup across every past-or-current week. coverageSummary already
  // applies per-item action overlays, so a "Mark done" in the Catch-up
  // screen immediately drops out of the count.
  const { uncovered } = coverageSummary(lessons, {
    currentWeek: week,
    actions,
  });

  if (uncovered === 0) return null;

  const label = `Open Catch-up screen (${uncovered} item${uncovered === 1 ? "" : "s"} not covered)`;
  const displayCount = uncovered > 99 ? "99+" : String(uncovered);

  // W2-B5: the in-grid CatchupWeekBar already explains the concept for
  // the current week; the flame is the rollup across every past-or-
  // current week and was previously just labelled with the count. Lead
  // with the concept so a first-time teacher knows WHAT Catch-up is,
  // then the live count. Dismissible (not high-consequence).
  const tooltipContent = (
    <>
      <strong>Catch-up</strong> — lessons that fell behind and need a make-up
      plan. {uncovered} item{uncovered === 1 ? "" : "s"} pending. Click to
      triage.
    </>
  );

  return (
    <div className={topBarStyles.badgeWrap}>
      <Tooltip
        content={tooltipContent}
        side="bottom"
        tooltipId="catchup-flame-button"
      >
        <button
          type="button"
          className={styles.flameBtn}
          aria-label={label}
          onClick={() => router.push("/catch-up")}
        >
          <FlameIcon />
        </button>
      </Tooltip>
      <span
        className={`${topBarStyles.badge} ${styles.catchupBadge}`}
        aria-hidden="true"
      >
        {displayCount}
      </span>
    </div>
  );
}

// ── Inline SVG ───────────────────────────────────────────────────────
// Single-stroke flame — teardrop body with an inner flick. Matches the
// 18×18 icon vocabulary of the surrounding top-bar buttons so the button
// reads as a sibling of the to-do / comments icons.

function FlameIcon(): ReactNode {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Outer teardrop — the flame body. */}
      <path d="M12 3c-1.5 2.5-4.5 4-4.5 8 0 3.5 2.5 6 4.5 6s4.5-2.5 4.5-6c0-2.5-2-3.5-2-6 0 1.5-1 2.5-2.5 2.5 0-2-.5-3-0-4.5z" />
      {/* Inner flick — a small wisp inside the body to signal a flame, not
          a teardrop. Lower position, smaller arc. */}
      <path d="M12 13c-1 .5-1.5 1.5-1.5 2.5 0 1 .5 1.5 1.5 1.5s1.5-.5 1.5-1.5-.5-2-1.5-2.5z" />
    </svg>
  );
}
