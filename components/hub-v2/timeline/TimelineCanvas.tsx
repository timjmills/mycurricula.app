"use client";

// TimelineCanvas.tsx — the scrolling timeline surface: month row, day row,
// holiday / week / current-week / today underlay, and the subject lanes.
//
// Geometry is expressed in `calc(var(--tl-col) * n)` rather than a JS pixel
// number so ONE CSS variable can widen every column at a coarse pointer — the
// fix for the handoff's 14px marks and 16px minimum column, both under the
// ≥44px touch-target contract (CLAUDE.md §4; audit B8).
//
// Horizontal scroll lives INSIDE this element. CLAUDE.md §4 forbids
// document-level horizontal scroll but explicitly permits "a wide grid inside a
// scrollable container", which is what a year-long axis has to be.

import { useEffect, useRef, type ReactNode } from "react";
import type {
  TimelineDay,
  TimelineLane,
  TimelineMonthBand,
} from "@/lib/plan-timeline";
import type { SubjectId } from "@/lib/types";
import { TimelineLaneRow } from "./TimelineLaneRow";
import styles from "./timeline.module.css";

export interface TimelineCanvasProps {
  axis: readonly TimelineDay[];
  months: readonly TimelineMonthBand[];
  lanes: readonly TimelineLane[];
  /** Slot the today line sits on, or null when today has no place on this axis. */
  todaySlot: number | null;
  /** Inclusive slot range of the week being planned, or null. */
  currentWeekRange: { startSlot: number; endSlot: number } | null;
  matchesUnit: (unitId: string, name: string) => boolean;
  matchesLesson: (title: string, unitId: string) => boolean;
  /** `subject` is required: a unit slug is unique only WITHIN a subject, so
   *  `unitId` alone cannot identify which unit was clicked. */
  onOpenUnit: (unitId: string, name: string, subject: SubjectId) => void;
  onOpenLesson: (lessonId: string, title: string) => void;
}

export function TimelineCanvas({
  axis,
  months,
  lanes,
  todaySlot,
  currentWeekRange,
  matchesUnit,
  matchesLesson,
  onOpenUnit,
  onOpenLesson,
}: TimelineCanvasProps): ReactNode {
  const scrollRef = useRef<HTMLDivElement>(null);
  const columns = axis.length;

  // Open near today rather than at week 1 (`ph-units.jsx:314`). Runs once per
  // today-change: re-running on every render would fight a teacher who has
  // scrolled. `behavior` is left default (instant) — an animated jump on mount
  // is motion that clarifies nothing.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || todaySlot === null) return;
    const col = el.clientWidth > 0 ? el.clientWidth : 0;
    const colWidth =
      parseFloat(
        getComputedStyle(el).getPropertyValue("--tl-col").trim() || "34",
      ) || 34;
    el.scrollLeft = Math.max(0, todaySlot * colWidth - col * 0.45);
  }, [todaySlot]);

  return (
    <div className={styles.scroller} ref={scrollRef}>
      <div
        className={styles.inner}
        style={{ width: `calc(var(--tl-lbl) + var(--tl-col) * ${columns})` }}
      >
        <div className={styles.head}>
          <div className={styles.headRow}>
            <div className={styles.headSpacer} />
            {months.map((m) => (
              <div
                key={m.key}
                className={styles.month}
                style={{ width: `calc(var(--tl-col) * ${m.span})` }}
              >
                {m.label}
              </div>
            ))}
          </div>
          <div className={styles.headRow}>
            <div className={styles.headSpacer} />
            {axis.map((d) => (
              <div
                key={d.slot}
                className={styles.day}
                data-week-start={d.weekStart || undefined}
                data-holiday={d.holiday ? true : undefined}
                data-today={d.slot === todaySlot || undefined}
                title={
                  d.holiday
                    ? `${d.holiday} — no school`
                    : `${d.wkd} ${d.dateNum} · Week ${d.week}`
                }
              >
                <span className={styles.dayWkd}>{d.wkd}</span>
                <span className={styles.dayNum}>{d.dateNum}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.lanes}>
          {/* Underlay: holiday fills, week rules, the planning-week highlight
              and the today line (`ph-units.jsx:549-558`). Pointer-transparent
              and aria-hidden — it is atmosphere behind the marks, and every
              fact it draws is also stated in a column's `title`. */}
          <div
            className={styles.grid}
            aria-hidden="true"
            style={{ width: `calc(var(--tl-col) * ${columns})` }}
          >
            {currentWeekRange && (
              <div
                className={styles.currentWeek}
                style={{
                  left: `calc(var(--tl-col) * ${currentWeekRange.startSlot})`,
                  width: `calc(var(--tl-col) * ${currentWeekRange.endSlot - currentWeekRange.startSlot + 1})`,
                }}
              />
            )}
            {axis.map((d) =>
              d.holiday ? (
                <div
                  key={`h${d.slot}`}
                  className={styles.holiday}
                  style={{
                    left: `calc(var(--tl-col) * ${d.slot})`,
                    width: "var(--tl-col)",
                  }}
                />
              ) : d.weekStart ? (
                <div
                  key={`w${d.slot}`}
                  className={styles.weekRule}
                  style={{ left: `calc(var(--tl-col) * ${d.slot})` }}
                />
              ) : null,
            )}
            {todaySlot !== null && (
              <div
                className={styles.todayLine}
                style={{
                  left: `calc(var(--tl-col) * ${todaySlot} + var(--tl-col) / 2)`,
                }}
              />
            )}
          </div>

          {lanes.map((lane) => (
            <TimelineLaneRow
              key={lane.subject}
              lane={lane}
              columns={columns}
              matchesUnit={matchesUnit}
              matchesLesson={matchesLesson}
              onOpenUnit={onOpenUnit}
              onOpenLesson={onOpenLesson}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
