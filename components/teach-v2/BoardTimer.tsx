"use client";

// components/teach-v2/BoardTimer.tsx — the board-header countdown timer
// (artboard T "timer"). The artboard hardcodes 600s with no setter; this gives
// it a REAL duration control: a small presets popover (1–30 min) plus play /
// pause / reset. Fully self-contained local state — no contract coupling.
//
// Reset returns to the CHOSEN duration (not a fixed 600s). Reduced-motion is a
// non-issue (no animation); the ticking digits use tabular-nums so the width
// never jitters.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button, Tooltip } from "@/components/ui";
import { V2Icon } from "./icons";
import styles from "./BoardTimer.module.css";

/** Duration presets in seconds. */
const PRESETS: readonly { label: string; seconds: number }[] = [
  { label: "1 min", seconds: 60 },
  { label: "3 min", seconds: 180 },
  { label: "5 min", seconds: 300 },
  { label: "10 min", seconds: 600 },
  { label: "15 min", seconds: 900 },
  { label: "20 min", seconds: 1200 },
  { label: "30 min", seconds: 1800 },
];

const DEFAULT_SECONDS = 600;

function fmt(total: number): string {
  const s = Math.max(0, total);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export interface BoardTimerProps {
  /** Signal picker open-state up so the shell's true-fullscreen Esc defers while
   *  the duration popover is on top (top-layer-only Esc). */
  onPopoverChange?: (open: boolean) => void;
}

export function BoardTimer({ onPopoverChange }: BoardTimerProps = {}): ReactNode {
  const [duration, setDuration] = useState(DEFAULT_SECONDS);
  const [sec, setSec] = useState(DEFAULT_SECONDS);
  const [running, setRunning] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onPopoverChange?.(pickerOpen);
    return () => onPopoverChange?.(false);
  }, [pickerOpen, onPopoverChange]);

  // Tick once per second while running; stop at zero.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setSec((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          setRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  // Close the presets popover on outside click / Escape.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent): void => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  const reset = useCallback(() => {
    setRunning(false);
    setSec(duration);
  }, [duration]);

  const pickDuration = useCallback((seconds: number) => {
    setDuration(seconds);
    setSec(seconds);
    setRunning(false);
    setPickerOpen(false);
  }, []);

  const done = sec === 0;

  return (
    <div className={styles.timer} ref={pickerRef}>
      <Tooltip
        content="Set the countdown length"
        side="bottom"
        tooltipId="teach-v2-timer-duration"
      >
        <button
          type="button"
          className={`${styles.readout} ${done ? styles.readoutDone : ""}`}
          aria-label={`Countdown ${fmt(sec)} — choose a duration`}
          aria-haspopup="menu"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((o) => !o)}
        >
          <span className={styles.readoutTime}>{fmt(sec)}</span>
        </button>
      </Tooltip>

      <Button
        variant="icon"
        size="sm"
        iconAriaLabel={running ? "Pause timer" : "Start timer"}
        tooltip={running ? "Pause the countdown" : "Start the countdown"}
        onClick={() => setRunning((r) => !r)}
        disabled={done}
      >
        <V2Icon name={running ? "pause" : "play"} size={16} />
      </Button>
      <Button
        variant="icon"
        size="sm"
        iconAriaLabel="Reset timer"
        tooltip="Reset the countdown to its set length"
        onClick={reset}
      >
        <V2Icon name="reset" size={16} />
      </Button>

      {pickerOpen ? (
        <div className={styles.picker} role="menu" aria-label="Timer duration">
          {PRESETS.map((p) => (
            <button
              key={p.seconds}
              type="button"
              role="menuitemradio"
              aria-checked={p.seconds === duration}
              className={`${styles.pickerItem} ${
                p.seconds === duration ? styles.pickerItemActive : ""
              }`}
              onClick={() => pickDuration(p.seconds)}
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
