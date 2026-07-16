"use client";

// FloatingBar.tsx — the W3.8 selection-driven floating rich-text bar.
//
// The lesson editor's fill-in template (docs/v2-rebuild/WAVE-3-PLAN.md, W3.8)
// has NO docked toolbar: formatting arrives on a small floating bar that
// appears the moment a section field gains focus, follows the caret /
// selection, and disappears when focus leaves the fields. Recipe ported from
// the v2 bundle's `SelectionToolbar` + `.pb-fbar` (mockup/New v2 Site
// Design.bundled.html ~10874-10929 / ~5069-5074), with the mock's three
// on-record defects fixed:
//   • no window.prompt for links — an inline URL input inside the bar;
//   • the resource chip (📎) does NOT insert inline HTML (the sanitizer
//     strips class attributes) — it calls `onAddResource(sectionId)` so the
//     host adds a STRUCTURED resource to the active section;
//   • a dark-tone variant (the mock bar ignored theming) — see the
//     dual-scoped override in FloatingBar.module.css.
//
// HOW IT DRIVES THE EDITORS. The bar owns no editor state: every command
// routes through the shared RichTextCommandBus (components/rich-text/
// command-bus.ts) to whichever chromeless RichTextEditor holds focus — the
// exact RtToolbar consumer recipe. Selection preservation is the bus's
// standard belt-and-braces: mousedown on the bar preventDefaults (focus
// never leaves the field), and the bar root carries RICH_TEXT_TOOLBAR_ATTR
// so an editor keeps its registration while focus sits on the bar's link
// input (the editor then restores its snapshotted Range when the command
// lands — see rich-text-editor.tsx `captureSelectionRange`).
//
// SCOPE GATING. Multiple lesson editors can be mounted at once (modal + week
// cell expand). Each FloatingBar instance serves ONLY its own subtree: every
// focus event is checked for containment in `props.scopeRef.current` before
// the bar reacts. The bus itself stays last-focus-wins and shared — this bar
// never unregisters targets and never fights /daily's RtToolbar; the only
// registry write is the same honest `release()` RtToolbar performs when
// keyboard focus leaves the bar for somewhere that is neither the bar nor
// the held editor.
//
// ACTIVE SECTION. Resource adds need a section id. Builder A puts
// `data-section-id` on each section block root; the bar reads it from the
// focused field via `closest('[data-section-id]')` on focusin.
//
// POSITIONING (bundle recipe, viewport-fixed):
//   anchor = first client rect of the selection when it sits in the field,
//   else the field's rect (x = left + min(width/2, 120), y = top);
//   bar centered above the anchor with a 10px gap
//   (translate(-50%, calc(-100% - 10px))). Two deviations from the mock:
//   • when the anchor is too close to the viewport top for the bar to fit
//     above (< MIN_TOP_FOR_ABOVE), the bar flips BELOW the anchor rect —
//     the mock would render it clipped off-screen;
//   • the mock's fixed [140, innerWidth-140] x-clamp clips on small
//     viewports (W3.8 gate: Bold/Italic off-screen at 375px). The clamp
//     uses the bar's MEASURED width (ResizeObserver-fresh, since the
//     inline pops widen it), and the CSS caps the bar at
//     calc(100vw - 16px) with flex-wrap — RtToolbar's narrow-width
//     precedent — so the row wraps rather than overflowing, keeping the
//     44px coarse-pointer targets intact.
//
// The bar portals to `.cp-root` — NOT document.body — for the same reason
// the editor's own floating toolbar does: position:fixed breaks under
// zoomed/transformed ancestors, and the `.cp-root button` resets + font
// cascade must keep reaching these buttons.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Button, Tooltip } from "@/components/ui";
import {
  RICH_TEXT_TOOLBAR_ATTR,
  useRichTextCommandBus,
} from "@/components/rich-text";
import styles from "./FloatingBar.module.css";

// ── Pure geometry (exported for tests/floating-bar.test.ts) ─────────────────

/** Plain-object subset of DOMRect so the math is unit-testable without a DOM. */
export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The point the bar hangs from: x is the horizontal center, top/bottom are
 *  the anchor rect's vertical edges (above-placement hangs from `top`,
 *  below-placement from `bottom`). */
export interface BarAnchor {
  x: number;
  top: number;
  bottom: number;
}

/**
 * Bundle recipe: anchor to the selection's first client rect when it has any
 * extent (a collapsed caret still reports height, so the bar follows the
 * caret); otherwise fall back to the field's rect — horizontally at
 * `left + min(width/2, 120)` so the bar hugs the field's start on wide
 * fields instead of drifting to the middle of the row.
 */
export function anchorFromRects(
  selectionRect: RectLike | null,
  fieldRect: RectLike,
): BarAnchor {
  if (selectionRect && (selectionRect.width || selectionRect.height)) {
    return {
      x: selectionRect.left + selectionRect.width / 2,
      top: selectionRect.top,
      bottom: selectionRect.top + selectionRect.height,
    };
  }
  const x = fieldRect.left + Math.min(fieldRect.width / 2, 120);
  return { x, top: fieldRect.top, bottom: fieldRect.top };
}

/** Gap the bar keeps from each viewport edge. Mirrored by the CSS
 *  `max-width: calc(100vw - 16px)` cap (8px per side), which wraps the
 *  controls to a second row when the viewport can't fit one row — so the
 *  clamp bounds below are always satisfiable. */
export const BAR_EDGE_MARGIN = 8;

/** Pre-measure fallback half-width (the bundle recipe's 140 ≈ half the
 *  bar's typical desktop width). Replaced by the MEASURED half-width as
 *  soon as the bar has painted — the recipe's fixed 140 fails whenever the
 *  bar is wider than 280px on a small viewport (W3.8 gate finding:
 *  Bold/Italic clipped off the left edge at 375px). */
export const BAR_EDGE_FALLBACK = 140;

/**
 * Clamp the bar's CENTER x so the whole bar stays inside the viewport.
 * With a measured `barWidth` the edge inset is `barWidth/2 +
 * BAR_EDGE_MARGIN`, so neither end can extend past either viewport edge;
 * `null` (not yet measured — first paint) falls back to the recipe's 140,
 * capped at half the viewport so the fallback itself can't push the center
 * off-screen on tiny viewports. The max-then-min order makes the LEFT edge
 * win in the degenerate case (bar wider than the viewport — prevented in
 * practice by the CSS max-width wrap).
 */
export function clampBarX(
  x: number,
  viewportWidth: number,
  barWidth: number | null = null,
): number {
  const edge =
    barWidth !== null && barWidth > 0
      ? barWidth / 2 + BAR_EDGE_MARGIN
      : Math.min(BAR_EDGE_FALLBACK, viewportWidth / 2);
  return Math.max(edge, Math.min(viewportWidth - edge, x));
}

/** Anchors closer to the viewport top than this flip the bar below the
 *  selection — above-placement would clip it off-screen (bar ≈ 38px + 10px
 *  gap, plus breathing room under the app's top chrome). When the bar has
 *  been measured TALLER than this allows (it wraps to two rows on small
 *  viewports), the flip threshold grows to match — see placeBar. */
export const MIN_TOP_FOR_ABOVE = 90;

/** Vertical gap between the anchor and the bar (the transform's 10px). */
export const BAR_ANCHOR_GAP = 10;

export interface BarPlacement {
  left: number;
  /** CSS `top` for the fixed bar (the transform supplies the gap). */
  top: number;
  side: "above" | "below";
}

/** Full placement: measured-width x clamp + above/below flip. Pure —
 *  unit-tested. `barWidth`/`barHeight` are the bar's live offsetWidth/
 *  offsetHeight (null before the first paint; see the ResizeObserver in
 *  the component). A measured height RAISES the flip threshold when the
 *  bar is taller than MIN_TOP_FOR_ABOVE assumes (wrapped two-row layout on
 *  small viewports) so above-placement never clips the top edge. */
export function placeBar(
  anchor: BarAnchor,
  viewportWidth: number,
  barWidth: number | null = null,
  barHeight: number | null = null,
  minTopForAbove = MIN_TOP_FOR_ABOVE,
): BarPlacement {
  const left = clampBarX(anchor.x, viewportWidth, barWidth);
  const flipAt =
    barHeight !== null && barHeight > 0
      ? Math.max(minTopForAbove, barHeight + BAR_ANCHOR_GAP + BAR_EDGE_MARGIN)
      : minTopForAbove;
  if (anchor.top < flipAt) {
    return { left, top: anchor.bottom, side: "below" };
  }
  return { left, top: anchor.top, side: "above" };
}

// ── Swatches (curated from the house token ramps, NOT the mock hexes) ───────

interface ColorSwatch {
  label: string;
  /** CSS custom-property name (resolved to a concrete color at command
   *  time), or the literal "transparent" (= remove highlight). */
  variable: string;
}

// Text colors — 6 picks from rich-text-editor.tsx's TEXT_COLORS ramp: the
// strong ink plus five well-separated subject hues.
const TEXT_SWATCHES: ColorSwatch[] = [
  { label: "Ink dark", variable: "--ink-900" },
  { label: "Math blue", variable: "--math" },
  { label: "Reading green", variable: "--reading" },
  { label: "Writing purple", variable: "--writing" },
  { label: "UFLI orange", variable: "--ufli" },
  { label: "Spelling pink", variable: "--spelling" },
];

// Highlights — the remove-chip plus 5 picks spanning the HIGHLIGHTERS ramp
// (bright markers) and one HIGHLIGHT_PASTEL for a soft option.
const HIGHLIGHT_SWATCHES: ColorSwatch[] = [
  { label: "Remove highlight", variable: "transparent" },
  { label: "Laser lemon", variable: "--hl-lemon" },
  { label: "Mint green", variable: "--hl-mint" },
  { label: "Maya blue", variable: "--hl-maya" },
  { label: "Heliotrope", variable: "--hl-heliotrope" },
  { label: "Peach pastel", variable: "--hlp-cheese" },
];

/** Resolve a CSS custom property to its computed value on <html> — same
 *  helper the house editor uses: execCommand('foreColor'/'hiliteColor')
 *  cannot parse var() syntax. Literal colors pass through unchanged. */
function resolveCssVar(variable: string): string {
  if (!variable.startsWith("--")) return variable;
  if (typeof document === "undefined") return variable;
  return getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
}

// ── Bar button ───────────────────────────────────────────────────────────────

// All bar tips share ONE dismissal id — this is a high-frequency surface, so
// a teacher who has learned the bar turns every tip off with a single click
// (the W2-B3 "Turn off these tips" mini-link).
const BAR_TOOLTIP_ID = "lesson-editor-bar";

// Why a button is disabled (CLAUDE.md §4: disabled controls explain
// themselves). Same voice as RtToolbar's.
const DISABLED_TOOLTIP =
  "Click into any text in the lesson first — these tools format the text you select there";
const SINGLE_LINE_TOOLTIP =
  "This field is a single line of text — lists and indenting aren't available here";
const COLLAPSED_LINK_TOOLTIP =
  "Select some text first — the link wraps the text you've selected";

interface FbarButtonProps {
  /** Accessible name (aria-label). */
  label: string;
  /** Onboarding tooltip in teaching voice. */
  tooltip: string;
  /** Toggle state — pass a boolean only for real toggles (renders
   *  aria-pressed); leave undefined for one-shot actions. */
  active?: boolean;
  disabled: boolean;
  /** Overrides the no-editor default when the reason is the field's
   *  capabilities rather than missing focus. */
  disabledReason?: string;
  /** The bar's single roving tab stop (ARIA toolbar pattern). */
  isTabStop?: boolean;
  onActivate: () => void;
  children: ReactNode;
}

function FbarButton({
  label,
  tooltip,
  active,
  disabled,
  disabledReason,
  isTabStop = false,
  onActivate,
  children,
}: FbarButtonProps): ReactNode {
  return (
    <Tooltip
      content={disabled ? (disabledReason ?? DISABLED_TOOLTIP) : tooltip}
      tooltipId={BAR_TOOLTIP_ID}
    >
      <Button
        variant="icon"
        size="sm"
        className={[styles.fbtn, active ? styles.fbtnActive : ""]
          .filter(Boolean)
          .join(" ")}
        iconAriaLabel={label}
        disabled={disabled}
        aria-pressed={active}
        tabIndex={isTabStop ? 0 : -1}
        // Selection preservation: a button press must never move focus out
        // of the editor (the bar root repeats this for clicks on gaps).
        onMouseDown={(e) => e.preventDefault()}
        onClick={onActivate}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

// ── FloatingBar ──────────────────────────────────────────────────────────────

export interface FloatingBarProps {
  /** The lesson-editor subtree this bar serves. Only focus/selection inside
   *  this element shows or drives the bar. */
  scopeRef: RefObject<HTMLElement | null>;
  /** The hosted lesson — the bar resets (hides, closes pickers) when it
   *  changes so a stale bar never floats over a swapped-in lesson. */
  lessonId: string;
  /** Add a structured resource to the section whose field is focused.
   *  The id comes from the field's closest `[data-section-id]` ancestor. */
  onAddResource?: (sectionId: string) => void;
}

interface BarState {
  show: boolean;
  left: number;
  top: number;
  side: "above" | "below";
}

const HIDDEN: BarState = { show: false, left: 0, top: 0, side: "above" };

type PickerKind = "text" | "hl" | "link" | null;

export function FloatingBar({
  scopeRef,
  lessonId,
  onAddResource,
}: FloatingBarProps): ReactNode {
  const bus = useRichTextCommandBus();
  const barRef = useRef<HTMLDivElement | null>(null);
  /** The focused contentEditable field inside our scope, if any. */
  const fieldRef = useRef<HTMLElement | null>(null);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** The bar's measured size — width feeds the x clamp so the bar can
   *  never extend past either viewport edge, height feeds the above/below
   *  flip threshold (W3.8 gate fix). Null until the first paint; kept live
   *  by the ResizeObserver below because the bar's size CHANGES while open
   *  (the inline color/link pops widen it, and the CSS max-width cap wraps
   *  it to two rows on small viewports). */
  const barSizeRef = useRef<{ width: number; height: number } | null>(null);

  const [bar, setBar] = useState<BarState>(HIDDEN);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [selCollapsed, setSelCollapsed] = useState(true);

  // ── Placement ──────────────────────────────────────────────────────────

  /** Recompute the bar's position from the live selection / focused field.
   *  Reads only refs, so the callback is stable for the listener effects. */
  const place = useCallback((): void => {
    const field = fieldRef.current;
    if (!field) {
      setBar((s) => (s.show ? HIDDEN : s));
      setPicker(null);
      return;
    }
    // Selection rect — only when the selection actually sits in the field.
    let selRect: RectLike | null = null;
    let collapsed = true;
    const sel = document.getSelection();
    if (sel && sel.rangeCount > 0) {
      const anchorNode = sel.anchorNode;
      const anchorEl =
        anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
      if (anchorEl && field.contains(anchorEl)) {
        const range = sel.getRangeAt(0);
        collapsed = sel.isCollapsed;
        const rects = range.getClientRects();
        selRect = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
      }
    }
    const anchor = anchorFromRects(selRect, field.getBoundingClientRect());
    const next = placeBar(
      anchor,
      window.innerWidth,
      barSizeRef.current?.width ?? null,
      barSizeRef.current?.height ?? null,
    );
    setSelCollapsed(collapsed);
    setBar((s) =>
      s.show && s.left === next.left && s.top === next.top && s.side === next.side
        ? s
        : { show: true, ...next },
    );
  }, []);

  // ── Focus/selection listeners (document-level, scope-gated) ────────────

  useEffect(() => {
    /** The rich-text field for a node, iff it lives inside OUR scope. */
    const fieldFor = (node: EventTarget | null): HTMLElement | null => {
      if (!(node instanceof Element)) return null;
      const field = node.closest<HTMLElement>("[contenteditable]");
      if (!field || !field.isContentEditable) return null;
      const scope = scopeRef.current;
      if (!scope || !scope.contains(field)) return null;
      return field;
    };

    const clearGrace = (): void => {
      if (graceTimerRef.current !== null) {
        clearTimeout(graceTimerRef.current);
        graceTimerRef.current = null;
      }
    };

    const onFocusIn = (e: FocusEvent): void => {
      const field = fieldFor(e.target);
      if (!field) return;
      clearGrace();
      fieldRef.current = field;
      setSectionId(
        field.closest("[data-section-id]")?.getAttribute("data-section-id") ??
          null,
      );
      place();
    };

    // The bar follows the caret/selection while a field is held.
    const onSelectionChange = (): void => {
      if (fieldRef.current) place();
    };

    // 60ms grace (bundle recipe) so a field→field or field→bar focus hop
    // never blinks the bar. Focus inside the bar (the link input) keeps it.
    const onFocusOut = (): void => {
      if (!fieldRef.current) return;
      clearGrace();
      graceTimerRef.current = setTimeout(() => {
        graceTimerRef.current = null;
        const active = document.activeElement;
        if (active && barRef.current?.contains(active)) return;
        const activeField = fieldFor(active);
        if (activeField) {
          // Landed in another of OUR fields (focusin normally beat us here —
          // this is belt-and-braces for odd event orders).
          fieldRef.current = activeField;
          place();
          return;
        }
        fieldRef.current = null;
        setPicker(null);
        setBar((s) => (s.show ? HIDDEN : s));
      }, 60);
    };

    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      clearGrace();
    };
  }, [scopeRef, place]);

  // Keep the fixed-position bar glued to its anchor through container
  // scrolls and window resizes (the mock skips this and goes stale — the
  // modal's scrolling body makes it visible here). Capture-phase scroll
  // hears every ancestor scroller; rAF coalesces bursts.
  useEffect(() => {
    if (!bar.show) return;
    let raf = 0;
    const onMove = (): void => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, { capture: true });
    };
  }, [bar.show, place]);

  // Track the bar's live size for the placement math. ResizeObserver (not
  // a one-shot measure) because the size changes while the bar is open —
  // the inline color/link pops widen it and the CSS max-width cap wraps it
  // to a second row on small viewports. The observer fires once on observe
  // (the post-first-paint correction that fixes the pre-measure fallback's
  // clipping on narrow viewports) and again on every size change, each time
  // re-running place() so the clamp uses the fresh dimensions.
  useEffect(() => {
    if (!bar.show) return;
    const el = barRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      const prev = barSizeRef.current;
      if (!prev || prev.width !== width || prev.height !== height) {
        barSizeRef.current = { width, height };
        place();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [bar.show, place]);

  // Swapping the hosted lesson (Day-edit agenda selection, modal re-open)
  // resets the bar — a held field from the previous lesson is gone.
  useEffect(() => {
    fieldRef.current = null;
    setPicker(null);
    setBar((s) => (s.show ? HIDDEN : s));
  }, [lessonId]);

  // ── Commands (all through the shared bus) ──────────────────────────────

  const ready = bus.canExecute();
  const disabled = !ready;
  const blockDisabled = disabled || !bus.supportsBlockCommands();
  const isOn = (command: string): boolean =>
    ready ? bus.queryState(command) : false;

  const applyTextColor = (variable: string): void => {
    bus.executeCommand("foreColor", resolveCssVar(variable));
    setPicker(null);
  };
  const applyHighlight = (variable: string): void => {
    bus.executeCommand(
      "hiliteColor",
      variable === "transparent" ? "transparent" : resolveCssVar(variable),
    );
    setPicker(null);
  };

  // Link flow — inline URL input, no window.prompt (mock defect #3). Enter
  // applies through the bus (the editor restores its snapshotted selection);
  // Esc cancels and hands focus back to the field.
  const openLinkEditor = (): void => {
    setLinkUrl("");
    setPicker((p) => (p === "link" ? null : "link"));
  };
  const cancelLink = (): void => {
    setPicker(null);
    fieldRef.current?.focus();
  };
  const applyLink = (): void => {
    const raw = linkUrl.trim();
    if (!raw) {
      cancelLink();
      return;
    }
    // Scheme-less entries ("docs.google.com/…") get https:// — the sanitizer
    // would otherwise reject them as relative/unsafe on emit.
    const url = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    bus.executeCommand("createLink", url);
    setPicker(null);
  };

  const addResource = (): void => {
    if (onAddResource && sectionId) onAddResource(sectionId);
  };

  // ── ARIA toolbar keyboard pattern (one tab stop, arrows move focus) ────

  function handleBarKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    // Never hijack typing/caret keys inside the link URL input.
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const buttons = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ),
    );
    if (buttons.length === 0) return;
    const current = buttons.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    let next: HTMLButtonElement | undefined;
    if (e.key === "Home") next = buttons[0];
    else if (e.key === "End") next = buttons[buttons.length - 1];
    else if (current === -1) next = buttons[0];
    else if (e.key === "ArrowRight")
      next = buttons[(current + 1) % buttons.length];
    else next = buttons[(current - 1 + buttons.length) % buttons.length];
    if (!next) return;
    e.preventDefault();
    next.focus();
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (!bar.show || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={barRef}
      role="toolbar"
      aria-label="Text formatting"
      data-side={bar.side}
      className={styles.fbar}
      style={{ left: bar.left, top: bar.top }}
      // Editors keep their bus registration while focus sits here (the link
      // input) — see useRichTextCommandTarget's blur handler.
      {...{ [RICH_TEXT_TOOLBAR_ATTR]: "" }}
      // Touch users long-press the bar for an explanation (CLAUDE.md §4).
      title="Formatting bar — select text in the lesson, then pick a style"
      onKeyDown={handleBarKeyDown}
      onMouseDown={(e) => {
        // Clicks on the bar (buttons, separators, gaps) must not steal focus
        // from the editor — EXCEPT the link URL input, which needs focus.
        if (!(e.target as Element).closest?.("input")) e.preventDefault();
      }}
      onBlur={(e) => {
        // Keyboard path (mirrors RtToolbar): when focus leaves the bar for
        // somewhere that is neither the bar nor the held editor, release the
        // bus target so the buttons disable honestly.
        const next = e.relatedTarget as Node | null;
        if (next && e.currentTarget.contains(next)) return;
        if (next && bus.targetContains(next)) return;
        bus.release();
      }}
    >
      {/* ── Inline styles ── */}
      <FbarButton
        label="Bold"
        tooltip="Make the selected text bold"
        active={isOn("bold")}
        disabled={disabled}
        isTabStop
        onActivate={() => bus.executeCommand("bold")}
      >
        <b>B</b>
      </FbarButton>
      <FbarButton
        label="Italic"
        tooltip="Italicize the selected text"
        active={isOn("italic")}
        disabled={disabled}
        onActivate={() => bus.executeCommand("italic")}
      >
        <i>I</i>
      </FbarButton>
      <FbarButton
        label="Underline"
        tooltip="Underline the selected text"
        active={isOn("underline")}
        disabled={disabled}
        onActivate={() => bus.executeCommand("underline")}
      >
        <u>U</u>
      </FbarButton>

      <span className={styles.fsep} aria-hidden />

      {/* ── Text size (execCommand fontSize legacy scale — the same 2/3/5
             mapping as the house editor's SIZE_OPTIONS) ── */}
      <FbarButton
        label="Small text"
        tooltip="Make the selected text small"
        disabled={disabled}
        onActivate={() => bus.executeCommand("fontSize", "2")}
      >
        <span className={styles.szS}>A</span>
      </FbarButton>
      <FbarButton
        label="Normal text"
        tooltip="Return the selected text to normal size"
        disabled={disabled}
        onActivate={() => bus.executeCommand("fontSize", "3")}
      >
        <span className={styles.szM}>A</span>
      </FbarButton>
      <FbarButton
        label="Large text"
        tooltip="Make the selected text large"
        disabled={disabled}
        onActivate={() => bus.executeCommand("fontSize", "5")}
      >
        <span className={styles.szL}>A</span>
      </FbarButton>

      <span className={styles.fsep} aria-hidden />

      {/* ── Color pops (render INLINE — the bar widens while open) ── */}
      <FbarButton
        label="Text color"
        tooltip="Color the selected text"
        active={picker === "text"}
        disabled={disabled}
        onActivate={() => setPicker((p) => (p === "text" ? null : "text"))}
      >
        <span className={styles.colorGlyph}>A</span>
        <span className={styles.caret}>▾</span>
      </FbarButton>
      {picker === "text" && (
        <span className={styles.fpop} role="group" aria-label="Text colors">
          {TEXT_SWATCHES.map((sw) => (
            <button
              key={sw.variable}
              type="button"
              className={styles.sw}
              style={{ background: `var(${sw.variable})` }}
              aria-label={sw.label}
              title={sw.label}
              tabIndex={-1}
              onClick={() => applyTextColor(sw.variable)}
            />
          ))}
        </span>
      )}
      <FbarButton
        label="Highlight"
        tooltip="Highlight the selected text"
        active={picker === "hl"}
        disabled={disabled}
        onActivate={() => setPicker((p) => (p === "hl" ? null : "hl"))}
      >
        <span aria-hidden>🖍</span>
        <span className={styles.caret}>▾</span>
      </FbarButton>
      {picker === "hl" && (
        <span className={styles.fpop} role="group" aria-label="Highlight colors">
          {HIGHLIGHT_SWATCHES.map((sw) => (
            <button
              key={sw.variable}
              type="button"
              className={[
                styles.sw,
                sw.variable === "transparent" ? styles.swClear : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={
                sw.variable === "transparent"
                  ? undefined
                  : { background: `var(${sw.variable})` }
              }
              aria-label={sw.label}
              title={sw.label}
              tabIndex={-1}
              onClick={() => applyHighlight(sw.variable)}
            />
          ))}
        </span>
      )}

      <span className={styles.fsep} aria-hidden />

      {/* ── Lists & indentation (block-level — disabled on single-line
             fields via the bus capability advertisement) ── */}
      <FbarButton
        label="Bulleted list"
        tooltip="Turn the selected lines into a bulleted list"
        active={isOn("insertUnorderedList")}
        disabled={blockDisabled}
        disabledReason={ready ? SINGLE_LINE_TOOLTIP : undefined}
        onActivate={() => bus.executeCommand("insertUnorderedList")}
      >
        •
      </FbarButton>
      <FbarButton
        label="Numbered list"
        tooltip="Turn the selected lines into a numbered list"
        active={isOn("insertOrderedList")}
        disabled={blockDisabled}
        disabledReason={ready ? SINGLE_LINE_TOOLTIP : undefined}
        onActivate={() => bus.executeCommand("insertOrderedList")}
      >
        1.
      </FbarButton>
      <FbarButton
        label="Decrease indent"
        tooltip="Move the selected lines out one level"
        disabled={blockDisabled}
        disabledReason={ready ? SINGLE_LINE_TOOLTIP : undefined}
        onActivate={() => bus.executeCommand("outdent")}
      >
        ⇤
      </FbarButton>
      <FbarButton
        label="Increase indent"
        tooltip="Move the selected lines in one level"
        disabled={blockDisabled}
        disabledReason={ready ? SINGLE_LINE_TOOLTIP : undefined}
        onActivate={() => bus.executeCommand("indent")}
      >
        ⇥
      </FbarButton>

      <span className={styles.fsep} aria-hidden />

      {/* ── Link + resource ── */}
      <FbarButton
        label="Add link"
        tooltip="Link the selected text to a web address"
        active={picker === "link"}
        disabled={disabled || selCollapsed}
        disabledReason={ready ? COLLAPSED_LINK_TOOLTIP : undefined}
        onActivate={openLinkEditor}
      >
        <span aria-hidden>🔗</span>
      </FbarButton>
      {picker === "link" && (
        <span className={styles.linkPop}>
          <input
            className={styles.linkInput}
            type="text"
            inputMode="url"
            placeholder="https://…"
            aria-label="Link URL — press Enter to apply, Escape to cancel"
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              } else if (e.key === "Escape") {
                // Stop propagation so Esc cancels the link edit without also
                // closing a hosting LessonModal.
                e.preventDefault();
                e.stopPropagation();
                cancelLink();
              }
            }}
          />
        </span>
      )}
      <FbarButton
        label="Add a resource to this section"
        tooltip="Add a resource to this section"
        disabled={!onAddResource || sectionId === null}
        disabledReason="Click into a lesson section first — resources attach to the section you're working in"
        onActivate={addResource}
      >
        <span aria-hidden>📎</span>
      </FbarButton>
    </div>,
    document.querySelector(".cp-root") ?? document.body,
  );
}
