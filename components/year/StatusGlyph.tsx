"use client";

// StatusGlyph — per-day lesson status icon used in both Roadmap and
// Progression views.
//
// Four states, distinguishable by both color AND shape (not color alone):
//   done     → filled circle with a white check mark
//   current  → soft-fill circle with a dark ring (in progress)
//   skipped  → hollow ring (white fill, gray border)
//   upcoming → small gray dot
//
// Tone is the lane's ROAD_TONE entry (provides fill and check colors).
// Respects prefers-reduced-motion — no scale-in animation when set.

import styles from "./StatusGlyph.module.css";
import type { RoadTone } from "./roadTones";
import type { GlyphState } from "@/lib/year-calendar";

interface StatusGlyphProps {
  state: GlyphState;
  /** The lane's highlighter tone. Used for "done" and "current" colors. */
  tone?: RoadTone;
  size?: number;
  /** Accessible label override — defaults to the state name. */
  "aria-label"?: string;
}

export function StatusGlyph({
  state,
  tone,
  size = 14,
  "aria-label": ariaLabel,
}: StatusGlyphProps) {
  const label = ariaLabel ?? state;

  if (state === "done") {
    // Filled circle in the lane's "check" (completion) color with a white SVG check.
    return (
      <span
        className={styles.glyph}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: tone?.check ?? "#107D3A",
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
        aria-label={label}
        role="img"
      >
        <svg
          width={size - 5}
          height={size - 5}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 8l3 3 7-7" />
        </svg>
      </span>
    );
  }

  if (state === "skipped") {
    // Hollow ring — white fill, gray border. Visually distinct from both
    // "done" (filled+check) and "upcoming" (gray dot, no white fill).
    return (
      <span
        className={styles.glyph}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "#fff",
          border: "1.8px solid #94A3B8",
          display: "inline-flex",
          flexShrink: 0,
        }}
        aria-label={label}
        role="img"
      />
    );
  }

  if (state === "current") {
    // Soft fill in the lane's stroke (highlight) color with a colored ring.
    return (
      <span
        className={styles.glyph}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: tone?.stroke ?? "#A0F0B8",
          border: `2px solid ${tone?.check ?? "#10A050"}`,
          display: "inline-flex",
          flexShrink: 0,
        }}
        aria-label={label}
        role="img"
      />
    );
  }

  // "upcoming" — small gray dot
  return (
    <span
      className={styles.glyph}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "#E6E9F4",
        border: "1px solid #CFD4E2",
        display: "inline-flex",
        flexShrink: 0,
      }}
      aria-label={label}
      role="img"
    />
  );
}
