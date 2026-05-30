"use client";

// TeachRightRail.tsx — the 64px right icon rail of the Teach surface
// (docs/teach-view-plan.md §3, §3.1, §6).
//
// Always-visible stack of the right-side module icons (Resources / Chat / To-do
// per the §3.1 default split). Each icon shows its glyph + a 10px label; the
// ACTIVE module gets a filled background. Clicking an icon opens/focuses that
// module (expanding the panel if it is collapsed).
//
// ── Drag-to-rearrange (plan §6, §8) ──────────────────────────────────────────
// Rail icons are drag-rearrangeable. Each icon is a `useDraggable` carrying a
// `TeachRailIconDragData` payload (the Wave-0 dnd contract). The single
// `DndContext` lives in TeachWorkspace; DROP RESOLUTION (calling
// `workspace.moveRailIcon`) is wired at integration (Wave 2) — this rail only
// emits the payload. The grip glyph appears on hover/focus so the icon stays a
// clean tap target at rest.
//
// ── Chrome rules (CLAUDE.md §4) ──────────────────────────────────────────────
// Tokens only. Every icon carries an onboarding tooltip (module name + what it
// does); the rail root carries a `title` so touch users get an explanation by
// holding it. ≥44px tap targets.

import type { ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { TeachModuleId } from "@/lib/use-teach-workspace";
import type { TeachRailIconDragData } from "@/lib/teach/types";
import { Tooltip } from "@/components/ui";
import { ResourcesIcon, ChatIcon, TodoIcon, GripIcon } from "./icons";
import styles from "./TeachRightRail.module.css";

// ── Module descriptor table ──────────────────────────────────────────────────
// The right rail draws only the right-docked modules. Order is supplied by the
// caller (the persisted `iconRailRightOrder`); this table maps each id to its
// glyph, label, and onboarding copy.

interface RightModuleMeta {
  label: string;
  icon: ReactNode;
  /** Onboarding tooltip — what the module accomplishes (CLAUDE.md §4 voice). */
  tip: string;
}

const RIGHT_MODULE_META: Partial<Record<TeachModuleId, RightModuleMeta>> = {
  resources: {
    label: "Resources",
    icon: <ResourcesIcon />,
    tip: "Open this lesson's resources — slides, handouts, videos, and links. Drag any card onto a board cell to put it on screen.",
  },
  chat: {
    label: "Chat",
    icon: <ChatIcon />,
    tip: "Open Today's Shoutbox — a team-wide chat scoped to this day. Share quick updates or ask for cover.",
  },
  todo: {
    label: "To-do",
    icon: <TodoIcon />,
    tip: "Open your to-do list for today — tick items off as you go or quick-add a reminder.",
  },
};

// ── One draggable rail icon ──────────────────────────────────────────────────

interface RailIconProps {
  moduleId: TeachModuleId;
  meta: RightModuleMeta;
  active: boolean;
  /** Unread/attention count surfaced as a small badge (0 = none). */
  badge?: number;
  onActivate: (moduleId: TeachModuleId) => void;
}

function RailIcon({
  moduleId,
  meta,
  active,
  badge = 0,
  onActivate,
}: RailIconProps): ReactNode {
  const dragData: TeachRailIconDragData = { kind: "rail-icon", moduleId };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `teach-rail-right:${moduleId}`,
    data: dragData,
  });

  return (
    <Tooltip
      content={meta.tip}
      side="left"
      tooltipId={`teach-rail-${moduleId}`}
    >
      <div
        ref={setNodeRef}
        className={`${styles.item} ${isDragging ? styles.dragging : ""}`}
      >
        <button
          type="button"
          className={`${styles.iconBtn} ${active ? styles.iconBtnActive : ""}`}
          aria-pressed={active}
          aria-label={
            badge > 0
              ? `${meta.label} — open this module (${badge} unread)`
              : `${meta.label} — open this module`
          }
          onClick={() => onActivate(moduleId)}
        >
          {meta.icon}
          {badge > 0 ? (
            <span className={styles.badge} aria-hidden="true">
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
          {/* Drag grip — sole drag activator; surfaces on hover/focus so the
              icon reads as a clean tap target at rest. */}
          <span
            className={styles.grip}
            aria-hidden="true"
            {...attributes}
            {...listeners}
          >
            <GripIcon size={12} />
          </span>
        </button>
        <span className={`${styles.label} ${active ? styles.labelActive : ""}`}>
          {meta.label}
        </span>
      </div>
    </Tooltip>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface TeachRightRailProps {
  /** Ordered right-docked module ids (from `iconRailRightOrder`). Unknown ids
   *  are skipped so a stale layout never crashes the rail. */
  order: TeachModuleId[];
  /** The module currently focused in the right panel, or null when collapsed. */
  activeModuleId: TeachModuleId | null;
  /** Open/focus a module — expands the panel if collapsed and focuses the tab. */
  onActivateModule: (moduleId: TeachModuleId) => void;
  /** Per-module attention badges (e.g. chat unread, audit B5). 0/absent = none. */
  badges?: Partial<Record<TeachModuleId, number>>;
}

// ── TeachRightRail ───────────────────────────────────────────────────────────

export function TeachRightRail({
  order,
  activeModuleId,
  onActivateModule,
  badges,
}: TeachRightRailProps): ReactNode {
  return (
    <nav
      className={styles.rail}
      aria-label="Right modules: resources, chat, to-do"
      title="Resources, chat, and to-do for this lesson — click an icon to open it; drag to reorder."
    >
      {order.map((id) => {
        const meta = RIGHT_MODULE_META[id];
        if (!meta) return null;
        return (
          <RailIcon
            key={id}
            moduleId={id}
            meta={meta}
            active={activeModuleId === id}
            badge={badges?.[id]}
            onActivate={onActivateModule}
          />
        );
      })}
    </nav>
  );
}
