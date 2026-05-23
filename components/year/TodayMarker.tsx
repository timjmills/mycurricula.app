"use client";

// TodayMarker — a vertical "TODAY" indicator that cuts through every lane row.
//
// Absolutely positioned over the roadmap grid body. The line runs the full
// height of the container; the pill sits at the very top, above the first row.
// The column is derived from todayWeekIdx × columnWidthPx.
//
// Token: --fyi (#1f6fb8, dark indigo-blue) is used as the "today" accent.
// If a dedicated --today token is added later, swap it here.

import styles from "./TodayMarker.module.css";

interface TodayMarkerProps {
  /** 0-based index of the current week column. */
  todayWeekIdx: number;
  /** Width in px of one week column — must match the lane grid. */
  columnWidthPx: number;
  /** Width in px of the left rail (LaneCard column) to offset from. */
  leftRailWidthPx: number;
}

export function TodayMarker({
  todayWeekIdx,
  columnWidthPx,
  leftRailWidthPx,
}: TodayMarkerProps) {
  // Center the marker on the column: left-rail offset + (column index × width) + half a column.
  const leftPx =
    leftRailWidthPx + todayWeekIdx * columnWidthPx + columnWidthPx / 2;

  return (
    <div
      className={styles.root}
      style={{ left: leftPx }}
      aria-hidden="true" // purely decorative; week header already labels "today"
    >
      {/* "TODAY" pill — anchored at the top of the root */}
      <div className={styles.pill}>TODAY</div>
      {/* Vertical line — runs the full height of the root */}
      <div className={styles.line} />
    </div>
  );
}
