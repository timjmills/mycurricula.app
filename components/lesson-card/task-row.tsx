"use client";

// task-row.tsx — one inner row of a multi-task lesson (e.g. a center
// rotation). Renders inside the expanded card body. Each row stripes in
// its own subject color when the task carries a `subjectHint`, so a
// literacy-centers lesson can show reading / grammar / writing stations
// in their three colors.

import type { CSSProperties } from "react";
import type { LessonTask, SubjectId } from "@/lib/types";
import { resolveSubjectColor, usePalette } from "@/lib/palette";
import { StandardPill, Tooltip } from "@/components/ui";
import { CompletionCheck, ResourceTypeRow } from "./parts";
import { cycleStatus } from "./status";

interface TaskRowProps {
  task: LessonTask;
  /** Subject of the parent lesson — used when the task has no own hint. */
  parentSubject: SubjectId;
  /** Cycle handler for the task's completion check. */
  onCycle?: (next: LessonTask["status"]) => void;
}

export function TaskRow({ task, parentSubject, onCycle }: TaskRowProps) {
  const { type, mapping } = usePalette();
  // The row tints to its own sub-subject hint when present; the resolver
  // is pure so we can call it directly with the active palette context.
  const tintSubject = task.subjectHint ?? parentSubject;
  const color = resolveSubjectColor(tintSubject, type, mapping);
  const done = task.status === "done";

  return (
    <div
      style={
        {
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 9px",
          background: "var(--paper)",
          border: "1px solid var(--ink-150)",
          borderLeft: `3px solid ${color.stripe}`,
          borderRadius: 4,
        } as CSSProperties
      }
    >
      <CompletionCheck
        status={task.status}
        size={14}
        onCycle={() => onCycle?.(cycleStatus(task.status))}
        label={`Task: ${task.title}`}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.3,
            fontWeight: 500,
            color: "var(--ink-900)",
            textDecoration: done ? "line-through" : "none",
            textDecorationColor: "var(--ink-300)",
          }}
        >
          {task.title}
        </div>
      </div>
      <Tooltip
        content="Lesson task inside the parent lesson — tick it off as you finish each step."
        side="top"
      >
        <span
          title="Lesson task inside the parent lesson"
          tabIndex={0}
          style={{
            fontSize: 8.5,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            padding: "1px 5px",
            borderRadius: 2,
            background: color.cl,
            color: color.cd,
            flex: "0 0 auto",
          }}
        >
          Task
        </span>
      </Tooltip>
      {task.isPersonal && (
        <span
          style={{
            fontSize: 8.5,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            padding: "1px 5px",
            borderRadius: 2,
            background: "var(--ink-900)",
            color: "var(--paper)",
            flex: "0 0 auto",
          }}
        >
          Personal
        </span>
      )}
      <ResourceTypeRow resources={task.resources} dense />
      {task.standards.length > 0 && (
        <span style={{ flex: "0 0 auto" }}>
          <StandardPill code={task.standards[0]} />
        </span>
      )}
    </div>
  );
}
