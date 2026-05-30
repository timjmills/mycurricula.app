// ClockWidget — a live wall clock (Phase 3 interactive widget library). An SVG
// analog face (tick marks + hour/minute/second hands driven off `new Date()`)
// over a digital readout below. Updated each second via setInterval. Two durable
// prefs persist via useWidgetState: 12h/24h and show-seconds; their toggles hide
// until the tile is hovered/focused so the clock reads cleanly. SSR-safe — until
// the post-mount tick lands we render a stable placeholder so server HTML matches
// the first client paint (no hydration mismatch). Hands use tokens for colour.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useWidgetState } from "@/lib/teach/use-widget-state";
import type { WidgetBodyProps } from "./types";
import styles from "./ClockWidget.module.css";

/** Durable slice — display preferences only (never the live time). */
interface ClockPersisted extends Record<string, unknown> {
  /** 24-hour clock when true; 12-hour with AM/PM when false. */
  hour24: boolean;
  /** Render the second hand + digital seconds when true. */
  showSeconds: boolean;
}

/** Read a boolean config field defensively, falling back to `fallback`. */
function readBool(
  config: Record<string, unknown>,
  field: string,
  fallback: boolean,
): boolean {
  const raw = config[field];
  return typeof raw === "boolean" ? raw : fallback;
}

/** Format the digital readout for the given preferences. */
function formatDigital(
  date: Date,
  hour24: boolean,
  showSeconds: boolean,
): string {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  let suffix = "";
  if (!hour24) {
    suffix = hours >= 12 ? " PM" : " AM";
    hours = hours % 12;
    if (hours === 0) hours = 12;
  }
  const hh = hour24 ? String(hours).padStart(2, "0") : String(hours);
  const mm = String(minutes).padStart(2, "0");
  const core = showSeconds
    ? `${hh}:${mm}:${String(seconds).padStart(2, "0")}`
    : `${hh}:${mm}`;
  return `${core}${suffix}`;
}

export function ClockWidget({ widget, subjectId }: WidgetBodyProps): ReactNode {
  const initial = useMemo<ClockPersisted>(
    () => ({
      hour24: readBool(widget.config, "hour24", false),
      showSeconds: readBool(widget.config, "showSeconds", true),
    }),
    [widget.config],
  );
  const { state, setState } = useWidgetState<ClockPersisted>(
    widget.id,
    initial,
  );
  const { hour24, showSeconds } = state;

  // Transient — the live time. Null until the post-mount tick so server HTML and
  // the first client paint agree (the placeholder renders for both).
  const [now, setNow] = useState<Date | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    // Paint immediately on mount, then once per second.
    setNow(new Date());
    intervalRef.current = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      if (intervalRef.current != null)
        window.clearInterval(intervalRef.current);
    };
  }, []);

  const toggle24 = useCallback((): void => {
    setState((prev) => ({ ...prev, hour24: !prev.hour24 }));
  }, [setState]);

  const toggleSeconds = useCallback((): void => {
    setState((prev) => ({ ...prev, showSeconds: !prev.showSeconds }));
  }, [setState]);

  // Hand angles (degrees, 0 = 12 o'clock). Computed only when we have a time.
  const handAngles = now
    ? (() => {
        const s = now.getSeconds();
        const m = now.getMinutes();
        const h = now.getHours() % 12;
        return {
          second: s * 6, // 360 / 60
          minute: m * 6 + s * 0.1, // smooth sweep
          hour: h * 30 + m * 0.5, // 360 / 12, plus minute creep
        };
      })()
    : null;

  return (
    <div className={`cp-subj ${subjectId} ${styles.body}`}>
      {/* Pref toggles — hidden until hover/focus so the face reads cleanly. */}
      <div className={styles.toggles}>
        <button
          type="button"
          className={`${styles.toggle} ${hour24 ? styles.toggleOn : ""}`}
          onClick={toggle24}
          aria-pressed={hour24}
          title={
            hour24
              ? "Switch the clock to a 12-hour display"
              : "Switch the clock to a 24-hour display"
          }
        >
          {hour24 ? "24h" : "12h"}
        </button>
        <button
          type="button"
          className={`${styles.toggle} ${showSeconds ? styles.toggleOn : ""}`}
          onClick={toggleSeconds}
          aria-pressed={showSeconds}
          title={
            showSeconds
              ? "Hide the seconds on the clock"
              : "Show the seconds on the clock"
          }
        >
          {showSeconds ? "Sec on" : "Sec off"}
        </button>
      </div>

      <div className={styles.face}>
        <svg
          className={styles.dial}
          viewBox="0 0 100 100"
          role="img"
          aria-label={
            now
              ? `Current time ${formatDigital(now, hour24, showSeconds)}`
              : "Clock"
          }
        >
          {/* Outer rim. */}
          <circle
            cx="50"
            cy="50"
            r="47"
            fill="var(--paper)"
            stroke="var(--ink-150)"
            strokeWidth="2"
          />
          {/* Tick marks — 12 long (hour), 48 short (minute). */}
          {Array.from({ length: 60 }, (_, i) => {
            const isHour = i % 5 === 0;
            const angle = (i * 6 * Math.PI) / 180;
            const inner = isHour ? 38 : 42;
            const outer = 45;
            const x1 = 50 + inner * Math.sin(angle);
            const y1 = 50 - inner * Math.cos(angle);
            const x2 = 50 + outer * Math.sin(angle);
            const y2 = 50 - outer * Math.cos(angle);
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={isHour ? "var(--ink-500)" : "var(--ink-300)"}
                strokeWidth={isHour ? 2 : 1}
                strokeLinecap="round"
              />
            );
          })}

          {/* Hands — only once the live time exists. */}
          {handAngles ? (
            <g>
              {/* Hour hand. */}
              <line
                x1="50"
                y1="50"
                x2="50"
                y2="28"
                stroke="var(--ink-900)"
                strokeWidth="4"
                strokeLinecap="round"
                transform={`rotate(${handAngles.hour} 50 50)`}
              />
              {/* Minute hand. */}
              <line
                x1="50"
                y1="50"
                x2="50"
                y2="16"
                stroke="var(--ink-700)"
                strokeWidth="3"
                strokeLinecap="round"
                transform={`rotate(${handAngles.minute} 50 50)`}
              />
              {/* Second hand (optional). */}
              {showSeconds ? (
                <line
                  x1="50"
                  y1="56"
                  x2="50"
                  y2="14"
                  stroke="var(--c)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  transform={`rotate(${handAngles.second} 50 50)`}
                />
              ) : null}
              <circle cx="50" cy="50" r="2.6" fill="var(--ink-900)" />
            </g>
          ) : null}
        </svg>
      </div>

      <div className={styles.digital}>
        {now ? formatDigital(now, hour24, showSeconds) : "--:--"}
      </div>
    </div>
  );
}
