"use client";

// ScheduleTimeline.tsx — the embeddable multi-column timeline canvas.
//
// Used by Weekly's Schedule mode as the in-grid replacement (5-day view).
// `scope="day"` is a future-friendly hook for an inline single-day variant;
// not used by the current integration but the prop stays so future surfaces
// can mount the same component without re-creating the geometry math.
//
// Two scopes:
//   • scope="week" — one column per CONFIGURED school day, side-by-side with
//                    the time gutter on the left. The column set comes from
//                    `useOrderedWeekdays()` (CLAUDE.md §1) — it used to be the
//                    literal `[0,1,2,3,4]`, which silently dropped a column on
//                    a Mon–Sat school and rendered a phantom one on a 3-day week.
//   • scope="day"  — single day column with the time gutter; the day prop
//                    selects which day (default: today's column, or the first
//                    school day when today is not a school day).
//
// The `showNonAcademic` prop is propagated to each ScheduleColumn which
// filters its block list accordingly. Filtering happens at the column so
// the empty-state shows correctly for a day with zero non-filtered blocks.
//
// Layout: a CSS grid with a fixed 44px gutter column on the left and N
// `1fr` day columns. `position: relative` on the grid is the parent the
// now-line and the absolute hour gridlines anchor to.

import { useEffect, useState, type ReactNode } from "react";
import { todayColumnIndex } from "@/lib/now-anchor";
import { useSchoolWeek } from "@/lib/use-school-week";
import { useOrderedWeekdays } from "@/lib/week-order";
import { ScheduleColumn } from "./ScheduleColumn";
import { ScheduleTimeGutter } from "./ScheduleTimeGutter";
import styles from "./ScheduleTimeline.module.css";

export interface ScheduleTimelineProps {
  /** "week" → one column per configured school day; "day" → single column. */
  scope: "day" | "week";
  /**
   * Day index for `scope: "day"` — a 0-based POSITION in the configured school
   * week, matching a lesson's `day` field. Defaults to today's column when
   * omitted. Ignored when scope is "week".
   */
  day?: number;
  /**
   * When false, non-academic blocks (Recess, Lunch, Specials) are filtered
   * out so a teacher who wants the academic-only view gets a calmer canvas.
   * The Weekly Schedule-mode pill drives this top-level.
   */
  showNonAcademic: boolean;
}

export function ScheduleTimeline({
  scope,
  day,
  showNonAcademic,
}: ScheduleTimelineProps): ReactNode {
  const weekdays = useOrderedWeekdays();
  const { days: schoolWeekDays } = useSchoolWeek();

  // Today's column — SSR-safe house pattern (null on the server render, real
  // answer post-mount). Replaces `todayDayIndex()`, which returned a hard-coded
  // 1 (Monday) regardless of the date or the configured week.
  const [todayIdx, setTodayIdx] = useState<number | null>(null);
  useEffect(() => {
    const sync = (): void => {
      setTodayIdx(todayColumnIndex(new Date(), schoolWeekDays));
    };
    sync();
    const id = window.setInterval(sync, 60_000);
    return () => window.clearInterval(id);
  }, [schoolWeekDays]);

  // Fall back to the first school day when the caller named no day and today
  // is a weekend / not yet resolved — a single column is required, and column 0
  // always exists whenever the school week does.
  const focusedDay = day ?? todayIdx ?? 0;
  const columns =
    scope === "week" ? weekdays.map((w) => w.index) : [focusedDay];

  return (
    <div className={styles.canvas}>
      <div
        className={styles.grid}
        style={{
          // The 44px gutter sits on the left; the rest of the row is
          // divided evenly among the day columns.
          gridTemplateColumns: `44px repeat(${columns.length}, 1fr)`,
        }}
      >
        <ScheduleTimeGutter />
        {columns.map((d) => (
          <ScheduleColumn
            key={d}
            day={d}
            showNonAcademic={showNonAcademic}
            compact={scope === "day"}
          />
        ))}
      </div>
    </div>
  );
}
