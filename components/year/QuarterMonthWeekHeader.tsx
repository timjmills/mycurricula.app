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
import { usePlanner } from "@/lib/planner-store";
import { Tooltip } from "@/components/ui";
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
  const { subjectById } = usePlanner();
  const totalCols = weeks.length;

  // Grid template: fixed left rail + N equal week columns.
  const gridTemplate = `${leftRailWidthPx}px repeat(${totalCols}, ${columnWidthPx}px)`;

  const chameleonClass = subjectId
    ? `${styles.chameleon} ${subjectClassName(subjectId)}`
    : "";

  // W2-B4: name the chameleon signal so a first-time teacher knows the
  // tint shift is meaningful, not decoration. The aria-label includes the
  // active subject when one is set so screen-reader users get the same
  // context sighted users see via the gradient.
  const activeSubjectName = subjectId
    ? (subjectById[subjectId]?.name ?? null)
    : null;
  const ariaLabel = activeSubjectName
    ? `Year timeline header — currently viewing ${activeSubjectName}`
    : "Year timeline header";

  return (
    <Tooltip
      content="Header color tracks the subject lane you're viewing — it shifts as you scroll between subjects."
      side="bottom"
      tooltipId="year-chameleon-header"
    >
      <div
        className={`${styles.header} ${chameleonClass}`}
        style={{ "--left-rail": `${leftRailWidthPx}px` } as React.CSSProperties}
        aria-label={ariaLabel}
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

          {/* Lane R changed `allYearMonths()` to always return 12 calendar
            months — including months that contain ZERO of the 36 mock-data
            academic weeks (default mock: Aug/Sep/Oct). Their `weeks` field is
            0, but CSS Grid spec defines `span 0` as invalid and clamps to
            `span 1` — which inserts extra cells in this row that the lane
            body below doesn't have. Result: month labels drift left by the
            number of empty months (3 cells of misalignment in the default
            mock anchor). Filtering empty months out keeps the header aligned
            with the lane body until Lane Y-cal (academic year date pickers,
            queued) restructures the data so all 12 calendar months can
            render with empty week cells underneath. Audit ref:
            docs/audit-roadmap-progression-days-2026-05-25.md F1. */}
          {months
            .filter((m) => m.weeks > 0)
            .map((m, mi) => (
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
    </Tooltip>
  );
}
