"use client";

// ProgressionView — List mode (viewMode === "list").
//
// Day-by-day calendar: gradient month-header strip, per-school-day columns
// with weekday labels + date numbers, a TODAY marker, and per-subject lane
// rows each containing a LaneCard on the left and StatusGlyph cells across
// the day grid. Unit marker bars are absolutely positioned over the glyph row.
//
// Data flow: reads lessons from usePlanner(), projects them onto the calendar
// via lib/year-calendar.ts helpers. School week is read from the mock
// constants — never hard-coded.

import { useMemo } from "react";
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
import { ROAD_TONES, toneForSubject } from "./roadTones";
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
      const tone = toneForSubject(subject.id as SubjectId);
      const glyphMap = buildDayGlyphMap(
        lessons,
        subject.id as SubjectId,
        schoolWeekLen,
      );
      const completePct = subjectCompletePct(lessons, subject.id as SubjectId);

      // Aggregate the unit date ranges for this subject.
      // We derive "units" from the mock UNITS fixture for unit bars.
      const subjectLessons = lessons.filter((l) => l.subject === subject.id);
      // Group lessons by their unit id to build unit bars.
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

      return { subject, tone, glyphMap, completePct, unitBars };
    });
  }, [lessons, schoolWeekLen]);

  const totalCols = schoolDays.length;

  return (
    <div className={styles.root}>
      {/* Gradient month-header strip */}
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

      {/* Day-column header (weekday label + date number) */}
      <div className={styles.dayHeader}>
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

      {/* Lane rows */}
      {subjectData.map(
        ({ subject, tone, glyphMap, completePct, unitBars }, li) => (
          <div
            key={subject.id}
            className={styles.laneRow}
            style={{
              borderTop: li > 0 ? "1px solid #ECEEF7" : "none",
            }}
          >
            {/* Lane card */}
            <LaneCard
              name={subject.name}
              completePct={completePct}
              tone={tone}
              fullHeight
            />

            {/* Grid area: glyph row + unit bars overlay */}
            <div className={styles.laneGrid} style={{ width: totalCols * COL }}>
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
                      <StatusGlyph state={state} tone={tone} size={13} />
                    </div>
                  );
                })}
              </div>

              {/* UNITS row — highlighter bars */}
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
                      style={{
                        left,
                        width,
                        background: tone.stroke,
                        border: `1px solid color-mix(in oklch, ${tone.deep} 25%, transparent)`,
                      }}
                      title={`${u.lessonCount} lessons`}
                    >
                      {/* Unit tile */}
                      <span
                        className={styles.unitTile}
                        style={{
                          background: "rgba(255,255,255,.55)",
                          color: tone.text,
                        }}
                      >
                        U{ui + 1}
                      </span>
                      {/* Unit label, clipped */}
                      <div
                        className={styles.unitMeta}
                        style={{ color: tone.text }}
                      >
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

      {/* Bottom legend */}
      <div className={styles.legend}>
        <span className={styles.legendLabel}>LESSON STATUS</span>
        <span className={styles.legendItem}>
          <StatusGlyph state="done" tone={ROAD_TONES[1]} size={12} />
          Completed
        </span>
        <span className={styles.legendItem}>
          <StatusGlyph state="current" tone={ROAD_TONES[0]} size={12} />
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
          <FlagIcon color="#5B61F4" />
          Unit Checkpoint
        </span>
        <span className={styles.legendItem}>
          <FlagIcon color="#0F7E72" />
          Mid-Unit Checkpoint
        </span>
        <span className={styles.legendItem}>
          <StarIcon color="#D9A41A" />
          Major Milestone
        </span>
      </div>
    </div>
  );
}

// Small inline icon helpers for the legend.
function FlagIcon({ color }: { color: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M4 22V4M4 4h13l-2 4 2 4H4" />
    </svg>
  );
}

function StarIcon({ color }: { color: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M12 2l3 6.5 7 1-5 5 1.2 7L12 18l-6.2 3.5L7 14.5l-5-5 7-1z" />
    </svg>
  );
}
