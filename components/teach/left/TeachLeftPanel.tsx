"use client";

// TeachLeftPanel — the collapsible left panel hosting ONE module body
// (docs/teach-view-plan.md §3.1, §6). Wave 1 declutter (item 3): the panel used
// to render a full 7-tab strip (lessons/lesson/boards/notes/groups/class/tools)
// on top of the left icon rail — two switchers for the same modules, "3–7
// simultaneous tabs". The strip is gone. The left RAIL is now the single
// switcher; the panel shows just the ACTIVE module's body under a lean header.
// Opening one module therefore closes the others (the panel is single-mode).
//
// Data-heavy module bodies (Boards, Lesson list) fetch from usePlanner() / the
// `teach` repo themselves; this panel only routes the central state + dispatch
// down to them.

import { type ReactNode, useEffect } from "react";
import type { TeachModuleId } from "@/lib/use-teach-workspace";
import type { TeachWorkspaceState } from "@/lib/teach/types";
import type { TeachWorkspaceAction } from "@/components/teach/TeachWorkspace";
import type { Board } from "@/lib/types";
import { LEFT_MODULE_IDS, LEFT_MODULE_META, isLeftModuleId } from "./modules-meta";
import { moduleIcon } from "./icons";
import { PanelAddMenu } from "./PanelAddMenu";
import {
  LessonCardModule,
  LessonListModule,
  BoardsModule,
  NotesModule,
  GroupsModule,
  ClassModule,
  ToolsModule,
} from "./modules";
import styles from "./TeachLeft.module.css";

// ── Props ────────────────────────────────────────────────────────────────────

export interface TeachLeftPanelProps {
  /** The central workspace state (read-only). */
  state: TeachWorkspaceState;
  /** Dispatch onto the central workspace reducer. */
  dispatch: (action: TeachWorkspaceAction) => void;
  /** The active module shown in the panel. Lifted to the parent so the rail's
   *  active highlight and the panel's body stay in sync. */
  activeModuleId: TeachModuleId;
  /** Change the active module (the rail drives this through the parent). */
  onActiveModuleChange: (moduleId: TeachModuleId) => void;
  /** Pixel width (undefined when collapsed — parent hides the panel then). */
  width?: number;
  // ── Boards: single source of truth (audit A1-left) ─────────────────────────
  // The board set is owned by TeachWorkspace and threaded down so the Boards
  // module, sub-bar pills, footer count, and center board never disagree.
  /** Active lesson's board set (from TeachWorkspace.boards). */
  boards: readonly Board[];
  /** True while TeachWorkspace's first board load is in flight. */
  boardsLoading?: boolean;
  /** Grade level for new boards (active board's grade). */
  boardsGradeLevelId?: string;
  /** Re-read the active set after a mutating repo call. */
  reloadBoards: () => Promise<Board[]>;
  /** Open the Widget Library overlay from the panel-bar "+" menu. Optional —
   *  when absent the "+" is hidden. Wired by the TeachWorkspace lead to the
   *  existing Widget Library overlay. */
  onOpenWidgetLibrary?: () => void;
  // ── Owner identity (Finding 3 fix) ─────────────────────────────────────────
  // Threaded from TeachWorkspace so BoardsModule receives the correct flag-aware
  // owner id instead of the hard-coded `ME.id` slug.
  /** The current teacher's owner id (null while the auth session loads). */
  ownerId: string | null;
}

// Stable id so the body region can be labelled by the header (a11y).
const LEFT_PANEL_BODY_ID = "teach-left-panel-body";
const LEFT_PANEL_HEAD_ID = "teach-left-panel-head";

// ── Module body switch ─────────────────────────────────────────────────────────

function ModuleBody({
  moduleId,
  state,
  dispatch,
  boards,
  boardsLoading,
  boardsGradeLevelId,
  reloadBoards,
  ownerId,
}: {
  moduleId: TeachModuleId;
  state: TeachWorkspaceState;
  dispatch: (action: TeachWorkspaceAction) => void;
  boards: readonly Board[];
  boardsLoading?: boolean;
  boardsGradeLevelId?: string;
  reloadBoards: () => Promise<Board[]>;
  // ── Owner identity (Finding 3 fix) ─────────────────────────────────────────
  // Threaded from TeachWorkspace so BoardsModule receives the correct
  // flag-aware owner id instead of the hard-coded `ME.id` slug.
  ownerId: string | null;
}): ReactNode {
  switch (moduleId) {
    case "lessons":
      return (
        <LessonListModule
          activeLessonId={state.activeLessonId}
          dispatch={dispatch}
        />
      );
    case "lesson":
      return <LessonCardModule activeLessonId={state.activeLessonId} />;
    case "boards":
      return (
        <BoardsModule
          activeLessonId={state.activeLessonId}
          activeBoardId={state.activeBoardId}
          sandbox={state.sandbox}
          dispatch={dispatch}
          boards={boards}
          loading={boardsLoading}
          gradeLevelId={boardsGradeLevelId}
          reloadBoards={reloadBoards}
          ownerId={ownerId}
        />
      );
    case "notes":
      return <NotesModule />;
    case "groups":
      return <GroupsModule />;
    case "class":
      return <ClassModule />;
    case "tools":
      return <ToolsModule />;
    default:
      return null;
  }
}

// ── Panel ───────────────────────────────────────────────────────────────────────

export function TeachLeftPanel({
  state,
  dispatch,
  activeModuleId,
  onActiveModuleChange,
  width,
  boards,
  boardsLoading,
  boardsGradeLevelId,
  reloadBoards,
  onOpenWidgetLibrary,
  ownerId,
}: TeachLeftPanelProps): ReactNode {
  // The active module must be a LEFT module (the rail only ever selects those).
  // Guard defensively: if a stale/right id arrives, fall back to the first left
  // module so the panel never renders a blank body.
  const effectiveActive: TeachModuleId = isLeftModuleId(activeModuleId)
    ? activeModuleId
    : LEFT_MODULE_IDS[0];

  // Keep the lifted active module valid (recover from a stale id).
  useEffect(() => {
    if (!isLeftModuleId(activeModuleId)) {
      onActiveModuleChange(LEFT_MODULE_IDS[0]);
    }
  }, [activeModuleId, onActiveModuleChange]);

  const meta = LEFT_MODULE_META[effectiveActive];

  return (
    <section
      className={styles.panel}
      style={{ width }}
      title="Left panel — the active module's content. Switch modules from the icon rail."
      aria-label="Teach left panel"
    >
      <div className={styles.panelHead} id={LEFT_PANEL_HEAD_ID}>
        <span className={styles.panelHeadTitle}>
          <span aria-hidden="true" className={styles.panelHeadIcon}>
            {moduleIcon(effectiveActive, 15)}
          </span>
          {meta.label}
        </span>

        {/* Panel-bar "+": open the widget library. Hidden until hover/focus on
            desktop; always visible on touch. */}
        <PanelAddMenu
          side="left"
          onOpenWidgetLibrary={onOpenWidgetLibrary}
          triggerClassName={styles.addTrigger}
        />
      </div>

      <div
        className={styles.panelBody}
        id={LEFT_PANEL_BODY_ID}
        role="region"
        aria-labelledby={LEFT_PANEL_HEAD_ID}
        tabIndex={0}
      >
        <ModuleBody
          moduleId={effectiveActive}
          state={state}
          dispatch={dispatch}
          boards={boards}
          boardsLoading={boardsLoading}
          boardsGradeLevelId={boardsGradeLevelId}
          reloadBoards={reloadBoards}
          ownerId={ownerId}
        />
      </div>
    </section>
  );
}
