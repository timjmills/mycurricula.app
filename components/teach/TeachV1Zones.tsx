"use client";

// TeachV1Zones.tsx — the PRESENTATION SEAM for the Teach workspace (W11).
//
// This is the v1 (pre-redesign) shell body extracted verbatim from
// TeachWorkspace.tsx's JSX return. It owns ZERO logic: the reducer, effects,
// DnD handlers, deep-link resolution, and present-mode short-circuit all stay
// in TeachWorkspace, which hands this component everything it renders through
// the single `TeachZonesProps` object (defined in ./zones-contract). That props
// object is the contract Builder B's v2 shell (components/teach-v2/**) also
// consumes — both skins render the same zones against the same state, so a flag
// flip swaps the chrome/layout without touching behaviour.
//
// The rendered output is byte-identical to the pre-extraction TeachWorkspace:
// this file returns the same `<div ref={rootRef}>…</div>` + `<DragOverlay>`
// pair, which TeachWorkspace mounts INSIDE the one shared DndContext
// (id="teach-surface-dnd"). Nothing here fetches, dispatches side effects, or
// holds name-bearing state — it is purely a projection of the props.

import type { ReactNode } from "react";
import { DragOverlay } from "@dnd-kit/core";

import {
  PresentBar,
  TeachFooter,
  TeachSubBar,
  TeachTopBar,
  TEACH_CENTER_PANEL_ID,
} from "./chrome";
import { TeachLeftPanel, TeachLeftRail } from "./left";
import { TeachRightPanel, TeachRightRail } from "./right";
import { TeachOverlays } from "./TeachOverlays";
import { BoardEditor } from "./board/editor";
import { TeachIcon } from "@/components/teach/widgets";
import { Button } from "@/components/ui";
import { BoardCanvasResource, ResourceViewerToolbar } from "./canvas";
import { AnnotationLayer, BoardToolbar } from "./annotation";
import type { TeachZonesProps } from "./zones-contract";
import styles from "./TeachWorkspace.module.css";

// Re-export the contract for ergonomic import from the v1 side.
export type { TeachZonesProps } from "./zones-contract";

/**
 * The v1 Teach shell body — the five-zone chrome/rails/panels/board/canvas
 * geometry. Rendered inside TeachWorkspace's shared DndContext. Pure
 * projection of `TeachZonesProps`; holds no state and runs no effects.
 */
export function TeachV1Zones(props: TeachZonesProps): ReactNode {
  const {
    state,
    dispatch,
    rootRef,
    resourceContainerRef,
    viewport,
    boards,
    activeBoard,
    activeLessonId,
    activeResource,
    subject,
    subjClass,
    boardIndex,
    boardCount,
    pages,
    resolvedPageId,
    editorResources,
    rightOrder,
    ownerId,
    boardsGradeLevelId,
    annotations,
    resolvedColor,
    colorId,
    onColorChange,
    strokeWidth,
    onStrokeWidthChange,
    leftWidth,
    rightWidth,
    avatarInitials,
    teacherName,
    gradeLabel,
    chatUnread,
    week,
    day,
    leftActiveModule,
    setLeftActiveModule,
    rightActiveModule,
    setRightActiveModule,
    setHelpOpen,
    setLibraryOverlay,
    activeDrag,
    openLeftPanel,
    openRightPanel,
    openBoardsPanel,
    togglePanels,
    toggleRightCollapsed,
    toggleFullscreen,
    onEditorIntent,
    onEmbedResource,
    reloadBoards,
    onOpenWidgetLibrary,
    onOpenBoardLibrary,
    onAddBoard,
    onStartBlankBoard,
    onBoardSettings,
  } = props;

  return (
    <>
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
                // Multi-grade by design (CLAUDE.md §1): the curriculum/grade
                // label is FREE TEXT sourced from the signed-in teacher's
                // context — the same source the shell top-bar uses
                // (currentUser.curriculumLabel). Never hard-code "Grade 5".
                // When the label is absent the suffix simply disappears.
                gradeLabel={gradeLabel}
                avatarInitials={avatarInitials}
                teacherName={teacherName}
                onOpenHelp={() => setHelpOpen(true)}
              />
            </header>
            <div className={styles.subBarSlot}>
              <TeachSubBar
                state={state}
                dispatch={dispatch}
                boards={boards}
                subject={subject}
                // Standalone single-board scope has no lesson to add to — the
                // owner passes undefined there (Add Board would be a no-op).
                onAddBoard={onAddBoard}
                onBoardSettings={onBoardSettings}
                onToggleFullscreen={toggleFullscreen}
                onOpenBoardLibrary={onOpenBoardLibrary}
                onOpenWidgetLibrary={onOpenWidgetLibrary}
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
                openLeftPanel();
              }}
            />
          ) : null}

          {/* Left panel */}
          {!state.present && !state.leftCollapsed ? (
            <TeachLeftPanel
              state={state}
              dispatch={dispatch}
              activeModuleId={leftActiveModule}
              onActiveModuleChange={setLeftActiveModule}
              width={leftWidth}
              // Single source of truth (audit A1-left): the Boards module reads
              // TeachWorkspace.boards + reloadBoards, never its own fetch, so the
              // sub-bar pills, footer count, and center board stay in lockstep.
              boards={boards}
              boardsGradeLevelId={boardsGradeLevelId}
              reloadBoards={reloadBoards}
              onOpenWidgetLibrary={onOpenWidgetLibrary}
              // Finding 3 fix: thread the flag-aware owner id so BoardsModule
              // never uses the hard-coded `ME.id` slug under the live flag.
              ownerId={ownerId}
            />
          ) : null}

          {/* Center — board grid OR full-bleed resource canvas. This is the
              panel the sub-bar board-tab strip controls (audit A4): it carries
              the shared TEACH_CENTER_PANEL_ID + role="tabpanel", labelled by
              the active board's tab. */}
          <main
            className={styles.center}
            id={TEACH_CENTER_PANEL_ID}
            role="tabpanel"
            aria-labelledby={
              activeBoard ? `teach-board-tab-${activeBoard.id}` : undefined
            }
          >
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
                  {/* Wave 1 declutter: the floating `ToolDock` (a strict subset
                      of the BoardToolbar below — select/pen/text + dead "Soon"
                      tiles) was removed. The single `BoardToolbar` is the one
                      drawing toolbar for the resource surface. */}
                </div>
                <BoardToolbar
                  state={state}
                  dispatch={dispatch}
                  annotations={annotations}
                  colorId={colorId}
                  onColorChange={onColorChange}
                  width={strokeWidth}
                  onWidthChange={onStrokeWidthChange}
                />
              </div>
            ) : activeBoard && resolvedPageId ? (
              <BoardEditor
                board={activeBoard}
                pages={pages}
                activePageId={resolvedPageId}
                onChange={onEditorIntent}
                subjectId={subject}
                resources={editorResources}
                onBrowseAll={() => setLibraryOverlay("widgets")}
              />
            ) : (
              // Clean empty state (Wave 1, #10) — no board open yet. The board
              // surface opens CLEAR: no widgets, no grid, no auto-seeded set.
              // A board exists only on an explicit action, so we offer the three
              // explicit creation paths.
              <TeachBoardEmptyState
                onStartBlank={onStartBlankBoard}
                onOpenBoards={openBoardsPanel}
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
              onCollapse={toggleRightCollapsed}
              width={rightWidth}
              activeLessonId={activeLessonId}
              boards={boards}
              onMagnifyResource={(resource) =>
                dispatch({ type: "openResource", resource })
              }
              onEmbedResource={onEmbedResource}
              onOpenBoard={(boardId) =>
                dispatch({ type: "selectBoard", boardId })
              }
              week={week}
              day={day}
              onOpenWidgetLibrary={onOpenWidgetLibrary}
            />
          ) : null}

          {/* Right icon rail */}
          {!state.present ? (
            <TeachRightRail
              order={rightOrder}
              activeModuleId={state.rightCollapsed ? null : rightActiveModule}
              onActivateModule={(id) => {
                setRightActiveModule(id);
                openRightPanel();
              }}
              badges={{ chat: chatUnread }}
            />
          ) : null}

          {/* Tap-to-dismiss scrim — only on small screens (≤900px) when a panel
              drawer is open. Sits BELOW the drawer (scrim z-index 40 < drawer
              z-index 45) and above the board/rails; tapping anywhere outside the
              drawer collapses whichever drawer(s) are open. Keyboard users get
              Esc (the effect above) and the scrim is itself a focusable
              <button> (Enter/Space activate it). */}
          {!state.present &&
          viewport.isSmall &&
          (!state.leftCollapsed || !state.rightCollapsed) ? (
            <button
              type="button"
              className={styles.drawerScrim}
              aria-label="Close panel"
              onClick={() => {
                if (!state.rightCollapsed)
                  dispatch({ type: "setRightCollapsed", collapsed: true });
                if (!state.leftCollapsed)
                  dispatch({ type: "setLeftCollapsed", collapsed: true });
              }}
            />
          ) : null}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        {!state.present ? (
          <footer className={styles.footerSlot}>
            <TeachFooter
              panelsCollapsed={state.leftCollapsed && state.rightCollapsed}
              onTogglePanels={togglePanels}
            />
          </footer>
        ) : null}

        {/* Shared overlay layer (settings / help / libraries). Mounted INSIDE
            this rootRef subtree — rootRef is the browser fullscreen element,
            and fixed nodes outside document.fullscreenElement don't paint in
            fullscreen (review W11 M1). Both skins mount it; only one renders. */}
        <TeachOverlays {...props} />
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
    </>
  );
}

// ── Board empty state (Wave 1, #10) ──────────────────────────────────────────
// Shown in the center when no board is open. The board surface opens CLEAN —
// no widgets, no grid — and offers the explicit creation paths (a board exists
// only on an explicit action). "Start blank" is hidden when a board can't be
// created yet (no lesson/owner/grade) rather than rendering a dead button.

interface TeachBoardEmptyStateProps {
  /** Create a blank board for the active lesson / sandbox. Omitted → hidden. */
  onStartBlank?: () => void;
  /** Open the Boards panel (browse + reuse boards). */
  onOpenBoards: () => void;
}

function TeachBoardEmptyState({
  onStartBlank,
  onOpenBoards,
}: TeachBoardEmptyStateProps): ReactNode {
  return (
    <div
      className={styles.emptyState}
      role="region"
      aria-label="No board open"
    >
      <div className={styles.emptyIcon} aria-hidden="true">
        <TeachIcon name="grid" size={30} />
      </div>
      <h2 className={styles.emptyTitle}>No board open yet</h2>
      <p className={styles.emptyBody}>
        Start a blank board, open one from a resource, or pick from the Boards
        page.
      </p>
      <div className={styles.emptyActions}>
        {onStartBlank ? (
          <Button
            variant="primary"
            leadingIcon={<TeachIcon name="plus" size={16} />}
            onClick={onStartBlank}
            tooltip="Create a fresh blank board for this lesson"
          >
            Start blank
          </Button>
        ) : null}
        <Button
          variant="secondary"
          leadingIcon={<TeachIcon name="grid" size={16} />}
          onClick={onOpenBoards}
          tooltip="Browse your boards and the team's, and open one here"
        >
          Browse boards
        </Button>
      </div>
    </div>
  );
}
