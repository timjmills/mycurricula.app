"use client";

// BulkActionBar — the dark fixed-bottom action bar that slides in once
// one or more Catch-up rows are checked. Mirrors the per-row actions
// (Mark done / Mark skipped / Carry over all / Add to to-do) but applies
// the chosen action to every id in the selection set before clearing it.
//
// The "Add all to to-do" action is wired as a no-op stub — the planner's
// to-do store is the parent agent's territory; we leave a TODO so the
// wire-up is a one-line follow-up when that store gains a bulk-add API.

import styles from "./BulkActionBar.module.css";

interface BulkActionBarProps {
  count: number;
  onMarkAllDone: () => void;
  onMarkAllSkipped: () => void;
  onCarryAll: () => void;
  onAddAllToTodo: () => void;
  onClear: () => void;
}

export function BulkActionBar({
  count,
  onMarkAllDone,
  onMarkAllSkipped,
  onCarryAll,
  onAddAllToTodo,
  onClear,
}: BulkActionBarProps) {
  return (
    <div className={styles.bar} role="region" aria-label="Bulk actions">
      <span className={styles.count}>{count} selected</span>
      <span className={styles.divider} aria-hidden="true" />
      <button type="button" className={styles.btn} onClick={onMarkAllDone}>
        Mark all done
      </button>
      <button type="button" className={styles.btn} onClick={onMarkAllSkipped}>
        Mark all skipped
      </button>
      <button
        type="button"
        className={`${styles.btn} ${styles.btnPrimary}`}
        onClick={onCarryAll}
      >
        Carry over all to…
      </button>
      <button type="button" className={styles.btn} onClick={onAddAllToTodo}>
        Add all to to-do
      </button>
      <span className={styles.spacer} aria-hidden="true" />
      <button type="button" className={styles.btnGhost} onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
