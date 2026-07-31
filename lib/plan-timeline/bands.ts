// plan-timeline/bands.ts — unit band geometry for the timeline lanes.
//
// A band spans `startSlot → endSlot` on the axis (`ph-units.jsx:588`), and
// overlapping bands in one lane STACK rather than overdraw (the level-packing
// loop at `ph-units.jsx:565-567`).
//
// Granularity is WEEK, per the user's ruling recorded in the audit brief:
// `units.start_week` / `units.end_week` already exist
// (20260518102823_initial_schema.sql:351-352) and are already selected
// (lib/planner/supabase-source.ts:615). Day-level `units.anchor_slot` /
// `position` are deferred — see the vocabulary note in ./types.ts.

import type { Lesson, Unit } from "@/lib/types";
import { slotOf } from "./axis";
import type { SpanSource } from "./types";

/** A 1-based, inclusive academic-week range. */
export interface WeekRange {
  start: number;
  end: number;
}

/**
 * The unit's declared week range.
 *
 * Prefers the NUMERIC fields (`Unit.startWeek` / `Unit.endWeek`, carried
 * through from `units.start_week` / `units.end_week` by the Supabase mapper).
 * Falls back to parsing the `weeks` display label ("Wk 9–14", "Wk 12") —
 * which is all the mock source and any pre-widening row provide.
 *
 * Returns null when neither is usable. A reversed range (end < start) is
 * normalised rather than rejected: a teacher can save one, and a band that
 * silently vanishes is worse than a band drawn the right way round.
 */
export function unitWeekRange(unit: Unit): WeekRange | null {
  // INTEGER, not merely finite. `Unit` is a domain type but its week fields are
  // fed from an untyped PostgREST row (supabase-source.ts), and a `1.5` would
  // produce fractional slot geometry — a band starting between two days.
  const start = unit.startWeek;
  const end = unit.endWeek;
  if (typeof start === "number" && Number.isInteger(start) && start > 0) {
    const e =
      typeof end === "number" && Number.isInteger(end) && end > 0 ? end : start;
    return normalise(start, e);
  }

  // `weeks` is the display collapse the mapper produces
  // (supabase-source.ts:979-981) and the shape the mock fixtures carry.
  //
  // ANCHORED ON "Wk", not "any digits in the string". A bare `\d+` scan reads
  // "Grade 5 · Wk 9–14" as weeks 5–9 and places the band five weeks early
  // without any signal that it guessed — and this is a DISPLAY string, so
  // nothing stops a label from carrying an unrelated number. A label this
  // grammar cannot parse yields null, which surfaces the unit as unscheduled
  // rather than as scheduled somewhere wrong.
  const m = /\bWk\.?\s*(\d+)(?:\s*[–—-]\s*(\d+))?/i.exec(unit.weeks ?? "");
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] === undefined ? a : Number(m[2]);
  if (!Number.isFinite(a) || a <= 0) return null;
  return normalise(a, Number.isFinite(b) && b > 0 ? b : a);
}

function normalise(a: number, b: number): WeekRange {
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

/** A resolved band footprint on the axis. */
export interface UnitSpan {
  startSlot: number;
  endSlot: number;
  source: SpanSource;
}

/**
 * Where a unit's band sits on the axis.
 *
 * Resolution order, strongest evidence first:
 *   1. the declared week range → the whole of those weeks (`"weeks"`);
 *   2. otherwise the days its own lessons occupy (`"lessons"`) — this is what
 *      the prototype does unconditionally (`pw-data.js:203-204`), and it is
 *      the only thing that renders under the mock source, where units carry a
 *      `weeks` label but a lesson may sit outside it;
 *   3. otherwise null — the unit has no position and is COUNTED as undated
 *      by the lane builder rather than dropped on the floor.
 *
 * The result is clamped to the axis. A unit that lies entirely off the axis
 * (a stale week range pointing past the configured year) returns null: better
 * absent-and-counted than pinned to column 0 where it reads as scheduled.
 */
export function unitSpan(
  unit: Unit,
  unitLessons: readonly Lesson[],
  schoolWeekLen: number,
  axisLength: number,
): UnitSpan | null {
  if (schoolWeekLen <= 0 || axisLength <= 0) return null;

  const range = unitWeekRange(unit);
  if (range) {
    const raw = {
      startSlot: slotOf(range.start, 0, schoolWeekLen),
      endSlot: slotOf(range.end, schoolWeekLen - 1, schoolWeekLen),
    };
    const clamped = clamp(raw, axisLength);
    // A DECLARED range that lands entirely off the axis returns null — it does
    // NOT fall through to the lesson dates. A unit stored for weeks 90–92 with
    // one stale lesson in week 2 would otherwise be drawn at week 2 and
    // labelled "it has no week range set", contradicting both its own schedule
    // and the band's tooltip. It is misconfigured, and "unscheduled" says so.
    return clamped ? { ...clamped, source: "weeks" } : null;
  }

  if (unitLessons.length > 0) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const l of unitLessons) {
      const s = slotOf(l.week, l.day, schoolWeekLen);
      if (s < lo) lo = s;
      if (s > hi) hi = s;
    }
    const clamped = clamp({ startSlot: lo, endSlot: hi }, axisLength);
    if (clamped) return { ...clamped, source: "lessons" };
  }

  return null;
}

function clamp(
  span: { startSlot: number; endSlot: number },
  axisLength: number,
): { startSlot: number; endSlot: number } | null {
  if (span.endSlot < 0 || span.startSlot > axisLength - 1) return null;
  return {
    startSlot: Math.max(0, span.startSlot),
    endSlot: Math.min(axisLength - 1, span.endSlot),
  };
}

/**
 * Assign each span a stacking level so overlapping units in one lane never
 * overdraw — the first level whose last-used end slot is strictly before this
 * span's start (`ph-units.jsx:565-567`).
 *
 * Input MUST be sorted by `startSlot` (then `endSlot`); the caller sorts,
 * because it also has to keep the parallel unit list in the same order.
 * Returns one level per input span, positionally.
 */
export function packLevels(
  spans: readonly { startSlot: number; endSlot: number }[],
): number[] {
  const levelEnd: number[] = [];
  return spans.map((s) => {
    let k = levelEnd.findIndex((end) => end < s.startSlot);
    if (k < 0) {
      k = levelEnd.length;
      levelEnd.push(s.endSlot);
    } else {
      levelEnd[k] = s.endSlot;
    }
    return k;
  });
}
