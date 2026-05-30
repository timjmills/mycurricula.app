// lib/teach/board-migrate.ts — grid → free-form canvas migration (5.31).
//
// The pre-5.31 board placed widgets on a fixed CSS grid (WidgetGridPosition:
// col/row/colSpan/rowSpan). The 5.31 redesign uses absolute canvas placement
// (CanvasPosition: x/y/w). This pure helper derives a sensible canvas position
// from a legacy grid position so a board seeded in the grid era opens cleanly on
// the new canvas. No I/O, no React.

import type { CanvasPosition, Widget } from "../types";

/** Canvas geometry constants matching the editor's defaults + clamps. */
const CELL_W = 340; // default widget width on the canvas
const CELL_H = 240; // nominal row height for vertical placement
const GAP = 24; // gutter between placed widgets
const PAD = 40; // canvas padding from the top-left origin

/** Derive a free-form `CanvasPosition` from a legacy grid position. Columns map
 *  to x (width + gap), rows map to y (height + gap); colSpan widens the widget
 *  (clamped to the editor's 230–640 range). */
export function gridToCanvas(w: Widget): CanvasPosition {
  const { col, row, colSpan } = w.position;
  const width = Math.min(
    640,
    Math.max(
      230,
      CELL_W * Math.max(1, colSpan) + GAP * (Math.max(1, colSpan) - 1),
    ),
  );
  return {
    x: PAD + col * (CELL_W + GAP),
    y: PAD + row * (CELL_H + GAP),
    w: width,
  };
}

/** Ensure a widget has a `canvas` position, deriving one from its grid position
 *  when absent. Returns a new widget (does not mutate). */
export function ensureCanvas(w: Widget): Widget {
  if (w.canvas) return w;
  return { ...w, canvas: gridToCanvas(w) };
}
