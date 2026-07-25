"use client";

// UnitChip — the ONE affordance that takes a teacher from a LESSON to its UNIT
// (B5.4 /daily + B5.5 /weekly).
//
// WHY IT EXISTS. Everything waves B1–B3 built — the Unit Plan editor and the
// Assessments · Insights · Prep context drawer — could only be reached from
// /year and the Planner Hub. On the two surfaces teachers actually live in the
// unit was a dead end: /daily rendered its name as inert text, and /weekly never
// rendered it at all (Lesson.unit appeared only inside the filter predicates).
// The only route was a two-hop, unsignposted detour through the Subject
// breadcrumb → /year → hunt for the chip. This is that path, made direct, and
// it is the same control on every v2 planner frame so it only has to be learned
// once.
//
// POP-IN, NOT NAVIGATION. It calls the global host's opener
// (components/year-v2/workspace-host), which paints <UnitExplorer> as an OVERLAY
// over whatever the teacher was reading — no router push, no URL change, no lost
// scroll position. Closing it puts them back exactly where they were. The host
// is a module-level singleton that elects a single renderer, so no number of
// chips on screen can ever produce two dialogs.
//
// GUARDED BY THE CATALOG, NOT BY THE SLUG. `Lesson.unit` is a unit id (a slug
// under the mock source, a UUID on prod) that can be absent, empty, or — when
// the Supabase seam can't map `unit_id` back to a catalog unit — an id that
// resolves to nothing. `unitDisplayName` returns null for all three, and we
// render NOTHING rather than an affordance that opens an empty workspace or
// leaks an internal id as its label. The honest consequence: on a cold prod load
// the chip appears only once the unit catalog has hydrated, because until then
// there genuinely is no unit to open.
//
// LOOK. The Button primitive's ghost pill (BUILD_STANDARD §8 — never hand-roll a
// pill CTA). Frames that host it on a colored surface (the DayC hero, the WeekC
// gradient tiles) pass a recolour class — the same frame-contextual pattern
// `.dfootFinish` uses for the shared FinishPill. The base class here is TRIPLED
// so its FIT rules beat `.btn.sm` (0,2,0) whatever order the two stylesheets
// land in, and it deliberately sets no color, so a frame recolour only needs
// (0,3,0) to beat `.btn.ghost` rather than having to out-stack this base too.

import type { MouseEvent, ReactNode } from "react";
import { Button, Tooltip } from "@/components/ui";
import { usePlanner } from "@/lib/planner-store";
import { unitDisplayName } from "@/lib/unit-name";
import { useUnitWorkspace } from "@/components/year-v2/workspace-host";
import type { SubjectId } from "@/lib/types";
import styles from "./UnitChip.module.css";

export interface UnitChipProps {
  /** The lesson's subject — unit ids are unique only WITHIN a subject, so the
   *  catalog lookup is scoped by it (lib/unit-name). */
  subjectId: SubjectId;
  /** `Lesson.unit` verbatim — the same value <UnitExplorer unit=…> takes. */
  unit: string | null | undefined;
  /** Frame-contextual recolour / fit class (see the header). */
  className?: string;
}

export function UnitChip({
  subjectId,
  unit,
  className,
}: UnitChipProps): ReactNode {
  const { units } = usePlanner();
  // Throws outside <UnitWorkspaceProvider> rather than wiring a button to a
  // workspace nothing renders. Every planner frame that mounts this chip lives
  // under app/(planner)/layout.tsx, which mounts the provider.
  const { openUnitWorkspace } = useUnitWorkspace();

  const unitName = unitDisplayName(units, subjectId, unit);
  if (!unit || !unitName) return null;

  return (
    <Tooltip
      content={`Open the ${unitName} unit — its plan, assessments, insights and prep — right here, without leaving this page.`}
      tooltipId="planner-unit-chip"
      side="top"
    >
      <Button
        variant="ghost"
        size="sm"
        className={`${styles.chip} ${className ?? ""}`}
        // The visible label is the unit name alone, which reads as a fragment
        // out of context; the accessible name says what the control DOES and
        // still contains the visible text (WCAG 2.5.3 Label in Name).
        aria-label={`Open the ${unitName} unit workspace`}
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          // The chip sits INSIDE a lesson row/tile whose own onClick selects
          // the lesson. Without this, popping the workspace open would also
          // re-select the lesson underneath it (and, on /weekly, swap the
          // resources rail) — two unrelated things from one click.
          e.stopPropagation();
          openUnitWorkspace(subjectId, unit);
        }}
        onDoubleClick={(e: MouseEvent<HTMLButtonElement>) => {
          // Belt and braces, and deliberately NOT load-bearing today: every
          // current host already ignores a dblclick that starts on a control —
          // DayA/DayB/DayC and WeekA/WeekC all guard with `fromInteractive`,
          // which matches `closest("button, …")` and therefore matches this
          // chip, and WeekEditBoard's bare `onDoubleClick` is on the title
          // SPAN, a sibling rather than an ancestor. Verified at all six
          // callsites.
          //
          // It is here because this is a SHARED control: the next host to embed
          // it may have an unguarded `onDoubleClick`, and the failure would be
          // silent and odd — a fast double-tap opens the unit workspace AND
          // renames the lesson underneath it. A component should not depend on
          // every future parent guarding correctly.
          e.stopPropagation();
        }}
      >
        <span className={styles.name}>{unitName}</span>
        {/* Rail + body — the workspace's own silhouette, so the glyph reads as
            "opens the unit workspace" rather than the ⤢ that already means
            "expand" inside it. */}
        <svg
          className={styles.glyph}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="2.2" y="3.4" width="11.6" height="9.2" rx="2.4" />
          <path d="M6.3 3.4v9.2" />
        </svg>
      </Button>
    </Tooltip>
  );
}
