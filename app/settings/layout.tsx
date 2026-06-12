"use client";

// Settings section layout — persistent header (title + search slot + exit ✕)
// above a 2-column shell: a domain-grouped sidebar on the left and the
// active sub-page on the right.
//
// Sidebar groups (display order):
//   PLANNING     — Curriculum, Calendar, Schedule
//   CONTENT      — Subjects, Lesson templates
//   PEOPLE       — Workspace & Team, Account
//   PREFERENCES  — Appearance, Catch-up
//
// Every item carries a scope chip ("Team" = shared with every teacher,
// "Personal" = this teacher only) so a teacher always knows the blast
// radius before clicking in.
//
// Exiting: the header's ✕ and the Escape key return to the planner route
// recorded by components/shell/last-route-recorder (fallback /weekly).
// Before the header existed Settings was a dead end — the layout hides
// the planner shell, so the browser back button was the only way out.
//
// On every sub-page mount we write that page's slug to localStorage under
// `mycurricula:user:settings-last-page`. The /settings landing no longer
// redirects on it (it renders the overview dashboard) but the slug keeps
// the overview able to spotlight "where you left off" and preserves
// back-compat with anything else reading it.
//
// On phone the sidebar collapses to a horizontal scroll-strip above the
// content (group labels hidden) so every entry stays reachable without
// eating ~30% of the viewport height (CLAUDE.md §4 responsive contract).

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppStateProvider } from "@/lib/app-state";
import { ConsequenceToastProvider } from "@/lib/consequence-toast";
import { NotebookProvider } from "@/lib/notebook-state";
import { Clock } from "@/components/shell/Clock";
import { ThemeQuickSwitch } from "@/components/appearance/theme-quick-switch";
import { SettingsHeader, SettingsSearch } from "@/components/settings";
import styles from "./layout.module.css";

// ── Sub-page registry ──────────────────────────────────────────────────────
// Grouped by product domain. Group order + item order = display order.
// "Curriculum" stays first so the most team-defining settings lead.

interface SettingsTab {
  slug: string;
  label: string;
  href: string;
  /** W2-B7: scope chip rendered next to the label. "team" → settings
   *  whose changes are shared with every teacher on the team. "personal"
   *  → settings that only affect this teacher's view. Vocabulary follows
   *  Unified Audit Decision #2 ("Personal" / "Team Curriculum"). */
  scope: "personal" | "team";
}

interface SettingsGroup {
  /** Uppercase group heading shown in the sidebar (hidden on phone). */
  label: string;
  items: readonly SettingsTab[];
}

// NOTE: not exported — Next.js App Router layouts may only export the
// framework-known names. The search index (lib/settings-search-index.ts)
// mirrors this registry instead of importing it.
const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    label: "Planning",
    items: [
      {
        slug: "curriculum",
        label: "Curriculum",
        href: "/settings/curriculum",
        scope: "team",
      },
      {
        slug: "calendar",
        label: "Calendar",
        href: "/settings/calendar",
        scope: "team",
      },
      {
        slug: "schedule",
        label: "Schedule",
        href: "/settings/schedule",
        scope: "personal",
      },
    ],
  },
  {
    label: "Content",
    items: [
      {
        slug: "subjects",
        label: "Subjects",
        href: "/settings/subjects",
        scope: "team",
      },
      {
        slug: "lesson-templates",
        label: "Lesson templates",
        href: "/settings/lesson-templates",
        scope: "personal",
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        slug: "workspace",
        label: "Workspace & Team",
        href: "/settings/workspace",
        scope: "team",
      },
      {
        slug: "account",
        label: "Account",
        href: "/settings/account",
        scope: "personal",
      },
    ],
  },
  {
    label: "Preferences",
    items: [
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
    ],
  },
] as const;

/** Flat view of every tab — pathname matching + the landing overview. */
const ALL_TABS: readonly SettingsTab[] = SETTINGS_GROUPS.flatMap(
  (g) => g.items,
);

/**
 * localStorage key recording the last sub-page the teacher visited under
 * /settings. USER-scoped — "where I left off" is a per-device, per-teacher
 * breadcrumb, not a team-shared setting.
 */
const LAST_PAGE_KEY = "mycurricula:user:settings-last-page";

export default function SettingsLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  // Derive the active tab from the URL. The pathname will be one of
  //   /settings                    — the overview dashboard (no active tab)
  //   /settings/<slug>             — a real sub-page
  //   /settings/<slug>/<anything>  — a sub-page that nests further
  // The retired /settings/team slug 308s to /settings/workspace, so it
  // never reaches this matcher.
  const pathname = usePathname() ?? "";
  const activeTab =
    ALL_TABS.find(
      (t) => pathname === t.href || pathname.startsWith(`${t.href}/`),
    ) ?? null;

  // Persist the active sub-page's slug. Skipped on the overview route
  // itself (no active tab).
  useEffect(() => {
    if (!activeTab) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(LAST_PAGE_KEY, activeTab.slug);
    } catch {
      // Storage disabled — fine; the overview simply won't spotlight it.
    }
  }, [activeTab]);

  return (
    // AppStateProvider hosts CurrentUser + the curriculum-label mutation.
    // NotebookProvider hosts workspace + notebook state — the Workspace &
    // Team page and the overview dashboard both read it. The settings tree
    // lives outside the (planner) group so it mounts its own copies.
    <AppStateProvider>
      <NotebookProvider>
        <ConsequenceToastProvider>
          <main className={styles.main}>
            <SettingsHeader>
              <SettingsSearch />
            </SettingsHeader>
            <div className={styles.shell}>
              {/* ── Sidebar / nav strip ───────────────────────────────── */}
              <nav className={styles.sidebar} aria-label="Settings sections">
                {/* Sticky wrapper holds BOTH the group list and the theme
                    strip — sticky on the lists alone would slide over the
                    strip below them as the page scrolls. */}
                <div className={styles.sidebarSticky}>
                  {SETTINGS_GROUPS.map((group) => (
                    <div key={group.label} className={styles.group}>
                      <span className={styles.groupLabel} aria-hidden>
                        {group.label}
                      </span>
                      <ul className={styles.tabList}>
                        {group.items.map((tab) => {
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
                                <span className={styles.tabLabel}>
                                  {tab.label}
                                </span>
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
                    </div>
                  ))}

                  {/* Theme quick-switch — the same chips as Settings →
                      Appearance, surfaced in the sidebar so the most-wanted
                      personal setting is one click from anywhere in
                      Settings. Hidden on phone (≤600px) where the sidebar
                      collapses to the pill strip. */}
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
                day/date/time chip on EVERY page, including /settings/*. */}
            <Clock />
          </main>
        </ConsequenceToastProvider>
      </NotebookProvider>
    </AppStateProvider>
  );
}
