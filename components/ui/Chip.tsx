"use client";

// Chip — inline pill for tags, filters, and removable items.
//
// Three variants:
//   default   — static display pill; no interaction.
//   filter    — toggle button with aria-pressed; active = dark fill.
//   removable — chip with a focusable × button on the right.
//
// The StatusFilterBar pills are a direct use-case of the filter variant.
// Do not invent inline chip styles elsewhere; extend this component instead.

import type { ReactNode } from "react";
import styles from "./Chip.module.css";

// ── Inline × SVG (avoids adding dependencies) ────────────────────────────────

const IconX = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.8"
    aria-hidden="true"
  >
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

// ── Props ────────────────────────────────────────────────────────────────────

export interface ChipProps {
  /** Visual mode. Defaults to "default". */
  variant?: "default" | "filter" | "removable";
  /** filter variant — is this chip currently active/pressed? */
  active?: boolean;
  /** removable variant — called when the × is clicked or activated. */
  onRemove?: () => void;
  /** Optional leading node (dot, icon, etc.) */
  leadingIcon?: ReactNode;
  /** filter variant — click handler for the whole chip. */
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function Chip({
  variant = "default",
  active = false,
  onRemove,
  leadingIcon,
  onClick,
  children,
  className,
}: ChipProps) {
  const baseClass = [styles.chip, styles[variant], className]
    .filter(Boolean)
    .join(" ");

  // filter variant renders as a button so it's keyboard-reachable and
  // correctly conveys toggle state via aria-pressed.
  if (variant === "filter") {
    return (
      <button
        type="button"
        className={baseClass}
        aria-pressed={active}
        onClick={onClick}
      >
        {leadingIcon && (
          <span className={styles.leadingIcon} aria-hidden="true">
            {leadingIcon}
          </span>
        )}
        {children}
      </button>
    );
  }

  // removable variant: span + inner × button. The outer span is not
  // interactive itself; the × is the focusable element.
  if (variant === "removable") {
    return (
      <span className={baseClass}>
        {leadingIcon && (
          <span className={styles.leadingIcon} aria-hidden="true">
            {leadingIcon}
          </span>
        )}
        {children}
        <button
          type="button"
          className={styles.removeBtn}
          onClick={onRemove}
          aria-label="Remove"
        >
          <IconX />
        </button>
      </span>
    );
  }

  // default variant: purely presentational span.
  return (
    <span className={baseClass}>
      {leadingIcon && (
        <span className={styles.leadingIcon} aria-hidden="true">
          {leadingIcon}
        </span>
      )}
      {children}
    </span>
  );
}
