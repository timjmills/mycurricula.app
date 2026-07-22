// catchup-scope.ts — pure scope derivations for the v2 Catch-Up modal.
//
// The v2 modal offers SIX scope chips (Everything · Today · This week · By unit
// · By subject · Standards gaps) — a mix of FILTER (which items), GROUP (how
// they cluster), and MODE (lessons vs. standards-gap rows). The chip → plan
// mapping and the two day/week filters that lib/catchup-data doesn't cover live
// here as pure, side-effect-free functions so the component stays a clean
// Fast-Refresh boundary and every derivation is unit-testable without a DOM.
//
// Everything the modal needs beyond lib/catchup-data:
//   • todayItems / thisWeekItems — the rotation-aware "Today" + "This week"
//     filters (Today keys on the CONFIGURED-week column index, never slice(0,4)
//     — CLAUDE.md §1: never assume a 5-day Sun–Thu week).
//   • planScope — maps a scope chip to {mode, groupBy, items} so the component
//     renders lessons (grouped) or standards-gap rows without branching logic.
//   • standardGaps — the standards attached to no covered lesson, projected to
//     the modal's gap-row shape (code · description · subject · unit).

import type { CatchupGroupBy, CatchupItem } from "./catchup-data";
import type { Lesson, SubjectId } from "./types";
import { standardsCoverage } from "./year-standards-coverage";
import { UNITS } from "./mock";

// ── Scope vocabulary ───────────────────────────────────────────────────────

/** The six scope chips of the v2 Catch-Up modal. Distinct from lib/catchup-data's
 *  `CatchupScope` (the v1 time-window chips) — this axis mixes filter + group +
 *  mode. */
export type CatchupScopeV2 =
  | "everything"
  | "today"
  | "week"
  | "unit"
  | "subject"
  | "standards";

/** Rendered result of a scope chip. `mode` decides which surface the modal
 *  paints; `groupBy` + `items` drive the lessons surface (ignored for gaps). */
export interface ScopePlan {
  /** "lessons" → grouped lesson rows; "gaps" → standards-gap rows (no items). */
  mode: "lessons" | "gaps";
  /** How the lesson rows cluster (only meaningful when `mode === "lessons"`). */
  groupBy: CatchupGroupBy;
  /** The scoped, still-ungrouped items (empty when `mode === "gaps"`). */
  items: CatchupItem[];
}

// ── Day / week filters (rotation-aware) ────────────────────────────────────

/**
 * Items due *today*: same week as the planner's current week AND on today's
 * configured-week column. `todayCol` is the 0-based index of today in the
 * CONFIGURED school week (from `todayColumnIndex(now, schoolWeekDays)`), or
 * null on a non-school day — in which case nothing is "due today".
 */
export function todayItems(
  items: readonly CatchupItem[],
  currentWeek: number,
  todayCol: number | null,
): CatchupItem[] {
  if (todayCol === null) return [];
  return items.filter((i) => i.week === currentWeek && i.day === todayCol);
}

/** Items scheduled in the planner's current week (any day). */
export function thisWeekItems(
  items: readonly CatchupItem[],
  currentWeek: number,
): CatchupItem[] {
  return items.filter((i) => i.week === currentWeek);
}

// ── Chip → plan ─────────────────────────────────────────────────────────────

/**
 * Map a scope chip to its render plan. The lesson scopes differ only in which
 * items they keep and how they group; "standards" switches the modal to gap
 * mode (the component derives the gap rows separately via {@link standardGaps}).
 */
export function planScope(
  scope: CatchupScopeV2,
  all: readonly CatchupItem[],
  currentWeek: number,
  todayCol: number | null,
): ScopePlan {
  switch (scope) {
    case "today":
      return {
        mode: "lessons",
        groupBy: "subject",
        items: todayItems(all, currentWeek, todayCol),
      };
    case "week":
      return {
        mode: "lessons",
        groupBy: "subject",
        items: thisWeekItems(all, currentWeek),
      };
    case "unit":
      return { mode: "lessons", groupBy: "unit", items: [...all] };
    case "subject":
      return { mode: "lessons", groupBy: "subject", items: [...all] };
    case "standards":
      return { mode: "gaps", groupBy: "subject", items: [] };
    case "everything":
    default:
      return { mode: "lessons", groupBy: "subject", items: [...all] };
  }
}

// ── Standards gaps ──────────────────────────────────────────────────────────

/** One standards-gap row: a standard tagged only by not-yet-taught lessons. */
export interface StandardGapRow {
  code: string;
  /** Human wording via the planner's describeStandard (falls back to the code). */
  desc: string;
  /** Subject of the first lesson tagging it — drives the row's subject color.
   *  null when no scoped lesson resolves (defensive; a gap always has ≥1). */
  subject: SubjectId | null;
  /** The subject's unit name, for the row's "(unit)" suffix. */
  unit: string | null;
}

/**
 * The standards-gap rows for the Catch-Up modal: every standard that appears in
 * the (past-or-current, non-archived) lesson set but is tagged by NO covered
 * (done) lesson. Mirrors `standardsCoverage`'s taught/untaught rule so the
 * modal and the Year coverage panel never disagree. Subject + unit are read
 * from the first lesson tagging the standard so the row can carry subject color.
 */
export function standardGaps(
  lessons: readonly Lesson[],
  currentWeek: number,
  describeStandard: (code: string) => string,
): StandardGapRow[] {
  // Same eligibility window as deriveCatchupItems: past-or-current, unarchived.
  const scoped = lessons.filter((l) => !l.archived && l.week <= currentWeek);
  const byId = new Map(scoped.map((l) => [l.id, l]));
  const coverage = standardsCoverage(scoped as Lesson[]);
  const gaps: StandardGapRow[] = [];
  for (const s of coverage.standards) {
    if (s.taught) continue; // covered — not a gap
    const firstRef = s.lessonsCovering[0];
    const lesson = firstRef ? byId.get(firstRef.id) : undefined;
    const subject = lesson?.subject ?? null;
    gaps.push({
      code: s.code,
      desc: describeStandard(s.code),
      subject,
      unit: subject ? UNITS[subject].name : null,
    });
  }
  return gaps;
}
