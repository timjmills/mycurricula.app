"use client";

// Button.tsx — canonical button primitive for every page in the app.
//
// No other code may recreate a button inline. Add a variant here instead.
// Consumed from `components/ui/` — no deep imports needed.
//
// Variants (v1.3 — pill-shaped, indigo/honey brand):
//   primary     — filled indigo (brand-500) background, white text, brand glow.
//                 The dominant action.
//   honey       — honey-gradient marketing CTA, dark text, honey glow. The
//                 warm "welcome" action (Get started, Start planning).
//   secondary   — white background, warm border, ink-soft text. (default)
//   ghost       — transparent background, ink-soft text. Hover fills hairline.
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
//
// The `tooltip` prop wraps the rendered <button> in the canonical <Tooltip>
// primitive AND mirrors the value to the native `title=` attribute. The
// title attribute is the cross-browser fallback for the disabled-button
// quirk (Chromium suppresses pointer events on disabled <button>, so the
// styled tooltip's hover listeners never fire) — having both means a
// disabled button always surfaces some textual hint. The Tooltip primitive
// itself (Tooltip.tsx) handles the wrapper-span dance for disabled triggers
// so the styled tooltip ALSO works when achievable.

import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";
import { Tooltip } from "./Tooltip";

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
  variant?:
    | "primary"
    | "honey"
    | "secondary"
    | "ghost"
    | "icon"
    | "destructive";
  size?: "sm" | "md" | "lg";
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  /** Required when variant === "icon" — the accessible name. */
  iconAriaLabel?: string;
  /** Shows a small inline spinner in place of leadingIcon; disables interaction. */
  loading?: boolean;
  /**
   * Onboarding tooltip. CLAUDE.md §4 mandates an explanation on every
   * interactive control so first-time teachers can discover the app by
   * hovering / long-pressing.
   *
   * **Voice:** tell a first-time teacher what the control _accomplishes_ in
   * context — not just what it's named.
   *
   * Good examples:
   *   tooltip="Save your edits to this lesson"
   *   tooltip="Switch to editing the team's curriculum (changes affect everyone)"
   *   tooltip="Mark this lesson done — it'll grey out on the grid"
   *
   * Bad examples (restate the label, don't teach):
   *   tooltip="Save"
   *   tooltip="Toggle"
   *   tooltip="Open panel"
   *
   * When set, the button is wrapped in the canonical <Tooltip> primitive AND
   * the value is mirrored to the native `title=` attribute. The native title
   * is the disabled-button fallback (Chromium suppresses pointer events on
   * disabled <button>, so the styled tooltip alone may never fire — `title=`
   * always works regardless of disabled state or engine). The Tooltip
   * primitive itself further wraps disabled triggers in a <span> so the
   * styled tooltip ALSO fires for those.
   */
  tooltip?: string;
  /** Optional side override for the wrapping <Tooltip>. Default "top". */
  tooltipSide?: "top" | "right" | "bottom" | "left";
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
  tooltip,
  tooltipSide,
  title,
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

  // Mirror the tooltip value to the native title= attribute when provided.
  // A caller's explicit `title=` wins (allows opt-out / override).
  const effectiveTitle = title ?? tooltip;

  const buttonEl = (
    <button
      type="button"
      {...rest}
      title={effectiveTitle}
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

  // No tooltip prop → identical render path to pre-prop callsites (regression
  // guard).
  if (!tooltip) return buttonEl;

  return (
    <Tooltip content={tooltip} side={tooltipSide ?? "top"}>
      {buttonEl}
    </Tooltip>
  );
}
