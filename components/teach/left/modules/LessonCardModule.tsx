"use client";

// LessonCardModule — read-only lesson context for the active Teach lesson
// (docs/teach-view-plan.md §3.1). Shows the subject chip, title, the "I Can"
// objective, and an "Open in Daily" link. Read-only: editing happens in Daily,
// never here (Teach is the delivery surface, not the editor).

import { type ReactNode } from "react";
import { usePlanner } from "@/lib/planner-store";
import { useSubjectColor } from "@/lib/palette";
import { SUBJECT_BY_ID } from "@/lib/mock";
import { PlannerEmpty } from "@/components/ui";
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

  // No id at all: sandbox mode (TeachWorkspace's `enterSandbox` nulls it), a
  // standalone board open, or the tick before the default-lesson seed lands.
  // That is a fact about WORKSPACE state, not about the store — true in every
  // data state — so it keeps its copy and is deliberately NOT deferred.
  if (!activeLessonId) {
    return (
      <p className={styles.muted}>
        No lesson selected. Pick a lesson from the Lessons tab, or build a
        sandbox board.
      </p>
    );
  }

  if (!lesson) {
    // An id we hold but cannot resolve. `getLesson` scans usePlanner().lessons,
    // which is empty for the whole 11–16s Supabase hydrate — and app/(teach)/
    // layout.tsx mounts its OWN <PlannerProvider>, so EVERY Day/Week→Teach
    // navigation pays that hydrate, not just a cold load. This branch therefore
    // fired on the way in to Teach and told a teacher, minutes before class,
    // that the lesson they had deep-linked was gone. Until the store settles the
    // answer is unknown, so this defers to <PlannerEmpty>, which reads
    // usePlannerDataState() ITSELF (components/ui/PlannerEmpty.tsx:40) — hence no
    // local hook here — and owns the pending skeleton and the failed-hydrate
    // copy, both the right thing to say in this slot. Once SETTLED it renders
    // the heading below, so the miss is still stated: deferring forever would
    // strand Teach on a permanent skeleton, worse than the bug being fixed. Copy
    // split from the no-id case above because they are different facts: "you
    // picked nothing" vs "what you picked is not in your plan".
    return (
      <PlannerEmpty
        size="sm"
        skeletonLines={2}
        heading="That lesson isn’t in your plan."
        body="Pick a lesson from the Lessons tab, or build a sandbox board."
      />
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
