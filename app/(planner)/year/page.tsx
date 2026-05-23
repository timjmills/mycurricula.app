"use client";

// Year view — curriculum roadmap + progression surface.
//
// Replaces the Wave-7 stub. Renders <YearView> which provides:
//   • Page header (title, subtitle, action buttons)
//   • YearSidebar sub-nav (Roadmap/Progression active; rest coming-soon)
//   • Roadmap (Grid mode) or Progression (List mode) based on viewMode
//   • Status filter pill bar
//   • Bottom stat strip (live data)
//
// viewMode is shared state: the global top-bar Grid|List pill and the
// in-page Roadmap|Progression toggle both control the same value via
// useAppState().viewMode.

import { YearView } from "@/components/year";

export default function YearPage() {
  return <YearView />;
}
