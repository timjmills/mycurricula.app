// NotesWidget — free-form notes on a soft card, restyled into the 5.31 system
// (consumes the `--w-*` themeable vars + _WidgetKit). Display-only; reads
// `config.text`. Behaviour + export unchanged from v1. (The §13.4 rule still
// holds: the app default font, never Caveat.)
//
// DEFAULT THEME: { bg: "orange", accent: "orange" } (per widget-defaults SEEDS).

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon } from "./_WidgetKit";
import styles from "./NotesWidget.module.css";
import kit from "./widgets530.module.css";

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
    <div className={kit.body}>
      <WHead label="Notes" />
      <div className={`${kit.card} ${styles.note}`}>
        <span className={styles.noteIcon}>
          <KitIcon name="note" size={1.4} />
        </span>
        <p
          className={`${styles.text} ${isPlaceholder ? styles.placeholder : ""}`}
        >
          {text}
        </p>
      </div>
    </div>
  );
}
