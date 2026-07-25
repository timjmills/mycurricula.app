"use client";

// summary-step.tsx — v2 onboarding final step: the recap.
//
// Reads the collected configuration back and shows it as a human-readable
// recap. No edits happen here — the footer owns the finish action (the Home
// exit vs "Start planning").
//
// HONESTY. Finishing stamps `teachers.onboarded_at`, so the wizard never runs
// again on ANY device — but only some of these answers are stored where a
// second device can see them. A blanket "saved on this device for now" used to
// stand in for that, and it was wrong in both directions. Each row now carries
// its real destination (ONBOARDING_PERSISTENCE), and the rows that will not
// travel are named together underneath, so a teacher who set up on a laptop
// knows what to expect on their phone rather than meeting a planner that
// believes it is configured and is not.

import type { ReactNode } from "react";
import { useOnboardingV2 } from "@/lib/onboarding-v2-state";
import { WEEKDAY_LABEL_LONG, useSchoolWeek } from "@/lib/use-school-week";
import type { Weekday } from "@/lib/use-school-week";
import { LESSON_TEMPLATE_BY_ID } from "@/lib/lesson-templates";
import {
  ONBOARDING_PERSISTENCE_BY_LABEL,
  deviceLocalAnswers,
} from "@/lib/onboarding-v2-shape";
import type { OnboardingV2Data } from "@/lib/onboarding-v2-shape";
import styles from "./steps-v2.module.css";

const ROTATION_LABEL: Record<OnboardingV2Data["rotation"], string> = {
  none: "Standard weekly schedule",
  ab: "A / B rotating schedule",
  cycle: "Custom rotation cycle",
};

/**
 * One recap line. The `label` doubles as the ONBOARDING_PERSISTENCE key, so a
 * row whose label drifts loses its caption visibly (an unlabelled row) rather
 * than silently claiming durability it does not have.
 *
 * `showWhere` is false on the prototype path, where nothing syncs at all and a
 * per-row "this browser only" on every line would be noise — the single note
 * above the list says it once.
 */
function RecapRow({
  label,
  showWhere,
  overrideDetail,
  children,
}: {
  label: string;
  showWhere: boolean;
  /** Replaces the static caption when the live outcome contradicts it. */
  overrideDetail?: string;
  children: ReactNode;
}): ReactNode {
  const note = ONBOARDING_PERSISTENCE_BY_LABEL.get(label);
  const detail = overrideDetail ?? note?.detail;
  return (
    <div className={styles.recapRow}>
      <dt className={styles.recapKey}>{label}</dt>
      <dd className={styles.recapVal}>
        {children}
        {showWhere && detail && (
          <span className={styles.recapMeta}> — {detail}</span>
        )}
      </dd>
    </div>
  );
}

export function SummaryStep(): ReactNode {
  const { data, localOnly } = useOnboardingV2();
  // The SCHOOL WEEK is the one answer whose write can be REFUSED (only a
  // workspace admin may change a team-wide setting), and the write happened two
  // steps ago. `saveState` is shared across hook instances precisely so this
  // recap can contradict its own static caption when the database said no —
  // otherwise a teacher whose week was rejected would be told it "saved for
  // your whole team" on the way out, and the wizard would never re-offer.
  const { saveState } = useSchoolWeek();
  const weekRejected =
    saveState.status === "denied" || saveState.status === "failed";
  const weekDetail = weekRejected
    ? `NOT saved — ${saveState.message}`
    : saveState.status === "saving"
      ? "still saving…"
      : undefined;

  // A rejected week does not "follow you"; fold it in with the device-local
  // answers so the closing sentence stays true.
  const deviceOnly = deviceLocalAnswers();
  const notFollowing = [
    ...deviceOnly.map((n) => n.label),
    ...(weekRejected ? ["School week"] : []),
  ];

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
          Saved on this device only — this build has no backend connected, so
          none of it will follow you to another computer or phone.
        </p>
      )}

      <dl className={styles.recap}>
        <RecapRow label="Workspace" showWhere={!localOnly}>
          {data.workspaceMode === "team"
            ? "Planning with a team"
            : "Planning solo"}
        </RecapRow>
        <RecapRow label="Subjects" showWhere={!localOnly}>
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
        </RecapRow>
        <RecapRow
          label="School week"
          showWhere={!localOnly}
          overrideDetail={weekDetail}
        >
          {data.weekdays.length === 0
            ? "Not set"
            : data.weekdays
                .map((id) => WEEKDAY_LABEL_LONG[id as Weekday] ?? id)
                .join(" · ")}
        </RecapRow>
        <RecapRow label="Rotation" showWhere={!localOnly}>
          {rotationLabel}
        </RecapRow>
        <RecapRow label="School year" showWhere={!localOnly}>
          {yearLabel}
        </RecapRow>
        <RecapRow label="Lesson template" showWhere={!localOnly}>
          {templateName}
        </RecapRow>
      </dl>

      {!localOnly && notFollowing.length > 0 && (
        <p
          className={weekRejected ? styles.fieldError : styles.note}
          role="note"
          style={{ marginTop: 16 }}
        >
          {notFollowing.join(", ")} {notFollowing.length === 1 ? "is" : "are"}{" "}
          not saved to your account, so you may need to set{" "}
          {notFollowing.length === 1 ? "it" : "them"} again on another device.
          Everything else follows you. Settings has all of it, and you can
          re-open this setup from Settings any time.
        </p>
      )}

      <p className={styles.fieldHint} style={{ marginTop: 16 }}>
        Head to your Home dashboard, or jump straight into planning.
      </p>
    </div>
  );
}
