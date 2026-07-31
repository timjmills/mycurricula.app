// plan-timeline/lanes.ts — assemble the timeline's subject lanes.
//
// One lane per subject (`ph-units.jsx:560`), each carrying its unit bands and
// its lesson dots. Pure: no React, no store, no DOM — the component hands in
// what it read, so every geometry decision here is unit-testable.

import type { Lesson, Subject, Unit } from "@/lib/types";
import { stripHtml } from "@/lib/html-text";
import { slotOf } from "./axis";
import { packLevels, unitSpan } from "./bands";
import { dotStateFor, forkTierFor, planningGapCount, stackBySlot } from "./dots";
import type { NowRef } from "./dots";
import type { TimelineBand, TimelineDot, TimelineLane } from "./types";

export interface BuildLanesInput {
  subjects: readonly Subject[];
  units: readonly Unit[];
  lessons: readonly Lesson[];
  schoolWeekLen: number;
  axisLength: number;
  /** Today's position, or null when it is not known — see `dots.ts:NowRef`. */
  now: NowRef | null;
  /** The today slot, or null when it cannot be placed — see
   *  `axis.ts:todayLineSlot`. Drives the "Now: <unit>" subtitle, which is
   *  omitted rather than guessed when today has no location. */
  todaySlot: number | null;
  /** Section-aware resource predicate — see `dots.ts:planningGapCount`. */
  hasResources?: (lesson: Lesson) => boolean;
  /** Is this slot a configured holiday? Supplied from the axis so a lesson
   *  parked on a "no school" column is never called missed — see
   *  `dots.ts:dotStateFor`. Absent = no holidays known. */
  isHolidaySlot?: (slot: number) => boolean;
}

/** Units and lessons are keyed per subject: a unit slug is unique only WITHIN
 *  a subject, so a flat `unitById[slug]` would collide two same-slug units
 *  across subjects (the same trap PlannerHub.tsx:59-62 documents for doc keys). */
function unitKey(subject: string, unitId: string): string {
  return `${subject}\n${unitId}`;
}

export function buildTimelineLanes(input: BuildLanesInput): TimelineLane[] {
  const {
    subjects,
    units,
    lessons,
    schoolWeekLen,
    axisLength,
    now,
    todaySlot,
    hasResources,
    isHolidaySlot,
  } = input;

  if (schoolWeekLen <= 0 || axisLength <= 0) return [];

  // Bucket lessons once, by subject and by subject+unit.
  const bySubject = new Map<string, Lesson[]>();
  // PLACEABLE lessons, for GEOMETRY (a band cannot be positioned from a lesson
  // that has no column).
  const byUnit = new Map<string, Lesson[]>();
  // EVERY non-archived lesson, for MEMBERSHIP (a unit's lesson count is a fact
  // about the unit, not about the calendar). Keeping one bucket for both made
  // a band read "3 lessons" the moment two of its five fell off the calendar —
  // understating the unit's real content exactly when a teacher is trying to
  // work out what happened to it.
  const byUnitAll = new Map<string, Lesson[]>();
  const unplaceableBySubject = new Map<string, number>();
  for (const l of lessons) {
    if (l.archived) continue;
    push(byUnitAll, unitKey(l.subject, l.unit), l);
    // The week/day pair must ADDRESS a real column before it is turned into a
    // slot. `day >= schoolWeekLen` is the live case — the school week is
    // configurable (CLAUDE.md §1), and a lesson saved on day 4 of a 5-day week
    // keeps `day: 4` after a move to a 4-day week, where the arithmetic lands
    // it on day 0 of the NEXT week. Counted, so it is visible rather than
    // vanished, but never drawn on a day it is not on.
    const placeable =
      Number.isInteger(l.week) &&
      l.week >= 1 &&
      Number.isInteger(l.day) &&
      l.day >= 0 &&
      l.day < schoolWeekLen;
    const slot = placeable ? slotOf(l.week, l.day, schoolWeekLen) : -1;
    if (!placeable || slot < 0 || slot >= axisLength) {
      // Off the configured YEAR is a different thing from off the configured
      // WEEK, but both mean "this lesson has no column", and the teacher's
      // question is the same either way.
      unplaceableBySubject.set(
        l.subject,
        (unplaceableBySubject.get(l.subject) ?? 0) + 1,
      );
      continue;
    }
    push(bySubject, l.subject, l);
    push(byUnit, unitKey(l.subject, l.unit), l);
  }

  const lanes: TimelineLane[] = [];

  for (const subject of subjects) {
    const subjectUnits = units.filter(
      (u) => u.subject === subject.id && !u.archived,
    );
    const subjectLessons = bySubject.get(subject.id) ?? [];
    const unplaceableLessons = unplaceableBySubject.get(subject.id) ?? 0;
    // A subject with neither units nor dated lessons has no lane at all —
    // an empty row would read as "planned nothing" when the truth is
    // "not part of this plan". A subject whose ONLY lessons are unplaceable
    // still gets a lane, because "N lessons are not on this timeline" is
    // exactly what that teacher needs to be told.
    if (
      subjectUnits.length === 0 &&
      subjectLessons.length === 0 &&
      unplaceableLessons === 0
    ) {
      continue;
    }

    // ── Bands ────────────────────────────────────────────────────────────
    const placed: { unit: Unit; startSlot: number; endSlot: number; source: TimelineBand["spanSource"] }[] =
      [];
    let undatedUnits = 0;
    for (const unit of subjectUnits) {
      // Geometry only — a lesson with no column cannot position a band.
      const placeableLessons = byUnit.get(unitKey(subject.id, unit.id)) ?? [];
      const span = unitSpan(unit, placeableLessons, schoolWeekLen, axisLength);
      if (!span) {
        undatedUnits += 1;
        continue;
      }
      placed.push({ unit, ...span });
    }
    placed.sort((a, b) => a.startSlot - b.startSlot || a.endSlot - b.endSlot);
    const levels = packLevels(placed);

    const bands: TimelineBand[] = placed.map((p, i) => {
      // ALL of the unit's lessons, not just the placeable ones — see the
      // `byUnitAll` note above.
      const unitLessons = byUnitAll.get(unitKey(subject.id, p.unit.id)) ?? [];
      let ready = 0;
      let taught = 0;
      for (const l of unitLessons) {
        if (planningGapCount(l, hasResources) === 0) ready += 1;
        if (l.status === "done") taught += 1;
      }
      return {
        unitId: p.unit.id,
        name: p.unit.name,
        startSlot: p.startSlot,
        endSlot: p.endSlot,
        level: levels[i],
        ready,
        taught,
        total: unitLessons.length,
        spanSource: p.source,
      };
    });

    // ── Dots ─────────────────────────────────────────────────────────────
    // EVERY dated lesson of the subject, not just those in a placed unit.
    // The prototype only walks `unit.lessons` (`ph-units.jsx:602`); here a
    // lesson can carry a `unit` slug that resolves to nothing (the shipped
    // "unfiled" case), and silently dropping it would show a teacher a year
    // with lessons missing from it.
    const dots: TimelineDot[] = stackBySlot(
      subjectLessons
        .map((l) => {
          const slot = slotOf(l.week, l.day, schoolWeekLen);
          return {
            lessonId: l.id,
            unitId: l.unit,
            title: stripHtml(l.title),
            slot,
            state: dotStateFor(l, now, {
              hasResources,
              onHoliday: isHolidaySlot?.(slot) ?? false,
            }),
            fork: forkTierFor(l),
          };
        })
        .sort((a, b) => a.slot - b.slot),
    );

    // ── "Now: <unit>" / "Next: <unit>" ───────────────────────────────────
    // CONTAINING, not "the first that has not ended". The handoff's
    // `units.find(u => u.endSlot >= TODAY_SLOT) || units[0]`
    // (`ph-units.jsx:474`) labels the NEXT unit "Now:" whenever today sits in
    // the gap between two units — naming a unit the teacher is not teaching.
    // Here the gap gets its own, true, label. Both are null when today has no
    // location on this axis.
    const current =
      todaySlot === null
        ? null
        : (bands.find(
            (b) => b.startSlot <= todaySlot && todaySlot <= b.endSlot,
          ) ?? null);
    const upcoming =
      todaySlot === null || current !== null
        ? null
        : (bands.find((b) => b.startSlot > todaySlot) ?? null);

    lanes.push({
      subject: subject.id,
      name: subject.name,
      cls: subject.cls,
      bands,
      dots,
      levels: bands.length === 0 ? 1 : Math.max(...bands.map((b) => b.level)) + 1,
      currentUnitName: current ? current.name : null,
      upcomingUnitName: upcoming ? upcoming.name : null,
      maxDotStack: dots.reduce((m, d) => Math.max(m, d.stackSize), 1),
      undatedUnits,
      unplaceableLessons,
    });
  }

  return lanes;
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
