// /planner — W3.4: the immersive Planning-Hub seam (net-new route).
//
// This route is the CAPABILITY landing that W3.3's immersive shell was built
// against: ChromeShell keys `/planner` into its §9b immersive branch
// (`.overlay.immersive` + the floating ImmersiveBar with Back + the Plan-only
// Personal/Team toggle), so this page renders as the full-frame immersive
// surface with no top-bar nav or console. See WAVE-3-PLAN W3.3/W3.4.
//
// The full Planning Hub (multi-pane lesson/unit planner, resources, catch-up)
// is a Phase-2 build; until then this is a deliberate stub that establishes
// the route + the immersive seam. The home console's "Planner hub" entry
// routes here (the recorded §9a divergence from the bundle, whose console
// still opens the legacy PlanPage — WAVE-3-PLAN R2).
//
// A Server Component: static seam content, no client state. The interactive
// chrome around it (immersbar, Back, Personal/Team) is owned by ChromeShell.

import type { ReactNode } from "react";

function PlannerGlyph(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="17" rx="2.5" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
      <path d="M7.5 13h5M7.5 16.5h9" />
    </svg>
  );
}

export default function PlannerPage(): ReactNode {
  return (
    <div className="cp-planner-stub">
      <div className="cp-planner-seam">
        <span className="cp-planner-glyph" aria-hidden="true">
          <PlannerGlyph />
        </span>
        <h1 className="cp-planner-title">Planner hub</h1>
        <p className="cp-planner-lede">
          Your planning workspace — lessons, units, resources, and catch-up, all
          in one place — is coming here soon.
        </p>
        <p className="cp-planner-note">
          Use the Day, Week, and Year views to plan in the meantime, or press
          the back arrow to return.
        </p>
      </div>
    </div>
  );
}
