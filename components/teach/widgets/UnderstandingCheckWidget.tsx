// UnderstandingCheckWidget — INTERACTIVE self-assessment tally (5.31 handoff,
// Assessment & Support #2). The teacher (or class, on a shared board) taps one
// of three mood faces — "Got it!", "Almost there", "Need help" — and the tap
// count updates live; the Class Summary bar + percentages recompute from the
// three counts.
//
// State is STRUCTURE-ONLY (three integer counts) persisted via useWidgetState
// — no names, per privacy §11.4. A Reset clears the tallies.
//
// DEFAULT THEME: { bg: "green", accent: "green" } (Mint card, green accent).

"use client";

import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { useWidgetState } from "@/lib/teach/use-widget-state";
import type { WidgetBodyProps } from "./types";
import { WHead, Face } from "./_WidgetKit";
import type { FaceMood, Tone } from "./_WidgetKit";
import styles from "./UnderstandingCheckWidget.module.css";
import kit from "./widgets530.module.css";

/** The three response buckets. Hue drives the face tint (handoff geometry). */
interface Bucket {
  key: "got" | "almost" | "need";
  mood: FaceMood;
  hue: number;
  label: string;
  tone: Extract<Tone, "green" | "amber" | "red">;
}

const BUCKETS: Bucket[] = [
  { key: "got", mood: "happy", hue: 145, label: "Got it!", tone: "green" },
  { key: "almost", mood: "meh", hue: 42, label: "Almost there", tone: "amber" },
  { key: "need", mood: "sad", hue: 2, label: "Need help", tone: "red" },
];

/** Structure-only persisted slice — three tallies, never names. */
interface Counts extends Record<string, unknown> {
  got: number;
  almost: number;
  need: number;
}

function readPrompt(config: Record<string, unknown>): string {
  const p = config.prompt;
  return typeof p === "string" && p.trim().length > 0
    ? p
    : "How are you feeling about today's lesson?";
}

export function UnderstandingCheckWidget({
  widget,
}: WidgetBodyProps): ReactNode {
  const prompt = readPrompt(widget.config);

  // Seed from config if present, else the handoff's sample tallies.
  const initial = useMemo<Counts>(() => {
    const c = widget.config;
    const num = (k: string, d: number): number =>
      typeof c[k] === "number" && (c[k] as number) >= 0
        ? Math.floor(c[k] as number)
        : d;
    return {
      got: num("got", 18),
      almost: num("almost", 7),
      need: num("need", 3),
    };
  }, [widget.config]);

  const { state, setState, reset } = useWidgetState<Counts>(widget.id, initial);

  const total = state.got + state.almost + state.need;

  const bump = useCallback(
    (key: Bucket["key"]): void => {
      setState((prev) => ({ ...prev, [key]: (prev[key] as number) + 1 }));
    },
    [setState],
  );

  /** Whole-number percentage for a bucket (0 when no responses yet). */
  const pct = (n: number): number =>
    total > 0 ? Math.round((n / total) * 100) : 0;

  return (
    <div className={`${kit.body} ${kit.tones}`}>
      <WHead label="Understanding Check" />
      <div className={styles.prompt}>{prompt}</div>

      <div className={styles.faces}>
        {BUCKETS.map((b) => (
          <button
            key={b.key}
            type="button"
            className={`${kit.card} ${styles.faceBtn}`}
            style={{
              background: `var(--tone-${b.tone}-bg)`,
              borderColor: `var(--tone-${b.tone}-bg)`,
            }}
            onClick={() => bump(b.key)}
            aria-label={`Add a tally to ${b.label}`}
            title={`Tap to count one more "${b.label}" response`}
          >
            <span className={styles.faceWrap}>
              <Face mood={b.mood} hue={b.hue} size={2.4} />
            </span>
            <span
              className={styles.count}
              style={{ color: `var(--tone-${b.tone}-fg)` }}
            >
              {state[b.key]}
            </span>
            <span
              className={styles.faceLabel}
              style={{ color: `var(--tone-${b.tone}-fg)` }}
            >
              {b.label}
            </span>
          </button>
        ))}
      </div>

      <div className={styles.summaryHead}>
        <span className={styles.summaryTitle}>Class Summary</span>
        <button
          type="button"
          className={styles.resetBtn}
          onClick={reset}
          title="Clear all tallies and start over"
        >
          Reset
        </button>
      </div>
      <div className={styles.bar}>
        {BUCKETS.map((b) => (
          <span
            key={b.key}
            className={styles.barSeg}
            style={{
              width: `${pct(state[b.key])}%`,
              background: `var(--tone-${b.tone}-solid)`,
            }}
          />
        ))}
      </div>
      <div className={styles.legend}>
        {BUCKETS.map((b) => (
          <div key={b.key} className={styles.legendItem}>
            <div
              className={styles.legendPct}
              style={{ color: `var(--tone-${b.tone}-fg)` }}
            >
              {pct(state[b.key])}%
            </div>
            <div className={styles.legendLabel}>{b.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
