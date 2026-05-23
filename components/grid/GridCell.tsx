"use client";

// GridCell.tsx — one day×subject cell of the Weekly grid.
//
// Drop model (spec §3.3):
//   Each cell is a dnd-kit droppable (id = "cell:<subjectId>:<day>").
//   While a drag is over this cell the cell glow appears: dashed 2px border
//   + subject-tint fill at ~30% opacity. No CellDropZones overlay — that
//   region-based split-slot affordance is superseded by the cell-level model.
//
// Card wrappers (spec §3 / §6.1):
//   Each lesson is wrapped in a SortableLessonItem that calls useSortable().
//   The dnd-kit transform/transition are applied to the wrapper; the
//   listeners + attributes are forwarded to WeeklyLessonCard as dragHandleProps
//   so the grip handle in the card header is the only drag activator.
//
// Density (spec §2.2):
//   `density` comes from WeeklyGrid's board-level DragState.
//   All cards receive density simultaneously — no card decides for itself.
//
// Anchored chrome (spec §3.5):
//   The cell shell, the collapse/expand button, and the empty-cell add button
//   are not lesson cards — they never change density.
//
// Within-cell reorder (spec §3.4):
//   TODO §3.4 — horizontal insertion-line reorder within a same-cell drop is
//   deferred. The cell uses a vertical SortableContext so within-cell order is
//   maintained but no insertion line is shown between chips yet.
//
// Split-slot layout:
//   CellLayout-based rendering (the old half-left/half-right/above/below logic)
//   is preserved for cells that already have a layout. New drags land at the
//   cell level and do not create a CellLayout — they merge into the flat
//   CardStack via the grid's handleDragEnd.

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import React, { useCallback } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS as DndCSS } from "@dnd-kit/utilities";
import type {
  Lesson,
  LessonStatus,
  SubjectId,
  WeeklyCardDeck,
} from "@/lib/types";
import { WeeklyLessonCard } from "@/components/weekly";
import type { ContextAction, ContextActionPayload } from "@/components/weekly";
import type { CellLayout } from "@/lib/cell-layout";
import type { DragState, Density } from "@/lib/collapse-on-drag";
import type { CellShade } from "./unitShading";
import type { CellNavProps } from "./useGridNavigation";
import { CardStack } from "./card-stack";
import styles from "./WeeklyGrid.module.css";

// ── SortableLessonItem — thin dnd-kit wrapper around a lesson card ─────────────
// Applies the dnd-kit sortable transform to its own wrapper div and forwards
// the listeners + attributes to WeeklyLessonCard via dragHandleProps.
//
// The drag is card-handle-only: listeners are spread onto the dragHandleProps
// object that WeeklyLessonCard places on its grip icon.
//
// Accessibility: useSortable provides role="button" / aria-pressed / aria-roledescription
// through `attributes`, wired via dragHandleProps.

interface SortableLessonItemProps {
  lesson: Lesson;
  density: Density;
  expanded: boolean;
  selected: boolean;
  /** True when this card is in the bulk multi-selection (BIG-1). */
  bulkSelected: boolean;
  dragging: boolean;
  /** Multi-lesson pager state — when present the card renders an in-card
   *  flip-through footer. Absent for single-lesson and maximized cells. */
  deck?: WeeklyCardDeck;
  onSelect: (id: string) => void;
  /** BIG-1: modifier-aware select (Ctrl/Shift-click). */
  onSelectWithModifiers: (
    id: string,
    modifiers: { ctrl: boolean; shift: boolean },
  ) => void;
  onToggleComplete: (id: string, next: LessonStatus) => void;
  onContextAction: (
    action: ContextAction,
    id: string,
    payload?: ContextActionPayload,
  ) => void;
  onEditLesson: (id: string, patch: Partial<Lesson>) => void;
  onSaveTarget: (id: string, target: "personal" | "core") => void;
}

// Memoized on (lesson.id, density) per spec §2.7: without this, every item
// re-renders on every pointer-move during drag (onDragOver fires continuously),
// which at 100+ items drops below 60fps. The memo's shallow comparison on
// the full props object is sufficient because:
//   • lesson identity is stable (same object reference from lessons array)
//   • density changes once (idle→compact on drag-start, compact→idle on drop)
//   • expanded/selected/dragging/bulkSelected are primitives
//   • callbacks are stable (useCallback in GridCell)
//   • deck (when present) is a stable object — CardStack memoizes it and its
//     onPrev/onNext handlers with useMemo/useCallback, so it does not change
//     identity on drag pointer-moves.
const SortableLessonItem = React.memo(function SortableLessonItem({
  lesson,
  density,
  expanded,
  selected,
  bulkSelected,
  dragging,
  deck,
  onSelect,
  onSelectWithModifiers,
  onToggleComplete,
  onContextAction,
  onEditLesson,
  onSaveTarget,
}: SortableLessonItemProps): ReactNode {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id });

  const wrapperStyle: React.CSSProperties = {
    // Apply dnd-kit transform for smooth sortable animation.
    transform: DndCSS.Transform.toString(transform),
    transition,
    // Ghost the item in its source slot while the DragOverlay follows the cursor.
    opacity: isDragging ? 0.35 : 1,
    position: "relative",
  };

  // dragHandleProps merges dnd-kit listeners + attributes so the grip icon
  // in the card header is the sole drag activator (spec §2.5 touch note).
  const dragHandleProps: React.HTMLAttributes<HTMLElement> = {
    ...listeners,
    ...attributes,
  };

  // BIG-1: intercept Ctrl/Meta/Shift-click on the card wrapper so modifier
  // keys route through onSelectWithModifiers instead of the plain onSelect.
  // The wrapper div is not interactive by default; we only intercept when a
  // modifier key is down so normal single clicks pass through to the card's
  // own click handler (which calls onSelect via its onSelect prop).
  function handleWrapperClick(e: React.MouseEvent<HTMLDivElement>): void {
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    if (ctrl || shift) {
      e.stopPropagation();
      onSelectWithModifiers(lesson.id, { ctrl, shift });
    }
  }

  // A bulk-selected card shows the card's own `selected` ring in addition to
  // a data attribute so CSS can add a distinct overlay ring without modifying
  // the card component itself.
  return (
    <div
      ref={setNodeRef}
      style={wrapperStyle}
      className={styles.cardSlot}
      onClick={handleWrapperClick}
      data-bulk-selected={bulkSelected ? "true" : undefined}
    >
      <WeeklyLessonCard
        lesson={lesson}
        density={density}
        expanded={expanded}
        selected={selected || bulkSelected}
        dragging={dragging || isDragging}
        deck={deck}
        onSelect={onSelect}
        onToggleExpand={onSelect}
        onToggleComplete={onToggleComplete}
        onContextAction={onContextAction}
        onEditLesson={onEditLesson}
        onSaveTarget={onSaveTarget}
        dragHandleProps={dragHandleProps}
      />
    </div>
  );
});

// ── GridCellProps ──────────────────────────────────────────────────────────────

interface GridCellProps {
  subjectId: SubjectId;
  day: number;
  lessons: Lesson[];
  shade: CellShade;
  // viewMode is no longer a GridCell concern — the Grid/List axis is resolved
  // by WeeklyShell before WeeklyGrid is rendered. The grid always renders in
  // "grid" mode; list mode renders a separate WeeklyList component entirely.
  /** Board-level drag state (for `isOver` detection via droppable). */
  dragState: DragState;
  /** Board-wide density derived from dragState. */
  density: Density;
  expandedIds: Set<string>;
  selectedId: string | null;
  /** IDs currently bulk-selected (BIG-1). */
  bulkSelectedIds: Set<string>;
  maximized: boolean;
  cellLayout: CellLayout | null;
  onAdd: (subjectId: SubjectId, day: number) => void;
  onSelect: (lessonId: string) => void;
  /** BIG-1: modifier-aware select (Ctrl/Shift-click). */
  onSelectWithModifiers: (
    id: string,
    modifiers: { ctrl: boolean; shift: boolean },
  ) => void;
  onToggleComplete: (lessonId: string, next: LessonStatus) => void;
  onContextAction: (
    action: ContextAction,
    lessonId: string,
    payload?: ContextActionPayload,
  ) => void;
  navProps: CellNavProps;
  onToggleMaximize: (subjectId: SubjectId, day: number) => void;
  onEditLesson: (id: string, patch: Partial<Lesson>) => void;
  onSaveTarget: (id: string, target: "personal" | "core") => void;
}

/** A single day/subject cell: droppable target + sortable card list. */
export function GridCell({
  subjectId,
  day,
  lessons,
  shade,
  dragState,
  density,
  expandedIds,
  selectedId,
  bulkSelectedIds,
  maximized,
  cellLayout,
  onAdd,
  onSelect,
  onSelectWithModifiers,
  onToggleComplete,
  onContextAction,
  navProps,
  onToggleMaximize,
  onEditLesson,
  onSaveTarget,
}: GridCellProps): ReactNode {
  // WeeklyGrid always renders in "grid" mode — the Grid/List toggle is
  // resolved upstream by WeeklyShell, which mounts either WeeklyGrid or the
  // upcoming WeeklyList. Density here is driven by DragState only (board-level
  // collapse-on-drag per spec §2.2); no viewMode override is applied.
  const effectiveDensity: Density = density;

  // ── dnd-kit droppable (spec §3.3) ─────────────────────────────────────────
  const droppableId = `cell:${subjectId}:${day}`;
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: droppableId,
  });

  const isEmpty = lessons.length === 0;
  const hasMultiple = lessons.length > 1;
  const lessonIds = lessons.map((l) => l.id);

  const cssVars = {
    "--cell-bg": shade.bg,
    "--cell-accent": shade.accent,
  } as React.CSSProperties;

  // ── Cell glow when dragged over (spec §3.3 / §7) ──────────────────────────
  // isOver from useDroppable fires when dnd-kit's pointer is over this cell.
  // We show the dashed border + subject-tint at ~30% opacity.
  const isDragging = dragState.phase !== "idle";
  const showDropGlow = isDragging && isOver;
  // When an occupied cell is the drop target, show a "stack" hint.
  const dropOnOccupied = showDropGlow && !isEmpty;

  const lessonCount = lessons.length;
  const cellLabel =
    lessonCount === 0
      ? "Empty cell"
      : maximized
        ? `${lessonCount} lesson${lessonCount === 1 ? "" : "s"}, expanded`
        : `${lessonCount} lesson${lessonCount === 1 ? "" : "s"}, collapsed`;

  const stateClass =
    !isEmpty && hasMultiple
      ? maximized
        ? styles.cellMaximized
        : styles.cellCollapsed
      : "";

  // ── dragActiveId — stable derived value for renderCard ───────────────────
  // Isolate only the activeId string (not the full dragState object) so
  // renderCard's useCallback only invalidates when the active item changes,
  // not on every onDragOver pointer-move event (spec §2.7 — memo by id+density).
  const dragActiveId = dragState.phase !== "idle" ? dragState.activeId : null;

  // ── Card renderer — used by both the flat and layout paths ───────────────
  // CardStack calls this with an optional `deck` for the collapsed
  // multi-lesson case; the card then draws its own in-card pager footer.
  const renderCard = useCallback(
    (lesson: Lesson, deck?: WeeklyCardDeck): ReactNode => (
      <SortableLessonItem
        key={lesson.id}
        lesson={lesson}
        density={effectiveDensity}
        expanded={expandedIds.has(lesson.id)}
        selected={selectedId === lesson.id}
        bulkSelected={bulkSelectedIds.has(lesson.id)}
        dragging={dragActiveId === lesson.id}
        deck={deck}
        onSelect={onSelect}
        onSelectWithModifiers={onSelectWithModifiers}
        onToggleComplete={onToggleComplete}
        onContextAction={onContextAction}
        onEditLesson={onEditLesson}
        onSaveTarget={onSaveTarget}
      />
    ),
    [
      effectiveDensity,
      expandedIds,
      selectedId,
      bulkSelectedIds,
      dragActiveId,
      onSelect,
      onSelectWithModifiers,
      onToggleComplete,
      onContextAction,
      onEditLesson,
      onSaveTarget,
    ],
  );

  // ── Cell click / keyboard — toggle maximize ────────────────────────────────
  function handleCellClick(e: MouseEvent<HTMLDivElement>): void {
    if (isEmpty || !hasMultiple) return;
    if (
      (e.target as HTMLElement).closest(
        "button, a, [role='button'], [data-card-interactive]",
      )
    )
      return;
    onToggleMaximize(subjectId, day);
  }

  function handleCellKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if ((e.key === "Enter" || e.key === " ") && hasMultiple) {
      e.preventDefault();
      onToggleMaximize(subjectId, day);
    }
  }

  // ── Split-slot layout renderer (preserved from original) ─────────────────
  function renderLayout(layout: CellLayout): ReactNode {
    return layout.map((row, rowIdx) => {
      const isSplit = row.length === 2;
      return (
        <div
          key={rowIdx}
          className={isSplit ? styles.layoutRowSplit : styles.layoutRow}
        >
          {row.map((slot, slotIdx) => {
            const slotLessons = slot
              .map((id) => lessons.find((l) => l.id === id))
              .filter((l): l is Lesson => l !== undefined);
            return (
              <div
                key={slotIdx}
                className={
                  isSplit ? styles.layoutSlotHalf : styles.layoutSlotFull
                }
              >
                <CardStack
                  lessons={slotLessons}
                  renderCard={renderCard}
                  maximized={maximized}
                />
              </div>
            );
          })}
        </div>
      );
    });
  }

  return (
    <div
      ref={setDropRef}
      className={`${styles.cell} ${stateClass} ${showDropGlow ? styles.cellDropGlow : ""} ${dropOnOccupied ? styles.cellDropGlowOccupied : ""}`}
      style={cssVars}
      role="gridcell"
      aria-label={cellLabel}
      aria-expanded={hasMultiple ? maximized : undefined}
      {...navProps}
      onClick={handleCellClick}
      onKeyDown={handleCellKeyDown}
    >
      {/* Stack-hint badge — visible when dragging over an occupied cell. */}
      {dropOnOccupied && (
        <div className={styles.dropStackHint} aria-hidden>
          Stack here
        </div>
      )}

      {/*
       * SortableContext gives dnd-kit the lesson order within this cell for
       * within-cell reorder (spec §3.4 — partial; no insertion line yet).
       * TODO §3.4: add horizontal insertion line between stacked chips.
       */}
      <SortableContext items={lessonIds} strategy={verticalListSortingStrategy}>
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
            {hasMultiple && (
              <button
                type="button"
                className={styles.collapseBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleMaximize(subjectId, day);
                }}
                aria-label={maximized ? "Collapse cards" : "Expand all cards"}
              >
                {maximized ? <CollapseIcon /> : <ExpandIcon />}
              </button>
            )}

            {cellLayout !== null ? (
              renderLayout(cellLayout)
            ) : (
              <CardStack
                lessons={lessons}
                renderCard={renderCard}
                maximized={maximized}
              />
            )}

            {/* Compact "+" affordance — absolutely positioned bottom-right,
                revealed on cell hover/focus. Takes ZERO flow space so the
                lesson card fills 100% of the cell. */}
            <button
              type="button"
              className={styles.cellAddInline}
              onClick={(e) => {
                e.stopPropagation();
                onAdd(subjectId, day);
              }}
              aria-label="Add another lesson to this day"
            >
              <PlusIcon small />
            </button>
          </>
        )}
      </SortableContext>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

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

function CollapseIcon(): ReactNode {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 15l-6-6-6 6" />
    </svg>
  );
}

function ExpandIcon(): ReactNode {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
