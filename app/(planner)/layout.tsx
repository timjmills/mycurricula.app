import type { ReactNode } from "react";
import { AppStateProvider } from "@/lib/app-state";
import { CatchupProvider } from "@/lib/catchup-state";
import { ConsequenceToastProvider } from "@/lib/consequence-toast";
import { NotebookProvider } from "@/lib/notebook-state";
import { PlannerProvider } from "@/lib/planner-store";
import { UndoToastProvider } from "@/lib/undo-toast";
import { UnitNotesProvider } from "@/lib/unit-notes";
import {
  GlobalShortcuts,
  MasterBanner,
  RightPanel,
  SideNav,
  TopBar,
} from "@/components/shell";
import styles from "./layout.module.css";

// Planner shell — the chrome shared by every primary view (Weekly, Daily,
// Subject, …). Routing picks which view renders in the canvas; this layout
// supplies the top bar, the collapsible left filter panel, and the
// contextual right panel around it.
//
// Settings lives outside this group: it is a separate full-page surface
// with its own layout, reached from the top-bar profile menu.
//
// A11Y-004: a "Skip to content" link is the first focusable element.
// It is visually hidden until keyboard focus lands on it, then slides
// into view above the top bar. The `<main>` element carries `id="main-content"`
// so the link's href="#main-content" delivers focus to the canvas.

export default function PlannerLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <AppStateProvider>
      {/* W-E NotebookProvider: workspace + notebook selection state.
          Sits inside AppStateProvider so Phase 1B can wire isWorkspaceAdmin
          from currentUser.id. Outside PlannerProvider — notebook selection
          is at the workspace tier, broader than any single planner session. */}
      <NotebookProvider>
        <PlannerProvider>
          {/* UnitNotesProvider hosts per-unit "Don't miss" callout persistence.
              No seeds needed here — SubjectView reads from the live mock unit
              data; any saved notes come from localStorage post-mount.
              CatchupProvider hosts the three-layer Catch-up control state
              (planning-doc §1262) — the global on/off flag, per-week
              dismissals, and per-item action overlays.
              ConsequenceToastProvider hosts the W2-B8 toast surface so
              team-scoped settings can fire a transient confirmation
              naming the team-wide effect.
              UndoToastProvider hosts the roadmap-02 undo toast for
              personal planner gestures (move / complete / first fork /
              revert) and confirmation-only moments ("Link copied"). */}
          <ConsequenceToastProvider>
            <UndoToastProvider>
              <UnitNotesProvider>
                <CatchupProvider>
                  {/* Skip-to-content (A11Y-004) — must be the first focusable element
                  in the DOM so keyboard users reach it before the top-bar chrome. */}
                  <a href="#main-content" className={styles.skipLink}>
                    Skip to content
                  </a>
                  <div
                    className="cp-root"
                    style={{
                      flex: 1,
                      minHeight: 0,
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    {/* Global keyboard shortcuts, ⌘K palette, and ? overlay.
                    Mounted as a client leaf so the layout stays a Server Component. */}
                    <GlobalShortcuts />
                    {/* v1.3 shell: an app-wide left SideNav (primary navigation,
                    replacing the old top-bar tabs + icon rails) and a content
                    column holding the Team-Curriculum banner, the slimmed top
                    bar, and the body row (left filter panel + canvas + right
                    panel). Teach is a separate route group with its own chrome. */}
                    <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
                      <SideNav />
                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                          minHeight: 0,
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        {/* Team Curriculum mode heads-up → persistent banner. Renders
                        only while the Team Curriculum edit mode (internal value:
                        "master") is active; pins above the top bar. */}
                        <MasterBanner />
                        <TopBar />
                        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
                          <main
                            id="main-content"
                            style={{
                              flex: 1,
                              minWidth: 0,
                              minHeight: 0,
                              overflow: "auto",
                            }}
                          >
                            {children}
                          </main>
                          <RightPanel />
                        </div>
                      </div>
                    </div>
                  </div>
                </CatchupProvider>
              </UnitNotesProvider>
            </UndoToastProvider>
          </ConsequenceToastProvider>
        </PlannerProvider>
      </NotebookProvider>
    </AppStateProvider>
  );
}
