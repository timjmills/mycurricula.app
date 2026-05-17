// Completion-status helpers shared by the card and its task rows.
//
// The card surfaces a three-state CLICK cycle on the checkbox per the
// build brief: done → partial → not_done. The remaining statuses
// (skipped, carried) are set via the right-click status submenu, never
// by clicking the box, so they are not part of the cycle.

import type { LessonStatus } from "@/lib/types";

/** Next status when the completion checkbox is clicked. */
const CYCLE: Record<LessonStatus, LessonStatus> = {
  not_done: "done",
  done: "partial",
  partial: "not_done",
  // Off-cycle statuses fall back into the cycle at "done" on click.
  skipped: "done",
  carried: "done",
};

/** Advance a status one step around the click cycle. */
export function cycleStatus(s: LessonStatus): LessonStatus {
  return CYCLE[s];
}

/** Human label for a status, used in titles and the status pill. */
export const STATUS_LABEL: Record<LessonStatus, string> = {
  not_done: "Not done",
  done: "Done",
  partial: "Partial",
  skipped: "Skipped",
  carried: "Carried over",
};

/** Tooltip text for the completion checkbox, given its current state. */
export function checkTitle(s: LessonStatus): string {
  switch (s) {
    case "done":
      return "Done — click for Partial";
    case "partial":
      return "Partial — click to clear";
    case "skipped":
      return "Skipped";
    case "carried":
      return "Carried over";
    default:
      return "Not done — click for Done";
  }
}
