"use client";

// welcome-step.tsx — onboarding step 1: greeting and optional name capture.
//
// Renders a friendly h1, a short orientation sentence, and an optional text
// input for the teacher's name. Writes to `data.teacherName` via the
// onboarding state hook. The wizard shell renders Back / Continue — this
// component only owns its own content.

import type { ReactNode } from "react";
import { useOnboarding } from "@/lib/onboarding-state";
import styles from "./steps.module.css";

/** Step 1 — welcome screen with optional teacher-name input. */
export function WelcomeStep(): ReactNode {
  const { data, update } = useOnboarding();

  return (
    <section aria-labelledby="welcome-heading">
      <h1 id="welcome-heading" className={styles.heading}>
        Welcome to MyCurricula
      </h1>
      <p className={styles.helper}>
        Let&rsquo;s set up your planner — it takes about 8 minutes. You can
        always change these settings later from the app.
      </p>

      <label>
        <span className={styles.fieldLabel}>Your name (optional)</span>
        <input
          type="text"
          className={styles.textInput}
          placeholder="e.g. Ms. Johnson"
          value={data.teacherName}
          onChange={(e) => update({ teacherName: e.target.value })}
          autoComplete="given-name"
          spellCheck={false}
        />
      </label>
    </section>
  );
}
