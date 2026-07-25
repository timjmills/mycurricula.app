"use client";

// UnitWorkspaceHost.tsx — the ONE global mount of the unit workspace (B5.1).
//
// WHAT THIS IS FOR. The workspace (<UnitExplorer>, and everything B1–B3 built
// inside it — the Unit Plan editor, Assessments, Insights, Prep) mounts today at
// exactly two places: YearShell's glass/color frames and HubDocHost. So /daily
// and /weekly cannot reach it at all, and even /year's paper frame can't
// (YearShell early-returns <TimelineYear/> before the mount). This provider puts
// ONE host in the planner layout, so every surface reaches the workspace by
// calling an opener instead of mounting its own copy. Later B5 steps migrate the
// two existing mount sites onto it; until then this host simply coexists with
// them (nobody calls the opener yet, so it renders nothing).
//
// TWO CONTEXTS, following components/composer/ComposerProvider.tsx:
//   • ACTIONS — { openUnitWorkspace, closeUnitWorkspace }. Referentially STABLE
//     (a module constant wrapping the singleton's module-level functions — the
//     same guarantee as the composer's useMemo(…, []), without the allocation),
//     so a card that only needs the opener never re-renders when the open unit
//     changes.
//   • STATE   — the live target. Consumed ONLY by UnitWorkspaceHost.
//
// ZERO DOM AT REST: the target starts null and only an opener sets it, so the
// host renders nothing until a teacher opens a unit.
//
// PROVIDER NESTING (required): the rendered workspace calls usePlanner /
// usePlannerDataState / useUnitNotes / useComposer / the toast contexts (through
// UnitExplorer, its tab bodies, the B3 drawer panels, and the Lesson Planner it
// switches to), so this provider must sit INSIDE all of them —
// app/(planner)/layout.tsx mounts it innermost, inside ComposerProvider.

import { createContext, useContext, type ReactNode } from "react";
import type { SubjectId } from "@/lib/types";
import { UnitExplorer } from "../UnitExplorer";
import {
  closeUnitWorkspace,
  openUnitWorkspace,
  useIsUnitWorkspaceHostRenderer,
  useUnitWorkspaceTarget,
  type UnitWorkspaceTarget,
} from "./workspace-state";

/** The imperative surface consumers reach through `useUnitWorkspace()`. */
export interface UnitWorkspaceActions {
  /** Open the workspace on a unit — or switch the open workspace to another
   *  unit, which never closes or remounts it. Pass `focusLessonId` (B5.7) to
   *  open it on a LESSON instead: the same workspace, mounted in its Lesson
   *  mode with that lesson pinned. Works for a lesson with no unit. */
  openUnitWorkspace: (
    subjectId: SubjectId,
    unit: string,
    focusLessonId?: string,
  ) => void;
  /** Close the workspace (no-op when it is already closed). */
  closeUnitWorkspace: () => void;
}

// Module constant, not a per-provider object: both members are the singleton's
// module-level functions, so this identity can never change.
const ACTIONS: UnitWorkspaceActions = {
  openUnitWorkspace,
  closeUnitWorkspace,
};

const UnitWorkspaceActionsContext = createContext<UnitWorkspaceActions | null>(
  null,
);

// `undefined` is the no-provider sentinel because `null` is a legitimate state
// here (the workspace is closed) — unlike the composer's object-valued state.
const UnitWorkspaceStateContext = createContext<
  UnitWorkspaceTarget | null | undefined
>(undefined);

export function UnitWorkspaceProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  // The provider is the singleton's ONE subscriber; it re-renders on open/close,
  // but `children` is the same element object every time, so React bails out of
  // re-rendering the app below it.
  const target = useUnitWorkspaceTarget();

  return (
    <UnitWorkspaceActionsContext.Provider value={ACTIONS}>
      <UnitWorkspaceStateContext.Provider value={target}>
        {children}
        <UnitWorkspaceHost />
      </UnitWorkspaceStateContext.Provider>
    </UnitWorkspaceActionsContext.Provider>
  );
}

/** Imperative open/close API. Throws outside <UnitWorkspaceProvider>, so a
 *  callsite mounted outside the planner layout fails loudly instead of wiring a
 *  button to a workspace that can never appear. */
export function useUnitWorkspace(): UnitWorkspaceActions {
  const ctx = useContext(UnitWorkspaceActionsContext);
  if (!ctx) {
    throw new Error(
      "useUnitWorkspace must be used inside <UnitWorkspaceProvider>",
    );
  }
  return ctx;
}

/** Internal — the live target, for UnitWorkspaceHost only. Throws outside the
 *  provider so a stray host mount is caught immediately. */
function useUnitWorkspaceState(): UnitWorkspaceTarget | null {
  const ctx = useContext(UnitWorkspaceStateContext);
  if (ctx === undefined) {
    throw new Error(
      "UnitWorkspaceHost must be rendered inside <UnitWorkspaceProvider>",
    );
  }
  return ctx;
}

/**
 * The ONE renderer of the global unit workspace. The provider mounts it; a later
 * B5 step may mount another beside a route, which is what the election is for —
 * `useIsUnitWorkspaceHostRenderer()` resolves true for exactly one mounted host
 * and the rest render nothing, so the open target can never paint twice.
 *
 * `onUnitChange` is NOT optional here. It is UnitExplorer's capability gate
 * (UnitExplorer.tsx `workspaceEnabled`): without it there is no unit/lesson rail
 * and no ⤢ expand toggle, so every entry point routed through this host gets the
 * FULL workspace rather than the Hub's compact dialog. Both handlers are the
 * singleton's module-level functions, so they are stable without a useCallback.
 *
 * The dialog chrome, scrim, portal and theming all come from <ExplorerShell> via
 * UnitExplorer — `.ue-modal` / `.ue-scrim` are enrolled in the surface-theming
 * contract (app/themes.css §5), which a hand-rolled scrim would silently lose.
 */
export function UnitWorkspaceHost(): ReactNode {
  const isRenderer = useIsUnitWorkspaceHostRenderer();
  const target = useUnitWorkspaceState();

  if (!isRenderer || target === null) return null;
  return (
    <UnitExplorer
      subjectId={target.subjectId}
      unit={target.unit}
      focusLessonId={target.focusLessonId}
      onClose={closeUnitWorkspace}
      onUnitChange={openUnitWorkspace}
    />
  );
}
