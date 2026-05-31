"use client";

// WidgetSettingsPopover — the minimal per-widget settings surface for v1
// (audit G2). A full per-widget editor is a Phase 3 surface (the interactive
// widget library), so v1 ships editors for the two common, safe-to-edit
// fields — the Objective "I Can" text and the Timer's duration in minutes —
// and shows an honest "more settings coming soon" note for every other widget
// type rather than a dead cog.
//
// Edits write STRUCTURE only through the `teach` repo (CLAUDE.md §11.4 — never
// student names). Mounted by TeachWorkspace, which owns the active board +
// reloadBoards. Tokens-only; client-only.

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { teachClient as teach } from "@/lib/teach/client";
import type { Board, Widget } from "@/lib/types";
import { useFocusTrap } from "./useFocusTrap";
import styles from "./BoardSettingsPopover.module.css";

export interface WidgetSettingsPopoverProps {
  /** The widget being configured. */
  widget: Widget;
  /** Close the popover. */
  onClose: () => void;
  /** Re-read the active board set after a mutating repo call. */
  reloadBoards: () => Promise<Board[]>;
}

/** Read the objective text from a config (mirrors ObjectiveWidget). */
function readObjective(config: Record<string, unknown>): string {
  const t = config.iCan ?? config.objective ?? config.text;
  return typeof t === "string" ? t : "";
}

/** Read the timer duration (minutes) from a config (mirrors TimerWidget). */
function readMinutes(config: Record<string, unknown>): number {
  const secs =
    typeof config.durationSeconds === "number" && config.durationSeconds > 0
      ? config.durationSeconds
      : 300;
  return Math.max(1, Math.round(secs / 60));
}

export function WidgetSettingsPopover({
  widget,
  onClose,
  reloadBoards,
}: WidgetSettingsPopoverProps): ReactNode {
  const editable = widget.type === "objective" || widget.type === "timer";
  const [objective, setObjective] = useState(() =>
    readObjective(widget.config),
  );
  const [minutes, setMinutes] = useState(() => readMinutes(widget.config));
  const [busy, setBusy] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLElement>(null);
  useFocusTrap({ containerRef: dialogRef, initialFocusRef: firstFieldRef });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSave(): Promise<void> {
    if (!editable) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      const nextConfig: Record<string, unknown> = { ...widget.config };
      if (widget.type === "objective") {
        nextConfig.iCan = objective.trim();
      } else if (widget.type === "timer") {
        const m = Math.max(1, Math.min(180, Math.round(minutes) || 1));
        nextConfig.durationSeconds = m * 60;
        // Reset any cached remaining so the body shows the new duration.
        delete nextConfig.remainingSeconds;
      }
      await teach.updateWidget(widget.id, { config: nextConfig });
      await reloadBoards();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={styles.scrim}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={`Settings for the "${widget.title}" widget`}
      >
        <header className={styles.head}>
          <h2 className={styles.title}>Widget settings</h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close widget settings"
          >
            ✕
          </button>
        </header>

        {widget.type === "objective" ? (
          <>
            <label className={styles.fieldLabel} htmlFor="widget-objective">
              &ldquo;I Can&rdquo; statement
            </label>
            <input
              id="widget-objective"
              ref={firstFieldRef as React.RefObject<HTMLInputElement>}
              className={styles.input}
              value={objective}
              disabled={busy}
              placeholder="I can…"
              onChange={(e) => setObjective(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSave();
              }}
            />
          </>
        ) : widget.type === "timer" ? (
          <>
            <label className={styles.fieldLabel} htmlFor="widget-minutes">
              Timer length (minutes)
            </label>
            <input
              id="widget-minutes"
              ref={firstFieldRef as React.RefObject<HTMLInputElement>}
              className={styles.input}
              type="number"
              min={1}
              max={180}
              value={minutes}
              disabled={busy}
              onChange={(e) => setMinutes(Number(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSave();
              }}
            />
          </>
        ) : (
          <p className={styles.hint}>
            Detailed settings for this widget are coming after beta. For now you
            can move, pin, expand, or remove it from the board.
          </p>
        )}

        <div
          className={styles.dangerRow}
          style={{ justifyContent: "flex-end" }}
        >
          <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>
            {editable ? "Cancel" : "Close"}
          </Button>
          {editable ? (
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => void handleSave()}
            >
              Save
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
