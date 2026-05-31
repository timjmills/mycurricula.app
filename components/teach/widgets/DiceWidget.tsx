// DiceWidget — roll 1–4 six-sided dice (Teach Phase 3 interactive widget
// library). Big pip faces (inline SVG circles), a ROLL button, and a sum when
// more than one die is shown. The die count is durable (persisted via
// useWidgetState); the rolling animation + landed face values are transient.
//
// Roll plays a ~600ms tumble then settles on fresh random values. Reduced
// motion sets the values instantly. Faces are drawn from tokens only.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useWidgetState } from "@/lib/teach/use-widget-state";
import type { WidgetBodyProps } from "./types";
import styles from "./DiceWidget.module.css";

interface DiceState extends Record<string, unknown> {
  /** Number of dice to roll (1–4). */
  count: number;
}

const INITIAL: DiceState = { count: 2 };
const COUNT_OPTIONS = [1, 2, 3, 4] as const;
const ROLL_MS = 600;

/** Pip layout per face — fractional (x,y) positions in a unit square. */
const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [
    [0.28, 0.28],
    [0.72, 0.72],
  ],
  3: [
    [0.28, 0.28],
    [0.5, 0.5],
    [0.72, 0.72],
  ],
  4: [
    [0.28, 0.28],
    [0.72, 0.28],
    [0.28, 0.72],
    [0.72, 0.72],
  ],
  5: [
    [0.28, 0.28],
    [0.72, 0.28],
    [0.5, 0.5],
    [0.28, 0.72],
    [0.72, 0.72],
  ],
  6: [
    [0.28, 0.26],
    [0.72, 0.26],
    [0.28, 0.5],
    [0.72, 0.5],
    [0.28, 0.74],
    [0.72, 0.74],
  ],
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function rollValue(): number {
  return 1 + Math.floor(Math.random() * 6);
}

function clampCount(n: unknown): number {
  return typeof n === "number" && n >= 1 && n <= 4 ? Math.round(n) : 2;
}

/** One die face — a rounded square with the right pip pattern. */
function DieFace({ value }: { value: number }): ReactNode {
  return (
    <svg
      className={styles.die}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Die showing ${value}`}
    >
      <rect
        x="3"
        y="3"
        width="94"
        height="94"
        rx="16"
        fill="var(--paper)"
        stroke="var(--ink-150)"
        strokeWidth="3"
      />
      {(PIPS[value] ?? []).map(([px, py], i) => (
        <circle
          key={i}
          cx={px * 100}
          cy={py * 100}
          r="9"
          fill="var(--w-accent)"
        />
      ))}
    </svg>
  );
}

export function DiceWidget({ widget }: WidgetBodyProps): ReactNode {
  const { state, setState } = useWidgetState(widget.id, INITIAL);
  const count = clampCount(state.count);

  // Transient: the currently-shown face values + whether a roll is animating.
  const [values, setValues] = useState<number[]>(() =>
    Array.from({ length: 4 }, () => 1),
  );
  const [rolling, setRolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHandles = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    intervalRef.current = null;
    timeoutRef.current = null;
  }, []);

  useEffect(() => clearHandles, [clearHandles]);

  const handleRoll = useCallback(() => {
    if (rolling) return;
    clearHandles();
    const final = Array.from({ length: count }, rollValue);

    if (prefersReducedMotion()) {
      setValues(final);
      return;
    }

    setRolling(true);
    // Tumble: flash random faces, then settle on the final values.
    intervalRef.current = setInterval(() => {
      setValues(Array.from({ length: count }, rollValue));
    }, 70);
    timeoutRef.current = setTimeout(() => {
      clearHandles();
      setValues(final);
      setRolling(false);
    }, ROLL_MS);
  }, [rolling, count, clearHandles]);

  const setCount = useCallback(
    (n: number) => {
      setState((prev) => ({ ...prev, count: n }));
    },
    [setState],
  );

  const shown = values.slice(0, count);
  const sum = shown.reduce((a, b) => a + b, 0);

  return (
    <div className={styles.body}>
      <div className={styles.countRow} role="group" aria-label="Number of dice">
        {COUNT_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            className={`${styles.countChip} ${n === count ? styles.countChipOn : ""}`}
            aria-pressed={n === count}
            onClick={() => setCount(n)}
            disabled={rolling}
          >
            {n}
          </button>
        ))}
      </div>

      <div
        className={`${styles.dice} ${rolling ? styles.diceRolling : ""}`}
        aria-live="polite"
      >
        {shown.map((v, i) => (
          <span key={i} className={styles.diceCell}>
            <DieFace value={v} />
          </span>
        ))}
      </div>

      {count > 1 ? (
        <div className={styles.sum}>
          Sum <strong>{rolling ? "…" : sum}</strong>
        </div>
      ) : null}

      <button
        type="button"
        className={styles.rollBtn}
        onClick={handleRoll}
        disabled={rolling}
      >
        {rolling ? "Rolling…" : "Roll"}
      </button>
    </div>
  );
}
