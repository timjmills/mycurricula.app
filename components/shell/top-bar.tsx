"use client";

// top-bar.tsx — app shell top bar.
//
// Sticky chrome bar at the top of every planner view. Left-to-right order:
//   wordmark → panel collapse → view switcher → week jumper →
//   master/personal toggle → view-mode pill → search →
//   to-do button → comments button (with badge) → profile avatar.
//
// State from useAppState(); mock data (ME, LESSONS, CURRENT_WEEK) for badge
// count and avatar initials. Desktop-first (~1280px); bar scrolls
// horizontally on narrower viewports.

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppState } from "@/lib/app-state";
import { ME, LESSONS, CURRENT_WEEK } from "@/lib/mock";
import styles from "./top-bar.module.css";

// ── View definitions ─────────────────────────────────────────────────────
// Views with a route are live links. Views without carry the `soon` flag so
// they render visibly but non-interactively (no route, cursor: default).

interface ViewDef {
  label: string;
  href?: string;
  soon?: boolean;
}

const VIEWS: ViewDef[] = [
  { label: "Weekly", href: "/weekly" },
  { label: "Daily", href: "/daily" },
  { label: "Subject", href: "/subject" },
  { label: "Schedule", soon: true },
  { label: "Unit", soon: true },
  { label: "Year", soon: true },
];

// ── TopBar ───────────────────────────────────────────────────────────────

/** App shell top bar — sticky chrome above every planner view. */
export function TopBar(): ReactNode {
  const {
    viewMode,
    setViewMode,
    editMode,
    setEditMode,
    week,
    setWeek,
    search,
    setSearch,
    leftPanelOpen,
    toggleLeftPanel,
    todoPanelOpen,
    toggleTodoPanel,
    commentsPanelOpen,
    toggleCommentsPanel,
  } = useAppState();

  const pathname = usePathname();

  // Total unread comment count across all lessons in mock data.
  const unreadCount = LESSONS.reduce((n, l) => n + (l.unreadComments ?? 0), 0);

  return (
    <header className={styles.bar}>
      {/* ── Wordmark ──────────────────────────────────────────────── */}
      <Link
        href="/weekly"
        className={styles.wordmark}
        aria-label="MyCurricula home"
      >
        <span className={styles.wordmarkApp}>MyCurricula</span>
        <span className={styles.wordmarkGrade}>Grade 5</span>
      </Link>

      <div className={styles.divider} aria-hidden="true" />

      {/* ── Left-panel collapse toggle ─────────────────────────────── */}
      <button
        type="button"
        className={`${styles.iconBtn} ${leftPanelOpen ? styles.iconBtnActive : ""}`}
        onClick={toggleLeftPanel}
        aria-label={
          leftPanelOpen ? "Collapse filter panel" : "Expand filter panel"
        }
        aria-expanded={leftPanelOpen}
      >
        <PanelLeftIcon />
      </button>

      <div className={styles.divider} aria-hidden="true" />

      {/* ── View switcher ─────────────────────────────────────────── */}
      <nav className={styles.viewSwitcher} aria-label="View">
        {VIEWS.map((v) => {
          if (v.soon) {
            return (
              <span
                key={v.label}
                className={`${styles.viewTab} ${styles.viewTabSoon}`}
                aria-disabled="true"
                title={`${v.label} — coming soon`}
              >
                {v.label}
                <span className={styles.soonLabel} aria-hidden="true">
                  soon
                </span>
              </span>
            );
          }
          const isActive =
            pathname === v.href || pathname.startsWith(v.href + "/");
          return (
            <Link
              key={v.label}
              href={v.href!}
              className={`${styles.viewTab} ${isActive ? styles.viewTabActive : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              {v.label}
            </Link>
          );
        })}
      </nav>

      <div className={styles.divider} aria-hidden="true" />

      {/* ── Week jumper ───────────────────────────────────────────── */}
      <div className={styles.weekJumper} aria-label="Week navigation">
        <button
          type="button"
          className={styles.weekChevron}
          onClick={() => setWeek(week - 1)}
          aria-label="Previous week"
        >
          <ChevronLeftIcon />
        </button>

        <span
          className={styles.weekLabel}
          aria-live="polite"
          aria-atomic="true"
        >
          Week {week}
        </span>

        <button
          type="button"
          className={styles.weekChevron}
          onClick={() => setWeek(week + 1)}
          aria-label="Next week"
        >
          <ChevronRightIcon />
        </button>

        <button
          type="button"
          className={styles.thisWeekBtn}
          onClick={() => setWeek(CURRENT_WEEK)}
          disabled={week === CURRENT_WEEK}
          aria-label="Jump to this week"
        >
          This week
        </button>
      </div>

      <div className={styles.divider} aria-hidden="true" />

      {/* ── Master / Personal segmented control ───────────────────── */}
      <div className={styles.editToggle} role="group" aria-label="Edit mode">
        <button
          type="button"
          className={`${styles.editToggleBtn} ${
            editMode === "personal" ? styles.editToggleBtnActive : ""
          }`}
          onClick={() => setEditMode("personal")}
          aria-pressed={editMode === "personal"}
        >
          Personal
        </button>
        <button
          type="button"
          className={`${styles.editToggleBtn} ${styles.editToggleBtnMaster} ${
            editMode === "master" ? styles.editToggleBtnMasterActive : ""
          }`}
          onClick={() => setEditMode("master")}
          aria-pressed={editMode === "master"}
          title="Changes in Master mode affect the whole team"
        >
          <span className={styles.masterDot} aria-hidden="true" />
          Master
        </button>
      </div>

      <div className={styles.divider} aria-hidden="true" />

      {/* ── View-mode pill (Simple | Task | Grid) ─────────────────── */}
      <div
        className={styles.viewModePill}
        role="group"
        aria-label="View detail level"
      >
        {(["simple", "task", "grid"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`${styles.viewModeBtn} ${
              viewMode === mode ? styles.viewModeBtnActive : ""
            }`}
            onClick={() => setViewMode(mode)}
            aria-pressed={viewMode === mode}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>

      {/* Push remaining controls to the right */}
      <div className={styles.spacer} aria-hidden="true" />

      {/* ── Search ────────────────────────────────────────────────── */}
      <div className={styles.searchWrap}>
        <span className={styles.searchIcon} aria-hidden="true">
          <SearchIcon />
        </span>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search lessons…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search lessons"
        />
      </div>

      {/* ── To-do panel toggle ────────────────────────────────────── */}
      <button
        type="button"
        className={`${styles.iconBtn} ${todoPanelOpen ? styles.iconBtnActive : ""}`}
        onClick={toggleTodoPanel}
        aria-label={todoPanelOpen ? "Close to-do panel" : "Open to-do panel"}
        aria-expanded={todoPanelOpen}
      >
        <TodoIcon />
      </button>

      {/* ── Comments panel toggle with unread badge ───────────────── */}
      <div className={styles.badgeWrap}>
        <button
          type="button"
          className={`${styles.iconBtn} ${commentsPanelOpen ? styles.iconBtnActive : ""}`}
          onClick={toggleCommentsPanel}
          aria-label={
            commentsPanelOpen
              ? "Close comments panel"
              : `Open comments panel${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`
          }
          aria-expanded={commentsPanelOpen}
        >
          <CommentsIcon />
        </button>
        {unreadCount > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>

      {/* ── Profile avatar → settings ─────────────────────────────── */}
      <Link
        href="/settings/appearance"
        className={styles.avatar}
        aria-label={`Profile settings (${ME.name})`}
      >
        {ME.initials}
      </Link>
    </header>
  );
}

// ── SVG icons ────────────────────────────────────────────────────────────
// All icons are inline SVG, aria-hidden, 18×18 grid.

function PanelLeftIcon(): ReactNode {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}

function ChevronLeftIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function SearchIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function TodoIcon(): ReactNode {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <polyline points="3 6 4 7 6 5" />
      <polyline points="3 12 4 13 6 11" />
      <polyline points="3 18 4 19 6 17" />
    </svg>
  );
}

function CommentsIcon(): ReactNode {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
