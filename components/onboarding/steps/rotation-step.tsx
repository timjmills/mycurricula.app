"use client";

// rotation-step.tsx — onboarding step 4: schedule rotation type.
//
// A <ToggleGroup variant="prominent"> with three options lets the teacher
// choose how their daily timetable repeats:
//   • "none"  — same every week (the most common case)
//   • "ab"    — alternates between two distinct day layouts
//   • "cycle" — repeats on a numbered cycle independent of the calendar week
//
// When "cycle" is selected, a number input for the cycle length (2–20 days)
// is revealed. The wizard shell owns the navigation footer.

import type { ReactNode } from "react";
import { useOnboarding } from "@/lib/onboarding-state";
import { ToggleGroup } from "@/components/ui";
import type { ToggleOption } from "@/components/ui";
import styles from "./steps.module.css";

type RotationValue = "none" | "ab" | "cycle";

interface RotationOption {
  value: RotationValue;
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

// ToggleGroup options derived from ROTATION_OPTIONS so label changes stay
// in one place.
const TOGGLE_OPTIONS: Array<ToggleOption<RotationValue>> = ROTATION_OPTIONS.map(
  (o) => ({
    value: o.value,
    label: o.label,
    ariaLabel: o.label,
  }),
);

/** Step 4 — rotation type selection with optional cycle-length input. */
export function RotationStep(): ReactNode {
  const { data, update } = useOnboarding();

  // The selected option's description — shown beneath the toggle group so the
  // teacher gets the full plain-language explanation for their current choice.
  const selectedDesc =
    ROTATION_OPTIONS.find((o) => o.value === data.rotation)?.desc ?? "";

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

      {/* ── ToggleGroup — prominent variant for a primary mode choice ─── */}
      {/* ToggleGroup handles arrow-key navigation and aria-checked internally. */}
      <ToggleGroup
        options={TOGGLE_OPTIONS}
        value={data.rotation ?? "none"}
        onChange={(v) => update({ rotation: v })}
        ariaLabel="Schedule rotation type"
        variant="prominent"
        className={styles.optionList}
      />

      {/* Description for the currently selected rotation type */}
      <p className={styles.optionDesc}>{selectedDesc}</p>

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
