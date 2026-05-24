"use client";

// Button.tsx — canonical button primitive for every page in the app.
//
// No other code may recreate a button inline. Add a variant here instead.
// Consumed from `components/ui/` — no deep imports needed.
//
// Variants:
//   primary     — filled ink-900 background, paper text. The dominant action.
//   secondary   — white background, ink-200 border, ink-900 text. (default)
//   ghost       — transparent background, ink-700 text. Hover fills ink-100.
//   icon        — square ghost-style button for icon-only triggers (⋯, ✕ etc).
//                 Requires `iconAriaLabel` for accessible naming.
//   destructive — filled catchup-tinted background, paper text. Archive/Delete.
//
// Sizes:
//   sm — 32px visual height; ≥44px hit area on phone/tablet via padding trick.
//   md — 40px visual height; ≥44px hit area on phone/tablet. (default)
//   lg — 48px visual height; primary CTAs.
//
// The `loading` prop shows a spinner in place of leadingIcon and disables
// interaction with aria-busy.

import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

// ── Spinner glyph ─────────────────────────────────────────────────────────────
// Inline SVG so it inherits currentColor and needs no external dep.

function Spinner(): ReactNode {
  return (
    <svg
      className={styles.spinner}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="28"
        strokeDashoffset="10"
      />
    </svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "size"
> {
  variant?: "primary" | "secondary" | "ghost" | "icon" | "destructive";
  size?: "sm" | "md" | "lg";
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  /** Required when variant === "icon" — the accessible name. */
  iconAriaLabel?: string;
  /** Shows a small inline spinner in place of leadingIcon; disables interaction. */
  loading?: boolean;
}

// ── Button ────────────────────────────────────────────────────────────────────

export function Button({
  variant = "secondary",
  size = "md",
  leadingIcon,
  trailingIcon,
  iconAriaLabel,
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps): ReactNode {
  // icon variant: accessible name comes from iconAriaLabel, not children.
  const ariaLabel =
    variant === "icon"
      ? (iconAriaLabel ?? rest["aria-label"])
      : rest["aria-label"];

  const classes = [
    styles.btn,
    styles[variant],
    styles[size],
    loading ? styles.loading : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      {...rest}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={classes}
    >
      {/* Leading icon slot — spinner replaces it during loading */}
      {(leadingIcon || loading) && (
        <span className={styles.leadingIcon} aria-hidden="true">
          {loading ? <Spinner /> : leadingIcon}
        </span>
      )}

      {/* Content — hidden for icon-only variant (aria-label carries the name) */}
      {variant !== "icon" && children && (
        <span className={styles.label}>{children}</span>
      )}

      {/* Icon-only variant renders its icon as direct children */}
      {variant === "icon" && children && (
        <span aria-hidden="true">{children}</span>
      )}

      {/* Trailing icon slot */}
      {trailingIcon && variant !== "icon" && (
        <span className={styles.trailingIcon} aria-hidden="true">
          {trailingIcon}
        </span>
      )}
    </button>
  );
}
