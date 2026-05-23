"use client";

// LaneCard — left-edge lane summary card.
//
// Shows the subject name, a student count (mock), and a % complete progress
// bar. Appears in both Roadmap and Progression views as the fixed left column.
//
// Layered design treatment:
//   • White body (--paper) so the card reads in the premium dashboard register.
//   • Tinted header strip — gradient from --c-surface-strong (top) to
//     --c-surface (bottom) — carries the subject identity.
//   • 4px deep-tone left border (--c-deep) asserts subject color at a glance.
//   • Hairline subject-tinted border on the other three sides (--c-border).
//   • Subject identity chip (28×32px) in the header top-right.
//   • Soft drop shadow (--shadow-card); lifts on hover (--shadow-card-hover).
//
// All colors resolve from the new role variables inside the `.cp-subj.<id>`
// cascade defined in app/tokens.css — no hex values here.

import type { SubjectId } from "@/lib/types";
import type { PacingStatus } from "@/lib/year-pacing";
import { pacingLabel } from "@/lib/year-pacing";
import { subjectClassName } from "./roadTones";
import styles from "./LaneCard.module.css";

// Two-letter monogram for the subject identity chip.
const CHIP_MONOGRAM: Record<SubjectId, string> = {
  math: "Ma",
  reading: "Re",
  writing: "Wr",
  grammar: "Gr",
  spelling: "Sp",
  ufli: "Uf",
  explorers: "Ex",
  sel: "Se",
};

interface LaneCardProps {
  name: string;
  subjectId: SubjectId;
  /** Student count displayed under the name. */
  students?: number;
  /** Completion percentage, 0–100. */
  completePct: number;
  /** Card height is set by the parent row — the card fills available height. */
  fullHeight?: boolean;
  /**
   * Pacing status computed by pacingFor() in lib/year-pacing.ts.
   * When provided, renders a colored dot + one-line status sentence below
   * the progress bar. Omit to hide the row entirely.
   */
  pacing?: PacingStatus;
}

export function LaneCard({
  name,
  subjectId,
  students = 24,
  completePct,
  fullHeight = false,
  pacing,
}: LaneCardProps) {
  const monogram = CHIP_MONOGRAM[subjectId] ?? name.slice(0, 2);

  return (
    <div
      className={`${styles.card} ${subjectClassName(subjectId)}`}
      style={{ height: fullHeight ? "100%" : undefined }}
    >
      {/* Tinted header — gradient --c-surface-strong → --c-surface */}
      <div className={styles.header}>
        <div className={styles.headerText}>
          {/* Subject title — var(--c-deep) for strong contrast on the tint */}
          <div className={styles.name}>{name}</div>
          {/* Student count — neutral secondary below the title */}
          <div className={styles.meta}>{students} students</div>
        </div>

        {/* Subject identity chip — top-right corner of the header */}
        <div className={styles.chip} aria-hidden="true">
          {monogram}
        </div>
      </div>

      {/* White body — completion percentage + progress bar + pacing row */}
      <div className={styles.body}>
        <div className={styles.progressLabel}>{completePct}% Complete</div>
        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-valuenow={completePct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${name} ${completePct}% complete`}
        >
          {/* Fill uses --c-progress-fill — the subject's mid tone */}
          <div
            className={styles.progressFill}
            style={{ width: `${completePct}%` }}
          />
        </div>

        {/* Pacing row — only rendered when the parent passes a pacing status.
            Dot color is keyed to the status kind via data-pacing; see the CSS. */}
        {pacing !== undefined && (
          <div className={styles.pacingRow}>
            <span
              className={styles.pacingDot}
              data-pacing={pacing.kind}
              aria-hidden="true"
            />
            <span className={styles.pacingLabel}>{pacingLabel(pacing)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
