// lib/unit-name.ts — resolve a lesson's `unit` field to a teacher-facing name.
//
// A lesson's `unit` holds the unit's id (a slug under the mock source, a real
// UUID on prod). When the Supabase seam can't map a lesson's `unit_id` back to
// a catalog unit it falls back to the raw id (lib/planner/supabase-source.ts),
// so rendering `lesson.unit` verbatim leaks an internal id to teachers — e.g.
// the composer Destination row and the /daily lesson subtitle showed
// "Math · c6063524-…" on prod (chrome sweep MAJOR-1) while Weekly List /
// Planner / Catch-up resolved the real name.
//
// Resolve through the catalog instead, scoped by SUBJECT: unit ids are unique
// only WITHIN a subject, so a flat `unitById[id]` lookup can hand back another
// subject's unit or silently shadow this one (lib/wall-scope rule 1, findUnit;
// lib/year-v2-data resolveUnitHeader). Returns null when the unit can't be
// resolved so callers degrade to the subject alone rather than surface the id.

import type { SubjectId, Unit } from "./types";

export function unitDisplayName(
  units: readonly Unit[],
  subject: SubjectId,
  unitId: string | null | undefined,
): string | null {
  if (!unitId) return null;
  const match = units.find((u) => u.subject === subject && u.id === unitId);
  return match?.name ?? null;
}
