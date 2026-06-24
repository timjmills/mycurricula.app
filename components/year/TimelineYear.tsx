"use client";

// TimelineYear — the production Year view, rebuilt on the Timeline (Curriculy)
// design handoff. One row per subject; a subject's units sit across the year as
// a clean row of cards under a decorative month/year axis. Click a unit → its
// weeks + days open in a tabbed UnitDrawer under the row (Unit Overview ·
// Resources · Standards · Assessments · Notes); click a week → that week's
// days appear; click a day → the app's lesson-detail panel opens via
// setSelectedLessonId.
//
// Composition (each piece owns its own CSS module):
//   • YearStatCards     — the 5 live stat cards (top of the page).
//   • YearFiltersPopover— the single "Filters & View" control (Grid/List +
//                         subject + status filters); replaces the old toggle.
//   • UnitDrawer        — the tabbed expand-under-row drill-down.
// This file orchestrates them + renders the subject rows and the timeline axis.
//
// Everything is wired to the LIVE planner store via usePlanner(): the editable
// document (lessons) plus the catalog slice (subjects, units).
//
// Visual contract: each subject row carries `.cp-subj.<id>` so the palette
// bridge's --c / --cl / --cd tokens cascade; the CSS module derives the
// --uc/--ud/--ut/--us/--ush/--rt aliases from those. Cards float over the body
// gradient swash via --panel-bg surfaces. Tokens only — no hex.

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
  type SVGProps,
} from "react";
import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import { CURRENT_WEEK } from "@/lib/mock";
import { useAcademicYear } from "@/lib/use-academic-year";
import { weeksInRange } from "@/lib/year-calendar";
import type { Lesson, LessonStatus, Subject, Unit } from "@/lib/types";
import { YearStatCards } from "./YearStatCards";
import { UnitDrawer } from "./UnitDrawer";
import {
  YearFiltersPopover,
  type YearFilterState,
  type YearStatusKey,
} from "./YearFiltersPopover";
import styles from "./TimelineYear.module.css";

/** Short month labels for the timeline axis header (calendar order). */
const MONTH_ABBR = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

/** Milliseconds in one 7-day week — used to project the real "today" date onto
 *  the timeline's week axis (real-date today marker, not the mock anchor). */
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

// ── Inline icons (Lucide-family, currentColor) ──────────────────────────────

type IconProps = SVGProps<SVGSVGElement> & { sw?: number };
function Svg({
  sw = 2,
  children,
  ...rest
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}
/** Chevron used by the per-row expand/collapse control (rotates when open). */
const IconChevDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

// ── Derived shapes ──────────────────────────────────────────────────────────

/** One week inside a unit, derived from that unit's lessons. */
interface WeekGroup {
  /** 1-based curriculum week number. */
  week: number;
  /** Lessons in this week, sorted by day. */
  lessons: Lesson[];
  /** Rolled-up status for the week's circle marker. */
  state: "done" | "cur" | "todo";
}

/** A unit with its lessons grouped into weeks. */
interface UnitGroup {
  unit: Unit;
  /** Week-span label parsed from unit.weeks (e.g. "Wk 11–16"). */
  spanLabel: string;
  /** Inclusive [start, end] derived from the unit's lessons (falls back to the
   *  parsed label when the unit has no lessons yet). */
  start: number;
  end: number;
  weeks: WeekGroup[];
  total: number;
}

/** One contiguous run of weeks within a single calendar month — the month-axis
 *  header label. (The axis is decorative now: units render as equal-width cards
 *  rather than week-positioned bars, so each month is one evenly-spaced cell.) */
interface MonthSeg {
  /** 0–11 calendar month index. */
  month: number;
  /** Short uppercase label (e.g. "NOV"). */
  label: string;
}

/** Roll a set of lesson statuses up into a single week marker state. */
function rollUpWeek(week: number, lessons: Lesson[]): WeekGroup["state"] {
  if (lessons.length === 0) return week < CURRENT_WEEK ? "done" : "todo";
  const allDone = lessons.every((l) => l.status === "done");
  if (allDone) return "done";
  const inProgress =
    week === CURRENT_WEEK ||
    lessons.some(
      (l) =>
        l.status === "partial" || l.status === "carried" || l.status === "done",
    );
  return inProgress ? "cur" : "todo";
}

/** Map a lesson's status to one of the four Year filter keys (matches the
 *  YearFiltersPopover STATUS section). */
function lessonStatusKey(status: LessonStatus): YearStatusKey {
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

/** Parse a unit.weeks label like "Wk 11–16" / "Wk 12" into [start, end].
 *  Normalized so start ≤ end — a malformed/reversed label ("Wk 16–11") would
 *  otherwise render as a 1-week bar at the wrong column and make the timeline's
 *  `lastUnitWeek` undercount the real span. */
function parseSpan(label: string): [number, number] | null {
  const nums = label.match(/\d+/g);
  if (!nums || nums.length === 0) return null;
  const a = Number(nums[0]);
  const b = nums.length > 1 ? Number(nums[1]) : a;
  return [Math.min(a, b), Math.max(a, b)];
}

/** Build the per-subject unit groups from the live lessons + unit catalog.
 *  `allUnits` is the full-year unit superset (usePlanner().units) — passed in
 *  because this is a module-level pure helper, not a component. */
function buildSubjectGroups(
  subject: Subject,
  lessons: Lesson[],
  allUnits: Unit[],
): UnitGroup[] {
  const units = allUnits.filter((u) => u.subject === subject.id);

  const groups = units.map<UnitGroup>((unit) => {
    const unitLessons = lessons.filter(
      (l) => l.unit === unit.id && !l.archived,
    );

    // Group this unit's lessons by week.
    const byWeek = new Map<number, Lesson[]>();
    for (const l of unitLessons) {
      const arr = byWeek.get(l.week);
      if (arr) arr.push(l);
      else byWeek.set(l.week, [l]);
    }

    const weeks: WeekGroup[] = Array.from(byWeek.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([week, ls]) => {
        const sorted = [...ls].sort((a, b) => a.day - b.day);
        return { week, lessons: sorted, state: rollUpWeek(week, sorted) };
      });

    // Span: prefer the real lesson weeks; fall back to the label.
    const parsed = parseSpan(unit.weeks);
    const start = weeks.length > 0 ? weeks[0].week : parsed ? parsed[0] : 0;
    const end =
      weeks.length > 0 ? weeks[weeks.length - 1].week : parsed ? parsed[1] : 0;

    return {
      unit,
      spanLabel: unit.weeks,
      start,
      end,
      weeks,
      total: unitLessons.length,
    };
  });

  // Sort units left→right by their start week so the row reads chronologically.
  return groups.sort((a, b) => a.start - b.start);
}

/** Strip the "Unit N · " / "List N · " / "Lessons … · " lead-in so the unit
 *  card can show a short title and a separate prefix when present. */
function splitUnitName(name: string): { prefix: string; rest: string } {
  const idx = name.indexOf("·");
  if (idx === -1) return { prefix: "", rest: name.trim() };
  return {
    prefix: name.slice(0, idx).trim(),
    rest: name.slice(idx + 1).trim(),
  };
}

/** Does this unit contain at least one lesson in one of the selected statuses?
 *  An empty `statuses` filter matches everything (no narrowing). */
function unitMatchesStatuses(group: UnitGroup, statuses: string[]): boolean {
  if (statuses.length === 0) return true;
  return group.weeks.some((w) =>
    w.lessons.some((l) => statuses.includes(lessonStatusKey(l.status))),
  );
}

// ── Component ───────────────────────────────────────────────────────────────

/** Identifies the open unit: `${subjectId}:${unitId}`. */
type OpenKey = string | null;

export function TimelineYear(): ReactNode {
  const { lessons, subjects, units: allUnits } = usePlanner();
  const { setSelectedLessonId, getViewMode, setViewMode } = useAppState();

  // Team-scoped academic-year window (Settings → Curriculum → Academic year).
  // Drives the month/year axis labels — never a hard-coded term anchor.
  const { start: yearStart, end: yearEnd } = useAcademicYear();

  // Hierarchy layout — Grid (timeline cards) vs List (color-coded bands).
  // Persisted per-teacher under the shared "year" view slot (SSR-safe: default
  // render = "grid", the stored value arrives post-mount → no hydration jump).
  const storedHier = getViewMode("year");

  // Small-screen fallback. The Grid layout is a horizontal timeline; below its
  // viable width it always renders the stacked List outline regardless of the
  // stored preference (the choice re-applies on a wide screen). SSR-safe: assume
  // desktop on the server + first paint, then read the real viewport post-mount.
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    )
      return;
    const mql = window.matchMedia("(max-width: 900px)");
    const sync = (): void => setIsNarrow(mql.matches);
    sync();
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", sync);
      return () => mql.removeEventListener("change", sync);
    }
    mql.addListener(sync);
    return () => mql.removeListener(sync);
  }, []);

  // The effective layout the surface actually renders.
  const hier = isNarrow ? "list" : storedHier;
  const isGrid = hier !== "list";

  // Progressive selection — nothing open by default.
  const [openUnit, setOpenUnit] = useState<OpenKey>(null);
  const [openWeek, setOpenWeek] = useState<number | null>(null);

  // Filter state — subjects + statuses (the view lives in app-state via the
  // stored hierarchy). `[]` for either means "all" (no narrowing).
  const [filterSubjects, setFilterSubjects] = useState<string[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);

  // Per-subject unit groups, recomputed when the live document changes.
  const subjectGroups = useMemo(
    () =>
      subjects.map((s) => ({
        subject: s,
        groups: buildSubjectGroups(s, lessons, allUnits),
      })),
    [lessons, subjects, allUnits],
  );

  // Stat cards must match the timeline, which excludes archived (soft-deleted)
  // lessons (buildSubjectGroups filters !l.archived). The store keeps archived
  // rows in `lessons`, so filter here too — otherwise DONE/total/%/standards/
  // skipped/resources would count deleted lessons and disagree with the rows.
  const visibleLessons = useMemo(
    () => lessons.filter((l) => !l.archived),
    [lessons],
  );

  // ── Month / year axis ───────────────────────────────────────────────────
  // The axis is the configured academic year's months, evenly spaced. We also
  // compute a 0–1 "today" fraction so the now-marker sits at the right point in
  // the year. (Units now render as equal-width cards rather than week-tied bars,
  // so the months are a decorative guide, not a positioning grid.)
  const yearStartMs = yearStart.getTime();
  const yearEndMs = yearEnd.getTime();
  const axis = useMemo(() => {
    let lastUnitWeek = 0;
    for (const { groups } of subjectGroups) {
      for (const g of groups) {
        if (g.end > lastUnitWeek) lastUnitWeek = g.end;
      }
    }

    // Normalize the configured window (lo = earlier endpoint) so the week count
    // and the month anchor agree even if start > end ever slips through.
    const lo = Math.min(yearStartMs, yearEndMs);
    const hi = Math.max(yearStartMs, yearEndMs);
    const start = new Date(lo);
    const end = new Date(hi);
    const configWeeks = weeksInRange(start, end);
    const totalWeeks = Math.max(configWeeks, lastUnitWeek, 1);

    // Walk each instructional week, projecting it onto its calendar month (7-day
    // strides from the year-start anchor), and bucket contiguous same-month runs
    // into one segment each — left→right reading order, one label per month.
    const anchor = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
    );
    const months: MonthSeg[] = [];
    for (let w = 1; w <= totalWeeks; w++) {
      const d = new Date(
        anchor.getFullYear(),
        anchor.getMonth(),
        anchor.getDate() + (w - 1) * 7,
      );
      const m = d.getMonth();
      const prev = months[months.length - 1];
      if (!prev || prev.month !== m) {
        months.push({ month: m, label: MONTH_ABBR[m] });
      }
    }

    // "Today" marker fraction (0–1) across the timeline, from the REAL current
    // date against the CONFIGURED year. Null (hidden) when today is outside the
    // window — a misplaced marker is worse than none.
    const now = Date.now();
    let todayFrac: number | null = null;
    if (now >= lo && now <= hi) {
      const elapsedWeeks = Math.floor((now - lo) / MS_PER_WEEK);
      todayFrac = Math.min(1, Math.max(0, (elapsedWeeks + 0.5) / totalWeeks));
    }

    // Calendar years the window spans (for the axis year labels).
    const yearA = Math.min(start.getFullYear(), end.getFullYear());
    const yearB = Math.max(start.getFullYear(), end.getFullYear());

    return { totalWeeks, months, todayFrac, yearA, yearB };
  }, [subjectGroups, yearStartMs, yearEndMs]);

  function toggleUnit(subjectId: string, unitId: string) {
    const key = `${subjectId}:${unitId}`;
    setOpenUnit((cur) => (cur === key ? null : key));
    setOpenWeek(null);
  }
  function pickWeek(week: number) {
    setOpenWeek((cur) => (cur === week ? null : week));
  }
  function openLesson(id: string) {
    setSelectedLessonId(id);
  }
  function closeDrawer() {
    setOpenUnit(null);
    setOpenWeek(null);
  }

  // Row-level expand/collapse (the trailing chevron). Opening a closed row jumps
  // to the unit that contains the current week (the most useful entry point),
  // falling back to the first unit; a second click collapses the whole row.
  function toggleRow(subjectId: string, groups: UnitGroup[]) {
    const isOpen = openUnit?.startsWith(`${subjectId}:`) ?? false;
    if (isOpen || groups.length === 0) {
      closeDrawer();
      return;
    }
    const current =
      groups.find((g) => CURRENT_WEEK >= g.start && CURRENT_WEEK <= g.end) ??
      groups[0];
    setOpenUnit(`${subjectId}:${current.unit.id}`);
    setOpenWeek(null);
  }

  // The tabbed drill-down for the open unit. Placed differently per layout:
  // GRID renders it once below the whole `.units` row; LIST nests it under the
  // open unit's own node so the outline reads top-to-bottom.
  function renderDrawer(subject: Subject, openGroup: UnitGroup): ReactNode {
    return (
      <UnitDrawer
        subject={subject}
        unitName={openGroup.unit.name}
        spanLabel={openGroup.spanLabel}
        totalLessons={openGroup.total}
        weeks={openGroup.weeks}
        lessons={openGroup.weeks.flatMap((w) => w.lessons)}
        openWeek={openWeek}
        onPickWeek={pickWeek}
        onOpenLesson={openLesson}
        onClose={closeDrawer}
      />
    );
  }

  // `--today-frac` (0–1) positions the today marker on the timeline (grid only).
  const showToday = isGrid && axis.todayFrac != null;
  const rowsStyle = showToday
    ? ({ "--today-frac": axis.todayFrac } as CSSProperties)
    : undefined;

  const rowsContent = (
    <div className={styles.rows} style={rowsStyle}>
      {showToday ? (
        <div className={styles.todayline} aria-hidden="true" />
      ) : null}

      {subjectGroups
        // Subject filter: hide unselected subjects' rows entirely.
        .filter(
          ({ subject }) =>
            filterSubjects.length === 0 || filterSubjects.includes(subject.id),
        )
        .map(({ subject, groups }) => {
          // Status filter: keep only units with a matching lesson.
          const visibleGroups = groups.filter((g) =>
            unitMatchesStatuses(g, filterStatuses),
          );
          // The open unit, only if it survived filtering (else render closed).
          const openGroup =
            visibleGroups.find(
              (g) => `${subject.id}:${g.unit.id}` === openUnit,
            ) ?? null;
          const isOpen = openGroup != null;

          return (
            <div
              key={subject.id}
              className={`${styles.rowwrap} ${styles.tlVars} cp-subj ${subject.cls}`}
            >
              <div className={`${styles.subrow} ${isOpen ? styles.hot : ""}`}>
                <div className={styles.slabel}>
                  <span className={styles.si} aria-hidden="true">
                    {subject.icon}
                  </span>
                  <div>
                    <div className={styles.sn}>{subject.name}</div>
                    <div className={styles.sg}>Grade 5</div>
                  </div>
                </div>

                <div className={styles.units}>
                  {groups.length === 0 ? (
                    <div className={styles.norow}>No units planned yet.</div>
                  ) : visibleGroups.length === 0 ? (
                    <div className={styles.norow}>
                      No units match the current filters.
                    </div>
                  ) : (
                    visibleGroups.map((g) => {
                      const key = `${subject.id}:${g.unit.id}`;
                      const sel = key === openUnit;
                      const { prefix, rest } = splitUnitName(g.unit.name);
                      return (
                        // Each unit is a self-contained outline node. GRID: an
                        // equal-width flex card. LIST: a stacking row that nests
                        // its drawer directly beneath it (file-explorer style).
                        <div key={g.unit.id} className={styles.unode}>
                          <button
                            type="button"
                            className={`${styles.unit} ${sel ? styles.sel : ""}`}
                            onClick={() => toggleUnit(subject.id, g.unit.id)}
                            aria-expanded={sel}
                            title={g.unit.name}
                          >
                            <div className={styles.un}>{prefix || rest}</div>
                            {prefix ? (
                              <div className={styles.us}>{rest}</div>
                            ) : null}
                            <div className={styles.uw}>{g.spanLabel}</div>
                          </button>

                          {/* LIST mode nests the drawer under the open unit. */}
                          {hier === "list" && sel
                            ? renderDrawer(subject, g)
                            : null}
                        </div>
                      );
                    })
                  )}

                  {/* Per-row expand/collapse chevron (grid only — list stacks
                      vertically and has no trailing slot). Opens the current
                      unit / collapses the row. */}
                  {isGrid && visibleGroups.length > 0 ? (
                    <button
                      type="button"
                      className={styles.chev}
                      onClick={() => toggleRow(subject.id, visibleGroups)}
                      aria-expanded={isOpen}
                      aria-label={
                        isOpen
                          ? `Collapse ${subject.name}`
                          : `Expand ${subject.name}`
                      }
                    >
                      <IconChevDown
                        style={{
                          transform: isOpen ? "rotate(180deg)" : undefined,
                          transition: "transform .2s",
                        }}
                      />
                    </button>
                  ) : null}
                </div>
              </div>

              {/* GRID mode renders the drawer once below the whole units row. */}
              {isGrid && openGroup ? renderDrawer(subject, openGroup) : null}
            </div>
          );
        })}
    </div>
  );

  return (
    <div className={styles.root} data-hier={hier}>
      {/* Page heading + the single Filters & View control */}
      <div className={styles.head}>
        <div>
          <div className={styles.eyebrow}>Plan</div>
          <h1>Yearly View</h1>
          <div className={styles.sub}>
            The whole year at a glance — open a unit to plan its weeks and daily
            lessons.
          </div>
        </div>

        <YearFiltersPopover
          value={{
            view: storedHier,
            subjects: filterSubjects,
            statuses: filterStatuses,
          }}
          subjects={subjects.map((s) => ({
            id: s.id,
            name: s.name,
            cls: s.cls,
          }))}
          onChange={(next: YearFilterState) => {
            if (next.view !== storedHier) setViewMode("year", next.view);
            setFilterSubjects(next.subjects);
            setFilterStatuses(next.statuses);
          }}
        />
      </div>

      {/* Live year-wide stat cards (archived lessons excluded — see above). */}
      <div className={styles.statWrap}>
        <YearStatCards lessons={visibleLessons} />
      </div>

      {hier === "list" ? (
        <div className={styles.listWrap}>{rowsContent}</div>
      ) : (
        <div className={styles.tl}>
          <div className={styles.tlhead}>
            <div className={styles.corner} />
            <div className={styles.axisCol}>
              <div className={styles.years}>
                <span className={styles.y}>{axis.yearA}</span>
                {axis.yearB !== axis.yearA ? (
                  <span className={styles.y}>{axis.yearB}</span>
                ) : null}
              </div>
              <div
                className={styles.months}
                style={{
                  gridTemplateColumns: `repeat(${axis.months.length}, 1fr)`,
                }}
              >
                {axis.months.map((m, i) => (
                  <span key={`${m.label}-${i}`}>{m.label}</span>
                ))}
              </div>
            </div>
          </div>

          {rowsContent}
        </div>
      )}

      {/* Legend */}
      <div className={styles.leg}>
        <span className={styles.lg}>
          <span className={styles.d} style={{ background: "var(--done)" }} />
          Completed
        </span>
        <span className={styles.lg}>
          <span
            className={styles.d}
            style={{ background: "var(--brand-500)" }}
          />
          In progress
        </span>
        <span className={styles.lg}>
          <span className={styles.d} style={{ background: "var(--faint)" }} />
          Not started
        </span>
        <span className={styles.lg}>
          <span className={styles.d} style={{ background: "var(--catchup)" }} />
          Skipped
        </span>
      </div>
    </div>
  );
}
