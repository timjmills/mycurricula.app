import { describe, it, expect } from "vitest";

import {
  dateForWeekDay,
  dateNumberForWeekDay,
  datesForWeek,
  lastDateOfWeek,
  weekDayForDate,
  weekStartsOnFirstSchoolDay,
} from "@/lib/week-dates";
import { resolveCurrentWeek } from "@/lib/school-week-now";
import { todayColumnIndex } from "@/lib/now-anchor";
import { WEEKDAY_INDEX, type Weekday } from "@/lib/use-school-week";

// Tests for the week+day → calendar date resolver that replaced the fictional
// anchor in lib/mock/calendar.ts (`WEEK_1_DAY_0 = 2025-11-02`, chosen to make a
// design screenshot's date line up).
//
// Two things are under test, and the second is the one the mock got wrong:
//   1. Dates derive from the CONFIGURED academic year, not a hard-coded anchor.
//   2. `dayIndex` selects the Nth CONFIGURED SCHOOL DAY, not the Nth calendar
//      day after the week's start. The mock added `dayIndex` as a raw day
//      offset, which is only correct when the school week is a contiguous run
//      starting on the anchor's weekday — true for Sun–Thu, false for
//      Mon/Wed/Fri, and false for Mon–Fri whenever the year starts on a Sunday.

/** Local-midnight Date from civil parts. `m` is 1-based for readability. */
function d(y: number, m: number, day: number): Date {
  return new Date(y, m - 1, day);
}

/** "YYYY-MM-DD" in LOCAL time — the same formatting the holiday matcher uses,
 *  so an assertion here fails for exactly the reason a lookup there would. */
function iso(date: Date | null): string | null {
  if (date === null) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Exact count of civil days between two local dates, DST-proof. */
function civilDaysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

const SUN_THU: Weekday[] = ["sun", "mon", "tue", "wed", "thu"];
const MON_FRI: Weekday[] = ["mon", "tue", "wed", "thu", "fri"];
/** A genuinely non-contiguous week — the case the mock resolver cannot express. */
const MON_WED_FRI: Weekday[] = ["mon", "wed", "fri"];

// The beta school: Sun–Thu, year starting Sunday 2 Aug 2026 (the same pair
// tests/school-week-now.test.ts uses, so the two suites describe one calendar).
const BETA_START = d(2026, 8, 2);
const BETA_END = d(2027, 6, 25);

// ── The configured academic year drives the dates ──────────────────────────

describe("dateForWeekDay — anchored to the configured academic year", () => {
  it("puts week 1 day 0 on the year's first day", () => {
    expect(iso(dateForWeekDay(1, 0, BETA_START, SUN_THU))).toBe("2026-08-02");
  });

  it("moves with the configured year rather than a fixed anchor", () => {
    // Same week + day, a different school year → a different date. Under the
    // mock anchor both of these returned 2025-11-02.
    const other = d(2025, 9, 7); // a Sunday
    expect(iso(dateForWeekDay(1, 0, other, SUN_THU))).toBe("2025-09-07");
    expect(iso(dateForWeekDay(1, 0, BETA_START, SUN_THU))).toBe("2026-08-02");
  });

  it("advances 7 calendar days per week", () => {
    // Week 12 = 11 whole weeks after the start: 2026-08-02 + 77 days.
    expect(iso(dateForWeekDay(12, 0, BETA_START, SUN_THU))).toBe("2026-10-18");
  });

  it("walks the configured Sun–Thu week day by day", () => {
    expect(datesForWeek(1, BETA_START, SUN_THU).map(iso)).toEqual([
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
    ]);
  });
});

// ── dayIndex is a POSITION in the configured week ──────────────────────────
//
// This block is the reason the module exists. Every assertion here is one the
// mock resolver fails.

describe("dateForWeekDay — dayIndex indexes the configured school week", () => {
  it("skips the days a Mon/Wed/Fri school does not teach", () => {
    const start = d(2026, 8, 3); // a Monday
    expect(datesForWeek(1, start, MON_WED_FRI).map(iso)).toEqual([
      "2026-08-03", // Mon
      "2026-08-05", // Wed — NOT Tuesday the 4th
      "2026-08-07", // Fri — NOT Wednesday the 5th
    ]);
  });

  it("lands every configured day on its own weekday", () => {
    const start = d(2026, 8, 3); // Monday
    const dates = datesForWeek(1, start, MON_WED_FRI);
    expect(dates.map((x) => x!.getDay())).toEqual([1, 3, 5]); // Mon, Wed, Fri
  });

  it("offsets a Mon–Fri school from a Sunday year start", () => {
    // The year starts Sunday, but the school's first teaching day is Monday.
    expect(datesForWeek(1, BETA_START, MON_FRI).map(iso)).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
    ]);
  });

  it("gives a 6-day Mon–Sat school six distinct dates", () => {
    const monSat: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat"];
    const dates = datesForWeek(3, d(2026, 8, 3), monSat).map(iso);
    expect(new Set(dates).size).toBe(6);
    expect(dates).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
    ]);
  });
});

// ── Agreement with the week-number resolver ────────────────────────────────
//
// The whole point of the 7-day-block convention is that these two modules
// describe the same calendar. If this block ever fails, a date shown for "Week
// N" belongs to a week the chrome and the Year view call something else.

describe("dateForWeekDay — agrees with resolveCurrentWeek", () => {
  it("round-trips every day of every week back to the same week number", () => {
    for (const week of [1, 2, 5, 13, 26, 40]) {
      for (const schoolWeek of [SUN_THU, MON_FRI, MON_WED_FRI]) {
        for (let i = 0; i < schoolWeek.length; i++) {
          const date = dateForWeekDay(week, i, BETA_START, schoolWeek)!;
          const back = resolveCurrentWeek(date, BETA_START, BETA_END);
          expect(
            `${week}/${i}/${schoolWeek.join("")} → ${back.week}`,
          ).toBe(`${week}/${i}/${schoolWeek.join("")} → ${week}`);
        }
      }
    }
  });

  it("keeps every resolved date inside its own 7-day block", () => {
    for (const schoolWeek of [SUN_THU, MON_FRI, MON_WED_FRI]) {
      for (let week = 1; week <= 30; week++) {
        for (let i = 0; i < schoolWeek.length; i++) {
          const offset = civilDaysBetween(
            BETA_START,
            dateForWeekDay(week, i, BETA_START, schoolWeek)!,
          );
          expect(offset).toBeGreaterThanOrEqual((week - 1) * 7);
          expect(offset).toBeLessThan(week * 7);
        }
      }
    }
  });
});

// ── DST ────────────────────────────────────────────────────────────────────

describe("dateForWeekDay — DST safety", () => {
  it("returns local midnight, never a shifted instant", () => {
    for (let week = 1; week <= 52; week++) {
      const date = dateForWeekDay(week, 0, BETA_START, SUN_THU)!;
      expect(date.getHours()).toBe(0);
      expect(date.getMinutes()).toBe(0);
    }
  });

  it("holds a 7-civil-day stride across every DST transition in the year", () => {
    // Timezone-agnostic on purpose: whatever the runner's zone, consecutive
    // weeks must be exactly 7 civil days apart. Subtracting local timestamps
    // (the naive implementation) drifts on the 23h/25h day.
    for (let week = 1; week < 60; week++) {
      const a = dateForWeekDay(week, 0, BETA_START, SUN_THU)!;
      const b = dateForWeekDay(week + 1, 0, BETA_START, SUN_THU)!;
      expect(civilDaysBetween(a, b)).toBe(7);
    }
  });

  it("keeps the day-within-week stride exact across a year start in autumn", () => {
    // A year that starts in early November puts week 1 straight onto the
    // northern-hemisphere fall-back weekend.
    const start = d(2026, 11, 1); // Sunday 1 Nov 2026
    expect(datesForWeek(1, start, SUN_THU).map(iso)).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
    ]);
  });
});

// ── lastDateOfWeek — the documented off-by-3 ───────────────────────────────

describe("lastDateOfWeek", () => {
  it("ends a Sun–Thu week on Thursday, not the following Sunday", () => {
    // The bug this guards (components/year/RoadmapView.tsx:96-114): a span that
    // runs "through week N" ends `schoolWeekLen - 1` days into that week, NOT a
    // whole week later. For Sun–Thu that is +4, and +7 overshoots by 3.
    const first = dateForWeekDay(1, 0, BETA_START, SUN_THU)!;
    const last = lastDateOfWeek(1, BETA_START, SUN_THU)!;
    expect(civilDaysBetween(first, last)).toBe(4);
    expect(iso(last)).toBe("2026-08-06");
  });

  it("ends a 3-day week on its third configured day", () => {
    const start = d(2026, 8, 3);
    expect(iso(lastDateOfWeek(1, start, MON_WED_FRI))).toBe("2026-08-07");
    expect(civilDaysBetween(dateForWeekDay(1, 0, start, MON_WED_FRI)!, lastDateOfWeek(1, start, MON_WED_FRI)!)).toBe(4);
  });

  it("returns null for an empty school week", () => {
    expect(lastDateOfWeek(1, BETA_START, [])).toBeNull();
  });
});

// ── Refusals — no fabricated dates ─────────────────────────────────────────

describe("dateForWeekDay — refuses rather than inventing", () => {
  it("returns null for a day the school does not teach", () => {
    // Sun–Thu has five columns; there is no sixth day to date.
    expect(dateForWeekDay(1, 5, BETA_START, SUN_THU)).toBeNull();
    expect(dateForWeekDay(1, 3, BETA_START, MON_WED_FRI)).toBeNull();
  });

  it("returns null for an empty school week", () => {
    expect(dateForWeekDay(1, 0, BETA_START, [])).toBeNull();
    expect(datesForWeek(1, BETA_START, [])).toEqual([]);
  });

  it("returns null for a week number that is not a real week", () => {
    expect(dateForWeekDay(0, 0, BETA_START, SUN_THU)).toBeNull();
    expect(dateForWeekDay(-3, 0, BETA_START, SUN_THU)).toBeNull();
    expect(dateForWeekDay(1.5, 0, BETA_START, SUN_THU)).toBeNull();
  });

  it("returns null for an unusable year start", () => {
    expect(dateForWeekDay(1, 0, new Date(NaN), SUN_THU)).toBeNull();
    expect(
      dateForWeekDay(1, 0, undefined as unknown as Date, SUN_THU),
    ).toBeNull();
  });

  it("returns null for an unrecognised weekday token", () => {
    const bogus = ["mon", "funday"] as unknown as Weekday[];
    expect(dateForWeekDay(1, 1, d(2026, 8, 3), bogus)).toBeNull();
  });

  it("propagates null through dateNumberForWeekDay", () => {
    expect(dateNumberForWeekDay(1, 9, BETA_START, SUN_THU)).toBeNull();
    expect(dateNumberForWeekDay(1, 0, BETA_START, SUN_THU)).toBe(2);
  });
});

// ── The two day-number spaces are NOT interchangeable ──────────────────────
//
// The /schedule route and the schedule drawer both built their day chips from
// `WEEKDAY_INDEX[token]` — an ABSOLUTE Sun=0..Sat=6 weekday number — and passed
// those as `day` to `setSelectedDay` and <ScheduleDayPane>, which read `day` as
// a POSITION in the configured week. The two spaces coincide exactly when the
// school week starts on Sunday and is contiguous, which is why the defect was
// invisible on the Sun–Thu beta school. This block is the regression guard.

describe("absolute weekday number vs. configured-week position", () => {
  it("coincide for the Sun–Thu beta week — why the bug hid", () => {
    expect(SUN_THU.map((t) => WEEKDAY_INDEX[t])).toEqual([0, 1, 2, 3, 4]);
    expect(SUN_THU.map((_, i) => i)).toEqual([0, 1, 2, 3, 4]);
  });

  it("diverge for a Mon–Fri week — every column off by one", () => {
    expect(MON_FRI.map((t) => WEEKDAY_INDEX[t])).toEqual([1, 2, 3, 4, 5]);
    expect(MON_FRI.map((_, i) => i)).toEqual([0, 1, 2, 3, 4]);
  });

  it("makes the absolute number resolve the wrong day, or no day at all", () => {
    const start = d(2026, 8, 3); // Monday
    // Monday is position 0. Feeding its ABSOLUTE index (1) asks for Tuesday.
    expect(iso(dateForWeekDay(1, 0, start, MON_FRI))).toBe("2026-08-03");
    expect(iso(dateForWeekDay(1, WEEKDAY_INDEX.mon, start, MON_FRI))).toBe(
      "2026-08-04",
    );
    // Friday is position 4; its absolute index is 5, which is off the end of a
    // 5-column week — the blank Friday a Mon–Fri school saw.
    expect(iso(dateForWeekDay(1, 4, start, MON_FRI))).toBe("2026-08-07");
    expect(dateForWeekDay(1, WEEKDAY_INDEX.fri, start, MON_FRI)).toBeNull();
  });

  it("drops two days off a Mon–Sat week", () => {
    const monSat: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat"];
    const absolute = monSat.map((t) => WEEKDAY_INDEX[t]); // [1..6]
    const start = d(2026, 8, 3);
    // Two of the six absolute numbers name no column in a 6-column week.
    const unresolvable = absolute.filter(
      (n) => dateForWeekDay(1, n, start, monSat) === null,
    );
    expect(unresolvable).toEqual([6]);
    // And every resolvable one points at the wrong day.
    for (let i = 0; i < monSat.length; i++) {
      const byPosition = dateForWeekDay(1, i, start, monSat);
      const byAbsolute = dateForWeekDay(1, absolute[i], start, monSat);
      expect(iso(byPosition)).not.toBe(iso(byAbsolute));
    }
  });

  it("todayColumnIndex speaks the POSITION space, matching this resolver", () => {
    // Monday 3 Aug 2026 — position 0 in Mon–Fri, position 1 in Sun–Thu.
    const monday = d(2026, 8, 3);
    expect(todayColumnIndex(monday, MON_FRI)).toBe(0);
    expect(todayColumnIndex(monday, SUN_THU)).toBe(1);
    // The resolver agrees with it in both configurations.
    expect(iso(dateForWeekDay(1, 0, d(2026, 8, 3), MON_FRI))).toBe("2026-08-03");
    expect(iso(dateForWeekDay(1, 1, BETA_START, SUN_THU))).toBe("2026-08-03");
  });
});

// ── weekDayForDate — the inverse ───────────────────────────────────────────

describe("weekDayForDate", () => {
  it("round-trips every configured day of every week", () => {
    for (const schoolWeek of [SUN_THU, MON_FRI, MON_WED_FRI]) {
      for (const week of [1, 2, 9, 30, 47]) {
        for (let i = 0; i < schoolWeek.length; i++) {
          const date = dateForWeekDay(week, i, BETA_START, schoolWeek)!;
          expect(weekDayForDate(date, BETA_START, schoolWeek)).toEqual({
            week,
            dayIndex: i,
          });
        }
      }
    }
  });

  it("refuses a day the school does not teach", () => {
    // Saturday 8 Aug 2026 — no column in a Sun–Thu week. The old
    // `diffDays % 7` derivation mapped it onto a real column and navigated
    // the teacher to a day they never asked for.
    expect(weekDayForDate(d(2026, 8, 8), BETA_START, SUN_THU)).toBeNull();
    // Tuesday, in a Mon/Wed/Fri week.
    expect(weekDayForDate(d(2026, 8, 4), d(2026, 8, 3), MON_WED_FRI)).toBeNull();
  });

  it("refuses a date before the academic year begins", () => {
    expect(weekDayForDate(d(2026, 7, 26), BETA_START, SUN_THU)).toBeNull();
  });

  it("refuses unusable input", () => {
    expect(weekDayForDate(new Date(NaN), BETA_START, SUN_THU)).toBeNull();
    expect(weekDayForDate(BETA_START, new Date(NaN), SUN_THU)).toBeNull();
    expect(weekDayForDate(BETA_START, BETA_START, [])).toBeNull();
  });

  it("agrees with resolveCurrentWeek on the week number", () => {
    for (let offset = 0; offset < 200; offset++) {
      const date = d(2026, 8, 2 + offset);
      const pos = weekDayForDate(date, BETA_START, SUN_THU);
      if (pos === null) continue; // Fri/Sat — no column, nothing to compare
      expect(pos.week).toBe(resolveCurrentWeek(date, BETA_START, BETA_END).week);
    }
  });
});

// ── The documented misalignment artifact ───────────────────────────────────

describe("weekStartsOnFirstSchoolDay", () => {
  it("is true when the year starts on the first configured school day", () => {
    expect(weekStartsOnFirstSchoolDay(BETA_START, SUN_THU)).toBe(true);
    expect(weekStartsOnFirstSchoolDay(d(2026, 8, 3), MON_FRI)).toBe(true);
  });

  it("is false when it does not, and the columns are then non-ascending", () => {
    // A Mon–Fri school whose year is configured to start on a Wednesday. Every
    // date is still inside block 1 (the invariant that matters), but they do
    // not ascend left-to-right — the artifact the module header documents.
    const wed = d(2026, 8, 5);
    expect(weekStartsOnFirstSchoolDay(wed, MON_FRI)).toBe(false);
    expect(datesForWeek(1, wed, MON_FRI).map(iso)).toEqual([
      "2026-08-10", // Mon (+5)
      "2026-08-11", // Tue (+6)
      "2026-08-05", // Wed (+0)
      "2026-08-06", // Thu (+1)
      "2026-08-07", // Fri (+2)
    ]);
  });

  it("is false for an unusable configuration", () => {
    expect(weekStartsOnFirstSchoolDay(new Date(NaN), SUN_THU)).toBe(false);
    expect(weekStartsOnFirstSchoolDay(BETA_START, [])).toBe(false);
  });
});
