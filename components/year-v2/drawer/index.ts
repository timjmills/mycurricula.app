// Public surface of the unit workspace's right context drawer (B3).
// Consumers import from the folder (`@/components/year-v2/drawer`), never a
// deep file — the repo's barrel convention (CLAUDE.md §3).

export { UnitContextDrawer } from "./UnitContextDrawer";
export type {
  UnitContextDrawerPane,
  UnitContextDrawerProps,
} from "./UnitContextDrawer";

export { AssessmentsPanel } from "./AssessmentsPanel";
export type { AssessmentsPanelProps } from "./AssessmentsPanel";

export { InsightsPanel } from "./InsightsPanel";
export type { InsightsPanelProps } from "./InsightsPanel";

export { PrepPanel } from "./PrepPanel";
export type { PrepPanelProps } from "./PrepPanel";
