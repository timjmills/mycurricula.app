"use client";

// WeekC.tsx — the COLOR-frame reading of the Weekly view (data-frame "color").
//
// The Weekly view renders one of three frames on useTheme().frame:
//   glass → <WeekA>       (read-only period×day grid — Builder A)
//   paper → <WeekColumns> (day columns of rich cards — unchanged)
//   color → <WeekC>       (THIS: subject lanes of color-forward tiles)
//
// Semantics: ROWS = the teacher's subjects (same per-teacher order WeeklyGrid
// uses via useSubjectOrder), COLUMNS = the configured school days
// (useOrderedWeekdays — never a hard-coded weekday set). Each cell holds that
// subject's lesson(s) for that day; multiple lessons STACK (never dropped).
//
// Self-contained by design — like WeeklyGrid and WeekColumns it takes NO props
// and reads the planner + app-state stores directly. selectedLessonId is the
// canonical select/open channel: the shell's URL-write effect and the resources
// RightRail both consume it, so selecting a tile here opens the rail exactly as
// the other frames do. Read-only overview: no drag, no inline title edit
// (locked W5 decisions); completion + full editing happen in the detail panel.

import type { CSSProperties, MouseEvent, ReactNode } from "react";
import {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Tooltip } from "@/components/ui";
import type { Lesson, Subject, SubjectId } from "@/lib/types";
import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import { useLabels } from "@/lib/labels";
import { useOrderedWeekdays } from "@/lib/week-order";
import { useHolidaysByDay } from "@/lib/use-day-holiday";
import { useSubjectOrder } from "@/lib/subject-order";
import { isTodayEmphasisWeek, todayColumnIndex } from "@/lib/now-anchor";
import { deriveDayStatus } from "@/lib/day-status";
import { useWeekExpansion } from "@/lib/week-expansion";
import { lessonTime } from "@/lib/mock/schedule";
import { stripHtml } from "@/lib/html-text";
import type { Weekday } from "@/lib/use-school-week";
// Shared v2 planner atoms (lifted from day-v2 by Builder A). Until the
// planner-v2 barrel lands this import resolves to nothing — a transient
// missing-module error owned by Builder A's files, not this one.
import {
  SelectTitle,
  SubjGlyph,
  ForkCues,
  AddLessonMenu,
  fromInteractive,
  useNowMin,
} from "@/components/planner-v2";
// Full-editor opener. Imported from the deep weekly-lesson-card module (NOT the
// @/components/weekly barrel) on purpose: the barrel re-exports WeeklyShell,
// which imports this frame — a barrel import here would close a cycle. This is
// the exact deep-import WeeklyShell itself uses for the same context. The value
// is null outside <WeeklyShell>, in which case double-click falls back to the
// resources-panel open.
import { OpenLessonEditorContext } from "@/components/weekly/weekly-lesson-card";
// Non-instructional-event popover — a self-contained position:fixed dialog
// ({ open, onClose, day }); reused verbatim from the Daily canvas. Deep import
// because it is not exported from the daily barrel.
import { AddEventForm } from "@/components/daily/AddEventForm";
// Lesson → unit-workspace pop-in (B5.5). Opens the workspace as an overlay via
// the global host — no navigation, so the teacher keeps this week on screen.
import { UnitChip } from "@/components/unit-chip";
// The handoff's four Week destinations (Plan · Teach · Post · Planner). Deep
// import for the same cycle reason as OpenLessonEditorContext above.
import { LessonKebabMenu } from "@/components/weekly/lesson-kebab-menu";
import styles from "./WeekC.module.css";

// ── Today resolution ────────────────────────────────────────────────────────
// Which column (0-based index into the CONFIGURED school week) is today?
// Verbatim from WeekColumns/WeeklyGrid: SSR-safe (initial null so the server
// HTML carries no emphasis), a 60s interval migrates the emphasis at midnight,
// and setState with the SAME index bails out of re-rendering.
function useTodayColumnIndex(
  schoolWeekDays: readonly Weekday[],
): number | null {
  const [idx, setIdx] = useState<number | null>(null);
  useEffect(() => {
    const sync = (): void => {
      setIdx(todayColumnIndex(new Date(), schoolWeekDays));
    };
    sync();
    const id = window.setInterval(sync, 60_000);
    return () => window.clearInterval(id);
  }, [schoolWeekDays]);
  return idx;
}

export function WeekC(): ReactNode {
  const labels = useLabels();
  const {
    week,
    currentWeek,
    currentWeekBasis,
    search,
    filters,
    selectedLessonId,
    setSelectedLessonId,
  } = useAppState();
  const { lessons, subjects, addLesson, activeGradeId } = usePlanner();
  const openLessonEditor = useContext(OpenLessonEditorContext);
  // Shared with the page-header Expand-all control and the other two Week
  // canvases — see lib/week-expansion.ts.
  const {
    isExpanded,
    toggle: toggleExpanded,
    collapse,
    publishVisible,
  } = useWeekExpansion();
  const nowMin = useNowMin();

  // ── Sync: collapse a card when its selection is cleared externally ────────
  // WeeklyShell's document-level Esc handler clears `selectedLessonId`. Before
  // the panel was removed that closed the detail surface; now the EXPANDED
  // CARD is the detail surface, so Esc has to close that instead — otherwise
  // the ring and the URL clear while the body stays open, and the key that is
  // supposed to close things closes nothing the teacher can see.
  //
  // WeekColumns has carried this effect all along; WeekA and WeekC did not,
  // because they had nothing to collapse. Added here so all three canvases
  // agree (Codex gate, Medium).
  //
  // Guarded on the set→null TRANSITION, and `collapse` is a no-op on a card
  // that is already shut, so a card opened via "Expand all" and never selected
  // is not closed by someone else's Esc.
  const prevSelectedRef = useRef<string | null>(selectedLessonId);
  useEffect(() => {
    const prev = prevSelectedRef.current;
    prevSelectedRef.current = selectedLessonId;
    if (selectedLessonId === null && prev !== null) collapse(prev);
  }, [selectedLessonId, collapse]);


  // ── Configured school week — the ONE ordered-week contract ────────────────
  const weekdays = useOrderedWeekdays();
  const DAY_COUNT = weekdays.length;

  // ── Per-teacher subject-row order (mirrors WeeklyGrid) ────────────────────
  // The 8 subjects + colors are locked team-wide; only the DISPLAY order of the
  // lanes is a personal preference. useSubjectOrder reconciles a stale save
  // against the live catalog so a subject is never dropped or invented.
  const catalogOrder = useMemo(() => subjects.map((s) => s.id), [subjects]);
  const { order: subjectOrder } = useSubjectOrder({
    catalogOrder,
    scopeKey: activeGradeId,
  });
  const orderedSubjects = useMemo<Subject[]>(() => {
    const byId = new Map(subjects.map((s) => [s.id, s] as const));
    const out: Subject[] = [];
    for (const id of subjectOrder) {
      const s = byId.get(id);
      if (s) out.push(s);
    }
    // Safety net — append any catalog subject the saved order somehow missed.
    for (const s of subjects) {
      if (!subjectOrder.includes(s.id)) out.push(s);
    }
    return out;
  }, [subjects, subjectOrder]);

  // ── Holidays for the active week ──────────────────────────────────────────
  const holidaysByDay = useHolidaysByDay(week, DAY_COUNT);

  // ── Today emphasis ────────────────────────────────────────────────────────
  // Only when the visible week IS the week that actually contains today AND
  // today is a configured, non-holiday school day (a holiday carries
  // orientation instead). See isTodayEmphasisWeek for the clamped-basis rule.
  const schoolWeekTokens = useMemo(
    () => weekdays.map((d) => d.token),
    [weekdays],
  );
  const todayIdx = useTodayColumnIndex(schoolWeekTokens);
  const emphasizedTodayIdx =
    isTodayEmphasisWeek(week, currentWeek, currentWeekBasis) &&
    todayIdx !== null &&
    !holidaysByDay.has(todayIdx)
      ? todayIdx
      : null;

  // ── Search + filter predicate ─────────────────────────────────────────────
  // Same axes as WeeklyGrid/WeekColumns; each is a no-op when its array is empty.
  const lessonMatchesQuery = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (lesson: Lesson): boolean => {
      if (q) {
        const hay =
          `${lesson.title} ${lesson.preview} ${lesson.directions}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (
        filters.subjects.length > 0 &&
        !filters.subjects.includes(lesson.subject)
      )
        return false;
      if (filters.units.length > 0 && !filters.units.includes(lesson.unit))
        return false;
      if (
        filters.statuses.length > 0 &&
        !filters.statuses.includes(lesson.status)
      )
        return false;
      if (filters.standards.length > 0) {
        const hasStandard = filters.standards.some((code) =>
          lesson.standards.includes(code),
        );
        if (!hasStandard) return false;
      }
      return true;
    };
  }, [search, filters]);

  // ── byCell — visible lessons bucketed by subject × day ────────────────────
  // Archived lessons are filtered out here (the lib/types "views filter
  // archived" contract, same as WeekColumns).
  const byCell = useMemo(() => {
    const buckets: Record<string, Lesson[][]> = {};
    for (const s of subjects) {
      buckets[s.id] = Array.from({ length: DAY_COUNT }, () => []);
    }
    for (const lesson of lessons) {
      if (lesson.archived === true) continue;
      if (lesson.week !== week) continue;
      if (lesson.day < 0 || lesson.day >= DAY_COUNT) continue;
      if (!lessonMatchesQuery(lesson)) continue;
      buckets[lesson.subject]?.[lesson.day].push(lesson);
    }
    return buckets;
  }, [lessons, week, DAY_COUNT, subjects, lessonMatchesQuery]);

  // ── Publish what "all" means for the header's Expand-all control ──────────
  // Same contract as WeekColumns and WeekA. The cleanup is load-bearing: this
  // canvas is swapped out for List / Schedule / the Edit board, none of which
  // expand anything, and a stale list would leave the header offering an
  // Expand-all that does nothing visible.
  // `byCell` is subject → day → lessons, so this flattens two levels rather
  // than one (WeekColumns and WeekA bucket by day only).
  const visibleLessonIds = useMemo(
    () =>
      Object.values(byCell)
        .flat(2)
        .map((l) => l.id),
    [byCell],
  );
  useEffect(() => {
    publishVisible(visibleLessonIds);
    return () => publishVisible([]);
  }, [visibleLessonIds, publishVisible]);

  // ── Selection / expansion / open ──────────────────────────────────────────
  // A click now EXPANDS THE TILE IN PLACE. It used to only select, because
  // selecting was how the resources RightRail opened; /weekly has no right
  // panel any more, so a select that expanded nothing would leave a click with
  // no visible result. `selectedLessonId` is still written — the selected ring
  // and WeeklyShell's `?lesson=` URL mirror both read it.
  //
  // THE DOUBLE-FIRE HAZARD this replaces an idempotent handler with a toggle
  // over: the tile div's onClick and the <SelectTitle> button's onClick BOTH
  // reach this for a single click on the title, because SelectTitle does not
  // stop propagation (components/planner-v2/atoms.tsx). Idempotent select
  // survived that; a toggle called twice cancels itself and the tile never
  // opens. The guard is at the tile's onClick, which now ignores clicks from
  // an interactive child via the same `fromInteractive` helper the
  // double-click handler beside it already uses. Verbatim with WeekA.
  const handleSelect = useCallback(
    (lessonId: string): void => {
      // Collapsing also RELEASES the selection, so a shut card does not keep
      // the selected ring (and `?lesson=` in the URL) pointing at a lesson the
      // teacher just closed. Verbatim with WeekColumns' handler — the three
      // canvases must not disagree about what a click leaves behind.
      if (isExpanded(lessonId)) {
        if (selectedLessonId === lessonId) setSelectedLessonId(null);
      } else {
        setSelectedLessonId(lessonId);
      }
      toggleExpanded(lessonId);
    },
    [isExpanded, selectedLessonId, setSelectedLessonId, toggleExpanded],
  );

  // Double-click OPENS the full lesson editor (the shell's canonical open); if
  // this frame is ever rendered outside <WeeklyShell> the context is null and
  // we fall back to selecting (opening the resources panel).
  const handleOpen = useCallback(
    (lessonId: string): void => {
      if (openLessonEditor) openLessonEditor(lessonId);
      else setSelectedLessonId(lessonId);
    },
    [openLessonEditor, setSelectedLessonId],
  );

  // ── Quick-add (one-click blank lesson) ────────────────────────────────────
  // Scoped PER empty cell: `addingCell` disables only the cell being added to
  // and `errorCell`/`errorMsg` surface a failure only in that cell's menu (a
  // single global flag would busy/erroring EVERY empty cell at once). Adapted
  // from DailyView.handleQuickAddLesson — but the subject is known exactly (the
  // empty cell's row), so no inference is needed. On success the new lesson is
  // selected so its detail panel opens.
  const [addingCell, setAddingCell] = useState<string | null>(null);
  const [errorCell, setErrorCell] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Synchronous in-flight latch — `addingCell` is React STATE, so two clicks
  // dispatched in the same tick both read the stale `null` and each fire a
  // create (double-create race). This ref flips synchronously, before React
  // re-renders, so the second click is rejected immediately.
  const addingRef = useRef(false);
  useEffect(() => {
    return () => {
      if (errorTimerRef.current !== null) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const handleQuickAdd = useCallback(
    async (subjectId: SubjectId, day: number): Promise<void> => {
      const key = `${subjectId}:${day}`;
      if (addingRef.current) return; // synchronous guard — never double-create
      addingRef.current = true;
      setAddingCell(key);
      if (errorTimerRef.current !== null) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
      setErrorCell(null);
      setErrorMsg(null);
      try {
        const created = await addLesson({
          subject: subjectId,
          week,
          day,
          title: "New lesson",
        });
        if (created) {
          setSelectedLessonId(created.id);
        } else {
          setErrorCell(key);
          setErrorMsg(
            "Couldn’t add the lesson — check your connection and try again.",
          );
          errorTimerRef.current = setTimeout(() => {
            errorTimerRef.current = null;
            setErrorCell(null);
            setErrorMsg(null);
          }, 6000);
        }
      } finally {
        addingRef.current = false;
        setAddingCell(null);
      }
    },
    [addLesson, week, setSelectedLessonId],
  );

  // ── Add non-instructional event ───────────────────────────────────────────
  // The empty-cell menu's second row opens the shared AddEventForm. We carry
  // the configured weekday label (the mock WEEK_DAYS positional fallback inside
  // AddEventForm is wrong for non-Sun–Thu weeks) AND an anchor point so the
  // popover opens beside the triggering cell instead of Daily's icon-rail
  // default (which sits at x≈64, overlapping the weekly sidebar).
  const [addEvent, setAddEvent] = useState<{
    day: number;
    label: string;
    anchor: { x: number; y: number } | null;
  } | null>(null);
  // The triggering cell's live anchor point (its bottom-left), captured on any
  // click inside the cell — including a keyboard Enter on the "+", which
  // synthesizes a click. Using the cell RECT (not pointer coords) means the
  // anchor works for keyboard too and reflects the cell's current scrolled
  // position; onAddEvent itself carries no event to read.
  const addAnchorRef = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className={styles.page}
      title="Your week by subject — each row is a subject, each column a school day, and every tile is that subject's lesson coloured by subject. Click a tile to open it in the resources panel; double-click to edit it."
    >
      <div className={styles.scroll}>
        <div
          className={styles.grid}
          role="group"
          aria-label={`Weekly plan by subject, ${labels.week.toLowerCase()} ${week}`}
          style={{ "--day-count": DAY_COUNT } as CSSProperties}
        >
          {/* Corner + day headers. EVERY grid item below is DEFINITELY placed
              (explicit gridColumn AND gridRow). This is load-bearing: the
              holiday wash overlay is a definitely-placed grid item spanning its
              column's rows, and CSS grid auto-placement flows AROUND
              definitely-placed items — so any auto-placed cell would be shoved
              out of the holiday column (horizontally, then wrapping into the
              label gutter). Pinning row+col on the corner, headers, lanes, and
              cells bypasses auto-placement entirely; the wash simply overlaps
              its column, harmlessly, behind the tiles. */}
          <div
            className={styles.corner}
            style={{ gridColumn: 1, gridRow: 1 }}
            aria-hidden="true"
          />
          {weekdays.map(({ token, index: dayIdx, label, longLabel }) => {
            const holiday = holidaysByDay.get(dayIdx) ?? null;
            const isToday = dayIdx === emphasizedTodayIdx;
            return (
              // Presentational header — NOT role="columnheader": this layout is
              // a role="group" of tiles, not a role="grid" with rows, so a
              // columnheader here would be an orphaned/invalid ARIA context
              // (the exact §4a finding WeekColumns fixed). The day NAME is read
              // in flow; the short date + Today marker are aria-hidden
              // orientation, and the holiday pill carries its own label.
              <div
                key={token}
                className={`${styles.dayHead} ${
                  isToday ? styles.dayHeadToday : ""
                } ${holiday ? styles.dayHeadHoliday : ""}`}
                style={{ gridColumn: dayIdx + 2, gridRow: 1 }}
              >
                <span className={styles.dayHeadName}>
                  {longLabel}
                  {isToday ? <span className={styles.srOnly}> (today)</span> : null}
                </span>
                <span aria-hidden="true" className={styles.dayHeadDate}>
                  {label}
                </span>
                {holiday && (
                  <Tooltip
                    content={`This day is marked as a holiday (${holiday.name}) — your team's curriculum says no school on this date.`}
                    side="bottom"
                  >
                    <span
                      className={styles.dayHeadHolidayPill}
                      aria-label={`Holiday: ${holiday.name}`}
                    >
                      {holiday.name}
                    </span>
                  </Tooltip>
                )}
              </div>
            );
          })}

          {/* Holiday column washes — one striped overlay per holiday day,
              placed across every subject row of that column (grid placement,
              pointer-events:none, same trick as WeeklyGrid.holidayColumn). */}
          {Array.from(holidaysByDay.entries()).map(([dayIdx, holiday]) => (
            <div
              key={`holiday-col-${dayIdx}`}
              className={styles.holidayColumn}
              style={{
                // Subject lane is column 1; day dayIdx sits in column dayIdx+2.
                gridColumn: dayIdx + 2,
                // Skip the header row (row 1); span every subject row.
                gridRow: `2 / ${orderedSubjects.length + 2}`,
              }}
              aria-hidden="true"
              title={`Holiday — no instruction on this day (${holiday.name})`}
            />
          ))}

          {/* Subject lanes. */}
          {orderedSubjects.map((subject, subjectIdx) => (
            <Fragment key={subject.id}>
              <div
                className={`${styles.subjLane} cp-subj ${subject.cls}`}
                style={{ gridColumn: 1, gridRow: subjectIdx + 2 }}
              >
                <SubjGlyph subject={subject} size={30} radius={9} />
                <span className={styles.subjName}>{subject.name}</span>
              </div>
              {weekdays.map(({ token, index: dayIdx, longLabel }) => {
                const cellLessons = byCell[subject.id]?.[dayIdx] ?? [];
                const isTodayCol = dayIdx === emphasizedTodayIdx;
                const cellKey = `${subject.id}:${dayIdx}`;
                const cellPlacement: CSSProperties = {
                  gridColumn: dayIdx + 2,
                  gridRow: subjectIdx + 2,
                };
                if (cellLessons.length === 0) {
                  return (
                    <div
                      key={token}
                      className={styles.cell}
                      style={cellPlacement}
                      // Capture this cell's rect so the add-event popover anchors
                      // beside it (onAddEvent fires from inside the menu with no
                      // event of its own). onClickCapture — NOT pointer events —
                      // so a keyboard Enter on the "+"/menu row (which fires a
                      // synthesized click) anchors correctly too; otherwise
                      // keyboard users fell back to the Daily left:64px default,
                      // which overlaps the sidebar (bug 4). Capture phase runs
                      // before the menu row's own click, so the ref is fresh.
                      onClickCapture={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        addAnchorRef.current = { x: r.left, y: r.bottom };
                      }}
                    >
                      <div className={styles.cellEmpty}>
                        <span className={styles.emptyLabel}>
                          No {labels.lesson.toLowerCase()}
                        </span>
                        <AddLessonMenu
                          triggerClassName={styles.addBtn}
                          triggerContent="+"
                          tooltipId="weekc-add-lesson"
                          // Lesson only — same reason as WeekA:486. The event
                          // half opens a form whose submit can only report
                          // "Events can’t be saved yet"
                          // (components/daily/AddEventForm.tsx:182-199).
                          tooltipContent={`Add a ${subject.name} ${labels.lesson.toLowerCase()} to this day`}
                          align="center"
                          onQuickAdd={() =>
                            void handleQuickAdd(subject.id, dayIdx)
                          }
                          onAddEvent={() =>
                            setAddEvent({
                              day: dayIdx,
                              label: longLabel,
                              anchor: addAnchorRef.current,
                            })
                          }
                          quickAdding={addingCell === cellKey}
                          quickAddError={errorCell === cellKey ? errorMsg : null}
                        />
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={token} className={styles.cell} style={cellPlacement}>
                    {cellLessons.map((lesson) => {
                      const status = deriveDayStatus(lesson, nowMin, isTodayCol);
                      const start = lessonTime(lesson)
                        .split(/[–—-]/)[0]
                        .trim();
                      const selected = selectedLessonId === lesson.id;
                      const cls = [
                        styles.tile,
                        "cp-subj",
                        subject.cls,
                        status === "done" ? styles.tileDone : "",
                        // now-ring ONLY when this column is today (the isToday
                        // arg to deriveDayStatus already gates status to "now"
                        // only on today, so this is belt-and-suspenders).
                        status === "now" && isTodayCol ? styles.tileNow : "",
                        selected ? styles.tileSelected : "",
                        lesson.modified ? styles.tileModified : "",
                        isExpanded(lesson.id) ? styles.tileExpanded : "",
                      ]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <div
                          key={lesson.id}
                          data-planner-item={`lesson:${lesson.id}`}
                          className={cls}
                          // Guarded: without `fromInteractive` a click on the
                          // <SelectTitle> button would ALSO bubble here and
                          // toggle the tile a second time, shutting it in the
                          // same tick it opened (see handleSelect's note).
                          onClick={(e: MouseEvent<HTMLDivElement>) => {
                            if (!fromInteractive(e)) handleSelect(lesson.id);
                          }}
                          onDoubleClick={(e: MouseEvent<HTMLDivElement>) => {
                            // dblclick fires even when both clicks land on the
                            // nested SelectTitle button — guard so it doesn't
                            // open on a title interaction (fromInteractive).
                            if (!fromInteractive(e)) handleOpen(lesson.id);
                          }}
                        >
                          <SelectTitle
                            selected={selected}
                            onSelect={() => handleSelect(lesson.id)}
                            titleClassName={styles.tileTitle}
                          >
                            {stripHtml(lesson.title)}
                          </SelectTitle>
                          {/* The handoff's Plan/Teach/Post/Planner popover —
                              see WeekA for the split of responsibility with
                              the body-click expand. */}
                          <LessonKebabMenu
                            lessonId={lesson.id}
                            lessonTitle={stripHtml(lesson.title)}
                            subjectClass={subject.cls}
                            onPlan={openLessonEditor}
                          />
                          {start && (
                            <span className={styles.tileTime}>{start}</span>
                          )}
                          {/* Which unit this lesson belongs to, and the way
                              into it. Genuinely NEW on this canvas — the
                              subject lane already answers "what subject?", but
                              nothing here ever answered "what unit?". Renders
                              nothing when the unit can't be resolved. */}
                          <UnitChip
                            subjectId={lesson.subject}
                            unit={lesson.unit}
                            className={styles.tileUnit}
                          />
                          {/* ── Expanded body ───────────────────────────
                              What the right panel used to show, shown where
                              the lesson is. Only fields that carry content
                              render — a tile expanding to three empty labels
                              teaches nothing and makes the lane taller for no
                              reason. Anything deeper stays behind the full
                              editor: this is a reading affordance on a week
                              overview, not a second editor. Verbatim with
                              WeekA so the two frames read the same. */}
                          {isExpanded(lesson.id) && (
                            <div className={styles.tileBody}>
                              {lesson.objective && (
                                <p className={styles.tileBodyRow}>
                                  <span className={styles.tileBodyLabel}>
                                    Objective
                                  </span>
                                  {stripHtml(lesson.objective)}
                                </p>
                              )}
                              {lesson.preview && (
                                <p className={styles.tileBodyRow}>
                                  <span className={styles.tileBodyLabel}>
                                    Preview
                                  </span>
                                  {stripHtml(lesson.preview)}
                                </p>
                              )}
                              {lesson.notes && (
                                <p className={styles.tileBodyRow}>
                                  <span className={styles.tileBodyLabel}>
                                    Notes
                                  </span>
                                  {stripHtml(lesson.notes)}
                                </p>
                              )}
                              {!lesson.objective &&
                                !lesson.preview &&
                                !lesson.notes && (
                                  <p className={styles.tileBodyEmpty}>
                                    Nothing written yet — double-click to plan
                                    this lesson.
                                  </p>
                                )}
                            </div>
                          )}
                          {(lesson.moved || lesson.modified) && (
                            <div className={styles.tileCues}>
                              <ForkCues lesson={lesson} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Non-instructional-event popover — fixed-position, rendered at the page
          root so it escapes the scroll container's overflow. Anchored beside
          the triggering cell (weekly frames), with the configured weekday
          label passed through so the header reads correctly on any school week. */}
      <AddEventForm
        open={addEvent !== null}
        onClose={() => setAddEvent(null)}
        day={addEvent?.day ?? 0}
        dayLabel={addEvent?.label}
        anchor={addEvent?.anchor ?? null}
      />
    </div>
  );
}
