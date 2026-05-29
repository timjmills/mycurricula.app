"use client";

// TeachTopBar.tsx — the Teach surface's top bar (docs/teach-view-plan.md §3,
// §13.6; Agent A). The Teach analogue of the planner shell top bar
// (components/shell/top-bar.tsx) but it lives INSIDE the Teach workspace, not
// the planner chrome — Present + Full Screen must escape the planner shell
// entirely (plan §2.1), so Teach renders its own chrome.
//
// Left-to-right (prototype `TopBar`): wordmark · Grade ▾ · view tabs (Teach
// active) · spacer · search pill · round + · bell · help · avatar.
//
// This is a PURE presentational component. The lesson/board context it needs
// arrives via props (the integrating component reads usePlanner()/the teach
// repository — never this chrome). The view tabs reuse the exported `VIEWS`
// from the shell top bar so the Teach tab order/copy stay in lockstep with the
// rest of the app (single source of truth, plan §2.3).

import type { ReactNode } from "react";
import Link from "next/link";
import { VIEWS } from "@/components/shell/top-bar";
import { Tooltip } from "@/components/ui";
import styles from "./TeachChrome.module.css";

// ── Props ──────────────────────────────────────────────────────────────────

export interface TeachTopBarProps {
  /** Free-text curriculum label shown after the wordmark (e.g. "Grade 5").
   *  Multi-grade by design — never a grade enum (CLAUDE.md §1). Hidden when
   *  absent. */
  gradeLabel?: string;
  /** Teacher initials for the avatar fallback monogram. */
  avatarInitials: string;
  /** Optional teacher display name (avatar tooltip / aria). */
  teacherName?: string;
  /** Open the global search surface. Optional — wired in integration. */
  onSearch?: () => void;
  /** The round "+" quick-add. Optional. */
  onQuickAdd?: () => void;
  /** Open the notifications inbox. Optional. */
  onOpenNotifications?: () => void;
  /** Unread notification count for the bell badge. */
  notificationCount?: number;
  /** Open help / shortcuts. Optional. */
  onOpenHelp?: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function TeachTopBar({
  gradeLabel,
  avatarInitials,
  teacherName,
  onSearch,
  onQuickAdd,
  onOpenNotifications,
  notificationCount = 0,
  onOpenHelp,
}: TeachTopBarProps): ReactNode {
  return (
    <div className={styles.topBar}>
      {/* Wordmark → back to the planner home. */}
      <Tooltip
        content="Built for teachers, by teachers — return to your Weekly planner"
        side="bottom"
      >
        <Link
          href="/weekly"
          className={styles.wordmark}
          aria-label="MyCurricula home"
        >
          MyCurricula
        </Link>
      </Tooltip>

      {/* Grade ▾ — free-text curriculum label, multi-grade by design. */}
      {gradeLabel ? (
        <Tooltip
          content="The grade or curriculum this teaching session belongs to"
          side="bottom"
          tooltipId="teach-grade-chip"
        >
          <span className={styles.gradeChip}>
            {gradeLabel}
            <ChevronDownIcon />
          </span>
        </Tooltip>
      ) : null}

      {/* View tabs — reuse the shell VIEWS list; Teach is the active one. */}
      <nav className={styles.viewSwitcher} aria-label="View">
        {VIEWS.map((v) => {
          if (v.soon || !v.href) {
            return (
              <Tooltip
                key={v.label}
                content={`Coming soon — ${v.label}`}
                side="bottom"
              >
                <span
                  className={`${styles.viewTab} ${styles.viewTabSoon}`}
                  aria-disabled="true"
                >
                  {v.label}
                </span>
              </Tooltip>
            );
          }
          const isActive = v.href === "/teach";
          return (
            <Tooltip key={v.label} content={v.tooltip ?? ""} side="bottom">
              <Link
                href={v.href}
                className={`${styles.viewTab} ${isActive ? styles.viewTabActive : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                {v.label}
              </Link>
            </Tooltip>
          );
        })}
      </nav>

      <div className={styles.spacer} aria-hidden="true" />

      <div className={styles.rightCluster}>
        {/* Search pill. */}
        <Tooltip
          content="Search lessons, standards, and resources to teach"
          side="bottom"
          tooltipId="teach-search"
        >
          <button
            type="button"
            className={styles.searchPill}
            onClick={onSearch}
            aria-label="Search MyCurricula"
          >
            <SearchIcon />
            <span className={styles.searchPillLabel}>Search MyCurricula</span>
          </button>
        </Tooltip>

        {/* Round quick-add. */}
        <Tooltip
          content="Quick add — start a new board, lesson, or resource"
          side="bottom"
          tooltipId="teach-quick-add"
        >
          <button
            type="button"
            className={`${styles.addRound} cp-subj math`}
            onClick={onQuickAdd}
            aria-label="Quick add"
          >
            <PlusIcon />
          </button>
        </Tooltip>

        {/* Notifications bell. */}
        <Tooltip
          content="Team activity — mentions, board shares, and shoutbox replies"
          side="bottom"
          tooltipId="teach-bell"
        >
          <button
            type="button"
            className={styles.iconBtn}
            onClick={onOpenNotifications}
            aria-label={
              notificationCount > 0
                ? `Notifications (${notificationCount} unread)`
                : "Notifications"
            }
          >
            <BellIcon />
            {notificationCount > 0 ? (
              <span className={styles.bellBadge} aria-hidden="true">
                {notificationCount > 99 ? "99+" : notificationCount}
              </span>
            ) : null}
          </button>
        </Tooltip>

        {/* Help. */}
        <Tooltip
          content="Keyboard shortcuts and a quick guide to the Teach workspace"
          side="bottom"
          tooltipId="teach-help"
          required
        >
          <button
            type="button"
            className={styles.iconBtn}
            onClick={onOpenHelp}
            aria-label="Open help and keyboard shortcuts"
          >
            <HelpIcon />
          </button>
        </Tooltip>

        {/* Avatar → Settings. */}
        <Tooltip
          content={`Open Settings — your curriculum and preferences${
            teacherName ? ` (${teacherName})` : ""
          }`}
          side="bottom"
        >
          <Link
            href="/settings"
            className={styles.avatar}
            aria-label={
              teacherName
                ? `Profile settings (${teacherName})`
                : "Profile settings"
            }
          >
            {avatarInitials}
          </Link>
        </Tooltip>
      </div>
    </div>
  );
}

// ── Icons (18×18 grid, currentColor, aria-hidden — matches the shell) ────────

function ChevronDownIcon(): ReactNode {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
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

function PlusIcon(): ReactNode {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function BellIcon(): ReactNode {
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
      <path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16z" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  );
}

function HelpIcon(): ReactNode {
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
      <circle cx="12" cy="12" r="10" />
      <path d="M9.5 9a2.5 2.5 0 1 1 4.5 1.5c-.7.5-1.5 1-1.5 2.5" />
      <line x1="12" y1="17" x2="12" y2="17.5" />
    </svg>
  );
}
