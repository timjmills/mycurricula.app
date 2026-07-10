// day-status.ts — pure, tested status derivation for the v2 Day view canvas
// (components/day-v2). No React, no DOM, so the unit tests in
// tests/day-status.test.ts exercise the math directly.
//
// A lesson's live day-status is one of four:
//   • "done"     — the lesson's completion status is "done" (store truth).
//   • "now"      — the clock sits inside the lesson's effective time band
//                  (start inclusive, end EXCLUSIVE).
//   • "upcoming" — the clock is before the lesson's start.
//   • "idle"     — everything else: no parseable time band, or the band is
//                  already past (and the lesson was never marked done).
//
// Completion ("done") is store-owned and NEVER derived from the clock here —
// a past-but-unfinished lesson reads "idle", not "done" (the mockup's getState
// conflated the two; this canvas keeps completion independent of forking and
// of the clock, per CLAUDE.md §2). The effective time band is the lesson's own
// `time` label, else its subject's typical block (lessonTime), parsed by the
// same parser the Week EDIT board uses.

import { parseTimeLabel } from "@/lib/week-edit-periods";
import { lessonTime } from "@/lib/mock/schedule";
import type { LessonStatus, SubjectId } from "@/lib/types";

/** The live day-status of a lesson relative to a minute-of-day. */
export type DayStatus = "done" | "now" | "upcoming" | "idle";

/** The minimal lesson shape the status helpers need — kept structural so the
 *  pure functions never depend on the full Lesson model (and stay trivially
 *  testable). The real `Lesson` satisfies it. */
export interface DayStatusLesson {
  status: LessonStatus;
  subject: SubjectId;
  /** Optional freeform time label ("8:10–9:10"); falls back to the subject's
   *  typical block via lessonTime() when absent. */
  time?: string;
}

/**
 * Derive a lesson's live status against `nowMin` (minute-of-day, 0–1439).
 *
 * Precedence:
 *   1. status === "done"                        → "done"  (store truth wins)
 *   2. `isToday === false`                      → "idle"  (see the gate below)
 *   3. effective time band parses:
 *        startMin <= nowMin < endMin            → "now"   (start incl, end excl)
 *        nowMin < startMin                      → "upcoming"
 *        else (past)                            → "idle"
 *   4. no parseable band                        → "idle"
 *
 * THE `isToday` GATE (default true): the live "now"/"upcoming" split is only
 * meaningful for TODAY. When viewing another day, the wall clock must not paint
 * a false "now" ring / pulsing Finish on whichever lesson happens to bracket
 * the current time — every non-done lesson degrades to "idle" ("Planned").
 * Completion ("done") is store-owned and survives the gate.
 */
export function deriveDayStatus(
  lesson: DayStatusLesson,
  nowMin: number,
  isToday = true,
): DayStatus {
  if (lesson.status === "done") return "done";
  if (!isToday) return "idle";

  const band = parseTimeLabel(lessonTime(lesson));
  if (band === null) return "idle";

  if (nowMin >= band.startMin && nowMin < band.endMin) return "now";
  if (nowMin < band.startMin) return "upcoming";
  return "idle";
}

/**
 * Find the "current" (in-progress) and "next" (first upcoming) lesson ids in a
 * day's ordered lesson list — the B/C focus-panel default selection seed and
 * the DayA "now" anchor (bundle getState semantics). Each is the FIRST lesson
 * matching that status in list order; either is null when none matches (a gap
 * between blocks, before/after the school day, or an all-done day).
 */
export function currentAndNext<T extends DayStatusLesson & { id: string }>(
  lessons: readonly T[],
  nowMin: number,
  isToday = true,
): { currentId: string | null; nextId: string | null } {
  // Off-today there is no live now/next (the isToday gate) — the caller's
  // focus fallback collapses to selectedLessonId → first lesson.
  if (!isToday) return { currentId: null, nextId: null };
  let currentId: string | null = null;
  let nextId: string | null = null;
  for (const lesson of lessons) {
    const status = deriveDayStatus(lesson, nowMin, true);
    if (status === "now" && currentId === null) currentId = lesson.id;
    else if (status === "upcoming" && nextId === null) nextId = lesson.id;
  }
  return { currentId, nextId };
}
