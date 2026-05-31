// SentenceFramesWidget — language stems with blanks for academic talk (5.31
// handoff, Small Groups & Language #4). Display-only: renders each frame as a
// card. A "___" placeholder in the text renders as a visible blank chip so the
// stem reads as a fill-in.
//
// DEFAULT THEME: { bg: "orange", accent: "orange" } (Apricot card, orange).

import { Fragment } from "react";
import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon } from "./_WidgetKit";
import styles from "./SentenceFramesWidget.module.css";
import kit from "./widgets530.module.css";

const FALLBACK: string[] = [
  "I think ___ because ___.",
  "I agree with ___ because ___.",
  "Another idea is ___.",
  "The evidence shows ___.",
];

function readFrames(config: Record<string, unknown>): string[] {
  const raw = config.frames;
  if (Array.isArray(raw)) {
    const frames = raw.filter(
      (x): x is string => typeof x === "string" && x.trim().length > 0,
    );
    if (frames.length > 0) return frames;
  }
  return FALLBACK;
}

/** Split a frame on the "___" placeholder so blanks render as chips. */
function renderFrame(text: string): ReactNode {
  const parts = text.split(/_{2,}/);
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 ? (
        <span className={styles.blank} aria-label="blank" />
      ) : null}
    </Fragment>
  ));
}

export function SentenceFramesWidget({ widget }: WidgetBodyProps): ReactNode {
  const frames = readFrames(widget.config);

  return (
    <div className={kit.body}>
      <WHead label="Sentence Frames" />
      <div className={styles.list}>
        {frames.map((f, i) => (
          <div key={i} className={`${kit.card} ${styles.frame}`}>
            <span className={styles.quoteIcon}>
              <KitIcon name="msg" size={1.3} />
            </span>
            <span className={styles.frameText}>{renderFrame(f)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
