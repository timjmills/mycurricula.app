"use client";

// DailyView.tsx — the Daily view: a FOUR-track body row with a slim icon
// nav rail, a calendar-style lesson list column, the center lesson detail,
// and an auxiliary right rail.
//
// Layout (Image 13 redesign):
//   body row → [icon rail] [lesson list] [splitter] [lesson detail] [right rail]
//
// The Daily view no longer has a separate top day-selector strip or a
// pinned day-header strip. Both fold INTO the lesson list column itself:
// the column now reads as a calendar-style panel with a "WEEK 12"
// eyebrow, a clickable week strip of weekday pills (one per configured
// school-week day), a Sunday-style day-header block (full day name +
// "X of Y lessons" + per-subject progress bar), the daily notes (when
// the day has any personal notes), and the lesson list itself. The
// week strip replaces the old <DayBar>; the day-header block reuses the
// <TodayDashboard> component, now repurposed for in-column rendering.
//
// The four-track layout reflects the 3-column restructure (Image 12 in
// the design handoff). LOGICALLY there are three content panels — lesson
// list, center detail, right rail — preceded by a thin app-level nav
// rail. The global filter pane is suppressed for the Daily view (the
// shell agent owns that), so the icon rail replaces what would otherwise
// sit there.
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
// ── Resizable list↔detail boundary ────────────────────────────────────────
// The boundary between the left lesson list and the center detail is a
// draggable splitter. The chosen list-pane width is clamped to a sensible
// min/max and persisted to localStorage (SSR-guarded, loaded post-mount —
// same pattern as the per-teacher row order below). The splitter is also
// keyboard-operable (arrow keys nudge the width) and exposes a proper
// separator role + aria-value* attributes. The right rail width is fixed
// for this pass; only the list↔detail balance is teacher-tunable.
//
// ── Responsive ───────────────────────────────────────────────────────────
// Wide viewports keep the four-track layout. Narrow viewports collapse to
// a single column: the icon rail hides, the lesson list shows by default,
// selecting a lesson swaps to the full-width detail with a "← Back to
// list" affordance, and the right rail stacks beneath. The persisted
// list-pane width is ignored in the narrow layout.
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

import {
  Fragment,
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  useId,
} from "react";
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
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Lesson, LessonStatus } from "@/lib/types";
import { useAppState } from "@/lib/app-state";
import {
  SUBJECT_BY_ID,
  WEEK_DAYS,
  WEEK_DAYS_SHORT,
  dateNumberForWeekDay,
  notesForDay,
} from "@/lib/mock";
import { usePlanner, scrollPlannerItemIntoView } from "@/lib/planner-store";
import { useDndSensors } from "@/lib/collapse-on-drag";
import Link from "next/link";
import { LessonDetail } from "./LessonDetail";
import { TodayDashboard } from "./TodayDashboard";
import { IconRail } from "./IconRail";
import { RightRail } from "./RightRail";
import { PaneSplitter } from "./PaneSplitter";
import { AddLessonForm } from "./AddLessonForm";
import { AddEventForm } from "./AddEventForm";
import { Button, PageHeader, Tooltip } from "@/components/ui";
import { DailyList } from "@/components/list/DailyList";
import { ScheduleDayPane } from "@/components/schedule";
import { DailySchedulePill } from "./daily-schedule-pill";
import { useDailyScheduleMode } from "@/lib/daily-schedule-state";
import styles from "./DailyView.module.css";

// ── Pane width persistence — NO fixed clamps; sanity-bounded by container ─
// The splitter writes each pane's px width to localStorage so the teacher's
// chosen list / center / right balance survives a reload. All access is
// `typeof window`-guarded and loaded post-mount, never in a useState
// initializer — the server has no localStorage, so seeding from it in the
// initializer would diverge from the server HTML and trip a hydration
// mismatch (identical reasoning to the row-order persistence below).
//
// ── Why no fixed clamps ─────────────────────────────────────────────────
// The owner explicitly wants each pane "as big or small as someone wants",
// so this view does NOT hard-code an upper bound like the old 560 / 520 px
// caps. Instead the bounds are computed LIVE from the container at the
// moment of every commit (drag move, keyboard step, window resize):
//
//   left  min  = PANE_FLOOR                                  // never zero
//   left  max  = bodyWidth − PANE_FLOOR − otherPaneWidth     // see below
//   right min  = PANE_FLOOR
//   right max  = bodyWidth − PANE_FLOOR − leftPaneWidth
//
// PANE_FLOOR (40 px) is small enough that a pane can shrink to a thin strip
// but never collapse to zero, and it doubles as the reservation for EACH
// other neighbour — by subtracting `PANE_FLOOR + otherPaneWidth` from
// bodyWidth we guarantee the OTHER side pane keeps at least PANE_FLOOR and
// the center detail keeps at least PANE_FLOOR too. (Two neighbours × 40 px =
// 80 px is always preserved beyond the pane being resized.) The clamp helpers
// read bodyRef.current.getBoundingClientRect() so the bound follows window
// resizes naturally — see the resize-observer effect further down which
// re-clamps both stored widths whenever the container shrinks.

const PANE_WIDTH_KEY = "mycurricula:daily-left-width";

/** Absolute minimum pane width, in px. Below this a pane is unreadable and
 *  its inner content starts to overlap its own padding. Acts as both the
 *  hard lower clamp AND the reservation kept for the OTHER side pane and
 *  for the center detail. */
const PANE_FLOOR = 40;

/** Default left-pane width — only used on first paint before localStorage
 *  is read and before bodyRef has resolved a live container width. */
const PANE_DEFAULT = 300;

/** Keyboard nudge step (px) for the splitter's arrow-key resize. */
const PANE_STEP = 16;

/** Clamp a candidate pane width to dynamic, sanity-only bounds.
 *
 *  - `bodyWidth` is the live container width (from getBoundingClientRect).
 *  - `otherWidth` is the OTHER side pane's current width — we reserve at
 *    least PANE_FLOOR for it and another PANE_FLOOR for the center detail.
 *
 *  If `bodyWidth` is not available (initial paint, ref not yet attached) we
 *  fall back to a permissive lower-bound clamp so persisted values are
 *  honoured. */
function clampPaneWidth(
  px: number,
  bodyWidth: number,
  otherWidth: number,
): number {
  const rounded = Math.round(px);
  if (!Number.isFinite(bodyWidth) || bodyWidth <= 0) {
    return Math.max(PANE_FLOOR, rounded);
  }
  // Reserve PANE_FLOOR for the other side pane AND PANE_FLOOR for the
  // center detail — by accepting `otherWidth` (which is already ≥
  // PANE_FLOOR) we automatically include the side-pane share.
  const max = Math.max(PANE_FLOOR, bodyWidth - otherWidth - PANE_FLOOR);
  return Math.min(max, Math.max(PANE_FLOOR, rounded));
}

/** Compute the live (min, max) bounds for a pane given the container width
 *  and the OTHER side pane's current width. Used for aria-valuemin /
 *  aria-valuemax on the splitter and for the resize-observer re-clamp.
 *  `bodyWidth` may be 0 before the container has measured — in that case
 *  we return permissive bounds anchored to PANE_FLOOR. */
function paneBounds(
  bodyWidth: number,
  otherWidth: number,
): { min: number; max: number } {
  if (!Number.isFinite(bodyWidth) || bodyWidth <= 0) {
    return { min: PANE_FLOOR, max: Number.MAX_SAFE_INTEGER };
  }
  const max = Math.max(PANE_FLOOR, bodyWidth - otherWidth - PANE_FLOOR);
  return { min: PANE_FLOOR, max };
}

/** Read the saved left-pane width, or the default if none / unavailable.
 *  Only the absolute floor is enforced here — the live upper bound depends
 *  on container width, which isn't available at read time. The commit path
 *  re-clamps against the live container before each write. */
function readPaneWidth(): number {
  if (typeof window === "undefined") return PANE_DEFAULT;
  try {
    const raw = window.localStorage.getItem(PANE_WIDTH_KEY);
    if (!raw) return PANE_DEFAULT;
    const parsed = Number(raw);
    return Number.isFinite(parsed)
      ? Math.max(PANE_FLOOR, Math.round(parsed))
      : PANE_DEFAULT;
  } catch {
    // Corrupt or unavailable storage — fall back to the default width.
    return PANE_DEFAULT;
  }
}

/** Persist the chosen left-pane width. */
function writePaneWidth(px: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PANE_WIDTH_KEY, String(px));
  } catch {
    // Storage full / unavailable — width simply won't persist; non-fatal.
  }
}

// ── Resizable RIGHT-rail width (mirror of the left-pane persistence) ────
// Same "no fixed clamps; sanity-bounded by the live container" model as the
// left pane: default state → post-mount load from localStorage → drag /
// keyboard commit + persist. A separate key keeps the two widths
// independent so a teacher can size them however they like. The same
// clampPaneWidth / paneBounds helpers above govern this pane too — only
// the localStorage key + default differ.

const RIGHT_PANE_WIDTH_KEY = "mycurricula:daily-right-width";

/** Default right-rail width — only used on first paint. The live upper
 *  bound is computed from the body width minus the left pane (and minus
 *  PANE_FLOOR for the center) at commit time. */
const RIGHT_PANE_DEFAULT = 320;

/** Read the saved right-rail width, or the default. SSR-guarded. */
function readRightPaneWidth(): number {
  if (typeof window === "undefined") return RIGHT_PANE_DEFAULT;
  try {
    const raw = window.localStorage.getItem(RIGHT_PANE_WIDTH_KEY);
    if (!raw) return RIGHT_PANE_DEFAULT;
    const parsed = Number(raw);
    return Number.isFinite(parsed)
      ? Math.max(PANE_FLOOR, Math.round(parsed))
      : RIGHT_PANE_DEFAULT;
  } catch {
    return RIGHT_PANE_DEFAULT;
  }
}

/** Persist the chosen right-rail width. */
function writeRightPaneWidth(px: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RIGHT_PANE_WIDTH_KEY, String(px));
  } catch {
    // Storage full / unavailable — width simply won't persist; non-fatal.
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

// Lucide-style GripHorizontal — two rows of three dots, oriented for the
// column-reorder grip (a HORIZONTAL grip on each column's top edge reads as
// "drag me sideways"). Distinct from the row-reorder GripVertical above
// (two columns of three dots) so the two activator shapes are visually
// unambiguous in the same view.
function GripHorizontalIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="5" cy="9" r="1.5" />
      <circle cx="12" cy="9" r="1.5" />
      <circle cx="19" cy="9" r="1.5" />
      <circle cx="5" cy="15" r="1.5" />
      <circle cx="12" cy="15" r="1.5" />
      <circle cx="19" cy="15" r="1.5" />
    </svg>
  );
}

// ── Column reorder: stable ids + persistence ────────────────────────────
// The Daily body has THREE big content columns — the lesson list, the
// center detail, and the right rail — that the teacher can reorder by
// dragging a small grip on each column's top edge. The icon rail is NOT
// part of this group: it stays pinned to the far left as a sibling of
// the reorderable body.
//
// Order is a per-teacher viewing preference: it persists to localStorage
// (post-mount load, NEVER inside the useState initializer — the server
// has no localStorage, so seeding from it would diverge from server HTML
// and trip a React hydration mismatch). Same pattern as the pane-width
// + row-order persistence further up.

const COLUMN_IDS = ["list", "detail", "rail"] as const;
type ColumnId = (typeof COLUMN_IDS)[number];

const DEFAULT_COLUMN_ORDER: ColumnId[] = [...COLUMN_IDS];
const COLUMN_ORDER_KEY = "mycurricula:daily-column-order";

/** Human-readable column labels — used in the drag-grip aria-labels, the
 *  DragOverlay ghost chip, and the aria-live announcement string. */
const COLUMN_LABEL: Record<ColumnId, string> = {
  list: "Lesson list",
  detail: "Lesson detail",
  rail: "Resources rail",
};

/** Type-guard a parsed string against the closed ColumnId set. */
function isColumnId(value: unknown): value is ColumnId {
  return (
    typeof value === "string" &&
    (COLUMN_IDS as readonly string[]).includes(value)
  );
}

/** Normalize a parsed order: drop unknown ids, de-duplicate, then append
 *  any missing default ids so a future column addition never disappears. */
function normalizeColumnOrder(raw: unknown): ColumnId[] {
  const candidate = Array.isArray(raw) ? raw.filter(isColumnId) : [];
  const seen = new Set<ColumnId>();
  const out: ColumnId[] = [];
  for (const id of candidate) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of DEFAULT_COLUMN_ORDER) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Read the saved column order from localStorage, or the default. */
function readColumnOrder(): ColumnId[] {
  if (typeof window === "undefined") return DEFAULT_COLUMN_ORDER;
  try {
    const raw = window.localStorage.getItem(COLUMN_ORDER_KEY);
    if (!raw) return DEFAULT_COLUMN_ORDER;
    return normalizeColumnOrder(JSON.parse(raw) as unknown);
  } catch {
    // Corrupt or unavailable storage — fall back to the default.
    return DEFAULT_COLUMN_ORDER;
  }
}

/** Persist the chosen column order. Non-fatal on failure. */
function writeColumnOrder(order: ColumnId[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(order));
  } catch {
    // Storage full / unavailable — order simply won't persist; non-fatal.
  }
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
  const subj = SUBJECT_BY_ID[lesson.subject];

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
      {/* Drag handle — dnd-kit activator; ≥44px touch target. */}
      <Tooltip
        content="Drag this lesson up or down to reorder today's lineup — order is personal to your planner."
        side="right"
      >
        <button
          type="button"
          ref={setActivatorNodeRef}
          className={styles.lessonDragHandle}
          {...listeners}
          {...attributes}
          aria-label={`Drag to reorder ${lesson.title}`}
          title="Drag to reorder this lesson within today's lineup"
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
            lesson.pendingMaster ? "Pending push to Master" : "Personal copy"
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
// from the configured school week (WEEK_DAYS / WEEK_DAYS_SHORT), never a
// hard-coded 5-day assumption.

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
  return (
    <div
      className={styles.weekStrip}
      role="tablist"
      aria-label="Week — select a day"
    >
      {WEEK_DAYS.map((dayName, i) => {
        // Personal-only notes feed the priority dot (consistent with the
        // notes banner in the same column).
        const dayNotes = notesForDay(i).filter((n) => n.scope === "personal");
        const topNote = dayNotes[0];
        const isActive = i === selectedDay;
        const dateNumber = dateNumberForWeekDay(week, i);
        const shortLabel = WEEK_DAYS_SHORT[i];
        return (
          <button
            key={dayName}
            // Each pill gets an id so the lesson-pane body can reference it
            // via aria-labelledby — keeps the original tablist contract.
            id={`daily-tab-${i}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls="daily-pane-body"
            aria-label={`Select ${dayName} ${dateNumber} — Week ${week}`}
            className={`${styles.weekStripPill} ${
              isActive ? styles.weekStripPillActive : ""
            }`}
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
          </button>
        );
      })}
    </div>
  );
}

// ── Column-reorder grip ──────────────────────────────────────────────────
// A small GripHorizontal chip that lives in the top-left of each big
// content column and acts as the dnd-kit activator for column reordering.
// Visually it's subject-neutral: an ink-300 dot pattern that lifts to
// ink-500 on hover / focus. The visible chip is 24×24, but the wrapping
// button enlarges the tap target to ≥44px via padding — the same idiom
// the lesson-row grip uses (DRAG_CHIP.handleTouchTarget). The grip never
// competes with column content because it sits absolutely in the corner
// over neutral chrome (the white card top + the rail track top).
//
// `aria-label` carries the human-readable column name so a screen-reader
// hears "Drag to reorder lesson list column" — keyboard users hit Space
// to lift, arrows to move, Space to drop, Esc to cancel (dnd-kit's
// KeyboardSensor, shared via useDndSensors).

interface ColumnDragGripProps {
  /** Stable column id — must match SortableContext items. */
  id: ColumnId;
  /** setActivatorNodeRef from useSortable — the grip is the SOLE activator. */
  activatorRef: (el: HTMLElement | null) => void;
  /** dnd-kit pointer + keyboard activation listeners. */
  listeners: Record<string, unknown> | undefined;
  /** dnd-kit a11y attributes (role, aria-roledescription, etc.). */
  attributes: Record<string, unknown>;
}

function ColumnDragGrip({
  id,
  activatorRef,
  listeners,
  attributes,
}: ColumnDragGripProps): ReactNode {
  return (
    <Tooltip
      content={`Drag this ${COLUMN_LABEL[id].toLowerCase()} column to rearrange the daily layout — your layout choice is remembered between sessions.`}
      side="bottom"
    >
      <button
        type="button"
        ref={activatorRef}
        // Spread dnd-kit's pointer + keyboard listeners + a11y attributes.
        // The listeners object is typed loosely here because dnd-kit's
        // SyntheticListenerMap is a record of arbitrary event-handler keys.
        {...(listeners ?? {})}
        {...attributes}
        className={styles.columnDragGrip}
        aria-label={`Drag to reorder ${COLUMN_LABEL[id].toLowerCase()} column`}
        title={`Drag to reorder the ${COLUMN_LABEL[id].toLowerCase()} column`}
      >
        <span className={styles.columnDragGripIcon} aria-hidden="true">
          <GripHorizontalIcon />
        </span>
      </button>
    </Tooltip>
  );
}

// ── Sortable column wrapper ─────────────────────────────────────────────
// Each big content column (lesson list, center detail, right rail) wraps
// its content in this component. The wrapper:
//   • holds the useSortable transform (so the column slides into its new
//     slot when the order changes);
//   • exposes the grip activator props so the column's content can render
//     a ColumnDragGrip in its own top-left corner;
//   • carries the per-column className from the caller so the wrapper
//     itself remains stylistically transparent.
//
// IMPORTANT: the wrapper is also the SortableContext item. It must occupy
// the same grid track its column would occupy in the static layout — its
// inline style adds `gridColumn: span 1` (the default) and nothing else
// so the parent grid keeps its track math.

interface SortableColumnProps {
  id: ColumnId;
  className: string;
  children: (grip: ReactNode) => ReactNode;
}

function SortableColumn({
  id,
  className,
  children,
}: SortableColumnProps): ReactNode {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  // Apply the sortable transform to the OUTER wrapper so the whole column
  // slides into its new position. While dragging, dim the in-place
  // placeholder — the floating overlay carries the visible chip.
  const wrapperStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  const grip = (
    <ColumnDragGrip
      id={id}
      activatorRef={setActivatorNodeRef}
      listeners={listeners as unknown as Record<string, unknown>}
      attributes={attributes as unknown as Record<string, unknown>}
    />
  );

  return (
    <div ref={setNodeRef} style={wrapperStyle} className={className}>
      {children(grip)}
    </div>
  );
}

// ── Column drag ghost ───────────────────────────────────────────────────
// While a column rides the DragOverlay we show a small header-style chip
// with the column's label. Reuses the visual vocabulary of the right-
// rail panel ghost (paper card + hairline + lift) without importing its
// CSS — the matching styles live in DailyView.module.css alongside the
// grip.

function ColumnDragGhost({ id }: { id: ColumnId }): ReactNode {
  return (
    <div className={styles.columnDragGhost} aria-hidden="true">
      <span className={styles.columnDragGhostGrip}>
        <GripHorizontalIcon />
      </span>
      <span className={styles.columnDragGhostTitle}>{COLUMN_LABEL[id]}</span>
    </div>
  );
}

// ── DailyView ────────────────────────────────────────────────────────────

export function DailyView(): ReactNode {
  // selectedDay is shared planner state — the top bar may also change it.
  // viewMode drives the list vs. grid rendering choice.
  const { viewMode, week, selectedDay, setSelectedDay } = useAppState();

  // Lessons come from the planner store so completions, edits, and undo/redo
  // are immediately reflected in the left pane list and right pane detail.
  const { lessons, setLessonStatus, lastChange } = usePlanner();

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
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const first = lessons.find(
      (l) => l.week === week && l.day === selectedDay && l.status !== "done",
    );
    return first?.id ?? null;
  });

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
  // reorder operable without a mouse). The SAME sensors instance feeds two
  // independent DndContexts: the row-reorder context inside the lesson list
  // and the column-reorder context that wraps the three big columns. Each
  // context's collision detection + items are scoped to its own surface, so
  // pointer events on a row's grip never bubble up and trigger column drag,
  // and pointer events on a column grip never reach inner rows.
  const sensors = useDndSensors();
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // ── Resizable column widths (local + localStorage) ────────────────────
  // The persisted widths track the LIST and RAIL columns regardless of where
  // they sit in the order. The names follow the column they govern, not a
  // position in the grid — when the teacher reorders the columns, `listWidth`
  // still belongs to the lesson list and `railWidth` still belongs to the
  // right rail.
  //
  // Initialised to the defaults so the server and the client's first render
  // agree; the mount effect then swaps in any persisted width. `bodyRef`
  // points at the body grid so drag math can resolve a pointer x into a
  // width relative to the grid's left edge.
  //
  // `bodyWidth` mirrors the live container width — it is updated from a
  // ResizeObserver below so the dynamic clamps + the splitter's
  // aria-valuemin/max always reflect what the user can actually drag to.
  //
  // OLD storage keys (PANE_WIDTH_KEY, RIGHT_PANE_WIDTH_KEY) are reused so
  // previously persisted widths still load for existing teachers.
  const [listWidth, setListWidth] = useState<number>(PANE_DEFAULT);
  const [railWidth, setRailWidth] = useState<number>(RIGHT_PANE_DEFAULT);
  const [bodyWidth, setBodyWidth] = useState<number>(0);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Load the persisted widths once, after hydration.
  useEffect(() => {
    setListWidth(readPaneWidth());
    setRailWidth(readRightPaneWidth());
  }, []);

  // ── Live container measurement ────────────────────────────────────────
  // Track the body grid's width via ResizeObserver (with a window-resize
  // fallback for ancient browsers). Each tick re-clamps both stored widths
  // against the new live bound and writes the clamped value back to
  // localStorage so a previously persisted width that exceeds the new body
  // can never strand a pane off-screen.
  useEffect(() => {
    const grid = bodyRef.current;
    if (!grid) return;

    // Re-clamp helper: read the latest stored widths, clamp each against
    // the new container width + the OTHER pane's current width, and write
    // back if anything changed. Uses the functional setState form so we
    // never close over a stale value.
    const reclamp = (nextBodyWidth: number): void => {
      setBodyWidth(nextBodyWidth);
      setListWidth((prevList) => {
        // Rail width may also be reclamped below; use its current state
        // value via the closure of setRailWidth in the next call.
        setRailWidth((prevRail) => {
          const clampedRail = clampPaneWidth(prevRail, nextBodyWidth, prevList);
          if (clampedRail !== prevRail) writeRightPaneWidth(clampedRail);
          return clampedRail;
        });
        // `prevRail` from the inner setRailWidth callback isn't in scope
        // here; use the latest committed railWidth from outer state (one
        // render behind, harmless — the observer will fire again next tick
        // if it changed).
        const clampedList = clampPaneWidth(prevList, nextBodyWidth, railWidth);
        if (clampedList !== prevList) writePaneWidth(clampedList);
        return clampedList;
      });
    };

    // ResizeObserver is the preferred path — it fires on layout changes
    // that a window-resize listener would miss (e.g. an ancestor's flex
    // basis changing). We feature-detect and gracefully degrade.
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          reclamp(entry.contentRect.width);
        }
      });
      ro.observe(grid);
      return () => ro.disconnect();
    }

    // Fallback: window resize listener. Less precise but functional.
    const handle = (): void => {
      const rect = grid.getBoundingClientRect();
      reclamp(rect.width);
    };
    handle();
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
    // We intentionally read railWidth from closure (not deps): re-creating
    // the ResizeObserver on every width tick would tear it down mid-drag.
    // The stale read is harmless — a follow-up observer tick will re-clamp
    // if a stored width drifts out of bounds, per the comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Generic column-width commit ───────────────────────────────────────
  // After the column reorder lands, the lesson list and the rail can sit
  // at ANY position in the grid — they're no longer hard-coded to the
  // first / last track. The splitter drag math therefore can't anchor to
  // `rect.left` or `rect.right` of the body anymore; it has to resolve
  // the pointer x against the LIVE bounding rect of the column track
  // being resized. Each splitter is rendered with a callback that knows
  // which column it governs and which neighbor "absorbs" the slack.
  //
  // The helpers below replace the old `commitWidth` + `commitRightWidth`
  // pair with a single `commitColumnWidth(column, px)` that clamps + sets
  // + persists, parameterised by which column (`"list"` or `"rail"`) is
  // being resized.

  const commitColumnWidth = useCallback(
    (column: "list" | "rail", px: number): void => {
      const grid = bodyRef.current;
      const liveBodyWidth = grid ? grid.getBoundingClientRect().width : 0;
      if (column === "list") {
        const next = clampPaneWidth(px, liveBodyWidth, railWidth);
        setListWidth(next);
        writePaneWidth(next);
      } else {
        const next = clampPaneWidth(px, liveBodyWidth, listWidth);
        setRailWidth(next);
        writeRightPaneWidth(next);
      }
    },
    [listWidth, railWidth],
  );

  // ── Live aria bounds per splitter ─────────────────────────────────────
  // Each splitter exposes its aria-valuemin / aria-valuemax via the props
  // we pass to <PaneSplitter>. The bounds for a column being resized are
  // anchored to the OTHER fixed column's current width — the detail
  // (1fr) absorbs whatever's left. The min is PANE_FLOOR; the max is
  // `bodyWidth − PANE_FLOOR − otherFixedColumnWidth`.
  const listBounds = paneBounds(bodyWidth, railWidth);
  const railBounds = paneBounds(bodyWidth, listWidth);

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
  }

  function handleRowDragCancel(): void {
    setDraggingId(null);
  }

  // ── Column reorder state + drag handlers ─────────────────────────────
  // The three big content columns — lesson list, center detail, right
  // rail — can be reordered by dragging a small horizontal grip on each
  // column's top-left corner. Order is a per-teacher viewing preference,
  // never the shared doc; it persists to localStorage under
  // `mycurricula:daily-column-order`.
  //
  // Hydration discipline: `columnOrder` starts at the default so the
  // server-rendered HTML and the first client render match; the mount
  // effect below loads any persisted order and `hydratedColumnRef` then
  // gates persistence so the first load doesn't immediately overwrite
  // storage with the default. Same pattern as the right-rail panel
  // order, the per-day row order, and the pane widths above.

  const [columnOrder, setColumnOrder] =
    useState<ColumnId[]>(DEFAULT_COLUMN_ORDER);
  const [draggingColumnId, setDraggingColumnId] = useState<ColumnId | null>(
    null,
  );
  const hydratedColumnRef = useRef(false);

  // Load the saved column order once, post-mount. Empty deps so it never
  // re-fires — the order is then driven purely by user action.
  useEffect(() => {
    setColumnOrder(readColumnOrder());
    hydratedColumnRef.current = true;
  }, []);

  // Persist whenever the order changes (after the initial load only).
  useEffect(() => {
    if (!hydratedColumnRef.current) return;
    writeColumnOrder(columnOrder);
  }, [columnOrder]);

  // Screen-reader live announcement — committed when the order changes so
  // a keyboard reorder is audible. The aria-live region below uses
  // role="status" + aria-live="polite" so SR speaks the new order without
  // interrupting the current speech, matching the lesson-flow idiom.
  const [columnAnnouncement, setColumnAnnouncement] = useState<string>("");
  const columnAnnounceRegionId = useId();

  const handleColumnDragStart = useCallback((e: DragStartEvent): void => {
    const id = String(e.active.id);
    if (isColumnId(id)) setDraggingColumnId(id);
  }, []);

  const handleColumnDragEnd = useCallback((e: DragEndEvent): void => {
    setDraggingColumnId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = String(active.id);
    const to = String(over.id);
    if (!isColumnId(from) || !isColumnId(to)) return;
    setColumnOrder((prev) => {
      const fromIdx = prev.indexOf(from);
      const toIdx = prev.indexOf(to);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const next = arrayMove(prev, fromIdx, toIdx);
      // Build an aria-live announcement reading the column's new home as
      // "first / middle / last" plus the full new order, so a keyboard
      // user hears confirmation when they release Space to drop.
      const positionWords = ["first", "middle", "last"] as const;
      const newPos = next.indexOf(from);
      const orderLabels = next.map((id) => COLUMN_LABEL[id]).join(", ");
      setColumnAnnouncement(
        `${COLUMN_LABEL[from]} column moved to ${positionWords[newPos]}. New order: ${orderLabels}.`,
      );
      return next;
    });
  }, []);

  const handleColumnDragCancel = useCallback((): void => {
    setDraggingColumnId(null);
  }, []);

  // ── Dynamic grid template ─────────────────────────────────────────────
  // Walk the column order, emitting a track size per column AND an `auto`
  // track between each pair of adjacent columns for the splitter that
  // sits there. Tracks: list → `${listWidth}px`, detail → `1fr`,
  // rail → `${railWidth}px`. The template is recomputed each render off
  // the current state — cheap, three columns + at most two splitters.
  const gridTemplate = useMemo(() => {
    const trackFor = (id: ColumnId): string => {
      if (id === "list") return `${listWidth}px`;
      if (id === "rail") return `${railWidth}px`;
      // detail → flex track; minmax(0, 1fr) keeps the column from refusing
      // to shrink if its inner content (the LessonDetail) has any
      // intrinsic min-width contribution.
      return "minmax(0, 1fr)";
    };
    const parts: string[] = [];
    columnOrder.forEach((id, i) => {
      parts.push(trackFor(id));
      if (i < columnOrder.length - 1) parts.push("auto"); // splitter track
    });
    return parts.join(" ");
  }, [columnOrder, listWidth, railWidth]);

  // ── Per-splitter drag wiring ──────────────────────────────────────────
  // The two splitters sit between adjacent columns in the new order. Each
  // splitter resizes the FIXED column nearer to it:
  //   • LEFT fixed + RIGHT detail   → resize LEFT column. Drag math:
  //       LEFT.width = clientX − LEFT.left  (LEFT.left from live rect).
  //   • LEFT detail + RIGHT fixed   → resize RIGHT column. Drag math:
  //       RIGHT.width = RIGHT.right − clientX.
  //   • BOTH fixed (detail is at an edge)   → resize LEFT column. Drag
  //       math: LEFT.width = clientX − LEFT.left. Detail (at the opposite
  //       edge as a 1fr track) absorbs the slack.
  //
  // Keyboard step: PaneSplitter reports +1 for ArrowRight / ArrowDown.
  // We translate that to "grow the column the splitter governs" so the
  // separator feels conventional: dragging or arrowing rightward grows
  // whichever column the splitter is anchored to.
  //
  // Per-splitter min/max bounds derive from the OTHER fixed column's
  // current width, with PANE_FLOOR reserved for the detail too.
  //
  // resolveColumnTrackLeft / Right walk the rendered grid: each column
  // wrapper carries a data-column attribute so we can find it from the
  // body element without holding extra refs.
  const resolveColumnRect = useCallback(
    (column: "list" | "rail"): DOMRect | null => {
      const grid = bodyRef.current;
      if (!grid) return null;
      const el = grid.querySelector<HTMLElement>(`[data-column="${column}"]`);
      return el ? el.getBoundingClientRect() : null;
    },
    [],
  );

  /** Build the prop bundle a single splitter passes to <PaneSplitter>. */
  function splitterPropsFor(
    leftCol: ColumnId,
    rightCol: ColumnId,
  ): {
    width: number;
    min: number;
    max: number;
    onDrag: (clientX: number) => void;
    onStep: (direction: -1 | 1) => void;
    label: string;
  } {
    // Determine which fixed column this splitter resizes. The detail
    // column is 1fr, so the splitter never resizes it directly — it
    // resizes whichever fixed neighbor it sits beside.
    const leftIsDetail = leftCol === "detail";
    // If left is detail, the splitter resizes the RIGHT (fixed) neighbor;
    // otherwise it resizes the LEFT (fixed) neighbor — that covers all
    // three patterns (fixed-detail, detail-fixed, fixed-fixed).
    const target: "list" | "rail" = leftIsDetail
      ? (rightCol as "list" | "rail")
      : (leftCol as "list" | "rail");

    const currentWidth = target === "list" ? listWidth : railWidth;
    const bounds = target === "list" ? listBounds : railBounds;
    const targetLabel = COLUMN_LABEL[target];

    return {
      width: currentWidth,
      min: bounds.min,
      max: bounds.max,
      label: `Resize ${targetLabel.toLowerCase()} column`,
      onDrag: (clientX: number) => {
        // -Infinity / +Infinity (keyboard Home/End) flow through to the
        // clamp in commitColumnWidth, which lands on the bound exactly.
        if (!Number.isFinite(clientX)) {
          commitColumnWidth(target, clientX);
          return;
        }
        const rect = resolveColumnRect(target);
        if (!rect) return;
        // The splitter resolves clientX into a width for the target
        // column. If the splitter is on the LEFT of the target (i.e. the
        // splitter's left neighbor is detail and the target is on the
        // right), the column's RIGHT edge is fixed and we compute width
        // as `rect.right - clientX`. Otherwise the column's LEFT edge is
        // fixed and width is `clientX - rect.left`.
        const splitterOnLeftOfTarget = leftIsDetail;
        const nextWidth = splitterOnLeftOfTarget
          ? rect.right - clientX
          : clientX - rect.left;
        commitColumnWidth(target, nextWidth);
      },
      onStep: (direction: -1 | 1) => {
        // ArrowRight / ArrowDown → direction = +1, which conventionally
        // moves the divider to the right. If the splitter sits on the
        // LEFT of the target column, moving right SHRINKS the target;
        // otherwise moving right GROWS the target. Mirror that here so
        // the keyboard feel matches the drag feel.
        const splitterOnLeftOfTarget = leftIsDetail;
        const delta = splitterOnLeftOfTarget
          ? -direction * PANE_STEP
          : direction * PANE_STEP;
        commitColumnWidth(target, currentWidth + delta);
      },
    };
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

  // ── Column renderers ──────────────────────────────────────────────────
  // Each column's content is captured in a small render fn that takes the
  // ColumnDragGrip element + an absolute-positioned wrapper className.
  // The wrapper supplies the `position: relative` host the grip needs;
  // the inner subtree of each column is unchanged from the static layout.
  //
  // LessonDetail (center) and RightRail are owned by other agents and not
  // modified here. Both get a transparent wrapper <div> inside the
  // SortableColumn so the grip can sit absolutely on a corner the wrapper
  // owns without touching the inner component's root.

  function renderListColumn(grip: ReactNode): ReactNode {
    return (
      <div className={styles.columnWithGrip} data-column="list">
        {grip}
        <div className={styles.leftPane}>
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
          <div className={styles.leftPaneEyebrow}>Week {week}</div>

          {/* ── Week strip: one pill per configured school-week day ─ */}
          <WeekStrip
            week={week}
            selectedDay={selectedDay}
            onSelect={handleDayChange}
          />

          {/* ── In-column day header (full day name + progress) ── */}
          <TodayDashboard
            dayLessons={dayLessons}
            dayLabel={WEEK_DAYS[selectedDay]}
          />

          {/* ── Daily notes banner (when this day has personal notes) ─ */}
          <NotesBanner day={selectedDay} />

          {/* ── "Lessons" label row + collapse-all + add-lesson stub ─ */}
          <div className={styles.lessonsLabelRow}>
            <span className={styles.lessonsLabel}>Lessons</span>
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
                        {SUBJECT_BY_ID[draggingLesson.subject].name}
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
              <div className={styles.emptyList} role="status">
                No lessons planned for {WEEK_DAYS[selectedDay]}.
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
      </div>
    );
  }

  function renderDetailColumn(grip: ReactNode): ReactNode {
    // The center detail's inner root (LessonDetail) is owned by another
    // agent and never modified here; a thin wrapper carries the grip in
    // its top-left corner.
    return (
      <div className={styles.columnWithGrip} data-column="detail">
        {grip}
        <div className={styles.rightPane}>
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
            <div className={styles.emptyDetail} role="status">
              <p className={styles.emptyDetailText}>
                Select a lesson to view its plan.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderRailColumn(grip: ReactNode): ReactNode {
    // RightRail's inner root is owned by another agent and never modified
    // here; a thin wrapper carries the grip in its top-left corner.
    return (
      <div className={styles.columnWithGrip} data-column="rail">
        {grip}
        <RightRail lesson={selectedLesson} week={week} day={selectedDay} />
      </div>
    );
  }

  const COLUMN_RENDERERS: Record<ColumnId, (grip: ReactNode) => ReactNode> = {
    list: renderListColumn,
    detail: renderDetailColumn,
    rail: renderRailColumn,
  };

  // ── Breadcrumb (BIG-7) ─────────────────────────────────────────────────
  // Week N / <Day> / <Subject> — each segment is a clickable link.
  // Day label is derived from the configured school-week array (WEEK_DAYS)
  // so it respects the school's custom week, never a hard-coded weekday set.
  // Subject is drawn from the selected lesson; falls back to null so the
  // segment is omitted rather than showing a stale value when no lesson is
  // selected (e.g. the day is empty).
  const breadcrumbSubject = selectedLesson
    ? SUBJECT_BY_ID[selectedLesson.subject]
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
      {/* ── Page header (title + onboarding subtitle) ─────────────────────
          Visible page-level h1 + subtitle, matching the YearView recipe
          via the canonical <PageHeader> primitive. Replaces the prior
          sr-only h1 with a visible heading that doubles as onboarding
          (CLAUDE.md §4 — tell a first-time teacher what this page is
          FOR). Renders on BOTH grid and list modes so the page has
          exactly one h1 in the a11y tree at all times. DailyList's
          inner day title is demoted to an h2 (see DailyList.tsx) to
          keep the single-h1-per-page invariant. */}
      <PageHeader
        title="Daily View"
        subtitle="Today's lessons in detail, side-by-side with the day's schedule and notes."
        className={styles.dailyPageHeader}
      />

      {/* ── Breadcrumb: Week N / Day / Subject (BIG-7) ───────────────────
          Renders above the body row so it sits flush with the page top,
          spanning the full width including the icon rail. Each segment is
          an anchor; the separator chevrons are presentational. */}
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <ol className={styles.breadcrumbList}>
          <li>
            <Link href="/weekly" className={styles.breadcrumbLink}>
              Week {week}
            </Link>
          </li>
          <li className={styles.breadcrumbSep} aria-hidden="true">
            ›
          </li>
          <li>
            {/* Day segment — links to the same daily view; clicking re-confirms
                the active day, which is a no-op when already on it. */}
            <Link href="/daily" className={styles.breadcrumbLink}>
              {WEEK_DAYS[selectedDay] ?? "Day"}
            </Link>
          </li>
          {breadcrumbSubject && (
            <>
              <li className={styles.breadcrumbSep} aria-hidden="true">
                ›
              </li>
              <li>
                <Link
                  href={`/subject/${breadcrumbSubject.id}`}
                  className={styles.breadcrumbLink}
                >
                  {breadcrumbSubject.name}
                </Link>
              </li>
            </>
          )}
        </ol>
      </nav>

      {/* ── Inline schedule-mode pill (Subject ↔ Schedule). Hidden ≤1280px
          where the additional rail would not fit (same fold the existing
          right rail uses). The pill state persists per-teacher. */}
      <DailySchedulePill />

      {/* ── aria-live region: column reorder announcements ───────────────
          A visually hidden polite live region — when a column moves
          (mouse, touch, or keyboard) we write the new order into it so
          screen-readers hear the change. Always in DOM so the live
          attribute is observed from the start. */}
      <div
        id={columnAnnounceRegionId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={styles.srOnly}
      >
        {columnAnnouncement}
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
          /* ── Grid mode body (three-track reorderable) ────────────────────
              data-narrow-pane drives the narrow (single-column) layout: CSS
              shows exactly one pane on narrow viewports and ignores it on
              wide. The grid template is computed from columnOrder above;
              each column wrapper carries a data-column attribute so the
              splitter drag math can find its column track via querySelector
              on bodyRef. */
          <div
            id="daily-pane-body"
            ref={bodyRef}
            className={styles.body}
            role="tabpanel"
            aria-labelledby={`daily-tab-${selectedDay}`}
            data-narrow-pane={narrowPane}
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleColumnDragStart}
              onDragEnd={handleColumnDragEnd}
              onDragCancel={handleColumnDragCancel}
            >
              <SortableContext
                items={columnOrder}
                strategy={horizontalListSortingStrategy}
              >
                {columnOrder.map((id, i) => {
                  const render = COLUMN_RENDERERS[id];
                  // Build a unique CSS class per column id so its inner
                  // chrome (lesson-list card vs. right-rail track) keeps
                  // its existing look regardless of position.
                  return (
                    <Fragment key={id}>
                      <SortableColumn id={id} className={styles.columnSlot}>
                        {(grip) => render(grip)}
                      </SortableColumn>
                      {/* Splitter sits between this column and the next; the
                          last column has no trailing splitter. */}
                      {i < columnOrder.length - 1 && (
                        <PaneSplitter
                          {...splitterPropsFor(id, columnOrder[i + 1]!)}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </SortableContext>

              {/* Floating ghost of the dragged column — a small chip with
                  the column's label, reusing the right-rail panel-ghost
                  visual vocabulary (paper card + hairline + soft lift). */}
              <DragOverlay>
                {draggingColumnId && <ColumnDragGhost id={draggingColumnId} />}
              </DragOverlay>
            </DndContext>
          </div>
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
    </div>
  );
}
