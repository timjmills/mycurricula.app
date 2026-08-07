// settings-calendar-format — pure display helpers for Settings → Calendar.
//
// Extracted from app/settings/calendar/page.tsx so they can be unit-tested
// without React: a Next.js App Router `page.tsx` may only export the
// framework-known names, so a helper left in that file is unreachable from a
// test. Both are used to build the Undo-toast copy the calendar page fires on
// every team-scoped mutation (audit 2026-07-31 §C1), where getting the string
// wrong means telling a teacher the wrong thing about a change they cannot
// otherwise see.
//
// Pure and side-effect-free: no storage, no DOM, no React.

import { WEEKDAY_LABEL, WEEKDAY_ORDER, type Weekday } from "./use-school-week";

/**
 * Render a "YYYY-MM-DD" calendar date in the viewer's locale.
 *
 * Parsed field-by-field on purpose. Handing an ISO date string to
 * `new Date()` makes the engine read it as UTC midnight, which then renders
 * as the PREVIOUS day for any viewer at a negative UTC offset — so a holiday
 * a teacher entered as the 5th would be announced as the 4th. Constructing
 * from (year, month, day) builds a LOCAL date instead, which is what a
 * calendar date means.
 *
 * Returns the input unchanged when it isn't a well-formed date, so a
 * malformed stored value degrades to something readable rather than the
 * string "Invalid Date".
 *
 * STRICT on two axes (§4a Low):
 *
 *   1. Exact `YYYY-MM-DD` shape. The previous parseInt-per-segment version
 *      accepted trailing junk ("2026-03-05x") and off-width segments,
 *      silently formatting a date the stored string does not say.
 *   2. Round-trip check. `new Date(2026, 1, 31)` does not fail — JS rolls it
 *      forward to March 3 — so an impossible calendar date ("2026-02-31")
 *      would render as a REAL date that was never entered. The constructed
 *      Date's components must equal the parsed integers, exactly the guard
 *      `academicYearIsoToDate` (lib/use-academic-year.ts) already applies.
 *
 * Month/day 00 fail the round-trip too (Date rolls them backward), so the
 * zero cases need no separate guard.
 */
export function formatIsoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d
  ) {
    return iso; // impossible calendar date — never display a rolled-over one
  }
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Human-readable summary of a school-week set — e.g. "Sun, Mon, Tue".
 *
 * Always emitted in Sun-first `WEEKDAY_ORDER`, never in the order the caller
 * happened to build the set in, so the sentence reads identically regardless
 * of which weekday chip the teacher clicked. `useSchoolWeek`'s setter
 * normalizes to that same order before persisting, so this describes what is
 * actually stored, not a transient click order.
 *
 * Duplicates collapse (it reads through a Set) and unknown tokens cannot
 * appear, because the output is driven by WEEKDAY_ORDER rather than by the
 * input array.
 *
 * CLAUDE.md §1: never hard-code the school week. This derives entirely from
 * the passed set, so a 3-day or 6-day week summarises correctly. The empty
 * case is reachable in principle (the caller guards against it, but this
 * function does not depend on that guard holding) and must not render as an
 * empty string inside a sentence.
 */
export function summarizeWeek(week: readonly Weekday[]): string {
  const set = new Set(week);
  const names = WEEKDAY_ORDER.filter((d) => set.has(d)).map(
    (d) => WEEKDAY_LABEL[d],
  );
  return names.length > 0 ? names.join(", ") : "no school days";
}
