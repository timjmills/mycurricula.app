// DirectionsWidget — a numbered step-by-step directions list (5.31 handoff,
// Lesson Essentials #3). Display-only: renders the configured steps, falling
// back to the handoff's read → talk → write → check example.
//
// DEFAULT THEME: { bg: "green", accent: "green" } (Mint card, green accent).

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon, StepNum } from "./_WidgetKit";
import type { KitIconName } from "./_WidgetKit";
import styles from "./DirectionsWidget.module.css";
import kit from "./widgets530.module.css";

interface Step {
  icon: KitIconName;
  text: string;
}

const FALLBACK: Step[] = [
  { icon: "book", text: "Read the passage carefully." },
  { icon: "users", text: "Turn and Talk with your partner." },
  { icon: "pencil", text: "Write your answer in your journal." },
  { icon: "clipChk", text: "Check your work and be ready to share." },
];

const ICONS: readonly KitIconName[] = [
  "book",
  "users",
  "pencil",
  "clipChk",
  "calc",
  "marker",
];

function readSteps(config: Record<string, unknown>): Step[] {
  const raw = config.steps;
  if (Array.isArray(raw)) {
    const steps = raw
      .map((s, i): Step | null => {
        const text =
          typeof s === "string"
            ? s
            : s && typeof s === "object" && typeof (s as Record<string, unknown>).text === "string"
              ? ((s as Record<string, unknown>).text as string)
              : null;
        return text ? { icon: ICONS[i % ICONS.length] ?? "book", text } : null;
      })
      .filter((s): s is Step => s !== null);
    if (steps.length > 0) return steps;
  }
  return FALLBACK;
}

export function DirectionsWidget({ widget }: WidgetBodyProps): ReactNode {
  const steps = readSteps(widget.config);

  return (
    <div className={kit.body}>
      <WHead label="Directions" />
      <div className={styles.steps}>
        {steps.map((s, i) => (
          <div key={i} className={`${kit.card} ${styles.step}`}>
            <StepNum n={i + 1} size={1.9} />
            <span className={styles.stepIcon}>
              <KitIcon name={s.icon} size={1.5} />
            </span>
            <span className={styles.stepText}>{s.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
