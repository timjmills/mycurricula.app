"use client";

// lib/use-laser-trail.ts — a transient, fading "laser pointer" overlay for the
// annotation surface (Wave 5b₂). The laser is deliberately NOT part of the
// annotation document: it never commits a stroke, never enters undo/redo, and is
// never persisted. It lives entirely on its own canvas, driven by a time-based
// requestAnimationFrame fade loop, so a teacher can point at projected content
// without leaving any saved marks.
//
// COORDINATE MODEL — board-space normalized 0..1 (same as board-annotations.ts),
// converted to device pixels at draw time so the trail stays crisp at any DPR.

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { BoardBox, Pt } from "./board-annotations";

/** A trail sample: normalized board-space position + capture time (ms). */
interface LaserPoint {
  x: number;
  y: number;
  t: number;
}

/** How long (ms) a trail sample lives before it has fully faded. */
const FADE_MS = 600;
/** Bright head-dot radius + trail width, in CSS px (scaled by DPR at draw). */
const HEAD_RADIUS = 8;
const TRAIL_WIDTH = 5;
/** Glow radius (CSS px) behind the head dot — the "laser" sheen. */
const GLOW = 12;
/** Hard cap on buffered samples (the fade filter also prunes each frame). */
const MAX_POINTS = 120;

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export interface UseLaserTrailApi {
  /** Register the laser canvas element (sizes it to the current box × dpr). */
  attachCanvas: (el: HTMLCanvasElement | null) => void;
  /** Notify of a board-box (CSS px) change — re-sizes the canvas to box × dpr. */
  resize: (box: BoardBox) => void;
  /** Add a trail sample (normalized board-space). (Re)starts the fade loop. */
  push: (pt: Pt) => void;
}

/**
 * Owns the laser overlay for one annotation surface. `color` is the laser hue
 * (the surface's current ink colour, already resolved to a CSS value); the
 * latest value is captured per render via a ref so a still-running fade always
 * paints the current colour.
 */
export function useLaserTrail(color: string): UseLaserTrailApi {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<BoardBox>({ width: 0, height: 0 });
  const dprRef = useRef<number>(1);
  const pointsRef = useRef<LaserPoint[]>([]);
  const rafRef = useRef<number | null>(null);
  const colorRef = useRef(color);
  colorRef.current = color;

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
  }, []);

  // One animation frame: prune faded samples, repaint the trail + head, and
  // re-schedule while any sample remains. `rafRef` is consumed (set null) on
  // entry and only re-armed at the end if there is still something to draw, so
  // the loop self-stops when the trail empties.
  const drawFrame = useCallback(() => {
    rafRef.current = null;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      pointsRef.current = [];
      return;
    }
    const { width, height } = boxRef.current;
    const dpr = dprRef.current;
    const now = nowMs();
    const pts = pointsRef.current.filter((p) => now - p.t < FADE_MS);
    pointsRef.current = pts;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width * dpr, height * dpr);
    if (pts.length === 0) return; // fully faded → stop the loop

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = colorRef.current;
    ctx.fillStyle = colorRef.current;

    // Trail — each segment fades with the age of its newer endpoint.
    ctx.lineWidth = TRAIL_WIDTH * dpr;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      ctx.globalAlpha = Math.max(0, 1 - (now - b.t) / FADE_MS) * 0.55;
      ctx.beginPath();
      ctx.moveTo(a.x * width * dpr, a.y * height * dpr);
      ctx.lineTo(b.x * width * dpr, b.y * height * dpr);
      ctx.stroke();
    }

    // Head — a bright, glowing dot at the most recent sample.
    const head = pts[pts.length - 1];
    ctx.globalAlpha = Math.max(0, 1 - (now - head.t) / FADE_MS);
    ctx.shadowColor = colorRef.current;
    ctx.shadowBlur = GLOW * dpr;
    ctx.beginPath();
    ctx.arc(head.x * width * dpr, head.y * height * dpr, HEAD_RADIUS * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    rafRef.current = requestAnimationFrame(drawFrame);
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(drawFrame);
    }
  }, [drawFrame]);

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

  const push = useCallback(
    (pt: Pt) => {
      pointsRef.current.push({ x: pt.x, y: pt.y, t: nowMs() });
      if (pointsRef.current.length > MAX_POINTS) {
        pointsRef.current.splice(0, pointsRef.current.length - MAX_POINTS);
      }
      startLoop();
    },
    [startLoop],
  );

  // Cancel the fade loop on unmount (and clear the ref so nothing dangles).
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  return useMemo(
    () => ({ attachCanvas, resize, push }),
    [attachCanvas, resize, push],
  );
}
