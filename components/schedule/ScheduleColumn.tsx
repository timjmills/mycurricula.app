"use client";

// ScheduleColumn.tsx — one day of the multi-column timeline: a sticky
// day-header strip over a fixed-height column body that hosts the hour
// gridlines, the day's ScheduleBlocks, and (when today) the live
// <NowLine> (the shared roadmap-03 component from components/daily;
// the legacy schedule-local now-line component was deleted).
//
// The column body is the size hatch for everything inside: it is
// DAY_HEIGHT_PX tall, has the muted `--ink-50` background that visually
// recedes behind the colored blocks, and clips overflow so the blocks
// can extend "off the edge" of the visible window without leaking.
//
// Today / now signals (review finding M3 — one clock, no mocks):
//   • Header emphasis derives from the REAL clock + the CONFIGURED school
//     week via lib/now-anchor's todayColumnIndex — never the old
//     frozen-Monday mock in lib/schedule-data. SSR-safe per the WeeklyGrid
//     useTodayColumnIndex house pattern: null initial state (no emphasis
//     in the server HTML), real value in a post-mount effect, 60s re-check
//     so the emphasis migrates at midnight. Off-school-day → null → no
//     emphasis anywhere.
//   • The now-line is <NowLine day={day}>, which self-gates (today +
//     holiday + in-window) and owns the only 30s minute-tick — it arms its
//     interval ONLY when this column is today, so this component runs no
//     useNowTick of its own (review finding L6): header emphasis is
//     day-granular and the 60s today-sync below covers it.

import { useEffect, useState, type ReactNode } from "react";
import {
  DAY_HEIGHT_PX,
  HOUR_COUNT,
  PX_PER_MIN,
  getDayBlocks,
} from "@/lib/schedule-data";
import { WEEK_DAYS_SHORT } from "@/lib/mock";
import { dateNumberForWeekDay } from "@/lib/mock/calendar";
import { useAppState } from "@/lib/app-state";
import { useSchoolWeek } from "@/lib/use-school-week";
import { todayColumnIndex } from "@/lib/now-anchor";
// DELIBERATE DEEP IMPORT (bundle-slim lever A3): the schedule timeline is in
// the (planner) layout's client graph on every route (shell GlobalRail →
// ScheduleTimeline side panel), and NowLine is the ONLY runtime value it
// needs from the Daily family. Importing the daily BARREL here kept the
// entire daily+lesson-editor+teach graph (~150 kB gzip) in every planner
// route's first load; NowLine.tsx itself is a light leaf (lib-only imports).
import { NowLine } from "@/components/daily/NowLine";
import { ScheduleBlock } from "./ScheduleBlock";
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
  const { days: schoolWeekDays } = useSchoolWeek();

  // ── Today resolution — SSR-safe house pattern (findings M3/M4) ──────────
  // Initial null → server HTML carries no emphasis; the real clock answer
  // lands post-mount. setState with the same index bails out, so the 60s
  // re-check only re-renders when the answer actually changes (midnight).
  const [todayIdx, setTodayIdx] = useState<number | null>(null);
  useEffect(() => {
    const sync = (): void => {
      setTodayIdx(todayColumnIndex(new Date(), schoolWeekDays));
    };
    sync();
    const id = window.setInterval(sync, 60_000);
    return () => window.clearInterval(id);
  }, [schoolWeekDays]);
  const isToday = todayIdx !== null && todayIdx === day;

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

        <NowLine day={day} />
      </div>
    </div>
  );
}
