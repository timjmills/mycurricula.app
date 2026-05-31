"use client";

// RailsDndProvider.tsx — the shared dnd-kit context that spans both icon
// rails (left + right). Wave 1.5 Lane FA: teachers can drag any icon from
// the LEFT rail to the RIGHT rail and back, with persistence.
//
// ── Why one DndContext, not two ──────────────────────────────────────────
// dnd-kit can only move an id from one SortableContext to another when
// BOTH contexts share a single parent DndContext — the sensor session that
// fires on pointer-down has to outlive the rail boundary so the drop on
// the OTHER rail is recognized as a valid drop target. So we wrap the
// entire body row of the planner shell in this provider; GlobalRail and
// RightIconRail each register their own SortableContext inside it.
//
// ── onDragEnd routing ────────────────────────────────────────────────────
// dnd-kit reports `active.id` (the icon picked up) and `over.id` (whatever
// the cursor was on when released — either another icon's id, or a
// sortable container's id if there's an empty rail). We need to figure
// out which RAIL the icon landed on; we do that by reading `over.data.
// current?.sortable.containerId` (provided by useSortable) when over an
// icon, OR by checking whether `over.id === RIGHT_RAIL_DROPPABLE_ID` for
// empty-rail drops. Empty rails: since dnd-kit needs a droppable to land
// on an empty list, we render a `useDroppable`-bound drop zone on each
// rail (handled by the rail components themselves via the SortableContext
// `items` array — when items is empty, dnd-kit treats the container as
// a drop zone via the closestCenter / closestCorners collision strategy).
//
// In practice the simplest robust resolution is:
//   1. If `over.id` matches an icon in `layout.left`, target side is "left";
//   2. If it matches an icon in `layout.right`, target side is "right";
//   3. Otherwise (empty rail) infer from the OPPOSITE of active's side.
// Then compute toIndex by finding `over.id`'s index in the target list (or
// appending when no over).
//
// ── Sensors ──────────────────────────────────────────────────────────────
// Reuses `useDndSensors` from lib/collapse-on-drag — pointer (6px
// activation), touch (180ms delay), keyboard (arrow keys). The activation
// distance ensures a plain click on a rail icon (e.g. clicking Settings)
// is NEVER mis-read as a drag.
//
// ── Reduced motion ───────────────────────────────────────────────────────
// dnd-kit's default sortable transition is short (~250ms ease). Under
// prefers-reduced-motion the `transition` field returned from useSortable
// is null, so the transform applies instantly. The icons therefore snap
// to position without animation when reduced motion is on — no extra
// wiring needed here.

import { useState, type ReactNode } from "react";
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  closestCenter,
} from "@dnd-kit/core";
import { useDndSensors } from "@/lib/collapse-on-drag";
import {
  useRailLayout,
  type RailIconId,
  type RailSide,
} from "@/lib/use-rail-layout";

interface RailsDndProviderProps {
  children: ReactNode;
}

/**
 * Wraps the planner-shell body row in a shared DndContext so drag-and-drop
 * works ACROSS the two icon rails. Renders nothing visible itself; just a
 * context wrapper around its children.
 */
export function RailsDndProvider({
  children,
}: RailsDndProviderProps): ReactNode {
  const { layout, moveIcon } = useRailLayout();
  const sensors = useDndSensors();

  // Track the actively-dragged icon id so we could render a DragOverlay
  // ghost in a follow-up — kept here as a hook seam even though we render
  // null for the overlay today (the source icon already ghosts at 40%
  // opacity in the sortable wrapper, which is enough feedback for a
  // single-row vertical list).
  const [activeId, setActiveId] = useState<RailIconId | null>(null);

  // Resolve which RAIL an `over.id` belongs to. Returns the side or null
  // if the id doesn't match any rail member (shouldn't happen in practice
  // since every drop target is one of the rails' sortable items).
  function sideOf(id: string | null): RailSide | null {
    if (id == null) return null;
    if (layout.left.includes(id as RailIconId)) return "left";
    if (layout.right.includes(id as RailIconId)) return "right";
    return null;
  }

  function handleDragEnd(event: DragEndEvent): void {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const draggedId = active.id as RailIconId;
    const overId = over.id as RailIconId;

    if (draggedId === overId) return;

    // Determine target side.
    const overSide = sideOf(overId);
    const sourceSide = sideOf(draggedId);
    // If `over.id` is itself an icon, the target side is that icon's side.
    // Otherwise (empty-rail drop) fall back to the opposite of the source.
    const targetSide: RailSide =
      overSide ?? (sourceSide === "left" ? "right" : "left");

    // Compute the index to insert at on the target side. If `overId` is on
    // the target list, insert just BEFORE it (the natural vertical-list
    // sort semantic — drop on top of an item to push it down). If the
    // overId isn't on the target list (e.g. empty rail), append.
    const targetList = layout[targetSide];
    const overIndex = targetList.indexOf(overId);
    const toIndex = overIndex === -1 ? targetList.length : overIndex;

    moveIcon(draggedId, targetSide, toIndex);
  }

  return (
    <DndContext
      // Stable id so dnd-kit's internal `useUniqueId` (a MODULE-level
      // counter, not React's useId) doesn't drift between the server and
      // client renders. Without it the sortable rail icons' generated
      // `aria-describedby="DndDescribedBy-<n>"` mismatches at hydration
      // (server counts from one offset, client from another), tripping a
      // React hydration warning. A fixed id pins the value on both sides.
      id="rails-dnd"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(e) => {
        setActiveId(e.active.id as RailIconId);
      }}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
    >
      {children}
      {/* DragOverlay is intentionally empty — the sortable wrapper already
          ghosts the source icon at 40% opacity which reads well in a 56px
          vertical strip. A real ghost would require duplicating each
          icon's wired-up button JSX, which complicates click semantics
          without adding clarity for a teacher dragging a single icon. */}
      <DragOverlay>{activeId ? null : null}</DragOverlay>
    </DndContext>
  );
}
