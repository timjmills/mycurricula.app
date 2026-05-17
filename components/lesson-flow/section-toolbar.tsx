"use client";

// section-toolbar.tsx — padlet-style hover toolbar for lesson sections.
//
// Renders a compact horizontal row of small icon buttons that appears when
// the teacher mouses over (or tabs into) a lesson section card. Matches the
// Padlet reference (commonplanner.com): each button is an icon with a tooltip
// label revealed on hover.
//
// Actions provided:
//   • Add resource   — paperclip/link icon
//   • Add image      — image icon
//   • Add note       — comment/note icon
//   • Move up        — chevron up (disabled at first position)
//   • Move down      — chevron down (disabled at last position)
//   • Duplicate      — copy icon
//   • Show on class website — globe icon, toggle with active state
//   • Delete         — trash icon (destructive tint on hover)
//
// Visibility is driven by the parent card wrapper (see lesson-flow.tsx):
// a `visible` prop switches the .toolbarVisible class so CSS handles the
// fade + slide without extra JS state here.

import type { ReactNode } from "react";
import styles from "./section-toolbar.module.css";

// ── Props ────────────────────────────────────────────────────────────────

export interface SectionToolbarProps {
  /** Fire when the teacher clicks "Add resource". */
  onAddResource: () => void;
  /** Fire when the teacher clicks "Add image". */
  onAddImage: () => void;
  /** Fire when the teacher clicks "Add note". */
  onAddNote: () => void;
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
  /** Whether the toolbar is currently visible (controlled by parent). */
  visible?: boolean;
}

// ── SectionToolbar ───────────────────────────────────────────────────────

/** Padlet-style compact toolbar revealed on section card hover/focus. */
export function SectionToolbar({
  onAddResource,
  onAddImage,
  onAddNote,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onToggleWebsite,
  onDelete,
  websiteVisible = false,
  canMoveUp = true,
  canMoveDown = true,
  visible = false,
}: SectionToolbarProps): ReactNode {
  return (
    <div
      className={[styles.toolbar, visible ? styles.toolbarVisible : ""]
        .filter(Boolean)
        .join(" ")}
      // Prevent toolbar interaction from bubbling up as a card "blur" event.
      onMouseDown={(e) => e.stopPropagation()}
      role="toolbar"
      aria-label="Section actions"
    >
      {/* ── Group 1: Add actions ── */}
      <ToolbarButton
        label="Add resource"
        onClick={onAddResource}
        icon={<PaperclipIcon />}
      />
      <ToolbarButton
        label="Add image"
        onClick={onAddImage}
        icon={<ImageIcon />}
      />
      <ToolbarButton label="Add note" onClick={onAddNote} icon={<NoteIcon />} />

      <div className={styles.divider} aria-hidden="true" />

      {/* ── Group 2: Move ── */}
      <ToolbarButton
        label="Move up"
        onClick={onMoveUp}
        icon={<ChevronUpIcon />}
        disabled={!canMoveUp}
      />
      <ToolbarButton
        label="Move down"
        onClick={onMoveDown}
        icon={<ChevronDownIcon />}
        disabled={!canMoveDown}
      />

      <div className={styles.divider} aria-hidden="true" />

      {/* ── Group 3: Organize ── */}
      <ToolbarButton
        label="Duplicate section"
        onClick={onDuplicate}
        icon={<CopyIcon />}
      />
      <ToolbarButton
        label={
          websiteVisible ? "Hide from class website" : "Show on class website"
        }
        onClick={onToggleWebsite}
        icon={<GlobeIcon />}
        active={websiteVisible}
      />

      <div className={styles.divider} aria-hidden="true" />

      {/* ── Group 4: Destructive ── */}
      <ToolbarButton
        label="Delete section"
        onClick={onDelete}
        icon={<TrashIcon />}
        danger
      />
    </div>
  );
}

// ── ToolbarButton ─────────────────────────────────────────────────────────
// Shared icon-button + tooltip unit for the toolbar.

interface ToolbarButtonProps {
  label: string;
  onClick: () => void;
  icon: ReactNode;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
}

function ToolbarButton({
  label,
  onClick,
  icon,
  disabled = false,
  active = false,
  danger = false,
}: ToolbarButtonProps): ReactNode {
  const className = [
    styles.btn,
    active ? styles.btnActive : "",
    danger ? styles.btnDanger : "",
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
      aria-pressed={active !== false ? active : undefined}
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
// Inline SVG icons, aria-hidden, consistent 16×16 rendered size.

function PaperclipIcon(): ReactNode {
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
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function ImageIcon(): ReactNode {
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
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function NoteIcon(): ReactNode {
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
      {/* Message-square / comment bubble */}
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

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
