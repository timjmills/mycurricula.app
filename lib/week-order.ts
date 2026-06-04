"use client";

// week-order — the ONE ordered-week contract every planner surface consumes.
//
// CLAUDE.md §1 is emphatic: the school week (which weekdays the school runs
// and how many) is CONFIGURED per school, never hard-coded. Every calendar
// surface (Weekly grid columns, Daily day list, the weekly board) must derive
// its day columns, day COUNT, and weekday labels from that one configuration.
//
// The single source of truth is `useSchoolWeek()` in lib/use-school-week.ts —
// a team-scoped, localStorage-backed, SSR-safe selection of ordered Weekday
// tokens (Sun-first). This module is the thin presentation contract on top of
// it: it pairs each configured weekday with its display labels and its 0-based
// position so a view can render columns without reaching for the legacy
// `WEEK_DAYS` / `WEEK_DAYS_SHORT` fixtures in lib/mock (which were hard-locked
// to the Sun–Thu beta week and broke for any other school week).
//
// IMPORTANT — what `index` means. A lesson's numeric `day` field is a 0-based
// index INTO the configured school week (0 = the first configured school day,
// not an absolute Sun=0..Sat=6 position). This matches the rest of the
// planner: ProgressionView / year-calendar bucket lessons by `schoolWeek.length`
// and `lessonToFlatIndex` treats `day` as 0..(schoolWeekLen-1). So the entries
// here are ordered by the configured week and their `.index` is exactly the
// value a lesson's `day` must equal to land in that column.
//
// SSR-safety: this is a thin wrapper over `useSchoolWeek()`, which already
// guarantees the server render and the first client paint both use
// DEFAULT_SCHOOL_WEEK (Sun–Thu) and only sync localStorage in a post-mount
// effect. So consumers of `useOrderedWeekdays()` inherit that contract for
// free — no extra hydration handling needed.

import { useMemo } from "react";
import {
  useSchoolWeek,
  WEEKDAY_LABEL,
  WEEKDAY_LABEL_LONG,
  type Weekday,
} from "@/lib/use-school-week";

export type { Weekday } from "@/lib/use-school-week";

/**
 * One day column in the configured school week.
 *
 * - `token`     — the canonical Weekday token ("sun" … "sat").
 * - `index`     — 0-based position in the configured week. This is the value a
 *                 lesson's `day` field must equal to fall in this column.
 * - `label`     — short (3-letter) display label, e.g. "Sun".
 * - `longLabel` — full weekday name, e.g. "Sunday".
 */
export interface OrderedWeekday {
  token: Weekday;
  index: number;
  label: string;
  longLabel: string;
}

/**
 * Pure helper: turn an ordered Weekday[] (as `useSchoolWeek().days` returns)
 * into the presentation-ready OrderedWeekday[]. Exposed separately from the
 * hook so non-React call sites (and tests) can derive the same shape.
 */
export function orderedWeekdaysFrom(
  days: readonly Weekday[],
): OrderedWeekday[] {
  return days.map((token, index) => ({
    token,
    index,
    label: WEEKDAY_LABEL[token],
    longLabel: WEEKDAY_LABEL_LONG[token],
  }));
}

/**
 * The ordered, configured school week as display-ready columns.
 *
 * This is the contract planner surfaces consume instead of the legacy
 * `WEEK_DAYS` / `WEEK_DAYS_SHORT` mock fixtures:
 *
 *   const days = useOrderedWeekdays();
 *   days.map(({ index, label, longLabel }) => …)   // one column per day
 *   const dayCount = days.length;                  // never hard-coded
 *
 * Reads the team's configured school week from `useSchoolWeek()`, so the
 * number of columns, their order, and their labels all follow the school's
 * setup (Sun–Thu, Mon–Fri, a custom 3-day week, …). SSR-safe by inheritance
 * from `useSchoolWeek()` (see file header).
 */
export function useOrderedWeekdays(): OrderedWeekday[] {
  const { days } = useSchoolWeek();
  return useMemo(() => orderedWeekdaysFrom(days), [days]);
}
