"use client";

// SchedulePanel.tsx — the right-side drawer wrapping the existing Schedule
// route content for surfaces that want the schedule available without a
// page navigation.
//
// ── Why a drawer ──────────────────────────────────────────────────────────
// The /schedule route is the dedicated full-page surface for the schedule.
// But teachers often want to see "what's next today" WHILE they're working
// in Daily / Weekly / Year / Subject. The drawer is the same content rendered
// as a right-side slide-out so any planner surface can pop the schedule open
// inline without losing context.
//
// Lane BB owns the drawer chrome. Lane BD wires the trigger from the
// Daily IconRail (and, in a later wave, from the global rail). The
// trigger surface only needs to:
//
//   const [open, setOpen] = useState(false);
//   <SchedulePanel open={open} onClose={() => setOpen(false)} />
//
// ── Composition ───────────────────────────────────────────────────────────
// The drawer reuses, never duplicates:
//   • <ScheduleDayPane variant="rail" /> — the existing vertical Schedule
//     Pane, rendered in its compact rail variant so it fits the 400px
//     drawer column.
//   • The Sun…Thu day-strip chip selector from /schedule's page, ported
//     into local JSX so the chips drive the same app-state `selectedDay`.
//     The chip CSS is scoped to this module to keep the drawer self-contained
//     (touching the page module to share styles would couple two surfaces).
//
// The day-strip chip vocabulary mirrors the route's so a teacher who flips
// between them never feels they're in a different surface.
//
// ── Modal pattern ─────────────────────────────────────────────────────────
//   • role="dialog" + aria-modal="true" + aria-labelledby on the heading.
//   • Esc closes (handled at the dialog level so the drawer doesn't have
//     to chase blur on every child).
//   • Click on the scrim closes; clicks inside the panel are stopped.
//   • Focus moves to the close button on open; focus is restored to the
//     trigger on close.
//   • Tab / Shift-Tab cycle inside the panel (focus trap).
//   • prefers-reduced-motion drops the slide-in transition.
//
// The pattern is intentionally the same idiom as ResourceComposer so the
// app reads as one consistent dialog family.

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useAppState } from "@/lib/app-state";
import { useSchoolWeek, WEEKDAY_INDEX } from "@/lib/use-school-week";
import { WEEK_DAYS, WEEK_DAYS_SHORT } from "@/lib/mock";
import { dateNumberForWeekDay } from "@/lib/mock/calendar";
import { todayDayIndex } from "@/lib/schedule-data";
import { Button, Tooltip } from "@/components/ui";
import { ScheduleDayPane } from "./ScheduleDayPane";
import styles from "./SchedulePanel.module.css";

// ── Focusable selector (mirrors ResourceComposer / SaveTargetDialog) ────────
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// School-week days are derived from useSchoolWeek() inside the component
// (CLAUDE.md §1). The /schedule route uses the same hook so the strip and
// the drawer stay in lockstep.

// ── Close (×) icon ──────────────────────────────────────────────────────────
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

// ── Props ───────────────────────────────────────────────────────────────────

export interface SchedulePanelProps {
  /** Render the drawer only when true. Driven by the consuming surface
   *  (e.g. Daily's IconRail Schedule button). */
  open: boolean;
  /** Fired when the drawer is dismissed — Escape, scrim click, or × button. */
  onClose: () => void;
}

// ── SchedulePanel ───────────────────────────────────────────────────────────

export function SchedulePanel({
  open,
  onClose,
}: SchedulePanelProps): ReactNode {
  const { week, selectedDay, setSelectedDay } = useAppState();
  const focusedDay = selectedDay;
  const { days: configuredDays } = useSchoolWeek();
  const schoolWeekDays = configuredDays.map((d) => WEEKDAY_INDEX[d]);

  const headingId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Track the element that held focus before we opened so we can restore.
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // ── On open: move focus into the drawer; lock body scroll ─────────────────
  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    // Move focus to the close button on the next frame so the panel is
    // mounted and visible to the browser's focus algorithm. The close
    // button is the safest landing — it's always the first reachable
    // control and a teacher who hit Esc-then-realized-they-meant-to-stay
    // can simply Tab onward. The Button primitive doesn't forward refs,
    // so we look up the first focusable button inside the panel by
    // `data-close-button` and focus it directly.
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

  // ── On close: restore focus to the trigger ────────────────────────────────
  useEffect(() => {
    if (open) return;
    const prev = previousFocusRef.current;
    if (prev && typeof prev.focus === "function") {
      const timer = setTimeout(() => prev.focus(), 0);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // ── Keyboard: Escape close + focus trap ───────────────────────────────────
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
  // not a child element that happened to bubble up. ──────────────────────────
  const handleScrimClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  // ── Accessible heading text ───────────────────────────────────────────────
  const dayLabel = useMemo(() => WEEK_DAYS[focusedDay] ?? "Day", [focusedDay]);
  const headingText = `Schedule — ${dayLabel}, Week ${week}`;

  if (!open) return null;
  if (typeof document === "undefined") return null;

  // Portal so the drawer escapes any overflow:hidden / transform parent in
  // the consuming surface's layout (the Daily view has both at various
  // depths). Mirrors how Tooltip + ResourceComposer escape their hosts.
  return createPortal(
    <div
      className={styles.scrim}
      onClick={handleScrimClick}
      onKeyDown={handleKeyDown}
      // The scrim itself doesn't take focus; the panel inside does.
      aria-hidden="false"
    >
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        title="Schedule drawer — see this day's timetable and switch days without leaving your current view"
        // Stop propagation so a click inside the panel doesn't bubble to
        // the scrim's onClick (which would close the drawer).
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header — close button on the right ────────────────────── */}
        <header className={styles.header}>
          <Tooltip
            content="Schedule drawer — see this day's timetable and switch days without leaving your current view. Click any day chip below to jump."
            side="bottom"
          >
            <div className={styles.headerText} tabIndex={0}>
              <span className={styles.eyebrow}>SCHEDULE</span>
              <h2 className={styles.title} id={headingId}>
                {headingText}
              </h2>
            </div>
          </Tooltip>
          <Button
            variant="icon"
            iconAriaLabel="Close schedule panel"
            className={styles.closeBtn}
            onClick={onClose}
            tooltip="Close the schedule drawer and return to your current view (Esc also works)"
            data-close-button=""
          >
            <CloseIcon />
          </Button>
        </header>

        {/* ── Day-strip selector ───────────────────────────────────── */}
        <nav className={styles.dayStrip} aria-label="Choose a day to view">
          {schoolWeekDays.map((d) => {
            const isActive = d === focusedDay;
            const isToday = d === todayDayIndex();
            const chipDayLabel = WEEK_DAYS_SHORT[d] ?? "Day";
            const dateNum = dateNumberForWeekDay(week, d);
            return (
              <Tooltip
                key={d}
                content={`Show the schedule for ${chipDayLabel} (date ${dateNum})${isToday ? " — today" : ""}`}
                side="bottom"
              >
                <button
                  type="button"
                  className={[
                    styles.dayChip,
                    isActive ? styles.dayChipActive : "",
                    isToday ? styles.dayChipToday : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSelectedDay(d)}
                  aria-pressed={isActive}
                  aria-label={`${chipDayLabel} ${dateNum}${isToday ? " (today)" : ""}`}
                  title={`Show the schedule for ${chipDayLabel} (date ${dateNum})${
                    isToday ? " — today" : ""
                  }`}
                >
                  <span className={styles.chipDay}>{chipDayLabel}</span>
                  <span className={styles.chipDate}>{dateNum}</span>
                </button>
              </Tooltip>
            );
          })}
        </nav>

        {/* ── Pane slot — the existing vertical Schedule Pane ───────── */}
        <div className={styles.paneSlot}>
          <ScheduleDayPane day={focusedDay} variant="rail" />
        </div>
      </div>
    </div>,
    document.body,
  );
}
