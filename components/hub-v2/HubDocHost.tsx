"use client";

// HubDocHost.tsx — renders the active hub document (Wave 8).
//
// A LESSON doc reuses the Wave-7 <PlanPage embedded/> verbatim (chromeless: tab
// strip + body, no scrim/header/footer). A UNIT doc does NOT embed inline —
// UnitExplorer is scrim-only (embedding it is a deferred refactor), so a unit
// tab shows a light placeholder that (re)opens the UnitExplorer MODAL. WallDoc
// (/post) is Wave 9 and is not hosted here.

import { useRef, type ReactNode } from "react";
import { PlanPage } from "@/components/lesson-plan-v2";
import { UnitExplorer } from "@/components/year-v2";
import { usePlanner } from "@/lib/planner-store";
import { Button } from "@/components/ui";
import type { SubjectId } from "@/lib/types";
import type { HubDoc } from "./types";
import styles from "./hub.module.css";

export interface HubDocHostProps {
  doc: HubDoc;
  /** Whether a unit doc's explorer modal is open. CONTROLLED by PlannerHub
   *  (keyed per doc) so it (a) defaults open for each newly-opened unit and
   *  (b) STAYS closed on revisit if the teacher closed it — a single internal
   *  useState + a per-doc `key` remount could only do one or the other
   *  (Codex W8 R1 vs R12). Ignored for lesson docs. */
  unitModalOpen: boolean;
  onUnitModalOpenChange: (open: boolean) => void;
}

export function HubDocHost({
  doc,
  unitModalOpen,
  onUnitModalOpenChange,
}: HubDocHostProps): ReactNode {
  const { subjectById } = usePlanner();
  const noteRef = useRef<HTMLDivElement>(null);

  if (doc.kind === "lesson") {
    return (
      <div className={styles.docHost}>
        <PlanPage lessonId={doc.id} embedded />
      </div>
    );
  }

  // Unit doc.
  const subj = subjectById[doc.sid as SubjectId];
  return (
    <div className={styles.docHost}>
      {unitModalOpen && (
        <UnitExplorer
          subjectId={doc.sid as SubjectId}
          unit={doc.id}
          onClose={() => {
            // The invoking browse card is gone (this pane replaced it), so on
            // close land focus on the visible "Open unit explorer" control
            // rather than dropping to <body> (Codex W8 R14).
            onUnitModalOpenChange(false);
            requestAnimationFrame(() =>
              noteRef.current?.querySelector<HTMLButtonElement>("button")?.focus(),
            );
          }}
        />
      )}
      <div ref={noteRef} className={`cp-subj ${subj?.cls ?? ""} ${styles.unitDocNote}`}>
        <p>
          <strong>{doc.title}</strong> opens in the unit explorer — its lessons,
          standards, resources, and notes at a glance.
        </p>
        <Button
          variant="secondary"
          onClick={() => onUnitModalOpenChange(true)}
          tooltip="Reopen the unit explorer"
        >
          Open unit explorer
        </Button>
      </div>
    </div>
  );
}
