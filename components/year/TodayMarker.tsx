"use client";

// TodayMarker — a vertical "TODAY" indicator that cuts through every lane row.
//
// Absolutely positioned over the roadmap grid body. The line runs the full
// height of the container; the pill sits at the very top, above the first row.
// The column is derived from todayWeekIdx × columnWidthPx.
//
// Token: --fyi (#1f6fb8, dark indigo-blue) is used as the "today" accent.
// If a dedicated --today token is added later, swap it here.
//
// ── "Today" button pulse (m4 fix, 2026-05-25 audit) ──────────────────────
// When the teacher clicks the page header's "Today" button while the
// timeline is already centered on today, scrollTo is a no-op and there is
// no feedback. To confirm the click registered, YearView dispatches a
// `mycurriculum:year-today-pulse` CustomEvent on the window after every
// click. Every mounted TodayMarker listens, applies a brief `.pulsing`
// class for ~250ms (matches the ≤200ms card-expand allowance from
// CLAUDE.md §4 with a small buffer for animation easing), and the pill +
// line briefly flash. Skipped entirely under prefers-reduced-motion.

import { useEffect, useState } from "react";
import styles from "./TodayMarker.module.css";

/** Event name dispatched by YearView's Today button to confirm the click. */
export const TODAY_PULSE_EVENT = "mycurriculum:year-today-pulse";

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

  // Pulse state — flips on for ~250ms whenever the Today button is pressed.
  // Listening on `window` lets every TodayMarker instance respond without
  // any prop drilling through RoadmapView / ProgressionView.
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    // Honor the OS reduced-motion preference — no pulse animation under it.
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    let timeout: ReturnType<typeof setTimeout> | null = null;
    const onPulse = () => {
      // Re-trigger by toggling off then back on so a rapid second click also
      // restarts the animation (otherwise React skips the state update).
      setPulsing(false);
      requestAnimationFrame(() => setPulsing(true));
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => setPulsing(false), 260);
    };

    window.addEventListener(TODAY_PULSE_EVENT, onPulse);
    return () => {
      window.removeEventListener(TODAY_PULSE_EVENT, onPulse);
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  const rootClass = pulsing ? `${styles.root} ${styles.pulsing}` : styles.root;

  return (
    <div
      className={rootClass}
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
