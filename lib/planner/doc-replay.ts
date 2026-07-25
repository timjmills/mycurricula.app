// lib/planner/doc-replay.ts — turn a document-level change into the source
// writes that make it real.
//
// WHY THIS EXISTS. Most planner mutators dispatch to the reducer AND tee a
// matching write (`editLesson` → updateLesson, `moveLesson` → moveLesson,
// `archiveLesson` → softDeleteLesson). A handful never did:
//
//   undo / redo          — the two biggest. Every mutator already wrote its
//                          change to the server on the way IN, so ⌘Z rewound the
//                          reducer and nothing else: the toast confirmed an undo
//                          that reappeared on reload, and in Team mode the value
//                          the teacher just took back stayed shared with the
//                          whole team.
//   bumpLesson           — reschedules to the next free slot.
//   relocateLesson       — moves (or copies-then-moves) to a target slot.
//   unarchiveLesson      — the Undo half of an archive. The delete committed and
//                          the restore did not.
//   restoreLesson        — revert a fork to the team's version.
//
// Rather than hand-writing a bespoke tee for each — and getting the next one
// wrong too — these six all resolve to the same question: the document just
// went from A to B; what has to be written so a reload shows B? This module
// answers it as a PURE function over the two documents, so the mapping is
// deterministically unit-testable without a provider, a network, or a clock.
//
// SCOPE, STATED HONESTLY. `LessonReplayOp` covers exactly what the
// `PlannerDataSource` contract can express. Two document changes it CANNOT:
// a lesson that appears in B but not A (undo of a delete-by-removal, redo of an
// add) and a lesson that disappears outright. Both are emitted as an explicit
// `unpersistable` op rather than skipped, because the caller's job is to
// SURFACE them — a change we cannot write must never look like one we did.

import type { Lesson, LessonStatus } from "../types";

/** A document change, projected onto the writes the source contract exposes. */
export type LessonReplayOp =
  /** Slot changed → `moveLesson`. */
  | { kind: "move"; lessonId: string; week: number; day: number }
  /** Completion changed → a completion-only `updateLesson` patch, which the
   *  source routes to a single atomic `writeStatus` and which never forks
   *  (CLAUDE.md §2). `status` AND `reasonNotDone` travel TOGETHER: they are one
   *  row, written read-modify-write, so two independent requests race and the
   *  loser's field is silently reverted to its pre-read value. Both current
   *  values are always carried, whichever of them moved. */
  | {
      kind: "completion";
      lessonId: string;
      status: LessonStatus;
      reasonNotDone: string;
    }
  /** Content changed → `updateLesson`. `patch` holds only the changed keys. */
  | { kind: "patch"; lessonId: string; patch: Partial<Lesson> }
  /** Became archived → `softDeleteLesson`. */
  | { kind: "archive"; lessonId: string }
  /** Stopped being archived → `unarchiveLesson`. */
  | { kind: "unarchive"; lessonId: string }
  /** No source verb can express this. The caller MUST surface it. */
  | {
      kind: "unpersistable";
      lessonId: string;
      reason: "lesson-added" | "lesson-removed";
    };

/**
 * The content keys a `patch` op may carry.
 *
 * DELIBERATELY NOT THE WHOLE `Lesson`. Four groups are excluded, each for a
 * reason that would otherwise cause a wrong write:
 *
 *   • `week` / `day` / `archived` / `status` / `reasonNotDone` — they get their
 *     own ops above. A move is slot-only; completion is one atomic row and must
 *     never fork, so both of its fields ride the `completion` op rather than
 *     being split across content lanes.
 *   • `time` / `preview` — no column. `time` is in the Supabase source's
 *     `contentKeys` but every write branch skips it, so a time-only patch takes
 *     the fork path with an EMPTY payload: a spurious fork that persists
 *     nothing. `preview` is derived.
 *   • `modified` / `isPersonal` / `moved` / `pendingMaster` — DERIVED fork
 *     signals (`is_diverged_from_master`), not columns a client may set. This is
 *     why an undone `restoreLesson` still shows its "Modified" pill after a
 *     reload: clearing the fork needs persisted lineage (Phase 1B), and painting
 *     the flag without a write is exactly the lie CLAUDE.md §2 forbids.
 *   • `standards` / `standardIds` — handled together, just below the loop: they
 *     are index-aligned and an ids-only remap is a real change the code list
 *     cannot express, so neither may be diffed alone.
 *   • `id` / `subject` / `unit` / `taughtAt` / `masterSnapshot` /
 *     `commentCount` / `unreadComments` — identity or read-only.
 */
const REPLAY_CONTENT_KEYS = [
  "title",
  "objective",
  "directions",
  "notes",
  "resources",
  "differentiation",
  "tasks",
  "assessment",
  "builds",
  "prep",
  "durationMinutes",
  "frameworkId",
  "frameworkData",
  "carried",
] as const satisfies readonly (keyof Lesson)[];

export type ReplayContentKey = (typeof REPLAY_CONTENT_KEYS)[number];

/** Structural equality for the shapes a lesson field can hold. Fields here are
 *  plain JSON (strings, numbers, arrays of objects, plain objects), and the
 *  reducer rebuilds them by spread on every edit, so reference equality alone
 *  reports far too many changes. `undefined` and a missing key are the same
 *  thing to the write path, so both serialize to `undefined` and compare equal. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Diff two planner documents' lessons into the writes that reproduce `next`.
 *
 * Ordering matters and is fixed: for a single lesson, `unarchive` is emitted
 * BEFORE its content/slot/status ops (restoring a lesson then editing it is
 * coherent; the reverse writes into a row the teacher still has archived), and
 * `archive` is emitted LAST (edit, then hide). Across lessons, order follows
 * `next`'s lesson order so the output is stable and snapshot-testable.
 */
export function diffLessonsForReplay(
  prev: readonly Lesson[],
  next: readonly Lesson[],
): LessonReplayOp[] {
  const prevById = new Map(prev.map((l) => [l.id, l]));
  const nextIds = new Set(next.map((l) => l.id));
  const ops: LessonReplayOp[] = [];

  for (const after of next) {
    const before = prevById.get(after.id);
    if (!before) {
      // A lesson materialized. `createLesson` exists, but calling it here would
      // mint a NEW row with a NEW id while the reducer keeps the old one — two
      // lessons where the teacher sees one. Reconciling that is `addLesson`'s
      // job (it calls the source FIRST and dispatches the server's row); a diff
      // cannot do it after the fact.
      ops.push({
        kind: "unpersistable",
        lessonId: after.id,
        reason: "lesson-added",
      });
      continue;
    }

    const wasArchived = before.archived === true;
    const isArchived = after.archived === true;
    if (wasArchived && !isArchived) {
      ops.push({ kind: "unarchive", lessonId: after.id });
    }

    if (before.week !== after.week || before.day !== after.day) {
      ops.push({
        kind: "move",
        lessonId: after.id,
        week: after.week,
        day: after.day,
      });
    }

    if (
      before.status !== after.status ||
      before.reasonNotDone !== after.reasonNotDone
    ) {
      ops.push({
        kind: "completion",
        lessonId: after.id,
        status: after.status,
        reasonNotDone: after.reasonNotDone,
      });
    }

    const patch: Partial<Lesson> = {};
    let changed = false;
    for (const key of REPLAY_CONTENT_KEYS) {
      if (sameValue(before[key], after[key])) continue;
      // Assigning through a narrowed union member keeps the patch typed without
      // a cast at each key.
      (patch as Record<string, unknown>)[key] = after[key];
      changed = true;
    }
    // Standards are TWO index-aligned fields and one decision. `standardIds`
    // holds the real `standards.id` uuids — the collision-free thing the write
    // path actually persists (a code like "S1" exists in several frameworks) —
    // so an ids-only remap is a REAL change that the code list cannot show. Both
    // are emitted whenever EITHER moved, using the post-change values, so the
    // codes and the ids can never be written out of step.
    if (
      !sameValue(before.standards, after.standards) ||
      !sameValue(before.standardIds, after.standardIds)
    ) {
      patch.standards = after.standards;
      // Assigned UNCONDITIONALLY, `undefined` included, so the pair is always
      // emitted as one unit and a caller reading key presence (the write-lane
      // split) can never see one without the other.
      patch.standardIds = after.standardIds;
      changed = true;
    }
    if (changed) {
      ops.push({ kind: "patch", lessonId: after.id, patch });
    }

    if (!wasArchived && isArchived) {
      ops.push({ kind: "archive", lessonId: after.id });
    }
  }

  for (const before of prev) {
    if (nextIds.has(before.id)) continue;
    // A lesson vanished from the document. `softDeleteLesson` ARCHIVES (the
    // lesson stays, hidden); it does not remove a row. Emitting it here would
    // persist a state the document does not describe, so this is reported, not
    // guessed at.
    ops.push({
      kind: "unpersistable",
      lessonId: before.id,
      reason: "lesson-removed",
    });
  }

  return ops;
}
