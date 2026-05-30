// TransitionWidget — a transition routine: title + a (display-only) countdown
// readout + voice level on the left, numbered steps on the right (5.31 handoff,
// Routines & Management #1). Display-only.
//
// DEFAULT THEME: { bg: "green", accent: "green" } (Mint card, green accent).

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon, StepNum } from "./_WidgetKit";
import type { KitIconName } from "./_WidgetKit";
import styles from "./TransitionWidget.module.css";
import kit from "./widgets530.module.css";

interface Step {
  icon: KitIconName;
  text: string;
}

const FALLBACK: Step[] = [
  { icon: "bell", text: "Wrap up your current work." },
  { icon: "chair", text: "Push in your chair." },
  { icon: "backpack", text: "Bring needed materials." },
  { icon: "users", text: "Move quietly to your center." },
];

const ICONS: readonly KitIconName[] = [
  "bell",
  "chair",
  "backpack",
  "users",
  "book",
  "pencil",
];

function readSteps(config: Record<string, unknown>): Step[] {
  const raw = config.steps;
  if (Array.isArray(raw)) {
    const steps = raw
      .map((s, i): Step | null => {
        const text =
          typeof s === "string"
            ? s
            : s &&
                typeof s === "object" &&
                typeof (s as Record<string, unknown>).text === "string"
              ? ((s as Record<string, unknown>).text as string)
              : null;
        return text ? { icon: ICONS[i % ICONS.length] ?? "bell", text } : null;
      })
      .filter((s): s is Step => s !== null);
    if (steps.length > 0) return steps;
  }
  return FALLBACK;
}

function readString(
  config: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const v = config[key];
  return typeof v === "string" && v.trim().length > 0 ? v : fallback;
}

export function TransitionWidget({ widget }: WidgetBodyProps): ReactNode {
  const steps = readSteps(widget.config);
  const title = readString(widget.config, "title", "Transitioning to Centers");
  const tagline = readString(
    widget.config,
    "tagline",
    "Let's move with purpose!",
  );
  const time = readString(widget.config, "time", "02:45");
  const voice = readString(widget.config, "voice", "Level 1 – Whisper");

  return (
    <div className={kit.body}>
      <WHead label="Transition" />
      <div className={styles.split}>
        <div className={styles.left}>
          <div className={styles.headRow}>
            <span className={styles.bigIconWrap}>
              <span className={styles.bigIcon}>
                <KitIcon name="clock" size={3.2} />
              </span>
              <span className={styles.sparkA}>
                <KitIcon name="spark" size={0.9} />
              </span>
              <span className={styles.sparkB}>
                <KitIcon name="spark" size={0.8} />
              </span>
            </span>
            <div>
              <div className={styles.title}>{title}</div>
              <div className={styles.tagline}>{tagline}</div>
            </div>
          </div>

          <div className={`${kit.card} ${styles.statCard}`}>
            <div>
              <div className={styles.statLabel}>TIME REMAINING</div>
              <div className={styles.statTime}>{time}</div>
            </div>
            <span className={styles.pauseBtn}>
              <KitIcon name="pause" size={1.2} />
            </span>
          </div>

          <div className={`${kit.card} ${styles.voiceCard}`}>
            <span className={styles.voiceIcon}>
              <KitIcon name="vol2" size={1.4} />
            </span>
            <div>
              <div className={styles.statLabel}>VOICE LEVEL</div>
              <div className={styles.voiceVal}>{voice}</div>
            </div>
          </div>
        </div>

        <div className={styles.rule} />

        <div className={styles.right}>
          {steps.map((s, i) => (
            <div key={i} className={styles.stepRow}>
              <StepNum n={i + 1} size={1.8} />
              <span className={styles.stepIcon}>
                <KitIcon name={s.icon} size={1.5} />
              </span>
              <span className={styles.stepText}>{s.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
