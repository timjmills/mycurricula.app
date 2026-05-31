// NowNextThenWidget — a three-step Now / Next / Then flow (5.31 handoff,
// Lesson Essentials #2). Display-only: renders the configured steps, falling
// back to the handoff's read → talk → write example. The first row is the
// "active" step (accent inset ring).
//
// DEFAULT THEME: { bg: "blue", accent: "blue" } (Sky card, blue accent).

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon } from "./_WidgetKit";
import type { KitIconName } from "./_WidgetKit";
import styles from "./NowNextThenWidget.module.css";
import kit from "./widgets530.module.css";

interface Step {
  tag: string;
  icon: KitIconName;
  title: string;
}

const FALLBACK: Step[] = [
  { tag: "NOW", icon: "book", title: "Read the passage" },
  { tag: "NEXT", icon: "msg", title: "Turn and Talk" },
  { tag: "THEN", icon: "pencil", title: "Write your answer" },
];

const ICONS: readonly KitIconName[] = ["book", "msg", "pencil", "clipChk"];

function readSteps(config: Record<string, unknown>): Step[] {
  const raw = config.steps;
  if (Array.isArray(raw)) {
    const tags = ["NOW", "NEXT", "THEN"];
    const steps = raw
      .map((s, i): Step | null => {
        if (s && typeof s === "object") {
          const o = s as Record<string, unknown>;
          const title = typeof o.title === "string" ? o.title : null;
          if (title) {
            return {
              tag: typeof o.tag === "string" ? o.tag : (tags[i] ?? "STEP"),
              icon: ICONS[i % ICONS.length] ?? "book",
              title,
            };
          }
        }
        return null;
      })
      .filter((s): s is Step => s !== null);
    if (steps.length > 0) return steps;
  }
  return FALLBACK;
}

export function NowNextThenWidget({ widget }: WidgetBodyProps): ReactNode {
  const steps = readSteps(widget.config);

  return (
    <div className={kit.body}>
      <WHead label="Now–Next–Then" />
      <div className={styles.rows}>
        {steps.map((r, i) => (
          <div
            key={i}
            className={`${kit.card} ${styles.row} ${i === 0 ? styles.active : ""}`}
          >
            <span className={`${kit.chip} ${styles.rowChip}`}>
              <KitIcon name={r.icon} size={1.6} />
            </span>
            <div className={styles.rowMain}>
              <div className={styles.rowTag}>{r.tag}</div>
              <div className={styles.rowTitle}>{r.title}</div>
            </div>
            <span className={styles.rowNum}>{i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
