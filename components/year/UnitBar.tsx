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
//
// Holiday grey-out (Lane Y-hol, 2026-05-26):
// The bar overlays a subtle striped marker on every week within its span
// that contains a holiday. The marker carries the holiday name in its
// tooltip so a teacher hovering the bar can see what's hiding instruction
// without leaving /year. We read holidays + the configured term-start
// directly inside the component (rather than threading another prop
// through RoadmapView, which is off-limits to this lane) — the hook is
// SSR-safe and only re-renders when the holidays list actually changes.

import { useMemo } from "react";
import { useHolidays, type Holiday } from "@/lib/use-holidays";
import { useAcademicYear } from "@/lib/use-academic-year";
import { StatusBadge } from "./StatusBadge";
import styles from "./UnitBar.module.css";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Convert an ISO YYYY-MM-DD into a 0-based academic-week index, anchored
 * at the supplied `termStart`. Returns -1 if the date is malformed or
 * sits before the term start — the caller filters those out.
 *
 * Lane BJ fix (2026-05-26): the previous implementation hard-coded
 * DEFAULT_TERM_START (2025-11-02), so a teacher who configured a
 * different academic-year start in Settings would never see their
 * holidays grey-out — the week-index frame did not match the unit
 * frame the rest of the Year view uses. The hook-driven start date
 * keeps holiday weeks in the same coordinate space as the unit bars.
 *
 * Note we parse the ISO string manually so we don't trip the UTC-shift
 * footgun that `new Date(isoString)` introduces in negative-offset
 * locales (a 2026-04-09 string can render as 2026-04-08 in Pacific).
 */
function holidayDateToWeekIdx(iso: string, termStart: Date): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return -1;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const date = new Date(y, mo, d);
  const deltaMs = date.getTime() - termStart.getTime();
  if (deltaMs < 0) return -1;
  return Math.floor(deltaMs / (7 * MS_PER_DAY));
}

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

  // ── Holiday overlays ────────────────────────────────────────────────
  // For each holiday landing inside this unit's week range we render a
  // single-week-wide striped marker, positioned relative to the bar's
  // own left edge. Multiple holidays in the same week get grouped so
  // the tooltip lists all of them and we don't stack identical
  // overlays on top of each other.
  //
  // Lane BJ fix (2026-05-26): anchor holiday→week conversion to the
  // user-configured academic-year start (the same anchor RoadmapView
  // uses to render its week columns), not the legacy
  // DEFAULT_TERM_START. Without this the holiday week index would live
  // in a different coordinate space than the unit bars on a teacher's
  // configured year — overlays would silently never fire.
  const { holidays } = useHolidays();
  const { start: yearStart } = useAcademicYear();
  const holidaysByWeek = useMemo(() => {
    const map = new Map<number, Holiday[]>();
    for (const h of holidays) {
      const w = holidayDateToWeekIdx(h.date, yearStart);
      if (w < unit.startWeekIdx || w > unit.endWeekIdx) continue;
      const list = map.get(w);
      if (list) list.push(h);
      else map.set(w, [h]);
    }
    return map;
  }, [holidays, unit.startWeekIdx, unit.endWeekIdx, yearStart]);

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
      {/* Holiday overlay layer — one striped band per holiday-week
          inside the unit's span. The overlay paints OVER the bar's
          background but with low-opacity stripes so the title / dots
          stay legible (a child can't sit between its parent's
          background and the parent's other children — see
          UnitBar.module.css for the recipe). Pointer-events stay on
          so the title= tooltip fires on hover; clicks still hit the
          bar itself because the overlays are children of a clickable
          parent. */}
      {Array.from(holidaysByWeek.entries()).map(([weekIdx, list]) => {
        // Offset from the bar's left edge — both the bar's left and
        // the overlay's offset are in the same timeline coordinate
        // space, so subtract the unit's startWeekIdx to get a value
        // relative to the bar.
        const offsetLeft = (weekIdx - unit.startWeekIdx) * columnWidthPx;
        const labels = list.map((h) => h.name).join(", ");
        return (
          <span
            key={weekIdx}
            aria-hidden="true"
            className={`${styles.holiday} holiday`}
            style={{ left: offsetLeft, width: columnWidthPx }}
            title={`Holiday — no instruction this week (${labels})`}
          />
        );
      })}

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

      {/* N of M complete counter — most-important inline data; survives narrow widths */}
      <span className={styles.counter}>
        {unit.completedLessons} of {unit.lessons} complete
      </span>

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
