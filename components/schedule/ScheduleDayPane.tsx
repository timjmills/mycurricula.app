"use client";

// ScheduleDayPane.tsx — the vertical Schedule Pane for one day.
//
// This is the primary embeddable surface. The Weekly shell mounts it as a
// rail; the Daily view mounts it in a primary slot; the /schedule route
// wraps it in <ScheduleView /> for the full-page chrome.
//
// Anatomy (top → bottom):
//   • Title strip       — "Schedule Pane" eyebrow + small icon-menu stub.
//   • Tabs row          — Bell Schedule | Daily Schedule | Events.
//   • Date strip        — "Sunday, May 18" + "WEEK 12" + date-picker icon stub.
//   • Row list          — vertical hairline-separated rows (or EmptyState).
//   • Add-block CTA     — full-width ghost-outline "+ Add time block".
//
// Tab content rules (also in the team-lead spec):
//   • Bell Schedule — `getDayBlocks(day)`; row uses the block's own subject
//     label or non-academic label. Active-now row gets the catchup tint.
//   • Daily Schedule — same blocks, but each academic block looks up its
//     linked lesson; the row title becomes the lesson's `title` (the row
//     fades to "No lesson scheduled" italic when an academic block has no
//     linked lesson).
//   • Events — placeholder empty state until a DayEvent fixture lands.
//
// Now resolution:
//   The pane calls useNowTick() and computes `nowMin` once per render. Each
//   ScheduleRow receives `isNow = (day === todayDayIndex()) && minute is in
//   [block.startMin, block.endMin]`. The hook itself is enabled only for the
//   today-day; off-today panes don't burn an interval.

import { useState, type ReactNode } from "react";
import type { Lesson } from "@/lib/types";
import {
  type TimelineBlock,
  getDayBlocks,
  isMinuteWithinDay,
  nowMinuteMock,
  todayDayIndex,
} from "@/lib/schedule-data";
import { WEEK_DAYS } from "@/lib/mock";
import { dateForWeekDay } from "@/lib/mock/calendar";
import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import { useNowTick } from "@/lib/use-now-tick";
import { EmptyState } from "@/components/ui";
import { ScheduleRow } from "./ScheduleRow";
import { ScheduleTabs, type ScheduleTab } from "./ScheduleTabs";
import styles from "./ScheduleDayPane.module.css";

const MONTH_LABELS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export interface ScheduleDayPaneProps {
  /** Day index into the school week (0 = Sun … 4 = Thu). */
  day: number;
  /**
   * "rail" → compact chrome for the Daily side-mount (≈320px fixed width,
   *           tighter padding).
   * "page" → wider chrome for the /schedule route (max-width ≈720px,
   *           looser padding, same composition).
   * The composition is identical between variants; only spacing + width
   * differ via the corresponding CSS class.
   */
  variant?: "rail" | "page";
}

export function ScheduleDayPane({
  day,
  variant = "rail",
}: ScheduleDayPaneProps): ReactNode {
  const { week } = useAppState();
  const { getLesson } = usePlanner();

  const [tab, setTab] = useState<ScheduleTab>("bell");

  const isToday = day === todayDayIndex();
  // Now-tick is only enabled for today's pane — every other day's pane has
  // no live state and shouldn't run an interval.
  // TODO: production swaps `nowMinuteMock()` for `minuteOfDay(now)`.
  useNowTick({ enabled: isToday });
  const nowMin = nowMinuteMock();
  const nowVisible = isToday && isMinuteWithinDay(nowMin);

  const blocks = getDayBlocks(day);

  // Resolve the date strip's "Sunday, May 18" string from the mock calendar.
  // Production: derive from the school calendar (term start, holidays).
  const date = dateForWeekDay(week, day);
  const dayName = WEEK_DAYS[day] ?? "Day";
  const dateLabel = `${dayName}, ${MONTH_LABELS_LONG[date.getMonth()]} ${date.getDate()}`;

  return (
    <section
      className={[
        styles.pane,
        variant === "page" ? styles.variantPage : styles.variantRail,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`Schedule pane for ${dateLabel}`}
      title={`Schedule pane for ${dateLabel} — see what classes meet today, switch between the bell schedule, your lesson plan, and any events`}
    >
      {/* ── Title strip ───────────────────────────────────────────────── */}
      <div className={styles.titleStrip}>
        <span className={styles.eyebrow}>Schedule Pane</span>
        <button
          type="button"
          className={styles.iconMenu}
          aria-label="Schedule pane options"
          disabled
          aria-disabled="true"
          title="Pane options menu — rename, hide, or rearrange this pane (coming in a later phase)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="3" cy="8" r="1.4" fill="currentColor" />
            <circle cx="8" cy="8" r="1.4" fill="currentColor" />
            <circle cx="13" cy="8" r="1.4" fill="currentColor" />
          </svg>
        </button>
      </div>

      {/* ── Tabs row ──────────────────────────────────────────────────── */}
      <div className={styles.tabsRow}>
        <ScheduleTabs value={tab} onChange={setTab} />
      </div>

      {/* ── Date strip ────────────────────────────────────────────────── */}
      <div className={styles.dateStrip}>
        <div className={styles.dateText}>
          <span className={styles.dateLabel}>{dateLabel}</span>
          <span className={styles.weekLabel}>WEEK {week}</span>
        </div>
        <button
          type="button"
          className={styles.iconMenu}
          aria-label="Pick a different day"
          disabled
          aria-disabled="true"
          title="Jump this pane to a different day of the school week (coming in a later phase)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <rect
              x="2"
              y="3"
              width="12"
              height="11"
              rx="1.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <line
              x1="2"
              y1="6.5"
              x2="14"
              y2="6.5"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <line
              x1="5"
              y1="2"
              x2="5"
              y2="4.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <line
              x1="11"
              y1="2"
              x2="11"
              y2="4.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* ── Body — rows or empty state, per active tab ─────────────────── */}
      <div className={styles.body}>
        {tab === "events" ? (
          /* TODO: production reads DayEvent records filtered by `date`. */
          <EmptyState
            size="sm"
            heading="No events scheduled"
            body="Day events (assemblies, drills, guest speakers) will appear here."
          />
        ) : blocks.length === 0 ? (
          <EmptyState
            size="sm"
            heading="No blocks scheduled"
            body="Add a time block to start shaping the day."
          />
        ) : (
          <div className={styles.list}>
            {blocks.map((block) => (
              <ScheduleRow
                key={block.id}
                block={block}
                lesson={
                  tab === "daily" ? resolveLesson(block, getLesson) : null
                }
                isNow={nowVisible && isMinuteInBlock(nowMin, block)}
                fadeWhenNoLesson={tab === "daily"}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Add-block CTA (stub) ──────────────────────────────────────── */}
      <div className={styles.addRow}>
        <button
          type="button"
          className={styles.addButton}
          // TODO: when the Schedule settings UI lands, this opens the
          // AddTimeBlock form. For now it's a visual placeholder so the
          // pane reads as the same shape it will have post-wire.
          disabled
          aria-disabled="true"
          title="Add a new time block to this day's schedule — a class period, prep, lunch, or non-academic block (coming in a later phase)"
        >
          <span aria-hidden="true">+</span> Add time block
        </button>
      </div>
    </section>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isMinuteInBlock(min: number, block: TimelineBlock): boolean {
  return min >= block.startMin && min < block.endMin;
}

/** Resolve the Lesson for a TimelineBlock (or null for non-academic / unlinked). */
function resolveLesson(
  block: TimelineBlock,
  getLesson: (id: string) => Lesson | undefined,
): Lesson | null {
  if (block.type !== "academic" || !block.lesson) return null;
  return getLesson(block.lesson) ?? null;
}
