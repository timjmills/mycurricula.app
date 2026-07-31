"use client";

// The /schedule route — the dedicated full-page surface for the vertical
// Schedule Pane (planning_document §5.4).
//
// Renders a small day-strip chip selector above
// <ScheduleDayPane variant="page" day={selectedDay} />. Clicking a chip
// updates the app-state `selectedDay`, which is also the index the Daily
// view consumes — so a teacher who picks Tuesday here and then navigates
// to /daily lands on Tuesday automatically.
//
// ── ONE INDEXING SEMANTIC: `day` IS A POSITION, NOT A WEEKDAY ──────────────
// Every `day` / `selectedDay` / `dayIndex` in the planner is a 0-BASED
// POSITION IN THE CONFIGURED SCHOOL WEEK (0 = the first configured school day).
// That is the contract in lib/week-order.ts, the meaning of a lesson's `day`
// field, and what `todayColumnIndex` (lib/now-anchor.ts) returns.
//
// This page used to mix that with a SECOND, incompatible space: it built its
// chips from `WEEKDAY_INDEX[token]` — an ABSOLUTE Sun=0..Sat=6 weekday number —
// and passed those as `day` to `setSelectedDay` and <ScheduleDayPane>, which
// both read them as positions. The two spaces coincide only for a Sun–Thu week
// starting at Sunday, so the bug was invisible on the beta school and real
// everywhere else: a Mon–Fri school emitted 1..5 into a 0..4 space (every day
// off by one, Friday blank), and a Mon–Sat school lost two days off the end.
// The absolute space is gone from this file; `index` from `useOrderedWeekdays()`
// is the only day number here.

import { useEffect, useState } from "react";
import { useAppState } from "@/lib/app-state";
import { ScheduleDayPane } from "@/components/schedule";
import { useOrderedWeekdays } from "@/lib/week-order";
import { useWeekDates } from "@/lib/use-week-dates";
import { useSchoolWeek } from "@/lib/use-school-week";
import { todayColumnIndex } from "@/lib/now-anchor";
import styles from "./page.module.css";

export default function SchedulePage() {
  const { week, selectedDay, setSelectedDay } = useAppState();
  // Day columns come from the team's configured school week (CLAUDE.md §1).
  // `index` is the position — see the header note on indexing.
  const weekdays = useOrderedWeekdays();
  const { days: schoolWeekDays } = useSchoolWeek();
  const { dateNumberFor } = useWeekDates();

  // ── Today resolution — SSR-safe house pattern ───────────────────────────
  // Initial null → the server HTML carries no "today" emphasis; the real clock
  // answer lands post-mount. Replaces `todayDayIndex()`, which returned a
  // hard-coded 1 (Monday) regardless of the date OR the configured week.
  const [todayIdx, setTodayIdx] = useState<number | null>(null);
  useEffect(() => {
    const sync = (): void => {
      setTodayIdx(todayColumnIndex(new Date(), schoolWeekDays));
    };
    sync();
    const id = window.setInterval(sync, 60_000);
    return () => window.clearInterval(id);
  }, [schoolWeekDays]);

  // app-state.selectedDay persists across sessions, so it can outlive a
  // shrinking school week (5-day → 3-day). Clamp rather than render a chip
  // strip with nothing active and a pane pointed at a day that no longer
  // exists.
  const focusedDay = Math.min(selectedDay, Math.max(weekdays.length - 1, 0));

  return (
    <div className={styles.root}>
      <header className={styles.pageHeader}>
        <span className={styles.eyebrow}>SCHEDULE</span>
        {/* The h1 carries the active day + week so a screen reader hops
            into a page heading that reflects what's on screen, mirroring
            the /weekly + /daily idiom. */}
        <h1 className={styles.title}>
          Schedule — {weekdays[focusedDay]?.longLabel ?? "Day"}, Week {week}
        </h1>
      </header>

      <nav className={styles.dayStrip} aria-label="Choose a day to view">
        {weekdays.map(({ index, label }) => {
          const isActive = index === focusedDay;
          const isToday = todayIdx !== null && todayIdx === index;
          // Nullable by design (lib/week-dates.ts): a day the configuration
          // cannot date shows its name and no number, never a plausible
          // wrong date.
          const dateNum = dateNumberFor(week, index);
          const dateText = dateNum === null ? "" : ` ${dateNum}`;
          return (
            <button
              key={index}
              type="button"
              className={[
                styles.dayChip,
                isActive ? styles.dayChipActive : "",
                isToday ? styles.dayChipToday : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setSelectedDay(index)}
              aria-pressed={isActive}
              aria-label={`${label}${dateText}${isToday ? " (today)" : ""}`}
            >
              <span className={styles.chipDay}>{label}</span>
              {dateNum !== null && (
                <span className={styles.chipDate}>{dateNum}</span>
              )}
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
