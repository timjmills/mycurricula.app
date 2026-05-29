"use client";

// components/teach/annotation/BoardToolbar.tsx — the LIVE annotation toolbar
// (plan §5.3, artboards T3/T4).
//
// Tool group (pen / highlighter / eraser / rect / line / arrow / text) via the
// canonical ToggleGroup → dispatch setTool. Colour swatches source from the
// --hl-* highlighter tokens + ink/subject/urgent/done tokens (NO hard-coded
// hex). Width stepper, undo/redo, and a destructive **Clear** (required
// tooltip, never dismissible per CLAUDE.md §4).
//
// The toolbar is presentation + dispatch: drawing state lives in the
// useBoardAnnotations hook the parent owns and passes in.

import { useMemo, type ReactNode } from "react";
import { Button, ToggleGroup, Tooltip } from "@/components/ui";
import type { ToggleOption } from "@/components/ui";
import type { TeachWorkspaceAction } from "@/components/teach";
import type { BoardTool, TeachWorkspaceState } from "@/lib/teach/types";
import type { UseBoardAnnotationsApi } from "@/lib/use-board-annotations";
import styles from "./BoardToolbar.module.css";

// ── Colour swatches — token names (resolved to CSS via var() at render) ──────
// Each swatch is a CSS custom-property name; the parent resolves the chosen one
// to a concrete colour string (for the canvas) via getComputedStyle. We pass
// the var() reference for the on-toolbar dot and the resolved value for ink.

export interface AnnotationSwatch {
  /** Stable id. */
  id: string;
  /** The CSS custom-property name, e.g. "--ink-900". */
  token: string;
  /** Accessible label. */
  label: string;
}

/** The fixed swatch palette — ink, subject, urgent, done + highlighter pens.
 *  All are tokens from app/tokens.css; never a literal hex. */
export const ANNOTATION_SWATCHES: readonly AnnotationSwatch[] = [
  { id: "ink", token: "--ink-900", label: "Black" },
  { id: "urgent", token: "--urgent", label: "Red" },
  { id: "done", token: "--done", label: "Green" },
  { id: "subject", token: "--writing", label: "Purple" },
  { id: "hl-lemon", token: "--hl-lemon", label: "Yellow highlighter" },
  { id: "hl-mint", token: "--hl-mint", label: "Green highlighter" },
  { id: "hl-maya", token: "--hl-maya", label: "Blue highlighter" },
  { id: "hl-violet", token: "--hl-violet", label: "Pink highlighter" },
] as const;

// ── Tool options ─────────────────────────────────────────────────────────

const TOOL_OPTIONS: Array<ToggleOption<BoardTool>> = [
  {
    value: "select",
    label: "Select",
    ariaLabel: "Select / interact",
    icon: <span aria-hidden="true">⬚</span>,
    title:
      "Stop drawing and interact with the resource — click links, play videos, scroll the PDF",
    tooltipId: "teach-tool-select",
  },
  {
    value: "pen",
    label: "Pen",
    icon: <span aria-hidden="true">✎</span>,
    title: "Draw freehand on top of the board",
    tooltipId: "teach-tool-pen",
  },
  {
    value: "highlighter",
    label: "Highlighter",
    ariaLabel: "Highlighter",
    icon: <span aria-hidden="true">▰</span>,
    title: "Highlight with a wide, see-through marker",
    tooltipId: "teach-tool-highlighter",
  },
  {
    value: "eraser",
    label: "Eraser",
    icon: <span aria-hidden="true">⌫</span>,
    title: "Tap or drag over a mark to remove the whole stroke",
    tooltipId: "teach-tool-eraser",
  },
  {
    value: "rect",
    label: "Box",
    icon: <span aria-hidden="true">▭</span>,
    title: "Drag to draw a rectangle around something",
    tooltipId: "teach-tool-rect",
  },
  {
    value: "line",
    label: "Line",
    icon: <span aria-hidden="true">╱</span>,
    title: "Drag to draw a straight line",
    tooltipId: "teach-tool-line",
  },
  {
    value: "arrow",
    label: "Arrow",
    icon: <span aria-hidden="true">↗</span>,
    title: "Drag to draw an arrow pointing at something",
    tooltipId: "teach-tool-arrow",
  },
  {
    value: "text",
    label: "Text",
    icon: <span aria-hidden="true">T</span>,
    title: "Click to place a text label on the board",
    tooltipId: "teach-tool-text",
  },
];

const WIDTHS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 2, label: "Thin" },
  { value: 4, label: "Medium" },
  { value: 8, label: "Thick" },
];

// ── Props ────────────────────────────────────────────────────────────────────

export interface BoardToolbarProps {
  state: TeachWorkspaceState;
  dispatch: (action: TeachWorkspaceAction) => void;
  annotations: UseBoardAnnotationsApi;
  /** Currently-selected swatch id. */
  colorId: string;
  onColorChange: (swatch: AnnotationSwatch) => void;
  /** Current stroke width (CSS px). */
  width: number;
  onWidthChange: (width: number) => void;
}

export function BoardToolbar({
  state,
  dispatch,
  annotations,
  colorId,
  onColorChange,
  width,
  onWidthChange,
}: BoardToolbarProps): ReactNode {
  const swatches = useMemo(() => ANNOTATION_SWATCHES, []);

  return (
    <div
      className={styles.bar}
      role="toolbar"
      aria-label="Annotation tools"
      title="Draw, highlight, and annotate on top of the board"
    >
      {/* Tool group */}
      <ToggleGroup<BoardTool>
        options={TOOL_OPTIONS}
        value={state.activeTool}
        onChange={(tool) => dispatch({ type: "setTool", tool })}
        size="sm"
        variant="prominent"
        ariaLabel="Drawing tool"
        className={styles.tools}
      />

      <span className={styles.divider} aria-hidden="true" />

      {/* Colour swatches */}
      <div
        className={styles.swatches}
        role="radiogroup"
        aria-label="Annotation colour"
      >
        {swatches.map((sw) => {
          const active = sw.id === colorId;
          return (
            <Tooltip
              key={sw.id}
              content={`Use ${sw.label.toLowerCase()} for new marks`}
              side="bottom"
              tooltipId={`teach-swatch-${sw.id}`}
            >
              <button
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={sw.label}
                className={[styles.swatch, active ? styles.swatchActive : ""]
                  .filter(Boolean)
                  .join(" ")}
                style={{ background: `var(${sw.token})` }}
                onClick={() => onColorChange(sw)}
              />
            </Tooltip>
          );
        })}
      </div>

      <span className={styles.divider} aria-hidden="true" />

      {/* Width */}
      <div
        className={styles.widths}
        role="radiogroup"
        aria-label="Stroke width"
      >
        {WIDTHS.map((w) => {
          const active = w.value === width;
          return (
            <Tooltip
              key={w.value}
              content={`${w.label} stroke`}
              side="bottom"
              tooltipId={`teach-width-${w.value}`}
            >
              <button
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`${w.label} stroke`}
                className={[styles.width, active ? styles.widthActive : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onWidthChange(w.value)}
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

      {/* Undo / redo */}
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
        content="Erase every mark on this board or resource. This can't be undone after you leave."
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
    </div>
  );
}
