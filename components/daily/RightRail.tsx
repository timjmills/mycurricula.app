"use client";

// RightRail.tsx — the Daily view's right-most content column.
//
// Per the 3-column Daily restructure (Image 12) and the Image 13 right-
// side redesign, the auxiliary planning panels move from below the lesson
// list into a dedicated right rail. Top to bottom this rail stacks three
// WHITE CARDS, each with its own hairline border + soft shadow:
//
//   1. <ResourcesPanel> — the selected lesson's COMBINED resources
//      (lesson-level + every section's resources, derived from the
//      planner store). Category tabs + grid/list toggle + a Padlet-style
//      tile grid by default.
//   2. <TodayTodos>     — today's to-dos: checkable rows + quick-add.
//   3. <Shoutbox>       — the day's flat team chat thread + composer.
//
// The rail itself is a thin composition layer — each panel owns its own
// data, state, and CHROME (the card framing lives on the panels, not
// here), which lets a card move to a different surface later without
// dragging styling along. Keeping the panels as siblings (rather than
// one mega-component) matches the component-family idiom used elsewhere
// in the repo.
//
// Scroll: the rail is its own scroll container so the lesson list and
// the center detail can scroll independently. Subject color is carried
// through the parent's `.cp-subj` cascade only where it lands inside
// ResourcesPanel (the synthetic tile artwork) — the rail track itself
// stays neutral.
//
// ── Drag-reorder + collapse + RESIZE (this file owns ALL three machines) ─
// The teacher can:
//   • drag any panel by its header GRIP to reorder the stack;
//   • click any panel's chevron to collapse it to just its title bar;
//   • drag the slim HANDLE between two adjacent expanded panels to give
//     more or less vertical room to either side (Image 13 right-rail
//     intent: each panel sized to the teacher's daily reading rhythm).
// All three decisions are PER-TEACHER viewing preferences — they do not
// touch any shared state. Order + collapsed-set + per-panel heights
// persist to localStorage so the rail comes back the way the teacher
// left it. Loading is post-mount (NOT inside a useState initializer) to
// avoid hydration-mismatch warnings — same pattern as the per-day row
// order over in DailyView.
//
// The dnd-kit wiring mirrors the existing house pattern (lesson-flow and
// the Daily left pane): DndContext + SortableContext (verticalListSortingStrategy)
// + useSortable per panel + a DragOverlay for the floating ghost. Each
// panel only becomes draggable via its header grip — the activator is
// scoped through setActivatorNodeRef so dragging from the panel body
// (composer inputs, lists, tiles) NEVER starts a reorder. The resize
// handle is a SEPARATE focusable element (<PaneSplitter orientation=
// "horizontal" />) so reorder activation and resize activation never
// race for the same pointer-down.

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
  type DraggableAttributes,
} from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Lesson } from "@/lib/types";
import { useDndSensors } from "@/lib/collapse-on-drag";
import { ResourcesPanel } from "./ResourcesPanel";
import { TodayTodos } from "./TodayTodos";
import { Shoutbox } from "./Shoutbox";
import { PaneSplitter } from "./PaneSplitter";
import styles from "./RightRail.module.css";

// ── Panel ids (stable, used for order + collapsed + height persistence) ──
// The id is the single source of truth for "which panel is this?" — it
// keys the rendered panel, the dnd-kit sortable, the collapsed Set, the
// per-id height in the Record, the persisted order array, and the
// human-readable label used in aria copy.

const PANEL_IDS = ["resources", "todos", "shoutbox"] as const;
type PanelId = (typeof PANEL_IDS)[number];

const PANEL_LABEL: Record<PanelId, string> = {
  resources: "Resources",
  todos: "To-do List",
  shoutbox: "Day Shoutbox",
};

const DEFAULT_ORDER: PanelId[] = [...PANEL_IDS];

// ── Sizing constants ──────────────────────────────────────────────────────
// Defaults chosen so the rail reads as "Resources is the headliner; to-dos
// is the quick glance; shoutbox is the open conversation space" out of the
// box. PANEL_MIN keeps a panel readable as more than just-its-header even
// at the smallest size (header is ~44–48px; 88px gives roughly one row of
// body content beneath it). KEY_STEP is the keyboard nudge amount — a 16px
// grid feels deliberate and matches the planner's other resize controls.

const DEFAULT_HEIGHTS: Record<PanelId, number> = {
  resources: 320,
  todos: 240,
  shoutbox: 300,
};

const PANEL_MIN = 88;
const KEY_STEP = 16;

// ── localStorage keys ────────────────────────────────────────────────────
// Three separate keys so the order, the collapsed-set, and the per-id
// height map can evolve independently (a teacher may collapse panels
// without ever reordering, or reorder without resizing, etc.). All access
// is SSR-guarded.

const ORDER_KEY = "mycurricula:daily-right-rail-order";
const COLLAPSED_KEY = "mycurricula:daily-right-rail-collapsed";
const HEIGHTS_KEY = "mycurricula:daily-right-rail-heights";

/** Type-guard a string against the closed PanelId set. */
function isPanelId(value: unknown): value is PanelId {
  return (
    typeof value === "string" &&
    (PANEL_IDS as readonly string[]).includes(value)
  );
}

/**
 * Validate a parsed order array. Drops unknown ids and de-duplicates, then
 * appends any missing default ids at the end so a future panel addition
 * survives older saved orders without disappearing.
 */
function normalizeOrder(raw: unknown): PanelId[] {
  const candidate = Array.isArray(raw) ? raw.filter(isPanelId) : [];
  const seen = new Set<PanelId>();
  const out: PanelId[] = [];
  for (const id of candidate) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  // Append any panel ids the saved order didn't know about — keeps the
  // panel reachable instead of silently disappearing on an upgrade.
  for (const id of DEFAULT_ORDER) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Read the saved order from localStorage, or DEFAULT_ORDER if unavailable. */
function readOrder(): PanelId[] {
  if (typeof window === "undefined") return DEFAULT_ORDER;
  try {
    const raw = window.localStorage.getItem(ORDER_KEY);
    if (!raw) return DEFAULT_ORDER;
    return normalizeOrder(JSON.parse(raw) as unknown);
  } catch {
    // Corrupt or unavailable storage — fall back to the default.
    return DEFAULT_ORDER;
  }
}

/** Persist the chosen panel order. Non-fatal on failure. */
function writeOrder(order: PanelId[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  } catch {
    // Storage full / unavailable — order simply won't persist; non-fatal.
  }
}

/** Read the saved collapsed-id set from localStorage. */
function readCollapsed(): Set<PanelId> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter(isPanelId));
  } catch {
    return new Set();
  }
}

/** Persist the collapsed-id set. Non-fatal on failure. */
function writeCollapsed(collapsed: Set<PanelId>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      COLLAPSED_KEY,
      JSON.stringify(Array.from(collapsed)),
    );
  } catch {
    // Storage full / unavailable — collapse state simply won't persist.
  }
}

/**
 * Validate a parsed heights record. Keeps only known panel ids whose value
 * is a finite positive number, then fills any missing ids with their
 * default height so a future panel addition gets a sane size without the
 * teacher having to reset anything.
 */
function normalizeHeights(raw: unknown): Record<PanelId, number> {
  const out: Record<PanelId, number> = { ...DEFAULT_HEIGHTS };
  if (raw && typeof raw === "object") {
    for (const id of PANEL_IDS) {
      const v = (raw as Record<string, unknown>)[id];
      if (typeof v === "number" && Number.isFinite(v) && v >= PANEL_MIN) {
        out[id] = v;
      }
    }
  }
  return out;
}

/** Read the saved per-panel heights from localStorage. */
function readHeights(): Record<PanelId, number> {
  if (typeof window === "undefined") return { ...DEFAULT_HEIGHTS };
  try {
    const raw = window.localStorage.getItem(HEIGHTS_KEY);
    if (!raw) return { ...DEFAULT_HEIGHTS };
    return normalizeHeights(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_HEIGHTS };
  }
}

/** Persist the per-panel heights. Non-fatal on failure. */
function writeHeights(heights: Record<PanelId, number>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HEIGHTS_KEY, JSON.stringify(heights));
  } catch {
    // Storage full / unavailable — heights simply won't persist; non-fatal.
  }
}

// ── Drag-handle prop bundle ──────────────────────────────────────────────
// The shape each panel receives. All fields are optional so the same panel
// component still renders standalone (no grip, no chevron) when consumed
// outside the right rail.

export interface PanelDragHandleProps {
  /** setActivatorNodeRef from useSortable — the grip is the SOLE activator. */
  ref?: (el: HTMLElement | null) => void;
  /** dnd-kit synthetic listeners (pointer + keyboard activation). */
  listeners?: SyntheticListenerMap;
  /** dnd-kit a11y attributes (role, aria-roledescription, etc.). */
  attributes?: DraggableAttributes;
  /** Human-readable label for the grip's aria-label, e.g. "Drag to reorder Resources". */
  label?: string;
}

// ── Sortable slot wrapper ────────────────────────────────────────────────
// Per-panel wrapper that holds the useSortable transform, builds the
// dragHandleProps bundle, and forwards collapsed + toggle to the panel.
// Each panel id maps to its specific React component here so the slot
// renders the correct content with the same wiring.
//
// ── Week-scope additions ─────────────────────────────────────────────────
// When the rail is in week mode (used by the Weekly view shell) the
// Resources panel aggregates across EVERY lesson in the active week
// rather than a single selected lesson. We forward `mode` + `weekLessons`
// straight to <ResourcesPanel> so the slot stays a thin pass-through.
// To-dos and Shoutbox stay unchanged — they are already day-scoped via
// the `day` prop, which the Weekly shell may pass as the active day or
// `null` if none.

interface SortablePanelSlotProps {
  id: PanelId;
  lesson: Lesson | null;
  week: number;
  day: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Forwarded to ResourcesPanel — drives day vs. week aggregation. */
  mode: "day" | "week";
  /** Forwarded to ResourcesPanel — non-empty only when mode === "week". */
  weekLessons: Lesson[];
  /** Slot height in px, or `null` when the panel should size to its
   *  natural (header-only when collapsed; default body otherwise) height.
   *  Collapsed panels always receive `null` so a previously-saved height
   *  doesn't pin the header to extra empty space. */
  height: number | null;
  /**
   * Called when the teacher clicks "Back to week" inside the Resources
   * panel header (only present when the panel is lesson-scoped). Supplied
   * by the consumer (WeeklyShell) and forwarded straight through.
   */
  onClearLesson?: () => void;
}

function SortablePanelSlot({
  id,
  lesson,
  week,
  day,
  collapsed,
  onToggleCollapsed,
  mode,
  weekLessons,
  height,
  onClearLesson,
}: SortablePanelSlotProps): ReactNode {
  // dnd-kit sortable wiring — `id` matches the SortableContext items array.
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  // Apply the sortable transform to the OUTER wrapper so the whole panel
  // slides into its new position; the inner panel keeps its own chrome.
  // The optional `height` becomes an inline style — CSS gives the slot
  // `min-height: 0` + `display: flex` so the panel inside stretches.
  const sortableStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // While dragging, dim the in-place placeholder — the floating overlay
    // carries the visible chip — and lift it above siblings so the panel
    // shadow doesn't get clipped by the slot below.
    opacity: isDragging ? 0.4 : undefined,
    // Only apply a fixed height when the panel is expanded. Collapsed
    // panels render at their natural header height so a stored slot
    // height doesn't pin them to extra dead space.
    height: height !== null ? `${height}px` : undefined,
  };

  const dragHandleProps: PanelDragHandleProps = {
    ref: setActivatorNodeRef,
    listeners,
    attributes,
    label: `Drag to reorder ${PANEL_LABEL[id]}`,
  };

  // Render the correct panel for this slot's id. Each panel receives the
  // SAME contract: collapsed + onToggleCollapsed + dragHandleProps. The
  // panel-specific props (lesson / week / day) are layered on top.
  switch (id) {
    case "resources":
      return (
        <div ref={setNodeRef} style={sortableStyle} className={styles.slot}>
          <ResourcesPanel
            lesson={lesson}
            collapsed={collapsed}
            onToggleCollapsed={onToggleCollapsed}
            dragHandleProps={dragHandleProps}
            mode={mode}
            lessons={mode === "week" ? weekLessons : undefined}
            week={week}
            onClearLesson={onClearLesson}
          />
        </div>
      );
    case "todos":
      return (
        <div ref={setNodeRef} style={sortableStyle} className={styles.slot}>
          <TodayTodos
            collapsed={collapsed}
            onToggleCollapsed={onToggleCollapsed}
            dragHandleProps={dragHandleProps}
          />
        </div>
      );
    case "shoutbox":
      return (
        <div ref={setNodeRef} style={sortableStyle} className={styles.slot}>
          <Shoutbox
            week={week}
            day={day}
            collapsed={collapsed}
            onToggleCollapsed={onToggleCollapsed}
            dragHandleProps={dragHandleProps}
          />
        </div>
      );
  }
}

// ── DragOverlay content ──────────────────────────────────────────────────
// While a panel is in flight we show a static, header-only ghost in the
// overlay. The collapsed-to-title-bar treatment also reads as the "this is
// a panel" affordance, so the ghost reuses the collapsed look — the panel
// underneath stays in the layout (dimmed by SortablePanelSlot) so the drop
// position is unambiguous.

function PanelDragGhost({ id }: { id: PanelId }): ReactNode {
  return (
    <div className={styles.dragGhost} aria-hidden="true">
      <div className={styles.dragGhostHead}>
        <span className={styles.dragGhostGrip} aria-hidden="true">
          <GripVerticalIcon />
        </span>
        <span className={styles.dragGhostTitle}>{PANEL_LABEL[id]}</span>
      </div>
    </div>
  );
}

// ── Grip icon (Lucide-style; mirrors lesson-flow's section grip) ─────────

function GripVerticalIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="9" cy="5" r="1.5" />
      <circle cx="15" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="15" cy="19" r="1.5" />
    </svg>
  );
}

// ── RightRail ────────────────────────────────────────────────────────────

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
   *                        every lesson in `lessons`. To-dos and Shoutbox
   *                        keep their existing day-scoped behavior (the
   *                        consumer may pass the current day or 0).
   */
  mode?: "day" | "week";
  /**
   * Optional list of lessons to aggregate across in week mode. Required
   * only when `mode === "week"`; ignored otherwise. Pass the lessons whose
   * week matches the active week.
   */
  lessons?: Lesson[];
  /**
   * When the rail is in lesson-scoped day mode (a card is selected on
   * /weekly), this callback is wired to the Resources panel's "Back to
   * week" affordance so clicking it clears the selection. Omit in pure
   * day mode (the Daily view) where there is no week-scope to revert to.
   */
  onClearLesson?: () => void;
}

export function RightRail({
  lesson,
  week,
  day,
  mode = "day",
  lessons,
  onClearLesson,
}: RightRailProps): ReactNode {
  // The `cp-subj` wrapper on the rail forwards the selected lesson's
  // subject color into ResourcesPanel via the cascading --c / --cl / --cd
  // properties, so ResourceTile thumbnails inside the rail pick up the
  // right subject tint. When no lesson is selected — OR when the rail is
  // in week mode (no single "current" subject) — the class chain drops
  // back to the neutral defaults defined in tokens.css, so the aggregated
  // grid renders in each tile's own subject tint via its inner .cp-subj.
  const subjectClass = mode === "day" && lesson ? lesson.subject : "";

  // Stable identity for the lessons array forwarded to ResourcesPanel in
  // week mode. Falling back to an empty array keeps the prop's TS type
  // narrow (Lesson[]) and avoids "new array per render" cascades inside
  // the panel's aggregation memo.
  const weekLessons = useMemo<Lesson[]>(() => lessons ?? [], [lessons]);

  // ── Order + collapsed-set + heights state ─────────────────────────────
  // All three initialize to the defaults (NOT to the localStorage value)
  // so the server-rendered HTML and the first client render match — same
  // hydration-safe pattern as the per-day row order in DailyView. The
  // effect below loads the saved values once the component is mounted.
  const [order, setOrder] = useState<PanelId[]>(DEFAULT_ORDER);
  const [collapsed, setCollapsed] = useState<Set<PanelId>>(() => new Set());
  const [heights, setHeights] = useState<Record<PanelId, number>>(() => ({
    ...DEFAULT_HEIGHTS,
  }));

  // Track whether the post-mount hydration of the saved values has
  // completed. We only START persisting writes after that point so the
  // very first effect (loading the saved value) doesn't immediately
  // overwrite localStorage with the default state.
  const hydratedRef = useRef(false);

  // Load saved values ONCE post-mount. Empty deps so it never re-fires —
  // the values are then driven purely by user action.
  useEffect(() => {
    setOrder(readOrder());
    setCollapsed(readCollapsed());
    setHeights(readHeights());
    hydratedRef.current = true;
  }, []);

  // Persist each piece of state independently whenever it changes (after
  // the initial load). Three effects, three keys — matches the storage
  // layout above and keeps each write narrow.
  useEffect(() => {
    if (!hydratedRef.current) return;
    writeOrder(order);
  }, [order]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    writeCollapsed(collapsed);
  }, [collapsed]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    writeHeights(heights);
  }, [heights]);

  // ── Toggling collapse — stable callbacks per panel id ────────────────
  // useMemo holds onto a record of toggle callbacks so each panel gets a
  // stable function identity across renders (avoids needless re-renders
  // of the panel children when only `lesson`/`week`/`day` change).
  const toggles = useMemo<Record<PanelId, () => void>>(() => {
    const make = (id: PanelId) => (): void => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    };
    return {
      resources: make("resources"),
      todos: make("todos"),
      shoutbox: make("shoutbox"),
    };
  }, []);

  // ── dnd-kit sensors + drag lifecycle ─────────────────────────────────
  // Reuse the shared sensors so pointer + touch + KEYBOARD reorder all
  // work the same way they do for lesson rows and lesson-flow sections.
  const sensors = useDndSensors();

  // The id of the currently-dragged panel — drives the DragOverlay ghost.
  const [activeId, setActiveId] = useState<PanelId | null>(null);

  const handleDragStart = useCallback((e: DragStartEvent): void => {
    const id = String(e.active.id);
    if (isPanelId(id)) setActiveId(id);
  }, []);

  const handleDragEnd = useCallback((e: DragEndEvent): void => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = String(active.id);
    const to = String(over.id);
    if (!isPanelId(from) || !isPanelId(to)) return;
    setOrder((prev) => {
      const fromIdx = prev.indexOf(from);
      const toIdx = prev.indexOf(to);
      if (fromIdx === -1 || toIdx === -1) return prev;
      return arrayMove(prev, fromIdx, toIdx);
    });
  }, []);

  const handleDragCancel = useCallback((): void => {
    setActiveId(null);
  }, []);

  // ── Resize handle wiring ─────────────────────────────────────────────
  // Each handle lives BETWEEN two consecutive expanded panels in the
  // current order. A handle resizes the FIRST expanded panel above it and
  // the FIRST expanded panel below it — collapsed panels in between (if
  // any) are skipped, since they sit at their natural header height and
  // ignore the stored slot height. The handle is hidden when either side
  // has no expanded neighbour.

  // Per-drag bookkeeping. We snapshot the starting clientY + the starting
  // heights at pointer-down so each move's `dy` is computed against a
  // fixed origin (a cleaner UX than diffing against the previous move,
  // which accumulates rounding error mid-drag).
  const dragRef = useRef<{
    aboveId: PanelId;
    belowId: PanelId;
    startY: number;
    startAbove: number;
    startBelow: number;
  } | null>(null);

  // Per-drag bookkeeping for the TAIL handle (below the last expanded panel).
  // The tail handle has no panel below it; it just grows / shrinks one panel.
  // Drag math here is independent of the inter-panel `dragRef` above, so we
  // keep a separate snapshot to avoid cross-contaminating mid-drag.
  const tailDragRef = useRef<{
    panelId: PanelId;
    startY: number;
    startHeight: number;
  } | null>(null);

  /** Sanity cap for End-key snap so we never write MAX_SAFE_INTEGER into
   *  localStorage. 4000px is far taller than any plausible rail height; the
   *  rail's scroll fallback absorbs the rest. */
  const TAIL_MAX = 4000;

  /**
   * Apply a height delta between two panels. `dy > 0` means the handle
   * was dragged DOWN — the upper panel grows, the lower panel shrinks.
   * Both sides are clamped to PANEL_MIN; if a side would clamp, the
   * transferable delta is reduced so the OTHER side also stops at its
   * matching boundary (the handle hits a hard stop rather than zeroing
   * the neighbour). Pure function — caller setStates with the result.
   */
  function applyResize(
    prev: Record<PanelId, number>,
    aboveId: PanelId,
    belowId: PanelId,
    startAbove: number,
    startBelow: number,
    dy: number,
  ): Record<PanelId, number> {
    // The transferable delta is bounded by how much each side can give.
    // `dy` positive → upper grows up to (startBelow - PANEL_MIN); the
    // lower must not drop below PANEL_MIN. `dy` negative → upper shrinks
    // down to PANEL_MIN; the lower must not grow past the available
    // capacity (which has no upper bound in this model — we don't cap
    // the lower's max, since the rail itself scrolls if the total
    // exceeds its viewport).
    const maxUp = startBelow - PANEL_MIN; // how much the upper can grow
    const maxDown = startAbove - PANEL_MIN; // how much the upper can shrink
    let delta = dy;
    if (delta > maxUp) delta = maxUp;
    if (delta < -maxDown) delta = -maxDown;
    const nextAbove = startAbove + delta;
    const nextBelow = startBelow - delta;
    // No-op shortcut — keeps the state reference stable so React skips
    // the re-render when the pointer moves between identical clamped
    // positions (common when dragging past the boundary).
    if (nextAbove === prev[aboveId] && nextBelow === prev[belowId]) {
      return prev;
    }
    return { ...prev, [aboveId]: nextAbove, [belowId]: nextBelow };
  }

  /** Drag-onDrag callback bound to a specific handle (above + below). */
  const onHandleDrag = useCallback(
    (aboveId: PanelId, belowId: PanelId) =>
      (clientY: number): void => {
        // Home/End signal a snap to the nearest bound. Translate them into
        // a large dy so the clamp logic in applyResize lands exactly on a
        // boundary without the splitter having to know the bounds.
        let dy: number;
        if (clientY === -Infinity) {
          dy = -Number.MAX_SAFE_INTEGER;
        } else if (clientY === Infinity) {
          dy = Number.MAX_SAFE_INTEGER;
        } else {
          // Ordinary pointer move — make sure a drag is in progress before
          // attempting any math. The drag-context is set in
          // onHandlePointerDown below; if it's null we're being called
          // outside a drag (shouldn't happen, but guard anyway).
          const ctx = dragRef.current;
          if (!ctx) return;
          dy = clientY - ctx.startY;
        }
        setHeights((prev) => {
          const ctx = dragRef.current;
          // For pointer drags use the captured start values; for keyboard
          // (Home/End) the start values are the current heights so the
          // snap lands at the boundary in one shot.
          const startAbove = ctx?.startAbove ?? prev[aboveId];
          const startBelow = ctx?.startBelow ?? prev[belowId];
          return applyResize(
            prev,
            aboveId,
            belowId,
            startAbove,
            startBelow,
            dy,
          );
        });
      },
    [],
  );

  /** Step callback bound to a specific handle — keyboard arrows. */
  const onHandleStep = useCallback(
    (aboveId: PanelId, belowId: PanelId) =>
      (direction: -1 | 1): void => {
        // No pointer drag is in progress, so each step is its own micro-
        // transaction: capture the CURRENT heights, apply ±KEY_STEP, clamp.
        setHeights((prev) => {
          return applyResize(
            prev,
            aboveId,
            belowId,
            prev[aboveId],
            prev[belowId],
            direction * KEY_STEP,
          );
        });
      },
    [],
  );

  /** Pointer-down bookkeeping for a specific handle: snapshot start state. */
  const onHandlePointerDown = useCallback(
    (aboveId: PanelId, belowId: PanelId) =>
      (e: ReactPointerEvent<HTMLDivElement>): void => {
        // Capture even when applyResize wouldn't move — the snapshot is
        // also needed for the keyboard Home/End fallback above (which
        // reads dragRef when present). Buttons / modifiers are checked
        // inside PaneSplitter itself, so we don't gate that here.
        dragRef.current = {
          aboveId,
          belowId,
          startY: e.clientY,
          // Read current heights via the closure-stable setHeights below
          // (we'd otherwise need to mirror state into a ref). Reading
          // through the state setter avoids a stale-state bug if the user
          // somehow triggers two pointer-downs in the same render cycle.
          startAbove: heights[aboveId],
          startBelow: heights[belowId],
        };
      },
    [heights],
  );

  /** Pointer-up cleanup. Mirrors PaneSplitter's capture-release lifecycle. */
  const onHandlePointerUp = useCallback((): void => {
    dragRef.current = null;
  }, []);

  // ── TAIL handle (below the last expanded panel) ─────────────────────────
  // A second resize affordance the inter-panel handles can't provide: drag
  // DOWN to grow the BOTTOMMOST expanded panel "all the way down" into the
  // empty space below the rail's stack, or UP to shrink it. There's no
  // panel below it so resize is single-sided; the rail's outer scroll
  // fallback absorbs any growth beyond the rail's visible height.

  /** Pointer-down: snapshot the starting clientY + the panel's height so
   *  every move computes `dy` against a fixed origin (same idiom as the
   *  inter-panel handle's `onHandlePointerDown`). */
  const onTailPointerDown = useCallback(
    (panelId: PanelId) =>
      (e: ReactPointerEvent<HTMLDivElement>): void => {
        tailDragRef.current = {
          panelId,
          startY: e.clientY,
          startHeight: heights[panelId],
        };
      },
    [heights],
  );

  /** Pointer-up cleanup for the tail handle. */
  const onTailPointerUp = useCallback((): void => {
    tailDragRef.current = null;
  }, []);

  /** Drag callback bound to a specific panel — single-sided resize. */
  const onTailDrag = useCallback(
    (panelId: PanelId) =>
      (clientY: number): void => {
        // Home / End from PaneSplitter come through as ±Infinity; normalise
        // them into a giant dy so the clamp below lands exactly on the
        // bound. Otherwise compute dy against the captured pointer-down
        // origin so accumulated rounding can't drift mid-drag.
        let dy: number;
        if (clientY === -Infinity) {
          dy = -Number.MAX_SAFE_INTEGER;
        } else if (clientY === Infinity) {
          dy = Number.MAX_SAFE_INTEGER;
        } else {
          const ctx = tailDragRef.current;
          if (!ctx) return;
          dy = clientY - ctx.startY;
        }
        setHeights((prev) => {
          const ctx = tailDragRef.current;
          const start = ctx?.startHeight ?? prev[panelId];
          // Clamp to [PANEL_MIN, TAIL_MAX]; no neighbour to debit.
          const next = Math.max(
            PANEL_MIN,
            Math.min(TAIL_MAX, Math.round(start + dy)),
          );
          if (next === prev[panelId]) return prev;
          return { ...prev, [panelId]: next };
        });
      },
    [],
  );

  /** Step callback bound to a specific panel — keyboard arrows on tail. */
  const onTailStep = useCallback(
    (panelId: PanelId) =>
      (direction: -1 | 1): void => {
        setHeights((prev) => {
          const next = Math.max(
            PANEL_MIN,
            Math.min(TAIL_MAX, prev[panelId] + direction * KEY_STEP),
          );
          if (next === prev[panelId]) return prev;
          return { ...prev, [panelId]: next };
        });
      },
    [],
  );

  // Index of the LAST EXPANDED panel in the current order, or -1 if all
  // three are collapsed. The tail handle renders immediately after this
  // panel in the map so it always sits visually right below the panel it
  // resizes — even when the actual-last-panel in `order` is collapsed and
  // sits as a header strip beneath it.
  const lastExpandedIndex = useMemo<number>(() => {
    for (let i = order.length - 1; i >= 0; i--) {
      if (!collapsed.has(order[i]!)) return i;
    }
    return -1;
  }, [order, collapsed]);

  // Build the list of "handle pairs" — every (expanded, expanded) gap in
  // the current order. A collapsed panel in between is skipped: the gap
  // joins the next expanded panel on each side. If there's no expanded
  // panel on EITHER side, no handle is rendered.
  //
  // The handles are derived from a flat scan because the JSX render below
  // walks panels in order and needs to know, for each (above, below)
  // boundary, whether a handle belongs there. We accept boundaries where
  // both immediate neighbours are expanded; we don't draw cross-collapse
  // handles (a handle has to sit between visible panels to read as a real
  // affordance — a handle dropped onto a collapsed strip would be
  // confusing).
  const handlePairs = useMemo<
    Record<string, { above: PanelId; below: PanelId } | null>
  >(() => {
    const out: Record<string, { above: PanelId; below: PanelId } | null> = {};
    for (let i = 0; i < order.length - 1; i++) {
      const above = order[i]!;
      const below = order[i + 1]!;
      // Only an EXPANDED-to-EXPANDED boundary gets a draggable handle.
      // Collapsed panels sit at their natural header height and ignore
      // their stored slot height; resizing through them would lie about
      // what the drag affects.
      if (collapsed.has(above) || collapsed.has(below)) {
        out[`${above}__${below}`] = null;
      } else {
        out[`${above}__${below}`] = { above, below };
      }
    }
    return out;
  }, [order, collapsed]);

  // Distinct aria-label per scope — Weekly's rail aggregates resources
  // across the week, so its summary differs from Daily's per-lesson rail.
  const railAriaLabel =
    mode === "week"
      ? "Week resources and day planning"
      : "Lesson resources and day planning";

  return (
    <aside
      className={`${styles.rail} cp-subj ${subjectClass}`}
      aria-label={railAriaLabel}
    >
      <div className={styles.scroll}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            {order.map((id, i) => {
              const isLast = i === order.length - 1;
              const isCollapsed = collapsed.has(id);
              // The slot's pixel height drives a fixed-size container so
              // the panel inside scrolls internally. Collapsed panels
              // skip the inline height entirely — they render at their
              // natural header height. The very last panel can also be
              // left auto-sized (so the rail's natural overflow path
              // continues to work when no resizing has happened yet) —
              // but we still apply its stored height so a teacher's
              // chosen rhythm is preserved across all panels.
              const slotHeight = isCollapsed ? null : heights[id];

              // For the NEXT boundary (between this panel and the one
              // below), look up whether it earned a handle. The handle
              // renders only when both sides are expanded.
              const pairKey = isLast ? null : `${id}__${order[i + 1]!}`;
              const pair = pairKey ? handlePairs[pairKey] : null;
              const handleAbove = pair?.above ?? null;
              const handleBelow = pair?.below ?? null;
              const handleLabel = pair
                ? `Resize ${PANEL_LABEL[pair.above]} and ${PANEL_LABEL[pair.below]} panels`
                : "";

              return (
                <Fragment key={id}>
                  <SortablePanelSlot
                    id={id}
                    lesson={lesson}
                    week={week}
                    day={day}
                    collapsed={isCollapsed}
                    onToggleCollapsed={toggles[id]}
                    mode={mode}
                    weekLessons={weekLessons}
                    height={slotHeight}
                    onClearLesson={onClearLesson}
                  />
                  {pair && handleAbove && handleBelow && (
                    <div
                      className={styles.handleRow}
                      // The wrapper hosts the pointer-down listener so we
                      // can snapshot the starting state before PaneSplitter
                      // sets pointer capture on its inner div. Bubbling
                      // means our listener fires first when the user
                      // pointer-downs on the splitter itself.
                      onPointerDown={onHandlePointerDown(
                        handleAbove,
                        handleBelow,
                      )}
                      onPointerUp={onHandlePointerUp}
                    >
                      <PaneSplitter
                        orientation="horizontal"
                        // aria-valuenow reports the upper panel's current
                        // height — the side the keyboard step adjusts
                        // first (Down grows the upper, Up shrinks it).
                        width={heights[handleAbove]}
                        // aria-bounds: the upper can shrink to PANEL_MIN
                        // (its min) and grow to the combined headroom of
                        // the pair minus the lower's min. Reporting the
                        // dynamic max makes the value semantically
                        // accurate for assistive tech without changing
                        // the clamp logic, which lives in applyResize.
                        min={PANEL_MIN}
                        max={
                          heights[handleAbove] +
                          (heights[handleBelow] - PANEL_MIN)
                        }
                        onDrag={onHandleDrag(handleAbove, handleBelow)}
                        onStep={onHandleStep(handleAbove, handleBelow)}
                        label={handleLabel}
                        className={styles.railSplitter}
                      />
                    </div>
                  )}
                  {/* TAIL handle — sits below the LAST EXPANDED panel so
                      the teacher can drag DOWN to grow the bottommost
                      panel "all the way down" into the rail's empty space
                      (and beyond — the outer scroll fallback absorbs the
                      excess), or UP to shrink it down to PANEL_MIN. No
                      panel below it: resize is single-sided. Rendered
                      INSIDE the map so it always sits adjacent to the
                      panel it controls, even when collapsed panels follow
                      it as header strips. */}
                  {i === lastExpandedIndex && (
                    <div
                      className={styles.handleRow}
                      onPointerDown={onTailPointerDown(id)}
                      onPointerUp={onTailPointerUp}
                    >
                      <PaneSplitter
                        orientation="horizontal"
                        width={heights[id]}
                        min={PANEL_MIN}
                        max={TAIL_MAX}
                        onDrag={onTailDrag(id)}
                        onStep={onTailStep(id)}
                        label={`Resize ${PANEL_LABEL[id]} panel`}
                        className={styles.railSplitter}
                      />
                    </div>
                  )}
                </Fragment>
              );
            })}
          </SortableContext>

          {/* Floating ghost of the dragged panel — collapsed-style chip so
              the drop position reads cleanly without redundant body content. */}
          <DragOverlay>
            {activeId && <PanelDragGhost id={activeId} />}
          </DragOverlay>
        </DndContext>
      </div>
    </aside>
  );
}
