"use client";

// ModeSwitch.tsx — the Personal / Team Curriculum ICON toggle (W3.3).
//
// The 7.2 corner grammar's mode switch: a glass pill holding two icon
// segments — single person (Personal) and person-group (Team Curriculum).
// Ported from the 7.2.26 bundled mockup's `.modesw.modesw-icon.glass`
// recipe (mockup/New v2 Site Design.bundled.html, the handoff's
// look/behavior authority — the modular source/ tree is stale for the
// shell). It renders in the right `.tools` cluster of the top bar AND in
// the immersive bar's right slot on Plan (Framework §9b) — one component,
// both hosts (the ImmersiveBar caller decides via `showModeSwitch`).
//
// State: `editMode` from useAppState — the app's canonical
// `personal | master` value space (CLAUDE.md §2: "Team Curriculum" is the
// UI label; the internal value stays `master`). Flipping the toggle is the
// ONLY way into Team mode; the pink caution glow on `[data-mode="team"]`
// (not this component's concern — the shell host sets the attribute) is
// the safety mechanism, never a confirm dialog.
//
// Styling: chrome.css owns everything (`.modesw`, `.modesw-icon`,
// `.modesw-ib`, the ` active`/` team` state classes, the glass material).
// This file writes NO styles and hard-codes NO colors — it only speaks the
// ported class vocabulary. The buttons are bare <button>s, NOT the ui
// Button primitive, deliberately: `.modesw-ib` (border:0, background:none,
// grid-centered 42×34 segment) IS the complete handoff recipe, and the
// primitive's `.btn` base fills/padding would fight it. The mockup's
// `.app-tip` titles map onto the app's Tooltip primitive instead (the
// chrome.css header records this mapping as the mandated mechanism).
//
// Tooltips: `required: true` per CLAUDE.md §4 — the Personal/Team toggle is
// on the always-on high-consequence list, so the tips ignore per-id
// dismissal and the global off switch. Copy is the bundle's title text,
// verbatim.
//
// Accessibility: each segment carries aria-label + aria-pressed (a
// two-button pressed pair, matching the mockup's active-class semantics);
// the pill is a labelled group. Icons are aria-hidden — the labels carry
// the names.

import type { ReactNode } from "react";
import { useAppState } from "@/lib/app-state";
import { Tooltip } from "@/components/ui";

// ── Tooltip copy (bundle title text, verbatim) ────────────────────────────

const PERSONAL_TIP =
  "Personal — view and edit your own copy of each lesson. Edits here only affect you.";
const TEAM_TIP =
  "Team Curriculum — edit the shared master plan. Changes here affect the whole team.";

// ── Icons — exact inline-SVG ports from the bundled mockup ────────────────
// Single person (Personal) and three-person group (Team). Stroke widths
// differ between the two in the bundle (2.1 vs 2) — kept as-is.

function PersonIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

function TeamIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="7.5" r="2.9" />
      <path d="M7.6 18.5a4.4 4.4 0 0 1 8.8 0" />
      <circle cx="5" cy="9.5" r="2" />
      <path d="M1.8 17.8a3.2 3.2 0 0 1 3.2-2.3" />
      <circle cx="19" cy="9.5" r="2" />
      <path d="M22.2 17.8a3.2 3.2 0 0 0-3.2-2.3" />
    </svg>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export function ModeSwitch(): ReactNode {
  const { editMode, setEditMode } = useAppState();

  // `master` renders as "Team" — label-only mapping, value space unchanged.
  const isPersonal = editMode === "personal";
  const isTeam = editMode === "master";

  return (
    <div
      // `modesw-fork` marks THIS as the Personal/Team fork toggle — the ONLY
      // `.modesw` the pink Team-caution glow may attach to. Other `.modesw`
      // pills (the W3.6 View↔Edit toggle) share the base recipe but must never
      // glow, or the app's single safety signal (CLAUDE.md §2/§6) is diluted.
      className="modesw modesw-fork modesw-icon glass"
      role="group"
      aria-label="Editing mode — Personal or Team Curriculum"
    >
      {/* Tooltips open downward: the pill lives at the very top of the
          viewport in both hosts, so "top" would auto-flip anyway. */}
      <Tooltip content={PERSONAL_TIP} side="bottom" required>
        <button
          type="button"
          className={"modesw-ib" + (isPersonal ? " active" : "")}
          aria-label="Personal"
          aria-pressed={isPersonal}
          onClick={() => setEditMode("personal")}
        >
          <PersonIcon />
        </button>
      </Tooltip>
      <Tooltip content={TEAM_TIP} side="bottom" required>
        {/* `team` class even at rest — chrome.css keys the brand-colored
            active treatment on `.modesw-ib.team.active`. */}
        <button
          type="button"
          className={"modesw-ib team" + (isTeam ? " active" : "")}
          aria-label="Team Curriculum"
          aria-pressed={isTeam}
          onClick={() => setEditMode("master")}
        >
          <TeamIcon />
        </button>
      </Tooltip>
    </div>
  );
}
