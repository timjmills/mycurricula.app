"use client";

// WeeklyGrid.tsx — the Weekly view: subjects × Sun–Thu day grid.
//
// Layout (see WeeklyGrid.module.css):
//   row 0      → corner cell + five day headers
//   rows 1..n  → one subject row each: subject-label cell + five day cells
//
// Drag-and-drop uses native HTML5 DnD. Moving a card across days updates
// local state only — the mock fixture is never mutated and there is no
// persistence (per the task brief). A move keeps the lesson in the same
// subject row; only the `day` changes.
//
// Theme: `useTheme()` supplies the style axis (quiet/calm/vivid), which
// drives unit-cell shading. The palette axis is handled inside the
// per-subject color hook. The grid reads theme — it never sets it.

import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import type { Lesson, LessonStatus, SubjectId } from "@/lib/types";
import { useAppState } from "@/lib/app-state";
import { useTheme } from "@/lib/theme";
import { useSubjectColor } from "@/lib/palette";
import {
  LESSONS,
  SUBJECTS,
  UNITS,
  CURRENT_WEEK,
  WEEK_DAYS,
  WEEK_DAYS_SHORT,
} from "@/lib/mock";
import type {
  ContextAction,
  ContextActionPayload,
} from "@/components/lesson-card";
import { WeekNavigator } from "./WeekNavigator";
import { GridCell } from "./GridCell";
import { resolveCellShade } from "./unitShading";
import type { CellShade } from "./unitShading";
import { useGridNavigation } from "./useGridNavigation";
import type { CellNavProps, CellPos } from "./useGridNavigation";
import styles from "./WeeklyGrid.module.css";

const DAY_COUNT = WEEK_DAYS.length; // 5 — Sun..Thu

/** Span of navigable weeks, derived from the lesson fixture. */
function weekBounds(lessons: Lesson[]): { min: number; max: number } {
  const weeks = lessons.map((l) => l.week);
  return { min: Math.min(...weeks), max: Math.max(...weeks) };
}

export function WeeklyGrid(): ReactNode {
  const { style } = useTheme();
  // The visible week is shared planner state — the top-bar week jumper and
  // this view's WeekNavigator both drive it.
  const { week, setWeek } = useAppState();

  // All lessons live in local state so drag-to-move and the completion
  // checkbox can mutate copies without touching the imported fixture.
  const [lessons, setLessons] = useState<Lesson[]>(() => [...LESSONS]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Inline expansion is grid-owned per spec §6.5: Weekly cards expand in
  // place. Expansion is sticky and multiple cards may be open at once.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { min: minWeek, max: maxWeek } = useMemo(() => weekBounds(LESSONS), []);

  // Lessons for the visible week, bucketed by subject then day.
  // bySubjectDay[subjectId][dayIndex] → Lesson[].
  const bySubjectDay = useMemo(() => {
    const buckets: Record<string, Lesson[][]> = {};
    for (const s of SUBJECTS) {
      buckets[s.id] = Array.from({ length: DAY_COUNT }, () => []);
    }
    for (const lesson of lessons) {
      if (lesson.week !== week) continue;
      if (lesson.day < 0 || lesson.day >= DAY_COUNT) continue;
      buckets[lesson.subject]?.[lesson.day].push(lesson);
    }
    return buckets;
  }, [lessons, week]);

  const weekHasLessons = useMemo(
    () => lessons.some((l) => l.week === week),
    [lessons, week],
  );

  // ── Keyboard navigation ─────────────────────────────────────────────
  // A roving tabindex over the subject×day cells. Enter on a cell expands
  // its lessons; Esc collapses every open card. Cell (row, col) maps to
  // (SUBJECTS[row], dayIndex col).
  const expandCell = useCallback(
    (pos: CellPos) => {
      const subject = SUBJECTS[pos.row];
      const cellLessons = bySubjectDay[subject.id]?.[pos.col] ?? [];
      if (cellLessons.length === 0) return;
      setExpandedIds((prev) => {
        const next = new Set(prev);
        // Open every lesson in the cell — a cell may stack several.
        for (const l of cellLessons) next.add(l.id);
        return next;
      });
      setSelectedId(cellLessons[0].id);
    },
    [bySubjectDay],
  );

  const collapseAll = useCallback(() => {
    setExpandedIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const gridNav = useGridNavigation({
    rowCount: SUBJECTS.length,
    colCount: DAY_COUNT,
    onActivate: expandCell,
    onCollapse: collapseAll,
  });

  /**
   * Drag start — record the dragging id immediately (needed by handleDrop),
   * then collapse every expanded card on the next animation frame.
   *
   * Collapsing synchronously inside the dragstart event handler causes the
   * drag source element to resize while the browser is still capturing the
   * drag image, which cancels the drag in Chrome and Edge. Deferring to rAF
   * lets the browser finish the dragstart task (and snapshot the ghost image)
   * before any DOM mutation occurs.
   */
  function handleDragStart(id: string): void {
    setDraggingId(id);
    requestAnimationFrame(() => {
      setExpandedIds((prev) => (prev.size === 0 ? prev : new Set()));
    });
  }

  /** Move the dragged lesson into the target cell (subject row + day). */
  function handleDrop(subjectId: SubjectId, day: number): void {
    if (!draggingId) return;
    setLessons((prev) =>
      prev.map((l) =>
        l.id === draggingId
          ? {
              ...l,
              day,
              // A lesson dropped in a subject row keeps its subject; only
              // the day changes. Flag it as moved-within-week for the card.
              subject: subjectId,
              moved: l.day === day ? l.moved : "same-week",
            }
          : l,
      ),
    );
    setDraggingId(null);
  }

  /** Placeholder add — no lesson-creation flow exists in the mock. */
  function handleAdd(subjectId: SubjectId, day: number): void {
    // Lesson creation is out of scope for the grid task; the affordance
    // is wired so the interaction is testable once an editor exists.
    void subjectId;
    void day;
  }

  /** Card click → select + toggle inline expansion (spec §6.5). */
  function handleSelect(lessonId: string): void {
    setSelectedId(lessonId);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(lessonId)) next.delete(lessonId);
      else next.add(lessonId);
      return next;
    });
  }

  /** Completion checkbox cycle — done → partial → not_done. */
  function handleToggleComplete(
    lessonId: string,
    nextStatus: LessonStatus,
  ): void {
    setLessons((prev) =>
      prev.map((l) => (l.id === lessonId ? { ...l, status: nextStatus } : l)),
    );
  }

  /**
   * Context-menu actions that mutate the grid's local lesson state.
   * Mirrors the drag-and-drop model — local state only, no backend.
   *
   * `payload` carries action detail: `day` / `week` for Move targets,
   * `status` for Mark-status. A same-week move flips `moved` to
   * "same-week" (matching a drag); a cross-week move flips it to
   * "across-weeks". Actions outside the grid's scope (copy-to-personal,
   * print, etc.) intentionally no-op here.
   */
  function handleContextAction(
    action: ContextAction,
    lessonId: string,
    payload?: ContextActionPayload,
  ): void {
    if (action === "duplicate") {
      setLessons((prev) => {
        const source = prev.find((l) => l.id === lessonId);
        if (!source) return prev;
        // Clone into the same cell with a fresh id; the copy is a
        // personal, unmodified lesson so it reads as the teacher's own.
        const copy: Lesson = {
          ...source,
          id: `${source.id}-copy-${Date.now().toString(36)}`,
          isPersonal: true,
          modified: false,
          moved: null,
          pendingMaster: false,
          commentCount: 0,
          unreadComments: 0,
        };
        // Insert directly after the source so it stacks beneath it.
        const at = prev.findIndex((l) => l.id === lessonId);
        return [...prev.slice(0, at + 1), copy, ...prev.slice(at + 1)];
      });
      return;
    }

    if (action === "move") {
      // "Move to day" → payload.day (0–4). "Move to week" → payload.week.
      const toDay = typeof payload?.day === "number" ? payload.day : null;
      const toWeek = typeof payload?.week === "number" ? payload.week : null;
      if (toDay === null && toWeek === null) return; // no actionable target
      if (toDay !== null && (toDay < 0 || toDay >= DAY_COUNT)) return;
      setLessons((prev) =>
        prev.map((l) => {
          if (l.id !== lessonId) return l;
          const nextDay = toDay ?? l.day;
          const nextWeek = toWeek ?? l.week;
          const sameSlot = nextDay === l.day && nextWeek === l.week;
          return {
            ...l,
            day: nextDay,
            week: nextWeek,
            moved: sameSlot
              ? l.moved
              : nextWeek !== l.week
                ? "across-weeks"
                : "same-week",
          };
        }),
      );
      setSelectedId(lessonId);
      return;
    }

    if (action === "mark-status" && payload?.status) {
      handleToggleComplete(lessonId, payload.status);
    }
  }

  return (
    <div className={styles.page}>
      <WeekNavigator
        week={week}
        currentWeek={CURRENT_WEEK}
        minWeek={minWeek}
        maxWeek={maxWeek}
        onChange={setWeek}
      />

      <div className={styles.scroll}>
        <div
          className={styles.grid}
          role="grid"
          aria-label={`Weekly plan, week ${week}`}
        >
          {/* ── Day header row ── */}
          <div className={styles.cornerCell} role="presentation" />
          {WEEK_DAYS.map((dayName, dayIdx) => (
            <div
              key={dayName}
              role="columnheader"
              className={`${styles.dayHead} ${
                week === CURRENT_WEEK && dayIdx === 0 ? styles.dayHeadToday : ""
              }`}
            >
              <span>{dayName}</span>
              <span className={styles.dayHeadDate}>
                {WEEK_DAYS_SHORT[dayIdx]}
              </span>
            </div>
          ))}

          {/* ── Subject rows ── */}
          {!weekHasLessons && (
            <div className={styles.emptyWeek} role="status">
              No lessons planned for week {week} yet.
            </div>
          )}
          {SUBJECTS.map((subject, rowIdx) => (
            <SubjectRow
              key={subject.id}
              rowIndex={rowIdx}
              subjectId={subject.id}
              cells={bySubjectDay[subject.id]}
              style={style}
              draggingId={draggingId}
              expandedIds={expandedIds}
              selectedId={selectedId}
              cellProps={gridNav.cellProps}
              onDragStart={handleDragStart}
              onDragEnd={() => setDraggingId(null)}
              onDrop={handleDrop}
              onAdd={handleAdd}
              onSelect={handleSelect}
              onToggleComplete={handleToggleComplete}
              onContextAction={handleContextAction}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Subject row ───────────────────────────────────────────────────────
// Split into its own component so the subject-color hook (one per row)
// is called at a stable position — hooks can't run inside the .map above.

interface SubjectRowProps {
  /** Row index — the row coordinate for keyboard navigation. */
  rowIndex: number;
  subjectId: SubjectId;
  cells: Lesson[][];
  style: ReturnType<typeof useTheme>["style"];
  draggingId: string | null;
  expandedIds: Set<string>;
  selectedId: string | null;
  /** Builds the roving-tabindex props for a cell at (row, col). */
  cellProps: (row: number, col: number) => CellNavProps;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (subjectId: SubjectId, day: number) => void;
  onAdd: (subjectId: SubjectId, day: number) => void;
  onSelect: (id: string) => void;
  onToggleComplete: (id: string, next: LessonStatus) => void;
  onContextAction: (
    action: ContextAction,
    id: string,
    payload?: ContextActionPayload,
  ) => void;
}

function SubjectRow({
  rowIndex,
  subjectId,
  cells,
  style,
  draggingId,
  expandedIds,
  selectedId,
  cellProps,
  onDragStart,
  onDragEnd,
  onDrop,
  onAdd,
  onSelect,
  onToggleComplete,
  onContextAction,
}: SubjectRowProps): ReactNode {
  const color = useSubjectColor(subjectId);
  const subject = SUBJECTS.find((s) => s.id === subjectId)!;
  const unit = UNITS[subjectId];

  // Unit shading is uniform across a subject row here: the mock has one
  // active unit per subject, so every cell in the row shares its shade.
  const shade: CellShade = resolveCellShade(style, color, unit.shade);

  return (
    <>
      <div className={`${styles.subjectHead} cp-subj ${subjectId}`}>
        <span
          className={styles.subjectTile}
          style={{ background: color.tile, color: color.deep }}
          aria-hidden="true"
        >
          {subject.icon}
        </span>
        <span className={styles.subjectName} style={{ color: color.deep }}>
          {subject.name}
        </span>
      </div>

      {Array.from({ length: DAY_COUNT }, (_, day) => (
        <GridCell
          key={day}
          subjectId={subjectId}
          day={day}
          lessons={cells?.[day] ?? []}
          shade={shade}
          draggingId={draggingId}
          expandedIds={expandedIds}
          selectedId={selectedId}
          navProps={cellProps(rowIndex, day)}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDrop={onDrop}
          onAdd={onAdd}
          onSelect={onSelect}
          onToggleComplete={onToggleComplete}
          onContextAction={onContextAction}
        />
      ))}
    </>
  );
}
