// plan-timeline/drag.ts — week-granularity band drag maths.
//
// ── THE GRANULARITY IS A RULING, NOT A SHORTCUT ────────────────────────────
// A drag on this timeline moves a unit's `startWeek` / `endWeek` and nothing
// finer. `units.start_week` / `end_week` have existed since
// 20260518102823_initial_schema.sql:351-352; the day-level `units.anchor_slot`
// / `position` and `lessons.pad` / `stack` the prototype drags against were
// DEFERRED by 20260728120000_track_b_workspace_fields.sql:36-42, whose note
// warns that porting them "would run two scheduling vocabularies in parallel".
// docs/audits/2026-07-31-plan-tab.md §C2 puts that decision above a build lane.
//
// ── WHAT A DRAG DOES AND DOES NOT MOVE ─────────────────────────────────────
// It re-paces the unit's DECLARED WEEK RANGE. It does NOT re-date the unit's
// lessons, and that is deliberate rather than unfinished:
//
//   • Lesson dates are per-lesson forkable content. Moving a unit's twelve
//     lessons from one gesture would, in Personal mode, lazily fork all twelve
//     at once (CLAUDE.md §2) — a mass fork from a gesture whose visible
//     feedback is a bar sliding sideways. The forking model's whole premise is
//     that the invisible-and-automatic path is the SMALL one.
//   • The two facts are already independent in the data: a unit stored for
//     weeks 9–14 with a lesson dated week 2 is representable today, and
//     `unitSpan` already prefers the declared range over the lesson dates
//     (bands.ts:99-112).
//
// So the surface must SAY so. The caller pairs every move with copy naming
// what moved and what did not, and `lessonsOutsideRange` counts the lessons a
// move leaves outside their own unit's weeks so the band can carry it as a
// visible mismatch rather than a silent one.
//
// Pure: no React, no DOM, no store. Every function here is unit-tested in
// tests/plan-timeline-drag.test.ts.

import type { Lesson } from "@/lib/types";
import { slotOf } from "./axis";
import type { WeekRange } from "./bands";

/** The shortest unit a resize may produce. A unit occupying zero weeks is not
 *  expressible — `end_week` would fall before `start_week` and the band would
 *  render inside-out. */
export const MIN_UNIT_WEEKS = 1;

/**
 * The 1-based academic week a flat slot falls in — the inverse of
 * `axis.ts:slotOf`, and the quantiser that turns a pointer position into the
 * only unit of movement this surface has.
 *
 * Clamps at week 1. A pointer dragged left of the first column yields a
 * NEGATIVE slot, and `Math.floor(-1 / 5) + 1` is 0 — a week number that does
 * not exist in this app's vocabulary and that would flow straight into
 * `units.start_week`. `schoolWeekLen <= 0` (every weekday deselected in
 * Settings — a reachable configuration) would divide by zero, so it too
 * resolves to week 1 rather than to Infinity.
 */
export function weekOfSlot(slot: number, schoolWeekLen: number): number {
  if (!Number.isFinite(slot) || schoolWeekLen <= 0) return 1;
  return Math.max(1, Math.floor(slot / schoolWeekLen) + 1);
}

/**
 * How many academic weeks an axis of `axisLength` columns spans.
 *
 * ROUNDS UP: the academic year rarely divides evenly by the school week, and a
 * unit must still be draggable into the final, short week. Rounding down would
 * make the last few days of the year unreachable by every drag.
 */
export function axisWeekCount(axisLength: number, schoolWeekLen: number): number {
  if (axisLength <= 0 || schoolWeekLen <= 0) return 0;
  return Math.ceil(axisLength / schoolWeekLen);
}

/**
 * Move a unit's whole week range by `deltaWeeks`, preserving its duration.
 *
 * Clamping moves the WHOLE range rather than each end independently. Clamping
 * the ends separately turns a six-week unit dragged off the left edge into a
 * one-week unit on week 1 — the teacher sees a bar snap to the start of the
 * year and has silently lost five weeks of declared schedule, with no signal
 * that anything but a move happened.
 *
 * A non-integer or non-finite delta is refused (returns the range unchanged)
 * rather than rounded: `units.start_week` is an integer column and the read
 * mapper's `Number.isInteger` guard (supabase-source.ts:finiteWeek) treats a
 * fractional value as "no week" — so a rounded-away 0.5 would look like a
 * successful write and then vanish on the next hydrate.
 */
export function moveWeekRange(
  range: WeekRange,
  deltaWeeks: number,
  maxWeek: number,
): WeekRange {
  const norm = normalise(range);
  if (!Number.isInteger(deltaWeeks) || deltaWeeks === 0) return norm;
  if (maxWeek < 1) return norm;

  const duration = norm.end - norm.start + 1;
  let start = norm.start + deltaWeeks;
  // Right edge first, then left — so on a unit LONGER than the axis the left
  // clamp wins and the unit stays anchored at week 1, visible, rather than
  // being pushed off the end of the year where nothing can reach it.
  if (start + duration - 1 > maxWeek) start = maxWeek - duration + 1;
  if (start < 1) start = 1;
  return { start, end: Math.min(maxWeek, start + duration - 1) };
}

/**
 * Move a unit's END week only — the right-edge resize (`ph-units.jsx:453-463`).
 *
 * The start never moves, so the clamp is on the end alone: at least
 * `MIN_UNIT_WEEKS` long, and no later than the axis's last week.
 *
 * The axis ceiling is `max(maxWeek, currentEnd)`, not `maxWeek` — a resize may
 * always SHRINK a unit, and may only GROW it as far as the axis. Clamping hard
 * to `maxWeek` would mean that a unit already stored past the end of a
 * shortened academic year jumps backwards by several weeks the instant a
 * teacher nudges its edge by one — an edit they did not ask for, dressed as
 * the one they did. It would also, on a unit starting past the end, clamp the
 * end BELOW the start and invert the range.
 */
export function resizeWeekRange(
  range: WeekRange,
  deltaWeeks: number,
  maxWeek: number,
): WeekRange {
  const norm = normalise(range);
  if (!Number.isInteger(deltaWeeks) || deltaWeeks === 0) return norm;

  const floor = norm.start + MIN_UNIT_WEEKS - 1;
  const ceiling = maxWeek >= 1 ? Math.max(maxWeek, norm.end) : Infinity;
  // `Math.max(floor, …)` is applied LAST so the minimum length always wins.
  return {
    start: norm.start,
    end: Math.max(floor, Math.min(norm.end + deltaWeeks, ceiling)),
  };
}

/**
 * The `Unit.weeks` display label for a range.
 *
 * MUST match `supabase-source.ts:987-991` character for character, EN DASH
 * included. That label is what every non-timeline surface reads (unit cards,
 * the workspace rail), and the drag writes it optimistically while the server
 * echo re-derives it — so a one-character difference makes the unit card
 * flicker between two spellings on every successful write. It also has to stay
 * readable by `bands.ts:unitWeekRange`'s `\bWk\.?\s*(\d+)…` fallback, which is
 * the only path for any unit whose numeric fields are absent.
 */
export function weeksLabel(start: number, end: number): string {
  return start === end ? `Wk ${start}` : `Wk ${start}–${end}`;
}

/** Inclusive slot footprint of a week range, clamped to the axis — the drag
 *  preview's geometry, and the same arithmetic `bands.ts:unitSpan` uses for the
 *  committed band, so the ghost lands exactly where the bar will. */
export function weekRangeSlots(
  range: WeekRange,
  schoolWeekLen: number,
  axisLength: number,
): { startSlot: number; endSlot: number } | null {
  if (schoolWeekLen <= 0 || axisLength <= 0) return null;
  const norm = normalise(range);
  const startSlot = slotOf(norm.start, 0, schoolWeekLen);
  const endSlot = slotOf(norm.end, schoolWeekLen - 1, schoolWeekLen);
  if (endSlot < 0 || startSlot > axisLength - 1) return null;
  return {
    startSlot: Math.max(0, startSlot),
    endSlot: Math.min(axisLength - 1, endSlot),
  };
}

/** Did the drag actually change anything? The guard that stops a click with a
 *  two-pixel wobble from issuing a write, a toast and an undo offer for a
 *  change the teacher did not make. */
export function weekRangeEquals(
  a: WeekRange | null,
  b: WeekRange | null,
): boolean {
  if (a === null || b === null) return a === b;
  return a.start === b.start && a.end === b.end;
}

/**
 * How many of a unit's dated lessons fall OUTSIDE a week range.
 *
 * A unit drag moves the declared schedule and leaves the lessons where they
 * are (see the header). This is the number that makes that visible instead of
 * leaving a teacher to notice that the bar and its dots have come apart.
 * Archived lessons are excluded — they are not on the timeline either.
 */
export function lessonsOutsideRange(
  lessons: readonly Lesson[],
  range: WeekRange,
): number {
  const norm = normalise(range);
  let n = 0;
  for (const l of lessons) {
    if (l.archived) continue;
    if (!Number.isInteger(l.week)) continue;
    if (l.week < norm.start || l.week > norm.end) n += 1;
  }
  return n;
}

/** `bands.ts:unitWeekRange` already normalises a reversed stored range; the
 *  drag must not be the one place that hands one back out reversed. */
function normalise(range: WeekRange): WeekRange {
  return range.start <= range.end
    ? { start: range.start, end: range.end }
    : { start: range.end, end: range.start };
}
