// plan-timeline/types.ts — the shared vocabulary for the Plan tab's timeline
// landing (7.21 handoff `source-planning-hub/ph-units.jsx` → `Timeline`).
//
// SCHEDULING VOCABULARY. The handoff prototype addresses time by a "slot" —
// an index into a school-day array that EXCLUDES holidays (`pw-data.js:30-37`
// pushes a null slot for a holiday day). This app addresses time by
// `Lesson.week` (1-based) + `Lesson.day` (0-based into the configured school
// week), and `lib/year-calendar.ts:buildSchoolDays` emits one entry per
// configured weekday whether or not it is a holiday.
//
// We keep the SHIPPED vocabulary and define `slot` as the flat index into
// `buildSchoolDays` — i.e. `lessonToFlatIndex(week, day, schoolWeekLen)`.
// Holidays are therefore a TINT on a column that still exists, not a gap in
// the numbering. This is deliberate: migration 20260728120000 warns that
// porting the prototype's slot columns "would run two scheduling vocabularies
// in parallel", and the audit (docs/audits/2026-07-31-plan-tab.md §C1) rules
// day-granularity slot storage out of this wave.

import type { SubjectId } from "@/lib/types";
import type { WeekRange } from "./bands";

// ── Axis ───────────────────────────────────────────────────────────────────

/** One column of the timeline's date axis: a configured school day. */
export interface TimelineDay {
  /** Flat 0-based index into the axis — the timeline's "slot". */
  slot: number;
  /** 1-based academic week, matching `Lesson.week`. */
  week: number;
  /** 0-based index into the configured school week, matching `Lesson.day`. */
  day: number;
  /** Day-of-month number (1–31). */
  dateNum: number;
  /** Short weekday label from the school-week config ("Su", "Mo", …). */
  wkd: string;
  /** Calendar month index (0 = January). */
  month: number;
  /** Calendar year. */
  year: number;
  /** ISO `YYYY-MM-DD` for this column (built from the parts, never parsed from
   *  a string — see the UTC-shift note in components/year/UnitBar.tsx:49-51). */
  iso: string;
  /** Holiday name when this school day is a configured holiday, else null. */
  holiday: string | null;
  /** First school day of its academic week (drives the week rule). */
  weekStart: boolean;
}

/** A run of consecutive axis columns sharing one calendar month. */
export interface TimelineMonthBand {
  /** Stable render key — `${year}-${month}`, unique across a multi-year axis. */
  key: string;
  /** Display label, e.g. "September". */
  label: string;
  /** How many axis columns this band spans. */
  span: number;
}

// ── Marks ──────────────────────────────────────────────────────────────────

/**
 * The dot states this app can derive HONESTLY.
 *
 * The handoff legend has five keys — taught · planned · needs work · missed ·
 * target (`ph-units.jsx:523`). "target" is DROPPED here: it renders
 * `u.target` (`ph-units.jsx:598`), which needs `units.target_slot`, a column
 * adjudicated out of migration 20260728120000 (`:333-335`). Painting a target
 * marker with no target data would be a fabricated stat.
 *
 * The remaining four are all derived, never stored — `LessonStatus` is NOT
 * widened (audit §C1: "the design's five dot states are not five status
 * values").
 */
export type DotState = "taught" | "planned" | "needs_work" | "missed";

/**
 * Three-tier fork differentiation (CLAUDE.md §2), which the handoff's dot
 * class list omits entirely (`ph-units.jsx:609-611` is exhaustively
 * `st-<status> missed thin drag dim`). CLAUDE.md outranks the handoff here.
 */
export type ForkTier = "master" | "modified" | "moved" | "both";

/** One lesson, positioned on a lane. */
export interface TimelineDot {
  lessonId: string;
  unitId: string;
  /** Plain-text title (HTML already stripped by the builder). */
  title: string;
  slot: number;
  state: DotState;
  fork: ForkTier;
  /** Position within the group of dots sharing this slot on this lane. */
  stackIndex: number;
  /** How many dots share this slot on this lane (1 = unstacked). */
  stackSize: number;
}

/** Where a band's start/end came from — surfaced so the UI never implies a
 *  precision the data does not have. */
export type SpanSource = "weeks" | "lessons";

/** One unit, as a band spanning a slot range on a lane. */
export interface TimelineBand {
  unitId: string;
  name: string;
  startSlot: number;
  endSlot: number;
  /** Anchor-stacking row: overlapping units in one lane stack rather than
   *  overdraw (the level-packing loop at `ph-units.jsx:565-567`). */
  level: number;
  /** Lessons with no planning gap — the handoff's `ready/total` readout. */
  ready: number;
  /** Lessons already taught. */
  taught: number;
  total: number;
  spanSource: SpanSource;
  /**
   * The band's 1-based inclusive ACADEMIC-WEEK range — the only granularity a
   * drag can author (see ./drag.ts), and the value a drag starts from.
   *
   * Carried separately from `startSlot`/`endSlot` rather than recovered from
   * them at the callsite. The slots are CLAMPED to the axis, so a unit stored
   * for weeks 38–45 in a 40-week year draws as 38–40 — and a drag that read
   * its origin off the drawn geometry would silently truncate the unit to the
   * visible part the moment it was nudged one week. This is the stored range,
   * unclamped.
   */
  weekRange: WeekRange;
  /**
   * How many of the unit's lessons fall OUTSIDE `weekRange`.
   *
   * Not an error: a unit's declared weeks and its lessons' dates are separately
   * editable facts, and a week-granularity drag moves the former without
   * touching the latter (deliberately — see ./drag.ts). This is the count that
   * keeps that divergence visible on the band instead of leaving a teacher to
   * notice that the bar and its own dots have come apart.
   */
  lessonsOutside: number;
}

/** One subject row of the timeline. */
export interface TimelineLane {
  subject: SubjectId;
  /** Subject display name. */
  name: string;
  /** Subject palette class (`Subject.cls`) for the `cp-subj` cascade. */
  cls: string;
  bands: TimelineBand[];
  dots: TimelineDot[];
  /** Stacking depth: 1 when no units overlap, N when N deep. */
  levels: number;
  /**
   * The unit today actually falls INSIDE — the handoff's "Now: <unit>"
   * subtitle (`ph-units.jsx:572`).
   *
   * Strictly containing. The handoff takes `units.find(u => u.endSlot >=
   * TODAY_SLOT) || units[0]` (`:474`), which in the gap between two units
   * labels the NEXT one "Now:" — a unit the teacher is not teaching. Null in a
   * gap; `upcomingUnitName` carries that case instead.
   */
  currentUnitName: string | null;
  /** The next unit that has not started yet, surfaced only when today is in a
   *  gap (or before the first unit) so the lane still orients. Null whenever
   *  `currentUnitName` is set, or when today has no known position. */
  upcomingUnitName: string | null;
  /** Deepest same-day dot stack in this lane. Drives the lane's height: at a
   *  coarse pointer each dot needs a 44px target, so N stacked dots need N×44px
   *  of vertical room or their hit areas overlap and the lower ones become
   *  untappable. */
  maxDotStack: number;
  /** Units in this subject that carry NO week range and NO dated lesson, so
   *  they cannot be placed on the axis. Counted rather than silently dropped;
   *  the true home for these is the Bench, which needs a migration
   *  (audit §C2, "dateless draft"). */
  undatedUnits: number;
  /**
   * Lessons in this subject whose `week`/`day` cannot address a real column —
   * counted, never placed.
   *
   * The case that matters is a RECONFIGURED SCHOOL WEEK: a lesson saved on
   * day 4 of a 5-day week keeps `day: 4` after the school moves to a 4-day
   * week, and `(week - 1) * 4 + 4` is day 0 of the FOLLOWING week. Rendering it
   * there would show the teacher a lesson on a date it is not on, and could
   * mark it missed a week early. CLAUDE.md §1 makes the school week
   * configurable, so this is a supported transition, not a corrupt row.
   */
  unplaceableLessons: number;
}
