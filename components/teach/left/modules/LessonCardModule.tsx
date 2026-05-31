"use client";

// LessonCardModule — read-only lesson context for the active Teach lesson
// (docs/teach-view-plan.md §3.1). Shows the subject chip, title, the "I Can"
// objective, and an "Open in Daily" link. Read-only: editing happens in Daily,
// never here (Teach is the delivery surface, not the editor).

import { type ReactNode } from "react";
import { usePlanner } from "@/lib/planner-store";
import { useSubjectColor } from "@/lib/palette";
import { SUBJECT_BY_ID } from "@/lib/mock";
import { ExternalLinkIcon, LessonIcon } from "../icons";
import styles from "../TeachLeft.module.css";

export interface LessonCardModuleProps {
  /** The active master lesson id, or null in sandbox / no-lesson mode. */
  activeLessonId: string | null;
}

export function LessonCardModule({
  activeLessonId,
}: LessonCardModuleProps): ReactNode {
  const { getLesson } = usePlanner();
  const lesson = activeLessonId ? getLesson(activeLessonId) : undefined;
  // Hooks must run unconditionally — fall back to math when no lesson so the
  // subject-color hook always has a valid id; the chip only renders with a
  // lesson present anyway.
  const subjectColor = useSubjectColor(lesson?.subject ?? "math");

  if (!lesson) {
    return (
      <p className={styles.muted}>
        No lesson selected. Pick a lesson from the Lessons tab, or build a
        sandbox board.
      </p>
    );
  }

  const subject = SUBJECT_BY_ID[lesson.subject];

  return (
    <div
      className={`${styles.lessonCard} cp-subj ${lesson.subject}`}
      // Bind the subject color tokens so the chip tints correctly even outside
      // a .cp-subj ancestor.
      style={
        {
          ["--c"]: subjectColor.c,
          ["--cl"]: subjectColor.cl,
          ["--cd"]: subjectColor.cd,
        } as React.CSSProperties
      }
    >
      <div className={styles.lessonCardHead}>
        <span className={styles.subjChip} aria-hidden="true">
          {subject?.icon ?? <LessonIcon size={14} />}
        </span>
        <span className={styles.lessonCardTitle}>{lesson.title}</span>
      </div>

      <div className={styles.metaLabel}>I Can</div>
      <p className={styles.lessonText}>
        {lesson.objective || lesson.preview || "No objective recorded."}
      </p>

      <a
        className={styles.openLink}
        href={`/daily?lesson=${encodeURIComponent(lesson.id)}`}
        title="Open this lesson's full plan in the Daily view"
      >
        Open in Daily <ExternalLinkIcon size={12} />
      </a>
    </div>
  );
}
