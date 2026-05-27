"use client";

// BulkActionBar — the dark fixed-bottom action bar that slides in once
// one or more Catch-up rows are checked. Applies the chosen action to
// every id in the selection set before clearing it.
//
// W1-A2 (2026-05-27): "Add all to to-do" removed for beta — the to-do
// store doesn't support a real bulk-add yet, so the old button was a
// silent no-op. "Carry over all to…" is renamed "Mark all as needs
// carry-over" because the bulk action flags items without picking a
// target week/day (single-row carry-over keeps its existing per-row
// target picker). When the backend lands, the target picker will land
// here too and the label can go back to "Carry over all to…".

import { Tooltip } from "@/components/ui";
import styles from "./BulkActionBar.module.css";

interface BulkActionBarProps {
  count: number;
  onMarkAllDone: () => void;
  onMarkAllSkipped: () => void;
  onCarryAll: () => void;
  onClear: () => void;
}

export function BulkActionBar({
  count,
  onMarkAllDone,
  onMarkAllSkipped,
  onCarryAll,
  onClear,
}: BulkActionBarProps) {
  return (
    <div
      className={styles.bar}
      role="region"
      aria-label="Bulk actions"
      title="Bulk action bar — apply the same action to every catch-up row you've selected, then the selection clears"
    >
      <Tooltip
        content="Bulk action bar — apply the same action to every catch-up row you've selected, then the selection clears."
        side="top"
      >
        <span className={styles.count} tabIndex={0}>
          {count} selected
        </span>
      </Tooltip>
      <span className={styles.divider} aria-hidden="true" />
      <Tooltip
        content="Mark every selected lesson done — they leave the catch-up list and show as complete on the planner."
        side="top"
      >
        <button
          type="button"
          className={styles.btn}
          onClick={onMarkAllDone}
          title="Mark every selected lesson done — they leave the catch-up list and show as complete on the planner"
        >
          Mark all done
        </button>
      </Tooltip>
      <Tooltip
        content="Mark every selected lesson skipped — they stay flagged so you can decide later whether to make them up."
        side="top"
      >
        <button
          type="button"
          className={styles.btn}
          onClick={onMarkAllSkipped}
          title="Mark every selected lesson skipped — they stay flagged so you can decide later whether to make them up"
        >
          Mark all skipped
        </button>
      </Tooltip>
      <Tooltip
        content="Flag every selected lesson as needs-carry-over so they stay visible until you assign each to a future week and day."
        side="top"
      >
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={onCarryAll}
          title="Flag every selected lesson as needs-carry-over so they stay visible until you assign each to a future week and day"
        >
          Mark all as needs carry-over
        </button>
      </Tooltip>
      <span className={styles.spacer} aria-hidden="true" />
      <Tooltip
        content="Deselect every catch-up row and hide this action bar."
        side="top"
      >
        <button
          type="button"
          className={styles.btnGhost}
          onClick={onClear}
          title="Deselect every catch-up row and hide this action bar"
        >
          Clear
        </button>
      </Tooltip>
    </div>
  );
}
