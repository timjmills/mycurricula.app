// lesson-schedule.ts — pure scheduling helpers for lesson positioning.
//
// No React, no side effects. Every function is a pure transformation over
// the lesson array and a school-week configuration. Consumers inject the
// school-week config so these helpers never hard-code the weekday set.
//
// The default school week (Sun–Thu, dayCount=5) is sourced from
// `lib/year-calendar.ts` → DEFAULT_SCHOOL_WEEK, matching the beta school
// fixture. Call sites that need a different week simply inject a different
// `schoolWeek` object.

import type { Lesson, SubjectId } from "@/lib/types";

// ── Types ──────────────────────────────────────────────────────────────────

/** Minimal school-week description required by these helpers.
 *  dayCount = number of instructional days per week (e.g. 5 for Sun–Thu). */
export interface SchoolWeekConfig {
  dayCount: number;
}

/** A lesson's position in the curriculum grid. */
export interface LessonSlot {
  week: number;
  day: number;
}

// ── Default school-week config ─────────────────────────────────────────────

/** Default school week derived from DEFAULT_SCHOOL_WEEK in year-calendar.ts
 *  (Sun–Thu, dayCount = 5). Imported lazily so this module stays tree-shakeable
 *  when consumers provide their own config. */
import { DEFAULT_SCHOOL_WEEK } from "@/lib/year-calendar";

export const DEFAULT_SCHOOL_WEEK_CONFIG: SchoolWeekConfig = {
  dayCount: DEFAULT_SCHOOL_WEEK.length,
};

// ── Helpers ────────────────────────────────────────────────────────────────

/** Convert a (week, day) pair to a flat integer so positions can be compared
 *  as simple numbers. Uses 1-based week numbers to match the mock fixture. */
function toFlat(week: number, day: number, dayCount: number): number {
  return (week - 1) * dayCount + day;
}

/** Reverse toFlat — returns the (week, day) pair for a flat index. */
function fromFlat(flat: number, dayCount: number): LessonSlot {
  const week = Math.floor(flat / dayCount) + 1;
  const day = flat % dayCount;
  return { week, day };
}

// ── nextInstructionalDay ───────────────────────────────────────────────────

/**
 * Return the next {week, day} slot for the same subject AFTER the lesson's
 * current position, respecting the configured school week.
 *
 * "Next slot" = the earliest flat position strictly after the lesson's
 * current flat index where:
 *   a) the day index is within 0..dayCount-1 (school-week bounds), and
 *   b) no lesson for the same subject already occupies that slot.
 *
 * Returns null when no qualifying slot is found within the scan horizon
 * (12 instructional weeks ahead), keeping the loop bounded.
 *
 * @param lesson     - The lesson being bumped.
 * @param lessons    - The full lesson array (unfiltered; archived lessons are
 *                     excluded from occupancy checks since they are soft-deleted).
 * @param schoolWeek - Injected school-week config; defaults to Sun–Thu (dayCount=5).
 */
export function nextInstructionalDay(
  lesson: Lesson,
  lessons: Lesson[],
  schoolWeek: SchoolWeekConfig = DEFAULT_SCHOOL_WEEK_CONFIG,
): LessonSlot | null {
  const { dayCount } = schoolWeek;
  const subject: SubjectId = lesson.subject;

  // Build a Set of occupied flat indices for the same subject so lookup is O(1).
  // Archived lessons are excluded — they no longer occupy a visible slot.
  const occupied = new Set<number>();
  for (const l of lessons) {
    if (l.subject === subject && !l.archived && l.id !== lesson.id) {
      occupied.add(toFlat(l.week, l.day, dayCount));
    }
  }

  const currentFlat = toFlat(lesson.week, lesson.day, dayCount);
  // Scan up to 12 instructional weeks (12 * dayCount slots) ahead to avoid
  // a runaway loop on sparse datasets.
  const maxSteps = 12 * dayCount;

  for (let step = 1; step <= maxSteps; step++) {
    const candidate = currentFlat + step;
    const slot = fromFlat(candidate, dayCount);

    // Guard: day index must be within the configured school week.
    if (slot.day < 0 || slot.day >= dayCount) continue;

    if (!occupied.has(candidate)) {
      return slot;
    }
  }

  // No free slot found within the horizon.
  return null;
}
