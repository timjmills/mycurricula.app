"use client";

// section-toolbar.tsx — the per-section MANAGEMENT popup for the lesson flow.
//
// A floating POPUP MENU shown only when the teacher clicks the per-section
// "+" button (the parent — see lesson-flow.tsx — owns that trigger and
// toggles the `visible` prop). When `visible` is true this renders as an
// intentional floating menu panel — rounded paper card, hairline border,
// elevation shadow — that reads as having popped out of the "+".
//
// SCOPE — what this toolbar contains, and what it intentionally does NOT.
//
// The toolbar carries ONLY the section MANAGEMENT actions:
//   • Move up        — chevron up (disabled at the first position).
//   • Move down      — chevron down (disabled at the last position); the
//                      two move buttons are the keyboard reorder path.
//   • Duplicate      — copy icon.
//   • Show on website — globe icon, a toggle with an active state.
//   • Delete         — trash icon (destructive tint on hover; disabled
//                      when this is the lesson's last section).
//
// The OLD Padlet-style hero — the "Add an image, video, link, or file"
// caption and the four media tiles (Upload / Photo / Video / Link) — is
// GONE from this popup. Adding resources is now handled app-wide by the
// shared <ResourceComposer> (see components/daily/ResourceComposer). The
// section "+" trigger in lesson-flow now opens that composer instead of
// this management popup's old add-tiles.
//
// Pointer reorder is NOT driven from this popup — the drag affordance
// lives as a dedicated grip on the section HEADING ROW (see
// lesson-flow.tsx). The Move up / Move down buttons remain here as the
// keyboard reorder path.
//
// Visibility is driven entirely by the parent: a `visible` prop switches the
// .panelVisible class so CSS handles the entrance fade + scale. When
// `visible` is false the panel is fully hidden and non-interactive. This
// component owns ONLY how the panel looks and its internal layout / a11y —
// the open/close trigger, click-outside, Escape and positioning all live in
// lesson-flow.tsx.

import type { ReactNode } from "react";
import styles from "./section-toolbar.module.css";

// ── Props ────────────────────────────────────────────────────────────────

export interface SectionToolbarProps {
  /** Fire when the teacher clicks "Move up". */
  onMoveUp: () => void;
  /** Fire when the teacher clicks "Move down". */
  onMoveDown: () => void;
  /** Fire when the teacher clicks "Duplicate". */
  onDuplicate: () => void;
  /** Fire when the teacher toggles "Show on class website". */
  onToggleWebsite: () => void;
  /** Fire when the teacher clicks "Delete section". */
  onDelete: () => void;
  /** Whether this section is currently published to the class website. */
  websiteVisible?: boolean;
  /** Disable the Move Up button (section is already at the top). */
  canMoveUp?: boolean;
  /** Disable the Move Down button (section is already at the bottom). */
  canMoveDown?: boolean;
  /** Disable the Delete button (this is the lesson's last section). */
  canDelete?: boolean;
  /** Whether the toolbar is currently visible (controlled by parent). */
  visible?: boolean;
}

// ── SectionToolbar ───────────────────────────────────────────────────────

/** Per-section MANAGEMENT popup, shown when the parent's "+" is toggled.
 *  Five small icon buttons in one quiet row: move up / move down,
 *  duplicate, website toggle, delete. Resource adding is handled
 *  separately by the app-wide ResourceComposer, which the section "+"
 *  trigger now opens directly in place of this popup's old add-tiles. */
export function SectionToolbar({
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onToggleWebsite,
  onDelete,
  websiteVisible = false,
  canMoveUp = true,
  canMoveDown = true,
  canDelete = true,
  visible = false,
}: SectionToolbarProps): ReactNode {
  return (
    <div
      className={[styles.panel, visible ? styles.panelVisible : ""]
        .filter(Boolean)
        .join(" ")}
      // Prevent panel interaction from bubbling up as a card "blur" event.
      onMouseDown={(e) => e.stopPropagation()}
      // role="toolbar" — a group of icon buttons. Chosen over role="menu"
      // because the controls are plain buttons + a toggle, not single-select
      // menu items; "toolbar" keeps native button semantics and tab order
      // intact.
      role="toolbar"
      aria-label="Section actions"
      // When hidden the panel stays mounted for the entrance animation, but
      // it must be invisible to assistive tech and untabbable. pointer-events
      // is dropped in CSS; aria-hidden + inert are mirrored here so a
      // screen-reader / keyboard user never lands inside a collapsed menu.
      aria-hidden={!visible}
      inert={!visible}
    >
      {/* ── Section management — five small icon buttons ─────────────────
          A single compact, quiet row. Move up / Move down lead the row —
          they are the keyboard reorder path. Pointer reorder is handled by
          the dedicated grip on the section HEADING ROW (see lesson-flow.tsx),
          so this popup never carries a drag grip. */}
      <div className={styles.manageRow}>
        <ManageButton
          label="Move up"
          onClick={onMoveUp}
          icon={<ChevronUpIcon />}
          disabled={!canMoveUp}
        />
        <ManageButton
          label="Move down"
          onClick={onMoveDown}
          icon={<ChevronDownIcon />}
          disabled={!canMoveDown}
        />
        <ManageButton
          label="Duplicate section"
          onClick={onDuplicate}
          icon={<CopyIcon />}
        />
        <ManageButton
          label={
            websiteVisible ? "Hide from class website" : "Show on class website"
          }
          onClick={onToggleWebsite}
          icon={<GlobeIcon />}
          toggle
          active={websiteVisible}
        />
        <ManageButton
          label="Delete section"
          onClick={onDelete}
          icon={<TrashIcon />}
          danger
          disabled={!canDelete}
        />
      </div>
    </div>
  );
}

// ── ManageButton ──────────────────────────────────────────────────────────
// Shared small icon-button + tooltip unit for the management row.

interface ManageButtonProps {
  label: string;
  onClick: () => void;
  icon: ReactNode;
  disabled?: boolean;
  /** When true the button is a toggle and aria-pressed reflects its state. */
  toggle?: boolean;
  active?: boolean;
  danger?: boolean;
}

function ManageButton({
  label,
  onClick,
  icon,
  disabled = false,
  toggle = false,
  active = false,
  danger = false,
}: ManageButtonProps): ReactNode {
  const className = [
    styles.manageBtn,
    active ? styles.manageBtnActive : "",
    danger ? styles.manageBtnDanger : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      // aria-pressed only on toggle buttons; always a boolean so screen readers
      // can announce both the on and off states correctly.
      aria-pressed={toggle ? active : undefined}
    >
      {icon}
      {/* Tooltip — always rendered; opacity controlled by CSS :hover/:focus-visible */}
      <span className={styles.tooltip} aria-hidden="true">
        {label}
      </span>
    </button>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────
// Inline SVG icons, aria-hidden. The management-row icons render at 16px.
// (The drag-grip icon lives on the heading row in lesson-flow.tsx — it is
// not part of this popup.)

function ChevronUpIcon(): ReactNode {
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
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function ChevronDownIcon(): ReactNode {
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
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CopyIcon(): ReactNode {
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
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function GlobeIcon(): ReactNode {
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
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function TrashIcon(): ReactNode {
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
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
