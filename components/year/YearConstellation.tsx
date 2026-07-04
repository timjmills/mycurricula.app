"use client";

// YearConstellation — the W3.7 Frame-C Year "constellation" (bundle ~6336-6372).
//
// When the theme frame axis is "color", the Year view's ALL-scope center swaps
// from the subject-rows timeline to this: one cluster card per subject, each
// carrying the subject's color as `--clc`, with that subject's units rendered
// as a chain of 40px progress discs (solid = complete, ringed wash + percent =
// partial, faint wash = unstarted) joined by connector dashes.
//
// Deliberately presentation-only: TimelineYear derives the cluster/unit data
// (same subjectGroups + filters the timeline rows consume) and passes the same
// goUnit drill handler its unit cards use — a node click enters unit scope,
// NOT the mock's Unit Explorer modal (out of W3.7 scope). Frames glass/paper
// and every deeper scope keep the existing UI; the frame gate lives in
// TimelineYear, mirroring the WeeklyShell.renderGridPanel seam.

import { Fragment, type ReactNode } from "react";
import { Tooltip } from "@/components/ui";
import type { Subject, SubjectId } from "@/lib/types";
import styles from "./YearConstellation.module.css";

// ── Data shapes (mapped by TimelineYear from its UnitGroup derivations) ─────

/** One unit node in a subject's chain. */
export interface ConstellationUnit {
  id: string;
  /** Short label under the disc (the unit title, "Unit N · " lead-in stripped). */
  label: string;
  /** Full unit name for the hover tooltip. */
  fullName: string;
  /** Lessons in this unit with status "done" (archived already excluded). */
  done: number;
  /** All lessons in this unit. 0 ⇒ the unit renders as unstarted. */
  total: number;
}

/** One cluster card. `units` is already narrowed by the Year view's filters. */
export interface ConstellationCluster {
  subject: Subject;
  units: ConstellationUnit[];
  /** True when the subject has units at all (distinguishes "none planned"
   *  from "none match the current filters" in the empty note). */
  hadUnits: boolean;
}

export interface YearConstellationProps {
  clusters: ConstellationCluster[];
  /** The Year view's existing drill — same handler the timeline unit cards
   *  call to enter unit scope. */
  onOpenUnit: (subjectId: SubjectId, unitId: string) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function YearConstellation({
  clusters,
  onOpenUnit,
}: YearConstellationProps): ReactNode {
  return (
    <div className={styles.grid}>
      {clusters.map(({ subject, units, hadUnits }) => {
        // Cluster % — lesson-weighted (done lessons / all lessons across the
        // shown units), not the bundle's mean-of-unit-fractions: zero-lesson
        // units would otherwise drag the average below what the teacher has
        // actually taught. 0 lessons ⇒ 0%.
        const totalLessons = units.reduce((acc, u) => acc + u.total, 0);
        const doneLessons = units.reduce((acc, u) => acc + u.done, 0);
        const pct =
          totalLessons > 0 ? Math.round((doneLessons / totalLessons) * 100) : 0;

        return (
          <div
            key={subject.id}
            // `.cp-subj.<id>` cascades --c/--cl/--cd; the module CSS maps
            // --clc: var(--c) so every color-mix follows the live palette.
            className={`${styles.cluster} cp-subj ${subject.cls}`}
          >
            <div className={styles.clhead}>
              <span className={styles.glyph} aria-hidden="true">
                {subject.icon}
              </span>
              <span className={styles.nm}>{subject.name}</span>
              <span className={styles.pc}>{pct}%</span>
            </div>

            {units.length === 0 ? (
              <div className={styles.empty}>
                {hadUnits
                  ? "No units match the current filters."
                  : "No units planned yet."}
              </div>
            ) : (
              <div className={styles.nodes}>
                {units.map((u, i) => {
                  // Per-unit progress = fraction of its lessons marked done;
                  // a unit with 0 lessons is unstarted (never 0/0 = NaN).
                  const progress = u.total > 0 ? u.done / u.total : 0;
                  const complete = u.total > 0 && u.done === u.total;
                  const partial = progress > 0 && progress < 1;
                  const unitPct = Math.round(progress * 100);
                  return (
                    <Fragment key={u.id}>
                      {i > 0 ? (
                        <span className={styles.link} aria-hidden="true" />
                      ) : null}
                      {/* String content mirrors to native title= automatically
                          (Tooltip primitive), covering the touch long-press
                          path per CLAUDE.md §4. */}
                      <Tooltip
                        content={`${u.fullName} — ${unitPct}% taught · ${u.done}/${u.total} lessons`}
                        tooltipId="year-constellation-node"
                      >
                        <button
                          type="button"
                          className={styles.node}
                          onClick={() => onOpenUnit(subject.id, u.id)}
                        >
                          {/* Disc glyphs are decorative — the accessible name
                              is the label; the numbers live in the tooltip's
                              aria-describedby. */}
                          <span
                            className={`${styles.disc} ${
                              complete
                                ? styles.discDone
                                : partial
                                  ? styles.discPartial
                                  : styles.discTodo
                            }`}
                            aria-hidden="true"
                          >
                            {complete ? (
                              <span className={styles.check}>✓</span>
                            ) : partial ? (
                              <span className={styles.pctNum}>{unitPct}</span>
                            ) : null}
                          </span>
                          <span className={styles.nl}>{u.label}</span>
                        </button>
                      </Tooltip>
                    </Fragment>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
