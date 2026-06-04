"use client";

// Year view — curriculum timeline (Timeline / Curriculy design).
//
// Mounts the single, fully-responsive <TimelineYear> component. It renders one
// row per subject with the year's units laid across it; opening a unit expands
// its weeks under the row, opening a week reveals its daily lessons, and
// clicking a day opens the app's shared lesson-detail panel via
// setSelectedLessonId. A live StatStrip sits at the top; there is no filter UI.
//
// The previous desktop/phone split (<YearView> + <YearMobile>) is retired —
// TimelineYear handles all three viewport tiers itself (it scrolls its wide
// grid internally so the document never scrolls sideways). Those components
// remain in components/year for any consumer that still imports them.

import { TimelineYear } from "@/components/year";

export default function YearPage() {
  return <TimelineYear />;
}
