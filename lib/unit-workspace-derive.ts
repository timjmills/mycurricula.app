// unit-workspace-derive.ts — pure derivations for the B1 Unified Unit/Lesson
// Workspace (the 7.21 flagship). These sit ATOP the existing unit helpers
// (lib/year-v2-data.ts · lib/year-unit-aggregate.ts) and turn the live planner
// catalog + a unit's lessons into the grouped rail list, the honest pacing
// summary, the planning-completeness gaps, and the learning-arc scaffold the
// workspace header / Overview render.
//
// No React, no DOM, no store — so they memoize cleanly in the workspace and are
// exercised directly in tests/unit-workspace-derive.test.ts.
//
// HONESTY CONTRACT (CLAUDE.md §2 + the B0 porting hazards): the 7.21 prototype
// fabricates pace / projected-finish / vs-last-year / assessment stats from a
// slot+date model our data layer does NOT have yet. NONE of that is reproduced
// here. Every value below is backed by real store truth:
//   • "remaining" is always `total − taught`, NEVER a /5-week (or any) day-math
//     division — the school week is configurable, and no `taught_at` date exists
//     in the seam until B2.
//   • standards appear only as plain per-lesson tag counts — there is no
//     unit↔standards link, so no N/M coverage denominator is invented.
//   • the arc is a completion-fraction visualization, not independent per-phase
//     tracking (no such data exists).

import type { Lesson, Subject, SubjectId, Unit } from "@/lib/types";
import { unitProgress, type UnitProgress } from "@/lib/year-v2-data";

// ── Subject → units grouping (the workspace rail's grouped list) ────────────

/** One subject and its units, ready for a grouped rail section. */
export interface SubjectUnitGroup {
  subject: Subject;
  /** The subject's units, in catalog (curriculum) order. Never empty — a
   *  subject with no units is dropped from the result. */
  units: Unit[];
}

/**
 * Group the catalog's units by subject for the workspace rail.
 *
 * Preserves BOTH orderings that matter: subjects appear in the order the
 * `subjects` list is given (the catalog's locked display order, or a teacher's
 * reordered list), and each subject's units appear in the order they sit in
 * `units` — the same curriculum order `unitOrdinal` counts against, so a unit's
 * position here matches its "Unit n of N" elsewhere.
 *
 * A subject with no units is omitted so the rail never paints an empty heading.
 * Pure: filters `units` per subject, no store or DOM.
 */
export function subjectUnitGroups(
  subjects: readonly Subject[],
  units: readonly Unit[],
): SubjectUnitGroup[] {
  const groups: SubjectUnitGroup[] = [];
  for (const subject of subjects) {
    const own = units.filter((u) => u.subject === subject.id);
    if (own.length > 0) groups.push({ subject, units: own });
  }
  return groups;
}

// ── Per-unit progress map (the rail's taught/total badges) ──────────────────

/**
 * The separator between a subject id and a unit id in a progress-map key. A
 * newline can't appear in either slug, so `${subject}\n${unit}` can never
 * collide the way a naive `${subject}:${unit}` might if a slug contained ":".
 */
const UNIT_KEY_SEP = "\n";

/** Build the map key for one subject+unit — pair with `unitProgressByKey`. */
export function unitProgressKey(subjectId: SubjectId, unitId: string): string {
  return `${subjectId}${UNIT_KEY_SEP}${unitId}`;
}

/**
 * Taught/total for EVERY unit in one pass, keyed by `unitProgressKey`.
 *
 * The workspace rail shows a taught/total badge on every unit row, so a
 * per-row `unitProgress(unitLessons(...))` would rescan the whole lesson list
 * once per unit. This single O(lessons) sweep replaces that. Its counting
 * contract matches `unitLessons` + `unitProgress` exactly: archived lessons are
 * excluded, and `taught` counts only `status === "done"` (the store's
 * never-forking completion truth). Units keyed on subject AND unit — unit slugs
 * are unique only within a subject, so a bare-slug key would merge two subjects'
 * same-slug units.
 */
export function unitProgressByKey(
  lessons: readonly Lesson[],
): Map<string, UnitProgress> {
  const map = new Map<string, UnitProgress>();
  for (const l of lessons) {
    if (l.archived === true) continue;
    const key = unitProgressKey(l.subject, l.unit);
    const entry = map.get(key);
    if (entry) {
      entry.total += 1;
      if (l.status === "done") entry.taught += 1;
    } else {
      map.set(key, { total: 1, taught: l.status === "done" ? 1 : 0 });
    }
  }
  return map;
}

// ── Unit pacing (honest completion summary) ─────────────────────────────────

/** Whether a unit has no lessons, some still to teach, or is fully taught. */
export type UnitPaceState = "empty" | "in_progress" | "complete";

/**
 * The workspace header's pacing summary for ONE unit.
 *
 * HONESTY: this NEVER projects a finish date or an ahead/behind verdict — those
 * need per-lesson taught dates (`taught_at`, B2) and configured-week day math
 * this layer does not have, so reproducing the prototype's slot-based `pace`
 * would be a fabricated stat (forbidden — CLAUDE.md/§B0). It reports only what
 * `unitProgress` (year-v2-data) backs: taught, total, and lessons `remaining`
 * as `total − taught`.
 */
export interface UnitPace {
  total: number;
  taught: number;
  /** total − taught. The one true "remaining" — no day-math, no /5 week. */
  remaining: number;
  /** 0–1 completion fraction; 0 for an empty unit (never divides by zero). */
  fraction: number;
  state: UnitPaceState;
}

export function unitPace(lessons: readonly Lesson[]): UnitPace {
  const { total, taught } = unitProgress(lessons);
  const remaining = total - taught;
  const fraction = total > 0 ? taught / total : 0;
  const state: UnitPaceState =
    total === 0 ? "empty" : taught >= total ? "complete" : "in_progress";
  return { total, taught, remaining, fraction, state };
}

// ── Planning-completeness gaps (the honest "needs attention" signal) ────────

/**
 * Planning gaps across a unit's lessons — the honest "needs attention" signal,
 * derived only from fields the data model actually carries.
 *
 * A gap is counted ONLY on a not-yet-taught lesson: once a lesson is taught its
 * planning is history, not a to-do. Deliberately EXCLUDES two prototype signals
 * that would be fabricated here: date-based "missed" lessons (need `taught_at`,
 * B2) and standards coverage as a fraction of a unit standard set (no
 * unit↔standards link exists — B0).
 */
export interface UnitGaps {
  /** Not-taught lessons with no "I can" objective set. */
  missingObjective: number;
  /** Not-taught lessons with no resources attached. */
  missingResources: number;
  /** Not-taught lessons with no standards tagged. */
  missingStandards: number;
  /** Not-taught lessons with AT LEAST ONE of the above gaps (a union count, so
   *  it is ≤ the sum of the three and never double-counts a lesson). */
  lessonsWithGaps: number;
}

export function unitGaps(lessons: readonly Lesson[]): UnitGaps {
  let missingObjective = 0;
  let missingResources = 0;
  let missingStandards = 0;
  let lessonsWithGaps = 0;
  for (const l of lessons) {
    // Taught lessons are done — their planning completeness is no longer a to-do.
    if (l.status === "done") continue;
    const noObjective = l.objective.trim().length === 0;
    const noResources = l.resources.length === 0;
    const noStandards = l.standards.length === 0;
    if (noObjective) missingObjective += 1;
    if (noResources) missingResources += 1;
    if (noStandards) missingStandards += 1;
    if (noObjective || noResources || noStandards) lessonsWithGaps += 1;
  }
  return {
    missingObjective,
    missingResources,
    missingStandards,
    lessonsWithGaps,
  };
}

// ── Learning arc (a completion-fraction scaffold, not real phase tracking) ──

/**
 * The default six-phase learning arc, used to visualize a unit's shape when it
 * carries no framework-specific arc. Framework arcs (`unit.framework` + its
 * resolution chain) land later — a B0 porting hazard deliberately deferred — so
 * this canonical default is the only arc today. Labels only; this constant is
 * NOT a stat.
 */
export const ARC_PHASES: readonly string[] = [
  "Introduce & Explore",
  "Model the Strategy",
  "Guided Practice",
  "Apply Independently",
  "Extend & Connect",
  "Assess & Reflect",
];

/**
 * How many arc phases read as "reached", derived purely from completion
 * fraction across the given phase count: `round(taught / total × phases)`.
 *
 * This is a VISUAL mapping of the same taught/total truth `unitPace` reports —
 * it is NOT independent per-phase tracking (no per-phase data exists). Returns 0
 * for an empty unit or a non-positive phase count, and is clamped to
 * `[0, phaseCount]`.
 */
export function arcPhasesReached(
  progress: Pick<UnitProgress, "total" | "taught">,
  phaseCount: number = ARC_PHASES.length,
): number {
  if (phaseCount <= 0 || progress.total <= 0) return 0;
  const reached = Math.round((progress.taught / progress.total) * phaseCount);
  return Math.max(0, Math.min(phaseCount, reached));
}
