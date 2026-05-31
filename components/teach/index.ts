// components/teach — public barrel for the Teach surface.
// Consumers import from "@/components/teach"; never from a deep path.
//
// Wave 0 ships the shell (TeachWorkspace) + the frozen state contract. Wave 1
// agents add their zone components (chrome/rails/panels/board/canvas/…) and
// extend this barrel with their own public exports.

export { TeachWorkspace } from "./TeachWorkspace";
export type {
  TeachWorkspaceProps,
  TeachWorkspaceAction,
} from "./TeachWorkspace";

// Re-export the frozen view-only contract so Wave 1 zones can import the state
// shape + dnd helpers from the component barrel alongside the workspace.
export type {
  BoardLayout,
  BoardTool,
  CenterMode,
  TeachWorkspaceState,
  TeachDragData,
  TeachResourceDragData,
  TeachWidgetDragData,
  TeachRailIconDragData,
  BoardCellTarget,
} from "@/lib/teach/types";
export {
  BOARD_LAYOUT_GRID,
  boardCellDroppableId,
  parseBoardCellDroppableId,
} from "@/lib/teach/types";
