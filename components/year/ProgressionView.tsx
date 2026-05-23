"use client";

// ProgressionView — List mode (viewMode === "list").
//
// Day-by-day calendar: gradient month-header strip, per-school-day columns
// with weekday labels + date numbers, a TODAY marker, and per-subject lane
// rows each containing a LaneCard on the left and StatusGlyph cells across
// the day grid. Unit marker bars are absolutely positioned over the glyph row.
//
// Colors come exclusively from the canonical cp-subj cascade (app/tokens.css).
// Each lane row carries `cp-subj <subjectId>` so var(--c) / var(--cl) /
// var(--cd) resolve to the correct subject highlight color throughout the row.
//
// Data flow: reads lessons from usePlanner(), projects them onto the calendar
// via lib/year-calendar.ts helpers. School week is read from the mock
// constants — never hard-coded.

import { useMemo, useState, useEffect, useRef } from "react";
import { usePlanner } from "@/lib/planner-store";
import { SUBJECTS, CURRENT_WEEK } from "@/lib/mock";
import {
  buildSchoolDays,
  groupByMonth,
  buildDayGlyphMap,
  subjectCompletePct,
  lessonToFlatIndex,
  DEFAULT_SCHOOL_WEEK,
  DEFAULT_TERM_START,
  DEFAULT_WEEKS_IN_VIEW,
} from "@/lib/year-calendar";
import { subjectClassName } from "./roadTones";
import { StatusGlyph } from "./StatusGlyph";
import { LaneCard } from "./LaneCard";
import styles from "./ProgressionView.module.css";
import type { SubjectId } from "@/lib/types";

// ── SVG icons (inline, no icon lib dependency) ───────────────────────────

const IconBook = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 0-2 2V5z" />
    <path d="M4 21a2 2 0 0 1 2-2h13" />
  </svg>
);

// ── Constants ─────────────────────────────────────────────────────────────

/** Width in px of each day column. */
const COL = 30;

/** Width in px of the fixed lane-card column. */
const LANE_COL = 200;

export function ProgressionView() {
  const { lessons } = usePlanner();

  // ── Chameleon banner state ────────────────────────────────────────────
  // Tracks which subject lane is currently topmost in the scroll area so
  // the sticky day-header banner can adopt that subject's --cl color.
  const [activeSubjectId, setActiveSubjectId] = useState<SubjectId>(
    SUBJECTS[0].id as SubjectId,
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const laneRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // rootMargin: -1px top crops the sticky banner itself; -90% bottom means
    // only lanes whose top edge has crossed into the top 10% of the viewport
    // (just below the banner) are considered "active."
    const observer = new IntersectionObserver(
      (entries) => {
        // Find entries that are intersecting and pick the one with the
        // smallest boundingClientRect.top — that's the topmost visible lane.
        const intersecting = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (intersecting.length > 0) {
          const el = intersecting[0].target as HTMLElement;
          const sid = el.dataset.laneSubject as SubjectId | undefined;
          if (sid) setActiveSubjectId(sid);
        }
      },
      {
        root: container,
        rootMargin: "-1px 0px -90% 0px",
      },
    );

    // Observe all registered lane rows.
    laneRefs.current.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  // ── Calendar data ─────────────────────────────────────────────────────

  // Build the flat school-day array for the view window.
  const schoolDays = useMemo(
    () =>
      buildSchoolDays(
        DEFAULT_TERM_START,
        DEFAULT_WEEKS_IN_VIEW,
        DEFAULT_SCHOOL_WEEK,
      ),
    [],
  );
  const monthGroups = useMemo(() => groupByMonth(schoolDays), [schoolDays]);
  const schoolWeekLen = DEFAULT_SCHOOL_WEEK.length;

  // Determine which flat index represents "today" by finding the school day
  // that matches CURRENT_WEEK, day 0. In the prototype week 12 = "this week."
  const todayFlatIdx = useMemo(
    () => lessonToFlatIndex(CURRENT_WEEK, 0, schoolWeekLen),
    [schoolWeekLen],
  );

  // Per-subject glyph maps and completion percentages.
  const subjectData = useMemo(() => {
    return SUBJECTS.map((subject) => {
      const subjectId = subject.id as SubjectId;
      const glyphMap = buildDayGlyphMap(lessons, subjectId, schoolWeekLen);
      const completePct = subjectCompletePct(lessons, subjectId);

      // Aggregate the unit date ranges for this subject.
      // Group lessons by their unit id to build unit bars.
      const subjectLessons = lessons.filter((l) => l.subject === subject.id);
      const unitMap = new Map<
        string,
        { unitId: string; minIdx: number; maxIdx: number; lessonCount: number }
      >();
      for (const lesson of subjectLessons) {
        const flatIdx = lessonToFlatIndex(
          lesson.week,
          lesson.day,
          schoolWeekLen,
        );
        const existing = unitMap.get(lesson.unit);
        if (!existing) {
          unitMap.set(lesson.unit, {
            unitId: lesson.unit,
            minIdx: flatIdx,
            maxIdx: flatIdx,
            lessonCount: 1,
          });
        } else {
          unitMap.set(lesson.unit, {
            ...existing,
            minIdx: Math.min(existing.minIdx, flatIdx),
            maxIdx: Math.max(existing.maxIdx, flatIdx),
            lessonCount: existing.lessonCount + 1,
          });
        }
      }
      const unitBars = [...unitMap.values()];

      return { subject, subjectId, glyphMap, completePct, unitBars };
    });
  }, [lessons, schoolWeekLen]);

  const totalCols = schoolDays.length;

  return (
    <div className={styles.root}>
      {/* Gradient month-header strip — see ProgressionView.module.css for
          the gradient design rationale (subject canonical-order mid-tones) */}
      <div className={styles.monthStrip} aria-hidden="true">
        <div style={{ width: LANE_COL, flexShrink: 0 }} />
        <div className={styles.monthCells}>
          {monthGroups.map((mg) => (
            <div
              key={mg.monthIdx}
              className={styles.monthCell}
              style={{ width: mg.days.length * COL }}
            >
              {mg.name}
            </div>
          ))}
        </div>
      </div>

      {/* Scrollable area — gives the sticky day-header its anchoring
          scroll context. IntersectionObserver uses this as its root. */}
      <div className={styles.lanesScrollArea} ref={scrollContainerRef}>
        {/* Day-column header (weekday label + date number) — STICKY.
            Carries the active subject's cp-subj class so var(--cl) and
            var(--cd) resolve to the correct chameleon color. */}
        <div
          className={`${styles.dayHeader} ${styles.dayHeaderChameleon} ${subjectClassName(activeSubjectId)}`}
        >
          {/* Corner cell */}
          <div className={styles.cornerCell} style={{ width: LANE_COL }}>
            <span className={styles.cornerLabel}>DATE</span>
            <span className={styles.cornerSub}>CURRICULUM LANES</span>
          </div>
          {/* Day columns */}
          <div className={styles.dayCols} style={{ width: totalCols * COL }}>
            {schoolDays.map((d, i) => {
              const isToday = i === todayFlatIdx;
              return (
                <div
                  key={i}
                  className={`${styles.dayCol} ${isToday ? styles.todayCol : ""} ${d.firstOfMonth && i > 0 ? styles.monthBoundary : ""}`}
                  style={{ width: COL }}
                  aria-label={
                    isToday ? `${d.wkd} ${d.dateNum} (today)` : undefined
                  }
                >
                  {isToday && (
                    <span className={styles.todayPill} aria-hidden="true">
                      TODAY
                    </span>
                  )}
                  <span className={styles.dayWkd}>{d.wkd}</span>
                  <span className={styles.dayNum}>{d.dateNum}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Lane rows — each row carries cp-subj so var(--c/--cl/--cd) resolve
            to the correct subject color for all children in the row.
            data-lane-subject enables IntersectionObserver lane detection. */}
        {subjectData.map(
          ({ subject, subjectId, glyphMap, completePct, unitBars }, li) => (
            <div
              key={subject.id}
              data-lane-subject={subject.id}
              ref={(el) => {
                if (el) laneRefs.current.set(subject.id, el);
                else laneRefs.current.delete(subject.id);
              }}
              className={`${styles.laneRow} ${subjectClassName(subjectId)}`}
              style={{
                borderTop: li > 0 ? "1px solid var(--ink-150)" : "none",
              }}
            >
              {/* Lane card — inherits cp-subj from the row */}
              <LaneCard
                name={subject.name}
                subjectId={subjectId}
                completePct={completePct}
                fullHeight
              />

              {/* Grid area: glyph row + unit bars overlay */}
              <div
                className={styles.laneGrid}
                style={{ width: totalCols * COL }}
              >
                {/* TODAY column highlight */}
                {todayFlatIdx >= 0 && todayFlatIdx < totalCols && (
                  <div
                    className={styles.todayHighlight}
                    style={{ left: todayFlatIdx * COL, width: COL }}
                    aria-hidden="true"
                  />
                )}

                {/* LESSONS row — per-day StatusGlyph cells */}
                <div className={styles.glyphRow}>
                  {schoolDays.map((d, i) => {
                    const state = glyphMap.get(i) ?? "upcoming";
                    return (
                      <div
                        key={i}
                        className={`${styles.glyphCell} ${d.firstOfMonth && i > 0 ? styles.monthBoundary : ""}`}
                        style={{ width: COL }}
                      >
                        {/* No subjectId needed: cp-subj is on the ancestor row */}
                        <StatusGlyph state={state} size={13} />
                      </div>
                    );
                  })}
                </div>

                {/* UNITS row — unit bars colored by var(--c) from the row cascade */}
                <div className={styles.unitRow}>
                  {/* Background grid lines */}
                  {schoolDays.map((d, i) => (
                    <div
                      key={i}
                      className={`${styles.unitGridLine} ${d.firstOfMonth && i > 0 ? styles.monthBoundary : ""}`}
                      style={{ width: COL }}
                    />
                  ))}

                  {/* Unit marker bars, absolutely positioned */}
                  {unitBars.map((u, ui) => {
                    const left = u.minIdx * COL + 4;
                    const width = (u.maxIdx - u.minIdx + 1) * COL - 8;
                    if (width <= 0) return null;
                    return (
                      <div
                        key={u.unitId}
                        className={styles.unitBar}
                        style={{ left, width }}
                        title={`${u.lessonCount} lessons`}
                      >
                        {/* Unit tile */}
                        <span className={styles.unitTile}>U{ui + 1}</span>
                        {/* Unit label, clipped */}
                        <div className={styles.unitMeta}>
                          <IconBook width={10} height={10} />
                          <span>{u.lessonCount} lessons</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Kebab menu */}
              <button
                className={styles.kebab}
                aria-label={`Options for ${subject.name}`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="5" r="1.6" />
                  <circle cx="12" cy="12" r="1.6" />
                  <circle cx="12" cy="19" r="1.6" />
                </svg>
              </button>
            </div>
          ),
        )}
      </div>
      {/* end .lanesScrollArea */}

      {/* Bottom legend */}
      <div className={styles.legend}>
        <span className={styles.legendLabel}>LESSON STATUS</span>
        {/* Legend glyphs use subjectId so the cp-subj cascade resolves correctly
            outside any lane row — reading (green) for done, math (blue) for current */}
        <span className={styles.legendItem}>
          <StatusGlyph state="done" subjectId="reading" size={12} />
          Completed
        </span>
        <span className={styles.legendItem}>
          <StatusGlyph state="current" subjectId="math" size={12} />
          In progress
        </span>
        <span className={styles.legendItem}>
          <StatusGlyph state="skipped" size={12} />
          Skipped
        </span>
        <span className={styles.legendItem}>
          <StatusGlyph state="upcoming" size={12} />
          Not yet encountered
        </span>

        <span className={styles.legendDivider} aria-hidden="true" />

        <span className={styles.legendLabel}>CHECKPOINTS &amp; MILESTONES</span>
        <span className={styles.legendItem}>
          <FlagIcon />
          Unit Checkpoint
        </span>
        <span className={styles.legendItem}>
          <FlagIcon secondary />
          Mid-Unit Checkpoint
        </span>
        <span className={styles.legendItem}>
          <StarIcon />
          Major Milestone
        </span>
      </div>
    </div>
  );
}

// Small inline icon helpers for the legend — colors from canonical tokens.
function FlagIcon({ secondary }: { secondary?: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      // writing (indigo) for unit checkpoint; grammar (teal) for mid-unit
      stroke={secondary ? "var(--grammar)" : "var(--writing)"}
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M4 22V4M4 4h13l-2 4 2 4H4" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--explorers)"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M12 2l3 6.5 7 1-5 5 1.2 7L12 18l-6.2 3.5L7 14.5l-5-5 7-1z" />
    </svg>
  );
}
