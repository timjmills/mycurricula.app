"use client";

// TeachLeftRail — the 64px left icon rail (docs/teach-view-plan.md §3.1, §6).
//
// Stacked module icons (Lessons / Lesson / Boards / Notes / Groups / Class /
// Tools) each with a tiny label, an active state, and an onboarding tooltip
// (name + shortcut + contextual voice, CLAUDE.md §4). Clicking an icon focuses
// /opens that module's tab in the left panel (via `onSelectModule`).
//
// Drag-rearrange: each rail icon is a dnd-kit `useDraggable` that emits the
// frozen `TeachRailIconDragData` payload on the surface DndContext mounted by
// TeachWorkspace. THIS file only produces the draggable items — the drop
// resolution (calling `workspace.moveRailIcon`) is wired at integration
// (Wave 2), exactly as the contract specifies. We surface the correct dnd
// `data` so that wiring is a pure consumer.

import { type ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Tooltip } from "@/components/ui";
import type { TeachModuleId } from "@/lib/use-teach-workspace";
import { useTeachWorkspace } from "@/lib/use-teach-workspace";
import type { TeachRailIconDragData } from "@/lib/teach/types";
import { LEFT_MODULE_META, isLeftModuleId } from "./modules-meta";
import { moduleIcon } from "./icons";
import styles from "./TeachLeft.module.css";

// ── Props ────────────────────────────────────────────────────────────────────

export interface TeachLeftRailProps {
  /** The module whose tab is currently focused in the left panel (drives the
   *  rail's active highlight). Null when the panel is collapsed/empty. */
  activeModuleId: TeachModuleId | null;
  /** Focus/open a module's tab in the left panel. */
  onSelectModule: (moduleId: TeachModuleId) => void;
}

// ── A single draggable rail icon ──────────────────────────────────────────────

interface RailIconProps {
  moduleId: TeachModuleId;
  active: boolean;
  onSelect: (moduleId: TeachModuleId) => void;
}

function RailIcon({ moduleId, active, onSelect }: RailIconProps): ReactNode {
  // The dnd `data` is the frozen contract payload — the integrator's drop
  // handler narrows on `kind === "rail-icon"` and reads `moduleId`.
  const dragData: TeachRailIconDragData = { kind: "rail-icon", moduleId };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `rail-icon:${moduleId}`,
    data: dragData,
  });

  // Only left-side modules carry metadata; guard so a future right-docked id
  // dragged onto this rail never crashes the renderer.
  const meta = isLeftModuleId(moduleId)
    ? LEFT_MODULE_META[moduleId]
    : { label: moduleId, shortcut: "", tooltip: moduleId };

  return (
    <div className={styles.railItem}>
      <Tooltip
        content={
          <span>
            {meta.tooltip}
            {meta.shortcut ? ` · ⌘${meta.shortcut}` : ""}
          </span>
        }
        side="right"
        tooltipId={`teach-rail-${moduleId}`}
      >
        <button
          type="button"
          ref={setNodeRef}
          className={[
            styles.railBtn,
            active ? styles.railBtnActive : "",
            isDragging ? styles.railDragging : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label={meta.label}
          onClick={() => onSelect(moduleId)}
          {...attributes}
          {...listeners}
          aria-pressed={active}
        >
          {moduleIcon(moduleId)}
        </button>
      </Tooltip>
      <span
        className={[styles.railLabel, active ? styles.railLabelActive : ""]
          .filter(Boolean)
          .join(" ")}
      >
        {meta.label}
      </span>
    </div>
  );
}

// ── Rail ───────────────────────────────────────────────────────────────────────

export function TeachLeftRail({
  activeModuleId,
  onSelectModule,
}: TeachLeftRailProps): ReactNode {
  const workspace = useTeachWorkspace();
  // The persisted icon order for the left rail (teacher-arranged, normalized).
  const ids = workspace.layout.iconRailLeftOrder;

  return (
    <nav
      className={styles.rail}
      aria-label="Teach modules"
      title="Lesson context: lessons, boards, notes, groups, and tools"
    >
      {ids.map((id) => (
        <RailIcon
          key={id}
          moduleId={id as TeachModuleId}
          active={activeModuleId === id}
          onSelect={onSelectModule}
        />
      ))}
    </nav>
  );
}
