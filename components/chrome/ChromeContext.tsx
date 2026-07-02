"use client";

// ChromeContext — the bottom-left "where am I?" chip of the v2 corner
// grammar (W3.3), plus the Help / Settings gear pair.
//
// Faithful port of the 7.2.26 bundled mockup's `.botbar > .ctx.glass` block
// (mockup/New v2 Site Design.bundled.html ~line 12007; V2 Framework.md §3
// "the spatial model"): identity avatar dot → school/grade/week stack →
// Help gear → Settings gear. The CSS vocabulary lives in app/chrome.css
// (the W3.3a/W3.3b inert port) — this file consumes it and writes NO CSS.
//
// ── CSS-vocabulary gap (flagged, not worked around) ──────────────────────
// Two 7.2 recipes this markup references are NOT yet in app/chrome.css:
//   • `.ctx .cdot-av` — the 34px identity-avatar disc (the 7.2 upgrade of
//     the plain 8px `.cdot`; bundle home.css "lower-left identity avatar
//     (was a plain dot)").
//   • `.ctx-gear`     — the 30px hover-rotate gear button (bundle CSS
//     ~line 2814).
// Until the chrome.css owner lands that additive delta (a W3.3b follow-up),
// the avatar degrades to the 6.24 `.cdot` dot and the gears render
// unstyled-but-functional. Markup is bundle-exact so the delta port is a
// pure CSS change — no component edit needed. TODO(W3.3-followup): confirm
// the `.cdot-av` / `.ctx-gear` recipes landed in chrome.css.
//
// ── Data seams (never hard-code — CLAUDE.md §1) ──────────────────────────
//   • School name — the mockup's "Awsaj Academy" is SAMPLE DATA (its mock
//     `team.school` field). The app has NO school/team label source yet
//     (checked lib/app-state + lib/labels 2026-07-02): the nearest real
//     field is `currentUser.curriculumLabel` (team-scoped, e.g. "Grade 5").
//     SEAM: when a team/school label lands (Phase 1B `team_settings`),
//     promote it to `.ctop` and demote curriculumLabel into `.csub`
//     ("Grade 5 · Week 12"), matching the bundle's two-line layout.
//   • Grade — `currentUser.curriculumLabel` (useAppState). Free text, not
//     a grade enum (multi-grade by design).
//   • Unit — the bundle shows "Unit 3", but there is no cheap
//     current-unit source (each subject has its OWN current unit; deriving
//     one app-wide unit from the planner store would be an invention).
//     SEAM: omitted until a canonical current-unit selector exists — do
//     NOT fake one.
//   • Week — `useAppState().week`, the same value the shell top-bar's
//     "Week N" heading reads (seeded from the mock CURRENT_WEEK today;
//     Phase 1B derives it from the academic calendar). The "Week" word
//     itself comes from useLabels() — schools can rename the hierarchy
//     terms (Week → Module), so the chip follows the configured term.
//
// ── Control wiring ───────────────────────────────────────────────────────
//   • Help gear — Tooltip-carried explanation IS the v1 behavior (the
//     mockup's title= maps onto the Tooltip primitive per the chrome.css
//     port header). The click target is a no-op until the help overlay
//     ships. Marked `required` like the top-bar Help button (Help is the
//     safety net — never dismissible).
//   • Settings gear — TransitionLink to /settings (the W3.2 soft-swap
//     Link), the same canonical Settings entry the top-bar avatar uses.
//     The mockup opens its config modal in place; the app's Settings is a
//     route, so navigation is the correct mapping.
//
// Raw <button>/<TransitionLink> with the mockup's `.ctx-gear` class instead
// of the Button primitive: chrome.css is a class-vocabulary port and the
// Button variants (qualified with `.btn`) would fight the ported recipe —
// same reasoning as the `.backbtn`/`.iconbtn` chrome controls. The Tooltip
// contract (CLAUDE.md §4) still applies in full below.

import type { ReactNode } from "react";
import { useAppState } from "@/lib/app-state";
import { useLabels } from "@/lib/labels";
import { Tooltip } from "@/components/ui";
import { SHORTCUTS_TOGGLE_EVENT } from "@/components/shell";
import { TransitionLink } from "@/lib/view-transition";

/** Bottom-left context chip: identity avatar + school/grade/week stack +
 *  Help and Settings gears. Mount inside the chrome host's `.botbar`. */
export function ChromeContext(): ReactNode {
  const { currentUser, week } = useAppState();

  // Renameable hierarchy caption — a school may rename "Week" → "Module",
  // so the chip follows the configured term (same as the top-bar heading).
  const labels = useLabels();

  // Line assembly. With no school-label source (seam above), the
  // curriculum label is promoted to the top line and the week line drops
  // to `.csub`. When no curriculum label is configured at all, the week
  // line IS the top line — the chip never renders an empty `.ctop`.
  const weekLine = `${labels.week} ${week}`;
  const topLine = currentUser.curriculumLabel ?? weekLine;
  const subLine = currentUser.curriculumLabel ? weekLine : null;

  // First letter of the teacher's monogram for the avatar disc — the
  // bundle renders the display name's first character when no photo is
  // set; `initials` is derived from the same name in lib/app-state.
  const avatarInitial = currentUser.initials.charAt(0);

  const chipTip = "Your school, grade and where you are in the year";

  return (
    // The chip itself is a passive label (only the gears are interactive),
    // so the named-panel explanation rides on title= (CLAUDE.md §4 panel
    // rule: touch users long-press the root) plus a dismissible Tooltip on
    // the text stack for the desktop hover/focus path.
    <div className="ctx glass" title={chipTip}>
      {/* Identity avatar dot — Google photo when the session supplies one,
          initial monogram otherwise. Inline backgroundImage mirrors the
          bundle exactly (the URL is data, not a style token). aria-hidden:
          purely decorative — the teacher's name/settings live on the
          top-bar avatar, and this dot duplicates that identity signal. */}
      <span
        className="cdot cdot-av"
        aria-hidden="true"
        style={
          currentUser.avatarUrl
            ? {
                backgroundImage: `url('${currentUser.avatarUrl}')`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        {!currentUser.avatarUrl && avatarInitial}
      </span>

      <Tooltip content={chipTip} side="top" tooltipId="chrome-context-chip">
        <span className="cstack">
          <span className="ctop">{topLine}</span>
          {subLine !== null && <span className="csub">{subLine}</span>}
        </span>
      </Tooltip>

      {/* Help gear. The tooltip IS the v1 feature (hover-to-learn); the
          click opens nothing yet. `required` — Help is the safety net,
          mirroring the top-bar Help button's always-on tooltip. */}
      <Tooltip
        content="Help — hover any control to learn what it does"
        side="top"
        tooltipId="chrome-ctx-help"
        required
      >
        <button
          type="button"
          className="ctx-gear"
          aria-label="Help"
          onClick={() => {
            // Same wire the retired TopBar Help button used: GlobalShortcuts
            // (mounted in this layout) listens for this event and toggles the
            // route-aware shortcuts/help overlay (§4a finding #7).
            window.dispatchEvent(new CustomEvent(SHORTCUTS_TOGGLE_EVENT));
          }}
        >
          <HelpGlyph />
        </button>
      </Tooltip>

      {/* Settings gear → /settings via the W3.2 soft-swap link. */}
      <Tooltip
        content="Settings — set up your curriculum, school week, academic year, holidays, appearance and more"
        side="top"
        tooltipId="chrome-ctx-settings"
      >
        <TransitionLink
          href="/settings"
          className="ctx-gear"
          aria-label="Open Settings"
        >
          <GearGlyph />
        </TransitionLink>
      </Tooltip>
    </div>
  );
}

// ── SVG glyphs ───────────────────────────────────────────────────────────
// Bundle-faithful inline SVGs (the `.ctx-gear svg` recipe sizes them);
// aria-hidden because the wrapping controls carry the accessible names.

// Question-mark in a circle — the canonical Help glyph (same path as the
// top-bar HelpIcon so the two Help affordances read as siblings).
function HelpGlyph(): ReactNode {
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
      <circle cx="12" cy="12" r="10" />
      <path d="M9.5 9a2.5 2.5 0 1 1 4.5 1.5c-.7.5-1.5 1-1.5 2.5" />
      <line x1="12" y1="17" x2="12" y2="17.5" />
    </svg>
  );
}

// Cog — byte-faithful to the bundle's settings gear path.
function GearGlyph(): ReactNode {
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
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </svg>
  );
}
