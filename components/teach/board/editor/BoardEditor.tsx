// BoardEditor.tsx — the free-form Board Editor canvas (5.31 Widgets & Boards
// handoff §4 "Board Editor"; screenshots 4 + 4b). A teacher opens a board to a
// dotted canvas, drags/resizes widgets, recolours them (per-widget or
// board-wide via AppearancePanel), drops in resources, and pages through a
// multi-page board.
//
// ── Architecture: intents, not repo writes ─────────────────────────────────
// This component NEVER calls the Teach repo directly. It emits typed *intents*
// through a single `onChange(intent)` callback so the lead can wire each to the
// matching repo method (teach.upsertWidgetOnPage / moveWidget / resizeWidget /
// setWidgetAppearance / setBoardTheme / addPage / …). Drag + resize keep their
// own optimistic local state for a smooth gesture and commit ONE intent on
// pointer-up; everything else commits immediately. A localStorage draft
// (`be-board-v1`) mirrors the canvas as a *fallback only* — the real source of
// truth is whatever the parent feeds back through props.
//
// ── Pointer-driven ─────────────────────────────────────────────────────────
// Drag/resize use Pointer events (not mouse-only) so touch works. The canvas
// scrolls internally; the document never scrolls sideways. On tablet/phone the
// appearance panel collapses to a bottom sheet so it can't squeeze the canvas.

"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type {
  Board,
  BoardPage,
  CanvasPosition,
  SubjectId,
  ThemeOverride,
  Widget,
  WidgetType,
} from "@/lib/types";
import {
  BOARD_BASE_THEME,
  clean,
  effective,
  themeVars,
  type EffectiveTheme,
} from "@/lib/teach/widget-theme";
import { widgetDefaultTheme } from "@/lib/teach/widget-defaults";
import {
  BOARD_BACKGROUNDS,
  BOARD_BACKGROUND_CATEGORIES,
  type BoardBackgroundCategory,
  boardBackgroundCss,
  findBackground,
  isDarkBackground,
} from "@/lib/teach/backgrounds";
import {
  WidgetBody,
  widgetMeta,
  TeachIcon,
  CORE_WIDGET_TYPES,
} from "@/components/teach/widgets";
import { AppearancePanel, type ThemeProp } from "./AppearancePanel";
import { useFocusTrap } from "../useFocusTrap";
import styles from "./editor.module.css";

// ── Geometry constants (raw px — geometry numbers are allowed) ──────────────
const MIN_W = 230;
const MAX_W = 640;
const DEFAULT_W = 320;
const LS_KEY = "be-board-v1";

/** Widget types offered in the toolbar "+ Widget" popover. The six CORE
 *  teaching widgets (single source of truth in the catalogue, #18) — every one
 *  an addable survivor, never a retired generic. A "More widgets…" row opens the
 *  full library for everything else; the lead can still override via
 *  `addableTypes`. */
const DEFAULT_ADDABLE: readonly WidgetType[] = CORE_WIDGET_TYPES;

/** A resource entry shown in the picker modal. The lead supplies real ones via
 *  `resources`; these sample items keep the editor usable pre-wiring. */
export interface ResourceItem {
  id: string;
  title: string;
  kind: string;
}
const SAMPLE_RESOURCES: readonly ResourceItem[] = [
  { id: "r1", title: "Verb Tenses Chart", kind: "PDF" },
  { id: "r2", title: "Place Value Slides", kind: "Slides" },
  { id: "r3", title: "Reading Passage 4", kind: "PDF" },
  { id: "r4", title: "Number Line", kind: "Image" },
  { id: "r5", title: "Vocabulary Cards", kind: "PDF" },
  { id: "r6", title: "Lab Safety Video", kind: "Video" },
];

// ── Intent surface (what the LEAD wires to the repo) ────────────────────────

/** Every mutation the editor can request. The parent maps each to a repo call
 *  and feeds the updated `board`/`pages` back through props. Geometry/appearance
 *  intents already carry the page id so the parent never has to guess. */
export type BoardEditorIntent =
  | { type: "selectPage"; pageId: string }
  | { type: "addPage" }
  | {
      type: "addWidget";
      pageId: string;
      widgetType: WidgetType;
      canvas: CanvasPosition;
    }
  | {
      type: "addResource";
      pageId: string;
      resource: ResourceItem;
      canvas: CanvasPosition;
    }
  | {
      type: "moveWidget";
      pageId: string;
      widgetId: string;
      x: number;
      y: number;
    }
  | { type: "resizeWidget"; pageId: string; widgetId: string; w: number }
  | { type: "duplicateWidget"; pageId: string; widgetId: string }
  | { type: "deleteWidget"; pageId: string; widgetId: string }
  | {
      type: "setWidgetAppearance";
      pageId: string;
      widgetId: string;
      appearance: ThemeOverride;
    }
  | { type: "resetWidgetAppearance"; pageId: string; widgetId: string }
  | { type: "setBoardTheme"; theme: ThemeOverride }
  /** Set the board's paper/background id (null → default white paper). */
  | { type: "setBackground"; background: string | null }
  | { type: "clearAllWidgetAppearance" }
  | { type: "present" }
  | { type: "share" }
  | { type: "back" };

export interface BoardEditorProps {
  board: Board;
  pages: BoardPage[];
  activePageId: string;
  /** Emit a mutation/navigation intent. The lead wires this to the repo. */
  onChange: (intent: BoardEditorIntent) => void;
  /** Lesson subject for tinted widget bodies. */
  subjectId?: SubjectId;
  /** Override the toolbar add-widget options. */
  addableTypes?: readonly WidgetType[];
  /** Override the resource picker's items. */
  resources?: readonly ResourceItem[];
  /** Open the full widget library ("More widgets…" in the add-widget popover).
   *  Omitted → the row is hidden and only the core six are offered. */
  onBrowseAll?: () => void;
}

// ── Local optimistic geometry overlay ───────────────────────────────────────
// During a drag/resize the committed prop geometry would lag a pointer move, so
// we keep a short-lived `{x,y,w}` overlay keyed by widget id and clear it once
// the parent's props catch up (or on pointer-up commit).
type GeomDraft = Record<string, Partial<CanvasPosition>>;

/** Resolve a widget's live canvas position, preferring the optimistic draft. */
function liveCanvas(w: Widget, draft: GeomDraft): CanvasPosition {
  const base: CanvasPosition = w.canvas ?? { x: 24, y: 24, w: DEFAULT_W };
  const d = draft[w.id];
  return {
    x: d?.x ?? base.x,
    y: d?.y ?? base.y,
    w: d?.w ?? base.w,
  };
}

const clampW = (w: number) => Math.min(MAX_W, Math.max(MIN_W, w));

// ── One placed widget on the canvas ─────────────────────────────────────────
interface PlacedProps {
  widget: Widget;
  canvas: CanvasPosition;
  selected: boolean;
  present: boolean;
  boardTheme: ThemeOverride | undefined;
  subjectId?: SubjectId;
  onSelect: (id: string) => void;
  onDragStart: (e: ReactPointerEvent, id: string) => void;
  onResizeStart: (e: ReactPointerEvent, id: string) => void;
  /** Keyboard width nudge (±step px), clamped + committed by the parent. */
  onResizeStep: (id: string, delta: number) => void;
  /** Keyboard position nudge (±dx, ±dy px), clamped + committed by the parent. */
  onMoveStep: (id: string, dx: number, dy: number) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

function Placed({
  widget,
  canvas,
  selected,
  present,
  boardTheme,
  subjectId,
  onSelect,
  onDragStart,
  onResizeStart,
  onResizeStep,
  onMoveStep,
  onDuplicate,
  onDelete,
}: PlacedProps): ReactNode {
  const eff = effective(
    widgetDefaultTheme(widget.type),
    boardTheme,
    widget.appearance,
  );
  const twStyle = themeVars(eff) as CSSProperties;
  const label = widgetMeta(widget.type).label;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (present) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(widget.id);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      if (selected) {
        e.preventDefault();
        onDelete(widget.id);
      }
    } else if (
      selected &&
      (e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown")
    ) {
      // Arrow keys nudge the selected widget's position (10px, or 1px with
      // Shift for fine placement). The resize handle has its own focus target
      // and consumes Arrow keys for width — so these never collide.
      e.preventDefault();
      const step = e.shiftKey ? 1 : 10;
      const dx =
        e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      onMoveStep(widget.id, dx, dy);
    }
  };

  return (
    <div
      className={`${styles.placed} ${selected && !present ? styles.placedSel : ""} ${
        present ? styles.present : ""
      }`}
      style={{ left: canvas.x, top: canvas.y, width: canvas.w }}
      role="button"
      tabIndex={present ? -1 : 0}
      aria-label={`${label} widget`}
      aria-pressed={selected}
      onPointerDown={(e) => {
        if (present) return;
        const t = e.target as HTMLElement;
        if (t.closest(`.${styles.tools}`) || t.closest(`.${styles.handle}`)) {
          return;
        }
        e.stopPropagation();
        onSelect(widget.id);
        onDragStart(e, widget.id);
      }}
      onKeyDown={onKeyDown}
    >
      {selected && !present && (
        <div className={styles.tools} role="toolbar" aria-label="Widget tools">
          <span
            className={`${styles.toolBtn} ${styles.toolBtnDrag}`}
            aria-hidden="true"
            title="Drag to move"
          >
            <TeachIcon name="more" size={16} />
          </span>
          <button
            type="button"
            className={styles.toolBtn}
            aria-label="Duplicate widget"
            title="Duplicate"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onDuplicate(widget.id)}
          >
            <TeachIcon name="plus" size={16} />
          </button>
          <button
            type="button"
            className={`${styles.toolBtn} ${styles.toolBtnDanger}`}
            aria-label="Delete widget"
            title="Delete"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onDelete(widget.id)}
          >
            <TeachIcon name="x" size={16} />
          </button>
        </div>
      )}

      <div className={`tw ${styles.twHost}`} style={twStyle}>
        <WidgetBody widget={widget} subjectId={subjectId} />
      </div>

      {selected && !present && (
        <div
          className={styles.handle}
          role="slider"
          aria-label="Resize widget width"
          aria-valuemin={MIN_W}
          aria-valuemax={MAX_W}
          aria-valuenow={Math.round(canvas.w)}
          tabIndex={0}
          onPointerDown={(e) => {
            e.stopPropagation();
            onResizeStart(e, widget.id);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              onResizeStep(widget.id, -10);
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              onResizeStep(widget.id, 10);
            }
          }}
        />
      )}
    </div>
  );
}

// ── Add-widget popover ──────────────────────────────────────────────────────
function AddWidgetPopover({
  types,
  onAdd,
  onMore,
  onClose,
}: {
  types: readonly WidgetType[];
  onAdd: (t: WidgetType) => void;
  /** Open the full widget library. Omitted → the "More widgets…" row hides. */
  onMore?: () => void;
  onClose: () => void;
}): ReactNode {
  return (
    <div
      className={styles.popover}
      role="menu"
      aria-label="Add a widget"
      onPointerLeave={onClose}
    >
      {types.map((t) => {
        const meta = widgetMeta(t);
        return (
          <button
            key={t}
            type="button"
            role="menuitem"
            className={styles.popItem}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onAdd(t)}
          >
            <span className={styles.popIcon}>
              <TeachIcon name={meta.icon} size={18} />
            </span>
            <span className={styles.popLabel}>{meta.label}</span>
          </button>
        );
      })}
      {onMore ? (
        <button
          type="button"
          role="menuitem"
          className={`${styles.popItem} ${styles.popMore}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            onClose();
            onMore();
          }}
        >
          <span className={styles.popIcon}>
            <TeachIcon name="grid" size={18} />
          </span>
          <span className={styles.popLabel}>More widgets…</span>
        </button>
      ) : null}
    </div>
  );
}

// ── Board paper / background picker (board-mode appearance) ─────────────────
// The ONE place a teacher chooses the board's paper. Two distinct axes, each a
// group of toggle buttons (aria-pressed) — NOT a tablist: the category row only
// FILTERS which swatch family shows, while the value group is the actual paper
// choice. "White" is the first value (clears the id → default white paper, C8);
// the swatches are the catalogue. Emits the chosen id up so the parent persists
// `board.background`. (Mixing a value + filters under one role="tablist" gave
// invalid tab semantics — gate G4-1.)
function PaperPicker({
  current,
  onPick,
}: {
  current: string | null;
  onPick: (id: string | null) => void;
}): ReactNode {
  const [tab, setTab] = useState<BoardBackgroundCategory>(
    findBackground(current)?.category ?? "solid",
  );
  const swatches = BOARD_BACKGROUNDS.filter((b) => b.category === tab);
  return (
    <div className={styles.paper}>
      {/* Family filter — which swatch set is shown (a toggle group, not tabs). */}
      <div className={styles.paperTabs} role="group" aria-label="Paper type">
        {BOARD_BACKGROUND_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={tab === c.id}
            className={`${styles.paperTab} ${tab === c.id ? styles.paperTabOn : ""}`}
            onClick={() => setTab(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      {/* The paper VALUE — White (none) + the selected family's swatches. */}
      <div className={styles.paperGrid} role="group" aria-label="Board paper">
        <button
          type="button"
          title="White (no background)"
          aria-label="White (no background)"
          aria-pressed={current === null}
          className={`${styles.paperSw} ${styles.paperNone} ${
            current === null ? styles.paperSwOn : ""
          }`}
          onClick={() => onPick(null)}
        />
        {swatches.map((bg) => {
          const on = current === bg.id;
          return (
            <button
              key={bg.id}
              type="button"
              title={bg.label}
              aria-label={bg.label}
              aria-pressed={on}
              className={`${styles.paperSw} ${on ? styles.paperSwOn : ""}`}
              style={{ ["--swatch-bg" as string]: boardBackgroundCss(bg.id) }}
              onClick={() => onPick(bg.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Resource picker modal ───────────────────────────────────────────────────
function ResourceModal({
  resources,
  onPick,
  onClose,
}: {
  resources: readonly ResourceItem[];
  onPick: (r: ResourceItem) => void;
  onClose: () => void;
}): ReactNode {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHead}>
          <div className={styles.modalTitle} id={titleId}>
            Add a resource
          </div>
          <button
            type="button"
            className={styles.modalClose}
            aria-label="Close"
            onClick={onClose}
          >
            <TeachIcon name="x" size={20} />
          </button>
        </div>
        <div className={styles.modalNote}>
          Drag a resource onto the board, or click to add. Resources stay
          separate — the board just references them.
        </div>
        <div className={styles.resGrid}>
          {resources.map((r) => (
            <button
              key={r.id}
              type="button"
              className={styles.resCard}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/resource", r.id)}
              onClick={() => onPick(r)}
            >
              <div className={styles.resThumb}>
                <TeachIcon name="image" size={28} />
              </div>
              <div className={styles.resTitle}>{r.title}</div>
              <div className={styles.resKind}>{r.kind}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Toolbar button ──────────────────────────────────────────────────────────
function TBtn({
  icon,
  label,
  onClick,
  solid,
  active,
  ariaExpanded,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  solid?: boolean;
  active?: boolean;
  ariaExpanded?: boolean;
}): ReactNode {
  return (
    <button
      type="button"
      className={`${styles.tbtn} ${solid ? styles.solid : ""} ${
        active ? styles.tbtnActive : ""
      }`}
      onClick={onClick}
      aria-label={label}
      aria-expanded={ariaExpanded}
    >
      {icon}
      <span className={styles.tbtnLabel}>{label}</span>
    </button>
  );
}

// ── Editor shell ─────────────────────────────────────────────────────────────
export function BoardEditor({
  board,
  pages,
  activePageId,
  onChange,
  subjectId,
  addableTypes = DEFAULT_ADDABLE,
  resources = SAMPLE_RESOURCES,
  onBrowseAll,
}: BoardEditorProps): ReactNode {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [resOpen, setResOpen] = useState(false);
  const [present, setPresent] = useState(false);
  // The appearance editor opens ON DEMAND only (one popover, never docked) — a
  // clean board is the default; the toolbar "Appearance" button toggles it.
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [geomDraft, setGeomDraft] = useState<GeomDraft>({});
  // Mirror the latest draft into a ref so gesture handlers can read the live
  // position at gesture-start without re-subscribing on every draft update
  // (avoids a stale-base jump when a second drag starts before props echo back).
  const geomDraftRef = useRef<GeomDraft>(geomDraft);
  geomDraftRef.current = geomDraft;
  const canvasRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  // Focus trap for the appearance popover — it declares `aria-modal`, so the
  // contract is that focus is contained + restored while it's open (gate F5).
  const appearanceRef = useRef<HTMLDivElement>(null);
  const appearanceCloseRef = useRef<HTMLButtonElement>(null);

  // The active page (fallback to the first, then an empty implicit page).
  const activePage = useMemo<BoardPage>(() => {
    return (
      pages.find((p) => p.id === activePageId) ??
      pages[0] ?? { id: "page-0", order: 0, widgets: [] }
    );
  }, [pages, activePageId]);

  const widgets = activePage.widgets;
  const selectedWidget = widgets.find((w) => w.id === selectedId) ?? null;

  // Clear the optimistic geometry draft once props reflect the committed value
  // (the parent fed the new canvas back), so the draft never lingers stale.
  useEffect(() => {
    setGeomDraft((d) => {
      if (Object.keys(d).length === 0) return d;
      let changed = false;
      const next: GeomDraft = {};
      for (const w of widgets) {
        const drift = d[w.id];
        if (!drift) continue;
        const c = w.canvas;
        const stillPending =
          (drift.x != null && drift.x !== c?.x) ||
          (drift.y != null && drift.y !== c?.y) ||
          (drift.w != null && drift.w !== c?.w);
        if (stillPending) next[w.id] = drift;
        else changed = true;
      }
      return changed ? next : d;
    });
  }, [widgets]);

  // ── localStorage fallback draft (NOT the source of truth) ──────────────────
  useEffect(() => {
    try {
      window.localStorage.setItem(
        LS_KEY,
        JSON.stringify({
          boardId: board.id,
          activePageId,
          widgets,
          boardTheme: board.boardTheme ?? {},
        }),
      );
    } catch {
      /* storage unavailable (private mode / quota) — fallback only, ignore. */
    }
  }, [board.id, board.boardTheme, activePageId, widgets]);

  // Deselect on Escape (a11y).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedId(null);
        setAddOpen(false);
        setAppearanceOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Trap + restore focus while the appearance popover is open (matches its
  // `aria-modal` semantics). Inert when closed; the hook no-ops if the
  // container isn't mounted yet.
  useFocusTrap({
    containerRef: appearanceRef,
    initialFocusRef: appearanceCloseRef,
    active: !present && appearanceOpen,
  });

  const emit = onChange;

  // ── Drag (pointer) ─────────────────────────────────────────────────────────
  const onDragStart = useCallback(
    (e: ReactPointerEvent, id: string) => {
      const w = widgets.find((x) => x.id === id);
      if (!w) return;
      const start = liveCanvas(w, geomDraftRef.current);
      const sx = e.clientX;
      const sy = e.clientY;
      const ox = start.x;
      const oy = start.y;
      let lastX = ox;
      let lastY = oy;

      const move = (ev: PointerEvent) => {
        lastX = Math.max(0, ox + ev.clientX - sx);
        lastY = Math.max(0, oy + ev.clientY - sy);
        setGeomDraft((d) => ({ ...d, [id]: { ...d[id], x: lastX, y: lastY } }));
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        emit({
          type: "moveWidget",
          pageId: activePage.id,
          widgetId: id,
          x: lastX,
          y: lastY,
        });
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [widgets, activePage.id, emit],
  );

  // ── Resize (pointer) ────────────────────────────────────────────────────────
  const onResizeStart = useCallback(
    (e: ReactPointerEvent, id: string) => {
      const w = widgets.find((x) => x.id === id);
      if (!w) return;
      const start = liveCanvas(w, geomDraftRef.current);
      const sx = e.clientX;
      const ow = start.w;
      let lastW = ow;

      const move = (ev: PointerEvent) => {
        lastW = clampW(ow + ev.clientX - sx);
        setGeomDraft((d) => ({ ...d, [id]: { ...d[id], w: lastW } }));
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        emit({
          type: "resizeWidget",
          pageId: activePage.id,
          widgetId: id,
          w: lastW,
        });
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [widgets, activePage.id, emit],
  );

  // ── Add widget / resource ───────────────────────────────────────────────────
  const addWidget = (t: WidgetType) => {
    emit({
      type: "addWidget",
      pageId: activePage.id,
      widgetType: t,
      canvas: { x: 120, y: 120, w: DEFAULT_W },
    });
    setAddOpen(false);
  };

  const addResource = (r: ResourceItem, x = 160, y = 160) => {
    emit({
      type: "addResource",
      pageId: activePage.id,
      resource: r,
      canvas: { x: Math.max(0, x), y: Math.max(0, y), w: DEFAULT_W },
    });
    setResOpen(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/resource");
    if (!id) return;
    const r = resources.find((x) => x.id === id);
    if (!r) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    const x = rect
      ? e.clientX - rect.left + canvasRef.current!.scrollLeft - 150
      : 160;
    const y = rect
      ? e.clientY - rect.top + canvasRef.current!.scrollTop - 30
      : 160;
    addResource(r, x, y);
  };

  // ── Appearance setters → intents ────────────────────────────────────────────
  const setWidgetProp = <K extends ThemeProp>(
    prop: K,
    value: NonNullable<ThemeOverride[K]>,
  ) => {
    if (!selectedWidget) return;
    const next: ThemeOverride = {
      ...clean(selectedWidget.appearance),
      [prop]: value,
    };
    emit({
      type: "setWidgetAppearance",
      pageId: activePage.id,
      widgetId: selectedWidget.id,
      appearance: next,
    });
  };
  const resetWidget = () => {
    if (!selectedWidget) return;
    emit({
      type: "resetWidgetAppearance",
      pageId: activePage.id,
      widgetId: selectedWidget.id,
    });
  };

  const setBoardProp = <K extends ThemeProp>(
    prop: K,
    value: NonNullable<ThemeOverride[K]>,
  ) => {
    const next: ThemeOverride = { ...clean(board.boardTheme), [prop]: value };
    emit({ type: "setBoardTheme", theme: next });
  };
  const clearAllOverrides = () => emit({ type: "clearAllWidgetAppearance" });

  // Board paper / background (board-mode only). null → default white paper.
  const setBackground = (background: string | null) =>
    emit({ type: "setBackground", background });

  // The board's paper surface. Undefined id → the canvas CSS default (white,
  // C8). Dark fills flag the stage so chrome/empty-hint text can read light.
  const surfaceBg = boardBackgroundCss(board.background);
  const surfaceDark = isDarkBackground(board.background);

  // The effective theme reflected in the panel.
  const panelEff: EffectiveTheme = selectedWidget
    ? effective(
        widgetDefaultTheme(selectedWidget.type),
        board.boardTheme,
        selectedWidget.appearance,
      )
    : { ...BOARD_BASE_THEME, ...clean(board.boardTheme) };

  const panelProps = selectedWidget
    ? {
        effectiveTheme: panelEff,
        widgetSelected: true,
        widgetLabel: widgetMeta(selectedWidget.type).label,
        onSet: setWidgetProp,
        onReset: resetWidget,
      }
    : {
        effectiveTheme: panelEff,
        widgetSelected: false,
        onSet: setBoardProp,
        onReset: clearAllOverrides,
      };

  return (
    <div className={`cp-root ${styles.shell}`}>
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.back}
          aria-label="Back to board library"
          onClick={() => emit({ type: "back" })}
        >
          <BackChevron />
        </button>

        <div className={styles.titleBlock}>
          <div className={styles.boardName} title={board.title}>
            {board.title}
          </div>
          {board.tags && board.tags.length > 0 && (
            <div className={styles.tagRow}>
              {board.tags.map((tag, i) => (
                <span key={`${tag.kind}-${i}`} className={styles.tag}>
                  {tag.label ?? tag.value}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className={styles.toolActions}>
          <div style={{ position: "relative" }}>
            <TBtn
              icon={<TeachIcon name="plus" size={17} />}
              label="Widget"
              ariaExpanded={addOpen}
              onClick={() => setAddOpen((o) => !o)}
            />
            {addOpen && (
              <AddWidgetPopover
                types={addableTypes}
                onAdd={addWidget}
                onMore={onBrowseAll}
                onClose={() => setAddOpen(false)}
              />
            )}
          </div>
          <TBtn
            icon={<TeachIcon name="image" size={17} />}
            label="Resource"
            onClick={() => setResOpen(true)}
          />
          <TBtn
            icon={<TeachIcon name="palette" size={17} />}
            label={selectedWidget ? "Style widget" : "Appearance"}
            active={appearanceOpen}
            ariaExpanded={appearanceOpen}
            onClick={() => setAppearanceOpen((o) => !o)}
          />
          <TBtn
            icon={<TeachIcon name="play" size={15} />}
            label={present ? "Exit" : "Present"}
            active={present}
            onClick={() => {
              setPresent((p) => !p);
              emit({ type: "present" });
            }}
          />
          <TBtn
            icon={<TeachIcon name="expand" size={16} />}
            label="Share"
            solid
            onClick={() => emit({ type: "share" })}
          />
        </div>
      </div>

      {/* ── Page tab bar ────────────────────────────────────────────────── */}
      {!present && (
        <div className={styles.pageBar} role="tablist" aria-label="Board pages">
          {pages.map((p, i) => {
            const isActive = p.id === activePage.id;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`${styles.pageTab} ${isActive ? styles.pageTabActive : ""}`}
                onClick={() => {
                  setSelectedId(null);
                  emit({ type: "selectPage", pageId: p.id });
                }}
              >
                {p.title ?? `Page ${i + 1}`}
              </button>
            );
          })}
          <button
            type="button"
            className={styles.pageAdd}
            aria-label="Add page"
            onClick={() => emit({ type: "addPage" })}
          >
            <TeachIcon name="plus" size={15} />
            Add page
          </button>
        </div>
      )}

      {/* ── Body: canvas + appearance panel ─────────────────────────────── */}
      <div className={styles.body}>
        <div
          ref={canvasRef}
          className={styles.canvas}
          onPointerDown={(e) => {
            // Empty-canvas click (padding around the inner stage) deselects.
            if (e.target === e.currentTarget) setSelectedId(null);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <div
            className={styles.canvasInner}
            data-dark={surfaceDark || undefined}
            style={surfaceBg ? { background: surfaceBg } : undefined}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) setSelectedId(null);
            }}
          >
            {widgets.map((w) => (
              <Placed
                key={w.id}
                widget={w}
                canvas={liveCanvas(w, geomDraft)}
                selected={w.id === selectedId}
                present={present}
                boardTheme={board.boardTheme}
                subjectId={subjectId}
                onSelect={setSelectedId}
                onDragStart={onDragStart}
                onResizeStart={onResizeStart}
                onResizeStep={(id, delta) => {
                  const tw = widgets.find((x) => x.id === id);
                  if (!tw) return;
                  const next = clampW(liveCanvas(tw, geomDraft).w + delta);
                  setGeomDraft((d) => ({ ...d, [id]: { ...d[id], w: next } }));
                  emit({
                    type: "resizeWidget",
                    pageId: activePage.id,
                    widgetId: id,
                    w: next,
                  });
                }}
                onMoveStep={(id, dx, dy) => {
                  const tw = widgets.find((x) => x.id === id);
                  if (!tw) return;
                  const cur = liveCanvas(tw, geomDraft);
                  const nx = Math.max(0, cur.x + dx);
                  const ny = Math.max(0, cur.y + dy);
                  setGeomDraft((d) => ({
                    ...d,
                    [id]: { ...d[id], x: nx, y: ny },
                  }));
                  emit({
                    type: "moveWidget",
                    pageId: activePage.id,
                    widgetId: id,
                    x: nx,
                    y: ny,
                  });
                }}
                onDuplicate={(id) =>
                  emit({
                    type: "duplicateWidget",
                    pageId: activePage.id,
                    widgetId: id,
                  })
                }
                onDelete={(id) => {
                  emit({
                    type: "deleteWidget",
                    pageId: activePage.id,
                    widgetId: id,
                  });
                  setSelectedId(null);
                }}
              />
            ))}
          </div>
        </div>

        {/* No docked panel — the board canvas owns the full body width. The
            appearance editor is an on-demand popover (below), never docked, so a
            board opens clean and content-first (#11, "no crowding"). */}
      </div>

      {/* ── Appearance: ONE on-demand popover (never docked) ─────────────────
          Toggled by the toolbar "Appearance"/"Style widget" button. A floating
          right-side card on desktop, a bottom sheet on phone/tablet (CSS) — both
          gated on the single `appearanceOpen` state. Board mode (nothing
          selected) shows the Paper picker on top + the board-wide theme; widget
          mode styles just the selected widget. */}
      {!present && appearanceOpen && (
        <>
          <div
            className={styles.sheetBackdrop}
            onClick={() => setAppearanceOpen(false)}
          />
          <div
            ref={appearanceRef}
            className={`${styles.panel} ${styles.panelFloat}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
          >
            <div className={styles.panelTopBar}>
              <div className={styles.sheetGrip} aria-hidden="true" />
              <button
                ref={appearanceCloseRef}
                type="button"
                className={styles.panelClose}
                aria-label="Close appearance"
                onClick={() => setAppearanceOpen(false)}
              >
                <TeachIcon name="x" size={18} />
              </button>
            </div>
            <div className={styles.panelScroll}>
              {!selectedWidget && (
                <div className={styles.paperSection}>
                  <div className={styles.paperHead}>Paper</div>
                  <PaperPicker
                    current={board.background ?? null}
                    onPick={setBackground}
                  />
                </div>
              )}
              <AppearancePanel {...panelProps} headingId={headingId} />
            </div>
          </div>
        </>
      )}

      {resOpen && (
        <ResourceModal
          resources={resources}
          onPick={(r) => addResource(r)}
          onClose={() => setResOpen(false)}
        />
      )}
    </div>
  );
}

/** Back chevron — a tiny inline stroke glyph (no left-arrow in TeachIcon set).
 *  Inherits `currentColor`; no hard-coded colour. */
function BackChevron(): ReactNode {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export default BoardEditor;
