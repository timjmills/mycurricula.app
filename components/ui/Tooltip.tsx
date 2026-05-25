"use client";

// Tooltip — hover + focus tooltip primitive.
//
// Approach:
//   Portal to document.body via ReactDOM.createPortal so the tooltip
//   escapes overflow:hidden containers. The trigger gets aria-describedby
//   referencing the tooltip's id while open. Position is computed from
//   the trigger's getBoundingClientRect() on each show, with auto-flip
//   when the preferred side would overflow the viewport.
//
// Touch devices (@media (hover: none)):
//   Hover is suppressed — the tooltip only shows on keyboard focus.
//   Long-press handling adds complexity and diverges from native platform
//   behavior; most mobile teacher workflows are keyboard-free so the
//   tradeoff is acceptable. Revisit in Phase 2 if touch users request it.
//
// Keyboard:
//   Opens immediately on focus, closes on blur or Escape.
//
// Motion:
//   120ms fade by default. Under prefers-reduced-motion the transition is
//   removed so show/hide is instant.
//
// Disabled-button quirk (Lane Q m7):
//   Chromium suppresses pointer events on disabled <button> elements, so
//   mouseenter/mouseleave never fire on the disabled child and the styled
//   tooltip never paints. Firefox + WebKit have the same quirk to varying
//   degrees. Fix: when the trigger child is detected as disabled (the
//   `disabled` prop is truthy, or `aria-disabled` is "true"), wrap the
//   child in a transparent inline <span> and bind the hover/focus
//   listeners to the SPAN. Pointer events reach the span normally because
//   spans are not subject to the disabled-button suppression. The
//   underlying button is still rendered as-is (still disabled, still has
//   its native title= fallback), so screen readers and keyboard semantics
//   are unchanged.

import {
  useState,
  useRef,
  useId,
  useEffect,
  useCallback,
  cloneElement,
  type ReactNode,
  type ReactElement,
  type CSSProperties,
  type JSX,
} from "react";
import { createPortal } from "react-dom";
import styles from "./Tooltip.module.css";

// ── Types ────────────────────────────────────────────────────────────────────

export interface TooltipProps {
  /** The tooltip content — short text or rich node. */
  content: ReactNode;
  /** Which side to open on. Auto-flips if it would overflow. Default "top". */
  side?: "top" | "right" | "bottom" | "left";
  /** Open delay on hover in ms. Default 400. */
  delay?: number;
  /** Exactly one child element — the trigger. */
  children: ReactElement;
}

type Side = NonNullable<TooltipProps["side"]>;

// ── Position calculation ─────────────────────────────────────────────────────

const GAP = 8; // px gap between trigger and tooltip bubble

interface Placement {
  x: number;
  y: number;
  side: Side;
}

function computePlacement(
  triggerRect: DOMRect,
  tooltipRect: DOMRect,
  preferred: Side,
): Placement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Available space on each side (px from trigger edge to viewport boundary)
  const space: Record<Side, number> = {
    top: triggerRect.top,
    bottom: vh - triggerRect.bottom,
    left: triggerRect.left,
    right: vw - triggerRect.right,
  };

  // Required space for the tooltip on each side
  const required: Record<Side, number> = {
    top: tooltipRect.height + GAP,
    bottom: tooltipRect.height + GAP,
    left: tooltipRect.width + GAP,
    right: tooltipRect.width + GAP,
  };

  // Try preferred, then fall back in priority order
  const fallbackOrder: Side[] = ["top", "bottom", "right", "left"];
  const order: Side[] = [
    preferred,
    ...fallbackOrder.filter((s) => s !== preferred),
  ];
  const chosen = order.find((s) => space[s] >= required[s]) ?? preferred;

  let x = 0;
  let y = 0;

  switch (chosen) {
    case "top":
      x = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
      y = triggerRect.top - tooltipRect.height - GAP;
      break;
    case "bottom":
      x = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
      y = triggerRect.bottom + GAP;
      break;
    case "left":
      x = triggerRect.left - tooltipRect.width - GAP;
      y = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
      break;
    case "right":
      x = triggerRect.right + GAP;
      y = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
      break;
  }

  // Clamp to viewport with 8px margin
  const MARGIN = 8;
  x = Math.max(MARGIN, Math.min(x, vw - tooltipRect.width - MARGIN));
  y = Math.max(MARGIN, Math.min(y, vh - tooltipRect.height - MARGIN));

  return { x, y, side: chosen };
}

// ── Component ────────────────────────────────────────────────────────────────

export function Tooltip({
  content,
  side: preferredSide = "top",
  delay = 400,
  children,
}: TooltipProps) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const delayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  // Whether the current open was triggered by hover (vs focus).
  // Used to conditionally suppress on touch devices in CSS.
  const [byHover, setByHover] = useState(false);

  const clearDelay = () => {
    if (delayTimer.current !== null) {
      clearTimeout(delayTimer.current);
      delayTimer.current = null;
    }
  };

  // Measure the tooltip bubble and compute its placement.
  const updatePlacement = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const p = computePlacement(triggerRect, tooltipRect, preferredSide);
    setPlacement(p);
  }, [preferredSide]);

  const show = useCallback((fromHover: boolean) => {
    setByHover(fromHover);
    setOpen(true);
  }, []);

  const hide = useCallback(() => {
    clearDelay();
    setOpen(false);
    setPlacement(null);
  }, []);

  // After opening, measure and position. Run on each open.
  useEffect(() => {
    if (open) {
      // requestAnimationFrame gives the portal a tick to render before measuring.
      const raf = requestAnimationFrame(updatePlacement);
      return () => cancelAnimationFrame(raf);
    }
  }, [open, updatePlacement]);

  // Escape key closes the tooltip.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hide]);

  // ── Event handlers injected into the trigger ─────────────────────────────

  const handleMouseEnter = () => {
    clearDelay();
    delayTimer.current = setTimeout(() => show(true), delay);
  };

  const handleMouseLeave = () => {
    clearDelay();
    hide();
  };

  // Focus opens immediately (no delay) — keyboard users should not wait.
  const handleFocus = () => {
    clearDelay();
    show(false);
  };

  const handleBlur = () => {
    hide();
  };

  // ── Disabled-button quirk detection ──────────────────────────────────────
  // Inspect the child element's props for `disabled` (boolean) or
  // `aria-disabled` ("true" / true). When detected, we cannot rely on
  // listeners attached to the disabled element — Chromium drops pointer
  // events on disabled buttons. Fall through to the wrapper-span path.
  const childProps = (children as ReactElement<Record<string, unknown>>).props;
  const childDisabled =
    childProps?.disabled === true ||
    childProps?.["aria-disabled"] === true ||
    childProps?.["aria-disabled"] === "true";

  // Clone the trigger to inject ref + aria-describedby (always) and the
  // hover/focus listeners (only on the enabled path). When the child is
  // disabled, the listeners move to the wrapper span below.
  const triggerHandlers = childDisabled
    ? {}
    : {
        onMouseEnter: handleMouseEnter,
        onMouseLeave: handleMouseLeave,
        onFocus: handleFocus,
        onBlur: handleBlur,
      };

  // For the enabled path the ref lives on the trigger itself; for the
  // disabled path the ref lives on the wrapper span so getBoundingClientRect()
  // measures the right element.
  const trigger = cloneElement(
    children as ReactElement<JSX.IntrinsicElements["button"]>,
    {
      ...(childDisabled
        ? {}
        : { ref: triggerRef as React.Ref<HTMLButtonElement> }),
      "aria-describedby": open ? tooltipId : undefined,
      ...triggerHandlers,
    },
  );

  // The positioned style for the tooltip bubble. Before the first
  // measurement (placement===null) render offscreen to get a rect without
  // a layout flash.
  const positionStyle: CSSProperties =
    placement !== null
      ? { left: placement.x, top: placement.y }
      : { left: -9999, top: -9999, opacity: 0 };

  const tooltipEl = (
    <div
      id={tooltipId}
      ref={tooltipRef}
      role="tooltip"
      data-side={placement?.side ?? preferredSide}
      className={[
        styles.tooltip,
        open && placement ? styles.visible : "",
        byHover ? styles.hoverOnly : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={positionStyle}
    >
      {content}
      <span className={styles.arrow} />
    </div>
  );

  // Render the trigger directly when the child is interactive; wrap it in
  // an inline-flex span that catches the pointer events when the child is
  // disabled. The span uses `display: contents` semantics via class so it
  // does not disturb surrounding flex/grid layouts — see Tooltip.module.css
  // .disabledWrapper.
  const triggerNode = childDisabled ? (
    <span
      ref={triggerRef as React.Ref<HTMLSpanElement>}
      className={styles.disabledWrapper}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {trigger}
    </span>
  ) : (
    trigger
  );

  return (
    <>
      {triggerNode}
      {open && typeof document !== "undefined"
        ? createPortal(tooltipEl, document.body)
        : null}
    </>
  );
}
