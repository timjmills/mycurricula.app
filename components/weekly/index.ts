// Public surface of the Weekly board component family.
// Consumers import from `@/components/weekly`, never from deep files.

export { WeeklyBoard } from "./weekly-board";
export { WeeklyLessonCard } from "./weekly-lesson-card";
export type { ContextAction, ContextActionPayload } from "./weekly-lesson-card";
export { SaveTargetDialog } from "./save-target-dialog";
export type { SaveTargetDialogProps } from "./save-target-dialog";
// The Weekly view's 3-panel shell — icon rail + grid + right rail. Wraps
// the existing <WeeklyGrid> unchanged in the center slot and reuses the
// Daily-view IconRail + RightRail + PaneSplitter.
export { WeeklyShell, DRAWER_MQ } from "./WeeklyShell";
// The Frame-B day-column traversal of the Week view — one column per school
// day, each a vertical stack of that day's lessons across all subjects.
export { WeekColumns } from "./WeekColumns";
// The W3.8c period × day EDIT board — replaces the weekly canvas while Week is
// in Edit mode; period-aligned or stacked, cross-day/cross-period drag.
export { WeekEditBoard } from "./WeekEditBoard";
