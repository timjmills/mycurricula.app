// year-unit-aggregate.ts — pure helpers that roll a unit's lessons up into the
// secondary views the Year drill-down drawer shows on its non-Overview tabs
// (Resources · Standards · Notes). No unit-level resource/standard/note entity
// exists in the data model yet (Phase 1B+), so the Year drawer derives these
// from the unit's OWN lessons — real data, no placeholders.
//
// Every function takes the unit's lessons (already filtered to one unit) and
// returns ordered, display-ready refs that carry their lesson origin so the
// drawer can deep-link back to a specific day. Pure + side-effect-free so they
// memoize cleanly in the drawer.

import type { Lesson, LessonResource } from "@/lib/types";

/** A resource surfaced on the unit's Resources tab, tagged with the lesson it
 *  came from so the row can show "Wk 12 · Tue" provenance. */
export interface UnitResourceRef {
  resource: LessonResource;
  week: number;
  day: number;
  lessonId: string;
  lessonTitle: string;
}

/** A standard surfaced on the unit's Standards tab, with how many of the unit's
 *  lessons tag it (so the most-reinforced standards can read as such). */
export interface UnitStandardRef {
  code: string;
  /** Count of the unit's lessons that tag this standard (≥1). */
  lessonCount: number;
}

/** A note surfaced on the unit's Notes tab, tagged with its lesson origin. */
export interface UnitNoteRef {
  text: string;
  week: number;
  day: number;
  lessonId: string;
  lessonTitle: string;
}

/** Order lessons week-then-day so every aggregate reads chronologically. */
function byWeekThenDay(a: Lesson, b: Lesson): number {
  return a.week - b.week || a.day - b.day;
}

/** Every resource attached to the unit's lessons, in week→day order, each
 *  tagged with the lesson it belongs to. A lesson with no resources contributes
 *  nothing. Resources are NOT de-duplicated across lessons — the same anchor
 *  chart legitimately recurs across days, and the per-lesson provenance is the
 *  point of this view. */
export function unitResources(lessons: Lesson[]): UnitResourceRef[] {
  const out: UnitResourceRef[] = [];
  for (const l of [...lessons].sort(byWeekThenDay)) {
    for (const resource of l.resources) {
      out.push({
        resource,
        week: l.week,
        day: l.day,
        lessonId: l.id,
        lessonTitle: l.title,
      });
    }
  }
  return out;
}

/** Unique standards across the unit's lessons, sorted by code, each with the
 *  number of lessons that tag it. */
export function unitStandards(lessons: Lesson[]): UnitStandardRef[] {
  const counts = new Map<string, number>();
  for (const l of lessons) {
    for (const code of l.standards) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([code, lessonCount]) => ({ code, lessonCount }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/** Non-empty teacher notes across the unit's lessons, in week→day order, each
 *  tagged with its lesson origin. Whitespace-only notes are dropped. */
export function unitNotes(lessons: Lesson[]): UnitNoteRef[] {
  const out: UnitNoteRef[] = [];
  for (const l of [...lessons].sort(byWeekThenDay)) {
    const text = l.notes?.trim();
    if (!text) continue;
    out.push({
      text,
      week: l.week,
      day: l.day,
      lessonId: l.id,
      lessonTitle: l.title,
    });
  }
  return out;
}
