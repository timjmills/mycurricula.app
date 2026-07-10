// /planner — the Planner Hub (Wave 8).
//
// A full-screen workspace: browse lessons/units/resources/catch-up, open them
// as document tabs, and plan in place. ChromeShell keys `/planner` into its
// immersive branch (`.overlay.immersive` + the floating ImmersiveBar with Back
// + the Plan-only Personal/Team toggle), so this page renders as the full-frame
// immersive surface with no top-bar nav or console — see WAVE-3-PLAN W3.3/W3.4.
//
// This is a thin Server Component that mounts the client <PlannerHub/>; all hub
// state (open docs, search, recents, autosave) lives in the client component,
// and the interactive chrome around it (immersbar, Back, Personal/Team) is
// owned by ChromeShell.

import type { ReactNode } from "react";
import { PlannerHub } from "@/components/hub-v2";

export default function PlannerPage(): ReactNode {
  return <PlannerHub />;
}
