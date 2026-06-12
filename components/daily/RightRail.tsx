"use client";

// RightRail.tsx — the Daily / Weekly view's right-most content column.
//
// MED-5 added a TABBED rail (Resources / To-do / Chat as tabs, one full-height
// widget at a time). This revision restores the pre-MED-5 stacked+resizable
// panel trio WITHOUT removing tabs — the teacher chooses between TWO display
// modes via a small segmented control in the rail header:
//
//   Tabbed (default)  — existing MED-5 behavior, exactly as before.
//   Stacked           — the three panels stack vertically, are drag-reorderable
//                       via @dnd-kit (verticalListSortingStrategy), and are
//                       individually resizable via PaneSplitter (horizontal).
//
// Persistence — localStorage keys:
//   mycurricula:rail-mode          — "tabbed" | "stacked"
//   mycurricula:daily-right-rail-tab — active tab (tabbed mode)
//   mycurricula:rail-panel-order   — JSON array of PanelId (stacked mode)
//   mycurricula:rail-panel-heights — JSON Record<PanelId, number> px heights
//
// All keys are SSR-safe: default values are used on the server and in the
// initial render; post-mount useEffect loads the persisted values. This
// matches the hydration-safe pattern used throughout the codebase.
//
// Preserved from the original stacked-panel design:
//   • ResourcesPanel lesson-scoping (mode="day" / "week", onClearLesson).
//   • Hide-rail toggle and responsive collapse — owned by the consuming shell
//     (DailyView / WeeklyShell), not by this component; nothing here changes
//     that contract.
//   • The rail's cp-subj cascade for subject colors in ResourcesPanel.
//   • The aria-label region differentiation (day vs. week mode).
//   • PanelDragHandleProps re-export so ResourcesPanel, TodayTodos, and
//     Shoutbox continue to compile without changes.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ToggleGroup, Tooltip } from "@/components/ui";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDndSensors } from "@/lib/collapse-on-drag";
import type { Lesson } from "@/lib/types";
import { ResourcesPanel } from "./ResourcesPanel";
import { TodayTodos } from "./TodayTodos";
import { Shoutbox } from "./Shoutbox";
import { PaneSplitter } from "./PaneSplitter";
import styles from "./RightRail.module.css";

// ── PanelDragHandleProps — re-exported so ResourcesPanel, TodayTodos, and
// Shoutbox can import the type from this file. Both tabbed and stacked modes
// supply this bundle (stacked passes real dnd-kit wiring; tabbed passes
// nothing so the panels render without a grip — their `dragHandleProps` prop
// is optional). This export must stay here even if neither mode uses it for
// the consuming panels to compile.
export interface PanelDragHandleProps {
  /** setActivatorNodeRef from useSortable — the grip is the SOLE activator. */
  ref?: (el: HTMLElement | null) => void;
  /** dnd-kit synthetic listeners (pointer + keyboard activation). */
  listeners?: SyntheticListenerMap;
  /** dnd-kit a11y attributes (role, aria-roledescription, etc.). */
  attributes?: DraggableAttributes;
  /** Human-readable label for the grip's aria-label. */
  label?: string;
}

// ── Rail display mode ─────────────────────────────────────────────────────

type RailMode = "tabbed" | "stacked";
const DEFAULT_RAIL_MODE: RailMode = "tabbed";
const RAIL_MODE_KEY = "mycurricula:rail-mode";

function readRailMode(): RailMode {
  if (typeof window === "undefined") return DEFAULT_RAIL_MODE;
  try {
    const raw = window.localStorage.getItem(RAIL_MODE_KEY);
    if (raw === "tabbed" || raw === "stacked") return raw;
  } catch {
    // localStorage unavailable — use default.
  }
  return DEFAULT_RAIL_MODE;
}

function writeRailMode(mode: RailMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RAIL_MODE_KEY, mode);
  } catch {
    // Storage full / unavailable — preference simply won't persist; non-fatal.
  }
}

// ── Tab definitions (tabbed mode) ─────────────────────────────────────────

const TAB_IDS = ["resources", "todos", "chat"] as const;
type TabId = (typeof TAB_IDS)[number];

const TAB_LABEL: Record<TabId, string> = {
  resources: "Resources",
  todos: "To-do",
  chat: "Chat",
};

const DEFAULT_TAB: TabId = "resources";
const TAB_STORAGE_KEY = "mycurricula:daily-right-rail-tab";

function isTabId(v: unknown): v is TabId {
  return typeof v === "string" && (TAB_IDS as readonly string[]).includes(v);
}

function readTab(): TabId {
  if (typeof window === "undefined") return DEFAULT_TAB;
  try {
    const raw = window.localStorage.getItem(TAB_STORAGE_KEY);
    if (raw && isTabId(raw)) return raw;
  } catch {
    // localStorage unavailable — use default.
  }
  return DEFAULT_TAB;
}

function writeTab(tab: TabId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TAB_STORAGE_KEY, tab);
  } catch {
    // Storage full / unavailable — preference simply won't persist; non-fatal.
  }
}

// Public aliases — the Daily dock's collapsed icon rail renders one icon
// per inner tab and needs the id set + the persisted value to seed its
// controlled-tab state. RightRail remains the single owner of the
// storage key.
export type RailTabId = TabId;
export const RAIL_TAB_IDS = TAB_IDS;
export const RAIL_TAB_LABEL = TAB_LABEL;

/** Read the persisted rail tab (SSR-safe; default "resources"). */
export function readRailTab(): RailTabId {
  return readTab();
}

/** Persist the rail tab — for consumers that change the controlled tab
 *  from OUTSIDE the rail's own tab strip (the dock's collapsed icon
 *  rail). Same key, same owner file. */
export function writeRailTab(tab: RailTabId): void {
  writeTab(tab);
}

// ── Panel definitions (stacked mode) ─────────────────────────────────────

// The three stacked panels share a stable id set. The panel order and heights
// are separate persisted values so they can be loaded and written independently.

const PANEL_IDS = ["resources", "todos", "chat"] as const;
type PanelId = (typeof PANEL_IDS)[number];

const DEFAULT_PANEL_ORDER: PanelId[] = ["resources", "todos", "chat"];
const PANEL_ORDER_KEY = "mycurricula:rail-panel-order";

// Default height (px) per panel. The three panels split the rail roughly
// 40/30/30 — Resources tends to be the heaviest widget. These are soft
// defaults; the teacher can resize freely; PaneSplitter clamps to a minimum.
const DEFAULT_HEIGHTS: Record<PanelId, number> = {
  resources: 260,
  todos: 180,
  chat: 180,
};
const PANEL_HEIGHTS_KEY = "mycurricula:rail-panel-heights";
const PANEL_HEIGHT_MIN = 80; // px — minimum per-panel height in stacked mode

function isPanelOrder(v: unknown): v is PanelId[] {
  if (!Array.isArray(v) || v.length !== PANEL_IDS.length) return false;
  const ids = new Set<string>(PANEL_IDS);
  return v.every((x) => typeof x === "string" && ids.has(x));
}

function readPanelOrder(): PanelId[] {
  if (typeof window === "undefined") return DEFAULT_PANEL_ORDER;
  try {
    const raw = window.localStorage.getItem(PANEL_ORDER_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isPanelOrder(parsed)) return parsed;
    }
  } catch {
    // Parse error or localStorage unavailable — fall back to default.
  }
  return DEFAULT_PANEL_ORDER;
}

function writePanelOrder(order: PanelId[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PANEL_ORDER_KEY, JSON.stringify(order));
  } catch {
    // Non-fatal.
  }
}

function readPanelHeights(): Record<PanelId, number> {
  if (typeof window === "undefined") return { ...DEFAULT_HEIGHTS };
  try {
    const raw = window.localStorage.getItem(PANEL_HEIGHTS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        const rec = parsed as Record<string, unknown>;
        const result = { ...DEFAULT_HEIGHTS };
        for (const id of PANEL_IDS) {
          if (
            typeof rec[id] === "number" &&
            (rec[id] as number) >= PANEL_HEIGHT_MIN
          ) {
            result[id] = rec[id] as number;
          }
        }
        return result;
      }
    }
  } catch {
    // Non-fatal.
  }
  return { ...DEFAULT_HEIGHTS };
}

function writePanelHeights(heights: Record<PanelId, number>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PANEL_HEIGHTS_KEY, JSON.stringify(heights));
  } catch {
    // Non-fatal.
  }
}

// ── Mode-toggle icons ─────────────────────────────────────────────────────
// Two small icons representing tabbed vs. stacked layout modes. They fit
// in a compact segmented control next to the tab strip (tabbed) or the rail
// header (stacked). Same 14×14 Lucide-style outline vocabulary as the rest
// of the file.

function TabbedIcon(): ReactNode {
  // A single rounded rect — represents one full-height panel (tabbed).
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
    </svg>
  );
}

function StackedIcon(): ReactNode {
  // Three stacked horizontal bars — represents three stacked panels.
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="5" rx="1" />
      <rect x="3" y="10" width="18" height="4" rx="1" />
      <rect x="3" y="16" width="18" height="5" rx="1" />
    </svg>
  );
}

// ── Stacked-mode sortable panel wrapper ───────────────────────────────────
// Each panel in stacked mode is wrapped in this component which:
//   • calls useSortable so dnd-kit can animate it into its new position;
//   • exposes a grip handle (the SOLE drag activator) via dragHandleProps;
//   • renders a PaneSplitter below itself (except the last panel) so the
//     teacher can resize adjacent panels by dragging.
//
// The outer div drives the transform so the panel card slides smoothly during
// reorder. The collapse / expand mechanic from the pre-MED-5 design is NOT
// restored here — the resize handle provides continuous sizing instead.

interface SortablePanelProps {
  id: PanelId;
  height: number;
  isLast: boolean;
  /** Called when the splitter below this panel is dragged or nudged. */
  onResizeStart?: () => void;
  onDragSplitter: (clientY: number) => void;
  onStepSplitter: (direction: -1 | 1) => void;
  children: (dragHandleProps: PanelDragHandleProps) => ReactNode;
}

function SortablePanel({
  id,
  height,
  isLast,
  onDragSplitter,
  onStepSplitter,
  children,
}: SortablePanelProps): ReactNode {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    // The panel's height in stacked mode is controlled here, not by the
    // children — so every panel has a deterministic px height that the
    // PaneSplitter can operate against.
    height: `${height}px`,
    minHeight: PANEL_HEIGHT_MIN,
    flexShrink: 0,
    // dnd-kit transform: slides the panel to its new slot during drag.
    transform: CSS.Transform.toString(transform),
    transition,
    // Ghost the dragging panel so the user can see where it will land.
    opacity: isDragging ? 0.4 : 1,
    // Stack panels without internal scroll — each panel's content scrolls
    // within its fixed height if needed (panel components handle this).
    overflow: "hidden",
  };

  const dragHandleProps: PanelDragHandleProps = {
    ref: setActivatorNodeRef as PanelDragHandleProps["ref"],
    listeners,
    attributes,
    label: `Drag to reorder ${id} panel`,
  };

  return (
    <div ref={setNodeRef} style={style} className={styles.stackedPanel}>
      {children(dragHandleProps)}
      {/* PaneSplitter lives BELOW this panel (between this and the next).
          Not rendered for the last panel — there is no panel below it. */}
      {!isLast && (
        <PaneSplitter
          orientation="horizontal"
          width={height}
          min={PANEL_HEIGHT_MIN}
          // Max is intentionally large; the rail's own height provides
          // the real upper bound through the CSS flex container.
          max={2000}
          onDrag={onDragSplitter}
          onStep={onStepSplitter}
          label={`Resize ${id} panel`}
          className={styles.railSplitter}
        />
      )}
    </div>
  );
}

// ── RightRailProps ────────────────────────────────────────────────────────

interface RightRailProps {
  /** The currently-selected lesson, or null. Drives the Resources panel in
   *  day mode. Ignored in week mode (the panel aggregates across `lessons`
   *  instead). */
  lesson: Lesson | null;
  /** Active week — scopes the shoutbox thread and the Resources headline. */
  week: number;
  /** Active day index, 0 = Sunday. */
  day: number;
  /**
   * Optional rail scope.
   *   • "day"  (default) — existing Daily-view behavior: Resources reflects
   *                        the selected `lesson`.
   *   • "week"           — Weekly-view behavior: Resources aggregates across
   *                        every lesson in `lessons`. To-dos and Chat keep
   *                        their existing day-scoped behavior.
   */
  mode?: "day" | "week";
  /**
   * Optional list of lessons to aggregate across in week mode. Required
   * only when `mode === "week"`; ignored otherwise.
   */
  lessons?: Lesson[];
  /**
   * When the rail is in lesson-scoped day mode (a card is selected on
   * /weekly), this callback is wired to the Resources panel's "Back to
   * week" affordance. Omit in pure day mode.
   */
  onClearLesson?: () => void;
  /**
   * Live count of OPEN to-dos, reported up from <TodayTodos> so the
   * dock's collapsed-rail badge ticks down as the teacher checks items
   * off (handoff §2 — "To-do completion drives the rail badge count").
   */
  onOpenTodoCountChange?: (count: number) => void;
  /**
   * Optional CONTROLLED active tab (tabbed mode). When set, the rail
   * renders this tab instead of its internal state — the Daily dock's
   * collapsed icon rail uses it so clicking a Resources / To-do / Chat
   * rail icon deep-opens the matching tab. Persistence still happens
   * here (one owner for the storage key) via `selectTab`.
   */
  activeTab?: RailTabId;
  /** Change notifications for the controlled `activeTab`. */
  onActiveTabChange?: (tab: RailTabId) => void;
}

// ── RightRail ────────────────────────────────────────────────────────────

export function RightRail({
  lesson,
  week,
  day,
  mode = "day",
  lessons,
  onClearLesson,
  onOpenTodoCountChange,
  activeTab: controlledTab,
  onActiveTabChange,
}: RightRailProps): ReactNode {
  // The `cp-subj` wrapper on the rail forwards the selected lesson's subject
  // color into ResourcesPanel via the cascading --c / --cl / --cd properties.
  // In week mode (no single "current" subject) the class chain drops back to
  // the neutral defaults defined in tokens.css.
  const subjectClass = mode === "day" && lesson ? lesson.subject : "";

  // Stable identity for the lessons array forwarded to ResourcesPanel in week
  // mode. Falling back to an empty array keeps the prop's TS type narrow
  // (Lesson[]) and avoids "new array per render" cascades inside the panel.
  const weekLessons = useMemo<Lesson[]>(() => lessons ?? [], [lessons]);

  // ── Rail mode (tabbed / stacked) — SSR-safe hydration ─────────────────
  // Initialise to the default so server-rendered HTML and the first client
  // render match. The post-mount effect loads the persisted value.
  const [railMode, setRailMode] = useState<RailMode>(DEFAULT_RAIL_MODE);
  const hydratedRef = useRef(false);

  // ── Active tab — SSR-safe hydration ────────────────────────────────────
  // Controlled when the consumer passes `activeTab` (the Daily dock does);
  // otherwise the internal state below drives the tab strip.
  const [internalTab, setInternalTab] = useState<TabId>(DEFAULT_TAB);
  const activeTab = controlledTab ?? internalTab;

  // ── Stacked-mode state — SSR-safe hydration ────────────────────────────
  const [panelOrder, setPanelOrder] = useState<PanelId[]>(DEFAULT_PANEL_ORDER);
  const [panelHeights, setPanelHeights] = useState<Record<PanelId, number>>({
    ...DEFAULT_HEIGHTS,
  });

  // Single post-mount effect loads all persisted values. Runs once.
  useEffect(() => {
    setRailMode(readRailMode());
    setInternalTab(readTab());
    setPanelOrder(readPanelOrder());
    setPanelHeights(readPanelHeights());
    hydratedRef.current = true;
  }, []);

  // ── Mode toggle ────────────────────────────────────────────────────────
  const selectMode = useCallback((m: RailMode) => {
    setRailMode(m);
    if (hydratedRef.current) writeRailMode(m);
  }, []);

  // ── Tab selection (tabbed mode) ────────────────────────────────────────
  const selectTab = useCallback(
    (tab: TabId) => {
      setInternalTab(tab);
      onActiveTabChange?.(tab);
      if (hydratedRef.current) writeTab(tab);
    },
    [onActiveTabChange],
  );

  // ── Panel reorder (stacked mode) ──────────────────────────────────────
  const sensors = useDndSensors();

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setPanelOrder((prev) => {
      const oldIndex = prev.indexOf(active.id as PanelId);
      const newIndex = prev.indexOf(over.id as PanelId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = arrayMove(prev, oldIndex, newIndex);
      if (hydratedRef.current) writePanelOrder(next);
      return next;
    });
  }, []);

  // ── Per-panel resize (stacked mode) ───────────────────────────────────
  // Each PaneSplitter below panel[i] reports clientY; we convert it to a
  // new height for panel[i] by subtracting the panel's top edge from clientY.
  // We track the panel container's top via a ref on the rail element.
  const railRef = useRef<HTMLElement | null>(null);

  // Returns a stable drag handler for a given panel id. The handler is
  // called with clientY; it computes the new height for that panel by
  // measuring the distance from the rail top to clientY, then subtracting
  // the heights of all panels that appear above the target panel in the
  // current order. This avoids the "close the closure over stale state"
  // problem by using the functional updater form of setPanelHeights.
  const makeDragHandler = useCallback(
    (panelId: PanelId) =>
      (clientY: number): void => {
        if (!railRef.current) return;
        const railRect = railRef.current.getBoundingClientRect();
        // Sum of all panel heights above the splitter that's being dragged.
        // panelOrder at this point is the stale closure value — but we only
        // need the ORDER (which panels are above), not the heights, so reading
        // the ref directly here is safe. We use the functional form of
        // setPanelHeights to get the latest heights.
        setPanelHeights((prev) => {
          const idx = panelOrder.indexOf(panelId);
          // Compute how far from the rail top the panels above this one reach.
          let offsetAbove = 0;
          for (let i = 0; i < idx; i++) {
            const aboveId = panelOrder[i];
            if (aboveId) offsetAbove += prev[aboveId] ?? 0;
          }
          // clientY relative to the rail top, minus the height of panels above.
          const newHeight = Math.max(
            PANEL_HEIGHT_MIN,
            clientY - railRect.top - offsetAbove,
          );
          const next = { ...prev, [panelId]: newHeight };
          if (hydratedRef.current) writePanelHeights(next);
          return next;
        });
      },
    [panelOrder],
  );

  const makeStepHandler = useCallback(
    (panelId: PanelId) =>
      (direction: -1 | 1): void => {
        // Step by 24px — one row of content roughly. The direction here is
        // the conventional WAI-ARIA Up=-1 (shrink) / Down=+1 (grow) for a
        // horizontal separator.
        const STEP = 24;
        setPanelHeights((prev) => {
          const newHeight = Math.max(
            PANEL_HEIGHT_MIN,
            (prev[panelId] ?? DEFAULT_HEIGHTS[panelId]) + direction * STEP,
          );
          const next = { ...prev, [panelId]: newHeight };
          if (hydratedRef.current) writePanelHeights(next);
          return next;
        });
      },
    [],
  );

  // ── Panel render helper ────────────────────────────────────────────────
  // Renders the correct content widget for a given panel id, wiring the
  // dragHandleProps in stacked mode so the panel header shows a drag grip.
  // In tabbed mode dragHandleProps is omitted — the panels render without
  // grips (they're irrelevant when only one is visible at a time).
  function renderPanelContent(
    id: PanelId,
    dragHandleProps?: PanelDragHandleProps,
  ): ReactNode {
    switch (id) {
      case "resources":
        return (
          <ResourcesPanel
            lesson={lesson}
            collapsed={false}
            onToggleCollapsed={() => {
              /* no-op — collapse is not used in either rail mode */
            }}
            dragHandleProps={dragHandleProps}
            mode={mode}
            lessons={mode === "week" ? weekLessons : undefined}
            week={week}
            onClearLesson={onClearLesson}
          />
        );
      case "todos":
        return (
          <TodayTodos
            collapsed={false}
            onToggleCollapsed={() => {
              /* no-op */
            }}
            dragHandleProps={dragHandleProps}
            onOpenCountChange={onOpenTodoCountChange}
          />
        );
      case "chat":
        return (
          <Shoutbox
            week={week}
            day={day}
            collapsed={false}
            onToggleCollapsed={() => {
              /* no-op */
            }}
            dragHandleProps={dragHandleProps}
          />
        );
    }
  }

  const railAriaLabel =
    mode === "week"
      ? "Week resources and day planning"
      : "Lesson resources and day planning";

  // ── Mode toggle control — rendered in both modes as a compact ToggleGroup.
  // In tabbed mode it sits alongside the tab strip; in stacked mode it appears
  // in a thin header bar above the panels.
  //
  // This is a STATEFUL TOGGLE (single `railMode` string, exclusive selection)
  // so ToggleGroup (radiogroup semantics) is the correct primitive.
  //
  // Icon choice: the rail is narrow so we pair a short text label ("Tabs" /
  // "Stack") with each icon. This keeps the control scannable without being
  // icon-only — screen readers also get the ariaLabel on each option for a
  // natural-language description. Passing label="" would render a visible empty
  // span inside the Button, so short text is the clean choice here.
  const modeToggle = (
    <ToggleGroup<RailMode>
      options={[
        {
          value: "tabbed",
          label: "Tabs",
          icon: <TabbedIcon />,
          ariaLabel: "Tabbed mode",
        },
        {
          value: "stacked",
          label: "Stack",
          icon: <StackedIcon />,
          ariaLabel: "Stacked mode",
        },
      ]}
      value={railMode}
      onChange={selectMode}
      variant="subtle"
      size="sm"
      ariaLabel="Rail display mode"
      className={styles.modeTogglePositioned}
    />
  );

  return (
    <aside
      ref={railRef}
      className={`${styles.rail} cp-subj ${subjectClass}`}
      aria-label={railAriaLabel}
    >
      {railMode === "tabbed" ? (
        /* ── TABBED mode — MED-5 behavior, unchanged ─────────────────────
           A compact tab strip pins the mode toggle to the right end.
           Exactly one widget is shown at full height at a time. Panel
           state (ResourcesPanel category + view, Shoutbox draft) survives
           tab switches because the panels stay mounted ([hidden] → display
           none), not unmounted. */
        <>
          <div
            className={styles.tabStrip}
            role="tablist"
            aria-label="Rail panels"
            onKeyDown={(e) => {
              const idx = TAB_IDS.indexOf(activeTab);
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                selectTab(TAB_IDS[(idx + 1) % TAB_IDS.length]!);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                selectTab(
                  TAB_IDS[(idx + TAB_IDS.length - 1) % TAB_IDS.length]!,
                );
              }
            }}
          >
            {TAB_IDS.map((id) => {
              const isActive = id === activeTab;
              return (
                <Tooltip
                  key={id}
                  content={`Switch the right rail to the ${TAB_LABEL[id]} panel`}
                  side="bottom"
                >
                  <button
                    type="button"
                    role="tab"
                    id={`rail-tab-${id}`}
                    aria-selected={isActive}
                    aria-controls={`rail-panel-${id}`}
                    // Roving tabindex: only the active tab is keyboard-reachable
                    // from outside the strip; within the strip, arrow keys navigate.
                    tabIndex={isActive ? 0 : -1}
                    className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
                    onClick={() => selectTab(id)}
                    title={`Switch the right rail to the ${TAB_LABEL[id]} panel`}
                  >
                    {TAB_LABEL[id]}
                  </button>
                </Tooltip>
              );
            })}
            {/* Mode toggle sits flush right inside the tab strip. */}
            {modeToggle}
          </div>

          {/* Panel area — one widget at full height. Using [hidden] keeps
              panels mounted so in-panel state (category selection, draft
              message) survives tab switches without persisting to a store. */}
          <div className={styles.panelArea}>
            {TAB_IDS.map((id) => (
              <div
                key={id}
                id={`rail-panel-${id}`}
                role="tabpanel"
                aria-labelledby={`rail-tab-${id}`}
                className={styles.panel}
                hidden={activeTab !== id}
              >
                {renderPanelContent(id)}
              </div>
            ))}
          </div>
        </>
      ) : (
        /* ── STACKED mode — pre-MED-5 behavior restored ──────────────────
           The three panels stack vertically; each has a drag grip and a
           PaneSplitter between itself and the next panel. The DndContext
           wraps all three so dnd-kit can coordinate reorder animations.
           Keyboard: Tab to each grip, Space/Enter to lift, arrows to move,
           Space/Enter or Esc to drop (dnd-kit KeyboardSensor via
           useDndSensors). */
        <>
          {/* Stacked-mode header bar — thin chrome row holding the mode
              toggle. Matches the tab-strip height so toggling between
              modes feels dimension-stable. */}
          <div className={styles.stackedHeader}>
            <span className={styles.stackedHeaderLabel}>Panels</span>
            {modeToggle}
          </div>

          <div className={styles.stackedArea}>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={panelOrder}
                strategy={verticalListSortingStrategy}
              >
                {panelOrder.map((id, idx) => (
                  <SortablePanel
                    key={id}
                    id={id}
                    height={panelHeights[id] ?? DEFAULT_HEIGHTS[id]}
                    isLast={idx === panelOrder.length - 1}
                    onDragSplitter={makeDragHandler(id)}
                    onStepSplitter={makeStepHandler(id)}
                  >
                    {(dragHandleProps) =>
                      renderPanelContent(id, dragHandleProps)
                    }
                  </SortablePanel>
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </>
      )}
    </aside>
  );
}
