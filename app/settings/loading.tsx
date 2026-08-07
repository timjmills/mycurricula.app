// Settings segment loading UI (audit 2026-07-31 §C6).
//
// Next.js turns this file into a Suspense boundary around the segment's
// page, INSIDE app/settings/layout.tsx — so the modal, its header and the
// section sidebar stay painted and interactive while a section streams in.
// Nested sections inherit this boundary unless they declare their own.
//
// It matters most for the two async server sections: Standards awaits four
// Supabase queries in a Promise.all before rendering anything, and Workspace
// awaits four more. Without a boundary here, a teacher clicking either one
// on a slow connection saw the previous section frozen with no feedback.
//
// Server component on purpose — no interactivity, so it ships no JS.

import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui";
import styles from "./boundary.module.css";

export default function SettingsSectionLoading(): ReactNode {
  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        {/* One Skeleton owns the accessible label for the whole pane. The
            others are decorative, so they are aria-hidden — otherwise a
            screen reader would hear "Loading…" three times over. */}
        <div className={styles.headSkeleton}>
          <Skeleton lines={2} label="Loading this settings section…" />
        </div>
        <div className={styles.cardSkeleton} aria-hidden="true">
          <Skeleton lines={4} />
        </div>
        <div className={styles.cardSkeleton} aria-hidden="true">
          <Skeleton lines={3} />
        </div>
      </div>
    </div>
  );
}
