"use client";

// LessonsTab.tsx — the Unit Explorer's Lessons tab body.
//
// Extracted verbatim from UnitExplorer.tsx (B1.0). Lists the unit's lessons with
// fork cues, a Finish toggle, and the Plan / Teach row actions.

import { type ReactNode } from "react";
import type { Lesson } from "@/lib/types";
import { StatusDot, ForkCues, FinishPill } from "@/components/planner-v2";
import { Tooltip } from "@/components/ui";
import { dayShort, explorerStatus } from "./helpers";
import styles from "../UnitExplorer.module.css";

export function LessonsTab({
  lessons,
  setLessonStatus,
  onPlan,
  onTeach,
}: {
  lessons: Lesson[];
  setLessonStatus: (id: string, status: Lesson["status"]) => void;
  onPlan: (id: string) => void;
  onTeach: (id: string) => void;
}): ReactNode {
  if (lessons.length === 0) {
    return (
      <div className={styles.empty}>No lessons planned for this unit yet.</div>
    );
  }
  return (
    <ul className={styles.lessonList}>
      {lessons.map((l) => {
        const status = explorerStatus(l);
        const isDone = l.status === "done";
        return (
          <li key={l.id} className={styles.lessonRow}>
            <StatusDot status={status} />
            <div className={styles.lessonMain}>
              <div className={styles.lessonTitleRow}>
                {/* Title styled like SelectTitle but non-interactive — the
                    modal has no lesson-selection concept; the row's actions
                    (Plan / Teach / Finish) carry every affordance. */}
                <span className={styles.lessonTitle}>{l.title}</span>
                <ForkCues lesson={l} />
              </div>
              <div className={styles.lessonMeta}>
                Wk {l.week} · {dayShort(l.day)}
              </div>
            </div>
            <div className={styles.lessonActions}>
              <FinishPill
                status={status}
                isDone={isDone}
                onToggle={() =>
                  setLessonStatus(l.id, isDone ? "not_done" : "done")
                }
              />
              <Tooltip
                content="Open this lesson in the Lesson Planner to build it out."
                tooltipId="ue-lesson-plan"
                side="top"
              >
                <button
                  type="button"
                  className={styles.rowBtn}
                  onClick={() => onPlan(l.id)}
                >
                  Plan
                </button>
              </Tooltip>
              <Tooltip
                content="Open this lesson on the teaching board for live class use."
                tooltipId="ue-lesson-teach"
                side="top"
              >
                <button
                  type="button"
                  className={styles.rowBtn}
                  onClick={() => onTeach(l.id)}
                >
                  Teach
                </button>
              </Tooltip>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
