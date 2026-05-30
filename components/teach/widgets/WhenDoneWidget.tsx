// WhenDoneWidget — the "when you're done" choice board: a MUST-DO row and a
// MAY-DO row of activity cards (5.31 handoff, Routines & Management #4).
// Display-only.
//
// DEFAULT THEME: { bg: "orange", accent: "orange" } (Apricot card, orange).

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon } from "./_WidgetKit";
import type { KitIconName, Tone } from "./_WidgetKit";
import styles from "./WhenDoneWidget.module.css";
import kit from "./widgets530.module.css";

interface DoItem {
  icon: KitIconName;
  text: string;
  fam: Extract<Tone, "green" | "orange" | "blue" | "purple">;
}

const MUST_FALLBACK: DoItem[] = [
  { icon: "book", text: "Read independently", fam: "green" },
  { icon: "pencil", text: "Reflect in your journal", fam: "orange" },
  { icon: "clipChk", text: "Check your answers", fam: "green" },
];

const MAY_FALLBACK: DoItem[] = [
  { icon: "headset", text: "Reading on Epic!", fam: "blue" },
  { icon: "puzzle", text: "Puzzle Challenge", fam: "purple" },
  { icon: "marker", text: "Draw & Create", fam: "green" },
];

const FAMS: DoItem["fam"][] = ["green", "orange", "blue", "purple"];
const ICONS: readonly KitIconName[] = [
  "book",
  "pencil",
  "clipChk",
  "headset",
  "puzzle",
  "marker",
];

function readItems(
  config: Record<string, unknown>,
  key: string,
  fallback: DoItem[],
): DoItem[] {
  const raw = config[key];
  if (Array.isArray(raw)) {
    const items = raw
      .map((m, i): DoItem | null => {
        const text =
          typeof m === "string"
            ? m
            : m && typeof m === "object" && typeof (m as Record<string, unknown>).text === "string"
              ? ((m as Record<string, unknown>).text as string)
              : null;
        return text
          ? {
              text,
              icon: ICONS[i % ICONS.length] ?? "book",
              fam: FAMS[i % FAMS.length]!,
            }
          : null;
      })
      .filter((m): m is DoItem => m !== null);
    if (items.length > 0) return items;
  }
  return fallback;
}

function DoCard({ icon, text, fam }: DoItem): ReactNode {
  return (
    <div className={`${kit.card} ${styles.doCard}`}>
      <span
        className={styles.doIcon}
        style={{ color: `var(--tone-${fam}-fg)` }}
      >
        <KitIcon name={icon} size={1.7} />
      </span>
      <span className={styles.doText}>{text}</span>
    </div>
  );
}

export function WhenDoneWidget({ widget }: WidgetBodyProps): ReactNode {
  const mustDo = readItems(widget.config, "mustDo", MUST_FALLBACK);
  const mayDo = readItems(widget.config, "mayDo", MAY_FALLBACK);

  return (
    <div className={`${kit.body} ${kit.tones}`}>
      <WHead label="When You're Done" />

      <div className={styles.sectionLabel}>
        <span className={styles.mustIcon}>
          <KitIcon name="star" size={1} />
        </span>
        <span className={styles.mustText}>MUST DO</span>
      </div>
      <div className={styles.grid}>
        {mustDo.map((m, i) => (
          <DoCard key={i} {...m} />
        ))}
      </div>

      <div className={`${styles.sectionLabel} ${styles.maySection}`}>
        <span className={styles.mayIcon}>
          <KitIcon name="spark" size={1} />
        </span>
        <span className={styles.mayText}>MAY DO</span>
      </div>
      <div className={styles.grid}>
        {mayDo.map((m, i) => (
          <DoCard key={i} {...m} />
        ))}
      </div>
    </div>
  );
}
