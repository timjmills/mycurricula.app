"use client";

// StatStrip.tsx — 5-stat horizontal strip at the top of the Subject view.
//
// Stats (left→right):
//   DONE       — lessons marked done / total lessons in the subject
//   COMPLETE   — % of the year taught (done / total), with a progress bar
//   STANDARDS  — unique standards covered at least once / total unique standards
//   SKIPPED    — lessons with status "skipped"
//   RESOURCES  — total resources across all lessons
//
// All values are live-computed from the lessons passed in — never hard-coded.
// The COMPLETE bar fill uses var(--cd), the subject deep color from the
// .cp-subj cascade, so it follows the active subject automatically.

import type { ReactNode } from "react";
import type { Lesson } from "@/lib/types";
import styles from "./StatStrip.module.css";

// ── Per-stat cell ─────────────────────────────────────────────────────────

interface StatCell2Props {
  label: string;
  value: string | number;
  caption: string;
  /** When true the cell renders a progress bar below the value. */
  showBar?: boolean;
  /** 0–100, used when showBar is true. */
  barPct?: number;
  /** When true the value is shown in --urgent (red) rather than ink. */
  warn?: boolean;
}

function StatCell2({
  label,
  value,
  caption,
  showBar = false,
  barPct = 0,
  warn = false,
}: StatCell2Props): ReactNode {
  return (
    <div className={styles.cell}>
      <div className={styles.cellLabel}>{label}</div>
      <div
        className={styles.cellValue}
        style={warn ? { color: "var(--catchup)" } : undefined}
      >
        {value}
      </div>
      {showBar && (
        <div className={styles.barTrack} aria-hidden="true">
          <div
            className={styles.barFill}
            style={{ width: `${Math.min(100, Math.max(0, barPct))}%` }}
          />
        </div>
      )}
      <div className={styles.cellCaption}>{caption}</div>
    </div>
  );
}

// ── StatStrip ─────────────────────────────────────────────────────────────

export interface StatStripProps {
  /** All lessons for the active subject — used to compute every stat. */
  lessons: Lesson[];
}

export function StatStrip({ lessons }: StatStripProps): ReactNode {
  const total = lessons.length;

  // Done count — lessons whose status is "done".
  const doneCount = lessons.filter((l) => l.status === "done").length;

  // Completion percentage — 0 if there are no lessons.
  const completePct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  // Standards covered: unique codes found across done lessons (taught at least
  // once). Standards total: all unique codes across every lesson in the subject.
  // NOTE: the mock data for this subject has one active unit and three weeks of
  // lessons — not a full-year scope. The ratio reflects the loaded mock window,
  // not a 36-week count. A comment is intentional here per the spec note.
  const allCodes = new Set<string>();
  const doneCodes = new Set<string>();
  for (const l of lessons) {
    for (const s of l.standards) {
      allCodes.add(s);
      if (l.status === "done") doneCodes.add(s);
    }
  }
  const standardsCovered = doneCodes.size;
  const standardsTotal = allCodes.size;

  // Skipped lessons.
  const skippedCount = lessons.filter((l) => l.status === "skipped").length;

  // Resource total — count every resource across every lesson.
  const resourceCount = lessons.reduce((sum, l) => sum + l.resources.length, 0);

  return (
    <div className={styles.strip} role="region" aria-label="Subject statistics">
      <StatCell2
        label="DONE"
        value={`${doneCount} / ${total}`}
        caption="lessons taught"
      />

      <StatCell2
        label="COMPLETE"
        value={`${completePct}%`}
        caption="of the year"
        showBar
        barPct={completePct}
      />

      <StatCell2
        label="STANDARDS"
        value={`${standardsCovered} / ${standardsTotal}`}
        caption="taught at least once"
      />

      <StatCell2
        label="SKIPPED"
        value={skippedCount}
        caption="lessons"
        warn={skippedCount > 0}
      />

      <StatCell2
        label="RESOURCES"
        value={resourceCount}
        caption="across all units"
      />
    </div>
  );
}
