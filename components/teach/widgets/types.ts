// types.ts — shared prop contract for the display-only widget bodies
// (docs/teach-view-plan.md §4.5). Every body takes the persistable `Widget`
// plus the lesson's `subjectId` so subject-tinted widgets (Objective, Model,
// Names, Manipulatives) resolve their accent through the palette system —
// never a hard-coded colour (CLAUDE.md §4, §9 token map note #8).

import type { SubjectId, Widget } from "@/lib/types";

/** Props every widget body renderer receives. */
export interface WidgetBodyProps {
  /** The widget whose `config` the body renders from (display-only in v1). */
  widget: Widget;
  /** Lesson subject — drives subject-tinted accents. Defaults to "math" at the
   *  switch when the integrator hasn't resolved the lesson's subject yet. */
  subjectId: SubjectId;
}

/** A board cell's tint, chosen per widget type so tiles read distinctly on the
 *  board (the prototype's yellow/mint/sky/pink/lavender/peach). Maps to the
 *  `--board-tint-*` tokens added in app/tokens.css. */
export type BoardTint =
  | "yellow"
  | "mint"
  | "sky"
  | "pink"
  | "lavender"
  | "peach"
  | "none";

/** The CSS var for a tint, or `undefined` for `none` (paper). */
export function boardTintVar(tint: BoardTint): string | undefined {
  return tint === "none" ? undefined : `var(--board-tint-${tint})`;
}
