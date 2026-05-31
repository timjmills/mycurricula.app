// components/teach/left — the Teach LEFT zone (Wave 1 Agent B).
//
// The 64px left icon rail + the collapsible left panel hosting the module tabs
// (Lessons / Lesson / Boards / Notes / Groups / Class / Tools). The integrator
// (Wave 2) mounts <TeachLeftRail> and <TeachLeftPanel> in TeachWorkspace and
// wires the rail-icon drop resolution against the surface DndContext.
//
// Public surface only — consumers import from `@/components/teach/left`, never
// a deep file (CLAUDE.md §3 barrel convention).

export { TeachLeftRail } from "./TeachLeftRail";
export type { TeachLeftRailProps } from "./TeachLeftRail";

export { TeachLeftPanel } from "./TeachLeftPanel";
export type { TeachLeftPanelProps } from "./TeachLeftPanel";

// Module-meta helpers are exported so the integrator (and Agent A's shortcuts)
// can reuse the label/shortcut mapping without re-deriving it.
export {
  LEFT_MODULE_IDS,
  LEFT_MODULE_META,
  isLeftModuleId,
} from "./modules-meta";
export type { LeftModuleId, LeftModuleMeta } from "./modules-meta";
