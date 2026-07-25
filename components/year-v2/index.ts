// Public surface of the v2 Year frames (Wave 6). Consumers import from the
// folder (`@/components/year-v2`), never a deep file.
//
// YearShell is the /year frame router (glass → YearA · paper → the legacy
// TimelineYear · color → YearC), and hosts the shared Unit Explorer modal for
// the glass + color frames. UnitExplorer + its data helpers are built by
// Builder A (UnitExplorer.tsx / lib/year-v2-data.ts).
//
// ExplorerShell (Wave 7) is the dialog chrome UnitExplorer and the Lesson
// Planner (components/lesson-plan-v2/PlanPage) both render into. PlanPage
// deep-imports it to avoid an import cycle through this barrel — see that
// folder's index.ts.

export { YearShell } from "./YearShell";
export type { YearSubjectLane, YearUnitNode } from "./YearShell";
export { YearA } from "./YearA";
export { YearC } from "./YearC";
export { UnitExplorer } from "./UnitExplorer";
export type { UnitExplorerProps } from "./UnitExplorer";
export { UnitWorkspaceRail } from "./UnitWorkspaceRail";
export type { UnitWorkspaceRailProps } from "./UnitWorkspaceRail";
export { ExplorerShell } from "./ExplorerShell";
export type {
  ExplorerShellProps,
  ExplorerShellTab,
  ExplorerMode,
  ExplorerPresentation,
} from "./ExplorerShell";

// The GLOBAL unit-workspace host (B5.1) — one provider in the planner layout
// mounts one UnitExplorer, so any surface can open the workspace by calling
// useUnitWorkspace().openUnitWorkspace(subjectId, unit) instead of mounting its
// own copy. app/(planner)/layout.tsx imports the provider from
// "@/components/year-v2/workspace-host" directly, so the layout does not pull
// YearShell / TimelineYear into every planner route's bundle; view code that
// already imports from this barrel can use these re-exports.
export {
  UnitWorkspaceProvider,
  UnitWorkspaceHost,
  useUnitWorkspace,
  useUnitWorkspaceTarget,
} from "./workspace-host";
export type {
  UnitWorkspaceActions,
  UnitWorkspaceTarget,
} from "./workspace-host";
