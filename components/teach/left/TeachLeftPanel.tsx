"use client";

// TeachLeftPanel — the collapsible left panel hosting the module tabs
// (docs/teach-view-plan.md §3.1, §6). Wave 1 Agent B.
//
// A thin tab header (one tab per left-docked module) plus the active module's
// body. Tabs support:
//   • focus — click a tab to make it the active module body;
//   • close — the ✕ on a tab docks that module to the rail (removes its tab);
//   • reorder WITHIN the panel — drag a tab to re-sequence (persists via
//     `workspace.moveRailIcon(id, "left", index)`).
//
// Dragging tabs BETWEEN panels and detaching to floating windows is Phase 2
// and intentionally NOT built here (plan §6).
//
// Data-heavy module bodies (Boards, Lesson list) fetch from usePlanner() / the
// `teach` repo themselves; this panel only routes the central state + dispatch
// down to them.

import { type ReactNode, useEffect, useMemo } from "react";
import {
  DndContext,
  type DragEndEvent,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TeachModuleId } from "@/lib/use-teach-workspace";
import type { UseTeachWorkspaceResult } from "@/lib/use-teach-workspace";
import type { TeachWorkspaceState } from "@/lib/teach/types";
import type { TeachWorkspaceAction } from "@/components/teach/TeachWorkspace";
import type { Board } from "@/lib/types";
import { useDockedTools } from "@/lib/teach/use-docked-tools";
import type { WidgetType } from "@/lib/types";
import { LEFT_MODULE_META, isLeftModuleId } from "./modules-meta";
import { moduleIcon, CloseIcon } from "./icons";
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
  /** The persisted workspace layout hook (tab order, reorder, etc.). */
  workspace: UseTeachWorkspaceResult;
  /** The module whose tab is focused. Lifted to the parent so the rail's
   *  active highlight and the panel's active body stay in sync. */
  activeModuleId: TeachModuleId;
  /** Change the focused module tab. */
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
   *  when absent the "Browse widget library" entry is hidden. Wired by the
   *  TeachWorkspace lead to the existing Widget Library overlay. */
  onOpenWidgetLibrary?: () => void;
  // ── Owner identity (Finding 3 fix) ─────────────────────────────────────────
  // Threaded from TeachWorkspace so BoardsModule receives the correct flag-aware
  // owner id instead of the hard-coded `ME.id` slug.
  /** The current teacher's owner id (null while the auth session loads). */
  ownerId: string | null;
}

// ── A sortable tab ─────────────────────────────────────────────────────────────

// Stable ids so the active tab can label / control the panel body (audit A4).
const leftTabId = (id: TeachModuleId): string => `teach-left-tab-${id}`;
const LEFT_PANEL_BODY_ID = "teach-left-panel-body";

function PanelTab({
  moduleId,
  active,
  onFocus,
  onClose,
}: {
  moduleId: TeachModuleId;
  active: boolean;
  onFocus: () => void;
  onClose: () => void;
}): ReactNode {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: moduleId });
  const meta = isLeftModuleId(moduleId)
    ? LEFT_MODULE_META[moduleId]
    : { label: moduleId, shortcut: "", tooltip: moduleId };

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <span
      ref={setNodeRef}
      style={style}
      className={[
        styles.tab,
        active ? styles.tabActive : "",
        isDragging ? styles.tabDragging : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        onClick={onFocus}
        title={meta.tooltip}
        aria-label={meta.label}
        style={{
          border: "none",
          background: "transparent",
          color: "inherit",
          font: "inherit",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: 0,
        }}
        {...attributes}
        {...listeners}
        // ARIA tab semantics live on the focusable control (the button), not
        // the presentational span wrapper (audit A4). These deliberately come
        // AFTER the dnd-kit `attributes` spread so they override dnd-kit's
        // default `role="button"` / `tabIndex`. Roving tabindex: only the
        // active tab is in the tab sequence; Arrow keys move between the rest
        // (handled on the tablist).
        id={leftTabId(moduleId)}
        role="tab"
        aria-selected={active}
        aria-controls={active ? LEFT_PANEL_BODY_ID : undefined}
        tabIndex={active ? 0 : -1}
      >
        <span aria-hidden="true" style={{ display: "inline-flex" }}>
          {moduleIcon(moduleId, 14)}
        </span>
        {meta.label}
      </button>
      <button
        type="button"
        aria-label={`Send ${meta.label} to the back of the panel`}
        className={styles.tabClose}
        style={{ border: "none", background: "transparent", cursor: "pointer" }}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title={`Send ${meta.label} to the back of the panel (still on the left rail)`}
      >
        <CloseIcon size={11} />
      </button>
    </span>
  );
}

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
  workspace,
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
  // The docked tool-widget stack — the panel-bar "+" docks tools into it.
  const dockedTools = useDockedTools();

  // Tabs = the modules docked to the left, in their persisted order.
  const tabIds = useMemo(
    () => workspace.layout.tabOrder.left as TeachModuleId[],
    [workspace.layout.tabOrder.left],
  );

  // Keep a valid active tab even if the active module was closed/moved away.
  useEffect(() => {
    if (tabIds.length === 0) return;
    if (!tabIds.includes(activeModuleId)) {
      onActiveModuleChange(tabIds[0]);
    }
  }, [tabIds, activeModuleId, onActiveModuleChange]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleTabReorder(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const toIndex = tabIds.indexOf(over.id as TeachModuleId);
    if (toIndex < 0) return;
    workspace.moveRailIcon(active.id as TeachModuleId, "left", toIndex);
  }

  function handleCloseTab(moduleId: TeachModuleId): void {
    // Audit G6 fix: NEVER dock a left module to the RIGHT panel — the right
    // panel only renders resources/chat/todo, so a left module moved there
    // vanishes (no icon, blank body) and becomes unreachable until localStorage
    // is cleared. Instead, closing a left tab moves it to the END of the LEFT
    // order so it leaves the active-tab position but stays a left-rail icon AND
    // a (de-prioritised) left tab — always re-openable in-session from the left
    // rail. The effect above re-picks a valid active tab. Don't close the last
    // remaining tab into nothing.
    if (tabIds.length <= 1) return;
    workspace.moveRailIcon(moduleId, "left", tabIds.length - 1);
    if (activeModuleId === moduleId) {
      const fallback = tabIds.find((id) => id !== moduleId);
      if (fallback) onActiveModuleChange(fallback);
    }
  }

  // Panel-bar "+": dock the chosen tool-widget into the Tools stack, then make
  // sure the teacher SEES it — ensure "tools" is a left tab (the panel already
  // owns moveRailIcon for the left side) and focus it. Existing tab behaviour
  // (order, close, roving) is untouched: we only append "tools" if it isn't
  // already a left tab.
  function handleAddTool(type: WidgetType): void {
    dockedTools.add(type);
    if (!tabIds.includes("tools")) {
      workspace.moveRailIcon("tools", "left", tabIds.length);
    }
    onActiveModuleChange("tools");
  }

  const effectiveActive = tabIds.includes(activeModuleId)
    ? activeModuleId
    : (tabIds[0] ?? null);

  // Roving tabindex + Arrow-key navigation across the module tab strip
  // (audit A4 — WAI-ARIA tabs expect Left/Right to move between tabs).
  function handleTabKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (
      e.key !== "ArrowRight" &&
      e.key !== "ArrowLeft" &&
      e.key !== "ArrowDown" &&
      e.key !== "ArrowUp"
    ) {
      return;
    }
    if (tabIds.length === 0 || effectiveActive == null) return;
    e.preventDefault();
    const currentIndex = Math.max(0, tabIds.indexOf(effectiveActive));
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (currentIndex + delta + tabIds.length) % tabIds.length;
    const nextId = tabIds[nextIndex];
    onActiveModuleChange(nextId);
    // Query by id attribute (not `#id`) to avoid the dnd-kit `CSS` import
    // shadowing the browser `CSS.escape`; module ids are simple known strings.
    e.currentTarget
      .querySelector<HTMLButtonElement>(`[id="${leftTabId(nextId)}"]`)
      ?.focus();
  }

  return (
    <section
      className={styles.panel}
      style={{ width }}
      title="Left panel — lesson, boards, notes, groups, class, tools"
      aria-label="Teach left panel"
    >
      <div className={styles.tabHeader}>
        <div
          className={styles.tabStrip}
          role="tablist"
          aria-label="Left modules"
          onKeyDown={handleTabKeyDown}
        >
          {/* Stable id → deterministic dnd-kit `DndDescribedBy-<id>` across
              SSR/CSR (see TeachWorkspace's DndContext for the full rationale). */}
          <DndContext
            id="teach-left-tabs-dnd"
            sensors={sensors}
            onDragEnd={handleTabReorder}
          >
            <SortableContext
              items={tabIds}
              strategy={horizontalListSortingStrategy}
            >
              {tabIds.map((id) => (
                <PanelTab
                  key={id}
                  moduleId={id}
                  active={id === effectiveActive}
                  onFocus={() => onActiveModuleChange(id)}
                  onClose={() => handleCloseTab(id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        {/* Panel-bar "+": dock a tool or open the widget library. Hidden until
            hover/focus on desktop; always visible on touch. */}
        <PanelAddMenu
          side="left"
          onAddTool={handleAddTool}
          onOpenWidgetLibrary={onOpenWidgetLibrary}
          triggerClassName={styles.addTrigger}
        />
      </div>

      <div
        className={styles.panelBody}
        id={LEFT_PANEL_BODY_ID}
        role="tabpanel"
        aria-labelledby={
          effectiveActive ? leftTabId(effectiveActive) : undefined
        }
        tabIndex={0}
      >
        {effectiveActive ? (
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
        ) : (
          <p className={styles.muted}>
            All modules are on the other rail. Drag one back to use it here.
          </p>
        )}
      </div>
    </section>
  );
}
