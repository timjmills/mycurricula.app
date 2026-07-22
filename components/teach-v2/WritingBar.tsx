"use client";

// components/teach-v2/WritingBar.tsx — the v2 board-stage writing bar (artboard
// "write-bar"). A RE-SKIN of the shipped annotation capabilities, not a new
// engine: the tools dispatch `setTool` onto the central workspace state (which
// the overlaid <AnnotationLayer> reads), the swatches drive the ink colour, and
// Clear calls the board-page annotation hook the shell owns.
//
// The right side carries the artboard's Add-Resource + Background popovers and a
// Widget entry point:
//   • Widget      → opens the Widget Library overlay (host-owned).
//   • Resource    → adds a lesson resource onto the active page (addResource
//                   intent). Routes through the editor's typed intent, never a
//                   raw url — the board-embed sink stays the one gate.
//   • Background  → sets the board paper by DESCRIPTOR ID (Wave-9a discipline:
//                   ids resolve to CSS via boardBackgroundCss; never a raw
//                   url() interpolation, no upload arm).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, ToggleGroup, Tooltip } from "@/components/ui";
import type { ToggleOption } from "@/components/ui";
import type { BoardTool } from "@/lib/teach/types";
import { ANNOTATION_SWATCHES } from "@/components/teach/annotation";
import type { ResourceItem, BoardEditorIntent } from "@/components/teach/board/editor";
import {
  BOARD_BACKGROUNDS,
  BOARD_BACKGROUND_CATEGORIES,
  boardBackgroundCss,
  type BoardBackgroundCategory,
} from "@/lib/teach/backgrounds";
import { V2Icon, type V2IconName } from "./icons";
import styles from "./WritingBar.module.css";

// The artboard's four-tool writing set (+ select to interact with widgets).
const WRITING_TOOLS: readonly {
  value: BoardTool;
  icon: V2IconName;
  label: string;
  title: string;
}[] = [
  { value: "select", icon: "expand", label: "Interact", title: "Stop drawing and click/drag widgets on the board" },
  { value: "pen", icon: "pen", label: "Pen", title: "Draw freehand on top of the board" },
  { value: "highlighter", icon: "highlighter", label: "Highlighter", title: "Highlight with a wide, see-through marker" },
  { value: "eraser", icon: "eraser", label: "Eraser", title: "Tap or drag over a mark to remove the whole stroke" },
  { value: "text", icon: "text", label: "Text", title: "Click to place a text label on the board" },
];

const TOOL_OPTIONS: Array<ToggleOption<BoardTool>> = WRITING_TOOLS.map((t) => ({
  value: t.value,
  label: t.label,
  ariaLabel: t.label,
  icon: <V2Icon name={t.icon} size={16} />,
  title: t.title,
  tooltipId: `teach-v2-tool-${t.value}`,
}));

// Compact swatch set — the four solid inks (highlighter reuses them).
const SWATCHES = ANNOTATION_SWATCHES.filter((s) =>
  ["ink", "urgent", "done", "subject"].includes(s.id),
);

export interface WritingBarProps {
  activeTool: BoardTool;
  onToolChange: (tool: BoardTool) => void;
  /** Selected ink swatch id + setter (board-stage local). */
  colorId: string;
  onColorChange: (id: string) => void;
  /** Erase every mark on the active page (the board-page annotation hook). */
  onClear: () => void;
  /** Whether any mark exists (disables Clear when empty). */
  hasMarks: boolean;
  /** Undo / redo the last board-ink mutation (bound to the annotation hook). */
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Open the Widget Library overlay (host-owned). Undefined → hidden. */
  onOpenWidgetLibrary: (() => void) | undefined;
  /** Lesson resources for the Add-Resource popover. */
  resources: readonly ResourceItem[];
  /** Emit a board intent (addResource / setBackground). */
  onEditorIntent: (intent: BoardEditorIntent) => void;
  /** The page the resource/background intents target. Null → the two popovers
   *  are disabled (no board/page to act on). */
  pageId: string | null;
  /** Signal popover open-state up so the shell's true-fullscreen Esc defers
   *  while a popover is on top (top-layer-only Esc). */
  onPopoverChange?: (open: boolean) => void;
}

export function WritingBar({
  activeTool,
  onToolChange,
  colorId,
  onColorChange,
  onClear,
  hasMarks,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onOpenWidgetLibrary,
  resources,
  onEditorIntent,
  pageId,
  onPopoverChange,
}: WritingBarProps): ReactNode {
  const [resOpen, setResOpen] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const [bgCat, setBgCat] = useState<BoardBackgroundCategory>("solid");
  const popRef = useRef<HTMLDivElement>(null);

  // Report whether either popover is open (top-layer-only Esc, shell-owned).
  // Cleanup reports closed so an unmount while open can't leave the shell's
  // Esc-defer flag stuck (state updates are batched, so no re-run flicker).
  useEffect(() => {
    onPopoverChange?.(resOpen || bgOpen);
    return () => onPopoverChange?.(false);
  }, [resOpen, bgOpen, onPopoverChange]);

  // Close popovers on outside click / Escape.
  useEffect(() => {
    if (!resOpen && !bgOpen) return;
    const onDown = (e: MouseEvent): void => {
      if (!popRef.current?.contains(e.target as Node)) {
        setResOpen(false);
        setBgOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        setResOpen(false);
        setBgOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [resOpen, bgOpen]);

  const addResource = (r: ResourceItem): void => {
    if (!pageId) return;
    onEditorIntent({
      type: "addResource",
      pageId,
      resource: r,
      canvas: { x: 120, y: 120, w: 320 },
    });
    setResOpen(false);
  };

  const setBackground = (id: string | null): void => {
    onEditorIntent({ type: "setBackground", background: id, scope: "board", pageId: pageId ?? undefined });
    setBgOpen(false);
  };

  const catBackgrounds = BOARD_BACKGROUNDS.filter((b) => b.category === bgCat);

  return (
    <div
      className={styles.bar}
      role="toolbar"
      aria-label="Writing tools"
      title="Draw, highlight, and annotate on top of the board"
    >
      {/* The tool row scrolls horizontally within its own bounds so every tool
          stays reachable at ≤480px (the labelled radiogroup is wider than a
          phone). min-width:0 lets the flex item shrink below its content width;
          overflow-x:auto then scrolls it — an internal scroll, never the page. */}
      <div className={styles.toolScroll}>
        <ToggleGroup<BoardTool>
          options={TOOL_OPTIONS}
          value={activeTool}
          onChange={onToolChange}
          size="sm"
          variant="prominent"
          ariaLabel="Drawing tool"
        />
      </div>

      <span className={styles.divider} aria-hidden="true" />

      <div className={styles.swatches} role="radiogroup" aria-label="Ink colour">
        {SWATCHES.map((sw) => {
          const active = sw.id === colorId;
          return (
            <Tooltip
              key={sw.id}
              content={`Use ${sw.label.toLowerCase()} for new marks`}
              side="top"
              tooltipId={`teach-v2-swatch-${sw.id}`}
            >
              <button
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={sw.label}
                className={`${styles.swatch} ${active ? styles.swatchOn : ""}`}
                style={{ background: `var(${sw.token})` }}
                onClick={() => onColorChange(sw.id)}
              />
            </Tooltip>
          );
        })}
      </div>

      <span className={styles.divider} aria-hidden="true" />

      {/* Undo / redo — bound to the board-page annotation history. */}
      <Button
        variant="icon"
        size="sm"
        iconAriaLabel="Undo"
        disabled={!canUndo}
        tooltip="Undo your last mark"
        onClick={onUndo}
      >
        <span aria-hidden="true">↶</span>
      </Button>
      <Button
        variant="icon"
        size="sm"
        iconAriaLabel="Redo"
        disabled={!canRedo}
        tooltip="Redo the mark you just undid"
        onClick={onRedo}
      >
        <span aria-hidden="true">↷</span>
      </Button>

      <span className={styles.divider} aria-hidden="true" />

      {/* Clear — destructive, always-on tooltip (CLAUDE.md §4). */}
      <Tooltip
        content="Erase every mark on this board page. This can't be undone after you leave."
        side="top"
        required
      >
        <Button
          variant="destructive"
          size="sm"
          disabled={!hasMarks}
          onClick={onClear}
          leadingIcon={<V2Icon name="trash" size={15} />}
        >
          Clear
        </Button>
      </Tooltip>

      <span className={styles.spacer} />

      <div className={styles.popWrap} ref={popRef}>
        {onOpenWidgetLibrary ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={onOpenWidgetLibrary}
            leadingIcon={<V2Icon name="plus" size={15} />}
            tooltip="Add a teaching widget to the board"
          >
            Widget
          </Button>
        ) : null}

        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setBgOpen(false);
            setResOpen((o) => !o);
          }}
          disabled={pageId == null}
          aria-haspopup="menu"
          aria-expanded={resOpen}
          leadingIcon={<V2Icon name="image" size={15} />}
          tooltip="Place one of this lesson's resources on the board"
        >
          Resource
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setResOpen(false);
            setBgOpen((o) => !o);
          }}
          disabled={pageId == null}
          aria-haspopup="menu"
          aria-expanded={bgOpen}
          leadingIcon={<V2Icon name="image" size={15} />}
          tooltip="Change the board's paper / background"
        >
          Background
        </Button>

        {resOpen ? (
          <div className={styles.pop} role="menu" aria-label="Add a resource">
            {resources.length === 0 ? (
              <p className={styles.popEmpty}>No resources on this lesson yet.</p>
            ) : (
              resources.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="menuitem"
                  className={styles.popRow}
                  onClick={() => addResource(r)}
                >
                  <span className={styles.popKind}>{r.kind}</span>
                  <span className={styles.popLabel}>{r.title}</span>
                </button>
              ))
            )}
          </div>
        ) : null}

        {bgOpen ? (
          <div className={`${styles.pop} ${styles.bgPop}`} role="menu" aria-label="Board background">
            <div className={styles.bgTabs}>
              {BOARD_BACKGROUND_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`${styles.bgTab} ${bgCat === c.id ? styles.bgTabOn : ""}`}
                  aria-pressed={bgCat === c.id}
                  onClick={() => setBgCat(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className={styles.bgSwatches}>
              {catBackgrounds.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={styles.bgSwatch}
                  style={{ background: boardBackgroundCss(b.id) ?? undefined }}
                  title={b.label}
                  aria-label={b.label}
                  onClick={() => setBackground(b.id)}
                />
              ))}
            </div>
            <button
              type="button"
              className={styles.bgClear}
              onClick={() => setBackground(null)}
            >
              Plain white
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
