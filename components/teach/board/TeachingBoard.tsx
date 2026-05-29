// TeachingBoard — the CSS-grid Teaching Board (docs/teach-view-plan.md §4.2,
// Agent C). It reads `state.layout` → BOARD_LAYOUT_GRID for the grid template,
// places each widget at its `position` (col/row + span), and fills the
// remaining cells with dashed `+` droppables (T8 / picker entry). The layout
// switch animates ~200ms (reduced-motion aware). Widget reorder within the grid
// is a dnd-kit draggable on each tile (handle in WidgetShell) → the board emits
// the move; final drop resolution is wired by the integrator in TeachWorkspace.
//
// When the board is empty it renders <BoardEmptyState> (T9); when a widget is
// focused it renders <FocusMode> (T7) over the grid.

"use client";

import type { CSSProperties, ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import type { SubjectId, Board, Widget } from "@/lib/types";
import type { TeachWorkspaceState, BoardCellTarget } from "@/lib/teach/types";
import { BOARD_LAYOUT_GRID, boardCellDroppableId } from "@/lib/teach/types";
import type { TeachWorkspaceAction } from "../TeachWorkspace";
import { WidgetShell } from "./WidgetShell";
import { BoardEmptyState } from "./BoardEmptyState";
import { FocusMode } from "./FocusMode";
import { TeachIcon } from "../widgets";
import styles from "./board.module.css";

export interface TeachingBoardProps {
  state: TeachWorkspaceState;
  dispatch: (action: TeachWorkspaceAction) => void;
  /** The active board (fetched by the integrator from the `teach` repo). */
  board: Board | null;
  /** The active board's widgets (== `board.widgets`, passed explicitly so the
   *  integrator can override with optimistic state). */
  widgets: Widget[];
  /** Lesson subject for tinted widget bodies. */
  subjectId?: SubjectId;
  /** Open the widget picker for a target cell (or board-level "add"). */
  onAddWidget?: (target: BoardCellTarget) => void;
  /** Pin/unpin a widget (integrator persists via the repo). */
  onTogglePin?: (widget: Widget) => void;
  /** Open a widget's settings editor. */
  onSettings?: (widget: Widget) => void;
  /** Remove a widget from the board (destructive). */
  onRemove?: (widget: Widget) => void;
}

/** Build a `cols × rows` occupancy map so we know which cells already host a
 *  widget (and therefore must NOT render an empty droppable). A widget occupies
 *  every cell its span covers. */
function buildOccupancy(
  widgets: Widget[],
  cols: number,
  rows: number,
): boolean[][] {
  const occ: boolean[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => false),
  );
  for (const w of widgets) {
    const { col, row, colSpan, rowSpan } = w.position;
    for (let r = row; r < Math.min(row + rowSpan, rows); r += 1) {
      for (let c = col; c < Math.min(col + colSpan, cols); c += 1) {
        if (r >= 0 && c >= 0) occ[r][c] = true;
      }
    }
  }
  return occ;
}

/** A single empty board cell: a dashed `+` that opens the picker and accepts a
 *  dragged resource (T8). It registers a droppable keyed by the encoded cell id
 *  so the integrator's drop handler can resolve the target via
 *  `parseBoardCellDroppableId`. */
function EmptyCell({
  boardId,
  col,
  row,
  onAdd,
}: {
  boardId: string;
  col: number;
  row: number;
  onAdd?: (target: BoardCellTarget) => void;
}): ReactNode {
  const droppableId = boardCellDroppableId(boardId, col, row);
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`${styles.emptyCell} ${isOver ? styles.emptyCellOver : ""}`}
      style={{ gridColumn: col + 1, gridRow: row + 1 }}
      aria-label="Add a widget to this cell"
      onClick={() => onAdd?.({ boardId, col, row })}
    >
      <span className={styles.emptyPlus}>
        <TeachIcon name="plus" size={16} />
      </span>
      <span className={styles.emptyLabel}>Add widget</span>
    </button>
  );
}

export function TeachingBoard({
  state,
  dispatch,
  board,
  widgets,
  subjectId,
  onAddWidget,
  onTogglePin,
  onSettings,
  onRemove,
}: TeachingBoardProps): ReactNode {
  const { cols, rows } = BOARD_LAYOUT_GRID[state.layout];

  // Empty board (T9) → the "add your first widget" CTA.
  if (board && widgets.length === 0) {
    return (
      <div className={styles.canvas}>
        <BoardEmptyState
          boardTitle={board.title}
          onPick={(target) => onAddWidget?.(target)}
          boardId={board.id}
        />
      </div>
    );
  }

  const occupancy = board != null ? buildOccupancy(widgets, cols, rows) : [];

  // Empty cells to render as droppable `+` tiles (only those not occupied and
  // within the current layout's bounds).
  const emptyCells: { col: number; row: number }[] = [];
  if (board != null) {
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (!occupancy[r]?.[c]) emptyCells.push({ col: c, row: r });
      }
    }
  }

  const gridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
  };

  const focused = state.focusedWidgetId
    ? (widgets.find((w) => w.id === state.focusedWidgetId) ?? null)
    : null;

  return (
    <div className={styles.canvas}>
      <div
        className={`${styles.grid} ${styles.gridAnimated}`}
        style={gridStyle}
      >
        {widgets.map((w) => (
          <div
            key={w.id}
            style={{
              // Clamp the anchor + span into the active layout's bounds so a
              // widget authored for a 3x3 never overflows a 2up grid.
              gridColumn: `${Math.min(w.position.col, cols - 1) + 1} / span ${Math.min(
                w.position.colSpan,
                cols - Math.min(w.position.col, cols - 1),
              )}`,
              gridRow: `${Math.min(w.position.row, rows - 1) + 1} / span ${Math.min(
                w.position.rowSpan,
                rows - Math.min(w.position.row, rows - 1),
              )}`,
              minWidth: 0,
              minHeight: 0,
            }}
          >
            <WidgetShell
              widget={w}
              subjectId={subjectId}
              present={state.present}
              onExpand={(id) => dispatch({ type: "focusWidget", widgetId: id })}
              onTogglePin={onTogglePin}
              onSettings={onSettings}
              onRemove={onRemove}
            />
          </div>
        ))}

        {/* Empty droppable cells — hidden in Present mode for clean projection. */}
        {!state.present && board != null
          ? emptyCells.map(({ col, row }) => (
              <EmptyCell
                key={`empty-${col}-${row}`}
                boardId={board.id}
                col={col}
                row={row}
                onAdd={onAddWidget}
              />
            ))
          : null}
      </div>

      {/* Focus mode (T7) — overlays the grid; Esc / click-outside returns. */}
      {focused ? (
        <FocusMode
          widget={focused}
          subjectId={subjectId}
          onClose={() => dispatch({ type: "focusWidget", widgetId: null })}
        />
      ) : null}
    </div>
  );
}
