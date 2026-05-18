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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  // this view's WeekNavigator both drive it. editMode drives whether inline
  // text edits fork the lesson (personal) or update Core Curriculum (master).
  const { week, setWeek, editMode } = useAppState();

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

  // ── Compact / move-mode state ────────────────────────────────────────
  // compact is true when either a drag is in progress (draggingId ≠ null)
  // or the teacher has toggled Move mode on manually.
  // compactManual persists between drags so the teacher can keep move mode
  // on while rearranging multiple lessons.
  const [compactManual, setCompactManual] = useState(false);
  const compact = compactManual || draggingId !== null;

  // ── Drag auto-scroll ─────────────────────────────────────────────────
  // A ref to the scroll container so the dragOver handler can read its
  // bounds without querying the DOM on every event.
  const scrollRef = useRef<HTMLDivElement>(null);
  // The rAF id for the current scroll loop — cancelled on drag end.
  const scrollRafRef = useRef<number | null>(null);
  // Current scroll velocity (px/frame), set by the dragOver proximity check.
  const scrollVelocityRef = useRef<number>(0);

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

  /** Expand every lesson card in the visible week. */
  const expandAll = useCallback(() => {
    setExpandedIds(() => {
      const next = new Set<string>();
      for (const l of lessons) {
        if (l.week === week) next.add(l.id);
      }
      return next;
    });
  }, [lessons, week]);

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

  // ── Drag auto-scroll implementation ─────────────────────────────────
  //
  // While a drag is active and the pointer nears the top or bottom edge of
  // the scroll container, we scroll it automatically so lessons off-screen
  // can be reached. The scroll loop runs via requestAnimationFrame; the
  // velocity is set each dragover event and cleared on dragend.
  //
  // Edge zone: 80px from the top / bottom of the visible scroll region.
  // Max speed: 14px per frame (≈ 840px/s at 60fps) — fast but not jarring.

  const SCROLL_EDGE = 80; // px from edge to begin scrolling
  const SCROLL_MAX = 14; // px per frame at the edge

  // Start the rAF scroll loop if not already running.
  const startScrollLoop = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    function tick() {
      const v = scrollVelocityRef.current;
      if (v !== 0 && scrollRef.current) {
        scrollRef.current.scrollTop += v;
      }
      scrollRafRef.current = requestAnimationFrame(tick);
    }
    scrollRafRef.current = requestAnimationFrame(tick);
  }, []);

  // Stop the rAF loop (called on dragend and when velocity drops to 0).
  const stopScrollLoop = useCallback(() => {
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
    scrollVelocityRef.current = 0;
  }, []);

  // Ensure the loop is cleaned up if the component unmounts mid-drag.
  useEffect(() => stopScrollLoop, [stopScrollLoop]);

  /**
   * Fired on dragover events on the scroll container. Computes how far
   * the pointer is from the top/bottom edge and sets the scroll velocity
   * proportionally, then starts the rAF loop if needed.
   */
  function handleScrollDragOver(e: React.DragEvent<HTMLDivElement>): void {
    if (!draggingId) return;
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const y = e.clientY;
    const distFromTop = y - rect.top;
    const distFromBottom = rect.bottom - y;

    let v = 0;
    if (distFromTop < SCROLL_EDGE) {
      // Near top — scroll up (negative).
      v = -SCROLL_MAX * (1 - distFromTop / SCROLL_EDGE);
    } else if (distFromBottom < SCROLL_EDGE) {
      // Near bottom — scroll down (positive).
      v = SCROLL_MAX * (1 - distFromBottom / SCROLL_EDGE);
    }

    scrollVelocityRef.current = v;
    if (v !== 0) {
      startScrollLoop();
    }
    // Loop keeps running with v=0 when pointer is in the middle zone —
    // that is fine: the tick just does nothing at zero velocity. The loop
    // is stopped cleanly on dragend.
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
    stopScrollLoop();
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

    stopScrollLoop();
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

  /**
   * Inline text edit committed on a lesson card.
   *
   * In personal mode (the default) the edit constitutes a lazy fork of the
   * Master lesson: modified and isPersonal are set to true, making the card
   * show the dashed stripe + "Modified" pill per the three-tier visual contract.
   *
   * In master mode the edit goes directly to the Core Curriculum copy — no fork,
   * no modified flag — because the teacher deliberately toggled into master mode.
   */
  function handleEditLesson(lessonId: string, patch: Partial<Lesson>): void {
    setLessons((prev) =>
      prev.map((l) => {
        if (l.id !== lessonId) return l;
        const forkFlags: Partial<Lesson> =
          editMode === "master"
            ? {} // Master edit: no fork markers
            : { modified: true, isPersonal: true }; // Personal: lazy fork
        return { ...l, ...patch, ...forkFlags };
      }),
    );
  }

  return (
    <div className={styles.page}>
      {/*
       * WeekNavigator is rendered by the WeekNavigator component (which owns
       * the navbar shell and the prev/next/today controls). The Move-mode
       * toggle is placed here, in a sibling wrapper inside the same navbar,
       * because WeekNavigator.tsx is read-only by convention (the agent owns
       * only WeeklyGrid.tsx, GridCell.tsx, WeeklyGrid.module.css). We render
       * a separate header row that contains both the WeekNavigator and the
       * move-mode button so the visual grouping stays correct.
       *
       * Implementation note: WeekNavigator renders a full <header> with
       * class .navbar. Rather than wrapping that, we inject the toggle as an
       * adjacent element styled to float into the same visual row. A flex
       * container wraps both and we use CSS to keep them aligned.
       *
       * Simpler alternative chosen: render a second sticky bar below the
       * WeekNavigator's sticky header that holds the toggle. This keeps the
       * two components fully decoupled.
       */}
      <WeekNavigator
        week={week}
        currentWeek={CURRENT_WEEK}
        minWeek={minWeek}
        maxWeek={maxWeek}
        onChange={setWeek}
      />

      {/* ── Move-mode toolbar ──────────────────────────────────────────
          A slim secondary bar beneath the week navigator that holds the
          compact / move-mode toggle. Sticky so it stays visible while
          scrolling the grid. The button is 44px tall (WCAG touch target). */}
      <div className={styles.moveToolbar}>
        <button
          type="button"
          className={`${styles.moveModeBtn} ${compactManual ? styles.moveModeBtnActive : ""}`}
          onClick={() => setCompactManual((v) => !v)}
          aria-pressed={compactManual}
          aria-label={
            compactManual
              ? "Exit Move mode (expand cards)"
              : "Enter Move mode (compact view)"
          }
        >
          <MoveIcon active={compactManual} />
          {compactManual ? "Exit Move mode" : "Move mode"}
        </button>
        {/* Expand / minimize every card in the visible week at once. */}
        <button
          type="button"
          className={styles.moveModeBtn}
          onClick={expandAll}
          aria-label="Expand all lesson cards"
        >
          Expand all
        </button>
        <button
          type="button"
          className={styles.moveModeBtn}
          onClick={collapseAll}
          aria-label="Minimize all lesson cards"
        >
          Minimize all
        </button>
      </div>

      <div
        ref={scrollRef}
        className={styles.scroll}
        onDragOver={handleScrollDragOver}
      >
        <div
          className={`${styles.grid} ${compact ? styles.gridCompact : ""}`}
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
              compact={compact}
              onDragStart={handleDragStart}
              onDragEnd={() => {
                stopScrollLoop();
                setDraggingId(null);
              }}
              onDrop={handleDrop}
              onDropRegion={handleDropRegion}
              onAdd={handleAdd}
              onSelect={handleSelect}
              onToggleComplete={handleToggleComplete}
              onContextAction={handleContextAction}
              onToggleMaximize={handleToggleMaximize}
              onEditLesson={handleEditLesson}
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
  /** Pass-through of the grid's compact / move-mode state. */
  compact: boolean;
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
  /** Inline text edit committed: threaded to each GridCell → WeeklyLessonCard. */
  onEditLesson: (id: string, patch: Partial<Lesson>) => void;
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
  compact,
  onDragStart,
  onDragEnd,
  onDrop,
  onDropRegion,
  onAdd,
  onSelect,
  onToggleComplete,
  onContextAction,
  onToggleMaximize,
  onEditLesson,
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
          compact={compact}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDrop={onDrop}
          onDropRegion={onDropRegion}
          onAdd={onAdd}
          onSelect={onSelect}
          onToggleComplete={onToggleComplete}
          onContextAction={onContextAction}
          onToggleMaximize={onToggleMaximize}
          onEditLesson={onEditLesson}
        />
      ))}
    </>
  );
}

// ── Move-mode icon ───────────────────────────────────────────────────────
// A simple arrows icon (two horizontal arrows) communicating "rearrange".
// Active state uses a filled/tinted variant (just a stroke-width bump).

function MoveIcon({ active }: { active: boolean }): ReactNode {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.5 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Left-right double arrow */}
      <path d="M7 16l-4-4 4-4M17 8l4 4-4 4M3 12h18" />
    </svg>
  );
}
