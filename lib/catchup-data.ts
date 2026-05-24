// catchup-data.ts — types and derivation helpers for the Catch-up feature.
//
// In production a CatchupItem is the projection of a CoreLessonEvent that
// did not complete: each item carries the originally scheduled day, the
// teacher's last-known status, and how late the item is relative to "today".
// While the backend isn't wired we derive the same shape from the mock
// `LESSONS` fixture so every Catch-up surface reads from a single source.
//
// This module is the **type root** for the feature — both `lib/catchup-state`
// (the Provider) and every component under `components/catchup/` import their
// vocabulary from here. Keeping the dependency arrow one-way (state → data,
// components → data, components → state) avoids the import cycle that
// otherwise plagues "Provider co-located with types" stores.

import { UNITS, WEEK_DAYS_SHORT } from "@/lib/mock";
import type { Lesson, LessonStatus, SubjectId } from "@/lib/types";

// ── Action vocabulary ────────────────────────────────────────────────────

/** The local action a teacher has taken on a single uncovered item. Distinct
 *  from a Lesson's persisted status — these are overlays the Catch-up screen
 *  applies until the underlying lesson reflects the same state. */
export type CatchupActionKind = "done" | "skipped" | "carried";

export interface CatchupAction {
  kind: CatchupActionKind;
  /** When kind === "carried", an optional "wk{N}:d{0-4}" target,
   *  e.g. "wk13:d1". Empty string means "decide later — destination TBD". */
  carriedTo?: string;
}

/** Apply a CatchupActionKind to a base LessonStatus and return the
 *  effective status. Pure — exported so both the data filter and any UI
 *  needing the projection share the same rule. */
export function applyCatchupAction(
  base: LessonStatus,
  action: CatchupActionKind,
): LessonStatus {
  // The action overlay always wins — that's the whole point of recording it
  // ahead of the lesson-level mutation.
  switch (action) {
    case "done":
      return "done";
    case "skipped":
      return "skipped";
    case "carried":
      return "carried";
    default:
      return base;
  }
}

// ── Item shape ───────────────────────────────────────────────────────────

/** The projected uncovered/incomplete lesson surfaced in the Catch-up
 *  screen, the in-grid bar, and the top-bar flame badge. Keep this shape
 *  aligned with the type sketched in the handoff README — production
 *  swaps the source from LESSONS to a CoreLessonEvent + CompletionStatus
 *  query without changing the consumer code. */
export interface CatchupItem {
  /** The underlying Lesson.id this item points at. */
  lessonId: string;
  subject: SubjectId;
  /** Display name of the unit, e.g. "Unit 3 · Fractions on a Number Line". */
  unit: string;
  /** Display label for the day, e.g. "Tue · Wk 11". The artboard formats
   *  this as "Tue · Nov 3" once real dates land; while only week numbers
   *  exist in the mock we render against the week index. */
  dayLabel: string;
  week: number;
  /** Day index 0..4 in the school week. */
  day: number;
  title: string;
  preview: string;
  /** The lesson's effective status — layered with any per-item Catch-up
   *  action overlay (see resolveStatus below). One of: not_done | skipped
   *  | partial | carried. The "done" status is excluded because a done
   *  lesson is, by definition, covered. */
  status: Exclude<LessonStatus, "done">;
  /** CCSS or equivalent codes attached to the lesson. */
  standards: string[];
  /** Resource count — handoff fixture treats this as a number so the row
   *  can render a "📎 N" chip without instantiating each resource. */
  resources: number;
  /** Teacher-supplied note about why this didn't happen, if any. */
  reasonNotDone: string;
  /** How many instructional days late the item is. Negative is impossible
   *  (we don't surface future items here) — clamped to 0 if computed lower. */
  daysLate: number;
  isPersonal: boolean;
  modified: boolean;
}

// ── Filters / groupings ──────────────────────────────────────────────────

export type CatchupScope = "lastWeek" | "last4" | "term" | "year";
export type CatchupGroupBy = "subject" | "chrono" | "standard" | "unit";

/** Five instructional days per week — the mock school runs Sun–Thu. The
 *  schedule is configurable in production (CLAUDE.md §1), but every
 *  fixture in the repo assumes a 5-day instructional week today. */
const DAYS_PER_WEEK = 5;

// ── Derivation ───────────────────────────────────────────────────────────

interface DeriveOptions {
  /** The week the planner is currently focused on. Items at or beyond this
   *  week are excluded — they are upcoming, not uncovered. */
  currentWeek: number;
  /** Optional per-item action overlay (e.g. "Mark done"). When an action
   *  is present and resolves to "done", the item is dropped from the result. */
  actions?: Map<string, CatchupAction>;
}

/** Produce the CatchupItem[] for a given Lesson set. Filters to incomplete
 *  past-or-current items, layers the per-item action overlay, and computes
 *  the `daysLate` field. */
export function deriveCatchupItems(
  lessons: readonly Lesson[],
  opts: DeriveOptions,
): CatchupItem[] {
  const { currentWeek, actions } = opts;
  const out: CatchupItem[] = [];
  for (const lesson of lessons) {
    if (lesson.archived) continue;
    // Only past-or-current weeks are eligible; future weeks aren't "missed".
    if (lesson.week > currentWeek) continue;
    const action = actions?.get(lesson.id);
    const status = resolveStatus(lesson.status, action);
    if (status === "done") continue; // covered — skip
    out.push({
      lessonId: lesson.id,
      subject: lesson.subject,
      unit: UNITS[lesson.subject].name,
      dayLabel: formatDayLabel(lesson.day, lesson.week),
      week: lesson.week,
      day: lesson.day,
      title: lesson.title,
      preview: lesson.preview,
      status,
      standards: [...lesson.standards],
      resources: lesson.resources.length,
      reasonNotDone: lesson.reasonNotDone,
      daysLate: Math.max(
        0,
        (currentWeek - lesson.week) * DAYS_PER_WEEK +
          (DAYS_PER_WEEK - 1 - lesson.day),
      ),
      isPersonal: lesson.isPersonal,
      modified: lesson.modified,
    });
  }
  return out;
}

/** Resolve a lesson's effective status given an optional per-item action
 *  overlay. The overlay is the Catch-up screen's transient view of the
 *  teacher's last decision; the underlying Lesson.status is still the
 *  long-term truth (and is what gets persisted when the action is
 *  committed). */
export function resolveStatus(
  base: LessonStatus,
  action: CatchupAction | undefined,
): LessonStatus {
  if (!action) return base;
  return applyCatchupAction(base, action.kind);
}

// ── Scope filter ─────────────────────────────────────────────────────────

/** Filter a derived CatchupItem[] to the scope chip the teacher has
 *  selected. The handoff's defaults: scope = "last4". */
export function filterByScope(
  items: readonly CatchupItem[],
  scope: CatchupScope,
  currentWeek: number,
): CatchupItem[] {
  switch (scope) {
    case "lastWeek":
      return items.filter((i) => i.week === currentWeek - 1);
    case "last4":
      return items.filter(
        (i) => i.week >= currentWeek - 4 && i.week < currentWeek,
      );
    case "term":
      // "Term" in the mock means everything in the school year so far; we
      // don't have term boundaries wired yet, so this aliases to "year".
      return items.filter((i) => i.week < currentWeek);
    case "year":
      return items.filter((i) => i.week < currentWeek);
    default:
      return [...items];
  }
}

// ── Status filter ────────────────────────────────────────────────────────

/** Keep only items whose status falls in the active filter. An empty
 *  status set is treated as "show all" so the teacher can clear all
 *  chips without emptying the screen. */
export function filterByStatus(
  items: readonly CatchupItem[],
  statuses: ReadonlySet<CatchupItem["status"]>,
): CatchupItem[] {
  if (statuses.size === 0) return [...items];
  return items.filter((i) => statuses.has(i.status));
}

// ── Grouping ─────────────────────────────────────────────────────────────

export interface CatchupGroup {
  /** Group key used as the React render key. */
  key: string;
  /** Header label rendered above the group. */
  label: string;
  /** Optional subject hint — when set the group header tints to the subject
   *  color. Only the `subject` grouping populates this. */
  subject?: SubjectId;
  items: CatchupItem[];
}

/** Bucket items into ordered groups per the active group-by chip. Within
 *  a group items are sorted by week descending (recent first), then day
 *  descending — the same order the artboard renders. */
export function groupItems(
  items: readonly CatchupItem[],
  groupBy: CatchupGroupBy,
): CatchupGroup[] {
  const buckets = new Map<string, CatchupItem[]>();
  for (const item of items) {
    const key = bucketKey(item, groupBy);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  // Sort items within each bucket.
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => b.week - a.week || b.day - a.day);
  }

  const groups: CatchupGroup[] = [];
  for (const [key, bucketItems] of buckets) {
    groups.push({
      key,
      label: labelForGroup(key, groupBy, bucketItems),
      subject: groupBy === "subject" ? bucketItems[0]?.subject : undefined,
      items: bucketItems,
    });
  }

  // Sort groups themselves.
  groups.sort((a, b) => compareGroupKeys(a, b, groupBy));
  return groups;
}

function bucketKey(item: CatchupItem, groupBy: CatchupGroupBy): string {
  switch (groupBy) {
    case "subject":
      return `subject:${item.subject}`;
    case "chrono":
      return `week:${item.week}`;
    case "standard":
      return `standard:${item.standards[0] ?? "__untagged"}`;
    case "unit":
      return `unit:${item.unit}`;
  }
}

function labelForGroup(
  key: string,
  groupBy: CatchupGroupBy,
  items: CatchupItem[],
): string {
  switch (groupBy) {
    case "subject":
      return SUBJECT_LABEL[items[0].subject];
    case "chrono":
      return `Week ${items[0].week}`;
    case "standard":
      return key === "standard:__untagged"
        ? "Untagged"
        : key.replace(/^standard:/, "");
    case "unit":
      return items[0].unit;
  }
}

function compareGroupKeys(
  a: CatchupGroup,
  b: CatchupGroup,
  groupBy: CatchupGroupBy,
): number {
  switch (groupBy) {
    case "subject":
      // Stable subject order matches the mock fixture order.
      return (
        SUBJECT_ORDER.indexOf(a.subject!) - SUBJECT_ORDER.indexOf(b.subject!)
      );
    case "chrono":
      return b.items[0].week - a.items[0].week;
    case "standard":
      // Untagged sinks to the bottom.
      if (a.key === "standard:__untagged") return 1;
      if (b.key === "standard:__untagged") return -1;
      return a.label.localeCompare(b.label);
    case "unit":
      return a.label.localeCompare(b.label);
  }
}

// ── Coverage ────────────────────────────────────────────────────────────

export interface CoverageSummary {
  /** Lessons covered (status === "done" or an overlay resolved to "done"). */
  covered: number;
  /** Lessons surfaced as not yet covered. Equals items.length when no
   *  status filter is active. */
  uncovered: number;
  /** covered + uncovered — all past-or-current scheduled lessons. */
  total: number;
  /** Integer 0..100 — covered share of total. 0 when total is 0. */
  pct: number;
}

/** Summary stats for the Catch-up screen's coverage strip. Computed
 *  against the same lessons set the items derive from so the percentages
 *  stay consistent with the rendered list. */
export function coverageSummary(
  lessons: readonly Lesson[],
  opts: { currentWeek: number; actions?: Map<string, CatchupAction> },
): CoverageSummary {
  const { currentWeek, actions } = opts;
  let covered = 0;
  let total = 0;
  for (const lesson of lessons) {
    if (lesson.archived) continue;
    if (lesson.week > currentWeek) continue;
    total += 1;
    const action = actions?.get(lesson.id);
    const status = resolveStatus(lesson.status, action);
    if (status === "done") covered += 1;
  }
  const uncovered = total - covered;
  const pct = total === 0 ? 0 : Math.round((covered / total) * 100);
  return { covered, uncovered, total, pct };
}

// ── Per-week count (used by the in-grid bar + top-bar badge) ───────────

/** Count uncovered items for a specific week — feeds the per-week bar
 *  ("🔥 N items not covered") and the top-bar flame badge. */
export function countForWeek(
  lessons: readonly Lesson[],
  week: number,
  actions?: Map<string, CatchupAction>,
): number {
  let n = 0;
  for (const lesson of lessons) {
    if (lesson.archived) continue;
    if (lesson.week !== week) continue;
    const action = actions?.get(lesson.id);
    const status = resolveStatus(lesson.status, action);
    if (status === "done") continue;
    n += 1;
  }
  return n;
}

// ── Formatters ──────────────────────────────────────────────────────────

/** Format a day index + week as the artboard's "Tue · Wk 11" label. We
 *  use week numbers (not calendar dates) because the mock fixture is
 *  date-free — real dates substitute the week label when the backend
 *  lands. */
function formatDayLabel(day: number, week: number): string {
  const dayName = WEEK_DAYS_SHORT[day] ?? "—";
  return `${dayName} · Wk ${week}`;
}

// ── Status label + dot color (shared by row pill + filter chips) ───────

export const CATCHUP_STATUS_LABEL: Record<CatchupItem["status"], string> = {
  not_done: "Not done",
  partial: "Partial",
  skipped: "Skipped",
  carried: "Carry-over",
};

/** Token name used for the small dot in the status filter chips and the
 *  status pill on the row. Resolved at render time via `var(--token)`. */
export const CATCHUP_STATUS_TOKEN: Record<CatchupItem["status"], string> = {
  not_done: "--ink-300",
  partial: "--important",
  skipped: "--ink-400",
  carried: "--catchup",
};

// ── Subject order + labels (mirrors mock/subjects ordering) ────────────

const SUBJECT_ORDER: SubjectId[] = [
  "math",
  "reading",
  "writing",
  "grammar",
  "spelling",
  "ufli",
  "explorers",
  "sel",
];

const SUBJECT_LABEL: Record<SubjectId, string> = {
  math: "Math",
  reading: "Reading",
  writing: "Writing",
  grammar: "Grammar",
  spelling: "Spelling",
  ufli: "UFLI",
  explorers: "Explorers",
  sel: "SEL",
};
