import type { ReactNode } from "react";
import { AppStateProvider } from "@/lib/app-state";
import { PlannerProvider } from "@/lib/planner-store";
import {
  LeftFilterPanel,
  MasterBanner,
  RightPanel,
  TopBar,
} from "@/components/shell";

// Planner shell — the chrome shared by every primary view (Weekly, Daily,
// Subject, …). Routing picks which view renders in the canvas; this layout
// supplies the top bar, the collapsible left filter panel, and the
// contextual right panel around it.
//
// Settings lives outside this group: it is a separate full-page surface
// with its own layout, reached from the top-bar profile menu.

export default function PlannerLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <AppStateProvider>
      <PlannerProvider>
        <div
          className="cp-root"
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Master-mode heads-up → persistent banner. Renders only while
            the Master edit mode is active; pins above the top bar. */}
          <MasterBanner />
          <TopBar />
          <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
            <LeftFilterPanel />
            <main
              style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "auto" }}
            >
              {children}
            </main>
            <RightPanel />
          </div>
        </div>
      </PlannerProvider>
    </AppStateProvider>
  );
}
