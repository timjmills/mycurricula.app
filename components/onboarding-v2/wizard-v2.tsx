"use client";

// wizard-v2.tsx — the v2 onboarding wizard shell.
//
// Renders the chrome shared by every step: the progress bar, a left step-rail,
// the active step's content, and the Back / Skip / Continue footer. Each step
// component (./steps/*) renders only its own heading + controls and reads /
// writes the collected config via useOnboardingV2(); it never renders
// navigation.
//
// The wizard is WORKSPACE-FIRST (the locked product model): workspace → courses
// → schedule → year → appearance → summary. It ends with a choice — "Take the
// tour" (the startScreenTour() stub) or "Start planning" (→ /weekly). Escape is
// intentionally a NO-OP: this is a first-run gate, so an accidental Escape must
// not drop the teacher out of setup (they leave via the finish buttons; their
// progress is resumable regardless).
//
// NotebookProvider is mounted here (Settings does the same) so the workspace
// step can read the resolved workspace name + isWorkspaceAdmin — the onboarding
// route lives outside the (planner) group, which has no provider above it.

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { NotebookProvider } from "@/lib/notebook-state";
import { useOnboardingV2 } from "@/lib/onboarding-v2-state";
import { SKIPPABLE_V2_STEPS } from "@/lib/onboarding-v2-shape";
import type { OnboardingV2StepId } from "@/lib/onboarding-v2-shape";
import { startScreenTour } from "@/lib/screen-tour";
import { Button } from "@/components/ui";
import { WorkspaceStep } from "./steps/workspace-step";
import { CoursesStep } from "./steps/courses-step";
import { ScheduleStep } from "./steps/schedule-step";
import { YearStep } from "./steps/year-step";
import { AppearanceStep } from "./steps/appearance-step";
import { SummaryStep } from "./steps/summary-step";
import styles from "./wizard-v2.module.css";

/** Short rail labels, in step order. Keep in lockstep with ONBOARDING_V2_STEPS. */
const RAIL: readonly { id: OnboardingV2StepId; label: string }[] = [
  { id: "workspace", label: "Workspace" },
  { id: "courses", label: "Subjects" },
  { id: "schedule", label: "Schedule" },
  { id: "year", label: "School year" },
  { id: "appearance", label: "Appearance" },
  { id: "summary", label: "Review" },
];

function CheckMark(): ReactNode {
  return (
    <svg aria-hidden width="12" height="10" viewBox="0 0 12 10" fill="none">
      <path
        d="M1 5l3.5 3.5L11 1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function OnboardingWizardV2(): ReactNode {
  const router = useRouter();
  const { stepIndex, stepId, totalSteps, next, back, goTo, finish, hydrated } =
    useOnboardingV2();

  // Focus the step-counter on step change so screen-reader + keyboard users
  // land at the top of the new step.
  const stepCountRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stepCountRef.current?.focus();
  }, [stepIndex]);

  const isFirst = stepIndex === 0;
  const isSummary = stepId === "summary";
  const isSkippable = SKIPPABLE_V2_STEPS.has(stepId);
  const progress = ((stepIndex + 1) / totalSteps) * 100;

  const finishTo = (dest: () => void): void => {
    finish();
    dest();
  };

  return (
    <NotebookProvider>
      <div className={styles.shell}>
        <div className={styles.card}>
          {/* Progress bar */}
          <div
            className={styles.progress}
            role="progressbar"
            aria-valuenow={stepIndex + 1}
            aria-valuemin={1}
            aria-valuemax={totalSteps}
            aria-label="Setup progress"
            aria-valuetext={`Step ${stepIndex + 1} of ${totalSteps}`}
          >
            <div
              className={styles.progressFill}
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className={styles.body}>
            {/* ── Step rail ─────────────────────────────────────────────── */}
            <nav className={styles.rail} aria-label="Setup steps">
              <div className={styles.railHead}>
                <span className={styles.railTitle}>Set up your planner</span>
                <span className={styles.railSub}>
                  Step {stepIndex + 1} of {totalSteps}
                </span>
              </div>
              <ul className={styles.railList}>
                {RAIL.map((item, i) => {
                  const isActive = i === stepIndex;
                  const isDone = i < stepIndex;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`${styles.railItem} ${isActive ? styles.railItemActive : ""}`}
                        onClick={() => goTo(i)}
                        aria-current={isActive ? "step" : undefined}
                        title={`Go to step ${i + 1}: ${item.label}`}
                      >
                        <span
                          className={`${styles.railMarker} ${isDone ? styles.railMarkerDone : ""}`}
                          aria-hidden
                        >
                          {isDone ? <CheckMark /> : i + 1}
                        </span>
                        <span className={styles.railLabel}>{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* ── Active step ───────────────────────────────────────────── */}
            <div className={styles.main}>
              <div className={styles.mainScroll}>
                <div
                  className={styles.stepCount}
                  ref={stepCountRef}
                  tabIndex={-1}
                  aria-live="polite"
                >
                  Step {stepIndex + 1} of {totalSteps}
                </div>
                {/* Suppress step content until localStorage resume has run so
                    no flash of default state paints before saved progress. */}
                {hydrated && (
                  <>
                    {stepId === "workspace" && <WorkspaceStep />}
                    {stepId === "courses" && <CoursesStep />}
                    {stepId === "schedule" && <ScheduleStep />}
                    {stepId === "year" && <YearStep />}
                    {stepId === "appearance" && <AppearanceStep />}
                    {stepId === "summary" && <SummaryStep />}
                  </>
                )}
              </div>

              {/* ── Footer ──────────────────────────────────────────────── */}
              <div className={styles.footer}>
                {!isFirst && (
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={back}
                    aria-label="Go to previous step"
                    tooltip="Go back one step — your answers on the current step stay saved."
                    leadingIcon={<span aria-hidden>←</span>}
                  >
                    Back
                  </Button>
                )}
                <div className={styles.spacer} />
                {isSummary ? (
                  <>
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() => finishTo(() => startScreenTour(router))}
                      tooltip="Finish setup and take a quick guided tour of each screen."
                    >
                      Take the tour
                    </Button>
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={() => finishTo(() => router.push("/weekly"))}
                      tooltip="Finish setup and jump straight into your weekly planner."
                    >
                      Start planning
                    </Button>
                  </>
                ) : (
                  <>
                    {isSkippable && (
                      <Button
                        variant="ghost"
                        size="md"
                        onClick={next}
                        tooltip="Skip this step for now — it has sensible defaults and you can set it up later in Settings."
                      >
                        Skip for now
                      </Button>
                    )}
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={next}
                      tooltip="Save this step and continue setup."
                    >
                      {isFirst ? "Get started" : "Continue"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </NotebookProvider>
  );
}
