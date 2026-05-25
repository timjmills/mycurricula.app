"use client";

// StatusGlyph — per-day lesson status icon used in both Roadmap and
// Progression views.
//
// Four states, distinguishable by both color AND shape (not color alone):
//   done     → filled circle in --done green with a white check mark
//   current  → soft-fill circle (--cl tint) with a --c ring (in progress)
//   skipped  → hollow ring (white fill, --catchup red border)
//   upcoming → small ink-100 dot with ink-200 border
//
// The cp-subj cascade (lib/palette.tsx) must be active on an ancestor element
// for var(--c) / var(--cl) to resolve to the correct subject color. In both
// views the lane row root carries the cp-subj class, so glyphs inside inherit
// correctly. The inline wrapper here re-applies it for the legend, where glyphs
// render outside a lane row.
//
// Respects prefers-reduced-motion — the scale-in animation collapses to instant.

import styles from "./StatusGlyph.module.css";
import { subjectClassName } from "./roadTones";
import type { GlyphState } from "@/lib/year-calendar";
import type { SubjectId } from "@/lib/types";

interface StatusGlyphProps {
  state: GlyphState;
  /**
   * The owning subject — needed so the glyph can re-apply the cp-subj cascade
   * when rendered outside a subject lane row (e.g., the bottom legend).
   * Optional; omit when an ancestor already carries the cp-subj class.
   */
  subjectId?: SubjectId;
  size?: number;
  /** Accessible label override — defaults to the state name. */
  "aria-label"?: string;
}

export function StatusGlyph({
  state,
  subjectId,
  size = 14,
  "aria-label": ariaLabel,
}: StatusGlyphProps) {
  const label = ariaLabel ?? state;
  // Re-apply cp-subj only when the caller supplies subjectId (legend context).
  const subjectClass = subjectId ? subjectClassName(subjectId) : undefined;

  if (state === "done") {
    // Filled circle in --done (semantic green) with a white SVG check.
    // Shape: filled circle + checkmark icon.
    return (
      <span
        className={`${styles.glyph} ${subjectClass ?? ""}`}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "var(--done)",
          color: "var(--paper)",
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
    // Hollow ring — white fill, --catchup red border.
    // Shape: circle outline (no fill), distinct from "upcoming" gray dot.
    return (
      <span
        className={`${styles.glyph} ${subjectClass ?? ""}`}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "var(--paper)",
          border: "1.8px solid var(--catchup)",
          display: "inline-flex",
          flexShrink: 0,
        }}
        aria-label={label}
        role="img"
      />
    );
  }

  if (state === "current") {
    // Soft --cl fill with a --c ring — "in progress" feel using subject colors.
    // Shape: solid circle with a colored border ring.
    return (
      <span
        className={`${styles.glyph} ${subjectClass ?? ""}`}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "var(--cl)",
          border: "2px solid var(--c)",
          display: "inline-flex",
          flexShrink: 0,
        }}
        aria-label={label}
        role="img"
      />
    );
  }

  // "upcoming" — small ink-100 dot with ink-200 border.
  // Shape: tiny filled circle, fully neutral — minimal visual weight.
  return (
    <span
      className={`${styles.glyph} ${subjectClass ?? ""}`}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--ink-100)",
        border: "1px solid var(--ink-200)",
        display: "inline-flex",
        flexShrink: 0,
      }}
      aria-label={label}
      role="img"
    />
  );
}
