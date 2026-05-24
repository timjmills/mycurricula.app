"use client";

// EmptyState — the celebratory "Caught up." card shown when the active
// scope + status filter contains zero items. Centered column with a single
// emoji, a heading, a one-line subtitle, and a link back to the Weekly
// view. No additional CTA — the screen itself is reachable from the
// settings page and the top-bar badge for re-entry.

import Link from "next/link";
import styles from "./EmptyState.module.css";

export function EmptyState() {
  return (
    <div className={styles.root}>
      <div className={styles.emoji} aria-hidden="true">
        🎉
      </div>
      <div className={styles.heading}>Caught up.</div>
      <div className={styles.sub}>Nothing uncovered in this scope.</div>
      <Link href="/weekly" className={styles.link}>
        Back to Weekly
      </Link>
    </div>
  );
}
