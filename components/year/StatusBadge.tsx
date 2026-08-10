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
    /* The "~4.7:1 (AA)" this comment used to claim was never true — measured
       on the running app the pair read 3.47:1. `--catchup` is a fill colour,
       not an ink; `--catchup-ink` is the text rung and reads 4.91:1 here.
       The tint mixes into var(--surface) rather than a literal `white` so the
       pill follows the canvas into dark tone, where the tone-branched ink
       expects a dark backdrop. Light tone is unchanged (--surface = #fff). */
    bg: "color-mix(in srgb, var(--catchup) 14%, var(--surface))",
    color: "var(--catchup-ink)",
    label: "Skipped",
  },
  not_started: {
    bg: "var(--ink-100)",
    color: "var(--ink-500)",
    label: "Not Started",
  },
  behind: {
    bg: "color-mix(in srgb, var(--catchup) 16%, var(--surface))",
    color: "var(--catchup-ink)",
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
