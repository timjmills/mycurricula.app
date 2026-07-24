"use client";

// PrepPanel.tsx — the Unit workspace context drawer's Prep / materials panel
// (B3).
//
// A READ-ONLY readiness list: what has to be built, copied, or set up before
// this unit's lessons can be taught. It reads the two planning-prose fields B2
// persists — `Lesson.prep` ("what to ready before teaching") and
// `Lesson.builds` ("prior learning this lesson builds on") — and does nothing
// else. Editing lives in the lesson editor's Builds & prep section; every row
// here opens that lesson rather than growing a second write path.
//
// HONEST DENOMINATOR. The header states "Prep noted on N of M lessons", where M
// is the unit's whole lesson count and N counts only lessons with non-blank
// prep. It is a coverage count of what teachers have WRITTEN DOWN, not a
// readiness score — a lesson with no prep noted may need none, or may simply be
// unplanned, and this panel cannot tell those apart, so it does not pretend to.
// A lesson with only "builds on" still gets a row (its field is labelled), but
// it is NOT counted in the prep numerator, which would inflate it.
//
// EXPLICITLY OUT OF SCOPE: any assessment-prep authoring flow — no rubric
// builder, no item bank, no blueprints. This is a reference surface.
//
// NARROW-FIRST: ~320px on desktop, a full-width band below 900px. Single column
// throughout.

import { useMemo, type ReactNode } from "react";
import type { Lesson } from "@/lib/types";
import type { PlannerDataState } from "@/lib/planner-store";
import { EmptyState, Skeleton, Tooltip } from "@/components/ui";
import { dayShort } from "../unit-tabs/helpers";
import styles from "./PrepPanel.module.css";

// ── Props ────────────────────────────────────────────────────────────────────

export interface PrepPanelProps {
  /**
   * The unit's lessons — already filtered + sorted by `unitLessons()` (archived
   * excluded, week→day order). The panel derives everything from these; it
   * never queries the store, so the drawer host owns the unit scope.
   */
  lessons: readonly Lesson[];
  /**
   * Open a lesson. The host decides what "open" means (today: the Explorer's
   * in-modal switch to the Lesson Planner) — the panel only knows the id.
   */
  onOpenLesson: (lessonId: string) => void;
  /**
   * Planner data readiness, supplied by the host (`usePlannerDataState()`). The
   * panel does NOT call the hook itself, so it stays a pure body.
   *
   * It is consulted ONLY when there is nothing to show — exactly PlannerEmpty's
   * contract. An `error` that arrives after a good hydrate must not blank a list
   * the teacher is reading, so a non-empty `lessons` always renders. Omitted (or
   * "settled") means the empty list is real, not a hydrate in flight.
   */
  dataState?: PlannerDataState;
  className?: string;
}

// ── Derivation ───────────────────────────────────────────────────────────────

/** Both fields are plain-text textareas in the lesson editor, so a blank one can
 *  still be a present empty string — trim before deciding it counts. */
function text(value: string | undefined): string {
  return (value ?? "").trim();
}

interface PrepRow {
  lesson: Lesson;
  prep: string;
  builds: string;
}

/** The lesson's placement + planned length, from store truth only. `time` and
 *  `durationMinutes` drop out when unset rather than reading as a measured 0. */
function lessonMeta(lesson: Lesson): string {
  const parts: string[] = [`Wk ${lesson.week} · ${dayShort(lesson.day)}`];
  if (lesson.time) parts.push(lesson.time);
  if (typeof lesson.durationMinutes === "number") {
    parts.push(`${lesson.durationMinutes} min`);
  }
  return parts.join(" · ");
}

// ── Panel ────────────────────────────────────────────────────────────────────

export function PrepPanel({
  lessons,
  onOpenLesson,
  dataState,
  className,
}: PrepPanelProps): ReactNode {
  const rows = useMemo<PrepRow[]>(() => {
    const out: PrepRow[] = [];
    for (const lesson of lessons) {
      const prep = text(lesson.prep);
      const builds = text(lesson.builds);
      if (prep || builds) out.push({ lesson, prep, builds });
    }
    return out;
  }, [lessons]);

  // Counted separately from `rows`: a builds-only lesson is worth showing but
  // must not inflate the prep coverage number.
  const withPrep = useMemo(
    () => lessons.reduce((n, l) => (text(l.prep) ? n + 1 : n), 0),
    [lessons],
  );

  const rootClass = [styles.root, className].filter(Boolean).join(" ");

  // Data-readiness empty: with no lessons at all we cannot tell "this unit is
  // empty" from "the 11–16s hydrate hasn't landed" or "the hydrate threw", so
  // the host's dataState decides which of the three this is.
  if (lessons.length === 0) {
    if (dataState === "pending") {
      return (
        <div className={rootClass}>
          <Skeleton lines={3} size="sm" label="Loading your plan…" />
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
          body="Prep notes live on lessons — add a lesson to the unit and its materials show up here."
        />
      </div>
    );
  }

  return (
    <div className={rootClass}>
      {/* Stated inline rather than behind a tooltip: this is a number a teacher
          could misread as a readiness score, so the caveat is always visible
          instead of hover-gated. */}
      <div className={styles.coverage}>
        <p className={styles.coverageNum}>
          {withPrep} of {lessons.length}
          <span className={styles.coverageLabel}>
            {" "}
            lesson{lessons.length === 1 ? "" : "s"} have prep noted
          </span>
        </p>
        <p className={styles.coverageCaption}>
          Counts what’s been written down — not whether the unit is ready.
        </p>
      </div>

      {rows.length === 0 ? (
        // Settled data, genuinely nothing recorded — a plain message, not a
        // loading state and not a congratulation.
        <p className={styles.note}>
          Nothing to prepare has been written down for this unit yet. Open a
          lesson to add its materials.
        </p>
      ) : (
        <ul className={styles.list}>
          {rows.map(({ lesson, prep, builds }) => (
            <li key={lesson.id} className={styles.row}>
              <Tooltip
                content="Open this lesson in the Lesson Planner to edit what needs preparing."
                tooltipId="b3-prep-open-lesson"
                side="bottom"
              >
                <button
                  type="button"
                  className={styles.rowHead}
                  onClick={() => onOpenLesson(lesson.id)}
                >
                  <span className={styles.rowTitle}>{lesson.title}</span>
                  <span className={styles.rowMeta}>{lessonMeta(lesson)}</span>
                </button>
              </Tooltip>

              <div className={styles.rowBody}>
                {prep ? (
                  <div className={styles.entry}>
                    <span className={styles.entryLabel}>Prep</span>
                    <p className={styles.entryText}>{prep}</p>
                  </div>
                ) : (
                  <p className={styles.entryMissing}>No prep noted.</p>
                )}
                {builds ? (
                  <div className={styles.entry}>
                    <span className={styles.entryLabel}>Builds on</span>
                    <p className={styles.entryText}>{builds}</p>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
