"use client";

// TimelineLaneRow.tsx — one subject row of the Plan timeline.
//
// Structure mirrors the handoff (`ph-units.jsx:568-641`): a PINNED subject
// label (`ph-units.css:41` `position:sticky;left:0` — preserved, it is what
// keeps subject identity through the horizontal scroll) beside an absolutely
// positioned track carrying unit bands and lesson dots.
//
// AUTHORING, and its limits. A band can now be dragged to re-pace the unit's
// WEEK RANGE and its right edge dragged to lengthen or shorten it. A LESSON dot
// still only opens its lesson: the handoff drags dots too
// (`ph-units.jsx:357-374`), but a lesson's date is per-lesson forkable content
// and day-granularity storage is deferred by migration — see the ruling in
// lib/plan-timeline/drag.ts.
//
// EVERY POINTER GESTURE HAS A KEYBOARD EQUIVALENT. The handoff has none at all
// (`onPointerDown` throughout, `touch-action:none` on the marks — audit B6),
// which under CLAUDE.md §4's full-keyboard-navigation requirement makes the
// whole authoring surface unreachable for some teachers. Here Shift+←/→ moves a
// focused band by a week and Alt+Shift+←/→ moves its end, which is the same
// two gestures the pointer has, at the same granularity.

import type { CSSProperties, ReactNode } from "react";
import {
  DOT_STATE_LABEL,
  FORK_TIER_LABEL,
  weekRangeSlots,
  weeksLabel,
} from "@/lib/plan-timeline";
import type { TimelineBand, TimelineLane } from "@/lib/plan-timeline";
import type { SubjectId } from "@/lib/types";
import type { BandDragKind, UseBandDrag } from "./use-band-drag";
import styles from "./timeline.module.css";

export interface TimelineLaneRowProps {
  lane: TimelineLane;
  /** Number of axis columns — the track's width in column units. */
  columns: number;
  /** School days per week — turns a band's week range back into slot geometry
   *  for the drag preview. */
  schoolWeekLen: number;
  /** The shared drag session (one at a time across every lane). */
  drag: UseBandDrag;
  /** Is band authoring available? False in Personal mode — see `dragBlocked`. */
  dragEnabled: boolean;
  /** Why authoring is unavailable, appended to every band's tooltip so the
   *  absence of a gesture is explained where the gesture would have been
   *  rather than only in a toolbar hint the teacher may never read. */
  dragBlockedReason: string | null;
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
  schoolWeekLen,
  drag,
  dragEnabled,
  dragBlockedReason,
  matchesUnit,
  matchesLesson,
  onOpenUnit,
  onOpenLesson,
}: TimelineLaneRowProps): ReactNode {
  // The live session, but only if it belongs to THIS lane — one drag runs at a
  // time across the whole canvas and every lane sees the same object.
  const session =
    drag.session && drag.session.subject === lane.subject ? drag.session : null;
  const ghost =
    session && session.moved
      ? weekRangeSlots(session.next, schoolWeekLen, columns)
      : null;
  const ghostLevel = session
    ? (lane.bands.find((b) => b.unitId === session.unitId)?.level ?? 0)
    : 0;

  function bandKeyDown(
    e: React.KeyboardEvent<HTMLElement>,
    band: TimelineBand,
  ): void {
    if (!dragEnabled) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    // Shift is the modifier that turns arrow keys from "move focus" into "move
    // the unit" — unmodified arrows must keep doing what they do everywhere
    // else. Alt+Shift resizes; Alt alone is left to the browser (it is
    // history back/forward in several).
    if (!e.shiftKey) return;
    const kind: BandDragKind = e.altKey ? "resize" : "move";
    e.preventDefault();
    drag.nudge(lane.subject, band, kind, e.key === "ArrowLeft" ? -1 : 1);
  }

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
              // NOT "open them from the Lessons tab to re-date them": the unit
              // workspace's Lessons tab is read-only about dates (its row
              // actions are Plan / Teach / Finish — LessonsTab.tsx:51-85), and
              // the one surface that CAN re-date a lesson is the weekly card's
              // relocate picker, which by definition cannot show a lesson that
              // has no column. What actually moves these back into view is the
              // configuration that put them out of it.
              title={`${lane.unplaceableLessons} ${lane.name} lesson${lane.unplaceableLessons === 1 ? "" : "s"} sit on a weekday this school week no longer has, or on a week outside this academic year, so they have no column here. Settings → Calendar is where the school week and the year's dates are set.`}
            >
              {lane.unplaceableLessons} off-calendar
            </span>
          )}
          {lane.undatedUnits > 0 && (
            <span
              className={styles.laneUndated}
              // TWO populations, one count (lanes.ts:129 counts every unit
              // `unitSpan` returns null for): units with no week range and no
              // lesson to place them from, AND units whose STORED range lands
              // wholly outside the academic year (bands.ts:106-111 — weeks
              // 90–92 in a 40-week year). The old copy told the second kind it
              // "carries no weeks" and offered a remedy it had already done, so
              // the flag could not be cleared by following the instruction.
              title={`${lane.undatedUnits} ${lane.name} unit${lane.undatedUnits === 1 ? "" : "s"} have no week range inside this academic year and no dated lesson to place them from, so they cannot be drawn here. Open the unit and set a week range that falls inside the year.`}
            >
              {lane.undatedUnits} unscheduled
            </span>
          )}
        </span>
      </div>

      <div
        className={styles.laneTrack}
        // The column count travels on the ELEMENT because useBandDrag measures
        // this box to recover the used pixel width of one column — see the
        // note at the top of use-band-drag.ts on why the CSS variable cannot
        // be read instead.
        data-tl-track={columns}
        style={{ width: `calc(var(--tl-col) * ${columns})` }}
      >
        {/* Where the drag will land. Rendered inside the lane so it inherits
            the subject colour, and before the bands so it paints beneath
            them. */}
        {ghost && (
          <div
            className={styles.dragGhost}
            aria-hidden="true"
            style={{
              left: `calc(var(--tl-col) * ${ghost.startSlot})`,
              width: `calc(var(--tl-col) * ${ghost.endSlot - ghost.startSlot + 1})`,
              transform: ghostLevel
                ? `translateY(calc(${ghostLevel} * var(--tl-level-step)))`
                : undefined,
            }}
          />
        )}

        {lane.bands.map((band) => {
          const span = band.endSlot - band.startSlot + 1;
          const dim = !matchesUnit(band.unitId, band.name);
          const dragging = session?.unitId === band.unitId && session.moved;
          const where =
            band.spanSource === "weeks"
              ? `Planned for ${weeksLabel(band.weekRange.start, band.weekRange.end)}`
              : "Placed from the days its lessons fall on — it has no week range set";
          // The mismatch the drag itself can create, stated in words rather
          // than left as a pill the teacher has to interpret.
          const outside =
            band.lessonsOutside > 0
              ? ` ${band.lessonsOutside} of its lessons ${band.lessonsOutside === 1 ? "is" : "are"} dated outside those weeks.`
              : "";
          const how = dragEnabled
            ? " Drag to change the weeks it is planned for, or drag its right edge to lengthen it (Shift+← / Shift+→ to move, Alt+Shift+← / Alt+Shift+→ to resize). Click to open its planner."
            : dragBlockedReason
              ? ` Opens its unit planner. ${dragBlockedReason}`
              : " Opens its unit planner.";
          return (
            // The band and its resize grip are SIBLINGS inside a positioned
            // wrapper, not a grip nested in the band. A focusable control
            // inside a <button> is invalid content and gives the inner control
            // unreliable focus and activation behaviour across browsers — so
            // the wrapper carries the geometry and both controls are plain
            // native <button>s.
            <div
              key={band.unitId}
              className={styles.bandWrap}
              data-dim={dim || undefined}
              style={{
                left: `calc(var(--tl-col) * ${band.startSlot})`,
                width: `calc(var(--tl-col) * ${span})`,
                transform: band.level
                  ? `translateY(calc(${band.level} * var(--tl-level-step)))`
                  : undefined,
              }}
            >
              <button
                type="button"
                className={styles.band}
                data-draggable={dragEnabled || undefined}
                data-dragging={dragging || undefined}
                title={`${band.name} — ${band.total} lesson${band.total === 1 ? "" : "s"}, ${band.taught} taught, ${band.ready} fully planned. ${where}.${outside}${how}`}
                onPointerDown={(e) => drag.begin(e, lane.subject, band, "move")}
                onKeyDown={(e) => bandKeyDown(e, band)}
                onClick={() => {
                  // A finished drag consumes the click it produced. Without
                  // this every re-pace would also open the unit planner over
                  // the timeline the teacher was working on.
                  if (drag.consumeClickSuppression()) return;
                  onOpenUnit(band.unitId, band.name, lane.subject);
                }}
              >
                <span className={styles.bandName}>{band.name}</span>
                {band.lessonsOutside > 0 && (
                  // aria-hidden: the same fact is already in the button's
                  // `title`, in a full sentence. A screen reader announcing
                  // "3 out" would be less informative, not more.
                  <span className={styles.bandOutside} aria-hidden="true">
                    {band.lessonsOutside} out
                  </span>
                )}
                {/* ready/total (`ph-units.jsx:595`). The handoff renders this
                    bare at opacity .75, which reads as a fraction of nothing
                    in particular; the accessible name above spells it out. */}
                <span className={styles.bandCount} aria-hidden="true">
                  {band.ready}/{band.total}
                </span>
              </button>
              {dragEnabled && (
                <button
                  type="button"
                  className={styles.bandGrip}
                  aria-label={`Change how many weeks ${band.name} runs for`}
                  title={`${band.name} currently runs ${weeksLabel(band.weekRange.start, band.weekRange.end)}. Drag this edge, or press Alt+Shift+← / Alt+Shift+→, to change its length.`}
                  onPointerDown={(e) =>
                    drag.begin(e, lane.subject, band, "resize")
                  }
                  onClick={() => {
                    // Clear the suppression flag a completed resize set, so it
                    // cannot leak into the NEXT click on the band beside it.
                    drag.consumeClickSuppression();
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                    if (!e.shiftKey) return;
                    e.preventDefault();
                    drag.nudge(
                      lane.subject,
                      band,
                      "resize",
                      e.key === "ArrowLeft" ? -1 : 1,
                    );
                  }}
                />
              )}
            </div>
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
