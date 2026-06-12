"use client";

// use-my-schedule — THE READ SEAM between a teacher's personal time
// blocks (Settings → Schedule, lib/use-schedule-settings.ts) and the
// planner's schedule surfaces (/schedule, the Weekly schedule mode, the
// Daily schedule mode).
//
// ── Status: NOT ADOPTED YET ────────────────────────────────────────────
// Planner surfaces still read the hand-authored fixture directly via
// `getDayBlocks()` in lib/schedule-data.ts. This hook is the drop-in
// replacement they migrate to in a follow-up wave (tracked with the
// Phase 1B backend work): swap `getDayBlocks(dayIndex)` for
// `useMySchedule(weekdayToken).blocks` and the teacher's custom
// timetable starts rendering with zero further changes — the shapes are
// identical (`TimelineBlock`).
//
// ── Contract ───────────────────────────────────────────────────────────
// Given a Weekday token ("sun".."sat"):
//   • If the teacher defined custom blocks for that day in Settings →
//     Schedule, those are returned, converted to TimelineBlock, with
//     `source: "custom"`.
//   • Otherwise the existing fixture day is returned untouched, with
//     `source: "fixture"`. The fixture is sample data (CLAUDE.md §1) —
//     surfaces can use `source` to badge it honestly ("Sample timetable").
//
// Fixture indexing: lib/schedule-data.ts keys its days 0..4 by POSITION
// in the school week (the same semantics as `Lesson.day` — "day 0 is the
// first day of the school week, whatever weekday that is"). So the
// fixture index for a weekday token is its position in the configured
// `useSchoolWeek().days`, never a hard-coded Sun..Thu mapping. A weekday
// outside the configured school week resolves to an empty fixture day.
//
// SSR-safe by construction: both underlying hooks render their SSR
// defaults first (empty custom map + default school week), so the first
// client render always matches the server (fixture data), and custom
// blocks arrive in the post-mount localStorage sync.

import { useMemo } from "react";
import { getDayBlocks, type TimelineBlock } from "@/lib/schedule-data";
import { useSchoolWeek, type Weekday } from "@/lib/use-school-week";
import {
  hhmmToMinutes,
  useScheduleBlocks,
  type StoredBlock,
  type StoredBlocksByDay,
} from "@/lib/use-schedule-settings";

// ── Types ──────────────────────────────────────────────────────────────────

/** Where a resolved day's blocks came from. */
export type MyScheduleSource = "custom" | "fixture";

export interface MyScheduleDay {
  day: Weekday;
  /** Timeline-ready blocks, sorted by start time. */
  blocks: readonly TimelineBlock[];
  /** "custom" = the teacher's own blocks; "fixture" = the sample day. */
  source: MyScheduleSource;
}

// ── Shape conversion ───────────────────────────────────────────────────────

/**
 * Convert one persisted block into the TimelineBlock shape every
 * schedule surface renders. Minute-of-day is cached here (same reason as
 * the fixture: the rendering pass shouldn't re-parse strings per frame).
 * `lesson` is null — linking a custom block to a scheduled lesson is a
 * Phase 1B concern (it needs the backend's lesson-event query).
 */
export function storedBlockToTimeline(block: StoredBlock): TimelineBlock {
  return {
    id: block.id,
    type: block.type,
    startMin: hhmmToMinutes(block.start),
    endMin: hhmmToMinutes(block.end),
    startLabel: block.start,
    endLabel: block.end,
    subject: block.subject,
    label: block.label,
    lesson: null,
  };
}

/** Resolve one weekday: custom blocks if any, else the fixture day at
 *  the weekday's school-week position. Pure — shared by both hooks. */
function resolveDay(
  day: Weekday,
  schoolWeekPosition: number,
  blocksByDay: StoredBlocksByDay,
): MyScheduleDay {
  const custom = blocksByDay[day];
  if (custom != null && custom.length > 0) {
    return {
      day,
      blocks: custom.map(storedBlockToTimeline),
      source: "custom",
    };
  }
  // Position -1 (weekday not in the configured school week) falls
  // through to getDayBlocks(-1) === [] — an empty fixture day.
  return { day, blocks: getDayBlocks(schoolWeekPosition), source: "fixture" };
}

// ── Hooks ──────────────────────────────────────────────────────────────────

/**
 * The teacher's effective timetable for one weekday — custom blocks
 * where defined, the sample fixture otherwise. See the module header for
 * adoption status (planner surfaces don't call this yet).
 */
export function useMySchedule(day: Weekday): MyScheduleDay {
  const { days } = useSchoolWeek();
  const { blocksByDay } = useScheduleBlocks();
  return useMemo(
    () => resolveDay(day, days.indexOf(day), blocksByDay),
    [day, days, blocksByDay],
  );
}

/**
 * Whole-week convenience: one entry per configured school day, in week
 * order. The drop-in successor to `getWeekBlocks()` in schedule-data.ts
 * for the /schedule week view (same per-day shape, plus day token +
 * source so the surface can badge sample days).
 */
export function useMyWeekSchedule(): MyScheduleDay[] {
  const { days } = useSchoolWeek();
  const { blocksByDay } = useScheduleBlocks();
  return useMemo(
    () => days.map((day, position) => resolveDay(day, position, blocksByDay)),
    [days, blocksByDay],
  );
}
