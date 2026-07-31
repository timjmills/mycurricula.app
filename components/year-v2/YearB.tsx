"use client";

// YearB — the /year PAPER frame (Frame B · Bright Workspace).
//
// DESIGN AUTHORITY: the 7.21.26 handoff's `source-home/views-b.jsx` →
// `function YearB({unit})` (:90-124), CSS `source-home/views.css` (.vb-year /
// .vb-srow / .vb-track2 / .vb-seg / .vb-upill / .pct, :262-273), night theming
// `source-home/themes.css` (:356-373). Per the handoff README `source-*/` is
// ground truth for look + behaviour, so this recreates that row exactly:
//
//   [ SubjGlyph · subject name · "Now: <current unit>" ] [ segmented progress
//   track over a wrapped row of unit pills ] [ NN% ]
//
// STATUS — A CANDIDATE, NOT THE PAPER YEAR (2026-07-31). This was built to be
// paper's default, on the reading that all three frames should render the v2
// design and differ only in material. That reading came from the 7.2 handoff.
// The 7.21 handoff supersedes it: `source-home/app.jsx:522` maps
// `ViewSet = { A: ViewsA, B: ViewsC, C: ViewsC }`, so under the latest design
// paper adopts the SUBJECT-LED views (our <YearC/>) and no Frame-B Year exists
// at all. `views-b.jsx` is a 7.2 artifact.
//
// Rather than delete a built, tested, live-verified surface on a design
// question the user had not yet answered, it is reachable at
// `/year?preview=frame-b` (YearShell) so all three paper candidates —
// TimelineYear today, YearC per 7.21, and this — can be compared against real
// data. Nothing routes here by default and no saved preference is touched.
//
// A caution for whoever resolves that question: the 7.21 Year views are 34
// lines of JSX and 11 CSS rules, and a grep for sidebar|coverage|breadcrumb|
// legend|today|statcard|filter across all three 7.21 view files returns ZERO
// hits. The handoff does not rehome TimelineYear's year-scope capabilities —
// it does not have them. Adopting any of these literally is a capability
// decision, which is why the trade is spelled out below rather than buried.
//
// WHAT PAPER GAINS AND LOSES vs. TimelineYear — the deliberate part. The v2 row
// is compact, so the capabilities that are pure functions of the lesson set ride
// along above it rather than being dropped:
//
//   CARRIED  · the unit workspace   — every unit pill is a real <button> calling
//              the ONE global opener, exactly as the handoff's `UE.Chip
//              onOpen={unit}` does. This is the invariant YearShell's header
//              calls load-bearing, and it is now carried by the design itself
//              rather than by a bolted-on ⤢ affordance.
//            · the stat dashboard   — <YearStatCards>, prop-driven off `lessons`.
//            · the standards loop   — <StandardsCoveragePanel> over
//              `standardsCoverage(lessons)`, opened from the STANDARDS stat card
//              AND the filters popover. Its per-standard "open a covering
//              lesson" pushes `/daily?lesson=…`, which is the same hand-off
//              TimelineYear's YearLessonPane offered — so "Open in Daily"
//              survives the reroute.
//            · the year filters     — <YearFiltersPopover>, subjects + statuses
//              + the standards facet.
//            · `?subject=` deep link, empty/loading/error honesty, reduced
//              motion. Note the deep link is CARRIED IN THE YearA/YearC SENSE —
//              scroll the subject's row into view and outline it briefly. On
//              TimelineYear the same parameter drilled the page to
//              scope={level:"subject"} and stayed there. There is no in-page
//              scope on Frame B to drill to, so paper now behaves like the
//              other two frames rather than like its own past. Deliberate, and
//              the reason it is listed here and not under NOT CARRIED: the
//              parameter still lands a teacher on the named subject.
//
//   NOT CARRIED (reported, not silently dropped):
//            · the subjects sidebar — the row list IS the subject index, and each
//              row already exposes that subject's units as pills. A rail
//              repeating both beside them is duplication, not capability.
//            · the breadcrumb       — there is no in-page drill on Frame B (the
//              workspace is an overlay), so there is no scope trail to render.
//            · the today line + month axis, and the unit→week→lesson drill with
//              YearLessonPane. The Frame-B track is UNIT-segmented, not
//              week-positioned, so a today marker has no coordinate to sit on;
//              the week level of the drill goes with it. The unit workspace is a
//              superset at the unit level (Unit Plan · Lessons · Standards ·
//              Resources · Notes, plus Assessments/Insights/Prep and an editable
//              Lesson Planner mode) — what a paper teacher genuinely loses is
//              browsing a unit's lessons BY WEEK and the read-only lesson pane.
//            · the grid/list view toggle + the timeline status legend — both
//              describe the timeline layout, which no longer exists here.
//
// Tokens only; subject colour arrives through the `.cp-subj.<cls>` cascade
// (var(--c)/--cl/--cd) and every mix targets --panel-bg, never raw white, so the
// dark tone holds (CLAUDE.md §4 legibility contract). The app's ViewTitle chrome
// owns the "The Year" heading — this renders the handoff's slim `.vsub` context
// line only.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { PlannerEmpty, Tooltip } from "@/components/ui";
import { SubjGlyph } from "@/components/planner-v2";
import {
  StandardsCoveragePanel,
  YearFiltersPopover,
  YearStatCards,
  type YearStatusKey,
} from "@/components/year";
import { usePlanner, usePlannerDataState } from "@/lib/planner-store";
import { useAppState } from "@/lib/app-state";
import { useAcademicYear } from "@/lib/use-academic-year";
import { useNotebookState } from "@/lib/notebook-state";
import { standardsCoverage } from "@/lib/year-standards-coverage";
import type { LessonStatus, SubjectId } from "@/lib/types";
import type { YearSubjectLane, YearUnitNode } from "./YearShell";
import styles from "./YearB.module.css";

export interface YearBProps {
  lanes: YearSubjectLane[];
  onOpenUnit: (subjectId: SubjectId, unit: string) => void;
}

/**
 * Lesson status → the four filter keys the year filters popover understands.
 *
 * Re-stated here rather than imported: the original is module-private inside
 * TimelineYear (`lessonStatusKey`, TimelineYear.tsx :180), and that file is
 * frozen for the NEXT_PUBLIC_V2-off rollback path. Kept byte-faithful to it so
 * the same filter selection means the same thing on both surfaces.
 */
function statusKey(status: LessonStatus): YearStatusKey {
  switch (status) {
    case "done":
      return "completed";
    case "skipped":
      return "skipped";
    case "partial":
    case "carried":
      return "in-progress";
    default:
      return "not-started";
  }
}

/** Taught fraction of a unit. A unit with no lessons reads as unstarted. */
function fraction(u: YearUnitNode): number {
  return u.total > 0 ? u.done / u.total : 0;
}

/**
 * The unit the "Now:" line names — the handoff's rule verbatim
 * (views-b.jsx :98): the first partially-taught unit, else the first untaught
 * unit, else the last one (i.e. the year is finished).
 */
function currentUnit(units: YearUnitNode[]): YearUnitNode | null {
  if (units.length === 0) return null;
  return (
    units.find((u) => fraction(u) > 0 && fraction(u) < 1) ??
    units.find((u) => fraction(u) === 0) ??
    units[units.length - 1]
  );
}

/** Key for the per-unit status index. Unit slugs are unique only WITHIN a
 *  subject, so the subject is part of the key (never the unit id alone). */
function unitKey(subjectId: string, unitId: string): string {
  // The separator is written as an ESCAPE, not a literal control byte: a raw
  // NUL in the source makes git treat the whole .tsx as binary, which silently
  // strips it from every diff and from the code-review gate that reads them.
  return `${subjectId}\u0000${unitId}`;
}

export function YearB({ lanes, onOpenUnit }: YearBProps): ReactNode {
  const { lessons } = usePlanner();
  const dataState = usePlannerDataState();
  const { filters, updateFilters } = useAppState();
  const { start: yearStart, end: yearEnd } = useAcademicYear();
  const { activeNotebooks, activeNotebookId } = useNotebookState();
  const router = useRouter();

  // Filter state — subjects + statuses, local to this view (same shape and
  // lifetime TimelineYear gives them). The standards facet is GLOBAL, shared
  // with Weekly through app-state, so it is read/written there instead.
  const [filterSubjects, setFilterSubjects] = useState<string[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [coverageOpen, setCoverageOpen] = useState(false);

  // Archived rows stay in the store (soft delete); they are never year content.
  const visibleLessons = useMemo(
    () => lessons.filter((l) => !l.archived),
    [lessons],
  );

  // Dashboard + coverage denominators are deliberately NOT narrowed by the
  // filters — the approved "scope-only dashboard" rule TimelineYear follows
  // (TimelineYear.tsx :305-309), so the numbers stay stable while a teacher
  // narrows the view.
  const coverage = useMemo(
    () => standardsCoverage(visibleLessons),
    [visibleLessons],
  );

  // Which status keys each unit actually contains — the input to the status
  // filter. Mirrors TimelineYear's `unitMatchesStatuses` (:258-264) at unit
  // granularity: a unit shows when it holds at least one lesson in a selected
  // status.
  const unitStatuses = useMemo(() => {
    const map = new Map<string, Set<YearStatusKey>>();
    for (const l of visibleLessons) {
      const key = unitKey(l.subject, l.unit);
      let set = map.get(key);
      if (!set) {
        set = new Set<YearStatusKey>();
        map.set(key, set);
      }
      set.add(statusKey(l.status));
    }
    return map;
  }, [visibleLessons]);

  const standardsFilter = filters.standards;
  const toggleStandard = useCallback(
    (code: string) =>
      updateFilters({
        standards: standardsFilter.includes(code)
          ? standardsFilter.filter((c) => c !== code)
          : [...standardsFilter, code],
      }),
    [standardsFilter, updateFilters],
  );
  const clearStandards = useCallback(
    () => updateFilters({ standards: [] }),
    [updateFilters],
  );

  // Units holding at least one lesson tagged with an ACTIVE standard. `null`
  // when no standard is selected, so the common path allocates nothing.
  //
  // This predicate is not optional decoration: the popover renders the active
  // standard chips and its "filters are on" badge from the same global state,
  // so without it a teacher picks a standard, watches the control report a live
  // filter, and sees every unit still listed. Mirrors TimelineYear's
  // constellation rule — a unit survives if ANY of its lessons matches.
  const unitsMatchingStandards = useMemo(() => {
    if (standardsFilter.length === 0) return null;
    const keys = new Set<string>();
    for (const l of visibleLessons) {
      if (standardsFilter.some((c) => l.standards.includes(c)))
        keys.add(unitKey(l.subject, l.unit));
    }
    return keys;
  }, [standardsFilter, visibleLessons]);

  // Rows = lanes narrowed by the subject + status + standards filters.
  // `hadUnits` is kept from the unfiltered lane so an empty row can say WHY it
  // is empty ("none planned" vs. "none match").
  const rows = useMemo(
    () =>
      lanes
        .filter(
          (lane) =>
            filterSubjects.length === 0 ||
            filterSubjects.includes(lane.subject.id),
        )
        .map((lane) => {
          if (filterStatuses.length === 0 && unitsMatchingStandards === null)
            return lane;
          const units = lane.units.filter((u) => {
            const key = unitKey(lane.subject.id, u.id);
            if (unitsMatchingStandards && !unitsMatchingStandards.has(key))
              return false;
            if (filterStatuses.length === 0) return true;
            const present = unitStatuses.get(key);
            // A unit with no lessons at all has no status; it is not-started.
            if (!present || present.size === 0)
              return filterStatuses.includes("not-started");
            return filterStatuses.some((k) => present.has(k as YearStatusKey));
          });
          return { ...lane, units };
        }),
    [
      lanes,
      filterSubjects,
      filterStatuses,
      unitStatuses,
      unitsMatchingStandards,
    ],
  );

  // Subject options for the popover — always the FULL set, never the filtered
  // rows, or deselecting the last subject would remove its own checkbox.
  const filterSubjectOptions = useMemo(
    () =>
      lanes.map((lane) => ({
        id: lane.subject.id,
        name: lane.subject.name,
        cls: lane.subject.cls,
      })),
    [lanes],
  );

  // Active grade label from the notebook (never hard-code "Grade 5").
  const gradeLabel =
    activeNotebooks.find((nb) => nb.gradeLevelId === activeNotebookId)?.name ??
    activeNotebooks[0]?.name ??
    "";

  // Academic-year label, e.g. "2025–2026" (en-dash), collapsed when start and
  // end share a year. Same derivation YearA uses.
  const yearLabel = useMemo(() => {
    const a = Math.min(yearStart.getFullYear(), yearEnd.getFullYear());
    const b = Math.max(yearStart.getFullYear(), yearEnd.getFullYear());
    return a === b ? String(a) : `${a}–${b}`;
  }, [yearStart, yearEnd]);

  // ?subject= deep link — scroll the named subject's row into view + briefly
  // highlight it, so the retired /subject/[slug] redirect stays meaningful on
  // the paper frame too. Mirrors YearA (:101-127) and YearC (:31-61) exactly,
  // which is what the brief asked for.
  //
  // KNOWN LIMITATION, INHERITED FROM THAT PATTERN, not introduced here: the
  // effect is guarded by a ref and depends on the derived rows rather than on
  // the URL, so it fires ONCE per mount. A client-side navigation that changes
  // only `?subject=` — the command palette and the `g s` shortcut both do this
  // — leaves the second target unscrolled. All three v2 Year views share the
  // defect, so fixing it here alone would make them disagree; it wants one
  // change across the three (most cleanly: pass the subject down from the route
  // beside `preview`, the way this file's sibling parameter now works).
  const rowEls = useRef<Map<string, HTMLElement>>(new Map());
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current || typeof window === "undefined") return;
    const param = new URLSearchParams(window.location.search).get("subject");
    if (!param) {
      deepLinkDone.current = true;
      return;
    }
    const el = rowEls.current.get(param);
    if (!el) return; // wait for the row to render
    deepLinkDone.current = true;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "center",
      inline: "nearest",
    });
    el.setAttribute("data-deeplink-focus", "");
    // Deliberately NOT cleared on cleanup — a re-render (or StrictMode's
    // mount→cleanup→mount) inside the window would otherwise clear the timer
    // while the ref-guard blocks re-arming it, leaving the highlight stuck on.
    setTimeout(() => el.removeAttribute("data-deeplink-focus"), 2200);
  }, [rows]);

  const caption = (
    <p className={styles.vsub}>
      {yearLabel}
      {gradeLabel ? ` · ${gradeLabel}` : ""}
    </p>
  );

  // ── Honest empty / loading / error ────────────────────────────────────────
  // The Supabase hydrate leaves a legitimately empty document in flight for
  // 11–16s, and a failed hydrate leaves one permanently. Rendering the rows off
  // that document would show every subject at 0% with "Now: —" — a plausible,
  // wrong plan rather than an obvious blank. So anything short of a settled
  // store with real units goes through <PlannerEmpty>, which owns the
  // skeleton / "couldn't load" / genuinely-empty branch. The toolbar is held
  // back with it: stat cards over an unhydrated store are the same lie in
  // numbers.
  const noUnitsAnywhere = lanes.every((lane) => !lane.hadUnits);
  if (dataState !== "settled" || lanes.length === 0 || noUnitsAnywhere) {
    return (
      <div className={styles.root} data-year-frame="paper">
        {caption}
        <PlannerEmpty
          heading="No units planned yet."
          body="Add units to your curriculum and the year fills in here."
          skeletonLines={4}
        />
      </div>
    );
  }

  return (
    <div className={styles.root} data-year-frame="paper">
      {caption}

      <div className={styles.toolbar}>
        {/* Wrapped so the phone tier can turn the 5-card grid into a swipeable
            strip — see .statcards in the module. */}
        <div className={styles.statcards}>
          <YearStatCards
            lessons={visibleLessons}
            onStandardsClick={() => setCoverageOpen(true)}
          />
        </div>
        <div className={styles.tools}>
          <YearFiltersPopover
            value={{
              view: "list",
              subjects: filterSubjects,
              statuses: filterStatuses,
            }}
            subjects={filterSubjectOptions}
            onChange={(next) => {
              setFilterSubjects(next.subjects);
              setFilterStatuses(next.statuses);
            }}
            // Frame B has ONE layout — the progress list. A Grid|List switch
            // would have nothing to switch, so it is hidden rather than left
            // as an inert control.
            showViewToggle={false}
            selectedStandards={standardsFilter}
            onToggleStandard={toggleStandard}
            onClearStandards={clearStandards}
            onOpenCoverage={() => setCoverageOpen(true)}
          />
        </div>
      </div>

      {/* .vb-year — the progress list. */}
      <div className={styles.year}>
        {rows.map((lane) => {
          const now = currentUnit(lane.units);
          return (
            <div
              key={lane.subject.id}
              ref={(el) => {
                if (el) rowEls.current.set(lane.subject.id, el);
                else rowEls.current.delete(lane.subject.id);
              }}
              className={`${styles.srow} cp-subj ${lane.subject.cls}`}
              data-year-row={lane.subject.id}
            >
              {/* .sl — glyph + full subject name + the "Now:" line. */}
              <div className={styles.sl}>
                <SubjGlyph subject={lane.subject} size={34} radius={11} />
                <div className={styles.slText}>
                  <div className={styles.nm}>{lane.subject.name}</div>
                  <div className={styles.cu}>
                    {now ? `Now: ${now.label}` : "Now: —"}
                  </div>
                </div>
              </div>

              {/* .vb-prog — segmented track over the unit pills. */}
              <div className={styles.prog}>
                {lane.units.length === 0 ? (
                  <span className={styles.empty}>
                    {lane.hadUnits
                      ? "No units match the current view."
                      : "No units planned yet."}
                  </span>
                ) : (
                  <>
                    <div
                      className={styles.track}
                      role="img"
                      aria-label={`${lane.subject.name}: ${lane.pct}% of the year taught`}
                    >
                      {lane.units.map((u) => {
                        const f = fraction(u);
                        return (
                          <div
                            key={u.id}
                            data-year-seg={
                              f === 1 ? "done" : f > 0 ? "partial" : "todo"
                            }
                            className={`${styles.seg} ${
                              f === 1
                                ? styles.segDone
                                : f > 0
                                  ? styles.segPartial
                                  : styles.segTodo
                            }`}
                          />
                        );
                      })}
                    </div>

                    <div className={styles.units}>
                      {lane.units.map((u) => {
                        const pct = Math.round(fraction(u) * 100);
                        return (
                          <Tooltip
                            key={u.id}
                            content={`Open ${u.fullName} — ${pct}% taught · ${u.done}/${u.total} lessons`}
                            // ONE id for every pill, on purpose. `tooltipId` is
                            // the DISMISSAL key, not a DOM id (the primitive
                            // renames it to `dismissalId` and mints the real
                            // element id from useId), so "turn off these tips"
                            // has to silence unit pills as a CLASS. A per-unit
                            // id would silence one pill out of fifty and write
                            // a localStorage key per unit. Matches YearA's
                            // "year-a-unit-chip" and YearC's "year-c-node".
                            tooltipId="year-b-unit-pill"
                            side="top"
                          >
                            <button
                              type="button"
                              className={styles.upill}
                              data-year-pill
                              // Present only once the unit has been started —
                              // the CSS hook for the handoff's tinted-pill ink.
                              data-started={pct > 0 ? "" : undefined}
                              onClick={() => onOpenUnit(lane.subject.id, u.id)}
                              title={u.fullName}
                              // The handoff tints a pill by how far through it
                              // is: `color-mix(… 18 + progress*22 %, white)`.
                              // Only the PERCENTAGE travels inline; the colour
                              // itself stays in the stylesheet as var(--c)
                              // mixed toward --panel-bg, so the dark tone and
                              // every theme still resolve it.
                              style={
                                {
                                  "--upill-mix": `${pct > 0 ? 18 + (pct / 100) * 22 : 0}%`,
                                } as CSSProperties
                              }
                            >
                              {u.label}
                            </button>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* .pct — the subject's share of the year taught. Lesson-weighted
                  from the SHARED lane derivation, so paper, glass and colour
                  never quote a teacher three different numbers. It stays a
                  whole-subject figure while a filter narrows the track. */}
              <div className={styles.pct}>{lane.pct}%</div>
            </div>
          );
        })}

        {rows.length === 0 ? (
          <p className={styles.noRows}>No subjects match the current filters.</p>
        ) : null}
      </div>

      {coverageOpen ? (
        <StandardsCoveragePanel
          coverage={coverage}
          scopeLabel="the whole year"
          activeStandards={standardsFilter}
          onToggleStandard={toggleStandard}
          onClearStandards={clearStandards}
          onClose={() => setCoverageOpen(false)}
          // The "Open in Daily" hand-off TimelineYear's lesson pane owned.
          onOpenLesson={(id) =>
            router.push(`/daily?lesson=${encodeURIComponent(id)}`)
          }
        />
      ) : null}
    </div>
  );
}
