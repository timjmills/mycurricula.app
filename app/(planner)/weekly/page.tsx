// The Weekly view — the app's primary planning surface (planning_document
// §3.1). Renders the day-column board built in components/weekly.
// The old WeeklyGrid (subjects × days matrix) has been replaced by
// WeeklyBoard (day columns, no left subject column) — see the weekly-board
// component for rationale and architecture notes.
import { WeeklyBoard } from "@/components/weekly";

export default function WeeklyPage() {
  return <WeeklyBoard />;
}
