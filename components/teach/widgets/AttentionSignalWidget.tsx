// AttentionSignalWidget — the call-and-response attention signal + a (display-
// only) ready-count (5.31 handoff, Routines & Management #2). Display-only.
//
// DEFAULT THEME: { bg: "blue", accent: "blue" } (Sky card, blue accent).

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon } from "./_WidgetKit";
import styles from "./AttentionSignalWidget.module.css";
import kit from "./widgets530.module.css";

function readString(
  config: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const v = config[key];
  return typeof v === "string" && v.trim().length > 0 ? v : fallback;
}

function readNumber(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const v = config[key];
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
}

export function AttentionSignalWidget({ widget }: WidgetBodyProps): ReactNode {
  const signal = readString(widget.config, "signal", "Eyes here • Voices off");
  const seconds = readNumber(widget.config, "seconds", 5);
  const ready = readNumber(widget.config, "ready", 19);
  const total = readNumber(widget.config, "total", 24);

  return (
    <div className={kit.body}>
      <WHead label="Attention Signal" />
      <div className={`${kit.card} ${styles.hero}`}>
        <span className={styles.mega}>
          <KitIcon name="mega" size={3.4} />
        </span>
        <div className={styles.signal}>{signal}</div>
        <span className={styles.ring}>
          <span className={styles.ringInner}>
            <span className={styles.ringNum}>{seconds}</span>
            <span className={styles.ringUnit}>sec</span>
          </span>
        </span>
      </div>
      <div className={styles.readyBar}>
        <KitIcon name="users" size={1.2} />
        {ready} / {total} ready
      </div>
    </div>
  );
}
