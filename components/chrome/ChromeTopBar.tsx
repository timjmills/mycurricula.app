"use client";

// ChromeTopBar.tsx — the v2 corner-grammar top bar (W3.3).
//
// The non-immersive chrome's top row, per the 7.2.26 bundled mockup
// (mockup/New v2 Site Design.bundled.html — the handoff's look/behavior
// authority; the modular source/ tree is stale for the shell) and
// V2 Framework §3's spatial grammar:
//
//   left  — `.topbar-left`: the brand chip (honey-tile glyph + wordmark,
//           links home) and the in-bar ViewTitle host (the title + style
//           gear no longer live in the view body — 7.2 change).
//   right — `.tools` cluster: Personal/Team icon toggle + notification
//           bell. The 6.24 planner icon button was REMOVED in 7.2
//           (WAVE-3-PLAN §1 W3.3a note — `.iconbtn-planner` is dead
//           vocabulary; do not resurrect it).
//
// Styling: chrome.css owns everything (`.topbar`, `.topbar-left`, `.brand`,
// `.glass`, `.wm`/`.tld`, `.tools` + the ≤720px rule that hides the
// wordmark so the in-bar title wins on phone). This file writes NO styles.
// The host (the W3.2 persistent shell's `.overlay` grid) supplies the
// positioning context; this bar is just the grid's top row.
//
// Slots, not opinions:
//   • `title` — the W3.5 ViewTitle + per-view style-gear host. Rendered
//     verbatim inside `.topbar-left` after the brand; nothing else is
//     mounted there yet (W3.5 wires the actual ViewTitle component).
//   • `tools` — the W3.6 View↔Edit toggle mount point (Day/Week only).
//     Rendered as the FIRST child of `.tools`, ahead of the Personal/Team
//     ModeSwitch (bundle `.tools` order: [View/Edit] → [Personal/Team] →
//     [ToolsBar] → [NotifBell]). ChromeShell decides whether to pass it; a
//     non-Day/Week route passes nothing and the cluster is byte-identical to
//     its pre-W3.6 shape.
//
// Navigation: the brand links home via TransitionLink so the photo holds
// while the content soft-swaps (the W3.2 View-Transitions contract). W3.4
// retargets it to "/home" — the landing console now lives there.
//
// The glyph: the bundle's LOGO_SVG artwork, inlined. SideNav's BookGlyph
// is module-private (not exported), so we carry our own copy following the
// same convention — page fills go through the themable --logo-book-* tokens
// via inline style (SVG `fill` presentation attributes don't resolve
// var()); the tokens' resting values ARE the bundle's literal fills
// (#fff / #3A2A05), so this is bundle-faithful AND theme-aware, with no
// hard-coded colors in the component.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { TransitionLink } from "@/lib/view-transition";
import { Tooltip } from "@/components/ui";
import {
  NotificationBell,
  PALETTE_TOGGLE_EVENT,
  TeamModeIntro,
} from "@/components/shell";
import { useAppState } from "@/lib/app-state";
import { ModeSwitch } from "./ModeSwitch";

// ── Brand glyph (bundle LOGO_SVG, themable fills) ─────────────────────────

function LogoGlyph(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z"
        style={{ fill: "var(--logo-book-a)" }}
      />
      <path
        d="M13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13V4Z"
        style={{ fill: "var(--logo-book-b)" }}
      />
    </svg>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export interface ChromeTopBarProps {
  /**
   * The `.topbar-left` slot — the W3.5 ViewTitle + per-view style-gear
   * host. Rendered after the brand chip. Omit on the home surface (the
   * bundle renders the title only when a view is open).
   */
  title?: ReactNode;
  /**
   * The leading `.tools` slot — the W3.6 View↔Edit toggle (Day/Week only).
   * Rendered as the FIRST child of `.tools`, immediately before the
   * Personal/Team ModeSwitch (bundle order). Omit on every other route.
   */
  tools?: ReactNode;
}

export function ChromeTopBar({ title, tools }: ChromeTopBarProps): ReactNode {
  const {
    todoPanelOpen,
    commentsPanelOpen,
    toggleTodoPanel,
    toggleCommentsPanel,
  } = useAppState();

  // ── Phone overflow menu (≤480) ────────────────────────────────────────
  // The task-#12 collapse hides the To-dos + Team Shoutbox iconbtns at ≤480
  // so the cluster fits the viewport; this `.toolswrap` menu (the bundle's
  // inert popover vocabulary, first consumer) restores both behind a single
  // "More tools" trigger so phones lose nothing. The wrapper itself is
  // display:none above 480px (chrome.css), so this renders inert on
  // tablet/desktop where the inline buttons are back.
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const moreTriggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (e: PointerEvent): void => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        setMoreOpen(false);
        // A keyboard user may be focused on a menu item that is about to
        // unmount — without this, focus falls to <body> and they are
        // stranded in the tab order (§4a finding).
        moreTriggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen]);

  return (
    <header className="topbar">
      <div className="topbar-left">
        {/* Brand chip → home. The bundle's title="Home" maps onto the
            Tooltip primitive (dismissible — a wordmark that links home is
            learn-once chrome, not a high-consequence control). */}
        <Tooltip content="Home" side="bottom" tooltipId="chrome-brand-home">
          <TransitionLink
            href="/home"
            className="brand glass"
            aria-label="mycurricula.app home"
          >
            <span className="glyph" aria-hidden="true">
              <LogoGlyph />
            </span>
            <span className="wm">
              mycurricula<span className="tld">.app</span>
            </span>
          </TransitionLink>
        </Tooltip>
        {/* W3.5 ViewTitle + gear land here; nothing else in this slot yet. */}
        {title}
      </div>
      <div className="tools">
        {/* Right cluster, bundle order: mode toggle → tools bar → bell.
            The ToolsBar launcher is not in W3.3's scope — it mounts between
            these two when its wave lands. NO planner icon button (removed
            in 7.2).

            INTERIM (§4a W3.3 findings #1/#8): the search, To-do, and Team
            Shoutbox affordances below re-home the retired v1.3 TopBar's only
            entry points to those surfaces — without them the ⌘K palette is
            keyboard-only and the To-do/Shoutbox right-panel views are
            unreachable. They use the bundle's .iconbtn recipe and yield to
            the ToolsBar when it lands (the bundle folds these into it). */}
        {/* W3.6 View↔Edit toggle mount point — first in `.tools` (bundle
            order), ahead of the Personal/Team ModeSwitch. Present only on
            Day/Week; ChromeShell passes undefined elsewhere. */}
        {tools}
        <ModeSwitch />
        {/* First-switch Team-mode explainer (W2-B1 safety layer 1) — fires
            once, anchored under the toggle; reads editMode itself. Kept
            alongside the glow replacing the MasterBanner (layer 2), per the
            §4a W3.3 gate (finding #3). */}
        <TeamModeIntro />
        <Tooltip
          content="Search lessons, units, and standards (⌘K)"
          side="bottom"
          tooltipId="chrome-search"
        >
          <button
            type="button"
            className="iconbtn"
            aria-label="Search"
            onClick={() =>
              window.dispatchEvent(new CustomEvent(PALETTE_TOGGLE_EVENT))
            }
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.6-3.6" />
            </svg>
          </button>
        </Tooltip>
        <Tooltip
          content="Your to-do list — tasks and reminders across the week"
          side="bottom"
          tooltipId="chrome-todos"
        >
          <button
            type="button"
            className="iconbtn"
            data-tool="todos"
            aria-label="To-dos"
            aria-pressed={todoPanelOpen}
            onClick={toggleTodoPanel}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 6h11" />
              <path d="M9 12h11" />
              <path d="M9 18h11" />
              <path d="m4 5 1 1 2-2" />
              <path d="m4 11 1 1 2-2" />
              <path d="m4 17 1 1 2-2" />
            </svg>
          </button>
        </Tooltip>
        <Tooltip
          content="Team Shoutbox — comments and messages from your teaching team"
          side="bottom"
          tooltipId="chrome-shoutbox"
        >
          <button
            type="button"
            className="iconbtn"
            data-tool="team-shoutbox"
            aria-label="Team Shoutbox"
            aria-pressed={commentsPanelOpen}
            onClick={toggleCommentsPanel}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.9-.9L3 20l1-4.9a8.3 8.3 0 0 1-1-4A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z" />
            </svg>
          </button>
        </Tooltip>
        {/* Phone-only (≤480) overflow for the two iconbtns the task-#12
            collapse hides. Uses the bundle's .toolswrap/.toolsbtn/.toolspop
            glass-popover recipe; chrome.css keeps the wrapper display:none
            above 480px. */}
        <div className="toolswrap" ref={moreRef}>
          <Tooltip
            content="More tools — your to-dos and the Team Shoutbox"
            side="bottom"
            tooltipId="chrome-more-tools"
          >
            <button
              type="button"
              ref={moreTriggerRef}
              className={"toolsbtn toolsbtn-circle" + (moreOpen ? " open" : "")}
              aria-label="More tools"
              aria-expanded={moreOpen}
              aria-controls="chrome-more-tools-pop"
              onClick={() => setMoreOpen((v) => !v)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="5" cy="12" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="19" cy="12" r="1.6" />
              </svg>
            </button>
          </Tooltip>
          {moreOpen && (
            // Disclosure pattern (aria-expanded + aria-controls on the
            // trigger): plain buttons inside a labelled group — NOT
            // role="menu", which would promise arrow-key semantics these
            // two actions don't need (§4a finding).
            <div
              id="chrome-more-tools-pop"
              className="toolspop"
              role="group"
              aria-label="More tools"
            >
              <button
                type="button"
                className="tool"
                aria-pressed={todoPanelOpen}
                onClick={() => {
                  toggleTodoPanel();
                  setMoreOpen(false);
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9 6h11" />
                  <path d="M9 12h11" />
                  <path d="M9 18h11" />
                  <path d="m4 5 1 1 2-2" />
                  <path d="m4 11 1 1 2-2" />
                  <path d="m4 17 1 1 2-2" />
                </svg>
                <span>To-dos</span>
              </button>
              <button
                type="button"
                className="tool"
                aria-pressed={commentsPanelOpen}
                onClick={() => {
                  toggleCommentsPanel();
                  setMoreOpen(false);
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.9-.9L3 20l1-4.9a8.3 8.3 0 0 1-1-4A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z" />
                </svg>
                <span>Shoutbox</span>
              </button>
            </div>
          )}
        </div>
        <NotificationBell />
      </div>
    </header>
  );
}
