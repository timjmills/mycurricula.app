"use client";

// LaneCard — left-edge lane summary card.
//
// Two display modes:
//   • full    — subject name, student count, completion %, progress bar, pacing.
//   • minimized — single-row pill (monogram + name + completion % + restore).
//
// Both modes consume the canonical <Card subjectId={…}> primitive from
// components/ui so the lane chrome matches Weekly's card recipe exactly —
// subject-tinted header gradient, 4px deep left border, soft shadow.

import { Card, Tooltip } from "@/components/ui";
import type { SubjectId } from "@/lib/types";
import type { PacingStatus } from "@/lib/year-pacing";
import { pacingLabel } from "@/lib/year-pacing";
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

// ── Icons ──────────────────────────────────────────────────────────────────

const IconMinimize = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M6 15l6-6 6 6" />
  </svg>
);

const IconRestore = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

// ── Props ──────────────────────────────────────────────────────────────────

interface LaneCardProps {
  name: string;
  subjectId: SubjectId;
  /** Student count displayed under the name. */
  students?: number;
  /** Completion percentage, 0–100. */
  completePct: number;
  /** Card height stretches to fill the lane row. */
  fullHeight?: boolean;
  /** Pacing status — when provided, renders a dot + sentence below the bar. */
  pacing?: PacingStatus;
  /** Minimized state — collapses the card to a single-row pill. */
  minimized?: boolean;
  /** Click handler for the minimize / restore chevron. */
  onToggleMinimize?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────

export function LaneCard({
  name,
  subjectId,
  students = 24,
  completePct,
  fullHeight = false,
  pacing,
  minimized = false,
  onToggleMinimize,
}: LaneCardProps) {
  const monogram = CHIP_MONOGRAM[subjectId] ?? name.slice(0, 2);

  // ── Minimized pill mode ─────────────────────────────────────────────
  if (minimized) {
    return (
      <Card subjectId={subjectId} density="compact" className={styles.pill}>
        <div className={styles.pillRow}>
          <span className={styles.pillChip} aria-hidden="true">
            {monogram}
          </span>
          <span className={styles.pillName}>{name}</span>
          <span className={styles.pillPct}>{completePct}%</span>
          {onToggleMinimize && (
            <Tooltip content={`Restore ${name}`} side="top">
              <button
                type="button"
                className={styles.toggleBtn}
                onClick={onToggleMinimize}
                aria-label={`Restore ${name}`}
              >
                <IconRestore width={14} height={14} />
              </button>
            </Tooltip>
          )}
        </div>
      </Card>
    );
  }

  // ── Full card mode ──────────────────────────────────────────────────
  const header = (
    <div className={styles.headerInner}>
      <div className={styles.headerText}>
        <div className={styles.name}>{name}</div>
        <div className={styles.meta}>{students} students</div>
      </div>

      <div className={styles.headerControls}>
        <div className={styles.chip} aria-hidden="true">
          {monogram}
        </div>
        {onToggleMinimize && (
          <Tooltip content={`Minimize ${name}`} side="top">
            <button
              type="button"
              className={styles.toggleBtn}
              onClick={onToggleMinimize}
              aria-label={`Minimize ${name}`}
            >
              <IconMinimize width={14} height={14} />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );

  return (
    <Card
      subjectId={subjectId}
      header={header}
      density="compact"
      className={`${styles.card} ${fullHeight ? styles.fullHeight : ""}`}
    >
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
          <div
            className={styles.progressFill}
            style={{ width: `${completePct}%` }}
          />
        </div>

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
    </Card>
  );
}
