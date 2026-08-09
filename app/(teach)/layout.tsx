import type { ReactNode } from "react";
import { AppStateProvider } from "@/lib/app-state";
import { CatchupProvider } from "@/lib/catchup-state";
import { ConsequenceToastProvider } from "@/lib/consequence-toast";
import { EditModeProvider } from "@/lib/edit-mode-state";
import { PlannerProvider } from "@/lib/planner-store";
import { ImmersiveBarHost } from "@/components/chrome";
import { CatchUpModalHost } from "@/components/catchup-v2";
import { V2 } from "@/lib/v2-flag";
import styles from "./layout.module.css";

// Teach route group — the live, in-class delivery surface
// (docs/teach-view-plan.md §2.1). It lives in its OWN route group, NOT under
// (planner), because the planner chrome (TopBar, GlobalRail, LeftFilterPanel,
// RightPanel) collides head-on with the Teach workspace's own five-zone shell,
// and Present / Full Screen must escape the planner shell entirely.
//
// ── THE IMMERSIVE BAR (audit finding A2, closed here) ─────────────────────
// `/teach` is one of the three §9b immersive surfaces (the 7.21 handoff:
// `source-home/compact-bar.css:1` — "Compact top bar — Teach · Plan · Post";
// `source-home/app.jsx:528` — `compact = … (view==='Teach'||'Plan'||'Post')`;
// README.md:142). It nevertheless shipped with NO app chrome whatsoever: no
// bar, no view nav, no Settings, no way back to Day/Week/Year except the
// browser's own Back. `ChromeShell` listed `/teach` in `IMMERSIVE_PREFIXES`,
// but this layout never mounted `ChromeShell`, so that entry was inert.
//
// WHY THIS MOUNTS THE BAR HOST AND NOT `ChromeShell`. The shell's immersive
// branch does render only the bar + children (no planner chrome), so that part
// of the idea holds — but its wrapper does not survive contact with this
// workspace, for three measured reasons:
//
//   1. LAYOUT. `ChromeShell` renders `.overlay.immersive`, which is
//      `position:absolute; inset:var(--frame-inset,30px); overflow:hidden`
//      (app/chrome.css:37-39,1469-1473). The Teach shell is
//      `height:100dvh` (components/teach-v2/TeachV2Shell.module.css:12, with a
//      comment explaining why it cannot be `height:100%`). 100dvh inside a
//      viewport-minus-60px clipping box loses 60px off the bottom — which is
//      exactly where the writing bar lives. Measured at 1440×900: the shell is
//      900px tall and the overlay box would be 840px.
//   2. PRESENT / FULL SCREEN. The reason this route group exists at all. The
//      bar host mounts OUTSIDE the workspace's `rootRef`, so browser
//      fullscreen (which targets `rootRef`) simply does not paint it, and the
//      CSS projector takeover (`.teach.trueFull`, position:fixed z-index:50)
//      covers it. Nesting the workspace inside an `overflow:hidden`,
//      `z-index:3` overlay would put both of those escapes at the mercy of an
//      ancestor stacking/clipping context.
//   3. PROVIDERS. `ChromeShell` calls `useViewEditMode`, which THROWS outside
//      `<EditModeProvider>` (lib/edit-mode-state.tsx:194-200).
//
// So Teach mounts `ImmersiveBarHost` directly. That is the SAME component
// ChromeShell's immersive branch renders — one bar, one stillness timer, one
// set of slot fills, no copy. Personal/Team is deliberately absent: it belongs
// in the immersbar on Plan ONLY (bundle-verified; ChromeShell's
// `IMMERSIVE_MODESW_PREFIXES`), and `showModeSwitch` defaults to false.
//
// Provider inheritance makes this cheap: ThemeProvider (→ PaletteProvider + the
// .cp-subj bridge), LabelsProvider, and the Geist fonts are all mounted at the
// ROOT layout (app/layout.tsx), so this group inherits subject colours, the
// palette bridge, renameable labels, and tokens for free. We only re-mount the
// DATA providers the planner layout owns that something here actually needs:
//
//   AppStateProvider   (week, subject, selectedLessonId, editMode, search)
//     └─ PlannerProvider  (lessons, getSections, lesson mutations)
//          └─ ConsequenceToastProvider  (push-to-team displacement warnings)
//               └─ EditModeProvider  (the bar's ConsoleNav; see below)
//                    └─ CatchupProvider  (the bar's Catch-up item; see below)
//                         └─ the bar + {children}
//
// EditModeProvider — `ConsoleNav` calls `useViewEditMode("Day")` so its Day tab
// can force Day back to View on the click that navigates (W3.8b). A SEPARATE
// instance from the planner group's is correct, not a desync: `setEdit` writes
// through to localStorage synchronously, and crossing route groups remounts
// the tree anyway, so /daily hydrates the value this one wrote. (The
// weekly-schedule-state desync this pattern guards against is about two live
// copies inside ONE tree, which never happens here.)
//
// CatchupProvider — the bar's Tools popover has a Catch-up item that dispatches
// CATCHUP_MODAL_TOGGLE_EVENT, so the modal host has to be mounted here too or
// that control is a no-op. `CatchUpModal` needs `useCatchup()`, which throws
// outside this provider (lib/catchup-state.tsx:438-441); every other hook it
// uses (useSchoolWeek / useAcademicYear / useOrderedWeekdays) is provider-free.
// No UnitNotesProvider / UndoToastProvider / NotebookProvider are needed —
// nothing mounted here reads them.

export default function TeachLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <AppStateProvider>
      <PlannerProvider>
        <ConsequenceToastProvider>
          <EditModeProvider>
            <CatchupProvider>
              {/* Positioned fill: `.immersbar` is `position:absolute; top:0`
                  (app/chrome.css:1478-1482) and <body> is static, so without a
                  positioned ancestor the bar would anchor to the viewport's
                  initial containing block. This wrapper is the containing
                  block AND nothing else — no inset, no clip, no grid — so the
                  100dvh workspace below keeps every pixel it has today. */}
              {/* `immersbar-host` is the GLOBAL marker two of the bar's bare
                  <button> recipes key on — `.ib-exit` (the round glass Back
                  circle) and `.ib-peek` (the touch recovery tab). Both need a
                  ≥2-class selector to survive `.cp-root button`, and both used
                  `.overlay` for that second class, which only ChromeShell
                  renders. Without this the Back button degrades to a bare
                  chevron and the peek tab becomes an in-flow 18px spacer.
                  See the `.ib-peek` comment in app/chrome.css.

                  `barHost` carries the `--immersbar-clear` headroom, so BOTH
                  ride the same flag as the bar itself — flag-OFF reserves
                  nothing for a bar that isn't there. */}
              <div
                className={
                  V2
                    ? `${styles.teachShell} ${styles.barHost} immersbar-host`
                    : styles.teachShell
                }
              >
                {/* The elected Catch-Up modal host for this route group.
                    `mount="chrome"` matches ChromeShell's election so a
                    route-mounted Host stands down; the two groups never
                    co-exist in one tree, so there is no double election. */}
                <CatchUpModalHost mount="chrome" />
                {/* ⚠ GATED ON V2, and this is the "two bars" guard, not
                    ceremony. On the flag-OFF rollback build TeachWorkspace
                    mounts `TeachV1Zones`, which renders its OWN v1
                    `TeachTopBar` (wordmark · grade chip · view tabs · help ·
                    avatar) — components/teach/TeachV1Zones.tsx:140. Mounting
                    this unconditionally would stack the v2 immersive bar on top
                    of it and reserve headroom for both. Flag-ON,
                    `TeachV2Shell` renders no top bar at all, which is the gap
                    this closes. Same seam as `PlannerChrome` in
                    app/(planner)/layout.tsx; `V2` is build-time inlined, so
                    server and client agree and there is no hydration tear. */}
                {V2 && <ImmersiveBarHost />}
                {children}
              </div>
            </CatchupProvider>
          </EditModeProvider>
        </ConsequenceToastProvider>
      </PlannerProvider>
    </AppStateProvider>
  );
}
