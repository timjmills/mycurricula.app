"use client";

// TeachWorkspace.tsx — the top-level Teach client component
// (docs/teach-view-plan.md §2.4, §3). It owns:
//   • the central `TeachWorkspaceState` (a useReducer), which every zone reads;
//   • the ONE `DndContext` that carries every drag on the surface (T8 resource
//     → cell, widget reorder, rail-icon rearrange);
//   • the persisted `TeachWorkspaceLayout` via `useTeachWorkspace` (collapse,
//     widths, dock split);
//   • the five-zone shell geometry, composing the Wave 1 chrome / rails /
//     panels / board / canvas (see §14 ownership map).
//
// WAVE-0 CONTRACT: the reducer + state shape below are the frozen integration
// boundary. Wave 1 consumes the state and the dnd ids/payloads from
// `lib/teach/types.ts`; it does not redefine them. Wave 2 (this file) wires the
// zones together against that contract.

import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useDndSensors } from "@/lib/collapse-on-drag";
import {
  TEACH_MODULE_IDS,
  useTeachWorkspace,
  type TeachModuleId,
} from "@/lib/use-teach-workspace";
import { useBoardAnnotations } from "@/lib/use-board-annotations";
import { useTeachShortcuts } from "@/lib/use-teach-shortcuts";
import { useTeachViewport } from "@/lib/use-teach-viewport";
import { usePlanner } from "@/lib/planner-store";
import { useAppState } from "@/lib/app-state";
import { lessonResources } from "@/lib/lesson-resources";
import { shoutboxForDay } from "@/lib/mock";
import { toTeachResource } from "@/lib/teach/toTeachResource";
import { ME } from "@/lib/mock/teachers";
import { teachClient as teach } from "@/lib/teach/client";
import { SANDBOX_LESSON_ID } from "@/lib/teach/queries";
import { useConsequenceToast } from "@/lib/consequence-toast";
import { plannerClient } from "@/lib/planner/client";
import {
  BOARD_LAYOUT_GRID,
  parseBoardCellDroppableId,
  type BoardCellTarget,
  type BoardLayout,
  type BoardTool,
  type CenterMode,
  type TeachDragData,
  type TeachWorkspaceState,
} from "@/lib/teach/types";
import type {
  Board,
  BoardPage,
  CanvasPosition,
  SubjectId,
  TeachResource,
  Widget,
  WidgetType,
} from "@/lib/types";

import {
  PresentBar,
  TeachFooter,
  TeachHelpOverlay,
  TeachSubBar,
  TeachTopBar,
  TEACH_CENTER_PANEL_ID,
} from "./chrome";
import { TeachLeftPanel, TeachLeftRail } from "./left";
import { TeachRightPanel, TeachRightRail } from "./right";
import { BoardSettingsPopover } from "./board";
import {
  BoardEditor,
  type BoardEditorIntent,
  type ResourceItem,
} from "./board/editor";
import { BoardFullscreen } from "./board/fullscreen";
import { BoardLibraryModule, WidgetLibrary } from "./library";
import { TeachIcon, widgetMeta } from "@/components/teach/widgets";
import { Button } from "@/components/ui";
import { BoardCanvasResource, ResourceViewerToolbar } from "./canvas";
import {
  AnnotationLayer,
  ANNOTATION_SWATCHES,
  BoardToolbar,
  type AnnotationSwatch,
} from "./annotation";
import styles from "./TeachWorkspace.module.css";

// ── Props (deep-link seeds from the server page) ────────────────────────────

export interface TeachWorkspaceProps {
  initialLessonId?: string;
  initialBoardId?: string;
  initialResourceId?: string;
  initialSandbox?: boolean;
}

// The default seeded lesson with the rich board mix, so a deep-link-less open
// lands on a populated preview (Wave-2 wiring requirement 1).
const DEFAULT_LESSON_ID = "m-12-0";

// Sandbox (lesson-less) board scope: the repository key for the teacher's
// lesson-less ephemeral scratch boards. The sentinel's single source of truth is
// the data contract (SANDBOX_LESSON_ID in lib/teach/queries.ts) so the UI and the
// repo agree; the repo maps it to lesson-less ephemeral personal boards (audit
// F4). Nothing reaches a *planner* lesson until the teacher pins/saves the sandbox
// (BoardsModule §4a flows); keeping it stable lets the sandbox set survive tab
// switches.

// Whether the Teach surface persists to Supabase (the same flag the client
// facade in lib/teach/client.ts branches on). When OFF the workspace keeps the
// pre-backend mock identity (the `ME` slug + the "g5" grade slug) so behaviour
// is byte-identical to the prototype. When ON the workspace must feed the
// repository the REAL auth uid + grade uuid (never a fixture slug), exactly as
// the planner store does — a slug in a uuid/RLS column is audit finding #18.
const USE_SUPABASE = process.env.NEXT_PUBLIC_TEACH_USE_SUPABASE === "1";

// The mock grade slug used by every fixture board (mirrors lib/mock/boards
// MOCK_GRADE_LEVEL_ID). Only ever used on the flag-OFF prototype path; under the
// flag the real grade uuid is resolved from the planner data source.
const MOCK_GRADE_SLUG = "g5";

// ── Central state reducer ───────────────────────────────────────────────────
// The full action surface a zone agent dispatches against. Kept minimal +
// explicit so the contract is legible; Wave 1 extends additively as needed.

export type TeachWorkspaceAction =
  | { type: "selectLesson"; lessonId: string | null }
  | { type: "selectBoard"; boardId: string | null }
  | { type: "setCenterMode"; mode: CenterMode }
  | { type: "openResource"; resource: TeachResource | null }
  | { type: "setLayout"; layout: BoardLayout }
  | { type: "setLeftCollapsed"; collapsed: boolean }
  | { type: "setRightCollapsed"; collapsed: boolean }
  | { type: "focusWidget"; widgetId: string | null }
  | { type: "setPresent"; present: boolean }
  | { type: "setFullscreen"; fullscreen: boolean }
  | { type: "setTool"; tool: BoardTool }
  | { type: "enterSandbox" }
  | { type: "exitSandbox" }
  | { type: "setSandboxDirty"; dirty: boolean };

function reducer(
  state: TeachWorkspaceState,
  action: TeachWorkspaceAction,
): TeachWorkspaceState {
  switch (action.type) {
    case "selectLesson":
      // Switching lessons drops the stale board selection so the load effect
      // re-selects the first board of the new lesson.
      return { ...state, activeLessonId: action.lessonId, activeBoardId: null };
    case "selectBoard":
      return { ...state, activeBoardId: action.boardId };
    case "setCenterMode":
      return { ...state, centerMode: action.mode };
    case "openResource":
      return {
        ...state,
        activeResource: action.resource,
        // Opening a resource flips the center to resource mode; clearing it
        // returns to the board grid.
        centerMode: action.resource ? "resource" : "board",
      };
    case "setLayout":
      return { ...state, layout: action.layout };
    case "setLeftCollapsed":
      return { ...state, leftCollapsed: action.collapsed };
    case "setRightCollapsed":
      return { ...state, rightCollapsed: action.collapsed };
    case "focusWidget":
      return { ...state, focusedWidgetId: action.widgetId };
    case "setPresent":
      return { ...state, present: action.present };
    case "setFullscreen":
      return { ...state, fullscreen: action.fullscreen };
    case "setTool":
      return { ...state, activeTool: action.tool };
    case "enterSandbox":
      return {
        ...state,
        sandbox: true,
        activeLessonId: null,
        activeBoardId: null,
      };
    case "exitSandbox":
      return { ...state, sandbox: false, sandboxDirty: false };
    case "setSandboxDirty":
      return { ...state, sandboxDirty: action.dirty };
    default:
      return state;
  }
}

function initState(props: TeachWorkspaceProps): TeachWorkspaceState {
  return {
    activeLessonId: props.initialLessonId ?? null,
    activeBoardId: props.initialBoardId ?? null,
    centerMode: props.initialResourceId ? "resource" : "board",
    activeResource: null,
    layout: "2x2",
    leftCollapsed: false,
    rightCollapsed: false,
    focusedWidgetId: null,
    present: false,
    fullscreen: false,
    activeTool: "select",
    sandbox: !!props.initialSandbox,
    sandboxDirty: false,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * The composed Teach workspace shell. Wave 0 ships the skeleton + frozen
 * contract; Wave 2 mounts the real zone components against that state.
 */
export function TeachWorkspace(props: TeachWorkspaceProps): ReactNode {
  const [state, dispatch] = useReducer(reducer, props, initState);
  const workspace = useTeachWorkspace();
  // Responsive tier (SSR-safe — desktop on the server + first paint, real value
  // post-mount). Drives the small-screen panel-drawer behaviour: auto-collapse
  // both panels when crossing into ≤900px, one-drawer-at-a-time, and the
  // tap-to-dismiss scrim. See lib/use-teach-viewport.ts + the Wave-4 follow-up
  // in docs/teach-a11y-responsive-notes.md.
  const viewport = useTeachViewport();
  const sensors = useDndSensors();
  const { lessons, getSections } = usePlanner();
  const { week, selectedDay, currentUser } = useAppState();
  const { showConsequence } = useConsequenceToast();

  // Guards onOpenBoard against re-entrant clicks while a pull-copy is in flight, so
  // a double-click can't pull two copies / consume two cap slots (review Low).
  const openingBoardRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const resourceContainerRef = useRef<HTMLDivElement>(null);

  // ── Repository identity (audit finding #18) ────────────────────────────────
  // The board repository keys every row on an OWNER id and a GRADE id that, when
  // Supabase is wired, are uuid columns gated by RLS (`auth.uid()`). The mock
  // fixtures use slug ids (`ME.id` = a teacher slug, "g5" = a grade slug). Under
  // the flag we MUST pass the real auth uid + grade uuid — sending a slug into a
  // uuid column silently breaks RLS (rows the teacher can't see) and was the
  // finding. This mirrors planner-store.tsx: the owner id is the live
  // `currentUser.id` (auth uid, null while the session loads), and the grade
  // uuid is resolved asynchronously through the planner data source.
  //
  // Flag OFF (prototype): keep the EXACT prior identity — `ME.id` + "g5" — so
  // every flag-OFF code path is byte-identical to the mock behaviour.
  const ownerId: string | null = USE_SUPABASE ? currentUser.id : ME.id;
  // Resolved grade uuid under the flag; null until the async resolve lands (or
  // when signed out / no grade). Flag-OFF this stays unused — the mock grade
  // slug drives every call as before.
  const [resolvedGradeId, setResolvedGradeId] = useState<string | null>(null);
  useEffect(() => {
    if (!USE_SUPABASE) return; // flag OFF → mock slug drives grade, no resolve
    if (!ownerId) {
      setResolvedGradeId(null);
      return;
    }
    let alive = true;
    void plannerClient
      .getActiveGradeLevelId(ownerId)
      .then((id) => {
        if (alive) setResolvedGradeId(id);
      })
      .catch(() => {
        if (alive) setResolvedGradeId(null);
      });
    return () => {
      alive = false;
    };
  }, [ownerId]);

  // The grade id every create/widget call keys new rows on. Flag OFF: the mock
  // slug (or the active board's own grade) — byte-identical to before. Flag ON:
  // the resolved grade uuid, falling back to the active board's grade (already a
  // uuid once boards load from Supabase). Never the "g5" slug under the flag.
  const gradeIdFallback = USE_SUPABASE
    ? (resolvedGradeId ?? undefined)
    : MOCK_GRADE_SLUG;
  const boardGradeId = useCallback(
    (board?: Board | null): string | undefined =>
      board?.gradeLevelId ?? gradeIdFallback,
    [gradeIdFallback],
  );
  // Guards the `?resource=` deep-link auto-open so it fires AT MOST once — after
  // the teacher closes the canvas (openResource(null)) we must not re-open it.
  const resourceDeepLinkDone = useRef(false);

  // ── Boards for the active lesson (repo-driven, effect-loaded) ──────────────
  const [boards, setBoards] = useState<Board[]>([]);
  // Free-form pages of the active board (5.31). A board with no explicit pages
  // yields a single implicit page built from its flat widgets (repo contract).
  // `activePageId` is a view concern local to the workspace — kept here rather
  // than in the frozen reducer state.
  const [pages, setPages] = useState<BoardPage[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  // Board-settings popover (audit G1) — open when truthy. Holds nothing; it
  // reads the live `activeBoard` at mount, so a board switch closes it.
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false);
  // Help / shortcuts overlay (audit B2) — the top-bar Help button opens it.
  const [helpOpen, setHelpOpen] = useState(false);
  // Board / Widget Library overlay (5.31) — opened from the sub-bar. Null = none.
  const [libraryOverlay, setLibraryOverlay] = useState<
    "boards" | "widgets" | null
  >(null);
  // Active drag payload, surfaced through the DragOverlay ghost.
  const [activeDrag, setActiveDrag] = useState<TeachDragData | null>(null);

  // Lifted module focus for each side (rail highlight ↔ panel body stay in sync).
  const [leftActiveModule, setLeftActiveModule] =
    useState<TeachModuleId>("lessons");
  const [rightActiveModule, setRightActiveModule] =
    useState<TeachModuleId>("resources");

  // Annotation surface state — colour + width are local UI prefs; the stroke
  // document lives in the hook (per-surface, persisted).
  const [colorId, setColorId] = useState<string>(ANNOTATION_SWATCHES[0].id);
  const [strokeWidth, setStrokeWidth] = useState<number>(4);

  // ── Keep central collapse flags synced with the persisted layout ───────────
  useEffect(() => {
    dispatch({
      type: "setLeftCollapsed",
      collapsed: workspace.layout.leftCollapsed,
    });
    dispatch({
      type: "setRightCollapsed",
      collapsed: workspace.layout.rightCollapsed,
    });
  }, [workspace.layout.leftCollapsed, workspace.layout.rightCollapsed]);

  // ── Viewport-aware default collapse (the Wave-4 fix) ───────────────────────
  // SSR + first client paint render as DESKTOP (viewport.isSmall === false), so
  // the server HTML and first hydration agree — no mismatch. Post-mount the hook
  // reports the real tier; when we cross INTO the small breakpoint we collapse
  // BOTH panels so neither overlay drawer is open on a small-screen first load.
  // We only act on the DOWN-crossing edge (desktop/large → small) so we never
  // fight a teacher who has deliberately reopened a drawer at the same tier; we
  // do not auto-EXPAND when crossing back up to desktop (the persisted layout
  // already drives that via the sync effect above). `prevSmallRef` starts at the
  // SSR assumption (false) so the very first post-mount transition into a small
  // viewport is treated as a down-crossing and collapses both panels.
  const prevSmallRef = useRef(false);
  useEffect(() => {
    const wasSmall = prevSmallRef.current;
    prevSmallRef.current = viewport.isSmall;
    if (viewport.isSmall && !wasSmall) {
      dispatch({ type: "setLeftCollapsed", collapsed: true });
      dispatch({ type: "setRightCollapsed", collapsed: true });
    }
  }, [viewport.isSmall]);

  // ── Esc closes the open drawer on small screens ────────────────────────────
  // On small screens a panel is a modal-ish overlay drawer, so Esc should
  // dismiss it. This runs at the workspace level (the global teach-shortcuts Esc
  // cascade handles resource/present/fullscreen; drawer dismissal is a
  // small-screen-only concern owned here). Only active when small AND a drawer
  // is open; in Present mode the panels are unmounted so there's nothing to
  // close. Capture phase + stopPropagation so we win before the global cascade
  // when a drawer is the top-most dismissible layer.
  useEffect(() => {
    if (!viewport.isSmall || state.present) return;
    const leftOpen = !state.leftCollapsed;
    const rightOpen = !state.rightCollapsed;
    if (!leftOpen && !rightOpen) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      // Don't steal Esc from a more-nested overlay (resource canvas / picker).
      if (state.centerMode === "resource" && state.activeResource) return;
      e.preventDefault();
      e.stopPropagation();
      if (rightOpen) dispatch({ type: "setRightCollapsed", collapsed: true });
      if (leftOpen) dispatch({ type: "setLeftCollapsed", collapsed: true });
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    viewport.isSmall,
    state.present,
    state.leftCollapsed,
    state.rightCollapsed,
    state.centerMode,
    state.activeResource,
  ]);

  // ── Default lesson seed (only when not deep-linked + not sandbox) ──────────
  useEffect(() => {
    if (state.activeLessonId == null && !state.sandbox) {
      dispatch({ type: "selectLesson", lessonId: DEFAULT_LESSON_ID });
    }
    // Run once on mount; subsequent nulls (sandbox exit) are user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load boards for the active lesson ──────────────────────────────────────
  const activeLessonId = state.activeLessonId;
  // The repository key the board set hangs off: the active lesson when one is
  // selected, or the sandbox sentinel while building lesson-less (plan §4a).
  // Sandbox boards are repo-backed (so the teacher can actually build) but never
  // touch a planner lesson until pinned/saved.
  const boardScopeLessonId: string | null = state.sandbox
    ? SANDBOX_LESSON_ID
    : activeLessonId;
  // Latest scope id, mirrored into a ref so an in-flight async `reloadBoards`
  // can detect a lesson switch (or sandbox transition) that landed while its
  // fetch was pending, and bail before writing the OLD set into the NEW state.
  const boardScopeLessonIdRef = useRef(boardScopeLessonId);
  boardScopeLessonIdRef.current = boardScopeLessonId;
  useEffect(() => {
    // No scope, or (under the flag) no resolved auth uid yet → show nothing
    // rather than query with a null/slug owner against an RLS-gated table. Once
    // the session resolves `ownerId`, this effect re-runs and loads the set.
    // Flag-OFF `ownerId` is the mock slug (never null), so this is byte-identical.
    if (boardScopeLessonId == null || ownerId == null) {
      setBoards([]);
      return;
    }
    let alive = true;
    void teach
      .listBoardsForLesson(boardScopeLessonId, ownerId)
      .then((next) => {
        if (alive) setBoards(next);
      })
      .catch(() => {
        if (alive) setBoards([]);
      });
    return () => {
      alive = false;
    };
  }, [boardScopeLessonId, ownerId]);

  // Re-fetch the active set's boards (used after a mutating repo call).
  // Captures the scope id at call time and re-checks the live ref before
  // committing, so a lesson switch / sandbox entry mid-fetch can't write stale
  // boards into the freshly-selected scope.
  const reloadBoards = useCallback(async (): Promise<Board[]> => {
    const requested = boardScopeLessonId;
    // Same identity guard as the load effect: never query with a null owner.
    if (requested == null || ownerId == null) return [];
    const next = await teach.listBoardsForLesson(requested, ownerId);
    if (boardScopeLessonIdRef.current !== requested) return next;
    setBoards(next);
    return next;
  }, [boardScopeLessonId, ownerId]);

  // Select the first board once a set loads and nothing is selected yet.
  useEffect(() => {
    if (state.activeBoardId == null && boards.length > 0) {
      dispatch({ type: "selectBoard", boardId: boards[0].id });
    }
  }, [boards, state.activeBoardId]);

  // Close the board-settings popover when the active board changes so it never
  // operates on a board the teacher has navigated away from.
  useEffect(() => {
    setBoardSettingsOpen(false);
  }, [state.activeBoardId]);

  // ── Resource deep-link resolution (?resource=<id>) ─────────────────────────
  // The server seeds `centerMode: "resource"` from `?resource=`, but the canvas
  // only renders when an `activeResource` is set. Resolve the id to a real
  // TeachResource off the active lesson's section resources (the canonical
  // data path — NO new fetch, plan §11.3) and open it. Match by the resource's
  // server row id / section id / url; if nothing matches, fall back to the
  // FIRST available resource so the canvas still demonstrates the annotation
  // surface. When the lesson has no resources we stay in board mode (the
  // resource-data agent is separately ensuring section resources exist).
  const initialResourceId = props.initialResourceId;
  useEffect(() => {
    if (resourceDeepLinkDone.current) return;
    if (!initialResourceId) return;
    if (activeLessonId == null) return;

    const sections = getSections(activeLessonId);
    const resources = lessonResources(sections);
    if (resources.length === 0) return; // no resources yet — stay in board mode

    const match =
      resources.find(
        (r) =>
          r.id === initialResourceId ||
          r.resourceId === initialResourceId ||
          r.url === initialResourceId,
      ) ?? resources[0];

    resourceDeepLinkDone.current = true;
    dispatch({ type: "openResource", resource: toTeachResource(match) });
  }, [initialResourceId, activeLessonId, getSections]);

  // ── Derived board / widget / subject ──────────────────────────────────────
  const activeBoard: Board | null = useMemo(
    () => boards.find((b) => b.id === state.activeBoardId) ?? boards[0] ?? null,
    [boards, state.activeBoardId],
  );
  // Memoized so callbacks depending on `widgets` (embed-at-empty-cell, B8)
  // don't see a fresh array identity on every render.
  const widgets: Widget[] = useMemo(
    () => activeBoard?.widgets ?? [],
    [activeBoard],
  );

  const subject: SubjectId | undefined = useMemo(
    () => lessons.find((l) => l.id === activeLessonId)?.subject,
    [lessons, activeLessonId],
  );

  // ── Pages of the active board (free-form canvas, 5.31) ─────────────────────
  // Re-derived whenever the active board's identity OR its widget set changes
  // (a mutating repo call swaps in a fresh Board object via reloadBoards), so
  // the editor/fullscreen always render the committed widget geometry.
  const activeBoardId = state.activeBoardId;
  const reloadPages = useCallback(async (): Promise<BoardPage[]> => {
    if (!activeBoard) {
      setPages([]);
      return [];
    }
    const next = await teach.listPages(activeBoard.id);
    setPages(next);
    return next;
  }, [activeBoard]);
  useEffect(() => {
    void reloadPages();
  }, [reloadPages]);
  // Keep the active page valid: default to the first page, and recover if the
  // current selection vanished (page delete) or the board switched.
  useEffect(() => {
    if (pages.length === 0) {
      if (activePageId !== null) setActivePageId(null);
      return;
    }
    if (!activePageId || !pages.some((p) => p.id === activePageId)) {
      setActivePageId(pages[0].id);
    }
  }, [pages, activePageId]);
  // Reset the page selection when the board changes so the first page of the
  // new board is chosen by the effect above.
  useEffect(() => {
    setActivePageId(null);
  }, [activeBoardId]);

  // Real lesson resources for the editor's resource picker/drop (maps the
  // section resources to the editor's lightweight {id,title,kind} shape).
  const editorResources = useMemo<ResourceItem[]>(() => {
    if (activeLessonId == null) return [];
    return lessonResources(getSections(activeLessonId)).map((r) => ({
      id: r.id,
      title: r.label,
      kind: r.type,
    }));
  }, [activeLessonId, getSections]);

  const boardIndex = activeBoard
    ? Math.max(
        0,
        boards.findIndex((b) => b.id === activeBoard.id),
      ) + 1
    : 0;
  const boardCount = boards.length;

  // ── Annotation hook (resource center mode) ─────────────────────────────────
  const activeResource = state.activeResource;
  const annotations = useBoardAnnotations({
    lessonId: activeLessonId ?? "sandbox",
    boardId: state.activeBoardId ?? "none",
    resourceId: activeResource?.resourceId ?? activeResource?.url,
  });
  const resolvedColor = useMemo(() => {
    const swatch =
      ANNOTATION_SWATCHES.find((s) => s.id === colorId) ??
      ANNOTATION_SWATCHES[0];
    return `var(${swatch.token})`;
  }, [colorId]);

  // ── Fullscreen API (owned here, the targeted element lives in this file) ───
  const toggleFullscreen = useCallback((next: boolean): void => {
    dispatch({ type: "setFullscreen", fullscreen: next });
    const el = rootRef.current;
    if (!el) return;
    try {
      if (next) {
        if (typeof el.requestFullscreen === "function") {
          void el.requestFullscreen();
        }
      } else if (
        typeof document !== "undefined" &&
        document.fullscreenElement &&
        typeof document.exitFullscreen === "function"
      ) {
        void document.exitFullscreen();
      }
    } catch {
      // Fullscreen can reject (permissions / not user-activated) — the
      // reducer flag is the source of truth for the chrome, so swallow.
    }
  }, []);

  const exitFullscreen = useCallback((): void => {
    if (
      typeof document !== "undefined" &&
      document.fullscreenElement &&
      typeof document.exitFullscreen === "function"
    ) {
      void document.exitFullscreen();
    }
  }, []);

  // ── One-drawer-at-a-time expand helpers ────────────────────────────────────
  // On small screens (≤900px) the panels are overlay drawers (Wave-3 CSS), so
  // two open at once would stack/overlap. These helpers funnel EVERY expand
  // path (rail icons, the module-focus chord, the footer dots) so that opening
  // one panel force-collapses the other on small screens. On desktop both may
  // stay open — current behaviour is preserved.
  //
  // The persisted collapse flag is the single source of truth: opening one side
  // toggles its persisted flag via `workspace.toggle*`, and on a small screen we
  // ALSO persist the OTHER side's collapse (one-drawer-at-a-time). Persisting
  // both keeps the central reducer state — which the sync effect above derives
  // strictly from the persisted flags — consistent with localStorage. A direct
  // reducer dispatch for the forced-collapse would be clobbered: flipping the
  // persisted flag re-runs the sync effect, which re-applies BOTH persisted
  // sides and overwrites a transient dispatch. By persisting the other side
  // here, the sync effect re-applies a value that already agrees, so no loop.
  const isSmall = viewport.isSmall;
  const openLeftPanel = useCallback((): void => {
    if (state.leftCollapsed) workspace.toggleLeftCollapsed();
    if (isSmall && !state.rightCollapsed) {
      workspace.toggleRightCollapsed();
    }
  }, [state.leftCollapsed, state.rightCollapsed, isSmall, workspace]);
  const openRightPanel = useCallback((): void => {
    if (state.rightCollapsed) workspace.toggleRightCollapsed();
    if (isSmall && !state.leftCollapsed) {
      workspace.toggleLeftCollapsed();
    }
  }, [state.rightCollapsed, state.leftCollapsed, isSmall, workspace]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  const boardIds = useMemo(() => boards.map((b) => b.id), [boards]);
  const onFocusModule = useCallback(
    (module: "lessons" | "boards" | "resources" | "chat" | "todo"): void => {
      if (module === "resources" || module === "chat" || module === "todo") {
        setRightActiveModule(module);
        openRightPanel();
      } else {
        setLeftActiveModule(module);
        openLeftPanel();
      }
    },
    [openLeftPanel, openRightPanel],
  );
  useTeachShortcuts({
    state,
    dispatch,
    boardIds,
    onFocusModule,
    onExitFullscreen: exitFullscreen,
  });

  // ── Chrome callbacks ───────────────────────────────────────────────────────
  const handleAddBoard = useCallback(async (): Promise<void> => {
    // In SANDBOX mode there is no active lesson — a board hangs off the sentinel
    // (the repo treats it as a lesson-less ephemeral scratch board, audit F4). This
    // chrome handler previously bailed on the null lesson, so "Add Board" did
    // nothing in the sandbox (audit H4); route it through the sentinel instead.
    const targetLesson = state.sandbox ? SANDBOX_LESSON_ID : activeLessonId;
    if (targetLesson == null) return;
    // Resolve the grade id (real uuid under the flag, mock slug flag-OFF). When
    // the flag is ON and the grade hasn't resolved yet we MUST NOT write a slug
    // into the uuid/RLS column — skip the create until identity is ready (audit
    // finding #18). Flag OFF this is always defined (the mock slug), so the
    // guard is inert and behaviour is byte-identical.
    const gradeLevelId = boardGradeId(activeBoard);
    if (ownerId == null || gradeLevelId == null) return;
    await teach.createBoard({
      masterLessonId: targetLesson,
      ownerId,
      scope: "personal",
      title: `Board ${boards.length + 1}`,
      displayOrderWithinLesson: boards.length,
      templateId: null,
      gradeLevelId,
    });
    const next = await reloadBoards();
    const created = next[next.length - 1];
    if (created) dispatch({ type: "selectBoard", boardId: created.id });
  }, [
    activeLessonId,
    state.sandbox,
    ownerId,
    boards.length,
    activeBoard,
    reloadBoards,
    boardGradeId,
  ]);

  // Whether "Start blank" can create a board right now — mirrors handleAddBoard's
  // guards (a target lesson or the sandbox + a resolved owner/grade). When false
  // the empty state hides the primary action rather than offering a dead button
  // (e.g. the flag is ON and the auth/grade identity hasn't resolved yet).
  const canCreateBoard =
    (state.sandbox || activeLessonId != null) &&
    ownerId != null &&
    boardGradeId(activeBoard) != null;

  // Open the left Boards module — the empty state's "pick from the Boards page"
  // path (the dedicated /boards route lands in Wave 3; today Boards browsing is
  // the left module + the Board Library overlay it opens).
  const openBoardsPanel = useCallback((): void => {
    setLeftActiveModule("boards");
    openLeftPanel();
  }, [openLeftPanel]);

  const togglePanels = useCallback((): void => {
    // On small screens the panels are overlay drawers, so "show panels" must
    // not open both at once (they'd overlap). If anything is open, collapse
    // everything; otherwise open just the LEFT drawer (the primary panel). On
    // desktop keep the original both-at-once toggle.
    //
    // Self-contained (no dependency on the openLeft/openRight helpers, which are
    // declared further down) so it can't trip a temporal-dead-zone reference.
    if (viewport.isSmall) {
      const anyOpen = !state.leftCollapsed || !state.rightCollapsed;
      if (anyOpen) {
        if (!state.leftCollapsed)
          dispatch({ type: "setLeftCollapsed", collapsed: true });
        if (!state.rightCollapsed)
          dispatch({ type: "setRightCollapsed", collapsed: true });
      } else {
        // Open the left drawer via the persisted toggle (so it round-trips to
        // localStorage); the right is already collapsed here.
        workspace.toggleLeftCollapsed();
      }
      return;
    }
    workspace.toggleLeftCollapsed();
    workspace.toggleRightCollapsed();
  }, [viewport.isSmall, state.leftCollapsed, state.rightCollapsed, workspace]);

  // Board widget mutations (add / pin / settings / remove) flow exclusively
  // through the free-form `BoardEditor`'s typed intents (handleEditorIntent
  // below). The old per-cell add/pin/settings/remove callbacks belonged to the
  // deleted CSS-grid `TeachingBoard` and were removed with it (Wave 1 declutter).

  // ── Free-form editor intent → repo (5.31) ──────────────────────────────────
  // The BoardEditor emits a single typed intent per mutation; we map each to the
  // TeachDataSource and refresh boards + pages so the committed geometry flows
  // back through props. Geometry/appearance intents carry their page id.
  const newWidgetId = useCallback(
    (kind: string) =>
      `w-${kind}-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    [],
  );
  const buildWidget = useCallback(
    (
      boardId: string,
      type: WidgetType,
      title: string,
      canvas: CanvasPosition,
      // The resolved grade id (real uuid under the flag, mock slug flag-OFF).
      // The caller resolves + guards it via `boardGradeId` so a slug never
      // reaches a uuid column under the flag (audit finding #18).
      gradeLevelId: string,
      config: Record<string, unknown> = {},
    ): Widget => ({
      id: newWidgetId(type),
      boardId,
      type,
      title,
      // Legacy grid position is retained on the model; the canvas drives layout.
      position: { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      canvas,
      displayOrder: pages.reduce((n, p) => n + p.widgets.length, 0),
      pinned: false,
      config,
      state: {},
      persistence: "inherit",
      gradeLevelId,
    }),
    [newWidgetId, pages],
  );
  const handleEditorIntent = useCallback(
    (intent: BoardEditorIntent): void => {
      const board = activeBoard;
      if (!board) return;
      void (async () => {
        switch (intent.type) {
          case "selectPage":
            setActivePageId(intent.pageId);
            return;
          case "addPage": {
            const page = await teach.addPage(board.id);
            await reloadPages();
            setActivePageId(page.id);
            return;
          }
          case "addWidget": {
            // Guard the grade id so a slug never reaches a uuid column under the
            // flag; flag-OFF this is the mock slug and the guard is inert.
            const gradeLevelId = boardGradeId(board);
            if (gradeLevelId == null) return;
            const meta = widgetMeta(intent.widgetType);
            const widget = buildWidget(
              board.id,
              intent.widgetType,
              meta?.label ?? intent.widgetType,
              intent.canvas,
              gradeLevelId,
            );
            await teach.upsertWidgetOnPage(board.id, intent.pageId, widget);
            await Promise.all([reloadBoards(), reloadPages()]);
            return;
          }
          case "addResource": {
            const gradeLevelId = boardGradeId(board);
            if (gradeLevelId == null) return;
            const widget = buildWidget(
              board.id,
              "resource",
              intent.resource.title,
              intent.canvas,
              gradeLevelId,
              { label: intent.resource.title, kind: intent.resource.kind },
            );
            await teach.upsertWidgetOnPage(board.id, intent.pageId, widget);
            await Promise.all([reloadBoards(), reloadPages()]);
            return;
          }
          case "moveWidget":
            await teach.moveWidget(intent.widgetId, intent.x, intent.y);
            await Promise.all([reloadBoards(), reloadPages()]);
            return;
          case "resizeWidget":
            await teach.resizeWidget(intent.widgetId, intent.w);
            await Promise.all([reloadBoards(), reloadPages()]);
            return;
          case "duplicateWidget": {
            const src = pages
              .find((p) => p.id === intent.pageId)
              ?.widgets.find((w) => w.id === intent.widgetId);
            if (!src) return;
            const base = src.canvas ?? { x: 24, y: 24, w: 300 };
            const copy: Widget = {
              ...src,
              id: newWidgetId(src.type),
              canvas: { x: base.x + 24, y: base.y + 24, w: base.w },
            };
            await teach.upsertWidgetOnPage(board.id, intent.pageId, copy);
            await Promise.all([reloadBoards(), reloadPages()]);
            return;
          }
          case "deleteWidget":
            await teach.deleteWidget(intent.widgetId);
            await Promise.all([reloadBoards(), reloadPages()]);
            return;
          case "setWidgetAppearance":
            await teach.setWidgetAppearance(intent.widgetId, intent.appearance);
            await Promise.all([reloadBoards(), reloadPages()]);
            return;
          case "resetWidgetAppearance":
            await teach.setWidgetAppearance(intent.widgetId, {});
            await Promise.all([reloadBoards(), reloadPages()]);
            return;
          case "setBoardTheme":
            await teach.setBoardTheme(board.id, intent.theme);
            await Promise.all([reloadBoards(), reloadPages()]);
            return;
          case "setBackground":
            // Board paper/surface. Same field + repo method the ⚙ settings
            // popover used; now reachable from the editor's appearance popover
            // so paper lives in ONE place next to the board (#11).
            await teach.updateBoard(board.id, { background: intent.background });
            await Promise.all([reloadBoards(), reloadPages()]);
            return;
          case "clearAllWidgetAppearance": {
            const all = pages.flatMap((p) => p.widgets);
            await Promise.all(
              all.map((w) => teach.setWidgetAppearance(w.id, {})),
            );
            await Promise.all([reloadBoards(), reloadPages()]);
            return;
          }
          case "present":
            dispatch({ type: "setPresent", present: true });
            return;
          case "share":
            // publishBoardToTeamLibrary writes the owner id into a uuid/RLS
            // column; skip until the real auth uid is resolved (flag-OFF this is
            // the mock slug and is always set).
            if (ownerId == null) return;
            await teach.publishBoardToTeamLibrary(board.id, ownerId);
            await reloadBoards();
            return;
          case "back":
            setLeftActiveModule("boards");
            openLeftPanel();
            return;
        }
      })();
    },
    [
      activeBoard,
      pages,
      buildWidget,
      newWidgetId,
      reloadBoards,
      reloadPages,
      ownerId,
      openLeftPanel,
      boardGradeId,
    ],
  );

  // ── Embed a resource onto the active board (explicit T8 path) ──────────────
  const embedResourceAtCell = useCallback(
    async (resource: TeachResource, target: BoardCellTarget): Promise<void> => {
      // Guard the grade id so a slug never reaches a uuid column under the flag;
      // flag-OFF this is the mock slug and the guard is inert.
      const gradeLevelId = boardGradeId(activeBoard);
      if (gradeLevelId == null) return;
      const widget: Widget = {
        id: `w-embed-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
        boardId: target.boardId,
        type: "embed",
        title: resource.label,
        position: { col: target.col, row: target.row, colSpan: 1, rowSpan: 1 },
        displayOrder: widgets.length,
        pinned: false,
        config: {
          url: resource.url ?? "",
          label: resource.label,
          kind: resource.kind,
        },
        state: {},
        persistence: "inherit",
        gradeLevelId,
      };
      await teach.upsertWidget(widget);
      await reloadBoards();
    },
    [widgets.length, activeBoard, reloadBoards, boardGradeId],
  );

  const handleEmbedResource = useCallback(
    (resource: TeachResource): void => {
      if (!activeBoard) return;
      // Audit B8: land it on the first EMPTY cell, not always (0,0) — embedding
      // onto an occupied first cell would stack widgets. Scan the current
      // layout's grid in row-major order for a cell no widget anchors to;
      // fall back to (0,0) if the grid is full (the new widget overflows the
      // grid but is still placed deterministically rather than lost).
      const { cols, rows } = BOARD_LAYOUT_GRID[state.layout];
      const occupied = new Set(
        widgets.map((w) => `${w.position.col}:${w.position.row}`),
      );
      let target: BoardCellTarget = { boardId: activeBoard.id, col: 0, row: 0 };
      outer: for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          if (!occupied.has(`${col}:${row}`)) {
            target = { boardId: activeBoard.id, col, row };
            break outer;
          }
        }
      }
      void embedResourceAtCell(resource, target);
    },
    [activeBoard, widgets, state.layout, embedResourceAtCell],
  );

  // ── DnD drop resolution ────────────────────────────────────────────────────
  function handleDragStart(event: DragStartEvent): void {
    const data = event.active.data.current as TeachDragData | undefined;
    setActiveDrag(data ?? null);
  }

  function handleDragEnd(event: DragEndEvent): void {
    setActiveDrag(null);
    const data = event.active.data.current as TeachDragData | undefined;
    if (!data) return;
    const overId = event.over?.id;

    try {
      if (data.kind === "resource") {
        if (typeof overId !== "string") return;
        const cell = parseBoardCellDroppableId(overId);
        if (!cell) return;
        void embedResourceAtCell(data.resource, cell);
        return;
      }

      if (data.kind === "widget") {
        if (typeof overId !== "string") return;
        const cell = parseBoardCellDroppableId(overId);
        if (!cell) return;
        void teach
          .updateWidget(data.widgetId, {
            position: { col: cell.col, row: cell.row, colSpan: 1, rowSpan: 1 },
          })
          .then(() => reloadBoards());
        return;
      }

      if (data.kind === "rail-icon") {
        if (typeof overId !== "string") return;
        const moduleId = data.moduleId;
        if (!(TEACH_MODULE_IDS as readonly string[]).includes(moduleId)) return;
        // Resolve the destination side from the over droppable id when it
        // encodes one (e.g. "rail-left" / "rail-right"); otherwise no-op.
        const side = overId.includes("right")
          ? "right"
          : overId.includes("left")
            ? "left"
            : null;
        if (!side) return;
        const order =
          side === "left"
            ? workspace.layout.iconRailLeftOrder
            : workspace.layout.iconRailRightOrder;
        workspace.moveRailIcon(moduleId as TeachModuleId, side, order.length);
        return;
      }
    } catch {
      // Drops must never throw on an unrecognized target.
    }
  }

  // (The footer's module-jump dots were removed in the Wave 1 declutter — the
  // rails already provide module navigation, so the footer is now just the
  // panels toggle + save status.)

  // The persisted layout types its rail orders as `string[]`; the hook
  // normalizes to known module ids on write, so narrow back to `TeachModuleId[]`
  // (defensively filtering any stale id) before passing to the typed rails.
  const isModuleId = useCallback(
    (v: string): v is TeachModuleId =>
      (TEACH_MODULE_IDS as readonly string[]).includes(v),
    [],
  );
  const rightOrder = useMemo<TeachModuleId[]>(
    () => workspace.layout.iconRailRightOrder.filter(isModuleId),
    [workspace.layout.iconRailRightOrder, isModuleId],
  );

  // ── Chat unread indicator (audit B5) ───────────────────────────────────────
  // Surface a small unread count on the Chat rail icon/tab when Chat isn't the
  // focused right module. Derived from the SAME day-scoped mock the Daily
  // <Shoutbox> seeds from (messages not authored by the active teacher), so the
  // two surfaces agree. Cleared (shown as 0) while Chat is the active module.
  const chatFocused = !state.rightCollapsed && rightActiveModule === "chat";
  const chatUnread = useMemo(() => {
    if (chatFocused) return 0;
    return shoutboxForDay(week, selectedDay).filter((m) => m.author !== ME.id)
      .length;
  }, [chatFocused, week, selectedDay]);

  const leftWidth = state.leftCollapsed
    ? undefined
    : workspace.layout.panelWidths.left;
  const rightWidth = state.rightCollapsed
    ? undefined
    : workspace.layout.panelWidths.right;

  const avatarInitials = currentUser.initials || ME.initials;
  const subjClass = subject ? `cp-subj ${subject}` : undefined;
  // The page to render — the selection, or the first page while the sync effect
  // catches up (avoids a one-frame fallback flash on board load/switch).
  const resolvedPageId = activePageId ?? pages[0]?.id ?? null;

  // Safety net: present mode requires a board + page to project. Since the lazy
  // auto-seed was removed (#10), "no active board" is a normal state — and ⌘P
  // (use-teach-shortcuts) dispatches setPresent without that context. If present
  // is ever on without something to show, exit immediately so we never render a
  // boardless present shell (gate N1; complements the SubBar button guard, F2,
  // and is sandbox-safe because `activeBoard` resolves the sandbox board too).
  useEffect(() => {
    if (state.present && !(activeBoard && resolvedPageId)) {
      dispatch({ type: "setPresent", present: false });
    }
  }, [state.present, activeBoard, resolvedPageId, dispatch]);

  // ── Present mode → full-bleed Board Fullscreen takeover (5.31 §5) ───────────
  // When presenting, the whole shell is replaced by the projected board. Exit
  // returns to the editor. Guarded on a real board + resolved page.
  if (state.present && activeBoard && resolvedPageId) {
    return (
      <BoardFullscreen
        board={activeBoard}
        pages={pages}
        activePageId={resolvedPageId}
        subjectId={subject}
        onExit={() => dispatch({ type: "setPresent", present: false })}
        onSelectPage={(id) => setActivePageId(id)}
        onAddWidget={(type) =>
          handleEditorIntent({
            type: "addWidget",
            pageId: resolvedPageId,
            widgetType: type,
            canvas: { x: 96, y: 96, w: 320 },
          })
        }
      />
    );
  }

  return (
    <DndContext
      // Stable id keeps dnd-kit's internal `DndDescribedBy-<id>` (the
      // screen-reader instructions' `aria-describedby`) deterministic across
      // server and client. Without it, dnd-kit falls back to a module-level
      // counter (`useUniqueId`) whose value differs between SSR and hydration,
      // producing a React hydration mismatch on every draggable on this surface.
      id="teach-surface-dnd"
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        ref={rootRef}
        className={`${styles.root} ${subjClass ?? ""} ${
          state.present ? styles.present : ""
        }`}
        data-sandbox={state.sandbox ? "true" : undefined}
        title="The live teaching workspace — boards, resources, and class context for delivering a lesson"
      >
        {/* ── Chrome: present strip OR top + sub bars ───────────────────── */}
        {state.present ? (
          <div className={styles.presentStrip}>
            <PresentBar
              dispatch={dispatch}
              boardName={activeBoard?.title ?? "Board"}
              subject={subject}
              slideIndex={boardIndex}
              slideCount={boardCount}
              onPrev={() => {
                const prev = boards[boardIndex - 2];
                if (prev) dispatch({ type: "selectBoard", boardId: prev.id });
              }}
              onNext={() => {
                const nextBoard = boards[boardIndex];
                if (nextBoard)
                  dispatch({ type: "selectBoard", boardId: nextBoard.id });
              }}
            />
          </div>
        ) : (
          <>
            <header className={styles.topBarSlot}>
              <TeachTopBar
                // Multi-grade by design (CLAUDE.md §1): the curriculum/grade
                // label is FREE TEXT sourced from the signed-in teacher's
                // context — the same source the shell top-bar uses
                // (currentUser.curriculumLabel). Never hard-code "Grade 5".
                // When the label is absent the suffix simply disappears.
                gradeLabel={currentUser.curriculumLabel}
                avatarInitials={avatarInitials}
                teacherName={currentUser.name}
                onOpenHelp={() => setHelpOpen(true)}
              />
            </header>
            <div className={styles.subBarSlot}>
              <TeachSubBar
                state={state}
                dispatch={dispatch}
                boards={boards}
                subject={subject}
                onAddBoard={() => void handleAddBoard()}
                onBoardSettings={
                  activeBoard ? () => setBoardSettingsOpen(true) : undefined
                }
                onToggleFullscreen={toggleFullscreen}
                onOpenBoardLibrary={() => setLibraryOverlay("boards")}
                onOpenWidgetLibrary={
                  activeBoard ? () => setLibraryOverlay("widgets") : undefined
                }
              />
            </div>
          </>
        )}

        {/* ── Body row ─────────────────────────────────────────────────── */}
        <div className={styles.body}>
          {/* Left icon rail */}
          {!state.present ? (
            <TeachLeftRail
              activeModuleId={state.leftCollapsed ? null : leftActiveModule}
              onSelectModule={(id) => {
                setLeftActiveModule(id);
                openLeftPanel();
              }}
            />
          ) : null}

          {/* Left panel */}
          {!state.present && !state.leftCollapsed ? (
            <TeachLeftPanel
              state={state}
              dispatch={dispatch}
              activeModuleId={leftActiveModule}
              onActiveModuleChange={setLeftActiveModule}
              width={leftWidth}
              // Single source of truth (audit A1-left): the Boards module reads
              // TeachWorkspace.boards + reloadBoards, never its own fetch, so the
              // sub-bar pills, footer count, and center board stay in lockstep.
              boards={boards}
              boardsGradeLevelId={boardGradeId(activeBoard)}
              reloadBoards={reloadBoards}
              onOpenWidgetLibrary={
                activeBoard ? () => setLibraryOverlay("widgets") : undefined
              }
              // Finding 3 fix: thread the flag-aware owner id so BoardsModule
              // never uses the hard-coded `ME.id` slug under the live flag.
              ownerId={ownerId}
            />
          ) : null}

          {/* Center — board grid OR full-bleed resource canvas. This is the
              panel the sub-bar board-tab strip controls (audit A4): it carries
              the shared TEACH_CENTER_PANEL_ID + role="tabpanel", labelled by
              the active board's tab. */}
          <main
            className={styles.center}
            id={TEACH_CENTER_PANEL_ID}
            role="tabpanel"
            aria-labelledby={
              activeBoard ? `teach-board-tab-${activeBoard.id}` : undefined
            }
          >
            {state.centerMode === "resource" && activeResource ? (
              <div ref={resourceContainerRef} className={styles.resourceStage}>
                <ResourceViewerToolbar
                  state={state}
                  dispatch={dispatch}
                  resource={activeResource}
                  onToggleFullscreen={() => toggleFullscreen(!state.fullscreen)}
                />
                <div className={styles.resourceCanvasWrap}>
                  <BoardCanvasResource
                    resource={activeResource}
                    className={styles.resourceCanvas}
                  />
                  <div className={styles.annotationOverlay}>
                    <AnnotationLayer
                      annotations={annotations}
                      tool={state.activeTool}
                      color={resolvedColor}
                      width={strokeWidth}
                    />
                  </div>
                  {/* Wave 1 declutter: the floating `ToolDock` (a strict subset
                      of the BoardToolbar below — select/pen/text + dead "Soon"
                      tiles) was removed. The single `BoardToolbar` is the one
                      drawing toolbar for the resource surface. */}
                </div>
                <BoardToolbar
                  state={state}
                  dispatch={dispatch}
                  annotations={annotations}
                  colorId={colorId}
                  onColorChange={(swatch: AnnotationSwatch) =>
                    setColorId(swatch.id)
                  }
                  width={strokeWidth}
                  onWidthChange={setStrokeWidth}
                />
              </div>
            ) : activeBoard && resolvedPageId ? (
              <BoardEditor
                board={activeBoard}
                pages={pages}
                activePageId={resolvedPageId}
                onChange={handleEditorIntent}
                subjectId={subject}
                resources={editorResources}
                onBrowseAll={() => setLibraryOverlay("widgets")}
              />
            ) : (
              // Clean empty state (Wave 1, #10) — no board open yet. The board
              // surface opens CLEAR: no widgets, no grid, no auto-seeded set.
              // A board exists only on an explicit action, so we offer the three
              // explicit creation paths.
              <TeachBoardEmptyState
                onStartBlank={
                  canCreateBoard ? () => void handleAddBoard() : undefined
                }
                onOpenBoards={openBoardsPanel}
              />
            )}
          </main>

          {/* Right panel */}
          {!state.present && !state.rightCollapsed ? (
            <TeachRightPanel
              order={rightOrder}
              activeModuleId={rightActiveModule}
              onActivateModule={setRightActiveModule}
              collapsed={state.rightCollapsed}
              onCollapse={workspace.toggleRightCollapsed}
              width={rightWidth}
              activeLessonId={activeLessonId}
              onMagnifyResource={(resource) =>
                dispatch({ type: "openResource", resource })
              }
              onEmbedResource={handleEmbedResource}
              week={week}
              day={selectedDay}
              onOpenWidgetLibrary={
                activeBoard ? () => setLibraryOverlay("widgets") : undefined
              }
            />
          ) : null}

          {/* Right icon rail */}
          {!state.present ? (
            <TeachRightRail
              order={rightOrder}
              activeModuleId={state.rightCollapsed ? null : rightActiveModule}
              onActivateModule={(id) => {
                setRightActiveModule(id);
                openRightPanel();
              }}
              badges={{ chat: chatUnread }}
            />
          ) : null}

          {/* Tap-to-dismiss scrim — only on small screens (≤900px) when a panel
              drawer is open. Sits BELOW the drawer (scrim z-index 40 < drawer
              z-index 45) and above the board/rails; tapping anywhere outside the
              drawer collapses whichever drawer(s) are open. Keyboard users get
              Esc (the effect above) and the scrim is itself a focusable
              <button> (Enter/Space activate it). */}
          {!state.present &&
          viewport.isSmall &&
          (!state.leftCollapsed || !state.rightCollapsed) ? (
            <button
              type="button"
              className={styles.drawerScrim}
              aria-label="Close panel"
              onClick={() => {
                if (!state.rightCollapsed)
                  dispatch({ type: "setRightCollapsed", collapsed: true });
                if (!state.leftCollapsed)
                  dispatch({ type: "setLeftCollapsed", collapsed: true });
              }}
            />
          ) : null}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        {!state.present ? (
          <footer className={styles.footerSlot}>
            <TeachFooter
              panelsCollapsed={state.leftCollapsed && state.rightCollapsed}
              onTogglePanels={togglePanels}
            />
          </footer>
        ) : null}

        {/* Board-settings popover (audit G1) — rename / reorder hint / reset.
            (The CSS-grid `TeachingBoard`'s WidgetPicker + per-widget
            WidgetSettingsPopover were removed in the Wave 1 declutter — widget
            add/settings now flow through the BoardEditor's typed intents.) */}
        {boardSettingsOpen && activeBoard ? (
          <BoardSettingsPopover
            board={activeBoard}
            onClose={() => setBoardSettingsOpen(false)}
            reloadBoards={reloadBoards}
          />
        ) : null}

        {/* Help + shortcuts overlay (audit B2) — opened by the top-bar Help. */}
        <TeachHelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />

        {/* Board / Widget Library overlays (5.31) — opened from the sub-bar. */}
        {libraryOverlay ? (
          <div
            className={styles.libraryOverlay}
            role="dialog"
            aria-modal="true"
            aria-label={
              libraryOverlay === "boards" ? "Board library" : "Widget library"
            }
          >
            <div className={styles.libraryPanel}>
              <div className={styles.libraryHead}>
                <h2 className={styles.libraryTitle}>
                  {libraryOverlay === "boards"
                    ? "Board Library"
                    : "Widget Library"}
                </h2>
                <button
                  type="button"
                  className={styles.libraryClose}
                  onClick={() => setLibraryOverlay(null)}
                  aria-label="Close library"
                >
                  <TeachIcon name="x" size={20} />
                </button>
              </div>
              <div className={styles.libraryBody}>
                {libraryOverlay === "boards" ? (
                  <BoardLibraryModule
                    gradeLevelId={boardGradeId(activeBoard)}
                    onOpenBoard={(board) => {
                      // Ignore re-entrant clicks while a pull-copy is in flight so a
                      // double-click can't pull two copies / consume two cap slots
                      // (review Low). The overlay stays OPEN until the work succeeds
                      // (or a failure is surfaced) so a cap/RLS/network error is not
                      // swallowed (audit M9).
                      if (openingBoardRef.current) return;
                      openingBoardRef.current = true;
                      void (async () => {
                        try {
                          // A board already attached to a lesson (a My Board for a
                          // lesson) → just navigate to it.
                          if (board.masterLessonId != null) {
                            dispatch({
                              type: "selectLesson",
                              lessonId: board.masterLessonId,
                            });
                            dispatch({
                              type: "selectBoard",
                              boardId: board.id,
                            });
                            setLibraryOverlay(null);
                            return;
                          }
                          // Lesson-DETACHED library board (Team Library / a detached
                          // My Board): PULL A COPY INTO THE CURRENT LESSON (audit
                          // F11). selectLesson(null) would clear the workspace, so
                          // add a personal copy to the lesson in view + select it.
                          // Guarded on !sandbox: in the sandbox there is no real
                          // lesson to attach to (reloadBoards reads the sandbox
                          // scope), so a sandbox open falls through to the My Boards
                          // pull below (review Low: latent sandbox+lesson mismatch).
                          if (
                            activeLessonId != null &&
                            !state.sandbox &&
                            ownerId != null
                          ) {
                            const copy = await teach.copyBoardToLesson(
                              board.id,
                              activeLessonId,
                              ownerId,
                            );
                            await reloadBoards();
                            dispatch({ type: "selectBoard", boardId: copy.id });
                            setLibraryOverlay(null);
                            return;
                          }
                          // No lesson in view (e.g. sandbox) → fall back to pulling a
                          // detached copy into My Boards so the action still succeeds.
                          if (ownerId != null) {
                            await teach.copyTeamBoardToMine(board.id, ownerId);
                            setLibraryOverlay(null);
                          }
                        } catch (err) {
                          // Surface the failure (e.g. the board-cap limit) instead of
                          // a silent unhandled rejection; keep the overlay OPEN so the
                          // teacher can delete a board / pick another and retry
                          // (audit M9).
                          showConsequence({
                            message:
                              err instanceof Error &&
                              err.name === "BoardCapError"
                                ? err.message
                                : "Couldn't add that board just now — please try again.",
                          });
                        } finally {
                          openingBoardRef.current = false;
                        }
                      })();
                    }}
                    // Finding 3 fix: thread the flag-aware owner id so library
                    // operations never use the hard-coded `ME.id` slug under
                    // the live flag.
                    ownerId={ownerId}
                  />
                ) : (
                  <WidgetLibrary
                    addedTypes={widgets.map((w) => w.type)}
                    onAddWidget={(type) => {
                      if (resolvedPageId) {
                        handleEditorIntent({
                          type: "addWidget",
                          pageId: resolvedPageId,
                          widgetType: type,
                          canvas: { x: 64, y: 64, w: 320 },
                        });
                      }
                      setLibraryOverlay(null);
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* DragOverlay ghost — a lightweight label for the active payload. */}
      <DragOverlay>
        {activeDrag ? (
          <div className={styles.dragGhost}>
            {activeDrag.kind === "resource"
              ? activeDrag.resource.label
              : activeDrag.kind === "rail-icon"
                ? activeDrag.moduleId
                : "Widget"}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ── Board empty state (Wave 1, #10) ──────────────────────────────────────────
// Shown in the center when no board is open. The board surface opens CLEAN —
// no widgets, no grid — and offers the explicit creation paths (a board exists
// only on an explicit action). "Start blank" is hidden when a board can't be
// created yet (no lesson/owner/grade) rather than rendering a dead button.

interface TeachBoardEmptyStateProps {
  /** Create a blank board for the active lesson / sandbox. Omitted → hidden. */
  onStartBlank?: () => void;
  /** Open the Boards panel (browse + reuse boards). */
  onOpenBoards: () => void;
}

function TeachBoardEmptyState({
  onStartBlank,
  onOpenBoards,
}: TeachBoardEmptyStateProps): ReactNode {
  return (
    <div
      className={styles.emptyState}
      role="region"
      aria-label="No board open"
    >
      <div className={styles.emptyIcon} aria-hidden="true">
        <TeachIcon name="grid" size={30} />
      </div>
      <h2 className={styles.emptyTitle}>No board open yet</h2>
      <p className={styles.emptyBody}>
        Start a blank board, open one from a resource, or pick from the Boards
        page.
      </p>
      <div className={styles.emptyActions}>
        {onStartBlank ? (
          <Button
            variant="primary"
            leadingIcon={<TeachIcon name="plus" size={16} />}
            onClick={onStartBlank}
            tooltip="Create a fresh blank board for this lesson"
          >
            Start blank
          </Button>
        ) : null}
        <Button
          variant="secondary"
          leadingIcon={<TeachIcon name="grid" size={16} />}
          onClick={onOpenBoards}
          tooltip="Browse your boards and the team's, and open one here"
        >
          Browse boards
        </Button>
      </div>
    </div>
  );
}
