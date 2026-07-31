"use client";

// PlanTimeline.tsx — the Plan tab's landing surface.
//
// The 7.21 handoff's Plan landing is `PHUnits.Timeline` (`ph-app.jsx:315`):
// subject lanes over a date axis, unit bands, per-lesson dots, holiday and
// week rules, and a today line. What shipped instead was `source-home/hub.jsx`
// — a surface 7.21 mounts only behind a dead `libOpen` flag (`app.jsx:470,703`)
// and its own README lists as retired. See docs/audits/2026-07-31-plan-tab.md.
//
// ── TWO PLACES THIS DELIBERATELY DEPARTS FROM THE HANDOFF ─────────────────
//
// 1. EMPTY / LOADING / ERROR. The prototype's Timeline derives its lanes from
//    a synchronous `PW.build()` (`ph-units.jsx:323`) and has no loading and no
//    error branch anywhere. Ported faithfully, an unplanned year, a
//    still-hydrating store (11–16s over Supabase) and a failed fetch would all
//    render the same empty grid. This surface routes every one of those through
//    <PlannerEmpty>, which branches on `usePlannerDataState()` — the pattern
//    already shipped two folders away in browse/LessonBrowse.tsx:26,82.
//
// 2. FORK STATE. The handoff's dot class list is exhaustively
//    `st-<status> missed thin drag dim` (`ph-units.jsx:609-611`) and its band's
//    is `dim sel dragging` (`:589`) — nothing carries "personally modified" or
//    "personally moved". CLAUDE.md §2 makes three-tier differentiation a
//    product contract that holds everywhere, and the unit workspace already
//    honours it (`unit-tabs/LessonsTab.tsx:44`). CLAUDE.md outranks the
//    handoff, so every dot carries its fork tier — through a RING, not a dashed
//    border, because dashed is already spoken for by "needs work"
//    (`ph-units.css:61`).
//
// ── AUTHORING, AND THE TWO THINGS THAT CONSTRAIN IT ──────────────────────
// A band can be dragged (or Shift+arrowed) to re-pace its unit's WEEK RANGE,
// and its right edge to change its length. Two constraints shape that, and
// both are worth stating where the wiring lives:
//
//   • GRANULARITY IS WEEK. `units.start_week` / `end_week` exist; the
//     day-level columns the prototype drags against are deferred by migration.
//     A drag moves the unit's declared weeks and does NOT re-date its lessons
//     — see the ruling in lib/plan-timeline/drag.ts, and `lessonsOutside`,
//     which keeps the resulting divergence visible on the band.
//   • UNITS ARE TEAM CONTENT. There is one shared `units` row and no personal
//     fork, so `editUnitFields` refuses the write outright in Personal mode
//     (planner-store.tsx:3752). Authoring is therefore disabled — visibly, with
//     the reason on every band — rather than offered and then silently failing.
//
// UNDO IS NOT THE STORE'S UNDO, and that is a real limitation rather than a
// choice: units live in the CATALOG, which planner-store.tsx:1371-1375 makes an
// explicit SIBLING of the undo history ("editing a lesson must not put the
// subject list on the undo stack"), and `editUnitFields` is documented
// NON-undoable at :2352. So the 50-step history cannot carry a unit
// reschedule. What this offers instead is an INVERSE-PATCH undo on the toast,
// guarded against staleness — see `rescheduleUnit`.
//
// ── WHAT IS STILL NOT BUILT ──────────────────────────────────────────────
// Lesson-dot drag (a lesson's date is per-lesson forkable content), paint-a-new
// unit / subject on an empty track, the Units|Lessons + Timeline|List toggle
// pairs, the "N missed" chip, and the Unit/Lesson Library + Needs Attention
// drawer.
//
// ── WHY THIS OPENS DOCS RATHER THAN THE GLOBAL WORKSPACE ─────────────────
// It routes through the hub's own `onOpenDoc`, exactly as the browse pickers
// do, so a band opens a unit tab and a dot opens a lesson tab. It does NOT call
// `openUnitWorkspace()` — HubDocHost.tsx:54-57 records that nothing on /planner
// may, because the hub's explorer is invisible to workspace-state's
// single-renderer election.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { usePlanner } from "@/lib/planner-store";
import { useAppState } from "@/lib/app-state";
import { useUndoToastOptional } from "@/lib/undo-toast";
import { useAcademicYear } from "@/lib/use-academic-year";
import { useSchoolWeek, type Weekday } from "@/lib/use-school-week";
import { useHolidays } from "@/lib/use-holidays";
import { todayColumnIndex } from "@/lib/now-anchor";
import { allYearWeeksFor, buildSchoolDays } from "@/lib/year-calendar";
import {
  buildTimelineAxis,
  buildTimelineLanes,
  lessonsOutsideRange,
  monthBands,
  todayLineSlot,
  weekRangeEquals,
  weekSlotRange,
  weeksLabel,
} from "@/lib/plan-timeline";
import type { NowRef, WeekRange } from "@/lib/plan-timeline";
import { PlannerEmpty } from "@/components/ui";
import { stripHtml } from "@/lib/html-text";
import type { Lesson, SubjectId } from "@/lib/types";
import {
  buildLessonLibrary,
  buildNeedsAttention,
  buildUnitLibrary,
  type LibraryGroup,
  type LibrarySort,
  type LibraryStatusFilter,
} from "@/lib/plan-timeline/library";
import { ToggleGroup } from "@/components/ui";
import { queryMatches, type HubBrowseProps } from "../browse/browse-data";
import { TimelineCanvas } from "./TimelineCanvas";
import { TimelineDrawer } from "./TimelineDrawer";
import { TimelineLegend } from "./TimelineLegend";
import { TimelineList } from "./TimelineList";
import { TimelineZoom } from "./TimelineZoom";
import type { BandDragKind } from "./use-band-drag";
import styles from "./timeline.module.css";

/** `useSchoolWeek` speaks lowercase tokens; `buildSchoolDays` wants the
 *  two-letter labels it prints in the day row. Same map as
 *  components/year/ProgressionView.tsx:69-77. */
const WEEKDAY_TO_SHORT: Readonly<Record<Weekday, string>> = {
  sun: "Su",
  mon: "Mo",
  tue: "Tu",
  wed: "We",
  thu: "Th",
  fri: "Fr",
  sat: "Sa",
};

export function PlanTimeline({ query, onOpenDoc }: HubBrowseProps): ReactNode {
  const { lessons, units, subjects, getSections, editUnitFields } =
    usePlanner();
  const { currentWeek, currentWeekBasis, editMode } = useAppState();
  // Optional: the hub renders inside <UndoToastProvider> today
  // (app/(planner)/layout.tsx:152), but a surface that silently throws when it
  // does not is a surface that cannot be reused. Without a provider the
  // reschedule still commits — it just loses its undo affordance, and
  // `rescheduleUnit` says so rather than pretending.
  const toast = useUndoToastOptional();
  const { start: yearStart, end: yearEnd } = useAcademicYear();
  const { days: schoolWeekDays } = useSchoolWeek();
  const { holidays } = useHolidays();

  // "Today" is read POST-MOUNT only. `new Date()` during render would make the
  // server's today and the browser's today two different answers to the same
  // question, and the SSR HTML would disagree with the first client paint. Null
  // until then, which every downstream consumer already treats as "today has no
  // known position" rather than as a default.
  const [todayColumn, setTodayColumn] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  // Zoom: null means "whatever the stylesheet's default is for this pointer and
  // viewport", which is NOT a fixed number — the coarse-pointer query widens it
  // (see timeline.module.css). Kept as session state rather than persisted: a
  // stored value would have to be applied post-mount to stay SSR-safe, and a
  // canvas this dense visibly re-lays-out when it jumps a frame after paint.
  const [colWidth, setColWidth] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // The handoff's two switches (`ph-units.jsx:479-490`). They are ORTHOGONAL,
  // and treating them as one four-way control was the temptation worth
  // resisting: the LENS says which objects the surface is about (units or
  // lessons) and the MODE says how they are drawn (on the axis or as a list).
  // All four combinations are meaningful, and a teacher who has chosen "show me
  // lessons" should keep that choice when they flip to the list.
  const [lens, setLens] = useState<"units" | "lessons">("units");
  const [mode, setMode] = useState<"timeline" | "list">("timeline");
  const [group, setGroup] = useState<LibraryGroup>("subject");
  const [status, setStatus] = useState<LibraryStatusFilter>("all");
  const [sort, setSort] = useState<LibrarySort>("schedule");
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    setTodayColumn(todayColumnIndex(new Date(), schoolWeekDays));
    setMounted(true);
  }, [schoolWeekDays]);

  const schoolWeekLen = schoolWeekDays.length;

  const axis = useMemo(() => {
    const shortWeek = schoolWeekDays.map((d) => WEEKDAY_TO_SHORT[d]);
    const weeks = allYearWeeksFor(yearStart, yearEnd).length;
    return buildTimelineAxis(
      buildSchoolDays(yearStart, weeks, shortWeek),
      holidays,
      schoolWeekLen,
    );
  }, [yearStart, yearEnd, schoolWeekDays, schoolWeekLen, holidays]);

  const months = useMemo(() => monthBands(axis), [axis]);

  const todaySlot = useMemo(
    () =>
      mounted
        ? todayLineSlot({
            currentWeek,
            currentWeekBasis,
            todayColumn,
            schoolWeekLen,
            axisLength: axis.length,
          })
        : null,
    [mounted, currentWeek, currentWeekBasis, todayColumn, schoolWeekLen, axis.length],
  );

  // Section resources are the canonical half and are not on the Lesson shape,
  // so a lesson whose resources all live on its sections would otherwise be
  // counted as having none — the same correction unit-workspace-derive.ts:166-179
  // documents and UnitExplorer.tsx:269-274 applies.
  const hasAnyResource = useMemo(
    () =>
      (l: Lesson): boolean =>
        l.resources.length > 0 ||
        getSections(l.id).some((s) => s.resources.length > 0),
    [getSections],
  );

  const now: NowRef | null = useMemo(
    () =>
      // Not merely "is today a school day" — `currentWeekBasis` is what says
      // whether `currentWeek` is a real derivation or a clamp. Anything but
      // "in-range" means the school year has not started, has ended, or is
      // unconfigured, and a past/future verdict drawn against a clamp would
      // mark lessons missed that are not.
      mounted && currentWeekBasis === "in-range"
        ? { currentWeek, todayColumn, schoolWeekLen }
        : null,
    [mounted, currentWeekBasis, currentWeek, todayColumn, schoolWeekLen],
  );

  // A lesson parked on a holiday column could not have been taught, so it must
  // never be called "missed" — see dots.ts:dotStateFor. The axis already knows
  // which slots are holidays; this hands that knowledge to the derivation.
  const isHolidaySlot = useMemo(() => {
    const holidaySlots = new Set<number>();
    for (const d of axis) if (d.holiday) holidaySlots.add(d.slot);
    return (slot: number): boolean => holidaySlots.has(slot);
  }, [axis]);

  const lanes = useMemo(
    () =>
      buildTimelineLanes({
        subjects,
        units,
        lessons,
        schoolWeekLen,
        axisLength: axis.length,
        now,
        todaySlot,
        hasResources: hasAnyResource,
        isHolidaySlot,
      }),
    [
      subjects,
      units,
      lessons,
      schoolWeekLen,
      axis.length,
      now,
      todaySlot,
      hasAnyResource,
      isHolidaySlot,
    ],
  );

  // Gated on `mounted` for the SAME reason as `todaySlot`: `currentWeek` is
  // date-derived, so across a client/server date boundary the server can
  // highlight one academic week and the browser another. Painting it only after
  // mount keeps the server HTML and the first client paint identical.
  const currentWeekRange = useMemo(
    () =>
      mounted && currentWeekBasis === "in-range"
        ? weekSlotRange(currentWeek, schoolWeekLen, axis.length)
        : null,
    [mounted, currentWeekBasis, currentWeek, schoolWeekLen, axis.length],
  );

  // Search DIMS rather than filters (`ph-units.jsx:594,607`): a year with
  // non-matches removed loses the shape that makes it a year.
  const matchesUnit = useMemo(
    () => (unitId: string, name: string) =>
      queryMatches(query, name, unitId),
    [query],
  );
  const matchesLesson = useMemo(
    () => (title: string, unitId: string) => queryMatches(query, title, unitId),
    [query],
  );

  // ── The list + drawer bodies ──────────────────────────────────────────────
  // Same inputs as the lanes, same predicates. The list and the drawer are
  // other VIEWS of the timeline, not other opinions about it.
  const libraryInput = useMemo(
    () => ({
      subjects,
      units,
      lessons,
      schoolWeekLen,
      axisLength: axis.length,
      now,
      hasResources: hasAnyResource,
      isHolidaySlot,
    }),
    [
      subjects,
      units,
      lessons,
      schoolWeekLen,
      axis.length,
      now,
      hasAnyResource,
      isHolidaySlot,
    ],
  );

  // The hub's live search FILTERS the list and the drawer, where it DIMS the
  // canvas. Different surfaces, different right answer: a year with non-matches
  // removed loses the shape that makes it a year, but a list is a list.
  const libraryLessons = useMemo(
    () =>
      buildLessonLibrary(libraryInput).filter((l) =>
        queryMatches(query, l.title, l.unitName, l.subjectName),
      ),
    [libraryInput, query],
  );
  const libraryUnits = useMemo(
    () =>
      buildUnitLibrary(libraryInput).filter((u) =>
        queryMatches(query, u.name, u.subjectName),
      ),
    [libraryInput, query],
  );
  // NEEDS ATTENTION IS NOT FILTERED BY THE SEARCH. A count that shrank as a
  // teacher typed would report "2 need attention" for a plan with fourteen
  // problems in it, and the count is on the collapsed bar where nothing
  // explains the discrepancy.
  const attention = useMemo(() => {
    const all = buildLessonLibrary(libraryInput);
    return buildNeedsAttention(all, buildUnitLibrary(libraryInput));
  }, [libraryInput]);

  const subjectClass = useCallback(
    (id: SubjectId) => subjects.find((s) => s.id === id)?.cls ?? "",
    [subjects],
  );
  const subjectDisplayName = useCallback(
    (id: SubjectId) => subjects.find((s) => s.id === id)?.name ?? id,
    [subjects],
  );

  const openLessonById = useCallback(
    (lessonId: string, title?: string) => {
      const lesson = lessons.find((l) => l.id === lessonId);
      if (!lesson) return;
      onOpenDoc({
        kind: "lesson",
        id: lessonId,
        title: title ?? stripHtml(lesson.title) ?? "Lesson",
        sid: lesson.subject,
      });
    },
    [lessons, onOpenDoc],
  );
  const openUnitById = useCallback(
    (unitId: string, subject: SubjectId, name?: string) => {
      // Matched on BOTH: a unit slug is unique only WITHIN a subject, so
      // `find(u => u.id === unitId)` would open Math's "u1" from a Reading row.
      const unit = units.find((u) => u.id === unitId && u.subject === subject);
      if (!unit) return;
      onOpenDoc({
        kind: "unit",
        id: unitId,
        title: name ?? unit.name,
        sid: subject,
      });
    },
    [units, onOpenDoc],
  );

  // ── Authoring ─────────────────────────────────────────────────────────────
  // Units are TEAM content with one shared row and no personal fork, so the
  // store refuses the write outright when the teacher is not in Team Curriculum
  // mode (planner-store.tsx:3752). Offering the gesture anyway and letting it
  // fail silently is the worst of the three options; disabling it and SAYING SO
  // on the band is the honest one.
  const dragEnabled = editMode === "master";
  const dragBlockedReason = dragEnabled
    ? null
    : "A unit's weeks are shared with the whole team, so re-planning one needs the Team Curriculum mode — switch with the toggle in the top bar.";

  const unitsRef = useRef(units);
  unitsRef.current = units;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  /**
   * Write a unit's new week range, then offer a guarded inverse-patch undo.
   *
   * This does NOT go through the store's 50-step history, and cannot: units
   * live in the catalog, which is an explicit SIBLING of the undo stacks
   * (planner-store.tsx:1371-1375), and `editUnitFields` is documented
   * non-undoable (:2352). Putting them on the shared stack would mean a
   * teacher's Ctrl+Z after a lesson edit could rewind a team-wide schedule
   * change instead — the reason the split exists. The inverse patch is
   * therefore offered on the toast and STALE-GUARDED at the moment it fires:
   * if the unit's range has moved since (a re-hydrate pulling in a teammate's
   * change is the way that happens), the undo is refused and says why rather
   * than reverting shared content to a schedule nobody is looking at.
   *
   * THE LIMIT OF THAT GUARD, stated rather than glossed: it compares against
   * the LOCAL catalog, so it catches a change this client has already seen. A
   * teammate's write that has not yet reached this client is invisible to it,
   * and the undo would revert that too. Closing that properly needs optimistic
   * concurrency on the row (a version column in the update predicate), which is
   * a migration and not this surface's to write. The exposure is bounded by the
   * toast's six-second life, and it is the same exposure every other unit write
   * in the app already carries — this one is merely the first to be honest
   * about it.
   */
  const rescheduleUnit = useCallback(
    (
      subject: SubjectId,
      unitId: string,
      next: WeekRange,
      kind: BandDragKind,
    ): void => {
      const all = unitsRef.current;
      const unit = all.find((u) => u.id === unitId && u.subject === subject);
      if (!unit) return;
      // THE STORE'S SEAM IS KEYED BY unitId ALONE — its reducer resolves the
      // target with `units.findIndex(u => u.id === action.unitId)`
      // (planner-store.tsx:1520), and a unit slug is unique only WITHIN a
      // subject. Under Supabase these ids are uuids and cannot collide; under
      // the mock they are slugs and can. Refusing a colliding write is the only
      // safe option available from here — re-scheduling a different subject's
      // unit is a silent, team-wide, wrong edit.
      if (all.find((u) => u.id === unitId) !== unit) {
        toastRef.current?.showUndoToast({
          message: `Could not re-plan ${unit.name} — another subject has a unit with the same id.`,
        });
        return;
      }

      const before: WeekRange | null =
        typeof unit.startWeek === "number" && typeof unit.endWeek === "number"
          ? { start: unit.startWeek, end: unit.endWeek }
          : null;
      if (before && weekRangeEquals(before, next)) return;

      const label = weeksLabel(next.start, next.end);
      const verb = kind === "resize" ? "now runs" : "moved to";
      const unitLessons = lessons.filter(
        (l) => l.subject === subject && l.unit === unitId,
      );
      const outside = lessonsOutsideRange(unitLessons, next);
      // The consequence, in the toast, with the number in it (audit B10). A
      // teacher cannot judge whether to undo from "Moved" alone.
      const consequence =
        outside > 0
          ? ` · ${outside} lesson${outside === 1 ? "" : "s"} still dated outside`
          : "";

      editUnitFields(
        unitId,
        // The two numbers ONLY. `Unit.weeks` is the display collapse, derived
        // by whichever source confirms the write — see the UnitPatch doc in
        // lib/planner/source.ts on why letting a caller supply it lets the two
        // paths disagree about the same write.
        { startWeek: next.start, endWeek: next.end },
        (ok) => {
          if (!ok) {
            toastRef.current?.showUndoToast({
              message: `Could not re-plan ${unit.name}. Your change was not saved.`,
            });
            return;
          }
          toastRef.current?.showUndoToast({
            message: `${unit.name} ${verb} ${label}${consequence}`,
            // No undo when the unit had NO stored week range before: the
            // columns are NOT NULL, so "back to having no weeks" is not a state
            // this patch can express. Offering an Undo that silently did
            // something else would be worse than offering none.
            onUndo: before
              ? () => {
                  const live = unitsRef.current.find(
                    (u) => u.id === unitId && u.subject === subject,
                  );
                  const now =
                    live &&
                    typeof live.startWeek === "number" &&
                    typeof live.endWeek === "number"
                      ? { start: live.startWeek, end: live.endWeek }
                      : null;
                  if (!weekRangeEquals(now, next)) {
                    toastRef.current?.showUndoToast({
                      message: `${unit.name} has changed since — not undone.`,
                    });
                    return;
                  }
                  editUnitFields(
                    unitId,
                    { startWeek: before.start, endWeek: before.end },
                    // The undo is a WRITE, and it can be refused exactly like
                    // the write it reverses (an RLS denial, a mode flip between
                    // the toast appearing and the click). Fire-and-forget would
                    // dismiss the toast and leave the teacher believing the
                    // move was undone when the unit still sits where the drag
                    // put it — a silent failure on the one control whose whole
                    // job is to be trustworthy.
                    (undone) => {
                      if (undone) return;
                      toastRef.current?.showUndoToast({
                        message: `Could not undo — ${unit.name} is still at ${label}.`,
                      });
                    },
                  );
                }
              : undefined,
          });
        },
      );
    },
    [editUnitFields, lessons],
  );

  if (axis.length === 0) {
    // Reachable only with an empty school week (every weekday deselected) or a
    // zero-length academic year. Named rather than shown as a blank canvas —
    // the fix is in Settings, and a teacher cannot guess that from an empty grid.
    return (
      <>
        <Head />
        <PlannerEmpty
          size="sm"
          heading="No school days configured."
          body="Set your school week and academic year in Settings, then the timeline can lay out your year."
        />
      </>
    );
  }

  if (lanes.length === 0) {
    // Delegated wholesale to <PlannerEmpty>: it distinguishes a hydrate in
    // flight (skeleton) from a failed hydrate (error copy) from a genuinely
    // empty plan. The prototype has no such branch and would paint an identical
    // empty grid for all three.
    return (
      <>
        <Head />
        <PlannerEmpty
          heading="Nothing on the timeline yet."
          body="Units appear here once they carry a week range or a dated lesson."
        />
      </>
    );
  }

  return (
    <>
      <Head />
      {/* `data-mounted` is a MEASUREMENT SEAM, and it earns its keep. Three of
          this canvas's marks — the today line, the current-week highlight, the
          "Now:" subtitle — exist only after the mount effect resolves where
          today is, and the hub's dev-mode hydrate runs 5–9s. A live probe that
          screenshots before that sees them missing and concludes they are
          broken; the first pass of scripts/probe-plan-timeline.mjs did exactly
          that, and reported "todayLine: 0" three runs running about a timeline
          that renders it correctly. An absence-assertion with no hydration gate
          FAILS OPEN. This attribute is that gate. */}
      <div
        className={styles.card}
        ref={cardRef}
        data-mounted={mounted || undefined}
        // The LENS as a data attribute rather than a prop threaded to every
        // mark: it changes only emphasis (which of bands / dots reads as
        // foreground), so it is presentation, and one attribute keeps the
        // whole cascade in one place instead of a `dim` flag on two components.
        data-lens={lens}
        // The zoom slider's value, resolved against the touch floor by the
        // stylesheet — never `--tl-col` directly, which would beat the
        // coarse-pointer override and let a teacher shrink their own targets
        // below the ≥44px contract. See timeline.module.css.
        style={
          colWidth === null
            ? undefined
            : ({ "--tl-col-user": `${colWidth}px` } as CSSProperties)
        }
      >
        <div className={styles.toolbar}>
          <ToggleGroup
            ariaLabel="What the plan shows"
            value={lens}
            onChange={(v) => setLens(v as "units" | "lessons")}
            options={[
              {
                value: "units",
                label: "Units",
                title: "Put the unit bars in front — the shape of the year.",
              },
              {
                value: "lessons",
                label: "Lessons",
                title:
                  "Put the individual lessons in front — what is planned, taught, or still thin.",
              },
            ]}
          />
          <ToggleGroup
            ariaLabel="How the plan is drawn"
            variant="prominent"
            value={mode}
            onChange={(v) => setMode(v as "timeline" | "list")}
            options={[
              {
                value: "timeline",
                label: "Timeline",
                title: "Draw the plan across the calendar year.",
              },
              {
                value: "list",
                label: "List",
                title:
                  "Read the same plan as a list you can group, filter and sort.",
              },
            ]}
          />
          {mode === "timeline" && (
            <>
              <p className={styles.hint}>
                {dragEnabled
                  ? "Click a unit bar to open its planner, or drag it to change the weeks it is planned for · click a lesson dot to plan it."
                  : "Click a unit bar to open its planner · click a lesson dot to plan it."}
              </p>
              <TimelineZoom
                value={colWidth}
                onChange={setColWidth}
                canvasRef={cardRef}
              />
            </>
          )}
          {lens === "lessons" && <TimelineLegend />}
        </div>

        {mode === "list" ? (
          <TimelineList
            lens={lens}
            lessons={libraryLessons}
            units={libraryUnits}
            group={group}
            onGroupChange={setGroup}
            status={status}
            onStatusChange={setStatus}
            sort={sort}
            onSortChange={setSort}
            compact={compact}
            onCompactChange={setCompact}
            subjectClass={subjectClass}
            onOpenLesson={openLessonById}
            onOpenUnit={(unitId, name, subject) =>
              openUnitById(unitId, subject, name)
            }
          />
        ) : (
        <TimelineCanvas
          axis={axis}
          months={months}
          lanes={lanes}
          schoolWeekLen={schoolWeekLen}
          dragEnabled={dragEnabled}
          dragBlockedReason={dragBlockedReason}
          onRescheduleUnit={rescheduleUnit}
          todaySlot={todaySlot}
          currentWeekRange={currentWeekRange}
          matchesUnit={matchesUnit}
          matchesLesson={matchesLesson}
          // MATCH ON BOTH, inside `openUnitById`. A unit slug is unique only
          // WITHIN a subject, so `units.find(u => u.id === unitId)` returns
          // whichever subject's unit comes first — clicking Reading's "u1"
          // band would open Math's "u1". Same collision PlannerHub.tsx:59-62
          // documents for doc-tab keys, and why the lane hands its subject
          // down.
          onOpenUnit={(unitId, name, subject) =>
            openUnitById(unitId, subject, name)
          }
          onOpenLesson={openLessonById}
        />
        )}

        {/* The library + triage panel (`ph-drawer.jsx`). Below the body in
            BOTH modes: it is the same catalogue whichever way the plan above
            it is drawn. */}
        <TimelineDrawer
          units={libraryUnits}
          attention={attention}
          subjectClass={subjectClass}
          subjectName={subjectDisplayName}
          onOpenLesson={(id) => openLessonById(id)}
          onOpenUnit={(id, subject) => openUnitById(id, subject)}
        />
      </div>
    </>
  );
}

function Head(): ReactNode {
  return (
    <div className={styles.pageHead}>
      <div className={styles.crumb}>Planner</div>
      <h1 className={styles.title}>Plan</h1>
      <p className={styles.sub}>Your whole year, subject by subject.</p>
    </div>
  );
}
