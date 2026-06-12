"use client";

// Settings section layout — a 2-column shell with a small sidebar listing
// the sub-pages on the left and the active sub-page rendered on the right.
//
// Sub-pages (in display order):
//   • Curriculum       — TEAM-shared curriculum identity (label + months).
//                        Default landing page.
//   • Appearance       — USER theme + palette + hierarchy labels.
//   • Catch-up         — USER catch-up cue toggle.
//   • Lesson templates — USER custom lesson-flow templates.
//
// On every sub-page mount we write that page's slug to localStorage under
// `mycurricula:settings-last-page` so the /settings landing page (see
// app/settings/page.tsx) can redirect to wherever the teacher last was.
//
// The sidebar is a real <nav> with <Link>s; the active entry carries
// `aria-current="page"` and a visible active treatment. On phone the
// sidebar collapses to a horizontal scroll-strip above the content so
// every entry stays reachable without eating ~30% of the viewport height
// (CLAUDE.md §4 responsive contract).

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppStateProvider } from "@/lib/app-state";
import { ConsequenceToastProvider } from "@/lib/consequence-toast";
import { Clock } from "@/components/shell/Clock";
import { ThemeQuickSwitch } from "@/components/appearance/theme-quick-switch";
import styles from "./layout.module.css";

// ── Sub-page registry ──────────────────────────────────────────────────────
// Order = display order in the sidebar AND the redirect default cascade.
// "Curriculum" sits first because it's the default landing page for a
// teacher who has never visited Settings before.
interface SettingsTab {
  slug: string;
  label: string;
  href: string;
  /** W2-B7: scope chip rendered next to the label. "team" → settings
   *  whose changes are shared with every teacher on the team. "personal"
   *  → settings that only affect this teacher's view. Vocabulary follows
   *  Unified Audit Decision #2 ("Personal" / "Team Curriculum"), not
   *  TEAM/YOU. Catch-up is "personal" per Decision #7 (the recent scope
   *  clarification). */
  scope: "personal" | "team";
}

const TABS: readonly SettingsTab[] = [
  {
    slug: "curriculum",
    label: "Curriculum",
    href: "/settings/curriculum",
    scope: "team",
  },
  {
    slug: "team",
    label: "Team",
    href: "/settings/team",
    scope: "team",
  },
  {
    slug: "appearance",
    label: "Appearance",
    href: "/settings/appearance",
    scope: "personal",
  },
  {
    slug: "catch-up",
    label: "Catch-up",
    href: "/settings/catch-up",
    scope: "personal",
  },
  {
    slug: "lesson-templates",
    label: "Lesson templates",
    href: "/settings/lesson-templates",
    scope: "personal",
  },
] as const;

/**
 * localStorage key recording the last sub-page the teacher visited under
 * /settings. The /settings landing route reads this to redirect; this
 * layout writes to it on every sub-page mount.
 *
 * USER-scoped — "where I left off" is a per-device, per-teacher
 * preference, not a team-shared setting. Follows the `mycurricula:user:*`
 * naming the 2026-05-25 scope clarification established.
 */
const LAST_PAGE_KEY = "mycurricula:user:settings-last-page";

export default function SettingsLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  // Derive the active tab from the URL. The pathname will be one of
  //   /settings                    — the landing redirect (handled by the
  //                                  sibling page.tsx; this layout still
  //                                  wraps it briefly before the redirect)
  //   /settings/<slug>             — a real sub-page
  //   /settings/<slug>/<anything>  — a sub-page that nests further
  const pathname = usePathname() ?? "";
  const activeTab =
    TABS.find(
      (t) => pathname === t.href || pathname.startsWith(`${t.href}/`),
    ) ?? null;

  // Persist the active sub-page's slug so the next visit to /settings
  // lands here. Skipped on the landing route itself (no active tab).
  useEffect(() => {
    if (!activeTab) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(LAST_PAGE_KEY, activeTab.slug);
    } catch {
      // Storage disabled — fine; default will be "curriculum".
    }
  }, [activeTab]);

  return (
    // AppStateProvider hosts CurrentUser + the curriculum-label mutation.
    // The settings tree lives outside the (planner) group so it has no
    // provider above it by default; mounting one here keeps Settings'
    // independence from the planner shell while letting the Curriculum
    // sub-page read and write the team's curriculum label.
    <AppStateProvider>
      <ConsequenceToastProvider>
      <main className={styles.main}>
        <div className={styles.shell}>
          {/* ── Sidebar / nav strip ───────────────────────────────── */}
          <nav className={styles.sidebar} aria-label="Settings sections">
            {/* Sticky wrapper holds BOTH the tab list and the theme strip —
                sticky on the ul alone would slide over the strip below it
                as the page scrolls. */}
            <div className={styles.sidebarSticky}>
            <ul className={styles.tabList}>
              {TABS.map((tab) => {
                const isActive = activeTab?.slug === tab.slug;
                return (
                  <li key={tab.slug} className={styles.tabItem}>
                    <Link
                      href={tab.href}
                      className={[
                        styles.tabLink,
                        isActive ? styles.tabLinkActive : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      aria-current={isActive ? "page" : undefined}
                      title={
                        tab.scope === "team"
                          ? `${tab.label} — changes affect every teacher on your team`
                          : `${tab.label} — changes only affect your view`
                      }
                    >
                      <span className={styles.tabLabel}>{tab.label}</span>
                      <span
                        className={[
                          styles.scopeChip,
                          tab.scope === "team"
                            ? styles.scopeChipTeam
                            : styles.scopeChipPersonal,
                        ].join(" ")}
                        aria-label={
                          tab.scope === "team"
                            ? "Team Curriculum scope"
                            : "Personal scope"
                        }
                      >
                        {tab.scope === "team" ? "Team" : "Personal"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* Theme quick-switch — the same chips as Settings → Appearance,
                surfaced in the sidebar so the most-wanted personal setting
                is one click from anywhere in Settings. Hidden on phone
                (≤600px) where the sidebar collapses to the pill strip —
                there the Appearance tab is the affordance. */}
            <div className={styles.sidebarTheme}>
              <span className={styles.sidebarThemeLabel}>Theme</span>
              <ThemeQuickSwitch />
            </div>
            </div>
          </nav>

          {/* ── Active sub-page ────────────────────────────────────── */}
          <div className={styles.content}>{children}</div>
        </div>

        {/* Live Clock — Audit major F#5: the user asked for a live
            day/date/time chip on EVERY page, including /settings/*.
            The planner top-bar is not mounted on /settings/* (this
            layout has its own chrome), so we mount the Clock here. It
            renders as a fixed-position bottom-right chip (see
            Clock.module.css `.chip`) so DOM placement is irrelevant —
            it floats above the content without interfering with the
            sidebar or sub-page body. The Tooltip on the chip carries
            the onboarding explanation per CLAUDE.md §4. */}
        <Clock />
      </main>
      </ConsequenceToastProvider>
    </AppStateProvider>
  );
}
