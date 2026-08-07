"use client";

// Settings segment error boundary (audit 2026-07-31 §C6).
//
// Scoped deliberately. Before this file existed, the nearest boundary was
// app/error.tsx — a full-page `min-height: 100dvh` surface — so ONE failing
// query inside a section took out the whole Settings modal and dropped the
// teacher on an app-wide error page with the modal, the sidebar and every
// other (working) section gone. The realistic trigger is a server section
// awaiting Supabase: app/settings/standards/page.tsx awaits four queries in
// a Promise.all, app/settings/workspace/page.tsx four more.
//
// Rendering here instead keeps app/settings/layout.tsx mounted, so the
// failure is contained to the content pane: the header ✕, Escape, the Done
// button and every other section in the sidebar all still work. The copy
// says so, because "one section is broken" and "Settings is broken" call for
// very different reactions from the teacher.
//
// Client component by contract — Next passes `reset()`.

import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui";
import styles from "./boundary.module.css";

export default function SettingsSectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): ReactNode {
  useEffect(() => {
    // Surface it for diagnostics; the UI stays calm. Matches app/error.tsx.
    console.error(error);
  }, [error]);

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        {/* role="alert" so the failure is announced — the teacher may have
            been looking at the sidebar when the pane swapped. */}
        <div className={styles.errorCard} role="alert">
          <p className={styles.errorEyebrow}>Couldn&rsquo;t load</p>
          <h1 className={styles.errorTitle}>
            This settings section didn&rsquo;t load
          </h1>
          <p className={styles.errorBody}>
            Nothing you&rsquo;ve saved is affected, and the rest of Settings
            still works &mdash; pick another section from the list, or try this
            one again.
          </p>
          {error.digest && (
            <p className={styles.errorRef}>Ref: {error.digest}</p>
          )}
          <div className={styles.errorActions}>
            {/* "Try again" is self-evident, so per CLAUDE.md §4 it carries
                no onboarding tooltip — a tooltip that restates the label is
                noise. Re-runs the failed render; a still-broken query simply
                lands back here. */}
            <Button variant="primary" size="md" onClick={reset}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
