"use client";

// DailyView.tsx — the Daily view: a slim icon nav rail beside a DOCKABLE
// three-column panel system (6.11.26 design_handoff_daily_view).
//
// Layout:
//   body row → [icon rail] [dock: left slot | center slot | right slot]
//
// The three content panels — Day (the calendar-style lesson list),
// Lesson (the center detail), and Side panel (Resources / To-do / Chat)
// — live in dockable slots (components/daily/dock). Teachers drag slot
// tabs to move panels between columns, collapse the side columns to 50px
// icon rails, unpin them into hover-peek overlays, and resize with the
// splitters. The whole arrangement persists under ONE localStorage key
// (`mycurricula:daily-dock-layout-v1`); `[` / `]` toggle the side
// columns from the keyboard.
//
// The page header is a single tightened bar: the title with the
// breadcrumb (Week › Day › Subject) directly underneath, and the view
// pill + Present button pushed right. The previous separate breadcrumb
// band and the generic subtitle were removed to calm the top of the page.
//
// The Day panel has no separate top day-selector strip or pinned
// day-header strip — both fold INTO the lesson list column itself: a
// "WEEK 12" eyebrow, a clickable week strip of weekday pills (one per
// configured school-week day), a day-header block (full day name +
// "X of Y lessons" + per-subject progress bar via <TodayDashboard>),
// the daily notes banner, and the lesson list.
//
// The global filter pane is suppressed for the Daily view (the shell
// owns that), so the icon rail replaces what would otherwise sit there.
//
// Icon rail (<IconRail>): a 56px-wide vertical strip of nav-icon buttons
//   — calendar / today (active), schedule, to-dos, year/month, voice, plus
//   a settings gear pinned to the bottom. Subject-neutral chrome. Phase 1A
//   stub: the buttons are presentational only until the router lands.
//
// Lesson list (left pane): the day's lessons live inside a calendar-style
//   white card. Top to bottom: WEEK eyebrow → week strip → day header
//   (TodayDashboard, in-column) → optional notes banner → "Lessons" label
//   row with collapse-all + add-lesson stub → lesson rows → today's-events
//   stub. Each lesson row has a subject-color stripe, subject label,
//   lesson title, and completion checkbox. Clicking a row selects it. A
//   "Collapse all / Expand all" toggle compacts every row to a single
//   line. Rows can be drag-reordered (@dnd-kit) or moved with keyboard
//   Move-up / Move-down buttons. The to-dos + shoutbox panels no longer
//   live underneath the lesson list — they have moved to the right rail.
//
// Center detail: always a <LessonDetail> for the selected lesson. When
//   nothing is selected it shows a quiet neutral empty state.
//
// Right rail (<RightRail>): top to bottom — a Resources panel for the
//   selected lesson, a Today's to-dos panel, and a Day Shoutbox panel. The
//   Resources panel reuses <ResourceTile> from "@/components/lesson-flow"
//   for its grid view and offers a list view + category tabs (All / Slides
//   / Handouts / Tools). The to-dos and shoutbox panels are the same
//   components that used to live in <LeftRail>, now at home in the right
//   rail beside the detail.
//
// ── Reorder semantics (confirmed with product owner) ─────────────────────
// Reordering the left-pane rows sets a PER-TEACHER persisted display order.
// It is purely a personal viewing preference:
//   • it is NOT written to the planner store / shared doc;
//   • it never sets a `moved` flag on a lesson — the Core curriculum has
//     no daily order, only lesson CONTENT edits affect Core.
// The order persists to localStorage, keyed by week+day (SSR-guarded).
// Lessons not yet in the saved order append at the end; dayLessons are
// sorted by the saved order before rendering.
//
// ── Resizing & docking ────────────────────────────────────────────────────
// Column widths are flex-grow ratios driven by a --w custom property the
// dock splitters rewrite (drag, or arrow keys on the focused splitter;
// double-click resets). Panel placement, active tabs, collapse/pin state,
// and widths all persist together — see components/daily/dock.
//
// ── Responsive ───────────────────────────────────────────────────────────
// Wide viewports keep the three-column dock. Narrow viewports (≤720px)
// collapse to a single pane: the icon rail and dock chrome hide, the
// lesson list shows by default, selecting a lesson swaps to the
// full-width detail with a "← Back to list" affordance.
//
// selectedDay is shared planner state (useAppState). Internal selected-
// lesson state is local — never written to global selectedLessonId.
//
// Store wiring (planner-store):
//   lessons       — read from usePlanner().lessons (shared doc, undo-aware).
//   completion    — handleToggleComplete calls setLessonStatus so toggles
//                   participate in program-wide undo/redo history.
//   scroll        — useEffect keyed on lastChange calls
//                   scrollPlannerItemIntoView so the view stays near the
//                   affected lesson after edits, section moves, undo, redo.
//   UI-only state — selectedId, collapse-all, the per-teacher row order,
//                   and narrow-mode pane choice remain local; the row
//                   order alone is mirrored to localStorage.

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Lesson, LessonStatus } from "@/lib/types";
import { useAppState } from "@/lib/app-state";
import {
  TODOS,
  dateForWeekDay,
  dateNumberForWeekDay,
  notesForDay,
  shoutboxForDay,
} from "@/lib/mock";
import { useOrderedWeekdays } from "@/lib/week-order";
import { useDayHoliday, useHolidaysByDay } from "@/lib/use-day-holiday";
import { usePlanner, scrollPlannerItemIntoView } from "@/lib/planner-store";
import { useDndSensors } from "@/lib/collapse-on-drag";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LessonDetail } from "./LessonDetail";
import { TodayDashboard } from "./TodayDashboard";
import { IconRail } from "./IconRail";
import {
  RightRail,
  readRailTab,
  writeRailTab,
  type RailTabId,
} from "./RightRail";
import { AddLessonForm } from "./AddLessonForm";
import { AddEventForm } from "./AddEventForm";
import { DockLayout, useDockLayout, type DockPanelDef } from "./dock";
import { Button, EmptyState, ToggleGroup, Tooltip } from "@/components/ui";
import { DailyList } from "@/components/list/DailyList";
import { ScheduleDayPane } from "@/components/schedule";
import { DailySchedulePill } from "./daily-schedule-pill";
import { useDailyScheduleMode } from "@/lib/daily-schedule-state";
import { useLabels, pluralize } from "@/lib/labels";
import styles from "./DailyView.module.css";

// ── Reorder-teaching toast persistence (W3-C13) ──────────────────────────
// One-time teaching that the daily reorder is local-only. The key flips
// true the first time a teacher drops a reordered row, after which the
// teaching toast never reappears for that teacher. Per-teacher, NOT
// per-team — the audit explicitly says don't use consequence-toast (that
// surface is team-scoped). SSR-guarded.

const REORDER_TAUGHT_KEY = "mycurricula:user:daily-reorder-taught";

/** Read whether the teacher has been taught the personal-reorder semantic. */
function readReorderTaught(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(REORDER_TAUGHT_KEY) === "1";
  } catch {
    return false;
  }
}

/** Mark the teacher as taught — fires on first drop. */
function writeReorderTaught(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REORDER_TAUGHT_KEY, "1");
  } catch {
    // Storage full / unavailable — non-fatal; the toast will simply show
    // again on a future reorder.
  }
}

// ── Per-teacher row order persistence ────────────────────────────────────
// The saved order is a plain array of lesson ids, stored under a key that
// encodes week + day so each day keeps its own order. All access is
// guarded by `typeof window` so it is inert during SSR.

const ROW_ORDER_PREFIX = "mycurricula:daily-row-order";

/** localStorage key for one week+day's saved row order. */
function rowOrderKey(week: number, day: number): string {
  return `${ROW_ORDER_PREFIX}:w${week}:d${day}`;
}

/** Read the saved per-teacher row order for a week+day, or [] if none. */
function readRowOrder(week: number, day: number): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(rowOrderKey(week, day));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    // Corrupt or unavailable storage — fall back to no saved order.
    return [];
  }
}

/** Persist the per-teacher row order for a week+day. */
function writeRowOrder(week: number, day: number, ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(rowOrderKey(week, day), JSON.stringify(ids));
  } catch {
    // Storage full / unavailable — order simply won't persist; non-fatal.
  }
}

/**
 * Sort `lessons` by the saved per-teacher `order`. Lessons present in the
 * saved order keep that order; any lesson NOT yet in the saved order (a
 * newly added lesson) appends at the end in its original relative order.
 */
function sortByRowOrder(lessons: Lesson[], order: string[]): Lesson[] {
  if (order.length === 0) return lessons;
  const rank = new Map(order.map((id, i) => [id, i]));
  // Stable partition: known ids sorted by rank, unknown ids appended.
  const known = lessons
    .filter((l) => rank.has(l.id))
    .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  const unknown = lessons.filter((l) => !rank.has(l.id));
  return [...known, ...unknown];
}

// ── Completion checkbox — small inline svg, status-aware ─────────────────

function LessonCheckbox({ status }: { status: LessonStatus }): ReactNode {
  const size = 14;
  if (status === "done") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 14 14"
        fill="none"
        aria-label="Done"
        aria-hidden="true"
        focusable="false"
      >
        <rect width="14" height="14" rx="3.5" fill="var(--done)" />
        <path
          d="M3.5 7l2.5 2.5 4.5-4.5"
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (status === "partial") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 14 14"
        fill="none"
        aria-label="Partial"
        aria-hidden="true"
        focusable="false"
      >
        <rect
          width="14"
          height="14"
          rx="3.5"
          fill="var(--important-bg)"
          stroke="var(--important)"
          strokeWidth="1.2"
        />
        <rect
          x="3.5"
          y="6"
          width="7"
          height="2"
          rx="1"
          fill="var(--important)"
        />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      aria-label="Not done"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="0.6"
        y="0.6"
        width="12.8"
        height="12.8"
        rx="3"
        stroke="var(--ink-300)"
        strokeWidth="1.2"
      />
    </svg>
  );
}

// ── Drag-handle / reorder icons ──────────────────────────────────────────
// Lucide-style SVGs, aria-hidden, consistent rendered size — matches the
// icon idiom used by components/lesson-flow/lesson-flow.tsx.

function GripVerticalIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="9" cy="5" r="1.5" />
      <circle cx="15" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="15" cy="19" r="1.5" />
    </svg>
  );
}

function ChevronDownIcon(): ReactNode {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ── Lesson row in the left pane ──────────────────────────────────────────
// A dedicated component keeps the subject-color hook call at a stable
// position — the same pattern used by WeeklyGrid's SubjectRow.
//
// The row is a <div role="listitem"> so no interactive element is nested
// inside another interactive element. The drag handle, row-select area,
// completion checkbox, and reorder buttons are all siblings.
//
// `collapsed` renders the row as a compact single line: stripe + checkbox
// stay visible, subject + title share one line, the objective preview and
// reorder cluster are dropped.

interface LessonRowProps {
  lesson: Lesson;
  selected: boolean;
  collapsed: boolean;
  onSelect: (id: string) => void;
  onToggleComplete: (id: string, next: LessonStatus) => void;
}

function LessonRow({
  lesson,
  selected,
  collapsed,
  onSelect,
  onToggleComplete,
}: LessonRowProps): ReactNode {
  // Catalog-migrated: subject metadata now comes from the planner store's
  // catalog (frozen API), not the lib/mock SUBJECT_BY_ID map. Safe here —
  // LessonRow only renders under the (planner) /daily route (PlannerProvider).
  const { subjectById } = usePlanner();
  const subj = subjectById[lesson.subject];

  // dnd-kit sortable wiring — `id` is the lesson id (matches SortableContext).
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id });

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Completion-cycle: not_done → done → partial → not_done.
  function nextStatus(): LessonStatus {
    return lesson.status === "not_done"
      ? "done"
      : lesson.status === "done"
        ? "partial"
        : "not_done";
  }

  function handleCheckClick(e: React.MouseEvent): void {
    e.stopPropagation(); // don't also select the lesson on checkbox click
    onToggleComplete(lesson.id, nextStatus());
  }

  function handleCheckKey(e: React.KeyboardEvent): void {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      onToggleComplete(lesson.id, nextStatus());
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={sortableStyle}
      role="listitem"
      // data-planner-item enables scrollPlannerItemIntoView to locate this
      // row after a store mutation (edit, completion, undo, redo).
      data-planner-item={`lesson:${lesson.id}`}
      className={[
        styles.lessonRow,
        selected ? styles.lessonRowSelected : "",
        collapsed ? styles.lessonRowCollapsed : "",
        isDragging ? styles.lessonRowDragging : "",
        "cp-subj",
        lesson.subject,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Drag handle — dnd-kit activator; ≥44px touch target.
          W3-C13 — the tooltip teaches reorder semantics: it's a personal
          view, never a shared edit. Bound to the drag handle (NOT the whole
          row — the audit explicitly calls out a row-wide tooltip as noise).
          The tooltipId opts this bubble into the dismissibility system so
          a teacher who's learned it can suppress it. */}
      <Tooltip
        content="Reordering is your personal view — your teammates still see the team order"
        tooltipId="daily-reorder-teaching"
        side="right"
      >
        <button
          type="button"
          ref={setActivatorNodeRef}
          className={styles.lessonDragHandle}
          {...listeners}
          {...attributes}
          aria-label={`Drag to reorder ${lesson.title}`}
          title="Reordering is your personal view — teammates still see the team order"
        >
          <GripVerticalIcon />
        </button>
      </Tooltip>

      {/* 3px subject-color left stripe */}
      <span className={styles.lessonStripe} aria-hidden="true" />

      {/* Completion checkbox — interactive sibling to the select button. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={lesson.status === "done"}
        aria-label={`Mark ${lesson.title} done`}
        className={styles.lessonCheckBtn}
        onClick={handleCheckClick}
        onKeyDown={handleCheckKey}
      >
        <LessonCheckbox status={lesson.status} />
      </button>

      {/* Row select area: subject label + lesson title. In collapsed mode
          subject + title sit on one line; otherwise they stack. */}
      <button
        type="button"
        className={styles.lessonRowSelectBtn}
        onClick={() => onSelect(lesson.id)}
        aria-pressed={selected}
        aria-label={`${subj.name}: ${lesson.title}, ${lesson.status}`}
      >
        <span className={styles.lessonSubjectLabel}>{subj.name}</span>
        <span
          className={`${styles.lessonTitle} ${
            lesson.status === "done" ? styles.lessonTitleDone : ""
          }`}
        >
          {lesson.title}
        </span>
      </button>

      {/* Personal fork indicator */}
      {lesson.isPersonal && (
        <span
          className={styles.lessonForkDot}
          style={{
            background: lesson.pendingMaster
              ? "var(--important)"
              : "var(--c, var(--ink-400))",
          }}
          title={
            lesson.pendingMaster
              ? "Pending push to Team Curriculum"
              : "Personal copy"
          }
          aria-hidden="true"
        />
      )}
    </div>
  );
}

// ── Daily Notes banner ───────────────────────────────────────────────────
// Rendered above the day header; hidden if the day has no personal notes.

interface NotesBannerProps {
  day: number;
}

function NotesBanner({ day }: NotesBannerProps): ReactNode {
  // Filter to personal reminders only (spec §5.3).
  const notes = notesForDay(day).filter((n) => n.scope === "personal");
  if (notes.length === 0) return null;

  return (
    <div className={styles.notesBanner} role="region" aria-label="Daily notes">
      {notes.map((n) => {
        // role="alert"/assertive only for urgent; status/polite otherwise.
        const isUrgent = n.priority === "urgent";
        return (
          <div
            // Stable key from note fields instead of array index.
            key={`${n.day}-${n.author}-${n.priority}`}
            className={`${styles.noteItem} ${isUrgent ? "cp-pulse" : ""}`}
            data-priority={n.priority}
            role={isUrgent ? "alert" : "status"}
            aria-live={isUrgent ? "assertive" : "polite"}
          >
            <span className={styles.noteItemBody}>{n.body}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Holiday banner ───────────────────────────────────────────────────────
// Renders above the day-header / lesson list when the selected day matches a
// configured holiday. Subtle, not alarming — same diagonal-stripe wash recipe
// as UnitBar.module.css `.holiday` so /year, /weekly, and /daily all read
// the holiday as the same concept. Self-hides on non-holiday days, so the
// banner never crowds normal-instruction days.

interface HolidayBannerProps {
  /** The active week (drives the date lookup). */
  week: number;
  /** The active day index in the configured school week. */
  day: number;
}

function HolidayBanner({ week, day }: HolidayBannerProps): ReactNode {
  const holiday = useDayHoliday(week, day);
  if (!holiday) return null;

  return (
    <Tooltip
      content={`This day is marked as a holiday (${holiday.name}) — your team's curriculum says no school on this date.`}
      side="bottom"
    >
      <div
        className={styles.holidayBanner}
        role="status"
        aria-label={`Holiday: ${holiday.name} — no school today.`}
      >
        <span className={styles.holidayBannerLabel}>Holiday</span>
        <span className={styles.holidayBannerName}>{holiday.name}</span>
      </div>
    </Tooltip>
  );
}

// ── Week strip ───────────────────────────────────────────────────────────
// A horizontal row of weekday pills inside the lesson list column. Each
// pill is a real <button> that switches the active day. Layout per pill:
// the 3-letter day name on top (Sun / Mon / …) and the date number below
// (e.g. 18 / 19 / …). The active day's date number sits inside a solid
// filled circle. Beneath non-selected days, a small priority-colored dot
// surfaces personal notes (consistent with the old DayBar dot row).
//
// The week strip is the day selector for the Daily view — it replaces the
// old standalone <DayBar> that lived in the page's top chrome. Days come
// from the configured school week (useOrderedWeekdays), never a hard-coded
// 5-day assumption.

/** Priority → color token for the per-day notes-indicator dot. */
const PRIORITY_COLORS: Record<string, string> = {
  urgent: "var(--urgent)",
  important: "var(--important)",
  fyi: "var(--fyi)",
};

interface WeekStripProps {
  /** Active week — drives the date numbers via dateNumberForWeekDay. */
  week: number;
  /** Active day index (0 = first instructional day of the school week). */
  selectedDay: number;
  /** Switch to a different day. */
  onSelect: (d: number) => void;
}

function WeekStrip({ week, selectedDay, onSelect }: WeekStripProps): ReactNode {
  // Holiday lookup keyed by day index — every pill below checks for a match
  // so a holiday on any day in the visible week surfaces a small dot
  // indicator + the holiday name in the pill's tooltip. F#20 (Wave 1B
  // extension to /daily) — the visual idiom matches the WeeklyGrid day
  // header treatment.
  // Day columns derive from the configured school week (never a hard-coded
  // 5-day Sun-first fixture). See lib/week-order.ts.
  const weekdays = useOrderedWeekdays();
  const holidaysByDay = useHolidaysByDay(week, weekdays.length);
  return (
    <div
      className={styles.weekStrip}
      role="tablist"
      aria-label="Week — select a day"
    >
      {weekdays.map(
        ({ token, index: i, label: shortLabel, longLabel: dayName }) => {
          // Personal-only notes feed the priority dot (consistent with the
          // notes banner in the same column).
          const dayNotes = notesForDay(i).filter((n) => n.scope === "personal");
          const topNote = dayNotes[0];
          const holiday = holidaysByDay.get(i) ?? null;
          const isActive = i === selectedDay;
          const dateNumber = dateNumberForWeekDay(week, i);

          // Compose the pill label — keyboard-only users hear the holiday
          // context too, since the tooltip is hover/focus-visible only.
          const baseAriaLabel = `Select ${dayName} ${dateNumber} — Week ${week}`;
          const ariaLabel = holiday
            ? `${baseAriaLabel}. This day is marked as a holiday (${holiday.name}) — your team's curriculum says no school on this date.`
            : baseAriaLabel;

          const pillButton = (
            <button
              key={token}
              // Each pill gets an id so the lesson-pane body can reference it
              // via aria-labelledby — keeps the original tablist contract.
              id={`daily-tab-${i}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="daily-pane-body"
              aria-label={ariaLabel}
              className={`${styles.weekStripPill} ${
                isActive ? styles.weekStripPillActive : ""
              } ${holiday ? styles.weekStripPillHoliday : ""}`}
              onClick={() => onSelect(i)}
            >
              <span className={styles.weekStripDayName}>{shortLabel}</span>
              <span
                className={`${styles.weekStripDateWrap} ${
                  isActive ? styles.weekStripDateWrapActive : ""
                }`}
              >
                <span className={styles.weekStripDate}>{dateNumber}</span>
              </span>
              {/* Priority dot for personal notes — only on non-selected days
                (the selected day's notes appear in the notes banner just
                below this strip, so a duplicate dot would be redundant). */}
              {!isActive && topNote && (
                <span
                  className={styles.weekStripNoteDot}
                  style={{ background: PRIORITY_COLORS[topNote.priority] }}
                  aria-hidden="true"
                />
              )}
              {/* Holiday dot — a small ink dot pinned to the top-right of
                the pill. Subject-neutral (ink, not subject color and not
                warning red) so it reads as "no instruction", matching the
                UnitBar.module.css `.holiday` semantic. The note dot lives
                bottom-center; the holiday dot lives top-right so the two
                indicators never collide on the same pill. */}
              {holiday && (
                <span
                  className={styles.weekStripHolidayDot}
                  aria-hidden="true"
                  title={`Holiday: ${holiday.name}`}
                />
              )}
            </button>
          );

          // CLAUDE.md §4 tooltip primitive — only wraps the pill when the
          // day is a holiday so the un-marked days keep their existing
          // bare-button activation rhythm. Tooltip portals the bubble to
          // document.body, so the wrapping does NOT inject an extra column
          // into the grid (the pill button itself remains the direct grid
          // item that grid-auto-columns: 1fr sizes).
          return holiday ? (
            <Tooltip
              key={token}
              content={`This day is marked as a holiday (${holiday.name}) — your team's curriculum says no school on this date.`}
              side="bottom"
            >
              {pillButton}
            </Tooltip>
          ) : (
            pillButton
          );
        },
      )}
    </div>
  );
}

// ── Reorder-teaching toast (W3-C13) ──────────────────────────────────────
// A transient bottom-of-screen status surface that teaches the teacher,
// the first time they drop a reordered row in a session, that the change
// is local to their view. Modeled on the ArchiveToast visual vocabulary
// (ink-900 chip + paper text) but stripped to a one-line message — no
// Undo button, no dismiss × — because the action being explained is
// non-destructive. Auto-dismisses after REORDER_TOAST_MS and respects
// prefers-reduced-motion (no slide; opacity-only fade).
//
// Hosted by the DailyView via a `reorderToastVisible` flag that flips on
// first-drop, then the toast self-mounts; once the auto-dismiss fires it
// calls onDismiss which clears the flag.

const REORDER_TOAST_MS = 5000;

function ReorderTeachingToast({
  onDismiss,
}: {
  onDismiss: () => void;
}): ReactNode {
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect prefers-reduced-motion.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent): void =>
      setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Slide in on mount; start auto-dismiss timer. RAF defers the
  // visible=true flip one frame so the initial paint captures
  // visible=false and the transition fires.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    dismissTimerRef.current = setTimeout(() => {
      setVisible(false);
      // Match the visible→hidden transition window before unmounting.
      const exitDuration = reducedMotion ? 150 : 260;
      setTimeout(onDismiss, exitDuration);
    }, REORDER_TOAST_MS);
    return () => {
      cancelAnimationFrame(frame);
      if (dismissTimerRef.current !== null) {
        clearTimeout(dismissTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const slideTransform = reducedMotion
    ? "none"
    : visible
      ? "translateY(0)"
      : "translateY(20px)";
  const opacity = visible ? 1 : 0;
  const transition = reducedMotion
    ? "opacity 150ms ease"
    : "opacity 220ms ease, transform 240ms cubic-bezier(0.22, 1, 0.36, 1)";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: `translateX(-50%) ${slideTransform}`,
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        minHeight: 48,
        background: "var(--ink-900)",
        color: "var(--paper)",
        borderRadius: 10,
        boxShadow: "var(--shadow-popover)",
        fontSize: 13,
        fontWeight: 400,
        opacity,
        transition,
        pointerEvents: visible ? "auto" : "none",
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      Reordering is your personal view — teammates still see the team order.
    </div>
  );
}

// ── DailyView ────────────────────────────────────────────────────────────

export interface DailyViewProps {
  /** Seed the initial selection from a `/daily?lesson=<id>` deep-link.
   *  When set + the id resolves to a lesson, the view jumps to that
   *  lesson's week + day on mount and clears the query string so day
   *  navigation thereafter is normal. (W1-V5 — closes Subject→Daily
   *  cross-route trust gap.) */
  initialLessonId?: string;
  /** Seed the initial day/week from a `/daily?date=<YYYY-MM-DD>` deep-link
   *  (UX roadmap item 07). Skipped when `initialLessonId` resolves (the lesson
   *  pins its own week + day). Out-of-range / pre-anchor dates degrade to the
   *  default view; the consumed query string is cleared on mount. */
  initialDate?: string;
}

export function DailyView({
  initialLessonId,
  initialDate,
}: DailyViewProps = {}): ReactNode {
  const router = useRouter();
  // selectedDay is shared planner state — the top bar may also change it.
  // viewMode drives the list vs. grid rendering choice. setViewMode backs
  // the header's Grid | List toggle: viewMode is GLOBAL app state also set
  // from Weekly/Year, so without a local setter a teacher who picked List
  // elsewhere landed here with no way back to the grid (owner report
  // 2026-06-12).
  const {
    viewMode,
    setViewMode,
    week,
    selectedDay,
    setSelectedDay,
    setWeek,
    setSelectedLessonId,
  } =
    useAppState();

  // Renameable hierarchy captions — a school may rename "Week" → "Module",
  // "Lesson" → "Activity", etc. Read once at the top of the component so the
  // nested column renderers below use the dynamic caption everywhere.
  const labels = useLabels();

  // Configured school week — day labels (the in-column header + breadcrumb day
  // segment) follow the team's configured week rather than a hard-coded
  // Sun-first fixture. See lib/week-order.ts.
  const weekdays = useOrderedWeekdays();

  // Lessons come from the planner store so completions, edits, and undo/redo
  // are immediately reflected in the left pane list and right pane detail.
  // `hydration` gates the deep-link resolver below: under the Supabase flag the
  // doc arrives async, so the resolver must tell "still settling" from "loaded
  // and the id genuinely isn't there".
  const { lessons, setLessonStatus, lastChange, subjectById, hydration } =
    usePlanner();

  // ── Per-teacher row order (local + localStorage, NOT the shared doc) ──
  // Keyed by week+day. Initialised EMPTY rather than from localStorage: the
  // server has no localStorage, so seeding state from it in the initializer
  // would make the client's first render diverge from the server HTML and
  // trip a React hydration mismatch. The mount effect below loads the saved
  // order immediately after hydration instead.
  const [rowOrder, setRowOrder] = useState<string[]>([]);

  // Load the saved order after mount, and reload it whenever the week or day
  // changes. Running post-mount keeps the localStorage read off the hydration
  // path; access is SSR-guarded inside readRowOrder regardless.
  useEffect(() => {
    setRowOrder(readRowOrder(week, selectedDay));
  }, [week, selectedDay]);

  // The day's lessons, filtered to week + day and then sorted by the saved
  // per-teacher order. Lessons not yet in the saved order append at the end.
  const dayLessons = useMemo(() => {
    const filtered = lessons.filter(
      (l) => l.week === week && l.day === selectedDay,
    );
    return sortByRowOrder(filtered, rowOrder);
  }, [lessons, week, selectedDay, rowOrder]);

  // Daily view manages its own selected-lesson state (per task brief).
  // Default: first not-yet-done lesson for the active day; null → empty.
  // If a `?lesson=<id>` deep-link was provided AND the id resolves, seed
  // selectedId with it instead (the matching week+day are also synced post-
  // mount below so the lesson is actually visible).
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (initialLessonId) {
      const target = lessons.find((l) => l.id === initialLessonId);
      if (target) return target.id;
    }
    const first = lessons.find(
      (l) => l.week === week && l.day === selectedDay && l.status !== "done",
    );
    return first?.id ?? null;
  });

  // Deep-link resolver for a `?lesson=<id>` hand-off (the Weekly / Subject
  // "Go to lesson" buttons, the command palette, a resource row). It selects
  // THAT lesson and syncs the view to its week + day, then drops the query so a
  // later manual day change can't re-trigger it.
  //
  // Why an effect that watches `lessons`/`hydration` instead of running once on
  // mount: under the Supabase flag the document hydrates AFTER mount, so at the
  // first render `lessons` is empty and neither the initializer above nor a
  // mount-only effect can resolve the id — they silently no-op and the view
  // falls back to "first not-done of today". That is the reported bug, and it
  // is worst on a COLD direct load / refresh of `/daily?lesson=…`: on a cold
  // load the auth owner is null for the first frames, so the store settles to
  // hydration "empty" (EMPTY_DOC) for the null owner BEFORE the real owner's
  // lessons load — a transient empty-but-not-loading window. Re-running as the
  // doc actually arrives lets the resolve land the moment the lesson exists.
  // With the flag OFF the mock doc is present synchronously, so this resolves on
  // the first run.
  //
  // `seededFor` is the deep-link id this resolver last settled (resolved OR gave
  // up on). It is STATE (not a ref) so the URL-cleanup effect below re-runs once
  // the seed has committed in its OWN render: the `?lesson=` query is stripped
  // only AFTER the week/day/selection seed lands, never in the same tick (else
  // App Router can re-render the page without the query before the seed commits,
  // dropping it — a race on the cold hydration path). Keyed by id (not a bare
  // boolean) so a NEW deep link arriving while DailyView stays mounted (command
  // palette, another "Go to lesson", a resource row) is still honored; reset
  // when the query is absent so even a repeat link to the SAME lesson re-seeds.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  useEffect(() => {
    if (!initialLessonId) {
      // No (or stripped) ?lesson= — re-arm so a later deep link, even to the
      // same lesson, resolves again.
      if (seededFor !== null) setSeededFor(null);
      return;
    }
    if (seededFor === initialLessonId) return; // already settled this id
    const target = lessons.find((l) => l.id === initialLessonId);
    if (target) {
      // Set week/day unconditionally — React bails out of a same-value useState
      // set, so no `!==` guard is needed and `week`/`selectedDay` stay out of
      // the effect (keeping the deps below honest).
      setWeek(target.week);
      setSelectedDay(target.day);
      setSelectedId(target.id);
      // Clear the GLOBAL shell selection the Weekly "Go to lesson" hand-off
      // leaves set (it can't clear it itself without tripping WeeklyShell's
      // URL-write bounce — see the panel handler). We're on /daily now, so
      // clearing here is safe and stops the shell LessonDetailPanel from
      // double-rendering beside Daily's own rail. A cold/Schedule/List-mode
      // load never set it, so this is a harmless no-op there.
      setSelectedLessonId(null);
      setSeededFor(initialLessonId);
      return;
    }
    // Target not present yet. Give up ONLY once the loaded document definitively
    // lacks it: a POPULATED lessons array that doesn't contain the id (a
    // genuinely bad / foreign id), or a terminal "error". An EMPTY array is
    // treated as "still settling" even when `hydration` momentarily reads a
    // non-"loading" value — on a cold load the store passes through hydration
    // "empty" with EMPTY_DOC for the null owner before the real owner's lessons
    // arrive, and latching here would strand the deep link forever. Staying
    // armed while empty costs nothing (there is no lesson to select yet) and the
    // next lessons/hydration change retries.
    if (
      hydration === "error" ||
      (lessons.length > 0 && hydration !== "loading")
    ) {
      setSeededFor(initialLessonId);
    }
    // setWeek / setSelectedDay / setSelectedId / setSelectedLessonId are stable
    // setters and router is stable, so they are intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLessonId, lessons, hydration, seededFor]);

  // Strip the consumed `?lesson=` only AFTER the seed for this id has committed
  // (a separate render from the seed above), so the week/day/selection lands
  // before App Router re-renders the page without the query.
  useEffect(() => {
    if (!initialLessonId || seededFor !== initialLessonId) return;
    router.replace("/daily", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLessonId, seededFor]);

  // `/daily?date=<YYYY-MM-DD>` deep link (UX roadmap item 07) — the sibling of
  // the lesson seed above, skipped whenever that seed resolves (a lesson pins
  // its own week + day). The date→(week, day) math inverts
  // lib/mock/calendar.ts dateForWeekDay: anchor = Week 1 day 0, calendar weeks
  // advance by 7 days regardless of the configured school week. Out-of-range /
  // pre-anchor dates degrade to the default view.
  useEffect(() => {
    if (!initialDate) return;
    if (initialLessonId && lessons.some((l) => l.id === initialLessonId)) {
      // The lesson seed above owns the navigation AND the URL cleanup.
      return;
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(initialDate);
    if (m) {
      // Local-midnight Date — the codebase deliberately avoids UTC date math
      // (see lib/use-academic-year.ts) so the calendar day stays stable.
      const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      const anchor = dateForWeekDay(1, 0);
      // Math.round absorbs DST hour drift between two local midnights.
      const diffDays = Math.round(
        (target.getTime() - anchor.getTime()) / 86_400_000,
      );
      const targetWeek = Math.floor(diffDays / 7) + 1;
      // Same 1–99 bound the weekly link parser enforces; out-of-range or
      // pre-anchor dates degrade to the default view.
      if (diffDays >= 0 && targetWeek <= 99) {
        const dayIndex = Math.min(
          diffDays % 7,
          Math.max(weekdays.length - 1, 0),
        );
        if (targetWeek !== week) setWeek(targetWeek);
        if (dayIndex !== selectedDay) setSelectedDay(dayIndex);
      }
    }
    // Strip the consumed params on every path — valid, malformed, and
    // out-of-range alike — so a bad date never leaves a dead query string.
    router.replace("/daily", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDate]);

  // Collapse-all toggle — default expanded. UI-only, never persisted.
  const [collapsedAll, setCollapsedAll] = useState(false);

  // Add-lesson / add-event form open state (DAILY-ADD-LESSON-001 / DAILY-ADD-EVENT-001).
  // The forms are position:fixed popovers rendered at the bottom of the page tree
  // so they are not clipped by any parent overflow. Mutually exclusive — opening
  // one closes the other so only one form is ever open at a time.
  const [addLessonOpen, setAddLessonOpen] = useState(false);
  const [addEventOpen, setAddEventOpen] = useState(false);

  // Narrow-mode pane choice — CSS decides whether this matters (it is inert
  // on wide viewports). "list" shows the lesson list; "detail" the right
  // pane. Selecting a lesson swaps to "detail"; "← Back" returns to "list".
  const [narrowPane, setNarrowPane] = useState<"list" | "detail">("list");

  // dnd-kit sensors — pointer + touch + keyboard (keyboard makes the drag
  // reorder operable without a mouse). These feed the row-reorder
  // DndContext inside the lesson list. Panel docking (moving whole panels
  // between columns) is owned by the dock system below, which uses native
  // HTML5 drag on the slot tabs — the two drag surfaces never overlap.
  const sensors = useDndSensors();
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // ── Dock panel layout (6.11.26 redesign) ──────────────────────────────
  // The three content panels — Day (lesson list), Lesson (detail), Side
  // panel (Resources / To-do / Chat) — live in dockable slots. Layout
  // state (panel placement, active tabs, collapse/pin, column widths)
  // persists under one localStorage key; `[` / `]` toggle the side
  // columns. See components/daily/dock.
  //
  // The `[` / `]` shortcuts only arm while the dock columns are actually
  // visible: grid mode AND a viewport above the 720px single-pane fold
  // (Dock.module.css). Otherwise they'd silently toggle invisible dock
  // state and starve the global week-navigation shortcuts that share the
  // same keys. SSR-safe: assume wide until the post-mount measure.
  const [narrowViewport, setNarrowViewport] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const update = (): void => setNarrowViewport(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const dock = useDockLayout({
    keyboardEnabled: viewMode !== "list" && !narrowViewport,
  });

  // Controlled side-panel tab — the dock's collapsed icon rail deep-opens
  // a specific inner tab (Resources / To-do / Chat). RightRail remains the
  // storage-key owner; this state seeds from the persisted value post-
  // mount (SSR-safe) and writes back when a rail icon changes it.
  const [railTab, setRailTab] = useState<RailTabId>("resources");
  useEffect(() => {
    setRailTab(readRailTab());
  }, []);
  const selectRailTab = useCallback((tab: RailTabId): void => {
    setRailTab(tab);
    writeRailTab(tab);
  }, []);

  // Rail badges — mock-driven in Phase 1A. The to-do count seeds from the
  // same "due today" scope TodayTodos renders, then live-updates through
  // the panel's onOpenCountChange report so a check-off ticks the
  // collapsed-rail badge down (handoff §2 — "To-do completion drives the
  // rail badge count"). The chat dot shows whenever the day's shoutbox
  // has any messages (real unread tracking is Phase 1B).
  const [openTodoCount, setOpenTodoCount] = useState(
    () => TODOS.filter((t) => t.due === "today" && !t.done).length,
  );
  const chatHasActivity = useMemo(
    () => shoutboxForDay(week, selectedDay).length > 0,
    [week, selectedDay],
  );

  // ── Reorder-teaching toast (W3-C13) ───────────────────────────────────
  // One-time teaching toast that fires the first time the teacher drops a
  // reordered row. Gated on a per-teacher localStorage flag so the lesson
  // is taught exactly once across sessions. The ref tracks the post-mount
  // "have we read storage yet?" state — initialised false so the SSR
  // render and the first client render agree (same hydration discipline
  // as the row-order / pane-width / column-order persistence above).
  const [reorderToastVisible, setReorderToastVisible] = useState(false);
  const reorderTaughtRef = useRef<boolean>(false);

  // Post-mount read of the persisted "already taught" flag. Empty deps —
  // the flag is per-teacher, not per week/day, so we only read it once.
  useEffect(() => {
    reorderTaughtRef.current = readReorderTaught();
  }, []);

  // When the day changes, default-select the first not-done lesson (or null)
  // and return narrow mode to the list.
  function handleDayChange(d: number): void {
    setSelectedDay(d);
    const first = lessons.find(
      (l) => l.week === week && l.day === d && l.status !== "done",
    );
    setSelectedId(first?.id ?? null);
    setNarrowPane("list");
  }

  // Selecting a lesson also swaps the narrow-mode view to the detail pane.
  const handleSelectLesson = useCallback((id: string): void => {
    setSelectedId(id);
    setNarrowPane("detail");
  }, []);

  // Route completion toggles through the store so they enter undo/redo
  // history and broadcast to sibling views reading the same doc.
  const handleToggleComplete = useCallback(
    (lessonId: string, nextStatus: LessonStatus): void => {
      setLessonStatus(lessonId, nextStatus);
    },
    [setLessonStatus],
  );

  // ── Reorder helpers ───────────────────────────────────────────────────
  // Reordering writes the new id sequence to local state + localStorage
  // ONLY. It never dispatches a store action and never sets a `moved` flag —
  // daily display order is a per-teacher preference, not Core curriculum.
  const commitOrder = useCallback(
    (orderedIds: string[]): void => {
      setRowOrder(orderedIds);
      writeRowOrder(week, selectedDay, orderedIds);
    },
    [week, selectedDay],
  );

  // dnd-kit drop — move the active lesson to the over lesson's slot.
  // These three handlers belong to the ROW reorder DndContext (the one
  // inside the lesson list). The column reorder DndContext below has its
  // own handlers; the two state machines are independent.
  function handleRowDragStart({ active }: DragStartEvent): void {
    setDraggingId(String(active.id));
  }

  function handleRowDragEnd({ active, over }: DragEndEvent): void {
    setDraggingId(null);
    if (!over || active.id === over.id) return;
    const ids = dayLessons.map((l) => l.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    commitOrder(arrayMove(ids, from, to));

    // W3-C13 — first successful drop in this teacher's history fires the
    // one-time teaching toast. Mark the localStorage flag immediately so a
    // second drag (or a page reload mid-toast) never re-triggers it.
    if (!reorderTaughtRef.current) {
      reorderTaughtRef.current = true;
      writeReorderTaught();
      setReorderToastVisible(true);
    }
  }

  function handleRowDragCancel(): void {
    setDraggingId(null);
  }

  // ── Scroll preservation ──────────────────────────────────────────────
  // After any store mutation (edit, completion, undo, redo) scroll the
  // affected lesson card into view. `lastChange` identity changes on every
  // dispatch — using it as the dep ensures exactly one scroll per mutation.
  useEffect(() => {
    const id = lastChange?.lessonIds[0];
    if (id) {
      scrollPlannerItemIntoView(id);
    }
  }, [lastChange]);

  // The selected lesson, resolved from current store state so completion
  // toggles and remote edits are immediately visible in the right pane.
  const selectedLesson = selectedId
    ? (lessons.find((l) => l.id === selectedId) ?? null)
    : null;

  // The lesson riding the DragOverlay (a floating ghost of the row).
  const draggingLesson = draggingId
    ? (dayLessons.find((l) => l.id === draggingId) ?? null)
    : null;
  const lessonIds = dayLessons.map((l) => l.id);

  // ── Dock panel content ────────────────────────────────────────────────
  // Each dock panel's BODY is captured in a small render fn. The dock
  // system (components/daily/dock) owns all the column chrome — slot tab
  // strips, drag-to-dock, collapse/pin icon rails, splitters — so these
  // functions return only the panel content. LessonDetail and RightRail
  // are reused as-is.

  function renderDayPanel(): ReactNode {
    return (
      <div className={styles.leftPane} data-column="list">
        {/* ── Daily Schedule pill ──────────────────────────────
              Placed at the top of the lesson-list column header area
              (above the WEEK eyebrow) so it reads as primary chrome for
              this column. Toggling the pill mounts <ScheduleDayPane
              variant="rail" /> at the far right of the bodyRow — see the
              rail mount below. The pill is rendered once globally just
              after the breadcrumb so it is visible in BOTH grid and list
              modes; placing it here inside the lesson-list column would
              hide it in list mode. */}

        {/* ── WEEK eyebrow ───────────────────────────────────── */}
        <div className={styles.leftPaneEyebrow}>
          {labels.week} {week}
        </div>

        {/* ── Week strip: one pill per configured school-week day ─ */}
        <WeekStrip
          week={week}
          selectedDay={selectedDay}
          onSelect={handleDayChange}
        />

        {/* ── Holiday banner ──────────────────────────────────────────
              Self-hides on non-holiday days. F#20 (Wave 1B extension to
              /daily) — the visual idiom matches the UnitBar.module.css
              `.holiday` recipe so /year, /weekly, /daily all read as the
              same concept. Sits above the day header so a teacher sees
              the no-school context before reading the daily lineup. */}
        <HolidayBanner week={week} day={selectedDay} />

        {/* ── In-column day header (full day name + progress) ── */}
        <TodayDashboard
          dayLessons={dayLessons}
          dayLabel={weekdays[selectedDay]?.longLabel ?? "Day"}
        />

        {/* ── Daily notes banner (when this day has personal notes) ─ */}
        <NotesBanner day={selectedDay} />

        {/* ── "Lessons" label row + collapse-all + add-lesson stub ─ */}
        <div className={styles.lessonsLabelRow}>
          <span className={styles.lessonsLabel}>
            {pluralize(labels.lesson)}
          </span>
          <div className={styles.lessonsLabelActions}>
            {/* Collapse all / Expand all — keyboard-accessible button. */}
            <Button
              variant="ghost"
              size="sm"
              className={styles.collapseAllBtn}
              onClick={() => setCollapsedAll((c) => !c)}
              aria-pressed={collapsedAll}
              aria-label={
                collapsedAll
                  ? "Expand all lesson rows"
                  : "Collapse all lesson rows"
              }
              leadingIcon={
                <span
                  className={`${styles.collapseAllIcon} ${
                    collapsedAll ? styles.collapseAllIconCollapsed : ""
                  }`}
                  aria-hidden="true"
                >
                  <ChevronDownIcon />
                </span>
              }
            >
              {collapsedAll ? "Expand all" : "Collapse all"}
            </Button>
            {/* Filled blue "+" add-lesson button (DAILY-ADD-LESSON-001). */}
            <Button
              variant="icon"
              iconAriaLabel="Add a lesson"
              className={styles.addLessonBtn}
              aria-pressed={addLessonOpen}
              onClick={() => {
                setAddEventOpen(false);
                setAddLessonOpen((v) => !v);
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M6 1.5v9M1.5 6h9"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </Button>
          </div>
        </div>

        {/* Scrollable lesson list — drag-reorderable via dnd-kit. */}
        <div
          className={styles.leftScroll}
          role="list"
          aria-label="Today's lessons"
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleRowDragStart}
            onDragEnd={handleRowDragEnd}
            onDragCancel={handleRowDragCancel}
          >
            <SortableContext
              items={lessonIds}
              strategy={verticalListSortingStrategy}
            >
              {dayLessons.map((lesson) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  selected={selectedId === lesson.id}
                  collapsed={collapsedAll}
                  onSelect={handleSelectLesson}
                  onToggleComplete={handleToggleComplete}
                />
              ))}
            </SortableContext>

            {/* Floating ghost of the dragged row. */}
            <DragOverlay>
              {draggingLesson && (
                <div
                  className={`${styles.lessonRow} ${styles.lessonRowOverlay} cp-subj ${draggingLesson.subject}`}
                  aria-hidden="true"
                >
                  <span className={styles.lessonDragHandle}>
                    <GripVerticalIcon />
                  </span>
                  <span className={styles.lessonStripe} />
                  <span className={styles.lessonCheckBtn}>
                    <LessonCheckbox status={draggingLesson.status} />
                  </span>
                  <span className={styles.lessonRowSelectBtn}>
                    <span className={styles.lessonSubjectLabel}>
                      {subjectById[draggingLesson.subject].name}
                    </span>
                    <span className={styles.lessonTitle}>
                      {draggingLesson.title}
                    </span>
                  </span>
                </div>
              )}
            </DragOverlay>
          </DndContext>

          {dayLessons.length === 0 && (
            <div className={styles.emptyList}>
              {/* W3-C11 — canonical EmptyState replaces the prior flat
                    "No lessons planned for X." copy. Size=sm because this
                    region sits inside an already-narrow scroll column. */}
              <EmptyState
                size="sm"
                heading="No lessons for this day yet"
                body="Add a lesson with the + button above, or check a different day on the week strip."
              />
            </div>
          )}

          {/* Today's Events section — stub add affordance (Phase 1A). */}
          <div className={styles.eventsSection}>
            <div className={styles.eventsSectionHead}>
              <span className={styles.eventsSectionLabel}>
                Today&apos;s Events
              </span>
            </div>
            {/* Add-event button (DAILY-ADD-EVENT-001). */}
            <Button
              variant="ghost"
              size="sm"
              className={styles.addEventBtn}
              aria-label="Add an event"
              aria-pressed={addEventOpen}
              onClick={() => {
                setAddLessonOpen(false);
                setAddEventOpen((v) => !v);
              }}
              leadingIcon={
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 11 11"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M5.5 1v9M1 5.5h9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              }
            >
              Add an event
            </Button>
          </div>
        </div>
      </div>
    );
  }

  function renderLessonPanel(): ReactNode {
    return (
      <div className={styles.rightPane} data-column="detail">
        {/* Narrow-mode "← Back to list" affordance. */}
        <Button
          variant="ghost"
          size="sm"
          className={styles.backToList}
          onClick={() => setNarrowPane("list")}
        >
          <span aria-hidden="true">←</span> Back to list
        </Button>

        {selectedLesson ? (
          <LessonDetail
            lesson={selectedLesson}
            onToggleComplete={handleToggleComplete}
          />
        ) : (
          <div className={styles.emptyDetail}>
            {/* W3-C11 — canonical EmptyState (md) replaces the bare
                  "Select a lesson to view its plan." copy. The wrapper
                  div keeps the existing flex-1 sizing rule from the
                  module CSS so this column always fills its track. */}
            <EmptyState
              heading="Pick a lesson on the left"
              body="Select any lesson row to see its sections, resources, and per-section notes."
            />
          </div>
        )}
      </div>
    );
  }

  // ── Dock panel definitions ────────────────────────────────────────────
  // The side panel exposes its inner tabs (Resources / To-do / Chat) as
  // railItems so the dock's collapsed icon rail renders one icon per tab
  // with badges: open-to-do count + chat activity dot (design handoff §2).
  const dockPanels: DockPanelDef[] = [
    { id: "day", title: "Day", content: renderDayPanel() },
    { id: "lesson", title: "Lesson", content: renderLessonPanel() },
    {
      id: "side",
      title: "Side panel",
      content: (
        <RightRail
          lesson={selectedLesson}
          week={week}
          day={selectedDay}
          activeTab={railTab}
          onActiveTabChange={setRailTab}
          onOpenTodoCountChange={setOpenTodoCount}
        />
      ),
      railItems: [
        {
          key: "resources",
          title: "Resources",
          active: railTab === "resources",
          onActivate: () => selectRailTab("resources"),
        },
        {
          key: "todos",
          title: "To-do",
          badgeCount: openTodoCount,
          active: railTab === "todos",
          onActivate: () => selectRailTab("todos"),
        },
        {
          key: "chat",
          title: "Chat",
          badgeDot: chatHasActivity,
          active: railTab === "chat",
          onActivate: () => selectRailTab("chat"),
        },
      ],
    },
  ];

  // ── Breadcrumb (BIG-7) ─────────────────────────────────────────────────
  // Week N / <Day> / <Subject> — each segment is a clickable link.
  // Day label is derived from the configured school week (useOrderedWeekdays)
  // so it respects the school's custom week, never a hard-coded weekday set.
  // Subject is drawn from the selected lesson; falls back to null so the
  // segment is omitted rather than showing a stale value when no lesson is
  // selected (e.g. the day is empty).
  const breadcrumbSubject = selectedLesson
    ? subjectById[selectedLesson.subject]
    : null;

  // ── Daily schedule-pill state ──────────────────────────────────────────
  // The pill lives inline inside the Daily chrome (rendered by
  // <DailySchedulePill /> just after the breadcrumb so it is visible in
  // both grid and list modes). When ON, a <ScheduleDayPane variant="rail" />
  // mounts as an ADDITIONAL right rail alongside the existing Resources /
  // Todos rail — the 4-track layout is otherwise unchanged so toggling
  // back restores everything immediately.
  // The hook exposes a derived `scheduleMode` boolean so the render branch
  // below doesn't need to compare strings.
  const { scheduleMode: showScheduleRail } = useDailyScheduleMode();

  return (
    <div className={styles.page}>
      {/* ── Page header (6.11.26 redesign — single tightened bar) ─────────
          Visible page-level h1 with the breadcrumb DIRECTLY beneath it,
          plus the view pills + Present in headerActions. The previous
          separate breadcrumb band, generic subtitle, and <PageHeader>
          primitive were removed to calm the top of the page (handoff
          "Page header" §). Renders on BOTH grid and list modes so the
          page has exactly one h1 in the a11y tree at all times.
          DailyList's inner day title is demoted to an h2 (see
          DailyList.tsx) to keep the single-h1-per-page invariant. */}
      {/* The Subject ↔ Schedule toggle now lives in the page-header actions
          slot (W5) instead of a standalone in-page "VIEW" bar, mirroring the
          Weekly view's title-row toggle. The onboarding tip banner was
          removed.

          The Present button sits beside the toggle in the same actions slot.
          It launches the full-screen Teaching View (/teach) for the current
          day — `?present=1` tells TeachShell to start in fullscreen-immersive
          mode. The dismissible onboarding tooltip teaches the first-time
          teacher what the button is FOR (CLAUDE.md §4); it's an explanatory
          tip, not a high-consequence one, so it carries a tooltipId (the
          W2-B3 dismissibility system) rather than `required`. The Button keeps
          a matching native title= for the touch long-press fallback, and the
          wrapping <Tooltip> mirrors the search-trigger idiom in the top bar
          (the Button primitive's own `tooltip` prop has no tooltipId yet). */}
      <div className={styles.dailyPageHeader}>
        <div className={styles.pageHeadText}>
          <h1 className={styles.pageTitle}>Daily View</h1>
          {/* Breadcrumb directly under the title — Week N › Day › Subject.
              Each segment is a real link; the subject segment is omitted
              (not stale) when no lesson is selected. Day labels derive
              from the configured school week (useOrderedWeekdays). */}
          <nav className={styles.headerCrumb} aria-label="Breadcrumb">
            <Link href="/weekly" className={styles.breadcrumbLink}>
              {labels.week} {week}
            </Link>
            <span className={styles.breadcrumbSep} aria-hidden="true">
              ›
            </span>
            <Link href="/daily" className={styles.breadcrumbLink}>
              {weekdays[selectedDay]?.longLabel ?? "Day"}
            </Link>
            {breadcrumbSubject && (
              <>
                <span className={styles.breadcrumbSep} aria-hidden="true">
                  ›
                </span>
                <Link
                  href={`/subject/${breadcrumbSubject.id}`}
                  className={styles.breadcrumbLink}
                >
                  {breadcrumbSubject.name}
                </Link>
              </>
            )}
          </nav>
        </div>
        <div className={styles.headerActions}>
          {/* Grid | List — the layout toggle. Lives in the header (rendered
              in BOTH modes) so List mode always offers the way back to the
              three-panel grid. Mirrors the Weekly title-row control; the
              shared viewMode means the choice follows the teacher across
              views, and now every view that READS it can also SET it. */}
          <ToggleGroup<"grid" | "list">
            ariaLabel="Daily layout"
            variant="prominent"
            size="sm"
            value={viewMode}
            onChange={setViewMode}
            options={[
              {
                value: "grid",
                label: "Grid",
                title:
                  "Three-panel day view — lesson list, lesson detail, and side panel",
                tooltipId: "daily-view-grid",
              },
              {
                value: "list",
                label: "List",
                title: "One scrollable list of the day's lessons",
                tooltipId: "daily-view-list",
              },
            ]}
          />
          <DailySchedulePill />
          <Tooltip
            content="Open this day's boards full-screen for live class delivery"
            side="bottom"
            tooltipId="daily-present"
          >
            <Button
              variant="primary"
              onClick={() => router.push("/teach?present=1")}
              title="Open this day's boards full-screen for live class delivery"
            >
              Present
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* ── Body row: icon rail + content body + optional schedule rail ────
          In Grid mode: three-track reorderable columns (list, detail, rail).
          In List mode: DailyList fills the list+detail area; the right rail
          stays visible at its fixed width beside it. The icon rail is always
          pinned to the far left as a sibling of the body — it is NOT part
          of either the grid or list layout.

          When the Daily Schedule pill is ON (showScheduleRail === true), a
          <ScheduleDayPane scope="rail" /> mounts at the far right of the
          bodyRow as an ADDITIONAL track beside the existing right rail.
          This is additive — neither the lesson list, the detail, nor the
          existing right rail change; the schedule pane sits alongside.
          The CSS .scheduleRail rule reserves a fixed 320px track and folds
          it away at ≤1280px so the lesson canvas keeps usable width on
          tablet / phone. */}
      <div className={styles.bodyRow}>
        {/* ── Far-left: slim icon nav rail (sibling of the body) ─── */}
        <IconRail />
        {viewMode === "list" ? (
          /* ── List mode body ──────────────────────────────────────────────
              DailyList occupies the list+detail area (flex:1). The right
              rail stays mounted beside it at its fixed width. This keeps
              Resources / To-do / Chat visible in both modes, per the user
              decision documented in the task brief. */
          <div className={styles.listModeBody}>
            <DailyList
              onOpenAddLesson={() => {
                setAddEventOpen(false);
                setAddLessonOpen(true);
              }}
            />
            <RightRail lesson={selectedLesson} week={week} day={selectedDay} />
          </div>
        ) : (
          /* ── Grid mode body: the dockable panel system ──────────────────
              Three slots (left / center / right) host the Day, Lesson, and
              Side panels. Teachers drag slot tabs to move panels between
              columns, collapse side columns to 50px icon rails, unpin them
              into hover-peek overlays, and resize with the splitters —
              all persisted. `data-narrow-pane` drives the ≤720px single-
              pane layout (CSS in Dock.module.css). */
          <DockLayout
            panels={dockPanels}
            api={dock}
            bodyId="daily-pane-body"
            ariaLabelledBy={`daily-tab-${selectedDay}`}
            narrowPane={narrowPane}
          />
        )}
        {/* ── Schedule rail (Schedule pill ON) ─────────────────────────────
            Mounted as an additional track on the right end of the bodyRow.
            The existing 4-track layout (icon rail + list + detail + right
            rail) stays intact above; this is purely additive. CSS hides it
            at ≤1280px so the existing rail-collapse threshold matches.

            ScheduleDayPane's `variant` prop switches between the "rail"
            compact chrome and the "page" wider chrome used at /schedule.
            selectedDay is already a non-nullable number on AppState, so no
            `?? 0` fallback is needed. */}
        {showScheduleRail && (
          <aside className={styles.scheduleRail} aria-label="Schedule rail">
            <ScheduleDayPane day={selectedDay} variant="rail" />
          </aside>
        )}
      </div>

      {/* ── Add-lesson / add-event forms ──────────────────────────────────
          Rendered at the root of the page tree so they sit outside every
          overflow:hidden ancestor and appear above all other chrome.
          Both are position:fixed — they position themselves correctly
          regardless of DOM depth. */}
      <AddLessonForm
        open={addLessonOpen}
        onClose={() => setAddLessonOpen(false)}
        week={week}
        day={selectedDay}
      />
      <AddEventForm
        open={addEventOpen}
        onClose={() => setAddEventOpen(false)}
        day={selectedDay}
      />

      {/* ── W3-C13: one-time reorder teaching toast ─────────────────────────
          Mounted only when the teacher has just made their first-ever drop
          (handleRowDragEnd flips the flag). The component self-dismisses
          after REORDER_TOAST_MS and calls onDismiss, which clears the flag
          and unmounts the toast. Position:fixed so it sits outside every
          overflow:hidden ancestor and floats above all other chrome. */}
      {reorderToastVisible && (
        <ReorderTeachingToast onDismiss={() => setReorderToastVisible(false)} />
      )}
    </div>
  );
}
