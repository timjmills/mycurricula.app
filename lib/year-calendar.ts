// year-calendar.ts — pure helpers for projecting lesson week/day indices onto
// an academic-year calendar for the Year view.
//
// These utilities are intentionally free of React and DOM — they accept a
// configured school week (an ordered list of weekday abbreviations) and a
// term-start date, and return the per-day structures the Progression and
// Roadmap views consume.
//
// The school week must NOT be hard-coded — every helper accepts `schoolWeek`
// as a parameter. The mock data uses Sun–Thu (["Su","Mo","Tu","We","Th"]); a
// real school might run Mon–Fri or any custom subset.

import type { Lesson, LessonStatus, SubjectId } from "./types";

// ── Types ──────────────────────────────────────────────────────────────────

/** A single school day in the calendar grid. */
export interface SchoolDay {
  /** 0-based week number within the academic year (0 = first instructional week). */
  week: number;
  /** 0-based day-of-week index within the school week (0 = first school day). */
  day: number;
  /** Day-of-month number (1–31) for column labels. */
  dateNum: number;
  /** Short weekday label derived from the schoolWeek array ("Su", "Mo", …). */
  wkd: string;
  /** Calendar month index (0 = January, 8 = September, …). */
  month: number;
  /** Calendar year. */
  year: number;
  /** First day of its month? Used for the month-boundary border rendering. */
  firstOfMonth: boolean;
}

/** A school-day group for one calendar month. */
export interface MonthGroup {
  /** Display name, all-caps: "SEPTEMBER", "OCTOBER", … */
  name: string;
  /** 0-indexed calendar month (0 = Jan). */
  monthIdx: number;
  days: SchoolDay[];
}

/** Per-day glyph state as consumed by <StatusGlyph>. */
export type GlyphState = "done" | "current" | "skipped" | "upcoming";

/** The result of mapping a lesson's LessonStatus to a glyph state. */
export function lessonStatusToGlyph(status: LessonStatus): GlyphState {
  switch (status) {
    case "done":
      return "done";
    case "skipped":
      return "skipped";
    case "carried":
    case "partial":
      return "current";
    case "not_done":
    default:
      return "upcoming";
  }
}

// ── Calendar helpers ───────────────────────────────────────────────────────

const MONTH_NAMES = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

/**
 * Build the flat list of school days for `weeksInView` academic weeks,
 * starting from the given `termStart` date and school week configuration.
 *
 * @param termStart     - First day of the academic year (should correspond to
 *                        the first school day, i.e. schoolWeek[0] weekday).
 * @param weeksInView   - How many academic weeks to generate (e.g. 13 for Q1).
 * @param schoolWeek    - Ordered weekday abbreviations, e.g. ["Su","Mo","Tu","We","Th"].
 *                        The length of this array = number of school days per week.
 */
export function buildSchoolDays(
  termStart: Date,
  weeksInView: number,
  schoolWeek: readonly string[],
): SchoolDay[] {
  const days: SchoolDay[] = [];
  // Advance one calendar week at a time; for each week, emit one entry per
  // school day in schoolWeek order.
  for (let w = 0; w < weeksInView; w++) {
    for (let d = 0; d < schoolWeek.length; d++) {
      // The first school day of week w, day d. Each week advances by 7
      // calendar days regardless of which days the school runs.
      const offsetDays = w * 7 + d;
      const date = new Date(
        termStart.getFullYear(),
        termStart.getMonth(),
        termStart.getDate() + offsetDays,
      );

      days.push({
        week: w,
        day: d,
        dateNum: date.getDate(),
        wkd: schoolWeek[d],
        month: date.getMonth(),
        year: date.getFullYear(),
        firstOfMonth: date.getDate() === 1,
      });
    }
  }
  return days;
}

/**
 * Group a flat school-day list into months. Days within the same calendar
 * month are merged under one `MonthGroup`, preserving order.
 */
export function groupByMonth(days: SchoolDay[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  let current: MonthGroup | null = null;

  for (const day of days) {
    if (!current || current.monthIdx !== day.month) {
      current = {
        name: MONTH_NAMES[day.month],
        monthIdx: day.month,
        days: [],
      };
      groups.push(current);
    }
    current.days.push(day);
  }

  return groups;
}

// ── Day-of-year index helpers ──────────────────────────────────────────────

/**
 * Convert a lesson's `week` (1-based, matching mock fixture convention)
 * and `day` (0-based day-of-school-week) into the flat 0-based index used
 * by `buildSchoolDays` for positioning.
 *
 * The `week` field in LESSONS is 1-based (week 11, 12, 13); the flat array
 * uses 0-based week indices. Subtract 1 from the mock week before computing
 * the flat index.
 *
 * @param lessonWeek  - 1-based week number from Lesson.week.
 * @param lessonDay   - 0-based day index from Lesson.day.
 * @param schoolWeekLen - Number of school days per week.
 */
export function lessonToFlatIndex(
  lessonWeek: number,
  lessonDay: number,
  schoolWeekLen: number,
): number {
  return (lessonWeek - 1) * schoolWeekLen + lessonDay;
}

// ── Completion helpers ─────────────────────────────────────────────────────

/**
 * Compute the % complete for a given subject from the lessons array.
 * Returns a 0–100 integer.
 */
export function subjectCompletePct(
  lessons: Lesson[],
  subject: SubjectId,
): number {
  const subjectLessons = lessons.filter((l) => l.subject === subject);
  if (subjectLessons.length === 0) return 0;
  const done = subjectLessons.filter((l) => l.status === "done").length;
  return Math.round((done / subjectLessons.length) * 100);
}

/**
 * Build a map from flat day-index → GlyphState for a given subject, using
 * the lessons from the planner store. Days with no lesson assigned render
 * as "upcoming".
 */
export function buildDayGlyphMap(
  lessons: Lesson[],
  subject: SubjectId,
  schoolWeekLen: number,
): Map<number, GlyphState> {
  const map = new Map<number, GlyphState>();
  for (const lesson of lessons) {
    if (lesson.subject !== subject) continue;
    const idx = lessonToFlatIndex(lesson.week, lesson.day, schoolWeekLen);
    map.set(idx, lessonStatusToGlyph(lesson.status));
  }
  return map;
}

// ── Academic year defaults (prototype) ────────────────────────────────────

/** Default school week for the beta school (Sunday–Thursday). */
export const DEFAULT_SCHOOL_WEEK: readonly string[] = [
  "Su",
  "Mo",
  "Tu",
  "We",
  "Th",
] as const;

/**
 * Default term-start date: aligns with the mock fixture anchor in
 * lib/mock/calendar.ts (Week 1 = 2025-11-02).
 * The Year view shows Q1 which starts Week 1 of the academic year.
 */
export const DEFAULT_TERM_START = new Date(2025, 10, 2); // 2025-11-02

/** Default weeks in view for the Year view (one academic quarter, ~13 weeks). */
export const DEFAULT_WEEKS_IN_VIEW = 13;
