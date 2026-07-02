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
//   • `hidden` — the Teach-only auto-hide (2.8s stillness, wakes on any
//     mousemove/touch) is the enrolling surface's timer, not ours; we only
//     append the bundle's ` hidden` class so chrome.css can slide the bar
//     away. `pointer-events` stays CSS's concern (`.immersbar` is
//     none; children re-enable) so a hidden bar never eats input.
//   • `showModeSwitch` — Personal/Team appears in the immersive bar on
//     Plan ONLY (verified against the bundle; WAVE-3-PLAN §3 R1). Post and
//     Teach pass nothing and get an empty right slot.
//   • `title` — the ViewTitle + per-view style-gear host (W3.5), rendered
//     after the exit button in the left slot.
//
// Tooltip: the exit button is icon-only, so it gets the onboarding
// explanation per CLAUDE.md §4 — dismissible (navigation, not a
// high-consequence control).

import type { ReactNode } from "react";
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

// ── Component ──────────────────────────────────────────────────────────────

export interface ImmersiveBarProps {
  /** ViewTitle + style-gear host (W3.5) — rendered after the exit button. */
  title?: ReactNode;
  /** Personal/Team toggle in the right slot. Plan ONLY per the bundle. */
  showModeSwitch?: boolean;
  /**
   * Exit handler. The CALLER settles pending View Transitions / back-pops
   * before navigating — this component only reports the click.
   */
  onBack: () => void;
  /** Teach auto-hide: slide the bar away (caller owns the stillness timer). */
  hidden?: boolean;
}

export function ImmersiveBar({
  title,
  showModeSwitch = false,
  onBack,
  hidden = false,
}: ImmersiveBarProps): ReactNode {
  return (
    // "immersbar-hidden", not the bundle's bare "hidden": Tailwind's .hidden
    // utility (display:none, emitted AFTER chrome.css) would beat the
    // opacity/transform slide recipe and kill the Teach auto-hide transition
    // (§4a finding #10). Recorded bundle-parity deviation; chrome.css keys
    // the same name.
    <div className={"immersbar" + (hidden ? " immersbar-hidden" : "")}>
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
      <div className="immersbar-right">{showModeSwitch && <ModeSwitch />}</div>
    </div>
  );
}
