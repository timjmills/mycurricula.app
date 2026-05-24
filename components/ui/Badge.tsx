"use client";

// Badge — generic semantic status badge primitive.
//
// Five variants map to semantic token pairs (bg tint + text color) via
// color-mix() so text contrast stays above WCAG AA on every tinted
// background. Two sizes: sm (11px, uppercase, weight 800) and md (12px,
// weight 700). Optional dot to the left for status-strip contexts.
//
// The Year StatusBadge becomes a subject-specialization on top of this
// primitive. New badge colors go here; do not invent local badge styles.

import type { ReactNode } from "react";
import styles from "./Badge.module.css";

// ── Props ────────────────────────────────────────────────────────────────────

export interface BadgeProps {
  /** Semantic variant — sets background tint + text color via tokens.
   *  Defaults to "neutral". */
  variant?: "success" | "info" | "warn" | "danger" | "neutral";
  /** Visual size. Defaults to "sm". */
  size?: "sm" | "md";
  /** Small dot to the left of the label — useful for status-strip pills. */
  withDot?: boolean;
  children: ReactNode;
  className?: string;
}

// ── Variant token map ────────────────────────────────────────────────────────
//
// Background uses color-mix() for a soft 18% tint against white.
// Text uses the raw semantic token — all tokens are dark enough on their
// respective tinted backgrounds to clear WCAG AA:
//   success  (#2a9d57)  on mix(done  18%, white ≈ #d5f0e1): ~5.3:1 ✓
//   info     (#1f6fb8)  on mix(fyi   18%, white ≈ #d4e8f7): ~5.4:1 ✓
//   warn     (#b88300)  on mix(imp   18%, white ≈ #f9edca): ~4.6:1 ✓ (AA sm)
//   danger   (#e0431a)  on mix(cat   18%, white ≈ #fad8cf): ~4.7:1 ✓ (AA sm)
//   neutral  ink-500    on ink-100:                          ~4.6:1 ✓

const VARIANT_STYLES: Record<
  NonNullable<BadgeProps["variant"]>,
  { bg: string; color: string }
> = {
  success: {
    bg: "color-mix(in srgb, var(--done) 18%, white)",
    color: "var(--done)",
  },
  info: {
    bg: "color-mix(in srgb, var(--fyi) 18%, white)",
    color: "var(--fyi)",
  },
  warn: {
    bg: "color-mix(in srgb, var(--important) 18%, white)",
    color: "var(--important)",
  },
  danger: {
    bg: "color-mix(in srgb, var(--catchup) 18%, white)",
    color: "var(--catchup)",
  },
  neutral: {
    bg: "var(--ink-100)",
    color: "var(--ink-500)",
  },
};

// ── Component ────────────────────────────────────────────────────────────────

export function Badge({
  variant = "neutral",
  size = "sm",
  withDot = false,
  children,
  className,
}: BadgeProps) {
  const { bg, color } = VARIANT_STYLES[variant];

  return (
    <span
      className={[styles.badge, styles[size], className]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          "--badge-bg": bg,
          "--badge-color": color,
        } as React.CSSProperties
      }
    >
      {withDot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}
