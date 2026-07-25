"use client";

// ViewTitle.tsx — W3.5: the per-view title + style gear.
//
// Mounts via ChromeShell's title slot into `.topbar-left` (Day/Week/Year,
// after the brand) and `.immersbar-left` (Plan, after the Back button). Renders
// the view's name (`.view-title`) + a gear (`.vt-cogbtn`) that opens a portal
// `.vt-menu` popover hosting the shared AppearanceControls. See the 7.2.26
// bundle's `ViewTitle` (mockup) and WAVE-3-PLAN W3.5.
//
// SCOPE (user decision, recorded): the appearance controls write WHOLE-SITE
// (global) only. The bundle's "This page / Whole site" scope toggle + per-view
// override (`cc_pagebg`) is DEFERRED to its own dedicated wave — the app has no
// per-view override layer and W3.5 must NOT touch the SSR/last-writer-wins
// theme engine as a side-effect. So: no `.vt-scope` toggle, the heading reads
// "Appearance", and the gear's copy says "applies to the whole app". The
// per-view extras slot (where W3.8c's Week Aligned/Stacked toggle plugs in) is
// marked in the menu below.
//
// AppearanceControls is presentation-only and writes global appearance through
// useTheme() (components/appearance/appearance-controls.tsx) — its own header
// names "the per-heading style cog popover" as an intended `compact` consumer,
// so this is the sanctioned reuse, not a fork.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { AppearanceControls } from "@/components/appearance/appearance-controls";
import { Tooltip } from "@/components/ui";
import { WeekLayoutToggle } from "./WeekLayoutToggle";

// Route → display title. Only the routes that carry a ViewTitle today
// (Day/Week/Year in the top bar; Plan in the immersbar). Home renders the
// console instead (no ViewTitle); other surfaces show the brand alone. Prefix
// match so nested routes keep their title. "Planner hub" (not the bundle's
// "Lesson Plan") matches the app's W3.4 /planner surface (recorded divergence).
const VIEW_TITLES: readonly { match: string; title: string }[] = [
  { match: "/daily", title: "The Day" },
  { match: "/weekly", title: "The Week" },
  { match: "/year", title: "The Year" },
  { match: "/planner", title: "Planner hub" },
  // W9a enrollment (the "Post/Teach enroll with their surfaces" seam above):
  // /post is IMMERSIVE_PREFIXES-listed, so its name lives in the immersbar
  // slot — the wall renders no title of its own.
  { match: "/post", title: "Resource Wall" },
];

// The bundle's settings-cog glyph, inlined (24×24, currentColor).
function GearIcon(): ReactNode {
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

// Menu geometry (mirrors the bundle's clamp; .vt-menu-full is 332px wide).
const MENU_W = 332;

export function ViewTitle(): ReactNode {
  const pathname = usePathname();
  const entry = VIEW_TITLES.find(
    (v) => pathname === v.match || pathname.startsWith(v.match + "/"),
  );

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const cogRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Portal target (document.body) only exists client-side.
  useEffect(() => setMounted(true), []);

  // Close on Escape or a click outside both the cog and the menu.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (cogRef.current?.contains(t) || popRef.current?.contains(t)) return;
      // Each appearance option renders a dismissible Tooltip whose bubble
      // portals to <body> OUTSIDE popRef (role="tooltip") and carries an
      // interactive "Turn off these tips" link. A mousedown there must NOT
      // close this menu — otherwise the menu unmounts before the link's click
      // fires, defeating tip-dismissal (§4a W3.5 finding #1).
      const el = t instanceof Element ? t : t.parentElement;
      if (el?.closest('[role="tooltip"]')) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus(); // restore focus to the trigger (APG dialog)
      }
    };
    // A resize while open leaves the fixed menu at a stale anchor — the
    // simplest correct behavior is to close it (§4a W3.5 finding #4).
    const onResize = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  // Move focus INTO the menu when it opens so keyboard users reach the
  // (body-portaled) controls without tabbing through the whole page; Escape
  // returns focus to the gear (§4a W3.5 finding #2).
  useEffect(() => {
    if (open) popRef.current?.focus();
  }, [open]);

  // A route change (e.g. clicking the compact console) closes the menu so it
  // never lingers over the next view.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // No title for this route (home, settings, and the secondary surfaces) →
  // render nothing; the top bar shows the brand alone.
  if (!entry) return null;

  const toggle = () => {
    if (!open && cogRef.current) {
      const r = cogRef.current.getBoundingClientRect();
      // Anchor under the cog, clamped on-screen. Both bars sit at the top, so
      // `r.bottom` is always small; the menu's own max-height + scroll handle
      // a tall control list.
      setPos({
        left: Math.max(8, Math.min(r.left, window.innerWidth - MENU_W - 8)),
        top: Math.min(r.bottom + 8, window.innerHeight - 280),
      });
    }
    setOpen((o) => !o);
  };

  return (
    <div className="view-titlebar">
      <h1 className="view-title">{entry.title}</h1>
      <span className="vt-cog" ref={cogRef}>
        <Tooltip
          content="Appearance — theme, frame & background (applies to the whole app)"
          side="bottom"
          tooltipId="viewtitle-style-gear"
          // The gear sits in the top bar directly above the console nav, with
          // ~15px between them and a bubble ~74px tall — so a bottom-opening
          // tooltip used to bury the whole route switcher (83% of it at
          // 375px). Naming the nav lets the primitive slide the bubble clear.
          // `.views.console` is ConsoleNav's root (components/chrome/
          // Console.tsx); the selector covers all three of its mounts (home,
          // the compact bar, the immersive bar) without the shell having to
          // thread a ref across sibling subtrees.
          //
          // `.vt-menu` is defence in depth for the appearance popover below.
          // Opening it moves focus into the dialog, which blurs the gear and
          // closes this bubble — verified live, 0 of 17 menu controls
          // hit-blocked at 768 and 1440. But that safety lives in ANOTHER
          // component's focus effect, and the bubble now slides down into the
          // menu's rows rather than sitting above them, so the consequence of
          // losing it got worse. Naming the menu makes the overlap
          // structurally impossible instead of merely currently-absent. It
          // matches nothing while the menu is closed, so it costs nothing.
          avoid=".views.console, .vt-menu"
        >
          {/* Bare <button>: `.vt-cogbtn` is the complete handoff recipe; the ui
              Button primitive's `.btn` base would fight it (same reasoning as
              ModeSwitch / ib-exit). */}
          <button
            ref={btnRef}
            type="button"
            className="vt-cogbtn"
            aria-label="Appearance"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={toggle}
          >
            <GearIcon />
          </button>
        </Tooltip>
        {mounted &&
          open &&
          pos &&
          createPortal(
            <div className="vt-menuwrap">
              <div
                className="vt-menu vt-menu-full"
                ref={popRef}
                role="dialog"
                aria-label="Appearance"
                tabIndex={-1}
                style={{ left: pos.left, top: pos.top }}
              >
                <div className="vt-menuh">Appearance</div>
                {/* W3.8c: per-view extras mount here, above the shared controls.
                    WeekLayoutToggle self-gates to /weekly (renders null
                    elsewhere), so it is safe to mount unconditionally. */}
                <WeekLayoutToggle />
                <AppearanceControls compact />
              </div>
            </div>,
            document.body,
          )}
      </span>
    </div>
  );
}
