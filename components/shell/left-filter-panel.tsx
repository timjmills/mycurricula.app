"use client";

// left-filter-panel.tsx — collapsible left rail that drives the planner-wide
// filters: subjects, units, completion status, standards, and the holiday
// toggle. Reads and writes via useAppState(); the filters themselves are held
// in app-state.tsx — this component is purely presentational + wiring.
//
// CSS Modules keep scoped styles in left-filter-panel.module.css.
// All color, type, and spacing come through CSS custom properties (tokens.css).
// No hex values or raw px sizes here.
//
// ── Route-aware suppression ─────────────────────────────────────────────────
// The Daily view ships its own slim IconRail in place of the global filter
// panel, so this panel is suppressed on `/daily*`. The Weekly view no longer
// hard-suppresses the panel — the teacher's `leftPanelOpen` toggle controls
// visibility there too (TOPBAR-004: panel must respond to the toggle on all
// routes, not just Subject). We use next/navigation's `usePathname` (which is
// why this file must remain a client component) to detect the active route.
//
// ── STANDARDS list ─────────────────────────────────────────────────────────
// The STANDARDS filter offers a curated global list on the routes where this
// panel renders. The richer, scope-aware standards facet + coverage panel
// lives on the Yearly view (which absorbed the old per-subject Curriculum
// route and its subject-derived standards list).

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import type { SubjectId, LessonStatus } from "@/lib/types";
import { Tooltip } from "@/components/ui/Tooltip";
import styles from "./left-filter-panel.module.css";

// ── Settings gear icon ───────────────────────────────────────────────────────
// Matches the visual vocabulary of the IconRail SettingsIcon
// (components/daily/IconRail.tsx) and the GlobalRail SettingsIcon
// (components/shell/GlobalRail.tsx) so the affordance reads the same across
// every surface. Sized smaller (16×16) for the dense filter-panel header;
// stroke inherits via `currentColor` so the button hover state drives the tint.

function SettingsGearIcon(): ReactNode {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.27.652.875 1.106 1.59 1.18H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// ── Completion status labels ─────────────────────────────────────────────────
// Maps the five LessonStatus values to human-readable filter chip labels.

const STATUS_LABELS: Record<LessonStatus, string> = {
  not_done: "Not done",
  done: "Done",
  carried: "Carried over",
  skipped: "Skipped",
  partial: "Partial",
};

// Ordered array so chips render in a stable, meaningful sequence.
const ALL_STATUSES: LessonStatus[] = [
  "not_done",
  "done",
  "partial",
  "carried",
  "skipped",
];

// ── Global standards list ────────────────────────────────────────────────────
// A curated handful surfaced on the routes where this panel renders. The
// scope-aware standards facet lives on the Yearly view.

const FILTER_STANDARD_CODES_GLOBAL = [
  "5.NF.B.3",
  "5.NF.B.4",
  "RL.5.3",
  "RL.5.6",
  "W.5.3",
  "L.5.1.C",
] as const;

// ── Subject color helper ─────────────────────────────────────────────────────
// Reads the subject color token names so the dot inside each chip reflects
// the active palette without coupling to the PaletteProvider directly.
// We inline the static fallback color via CSS tokens rather than `useSubjectColor`
// to avoid imperative DOM reads inside the chip render loop.

// CSS custom property on the subject class — resolved at paint time.
// The chip dot lives inside a span carrying .cp-subj.<id> so --c resolves to
// the correct subject color for both Normal and Highlight palettes.
const SUBJECT_DOT_COLOR = "var(--c)";

// ── Toggle helpers ───────────────────────────────────────────────────────────

function toggleArrayItem<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((v) => v !== item) : [...arr, item];
}

// ── Component ────────────────────────────────────────────────────────────────

export function LeftFilterPanel(): ReactNode {
  // Hooks first, always — Rules of Hooks require a stable call order across
  // renders, so `usePathname`, `useAppState`, and `usePlanner` all run before
  // any early return below (Rules of Hooks require a stable call order).
  const pathname = usePathname();
  const { filters, updateFilters, resetFilters, leftPanelOpen } = useAppState();
  // Catalog reference data now flows through the planner store (catalog
  // migration). Flag OFF these mirror the mock SUBJECTS / UNITS / describeStandard
  // byte-identically; flag ON they track the hydrated grade catalog.
  const { subjects, activeUnitBySubject, describeStandard } = usePlanner();

  // ── Standards filter list ─────────────────────────────────────────────
  // A curated global handful. (The old per-subject derivation lived on the
  // Curriculum route, which has merged into the Yearly view; the Yearly view
  // now owns its own scope-aware standards facet + coverage panel, so the
  // global panel just offers the curated set on the routes where it renders.)
  const standardCodes: readonly string[] = FILTER_STANDARD_CODES_GLOBAL;

  // Route-based suppression — the Daily view supplies its own slim IconRail
  // in place of the global filter panel (TOPBAR-004). Weekly no longer hard-
  // suppresses: the teacher's leftPanelOpen toggle governs it there as well,
  // so another agent can wire its filter pills to the weekly grid without
  // changing this file. Bailing with `null` keeps the panel entirely out of
  // the DOM and out of the accessibility tree on `/daily*` routes.
  // Suppressed on /daily (own IconRail) and on /year (the merged Yearly view
  // ships its own Filters & View popover + standards facet, so the global
  // filter panel would be redundant/conflicting there).
  if (pathname?.startsWith("/daily") || pathname?.startsWith("/year")) {
    return null;
  }

  // When the panel is closed, return null — keeps the element entirely out
  // of the accessibility tree so screen readers cannot tab into hidden content.
  if (!leftPanelOpen) return null;

  const panelClass = styles.panel;

  // ── Active state helpers ───────────────────────────────────────────────

  const isSubjectActive = (id: SubjectId) => filters.subjects.includes(id);
  const isUnitActive = (id: string) => filters.units.includes(id);
  const isStatusActive = (s: LessonStatus) => filters.statuses.includes(s);
  const isStandardActive = (code: string) => filters.standards.includes(code);

  // Count active filters for the "Clear all" button visibility.
  const hasActiveFilters =
    filters.subjects.length > 0 ||
    filters.units.length > 0 ||
    filters.statuses.length > 0 ||
    filters.standards.length > 0 ||
    !filters.showHolidays;

  // ── Event handlers ─────────────────────────────────────────────────────

  function handleSubjectToggle(id: SubjectId) {
    updateFilters({ subjects: toggleArrayItem(filters.subjects, id) });
  }

  function handleUnitToggle(id: string) {
    updateFilters({ units: toggleArrayItem(filters.units, id) });
  }

  function handleStatusToggle(s: LessonStatus) {
    updateFilters({ statuses: toggleArrayItem(filters.statuses, s) });
  }

  function handleStandardToggle(code: string) {
    updateFilters({ standards: toggleArrayItem(filters.standards, code) });
  }

  function handleHolidayToggle() {
    updateFilters({ showHolidays: !filters.showHolidays });
  }

  // The active-unit-per-subject list (mirrors the mock `Object.values(UNITS)`).
  // activeUnitBySubject is typed Unit | undefined per subject; flag OFF every
  // subject has an active unit, so the filter only guards the type.
  const allUnits = Object.values(activeUnitBySubject).filter(
    (u): u is NonNullable<typeof u> => u != null,
  );

  return (
    <aside className={`cp-root ${panelClass}`} aria-label="Filters">
      {/* ── Header ─────────────────────────────────────────────────────────
          Holds the section title plus two right-aligned affordances:
          a Settings gear (always present) and a conditional "Clear all"
          button shown only when filters are active.

          The Settings entry is intentionally redundant with the
          GlobalRail bottom-pinned gear (components/shell/GlobalRail.tsx),
          the top-bar avatar (components/shell/top-bar.tsx), and the
          /daily IconRail gear (components/daily/IconRail.tsx) — Lane CB
          "belt-and-braces" rationale. Putting Settings here means a
          teacher whose hand is already on the filter panel never has to
          reach across the layout to find it.

          The link is a real <Link> so middle-click / cmd-click / "open
          in new tab" all behave as a teacher expects from a primary
          navigation target. */}
      <div className={styles.header}>
        {/* Panel-header tooltip per CLAUDE.md §4 — teaches a first-time
            teacher what this whole panel is FOR, not just what it's
            named. The styled <Tooltip> primitive paints the black-
            backdrop bubble so it matches every other shell tooltip. */}
        <Tooltip
          content="Narrow what you see across every view by subject, unit, status, or standard. Lessons that don't match are hidden — change here, the whole planner follows."
          side="right"
        >
          <span
            className={styles.headerTitle}
            title="Narrow what you see across every view by subject, unit, status, or standard. Lessons that don't match are hidden — change here, the whole planner follows."
          >
            Filters
          </span>
        </Tooltip>
        <div className={styles.headerActions}>
          <Tooltip
            content="Open your settings — curriculum label, school year, school week, holidays, theme, and more."
            side="bottom"
          >
            <Link
              href="/settings"
              className={styles.settingsLink}
              aria-label="Settings"
              title="Open your settings — curriculum label, school year, school week, holidays, theme, and more."
            >
              <SettingsGearIcon />
              <span className={styles.settingsLabel}>Settings</span>
            </Link>
          </Tooltip>
          {hasActiveFilters && (
            <Tooltip
              content="Reset every filter — show every lesson on every subject again"
              side="bottom"
            >
              <button
                type="button"
                className={styles.clearBtn}
                onClick={resetFilters}
                aria-label="Clear all filters"
                title="Reset every filter — show every lesson on every subject again"
              >
                Clear all
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* ── Scrollable body ──────────────────────────────────────────────── */}
      <div className={styles.body}>
        {/* ── 1. Subject filter ──────────────────────────────────────────── */}
        <section className={styles.section}>
          <Tooltip
            content="Pick one or more subjects to focus on — Math, Reading, Writing, Grammar, Spelling, UFLI, Explorers, SEL. Others hide across every view."
            side="right"
          >
            <p
              className={styles.sectionLabel}
              title="Pick one or more subjects to focus on — Math, Reading, Writing, Grammar, Spelling, UFLI, Explorers, SEL. Others hide across every view."
            >
              Subject
            </p>
          </Tooltip>
          <div className={styles.chips}>
            {subjects.map((subj) => {
              const active = isSubjectActive(subj.id);
              const chipClass = active
                ? `${styles.chip} ${styles.chipActive}`
                : styles.chip;
              return (
                <button
                  key={subj.id}
                  type="button"
                  role="checkbox"
                  aria-checked={active}
                  className={`cp-focusable ${chipClass}`}
                  onClick={() => handleSubjectToggle(subj.id)}
                >
                  {/* Color dot inside a subject-scoped span so --c resolves
                      to the right subject color via the .cp-subj.<id> bridge. */}
                  <span
                    className={`cp-subj ${subj.cls}`}
                    aria-hidden
                    style={{ display: "contents" }}
                  >
                    <span
                      className={styles.chipDot}
                      style={{ background: SUBJECT_DOT_COLOR }}
                    />
                  </span>
                  {subj.name}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── 2. Unit filter ─────────────────────────────────────────────── */}
        <section className={styles.section}>
          <Tooltip
            content="Filter to a specific unit (e.g. Place Value, Realistic Fiction). The week-span chip on the right shows when that unit runs."
            side="right"
          >
            <p
              className={styles.sectionLabel}
              title="Filter to a specific unit (e.g. Place Value, Realistic Fiction). The week-span chip on the right shows when that unit runs."
            >
              Unit
            </p>
          </Tooltip>
          <div className={styles.unitList}>
            {allUnits.map((unit) => {
              const active = isUnitActive(unit.id);
              const itemClass = active
                ? `${styles.unitItem} ${styles.unitItemActive}`
                : styles.unitItem;
              const checkClass = active
                ? `${styles.unitCheck} ${styles.unitCheckActive}`
                : styles.unitCheck;
              return (
                <button
                  key={unit.id}
                  type="button"
                  role="checkbox"
                  aria-checked={active}
                  className={`cp-focusable ${itemClass}`}
                  onClick={() => handleUnitToggle(unit.id)}
                >
                  {/* Checkbox indicator */}
                  <span aria-hidden className={checkClass}>
                    {active && "✓"}
                  </span>
                  {/* Unit name — truncates if needed */}
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: "var(--t-12)",
                    }}
                  >
                    {unit.name}
                  </span>
                  {/* Week span label */}
                  <span className={styles.unitWeeks}>{unit.weeks}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── 3. Completion status filter ────────────────────────────────── */}
        <section className={styles.section}>
          <Tooltip
            content="Show only lessons in a given state — Not done, Done, Partial, Carried over, or Skipped. Useful for catching up on what's left."
            side="right"
          >
            <p
              className={styles.sectionLabel}
              title="Show only lessons in a given state — Not done, Done, Partial, Carried over, or Skipped. Useful for catching up on what's left."
            >
              Status
            </p>
          </Tooltip>
          <div className={styles.chips}>
            {ALL_STATUSES.map((s) => {
              const active = isStatusActive(s);
              const chipClass = active
                ? `${styles.chip} ${styles.chipActive}`
                : styles.chip;
              return (
                <button
                  key={s}
                  type="button"
                  role="checkbox"
                  aria-checked={active}
                  className={`cp-focusable ${chipClass}`}
                  onClick={() => handleStatusToggle(s)}
                >
                  {STATUS_LABELS[s]}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── 4. Standards filter ────────────────────────────────────────── */}
        {/* A curated global standards list. The Yearly view owns the richer,
            scope-aware standards facet + coverage panel. An empty list renders
            the section as a no-op placeholder. */}
        <section className={styles.section}>
          <Tooltip
            content="Filter to lessons that cover a specific standard (CCSS code). The Yearly view has a fuller standards coverage breakdown."
            side="right"
          >
            <p
              className={styles.sectionLabel}
              title="Filter to lessons that cover a specific standard (CCSS code). The Yearly view has a fuller standards coverage breakdown."
            >
              Standards
            </p>
          </Tooltip>
          <div className={styles.standardList}>
            {standardCodes.length === 0 && (
              <p
                style={{
                  fontSize: "var(--t-11)",
                  color: "var(--ink-400)",
                  padding: "var(--r-2) 0",
                }}
              >
                No standards in this subject yet.
              </p>
            )}
            {standardCodes.map((code) => {
              const active = isStandardActive(code);
              const itemClass = active
                ? `${styles.standardItem} ${styles.standardItemActive}`
                : styles.standardItem;
              const codeClass = active
                ? `${styles.standardCode} ${styles.standardCodeActive}`
                : styles.standardCode;
              return (
                <button
                  key={code}
                  type="button"
                  role="checkbox"
                  aria-checked={active}
                  className={`cp-focusable ${itemClass}`}
                  onClick={() => handleStandardToggle(code)}
                >
                  <span className={`cp-mono ${codeClass}`}>{code}</span>
                  <span className={styles.standardDesc}>
                    {describeStandard(code)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── 5. Holiday / Ramadan toggle ──────────────────────────────────
            Wrap in the styled <Tooltip> so the explanation appears on
            hover — same black-bubble treatment as the rest of the panel.
            The inner <label> keeps display:contents so its layout role
            (forwarding clicks to the checkbox) is unchanged. */}
        <Tooltip
          content="Show or hide holiday and Ramadan markers across calendar views. Off = a clean grid with only instructional days."
          side="right"
        >
          <div
            className={styles.switchRow}
            title="Show or hide holiday and Ramadan markers across calendar views. Off = a clean grid with only instructional days."
          >
            {/* Visually-hidden real checkbox drives keyboard / screen-reader. */}
            <label style={{ display: "contents", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={filters.showHolidays}
                onChange={handleHolidayToggle}
                className={styles.switchInput}
                aria-label="Show holiday and Ramadan markers"
              />
              <span className={styles.switchLabel}>
                Holidays / Ramadan
                <span className={styles.switchSub}>
                  Show markers in calendar views
                </span>
              </span>
              {/* Custom toggle track + thumb */}
              <span
                className={
                  filters.showHolidays
                    ? `${styles.switchTrack} ${styles.switchTrackOn}`
                    : styles.switchTrack
                }
                aria-hidden
              >
                <span
                  className={
                    filters.showHolidays
                      ? `${styles.switchThumb} ${styles.switchThumbOn}`
                      : styles.switchThumb
                  }
                />
              </span>
            </label>
          </div>
        </Tooltip>
      </div>
    </aside>
  );
}
