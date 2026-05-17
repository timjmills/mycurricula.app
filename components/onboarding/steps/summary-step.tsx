"use client";

// summary-step.tsx — onboarding step 9 of 9: "You're all set!"
//
// Reads the full collected configuration back from `data` and displays it as
// a human-readable recap card. No edits happen here — it is a confirmation
// surface only. The wizard's footer button ("Enter the planner") handles the
// finish action; this component renders nothing in the footer.
//
// Fields shown:
//   • Grade level
//   • School week (list of day names)
//   • Schedule rotation type
//   • Subject count (total, and how many are academic)
//   • Default lesson template name
//   • Standards-framework count (or "None selected")

import type { ReactNode } from "react";
import { useOnboarding, WEEKDAY_LABEL } from "@/lib/onboarding-state";
import type { ScheduleRotation } from "@/lib/onboarding-state";
import { LESSON_TEMPLATE_BY_ID } from "@/lib/lesson-templates";
import styles from "./summary-step.module.css";

/** Human-readable label for each rotation mode. */
const ROTATION_LABEL: Record<ScheduleRotation, string> = {
  none: "Standard weekly schedule",
  ab: "A/B rotating schedule",
  cycle: "Custom rotation cycle",
};

/** Step 9 — configuration recap before entering the planner. */
export function SummaryStep(): ReactNode {
  const { data } = useOnboarding();

  const templateName =
    LESSON_TEMPLATE_BY_ID[data.defaultTemplateId]?.name ?? "None";

  const academicCount = data.subjects.filter((s) => s.isAcademic).length;

  const rotationLabel = (() => {
    if (data.rotation === "cycle") {
      return `${ROTATION_LABEL.cycle} (${data.cycleLength}-day)`;
    }
    // Guard: ROTATION_LABEL may not contain the key if localStorage was
    // persisted with a value from a future schema version.
    return ROTATION_LABEL[data.rotation] ?? data.rotation;
  })();

  return (
    <div className={styles.root}>
      <h1 className={styles.heading}>You&rsquo;re all set!</h1>
      <p className={styles.subheading}>
        Here&rsquo;s a summary of your setup. You can change any of this in
        Settings once you&rsquo;re inside the planner.
      </p>

      {/* Recap card — each row is a labelled value pair. */}
      <dl className={styles.card}>
        {/* Grade */}
        <div className={styles.row}>
          <dt className={styles.dt}>Grade</dt>
          <dd className={styles.dd}>Grade {data.grade}</dd>
        </div>

        {/* School week */}
        <div className={styles.row}>
          <dt className={styles.dt}>School week</dt>
          <dd className={styles.dd}>
            {data.weekdays.length === 0
              ? "Not set"
              : data.weekdays.map((id) => WEEKDAY_LABEL[id] ?? id).join(" · ")}
          </dd>
        </div>

        {/* Schedule rotation */}
        <div className={styles.row}>
          <dt className={styles.dt}>Schedule rotation</dt>
          <dd className={styles.dd}>{rotationLabel}</dd>
        </div>

        {/* Subjects */}
        <div className={styles.row}>
          <dt className={styles.dt}>Subjects</dt>
          <dd className={styles.dd}>
            {data.subjects.length === 0 ? (
              "None configured"
            ) : (
              <>
                {data.subjects.length}{" "}
                {data.subjects.length === 1 ? "subject" : "subjects"}
                {academicCount > 0 && (
                  <span className={styles.meta}>
                    {" "}
                    ({academicCount} academic)
                  </span>
                )}
              </>
            )}
          </dd>
        </div>

        {/* Default lesson template */}
        <div className={styles.row}>
          <dt className={styles.dt}>Lesson template</dt>
          <dd className={styles.dd}>{templateName}</dd>
        </div>

        {/* Standards frameworks */}
        <div className={styles.row}>
          <dt className={styles.dt}>Standards</dt>
          <dd className={styles.dd}>
            {data.standards.length === 0 ? (
              <span className={styles.none}>None selected</span>
            ) : (
              <>
                {data.standards.length}{" "}
                {data.standards.length === 1 ? "framework" : "frameworks"}{" "}
                selected
              </>
            )}
          </dd>
        </div>
      </dl>

      {/* Nudge — the button itself is rendered by the wizard footer. */}
      <p className={styles.nudge}>
        Press <strong>Enter the planner</strong> to start building your
        curriculum.
      </p>
    </div>
  );
}
