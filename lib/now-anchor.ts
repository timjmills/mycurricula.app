// now-anchor.ts — pure "where is now?" resolution for the Weekly / Daily /
// Year orientation anchors (UX roadmap item 03).
//
// No React, no DOM, no side effects — every function is a pure
// transformation over an injected `now: Date`, the CONFIGURED school week
// (CLAUDE.md §1: never hard-code the weekday set), and a period resolver
// derived from the CONFIGURED timetable (never a fixed Mon–Fri schedule).
//
// ── Why a resolver function instead of a static periods array ────────────
// The daily timetable may rotate on a cycle independent of the calendar
// week (A/B days, 6-day rotations — CLAUDE.md §1). Callers therefore pass
// `periodsForDay(dayIndex, now)`: the resolver receives the full Date, so
// a rotating schedule can derive WHICH cycle-day applies from the date
// before returning that day's periods. The Phase 1A fixture simply ignores
// the date (`(d) => getDayBlocks(d)`); a Phase 1B rotation engine plugs in
// without touching this module or its consumers.
//
// ── Units ─────────────────────────────────────────────────────────────────
// All times are minutes-of-day (0–1439), matching lib/schedule-data.ts —
// the geometry contract every Schedule surface reads (PX_PER_MIN,
// minuteToTop). A consumer can therefore feed `minuteOfDay` straight into
// `minuteToTop()` to position a now-line.

import { WEEKDAY_ORDER, type Weekday } from "@/lib/use-school-week";

// ── Types ──────────────────────────────────────────────────────────────────

/** Minimal period shape the resolver needs — structurally satisfied by
 *  lib/schedule-data's TimelineBlock (startMin/endMin), so the existing
 *  fixture plugs in without adapters. */
export interface NowPeriod {
  /** Period start, minutes from midnight. */
  startMin: number;
  /** Period end (exclusive), minutes from midnight. */
  endMin: number;
}

/**
 * Resolve the periods for one configured school day.
 *
 * @param dayIndex - 0-based index INTO the configured school week (0 = the
 *                   first configured school day — same contract as a
 *                   lesson's `day` field; see lib/week-order.ts).
 * @param now      - The full Date, so rotating schedules (A/B or longer
 *                   cycles) can resolve which cycle-day the date falls on.
 */
export type PeriodsForDay = (
  dayIndex: number,
  now: Date,
) => readonly NowPeriod[];

export interface ResolveNowInput {
  /** Injected clock — never read inside this module (testability; the
   *  consuming components own the tick cadence). */
  now: Date;
  /** The configured school week, as ordered Weekday tokens — exactly what
   *  `useSchoolWeek().days` returns. */
  schoolWeekDays: readonly Weekday[];
  /** Configured-timetable resolver; see {@link PeriodsForDay}. */
  periodsForDay: PeriodsForDay;
}

export interface NowAnchor {
  /** True when `now`'s weekday is one of the configured school days. */
  isSchoolDay: boolean;
  /** 0-based column/day index of `now` in the configured week, or null on
   *  a non-school day. This is the value a lesson's `day` field must equal
   *  to be "today's" lesson. */
  dayIndex: number | null;
  /** Minutes from midnight — non-null ONLY during school hours (from the
   *  first period's start to the last period's end) on a school day.
   *  Off-hours and non-school days resolve to null so consumers can gate
   *  the now-line on this single field. */
  minuteOfDay: number | null;
  /** Index into the day's periods array when `now` falls inside a period;
   *  null between periods (passing time), off-hours, or non-school days. */
  currentPeriodIndex: number | null;
  /** 0..1 progress through the current period; null whenever
   *  `currentPeriodIndex` is null. */
  fractionThroughPeriod: number | null;
}

// ── Weekday helpers ────────────────────────────────────────────────────────

/** Canonical Weekday token for a Date (Date.getDay() is Sun=0..Sat=6,
 *  matching WEEKDAY_ORDER's Sun-first layout). */
export function weekdayTokenOf(date: Date): Weekday {
  return WEEKDAY_ORDER[date.getDay()];
}

/**
 * The 0-based column index of `now`'s weekday in the CONFIGURED school
 * week, or null when today is not a school day. This is the single shared
 * "which column is today?" rule for the Weekly grid emphasis, the Daily
 * Today jump, and the now-line — correct for Sun–Thu, Mon–Fri, and custom
 * weeks because it only ever indexes into the injected configuration.
 */
export function todayColumnIndex(
  now: Date,
  schoolWeekDays: readonly Weekday[],
): number | null {
  const token = weekdayTokenOf(now);
  const idx = schoolWeekDays.indexOf(token);
  return idx === -1 ? null : idx;
}

// ── resolveNow ─────────────────────────────────────────────────────────────

/**
 * Resolve where "now" falls against the configured school week + timetable.
 *
 * Boundary semantics (period edges are half-open `[startMin, endMin)`):
 *   • At a shared boundary (period A ends exactly where period B starts)
 *     the minute belongs to B — the teacher is starting the next period.
 *   • At the final period's `endMin` the school day is over → all-null
 *     time fields (the Today chip alone carries orientation).
 *   • In a gap between periods (passing time) `minuteOfDay` stays non-null
 *     (the now-line still renders at the correct height) but
 *     `currentPeriodIndex` / `fractionThroughPeriod` are null.
 */
export function resolveNow(input: ResolveNowInput): NowAnchor {
  const { now, schoolWeekDays, periodsForDay } = input;

  const dayIndex = todayColumnIndex(now, schoolWeekDays);
  if (dayIndex === null) {
    // Non-school day — no line, no period, no minute.
    return {
      isSchoolDay: false,
      dayIndex: null,
      minuteOfDay: null,
      currentPeriodIndex: null,
      fractionThroughPeriod: null,
    };
  }

  const periods = periodsForDay(dayIndex, now);
  const minute = now.getHours() * 60 + now.getMinutes();

  // School-hours window = first period start → last period end. Derived
  // from the configured periods themselves (NOT a hard-coded bell time) so
  // a half-day, a Ramadan timetable, or a rotated short day all gate
  // correctly. An empty period list means no instructional window today.
  if (periods.length === 0) {
    return {
      isSchoolDay: true,
      dayIndex,
      minuteOfDay: null,
      currentPeriodIndex: null,
      fractionThroughPeriod: null,
    };
  }

  let firstStart = Infinity;
  let lastEnd = -Infinity;
  for (const p of periods) {
    if (p.startMin < firstStart) firstStart = p.startMin;
    if (p.endMin > lastEnd) lastEnd = p.endMin;
  }

  const withinHours = minute >= firstStart && minute < lastEnd;
  if (!withinHours) {
    // Before school / after school — Today chip only, no line.
    return {
      isSchoolDay: true,
      dayIndex,
      minuteOfDay: null,
      currentPeriodIndex: null,
      fractionThroughPeriod: null,
    };
  }

  // Locate the containing period (half-open interval; see header note).
  let currentPeriodIndex: number | null = null;
  let fractionThroughPeriod: number | null = null;
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    if (minute >= p.startMin && minute < p.endMin) {
      currentPeriodIndex = i;
      const span = p.endMin - p.startMin;
      // Zero/negative spans can't contain a half-open minute, so `span`
      // is always > 0 here; guard anyway against malformed config.
      fractionThroughPeriod = span > 0 ? (minute - p.startMin) / span : 0;
      break;
    }
  }

  return {
    isSchoolDay: true,
    dayIndex,
    minuteOfDay: minute,
    currentPeriodIndex,
    fractionThroughPeriod,
  };
}
