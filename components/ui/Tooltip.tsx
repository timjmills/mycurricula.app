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
//   The styled hover bubble is suppressed (a touch has no hover state and
//   long-press of a custom portal is non-native + fiddly). Instead — per
//   CLAUDE.md §4 ("touch = long-press surfacing the native `title=` attribute
//   the Tooltip primitive mirrors") — when the tooltip content is a plain
//   string we mirror it to the trigger's native `title=` attribute. A
//   long-press on phone/tablet then surfaces the OS tooltip, so touch users
//   are never left without an explanation. The focus path below also still
//   shows the styled bubble for keyboard/AT users.
//
// Keyboard:
//   Opens immediately on focus (focus-visible-friendly — the trigger's own
//   :focus-visible styling decides the ring; we open on any focus so that
//   AT/keyboard users always get the bubble), closes on blur or Escape. The
//   bubble id is linked to the trigger via aria-describedby while open so
//   screen readers announce the explanation.
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
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import styles from "./Tooltip.module.css";
import { useTooltipDismissal } from "@/lib/tooltip-dismissal";

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
  /**
   * Stable opaque id enabling W2-B3 dismissibility. When set AND the id is
   * dismissed, AND `required` is not true, the tooltip is suppressed. When
   * the tooltip opens for the first time for a non-required id, an inline
   * "Turn off these tips" mini-link is appended to the bubble. Clicking
   * the link dismisses this id and closes the bubble.
   *
   * Source of truth for the dismissal state: `lib/tooltip-dismissal.ts`.
   *
   * Leave undefined for tooltips that should never be dismissed (the legacy
   * "always-on" path — identical render to pre-prop callsites).
   */
  tooltipId?: string;
  /**
   * When true, the tooltip is **always on** regardless of per-id dismissal
   * or the global off switch. Use for high-consequence controls per
   * CLAUDE.md §4:
   *   • The Personal / Team Curriculum toggle
   *   • Destructive actions (archive, delete, …)
   *   • Team-wide settings cards (changes affect every teacher)
   *
   * The "Turn off these tips" mini-link is also suppressed for required
   * tooltips — the only escape hatch is to stop hovering.
   */
  required?: boolean;
}

type Side = NonNullable<TooltipProps["side"]>;

// Native `title=` is only meaningful for plain-string content — the OS tooltip
// cannot render a React node. When `content` is a string we mirror it so touch
// long-press (and the disabled-button quirk, where pointer events never reach
// the styled listeners) always surfaces an explanation per CLAUDE.md §4.
function nativeTitleFor(content: ReactNode): string | undefined {
  return typeof content === "string" ? content : undefined;
}

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
  tooltipId: dismissalId,
  required = false,
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

  // W2-B3 dismissibility. The hook is SSR-safe (initial render = NOT
  // dismissed) so it cannot cause a hydration mismatch in the trigger
  // subtree. `dismissed` flips post-mount once the hook reads localStorage.
  // `required` callsites bypass dismissal entirely — used for the
  // Personal/Team toggle, destructive actions, and team-wide settings.
  const { dismissed, dismiss } = useTooltipDismissal(dismissalId);
  const suppress = !required && dismissed;

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

  const show = useCallback(
    (fromHover: boolean) => {
      // W2-B3: respect dismissal — never open a suppressed tooltip. The
      // disabled-button wrapper-span and aria-describedby still wire up
      // normally, but the bubble never paints.
      if (suppress) return;
      setByHover(fromHover);
      setOpen(true);
    },
    [suppress],
  );

  const hide = useCallback(() => {
    clearDelay();
    setOpen(false);
    setPlacement(null);
  }, []);

  // "Turn off these tips" handler. Only available to non-required tooltips
  // that opted in to dismissibility (have a dismissalId). Hides the bubble
  // immediately and writes the id to localStorage so subsequent opens are
  // suppressed.
  const showDismissLink = !required && dismissalId !== undefined;
  const handleDismissClick = useCallback(
    (e: ReactMouseEvent<HTMLButtonElement>): void => {
      e.preventDefault();
      e.stopPropagation();
      dismiss();
      hide();
    },
    [dismiss, hide],
  );

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

  // If suppression flips to true while the bubble is open — e.g. the global
  // off switch is toggled in another tab and the storage event arrives —
  // close immediately so the teacher's preference is respected without a
  // page refresh.
  useEffect(() => {
    if (suppress && open) hide();
  }, [suppress, open, hide]);

  // ── Event handlers injected into the trigger ─────────────────────────────

  const handleMouseEnter = () => {
    clearDelay();
    delayTimer.current = setTimeout(() => show(true), delay);
  };

  const handleMouseLeave = () => {
    clearDelay();
    // W2-B3: when the tooltip carries an interactive "Turn off these tips"
    // link, defer the close briefly so the user has time to move the
    // cursor from the trigger onto the bubble. Mouse-enter on the bubble
    // (.tooltip:hover) cancels the timer; mouse-leave on the bubble
    // triggers the close. Without this defer the bubble closes the instant
    // the cursor enters the 8px gap between trigger and bubble.
    if (showDismissLink) {
      delayTimer.current = setTimeout(() => hide(), 120);
      return;
    }
    hide();
  };

  // Bubble hover handlers — only used when the dismiss link is shown.
  // Hovering the bubble keeps it open; leaving the bubble closes it.
  const handleBubbleMouseEnter = () => {
    clearDelay();
  };
  const handleBubbleMouseLeave = () => {
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

  // Native title= mirror (CLAUDE.md §4 touch path). Prefer a title the caller
  // already set on the child; otherwise derive one from string content. This
  // is what a long-press surfaces on phone/tablet and what a disabled button
  // falls back to (Chromium drops pointer events on disabled <button>, so the
  // styled bubble's hover listeners never fire — but native title= still does).
  // When suppressed (dismissed + not required) we drop the native title too so
  // a turned-off tip stays off on touch as well.
  const existingTitle =
    typeof childProps?.title === "string" ? childProps.title : undefined;
  const nativeTitle = suppress
    ? undefined
    : (existingTitle ?? nativeTitleFor(content));

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
  //
  // COMPOSE with any ref the child already carries — cloneElement's
  // injected ref otherwise REPLACES it, silently emptying callers' own
  // ref books (agenda drag midpoints, planning-tab focus rosters, menu
  // outside-click anchors).
  const childOwnRef =
    ((childProps as { ref?: React.Ref<HTMLElement> } | null)?.ref ??
      (children as unknown as { ref?: React.Ref<HTMLElement> }).ref) ||
    null;
  const composedTriggerRef = (node: HTMLElement | null): void => {
    (triggerRef as React.MutableRefObject<HTMLElement | null>).current = node;
    if (typeof childOwnRef === "function") {
      childOwnRef(node);
    } else if (childOwnRef && typeof childOwnRef === "object") {
      (childOwnRef as React.MutableRefObject<HTMLElement | null>).current =
        node;
    }
  };
  const trigger = cloneElement(
    children as ReactElement<JSX.IntrinsicElements["button"]>,
    {
      ...(childDisabled
        ? {}
        : { ref: composedTriggerRef as React.Ref<HTMLButtonElement> }),
      "aria-describedby": open ? tooltipId : undefined,
      // Native `title=` mirror. CLAUDE.md §4 requires touch users to reach the
      // explanation via long-press of the native OS tooltip, and the
      // disabled-button quirk (Chromium drops pointer events on disabled
      // <button>) means native title= is the only fallback that always fires
      // there. We keep it on the trigger so both paths work. Screen-reader
      // users get the explanation via aria-describedby (above) on open. On
      // desktop the styled bubble's 400ms hover delay generally beats the OS
      // tooltip, so the two rarely collide; accessibility is the priority.
      title: nativeTitle,
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
        // Switch the bubble to pointer-events:auto only when the dismiss
        // link is present — otherwise the bubble must stay non-interactive
        // so it doesn't capture clicks intended for content underneath.
        showDismissLink ? styles.interactive : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={positionStyle}
      onMouseEnter={showDismissLink ? handleBubbleMouseEnter : undefined}
      onMouseLeave={showDismissLink ? handleBubbleMouseLeave : undefined}
    >
      {content}
      {/* W2-B3: inline "Turn off these tips" mini-link. Shown only when the
          tooltip opted in to dismissibility (has a tooltipId) and is NOT
          required. Visually unobtrusive — small, dimmed, single line. */}
      {showDismissLink && (
        <button
          type="button"
          className={styles.dismissLink}
          onClick={handleDismissClick}
        >
          Turn off these tips
        </button>
      )}
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
      // Mirror the native title onto the event-catching wrapper too: a
      // long-press on the disabled button's area lands on this span (the
      // disabled <button> swallows pointer events), so the OS tooltip surfaces
      // here on touch. CLAUDE.md §4 touch path for disabled controls.
      title={nativeTitle}
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
