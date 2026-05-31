"use client";

// components/teach/annotation/AnnotationLayer.tsx — the absolutely-positioned
// <canvas> overlay over BoardCanvasResource / the board grid (plan §5.2).
//
// PROJECTOR GLASS: the canvas is locked to the board box (same stacking
// context). Ink lives in board-space (normalized), so it survives resize and
// does NOT move when a PDF scrolls inside its iframe — drawing on glass over a
// projector. Content-anchored ink is Phase 2.
//
// POINTER MODEL: a single pointerdown/move/up flow with setPointerCapture +
// getCoalescedEvents() for smooth lines; touch-action:none so a finger draws
// instead of scrolling. When activeTool === "select" the layer is
// pointer-events:none (the underlying iframe/image stays interactive); any draw
// tool flips it to capture.
//
// The layer is presentation only — all state lives in the `useBoardAnnotations`
// hook the parent owns and passes in via `annotations`.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { BoardTool } from "@/lib/teach/types";
import type { Pt } from "@/lib/board-annotations";
import {
  clientToNormalized,
  type UseBoardAnnotationsApi,
} from "@/lib/use-board-annotations";
import styles from "./AnnotationLayer.module.css";

// ── Props ────────────────────────────────────────────────────────────────────

export interface AnnotationLayerProps {
  /** The annotation hook API (state + ops), owned by the parent. */
  annotations: UseBoardAnnotationsApi;
  /** The active drawing tool from the central workspace state. */
  tool: BoardTool;
  /** Resolved CSS color for new strokes (already resolved from a token). */
  color: string;
  /** Stroke width in CSS px for new strokes. */
  width?: number;
  /** Opacity 0..1 override (highlighter uses its tool default otherwise). */
  opacity?: number;
}

/** A committed text-tool entry being typed (the floating <textarea>). */
interface TextDraft {
  /** Normalized anchor. */
  point: Pt;
  /** Pixel position relative to the layer (for the textarea). */
  left: number;
  top: number;
  value: string;
}

export function AnnotationLayer({
  annotations,
  tool,
  color,
  width,
  opacity,
}: AnnotationLayerProps): ReactNode {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);

  const { attachCanvas, resize } = annotations;

  // Bridge the local canvas ref to both the hook (which sizes + paints) and
  // our pointer math.
  const setCanvas = useCallback(
    (el: HTMLCanvasElement | null) => {
      canvasRef.current = el;
      attachCanvas(el);
    },
    [attachCanvas],
  );

  // ── Keep the canvas locked to the board box (ResizeObserver) ──────────────
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const rect = root.getBoundingClientRect();
      resize({ width: rect.width, height: rect.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [resize]);

  const isDrawTool = tool !== "select";

  // ── Pointer → normalized ──────────────────────────────────────────────────
  const normalizedFrom = useCallback(
    (clientX: number, clientY: number): Pt | null => {
      const root = rootRef.current;
      if (!root) return null;
      return clientToNormalized(clientX, clientY, root.getBoundingClientRect());
    },
    [],
  );

  // ── Pointer handlers ──────────────────────────────────────────────────────
  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDrawTool) return;
      // Only the primary button / a touch / pen contact starts a stroke.
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const pt = normalizedFrom(e.clientX, e.clientY);
      if (!pt) return;

      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);

      if (tool === "eraser") {
        annotations.eraseAt(pt);
        drawingRef.current = true;
        return;
      }

      if (tool === "text") {
        // Position a textarea at the click; commit on blur / Enter.
        const root = rootRef.current;
        const rect = root?.getBoundingClientRect();
        setTextDraft({
          point: pt,
          left: rect ? pt.x * rect.width : 0,
          top: rect ? pt.y * rect.height : 0,
          value: "",
        });
        return;
      }

      // pen / highlighter / rect / line / arrow
      annotations.beginStroke(pt, {
        tool,
        color,
        width,
        opacity,
      });
      drawingRef.current = true;
    },
    [annotations, color, isDrawTool, normalizedFrom, opacity, tool, width],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!drawingRef.current) return;

      if (tool === "eraser") {
        const pt = normalizedFrom(e.clientX, e.clientY);
        if (pt) annotations.eraseAt(pt);
        return;
      }

      if (tool === "rect" || tool === "line" || tool === "arrow") {
        // Shapes: move only the trailing point (live preview).
        const pt = normalizedFrom(e.clientX, e.clientY);
        if (pt) annotations.updateStrokeEnd(pt);
        return;
      }

      // Freehand: append every coalesced sample for smooth lines.
      const events =
        typeof e.nativeEvent.getCoalescedEvents === "function"
          ? e.nativeEvent.getCoalescedEvents()
          : [e.nativeEvent];
      for (const ev of events.length ? events : [e.nativeEvent]) {
        const pt = normalizedFrom(ev.clientX, ev.clientY);
        if (pt) annotations.extendStroke(pt);
      }
    },
    [annotations, normalizedFrom, tool],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      if (tool === "eraser") return;
      annotations.endStroke();
    },
    [annotations, tool],
  );

  const handlePointerCancel = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    annotations.cancelStroke();
  }, [annotations]);

  // ── Text draft commit ─────────────────────────────────────────────────────
  const commitText = useCallback(() => {
    if (!textDraft) return;
    annotations.addText(textDraft.point, textDraft.value, color);
    setTextDraft(null);
  }, [annotations, color, textDraft]);

  return (
    <div
      ref={rootRef}
      className={styles.layer}
      data-interactive={isDrawTool ? "true" : undefined}
      data-tool={tool}
      role="img"
      aria-label={
        annotations.strokes.length > 0
          ? `Annotation layer with ${annotations.strokes.length} mark${
              annotations.strokes.length === 1 ? "" : "s"
            }`
          : "Annotation layer (empty)"
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <canvas ref={setCanvas} className={styles.canvas} aria-hidden="true" />

      {/* Text tool — a positioned textarea that commits to a text stroke. */}
      {textDraft ? (
        <textarea
          className={styles.textInput}
          style={{
            left: textDraft.left,
            top: textDraft.top,
            color,
          }}
          value={textDraft.value}
          autoFocus
          aria-label="Type annotation text, press Enter to place it"
          onChange={(e) =>
            setTextDraft((d) => (d ? { ...d, value: e.target.value } : d))
          }
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitText();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setTextDraft(null);
            }
          }}
        />
      ) : null}
    </div>
  );
}
