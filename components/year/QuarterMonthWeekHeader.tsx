"use client";

// QuarterMonthWeekHeader — Sticky timeline header for the Yearly view.
//
// Two rows top → bottom:
//   Row 1: Month bands — each spans its constituent weeks, separated by a
//          hairline divider.
//   Row 2: Week labels ("Wk 1", "Wk 2", …) — one per column.
//
// When `subjectId` is provided the header carries the `.cp-subj.<id>`
// cascade and renders the chameleon gradient (--c → --cl) — the active
// subject lane drives this from above. Without `subjectId` the header
// falls back to a neutral paper background.
//
// The leftmost cell mirrors the LaneCard column width and shows a small
// "DATE / CURRICULUM LANES" eyebrow label.

import type { SubjectId } from "@/lib/types";
import { subjectClassName } from "./roadTones";
import styles from "./QuarterMonthWeekHeader.module.css";

// ── Types ──────────────────────────────────────────────────────────────────

export interface QuarterMonthWeekHeaderProps {
  /** Month bands: label + how many week columns each month spans. */
  months: { label: string; weeks: number }[];
  /** One entry per visible week column. */
  weeks: { idx: number; label: string }[];
  /** 0-based week index of "today" — renders a marker dot in the week row. */
  todayWeekIdx?: number;
  /** Width in px of each week column; must match the lane grid. */
  columnWidthPx: number;
  /** Width in px of the left rail (above the LaneCard column). */
  leftRailWidthPx: number;
  /** When provided, applies the cp-subj chameleon gradient to the header. */
  subjectId?: SubjectId;
}

// ── Component ─────────────────────────────────────────────────────────────

export function QuarterMonthWeekHeader({
  months,
  weeks,
  todayWeekIdx,
  columnWidthPx,
  leftRailWidthPx,
  subjectId,
}: QuarterMonthWeekHeaderProps) {
  const totalCols = weeks.length;

  // Grid template: fixed left rail + N equal week columns.
  const gridTemplate = `${leftRailWidthPx}px repeat(${totalCols}, ${columnWidthPx}px)`;

  const chameleonClass = subjectId
    ? `${styles.chameleon} ${subjectClassName(subjectId)}`
    : "";

  return (
    <div
      className={`${styles.header} ${chameleonClass}`}
      style={{ "--left-rail": `${leftRailWidthPx}px` } as React.CSSProperties}
      aria-label="Year timeline header"
    >
      {/* ── Row 1: Month bands ────────────────────────────────────────── */}
      <div
        className={`${styles.row} ${styles.monthRow}`}
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {/* Eyebrow cell above the lane-card column */}
        <div className={styles.railCell}>
          <span className={styles.eyebrowLine1}>DATE</span>
          <span className={styles.eyebrowLine2}>CURRICULUM LANES</span>
        </div>

        {months.map((m, mi) => (
          <div
            key={`${m.label}-${mi}`}
            className={`${styles.monthCell} ${mi > 0 ? styles.monthBorder : ""}`}
            style={{ gridColumn: `span ${m.weeks}` }}
          >
            {m.label}
          </div>
        ))}
      </div>

      {/* ── Row 2: Week labels ────────────────────────────────────────── */}
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
            {w.idx === todayWeekIdx && (
              <span className={styles.todayDot} aria-label="Current week" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
