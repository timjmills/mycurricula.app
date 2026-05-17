"use client";

// grade-step.tsx — onboarding step 2: grade-level selection.
//
// Displays a grid of selectable grade chips (K–12 plus "Multiple grades").
// The selected chip is highlighted; clicking a chip writes `grade` via
// useOnboarding(). The wizard shell owns the navigation footer.

import type { KeyboardEvent, ReactNode } from "react";
import { useOnboarding } from "@/lib/onboarding-state";
import styles from "./steps.module.css";

interface GradeOption {
  value: string;
  label: string;
  wide?: boolean;
}

// All selectable grades in display order. Values match the OnboardingData
// `grade` field contract: "K", "1"…"12", "multiple".
const GRADE_OPTIONS: readonly GradeOption[] = [
  { value: "K", label: "K" },
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
  { value: "6", label: "6" },
  { value: "7", label: "7" },
  { value: "8", label: "8" },
  { value: "9", label: "9" },
  { value: "10", label: "10" },
  { value: "11", label: "11" },
  { value: "12", label: "12" },
  { value: "multiple", label: "Multiple grades", wide: true },
] as const;

/** Step 2 — grade-level chip grid. */
export function GradeStep(): ReactNode {
  const { data, update } = useOnboarding();

  // Arrow-key navigation within the radiogroup: move focus + selection to the
  // next/previous option so the group behaves as a native radio group.
  function handleRadioKeyDown(
    e: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ): void {
    let nextIndex: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % GRADE_OPTIONS.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      nextIndex =
        (currentIndex - 1 + GRADE_OPTIONS.length) % GRADE_OPTIONS.length;
    }
    if (nextIndex === null) return;
    e.preventDefault();
    const next = GRADE_OPTIONS[nextIndex];
    update({ grade: next.value });
    // Move DOM focus to the newly selected button.
    const group = (e.currentTarget as HTMLElement).parentElement;
    const buttons =
      group?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[nextIndex]?.focus();
  }

  return (
    <section aria-labelledby="grade-heading">
      <h1 id="grade-heading" className={styles.heading}>
        What grade do you teach?
      </h1>
      <p className={styles.helper}>
        This helps us configure the right curriculum defaults for your team.
      </p>

      <div
        className={styles.chipGrid}
        role="radiogroup"
        aria-label="Grade level"
      >
        {GRADE_OPTIONS.map((opt, i) => {
          const selected = data.grade === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              // Only the selected chip is in the tab order; others are
              // reachable via arrow keys, matching the radio-group pattern.
              tabIndex={selected ? 0 : -1}
              onClick={() => update({ grade: opt.value })}
              onKeyDown={(e) => handleRadioKeyDown(e, i)}
              className={[
                styles.chip,
                selected ? styles.chipSelected : "",
                opt.wide ? styles.chipWide : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
