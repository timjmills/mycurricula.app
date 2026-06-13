"use client";

// TeachFooter.tsx — the Teach workspace's status footer
// (docs/teach-view-plan.md §3). Wave 1 declutter: the footer used to echo every
// other zone — module-jump dots (the rails already do that), a "Board N of M"
// count (the sub-bar pill strip already shows it), and ⌘P/⌘//⌘? shortcut hints
// (the Help overlay owns those, and ⌘/ "Layout" was dead). All removed. What
// remains is single-purpose: the panels toggle + the auto-save status.
//
// A PURE presentational component. The "Panels ▴" toggle calls back so the
// integrating component owns the panel state.

import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui";
import styles from "./TeachChrome.module.css";

// ── Props ──────────────────────────────────────────────────────────────────

export interface TeachFooterProps {
  /** Whether both side panels are currently collapsed (drives the chevron
   *  direction + the toggle's aria-expanded). */
  panelsCollapsed?: boolean;
  /** Toggle the side panels open/closed. Optional. */
  onTogglePanels?: () => void;
  /** Save-state label (e.g. "Saved to MyCurricula"). Defaults to that. */
  savedLabel?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function TeachFooter({
  panelsCollapsed = false,
  onTogglePanels,
  savedLabel = "Saved to MyCurricula",
}: TeachFooterProps): ReactNode {
  return (
    <div className={styles.footer}>
      {/* Panels toggle. */}
      <Tooltip
        content={
          panelsCollapsed
            ? "Show the side panels again"
            : "Hide both side panels to give the board more room"
        }
        side="top"
        tooltipId="teach-panels-toggle"
      >
        <button
          type="button"
          className={styles.panelsToggle}
          onClick={onTogglePanels}
          aria-expanded={!panelsCollapsed}
          aria-label={panelsCollapsed ? "Show panels" : "Hide panels"}
        >
          Panels
          {panelsCollapsed ? <ChevronDownIcon /> : <ChevronUpIcon />}
        </button>
      </Tooltip>

      <div className={styles.footerSpacer} aria-hidden="true" />

      {/* Save status. */}
      <Tooltip
        content="Your boards and notes save automatically — nothing to do"
        side="top"
      >
        <span className={styles.savedChip} aria-live="polite">
          <CheckIcon />
          {savedLabel}
        </span>
      </Tooltip>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────

function ChevronUpIcon(): ReactNode {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 15l-6-6-6 6" />
    </svg>
  );
}

function ChevronDownIcon(): ReactNode {
  return (
    <svg
      width="12"
      height="12"
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

function CheckIcon(): ReactNode {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12l4 4 10-10" />
    </svg>
  );
}
