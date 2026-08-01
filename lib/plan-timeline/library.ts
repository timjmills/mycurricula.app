// plan-timeline/library.ts — the Plan drawer's three bodies, as pure data.
//
// The handoff's planning drawer (`ph-drawer.jsx`, mounted under the timeline at
// `ph-units.jsx:643-645`) carries a Unit Library, a Lesson Library and a Needs
// Attention summary. This module derives all three; the drawer component only
// renders them, so the grouping / filtering / sorting / triage rules are
// testable without a browser.
//
// ── EVERY ROW IS DERIVED FROM DATA THAT ALREADY EXISTS ────────────────────
// Nothing here needs a migration, and nothing here invents a metric. The
// triage predicates are the SAME ones the canvas already draws with
// (`dots.ts:dotStateFor`, `planningGapCount`, `drag.ts:lessonsOutsideRange`),
// so a lesson can never be "missed" in the drawer and "planned" on the
// timeline eighty pixels above it.
//
// ── THE HANDOFF'S FOUR TRIAGE PREDICATES, AND WHERE EACH LANDED ───────────
// `issuesOf` (`ph-drawer.jsx:28-49`) raises four things. Three are here:
//
//   • missed          → `missed`        (:31-33)
//   • running late    → `running_late`  (:34-38)
//   • barely planned  → `thin`          (:39-42), but PER LESSON rather than
//     as one "N upcoming lessons are barely planned" row per unit. A teacher
//     acting on that row has to go and find which N; the per-lesson rows open
//     the lesson that is thin. NOTE the handoff's own copy here is off by one
//     — its predicate is `PW.comp(l)<=1` and its sentence says "(2 sections or
//     fewer)". Ours has no such split: the predicate is `planningGapCount >= 2`
//     and the sentence names the same number it tested.
//   • dateless drafts → NOT BUILT, see below.
//
// ── ONE THING THE HANDOFF HAS THAT THIS DOES NOT ──────────────────────────
// The handoff's Needs Attention also lists DATELESS DRAFTS — lessons on the
// bench, with no date at all. That shape is not storable: the schema makes
// `week_number`, `day_of_week` and `unit_id` all NOT NULL
// (20260518102823_initial_schema.sql:396-399), and the shipped "unfiled" means
// *no unit*, never *no date* (audit §C2, where the row is marked MIGRATION and
// "nobody has scoped this"). What CAN be told truthfully is the adjacent
// thing — lessons whose date no longer addresses a real column — so
// `off_calendar` is that, named for what it actually is.

import type { Lesson, Subject, SubjectId, Unit } from "@/lib/types";
import { stripHtml } from "@/lib/html-text";
import { slotOf } from "./axis";
import { unitWeekRange, type WeekRange } from "./bands";
import { axisWeekCount, lessonsOutsideRange, weeksLabel } from "./drag";
import {
  dotStateFor,
  forkTierFor,
  planningGapCount,
  type NowRef,
} from "./dots";
import type { DotState, ForkTier } from "./types";

// ── Rows ───────────────────────────────────────────────────────────────────

/** One lesson in the Lesson Library. */
export interface LibraryLesson {
  lessonId: string;
  title: string;
  subject: SubjectId;
  subjectName: string;
  /** The unit slug the lesson claims. */
  unitId: string;
  /** The unit's display name, or null when the slug resolves to no unit — the
   *  shipped "unfiled" case, which the timeline draws but the prototype drops
   *  (it only walks `unit.lessons`, `ph-units.jsx:602`). */
  unitName: string | null;
  week: number;
  day: number;
  /** Flat axis slot, or null when this lesson has no column at all — see
   *  `placeable` below. */
  slot: number | null;
  /** Can this lesson be drawn on the axis? False after a school-week change
   *  leaves its `day` past the end of the week, or when its week falls outside
   *  the configured year. */
  placeable: boolean;
  state: DotState;
  fork: ForkTier;
  /** How many of the three planning axes are missing (`planningGapCount`). */
  gaps: number;
}

/** One unit in the Unit Library. */
export interface LibraryUnit {
  unitId: string;
  name: string;
  subject: SubjectId;
  subjectName: string;
  /** The stored week range, or null when the unit declares none. */
  weekRange: WeekRange | null;
  total: number;
  ready: number;
  taught: number;
  /** Lessons dated outside the unit's own declared weeks — see `drag.ts`. */
  lessonsOutside: number;
  /**
   * The unit declares a week range that lies wholly outside the configured
   * academic year, so it has no place on the timeline at all.
   *
   * NOT prevented at the write seam, deliberately. A stored range does not go
   * out of range by being written — it goes out of range when someone SHORTENS
   * the academic year in Settings, with no write involved at all. Refusing the
   * write would therefore fix nothing and would make a legitimately-stored unit
   * unwritable after a config change. Surfacing it is the honest treatment, and
   * it is what `lanes.ts:129` already does on the canvas (counting the unit
   * under "N unscheduled"); this is the drawer's half of the same fact, which
   * otherwise showed a confident "Wk 999–1000" for a unit nothing can display.
   */
  offAxis: boolean;
}

/** Why an item needs attention. Each maps to exactly one predicate. */
export type AttentionKind =
  | "missed"
  | "running_late"
  | "thin"
  | "off_calendar"
  | "unscheduled_unit"
  | "off_axis_unit"
  | "outside_range";

/**
 * How soon a teacher has to care. The handoff's three buckets
 * (`ph-drawer.jsx:47`, `rank={urgent:0,soon:1,quality:2}`), kept at three
 * rather than grown a fourth — the sort rank and the section headings are the
 * same axis and splitting them would put the same list in two orders.
 */
export type AttentionSeverity = "urgent" | "soon" | "quality";

/** One row of the Needs Attention list. */
export interface AttentionItem {
  kind: AttentionKind;
  severity: AttentionSeverity;
  subject: SubjectId;
  /** What it is. */
  title: string;
  /** Why it is here, in a teacher's words. */
  detail: string;
  /** What opening this row should open. */
  target: { kind: "lesson" | "unit"; id: string };
}

/**
 * Which bucket each predicate falls in.
 *
 * `missed` is the only URGENT kind: a date has gone by. `running_late` is the
 * only SOON kind: nothing is wrong yet and something will be. Everything else
 * is a plan a teacher would want to improve but that no date is forcing.
 */
const SEVERITY_OF: Readonly<Record<AttentionKind, AttentionSeverity>> = {
  missed: "urgent",
  running_late: "soon",
  thin: "quality",
  off_calendar: "quality",
  off_axis_unit: "quality",
  outside_range: "quality",
  unscheduled_unit: "quality",
};

/**
 * The heading each bucket renders under.
 *
 * The third is NOT the handoff's "Planning quality" (`ph-drawer.jsx:81`). That
 * label is true of `thin` and false of the four calendar kinds underneath it —
 * a unit whose weeks fall outside the academic year is not a quality problem,
 * and a heading that misdescribes half its own rows is the exact failure this
 * surface keeps being audited for. "Worth a look" is true of all five.
 */
export const ATTENTION_SEVERITY_LABEL: Readonly<
  Record<AttentionSeverity, string>
> = {
  urgent: "Urgent",
  soon: "Coming up",
  quality: "Worth a look",
};

/**
 * The verb on each row's action button.
 *
 * The handoff puts `title={is.act}` on this button (`ph-drawer.jsx:228`) — a
 * tooltip that restates its own label, which CLAUDE.md §4 forbids outright
 * ("a tooltip that restates the label adds noise without teaching"). The label
 * is here; the explanation is `ATTENTION_ACTION_HINT` below, and says what
 * pressing it accomplishes.
 */
export const ATTENTION_ACTION_LABEL: Readonly<Record<AttentionKind, string>> = {
  missed: "Review",
  running_late: "Open unit",
  thin: "Plan it",
  off_calendar: "Open lesson",
  off_axis_unit: "Open unit",
  outside_range: "Open unit",
  unscheduled_unit: "Open unit",
};

export const ATTENTION_ACTION_HINT: Readonly<Record<AttentionKind, string>> = {
  missed:
    "Opens this lesson, where you can mark it taught, or leave it for Catch-Up to pick up.",
  running_late:
    "Opens this unit's planner, where you can give it more weeks or move lessons out of it.",
  thin: "Opens this lesson so you can add what it is still missing.",
  off_calendar:
    "Opens this lesson. Its week and weekday are the fields to change — Settings → Calendar is what decides which ones exist.",
  off_axis_unit:
    "Opens this unit's planner, where its week range can be moved back inside the academic year.",
  outside_range:
    "Opens this unit's planner, where its week range can be widened to cover the lessons already dated outside it.",
  unscheduled_unit:
    "Opens this unit's planner, where a week range will give it a place on the timeline.",
};

// ── Controls ───────────────────────────────────────────────────────────────

export type LibraryGroup = "subject" | "unit" | "status";
export type LibraryStatusFilter =
  | "all"
  | "ready"
  | "needs_work"
  | "taught"
  | "not_yet";
export type LibrarySort = "schedule" | "title" | "status";

/** Label for each status filter — exported so the control and any test read
 *  one source rather than two drifting string literals. */
export const LIBRARY_STATUS_LABEL: Readonly<
  Record<LibraryStatusFilter, string>
> = {
  all: "All",
  ready: "Ready",
  needs_work: "Needs work",
  taught: "Taught",
  not_yet: "Not yet",
};

export const LIBRARY_GROUP_LABEL: Readonly<Record<LibraryGroup, string>> = {
  subject: "Subject",
  unit: "Unit",
  status: "Status",
};

export const LIBRARY_SORT_LABEL: Readonly<Record<LibrarySort, string>> = {
  schedule: "Schedule",
  title: "Title",
  status: "Status",
};

// ── Builders ───────────────────────────────────────────────────────────────

export interface BuildLibraryInput {
  subjects: readonly Subject[];
  units: readonly Unit[];
  lessons: readonly Lesson[];
  schoolWeekLen: number;
  axisLength: number;
  now: NowRef | null;
  /** Section-aware resource predicate — see `dots.ts:planningGapCount`. */
  hasResources?: (lesson: Lesson) => boolean;
  /** Is this slot a configured holiday? A lesson parked on a "no school"
   *  column could not have been taught, so it is never called missed. */
  isHolidaySlot?: (slot: number) => boolean;
}

/**
 * What the running-late predicate needs and nothing else.
 *
 * Deliberately NOT `BuildLibraryInput`: this is asked at a different moment
 * (after the rows exist) and about a different thing (where today is), and
 * threading the whole input through would let a caller pass a `now` that
 * disagrees with the one the rows were already built with.
 */
export interface PaceContext {
  /** Today's flat axis slot. Only ever non-null when `NowRef` was. */
  todaySlot: number;
  schoolWeekLen: number;
  /** Same predicate the axis and `dotStateFor` use — a holiday is not a
   *  teaching day, so it must not be counted as one. */
  isHolidaySlot?: (slot: number) => boolean;
}

/** Key a unit by subject + slug: a slug is unique only WITHIN a subject, so a
 *  flat map would collide two units across two lanes (lanes.ts:35-40). */
function unitKey(subject: string, unitId: string): string {
  return `${subject}\n${unitId}`;
}

export function buildLessonLibrary(
  input: BuildLibraryInput,
): LibraryLesson[] {
  const {
    subjects,
    units,
    lessons,
    schoolWeekLen,
    axisLength,
    now,
    hasResources,
    isHolidaySlot,
  } = input;

  const subjectName = new Map<string, string>(
    subjects.map((s) => [s.id, s.name]),
  );
  const unitName = new Map<string, string>(
    units.filter((u) => !u.archived).map((u) => [unitKey(u.subject, u.id), u.name]),
  );

  const rows: LibraryLesson[] = [];
  for (const l of lessons) {
    if (l.archived) continue;
    // Identical placeability test to lanes.ts:78-94 — one rule, so a lesson
    // cannot be off-calendar in the drawer and on the axis in the canvas.
    const placeable =
      Number.isInteger(l.week) &&
      l.week >= 1 &&
      Number.isInteger(l.day) &&
      l.day >= 0 &&
      l.day < schoolWeekLen &&
      slotOf(l.week, l.day, schoolWeekLen) < axisLength;
    const slot = placeable ? slotOf(l.week, l.day, schoolWeekLen) : null;
    rows.push({
      lessonId: l.id,
      title: stripHtml(l.title),
      subject: l.subject,
      subjectName: subjectName.get(l.subject) ?? l.subject,
      unitId: l.unit,
      unitName: unitName.get(unitKey(l.subject, l.unit)) ?? null,
      week: l.week,
      day: l.day,
      slot,
      placeable,
      // An UNPLACEABLE lesson gets its state derived too, but never the
      // holiday exemption — there is no column to ask about. It cannot be
      // "missed" either, because `isPastLesson` compares slots and this one has
      // no meaningful slot; that under-claims, which is the direction
      // dots.ts:NowRef already argues for.
      state: dotStateFor(l, placeable ? now : null, {
        hasResources,
        onHoliday: slot !== null ? (isHolidaySlot?.(slot) ?? false) : false,
      }),
      fork: forkTierFor(l),
      gaps: planningGapCount(l, hasResources),
    });
  }
  return rows;
}

export function buildUnitLibrary(input: BuildLibraryInput): LibraryUnit[] {
  const { subjects, units, lessons, hasResources, schoolWeekLen, axisLength } =
    input;
  const maxWeek = axisWeekCount(axisLength, schoolWeekLen);
  const subjectName = new Map<string, string>(
    subjects.map((s) => [s.id, s.name]),
  );
  const byUnit = new Map<string, Lesson[]>();
  for (const l of lessons) {
    if (l.archived) continue;
    const key = unitKey(l.subject, l.unit);
    const list = byUnit.get(key);
    if (list) list.push(l);
    else byUnit.set(key, [l]);
  }

  const rows: LibraryUnit[] = [];
  for (const u of units) {
    if (u.archived) continue;
    const unitLessons = byUnit.get(unitKey(u.subject, u.id)) ?? [];
    let ready = 0;
    let taught = 0;
    for (const l of unitLessons) {
      if (planningGapCount(l, hasResources) === 0) ready += 1;
      if (l.status === "done") taught += 1;
    }
    const weekRange = unitWeekRange(u);
    rows.push({
      unitId: u.id,
      name: u.name,
      subject: u.subject,
      subjectName: subjectName.get(u.subject) ?? u.subject,
      weekRange,
      total: unitLessons.length,
      ready,
      taught,
      // Only meaningful against a DECLARED range. Measuring it against a
      // lesson-derived one is circular — it is zero by construction — and
      // would let a unit with no schedule at all report "0 outside" as if that
      // were a clean bill of health.
      lessonsOutside: weekRange
        ? lessonsOutsideRange(unitLessons, weekRange)
        : 0,
      offAxis:
        weekRange !== null &&
        maxWeek > 0 &&
        (weekRange.start > maxWeek || weekRange.end < 1),
    });
  }
  return rows;
}

/**
 * The Needs Attention list.
 *
 * Ordered by how much a teacher can do about it, soonest first: a missed
 * lesson is already behind them; a thin lesson is ahead of them; the last three
 * are configuration problems that make the plan misrepresent itself.
 */
export function buildNeedsAttention(
  lessonRows: readonly LibraryLesson[],
  unitRows: readonly LibraryUnit[],
  pace: PaceContext | null = null,
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const l of lessonRows) {
    if (l.state === "missed") {
      items.push({
        kind: "missed",
        severity: SEVERITY_OF.missed,
        subject: l.subject,
        title: l.title || "Untitled lesson",
        detail: `Week ${l.week} has passed and this lesson is not marked taught.`,
        target: { kind: "lesson", id: l.lessonId },
      });
    } else if (l.state === "needs_work") {
      // "else if", not a second push: a missed lesson is ALSO thin (that is
      // what `dotStateFor` used to decide it was missed), and listing it twice
      // would inflate the count a teacher is trying to work through.
      items.push({
        kind: "thin",
        severity: SEVERITY_OF.thin,
        subject: l.subject,
        title: l.title || "Untitled lesson",
        detail: `Missing ${l.gaps} of an objective, a resource and a standard.`,
        target: { kind: "lesson", id: l.lessonId },
      });
    }
    if (!l.placeable) {
      items.push({
        kind: "off_calendar",
        severity: SEVERITY_OF.off_calendar,
        subject: l.subject,
        title: l.title || "Untitled lesson",
        detail: `Dated week ${l.week}, day ${l.day + 1} — which this school week and academic year no longer have, so it has no place on the timeline.`,
        target: { kind: "lesson", id: l.lessonId },
      });
    }
  }

  // Pre-group the lessons by unit ONCE. The running-late predicate needs each
  // unit's own lessons, and re-filtering `lessonRows` inside the unit loop is
  // the quadratic shape this surface can least afford — a grade carries ~1250
  // lessons against ~90 units.
  const lessonsByUnit = new Map<string, LibraryLesson[]>();
  if (pace) {
    for (const l of lessonRows) {
      const key = unitKey(l.subject, l.unitId);
      const list = lessonsByUnit.get(key);
      if (list) list.push(l);
      else lessonsByUnit.set(key, [l]);
    }
  }

  for (const u of unitRows) {
    // ── Running late (`ph-drawer.jsx:34-38`) ───────────────────────────────
    // The one predicate in the handoff's `issuesOf` that has no counterpart
    // here: a unit currently being taught with more untaught lessons left than
    // it has teaching days left to teach them in.
    //
    // It fires ONLY with a known today (`pace !== null`). Without one there is
    // no "late" — `NowRef` is null whenever `currentWeekBasis` is not
    // "in-range", i.e. before the year starts, after it ends, or unconfigured,
    // and a verdict drawn against a clamped week would call units late that
    // are not (the same trap dots.ts:NowRef exists to avoid).
    if (pace && u.weekRange && !u.offAxis) {
      const startSlot = (u.weekRange.start - 1) * pace.schoolWeekLen;
      const endSlot = u.weekRange.end * pace.schoolWeekLen - 1;
      if (startSlot <= pace.todaySlot && endSlot >= pace.todaySlot) {
        const mine = lessonsByUnit.get(unitKey(u.subject, u.unitId)) ?? [];
        const remaining = mine.filter(
          (l) =>
            l.state !== "taught" && l.slot !== null && l.slot >= pace.todaySlot,
        ).length;
        // INSTRUCTIONAL days, not calendar slots: the handoff counts
        // `endSlot - TODAY + 1` flat (`:35`), which counts a two-week holiday
        // as ten teaching days and so tells a teacher they have time they do
        // not have. Every slot on this axis is already a school day; the
        // holidays among them are the only ones to drop.
        let daysLeft = 0;
        for (let s = pace.todaySlot; s <= endSlot; s++) {
          if (!pace.isHolidaySlot?.(s)) daysLeft += 1;
        }
        if (remaining > daysLeft) {
          items.push({
            kind: "running_late",
            severity: SEVERITY_OF.running_late,
            subject: u.subject,
            title: u.name,
            detail: `${remaining} lesson${remaining === 1 ? "" : "s"} still to teach, but only ${daysLeft} teaching day${daysLeft === 1 ? "" : "s"} left before this unit's weeks run out.`,
            target: { kind: "unit", id: u.unitId },
          });
        }
      }
    }

    if (u.offAxis && u.weekRange) {
      // Checked BEFORE the no-range case and instead of `outside_range`: a unit
      // parked past the end of the year would otherwise report "N lessons
      // dated outside Wk 999–1000", which is true, useless, and buries the
      // actual problem.
      items.push({
        kind: "off_axis_unit",
        severity: SEVERITY_OF.off_axis_unit,
        subject: u.subject,
        title: u.name,
        // THE shared formatter, never an inline literal: an inline
        // `Wk ${start}–${end}` has no `start === end` branch, so a one-week
        // unit read "Wk 12–12" here while its own unit card read "Wk 12".
        detail: `Set for ${weeksLabel(u.weekRange.start, u.weekRange.end)}, which is outside this academic year — it has no place on the timeline.`,
        target: { kind: "unit", id: u.unitId },
      });
    } else if (!u.weekRange) {
      items.push({
        kind: "unscheduled_unit",
        severity: SEVERITY_OF.unscheduled_unit,
        subject: u.subject,
        title: u.name,
        detail:
          u.total === 0
            ? "No week range and no lessons yet."
            : `No week range set — it is placed from the ${u.total} lesson${u.total === 1 ? "" : "s"} inside it.`,
        target: { kind: "unit", id: u.unitId },
      });
    } else if (u.lessonsOutside > 0) {
      items.push({
        kind: "outside_range",
        severity: SEVERITY_OF.outside_range,
        subject: u.subject,
        title: u.name,
        detail: `${u.lessonsOutside} lesson${u.lessonsOutside === 1 ? "" : "s"} dated outside ${weeksLabel(u.weekRange.start, u.weekRange.end)}.`,
        target: { kind: "unit", id: u.unitId },
      });
    }
  }

  // SEVERITY FIRST, then the kind's own rank inside it. The handoff sorts on
  // severity alone (`ph-drawer.jsx:47-48`), which leaves the order of two
  // quality rows down to whatever order the units happened to be built in;
  // keeping the kind rank as the tiebreak means the list is stable and the
  // section headings below still group cleanly, because every kind belongs to
  // exactly one severity.
  const severityRank: Record<AttentionSeverity, number> = {
    urgent: 0,
    soon: 1,
    quality: 2,
  };
  const rank: Record<AttentionKind, number> = {
    missed: 0,
    running_late: 1,
    thin: 2,
    off_calendar: 3,
    off_axis_unit: 4,
    outside_range: 5,
    unscheduled_unit: 6,
  };
  return items.sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] ||
      rank[a.kind] - rank[b.kind] ||
      a.title.localeCompare(b.title),
  );
}

/** Group an already-sorted list by severity, dropping empty buckets. The
 *  order is the list's own order, so the sections cannot disagree with the
 *  sort above them. */
export function groupAttention(
  items: readonly AttentionItem[],
): { severity: AttentionSeverity; label: string; items: AttentionItem[] }[] {
  const out: {
    severity: AttentionSeverity;
    label: string;
    items: AttentionItem[];
  }[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (last && last.severity === item.severity) last.items.push(item);
    else
      out.push({
        severity: item.severity,
        label: ATTENTION_SEVERITY_LABEL[item.severity],
        items: [item],
      });
  }
  return out;
}

// ── Filter / sort / group ──────────────────────────────────────────────────

/**
 * Apply the Status control.
 *
 * "Ready" is `gaps === 0`, NOT `state === "planned"` — a taught lesson can also
 * be fully planned, and a filter that hid it would tell a teacher checking
 * their preparation that work they did does not exist.
 */
export function filterLessons(
  rows: readonly LibraryLesson[],
  status: LibraryStatusFilter,
): LibraryLesson[] {
  switch (status) {
    case "all":
      return [...rows];
    case "ready":
      return rows.filter((r) => r.gaps === 0);
    case "needs_work":
      return rows.filter((r) => r.state === "needs_work" || r.state === "missed");
    case "taught":
      return rows.filter((r) => r.state === "taught");
    case "not_yet":
      return rows.filter((r) => r.state !== "taught");
  }
}

/** Sort order within a group. */
export function sortLessons(
  rows: readonly LibraryLesson[],
  by: LibrarySort,
): LibraryLesson[] {
  const out = [...rows];
  if (by === "title") {
    return out.sort((a, b) => a.title.localeCompare(b.title));
  }
  if (by === "status") {
    const rank: Record<DotState, number> = {
      missed: 0,
      needs_work: 1,
      planned: 2,
      taught: 3,
    };
    return out.sort(
      (a, b) => rank[a.state] - rank[b.state] || bySchedule(a, b),
    );
  }
  return out.sort(bySchedule);
}

/** Unplaceable lessons sort LAST rather than to slot 0. Sorting them to the
 *  front of the year would put the rows a teacher can do least about at the top
 *  of every schedule-sorted list. */
function bySchedule(a: LibraryLesson, b: LibraryLesson): number {
  if (a.slot === null && b.slot === null) return a.title.localeCompare(b.title);
  if (a.slot === null) return 1;
  if (b.slot === null) return -1;
  return a.slot - b.slot || a.title.localeCompare(b.title);
}

/** One rendered group of the library list. */
export interface LibraryGroupResult {
  key: string;
  label: string;
  rows: LibraryLesson[];
}

/** Group the (already filtered + sorted) rows. Group ORDER follows the first
 *  row of each group, so a schedule-sorted list stays in schedule order at the
 *  group level too rather than jumping to alphabetical. */
export function groupLessons(
  rows: readonly LibraryLesson[],
  by: LibraryGroup,
): LibraryGroupResult[] {
  const groups = new Map<string, LibraryGroupResult>();
  for (const r of rows) {
    const { key, label } = groupOf(r, by);
    const existing = groups.get(key);
    if (existing) existing.rows.push(r);
    else groups.set(key, { key, label, rows: [r] });
  }
  return [...groups.values()];
}

function groupOf(
  row: LibraryLesson,
  by: LibraryGroup,
): { key: string; label: string } {
  if (by === "unit") {
    return {
      key: `${row.subject}\n${row.unitId}`,
      // A lesson whose unit slug resolves to nothing is NAMED as such rather
      // than filed under its own slug, which would read as a real unit.
      label: row.unitName ?? `${row.subjectName} · Unfiled`,
    };
  }
  if (by === "status") {
    return { key: row.state, label: DOT_STATE_GROUP_LABEL[row.state] };
  }
  return { key: row.subject, label: row.subjectName };
}

const DOT_STATE_GROUP_LABEL: Readonly<Record<DotState, string>> = {
  missed: "Missed",
  needs_work: "Needs work",
  planned: "Planned",
  taught: "Taught",
};
