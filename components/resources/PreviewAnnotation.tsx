"use client";

// components/resources/PreviewAnnotation.tsx — LIVE-ONLY "draw on the enlarged
// resource" surface for ResourcePreview / NotecardFullscreen.
//
// The Teach board's annotation overlay (AnnotationLayer) is reused here, but the
// behavior is deliberately DIFFERENT from a board: ink drawn over an enlarged
// resource is SCRATCH — it is wiped when the preview closes and never persists.
// (Persistent annotation only happens when a resource is loaded onto a Teach
// board — that path is unchanged and out of scope here.)
//
// HOW THE WIPE IS GUARANTEED. `useBoardAnnotations` is invoked with
// `ephemeral: true`, so it NEVER reads from or writes to localStorage — the ink
// lives only in the hook's in-memory reducer for the lifetime of this mount.
// Closing the preview unmounts the layer and the strokes are gone; there is no
// on-disk copy to leak, and a tab killed mid-draw cannot orphan a stroke blob in
// storage (the product promises preview ink is "never saved"). Toggling
// annotation OFF (or pressing Clear) also clears the in-memory strokes
// immediately so re-enabling within the same open starts blank.
//
// This component is NOT the BoardToolbar (that one is coupled to the Teach
// workspace dispatch). It is a SMALL, self-contained toolbar driven by local
// `tool` / `color` / `width` React state plus a local `useBoardAnnotations()`
// instance, exactly as the integration brief requires.
//
// Chrome (CLAUDE.md §4): every colour/radius/type via tokens; the swatches are
// `--hl-*` / ink / urgent / done token references (no hex). ≥44px touch targets
// on phone. Tooltips on every non-obvious control; the destructive **Clear**
// carries a `required` tooltip (never dismissible). The toolbar fade + the
// layer respect prefers-reduced-motion (handled in the CSS module / the
// AnnotationLayer). Drawing is keyboard-independent but every control is a real
// focusable button so the toolbar is fully keyboard reachable.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { BoardTool } from "@/lib/teach/types";
import { useBoardAnnotations } from "@/lib/use-board-annotations";
import { AnnotationLayer } from "@/components/teach/annotation";
import { Button, Tooltip, ToggleGroup } from "@/components/ui";
import type { ToggleOption } from "@/components/ui";
import styles from "./PreviewAnnotation.module.css";

// ── Tool / swatch / width tables ─────────────────────────────────────────────
// A pared-down subset of the board toolbar: the three tools a teacher reaches
// for over a single enlarged resource (draw / highlight / erase). Shapes + text
// are board-canvas features and are intentionally left out of the scratch
// surface to keep it light.

const TOOL_OPTIONS: Array<ToggleOption<BoardTool>> = [
  {
    value: "pen",
    label: "Pen",
    icon: <span aria-hidden="true">✎</span>,
    title: "Draw freehand on top of this resource",
    tooltipId: "preview-annot-pen",
  },
  {
    value: "highlighter",
    label: "Highlighter",
    ariaLabel: "Highlighter",
    icon: <span aria-hidden="true">▰</span>,
    title: "Highlight part of this resource with a wide, see-through marker",
    tooltipId: "preview-annot-highlighter",
  },
  {
    value: "eraser",
    label: "Eraser",
    icon: <span aria-hidden="true">⌫</span>,
    title: "Tap or drag over a mark to remove the whole stroke",
    tooltipId: "preview-annot-eraser",
  },
];

/** Swatch palette — ink / urgent / done + the four highlighter pens. Every
 *  entry is a token name from app/tokens.css; never a literal hex. */
interface Swatch {
  id: string;
  token: string;
  label: string;
}

const SWATCHES: readonly Swatch[] = [
  { id: "ink", token: "--ink-900", label: "Black" },
  { id: "urgent", token: "--urgent", label: "Red" },
  { id: "done", token: "--done", label: "Green" },
  { id: "hl-lemon", token: "--hl-lemon", label: "Yellow highlighter" },
  { id: "hl-mint", token: "--hl-mint", label: "Green highlighter" },
  { id: "hl-maya", token: "--hl-maya", label: "Blue highlighter" },
  { id: "hl-violet", token: "--hl-violet", label: "Pink highlighter" },
] as const;

const WIDTHS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 2, label: "Thin" },
  { value: 4, label: "Medium" },
  { value: 8, label: "Thick" },
];

/** Resolve a CSS custom-property name to a concrete colour string for the
 *  canvas. The reducer/renderer needs a real colour, not a `var()` reference. */
function resolveToken(token: string): string {
  if (typeof window === "undefined") return "#000";
  const resolved = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  // Fall back to ink if a token somehow resolves empty (SSR / missing var).
  return resolved || "#000";
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface PreviewAnnotationProps {
  /** The media to draw over — the preview body (image / iframe / video). It is
   *  rendered inside a positioned box so the absolutely-filled annotation
   *  canvas locks to exactly the media's box. */
  children: ReactNode;
  /** Optional extra class on the positioned media box (sizing from the host). */
  className?: string;
}

/**
 * A media box with a toggleable live-only annotation overlay + a small local
 * toolbar. Drawing state lives in a local `useBoardAnnotations()` instance
 * keyed to a unique single-mount scratch key, so nothing persists past close.
 */
export function PreviewAnnotation({
  children,
  className,
}: PreviewAnnotationProps): ReactNode {
  // Annotation off by default — the resource stays fully interactive (links,
  // video controls, PDF scroll) until the teacher opts into drawing.
  const [active, setActive] = useState(false);
  const [tool, setTool] = useState<BoardTool>("pen");
  const [colorId, setColorId] = useState<string>("ink");
  const [width, setWidth] = useState<number>(4);

  // Live-only scratch ink: `ephemeral` makes the hook skip localStorage entirely
  // (no read, no write), so this surface can never persist and the next open
  // always starts blank. The `__live-preview` ids are just nominal — with
  // ephemeral on they key nothing on disk.
  const annotations = useBoardAnnotations({
    lessonId: "__live-preview",
    boardId: "__live-preview",
    resourceId: "preview",
    ephemeral: true,
  });

  // Resolve the chosen swatch token to a concrete colour for the canvas.
  const color = useMemo(() => {
    const swatch = SWATCHES.find((s) => s.id === colorId) ?? SWATCHES[0];
    return resolveToken(swatch.token);
  }, [colorId]);

  // Wipe scratch ink the instant annotation is turned off (flushes empty to
  // storage → deletes the entry) so the resource is clean if re-enabled and the
  // session leaves no orphan.
  const { clear } = annotations;
  const turnOff = useCallback(() => {
    clear();
    setActive(false);
  }, [clear]);

  const toggleActive = useCallback(() => {
    if (active) turnOff();
    else setActive(true);
  }, [active, turnOff]);

  // Belt-and-braces wipe on unmount (hard close via Esc / backdrop) — the
  // unique key already isolates the next open, but clearing keeps the in-flight
  // dispatch tidy. Stored in a ref so the cleanup never re-subscribes.
  const clearRef = useRef(clear);
  clearRef.current = clear;
  useEffect(() => {
    return () => {
      clearRef.current();
    };
  }, []);

  return (
    <div className={[styles.box, className].filter(Boolean).join(" ")}>
      {/* The media itself — fully interactive when annotation is off. */}
      {children}

      {/* The drawing canvas — only mounted while annotation is active, so an
          un-annotated preview carries zero canvas/pointer overhead. When the
          tool is a draw tool the layer captures pointer events; we never pass
          "select" here (the Annotate toggle owns the on/off state instead). */}
      {active && (
        <AnnotationLayer
          annotations={annotations}
          tool={tool}
          color={color}
          width={width}
        />
      )}

      {/* ── Floating toolbar ───────────────────────────────────────────────
          Sits over the top of the media box. The "Annotate" toggle is always
          present; the tool/colour/width/clear controls appear only while
          annotation is active. */}
      <div
        className={styles.toolbar}
        role="toolbar"
        aria-label="Annotation tools"
      >
        {/* Dismissible onboarding tooltip via a wrapping <Tooltip> (the Button
            primitive's own `tooltip` prop is always-on; `tooltipId` lives on
            Tooltip). */}
        <Tooltip
          content={
            active
              ? "Stop drawing and clear your marks — this scratch ink is never saved"
              : "Draw, highlight, and erase on top of this resource — your marks are temporary and clear when you close"
          }
          side="bottom"
          tooltipId="preview-annot-toggle"
        >
          <Button
            variant={active ? "primary" : "secondary"}
            size="sm"
            onClick={toggleActive}
            aria-pressed={active}
          >
            {active ? "Done" : "Annotate"}
          </Button>
        </Tooltip>

        {active && (
          <>
            <span className={styles.divider} aria-hidden="true" />

            <ToggleGroup<BoardTool>
              options={TOOL_OPTIONS}
              value={tool}
              onChange={setTool}
              size="sm"
              variant="prominent"
              ariaLabel="Drawing tool"
              className={styles.tools}
            />

            <span className={styles.divider} aria-hidden="true" />

            {/* Colour swatches — disabled for the eraser (which has no colour). */}
            <div
              className={styles.swatches}
              role="radiogroup"
              aria-label="Annotation colour"
            >
              {SWATCHES.map((sw) => {
                const isActive = sw.id === colorId;
                return (
                  <Tooltip
                    key={sw.id}
                    content={`Use ${sw.label.toLowerCase()} for new marks`}
                    side="bottom"
                    tooltipId={`preview-annot-swatch-${sw.id}`}
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      aria-label={sw.label}
                      disabled={tool === "eraser"}
                      className={[
                        styles.swatch,
                        isActive ? styles.swatchActive : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={{ background: `var(${sw.token})` }}
                      onClick={() => setColorId(sw.id)}
                    />
                  </Tooltip>
                );
              })}
            </div>

            <span className={styles.divider} aria-hidden="true" />

            {/* Stroke width. */}
            <div
              className={styles.widths}
              role="radiogroup"
              aria-label="Stroke width"
            >
              {WIDTHS.map((w) => {
                const isActive = w.value === width;
                return (
                  <Tooltip
                    key={w.value}
                    content={`${w.label} stroke`}
                    side="bottom"
                    tooltipId={`preview-annot-width-${w.value}`}
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      aria-label={`${w.label} stroke`}
                      className={[
                        styles.width,
                        isActive ? styles.widthActive : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => setWidth(w.value)}
                    >
                      <span
                        className={styles.widthDot}
                        style={{ height: w.value, width: w.value }}
                        aria-hidden="true"
                      />
                    </button>
                  </Tooltip>
                );
              })}
            </div>

            <span className={styles.divider} aria-hidden="true" />

            {/* Undo / redo. */}
            <Button
              variant="icon"
              size="sm"
              iconAriaLabel="Undo"
              disabled={!annotations.canUndo}
              tooltip="Undo your last mark"
              onClick={annotations.undo}
            >
              <span aria-hidden="true">↶</span>
            </Button>
            <Button
              variant="icon"
              size="sm"
              iconAriaLabel="Redo"
              disabled={!annotations.canRedo}
              tooltip="Redo the mark you just undid"
              onClick={annotations.redo}
            >
              <span aria-hidden="true">↷</span>
            </Button>

            <span className={styles.divider} aria-hidden="true" />

            {/* Clear — destructive, always-on tooltip (CLAUDE.md §4). */}
            <Tooltip
              content="Erase every mark on this resource. Your scratch ink is never saved anyway."
              side="bottom"
              required
            >
              <Button
                variant="destructive"
                size="sm"
                disabled={annotations.strokes.length === 0}
                onClick={annotations.clear}
              >
                Clear
              </Button>
            </Tooltip>
          </>
        )}
      </div>
    </div>
  );
}
