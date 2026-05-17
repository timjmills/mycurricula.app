// The Weekly view — the app's primary planning surface (planning_document
// §3.1). Renders the subjects × days grid (left subject column, day columns,
// CardStack cells). The WeeklyBoard day-column variant remains in
// components/weekly but is not active; WeeklyGrid is the canonical view.
import { WeeklyGrid } from "@/components/grid";

export default function WeeklyPage() {
  return <WeeklyGrid />;
}
