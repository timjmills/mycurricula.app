"use client";

// rotation-step.tsx — onboarding step 4: schedule rotation type.
//
// Three option cards let the teacher choose how their daily timetable repeats:
//   • "none"  — same every week (the most common case)
//   • "ab"    — alternates between two distinct day layouts
//   • "cycle" — repeats on a numbered cycle independent of the calendar week
//
// When "cycle" is selected, a number input for the cycle length (2–20 days)
// is revealed. The wizard shell owns the navigation footer.

import type { KeyboardEvent, ReactNode } from "react";
import { useOnboarding } from "@/lib/onboarding-state";
import styles from "./steps.module.css";

interface RotationOption {
  value: "none" | "ab" | "cycle";
  label: string;
  desc: string;
}

// Plain-language descriptions for each rotation type.
const ROTATION_OPTIONS: readonly RotationOption[] = [
  {
    value: "none",
    label: "Same every week",
    desc: "Every Monday looks like every other Monday. No rotation — the simplest setup.",
  },
  {
    value: "ab",
    label: "A/B rotation",
    desc: "Two alternating day layouts. Week 1 follows schedule A, week 2 follows schedule B, and so on.",
  },
  {
    value: "cycle",
    label: "Numbered cycle",
    desc: "Your schedule repeats on a fixed count of instructional days — for example, a 6-day cycle — regardless of which calendar day it falls on.",
  },
] as const;

/** Step 4 — rotation type selection with optional cycle-length input. */
export function RotationStep(): ReactNode {
  const { data, update } = useOnboarding();

  // Arrow-key navigation for the rotation radiogroup.
  function handleRadioKeyDown(
    e: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ): void {
    let nextIndex: number | null = null;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % ROTATION_OPTIONS.length;
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      nextIndex =
        (currentIndex - 1 + ROTATION_OPTIONS.length) % ROTATION_OPTIONS.length;
    }
    if (nextIndex === null) return;
    e.preventDefault();
    update({ rotation: ROTATION_OPTIONS[nextIndex].value });
    const group = (e.currentTarget as HTMLElement).parentElement;
    const buttons =
      group?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[nextIndex]?.focus();
  }

  return (
    <section aria-labelledby="rotation-heading">
      <h1 id="rotation-heading" className={styles.heading}>
        Does your schedule rotate?
      </h1>
      <p className={styles.helper}>
        Some schools use the same timetable every week; others alternate between
        two layouts or run a numbered cycle. Choose the pattern that matches
        your school.
      </p>

      {/* ── Option cards ─────────────────────────────────────────────── */}
      <div
        className={styles.optionList}
        role="radiogroup"
        aria-label="Schedule rotation type"
      >
        {ROTATION_OPTIONS.map((opt, i) => {
          const selected = data.rotation === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => update({ rotation: opt.value })}
              onKeyDown={(e) => handleRadioKeyDown(e, i)}
              className={[
                styles.optionCard,
                selected ? styles.optionCardSelected : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {/* Radio dot indicator */}
              <div
                className={[
                  styles.radioDot,
                  selected ? styles.radioDotSelected : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-hidden="true"
              />
              <span className={styles.optionText}>
                <span className={styles.optionLabel}>{opt.label}</span>
                <span className={styles.optionDesc}>{opt.desc}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Cycle-length input — revealed only for numbered cycle ──────── */}
      {data.rotation === "cycle" && (
        <div className={styles.cycleLengthRow}>
          <label>
            <span className={styles.fieldLabel}>Days in the cycle</span>
            <input
              type="number"
              className={styles.numberInput}
              min={2}
              max={20}
              value={data.cycleLength}
              onChange={(e) => {
                const raw = Number(e.target.value);
                // Guard against empty-field NaN; clamp to the 2–20 range.
                if (!Number.isFinite(raw)) return;
                update({ cycleLength: Math.min(Math.max(raw, 2), 20) });
              }}
              aria-label="Number of days in the rotation cycle"
            />
          </label>
        </div>
      )}
    </section>
  );
}
