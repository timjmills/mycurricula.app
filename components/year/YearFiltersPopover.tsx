"use client";

// YearFiltersPopover.tsx — the Year page's single "Filters & View" control.
//
// Replaces the old standalone Grid/List segmented toggle on the Year page with
// one pill trigger that opens a popover. The popover bundles three concerns the
// teacher previously had no home for on Year:
//   1. VIEW     — the Grid | List switch (the old segmented control, now here).
//   2. SUBJECTS — show only the picked subjects ([] = every subject).
//   3. STATUS   — show only lessons in the picked completion states ([] = all).
//
// This component is *controlled and dumb about filtering*: it never filters
// anything itself. It renders entirely from `props.value`, and every toggle
// emits the next full YearFilterState up via `onChange`. The Year page owns the
// state and does the actual hiding/showing — same division of labour as the
// global LeftFilterPanel (which writes to app-state, not the views).
//
// ── Idioms reused from the existing component vocabulary ─────────────────────
//   • <Button> (components/ui) for the trigger — never a hand-rolled pill, so it
//     inherits the canonical pill geometry + the cp-root specificity contract.
//   • <ToggleGroup> (components/ui) for the inner Grid|List switch — the
//     canonical segmented primitive (variant="subtle"); no bespoke segmented
//     control, no cp-root button trap for that part.
//   • Subject color dot: a <span class="cp-subj <cls>"> wrapper so `var(--c)`
//     resolves to the subject hue via the palette bridge (lib/palette.tsx) —
//     identical to LeftFilterPanel's chip dot.
//   • The checkbox ROWS are hand-rolled <button role="checkbox"> elements; every
//     button style rule in the CSS module DOUBLES its class (.row.row) to clear
//     the global `.cp-root button` reset (specificity 0,1,1) — see tokens.css.
//
// ── Dismissal ────────────────────────────────────────────────────────────────
// Open state is internal useState. The popover closes on (a) an outside
// mousedown — anywhere outside the root wrapper — and (b) Escape. Both restore
// focus to the trigger. Toggling a filter NEVER closes the popover; only an
// outside click, Escape, or the trigger itself toggles it shut.
//
// Token rules (CLAUDE.md §4): var(--token) only — zero hex, zero raw px font
// sizes. Verified across the 6 themes via the --chrome-accent* / --ink-* /
// semantic-status tokens, all of which are themed in tokens.css.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { ToggleGroup } from "@/components/ui/ToggleGroup";
import type { ToggleOption } from "@/components/ui/ToggleGroup";
import styles from "./year-filters-popover.module.css";

// ── Public contract ──────────────────────────────────────────────────────────

/** The four completion-status filter keys this popover understands. */
export type YearStatusKey =
  | "completed"
  | "in-progress"
  | "not-started"
  | "skipped";

export interface YearFilterState {
  view: "grid" | "list";
  /** Selected subject ids. `[]` means ALL subjects are shown. */
  subjects: string[];
  /** Selected status keys. `[]` means ALL statuses are shown. */
  statuses: string[];
}

export interface YearFiltersPopoverProps {
  value: YearFilterState;
  /** Subjects to offer; `cls` is the cp-subj class that colors the dot. */
  subjects: { id: string; name: string; cls: string }[];
  onChange: (next: YearFilterState) => void;
  /**
   * Show the Grid|List VIEW switch. The grid/list layout only governs the
   * all-subjects timeline, so the merged Yearly view hides it once you drill
   * into a subject/unit/week (where the center is a fixed card layout).
   * Defaults to `true`.
   */
  showViewToggle?: boolean;
  /**
   * The global standards filter (`filters.standards`). When this AND
   * `onOpenCoverage` are provided, the popover renders a STANDARDS facet: the
   * active standard chips (each removable) plus a button into the full coverage
   * panel where standards are browsed + toggled. Omit to hide the facet.
   */
  selectedStandards?: string[];
  /** Remove one standard from the active filter (chip ×). */
  onToggleStandard?: (code: string) => void;
  /** Clear every active standard filter. */
  onClearStandards?: () => void;
  /** Open the full standards coverage panel (the rich browse/toggle surface). */
  onOpenCoverage?: () => void;
}

// ── Static status rows ───────────────────────────────────────────────────────
// Order is meaningful (lifecycle order: not started → in progress → done →
// skipped is the natural reading, but we lead with "Completed" to match the
// legend most teachers scan for first). Each carries the legend-dot color
// token the STATUS section paints. All four tokens are themed in tokens.css.

interface StatusRow {
  key: YearStatusKey;
  label: string;
  /** CSS color expression for the legend dot. Tokens only. */
  dot: string;
}

const STATUS_ROWS: readonly StatusRow[] = [
  { key: "completed", label: "Completed", dot: "var(--done)" },
  { key: "in-progress", label: "In progress", dot: "var(--brand-500)" },
  { key: "not-started", label: "Not started", dot: "var(--ink-300)" },
  { key: "skipped", label: "Skipped", dot: "var(--catchup)" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Add the item when absent, remove it when present — toggle membership. */
function toggleArrayItem<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((v) => v !== item) : [...arr, item];
}

// ── Inline icons (currentColor; decorative) ──────────────────────────────────

/** Sliders glyph for the trigger — reads as "filters / adjust". */
function SlidersIcon(): ReactNode {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <line
        x1="2"
        y1="4"
        x2="14"
        y2="4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="2"
        y1="8"
        x2="14"
        y2="8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="2"
        y1="12"
        x2="14"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="5.5" cy="4" r="1.9" fill="currentColor" />
      <circle cx="10.5" cy="8" r="1.9" fill="currentColor" />
      <circle cx="6.5" cy="12" r="1.9" fill="currentColor" />
    </svg>
  );
}

/** Grid glyph for the VIEW switch. */
function GridIcon(): ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** List glyph for the VIEW switch. */
function ListIcon(): ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <line x1="2" y1="3" x2="12" y2="3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="2" y1="11" x2="12" y2="11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Checkmark drawn inside a checked checkbox box. */
function CheckGlyph(): ReactNode {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2.5 6.2 4.8 8.5 9.5 3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── VIEW toggle options (static — icons + accessible names) ───────────────────

const VIEW_OPTIONS: ToggleOption<"grid" | "list">[] = [
  { value: "grid", label: "Grid", icon: <GridIcon />, ariaLabel: "Grid view" },
  { value: "list", label: "List", icon: <ListIcon />, ariaLabel: "List view" },
];

// ── Component ────────────────────────────────────────────────────────────────

export function YearFiltersPopover({
  value,
  subjects,
  onChange,
  showViewToggle = true,
  selectedStandards,
  onToggleStandard,
  onClearStandards,
  onOpenCoverage,
}: YearFiltersPopoverProps): ReactNode {
  const [open, setOpen] = useState(false);
  const standardsFacet = !!onOpenCoverage;
  const activeStandards = selectedStandards ?? [];

  // Root wraps BOTH the trigger and the popover so the outside-click test is a
  // single `contains` against one node. The <Button> primitive does not forward
  // a ref, so we recover the trigger element by id when we need to restore focus
  // (instead of holding a ref to it).
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const triggerId = useId();

  // Number of active filter facets — drives the count badge and Reset state.
  // A "facet" is one chosen subject or status; an empty array contributes 0
  // (the empty array means "all", i.e. no narrowing).
  const activeCount =
    value.subjects.length + value.statuses.length + activeStandards.length;
  const hasActiveFilters = activeCount > 0;

  // ── Dismissal: outside mousedown + Escape, both restore trigger focus ──────

  const close = useCallback(() => {
    setOpen(false);
    // Return focus to the trigger so keyboard users aren't dropped at <body>.
    // <Button> doesn't forward a ref, so resolve the element by id.
    document.getElementById(triggerId)?.focus();
  }, [triggerId]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      const root = rootRef.current;
      if (root && !root.contains(e.target as Node)) {
        // Outside click: close WITHOUT yanking focus back to the trigger — the
        // teacher clicked elsewhere on purpose. (Escape, below, does restore.)
        setOpen(false);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  // ── Change emitters — always emit a fresh, full state object ───────────────

  const setView = useCallback(
    (view: "grid" | "list") => {
      onChange({ ...value, view });
    },
    [onChange, value],
  );

  const toggleSubject = useCallback(
    (id: string) => {
      onChange({ ...value, subjects: toggleArrayItem(value.subjects, id) });
    },
    [onChange, value],
  );

  const toggleStatus = useCallback(
    (key: YearStatusKey) => {
      onChange({ ...value, statuses: toggleArrayItem(value.statuses, key) });
    },
    [onChange, value],
  );

  // "All" subjects clears the array (= show every subject). Active only when
  // nothing is selected.
  const clearSubjects = useCallback(() => {
    if (value.subjects.length === 0) return;
    onChange({ ...value, subjects: [] });
  }, [onChange, value]);

  // Reset keeps the current view, clears the local filter arrays AND the global
  // standards filter (so "Reset filters" zeroes every active facet).
  const resetFilters = useCallback(() => {
    onChange({ view: value.view, subjects: [], statuses: [] });
    onClearStandards?.();
  }, [onChange, value.view, onClearStandards]);

  const allSubjects = value.subjects.length === 0;

  return (
    <div className={styles.root} ref={rootRef}>
      {/* ── Trigger ────────────────────────────────────────────────────────
          Canonical <Button> so it shares the app's pill geometry + the
          cp-root specificity contract. The count badge sits in the trailing
          slot when any filter is active. */}
      <Button
        id={triggerId}
        variant="secondary"
        size="md"
        leadingIcon={<SlidersIcon />}
        trailingIcon={
          hasActiveFilters ? (
            <span className={styles.badge} aria-hidden="true">
              {activeCount}
            </span>
          ) : undefined
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => setOpen((v) => !v)}
        tooltip="Switch between the grid and list layout, and narrow the year to the subjects or completion states you care about"
      >
        Filters &amp; View
        {/* The count is in the trailing badge; expose it to AT here too. */}
        {hasActiveFilters && (
          <span className={styles.srOnly}>
            {", "}
            {activeCount} active {activeCount === 1 ? "filter" : "filters"}
          </span>
        )}
      </Button>

      {/* ── Popover ─────────────────────────────────────────────────────────
          role="dialog" labelled by the visually-hidden heading. Rendered
          inline (not portaled) so it inherits any cp-subj / token context
          from the Year page and stays inside the outside-click root. */}
      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label="Filters and view"
          className={styles.popover}
        >
          {/* ── 1. VIEW ───────────────────────────────────────────────────
              Only meaningful on the all-subjects timeline; hidden once a
              subject/unit/week is focused (the center is a fixed layout). */}
          {showViewToggle && (
            <section className={styles.section}>
              <p className={styles.sectionLabel}>View</p>
              <ToggleGroup<"grid" | "list">
                options={VIEW_OPTIONS}
                value={value.view}
                onChange={setView}
                size="sm"
                variant="subtle"
                ariaLabel="Year layout"
                className={styles.viewToggle}
              />
            </section>
          )}

          {/* ── 2. SUBJECTS ─────────────────────────────────────────────── */}
          <section className={styles.section}>
            <p className={styles.sectionLabel}>Subjects</p>
            <div className={styles.rows}>
              {/* "All" pseudo-row — checked when no subject is selected.
                  Clicking it clears the subjects array (= show everything). */}
              <button
                type="button"
                role="checkbox"
                aria-checked={allSubjects}
                className={styles.row}
                onClick={clearSubjects}
              >
                <span
                  className={
                    allSubjects ? `${styles.box} ${styles.boxOn}` : styles.box
                  }
                  aria-hidden="true"
                >
                  {allSubjects && <CheckGlyph />}
                </span>
                <span className={styles.rowLabel}>All subjects</span>
              </button>

              {subjects.map((s) => {
                const checked = value.subjects.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    className={styles.row}
                    onClick={() => toggleSubject(s.id)}
                  >
                    <span
                      className={
                        checked ? `${styles.box} ${styles.boxOn}` : styles.box
                      }
                      aria-hidden="true"
                    >
                      {checked && <CheckGlyph />}
                    </span>
                    {/* Subject-scoped span so var(--c) resolves to the hue via
                        the palette bridge — identical to LeftFilterPanel. */}
                    <span
                      className={`cp-subj ${s.cls}`}
                      aria-hidden="true"
                      style={{ display: "contents" }}
                    >
                      <span
                        className={styles.dot}
                        style={{ background: "var(--c)" }}
                      />
                    </span>
                    <span className={styles.rowLabel}>{s.name}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── 3. STATUS ───────────────────────────────────────────────── */}
          <section className={styles.section}>
            <p className={styles.sectionLabel}>Status</p>
            <div className={styles.rows}>
              {STATUS_ROWS.map((row) => {
                const checked = value.statuses.includes(row.key);
                return (
                  <button
                    key={row.key}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    className={styles.row}
                    onClick={() => toggleStatus(row.key)}
                  >
                    <span
                      className={
                        checked ? `${styles.box} ${styles.boxOn}` : styles.box
                      }
                      aria-hidden="true"
                    >
                      {checked && <CheckGlyph />}
                    </span>
                    {/* Legend dot in the matching status color. */}
                    <span
                      className={styles.dot}
                      style={{ background: row.dot }}
                      aria-hidden="true"
                    />
                    <span className={styles.rowLabel}>{row.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── 4. STANDARDS ──────────────────────────────────────────────
              Wired to the global `filters.standards`. The rich browse/toggle
              UI lives in the coverage panel; here we surface the ACTIVE
              standard chips (each removable) + a button into that panel. */}
          {standardsFacet && (
            <section className={styles.section}>
              <p className={styles.sectionLabel}>Standards</p>
              {activeStandards.length > 0 ? (
                <div className={styles.stdChips}>
                  {activeStandards.map((code) => (
                    <button
                      key={code}
                      type="button"
                      className={styles.stdChip}
                      onClick={() => onToggleStandard?.(code)}
                      aria-label={`Remove standard filter ${code}`}
                      title={`Stop filtering by ${code}`}
                    >
                      <span className="cp-mono">{code}</span>
                      <span className={styles.stdChipX} aria-hidden="true">
                        ×
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className={styles.stdHint}>
                  No standard filter — open coverage to filter by standard and
                  see what&apos;s taught vs. still a gap.
                </p>
              )}
              <button
                type="button"
                className={styles.coverageBtn}
                onClick={() => {
                  setOpen(false);
                  onOpenCoverage?.();
                }}
              >
                Standards coverage…
              </button>
            </section>
          )}

          {/* ── Footer: Reset ───────────────────────────────────────────────
              Hidden entirely when nothing is active, so it never offers a
              no-op. Keeps the current view; clears both filter arrays. */}
          {hasActiveFilters && (
            <div className={styles.footer}>
              <button
                type="button"
                className={styles.reset}
                onClick={resetFilters}
              >
                Reset filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
