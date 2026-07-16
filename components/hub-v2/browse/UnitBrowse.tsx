"use client";

// UnitBrowse.tsx — the Planner Hub's "open a unit" picker (Wave 8).
//
// Per-subject sections of unit cards, each showing a REAL taught/total progress
// bar (via the shared, tested lib/year-v2-data helpers). A card opens the unit
// as a UnitDoc. Units order by first taught week (mirrors YearShell.buildLanes).

import { useMemo, type ReactNode } from "react";
import { usePlanner } from "@/lib/planner-store";
import { unitLessons, unitProgress } from "@/lib/year-v2-data";
import { SubjGlyph } from "@/components/planner-v2";
import type { Subject, Unit } from "@/lib/types";
import type { HubBrowseProps } from "./browse-data";
import { queryMatches, unitStartWeek, stripUnitPrefix } from "./browse-data";
import styles from "./browse.module.css";

export function UnitBrowse({ query, onOpenDoc }: HubBrowseProps): ReactNode {
  const { lessons, subjects, units } = usePlanner();

  const sections = useMemo(() => {
    return subjects
      .map((subject) => {
        const subjectUnits = units
          .filter(
            (u) =>
              u.subject === subject.id &&
              queryMatches(query, u.name, subject.name),
          )
          .map((unit) => {
            const inUnit = unitLessons(lessons, subject.id, unit.id);
            const { total, taught } = unitProgress(inUnit);
            const start =
              inUnit.length > 0
                ? Math.min(...inUnit.map((l) => l.week))
                : unitStartWeek(unit);
            return { unit, total, taught, start };
          })
          .sort((a, b) => a.start - b.start);
        return { subject, units: subjectUnits };
      })
      .filter((s) => s.units.length > 0);
  }, [subjects, units, lessons, query]);

  if (sections.length === 0) {
    return (
      <>
        <Head />
        <p className={styles.empty}>
          {query.trim() ? `No units match “${query.trim()}”.` : "No units yet."}
        </p>
      </>
    );
  }

  return (
    <>
      <Head />
      {sections.map(({ subject, units: subjectUnits }) => (
        <div key={subject.id} className={`cp-subj ${subject.cls} ${styles.section}`}>
          <div className={styles.sectionHead}>
            <SubjGlyph subject={subject} size={26} radius={8} />
            <span className={styles.sectionName}>{subject.name}</span>
          </div>
          <div className={styles.unitGrid}>
            {subjectUnits.map(({ unit, total, taught }) => (
              <UnitCard
                key={unit.id}
                subject={subject}
                unit={unit}
                total={total}
                taught={taught}
                onOpen={() =>
                  onOpenDoc({
                    kind: "unit",
                    id: unit.id,
                    title: unit.name,
                    sid: subject.id,
                  })
                }
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function Head(): ReactNode {
  return (
    <div className={styles.head}>
      <div className={styles.crumb}>Planner</div>
      <h1 className={styles.title}>Units</h1>
      <p className={styles.sub}>Open a unit to see its lessons, standards, and resources.</p>
    </div>
  );
}

function UnitCard({
  subject,
  unit,
  total,
  taught,
  onOpen,
}: {
  subject: Subject;
  unit: Unit;
  total: number;
  taught: number;
  onOpen: () => void;
}): ReactNode {
  const pct = total > 0 ? Math.round((taught / total) * 100) : 0;
  const notStarted = taught === 0;
  return (
    <button
      type="button"
      className={`cp-subj ${subject.cls} ${styles.unitCard} ${notStarted && total === 0 ? styles.unitFuture : ""}`}
      onClick={onOpen}
    >
      <div className={styles.unitName}>{stripUnitPrefix(unit.name)}</div>
      <div className={styles.unitMeta}>
        {unit.weeks} · {total === 0 ? "no lessons yet" : `${taught}/${total} taught`}
      </div>
      <div className={styles.unitBar}>
        <div className={styles.unitBarFill} style={{ width: `${pct}%` }} />
      </div>
      <div className={styles.unitPct}>{pct}% complete</div>
    </button>
  );
}
