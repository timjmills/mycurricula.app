"use client";

// YearView — the full Year tab composition (desktop / tablet).
//
// Layout: [main column] (the YearSidebar rail was unmounted — every
// item was an inert "coming soon" affordance; see import block below).
// The main column contains a page header, an in-page Roadmap | Progression
// toggle wired to viewMode, a status filter pill bar, and a single shared
// horizontally scrolling container holding the sticky QuarterMonthWeekHeader
// + the active view's lane stack. A bottom stat strip shows live totals.
//
// The global Grid|List pill in the top bar and the in-page toggle both
// control the same viewMode — they stay in sync automatically since they
// both read/write useAppState().viewMode.
//
// Active subject for the chameleon header is lifted here: the inner view
// observes its lanes via IntersectionObserver and calls
// `onActiveSubjectChange(sid)`; YearView feeds that into the
// QuarterMonthWeekHeader.

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import { SUBJECTS, CURRENT_WEEK } from "@/lib/mock";
import {
  allYearWeeksFor,
  allYearMonthsFor,
  monthIndexForWeekFor,
} from "@/lib/year-calendar";
import { useAcademicYear } from "@/lib/use-academic-year";
import { ToggleGroup, Tooltip } from "@/components/ui";
// YearSidebar is intentionally not mounted — every rail item is a
// disabled "coming soon" affordance, and "Students" violates the
// teacher-only product scope (CLAUDE.md §1). The component file is
// retained so individual icons can be wired in a later wave.
import { RoadmapView } from "./RoadmapView";
import { ProgressionView } from "./ProgressionView";
import { QuarterMonthWeekHeader } from "./QuarterMonthWeekHeader";
import { StatusFilterBar } from "./StatusFilterBar";
import { MonthPicker } from "./MonthPicker";
import { CurriculumFilter, useCurriculumFilter } from "./CurriculumFilter";
import { TODAY_PULSE_EVENT } from "./TodayMarker";
import type { StatusFilterId } from "./StatusFilterBar";
import type { SubjectId } from "@/lib/types";
import styles from "./YearView.module.css";

// ── Inline icons ──────────────────────────────────────────────────────────

const IconCal = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 9h18M8 3v4M16 3v4" />
  </svg>
);

const IconFilter = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M4 4h16l-6 8v6l-4 2v-8z" />
  </svg>
);

const IconExport = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
);

const IconPrint = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <path d="M6 9V3h12v6" />
    <rect x="4" y="9" width="16" height="9" rx="1.5" />
    <path d="M6 14h12v6H6z" />
  </svg>
);

const IconRoadmap = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M3 12h6l3-8 3 16 3-8h3" />
  </svg>
);

const IconProgression = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </svg>
);

const IconBook = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 0-2 2V5z" />
    <path d="M4 21a2 2 0 0 1 2-2h13" />
  </svg>
);

const IconLayers = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
  </svg>
);

const IconUsers = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
    <circle cx="10" cy="7" r="4" />
    <path d="M21 21v-2a4 4 0 0 0-3-3.9M15 3.1a4 4 0 0 1 0 7.8" />
  </svg>
);

// ── Bottom stat strip ──────────────────────────────────────────────────────

function StatItem({
  icon: Icon,
  label,
  value,
  caption,
}: {
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
  caption?: string;
}) {
  return (
    <div className={styles.statItem}>
      <span className={styles.statIcon} aria-hidden="true">
        <Icon width={20} height={20} />
      </span>
      <div>
        <div className={styles.statLabel}>{label}</div>
        <div className={styles.statValue}>{value}</div>
        {caption && <div className={styles.statCaption}>{caption}</div>}
      </div>
    </div>
  );
}

// ── Layout constants ──────────────────────────────────────────────────────

/** Width in px of each week column. Must match RoadmapView's WEEK_COL_PX.
 *  Tightened 2026-05-25: 120 → 96 (~20% reduction) so the default 100% zoom
 *  shows ~25% more weeks per screen — matches what users reported feeling
 *  right at 80% browser zoom. */
const COLUMN_WIDTH_PX = 96;
/** Width in px of the left lane-card rail. Must match RoadmapView's grid. */
const LEFT_RAIL_WIDTH_PX = 200;

// ── Component ─────────────────────────────────────────────────────────────

export function YearView() {
  const { viewMode, setViewMode } = useAppState();
  const { lessons } = usePlanner();

  // CURRENT_WEEK is 1-based; convert to 0-based for index math.
  const currentWeekIdx = CURRENT_WEEK - 1;

  // ── Curriculum (subject) filter ──────────────────────────────────────
  const {
    subjectFilter,
    selectedIds: curriculumSelectedIds,
    setSelectedIds: setCurriculumSelectedIds,
  } = useCurriculumFilter();

  // ── Status filter state ───────────────────────────────────────────────
  const [activeFilters, setActiveFilters] = useState<Set<StatusFilterId>>(
    () => new Set(["all"] as StatusFilterId[]),
  );

  const handleFilterToggle = (id: StatusFilterId) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (id === "all") {
        return new Set(["all"] as StatusFilterId[]);
      }
      if (next.has(id)) {
        next.delete(id);
        if (next.size === 0) next.add("all");
      } else {
        next.delete("all");
        next.add(id);
      }
      return next;
    });
  };

  const handleFilterClear = () =>
    setActiveFilters(new Set(["all"] as StatusFilterId[]));

  // ── Academic year range (TEAM-scoped via useAcademicYear) ─────────────
  // The Roadmap + Progression timelines derive their column count + month
  // bands from the configured (start, end) pair so the visible year mirrors
  // the school's actual calendar. Defaults: first Sunday in August through
  // last Friday in June (~46-47 weeks). Settings → Curriculum → Academic
  // year dates lets the user override.
  const { start: yearStart, end: yearEnd } = useAcademicYear();

  // ── Full-year calendar data ──────────────────────────────────────────
  const months = useMemo(
    () => allYearMonthsFor(yearStart, yearEnd),
    [yearStart, yearEnd],
  );
  const weeks = useMemo(
    () => allYearWeeksFor(yearStart, yearEnd),
    [yearStart, yearEnd],
  );

  // ── Shared horizontal scroll + scrollToWeek ──────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToWeek = useCallback((weekIdx: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const target =
      LEFT_RAIL_WIDTH_PX +
      weekIdx * COLUMN_WIDTH_PX +
      COLUMN_WIDTH_PX / 2 -
      el.clientWidth / 2;
    const left = Math.max(0, target);
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({
      left,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, []);

  // ── Auto-center on today on mount ────────────────────────────────────
  useEffect(() => {
    // Defer to next frame so the scroll container has its final width.
    const raf = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const target =
        LEFT_RAIL_WIDTH_PX +
        currentWeekIdx * COLUMN_WIDTH_PX +
        COLUMN_WIDTH_PX / 2 -
        el.clientWidth / 2;
      el.scrollLeft = Math.max(0, target); // instant on first mount
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Active month for the MonthPicker ─────────────────────────────────
  // For now derived from today; a future wave can update this on scroll.
  const activeMonthIdx = useMemo(
    () => monthIndexForWeekFor(currentWeekIdx, yearStart, yearEnd),
    [currentWeekIdx, yearStart, yearEnd],
  );

  const handlePickMonth = (monthIdx: number) => {
    const band = months[monthIdx];
    if (!band) return;
    scrollToWeek(band.startWeekIdx);
  };

  // ── Active subject (chameleon driver) ─────────────────────────────────
  const [activeSubjectId, setActiveSubjectId] = useState<SubjectId>(
    SUBJECTS[0].id as SubjectId,
  );

  // ── Stat strip values ─────────────────────────────────────────────────
  const totalUnits = new Set(lessons.map((l) => l.unit)).size;
  const totalLessons = lessons.length;
  const activeLanes = SUBJECTS.length;
  const weeksInView = weeks.length;

  return (
    <div className={styles.page} data-route="year">
      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <h1 className={styles.pageTitle}>Yearly View</h1>
          <p className={styles.pageSubtitle}>
            High-level roadmap of units across your curriculum
          </p>
        </div>
        <div className={styles.pageHeaderActions}>
          <button
            type="button"
            className={styles.actionBtn}
            aria-label="Go to today"
            title="Scroll the year roadmap back to the current week — the today marker pulses to confirm"
            onClick={() => {
              scrollToWeek(currentWeekIdx);
              // m4 fix: dispatch a pulse event so every mounted TodayMarker
              // briefly flashes — confirms the click registered even when
              // the timeline is already centered (scrollTo is a no-op).
              // TodayMarker honors prefers-reduced-motion internally.
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent(TODAY_PULSE_EVENT));
              }
            }}
          >
            <IconCal width={15} height={15} />
            Today
          </button>

          <MonthPicker
            activeMonthIdx={activeMonthIdx}
            onPickMonth={handlePickMonth}
          />

          <CurriculumFilter
            selectedIds={curriculumSelectedIds}
            onChange={setCurriculumSelectedIds}
          />

          {/* Print → dedicated /year/print route that re-flows the timeline
              as a vertical month-stack (audit M4, recommended Option 2 in
              docs/research-deferred-year-items-2026-05-25.md). Uses <Link>
              so it works without JS and remains keyboard-accessible. */}
          <Tooltip
            content="Open a paper-friendly print layout — the year roadmap re-flows as a vertical month-stack for clean printouts and PDFs"
            side="bottom"
          >
            <Link
              href="/year/print"
              className={styles.actionBtn}
              aria-label="Print this year"
              title="Open a paper-friendly print layout of the year roadmap"
            >
              <IconPrint width={14} height={14} />
              Print
            </Link>
          </Tooltip>

          {/* Filters + Export are decorative placeholders until Phase 1B
              wires them to the left filter panel and a CSV/PDF export. The
              `disabled` + `aria-disabled` + Tooltip pattern matches
              YearSidebar's "coming soon" affordances so the precedent is
              consistent across the Year route. */}
          <Tooltip content="Filters — coming soon" side="bottom">
            <button
              type="button"
              className={styles.actionBtn}
              aria-label="Filters — coming soon"
              aria-disabled="true"
              disabled
              title="Coming soon"
            >
              <IconFilter width={14} height={14} />
              Filters
            </button>
          </Tooltip>
          <Tooltip content="Export — coming soon" side="bottom">
            <button
              type="button"
              className={styles.actionBtn}
              aria-label="Export — coming soon"
              aria-disabled="true"
              disabled
              title="Coming soon"
            >
              <IconExport width={14} height={14} />
              Export
            </button>
          </Tooltip>
        </div>
      </div>

      {/* ── Main body ────────────────────────────────────────────────── */}
      <div className={styles.body}>
        <div className={styles.contentArea}>
          {/* In-page Roadmap | Progression toggle.
              ── Touch-target note (M5 follow-up, 2026-05-25 audit) ─────────
              The audit flagged these options at 102×34 / 116×34 px, below
              the WCAG 2.5.5 / CLAUDE.md §4 44px tap-target floor on phone +
              tablet. The visible chip stays 34px tall by design, but the
              ToggleGroup primitive already inflates the hit area to ≥44×44
              via a `::before` pseudo-element at `@media (max-width: 900px)`
              (see components/ui/ToggleGroup.module.css). The audit tool
              measured getBoundingClientRect(), which reports the chip box,
              not the inflated hit area — so this is compliant in practice.
              No local fix needed; if a future visual-redesign wave bumps
              the chip height itself, do it in the shared primitive so every
              consumer benefits at once. */}
          <div className={styles.controls}>
            <ToggleGroup
              variant="prominent"
              options={[
                {
                  value: "grid",
                  label: "Roadmap",
                  icon: <IconRoadmap width={14} height={14} />,
                },
                {
                  value: "list",
                  label: "Progression",
                  icon: <IconProgression width={14} height={14} />,
                },
              ]}
              value={viewMode}
              onChange={setViewMode}
              ariaLabel="Year view mode"
            />

            <StatusFilterBar
              active={activeFilters}
              onToggle={handleFilterToggle}
              onClear={handleFilterClear}
            />
          </div>

          {/* Shared horizontal scroll container — owns the only overflow-x
              on this page. The QuarterMonthWeekHeader sticks to the top of
              this container; the active view renders only lane rows. */}
          <div ref={scrollRef} className={styles.timelineScroll}>
            <QuarterMonthWeekHeader
              months={months}
              weeks={weeks}
              todayWeekIdx={currentWeekIdx}
              columnWidthPx={COLUMN_WIDTH_PX}
              leftRailWidthPx={LEFT_RAIL_WIDTH_PX}
              subjectId={activeSubjectId}
            />

            <div className={styles.viewBody}>
              {viewMode === "grid" ? (
                <RoadmapView
                  onActiveSubjectChange={setActiveSubjectId}
                  subjectFilter={subjectFilter}
                />
              ) : (
                <ProgressionView
                  onActiveSubjectChange={setActiveSubjectId}
                  subjectFilter={subjectFilter}
                />
              )}
            </div>
          </div>

          {/* Bottom stat strip */}
          <div className={styles.statStrip}>
            <StatItem
              icon={IconLayers}
              label="Total Units"
              value={String(totalUnits)}
            />
            <StatItem
              icon={IconBook}
              label="Total Lessons"
              value={String(totalLessons)}
            />
            <StatItem
              icon={IconCal}
              label="Weeks in View"
              value={`${weeksInView} weeks`}
              caption="Full school year"
            />
            <StatItem
              icon={IconUsers}
              label="Active Curriculum Lanes"
              value={String(activeLanes)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
