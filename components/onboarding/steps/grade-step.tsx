"use client";

// grade-step.tsx — onboarding step 2: grade-level selection.
//
// Displays a grid of selectable grade chips (K–12 plus "Multiple grades").
// The selected chip is highlighted; clicking a chip writes `grade` via
// useOnboarding(). The wizard shell owns the navigation footer.

import type { KeyboardEvent, ReactNode } from "react";
import { useOnboarding } from "@/lib/onboarding-state";
import { Chip } from "@/components/ui";
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

  // Arrow-key navigation within the chip group: move focus + selection to the
  // next/previous chip so the group behaves like a radio group.
  function handleGroupKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const currentIndex = GRADE_OPTIONS.findIndex(
      (o) => o.value === data.grade,
    );
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
    // Move DOM focus to the newly selected chip button.
    const buttons =
      (e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>(
        "button",
      );
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

      {/* role="group" + onKeyDown on the container provides arrow-key
          navigation; each Chip (rendered as a toggle button) carries
          aria-pressed for its selected state. */}
      <div
        className={styles.chipGrid}
        role="group"
        aria-label="Grade level"
        onKeyDown={handleGroupKeyDown}
      >
        {GRADE_OPTIONS.map((opt) => {
          const selected = data.grade === opt.value;
          return (
            <Chip
              key={opt.value}
              variant="filter"
              active={selected}
              onClick={() => update({ grade: opt.value })}
              className={opt.wide ? styles.chipWide : undefined}
            >
              {opt.label}
            </Chip>
          );
        })}
      </div>
    </section>
  );
}
