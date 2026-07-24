"use client";

// ChromeToolsMenu.tsx — the Tools popover (SideNav-retirement wave, R1a/c/f).
//
// The handoff's ToolsBar pattern (7.21 source-home/app.jsx `ToolsBar` +
// `.toolswrap`/`.toolsbtn`/`.toolspop`): a glass circle in the top-bar `.tools`
// cluster that expands into a segmented popover. It re-homes the utility
// destinations the retired left rail used to carry:
//   • Catch-up → fires CATCHUP_MODAL_TOGGLE_EVENT (the standalone Wave-10 modal,
//     whose CatchUpModalHost ChromeShell now mounts app-wide). NOT a route jump.
//   • Schedule → /schedule (the timetable route; still a deep-link target).
//   • Archive  → /archive  (the Curriculum Archive — sealed years, read-only).
//   • Settings → /settings (reachable from EVERY route now, per R1c — the botbar
//     gear only shows on Home+Daily).
//
// Styling: chrome.css owns everything. The trigger reuses the ported
// `.toolsbtn.toolsbtn-circle.glass` recipe and the popover the `.toolspop`/
// `.tool` recipe; the always-visible wrapper is `.toolsmenu` (distinct from the
// phone-only `.tools .toolswrap` overflow, which is display:none >480px). This
// file writes NO styles and hard-codes NO colors.
//
// The popover is NOT portaled (it lives inside `.toolsmenu`, anchored to the
// trigger like the handoff). Both the ChromeTopBar (.tools cluster) and the
// ImmersiveBar (right cluster) render it, so every route family reaches these
// destinations by click.
//
// Tooltips: the icon-only trigger + each popover item carry dismissible
// onboarding tooltips (CLAUDE.md §4 — navigation/utility, learn-once, none
// high-consequence). Catch-up/Schedule/Archive/Settings are not destructive, so
// none pass `required`.

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { TransitionLink } from "@/lib/view-transition";
import { Tooltip } from "@/components/ui";
import { CATCHUP_MODAL_TOGGLE_EVENT } from "@/components/catchup-v2";

export function ChromeToolsMenu(): ReactNode {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popId = useId();

  // Outside-click + Escape dismissal (mirrors the ChromeTopBar phone-overflow
  // recipe): pointerdown outside closes; Escape closes and restores focus to
  // the trigger so a keyboard user is never stranded on an unmounting item.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const closeAfter = (fn?: () => void) => () => {
    fn?.();
    setOpen(false);
  };

  return (
    <div className="toolsmenu" ref={rootRef}>
      <Tooltip
        content="Tools — jump to any view, plus Catch-up, Schedule, Archive, and Settings"
        side="bottom"
        tooltipId="chrome-tools-menu"
      >
        <button
          type="button"
          ref={triggerRef}
          className={"toolsbtn toolsbtn-circle glass" + (open ? " open" : "")}
          aria-label="Tools"
          aria-expanded={open}
          aria-controls={open ? popId : undefined}
          onClick={() => setOpen((v) => !v)}
        >
          <ToolsIcon />
        </button>
      </Tooltip>
      {/* Disclosure popover, NOT role="menu": a menu role promises arrow-key
          roving these four actions don't need — matching the ChromeTopBar
          phone-overflow pattern (plain controls inside a labelled group). */}
      {open && (
        <div
          id={popId}
          className="toolspop toolspop-2row"
          role="group"
          aria-label="Tools"
        >
          {/* Views row — ALWAYS present (§4a: on phones ≤600px the immersive
              routes hide the six-tab console, so without this a teacher
              cold-landing on /planner or /post has no in-app path to any
              view; on desktop it's harmless redundancy with the console). */}
          <div className="toolsrow toolsrow-views" role="group" aria-label="Views">
            {VIEWS.map((v) => (
              <TransitionLink
                key={v.href}
                href={v.href}
                className="tool"
                onClick={closeAfter()}
              >
                {v.icon}
                <span>{v.label}</span>
              </TransitionLink>
            ))}
          </div>
          <div className="toolsrow" role="group" aria-label="Utilities">
          {/* Catch-up — opens the standalone modal (not a route jump). The
              elected CatchUpModalHost (mounted by ChromeShell) owns the toggle
              listener; this only dispatches. */}
          <Tooltip
            content="Catch-up — triage every uncovered lesson: mark taught, reschedule, bump, or plan"
            side="bottom"
            tooltipId="chrome-tools-catchup"
          >
            <button
              type="button"
              className="tool"
              onClick={closeAfter(() =>
                window.dispatchEvent(
                  new CustomEvent(CATCHUP_MODAL_TOGGLE_EVENT),
                ),
              )}
            >
              <FlagIcon />
              <span>Catch-up</span>
            </button>
          </Tooltip>
          <Tooltip
            content="Schedule — your daily timetable of subjects and periods"
            side="bottom"
            tooltipId="chrome-tools-schedule"
          >
            <TransitionLink
              href="/schedule"
              className="tool"
              onClick={closeAfter()}
            >
              <ClockIcon />
              <span>Schedule</span>
            </TransitionLink>
          </Tooltip>
          <Tooltip
            content="Archive — past curriculum years, sealed and read-only"
            side="bottom"
            tooltipId="chrome-tools-archive"
          >
            <TransitionLink
              href="/archive"
              className="tool"
              onClick={closeAfter()}
            >
              <ArchiveIcon />
              <span>Archive</span>
            </TransitionLink>
          </Tooltip>
          <Tooltip
            content="Settings — curriculum, school week, academic year, holidays, appearance and more"
            side="bottom"
            tooltipId="chrome-tools-settings"
          >
            <TransitionLink
              href="/settings"
              className="tool"
              onClick={closeAfter()}
            >
              <GearIcon />
              <span>Settings</span>
            </TransitionLink>
          </Tooltip>
          </div>
          {/* Phone-only Account row (§4a round-2): ≤480px the top-bar hides
              the avatar button (its 44px overflowed 375 by 13px), so its two
              destinations live here instead. display:none above 480 via
              .toolsrow-account. Sign out reuses the same /auth/signout POST
              the avatar menu uses. */}
          <div
            className="toolsrow toolsrow-account"
            role="group"
            aria-label="Account"
          >
            <TransitionLink
              href="/settings/account"
              className="tool"
              onClick={closeAfter()}
            >
              <UserIcon />
              <span>Account</span>
            </TransitionLink>
            <form action="/auth/signout" method="post" className="tool-form">
              <button type="submit" className="tool">
                <SignOutIcon />
                <span>Sign out</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// The six primary views — the console's tab set, mirrored here as the
// always-available fallback (short labels keep the phone row inside 375px).
const VIEWS: { href: string; label: string; icon: ReactNode }[] = [
  { href: "/daily", label: "Day", icon: <SunIcon /> },
  { href: "/weekly", label: "Week", icon: <ColumnsIcon /> },
  { href: "/year", label: "Year", icon: <CalendarIcon /> },
  { href: "/planner", label: "Plan", icon: <BookIcon /> },
  { href: "/post", label: "Post", icon: <ImageIcon /> },
  { href: "/boards", label: "Teach", icon: <MonitorIcon /> },
];

// ── Icons (Lucide-family line icons; the `.toolspop .tool svg` recipe sizes
//    them). aria-hidden — the wrapping controls carry the accessible names. ──

function svgProps() {
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

// Grid-of-tiles — reads as "tools / more apps"; distinct from the phone
// overflow's horizontal dots so the two menus never read as the same control.
function ToolsIcon(): ReactNode {
  return (
    <svg {...svgProps()}>
      <rect x="3" y="3" width="7" height="7" rx="1.6" />
      <rect x="14" y="3" width="7" height="7" rx="1.6" />
      <rect x="3" y="14" width="7" height="7" rx="1.6" />
      <rect x="14" y="14" width="7" height="7" rx="1.6" />
    </svg>
  );
}
function FlagIcon(): ReactNode {
  return (
    <svg {...svgProps()}>
      <path d="M4 21V4h11l-1.5 4L15 12H4" />
    </svg>
  );
}
function ClockIcon(): ReactNode {
  return (
    <svg {...svgProps()}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}
function ArchiveIcon(): ReactNode {
  return (
    <svg {...svgProps()}>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </svg>
  );
}
function GearIcon(): ReactNode {
  return (
    <svg {...svgProps()}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8 6 18M18 6l1.8-1.8" />
    </svg>
  );
}
function SunIcon(): ReactNode {
  return (
    <svg {...svgProps()}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function ColumnsIcon(): ReactNode {
  return (
    <svg {...svgProps()}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M15 4v16" />
    </svg>
  );
}
function CalendarIcon(): ReactNode {
  return (
    <svg {...svgProps()}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}
function BookIcon(): ReactNode {
  return (
    <svg {...svgProps()}>
      <path d="M12 6.5C10.6 5 8.6 4 6 4H3v14h3.5c2.3 0 4.1.8 5.5 2 1.4-1.2 3.2-2 5.5-2H21V4h-3c-2.6 0-4.6 1-6 2.5Z" />
      <path d="M12 6.5V20" />
    </svg>
  );
}
function ImageIcon(): ReactNode {
  return (
    <svg {...svgProps()}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m5 18 5-5 3 3 3-3 3 3" />
    </svg>
  );
}
function MonitorIcon(): ReactNode {
  return (
    <svg {...svgProps()}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M9 20h6M12 16v4" />
    </svg>
  );
}
function UserIcon(): ReactNode {
  return (
    <svg {...svgProps()}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </svg>
  );
}
function SignOutIcon(): ReactNode {
  return (
    <svg {...svgProps()}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </svg>
  );
}
