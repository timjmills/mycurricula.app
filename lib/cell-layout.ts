// cell-layout.ts — how lessons are arranged inside one Weekly-grid cell.
//
// By default a cell's lessons sit in a paged stack (see CardStack). A
// teacher can also arrange them: drop a lesson on the LEFT or RIGHT half
// of a cell to place two lessons side-by-side (each at half width — the
// two halves may even be different subjects, each keeping its own color),
// or drop ABOVE / BELOW to stack two rows so both are visible. Dropping
// directly ON a lesson adds it to that position's paged stack.
//
// An arranged cell is an ordered list of ROWS. Each row holds one or two
// "slots"; a slot is one or more lesson ids (more than one = a paged
// stack at that slot). Two slots in a row render side-by-side at half
// width. At most two rows are kept visible at once; anything beyond that
// pages within its slot.

/** One slot in a row — one lesson, or several paged on top of each other. */
export type CellSlot = string[];

/** A row of a cell layout — one slot (full width) or two (side-by-side). */
export type CellRow = CellSlot[];

/** A cell's arranged layout: ordered rows, each with one or two slots. */
export type CellLayout = CellRow[];

/** Where a dragged lesson landed relative to a cell or a lesson in it. */
export type DropRegion =
  | "half-left"
  | "half-right"
  | "above"
  | "below"
  | "on"
  | "cell";

/** The key used to index per-cell layouts (subject row × day column). */
export function cellKey(subjectId: string, day: number): string {
  return `${subjectId}:${day}`;
}

/** Every lesson id referenced anywhere in a layout, in reading order. */
export function layoutLessonIds(layout: CellLayout): string[] {
  return layout.flatMap((row) => row.flatMap((slot) => slot));
}

/** True when the layout is a single lesson with no arrangement. */
export function isTrivialLayout(layout: CellLayout): boolean {
  const ids = layoutLessonIds(layout);
  return ids.length <= 1;
}
