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
  /** Open help / shortcuts overlay. Optional but wired in v1. */
  onOpenHelp?: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function TeachTopBar({
  gradeLabel,
  avatarInitials,
  teacherName,
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
        {/* Wave 1 declutter: Search / quick-add / notifications were
            non-functional "Soon" affordances crowding the bar — removed until they
            ship for real. Only live controls remain. */}

        {/* Help — LIVE (audit B2). Opens the Teach shortcuts/help overlay. */}
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

// SearchIcon / PlusIcon / BellIcon were removed with their "Soon" controls
// (Wave 1 declutter).

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
