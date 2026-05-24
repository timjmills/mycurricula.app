"use client";

// ScheduleRow.tsx — one block-row inside the ScheduleDayPane vertical list.
//
// Visual recipe (from the user's screenshot):
//   left      → stacked or inline time range, "8:10 — 9:10" in --ink-500
//                tabular-nums on the --t-11 size.
//   monogram  → small 24×24 chip in the subject's --c-surface background;
//                the subject icon ("Ma", "Re") in --cd.
//   label     → uppercase subject name ("MATH", "READING") in --c, weight 600,
//                --t-10, letter-spacing 0.04em.
//   title     → either the block label (Bell tab) or the linked lesson's
//                title (Daily tab) in --ink-900 weight 500 --t-13.
//   trailing  → small ghost icon button slot (optional ✓ / menu) reserved
//                for the right-hand side; not wired in this wave.
//
// Active-now treatment:
//   When `isNow` is true (parent has decided based on day == today AND
//   block contains the now-minute), the row's background swaps to
//   --catchup-bg and a small "▶ now" pill renders to the right of the
//   subject label. The pill respects reduced-motion (no pulse — the
//   color + glyph already carry the signal).
//
// Clicking an academic row with a linked lesson navigates to /daily with
// that lesson selected; non-academic rows and unlinked academic rows are
// no-ops for now.

import type { MouseEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { type TimelineBlock, formatBlockTime } from "@/lib/schedule-data";
import { SUBJECT_BY_ID } from "@/lib/mock";
import type { Lesson } from "@/lib/types";
import { useAppState } from "@/lib/app-state";
import styles from "./ScheduleRow.module.css";

export interface ScheduleRowProps {
  block: TimelineBlock;
  /**
   * Optional linked lesson. The pane resolves this from the planner store
   * for the Daily Schedule tab; the Bell Schedule tab passes `null` so the
   * row falls back to the block's own label/subject name.
   */
  lesson?: Lesson | null;
  /**
   * True when this row contains the live now-minute and the day is today.
   * Drives the catchup-bg tint + "▶ now" pill.
   */
  isNow?: boolean;
  /**
   * When true, an academic block without a linked lesson is rendered with
   * faded title text — "Daily Schedule" uses this to indicate a slot with
   * no lesson scheduled yet. "Bell Schedule" passes false so its standing
   * timetable always reads at full opacity.
   */
  fadeWhenNoLesson?: boolean;
}

export function ScheduleRow({
  block,
  lesson = null,
  isNow = false,
  fadeWhenNoLesson = false,
}: ScheduleRowProps): ReactNode {
  const router = useRouter();
  const { setSelectedLessonId } = useAppState();

  const isAcademic = block.type === "academic" && !!block.subject;
  const subject =
    isAcademic && block.subject ? SUBJECT_BY_ID[block.subject] : null;

  // Title resolution: linked lesson title (when supplied) → block label →
  // subject name. The block label is the carrier for non-academic rows
  // (e.g. "Snack & recess", "Lunch").
  const title = lesson?.title ?? block.label ?? subject?.name ?? "";
  const faded = fadeWhenNoLesson && isAcademic && !lesson;

  const isInteractive = !!lesson;

  const handleClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (!isInteractive || !lesson) return;
    event.stopPropagation();
    setSelectedLessonId(lesson.id);
    router.push("/daily");
  };

  const rowClass = [
    styles.row,
    isNow ? styles.now : "",
    isInteractive ? styles.interactive : "",
    isAcademic && subject ? `cp-subj ${subject.cls}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rowClass}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : -1}
      onClick={isInteractive ? handleClick : undefined}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick(e as unknown as MouseEvent<HTMLDivElement>);
              }
            }
          : undefined
      }
      aria-label={
        isInteractive
          ? `${formatBlockTime(block.startMin)} to ${formatBlockTime(block.endMin)} — ${title}`
          : undefined
      }
    >
      {/* Time column — fixed width so every row's title aligns. */}
      <div className={styles.time}>
        <span className={styles.timeStart}>
          {formatBlockTime(block.startMin)}
        </span>
        <span className={styles.timeDash} aria-hidden="true">
          —
        </span>
        <span className={styles.timeEnd}>{formatBlockTime(block.endMin)}</span>
      </div>

      {/* Monogram chip — subject-tinted for academic, neutral for chores. */}
      {subject ? (
        <span className={styles.monogram} aria-hidden="true">
          {subject.icon}
        </span>
      ) : (
        <span
          className={[styles.monogram, styles.monogramNeutral].join(" ")}
          aria-hidden="true"
        >
          {/* A subtle dot keeps the column aligned without inventing an icon. */}
          ·
        </span>
      )}

      {/* Body — subject label (academic only) + title + optional "now" pill. */}
      <div className={styles.body}>
        <div className={styles.bodyHeader}>
          {subject && (
            <span className={styles.subjectLabel}>
              {subject.name.toUpperCase()}
            </span>
          )}
          {isNow && (
            <span className={styles.nowPill} aria-label="Currently active">
              <span aria-hidden="true">▶</span> now
            </span>
          )}
        </div>
        <div
          className={[styles.title, faded ? styles.titleFaded : ""]
            .filter(Boolean)
            .join(" ")}
        >
          {faded ? "No lesson scheduled" : title}
        </div>
      </div>
    </div>
  );
}
