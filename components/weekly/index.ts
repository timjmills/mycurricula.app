// Public surface of the Weekly board component family.
// Consumers import from `@/components/weekly`, never from deep files.

export { WeeklyBoard } from "./weekly-board";
export { WeeklyLessonCard } from "./weekly-lesson-card";
export type { ContextAction, ContextActionPayload } from "./weekly-lesson-card";
export { SaveTargetDialog } from "./save-target-dialog";
export type { SaveTargetDialogProps } from "./save-target-dialog";
