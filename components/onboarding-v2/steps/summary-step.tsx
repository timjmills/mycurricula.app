"use client";

// summary-step.tsx — v2 onboarding final step: the recap.
//
// Reads the collected configuration back and shows it as a human-readable
// recap. No edits happen here — the footer owns the finish action ("Take the
// tour" vs "Start planning"). The honesty caveat mirrors the v1 summary: the
// config persists to THIS device until the backend lands.

import type { ReactNode } from "react";
import { useOnboardingV2 } from "@/lib/onboarding-v2-state";
import { WEEKDAY_LABEL_LONG } from "@/lib/use-school-week";
import type { Weekday } from "@/lib/use-school-week";
import { LESSON_TEMPLATE_BY_ID } from "@/lib/lesson-templates";
import type { OnboardingV2Data } from "@/lib/onboarding-v2-shape";
import styles from "./steps-v2.module.css";

const ROTATION_LABEL: Record<OnboardingV2Data["rotation"], string> = {
  none: "Standard weekly schedule",
  ab: "A / B rotating schedule",
  cycle: "Custom rotation cycle",
};

export function SummaryStep(): ReactNode {
  const { data, localOnly } = useOnboardingV2();

  const templateName =
    LESSON_TEMPLATE_BY_ID[data.defaultTemplateId]?.name ?? "None";
  const academicCount = data.subjects.filter((s) => s.isAcademic).length;

  const rotationLabel =
    data.rotation === "cycle"
      ? `${ROTATION_LABEL.cycle} (${data.cycleLength}-day)`
      : (ROTATION_LABEL[data.rotation] ?? data.rotation);

  const yearLabel =
    data.yearStart && data.yearEnd
      ? `${data.yearStart} → ${data.yearEnd}`
      : "Not set yet";

  return (
    <div>
      <h1 className={styles.heading}>You&rsquo;re all set!</h1>
      <p className={styles.helper}>
        Here&rsquo;s your setup. You can change any of it in Settings once
        you&rsquo;re inside the planner.
      </p>
      {localOnly && (
        <p className={styles.note} role="note" style={{ marginBottom: 16 }}>
          Saved on this device for now — your setup syncs to your team once
          backend sync is on.
        </p>
      )}

      <dl className={styles.recap}>
        <div className={styles.recapRow}>
          <dt className={styles.recapKey}>Workspace</dt>
          <dd className={styles.recapVal}>
            {data.workspaceMode === "team"
              ? "Planning with a team"
              : "Planning solo"}
          </dd>
        </div>
        <div className={styles.recapRow}>
          <dt className={styles.recapKey}>Subjects</dt>
          <dd className={styles.recapVal}>
            {data.subjects.length === 0 ? (
              "None configured"
            ) : (
              <>
                {data.subjects.length}{" "}
                {data.subjects.length === 1 ? "subject" : "subjects"}
                {academicCount > 0 && (
                  <span className={styles.recapMeta}>
                    {" "}
                    ({academicCount} with lessons)
                  </span>
                )}
              </>
            )}
          </dd>
        </div>
        <div className={styles.recapRow}>
          <dt className={styles.recapKey}>School week</dt>
          <dd className={styles.recapVal}>
            {data.weekdays.length === 0
              ? "Not set"
              : data.weekdays
                  .map((id) => WEEKDAY_LABEL_LONG[id as Weekday] ?? id)
                  .join(" · ")}
          </dd>
        </div>
        <div className={styles.recapRow}>
          <dt className={styles.recapKey}>Rotation</dt>
          <dd className={styles.recapVal}>{rotationLabel}</dd>
        </div>
        <div className={styles.recapRow}>
          <dt className={styles.recapKey}>School year</dt>
          <dd className={styles.recapVal}>{yearLabel}</dd>
        </div>
        <div className={styles.recapRow}>
          <dt className={styles.recapKey}>Lesson template</dt>
          <dd className={styles.recapVal}>{templateName}</dd>
        </div>
      </dl>

      <p className={styles.fieldHint} style={{ marginTop: 16 }}>
        Take a quick tour of the app, or jump straight into planning.
      </p>
    </div>
  );
}
