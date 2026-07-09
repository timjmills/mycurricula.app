import type { ReactNode } from "react";
import { AppStateProvider } from "@/lib/app-state";
import { CatchupProvider } from "@/lib/catchup-state";
import { ConsequenceToastProvider } from "@/lib/consequence-toast";
import { EditModeProvider } from "@/lib/edit-mode-state";
import { NotebookProvider } from "@/lib/notebook-state";
import { PlannerProvider } from "@/lib/planner-store";
import { UndoToastProvider } from "@/lib/undo-toast";
import { UnitNotesProvider } from "@/lib/unit-notes";
import {
  GlobalShortcuts,
  LastRouteRecorder,
  RightPanel,
  SideNav,
  UndoToastBridge,
} from "@/components/shell";
import { ChromeShell } from "@/components/chrome";
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
                  {/* EditModeProvider (W3.8b) hosts the per-view View↔Edit UI
                      mode (the bundle's cc_editmode map — NOT app-state's
                      forking editMode; same word, unrelated axis). It must
                      sit ABOVE both the SideNav (a force-reset writer) and
                      the ChromeShell subtree (the toggle writer + the botbar
                      reader + the Day-edit view) so every consumer shares
                      ONE live instance — the weekly-schedule-state desync
                      lesson (lib/edit-mode-state.tsx header). */}
                  <EditModeProvider>
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
                      {/* Remembers the active planner route so the Settings X /
                    Escape can return the teacher exactly where they left. */}
                      <LastRouteRecorder />
                      {/* Roadmap-02 undo-toast bridge: a render-nothing client
                    leaf that watches the planner store's lastChange and fires
                    the undo toast for every undoable gesture (move /
                    completion / first fork / revert). Must sit inside BOTH
                    PlannerProvider and UndoToastProvider. */}
                      <UndoToastBridge />
                      {/* W3.3 shell: the v2 corner-grammar chrome (ChromeShell —
                    Framework §3 overlay grid: ChromeTopBar with brand +
                    Personal/Team icon toggle + bell · routed content in the
                    middle row · ctx BL + clock BR + quote bottom-center; with
                    the §9b immersive branch for /planner /post /teach). It
                    REPLACES the v1.3 TopBar and the red MasterBanner — team
                    mode now signals via the pink [data-mode="team"] glow
                    (CLAUDE.md §2), which ChromeShell mirrors onto <html>.
                    W3.4 landed the console (the /home landing + the compact
                    view-nav atop Day/Week/Year); the SideNav stays mounted
                    INTERIM as nav for the surfaces the console doesn't yet
                    cover (Subject, Schedule, Catch-up, Archive, Boards,
                    Settings) — it retires once those get their own homes. The
                    corner grammar itself carries no nav. The content column
                    is position:relative so the absolute .overlay grid fills
                    exactly the area right of the SideNav. Teach remains a
                    separate route group with its own chrome. */}
                      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
                        <SideNav />
                        <div
                          style={{
                            flex: 1,
                            minWidth: 0,
                            minHeight: 0,
                            position: "relative",
                          }}
                        >
                          <ChromeShell>
                            <div
                              style={{
                                flex: 1,
                                minHeight: 0,
                                display: "flex",
                              }}
                            >
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
                          </ChromeShell>
                        </div>
                      </div>
                    </div>
                  </EditModeProvider>
                </CatchupProvider>
              </UnitNotesProvider>
            </UndoToastProvider>
          </ConsequenceToastProvider>
        </PlannerProvider>
      </NotebookProvider>
    </AppStateProvider>
  );
}
