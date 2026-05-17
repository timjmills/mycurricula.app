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
// Split-slot layout: a lesson dropped with a DropRegion can be arranged
// side-by-side (half-left / half-right), stacked in a new row (above /
// below), or paged into an existing slot (on). cellLayouts holds the
// arranged state, keyed by cellKey(subjectId, day).
//
// Context-menu "stack / unstack" is a planned follow-up; this increment
// is drag-based arrangement only.
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
import type { CellLayout, DropRegion } from "@/lib/cell-layout";
import { cellKey, isTrivialLayout } from "@/lib/cell-layout";
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
  // maximizedCell — only one cell is expanded at a time. Key = `${subjectId}:${day}`.
  const [maximizedCell, setMaximizedCell] = useState<string | null>(null);

  // Per-cell arranged layouts, keyed by cellKey(subjectId, day).
  // A cell with no entry here renders its default CardStack view.
  const [cellLayouts, setCellLayouts] = useState<Record<string, CellLayout>>(
    {},
  );

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

  // ── Layout-mutation helpers ────────────────────────────────────────────
  //
  // These helpers build/modify CellLayout values.  They are pure functions
  // so they are easy to test and reason about in isolation.
  //
  // MAX_VISIBLE_ROWS: at most two rows are visible at once. If a third row
  // would be added, its lessons are folded into the nearest existing slot's
  // paged stack instead (i.e. appended to the last slot of the last row).

  const MAX_VISIBLE_ROWS = 2;

  /**
   * Build a seed CellLayout from a flat array of lesson ids.
   * Each id gets its own single-lesson slot; all slots are stacked into
   * a single full-width row if there is only one, or the first two
   * lessons fill the two visible rows (each as a solo slot) and any
   * remaining lessons are folded into the second row's slot.
   *
   * The result is always a valid CellLayout that matches exactly the ids
   * that were already in the cell — no lesson is added or removed.
   */
  function seedLayout(ids: string[]): CellLayout {
    if (ids.length === 0) return [[ids]]; // single empty slot
    if (ids.length === 1) return [[[ids[0]]]]; // row[0] = [slot[lessonId]]
    // Two or more: put the first in row 0, everything else in row 1 slot 0.
    return [[[ids[0]]], [ids.slice(1)]];
  }

  /**
   * Remove a lesson id from all slots in a layout.
   * Empty slots are dropped; empty rows are dropped.
   * Returns the pruned layout (may be an empty array if the lesson was
   * the only one — callers should delete the layout entry in that case).
   */
  function removeIdFromLayout(layout: CellLayout, id: string): CellLayout {
    return layout
      .map((row) =>
        row
          .map((slot) => slot.filter((slotId) => slotId !== id))
          .filter((slot) => slot.length > 0),
      )
      .filter((row) => row.length > 0);
  }

  /**
   * Apply a DropRegion to a CellLayout, inserting `newId` according to
   * the teacher's intent.
   *
   * Region semantics:
   *   "cell"       — empty cell: single slot with just newId.
   *   "half-left"  — first row gets two slots; newId goes on the left.
   *   "half-right" — first row gets two slots; newId goes on the right.
   *   "above"      — new solo row inserted at the top; overflow is folded.
   *   "below"      — new solo row appended at the bottom; overflow is folded.
   *   "on"         — newId appended to the first slot of the first row
   *                  (CellDropZones tells the grid which slot was targeted,
   *                  but we approximate by placing it in row[0][0]; the
   *                  more granular "on-slot" variant is a follow-up).
   *
   * The two-visible-row cap is enforced: any row that would push total rows
   * past MAX_VISIBLE_ROWS has its lessons folded into the last slot of the
   * last row that fits.
   */
  function applyRegion(
    layout: CellLayout,
    newId: string,
    region: DropRegion,
  ): CellLayout {
    // Deep-clone so mutations don't bleed.
    let rows: CellLayout = layout.map((row) => row.map((slot) => [...slot]));

    switch (region) {
      case "cell":
        // Landing on an empty cell — just start fresh.
        return [[[newId]]];

      case "half-left": {
        // Ensure the first row has exactly two slots; put newId on the left.
        if (rows.length === 0) {
          rows = [[[newId], []]];
        } else {
          const firstRow = rows[0];
          if (firstRow.length >= 2) {
            // Already two slots — replace the left slot with [newId, ...existing].
            firstRow[0] = [newId, ...firstRow[0]];
          } else {
            // Only one slot — split: newId on left, existing lessons on right.
            const existing = firstRow[0] ?? [];
            rows[0] = [[newId], existing];
          }
        }
        break;
      }

      case "half-right": {
        // Mirror of half-left: newId on the right.
        if (rows.length === 0) {
          rows = [[[]], [[newId]]];
        } else {
          const firstRow = rows[0];
          if (firstRow.length >= 2) {
            // Already two slots — append to right slot.
            firstRow[1] = [...firstRow[1], newId];
          } else {
            // One slot — split: existing on left, newId on right.
            const existing = firstRow[0] ?? [];
            rows[0] = [existing, [newId]];
          }
        }
        break;
      }

      case "above": {
        // Prepend a new solo row. Fold if that would exceed the visible cap.
        const newRow: CellLayout[number] = [[newId]];
        rows = [newRow, ...rows];
        rows = foldExcessRows(rows);
        break;
      }

      case "below": {
        // Append a new solo row. Fold if that would exceed the visible cap.
        const newRow: CellLayout[number] = [[newId]];
        rows = [...rows, newRow];
        rows = foldExcessRows(rows);
        break;
      }

      case "on":
      default: {
        // Add to the paged stack at the first slot of the first row.
        if (rows.length === 0) {
          rows = [[[newId]]];
        } else {
          rows[0][0] = [...(rows[0][0] ?? []), newId];
        }
        break;
      }
    }

    return rows;
  }

  /**
   * Enforce the two-visible-row cap by folding excess-row lessons into
   * the last slot of the last allowed row.  This keeps every lesson
   * accessible via paged stacking without infinite row growth.
   */
  function foldExcessRows(rows: CellLayout): CellLayout {
    if (rows.length <= MAX_VISIBLE_ROWS) return rows;
    const kept = rows.slice(0, MAX_VISIBLE_ROWS);
    const overflow = rows.slice(MAX_VISIBLE_ROWS);
    // Collect all lesson ids from overflow rows.
    const extraIds = overflow.flatMap((row) => row.flatMap((slot) => slot));
    // Fold into the last slot of the last kept row.
    const lastRow = kept[kept.length - 1];
    const lastSlot = lastRow[lastRow.length - 1];
    lastRow[lastRow.length - 1] = [...lastSlot, ...extraIds];
    return kept;
  }

  /**
   * Handle a region-aware drop: the teacher dropped `draggingId` onto the
   * target cell (subjectId × day) with a specific placement intent.
   *
   * Steps:
   *   1. Move the lesson in the flat `lessons` array (updates subject/day).
   *   2. Remove the lesson from its previous cell's layout (if any).
   *   3. Seed a layout for the target cell if it has none yet.
   *   4. Apply the region to the target layout.
   *   5. Prune trivial layouts (single-lesson, no arrangement) so the
   *      default CardStack rendering stays in effect where layout adds
   *      no value.
   */
  function handleDropRegion(
    subjectId: SubjectId,
    day: number,
    region: DropRegion,
  ): void {
    if (!draggingId) return;
    const draggedId = draggingId;

    // 1. Find the current lesson to know its source cell.
    const sourceLessons = lessons;
    const draggedLesson = sourceLessons.find((l) => l.id === draggedId);
    if (!draggedLesson) {
      setDraggingId(null);
      return;
    }
    const srcKey = cellKey(draggedLesson.subject, draggedLesson.day);
    const tgtKey = cellKey(subjectId, day);

    // 2. Update the flat lessons array — move lesson to target cell.
    setLessons((prev) =>
      prev.map((l) =>
        l.id === draggedId
          ? {
              ...l,
              day,
              subject: subjectId,
              moved:
                l.day === day && l.subject === subjectId
                  ? l.moved
                  : "same-week",
            }
          : l,
      ),
    );

    // 3. Mutate the layouts: remove from source, apply region to target.
    setCellLayouts((prevLayouts) => {
      const next = { ...prevLayouts };

      // ── Remove from source cell layout ──────────────────────────────
      if (srcKey !== tgtKey && next[srcKey]) {
        const pruned = removeIdFromLayout(next[srcKey], draggedId);
        if (pruned.length === 0) {
          // Source cell is now empty — drop its layout entry entirely.
          delete next[srcKey];
        } else {
          next[srcKey] = pruned;
        }
      }

      // ── Seed target layout from current flat lessons if needed ───────
      // We need to know which lessons are currently in the target cell
      // (before the move updates them in the next render). We use the
      // sourceLessons snapshot captured above, excluding the dragged id.
      if (!next[tgtKey]) {
        const currentTargetIds = sourceLessons
          .filter(
            (l) =>
              l.subject === subjectId &&
              l.day === day &&
              l.week === draggedLesson.week && // same week only
              l.id !== draggedId,
          )
          .map((l) => l.id);
        if (currentTargetIds.length > 0) {
          next[tgtKey] = seedLayout(currentTargetIds);
        }
        // If the cell is empty, applyRegion handles the "cell" region case.
      } else {
        // Remove the dragged lesson from the target layout in case it
        // was already present there (e.g. same-cell reorder).
        const cleaned = removeIdFromLayout(next[tgtKey], draggedId);
        next[tgtKey] = cleaned.length > 0 ? cleaned : [];
      }

      // ── Apply the region ─────────────────────────────────────────────
      const baseLayout = next[tgtKey] ?? [];
      const updatedLayout = applyRegion(baseLayout, draggedId, region);

      // ── Prune trivial layouts ────────────────────────────────────────
      // A single-lesson layout with no arrangement is the same as the
      // default CardStack view — drop the entry to avoid unnecessary state.
      if (isTrivialLayout(updatedLayout)) {
        delete next[tgtKey];
      } else {
        next[tgtKey] = updatedLayout;
      }

      return next;
    });

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

  /**
   * Toggle the maximized state of a cell. Clicking an already-maximized cell
   * collapses it; clicking any other cell replaces the current one — only one
   * cell is ever open at a time.
   */
  function handleToggleMaximize(subjectId: SubjectId, day: number): void {
    const key = `${subjectId}:${day}`;
    setMaximizedCell((prev) => (prev === key ? null : key));
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
              maximizedCell={maximizedCell}
              cellLayouts={cellLayouts}
              cellProps={gridNav.cellProps}
              onDragStart={handleDragStart}
              onDragEnd={() => setDraggingId(null)}
              onDrop={handleDrop}
              onDropRegion={handleDropRegion}
              onAdd={handleAdd}
              onSelect={handleSelect}
              onToggleComplete={handleToggleComplete}
              onContextAction={handleContextAction}
              onToggleMaximize={handleToggleMaximize}
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
  /** Key of the currently maximized cell (`${subjectId}:${day}`), or null. */
  maximizedCell: string | null;
  /** Per-cell arranged layouts, passed through to GridCell. */
  cellLayouts: Record<string, CellLayout>;
  /** Builds the roving-tabindex props for a cell at (row, col). */
  cellProps: (row: number, col: number) => CellNavProps;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (subjectId: SubjectId, day: number) => void;
  /** Region-aware drop: teacher chose a specific placement zone. */
  onDropRegion: (subjectId: SubjectId, day: number, region: DropRegion) => void;
  onAdd: (subjectId: SubjectId, day: number) => void;
  onSelect: (id: string) => void;
  onToggleComplete: (id: string, next: LessonStatus) => void;
  onContextAction: (
    action: ContextAction,
    id: string,
    payload?: ContextActionPayload,
  ) => void;
  onToggleMaximize: (subjectId: SubjectId, day: number) => void;
}

function SubjectRow({
  rowIndex,
  subjectId,
  cells,
  style,
  draggingId,
  expandedIds,
  selectedId,
  maximizedCell,
  cellLayouts,
  cellProps,
  onDragStart,
  onDragEnd,
  onDrop,
  onDropRegion,
  onAdd,
  onSelect,
  onToggleComplete,
  onContextAction,
  onToggleMaximize,
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
          maximized={maximizedCell === `${subjectId}:${day}`}
          cellLayout={cellLayouts[cellKey(subjectId, day)] ?? null}
          navProps={cellProps(rowIndex, day)}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDrop={onDrop}
          onDropRegion={onDropRegion}
          onAdd={onAdd}
          onSelect={onSelect}
          onToggleComplete={onToggleComplete}
          onContextAction={onContextAction}
          onToggleMaximize={onToggleMaximize}
        />
      ))}
    </>
  );
}
