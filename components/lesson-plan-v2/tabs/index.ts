// components/lesson-plan-v2/tabs — the reused Lesson Plan section bodies.
//
// Each takes `{ lessonId }` and reads the planner store itself. None paint a tab
// strip or scroll container — B2's <LessonWorkspace> mounts them inside its
// collapsible sections. Each renders its own empty state rather than returning
// null, so the host never has to special-case a lesson with no standards /
// resources / differentiation / notes (the common case).
//
// RETIRED IN B2: OverviewTab (its objective editor is subsumed by the
// workspace's scalar header) and FlowTab (the read-only flow is replaced by the
// embedded, editable <LessonEditor>).

export { StandardsTab } from "./StandardsTab";
export type { StandardsTabProps } from "./StandardsTab";

export { ResourcesTab } from "./ResourcesTab";
export type { ResourcesTabProps } from "./ResourcesTab";

export { DifferentiationTab } from "./DifferentiationTab";
export type { DifferentiationTabProps } from "./DifferentiationTab";

export { NotesTab } from "./NotesTab";
export type { NotesTabProps } from "./NotesTab";
