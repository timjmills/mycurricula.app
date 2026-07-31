"use client";

// TimelineLaneRow.tsx — one subject row of the Plan timeline.
//
// Structure mirrors the handoff (`ph-units.jsx:568-641`): a PINNED subject
// label (`ph-units.css:41` `position:sticky;left:0` — preserved, it is what
// keeps subject identity through the horizontal scroll) beside an absolutely
// positioned track carrying unit bands and lesson dots.
//
// NOT built in this wave, and deliberately: every authoring gesture. The
// handoff's bands and dots are pointer-drag surfaces (`ph-units.jsx:357-463`)
// with no keyboard equivalent at all (audit B6). Rather than ship a gesture a
// keyboard user cannot reach, bands and dots here are plain <button>s that OPEN
// the thing they represent — natively focusable, natively activatable, and the
// same affordance on touch as on desktop.

import type { CSSProperties, ReactNode } from "react";
import { DOT_STATE_LABEL, FORK_TIER_LABEL } from "@/lib/plan-timeline";
import type { TimelineLane } from "@/lib/plan-timeline";
import type { SubjectId } from "@/lib/types";
import styles from "./timeline.module.css";

export interface TimelineLaneRowProps {
  lane: TimelineLane;
  /** Number of axis columns — the track's width in column units. */
  columns: number;
  /** Predicate: is this band/dot a match for the live hub search? A non-match
   *  dims rather than disappears (`ph-units.jsx:594,607`) so the year keeps its
   *  shape while a teacher searches. Always true when the query is empty. */
  matchesUnit: (unitId: string, name: string) => boolean;
  matchesLesson: (title: string, unitId: string) => boolean;
  /** `subject` is NOT optional context — a unit slug is unique only WITHIN a
   *  subject, so `unitId` alone cannot identify the unit that was clicked. */
  onOpenUnit: (unitId: string, name: string, subject: SubjectId) => void;
  onOpenLesson: (lessonId: string, title: string) => void;
}

export function TimelineLaneRow({
  lane,
  columns,
  matchesUnit,
  matchesLesson,
  onOpenUnit,
  onOpenLesson,
}: TimelineLaneRowProps): ReactNode {
  return (
    <div
      className={`cp-subj ${lane.cls} ${styles.lane}`}
      data-lane-subject={lane.subject}
      // Both counts go to the STYLESHEET as variables rather than as computed
      // pixel heights, because the two step sizes they multiply — `--tl-hit`
      // and `--tl-level-step` — change under the coarse-pointer media query,
      // and an inline px height could not follow. `.lane`'s min-height is the
      // max of its base, the band-stack need, and the dot-stack need.
      style={
        {
          "--tl-stack": lane.maxDotStack,
          "--tl-levels": lane.levels,
        } as CSSProperties
      }
    >
      <div className={styles.laneLabel}>
        <span className={styles.laneSwatch} aria-hidden="true" />
        <span className={styles.laneText}>
          <span className={styles.laneName}>{lane.name}</span>
          {/* "Now: <unit>" (`ph-units.jsx:572`). Rendered ONLY when today has a
              known position — see lib/plan-timeline/dots.ts:NowRef. A "Now:"
              derived from a clamped week would name the wrong unit. */}
          {lane.currentUnitName && (
            <span className={styles.laneNow}>Now: {lane.currentUnitName}</span>
          )}
          {/* Today between two units. Labelled "Next", never "Now" — the
              handoff shows the upcoming unit under a "Now:" prefix, which
              names a unit the teacher is not teaching. */}
          {!lane.currentUnitName && lane.upcomingUnitName && (
            <span className={styles.laneNow}>Next: {lane.upcomingUnitName}</span>
          )}
          {lane.unplaceableLessons > 0 && (
            <span
              className={styles.laneUndated}
              title={`${lane.unplaceableLessons} ${lane.name} lesson${lane.unplaceableLessons === 1 ? "" : "s"} fall on a day this school week no longer has, or outside the academic year, so they have no column here. Open them from the Lessons tab to re-date them.`}
            >
              {lane.unplaceableLessons} off-calendar
            </span>
          )}
          {lane.undatedUnits > 0 && (
            <span
              className={styles.laneUndated}
              title={`${lane.undatedUnits} ${lane.name} unit${lane.undatedUnits === 1 ? "" : "s"} carry no weeks and no dated lesson, so they cannot be placed on this timeline. Open the unit to give it a week range.`}
            >
              {lane.undatedUnits} unscheduled
            </span>
          )}
        </span>
      </div>

      <div
        className={styles.laneTrack}
        style={{ width: `calc(var(--tl-col) * ${columns})` }}
      >
        {lane.bands.map((band) => {
          const span = band.endSlot - band.startSlot + 1;
          const dim = !matchesUnit(band.unitId, band.name);
          const where =
            band.spanSource === "weeks"
              ? "Placed from its week range"
              : "Placed from the days its lessons fall on — it has no week range set";
          return (
            <button
              key={band.unitId}
              type="button"
              className={styles.band}
              data-dim={dim || undefined}
              style={{
                left: `calc(var(--tl-col) * ${band.startSlot})`,
                width: `calc(var(--tl-col) * ${span})`,
                transform: band.level
                  ? `translateY(calc(${band.level} * var(--tl-level-step)))`
                  : undefined,
              }}
              title={`${band.name} — ${band.total} lesson${band.total === 1 ? "" : "s"}, ${band.taught} taught, ${band.ready} fully planned. ${where}. Opens its unit planner.`}
              onClick={() => onOpenUnit(band.unitId, band.name, lane.subject)}
            >
              <span className={styles.bandName}>{band.name}</span>
              {/* ready/total (`ph-units.jsx:595`). The handoff renders this bare
                  at opacity .75, which reads as a fraction of nothing in
                  particular; the accessible name above spells it out. */}
              <span className={styles.bandCount} aria-hidden="true">
                {band.ready}/{band.total}
              </span>
            </button>
          );
        })}

        {lane.dots.map((dot) => {
          const dim = !matchesLesson(dot.title, dot.unitId);
          const fork = FORK_TIER_LABEL[dot.fork];
          // Fan several lessons on one day apart vertically rather than
          // overdrawing them (`ph-units.jsx:604`) — in HIT-AREA units, not the
          // handoff's 24%–60% of the lane. A percentage fan puts two 44px touch
          // targets ~28px apart on a phone, so they overlap and the second is
          // unreachable.
          //
          // The fan runs DOWNWARD from the row axis rather than centring on it.
          // Centring pushed the topmost target of a three-deep stack to a
          // centre of −7px on a phone — above the lane entirely, overlapping
          // the row above. Going down only, the first dot always sits on the
          // band's axis and the lane grows beneath it (`--tl-stack`).
          const top = `calc(var(--tl-row-axis) + ${dot.stackIndex} * var(--tl-hit))`;
          return (
            <button
              key={dot.lessonId}
              type="button"
              className={styles.dot}
              data-state={dot.state}
              data-fork={dot.fork === "master" ? undefined : dot.fork}
              data-dim={dim || undefined}
              style={{
                left: `calc(var(--tl-col) * ${dot.slot} + var(--tl-col) / 2)`,
                top,
              }}
              // The handoff's dot shows its title only at colw>=80 and carries
              // NO aria-label or title (`ph-units.jsx:616`), so at the default
              // zoom every dot is an unnamed button (audit B7). Both attributes
              // are set here: `title` for the touch long-press path, aria-label
              // because the button has no text content at all.
              title={`${dot.title || "Untitled lesson"} — ${DOT_STATE_LABEL[dot.state]}${fork ? ` · ${fork}` : ""}. Opens the lesson.`}
              aria-label={`${dot.title || "Untitled lesson"}. ${DOT_STATE_LABEL[dot.state]}.${fork ? ` ${fork}.` : ""}`}
              onClick={() => onOpenLesson(dot.lessonId, dot.title)}
            />
          );
        })}
      </div>
    </div>
  );
}
