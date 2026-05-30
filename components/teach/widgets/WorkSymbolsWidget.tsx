// WorkSymbolsWidget — an INTERACTIVE work-mode selector (Phase 3 widget
// library). A row of mode buttons (Silent / Whisper / Partner / Group / Ask
// teacher), each a bespoke line glyph + label; tapping one promotes it to a big
// "current mode" banner and tapping the active mode again clears it (no mode).
// The selected key persists via useWidgetState. Glyphs are inline SVG
// (stroke=currentColor) so they tint with the surrounding ink/token colour.

"use client";

import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { useWidgetState } from "@/lib/teach/use-widget-state";
import type { WidgetBodyProps } from "./types";
import styles from "./WorkSymbolsWidget.module.css";

/** The five work modes, keyed stably for persistence. "none" = nothing chosen. */
type WorkMode = "silent" | "whisper" | "partner" | "group" | "ask";

/** Durable slice — the selected mode key (or null when nothing is showing). */
interface WorkPersisted extends Record<string, unknown> {
  mode: WorkMode | null;
}

/** Bespoke line glyphs (stroke=currentColor) for each mode. */
function ModeGlyph({ mode }: { mode: WorkMode }): ReactNode {
  switch (mode) {
    case "silent":
      // Finger to lips — a face in profile with a vertical "shush" finger.
      return (
        <g>
          <circle cx="12" cy="9" r="6" />
          <path d="M12 9v8" />
          <path d="M9 20c0-1.7 1.3-3 3-3s3 1.3 3 3" />
        </g>
      );
    case "whisper":
      // A speaker emitting a single soft wave.
      return (
        <g>
          <path d="M4 9v6h4l5 4V5L8 9H4z" />
          <path d="M16 10a3 3 0 0 1 0 4" />
        </g>
      );
    case "partner":
      // Two people side by side.
      return (
        <g>
          <circle cx="8" cy="8" r="3" />
          <circle cx="16" cy="8" r="3" />
          <path d="M3 20c0-2.8 2.2-5 5-5s5 2.2 5 5" />
          <path d="M13 20c.4-2.4 2.4-4.2 4.8-4.2 1.3 0 2.5.5 3.2 1.4" />
        </g>
      );
    case "group":
      // Three people — a small cluster.
      return (
        <g>
          <circle cx="12" cy="7" r="2.6" />
          <circle cx="5.5" cy="9.5" r="2.4" />
          <circle cx="18.5" cy="9.5" r="2.4" />
          <path d="M7.5 20c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" />
          <path d="M2 19c0-1.9 1.3-3.4 3.1-3.4" />
          <path d="M22 19c0-1.9-1.3-3.4-3.1-3.4" />
        </g>
      );
    case "ask":
      // A raised hand.
      return (
        <g>
          <path d="M9 11V5a1.3 1.3 0 0 1 2.6 0v5" />
          <path d="M11.6 10V4a1.3 1.3 0 0 1 2.6 0v6" />
          <path d="M14.2 10.5V6a1.3 1.3 0 0 1 2.6 0v7c0 3.3-2.2 6-5.6 6-2.2 0-3.6-1-4.6-2.6l-2-3.2a1.3 1.3 0 0 1 2.1-1.5l1.2 1.5V8.5a1.3 1.3 0 0 1 2.6 0V11" />
        </g>
      );
  }
}

const MODES: ReadonlyArray<{ key: WorkMode; label: string }> = [
  { key: "silent", label: "Silent" },
  { key: "whisper", label: "Whisper" },
  { key: "partner", label: "Partner" },
  { key: "group", label: "Group" },
  { key: "ask", label: "Ask teacher" },
];

/** Read a previously-configured default mode defensively. */
function readConfigMode(config: Record<string, unknown>): WorkMode | null {
  const raw = config.mode;
  if (
    raw === "silent" ||
    raw === "whisper" ||
    raw === "partner" ||
    raw === "group" ||
    raw === "ask"
  ) {
    return raw;
  }
  return null;
}

/** A single inline-SVG glyph wrapper sized in px. */
function Glyph({ mode, size }: { mode: WorkMode; size: number }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <ModeGlyph mode={mode} />
    </svg>
  );
}

export function WorkSymbolsWidget({
  widget,
  subjectId,
}: WidgetBodyProps): ReactNode {
  const initial = useMemo<WorkPersisted>(
    () => ({ mode: readConfigMode(widget.config) }),
    [widget.config],
  );
  const { state, setState } = useWidgetState<WorkPersisted>(widget.id, initial);
  const mode = state.mode;
  const current = MODES.find((m) => m.key === mode) ?? null;

  // Tap a mode to promote it; tap the active mode to deselect (no mode showing).
  const choose = useCallback(
    (key: WorkMode): void => {
      setState((prev) => ({ ...prev, mode: prev.mode === key ? null : key }));
    },
    [setState],
  );

  return (
    <div className={`cp-subj ${subjectId} ${styles.body}`}>
      <div
        className={`${styles.banner} ${current ? styles.bannerActive : ""}`}
        aria-live="polite"
      >
        {current ? (
          <>
            <span className={styles.bannerGlyph}>
              <Glyph mode={current.key} size={40} />
            </span>
            <span className={styles.bannerLabel}>{current.label}</span>
          </>
        ) : (
          <span className={styles.bannerEmpty}>Pick a work mode</span>
        )}
      </div>

      <div className={styles.grid} role="radiogroup" aria-label="Work mode">
        {MODES.map(({ key, label }) => {
          const isOn = mode === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={isOn}
              className={`${styles.modeBtn} ${isOn ? styles.modeBtnOn : ""}`}
              onClick={() => choose(key)}
              title={
                isOn
                  ? `${label} mode is showing — tap to clear it`
                  : `Show "${label}" as the class work mode`
              }
            >
              <span className={styles.modeGlyph}>
                <Glyph mode={key} size={22} />
              </span>
              <span className={styles.modeLabel}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
