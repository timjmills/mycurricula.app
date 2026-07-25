// components/year-v2/workspace-host — the GLOBAL unit-workspace host (B5.1).
//
// One provider in app/(planner)/layout.tsx mounts one <UnitWorkspaceHost>, so
// every planner surface opens the unit workspace by CALLING an opener instead of
// mounting its own <UnitExplorer>. A module-level singleton (workspace-state)
// holds the open unit and elects a single renderer, so no matter how many hosts
// are mounted exactly one workspace can be on screen.
//
// Consumers import from this folder (or from "@/components/year-v2", which
// re-exports the same public surface); the layout imports the provider from here
// rather than the year-v2 barrel so it does not pull YearShell / YearA / YearC /
// TimelineYear into every planner route's bundle.
//
// Public surface:
//   • UnitWorkspaceProvider — mount once, innermost, in the planner layout.
//   • useUnitWorkspace()    — { openUnitWorkspace, closeUnitWorkspace } for
//                             callsites; throws outside the provider.
//   • UnitWorkspaceHost     — the elected renderer. The provider already mounts
//                             one; only a route needing its own mount point
//                             should render another (the election makes that
//                             safe).
//   • useUnitWorkspaceTarget / getUnitWorkspaceTarget — read the open unit.
//   • openUnitWorkspace / closeUnitWorkspace — the singleton's own openers, for
//                             imperative (non-React) callers. React callsites
//                             should prefer useUnitWorkspace(), which throws
//                             when no provider is mounted instead of silently
//                             opening a workspace nothing renders.

export {
  UnitWorkspaceProvider,
  UnitWorkspaceHost,
  useUnitWorkspace,
} from "./UnitWorkspaceHost";
export type { UnitWorkspaceActions } from "./UnitWorkspaceHost";

export {
  openUnitWorkspace,
  closeUnitWorkspace,
  getUnitWorkspaceTarget,
  useUnitWorkspaceTarget,
} from "./workspace-state";
export type { UnitWorkspaceTarget } from "./workspace-state";
