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
  // Audit F3 fix (Lane BJ, 2026-05-26): when termStart's JS weekday
  // doesn't match schoolWeek[0], the per-day labels and the per-day
  // Date calculations would silently desynchronize — days[0].wkd would
  // say "Mo" while the calendar Date was actually a Sunday. The
  // previous behaviour (Y-cal lane) was to log a dev-only warning and
  // emit the drifted dates anyway, which is not a fix. We now
  // auto-advance termStart forward to the next calendar date whose
  // weekday matches schoolWeek[0], so the labels and dates stay in
  // lockstep. The advance is at most 6 days, so a teacher who picks
  // "first day of the school year = some weekday" still gets the
  // intuitive behaviour ("week 1 begins on the first matching school
  // day").
  const WEEKDAY_TO_JS: Record<string, number> = {
    Su: 0,
    Mo: 1,
    Tu: 2,
    We: 3,
    Th: 4,
    Fr: 5,
    Sa: 6,
  };
  let effectiveStart = termStart;
  if (schoolWeek.length > 0) {
    const required = WEEKDAY_TO_JS[schoolWeek[0]];
    if (typeof required === "number") {
      const current = termStart.getDay();
      const advance = (required - current + 7) % 7;
      if (advance > 0) {
        effectiveStart = new Date(
          termStart.getFullYear(),
          termStart.getMonth(),
          termStart.getDate() + advance,
        );
      }
    }
  }

  const days: SchoolDay[] = [];
  // Advance one calendar week at a time; for each week, emit one entry per
  // school day in schoolWeek order.
  for (let w = 0; w < weeksInView; w++) {
    for (let d = 0; d < schoolWeek.length; d++) {
      // The first school day of week w, day d. Each week advances by 7
      // calendar days regardless of which days the school runs.
      const offsetDays = w * 7 + d;
      const date = new Date(
        effectiveStart.getFullYear(),
        effectiveStart.getMonth(),
        effectiveStart.getDate() + offsetDays,
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

// ── Quarter helpers ────────────────────────────────────────────────────────
//
// The academic year is divided into 4 quarters of 9 weeks each (36 weeks
// total — matching the common US/international school-year convention). Any
// excess weeks in the mock fixture beyond 36 are treated as Q4.
//
// Week indices here are 0-based, matching the week field produced by
// buildSchoolDays and the 0-based convention in the Roadmap grid.
// IMPORTANT: Lesson.week in the mock fixtures is 1-based; subtract 1
// before passing to these helpers.

/** Number of academic weeks per quarter. */
const WEEKS_PER_QUARTER = 9;

/**
 * Return the quarter number (1–4) for a given 0-based week index.
 * Week 0 → Q1; week 8 → Q1; week 9 → Q2; week 35 → Q4; week ≥36 → Q4.
 */
export function quarterForWeek(weekIdx: number): number {
  return Math.min(4, Math.floor(weekIdx / WEEKS_PER_QUARTER) + 1);
}

/**
 * Return the month bands visible inside a given quarter.
 *
 * Each band carries:
 *   label  — display name of the month (e.g. "November")
 *   weeks  — how many week columns of the quarter fall within that month
 *
 * Anchored to `DEFAULT_TERM_START`; the school week must not be hard-coded —
 * uses the first day of each academic week (7-day strides) to determine
 * which calendar month each week falls in.
 *
 * @param quarter  - 1..4
 * @param year     - calendar year of the term start (default: term-start year)
 */
export function monthsForQuarter(
  quarter: number,
  year: number = DEFAULT_TERM_START.getFullYear(),
): { label: string; weeks: number }[] {
  const termStart = new Date(
    year,
    DEFAULT_TERM_START.getMonth(),
    DEFAULT_TERM_START.getDate(),
  );
  const firstWeek = (quarter - 1) * WEEKS_PER_QUARTER; // 0-based week index
  const lastWeek = firstWeek + WEEKS_PER_QUARTER - 1;

  // Build a month→week-count map, preserving insertion order.
  const map = new Map<string, number>();
  for (let w = firstWeek; w <= lastWeek; w++) {
    // The first calendar day of week w.
    const d = new Date(
      termStart.getFullYear(),
      termStart.getMonth(),
      termStart.getDate() + w * 7,
    );
    const label = d.toLocaleString("en-US", { month: "long" });
    map.set(label, (map.get(label) ?? 0) + 1);
  }

  return Array.from(map.entries()).map(([label, weeks]) => ({ label, weeks }));
}

/**
 * Return one entry per week column in the given quarter.
 *
 * @param quarter  - 1..4
 * @param year     - calendar year of the term start (default: term-start year)
 */
export function weeksInQuarter(
  quarter: number,
  year: number = DEFAULT_TERM_START.getFullYear(),
): { idx: number; label: string }[] {
  // Suppress unused-parameter lint — year is accepted for API consistency
  // with monthsForQuarter even though label generation is index-only here.
  void year;

  const firstWeek = (quarter - 1) * WEEKS_PER_QUARTER; // 0-based
  return Array.from({ length: WEEKS_PER_QUARTER }, (_, i) => {
    const idx = firstWeek + i;
    return { idx, label: `Wk ${idx + 1}` };
  });
}

// ── Full-year helpers ──────────────────────────────────────────────────────
//
// The school year is WEEKS_PER_QUARTER × 4 = 36 weeks. The Year view loads
// all of them at once and lets the user pan / jump within a single
// horizontally scrolling timeline.

/** Total weeks in one academic year — documented default / fallback. */
export const WEEKS_IN_YEAR = WEEKS_PER_QUARTER * 4;

/** Return every week of the academic year as `{ idx, label }` — uses the
 *  default 36-week span. Backwards-compat wrapper around `allYearWeeksFor`;
 *  new code should prefer the parameterized variant that accepts the
 *  configured start/end dates. */
export function allYearWeeks(): { idx: number; label: string }[] {
  return Array.from({ length: WEEKS_IN_YEAR }, (_, i) => ({
    idx: i,
    label: `Wk ${i + 1}`,
  }));
}

// ── Parameterized full-year helpers (Lane Y-cal, 2026-05-25) ───────────────
//
// The hard-coded `DEFAULT_TERM_START` + 36-week span only fit the mock
// fixture. Real schools configure their academic year via Settings →
// Curriculum → Academic year dates (see lib/use-academic-year.ts). These
// `*For` helpers take the configured (start, end) pair so the Roadmap /
// Progression timelines align exactly with the school's calendar.
//
// All four helpers share the same week-count derivation: count how many
// 7-day strides fit into (end - start), inclusive of the partial final
// week if the span isn't a clean multiple of 7 days. We never round down
// to a fractional week because the underlying lesson data is 1-based week-
// indexed and a half-week would render as an empty trailing column.

const MS_PER_WEEK_INTERNAL = 7 * 24 * 60 * 60 * 1000;

/**
 * Count the number of academic weeks between `start` and `end` (inclusive).
 * Always returns ≥ 1 so callers can render at least one column even if the
 * pair degenerates to start === end.
 *
 * Defensive: silently swaps start/end if reversed. The Lane Y-cal hook
 * normalizes before persisting, so this is belt-and-braces.
 */
export function weeksInRange(start: Date, end: Date): number {
  const a = start.getTime();
  const b = end.getTime();
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const spanMs = hi - lo;
  // Ceiling so a partial trailing week still gets a column. +1 because
  // the range is inclusive of both endpoints (a 0-day span = 1 week column
  // is a sensible degenerate case — better than rendering 0 columns).
  return Math.max(1, Math.ceil(spanMs / MS_PER_WEEK_INTERNAL) + 1);
}

/**
 * Return one `{ idx, label }` entry per week column in the configured
 * academic-year range. Labels are 1-based ("Wk 1" .. "Wk N").
 */
export function allYearWeeksFor(
  start: Date,
  end: Date,
): { idx: number; label: string }[] {
  const total = weeksInRange(start, end);
  return Array.from({ length: total }, (_, i) => ({
    idx: i,
    label: `Wk ${i + 1}`,
  }));
}

/**
 * Return one `YearMonthBand` per calendar month (12 total), with `weeks`
 * counts derived from the configured academic-year range — same shape as
 * `allYearMonths()` so consumers can swap in either without other changes.
 *
 * For each of the configured academic weeks (0..N-1), bump the count of
 * the calendar month containing that week's Sunday anchor. Months with no
 * overlap report `weeks: 0` and `hasData: false` — consumers should gate
 * on `hasData` for scroll-to-month or out-of-session placeholders.
 */
export function allYearMonthsFor(start: Date, end: Date): YearMonthBand[] {
  const totalWeeks = weeksInRange(start, end);
  const anchor = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );

  // First pass: count academic weeks per calendar-month, remember earliest
  // academic-week index per month. Both maps keyed by 0-based month idx
  // (0..11) — a 60-week range may span 3 calendar years; we collapse those
  // into the 12 month buckets, which means a multi-year academic year
  // accumulates weeks into the same Jan..Dec band regardless of which
  // calendar year contributed them. That matches the contract of the
  // legacy `allYearMonths()` and the MonthPicker UI.
  const weekCounts = new Map<number, number>();
  const firstWeekFor = new Map<number, number>();
  for (let w = 0; w < totalWeeks; w++) {
    const d = new Date(
      anchor.getFullYear(),
      anchor.getMonth(),
      anchor.getDate() + w * 7,
    );
    const m = d.getMonth();
    weekCounts.set(m, (weekCounts.get(m) ?? 0) + 1);
    if (!firstWeekFor.has(m)) firstWeekFor.set(m, w);
  }

  const startMonth = anchor.getMonth();
  return ALL_SCHOOL_MONTHS.map((m) => {
    const weeks = weekCounts.get(m) ?? 0;
    const hasData = weeks > 0;
    let startWeekIdx: number;
    if (hasData) {
      startWeekIdx = firstWeekFor.get(m) ?? 0;
    } else {
      // Out-of-session months clamp to a timeline edge. Months strictly
      // BEFORE the term-start month (within the calendar year) clamp to
      // the final week; months AT or AFTER clamp to 0. Consumers gate on
      // hasData so the exact clamp value only matters for MonthPicker.
      startWeekIdx = m < startMonth ? totalWeeks - 1 : 0;
    }
    return {
      label: MONTH_LABELS[m],
      weeks,
      startWeekIdx,
      monthIndex: m,
      hasData,
    };
  });
}

/**
 * Like `monthIndexForWeek`, but with the months derived from a configured
 * (start, end) pair. Walks the bands in calendar order, returning the
 * first one whose `startWeekIdx + weeks` is past `weekIdx`. Skips bands
 * with `weeks: 0` because they have no academic weeks to contain.
 */
export function monthIndexForWeekFor(
  weekIdx: number,
  start: Date,
  end: Date,
): number {
  const months = allYearMonthsFor(start, end);
  let lastDataIdx = -1;
  for (let i = 0; i < months.length; i++) {
    const band = months[i];
    if (band.weeks === 0) continue;
    lastDataIdx = i;
    if (weekIdx < band.startWeekIdx + band.weeks) return i;
  }
  return lastDataIdx === -1 ? 0 : lastDataIdx;
}

// ── School-months configuration ────────────────────────────────────────────
//
// Different schools run on different academic-year shapes (US Aug–May, Qatar
// Sep–May, Southern-hemisphere Feb–Nov, year-round, summer-only, etc.). To
// support that without hard-coding a single calendar, /year always renders
// all 12 calendar months by default; a settings surface lets the teacher
// choose which months belong to their school year. Selections are stored as
// 0-based calendar month indices.

/** All 12 calendar months. Index 0 = January, 11 = December. */
export const ALL_SCHOOL_MONTHS: readonly number[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
] as const;

/**
 * Named presets the settings page surfaces as quick-pick options. Each value
 * is an array of 0-based calendar month indices (0 = January, 11 = December).
 *
 * - `allYear`  — every calendar month (default).
 * - `us`       — US K-12 standard: Aug–May.
 * - `qatar`    — Qatar / GCC standard: Sep–May.
 * - `southern` — Southern-hemisphere standard: Feb–Nov.
 * - `summer`   — Summer-program / camp: Jun–Aug.
 */
export const SCHOOL_MONTH_PRESETS = {
  allYear: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  us: [7, 8, 9, 10, 11, 0, 1, 2, 3, 4], // Aug–May
  qatar: [8, 9, 10, 11, 0, 1, 2, 3, 4], // Sep–May
  southern: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], // Feb–Nov
  summer: [5, 6, 7], // Jun–Aug
} as const;

/** Shape of one calendar-month band returned by `allYearMonths()`. */
export interface YearMonthBand {
  /** Display name of the month, e.g. "January". */
  label: string;
  /**
   * How many of the 36 academic weeks fall inside this calendar month.
   * Months with no overlap report `weeks: 0` (and `hasData: false`).
   */
  weeks: number;
  /**
   * 0-based academic-week index where this band starts. For months with
   * `weeks === 0` this is the *first* academic-week index that would land
   * in or after the month — clamped to `WEEKS_IN_YEAR - 1` if the month
   * sits entirely after the academic year ends, and `0` if it sits entirely
   * before. Consumers should gate scroll/jump actions on `hasData`.
   */
  startWeekIdx: number;
  /** 0-based calendar month index (0 = January, 11 = December). */
  monthIndex: number;
  /**
   * Whether any of the 36 mock-data academic weeks overlap this month.
   * Consumers (Year view, print page) use this to decide whether to render
   * unit data or an "out-of-session" placeholder.
   */
  hasData: boolean;
}

/**
 * Return one entry per calendar month (12 total), anchored at
 * `DEFAULT_TERM_START`. Each entry records:
 *
 *   - `label`        — month display name ("January", "February", …).
 *   - `weeks`        — how many of the 36 academic weeks land in that month.
 *   - `startWeekIdx` — 0-based academic-week index where the band starts.
 *   - `monthIndex`   — 0-based calendar month index (0 = Jan).
 *   - `hasData`      — whether any academic weeks fall in this month.
 *
 * The MonthPicker uses `startWeekIdx` to scroll the timeline directly; the
 * Year view and settings page use `monthIndex` + `hasData` to filter and to
 * render out-of-session months as placeholders.
 *
 * IMPORTANT: this returns 12 entries — one per calendar month — regardless
 * of how many months actually contain academic weeks. The previous version
 * of this function returned only months with `weeks > 0`; existing fields
 * (`label`, `weeks`, `startWeekIdx`) are preserved so older consumers keep
 * working, but they will now see additional bands with `weeks: 0`.
 */
export function allYearMonths(
  year: number = DEFAULT_TERM_START.getFullYear(),
): YearMonthBand[] {
  const termStart = new Date(
    year,
    DEFAULT_TERM_START.getMonth(),
    DEFAULT_TERM_START.getDate(),
  );

  // First pass: count how many of the 36 academic weeks land in each
  // calendar month, and remember the earliest academic-week index for each.
  // Both maps are keyed by 0-based calendar month index (0..11).
  const weekCounts = new Map<number, number>();
  const firstWeekFor = new Map<number, number>();
  for (let w = 0; w < WEEKS_IN_YEAR; w++) {
    const d = new Date(
      termStart.getFullYear(),
      termStart.getMonth(),
      termStart.getDate() + w * 7,
    );
    const m = d.getMonth();
    weekCounts.set(m, (weekCounts.get(m) ?? 0) + 1);
    if (!firstWeekFor.has(m)) firstWeekFor.set(m, w);
  }

  // Second pass: emit exactly 12 bands, in calendar order (Jan..Dec). For
  // months with no overlap, clamp `startWeekIdx` to the nearest academic
  // week — months before the year start clamp to 0, months after the year
  // ends clamp to WEEKS_IN_YEAR - 1. Consumers gate on `hasData`.
  const termStartMonth = termStart.getMonth();
  return ALL_SCHOOL_MONTHS.map((m) => {
    const weeks = weekCounts.get(m) ?? 0;
    const hasData = weeks > 0;

    let startWeekIdx: number;
    if (hasData) {
      // Safe: firstWeekFor has an entry whenever weekCounts > 0.
      startWeekIdx = firstWeekFor.get(m) ?? 0;
    } else {
      // Position out-of-session months on the timeline edges. Months that
      // sit *before* the term-start month clamp to 0; months that sit
      // *after* the last academic week clamp to the final week index.
      // `m` and `termStartMonth` are both 0-based calendar indices, so a
      // direct comparison works for the within-same-calendar-year case;
      // when the academic year crosses a year boundary, months on the
      // "previous-year" side (m >= termStartMonth) still clamp to 0 which
      // is the correct behaviour for scroll-to-month.
      startWeekIdx = m < termStartMonth ? WEEKS_IN_YEAR - 1 : 0;
    }

    return {
      label: MONTH_LABELS[m],
      weeks,
      startWeekIdx,
      monthIndex: m,
      hasData,
    };
  });
}

/** Long-form month labels used by `allYearMonths()` (index 0 = January). */
const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Return the index into `allYearMonths()` for the band containing `weekIdx`.
 *
 * Because `allYearMonths()` now always returns 12 entries (one per calendar
 * month) — including months with `weeks: 0` — we can't just count cumulative
 * `weeks` to find the active band: an empty month would contribute zero and
 * be skipped over. Instead, we walk the bands and accept the first one
 * whose `startWeekIdx + weeks` is past `weekIdx`. The default `months`
 * parameter is preserved for backwards compatibility.
 */
export function monthIndexForWeek(
  weekIdx: number,
  months: {
    weeks: number;
    startWeekIdx: number;
    hasData?: boolean;
  }[] = allYearMonths(),
): number {
  // Walk bands in order, returning the first band that contains the week.
  // Bands with `weeks: 0` (no data) are skipped — they have no academic
  // weeks to contain. The fallback (last band) preserves prior semantics
  // for out-of-range `weekIdx` values.
  let lastDataIdx = -1;
  for (let i = 0; i < months.length; i++) {
    const band = months[i];
    if (band.weeks === 0) continue;
    lastDataIdx = i;
    if (weekIdx < band.startWeekIdx + band.weeks) return i;
  }
  // weekIdx is past the end of the academic year — return the last band
  // that actually had data, or 0 if there is none.
  return lastDataIdx === -1 ? 0 : lastDataIdx;
}
