// Public surface of the Daily dock panel system.
export { DockLayout } from "./DockLayout";
export type { DockPanelDef, DockRailItem } from "./DockLayout";
export { useDockLayout } from "./useDockLayout";
export type { DockLayoutApi } from "./useDockLayout";
export {
  DOCK_LAYOUT_KEY,
  DOCK_PANEL_TITLE,
  defaultDockLayout,
  normalizeDockLayout,
} from "./dock-model";
export type { DockLayoutState, DockPanelId, SlotKey } from "./dock-model";
