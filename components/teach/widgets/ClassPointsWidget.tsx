// ClassPointsWidget — a whole-class reward / behavior points tracker (5.31
// handoff, Regulation & Teacher Tools #3). INTERACTIVE: +1 / −1 buttons bump a
// single class total toward a goal; a progress bar fills and a celebration note
// appears at goal. State is STRUCTURE-ONLY (an integer point count) persisted via
// useWidgetState — a CLASS tally, never per-student, never names.
//
// DEFAULT THEME: { bg: "green", accent: "green" } (Mint card, green accent).

"use client";

import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { useWidgetState } from "@/lib/teach/use-widget-state";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon, FootNote } from "./_WidgetKit";
import styles from "./ClassPointsWidget.module.css";
import kit from "./widgets530.module.css";

/** Structure-only persisted slice — a single class point total. */
interface PointsState extends Record<string, unknown> {
  points: number;
}

function readGoal(config: Record<string, unknown>): number {
  const g = config.goal;
  return typeof g === "number" && g > 0 ? Math.floor(g) : 20;
}

function readReward(config: Record<string, unknown>): string {
  const r = config.reward;
  return typeof r === "string" && r.trim().length > 0 ? r : "Extra recess";
}

export function ClassPointsWidget({ widget }: WidgetBodyProps): ReactNode {
  const goal = readGoal(widget.config);
  const reward = readReward(widget.config);

  const initial = useMemo<PointsState>(() => {
    const p = widget.config.points;
    return {
      points: typeof p === "number" && p >= 0 ? Math.floor(p) : 0,
    };
  }, [widget.config]);
  const { state, setState, reset } = useWidgetState<PointsState>(
    widget.id,
    initial,
  );

  const points = Math.max(0, state.points);
  const reached = points >= goal;
  const pct = Math.min(100, Math.round((points / goal) * 100));

  const bump = useCallback(
    (delta: number): void => {
      setState((prev) => ({
        points: Math.max(0, (prev.points as number) + delta),
      }));
    },
    [setState],
  );

  return (
    <div className={`${kit.body} ${kit.tones}`}>
      <WHead label="Class Points" />

      <div className={`${kit.card} ${styles.scoreCard}`}>
        <span className={styles.starIcon}>
          <KitIcon name="star" size={2} />
        </span>
        <div className={styles.score}>
          <span className={styles.points}>{points}</span>
          <span className={styles.goal}>/ {goal}</span>
        </div>
        <div className={styles.reward}>Goal: {reward}</div>
      </div>

      <div className={styles.bar} aria-hidden="true">
        <span className={styles.fill} style={{ width: `${pct}%` }} />
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={`${styles.btn} ${styles.minus}`}
          onClick={() => bump(-1)}
          disabled={points === 0}
          title="Remove a class point"
          aria-label="Remove a class point"
        >
          <span className={styles.minusBar} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.plus}`}
          onClick={() => bump(1)}
          title="Add a class point"
        >
          <KitIcon name="spark" size={1.2} />
          Add point
        </button>
        <button
          type="button"
          className={styles.resetBtn}
          onClick={reset}
          title="Reset the class points to zero"
        >
          Reset
        </button>
      </div>

      {reached ? (
        <FootNote tone="green" icon={<KitIcon name="star" size={1} />}>
          Goal reached — way to go, class!
        </FootNote>
      ) : null}
    </div>
  );
}
