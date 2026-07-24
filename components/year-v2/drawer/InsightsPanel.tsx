"use client";

// InsightsPanel.tsx — the Unit workspace context drawer's Insights panel (B3).
//
// A READ-ONLY summary of what this unit's planning actually says. Every figure
// comes from `lib/unit-insights.ts`, which returns each metric as a
// discriminated `Insight<T>`: either a value backed by real lesson fields, or an
// explicit `unavailable` with a reason. This file's ONE job on top of that is to
// render the unavailable arm as words — never as a zero, a dash, or a hidden
// row that lets a reader assume the metric was measured and came back empty.
//
// WHY THAT MATTERS HERE. The 7.21 prototype's Insights block computed seven
// metrics wrongly, and every one of them failed in the same direction: it
// invented a number. A standards ratio that could read "5 of 3"; a
// `stdsTotal || stdsCov` fallback that painted a full green bar and "7 of 7"
// for a unit with no standards at all; a pace that said "Done" for an expired
// unit nothing had been taught in; a "missing differentiation" count that read a
// field name production never writes, so it fired on every lesson forever. None
// of those are ported. What is NOT here is as deliberate as what is:
//
//   • NO pace, projected finish, ahead/behind, or days-left. That needs the
//     configurable school-week calendar (CLAUDE.md §1 — never a 5-day
//     assumption) and a real taught date, and we have neither.
//   • NO standards coverage percentage. The denominator would be the unit's own
//     standards list, which has no editor yet — a ratio against an empty set is
//     the "7 of 7" bug. Distinct codes and per-code reinforcement are real, so
//     those are what show, and the panel says out loud why there is no percent.
//   • NO overall "readiness score". Rolling honest partial counts into one
//     number would hide every denominator that makes them honest.
//
// The completion figure (taught / total) is deliberately absent too — it belongs
// to the workspace header's `unitPace`, and duplicating it here would give a
// teacher two places to read the same truth.
//
// NARROW-FIRST: ~320px on desktop, a full-width band below 900px. Single column
// throughout; the standards list is the only thing that wraps.

import { useMemo, useState, type ReactNode } from "react";
import type { Lesson } from "@/lib/types";
import type { PlannerDataState } from "@/lib/planner-store";
import {
  Button,
  EmptyState,
  Skeleton,
  StandardPill,
  Tooltip,
} from "@/components/ui";
import {
  unitInsights,
  type Insight,
  type StandardsSpread,
} from "@/lib/unit-insights";
import styles from "./InsightsPanel.module.css";

// ── Props ────────────────────────────────────────────────────────────────────

export interface InsightsPanelProps {
  /**
   * The unit's lessons — already filtered + sorted by `unitLessons()` (archived
   * excluded, week→day order). The panel derives everything from these and never
   * queries the store, so the drawer host owns the unit scope.
   *
   * PROPS-IN, NO STORE READS. This panel calls no planner hook at all — not
   * `usePlanner()` and not `usePlannerDataState()`. The host (UnitExplorer)
   * already memoizes this list and owns unit resolution including the
   * "subject vanished from the catalog → close" guard, so a panel that
   * re-resolved could disagree with its own host mid-render; and a hook-free
   * panel can also mount outside a PlannerProvider (the Planner Hub supplies a
   * unit without owning navigation).
   */
  lessons: readonly Lesson[];
  /**
   * Data readiness, owned and passed by the host.
   *
   * REQUIRED IN PRACTICE, optional in the type only so a caller that already
   * knows its data is settled needn't thread it. The Supabase hydrate takes
   * 11–16s, during which `lessons` is legitimately empty — with no `dataState`
   * this panel cannot tell "this unit has no lessons" from "the plan hasn't
   * arrived", and will render the settled empty state. A host mounting this
   * against live planner data MUST pass `usePlannerDataState()` through, or a
   * mid-hydrate unit reads as genuinely empty (the 7.16 cutover failure mode).
   */
  dataState?: PlannerDataState;
  /**
   * Does this lesson have ANY resource, counting SECTION resources? Supplied by
   * the host, which can reach `getSections`; this panel stays store-free.
   *
   * Without it, "Needs attention" counts a lesson whose resources all live on
   * its sections as having none — claiming a gap for a lesson whose Resources
   * tab, one click away in the same modal, lists them.
   */
  hasResources?: (lesson: Lesson) => boolean;
  className?: string;
}

// ── Display helpers ──────────────────────────────────────────────────────────

/** Minutes as a teacher would say them. Rounded for display only — the sum
 *  itself is never rounded, extrapolated, or averaged out to a whole unit. */
function formatMinutes(total: number): string {
  const whole = Math.round(total);
  const hours = Math.floor(whole / 60);
  const mins = whole % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}

/** Percentage for a decorative meter. Guarded so an empty denominator paints an
 *  empty bar rather than NaN — a bar is only ever drawn beside a figure that
 *  states its own N and M, so it can never be the sole source of a number. */
function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

// ── Building blocks ──────────────────────────────────────────────────────────

/** One metric section: a heading (which carries the metric's tooltip) and body. */
function Metric({
  title,
  tooltip,
  tooltipId,
  children,
}: {
  title: string;
  tooltip: string;
  tooltipId: string;
  children: ReactNode;
}): ReactNode {
  return (
    <section className={styles.metric}>
      <Tooltip content={tooltip} tooltipId={tooltipId} side="bottom">
        {/* Focusable so the explanation reaches the keyboard too, not just the
            pointer (CLAUDE.md §4) — the same pattern PrepPanel uses. */}
        <h3 className={styles.metricHead} tabIndex={0}>
          {title}
        </h3>
      </Tooltip>
      {children}
    </section>
  );
}

/** The headline number + the sentence that gives it its denominator. */
function Figure({
  value,
  caption,
  tone,
}: {
  value: string;
  caption: string;
  tone?: "warn";
}): ReactNode {
  return (
    <p className={styles.figure}>
      <span className={styles.figureValue} data-tone-accent={tone}>
        {value}
      </span>
      <span className={styles.figureCaption}>{caption}</span>
    </p>
  );
}

/** A decorative proportion bar. `aria-hidden` on purpose: the adjacent Figure
 *  already states the real N of M, so the bar adds nothing for a screen reader
 *  and a second reading of the same fact would only risk disagreeing with it. */
function Meter({
  part,
  whole,
  tone,
}: {
  part: number;
  whole: number;
  tone?: "warn";
}): ReactNode {
  return (
    <div className={styles.meter} aria-hidden="true">
      <span
        className={styles.meterFill}
        data-tone-accent={tone}
        style={{ width: `${percent(part, whole)}%` }}
      />
    </div>
  );
}

/** One sub-count row under a figure ("Formative 3"). `hint` opts the label into
 *  a tooltip — used where the label alone can't teach what the bucket means. */
interface BreakdownRow {
  key: string;
  label: string;
  value: string;
  hint?: string;
}

/** A sub-count under a figure ("Formative 3"). */
function Breakdown({
  rows,
}: {
  rows: readonly BreakdownRow[];
}): ReactNode {
  return (
    <ul className={styles.breakdown}>
      {rows.map((row) => (
        <li key={row.key} className={styles.breakdownRow}>
          {row.hint ? (
            <Tooltip
              content={row.hint}
              tooltipId={`b3-ins-${row.key}`}
              side="bottom"
            >
              <span className={styles.breakdownLabel} tabIndex={0}>
                {row.label}
              </span>
            </Tooltip>
          ) : (
            <span className={styles.breakdownLabel}>{row.label}</span>
          )}
          <span className={styles.breakdownValue}>{row.value}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The unavailable arm, rendered as a sentence.
 *
 * This is the whole honesty mechanism at the UI layer: a metric with no backing
 * data says so in words. It never falls back to "0", never renders an empty
 * meter that reads as a measured zero, and never hides the section (an absent
 * section would let a reader conclude the metric didn't apply).
 */
function Unavailable({ children }: { children: ReactNode }): ReactNode {
  return <p className={styles.unavailable}>{children}</p>;
}

// ── Standards list (the only sub-list with its own state) ────────────────────

/** How many code pills show before the list collapses. The full count is always
 *  stated in the figure above, so collapsing hides rows, never the total. */
const CODES_PREVIEW = 8;

function StandardsBody({
  insight,
}: {
  insight: Insight<StandardsSpread>;
}): ReactNode {
  const [showAll, setShowAll] = useState(false);

  // Most-reinforced first, then by code so the order is stable. `unitStandards`
  // returns code order; re-sorting is a display choice, and the count on every
  // pill means the order can never imply a number that isn't shown.
  const ranked = useMemo(() => {
    if (insight.state !== "available") return [];
    return [...insight.value.codes].sort(
      (a, b) => b.lessonCount - a.lessonCount || a.code.localeCompare(b.code),
    );
  }, [insight]);

  if (insight.state !== "available") {
    return (
      <Unavailable>
        This unit has no lessons to read standards from yet.
      </Unavailable>
    );
  }

  const { distinctCodes, lessonsTagged, lessonsUntagged } = insight.value;
  const { lessonCount } = insight;

  if (distinctCodes === 0) {
    return (
      <Unavailable>
        No standards are tagged on any of this unit’s {lessonCount}{" "}
        {plural(lessonCount, "lesson", "lessons")} yet. Tag them on a lesson and
        they’ll be listed here.
      </Unavailable>
    );
  }

  const shown = showAll ? ranked : ranked.slice(0, CODES_PREVIEW);

  return (
    <>
      <Figure
        value={String(distinctCodes)}
        caption={`distinct ${plural(distinctCodes, "standard", "standards")} tagged across ${lessonsTagged} of ${lessonCount} ${plural(lessonCount, "lesson", "lessons")}`}
      />

      <ul className={styles.codes}>
        {shown.map(({ identity, code, lessonCount: hits }) => (
          // Keyed by identity, never by code: two frameworks can share a code
          // (AERO / WIDA "S1"), and duplicate keys make React's reconciliation
          // unstable as counts and order change.
          <li key={identity} className={styles.codeItem}>
            <StandardPill code={code} />
            <span className={styles.codeHits}>
              {hits} {plural(hits, "lesson", "lessons")}
            </span>
          </li>
        ))}
      </ul>

      {ranked.length > CODES_PREVIEW ? (
        <div className={styles.moreSlot}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAll((v) => !v)}
            tooltip={
              showAll
                ? "Collapse the list back to the most-reinforced standards"
                : "List every standard tagged in this unit, with how many lessons reinforce each"
            }
            tooltipSide="top"
          >
            {showAll ? "Show fewer" : `Show all ${ranked.length}`}
          </Button>
        </div>
      ) : null}

      {lessonsUntagged > 0 ? (
        <p className={styles.note}>
          {lessonsUntagged} {plural(lessonsUntagged, "lesson", "lessons")} in
          this unit {plural(lessonsUntagged, "has", "have")} no standards tagged.
        </p>
      ) : null}

      {/* Says out loud why there is no percentage — the prototype's fabricated
          "7 of 7" was exactly this number, invented from a missing denominator. */}
      <p className={styles.note}>
        There’s no coverage percentage here: a unit has no standards list to
        measure against yet, so any “x of y” would be made up.
      </p>
    </>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────

export function InsightsPanel({
  lessons,
  dataState,
  hasResources,
  className,
}: InsightsPanelProps): ReactNode {
  const insights = useMemo(
    () => unitInsights(lessons, hasResources ? { hasResources } : undefined),
    [lessons, hasResources],
  );
  const rootClass = [styles.root, className].filter(Boolean).join(" ");

  // Readiness is consulted ONLY when there is nothing to show — PlannerEmpty's
  // contract, done by prop rather than by hook so the panel stays store-free,
  // and the same ordering AssessmentsPanel and PrepPanel use.
  //
  // The order matters: an `error` that arrives AFTER a good hydrate (a failed
  // background refresh) must not blank metrics the teacher is already reading.
  // Checking readiness first would do exactly that. The original worry —
  // "a denominator computed from a half-arrived list is a wrong number" — does
  // not arise, because the store holds `loading` across the entire hydrate chain
  // with no mid-flight partial list, so a pending store IS an empty list and is
  // caught below.
  if (insights.lessonCount === 0) {
    if (dataState === "pending") {
      return (
        <div className={rootClass}>
          <Skeleton lines={4} size="sm" label="Loading your plan…" />
        </div>
      );
    }
    if (dataState === "error") {
      return (
        <div className={rootClass}>
          <EmptyState
            size="sm"
            heading="Couldn’t load your plan"
            body="Check your connection and reload. Your saved work is safe."
          />
        </div>
      );
    }
    return (
      <div className={rootClass}>
        <EmptyState
          size="sm"
          heading="No lessons in this unit yet."
          body="Insights read the unit’s lessons — add one and its planning shows up here."
        />
      </div>
    );
  }

  const total = insights.lessonCount;
  const { assessments, plannedTime, prep, planningGaps, taughtDates } =
    insights;

  return (
    <div className={rootClass}>
      {/* ── Needs attention ─────────────────────────────────────────────── */}
      <Metric
        title="Needs attention"
        tooltip="Lessons you haven’t taught yet that are missing an objective, resources, or standards. Lessons already marked done aren’t counted — their planning is history."
        tooltipId="b3-ins-gaps"
      >
        {planningGaps.state !== "available" ? (
          <Unavailable>This unit has no lessons to check yet.</Unavailable>
        ) : planningGaps.value.notTaught === 0 ? (
          <p className={styles.note}>
            Every lesson in this unit is marked done, so there’s nothing left to
            plan.
          </p>
        ) : (
          <>
            <Figure
              value={`${planningGaps.value.gaps.lessonsWithGaps} of ${planningGaps.value.notTaught}`}
              caption={`${plural(planningGaps.value.notTaught, "lesson", "lessons")} still to teach ${plural(planningGaps.value.gaps.lessonsWithGaps, "is", "are")} missing something`}
              tone={
                planningGaps.value.gaps.lessonsWithGaps > 0 ? "warn" : undefined
              }
            />
            <Meter
              part={planningGaps.value.gaps.lessonsWithGaps}
              whole={planningGaps.value.notTaught}
              tone={
                planningGaps.value.gaps.lessonsWithGaps > 0 ? "warn" : undefined
              }
            />
            <Breakdown
              rows={[
                {
                  key: "gap-objective",
                  label: "No “I can” objective",
                  value: String(planningGaps.value.gaps.missingObjective),
                },
                {
                  key: "gap-resources",
                  label: "No resources",
                  value: String(planningGaps.value.gaps.missingResources),
                },
                {
                  key: "gap-standards",
                  label: "No standards",
                  value: String(planningGaps.value.gaps.missingStandards),
                },
              ]}
            />
          </>
        )}
      </Metric>

      {/* ── Assessment ──────────────────────────────────────────────────── */}
      <Metric
        // "LESSON assessments", not "Assessment". A unit also owns assessments
        // of its own (the Assessments pane's top half), and this metric counts
        // only the ones hanging off lessons. Titled bare, a unit with three
        // unit-level assessments would read "0 of 8 lessons have an assessment"
        // one click away from a pane listing three — technically true, and
        // exactly the kind of true-but-misleading number this panel exists to
        // avoid.
        title="Lesson assessments"
        tooltip="How many of this unit’s lessons carry an assessment of their own. Assessments owned by the whole unit are listed in the Assessments pane and aren’t counted here. It counts what’s been written down, not how well anything went."
        tooltipId="b3-ins-assessment"
      >
        {assessments.state !== "available" ? (
          <Unavailable>This unit has no lessons to check yet.</Unavailable>
        ) : (
          <>
            <Figure
              value={`${assessments.value.withAssessment} of ${total}`}
              caption={`${plural(total, "lesson", "lessons")} ${plural(assessments.value.withAssessment, "has", "have")} an assessment`}
            />
            <Meter part={assessments.value.withAssessment} whole={total} />
            <Breakdown
              rows={[
                {
                  key: "assess-formative",
                  label: "Formative",
                  value: String(assessments.value.formative),
                },
                {
                  key: "assess-summative",
                  label: "Summative",
                  value: String(assessments.value.summative),
                },
                ...(assessments.value.unclassified > 0
                  ? [
                      {
                        key: "assess-unclassified",
                        label: "No kind set",
                        value: String(assessments.value.unclassified),
                        hint: "Assessments with a title or notes but no formative/summative kind. They’re real assessments — counted here so a two-way split can’t quietly drop them.",
                      },
                    ]
                  : []),
              ]}
            />
          </>
        )}
      </Metric>

      {/* ── Planned time ────────────────────────────────────────────────── */}
      <Metric
        title="Planned time"
        tooltip="The lesson durations that have been set, added up. Lessons with no duration aren’t counted and aren’t estimated."
        tooltipId="b3-ins-time"
      >
        {plannedTime.state !== "available" ? (
          <Unavailable>
            {plannedTime.reason === "no_lessons" ? (
              "This unit has no lessons to add up yet."
            ) : (
              <>
                No duration is set on any of this unit’s {total}{" "}
                {plural(total, "lesson", "lessons")}, so there’s no total to
                show. Set a duration on a lesson and it’ll add up here.
              </>
            )}
          </Unavailable>
        ) : (
          <>
            <Figure
              value={formatMinutes(plannedTime.value.totalMinutes)}
              caption={`across ${plannedTime.value.lessonsWithDuration} of ${total} ${plural(total, "lesson", "lessons")}`}
            />
            <Meter part={plannedTime.value.lessonsWithDuration} whole={total} />
            {plannedTime.value.complete ? null : (
              <p className={styles.note}>
                {plannedTime.value.lessonsMissingDuration}{" "}
                {plural(
                  plannedTime.value.lessonsMissingDuration,
                  "lesson has",
                  "lessons have",
                )}{" "}
                no duration set, so the real unit is longer than this. Nothing is
                estimated for them.
              </p>
            )}
          </>
        )}
      </Metric>

      {/* ── Prep ────────────────────────────────────────────────────────── */}
      <Metric
        title="Prep noted"
        tooltip="Lessons with prep/materials or prior-learning notes written down. A lesson with nothing noted may need nothing — this counts what’s written, not readiness."
        tooltipId="b3-ins-prep"
      >
        {prep.state !== "available" ? (
          <Unavailable>This unit has no lessons to check yet.</Unavailable>
        ) : (
          <>
            <Figure
              value={`${prep.value.withEither} of ${total}`}
              caption={`${plural(total, "lesson", "lessons")} ${plural(prep.value.withEither, "has", "have")} prep or prior-learning notes`}
            />
            <Meter part={prep.value.withEither} whole={total} />
            <Breakdown
              rows={[
                {
                  key: "prep-materials",
                  label: "Prep / materials",
                  value: String(prep.value.withPrep),
                },
                {
                  key: "prep-builds",
                  label: "Builds on",
                  value: String(prep.value.withBuilds),
                },
              ]}
            />
          </>
        )}
      </Metric>

      {/* ── Standards ───────────────────────────────────────────────────── */}
      <Metric
        title="Standards"
        tooltip="Which standards this unit’s lessons are tagged with, and how many lessons reinforce each one."
        tooltipId="b3-ins-standards"
      >
        <StandardsBody insight={insights.standards} />
      </Metric>

      {/* ── Teaching dates ──────────────────────────────────────────────── */}
      <Metric
        title="Teaching dates"
        tooltip="When this unit’s lessons were actually taught. The app doesn’t record that yet, so there’s nothing to show."
        tooltipId="b3-ins-taught"
      >
        {taughtDates.state !== "available" ? (
          <Unavailable>
            The app doesn’t record the date a lesson was actually taught, so
            there’s no timeline to show — and no pacing or finish estimate can be
            honest without one. Marking a lesson done is a separate signal, not a
            date.
          </Unavailable>
        ) : (
          <>
            <Figure
              value={`${taughtDates.value.lessonsWithDate} of ${total}`}
              caption={`${plural(total, "lesson", "lessons")} ${plural(taughtDates.value.lessonsWithDate, "has", "have")} a recorded teaching date`}
            />
            <Breakdown
              rows={[
                {
                  key: "taught-first",
                  label: "First taught",
                  value: taughtDates.value.firstTaughtAt,
                },
                {
                  key: "taught-last",
                  label: "Last taught",
                  value: taughtDates.value.lastTaughtAt,
                },
              ]}
            />
          </>
        )}
      </Metric>
    </div>
  );
}
