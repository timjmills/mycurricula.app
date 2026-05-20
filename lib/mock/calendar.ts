// Mock fixture: a tiny prototype-only week→date helper.
//
// PURPOSE
// ───────
// The Daily view's new in-column week strip needs to show a real-looking
// date number under each weekday pill (Sun 18 / Mon 19 / Tue 20 / …). The
// fixtures elsewhere only know about a week INDEX (1, 2, 3, …) and a day
// INDEX into the configured school week (0 = the first instructional
// weekday), never calendar dates. This helper bridges that gap *for the
// prototype only* — the real implementation will compute dates from the
// school's calendar configuration (term start, holiday breaks, the
// configured school week) once the backend lands.
//
// ANCHOR
// ──────
// The school year's Week 1 Sunday is anchored to a fictional Sunday so
// that the current mock week (CURRENT_WEEK = 12) lands on Sun 18 — the
// date used in the design screenshot. With weeks advancing by 7 calendar
// days, Week 12 Sunday = Anchor + 11 * 7 days. Picking 2026-01-18 (a
// Sunday) for Week 12 Sun gives Anchor = 2025-11-02 (also a Sunday).
//
// ASSUMPTIONS
// ───────────
// • Day index 0 is the FIRST instructional day of the school week. For the
//   beta school (Sun–Thu) that is Sunday; for a Mon–Fri school it would be
//   Monday, etc. The helper just adds the day-index to the week's first
//   calendar day, so it stays correct for any configured school week.
// • Calendar weeks always advance by 7 days regardless of which weekdays
//   the school runs — the school week selects WHICH columns appear, not
//   how fast the calendar moves.
// • No holidays / Ramadan / week-renumbering — flat counter weeks. The
//   real version will consult the school calendar.
//
// This file is intentionally minimal: a single date computation + a couple
// of formatting helpers. Anything more sophisticated belongs in the real
// calendar service, not in mock fixtures.

/**
 * Fictional Week 1, day 0 anchor for the prototype.
 *
 * 2025-11-02 is a Sunday; with weeks advancing by 7 days, Week 12 day 0
 * (Sunday) lands on 2026-01-18 — matching the design screenshot.
 *
 * Stored as year/month/day numbers (not a Date) so the constant survives
 * timezone juggling: every consumer constructs a *local* Date from these
 * fields, which keeps the date number stable across UTC offsets.
 */
const WEEK_1_DAY_0 = { year: 2025, month: 10, day: 2 } as const; // month is 0-indexed (Nov = 10)

/**
 * Construct the local-time Date for `week` / `dayIndex` against the
 * fictional anchor. Pure helper; no I/O, no timezone math beyond what the
 * `Date` constructor does locally.
 */
export function dateForWeekDay(week: number, dayIndex: number): Date {
  // Build the anchor as a *local* midnight Date so day arithmetic doesn't
  // drift across DST boundaries (Date math at midnight is the standard
  // workaround for that).
  const anchor = new Date(
    WEEK_1_DAY_0.year,
    WEEK_1_DAY_0.month,
    WEEK_1_DAY_0.day,
  );
  // (week - 1) full calendar weeks + dayIndex instructional days. Weeks
  // always advance by 7 calendar days regardless of how many instructional
  // days the school week contains (see header comment).
  const offsetDays = (week - 1) * 7 + dayIndex;
  return new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate() + offsetDays,
  );
}

/**
 * Date number ("18") for a given week + day index. Thin wrapper around
 * {@link dateForWeekDay} — kept as its own export because the week strip
 * almost exclusively wants the day-of-month number, not the full Date.
 */
export function dateNumberForWeekDay(week: number, dayIndex: number): number {
  return dateForWeekDay(week, dayIndex).getDate();
}
