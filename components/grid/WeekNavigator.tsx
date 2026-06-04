"use client";

// WeekNavigator.tsx — prev / next / jump-to-current week controls.
//
// Renders the sticky header above the Weekly grid. Week numbers are the
// only time anchor in the mock data (lessons carry a `week` field), so the
// navigator works purely in week-number space. The available span is
// derived from the lesson fixture by the parent.

import type { ReactNode } from "react";
import { Button, Tooltip } from "@/components/ui";
import { useLabels } from "@/lib/labels";
import { CatchupChip } from "./CatchupChip";
import styles from "./WeeklyGrid.module.css";

interface WeekNavigatorProps {
  /** The week currently displayed. */
  week: number;
  /** The teacher's "current" week — enables the jump-to-today control. */
  currentWeek: number;
  /** Lowest navigable week. */
  minWeek: number;
  /** Highest navigable week. */
  maxWeek: number;
  /** Step to an adjacent week. */
  onChange: (week: number) => void;
  /**
   * Opt the navigator into the compact catch-up chip beside the title.
   * Defaults off so other surfaces that reuse this navigator (e.g. the
   * weekly board) stay chip-free; the Weekly grid passes it `true`.
   */
  showCatchupChip?: boolean;
  /**
   * Optional far-right slot rendered AFTER the prev/next/today controls.
   * The Weekly view hosts its Grid|List|Schedule toggle here so the toggle
   * lives on the single shared week row and stays visible+functional in
   * every canvas mode (grid, list, and schedule — the schedule timeline has
   * no navigator of its own, so this lifted slot is the only place the
   * toggle can persist across all three). Left unset elsewhere.
   */
  actions?: ReactNode;
  /**
   * Heading level for the "Week N" title. Defaults to `h2`. The Weekly view
   * deleted its page-level title band, so this navigator is now that page's
   * top heading — it passes `h1` to keep exactly one page-level `<h1>` in the
   * a11y tree (WCAG 2.4.6 / 1.3.1). Surfaces that still sit under their own
   * page `<h1>` keep the `h2` default.
   */
  headingLevel?: "h1" | "h2";
}

/** Sticky week navigator: eyebrow + title + prev/next/today controls. */
export function WeekNavigator({
  week,
  currentWeek,
  minWeek,
  maxWeek,
  onChange,
  showCatchupChip = false,
  actions,
  headingLevel = "h2",
}: WeekNavigatorProps): ReactNode {
  const labels = useLabels();
  const isCurrent = week === currentWeek;
  const atStart = week <= minWeek;
  const atEnd = week >= maxWeek;
  const Heading = headingLevel;

  return (
    <header className={styles.navbar}>
      <div className={styles.navTitleWrap}>
        <div className={styles.navEyebrow}>Weekly plan</div>
        {/* h2 — the Weekly view's title band was removed, so this "Week N"
            heading is the view's top heading. Kept as h2 to sit under the
            app-shell chrome rather than competing as a second page h1. */}
        <Heading className={styles.navTitle}>
          {labels.week} {week}
          {isCurrent && <span className={styles.currentTag}>This week</span>}
        </Heading>
      </div>

      {/* Compact catch-up chip — sits just after the week title and deep-links
          to the /catch-up triage screen. Self-gates (renders nothing when the
          feature is off or the week has zero uncovered lessons). */}
      {showCatchupChip && <CatchupChip />}

      {/* View controls (Grid|List|Schedule + scope) — right-aligned, grouped
          with the prev/next/today nav at the trailing edge of the week row.
          Stays visible in every canvas mode (the schedule timeline has no
          navigator of its own). `.navActions` carries margin-left:auto to push
          the whole trailing cluster right. */}
      {actions && <div className={styles.navActions}>{actions}</div>}

      <div className={styles.navControls}>
        <Tooltip
          content="Jump back one school week — useful when you need to check what was taught last week before today's class"
          side="bottom"
        >
          <Button
            variant="icon"
            size="sm"
            iconAriaLabel="Previous week"
            className={styles.navArrow}
            onClick={() => onChange(week - 1)}
            disabled={atStart}
            tooltip="Step back one school week"
          >
            <ChevronLeft />
          </Button>
        </Tooltip>

        <Button
          variant="ghost"
          size="sm"
          className={styles.navToday}
          onClick={() => onChange(currentWeek)}
          disabled={isCurrent}
          tooltip="Jump the planner back to the current school week"
        >
          Today
        </Button>

        <Tooltip
          content="Jump forward one school week — preview upcoming lessons or prep ahead of time"
          side="bottom"
        >
          <Button
            variant="icon"
            size="sm"
            iconAriaLabel="Next week"
            className={styles.navArrow}
            onClick={() => onChange(week + 1)}
            disabled={atEnd}
            tooltip="Step forward one school week"
          >
            <ChevronRight />
          </Button>
        </Tooltip>
      </div>
    </header>
  );
}

function ChevronLeft(): ReactNode {
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
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRight(): ReactNode {
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
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
