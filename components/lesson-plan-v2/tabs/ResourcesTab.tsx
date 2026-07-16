"use client";

// ResourcesTab.tsx — the Lesson Plan panel's resources tab (W7, bundle B:8406).
//
// This tab does NOT reimplement resource rendering. It mounts the LIVE
// <ResourcesPanel> (components/daily/ResourcesPanel), lesson-scoped, which
// already owns everything the bundle sketches and several things it doesn't:
//
//   • The deduped merge of SECTION resources (canonical) and lesson-level rows,
//     each keeping its provenance so edit/remove routes back to the exact store
//     row (lib/resources-dedup).
//   • Pill tabs (All · Files · Links · Media · Notes) with per-tab counts, list
//     and grid presentations, notecards, and the overflow menu.
//   • A REAL attach path — the add button opens <ResourceComposer> routed to
//     this lesson (sectionId: null → a lesson-level row), plus drag-and-drop of
//     files onto the panel. So a lesson-level attach DOES exist; there was no
//     need to fall back to a read-only list.
//   • Every URL and image src passes the single `isSafeUrl` / `isSafeImgSrc`
//     sink gate in lib/resource-embed. Reusing the panel is what keeps that gate
//     the ONLY path — a bespoke tile list here would have had to re-implement it
//     and would eventually drift.
//
// Presentation props deliberately omitted: no `dragHandleProps` (the tab is not
// a reorderable rail panel), no `onToggleCollapsed` (no collapse chevron inside
// a tab), no `onCloseDrawer` (that switches the panel to drawer chrome with an
// × button). The panel therefore renders as a plain standalone card.
//
// `.panel` is `height: 100%`, so it needs a sized flex parent — `.resWrap`
// supplies a min-height and lets the panel grow into the tab body.

import type { ReactNode } from "react";
import { usePlanner } from "@/lib/planner-store";
import { ResourcesPanel } from "@/components/daily";
import styles from "./tabs.module.css";

export interface ResourcesTabProps {
  lessonId: string;
}

export function ResourcesTab({ lessonId }: ResourcesTabProps): ReactNode {
  const { getLesson } = usePlanner();
  const lesson = getLesson(lessonId);

  if (!lesson) {
    return (
      <div className={styles.emptyTab}>This lesson is no longer available.</div>
    );
  }

  return (
    <div className={styles.tab}>
      <div className={styles.resWrap}>
        {/* Lesson-scoped: mode defaults to "day", which aggregates the selected
            lesson's section + lesson-level resources. */}
        <ResourcesPanel lesson={lesson} />
      </div>
    </div>
  );
}
