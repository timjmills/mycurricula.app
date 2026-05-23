"use client";

// LaneCard — left-edge lane summary card.
//
// Shows the subject name, a student count (mock), and a % complete progress
// bar in the lane's highlighter tone. Appears in both Roadmap and Progression
// views as the fixed left column.

import type { RoadTone } from "./roadTones";
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
  /** Student count displayed under the name. */
  students?: number;
  /** Completion percentage, 0–100. */
  completePct: number;
  tone: RoadTone;
  /** Card height is set by the parent row — the card fills available height. */
  fullHeight?: boolean;
}

export function LaneCard({
  name,
  students = 24,
  completePct,
  tone,
  fullHeight = false,
}: LaneCardProps) {
  return (
    <div
      className={styles.card}
      style={{
        background: tone.lane,
        height: fullHeight ? "100%" : undefined,
      }}
    >
      {/* Subject name */}
      <div className={styles.name} style={{ color: "#1F2A4E" }}>
        {name}
      </div>

      {/* Student count */}
      <div className={styles.meta}>
        <IconUsers width={12} height={12} style={{ color: "#94A3B8" }} />
        <span style={{ color: "#5B6580" }}>{students} students</span>
      </div>

      {/* % complete + progress bar */}
      <div className={styles.progress}>
        <div className={styles.progressLabel} style={{ color: "#1F2A4E" }}>
          {completePct}% Complete
        </div>
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
            style={{
              width: `${completePct}%`,
              background: tone.check,
            }}
          />
        </div>
      </div>
    </div>
  );
}
