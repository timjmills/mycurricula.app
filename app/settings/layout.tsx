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
//
// PRESENTATION — Settings is a POPUP. The route is unchanged (every
// /settings/<section> deep-link still resolves here), but the layout now
// paints as a centered dialog card floating over a dimmed `--scrim`
// backdrop instead of a full-page surface. Two close paths, by design:
//   • The header ✕ and Escape close IMMEDIATELY (unchanged — handled in
//     SettingsHeader), no prompt.
//   • Clicking OUTSIDE the dialog (the dimmed backdrop) prompts
//     "Save changes and close?" ONLY when a setting changed this session
//     (useSettingsDirty); otherwise it exits straight away. Settings
//     auto-persist, so "Save & close" just navigates back.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppStateProvider } from "@/lib/app-state";
import { ConsequenceToastProvider } from "@/lib/consequence-toast";
import { NotebookProvider } from "@/lib/notebook-state";
import { useSettingsDirty } from "@/lib/use-settings-dirty";
import { Clock } from "@/components/shell/Clock";
import { readSettingsReturnRoute } from "@/components/shell";
import { ThemeQuickSwitch } from "@/components/appearance/theme-quick-switch";
import {
  SaveConfirmDialog,
  SettingsHeader,
  SettingsSearch,
} from "@/components/settings";
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
  /** Group tone dot next to the heading — matches the eyebrow tones the
   *  group's section pages carry (SettingsCard `tone` prop): Planning =
   *  honey, Content = brand, People = teal, Preferences = neutral. */
  tone: "honey" | "brand" | "teal" | "neutral";
  items: readonly SettingsTab[];
}

// NOTE: not exported — Next.js App Router layouts may only export the
// framework-known names. The search index (lib/settings-search-index.ts)
// mirrors this registry instead of importing it.
const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    label: "Planning",
    tone: "honey",
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
    tone: "brand",
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
    tone: "teal",
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
    tone: "neutral",
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

/** Keyboard-reachable descendants — used by the dialog's Tab focus trap.
 *  Same selector the SaveConfirmDialog / save-target-dialog modals use. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

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

  // ── Popup exit + click-out wiring ──────────────────────────────────────
  const router = useRouter();
  const { isDirty } = useSettingsDirty();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Did the pointerdown of the current gesture land on the backdrop itself?
  // A real click-out requires BOTH the press AND the release to land directly
  // on the backdrop. We verify the two targets ourselves on pointerup rather
  // than trusting `click`, whose target is the nearest common ancestor of the
  // press + release — so a press on the dim that releases over the dialog (a
  // text-selection drag) would otherwise report the backdrop as the click
  // target and falsely close.
  const backdropPressRef = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Exit mirrors settings-header.tsx — return to the planner route the
  // teacher came from (fallback /weekly). Settings auto-persist, so the
  // "Save & close" path is just this navigation.
  const exitSettings = useCallback((): void => {
    router.push(readSettingsReturnRoute());
  }, [router]);

  // Backdrop gesture: remember whether the press began on the backdrop.
  const onBackdropPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>): void => {
      backdropPressRef.current = e.target === e.currentTarget;
    },
    [],
  );

  // A confirmed click-out fires only when the press AND the release both
  // landed directly on the backdrop element (never on a descendant). With a
  // dirty session we prompt; otherwise we exit immediately.
  const onBackdropPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>): void => {
      const pressedBackdrop = backdropPressRef.current;
      backdropPressRef.current = false;
      if (confirmOpen) return;
      if (!pressedBackdrop) return;
      if (e.target !== e.currentTarget) return;
      if (isDirty()) setConfirmOpen(true);
      else exitSettings();
    },
    [confirmOpen, isDirty, exitSettings],
  );

  // A cancelled gesture (pointer leaves the window, touch interrupted) clears
  // the press so an unrelated later release can't be read as a click-out.
  const onBackdropPointerCancel = useCallback((): void => {
    backdropPressRef.current = false;
  }, []);

  // "Save & close" — close the confirm, then leave (already persisted).
  const onSaveAndClose = useCallback((): void => {
    setConfirmOpen(false);
    exitSettings();
  }, [exitSettings]);

  // Lock background scroll while the popup is mounted; restore on unmount.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Move focus into the dialog on mount so keyboard + screen-reader users
  // land inside the modal, and restore it to wherever it was when the popup
  // closes. rAF defers the initial focus past the paint so the ref is live.
  useEffect(() => {
    const previouslyFocused =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;
    const id = requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(id);
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    };
  }, []);

  // Focus trap — keep Tab / Shift-Tab cycling inside the dialog so focus can't
  // wander out of the modal (it backs the `aria-modal="true"` contract). Held
  // off while the SaveConfirmDialog is open: that overlay owns focus and runs
  // its own trap. Mirrors the SaveConfirmDialog / save-target-dialog pattern.
  const onDialogKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>): void => {
      if (e.key !== "Tab" || confirmOpen) return;
      const dlg = dialogRef.current;
      if (!dlg) return;
      // offsetParent === null filters display:none controls (e.g. the phone-
      // only / desktop-only branches of the sidebar); no focusable element in
      // the dialog is position:fixed, so this stays accurate.
      const focusable = Array.from(
        dlg.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      // The initially-focused dialog container (tabIndex=-1) is NOT in the
      // focusable list, so its index is -1. Treat that — and any focus that
      // has wandered outside the dialog — as a boundary in BOTH directions, so
      // Tab pulls in to the first control and Shift+Tab to the last, and focus
      // can never escape the modal.
      const idx = focusable.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey) {
        if (idx <= 0) {
          e.preventDefault();
          last.focus();
        }
      } else if (idx === -1 || idx === focusable.length - 1) {
        e.preventDefault();
        first.focus();
      }
    },
    [confirmOpen],
  );

  return (
    // AppStateProvider hosts CurrentUser + the curriculum-label mutation.
    // NotebookProvider hosts workspace + notebook state — the Workspace &
    // Team page and the overview dashboard both read it. The settings tree
    // lives outside the (planner) group so it mounts its own copies.
    <AppStateProvider>
      <NotebookProvider>
        <ConsequenceToastProvider>
          {/* Dimmed backdrop — click-out (press + release both on the
              backdrop itself) prompts when dirty, else exits. */}
          <div
            className={styles.backdrop}
            onPointerDown={onBackdropPointerDown}
            onPointerUp={onBackdropPointerUp}
            onPointerCancel={onBackdropPointerCancel}
          >
            {/* The popup card. role=dialog + aria-modal + the body-scroll
                lock + the Tab focus trap make it read as a true modal; focus
                moves in on mount and restores on close. Escape / ✕ close
                immediately (SettingsHeader). */}
            <div
              ref={dialogRef}
              className={styles.dialog}
              role="dialog"
              aria-modal="true"
              aria-label="Settings"
              tabIndex={-1}
              onKeyDown={onDialogKeyDown}
              // While the click-out confirm is open it becomes the single
              // active modal layer; mark this outer dialog `inert` so AT and
              // pointer/focus skip it (two sibling aria-modal regions would
              // otherwise hide the confirm from screen readers). The confirm
              // owns focus while open and restores it here on close.
              inert={confirmOpen || undefined}
            >
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
                          <span
                            className={[
                              styles.groupDot,
                              styles[
                                `groupDot${group.tone[0].toUpperCase()}${group.tone.slice(1)}`
                              ],
                            ].join(" ")}
                          />
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
            </div>
          </div>

          {/* Click-out confirm — only ever opened when the session is dirty
              (see onBackdropClick). "Save & close" exits (auto-persisted);
              "Keep editing" closes the confirm and stays in Settings. */}
          <SaveConfirmDialog
            open={confirmOpen}
            onSaveAndClose={onSaveAndClose}
            onKeepEditing={() => setConfirmOpen(false)}
          />
        </ConsequenceToastProvider>
      </NotebookProvider>
    </AppStateProvider>
  );
}
