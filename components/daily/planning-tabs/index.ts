// components/daily/planning-tabs — public barrel.
// Consumers import from "@/components/daily/planning-tabs" (or the host's
// relative "./planning-tabs"); never from a deep file. (Exception: unit
// tests import ./planning-tabs-state directly — the vitest setup
// transforms plain .ts only, and the state module is the testable layer.)

export { PlanningTabs } from "./PlanningTabs";
export type { PlanningTabsProps, PlanningTabsHandle } from "./PlanningTabs";

export { normalizePlanningTabs, PLAN_TABS_KEY } from "./planning-tabs-state";
export type { PlanningTabsState, PlanningToolKey } from "./planning-tabs-state";
