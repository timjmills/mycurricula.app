// YearStatCards.tsx — a row of 5 "stat cards" for the top of the Year page.
//
// This replaces the plain text stat strip with a card-based treatment. The five
// values are the SAME ones the Subject view's StatStrip computes (see
// components/subject/StatStrip.tsx) — done count, completion %, standards
// coverage, skipped count, and total resources — recomputed here, verbatim, so
// the two surfaces never drift.
//
// Cards (left→right):
//   DONE       — lessons marked done / total, with a cumulative-done sparkline
//   COMPLETE   — % of the year taught (done / total), with a progress bar
//   STANDARDS  — unique standards taught at least once / total unique standards
//   SKIPPED    — lessons with status "skipped" (red value when > 0)
//   RESOURCES  — total resources across all lessons
//
// All values are live-computed from the lessons passed in — never hard-coded.
// Pure render: no hooks or state, so "use client" is not required. Tokens only —
// every color routes through a CSS custom property so all six themes re-tint.

import type { ReactNode } from "react";
import type { Lesson } from "@/lib/types";
import styles from "./year-stat-cards.module.css";

// ── Inline icons (24×24, stroked in currentColor = the card's accent) ───────

function IconBook(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function IconCheckCircle(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="M22 4 12 14.01l-3-3" />
    </svg>
  );
}

function IconTarget(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function IconSkip(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  );
}

function IconFolder(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}

// ── Single stat card ────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  caption: string;
  icon: ReactNode;
  /**
   * Accent token used for the icon badge tint + icon stroke (and the value when
   * `warn` is set). Passed as a CSS custom property so color-mix can tint it.
   */
  accent: string;
  /** When true the value renders in the accent color (used by SKIPPED > 0). */
  warn?: boolean;
  /** Slot below the value (sparkline or progress bar). */
  children?: ReactNode;
}

function StatCard({ label, value, caption, icon, accent, warn = false, children }: StatCardProps): ReactNode {
  // `--accent` drives both the badge tint and the icon color via the module CSS.
  return (
    <div className={styles.card} style={{ "--accent": accent } as React.CSSProperties}>
      <div className={styles.badge} aria-hidden="true">
        {icon}
      </div>
      <div className={styles.body}>
        <div className={styles.label}>{label}</div>
        <div className={styles.value} style={warn ? { color: "var(--accent)" } : undefined}>
          {value}
        </div>
        {children}
        <div className={styles.caption}>{caption}</div>
      </div>
    </div>
  );
}

// ── YearStatCards ───────────────────────────────────────────────────────────

export function YearStatCards({ lessons }: { lessons: Lesson[] }): ReactNode {
  const total = lessons.length;

  // Done count — lessons whose status is "done".
  const doneCount = lessons.filter((l) => l.status === "done").length;

  // Completion percentage — 0 if there are no lessons.
  const completePct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  // Standards covered: unique codes across done lessons (taught at least once).
  // Standards total: all unique codes across every lesson.
  const allCodes = new Set<string>();
  const doneCodes = new Set<string>();
  for (const l of lessons) {
    for (const s of l.standards) {
      allCodes.add(s);
      if (l.status === "done") doneCodes.add(s);
    }
  }
  const standardsCovered = doneCodes.size;
  const standardsTotal = allCodes.size;

  // Skipped lessons.
  const skippedCount = lessons.filter((l) => l.status === "skipped").length;

  // Resource total — count every resource across every lesson.
  const resourceCount = lessons.reduce((sum, l) => sum + l.resources.length, 0);

  return (
    <div className={styles.row} role="region" aria-label="Year statistics">
      <StatCard
        label="DONE"
        value={`${doneCount} / ${total}`}
        caption="lessons taught"
        icon={<IconBook />}
        accent="var(--done)"
      />

      <StatCard
        label="COMPLETE"
        value={`${completePct}%`}
        caption="of the year"
        icon={<IconCheckCircle />}
        accent="var(--brand-600)"
      >
        <div className={styles.barTrack} aria-hidden="true">
          <div
            className={styles.barFill}
            style={{ width: `${Math.min(100, Math.max(0, completePct))}%` }}
          />
        </div>
      </StatCard>

      <StatCard
        label="STANDARDS"
        value={`${standardsCovered} / ${standardsTotal}`}
        caption="taught at least once"
        icon={<IconTarget />}
        accent="var(--brand-500)"
      />

      <StatCard
        label="SKIPPED"
        value={skippedCount}
        caption="lessons"
        icon={<IconSkip />}
        accent="var(--catchup)"
        warn={skippedCount > 0}
      />

      <StatCard
        label="RESOURCES"
        value={resourceCount}
        caption="across all units"
        icon={<IconFolder />}
        accent="var(--ink-500)"
      />
    </div>
  );
}
