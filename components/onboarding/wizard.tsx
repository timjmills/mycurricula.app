"use client";

// wizard.tsx — the onboarding wizard shell.
//
// Renders the chrome shared by every step: the progress bar, a step
// counter, the active step's content, and the Back / Skip / Continue
// footer. Each step component (components/onboarding/steps/*) renders only
// its own heading and controls and reads/writes the collected config via
// useOnboarding(); it never renders navigation.
//
// The summary step's primary button finishes onboarding and routes to the
// planner. The standards and schedule steps are skippable.

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useOnboarding } from "@/lib/onboarding-state";
import { Button } from "@/components/ui";
import { WelcomeStep } from "./steps/welcome-step";
import { GradeStep } from "./steps/grade-step";
import { SchoolWeekStep } from "./steps/school-week-step";
import { RotationStep } from "./steps/rotation-step";
import { SubjectsStep } from "./steps/subjects-step";
import { LessonTemplateStep } from "./steps/lesson-template-step";
import { StandardsStep } from "./steps/standards-step";
import { ScheduleStep } from "./steps/schedule-step";
import { SummaryStep } from "./steps/summary-step";
import styles from "./wizard.module.css";

/** Steps a teacher may skip without making a choice. */
const SKIPPABLE = new Set(["standards", "schedule"]);

export function OnboardingWizard(): ReactNode {
  const router = useRouter();
  const { stepIndex, stepId, totalSteps, next, back, finish, hydrated } =
    useOnboarding();
  // Focus the step-counter region when the step changes so screen-reader and
  // keyboard users land at the top of the new step content rather than wherever
  // focus happened to be on the previous step.
  const stepCountRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stepCountRef.current?.focus();
  }, [stepIndex]);

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === totalSteps - 1;
  const progress = ((stepIndex + 1) / totalSteps) * 100;

  function handleContinue(): void {
    if (isLast) {
      finish();
      router.push("/weekly");
      return;
    }
    next();
  }

  const continueLabel = isFirst
    ? "Get started"
    : isLast
      ? "Enter the planner"
      : "Continue";

  return (
    <div className={styles.shell}>
      <div
        className={styles.progress}
        role="progressbar"
        aria-valuenow={stepIndex + 1}
        aria-valuemin={1}
        aria-valuemax={totalSteps}
        aria-label="Onboarding progress"
        aria-valuetext={`Step ${stepIndex + 1} of ${totalSteps}`}
      >
        <div
          className={styles.progressFill}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className={styles.body}>
        <div className={styles.card}>
          {/* tabIndex={-1} makes the element programmatically focusable for
              the step-change focus-management effect above; it is never in
              the natural tab order. */}
          <div
            className={styles.stepCount}
            ref={stepCountRef}
            tabIndex={-1}
            aria-live="polite"
          >
            Step {stepIndex + 1} of {totalSteps}
          </div>
          {/* Suppress step content until localStorage has been read; without
              this guard the teacher sees a flash of the default (blank) state
              before the resumed step and data paint in. The progress bar and
              footer are already keyed from the same stepIndex so they render
              correctly once hydrated. */}
          {hydrated && (
            <>
              {stepId === "welcome" && <WelcomeStep />}
              {stepId === "grade" && <GradeStep />}
              {stepId === "school-week" && <SchoolWeekStep />}
              {stepId === "rotation" && <RotationStep />}
              {stepId === "subjects" && <SubjectsStep />}
              {stepId === "lesson-template" && <LessonTemplateStep />}
              {stepId === "standards" && <StandardsStep />}
              {stepId === "schedule" && <ScheduleStep />}
              {stepId === "summary" && <SummaryStep />}
            </>
          )}
        </div>
      </div>

      <div className={styles.footer}>
        {!isFirst && (
          <Button
            variant="secondary"
            size="md"
            onClick={back}
            aria-label="Go to previous step"
            tooltip="Go back one step in the setup wizard — your answers on the current step stay saved"
            leadingIcon={<span aria-hidden="true">←</span>}
          >
            Back
          </Button>
        )}
        <div className={styles.spacer} />
        {SKIPPABLE.has(stepId) && (
          <Button
            variant="ghost"
            size="md"
            onClick={next}
            tooltip="Skip this optional setup step — you can complete it later from Settings"
          >
            Skip for now
          </Button>
        )}
        <Button
          variant="primary"
          size="lg"
          onClick={handleContinue}
          tooltip="Save the current step and continue to the next part of setup"
        >
          {continueLabel}
        </Button>
      </div>
    </div>
  );
}
