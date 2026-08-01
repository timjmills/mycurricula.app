"use client";

// AssessmentsTab.tsx — the unit workspace's Assessments tab (task #45).
//
// WHY IT EXISTS. The v2 handoff puts Assessments in the tab strip on BOTH of
// its unit surfaces — the Planning-Hub unit workspace
// (`mockup/New v2 Site Design.bundled.html:8651`, between Standards and
// Resources) and the Unit Explorer modal (`:7573`). We shipped it as a
// right-hand drawer pane instead, and a teacher reported the tab missing by
// name. The handoff wins for look and behaviour (CLAUDE.md §4a), so the tab is
// the conformance fix.
//
// Our two unit surfaces are ONE component. The handoff prototypes them
// separately (`UnitDoc` in the hub, the `ue-` modal in the explorer); here both
// entry points render <UnitExplorer>, the Hub through HubDocHost and everything
// else through UnitWorkspaceHost. Adding the tab once therefore lands it on
// both — there is no second strip to keep in step.
//
// A THIN WRAPPER, DELIBERATELY. The whole body is <AssessmentsPanel>, which
// already holds the real model: unit-owned rows in `unit_assessments`, the
// lesson-level roll-up across the unit's lessons, three buckets because `kind`
// is optional, and ONE write path through the planner store. Re-implementing
// any of that against the handoff's prototype shape would have forked the
// truth. What this file adds is the tab's framing and the `layout="tab"`
// geometry — nothing that touches data.
//
// WHAT THE HANDOFF'S BODY IS, AND WHY THIS IS NOT A COPY OF IT. The mockup's
// tab (`:8779`) is three `ph-ovcard`s of rich contentEditable prose —
// Diagnostic / pre-assessment (`as:pre`), Formative checks (`as:form`),
// Summative assessment (`as:sum`) — persisted to localStorage. That is the
// prototype's stand-in for a schema it did not have; we have the schema. Three
// free-text blobs beside `unit_assessments` would be a SECOND record of the
// same fact, with no way to reconcile the two when they disagree. So the card
// grammar is adopted and the contents stay structured.
//
// The one thing the structure cannot yet express is the handoff's FIRST card:
// `kind` is `formative | summative | absent`, with no `diagnostic`. Adding it
// is a migration (the `unit_assessments` CHECK constraint plus
// `isAssessmentKind`), which is not this lane's to apply — it is reported, not
// faked. Nothing here maps "diagnostic" onto the unclassified bucket: that
// bucket means "the teacher has not said", and relabelling it would invent a
// classification for every row that simply has not been given one.
//
// `visible` is hard-coded true. It exists for the drawer, whose subtree stays
// mounted behind `display: none` — the unit-assessment read has to wait for a
// real reveal there. A tab body is the opposite: UnitExplorer renders it only
// while its tab is active, so mounting IS the reveal.

import { type ReactNode } from "react";
import type { Lesson } from "@/lib/types";
import type { PlannerDataState } from "@/lib/planner-store";
import { AssessmentsPanel } from "../drawer";

export interface AssessmentsTabProps {
  /** The open unit — the id as it appears on `Lesson.unit`. */
  unitId: string;
  /** The unit's lessons, already filtered + sorted by `unitLessons()`. */
  lessons: readonly Lesson[];
  /** Open a lesson in the Lesson Planner. */
  onOpenLesson: (lessonId: string) => void;
  /** Planner readiness, consulted only when there is nothing to show. */
  dataState?: PlannerDataState;
}

export function AssessmentsTab({
  unitId,
  lessons,
  onOpenLesson,
  dataState,
}: AssessmentsTabProps): ReactNode {
  // No wrapper element: the other tab bodies are their own root (StandardsTab is
  // a bare <ul>, NotesTab a bare <div>), and an extra div here would only be a
  // second unstyled box between the shell's tabpanel and the panel's own layout.
  return (
    <AssessmentsPanel
      // Keyed by unit for the same reason the drawer keys it: switching units on
      // the rail must start a clean read, not show the previous unit's rows
      // under the new unit's name.
      key={unitId}
      unitId={unitId}
      visible
      lessons={lessons}
      onOpenLesson={onOpenLesson}
      dataState={dataState}
      layout="tab"
    />
  );
}
