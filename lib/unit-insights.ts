// unit-insights.ts — pure Insights derivations for ONE unit (the B3 Insights
// panel). These sit ATOP the existing unit helpers (lib/unit-workspace-derive.ts
// · lib/year-unit-aggregate.ts) and turn a unit's lessons into the honest
// metric set the panel renders: assessment coverage, planned time, prep
// readiness, planning gaps, standards spread, and teaching-date coverage.
//
// No React, no DOM, no store — so they memoize cleanly in the workspace and are
// exercised directly in tests/unit-insights.test.ts.
//
// ── HONESTY CONTRACT (the whole point of this module) ───────────────────────
// An insights panel is the easiest place in the app to invent a statistic, so
// every metric here is a discriminated `Insight<T>`: it either has a value
// backed by real lesson data, or it reports `unavailable` with a reason. A
// missing input NEVER degrades to `0`, and a denominator is never silently
// shrunk to whatever happened to be populated.
//
// The rule that decides available vs unavailable:
//   • A COUNT of "how many lessons have X" is always honest — an untagged
//     lesson is a real "not tagged yet", which is exactly the signal a teacher
//     acts on. So assessment / prep / standards / gaps report zeros happily.
//   • An AGGREGATE OVER a field's values (the planned-time sum) is unavailable
//     when no lesson carries the field — a 0-minute total is not a real zero,
//     it is "nobody has said". Same for any range over `taughtAt`.
//
// What is deliberately NOT computed, and why:
//   • NO pace / projected finish / ahead-behind / overdue. `taughtAt` is
//     READ-ONLY today (lessonTrackBColumns never writes it — lib/planner/
//     lesson-track-b.ts) so it is effectively always null; and any day-math on
//     top of it would have to assume a week length, which is per-school
//     configuration (CLAUDE.md §1). `lib/catchup-data.ts`'s DAYS_PER_WEEK = 5 is
//     mock-coupled and deliberately not imported.
//   • NO standards N/M coverage ratio. The denominator would be `units.standards`,
//     which has no editor yet — a ratio against an empty set is fabricated.
//     Only the distinct-code count and per-code reinforcement counts are real.
//   • NO extrapolated unit length ("8 lessons × the average" ). See PlannedTime.
//
// TEXT-FIELD NOTE: `builds`, `prep`, and the three assessment text fields are
// edited through PLAIN-TEXT inputs/textareas (components/lesson-plan-v2/
// LessonWorkspace.tsx), so `.trim()` is the correct emptiness test. If any of
// them ever becomes rich text, the emptiness checks below must move to
// `stripHtml` (lib/html-text.ts) or a `<p></p>` will read as filled in.
//
// SEAM NOTE for callers: the Track-B fields (`assessment`, `durationMinutes`,
// `builds`, `prep`, `taughtAt`) reach a Lesson through the Track-B read seam —
// the `*_COLS` selects plus `trackBArgsFromRow` in lib/planner/supabase-source.ts
// (shipped in ea75868). That seam is active wherever the Supabase planner source
// is, which is every path a teacher touches (the planner flag has been on in
// production since 2026-06-12; the v2 rollback lever flips NEXT_PUBLIC_V2, not
// the planner flag). So these metrics measure real data in production.
//
// On the MOCK path (planner flag off — local dev and demo fixtures) the fields
// are simply absent, and the metrics then report what is true OF THAT DOCUMENT:
// "none of the N lessons has a duration". That is accurate rather than
// fabricated, but it is not evidence about a real teacher's plan — do not read a
// flag-off screenshot as a finding about planning quality.
//
// The one thing NOT to do is add a coverage RATIO over a field the seam does not
// populate: a denominator sourced from absent data is the fabrication this
// module exists to prevent.

import { isAssessmentKind, type Lesson } from "@/lib/types";
import { unitGaps, type UnitGaps } from "@/lib/unit-workspace-derive";
import type { UnitStandardRef } from "@/lib/year-unit-aggregate";

// ── The unavailable-aware metric wrapper ───────────────────────────────────

/** Why a metric has no value. A UI renders these as an explanation ("no
 *  durations set yet"), NEVER as a zero. */
export type InsightUnavailableReason =
  /** The unit has no (non-archived) lessons at all — nothing to measure. */
  | "no_lessons"
  /** The unit has lessons, but not one of them carries the field this metric
   *  aggregates, so any total/range would be invented from an empty sample. */
  | "no_data"
  /** The field exists in the model but effectively nothing writes it today, so
   *  its absence proves nothing about the unit (`taughtAt`). Distinct from
   *  "no_data" so the UI can say "not recorded" rather than "none set". */
  | "not_recorded";

/**
 * One metric: either a real value, or an explicit unavailable state.
 *
 * `lessonCount` is carried on BOTH arms — it is the honest denominator M (the
 * unit's non-archived lesson count), and a UI still needs it to phrase the
 * unavailable case ("none of the 8 lessons has a duration").
 */
export type Insight<T> =
  | { state: "available"; lessonCount: number; value: T }
  | {
      state: "unavailable";
      lessonCount: number;
      reason: InsightUnavailableReason;
    };

/**
 * Facts this module cannot see from a `Lesson` alone, supplied by a caller that
 * can. Optional throughout: omitted, every metric falls back to lesson-only
 * data, which is what a store-free consumer (or a test) gets.
 */
export interface UnitInsightsOptions {
  /**
   * Does this lesson have ANY resource, counting SECTION resources?
   *
   * Section resources are the canonical half of a lesson's resource list
   * (`lib/resources-dedup.ts`), and the composer attaches to a section whenever
   * one is the destination — but sections are not on the `Lesson` shape. Without
   * this, a lesson whose resources all live on its sections counts as "no
   * resources", and the panel claims a gap for a lesson whose Resources tab, in
   * the same modal, lists them.
   */
  hasResources?: (lesson: Lesson) => boolean;
}

function available<T>(lessonCount: number, value: T): Insight<T> {
  return { state: "available", lessonCount, value };
}

function unavailable<T>(
  lessonCount: number,
  reason: InsightUnavailableReason,
): Insight<T> {
  return { state: "unavailable", lessonCount, reason };
}

// ── Metric value shapes ─────────────────────────────────────────────────────

/** How many of the unit's lessons carry an assessment, and of what kind. */
export interface AssessmentCoverage {
  /** Lessons carrying an assessment with any real content. */
  withAssessment: number;
  /** Lessons with no assessment at all. `withAssessment + without = lessonCount`. */
  withoutAssessment: number;
  /** Of `withAssessment`: kind === "formative". */
  formative: number;
  /** Of `withAssessment`: kind === "summative". */
  summative: number;
  /**
   * Of `withAssessment`: has a title / purpose / notes but NO valid `kind`.
   *
   * This is a REAL round-trippable state, not a data error — `assessmentFromRow`
   * (lib/planner/lesson-track-b.ts) deliberately keeps a title-only assessment,
   * and re-validates `kind` on read so a garbage stored kind arrives as
   * undefined. A naive `kind === "formative" | "summative"` split would drop
   * these lessons silently and under-report the unit's assessment count, so
   * they get their own bucket: `formative + summative + unclassified =
   * withAssessment`, always.
   */
  unclassified: number;
}

/**
 * Planned minutes across the lessons that actually carry a duration.
 *
 * HONESTY: `totalMinutes` is a sum over `withDuration` lessons ONLY — it is
 * never scaled up to the whole unit, and `lessonsMissingDuration` is reported
 * alongside so a UI can render "3h 15m across 5 of 8 lessons" instead of
 * implying the unit is 3h 15m long. `complete` is the one flag that says the
 * total covers everything.
 */
export interface PlannedTime {
  /** Sum of the durations that are set. Never extrapolated. */
  totalMinutes: number;
  /** N — lessons carrying a usable duration (finite and > 0). */
  lessonsWithDuration: number;
  /** M − N — lessons with no usable duration; excluded from `totalMinutes`. */
  lessonsMissingDuration: number;
  /** True when every lesson carries a duration, i.e. the total IS the unit. */
  complete: boolean;
}

/** How ready the unit's lessons are to teach — the two Track-B prose fields. */
export interface PrepReadiness {
  /** Lessons with non-empty `prep` (materials / setup). */
  withPrep: number;
  /** Lessons with non-empty `builds` (prior learning). */
  withBuilds: number;
  /** Lessons with AT LEAST ONE of the two (a union — never double-counts). */
  withEither: number;
  /** Lessons with NEITHER. `withEither + withNeither = lessonCount`. */
  withNeither: number;
}

/** Planning completeness, delegated wholesale to `unitGaps`. */
export interface PlanningGaps {
  /** The gap counts themselves — see `unitGaps` for the exact contract. */
  gaps: UnitGaps;
  /**
   * The denominator `unitGaps` counts against: lessons NOT yet taught
   * (`status !== "done"`). Taught lessons are excluded there because their
   * planning is history, so reporting the gaps against `lessonCount` would
   * understate them. A unit with `notTaught: 0` legitimately has zero gaps.
   */
  notTaught: number;
}

/** A standard tagged somewhere in the unit, carrying the stable identity it was
 *  grouped by. `identity` is the real `standards.id` uuid where the lesson has
 *  one, else `code:<code>`. The UI needs it as a React key: two standards from
 *  different frameworks can share a `code`, and keying a list by a duplicated
 *  value makes reconciliation unstable when counts or order change. */
export interface InsightStandardRef extends UnitStandardRef {
  identity: string;
}

/**
 * Standards reach across the unit's lessons.
 *
 * HONESTY: there is NO N/M coverage ratio here. The only denominator available
 * would be `Unit.standardIds`, which has no editor yet (B1.7), so "covered 6 of
 * 12" would be a ratio against an empty set. What IS real: which codes appear
 * and how many lessons reinforce each.
 *
 * IDENTITY: standard CODES are unique only PER framework (AERO and WIDA-ELD both
 * have an "S1"), so grouping by code would merge two different standards and
 * UNDERSTATE reach. Grouping therefore keys on `Lesson.standardIds` — the real
 * `standards.id` uuids — falling back to the code only for rows that predate the
 * id backfill (and for the mock fixtures). Two standards that genuinely share a
 * code appear as two entries with the same visible code, which is true; merging
 * them is the defect.
 */
export interface StandardsSpread {
  /** Number of distinct standards tagged anywhere in the unit. */
  distinctCodes: number;
  /** Every standard with its reinforcement count, sorted by code. */
  codes: InsightStandardRef[];
  /** Lessons carrying at least one standard tag. */
  lessonsTagged: number;
  /** Lessons carrying none. `lessonsTagged + lessonsUntagged = lessonCount`. */
  lessonsUntagged: number;
}

/**
 * Teaching-date coverage — the ONLY thing derived from `taughtAt`.
 *
 * Effectively always `unavailable: "not_recorded"` today: nothing writes
 * `taught_at` (it is read-only in B2), so no lesson carries one. The shape is
 * future-proofed rather than deleted so that if/when the column is written the
 * metric lights up on its own — but note there is still NO pace, projected
 * finish, or ahead/behind verdict built on it, because that needs the
 * configurable school-week calendar this layer does not have.
 */
export interface TaughtDateCoverage {
  /** Lessons carrying a PARSEABLE `taughtAt` timestamp. */
  lessonsWithDate: number;
  /** Lessons with none. `withDate + withoutDate = lessonCount`. */
  lessonsWithoutDate: number;
  /** The earliest recorded `taughtAt`, verbatim as stored. */
  firstTaughtAt: string;
  /** The latest recorded `taughtAt`, verbatim as stored. */
  lastTaughtAt: string;
}

/** Every metric for one unit, computed together. */
export interface UnitInsights {
  /** M — the non-archived lessons every metric was computed from. */
  lessonCount: number;
  assessments: Insight<AssessmentCoverage>;
  plannedTime: Insight<PlannedTime>;
  prep: Insight<PrepReadiness>;
  planningGaps: Insight<PlanningGaps>;
  standards: Insight<StandardsSpread>;
  taughtDates: Insight<TaughtDateCoverage>;
}

// ── One pass over the lessons ───────────────────────────────────────────────

/** Raw per-lesson tallies — everything a single sweep can collect. */
interface Tallies {
  formative: number;
  summative: number;
  unclassified: number;
  totalMinutes: number;
  withDuration: number;
  withPrep: number;
  withBuilds: number;
  withEitherPrep: number;
  withTaughtAt: number;
  firstTaughtAt: string;
  lastTaughtAt: string;
  notTaught: number;
  lessonsTagged: number;
}

/** Non-empty after trimming — the plain-text emptiness test (see header). */
function filled(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Drop soft-deleted lessons up front.
 *
 * `unitLessons` already excludes them, so for the intended caller this is a
 * no-op — but re-dropping here means a caller that hands over a raw list can
 * never inflate a denominator with rows every surface is required to hide
 * (lib/types.ts, `Lesson.archived`). Returns a fresh array so the reused
 * `unitStandards` (which sorts a copy) and `unitGaps` see the same set.
 */
function activeLessons(lessons: readonly Lesson[]): Lesson[] {
  return lessons.filter((l) => l.archived !== true);
}

function accumulate(lessons: readonly Lesson[]): Tallies {
  const t: Tallies = {
    formative: 0,
    summative: 0,
    unclassified: 0,
    totalMinutes: 0,
    withDuration: 0,
    withPrep: 0,
    withBuilds: 0,
    withEitherPrep: 0,
    withTaughtAt: 0,
    firstTaughtAt: "",
    lastTaughtAt: "",
    notTaught: 0,
    lessonsTagged: 0,
  };
  // Epoch ms of the current first/last taughtAt, so the comparison never does
  // string ordering on mixed ISO offsets.
  let firstMs = Number.POSITIVE_INFINITY;
  let lastMs = Number.NEGATIVE_INFINITY;

  for (const l of lessons) {
    // ── Assessment. `kind` is re-validated with the SAME guard the read mapper
    // uses, so a garbage kind falls through to "no kind" rather than counting
    // as a fourth category. An assessment object with no valid kind and no
    // text is not an assessment at all — that is exactly what
    // `assessmentFromRow` returns undefined for.
    const a = l.assessment;
    if (a) {
      const kind = isAssessmentKind(a.kind) ? a.kind : undefined;
      const hasText = filled(a.title) || filled(a.purpose) || filled(a.notes);
      if (kind === "formative") t.formative += 1;
      else if (kind === "summative") t.summative += 1;
      else if (hasText) t.unclassified += 1;
    }

    // ── Planned time. A non-finite or non-positive duration is not a real
    // planned length (the column is a plain int with no CHECK), so it is
    // treated as "not set": it is never summed, and the lesson lands in
    // `lessonsMissingDuration` — the denominator stays the full lesson count.
    const minutes = l.durationMinutes;
    if (
      typeof minutes === "number" &&
      Number.isFinite(minutes) &&
      minutes > 0
    ) {
      t.totalMinutes += minutes;
      t.withDuration += 1;
    }

    // ── Prep readiness.
    const hasBuilds = filled(l.builds);
    const hasPrep = filled(l.prep);
    if (hasBuilds) t.withBuilds += 1;
    if (hasPrep) t.withPrep += 1;
    if (hasBuilds || hasPrep) t.withEitherPrep += 1;

    // ── Teaching dates. An unparseable timestamp is not a date — it is
    // counted as absent rather than poisoning the range with NaN.
    const ms = l.taughtAt === undefined ? NaN : Date.parse(l.taughtAt);
    if (l.taughtAt !== undefined && Number.isFinite(ms)) {
      t.withTaughtAt += 1;
      if (ms < firstMs) {
        firstMs = ms;
        t.firstTaughtAt = l.taughtAt;
      }
      if (ms > lastMs) {
        lastMs = ms;
        t.lastTaughtAt = l.taughtAt;
      }
    }

    // ── Denominators for the two delegated metrics.
    if (l.status !== "done") t.notTaught += 1;
    if (l.standards.length > 0) t.lessonsTagged += 1;
  }
  return t;
}

// ── Metric builders (shared by the standalone fns and the aggregate) ────────

function assessmentsFrom(
  lessonCount: number,
  t: Tallies,
): Insight<AssessmentCoverage> {
  if (lessonCount === 0) return unavailable(lessonCount, "no_lessons");
  const withAssessment = t.formative + t.summative + t.unclassified;
  return available(lessonCount, {
    withAssessment,
    withoutAssessment: lessonCount - withAssessment,
    formative: t.formative,
    summative: t.summative,
    unclassified: t.unclassified,
  });
}

function plannedTimeFrom(
  lessonCount: number,
  t: Tallies,
): Insight<PlannedTime> {
  if (lessonCount === 0) return unavailable(lessonCount, "no_lessons");
  // A sum over zero samples is not "0 minutes planned" — it is "nobody has
  // said". Report it as unavailable rather than a total that reads as real.
  if (t.withDuration === 0) return unavailable(lessonCount, "no_data");
  return available(lessonCount, {
    totalMinutes: t.totalMinutes,
    lessonsWithDuration: t.withDuration,
    lessonsMissingDuration: lessonCount - t.withDuration,
    complete: t.withDuration === lessonCount,
  });
}

function prepFrom(lessonCount: number, t: Tallies): Insight<PrepReadiness> {
  if (lessonCount === 0) return unavailable(lessonCount, "no_lessons");
  return available(lessonCount, {
    withPrep: t.withPrep,
    withBuilds: t.withBuilds,
    withEither: t.withEitherPrep,
    withNeither: lessonCount - t.withEitherPrep,
  });
}

function planningGapsFrom(
  lessonCount: number,
  t: Tallies,
  gaps: UnitGaps,
): Insight<PlanningGaps> {
  if (lessonCount === 0) return unavailable(lessonCount, "no_lessons");
  return available(lessonCount, { gaps, notTaught: t.notTaught });
}

function standardsFrom(
  lessonCount: number,
  t: Tallies,
  codes: InsightStandardRef[],
): Insight<StandardsSpread> {
  if (lessonCount === 0) return unavailable(lessonCount, "no_lessons");
  return available(lessonCount, {
    distinctCodes: codes.length,
    codes,
    lessonsTagged: t.lessonsTagged,
    lessonsUntagged: lessonCount - t.lessonsTagged,
  });
}

function taughtDatesFrom(
  lessonCount: number,
  t: Tallies,
): Insight<TaughtDateCoverage> {
  if (lessonCount === 0) return unavailable(lessonCount, "no_lessons");
  // The expected path today: `taught_at` is never written, so an all-absent
  // column means "not recorded", NOT "taught zero times". Reporting a 0 here
  // would read as a real teaching record and is exactly the fabrication this
  // module exists to prevent.
  if (t.withTaughtAt === 0) return unavailable(lessonCount, "not_recorded");
  return available(lessonCount, {
    lessonsWithDate: t.withTaughtAt,
    lessonsWithoutDate: lessonCount - t.withTaughtAt,
    firstTaughtAt: t.firstTaughtAt,
    lastTaughtAt: t.lastTaughtAt,
  });
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Assessment coverage for one unit's lessons — how many carry an assessment,
 * split formative / summative / unclassified. See `AssessmentCoverage` for why
 * the third bucket exists.
 */
export function assessmentCoverage(
  lessons: readonly Lesson[],
): Insight<AssessmentCoverage> {
  const active = activeLessons(lessons);
  return assessmentsFrom(active.length, accumulate(active));
}

/**
 * Planned minutes for one unit's lessons, with the honest "N of M lessons have
 * a duration" denominator. Unavailable when no lesson carries a duration.
 */
export function plannedTime(lessons: readonly Lesson[]): Insight<PlannedTime> {
  const active = activeLessons(lessons);
  return plannedTimeFrom(active.length, accumulate(active));
}

/** Prep readiness (`builds` / `prep` filled) for one unit's lessons. */
export function prepReadiness(
  lessons: readonly Lesson[],
): Insight<PrepReadiness> {
  const active = activeLessons(lessons);
  return prepFrom(active.length, accumulate(active));
}

/**
 * Planning gaps for one unit's lessons — `unitGaps` verbatim, paired with the
 * not-taught denominator it counts against.
 */
export function planningGaps(
  lessons: readonly Lesson[],
  opts?: UnitInsightsOptions,
): Insight<PlanningGaps> {
  const active = activeLessons(lessons);
  return planningGapsFrom(
    active.length,
    accumulate(active),
    unitGaps(active, opts),
  );
}

/**
 * Distinct standards across a unit's lessons, keyed by STANDARD IDENTITY rather
 * than by display code.
 *
 * `lib/year-unit-aggregate.ts`'s `unitStandards` groups by code, which is wrong
 * the moment a teacher's frameworks overlap: a code is unique only WITHIN a
 * framework, so AERO "S1" and WIDA "S1" are different standards that collapse
 * into one row — understating coverage and merging two unrelated lesson counts.
 * That is not hypothetical; the beta school has more than one framework enabled.
 *
 * `Lesson.standardIds` holds the real `standards.id` UUIDs, index-aligned with
 * `Lesson.standards`, so it is the correct grouping key. Lessons predating the
 * id backfill (and the mock fixtures) carry codes only, hence the `code:` fallback
 * — those still group by code, which is the best identity available for them.
 *
 * Two standards that genuinely share a code therefore render as two rows with
 * the same visible code. That reads oddly, but it is TRUE; silently merging them
 * is the defect. Framework-qualified labels need a framework name on the lesson
 * row, which the seam does not carry today.
 */
function distinctStandardRefs(lessons: readonly Lesson[]): InsightStandardRef[] {
  const byIdentity = new Map<string, InsightStandardRef>();
  for (const l of lessons) {
    // Counted ONCE PER LESSON, not once per array entry. `lessonCount` is read
    // as "N lessons reinforce this standard", so a lesson that happens to carry
    // the same standard twice (a duplicate tag) must not make one lesson look
    // like two.
    const seenInLesson = new Set<string>();
    for (let i = 0; i < l.standards.length; i += 1) {
      const code = l.standards[i];
      const identity = l.standardIds?.[i] ?? `code:${code}`;
      if (seenInLesson.has(identity)) continue;
      seenInLesson.add(identity);
      const hit = byIdentity.get(identity);
      if (hit) hit.lessonCount += 1;
      else byIdentity.set(identity, { identity, code, lessonCount: 1 });
    }
  }
  // Sorted by code for display; ties broken by identity so the order is total
  // and stable when two frameworks share a code.
  return Array.from(byIdentity.values()).sort(
    (a, b) =>
      a.code.localeCompare(b.code) || a.identity.localeCompare(b.identity),
  );
}

/**
 * Standards spread for one unit's lessons — the distinct-standard list (by
 * identity, see above), plus how many lessons are tagged at all. No coverage
 * ratio: the denominator would be the unit's own standards, which has no editor.
 */
export function standardsSpread(
  lessons: readonly Lesson[],
): Insight<StandardsSpread> {
  const active = activeLessons(lessons);
  return standardsFrom(
    active.length,
    accumulate(active),
    distinctStandardRefs(active),
  );
}

/**
 * Teaching-date coverage for one unit's lessons. Reports
 * `unavailable: "not_recorded"` whenever no lesson carries a parseable
 * `taughtAt` — which is every unit today, by design.
 */
export function taughtDateCoverage(
  lessons: readonly Lesson[],
): Insight<TaughtDateCoverage> {
  const active = activeLessons(lessons);
  return taughtDatesFrom(active.length, accumulate(active));
}

/**
 * Every insight for ONE unit, from ONE sweep of its lessons.
 *
 * Pass the unit's lessons (`unitLessons(...)`); soft-deleted rows are dropped
 * here regardless. Three passes total — this sweep plus the two reused
 * helpers (`unitGaps`, `unitStandards`) — rather than one per metric, since the
 * panel renders on every open-workspace render.
 *
 * Prefer this over the individual functions when the panel shows more than one
 * metric: calling them separately re-sweeps the list once each.
 */
export function unitInsights(
  lessons: readonly Lesson[],
  opts?: UnitInsightsOptions,
): UnitInsights {
  const active = activeLessons(lessons);
  const lessonCount = active.length;
  const t = accumulate(active);
  return {
    lessonCount,
    assessments: assessmentsFrom(lessonCount, t),
    plannedTime: plannedTimeFrom(lessonCount, t),
    prep: prepFrom(lessonCount, t),
    planningGaps: planningGapsFrom(lessonCount, t, unitGaps(active, opts)),
    standards: standardsFrom(lessonCount, t, distinctStandardRefs(active)),
    taughtDates: taughtDatesFrom(lessonCount, t),
  };
}
