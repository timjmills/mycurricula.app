// year-v2-data.ts — pure derivations for the Wave-6 Year Unit Explorer.
//
// The Explorer opens on ONE unit (subject + unit-id slug) and shows only what
// real store data backs. These helpers turn the live planner catalog
// (`usePlanner().lessons` / `.units`) into the unit-scoped slices the modal
// renders: the unit's own lessons, its taught/total progress, and its ordinal
// position within the subject ("Unit n of N"). No React, no DOM — so they
// memoize cleanly in the modal and are exercised directly in
// tests/year-v2-data.test.ts.
//
// UNIT IDENTITY: `Lesson.unit` carries a unit-id SLUG (e.g. "u-m3", "u-u1"),
// never a display name (lib/mock/lessons.ts: `unit: o.unit ?? UNITS[o.subject].id`).
// The Explorer resolves the display name / week span via the catalog's
// `unitById`; these helpers key off the raw slug.

import type { Lesson, Subject, SubjectId, Unit } from "@/lib/types";

/** Taught (completed) vs total lesson counts for a unit. */
export interface UnitProgress {
  /** Lessons planned in the unit (archived already excluded). */
  total: number;
  /** Of those, how many are marked done (`status === "done"`). */
  taught: number;
}

/** A unit's ordinal position within its subject's curriculum-ordered unit list. */
export interface UnitOrdinal {
  /** 0-based index of the unit among its subject's units, or −1 if not found. */
  index: number;
  /** Total number of units the subject has. */
  count: number;
}

/** Order lessons week-then-day so every unit view reads chronologically. */
function byWeekThenDay(a: Lesson, b: Lesson): number {
  return a.week - b.week || a.day - b.day;
}

/**
 * The unit's lessons: the live lesson list filtered to one subject + unit-id
 * slug, with archived (soft-deleted) lessons excluded, sorted week→day.
 *
 * Matches every other Year/Week surface's filter contract — completion is
 * read straight off `lesson.status`, and `lesson.archived === true` rows never
 * appear (they are soft-deletes the views must hide). Returns a fresh array so
 * the caller can hold it in a memo without aliasing the store's list.
 */
export function unitLessons(
  lessons: readonly Lesson[],
  subjectId: SubjectId,
  unit: string,
): Lesson[] {
  return lessons
    .filter(
      (l) =>
        l.subject === subjectId &&
        l.unit === unit &&
        l.archived !== true,
    )
    .sort(byWeekThenDay);
}

/**
 * Taught / total for a unit's ALREADY-filtered lessons (pass the result of
 * `unitLessons`). `taught` counts only `status === "done"` — the store's
 * completion truth, which never forks (CLAUDE.md §2).
 */
export function unitProgress(lessons: readonly Lesson[]): UnitProgress {
  let taught = 0;
  for (const l of lessons) if (l.status === "done") taught += 1;
  return { total: lessons.length, taught };
}

/**
 * The unit's position within its subject's unit list — drives the header's
 * "Unit {n} of {N}" line. `units` is the catalog's full-year unit superset
 * (`usePlanner().units`, curriculum-ordered per subject); this filters it to
 * the subject and finds the slug. A slug absent from the catalog yields
 * `index: -1` so the caller can drop the ordinal rather than print "Unit 0".
 */
export function unitOrdinal(
  units: readonly Unit[],
  subjectId: SubjectId,
  unitId: string,
): UnitOrdinal {
  const forSubject = units.filter((u) => u.subject === subjectId);
  return {
    index: forSubject.findIndex((u) => u.id === unitId),
    count: forSubject.length,
  };
}

/** Everything the Explorer's header needs, once the catalog has been consulted. */
export interface UnitHeader {
  /** The unit's subject — the modal's whole visual identity hangs off this. */
  subject: Subject;
  /** Display name; falls back to the raw slug when the unit left the catalog. */
  name: string;
  /** Week-span label ("Wk 11–16"), or "" when the unit left the catalog. */
  spanLabel: string;
  /** "Unit 3 of 7", or "" when the slug isn't in the subject's unit list. */
  ordinalLabel: string;
}

/**
 * Resolve the Explorer header against the live catalog.
 *
 * Returns `null` when the SUBJECT is missing — the catalog or active notebook
 * can swap while the modal is open, and every part of this modal is
 * subject-derived (the `cp-subj` cascade that supplies `var(--c)`, the gradient
 * header, the glyph, the lesson filter). A subject-less modal has nothing
 * meaningful to render, so the caller CLOSES rather than paint a husk —
 * the same contract as LessonModal's deleted-while-open guard.
 *
 * A missing UNIT degrades instead of failing: the slug stands in as the name,
 * and the span / ordinal labels drop out.
 *
 * The unit metadata is resolved by searching the SUBJECT's own units, never
 * through a flat slug map: slugs are unique only within a subject, so a
 * `unitById[slug]` lookup both (a) can hand back another subject's unit and
 * paint its name + week span above this subject's glyph and lessons, and
 * (b) — because one slug can hold only one entry in a flat map — silently
 * loses THIS subject's unit whenever another subject shadows the slug
 * (Codex W6 R3, then R4). A foreign slug degrades exactly like a missing one.
 */
export function resolveUnitHeader(
  subjectById: Partial<Record<SubjectId, Subject>>,
  units: readonly Unit[],
  subjectId: SubjectId,
  unit: string,
): UnitHeader | null {
  const subject = subjectById[subjectId];
  if (!subject) return null;

  const meta = units.find((u) => u.subject === subjectId && u.id === unit);
  const { index, count } = unitOrdinal(units, subjectId, unit);
  return {
    subject,
    name: meta?.name ?? unit,
    spanLabel: meta?.weeks ?? "",
    ordinalLabel: index >= 0 ? `Unit ${index + 1} of ${count}` : "",
  };
}
