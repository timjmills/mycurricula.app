"use client";

// YearView — the full Year tab composition.
//
// Layout: [YearSidebar] [main column].
// The main column contains a page header, an in-page Roadmap | Progression
// toggle wired to viewMode, a status filter pill bar (visual only this wave),
// and either <RoadmapView> (grid) or <ProgressionView> (list) based on
// viewMode. A bottom stat strip shows live-computed totals.
//
// The global Grid|List pill in the top bar and the in-page toggle both
// control the same viewMode — they stay in sync automatically since they
// both read/write useAppState().viewMode.
//
// The icon-rail from (planner)/layout.tsx is still visible on /year;
// YearSidebar sits in the main content area to the left of the view body.
// Hiding the icon-rail via body:has([data-route="year"]) would require editing
// globals.css (outside our file ownership). The current layout is readable and
// functional without that change.

import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import { SUBJECTS } from "@/lib/mock";
import { DEFAULT_WEEKS_IN_VIEW } from "@/lib/year-calendar";
import { YearSidebar } from "./YearSidebar";
import { RoadmapView } from "./RoadmapView";
import { ProgressionView } from "./ProgressionView";
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

const IconChev = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M9 6l6 6-6 6" />
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

// ── Status filter glyphs (inline, no shared import needed) ────────────────
// Colors from canonical tokens: --done for completed, --ink-* for neutral states.

const StatusDot = ({ type }: { type: string }) => {
  const styles_: React.CSSProperties =
    type === "done"
      ? { background: "var(--done)", borderColor: "var(--done)" }
      : type === "current"
        ? { background: "var(--reading-light)", borderColor: "var(--reading)" }
        : type === "skipped"
          ? { background: "#fff", borderColor: "var(--ink-300)" }
          : { background: "var(--ink-100)", borderColor: "var(--ink-200)" };
  return (
    <span
      style={{
        width: 11,
        height: 11,
        borderRadius: "50%",
        border: "1.5px solid",
        flexShrink: 0,
        display: "inline-block",
        ...styles_,
      }}
    />
  );
};

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

// ── Component ─────────────────────────────────────────────────────────────

export function YearView() {
  const { viewMode, setViewMode } = useAppState();
  const { lessons } = usePlanner();

  // Live-computed stat strip values.
  const totalUnits = new Set(lessons.map((l) => l.unit)).size;
  const totalLessons = lessons.length;
  const activeLanes = SUBJECTS.length; // all 8 subjects are active curriculum lanes
  const weeksInView = DEFAULT_WEEKS_IN_VIEW;

  return (
    <div className={styles.page} data-route="year">
      {/* Page header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <h1 className={styles.pageTitle}>Yearly View</h1>
          <p className={styles.pageSubtitle}>
            Day-by-day timeline of every unit across your curriculum
          </p>
        </div>
        <div className={styles.pageHeaderActions}>
          <button className={styles.actionBtn} aria-label="Go to today">
            <IconCal width={15} height={15} />
            Today
          </button>
          <button className={styles.actionBtn} aria-label="Select quarter">
            Quarter 1
            <IconChev width={13} height={13} />
          </button>
          <button className={styles.actionBtn} aria-label="Open filters">
            <IconFilter width={14} height={14} />
            Filters
          </button>
          <button className={styles.actionBtn} aria-label="Export data">
            <IconExport width={14} height={14} />
            Export
          </button>
        </div>
      </div>

      {/* Main body: sidebar + content */}
      <div className={styles.body}>
        <YearSidebar />

        <div className={styles.contentArea}>
          {/* In-page Roadmap | Progression toggle + status filter bar */}
          <div className={styles.controls}>
            {/* View toggle — same state as the top-bar Grid|List pill */}
            <div
              className={styles.viewToggle}
              role="group"
              aria-label="View mode"
            >
              <button
                className={`${styles.toggleBtn} ${viewMode === "grid" ? styles.toggleBtnActive : ""}`}
                onClick={() => setViewMode("grid")}
                aria-pressed={viewMode === "grid"}
              >
                <IconRoadmap width={14} height={14} />
                Roadmap
                <span className={styles.toggleSub}>
                  {viewMode === "grid" ? "Weekly overview" : "Weekly overview"}
                </span>
              </button>
              <button
                className={`${styles.toggleBtn} ${viewMode === "list" ? styles.toggleBtnActive : ""}`}
                onClick={() => setViewMode("list")}
                aria-pressed={viewMode === "list"}
              >
                <IconProgression width={14} height={14} />
                Progression
                <span className={styles.toggleSub}>
                  {viewMode === "list"
                    ? "Day-by-day calendar"
                    : "Day-by-day calendar"}
                </span>
              </button>
            </div>

            {/* Status filter pill bar (visual only — wire in a later wave) */}
            <div
              className={styles.filterBar}
              role="group"
              aria-label="Status filter"
            >
              <span className={styles.filterBarLabel}>Status filter</span>
              <button
                className={`${styles.filterPill} ${styles.filterPillActive}`}
                aria-pressed="true"
              >
                All
              </button>
              {[
                { label: "Completed", type: "done" },
                { label: "In progress", type: "current" },
                { label: "Skipped", type: "skipped" },
                { label: "Not yet encountered", type: "upcoming" },
              ].map((s) => (
                <button
                  key={s.type}
                  className={styles.filterPill}
                  aria-pressed="false"
                >
                  <StatusDot type={s.type} />
                  {s.label}
                </button>
              ))}
              <button
                className={styles.filterClear}
                aria-label="Clear all filters"
              >
                Clear filters
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          </div>

          {/* The active view */}
          <div className={styles.viewBody}>
            {viewMode === "grid" ? <RoadmapView /> : <ProgressionView />}
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
              caption="Academic Q1"
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
