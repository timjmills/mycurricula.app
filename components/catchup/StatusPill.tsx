"use client";

// StatusPill — small uppercase pill displaying a CatchupItem's effective
// status. The four states (not_done / partial / skipped / carried) each
// map to a soft tinted background and a darker foreground via
// CATCHUP_STATUS_TOKEN — keeping the dot color in the filter chip and
// the pill on the row visually paired.

import type { CatchupItem } from "@/lib/catchup-data";
import { CATCHUP_STATUS_LABEL, CATCHUP_STATUS_TOKEN } from "@/lib/catchup-data";
import styles from "./StatusPill.module.css";

interface StatusPillProps {
  status: CatchupItem["status"];
}

export function StatusPill({ status }: StatusPillProps) {
  const label = CATCHUP_STATUS_LABEL[status];
  const token = CATCHUP_STATUS_TOKEN[status];
  // The not_done state uses a neutral ink ramp instead of the colored mix
  // so it reads as the baseline rather than another category. Every other
  // status borrows its own dot color for the tint, keeping the row + chip
  // pairing recognizable.
  const bg =
    status === "not_done"
      ? "var(--ink-100)"
      : `color-mix(in srgb, var(${token}) 16%, white)`;
  const color = status === "not_done" ? "var(--ink-500)" : `var(${token})`;
  return (
    <span
      className={styles.pill}
      style={{ background: bg, color }}
      aria-label={`Status: ${label}`}
    >
      {label}
    </span>
  );
}
