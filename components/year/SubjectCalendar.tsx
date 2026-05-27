"use client";

// SubjectCalendar — single-subject chameleon-tinted mini-roadmap.
//
// Lane BG (2026-05-26): when the user filters the Year roadmap down to
// fewer than 8 subjects via <CurriculumFilter>, we stack one of these
// per selected subject ABOVE the main multi-subject roadmap. Each tint
// follows the cp-subj cascade so the full chameleon gradient cascade
// (Lane M) extends across the timeline width — the gradient lives on
// the QuarterMonthWeekHeader, and a tinted background wash sits behind
// the single LaneCard + unit bars row.
//
// API mirrors what YearView already feeds into QuarterMonthWeekHeader —
// months, weeks, leftRailWidthPx, columnWidthPx. The component owns its
// own horizontal scroll container so each subject calendar is a self-
// contained widget; the main roadmap below keeps its own scroll axis.

import { useMemo, useRef, useEffect, useCallback } from "react";
import { usePlanner } from "@/lib/planner-store";
import { SUBJECT_BY_ID, CURRENT_WEEK } from "@/lib/mock";
import { useAcademicYear } from "@/lib/use-academic-year";
import { DEFAULT_SCHOOL_WEEK } from "@/lib/year-calendar";
import type { SubjectId } from "@/lib/types";
import type { YearMonthBand } from "@/lib/year-calendar";
import { QuarterMonthWeekHeader } from "./QuarterMonthWeekHeader";
import { LaneCard } from "./LaneCard";
import { UnitBar } from "./UnitBar";
import { TodayMarker } from "./TodayMarker";
import { subjectClassName } from "./roadTones";
import type { UnitBarStatus } from "./UnitBar";
import styles from "./SubjectCalendar.module.css";

// ── Layout constants ──────────────────────────────────────────────────────
// Must match RoadmapView's WEEK_COL_PX / LEFT_RAIL constants so the
// header and the lane row align column-for-column.

/** Horizontal gap in px subtracted from each unit bar's computed width. */
const BAR_GAP_PX = 8;
/** Height in px of the timeline area inside the single lane row. */
const LANE_HEIGHT_PX = 100;

// ── Helpers ───────────────────────────────────────────────────────────────

/** Mirror of RoadmapView.deriveUnitStatus — kept local to avoid exporting
 *  a private helper from the much larger roadmap file. Same priority order. */
function deriveUnitStatus(
  completedLessons: number,
  totalLessons: number,
  anyModified: boolean,
  startWeekIdx: number,
  currentWeekIdx: number,
): UnitBarStatus {
  if (totalLessons === 0) return "not_started";
  if (completedLessons === totalLessons) return "completed";
  if (startWeekIdx > currentWeekIdx) return "not_started";
  if (anyModified) return "modified";
  if (completedLessons > 0) return "in_progress";
  return "behind";
}

/** Format a 0-based week index + optional day offset into "Nov 2" style.
 *  Anchored to the configured academic-year start. */
function weekIdxToDateLabel(
  weekIdx: number,
  termStart: Date,
  dayOffset: number = 0,
): string {
  const d = new Date(
    termStart.getFullYear(),
    termStart.getMonth(),
    termStart.getDate() + weekIdx * 7 + dayOffset,
  );
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Props ──────────────────────────────────────────────────────────────────

export interface SubjectCalendarProps {
  /** The subject this calendar represents — drives the chameleon tint. */
  subjectId: SubjectId;
  /** Month bands — same shape YearView passes to QuarterMonthWeekHeader. */
  months: YearMonthBand[];
  /** Week labels — same shape YearView passes to QuarterMonthWeekHeader. */
  weeks: { idx: number; label: string }[];
  /** Per-column width in px (must match the main roadmap). */
  columnWidthPx: number;
  /** Left-rail width in px (must match the main roadmap). */
  leftRailWidthPx: number;
}

// ── Component ─────────────────────────────────────────────────────────────

export function SubjectCalendar({
  subjectId,
  months,
  weeks,
  columnWidthPx,
  leftRailWidthPx,
}: SubjectCalendarProps) {
  const { lessons } = usePlanner();
  const subject = SUBJECT_BY_ID[subjectId];
  const schoolWeekLen = DEFAULT_SCHOOL_WEEK.length;
  const { start: yearStart } = useAcademicYear();

  // CURRENT_WEEK is 1-based in the fixture; convert to 0-based for index math.
  const currentWeekIdx = CURRENT_WEEK - 1;

  const timelineWidthPx = weeks.length * columnWidthPx;

  // ── Build this subject's units from the lessons store ──────────────────
  const units = useMemo(() => {
    const subjectLessons = lessons.filter((l) => l.subject === subjectId);

    // Group lessons by unit id, tracking min/max 1-based week numbers.
    const unitMap = new Map<
      string,
      {
        unitId: string;
        minWeek: number;
        maxWeek: number;
        lessons: typeof subjectLessons;
      }
    >();
    for (const lesson of subjectLessons) {
      const existing = unitMap.get(lesson.unit);
      if (!existing) {
        unitMap.set(lesson.unit, {
          unitId: lesson.unit,
          minWeek: lesson.week,
          maxWeek: lesson.week,
          lessons: [lesson],
        });
      } else {
        unitMap.set(lesson.unit, {
          ...existing,
          minWeek: Math.min(existing.minWeek, lesson.week),
          maxWeek: Math.max(existing.maxWeek, lesson.week),
          lessons: [...existing.lessons, lesson],
        });
      }
    }

    return [...unitMap.values()].map((u, ui) => {
      const completedLessons = u.lessons.filter(
        (l) => l.status === "done",
      ).length;
      const anyModified = u.lessons.some((l) => l.modified);
      const startWeekIdx = u.minWeek - 1;
      const endWeekIdx = u.maxWeek - 1;
      const spanWeeks = endWeekIdx - startWeekIdx + 1;
      const unitStatus = deriveUnitStatus(
        completedLessons,
        u.lessons.length,
        anyModified,
        startWeekIdx,
        currentWeekIdx,
      );
      const completePctUnit =
        u.lessons.length > 0
          ? Math.round((completedLessons / u.lessons.length) * 100)
          : 0;

      return {
        id: u.unitId,
        subjectId,
        name: `${subject?.name ?? subjectId} Unit ${ui + 1}`,
        unitNumber: ui + 1,
        startWeekIdx,
        endWeekIdx,
        startDate: weekIdxToDateLabel(startWeekIdx, yearStart, 0),
        endDate: weekIdxToDateLabel(endWeekIdx, yearStart, schoolWeekLen - 1),
        lessons: u.lessons.length,
        schoolDays: spanWeeks * schoolWeekLen,
        completePct: completePctUnit,
        completedLessons,
        status: unitStatus,
      };
    });
  }, [lessons, subjectId, subject, currentWeekIdx, yearStart, schoolWeekLen]);

  // ── Shared horizontal scroll + auto-center on today ───────────────────
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToWeek = useCallback(
    (weekIdx: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const target =
        leftRailWidthPx +
        weekIdx * columnWidthPx +
        columnWidthPx / 2 -
        el.clientWidth / 2;
      el.scrollLeft = Math.max(0, target);
    },
    [columnWidthPx, leftRailWidthPx],
  );

  // Auto-center on today on first mount, matching the main roadmap.
  useEffect(() => {
    const raf = requestAnimationFrame(() => scrollToWeek(currentWeekIdx));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const calendarTip = `Mini roadmap for ${subject?.name ?? subjectId} — the chameleon tint and unit bars track this subject only. Uncheck "${subject?.name ?? subjectId}" in the curriculum filter to remove this calendar.`;
  return (
    <section
      className={`${styles.section} ${subjectClassName(subjectId)}`}
      aria-label={`${subject?.name ?? subjectId} subject calendar`}
      title={calendarTip}
    >
      <div ref={scrollRef} className={styles.scrollWrap}>
        <QuarterMonthWeekHeader
          months={months}
          weeks={weeks}
          todayWeekIdx={currentWeekIdx}
          columnWidthPx={columnWidthPx}
          leftRailWidthPx={leftRailWidthPx}
          subjectId={subjectId}
        />

        <div
          className={`${styles.laneRow} ${subjectClassName(subjectId)}`}
          data-lane-subject={subjectId}
          style={{
            gridTemplateColumns: `${leftRailWidthPx}px ${timelineWidthPx}px`,
            width: `${leftRailWidthPx + timelineWidthPx}px`,
          }}
        >
          {/* Sticky-left LaneCard — same pattern as RoadmapView so the
              subject label stays glued to the left edge while the timeline
              scrolls underneath. */}
          <div className={styles.stickyLane} style={{ width: leftRailWidthPx }}>
            <LaneCard name={subject?.name ?? subjectId} subjectId={subjectId} />
          </div>

          <div
            className={styles.timeline}
            style={{
              width: timelineWidthPx,
              height: LANE_HEIGHT_PX,
              containerType: "inline-size",
            }}
          >
            <div
              className={styles.bgGrid}
              style={{
                gridTemplateColumns: `repeat(${weeks.length}, ${columnWidthPx}px)`,
              }}
            >
              {weeks.map((_, i) => (
                <div
                  key={i}
                  className={`${styles.bgLine} ${i > 0 ? styles.weekBorder : ""} ${i === currentWeekIdx ? styles.bgLineToday : ""}`}
                />
              ))}
            </div>

            {units.map((unit) => (
              <UnitBar
                key={unit.id}
                unit={unit}
                columnWidthPx={columnWidthPx}
                gapPx={BAR_GAP_PX}
                onClick={undefined}
              />
            ))}

            <TodayMarker
              todayWeekIdx={currentWeekIdx}
              columnWidthPx={columnWidthPx}
              leftRailWidthPx={0}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
