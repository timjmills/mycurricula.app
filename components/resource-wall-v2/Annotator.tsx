"use client";

// Annotator — pen / highlighter / eraser over one resource in the wall's
// lightbox (Wave 9a).
//
// ── This is an ADAPTER, not a new engine ───────────────────────────────────
// The repo already owns a hardened annotation stack (Wave 5), and this file
// composes it rather than re-implementing it:
//   • lib/board-annotations.ts   — the pure model + reducer + canvas renderer.
//   • lib/use-board-annotations.ts — state, DPR sizing, rAF-batched redraw.
//   • components/teach/annotation/AnnotationLayer — the pointer/canvas overlay.
//   • lib/teach/annotation-tools  — the canonical tool vocabulary + copy.
//   • BoardToolbar's ANNOTATION_SWATCHES — the token-named ink palette.
// A second engine would be a second set of bugs; it would also drift from the
// Teach board, where teachers learn these tools.
//
// ── Why NOT the artboard's canvas ──────────────────────────────────────────
// The artboard's `fit()` (resource-wall.jsx:282) re-rasterizes the canvas on
// every resize: `toDataURL()` → resize → `drawImage()` back at the new size.
// That is lossy by construction — each resize resamples the previous bitmap, so
// ink softens and compounds; it also stretches strokes non-uniformly on an
// aspect change, ignores devicePixelRatio (blurry on any HiDPI projector),
// makes undo impossible (pixels, not objects), and drops ink entirely if the
// element is 0×0 mid-layout. The engine here instead stores strokes as VECTORS
// in normalized 0..1 board-space and redraws from the model at box × DPR: a
// resize is lossless, undo is free, and the eraser removes whole strokes.
//
// ── Ink is EPHEMERAL ───────────────────────────────────────────────────────
// `ephemeral: true` — the hook's documented mode for exactly this surface: "the
// resource / notecard preview passes this so its ink is genuinely live-only …
// the product promises preview ink is never saved". Wall ink therefore lives
// for the viewing session only. Persisting it is a product decision (which
// board? which teacher? does it fork?) that Wave 9a does not own.
//
// ── Ink stays visible on all six themes ────────────────────────────────────
// A 2D canvas cannot parse `var(--token)`, so the token is resolved to a
// concrete value via getComputedStyle before it reaches the engine (the
// BoardFullscreen pattern), and re-resolved when `data-theme` flips — so the
// "Ink" swatch draws near-black on Paper and near-white on Night instead of
// disappearing into the background.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnnotationLayer } from "@/components/teach/annotation";
import { ANNOTATION_SWATCHES } from "@/components/teach/annotation/BoardToolbar";
import { Button, Tooltip } from "@/components/ui";
import {
  ANNOTATION_DEFAULT_WIDTH,
  ANNOTATION_TOOLS,
} from "@/lib/teach/annotation-tools";
import type { BoardTool } from "@/lib/teach/types";
import { useBoardAnnotations } from "@/lib/use-board-annotations";
import styles from "./Annotator.module.css";

/**
 * The wall's tool subset. `select` is included alongside the three drawing
 * tools even though the brief named only pen/highlighter/eraser: without it the
 * layer captures every pointer and the teacher can no longer scroll the PDF,
 * play the video, or click the link underneath. It is the "stop drawing" exit.
 */
const WALL_TOOLS: readonly BoardTool[] = [
  "select",
  "pen",
  "highlighter",
  "eraser",
];

const TOOL_GLYPHS: Partial<Record<BoardTool, ReactNode>> = {
  select: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 3l14 8-6 1.6L10.5 19z" />
    </svg>
  ),
  pen: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 19l3-1L19 7a2 2 0 0 0-3-3L5 15l-1 3 1 1Z" />
    </svg>
  ),
  highlighter: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 19h6M9 14l6-9 4 3-6 9H8l-2-2 3-1Z" />
    </svg>
  ),
  eraser: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 15l7-7 6 6-4 4H8zM14 20h6" />
    </svg>
  ),
};

const IconUndo = (): ReactNode => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </svg>
);
const IconClear = (): ReactNode => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
  </svg>
);

export interface AnnotatorProps {
  /** The lesson this resource was opened from — scopes the ink's sub-key. */
  lessonId: string | null;
  /** Stable identity of the annotated resource (its row id, else its URL). */
  resourceId: string;
}

/**
 * Ink + a floating toolbar over the lightbox stage. Renders an absolutely
 * positioned overlay, so the PARENT must be a positioned box sized to the
 * media (the lightbox stage is).
 */
export function Annotator({ lessonId, resourceId }: AnnotatorProps): ReactNode {
  const rootRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<BoardTool>("pen");
  const [swatchId, setSwatchId] = useState<string>(ANNOTATION_SWATCHES[0].id);

  const swatch = useMemo(
    () =>
      ANNOTATION_SWATCHES.find((s) => s.id === swatchId) ??
      ANNOTATION_SWATCHES[0],
    [swatchId],
  );

  // Ink is live-only for this viewing session (see the header).
  const annotations = useBoardAnnotations({
    lessonId,
    boardId: null,
    resourceId,
    ephemeral: true,
  });

  // ── Token → concrete color ────────────────────────────────────────────────
  // The canvas cannot parse `var(--token)`. Resolve it, and re-resolve on a
  // theme flip so new strokes track the theme's ink (Night's --ink-900 is
  // near-WHITE; drawing Paper's near-black there would be invisible).
  const [ink, setInk] = useState<string>("");
  useEffect(() => {
    const root = rootRef.current;
    if (root == null || typeof window === "undefined") return;
    const resolve = (): void => {
      const value = getComputedStyle(root)
        .getPropertyValue(swatch.token)
        .trim();
      if (value) setInk(value);
    };
    resolve();
    const observer = new MutationObserver(resolve);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-palette"],
    });
    return () => observer.disconnect();
  }, [swatch.token]);

  const tools = useMemo(
    () => ANNOTATION_TOOLS.filter((t) => WALL_TOOLS.includes(t.value)),
    [],
  );

  const { clear, undo, canUndo } = annotations;
  const handleClear = useCallback((): void => clear(), [clear]);

  return (
    <div ref={rootRef} className={styles.root}>
      <AnnotationLayer
        annotations={annotations}
        tool={tool}
        color={ink}
        width={ANNOTATION_DEFAULT_WIDTH}
      />

      <div
        className={styles.bar}
        role="toolbar"
        aria-label="Annotation tools"
        title="Draw, highlight, and erase on top of this resource"
        // The bar sits inside the stage: keep pointer + click events off the
        // canvas and off the lightbox's close-on-backdrop-click.
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {tools.map((t) => (
          <Tooltip
            key={t.value}
            content={t.title}
            tooltipId={t.tooltipId}
            side="top"
          >
            <Button
              variant="icon"
              size="sm"
              className={`${styles.tool} ${tool === t.value ? styles.toolOn : ""}`}
              iconAriaLabel={t.ariaLabel ?? t.label}
              aria-pressed={tool === t.value}
              onClick={() => setTool(t.value)}
            >
              {TOOL_GLYPHS[t.value]}
            </Button>
          </Tooltip>
        ))}

        <span className={styles.divider} aria-hidden="true" />

        <div
          className={styles.swatches}
          role="radiogroup"
          aria-label="Ink color"
        >
          {ANNOTATION_SWATCHES.map((s) => {
            const active = s.id === swatch.id;
            return (
              <Tooltip
                key={s.id}
                content={`Draw in ${s.label.toLowerCase()}`}
                tooltipId={`rw-annot-swatch-${s.id}`}
                side="top"
              >
                <button
                  type="button"
                  className={`${styles.swatch} ${active ? styles.swatchOn : ""}`}
                  role="radio"
                  aria-checked={active}
                  aria-label={s.label}
                  // The dot previews the token; the CANVAS gets the resolved
                  // value (see the header) — same token, two consumers.
                  style={
                    { "--swatch-c": `var(${s.token})` } as React.CSSProperties
                  }
                  onClick={() => setSwatchId(s.id)}
                />
              </Tooltip>
            );
          })}
        </div>

        <span className={styles.divider} aria-hidden="true" />

        <Tooltip
          content="Undo your last mark"
          tooltipId="rw-annot-undo"
          side="top"
        >
          <Button
            variant="icon"
            size="sm"
            className={styles.tool}
            iconAriaLabel="Undo the last mark"
            disabled={!canUndo}
            onClick={undo}
          >
            <IconUndo />
          </Button>
        </Tooltip>
        {/* Destructive → the tooltip is always on (CLAUDE.md §4 `required`). */}
        <Tooltip
          content="Erase every mark on this resource — this can't be undone"
          required
          side="top"
        >
          <Button
            variant="icon"
            size="sm"
            className={styles.tool}
            iconAriaLabel="Clear all marks"
            disabled={annotations.strokes.length === 0}
            onClick={handleClear}
          >
            <IconClear />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
