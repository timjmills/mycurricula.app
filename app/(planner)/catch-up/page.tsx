// The Catch-up screen (planning-doc §5.17) — full-page triage for every
// uncovered or incomplete lesson across the year. Reachable from Settings,
// the top-bar flame badge dropdown, the Today dashboard carry-over click-
// through, and the `g c` keyboard shortcut.
//
// Server-component shell that renders a single <CatchupScreen /> client
// component, matching the per-route pattern Weekly / Daily already use.
import { CatchupScreen } from "@/components/catchup";

export default function CatchUpPage() {
  return <CatchupScreen />;
}
