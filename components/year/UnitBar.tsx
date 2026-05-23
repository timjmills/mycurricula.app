"use client";

// UnitBar — the hero unit object on the Year Roadmap.
//
// A wide, premium colored bar that spans its actual week columns via absolute
// positioning. Subject color flows exclusively from the .cp-subj cascade on
// the parent lane row — no direct hex values here.
//
// Layout (left → right):
//   [U# tile] [Unit title + metadata subtitle] [flex spacer]
//   [dot progress row + percentage] [StatusBadge]
//
// Responsive collapse:
//   bar width < ~280px → hide metadata subtitle
//   bar width < ~180px → hide everything but tile + title
//
// Hover: translateY(-1px) + shadow-card-hover (180ms ease, reduced-motion off).
// Touch target: min-height 60px (≥ 44px requirement).

import { StatusBadge } from "./StatusBadge";
import styles from "./UnitBar.module.css";

// Re-exported so StatusBadge can import it without a circular dependency.
export type UnitBarStatus =
  | "completed"
  | "in_progress"
  | "modified"
  | "skipped"
  | "not_started"
  | "behind";

export interface UnitBarProps {
  unit: {
    id: string;
    /** Subject id — parent lane must carry the matching cp-subj class. */
    subjectId: string;
    /** Display name, e.g. "Math Unit 1". */
    name: string;
    /** 1-based unit number shown in the tile. */
    unitNumber: number;
    /** 0-based column index of the first week this unit spans. */
    startWeekIdx: number;
    /** 0-based column index of the last week this unit spans (inclusive). */
    endWeekIdx: number;
    /** Human date label, e.g. "Sep 2". */
    startDate: string;
    /** Human date label, e.g. "Sep 27". */
    endDate: string;
    /** Total lesson count in this unit. */
    lessons: number;
    /** Total school days in the unit span. */
    schoolDays: number;
    /** 0–100 percentage of completed lessons. */
    completePct: number;
    /** Count of completed lessons (used to render dots). */
    completedLessons: number;
    status: UnitBarStatus;
  };
  /** Width in px of a single week column in the grid. */
  columnWidthPx: number;
  /** Gap in px between adjacent unit bars (applied as right padding). */
  gapPx?: number;
  onClick?: () => void;
}

// ── Dot progress ──────────────────────────────────────────────────────────────

// Renders a row of small dots: one per lesson.
// done → filled var(--c-progress-fill)
// current week → filled var(--c-deep) with a ring
// upcoming → ink-200 outline only
function DotProgress({
  lessons,
  completedLessons,
  currentLessons,
  completePct,
}: {
  lessons: number;
  completedLessons: number;
  /** Lessons that are in-flight (partial / carried) — rendered with a ring. */
  currentLessons: number;
  completePct: number;
}) {
  // Clamp dot count for readability — too many dots collapse into noise.
  const cappedCount = Math.min(lessons, 24);
  const dots = Array.from({ length: cappedCount }, (_, i) => {
    if (i < completedLessons) return "done";
    if (i < completedLessons + currentLessons) return "current";
    return "upcoming";
  });

  return (
    <div className={styles.dotProgress}>
      <div className={styles.dots} aria-hidden="true">
        {dots.map((state, i) => (
          <span key={i} className={`${styles.dot} ${styles[`dot_${state}`]}`} />
        ))}
      </div>
      <span className={styles.pct}>{completePct}%</span>
    </div>
  );
}

// ── UnitBar ───────────────────────────────────────────────────────────────────

export function UnitBar({
  unit,
  columnWidthPx,
  gapPx = 6,
  onClick,
}: UnitBarProps) {
  const spanWeeks = unit.endWeekIdx - unit.startWeekIdx + 1;

  // Bar geometry: left = startWeekIdx × columnWidth, width = span × columnWidth − gap.
  // Parent (.laneTimeline) is position:relative; the bar is absolute inside it.
  const left = unit.startWeekIdx * columnWidthPx;
  const width = spanWeeks * columnWidthPx - gapPx;

  const isClickable = Boolean(onClick);

  return (
    <div
      className={`${styles.bar} ${isClickable ? styles.barClickable : ""}`}
      style={{ left, width }}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      aria-label={`${unit.name}, ${unit.startDate}–${unit.endDate}, ${unit.completePct}% complete, ${unit.status.replace("_", " ")}`}
    >
      {/* U# tile — small rounded square */}
      <span className={styles.tile} aria-hidden="true">
        U{unit.unitNumber}
      </span>

      {/* Title + metadata */}
      <div className={styles.info}>
        <span className={styles.title}>{unit.name}</span>
        {/* Subtitle — hidden at narrow widths via container query / CSS */}
        <span className={styles.meta}>
          {unit.startDate}–{unit.endDate}&nbsp;&middot;&nbsp;
          {unit.lessons} Lesson{unit.lessons !== 1 ? "s" : ""}
          &nbsp;&middot;&nbsp;
          {unit.schoolDays} school day{unit.schoolDays !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Spacer */}
      <div className={styles.spacer} />

      {/* Segmented dot progress + percentage */}
      <DotProgress
        lessons={unit.lessons}
        completedLessons={unit.completedLessons}
        currentLessons={unit.status === "in_progress" ? 1 : 0}
        completePct={unit.completePct}
      />

      {/* Status badge */}
      <StatusBadge status={unit.status} />
    </div>
  );
}
