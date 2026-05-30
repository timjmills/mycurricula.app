// ExitTicketWidget — the end-of-lesson exit-ticket prompt + reflection options
// + a Submit affordance (5.31 handoff, Assessment & Support #1). Display-only:
// the options are read from config (the Submit button is a static affordance —
// real submission is a later backend wave).
//
// DEFAULT THEME: { bg: "purple", accent: "purple" } (Lilac card, purple accent).

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon } from "./_WidgetKit";
import type { KitIconName } from "./_WidgetKit";
import styles from "./ExitTicketWidget.module.css";
import kit from "./widgets530.module.css";

interface Option {
  icon: KitIconName;
  text: string;
}

const FALLBACK: Option[] = [
  { icon: "bulb", text: "I learned something new." },
  { icon: "puzzle", text: "I practiced a skill." },
  { icon: "msg", text: "I'm still confused about something." },
];

const ICONS: readonly KitIconName[] = ["bulb", "puzzle", "msg", "star", "book"];

function readPrompt(config: Record<string, unknown>): string {
  const p = config.prompt;
  return typeof p === "string" && p.trim().length > 0
    ? p
    : "What is one thing you learned today?";
}

function readOptions(config: Record<string, unknown>): Option[] {
  const raw = config.options;
  if (Array.isArray(raw)) {
    const opts = raw
      .map((o, i): Option | null => {
        const text =
          typeof o === "string"
            ? o
            : o &&
                typeof o === "object" &&
                typeof (o as Record<string, unknown>).text === "string"
              ? ((o as Record<string, unknown>).text as string)
              : null;
        return text ? { text, icon: ICONS[i % ICONS.length] ?? "bulb" } : null;
      })
      .filter((o): o is Option => o !== null);
    if (opts.length > 0) return opts;
  }
  return FALLBACK;
}

export function ExitTicketWidget({ widget }: WidgetBodyProps): ReactNode {
  const prompt = readPrompt(widget.config);
  const options = readOptions(widget.config);

  return (
    <div className={kit.body}>
      <WHead label="Exit Ticket" />
      <div className={styles.promptRow}>
        <span className={`${kit.chip} ${styles.promptChip}`}>
          <KitIcon name="ticket" size={1.7} />
        </span>
        <div className={styles.prompt}>{prompt}</div>
        <span className={styles.promptStar}>
          <KitIcon name="star" size={1.2} />
        </span>
      </div>
      <div className={styles.options}>
        {options.map((o, i) => (
          <div key={i} className={`${kit.card} ${styles.option}`}>
            <span className={styles.optionIcon}>
              <KitIcon name={o.icon} size={1.1} />
            </span>
            <span className={styles.optionText}>{o.text}</span>
          </div>
        ))}
      </div>
      <button type="button" className={styles.submit}>
        <span className={styles.submitCheck}>
          <KitIcon name="check" size={0.85} />
        </span>
        Submit
      </button>
    </div>
  );
}
