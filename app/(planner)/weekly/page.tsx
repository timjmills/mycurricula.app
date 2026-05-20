// The Weekly view — the app's primary planning surface (planning_document
// §3.1). Renders inside a 3-panel shell that mirrors the Daily view:
//
//   body row → [icon rail] [weekly grid] [splitter] [right rail]
//
// The icon rail is the Daily-view IconRail; the global filter pane is
// suppressed on `/weekly*` (see components/shell/left-filter-panel.tsx)
// so this rail replaces it. The right rail is the Daily-view RightRail
// in WEEK mode — Resources aggregates across every lesson in the week,
// To-dos and Shoutbox stay day-scoped. The center is the existing
// WeeklyGrid unchanged.
//
// The WeeklyBoard day-column variant remains in components/weekly but is
// not active; WeeklyGrid is the canonical view.
import { WeeklyShell } from "@/components/weekly";

export default function WeeklyPage() {
  return <WeeklyShell />;
}
