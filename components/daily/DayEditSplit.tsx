"use client";

// DayEditSplit.tsx — the W3.8b Day EDIT surface: a two-pane split that
// replaces the dock/list body while the View↔Edit toggle is in Edit.
//
// Port of the bundle's DayEdit (New v2 Site Design.bundled.html JSX
// ~B:11294-11355; CSS ~B:5137-5186):
//   [ fixed agenda list | drag divider | scrolling fill-in template ]
//
//   • Left — .deLeft: the day name, then one compact row per lesson
//     (time · subject dot · title-over-subject), then the W3.7 dashed
//     add-lesson row. Selecting a row swaps the right pane.
//   • Divider — the house <PaneSplitter> (role="separator", keyboard +
//     pointer-capture a11y), NOT the mock's mouse-only mousedown handler.
//     Width clamps to [220, 520] (default 300) and persists to
//     localStorage "mycurricula:daily-edit-left-width" — hydrated
//     post-mount so the server HTML matches the first client paint (the
//     DailyView row-order persistence pattern).
//   • Right — .deRight hosts .deTemplate, KEYED by the selected lesson id
//     so switching lessons remounts the card and re-runs the deSlide
//     entry animation (reduced motion gets an instant paint — the
//     keyframes live inside @media (prefers-reduced-motion:no-preference)
//     only). Header band = solid subject color via the cp-subj/--c
//     cascade; right cluster + striped team banner reuse the LessonModal
//     patterns (same pill/button/tooltip copy). Body = the meta chip row
//     + <LessonEditor host="day-pane"> (the W3.8 shared fill-in template).
//
// AUTO-SELECT (adapted to the app — the mock keys on a `status:'now'`
// field that doesn't exist here): when no shared selection resolves on
// this day, default to
//   1. the lesson whose schedule block contains the current time, IF the
//      viewed day is literally today (todayColumnIndex + calendar-date
//      equality via dateForWeekDay; block→lesson resolution is the
//      ChromeClock recipe: linked lesson id first, else first same-subject
//      lesson of the day);
//   2. else the first lesson with status !== "done";
//   3. else the first lesson.
// The mock's initialSel guard defect (it checked the STALE day.lessons
// snapshot, not the live list) doesn't apply — selection resolves against
// the live dayLessons prop every render.
//
// SELECTION IS SHARED: selectedId/onSelect are DailyView's own selection
// state, so flipping back to View keeps the same lesson in context, and
// the openLessonPlanner seam (dblclick / Shift+Enter / quick-add) lands
// here with the target lesson already active.
//
// ADD LESSON: reuses DailyView's one-click quick-add mutator via the
// onQuickAdd prop (subject = day's first lesson's, else the catalog's
// first; awaited, then selected through the planner seam) — NOT the
// mock's broken mkLesson (it ignored dayIdx and hard-coded math; defect
// ledger). The dashed-row visual idiom classes are reused straight from
// DailyView.module.css (.addLessonRow family).
//
// EXIT: the header's Exit button calls the host's onExit — which flips
// the Day view back to View mode (the useViewEditMode("Day") hook's
// setEdit(false)); it is NOT a modal close (no scrim, no focus trap —
// this is an in-page surface).
//
// FORK SAFETY (CLAUDE.md §2): editing here autosaves through the store's
// lazy-fork write path inside <LessonEditor>; the ONLY store writes this
// file makes are editLesson (title) and setSaveTarget(id, "core") behind
// the explicit "Push to Team" button — intent copy, a deliberate store
// no-op until the backend wave (the LessonModal M3 contract).
//
// W3.9 testability: the split root carries data-day-edit-split; probes
// pair it with ViewEditToggle's aria-pressed to assert the mode.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import type { Lesson } from "@/lib/types";
import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import { useConsequenceToast } from "@/lib/consequence-toast";
import { useSchoolWeek } from "@/lib/use-school-week";
import { todayColumnIndex } from "@/lib/now-anchor";
import { getDayBlocks, minuteOfDay } from "@/lib/schedule-data";
import { lessonTime, dateForWeekDay } from "@/lib/mock";
import { LessonEditor } from "@/components/lesson-editor";
import { Button, PlannerEmpty, Tooltip } from "@/components/ui";
import { RichTextEditor } from "@/components/rich-text";
import { PaneSplitter } from "./PaneSplitter";
import dvStyles from "./DailyView.module.css";
import styles from "./DayEditSplit.module.css";

// ── Left-pane width persistence ───────────────────────────────────────────
// Parent-side clamp [220, 520], default 300 (the W3.8b lock). Post-mount
// hydration keeps the localStorage read off the SSR path.

const LEFT_WIDTH_KEY = "mycurricula:daily-edit-left-width";
const LEFT_MIN = 220;
const LEFT_MAX = 520;
const LEFT_DEFAULT = 300;
/** Keyboard nudge per arrow press on the splitter. */
const LEFT_STEP = 16;

function clampLeftWidth(w: number): number {
  return Math.max(LEFT_MIN, Math.min(LEFT_MAX, w));
}

/** How long the "✓ Marked for team push" confirmation holds (bundle:
 *  2200ms — the LessonModal constant). */
const PUSHED_CONFIRM_MS = 2200;

/** Strip HTML tags for plain-text contexts (list rows, aria, toast copy).
 *  Titles may carry inline markup from a rich-text edit on another host.
 *  Mirrors LessonModal's stripHtml projection. */
function stripHtml(html: string): string {
  return (html ?? "").slice(0, 2000).replace(/<[^>]*>/g, "");
}

/** The start portion of a lesson's time label — "8:10" out of "8:10–9:10".
 *  Always via the lessonTime() schedule join (Lesson.time may be absent);
 *  lenient on the dash so a custom per-lesson label still splits. */
function lessonStartLabel(lesson: Lesson): string {
  const full = lessonTime(lesson);
  return full.split(/[–—-]/)[0]?.trim() || full;
}

/** Same-calendar-day equality (local time — the codebase avoids UTC date
 *  math; see lib/use-academic-year.ts). */
function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ── Props ─────────────────────────────────────────────────────────────────

export interface DayEditSplitProps {
  /** The viewed day's lessons, in DailyView's per-teacher row order —
   *  rendered AS GIVEN (never re-sorted by time; new adds append at the
   *  end, which matches the mock's behavior). */
  dayLessons: Lesson[];
  /** Active week — feeds the "is the viewed day today?" auto-select check. */
  week: number;
  /** Active day index in the configured school week. */
  day: number;
  /** Full day name for the agenda header (e.g. "Wednesday"). */
  dayLabel: string;
  /** DailyView's shared selected-lesson state (kept across View↔Edit). */
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Exit editing — the host flips the Day view back to View mode. */
  onExit: () => void;
  /** DailyView's one-click quick-add (await + select via the planner seam). */
  onQuickAdd: () => void;
  /** Quick-add round-trip in flight — the dashed row disables. */
  quickAdding: boolean;
  /** Transient quick-add failure message (auto-cleared by the host). */
  quickAddError: string | null;
}

// ── Component ─────────────────────────────────────────────────────────────

export function DayEditSplit({
  dayLessons,
  week,
  day,
  dayLabel,
  selectedId,
  onSelect,
  onExit,
  onQuickAdd,
  quickAdding,
  quickAddError,
}: DayEditSplitProps): ReactNode {
  const { subjectById, editLesson, setSaveTarget } = usePlanner();
  const { editMode } = useAppState();
  const { showConsequence } = useConsequenceToast();
  const { days: schoolWeekDays } = useSchoolWeek();

  const rootRef = useRef<HTMLDivElement>(null);

  // ── Team (master) mode — drives the pill + striped banner ──────────────
  const team = editMode === "master";

  // ── Left-pane width (persisted) ─────────────────────────────────────────
  // Initialised to the default rather than from localStorage: the server
  // has no localStorage, so seeding state in the initializer would diverge
  // the first client render from the server HTML (hydration mismatch). The
  // mount effect hydrates the saved width immediately after.
  const [leftWidth, setLeftWidth] = useState(LEFT_DEFAULT);
  const hydratedRef = useRef(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LEFT_WIDTH_KEY);
      const parsed = Number.parseInt(raw ?? "", 10);
      if (Number.isFinite(parsed)) setLeftWidth(clampLeftWidth(parsed));
    } catch {
      // Storage unavailable — the default stands; non-fatal.
    }
    hydratedRef.current = true;
  }, []);

  const commitLeftWidth = useCallback((w: number): void => {
    const next = clampLeftWidth(w);
    setLeftWidth(next);
    // Never write the pre-hydration default over a saved value.
    if (!hydratedRef.current) return;
    try {
      window.localStorage.setItem(LEFT_WIDTH_KEY, String(Math.round(next)));
    } catch {
      // Storage full / unavailable — width simply won't persist.
    }
  }, []);

  // PaneSplitter reports raw clientX (±Infinity for Home/End); resolve it
  // against the split root's left edge, then clamp. clamp() absorbs the
  // infinities, so Home/End land exactly on the bounds.
  const handleSplitterDrag = useCallback(
    (clientX: number): void => {
      const left = rootRef.current?.getBoundingClientRect().left ?? 0;
      commitLeftWidth(clientX - left);
    },
    [commitLeftWidth],
  );

  const handleSplitterStep = useCallback(
    (direction: -1 | 1): void => {
      commitLeftWidth(leftWidth + direction * LEFT_STEP);
    },
    [commitLeftWidth, leftWidth],
  );

  // ── Auto-select ─────────────────────────────────────────────────────────
  // `mountNow` is captured once per mount: the default is a mount-time
  // orientation aid, not a live tracker — the pane must never re-select
  // under the teacher's feet as periods roll over. (SSR-safe regardless:
  // this component only renders once the post-hydration edit flag is on.)
  const [mountNow] = useState(() => new Date());

  const autoDefaultId = useMemo((): string | null => {
    if (dayLessons.length === 0) return null;

    // "Viewed day is today" — the weekday must be today's column in the
    // CONFIGURED school week (the ChromeClock recipe) AND the viewed
    // week/day must resolve to today's calendar date (the view can sit on
    // any week, unlike ChromeClock which always shows literal today).
    const isToday =
      todayColumnIndex(mountNow, schoolWeekDays) === day &&
      sameCalendarDay(dateForWeekDay(week, day), mountNow);

    if (isToday) {
      // The schedule block containing the current minute (half-open
      // [startMin, endMin) — lib/now-anchor's boundary rule).
      const minute = minuteOfDay(mountNow);
      const block = getDayBlocks(day).find(
        (b) =>
          b.type === "academic" &&
          b.subject !== undefined &&
          b.startMin <= minute &&
          minute < b.endMin,
      );
      if (block) {
        // Block → lesson: the linked lesson id wins; otherwise the day's
        // first lesson for the block's subject (ChromeClock's lessonFor).
        const hit =
          (block.lesson
            ? dayLessons.find((l) => l.id === block.lesson)
            : undefined) ?? dayLessons.find((l) => l.subject === block.subject);
        if (hit) return hit.id;
      }
    }

    const firstOpen = dayLessons.find((l) => l.status !== "done");
    return (firstOpen ?? dayLessons[0]).id;
  }, [dayLessons, mountNow, schoolWeekDays, week, day]);

  // Effective selection: DailyView's shared selectedId when it resolves on
  // this day, else the auto default. Derived (never effect-written) so the
  // shared state is only ever moved by an explicit teacher action.
  const sel = useMemo((): Lesson | null => {
    const shared = selectedId
      ? dayLessons.find((l) => l.id === selectedId)
      : undefined;
    if (shared) return shared;
    return autoDefaultId
      ? (dayLessons.find((l) => l.id === autoDefaultId) ?? null)
      : null;
  }, [selectedId, dayLessons, autoDefaultId]);

  const subj = sel ? subjectById[sel.subject] : null;

  // ── Title editing (the LessonModal double-click idiom, verbatim) ────────
  // Pure local UI state; the draft commits to the store on blur via
  // editLesson with a coalesce key (typing burst = one undo step). Escape
  // cancels inside TitleEditorShell.
  const [titleEditing, setTitleEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState<string>("");

  // A different lesson resets any open editor so a stale draft can never
  // bleed across records.
  const selId = sel?.id ?? null;
  useEffect(() => {
    setTitleEditing(false);
    setDraftTitle("");
  }, [selId]);

  const openTitleEditor = useCallback(
    (e?: SyntheticEvent): void => {
      if (sel === null) return;
      e?.stopPropagation();
      e?.preventDefault();
      setTitleEditing(true);
      setDraftTitle(sel.title);
    },
    [sel],
  );

  const commitTitle = useCallback((): void => {
    // Guarded so a blur firing after an Escape-cancel can never re-commit
    // a stale draft (LessonModal's commitTitle guard).
    if (!titleEditing) return;
    const trimmed = draftTitle.trim();
    if (sel !== null && trimmed !== (sel.title ?? "")) {
      editLesson(
        sel.id,
        { title: trimmed },
        { key: `lesson:${sel.id}:title`, ts: Date.now() },
      );
    }
    setTitleEditing(false);
    setDraftTitle("");
  }, [titleEditing, draftTitle, sel, editLesson]);

  const cancelTitle = useCallback((): void => {
    setTitleEditing(false);
    setDraftTitle("");
  }, []);

  // ── Push to Team (the LessonModal intent-copy contract, verbatim) ───────
  // Explicit push is the ONLY path to the shared plan (fork model). The
  // store action records intent and is a deliberate no-op until the
  // backend wave, so the copy speaks in INTENT ("marked to push") — never
  // asserting a team-plan change that hasn't happened (gate finding M3).
  const [pushed, setPushed] = useState(false);
  const pushedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pushedTimerRef.current !== null) clearTimeout(pushedTimerRef.current);
    },
    [],
  );

  const handlePushToTeam = useCallback((): void => {
    if (sel === null) return;
    setSaveTarget(sel.id, "core");
    setPushed(true);
    showConsequence({
      message: `"${stripHtml(sel.title)}" is marked to push to the team curriculum — team sync arrives with the backend wave.`,
    });
    if (pushedTimerRef.current !== null) clearTimeout(pushedTimerRef.current);
    pushedTimerRef.current = setTimeout(
      () => setPushed(false),
      PUSHED_CONFIRM_MS,
    );
  }, [sel, setSaveTarget, showConsequence]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      ref={rootRef}
      className={styles.deSplit}
      data-day-edit-split=""
      title="Day editing — pick a lesson on the left and fill in its plan on the right"
    >
      {/* ── Left: fixed agenda list (inline width from the drag state) ──── */}
      <div className={styles.deLeft} style={{ width: leftWidth }}>
        <div className={styles.deListhead}>{dayLabel}</div>
        <div
          className={styles.deList}
          role="group"
          aria-label={`${dayLabel} — lessons to edit`}
        >
          {dayLessons.map((lesson) => {
            const rowSubj = subjectById[lesson.subject];
            const plainTitle = stripHtml(lesson.title);
            const isSel = sel?.id === lesson.id;
            return (
              <button
                key={lesson.id}
                type="button"
                // Mock idiom: native title carries the "Edit <title>" hint
                // (also the touch long-press fallback).
                title={`Edit ${plainTitle}`}
                aria-pressed={isSel}
                onClick={() => onSelect(lesson.id)}
                className={[
                  styles.deItem,
                  isSel ? styles.deItemSel : "",
                  "cp-subj",
                  rowSubj.cls,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className={styles.deTime}>
                  {lessonStartLabel(lesson)}
                </span>
                {/* Subject dot — var(--c) from the cp-subj cascade. */}
                <span className={styles.deDot} aria-hidden="true" />
                <span className={styles.deTx}>
                  <span className={styles.deName}>{plainTitle}</span>
                  <span className={styles.deSubj}>{rowSubj.name}</span>
                </span>
              </button>
            );
          })}

          {/* Dashed add row — the W3.7 idiom (classes reused from
              DailyView.module.css) + this file's strip-mode override.
              ONE-CLICK create through DailyView's awaited mutator; the
              created lesson lands selected in this pane via the planner
              seam. Disabled while in flight (no double-create). */}
          <Tooltip
            content="Add a lesson to this day — creates a blank lesson and opens it here"
            tooltipId="daily-edit-add-lesson"
            side="top"
          >
            <button
              type="button"
              className={`${dvStyles.addLessonRow} ${styles.deAdd}`}
              onClick={onQuickAdd}
              disabled={quickAdding}
              aria-busy={quickAdding}
              title="Add a lesson to this day — creates a blank lesson and opens it here"
            >
              <span className={dvStyles.addLessonRowPlus} aria-hidden="true">
                +
              </span>
              Add lesson
            </button>
          </Tooltip>
        </div>

        {/* Transient quick-add failure (W3.7 audit #3 surface, reused). */}
        {quickAddError && (
          <p className={dvStyles.addLessonRowError} role="alert">
            {quickAddError}
          </p>
        )}
      </div>

      {/* ── Divider — the house PaneSplitter (keyboard + pointer-capture
            a11y; the mock's handler was mouse-only). Hidden ≤820px. ────── */}
      <PaneSplitter
        width={leftWidth}
        min={LEFT_MIN}
        max={LEFT_MAX}
        onDrag={handleSplitterDrag}
        onStep={handleSplitterStep}
        label="Resize the day agenda list"
        className={styles.deDivider}
      />

      {/* ── Right: scrolling fill-in template ───────────────────────────── */}
      <div className={styles.deRight}>
        {sel && subj ? (
          /* key={sel.id} remounts the card per lesson so the deSlide entry
             animation re-runs on every switch (mock recipe). */
          <div
            key={sel.id}
            className={`${styles.deTemplate} cp-subj ${subj.cls}`}
          >
            {/* Header band — solid subject color via var(--c). */}
            <div className={styles.deThead}>
              <div className={styles.deTheadLeft}>
                <div className={styles.deTsubj}>
                  {subj.name} · {lessonTime(sel)}
                </div>
                {/* Title — double-click / Enter / F2 to edit (LessonModal
                    idiom; commits through editLesson with coalescing). */}
                <div className={styles.deTitle}>
                  {titleEditing ? (
                    <TitleEditorShell
                      onCommit={commitTitle}
                      onCancel={cancelTitle}
                    >
                      <div className={styles.titleEditor}>
                        <RichTextEditor
                          value={draftTitle}
                          onChange={setDraftTitle}
                          autoFocus
                          singleLine
                          placeholder="Lesson title…"
                          ariaLabel="Edit lesson title"
                        />
                      </div>
                    </TitleEditorShell>
                  ) : (
                    <Tooltip
                      content="Double-click or press Enter to rename this lesson — saved automatically as you type elsewhere in the editor."
                      side="bottom"
                      tooltipId="day-edit-title-edit"
                    >
                      <span
                        className={styles.titleText}
                        tabIndex={0}
                        role="button"
                        aria-label="Edit lesson title"
                        onDoubleClick={openTitleEditor}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "F2")
                            openTitleEditor(e);
                        }}
                      >
                        {stripHtml(sel.title)}
                      </span>
                    </Tooltip>
                  )}
                </div>
              </div>

              {/* Right cluster — team pill / Push to Team, then Exit
                  (LessonModal's copy verbatim; Exit flips the mode, it is
                  NOT a modal close). */}
              <div className={styles.deTheadr}>
                {team ? (
                  /* required:true — the team-mode explanation is on the
                     high-consequence always-on list (CLAUDE.md §4). */
                  <Tooltip
                    content="You are editing the team curriculum — changes affect every teacher."
                    side="bottom"
                    required
                  >
                    <span className={styles.teamPill}>● Team curriculum</span>
                  </Tooltip>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`${styles.headBtn} ${pushed ? styles.headBtnDone : ""}`}
                    onClick={handlePushToTeam}
                    tooltip="Mark this lesson to push to the shared team curriculum — it moves from your personal copy to the team plan everyone sees once team sync lands (backend wave)"
                  >
                    {pushed ? "✓ Marked for team push" : "Push to Team"}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className={styles.headBtn}
                  onClick={onExit}
                  tooltip="Exit editing and return to the Day view — edits are already saved as you type"
                >
                  Exit
                </Button>
              </div>
            </div>

            {/* Team-mode banner — striped, persistent, never a confirm
                dialog (CLAUDE.md §2). */}
            {team && (
              <div className={styles.teamBanner} role="status">
                Heads up — changes here affect the whole team.
              </div>
            )}

            {/* Body — meta chips + the shared fill-in template. */}
            <div className={styles.deTbody}>
              <div className={styles.deMeta}>
                {sel.standards.length > 0 && (
                  <span>Standard {sel.standards[0]}</span>
                )}
                <span>{subj.name}</span>
                <span>{sel.unit || "Planned"}</span>
              </div>
              <LessonEditor lessonId={sel.id} host="day-pane" />
            </div>
          </div>
        ) : (
          /* Empty day — a real empty-state CARD (house primitive), never a
             blank div. The add row on the left is the way in. This branch is
             the day-empty case: selection auto-defaults to a lesson whenever
             the day has any, so `sel && subj` is effectively false when the day
             has no lessons. PlannerEmpty so it reads as "loading" during the
             Supabase hydrate rather than a false "no lessons". */
          <div className={styles.deEmpty}>
            <PlannerEmpty
              heading="No lessons for this day yet"
              body="Add a lesson with the dashed row on the left — it opens here ready to fill in."
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── TitleEditorShell ──────────────────────────────────────────────────────
// Thin shell owning the two gestures RichTextEditor does not expose as
// props — copied from LessonModal (module-private there; the
// RichEditorWrapper pattern from LessonDetail / WeeklyLessonCard):
//   • Escape           → cancel (discard the draft). preventDefault +
//                        stopPropagation so no outer listener sees an
//                        unclaimed event (innermost-first contract).
//   • blur out of area → commit. relatedTarget checks keep the editor open
//                        while focus moves within the shell or into the
//                        portaled floating toolbar (role="toolbar").

function TitleEditorShell({
  onCommit,
  onCancel,
  children,
}: {
  onCommit: () => void;
  onCancel: () => void;
  children: ReactNode;
}): ReactNode {
  return (
    <div
      onBlur={(e) => {
        const next = e.relatedTarget as HTMLElement | null;
        if (next && (e.currentTarget as HTMLElement).contains(next)) return;
        if (next?.closest('[role="toolbar"]')) return;
        onCommit();
      }}
      onKeyDown={(e: ReactKeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      {children}
    </div>
  );
}
