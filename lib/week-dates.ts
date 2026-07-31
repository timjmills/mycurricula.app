// week-dates — the REAL week+day → calendar date bridge.
//
// WHY THIS EXISTS
// ───────────────
// `dateForWeekDay` used to live in `lib/mock/calendar.ts`, anchored to a
// FICTIONAL Sunday (`WEEK_1_DAY_0 = 2025-11-02`) chosen so the mock's frozen
// `CURRENT_WEEK = 12` would land on the date in a design screenshot. It also
// added `dayIndex` to that anchor as a raw day offset, which is only correct
// when the configured school week is a CONTIGUOUS run starting on the anchor's
// weekday. Two consequences, both live:
//
//   • Every date the Daily week strip, the Schedule day chips, the holiday
//     matcher and the /home "today" line rendered was derived from a made-up
//     anchor — it ignored the school's configured academic year entirely.
//   • A school running Mon/Wed/Fri got Mon/Tue/Wed: day index 1 is the SECOND
//     CONFIGURED DAY (Wednesday), not "one day after the first".
//
// This module replaces both defects with a pure resolver over the two real
// configurations that already exist: the academic year (lib/use-academic-year)
// and the school week (lib/use-school-week).
//
// THE TWO INDEXING CONVENTIONS — READ BEFORE CHANGING
// ───────────────────────────────────────────────────
// 1. WEEK. Week N is the Nth **7-calendar-day block** counted from the academic
//    year's start date. Not a count of instructional weeks; holidays do not
//    renumber it. This is not a choice made here — it is already load-bearing in
//    `weeksInRange` / `allYearWeeksFor` (lib/year-calendar.ts) and in
//    `resolveCurrentWeek` (lib/school-week-now.ts), and this module MUST agree
//    with them or a date resolved for week N would fall in a different week than
//    the one the Year view draws and the chrome reports.
//
//    The invariant that keeps them in lockstep, and which `tests/week-dates.test.ts`
//    asserts directly: every date this module returns for week N lies inside
//    `[yearStart + (N-1)*7, yearStart + N*7)` — the exact block
//    `resolveCurrentWeek` would map back to N.
//
// 2. DAY. `dayIndex` is a 0-based **position in the configured school week** —
//    0 is the first configured school day, not an absolute Sun=0..Sat=6
//    weekday. This is the same contract as a lesson's `day` field
//    (lib/week-order.ts), `todayColumnIndex` (lib/now-anchor.ts), and the
//    planner's day bucketing. Absolute weekday numbers are a DIFFERENT space and
//    must never be passed here; `WEEKDAY_INDEX[token]` is that other space.
//
// A KNOWN ARTIFACT, STATED RATHER THAN HIDDEN
// ───────────────────────────────────────────
// Because a week block starts on whatever weekday `yearStart` falls on, and the
// school week is ordered Sun-first (lib/use-school-week's WEEKDAY_ORDER), the
// dates within one week block are only in ascending order when `yearStart`'s
// weekday is the first configured school day. A Mon–Fri school whose academic
// year is configured to start on a Wednesday gets week 1 columns dated
// Mon(+5) Tue(+6) Wed(+0) Thu(+1) Fri(+2) — every date genuinely inside block 1,
// but not left-to-right ascending.
//
// That is the honest consequence of convention (1), which this module does not
// own. Making the columns ascending means re-anchoring week blocks to the school
// week rather than to `yearStart`, which renumbers every week and must therefore
// land in `year-calendar.ts` FIRST (`school-week-now.ts` says the same about its
// own numbering). `weekStartsOnFirstSchoolDay()` below lets a caller detect the
// misalignment and warn in Settings instead of silently rendering it.
//
// DST
// ───
// Day arithmetic is done on UTC-projected midnights and only then converted back
// to a LOCAL midnight Date. Subtracting local timestamps across a DST boundary
// counts 23- or 25-hour days and drifts by a day; the same projection trick is
// used by `resolveCurrentWeek` (lib/school-week-now.ts:93) and is the reason
// this module does not simply call `weeksInRange`-style millisecond division.
//
// NULLABILITY
// ───────────
// Every resolver returns `null` rather than a fabricated date when the inputs
// cannot name a real day (unusable `yearStart`, empty school week, `week < 1`,
// `dayIndex` outside the configured week). A caller that cannot show a date must
// show that it cannot — an empty slot is recoverable, a confidently wrong date
// is not.

import { WEEKDAY_INDEX, WEEKDAY_ORDER, type Weekday } from "@/lib/use-school-week";

/** Days in a calendar week. Named so the 7s below are not bare magic numbers. */
const DAYS_PER_WEEK = 7;

/** ms in a day. Only ever applied to UTC-projected midnights (see header). */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A Date we can actually do arithmetic with. */
function isUsableDate(d: unknown): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

/**
 * Project a local date onto the UTC midnight with the same civil Y/M/D.
 * See the DST note in the header for why every offset goes through this.
 */
function toUtcMidnight(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Turn a UTC-midnight timestamp back into a LOCAL-midnight Date carrying the
 * same civil Y/M/D. Consumers read these with `getDate()` / `getMonth()` and
 * format them locally (see `dateToLocalIso` in lib/use-day-holiday.ts), so the
 * value handed back has to be a local date, not a UTC instant.
 */
function fromUtcMidnight(ms: number): Date {
  const utc = new Date(ms);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

/** Canonical Weekday token for a Date (getDay() is Sun=0..Sat=6, matching
 *  WEEKDAY_ORDER's Sun-first layout). Local, deliberately: the school week is a
 *  civil-calendar concept. */
function weekdayTokenOf(d: Date): Weekday {
  return WEEKDAY_ORDER[d.getDay()];
}

/**
 * Offset in days from the start of a week block to the block's occurrence of
 * `token`. Always in [0, 6], so the resolved date is always inside the block —
 * the invariant that keeps this module in step with `resolveCurrentWeek`.
 */
function offsetWithinBlock(blockStart: Weekday, token: Weekday): number {
  return (
    (WEEKDAY_INDEX[token] - WEEKDAY_INDEX[blockStart] + DAYS_PER_WEEK) %
    DAYS_PER_WEEK
  );
}

/**
 * The calendar date of `dayIndex` in `week`, or null when the inputs cannot
 * name a real day.
 *
 * Pure: no clock, no storage, no DOM. `yearStart` and `schoolWeek` are always
 * injected — see `lib/use-week-dates.ts` for the hook that binds them from the
 * team's configuration.
 *
 * @param week       1-based week number (the Nth 7-day block from `yearStart`).
 * @param dayIndex   0-based POSITION in `schoolWeek` (see header convention 2).
 * @param yearStart  First day of the configured academic year.
 * @param schoolWeek The configured school week, ordered — exactly what
 *                   `useSchoolWeek().days` returns.
 */
export function dateForWeekDay(
  week: number,
  dayIndex: number,
  yearStart: Date,
  schoolWeek: readonly Weekday[],
): Date | null {
  if (!isUsableDate(yearStart)) return null;
  if (!Number.isInteger(week) || week < 1) return null;
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return null;
  if (dayIndex >= schoolWeek.length) return null;

  const token = schoolWeek[dayIndex];
  // A caller can hand us a hand-built array; an unrecognised token has no
  // position, and guessing one would put the date in the wrong week block.
  if (!(token in WEEKDAY_INDEX)) return null;

  const blockStartMs = toUtcMidnight(yearStart) + (week - 1) * DAYS_PER_WEEK * MS_PER_DAY;
  const offset = offsetWithinBlock(weekdayTokenOf(yearStart), token);
  return fromUtcMidnight(blockStartMs + offset * MS_PER_DAY);
}

/**
 * Day-of-month number ("18") for a week + day index, or null. Thin wrapper —
 * kept as its own export because the day chips and week strips almost
 * exclusively want the number, and it is what the mock module exported.
 */
export function dateNumberForWeekDay(
  week: number,
  dayIndex: number,
  yearStart: Date,
  schoolWeek: readonly Weekday[],
): number | null {
  return dateForWeekDay(week, dayIndex, yearStart, schoolWeek)?.getDate() ?? null;
}

/**
 * Every configured school day of `week`, in column order. Entries are null only
 * for inputs that cannot resolve at all (bad year start / bad week), so the
 * array length always equals `schoolWeek.length` and can be zipped straight
 * against `useOrderedWeekdays()`.
 */
export function datesForWeek(
  week: number,
  yearStart: Date,
  schoolWeek: readonly Weekday[],
): (Date | null)[] {
  return schoolWeek.map((_, i) =>
    dateForWeekDay(week, i, yearStart, schoolWeek),
  );
}

/**
 * The LAST configured school day of `week` — the end date of anything that runs
 * "through week N" (a unit's span, a term band).
 *
 * This exists because getting it wrong is a documented bug in this repo: a
 * unit's end date is the last school day of its final week, which is
 * `schoolWeekLen - 1` days into that week, NOT one whole week later. See the
 * off-by-3 note at components/year/RoadmapView.tsx:96-114. Calling this instead
 * of doing the arithmetic at the callsite is how that stays fixed.
 */
export function lastDateOfWeek(
  week: number,
  yearStart: Date,
  schoolWeek: readonly Weekday[],
): Date | null {
  if (schoolWeek.length === 0) return null;
  return dateForWeekDay(week, schoolWeek.length - 1, yearStart, schoolWeek);
}

/** A calendar date located in the school's week/day grid. */
export interface WeekDayPosition {
  /** 1-based week number — the Nth 7-day block from the academic year start. */
  week: number;
  /** 0-based position in the configured school week. */
  dayIndex: number;
}

/**
 * The exact inverse of {@link dateForWeekDay}: locate a calendar date in the
 * school's week/day grid, or null when it has no place there.
 *
 * Null means one of two honest things, and a caller should treat both as "this
 * link points at nothing": the date is before the academic year begins, or it
 * falls on a weekday the school does not teach (a Saturday for a Sun–Thu
 * school). Deep links used to derive the day as `diffDays % 7`, which silently
 * mapped a non-school day onto a real school column and navigated the teacher
 * to a day they never asked for.
 *
 * There is no upper bound here: a caller that wants "within the configured
 * year" should compare against `weeksInRange` (lib/year-calendar.ts) itself,
 * since different surfaces bound it differently (the /daily deep link allows
 * weeks 1–99).
 */
export function weekDayForDate(
  date: Date,
  yearStart: Date,
  schoolWeek: readonly Weekday[],
): WeekDayPosition | null {
  if (!isUsableDate(date) || !isUsableDate(yearStart)) return null;
  if (schoolWeek.length === 0) return null;

  const dayIndex = schoolWeek.indexOf(weekdayTokenOf(date));
  if (dayIndex === -1) return null; // not a day this school teaches

  // Whole 7-day blocks elapsed since the year start — the same derivation
  // `resolveCurrentWeek` uses, on UTC-projected midnights so DST cannot shift
  // a date into the neighbouring week.
  const elapsedDays = Math.round(
    (toUtcMidnight(date) - toUtcMidnight(yearStart)) / MS_PER_DAY,
  );
  if (elapsedDays < 0) return null; // before the year begins

  return { week: Math.floor(elapsedDays / DAYS_PER_WEEK) + 1, dayIndex };
}

/**
 * Whether week blocks begin on the first configured school day.
 *
 * False means the academic year starts on a weekday the school does not teach
 * first, so the dates within a week block are not left-to-right ascending — the
 * artifact described in the header. Exposed so Settings can tell a teacher their
 * year start and school week disagree, rather than the planner quietly drawing
 * out-of-order dates.
 */
export function weekStartsOnFirstSchoolDay(
  yearStart: Date,
  schoolWeek: readonly Weekday[],
): boolean {
  if (!isUsableDate(yearStart)) return false;
  if (schoolWeek.length === 0) return false;
  return weekdayTokenOf(yearStart) === schoolWeek[0];
}
