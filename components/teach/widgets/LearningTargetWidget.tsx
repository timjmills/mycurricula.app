// LearningTargetWidget — the "I can…" learning target + success criteria
// (5.31 handoff, Lesson Essentials #1). Display-only: renders the target
// statement + criteria checklist from `widget.config`, falling back to the
// handoff's reading example so an unconfigured tile still reads.
//
// DEFAULT THEME: { bg: "yellow", accent: "purple" } (Sunshine card, Lilac
// accent — the handoff's yellow-grad + purple chip/icon).

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon } from "./_WidgetKit";
import styles from "./LearningTargetWidget.module.css";
import kit from "./widgets530.module.css";

function readTarget(config: Record<string, unknown>): string {
  const t = config.target ?? config.iCan ?? config.text;
  return typeof t === "string" && t.trim().length > 0
    ? t
    : "I can explain how a character's actions affect the plot.";
}

function readCriteria(config: Record<string, unknown>): string[] {
  const c = config.criteria;
  if (Array.isArray(c)) {
    const items = c.filter((x): x is string => typeof x === "string");
    if (items.length > 0) return items;
  }
  return [
    "I can identify a character's important actions.",
    "I can explain how those actions change the plot.",
    "I can use text evidence to support my answer.",
  ];
}

export function LearningTargetWidget({ widget }: WidgetBodyProps): ReactNode {
  const target = readTarget(widget.config);
  const criteria = readCriteria(widget.config);

  return (
    <div className={`${kit.body} ${kit.tones}`}>
      <WHead label="Learning Target" />

      <div className={styles.hero}>
        <span className={styles.iconWrap}>
          <span className={`${kit.chip} ${styles.iconChip}`}>
            <KitIcon name="target" size={2.4} />
          </span>
          <span className={styles.sparkTop}>
            <KitIcon name="spark" size={0.9} />
          </span>
          <span className={styles.sparkBottom}>
            <KitIcon name="spark" size={0.8} />
          </span>
        </span>
        <div className={styles.target}>{target}</div>
      </div>

      <div className={styles.divider} />

      <div className={styles.critLabel}>Success Criteria:</div>
      <div className={styles.critList}>
        {criteria.map((c, i) => (
          <div key={i} className={styles.critRow}>
            <span className={styles.critCheck}>
              <KitIcon name="check" size={0.9} />
            </span>
            <span className={styles.critText}>{c}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
