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
//     filters. Both key on {@link ScopeToday} — where the CLOCK is — never on
//     the browsed week, and Today keys on the CONFIGURED-week column index,
//     never slice(0,4) (CLAUDE.md §1: never assume a 5-day Sun–Thu week).
//   • planScope — maps a scope chip to {mode, groupBy, items} so the component
//     renders lessons (grouped) or standards-gap rows without branching logic.
//   • standardGaps — the standards attached to no covered lesson, projected to
//     the modal's gap-row shape (code · description · subject · unit).

import type { CatchupGroupBy, CatchupItem } from "./catchup-data";
import type { Lesson, SubjectId, Unit } from "./types";
import { standardsCoverage } from "./year-standards-coverage";

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
  /**
   * True when this scope NEEDED to know where today is and could not find out —
   * `items` is then empty for want of an ANCHOR, not for want of work.
   *
   * The distinction is the whole reason this flag exists. An empty Catch-Up
   * list paints "All caught up for this scope 🎉", which is a claim; making
   * that claim because the clock could not be placed in the plan is the same
   * class of lie as the browsed-week bug below. The modal branches on this and
   * says what it actually knows instead.
   */
  todayUnknown: boolean;
}

// ── Today (the scope anchor) ───────────────────────────────────────────────

/**
 * Where TODAY sits in the plan — the anchor the "Today" and "This week" chips
 * filter against.
 *
 * NOT the browsed week. `useAppState().week` is the week the planner is
 * FOCUSED on and it reads like the current week at every callsite; feeding it
 * to these filters made "Today" mean "the Tuesday of whatever week you happen
 * to be looking at", so paging back three weeks silently re-pointed both chips
 * at a week that is not now. Commit 41aab70 fixed the identical defect in
 * `daysLate`; this type exists so the third instance cannot be written by
 * accident — there is no `currentWeek: number` parameter left to pass the wrong
 * number into.
 *
 * Both fields are independently nullable because they come from different
 * sources and fail at different times, and collapsing them would lose a real
 * distinction: on a Saturday the WEEK is perfectly well known while the day
 * column is not, and a "This week" chip that emptied itself every weekend
 * would be a new bug, not a fix.
 *
 * The sibling type in lib/catchup-data, {@link CatchupToday}, is the
 * BOTH-RESOLVED case of this one — lateness arithmetic needs a day column,
 * these filters do not always.
 */
export interface ScopeToday {
  /**
   * The 1-based plan week containing today — `useAppState().currentWeek`, and
   * ONLY when `useAppState().currentWeekBasis === "in-range"`. The other bases
   * are CLAMPS ("your year hasn't started — showing Week 1"), not derivations,
   * so null there: a school whose year starts in August has no honest answer
   * for "this week" in July, and the clamped Week 1 is not it.
   */
  week: number | null;
  /**
   * Today's 0-based POSITION in the configured school week —
   * `todayColumnIndex(new Date(), days)` (lib/now-anchor), never a
   * `Date.getDay()` value and never an index into a Sun-first array.
   *
   * null on a non-school day (nothing was due today, honestly) and also before
   * the first client paint, while the callsite's post-mount effect has not run
   * yet. The two are indistinguishable here, as they are for `daysLate`; the
   * pre-paint window is one frame and the modal opens on the "everything"
   * scope, which never reads this.
   */
  day: number | null;
}

// ── Day / week filters (rotation-aware) ────────────────────────────────────

/**
 * Items due *today*: today's own week AND today's configured-week column.
 *
 * Empty when either half of the anchor is missing — see {@link ScopeToday}.
 * That is the honest answer in both cases: with no day column nothing was due
 * today, and with no week we do not know which week today is in.
 */
export function todayItems(
  items: readonly CatchupItem[],
  today: ScopeToday,
): CatchupItem[] {
  const { week, day } = today;
  if (week === null || day === null) return [];
  return items.filter((i) => i.week === week && i.day === day);
}

/**
 * Items scheduled in the week containing TODAY (any day of it) — not the week
 * the planner is browsing. Empty when today's week is unresolvable; the caller
 * must distinguish that from "nothing uncovered" (see `ScopePlan.todayUnknown`).
 */
export function thisWeekItems(
  items: readonly CatchupItem[],
  today: ScopeToday,
): CatchupItem[] {
  const { week } = today;
  if (week === null) return [];
  return items.filter((i) => i.week === week);
}

// ── Chip → plan ─────────────────────────────────────────────────────────────

/**
 * Map a scope chip to its render plan. The lesson scopes differ only in which
 * items they keep and how they group; "standards" switches the modal to gap
 * mode (the component derives the gap rows separately via {@link standardGaps}).
 *
 * `all` is already narrowed by `deriveCatchupItems` to `lesson.week <= ` the
 * BROWSED week — that horizon is a legitimate use of the browsed week ("how
 * far back am I triaging"), and it is the only one. It does mean the two
 * clock-anchored chips come back empty while a teacher browses a week EARLIER
 * than today's: today's lessons are outside the horizon, so there is nothing
 * of today's to keep. Empty is right there — those lessons genuinely are not
 * in the set being triaged — and it is a far smaller surprise than the old
 * behaviour, which answered "Today" with a different week's Tuesday.
 */
export function planScope(
  scope: CatchupScopeV2,
  all: readonly CatchupItem[],
  today: ScopeToday,
): ScopePlan {
  // Only the two clock-anchored chips can be blocked by a missing anchor. The
  // week is the half both need; `today.day` being null is a real answer for
  // "Today" (a non-school day had nothing due), not a missing one.
  const todayUnknown =
    (scope === "today" || scope === "week") && today.week === null;
  switch (scope) {
    case "today":
      return {
        mode: "lessons",
        groupBy: "subject",
        items: todayItems(all, today),
        todayUnknown,
      };
    case "week":
      return {
        mode: "lessons",
        groupBy: "subject",
        items: thisWeekItems(all, today),
        todayUnknown,
      };
    case "unit":
      return {
        mode: "lessons",
        groupBy: "unit",
        items: [...all],
        todayUnknown: false,
      };
    case "subject":
      return {
        mode: "lessons",
        groupBy: "subject",
        items: [...all],
        todayUnknown: false,
      };
    case "standards":
      return {
        mode: "gaps",
        groupBy: "subject",
        items: [],
        todayUnknown: false,
      };
    case "everything":
    default:
      return {
        mode: "lessons",
        groupBy: "subject",
        items: [...all],
        todayUnknown: false,
      };
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
  /**
   * Name of the unit THIS gap's lesson belongs to, for the row's "(unit)"
   * suffix. Resolved from the same lesson as `subject` above, so the two can
   * never disagree — a Math subject color over an Explorers unit name would be
   * worse than no unit at all.
   *
   * null when that lesson's unit is not in the catalog (a unit deleted out from
   * under it, or a catalog still hydrating) — the row then prints no suffix,
   * which is what `deriveCatchupItems` does with the same miss.
   *
   * A standard tagged across SEVERAL units names the first covering lesson's
   * unit (week→day order, per `standardsCoverage`). That is a partial truth
   * where the old code was a whole falsehood, and it keeps the row's two
   * identity fields consistent.
   */
  unit: string | null;
}

/**
 * The standards-gap rows for the Catch-Up modal: every standard that appears in
 * the (past-or-current, non-archived) lesson set but is tagged by NO covered
 * (done) lesson. Mirrors `standardsCoverage`'s taught/untaught rule so the
 * modal and the Year coverage panel never disagree. Subject + unit are read
 * from the first lesson tagging the standard so the row can carry subject color.
 *
 * `units` is the grade's unit catalog — `usePlanner().units` at the callsite.
 * REQUIRED, for the reason `DeriveOptions.units` is: the unit name used to come
 * from `UNITS[subject].name`, the lib/mock map of ONE active unit per subject,
 * so every gap row within a subject claimed the SAME unit. Three Math gaps in
 * three different units read as three copies of "Unit 3 · Fractions on a Number
 * Line" — actively misleading on the Supabase path as much as on the mock one,
 * since the fixture answered regardless of what the teacher's plan said. A
 * default here would let a new callsite reintroduce that in silence; a required
 * parameter makes the compiler ask.
 */
export function standardGaps(
  lessons: readonly Lesson[],
  currentWeek: number,
  describeStandard: (code: string) => string,
  units: readonly Unit[],
): StandardGapRow[] {
  // Same eligibility window as deriveCatchupItems: past-or-current, unarchived.
  const scoped = lessons.filter((l) => !l.archived && l.week <= currentWeek);
  const byId = new Map(scoped.map((l) => [l.id, l]));
  // One pass over the catalog rather than a find() per gap row.
  const unitById = new Map(units.map((u) => [u.id, u]));
  const coverage = standardsCoverage(scoped as Lesson[]);
  const gaps: StandardGapRow[] = [];
  for (const s of coverage.standards) {
    if (s.taught) continue; // covered — not a gap
    const firstRef = s.lessonsCovering[0];
    const lesson = firstRef ? byId.get(firstRef.id) : undefined;
    gaps.push({
      code: s.code,
      desc: describeStandard(s.code),
      subject: lesson?.subject ?? null,
      unit: (lesson && unitById.get(lesson.unit)?.name) ?? null,
    });
  }
  return gaps;
}
