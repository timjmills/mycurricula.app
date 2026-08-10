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
  SlideElementKind,
  SubjectId,
  ThemeOverride,
  Widget,
  WidgetType,
} from "@/lib/types";
import {
  clampDocHeight,
  DOC_DEFAULT_H,
  DOC_DEFAULT_W,
  DOC_MIN_W,
  elementKindBadge,
  elementKindForResourceKind,
  elementLabel,
  elementText,
  slideElementOf,
} from "@/lib/teach/slide-elements";
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
  SLIDE_ELEMENT_TYPES,
} from "@/components/teach/widgets";
import { AppearancePanel, type ThemeProp } from "./AppearancePanel";
import { useFocusTrap } from "../useFocusTrap";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
// The SAME strict sandbox tier the audited board-embed sink uses for a generic
// link (no `allow-same-origin`, opaque origin). A doc card frames an arbitrary
// teacher-supplied url, so it gets the strict tier — never the trusted-provider
// one, which is reserved for the provider allowlist.
import { GENERIC_LINK_SANDBOX } from "@/lib/board-embed";
import styles from "./editor.module.css";

// ── Geometry constants (raw px — geometry numbers are allowed) ──────────────
const MIN_W = 230;
const MAX_W = 640;
const DEFAULT_W = 320;
const LS_KEY = "be-board-v1";

/** Canvas stage pixel dimensions per size preset (width × height). The outer
 *  `.canvas` scrollable container fits the stage via a CSS scale transform so
 *  the stage always fills the available width without requiring horizontal scroll
 *  on a wide preset. "wide" is the original 16∶9 default; A4 and A3 are
 *  landscape print sizes. */
const STAGE_SIZES = {
  wide: { w: 1280, h: 720 },
  a4: { w: 1123, h: 794 },
  a3: { w: 1587, h: 1123 },
} as const;

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
  /** Public URL when the resource has one — drives the `doc` element's real
   *  `<img>`/`<iframe>` body and its "Open in a new tab" button. Absent → the
   *  card renders its placeholder page, exactly as the handoff does for a
   *  resource with no live url (`teach.jsx:437`). */
  url?: string;
}

/** Pick the element kind a dropped/picked resource lands as (handoff `:236`).
 *  The kind list itself lives in lib/teach/slide-elements.ts so this and the
 *  workspace's intent handler read ONE source. */
function elementKindForResource(r: ResourceItem): SlideElementKind {
  return elementKindForResourceKind(r.kind);
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
  | { type: "deletePage"; pageId: string }
  | { type: "reorderPages"; orderedPageIds: string[] }
  | { type: "renamePage"; pageId: string; title: string }
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
  /** Place a 7.21 SLIDE ELEMENT (text / doc / chip) at `canvas`. Distinct from
   *  `addWidget`/`addResource` because the parent must stamp `config.element` —
   *  the discriminator that makes the placement render as a bare text block /
   *  framed card / pill instead of a widget card. FORWARD-ONLY: this intent only
   *  ever CREATES; it never converts an existing widget. */
  | {
      type: "addElement";
      pageId: string;
      element: SlideElementKind;
      canvas: CanvasPosition;
      /** Present for `doc` / `chip` — the resource the element references. */
      resource?: ResourceItem;
      /** Present for `text` — the initial body (empty for a click-to-type). */
      text?: string;
    }
  /** Commit a `text` element's edited body (contentEditable blur). Separate from
   *  the appearance/geometry intents because it writes `config`, which is the
   *  privacy-sensitive slice — the parent MUST route it through the repo's
   *  `upsertWidgetOnPage`/`commitPages` chokepoint so `stripNames` runs. */
  | {
      type: "updateElementText";
      pageId: string;
      widgetId: string;
      text: string;
    }
  | {
      type: "moveWidget";
      pageId: string;
      widgetId: string;
      x: number;
      y: number;
    }
  /** `h` is only sent by the two-axis `doc` element's corner grip. Omitted (the
   *  width-only handle every widget card uses) means "keep the existing height",
   *  so a width nudge can never flatten a doc a teacher sized. */
  | {
      type: "resizeWidget";
      pageId: string;
      widgetId: string;
      w: number;
      h?: number;
    }
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
  /** Set the board's paper/background id with scope: board-wide or per-page.
   *  `background: null` = explicit white; a paper id = that paper. */
  | {
      type: "setBackground";
      background: string | null;
      scope: "page" | "board";
      pageId?: string;
    }
  /** Clear a PAGE's own background back to inheriting the board (page scope only:
   *  removes the page's `background` key so the tri-state returns to `undefined`).
   *  There is no board-scope twin — a board has nothing to inherit from. */
  | { type: "clearPageBackground"; pageId: string }
  | { type: "setBoardSize"; size: "wide" | "a4" | "a3" }
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
  /** Chromeless mode: render ONLY the canvas/stage — the host shell supplies the
   *  toolbar/filmstrip/present/share chrome (used by the v2 Teach shell, which
   *  wraps the editor in its own header + slide filmstrip + writing bar).
   *  Defaults to false, so the shipped V1 surface is unchanged. */
  embedded?: boolean;
  /** An overlay rendered as the TOP child of the scaled paper (`.canvasInner`),
   *  so it shares the paper's exact rect + fit-scale + scroll offset. The v2
   *  shell mounts its annotation "projector glass" here, so ink normalizes
   *  against the paper the teacher sees (not the outer container) and stays
   *  aligned at every width/zoom. Omitted → nothing extra renders (V1). */
  overlay?: ReactNode;
}

// ── Local optimistic geometry overlay ───────────────────────────────────────
// During a drag/resize the committed prop geometry would lag a pointer move, so
// we keep a short-lived `{x,y,w}` overlay keyed by widget id and clear it once
// the parent's props catch up (or on pointer-up commit).
type GeomDraft = Record<string, Partial<CanvasPosition>>;

/** Resolve a widget's live canvas position, preferring the optimistic draft.
 *  `h` stays OPTIONAL: only a `doc` element carries one, and spreading an
 *  `h: undefined` would be indistinguishable from "explicitly no height" at the
 *  repo seam, so the key is omitted entirely when absent. */
function liveCanvas(w: Widget, draft: GeomDraft): CanvasPosition {
  const base: CanvasPosition = w.canvas ?? { x: 24, y: 24, w: DEFAULT_W };
  const d = draft[w.id];
  const h = d?.h ?? base.h;
  return {
    x: d?.x ?? base.x,
    y: d?.y ?? base.y,
    w: d?.w ?? base.w,
    ...(h != null ? { h } : {}),
  };
}

const clampW = (w: number) => Math.min(MAX_W, Math.max(MIN_W, w));

/** Read a usable scale for the gesture math: a non-finite or ≤0 scale (hidden
 *  canvas, mid-layout) would turn a `delta / scale` into Infinity/NaN and poison
 *  the persisted geometry, so fall back to 1 (un-scaled). */
const safeScale = (s: number): number =>
  Number.isFinite(s) && s > 0 ? s : 1;

// ── One placed widget on the canvas ─────────────────────────────────────────
interface PlacedProps {
  widget: Widget;
  canvas: CanvasPosition;
  /** Current stage bounds — used to clamp the RENDER position so a widget placed
   *  on a larger preset stays reachable after the board shrinks (e.g. wide→a4). */
  stageW: number;
  stageH: number;
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
  stageW,
  stageH,
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

  // Render-time clamp ONLY (no repo write): after the board shrinks (wide→a4/a3),
  // a widget whose stored x/y is past the new stage edge would be unreachable.
  // Clamp left/top into bounds so it stays on-canvas; the stored canvas is left
  // intact, so growing the board back restores the original position. 60px is a
  // safe minimum visible band for height (widget heights vary by content).
  const left = Math.max(0, Math.min(canvas.x, stageW - canvas.w));
  const top = Math.max(0, Math.min(canvas.y, stageH - 60));

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
      style={{ left, top, width: canvas.w }}
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

// ── Slide elements (7.21 handoff `source-home/teach.jsx:416-446`) ───────────
//
// The three placeable kinds render WITHOUT the widget-card chrome — that is the
// whole point of the slide canvas: a teacher drops a line of text or a resource
// onto the paper, not a titled tile. A widget with no `config.element` never
// reaches this branch, so nothing already on a board changes appearance.
//
// EVERY value here is a token or a geometry number. The handoff's raw hex
// (`#1C1B2E` text ink, `#fff` card fill) and its `font:700 19px` are deliberately
// NOT ported — they would fail the legibility contract the moment the board's
// paper went dark, and CLAUDE.md §4 forbids a hard-coded hex or px font-size in
// a component regardless.

interface ElementProps {
  widget: Widget;
  canvas: CanvasPosition;
  kind: SlideElementKind;
  selected: boolean;
  present: boolean;
  onSelect: (id: string) => void;
  /** Begin a move drag from a specific affordance (grip / head / pill). */
  onDragStart: (e: ReactPointerEvent, id: string) => void;
  /** Begin a two-axis resize (doc only). */
  onDocResizeStart: (e: ReactPointerEvent, id: string) => void;
  onDelete: (id: string) => void;
  /** Commit a text element's edited body. */
  onCommitText: (id: string, text: string) => void;
  /** Fill the stage with this doc (session-only — see `presentedId`). */
  onPresent: (id: string) => void;
}

/** `text` — a bare contentEditable block with a hover grip (handoff `:416-424`,
 *  `teach-plus.css:77-84`). Empty on blur removes it, exactly as the handoff
 *  does (`:422`): an empty text box is invisible on a projector, so leaving one
 *  behind would strand an unselectable ghost on the slide. */
function SlideText({
  widget,
  canvas,
  selected,
  present,
  onSelect,
  onDragStart,
  onDelete,
  onCommitText,
}: ElementProps): ReactNode {
  const bodyRef = useRef<HTMLDivElement>(null);
  const text = elementText(widget);

  // Focus a freshly-placed (empty) box on mount so the teacher can just type.
  // Safe to key on emptiness rather than tracking "which id did I just add":
  // an empty text element is deleted on blur, so at most ONE can exist, and it
  // is always the one just created.
  useEffect(() => {
    if (!present && text === "") bodyRef.current?.focus();
    // Mount-only: re-running on `text` would steal focus back mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = (): void => {
    const next = bodyRef.current?.textContent?.trim() ?? "";
    if (next === text) return;
    if (!next) {
      onDelete(widget.id);
      return;
    }
    onCommitText(widget.id, next);
  };

  return (
    <div
      className={`${styles.slideText} ${selected && !present ? styles.slideSel : ""}`}
      style={{ left: canvas.x, top: canvas.y, maxWidth: canvas.w }}
      data-element="text"
    >
      {!present && (
        <span
          className={styles.textGrip}
          title="Drag to move this text around the slide"
          aria-hidden="true"
          onPointerDown={(e) => {
            e.stopPropagation();
            onSelect(widget.id);
            onDragStart(e, widget.id);
          }}
        >
          <TeachIcon name="more" size={14} />
        </span>
      )}
      {/* The committed text is rendered as REAL CHILDREN, not written into the
          node by an effect. That matters twice over:
            • the slide's words are in the server HTML, so a board does not
              paint blank for a frame before an effect fills it in;
            • React only touches a DOM node when its OWN vdom child changes, and
              `text` is this widget's committed value — which cannot change
              while the teacher is typing (the commit happens on blur). So an
              unrelated re-render (someone dragging another card, a selection
              change) is a genuine no-op here and cannot wipe an in-progress
              edit or jump the caret. */}
      <div
        ref={bodyRef}
        className={styles.textBody}
        contentEditable={!present}
        suppressContentEditableWarning
        role="textbox"
        tabIndex={present ? -1 : 0}
        aria-label="Slide text"
        aria-multiline="true"
        // The drag grip owns movement; typing must not start one.
        onPointerDown={(e) => e.stopPropagation()}
        onFocus={() => onSelect(widget.id)}
        onBlur={commit}
        onKeyDown={(e) => {
          // Escape abandons the in-progress edit: put the committed value back
          // in the node (React's vdom still holds it, so it will not fight us)
          // and leave the box. `commit` then sees no change and emits nothing.
          if (e.key === "Escape") {
            e.preventDefault();
            if (bodyRef.current) bodyRef.current.textContent = text;
            bodyRef.current?.blur();
          }
        }}
      >
        {text}
      </div>
      {!present && (
        <button
          type="button"
          className={styles.elX}
          aria-label="Remove this text from the slide"
          title="Remove this text from the slide"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onDelete(widget.id)}
        >
          <TeachIcon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

/** `doc` — a framed, two-axis-resizable resource card (handoff `:425-440`,
 *  `teach-plus.css:27-40`). Real `<img>` / `<iframe>` when the resource has a
 *  live url; otherwise the handoff's placeholder page. */
function SlideDoc({
  widget,
  canvas,
  selected,
  present,
  onSelect,
  onDragStart,
  onDocResizeStart,
  onDelete,
  onPresent,
}: ElementProps): ReactNode {
  const label = elementLabel(widget);
  const badge = elementKindBadge(widget);
  const url = typeof widget.config?.url === "string" ? widget.config.url : "";
  const kind = badge.toLowerCase();
  const isImage = kind === "image";

  return (
    <div
      className={`${styles.slideDoc} ${selected && !present ? styles.slideSel : ""}`}
      style={{
        left: canvas.x,
        top: canvas.y,
        width: canvas.w,
        height: canvas.h ?? DOC_DEFAULT_H,
      }}
      data-element="doc"
    >
      <div
        className={styles.docHead}
        title="Drag to move this card around the slide"
        onPointerDown={(e) => {
          if (present) return;
          const t = e.target as HTMLElement;
          if (t.closest("button")) return;
          e.stopPropagation();
          onSelect(widget.id);
          onDragStart(e, widget.id);
        }}
      >
        {badge && <span className={styles.docBadge}>{badge}</span>}
        <span className={styles.docLabel}>{label}</span>
        {!present && (
          <>
            <Button
              variant="icon"
              size="sm"
              className={styles.docBtn}
              iconAriaLabel="Fill the slide with this resource"
              tooltip="Blow this resource up to fill the whole slide — the class sees it full screen"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onPresent(widget.id)}
            >
              <TeachIcon name="expand" size={14} />
            </Button>
            {url && (
              <Button
                variant="icon"
                size="sm"
                className={styles.docBtn}
                iconAriaLabel="Open this resource in a new tab"
                tooltip="Open the original file in a new browser tab, leaving the slide as it is"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() =>
                  window.open(url, "_blank", "noopener,noreferrer")
                }
              >
                <TeachIcon name="embed" size={14} />
              </Button>
            )}
            <Button
              variant="icon"
              size="sm"
              className={styles.docBtn}
              iconAriaLabel="Remove this resource from the slide"
              tooltip="Take this card off the slide. The resource itself stays in the lesson."
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onDelete(widget.id)}
            >
              <TeachIcon name="x" size={14} />
            </Button>
          </>
        )}
      </div>
      <div className={styles.docBody}>
        {url && isImage ? (
          // A resource url is arbitrary and teacher-supplied; next/image would
          // need every host in `remotePatterns`. Matches the existing resource
          // tiles (components/lesson-flow/resource-tile.tsx).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} draggable={false} />
        ) : url ? (
          <iframe src={url} title={label} sandbox={GENERIC_LINK_SANDBOX} />
        ) : (
          <div className={styles.docPlaceholder} aria-hidden="true">
            <b>{label}</b>
            {Array.from({ length: 6 }).map((_, i) => (
              <i key={i} style={{ width: `${90 - (i % 4) * 16}%` }} />
            ))}
          </div>
        )}
      </div>
      {selected && !present && (
        <span
          className={styles.docResize}
          role="button"
          tabIndex={-1}
          aria-hidden="true"
          title="Drag to resize this card"
          onPointerDown={(e) => {
            e.stopPropagation();
            onDocResizeStart(e, widget.id);
          }}
        />
      )}
    </div>
  );
}

/** `chip` — a small pill: type badge + label + × (handoff `:442-446`). The whole
 *  pill is the drag handle, as in the handoff. */
function SlideChip({
  widget,
  canvas,
  selected,
  present,
  onSelect,
  onDragStart,
  onDelete,
}: ElementProps): ReactNode {
  const label = elementLabel(widget);
  const badge = elementKindBadge(widget);
  return (
    <div
      className={`${styles.slideChip} ${selected && !present ? styles.slideSel : ""}`}
      style={{ left: canvas.x, top: canvas.y }}
      data-element="chip"
      role="button"
      tabIndex={present ? -1 : 0}
      aria-label={`${label}${badge ? ` (${badge})` : ""}`}
      title="Drag to move this link around the slide"
      onPointerDown={(e) => {
        if (present) return;
        const t = e.target as HTMLElement;
        if (t.closest("button")) return;
        e.stopPropagation();
        onSelect(widget.id);
        onDragStart(e, widget.id);
      }}
    >
      {badge && <span className={styles.chipBadge}>{badge}</span>}
      <span className={styles.chipLabel}>{label}</span>
      {!present && (
        <button
          type="button"
          className={styles.elX}
          aria-label="Remove this link from the slide"
          title="Remove this link from the slide"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onDelete(widget.id)}
        >
          <TeachIcon name="x" size={13} />
        </button>
      )}
    </div>
  );
}

/** Dispatch a placed slide element to its renderer. */
function PlacedElement(props: ElementProps): ReactNode {
  if (props.kind === "text") return <SlideText {...props} />;
  if (props.kind === "doc") return <SlideDoc {...props} />;
  return <SlideChip {...props} />;
}

// ── Add popover — Text · Resource · Widget ──────────────────────────────────
// The 7.21 slide canvas puts the two SLIDE ELEMENTS first (a teacher adding
// something to a slide reaches for text or a resource far more often than a
// widget) and keeps the widget catalogue underneath, unchanged. Nothing is
// retired: all 41 widgets remain reachable, six in the core list and the rest
// behind "More widgets…".
function AddWidgetPopover({
  types,
  onAdd,
  onAddText,
  onAddResource,
  onMore,
  onClose,
}: {
  types: readonly WidgetType[];
  onAdd: (t: WidgetType) => void;
  /** Place an empty `text` element at the canvas default and focus it. */
  onAddText: () => void;
  /** Open the resource picker (which places a `doc`/`chip` element). */
  onAddResource: () => void;
  /** Open the full widget library. Omitted → the "More widgets…" row hides. */
  onMore?: () => void;
  onClose: () => void;
}): ReactNode {
  return (
    <div
      className={styles.popover}
      role="menu"
      aria-label="Add to this slide"
      onPointerLeave={onClose}
    >
      <div className={styles.popGroup} role="presentation">
        Add to the slide
      </div>
      {/* Driven by the catalogue's `slideElement` facet, not a second list here
          — so a new element kind is one catalogue edit, with nothing to drift. */}
      {SLIDE_ELEMENT_TYPES.map((meta) => {
        const isText = meta.slideElement?.includes("text") ?? false;
        return (
          <button
            key={meta.type}
            type="button"
            role="menuitem"
            className={styles.popItem}
            title={
              isText
                ? "Drop a line of text straight onto the slide — type into it right away"
                : "Put one of this lesson's resources on the slide as a card the class can see"
            }
            onPointerDown={(e) => e.stopPropagation()}
            onClick={isText ? onAddText : onAddResource}
          >
            <span className={styles.popIcon}>
              <TeachIcon name={meta.icon} size={18} />
            </span>
            <span className={styles.popLabel}>{meta.label}</span>
          </button>
        );
      })}
      <div className={styles.popGroup} role="presentation">
        Widgets
      </div>
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
  onInherit,
}: {
  /** The OWN value of the scope being edited. Tri-state in page scope:
   *  `undefined` → inheriting the board (nothing highlighted); `null` → explicit
   *  White; a paper id → that paper. Board scope only ever passes `null`/id. */
  current: string | null | undefined;
  onPick: (id: string | null) => void;
  /** PAGE scope only: clear the page's own background → inherit the board. When
   *  provided, an "Inherit" chip renders before "White". Omitted in board scope. */
  onInherit?: () => void;
}): ReactNode {
  const [tab, setTab] = useState<BoardBackgroundCategory>(
    findBackground(current)?.category ?? "solid",
  );
  const swatches = BOARD_BACKGROUNDS.filter((b) => b.category === tab);
  // Only highlight "White" when it's the EXPLICIT value (null), not when the page
  // is merely inheriting the board (undefined) — otherwise an inheriting page
  // would look like it had chosen white.
  const whiteSelected = current === null;
  // In page scope, `undefined` means the page is inheriting the board.
  const inheritSelected = current === undefined;
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
      {/* PAGE scope: an "Inherit board" chip that clears the page override. */}
      {onInherit ? (
        <button
          type="button"
          className={`${styles.paperInherit} ${
            inheritSelected ? styles.paperInheritOn : ""
          }`}
          aria-pressed={inheritSelected}
          title="Use the board's background for this page"
          onClick={onInherit}
        >
          Inherit board
        </button>
      ) : null}
      {/* The paper VALUE — White (none) + the selected family's swatches. */}
      <div className={styles.paperGrid} role="group" aria-label="Board paper">
        <button
          type="button"
          title="White (no background)"
          aria-label="White (no background)"
          aria-pressed={whiteSelected}
          className={`${styles.paperSw} ${styles.paperNone} ${
            whiteSelected ? styles.paperSwOn : ""
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

// ── Multi-page filmstrip ─────────────────────────────────────────────────────
// Shows when pages.length >= 2. Each tile is draggable (HTML5 DnD), double-click
// renames, and a delete button shows a two-step confirm on hover.
function PageFilmstrip({
  pages,
  activePage,
  onSelect,
  onAdd,
  onDelete,
  onRename,
  onReorder,
}: {
  pages: BoardPage[];
  activePage: BoardPage;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (pageId: string) => void;
  onRename: (pageId: string, title: string) => void;
  onReorder: (orderedIds: string[]) => void;
}): ReactNode {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const commitRename = (id: string) => {
    const val = renameVal.trim();
    if (val) onRename(id, val);
    setRenamingId(null);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/page-id", id);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const srcId = e.dataTransfer.getData("text/page-id");
    if (!srcId || srcId === targetId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    const ids = pages
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((p) => p.id);
    const from = ids.indexOf(srcId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    ids.splice(from, 1);
    ids.splice(to, 0, srcId);
    onReorder(ids);
    setDraggingId(null);
    setDragOverId(null);
  };

  const sorted = pages.slice().sort((a, b) => a.order - b.order);

  if (pages.length < 2) {
    return (
      <div className={styles.filmstripSingle}>
        <button
          type="button"
          className={styles.pageAdd}
          aria-label="Add page"
          onClick={onAdd}
        >
          <TeachIcon name="plus" size={15} />
          Add page
        </button>
      </div>
    );
  }

  return (
    <div className={styles.filmstrip} role="tablist" aria-label="Board pages">
      {sorted.map((p, i) => {
        const isActive = p.id === activePage.id;
        const isRenaming = renamingId === p.id;
        const confirmingDelete = confirmDeleteId === p.id;
        return (
          <div
            key={p.id}
            className={`${styles.filmTile} ${isActive ? styles.filmTileActive : ""} ${
              draggingId === p.id ? styles.filmTileDragging : ""
            } ${dragOverId === p.id ? styles.filmTileOver : ""}`}
            role="tab"
            aria-selected={isActive}
            // Keyboard-reachable (regression vs the old <button> tabs): the tile
            // itself is the tab — Enter/Space selects it, F2 starts a rename. The
            // nested rename/delete affordances are real <button>s, so they're
            // already in the tab order; this only restores the tile's own.
            tabIndex={isRenaming ? -1 : 0}
            draggable
            onDragStart={(e) => handleDragStart(e, p.id)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverId(p.id);
            }}
            onDragLeave={() => setDragOverId(null)}
            onDrop={(e) => handleDrop(e, p.id)}
            onClick={() => {
              if (!isRenaming) onSelect(p.id);
            }}
            onKeyDown={(e) => {
              if (isRenaming) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(p.id);
              } else if (e.key === "F2") {
                // F2 = the conventional "rename" key (mirrors the double-click).
                e.preventDefault();
                setRenamingId(p.id);
                setRenameVal(p.title ?? `Page ${i + 1}`);
              }
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              setRenamingId(p.id);
              setRenameVal(p.title ?? `Page ${i + 1}`);
            }}
          >
            {isRenaming ? (
              <input
                className={styles.filmRename}
                value={renameVal}
                autoFocus
                onChange={(e) => setRenameVal(e.target.value)}
                onBlur={() => commitRename(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(p.id);
                  if (e.key === "Escape") setRenamingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className={styles.filmLabel}>{p.title ?? `Page ${i + 1}`}</span>
            )}
            {!isRenaming && confirmingDelete ? (
              <span className={styles.filmDelConfirm}>
                <button
                  type="button"
                  className={`${styles.filmDelBtn} ${styles.filmDelConfirmBtn}`}
                  aria-label="Confirm delete page"
                  title="Permanently delete this page and all its widgets"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(p.id);
                    setConfirmDeleteId(null);
                  }}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className={styles.filmDelBtn}
                  aria-label="Cancel delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDeleteId(null);
                  }}
                >
                  ✕
                </button>
              </span>
            ) : !isRenaming ? (
              <button
                type="button"
                className={styles.filmDel}
                aria-label={`Delete page ${i + 1}`}
                title="Delete this page — removes all widgets on it"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDeleteId(p.id);
                }}
              >
                <TeachIcon name="x" size={12} />
              </button>
            ) : null}
          </div>
        );
      })}
      <button
        type="button"
        className={styles.pageAdd}
        aria-label="Add page"
        onClick={onAdd}
      >
        <TeachIcon name="plus" size={15} />
        Add page
      </button>
    </div>
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
  embedded = false,
  overlay,
}: BoardEditorProps): ReactNode {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [resOpen, setResOpen] = useState(false);
  const [present, setPresent] = useState(false);
  // The appearance editor opens ON DEMAND only (one popover, never docked) — a
  // clean board is the default; the toolbar "Appearance" button toggles it.
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  // Background scope: "board" sets board.background; "page" sets activePage.background.
  const [bgScope, setBgScope] = useState<"page" | "board">("board");
  const [geomDraft, setGeomDraft] = useState<GeomDraft>({});
  // A `doc` element blown up to fill the stage (its head's ⤢ button). SESSION
  // ONLY and deliberately so: the handoff persists a presented resource as the
  // board BACKGROUND, but `Board.background` holds a paper id from the Teach
  // background catalogue — widening it to carry a resource reference is a
  // schema-shaped change this forward-only wave does not take. Nothing is lost
  // on exit: the card is still on the slide exactly where it was.
  const [presentedId, setPresentedId] = useState<string | null>(null);
  // Mirror the latest draft into a ref so gesture handlers can read the live
  // position at gesture-start without re-subscribing on every draft update
  // (avoids a stale-base jump when a second drag starts before props echo back).
  const geomDraftRef = useRef<GeomDraft>(geomDraft);
  geomDraftRef.current = geomDraft;
  // Canvas fit-to-width scale. The inner stage has a fixed px size (from STAGE_SIZES);
  // the outer .canvas div is flexible. A ResizeObserver keeps `scale` current so the
  // stage fills the available width without horizontal scroll.
  const [scale, setScale] = useState(1);
  // Use a ref alongside state so gesture handlers read the live scale without
  // stale-closure issues (the pointermove handlers capture the ref, not the state).
  const scaleRef = useRef(1);
  const canvasRef = useRef<HTMLDivElement>(null);
  // The scaled inner stage element — its on-screen rect (post-transform) anchors
  // the resource-drop math so a drop on a shrunken A4/A3 stage lands at the cursor.
  const stageRef = useRef<HTMLDivElement>(null);
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
          (drift.w != null && drift.w !== c?.w) ||
          (drift.h != null && drift.h !== c?.h);
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

  // Deselect on Escape (a11y). Also exits a presented doc, so Escape always
  // means "back out of what I'm in" rather than silently doing nothing there.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedId(null);
        setAddOpen(false);
        setAppearanceOpen(false);
        setPresentedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Canvas fit-to-width (ResizeObserver) ────────────────────────────────────
  // Keep the inner stage fitting the available container width via a CSS scale
  // transform. The outer `.canvas` div is the scroll container; the inner stage
  // has a fixed px width from STAGE_SIZES. On every container resize we recompute
  // the scale factor and store it in both state (for the JSX) and a ref (for
  // gesture handlers that run outside the React render cycle).
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const stage = STAGE_SIZES[board.size ?? "wide"];
    const update = () => {
      // 24px = 12px padding on each side of the stage inside the container.
      const available = el.clientWidth - 24;
      const raw = available / stage.w;
      // Clamp to a sane floor: a hidden/0-width container (clientWidth 0, or
      // narrower than the padding) would yield 0/negative/non-finite, which then
      // poisons the gesture math (delta / scale → Infinity). 0.1 is the floor.
      const s =
        Number.isFinite(raw) && raw > 0 ? Math.min(1, Math.max(0.1, raw)) : 1;
      scaleRef.current = s;
      setScale(s);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [board.size]);

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
        const s = safeScale(scaleRef.current);
        const stage = STAGE_SIZES[board.size ?? "wide"];
        // Divide pointer delta by scale so a 1px screen move = 1px canvas move
        // even when the stage is scaled down. Clamp within stage bounds.
        lastX = Math.max(
          0,
          Math.min(stage.w - start.w, ox + (ev.clientX - sx) / s),
        );
        lastY = Math.max(0, Math.min(stage.h - 80, oy + (ev.clientY - sy) / s));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [widgets, activePage.id, emit, board.size],
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
        const s = safeScale(scaleRef.current);
        // Divide pointer delta by scale so resize tracks the scaled handle.
        lastW = clampW(ow + (ev.clientX - sx) / s);
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

  // ── Two-axis resize — the `doc` element's corner grip ───────────────────────
  // The widget handle above is width-only (a widget card's height flows from its
  // content). A framed doc card must be sized on BOTH axes, so it gets its own
  // gesture that commits `w` AND `h` in one intent. Same scale correction as the
  // width handle: divide the pointer delta by the fit-to-width scale so the grip
  // tracks the cursor on a shrunken A4/A3 stage.
  const onDocResizeStart = useCallback(
    (e: ReactPointerEvent, id: string) => {
      const w = widgets.find((x) => x.id === id);
      if (!w) return;
      const start = liveCanvas(w, geomDraftRef.current);
      const sx = e.clientX;
      const sy = e.clientY;
      const ow = start.w;
      const oh = start.h ?? DOC_DEFAULT_H;
      let lastW = ow;
      let lastH = oh;

      const move = (ev: PointerEvent) => {
        const s = safeScale(scaleRef.current);
        // A doc's floor is 180 (handoff `teach-plus.css:27`), which is BELOW the
        // widget-card floor of 230 — so it uses its own clamp, not `clampW`.
        lastW = Math.min(MAX_W, Math.max(DOC_MIN_W, ow + (ev.clientX - sx) / s));
        lastH = clampDocHeight(oh + (ev.clientY - sy) / s);
        setGeomDraft((d) => ({
          ...d,
          [id]: { ...d[id], w: lastW, h: lastH },
        }));
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        emit({
          type: "resizeWidget",
          pageId: activePage.id,
          widgetId: id,
          w: lastW,
          h: lastH,
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

  // ── Slide-element placement (7.21) ──────────────────────────────────────────
  // A resource now lands as a SLIDE ELEMENT — a framed `doc` card for anything
  // viewable, a `chip` pill for a bare link — matching the handoff's own split
  // (`teach.jsx:236`). The intent carries the element kind; the parent stamps it
  // into `config.element` on a NEW widget. No existing widget is touched.
  /** Cascade successive un-pointed placements instead of stacking them all on
   *  one coordinate, exactly as the handoff does (`teach.jsx:237` —
   *  `70 + items.length * 28`). Without it, adding two things from the picker
   *  puts the second exactly on top of the first, hiding it AND its controls.
   *  Clamped so a busy page cannot walk a placement off the stage. */
  const cascade = (base: number, axis: "x" | "y"): number => {
    const stage = STAGE_SIZES[board.size ?? "wide"];
    const step = widgets.length * 28;
    const limit = (axis === "x" ? stage.w : stage.h) * 0.45;
    return base + Math.min(step, limit);
  };

  const addResource = (r: ResourceItem, x?: number, y?: number) => {
    const kind = elementKindForResource(r);
    const w = kind === "doc" ? DOC_DEFAULT_W : DEFAULT_W;
    emit({
      type: "addElement",
      pageId: activePage.id,
      element: kind,
      resource: r,
      canvas: {
        x: Math.max(0, x ?? cascade(160, "x")),
        y: Math.max(0, y ?? cascade(160, "y")),
        w,
        // Only a doc persists a height; a chip's pill sizes to its content.
        ...(kind === "doc" ? { h: DOC_DEFAULT_H } : {}),
      },
    });
    setResOpen(false);
  };

  /** Place a text element. `text` empty → the box mounts focused and empty, so
   *  the teacher types straight into it (and an untouched box removes itself on
   *  blur, so a stray click can never litter the slide). */
  const addText = (text = "", x?: number, y?: number) => {
    emit({
      type: "addElement",
      pageId: activePage.id,
      element: "text",
      text,
      canvas: {
        x: Math.max(0, x ?? cascade(120, "x")),
        y: Math.max(0, y ?? cascade(120, "y")),
        w: DEFAULT_W,
      },
    });
    setAddOpen(false);
  };

  /** Map a client point to UNSCALED stage coordinates.
   *
   *  Anchors to the SCALED inner stage's on-screen rect (its
   *  `getBoundingClientRect` already reflects the CSS scale transform), then
   *  divides the in-rect offset by the same scale — the same fit-to-width
   *  correction the drag gesture uses. Without it a drop on a shrunken A4/A3
   *  stage lands far from the cursor. Centres a `w`-wide placement under the
   *  pointer and clamps it inside the stage. Returns the canvas defaults when
   *  the stage has not measured yet.
   */
  const stagePoint = (
    clientX: number,
    clientY: number,
    w: number,
  ): { x: number; y: number } => {
    const stage = STAGE_SIZES[board.size ?? "wide"];
    const rect = stageRef.current?.getBoundingClientRect();
    const s = safeScale(scaleRef.current);
    let x = 160;
    let y = 160;
    if (rect) {
      x = (clientX - rect.left) / s - w / 2;
      y = (clientY - rect.top) / s - 30;
    }
    return {
      x: Math.max(0, Math.min(stage.w - w, x)),
      y: Math.max(0, Math.min(stage.h - 80, y)),
    };
  };

  // ── Drop-to-place (handoff `teach.jsx:239-243`) ─────────────────────────────
  // Two payloads are accepted, both PERSISTABLE:
  //   • `text/resource` — a resource id from the picker / lesson rail → doc/chip.
  //   • `text/plain` (or `text/uri-list`) — dropped text → a text element.
  // FILES are deliberately NOT accepted here; see the note on the paste handler.
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/resource");
    if (id) {
      const r = resources.find((x) => x.id === id);
      if (!r) return;
      const w =
        elementKindForResource(r) === "doc" ? DOC_DEFAULT_W : DEFAULT_W;
      const pt = stagePoint(e.clientX, e.clientY, w);
      addResource(r, pt.x, pt.y);
      return;
    }
    const dropped = (
      e.dataTransfer.getData("text/plain") ||
      e.dataTransfer.getData("text/uri-list")
    ).trim();
    if (!dropped) return;
    const pt = stagePoint(e.clientX, e.clientY, DEFAULT_W);
    addText(dropped, pt.x, pt.y);
  };

  // ── Paste-to-place (handoff `teach.jsx:244-245`) ────────────────────────────
  // Pasting text while the canvas has focus drops it onto the slide as a text
  // element. Scoped to the canvas SUBTREE, not the document: a document-level
  // listener would hijack a paste aimed at the page-rename field, the appearance
  // panel, or a widget's own editor. (The handoff gets away with `document`
  // because its prototype has no other inputs on the surface.)
  //
  // FILES ARE DELIBERATELY NOT HANDLED. The handoff's file path builds an
  // `URL.createObjectURL` blob (`teach.jsx:50`) and then strips it again before
  // saving (`:210-212`) — a pasted file survives only until reload. Placing a
  // card that silently empties itself is worse than not offering it. A real
  // board file upload needs a board owner-type in the R2 preflight allowlist
  // (`app/api/resources/upload/route.ts` — another lane's file, and a
  // schema-shaped change). Reported as handed back, not silently dropped.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || present) return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Never steal a paste aimed at a real editable (a text element's own box,
      // an input, a textarea) — that is the teacher typing, not placing.
      if (
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA"
      ) {
        return;
      }
      const text = e.clipboardData?.getData("text/plain")?.trim();
      if (!text) return;
      e.preventDefault();
      addText(text);
    };
    el.addEventListener("paste", onPaste as EventListener);
    return () => el.removeEventListener("paste", onPaste as EventListener);
    // `addText` is re-created every render; re-subscribing on the values it
    // closes over (the page it writes to, the emitter, present mode) is the
    // stable dependency set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage.id, emit, present]);

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

  // Board paper / background. Scoped to either the whole board or the active
  // page only. null → default white paper (for the chosen scope).
  const setBackground = (background: string | null, scope: "page" | "board") =>
    emit({
      type: "setBackground",
      background,
      scope,
      pageId: scope === "page" ? activePage.id : undefined,
    });

  // Clear the active page's own background → it inherits the board again (page
  // scope only; the board has nothing to inherit from).
  const inheritPageBackground = () =>
    emit({ type: "clearPageBackground", pageId: activePage.id });

  // The current stage dimensions (one lookup, reused by the canvas + the
  // render-time widget clamp).
  const stageSize = STAGE_SIZES[board.size ?? "wide"];

  // The presented doc, resolved from the LIVE page rather than held in state, so
  // deleting or paging away from it can never leave a stale overlay pinned over
  // the slide (a stored copy would keep rendering a card that no longer exists).
  const presentedElement =
    presentedId != null
      ? (widgets.find(
          (w) => w.id === presentedId && slideElementOf(w) === "doc",
        ) ?? null)
      : null;
  const presentedUrl =
    presentedElement && typeof presentedElement.config?.url === "string"
      ? presentedElement.config.url
      : "";
  const presentedIsImage =
    presentedElement != null &&
    elementKindBadge(presentedElement).toLowerCase() === "image";

  // The active page's effective background (tri-state, page beats board):
  //   page.background === undefined → inherit board.background
  //   page.background === null      → explicit WHITE (override board)
  //   page.background === "id"      → that paper
  // `?? board.background` would be wrong here: it can't distinguish "inherit"
  // (undefined) from "explicit white" (null), so a page could never override a
  // dark/pattern board back to white. The `!== undefined` check fixes that.
  const effectiveBg =
    activePage.background !== undefined ? activePage.background : board.background;
  const surfaceBg = boardBackgroundCss(effectiveBg);
  const surfaceDark = isDarkBackground(effectiveBg);

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
      {!embedded && (
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
              label="Add"
              ariaExpanded={addOpen}
              onClick={() => setAddOpen((o) => !o)}
            />
            {addOpen && (
              <AddWidgetPopover
                types={addableTypes}
                onAdd={addWidget}
                onAddText={() => addText()}
                onAddResource={() => {
                  setAddOpen(false);
                  setResOpen(true);
                }}
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
      )}

      {/* ── Page filmstrip ──────────────────────────────────────────────── */}
      {!present && !embedded && (
        <PageFilmstrip
          pages={pages}
          activePage={activePage}
          onSelect={(id) => {
            setSelectedId(null);
            emit({ type: "selectPage", pageId: id });
          }}
          onAdd={() => emit({ type: "addPage" })}
          onDelete={(pageId) => emit({ type: "deletePage", pageId })}
          onRename={(pageId, title) => emit({ type: "renamePage", pageId, title })}
          onReorder={(orderedPageIds) => emit({ type: "reorderPages", orderedPageIds })}
        />
      )}

      {/* ── Body: canvas + appearance panel ─────────────────────────────── */}
      <div className={styles.body}>
        {/* EMBEDDED-MODE ADD AFFORDANCE.
            In `embedded` mode the host shell supplies the chrome and the
            editor's own toolbar — where the "+ Add" popover lives — is hidden.
            On the shipped V2 surface that left the TEXT element with no entry
            point at all: the shell's Writing Bar offers Resource and Background,
            not Text. Rather than reach into the shell (another lane's files),
            the editor floats its own trigger over the canvas, so every element
            kind is reachable on the surface teachers actually use. Hidden in
            Present — a projected board carries no authoring chrome. */}
        {embedded && !present && (
          <div className={styles.embeddedAdd}>
            {/* Wrapped in <Tooltip> directly rather than via Button's `tooltip`
                prop: only the Tooltip primitive takes `tooltipId`, and this is
                an onboarding hint a teacher should be able to switch off once
                they know the control (CLAUDE.md §4). */}
            <Tooltip
              content="Put something on this slide — a line of text, a resource, or a widget"
              tooltipId="teach-slide-add"
            >
              <Button
                variant="secondary"
                size="sm"
                leadingIcon={<TeachIcon name="plus" size={15} />}
                aria-expanded={addOpen}
                onClick={() => setAddOpen((o) => !o)}
              >
                Add
              </Button>
            </Tooltip>
            {addOpen && (
              <AddWidgetPopover
                types={addableTypes}
                onAdd={addWidget}
                onAddText={() => addText()}
                onAddResource={() => {
                  setAddOpen(false);
                  setResOpen(true);
                }}
                onMore={onBrowseAll}
                onClose={() => setAddOpen(false)}
              />
            )}
          </div>
        )}
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
          {/* Wrapper that reserves space for the scaled inner stage so the outer
              scroll container sizes correctly (scale doesn't affect layout). */}
          <div
            style={{
              height: stageSize.h * scale + 24,
              position: "relative",
            }}
          >
          <div
            ref={stageRef}
            className={styles.canvasInner}
            data-dark={surfaceDark || undefined}
            style={{
              width: stageSize.w,
              height: stageSize.h,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              ...(surfaceBg ? { background: surfaceBg } : {}),
            }}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) setSelectedId(null);
            }}
          >
            {widgets.map((w) => {
              // 7.21 slide elements render WITHOUT the widget-card chrome. The
              // branch is on `config.element`, which only a NEW placement ever
              // carries — a widget added before this wave has no such key and
              // takes the `Placed` path below, byte-for-byte as before.
              const elementKind = slideElementOf(w);
              if (elementKind) {
                return (
                  <PlacedElement
                    key={w.id}
                    widget={w}
                    kind={elementKind}
                    canvas={liveCanvas(w, geomDraft)}
                    selected={w.id === selectedId}
                    present={present}
                    onSelect={setSelectedId}
                    onDragStart={onDragStart}
                    onDocResizeStart={onDocResizeStart}
                    onPresent={setPresentedId}
                    onCommitText={(id, text) =>
                      emit({
                        type: "updateElementText",
                        pageId: activePage.id,
                        widgetId: id,
                        text,
                      })
                    }
                    onDelete={(id) => {
                      emit({
                        type: "deleteWidget",
                        pageId: activePage.id,
                        widgetId: id,
                      });
                      setSelectedId(null);
                      setPresentedId((p) => (p === id ? null : p));
                    }}
                  />
                );
              }
              return (
              <Placed
                key={w.id}
                widget={w}
                canvas={liveCanvas(w, geomDraft)}
                stageW={stageSize.w}
                stageH={stageSize.h}
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
              );
            })}
            {/* A `doc` element blown up to fill the paper. Session-only (see
                `presentedId`), inside the stage so it inherits the exact rect +
                fit-scale, and BELOW the annotation overlay so a teacher can
                still write over what they are showing. */}
            {presentedElement && (
              <div className={styles.presentFill} data-element="present">
                <div className={styles.presentHead}>
                  <span className={styles.docLabel}>
                    {elementLabel(presentedElement)}
                  </span>
                  <Button
                    variant="icon"
                    size="sm"
                    className={styles.docBtn}
                    iconAriaLabel="Shrink this resource back to its card"
                    tooltip="Put this resource back to card size so the rest of the slide shows again"
                    onClick={() => setPresentedId(null)}
                  >
                    <TeachIcon name="shrink" size={15} />
                  </Button>
                </div>
                <div className={styles.presentBody}>
                  {presentedUrl && presentedIsImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={presentedUrl}
                      alt={elementLabel(presentedElement)}
                      draggable={false}
                    />
                  ) : presentedUrl ? (
                    <iframe
                      src={presentedUrl}
                      title={elementLabel(presentedElement)}
                      sandbox={GENERIC_LINK_SANDBOX}
                    />
                  ) : (
                    <div className={styles.docPlaceholder} aria-hidden="true">
                      <b>{elementLabel(presentedElement)}</b>
                      {Array.from({ length: 10 }).map((_, i) => (
                        <i key={i} style={{ width: `${90 - (i % 4) * 16}%` }} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* Host overlay (v2 annotation glass) — TOP child of the scaled
                paper, so it shares the paper's rect/scale/offset exactly. */}
            {overlay}
          </div>
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
                  {/* Background scope: Whole board vs This page only */}
                  <div
                    className={styles.segCtrl}
                    role="group"
                    aria-label="Apply background to"
                    style={{ marginBottom: "var(--r-8)" }}
                  >
                    {(["board", "page"] as const).map((s) => {
                      const labels: Record<string, string> = {
                        board: "Whole board",
                        page: "This page",
                      };
                      return (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={bgScope === s}
                          className={`${styles.segBtn} ${bgScope === s ? styles.segBtnOn : ""}`}
                          onClick={() => setBgScope(s)}
                        >
                          {labels[s]}
                        </button>
                      );
                    })}
                  </div>
                  <PaperPicker
                    current={
                      bgScope === "page"
                        ? // Page scope: pass the page's OWN value verbatim so an
                          // inheriting page (undefined) highlights "Inherit", while
                          // an explicit white (null) highlights White.
                          activePage.background
                        : (board.background ?? null)
                    }
                    onPick={(bg) => setBackground(bg, bgScope)}
                    // Page scope only: the "Inherit board" chip clears the override.
                    onInherit={
                      bgScope === "page" ? inheritPageBackground : undefined
                    }
                  />
                  {/* Board size segmented control */}
                  <div className={styles.sizeSection}>
                    <div className={styles.sizeLabel}>Size</div>
                    <div
                      className={styles.segCtrl}
                      role="group"
                      aria-label="Board size"
                    >
                      {(["wide", "a4", "a3"] as const).map((s) => {
                        const labels: Record<string, string> = {
                          wide: "16∶9",
                          a4: "A4",
                          a3: "A3",
                        };
                        const on = (board.size ?? "wide") === s;
                        return (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={on}
                            className={`${styles.segBtn} ${on ? styles.segBtnOn : ""}`}
                            onClick={() =>
                              emit({ type: "setBoardSize", size: s })
                            }
                          >
                            {labels[s]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
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
