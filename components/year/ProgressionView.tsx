"use client";

// ProgressionView — List mode (viewMode === "list").
//
// Day-by-day calendar: per-school-day columns with weekday labels + date
// numbers, a TODAY marker, and per-subject lane rows each containing a
// LaneCard on the left and StatusGlyph cells across the day grid. Unit
// marker bars are absolutely positioned over the glyph row.
//
// The view loads ALL 36 weeks × schoolWeekLen days. There is no internal
// horizontal scroll or sticky header: YearView's shared scroll wrapper +
// <QuarterMonthWeekHeader> handle panning + the month/week timeline labels.
// The parent observes lanes via `onActiveSubjectChange` for the chameleon.
//
// Colors come exclusively from the canonical cp-subj cascade (app/tokens.css).
// Each lane row carries `cp-subj <subjectId>` so var(--c) / var(--cl) /
// var(--cd) resolve to the correct subject highlight color throughout the row.

import { useMemo, useEffect, useRef } from "react";
import { usePlanner } from "@/lib/planner-store";
import { SUBJECTS, CURRENT_WEEK } from "@/lib/mock";
import {
  buildSchoolDays,
  groupByMonth,
  buildDayGlyphMap,
  subjectCompletePct,
  lessonToFlatIndex,
  allYearWeeks,
  DEFAULT_SCHOOL_WEEK,
  DEFAULT_TERM_START,
} from "@/lib/year-calendar";
import { pacingFor } from "@/lib/year-pacing";
import { useMinimizedSubjects } from "@/lib/year-state";
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

// ── Props ─────────────────────────────────────────────────────────────────

export interface ProgressionViewProps {
  /** Called when the topmost intersecting lane changes (chameleon driver). */
  onActiveSubjectChange?: (subjectId: SubjectId) => void;
}

// ── Component ─────────────────────────────────────────────────────────────

export function ProgressionView({
  onActiveSubjectChange,
}: ProgressionViewProps = {}) {
  const { lessons } = usePlanner();
  const { isMinimized, toggle } = useMinimizedSubjects();

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

  // ── Calendar data ─────────────────────────────────────────────────────

  const schoolWeekLen = DEFAULT_SCHOOL_WEEK.length;
  const totalYearWeeks = useMemo(() => allYearWeeks().length, []);

  // Build the flat school-day array for the full school year.
  const schoolDays = useMemo(
    () =>
      buildSchoolDays(DEFAULT_TERM_START, totalYearWeeks, DEFAULT_SCHOOL_WEEK),
    [totalYearWeeks],
  );
  // monthGroups is kept for potential future use but is no longer rendered
  // here — the QuarterMonthWeekHeader carries the month bands now.
  void groupByMonth(schoolDays);

  // Today's flat school-day index.
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

      const pacing = pacingFor(subjectId, lessons, todayFlatIdx, {
        dayCount: schoolWeekLen,
      });

      return { subject, subjectId, glyphMap, completePct, unitBars, pacing };
    });
  }, [lessons, schoolWeekLen, todayFlatIdx]);

  // Sort: expanded subjects first, minimized at the bottom.
  const orderedLanes = useMemo(() => {
    const expanded = subjectData.filter((l) => !isMinimized(l.subjectId));
    const minimized = subjectData.filter((l) => isMinimized(l.subjectId));
    return [...expanded, ...minimized];
  }, [subjectData, isMinimized]);

  const totalCols = schoolDays.length;

  return (
    <div className={styles.root}>
      {/* Lane rows */}
      <div className={styles.lanes}>
        {orderedLanes.map(
          (
            { subject, subjectId, glyphMap, completePct, unitBars, pacing },
            li,
          ) => {
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
                }}
              >
                <LaneCard
                  name={subject.name}
                  subjectId={subjectId}
                  completePct={completePct}
                  pacing={pacing}
                  fullHeight={!minimized}
                  minimized={minimized}
                  onToggleMinimize={() => toggle(subjectId)}
                />

                {!minimized && (
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
                            <StatusGlyph state={state} size={13} />
                          </div>
                        );
                      })}
                    </div>

                    {/* UNITS row — unit bars colored by var(--c) from the row */}
                    <div className={styles.unitRow}>
                      {schoolDays.map((d, i) => (
                        <div
                          key={i}
                          className={`${styles.unitGridLine} ${d.firstOfMonth && i > 0 ? styles.monthBoundary : ""}`}
                          style={{ width: COL }}
                        />
                      ))}

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
                            <span className={styles.unitTile}>U{ui + 1}</span>
                            <div className={styles.unitMeta}>
                              <IconBook width={10} height={10} />
                              <span>{u.lessonCount} lessons</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          },
        )}
      </div>

      {/* Bottom legend */}
      <div className={styles.legend}>
        <span className={styles.legendLabel}>LESSON STATUS</span>
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
