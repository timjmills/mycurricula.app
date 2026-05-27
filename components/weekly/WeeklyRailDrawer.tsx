"use client";

// WeeklyRailDrawer.tsx — the slide-from-right overlay drawer that exposes
// the Weekly view's right-rail content (<RightRail mode="week">) at
// viewport widths where the inline rail no longer fits.
//
// ── Why a drawer ──────────────────────────────────────────────────────────
// WeeklyShell.tsx mounts <RightRail mode="week"> inline on desktop. The
// WeeklyShell.module.css `@media (max-width: 1280px)` rule then `display:
// none`s that inline rail because the WeeklyGrid has a 1082px intrinsic
// min-width — sharing the row with a 320px rail forces the document past
// the viewport at every tier ≤1280px (RES-CRIT-001 in WeeklyShell.module.css).
//
// W3-C3 closes the gap: on narrow viewports the rail content is reachable
// via this overlay drawer instead of an inline pane. Behavior is identical
// (same React subtree under <RightRail mode="week">) — only the chrome
// changes.
//
// ── Open / close signal ───────────────────────────────────────────────────
// We do NOT introduce new app-state. The GlobalRail icons for To-dos and
// Shoutbox already toggle `todoPanelOpen` / `commentsPanelOpen` on
// `useAppState()`. The drawer is "open" when either is true. Closing the
// drawer flips both back to false so the icons' aria-pressed state stays
// honest. This mirrors how the Schedule drawer (SchedulePanel) consumes a
// single boolean on useAppState rather than carrying its own.
//
// The Resources panel is mounted inside <RightRail> too — there is no
// dedicated "resources" icon yet (it's marked SOON in rail-icons.tsx), so
// the To-dos / Shoutbox icons are the canonical triggers. When that icon
// graduates from SOON it'll wire to the same open-state via a new
// `resourcesPanelOpen` field; until then the existing two cover the surface.
//
// ── Chrome pattern ────────────────────────────────────────────────────────
// Mirrors components/schedule/SchedulePanel.tsx exactly:
//   • createPortal → document.body so the drawer escapes any overflow:hidden
//     parent inside the WeeklyShell layout.
//   • Scrim covers the viewport; click closes; ink-900 25% wash.
//   • Panel slides in from the right via transform; 400px desktop intent
//     but on narrow viewports the relevant sizes are tablet (~360px) and
//     phone (full-width).
//   • role="dialog" + aria-modal="true" + aria-labelledby on the heading.
//   • Escape closes; Tab / Shift-Tab cycle inside the panel (focus trap).
//   • Focus moves to the × close button on open; restored to the trigger
//     on close.
//   • prefers-reduced-motion drops the slide-in animation.
//
// We deliberately keep the chrome PATTERN identical but the chrome STYLES
// scoped to a local CSS module so the two drawers can evolve independently.

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Button, Tooltip } from "@/components/ui";
import { RightRail } from "@/components/daily";
import type { Lesson } from "@/lib/types";
import styles from "./WeeklyRailDrawer.module.css";

// ── Focusable selector (mirrors SchedulePanel / ResourceComposer) ──────────
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ── Close (×) icon ────────────────────────────────────────────────────────
function CloseIcon(): ReactNode {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────

export interface WeeklyRailDrawerProps {
  /** Render the drawer only when true. Driven by the consuming surface
   *  (WeeklyShell reads `todoPanelOpen || commentsPanelOpen` from
   *  app-state). */
  open: boolean;
  /** Fired when the drawer is dismissed — Escape, scrim click, or ×.
   *  WeeklyShell wires this to close BOTH the to-do and comments panel
   *  flags so the rail icons' aria-pressed state stays accurate. */
  onClose: () => void;
  /** Forwarded straight to <RightRail mode="week"> — see WeeklyShell for
   *  the lookup. */
  selectedLesson: Lesson | null;
  /** Active week number. */
  week: number;
  /** Active day index (0-based into the configured school week). */
  selectedDay: number;
  /** "day" when a lesson is selected, "week" otherwise — matches the
   *  inline rail's mode resolution. */
  railMode: "day" | "week";
  /** Lessons in the active week, fed to ResourcesPanel in week mode. */
  weekLessons: Lesson[];
  /** Optional clear-selection callback — mirrors the inline rail wiring. */
  onClearLesson?: () => void;
}

// ── WeeklyRailDrawer ──────────────────────────────────────────────────────

export function WeeklyRailDrawer({
  open,
  onClose,
  selectedLesson,
  week,
  selectedDay,
  railMode,
  weekLessons,
  onClearLesson,
}: WeeklyRailDrawerProps): ReactNode {
  const headingId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Track the element that held focus before we opened so we can restore.
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // ── On open: move focus into the drawer; lock body scroll ────────────────
  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    // Move focus to the close button on the next frame so the panel is
    // mounted and visible to the browser's focus algorithm. Same pattern
    // as SchedulePanel — we look up the first focusable button inside the
    // panel by `data-close-button` and focus it directly.
    const frame = requestAnimationFrame(() => {
      const closeBtn =
        panelRef.current?.querySelector<HTMLButtonElement>(
          "[data-close-button]",
        ) ?? null;
      closeBtn?.focus();
    });

    // Lock body scroll while the drawer is open so a phone user doesn't
    // get the document scrolling behind a full-viewport overlay.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // ── On close: restore focus to the trigger ───────────────────────────────
  useEffect(() => {
    if (open) return;
    const prev = previousFocusRef.current;
    if (prev && typeof prev.focus === "function") {
      const timer = setTimeout(() => prev.focus(), 0);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // ── Keyboard: Escape close + focus trap ──────────────────────────────────
  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;
        const focusable = Array.from(
          panel.querySelectorAll<HTMLElement>(FOCUSABLE),
        ).filter((el) => !el.hasAttribute("data-trap-exclude"));
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [onClose],
  );

  // ── Scrim click: close only when the click landed on the scrim itself,
  // not a child element that happened to bubble up. ─────────────────────────
  const handleScrimClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const headingText = `Resources, To-dos, and Shoutbox — Week ${week}`;

  // Portal so the drawer escapes any overflow:hidden / transform parent in
  // the WeeklyShell layout. Same approach as SchedulePanel.
  return createPortal(
    <div
      className={styles.scrim}
      onClick={handleScrimClick}
      onKeyDown={handleKeyDown}
      aria-hidden="false"
    >
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        title="Week rail — Resources for every lesson in this week, your to-dos, and the team Shoutbox. Swipe or tap outside to dismiss."
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header — eyebrow + title + × close ──────────────────────── */}
        <header className={styles.header}>
          <Tooltip
            content="Week rail — Resources aggregates across every lesson in the week. To-dos and Shoutbox stay scoped to the focused day."
            side="bottom"
          >
            <div className={styles.headerText} tabIndex={0}>
              <span className={styles.eyebrow}>WEEK RAIL</span>
              <h2 className={styles.title} id={headingId}>
                {headingText}
              </h2>
            </div>
          </Tooltip>
          <Button
            variant="icon"
            iconAriaLabel="Close week rail"
            className={styles.closeBtn}
            onClick={onClose}
            tooltip="Close the week rail and return to the weekly grid (Esc also works)"
            data-close-button=""
          >
            <CloseIcon />
          </Button>
        </header>

        {/* ── RightRail content slot — identical subtree to the inline mount.
              The slot is a flex column so RightRail's internal scrolling
              behaves the same as it does in the desktop pane. ───────── */}
        <div className={styles.railSlot}>
          <RightRail
            lesson={selectedLesson}
            week={week}
            day={selectedDay}
            mode={railMode}
            lessons={railMode === "week" ? weekLessons : undefined}
            onClearLesson={onClearLesson}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
