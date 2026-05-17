"use client";

// useGridNavigation.ts — roving-tabindex keyboard navigation for the grid.
//
// Per planning_document §6.5 ("arrow keys to navigate the grid; Esc to …
// collapse expanded card"), the Weekly grid is keyboard-traversable
// cell-by-cell. Exactly one cell is in the tab order at a time (a roving
// tabindex); the rest carry `tabIndex={-1}`. Arrow keys move the active
// cell, focus follows, Enter expands the cell's lesson(s), Esc collapses.
//
// The hook owns only the active-cell coordinate and the key handling;
// callers wire `cellProps()` onto each cell and supply the expand/collapse
// callbacks. Keeping it data-structure-agnostic (rows × DAY_COUNT) means
// the grid component stays declarative.

import { useCallback, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

/** A cell coordinate: subject-row index × day-column index. */
export interface CellPos {
  row: number;
  col: number;
}

interface GridNavOptions {
  /** Number of subject rows. */
  rowCount: number;
  /** Number of day columns. */
  colCount: number;
  /** Enter pressed on a cell — expand its lesson(s). */
  onActivate: (pos: CellPos) => void;
  /** Esc pressed — collapse any expanded cards. */
  onCollapse: () => void;
}

/** Props the hook hands to each grid cell. */
export interface CellNavProps {
  tabIndex: 0 | -1;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  onFocus: () => void;
  /** data-grid-cell="row-col" — used to move DOM focus on arrow keys. */
  "data-grid-cell": string;
}

interface GridNav {
  /** The cell currently in the tab order. */
  active: CellPos;
  /** Build the roving-tabindex + key props for a given cell. */
  cellProps: (row: number, col: number) => CellNavProps;
  /** Imperatively focus a cell (e.g. after the active week changes). */
  focusCell: (pos: CellPos) => void;
}

/** Clamp n into [0, max]. */
function clamp(n: number, max: number): number {
  return n < 0 ? 0 : n > max ? max : n;
}

export function useGridNavigation({
  rowCount,
  colCount,
  onActivate,
  onCollapse,
}: GridNavOptions): GridNav {
  // The active cell starts at the top-left (first subject, Sunday).
  const [active, setActive] = useState<CellPos>({ row: 0, col: 0 });
  // The grid root — scoped query target so focus moves stay inside it.
  const rootRef = useRef<HTMLElement | null>(null);

  // Move DOM focus to a cell by its data attribute. The element must be
  // a descendant of the focused cell, so we resolve it lazily on demand.
  const focusCell = useCallback((pos: CellPos) => {
    const root = rootRef.current ?? document;
    const el = root.querySelector<HTMLElement>(
      `[data-grid-cell="${pos.row}-${pos.col}"]`,
    );
    el?.focus();
  }, []);

  const move = useCallback(
    (next: CellPos) => {
      setActive(next);
      // Defer the focus call so the roving tabIndex has re-rendered the
      // target cell to tabIndex 0 before we move focus onto it.
      requestAnimationFrame(() => focusCell(next));
    },
    [focusCell],
  );

  const cellProps = useCallback(
    (row: number, col: number): CellNavProps => {
      const isActive = active.row === row && active.col === col;
      return {
        tabIndex: isActive ? 0 : -1,
        "data-grid-cell": `${row}-${col}`,
        onFocus: () => {
          // Tabbing or click-focus into a cell makes it the active one so
          // the roving index always tracks the truly-focused cell.
          if (active.row !== row || active.col !== col) {
            setActive({ row, col });
          }
          // Capture the grid root for scoped focus queries.
          if (!rootRef.current) {
            const el = document.querySelector<HTMLElement>(
              `[data-grid-cell="${row}-${col}"]`,
            );
            rootRef.current =
              (el?.closest("[role='grid']") as HTMLElement) ?? null;
          }
        },
        onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
          switch (e.key) {
            case "ArrowRight":
              e.preventDefault();
              move({ row, col: clamp(col + 1, colCount - 1) });
              break;
            case "ArrowLeft":
              e.preventDefault();
              move({ row, col: clamp(col - 1, colCount - 1) });
              break;
            case "ArrowDown":
              e.preventDefault();
              move({ row: clamp(row + 1, rowCount - 1), col });
              break;
            case "ArrowUp":
              e.preventDefault();
              move({ row: clamp(row - 1, rowCount - 1), col });
              break;
            case "Home":
              e.preventDefault();
              move({ row, col: 0 });
              break;
            case "End":
              e.preventDefault();
              move({ row, col: colCount - 1 });
              break;
            case "Enter":
              // Only act when the cell itself is the target — let Enter
              // on inner buttons (checkbox, caret) behave normally.
              if (e.target === e.currentTarget) {
                e.preventDefault();
                onActivate({ row, col });
              }
              break;
            case "Escape":
              onCollapse();
              break;
            default:
              break;
          }
        },
      };
    },
    [active, colCount, rowCount, move, onActivate, onCollapse],
  );

  return { active, cellProps, focusCell };
}
