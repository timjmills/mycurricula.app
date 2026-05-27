"use client";

// Clock — the live "day · date · time" chip mounted in the planner chrome
// so a teacher always knows what day and minute they're looking at.
//
// ── Placement decision (Task 1 of Lane BE) ──────────────────────────────
// Lane W owns components/shell/top-bar.tsx in this build wave, so this
// component MUST NOT be added to the top bar. The cleanest visible-
// everywhere alternative is a small floating chip pinned to the BOTTOM-
// RIGHT of the planner viewport. Reasoning:
//
//   1. The top-bar is already crowded (Save indicator, view-tab pills,
//      master toggle, week label, undo/redo, more-menu). Adding another
//      chip there would tip the bar past its responsive collapse budget
//      (see BUILD_STANDARD.md §8 top-bar collapse cascade).
//   2. The left filter panel collapses entirely on phone (CLAUDE.md §4),
//      so a clock inside that rail would be invisible at the tier where
//      knowing "what day is it" matters most.
//   3. The right rail also hides below 1280px (BUILD_STANDARD.md §8),
//      same problem.
//   4. A floating bottom-right chip is the standard pattern for ambient
//      metadata (cf. macOS clock in menu bar, Discord call HUD, every
//      dashboard widget): it stays out of the primary scan path, never
//      competes with content for clicks, and survives every chrome
//      collapse. The chip sits ABOVE any planner content via z-index
//      and uses `position: fixed` so it persists through internal
//      scrolling on long pages (Year timeline, Catchup list).
//
// ── Tick model ──────────────────────────────────────────────────────────
// Tick every 30 seconds — minute resolution is plenty for "what time is
// it" awareness; ticking every second is wasteful render churn that
// hurts laptop battery for zero perceived benefit. The 30s cadence
// means the visible minute can lag up to 30s behind the true time,
// which is fine.
//
// ── SSR / hydration safety ──────────────────────────────────────────────
// `new Date()` returns different values on server vs. client, which
// would cause a hydration mismatch warning. Mitigation:
//
//   1. Initial render (server + first client paint) shows a stable
//      placeholder string ("—"). The DOM tree is identical on both
//      sides, so React's hydration diff is empty.
//   2. A `useEffect` swaps in the real time after mount. By the time
//      this runs we are past hydration and any DOM mutation is normal
//      client-side state.
//
// ── Reduced motion ──────────────────────────────────────────────────────
// The tick is a pure text swap with no entrance animation. No fade,
// slide, or scale. Nothing to suppress under `prefers-reduced-motion`,
// but the CSS file is still wired with a `@media (prefers-reduced-
// motion: reduce)` block as a defensive future-proof.

import { useEffect, useState, type ReactNode } from "react";
import { Tooltip } from "@/components/ui";
import styles from "./Clock.module.css";

/** Tick cadence in ms. 30 seconds is plenty for a minute-resolution clock. */
const TICK_INTERVAL_MS = 30_000;

/** SSR-safe placeholder shown during the server render and the first
 *  client paint. Identical on both sides so hydration matches. */
const PLACEHOLDER_DATE = "—";
const PLACEHOLDER_TIME = "—";

/** Format the day-and-date half of the chip — e.g. "Sunday · Jan 18".
 *  We deliberately keep this short: the full year is implied and would
 *  push the chip past its design width. */
function formatDate(now: Date): string {
  // `weekday: "long"` → "Sunday"
  // `month: "short", day: "numeric"` → "Jan 18"
  // The middle-dot separator matches the eyebrow style used elsewhere
  // in the app (Subject · time, Grade 5 · 2025–26).
  const weekday = now.toLocaleString("en-US", { weekday: "long" });
  const monthDay = now.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `${weekday} · ${monthDay}`;
}

/** Format the time half — e.g. "9:42 AM". 12-hour with AM/PM matches
 *  the rest of the app's time chips (lesson cards, schedule pills). */
function formatTime(now: Date): string {
  return now.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * `variant`:
 *  - `"inline"` (default): renders flush with surrounding text in the
 *    top-bar — small typography, no chip background, no fixed position.
 *  - `"floating"`: legacy bottom-right floating chip (kept for an
 *    optional future setting; not the default per user direction
 *    2026-05-26 — "the clock should be in the top-bar next to Week 12").
 */
export interface ClockProps {
  variant?: "inline" | "floating";
}

export function Clock({ variant = "inline" }: ClockProps): ReactNode {
  // Start with stable placeholders so server-rendered HTML matches the
  // first client paint exactly (no hydration mismatch).
  const [dateLabel, setDateLabel] = useState<string>(PLACEHOLDER_DATE);
  const [timeLabel, setTimeLabel] = useState<string>(PLACEHOLDER_TIME);

  useEffect(() => {
    // Hydrate immediately on mount, then tick every 30 seconds. Using a
    // single setInterval (not setTimeout chained) keeps cleanup trivial
    // and the drift bounded.
    const update = (): void => {
      const now = new Date();
      setDateLabel(formatDate(now));
      setTimeLabel(formatTime(now));
    };
    update();
    const id = window.setInterval(update, TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  // Inline variant — flush typography next to Week N in the top-bar.
  // Tooltip carries the full date string per CLAUDE.md §4.
  const wrapperClass = variant === "floating" ? styles.chip : styles.inline;

  return (
    <Tooltip
      content="Today's date and time — kept current in your local timezone"
      side={variant === "floating" ? "left" : "bottom"}
    >
      {/* The chip is a non-interactive ambient surface. Role "status" so
          screen-reader users can opt into hearing the value on focus;
          aria-live is "off" so the SR doesn't shout the change every
          30 seconds. The tooltip carries the explanation per
          CLAUDE.md §4. */}
      <div
        className={wrapperClass}
        role="status"
        aria-live="off"
        // The fallback title= is what most browsers show when the
        // Tooltip portal has not yet rendered (touch devices, etc).
        title="Today's date and time — kept current in your local timezone"
      >
        <span className={styles.date}>{dateLabel}</span>
        <span className={styles.sep} aria-hidden="true">
          ·
        </span>
        <span className={styles.time}>{timeLabel}</span>
      </div>
    </Tooltip>
  );
}
