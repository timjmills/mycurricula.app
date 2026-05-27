"use client";

// TodayDashboard.tsx — the Daily view's in-column DAY HEADER block.
//
// Originally a full-width strip pinned above the two-pane body, this
// component is now repurposed as the day-identity + progress block that
// sits INSIDE the lesson list column (Image 13 redesign). The full-width
// strip is gone — the day name, "X of Y lessons" count, and per-subject
// progress bar all live here at the top of the lesson list, just below
// the new week strip.
//
// The exported symbol stays `TodayDashboard` so the barrel
// (components/daily/index.ts) and any external consumers keep working
// unchanged.
//
// Content:
//   • Left: the active day's full name (e.g. "Sunday").
//   • Right: the lesson-progress count + the segmented per-subject bar.
//
// All data is derived from props filtered to the selected day by the
// parent — never filtered to a hard-coded day index. Chrome stays
// neutral; the only color is the segmented bar's per-subject segments
// (color carries meaning, never decoration — §4 of CLAUDE.md).

import type { ReactNode } from "react";
import type { Lesson } from "@/lib/types";
import { SUBJECT_BY_ID } from "@/lib/mock";
import { Tooltip } from "@/components/ui";
import styles from "./DailyView.module.css";

// ── Props ────────────────────────────────────────────────────────────────

interface TodayDashboardProps {
  /** The day's lessons — already filtered to week + day by the parent. */
  dayLessons: Lesson[];
  /** Full day label, e.g. "Sunday". */
  dayLabel: string;
}

// ── Component ────────────────────────────────────────────────────────────

export function TodayDashboard({
  dayLessons,
  dayLabel,
}: TodayDashboardProps): ReactNode {
  const doneCount = dayLessons.filter((l) => l.status === "done").length;
  const total = dayLessons.length;

  return (
    <div
      className={styles.dayHeader}
      role="region"
      aria-label={`${dayLabel} summary`}
    >
      {/* ── Identity: full day name ────────────────────────────────── */}
      <h2 className={styles.dayHeaderTitle}>{dayLabel}</h2>

      {/* ── Progress: count + per-subject segmented bar ────────────── */}
      <div
        className={styles.dayHeaderProgress}
        role="status"
        aria-label={`${doneCount} of ${total} lessons done`}
      >
        <div className={styles.dayHeaderProgressNumbers}>
          <span className={styles.dayHeaderProgressCount}>
            {doneCount}
            <span className={styles.dayHeaderProgressOf}>
              {" "}
              of {total} lessons
            </span>
          </span>
        </div>
        {/* Per-subject progress bar — each segment carries its subject
            color, the only colored element in the otherwise-neutral
            block. */}
        <div className={styles.dayHeaderBar} role="presentation">
          {total === 0 && <div className={styles.dayHeaderBarEmpty} />}
          {dayLessons.map((l) => (
            <Tooltip
              key={l.id}
              content={`${SUBJECT_BY_ID[l.subject].name} — ${l.status === "done" ? "complete" : l.status === "partial" ? "partially complete" : "not yet started"}. Each segment in this bar represents one of today's lessons.`}
              side="bottom"
            >
              <div
                className={`${styles.dayHeaderBarSegment} cp-subj ${l.subject}`}
                style={{
                  background:
                    l.status === "done"
                      ? "var(--c)"
                      : l.status === "partial"
                        ? "var(--cl)"
                        : "var(--ink-150)",
                }}
                title={`${SUBJECT_BY_ID[l.subject].name} — ${l.status}`}
                tabIndex={0}
                role="img"
                aria-label={`${SUBJECT_BY_ID[l.subject].name} — ${l.status}`}
              />
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  );
}
