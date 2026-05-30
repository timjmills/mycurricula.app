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
import { LEFT_MODULE_META, isLeftModuleId } from "./modules-meta";
import { moduleIcon, CloseIcon } from "./icons";
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
        aria-label={`Move ${meta.label} off the panel`}
        className={styles.tabClose}
        style={{ border: "none", background: "transparent", cursor: "pointer" }}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title={`Move ${meta.label} off the panel (back to the rail)`}
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
}: {
  moduleId: TeachModuleId;
  state: TeachWorkspaceState;
  dispatch: (action: TeachWorkspaceAction) => void;
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
}: TeachLeftPanelProps): ReactNode {
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
    // Closing a tab docks the module to the rail. With no dedicated "hidden"
    // bucket for Teach modules, we move it to the RIGHT dock so it leaves the
    // left panel but stays reachable. (Dragging it back is Phase 2 parity;
    // for v1 the rail still lists it via the right zone.)
    workspace.moveRailIcon(moduleId, "right", 0);
    // Defer to the effect above to re-pick a valid active tab.
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
      <div
        className={styles.tabHeader}
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
