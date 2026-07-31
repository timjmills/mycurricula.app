import { describe, it, expect } from "vitest";

import {
  resolveCurrentWeek,
  type CurrentWeekBasis,
} from "@/lib/school-week-now";
import { weeksInRange } from "@/lib/year-calendar";

// Tests for the current-week derivation that replaced the mock `CURRENT_WEEK`
// constant (lib/mock/lessons.ts:21, frozen at 12) as the seed for every
// week-scoped surface.
//
// The numbering convention under test — week N is the Nth 7-CALENDAR-DAY block
// from the academic year's start — is not this module's invention; it is the
// one already baked into `weeksInRange`/`allYearWeeksFor` (lib/year-calendar.ts)
// and `dateForWeekDay` (lib/mock/calendar.ts). The "agrees with the Year view"
// block at the bottom is what stops the two drifting apart.

/** Local-midnight Date from civil parts. `m` is 1-based for readability. */
function d(y: number, m: number, day: number): Date {
  return new Date(y, m - 1, day);
}

// A realistic beta-school year: Sunday 2 Aug 2026 → Friday 25 Jun 2027.
// (The beta school runs Sun–Thu; the year therefore starts on a Sunday.)
const START = d(2026, 8, 2);
const END = d(2027, 6, 25);

describe("resolveCurrentWeek — in range", () => {
  it("returns week 1 on the first day of the year", () => {
    const r = resolveCurrentWeek(START, START, END);
    expect(r.week).toBe(1);
    expect(r.basis).toBe<CurrentWeekBasis>("in-range");
  });

  it("stays in week 1 for all seven days of the first block", () => {
    for (let i = 0; i < 7; i++) {
      const today = d(2026, 8, 2 + i);
      expect(resolveCurrentWeek(today, START, END).week).toBe(1);
    }
  });

  it("rolls to week 2 on the eighth day, not the seventh", () => {
    expect(resolveCurrentWeek(d(2026, 8, 8), START, END).week).toBe(1);
    expect(resolveCurrentWeek(d(2026, 8, 9), START, END).week).toBe(2);
  });

  it("counts whole 7-day blocks at a mid-year date", () => {
    // 2027-01-17 is 168 days after 2026-08-02 → 24 whole blocks → week 25.
    const r = resolveCurrentWeek(d(2027, 1, 17), START, END);
    expect(r.week).toBe(25);
    expect(r.basis).toBe<CurrentWeekBasis>("in-range");
  });

  it("returns a real derivation on the last day of the year", () => {
    const r = resolveCurrentWeek(END, START, END);
    expect(r.basis).toBe<CurrentWeekBasis>("in-range");
    expect(r.week).toBeLessThanOrEqual(r.totalWeeks);
    // 2026-08-02 → 2027-06-25 is 327 days → 46 whole blocks → week 47.
    expect(r.week).toBe(47);
  });

  it("ignores the time of day — only the calendar date counts", () => {
    const morning = new Date(2027, 0, 17, 0, 1);
    const night = new Date(2027, 0, 17, 23, 59);
    expect(resolveCurrentWeek(morning, START, END).week).toBe(
      resolveCurrentWeek(night, START, END).week,
    );
  });

  it("advances by exactly one week across a DST boundary", () => {
    const before = resolveCurrentWeek(d(2027, 3, 10), START, END).week;
    const after = resolveCurrentWeek(d(2027, 3, 17), START, END).week;
    expect(after).toBe(before + 1);
  });
});

// ── DST: the case that actually discriminates ─────────────────────────────
//
// A naive `(localMsToday - localMsStart) / 86_400_000` day-count is only wrong
// in ONE direction: when today's UTC offset is GREATER than the start's, the
// difference comes out an hour short and `Math.floor` lands a week early.
//
// That is why an August-start year cannot catch the bug — in both hemispheres
// the academic year opens in the high-offset (summer) season, so every later
// date has an offset ≤ the start's and the floor absorbs the slack. Verified:
// the naive implementation passes the whole August-start suite above.
//
// The discriminating shape is a WINTER start with a SUMMER today — a legal
// config here (a Jan–Dec school year is ~49 weeks, inside the 30–60 span
// `normalizeAcademicYearPair` allows).
const WINTER_START = d(2027, 1, 3);
const WINTER_END = d(2027, 12, 10);
const SUMMER_TODAY = d(2027, 6, 6);

// A runner in a DST-free zone (UTC, or Asia/Qatar where the beta school sits)
// cannot exercise this at all. Detect that and SKIP rather than pass silently
// — a green tick from an instrument that cannot fail is worse than no tick.
const runnerObservesDst =
  WINTER_START.getTimezoneOffset() !== SUMMER_TODAY.getTimezoneOffset();

describe("resolveCurrentWeek — DST day-counting", () => {
  it.runIf(runnerObservesDst)(
    "counts calendar days, not 24h blocks, across a spring-forward boundary",
    () => {
      // 2027-01-03 → 2027-06-06 is exactly 154 calendar days → week 23.
      // The naive local-ms version yields 153.958 days → floor 153 → week 22.
      expect(
        resolveCurrentWeek(SUMMER_TODAY, WINTER_START, WINTER_END).week,
      ).toBe(23);
    },
  );

  it.runIf(runnerObservesDst)(
    "never skips or repeats a week number across the spring transition",
    () => {
      // Walk every day through the transition; the week must step 0 or +1,
      // never -1 and never +2.
      let prev = resolveCurrentWeek(
        d(2027, 3, 1),
        WINTER_START,
        WINTER_END,
      ).week;
      for (let i = 1; i <= 60; i++) {
        const w = resolveCurrentWeek(
          new Date(2027, 2, 1 + i),
          WINTER_START,
          WINTER_END,
        ).week;
        expect(w - prev).toBeGreaterThanOrEqual(0);
        expect(w - prev).toBeLessThanOrEqual(1);
        prev = w;
      }
    },
  );

  it("reports whether this runner could exercise DST at all", () => {
    // Not an assertion about the code — a visible record of whether the two
    // tests above ran, so a green suite in a DST-free CI is not mistaken for
    // DST coverage.
    expect(typeof runnerObservesDst).toBe("boolean");
  });
});

describe("resolveCurrentWeek — out of range", () => {
  it("clamps to week 1 before the year starts, and says so", () => {
    // The live case as of 2026-07-31: the year starts in August.
    const r = resolveCurrentWeek(d(2026, 7, 31), START, END);
    expect(r.week).toBe(1);
    expect(r.basis).toBe<CurrentWeekBasis>("before-start");
  });

  it("still reports before-start one day before the year opens", () => {
    const r = resolveCurrentWeek(d(2026, 8, 1), START, END);
    expect(r.week).toBe(1);
    expect(r.basis).toBe<CurrentWeekBasis>("before-start");
  });

  it("clamps to the final week after the year ends, and says so", () => {
    const r = resolveCurrentWeek(d(2027, 8, 15), START, END);
    expect(r.basis).toBe<CurrentWeekBasis>("after-end");
    expect(r.week).toBe(r.totalWeeks);
  });

  it("reports after-end the day after the year closes", () => {
    const r = resolveCurrentWeek(d(2027, 6, 26), START, END);
    expect(r.basis).toBe<CurrentWeekBasis>("after-end");
  });

  it("covers the heuristic-default year, which has ALSO already ended today", () => {
    // `defaultAcademicYearStart/End` for a July 2026 visit yield
    // Aug 2025 → Jun 2026 — so a team that never configured a year is in the
    // after-end branch right now, not the before-start one. Both live.
    const r = resolveCurrentWeek(d(2026, 7, 31), d(2025, 8, 3), d(2026, 6, 26));
    expect(r.basis).toBe<CurrentWeekBasis>("after-end");
    expect(r.week).toBe(r.totalWeeks);
  });
});

describe("resolveCurrentWeek — unusable configuration", () => {
  it("reports unconfigured rather than NaN for an invalid date", () => {
    const r = resolveCurrentWeek(d(2027, 1, 17), new Date("nope"), END);
    expect(r.week).toBe(1);
    expect(r.basis).toBe<CurrentWeekBasis>("unconfigured");
    expect(Number.isNaN(r.week)).toBe(false);
  });

  it("reports unconfigured when today itself is invalid", () => {
    const r = resolveCurrentWeek(new Date("nope"), START, END);
    expect(r.basis).toBe<CurrentWeekBasis>("unconfigured");
  });

  it("survives a reversed (start, end) pair without going negative", () => {
    const r = resolveCurrentWeek(d(2027, 1, 17), END, START);
    expect(r.week).toBeGreaterThanOrEqual(1);
    expect(r.week).toBeLessThanOrEqual(r.totalWeeks);
  });
});

describe("resolveCurrentWeek — agrees with the Year view's columns", () => {
  it("never points past the last column weeksInRange renders", () => {
    const total = weeksInRange(START, END);
    // Walk the whole year a day at a time; the week must stay renderable.
    for (let i = 0; i <= 340; i++) {
      const today = new Date(2026, 7, 2 + i);
      const r = resolveCurrentWeek(today, START, END);
      expect(r.totalWeeks).toBe(total);
      expect(r.week).toBeGreaterThanOrEqual(1);
      expect(r.week).toBeLessThanOrEqual(total);
    }
  });

  it("increases monotonically across the year", () => {
    let prev = 0;
    for (let i = 0; i <= 340; i++) {
      const r = resolveCurrentWeek(new Date(2026, 7, 2 + i), START, END);
      expect(r.week).toBeGreaterThanOrEqual(prev);
      prev = r.week;
    }
  });

  it("is unaffected by a holiday, by design — breaks do not renumber weeks", () => {
    // Holidays grey a week out; they never shift its number (see the module
    // header). This pins that decision so a later 'fix' has to argue with a
    // failing test rather than silently desynchronising /year.
    const beforeBreak = resolveCurrentWeek(d(2026, 12, 20), START, END).week;
    const afterBreak = resolveCurrentWeek(d(2027, 1, 3), START, END).week;
    expect(afterBreak).toBe(beforeBreak + 2);
  });
});
