// plan-timeline/axis.ts — the timeline's date axis.
//
// Built on `lib/year-calendar.ts:buildSchoolDays` (the axis the Year view
// already uses) rather than a second calendar: the audit's §C2 verdict for
// "day axis with holidays" is "Already solved — the axis is derivable today".
// This module only projects those days into `TimelineDay`s and overlays the
// configured holidays.

import type { SchoolDay } from "@/lib/year-calendar";
import type { Holiday } from "@/lib/use-holidays";
import type { TimelineDay, TimelineMonthBand } from "./types";

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
 * ISO `YYYY-MM-DD` from the calendar PARTS of a school day.
 *
 * Built by string assembly, never `new Date(...).toISOString()`: the latter
 * shifts to UTC and can render 2026-04-09 as 2026-04-08 in a negative-offset
 * locale — the footgun documented at components/year/UnitBar.tsx:49-51.
 */
export function isoOfDay(day: {
  year: number;
  month: number;
  dateNum: number;
}): string {
  const mm = String(day.month + 1).padStart(2, "0");
  const dd = String(day.dateNum).padStart(2, "0");
  return `${day.year}-${mm}-${dd}`;
}

/**
 * Project `buildSchoolDays` output onto the timeline axis, tagging each column
 * with its holiday (if any).
 *
 * @param schoolDays    Flat school-day list from `buildSchoolDays`.
 * @param holidays      Configured holidays (`useHolidays().holidays`).
 * @param schoolWeekLen Number of school days per week — the stride used to
 *                      recover a 1-based `week` from the flat index. Passing
 *                      the day's own `week` field would work too, but the
 *                      stride is what every other consumer (`lessonToFlatIndex`)
 *                      uses, so we keep one arithmetic.
 */
export function buildTimelineAxis(
  schoolDays: readonly SchoolDay[],
  holidays: readonly Holiday[],
  schoolWeekLen: number,
): TimelineDay[] {
  // First holiday wins for a date — the list can legitimately carry two names
  // for one day (a school holiday and a public one) and the column has room
  // for one label.
  const holidayByIso = new Map<string, string>();
  for (const h of holidays) {
    if (!holidayByIso.has(h.date)) holidayByIso.set(h.date, h.name);
  }

  return schoolDays.map((d, slot) => {
    const iso = isoOfDay(d);
    return {
      slot,
      // SchoolDay.week is 0-based; Lesson.week is 1-based (year-calendar.ts:186).
      // The axis speaks the LESSON's dialect so a caller never has to remember
      // which side of the boundary it is on.
      week: schoolWeekLen > 0 ? Math.floor(slot / schoolWeekLen) + 1 : d.week + 1,
      day: schoolWeekLen > 0 ? slot % schoolWeekLen : d.day,
      dateNum: d.dateNum,
      wkd: d.wkd,
      month: d.month,
      year: d.year,
      iso,
      holiday: holidayByIso.get(iso) ?? null,
      weekStart: schoolWeekLen > 0 ? slot % schoolWeekLen === 0 : d.day === 0,
    };
  });
}

/**
 * Collapse the axis into month bands for the header row
 * (`ph-units.jsx:536-539`). Consecutive columns in the same calendar month of
 * the same year merge; a year boundary starts a new band even for the same
 * month index.
 */
export function monthBands(
  axis: readonly TimelineDay[],
): TimelineMonthBand[] {
  const bands: TimelineMonthBand[] = [];
  for (const d of axis) {
    const key = `${d.year}-${d.month}`;
    const last = bands[bands.length - 1];
    if (last && last.key === key) {
      last.span += 1;
    } else {
      bands.push({ key, label: MONTH_LABELS[d.month] ?? "", span: 1 });
    }
  }
  return bands;
}

/**
 * Flat slot for a `week` (1-based) + `day` (0-based) pair. Thin alias of
 * `lessonToFlatIndex` kept here so the timeline's own modules never import two
 * different names for one arithmetic.
 */
export function slotOf(
  week: number,
  day: number,
  schoolWeekLen: number,
): number {
  return (week - 1) * schoolWeekLen + day;
}

/**
 * The slot "today" occupies, or `null` when it cannot be placed.
 *
 * `todayColumn` is `lib/now-anchor.ts:todayColumnIndex` — null when today is a
 * NON-SCHOOL day (a Friday in a Sun–Thu week). The two callers want different
 * things in that case, so this helper serves only the one that must not lie:
 * the today LINE. No school day = no line, rather than a line parked on an
 * arbitrary column.
 *
 * `basis` is `AppState.currentWeekBasis`. Anything but `"in-range"` means the
 * derivation was CLAMPED (school year not started / already over /
 * unconfigured) — `currentWeek` is then a fallback, not a location, so the
 * line is omitted rather than drawn somewhere unaccountable.
 */
export function todayLineSlot(input: {
  currentWeek: number;
  currentWeekBasis: string;
  todayColumn: number | null;
  schoolWeekLen: number;
  axisLength: number;
}): number | null {
  const { currentWeek, currentWeekBasis, todayColumn, schoolWeekLen } = input;
  if (currentWeekBasis !== "in-range") return null;
  if (todayColumn === null) return null;
  const slot = slotOf(currentWeek, todayColumn, schoolWeekLen);
  if (slot < 0 || slot >= input.axisLength) return null;
  return slot;
}

/**
 * Inclusive slot range of the academic week containing `week`, clamped to the
 * axis. Drives the current-week highlight (`ph-units.jsx:552-554`).
 */
export function weekSlotRange(
  week: number,
  schoolWeekLen: number,
  axisLength: number,
): { startSlot: number; endSlot: number } | null {
  if (schoolWeekLen <= 0 || axisLength <= 0) return null;
  const start = slotOf(week, 0, schoolWeekLen);
  const end = start + schoolWeekLen - 1;
  if (end < 0 || start >= axisLength) return null;
  return {
    startSlot: Math.max(0, start),
    endSlot: Math.min(axisLength - 1, end),
  };
}
