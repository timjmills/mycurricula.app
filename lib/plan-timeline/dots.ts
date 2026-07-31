// plan-timeline/dots.ts — per-lesson mark derivation for the timeline lanes.
//
// Every state here is DERIVED. `LessonStatus` is not widened: the audit's §C1
// verdict is that the design's five dot states "are not five status values",
// and `ph-more.jsx:16` / `pw-data.js:46` compute the prototype's own
// equivalents at render time too.

import type { Lesson } from "@/lib/types";
import { slotOf } from "./axis";
import type { DotState, ForkTier, TimelineDot } from "./types";

/**
 * How many of the three shipped planning axes a lesson is MISSING: an "I can"
 * objective, any resource, any standard.
 *
 * These are exactly the axes `lib/unit-workspace-derive.ts:192-194`
 * (`unitGaps`) counts, so the timeline and the unit drawer can never disagree
 * about what "needs work" means. It is a narrower instrument than the
 * prototype's `comp()` (`pw-data.js:46` counts five `done.*` flags including
 * Flow and Differentiation), because `lessons.done` was ruled content-derived
 * and never migrated (20260728120000…sql:336-337).
 *
 * `hasResources` is injectable for the same reason `unitGaps` takes it:
 * section resources are the canonical half and are not on the `Lesson` shape
 * (see `unit-workspace-derive.ts:166-179`). Without it, a lesson whose
 * resources all live on its sections is wrongly counted as a gap.
 */
export function planningGapCount(
  lesson: Lesson,
  hasResources?: (lesson: Lesson) => boolean,
): number {
  const resources = hasResources ?? ((l: Lesson) => l.resources.length > 0);
  let n = 0;
  if (lesson.objective.trim().length === 0) n += 1;
  if (!resources(lesson)) n += 1;
  if (lesson.standards.length === 0) n += 1;
  return n;
}

/**
 * "Barely planned" — the shipped stand-in for the prototype's `comp(l) <= 2`.
 *
 * Two or more of three axes missing. The threshold is a judgement, stated
 * plainly rather than buried: one missing axis is an ordinary work-in-progress
 * lesson; two is a lesson a teacher would not want to walk into.
 */
export function isThin(
  lesson: Lesson,
  hasResources?: (lesson: Lesson) => boolean,
): boolean {
  return planningGapCount(lesson, hasResources) >= 2;
}

/**
 * Has the teacher already triaged this lesson through Catch-up?
 *
 * `carried` and `skipped` are both explicit catch-up decisions
 * (`lib/catchup-data.ts:applyCatchupAction`), so they are the shipped
 * equivalent of the prototype's `cuHandled` flag (`ph-more.jsx:16`) — a column
 * that was never migrated because it is derivable (20260728120000…sql:336-337).
 */
export function isCatchUpHandled(lesson: Lesson): boolean {
  return lesson.status === "carried" || lesson.status === "skipped";
}

/**
 * Inputs that place "now" on the axis, for the past/future comparison.
 *
 * Callers pass `null` instead of a `NowRef` whenever today's position is NOT
 * known — before mount (the axis renders on the server, where "today" is the
 * server's), or when `AppState.currentWeekBasis` is anything but `"in-range"`
 * (the school year has not started, has ended, or is unconfigured, so
 * `currentWeek` is a clamp, not a location).
 *
 * With `null`, nothing is treated as past and NO dot can become "missed". That
 * under-claims by design: a lesson wrongly accused of being missed sends a
 * teacher to triage a lesson that is fine, whereas a missed lesson shown as
 * merely "needs work" still shows as needing work.
 */
export interface NowRef {
  /** `AppState.currentWeek` — the week that actually contains today. */
  currentWeek: number;
  /**
   * `todayColumnIndex(...)` — 0-based day within the school week, or null when
   * today is NOT a school day.
   *
   * NULL MEANS "WE CANNOT SAY WHERE IN THE WEEK WE ARE", and the past test then
   * covers only the weeks BEFORE this one. It is tempting to read null as "the
   * school week is already spent" — true for a Friday in a Sun–Thu week — but
   * the school week is a configurable SET, not a contiguous run (CLAUDE.md §1).
   * On a Mon/Wed/Fri week, Tuesday is also null, and treating it as "week
   * spent" would mark Wednesday's and Friday's thin lessons missed two days
   * before they are taught. Under-claiming costs a late flag; over-claiming
   * sends a teacher to triage a lesson that has not happened yet.
   */
  todayColumn: number | null;
  schoolWeekLen: number;
}

/** Is this lesson's scheduled day strictly in the past? False whenever today
 *  has no known position — see `NowRef`. */
export function isPastLesson(lesson: Lesson, now: NowRef | null): boolean {
  if (!now) return false;
  // With no column for today, the cut falls at the START of the current week —
  // so nothing in this week is past, and only earlier weeks are. See `NowRef`.
  const today = slotOf(now.currentWeek, now.todayColumn ?? 0, now.schoolWeekLen);
  return slotOf(lesson.week, lesson.day, now.schoolWeekLen) < today;
}

/**
 * The dot's state.
 *
 * Mirrors the design's ladder (`ph-units.jsx:606-608`) minus "target", which
 * has no column — see the `DotState` doc comment in ./types.ts.
 */
export function dotStateFor(
  lesson: Lesson,
  now: NowRef | null,
  opts?: {
    /** Section-aware resource predicate — see `planningGapCount`. */
    hasResources?: (lesson: Lesson) => boolean;
    /**
     * Does this lesson sit on a configured holiday?
     *
     * A holiday column is painted "no school" on the axis, so a lesson parked
     * there could not have been taught — calling it "missed" once its date
     * passes sends a teacher to Catch-up to triage a lesson nothing could have
     * covered. It still reads as "needs work", which it does.
     */
    onHoliday?: boolean;
  },
): DotState {
  if (lesson.status === "done") return "taught";
  const thin = isThin(lesson, opts?.hasResources);
  if (
    thin &&
    !opts?.onHoliday &&
    isPastLesson(lesson, now) &&
    !isCatchUpHandled(lesson)
  ) {
    return "missed";
  }
  return thin ? "needs_work" : "planned";
}

/**
 * Three-tier fork differentiation (CLAUDE.md §2).
 *
 * The handoff carries NONE of this on a timeline mark (`ph-units.jsx:609-611`);
 * CLAUDE.md makes it a product contract that holds "everywhere", and the unit
 * workspace already honours it (`unit-tabs/LessonsTab.tsx:44`). On the one
 * surface that shows a teacher their whole year at once, they must still be
 * able to tell which lessons are their own forks.
 */
export function forkTierFor(
  lesson: Pick<Lesson, "modified" | "moved">,
): ForkTier {
  const modified = lesson.modified === true;
  const moved = lesson.moved != null;
  if (modified && moved) return "both";
  if (modified) return "modified";
  if (moved) return "moved";
  return "master";
}

/**
 * Assign `stackIndex` / `stackSize` so several lessons sharing one day on one
 * lane fan out instead of stacking into a single opaque dot
 * (`ph-units.jsx:603-604`). Mutates nothing — returns a new array in the input
 * order, with a stable within-slot order (input order).
 */
export function stackBySlot(
  dots: readonly Omit<TimelineDot, "stackIndex" | "stackSize">[],
): TimelineDot[] {
  const bySlot = new Map<number, number>();
  for (const d of dots) bySlot.set(d.slot, (bySlot.get(d.slot) ?? 0) + 1);
  const seen = new Map<number, number>();
  return dots.map((d) => {
    const i = seen.get(d.slot) ?? 0;
    seen.set(d.slot, i + 1);
    return { ...d, stackIndex: i, stackSize: bySlot.get(d.slot) ?? 1 };
  });
}

/** Human label for a dot state — used for the accessible name AND the legend,
 *  so the encoding is never colour-only (audit B7/B9). */
export const DOT_STATE_LABEL: Readonly<Record<DotState, string>> = {
  taught: "Taught",
  planned: "Planned",
  needs_work: "Needs work",
  missed: "Missed",
};

/** Human label for a fork tier. "master" has none — an unedited lesson gets no
 *  fork phrase at all, exactly as the three-tier contract intends. */
export const FORK_TIER_LABEL: Readonly<Record<ForkTier, string>> = {
  master: "",
  modified: "Modified",
  moved: "Moved",
  both: "Modified and moved",
};
