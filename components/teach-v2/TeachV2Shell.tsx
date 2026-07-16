"use client";

// components/teach-v2/TeachV2Shell.tsx — the v2 Teach board shell (Wave 11).
//
// A RE-SKIN of the shipped Teach engines into the artboard's two-column layout
// (`lessonW px | 1fr`): a minimizable/pinnable lesson rail on the left, a board
// column on the right (header + slide filmstrip + stage + writing bar). Every
// engine is COMPOSED unchanged:
//   • lesson rail   → LessonRail (LessonListModule + ResourcesModule).
//   • stage (board) → <BoardEditor embedded> (its fit-to-width scale system) with
//                     an <AnnotationLayer> "projector glass" overlay bound to the
//                     writing bar, keyed PER PAGE via useBoardAnnotations.
//   • stage (resource, centerMode==="resource") → BoardCanvasResource +
//                     AnnotationLayer + BoardToolbar (the shipped resource
//                     surface, unchanged).
//   • filmstrip     → SlideFilmstrip (real board pages via editor intents).
//
// It mounts INSIDE TeachWorkspace's single DndContext (touch-drag of resource
// cards flows through that context) and adds NO second one. NET-NEW over the
// artboard: pinch-zoom (usePinchZoom) and touch-drag (the existing dnd-kit
// context). The artboard's Share button is omitted (Wave 9b deferred).

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { DragOverlay } from "@dnd-kit/core";
import { useBoardAnnotations } from "@/lib/use-board-annotations";
import { SUBJECT_BY_ID } from "@/lib/mock";
import { Button, Tooltip } from "@/components/ui";
import {
  BoardEditor,
  type BoardEditorIntent,
} from "@/components/teach/board/editor";
import {
  AnnotationLayer,
  ANNOTATION_SWATCHES,
  BoardToolbar,
} from "@/components/teach/annotation";
import {
  BoardCanvasResource,
  ResourceViewerToolbar,
} from "@/components/teach/canvas";
import type { TeachZonesProps } from "@/components/teach/zones-contract";
import { TeachOverlays } from "@/components/teach/TeachOverlays";
import { LessonRail } from "./LessonRail";
import { BoardSwitcher } from "./BoardSwitcher";
import { SlideFilmstrip } from "./SlideFilmstrip";
import { WritingBar } from "./WritingBar";
import { BoardTimer } from "./BoardTimer";
import { usePinchZoom } from "./usePinchZoom";
import { V2Icon } from "./icons";
import styles from "./TeachV2Shell.module.css";

// Resizer bounds mirror the artboard: min 210px, max 62% of the shell width.
const LESSON_MIN = 210;
const LESSON_MAX_FRACTION = 0.62;
const LESSON_DEFAULT = 320;
const BOARD_INK_WIDTH = 4;

export function TeachV2Shell(props: TeachZonesProps): ReactNode {
  const {
    state,
    dispatch,
    rootRef,
    viewport,
    subject,
    boards,
    activeBoard,
    pages,
    resolvedPageId,
    editorResources,
    onEditorIntent,
    onEmbedResource,
    annotations: resourceAnnotations,
    colorId: resColorId,
    onColorChange: onResColorChange,
    strokeWidth: resStrokeWidth,
    onStrokeWidthChange: onResStrokeWidthChange,
    resolvedColor: resResolvedColor,
    activeDrag,
    libraryOverlay,
    boardSettingsOpen,
    helpOpen,
    toggleFullscreen,
    onOpenWidgetLibrary,
    onOpenBoardLibrary,
    onAddBoard,
    onStartBlankBoard,
    canCreateBoard,
    onBoardSettings,
  } = props;

  // The active annotation tool is a slice of the central state (no separate
  // contract field) — the writing bar + both annotation layers read it.
  const activeTool = state.activeTool;

  // ── V2-local UI state (presentational; never in the frozen contract) ──────
  const [minimized, setMinimized] = useState(false);
  const [pinned, setPinned] = useState(false);
  // `boardExpanded` = the artboard's in-layout "full" (hide the lesson pane).
  const [boardExpanded, setBoardExpanded] = useState(false);
  // `trueFull` = the CSS fixed-inset projector takeover (Esc exits).
  const [trueFull, setTrueFull] = useState(false);
  const [mobLesson, setMobLesson] = useState(false);
  const [lessonW, setLessonW] = useState(LESSON_DEFAULT);
  const [inkColorId, setInkColorId] = useState<string>(ANNOTATION_SWATCHES[0].id);
  const [inkResolved, setInkResolved] = useState<string>(
    `var(${ANNOTATION_SWATCHES[0].token})`,
  );

  const centerMode = state.centerMode;
  const activeResource = state.activeResource;

  // ── Board-page annotation hook (the writing bar drives this) ──────────────
  // Keyed on lesson:board:page so ink is PER SLIDE and survives navigation,
  // exactly like the artboard's per-slide store — but persisted + user-scoped
  // via the real engine (resourceId slot carries the page id).
  const boardInk = useBoardAnnotations({
    lessonId: state.activeLessonId ?? "sandbox",
    boardId: state.activeBoardId ?? "none",
    resourceId: resolvedPageId ?? "page",
  });

  // Resolve the ink token → a concrete colour string. The canvas 2D context
  // cannot parse `var(--token)`, so we read the computed value off the shell.
  useEffect(() => {
    const swatch =
      ANNOTATION_SWATCHES.find((s) => s.id === inkColorId) ??
      ANNOTATION_SWATCHES[0];
    const root = rootRef.current;
    if (!root) {
      setInkResolved(`var(${swatch.token})`);
      return;
    }
    const value = getComputedStyle(root).getPropertyValue(swatch.token).trim();
    setInkResolved(value || `var(${swatch.token})`);
  }, [inkColorId, rootRef]);

  // Pass the board-ink draft-canceller so a pinch (2nd pointer) discards any
  // stroke the first finger started with a draw tool active (BUG-2).
  const pinch = usePinchZoom(boardInk.cancelStroke);

  // ── Escape LAYERING (top-layer-only) ──────────────────────────────────────
  // A popover open ON TOP of true-fullscreen must eat Esc FIRST — Esc closes
  // exactly one layer, topmost. The v2 popovers (writing-bar Add-Resource /
  // Background, timer duration, board switcher) signal their open state up here;
  // the library / board-settings / help overlays ride the contract (TeachOverlays
  // owns their Esc). While ANY of those is open, the true-fullscreen handler
  // DEFERS so the top layer's own Esc closes it and fullscreen stays. A ref
  // mirrors the live value so the capture-phase handler (bound once per trueFull)
  // reads it fresh.
  const [openPopovers, setOpenPopovers] = useState({
    writing: false,
    timer: false,
    switcher: false,
  });
  const setPopoverOpen = useCallback(
    (key: "writing" | "timer" | "switcher", open: boolean): void => {
      setOpenPopovers((p) => (p[key] === open ? p : { ...p, [key]: open }));
    },
    [],
  );
  const onWritingPopover = useCallback(
    (o: boolean) => setPopoverOpen("writing", o),
    [setPopoverOpen],
  );
  const onTimerPopover = useCallback(
    (o: boolean) => setPopoverOpen("timer", o),
    [setPopoverOpen],
  );
  const onSwitcherPopover = useCallback(
    (o: boolean) => setPopoverOpen("switcher", o),
    [setPopoverOpen],
  );
  const deferEscRef = useRef(false);
  deferEscRef.current =
    !!libraryOverlay ||
    boardSettingsOpen ||
    helpOpen ||
    openPopovers.writing ||
    openPopovers.timer ||
    openPopovers.switcher;

  // ── True-fullscreen Esc — TOP layer only (Escape layering, Wave 9a bug) ────
  // Capture phase so this can win over lower layers — but it DEFERS (returns
  // without consuming) while a popover/library sits on top, letting that layer's
  // own Esc handler close it first. Only when nothing is above does it exit.
  useEffect(() => {
    if (!trueFull) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      if (deferEscRef.current) return; // a popover/library is on top — it eats Esc
      e.preventDefault();
      e.stopPropagation();
      setTrueFull(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [trueFull]);

  // The lesson pane is hidden when the board is expanded (and unpinned) or in
  // the projector takeover.
  const lessonHidden = (boardExpanded && !pinned) || trueFull;

  // ── Lesson/board resizer (Pointer Events) ─────────────────────────────────
  const onResizeStart = useCallback((e: ReactPointerEvent): void => {
    e.preventDefault();
    const rootRect = rootRef.current?.getBoundingClientRect();
    if (!rootRect) return;
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture?.(e.pointerId);
    const onMove = (ev: PointerEvent): void => {
      const raw = ev.clientX - rootRect.left;
      const clamped = Math.max(
        LESSON_MIN,
        Math.min(rootRect.width * LESSON_MAX_FRACTION, raw),
      );
      setLessonW(clamped);
    };
    const onUp = (): void => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  }, [rootRef]);

  const subjectMeta = subject ? SUBJECT_BY_ID[subject] : undefined;
  // The active board's title is carried by the BoardSwitcher pills, so the label
  // shows just the subject (no redundant "· board title").
  const subjectLabel = subjectMeta?.name ?? "Board";

  // ── Responsive board↔lesson (≤900px: one at a time via the mob toggle) ────
  const isSmall = viewport.isSmall;
  const showLesson = !lessonHidden && (!isSmall || mobLesson);
  // `|| !showLesson` guards the latent blank-shell case (L4): on a small screen
  // with the mob toggle on "lesson" AND the lesson hidden (board expanded /
  // fullscreen), both would otherwise be false → nothing renders. Forcing the
  // board on whenever the lesson isn't showing keeps a surface visible.
  const showBoard = !isSmall || !mobLesson || !showLesson;
  const showResizer = showLesson && !minimized && !isSmall;

  const rootStyle: CSSProperties = {
    gridTemplateColumns:
      isSmall || lessonHidden
        ? "minmax(0, 1fr)"
        : minimized
          ? "64px minmax(0, 1fr)"
          : `${lessonW}px minmax(0, 1fr)`,
  };

  const handleEditorIntent = useCallback(
    (intent: BoardEditorIntent): void => onEditorIntent(intent),
    [onEditorIntent],
  );

  const boardHeader = (
    <header className={styles.boardHead}>
      <div className={styles.boardTitle}>
        {lessonHidden && !trueFull ? (
          <Tooltip content="Show the lesson panel again" side="bottom" tooltipId="teach-v2-show-lesson">
            <Button
              variant="icon"
              size="sm"
              iconAriaLabel="Show lesson panel"
              onClick={() => setBoardExpanded(false)}
            >
              <V2Icon name="expand" size={16} />
            </Button>
          </Tooltip>
        ) : null}
        <span className={styles.boardGlyph} aria-hidden="true">
          {subjectMeta?.icon ?? "•"}
        </span>
        <span className={styles.boardName} title={subjectLabel}>
          {subjectLabel}
        </span>
      </div>

      {activeBoard ? (
        <BoardSwitcher
          boards={boards}
          activeBoardId={state.activeBoardId}
          onSelect={(boardId) => dispatch({ type: "selectBoard", boardId })}
          onAddBoard={onAddBoard}
          onBrowseBoards={onOpenBoardLibrary}
          onPopoverChange={onSwitcherPopover}
        />
      ) : null}

      <span className={styles.headSpacer} aria-hidden="true" />

      <div className={styles.boardTools}>
        <BoardTimer onPopoverChange={onTimerPopover} />
        <span className={styles.toolDivider} aria-hidden="true" />
        {onBoardSettings ? (
          <Button
            variant="icon"
            size="sm"
            iconAriaLabel="Board settings"
            tooltip="Rename this board and manage its slides"
            onClick={onBoardSettings}
          >
            <V2Icon name="grip" size={16} />
          </Button>
        ) : null}
        <Button
          variant="icon"
          size="sm"
          iconAriaLabel={boardExpanded ? "Collapse board" : "Expand board"}
          tooltip={
            boardExpanded
              ? "Bring the lesson panel back"
              : "Expand the board — hide the lesson panel"
          }
          aria-pressed={boardExpanded}
          onClick={() => setBoardExpanded((v) => !v)}
        >
          <V2Icon name={boardExpanded ? "exit" : "fullscreen"} size={16} />
        </Button>
        <Button
          variant="icon"
          size="sm"
          iconAriaLabel={trueFull ? "Exit fullscreen" : "Present fullscreen"}
          tooltip={
            trueFull
              ? "Exit fullscreen (Esc)"
              : "Present — fill the whole screen (Esc to exit)"
          }
          aria-pressed={trueFull}
          onClick={() => setTrueFull((v) => !v)}
        >
          <V2Icon name={trueFull ? "exit" : "present"} size={16} />
        </Button>
      </div>
    </header>
  );

  // ── Board stage: resource full-bleed OR the widget board + ink overlay ────
  const stage =
    centerMode === "resource" && activeResource ? (
      <div className={styles.resourceStage}>
        <ResourceViewerToolbar
          state={state}
          dispatch={dispatch}
          resource={activeResource}
          onToggleFullscreen={() => toggleFullscreen(!state.fullscreen)}
        />
        <div className={styles.resourceWrap}>
          <BoardCanvasResource
            resource={activeResource}
            className={styles.resourceCanvas}
          />
          <div className={styles.annotationOverlay}>
            <AnnotationLayer
              annotations={resourceAnnotations}
              tool={activeTool}
              color={resResolvedColor}
              width={resStrokeWidth}
            />
          </div>
        </div>
        <BoardToolbar
          state={state}
          dispatch={dispatch}
          annotations={resourceAnnotations}
          colorId={resColorId}
          onColorChange={onResColorChange}
          width={resStrokeWidth}
          onWidthChange={onResStrokeWidthChange}
        />
      </div>
    ) : (
      <>
        <SlideFilmstrip
          pages={pages}
          activePageId={resolvedPageId}
          onSelect={(pageId) => handleEditorIntent({ type: "selectPage", pageId })}
          onAdd={() => handleEditorIntent({ type: "addPage" })}
          onDelete={(pageId) => handleEditorIntent({ type: "deletePage", pageId })}
          onRename={(pageId, title) =>
            handleEditorIntent({ type: "renamePage", pageId, title })
          }
          onReorder={(orderedPageIds) =>
            handleEditorIntent({ type: "reorderPages", orderedPageIds })
          }
        />
        <div className={styles.stage} {...pinch.handlers}>
          <div
            className={styles.zoomLayer}
            style={{
              transform: `scale(${pinch.scale})`,
              transformOrigin: `${pinch.originX}% ${pinch.originY}%`,
            }}
          >
            {activeBoard && resolvedPageId ? (
              <BoardEditor
                embedded
                board={activeBoard}
                pages={pages}
                activePageId={resolvedPageId}
                onChange={handleEditorIntent}
                subjectId={subject}
                resources={editorResources}
                onBrowseAll={onOpenWidgetLibrary}
                // Mount the annotation glass INSIDE the scaled paper so ink
                // normalizes against the paper's real rect + fit-scale + scroll
                // (Codex R1 HIGH: an outer-container overlay drifted at narrow
                // widths). The glass sits above the widgets but stays
                // pointer-transparent until a draw tool arms it.
                overlay={
                  <div className={styles.boardInkGlass}>
                    <AnnotationLayer
                      annotations={boardInk}
                      tool={activeTool}
                      color={inkResolved}
                      width={BOARD_INK_WIDTH}
                    />
                  </div>
                }
              />
            ) : (
              <div className={styles.emptyStage} role="region" aria-label="No board open">
                <p className={styles.emptyTitle}>No board open yet</p>
                <p className={styles.emptyBody}>
                  Start a blank board, browse your boards, or pick a lesson on
                  the left to open its boards.
                </p>
                <div className={styles.emptyActions}>
                  {canCreateBoard && onStartBlankBoard ? (
                    <Button
                      variant="primary"
                      leadingIcon={<V2Icon name="plus" size={16} />}
                      onClick={onStartBlankBoard}
                      tooltip="Create a fresh blank board for this lesson"
                    >
                      Start blank
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    onClick={onOpenBoardLibrary}
                    tooltip="Browse your boards and the team's, and open one here"
                  >
                    Browse boards
                  </Button>
                </div>
              </div>
            )}
          </div>
          {pinch.zoomed ? (
            <button
              type="button"
              className={styles.zoomReset}
              onClick={pinch.reset}
            >
              Reset zoom
            </button>
          ) : null}
        </div>
        <WritingBar
          activeTool={activeTool}
          onToolChange={(tool) => dispatch({ type: "setTool", tool })}
          colorId={inkColorId}
          onColorChange={setInkColorId}
          onClear={boardInk.clear}
          hasMarks={boardInk.strokes.length > 0}
          onUndo={boardInk.undo}
          onRedo={boardInk.redo}
          canUndo={boardInk.canUndo}
          canRedo={boardInk.canRedo}
          onOpenWidgetLibrary={onOpenWidgetLibrary}
          resources={editorResources}
          onEditorIntent={handleEditorIntent}
          pageId={activeBoard && resolvedPageId ? resolvedPageId : null}
          onPopoverChange={onWritingPopover}
        />
      </>
    );

  return (
    <>
    <div
      ref={rootRef}
      className={`${styles.teach} ${trueFull ? styles.trueFull : ""}`}
      data-mob={mobLesson ? "lesson" : "board"}
      style={rootStyle}
      title="The live teaching workspace — the lesson panel and the board you teach from"
    >
      {isSmall && !trueFull && !lessonHidden ? (
        <button
          type="button"
          className={styles.mobToggle}
          onClick={() => setMobLesson((v) => !v)}
          title={mobLesson ? "Show the board" : "Show the lesson panel"}
        >
          {mobLesson ? "‹ Board" : "Lesson ›"}
        </button>
      ) : null}

      {showLesson ? (
        <LessonRail
          state={state}
          dispatch={dispatch}
          subject={subject}
          boards={boards}
          minimized={minimized}
          onMinimize={() => setMinimized(true)}
          onExpand={() => setMinimized(false)}
          pinned={pinned}
          onTogglePin={() => setPinned((v) => !v)}
          onEmbedResource={onEmbedResource}
          onMagnifyResource={(resource) =>
            dispatch({ type: "openResource", resource })
          }
          onOpenBoard={(boardId) => dispatch({ type: "selectBoard", boardId })}
        />
      ) : null}

      {showResizer ? (
        <div
          className={styles.resizer}
          style={{ left: lessonW }}
          onPointerDown={onResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the lesson panel"
          title="Drag to resize the lesson panel and board"
        />
      ) : null}

      {showBoard ? (
        <section className={styles.board}>
          {boardHeader}
          {stage}
        </section>
      ) : null}

      {/* Shared overlay layer (board-settings / help / board+widget libraries).
          It renders INSIDE this skin's rootRef subtree — NOT at the workspace
          level — because toggleFullscreen makes rootRef the browser fullscreen
          element and position:fixed nodes outside it don't paint while
          fullscreen is engaged (W11 M1). Its open-state + setters ride the
          contract; without it the v2 openers (settings/help/library) would flip
          state that nothing mounts, and the Esc deferral would deadlock. */}
      <TeachOverlays {...props} />
    </div>

    {/* DragOverlay ghost — a lightweight label for the active payload. Mirrors
        TeachV1Zones: the DndContext lives in TeachWorkspace and DragOverlay is
        its direct fragment sibling. */}
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
    </>
  );
}
