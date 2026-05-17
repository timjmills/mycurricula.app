"use client";

// schedule-step.tsx — onboarding step 8 of 9: "Your daily schedule"
//
// An intentionally lightweight step — the full timetable editor lives in
// Settings → Schedule. Here we show the teacher's academic subjects as a
// "typical day" ordered list so they can get a feel for the planner without
// doing heavy configuration up front.
//
// Reordering updates `data.subjects` via `update()`. Non-academic subjects
// (lunch, recess, etc.) are not shown — they don't carry lesson content.
// The step is skippable; the wizard handles that button.

import { useState, type ReactNode } from "react";
import { useOnboarding } from "@/lib/onboarding-state";
import type { OnboardingSubject } from "@/lib/onboarding-state";
import styles from "./schedule-step.module.css";

/** Step 8 — "a typical day" subject-order preview. */
export function ScheduleStep(): ReactNode {
  const { data, update } = useOnboarding();

  // Local copy of the academic subjects so Up/Down feel instant.
  // We only reorder academic subjects here; non-academic subjects are
  // always sourced from the live data so we never lose or duplicate them
  // if the teacher edits subjects on another step and returns.
  const [academic, setAcademic] = useState<OnboardingSubject[]>(() =>
    data.subjects.filter((s) => s.isAcademic),
  );

  /** Move the academic subject at `fromIdx` up or down by one slot. */
  function move(fromIdx: number, direction: "up" | "down"): void {
    const toIdx = direction === "up" ? fromIdx - 1 : fromIdx + 1;
    if (toIdx < 0 || toIdx >= academic.length) return;

    const next = [...academic];
    // Swap the two entries.
    [next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]];

    // Merge back with non-academic subjects (sourced from live data) appended
    // at the end so we never lose or duplicate subjects configured elsewhere.
    const nonAcademic = data.subjects.filter((s) => !s.isAcademic);
    const merged = [...next, ...nonAcademic];
    setAcademic(next);
    update({ subjects: merged });
  }

  return (
    <div className={styles.root}>
      <h1 className={styles.heading}>Your daily schedule</h1>
      <p className={styles.helper}>
        Order your subjects to sketch out a typical day. Exact times and period
        lengths live in <strong>Settings → Schedule</strong> — you can build
        that later.
      </p>

      {academic.length === 0 ? (
        // Edge case: no academic subjects configured yet.
        <p className={styles.empty}>
          No academic subjects yet — add them on the Subjects step.
        </p>
      ) : (
        <>
          {/* Ordered subject list with Up/Down reorder buttons. */}
          <ol className={styles.list} aria-label="Typical day order">
            {academic.map((subj, idx) => (
              <li key={subj.id} className={styles.item}>
                {/* Colored swatch — uses the cp-subj class + subject id. */}
                <span
                  className={`cp-subj ${subj.color} ${styles.swatch}`}
                  aria-hidden
                />
                <span className={styles.name}>{subj.name}</span>
                <span className={styles.controls}>
                  <button
                    type="button"
                    onClick={() => move(idx, "up")}
                    disabled={idx === 0}
                    className={`${styles.moveBtn} cp-focusable`}
                    aria-label={`Move ${subj.name} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, "down")}
                    disabled={idx === academic.length - 1}
                    className={`${styles.moveBtn} cp-focusable`}
                    aria-label={`Move ${subj.name} down`}
                  >
                    ↓
                  </button>
                </span>
              </li>
            ))}
          </ol>

          <p className={styles.note}>
            This order is a starting point. Your full timetable — with time
            blocks, rotations, and Ramadan adjustments — is waiting in Settings
            once you&rsquo;re in the planner.
          </p>
        </>
      )}
    </div>
  );
}
