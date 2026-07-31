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

// `import type` ONLY — erased at build, so this module gains no runtime edge to
// lib/week-order (a "use client" module) and stays importable from anywhere.
import type { OrderedWeekday } from "@/lib/week-order";
import type { Lesson, LessonStatus, SubjectId, Unit } from "@/lib/types";

// ── Action vocabulary ────────────────────────────────────────────────────

/** The local action a teacher has taken on a single uncovered item. Distinct
 *  from a Lesson's persisted status — these are overlays the Catch-up screen
 *  applies until the underlying lesson reflects the same state. */
export type CatchupActionKind = "done" | "skipped" | "carried";

export interface CatchupAction {
  kind: CatchupActionKind;
  /** When kind === "carried", an optional "wk{N}:d{i}" target, e.g. "wk13:d1",
   *  where `i` indexes the CONFIGURED school week (0 = the school's first day).
   *  The range is the configured week's length, not 0-4 — this doc said "d{0-4}"
   *  while `DAYS_PER_WEEK = 5` sat below it, and both assumed the beta school's
   *  Sun–Thu week (CLAUDE.md §1 forbids that). Nothing parses the string today:
   *  `lib/catchup-state` round-trips it opaquely and the only writer
   *  (CatchupScreen's "carry over") passes "". Whoever adds a destination picker
   *  owns the parse, and must read the day count from `useSchoolWeek()`.
   *  Empty string means "decide later — destination TBD". */
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
  /**
   * The lesson's POSITION in the configured school week — NOT a JS weekday.
   *
   * 0 is the school's FIRST instructional day, whatever weekday that happens to
   * be: Sunday for the Sun–Thu beta school, Monday for a Mon–Fri school. It is
   * never a `Date.getDay()` value and never an absolute Sun=0..Sat=6 index, so
   * it must NEVER be used to index a Sun-first weekday array — that is precisely
   * the bug this field's `dayLabel` carried, printing "Sun" against Mondays for
   * every school that does not start on Sunday.
   *
   * The range is 0..(configured week length - 1), NOT 0..4 as this doc used to
   * claim. To turn it into a weekday, index the ordered week the caller
   * supplies: `schoolWeek[day]` (see `useOrderedWeekdays()` in lib/week-order),
   * and handle the miss — a week that has since been SHORTENED leaves lessons
   * holding a position it no longer has.
   */
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

// ── Derivation ───────────────────────────────────────────────────────────

interface DeriveOptions {
  /** The week the planner is currently focused on. Items at or beyond this
   *  week are excluded — they are upcoming, not uncovered. */
  currentWeek: number;
  /**
   * The CONFIGURED school week as ordered day columns — `useOrderedWeekdays()`
   * at the callsite, which reads `useSchoolWeek()`.
   *
   * REQUIRED, deliberately. This used to be a module const `DAYS_PER_WEEK = 5`
   * plus `WEEK_DAYS_SHORT` from lib/mock, both locked to the beta school's
   * Sun–Thu week, and the comment on the const conceded it. CLAUDE.md §1 is
   * explicit that the school week is configured per school and that no calendar
   * surface may hard-code it. Two things were wrong, and only one of them was
   * invisible:
   *   • `dayLabel` IS rendered (CatchupRow, CatchUpBrowse), so a Mon–Fri school
   *     read "Sun · Wk 11" against a lesson that is on a Monday. `day` is an
   *     index INTO the configured week, not an absolute Sun=0..Sat=6 position,
   *     so indexing a Sun-first fixture array mislabels every column.
   *   • `daysLate` is not rendered today, so its 5-day arithmetic was wrong
   *     silently. It is computed here anyway, and would ship wrong the day
   *     anything surfaces it.
   * Making this required rather than defaulting to Sun–Thu is the point: a
   * default would let a new callsite reintroduce the bug without a word from
   * the compiler, which is exactly how the original const survived.
   */
  schoolWeek: readonly OrderedWeekday[];
  /**
   * The grade's unit catalog — `usePlanner().units` at the callsite.
   *
   * REQUIRED for the same reason. The unit name used to come from
   * `UNITS[lesson.subject].name` — the lib/mock fixture map of ONE active unit
   * per subject — which threw `lesson.unit` away entirely. Every Math row was
   * labelled "Unit 3 · Fractions on a Number Line" no matter which unit its
   * lesson belonged to, on the mock path as much as over Supabase. Rendered in
   * three places (CatchupRow, CatchUpModal, CatchUpBrowse).
   */
  units: readonly Unit[];
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
  const { currentWeek, schoolWeek, units, actions } = opts;
  // One pass over the catalog rather than a find() per lesson.
  const unitById = new Map(units.map((u) => [u.id, u]));
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
      // "" when the lesson's unit isn't in the catalog (a unit deleted out from
      // under it, or a catalog still hydrating). Every consumer already treats
      // the unit as optional — `shortUnit("")`, `filter(Boolean)`, a `? :` — so
      // an absent unit renders as nothing rather than as another lesson's unit.
      unit: unitById.get(lesson.unit)?.name ?? "",
      dayLabel: formatDayLabel(lesson.day, lesson.week, schoolWeek),
      week: lesson.week,
      day: lesson.day,
      title: lesson.title,
      preview: lesson.preview,
      status,
      standards: [...lesson.standards],
      resources: lesson.resources.length,
      reasonNotDone: lesson.reasonNotDone,
      daysLate: daysLate(lesson.week, lesson.day, currentWeek, schoolWeek),
      isPersonal: lesson.isPersonal,
      modified: lesson.modified,
    });
  }
  return out;
}

/**
 * How many instructional days late a lesson is, measured in the CONFIGURED
 * school week's days — so a 3-day school counts three days per week elapsed,
 * not five. Clamped at 0: a current-week lesson still ahead of the week's end
 * is not late, and negative lateness is not a thing this surface shows.
 *
 * A zero-length week (no configured days) would make every gap 0; the school
 * week can never be empty — `useSchoolWeek()`'s normalize() refuses to shrink
 * below one day — but the guard keeps the arithmetic total rather than relying
 * on a contract enforced two modules away.
 */
function daysLate(
  week: number,
  day: number,
  currentWeek: number,
  schoolWeek: readonly OrderedWeekday[],
): number {
  const dayCount = schoolWeek.length;
  if (dayCount <= 0) return 0;
  return Math.max(0, (currentWeek - week) * dayCount + (dayCount - 1 - day));
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
 *  lands.
 *
 *  `day` is a 0-based index INTO the configured school week (0 = the school's
 *  first day, whatever weekday that is), which is why the label is looked up
 *  positionally in `schoolWeek` rather than in a Sun-first weekday array. The
 *  "—" fallback covers a lesson whose day index is past the end of a week that
 *  has since been SHORTENED — a real state (a school drops Thursday and its
 *  Thursday lessons keep `day: 4`), and the same case lib/plan-timeline/lanes.ts
 *  calls out as live. */
function formatDayLabel(
  day: number,
  week: number,
  schoolWeek: readonly OrderedWeekday[],
): string {
  const dayName = schoolWeek[day]?.label ?? "—";
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
