// Barrel for the Schedule components. Consumers import via
// `@/components/schedule` — never deep paths into individual files.
//
// Public surfaces:
//   • <ScheduleTimeline />  — the multi-column timeline. Mounted by the
//                              Weekly shell's Schedule mode as the in-grid
//                              replacement. Takes
//                              `scope: "week" | "day"`,
//                              `day?: number`,
//                              `showNonAcademic: boolean`.
//   • <ScheduleDayPane />   — the vertical Schedule Pane for one day
//                              (Bell / Daily / Events tabs over a list of
//                              time-blocks). Used by Daily's right rail
//                              and by the /schedule route. Takes
//                              `day: number`,
//                              `variant?: "rail" | "page"`.

export { ScheduleTimeline } from "./ScheduleTimeline";
export type { ScheduleTimelineProps } from "./ScheduleTimeline";

export { ScheduleDayPane } from "./ScheduleDayPane";
export type { ScheduleDayPaneProps } from "./ScheduleDayPane";
