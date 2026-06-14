"use client";

// components/teach/board/fullscreen/BoardFullscreen.tsx — the full-viewport
// "present" board (5.31 Widget & Boards handoff §5, boardfull.jsx). Run a board
// in front of the class: a full-bleed gradient backdrop, a favorites bar +
// widget library, a markup (annotation) tools panel that docks left or right,
// page nav, and minimal chrome.
//
// PRESENT MODE = READ-ONLY PLACEMENT. The active page's widgets render at their
// stored canvas coords; this surface does NOT move/resize/delete them (that's
// the editor's job). The only mutations it emits are CALLBACKS the lead wires
// to the board repo: `onAddWidget(type)` and `onSelectPage(id)`. Everything
// else — backdrop preset, markup tool/color/strokes, panel side, popup open
// state — is local UI state, exactly as the handoff models it.
//
// ── WHAT IS REUSED vs ADDED ─────────────────────────────────────────────────
// REUSED (the existing annotation engine, lib/use-board-annotations.ts +
// components/teach/annotation/AnnotationLayer):
//   • freehand pen / highlighter strokes (SVG/canvas, coalesced points)
//   • object-eraser (whole-stroke removal on click/drag)
//   • text tool (floating textarea → committed text stroke)
//   • undo / redo / clear history
//   • pointer model (touch-capable, setPointerCapture, touch-action:none)
//   • reduced-motion-safe redraw + per-surface localStorage persistence
// The handoff re-implemented strokes from scratch with mouse-only listeners and
// "x,y" string polylines; we deliberately drop that in favour of the hardened
// engine, which already satisfies the touch + a11y + reduced-motion contract.
//
// ADDED (the fullscreen-specific chrome the engine has no concept of):
//   • the 10-preset backdrop picker (gradient swatches)
//   • the favorites bar + widget-library popup (search + grid → onAddWidget)
//   • the markup panel side-flip (dock left / right) + the 6 color dots wired
//     to the engine's color input
//   • the ‹ N › page nav (driven by the board's pages + onSelectPage)
//   • Esc-to-exit + a focus trap over the whole surface

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import type {
  Board,
  BoardPage,
  SubjectId,
  ThemeOverride,
  Widget,
  WidgetType,
} from "@/lib/types";
import type { BoardTool } from "@/lib/teach/types";
import { effective, themeVars } from "@/lib/teach/widget-theme";
import { widgetDefaultTheme } from "@/lib/teach/widget-defaults";
import {
  annotationStoreKey,
  persistBoardAnnotations,
  readBoardAnnotations,
  useBoardAnnotations,
} from "@/lib/use-board-annotations";
import type { BoardAnnotations } from "@/lib/board-annotations";
import { AnnotationLayer } from "@/components/teach/annotation";
import { WidgetBody } from "@/components/teach/widgets";
import { Button } from "@/components/ui";
import { Glyph, type GlyphName } from "./glyphs";
import styles from "./BoardFullscreen.module.css";

/** JSON of an empty annotation document — the baseline for a page with no saved
 *  ink, so "drew then erased to empty" reads as not-dirty (F1/F2 present-save). */
const EMPTY_ANN_JSON = JSON.stringify({ version: 1, strokes: [] });

// ── Backdrop presets ─────────────────────────────────────────────────────────
//
// THE ONE ALLOWED LITERAL-GRADIENT BLOCK. These are the 5.31 fullscreen
// backdrop presets from the handoff (boardfull.jsx `BGS`). Where a preset
// matches an existing app token we reference the token (the six pastel
// `--wf-*-grad` families + the neutral `--teach-bg-solid-*` swatches already in
// app/tokens.css); only Dusk, Night, and the Dots/Plain neutral fallbacks need
// a literal, which mirrors how tokens.css itself stores these gradient values.
// This is the single documented concentration of literal gradient values in
// this surface — every other colour here is a `var(--token)`.
interface BackdropPreset {
  id: string;
  label: string;
  /** CSS background value (token reference where one matches, else literal). */
  css: string;
  /** True for the dotted-paper preset (adds a radial-dot overlay image). */
  dots?: boolean;
}

const DOT_OVERLAY = "radial-gradient(circle, #d3d8e0 1.4px, transparent 1.4px)";
const DOT_OVERLAY_SIZE = "24px 24px";

const BACKDROPS: readonly BackdropPreset[] = [
  {
    id: "dusk",
    label: "Dusk",
    css: "linear-gradient(160deg, #e9e3fb 0%, #dceafd 45%, #e2f3ea 100%)",
  },
  { id: "cream", label: "Cream", css: "var(--wf-yellow-grad)" },
  { id: "sky", label: "Sky", css: "var(--wf-blue-grad)" },
  { id: "blossom", label: "Blossom", css: "var(--wf-pink-grad)" },
  { id: "mint", label: "Mint", css: "var(--wf-green-grad)" },
  { id: "apricot", label: "Apricot", css: "var(--wf-orange-grad)" },
  { id: "lilac", label: "Lilac", css: "var(--wf-purple-grad)" },
  {
    id: "night",
    label: "Night",
    css: "linear-gradient(160deg, #3c3168 0%, #2a2550 42%, #21566a 100%)",
  },
  { id: "dots", label: "Dots", css: "var(--teach-bg-solid-2)", dots: true },
  { id: "plain", label: "Plain", css: "var(--teach-bg-solid-1)" },
];

function backdropById(id: string): BackdropPreset {
  return BACKDROPS.find((b) => b.id === id) ?? BACKDROPS[0];
}

// ── Markup colours ───────────────────────────────────────────────────────────
//
// The 6 dots from the handoff, mapped to existing app tokens (no literal hex).
// We resolve the token to a concrete CSS value at draw time (the annotation
// engine needs a real colour string for the canvas), via getComputedStyle.
interface MarkupColor {
  id: string;
  token: string;
  label: string;
}
const MARKUP_COLORS: readonly MarkupColor[] = [
  { id: "ink", token: "--ink-900", label: "Black" },
  { id: "blue", token: "--wf-blue-accent", label: "Blue" },
  { id: "pink", token: "--wf-pink-accent", label: "Pink" },
  { id: "green", token: "--wf-green-accent", label: "Green" },
  { id: "orange", token: "--wf-orange-accent", label: "Orange" },
  { id: "purple", token: "--wf-purple-accent", label: "Purple" },
];

// ── Favorites + library specs ────────────────────────────────────────────────
//
// Each entry maps a chip/card to a real `WidgetType` (so `onAddWidget` speaks
// the frozen type vocabulary). Specs the handoff used that have no 1:1 widget
// type fall back to the nearest implemented type, documented inline.
interface WidgetSpec {
  type: WidgetType;
  label: string;
  icon: GlyphName;
}

const FAVORITES: readonly WidgetSpec[] = [
  { type: "text", label: "Text", icon: "textAa" },
  { type: "timer", label: "Timer", icon: "hourglass" },
  { type: "poll", label: "Poll", icon: "grid" },
  { type: "names", label: "Name Picker", icon: "user" },
  { type: "clock", label: "Clock", icon: "clock" },
  { type: "traffic", label: "Traffic", icon: "image" },
];

const LIBRARY: readonly WidgetSpec[] = [
  { type: "text", label: "Text", icon: "textAa" },
  { type: "poll", label: "Poll", icon: "grid" },
  { type: "names", label: "Randomizer", icon: "user" },
  { type: "timer", label: "Timer", icon: "hourglass" },
  { type: "clock", label: "Clock", icon: "clock" },
  { type: "traffic", label: "Traffic Light", icon: "image" },
  { type: "learning-target", label: "Learning Target", icon: "star" },
  { type: "directions", label: "Directions", icon: "grid" },
  { type: "exit-ticket", label: "Exit Ticket", icon: "search" },
  { type: "embed", label: "Image", icon: "image" },
  { type: "soundlevel", label: "Sound Level", icon: "image" },
  { type: "work_symbols", label: "Work Sound", icon: "user" },
  // No dedicated "timetable" widget type yet → nearest is the agenda.
  { type: "agenda", label: "Timetable", icon: "grid" },
  { type: "groups", label: "Groups", icon: "user" },
  { type: "dice", label: "Dice", icon: "grid" },
];
const FAVORITE_TYPES = new Set<WidgetType>(FAVORITES.map((f) => f.type));

// ── Pages helper ───────────────────────────────────────────────────────────

/** Resolve the ordered page list. A board with no explicit `pages` is a single
 *  implicit page built from its flat `widgets` (per the Board type contract). */
function orderedPages(board: Board, pages: BoardPage[]): BoardPage[] {
  if (pages.length > 0) {
    return [...pages].sort((a, b) => a.order - b.order);
  }
  return [{ id: board.id, order: 0, widgets: board.widgets }];
}

// ── Props ──────────────────────────────────────────────────────────────────

export interface BoardFullscreenProps {
  board: Board;
  pages: BoardPage[];
  activePageId: string;
  onExit: () => void;
  onSelectPage: (id: string) => void;
  onAddWidget: (type: WidgetType) => void;
  subjectId?: SubjectId;
}

// `BoardTool` is the annotation engine's tool union (select/pen/highlighter/
// eraser/text/…). The fullscreen panel also has a "sticky" mode that is NOT a
// draw tool — it drops a sticky-note widget on click. We model it as a local
// superset so the active-state highlighting works without polluting BoardTool.
type PanelTool = BoardTool | "sticky";

export function BoardFullscreen({
  board,
  pages,
  activePageId,
  onExit,
  onSelectPage,
  onAddWidget,
  subjectId,
}: BoardFullscreenProps): ReactNode {
  // ── Local UI state (mirrors the handoff's BoardFull state) ────────────────
  // Present opens on clean WHITE paper by default (matches the editor's white
  // sheet + the content-first north star, #11). The teacher can still pick a
  // backdrop from the present fav-bar. Full editor→present paper sync (carrying
  // board.background's exact catalogue paper into present) is a follow-up — the
  // present picker speaks its own preset vocabulary (C9: present = display-only).
  const [bg, setBg] = useState<string>("plain");
  const [tool, setTool] = useState<PanelTool>("select");
  const [colorId, setColorId] = useState<string>("purple");
  const [side, setSide] = useState<"left" | "right">("left");
  const [bgOpen, setBgOpen] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const [libQuery, setLibQuery] = useState("");

  const rootRef = useRef<HTMLDivElement>(null);
  const savePromptRef = useRef<HTMLDivElement>(null);

  const pageList = useMemo(() => orderedPages(board, pages), [board, pages]);
  const activeIndex = Math.max(
    0,
    pageList.findIndex((p) => p.id === activePageId),
  );
  const activePage = pageList[activeIndex] ?? pageList[0];

  // ── Annotation engine (REUSED, EPHEMERAL in present — F1/F2) ───────────────
  // Present-mode ink is EPHEMERAL: it does NOT auto-persist (the owner's rule —
  // presenting + writing must not silently save). It lives in an in-memory
  // per-page session buffer; on exit a "Save these annotations?" prompt either
  // persists every annotated page or discards them. The hook hydrates the active
  // page back FROM the session buffer so navigating pages within one session
  // doesn't lose a page's ink. Persistence is keyed by lesson/board/page exactly
  // like the editing surface, so a saved page's ink reloads there.
  const sessionBuffer = useRef<Map<string, BoardAnnotations>>(new Map());
  // Pages whose previously-SAVED ink we've already attempted to pre-load.
  const seededRef = useRef<Set<string>>(new Set());
  // Per-page BASELINE (JSON of the pre-seeded saved ink, or empty when none).
  // A page is "dirty" only when its current buffer differs from this baseline —
  // so a page that was merely VIEWED (saved ink pre-seeded, nothing drawn) or
  // drawn-then-undone-back-to-baseline is NOT dirty. This (not a monotonic
  // edited-set) drives the exit prompt + which pages Save writes, keeping the
  // saved data in sync with the visible canvas.
  const baselineRef = useRef<Map<string, string>>(new Map());
  // Bumped after an async pre-seed so the hook re-hydrates from the now-filled
  // buffer (the saved ink reappears without a remount).
  const [hydrateNonce, setHydrateNonce] = useState(0);
  const capturePage = useCallback(
    (ann: BoardAnnotations): void => {
      const pid = activePage?.id;
      if (pid != null) sessionBuffer.current.set(pid, ann);
    },
    [activePage?.id],
  );
  const annotations = useBoardAnnotations({
    lessonId: board.masterLessonId,
    boardId: board.id,
    resourceId: activePage?.id ?? null,
    ephemeral: true,
    hydrateFrom: sessionBuffer.current.get(activePage?.id ?? "") ?? null,
    hydrateKey: hydrateNonce,
    onChange: capturePage,
  });
  const [savePrompt, setSavePrompt] = useState(false);

  // Pre-seed the session buffer with a page's previously-SAVED ink the first
  // time it's shown this session (F1/F2 + the write-only-persistence fix): the
  // saved ink reappears in present, and an exit-Save then MERGES with it rather
  // than clobbering. Ephemeral hydrate starts empty, so this async read +
  // hydrateNonce bump fills it. Skips if the teacher already drew on the page
  // (capturePage populated the buffer) so an in-flight read can't clobber it.
  const lessonIdForKey = board.masterLessonId;
  const boardIdForKey = board.id;
  useEffect(() => {
    const pid = activePage?.id;
    if (pid == null || seededRef.current.has(pid)) return;
    // NOTE: mark `seededRef` only AFTER the read resolves, and abort via a
    // per-invocation `cancelled` flag — NOT before. React StrictMode double-
    // invokes this effect in dev (mount → cleanup → mount); marking seeded up
    // front would let the first invocation's cleanup abort its read while the
    // second early-returns on the guard, so the saved ink would never apply.
    let cancelled = false;
    void readBoardAnnotations(
      annotationStoreKey(lessonIdForKey, boardIdForKey, pid),
    ).then((saved) => {
      if (cancelled) return;
      seededRef.current.add(pid);
      // Record the page's baseline (its saved ink, or empty) so dirtiness is a
      // content diff against this, not "was ever touched".
      baselineRef.current.set(
        pid,
        saved && saved.strokes.length > 0 ? JSON.stringify(saved) : EMPTY_ANN_JSON,
      );
      if (!saved || saved.strokes.length === 0) return;
      if (sessionBuffer.current.has(pid)) return; // teacher drew meanwhile
      sessionBuffer.current.set(pid, saved);
      setHydrateNonce((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [activePage?.id, lessonIdForKey, boardIdForKey]);

  // Resolve the active markup color token → a concrete CSS value the canvas
  // renderer can use (the engine needs a concrete colour string, not a token).
  // Initialised to the token's `var()` form; a post-mount effect swaps in the
  // computed value. No literal hex — the fallback is the CSS var reference.
  const [resolvedColor, setResolvedColor] = useState<string>(
    "var(--wf-purple-accent)",
  );
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tokenName =
      MARKUP_COLORS.find((c) => c.id === colorId)?.token ??
      "--wf-purple-accent";
    const value = getComputedStyle(root).getPropertyValue(tokenName).trim();
    if (value) setResolvedColor(value);
  }, [colorId, bg]);

  // The annotation layer only understands real `BoardTool`s. "sticky" is a
  // widget-drop mode handled here, so the layer sees "select" (no draw) while
  // sticky is active; the root-level click handler does the drop.
  const layerTool: BoardTool = tool === "sticky" ? "select" : tool;

  // ── Add a widget (favorites / library / sticky) ───────────────────────────
  const addWidget = useCallback(
    (type: WidgetType) => {
      onAddWidget(type);
      setLibOpen(false);
      setBgOpen(false);
      setTool("select");
    },
    [onAddWidget],
  );

  // Sticky / text-drop on the bare board (sticky drops a sticky-note widget;
  // the text tool itself is handled by the annotation layer, not here).
  const handleRootPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (tool !== "sticky") return;
      // Only drop when the pointer lands on the bare board — never when it lands
      // on the chrome (markup panel, favorites bar, page nav, popups, top
      // buttons). Without this guard, tapping any control while sticky-mode is
      // active would spuriously drop a widget under the chrome.
      const target = e.target as HTMLElement;
      if (target.closest("button, input, textarea, [role='dialog'], a")) {
        return;
      }
      // "text" is the closest widget type for a sticky note today; the lead's
      // repo applies the yellow sticky appearance when wiring onAddWidget.
      addWidget("text");
    },
    [tool, addWidget],
  );

  // ── Present-mode save-prompt (F1/F2) ───────────────────────────────────────
  // Exit is INTERCEPTED: if any page's ink DIFFERS from its baseline, ask Save /
  // Discard / Cancel before leaving. The active page's latest ink is captured
  // into the session buffer via `onChange` (which now also fires when a user
  // undoes back to baseline), so the diff is accurate at exit time.
  const changedPages = useCallback((): string[] => {
    const out: string[] = [];
    for (const [pid, ann] of sessionBuffer.current) {
      const base = baselineRef.current.get(pid) ?? EMPTY_ANN_JSON;
      if (JSON.stringify(ann) !== base) out.push(pid);
    }
    return out;
  }, []);

  const handleExitRequest = useCallback((): void => {
    if (changedPages().length > 0) {
      setSavePrompt(true);
      return;
    }
    onExit();
  }, [changedPages, onExit]);

  const handleDiscard = useCallback((): void => {
    // Ephemeral — nothing was persisted; just leave (the buffer dies on unmount).
    setSavePrompt(false);
    onExit();
  }, [onExit]);

  const [saving, setSaving] = useState(false);
  const handleSave = useCallback((): void => {
    if (saving) return;
    setSaving(true);
    // Persist only the pages whose ink CHANGED vs baseline, under each page's
    // lesson/board/page key. Each buffer value started from that page's saved ink
    // (pre-seed), so this MERGES edits rather than clobbering. A page erased back
    // to empty writes 0 strokes → writeEntry deletes the key.
    const dirty = changedPages();
    const buf = new Map(sessionBuffer.current);
    void (async () => {
      try {
        for (const pageId of dirty) {
          const ann = buf.get(pageId);
          if (!ann) continue;
          await persistBoardAnnotations(
            annotationStoreKey(board.masterLessonId, board.id, pageId),
            ann,
          );
        }
      } finally {
        setSaving(false);
        setSavePrompt(false);
        onExit();
      }
    })();
  }, [saving, changedPages, board.masterLessonId, board.id, onExit]);

  // Move focus into the save-prompt when it opens so a keyboard/SR user lands on
  // its actions (not a chrome control behind the scrim). The Tab trap below
  // scopes to the prompt while it's open so focus can't escape behind it.
  useEffect(() => {
    if (!savePrompt) return;
    savePromptRef.current
      ?.querySelector<HTMLElement>("button")
      ?.focus({ preventScroll: true });
  }, [savePrompt]);

  // ── Esc exits + focus trap ─────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        // CRITICAL: also stop the NATIVE event so the global window-level
        // `useTeachShortcuts` Esc handler (which dispatches setPresent:false and
        // would unmount this surface — destroying the unsaved session buffer
        // before the save-prompt can act) never sees this keypress. Present mode
        // owns Esc.
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        if (savePrompt) {
          // Esc while the save-prompt is open cancels the prompt, not present.
          setSavePrompt(false);
          return;
        }
        if (bgOpen || libOpen) {
          setBgOpen(false);
          setLibOpen(false);
          return;
        }
        handleExitRequest();
        return;
      }
      if (e.key !== "Tab") return;
      // Trap focus inside the surface while present mode is open — and scope the
      // trap to the save-prompt while IT is open so focus can't reach the chrome
      // controls behind the modal scrim (a11y: aria-modal must contain focus).
      const root = savePrompt ? savePromptRef.current : rootRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [bgOpen, libOpen, savePrompt, handleExitRequest],
  );

  // Focus the surface on mount so Esc + the trap work immediately.
  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  // ── Backdrop inline style ─────────────────────────────────────────────────
  const preset = backdropById(bg);
  const backdropStyle: CSSProperties = preset.dots
    ? {
        background: preset.css,
        backgroundImage: DOT_OVERLAY,
        backgroundSize: DOT_OVERLAY_SIZE,
      }
    : { background: preset.css };

  // ── Markup tool buttons ────────────────────────────────────────────────────
  const TOOLS: ReadonlyArray<{
    t: PanelTool;
    icon: GlyphName;
    label: string;
  }> = [
    { t: "select", icon: "cursor", label: "Select" },
    { t: "pen", icon: "pen", label: "Pen" },
    { t: "highlighter", icon: "highlighter", label: "Highlighter" },
    { t: "eraser", icon: "eraser", label: "Eraser" },
    { t: "text", icon: "textAa", label: "Text" },
    { t: "sticky", icon: "sticky", label: "Sticky note" },
  ];

  const filteredLibrary = useMemo(() => {
    const q = libQuery.trim().toLowerCase();
    if (!q) return LIBRARY;
    return LIBRARY.filter((w) => w.label.toLowerCase().includes(q));
  }, [libQuery]);

  const renderSpecIcon = (icon: GlyphName, size = 20): ReactNode => (
    <Glyph name={icon} size={size} />
  );

  return (
    <div
      ref={rootRef}
      className={styles.root}
      style={backdropStyle}
      data-tool={tool}
      role="dialog"
      aria-modal="true"
      aria-label={`Present board: ${board.title}`}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onPointerDown={handleRootPointerDown}
    >
      {/* ── Placed widgets (read-only) ── */}
      <div className={styles.widgetLayer} aria-hidden={false}>
        {activePage?.widgets.map((w) => (
          <PlacedWidget
            key={w.id}
            widget={w}
            boardTheme={board.boardTheme}
            subjectId={subjectId}
          />
        ))}
      </div>

      {/* ── Annotation layer (REUSED engine) ── */}
      <AnnotationLayer
        annotations={annotations}
        tool={layerTool}
        color={resolvedColor}
      />

      {/* ── Top chrome ── */}
      <div className={styles.topLeft}>
        <button
          type="button"
          className={styles.chromeBtn}
          aria-label="Exit present mode and return home"
          onClick={handleExitRequest}
        >
          <Glyph name="home" />
        </button>
      </div>
      <div className={styles.topRight}>
        <button
          type="button"
          className={styles.chromeBtn}
          aria-label="Toggle browser fullscreen"
          onClick={() => {
            if (document.fullscreenElement) {
              void document.exitFullscreen?.();
            } else {
              void rootRef.current?.requestFullscreen?.();
            }
          }}
        >
          <Glyph name="expand" />
        </button>
      </div>

      {/* ── Markup tools panel (docks left / right) ── */}
      <div
        className={`${styles.panel} ${
          side === "left" ? styles.panelLeft : styles.panelRight
        }`}
        role="toolbar"
        aria-label="Markup tools"
        aria-orientation="vertical"
        title="Draw, highlight, and annotate on top of the board"
      >
        <button
          type="button"
          className={styles.panelMove}
          aria-label={`Move tools panel to the ${
            side === "left" ? "right" : "left"
          }`}
          onClick={() => setSide((s) => (s === "left" ? "right" : "left"))}
        >
          <Glyph name={side === "left" ? "arrowR" : "arrowL"} size={18} />
        </button>
        <span className={styles.panelDivider} aria-hidden="true" />

        {TOOLS.map((t) => {
          const active = tool === t.t;
          return (
            <button
              key={t.t}
              type="button"
              className={`${styles.tool} ${active ? styles.toolActive : ""}`}
              aria-label={t.label}
              aria-pressed={active}
              onClick={() => setTool(t.t)}
            >
              {renderSpecIcon(t.icon)}
            </button>
          );
        })}

        <span className={styles.panelDivider} aria-hidden="true" />

        <div
          className={styles.colorGrid}
          role="radiogroup"
          aria-label="Ink color"
        >
          {MARKUP_COLORS.map((c) => {
            const active = colorId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={c.label}
                className={`${styles.colorDot} ${
                  active ? styles.colorDotActive : ""
                }`}
                style={{ background: `var(${c.token})` }}
                onClick={() => setColorId(c.id)}
              />
            );
          })}
        </div>

        <span className={styles.panelDivider} aria-hidden="true" />

        <button
          type="button"
          className={styles.panelAction}
          aria-label="Undo last mark"
          disabled={!annotations.canUndo}
          onClick={annotations.undo}
        >
          <Glyph name="undo" size={18} />
        </button>
        <button
          type="button"
          className={styles.panelAction}
          aria-label="Redo mark"
          disabled={!annotations.canRedo}
          onClick={annotations.redo}
        >
          <Glyph name="redo" size={18} />
        </button>
        <button
          type="button"
          className={styles.panelAction}
          aria-label="Clear all marks"
          onClick={annotations.clear}
        >
          <Glyph name="trash" size={18} />
        </button>
      </div>

      {/* ── Favorites bar (bottom-centre) ── */}
      <div
        className={styles.favBar}
        role="toolbar"
        aria-label="Add widgets and change background"
        title="Add favorite widgets, open the widget library, or change the background"
      >
        <button
          type="button"
          className={`${styles.bgBtn} ${bgOpen ? styles.bgBtnActive : ""}`}
          aria-label="Change board background"
          aria-expanded={bgOpen}
          onClick={() => {
            setBgOpen((o) => !o);
            setLibOpen(false);
          }}
        >
          <Glyph name="image" size={21} />
        </button>

        <span className={styles.favLabel}>
          <Glyph name="star" size={16} />
          <span className={styles.favLabelText}>Favorites</span>
        </span>
        <span className={styles.favSep} aria-hidden="true" />

        {FAVORITES.map((f) => (
          <button
            key={f.type}
            type="button"
            className={styles.favChip}
            aria-label={`Add ${f.label} widget`}
            onClick={() => addWidget(f.type)}
          >
            {renderSpecIcon(f.icon)}
            <span className={styles.favChipLabel}>{f.label}</span>
          </button>
        ))}

        <span className={styles.favSep} aria-hidden="true" />

        <button
          type="button"
          className={styles.libBtn}
          aria-label="Open widget library"
          aria-expanded={libOpen}
          onClick={() => {
            setLibOpen((o) => !o);
            setBgOpen(false);
          }}
        >
          <Glyph name="grid" size={17} /> Library
        </button>
      </div>

      {/* ── Background picker ── */}
      {bgOpen ? (
        <div
          className={`${styles.popup} ${styles.bgPopup}`}
          role="dialog"
          aria-label="Board background"
        >
          <p className={styles.popupTitle}>Board background</p>
          <div className={styles.bgGrid}>
            {BACKDROPS.map((b) => {
              const active = bg === b.id;
              const swatchStyle: CSSProperties = b.dots
                ? {
                    background: b.css,
                    backgroundImage: DOT_OVERLAY,
                    backgroundSize: "10px 10px",
                  }
                : { background: b.css };
              return (
                <button
                  key={b.id}
                  type="button"
                  className={styles.bgSwatch}
                  aria-label={`${b.label} background`}
                  aria-pressed={active}
                  onClick={() => {
                    setBg(b.id);
                    setBgOpen(false);
                  }}
                >
                  <span
                    className={`${styles.bgSwatchChip} ${
                      active ? styles.bgSwatchChipActive : ""
                    }`}
                    style={swatchStyle}
                  />
                  <span className={styles.bgSwatchLabel}>{b.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ── Widget library popup ── */}
      {libOpen ? (
        <div
          className={`${styles.popup} ${styles.libPopup}`}
          role="dialog"
          aria-label="Widget Library"
        >
          <div className={styles.libHeader}>
            <span className={styles.libTitle}>Widget Library</span>
            <label className={styles.libSearch}>
              <Glyph name="search" size={16} />
              <input
                className={styles.libSearchInput}
                type="search"
                placeholder="Search widgets"
                aria-label="Search widgets"
                value={libQuery}
                onChange={(e) => setLibQuery(e.target.value)}
              />
            </label>
            <button
              type="button"
              className={styles.libClose}
              aria-label="Close widget library"
              onClick={() => setLibOpen(false)}
            >
              <Glyph name="close" size={20} />
            </button>
          </div>
          <div className={styles.libGrid}>
            {filteredLibrary.length === 0 ? (
              <p className={styles.libEmpty}>No widgets match “{libQuery}”.</p>
            ) : (
              filteredLibrary.map((w) => {
                const fav = FAVORITE_TYPES.has(w.type);
                return (
                  <button
                    key={`${w.type}-${w.label}`}
                    type="button"
                    className={styles.libCard}
                    aria-label={`Add ${w.label} widget`}
                    onClick={() => addWidget(w.type)}
                  >
                    <span
                      className={`${styles.libStar} ${
                        fav ? styles.libStarFav : ""
                      }`}
                      aria-hidden="true"
                    >
                      <Glyph name="star" size={14} />
                    </span>
                    <span className={styles.libIcon}>
                      {renderSpecIcon(w.icon)}
                    </span>
                    <span className={styles.libCardLabel}>{w.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      {/* ── Page nav (bottom-right) ── */}
      <div
        className={styles.pageNav}
        role="group"
        aria-label="Board pages"
        title="Move between the pages of this board"
      >
        <button
          type="button"
          className={styles.pageBtn}
          aria-label="Previous page"
          disabled={activeIndex <= 0}
          onClick={() => {
            const prev = pageList[activeIndex - 1];
            if (prev) onSelectPage(prev.id);
          }}
        >
          <Glyph name="chevL" size={18} />
        </button>
        <span
          className={styles.pageCount}
          aria-label={`Page ${activeIndex + 1} of ${pageList.length}`}
        >
          {activeIndex + 1}
        </span>
        <button
          type="button"
          className={styles.pageBtn}
          aria-label="Next page"
          disabled={activeIndex >= pageList.length - 1}
          onClick={() => {
            const next = pageList[activeIndex + 1];
            if (next) onSelectPage(next.id);
          }}
        >
          <Glyph name="chevR" size={18} />
        </button>
      </div>

      {/* ── Save-these-annotations prompt (F1/F2) ── */}
      {savePrompt ? (
        <div
          className={styles.savePromptScrim}
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) setSavePrompt(false);
          }}
        >
          <div
            ref={savePromptRef}
            className={styles.savePromptCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="present-save-title"
          >
            <h2 id="present-save-title" className={styles.savePromptTitle}>
              Save these annotations?
            </h2>
            <p className={styles.savePromptText}>
              Keep the ink you drew while presenting, or discard it. Saved ink
              reappears the next time you present this board.
            </p>
            <div className={styles.savePromptRow}>
              <Button
                variant="primary"
                size="sm"
                disabled={saving}
                loading={saving}
                onClick={handleSave}
              >
                Save
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={saving}
                onClick={handleDiscard}
              >
                Discard
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => setSavePrompt(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Placed widget (read-only) ────────────────────────────────────────────────

interface PlacedWidgetProps {
  widget: Widget;
  boardTheme?: ThemeOverride;
  subjectId?: SubjectId;
}

/** One read-only widget at its stored canvas coords, wrapped in the themed
 *  `.tw` tile (same effective-theme resolution as the editor: widget default →
 *  board theme → per-widget override). */
function PlacedWidget({
  widget,
  boardTheme,
  subjectId,
}: PlacedWidgetProps): ReactNode {
  const canvas = widget.canvas;
  const eff = effective(
    widgetDefaultTheme(widget.type),
    boardTheme ?? null,
    widget.appearance,
  );
  const wrapStyle: CSSProperties = {
    left: canvas?.x ?? 0,
    top: canvas?.y ?? 0,
    width: canvas?.w ?? 320,
  };
  return (
    <div className={styles.placed} style={wrapStyle}>
      <div className={styles.tw} style={themeVars(eff) as CSSProperties}>
        <WidgetBody widget={widget} subjectId={subjectId} />
      </div>
    </div>
  );
}
