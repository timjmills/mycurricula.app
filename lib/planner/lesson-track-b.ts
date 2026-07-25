// lib/planner/lesson-track-b.ts — the PURE Track-B lesson-field mappers (B2,
// migration 20260728120000). Extracted from the server-only supabase-source so
// the write-path validity gate (assessment_kind) and the read/write column
// mapping are directly unit-testable without a Supabase harness. No I/O, no
// server imports — types only.
//
// The Track-B rich lesson fields (duration, assessment, builds/prep, framework
// data/id, carried) live IDENTICALLY on all three fork tables
// (master_core_lesson_events / personal_core_lesson_event_copies /
// personal_authored_lessons). `assessmentFromRow` reassembles the domain
// `LessonAssessment` from the four flat columns on read; `lessonTrackBColumns`
// flattens a `LessonPatch` back onto the columns on write — ONE mapper applied
// in all three updateLesson branches so a field can never be mapped in one and
// silently dropped in another.

import type { LessonAssessment } from "../types";
import { isAssessmentKind } from "../types";
import type { LessonPatch } from "./source";

/** The Track-B lesson columns shared by all three fork-table row shapes.
 *  Read: buildLesson pulls these off the effective row. Write: lessonTrackBColumns
 *  produces a subset of them. `taught_at` is READ-ONLY in B2 (present on read,
 *  never produced by the write mapper). */
export interface LessonTrackBRow {
  taught_at?: string | null;
  duration_minutes?: number | null;
  assessment_kind?: string | null;
  assessment_title?: string | null;
  assessment_purpose?: string | null;
  assessment_notes?: string | null;
  builds?: string | null;
  prep?: string | null;
  fw_data?: unknown;
  fw_id?: string | null;
  carried?: unknown;
}

/** Reassemble a `LessonAssessment` from the four persisted `assessment_*`
 *  columns, or `undefined` when the lesson has no assessment (every column
 *  null/absent — "a lesson without an assessment omits the object entirely",
 *  B0). `kind` is RE-VALIDATED on read against `isAssessmentKind` (the column is
 *  deliberately un-CHECKed, so a stored garbage value — from a legacy import or
 *  a direct SQL write that bypassed the write-path gate — is dropped to
 *  undefined rather than leaking a value the Assessments-tab filters can't
 *  match). An assessment that carries only title/purpose/notes (no kind) still
 *  round-trips. */
export function assessmentFromRow(
  row: LessonTrackBRow,
): LessonAssessment | undefined {
  const kind = isAssessmentKind(row.assessment_kind)
    ? row.assessment_kind
    : undefined;
  const title = row.assessment_title ?? undefined;
  const purpose = row.assessment_purpose ?? undefined;
  const notes = row.assessment_notes ?? undefined;
  if (kind === undefined && !title && !purpose && !notes) return undefined;
  return { kind, title, purpose, notes };
}

/** Map a LessonPatch's Track-B rich fields onto their persisted columns (B2).
 *  ONE helper, applied in ALL THREE `updateLesson` write branches (authored /
 *  core-master / personal-fork) so the set is provably identical — a field
 *  mapped in one branch but missed in another would be a silent drop.
 *
 *  KEY-PRESENCE SEMANTICS (§4a HIGH-2): a key must be EMITTED whenever it is
 *  PRESENT in the patch, even with an `undefined` value — that is how the editor
 *  CLEARS a field (e.g. emptying Duration sends `{ durationMinutes: undefined }`,
 *  which must write `duration_minutes: NULL`, not be skipped). Using `in patch`
 *  (not `!== undefined`) makes a cleared field (a) actually clear the column and
 *  (b) count as content upstream, so a clear never falls through to a spurious
 *  EMPTY fork. A key ABSENT from the patch is left untouched (an unrelated edit
 *  never clears a field).
 *
 *  `assessment` is a whole-object patch → its four columns are written together,
 *  with `kind` validated via `isAssessmentKind` (the sole validity gate for the
 *  un-CHECKed column: an invalid kind is dropped to null while the other
 *  assessment fields still persist). `taughtAt` is DELIBERATELY NOT here — it is
 *  READ-ONLY in B2 (writing it would fork a pristine master, breaking
 *  completion-never-forks); `time` is likewise absent (no column). */
export function lessonTrackBColumns(patch: LessonPatch): LessonTrackBRow {
  const next: LessonTrackBRow = {};
  if ("durationMinutes" in patch)
    next.duration_minutes = patch.durationMinutes ?? null;
  if ("builds" in patch) next.builds = patch.builds ?? null;
  if ("prep" in patch) next.prep = patch.prep ?? null;
  if ("frameworkId" in patch) next.fw_id = patch.frameworkId ?? null;
  if ("frameworkData" in patch) next.fw_data = patch.frameworkData ?? null;
  if ("carried" in patch) next.carried = patch.carried ?? null;
  if ("assessment" in patch) {
    const a = patch.assessment;
    next.assessment_kind = a && isAssessmentKind(a.kind) ? a.kind : null;
    next.assessment_title = a?.title ?? null;
    next.assessment_purpose = a?.purpose ?? null;
    next.assessment_notes = a?.notes ?? null;
  }
  return next;
}

/** The lesson-CONTENT keys of a `LessonPatch` — the ones whose presence must
 *  fork a master-derived lesson in Personal mode (or write master in Team mode).
 *  Kept HERE, beside the Track-B column mapper, so the content gate and the
 *  column mapper cannot drift apart.
 *
 *  `time` is included but has NO column: every write branch skips it. That is
 *  deliberate and is why a time-only edit must never reach `updateLesson` at all
 *  (the store keeps re-times reducer-local) — it would fork with an empty patch.
 *  `taughtAt` is absent: read-only in B2. `reasonNotDone` is absent because it is
 *  COMPLETION, not content — see `isCompletionOnlyPatch`. */
export const LESSON_CONTENT_KEYS: readonly (keyof LessonPatch)[] = [
  "title",
  "objective",
  "preview",
  "directions",
  "notes",
  "resources",
  "standards",
  "time",
  "tasks",
  "differentiation",
  "durationMinutes",
  "assessment",
  "builds",
  "prep",
  "frameworkId",
  "frameworkData",
  "carried",
];

/**
 * Does this patch carry lesson CONTENT (as opposed to completion alone)?
 *
 * A cleared Track-B field is PRESENT-but-undefined in the patch, so a
 * `!== undefined` scan alone would miss it — hence the OR against the mapped
 * columns, which use `in patch` semantics.
 */
export function patchHasContent(patch: LessonPatch): boolean {
  return (
    LESSON_CONTENT_KEYS.some((k) => patch[k] !== undefined) ||
    Object.keys(lessonTrackBColumns(patch)).length > 0
  );
}

/**
 * Is this patch COMPLETION-ONLY — `status` and/or `reasonNotDone`, with no
 * content? Such a patch must NEVER fork (CLAUDE.md §2: completion is always
 * per-teacher).
 *
 * `reasonNotDone` belongs here and its omission broke the rule twice:
 * `{status, reasonNotDone}` was delegated to a status-only writer that dropped
 * the reason, and `{reasonNotDone}` alone fell all the way through to the fork
 * path with an EMPTY column mapper — minting a personal copy stamped
 * `is_diverged_from_master` (a "Modified" pill) for a lesson whose content never
 * changed.
 */
export function isCompletionOnlyPatch(patch: LessonPatch): boolean {
  const touchesCompletion =
    patch.status !== undefined || patch.reasonNotDone !== undefined;
  return touchesCompletion && !patchHasContent(patch);
}
