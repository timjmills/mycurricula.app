// year-pacing.ts — pure helpers for computing per-subject pacing status on
// the Yearly Roadmap / Progression view.
//
// No React, no DOM. Accepts lessons, today's flat school-day index, and the
// school-week config — never reads those from a global so callers can pass
// whatever context they have (prototype mock, real data, tests).
//
// The flat "school day index" is the same coordinate used by lessonToFlatIndex
// in lib/year-calendar.ts: (week - 1) * schoolWeekLen + dayOfWeek.

import { lessonToFlatIndex } from "./year-calendar";
import type { Lesson, SubjectId } from "./types";

// ── Status union ──────────────────────────────────────────────────────────

export type PacingStatus =
  | { kind: "completed" }
  | { kind: "not_started" }
  | { kind: "starts_next_week" }
  | { kind: "starts_in_days"; days: number }
  | { kind: "on_pace" }
  | { kind: "in_progress" }
  | { kind: "behind"; days: number } // school days behind expected progress
  | { kind: "ahead"; lessons: number }; // lessons ahead of expected progress

// ── Computation ───────────────────────────────────────────────────────────

/**
 * Compute the pacing status for one subject.
 *
 * Algorithm:
 *  1. completed  — every lesson has status "done"
 *  2. not_started — 0 done AND no lesson has a flat index ≤ todaySchoolDayIdx
 *  3. starts_in_days / starts_next_week — 0 done AND first lesson is in the future
 *  4. behind / ahead / on_pace — compare done count to the expected count at
 *     today's school day (lessons whose flat index ≤ todaySchoolDayIdx)
 *  5. in_progress — fallback when ratios are close (on_pace by stricter cutoff)
 *
 * @param subjectId          Subject being evaluated (used only to filter lessons).
 * @param lessons            Full lesson list; filtered inside.
 * @param todaySchoolDayIdx  0-based flat school-day index for "today".
 * @param schoolWeek         School-week config; only `dayCount` is used here.
 */
export function pacingFor(
  subjectId: SubjectId,
  lessons: Lesson[],
  todaySchoolDayIdx: number,
  schoolWeek: { dayCount: number },
): PacingStatus {
  const subjectLessons = lessons.filter((l) => l.subject === subjectId);
  if (subjectLessons.length === 0) return { kind: "not_started" };

  const schoolWeekLen = schoolWeek.dayCount;

  // Flat index for each lesson.
  const withIdx = subjectLessons.map((l) => ({
    lesson: l,
    idx: lessonToFlatIndex(l.week, l.day, schoolWeekLen),
  }));

  const totalCount = withIdx.length;
  const doneCount = withIdx.filter((e) => e.lesson.status === "done").length;

  // 1. Completed — every lesson is done.
  if (doneCount === totalCount) return { kind: "completed" };

  // First lesson's flat index (earliest scheduled school day).
  const firstIdx = Math.min(...withIdx.map((e) => e.idx));

  // 2 & 3. Nothing done and everything still in the future.
  if (doneCount === 0 && firstIdx > todaySchoolDayIdx) {
    const daysUntilFirst = firstIdx - todaySchoolDayIdx;
    if (daysUntilFirst <= schoolWeekLen) return { kind: "starts_next_week" };
    return { kind: "starts_in_days", days: daysUntilFirst };
  }

  // 2b. Nothing done and we're at or past the start — treat as not_started
  //     only if somehow we have zero scheduled lessons before or on today.
  const scheduledByToday = withIdx.filter(
    (e) => e.idx <= todaySchoolDayIdx,
  ).length;
  if (doneCount === 0 && scheduledByToday === 0) return { kind: "not_started" };

  // 4. Compare done count to expected count (lessons scheduled by today).
  const expectedCount = scheduledByToday;

  if (expectedCount === 0) {
    // No lessons were expected by today — treat as not yet started.
    return { kind: "not_started" };
  }

  const delta = doneCount - expectedCount; // positive → ahead, negative → behind

  if (delta < 0) {
    // Behind: convert lesson deficit to approximate school days.
    // Each lesson occupies one school day slot on average.
    return { kind: "behind", days: Math.abs(delta) };
  }

  if (delta > 0) {
    return { kind: "ahead", lessons: delta };
  }

  // delta === 0: exactly on pace.
  return { kind: "on_pace" };
}

// ── Label formatter ───────────────────────────────────────────────────────

/**
 * Return a plain-text one-liner for the pacing row in LaneCard.
 * Keep it terse — the dot communicates urgency; the label clarifies.
 */
export function pacingLabel(status: PacingStatus): string {
  switch (status.kind) {
    case "completed":
      return "All lessons complete";
    case "not_started":
      return "Not started";
    case "starts_next_week":
      return "Starts next week";
    case "starts_in_days":
      return `Starts in ${status.days} day${status.days === 1 ? "" : "s"}`;
    case "on_pace":
      return "On pace";
    case "in_progress":
      return "In progress";
    case "behind":
      return `Behind ${status.days} day${status.days === 1 ? "" : "s"}`;
    case "ahead":
      return `Ahead ${status.lessons} lesson${status.lessons === 1 ? "" : "s"}`;
  }
}
