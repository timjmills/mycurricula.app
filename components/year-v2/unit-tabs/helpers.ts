// helpers.ts — small pure helpers shared by the Unit Explorer's tab bodies.
//
// Extracted verbatim from UnitExplorer.tsx (B1.0) when the five tab bodies moved
// into unit-tabs/*. No React, no styles — just the weekday label, the safe-href
// guard, and the modal's completion-status mapping the tabs each need.

import type { Lesson } from "@/lib/types";
import type { DayStatus } from "@/lib/day-status";

/** Weekday short labels keyed by `Lesson.day` (0 = Sunday); out-of-range → "Day N".
 *  Self-contained (mirrors UnitDrawer) so the modal needs no week-config import. */
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export function dayShort(day: number): string {
  return DAY_SHORT[day] ?? `Day ${day + 1}`;
}

/** Safe href guard — a resource URL can come from free text / imported rows, so
 *  an unsafe scheme (javascript:, data:, …) yields plain text, not a live link.
 *  Allows http(s)/blob: and same-origin root-relative paths; rejects
 *  protocol-relative and backslash tricks. (Copied from UnitDrawer.safeHref,
 *  which mirrors the canonical isSafeUrl.) */
export function safeHref(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (/^(https?|blob):/i.test(url)) return url;
  return /^\/(?![/\\])/.test(url) ? url : undefined;
}

/** The Explorer's completion status for a lesson. The modal is NOT the live
 *  day, so the wall clock must never paint a false "now"/"upcoming" on a unit
 *  lesson that happens to bracket the current time (the day-status isToday
 *  gate): a lesson reads "done" from store truth, else "idle" ("Planned"). */
export function explorerStatus(lesson: Lesson): DayStatus {
  return lesson.status === "done" ? "done" : "idle";
}
