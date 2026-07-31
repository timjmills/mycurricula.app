// school-week-now — derive "which instructional week is it right now?" from
// the school's configured academic year instead of a mock fixture constant.
//
// WHY THIS EXISTS
// ───────────────
// Every week-scoped surface (Weekly, Daily, the "Week N" chrome heading, the
// Year today-marker) seeded itself from `CURRENT_WEEK` in lib/mock/lessons.ts
// — a frozen fixture constant (`= 12`, commented "weeks 11 and 13 bracket
// it"). The live site therefore greeted every teacher with "Week 12 — THIS
// WEEK" no matter the date. This module replaces the guess with a derivation
// from the team's configured academic year (lib/use-academic-year.ts).
//
// THE NUMBERING CONVENTION — READ BEFORE CHANGING
// ───────────────────────────────────────────────
// A "week" in this app is the Nth **7-calendar-day block** counted from the
// academic year's start date. It is NOT a count of instructional weeks, and
// holidays do NOT renumber it. That convention is already load-bearing in two
// independent places, and this module must agree with both or the number we
// report would point at a different date range than the one the UI draws:
//
//   • `weeksInRange` / `allYearWeeksFor` (lib/year-calendar.ts:391,407) build
//     the Year view's week columns as plain 7-day strides from `start`.
//   • `dateForWeekDay` (lib/mock/calendar.ts:67) maps week→date as
//     `(week - 1) * 7 + dayIndex` days from the Week-1 anchor, and its header
//     states the rule outright: "Calendar weeks always advance by 7 days
//     regardless of which weekdays the school runs — the school week selects
//     WHICH columns appear, not how fast the calendar moves."
//
// Two consequences fall out of that, and both are deliberate:
//
//   • The configured **school week** (which weekdays the school runs) cannot
//     change this answer. It chooses which day-columns render inside a week,
//     never the week's identity. So it is not a parameter here — taking one
//     and ignoring it would be a lie in the signature.
//   • **Holidays** cannot change it either. A holiday week is still a week
//     with a number; it renders greyed out. Skipping holiday weeks would
//     renumber every later week and desynchronise this module from the Year
//     roadmap. So a break needs no special case: the week containing today is
//     simply that week, which is both the honest answer and the consistent
//     one.
//
// If the product ever wants true instructional-week numbering, that is a
// change to the convention itself and must land in `year-calendar.ts` first —
// not here.
//
// OUT-OF-RANGE POLICY
// ───────────────────
// Both out-of-range cases are live in the real product, so neither is
// hypothetical. The resolver never throws and never invents a week; it clamps
// to a defensible endpoint and REPORTS WHICH RULE FIRED via `basis`, so a
// caller can tell the teacher the truth ("the school year hasn't started —
// showing Week 1") rather than dropping them somewhere unexplained.

import { weeksInRange } from "./year-calendar";

/** Which rule produced the week number. Callers surface this; never guess. */
export type CurrentWeekBasis =
  /** Today falls inside the configured year — a real derivation. */
  | "in-range"
  /** Today is before the year begins; clamped to the first week. */
  | "before-start"
  /** Today is after the year ends; clamped to the last week. */
  | "after-end"
  /** The academic year is missing or unusable; fell back to the first week. */
  | "unconfigured";

export interface CurrentWeekResolution {
  /** 1-based week number, always within [1, totalWeeks]. */
  week: number;
  /** Which rule produced `week` — the honesty channel. */
  basis: CurrentWeekBasis;
  /** Week columns in the configured year, per `weeksInRange`. */
  totalWeeks: number;
}

/** ms in a day. Only ever applied to UTC-projected midnights (see below). */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A Date we can actually do arithmetic with. */
function isUsableDate(d: unknown): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

/**
 * Project a local date onto a UTC midnight with the same civil Y/M/D.
 *
 * Day-counting by subtracting two local timestamps and dividing by 86_400_000
 * is wrong across a DST boundary — those days are 23 or 25 hours long, so the
 * quotient drifts and `Math.floor` can land a week early. Projecting both
 * endpoints to UTC first makes every day exactly 24h, so the difference is an
 * exact integer count of calendar days regardless of timezone or DST.
 */
function toUtcMidnight(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Resolve the current 1-based instructional week.
 *
 * Pure: no `Date.now()`, no storage, no DOM — `today` is always injected, so
 * every branch below is reachable from a test without mocking the clock.
 *
 * @param today Wall-clock "now" (only its calendar day is used).
 * @param start First day of the configured academic year.
 * @param end   Last day of the configured academic year.
 */
export function resolveCurrentWeek(
  today: Date,
  start: Date,
  end: Date,
): CurrentWeekResolution {
  // An unusable config is reported as such rather than papered over. Week 1 is
  // the fallback because it is the one week guaranteed to exist.
  if (!isUsableDate(today) || !isUsableDate(start) || !isUsableDate(end)) {
    return { week: 1, basis: "unconfigured", totalWeeks: 1 };
  }

  // Defensive swap, mirroring `weeksInRange`, so a reversed pair yields the
  // same total there and here. `normalizeAcademicYearPair` prevents this
  // upstream; this keeps the two functions from ever disagreeing.
  const lo = Math.min(toUtcMidnight(start), toUtcMidnight(end));
  const hi = Math.max(toUtcMidnight(start), toUtcMidnight(end));
  const now = toUtcMidnight(today);

  const totalWeeks = weeksInRange(start, end);

  // Before the year begins → Week 1.
  //
  // This is the case that is LIVE as of 2026-07-31 for a school whose year
  // starts in August. Week 1 is the only defensible answer: there is no week
  // 0, and the previous year's final week belongs to a plan this year's data
  // does not contain. It is also the useful answer — a teacher opening the app
  // in the run-up to term is preparing week 1, which is exactly where we land
  // them. `basis` lets the UI say so out loud.
  if (now < lo) {
    return { week: 1, basis: "before-start", totalWeeks };
  }

  // After the year ends → the last week.
  //
  // The tempting alternative — "week 1 of next year" — requires a next year
  // that does not exist: the academic year is a single (start, end) pair with
  // no successor, and year rollover is explicitly Phase 2 (CLAUDE.md §7).
  // Rolling to week 1 would show an empty plan AND imply a rollover that never
  // happened. Clamping to the final week shows the teacher where the year
  // actually ended, which is true.
  if (now > hi) {
    return { week: totalWeeks, basis: "after-end", totalWeeks };
  }

  // In range: whole 7-day blocks elapsed since the start, 1-based.
  const elapsedDays = Math.floor((now - lo) / MS_PER_DAY);
  const week = Math.floor(elapsedDays / 7) + 1;

  // `weeksInRange` is inclusive-and-generous (it adds a column for a partial
  // trailing week), so this clamp should never bind. It is a guard against a
  // future change to that function silently letting us point at a column the
  // Year view does not render.
  return {
    week: Math.min(Math.max(week, 1), totalWeeks),
    basis: "in-range",
    totalWeeks,
  };
}
