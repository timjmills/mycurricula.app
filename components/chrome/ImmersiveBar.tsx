"use client";

// ImmersiveBar.tsx — the floating chrome bar for immersive surfaces (W3.3).
//
// On Plan / Post / Teach the two-row nav, console, and bell give way to
// `.overlay.immersive` + this single slim bar floating over the top of the
// content (V2 Framework §9b; ported from the 7.2.26 bundled mockup —
// mockup/New v2 Site Design.bundled.html, the look/behavior authority).
// Layout, scrim gradient, tone branches, and the hide transition all live
// in chrome.css (`.immersbar`, `.immersbar-left`, `.immersbar-right`,
// `.ib-exit`, `.immersbar.immersbar-hidden`) — this file writes NO styles.
//
// Deliberately DUMB — the callers own every behavior knob:
//   • `onBack` — the caller settles any pending View Transition and honors
//     the custom-wall back-pop (`cc-rw-back` analogue) BEFORE router
//     navigation (WAVE-3-PLAN §1 W3.3). This component just reports the
//     click.
//   • `hidden` / `barRef` / `onShow` — the idle auto-hide. The timer is NOT
//     here: it lives in `use-immersive-autohide.ts`, which `ImmersiveBarHost`
//     calls and whose `{ hidden, show, barRef }` it hands straight to these
//     three props. We only append the ` immersbar-hidden` class so chrome.css can
//     slide the bar away, host the ref the hook attaches its wake listeners
//     to, and render the touch-tier peek tab while hidden.
//     Delay is 3200ms on pointer devices / 5000ms on touch (7.21.26 handoff
//     source-home/app.jsx:534 — the "2.8s" this comment used to quote was the
//     older 6.24/7.2 figure, corrected 2026-08-07).
//     `pointer-events` stays CSS's concern (`.immersbar` is none; children
//     re-enable — and re-disable while hidden, chrome.css) so a hidden bar
//     never eats input.
//
// SCOPE: all three immersive surfaces receive `hidden` — `/planner*` and
// `/post*` via ChromeShell, `/teach*` via `app/(teach)/layout.tsx`. Both
// mount the same `ImmersiveBarHost`. (Finding A2 of
// docs/audits/2026-07-31-post-teach-catchup-shell.md — that /teach got no bar
// at all — is CLOSED; this note used to record it as open.)
//   • `showModeSwitch` — Personal/Team appears in the immersive bar on
//     Plan ONLY (verified against the bundle; WAVE-3-PLAN §3 R1). Post and
//     Teach pass nothing and get an empty right slot.
//   • `title` — the ViewTitle + per-view style-gear host (W3.5), rendered
//     after the exit button in the left slot.
//
// Tooltip: the exit button is icon-only, so it gets the onboarding
// explanation per CLAUDE.md §4 — dismissible (navigation, not a
// high-consequence control).

import type { ReactNode, RefObject } from "react";
import { Tooltip } from "@/components/ui";
import { ModeSwitch } from "./ModeSwitch";

// ── Back chevron — exact inline-SVG port from the bundled mockup ──────────

function BackChevronIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

/** Peek chevron — the handoff's `.cb-peek` glyph (app.jsx:593). */
function PeekChevronIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export interface ImmersiveBarProps {
  /** ViewTitle + style-gear host (W3.5) — rendered after the exit button. */
  title?: ReactNode;
  /** Personal/Team toggle in the right slot. Plan ONLY per the bundle. */
  showModeSwitch?: boolean;
  /**
   * Center nav slot — the six-tab view console (SideNav-retirement R1b). The
   * handoff's compact-bar `.cb-center` carries the same `.views.nav` switch on
   * the immersive surfaces (Plan/Post), so a teacher can jump between views
   * without leaving. ChromeShell passes the shared <ConsoleNav compact/>.
   */
  nav?: ReactNode;
  /**
   * Right-cluster extras appended AFTER the mode switch (SideNav-retirement
   * R1a/c/d): the Tools popover + account menu, so every re-homed destination
   * (Catch-up, Schedule, Archive, Settings, account) is reachable from the
   * immersive route families too — matching the handoff compact-bar's ⋯ menu.
   */
  tools?: ReactNode;
  /**
   * Exit handler. The CALLER settles pending View Transitions / back-pops
   * before navigating — this component only reports the click.
   */
  onBack: () => void;
  /** Idle auto-hide: slide the bar away. Owned by `useImmersiveAutohide`. */
  hidden?: boolean;
  /**
   * Bar root ref — `useImmersiveAutohide` binds its `mouseenter` / `focusin`
   * wakes to this element and reads it for the open-popover gate.
   */
  barRef?: RefObject<HTMLDivElement | null>;
  /**
   * Bring a hidden bar back — the peek tab's handler. Omit it and no peek tab
   * renders, which is the right default for a caller that never hides the bar.
   */
  onShow?: () => void;
}

export function ImmersiveBar({
  title,
  showModeSwitch = false,
  nav,
  tools,
  onBack,
  hidden = false,
  barRef,
  onShow,
}: ImmersiveBarProps): ReactNode {
  // The peek tab is a SIBLING of the bar, not a child — it has to stay
  // visible while `.immersbar-hidden` sits at opacity 0 (handoff
  // app.jsx:593 renders it the same way, outside `.cbar`).
  return (
    <>
      {/* "immersbar-hidden", not the bundle's bare "hidden": Tailwind's
          .hidden utility (display:none, emitted AFTER chrome.css) would beat
          the opacity/transform slide recipe and kill the auto-hide
          transition (§4a finding #10). Recorded bundle-parity deviation;
          chrome.css keys the same name. */}
      <div
        ref={barRef}
        className={"immersbar" + (hidden ? " immersbar-hidden" : "")}
      >
        <div className="immersbar-left">
          <Tooltip
            content="Back to the previous screen"
            side="bottom"
            tooltipId="chrome-immersive-back"
          >
            {/* Bare <button>: `.ib-exit` (round 42px glass circle) IS the
                complete handoff recipe; the ui Button primitive's `.btn`
                base would fight it — same reasoning as ModeSwitch. */}
            <button
              type="button"
              className="ib-exit"
              aria-label="Back"
              onClick={onBack}
            >
              <BackChevronIcon />
            </button>
          </Tooltip>
          {title}
        </div>
        {nav ? <div className="immersbar-center">{nav}</div> : null}
        <div className="immersbar-right">
          {showModeSwitch && <ModeSwitch />}
          {tools}
        </div>
      </div>
      {/* Peek tab — touch-tier only (`.ib-peek` is display:none until
          `@media (hover: none)`, and off again ≤640px where auto-hide never
          runs). Mouse users get the top-edge hotzone instead; a touch user
          has no hover, so without this the bar would be unrecoverable.

          TOOLTIP (CLAUDE.md §4): icon-only and non-obvious, so it earns one —
          but the text explains WHY the bar vanished rather than restating
          "Show the top bar", which the aria-label already says. Dismissible
          (`tooltipId`), not `required`: nothing here is destructive or
          team-wide. On touch the primitive suppresses the styled bubble and
          mirrors the string to native `title=` for long-press, which is the
          only tier this button renders on. */}
      {hidden && onShow ? (
        <Tooltip
          content="The bar slides away while you work. Tap to bring it back."
          side="bottom"
          tooltipId="chrome-immersive-peek"
        >
          <button
            type="button"
            className="ib-peek"
            aria-label="Show the top bar"
            onClick={onShow}
          >
            <PeekChevronIcon />
          </button>
        </Tooltip>
      ) : null}
    </>
  );
}
