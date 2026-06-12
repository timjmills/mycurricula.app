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
// Chrome (6.12.26 §5 redesign): the toolbar is the floating `.rn-annoBar`
// pill — `--surface` pill, `--shadow-popover`, 5px padding — holding
// pen/highlighter/eraser, four 22px colour swatches, the stroke widths, and
// undo/redo/clear as 36px circular buttons (active = `--ink-900` bg /
// `--paper` glyph), every hit area inflated to ≥44px via ::after pads. While
// ink is on, the dark `.rn-ephemeral` pill ("Ink is temporary — it clears
// when you close") makes the wipe-on-close rule legible. All colour/radius/
// type via tokens (no hex); the destructive **Clear** carries a `required`
// tooltip (never dismissible, never a dialog — CLAUDE.md no-confirm rule).
// Drawing is keyboard-independent but every control is a real focusable
// button so the toolbar is fully keyboard reachable.

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
import { Button, Tooltip } from "@/components/ui";
import styles from "./PreviewAnnotation.module.css";

// ── Tool / swatch / width tables ─────────────────────────────────────────────
// A pared-down subset of the board toolbar: the three tools a teacher reaches
// for over a single enlarged resource (draw / highlight / erase). Shapes + text
// are board-canvas features and are intentionally left out of the scratch
// surface to keep it light.

interface ToolOption {
  value: BoardTool;
  label: string;
  icon: ReactNode;
  tip: string;
  tooltipId: string;
}

const TOOL_OPTIONS: readonly ToolOption[] = [
  {
    value: "pen",
    label: "Pen",
    icon: <PenIcon />,
    tip: "Draw freehand on top of this resource",
    tooltipId: "preview-annot-pen",
  },
  {
    value: "highlighter",
    label: "Highlighter",
    icon: <HighlighterIcon />,
    tip: "Highlight part of this resource with a wide, see-through marker",
    tooltipId: "preview-annot-highlighter",
  },
  {
    value: "eraser",
    label: "Eraser",
    icon: <EraserIcon />,
    tip: "Tap or drag over a mark to remove the whole stroke",
    tooltipId: "preview-annot-eraser",
  },
] as const;

/** Swatch palette — the §5 four: ink / urgent / done / lemon highlighter.
 *  Every entry is a token name from app/tokens.css; never a literal hex. */
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

      {/* Ephemeral-ink pill (§5) — makes the wipe-on-close rule legible the
          whole time ink is on. Decorative for pointers (pointer-events:none)
          so it never blocks a stroke beneath it. */}
      {active && (
        <span className={styles.ephemeral}>
          <PenIcon /> Ink is temporary — it clears when you close
        </span>
      )}

      {/* ── Floating pill toolbar (§5 .rn-annoBar) ─────────────────────────
          Bottom-centered over the media box. The "Annotate" toggle is always
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
          side="top"
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

            {/* Tools — pen / highlighter / eraser as 36px circular buttons.

                A11y semantics (§4a review L5): these were role="radio" inside
                a role="radiogroup", but WITHOUT the roving tabindex + ←/→
                arrow-key contract that role demands — a screen-reader user was
                promised radio behavior that didn't exist. Of the two
                conforming options (implement full radiogroup keyboard
                semantics, or drop the radio roles), we take the SIMPLER one:
                plain toggle buttons with aria-pressed in a labelled group.
                Every button stays individually Tab-reachable (matching how the
                rest of this toolbar already navigates) and the pressed state
                is announced honestly. The colour-swatch and stroke-width
                groups below get the identical treatment for the same reason. */}
            <div
              className={styles.tools}
              role="group"
              aria-label="Drawing tool"
            >
              {TOOL_OPTIONS.map((t) => {
                const isActive = t.value === tool;
                return (
                  <Tooltip
                    key={t.value}
                    content={t.tip}
                    side="top"
                    tooltipId={t.tooltipId}
                  >
                    <button
                      type="button"
                      aria-pressed={isActive}
                      aria-label={t.label}
                      className={[
                        styles.annoBtn,
                        isActive ? styles.annoBtnOn : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => setTool(t.value)}
                    >
                      {t.icon}
                    </button>
                  </Tooltip>
                );
              })}
            </div>

            <span className={styles.divider} aria-hidden="true" />

            {/* Colour swatches — disabled for the eraser (which has no colour).
                aria-pressed toggle buttons, not radios — see the L5 note on the
                tools group above. */}
            <div
              className={styles.swatches}
              role="group"
              aria-label="Annotation colour"
            >
              {SWATCHES.map((sw) => {
                const isActive = sw.id === colorId;
                return (
                  <Tooltip
                    key={sw.id}
                    content={`Use ${sw.label.toLowerCase()} for new marks`}
                    side="top"
                    tooltipId={`preview-annot-swatch-${sw.id}`}
                  >
                    <button
                      type="button"
                      aria-pressed={isActive}
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

            {/* Stroke width — aria-pressed toggle buttons, not radios (L5,
                same rationale as the tools group). */}
            <div
              className={styles.widths}
              role="group"
              aria-label="Stroke width"
            >
              {WIDTHS.map((w) => {
                const isActive = w.value === width;
                return (
                  <Tooltip
                    key={w.value}
                    content={`${w.label} stroke`}
                    side="top"
                    tooltipId={`preview-annot-width-${w.value}`}
                  >
                    <button
                      type="button"
                      aria-pressed={isActive}
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
            <Tooltip content="Undo your last mark" side="top">
              <button
                type="button"
                aria-label="Undo"
                disabled={!annotations.canUndo}
                className={styles.annoBtn}
                onClick={annotations.undo}
              >
                <UndoIcon />
              </button>
            </Tooltip>
            <Tooltip content="Redo the mark you just undid" side="top">
              <button
                type="button"
                aria-label="Redo"
                disabled={!annotations.canRedo}
                className={styles.annoBtn}
                onClick={annotations.redo}
              >
                <RedoIcon />
              </button>
            </Tooltip>

            <span className={styles.divider} aria-hidden="true" />

            {/* Clear all ink — bulk-destructive, so the tooltip stays ALWAYS-ON
                (CLAUDE.md §4 `required`; a warning, never a confirm dialog).
                Copy is truthful (§4a review L4): CLEAR pushes the annotation
                history, so the adjacent Undo CAN restore the wiped strokes —
                the old "can't be undone" claim was false and would scare
                teachers off a recoverable action. `required` is kept because
                one tap still wipes every stroke at once. */}
            <Tooltip
              content="Clear all ink from this preview — the Undo button can bring it back; everything clears anyway when you close"
              side="top"
              required
            >
              <button
                type="button"
                aria-label="Clear all ink"
                disabled={annotations.strokes.length === 0}
                className={`${styles.annoBtn} ${styles.annoBtnDanger}`}
                onClick={annotations.clear}
              >
                <TrashIcon />
              </button>
            </Tooltip>
          </>
        )}
      </div>
    </div>
  );
}

// ── Icons (Lucide-family line icons, per the §5 artboards) ──────────────────

function PenIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function HighlighterIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 11l4 4L21 7l-4-4z" />
      <path d="M9 11l-4 4 2 2-3 3h6l1-1 2 2" />
    </svg>
  );
}

function EraserIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 20H8L3 15a2 2 0 0 1 0-2.8l8.2-8.2a2 2 0 0 1 2.8 0l6 6a2 2 0 0 1 0 2.8L14 19" />
    </svg>
  );
}

function UndoIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </svg>
  );
}

function RedoIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h3" />
    </svg>
  );
}

function TrashIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
    </svg>
  );
}
