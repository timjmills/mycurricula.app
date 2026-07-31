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
import { lessonsOutsideRange } from "./drag";
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
}

/** Why an item needs attention. Each maps to exactly one predicate. */
export type AttentionKind =
  | "missed"
  | "thin"
  | "off_calendar"
  | "unscheduled_unit"
  | "outside_range";

/** One row of the Needs Attention list. */
export interface AttentionItem {
  kind: AttentionKind;
  subject: SubjectId;
  /** What it is. */
  title: string;
  /** Why it is here, in a teacher's words. */
  detail: string;
  /** What opening this row should open. */
  target: { kind: "lesson" | "unit"; id: string };
}

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
  const { subjects, units, lessons, hasResources } = input;
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
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const l of lessonRows) {
    if (l.state === "missed") {
      items.push({
        kind: "missed",
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
        subject: l.subject,
        title: l.title || "Untitled lesson",
        detail: `Missing ${l.gaps} of an objective, a resource and a standard.`,
        target: { kind: "lesson", id: l.lessonId },
      });
    }
    if (!l.placeable) {
      items.push({
        kind: "off_calendar",
        subject: l.subject,
        title: l.title || "Untitled lesson",
        detail: `Dated week ${l.week}, day ${l.day + 1} — which this school week and academic year no longer have, so it has no place on the timeline.`,
        target: { kind: "lesson", id: l.lessonId },
      });
    }
  }

  for (const u of unitRows) {
    if (!u.weekRange) {
      items.push({
        kind: "unscheduled_unit",
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
        subject: u.subject,
        title: u.name,
        detail: `${u.lessonsOutside} lesson${u.lessonsOutside === 1 ? "" : "s"} dated outside Wk ${u.weekRange.start}–${u.weekRange.end}.`,
        target: { kind: "unit", id: u.unitId },
      });
    }
  }

  const rank: Record<AttentionKind, number> = {
    missed: 0,
    thin: 1,
    off_calendar: 2,
    outside_range: 3,
    unscheduled_unit: 4,
  };
  return items.sort(
    (a, b) => rank[a.kind] - rank[b.kind] || a.title.localeCompare(b.title),
  );
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
