// drawer-mq.ts — the Weekly rail-drawer breakpoint, as a dependency-free leaf.
//
// At ≤1280px the Weekly right rail's inline pane is hidden by CSS
// (RES-CRIT-001 — the WeeklyGrid has a 1082px intrinsic min-width so a rail
// next to it forces document-level horizontal scroll), and the overlay
// drawer mounts at the SAME breakpoint so the rail's content is reachable
// at every viewport where the inline pane is hidden. The audit's spec
// ("below ~960px") would leave a 961–1280 dead-zone — aligning to the
// existing CSS hide is the practical answer.
//
// The shell-level <RightPanel> keys its Weekly lesson-detail gate off the
// SAME breakpoint (drawer owns ≤1280, the shell panel owns wider) so the
// two surfaces can never mount together.
//
// LEAF ON PURPOSE (bundle-slim lever A1): <RightPanel> is mounted by
// app/(planner)/layout.tsx on EVERY planner route. When this constant
// lived inside WeeklyShell.tsx, RightPanel's one-constant import (via the
// weekly barrel) dragged the entire weekly + daily + lesson-editor + teach
// component graph (~195 kB gzip) into the layout's client bundle on routes
// that never render any of it. Non-weekly consumers import THIS module
// directly (a sanctioned deep import — it is the whole point of the leaf);
// weekly-internal consumers may keep using the barrel.

export const DRAWER_MQ = "(max-width: 1280px)";
