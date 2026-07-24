// lib/planner/unit-assessments.ts — the PURE unit-assessment mappers (B3,
// migration 20260729120000). Extracted from the server-only supabase-source so
// the write-path validity gate (`kind`) and the row↔domain column mapping are
// directly unit-testable without a Supabase harness. No I/O, no server imports —
// types only. Sibling of lib/planner/lesson-track-b.ts, and deliberately shaped
// like it so the two assessment models read the same way.
//
// WHAT THIS IS NOT: the B2 LESSON assessment ("a lesson wearing a hat" — four
// flat assessment_* columns on the three fork tables, mapped by
// lesson-track-b.ts). A UNIT assessment is a ROW in its own table, a unit owns
// MANY of them (pre-test / mid-unit / final), and they are TEAM curriculum
// content with no personal fork — so there is no SaveTarget and no fork branch
// anywhere in this file.

import type { UnitAssessment } from "../types";
import { isAssessmentKind } from "../types";
import type { UnitAssessmentPatch } from "./source";

/** A `public.unit_assessments` row as selected by the seam
 *  (UNIT_ASSESSMENT_COLS in lib/planner/supabase-source.ts). `created_at` /
 *  `updated_at` are DB-managed and deliberately NOT selected — nothing in the
 *  domain shape carries them, so reading them would be dead weight. */
export interface UnitAssessmentRow {
  id: string;
  unit_id: string;
  kind?: string | null;
  title?: string | null;
  purpose?: string | null;
  notes?: string | null;
  display_order?: number | null;
}

/** Row → domain. `kind` is RE-VALIDATED on read against `isAssessmentKind`: the
 *  column is deliberately un-CHECKed (the F1 enum-trap ruling, inherited from
 *  20260728120000), so a stored garbage value — from a legacy import or a direct
 *  SQL write that bypassed the write-path gate — is dropped to `undefined`
 *  rather than leaking a value the Assessments panel's formative/summative
 *  filters can't match. Exactly `assessmentFromRow`'s contract.
 *
 *  Empty text columns map to `undefined` (not ""), so a cleared field reads back
 *  as absent — the shape a fresh, never-filled assessment already has, so the
 *  panel never has to distinguish NULL from "".
 *
 *  `display_order` is NOT NULL in the schema; the `?? 0` is defence for a
 *  hand-written/legacy row, never an expected path. */
export function unitAssessmentFromRow(row: UnitAssessmentRow): UnitAssessment {
  return {
    id: row.id,
    unitId: row.unit_id,
    kind: isAssessmentKind(row.kind) ? row.kind : undefined,
    title: row.title ?? undefined,
    purpose: row.purpose ?? undefined,
    notes: row.notes ?? undefined,
    position: row.display_order ?? 0,
  };
}

/** Domain patch → the columns to write. Produces ONLY content columns: `id` /
 *  `unit_id` are identity (set once at create) and `display_order` moves through
 *  `reorderUnitAssessments`, never through a field edit — so neither can be
 *  smuggled in via a patch.
 *
 *  KEY-PRESENCE SEMANTICS (the lesson-track-b.ts contract, verbatim): a key is
 *  emitted whenever it is PRESENT in the patch, even with an `undefined` value —
 *  that is how the editor CLEARS a field (emptying Purpose sends
 *  `{ purpose: undefined }`, which must write `purpose: NULL`, not be skipped).
 *  Using `in patch` rather than `!== undefined` makes a cleared field actually
 *  clear the column. A key ABSENT from the patch is left untouched, so an
 *  unrelated edit never wipes a neighbouring field.
 *
 *  `kind` is validated through `isAssessmentKind` — the SOLE validity gate for
 *  the un-CHECKed column. An invalid kind is written as NULL while the other
 *  fields still persist (a mistyped kind must not take the whole edit down with
 *  it), matching `lessonTrackBColumns`. */
export function unitAssessmentColumns(
  patch: UnitAssessmentPatch,
): Partial<UnitAssessmentRow> {
  const next: Partial<UnitAssessmentRow> = {};
  if ("kind" in patch)
    next.kind = isAssessmentKind(patch.kind) ? patch.kind : null;
  if ("title" in patch) next.title = patch.title ?? null;
  if ("purpose" in patch) next.purpose = patch.purpose ?? null;
  if ("notes" in patch) next.notes = patch.notes ?? null;
  return next;
}

/** Sort a unit's assessments into their stable display order.
 *
 *  Positions are SPARSE after a delete (deleting the middle of 0,1,2 leaves
 *  0,2 — nothing renumbers), so this sorts by RELATIVE order and never assumes
 *  a dense 0…n-1 sequence or uses `position` as an index.
 *
 *  Ties (equal `position` — possible from a concurrent create or a hand-written
 *  row) fall back to `id`, so the order is TOTAL and stable: two renders of the
 *  same data can never disagree, and no row can hide behind another. Pure;
 *  returns a new array. */
export function sortUnitAssessments(
  list: readonly UnitAssessment[],
): UnitAssessment[] {
  return [...list].sort(
    (a, b) => a.position - b.position || a.id.localeCompare(b.id),
  );
}
