"use client";

// lib/use-board-annotations.ts — React hook wrapping the pure annotation
// reducer (lib/board-annotations.ts) with localStorage persistence, rAF-batched
// redraw scheduling, pointer→normalized conversion, and DPR canvas sizing
// (plan §5.2, §13.5).
//
// PERSISTENCE: per-teacher, USER-scoped, persists ACROSS SESSIONS (plan §13.5).
// One localStorage blob under `mycurricula:user:teach-annotations`, an object
// sub-keyed by `lessonId:boardId:resourceId` (resourceId "" = the board grid
// itself). Removed only by an explicit Clear. SSR-safe in the
// use-rail-layout.ts mold: initial state is empty so server HTML == first
// client paint; a post-mount effect hydrates from storage.
//
// The `onChange` seam keeps the store decoupled — Phase 4 swaps localStorage
// for the owner-scoped `board_annotations` table with no change here.

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import {
  apply,
  EMPTY_ANNOTATIONS,
  initAnnotationState,
  redraw,
  toAnnotations,
  type AnnotationState,
  type BoardAnnotations,
  type BoardBox,
  type Pt,
  type Stroke,
  type StrokeTool,
} from "./board-annotations";

// ── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "mycurricula:user:teach-annotations";

/** Compose the per-surface storage sub-key. `resourceId` empty/undefined keys
 *  the board grid itself (annotations drawn over the widget board, not a
 *  resource). */
export function annotationStoreKey(
  lessonId: string | null,
  boardId: string | null,
  resourceId: string | null | undefined,
): string {
  return `${lessonId ?? "_"}:${boardId ?? "_"}:${resourceId ?? ""}`;
}

type StoreShape = Record<string, BoardAnnotations>;

function readStore(): StoreShape {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as StoreShape;
    }
    return {};
  } catch {
    return {};
  }
}

function readEntry(subKey: string): BoardAnnotations | null {
  const store = readStore();
  const entry = store[subKey];
  if (
    entry &&
    typeof entry === "object" &&
    entry.version === 1 &&
    Array.isArray(entry.strokes)
  ) {
    return entry;
  }
  return null;
}

function writeEntry(subKey: string, value: BoardAnnotations): void {
  if (typeof window === "undefined") return;
  try {
    const store = readStore();
    if (value.strokes.length === 0) {
      delete store[subKey];
    } else {
      store[subKey] = value;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage disabled / quota exceeded — in-memory state still holds.
  }
}

// ── Pointer / DPR helpers ─────────────────────────────────────────────────

/** Convert a client pointer position to normalized board-space (0..1),
 *  clamped to the box. */
export function clientToNormalized(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): Pt {
  const x = rect.width === 0 ? 0 : (clientX - rect.left) / rect.width;
  const y = rect.height === 0 ? 0 : (clientY - rect.top) / rect.height;
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
  };
}

/** Default per-tool width (CSS px) + opacity. */
function toolDefaults(tool: StrokeTool): { width: number; opacity: number } {
  switch (tool) {
    case "highlighter":
      return { width: 8, opacity: 0.4 };
    case "pen":
      return { width: 3, opacity: 1 };
    case "text":
      return { width: 1, opacity: 1 };
    case "rect":
    case "line":
    case "arrow":
    default:
      return { width: 3, opacity: 1 };
  }
}

// ── Hook ────────────────────────────────────────────────────────────────────

export interface BeginStrokeOpts {
  tool: StrokeTool;
  color: string;
  /** Override width (CSS px). Falls back to the tool default. */
  width?: number;
  /** Override opacity 0..1. Falls back to the tool default. */
  opacity?: number;
  /** Text content (text tool only). */
  text?: string;
}

export interface UseBoardAnnotationsApi {
  /** The committed strokes (live document). */
  strokes: Stroke[];
  /** The in-progress draft stroke, or null. */
  draft: Stroke | null;
  /** Register the canvas element so the hook owns sizing + redraw. */
  attachCanvas: (el: HTMLCanvasElement | null) => void;
  /** Call when the board box changes (resize) — re-sizes + repaints. */
  resize: (box: BoardBox) => void;

  // ── Stroke ops (pointer-driven) ──────────────────────────────────────────
  /** Begin a freehand/shape draft at `point`. */
  beginStroke: (point: Pt, opts: BeginStrokeOpts) => void;
  /** Extend a freehand draft (pen/highlighter). */
  extendStroke: (point: Pt) => void;
  /** Move the draft's trailing point — shape live-preview (rect/line/arrow). */
  updateStrokeEnd: (point: Pt) => void;
  /** Commit the current draft. */
  endStroke: () => void;
  /** Discard the current draft. */
  cancelStroke: () => void;
  /** Commit a finished text stroke at `point`. */
  addText: (point: Pt, text: string, color: string) => void;
  /** Object-erase: remove strokes hit at `point`. */
  eraseAt: (point: Pt) => void;

  // ── History ──────────────────────────────────────────────────────────────
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Destructive — wipe every stroke for this surface. */
  clear: () => void;
}

export interface UseBoardAnnotationsOptions {
  /** Persistence sub-key parts. */
  lessonId: string | null;
  boardId: string | null;
  resourceId?: string | null;
  /** Notified after every committing change (persisted shape). */
  onChange?: (annotations: BoardAnnotations) => void;
}

/**
 * Owns the annotation state for one board/resource surface. The component
 * passes the canvas element via `attachCanvas`; the hook sizes it to
 * box × devicePixelRatio and rAF-batches every repaint.
 */
export function useBoardAnnotations(
  options: UseBoardAnnotationsOptions,
): UseBoardAnnotationsApi {
  const { lessonId, boardId, resourceId, onChange } = options;
  const subKey = annotationStoreKey(lessonId, boardId, resourceId);

  const [state, dispatch] = useReducer(
    apply,
    EMPTY_ANNOTATIONS,
    initAnnotationState,
  );

  // Canvas + box refs. The box is the CSS-pixel size of the board.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<BoardBox>({ width: 0, height: 0 });
  const dprRef = useRef<number>(1);
  const rafRef = useRef<number | null>(null);
  // Latest state captured for the rAF redraw + persistence without stale closures.
  const stateRef = useRef<AnnotationState>(state);
  stateRef.current = state;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // ── Hydrate from storage post-mount (SSR-safe) + on surface change ────────
  useEffect(() => {
    const stored = readEntry(subKey);
    dispatch({ type: "HYDRATE", annotations: stored ?? EMPTY_ANNOTATIONS });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subKey]);

  // ── rAF-batched repaint ───────────────────────────────────────────────────
  const scheduleRedraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const s = stateRef.current;
      redraw(ctx, s.strokes, s.draft, boxRef.current, dprRef.current);
    });
  }, []);

  // Repaint whenever the committed/draft state changes.
  useEffect(() => {
    scheduleRedraw();
  }, [state.strokes, state.draft, scheduleRedraw]);

  // Cancel any pending frame on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Persist on committed-document change (not draft) ──────────────────────
  // Skip the very first run (hydration) so we don't echo the loaded value back.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }
    const annotations = toAnnotations(stateRef.current);
    writeEntry(subKey, annotations);
    onChangeRef.current?.(annotations);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.strokes, subKey]);

  // ── Canvas sizing ─────────────────────────────────────────────────────────
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr =
      typeof window !== "undefined" ? Math.max(1, window.devicePixelRatio) : 1;
    dprRef.current = dpr;
    const { width, height } = boxRef.current;
    const nextW = Math.round(width * dpr);
    const nextH = Math.round(height * dpr);
    if (canvas.width !== nextW || canvas.height !== nextH) {
      canvas.width = nextW;
      canvas.height = nextH;
    }
    scheduleRedraw();
  }, [scheduleRedraw]);

  const attachCanvas = useCallback(
    (el: HTMLCanvasElement | null) => {
      canvasRef.current = el;
      if (el) sizeCanvas();
    },
    [sizeCanvas],
  );

  const resize = useCallback(
    (box: BoardBox) => {
      boxRef.current = box;
      sizeCanvas();
    },
    [sizeCanvas],
  );

  // ── Stroke ops ────────────────────────────────────────────────────────────
  const idCounter = useRef(0);
  const newId = useCallback((): string => {
    idCounter.current += 1;
    return `stroke-${Date.now().toString(36)}-${idCounter.current}`;
  }, []);

  const beginStroke = useCallback(
    (point: Pt, opts: BeginStrokeOpts) => {
      const def = toolDefaults(opts.tool);
      const isShape =
        opts.tool === "rect" || opts.tool === "line" || opts.tool === "arrow";
      const stroke: Stroke = {
        id: newId(),
        tool: opts.tool,
        color: opts.color,
        width: opts.width ?? def.width,
        opacity: opts.opacity ?? def.opacity,
        // Shapes start with two coincident points so UPDATE_LAST can move the
        // second; freehand starts with one and APPENDs.
        points: isShape ? [point, point] : [point],
        text: opts.text,
      };
      dispatch({ type: "BEGIN", stroke });
    },
    [newId],
  );

  const extendStroke = useCallback((point: Pt) => {
    dispatch({ type: "APPEND", point });
  }, []);

  const updateStrokeEnd = useCallback((point: Pt) => {
    dispatch({ type: "UPDATE_LAST", point });
  }, []);

  const endStroke = useCallback(() => {
    dispatch({ type: "COMMIT" });
  }, []);

  const cancelStroke = useCallback(() => {
    dispatch({ type: "CANCEL_DRAFT" });
  }, []);

  const addText = useCallback(
    (point: Pt, text: string, color: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0) return;
      dispatch({
        type: "ADD",
        stroke: {
          id: newId(),
          tool: "text",
          color,
          width: 1,
          opacity: 1,
          points: [point],
          text,
        },
      });
    },
    [newId],
  );

  // Object-eraser tolerance in normalized units (~2% of the board's longer
  // edge) — generous enough to feel forgiving without erasing distant ink.
  const ERASE_TOL = 0.02;
  const eraseAt = useCallback((point: Pt) => {
    dispatch({
      type: "ERASE_AT",
      point,
      tol: ERASE_TOL,
      box: boxRef.current,
    });
  }, []);

  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => dispatch({ type: "REDO" }), []);
  const clear = useCallback(() => dispatch({ type: "CLEAR" }), []);

  return useMemo(
    () => ({
      strokes: state.strokes,
      draft: state.draft,
      attachCanvas,
      resize,
      beginStroke,
      extendStroke,
      updateStrokeEnd,
      endStroke,
      cancelStroke,
      addText,
      eraseAt,
      undo,
      redo,
      canUndo: state.undo.length > 0,
      canRedo: state.redo.length > 0,
      clear,
    }),
    [
      state.strokes,
      state.draft,
      state.undo.length,
      state.redo.length,
      attachCanvas,
      resize,
      beginStroke,
      extendStroke,
      updateStrokeEnd,
      endStroke,
      cancelStroke,
      addText,
      eraseAt,
      undo,
      redo,
      clear,
    ],
  );
}
