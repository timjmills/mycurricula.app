// zones-contract.ts — the Teach workspace PRESENTATION CONTRACT (W11).
//
// The single typed props object every Teach shell skin consumes. TeachWorkspace
// (the state owner) computes every field — state slices, derived values, refs,
// and prebuilt handlers — and hands this whole object to whichever skin the v2
// flag selects: `TeachV1Zones` (the pre-redesign body) or `TeachV2Shell`
// (components/teach-v2, Builder B). Both render the SAME zones against the SAME
// state, so a flag flip swaps chrome/layout without touching behaviour.
//
// WHY THIS LEAF LIVES IN components/teach/ (not components/teach-v2/): the v2
// flag's contract is "flag-OFF = a clean v1 rollback, and v1 code never reaches
// into teach-v2/". A neutral type file both skins import keeps that boundary
// intact — the v1 body does not depend on the v2 directory. Type-only, no
// runtime imports, no side effects.
//
// Handler-shaped where a value crosses to a child (`onEditorIntent`,
// `onColorChange`, `onAddBoard`, …): the state owner builds the callback once so
// both skins wire the identical behaviour. Raw setters remain only where a skin
// legitimately builds its own variant (setLibraryOverlay, setHelpOpen, …).

import type { Dispatch, RefObject } from "react";
import type { TeachModuleId } from "@/lib/use-teach-workspace";
import type { UseBoardAnnotationsApi } from "@/lib/use-board-annotations";
import type { TeachDragData, TeachWorkspaceState } from "@/lib/teach/types";
import type {
  Board,
  BoardPage,
  BoardTemplate,
  SubjectId,
  TeachResource,
  Widget,
} from "@/lib/types";
import type { BoardEditorIntent, ResourceItem } from "./board/editor";
import type { AnnotationSwatch } from "./annotation";
import type { TeachWorkspaceAction } from "./TeachWorkspace";

export interface TeachZonesProps {
  // ── Central state ──────────────────────────────────────────────────────────
  state: TeachWorkspaceState;
  dispatch: Dispatch<TeachWorkspaceAction>;

  // ── Refs owned by TeachWorkspace ───────────────────────────────────────────
  // Fullscreen target (rootRef), resource-canvas container, and the board-open
  // re-entrancy guard.
  rootRef: RefObject<HTMLDivElement | null>;
  resourceContainerRef: RefObject<HTMLDivElement | null>;
  openingBoardRef: RefObject<boolean>;

  // ── Responsive tier ────────────────────────────────────────────────────────
  viewport: { isSmall: boolean };

  // ── Board / lesson / subject data ──────────────────────────────────────────
  boards: Board[];
  activeBoard: Board | null;
  activeLessonId: string | null;
  activeResource: TeachResource | null;
  standaloneBoard: Board | null;
  subject: SubjectId | undefined;
  subjClass: string | undefined;
  boardIndex: number;
  boardCount: number;
  pages: BoardPage[];
  resolvedPageId: string | null;
  widgets: Widget[];
  editorResources: ResourceItem[];
  rightOrder: TeachModuleId[];
  ownerId: string | null;
  boardsGradeLevelId: string | undefined;
  canCreateBoard: boolean;

  // ── Annotation surface (resource center mode) ──────────────────────────────
  annotations: UseBoardAnnotationsApi;
  resolvedColor: string;
  colorId: string;
  onColorChange: (swatch: AnnotationSwatch) => void;
  strokeWidth: number;
  onStrokeWidthChange: (n: number) => void;

  // ── Panel widths + chrome identity ─────────────────────────────────────────
  leftWidth: number | undefined;
  rightWidth: number | undefined;
  avatarInitials: string;
  teacherName: string;
  gradeLabel: string | undefined;
  chatUnread: number;
  week: number;
  day: number;

  // ── Module focus (rail highlight ↔ panel body) ─────────────────────────────
  leftActiveModule: TeachModuleId;
  setLeftActiveModule: (id: TeachModuleId) => void;
  rightActiveModule: TeachModuleId;
  setRightActiveModule: (id: TeachModuleId) => void;

  // ── Local overlay UI state ─────────────────────────────────────────────────
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
  boardSettingsOpen: boolean;
  setBoardSettingsOpen: (open: boolean) => void;
  libraryOverlay: "boards" | "widgets" | null;
  setLibraryOverlay: (v: "boards" | "widgets" | null) => void;

  // ── Active drag payload (DragOverlay ghost) ────────────────────────────────
  activeDrag: TeachDragData | null;

  // ── Panel open/collapse helpers ────────────────────────────────────────────
  openLeftPanel: () => void;
  openRightPanel: () => void;
  openBoardsPanel: () => void;
  togglePanels: () => void;
  toggleRightCollapsed: () => void;

  // ── Fullscreen ─────────────────────────────────────────────────────────────
  toggleFullscreen: (next: boolean) => void;
  exitFullscreen: () => void;

  // ── Board / widget / editor callbacks ──────────────────────────────────────
  onEditorIntent: (intent: BoardEditorIntent) => void;
  onEmbedResource: (resource: TeachResource) => void;
  reloadBoards: () => Promise<Board[]>;
  handleUseTemplate: (template: BoardTemplate) => Promise<void>;
  showConsequence: (t: { message: string; onUndo?: () => void }) => void;

  // ── Prebuilt chrome action handlers ────────────────────────────────────────
  // The state owner constructs these once (with their gating baked in) so both
  // skins wire identical behaviour.
  onOpenWidgetLibrary: (() => void) | undefined;
  onOpenBoardLibrary: () => void;
  onAddBoard: (() => void) | undefined; // sub-bar: undefined in standalone scope
  onStartBlankBoard: (() => void) | undefined; // empty state: canCreateBoard-gated
  onBoardSettings: (() => void) | undefined;
}
