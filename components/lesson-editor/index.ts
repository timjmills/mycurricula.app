// components/lesson-editor/ — the W3.8 shared fill-in lesson editor.
//
// PUBLIC SURFACE: `LessonEditor` (+ its props type). Builder C mounts it in
// the LessonModal / Week cell expand / Day-edit right pane; everything else
// in this folder is internal. `FloatingBar` (Builder B's file) is consumed
// internally by LessonEditor and re-exported for C's standalone needs only
// if a later wave asks — keep imports going through this barrel.

export { LessonEditor } from "./LessonEditor";
export type { LessonEditorProps } from "./LessonEditor";
// The modal host (Builder C's file) — exported so consumers import through
// the barrel rather than deep paths (WeeklyShell's deep import hoisted here).
export { LessonModal } from "./LessonModal";
