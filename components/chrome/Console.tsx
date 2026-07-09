"use client";

// Console.tsx — W3.4: the segmented view console (Framework §3/§9 "the
// console"; ported from the 7.2.26 bundled mockup's `Hero`/`.views.console`).
//
// One vocabulary, two mounts:
//   • <HomeConsole> — the /home landing: a greeting over the centered
//     segmented console (chrome.css `.center` / `.canvas` / `.views.console`).
//   • <CompactConsole> — a slimmed console bar atop Day/Week/Year, mounted by
//     ChromeShell route-scoped (like the botbar/quote). Suppressed on home
//     (which renders the full console) and on the immersive surfaces.
//
// ENTRIES. Day/Week/Year/Plan only — the bundle's NAV/NAV_SUB/NAV_TIP for
// those four. Post ("Resource wall") and Teach ("Present") are DEFERRED to
// their phases: WAVE-3-PLAN R6 has them enrolling in the immersive shell when
// those surfaces build (Phase 2/3), and neither has a v2 route on this branch
// (wiring them now would 404 or point the v2 console at a v1 surface). A
// recorded, deliberate divergence from the bundle's six-entry console.
//
// "Plan" → /planner (the W3.4 immersive stub), NOT the bundle's legacy
// PlanPage — the deliberate §9a divergence recorded in WAVE-3-PLAN W3.4 / R2.
//
// Navigation goes through TransitionLink so the stage photo holds while the
// content soft-swaps (the W3.2 View-Transitions contract), exactly as SideNav
// does. Each entry carries the bundle's title text as a dismissible onboarding
// tooltip (CLAUDE.md §4 — navigation, learn-once, not high-consequence).

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { TransitionLink } from "@/lib/view-transition";
import { Tooltip } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { useViewEditMode } from "@/lib/edit-mode-state";
import { useNowTick } from "@/lib/use-now-tick";

interface ConsoleEntry {
  key: string;
  href: string;
  /** The big word (`.vw-word`). */
  word: string;
  /** The caption under it (`.vw-sub`); may contain "\n" (rule is white-space:pre). */
  sub: string;
  /** Onboarding tooltip — what the surface accomplishes. */
  tip: string;
}

// Day/Week/Year/Plan. Subs + tips are the bundle's NAV_SUB / NAV_TIP verbatim.
const CONSOLE_NAV: readonly ConsoleEntry[] = [
  {
    key: "day",
    href: "/daily",
    word: "Day",
    sub: "Today",
    tip: "The Day — today’s schedule, lesson by lesson",
  },
  {
    key: "week",
    href: "/weekly",
    word: "Week",
    sub: "This week",
    tip: "The Week — all your lessons across this week",
  },
  {
    key: "year",
    href: "/year",
    word: "Year",
    sub: "Curricular\nplan",
    tip: "The Year — your curriculum plan at a glance",
  },
  {
    key: "plan",
    href: "/planner",
    word: "Plan",
    sub: "Planner\nhub",
    tip: "Planner — your planning hub: lessons, units, resources, catch-up",
  },
];

// The routes that carry the compact console. ChromeShell reads this so the
// route-scoping has a single source of truth. Home renders the full console
// (as its page); the immersive surfaces render none.
export const COMPACT_CONSOLE_ROUTES: readonly string[] = [
  "/daily",
  "/weekly",
  "/year",
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

// The segmented button row shared by both mounts. `compact` drops the captions
// and lets the chrome.css `.views.console.compact` recipe slim the padding.
function ConsoleNav({ compact = false }: { compact?: boolean }): ReactNode {
  const pathname = usePathname();
  // W3.8b force-reset: the Day nav item resets Day to View (bundle B:11978 —
  // Home→Day nav; B:11986 — the compact console's Day item resets IN PLACE
  // even when already on /daily, a "back to View" affordance). Covers BOTH
  // mounts, since HomeConsole and CompactConsole share this row. The reset
  // rides the CLICK itself — TransitionLink composes a caller's onClick
  // BEFORE its push — never a post-nav effect. Deep links (?lesson=),
  // WeeklyList/schedule jumps, the palette, and rail icons never reset.
  const { setEdit: setDayEdit } = useViewEditMode("Day");
  return (
    <div
      className={"views console" + (compact ? " compact" : "")}
      role="navigation"
      aria-label={compact ? "Views" : "Primary views"}
    >
      {CONSOLE_NAV.map((e) => {
        const active = isActive(pathname, e.href);
        return (
          <Tooltip
            key={e.key}
            content={e.tip}
            side="bottom"
            tooltipId={`console-${e.key}`}
          >
            <TransitionLink
              href={e.href}
              className={"view" + (active ? " active" : "")}
              aria-current={active ? "page" : undefined}
              onClick={e.key === "day" ? () => setDayEdit(false) : undefined}
            >
              <span className="vw-word">{e.word}</span>
              {!compact && <span className="vw-sub">{e.sub}</span>}
            </TransitionLink>
          </Tooltip>
        );
      })}
    </div>
  );
}

// ── Home landing: greeting + full console ─────────────────────────────────

/** Time-of-day greeting; computed client-side to avoid a tz/hour hydration diff. */
function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function HomeConsole(): ReactNode {
  const { currentUser } = useAppState();
  const now = useNowTick();

  // The greeting word and date derive from the hour, which can differ between
  // the server render and the client's timezone — so gate them behind a
  // post-mount flag (same SSR-safe pattern as use-home-layout / tooltip
  // dismissal). The name comes from app-state (SSR-stable) so the first paint
  // is still personalized.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const firstName = (currentUser.name || "").trim().split(/\s+/)[0] || "there";
  const greet = mounted ? greetingFor(now.getHours()) : "Welcome";
  const dateStr = now
    .toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
    .toUpperCase();

  return (
    <div className="cp-home-console">
      <div className="center">
        {/* `canvas min` (transparent): the greeting + console float over the
            stage. The bundle default is glass-light, but that frosted card
            only stays legible via the data-canvas + tone-brightness machinery
            (an appearance axis WAVE-3-PLAN R8 keeps out of this wave), so we
            use the tone-agnostic transparent canvas. Recorded divergence;
            the canvas variant becomes a W3.5 style-gear choice. */}
        <div className="canvas min">
          <h1 className="greeting">
            {greet}, {firstName}
          </h1>
          <div className="console-row">
            <ConsoleNav />
          </div>
          {mounted && <span className="eyebrow">{dateStr}</span>}
        </div>
      </div>
    </div>
  );
}

// ── Compact console: the view-nav variant atop Day/Week/Year ───────────────

export function CompactConsole(): ReactNode {
  return (
    <div className="cp-compact-console">
      <ConsoleNav compact />
    </div>
  );
}
