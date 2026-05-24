"use client";

// ScheduleTimeline.tsx — the embeddable multi-column timeline canvas.
//
// Used by Weekly's Schedule mode as the in-grid replacement (5-day view).
// `scope="day"` is a future-friendly hook for an inline single-day variant;
// not used by the current integration but the prop stays so future surfaces
// can mount the same component without re-creating the geometry math.
//
// Two scopes:
//   • scope="week" — five day columns side-by-side with the time gutter
//                    on the left (Sun → Thu by default; the configured
//                    school week will drive this once the backend lands).
//   • scope="day"  — single day column with the time gutter; the day prop
//                    selects which day (default: today).
//
// The `showNonAcademic` prop is propagated to each ScheduleColumn which
// filters its block list accordingly. Filtering happens at the column so
// the empty-state shows correctly for a day with zero non-filtered blocks.
//
// Layout: a CSS grid with a fixed 44px gutter column on the left and N
// `1fr` day columns. `position: relative` on the grid is the parent the
// now-line and the absolute hour gridlines anchor to.

import type { ReactNode } from "react";
import { todayDayIndex } from "@/lib/schedule-data";
import { ScheduleColumn } from "./ScheduleColumn";
import { ScheduleTimeGutter } from "./ScheduleTimeGutter";
import styles from "./ScheduleTimeline.module.css";

export interface ScheduleTimelineProps {
  /** "week" → 5 columns (Sun–Thu); "day" → single column. */
  scope: "day" | "week";
  /**
   * Day index for `scope: "day"`. Defaults to todayDayIndex() when omitted.
   * Ignored when scope is "week".
   */
  day?: number;
  /**
   * When false, non-academic blocks (Recess, Lunch, Specials) are filtered
   * out so a teacher who wants the academic-only view gets a calmer canvas.
   * The Weekly Schedule-mode pill drives this top-level.
   */
  showNonAcademic: boolean;
}

/** The five school-week days the week-scope timeline renders. Stays in
 *  lock-step with `getWeekBlocks()`; once the school-week config is wired
 *  we'll derive this from the configured weekdays instead. */
const WEEK_DAY_INDICES: readonly number[] = [0, 1, 2, 3, 4];

export function ScheduleTimeline({
  scope,
  day,
  showNonAcademic,
}: ScheduleTimelineProps): ReactNode {
  const focusedDay = day ?? todayDayIndex();
  const columns = scope === "week" ? WEEK_DAY_INDICES : [focusedDay];

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
