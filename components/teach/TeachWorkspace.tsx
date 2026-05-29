"use client";

// TeachWorkspace.tsx — the top-level Teach client component
// (docs/teach-view-plan.md §2.4, §3). It owns:
//   • the central `TeachWorkspaceState` (a useReducer), which every zone reads;
//   • the ONE `DndContext` that carries every drag on the surface (T8 resource
//     → cell, widget reorder, rail-icon rearrange);
//   • the persisted `TeachWorkspaceLayout` via `useTeachWorkspace` (collapse,
//     widths, dock split);
//   • the five-zone shell geometry, with each zone rendered as a clearly-marked
//     STUB. Wave 1 agents replace the stubs with the real chrome / rails /
//     panels / board / canvas (see §14 ownership map).
//
// WAVE-0 CONTRACT: the reducer + state shape below are the frozen integration
// boundary. Wave 1 consumes the state and the dnd ids/payloads from
// `lib/teach/types.ts`; it does not redefine them.

import type { ReactNode } from "react";
import { useEffect, useReducer } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { useDndSensors } from "@/lib/collapse-on-drag";
import { useTeachWorkspace } from "@/lib/use-teach-workspace";
import type {
  BoardLayout,
  BoardTool,
  CenterMode,
  TeachWorkspaceState,
} from "@/lib/teach/types";
import type { TeachResource } from "@/lib/types";
import styles from "./TeachWorkspace.module.css";

// ── Props (deep-link seeds from the server page) ────────────────────────────

export interface TeachWorkspaceProps {
  initialLessonId?: string;
  initialBoardId?: string;
  initialResourceId?: string;
  initialSandbox?: boolean;
}

// ── Central state reducer ───────────────────────────────────────────────────
// The full action surface a zone agent dispatches against. Kept minimal +
// explicit so the contract is legible; Wave 1 extends additively as needed.

export type TeachWorkspaceAction =
  | { type: "selectLesson"; lessonId: string | null }
  | { type: "selectBoard"; boardId: string | null }
  | { type: "setCenterMode"; mode: CenterMode }
  | { type: "openResource"; resource: TeachResource | null }
  | { type: "setLayout"; layout: BoardLayout }
  | { type: "setLeftCollapsed"; collapsed: boolean }
  | { type: "setRightCollapsed"; collapsed: boolean }
  | { type: "focusWidget"; widgetId: string | null }
  | { type: "setPresent"; present: boolean }
  | { type: "setFullscreen"; fullscreen: boolean }
  | { type: "setTool"; tool: BoardTool }
  | { type: "enterSandbox" }
  | { type: "exitSandbox" }
  | { type: "setSandboxDirty"; dirty: boolean };

function reducer(
  state: TeachWorkspaceState,
  action: TeachWorkspaceAction,
): TeachWorkspaceState {
  switch (action.type) {
    case "selectLesson":
      return { ...state, activeLessonId: action.lessonId };
    case "selectBoard":
      return { ...state, activeBoardId: action.boardId };
    case "setCenterMode":
      return { ...state, centerMode: action.mode };
    case "openResource":
      return {
        ...state,
        activeResource: action.resource,
        // Opening a resource flips the center to resource mode; clearing it
        // returns to the board grid.
        centerMode: action.resource ? "resource" : "board",
      };
    case "setLayout":
      return { ...state, layout: action.layout };
    case "setLeftCollapsed":
      return { ...state, leftCollapsed: action.collapsed };
    case "setRightCollapsed":
      return { ...state, rightCollapsed: action.collapsed };
    case "focusWidget":
      return { ...state, focusedWidgetId: action.widgetId };
    case "setPresent":
      return { ...state, present: action.present };
    case "setFullscreen":
      return { ...state, fullscreen: action.fullscreen };
    case "setTool":
      return { ...state, activeTool: action.tool };
    case "enterSandbox":
      return {
        ...state,
        sandbox: true,
        activeLessonId: null,
        activeBoardId: null,
      };
    case "exitSandbox":
      return { ...state, sandbox: false, sandboxDirty: false };
    case "setSandboxDirty":
      return { ...state, sandboxDirty: action.dirty };
    default:
      return state;
  }
}

function initState(props: TeachWorkspaceProps): TeachWorkspaceState {
  return {
    activeLessonId: props.initialLessonId ?? null,
    activeBoardId: props.initialBoardId ?? null,
    centerMode: props.initialResourceId ? "resource" : "board",
    activeResource: null,
    layout: "2x2",
    leftCollapsed: false,
    rightCollapsed: false,
    focusedWidgetId: null,
    present: false,
    fullscreen: false,
    activeTool: "select",
    sandbox: !!props.initialSandbox,
    sandboxDirty: false,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * The Teach workspace shell. Wave 0 ships the skeleton + frozen contract; the
 * zone bodies are stubs replaced by Wave 1.
 */
export function TeachWorkspace(props: TeachWorkspaceProps): ReactNode {
  const [state, dispatch] = useReducer(reducer, props, initState);
  const workspace = useTeachWorkspace();
  const sensors = useDndSensors();

  // Keep the central collapse flags in sync with the persisted layout — the
  // shell reads from the central state, the persisted store is the source of
  // truth for the default split. (Post-mount only; SSR uses the defaults.)
  useEffect(() => {
    dispatch({
      type: "setLeftCollapsed",
      collapsed: workspace.layout.leftCollapsed,
    });
    dispatch({
      type: "setRightCollapsed",
      collapsed: workspace.layout.rightCollapsed,
    });
  }, [workspace.layout.leftCollapsed, workspace.layout.rightCollapsed]);

  function handleDragStart(): void {
    // STUB — Wave 1 (Agents C/E) own drag visuals + active-id tracking.
    // Signature widens to (event: DragStartEvent) when they wire it.
  }

  function handleDragEnd(): void {
    // STUB — Wave 1 owns the drop resolution:
    //   • resource → board cell (parseBoardCellDroppableId, Agent C),
    //   • widget reorder within the grid (Agent C),
    //   • rail-icon rearrange (workspace.moveRailIcon, Agents B/E).
    // The ids/payloads are defined in lib/teach/types.ts.
  }

  const leftWidth = state.leftCollapsed
    ? undefined
    : workspace.layout.panelWidths.left;
  const rightWidth = state.rightCollapsed
    ? undefined
    : workspace.layout.panelWidths.right;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className={`${styles.root} ${state.present ? styles.present : ""}`}
        data-sandbox={state.sandbox ? "true" : undefined}
        title="The live teaching workspace — boards, resources, and class context for delivering a lesson"
      >
        {/* ── Top bar (STUB — Wave 1 Agent A: TeachTopBar) ─────────────── */}
        <header className={styles.topBar}>
          <span className={styles.stubLabel}>Teach</span>
          {state.sandbox ? (
            <span className={styles.stubLabel}>· Sandbox · not saved</span>
          ) : null}
        </header>

        {/* ── Sub bar (STUB — Wave 1 Agent A: TeachSubBar) ─────────────── */}
        <div className={styles.subBar}>
          <span className={styles.stubLabel}>
            board tabs · layout · present
          </span>
        </div>

        {/* ── Body row ─────────────────────────────────────────────────── */}
        <div className={styles.body}>
          {/* Left icon rail (STUB — Wave 1 Agent B: TeachLeftRail) */}
          <nav
            className={styles.rail}
            title="Lesson context: lessons, boards, notes, groups, and tools"
          >
            <span className={styles.stubLabel}>rail</span>
          </nav>

          {/* Left panel (STUB — Wave 1 Agent B: left panel modules) */}
          {!state.leftCollapsed ? (
            <section
              className={styles.panel}
              style={{ width: leftWidth }}
              title="Left panel — lesson, boards, notes, groups"
            >
              <span className={styles.stubLabel}>left panel</span>
            </section>
          ) : null}

          {/* Center (STUB — Wave 1 Agent C: TeachingBoard / Agent D:
              BoardCanvasResource + AnnotationLayer, switched on centerMode) */}
          <main className={styles.center}>
            <div className={styles.centerStub}>
              <span className={styles.stubLabel}>
                center · {state.centerMode} · {state.layout}
              </span>
            </div>
          </main>

          {/* Right panel (STUB — Wave 1 Agent E: right panel modules) */}
          {!state.rightCollapsed ? (
            <section
              className={`${styles.panel} ${styles.panelRight}`}
              style={{ width: rightWidth }}
              title="Right panel — resources, chat, to-do"
            >
              <span className={styles.stubLabel}>right panel</span>
            </section>
          ) : null}

          {/* Right icon rail (STUB — Wave 1 Agent E: TeachRightRail) */}
          <nav
            className={`${styles.rail} ${styles.railRight}`}
            title="Resources, chat, and to-do for this lesson"
          >
            <span className={styles.stubLabel}>rail</span>
          </nav>
        </div>

        {/* ── Footer (STUB — Wave 1 Agent A: TeachFooter) ──────────────── */}
        <footer className={styles.footer}>
          <span className={styles.stubLabel}>panels · saved · ⌘P present</span>
        </footer>
      </div>

      {/* DragOverlay seam — Wave 1 renders the dragged card/widget ghost. */}
      <DragOverlay>{null}</DragOverlay>
    </DndContext>
  );
}
