"use client";

// TeachIconRail.tsx — the far icon rail for the Teach workspace.
//
// One instance per side (left + right), chosen by the `side` prop. Each rail
// is a vertical list of module icons that the teacher can:
//
//   • reorder within the rail (dnd-kit vertical sort), and
//   • drag BETWEEN the two rails (left ↔ right).
//
// ── Why the DndContext is NOT here ─────────────────────────────────────────
// dnd-kit can only move an id from one SortableContext to another when BOTH
// contexts share a single parent DndContext (the pointer session that starts
// on drag has to outlive the rail boundary so the drop on the OTHER rail is
// recognized). So TeachShell wraps both rails in one DndContext + routes
// onDragEnd to the workspace hook's `moveIcon`. This file only registers a
// SortableContext for its own side and renders the sortable icons —
// mirroring the shell's GlobalRail / RightIconRail / RailsDndProvider split
// (components/shell/RailsDndProvider.tsx).
//
// ── What an icon does on click ──────────────────────────────────────────────
// Clicking a rail icon makes that module the ACTIVE tab of the same-side
// panel (and adds it as a tab if it isn't one yet) — that's the rail's job:
// a quick launcher for the panel beside it. TeachShell passes `onActivate`
// which wires to the workspace hook. The icon button is its own drag handle
// (6px activation distance keeps click ≠ drag, same as the shell rails).
//
// ── Tokens / a11y / motion ────────────────────────────────────────────────
// Tokens only; each icon is a ≥44px touch target with an aria-label + a
// dismissible onboarding <Tooltip tooltipId>. Every icon is keyboard-
// focusable; dnd-kit's KeyboardSensor (from useDndSensors) lifts/moves/drops.
// Reduced motion is honored by dnd-kit (null transition) + the module.css.

import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Tooltip } from "@/components/ui";
import { MODULE_REGISTRY } from "@/components/teach/module-registry";
import type { ModuleId, PanelSide } from "@/lib/teach/teach-types";
import styles from "./TeachIconRail.module.css";

/** Stable droppable id for a rail, so an icon can be dropped onto an EMPTY
 *  rail (which has no sortable items to drop over). Shared with TeachShell's
 *  drag-end resolution. Exported so the resolver can't drift from this. */
export function railDroppableId(side: PanelSide): string {
  return `teach-rail-drop:${side}`;
}

// ── SortableIcon ────────────────────────────────────────────────────────────
// One module icon. useSortable per icon; the button is the drag handle
// (listeners spread onto it) and the click target. A short activation
// distance (configured in useDndSensors) keeps a plain click from becoming a
// drag.

interface SortableIconProps {
  id: ModuleId;
  side: PanelSide;
  /** True when this module is the active tab of the same-side panel. */
  active: boolean;
  /** Click → surface this module in the same-side panel. */
  onActivate: (id: ModuleId) => void;
}

function SortableIcon({
  id,
  side,
  active,
  onActivate,
}: SortableIconProps): ReactNode {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const entry = MODULE_REGISTRY[id];

  // Append a slight lift while dragging so the icon reads as floating above
  // the rest — composed into a single transform string (never set the same
  // CSS property twice). Mirrors the shell rail-icons treatment.
  const baseTransform = CSS.Transform.toString(transform);
  const composedTransform = isDragging
    ? `${baseTransform ?? ""} scale(1.05)`.trim()
    : (baseTransform ?? undefined);

  const style: React.CSSProperties = {
    transform: composedTransform,
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 2 : undefined,
    // Required by dnd-kit's TouchSensor so the browser doesn't claim the
    // gesture for scrolling.
    touchAction: "none",
  };

  // Tooltip side mirrors the rail side so the bubble never paints off-screen
  // (left rail → tooltip on the right; right rail → on the left).
  const tipSide: "left" | "right" = side === "left" ? "right" : "left";
  const dragHint =
    side === "left"
      ? "Drag to reorder, or to the right rail"
      : "Drag to reorder, or to the left rail";

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={styles.item}
      data-dragging={isDragging ? "true" : "false"}
    >
      <Tooltip
        content={`${entry.label} — open it in the ${side} panel. ${dragHint}.`}
        tooltipId={`teach-rail-${id}`}
        side={tipSide}
      >
        <button
          type="button"
          // The icon is its own drag handle; spread dnd-kit's listeners +
          // a11y attributes onto it.
          {...attributes}
          {...listeners}
          className={`${styles.button} ${active ? styles.buttonActive : ""}`.trim()}
          aria-label={entry.label}
          aria-pressed={active}
          onClick={() => onActivate(id)}
        >
          <span className={styles.iconSlot} aria-hidden="true">
            {entry.icon}
          </span>
        </button>
      </Tooltip>
    </li>
  );
}

// ── TeachIconRail ─────────────────────────────────────────────────────────

interface TeachIconRailProps {
  /** Which side this rail renders on. */
  side: PanelSide;
  /** Ordered module ids on this rail. */
  ids: ModuleId[];
  /** The active tab of the same-side panel (highlights the matching icon). */
  activeModule: ModuleId | null;
  /** Click an icon → surface its module in the same-side panel. */
  onActivate: (id: ModuleId) => void;
}

export function TeachIconRail({
  side,
  ids,
  activeModule,
  onActivate,
}: TeachIconRailProps): ReactNode {
  // A whole-rail droppable so an icon can be dropped onto this rail even when
  // it's EMPTY (no sortable items to drop over). Without this, dragging the
  // last icon off a rail would strand it — there'd be no target to drop the
  // others back onto. The ref goes on the <ul> so the entire icon column is a
  // drop zone; `isOver` tints the rail while a valid drop hovers it.
  const { setNodeRef, isOver } = useDroppable({ id: railDroppableId(side) });

  return (
    <nav
      className={styles.rail}
      aria-label={`${side === "left" ? "Left" : "Right"} module rail`}
      // Touch-hold explanation for the rail as a whole (CLAUDE.md §4).
      title="Module launcher — tap an icon to open it in the panel, drag to rearrange"
    >
      {/* SortableContext registers this rail's id order with the shared
          DndContext that TeachShell mounts around both rails. */}
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          className={styles.list}
          role="list"
          data-teach-rail-side={side}
          data-drop-over={isOver ? "true" : "false"}
        >
          {ids.map((id) => (
            <SortableIcon
              key={id}
              id={id}
              side={side}
              active={id === activeModule}
              onActivate={onActivate}
            />
          ))}
        </ul>
      </SortableContext>
    </nav>
  );
}
