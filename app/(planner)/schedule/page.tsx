"use client";

// The /schedule route — the dedicated full-page surface for the vertical
// Schedule Pane (planning_document §5.4).
//
// Renders a small Sun…Thu day-strip chip selector above
// <ScheduleDayPane variant="page" day={selectedDay} />. Clicking a chip
// updates the app-state `selectedDay`, which is also the index the Daily
// view consumes — so a teacher who picks Tuesday here and then navigates
// to /daily lands on Tuesday automatically.
//
// The Weekly and Daily shells mount the same <ScheduleDayPane /> directly
// in their own chrome (Daily's rail, Weekly's grid replacement is the
// <ScheduleTimeline /> family). Those integrations are owned by the sibling
// agent; the public contract they consume is the barrel at
// `@/components/schedule`.

import { useAppState } from "@/lib/app-state";
import { WEEK_DAYS, WEEK_DAYS_SHORT } from "@/lib/mock";
import { dateNumberForWeekDay } from "@/lib/mock/calendar";
import { todayDayIndex } from "@/lib/schedule-data";
import { ScheduleDayPane } from "@/components/schedule";
import { useSchoolWeek, WEEKDAY_INDEX } from "@/lib/use-school-week";
import styles from "./page.module.css";

export default function SchedulePage() {
  const { week, selectedDay, setSelectedDay } = useAppState();
  // School-week days come from the team's configured selection
  // (CLAUDE.md §1). Map Weekday tokens → numeric indexes the day-strip
  // expects. The configured Weekday[] is already sorted Sun-first.
  const { days: configuredDays } = useSchoolWeek();
  const schoolWeekDays = configuredDays.map((d) => WEEKDAY_INDEX[d]);
  // app-state.selectedDay is plain `number` (default 0). We don't replace
  // it with today; the user's last-chosen day persists across sessions.
  const focusedDay = selectedDay;

  return (
    <div className={styles.root}>
      <header className={styles.pageHeader}>
        <span className={styles.eyebrow}>SCHEDULE</span>
        {/* The h1 carries the active day + week so a screen reader hops
            into a page heading that reflects what's on screen, mirroring
            the /weekly + /daily idiom. */}
        <h1 className={styles.title}>
          Schedule — {WEEK_DAYS[focusedDay] ?? "Day"}, Week {week}
        </h1>
      </header>

      <nav className={styles.dayStrip} aria-label="Choose a day to view">
        {schoolWeekDays.map((d) => {
          const isActive = d === focusedDay;
          const isToday = d === todayDayIndex();
          const dayLabel = WEEK_DAYS_SHORT[d] ?? "Day";
          const dateNum = dateNumberForWeekDay(week, d);
          return (
            <button
              key={d}
              type="button"
              className={[
                styles.dayChip,
                isActive ? styles.dayChipActive : "",
                isToday ? styles.dayChipToday : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setSelectedDay(d)}
              aria-pressed={isActive}
              aria-label={`${dayLabel} ${dateNum}${isToday ? " (today)" : ""}`}
            >
              <span className={styles.chipDay}>{dayLabel}</span>
              <span className={styles.chipDate}>{dateNum}</span>
            </button>
          );
        })}
      </nav>

      <div className={styles.paneSlot}>
        <ScheduleDayPane day={focusedDay} variant="page" />
      </div>
    </div>
  );
}
