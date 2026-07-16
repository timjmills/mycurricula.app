// lesson-status.ts — the ONE place the Lesson Planner turns a `LessonStatus`
// into words a teacher reads.
//
// This exists because the planner shows a lesson's status three times within
// one dialog — the header tag, the stat strip, and the Overview body — and a
// `partial` lesson was reading "Planned" in the header while the body two
// hundred pixels below said "Partly taught". Any surface that prints a status
// word imports this map.
//
// A LEAF module on purpose: `tabs/**` may import it without reaching the
// `components/lesson-plan-v2` barrel, which would close an import cycle
// (barrel → PlanPage → tabs → barrel).
//
// Note the labels distinguish all five states. Do NOT collapse them to a
// done/not-done binary for display: `carried`, `skipped`, and `partial` are the
// states a teacher most needs to see, and the catch-up surfaces depend on them.

import type { LessonStatus } from "@/lib/types";

/** Sentence-case status words, shared by the header tag, stat strip, and tabs. */
export const LESSON_STATUS_LABEL: Record<LessonStatus, string> = {
  not_done: "Not taught yet",
  done: "Taught",
  carried: "Carried over",
  skipped: "Skipped",
  partial: "Partly taught",
};

/** Compact form for the header pill / stat strip, where "Not taught yet" is long. */
export const LESSON_STATUS_SHORT: Record<LessonStatus, string> = {
  not_done: "Planned",
  done: "Taught",
  carried: "Carried",
  skipped: "Skipped",
  partial: "Partial",
};

/**
 * Whether the lesson counts as taught. The ONLY status that does is `done` —
 * `partial` explicitly does not (a partly-taught lesson still owes class time),
 * which is why the Mark-taught action offers to complete it rather than undo it.
 */
export function isTaught(status: LessonStatus): boolean {
  return status === "done";
}
