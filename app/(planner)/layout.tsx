import type { ReactNode } from "react";
import { AppStateProvider } from "@/lib/app-state";
import { PlannerProvider } from "@/lib/planner-store";
import {
  LeftFilterPanel,
  MasterBanner,
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
          {/* Master-mode heads-up → persistent banner. Renders only while
            the Master edit mode is active; pins above the top bar. */}
          <MasterBanner />
          <TopBar />
          <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
            <LeftFilterPanel />
            <main
              id="main-content"
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
