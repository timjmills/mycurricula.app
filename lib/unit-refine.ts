// unit-refine.ts — pure derivations for the unit workspace's REFINE tab (the
// 7.21 handoff's `PHUnits.Table`, `source-planning-hub/ph-units.jsx:912-998`).
//
// Refine is the unit's planning SPREADSHEET: one row per lesson, one column per
// planning field, edited in place. Its whole reason to exist is the "pass" — a
// teacher picks one field and fills it down every lesson in the unit in a single
// keyboard run, instead of opening twelve lesson editors.
//
// WHY THIS IS NOT THE INSIGHTS DRAWER. The drawer (components/year-v2/drawer)
// REPORTS: "5 of 8 lessons still to teach are missing something". Refine is the
// REMEDY — the surface where those five get fixed. Diagnosis and repair are two
// jobs, which is why they are two surfaces (CLAUDE.md §3, one job per surface).
// The two must agree, so `refineFieldSet`'s objective / standards / resources
// arms use the SAME predicates as `unitGaps` (lib/unit-workspace-derive.ts) —
// including the injected section-aware `hasResources`, without which a lesson
// whose resources all hang off its sections reads as empty here and full there.
//
// HONESTY CONTRACT. Every column below maps to a field the write path actually
// persists — `LESSON_CONTENT_KEYS` in lib/planner/lesson-track-b.ts. The
// handoff's sixth pass, **Flow**, is deliberately ABSENT: the prototype stores a
// flow as a `flowName` string on the lesson, and this app has no such field.
// Its real equivalent is the lesson's SECTION list (`setSections`), which is a
// document, not a value that can be picked from a dropdown or copied down a
// column. A Flow select here would either write nothing or silently overwrite
// twelve lessons' section content — so it is not offered. Same reasoning
// retires the handoff's per-lesson `done` jsonb: completeness is DERIVED here
// (the 7.28 migration ruled that column content-derived and dropped it).
//
// No React, no DOM, no store — exercised directly in tests/unit-refine.test.ts.

import type { Lesson } from "@/lib/types";

// ── Columns ─────────────────────────────────────────────────────────────────

/** The planning fields Refine tracks — the five that make a lesson "planned",
 *  and the five its completeness dots count. Ordered as they appear in the
 *  table, left to right. */
export type RefineFieldKey =
  | "objective"
  | "standards"
  | "duration"
  | "assessment"
  | "resources";

/** How Refine decides a field is filled.
 *
 *  `resources` needs the host's section-aware predicate for the reason spelled
 *  out in `unitGaps`: `Lesson.resources` is only half the truth, because the
 *  composer attaches to a SECTION whenever a section is the destination, and
 *  sections are not on the `Lesson` shape. Without it this module would mark a
 *  lesson's resources missing while the Resources tab beside it lists them.
 */
export interface RefineFieldOptions {
  hasResources?: (lesson: Lesson) => boolean;
}

/**
 * Is this planning field filled in on this lesson?
 *
 * The single source of truth for BOTH the per-row completeness dots and the
 * pass-progress counter, so the two can never disagree about the same lesson.
 */
export function refineFieldSet(
  lesson: Lesson,
  field: RefineFieldKey,
  opts?: RefineFieldOptions,
): boolean {
  switch (field) {
    case "objective":
      return lesson.objective.trim().length > 0;
    case "standards":
      return lesson.standards.length > 0;
    case "duration":
      // `> 0`, not just "present": a persisted 0 is not a planned duration, and
      // the input clears to `undefined` rather than to zero.
      return (lesson.durationMinutes ?? 0) > 0;
    case "assessment":
      // An assessment object with NO kind still counts — it is the drawer's
      // "unclassified" bucket, kept deliberately so a two-way formative /
      // summative split cannot quietly drop a real assessment
      // (drawer/AssessmentsPanel.tsx). Refine must count it the same way.
      return lesson.assessment !== undefined;
    case "resources":
      return opts?.hasResources
        ? opts.hasResources(lesson)
        : lesson.resources.length > 0;
  }
}

// ── Per-lesson completeness (the row's "Planned" dots) ───────────────────────

/** Every field's state on one lesson, plus the filled/total roll-up the row's
 *  dot cluster and its tooltip both read. */
export interface RefineCompleteness {
  objective: boolean;
  standards: boolean;
  duration: boolean;
  assessment: boolean;
  resources: boolean;
  /** How many of the five are filled. */
  filled: number;
  /** Always `REFINE_FIELDS.length` — carried so a caller never hard-codes 5. */
  total: number;
}

/** The five fields, in table order. */
export const REFINE_FIELDS: readonly RefineFieldKey[] = [
  "objective",
  "standards",
  "duration",
  "assessment",
  "resources",
];

export function refineCompleteness(
  lesson: Lesson,
  opts?: RefineFieldOptions,
): RefineCompleteness {
  const objective = refineFieldSet(lesson, "objective", opts);
  const standards = refineFieldSet(lesson, "standards", opts);
  const duration = refineFieldSet(lesson, "duration", opts);
  const assessment = refineFieldSet(lesson, "assessment", opts);
  const resources = refineFieldSet(lesson, "resources", opts);
  const filled = [
    objective,
    standards,
    duration,
    assessment,
    resources,
  ].filter(Boolean).length;
  return {
    objective,
    standards,
    duration,
    assessment,
    resources,
    filled,
    total: REFINE_FIELDS.length,
  };
}

// ── Passes ───────────────────────────────────────────────────────────────────

/** A pass narrows the table to one job: fill THIS field on every lesson. It
 *  highlights the column, counts progress, and is what the Enter-to-advance
 *  keyboard run is for. */
export interface RefinePass {
  key: RefineFieldKey;
  /** Menu label — the field, pluralised, as a teacher would name the job. */
  label: string;
  /** Onboarding-voice tooltip (CLAUDE.md §4) — what the pass accomplishes. */
  tip: string;
}

/**
 * The four passes Refine offers.
 *
 * `resources` is a field and a completeness dot but NOT a pass: attaching a
 * resource opens the composer, so there is no in-cell value to type and no
 * Enter-to-advance run to make. The handoff agrees — its `PASSES` list omits
 * resources too (`ph-units.jsx:913`). Its `flow` pass is dropped for the reason
 * in this file's header.
 */
export const REFINE_PASSES: readonly RefinePass[] = [
  {
    key: "objective",
    label: "Objectives",
    tip: "Work down the unit writing one “I can…” objective per lesson. Enter jumps to the next lesson.",
  },
  {
    key: "standards",
    label: "Standards",
    tip: "Work down the unit tagging the standards each lesson covers.",
  },
  {
    key: "duration",
    label: "Durations",
    tip: "Work down the unit setting how many minutes each lesson runs. Enter jumps to the next lesson.",
  },
  {
    key: "assessment",
    label: "Assessments",
    tip: "Work down the unit marking which lessons carry a formative or summative check.",
  },
];

/** How far a pass has got: lessons with the field filled, out of all of them. */
export interface RefinePassProgress {
  done: number;
  total: number;
}

/**
 * Progress for one pass across a unit's lessons.
 *
 * Counts EVERY lesson, taught or not — unlike `unitGaps`, which skips taught
 * lessons because their planning is history. That difference is deliberate:
 * Refine is a table a teacher edits row by row, so a counter that silently
 * excluded rows visible in front of them could read "8 of 8 done" above a table
 * with three empty cells in it.
 */
export function refinePassProgress(
  lessons: readonly Lesson[],
  field: RefineFieldKey,
  opts?: RefineFieldOptions,
): RefinePassProgress {
  let done = 0;
  for (const l of lessons) if (refineFieldSet(l, field, opts)) done += 1;
  return { done, total: lessons.length };
}

// ── Fill-down ────────────────────────────────────────────────────────────────

/** The fields whose first value can be copied down the whole column.
 *
 *  Only fields where "the same value for every lesson" is a real intent: a unit
 *  where every lesson runs 45 minutes, carries the same standard, or has the
 *  same assessment kind. Title and objective are excluded — twelve identical
 *  objectives is never what anyone meant, and offering the button would invite
 *  a destructive mis-click over content that took the longest to write.
 */
export type RefineFillableKey = Extract<
  RefineFieldKey,
  "standards" | "duration" | "assessment"
>;

/** One fill-down button: the column it fills, and the tooltip that says exactly
 *  what clicking it will overwrite. */
export interface RefineFillable {
  key: RefineFillableKey;
  label: string;
}

export const REFINE_FILLABLE: readonly RefineFillable[] = [
  {
    key: "standards",
    label: "Copy the first lesson’s standards to every lesson in this unit",
  },
  {
    key: "duration",
    label: "Copy the first lesson’s duration to every lesson in this unit",
  },
  {
    key: "assessment",
    label: "Copy the first lesson’s assessment to every lesson in this unit",
  },
];

/**
 * The patch a fill-down applies, derived from the FIRST lesson.
 *
 * Returns `null` when there is nothing to copy — no lessons, or the source
 * lesson's own value is empty. That guard is the difference between "copy 45
 * minutes down" and "silently clear the duration on eleven lessons": the
 * handoff's `fillDown` has no such check and does exactly the latter.
 *
 * Returned as a `Partial<Lesson>` so the caller hands it straight to
 * `editLesson` unchanged — no field-by-field switch at the callsite that could
 * drift from this one.
 */
export function refineFillPatch(
  lessons: readonly Lesson[],
  field: RefineFillableKey,
): Partial<Lesson> | null {
  const source = lessons[0];
  if (!source) return null;
  switch (field) {
    case "standards": {
      if (source.standards.length === 0) return null;
      // Codes and their index-aligned uuids move TOGETHER or not at all: a code
      // list paired with a stale id list mis-identifies a different catalog row
      // (the same trap StandardsTab documents). When the source has no ids,
      // clear them so identity degrades to the safe code fallback.
      return {
        standards: [...source.standards],
        standardIds: source.standardIds ? [...source.standardIds] : [],
      };
    }
    case "duration": {
      if ((source.durationMinutes ?? 0) <= 0) return null;
      return { durationMinutes: source.durationMinutes };
    }
    case "assessment": {
      if (source.assessment === undefined) return null;
      return { assessment: { ...source.assessment } };
    }
  }
}
