// helpers.ts — small pure helpers shared by the Unit Explorer's tab bodies.
//
// Extracted verbatim from UnitExplorer.tsx (B1.0) when the five tab bodies moved
// into unit-tabs/*. No React, no styles — just the weekday label and the modal's
// completion-status mapping the tabs each need. (URL safety is NOT here: it
// belongs to the one canonical sink, `isSafeUrl` in lib/resource-embed — see the
// removal note below.)

import type { Lesson } from "@/lib/types";
import type { DayStatus } from "@/lib/day-status";

/** Weekday short labels keyed by `Lesson.day` (0 = Sunday); out-of-range → "Day N".
 *  Deliberately self-contained so the tab bodies need no week-config import. */
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export function dayShort(day: number): string {
  return DAY_SHORT[day] ?? `Day ${day + 1}`;
}

// REMOVED (B4.5): the local `safeHref` guard. It claimed to "mirror" the
// canonical sink gate `isSafeUrl` (lib/resource-embed) but had drifted from it:
// it never checked SMUGGLE_CHARS, so a raw tab/newline/CR inside a
// root-relative URL passed. `"/\t/evil.com"` satisfied its `^\/(?![/\\])` arm
// (the char after the slash is a tab, so the negative lookahead held), and the
// browser strips the tab BEFORE parsing — resolving the href to `//evil.com`,
// a foreign origin. That is exactly the open-redirect `isSafeUrl` rejects.
// ResourcesTab (the only caller) now imports `isSafeUrl` directly, per
// CLAUDE.md's one-sink rule: never a second URL guard.

/** The Explorer's completion status for a lesson. The modal is NOT the live
 *  day, so the wall clock must never paint a false "now"/"upcoming" on a unit
 *  lesson that happens to bracket the current time (the day-status isToday
 *  gate): a lesson reads "done" from store truth, else "idle" ("Planned"). */
export function explorerStatus(lesson: Lesson): DayStatus {
  return lesson.status === "done" ? "done" : "idle";
}
