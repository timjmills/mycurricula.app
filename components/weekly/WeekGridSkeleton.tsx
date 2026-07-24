"use client";

// WeekGridSkeleton — the loading placeholder for the Weekly VIEW canvases.
//
// WHY THIS EXISTS. The Weekly view's grid canvases (WeekColumns / WeekA /
// WeekC) each render their day columns unconditionally, so during the Supabase
// hydrate chain (11–16s) every column paints its own "No lessons" empty cell.
// A teacher therefore sees a full, false "nothing planned this week" for up to
// 16 seconds before their real plan arrives — the exact loading-vs-empty
// conflation the 7.23 honesty wave fixed on the other planner surfaces (see
// components/ui/PlannerEmpty). This is the grid-shaped counterpart: a day-column
// skeleton the shell renders in place of the canvas while `usePlannerDataState`
// is "pending". It disappears — and the real canvas mounts — the instant the
// hydrate settles, so the settled path is untouched.
//
// SHAPE. It mirrors WeekColumns' footprint (the paper/default frame): the same
// `.page` > `.scroll` > `.week` shell, `--day-count` columns from the configured
// school week, a sticky-header placeholder over a stack of card-shaped blocks.
// Matching that footprint keeps the swap-to-data transition free of layout
// shift on the default frame; on the glass/color frames the pane size is
// identical and only the internal arrangement differs.
//
// ACCESSIBILITY. ONE role="status" aria-busy region with a visually-hidden
// "Loading your plan…" label (never a per-column region — five live regions
// would chatter, the same reason WeekColumns avoids per-column status). The
// visual grid is aria-hidden. The shimmer reuses the shared skeleton token
// system (--skeleton-base / --skeleton-sheen) and, like the Skeleton primitive,
// falls back to a static fill under prefers-reduced-motion.
//
// SSR-safe: the column count comes from the SSR-safe useOrderedWeekdays and the
// per-column card counts are a fixed pattern (no Math.random), so the
// server-first paint — which is "pending" whenever the Supabase flag is ON —
// matches the first client render.

import type { CSSProperties, ReactNode } from "react";
import { useOrderedWeekdays } from "@/lib/week-order";
import styles from "./WeekGridSkeleton.module.css";

// Fixed, organic-looking card counts per column. Indexed modulo its length so
// any school-week size (3-day to 6-day) reads as a plausibly-populated week.
const CARDS_PER_COLUMN = [3, 2, 4, 3, 2, 3];

export function WeekGridSkeleton(): ReactNode {
  // Same ordered-week contract the real canvases use — never a fixed 5.
  const weekdays = useOrderedWeekdays();
  const dayCount = weekdays.length;

  return (
    <div
      className={styles.page}
      role="status"
      aria-busy="true"
      data-week-skeleton="true"
    >
      <span className={styles.srOnly}>Loading your plan…</span>
      <div className={styles.scroll} aria-hidden="true">
        <div
          className={styles.week}
          style={{ "--day-count": dayCount } as CSSProperties}
        >
          {weekdays.map(({ token }, colIdx) => {
            const cardCount =
              CARDS_PER_COLUMN[colIdx % CARDS_PER_COLUMN.length] ?? 3;
            return (
              <div key={token} className={styles.col}>
                <div className={styles.colHead}>
                  <span className={styles.headBar} />
                </div>
                <div className={styles.stack}>
                  {Array.from({ length: cardCount }).map((_, cardIdx) => (
                    <span key={cardIdx} className={styles.card} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
