"use client";

// TeachShell.tsx — the Teach view's 5-zone workspace shell (Wave 1).
//
// Lays out the five structural zones from spec §2, left → right:
//
//   [far-left rail] [left panel] [center board] [right panel] [far-right rail]
//
// via a single CSS grid (see TeachShell.module.css). Wave 0 was a labeled
// skeleton; Wave 1 makes the workspace REAL: the two side panels are live
// <TeachPanel>s (tab strips + module bodies + collapse), the two far rails
// are live <TeachIconRail>s (reorderable icons + drag between rails), and
// resizable PaneSplitters sit on each panel's inner edge. Everything is
// driven by the per-teacher workspace layout from useTeachWorkspace() and
// persists across reloads. The center board stays a placeholder (Wave 3).
//
// ── Shell suppression ─────────────────────────────────────────────────────
// /teach lives in the (planner) route group so it inherits auth + the
// Personal/Team banner + the top bar (so the Teach tab can highlight). Teach
// owns its own chrome, so it suppresses the planner's default left filter
// panel, right panel, and the two shell icon rails — a `data-teach-view`
// attribute on the root triggers :global rules in app/globals.css that hide
// that chrome on this route (mirrors the print route).
//
// ── Cross-rail icon drag ────────────────────────────────────────────────────
// Both <TeachIconRail>s share ONE DndContext mounted here so an icon can be
// dragged from the left rail to the right rail (and back). dnd-kit needs a
// single parent DndContext for cross-SortableContext moves; onDragEnd routes
// the result to the workspace hook's moveIcon. This mirrors the shell's
// RailsDndProvider pattern (components/shell/RailsDndProvider.tsx). The tab
// strips inside each panel run their OWN, independent DndContext (tabs never
// move between panels by drag — only via the "+" picker), so the two drag
// systems don't interfere.
//
// ── Resize ──────────────────────────────────────────────────────────────────
// Each side panel gets a <PaneSplitter> on its inner edge (toward the board).
// The splitter resolves its drag against the panel's live bounding rect (the
// same approach WeeklyShell uses) and writes the new width through
// setPanelWidth. Widths are clamped so the center board always keeps a floor
// of space and a panel can't be dragged past a sane max.
//
// ── <900px fallback (Wave 0 decision, kept) ────────────────────────────────
// Below ~900px the 5-zone grid collapses to a single column showing only the
// center board, with a short note that the rails/panels are available on a
// larger screen — see the media query in TeachShell.module.css. The panels +
// rails stay mounted (state survives) but are hidden by CSS at that tier.
//
// ── Present mode (Wave 0 stub, kept) ───────────────────────────────────────
// Daily's Present button pushes /teach?present=1. We read the param and, when
// set, surface a small placeholder note. Full fullscreen-immersive Present
// mode is Wave 5.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  DndContext,
  type DragEndEvent,
  closestCenter,
} from "@dnd-kit/core";
import { Button, Tooltip } from "@/components/ui";
import { PaneSplitter } from "@/components/daily";
import { useDndSensors } from "@/lib/collapse-on-drag";
import { useTeachWorkspace } from "@/lib/teach/use-teach-workspace";
import { MODULE_REGISTRY } from "@/components/teach/module-registry";
import {
  PANEL_WIDTH_MAX,
  PANEL_WIDTH_MIN,
  type ModuleId,
  type PanelSide,
} from "@/lib/teach/teach-types";
import type { Lesson } from "@/lib/types";
import { arrayMove } from "@dnd-kit/sortable";
import { TeachPanel } from "./TeachPanel";
import { TeachIconRail, railDroppableId } from "./TeachIconRail";
import styles from "./TeachShell.module.css";

// ── Width constants ──────────────────────────────────────────────────────
// The hook clamps every width to [PANEL_WIDTH_MIN, PANEL_WIDTH_MAX] (240…560)
// — see lib/teach/use-teach-workspace.ts. We mirror that absolute clamp here
// for the splitter's aria-valuemin/max + drag math, and ADD a dynamic upper
// bound derived from the live shell width so a panel can never be dragged wide
// enough to crush the center board (the WeeklyShell pane-width model).
/** Reservation (px) kept for the center board so a panel can't squeeze it
 *  out. The board's own content scrolls inside this floor. */
const BOARD_FLOOR = 240;
/** Each far rail's fixed track width (px). */
const RAIL_W = 52;
/** Collapsed-panel strip width (px) — agrees with TeachPanel.module.css. */
const COLLAPSED_W = 32;
/** Keyboard nudge step (px) for a splitter's arrow-key resize. */
const PANEL_STEP = 16;

/** Compute the dynamic max width for a panel given the live shell width and
 *  the opposite panel's current footprint. Falls back to the absolute max
 *  when the shell width isn't measured yet. */
function dynamicMax(shellWidth: number, otherWidth: number): number {
  if (!Number.isFinite(shellWidth) || shellWidth <= 0) return PANEL_WIDTH_MAX;
  const room = shellWidth - RAIL_W * 2 - otherWidth - BOARD_FLOOR;
  // Never below the absolute min, never above the absolute max.
  return Math.max(PANEL_WIDTH_MIN, Math.min(PANEL_WIDTH_MAX, room));
}

/** Clamp a candidate panel width to [min, dynamicMax]. The hook re-clamps to
 *  its own [MIN, MAX] on write, so this is belt-and-braces: it keeps the live
 *  drag from overshooting the board floor before the write lands. */
function clampPanelWidth(
  px: number,
  shellWidth: number,
  otherWidth: number,
): number {
  const rounded = Math.round(px);
  const max = dynamicMax(shellWidth, otherWidth);
  return Math.min(max, Math.max(PANEL_WIDTH_MIN, rounded));
}

// ── Reset overflow menu ──────────────────────────────────────────────────
// A small "⋯" button opening a one-item menu: "Reset to default rails".
// Lives in the top-right of the shell so it's reachable without disturbing
// the panels. Closes on outside-click + Escape.

function OverflowIcon(): ReactNode {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

interface OverflowMenuProps {
  onReset: () => void;
}

function OverflowMenu({ onReset }: OverflowMenuProps): ReactNode {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={styles.overflowWrap}>
      <Tooltip
        content="Workspace options, including resetting your panels and rails to their defaults"
        tooltipId="teach-overflow"
        side="bottom"
      >
        <Button
          variant="icon"
          size="sm"
          iconAriaLabel="Workspace options"
          aria-expanded={open}
          aria-haspopup="menu"
          className={styles.overflowBtn}
          onClick={() => setOpen((o) => !o)}
        >
          <OverflowIcon />
        </Button>
      </Tooltip>
      {open && (
        <div className={styles.overflowMenu} role="menu" aria-label="Workspace options">
          <button
            type="button"
            role="menuitem"
            className={styles.overflowItem}
            onClick={() => {
              onReset();
              setOpen(false);
            }}
          >
            Reset to default rails
          </button>
        </div>
      )}
    </div>
  );
}

// ── TeachShell ──────────────────────────────────────────────────────────────

export function TeachShell(): ReactNode {
  // Present mode is requested via ?present=1 (Daily's Present button). Wave 0
  // only notes it; Wave 5 wires the actual fullscreen-immersive behavior.
  const searchParams = useSearchParams();
  const isPresent = searchParams.get("present") === "1";

  // The per-teacher workspace layout. Until `hydrated`, the hook returns the
  // SSR-safe default layout, so we render against `layout` unconditionally —
  // the post-mount swap to the persisted layout is the same kind of
  // non-jarring hydration the rest of the app uses.
  const {
    layout,
    setPanelWidth,
    toggleCollapse,
    setActiveTab,
    reorderTabs,
    reorderRail,
    moveIcon,
    addModuleToPanel,
    resetToDefault,
  } = useTeachWorkspace();

  // Lesson context for the module bodies. Wave 2 wires real navigation
  // (week / subject / lesson selection); Wave 1 has no selected lesson, so
  // modules render their no-lesson state. Kept as a named local so the Wave 2
  // hook-up is a one-line change.
  const lesson: Lesson | null = null;

  // dnd-kit sensors shared by the cross-rail icon DndContext below.
  const sensors = useDndSensors();

  // Shell width — read for the splitter clamps so a panel dragged wide on a
  // big monitor doesn't get stranded off-screen on a narrow one. Observed via
  // ResizeObserver on the zone grid.
  const zonesRef = useRef<HTMLDivElement | null>(null);
  const [shellWidth, setShellWidth] = useState(0);

  useEffect(() => {
    const el = zonesRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setShellWidth(Math.round(entry.contentRect.width));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-clamp persisted panel widths whenever the shell width changes (resize,
  // DevTools, hydration loading saved widths). Without this, a panel saved at
  // 560px on a big monitor would keep that width after a reload/resize to a
  // narrow viewport and crush the board past BOARD_FLOOR (Codex Medium #1).
  // `setPanelWidth` no-ops when the clamped value equals the current width, so
  // this can't loop. A collapsed panel has no width footprint to clamp, so we
  // skip it (its strip width is fixed). The opposite panel's footprint feeds
  // the clamp the same way the live drag does.
  useEffect(() => {
    if (shellWidth <= 0) return;
    const leftOther = layout.right.collapsed ? COLLAPSED_W : layout.right.width;
    const rightOther = layout.left.collapsed ? COLLAPSED_W : layout.left.width;
    if (!layout.left.collapsed) {
      const clamped = clampPanelWidth(layout.left.width, shellWidth, leftOther);
      if (clamped !== layout.left.width) setPanelWidth("left", clamped);
    }
    if (!layout.right.collapsed) {
      const clamped = clampPanelWidth(
        layout.right.width,
        shellWidth,
        rightOther,
      );
      if (clamped !== layout.right.width) setPanelWidth("right", clamped);
    }
  }, [
    shellWidth,
    layout.left.width,
    layout.right.width,
    layout.left.collapsed,
    layout.right.collapsed,
    setPanelWidth,
  ]);

  // ── Cross-rail icon drag ──────────────────────────────────────────────
  // `over.id` is one of: a rail-icon's ModuleId, or one of the whole-rail
  // droppable ids (railDroppableId(side)) — the latter is what lets an icon
  // land on an EMPTY rail that has no sortable items to drop over. Resolve the
  // side either way, then reorder within the source rail (reorderRail wants
  // the FULL reordered array) or move to the other rail (moveIcon appends).
  const sideOfModule = useCallback(
    (id: ModuleId): PanelSide | null => {
      if (layout.leftRail.includes(id)) return "left";
      if (layout.rightRail.includes(id)) return "right";
      return null;
    },
    [layout.leftRail, layout.rightRail],
  );

  // Resolve the target side from an over.id that may be an icon OR a rail
  // droppable. Returns null when it matches neither.
  const sideOfOver = useCallback(
    (overId: string): PanelSide | null => {
      if (overId === railDroppableId("left")) return "left";
      if (overId === railDroppableId("right")) return "right";
      return sideOfModule(overId as ModuleId);
    },
    [sideOfModule],
  );

  const handleRailDragEnd = useCallback(
    (event: DragEndEvent): void => {
      const { active, over } = event;
      if (!over) return;
      const draggedId = active.id as ModuleId;
      const overId = String(over.id);
      if (draggedId === overId) return;

      const sourceSide = sideOfModule(draggedId);
      if (sourceSide == null) return;
      const targetSide = sideOfOver(overId);
      if (targetSide == null) return;

      // Whether the drop landed ON an icon (vs the empty-rail droppable) —
      // only an icon drop carries a position to reorder to.
      const overIsIcon =
        overId !== railDroppableId("left") &&
        overId !== railDroppableId("right");

      // Same-rail reorder → reorderRail(side, fullReorderedIds). A drop on the
      // rail's empty droppable (not on an icon) within the source rail is a
      // no-op (nothing to reorder relative to).
      if (targetSide === sourceSide) {
        if (!overIsIcon) return;
        const list =
          sourceSide === "left" ? layout.leftRail : layout.rightRail;
        const from = list.indexOf(draggedId);
        const to = list.indexOf(overId as ModuleId);
        if (from === -1 || to === -1) return;
        reorderRail(sourceSide, arrayMove(list, from, to));
        return;
      }

      // Cross-rail → moveIcon(from, to, id). The hook APPENDS the id to the
      // destination rail; it has no drop-index, so the icon lands at the end
      // of the target rail regardless of where over the rail it was released.
      // (v1 limitation — fine-grained cross-rail ordering is out of scope.)
      moveIcon(sourceSide, targetSide, draggedId);
    },
    [
      sideOfModule,
      sideOfOver,
      layout.leftRail,
      layout.rightRail,
      reorderRail,
      moveIcon,
    ],
  );

  // ── Splitter wiring (per side) ────────────────────────────────────────
  // The left panel's splitter sits to its RIGHT (toward the board): dragging
  // right grows the panel (width = clientX − panelLeft). The right panel's
  // splitter sits to its LEFT: dragging left grows it (width = panelRight −
  // clientX). We resolve each panel's live rect via a data attribute.
  const resolvePanelRect = useCallback((side: PanelSide): DOMRect | null => {
    const root = zonesRef.current;
    if (!root) return null;
    const el = root.querySelector<HTMLElement>(`[data-teach-zone="${side}"]`);
    return el ? el.getBoundingClientRect() : null;
  }, []);

  // Opposite panel's current footprint for the clamp (collapsed → strip).
  const otherFootprint = useCallback(
    (side: PanelSide): number => {
      const other = side === "left" ? layout.right : layout.left;
      return other.collapsed ? COLLAPSED_W : other.width;
    },
    [layout.left, layout.right],
  );

  const makeSplitterDrag = useCallback(
    (side: PanelSide) =>
      (clientX: number): void => {
        const other = otherFootprint(side);
        // Home / End arrive as ±Infinity → clamp directly to min / max.
        if (!Number.isFinite(clientX)) {
          const target =
            clientX === Infinity ? Number.MAX_SAFE_INTEGER : PANEL_WIDTH_MIN;
          setPanelWidth(side, clampPanelWidth(target, shellWidth, other));
          return;
        }
        const rect = resolvePanelRect(side);
        if (!rect) return;
        const desired =
          side === "left" ? clientX - rect.left : rect.right - clientX;
        setPanelWidth(side, clampPanelWidth(desired, shellWidth, other));
      },
    [otherFootprint, resolvePanelRect, setPanelWidth, shellWidth],
  );

  const makeSplitterStep = useCallback(
    (side: PanelSide) =>
      (direction: -1 | 1): void => {
        const other = otherFootprint(side);
        // Left panel: ArrowRight (+1) grows it. Right panel: ArrowRight (+1)
        // moves the divider right, SHRINKING it → invert the sign.
        const sign = side === "left" ? 1 : -1;
        const current =
          side === "left" ? layout.left.width : layout.right.width;
        setPanelWidth(
          side,
          clampPanelWidth(current + sign * direction * PANEL_STEP, shellWidth, other),
        );
      },
    [
      otherFootprint,
      setPanelWidth,
      shellWidth,
      layout.left.width,
      layout.right.width,
    ],
  );

  // ── Rail-icon activation ──────────────────────────────────────────────
  // Clicking a rail icon surfaces that module in the same-side panel: make it
  // the active tab (adding it as a tab first if it isn't one yet).
  const makeRailActivate = useCallback(
    (side: PanelSide) =>
      (id: ModuleId): void => {
        const panel = side === "left" ? layout.left : layout.right;
        if (!panel.tabs.includes(id)) {
          addModuleToPanel(side, id);
        }
        setActiveTab(side, id);
        // If collapsed, opening a module should reveal the panel.
        if (panel.collapsed) toggleCollapse(side);
      },
    [layout.left, layout.right, addModuleToPanel, setActiveTab, toggleCollapse],
  );

  // ── Per-side derived props ────────────────────────────────────────────
  // The set of modules a panel can ADD (every module not already a tab).
  const allModules = Object.keys(MODULE_REGISTRY) as ModuleId[];
  const addableFor = (side: PanelSide): ModuleId[] => {
    const panel = side === "left" ? layout.left : layout.right;
    return allModules.filter((id) => !panel.tabs.includes(id));
  };

  // The grid track width for each panel column (collapsed → 32px strip).
  const leftTrack = layout.left.collapsed
    ? `${COLLAPSED_W}px`
    : `${Math.round(layout.left.width)}px`;
  const rightTrack = layout.right.collapsed
    ? `${COLLAPSED_W}px`
    : `${Math.round(layout.right.width)}px`;

  // Splitters are suppressed for a collapsed panel (re-expand via its strip).
  const showLeftSplitter = !layout.left.collapsed;
  const showRightSplitter = !layout.right.collapsed;

  // Build the grid template: rail | left-panel | [splitter] | board |
  // [splitter] | right-panel | rail. `auto` tracks hold the splitters; we
  // only emit them when the adjacent panel is expanded.
  const gridTemplate = [
    `${RAIL_W}px`,
    leftTrack,
    showLeftSplitter ? "auto" : null,
    "minmax(0, 1fr)",
    showRightSplitter ? "auto" : null,
    rightTrack,
    `${RAIL_W}px`,
  ]
    .filter((t): t is string => t !== null)
    .join(" ");

  return (
    // data-teach-view triggers the :global selectors in app/globals.css that
    // suppress the planner's default chrome on this route.
    <div data-teach-view className={styles.page}>
      {/* Present-mode stub note — acknowledges ?present=1 until Wave 5. */}
      {isPresent && (
        <div className={styles.presentNote} role="status">
          Present mode requested (full fullscreen view arrives in a later
          update).
        </div>
      )}

      {/* Stacked-fallback note — hidden ≥900px; visible only in the
          single-panel fallback so a tablet/phone teacher understands why the
          rails and side panels aren't showing. */}
      <p className={styles.fallbackNote}>
        The side rails and panels appear on a larger screen. The teaching board
        is shown here.
      </p>

      {/* The five zones. One shared DndContext spans both rails so icons can
          be dragged between them; the panels' tab strips manage their own
          DndContexts internally. */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleRailDragEnd}
      >
        <div
          ref={zonesRef}
          className={styles.zones}
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {/* Far-left rail. */}
          <TeachIconRail
            side="left"
            ids={layout.leftRail}
            activeModule={layout.left.activeTab}
            onActivate={makeRailActivate("left")}
          />

          {/* Left panel. */}
          <div className={styles.panelZone} data-teach-zone="left">
            <TeachPanel
              side="left"
              tabs={layout.left.tabs}
              activeTab={layout.left.activeTab}
              collapsed={layout.left.collapsed}
              addable={addableFor("left")}
              lesson={lesson}
              onToggleCollapse={() => toggleCollapse("left")}
              onActivateTab={(id) => setActiveTab("left", id)}
              onReorderTabs={(ids) => reorderTabs("left", ids)}
              onAddModule={(id) => addModuleToPanel("left", id)}
            />
          </div>

          {/* Resize handle between the left panel and the board. */}
          {showLeftSplitter && (
            <PaneSplitter
              width={Math.round(layout.left.width)}
              min={PANEL_WIDTH_MIN}
              max={dynamicMax(shellWidth, otherFootprint("left"))}
              onDrag={makeSplitterDrag("left")}
              onStep={makeSplitterStep("left")}
              label="Resize left panel"
            />
          )}

          {/* Center board — Wave 3 placeholder. */}
          <section className={styles.board} aria-label="Teaching board">
            <div className={styles.boardPlaceholder}>
              <span className={styles.boardLabel}>Teaching board</span>
              <span className={styles.boardNote}>
                Widget grid + layout toolbar arrive in a later update.
              </span>
            </div>
            {/* Workspace overflow menu pinned to the board's top-right. */}
            <div className={styles.overflowSlot}>
              <OverflowMenu onReset={resetToDefault} />
            </div>
          </section>

          {/* Resize handle between the board and the right panel. */}
          {showRightSplitter && (
            <PaneSplitter
              width={Math.round(layout.right.width)}
              min={PANEL_WIDTH_MIN}
              max={dynamicMax(shellWidth, otherFootprint("right"))}
              onDrag={makeSplitterDrag("right")}
              onStep={makeSplitterStep("right")}
              label="Resize right panel"
            />
          )}

          {/* Right panel. */}
          <div className={styles.panelZone} data-teach-zone="right">
            <TeachPanel
              side="right"
              tabs={layout.right.tabs}
              activeTab={layout.right.activeTab}
              collapsed={layout.right.collapsed}
              addable={addableFor("right")}
              lesson={lesson}
              onToggleCollapse={() => toggleCollapse("right")}
              onActivateTab={(id) => setActiveTab("right", id)}
              onReorderTabs={(ids) => reorderTabs("right", ids)}
              onAddModule={(id) => addModuleToPanel("right", id)}
            />
          </div>

          {/* Far-right rail. */}
          <TeachIconRail
            side="right"
            ids={layout.rightRail}
            activeModule={layout.right.activeTab}
            onActivate={makeRailActivate("right")}
          />
        </div>
      </DndContext>
    </div>
  );
}
