// TimerWidget — an INTERACTIVE countdown timer (ring + mm:ss digits), the
// Phase 3 interactive widget library replacement for the v1 display-only stub
// (docs/teach-view-plan.md §4.5). Teachers set a duration (preset chips or ±1
// min), Start/Pause, and Reset; the ring depletes live as time runs down. The
// final 10s switch to the alarm colour; at 0 the timer stops, shows "Time's up",
// and (when sound is on) plays a short Web Audio beep. Durable `durationSeconds`
// and the mute preference persist via useWidgetState; the live tick is transient.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useWidgetState } from "@/lib/teach/use-widget-state";
import type { WidgetBodyProps } from "./types";
import { TeachIcon } from "./icons";
import styles from "./TimerWidget.module.css";

const RADIUS = 30;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const DEFAULT_SECONDS = 600; // 10:00
const MIN_SECONDS = 60; // never below 1:00 when adjusting
const MAX_SECONDS = 99 * 60; // 99:00 cap so digits stay two-wide
const ALARM_THRESHOLD = 10; // last 10 seconds turn alarm-red
const PRESETS_MIN = [1, 3, 5, 10] as const;

/** Durable slice — the configured duration + sound preference. */
interface TimerPersisted extends Record<string, unknown> {
  durationSeconds: number;
  soundOn: boolean;
}

/** mm:ss formatting for the display. */
function format(totalSeconds: number): string {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Clamp a candidate duration into the supported range. */
function clampDuration(seconds: number): number {
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(seconds)));
}

/** Read the initial duration from config defensively. */
function readConfigSeconds(config: Record<string, unknown>): number {
  const raw = config.durationSeconds;
  if (typeof raw === "number" && raw > 0) return clampDuration(raw);
  return DEFAULT_SECONDS;
}

/** Play a short two-tone beep via a freshly-created AudioContext (user gesture).
 *  Wrapped in try/catch and self-closing so we never leak an audio graph. */
function playBeep(): void {
  if (typeof window === "undefined") return;
  type WindowWithWebkit = Window & {
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor =
    window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext;
  if (!Ctor) return;
  try {
    const ctx = new Ctor();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(660, now + 0.25);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.55);
    // Close the context once the beep finishes so it doesn't linger.
    osc.onended = (): void => {
      ctx.close().catch(() => {
        /* already closed — ignore */
      });
    };
  } catch {
    // Audio unavailable / blocked — silently skip; the visual state still fires.
  }
}

export function TimerWidget({ widget }: WidgetBodyProps): ReactNode {
  const initial = useMemo<TimerPersisted>(
    () => ({
      durationSeconds: readConfigSeconds(widget.config),
      soundOn: true,
    }),
    [widget.config],
  );
  const { state, setState } = useWidgetState<TimerPersisted>(
    widget.id,
    initial,
  );
  const duration = state.durationSeconds;
  const soundOn = state.soundOn;

  // Transient run-state — never persisted. `remaining` is recomputed from the
  // target end-timestamp each tick so it stays wall-clock accurate.
  const [remaining, setRemaining] = useState<number>(duration);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const endRef = useRef<number | null>(null);

  // When the configured duration changes while idle, mirror it into `remaining`.
  useEffect(() => {
    if (!running && !finished) setRemaining(duration);
  }, [duration, running, finished]);

  // The ticking loop — runs only while `running`. Polls a target end-timestamp.
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = (): void => {
      const end = endRef.current;
      if (end == null) return;
      const left = (end - performance.now()) / 1000;
      if (left <= 0) {
        setRemaining(0);
        setRunning(false);
        setFinished(true);
        if (soundOn) playBeep();
        return;
      }
      setRemaining(left);
      raf = window.setTimeout(tick, 250);
    };
    raf = window.setTimeout(tick, 250);
    return () => window.clearTimeout(raf);
  }, [running, soundOn]);

  const start = useCallback((): void => {
    const base = finished ? duration : remaining;
    const secs = base > 0 ? base : duration;
    endRef.current = performance.now() + secs * 1000;
    setRemaining(secs);
    setFinished(false);
    setRunning(true);
  }, [duration, remaining, finished]);

  const pause = useCallback((): void => {
    setRunning(false);
    endRef.current = null;
  }, []);

  const resetTimer = useCallback((): void => {
    setRunning(false);
    setFinished(false);
    endRef.current = null;
    setRemaining(duration);
  }, [duration]);

  const adjust = useCallback(
    (deltaSeconds: number): void => {
      // Adjusting implies the timer is idle; fold any pause back to the new base.
      const next = clampDuration(duration + deltaSeconds);
      setState({ durationSeconds: next });
      setFinished(false);
    },
    [duration, setState],
  );

  const setPreset = useCallback(
    (minutes: number): void => {
      setState({ durationSeconds: clampDuration(minutes * 60) });
      setFinished(false);
    },
    [setState],
  );

  const toggleSound = useCallback((): void => {
    setState((prev) => ({ ...prev, soundOn: !prev.soundOn }));
  }, [setState]);

  const isAlarm = finished || (running && remaining <= ALARM_THRESHOLD);
  const spent = duration > 0 ? 1 - remaining / duration : 0;
  const dashOffset = CIRCUMFERENCE * Math.min(1, Math.max(0, spent));
  // Editing the duration is only allowed while idle (not running).
  const editable = !running;

  return (
    <div className={styles.body}>
      <div className={styles.main}>
        <svg
          className={styles.ring}
          width="84"
          height="84"
          viewBox="0 0 70 70"
          aria-hidden="true"
        >
          <circle
            cx="35"
            cy="35"
            r={RADIUS}
            fill="none"
            stroke="var(--ink-100)"
            strokeWidth="7"
          />
          <circle
            cx="35"
            cy="35"
            r={RADIUS}
            fill="none"
            stroke={isAlarm ? "var(--teach-alarm)" : "var(--w-accent)"}
            strokeWidth="7"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform="rotate(-90 35 35)"
            className={styles.ringProgress}
          />
        </svg>
        <div className={styles.readout}>
          <div
            className={`${styles.digits} ${isAlarm ? styles.digitsAlarm : ""}`}
          >
            {format(remaining)}
          </div>
          {finished ? (
            <div className={styles.timesUp}>
              <TeachIcon name="bell" size={13} /> Time&apos;s up
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={running ? pause : start}
        >
          <TeachIcon name={running ? "pause" : "play"} size={16} />
          {running ? "Pause" : finished ? "Restart" : "Start"}
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={resetTimer}
          title="Reset to the set duration"
          aria-label="Reset timer"
        >
          <TeachIcon name="rotate" size={16} />
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={toggleSound}
          aria-pressed={soundOn}
          title={soundOn ? "Mute the end beep" : "Unmute the end beep"}
          aria-label={soundOn ? "Mute the end beep" : "Unmute the end beep"}
        >
          <TeachIcon name={soundOn ? "bell" : "x"} size={16} />
        </button>
      </div>

      <div
        className={`${styles.setRow} ${editable ? "" : styles.setRowDisabled}`}
      >
        <div className={styles.presets}>
          {PRESETS_MIN.map((min) => (
            <button
              key={min}
              type="button"
              className={`${styles.chip} ${
                duration === min * 60 ? styles.chipActive : ""
              }`}
              onClick={() => setPreset(min)}
              disabled={!editable}
              title={`Set the timer to ${min} minute${min === 1 ? "" : "s"}`}
            >
              {min}m
            </button>
          ))}
        </div>
        <div className={styles.steppers}>
          <button
            type="button"
            className={styles.stepBtn}
            onClick={() => adjust(-60)}
            disabled={!editable || duration <= MIN_SECONDS}
            title="Subtract one minute"
            aria-label="Subtract one minute"
          >
            <TeachIcon name="minus" size={16} />
          </button>
          <button
            type="button"
            className={styles.stepBtn}
            onClick={() => adjust(60)}
            disabled={!editable || duration >= MAX_SECONDS}
            title="Add one minute"
            aria-label="Add one minute"
          >
            <TeachIcon name="plus" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
