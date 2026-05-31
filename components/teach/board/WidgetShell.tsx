// WidgetShell — the widget tile chrome (docs/teach-view-plan.md §4.3, T1).
// Wraps a widget body in the bordered, tinted tile and exposes the hover/focus
// header chrome: drag handle · pin · expand (→ Focus) · settings · remove. The
// chrome is HIDDEN entirely in Present mode (`present` prop) for projection
// clarity. The drag handle registers a dnd-kit draggable carrying a
// `TeachWidgetDragData` payload so the board can reorder widgets.
//
// remove is DESTRUCTIVE → its tooltip is `required` (CLAUDE.md §4). Tooltips on
// every non-obvious control carry a stable `tooltipId` for the dismissible
// onboarding system.

"use client";

import type { ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Tooltip } from "@/components/ui";
import type { SubjectId, Widget } from "@/lib/types";
import type { TeachWidgetDragData } from "@/lib/teach/types";
import { WidgetBody } from "../widgets/WidgetBody";
import { widgetMeta, boardTintVar, TeachIcon } from "../widgets";
import styles from "./board.module.css";

export interface WidgetShellProps {
  widget: Widget;
  /** Lesson subject for tinted bodies. */
  subjectId?: SubjectId;
  /** Present mode hides all chrome. */
  present?: boolean;
  /** Expand → Focus mode (dispatch focusWidget). */
  onExpand?: (widgetId: string) => void;
  /** Toggle the pinned flag (persisted by the integrator via the repo). */
  onTogglePin?: (widget: Widget) => void;
  /** Open the widget settings (Phase: integrator wires the editor). */
  onSettings?: (widget: Widget) => void;
  /** Remove the widget from the board (destructive). */
  onRemove?: (widget: Widget) => void;
}

export function WidgetShell({
  widget,
  subjectId,
  present = false,
  onExpand,
  onTogglePin,
  onSettings,
  onRemove,
}: WidgetShellProps): ReactNode {
  const meta = widgetMeta(widget.type);
  const dragData: TeachWidgetDragData = {
    kind: "widget",
    widgetId: widget.id,
    boardId: widget.boardId,
  };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `widget:${widget.id}`,
    data: dragData,
  });

  const tileBg = boardTintVar(meta?.tint ?? "none");

  return (
    <div
      ref={setNodeRef}
      className={`${styles.tile} ${isDragging ? styles.tileDragging : ""}`}
      style={
        tileBg
          ? ({ ["--tile-bg" as string]: tileBg } as React.CSSProperties)
          : undefined
      }
      title={widget.title}
    >
      {!present ? (
        <div className={styles.tileHeader}>
          <span className={styles.kicker}>
            {meta?.kicker ?? widget.title.toUpperCase()}
          </span>
          <span className={styles.headerSpacer} />
          <div className={styles.chrome}>
            <Tooltip
              content="Drag to move this widget to another cell"
              tooltipId="teach-widget-drag"
            >
              <button
                type="button"
                className={`${styles.chromeBtn} ${styles.dragHandle}`}
                aria-label="Move widget"
                {...listeners}
                {...attributes}
              >
                <TeachIcon name="more" size={14} />
              </button>
            </Tooltip>

            <Tooltip
              content={
                widget.pinned
                  ? "Unpin — let this widget reflow when the layout changes"
                  : "Pin this widget so it stays put when the layout changes"
              }
              tooltipId="teach-widget-pin"
            >
              <button
                type="button"
                className={`${styles.chromeBtn} ${widget.pinned ? styles.chromeBtnActive : ""}`}
                aria-pressed={widget.pinned}
                aria-label={widget.pinned ? "Unpin widget" : "Pin widget"}
                onClick={() => onTogglePin?.(widget)}
              >
                <TeachIcon name={widget.pinned ? "pinned" : "pin"} size={14} />
              </button>
            </Tooltip>

            <Tooltip
              content="Expand this widget to fill the board (Focus mode)"
              tooltipId="teach-widget-expand"
            >
              <button
                type="button"
                className={styles.chromeBtn}
                aria-label="Expand widget to focus"
                onClick={() => onExpand?.(widget.id)}
              >
                <TeachIcon name="expand" size={14} />
              </button>
            </Tooltip>

            <Tooltip
              content="Edit this widget's settings"
              tooltipId="teach-widget-settings"
            >
              <button
                type="button"
                className={styles.chromeBtn}
                aria-label="Widget settings"
                onClick={() => onSettings?.(widget)}
              >
                <TeachIcon name="cog" size={14} />
              </button>
            </Tooltip>

            <Tooltip content="Remove this widget from the board" required>
              <button
                type="button"
                className={styles.chromeBtn}
                aria-label="Remove widget"
                onClick={() => onRemove?.(widget)}
              >
                <TeachIcon name="x" size={14} />
              </button>
            </Tooltip>
          </div>
        </div>
      ) : null}

      <div className={styles.tileBody}>
        <WidgetBody widget={widget} subjectId={subjectId} />
      </div>
    </div>
  );
}
