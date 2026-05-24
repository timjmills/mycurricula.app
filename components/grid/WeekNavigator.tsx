"use client";

// WeekNavigator.tsx — prev / next / jump-to-current week controls.
//
// Renders the sticky header above the Weekly grid. Week numbers are the
// only time anchor in the mock data (lessons carry a `week` field), so the
// navigator works purely in week-number space. The available span is
// derived from the lesson fixture by the parent.

import type { ReactNode } from "react";
import { Button, Tooltip } from "@/components/ui";
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
}

/** Sticky week navigator: eyebrow + title + prev/next/today controls. */
export function WeekNavigator({
  week,
  currentWeek,
  minWeek,
  maxWeek,
  onChange,
}: WeekNavigatorProps): ReactNode {
  const isCurrent = week === currentWeek;
  const atStart = week <= minWeek;
  const atEnd = week >= maxWeek;

  return (
    <header className={styles.navbar}>
      <div className={styles.navTitleWrap}>
        <div className={styles.navEyebrow}>Weekly plan</div>
        <h1 className={styles.navTitle}>
          Week {week}
          {isCurrent && <span className={styles.currentTag}>This week</span>}
        </h1>
      </div>

      <div className={styles.navControls}>
        <Tooltip content="Previous week" side="bottom">
          <Button
            variant="icon"
            size="sm"
            iconAriaLabel="Previous week"
            className={styles.navArrow}
            onClick={() => onChange(week - 1)}
            disabled={atStart}
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
        >
          Today
        </Button>

        <Tooltip content="Next week" side="bottom">
          <Button
            variant="icon"
            size="sm"
            iconAriaLabel="Next week"
            className={styles.navArrow}
            onClick={() => onChange(week + 1)}
            disabled={atEnd}
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
