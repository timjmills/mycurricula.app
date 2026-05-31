"use client";

// LessonListModule — the day's lesson list for the active week (plan §3.1).
//
// Reuses the planner store (usePlanner → lessons) and app-state (week,
// selectedDay). Clicking a lesson selects it as the active Teach lesson:
// it dispatches `selectLesson` on the central workspace reducer (so the board
// strip + lesson card follow) AND mirrors to app-state's `setSelectedLessonId`
// so the rest of the app stays in sync, per the prop contract.

import { type ReactNode, useMemo } from "react";
import { usePlanner } from "@/lib/planner-store";
import { useAppState } from "@/lib/app-state";
import { useSubjectColor } from "@/lib/palette";
import { SUBJECT_BY_ID, WEEK_DAYS_SHORT } from "@/lib/mock";
import type { Lesson } from "@/lib/types";
import type { TeachWorkspaceAction } from "@/components/teach/TeachWorkspace";
import styles from "../TeachLeft.module.css";

export interface LessonListModuleProps {
  /** The active master lesson id (drives the row highlight). */
  activeLessonId: string | null;
  /** Dispatch onto the central workspace reducer (e.g. `selectLesson`). */
  dispatch: (action: TeachWorkspaceAction) => void;
}

// One lesson row — split out so `useSubjectColor` runs per-row (a hook can't
// be called in a loop body).
function LessonRow({
  lesson,
  active,
  onSelect,
}: {
  lesson: Lesson;
  active: boolean;
  onSelect: () => void;
}): ReactNode {
  const subjectColor = useSubjectColor(lesson.subject);
  const subject = SUBJECT_BY_ID[lesson.subject];
  const dayLabel = WEEK_DAYS_SHORT[lesson.day] ?? `Day ${lesson.day + 1}`;
  const meta = lesson.time ? `${dayLabel} · ${lesson.time}` : dayLabel;

  return (
    <button
      type="button"
      data-planner-item={`lesson:${lesson.id}`}
      className={[styles.lessonRow, active ? styles.lessonRowActive : ""]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          ["--c"]: subjectColor.c,
          ["--cl"]: subjectColor.cl,
          ["--cd"]: subjectColor.cd,
        } as React.CSSProperties
      }
      aria-pressed={active}
      onClick={onSelect}
      title="Teach this lesson — loads its boards in the center"
    >
      <span className={styles.lessonRowHead}>
        <span className={styles.lessonRowSubjDot} aria-hidden="true">
          {subject?.icon}
        </span>
        <span className={styles.lessonRowSubj}>
          {subject?.name?.toUpperCase() ?? lesson.subject.toUpperCase()}
        </span>
      </span>
      <span className={styles.lessonRowTitle}>{lesson.title}</span>
      <span className={styles.lessonRowMeta}>{meta}</span>
    </button>
  );
}

export function LessonListModule({
  activeLessonId,
  dispatch,
}: LessonListModuleProps): ReactNode {
  const { lessons } = usePlanner();
  const { week, setSelectedLessonId } = useAppState();

  // The day's lessons for the active week — archived lessons filtered out per
  // the planner-store convention. Sorted by day, then subject for stable order.
  const dayLessons = useMemo(
    () =>
      lessons
        .filter((l) => l.week === week && l.archived !== true)
        .sort((a, b) => a.day - b.day || a.subject.localeCompare(b.subject)),
    [lessons, week],
  );

  function handleSelect(lessonId: string): void {
    dispatch({ type: "selectLesson", lessonId });
    // Keep the rest of the app coherent — the selected lesson drives Daily's
    // detail panel too.
    setSelectedLessonId(lessonId);
  }

  if (dayLessons.length === 0) {
    return (
      <p className={styles.muted}>
        No lessons planned for week {week}. Add one in Daily or Weekly.
      </p>
    );
  }

  return (
    <div>
      {dayLessons.map((lesson) => (
        <LessonRow
          key={lesson.id}
          lesson={lesson}
          active={lesson.id === activeLessonId}
          onSelect={() => handleSelect(lesson.id)}
        />
      ))}
    </div>
  );
}
