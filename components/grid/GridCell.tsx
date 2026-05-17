"use client";

// GridCell.tsx — one day×subject cell of the Weekly grid.
//
// A cell is a drop target for lesson cards and stacks any number of
// lessons vertically. Empty cells show the affordance from the spec
// (faint hint + 40×40 add button + subject-tinted hover border);
// populated cells show a faint inline add button on hover so a teacher
// can drop a second lesson into an already-used slot.
//
// Drag-and-drop is native HTML5 DnD (no extra dependency). The LessonCard
// renders its own grab affordance; the grid feeds it `dragHandleProps`
// (`draggable` + `onDragStart`/`onDragEnd`), so that handle — and only
// that handle — initiates the drag. The card body stays free for
// click-to-expand, satisfying the touch-conflict note in the brief.

import type { DragEvent, ReactNode } from "react";
import { useState } from "react";
import type { Lesson, LessonStatus, SubjectId } from "@/lib/types";
import { LessonCard } from "@/components/lesson-card";
import type {
  ContextAction,
  ContextActionPayload,
} from "@/components/lesson-card";
import type { CellShade } from "./unitShading";
import type { CellNavProps } from "./useGridNavigation";
import styles from "./WeeklyGrid.module.css";

interface GridCellProps {
  subjectId: SubjectId;
  day: number;
  /** Lessons in this cell, in stable order. */
  lessons: Lesson[];
  /** Background + accent for unit shading. */
  shade: CellShade;
  /** The lesson currently being dragged (anywhere in the grid). */
  draggingId: string | null;
  /** Ids of lessons expanded inline. */
  expandedIds: Set<string>;
  /** Currently selected lesson id. */
  selectedId: string | null;
  /** Start dragging a lesson out of this cell. */
  onDragStart: (lessonId: string) => void;
  /** Dragging ended without (or after) a drop. */
  onDragEnd: () => void;
  /** A card was dropped onto this cell. */
  onDrop: (subjectId: SubjectId, day: number) => void;
  /** The empty/inline add button was pressed. */
  onAdd: (subjectId: SubjectId, day: number) => void;
  /** A lesson card was clicked — select + toggle inline expand. */
  onSelect: (lessonId: string) => void;
  /** Completion checkbox cycled. */
  onToggleComplete: (lessonId: string, next: LessonStatus) => void;
  /** Context-menu action on a lesson card; payload carries move/status detail. */
  onContextAction: (
    action: ContextAction,
    lessonId: string,
    payload?: ContextActionPayload,
  ) => void;
  /** Roving-tabindex + arrow-key props for this cell (subject×day). */
  navProps: CellNavProps;
}

/** A single day/subject cell: drop target, card stack, empty affordance. */
export function GridCell({
  subjectId,
  day,
  lessons,
  shade,
  draggingId,
  expandedIds,
  selectedId,
  onDragStart,
  onDragEnd,
  onDrop,
  onAdd,
  onSelect,
  onToggleComplete,
  onContextAction,
  navProps,
}: GridCellProps): ReactNode {
  const [dragOver, setDragOver] = useState(false);
  const isEmpty = lessons.length === 0;

  // Unit shading + subject accent are passed to the cell as custom props
  // so the CSS module can tint the background and the hover/drop border.
  const cssVars = {
    "--cell-bg": shade.bg,
    "--cell-accent": shade.accent,
  } as React.CSSProperties;

  function handleDragOver(e: DragEvent<HTMLDivElement>): void {
    if (!draggingId) return;
    e.preventDefault(); // mark as a valid drop target
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragOver(false);
    if (draggingId) onDrop(subjectId, day);
  }

  // The cell is the roving-tabindex focus target for keyboard navigation
  // (planning_document §6.5). navProps supplies tabIndex / arrow-key
  // handling / the data attribute focus moves resolve against.
  const lessonCount = lessons.length;
  const cellLabel =
    lessonCount === 0
      ? "Empty cell"
      : `${lessonCount} lesson${lessonCount === 1 ? "" : "s"}`;

  return (
    <div
      className={`${styles.cell} ${dragOver ? styles.cellDragOver : ""}`}
      style={cssVars}
      role="gridcell"
      aria-label={cellLabel}
      {...navProps}
      onDragOver={handleDragOver}
      onDragEnter={() => draggingId && setDragOver(true)}
      onDragLeave={(e) => {
        // Only clear when the pointer truly leaves the cell, not when it
        // crosses into a child element.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragOver(false);
        }
      }}
      onDrop={handleDrop}
    >
      {isEmpty ? (
        <div className={styles.emptyCell}>
          <p className={styles.emptyHint}>Drag a lesson here or click +</p>
          <button
            type="button"
            className={styles.cellAdd}
            onClick={() => onAdd(subjectId, day)}
            aria-label="Add a lesson to this day"
          >
            <PlusIcon />
          </button>
        </div>
      ) : (
        <>
          {lessons.map((lesson) => (
            <div key={lesson.id} className={styles.cardSlot}>
              <LessonCard
                lesson={lesson}
                dense
                expanded={expandedIds.has(lesson.id)}
                selected={selectedId === lesson.id}
                dragging={draggingId === lesson.id}
                onSelect={onSelect}
                onToggleExpand={onSelect}
                onToggleComplete={onToggleComplete}
                // Forward the full context-action payload (e.g. the target
                // day for "Move to day") straight through to the grid.
                onContextAction={onContextAction}
                dragHandleProps={{
                  draggable: true,
                  onDragStart: (e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", lesson.id);
                    onDragStart(lesson.id);
                  },
                  onDragEnd,
                }}
              />
            </div>
          ))}
          {/* Faint add button so a populated cell can still take another. */}
          <button
            type="button"
            className={styles.cellAddInline}
            onClick={() => onAdd(subjectId, day)}
            aria-label="Add another lesson to this day"
          >
            <PlusIcon small />
            Add
          </button>
        </>
      )}
    </div>
  );
}

function PlusIcon({ small = false }: { small?: boolean }): ReactNode {
  const size = small ? 13 : 18;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
