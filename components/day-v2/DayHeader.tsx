"use client";

// DayHeader.tsx — the ◀ Day ▶ navigator shared by all three Day frames (bundle
// views-shared.jsx DayHeader, B:5864-5875). Day state lives in the shell
// (Builder B) — this header is a pure control: the prev/next arrows call
// onShiftDay(±1) and the shell handles week rollover. The right block (`extra`)
// is frame-specific (DayA adds a "N of M complete" line).

import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui";
import styles from "./day-v2.module.css";

export interface DayHeaderProps {
  /** Long weekday name, e.g. "Sunday". */
  dayLabel: string;
  /** Prev/next handler — the shell handles week rollover. */
  onShiftDay: (delta: 1 | -1) => void;
  /** Frame-specific right-hand block (sublabel / progress). */
  extra?: ReactNode;
}

export function DayHeader({
  dayLabel,
  onShiftDay,
  extra,
}: DayHeaderProps): ReactNode {
  return (
    <div className={styles.vhead}>
      <div className={styles.wknav}>
        {/* DISMISSIBLE (CLAUDE.md §4). Both arrows share ONE id on purpose —
            the tooltip teaches one thing ("these move you a school day at a
            time, and the app knows which days your school runs"), so a teacher
            who has learned it should not have to dismiss it twice. Not
            `required`: nothing here is destructive or team-wide. Icon-only, so
            it is squarely inside the "every icon-only control" scope; the
            native `title` stays as the touch long-press carrier. */}
        <Tooltip
          content="Go to the previous school day"
          tooltipId="day-v2-day-nav"
          side="top"
        >
          <button
            type="button"
            className={styles.wkarrow}
            onClick={() => onShiftDay(-1)}
            aria-label="Previous day"
            title="Previous day"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </Tooltip>
        <h2 className={styles.vheadTitle}>{dayLabel}</h2>
        <Tooltip
          content="Go to the next school day"
          tooltipId="day-v2-day-nav"
          side="top"
        >
          <button
            type="button"
            className={styles.wkarrow}
            onClick={() => onShiftDay(1)}
            aria-label="Next day"
            title="Next day"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </Tooltip>
      </div>
      {extra}
    </div>
  );
}
