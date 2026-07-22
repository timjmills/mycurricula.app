"use client";

// ChromeClock — the bottom-right live clock + today's-classes chip of the
// v2 corner grammar (W3.3).
//
// Faithful port of the 7.2.26 bundled mockup's Clock component
// (mockup/New v2 Site Design.bundled.html, `function Clock(...)` ~line
// 11604): big time + "Monday · Jan 5" on the first row, a hairline rule,
// then up to two Now / Up next class rows (subject dot · title · time),
// with a "Done for today" line once the last class ends and a "No classes
// scheduled" empty state. The CSS vocabulary is app/chrome.css's `.clock`
// block (the W3.3a inert port) — this file consumes it and writes NO CSS.
//
// ── Deliberately SKIPPED this wave (bundle has them; followups) ──────────
//   • The `.clock-hov` hover card (lesson objective/standards preview) —
//     TODO(W3.3-followup): port ClockHover once the lesson-open plumbing
//     (W3.8 modal host) exists for its "Click for plan · post · teach"
//     affordance to be honest.
//   • Clickable rows — the bundle's rows are `.per-btn` buttons whose
//     onClick opens the lesson context menu. No lesson-open host exists in
//     the chrome yet, so rows render as the 6.24 non-interactive `.per`
//     divs. TODO(W3.3-followup): upgrade to `.per per-btn` buttons + an
//     onPick prop when the W3.8 LessonModal host lands. (Note `.per-btn`,
//     `.clock-done`, and `.clock-empty` are also not yet in chrome.css —
//     part of the same additive 7.2 delta flagged in ChromeContext.tsx;
//     the done/empty lines render unstyled-but-legible until it lands.)
//   • Cross-day rows — after the last class the bundle keeps listing
//     TOMORROW's first lessons under "Next". Resolving "the next school
//     day's schedule" is a rotation-aware derivation (Phase 1B); this pass
//     shows the `.clock-done` line alone. Honest, not fake.
//
// ── Data seams (real wiring, never hard-coded — CLAUDE.md §1) ────────────
//   • Today = todayColumnIndex(new Date(), useSchoolWeek().days) — the
//     shared "which configured school day is today?" rule from
//     lib/now-anchor (same derivation as NowLine / the Weekly today
//     column). NEVER a hard-coded weekday set.
//   • Periods = getDayBlocks(todayIdx) — the Phase 1A configured-timetable
//     fixture (lib/schedule-data). Rotation cycles plug in behind the same
//     call in Phase 1B (see lib/now-anchor's PeriodsForDay note); the
//     `periodsForDay` prop is that seam.
//   • Lesson titles = the LIVE planner store (usePlanner) — the block's
//     linked lesson id when the timetable names one, else today's lesson
//     for the block's subject in the current week (useAppState().week, the
//     same value the top-bar "Week N" reads). Store edits (rename, move,
//     archive) update the chip live because `lessons` re-renders us.
//   • Subject dot color = useSubjectColor(subjectId).c — the palette
//     bridge's accent, applied as an inline value exactly like the lesson
//     cards do. Never an invented color (CLAUDE.md §4 subject map).
//
// ── Tick model + SSR safety ──────────────────────────────────────────────
// Same discipline as components/shell/Clock.tsx (the v1 top-bar clock):
// `now` starts null, so the server HTML and the first client paint render
// a stable placeholder (no rows, "—" time) and can never hydration-
// mismatch across timezones. A post-mount effect seeds the real Date and
// ticks every 30s (minute resolution is plenty; 1s ticking is battery-
// hostile render churn). The interval is cleared on unmount.

import { useEffect, useState, type ReactNode } from "react";
import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import { useSchoolWeek } from "@/lib/use-school-week";
import { useSubjectColor } from "@/lib/palette";
import { todayColumnIndex } from "@/lib/now-anchor";
import {
  getDayBlocks,
  minuteOfDay,
  formatBlockTime,
  type TimelineBlock,
} from "@/lib/schedule-data";
import { SUBJECT_BY_ID } from "@/lib/mock/subjects";
import type { Lesson, SubjectId } from "@/lib/types";
import { Tooltip } from "@/components/ui";

/** Tick cadence in ms — 30s, matching components/shell/Clock.tsx. */
const TICK_INTERVAL_MS = 30_000;

/** SSR-safe placeholders (identical server/first-paint DOM). */
const PLACEHOLDER_TIME = "—";

/** How many class rows the chip shows. The bundle default (`t.classCount`,
 *  clamped 1–4, default 2). A per-teacher setting can widen this later. */
const ROW_COUNT = 2;

/** An academic block that definitely carries a subject — what the row
 *  renderer consumes. (Non-academic blocks — recess, lunch, dismissal —
 *  are ambient time, not classes, and never render here.) */
type ClassBlock = TimelineBlock & { subject: SubjectId };

function isClassBlock(b: TimelineBlock): b is ClassBlock {
  return b.type === "academic" && b.subject !== undefined;
}

/** Big-time format — "9:42 AM" (12h, matching the app's time chips). */
function formatClockTime(now: Date): string {
  return now.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Day/date format — "Monday · Jan 5" (bundle: weekday long · short md). */
function formatClockDate(now: Date): string {
  const weekday = now.toLocaleString("en-US", { weekday: "long" });
  const monthDay = now.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `${weekday} · ${monthDay}`;
}

/** Bottom-right clock chip: live time · today's date · the next classes.
 *  Mount inside the chrome host's `.botbar`. */
export function ChromeClock(): ReactNode {
  const { week } = useAppState();
  const { lessons, getLesson } = usePlanner();
  const { days: schoolWeekDays } = useSchoolWeek();

  // ── The live clock — null until mounted (SSR safety, header note) ──────
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = (): void => setNow(new Date());
    update();
    const id = window.setInterval(update, TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  // ── Today's classes ─────────────────────────────────────────────────────
  // todayIdx: 0-based index into the CONFIGURED school week, or null on a
  // non-school day (the empty state). The timetable fixture is indexed the
  // same way (0 = first configured day), so the two compose directly —
  // the same pairing NowLine/ScheduleDayPane already use.
  const todayIdx = now === null ? null : todayColumnIndex(now, schoolWeekDays);
  const classes: readonly ClassBlock[] =
    todayIdx === null ? [] : getDayBlocks(todayIdx).filter(isClassBlock);

  // Remaining = the class we're in plus everything still ahead. Half-open
  // period edges (endMin exclusive) match lib/now-anchor's boundary rule.
  const minute = now === null ? 0 : minuteOfDay(now);
  const remaining = classes.filter((b) => b.endMin > minute);
  const rows = remaining.slice(0, ROW_COUNT);

  // Resolve each row's lesson title from the LIVE planner store: the
  // timetable's linked lesson id wins; otherwise today's lesson for the
  // block's subject in the current week; otherwise the subject name alone
  // (an unplanned period is still a real class).
  const lessonFor = (block: ClassBlock): Lesson | undefined => {
    if (block.lesson) {
      const linked = getLesson(block.lesson);
      if (linked && !linked.archived) return linked;
    }
    return lessons.find(
      (l) =>
        !l.archived &&
        l.week === week &&
        l.day === todayIdx &&
        l.subject === block.subject,
    );
  };

  const clockTip =
    "Your day at a glance — the current time and your upcoming classes";

  return (
    <div className="clock glass">
      {/* Time row. role="status" + aria-live="off": focusable-on-demand for
          screen readers without announcing every 30s tick (same rationale
          as the v1 shell Clock). */}
      <Tooltip content={clockTip} side="top" tooltipId="chrome-clock">
        <div className="now-time" role="status" aria-live="off">
          <span className="tt">
            {now === null ? PLACEHOLDER_TIME : formatClockTime(now)}
          </span>
          {now !== null && <span className="dd">{formatClockDate(now)}</span>}
        </div>
      </Tooltip>

      <div className="hr" aria-hidden="true" />

      {/* Class list — one of three states, all wired to REAL data
          availability (never a fake row):
            • rows        → the current + upcoming classes.
            • clock-done  → a school day whose classes have all ended.
            • clock-empty → a non-school day, a day with no academic
                            blocks, or the pre-mount SSR frame. */}
      {rows.length > 0 ? (
        rows.map((block, i) => (
          <ClockRow
            key={block.id}
            block={block}
            lesson={lessonFor(block)}
            first={i === 0}
            minute={minute}
          />
        ))
      ) : classes.length > 0 ? (
        // TODO(W3.3-followup): after the last class the bundle also lists
        // tomorrow's first lessons under "Next" — needs a rotation-aware
        // "next school day" resolver (Phase 1B seam; header note).
        <div className="clock-done">Done for today · up next tomorrow</div>
      ) : (
        <div className="clock-empty">No classes scheduled</div>
      )}
    </div>
  );
}

// ── One class row ─────────────────────────────────────────────────────────
// Subcomponent (not an inline map body) so useSubjectColor — a hook — can
// resolve each row's dot color from the palette context.

interface ClockRowProps {
  block: ClassBlock;
  /** The planner lesson backing this period, when one exists. */
  lesson: Lesson | undefined;
  /** First visible row — gets "Up next" instead of "Next" (bundle rule). */
  first: boolean;
  /** Current minute-of-day, for the Now / next split + time format. */
  minute: number;
}

function ClockRow({ block, lesson, first, minute }: ClockRowProps): ReactNode {
  // Palette-bridge accent for the subject dot — same source of truth as
  // the lesson cards' stripe (never an invented color).
  const color = useSubjectColor(block.subject);

  const isNow = minute >= block.startMin && minute < block.endMin;
  // Bundle label rule: the in-progress class is "Now"; the first upcoming
  // row is "Up next"; later rows are "Next".
  const label = isNow ? "Now" : first ? "Up next" : "Next";
  // In-progress shows the full span; upcoming shows the start time only.
  const time = isNow
    ? `${formatBlockTime(block.startMin)}–${formatBlockTime(block.endMin)}`
    : formatBlockTime(block.startMin);
  const title = lesson?.title ?? SUBJECT_BY_ID[block.subject].name;

  // Non-interactive `.per` row this wave — see the header's SKIPPED list
  // for the `.per-btn` + hover-card + onPick followup.
  return (
    <div className="per">
      <span
        className="pdot"
        style={{ background: color.c }}
        aria-hidden="true"
      />
      <span className="pmeta">
        <span className="plabel">{label}</span>
        <span className="psub">
          <span className="pname">{title}</span>
          <span className="ptime">{time}</span>
        </span>
      </span>
    </div>
  );
}
