// lib/planner/hydrate-bundle.ts — the planner document load, as ONE unit of work.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────────
// The hydrate in `lib/planner-store.tsx` reads six things: the active grade, then
// lessons + subjects + units + standards (written as a `Promise.all`, and
// commented as parallel), then the batched sections. Under the Supabase flag every
// one of those is a call through `plannerClient`, and `plannerClient` routes each
// call through the single `plannerDispatch` Server Action.
//
// NEXT RUNS CLIENT-INITIATED SERVER ACTIONS STRICTLY ONE AT A TIME. They share a
// queue, so a `Promise.all` of four of them is four sequential HTTP round trips
// wearing the costume of a parallel read. Measured on production (n=4): the six
// POSTs hand off with gaps of −1 to −5 ms, in exactly the array order of the
// `Promise.all`, with zero overlapping pairs, across per-call durations from
// 387 ms to 4229 ms. Replaying the same six requests through a bare HTTP context
// took 9923 ms / 8973 ms serial versus 4383 ms / 4643 ms parallel — so the
// SERVER parallelises fine and the ~4.4 s of dead time is entirely client-side.
//
// This module performs the identical sequence in ONE invocation, so the
// `Promise.all` runs where it can actually overlap. Two properties matter:
//
//   1. IT IS THE SAME READS, IN THE SAME ORDER, WITH THE SAME BRANCHES. This is a
//      transport change, not a semantic one. Every early return below mirrors a
//      branch the store already had; see the per-branch notes.
//   2. IT IS SOURCE-AGNOSTIC. It takes a `PlannerDataSource`, so the MOCK path
//      runs it directly in the browser with zero server actions (identical to
//      today's mock behaviour, which also never round-tripped), and the Supabase
//      path runs it inside one server action. There is no third code path.
//
// Deliberately NOT in this file: the retry, the cancelled-vs-failed
// classification, and every reducer dispatch. Those are client concerns and stay
// in the store, so a superseded hydrate is still recognised as a navigation
// rather than a failure.
//
// PRIVACY (§11.4): STRUCTURE only — lessons/units/subjects/standards/sections.

import type { Lesson, StandardsMap, Subject, Unit } from "../types";
import type { LessonSectionContent } from "../lesson-flow";
import type { PlannerDataSource } from "./source";

/**
 * Everything one planner hydrate needs, resolved together.
 *
 * The shape is deliberately flat + JSON-serializable: it crosses a Server Action
 * boundary, where only plain values survive (no Error objects, no Maps).
 */
export interface PlannerHydrateBundle {
  /** The resolved grade uuid, or null when the teacher has no grade configured.
   *  Null is a REAL answer (settle to "empty"), never an error — a failed lookup
   *  throws instead, exactly as `resolveGrade` documents. */
  gradeLevelId: string | null;
  lessons: Lesson[];
  subjects: Subject[];
  units: Unit[];
  standards: StandardsMap;
  /** Persisted sections keyed by lesson id. Lessons the batch omits are absent —
   *  the caller fills them with synthetic sections, unchanged. `{}` when the
   *  batch was skipped (no lessons) or failed. */
  sections: Record<string, LessonSectionContent[]>;
  /**
   * True when the SECTIONS batch failed and `sections` is therefore empty.
   *
   * A BOOLEAN, NOT THE MESSAGE, ON PURPOSE. Next redacts an uncaught Server
   * Action error before it reaches the browser; returning the message as data
   * would route a raw Postgres error (table + column names) around that
   * redaction and into a teacher's console. The full error is logged
   * server-side, where it is actually useful.
   */
  sectionsFailed: boolean;
}

/** The bundle for a teacher with no grade: the whole document load stops at the
 *  first step, exactly as the store's `if (!gradeLevelId)` branch did. */
function emptyBundle(): PlannerHydrateBundle {
  return {
    gradeLevelId: null,
    lessons: [],
    subjects: [],
    units: [],
    standards: {},
    sections: {},
    sectionsFailed: false,
  };
}

/**
 * Resolve one planner hydrate against `source`.
 *
 * THROWS on any failure of the grade lookup or the four primary reads — the
 * caller's catch owns the retry + the error state, and a partial document must
 * never be presented as a whole one. The sections batch is the single
 * exception: it is SUPPLEMENTARY (the caller can rebuild read-only sections
 * from each lesson's already-loaded `resources`), so its failure is reported as
 * a flag and never discards a fully-loaded document. That asymmetry is the
 * store's existing rule, moved verbatim rather than re-decided.
 */
export async function buildPlannerHydrateBundle(
  source: PlannerDataSource,
  ownerId: string,
): Promise<PlannerHydrateBundle> {
  // No owner → the empty bundle WITHOUT touching the backend, mirroring
  // `resolveGrade`'s guard. The store never gets here with a falsy owner (it
  // settles to "empty" first), but this is also a Server Action's argument, so
  // the guard belongs where both paths share it.
  if (!ownerId) return emptyBundle();

  const gradeLevelId = await source.getActiveGradeLevelId(ownerId);
  if (!gradeLevelId) return emptyBundle();

  // The read the whole exercise is about. On the server these genuinely overlap:
  // the four calls issue concurrently and the wall clock is the slowest one, not
  // the sum. All four are grade-scoped, and none falls back to mock data — a
  // failure propagates so the store keeps EMPTY_DOC rather than showing another
  // grade's fixtures.
  const [lessons, subjects, units, standards] = await Promise.all([
    source.listLessons(gradeLevelId, ownerId),
    source.listSubjects(gradeLevelId),
    source.listUnits(gradeLevelId),
    source.listStandards(gradeLevelId),
  ]);

  // No lessons → skip the sections batch (there is nothing to batch) but STILL
  // return the catalog. A freshly-provisioned workspace needs subjects/units
  // before it can hold a lesson; dropping them here is the cold-start deadlock
  // the store's comment describes.
  if (lessons.length === 0) {
    return {
      gradeLevelId,
      lessons,
      subjects,
      units,
      standards,
      sections: {},
      sectionsFailed: false,
    };
  }

  let sections: Record<string, LessonSectionContent[]> = {};
  let sectionsFailed = false;
  try {
    sections = await source.getSectionsBatch(
      lessons.map((l) => l.id),
      ownerId,
    );
  } catch (err) {
    sectionsFailed = true;
    // Logged where the error is still intact. On the Supabase path this is a
    // server log; on the mock path it is the browser console — the same place
    // the pre-bundle code logged it.
    console.error(
      "[planner] hydrate bundle: section batch failed; the document still loads and sections fall back to synthetic",
      err,
    );
  }

  return {
    gradeLevelId,
    lessons,
    subjects,
    units,
    standards,
    sections,
    sectionsFailed,
  };
}
