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
// Occlusion (the `avoid` prop):
//   Fitting on screen is not the same question as not covering anything.
//   A top-bar control preferring `bottom` always opens over the row beneath
//   it — for the appearance gear that row is the console nav, 83% of it
//   buried at 375px. `avoid` names a region by CSS selector; placement then
//   slides the bubble past it and, failing that, picks the side that covers
//   least of it. Opt-in: without the prop, placement is unchanged.
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
// Pointer-events on the bubble (the focus-open click-swallow):
//   The bubble is `pointer-events: none` by default so it can never capture a
//   click meant for the content underneath. The ONE exception is the
//   dismissible bubble's "Turn off these tips" mini-link, which the user has
//   to be able to click — so those bubbles flip to `pointer-events: auto`.
//   That exception used to key off `showDismissLink` alone, which is a
//   PROP-derived constant: every dismissible tooltip was interactive however
//   it opened. A tooltip opens on focus too, and focus has no cursor — so
//   tabbing to (or clicking) a control left a click-eating rectangle parked
//   over the page for as long as the control held focus. The next mousedown
//   inside it landed on the bubble, the trigger blurred, the bubble
//   unmounted, and the mouseup landed elsewhere — no click event, one input
//   silently eaten.
//   The bubble is therefore interactive only while a MOUSE interaction is in
//   progress (`pointerEngaged`, below) — the only situation in which the link
//   is reachable anyway.
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
  /**
   * CSS selector naming a region the bubble should not cover — typically
   * chrome the teacher navigates by. Opt-in: without it, placement is
   * byte-identical to every pre-prop callsite.
   *
   * `side` asks "does the bubble fit on screen?"; this asks "does it cover
   * anything that matters?". A top-bar control preferring `bottom` will
   * always open over the row beneath it, and on this app's chrome that row
   * is the console nav — 83% of it buried at 375px when the appearance gear
   * takes focus. Naming the nav lets the placement slide the bubble clear of
   * it (and, failing that, pick the side that covers least of it).
   *
   * A SELECTOR rather than a ref, deliberately: the region is usually in a
   * sibling subtree that would otherwise have to be plumbed through the
   * shell, and it remounts on route changes — only a measure-time lookup is
   * ever current. Matching nothing is not an error; it degrades to the
   * default placement.
   */
  avoid?: string;
}

type Side = NonNullable<TooltipProps["side"]>;

// ── Bubble pointer policy ────────────────────────────────────────────────────

/** Inputs the bubble's pointer/dismiss-link policy is derived from. */
export interface TooltipPointerInput {
  /** The `required` prop — high-consequence, always-on tooltips. */
  required: boolean;
  /** The `tooltipId` prop — undefined means "never dismissible". */
  dismissalId: string | undefined;
  /**
   * True while a mouse interaction is in progress on this tooltip: the
   * cursor has entered the trigger and no close has run since. False for a
   * bubble opened purely by focus (keyboard tab, programmatic focus) —
   * there is no cursor on its way to the link, so the bubble must not
   * intercept clicks.
   */
  pointerEngaged: boolean;
}

/** What the bubble renders and whether it swallows pointer events. */
export interface TooltipPointerPolicy {
  /** Render the inline "Turn off these tips" mini-link. */
  showDismissLink: boolean;
  /** Give the bubble `pointer-events: auto` (the `.interactive` class). */
  interactive: boolean;
}

/**
 * Decide whether the portaled bubble accepts pointer events.
 *
 * The bubble must be inert by default — it is a floating rectangle over the
 * page, and anything it captures is a click the teacher meant for the UI
 * underneath. It earns `pointer-events: auto` only when BOTH hold:
 *
 *   1. It carries the "Turn off these tips" link (dismissible + not
 *      `required`) — otherwise there is nothing in it to click; and
 *   2. a mouse interaction is in progress (`pointerEngaged`) — otherwise
 *      there is no cursor that could reach the link, and interactivity buys
 *      nothing while costing a swallowed click.
 *
 * Exported for tests: this repo's vitest gate is node-environment (no DOM
 * renderer), so the contract is pinned on the pure decision rather than on a
 * rendered tree.
 */
export function tooltipPointerPolicy({
  required,
  dismissalId,
  pointerEngaged,
}: TooltipPointerInput): TooltipPointerPolicy {
  const showDismissLink = !required && dismissalId !== undefined;
  return { showDismissLink, interactive: showDismissLink && pointerEngaged };
}

// Native `title=` is only meaningful for plain-string content — the OS tooltip
// cannot render a React node. When `content` is a string we mirror it so touch
// long-press (and the disabled-button quirk, where pointer events never reach
// the styled listeners) always surfaces an explanation per CLAUDE.md §4.
function nativeTitleFor(content: ReactNode): string | undefined {
  return typeof content === "string" ? content : undefined;
}

// ── Position calculation ─────────────────────────────────────────────────────

const GAP = 8; // px gap between trigger and tooltip bubble
const MARGIN = 8; // px minimum gap between the bubble and the viewport edge

/**
 * The subset of DOMRect the placement math reads. Declared structurally so the
 * pure function below can be unit-tested with plain objects — this repo's
 * vitest gate is node-environment, where DOMRect does not exist. A real
 * DOMRect satisfies it, so callers pass getBoundingClientRect() directly.
 */
export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface Placement {
  x: number;
  y: number;
  side: Side;
  /**
   * True when the bubble was pushed off its natural anchor to clear an
   * `avoid` region. The arrow is hidden in that state (Tooltip.module.css) —
   * it would otherwise point at empty space instead of at the trigger.
   */
  displaced: boolean;
}

/** Area of the intersection of two rects, in px². 0 when they don't touch. */
function overlapArea(a: RectLike, b: RectLike): number {
  const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return w * h;
}

/** A rect of `size`'s dimensions positioned at (x, y). */
function rectAt(x: number, y: number, size: RectLike): RectLike {
  return {
    left: x,
    top: y,
    right: x + size.width,
    bottom: y + size.height,
    width: size.width,
    height: size.height,
  };
}

/** The bubble's natural top-left for a side, before clamping. */
function anchorFor(
  side: Side,
  triggerRect: RectLike,
  tooltipRect: RectLike,
): { x: number; y: number } {
  switch (side) {
    case "top":
      return {
        x: triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2,
        y: triggerRect.top - tooltipRect.height - GAP,
      };
    case "bottom":
      return {
        x: triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2,
        y: triggerRect.bottom + GAP,
      };
    case "left":
      return {
        x: triggerRect.left - tooltipRect.width - GAP,
        y: triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2,
      };
    case "right":
      return {
        x: triggerRect.right + GAP,
        y: triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2,
      };
  }
}

/**
 * Push a candidate FURTHER along its own axis until it clears every `avoid`
 * rect it intersects.
 *
 * This is the half of the fix that actually moves the needle. Side selection
 * alone cannot help a top-bar control: the occlusion is vertical, the gap
 * between the appearance gear and the console nav is ~15px against a bubble
 * ~74px tall, and every alternative side either fails its fit test or lands
 * back on the same chrome after viewport clamping. Sliding the bubble down
 * past the nav costs one hidden arrow and clears the region completely.
 *
 * Bounded to 4 passes: clearing one bar can slide the bubble onto a second
 * (an immersive bar stacked above a nav row), and a pathological avoid set
 * must not be able to spin here.
 *
 * A slide that would leave the viewport is abandoned — the clamp would drag
 * the bubble straight back onto the region, and an off-screen bubble teaches
 * nobody anything. The caller's scoring then treats this side on its merits.
 */
function slideClear(
  x: number,
  y: number,
  side: Side,
  size: RectLike,
  avoid: readonly RectLike[],
  viewport: { width: number; height: number },
): { x: number; y: number } {
  if (avoid.length === 0) return { x, y };
  let nx = x;
  let ny = y;
  for (let pass = 0; pass < 4; pass += 1) {
    const rect = rectAt(nx, ny, size);
    const hits = avoid.filter((r) => overlapArea(rect, r) > 0);
    if (hits.length === 0) break;
    if (side === "bottom") {
      ny = Math.max(...hits.map((r) => r.bottom)) + GAP;
    } else if (side === "top") {
      ny = Math.min(...hits.map((r) => r.top)) - size.height - GAP;
    } else if (side === "right") {
      nx = Math.max(...hits.map((r) => r.right)) + GAP;
    } else {
      nx = Math.min(...hits.map((r) => r.left)) - size.width - GAP;
    }
  }
  // Check only the axis that moved: the other one is still the natural anchor
  // and may legitimately sit outside the margin (a centred bubble wider than
  // the space beside its trigger), where the caller's clamp handles it.
  const ok =
    side === "top" || side === "bottom"
      ? ny >= MARGIN && ny + size.height <= viewport.height - MARGIN
      : nx >= MARGIN && nx + size.width <= viewport.width - MARGIN;
  return ok ? { x: nx, y: ny } : { x, y };
}

/**
 * Choose where the bubble opens.
 *
 * WITHOUT `avoid` (every callsite that has not opted in) this is the original
 * algorithm, unchanged: take the first side with enough VIEWPORT space, else
 * the preferred one, then clamp on-screen.
 *
 * WITH `avoid` the question changes from "does this fit on screen?" to "does
 * this cover anything that matters?" — the gap that made a top-bar tooltip
 * bury the console nav. Each side is positioned, slid clear of the avoid
 * region where that is possible, clamped, and then SCORED by how much of the
 * avoid region (plus its own trigger — a bubble that hides the control you
 * are on is the same failure) it still covers. Lowest score wins.
 *
 * Overlap DEMOTES, it never forbids: if every side covers something, the
 * least-bad one is still returned. A tooltip that vanishes is worse than one
 * that overlaps.
 *
 * Exported for tests — the repo's vitest gate is node-environment, so the
 * geometry is pinned on this pure function rather than on a rendered tree.
 */
export function computePlacement(
  triggerRect: RectLike,
  tooltipRect: RectLike,
  preferred: Side,
  viewport: { width: number; height: number },
  avoid: readonly RectLike[] = [],
): Placement {
  const vw = viewport.width;
  const vh = viewport.height;

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

  // Clamp to viewport with an 8px margin
  const clamp = (x: number, y: number): { x: number; y: number } => ({
    x: Math.max(MARGIN, Math.min(x, vw - tooltipRect.width - MARGIN)),
    y: Math.max(MARGIN, Math.min(y, vh - tooltipRect.height - MARGIN)),
  });

  if (avoid.length === 0) {
    const chosen = order.find((s) => space[s] >= required[s]) ?? preferred;
    const a = anchorFor(chosen, triggerRect, tooltipRect);
    const { x, y } = clamp(a.x, a.y);
    return { x, y, side: chosen, displaced: false };
  }

  interface Candidate extends Placement {
    score: number;
    fits: boolean;
  }
  let best: Candidate | null = null;

  for (const side of order) {
    const a = anchorFor(side, triggerRect, tooltipRect);
    const natural = clamp(a.x, a.y);
    const slid = slideClear(a.x, a.y, side, tooltipRect, avoid, viewport);
    const { x, y } = clamp(slid.x, slid.y);
    const rect = rectAt(x, y, tooltipRect);
    const score =
      avoid.reduce((sum, r) => sum + overlapArea(rect, r), 0) +
      overlapArea(rect, triggerRect);
    const fits = space[side] >= required[side];
    const candidate: Candidate = {
      x,
      y,
      side,
      displaced: x !== natural.x || y !== natural.y,
      score,
      fits,
    };
    // Strictly better score wins; on a tie prefer the side that genuinely
    // fits the viewport (an unclamped bubble sits where its arrow says it
    // does). Earlier candidates hold ties otherwise, so `preferred` and the
    // historical fallback order still decide.
    if (
      best === null ||
      candidate.score < best.score ||
      (candidate.score === best.score && candidate.fits && !best.fits)
    ) {
      best = candidate;
    }
    if (score === 0 && fits) break; // nothing can beat clear + unclamped
  }

  // `order` is never empty, so `best` is always set; the fallback keeps the
  // types honest without an assertion. Returned field-by-field so the
  // scoring bookkeeping (`score` / `fits`) cannot leak into the public
  // Placement — callers compare these objects.
  if (best === null) {
    return { x: MARGIN, y: MARGIN, side: preferred, displaced: false };
  }
  return {
    x: best.x,
    y: best.y,
    side: best.side,
    displaced: best.displaced,
  };
}

/**
 * Resolve an `avoid` selector to live rects at MEASURE time — never cached.
 *
 * The regions this guards are chrome: the console nav mounts in three
 * different hosts (home / compact / immersive bar) and remounts on every
 * route change, so a rect captured once is stale by the next view.
 *
 * Both failure modes degrade to "no avoid region", i.e. exactly the
 * pre-existing placement: a selector that matches nothing, and a selector
 * that is syntactically invalid. Neither may take the tooltip down.
 */
function readAvoidRects(selector: string): RectLike[] {
  if (typeof document === "undefined") return [];
  let nodes: ArrayLike<Element>;
  try {
    nodes = document.querySelectorAll(selector);
  } catch {
    return [];
  }
  const out: RectLike[] = [];
  for (const el of Array.from(nodes)) {
    const r = el.getBoundingClientRect();
    // A display:none node reports an all-zero rect; it occludes nothing.
    if (r.width > 0 && r.height > 0) out.push(r);
  }
  return out;
}

const NO_AVOID: readonly RectLike[] = [];

// ── Trigger→bubble crossing time ─────────────────────────────────────────────

/** Historical grace period: enough to cross the default 8px GAP. */
const GRACE_MIN_MS = 120;
/** Ceiling, so a cursor that wandered off does not leave the bubble hanging. */
const GRACE_MAX_MS = 600;

/** Shortest distance between two axis-aligned rects (0 when they touch). */
export function rectGap(a: RectLike, b: RectLike): number {
  const dx = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
  const dy = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
  return Math.hypot(dx, dy);
}

/**
 * How long to keep a dismissible bubble alive after the cursor leaves the
 * trigger, so it can reach the "Turn off these tips" link.
 *
 * The flat 120ms this replaces was sized for the 8px GAP. A DISPLACED bubble
 * (slid clear of an `avoid` region) can sit ~57px away — at 375px the gear's
 * bubble now opens below the console nav — and a deliberate-but-unhurried
 * cursor cannot cross that before the close fires, which would quietly make
 * the dismiss link unreachable by mouse (CLAUDE.md §4 affordance).
 *
 * ~250px/s is a slow, realistic short-move speed, hence 4ms per px. The floor
 * keeps every non-displaced callsite on exactly its historical 120ms.
 */
export function graceForGap(gapPx: number): number {
  return Math.min(GRACE_MAX_MS, Math.max(GRACE_MIN_MS, Math.round(gapPx * 4)));
}

// ── Component ────────────────────────────────────────────────────────────────

export function Tooltip({
  content,
  side: preferredSide = "top",
  delay = 400,
  children,
  tooltipId: dismissalId,
  required = false,
  avoid,
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
  // Whether a mouse interaction is in progress — set the moment the cursor
  // enters the trigger, cleared by every close. Deliberately NOT the same
  // flag as `byHover`: `byHover` records how the current open BEGAN (and so
  // flips to false when a hovered trigger is clicked and takes focus),
  // whereas the dismiss link must stay clickable across exactly that
  // transition. It also has to stay true through the 120ms grace period
  // below, while the cursor crosses the gap between trigger and bubble —
  // going inert mid-flight would stop the bubble's own mouseenter from ever
  // firing and close it out from under the cursor.
  const [pointerEngaged, setPointerEngaged] = useState(false);

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
    const p = computePlacement(
      triggerRect,
      tooltipRect,
      preferredSide,
      { width: window.innerWidth, height: window.innerHeight },
      avoid ? readAvoidRects(avoid) : NO_AVOID,
    );
    setPlacement(p);
  }, [preferredSide, avoid]);

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
    // A close ends the mouse interaction: the next open has to earn
    // interactivity again by the cursor entering the trigger.
    setPointerEngaged(false);
  }, []);

  // "Turn off these tips" handler. Only available to non-required tooltips
  // that opted in to dismissibility (have a dismissalId). Hides the bubble
  // immediately and writes the id to localStorage so subsequent opens are
  // suppressed.
  const { showDismissLink, interactive } = tooltipPointerPolicy({
    required,
    dismissalId,
    pointerEngaged,
  });
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

  // Re-measure while open — but ONLY on the occlusion-aware path. The avoid
  // region moves when the chrome reflows (a resize) or when a scroll container
  // shifts it, and a stale rect would put the bubble straight back on top of
  // it. Plain tooltips keep the historical single-measurement behaviour
  // exactly: no listeners, no extra layout reads.
  useEffect(() => {
    if (!open || !avoid) return;
    const onMove = (): void => updatePlacement();
    const scrollOpts = { capture: true, passive: true } as const;
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, scrollOpts);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, { capture: true });
    };
  }, [open, avoid, updatePlacement]);

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
    // The cursor is on the trigger — from here on the bubble may accept
    // pointer events (see tooltipPointerPolicy). Set it before the delay
    // elapses so a bubble already open from focus becomes clickable the
    // moment the mouse arrives, not `delay` ms later.
    setPointerEngaged(true);
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
    //
    // The defer is measured from the ACTUAL trigger→bubble distance: a bubble
    // displaced clear of an `avoid` region sits far further away than the 8px
    // GAP this was originally sized for, and a flat 120ms would put its
    // dismiss link out of mouse reach. Non-displaced bubbles land on the
    // floor, i.e. the historical 120ms exactly.
    if (showDismissLink) {
      const t = triggerRef.current?.getBoundingClientRect();
      const b = tooltipRef.current?.getBoundingClientRect();
      const grace = t && b ? graceForGap(rectGap(t, b)) : GRACE_MIN_MS;
      delayTimer.current = setTimeout(() => hide(), grace);
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

  // Pressing inside the bubble must not move focus. Once the trigger holds
  // focus — the teacher clicked the control, or tabbed to it and then reached
  // for the mouse — a mousedown on the "Turn off these tips" link blurs the
  // trigger, `handleBlur` hides the bubble, and the link unmounts BEFORE the
  // mouseup. No click event is ever delivered, so the tip is never actually
  // dismissed: the bubble just vanishes and comes straight back on the next
  // hover. Suppressing the mousedown default keeps focus on the trigger, so
  // the bubble survives long enough for the click to land (and the teacher's
  // keyboard position is preserved, which is the better a11y outcome anyway).
  const handleBubbleMouseDown = (e: ReactMouseEvent<HTMLDivElement>): void => {
    e.preventDefault();
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
  //
  // COMPOSE, never clobber: cloneElement props REPLACE the child's own,
  // so naively injecting onBlur here used to silently swallow a child's
  // commit-on-blur handler (e.g. the settings text inputs that save when
  // you click out). Each injected listener now calls the child's own
  // handler first, then the tooltip's.
  const composeHandler = <E,>(
    theirs: unknown,
    ours: (e: E) => void,
  ): ((e: E) => void) => {
    return (e: E): void => {
      if (typeof theirs === "function") {
        (theirs as (e: E) => void)(e);
      }
      ours(e);
    };
  };
  const triggerHandlers = childDisabled
    ? {}
    : {
        onMouseEnter: composeHandler(
          childProps?.onMouseEnter,
          handleMouseEnter,
        ),
        onMouseLeave: composeHandler(
          childProps?.onMouseLeave,
          handleMouseLeave,
        ),
        onFocus: composeHandler(childProps?.onFocus, handleFocus),
        onBlur: composeHandler(childProps?.onBlur, handleBlur),
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
      // Slid clear of an `avoid` region: the bubble no longer touches its
      // trigger, so the arrow is hidden (Tooltip.module.css) rather than left
      // pointing at whatever the bubble was moved past.
      data-displaced={placement?.displaced ? "true" : undefined}
      className={[
        styles.tooltip,
        open && placement ? styles.visible : "",
        byHover ? styles.hoverOnly : "",
        // Switch the bubble to pointer-events:auto only when the dismiss
        // link is present AND a mouse interaction is in progress — otherwise
        // the bubble must stay non-interactive so it doesn't capture clicks
        // intended for content underneath. A focus-opened bubble has no
        // cursor heading for the link, so it stays inert.
        interactive ? styles.interactive : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={positionStyle}
      onMouseEnter={showDismissLink ? handleBubbleMouseEnter : undefined}
      onMouseLeave={showDismissLink ? handleBubbleMouseLeave : undefined}
      onMouseDown={showDismissLink ? handleBubbleMouseDown : undefined}
    >
      {content}
      {/* W2-B3: inline "Turn off these tips" mini-link. Shown only when the
          tooltip opted in to dismissibility (has a tooltipId) and is NOT
          required. Visually unobtrusive — small, dimmed, single line.
          Rendered whenever the tooltip is dismissible, including while the
          bubble is inert (focus-opened): the link is inert with it, but
          keeping it mounted means the bubble does not resize and re-place
          itself under the cursor the instant the mouse reaches the trigger. */}
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
