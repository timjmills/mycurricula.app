import { describe, it, expect } from "vitest";

import {
  resolveNow,
  todayColumnIndex,
  weekdayTokenOf,
  type NowPeriod,
  type PeriodsForDay,
} from "@/lib/now-anchor";
import {
  DEFAULT_SCHOOL_WEEK,
  SCHOOL_WEEK_PRESETS,
  type Weekday,
} from "@/lib/use-school-week";

// Tests for the pure "now" resolver behind the UX-roadmap item-03 anchors
// (Weekly Today emphasis, Daily now-line, Today jumps). Pure functions only
// — `now` is always injected, never read from the system clock.
//
// Calendar fixture points (June 2026):
//   Sun 2026-06-07 · Mon 2026-06-08 · Tue 2026-06-09 · Wed 2026-06-10 ·
//   Thu 2026-06-11 · Fri 2026-06-12 · Sat 2026-06-13

/** Build a local Date at (y, m(1-based), d, hh:mm). */
function at(y: number, m: number, d: number, hh: number, mm: number): Date {
  return new Date(y, m - 1, d, hh, mm);
}

/** A simple 3-period day: 08:00–09:00, 09:00–09:50, gap, 10:20–11:10. */
const PERIODS: readonly NowPeriod[] = [
  { startMin: 8 * 60, endMin: 9 * 60 },
  { startMin: 9 * 60, endMin: 9 * 60 + 50 },
  { startMin: 10 * 60 + 20, endMin: 11 * 60 + 10 },
];

/** Fixed (non-rotating) resolver — every school day shares PERIODS. */
const fixedSchedule: PeriodsForDay = () => PERIODS;

const SUN_THU: readonly Weekday[] = DEFAULT_SCHOOL_WEEK;
const MON_FRI: readonly Weekday[] = SCHOOL_WEEK_PRESETS.monFri;
/** Custom 3-day week (Mon / Wed / Fri). */
const CUSTOM_3: readonly Weekday[] = ["mon", "wed", "fri"];

// ── weekdayTokenOf / todayColumnIndex ──────────────────────────────────────

describe("todayColumnIndex — configured-week column resolution", () => {
  it("maps a Sunday to column 0 of a Sun–Thu week", () => {
    const sunday = at(2026, 6, 7, 9, 0);
    expect(weekdayTokenOf(sunday)).toBe("sun");
    expect(todayColumnIndex(sunday, SUN_THU)).toBe(0);
  });

  it("maps a Monday to column 0 of a Mon–Fri week", () => {
    const monday = at(2026, 6, 8, 9, 0);
    expect(todayColumnIndex(monday, MON_FRI)).toBe(0);
  });

  it("maps a Wednesday to column 1 of a custom Mon/Wed/Fri week", () => {
    const wednesday = at(2026, 6, 10, 9, 0);
    expect(todayColumnIndex(wednesday, CUSTOM_3)).toBe(1);
  });

  it("returns null for a day outside the configured week", () => {
    const friday = at(2026, 6, 12, 9, 0);
    expect(todayColumnIndex(friday, SUN_THU)).toBeNull(); // Sun–Thu: Fri off
    const tuesday = at(2026, 6, 9, 9, 0);
    expect(todayColumnIndex(tuesday, CUSTOM_3)).toBeNull(); // Mon/Wed/Fri: Tue off
    const saturday = at(2026, 6, 13, 9, 0);
    expect(todayColumnIndex(saturday, MON_FRI)).toBeNull();
  });
});

// ── resolveNow — school-day + in-period resolution ─────────────────────────

describe("resolveNow — during school hours", () => {
  it("resolves a Sunday mid-period on a Sun–Thu week", () => {
    // 08:30 — halfway through period 0 (08:00–09:00).
    const anchor = resolveNow({
      now: at(2026, 6, 7, 8, 30),
      schoolWeekDays: SUN_THU,
      periodsForDay: fixedSchedule,
    });
    expect(anchor.isSchoolDay).toBe(true);
    expect(anchor.dayIndex).toBe(0);
    expect(anchor.minuteOfDay).toBe(8 * 60 + 30);
    expect(anchor.currentPeriodIndex).toBe(0);
    expect(anchor.fractionThroughPeriod).toBeCloseTo(0.5);
  });

  it("resolves a Monday on a Mon–Fri week", () => {
    // 09:25 — halfway through period 1 (09:00–09:50).
    const anchor = resolveNow({
      now: at(2026, 6, 8, 9, 25),
      schoolWeekDays: MON_FRI,
      periodsForDay: fixedSchedule,
    });
    expect(anchor.isSchoolDay).toBe(true);
    expect(anchor.dayIndex).toBe(0);
    expect(anchor.currentPeriodIndex).toBe(1);
    expect(anchor.fractionThroughPeriod).toBeCloseTo(0.5);
  });

  it("resolves a Wednesday on a custom Mon/Wed/Fri week", () => {
    const anchor = resolveNow({
      now: at(2026, 6, 10, 10, 45),
      schoolWeekDays: CUSTOM_3,
      periodsForDay: fixedSchedule,
    });
    expect(anchor.isSchoolDay).toBe(true);
    expect(anchor.dayIndex).toBe(1);
    expect(anchor.currentPeriodIndex).toBe(2);
    expect(anchor.fractionThroughPeriod).toBeCloseTo(0.5);
  });

  it("keeps the minute but nulls the period during a gap (passing time)", () => {
    // 10:00 — after period 1 ends (09:50), before period 2 starts (10:20).
    const anchor = resolveNow({
      now: at(2026, 6, 7, 10, 0),
      schoolWeekDays: SUN_THU,
      periodsForDay: fixedSchedule,
    });
    expect(anchor.isSchoolDay).toBe(true);
    expect(anchor.minuteOfDay).toBe(10 * 60); // line still positions
    expect(anchor.currentPeriodIndex).toBeNull();
    expect(anchor.fractionThroughPeriod).toBeNull();
  });
});

describe("resolveNow — off-hours and non-school days → nulls", () => {
  it("non-school day (Friday on Sun–Thu) nulls everything", () => {
    const anchor = resolveNow({
      now: at(2026, 6, 12, 9, 0),
      schoolWeekDays: SUN_THU,
      periodsForDay: fixedSchedule,
    });
    expect(anchor).toEqual({
      isSchoolDay: false,
      dayIndex: null,
      minuteOfDay: null,
      currentPeriodIndex: null,
      fractionThroughPeriod: null,
    });
  });

  it("before school: school day but null time fields", () => {
    const anchor = resolveNow({
      now: at(2026, 6, 7, 7, 0),
      schoolWeekDays: SUN_THU,
      periodsForDay: fixedSchedule,
    });
    expect(anchor.isSchoolDay).toBe(true);
    expect(anchor.dayIndex).toBe(0);
    expect(anchor.minuteOfDay).toBeNull();
    expect(anchor.currentPeriodIndex).toBeNull();
    expect(anchor.fractionThroughPeriod).toBeNull();
  });

  it("after school: school day but null time fields", () => {
    const anchor = resolveNow({
      now: at(2026, 6, 7, 16, 0),
      schoolWeekDays: SUN_THU,
      periodsForDay: fixedSchedule,
    });
    expect(anchor.isSchoolDay).toBe(true);
    expect(anchor.minuteOfDay).toBeNull();
    expect(anchor.currentPeriodIndex).toBeNull();
  });

  it("a school day with zero configured periods has no instructional window", () => {
    const anchor = resolveNow({
      now: at(2026, 6, 7, 9, 0),
      schoolWeekDays: SUN_THU,
      periodsForDay: () => [],
    });
    expect(anchor.isSchoolDay).toBe(true);
    expect(anchor.dayIndex).toBe(0);
    expect(anchor.minuteOfDay).toBeNull();
    expect(anchor.currentPeriodIndex).toBeNull();
  });
});

describe("resolveNow — period boundaries (half-open [start, end))", () => {
  it("first period's exact start is in-period at fraction 0", () => {
    const anchor = resolveNow({
      now: at(2026, 6, 7, 8, 0),
      schoolWeekDays: SUN_THU,
      periodsForDay: fixedSchedule,
    });
    expect(anchor.currentPeriodIndex).toBe(0);
    expect(anchor.fractionThroughPeriod).toBe(0);
  });

  it("a shared boundary belongs to the NEXT period", () => {
    // 09:00 — period 0 ends, period 1 starts.
    const anchor = resolveNow({
      now: at(2026, 6, 7, 9, 0),
      schoolWeekDays: SUN_THU,
      periodsForDay: fixedSchedule,
    });
    expect(anchor.currentPeriodIndex).toBe(1);
    expect(anchor.fractionThroughPeriod).toBe(0);
  });

  it("the final period's exact end is off-hours (day over)", () => {
    const anchor = resolveNow({
      now: at(2026, 6, 7, 11, 10),
      schoolWeekDays: SUN_THU,
      periodsForDay: fixedSchedule,
    });
    expect(anchor.isSchoolDay).toBe(true);
    expect(anchor.minuteOfDay).toBeNull();
    expect(anchor.currentPeriodIndex).toBeNull();
  });
});

// ── Rotation cycles — the resolver receives the date ───────────────────────

describe("resolveNow — rotating (A/B) schedules plug in via periodsForDay", () => {
  // An A/B rotation keyed on the date: even calendar day = A day (PERIODS),
  // odd = B day (one long block). The cycle is independent of the calendar
  // week — exactly the CLAUDE.md §1 case a fixed weekday→periods map can't
  // express.
  const B_PERIODS: readonly NowPeriod[] = [
    { startMin: 8 * 60, endMin: 12 * 60 },
  ];
  const rotating: PeriodsForDay = (_dayIndex, now) =>
    now.getDate() % 2 === 0 ? PERIODS : B_PERIODS;

  it("two same-weekday dates resolve against different cycle days", () => {
    // Mon 2026-06-08 (even → A day) at 09:25 → A's period 1.
    const aDay = resolveNow({
      now: at(2026, 6, 8, 9, 25),
      schoolWeekDays: MON_FRI,
      periodsForDay: rotating,
    });
    expect(aDay.currentPeriodIndex).toBe(1);

    // Mon 2026-06-15 (odd → B day) at 09:25 → B's single long block.
    const bDay = resolveNow({
      now: at(2026, 6, 15, 9, 25),
      schoolWeekDays: MON_FRI,
      periodsForDay: rotating,
    });
    expect(bDay.currentPeriodIndex).toBe(0);
    expect(bDay.fractionThroughPeriod).toBeCloseTo(85 / 240);
  });

  it("the rotation also reshapes the school-hours window", () => {
    // 11:30 is off-hours on an A day (last period ends 11:10) but
    // in-period on a B day (block runs to 12:00).
    const aDay = resolveNow({
      now: at(2026, 6, 8, 11, 30),
      schoolWeekDays: MON_FRI,
      periodsForDay: rotating,
    });
    expect(aDay.minuteOfDay).toBeNull();

    const bDay = resolveNow({
      now: at(2026, 6, 15, 11, 30),
      schoolWeekDays: MON_FRI,
      periodsForDay: rotating,
    });
    expect(bDay.minuteOfDay).toBe(11 * 60 + 30);
    expect(bDay.currentPeriodIndex).toBe(0);
  });
});
