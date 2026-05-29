// NotesWidget — free-form teacher notes on a paper tint, display-only
// (docs/teach-view-plan.md §4.5, §13.4). Per §13.4 the handwriting face is
// DROPPED — this uses the app's default (Geist) stack, not Caveat. The paper
// tint comes from the --board-tint-yellow token via the WidgetShell, so the
// body itself only renders the text. Reads `config.text`.

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import styles from "./widgets.module.css";

const FALLBACK =
  "Circulate during centers. Check in with the group working on partitioning into equal parts. Use fraction strips if needed.";

function readText(config: Record<string, unknown>): {
  text: string;
  isPlaceholder: boolean;
} {
  const t = config.text ?? config.notes;
  if (typeof t === "string" && t.trim().length > 0) {
    return { text: t, isPlaceholder: false };
  }
  return { text: FALLBACK, isPlaceholder: true };
}

export function NotesWidget({ widget }: WidgetBodyProps): ReactNode {
  const { text, isPlaceholder } = readText(widget.config);
  return (
    <div className={`${styles.body} ${styles.notes}`}>
      <div
        className={`${styles.notesText} ${isPlaceholder ? styles.notesPlaceholder : ""}`}
      >
        {text}
      </div>
    </div>
  );
}
