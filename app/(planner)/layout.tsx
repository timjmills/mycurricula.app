import type { ReactNode } from "react";
import { AppStateProvider } from "@/lib/app-state";
import { CatchupProvider } from "@/lib/catchup-state";
import { ConsequenceToastProvider } from "@/lib/consequence-toast";
import { PlannerProvider } from "@/lib/planner-store";
import { UnitNotesProvider } from "@/lib/unit-notes";
import {
  GlobalRail,
  GlobalShortcuts,
  LeftFilterPanel,
  MasterBanner,
  RailsDndProvider,
  RightIconRail,
  RightPanel,
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
      <PlannerProvider>
        {/* UnitNotesProvider hosts per-unit "Don't miss" callout persistence.
            No seeds needed here — SubjectView reads from the live mock unit
            data; any saved notes come from localStorage post-mount.
            CatchupProvider hosts the three-layer Catch-up control state
            (planning-doc §1262) — the global on/off flag, per-week
            dismissals, and per-item action overlays.
            ConsequenceToastProvider hosts the W2-B8 toast surface so
            team-scoped settings can fire a transient confirmation
            naming the team-wide effect. */}
        <ConsequenceToastProvider>
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
              {/* Team Curriculum mode heads-up → persistent banner. Renders only
                  while the Team Curriculum edit mode (internal value: "master")
                  is active; pins above the top bar. */}
              <MasterBanner />
              <TopBar />
              {/* RailsDndProvider wraps the body row in a single dnd-kit
                  DndContext so teachers can drag icon buttons BETWEEN the
                  left rail (<GlobalRail>) and the right icon rail
                  (<RightIconRail>). The provider owns the cross-rail
                  drop-end handler and writes the new arrangement through
                  useRailLayout; both rails register their own
                  SortableContext inside it (Lane FA — Wave 1.5). */}
              <RailsDndProvider>
                <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
                  {/* GlobalRail — the site-wide slim icon nav strip, mounted
                      on every planner route. Lane CC promoted it from the
                      Daily-only IconRail; Lane DD also wired the Schedule
                      drawer trigger here so the Schedule side-panel is
                      reachable from /weekly, /year, /catch-up, /subject (not
                      just /daily) — audit F#8. GlobalRail itself mounts the
                      <SchedulePanel> with state from useAppState so the
                      drawer ships exactly once per page (no duplicate
                      mounts) and the trigger + drawer share one toggle. */}
                  <GlobalRail />
                  <LeftFilterPanel />
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
                  {/* RightIconRail — the right-side mirror of GlobalRail.
                      Renders whichever icons the teacher has dragged from
                      the left rail; starts empty by default. Mounted on
                      every planner route so the arrangement is consistent
                      across views (Lane FA — Wave 1.5). */}
                  <RightIconRail />
                </div>
              </RailsDndProvider>
              {/* Live Clock now lives inline in the top-bar next to
                  Week N (user direction 2026-05-26). The floating
                  bottom-right variant is still supported via
                  <Clock variant="floating" />; it's just not mounted
                  here by default. */}
            </div>
          </CatchupProvider>
        </UnitNotesProvider>
        </ConsequenceToastProvider>
      </PlannerProvider>
    </AppStateProvider>
  );
}
