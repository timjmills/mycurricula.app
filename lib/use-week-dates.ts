"use client";

// use-week-dates — the React seam over lib/week-dates.
//
// The resolver itself is pure and takes the academic-year start + the school
// week explicitly (so it is unit-testable without a clock, storage, or a DOM —
// see tests/week-dates.test.ts). This hook is the one place that binds those two
// arguments to the team's ACTUAL configuration, so a surface never has to
// re-derive them and two surfaces can never bind different ones.
//
// Both underlying hooks are SSR-safe (they hold a tenant-neutral default through
// the server render and sync post-mount), so this one inherits that contract:
// the server HTML and the first client paint agree, and the real configuration
// arrives in an effect.
//
// NULLS ARE REAL. Every resolver here can return null — see the nullability note
// in lib/week-dates.ts. A caller must render the absence (an em dash, a hidden
// date line), never a fallback date: a plausible wrong date is exactly the class
// of defect this module was built to remove.

import { useMemo } from "react";
import { useAcademicYear } from "@/lib/use-academic-year";
import { useSchoolWeek, type Weekday } from "@/lib/use-school-week";
import {
  dateForWeekDay,
  dateNumberForWeekDay,
  datesForWeek,
  lastDateOfWeek,
  weekDayForDate,
  weekStartsOnFirstSchoolDay,
  type WeekDayPosition,
} from "@/lib/week-dates";

export type { WeekDayPosition } from "@/lib/week-dates";

export interface WeekDates {
  /** Calendar date of `dayIndex` in `week`, or null when it names no real day. */
  dateFor: (week: number, dayIndex: number) => Date | null;
  /** Day-of-month number for `dayIndex` in `week`, or null. */
  dateNumberFor: (week: number, dayIndex: number) => number | null;
  /** Every configured school day of `week`, in column order. */
  datesFor: (week: number) => (Date | null)[];
  /** Last configured school day of `week` — the end of a span running through
   *  it. See the off-by-3 note in lib/week-dates.ts. */
  lastDateOf: (week: number) => Date | null;
  /** The inverse: locate a calendar date in the week/day grid, or null when it
   *  is before the year or falls on a day the school does not teach. */
  positionOf: (date: Date) => WeekDayPosition | null;
  /** The configured school week, so a caller can size a loop without a second
   *  `useSchoolWeek()` that could resolve differently mid-render. */
  schoolWeek: Weekday[];
  /** First day of the configured academic year. */
  yearStart: Date;
  /** False when the year start and the school week disagree about which day a
   *  week begins on — see the artifact note in lib/week-dates.ts. */
  aligned: boolean;
}

/**
 * The team's week→date resolvers, bound to the configured academic year and
 * school week.
 *
 *   const { dateNumberFor } = useWeekDates();
 *   const n = dateNumberFor(week, dayIndex);   // number | null
 */
export function useWeekDates(): WeekDates {
  const { start } = useAcademicYear();
  const { days } = useSchoolWeek();

  return useMemo(
    () => ({
      dateFor: (week: number, dayIndex: number) =>
        dateForWeekDay(week, dayIndex, start, days),
      dateNumberFor: (week: number, dayIndex: number) =>
        dateNumberForWeekDay(week, dayIndex, start, days),
      datesFor: (week: number) => datesForWeek(week, start, days),
      lastDateOf: (week: number) => lastDateOfWeek(week, start, days),
      positionOf: (date: Date) => weekDayForDate(date, start, days),
      schoolWeek: days,
      yearStart: start,
      aligned: weekStartsOnFirstSchoolDay(start, days),
    }),
    [start, days],
  );
}
