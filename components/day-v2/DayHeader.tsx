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
        <Tooltip content="Go to the previous school day" side="top">
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
        <Tooltip content="Go to the next school day" side="top">
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
