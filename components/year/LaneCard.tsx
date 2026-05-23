"use client";

// LaneCard — left-edge lane summary card.
//
// Shows the subject name, a student count (mock), and a % complete progress
// bar. Appears in both Roadmap and Progression views as the fixed left column.
//
// Colors come entirely from the canonical `.cp-subj.<subjectId>` cascade:
//   var(--cl)  → saturated light fill for the card background
//   var(--cd)  → deep subject tone for name + progress label text
//   var(--c)   → saturated mid tone for the progress bar fill
// This matches the Weekly card's visual register exactly.

import type { SubjectId } from "@/lib/types";
import { subjectClassName } from "./roadTones";
import styles from "./LaneCard.module.css";

// Inline icon — avoids pulling a shared icon library.
const IconUsers = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
    <circle cx="10" cy="7" r="4" />
    <path d="M21 21v-2a4 4 0 0 0-3-3.9M15 3.1a4 4 0 0 1 0 7.8" />
  </svg>
);

interface LaneCardProps {
  name: string;
  subjectId: SubjectId;
  /** Student count displayed under the name. */
  students?: number;
  /** Completion percentage, 0–100. */
  completePct: number;
  /** Card height is set by the parent row — the card fills available height. */
  fullHeight?: boolean;
}

export function LaneCard({
  name,
  subjectId,
  students = 24,
  completePct,
  fullHeight = false,
}: LaneCardProps) {
  return (
    <div
      className={`${styles.card} ${subjectClassName(subjectId)}`}
      style={{ height: fullHeight ? "100%" : undefined }}
    >
      {/* Subject name — var(--cd) from the cp-subj cascade */}
      <div className={styles.name}>{name}</div>

      {/* Student count */}
      <div className={styles.meta}>
        <IconUsers width={12} height={12} className={styles.metaIcon} />
        <span>{students} students</span>
      </div>

      {/* % complete + progress bar */}
      <div className={styles.progress}>
        <div className={styles.progressLabel}>{completePct}% Complete</div>
        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-valuenow={completePct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${name} ${completePct}% complete`}
        >
          {/* Fill uses var(--c) — the saturated subject mid-tone */}
          <div
            className={styles.progressFill}
            style={{ width: `${completePct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
