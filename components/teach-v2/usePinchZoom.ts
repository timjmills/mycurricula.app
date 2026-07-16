"use client";

// components/teach-v2/usePinchZoom.ts — a self-contained two-finger pinch-zoom
// gesture for the v2 board stage (Wave 11 NET-NEW: the artboard is mouse-only).
//
// DESIGN — never fight the single-pointer engines. A pinch needs TWO active
// pointers; this hook only acts once a second pointer lands, so a one-finger
// drag/draw flows straight through to BoardEditor / the annotation layer
// untouched (we don't call setPointerCapture and we don't preventDefault on the
// first pointer). While two pointers are down we scale from the gesture's
// midpoint (transform-origin), clamped to [MIN_SCALE, MAX_SCALE]. Applied as a
// CSS transform on a zoom-wrapper OUTSIDE BoardEditor's measured container, so
// its internal fit-to-width ResizeObserver math is unaffected.
//
// Scale is clamped through the same `safeScale` discipline the editor uses: a
// non-finite ratio can never poison the transform.

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

const MIN_SCALE = 1;
const MAX_SCALE = 3;

/** Clamp to a usable scale — a non-finite / out-of-range value falls back to the
 *  identity 1 rather than poisoning the transform (mirrors BoardEditor). */
function clampScale(s: number): number {
  if (!Number.isFinite(s)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

export interface PinchZoomState {
  /** Current zoom factor (1 = un-zoomed). */
  scale: number;
  /** transform-origin, as a percentage of the target box. */
  originX: number;
  originY: number;
}

export interface PinchZoomApi extends PinchZoomState {
  /** Whether the board is currently zoomed in (drives a "Reset zoom" affordance). */
  zoomed: boolean;
  /** Pointer handlers to spread onto the zoom target element. */
  handlers: {
    onPointerDown: (e: ReactPointerEvent) => void;
    onPointerMove: (e: ReactPointerEvent) => void;
    onPointerUp: (e: ReactPointerEvent) => void;
    onPointerCancel: (e: ReactPointerEvent) => void;
    onPointerLeave: (e: ReactPointerEvent) => void;
    onLostPointerCapture: (e: ReactPointerEvent) => void;
  };
  /** Reset to the un-zoomed identity. */
  reset: () => void;
}

interface ActivePointer {
  x: number;
  y: number;
}

/** Two-finger pinch-zoom. Returns the live transform + handlers to bind.
 *  `onPinchStart` fires the moment a SECOND pointer lands — the host wires it to
 *  cancel any in-progress annotation draft, so a pinch with a draw tool active
 *  can't leave a stray stroke from the first finger (BUG-2). */
export function usePinchZoom(onPinchStart?: () => void): PinchZoomApi {
  const [state, setState] = useState<PinchZoomState>({
    scale: 1,
    originX: 50,
    originY: 50,
  });
  // Live pointer set (id → last client position) + the gesture baseline.
  const pointers = useRef<Map<number, ActivePointer>>(new Map());
  const gesture = useRef<{ startDist: number; startScale: number } | null>(
    null,
  );

  const targetRef = useRef<HTMLElement | null>(null);

  const twoPointerCenter = useCallback((): {
    dist: number;
    cx: number;
    cy: number;
  } | null => {
    const pts = [...pointers.current.values()];
    if (pts.length < 2) return null;
    const [a, b] = pts;
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return {
      dist: Math.hypot(dx, dy),
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
    };
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent): void => {
      // Only touch/pen contacts pinch — a mouse never has two pointers.
      if (e.pointerType === "mouse") return;
      targetRef.current = e.currentTarget as HTMLElement;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // The gesture only begins on the SECOND pointer, so the first pointer's
      // event still reaches the underlying board (no capture, no preventDefault).
      if (pointers.current.size === 2) {
        const c = twoPointerCenter();
        if (c) gesture.current = { startDist: c.dist, startScale: state.scale };
        // Discard any annotation draft the first finger started, so pinching
        // with a draw tool active leaves no stray stroke (BUG-2).
        onPinchStart?.();
      }
    },
    [state.scale, twoPointerCenter, onPinchStart],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent): void => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = gesture.current;
      if (!g || pointers.current.size < 2) return;
      const c = twoPointerCenter();
      const target = targetRef.current;
      if (!c || !target || g.startDist <= 0) return;
      // Two fingers own the surface now — stop the board from also reacting.
      e.preventDefault();
      const nextScale = clampScale((g.startScale * c.dist) / g.startDist);
      const rect = target.getBoundingClientRect();
      const originX = rect.width > 0 ? ((c.cx - rect.left) / rect.width) * 100 : 50;
      const originY =
        rect.height > 0 ? ((c.cy - rect.top) / rect.height) * 100 : 50;
      setState({
        scale: nextScale,
        originX: Math.min(100, Math.max(0, originX)),
        originY: Math.min(100, Math.max(0, originY)),
      });
    },
    [twoPointerCenter],
  );

  const endPointer = useCallback((e: ReactPointerEvent): void => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
  }, []);

  const reset = useCallback((): void => {
    gesture.current = null;
    setState({ scale: 1, originX: 50, originY: 50 });
  }, []);

  return {
    ...state,
    zoomed: state.scale > 1.001,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      // Orphan-pointer safeguard (L2): a finger that lifts OFF the stage fires
      // no pointerup here, which would leave `pointers` stuck at 2 so the NEXT
      // single touch reads as a pinch (and cancels a legitimate stroke).
      // pointerleave / lostpointercapture reconcile the set the same way.
      onPointerLeave: endPointer,
      onLostPointerCapture: endPointer,
    },
    reset,
  };
}
