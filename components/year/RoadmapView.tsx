"use client";

// RoadmapView — Grid mode (viewMode === "grid").
//
// Weekly-column overview: a fixed left "class summary" card per lane, then a
// horizontal scroll of week columns. Each lane row shows unit bars (Brush-style
// colored blocks) spanning their week ranges, with status pills (IN PROGRESS /
// COMPLETE / MODIFIED / UPCOMING), per-lesson dot rows, and checkpoint flags.
//
// Data flow: reads lessons from usePlanner(). Units derived by grouping
// lessons per subject. Week columns derived from the configured school week
// (DEFAULT_WEEKS_IN_VIEW weeks).

import { useMemo } from "react";
import { usePlanner } from "@/lib/planner-store";
import { SUBJECTS, CURRENT_WEEK } from "@/lib/mock";
import {
  subjectCompletePct,
  DEFAULT_SCHOOL_WEEK,
  DEFAULT_WEEKS_IN_VIEW,
} from "@/lib/year-calendar";
import { toneForSubject } from "./roadTones";
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
  const map: Record<UnitStatus, { bg: string; fg: string }> = {
    "IN PROGRESS": { bg: "#FFE7A8", fg: "#7A4F08" },
    COMPLETE: { bg: "#CFF0D8", fg: "#107D3A" },
    MODIFIED: { bg: "#FFDDC2", fg: "#A4480A" },
    UPCOMING: { bg: "#E2E5F0", fg: "#5B6580" },
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
      const tone = toneForSubject(subject.id as SubjectId);
      const completePct = subjectCompletePct(lessons, subject.id as SubjectId);
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

      return { subject, tone, completePct, units, checkpointWeekIdx };
    });
  }, [lessons, schoolWeekLen]);

  return (
    <div className={styles.root}>
      {/* Week-column header */}
      <div className={styles.headerRow}>
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

      {/* Lane rows */}
      {laneData.map(
        ({ subject, tone, completePct, units, checkpointWeekIdx }, li) => (
          <div
            key={subject.id}
            className={styles.laneRow}
            style={{ borderTop: li > 0 ? "1px solid #ECEEF7" : "none" }}
          >
            {/* Class summary card */}
            <LaneCard
              name={subject.name}
              completePct={completePct}
              tone={tone}
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

                {/* Unit blocks */}
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
                    <div
                      className={styles.brush}
                      style={{
                        background: tone.stroke,
                        border: `1px solid color-mix(in oklch, ${tone.deep} 30%, transparent)`,
                      }}
                    >
                      {/* Unit tile */}
                      <span
                        className={styles.unitTile}
                        style={{
                          background: "rgba(255,255,255,.6)",
                          color: tone.deep,
                        }}
                      >
                        U{ui + 1}
                      </span>
                      {/* Unit name + status pill */}
                      <div className={styles.unitInfo}>
                        <span
                          className={styles.unitName}
                          style={{ color: tone.text }}
                        >
                          {subject.name} Unit {ui + 1}
                        </span>
                        <StatusPill status={u.status} />
                      </div>
                    </div>
                  </div>
                ))}

                {/* Checkpoint flag */}
                {checkpointWeekIdx !== undefined &&
                  checkpointWeekIdx < weekLabels.length && (
                    <div
                      className={styles.checkpoint}
                      style={{
                        gridColumn: `${checkpointWeekIdx + 1} / span 1`,
                        gridRow: 1,
                      }}
                    >
                      <span
                        className={styles.checkpointFlag}
                        style={{
                          border: `2px solid ${tone.check}`,
                          color: tone.check,
                        }}
                      >
                        <IconFlag width={14} height={14} />
                      </span>
                      <span className={styles.checkpointLabel}>Checkpoint</span>
                    </div>
                  )}

                {/* Star (right edge) */}
                <div className={styles.starBtn} style={{ color: "#CBD5E1" }}>
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
                        {u.lessonCount} Lessons &middot; {totalDays} school days
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
                              className={styles.dot}
                              style={{
                                left: `calc(${pct}% - 4px)`,
                                background:
                                  dotState === "done"
                                    ? tone.check
                                    : dotState === "current"
                                      ? tone.stroke
                                      : "#fff",
                                borderColor:
                                  dotState === "done"
                                    ? tone.check
                                    : dotState === "current"
                                      ? tone.check
                                      : "#CBD5E1",
                              }}
                              aria-hidden="true"
                            />
                          );
                        })}
                        {/* Complete badge */}
                        {u.status === "COMPLETE" && (
                          <span
                            className={styles.completeBadge}
                            style={{ background: tone.check }}
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
                className={styles.dotSample}
                style={{ background: "#10A050", borderColor: "#10A050" }}
              />
              Complete
            </span>
            <span className={styles.dotLegendItem}>
              <span
                className={styles.dotSample}
                style={{ background: "#A0F0B8", borderColor: "#10A050" }}
              />
              In Progress
            </span>
            <span className={styles.dotLegendItem}>
              <span
                className={styles.dotSample}
                style={{ background: "#fff", borderColor: "#CBD5E1" }}
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
