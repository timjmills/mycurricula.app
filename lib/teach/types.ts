// lib/teach/types.ts — VIEW-ONLY types for the Teach surface.
//
// These are the shapes the Teach UI passes between its zones — the *frozen
// contract* the Wave 1 agents read (docs/teach-view-plan.md §2.4, §14). The
// persistable DOMAIN types (Board, Widget, …) live in `lib/types.ts`; this
// file holds only the transient, in-memory view state that never reaches the
// repository: the board layout enum, the annotation tool enum, the center-mode
// switch, the dnd payload shapes, and the central `TeachWorkspaceState`.
//
// FREEZE NOTICE: `TeachWorkspaceState`, `BoardLayout`, `BoardTool`, and
// `CenterMode` are the integration boundary. Wave 1 reads them; changes here
// ripple to every zone. Extend additively (optional fields) where possible.

import type { TeachResource } from "../types";

// ── Board layout (plan §4.2) ────────────────────────────────────────────────

/** The CSS-grid arrangements the layout toolbar offers. `1up` is a single
 *  full-bleed cell; the rest are NxM grids. The string encodes columns×rows. */
export type BoardLayout = "1up" | "2up" | "3up" | "2x2" | "2x3" | "3x3";

/** Columns/rows for each layout — the single source the grid + reflow logic
 *  read so a layout's geometry is never hard-coded at a call site. */
export const BOARD_LAYOUT_GRID: Record<
  BoardLayout,
  { cols: number; rows: number }
> = {
  "1up": { cols: 1, rows: 1 },
  "2up": { cols: 2, rows: 1 },
  "3up": { cols: 3, rows: 1 },
  "2x2": { cols: 2, rows: 2 },
  "2x3": { cols: 3, rows: 2 },
  "3x3": { cols: 3, rows: 3 },
};

// ── Annotation toolbar (plan §5.2) ──────────────────────────────────────────

/** The live annotation/drawing tools (T3/T4). `select` leaves the layer
 *  pointer-transparent so the underlying iframe/image stays interactive;
 *  `eraser` is an OBJECT eraser (removes whole strokes, not pixels). */
export type BoardTool =
  | "select"
  | "pen"
  | "highlighter"
  | "eraser"
  | "rect"
  | "line"
  | "arrow"
  | "text";

// ── Center mode (plan §2.4) ─────────────────────────────────────────────────

/** What the center zone shows: the widget board grid (Agent C) vs. a
 *  full-bleed resource + annotation layer (Agent D). The two never share a
 *  file — they share this flag on the central state. */
export type CenterMode = "board" | "resource";

// ── Drag-and-drop (plan §2.4, T8) ───────────────────────────────────────────
// The one `DndContext` mounted by `TeachWorkspace` carries every drag on the
// surface. These ids/payloads are the contract between the drag SOURCE (a
// resource card, Agent E) and the drop TARGET (a board cell, Agent C), plus
// the rail-icon rearrange drag (mirrors the shell's `use-rail-layout` pattern).

/** Kinds of draggable on the Teach surface. */
export type TeachDragKind = "resource" | "widget" | "rail-icon";

/** Payload attached to a draggable's dnd-kit `data` for a resource card being
 *  dragged toward a board cell (T8). */
export interface TeachResourceDragData {
  kind: "resource";
  resource: TeachResource;
}

/** Payload for a widget tile being reordered within the board grid. */
export interface TeachWidgetDragData {
  kind: "widget";
  widgetId: string;
  boardId: string;
}

/** Payload for a rail icon being moved between/within the icon rails. */
export interface TeachRailIconDragData {
  kind: "rail-icon";
  moduleId: string;
}

/** The discriminated union carried in a draggable's `data.current`. Drop
 *  handlers narrow on `kind`. */
export type TeachDragData =
  | TeachResourceDragData
  | TeachWidgetDragData
  | TeachRailIconDragData;

/** A board cell droppable id is encoded as `cell:<boardId>:<col>:<row>` so a
 *  single string round-trips the target without a separate lookup. Helpers
 *  keep encode/decode in one place. */
export function boardCellDroppableId(
  boardId: string,
  col: number,
  row: number,
): string {
  return `cell:${boardId}:${col}:${row}`;
}

export interface BoardCellTarget {
  boardId: string;
  col: number;
  row: number;
}

/** Parse a `cell:<boardId>:<col>:<row>` droppable id back into its parts, or
 *  null if the id isn't a board-cell target. */
export function parseBoardCellDroppableId(id: string): BoardCellTarget | null {
  if (!id.startsWith("cell:")) return null;
  const parts = id.split(":");
  if (parts.length !== 4) return null;
  const col = Number(parts[2]);
  const row = Number(parts[3]);
  if (!Number.isInteger(col) || !Number.isInteger(row)) return null;
  return { boardId: parts[1], col, row };
}

// ── Central workspace state (plan §2.4 — THE integration contract) ──────────

/**
 * The state every Teach zone consumes, owned by `TeachWorkspace.tsx`. Wave 0
 * defines it; Wave 1 reads it. It is in-memory only — durable UI preferences
 * live in `TeachWorkspaceLayout` (localStorage) and board content flows through
 * the repository seam.
 */
export interface TeachWorkspaceState {
  /** Active master lesson id (forking identity, §11). Null in sandbox mode. */
  activeLessonId: string | null;
  /** Active board id. Null when no board is selected (e.g. empty sandbox). */
  activeBoardId: string | null;
  /** Board grid (C) vs. full-bleed resource (D). */
  centerMode: CenterMode;
  /** The resource shown when `centerMode === "resource"`. */
  activeResource: TeachResource | null;
  /** Current grid arrangement. */
  layout: BoardLayout;
  /** Side-panel collapse state (mirrors the persisted layout). */
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  /** Widget fullscreened within the canvas (Focus mode, T7); null = none. */
  focusedWidgetId: string | null;
  /** Present mode — chrome hidden, board projected (T6). */
  present: boolean;
  /** Whole-view fullscreen (Fullscreen API). */
  fullscreen: boolean;
  /** Active annotation tool. */
  activeTool: BoardTool;
  // ── Sandbox (lesson-less) mode (plan §4a, §13.2) ──────────────────────────
  /** True when the teacher is building boards without a lesson attached. The
   *  work is ephemeral (held here + a localStorage draft) until saved/pinned. */
  sandbox: boolean;
  /** True once the sandbox has unsaved board content — drives the
   *  "Sandbox · not saved" badge and the Save/Pin prompts. */
  sandboxDirty: boolean;
}
