"use client";

// ChromeShell — W3.3: the v2 corner-grammar chrome host (Framework §3), with
// the §9b immersive branch. Replaces the v1.3 TopBar + red MasterBanner in the
// (planner) layout. W3.4 adds the console (the /home landing + the compact
// view-nav atop Day/Week/Year); the SideNav stays mounted OUTSIDE this shell
// as INTERIM nav for the surfaces the console doesn't yet cover (Subject,
// Schedule, Catch-up, Archive, Boards, Settings). Retiring it waits until
// those surfaces get console/contextual homes (a later sub-wave).
//
// Two render modes, keyed by route (WAVE-3-PLAN W3.3):
//   • CORNER (Day/Week/Year/Home …): the mockup's `.overlay` grid —
//     ChromeTopBar (row 1) · the routed content (middle 1fr row) · the
//     `.botbar` with ChromeContext BL + ChromeClock BR (row 3), plus the
//     absolutely-positioned bottom-center ChromeQuote (a direct overlay
//     child; `.hero-quote` self-positions, chrome.css:664).
//   • IMMERSIVE (/planner /post /teach): `.overlay.immersive` — content
//     fills the frame card; a single floating ImmersiveBar carries Back +
//     title (+ Personal/Team on /planner ONLY, per the bundle). This branch
//     is the CAPABILITY; no immersive route exists in this group until the
//     W3.4 /planner stub (Post/Teach enroll with their surfaces, Phases 2–3).
//
// TEAM-MODE GLOW: mirrors editMode === "master" onto <html data-mode="team">
// so the chrome.css policy layer (frame edge-glow + pink toggle, two-pulse
// then persist) fires app-wide. The attribute lives on <html> — not this
// subtree — because the glow must also reach overlays/portals that render
// outside the shell. Mirrored in an effect (SSR-safe: the server never
// renders team mode; the boot default is personal).

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAppState } from "@/lib/app-state";
import { settlePendingNavigation } from "@/lib/view-transition";
import { ChromeTopBar } from "./ChromeTopBar";
import { ImmersiveBar } from "./ImmersiveBar";
import { ChromeContext } from "./ChromeContext";
import { ChromeClock } from "./ChromeClock";
import { ChromeQuote } from "./ChromeQuote";
import { CompactConsole, COMPACT_CONSOLE_ROUTES } from "./Console";
import { ViewTitle } from "./ViewTitle";

// §9b immersive surfaces — exactly Plan · Post · Teach (WAVE-3-PLAN R1).
// Prefix match so nested routes (/planner/units, /post/wall-x) stay immersive.
const IMMERSIVE_PREFIXES = ["/planner", "/post", "/teach"] as const;

/** Personal/Team belongs in the immersbar on Plan ONLY (bundle-verified). */
const IMMERSIVE_MODESW_PREFIXES = ["/planner"] as const;

export function ChromeShell({ children }: { children: ReactNode }): ReactNode {
  const pathname = usePathname();
  const router = useRouter();
  const { editMode } = useAppState();

  // <html data-mode="team"> ↔ editMode. Set/removed (never "personal") so the
  // attribute's presence IS the team signal, matching the CSS key and keeping
  // the resting DOM byte-identical to pre-W3.3 for every non-team session.
  useEffect(() => {
    const root = document.documentElement;
    if (editMode === "master") {
      root.dataset.mode = "team";
    } else {
      delete root.dataset.mode;
    }
    return () => {
      delete root.dataset.mode;
    };
  }, [editMode]);

  const immersive = IMMERSIVE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  // Bundle scoping for the bottom chrome (see the render comment below).
  const botbarRoute = pathname === "/home" || pathname === "/daily";
  const quoteRoute = pathname === "/home";
  // W3.4: the compact console (the slim view-nav variant) rides atop
  // Day/Week/Year. Home renders the FULL console as its page; the immersive
  // branch below returns before this ever reaches those surfaces.
  const compactConsoleRoute = COMPACT_CONSOLE_ROUTES.includes(pathname);

  // W3.5: the per-view title + style gear. Self-derives its title from the
  // route (renders null on home + the untitled surfaces), so it can be handed
  // to whichever bar is active. Fills the title slot the W3.3 shell reserved.
  const viewTitle = <ViewTitle />;

  if (immersive) {
    const showModeSwitch = IMMERSIVE_MODESW_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    );
    return (
      <div className="overlay immersive">
        <ImmersiveBar
          title={viewTitle}
          showModeSwitch={showModeSwitch}
          onBack={() => {
            // Contract (WAVE-3-PLAN R1): settle any in-flight soft swap so
            // the snapshot cannot hold input through a back-navigation this
            // module didn't start. TODO(W3.4/Phase-2): honor the custom-wall
            // back-pop (cc-rw-back analogue) before leaving /post.
            settlePendingNavigation();
            // Deep-link guard (§4a finding #11): with no in-app history
            // entry, back() would exit the site — land on the default
            // route instead (the bundle keeps its own back stack).
            if (window.history.length <= 1) {
              router.push("/weekly");
            } else {
              router.back();
            }
          }}
        />
        {children}
      </div>
    );
  }

  return (
    <div className="overlay">
      <ChromeTopBar title={viewTitle} />
      {/* Middle 1fr row — hosts the routed view. minHeight:0 so the view's
          own scroll container works inside the grid track (layout-only
          inline style, per the Tailwind/tokens split). The compact console
          (W3.4) sits above the view on Day/Week/Year as their in-view
          primary nav. */}
      <div style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
        {compactConsoleRoute && <CompactConsole />}
        {children}
      </div>
      {/* Bottom chrome is ROUTE-SCOPED per the bundle (showBot fires on
          home + Day only, line 11923; the quote is home-only, 12028 —
          bundle wins over broader plan text, §2 standing rule). This also
          protects the phone tier: at ≤760px the botbar stacks full-width,
          which Week/Year never budgeted for. An empty third grid row keeps
          the overlay's auto/1fr/auto shape on the other views. */}
      {botbarRoute ? (
        <div className="botbar">
          <ChromeContext />
          <ChromeClock />
        </div>
      ) : (
        <div />
      )}
      {/* Bottom-center inspirational quote — absolute, self-positioning. */}
      {quoteRoute && <ChromeQuote />}
    </div>
  );
}
