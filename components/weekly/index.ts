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
export { WeeklyShell } from "./WeeklyShell";
// The rail-drawer breakpoint — a dependency-free leaf (bundle-slim lever
// A1). Layout-graph consumers (components/shell/right-panel.tsx) import
// ./drawer-mq DIRECTLY, never this barrel: with `sideEffects` unset,
// importing the barrel keeps the whole weekly+daily+editor subtree in the
// consumer's chunk graph even when only the constant is used.
export { DRAWER_MQ } from "./drawer-mq";
// v1 fallback shell (the pre-v2 3-panel Week: icon rail + WeeklyGrid + right
// rail) — mounted by the weekly route when NEXT_PUBLIC_V2 is OFF. Verbatim copy
// of master's WeeklyShell (live-on-prod v1), styled by WeeklyShellV1.module.css.
export { WeeklyShellV1 } from "./WeeklyShellV1";
// The Frame-B day-column traversal of the Week view — one column per school
// day, each a vertical stack of that day's lessons across all subjects.
export { WeekColumns } from "./WeekColumns";
// The W3.8c period × day EDIT board — replaces the weekly canvas while Week is
// in Edit mode; period-aligned or stacked, cross-day/cross-period drag.
export { WeekEditBoard } from "./WeekEditBoard";
