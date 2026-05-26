"use client";

// RoadmapView — Grid mode (viewMode === "grid").
//
// Lane-stack layout: one row per subject. Each row has:
//   • Left column: <LaneCard> (fixed 200px, carries pacing status via pacingFor).
//   • Right column: a relative-positioned area of weekCount × WEEK_COL_PX.
//     Unit bars are absolutely positioned inside this area per start/end week.
//
// The view loads ALL 36 weeks of the school year. There is no internal
// horizontal scroll — YearView's shared scroll wrapper handles that so the
// timeline pans as one piece. There is no internal sticky header either:
// YearView's <QuarterMonthWeekHeader> sits above the lane stack and carries
// the chameleon gradient for whichever subject lane is topmost (the parent
// observes lanes and passes activeSubjectId in).
//
// A single <TodayMarker> overlays each lane's timeline, centered on the
// current week.
//
// Colors come exclusively from the canonical cp-subj cascade (app/tokens.css).
// Each lane row carries `cp-subj <subjectId>` so var(--c) / var(--cl) /
// var(--cd) resolve to the correct subject highlight color throughout the row.

import { useMemo, useEffect, useRef } from "react";
import { usePlanner } from "@/lib/planner-store";
import { SUBJECTS, CURRENT_WEEK } from "@/lib/mock";
import {
  subjectCompletePct,
  lessonToFlatIndex,
  allYearWeeksFor,
} from "@/lib/year-calendar";
import { useAcademicYear } from "@/lib/use-academic-year";
import { useSchoolWeek } from "@/lib/use-school-week";
import { pacingFor } from "@/lib/year-pacing";
import { useMinimizedSubjects } from "@/lib/year-state";
import { subjectClassName } from "./roadTones";
import { LaneCard } from "./LaneCard";
import { UnitBar } from "./UnitBar";
import { TodayMarker } from "./TodayMarker";
import styles from "./RoadmapView.module.css";
import type { SubjectId } from "@/lib/types";
import type { UnitBarStatus } from "./UnitBar";

// ── Layout constants ───────────────────────────────────────────────────────

/** Width in px of each week column — must match the YearView header.
 *  Tightened 2026-05-25: 120 → 96 (~20% reduction) so the default 100% zoom
 *  shows ~25% more weeks per screen. Keep in sync with COLUMN_WIDTH_PX in
 *  YearView.tsx. */
const WEEK_COL_PX = 96;

/** Horizontal gap in px subtracted from each unit bar's computed width. */
const BAR_GAP_PX = 8;

/** Height in px of the timeline area inside each lane row. */
const LANE_HEIGHT_PX = 100;

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Derive a unit's UnitBarStatus from its lesson completion data.
 *
 * Priority order (first match wins):
 *   1. completed — all lessons done.
 *   2. not_started — no lessons, or unit's first week is still in the future.
 *   3. modified — at least one lesson carries a personal edit.
 *   4. in_progress — some lessons done.
 *   5. behind — unit has started (its first week is in the past) but 0 done.
 */
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

/**
 * Format a 0-based week index plus an optional day-of-week offset as a
 * short date label, e.g. "Nov 2", anchored to the configured
 * academic-year start. Called per-unit-bar to render the "Nov 2–Dec 14"
 * range under each unit.
 *
 * Lane BJ fix (2026-05-26) — Audit F2: the previous call passed
 * `endWeekIdx + 1` to label the unit's end, which returned the Sunday
 * at the start of the week AFTER the unit ended (off by 3 calendar
 * days for a Sun-Thu school). Adding the `dayOffset` parameter lets
 * the caller name the unit's actual last instructional day
 * (schoolWeekLen - 1) so the printed range matches the data.
 */
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

// ── Legend entries ─────────────────────────────────────────────────────────

const LEGEND_STATUSES: { status: UnitBarStatus; label: string }[] = [
  { status: "completed", label: "Completed" },
  { status: "in_progress", label: "In Progress" },
  { status: "modified", label: "Modified" },
  { status: "behind", label: "Behind" },
  { status: "not_started", label: "Not Started" },
];

// ── Props ─────────────────────────────────────────────────────────────────

export interface RoadmapViewProps {
  /** Called when the topmost intersecting lane changes (chameleon driver). */
  onActiveSubjectChange?: (subjectId: SubjectId) => void;
  /**
   * Subjects to show. null = show all. Pass from useCurriculumFilter() in
   * YearView via the <CurriculumFilter> component.
   */
  subjectFilter?: Set<SubjectId> | null;
}

// ── Component ─────────────────────────────────────────────────────────────

export function RoadmapView({
  onActiveSubjectChange,
  subjectFilter,
}: RoadmapViewProps = {}) {
  const { lessons } = usePlanner();
  // TEAM-scoped school week (CLAUDE.md §1 — configurable, never hard-coded).
  // We only need the length here for flat-index math + unit-bar date labels;
  // the per-weekday tokens drive ProgressionView's daily grid, not Roadmap's
  // week-grain timeline.
  const { days: schoolWeek } = useSchoolWeek();
  const schoolWeekLen = schoolWeek.length;
  const { isMinimized, toggle } = useMinimizedSubjects();
  // TEAM-scoped academic year. Drives the week column count + the
  // start date the unit-bar labels are anchored to.
  const { start: yearStart, end: yearEnd } = useAcademicYear();

  // CURRENT_WEEK is 1-based in the fixture; convert to 0-based for index math.
  const currentWeekIdx = CURRENT_WEEK - 1;

  // ── Chameleon: notify parent which lane is topmost ───────────────────
  const laneRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!onActiveSubjectChange) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (intersecting.length > 0) {
          const el = intersecting[0].target as HTMLElement;
          const sid = el.dataset.laneSubject as SubjectId | undefined;
          if (sid) onActiveSubjectChange(sid);
        }
      },
      {
        root: null,
        rootMargin: "-1px 0px -90% 0px",
      },
    );

    laneRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [onActiveSubjectChange]);

  // ── Full-year week labels ─────────────────────────────────────────────

  const weekLabels = useMemo(
    () => allYearWeeksFor(yearStart, yearEnd),
    [yearStart, yearEnd],
  );
  const timelineWidthPx = weekLabels.length * WEEK_COL_PX;

  // 0-based flat school-day index for "today" — passed to pacingFor.
  const todaySchoolDayIdx = useMemo(
    () => lessonToFlatIndex(CURRENT_WEEK, 0, schoolWeekLen),
    [schoolWeekLen],
  );

  // ── Per-subject lane data ─────────────────────────────────────────────

  const laneData = useMemo(() => {
    return SUBJECTS.map((subject) => {
      const subjectId = subject.id as SubjectId;
      const completePct = subjectCompletePct(lessons, subjectId);
      const subjectLessons = lessons.filter((l) => l.subject === subject.id);

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

      const units = [...unitMap.values()].map((u, ui) => {
        const completedLessons = u.lessons.filter(
          (l) => l.status === "done",
        ).length;
        const anyModified = u.lessons.some((l) => l.modified);

        // Convert 1-based fixture week to 0-based column index.
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
          name: `${subject.name} Unit ${ui + 1}`,
          unitNumber: ui + 1,
          startWeekIdx,
          endWeekIdx,
          // Lane BJ fix (2026-05-26) — Audit F2: end label is the unit's
          // actual last instructional day (schoolWeekLen - 1 days past
          // the final week's Sunday), not the Sunday of the FOLLOWING
          // week (which the old `endWeekIdx + 1` produced).
          startDate: weekIdxToDateLabel(startWeekIdx, yearStart, 0),
          endDate: weekIdxToDateLabel(endWeekIdx, yearStart, schoolWeekLen - 1),
          lessons: u.lessons.length,
          schoolDays: spanWeeks * schoolWeekLen,
          completePct: completePctUnit,
          completedLessons,
          status: unitStatus,
        };
      });

      // Pacing status for the LaneCard body row.
      const pacing = pacingFor(subjectId, lessons, todaySchoolDayIdx, {
        dayCount: schoolWeekLen,
      });

      return { subject, subjectId, completePct, units, pacing };
    });
  }, [lessons, schoolWeekLen, todaySchoolDayIdx, currentWeekIdx, yearStart]);

  // Sort: expanded subjects first (in canonical order), minimized at the bottom.
  const orderedLanes = useMemo(() => {
    const expanded = laneData.filter((l) => !isMinimized(l.subjectId));
    const minimized = laneData.filter((l) => isMinimized(l.subjectId));
    return [...expanded, ...minimized];
  }, [laneData, isMinimized]);

  // Apply subject filter: null means show all; otherwise show only matching lanes.
  const visibleLanes =
    subjectFilter == null
      ? orderedLanes
      : orderedLanes.filter((l) => subjectFilter.has(l.subjectId));

  return (
    // .root carries `overflow: clip` in RoadmapView.module.css (Lane I's
    // CSS) to keep the card chrome's rounded corners tidy. That clip
    // hides our sticky-left LaneCards once they're positioned outside
    // .root's narrow box (which scrolls with the timeline), reintroducing
    // the cutoff the sticky was meant to fix. Override to `visible` so
    // the sticky cards remain visible at every scroll position
    // (Lane K scroll fix, 2026-05-25). The rounded chrome on the
    // outer card border still reads correctly because the LaneCards
    // sit on top of the same `var(--paper)` background.
    <div className={styles.root} style={{ overflow: "visible" }}>
      {/* Lane rows */}
      <div className={styles.lanes}>
        {visibleLanes.map(({ subject, subjectId, units }, li) => {
          const minimized = isMinimized(subjectId);
          return (
            <div
              key={subject.id}
              data-lane-subject={subject.id}
              ref={(el) => {
                if (el) laneRefs.current.set(subject.id, el);
                else laneRefs.current.delete(subject.id);
              }}
              className={`${styles.laneRow} ${minimized ? styles.laneRowMinimized : ""} ${subjectClassName(subjectId)}`}
              style={{
                borderTop: li > 0 ? "1px solid var(--ink-150)" : "none",
                // Override .laneRow's `overflow: hidden` and `1fr` second
                // column (set in RoadmapView.module.css, owned by Lane I) so
                // the sticky-left LaneCard inside isn't clipped or stranded
                // by the row's narrow box. Without these overrides the row
                // sizes to .timelineScroll's clientWidth (~992px) even
                // though the inner timeline child extends to ~3500px — so
                // a sticky element bumps into the row's right-edge bound
                // long before reaching the rightmost weeks, exposing the
                // empty grid the user reported (Lane K scroll fix,
                // 2026-05-25). Explicitly sizing the second track to the
                // timeline width makes the row's containing block as wide
                // as the scrollable content, giving sticky room to pin
                // through the full pan range.
                gridTemplateColumns: !minimized
                  ? `200px ${timelineWidthPx}px`
                  : undefined,
                width: !minimized ? `${200 + timelineWidthPx}px` : undefined,
                overflow: "visible",
              }}
            >
              {/* Sticky-left wrapper keeps the LaneCard glued to the left
                  edge of YearView's horizontally scrolling .timelineScroll
                  container. Without this, the mount-time auto-center on
                  today (or any rightward pan) pushes the LaneCards off-
                  screen left and the grid reads as empty cells with no
                  subject context — exactly the bug reported (Lane K scroll
                  fix, 2026-05-25). The wrapper sticks against the nearest
                  horizontally scrolling ancestor (.timelineScroll); the
                  parent .laneRow is itself wider than the viewport because
                  the timeline child carries an explicit pixel width
                  (3456px), so sticky has room to pin.

                  z-index 2 sits above unit-bars/glyphs (z:0–1) but below
                  the sticky-top QuarterMonthWeekHeader (z:10) so the
                  header stays on top at the corner. */}
              <div
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 2,
                  background: "var(--paper)",
                }}
              >
                <LaneCard
                  name={subject.name}
                  subjectId={subjectId}
                  minimized={minimized}
                  onToggleMinimize={() => toggle(subjectId)}
                />
              </div>

              {/* The timeline column is only rendered when expanded. */}
              {!minimized && (
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
                      gridTemplateColumns: `repeat(${weekLabels.length}, ${WEEK_COL_PX}px)`,
                    }}
                  >
                    {weekLabels.map((_, i) => (
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
                      columnWidthPx={WEEK_COL_PX}
                      gapPx={BAR_GAP_PX}
                      onClick={undefined}
                    />
                  ))}

                  <TodayMarker
                    todayWeekIdx={currentWeekIdx}
                    columnWidthPx={WEEK_COL_PX}
                    leftRailWidthPx={0}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Legend + summary strip ──────────────────────────────────────── */}
      <div className={styles.legendRow}>
        <div className={styles.legendSection}>
          <div className={styles.legendTitle}>STATUS LEGEND</div>
          <div className={styles.pillGroup}>
            {LEGEND_STATUSES.map(({ status, label }) => (
              <span
                key={status}
                className={styles.legendPill}
                data-status={status}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.legendSection}>
          <div className={styles.legendTitle}>LESSON PROGRESS</div>
          <div className={styles.dotLegend}>
            <span className={styles.dotLegendItem}>
              <span
                className={`${styles.dotSample} ${styles.dotSample_done}`}
              />
              Complete
            </span>
            <span className={styles.dotLegendItem}>
              <span
                className={`${styles.dotSample} ${styles.dotSample_current}`}
              />
              In Progress
            </span>
            <span className={styles.dotLegendItem}>
              <span
                className={`${styles.dotSample} ${styles.dotSample_upcoming}`}
              />
              Not Started
            </span>
          </div>
        </div>

        <div className={styles.legendSection}>
          <div className={styles.legendTitle}>ROADMAP SUMMARY</div>
          <RoadmapSummary lessons={lessons} />
        </div>
      </div>
    </div>
  );
}

// ── Summary stat strip ────────────────────────────────────────────────────

function RoadmapSummary({
  lessons,
}: {
  lessons: ReturnType<typeof usePlanner>["lessons"];
}) {
  const totalLessons = lessons.length;
  const uniqueUnits = new Set(lessons.map((l) => l.unit)).size;
  const done = lessons.filter((l) => l.status === "done").length;
  const avgPct = totalLessons > 0 ? Math.round((done / totalLessons) * 100) : 0;

  return (
    <div className={styles.summaryStats}>
      <SmallStat value={String(uniqueUnits)} label="Units" />
      <SmallStat value={String(totalLessons)} label="Lessons" />
      <SmallStat value={`${avgPct}%`} label="Avg. Progress" />
    </div>
  );
}

function SmallStat({ value, label }: { value: string; label: string }) {
  return (
    <div className={styles.smallStat}>
      <div className={styles.smallStatValue}>{value}</div>
      <div className={styles.smallStatLabel}>{label}</div>
    </div>
  );
}
