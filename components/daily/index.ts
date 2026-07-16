// components/daily — public barrel.
// Consumers import from "@/components/daily"; never from a deep path.

export { DailyView } from "./DailyView";
export { LessonDetail } from "./LessonDetail";
export { TodayDashboard } from "./TodayDashboard";
// Right rail (3-column restructure): the resources / to-dos / shoutbox
// stack on the far right of the Daily body. RightRail composes the three
// panels; the individual exports stay available for any callers that want
// to drop one panel in elsewhere.
export { RightRail } from "./RightRail";
export { ResourcesPanel } from "./ResourcesPanel";
export { TodayTodos } from "./TodayTodos";
export { Shoutbox } from "./Shoutbox";
// Far-left slim icon strip (3-column restructure). Subject-neutral nav
// chrome; the global filter pane is suppressed for Daily.
export { IconRail } from "./IconRail";
export { PaneSplitter } from "./PaneSplitter";
// UX roadmap item 03 — orientation anchors. NowLine is the 1px indigo
// "now" line for a minute-proportional day body; TodayJumpButton is the
// persistent "jump back to today" affordance for the Daily header.
export { NowLine } from "./NowLine";
export { TodayJumpButton } from "./TodayJumpButton";
