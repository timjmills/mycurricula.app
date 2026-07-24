"use client";

// OverviewTab.tsx — the workspace's "Unit Plan" tab body (B1.5 label; B1.6
// content). A completion ring + big stat, an honest six-card stat strip, the
// learning-arc scaffold, and the lesson-node timeline.
//
// HONESTY (CLAUDE.md §2 · lib/unit-workspace-derive contract): every number is
// real store truth. "To teach" is total − taught (never a /5-week division —
// the school week is configurable); "Standards" is a plain distinct-code count
// (no invented N/M coverage denominator); "Gaps" counts not-yet-taught lessons
// missing an objective / resources / standards. No date-based "missed", no
// projected-finish, no ahead/behind pace — none of that data exists yet.

import { useMemo, type ReactNode } from "react";
import type { Lesson } from "@/lib/types";
import type { UnitProgress } from "@/lib/year-v2-data";
import {
  ARC_PHASES,
  arcPhasesReached,
  unitGaps,
  unitPace,
} from "@/lib/unit-workspace-derive";
import { Tooltip } from "@/components/ui";
import { ProgressRing } from "./ProgressRing";
import { dayShort } from "./helpers";
import styles from "../UnitExplorer.module.css";

/** Human labels for the pace state — the Status card's value. */
const STATE_LABEL: Record<ReturnType<typeof unitPace>["state"], string> = {
  empty: "No lessons",
  in_progress: "In progress",
  complete: "Complete",
};

export function OverviewTab({
  lessons,
  progress,
  pct,
  subjectName,
  resourceCount,
  standardCount,
}: {
  lessons: Lesson[];
  progress: UnitProgress;
  pct: number;
  subjectName: string;
  /** Distinct resources across the unit's lessons (unitResources length). */
  resourceCount: number;
  /** Distinct standards tagged across the unit's lessons (unitStandards length). */
  standardCount: number;
}): ReactNode {
  const gaps = useMemo(() => unitGaps(lessons), [lessons]);
  const pace = useMemo(() => unitPace(lessons), [lessons]);
  // arcPhasesReached takes unitPace's output directly (Pick<total|taught>).
  const arcReached = useMemo(() => arcPhasesReached(pace), [pace]);

  // Six honest cards. `tone` drives a semantic accent: warn when there are
  // planning gaps, done when the unit is fully taught, else neutral subject tint.
  const cards: ReadonlyArray<{
    label: string;
    value: string;
    tone: "info" | "warn" | "done";
  }> = [
    { label: "Taught", value: `${pace.taught}/${pace.total}`, tone: "info" },
    { label: "To teach", value: `${pace.remaining}`, tone: "info" },
    {
      label: standardCount === 1 ? "Standard" : "Standards",
      value: `${standardCount}`,
      tone: "info",
    },
    {
      label: "Gaps",
      value: `${gaps.lessonsWithGaps}`,
      tone: gaps.lessonsWithGaps > 0 ? "warn" : "info",
    },
    {
      label: resourceCount === 1 ? "Resource" : "Resources",
      value: `${resourceCount}`,
      tone: "info",
    },
    {
      label: "Status",
      value: STATE_LABEL[pace.state],
      tone: pace.state === "complete" ? "done" : "info",
    },
  ];

  return (
    <div className={styles.overview}>
      <div className={styles.ovHead}>
        <ProgressRing
          pct={pct}
          size={64}
          stroke={7}
          trackClass={styles.ringTrack}
          valueClass={styles.ringValue}
          label={`${progress.taught} of ${progress.total} lessons taught`}
        />
        <div className={styles.ovStat}>
          <div className={styles.ovBig}>
            {progress.taught}
            <span className={styles.ovSlash}>/{progress.total}</span>
          </div>
          <div className={styles.ovLabel}>
            {subjectName} lessons taught
            {progress.total > 0 ? (
              <> · {Math.round(pct * 100)}% complete</>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Honest stat strip ──────────────────────────────────────────────── */}
      <div className={styles.statCards}>
        {cards.map((c) => (
          <div
            key={c.label}
            className={`${styles.statCard} ${
              c.tone === "warn"
                ? styles.statCardWarn
                : c.tone === "done"
                  ? styles.statCardDone
                  : ""
            }`}
          >
            <span
              className={`${styles.statValue} ${
                c.tone === "warn"
                  ? styles.statValueWarn
                  : c.tone === "done"
                    ? styles.statValueDone
                    : ""
              }`}
            >
              {c.value}
            </span>
            <span className={styles.statLabel}>{c.label}</span>
          </div>
        ))}
      </div>

      {/* ── Learning arc — a completion-fraction scaffold, not phase tracking ── */}
      <div className={styles.arc}>
        <div className={styles.arcHead}>Learning arc</div>
        <div className={styles.arcTrack}>
          {ARC_PHASES.map((phase, i) => {
            const reached = i < arcReached;
            return (
              <Tooltip
                key={phase}
                content={
                  reached
                    ? `${phase} — within the taught portion of this unit.`
                    : `${phase} — still ahead in this unit.`
                }
                side="top"
              >
                <div
                  className={`${styles.arcPhase} ${reached ? styles.arcPhaseOn : ""}`}
                >
                  <span
                    className={`${styles.arcDot} ${reached ? styles.arcDotOn : ""}`}
                    aria-hidden="true"
                  >
                    {reached ? (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12l5 5L20 6" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className={styles.arcLabel}>{phase}</span>
                </div>
              </Tooltip>
            );
          })}
        </div>
        <p className={styles.arcCaption}>
          Phases shade in as the unit is taught — a shape-of-the-unit guide, not
          per-phase tracking.
        </p>
      </div>

      {lessons.length === 0 ? (
        <div className={styles.empty}>
          No lessons planned for this unit yet.
        </div>
      ) : (
        <>
          <div className={styles.progressBar} aria-hidden="true">
            <span
              className={styles.progressFill}
              style={{ width: `${Math.round(pct * 100)}%` }}
            />
          </div>
          {/* Horizontal lesson-node timeline — done nodes fill with the subject
              color + ✓; the rest read as hollow track dots. */}
          <div
            className={styles.timeline}
            role="list"
            aria-label="Unit lesson timeline"
          >
            {lessons.map((l) => {
              const done = l.status === "done";
              return (
                <Tooltip
                  key={l.id}
                  content={`Wk ${l.week} · ${dayShort(l.day)} — ${l.title}${
                    done ? " (taught)" : ""
                  }`}
                  side="top"
                >
                  <span
                    role="listitem"
                    className={`${styles.node} ${done ? styles.nodeDone : ""}`}
                    aria-label={`Week ${l.week} ${dayShort(l.day)}: ${l.title}${
                      done ? ", taught" : ""
                    }`}
                    tabIndex={0}
                  >
                    {done ? (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M5 12l5 5L20 6" />
                      </svg>
                    ) : null}
                  </span>
                </Tooltip>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
