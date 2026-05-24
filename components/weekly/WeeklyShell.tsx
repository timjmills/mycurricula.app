"use client";

// WeeklyShell.tsx — the Weekly view's 3-panel shell.
//
// Mirrors the Daily view's IconRail + content + RightRail composition
// (see components/daily/DailyView.tsx), but tailored to Weekly:
//
//   body row → [icon rail] [weekly grid] [splitter] [right rail]
//
// There is NO lesson-list column for Weekly — the grid IS the lessons.
// The grid sits in the center 1fr track; a draggable PaneSplitter governs
// the boundary between the grid and the right rail. The rail's width is
// persisted to its OWN localStorage key so a teacher can keep Weekly and
// Daily sized differently.
//
// ── Reuse, not rebuild ──────────────────────────────────────────────────
// We reuse three Daily-view components verbatim:
//
//   • <IconRail>       — the 56px far-left nav strip; presentational only
//                        in Phase 1A. Subject-neutral chrome, same for
//                        both views.
//   • <RightRail>      — passed `mode="week"` plus the active week's
//                        lessons so the Resources panel aggregates across
//                        the whole week instead of one lesson. To-dos +
//                        Shoutbox stay day-scoped (we forward the active
//                        day index — `selectedDay` from app state).
//   • <PaneSplitter>   — the same separator the Daily list↔detail boundary
//                        uses. The wrapper styles in this shell pin it to
//                        live between the grid and the rail.
//
// The grid itself (<WeeklyGrid>) is rendered untouched in the center slot;
// a thin module wrapper carries `min-width: 0; min-height: 0` so the grid
// shrinks gracefully when the rail grows.
//
// ── Panel drag-reorder ──────────────────────────────────────────────────
// The Weekly view has two large panels — the WeeklyGrid ("grid") and the
// RightRail ("rail") — that a teacher can drag to swap sides. The pattern
// mirrors the Daily view's column-reorder exactly:
//
//   • DndContext + SortableContext (horizontalListSortingStrategy) wraps
//     both panels.
//   • Each panel is a SortablePanel (a useSortable wrapper) that renders a
//     ColumnDragGrip in the panel's top-left corner as the activator.
//   • PaneSplitter sits between the two adjacent panels; when the panels
//     are swapped the splitter drag math inverts so the rail still grows
//     toward its own side.
//   • Panel order persists to localStorage under
//     `mycurricula:weekly-column-order` (DISTINCT from Daily's key).
//   • Screen-reader live announcements follow the Daily pattern
//     (role="status" + aria-live="polite").
//
// ── Pane width persistence ──────────────────────────────────────────────
// Same "no fixed clamps; sanity-bounded by the live container" model the
// Daily view uses:
//
//   • PANE_FLOOR (40px) is the absolute minimum width for the rail AND
//     the reservation kept for the center grid.
//   • The right-rail width persists to localStorage under
//     `mycurricula:weekly-right-width` (NOT shared with Daily's keys).
//   • State initializes to the DEFAULT (not the persisted value) so the
//     server-rendered HTML matches the first client render; a post-mount
//     effect hydrates from localStorage. This avoids hydration mismatches
//     — same SSR-guarded pattern as DailyView's pane persistence.
//
// ── Accessibility ──────────────────────────────────────────────────────
// Every interactive control is keyboard-operable. The splitter is a real
// role="separator" with aria-orientation + aria-valuemin/max/now (handled
// inside <PaneSplitter>). Column drag uses dnd-kit's KeyboardSensor so
// Space lifts, arrows move, Space/Enter drops, Esc cancels. The rail
// wrapper carries an aria-label. Reduced motion is honored by the consumed
// components and by the drag ghost (transform: none under reduced-motion).

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button, Tooltip } from "@/components/ui";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconRail, PaneSplitter, RightRail } from "@/components/daily";
import { WeeklyGrid } from "@/components/grid";
import { WeeklyList } from "@/components/list";
import { ScheduleTimeline } from "@/components/schedule";
import { CatchupWeekBar } from "./CatchupWeekBar";
import { WeeklySchedulePills } from "./weekly-schedule-pills";
import { useAppState } from "@/lib/app-state";
import { useWeeklyScheduleMode } from "@/lib/weekly-schedule-state";
import { useDndSensors } from "@/lib/collapse-on-drag";
import { usePlanner } from "@/lib/planner-store";
import type { Lesson } from "@/lib/types";
import styles from "./WeeklyShell.module.css";

// ── Pane-width constants (mirror of the DailyView model) ─────────────────
// PANE_FLOOR — absolute minimum width for the rail AND the reservation
// kept for the center grid. Identical floor to DailyView so the chrome
// reads consistently across views.
const PANE_FLOOR = 40;
/** Default right-rail width on first paint (pre-localStorage hydration). */
const RIGHT_PANE_DEFAULT = 320;
/** Collapsed rail stub width — a slim strip so the teacher can still see
 *  the hide-rail toggle button and re-expand. */
const RAIL_STUB_WIDTH = 32;
/** Keyboard nudge step (px) for the splitter's arrow-key resize. */
const PANE_STEP = 16;
/** localStorage key — DISTINCT from Daily's so the two views can size
 *  their rails independently. */
const RIGHT_PANE_WIDTH_KEY = "mycurricula:weekly-right-width";
/** localStorage key for the rail's hidden/visible state. */
const RAIL_HIDDEN_KEY = "mycurricula:weekly-rail-hidden";
/** localStorage key for the two-panel column order. */
const COLUMN_ORDER_KEY = "mycurricula:weekly-column-order";

// ── Panel column ids ──────────────────────────────────────────────────────
// The Weekly body has TWO reorderable panels — the WeeklyGrid and the
// RightRail. The icon rail is NOT part of this group: it stays pinned
// to the far left as a sibling of the reorderable body.

const PANEL_IDS = ["grid", "rail"] as const;
type PanelId = (typeof PANEL_IDS)[number];

const DEFAULT_COLUMN_ORDER: PanelId[] = [...PANEL_IDS];

/** Human-readable labels — used in drag-grip aria-labels, the DragOverlay
 *  ghost chip, and the aria-live announcement string. */
const COLUMN_LABEL: Record<PanelId, string> = {
  grid: "Weekly grid",
  rail: "Resources rail",
};

/** Type-guard a parsed string against the closed PanelId set. */
function isPanelId(value: unknown): value is PanelId {
  return (
    typeof value === "string" &&
    (PANEL_IDS as readonly string[]).includes(value)
  );
}

/** Normalize a parsed order: drop unknown ids, de-duplicate, append any
 *  missing defaults so a future panel addition never disappears. */
function normalizeColumnOrder(raw: unknown): PanelId[] {
  const candidate = Array.isArray(raw) ? raw.filter(isPanelId) : [];
  const seen = new Set<PanelId>();
  const out: PanelId[] = [];
  for (const id of candidate) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of DEFAULT_COLUMN_ORDER) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Read the saved column order from localStorage, or the default. */
function readColumnOrder(): PanelId[] {
  if (typeof window === "undefined") return DEFAULT_COLUMN_ORDER;
  try {
    const raw = window.localStorage.getItem(COLUMN_ORDER_KEY);
    if (!raw) return DEFAULT_COLUMN_ORDER;
    return normalizeColumnOrder(JSON.parse(raw) as unknown);
  } catch {
    // Corrupt or unavailable storage — fall back to the default.
    return DEFAULT_COLUMN_ORDER;
  }
}

/** Persist the chosen column order. Non-fatal on failure. */
function writeColumnOrder(order: PanelId[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(order));
  } catch {
    // Storage full / unavailable — order simply won't persist; non-fatal.
  }
}

// ── Width helpers (mirror of the DailyView model) ────────────────────────

/** Clamp a candidate rail width to dynamic, sanity-only bounds.
 *
 *  - `bodyWidth` is the live container width.
 *  - We reserve PANE_FLOOR for the center grid track so a teacher cannot
 *    drag the rail wide enough to crush the grid to nothing. (The icon
 *    rail is fixed-width and sits OUTSIDE the resizable body row, so its
 *    width is not part of this math.)
 *
 *  When `bodyWidth` is unavailable (initial paint, ref not yet attached)
 *  we fall back to a permissive lower-bound clamp so persisted values are
 *  honoured. */
function clampRightWidth(px: number, bodyWidth: number): number {
  const rounded = Math.round(px);
  if (!Number.isFinite(bodyWidth) || bodyWidth <= 0) {
    return Math.max(PANE_FLOOR, rounded);
  }
  const max = Math.max(PANE_FLOOR, bodyWidth - PANE_FLOOR);
  return Math.min(max, Math.max(PANE_FLOOR, rounded));
}

/** Compute the live (min, max) bounds for the rail given the container
 *  width. Used for aria-valuemin / aria-valuemax on the splitter and the
 *  resize-observer re-clamp. */
function rightBounds(bodyWidth: number): { min: number; max: number } {
  if (!Number.isFinite(bodyWidth) || bodyWidth <= 0) {
    return { min: PANE_FLOOR, max: Number.MAX_SAFE_INTEGER };
  }
  return { min: PANE_FLOOR, max: Math.max(PANE_FLOOR, bodyWidth - PANE_FLOOR) };
}

/** Read the saved right-rail width, or the default. SSR-guarded. */
function readRightWidth(): number {
  if (typeof window === "undefined") return RIGHT_PANE_DEFAULT;
  try {
    const raw = window.localStorage.getItem(RIGHT_PANE_WIDTH_KEY);
    if (!raw) return RIGHT_PANE_DEFAULT;
    const parsed = Number(raw);
    return Number.isFinite(parsed)
      ? Math.max(PANE_FLOOR, Math.round(parsed))
      : RIGHT_PANE_DEFAULT;
  } catch {
    // Corrupt or unavailable storage — fall back to the default width.
    return RIGHT_PANE_DEFAULT;
  }
}

/** Persist the chosen right-rail width. Non-fatal on failure. */
function writeRightWidth(px: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RIGHT_PANE_WIDTH_KEY, String(px));
  } catch {
    // Storage full / unavailable — width simply won't persist; non-fatal.
  }
}

/** Read whether the rail was left hidden. SSR-guarded. */
function readRailHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(RAIL_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist the rail hidden state. Non-fatal on failure. */
function writeRailHidden(hidden: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (hidden) {
      window.localStorage.setItem(RAIL_HIDDEN_KEY, "1");
    } else {
      window.localStorage.removeItem(RAIL_HIDDEN_KEY);
    }
  } catch {
    // Storage full / unavailable — state simply won't persist; non-fatal.
  }
}

// ── GripHorizontalIcon ────────────────────────────────────────────────────
// Lucide-style GripHorizontal — two rows of three dots, oriented for the
// column-reorder grip (a HORIZONTAL grip on each panel's top edge reads as
// "drag me sideways"). Mirrors DailyView's identical icon so the affordance
// reads the same across both views.

function GripHorizontalIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="5" cy="9" r="1.5" />
      <circle cx="12" cy="9" r="1.5" />
      <circle cx="19" cy="9" r="1.5" />
      <circle cx="5" cy="15" r="1.5" />
      <circle cx="12" cy="15" r="1.5" />
      <circle cx="19" cy="15" r="1.5" />
    </svg>
  );
}

// ── ColumnDragGrip ────────────────────────────────────────────────────────
// A small GripHorizontal chip that lives in the top-left of each large
// content panel and acts as the dnd-kit activator for panel reordering.
// Visually identical to DailyView's columnDragGrip — an ink-300 dot
// pattern that lifts to ink-500 on hover / focus. The visible chip is
// 24×24; the wrapping button enlarges the tap target to ≥44px via padding.
// `aria-label` carries the human-readable panel name so a screen-reader
// hears "Drag to reorder weekly grid panel".

interface ColumnDragGripProps {
  /** Stable panel id — must match SortableContext items. */
  id: PanelId;
  /** setActivatorNodeRef from useSortable — the grip is the SOLE activator. */
  activatorRef: (el: HTMLElement | null) => void;
  /** dnd-kit pointer + keyboard activation listeners. */
  listeners: Record<string, unknown> | undefined;
  /** dnd-kit a11y attributes (role, aria-roledescription, etc.). */
  attributes: Record<string, unknown>;
}

function ColumnDragGrip({
  id,
  activatorRef,
  listeners,
  attributes,
}: ColumnDragGripProps): ReactNode {
  return (
    <button
      type="button"
      ref={activatorRef}
      // Spread dnd-kit's pointer + keyboard listeners + a11y attributes.
      // The listeners object is typed loosely because dnd-kit's
      // SyntheticListenerMap is a record of arbitrary event-handler keys.
      {...(listeners ?? {})}
      {...attributes}
      className={styles.columnDragGrip}
      aria-label={`Drag to reorder ${COLUMN_LABEL[id].toLowerCase()} panel`}
      title={`Drag to reorder ${COLUMN_LABEL[id].toLowerCase()} panel`}
    >
      <span className={styles.columnDragGripIcon} aria-hidden="true">
        <GripHorizontalIcon />
      </span>
    </button>
  );
}

// ── SortablePanel ─────────────────────────────────────────────────────────
// Each large content panel (WeeklyGrid, RightRail) wraps its content in
// this component. The wrapper:
//   • holds the useSortable transform (so the panel slides into its new
//     slot when the order changes);
//   • exposes the grip activator props so the panel's content can render
//     a ColumnDragGrip in its own top-left corner;
//   • carries the per-panel className from the caller so the wrapper
//     itself remains stylistically transparent.
//
// IMPORTANT: the wrapper is also the SortableContext item. It must occupy
// the same grid track its panel would occupy in the static layout — its
// inline style adds no extra grid sizing so the parent grid keeps its
// track math.

interface SortablePanelProps {
  id: PanelId;
  className: string;
  children: (grip: ReactNode) => ReactNode;
}

function SortablePanel({
  id,
  className,
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

  // Apply the sortable transform to the OUTER wrapper so the whole panel
  // slides into its new position. While dragging, dim the in-place
  // placeholder — the floating overlay carries the visible chip.
  const wrapperStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  const grip = (
    <ColumnDragGrip
      id={id}
      activatorRef={setActivatorNodeRef}
      listeners={listeners as unknown as Record<string, unknown>}
      attributes={attributes as unknown as Record<string, unknown>}
    />
  );

  return (
    <div ref={setNodeRef} style={wrapperStyle} className={className}>
      {children(grip)}
    </div>
  );
}

// ── ColumnDragGhost ───────────────────────────────────────────────────────
// While a panel rides the DragOverlay we show a small header-style chip
// with the panel's label. Reuses the Daily view's visual vocabulary (paper
// card + hairline + soft lift + slight tilt) so the chip reads as "the
// same thing, picked up". Matches DailyView's columnDragGhost class; here
// those styles live in WeeklyShell.module.css.

function ColumnDragGhost({ id }: { id: PanelId }): ReactNode {
  return (
    <div className={styles.columnDragGhost} aria-hidden="true">
      <span className={styles.columnDragGhostGrip}>
        <GripHorizontalIcon />
      </span>
      <span className={styles.columnDragGhostTitle}>{COLUMN_LABEL[id]}</span>
    </div>
  );
}

// ── Narrow-viewport breakpoint ────────────────────────────────────────────
// The Weekly grid has a hard min-width (~1082px) that forces document-level
// horizontal scroll on any viewport narrower than that. To keep the
// document scroll-free at Tablet/Phone tiers (CLAUDE.md §4 responsive
// hard rule), we detect narrow viewports via matchMedia and fall back to
// the List layout regardless of the user's saved viewMode.
//
// The query is 900px — wide enough to guarantee the grid always fits on
// true desktop, tight enough to catch all tablet/phone sizes.
//
// The user's viewMode is LEFT UNCHANGED so returning to a ≥901px viewport
// restores Grid automatically without any preference mutation.

const NARROW_MQ = "(max-width: 900px)";

// ── WeeklyShell ──────────────────────────────────────────────────────────

export function WeeklyShell(): ReactNode {
  // The active week + day are shared planner state — same source the
  // <WeeklyGrid> already reads. We don't pin a local copy here; the
  // RightRail just needs the current value to scope its Resources +
  // Shoutbox panels.
  const { week, selectedDay, selectedLessonId, setSelectedLessonId, viewMode } =
    useAppState();
  const { lessons } = usePlanner();

  // Inline schedule-pill state (Subject↔Schedule + Lessons-only↔All). Lives
  // in localStorage so a teacher's choice survives across sessions. The
  // pills themselves render via <WeeklySchedulePills> inside the grid
  // panel; this hook just exposes the derived booleans for the render
  // branch below. `scheduleMode` is true when the Schedule pill is on;
  // `includeAllEvents` is true when the Lessons-only/All-events pill is on
  // "all" (i.e. non-academic blocks should appear in the timeline).
  const { scheduleMode, includeAllEvents } = useWeeklyScheduleMode();

  // ── Narrow-viewport state — SSR-safe matchMedia ───────────────────────
  // Default to false so the server-rendered HTML matches the first client
  // render (a server has no viewport; false ≡ "assume desktop"). A
  // post-mount effect syncs to the real viewport width and subscribes to
  // changes so tablet/phone users who resize into desktop get Grid back.
  // This is the same post-mount SSR-guard pattern used for localStorage
  // hydration elsewhere in this file.
  const [isNarrow, setIsNarrow] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(NARROW_MQ);
    // Sync once on mount — covers the common case where the page loaded
    // on a narrow device; without this we'd miss the first frame.
    setIsNarrow(mq.matches);
    // Subscribe to future viewport changes (orientation flip, DevTools
    // resize, etc.). addEventListener on MediaQueryList is the modern API;
    // browsers that only have addListener also get the polyfill path.
    const handler = (e: MediaQueryListEvent): void => setIsNarrow(e.matches);
    if (mq.addEventListener) {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    } else {
      // Older Safari / Chrome (pre-2020) shipped addListener.
      mq.addListener(handler); // eslint-disable-line @typescript-eslint/no-deprecated
      return () => mq.removeListener(handler); // eslint-disable-line @typescript-eslint/no-deprecated
    }
  }, []);

  // ── Lessons-for-this-week — fed to RightRail for week-mode aggregation ─
  // Filter once per (lessons, week) change so the right rail's
  // ResourcesPanel sees a stable array identity until something actually
  // moves into / out of the week.
  const weekLessons = useMemo<Lesson[]>(
    () => lessons.filter((l) => l.week === week),
    [lessons, week],
  );

  // ── Selected lesson object — resolves selectedLessonId → Lesson | null ─
  // When a card is selected the Resources panel scopes to that lesson;
  // when null it aggregates across the whole week. The lookup is O(n) but
  // n is small (one week's lessons) and the result is memoized.
  const selectedLesson = useMemo<Lesson | null>(
    () =>
      selectedLessonId
        ? (weekLessons.find((l) => l.id === selectedLessonId) ?? null)
        : null,
    [selectedLessonId, weekLessons],
  );

  // ── Right-rail width — state + post-mount hydration ──────────────────
  // Initialize to the DEFAULT (not localStorage) so the server-rendered
  // HTML matches the first client render. The effect below hydrates the
  // saved value once mounted. Same pattern DailyView uses.
  const [rightWidth, setRightWidth] = useState<number>(RIGHT_PANE_DEFAULT);

  // ── Rail hidden state — true collapses the rail to a RAIL_STUB_WIDTH
  //    stub so it is no longer a full 320px. Also hidden automatically on
  //    viewports narrower than 1280px (handled purely in CSS via a media
  //    query on the body's grid template). Initialize to false so the SSR
  //    HTML is predictable; the effect below hydrates the saved preference.
  const [railHidden, setRailHidden] = useState<boolean>(false);

  // Track whether the post-mount hydration completed. We only START
  // persisting writes after that point so the very first effect (loading
  // the saved value) doesn't immediately overwrite localStorage with the
  // default.
  const hydratedRef = useRef(false);

  // Body-row ref — we read its width to clamp the rail against the live
  // container (so a window resize never strands the rail at a width
  // bigger than the body). Stored as a number in state so the splitter's
  // aria-valuemax stays in sync.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [bodyWidth, setBodyWidth] = useState<number>(0);

  // ── Panel column order + drag state ──────────────────────────────────
  // The two large panels (grid + rail) can be reordered by dragging the
  // small grip on each panel's top-left corner. Order is a per-teacher
  // viewing preference; it persists to localStorage under
  // `mycurricula:weekly-column-order` (DISTINCT from Daily's key).
  //
  // Hydration discipline: `columnOrder` starts at the default so the
  // server-rendered HTML and the first client render match. The mount
  // effect below loads any persisted order and `hydratedColumnRef` then
  // gates persistence so the first load doesn't overwrite storage with
  // the default. Same pattern as DailyView's column order.
  const [columnOrder, setColumnOrder] =
    useState<PanelId[]>(DEFAULT_COLUMN_ORDER);
  const [draggingColumnId, setDraggingColumnId] = useState<PanelId | null>(
    null,
  );
  const hydratedColumnRef = useRef(false);

  // Screen-reader live announcement — committed when the order changes so
  // a keyboard reorder is audible. Uses role="status" + aria-live="polite"
  // so the SR speaks the new order without interrupting current speech.
  const [columnAnnouncement, setColumnAnnouncement] = useState<string>("");
  const columnAnnounceRegionId = useId();

  // dnd-kit sensors — pointer + touch + keyboard (keyboard makes the drag
  // reorder operable without a mouse). The same useDndSensors hook that
  // DailyView uses; it bundles PointerSensor + KeyboardSensor with
  // distance-based activation so accidental drags don't fire.
  const sensors = useDndSensors();

  // ── Hydrate the saved width + hidden state + column order once on mount ─
  useEffect(() => {
    setRightWidth(readRightWidth());
    setRailHidden(readRailHidden());
    hydratedRef.current = true;
  }, []);

  useEffect(() => {
    setColumnOrder(readColumnOrder());
    hydratedColumnRef.current = true;
  }, []);

  // ── Persist on change (after hydration) ──────────────────────────────
  useEffect(() => {
    if (!hydratedRef.current) return;
    writeRightWidth(rightWidth);
  }, [rightWidth]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    writeRailHidden(railHidden);
  }, [railHidden]);

  useEffect(() => {
    if (!hydratedColumnRef.current) return;
    writeColumnOrder(columnOrder);
  }, [columnOrder]);

  // ── Observe container size so the bound follows window resizes ───────
  // When the body row shrinks (window resize, devtools opened, …) we
  // re-clamp the rail width against the new bound. This mirrors the
  // Daily view's resize-observer behavior so a rail dragged wide on a
  // big monitor doesn't get stuck off-screen on a narrow one.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.round(entry.contentRect.width);
        setBodyWidth(w);
        // Only re-clamp once we're past hydration so the first paint
        // doesn't double-write to localStorage.
        if (hydratedRef.current) {
          setRightWidth((prev) => clampRightWidth(prev, w));
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Esc key — clear the lesson selection so the Resources panel reverts
  //    to the week aggregate. Listens on the document so it fires even when
  //    focus is inside the grid or the rail.
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent): void => {
      if (e.key === "Escape" && selectedLessonId !== null) {
        setSelectedLessonId(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedLessonId, setSelectedLessonId]);

  // ── Column drag handlers ──────────────────────────────────────────────
  const handleColumnDragStart = useCallback((e: DragStartEvent): void => {
    const id = String(e.active.id);
    if (isPanelId(id)) setDraggingColumnId(id);
  }, []);

  const handleColumnDragEnd = useCallback((e: DragEndEvent): void => {
    setDraggingColumnId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = String(active.id);
    const to = String(over.id);
    if (!isPanelId(from) || !isPanelId(to)) return;
    setColumnOrder((prev) => {
      const fromIdx = prev.indexOf(from);
      const toIdx = prev.indexOf(to);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const next = arrayMove(prev, fromIdx, toIdx);
      // Build an aria-live announcement reading each panel's new home so a
      // keyboard user hears confirmation when they release Space to drop.
      const orderLabels = next.map((id) => COLUMN_LABEL[id]).join(", ");
      const newPos = next.indexOf(from);
      const posLabel = newPos === 0 ? "first" : "second";
      setColumnAnnouncement(
        `${COLUMN_LABEL[from]} panel moved to ${posLabel}. New order: ${orderLabels}.`,
      );
      return next;
    });
  }, []);

  const handleColumnDragCancel = useCallback((): void => {
    setDraggingColumnId(null);
  }, []);

  // ── Splitter drag wiring ──────────────────────────────────────────────
  // The splitter sits BETWEEN the grid and the rail — in either order. The
  // rail is the only FIXED-width panel; the grid is always the 1fr flex
  // track. We resolve the drag against the rail's live bounding rect so
  // the math works regardless of which side the rail is on.
  //
  // resolveRailRect walks the rendered body to find the rail's wrapper via
  // data-pane="rail", then returns its DOMRect. The body ref is the root.
  const resolveRailRect = useCallback((): DOMRect | null => {
    const body = bodyRef.current;
    if (!body) return null;
    const el = body.querySelector<HTMLElement>('[data-pane="rail"]');
    return el ? el.getBoundingClientRect() : null;
  }, []);

  // Splitter onDrag — clientX → new rail width. The rail can be on either
  // side of the grid after a reorder, so we can't anchor to the body's
  // left or right edge directly. Instead we resolve the rail's own rect
  // and compute the width as the distance from clientX to whichever of
  // the rail's edges is NOT adjacent to the splitter.
  //
  // railOnRight → the splitter is to the LEFT of the rail; moving the
  //   pointer leftward grows the rail (width = rect.right − clientX).
  // railOnLeft  → the splitter is to the RIGHT of the rail; moving the
  //   pointer rightward grows the rail (width = clientX − rect.left).
  const handleSplitterDrag = useCallback(
    (clientX: number): void => {
      // Home / End (keyboard) arrive as ±Infinity; delegate to clamp.
      if (!Number.isFinite(clientX)) {
        const body = bodyRef.current;
        const liveBodyWidth = body
          ? Math.round(body.getBoundingClientRect().width)
          : bodyWidth;
        // Keyboard Home clamps to min, End to max (no need to read prev
        // because the target value is computed absolutely, not relatively).
        const target =
          clientX === Infinity ? Number.MAX_SAFE_INTEGER : PANE_FLOOR;
        setRightWidth(clampRightWidth(target, liveBodyWidth));
        return;
      }
      const rect = resolveRailRect();
      if (!rect) return;
      // Determine which side the rail is on by checking column order.
      const railOnRight = columnOrder[columnOrder.length - 1] === "rail";
      const desired = railOnRight ? rect.right - clientX : clientX - rect.left;
      const body = bodyRef.current;
      const liveBodyWidth = body
        ? Math.round(body.getBoundingClientRect().width)
        : bodyWidth;
      setRightWidth(clampRightWidth(desired, liveBodyWidth));
    },
    [resolveRailRect, columnOrder, bodyWidth],
  );

  // Splitter onStep — keyboard nudge. PaneSplitter reports +1 for
  // ArrowRight / ArrowDown, −1 for ArrowLeft / ArrowUp. We translate that
  // into "grow/shrink the rail" with the correct sign for the rail's
  // current position:
  //   • railOnRight: the splitter sits LEFT of the rail; ArrowRight
  //     (direction = +1) moves the divider rightward, SHRINKING the rail.
  //     So delta = −direction.
  //   • railOnLeft: the splitter sits RIGHT of the rail; ArrowRight
  //     moves the divider rightward, GROWING the rail. delta = +direction.
  const handleSplitterStep = useCallback(
    (direction: -1 | 1): void => {
      const body = bodyRef.current;
      const live = body?.getBoundingClientRect().width ?? bodyWidth;
      const railOnRight = columnOrder[columnOrder.length - 1] === "rail";
      const sign = railOnRight ? -1 : 1;
      setRightWidth((prev) =>
        clampRightWidth(prev + sign * direction * PANE_STEP, live),
      );
    },
    [bodyWidth, columnOrder],
  );

  // ── Hide-rail toggle — collapses the rail to a stub or back to full ──
  // The stub (RAIL_STUB_WIDTH) is narrow enough that the grid reclaims
  // nearly all of the body, but the toggle button remains reachable so
  // the teacher can re-expand without a menu.
  const handleToggleRail = useCallback((): void => {
    setRailHidden((prev) => !prev);
  }, []);

  // ── Splitter bounds for ARIA — live + clamped ────────────────────────
  const bounds = useMemo(() => rightBounds(bodyWidth), [bodyWidth]);

  // Effective rail track width: stub when hidden, full width when visible.
  // The CSS media query at ≤1280px overrides the inline style to 0 so no
  // footprint overlaps the grid on narrow viewports.
  const effectiveRailWidth = railHidden
    ? RAIL_STUB_WIDTH
    : Math.round(rightWidth);

  // Rail scope: when a lesson is selected we switch from week-aggregation
  // to lesson-scoped day mode so the Resources panel shows only that
  // lesson's resources. The RightRail `mode` prop controls this.
  const railMode: "day" | "week" = selectedLesson !== null ? "day" : "week";

  // ── Dynamic grid template ─────────────────────────────────────────────
  // Walk the column order, emitting a track size per panel AND an `auto`
  // track between the two panels for the splitter. The grid is always 1fr;
  // the rail is `effectiveRailWidth`px.
  const gridTemplate = useMemo(() => {
    const trackFor = (id: PanelId): string =>
      id === "rail" ? `${effectiveRailWidth}px` : "1fr";
    const parts: string[] = [];
    columnOrder.forEach((id, i) => {
      parts.push(trackFor(id));
      if (i < columnOrder.length - 1) parts.push("auto"); // splitter track
    });
    return parts.join(" ");
  }, [columnOrder, effectiveRailWidth]);

  // ── Panel renderers ───────────────────────────────────────────────────
  // Each panel's content is captured in a small render fn that receives the
  // ColumnDragGrip node and returns the panel's inner subtree. The wrapper
  // div carries `position: relative` so the grip can sit absolutely on the
  // top-left corner without touching the inner component's root.

  function renderGridPanel(grip: ReactNode): ReactNode {
    // Render selection, in precedence order:
    //   1. isNarrow (≤900px) → WeeklyList. The narrow-viewport gate WINS
    //      over schedule mode because a 5-column timeline at 360–900px is
    //      unusable; the dedicated /schedule route is the phone/tablet
    //      entry. Forcing List in the shell at narrow widths keeps the
    //      Weekly canvas usable.
    //   2. Schedule pill ON (and not narrow) → ScheduleTimeline (week
    //      scope), driven by the inline pill in the Weekly chrome. The
    //      timeline replaces the grid in the same 1fr slot; splitter +
    //      rail math is unaffected because the slot still spans 1fr.
    //   3. viewMode === "list" → WeeklyList. Same as before.
    //   4. Default → WeeklyGrid.
    //
    // The drag grip stays so the teacher can still reorder the panel at
    // any width or mode. The pills bar sits above whatever renders below.
    const showList = isNarrow || viewMode === "list";
    const showSchedule = !isNarrow && scheduleMode;
    return (
      <div className={styles.columnWithGrip} data-pane="grid">
        {grip}
        {/* Pills bar sits at the top of the grid panel slot so the chrome
            stays inside the same drag-reorder host as the grid content.
            Hidden at ≤900px (the narrow gate) because Schedule mode is
            disabled there anyway — the dedicated /schedule route is the
            entry. */}
        {!isNarrow && <WeeklySchedulePills />}
        {showSchedule ? (
          <ScheduleTimeline scope="week" showNonAcademic={includeAllEvents} />
        ) : showList ? (
          // WeeklyList replaces the grid but occupies the same 1fr slot
          // so the splitter and rail math are unaffected.
          <WeeklyList />
        ) : (
          /* WeeklyGrid renders untouched in the center slot. The outer slot
             wrapper already carries min-width: 0 so the grid can shrink
             gracefully when the rail grows. */
          <WeeklyGrid />
        )}
      </div>
    );
  }

  function renderRailPanel(grip: ReactNode): ReactNode {
    return (
      <div
        className={[
          styles.columnWithGrip,
          styles.railColumnWithGrip,
          railHidden ? styles.railSlotHidden : "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-pane="rail"
      >
        {/* Hide-rail toggle button — always visible so the teacher can
            re-expand after collapsing. Positioned at the top of the slot. */}
        <Tooltip content={railHidden ? "Show rail" : "Hide rail"} side="left">
          <Button
            variant="icon"
            size="sm"
            iconAriaLabel={
              railHidden ? "Show resources rail" : "Hide resources rail"
            }
            className={styles.railToggleBtn}
            onClick={handleToggleRail}
          >
            <RailToggleIcon hidden={railHidden} />
          </Button>
        </Tooltip>

        {/* The drag grip sits above the toggle so both affordances live in
            the top-left region without overlap. The grip is hidden (same
            as other content) when the rail is collapsed. */}
        {!railHidden && grip}

        {/* Full rail content — hidden (but still mounted) when collapsed
            so state (panel order, heights, collapsed-set) survives
            toggling. The railSlotHidden class clips the overflow so no
            content peeks past the stub boundary. */}
        {!railHidden && (
          <RightRail
            lesson={selectedLesson}
            week={week}
            day={selectedDay}
            mode={railMode}
            lessons={railMode === "week" ? weekLessons : undefined}
            onClearLesson={
              selectedLesson !== null
                ? () => setSelectedLessonId(null)
                : undefined
            }
          />
        )}
      </div>
    );
  }

  const PANEL_RENDERERS: Record<PanelId, (grip: ReactNode) => ReactNode> = {
    grid: renderGridPanel,
    rail: renderRailPanel,
  };

  return (
    <div className={styles.page}>
      {/* ── aria-live region: column reorder announcements ───────────────
          A visually hidden polite live region — when a panel moves
          (mouse, touch, or keyboard) we write the new order into it so
          screen-readers hear the change. Always in DOM so the live
          attribute is observed from the start. */}
      <div
        id={columnAnnounceRegionId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={styles.srOnly}
      >
        {columnAnnouncement}
      </div>

      {/* ── Layer-2 catch-up bar (planning-doc §1262) ──────────────────
          The bar self-gates on enabled + per-week count + per-week dismissal,
          so the WeeklyShell stays decoupled from the catch-up state. It
          consumes no width — only a slim band of height — and never appears
          on a week with zero uncovered lessons. */}
      <CatchupWeekBar />

      {/* ── Body row: icon rail (fixed) + reorderable grid/rail body ───── */}
      <div className={styles.bodyRow}>
        {/* Far-left slim icon nav strip — shared with Daily. */}
        <IconRail />

        {/* The reorderable + resizable body. The grid template is computed
            from columnOrder + effectiveRailWidth above so it re-evaluates
            when the teacher reorders or resizes a panel. */}
        <div
          ref={bodyRef}
          className={styles.body}
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleColumnDragStart}
            onDragEnd={handleColumnDragEnd}
            onDragCancel={handleColumnDragCancel}
          >
            <SortableContext
              items={columnOrder}
              strategy={horizontalListSortingStrategy}
            >
              {columnOrder.map((id, i) => {
                const render = PANEL_RENDERERS[id];
                // Build a unique CSS class per panel id so its inner
                // chrome keeps its existing look regardless of position.
                const slotClass =
                  id === "rail" ? styles.railSlot : styles.gridSlot;
                return (
                  <Fragment key={id}>
                    <SortablePanel id={id} className={slotClass}>
                      {(grip) => render(grip)}
                    </SortablePanel>
                    {/* Splitter sits between this panel and the next; the
                        last panel has no trailing splitter. When the rail
                        is hidden we suppress the splitter so the teacher
                        uses the toggle button to re-expand. */}
                    {i < columnOrder.length - 1 && !railHidden && (
                      <PaneSplitter
                        width={Math.round(rightWidth)}
                        min={bounds.min}
                        max={bounds.max}
                        onDrag={handleSplitterDrag}
                        onStep={handleSplitterStep}
                        label="Resize resources rail"
                      />
                    )}
                  </Fragment>
                );
              })}
            </SortableContext>

            {/* Floating ghost of the dragged panel — a small chip with
                the panel's label, reusing the right-rail panel-ghost
                visual vocabulary (paper card + hairline + soft lift). */}
            <DragOverlay>
              {draggingColumnId && <ColumnDragGhost id={draggingColumnId} />}
            </DragOverlay>
          </DndContext>
        </div>
      </div>
    </div>
  );
}

// ── Rail toggle icon ──────────────────────────────────────────────────────
// A simple chevron that flips direction based on whether the rail is hidden
// (pointing left = "open it") or visible (pointing right = "close it").
// aria-hidden because the parent button carries the label.

function RailToggleIcon({ hidden }: { hidden: boolean }): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{
        transform: hidden ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.15s ease-out",
      }}
    >
      {/* Right-pointing chevron › — rotated 180° when rail is hidden */}
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}
