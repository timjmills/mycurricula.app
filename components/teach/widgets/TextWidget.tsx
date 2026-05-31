// TextWidget — an INTERACTIVE big-text display (Phase 3 widget library). A large
// centred announcement/instruction block: click (or focus + Enter/Space) to edit
// in a textarea overlay, blur or Enter commits, Escape cancels. The text and a
// four-step size (s/m/l/xl) persist via useWidgetState; a corner A−/A+ stepper
// changes the size. Empty state shows a dim "Click to add text" placeholder.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useWidgetState } from "@/lib/teach/use-widget-state";
import { TeachIcon } from "./icons";
import type { WidgetBodyProps } from "./types";
import styles from "./TextWidget.module.css";

/** Four display sizes, smallest → largest. */
type TextSize = "s" | "m" | "l" | "xl";
const SIZE_ORDER: readonly TextSize[] = ["s", "m", "l", "xl"];

/** Durable slice — the announcement text + its display size. */
interface TextPersisted extends Record<string, unknown> {
  text: string;
  size: TextSize;
}

/** Read defensible defaults from config (text + size). */
function readConfig(config: Record<string, unknown>): TextPersisted {
  const text = typeof config.text === "string" ? config.text : "";
  const rawSize = config.size;
  const size: TextSize =
    rawSize === "s" || rawSize === "m" || rawSize === "l" || rawSize === "xl"
      ? rawSize
      : "l";
  return { text, size };
}

/** Step the size up or down within the bounded order. */
function stepSize(size: TextSize, dir: 1 | -1): TextSize {
  const i = SIZE_ORDER.indexOf(size);
  const next = Math.max(0, Math.min(SIZE_ORDER.length - 1, i + dir));
  return SIZE_ORDER[next];
}

export function TextWidget({ widget }: WidgetBodyProps): ReactNode {
  const initial = useMemo<TextPersisted>(
    () => readConfig(widget.config),
    [widget.config],
  );
  const { state, setState } = useWidgetState<TextPersisted>(widget.id, initial);
  const { text, size } = state;

  const [editing, setEditing] = useState(false);
  // The draft lives locally while editing; it commits to persisted state on
  // blur / Enter, and is discarded on Escape.
  const [draft, setDraft] = useState(text);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Focus + select the textarea when entering edit mode.
  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus();
      taRef.current.select();
    }
  }, [editing]);

  const beginEdit = useCallback((): void => {
    setDraft(text);
    setEditing(true);
  }, [text]);

  const commit = useCallback((): void => {
    setState({ text: draft });
    setEditing(false);
  }, [draft, setState]);

  const cancel = useCallback((): void => {
    setEditing(false);
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      // Enter commits (Shift+Enter inserts a newline); Escape cancels.
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    },
    [commit, cancel],
  );

  // The display region is a real button so it's keyboard-reachable.
  const onDisplayKey = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>): void => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        beginEdit();
      }
    },
    [beginEdit],
  );

  const changeSize = useCallback(
    (dir: 1 | -1): void => {
      setState((prev) => ({ ...prev, size: stepSize(prev.size, dir) }));
    },
    [setState],
  );

  return (
    <div className={styles.body}>
      {/* Size stepper, top-right corner. */}
      <div className={styles.stepper}>
        <button
          type="button"
          className={styles.stepBtn}
          onClick={() => changeSize(-1)}
          disabled={size === SIZE_ORDER[0]}
          title="Make the text smaller"
          aria-label="Decrease text size"
        >
          <TeachIcon name="text" size={13} />
          <TeachIcon name="minus" size={11} />
        </button>
        <button
          type="button"
          className={styles.stepBtn}
          onClick={() => changeSize(1)}
          disabled={size === SIZE_ORDER[SIZE_ORDER.length - 1]}
          title="Make the text bigger"
          aria-label="Increase text size"
        >
          <TeachIcon name="text" size={16} />
          <TeachIcon name="plus" size={11} />
        </button>
      </div>

      {editing ? (
        <textarea
          ref={taRef}
          className={`${styles.editor} ${styles[`size_${size}`]}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          aria-label="Edit display text"
          placeholder="Type your message…"
        />
      ) : (
        <button
          type="button"
          className={`${styles.display} ${styles[`size_${size}`]} ${
            text ? "" : styles.empty
          }`}
          onClick={beginEdit}
          onKeyDown={onDisplayKey}
          aria-label={
            text ? `Display text: ${text}. Click to edit.` : "Add display text"
          }
          title="Click to edit this message"
        >
          <span className={styles.displayInner}>
            {text || "Click to add text"}
          </span>
        </button>
      )}
    </div>
  );
}
