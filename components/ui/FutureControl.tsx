"use client";

// FutureControl — the canonical "coming after beta" placeholder primitive.
//
// Per Unified-Audit Decision #4: placeholder controls stay visible (they
// signal planned scope) but get an unmistakable visual treatment so they
// never read as broken live buttons. This primitive renders a disabled
// button with a distinct outline-only style, ~70% opacity,
// cursor:not-allowed, a "SOON" inline pill, and an onboarding-voice
// tooltip explaining when the control is coming.
//
// At release, *every* still-broken beta feature gets hidden by removing
// its FutureControl callsite — one rg sweep does it. Don't reimplement
// the "disabled placeholder" pattern inline; wrap it in this primitive.

import type { ReactNode } from "react";
import { Tooltip } from "./Tooltip";
import styles from "./FutureControl.module.css";

// ── Props ────────────────────────────────────────────────────────────────────

export interface FutureControlProps {
  /** Visible label inside the control. Required for the "default" + "ghost"
   *  variants; ignored for "icon-only" (label is conveyed via tooltip + aria). */
  label?: string;
  /** Optional icon rendered before the label (default + ghost variants)
   *  or as the sole content (icon-only variant). */
  leadingIcon?: ReactNode;
  /** Optional trailing icon (default + ghost variants). */
  trailingIcon?: ReactNode;
  /** Tooltip + aria-label copy. Should explain WHAT the control will do
   *  and WHEN it's expected (e.g. "Filters — coming after beta"). */
  tooltip: string;
  /** Visual treatment. Defaults to "default". */
  variant?: "default" | "ghost" | "icon-only";
  /** Visual size. Defaults to "sm". */
  size?: "sm" | "md";
  /** Tooltip side. Defaults to "bottom". */
  tooltipSide?: "top" | "right" | "bottom" | "left";
  className?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function FutureControl({
  label,
  leadingIcon,
  trailingIcon,
  tooltip,
  variant = "default",
  size = "sm",
  tooltipSide = "bottom",
  className,
}: FutureControlProps) {
  const cls = [
    styles.root,
    styles[variant],
    styles[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tooltip content={tooltip} side={tooltipSide}>
      <button
        type="button"
        className={cls}
        disabled
        aria-disabled="true"
        aria-label={tooltip}
        title={tooltip}
      >
        {leadingIcon && (
          <span className={styles.icon} aria-hidden="true">
            {leadingIcon}
          </span>
        )}
        {variant !== "icon-only" && label && (
          <span className={styles.label}>{label}</span>
        )}
        {trailingIcon && variant !== "icon-only" && (
          <span className={styles.icon} aria-hidden="true">
            {trailingIcon}
          </span>
        )}
        <span
          className={
            variant === "icon-only" ? styles.pillCorner : styles.pillInline
          }
          aria-hidden="true"
        >
          SOON
        </span>
      </button>
    </Tooltip>
  );
}
