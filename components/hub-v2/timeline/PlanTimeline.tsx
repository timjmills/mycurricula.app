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
// ── WHAT IS NOT BUILT YET ────────────────────────────────────────────────
// Drag-authoring (dot ripple, band re-pace, edge resize, paint-a-unit), the
// zoom slider, the Units|Lessons + Timeline|List toggle pairs, the "N missed"
// chip, and the Unit/Lesson Library + Needs Attention drawer. Bands and dots
// OPEN their unit / lesson; nothing on this canvas moves anything yet.
//
// ── WHY THIS OPENS DOCS RATHER THAN THE GLOBAL WORKSPACE ─────────────────
// It routes through the hub's own `onOpenDoc`, exactly as the browse pickers
// do, so a band opens a unit tab and a dot opens a lesson tab. It does NOT call
// `openUnitWorkspace()` — HubDocHost.tsx:54-57 records that nothing on /planner
// may, because the hub's explorer is invisible to workspace-state's
// single-renderer election.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePlanner } from "@/lib/planner-store";
import { useAppState } from "@/lib/app-state";
import { useAcademicYear } from "@/lib/use-academic-year";
import { useSchoolWeek, type Weekday } from "@/lib/use-school-week";
import { useHolidays } from "@/lib/use-holidays";
import { todayColumnIndex } from "@/lib/now-anchor";
import { allYearWeeksFor, buildSchoolDays } from "@/lib/year-calendar";
import {
  buildTimelineAxis,
  buildTimelineLanes,
  monthBands,
  todayLineSlot,
  weekSlotRange,
} from "@/lib/plan-timeline";
import type { NowRef } from "@/lib/plan-timeline";
import { PlannerEmpty } from "@/components/ui";
import type { Lesson } from "@/lib/types";
import { queryMatches, type HubBrowseProps } from "../browse/browse-data";
import { TimelineCanvas } from "./TimelineCanvas";
import { TimelineLegend } from "./TimelineLegend";
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
  const { lessons, units, subjects, getSections } = usePlanner();
  const { currentWeek, currentWeekBasis } = useAppState();
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
      <div className={styles.card} data-mounted={mounted || undefined}>
        <div className={styles.toolbar}>
          <p className={styles.hint}>
            Click a unit bar to open its planner · click a lesson dot to plan it.
          </p>
          <TimelineLegend />
        </div>
        <TimelineCanvas
          axis={axis}
          months={months}
          lanes={lanes}
          todaySlot={todaySlot}
          currentWeekRange={currentWeekRange}
          matchesUnit={matchesUnit}
          matchesLesson={matchesLesson}
          onOpenUnit={(unitId, name, subject) => {
            // MATCH ON BOTH. A unit slug is unique only WITHIN a subject, so
            // `units.find(u => u.id === unitId)` returns whichever subject's
            // unit happens to come first — clicking Reading's "u1" band would
            // open Math's "u1". Same collision PlannerHub.tsx:59-62 documents
            // for doc-tab keys, and the reason the lane hands its subject down.
            const unit = units.find(
              (u) => u.id === unitId && u.subject === subject,
            );
            if (!unit) return;
            onOpenDoc({ kind: "unit", id: unitId, title: name, sid: subject });
          }}
          onOpenLesson={(lessonId, title) => {
            const lesson = lessons.find((l) => l.id === lessonId);
            if (!lesson) return;
            onOpenDoc({
              kind: "lesson",
              id: lessonId,
              title,
              sid: lesson.subject,
            });
          }}
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
