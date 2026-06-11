// The Curriculum Archive (/archive) — "the closed ledger." Finished school
// years are sealed, read-only volumes on a shelf; the current year sits apart
// at the top as the one open, editable plan.
//
// Server-component shell that renders a single <ArchiveScreen /> client
// component, matching the per-route pattern Weekly / Daily / Catch-up use.
// The (planner) layout supplies all chrome (SideNav, top bar, panels).
import { ArchiveScreen } from "@/components/archive";

export default function ArchivePage() {
  return <ArchiveScreen />;
}
