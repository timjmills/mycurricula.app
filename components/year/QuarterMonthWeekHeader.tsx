"use client";

// QuarterMonthWeekHeader — Sticky 3-row timeline header for the Yearly view.
//
// Sits above the lane stack and stays pinned to the page scroll context
// (<main>). Three rows from top to bottom:
//   Row 1: Quarter label spanning all visible weeks.
//   Row 2: Month bands — each spans its constituent weeks, separated by
//          a hairline divider.
//   Row 3: Week labels ("Wk 1", "Wk 2", …) — one per column.
//
// The leftmost cell mirrors the LaneCard column width and shows a small
// "DATE / CURRICULUM LANES" eyebrow label, matching the ProgressionView
// convention.
//
// Colors and type: all from design tokens in app/tokens.css — no hex.

import styles from "./QuarterMonthWeekHeader.module.css";

// ── Types ──────────────────────────────────────────────────────────────────

export interface QuarterMonthWeekHeaderProps {
  /** 1..4 — the visible quarter number shown in the top row. */
  quarter: number;
  /** Month bands: label + how many week columns each month spans. */
  months: { label: string; weeks: number }[];
  /** One entry per visible week column. */
  weeks: { idx: number; label: string }[];
  /** 0-based week index of "today" — renders a marker dot in row 3. */
  todayWeekIdx?: number;
  /** Width in px of each week column; must match the lane grid. */
  columnWidthPx: number;
  /** Width in px of the left rail (above the LaneCard column). */
  leftRailWidthPx: number;
}

// ── Component ─────────────────────────────────────────────────────────────

export function QuarterMonthWeekHeader({
  quarter,
  months,
  weeks,
  todayWeekIdx,
  columnWidthPx,
  leftRailWidthPx,
}: QuarterMonthWeekHeaderProps) {
  const totalCols = weeks.length;

  // Grid template: fixed left rail + N equal week columns.
  const gridTemplate = `${leftRailWidthPx}px repeat(${totalCols}, ${columnWidthPx}px)`;

  return (
    <div
      className={styles.header}
      style={{ "--left-rail": `${leftRailWidthPx}px` } as React.CSSProperties}
      aria-label={`Quarter ${quarter} timeline header`}
    >
      {/* ── Row 1: Quarter label ───────────────────────────────────────── */}
      <div className={styles.row} style={{ gridTemplateColumns: gridTemplate }}>
        {/* Eyebrow cell above the lane-card column */}
        <div className={styles.railCell}>
          <span className={styles.eyebrowLine1}>DATE</span>
          <span className={styles.eyebrowLine2}>CURRICULUM LANES</span>
        </div>

        {/* Quarter label spans all week columns */}
        <div
          className={styles.quarterCell}
          style={{ gridColumn: `2 / span ${totalCols}` }}
        >
          <span className={styles.quarterLabel}>Quarter {quarter}</span>
        </div>
      </div>

      {/* ── Row 2: Month bands ────────────────────────────────────────── */}
      <div
        className={`${styles.row} ${styles.monthRow}`}
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {/* Empty left-rail cell to keep alignment */}
        <div className={styles.railCell} aria-hidden="true" />

        {/* Each month spans its week count */}
        {months.map((m, mi) => (
          <div
            key={m.label}
            className={`${styles.monthCell} ${mi > 0 ? styles.monthBorder : ""}`}
            style={{ gridColumn: `span ${m.weeks}` }}
          >
            {m.label}
          </div>
        ))}
      </div>

      {/* ── Row 3: Week labels ────────────────────────────────────────── */}
      <div
        className={`${styles.row} ${styles.weekRow}`}
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {/* Empty left-rail cell */}
        <div className={styles.railCell} aria-hidden="true" />

        {weeks.map((w, wi) => (
          <div
            key={w.idx}
            className={`${styles.weekCell} ${wi > 0 ? styles.weekBorder : ""} ${w.idx === todayWeekIdx ? styles.weekCellToday : ""}`}
          >
            {w.label}
            {/* Today marker dot — visible if this week is the current week */}
            {w.idx === todayWeekIdx && (
              <span className={styles.todayDot} aria-label="Current week" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
