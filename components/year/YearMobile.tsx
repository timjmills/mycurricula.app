"use client";

// YearMobile — phone-only Year view.
//
// Stacked subject cards in a single vertical column. Each card shows:
//   • subject name + monogram chip in the tinted header
//   • current unit (name + date range) — the unit whose week range contains
//     today, falling back to the next upcoming unit, then the most recent.
//   • completion percentage + progress bar
//   • pacing status sentence
//
// Uses the canonical <Card subjectId> primitive so the visual recipe
// (header tint, deep left border, soft shadow) matches Weekly cards on
// phone. No horizontal timeline, no per-day cells.

import { useMemo } from "react";
import { Card } from "@/components/ui";
import { usePlanner } from "@/lib/planner-store";
import { SUBJECTS, CURRENT_WEEK } from "@/lib/mock";
import { subjectCompletePct, lessonToFlatIndex } from "@/lib/year-calendar";
import { useSchoolWeek } from "@/lib/use-school-week";
import { pacingFor, pacingLabel } from "@/lib/year-pacing";
import type { SubjectId } from "@/lib/types";
import styles from "./YearMobile.module.css";

const CHIP_MONOGRAM: Record<SubjectId, string> = {
  math: "Ma",
  reading: "Re",
  writing: "Wr",
  grammar: "Gr",
  spelling: "Sp",
  ufli: "Uf",
  explorers: "Ex",
  sel: "Se",
};

function weekIdxToDateLabel(weekIdx: number): string {
  const termStart = new Date(2025, 10, 2); // 2025-11-02
  const d = new Date(
    termStart.getFullYear(),
    termStart.getMonth(),
    termStart.getDate() + weekIdx * 7,
  );
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface SubjectSummary {
  subjectId: SubjectId;
  name: string;
  completePct: number;
  pacingText: string;
  currentUnit: {
    unitNumber: number;
    name: string;
    startDate: string;
    endDate: string;
  } | null;
}

// ── Component ─────────────────────────────────────────────────────────────

export function YearMobile() {
  const { lessons } = usePlanner();
  // TEAM-scoped school week (CLAUDE.md §1 — configurable, never hard-coded).
  // YearMobile only consumes the length for flat-index + pacing math; it
  // doesn't render per-weekday columns.
  const { days: schoolWeek } = useSchoolWeek();
  const schoolWeekLen = schoolWeek.length;
  const currentWeekIdx = CURRENT_WEEK - 1;
  const todaySchoolDayIdx = lessonToFlatIndex(CURRENT_WEEK, 0, schoolWeekLen);

  const subjects = useMemo<SubjectSummary[]>(() => {
    return SUBJECTS.map((subject) => {
      const subjectId = subject.id as SubjectId;
      const subjectLessons = lessons.filter((l) => l.subject === subject.id);
      const completePct = subjectCompletePct(lessons, subjectId);
      const pacing = pacingFor(subjectId, lessons, todaySchoolDayIdx, {
        dayCount: schoolWeekLen,
      });

      // Group by unit; pick the active or next-upcoming unit.
      const unitMap = new Map<
        string,
        { unitId: string; minWeek: number; maxWeek: number }
      >();
      for (const l of subjectLessons) {
        const existing = unitMap.get(l.unit);
        if (!existing) {
          unitMap.set(l.unit, {
            unitId: l.unit,
            minWeek: l.week,
            maxWeek: l.week,
          });
        } else {
          existing.minWeek = Math.min(existing.minWeek, l.week);
          existing.maxWeek = Math.max(existing.maxWeek, l.week);
        }
      }
      const units = [...unitMap.values()]
        .map((u, i) => ({
          unitNumber: i + 1,
          startWeekIdx: u.minWeek - 1,
          endWeekIdx: u.maxWeek - 1,
        }))
        .sort((a, b) => a.startWeekIdx - b.startWeekIdx);

      const active = units.find(
        (u) =>
          u.startWeekIdx <= currentWeekIdx && u.endWeekIdx >= currentWeekIdx,
      );
      const upcoming = units.find((u) => u.startWeekIdx > currentWeekIdx);
      const fallback = units[units.length - 1];
      const chosen = active ?? upcoming ?? fallback ?? null;

      return {
        subjectId,
        name: subject.name,
        completePct,
        pacingText: pacingLabel(pacing),
        currentUnit: chosen
          ? {
              unitNumber: chosen.unitNumber,
              name: `${subject.name} Unit ${chosen.unitNumber}`,
              startDate: weekIdxToDateLabel(chosen.startWeekIdx),
              endDate: weekIdxToDateLabel(chosen.endWeekIdx + 1),
            }
          : null,
      };
    });
  }, [lessons, schoolWeekLen, todaySchoolDayIdx, currentWeekIdx]);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <h1 className={styles.title}>Yearly View</h1>
        <p className={styles.subtitle}>Where each subject stands this year.</p>
      </header>

      <ul className={styles.list}>
        {subjects.map((s) => {
          const monogram = CHIP_MONOGRAM[s.subjectId] ?? s.name.slice(0, 2);
          const header = (
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderText}>
                <span className={styles.cardName}>{s.name}</span>
              </div>
              <div className={styles.cardChip} aria-hidden="true">
                {monogram}
              </div>
            </div>
          );
          return (
            <li key={s.subjectId}>
              <Card subjectId={s.subjectId} header={header} density="compact">
                <div className={styles.cardBody}>
                  {s.currentUnit ? (
                    <div className={styles.unitRow}>
                      <span className={styles.unitTag}>
                        U{s.currentUnit.unitNumber}
                      </span>
                      <div className={styles.unitText}>
                        <div className={styles.unitName}>
                          {s.currentUnit.name}
                        </div>
                        <div className={styles.unitRange}>
                          {s.currentUnit.startDate}–{s.currentUnit.endDate}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.unitEmpty}>No units scheduled</div>
                  )}

                  <div className={styles.progressLabel}>
                    {s.completePct}% Complete
                  </div>
                  <div
                    className={styles.progressTrack}
                    role="progressbar"
                    aria-valuenow={s.completePct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${s.name} ${s.completePct}% complete`}
                  >
                    <div
                      className={styles.progressFill}
                      style={{ width: `${s.completePct}%` }}
                    />
                  </div>

                  <div className={styles.pacing}>{s.pacingText}</div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
