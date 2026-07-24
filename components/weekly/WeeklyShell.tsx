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
//
// ── Deep links (UX roadmap item 07) ────────────────────────────────────
// Two halves, both speaking lib/deep-links' frozen scheme:
//
//   READ  — app/(planner)/weekly/page.tsx parses `?week=…&subject=…&
//           lesson=…&grade=…` server-side and passes `initialLink`. A
//           once-on-mount effect applies it: jump to the week, set the
//           subject filter, and when a lesson id resolves open its detail
//           (selectedLessonId → the right rail / drawer) and container-
//           scroll its card into view via the store's house helper
//           scrollPlannerItemIntoView (the same mechanism WeeklyGrid uses
//           for its lastChange effect).
//   WRITE — as the teacher navigates weeks / changes the subject filter /
//           opens a lesson detail, an effect mirrors that SHAREABLE state
//           into the URL with router.replace (never push — no history
//           spam), skipping when the URL already matches. Ephemeral state
//           (open menus, panel sizes, selection-free scroll) never enters
//           the URL, and links never encode Personal/Master mode — each
//           viewer resolves Personal-first per the forking model.

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
import { Button, PlannerEmpty, Tooltip } from "@/components/ui";
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
import { useRouter } from "next/navigation";
import { IconRail, PaneSplitter, RightRail } from "@/components/daily";
import { WeekNavigator } from "@/components/grid";
import { WeeklyList } from "@/components/list";
import { ScheduleTimeline } from "@/components/schedule";
import { WeeklyViewControls } from "./WeeklyViewControls";
import { WeeklyRailDrawer } from "./WeeklyRailDrawer";
import { DRAWER_MQ } from "./drawer-mq";
import { WeekColumns } from "./WeekColumns";
import { WeekGridSkeleton } from "./WeekGridSkeleton";
// W5 — the three Week VIEW frames: WeekA (glass, read-only period×day grid),
// WeekColumns (paper, day columns), and WeekC (color, subject lanes). Edit
// mode uses WeekEditBoard, schedule uses ScheduleTimeline, and narrow/list uses
// WeeklyList — so the v1 WeeklyGrid is no longer rendered from this shell at
// all (see renderGridPanel).
import { WeekA, WeekC } from "@/components/week-v2";
import { WeekEditBoard } from "./WeekEditBoard";
// W3.8 — the lesson-editor popup + the context that carries its opener down
// to every WeeklyLessonCard (grid, columns, and board parents alike — see
// the seam note in weekly-lesson-card.tsx).
import { LessonModal } from "@/components/lesson-editor";
import { OpenLessonEditorContext } from "./weekly-lesson-card";
import { useAppState } from "@/lib/app-state";
import {
  WeeklyScheduleProvider,
  useWeeklyScheduleMode,
} from "@/lib/weekly-schedule-state";
import { useDndSensors } from "@/lib/collapse-on-drag";
import {
  usePlanner,
  usePlannerDataState,
  scrollPlannerItemIntoView,
} from "@/lib/planner-store";
import { useTheme } from "@/lib/theme";
import { useViewEditMode } from "@/lib/edit-mode-state";
import { usePhoneViewport } from "@/lib/use-phone-viewport";
import { buildWeeklyLink, type WeeklyLink } from "@/lib/deep-links";
import { CURRENT_WEEK } from "@/lib/mock";
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
    <Tooltip
      content={`Drag the ${COLUMN_LABEL[id].toLowerCase()} panel to rearrange the weekly layout — your layout is remembered between sessions.`}
      side="bottom"
    >
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
        title={`Drag the ${COLUMN_LABEL[id].toLowerCase()} panel to rearrange the weekly layout — your layout is remembered between sessions`}
      >
        <span className={styles.columnDragGripIcon} aria-hidden="true">
          <GripHorizontalIcon />
        </span>
      </button>
    </Tooltip>
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

// ── W3-C3 — drawer-mode breakpoint ───────────────────────────────────────
// The constant lives in the dependency-free leaf ./drawer-mq (bundle-slim
// lever A1): the shell-level <RightPanel> — mounted on every planner route —
// keys its Weekly lesson-detail gate off the SAME breakpoint (drawer owns
// ≤1280, the shell panel owns wider), and importing it from THIS module
// dragged the whole weekly+daily+editor subtree into the layout bundle.
// Full rationale in ./drawer-mq.ts. Re-exported so this module's public
// surface is unchanged for existing consumers.
export { DRAWER_MQ };

// ── WeeklyShell ──────────────────────────────────────────────────────────

export interface WeeklyShellProps {
  /** Parsed `/weekly?week=…` deep link from the route page (UX roadmap
   *  item 07). Applied ONCE on mount: navigate to the week, set the
   *  subject filter, and — when `lesson` resolves — open that lesson's
   *  detail and container-scroll its card into view. Absent on a plain
   *  `/weekly` visit. */
  initialLink?: WeeklyLink;
}

/** buildWeeklyLink throws on a week its own parser rejects (1–99). The
 *  write-side URL sync guards with the same bounds so a transient or
 *  out-of-range week state can never crash the effect. */
function isSyncableWeek(week: number): boolean {
  return Number.isInteger(week) && week >= 1 && week <= 99;
}

/**
 * Exported shell — mounts the <WeeklyScheduleProvider> ONCE so the
 * Subject↔Schedule state has a single shared instance above both consumers:
 * <WeeklyViewControls> (writer, in the WeekNavigator actions slot) and the
 * canvas reader inside <WeeklyShellInner>. Without this single mount the
 * writer and reader held independent useState copies and the canvas only
 * switched Grid↔Schedule after a reload. The inner component holds all the
 * existing shell logic and is the sole caller of useWeeklyScheduleMode().
 */
export function WeeklyShell(props: WeeklyShellProps = {}): ReactNode {
  return (
    <WeeklyScheduleProvider>
      <WeeklyShellInner {...props} />
    </WeeklyScheduleProvider>
  );
}

function WeeklyShellInner({ initialLink }: WeeklyShellProps = {}): ReactNode {
  // The active week + day are shared planner state — same source the
  // <WeeklyGrid> already reads. We don't pin a local copy here; the
  // RightRail just needs the current value to scope its Resources +
  // Shoutbox panels.
  //
  // ── W3-C3 drawer-open signal ─────────────────────────────────────────
  // The narrow-viewport overlay drawer (<WeeklyRailDrawer>) consumes the
  // EXISTING To-do + Shoutbox panel-open flags rather than introducing a
  // new piece of app-state. The two flags are already mutually exclusive
  // (toggleTodoPanel closes commentsPanelOpen and vice versa, see
  // lib/app-state.tsx) so OR-ing them gives one clean drawer-open signal.
  // Closing the drawer flips BOTH to false so the rail icons' aria-pressed
  // state stays accurate. The Resources rail panel is mounted inside
  // <RightRail> too — there's no dedicated "resources" icon yet (it's
  // marked SOON in rail-icons.tsx); when it graduates this hook adds
  // `resourcesPanelOpen` alongside the existing two.
  const {
    week,
    setWeek,
    selectedDay,
    selectedLessonId,
    setSelectedLessonId,
    viewMode,
    filters,
    updateFilters,
    todoPanelOpen,
    commentsPanelOpen,
    toggleTodoPanel,
    toggleCommentsPanel,
  } = useAppState();
  const { lessons, activeGradeId } = usePlanner();
  // Loading/error honesty for the Week VIEW canvases (renderGridPanel). During
  // the Supabase hydrate this is "pending" and the canvas would otherwise paint
  // a full week of false "No lessons" columns; "error" is a failed hydrate. It
  // is permanently "settled" with the Supabase flag OFF, so the mock/v1 path is
  // untouched. See components/ui/PlannerEmpty for the same fix on other surfaces.
  const gridDataState = usePlannerDataState();

  // ── W3.8 — lesson-editor modal state ─────────────────────────────────
  // The shell owns which lesson (if any) is open in the full-editor popup.
  // The opener travels DOWN via <OpenLessonEditorContext> (provided around
  // the whole body below) so every WeeklyLessonCard — under WeeklyGrid,
  // WeekColumns, or the board — reaches it without per-parent prop
  // threading. The modal renders ONCE, inside this shell root, so
  // PlannerProvider / useAppState are in scope for its store calls.
  const [modalLessonId, setModalLessonId] = useState<string | null>(null);
  const openLessonEditor = useCallback((id: string): void => {
    setModalLessonId(id);
  }, []);
  const closeLessonEditor = useCallback((): void => {
    setModalLessonId(null);
  }, []);
  const router = useRouter();
  // W3.6 — the v2 frame axis picks the Week GRID traversal (see
  // renderGridPanel): Frame B (paper) reads the week as day columns
  // (WeekColumns, the bundle's "WeekB"); glass/color keep the subject×day
  // matrix (WeeklyGrid), whose card shell already re-skins per frame.
  const { frame } = useTheme();
  // W3.8c — Week EDIT mode. Shared across nav by design (edit-mode-state's
  // force-reset rule resets Day, never Week), so the board persists as the
  // teacher moves between views. Drives the highest-precedence branch in
  // renderGridPanel below.
  // Phones are VIEW-ONLY (product decision 2026-07-10 — editing is a
  // tablet+/desktop affordance). The chrome hides the View/Edit toggle on
  // phones; this render-layer guard forces the view canvas so a persisted Week
  // edit flag (Week edit persists across nav, unlike Day) can't strand a phone
  // user in the board with no toggle to leave.
  const { isEdit: rawIsEdit } = useViewEditMode("Week");
  const isPhoneViewport = usePhoneViewport();
  const isEdit = rawIsEdit && !isPhoneViewport;

  // Inline schedule-mode state (Subject↔Schedule + Lessons-only↔All). Lives
  // in localStorage so a teacher's choice survives across sessions. The
  // Subject/Schedule + scope toggles render via <WeeklyViewControls> in the
  // page-header actions slot; this hook just exposes the derived booleans for
  // the render branch below. `scheduleMode` is true when Schedule is selected;
  // `includeAllEvents` is true when the Lessons-only/All-events toggle is on
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

  // ── W3-C3 — drawer-mode state ────────────────────────────────────────
  // Mirrors the isNarrow pattern above. `drawerMode` is true on viewports
  // where the inline rail is `display: none` (≤1280px in
  // WeeklyShell.module.css). When true, the overlay drawer replaces the
  // inline rail render; when false, the inline rail behaves exactly as it
  // does today.
  const [drawerMode, setDrawerMode] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(DRAWER_MQ);
    setDrawerMode(mq.matches);
    const handler = (e: MediaQueryListEvent): void => setDrawerMode(e.matches);
    if (mq.addEventListener) {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    } else {
      mq.addListener(handler); // eslint-disable-line @typescript-eslint/no-deprecated
      return () => mq.removeListener(handler); // eslint-disable-line @typescript-eslint/no-deprecated
    }
  }, []);

  // ── Lessons-for-this-week — fed to RightRail for week-mode aggregation ─
  // Filter once per (lessons, week) change so the right rail's
  // ResourcesPanel sees a stable array identity until something actually
  // moves into / out of the week.
  // Archived lessons are excluded: WeekColumns hides them from the lanes, so
  // they must also vanish from every shell surface fed by this list (right
  // rail, selected-lesson lookup, drawer, deep-link scroll) — otherwise a
  // lesson archived while selected lingers in the rail/URL (audit Medium).
  const weekLessons = useMemo<Lesson[]>(
    () => lessons.filter((l) => l.week === week && l.archived !== true),
    [lessons, week],
  );

  // ── Navigable week span — drives the lifted WeekNavigator's prev/next
  //    disabled bounds. Same derivation WeeklyGrid + weekly-board use:
  //    min/max of every lesson's `week`. Memoized on the full lesson list
  //    so it only recomputes when lessons are added/removed. Falls back to
  //    the current week when there are no lessons (empty fixture) so the
  //    navigator never produces NaN bounds. */
  const { minWeek, maxWeek } = useMemo<{
    minWeek: number;
    maxWeek: number;
  }>(() => {
    if (lessons.length === 0) {
      return { minWeek: CURRENT_WEEK, maxWeek: CURRENT_WEEK };
    }
    const weeks = lessons.map((l) => l.week);
    return { minWeek: Math.min(...weeks), maxWeek: Math.max(...weeks) };
  }, [lessons]);

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

  // A selection that BECOMES archived is cleared. weekLessons now excludes
  // archived lessons, so selectedLesson resolves null — but the drawer opens
  // on `selectedLessonId !== null` (below), which would hold it open on a
  // lesson no visible weekly surface still shows (audit Medium). Two scopes:
  //  • archived only (checked against the FULL store list) — a selection that
  //    merely left the visible week (cross-week navigation) is untouched;
  //  • TRANSITION only (false→true while selected) — WeeklyList deliberately
  //    shows archived rows, and its row click sets the selection then pushes
  //    /daily; clearing an already-archived selection in that same flush
  //    would strand the /daily handoff without its focused lesson (review
  //    Low #1). Mirrors WeekColumns' archived-transition watcher.
  const prevSelectedArchivedRef = useRef<{
    id: string;
    archived: boolean;
  } | null>(null);
  useEffect(() => {
    const prev = prevSelectedArchivedRef.current;
    if (selectedLessonId === null) {
      prevSelectedArchivedRef.current = null;
      return;
    }
    const sel = lessons.find((l) => l.id === selectedLessonId);
    const archived = sel?.archived === true;
    prevSelectedArchivedRef.current = { id: selectedLessonId, archived };
    if (
      archived &&
      prev !== null &&
      prev.id === selectedLessonId &&
      !prev.archived
    ) {
      setSelectedLessonId(null);
      prevSelectedArchivedRef.current = null;
    }
  }, [selectedLessonId, lessons, setSelectedLessonId]);

  // ── Deep link READ — apply `initialLink` once on mount ────────────────
  // The lesson card to container-scroll once the target week's grid has
  // painted. Held as state (not a ref) so the scroll effect below re-runs
  // when the week's lessons render.
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);

  useEffect(() => {
    if (!initialLink) return;
    // When the link names a lesson that still exists, the LESSON's week is
    // authoritative — a lesson moved after the link was shared should still
    // be found (strict-but-forgiving, same spirit as the parsers).
    //
    // PHASE-1B: with the Supabase flag ON, `lessons` hydrates async and is
    // (or may be) EMPTY at mount time — this mount-only resolution would
    // then misread every `?lesson=` as "gone" and drop the link's lesson
    // focus. The 1B wave must gate this apply on the store's
    // hydration-ready signal (resolve `initialLink.lesson` once, after
    // lessons have loaded) instead of at mount. Mock data is synchronous
    // today (lib/mock/), so the mount-time read is safe in Phase 1A.
    const target = initialLink.lesson
      ? (lessons.find((l) => l.id === initialLink.lesson) ?? null)
      : null;
    setWeek(target?.week ?? initialLink.week);
    if (initialLink.subject) {
      updateFilters({ subjects: [initialLink.subject] });
    }
    if (target) {
      // Open the detail surface (right rail on desktop, overlay drawer in
      // the 901–1280 band) and queue the container scroll for when the
      // card exists in the DOM. An id that does NOT resolve in the store
      // never reaches setSelectedLessonId / setPendingScrollId — a stale
      // share degrades to "right week, no selection" (§4a L4).
      setSelectedLessonId(target.id);
      setPendingScrollId(target.id);
    }
    // Mount-only by design: the link is the page's INITIAL state; later
    // navigation must never re-apply it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Container-scroll the deep-linked card into view once it is rendered in
  // the active week. Reuses the store's house scroll mechanism — the same
  // data-planner-item lookup WeeklyGrid's lastChange effect uses — so the
  // grid's own scroll container moves, never the document. rAF defers to
  // after paint so the freshly-switched week has its final layout.
  useEffect(() => {
    if (!pendingScrollId) return;
    if (!weekLessons.some((l) => l.id === pendingScrollId)) {
      // Target absent from the rendered week (archived / filtered out /
      // moved between share and open). Once the week has ANY lessons we
      // know the absence is real rather than a pre-render frame, so clear
      // the pending id — otherwise this effect re-runs on every
      // weekLessons identity change forever (§4a L4). An empty week keeps
      // the id pending so lessons that are still arriving can match.
      if (weekLessons.length > 0) setPendingScrollId(null);
      return;
    }
    const id = pendingScrollId;
    const raf = requestAnimationFrame(() => scrollPlannerItemIntoView(id));
    setPendingScrollId(null);
    return () => cancelAnimationFrame(raf);
  }, [pendingScrollId, weekLessons]);

  // ── Deep link WRITE — mirror shareable state into the URL ─────────────
  // Shareable state ONLY: the active week, the subject filter (when it is
  // exactly one subject — the only shape the link scheme carries), the
  // open lesson detail, and the active grade (grade scoping is always an
  // explicit param, never assumed — CLAUDE.md §1). Ephemeral state (open
  // menus, panel widths, drag state) stays out. Guards against replace
  // loops two ways: the first run after mount is skipped (the URL the
  // teacher loaded is already correct), and a replace only fires when the
  // built URL differs from what the address bar shows.
  const skippedFirstUrlSyncRef = useRef(false);
  useEffect(() => {
    if (!skippedFirstUrlSyncRef.current) {
      skippedFirstUrlSyncRef.current = true;
      return;
    }
    if (!isSyncableWeek(week)) return;
    const subject =
      filters.subjects.length === 1 ? filters.subjects[0] : undefined;
    const href = buildWeeklyLink({
      week,
      subject,
      lesson: selectedLesson?.id,
      grade: activeGradeId ?? undefined,
    });
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== href) {
      // replace, never push — week-to-week browsing must not bloat the
      // Back button; the URL is a live mirror, not a navigation log.
      router.replace(href, { scroll: false });
    }
  }, [week, filters.subjects, selectedLesson, activeGradeId, router]);

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
  //
  //    W3.8 innermost-first guard: while the lesson-editor modal is open,
  //    Esc belongs to the modal (its window-level listener closes it) —
  //    this document listener runs FIRST (document before window) and used
  //    to ALSO deselect on the same keypress, collapsing the expanded card
  //    and unmounting the "Open in editor" opener before the modal's
  //    focus-restore could target it (the gate's Esc-falls-to-body bug).
  //    Skipping while the modal is open keeps one Esc = one close.
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent): void => {
      if (modalLessonId !== null) return;
      if (e.key === "Escape" && selectedLessonId !== null) {
        setSelectedLessonId(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [modalLessonId, selectedLessonId, setSelectedLessonId]);

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

  // ── W3-C3 — drawer open signal + close handler ────────────────────────
  // The drawer is "open" when we're in drawer mode (≤1280px viewport) AND
  // any of THREE triggers is active:
  //   • todoPanelOpen / commentsPanelOpen — the GlobalRail To-dos / Shoutbox
  //     icons. These two flags are mutually exclusive (toggleTodoPanel /
  //     toggleCommentsPanel each close the other — see lib/app-state.tsx).
  //   • selectedLessonId !== null AND !isNarrow — a lesson card was clicked
  //     in the GRID. On desktop the inline rail simply re-scopes to the
  //     lesson; in the 901–1280 band the Grid still renders but the inline
  //     rail is `display: none`, so the SAME lesson-scoped content has to
  //     surface through this overlay drawer instead. Without this term,
  //     clicking a card in that band expanded the chip but showed no panel
  //     (the original bug). The drawer's content is already lesson-scoped —
  //     it receives `selectedLesson` / `railMode` and forwards them to
  //     <RightRail>, which renders the lesson's detail + resources when a
  //     lesson is present (mode="day"), exactly like the inline rail.
  //     The `!isNarrow` guard is load-bearing: at ≤900px the Grid is replaced
  //     by <WeeklyList>, whose row click sets `selectedLessonId` purely to
  //     hand off focus to the Daily view (router.push("/daily")). Without the
  //     guard that transient selection would flash this drawer open for a
  //     frame before navigation unmounts the shell. So the lesson term only
  //     fires in the Grid band, never in the List fallback. The To-do /
  //     Shoutbox terms stay ungated — those icons are reachable at every
  //     narrow width.
  //
  // The close handler clears ALL THREE triggers so the drawer can't re-open
  // itself on the next render:
  //   • flips both panel flags back to false (keeps the rail icons'
  //     aria-pressed state honest). We toggle whichever is currently true;
  //     defensively toggling both if (against the mutual-exclusion contract)
  //     both were set.
  //   • clears selectedLessonId so a drawer opened by a lesson selection also
  //     deselects on close. WeeklyGrid keys its inline card expansion off the
  //     selection transition-to-null (see its sync effect), so clearing the
  //     selection here ALSO collapses the expanded card — close ⇒ panel
  //     closed AND card collapsed, the required end state.
  const drawerOpen =
    drawerMode &&
    (todoPanelOpen ||
      commentsPanelOpen ||
      (selectedLessonId !== null && !isNarrow));

  const handleDrawerClose = useCallback((): void => {
    if (todoPanelOpen) toggleTodoPanel();
    if (commentsPanelOpen) toggleCommentsPanel();
    if (selectedLessonId !== null) setSelectedLessonId(null);
  }, [
    todoPanelOpen,
    commentsPanelOpen,
    selectedLessonId,
    toggleTodoPanel,
    toggleCommentsPanel,
    setSelectedLessonId,
  ]);

  // ── Dynamic grid template ─────────────────────────────────────────────
  // Walk the column order, emitting a track size per panel AND an `auto`
  // track between the two panels for the splitter. The grid is always 1fr;
  // the rail is `effectiveRailWidth`px.
  const gridTemplate = useMemo(() => {
    // RES-CRIT-001: the grid panel track is `minmax(0, 1fr)` rather than
    // bare `1fr`. CSS Grid resolves `1fr` to `minmax(auto, 1fr)`, where
    // `auto` is the track content's `min-content`. Our gridSlot contains
    // a WeeklyGrid with a 1082px intrinsic min-width — so bare `1fr`
    // refuses to shrink below that and forces the planner shell past
    // the viewport at every desktop tier. `minmax(0, 1fr)` lets the
    // track shrink and the WeeklyGrid's internal `.scroll` overflow
    // takes over inside the slot instead. The same applies even at
    // wide desktop where the rail is open: shrinking the grid track
    // when the rail is dragged wide should never push the bodyRow
    // wider than its container.
    const trackFor = (id: PanelId): string =>
      id === "rail" ? `${effectiveRailWidth}px` : "minmax(0, 1fr)";
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
    //   0. isEdit (Week EDIT mode) → WeekEditBoard. Edit WINS over every other
    //      branch, INCLUDING the ≤900px narrow-forced-List gate below: the
    //      board scrolls internally and stays usable at phone widths, so the
    //      teacher keeps a single editing surface at every tier (decision
    //      locked by the orchestrator, W3.8c). The board owns its own
    //      grip placement + `data-pane="grid"` wrapper, so it is returned
    //      directly (grip is threaded in, not rendered as a sibling here).
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
    //   4. Default → the frame-picked Week VIEW canvas: paper → WeekColumns,
    //      glass → WeekA, color → WeekC (all self-contained, no props).
    //
    // The drag grip stays so the teacher can still reorder the panel at
    // any width or mode. The pills bar sits above whatever renders below.
    if (isEdit) {
      return <WeekEditBoard grip={grip} />;
    }
    const showList = isNarrow || viewMode === "list";
    const showSchedule = !isNarrow && scheduleMode;
    return (
      <div className={styles.columnWithGrip} data-pane="grid">
        {grip}
        {/* The Subject↔Schedule + Lessons/All toggles that used to live in a
            standalone in-grid "VIEW" bar are now merged into the page-header
            <WeeklyViewControls />. The grid panel renders just the canvas
            below; `scheduleMode` / `includeAllEvents` still drive which
            canvas appears. */}
        {showSchedule ? (
          <ScheduleTimeline scope="week" showNonAcademic={includeAllEvents} />
        ) : showList ? (
          // WeeklyList replaces the grid but occupies the same 1fr slot
          // so the splitter and rail math are unaffected. (It carries its own
          // PlannerEmpty loading/error honesty, so it is gated ABOVE the
          // grid-state branch below.)
          <WeeklyList />
        ) : gridDataState === "pending" ? (
          /* Hydrate in flight (Supabase, 11–16s) — a day-column skeleton in
             place of the canvas so the load never reads as a false "no lessons
             this week". Covers all three view frames (paper/glass/color)
             uniformly; the settled frame branch below is untouched. Permanently
             "settled" with the Supabase flag OFF, so this is a no-op on v1/mock. */
          <WeekGridSkeleton />
        ) : gridDataState === "error" ? (
          /* Hydrate threw — the canonical "Couldn't load your plan" state
             (PlannerEmpty renders its own error copy when the data state is
             "error"), never a silent blank. The heading prop is the graceful
             settled-fallback only; it is never shown in this branch. */
          <PlannerEmpty heading="No lessons planned for this week yet." />
        ) : frame === "paper" ? (
          /* W3.6 — Frame B (paper) reads the week as DAY COLUMNS (the
             bundle's "WeekB"). Same planner data, same rich card (so the
             material register + forking cue carry over), different
             traversal. Narrow/schedule/list precedence above is untouched:
             ≤900px still falls to WeeklyList regardless of frame. */
          <WeekColumns />
        ) : frame === "glass" ? (
          /* W5 — Frame A (glass): the read-only period×day grid. */
          <WeekA />
        ) : (
          /* W5 — Frame C (color): subject lanes of color-forward tiles. Both
             new frames are self-contained (no props), reading the planner +
             app-state stores directly exactly like WeekColumns/WeeklyGrid, so
             selection flows through the shared selectedLessonId the shell's
             URL-sync + RightRail already consume. The v1 WeeklyGrid is no
             longer reachable from the plain color/glass VIEW frame. */
          <WeekC />
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
    /* W3.8 — the provider sits at the very top of the shell tree so every
       card parent (grid slot, columns, drawer) can reach the opener. */
    <OpenLessonEditorContext.Provider value={openLessonEditor}>
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

        {/* ── Single shared week row ──────────────────────────────────────
          The Weekly view's only header chrome. The former "Weekly View"
          title band was removed; this <WeekNavigator> is lifted here (out
          of the per-canvas renders) so exactly ONE instance exists and it
          is always visible regardless of which canvas (grid / list /
          schedule) is showing below. Its `actions` slot hosts the
          Grid|List|Schedule toggle at the far right, guaranteeing the
          toggle stays reachable in every mode — the schedule timeline has
          no navigator of its own, so a per-canvas toggle would vanish in
          schedule mode and trap the teacher there. */}
        <WeekNavigator
          week={week}
          currentWeek={CURRENT_WEEK}
          minWeek={minWeek}
          maxWeek={maxWeek}
          onChange={setWeek}
          headingLevel="h1"
          actions={<WeeklyViewControls isNarrow={isNarrow} />}
        />

        {/* ── Body row: icon rail (fixed) + reorderable grid/rail body ───── */}
        <div className={styles.bodyRow}>
          {/* Far-left slim icon nav strip — shared with Daily. */}
          <IconRail />

          {/* Week EDIT — the board is a dedicated FULL-WIDTH canvas (bundle:
            WeekEdit mounts alone in the viewbody; no resources rail). The
            reorderable grid+rail body below is View-mode chrome; suppressing
            it here mirrors how Day edit takes over /daily. Rail state
            (width, order, collapsed panels) is untouched and returns intact
            when the teacher flips back to View. */}
          {isEdit ? (
            <div className={styles.body} style={{ gridTemplateColumns: "1fr" }}>
              <div className={styles.gridSlot}>{renderGridPanel(null)}</div>
            </div>
          ) : (
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
          )}
        </div>

        {/* ── W3-C3 — narrow-viewport overlay drawer ──────────────────────
          At ≤1280px the inline rail is `display: none` (see
          WeeklyShell.module.css RES-CRIT-001) so the WeeklyGrid has
          breathing room. The drawer brings the same <RightRail> content
          back as a slide-in overlay triggered by the GlobalRail's
          To-dos / Shoutbox icons. State is the existing
          todoPanelOpen / commentsPanelOpen flags on useAppState —
          no new app-state introduced (drawer close flips both off so
          the icons' aria-pressed stays accurate). The inline rail
          render above is untouched; the drawer is a parallel surface
          that only mounts when `drawerMode` is true. */}
        <WeeklyRailDrawer
          open={drawerOpen}
          onClose={handleDrawerClose}
          selectedLesson={selectedLesson}
          week={week}
          selectedDay={selectedDay}
          railMode={railMode}
          weekLessons={weekLessons}
          onClearLesson={
            selectedLesson !== null
              ? () => setSelectedLessonId(null)
              : undefined
          }
        />

        {/* ── W3.8 — lesson-editor popup ──────────────────────────────────
          Rendered once, host-owned. Closes ONLY via its Exit button or
          Esc (the scrim deliberately has no click-to-close — locked
          scope). Conditional mount keeps its focus-capture/restore
          lifecycle tied to open/close. */}
        {modalLessonId !== null && (
          <LessonModal lessonId={modalLessonId} onClose={closeLessonEditor} />
        )}
      </div>
    </OpenLessonEditorContext.Provider>
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
