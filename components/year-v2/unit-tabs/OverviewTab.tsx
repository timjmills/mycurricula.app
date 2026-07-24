"use client";

// OverviewTab.tsx — the Unit Explorer's Overview tab body.
//
// Extracted verbatim from UnitExplorer.tsx (B1.0). Shows the completion ring +
// stat, the progress bar, and the horizontal lesson-node timeline. Real store
// data only — no fabricated pace / projected-finish stats.

import { type ReactNode } from "react";
import type { Lesson } from "@/lib/types";
import { Tooltip } from "@/components/ui";
import { ProgressRing } from "./ProgressRing";
import { dayShort } from "./helpers";
import styles from "../UnitExplorer.module.css";

export function OverviewTab({
  lessons,
  progress,
  pct,
  subjectName,
}: {
  lessons: Lesson[];
  progress: { total: number; taught: number };
  pct: number;
  subjectName: string;
}): ReactNode {
  return (
    <div className={styles.overview}>
      <div className={styles.ovHead}>
        <ProgressRing
          pct={pct}
          size={64}
          stroke={7}
          trackClass={styles.ringTrack}
          valueClass={styles.ringValue}
          label={`${progress.taught} of ${progress.total} lessons taught`}
        />
        <div className={styles.ovStat}>
          <div className={styles.ovBig}>
            {progress.taught}
            <span className={styles.ovSlash}>/{progress.total}</span>
          </div>
          <div className={styles.ovLabel}>
            {subjectName} lessons taught
            {progress.total > 0 ? (
              <> · {Math.round(pct * 100)}% complete</>
            ) : null}
          </div>
        </div>
      </div>

      {lessons.length === 0 ? (
        <div className={styles.empty}>
          No lessons planned for this unit yet.
        </div>
      ) : (
        <>
          <div className={styles.progressBar} aria-hidden="true">
            <span
              className={styles.progressFill}
              style={{ width: `${Math.round(pct * 100)}%` }}
            />
          </div>
          {/* Horizontal lesson-node timeline — done nodes fill with the subject
              color + ✓; the rest read as hollow track dots. */}
          <div
            className={styles.timeline}
            role="list"
            aria-label="Unit lesson timeline"
          >
            {lessons.map((l) => {
              const done = l.status === "done";
              return (
                <Tooltip
                  key={l.id}
                  content={`Wk ${l.week} · ${dayShort(l.day)} — ${l.title}${
                    done ? " (taught)" : ""
                  }`}
                  side="top"
                >
                  <span
                    role="listitem"
                    className={`${styles.node} ${done ? styles.nodeDone : ""}`}
                    aria-label={`Week ${l.week} ${dayShort(l.day)}: ${l.title}${
                      done ? ", taught" : ""
                    }`}
                    tabIndex={0}
                  >
                    {done ? (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M5 12l5 5L20 6" />
                      </svg>
                    ) : null}
                  </span>
                </Tooltip>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
