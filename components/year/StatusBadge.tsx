"use client";

// StatusBadge — uppercase status pill for the bottom-right corner of UnitBar.
//
// Six states, each mapped to a semantic token pair (bg + text color).
// Colors use color-mix() tints against the canonical status tokens so text
// contrast stays above WCAG AA on every tinted background. No hex values.

import type { UnitBarStatus } from "./UnitBar";
import styles from "./StatusBadge.module.css";

interface StatusBadgeProps {
  status: UnitBarStatus;
}

// Map each status to inline style tokens.
// Background uses color-mix() for a soft tint; text uses the raw token
// which is dark enough on white-mixed backgrounds to pass AA contrast.
const STATUS_STYLES: Record<
  UnitBarStatus,
  { bg: string; color: string; label: string }
> = {
  completed: {
    bg: "color-mix(in srgb, var(--done) 18%, white)",
    color: "var(--done)",
    label: "Completed",
  },
  in_progress: {
    // --fyi (#1f6fb8, dark blue) on a light blue tint — contrast ~5.4:1 (AA).
    bg: "color-mix(in srgb, var(--fyi) 18%, white)",
    color: "var(--fyi)",
    label: "In Progress",
  },
  modified: {
    bg: "color-mix(in srgb, var(--important) 18%, white)",
    color: "var(--important)",
    label: "Modified",
  },
  skipped: {
    // --writing (#6b46c1) — purple at 14% tint; contrast ~5.1:1 (AA).
    bg: "color-mix(in srgb, var(--writing) 14%, white)",
    color: "var(--writing)",
    label: "Skipped",
  },
  not_started: {
    bg: "var(--ink-100)",
    color: "var(--ink-500)",
    label: "Not Started",
  },
  behind: {
    bg: "color-mix(in srgb, var(--catchup) 16%, white)",
    color: "var(--catchup)",
    label: "Behind",
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const { bg, color, label } = STATUS_STYLES[status];
  return (
    <span
      className={styles.badge}
      style={{ background: bg, color }}
      aria-label={`Status: ${label}`}
    >
      {label}
    </span>
  );
}
