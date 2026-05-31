"use client";

// TeachFooter.tsx — the Teach workspace's status footer
// (docs/teach-view-plan.md §3; Agent A). Left-to-right (prototype `Footer`):
//   Panels ▴ · module dots (Lessons / Resources• / Notes) · spacer ·
//   Board N of M · · Saved · spacer · shortcut hints (⌘P / ⌘/ / ⌘?).
//
// A PURE presentational component. Board position + save status arrive via
// props; the "Panels ▴" toggle and module dots dispatch / call back so the
// integrating component owns the panel state.

import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui";
import styles from "./TeachChrome.module.css";

// ── Props ──────────────────────────────────────────────────────────────────

export interface TeachFooterModule {
  /** Stable module id (matches a TEACH_MODULE_IDS entry). */
  id: string;
  /** Human label shown in the footer. */
  label: string;
  /** Whether this module's panel is currently open (renders as the active
   *  dot / bold label). */
  active?: boolean;
  /** Whether the module has fresh/unread content (renders a status dot). */
  hasActivity?: boolean;
}

export interface TeachFooterProps {
  /** 1-based index of the active board (e.g. 1). */
  boardIndex: number;
  /** Total board count for the active lesson. */
  boardCount: number;
  /** Quick-jump module dots shown after the Panels toggle. */
  modules?: readonly TeachFooterModule[];
  /** Whether both side panels are currently collapsed (drives the chevron
   *  direction + the toggle's aria-expanded). */
  panelsCollapsed?: boolean;
  /** Toggle the side panels open/closed. Optional. */
  onTogglePanels?: () => void;
  /** Focus / open a module by id. Optional. */
  onSelectModule?: (id: string) => void;
  /** Save-state label (e.g. "Saved to MyCurricula"). Defaults to that. */
  savedLabel?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function TeachFooter({
  boardIndex,
  boardCount,
  modules = [],
  panelsCollapsed = false,
  onTogglePanels,
  onSelectModule,
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

      {/* Module quick-jump dots. */}
      {modules.map((m) => (
        <Tooltip
          key={m.id}
          content={`Jump to the ${m.label} panel`}
          side="top"
          tooltipId="teach-footer-module"
        >
          <button
            type="button"
            className={styles.panelsToggle}
            onClick={() => onSelectModule?.(m.id)}
            aria-label={`Open ${m.label}`}
            aria-pressed={m.active}
          >
            <span className={m.active ? styles.footerStrong : undefined}>
              {m.label}
            </span>
            {m.hasActivity ? (
              <span className={styles.moduleDot} aria-hidden="true" />
            ) : null}
          </button>
        </Tooltip>
      ))}

      <div className={styles.footerSpacer} aria-hidden="true" />

      {/* Board N of M. */}
      <span aria-label={`Board ${boardIndex} of ${boardCount}`}>
        Board {boardIndex} of {boardCount}
      </span>
      <span className={styles.footerSep} aria-hidden="true">
        ·
      </span>

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

      <div className={styles.footerSpacer} aria-hidden="true" />

      {/* Shortcut hints. */}
      <span className={styles.shortcutsLabel} aria-hidden="true">
        Shortcuts:
      </span>
      <span aria-hidden="true">
        <span className={`cp-mono ${styles.kbd}`}>⌘P</span> Present
      </span>
      <span aria-hidden="true">
        <span className={`cp-mono ${styles.kbd}`}>⌘/</span> Layout
      </span>
      <span aria-hidden="true">
        <span className={`cp-mono ${styles.kbd}`}>⌘?</span> Help
      </span>
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
