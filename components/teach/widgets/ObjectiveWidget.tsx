// ObjectiveWidget — the "I Can" objective tile + CCSS standard chips, restyled
// into the 5.31 visual system (consumes the `--w-*` themeable vars + _WidgetKit
// primitives). Display-only: renders the objective text and standard codes from
// `widget.config`, falling back to the prototype's fraction example so an
// unconfigured tile still reads. Behaviour + export are unchanged from v1.
//
// DEFAULT THEME: { bg: "yellow", accent: "purple" } (per widget-defaults SEEDS).

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon, Pill } from "./_WidgetKit";
import styles from "./ObjectiveWidget.module.css";
import kit from "./widgets530.module.css";

/** Read the objective text from config, with a faithful fallback. */
function readText(config: Record<string, unknown>): string {
  const t = config.iCan ?? config.objective ?? config.text;
  return typeof t === "string" && t.trim().length > 0
    ? t
    : "Find three equivalent fractions for a given fraction.";
}

/** Read the standard codes from config (array of strings), with a fallback. */
function readStandards(config: Record<string, unknown>): string[] {
  const s = config.standards;
  if (Array.isArray(s)) {
    const codes = s.filter((x): x is string => typeof x === "string");
    if (codes.length > 0) return codes;
  }
  return ["5.NF.B.3", "5.NF.A.1"];
}

export function ObjectiveWidget({ widget }: WidgetBodyProps): ReactNode {
  const text = readText(widget.config);
  const standards = readStandards(widget.config);

  return (
    <div className={`${kit.body} ${kit.tones}`}>
      <WHead label="Objective" />

      <div className={styles.hero}>
        <span className={`${kit.chip} ${styles.iconChip}`}>
          <KitIcon name="target" size={2.2} />
        </span>
        <div className={styles.main}>
          <span className={styles.pill}>I CAN</span>
          <div className={styles.text}>{text}</div>
        </div>
      </div>

      {standards.length > 0 ? (
        <div className={styles.standards}>
          <span className={styles.standardsLabel}>Standard:</span>
          {standards.map((code) => (
            <Pill key={code} tone="purple">
              {code}
            </Pill>
          ))}
        </div>
      ) : null}
    </div>
  );
}
