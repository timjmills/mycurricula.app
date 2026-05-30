// CalmCornerWidget — a regulation / calm-corner check-in (5.31 handoff,
// Regulation & Teacher Tools #2). INTERACTIVE: a breathing prompt plus a private
// mood check-in — tapping a mood face selects it (a personal, anonymous signal).
// State is STRUCTURE-ONLY (the selected mood index, -1 = none) persisted via
// useWidgetState — no names, no PII.
//
// DEFAULT THEME: { bg: "green", accent: "green" } (Mint card, green accent).

"use client";

import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { useWidgetState } from "@/lib/teach/use-widget-state";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon, Face } from "./_WidgetKit";
import type { FaceMood } from "./_WidgetKit";
import styles from "./CalmCornerWidget.module.css";
import kit from "./widgets530.module.css";

interface Mood {
  mood: FaceMood;
  hue: number;
  label: string;
}

const MOODS: Mood[] = [
  { mood: "happy", hue: 145, label: "Calm" },
  { mood: "meh", hue: 200, label: "Okay" },
  { mood: "worried", hue: 42, label: "Wiggly" },
  { mood: "sad", hue: 2, label: "Upset" },
];

/** Structure-only persisted slice — selected mood index (-1 = none). */
interface MoodState extends Record<string, unknown> {
  selected: number;
}

function readPrompt(config: Record<string, unknown>): string {
  const p = config.prompt;
  return typeof p === "string" && p.trim().length > 0
    ? p
    : "Breathe in… and slowly out. How are you feeling right now?";
}

export function CalmCornerWidget({ widget }: WidgetBodyProps): ReactNode {
  const prompt = readPrompt(widget.config);
  const initial = useMemo<MoodState>(() => ({ selected: -1 }), []);
  const { state, setState } = useWidgetState<MoodState>(widget.id, initial);

  const select = useCallback(
    (i: number): void => {
      setState((prev) => ({ selected: prev.selected === i ? -1 : i }));
    },
    [setState],
  );

  return (
    <div className={`${kit.body} ${kit.tones}`}>
      <WHead label="Calm Corner" />

      <div className={`${kit.card} ${styles.breathe}`}>
        <span className={styles.ring} aria-hidden="true" />
        <span className={styles.breatheLabel}>
          <KitIcon name="spark" size={1.1} />
          Breathe
        </span>
      </div>

      <div className={styles.prompt}>{prompt}</div>

      <div className={styles.moods}>
        {MOODS.map((m, i) => {
          const on = state.selected === i;
          return (
            <button
              key={i}
              type="button"
              className={`${kit.card} ${styles.moodBtn} ${on ? styles.moodOn : ""}`}
              style={on ? { borderColor: "var(--w-accent)" } : undefined}
              onClick={() => select(i)}
              aria-pressed={on}
              title={`I'm feeling ${m.label.toLowerCase()}`}
            >
              <Face mood={m.mood} hue={m.hue} size={2.2} />
              <span className={styles.moodLabel}>{m.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
