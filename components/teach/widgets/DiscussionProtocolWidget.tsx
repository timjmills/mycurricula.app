// DiscussionProtocolWidget — a structured partner/group discussion protocol
// (5.31 handoff, Small Groups & Language #5). Display-only: renders the named
// protocol (e.g. "Think–Pair–Share") as numbered steps, each with a role/timing
// hint, falling back to the classic Think–Pair–Share flow.
//
// DEFAULT THEME: { bg: "blue", accent: "blue" } (Sky card, blue accent).

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon, StepNum, Pill } from "./_WidgetKit";
import type { KitIconName } from "./_WidgetKit";
import styles from "./DiscussionProtocolWidget.module.css";
import kit from "./widgets530.module.css";

interface Step {
  icon: KitIconName;
  text: string;
  hint?: string;
}

const ICONS: readonly KitIconName[] = ["bulb", "users", "msg", "hand"];

const FALLBACK = {
  name: "Think · Pair · Share",
  steps: [
    {
      icon: "bulb" as KitIconName,
      text: "Think on your own.",
      hint: "1 min, silent",
    },
    {
      icon: "users" as KitIconName,
      text: "Pair with your partner.",
      hint: "2 min",
    },
    {
      icon: "msg" as KitIconName,
      text: "Share with the class.",
      hint: "Whole group",
    },
  ],
};

function readName(config: Record<string, unknown>): string {
  const n = config.name ?? config.protocol;
  return typeof n === "string" && n.trim().length > 0 ? n : FALLBACK.name;
}

function readSteps(config: Record<string, unknown>): Step[] {
  const raw = config.steps;
  if (Array.isArray(raw)) {
    const steps = raw
      .map((s, i): Step | null => {
        const o =
          typeof s === "string"
            ? { text: s }
            : s && typeof s === "object"
              ? (s as Record<string, unknown>)
              : null;
        if (o && typeof o.text === "string") {
          return {
            text: o.text,
            hint: typeof o.hint === "string" ? o.hint : undefined,
            icon: ICONS[i % ICONS.length] ?? "msg",
          };
        }
        return null;
      })
      .filter((s): s is Step => s !== null);
    if (steps.length > 0) return steps;
  }
  return FALLBACK.steps;
}

export function DiscussionProtocolWidget({
  widget,
}: WidgetBodyProps): ReactNode {
  const name = readName(widget.config);
  const steps = readSteps(widget.config);

  return (
    <div className={`${kit.body} ${kit.tones}`}>
      <WHead label="Discussion Protocol" />
      <div className={styles.title}>{name}</div>
      <div className={styles.steps}>
        {steps.map((s, i) => (
          <div key={i} className={`${kit.card} ${styles.step}`}>
            <StepNum n={i + 1} size={1.9} />
            <span className={styles.icon}>
              <KitIcon name={s.icon} size={1.5} />
            </span>
            <span className={styles.text}>{s.text}</span>
            {s.hint ? (
              <span className={styles.hint}>
                <Pill tone="blue">{s.hint}</Pill>
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
