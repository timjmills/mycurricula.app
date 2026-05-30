"use client";

// TeachWorkspace.tsx — the top-level Teach client component
// (docs/teach-view-plan.md §2.4, §3). It owns:
//   • the central `TeachWorkspaceState` (a useReducer), which every zone reads;
//   • the ONE `DndContext` that carries every drag on the surface (T8 resource
//     → cell, widget reorder, rail-icon rearrange);
//   • the persisted `TeachWorkspaceLayout` via `useTeachWorkspace` (collapse,
//     widths, dock split);
//   • the five-zone shell geometry, composing the Wave 1 chrome / rails /
//     panels / board / canvas (see §14 ownership map).
//
// WAVE-0 CONTRACT: the reducer + state shape below are the frozen integration
// boundary. Wave 1 consumes the state and the dnd ids/payloads from
// `lib/teach/types.ts`; it does not redefine them. Wave 2 (this file) wires the
// zones together against that contract.

import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useDndSensors } from "@/lib/collapse-on-drag";
import {
  TEACH_MODULE_IDS,
  useTeachWorkspace,
  type TeachModuleId,
} from "@/lib/use-teach-workspace";
import { useBoardAnnotations } from "@/lib/use-board-annotations";
import { useTeachShortcuts } from "@/lib/use-teach-shortcuts";
import { usePlanner } from "@/lib/planner-store";
import { useAppState } from "@/lib/app-state";
import { ME } from "@/lib/mock/teachers";
import { teach } from "@/lib/teach/queries";
import {
  parseBoardCellDroppableId,
  type BoardCellTarget,
  type BoardLayout,
  type BoardTool,
  type CenterMode,
  type TeachDragData,
  type TeachWorkspaceState,
} from "@/lib/teach/types";
import type { Board, SubjectId, TeachResource, Widget } from "@/lib/types";

import {
  PresentBar,
  TeachFooter,
  TeachSubBar,
  TeachTopBar,
  type TeachFooterModule,
} from "./chrome";
import { TeachLeftPanel, TeachLeftRail } from "./left";
import { TeachRightPanel, TeachRightRail } from "./right";
import { TeachingBoard, WidgetPicker } from "./board";
import { BoardCanvasResource, ResourceViewerToolbar } from "./canvas";
import {
  AnnotationLayer,
  ANNOTATION_SWATCHES,
  BoardToolbar,
  ToolDock,
  type AnnotationSwatch,
} from "./annotation";
import styles from "./TeachWorkspace.module.css";

// ── Props (deep-link seeds from the server page) ────────────────────────────

export interface TeachWorkspaceProps {
  initialLessonId?: string;
  initialBoardId?: string;
  initialResourceId?: string;
  initialSandbox?: boolean;
}

// The default seeded lesson with the rich board mix, so a deep-link-less open
// lands on a populated preview (Wave-2 wiring requirement 1).
const DEFAULT_LESSON_ID = "m-12-0";

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
      // Switching lessons drops the stale board selection so the load effect
      // re-selects the first board of the new lesson.
      return { ...state, activeLessonId: action.lessonId, activeBoardId: null };
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
 * The composed Teach workspace shell. Wave 0 ships the skeleton + frozen
 * contract; Wave 2 mounts the real zone components against that state.
 */
export function TeachWorkspace(props: TeachWorkspaceProps): ReactNode {
  const [state, dispatch] = useReducer(reducer, props, initState);
  const workspace = useTeachWorkspace();
  const sensors = useDndSensors();
  const { lessons } = usePlanner();
  const { week, selectedDay, currentUser } = useAppState();

  const rootRef = useRef<HTMLDivElement>(null);
  const resourceContainerRef = useRef<HTMLDivElement>(null);
  const ownerId = ME.id;

  // ── Boards for the active lesson (repo-driven, effect-loaded) ──────────────
  const [boards, setBoards] = useState<Board[]>([]);
  // Local widget-picker target (the board calls onAddWidget; this file owns the
  // picker mount because TeachingBoard renders only the cells, not the picker).
  const [pickerTarget, setPickerTarget] = useState<BoardCellTarget | null>(
    null,
  );
  // Active drag payload, surfaced through the DragOverlay ghost.
  const [activeDrag, setActiveDrag] = useState<TeachDragData | null>(null);

  // Lifted module focus for each side (rail highlight ↔ panel body stay in sync).
  const [leftActiveModule, setLeftActiveModule] =
    useState<TeachModuleId>("lessons");
  const [rightActiveModule, setRightActiveModule] =
    useState<TeachModuleId>("resources");

  // Annotation surface state — colour + width are local UI prefs; the stroke
  // document lives in the hook (per-surface, persisted).
  const [colorId, setColorId] = useState<string>(ANNOTATION_SWATCHES[0].id);
  const [strokeWidth, setStrokeWidth] = useState<number>(4);

  // ── Keep central collapse flags synced with the persisted layout ───────────
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

  // ── Default lesson seed (only when not deep-linked + not sandbox) ──────────
  useEffect(() => {
    if (state.activeLessonId == null && !state.sandbox) {
      dispatch({ type: "selectLesson", lessonId: DEFAULT_LESSON_ID });
    }
    // Run once on mount; subsequent nulls (sandbox exit) are user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load boards for the active lesson ──────────────────────────────────────
  const activeLessonId = state.activeLessonId;
  useEffect(() => {
    if (activeLessonId == null) {
      setBoards([]);
      return;
    }
    let alive = true;
    void teach
      .listBoardsForLesson(activeLessonId, ownerId)
      .then((next) => {
        if (alive) setBoards(next);
      })
      .catch(() => {
        if (alive) setBoards([]);
      });
    return () => {
      alive = false;
    };
  }, [activeLessonId, ownerId]);

  // Re-fetch the active lesson's boards (used after a mutating repo call).
  const reloadBoards = useCallback(async (): Promise<Board[]> => {
    if (activeLessonId == null) return [];
    const next = await teach.listBoardsForLesson(activeLessonId, ownerId);
    setBoards(next);
    return next;
  }, [activeLessonId, ownerId]);

  // Select the first board once a set loads and nothing is selected yet.
  useEffect(() => {
    if (state.activeBoardId == null && boards.length > 0) {
      dispatch({ type: "selectBoard", boardId: boards[0].id });
    }
  }, [boards, state.activeBoardId]);

  // ── Derived board / widget / subject ──────────────────────────────────────
  const activeBoard: Board | null = useMemo(
    () => boards.find((b) => b.id === state.activeBoardId) ?? boards[0] ?? null,
    [boards, state.activeBoardId],
  );
  const widgets: Widget[] = activeBoard?.widgets ?? [];

  const subject: SubjectId | undefined = useMemo(
    () => lessons.find((l) => l.id === activeLessonId)?.subject,
    [lessons, activeLessonId],
  );

  const boardIndex = activeBoard
    ? Math.max(
        0,
        boards.findIndex((b) => b.id === activeBoard.id),
      ) + 1
    : 0;
  const boardCount = boards.length;

  // ── Annotation hook (resource center mode) ─────────────────────────────────
  const activeResource = state.activeResource;
  const annotations = useBoardAnnotations({
    lessonId: activeLessonId ?? "sandbox",
    boardId: state.activeBoardId ?? "none",
    resourceId: activeResource?.resourceId ?? activeResource?.url,
  });
  const resolvedColor = useMemo(() => {
    const swatch =
      ANNOTATION_SWATCHES.find((s) => s.id === colorId) ??
      ANNOTATION_SWATCHES[0];
    return `var(${swatch.token})`;
  }, [colorId]);

  // ── Fullscreen API (owned here, the targeted element lives in this file) ───
  const toggleFullscreen = useCallback((next: boolean): void => {
    dispatch({ type: "setFullscreen", fullscreen: next });
    const el = rootRef.current;
    if (!el) return;
    try {
      if (next) {
        if (typeof el.requestFullscreen === "function") {
          void el.requestFullscreen();
        }
      } else if (
        typeof document !== "undefined" &&
        document.fullscreenElement &&
        typeof document.exitFullscreen === "function"
      ) {
        void document.exitFullscreen();
      }
    } catch {
      // Fullscreen can reject (permissions / not user-activated) — the
      // reducer flag is the source of truth for the chrome, so swallow.
    }
  }, []);

  const exitFullscreen = useCallback((): void => {
    if (
      typeof document !== "undefined" &&
      document.fullscreenElement &&
      typeof document.exitFullscreen === "function"
    ) {
      void document.exitFullscreen();
    }
  }, []);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  const boardIds = useMemo(() => boards.map((b) => b.id), [boards]);
  const onFocusModule = useCallback(
    (module: "lessons" | "boards" | "resources" | "chat" | "todo"): void => {
      if (module === "resources" || module === "chat" || module === "todo") {
        setRightActiveModule(module);
        if (state.rightCollapsed) workspace.toggleRightCollapsed();
      } else {
        setLeftActiveModule(module);
        if (state.leftCollapsed) workspace.toggleLeftCollapsed();
      }
    },
    [state.leftCollapsed, state.rightCollapsed, workspace],
  );
  useTeachShortcuts({
    state,
    dispatch,
    boardIds,
    onFocusModule,
    onExitFullscreen: exitFullscreen,
  });

  // ── Chrome callbacks ───────────────────────────────────────────────────────
  const handleAddBoard = useCallback(async (): Promise<void> => {
    if (activeLessonId == null) return;
    await teach.createBoard({
      masterLessonId: activeLessonId,
      ownerId,
      scope: "personal",
      title: `Board ${boards.length + 1}`,
      displayOrderWithinLesson: boards.length,
      templateId: null,
      gradeLevelId: activeBoard?.gradeLevelId ?? "g5",
    });
    const next = await reloadBoards();
    const created = next[next.length - 1];
    if (created) dispatch({ type: "selectBoard", boardId: created.id });
  }, [activeLessonId, ownerId, boards.length, activeBoard, reloadBoards]);

  const togglePanels = useCallback((): void => {
    workspace.toggleLeftCollapsed();
    workspace.toggleRightCollapsed();
  }, [workspace]);

  // ── Board widget callbacks ─────────────────────────────────────────────────
  const handleAddWidget = useCallback((target: BoardCellTarget): void => {
    setPickerTarget(target);
  }, []);

  const handleRemoveWidget = useCallback(
    async (widget: Widget): Promise<void> => {
      await teach.deleteWidget(widget.id);
      await reloadBoards();
    },
    [reloadBoards],
  );

  const handleTogglePin = useCallback(
    async (widget: Widget): Promise<void> => {
      await teach.updateWidget(widget.id, { pinned: !widget.pinned });
      await reloadBoards();
    },
    [reloadBoards],
  );

  // ── Embed a resource onto the active board (explicit T8 path) ──────────────
  const embedResourceAtCell = useCallback(
    async (resource: TeachResource, target: BoardCellTarget): Promise<void> => {
      const widget: Widget = {
        id: `w-embed-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
        boardId: target.boardId,
        type: "embed",
        title: resource.label,
        position: { col: target.col, row: target.row, colSpan: 1, rowSpan: 1 },
        displayOrder: widgets.length,
        pinned: false,
        config: {
          url: resource.url ?? "",
          label: resource.label,
          kind: resource.kind,
        },
        state: {},
        persistence: "inherit",
        gradeLevelId: activeBoard?.gradeLevelId ?? "g5",
      };
      await teach.upsertWidget(widget);
      await reloadBoards();
    },
    [widgets.length, activeBoard, reloadBoards],
  );

  const handleEmbedResource = useCallback(
    (resource: TeachResource): void => {
      if (!activeBoard) return;
      // Land it at the first cell of the active board (explicit button path).
      void embedResourceAtCell(resource, {
        boardId: activeBoard.id,
        col: 0,
        row: 0,
      });
    },
    [activeBoard, embedResourceAtCell],
  );

  // ── DnD drop resolution ────────────────────────────────────────────────────
  function handleDragStart(event: DragStartEvent): void {
    const data = event.active.data.current as TeachDragData | undefined;
    setActiveDrag(data ?? null);
  }

  function handleDragEnd(event: DragEndEvent): void {
    setActiveDrag(null);
    const data = event.active.data.current as TeachDragData | undefined;
    if (!data) return;
    const overId = event.over?.id;

    try {
      if (data.kind === "resource") {
        if (typeof overId !== "string") return;
        const cell = parseBoardCellDroppableId(overId);
        if (!cell) return;
        void embedResourceAtCell(data.resource, cell);
        return;
      }

      if (data.kind === "widget") {
        if (typeof overId !== "string") return;
        const cell = parseBoardCellDroppableId(overId);
        if (!cell) return;
        void teach
          .updateWidget(data.widgetId, {
            position: { col: cell.col, row: cell.row, colSpan: 1, rowSpan: 1 },
          })
          .then(() => reloadBoards());
        return;
      }

      if (data.kind === "rail-icon") {
        if (typeof overId !== "string") return;
        const moduleId = data.moduleId;
        if (!(TEACH_MODULE_IDS as readonly string[]).includes(moduleId)) return;
        // Resolve the destination side from the over droppable id when it
        // encodes one (e.g. "rail-left" / "rail-right"); otherwise no-op.
        const side = overId.includes("right")
          ? "right"
          : overId.includes("left")
            ? "left"
            : null;
        if (!side) return;
        const order =
          side === "left"
            ? workspace.layout.iconRailLeftOrder
            : workspace.layout.iconRailRightOrder;
        workspace.moveRailIcon(moduleId as TeachModuleId, side, order.length);
        return;
      }
    } catch {
      // Drops must never throw on an unrecognized target.
    }
  }

  // ── Module footer dots (open panels) ───────────────────────────────────────
  const footerModules: TeachFooterModule[] = useMemo(() => {
    const mods: TeachFooterModule[] = [];
    if (!state.leftCollapsed) {
      mods.push({
        id: leftActiveModule,
        label: leftActiveModule,
        active: true,
      });
    }
    if (!state.rightCollapsed) {
      mods.push({
        id: rightActiveModule,
        label: rightActiveModule,
        active: true,
      });
    }
    return mods;
  }, [
    state.leftCollapsed,
    state.rightCollapsed,
    leftActiveModule,
    rightActiveModule,
  ]);

  // The persisted layout types its rail orders as `string[]`; the hook
  // normalizes to known module ids on write, so narrow back to `TeachModuleId[]`
  // (defensively filtering any stale id) before passing to the typed rails.
  const isModuleId = useCallback(
    (v: string): v is TeachModuleId =>
      (TEACH_MODULE_IDS as readonly string[]).includes(v),
    [],
  );
  const rightOrder = useMemo<TeachModuleId[]>(
    () => workspace.layout.iconRailRightOrder.filter(isModuleId),
    [workspace.layout.iconRailRightOrder, isModuleId],
  );

  const leftWidth = state.leftCollapsed
    ? undefined
    : workspace.layout.panelWidths.left;
  const rightWidth = state.rightCollapsed
    ? undefined
    : workspace.layout.panelWidths.right;

  const avatarInitials = currentUser.initials || ME.initials;
  const subjClass = subject ? `cp-subj ${subject}` : undefined;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        ref={rootRef}
        className={`${styles.root} ${subjClass ?? ""} ${
          state.present ? styles.present : ""
        }`}
        data-sandbox={state.sandbox ? "true" : undefined}
        title="The live teaching workspace — boards, resources, and class context for delivering a lesson"
      >
        {/* ── Chrome: present strip OR top + sub bars ───────────────────── */}
        {state.present ? (
          <div className={styles.presentStrip}>
            <PresentBar
              dispatch={dispatch}
              boardName={activeBoard?.title ?? "Board"}
              subject={subject}
              slideIndex={boardIndex}
              slideCount={boardCount}
              onPrev={() => {
                const prev = boards[boardIndex - 2];
                if (prev) dispatch({ type: "selectBoard", boardId: prev.id });
              }}
              onNext={() => {
                const nextBoard = boards[boardIndex];
                if (nextBoard)
                  dispatch({ type: "selectBoard", boardId: nextBoard.id });
              }}
            />
          </div>
        ) : (
          <>
            <header className={styles.topBarSlot}>
              <TeachTopBar
                gradeLabel="Grade 5"
                avatarInitials={avatarInitials}
                teacherName={currentUser.name}
              />
            </header>
            <div className={styles.subBarSlot}>
              <TeachSubBar
                state={state}
                dispatch={dispatch}
                boards={boards}
                subject={subject}
                weekLabel={`Week ${week}`}
                subjectLabel={subject ? subject : "Subject"}
                onAddBoard={() => void handleAddBoard()}
                onToggleFullscreen={toggleFullscreen}
              />
            </div>
          </>
        )}

        {/* ── Body row ─────────────────────────────────────────────────── */}
        <div className={styles.body}>
          {/* Left icon rail */}
          {!state.present ? (
            <TeachLeftRail
              activeModuleId={state.leftCollapsed ? null : leftActiveModule}
              onSelectModule={(id) => {
                setLeftActiveModule(id);
                if (state.leftCollapsed) workspace.toggleLeftCollapsed();
              }}
            />
          ) : null}

          {/* Left panel */}
          {!state.present && !state.leftCollapsed ? (
            <TeachLeftPanel
              state={state}
              dispatch={dispatch}
              workspace={workspace}
              activeModuleId={leftActiveModule}
              onActiveModuleChange={setLeftActiveModule}
              width={leftWidth}
            />
          ) : null}

          {/* Center — board grid OR full-bleed resource canvas */}
          <main className={styles.center}>
            {state.centerMode === "resource" && activeResource ? (
              <div ref={resourceContainerRef} className={styles.resourceStage}>
                <ResourceViewerToolbar
                  state={state}
                  dispatch={dispatch}
                  resource={activeResource}
                  onToggleFullscreen={() => toggleFullscreen(!state.fullscreen)}
                />
                <div className={styles.resourceCanvasWrap}>
                  <BoardCanvasResource
                    resource={activeResource}
                    className={styles.resourceCanvas}
                  />
                  <div className={styles.annotationOverlay}>
                    <AnnotationLayer
                      annotations={annotations}
                      tool={state.activeTool}
                      color={resolvedColor}
                      width={strokeWidth}
                    />
                  </div>
                  <ToolDock
                    state={state}
                    dispatch={dispatch}
                    dragConstraints={resourceContainerRef}
                  />
                </div>
                <BoardToolbar
                  state={state}
                  dispatch={dispatch}
                  annotations={annotations}
                  colorId={colorId}
                  onColorChange={(swatch: AnnotationSwatch) =>
                    setColorId(swatch.id)
                  }
                  width={strokeWidth}
                  onWidthChange={setStrokeWidth}
                />
              </div>
            ) : (
              <TeachingBoard
                state={state}
                dispatch={dispatch}
                board={activeBoard}
                widgets={widgets}
                subjectId={subject}
                onAddWidget={handleAddWidget}
                onTogglePin={(w) => void handleTogglePin(w)}
                onRemove={(w) => void handleRemoveWidget(w)}
              />
            )}
          </main>

          {/* Right panel */}
          {!state.present && !state.rightCollapsed ? (
            <TeachRightPanel
              order={rightOrder}
              activeModuleId={rightActiveModule}
              onActivateModule={setRightActiveModule}
              collapsed={state.rightCollapsed}
              onCollapse={workspace.toggleRightCollapsed}
              width={rightWidth}
              activeLessonId={activeLessonId}
              onMagnifyResource={(resource) =>
                dispatch({ type: "openResource", resource })
              }
              onEmbedResource={handleEmbedResource}
              week={week}
              day={selectedDay}
            />
          ) : null}

          {/* Right icon rail */}
          {!state.present ? (
            <TeachRightRail
              order={rightOrder}
              activeModuleId={state.rightCollapsed ? null : rightActiveModule}
              onActivateModule={(id) => {
                setRightActiveModule(id);
                if (state.rightCollapsed) workspace.toggleRightCollapsed();
              }}
            />
          ) : null}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        {!state.present ? (
          <footer className={styles.footerSlot}>
            <TeachFooter
              boardIndex={boardIndex}
              boardCount={boardCount}
              modules={footerModules}
              panelsCollapsed={state.leftCollapsed && state.rightCollapsed}
              onTogglePanels={togglePanels}
              onSelectModule={(id) => onFocusModule(id as never)}
            />
          </footer>
        ) : null}

        {/* Widget picker — owned here because the board emits target cells. */}
        {pickerTarget ? (
          <WidgetPicker
            target={pickerTarget}
            gradeLevelId={activeBoard?.gradeLevelId ?? "g5"}
            nextDisplayOrder={widgets.length}
            onClose={() => setPickerTarget(null)}
            onCreated={() => {
              setPickerTarget(null);
              void reloadBoards();
            }}
          />
        ) : null}
      </div>

      {/* DragOverlay ghost — a lightweight label for the active payload. */}
      <DragOverlay>
        {activeDrag ? (
          <div className={styles.dragGhost}>
            {activeDrag.kind === "resource"
              ? activeDrag.resource.label
              : activeDrag.kind === "rail-icon"
                ? activeDrag.moduleId
                : "Widget"}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
