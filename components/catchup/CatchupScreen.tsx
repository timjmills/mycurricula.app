"use client";

// CatchupScreen — the §5.17 full-page coverage triage surface.
//
// Reads the planner's lessons array via usePlanner() and derives the
// uncovered-item projection through deriveCatchupItems() so every Catch-up
// surface (this screen, the in-grid bar, the top-bar badge) shares one
// source. The four pieces of local state (scope / status filter / group-by /
// selected ids) live here; everything below is presentational.
//
// The scope chip default is `last4`, mirroring the artboard. The status
// filter starts with every state checked — the helper treats an empty set
// as "show all" so a teacher can click off the whole row to undo the
// filtering as well.
//
// Per-row actions delegate into useCatchup() which is the persistence
// boundary. Bulk actions loop through `selected` and clear the set when
// done.

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/lib/app-state";
import { useCatchup } from "@/lib/catchup-state";
import {
  coverageSummary,
  deriveCatchupItems,
  filterByScope,
  filterByStatus,
  groupItems,
  CATCHUP_STATUS_LABEL,
  CATCHUP_STATUS_TOKEN,
} from "@/lib/catchup-data";
import type {
  CatchupGroupBy,
  CatchupItem,
  CatchupScope,
} from "@/lib/catchup-data";
import { usePlanner } from "@/lib/planner-store";
import { SUBJECT_BY_ID } from "@/lib/mock";
import { Tooltip } from "@/components/ui";
import { BulkActionBar } from "./BulkActionBar";
import { CatchupRow } from "./CatchupRow";
import { EmptyState } from "./EmptyState";
import styles from "./CatchupScreen.module.css";

// ── Local config ─────────────────────────────────────────────────────────

const SCOPE_CHIPS: ReadonlyArray<{
  id: CatchupScope;
  label: string;
  tooltip: string;
}> = [
  {
    id: "lastWeek",
    label: "Last week",
    tooltip:
      "Only show lessons that fell behind in the most recent school week — fastest way to triage what's right behind you",
  },
  {
    id: "last4",
    label: "Last 4 weeks",
    tooltip:
      "Show lessons that fell behind over the past month — the default scope, good balance of recent + actionable",
  },
  {
    id: "term",
    label: "This term",
    tooltip:
      "Show every uncovered lesson since the start of the current term — useful when planning a make-up week",
  },
  {
    id: "year",
    label: "All year",
    tooltip:
      "Show every uncovered lesson from the start of the school year — the full backlog, no time filter",
  },
];

const STATUS_CHIPS: ReadonlyArray<CatchupItem["status"]> = [
  "not_done",
  "partial",
  "skipped",
  "carried",
];

const GROUP_OPTIONS: ReadonlyArray<{ id: CatchupGroupBy; label: string }> = [
  { id: "subject", label: "Subject" },
  { id: "chrono", label: "Chronological" },
  { id: "standard", label: "Standard" },
  { id: "unit", label: "Unit" },
];

// Inline flame SVG — keep it stroke=currentColor so tokens drive color.
function IconFlame() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2s2 3 2 5.5S12 11 12 11s-2-1-2-3.5S12 2 12 2zm-3 9c-2 1.5-3 3.5-3 6a6 6 0 0 0 12 0c0-3-2-5-3.5-6 0 2-1 3-2.5 3s-3-1-3-3z" />
    </svg>
  );
}

// ── Component ────────────────────────────────────────────────────────────

export function CatchupScreen() {
  const router = useRouter();
  const { lessons } = usePlanner();
  const { week, currentUser } = useAppState();
  const { enabled, actions, setAction, setNote, getNote } = useCatchup();

  const [scope, setScope] = useState<CatchupScope>("last4");
  const [groupBy, setGroupBy] = useState<CatchupGroupBy>("subject");
  const [statusFilter, setStatusFilter] = useState<Set<CatchupItem["status"]>>(
    () => new Set(STATUS_CHIPS),
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  // ── Derived data ──────────────────────────────────────────────────────

  const allItems = useMemo(
    () => deriveCatchupItems(lessons, { currentWeek: week, actions }),
    [lessons, week, actions],
  );

  const scopedItems = useMemo(
    () => filterByScope(allItems, scope, week),
    [allItems, scope, week],
  );

  const visibleItems = useMemo(
    () => filterByStatus(scopedItems, statusFilter),
    [scopedItems, statusFilter],
  );

  const groups = useMemo(
    () => groupItems(visibleItems, groupBy),
    [visibleItems, groupBy],
  );

  const coverage = useMemo(
    () => coverageSummary(lessons, { currentWeek: week, actions }),
    [lessons, week, actions],
  );

  // Scope-local stats — `scopedUncovered` is the count of items in the
  // selected scope (paired with `weeksSpan`, the number of distinct weeks
  // contributing them). These pair into the "{N} uncovered across {W}
  // weeks" line so both numbers describe the same slice; previously the
  // total year-uncovered was mixed with the scoped week count, which
  // produced sentences like "142 uncovered across 1 week".
  const scopedUncovered = scopedItems.length;
  const weeksSpan = useMemo(() => {
    const weeks = new Set<number>();
    for (const i of scopedItems) weeks.add(i.week);
    return weeks.size;
  }, [scopedItems]);

  // ── Handlers ──────────────────────────────────────────────────────────

  const toggleStatus = useCallback((s: CatchupItem["status"]) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const handleMarkDone = useCallback(
    (id: string) => setAction(id, { kind: "done" }),
    [setAction],
  );
  const handleSkip = useCallback(
    (id: string) => setAction(id, { kind: "skipped" }),
    [setAction],
  );
  const handleCarryOver = useCallback(
    // Carry-over destination picker is a follow-up wave (see handoff
    // README §5). For now we record the carried action with no target;
    // the row visually re-tints to carried via the action overlay.
    (id: string) => setAction(id, { kind: "carried", carriedTo: "" }),
    [setAction],
  );
  const handleJumpToLesson = useCallback(() => {
    // TODO: wire a Weekly-grid scroll-into-view for the lesson once the
    // Weekly view exposes a deep-link query param. For now, just jump
    // to Weekly — the data-planner-item attribute is in place.
    router.push("/weekly");
  }, [router]);

  // Bulk actions — share the per-row handlers, then clear selection.
  const bulkApply = useCallback(
    (fn: (id: string) => void) => {
      for (const id of selected) fn(id);
      clearSelection();
    },
    [selected, clearSelection],
  );

  const handleBulkDone = useCallback(
    () => bulkApply(handleMarkDone),
    [bulkApply, handleMarkDone],
  );
  const handleBulkSkip = useCallback(
    () => bulkApply(handleSkip),
    [bulkApply, handleSkip],
  );
  const handleBulkCarry = useCallback(
    () => bulkApply(handleCarryOver),
    [bulkApply, handleCarryOver],
  );
  // W1-A2 (2026-05-27): the prior "Add all to to-do" handler was a silent
  // clearSelection() no-op because no to-do bulk-add API exists yet. The
  // BulkActionBar button is gone for beta; add it back here when the
  // planner gains a real bulk-add action.

  return (
    <div className={`cp-root ${styles.root}`}>
      {/* "Catch-up is off in Settings" notice — Layer 1 of the three-layer
          system. The screen itself is still reachable so the notice is a
          soft strip rather than a blocker. */}
      {!enabled && (
        <div className={styles.disabledNotice} role="status">
          <IconFlame />
          <span>
            Catch-up is off in Settings. You can still browse uncovered lessons
            here.
          </span>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.titleBlock}>
            <div className={styles.eyebrow}>
              <IconFlame />
              Catch-up
            </div>
            <h1 className={styles.title}>What I haven&rsquo;t covered yet</h1>
            {/* Onboarding-voice subtitle (CLAUDE.md §4) — tells a first-
                time teacher what this surface is FOR, not just what it's
                called. The grade + school-year + teacher metadata moved
                to a sibling .metaRow below so the subtitle can carry a
                single clear job-statement. */}
            <p className={styles.subtitle}>
              Lessons your team — or just you — fell behind on, ready to triage.
              Carry them forward, mark them skipped, or jot a note so nothing
              slips through the year.
            </p>
            <div className={styles.metaRow}>
              {currentUser.curriculumLabel
                ? `${currentUser.curriculumLabel} · 2025–26 school year · ${currentUser.name}`
                : `2025–26 school year · ${currentUser.name}`}
            </div>
          </div>

          <div className={styles.coverage}>
            <div className={styles.coverageStat}>
              <span className={styles.coveragePct}>
                {coverage.pct}
                <span className={styles.coverageUnit}>%</span>
              </span>
              <span className={styles.coverageLabel}>covered</span>
            </div>
            <div className={styles.coverageDetail}>
              {scopedUncovered} uncovered
              {weeksSpan > 0
                ? ` across ${weeksSpan} week${weeksSpan === 1 ? "" : "s"}`
                : ""}
            </div>
          </div>
        </div>
        {/* Coverage progress bar — two segments: done | catchup */}
        <div className={styles.coverageBar}>
          <div
            className={styles.coverageBarFill}
            style={{
              width: `${coverage.pct}%`,
              background: "var(--done)",
            }}
          />
          <div
            className={styles.coverageBarFill}
            style={{
              width: `${100 - coverage.pct}%`,
              background: "var(--catchup)",
            }}
          />
        </div>
      </header>

      {/* ── Sticky filter row ────────────────────────────────────── */}
      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <span className={styles.filterEyebrow}>Scope</span>
          <div className={styles.chips}>
            {SCOPE_CHIPS.map((c) => {
              const active = scope === c.id;
              return (
                <Tooltip key={c.id} content={c.tooltip} side="bottom">
                  <button
                    type="button"
                    className={styles.scopeChip}
                    aria-pressed={active}
                    onClick={() => setScope(c.id)}
                    data-active={active || undefined}
                    title={c.tooltip}
                  >
                    {c.label}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>

        <span className={styles.filterDivider} aria-hidden="true" />

        <div className={styles.filterGroup}>
          <span className={styles.filterEyebrow}>Status</span>
          <div className={styles.chips}>
            {STATUS_CHIPS.map((s) => {
              const active = statusFilter.has(s);
              const dotVar = CATCHUP_STATUS_TOKEN[s];
              return (
                <Tooltip
                  key={s}
                  content={`Toggle the ${CATCHUP_STATUS_LABEL[s].toLowerCase()} status — when off, lessons in that state are hidden from this list.`}
                  side="bottom"
                >
                  <button
                    type="button"
                    className={styles.statusChip}
                    aria-pressed={active}
                    onClick={() => toggleStatus(s)}
                    data-active={active || undefined}
                    title={`Toggle the ${CATCHUP_STATUS_LABEL[s].toLowerCase()} status — when off, lessons in that state are hidden from this list`}
                    style={
                      active
                        ? ({
                            "--chip-bg": `color-mix(in srgb, var(${dotVar}) 14%, white)`,
                            "--chip-border": `var(${dotVar})`,
                            "--chip-color": "var(--ink-900)",
                          } as React.CSSProperties)
                        : undefined
                    }
                  >
                    <span
                      className={styles.statusDot}
                      style={{ background: `var(${dotVar})` }}
                      aria-hidden="true"
                    />
                    {CATCHUP_STATUS_LABEL[s]}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>

        <span className={styles.filterSpacer} />

        <label className={styles.groupByLabel}>
          <span className={styles.groupByEyebrow}>Group by</span>
          <Tooltip
            content="Choose how to organize the catch-up list — by subject, by week, by standard, or by unit."
            side="bottom"
          >
            <select
              className={styles.groupBySelect}
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as CatchupGroupBy)}
              aria-label="Group rows by"
              title="Choose how to organize the catch-up list — by subject, by week, by standard, or by unit"
            >
              {GROUP_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </Tooltip>
        </label>
      </div>

      {/* ── Body ──────────────────────────────────────────────────── */}
      <div className={styles.body}>
        {visibleItems.length === 0 ? (
          <EmptyState />
        ) : (
          groups.map((group) => {
            // Subject grouping resolves the subject class via the bucket
            // hint; other groupings still nest cp-subj on the rows so
            // the stripe color resolves correctly per-row.
            const subj = group.subject ? SUBJECT_BY_ID[group.subject] : null;
            return (
              <section key={group.key} className={styles.group}>
                <header
                  className={`${
                    subj ? `cp-subj ${subj.cls}` : ""
                  } ${styles.groupHeader}`}
                >
                  {subj && (
                    <span
                      className={styles.groupStripe}
                      style={{ background: "var(--c)" }}
                      aria-hidden="true"
                    />
                  )}
                  <span className={styles.groupLabel}>{group.label}</span>
                  <span className={styles.groupCount}>
                    &middot; {group.items.length} uncovered
                  </span>
                </header>
                <div className={styles.rows}>
                  {group.items.map((item) => (
                    <CatchupRow
                      key={item.lessonId}
                      item={item}
                      selected={selected.has(item.lessonId)}
                      note={getNote(item.lessonId)}
                      onToggleSelect={() => toggleSelect(item.lessonId)}
                      onMarkDone={() => handleMarkDone(item.lessonId)}
                      onSkip={() => handleSkip(item.lessonId)}
                      onCarryOver={() => handleCarryOver(item.lessonId)}
                      onJumpToLesson={() => handleJumpToLesson()}
                      onSaveNote={(value) => setNote(item.lessonId, value)}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>

      {/* ── Bulk action bar — fixed bottom, slides in on selection ─ */}
      {selected.size > 0 && (
        <BulkActionBar
          count={selected.size}
          onMarkAllDone={handleBulkDone}
          onMarkAllSkipped={handleBulkSkip}
          onCarryAll={handleBulkCarry}
          onClear={clearSelection}
        />
      )}
    </div>
  );
}
