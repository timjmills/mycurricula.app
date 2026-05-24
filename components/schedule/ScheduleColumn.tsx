"use client";

// ScheduleColumn.tsx — one day of the multi-column timeline: a sticky
// day-header strip over a fixed-height column body that hosts the hour
// gridlines, the day's ScheduleBlocks, and (when today) the live
// ScheduleNowLine.
//
// The column body is the size hatch for everything inside: it is
// DAY_HEIGHT_PX tall, has the muted `--ink-50` background that visually
// recedes behind the colored blocks, and clips overflow so the blocks
// can extend "off the edge" of the visible window without leaking.
//
// Now-line behavior:
//   • Mounted only when the column represents today AND the live
//     now-minute falls inside the rendered window. The day-of-week check
//     uses the prop-supplied `day` so non-today columns never burn an
//     interval.
//   • Production swaps `nowMinuteMock()` for `minuteOfDay(useNowTick())`.

import type { ReactNode } from "react";
import {
  DAY_HEIGHT_PX,
  HOUR_COUNT,
  PX_PER_MIN,
  getDayBlocks,
  isMinuteWithinDay,
  nowMinuteMock,
  todayDayIndex,
} from "@/lib/schedule-data";
import { WEEK_DAYS_SHORT } from "@/lib/mock";
import { dateNumberForWeekDay } from "@/lib/mock/calendar";
import { useAppState } from "@/lib/app-state";
import { useNowTick } from "@/lib/use-now-tick";
import { ScheduleBlock } from "./ScheduleBlock";
import { ScheduleNowLine } from "./ScheduleNowLine";
import styles from "./ScheduleColumn.module.css";

export interface ScheduleColumnProps {
  /** Day index into the school week (0 = Sun … 4 = Thu). */
  day: number;
  /**
   * When false, blocks with `type === "non_academic"` are filtered out.
   * Propagated from <ScheduleTimeline showNonAcademic={…} /> — the Weekly
   * "Show non-academic" pill controls this top-level so a teacher who only
   * wants subject blocks gets a calmer canvas.
   */
  showNonAcademic: boolean;
  /**
   * "single-day" variant suppresses the date number in the header (the
   * page header carries it in that case).
   */
  compact?: boolean;
}

export function ScheduleColumn({
  day,
  showNonAcademic,
  compact = false,
}: ScheduleColumnProps): ReactNode {
  const { week } = useAppState();
  const isToday = day === todayDayIndex();

  // Live now-tick — only enabled for today's column. The hook is SSR-safe.
  // TODO: production should use `minuteOfDay(useNowTick({ enabled: isToday }))`.
  useNowTick({ enabled: isToday });
  const nowMin = nowMinuteMock();
  const showNowLine = isToday && isMinuteWithinDay(nowMin);

  const allBlocks = getDayBlocks(day);
  const blocks = showNonAcademic
    ? allBlocks
    : allBlocks.filter((b) => b.type !== "non_academic");

  const dayLabel = WEEK_DAYS_SHORT[day] ?? "Day";
  const dateNum = dateNumberForWeekDay(week, day);

  return (
    <div className={styles.column}>
      {/* Sticky header strip — Sun · 18 / Mon · 19 / … Today uses the
          catchup color + a heavier underline; other days are quiet. */}
      <div
        className={[
          styles.header,
          isToday ? styles.headerToday : "",
          compact ? styles.headerCompact : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <span className={styles.dayLabel}>{dayLabel}</span>
        {!compact && <span className={styles.dateNum}>{dateNum}</span>}
      </div>

      {/* Body — fixed-height ink-50 surface, hour gridlines, absolutely-
          positioned blocks, and (when today) the live now-line. */}
      <div className={styles.body} style={{ height: DAY_HEIGHT_PX }}>
        {/* Hour gridlines — one per hour mark; aligned to the gutter labels. */}
        {Array.from({ length: HOUR_COUNT }).map((_, i) => (
          <div
            key={i}
            className={styles.gridline}
            style={{ top: i * 60 * PX_PER_MIN }}
            aria-hidden="true"
          />
        ))}

        {blocks.length === 0 ? (
          <div className={styles.emptyState} role="status">
            No blocks scheduled
          </div>
        ) : (
          blocks.map((block) => <ScheduleBlock key={block.id} block={block} />)
        )}

        {showNowLine && <ScheduleNowLine nowMin={nowMin} />}
      </div>
    </div>
  );
}
