// lib/teach/annotation-tools.ts — the CANONICAL annotation tool vocabulary
// (Wave 5b: "one annotation toolbar everywhere"). This is the single source of
// truth for WHICH drawing tools exist, their labels, onboarding-tooltip copy,
// and the width presets. Every surface that renders annotation controls — the
// editor `BoardToolbar` and the present-mode panel in `BoardFullscreen` — derives
// its tool list from here, so the two can never drift apart again (the bug this
// wave fixes: present mode was missing shapes + width).
//
// ICON-AGNOSTIC BY DESIGN: each surface paints its own glyph for a tool value
// (the editor uses inline unicode spans; present uses the <Glyph> set). This
// file holds only the metadata the surfaces share — value, label, accessible
// label, tooltip copy, and a stable tooltipId. Keeping icons out means a single
// list serves a horizontal bar AND a vertical panel without forcing one icon
// system on both.

import type { BoardTool } from "./types";

/** Shared, presentation-independent metadata for one annotation tool. */
export interface AnnotationToolMeta {
  /** The engine tool value (lib/board-annotations understands these). */
  value: BoardTool;
  /** Short visible label. */
  label: string;
  /** Accessible label when it should differ from `label` (else `label`). */
  ariaLabel?: string;
  /** Onboarding-tooltip copy: what the tool ACCOMPLISHES, teacher-voiced
   *  (CLAUDE.md §4 — tell a first-timer what the control does in context). */
  title: string;
  /** Stable dismissible-tooltip id (lib/tooltip-dismissal.ts). */
  tooltipId: string;
}

/**
 * The canonical ordered tool set. Order is shared across surfaces so muscle
 * memory transfers between the editor and present mode:
 * select · pen · highlighter · eraser · rect · line · arrow · text.
 */
export const ANNOTATION_TOOLS: readonly AnnotationToolMeta[] = [
  {
    value: "select",
    label: "Select",
    ariaLabel: "Select / interact",
    title:
      "Stop drawing and interact with the board — click links, play videos, scroll the PDF",
    tooltipId: "teach-tool-select",
  },
  {
    value: "pen",
    label: "Pen",
    title: "Draw freehand on top of the board",
    tooltipId: "teach-tool-pen",
  },
  {
    value: "highlighter",
    label: "Highlighter",
    ariaLabel: "Highlighter",
    title: "Highlight with a wide, see-through marker",
    tooltipId: "teach-tool-highlighter",
  },
  {
    value: "eraser",
    label: "Eraser",
    title: "Tap or drag over a mark to remove the whole stroke",
    tooltipId: "teach-tool-eraser",
  },
  {
    value: "rect",
    label: "Box",
    title: "Drag to draw a rectangle around something",
    tooltipId: "teach-tool-rect",
  },
  {
    value: "line",
    label: "Line",
    title: "Drag to draw a straight line",
    tooltipId: "teach-tool-line",
  },
  {
    value: "arrow",
    label: "Arrow",
    title: "Drag to draw an arrow pointing at something",
    tooltipId: "teach-tool-arrow",
  },
  {
    value: "text",
    label: "Text",
    title: "Click to place a text label on the board",
    tooltipId: "teach-tool-text",
  },
] as const;

/** Look up a tool's metadata by value (undefined for an unknown value). */
export function annotationToolMeta(
  value: BoardTool,
): AnnotationToolMeta | undefined {
  return ANNOTATION_TOOLS.find((t) => t.value === value);
}

/** A stroke-width preset, shared by every width control. */
export interface AnnotationWidthPreset {
  /** Stroke width in CSS px at the board's native size. */
  value: number;
  /** Visible label. */
  label: string;
}

/** The three width presets (CSS px). Shared so the editor and present mode
 *  offer the same choices. The default selection is `ANNOTATION_DEFAULT_WIDTH`. */
export const ANNOTATION_WIDTHS: readonly AnnotationWidthPreset[] = [
  { value: 2, label: "Thin" },
  { value: 4, label: "Medium" },
  { value: 8, label: "Thick" },
] as const;

/** The default stroke width (CSS px) — the "Medium" preset. */
export const ANNOTATION_DEFAULT_WIDTH = 4;
