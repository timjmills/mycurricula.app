// StopwatchWidget — an INTERACTIVE count-up stopwatch with laps (Phase 3
// interactive widget library). Big elapsed display (mm:ss.t, or hh:mm:ss past an
// hour), Start/Pause, Reset, and Lap. Elapsed time accumulates from
// performance.now() deltas (rAF while running) so it survives pause/resume
// without drift. Laps are transient — newest on top, scrollable, showing each
// lap's split + cumulative total. Nothing here persists across sessions.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { TeachIcon } from "./icons";
import styles from "./StopwatchWidget.module.css";

interface Lap {
  /** 1-based lap number. */
  index: number;
  /** Time since the previous lap (ms). */
  split: number;
  /** Cumulative elapsed at this lap (ms). */
  total: number;
}

/** Format elapsed ms as mm:ss.t below an hour, hh:mm:ss at or above one. */
function formatElapsed(ms: number): string {
  const safe = Math.max(0, ms);
  const totalSeconds = Math.floor(safe / 1000);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  const tenths = Math.floor((safe % 1000) / 100);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
}

/** Compact split for the lap list (always mm:ss.t — laps are short-lived). */
function formatSplit(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
}

export function StopwatchWidget({
  widget,
  subjectId,
}: WidgetBodyProps): ReactNode {
  // `elapsed` is the accumulated, rendered total. `accumulatedRef` holds the
  // committed time before the current run segment; `startedAtRef` marks when the
  // current segment began (performance.now()). This keeps pause/resume accurate.
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState<Lap[]>([]);
  const accumulatedRef = useRef(0);
  const startedAtRef = useRef(0);

  void widget; // no durable config for the stopwatch — laps/elapsed are transient

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const loop = (): void => {
      const now = performance.now();
      setElapsed(accumulatedRef.current + (now - startedAtRef.current));
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [running]);

  const start = useCallback((): void => {
    startedAtRef.current = performance.now();
    setRunning(true);
  }, []);

  const pause = useCallback((): void => {
    // Commit the current segment into the accumulator before stopping the loop.
    accumulatedRef.current += performance.now() - startedAtRef.current;
    setElapsed(accumulatedRef.current);
    setRunning(false);
  }, []);

  const resetWatch = useCallback((): void => {
    setRunning(false);
    accumulatedRef.current = 0;
    startedAtRef.current = 0;
    setElapsed(0);
    setLaps([]);
  }, []);

  const lap = useCallback((): void => {
    // Compute the live total even mid-segment so the lap reflects the moment.
    const total = running
      ? accumulatedRef.current + (performance.now() - startedAtRef.current)
      : accumulatedRef.current;
    setLaps((prev) => {
      const prevTotal = prev.length > 0 ? prev[0].total : 0;
      const next: Lap = {
        index: prev.length + 1,
        split: total - prevTotal,
        total,
      };
      return [next, ...prev];
    });
  }, [running]);

  return (
    <div className={`cp-subj ${subjectId} ${styles.body}`}>
      <div className={styles.digits}>{formatElapsed(elapsed)}</div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={running ? pause : start}
        >
          <TeachIcon name={running ? "pause" : "play"} size={16} />
          {running ? "Pause" : elapsed > 0 ? "Resume" : "Start"}
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={lap}
          disabled={!running}
          title="Record a lap split"
          aria-label="Record a lap"
        >
          <TeachIcon name="flag" size={16} />
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={resetWatch}
          disabled={running || (elapsed === 0 && laps.length === 0)}
          title="Reset the stopwatch and clear laps"
          aria-label="Reset stopwatch"
        >
          <TeachIcon name="rotate" size={16} />
        </button>
      </div>

      {laps.length > 0 ? (
        <ol className={styles.laps}>
          {laps.map((l) => (
            <li key={l.index} className={styles.lapRow}>
              <span className={styles.lapIndex}>Lap {l.index}</span>
              <span className={styles.lapSplit}>{formatSplit(l.split)}</span>
              <span className={styles.lapTotal}>{formatSplit(l.total)}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
