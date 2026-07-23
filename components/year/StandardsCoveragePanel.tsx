"use client";

// StandardsCoveragePanel — the Yearly view's standards coverage analysis.
//
// Opens from TWO entry points (per the approved decision): the clickable
// STANDARDS stat card AND a toolbar button next to Filters & View. It reports,
// for the CURRENT drill scope (year → subject → unit → week), which standards
// are taught (≥1 done lesson tags them) vs. still a gap, and which lessons cover
// each one. Each standard row doubles as a FILTER toggle wired to the global
// `filters.standards` array, so the panel both analyzes and narrows.
//
// Rendered as a centered modal over a scrim (portaled to body) so it floats
// above the 3-column shell at any scope. Coverage numbers come from the pure
// `standardsCoverage()` helper, which mirrors the STANDARDS stat card exactly so
// the card and panel never disagree. Tokens only — no hex.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePlanner } from "@/lib/planner-store";
import { WEEK_DAYS } from "@/lib/mock";
import { PlannerEmpty, StandardPill } from "@/components/ui";
import type { StandardsCoverage } from "@/lib/year-standards-coverage";
import styles from "./standards-coverage-panel.module.css";

export interface StandardsCoveragePanelProps {
  coverage: StandardsCoverage;
  /** Human label for the current scope, e.g. "the whole year" / "Math" / "Week 12". */
  scopeLabel: string;
  /** Currently-active standard filters (global `filters.standards`). */
  activeStandards: string[];
  onToggleStandard: (code: string) => void;
  onClearStandards: () => void;
  onClose: () => void;
  /** Open a covering lesson (deep-links to Daily for editing). */
  onOpenLesson: (id: string) => void;
}

// ── Inline icons ─────────────────────────────────────────────────────────────

function Svg({
  children,
  sw = 2,
}: {
  children: ReactNode;
  sw?: number;
}): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
const IcX = () => (
  <Svg>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
const IcCheck = () => (
  <Svg sw={3}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);
const IcGap = () => (
  <Svg>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4M12 16h.01" />
  </Svg>
);
const IcChevR = () => (
  <Svg>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);

type FilterTab = "all" | "taught" | "gap";

export function StandardsCoveragePanel({
  coverage,
  scopeLabel,
  activeStandards,
  onToggleStandard,
  onClearStandards,
  onClose,
  onOpenLesson,
}: StandardsCoveragePanelProps): ReactNode {
  const { describeStandard } = usePlanner();
  const [tab, setTab] = useState<FilterTab>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pct =
    coverage.total > 0
      ? Math.round((coverage.covered / coverage.total) * 100)
      : 0;
  const gaps = coverage.total - coverage.covered;

  const rows = useMemo(() => {
    if (tab === "taught") return coverage.standards.filter((s) => s.taught);
    if (tab === "gap") return coverage.standards.filter((s) => !s.taught);
    return coverage.standards;
  }, [tab, coverage.standards]);

  const body = (
    <div
      className={styles.scrim}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={`Standards coverage for ${scopeLabel}`}
      >
        {/* Header */}
        <div className={styles.head}>
          <div className={styles.headMeta}>
            <div className={styles.eyebrow}>Standards coverage</div>
            <h2 className={styles.title}>{scopeLabel}</h2>
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close standards coverage"
          >
            <IcX />
          </button>
        </div>

        {/* Summary */}
        <div className={styles.summary}>
          <div className={styles.summaryNums}>
            <span className={styles.big}>{coverage.covered}</span>
            <span className={styles.of}>/ {coverage.total} taught</span>
          </div>
          <div className={styles.bar} aria-hidden="true">
            <i style={{ width: `${pct}%` }} />
          </div>
          <div className={styles.summaryMeta}>
            <span>
              <b>{pct}%</b> taught at least once
            </span>
            <span className={gaps > 0 ? styles.gapCount : undefined}>
              {gaps} {gaps === 1 ? "gap" : "gaps"}
            </span>
          </div>
        </div>

        {/* Filter tabs */}
        <div
          className={styles.tabs}
          role="tablist"
          aria-label="Coverage filter"
        >
          {(
            [
              { id: "all", label: `All (${coverage.total})` },
              { id: "taught", label: `Taught (${coverage.covered})` },
              { id: "gap", label: `Gaps (${gaps})` },
            ] as { id: FilterTab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`${styles.tab} ${tab === t.id ? styles.tabOn : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
          {activeStandards.length > 0 ? (
            <button
              type="button"
              className={styles.clear}
              onClick={onClearStandards}
            >
              Clear filter ({activeStandards.length})
            </button>
          ) : null}
        </div>

        {/* List */}
        <div className={styles.list}>
          {rows.length === 0 ? (
            coverage.total === 0 ? (
              // Data-zero: nothing tagged anywhere in scope. Gate through
              // PlannerEmpty so a still-hydrating (or failed) planner shows a
              // skeleton / load-error instead of a false "nothing tagged yet".
              <PlannerEmpty
                size="sm"
                heading="No standards are tagged on any lesson in this scope yet."
              />
            ) : (
              // coverage.total > 0 but the active tab filtered every row out —
              // a filter result over a non-empty scope, not a loading state, so
              // it stays a plain message (never a skeleton).
              <p className={styles.empty}>
                {tab === "gap"
                  ? "Every standard in this scope has been taught at least once. 🎉"
                  : "No standards taught yet in this scope."}
              </p>
            )
          ) : (
            rows.map((s) => {
              const active = activeStandards.includes(s.code);
              const open = expanded === s.code;
              return (
                <div
                  key={s.code}
                  className={`${styles.row} ${active ? styles.rowActive : ""}`}
                >
                  <div className={styles.rowMain}>
                    <button
                      type="button"
                      className={styles.rowToggle}
                      onClick={() => onToggleStandard(s.code)}
                      aria-pressed={active}
                      title={
                        active
                          ? `Stop filtering by ${s.code}`
                          : `Filter the year to ${s.code}`
                      }
                    >
                      <span
                        className={`${styles.cov} ${s.taught ? styles.covTaught : styles.covGap}`}
                        aria-hidden="true"
                      >
                        {s.taught ? <IcCheck /> : <IcGap />}
                      </span>
                      <StandardPill code={s.code} />
                      <span className={styles.desc}>
                        {describeStandard(s.code)}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={styles.count}
                      onClick={() =>
                        setExpanded((cur) => (cur === s.code ? null : s.code))
                      }
                      aria-expanded={open}
                      aria-label={`${s.lessonsCovering.length} lessons cover ${s.code}`}
                    >
                      {s.lessonsCovering.length}
                      <span
                        className={`${styles.chev} ${open ? styles.chevOn : ""}`}
                        aria-hidden="true"
                      >
                        <IcChevR />
                      </span>
                    </button>
                  </div>

                  {open ? (
                    <ul className={styles.lessons}>
                      {s.lessonsCovering.map((l) => (
                        <li key={l.id}>
                          <button
                            type="button"
                            className={styles.lessonRow}
                            onClick={() => onOpenLesson(l.id)}
                            title={`Open "${l.title}" in the Daily view`}
                          >
                            <span
                              className={`${styles.lessonDot} ${l.status === "done" ? styles.dotDone : ""}`}
                              aria-hidden="true"
                            />
                            <span className={styles.lessonTitle}>
                              {l.title}
                            </span>
                            <span className={styles.lessonMeta}>
                              {WEEK_DAYS[l.day] ?? `Day ${l.day + 1}`} · Wk{" "}
                              {l.week}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(body, document.body);
}
