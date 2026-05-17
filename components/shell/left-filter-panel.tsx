"use client";

// left-filter-panel.tsx — collapsible left rail that drives the planner-wide
// filters: subjects, units, completion status, standards, and the holiday
// toggle. Reads and writes via useAppState(); the filters themselves are held
// in app-state.tsx — this component is purely presentational + wiring.
//
// CSS Modules keep scoped styles in left-filter-panel.module.css.
// All color, type, and spacing come through CSS custom properties (tokens.css).
// No hex values or raw px sizes here.

import type { ReactNode } from "react";
import { useAppState } from "@/lib/app-state";
import { SUBJECTS, UNITS, describeStandard } from "@/lib/mock";
import type { SubjectId, LessonStatus } from "@/lib/types";
import styles from "./left-filter-panel.module.css";

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

// ── Standards to show in the filter ─────────────────────────────────────────
// We surface a curated handful rather than the full 15-entry map so the panel
// stays compact. A future increment can make this configurable per teacher.

const FILTER_STANDARD_CODES = [
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
  const { filters, updateFilters, resetFilters, leftPanelOpen } = useAppState();

  // When the panel is closed, render nothing — the shell layout animates
  // the width to 0 via .panelClosed; hiding here removes the element from
  // the accessibility tree as well.
  const panelClass = leftPanelOpen
    ? styles.panel
    : `${styles.panel} ${styles.panelClosed}`;

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

  const allUnits = Object.values(UNITS);

  return (
    <aside className={`cp-root ${panelClass}`} aria-label="Filters">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <span className={styles.headerTitle}>Filters</span>
        {hasActiveFilters && (
          <button
            type="button"
            className={styles.clearBtn}
            onClick={resetFilters}
            aria-label="Clear all filters"
          >
            Clear all
          </button>
        )}
      </div>

      {/* ── Scrollable body ──────────────────────────────────────────────── */}
      <div className={styles.body}>
        {/* ── 1. Subject filter ──────────────────────────────────────────── */}
        <section className={styles.section}>
          <p className={styles.sectionLabel}>Subject</p>
          <div className={styles.chips}>
            {SUBJECTS.map((subj) => {
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
          <p className={styles.sectionLabel}>Unit</p>
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
          <p className={styles.sectionLabel}>Status</p>
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
        <section className={styles.section}>
          <p className={styles.sectionLabel}>Standards</p>
          <div className={styles.standardList}>
            {FILTER_STANDARD_CODES.map((code) => {
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

        {/* ── 5. Holiday / Ramadan toggle ────────────────────────────────── */}
        <div className={styles.switchRow}>
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
      </div>
    </aside>
  );
}
