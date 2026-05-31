import type { ReactNode } from "react";
import { AppStateProvider } from "@/lib/app-state";
import { ConsequenceToastProvider } from "@/lib/consequence-toast";
import { PlannerProvider } from "@/lib/planner-store";

// Teach route group — the live, in-class delivery surface
// (docs/teach-view-plan.md §2.1). It lives in its OWN route group, NOT under
// (planner), because the planner chrome (TopBar, GlobalRail, LeftFilterPanel,
// RightPanel) collides head-on with the Teach workspace's own five-zone shell,
// and Present / Full Screen must escape the planner shell entirely.
//
// Provider inheritance makes this cheap: ThemeProvider (→ PaletteProvider + the
// .cp-subj bridge), LabelsProvider, and the Geist fonts are all mounted at the
// ROOT layout (app/layout.tsx), so this group inherits subject colours, the
// palette bridge, renameable labels, and tokens for free. We only re-mount the
// two DATA providers the planner layout owns:
//
//   AppStateProvider   (week, subject, selectedLessonId, editMode, search)
//     └─ PlannerProvider  (lessons, getSections, lesson mutations)
//          └─ {children}   (no planner chrome — Teach renders its own)
//
// ConsequenceToastProvider is added because push-to-team (plan §13.1) surfaces
// a team-wide displacement-warning toast. No CatchupProvider / UnitNotesProvider
// are needed here.

export default function TeachLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <AppStateProvider>
      <PlannerProvider>
        <ConsequenceToastProvider>{children}</ConsequenceToastProvider>
      </PlannerProvider>
    </AppStateProvider>
  );
}
