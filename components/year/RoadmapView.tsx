"use client";

// RoadmapView — Grid mode (viewMode === "grid").
//
// Weekly-column overview: a fixed left "class summary" card per lane, then a
// horizontal scroll of week columns. Each lane row shows unit bars (Brush-style
// colored blocks) spanning their week ranges, with status pills (IN PROGRESS /
// COMPLETE / MODIFIED / UPCOMING), per-lesson dot rows, and checkpoint flags.
//
// Colors come exclusively from the canonical cp-subj cascade (app/tokens.css).
// Each lane row carries `cp-subj <subjectId>` so var(--c) / var(--cl) /
// var(--cd) resolve to the correct subject highlight color throughout the row.
//
// Data flow: reads lessons from usePlanner(). Units derived by grouping
// lessons per subject. Week columns derived from the configured school week
// (DEFAULT_WEEKS_IN_VIEW weeks).

import { useMemo, useState, useEffect, useRef } from "react";
import { usePlanner } from "@/lib/planner-store";
import { SUBJECTS, CURRENT_WEEK } from "@/lib/mock";
import {
  subjectCompletePct,
  DEFAULT_SCHOOL_WEEK,
  DEFAULT_WEEKS_IN_VIEW,
} from "@/lib/year-calendar";
import { subjectClassName } from "./roadTones";
import { LaneCard } from "./LaneCard";
import styles from "./RoadmapView.module.css";
import type { SubjectId, LessonStatus } from "@/lib/types";

// ── Inline icons ──────────────────────────────────────────────────────────

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

const IconFlag = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <path d="M4 22V4M4 4h13l-2 4 2 4H4" />
  </svg>
);

const IconStar = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <path d="M12 2l3 6.5 7 1-5 5 1.2 7L12 18l-6.2 3.5L7 14.5l-5-5 7-1z" />
  </svg>
);

const IconCheck = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    aria-hidden="true"
  >
    <path d="M5 12l4 4 10-10" />
  </svg>
);

// ── Status pill ───────────────────────────────────────────────────────────

type UnitStatus = "IN PROGRESS" | "COMPLETE" | "MODIFIED" | "UPCOMING";

function StatusPill({ status }: { status: UnitStatus }) {
  // Status pills use semantic / neutral tokens, not subject colors.
  const map: Record<UnitStatus, { bg: string; fg: string }> = {
    "IN PROGRESS": { bg: "var(--important-bg)", fg: "var(--important)" },
    COMPLETE: { bg: "var(--fyi-bg)", fg: "var(--reading-deep)" },
    MODIFIED: { bg: "var(--catchup-bg)", fg: "var(--catchup)" },
    UPCOMING: { bg: "var(--ink-100)", fg: "var(--ink-500)" },
  };
  const m = map[status] ?? map.UPCOMING;
  return (
    <span
      className={styles.statusPill}
      style={{ background: m.bg, color: m.fg }}
    >
      {status}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Derive the unit status from the lesson completion in the unit. */
function deriveUnitStatus(
  done: number,
  total: number,
  anyModified: boolean,
  firstWeek: number,
): UnitStatus {
  if (total === 0) return "UPCOMING";
  if (done === total) return "COMPLETE";
  if (anyModified) return "MODIFIED";
  // If the unit's first week is in the future relative to CURRENT_WEEK → UPCOMING
  if (firstWeek > CURRENT_WEEK) return "UPCOMING";
  return "IN PROGRESS";
}

/** Map a LessonStatus to a dot state for the dot row. */
function lessonStatusToDotState(
  status: LessonStatus,
): "done" | "current" | "upcoming" {
  if (status === "done") return "done";
  if (status === "carried" || status === "partial") return "current";
  return "upcoming";
}

// ── Component ─────────────────────────────────────────────────────────────

/** Min-width of each week column in px. */
const WEEK_COL_MIN = 108;

export function RoadmapView() {
  const { lessons } = usePlanner();
  const schoolWeekLen = DEFAULT_SCHOOL_WEEK.length;

  // ── Chameleon banner state ────────────────────────────────────────────
  // Tracks which subject lane is topmost in the viewport so the sticky
  // week-column header can adopt that subject's color gradient.
  const [activeSubjectId, setActiveSubjectId] = useState<SubjectId>(
    SUBJECTS[0].id as SubjectId,
  );
  const laneRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    // root: null → observe against the viewport (page scroll context).
    // rootMargin: -1px top clears the sticky header itself; -90% bottom means
    // only lanes whose top edge is in the top 10% of the viewport are active.
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the intersecting entry with the smallest top — topmost lane.
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
        root: null,
        rootMargin: "-1px 0px -90% 0px",
      },
    );

    laneRefs.current.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  // ── Week label data ───────────────────────────────────────────────────

  // Build week labels: "Wk 1", "Wk 2", … for DEFAULT_WEEKS_IN_VIEW weeks.
  // In production these would derive from real calendar dates.
  const weekLabels = useMemo(
    () =>
      Array.from({ length: DEFAULT_WEEKS_IN_VIEW }, (_, i) => `Wk ${i + 1}`),
    [],
  );

  // Per-subject lane data.
  const laneData = useMemo(() => {
    return SUBJECTS.map((subject) => {
      const subjectId = subject.id as SubjectId;
      const completePct = subjectCompletePct(lessons, subjectId);
      const subjectLessons = lessons.filter((l) => l.subject === subject.id);

      // Group lessons by unit id.
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

      const units = [...unitMap.values()].map((u) => {
        const doneCount = u.lessons.filter((l) => l.status === "done").length;
        const anyModified = u.lessons.some((l) => l.modified);
        // Convert 1-based week to 0-based column index.
        const firstWeekIdx = u.minWeek - 1;
        const lastWeekIdx = u.maxWeek - 1;
        const span = lastWeekIdx - firstWeekIdx + 1;
        const status = deriveUnitStatus(
          doneCount,
          u.lessons.length,
          anyModified,
          u.minWeek,
        );
        return {
          unitId: u.unitId,
          firstWeekIdx,
          span,
          lessonCount: u.lessons.length,
          doneCount,
          status,
          lessonStatuses: u.lessons
            .slice()
            .sort(
              (a, b) =>
                a.week * schoolWeekLen +
                a.day -
                (b.week * schoolWeekLen + b.day),
            )
            .map((l) => l.status),
        };
      });

      // Synthetic checkpoint at the week after the last unit of this subject.
      const lastUnit = units[units.length - 1];
      const checkpointWeekIdx = lastUnit
        ? lastUnit.firstWeekIdx + lastUnit.span
        : undefined;

      return { subject, subjectId, completePct, units, checkpointWeekIdx };
    });
  }, [lessons, schoolWeekLen]);

  return (
    <div className={styles.root}>
      {/* Lanes container — display:contents in CSS so it introduces no scroll
          context. The sticky header anchors to the page (<main>) scroll
          context; IntersectionObserver uses root:null (the viewport). */}
      <div className={styles.lanesScrollArea}>
        {/* Week-column header — STICKY. Carries the active subject's cp-subj
            class so var(--cl) / var(--cd) resolve to the chameleon color. */}
        <div
          className={`${styles.headerRow} ${styles.headerRowChameleon} ${subjectClassName(activeSubjectId)}`}
        >
          {/* Left column spacer */}
          <div className={styles.headerSpacer} />
          {/* Week labels */}
          <div className={styles.weekHeader}>
            <div
              className={styles.weekGrid}
              style={{
                gridTemplateColumns: `repeat(${weekLabels.length}, minmax(${WEEK_COL_MIN}px, 1fr))`,
              }}
            >
              {weekLabels.map((label, i) => (
                <div
                  key={i}
                  className={`${styles.weekCell} ${i > 0 ? styles.weekBorder : ""}`}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Lane rows — each row carries cp-subj so var(--c/--cl/--cd) resolve
            to the correct subject color for all children in the row.
            data-lane-subject enables IntersectionObserver lane detection. */}
        {laneData.map(
          (
            { subject, subjectId, completePct, units, checkpointWeekIdx },
            li,
          ) => (
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
              {/* Class summary card — inherits cp-subj from the row */}
              <LaneCard
                name={subject.name}
                subjectId={subjectId}
                completePct={completePct}
                fullHeight
              />

              {/* Timeline column */}
              <div className={styles.timeline}>
                {/* Unit bars row */}
                <div
                  className={styles.unitBarRow}
                  style={{
                    gridTemplateColumns: `repeat(${weekLabels.length}, minmax(${WEEK_COL_MIN}px, 1fr))`,
                  }}
                >
                  {/* Background grid lines */}
                  {weekLabels.map((_, i) => (
                    <div
                      key={i}
                      className={`${styles.bgLine} ${i > 0 ? styles.weekBorder : ""}`}
                    />
                  ))}

                  {/* Unit blocks — brush fills use var(--c) from the lane cascade */}
                  {units.map((u, ui) => (
                    <div
                      key={u.unitId}
                      className={styles.unitBlock}
                      style={{
                        gridColumn: `${u.firstWeekIdx + 1} / span ${u.span}`,
                        gridRow: 1,
                        padding: "0 6px",
                      }}
                    >
                      <div className={styles.brush}>
                        {/* Unit tile: white tile on the saturated bar */}
                        <span className={styles.unitTile}>U{ui + 1}</span>
                        {/* Unit name + status pill */}
                        <div className={styles.unitInfo}>
                          <span className={styles.unitName}>
                            {subject.name} Unit {ui + 1}
                          </span>
                          <StatusPill status={u.status} />
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Checkpoint flag — border + icon color from var(--c) */}
                  {checkpointWeekIdx !== undefined &&
                    checkpointWeekIdx < weekLabels.length && (
                      <div
                        className={styles.checkpoint}
                        style={{
                          gridColumn: `${checkpointWeekIdx + 1} / span 1`,
                          gridRow: 1,
                        }}
                      >
                        <span className={styles.checkpointFlag}>
                          <IconFlag width={14} height={14} />
                        </span>
                        <span className={styles.checkpointLabel}>
                          Checkpoint
                        </span>
                      </div>
                    )}

                  {/* Star (right edge) */}
                  <div
                    className={styles.starBtn}
                    style={{ color: "var(--ink-300)" }}
                  >
                    <IconStar width={16} height={16} />
                  </div>
                </div>

                {/* Dot row (per-lesson progress dots) */}
                <div
                  className={styles.dotRow}
                  style={{
                    gridTemplateColumns: `repeat(${weekLabels.length}, minmax(${WEEK_COL_MIN}px, 1fr))`,
                  }}
                >
                  {units.map((u) => {
                    const totalDays = u.span * schoolWeekLen;
                    return (
                      <div
                        key={u.unitId}
                        className={styles.dotBlock}
                        style={{
                          gridColumn: `${u.firstWeekIdx + 1} / span ${u.span}`,
                        }}
                      >
                        <span className={styles.dotBlockLabel}>
                          <IconBook width={10} height={10} />
                          {u.lessonCount} Lessons &middot; {totalDays} school
                          days
                        </span>
                        <div className={styles.dotTrack}>
                          {u.lessonStatuses.map((status, i) => {
                            const dotState = lessonStatusToDotState(status);
                            const pct =
                              u.lessonCount === 1
                                ? 50
                                : (i / Math.max(1, u.lessonCount - 1)) * 100;
                            return (
                              <span
                                key={i}
                                className={`${styles.dot} ${styles[`dot_${dotState}`]}`}
                                style={{ left: `calc(${pct}% - 4px)` }}
                                aria-hidden="true"
                              />
                            );
                          })}
                          {/* Complete badge */}
                          {u.status === "COMPLETE" && (
                            <span
                              className={styles.completeBadge}
                              aria-label="Unit complete"
                            >
                              <IconCheck width={10} height={10} />
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ),
        )}
      </div>
      {/* end .lanesScrollArea */}

      {/* Bottom legend + summary */}
      <div className={styles.legendRow}>
        {/* Status legend */}
        <div className={styles.legendSection}>
          <div className={styles.legendTitle}>STATUS LEGEND</div>
          <div className={styles.pillGroup}>
            <StatusPill status="COMPLETE" />
            <StatusPill status="IN PROGRESS" />
            <StatusPill status="MODIFIED" />
            <StatusPill status="UPCOMING" />
          </div>
        </div>

        {/* Lesson progress */}
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

        {/* Roadmap summary stats */}
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
