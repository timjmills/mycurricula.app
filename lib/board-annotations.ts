// lib/board-annotations.ts — the pure, React-free annotation model + reducer +
// canvas renderer for the Teach board's "projector glass" overlay (plan §5.2).
//
// Everything here is deterministic and unit-testable: no DOM beyond the
// `CanvasRenderingContext2D` the draw helpers receive, no React, no I/O.
// `lib/use-board-annotations.ts` wraps this with state + localStorage + rAF.
//
// COORDINATE MODEL — board-space, normalized 0..1: every point is a fraction of
// the board box, so ink survives a resize and is resolution-independent. The
// renderer converts to device pixels at draw time (box × devicePixelRatio).
//
// ERASER — object eraser (plan §5.2): a hit-test removes whole strokes, never
// pixels. This composes with the redraw-from-model architecture and is cleanly
// undoable.
//
// UNDO/REDO — snapshot history: each committed mutation pushes the full
// `strokes[]` onto an undo stack (capped). At teaching-board stroke counts this
// is trivially cheap and makes undo a pure re-render.

import type { BoardTool } from "./teach/types";

// ── Geometry ────────────────────────────────────────────────────────────────

/** A point in normalized board-space (0..1 of the board box). */
export interface Pt {
  x: number;
  y: number;
}

/** The pixel box of the board the canvas is locked to. */
export interface BoardBox {
  width: number;
  height: number;
}

/** Tools that actually produce a stroke (everything except select/eraser). */
export type StrokeTool = Exclude<BoardTool, "select" | "eraser">;

/** A single committed (or in-progress draft) annotation. */
export interface Stroke {
  id: string;
  tool: StrokeTool;
  /** CSS color string — resolved from a token before it reaches here. */
  color: string;
  /** Stroke width in CSS px at the board's native size. */
  width: number;
  /** 0..1; highlighter defaults lower. Undefined = 1. */
  opacity?: number;
  /** Normalized points. Pen/highlighter = polyline; rect/line/arrow = 2 pts;
   *  text = a single anchor point. */
  points: Pt[];
  /** Text content for the `text` tool. */
  text?: string;
}

/** The persisted document — versioned for forward-compatible migration. */
export interface BoardAnnotations {
  version: 1;
  strokes: Stroke[];
}

export const EMPTY_ANNOTATIONS: BoardAnnotations = { version: 1, strokes: [] };

// ── Reducer state + actions ───────────────────────────────────────────────

const HISTORY_CAP = 50;

/**
 * Reducer state. `strokes` is the live committed document; `draft` is the
 * in-progress stroke during a pointer drag (not yet in history). `undo`/`redo`
 * hold full snapshots of `strokes`.
 */
export interface AnnotationState {
  strokes: Stroke[];
  draft: Stroke | null;
  undo: Stroke[][];
  redo: Stroke[][];
  /** True when the latest reducer action was a HYDRATE (document replaced from
   *  storage / a buffer), false after any real mutation. The persistence layer
   *  reads this to skip echoing a hydrate back to storage / `onChange` while
   *  still persisting a genuine edit that happens to return to the hydrated
   *  baseline (undo / erase-all). Initialised true so the pre-hydrate empty
   *  state is also treated as a non-edit. */
  hydrating: boolean;
}

export function initAnnotationState(
  initial: BoardAnnotations = EMPTY_ANNOTATIONS,
): AnnotationState {
  return {
    strokes: initial.strokes.slice(),
    draft: null,
    undo: [],
    redo: [],
    hydrating: true,
  };
}

export type AnnotationAction =
  /** Replace the whole document (e.g. loaded from storage). Resets history. */
  | { type: "HYDRATE"; annotations: BoardAnnotations }
  /** Commit a fully-formed stroke (e.g. a text stroke). */
  | { type: "ADD"; stroke: Stroke }
  /** Begin a draft stroke (pointer down). */
  | { type: "BEGIN"; stroke: Stroke }
  /** Extend the draft's points (pointer move). */
  | { type: "APPEND"; point: Pt }
  /** Replace the draft's trailing point — used for shape live-preview. */
  | { type: "UPDATE_LAST"; point: Pt }
  /** Commit the current draft into the document (pointer up). */
  | { type: "COMMIT" }
  /** Discard the current draft without committing (e.g. zero-length). */
  | { type: "CANCEL_DRAFT" }
  /** Remove every stroke whose geometry is hit by `point` within `tol`. */
  | { type: "ERASE_AT"; point: Pt; tol: number; box: BoardBox }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "CLEAR" };

/** Push the current strokes onto the undo stack (capped) and clear redo. */
function pushHistory(
  state: AnnotationState,
): Pick<AnnotationState, "undo" | "redo"> {
  const undo = state.undo.concat([state.strokes.slice()]);
  if (undo.length > HISTORY_CAP) undo.shift();
  return { undo, redo: [] };
}

/** The core reducer. Every committing mutation snapshots history first. The
 *  exported `apply` wraps this to maintain the `hydrating` flag by action. */
function reduceAction(
  state: AnnotationState,
  action: AnnotationAction,
): AnnotationState {
  switch (action.type) {
    case "HYDRATE":
      return {
        strokes: action.annotations.strokes.slice(),
        draft: null,
        undo: [],
        redo: [],
        hydrating: true,
      };

    case "ADD": {
      const hist = pushHistory(state);
      return {
        ...state,
        ...hist,
        strokes: state.strokes.concat(action.stroke),
        draft: null,
      };
    }

    case "BEGIN":
      return { ...state, draft: action.stroke };

    case "APPEND":
      if (!state.draft) return state;
      return {
        ...state,
        draft: {
          ...state.draft,
          points: state.draft.points.concat(action.point),
        },
      };

    case "UPDATE_LAST": {
      if (!state.draft) return state;
      const pts = state.draft.points.slice();
      if (pts.length === 0) pts.push(action.point);
      else pts[pts.length - 1] = action.point;
      return { ...state, draft: { ...state.draft, points: pts } };
    }

    case "COMMIT": {
      const draft = state.draft;
      if (!draft || !isDrawableStroke(draft)) {
        return { ...state, draft: null };
      }
      const hist = pushHistory(state);
      return {
        ...state,
        ...hist,
        strokes: state.strokes.concat(draft),
        draft: null,
      };
    }

    case "CANCEL_DRAFT":
      return { ...state, draft: null };

    case "ERASE_AT": {
      const survivors = state.strokes.filter(
        (s) => !strokeHit(s, action.point, action.tol, action.box),
      );
      if (survivors.length === state.strokes.length) return state; // no-op
      const hist = pushHistory(state);
      return { ...state, ...hist, strokes: survivors };
    }

    case "UNDO": {
      if (state.undo.length === 0) return state;
      const undo = state.undo.slice();
      const prev = undo.pop() as Stroke[];
      return {
        ...state,
        strokes: prev,
        undo,
        redo: state.redo.concat([state.strokes.slice()]),
        draft: null,
      };
    }

    case "REDO": {
      if (state.redo.length === 0) return state;
      const redo = state.redo.slice();
      const next = redo.pop() as Stroke[];
      return {
        ...state,
        strokes: next,
        redo,
        undo: state.undo.concat([state.strokes.slice()]),
        draft: null,
      };
    }

    case "CLEAR": {
      if (state.strokes.length === 0 && !state.draft) return state;
      const hist = pushHistory(state);
      return { ...state, ...hist, strokes: [], draft: null };
    }

    default:
      return state;
  }
}

/**
 * The pure reducer. Delegates to `reduceAction`, then stamps the `hydrating`
 * flag by ACTION: true only for HYDRATE, false for every real mutation. A no-op
 * (reducer returned the same state) preserves the existing flag. This lets the
 * persistence layer skip hydrate echoes by action — robustly across any number
 * of re-hydrates — while still persisting a genuine edit that returns the
 * document to the hydrated baseline (undo / erase-all).
 */
export function apply(
  state: AnnotationState,
  action: AnnotationAction,
): AnnotationState {
  const next = reduceAction(state, action);
  if (next === state) return state; // no-op → preserve the existing flag
  const hydrating = action.type === "HYDRATE";
  return next.hydrating === hydrating ? next : { ...next, hydrating };
}

/** Serialize the live document for persistence. */
export function toAnnotations(state: AnnotationState): BoardAnnotations {
  return { version: 1, strokes: state.strokes };
}

/** A stroke is drawable once it has the minimum geometry for its tool. */
export function isDrawableStroke(s: Stroke): boolean {
  switch (s.tool) {
    case "pen":
    case "highlighter":
      return s.points.length >= 2;
    case "rect":
    case "line":
    case "arrow":
      return (
        s.points.length >= 2 &&
        (s.points[0].x !== s.points[1].x || s.points[0].y !== s.points[1].y)
      );
    case "text":
      return !!s.text && s.text.trim().length > 0 && s.points.length >= 1;
    default:
      return false;
  }
}

// ── Hit-testing (object eraser) ───────────────────────────────────────────

/**
 * Whether `point` (normalized) hits stroke `s` within `tol` (normalized). The
 * box is needed to give the tolerance a consistent feel across aspect ratios
 * (we test in normalized space scaled by the box's larger dimension).
 */
export function strokeHit(
  s: Stroke,
  point: Pt,
  tol: number,
  box: BoardBox,
): boolean {
  // Convert normalized tolerance to a single scalar in normalized units,
  // padded by half the stroke width (so wide strokes are easier to hit).
  const longest = Math.max(box.width, box.height) || 1;
  const widthTol = s.width / 2 / longest;
  const reach = tol + widthTol;

  switch (s.tool) {
    case "rect":
      return rectEdgeHit(s.points[0], s.points[1], point, reach);
    case "line":
    case "arrow":
      return (
        s.points.length >= 2 &&
        pointSegDist(point, s.points[0], s.points[1]) <= reach
      );
    case "text":
      // Approximate the text as a small box around its anchor.
      return s.points.length >= 1 && dist(point, s.points[0]) <= reach + 0.04;
    case "pen":
    case "highlighter":
    default:
      return polylineHit(s.points, point, reach);
  }
}

function polylineHit(points: Pt[], p: Pt, reach: number): boolean {
  if (points.length === 0) return false;
  if (points.length === 1) return dist(p, points[0]) <= reach;
  for (let i = 1; i < points.length; i++) {
    if (pointSegDist(p, points[i - 1], points[i]) <= reach) return true;
  }
  return false;
}

/** Hit if the point is near any of the four rectangle edges. */
function rectEdgeHit(a: Pt, b: Pt, p: Pt, reach: number): boolean {
  const tl: Pt = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
  const br: Pt = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
  const tr: Pt = { x: br.x, y: tl.y };
  const bl: Pt = { x: tl.x, y: br.y };
  return (
    pointSegDist(p, tl, tr) <= reach ||
    pointSegDist(p, tr, br) <= reach ||
    pointSegDist(p, br, bl) <= reach ||
    pointSegDist(p, bl, tl) <= reach
  );
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Shortest distance from point `p` to segment `a`–`b` (all normalized). */
export function pointSegDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// ── Rendering ───────────────────────────────────────────────────────────

/** The annotation text size in CSS px. SINGLE SOURCE OF TRUTH (F9): the canvas
 *  renderer uses it (scaled by DPR) AND the AnnotationLayer textarea sets its
 *  inline font-size from it, so the live textarea and the committed stroke can
 *  never desync (the old duplicate `font-size: 22px` literal in
 *  AnnotationLayer.module.css is gone). */
export const DEFAULT_TEXT_PX = 22;

/** Convert a normalized point to device pixels for a box at a given DPR. */
function toDevice(p: Pt, box: BoardBox, dpr: number): { x: number; y: number } {
  return { x: p.x * box.width * dpr, y: p.y * box.height * dpr };
}

/**
 * Draw a single stroke onto `ctx`. Coordinates are scaled from normalized to
 * device pixels (box × dpr). Pen uses quadratic-midpoint smoothing;
 * highlighter is a wide, low-opacity multiply pass; arrow grows a head from the
 * segment angle.
 *
 * The caller is responsible for clearing/setup; this only paints `stroke`.
 */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  box: BoardBox,
  dpr: number,
): void {
  if (stroke.points.length === 0) return;
  const w = Math.max(1, stroke.width) * dpr;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.globalAlpha = stroke.opacity ?? 1;

  switch (stroke.tool) {
    case "highlighter": {
      // Wide + translucent (globalAlpha set above from the 0.4 opacity default)
      // so it reads like a marker over the projected content. We deliberately do
      // NOT use canvas `globalCompositeOperation:"multiply"` (F4): the overlay
      // canvas is transparent, so multiply blends against (0,0,0,0) — which
      // renders the ink invisibly or near-black depending on the browser's
      // premultiplied-alpha handling. Plain source-over at 0.4 alpha is reliable
      // across browsers and still darkens believably where strokes overlap.
      ctx.lineWidth = w * 3;
      drawPolyline(ctx, stroke.points, box, dpr);
      break;
    }
    case "pen": {
      ctx.lineWidth = w;
      drawPolyline(ctx, stroke.points, box, dpr);
      break;
    }
    case "rect": {
      ctx.lineWidth = w;
      const a = toDevice(stroke.points[0], box, dpr);
      const b = toDevice(stroke.points[1] ?? stroke.points[0], box, dpr);
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      break;
    }
    case "line": {
      ctx.lineWidth = w;
      const a = toDevice(stroke.points[0], box, dpr);
      const b = toDevice(stroke.points[1] ?? stroke.points[0], box, dpr);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      break;
    }
    case "arrow": {
      ctx.lineWidth = w;
      const a = toDevice(stroke.points[0], box, dpr);
      const b = toDevice(stroke.points[1] ?? stroke.points[0], box, dpr);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      drawArrowHead(ctx, a, b, w);
      break;
    }
    case "text": {
      const p = toDevice(stroke.points[0], box, dpr);
      const px = DEFAULT_TEXT_PX * dpr;
      ctx.globalCompositeOperation = "source-over";
      ctx.textBaseline = "top";
      // Canvas `font` cannot parse CSS custom properties, so a concrete stack
      // is used (matches the --font-sans fallback chain in tokens.css).
      ctx.font = `600 ${px}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
      for (const [i, line] of (stroke.text ?? "").split("\n").entries()) {
        ctx.fillText(line, p.x, p.y + i * px * 1.25);
      }
      break;
    }
    default:
      break;
  }

  ctx.restore();
}

/** Smooth a polyline with quadratic curves through the midpoints. */
function drawPolyline(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  box: BoardBox,
  dpr: number,
): void {
  if (pts.length === 0) return;
  const d = pts.map((p) => toDevice(p, box, dpr));
  ctx.beginPath();
  if (d.length === 1) {
    // A dot — draw a tiny filled circle so a tap leaves a mark.
    ctx.arc(d[0].x, d[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.moveTo(d[0].x, d[0].y);
  for (let i = 1; i < d.length - 1; i++) {
    const mid = {
      x: (d[i].x + d[i + 1].x) / 2,
      y: (d[i].y + d[i + 1].y) / 2,
    };
    ctx.quadraticCurveTo(d[i].x, d[i].y, mid.x, mid.y);
  }
  const last = d[d.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

/** Draw a filled arrow head at `b`, oriented along a→b. */
function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  w: number,
): void {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const headLen = Math.max(10, w * 3);
  const spread = Math.PI / 7;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(
    b.x - headLen * Math.cos(angle - spread),
    b.y - headLen * Math.sin(angle - spread),
  );
  ctx.lineTo(
    b.x - headLen * Math.cos(angle + spread),
    b.y - headLen * Math.sin(angle + spread),
  );
  ctx.closePath();
  ctx.fill();
}

/**
 * Full repaint: clear the canvas (device-pixel sized) then draw every
 * committed stroke and the live draft on top. The canvas element is sized to
 * `box × dpr` by the caller; this clears that full extent.
 *
 * Kept for callers that want a one-shot repaint; the live hook uses the layered
 * `paintCommitted` + `composite` pair below (F5/F6) so a drag repaints only the
 * draft, not every committed stroke.
 */
export function redraw(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  draft: Stroke | null,
  box: BoardBox,
  dpr: number,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, box.width * dpr, box.height * dpr);
  for (const s of strokes) drawStroke(ctx, s, box, dpr);
  if (draft) drawStroke(ctx, draft, box, dpr);
}

/**
 * Paint ONLY the committed strokes onto a (typically offscreen) layer context,
 * clearing it first. The performance half of F5/F6: the hook caches the result
 * and re-runs this only when the committed document changes (commit / undo /
 * erase / hydrate / resize) — NOT on every pointer sample. The context's canvas
 * must already be sized to `box × dpr`.
 */
export function paintCommitted(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  box: BoardBox,
  dpr: number,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, box.width * dpr, box.height * dpr);
  for (const s of strokes) drawStroke(ctx, s, box, dpr);
}

/**
 * Composite the cached committed layer plus the live draft onto the visible
 * canvas. Called every animation frame during a drag: one `drawImage` blit of
 * the pre-rendered committed layer + a single `drawStroke` for the draft —
 * O(draft) per frame instead of O(committed strokes) (F5/F6). The committed
 * layer must already hold the current committed strokes (see `paintCommitted`).
 */
export function composite(
  ctx: CanvasRenderingContext2D,
  committed: HTMLCanvasElement | null,
  draft: Stroke | null,
  box: BoardBox,
  dpr: number,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, box.width * dpr, box.height * dpr);
  if (committed && committed.width > 0 && committed.height > 0) {
    ctx.drawImage(committed, 0, 0);
  }
  if (draft) drawStroke(ctx, draft, box, dpr);
}
