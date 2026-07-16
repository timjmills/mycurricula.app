// components/lesson-plan-v2/tabs — the six Lesson Plan tab bodies (W7).
//
// Each tab takes `{ lessonId }` and reads the planner store itself. None of
// them paint panel chrome, a tab strip, or a scroll container — <PlanPage> owns
// the shell. Each renders its own empty state rather than returning null, so
// the host never has to special-case a lesson with no standards / resources /
// differentiation / notes (the common case).

export { OverviewTab } from "./OverviewTab";
export type { OverviewTabProps } from "./OverviewTab";

export { FlowTab } from "./FlowTab";
export type { FlowTabProps } from "./FlowTab";

export { StandardsTab } from "./StandardsTab";
export type { StandardsTabProps } from "./StandardsTab";

export { ResourcesTab } from "./ResourcesTab";
export type { ResourcesTabProps } from "./ResourcesTab";

export { DifferentiationTab } from "./DifferentiationTab";
export type { DifferentiationTabProps } from "./DifferentiationTab";

export { NotesTab } from "./NotesTab";
export type { NotesTabProps } from "./NotesTab";
