// undo-toast-messages — pure decision logic for the roadmap-02 undo toast.
//
// The UndoToastBridge (components/shell/undo-toast-bridge.tsx) watches the
// planner store's `lastChange` signal and fires ONE bottom-center toast per
// undoable gesture (UX roadmap item 02 — "safety without friction"). All of
// the judgment lives here as pure functions so it can be unit-tested without
// React: given an action kind + the affected lesson before/after the action,
// decide the toast message (or null for "no toast").
//
// Toast matrix (spec: 6.12.26 handoff, item 02):
//   • move gestures (moveLesson / relocateLesson / bumpLesson)
//       — "Moved to {weekday}" for a same-week day move
//       — "Moved to Week {n}"  for an across-week move
//       — relocate-with-copy (source slot unchanged, a NEW lesson id landed
//         on the target — the bridge detects this and sets `isCopy`) says
//         "Copied to …" instead of "Moved to …" (§4a review L3)
//   • setLessonStatus — "Marked done" / "Marked not done" (status-aware)
//   • first-time fork — the educational copy (FIRST_FORK_MESSAGE). It WINS
//     over the gesture's own message: the moment a lesson lazily forks is the
//     moment the forking model explains itself (sticky-note brief).
//   • restoreLesson (revert/unfork) — "Restored the team's version"
//   • everything else — null. Text-edit bursts (editLesson / editSection),
//     section/resource plumbing, undo/redo/hydrate and catalog/hydration
//     side-channels NEVER toast. The single exception: an editLesson that
//     triggered a first-time fork toasts the fork education.
//
// Weekday names always come through the injected `dayLabel` callback, which
// the bridge wires to the configured school week (lib/week-order.ts) — never
// a hard-coded weekday array (CLAUDE.md hard rule).

import type { Lesson, LessonStatus } from "@/lib/types";

// ── Copy (frozen voice — see the item-02 spec) ─────────────────────────────

/** First-time fork education. EXACT spec voice — do not reword. */
export const FIRST_FORK_MESSAGE =
  "Saved to your personal plan — the team's version is untouched";

/** Revert/unfork confirmation (restoreLesson). */
export const RESTORE_MESSAGE = "Restored the team's version";

/** Completion-toggle copy, keyed by the lesson's NEW status. */
const STATUS_MESSAGE: Readonly<Record<LessonStatus, string>> = {
  done: "Marked done",
  not_done: "Marked not done",
  carried: "Marked carried over",
  skipped: "Marked skipped",
  partial: "Marked partially done",
};

/** Action kinds whose gesture is a placement change. */
const MOVE_KINDS: ReadonlySet<string> = new Set([
  "moveLesson",
  "relocateLesson",
  "bumpLesson",
]);

// ── First-fork detection ───────────────────────────────────────────────────

/** The lesson fields the fork detector inspects. */
type ForkSnapshot = Pick<Lesson, "id" | "modified" | "isPersonal">;

/**
 * True when THIS action transitioned an affected lesson from unforked
 * (no personal copy: `modified !== true` AND not previously `isPersonal`)
 * to personally forked (`modified === true` AND `isPersonal === true` — the
 * flag pair the store's lazy-fork path, setSaveTarget "personal", sets).
 *
 * Mode safety: only Personal-mode flows ever set that flag pair on an
 * EXISTING lesson — Master/Team-mode writes never touch the forking
 * metadata — so a transition here implies the viewer was in Personal mode.
 *
 * Completion can NEVER trip this (CLAUDE.md hard rule: marking a lesson done
 * never forks it): setLessonStatus rewrites only `status`, so `modified` /
 * `isPersonal` are byte-identical across the transition and the test below
 * is structurally false. Covered by tests/undo-toast-messages.test.ts.
 *
 * Lessons with no prior state (duplicate copies, brand-new lessons) are
 * skipped — being born personal is creation, not a fork of a team card.
 */
export function detectFirstFork(
  prevLessons: readonly ForkSnapshot[],
  nextLessons: readonly ForkSnapshot[],
  lessonIds: readonly string[],
): boolean {
  for (const id of lessonIds) {
    const prev = prevLessons.find((l) => l.id === id);
    if (!prev) continue; // no prior state — creation, not a fork
    if (prev.modified === true || prev.isPersonal === true) continue; // already forked
    const next = nextLessons.find((l) => l.id === id);
    if (next && next.modified === true && next.isPersonal === true) {
      return true;
    }
  }
  return false;
}

// ── Bulk-advance detection ─────────────────────────────────────────────────

/**
 * True when one observed `lastChange` advance pushed MORE THAN ONE entry onto
 * the undo stack (§4a review M2). A single dispatch moves the store's
 * `historyDepth` (= past.length) by exactly +1 (0 at the HISTORY_LIMIT cap or
 * for a coalesced text edit); undo is -1. But a bulk gesture — e.g.
 * WeeklyGrid.handleBulkMove dispatching N moveLesson actions in one React
 * batch — lands as ONE effect run whose depth jumped by N. A single-step
 * "Undo" toast there would restore 1 of N lessons while claiming to undo the
 * whole gesture, so the bridge suppresses the toast instead. Pure so it is
 * unit-testable without React.
 *
 * Known undercount: at HISTORY_LIMIT the past stack is truncated, so a bulk
 * advance near the cap can present as a jump ≤ 1 and slip through. Accepted
 * rare edge until item 06's real batch undo replaces this seam.
 */
export function isBulkHistoryAdvance(
  prevDepth: number,
  nextDepth: number,
): boolean {
  return nextDepth - prevDepth > 1;
}

// ── Message decision ───────────────────────────────────────────────────────

/** The lesson fields the message decision reads (AFTER the action). */
type LessonAfter = Pick<Lesson, "day" | "week" | "subject" | "status">;

/** The same lesson's placement BEFORE the action. */
type LessonBefore = Pick<Lesson, "day" | "week" | "subject">;

export interface UndoToastDecisionInput {
  /** The lastChange action kind, e.g. "moveLesson". */
  kind: string;
  /** True when this action first-forked the lesson (and the viewer is in
   *  Personal mode — the bridge clears the flag otherwise). */
  firstFork: boolean;
  /** The affected lesson AFTER the action. For a relocate-with-copy the
   *  bridge passes the NEW copy here (the thing that actually moved). */
  lesson?: LessonAfter;
  /** The affected lesson's placement BEFORE the action. */
  prevLesson?: LessonBefore;
  /** True for the relocate-with-copy path (§4a L3): the source lesson stayed
   *  put and `lesson` is the NEW copy on the target slot. The message then
   *  reads "Copied to …" — the source did not move, so "Moved" would lie. */
  isCopy?: boolean;
  /** Day index (0-based into the CONFIGURED school week) → full weekday
   *  name. The bridge derives this from useOrderedWeekdays() — the message
   *  must never come from a hard-coded weekday array. */
  dayLabel: (dayIndex: number) => string;
}

/**
 * Decide the undo-toast message for one planner mutation, or null for
 * "no toast". Pure — the bridge supplies all state.
 */
export function undoToastMessage(input: UndoToastDecisionInput): string | null {
  const { kind, firstFork, lesson, prevLesson, isCopy, dayLabel } = input;

  // History controls and hydration plumbing never toast. (The bridge already
  // skips these; kept here so the decision is self-contained + testable.)
  if (kind === "undo" || kind === "redo" || kind === "hydrate") return null;

  // First-fork wins over the gesture's own message — this is the one moment
  // the forking model explains itself. Also the ONLY path on which an
  // editLesson burst produces a toast.
  if (firstFork) return FIRST_FORK_MESSAGE;

  if (kind === "restoreLesson") return RESTORE_MESSAGE;

  if (kind === "setLessonStatus") {
    return lesson ? STATUS_MESSAGE[lesson.status] : null;
  }

  if (MOVE_KINDS.has(kind)) {
    if (!lesson || !prevLesson) return null;
    // Relocate-with-copy (§4a L3): the source stayed put and `lesson` is the
    // new copy — the honest verb is "Copied", not "Moved".
    const verb = isCopy === true ? "Copied" : "Moved";
    if (lesson.week !== prevLesson.week)
      return `${verb} to Week ${lesson.week}`;
    if (lesson.day !== prevLesson.day)
      return `${verb} to ${dayLabel(lesson.day)}`;
    // Subject-only (lane) move/copy: the slot day/week is unchanged, so naming
    // a day or week would be wrong — the bare verb still offers the way back.
    if (lesson.subject !== prevLesson.subject) return verb;
    return null; // no-op gesture (drop on origin, bump with no free slot)
  }

  // Everything else — edits, sections, resources, layout, archive (which has
  // its own card-level toast), duplication, catalog/hydration — no toast.
  return null;
}
