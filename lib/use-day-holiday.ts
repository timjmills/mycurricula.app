"use client";

// use-day-holiday — small composer over useHolidays() that resolves a
// {week, dayIndex} pair into the matching Holiday (or null). Lifted out of
// the per-view consumers (WeeklyGrid, WeeklyList, DailyView) so all three
// surfaces compute holiday matching from the SAME source of truth and the
// SAME date arithmetic — keeping the F#20 holiday visualization (year +
// weekly + daily) consistent.
//
// The matching rule is calendar-date equality: we ask the week→date resolver
// for the local Date of the given (week, dayIndex), format it as YYYY-MM-DD
// locally (NOT via toISOString — that would shift to UTC and silently miss
// matches in negative-offset locales), and look it up in the holidays list.
//
// The resolver is `useWeekDates()` (lib/use-week-dates.ts → lib/week-dates.ts),
// which derives dates from the team's CONFIGURED academic year and school week.
// It replaced `dateForWeekDay` from lib/mock/calendar.ts, which was anchored to
// a fictional Sunday and treated `dayIndex` as a raw day offset — so before this
// change, holidays were matched against dates from a made-up calendar, and any
// school whose week is not a contiguous run (Mon/Wed/Fri) matched the wrong days
// on top of that.
//
// The resolver returns null for a (week, dayIndex) that names no real day. That
// is NOT a holiday and NOT an error: it means the day does not exist in this
// school's configuration, so there is nothing to match and we return no holiday.

import { useMemo } from "react";
import { useWeekDates } from "@/lib/use-week-dates";
import { useHolidays, type Holiday } from "@/lib/use-holidays";

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Format a Date as YYYY-MM-DD in LOCAL time. We deliberately avoid
 * `toISOString()` here — that emits a UTC instant, and a 2026-01-19 local
 * date in (e.g.) PST round-trips through ISO as 2026-01-18, which would
 * miss the holiday lookup. Matches the same idiom used by
 * lib/use-academic-year.ts (`dateToIso`) so both layers agree.
 */
function dateToLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Hooks ──────────────────────────────────────────────────────────────────

/**
 * Returns the Holiday landing on (week, dayIndex), or null if the day is a
 * normal instruction day. If multiple holidays share a date — rare but
 * possible (e.g. a religious observance overlapping a national day) — the
 * FIRST match is returned; consumers wanting all matches should use
 * {@link useHolidaysByDay} instead.
 */
export function useDayHoliday(week: number, dayIndex: number): Holiday | null {
  const { holidays } = useHolidays();
  const { dateFor } = useWeekDates();
  return useMemo(() => {
    if (holidays.length === 0) return null;
    const date = dateFor(week, dayIndex);
    if (date === null) return null; // not a day this school teaches
    const iso = dateToLocalIso(date);
    return holidays.find((h) => h.date === iso) ?? null;
  }, [holidays, dateFor, week, dayIndex]);
}

/**
 * Returns a Map<dayIndex, Holiday> for the supplied week — convenient for
 * surfaces that iterate over every day of the school week (the Weekly grid
 * day headers, the Weekly list day sections, the Daily week strip) and want
 * a per-day O(1) lookup without re-running the search each render.
 *
 * Days without a holiday are simply absent from the map.
 */
export function useHolidaysByDay(
  week: number,
  dayCount: number,
): Map<number, Holiday> {
  const { holidays } = useHolidays();
  const { dateFor } = useWeekDates();
  return useMemo(() => {
    const out = new Map<number, Holiday>();
    if (holidays.length === 0) return out;
    // Build a date→holiday lookup once, then walk the week. This keeps the
    // overall cost at O(holidays + dayCount) — both small constants.
    const byIso = new Map<string, Holiday>();
    for (const h of holidays) {
      // First-wins on duplicates (see useDayHoliday).
      if (!byIso.has(h.date)) byIso.set(h.date, h);
    }
    for (let d = 0; d < dayCount; d++) {
      const date = dateFor(week, d);
      if (date === null) continue; // not a day this school teaches
      const match = byIso.get(dateToLocalIso(date));
      if (match) out.set(d, match);
    }
    return out;
  }, [holidays, dateFor, week, dayCount]);
}
