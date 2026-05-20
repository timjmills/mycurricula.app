"use client";

// WeeklyShell.tsx — the Weekly view's 3-panel shell.
//
// Mirrors the Daily view's IconRail + content + RightRail composition
// (see components/daily/DailyView.tsx), but tailored to Weekly:
//
//   body row → [icon rail] [weekly grid] [splitter] [right rail]
//
// There is NO lesson-list column for Weekly — the grid IS the lessons.
// The grid sits in the center 1fr track; a draggable PaneSplitter governs
// the boundary between the grid and the right rail. The rail's width is
// persisted to its OWN localStorage key so a teacher can keep Weekly and
// Daily sized differently.
//
// ── Reuse, not rebuild ──────────────────────────────────────────────────
// We reuse three Daily-view components verbatim:
//
//   • <IconRail>       — the 56px far-left nav strip; presentational only
//                        in Phase 1A. Subject-neutral chrome, same for
//                        both views.
//   • <RightRail>      — passed `mode="week"` plus the active week's
//                        lessons so the Resources panel aggregates across
//                        the whole week instead of one lesson. To-dos +
//                        Shoutbox stay day-scoped (we forward the active
//                        day index — `selectedDay` from app state).
//   • <PaneSplitter>   — the same separator the Daily list↔detail boundary
//                        uses. The wrapper styles in this shell pin it to
//                        live between the grid and the rail.
//
// The grid itself (<WeeklyGrid>) is rendered untouched in the center slot;
// a thin module wrapper carries `min-width: 0; min-height: 0` so the grid
// shrinks gracefully when the rail grows.
//
// ── Pane width persistence ──────────────────────────────────────────────
// Same "no fixed clamps; sanity-bounded by the live container" model the
// Daily view uses:
//
//   • PANE_FLOOR (40px) is the absolute minimum width for the rail AND
//     the reservation kept for the center grid.
//   • The right-rail width persists to localStorage under
//     `mycurricula:weekly-right-width` (NOT shared with Daily's keys).
//   • State initializes to the DEFAULT (not the persisted value) so the
//     server-rendered HTML matches the first client render; a post-mount
//     effect hydrates from localStorage. This avoids hydration mismatches
//     — same SSR-guarded pattern as DailyView's pane persistence.
//
// ── Accessibility ──────────────────────────────────────────────────────
// Every interactive control is keyboard-operable. The splitter is a real
// role="separator" with aria-orientation + aria-valuemin/max/now (handled
// inside <PaneSplitter>). The rail wrapper carries an aria-label. Reduced
// motion is honored by the consumed components (the splitter has no
// motion; RightRail's collapse uses an opacity-only path under
// `prefers-reduced-motion`).

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IconRail, PaneSplitter, RightRail } from "@/components/daily";
import { WeeklyGrid } from "@/components/grid";
import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import type { Lesson } from "@/lib/types";
import styles from "./WeeklyShell.module.css";

// ── Pane-width constants (mirror of the DailyView model) ─────────────────
// PANE_FLOOR — absolute minimum width for the rail AND the reservation
// kept for the center grid. Identical floor to DailyView so the chrome
// reads consistently across views.
const PANE_FLOOR = 40;
/** Default right-rail width on first paint (pre-localStorage hydration). */
const RIGHT_PANE_DEFAULT = 320;
/** Keyboard nudge step (px) for the splitter's arrow-key resize. */
const PANE_STEP = 16;
/** localStorage key — DISTINCT from Daily's so the two views can size
 *  their rails independently. */
const RIGHT_PANE_WIDTH_KEY = "mycurricula:weekly-right-width";

/** Clamp a candidate rail width to dynamic, sanity-only bounds.
 *
 *  - `bodyWidth` is the live container width.
 *  - We reserve PANE_FLOOR for the center grid track so a teacher cannot
 *    drag the rail wide enough to crush the grid to nothing. (The icon
 *    rail is fixed-width and sits OUTSIDE the resizable body row, so its
 *    width is not part of this math.)
 *
 *  When `bodyWidth` is unavailable (initial paint, ref not yet attached)
 *  we fall back to a permissive lower-bound clamp so persisted values are
 *  honoured. */
function clampRightWidth(px: number, bodyWidth: number): number {
  const rounded = Math.round(px);
  if (!Number.isFinite(bodyWidth) || bodyWidth <= 0) {
    return Math.max(PANE_FLOOR, rounded);
  }
  const max = Math.max(PANE_FLOOR, bodyWidth - PANE_FLOOR);
  return Math.min(max, Math.max(PANE_FLOOR, rounded));
}

/** Compute the live (min, max) bounds for the rail given the container
 *  width. Used for aria-valuemin / aria-valuemax on the splitter and the
 *  resize-observer re-clamp. */
function rightBounds(bodyWidth: number): { min: number; max: number } {
  if (!Number.isFinite(bodyWidth) || bodyWidth <= 0) {
    return { min: PANE_FLOOR, max: Number.MAX_SAFE_INTEGER };
  }
  return { min: PANE_FLOOR, max: Math.max(PANE_FLOOR, bodyWidth - PANE_FLOOR) };
}

/** Read the saved right-rail width, or the default. SSR-guarded. */
function readRightWidth(): number {
  if (typeof window === "undefined") return RIGHT_PANE_DEFAULT;
  try {
    const raw = window.localStorage.getItem(RIGHT_PANE_WIDTH_KEY);
    if (!raw) return RIGHT_PANE_DEFAULT;
    const parsed = Number(raw);
    return Number.isFinite(parsed)
      ? Math.max(PANE_FLOOR, Math.round(parsed))
      : RIGHT_PANE_DEFAULT;
  } catch {
    // Corrupt or unavailable storage — fall back to the default width.
    return RIGHT_PANE_DEFAULT;
  }
}

/** Persist the chosen right-rail width. Non-fatal on failure. */
function writeRightWidth(px: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RIGHT_PANE_WIDTH_KEY, String(px));
  } catch {
    // Storage full / unavailable — width simply won't persist; non-fatal.
  }
}

// ── WeeklyShell ──────────────────────────────────────────────────────────

export function WeeklyShell(): ReactNode {
  // The active week + day are shared planner state — same source the
  // <WeeklyGrid> already reads. We don't pin a local copy here; the
  // RightRail just needs the current value to scope its Resources +
  // Shoutbox panels.
  const { week, selectedDay } = useAppState();
  const { lessons } = usePlanner();

  // ── Lessons-for-this-week — fed to RightRail for week-mode aggregation ─
  // Filter once per (lessons, week) change so the right rail's
  // ResourcesPanel sees a stable array identity until something actually
  // moves into / out of the week.
  const weekLessons = useMemo<Lesson[]>(
    () => lessons.filter((l) => l.week === week),
    [lessons, week],
  );

  // ── Right-rail width — state + post-mount hydration ──────────────────
  // Initialize to the DEFAULT (not localStorage) so the server-rendered
  // HTML matches the first client render. The effect below hydrates the
  // saved value once mounted. Same pattern DailyView uses.
  const [rightWidth, setRightWidth] = useState<number>(RIGHT_PANE_DEFAULT);

  // Track whether the post-mount hydration completed. We only START
  // persisting writes after that point so the very first effect (loading
  // the saved value) doesn't immediately overwrite localStorage with the
  // default.
  const hydratedRef = useRef(false);

  // Body-row ref — we read its width to clamp the rail against the live
  // container (so a window resize never strands the rail at a width
  // bigger than the body). Stored as a number in state so the splitter's
  // aria-valuemax stays in sync.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [bodyWidth, setBodyWidth] = useState<number>(0);

  // ── Hydrate the saved width once on mount ────────────────────────────
  useEffect(() => {
    setRightWidth(readRightWidth());
    hydratedRef.current = true;
  }, []);

  // ── Persist on change (after hydration) ──────────────────────────────
  useEffect(() => {
    if (!hydratedRef.current) return;
    writeRightWidth(rightWidth);
  }, [rightWidth]);

  // ── Observe container size so the bound follows window resizes ───────
  // When the body row shrinks (window resize, devtools opened, …) we
  // re-clamp the rail width against the new bound. This mirrors the
  // Daily view's resize-observer behavior so a rail dragged wide on a
  // big monitor doesn't get stuck off-screen on a narrow one.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.round(entry.contentRect.width);
        setBodyWidth(w);
        // Only re-clamp once we're past hydration so the first paint
        // doesn't double-write to localStorage.
        if (hydratedRef.current) {
          setRightWidth((prev) => clampRightWidth(prev, w));
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Splitter onDrag — clientX → new rail width ───────────────────────
  // The splitter sits BETWEEN the center grid and the right rail. As the
  // pointer moves LEFT, the rail grows (width = body.right − clientX);
  // RIGHT, it shrinks. We anchor off the body row's right edge so the
  // math stays independent of the icon-rail width and any horizontal
  // page padding.
  const handleSplitterDrag = useCallback((clientX: number): void => {
    const body = bodyRef.current;
    if (!body) return;
    const rect = body.getBoundingClientRect();
    // Convert pointer x → desired rail width (px) → clamp to live bounds.
    const desired = rect.right - clientX;
    setRightWidth(clampRightWidth(desired, rect.width));
  }, []);

  // ── Splitter onStep — keyboard nudge ─────────────────────────────────
  // PaneSplitter reports +1 for ArrowRight/Down, −1 for ArrowLeft/Up. The
  // splitter sits to the LEFT of the rail, so right-arrow should SHRINK
  // the rail and left-arrow should GROW it — i.e. the opposite of the
  // direction sign. (This mirrors Daily's right-pane splitter mapping.)
  const handleSplitterStep = useCallback(
    (direction: -1 | 1): void => {
      const body = bodyRef.current;
      const live = body?.getBoundingClientRect().width ?? bodyWidth;
      setRightWidth((prev) =>
        clampRightWidth(prev + direction * -1 * PANE_STEP, live),
      );
    },
    [bodyWidth],
  );

  // ── Splitter bounds for ARIA — live + clamped ────────────────────────
  const bounds = useMemo(() => rightBounds(bodyWidth), [bodyWidth]);

  // Build the body's grid-template-columns inline — center 1fr + auto
  // splitter + sized rail. The icon rail sits OUTSIDE this grid so it
  // never participates in the splitter math.
  const gridTemplate = `1fr auto ${Math.round(rightWidth)}px`;

  return (
    <div className={styles.page}>
      {/* ── Body row: icon rail (fixed) + resizable grid/rail body ───── */}
      <div className={styles.bodyRow}>
        {/* Far-left slim icon nav strip — shared with Daily. */}
        <IconRail />

        {/* The resizable body: center grid + splitter + right rail. */}
        <div
          ref={bodyRef}
          className={styles.body}
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {/* Center slot — the existing WeeklyGrid, untouched. The slot
              wrapper provides min-width: 0 so the grid can shrink
              gracefully when the rail grows. */}
          <div className={styles.gridSlot} data-pane="grid">
            <WeeklyGrid />
          </div>

          {/* Splitter — same component the Daily view uses. */}
          <PaneSplitter
            width={Math.round(rightWidth)}
            min={bounds.min}
            max={bounds.max}
            onDrag={handleSplitterDrag}
            onStep={handleSplitterStep}
            label="Resize resources rail"
          />

          {/* Right rail — week-scoped. The lessons array drives the
              Resources panel's week-wide aggregation; To-dos and
              Shoutbox stay day-scoped via `selectedDay`. We pass
              `lesson={null}` so the existing day-mode contract is
              preserved (RightRail ignores `lesson` in week mode). */}
          <div className={styles.railSlot} data-pane="rail">
            <RightRail
              lesson={null}
              week={week}
              day={selectedDay}
              mode="week"
              lessons={weekLessons}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
