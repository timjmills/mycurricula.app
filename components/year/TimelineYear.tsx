"use client";

// TimelineYear — the production Year view (now the app's single curriculum
// surface, after the Curriculum view was merged in). It is a progressive drill:
//
//   ALL subjects (the timeline)  →  focus a SUBJECT  →  a UNIT  →  a WEEK  →
//   a LESSON (the right-hand detail pane).
//
// A LEFT subjects sidebar drives the focus; a breadcrumb walks back up. The
// dashboard (YearStatCards) and the standards coverage re-scope to wherever you
// are. At the "all" level the center is the all-subjects timeline (one row per
// subject, equal-width unit cards under a decorative month/year axis); deeper
// levels render that subject's units → weeks → day cards.
//
// The merged view owns its OWN selected-lesson state and renders its OWN tabbed
// lesson pane (YearLessonPane); it deliberately never writes the global
// selectedLessonId, so the shell slide-out never double-mounts on /year (the
// old Curriculum dual-panel bug — see right-panel.tsx `/year` gate).
//
// Everything is wired to the LIVE planner store via usePlanner(). Visual
// contract: each subject row/card carries `.cp-subj.<id>` so the palette bridge
// tokens cascade. Tokens only — no hex.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type SVGProps,
} from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/lib/app-state";
import { useTheme } from "@/lib/theme";
import { usePlanner } from "@/lib/planner-store";
import { useNotebookState } from "@/lib/notebook-state";
import { CURRENT_WEEK } from "@/lib/mock";
import { useAcademicYear } from "@/lib/use-academic-year";
import { weeksInRange } from "@/lib/year-calendar";
import type {
  Lesson,
  LessonStatus,
  Subject,
  SubjectId,
  Unit,
} from "@/lib/types";
import { YearStatCards } from "./YearStatCards";
import { YearSubjectsSidebar } from "./YearSubjectsSidebar";
import { YearBreadcrumb } from "./YearBreadcrumb";
import { YearLessonPane } from "./YearLessonPane";
import { YearDayCards } from "./YearDayCards";
import {
  YearConstellation,
  type ConstellationCluster,
} from "./YearConstellation";
import { StandardsCoveragePanel } from "./StandardsCoveragePanel";
import {
  YearFiltersPopover,
  type YearFilterState,
  type YearStatusKey,
} from "./YearFiltersPopover";
import type { YearScope } from "./year-scope";
import { standardsCoverage } from "@/lib/year-standards-coverage";
import { Button } from "@/components/ui";
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
/** Chevron pointing right — "drill in" affordance on cards. */
const IconChevRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);
const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);

// ── Derived shapes ──────────────────────────────────────────────────────────

/** One week inside a unit, derived from that unit's lessons. */
interface WeekGroup {
  week: number;
  lessons: Lesson[];
  state: "done" | "cur" | "todo";
}

/** A unit with its lessons grouped into weeks. */
interface UnitGroup {
  unit: Unit;
  spanLabel: string;
  start: number;
  end: number;
  weeks: WeekGroup[];
  total: number;
}

interface MonthSeg {
  month: number;
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

/** Map a lesson's status to one of the four Year filter keys. */
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

/** Parse a unit.weeks label like "Wk 11–16" / "Wk 12" into [start, end]. */
function parseSpan(label: string): [number, number] | null {
  const nums = label.match(/\d+/g);
  if (!nums || nums.length === 0) return null;
  const a = Number(nums[0]);
  const b = nums.length > 1 ? Number(nums[1]) : a;
  return [Math.min(a, b), Math.max(a, b)];
}

/** Build the per-subject unit groups from the live lessons + unit catalog. */
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

  return groups.sort((a, b) => a.start - b.start);
}

/** Strip the "Unit N · " lead-in so a card can show prefix + title separately. */
function splitUnitName(name: string): { prefix: string; rest: string } {
  const idx = name.indexOf("·");
  if (idx === -1) return { prefix: "", rest: name.trim() };
  return {
    prefix: name.slice(0, idx).trim(),
    rest: name.slice(idx + 1).trim(),
  };
}

/** Does this unit contain at least one lesson in one of the selected statuses? */
function unitMatchesStatuses(group: UnitGroup, statuses: string[]): boolean {
  if (statuses.length === 0) return true;
  return group.weeks.some((w) =>
    w.lessons.some((l) => statuses.includes(lessonStatusKey(l.status))),
  );
}

/** True when every one of a unit's lessons is done (sidebar check). */
function unitAllDone(g: UnitGroup): boolean {
  return g.total > 0 && g.weeks.every((w) => w.state === "done");
}

// ── Component ───────────────────────────────────────────────────────────────

export function TimelineYear(): ReactNode {
  const { lessons, subjects, units: allUnits } = usePlanner();
  const { viewMode, setViewMode, filters, updateFilters } = useAppState();
  const router = useRouter();
  // W3.7 — the v2 frame axis picks the ALL-scope center (see the `center`
  // selection below): Frame C (color) reads the year as a per-subject
  // constellation of unit-progress discs (YearConstellation, the bundle's
  // "YearC"); glass/paper keep the subject-rows timeline. Deeper scopes
  // (subject/unit/week) keep the existing UI on every frame — same seam
  // pattern as WeeklyShell.renderGridPanel (frame is the LAST gate).
  const { frame } = useTheme();

  // Active notebook = the grade level whose curriculum this Year view shows.
  // The subject-row caption must name it dynamically (never a hard-coded grade —
  // CLAUDE.md §6). Resolved the same way the SideNav NotebookSwitcher does, from
  // the shared notebook-state context. On the mock/OFF path this is the single
  // active notebook ("Grade 5"), so the rendering is unchanged locally; on a
  // real multi-notebook workspace it tracks the selected grade.
  const { activeNotebooks, activeNotebookId } = useNotebookState();
  const gradeLabel =
    (
      activeNotebooks.find((nb) => nb.gradeLevelId === activeNotebookId) ??
      activeNotebooks[0]
    )?.name ?? "";

  // Global standards filter (shared with Weekly via app-state). Active when any
  // code is selected; narrows the lessons SHOWN (timeline units, week cards, day
  // cards) but never the dashboard/coverage denominators (those stay scope-only
  // so the numbers are stable — the approved "scope-only dashboard" rule).
  const standardsFilter = filters.standards;
  const standardsActive = standardsFilter.length > 0;
  const lessonMatchesStandards = useCallback(
    (l: Lesson): boolean =>
      !standardsActive || standardsFilter.some((c) => l.standards.includes(c)),
    [standardsActive, standardsFilter],
  );
  const toggleStandard = useCallback(
    (code: string) => {
      const next = standardsFilter.includes(code)
        ? standardsFilter.filter((c) => c !== code)
        : [...standardsFilter, code];
      updateFilters({ standards: next });
    },
    [standardsFilter, updateFilters],
  );
  const clearStandards = useCallback(
    () => updateFilters({ standards: [] }),
    [updateFilters],
  );

  // Standards coverage panel (opened from the STANDARDS stat card OR the toolbar).
  const [coverageOpen, setCoverageOpen] = useState(false);

  // Subjects rail slide-over (narrow viewports only; inline + sticky on desktop).
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Team-scoped academic-year window (drives the month/year axis labels).
  const { start: yearStart, end: yearEnd } = useAcademicYear();

  // ── Drill scope + selected lesson (both local to this view) ──────────────
  const [scope, setScope] = useState<YearScope>({ level: "all" });
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);

  // ── `?subject=<id>` deep link (from the retired /subject/[slug] redirect or
  //    the command palette / `g s` shortcut) — drill straight to that subject.
  //    Read from the URL on mount (client-only, so no Suspense boundary is
  //    needed), applied once the catalog has the subject. The ref guards
  //    against re-applying after the teacher navigates away from the subject.
  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current) return;
    if (typeof window === "undefined") return;
    const param = new URLSearchParams(window.location.search).get("subject");
    if (!param) {
      deepLinkApplied.current = true;
      return;
    }
    // Wait for the catalog to carry the subject (it hydrates async under the
    // Supabase flag); only then is the slug resolvable.
    if (subjects.some((s) => s.id === param)) {
      setScope({ level: "subject", subjectId: param as SubjectId });
      deepLinkApplied.current = true;
    }
  }, [subjects]);

  // Grid/List preference (only governs the all-subjects timeline).
  const storedHier = viewMode;

  // Small-screen fallback for the all-subjects timeline.
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

  const hier = isNarrow ? "list" : storedHier;
  const isGrid = hier !== "list";

  // Filter state — subjects + statuses (all-subjects timeline only).
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

  // Archived-excluded lessons (the store keeps soft-deleted rows in `lessons`).
  const visibleLessons = useMemo(
    () => lessons.filter((l) => !l.archived),
    [lessons],
  );

  // ── Scoped lesson set → drives the dashboard + standards coverage ────────
  const scopedLessons = useMemo(() => {
    if (scope.level === "all") return visibleLessons;
    let ls = visibleLessons.filter((l) => l.subject === scope.subjectId);
    if (scope.level === "subject") return ls;
    ls = ls.filter((l) => l.unit === scope.unitId);
    if (scope.level === "unit") return ls;
    return ls.filter((l) => l.week === scope.week);
  }, [scope, visibleLessons]);

  // ── Focused entities derived from scope ──────────────────────────────────
  const focusedEntry =
    scope.level === "all"
      ? null
      : (subjectGroups.find((sg) => sg.subject.id === scope.subjectId) ?? null);
  const focusedSubject = focusedEntry?.subject ?? null;
  const focusedGroups = focusedEntry?.groups ?? [];
  const focusedUnit =
    scope.level === "unit" || scope.level === "week"
      ? (focusedGroups.find((g) => g.unit.id === scope.unitId) ?? null)
      : null;
  const focusedWeek =
    scope.level === "week" && focusedUnit
      ? (focusedUnit.weeks.find((w) => w.week === scope.week) ?? null)
      : null;

  // Day-card lessons for the current week (also the prev/next pool for the
  // pane). Narrowed by the active standards filter so the leaf view reflects it.
  const weekLessons = useMemo(
    () =>
      focusedWeek ? focusedWeek.lessons.filter(lessonMatchesStandards) : [],
    [focusedWeek, lessonMatchesStandards],
  );

  // ── Standards coverage for the current scope (scope-only; matches the
  //    STANDARDS stat card numbers exactly). ────────────────────────────────
  const coverage = useMemo(
    () => standardsCoverage(scopedLessons),
    [scopedLessons],
  );

  // The selected lesson + its subject (for the pane).
  const selectedLesson = selectedLessonId
    ? (visibleLessons.find((l) => l.id === selectedLessonId) ?? null)
    : null;
  const selectedSubject = selectedLesson
    ? (subjects.find((s) => s.id === selectedLesson.subject) ?? null)
    : null;

  // Sidebar data.
  const sidebarSubjects = useMemo(
    () =>
      subjectGroups.map(({ subject, groups }) => ({
        id: subject.id,
        name: subject.name,
        cls: subject.cls,
        icon: subject.icon,
        units: groups.map((g) => ({
          id: g.unit.id,
          label: splitUnitName(g.unit.name).rest || g.unit.name,
          done: unitAllDone(g),
        })),
      })),
    [subjectGroups],
  );

  // ── Scope navigation ─────────────────────────────────────────────────────
  const goAll = useCallback(() => {
    setScope({ level: "all" });
    setSelectedLessonId(null);
    setSidebarOpen(false);
  }, []);
  const goSubject = useCallback((subjectId: SubjectId) => {
    setScope({ level: "subject", subjectId });
    setSelectedLessonId(null);
    setSidebarOpen(false);
  }, []);
  const goUnit = useCallback((subjectId: SubjectId, unitId: string) => {
    setScope({ level: "unit", subjectId, unitId });
    setSelectedLessonId(null);
    setSidebarOpen(false);
  }, []);
  const goWeek = useCallback(
    (subjectId: SubjectId, unitId: string, week: number) => {
      setScope({ level: "week", subjectId, unitId, week });
      setSelectedLessonId(null);
    },
    [],
  );
  // Breadcrumb "back to subject/unit" use the current scope's ids.
  const backToSubject = useCallback(() => {
    if (scope.level !== "all") goSubject(scope.subjectId);
  }, [scope, goSubject]);
  const backToUnit = useCallback(() => {
    if (scope.level === "unit" || scope.level === "week")
      goUnit(scope.subjectId, scope.unitId);
  }, [scope, goUnit]);

  const openInDaily = useCallback(
    (id: string) => router.push(`/daily?lesson=${encodeURIComponent(id)}`),
    [router],
  );

  // ── Month / year axis (all-subjects timeline only) ───────────────────────
  const yearStartMs = yearStart.getTime();
  const yearEndMs = yearEnd.getTime();
  const axis = useMemo(() => {
    let lastUnitWeek = 0;
    for (const { groups } of subjectGroups) {
      for (const g of groups) {
        if (g.end > lastUnitWeek) lastUnitWeek = g.end;
      }
    }
    const lo = Math.min(yearStartMs, yearEndMs);
    const hi = Math.max(yearStartMs, yearEndMs);
    const start = new Date(lo);
    const end = new Date(hi);
    const configWeeks = weeksInRange(start, end);
    const totalWeeks = Math.max(configWeeks, lastUnitWeek, 1);

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

    const now = Date.now();
    let todayFrac: number | null = null;
    if (now >= lo && now <= hi) {
      const elapsedWeeks = Math.floor((now - lo) / MS_PER_WEEK);
      todayFrac = Math.min(1, Math.max(0, (elapsedWeeks + 0.5) / totalWeeks));
    }

    const yearA = Math.min(start.getFullYear(), end.getFullYear());
    const yearB = Math.max(start.getFullYear(), end.getFullYear());

    return { totalWeeks, months, todayFrac, yearA, yearB };
  }, [subjectGroups, yearStartMs, yearEndMs]);

  // ── All-subjects timeline (the "all" scope center) ───────────────────────
  const showToday = isGrid && axis.todayFrac != null;
  const rowsStyle = showToday
    ? ({ "--today-frac": axis.todayFrac } as CSSProperties)
    : undefined;

  function renderUnitCard(
    subjectId: SubjectId,
    g: UnitGroup,
    onClick: () => void,
  ): ReactNode {
    const { prefix, rest } = splitUnitName(g.unit.name);
    return (
      <div key={g.unit.id} className={styles.unode}>
        <button
          type="button"
          className={styles.unit}
          onClick={onClick}
          title={g.unit.name}
        >
          <div className={styles.un}>{prefix || rest}</div>
          {prefix ? <div className={styles.us}>{rest}</div> : null}
          <div className={styles.uw}>{g.spanLabel}</div>
        </button>
      </div>
    );
  }

  const rowsContent = (
    <div className={styles.rows} style={rowsStyle}>
      {showToday ? (
        <div className={styles.todayline} aria-hidden="true" />
      ) : null}

      {subjectGroups
        .filter(
          ({ subject }) =>
            filterSubjects.length === 0 || filterSubjects.includes(subject.id),
        )
        .map(({ subject, groups }) => {
          const visibleGroups = groups.filter(
            (g) =>
              unitMatchesStatuses(g, filterStatuses) &&
              (!standardsActive ||
                g.weeks.some((w) => w.lessons.some(lessonMatchesStandards))),
          );
          return (
            <div
              key={subject.id}
              // Stable probe/e2e hook: the drill view is the default Year
              // surface, and the §4c hydrate gate asserts rendered subjects
              // here (data-year-lane only exists in the YearA lane mode).
              data-year-subject={subject.id}
              className={`${styles.rowwrap} ${styles.tlVars} cp-subj ${subject.cls}`}
            >
              <div className={styles.subrow}>
                <button
                  type="button"
                  className={styles.slabel}
                  onClick={() => goSubject(subject.id)}
                  title={`Focus ${subject.name}`}
                >
                  <span className={styles.si} aria-hidden="true">
                    {subject.icon}
                  </span>
                  <div>
                    <div className={styles.sn}>{subject.name}</div>
                    {gradeLabel ? (
                      <div className={styles.sg}>{gradeLabel}</div>
                    ) : null}
                  </div>
                </button>

                <div className={styles.units}>
                  {groups.length === 0 ? (
                    <div className={styles.norow}>No units planned yet.</div>
                  ) : visibleGroups.length === 0 ? (
                    <div className={styles.norow}>
                      No units match the current filters.
                    </div>
                  ) : (
                    visibleGroups.map((g) =>
                      renderUnitCard(subject.id, g, () =>
                        goUnit(subject.id, g.unit.id),
                      ),
                    )
                  )}
                </div>
              </div>
            </div>
          );
        })}
    </div>
  );

  // ── Frame-C constellation data (W3.7, bundle ~6336) ─────────────────────
  // One cluster per subject in subjectGroups order; nodes are the SAME unit
  // groups the timeline rows render, narrowed by the SAME filters (subject
  // chips, status, standards) — keep these predicates in lockstep with
  // rowsContent above. Per-unit progress = done lessons / all lessons.
  const showConstellation = frame === "color" && scope.level === "all";
  const constellationClusters = useMemo<ConstellationCluster[]>(() => {
    if (frame !== "color") return [];
    return subjectGroups
      .filter(
        ({ subject }) =>
          filterSubjects.length === 0 || filterSubjects.includes(subject.id),
      )
      .map(({ subject, groups }) => ({
        subject,
        hadUnits: groups.length > 0,
        units: groups
          .filter(
            (g) =>
              unitMatchesStatuses(g, filterStatuses) &&
              (!standardsActive ||
                g.weeks.some((w) => w.lessons.some(lessonMatchesStandards))),
          )
          .map((g) => {
            const done = g.weeks.reduce(
              (acc, w) =>
                acc + w.lessons.filter((l) => l.status === "done").length,
              0,
            );
            const { rest } = splitUnitName(g.unit.name);
            return {
              id: g.unit.id,
              label: rest || g.unit.name,
              fullName: g.unit.name,
              done,
              total: g.total,
            };
          }),
      }));
  }, [
    frame,
    subjectGroups,
    filterSubjects,
    filterStatuses,
    standardsActive,
    lessonMatchesStandards,
  ]);

  const allCenter = isGrid ? (
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
  ) : (
    <div className={styles.listWrap}>{rowsContent}</div>
  );

  // ── Subject scope: that subject's units as cards ─────────────────────────
  // Units narrow to those with a lesson matching the active standards filter.
  const subjectUnitGroups = focusedGroups.filter(
    (g) =>
      !standardsActive ||
      g.weeks.some((w) => w.lessons.some(lessonMatchesStandards)),
  );
  const subjectCenter =
    focusedSubject != null ? (
      <div
        className={`${styles.focus} ${styles.tlVars} cp-subj ${focusedSubject.cls}`}
      >
        <h2 className={styles.focusTitle}>
          <span className={styles.si} aria-hidden="true">
            {focusedSubject.icon}
          </span>
          {focusedSubject.name}
          <span className={styles.focusSub}>Units across the year</span>
        </h2>
        {focusedGroups.length === 0 ? (
          <div className={styles.norow}>No units planned yet.</div>
        ) : subjectUnitGroups.length === 0 ? (
          <div className={styles.norow}>
            No units match the current standards filter.
          </div>
        ) : (
          <div className={styles.unitGrid}>
            {subjectUnitGroups.map((g) =>
              renderUnitCard(focusedSubject.id, g, () =>
                goUnit(focusedSubject.id, g.unit.id),
              ),
            )}
          </div>
        )}
      </div>
    ) : null;

  // ── Unit scope: that unit's weeks as cards ───────────────────────────────
  // Weeks narrow to those with a lesson matching the active standards filter.
  const unitWeeks =
    focusedUnit != null
      ? focusedUnit.weeks.filter(
          (w) => !standardsActive || w.lessons.some(lessonMatchesStandards),
        )
      : [];
  const unitCenter =
    focusedSubject != null && focusedUnit != null ? (
      <div
        className={`${styles.focus} ${styles.tlVars} cp-subj ${focusedSubject.cls}`}
      >
        <h2 className={styles.focusTitle}>
          {splitUnitName(focusedUnit.unit.name).rest || focusedUnit.unit.name}
          <span className={styles.focusSub}>
            {focusedUnit.spanLabel} · {focusedUnit.total}{" "}
            {focusedUnit.total === 1 ? "lesson" : "lessons"}
          </span>
        </h2>
        {focusedUnit.weeks.length === 0 ? (
          <div className={styles.norow}>
            No weeks planned for this unit yet.
          </div>
        ) : unitWeeks.length === 0 ? (
          <div className={styles.norow}>
            No weeks match the current standards filter.
          </div>
        ) : (
          <div className={styles.wkGrid}>
            {unitWeeks.map((w) => (
              <button
                key={w.week}
                type="button"
                className={styles.wkCard}
                onClick={() =>
                  goWeek(focusedSubject.id, focusedUnit.unit.id, w.week)
                }
              >
                <span className={styles.wkHead}>
                  Week {w.week}
                  {w.state === "done" ? (
                    <span className={styles.wkDone} aria-label="all done">
                      <IconCheck sw={3} />
                    </span>
                  ) : null}
                </span>
                <span className={styles.wkCount}>
                  {w.lessons.length}{" "}
                  {w.lessons.length === 1 ? "lesson" : "lessons"}
                </span>
                <span className={styles.wkGo} aria-hidden="true">
                  <IconChevRight />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    ) : null;

  // ── Week scope: that week's day cards (rich — pills + status dots) ────────
  const weekCenter =
    focusedSubject != null && focusedUnit != null && focusedWeek != null ? (
      <div
        className={`${styles.focus} ${styles.tlVars} cp-subj ${focusedSubject.cls}`}
      >
        <h2 className={styles.focusTitle}>
          Week {focusedWeek.week}
          <span className={styles.focusSub}>
            {splitUnitName(focusedUnit.unit.name).rest || focusedUnit.unit.name}
          </span>
        </h2>
        {standardsActive &&
        weekLessons.length === 0 &&
        focusedWeek.lessons.length > 0 ? (
          <div className={styles.norow}>
            No lessons in this week match the current standards filter.
          </div>
        ) : (
          <YearDayCards
            lessons={weekLessons}
            selectedId={selectedLessonId}
            onPick={(id) => setSelectedLessonId(id)}
          />
        )}
      </div>
    ) : null;

  // W3.7 frame seam — Frame C swaps the ALL-scope center for the
  // constellation (replacing BOTH the grid timeline and its list fallback:
  // the cluster grid stacks to one column at narrow widths, so it stays the
  // canonical Frame-C read on phone too). Deeper scopes are frame-agnostic.
  let center: ReactNode = showConstellation ? (
    <YearConstellation clusters={constellationClusters} onOpenUnit={goUnit} />
  ) : (
    allCenter
  );
  if (scope.level === "subject") center = subjectCenter;
  else if (scope.level === "unit") center = unitCenter;
  else if (scope.level === "week") center = weekCenter;

  const subjectNameForCrumb = focusedSubject?.name;
  const unitNameForCrumb = focusedUnit
    ? splitUnitName(focusedUnit.unit.name).rest || focusedUnit.unit.name
    : undefined;

  // Human label for the coverage panel header, reflecting the current scope.
  const scopeLabel =
    scope.level === "all"
      ? "the whole year"
      : scope.level === "subject"
        ? (focusedSubject?.name ?? "this subject")
        : scope.level === "unit"
          ? (unitNameForCrumb ?? "this unit")
          : `Week ${scope.week}`;

  return (
    <div className={styles.root} data-hier={hier} data-scope={scope.level}>
      {/* Page heading + the single Filters & View control */}
      <div className={styles.head}>
        <div>
          <div className={styles.eyebrow}>Plan</div>
          <h1>Yearly View</h1>
          <div className={styles.sub}>
            The whole year at a glance — open a subject to plan its units,
            weeks, and daily lessons.
          </div>
        </div>

        <div className={styles.toolbar}>
          {/* Subjects rail toggle — only shown on narrow viewports (CSS), where
              the rail is a slide-over rather than an inline column. */}
          <span className={styles.subjectsToggle}>
            <Button
              variant="secondary"
              size="md"
              onClick={() => setSidebarOpen(true)}
              tooltip="Open the subjects panel to jump between subjects and their units"
            >
              Subjects
            </Button>
          </span>

          <Button
            variant="secondary"
            size="md"
            onClick={() => setCoverageOpen(true)}
            tooltip="See which standards are taught vs. still a gap for the current scope, and the lessons that cover each — click a standard to filter the year to it"
          >
            Standards coverage
          </Button>

          <YearFiltersPopover
            // Grid/List only governs the all-subjects TIMELINE; on Frame C
            // the constellation replaces both variants, so the toggle would
            // be inert — hide it rather than let it click dead (W3.7).
            showViewToggle={scope.level === "all" && !showConstellation}
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
              if (next.view !== storedHier) setViewMode(next.view);
              setFilterSubjects(next.subjects);
              setFilterStatuses(next.statuses);
            }}
            selectedStandards={standardsFilter}
            onToggleStandard={toggleStandard}
            onClearStandards={clearStandards}
            onOpenCoverage={() => setCoverageOpen(true)}
          />
        </div>
      </div>

      {/* Contextual dashboard — re-scopes to the current drill level. The
          STANDARDS card opens the coverage panel. */}
      <div className={styles.statWrap}>
        <YearStatCards
          lessons={scopedLessons}
          onStandardsClick={() => setCoverageOpen(true)}
        />
      </div>

      {/* 3-column shell: subjects sidebar | center | lesson pane */}
      <div className={styles.shell}>
        <YearSubjectsSidebar
          subjects={sidebarSubjects}
          gradeLabel={gradeLabel}
          scope={scope}
          onPickAll={goAll}
          onPickSubject={goSubject}
          onPickUnit={goUnit}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className={styles.center}>
          <YearBreadcrumb
            scope={scope}
            subjectName={subjectNameForCrumb}
            unitName={unitNameForCrumb}
            onAll={goAll}
            onSubject={backToSubject}
            onUnit={backToUnit}
          />
          {center}

          {/* Legend (only meaningful on the all-subjects timeline — the
              Frame-C constellation's node states are subject-colored and
              self-labelled via tooltips, so the timeline's status-dot legend
              would mislead there) */}
          {scope.level === "all" && !showConstellation ? (
            <div className={styles.leg}>
              <span className={styles.lg}>
                <span
                  className={styles.d}
                  style={{ background: "var(--done)" }}
                />
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
                <span
                  className={styles.d}
                  style={{ background: "var(--faint)" }}
                />
                Not started
              </span>
              <span className={styles.lg}>
                <span
                  className={styles.d}
                  style={{ background: "var(--catchup)" }}
                />
                Skipped
              </span>
            </div>
          ) : null}
        </div>

        {selectedLesson && selectedSubject ? (
          <YearLessonPane
            lesson={selectedLesson}
            subject={selectedSubject}
            weekLabel={
              scope.level === "week" ? `Week ${scope.week}` : undefined
            }
            siblings={weekLessons}
            onSelect={(id) => setSelectedLessonId(id)}
            onClose={() => setSelectedLessonId(null)}
            onOpenInDaily={() => openInDaily(selectedLesson.id)}
          />
        ) : null}
      </div>

      {/* Scrim behind the narrow-viewport slide-overs (subjects rail + lesson
          pane). Hidden on desktop via CSS even when an overlay's state is set
          (there the rail/pane are inline columns). Click closes both. */}
      {sidebarOpen || selectedLesson ? (
        <div
          className={styles.scrim}
          onClick={() => {
            setSidebarOpen(false);
            setSelectedLessonId(null);
          }}
          aria-hidden="true"
        />
      ) : null}

      {coverageOpen ? (
        <StandardsCoveragePanel
          coverage={coverage}
          scopeLabel={scopeLabel}
          activeStandards={standardsFilter}
          onToggleStandard={toggleStandard}
          onClearStandards={clearStandards}
          onClose={() => setCoverageOpen(false)}
          onOpenLesson={(id) => openInDaily(id)}
        />
      ) : null}
    </div>
  );
}
