// components/lesson-editor/ — the W3.8 shared fill-in lesson editor.
//
// PUBLIC SURFACE: `LessonEditor` (+ its props type). Everything else in this
// folder is internal. `FloatingBar` is consumed internally by LessonEditor and
// re-exported for standalone needs only if a later wave asks — keep imports
// going through this barrel.
//
// B5.7 retired the third host. `LessonEditor` had three: the Day-edit right
// pane (components/daily/DayEditSplit), the Week cell expand, and a centered
// popup (`LessonModal`) that /weekly's "Open in editor" opened. The popup is
// gone — that affordance now opens the unit workspace's Lesson Planner
// (components/lesson-plan-v2/PlanPage), which embeds THIS editor for the
// lesson flow and surrounds it with the rest of the plan. One editor, one
// place to reach it, instead of a parallel window with a narrower body.

export { LessonEditor } from "./LessonEditor";
export type { LessonEditorProps } from "./LessonEditor";
