"use client";

// HubDocHost.tsx — renders the active hub document (Wave 8).
//
// A LESSON doc reuses the Wave-7 <PlanPage embedded/> verbatim (chromeless: tab
// strip + body, no scrim/header/footer). A UNIT doc does NOT embed inline —
// UnitExplorer is scrim-only (embedding it is a deferred refactor), so a unit
// tab shows a light placeholder that (re)opens the UnitExplorer MODAL. WallDoc
// (/post) is Wave 9 and is not hosted here.
//
// WHY THIS MOUNTS <UnitExplorer> DIRECTLY, AND NOT THE GLOBAL HOST (B5.1).
// Every other entry point — Day, Week, all three Year frames — opens the ONE
// global workspace via useUnitWorkspace().openUnitWorkspace(). The Hub cannot:
// UnitWorkspaceHost passes `onUnitChange` unconditionally, and that prop IS
// UnitExplorer's capability gate (`workspaceEnabled`), so anything routed
// through the host gets the unit/lesson rail + the ⤢ expand toggle. The Hub
// keys its doc TAB on the opened unit and would lie the moment a rail could
// switch units underneath it, so it deliberately renders the classic scrim-only
// dialog instead.
//
// THE COST, AND THE INVARIANT THAT PAYS IT. Mounting directly makes this dialog
// invisible to workspace-state's single-renderer election, which dedupes
// UnitWorkspaceHost INSTANCES, not rendered dialogs. Two <ExplorerShell>s on
// screen would mean two aria-modal dialogs, two focus traps, and two body-scroll
// -lock teardowns — the second restoring `overflow` to a value the first already
// clobbered, leaving the page unscrollable for the rest of the session. So this
// file holds the equivalent invariant itself: WHILE THE HUB'S EXPLORER IS OPEN,
// THE GLOBAL TARGET IS NULL. It closes any open global target, and refuses to
// render its own dialog until that has landed — which also puts the global
// shell's unmount and this one's mount in SEPARATE commits, so the global
// teardown restores `overflow` before this shell captures it.
//
// Not reachable today (the global dialog's scrim covers /planner, so the Hub
// cannot be driven while one is open) — this is the guard for when it is. B5 is
// still widening where the workspace can be opened from.
//
// WHAT THIS GUARD STILL DOES NOT COVER (§4a High, knowingly left open). It is a
// check, not a reservation. If something called `openUnitWorkspace()` in the
// window between this component reading the target and React committing, both
// dialogs would mount for one commit and the effect below would only then close
// the global one. Closing that properly needs ATOMIC arbitration inside
// components/year-v2/workspace-host/workspace-state.ts — a `useSyncExternalStore`
// subscription plus one reservation both explorers take before either commits —
// which is that module's job, not this file's, and belongs with the wider
// refcounted body-scroll-lock work. It is unreachable in the meantime for a
// structural reason worth stating: NOTHING on /planner calls the opener. The
// only three callsites are components/unit-chip/UnitChip, YearShell and
// TimelineYear, and none of them render under this route. Re-check that
// sentence before adding a unit chip to the Hub.

import { useEffect, useRef, type ReactNode } from "react";
import { PlanPage } from "@/components/lesson-plan-v2";
import { UnitExplorer } from "@/components/year-v2";
import {
  getUnitWorkspaceTarget,
  useUnitWorkspace,
  useUnitWorkspaceTarget,
} from "@/components/year-v2/workspace-host";
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
  const { closeUnitWorkspace } = useUnitWorkspace();
  // `useUnitWorkspaceTarget` is SSR-lagged BY DESIGN: it returns null on the
  // server and on the first client render, then subscribes in a mount effect.
  // Reading it alone would leave the gate below blind on precisely the render
  // that matters — a Hub unit tab mounting while a global workspace is already
  // open would paint a second dialog for a frame before the hook caught up,
  // which is the whole failure this file exists to prevent (§4a High).
  //
  // So fall back to the singleton's direct read for that first render. It is
  // safe here specifically because this subtree cannot exist during hydration:
  // PlannerHub's `docs` starts empty, so a doc pane only ever mounts after a
  // user interaction, and there is no server HTML for it to disagree with.
  //
  // `??` and not a replacement — the hook supplies the REACTIVITY (the getter
  // alone would never re-render). It also fails safe in the one racy direction:
  // if the hook is briefly stale-non-null after a close, the gate simply stays
  // shut one extra render rather than opening a second dialog.
  const subscribedTarget = useUnitWorkspaceTarget();
  const globalTarget = subscribedTarget ?? getUnitWorkspaceTarget();

  // `unitModalOpen` is passed for EVERY doc kind (PlannerHub keys it on the tab
  // key, and a lesson tab simply has no entry), so gate on the kind too — a
  // lesson doc must not close a workspace the teacher opened elsewhere.
  const wantsUnitModal = doc.kind === "unit" && unitModalOpen;

  // The invariant (see the header). Both halves matter: the effect closes a
  // global target that is already open OR opens later, and the render gate below
  // keeps this dialog off screen until it has. `closeUnitWorkspace` is the
  // singleton's module-level function, so the dep is referentially stable and
  // this cannot loop — after the close, `globalTarget` is null and the condition
  // is false.
  useEffect(() => {
    if (wantsUnitModal && globalTarget !== null) closeUnitWorkspace();
  }, [wantsUnitModal, globalTarget, closeUnitWorkspace]);

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
      {wantsUnitModal && globalTarget === null && (
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
