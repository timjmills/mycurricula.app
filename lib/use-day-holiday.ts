"use client";

// use-day-holiday — small composer over useHolidays() that resolves a
// {week, dayIndex} pair into the matching Holiday (or null). Lifted out of
// the per-view consumers (WeeklyGrid, WeeklyList, DailyView) so all three
// surfaces compute holiday matching from the SAME source of truth and the
// SAME date arithmetic — keeping the F#20 holiday visualization (year +
// weekly + daily) consistent.
//
// The matching rule is calendar-date equality: we ask `dateForWeekDay`
// (lib/mock/calendar.ts) for the local Date of the given (week, dayIndex),
// format it as YYYY-MM-DD locally (NOT via toISOString — that would shift to
// UTC and silently miss matches in negative-offset locales), and look it up
// in the holidays list.
//
// Mock-calendar note: dateForWeekDay currently lives in lib/mock and is a
// prototype helper. When the real calendar service lands (school-week
// configuration + Ramadan timetable + week renumbering), this hook should
// keep working as long as the replacement exports a `dateForWeekDay(week,
// dayIndex) → Date` with the same contract.

import { useMemo } from "react";
import { dateForWeekDay } from "@/lib/mock/calendar";
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
  return useMemo(() => {
    if (holidays.length === 0) return null;
    const iso = dateToLocalIso(dateForWeekDay(week, dayIndex));
    return holidays.find((h) => h.date === iso) ?? null;
  }, [holidays, week, dayIndex]);
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
      const iso = dateToLocalIso(dateForWeekDay(week, d));
      const match = byIso.get(iso);
      if (match) out.set(d, match);
    }
    return out;
  }, [holidays, week, dayCount]);
}
