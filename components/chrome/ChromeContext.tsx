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

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useAppState } from "@/lib/app-state";
import { useLabels } from "@/lib/labels";
import { useNotebookState } from "@/lib/notebook-state";
import { Tooltip } from "@/components/ui";
import { SHORTCUTS_TOGGLE_EVENT } from "@/components/shell";
import { TransitionLink } from "@/lib/view-transition";

const VIEWPORT_MARGIN = 8;
const MENU_GAP = 10;

/** Bottom-left context chip: identity avatar + school/grade/week stack +
 *  Help and Settings gears. Mount inside the chrome host's `.botbar`.
 *
 *  R1e (USER decision): the identity cluster (avatar + stack) is now an
 *  INTERACTIVE trigger that opens the workspace / notebook switcher — the
 *  behavior the retired left rail's NotebookSwitcher used to carry. Multi-
 *  workspace is live, so a teacher with ≥2 notebooks switches here; everyone
 *  reaches full workspace management via "Manage workspace" → /settings/workspace
 *  (reachable from every route through Settings). The chip shows on Home+Daily
 *  (its current botbar scope); the gears stay as-is. */
export function ChromeContext(): ReactNode {
  const { currentUser, week } = useAppState();
  const {
    workspaceName,
    activeNotebooks,
    activeNotebookId,
    setActiveNotebookId,
    isWorkspaceAdmin,
  } = useNotebookState();

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

  const chipTip =
    "Your workspace and where you are in the year — click to switch";

  // ── Switcher menu (portaled, ResMenu pattern) ─────────────────────────────
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => setOpen(false), []);
  const restoreFocus = useCallback(() => {
    if (triggerRef.current?.isConnected) {
      triggerRef.current.focus({ preventScroll: true });
    }
  }, []);

  // The chip lives at the bottom-left, so the menu opens ABOVE the trigger,
  // left-aligned; clamp to the viewport once measured.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const tr = trigger.getBoundingClientRect();
    const { width, height } = menu.getBoundingClientRect();
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(tr.left, window.innerWidth - width - VIEWPORT_MARGIN),
    );
    const top = Math.max(VIEWPORT_MARGIN, tr.top - height - MENU_GAP);
    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(t) &&
        !triggerRef.current?.contains(t)
      ) {
        close();
      }
    };
    const onDetach = (): void => close();
    document.addEventListener("mousedown", onDown, true);
    window.addEventListener("scroll", onDetach, true);
    window.addEventListener("resize", onDetach);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("scroll", onDetach, true);
      window.removeEventListener("resize", onDetach);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    menuRef.current
      ?.querySelector<HTMLElement>('[role="menuitem"],[role="menuitemradio"]')
      ?.focus({ preventScroll: true });
  }, [open]);

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      restoreFocus();
      return;
    }
    if (e.key === "Tab") {
      close();
      restoreFocus();
      return;
    }
    if (
      e.key !== "ArrowDown" &&
      e.key !== "ArrowUp" &&
      e.key !== "Home" &&
      e.key !== "End"
    ) {
      return;
    }
    e.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"],[role="menuitemradio"]',
      ) ?? [],
    );
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? items.length - 1
          : e.key === "ArrowDown"
            ? idx < 0
              ? 0
              : (idx + 1) % items.length
            : idx <= 0
              ? items.length - 1
              : idx - 1;
    items[next]?.focus();
  };

  const isMulti = activeNotebooks.length >= 2;

  const switcherMenu = open ? (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Workspace and notebooks"
      className="chrome-menu chrome-switch-menu"
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 1000 }}
      onKeyDown={onMenuKeyDown}
    >
      <div className="chrome-menu-head" aria-hidden="true">
        <span className="chrome-menu-name">{workspaceName}</span>
        {isMulti && <span className="chrome-menu-sub">Switch notebook</span>}
      </div>
      {isMulti &&
        activeNotebooks.map((nb) => {
          const active = nb.gradeLevelId === activeNotebookId;
          return (
            <button
              key={nb.gradeLevelId}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              tabIndex={-1}
              className={
                "chrome-menu-item" + (active ? " chrome-menu-item-active" : "")
              }
              onClick={() => {
                setActiveNotebookId(nb.gradeLevelId);
                close();
                restoreFocus();
              }}
            >
              <span className="chrome-menu-check" aria-hidden="true">
                {active ? <CheckIcon /> : null}
              </span>
              <span>{nb.name}</span>
            </button>
          );
        })}
      {isMulti && (
        <div className="chrome-menu-sep" role="separator" aria-hidden="true" />
      )}
      <TransitionLink
        href="/settings/workspace"
        role="menuitem"
        tabIndex={-1}
        className="chrome-menu-item"
        onClick={() => close()}
      >
        <SlidersIcon />
        <span>Manage workspace</span>
      </TransitionLink>
      {isWorkspaceAdmin && (
        <TransitionLink
          href="/settings/team"
          role="menuitem"
          tabIndex={-1}
          className="chrome-menu-item"
          onClick={() => close()}
        >
          <PlusIcon />
          <span>New notebook</span>
        </TransitionLink>
      )}
    </div>
  ) : null;

  return (
    // The gears stay interactive siblings; the identity cluster is now the
    // switcher trigger. The named-panel explanation rides on title= (CLAUDE.md
    // §4 panel rule: touch users long-press the root).
    <div className="ctx glass" title={chipTip}>
      <Tooltip
        content="Switch your workspace or notebook, or manage workspace settings"
        side="top"
        tooltipId="chrome-context-switch"
      >
        <button
          type="button"
          ref={triggerRef}
          className="ctx-switch"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Workspace: ${workspaceName}. Switch workspace or notebook`}
          onClick={() => setOpen((v) => !v)}
        >
          {/* Identity avatar dot — Google photo when the session supplies one,
              initial monogram otherwise. aria-hidden: decorative (the button's
              aria-label carries the name). */}
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
          <span className="cstack">
            <span className="ctop">{topLine}</span>
            {subLine !== null && <span className="csub">{subLine}</span>}
          </span>
          <ChevronIcon />
        </button>
      </Tooltip>

      {switcherMenu && typeof document !== "undefined"
        ? createPortal(switcherMenu, document.body)
        : null}

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

// ── Switcher glyphs (chip trigger + menu) ──────────────────────────────────
function stroke() {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}
function ChevronIcon(): ReactNode {
  return (
    <svg {...stroke()} className="ctx-switch-chev">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
function CheckIcon(): ReactNode {
  return (
    <svg {...stroke()} strokeWidth={2.4}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function SlidersIcon(): ReactNode {
  return (
    <svg {...stroke()}>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
    </svg>
  );
}
function PlusIcon(): ReactNode {
  return (
    <svg {...stroke()}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
