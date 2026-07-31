import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveCurrentWeek } from "@/lib/school-week-now";
import {
  isTodayEmphasisWeek,
  todayIsInConfiguredYear,
} from "@/lib/now-anchor";

// ── "Today" must mean today ────────────────────────────────────────────────
//
// THE DEFECT THIS PINS
// ────────────────────
// `lib/mock/lessons.ts` exports `CURRENT_WEEK = 12` — a fixture literal, frozen
// so that "weeks 11 and 13 bracket it". Two different populations of code read
// it as the answer to "which week is now?":
//
//   • The planner's OPENING week. Fixed earlier (lib/app-state.tsx now seeds
//     `week` from `resolveCurrentWeek` against the configured academic year).
//   • Roughly a dozen today-markers, the `T` shortcut, and both "Today"
//     buttons. Those still read the fixture — which is what this suite covers.
//
// So the app disagreed with itself ON ONE SCREEN: it opened on the derived
// week and then drew its today-ring on week 12. And the controls labelled
// "Today" NAVIGATED the teacher from the correct week to the fixture one.
//
// Localhost runs the mock planner path, so a browser cannot separate "the
// surface derives the week" from "the surface happens to agree with the
// fixture". These tests are therefore deterministic and clock-free: every
// `today` is injected.

// ───────────────────────────────────────────────────────────────────────────
// Part 1 — behaviour: the emphasis follows the derivation, not the fixture
// ───────────────────────────────────────────────────────────────────────────

/** The frozen fixture value. Referenced as a literal ON PURPOSE: importing
 *  `CURRENT_WEEK` here would make this file an offender in the sibling
 *  mock-import ratchet, and the point is to assert we are NOT equal to it. */
const FROZEN_MOCK_WEEK = 12;

/** A year long enough that week 12 exists and is distinguishable. */
const YEAR_START = new Date(2026, 7, 16); // Sun 16 Aug 2026
const YEAR_END = new Date(2027, 5, 24); // Thu 24 Jun 2027

describe("the today-emphasis gate follows the derived week", () => {
  it("lights the week that actually contains today", () => {
    // Sun 30 Aug 2026 — 14 days after the start, so week 3.
    const today = new Date(2026, 7, 30);
    const { week, basis } = resolveCurrentWeek(today, YEAR_START, YEAR_END);

    expect(basis).toBe("in-range");
    expect(week).toBe(3);
    expect(isTodayEmphasisWeek(week, week, basis)).toBe(true);
  });

  it("does NOT light the frozen mock week — the defect, stated directly", () => {
    const today = new Date(2026, 7, 30); // week 3
    const { week, basis } = resolveCurrentWeek(today, YEAR_START, YEAR_END);

    // Pre-fix, a teacher paging to week 12 saw a "Today" ring there in late
    // August. That is the assertion that failed before this migration.
    expect(week).not.toBe(FROZEN_MOCK_WEEK);
    expect(isTodayEmphasisWeek(FROZEN_MOCK_WEEK, week, basis)).toBe(false);
  });

  it("agrees with the week the planner opens on", () => {
    // lib/app-state.tsx seeds the VIEWED week from the same resolution. The
    // one-screen contradiction was that these two answers differed, so pin
    // them together rather than pinning each to a number.
    for (const today of [
      new Date(2026, 7, 16), // first day
      new Date(2026, 8, 15),
      new Date(2026, 11, 1),
      new Date(2027, 2, 3),
      new Date(2027, 5, 24), // last day
    ]) {
      const { week: openingWeek, basis } = resolveCurrentWeek(
        today,
        YEAR_START,
        YEAR_END,
      );
      expect(isTodayEmphasisWeek(openingWeek, openingWeek, basis)).toBe(true);
    }
  });

  it("lights exactly one week out of the whole year", () => {
    const today = new Date(2026, 9, 6);
    const { week, basis, totalWeeks } = resolveCurrentWeek(
      today,
      YEAR_START,
      YEAR_END,
    );
    const lit: number[] = [];
    for (let w = 1; w <= totalWeeks; w++) {
      if (isTodayEmphasisWeek(w, week, basis)) lit.push(w);
    }
    expect(lit).toEqual([week]);
  });
});

describe("a CLAMPED current week draws no today-marker", () => {
  // `resolveCurrentWeek` never invents a week: outside the configured year it
  // clamps and reports which rule fired. Clamping is right for NAVIGATION —
  // the nearest week is where a teacher wants to land, and it is where the
  // planner opens. It is wrong for EMPHASIS: painting "Today" on week 1 while
  // the year has not begun asserts that day is happening now.

  it("suppresses the marker before the year starts (LIVE on 2026-07-31)", () => {
    const today = new Date(2026, 6, 31); // before YEAR_START
    const { week, basis } = resolveCurrentWeek(today, YEAR_START, YEAR_END);

    expect(basis).toBe("before-start");
    expect(week).toBe(1); // still navigable — the planner opens here
    expect(todayIsInConfiguredYear(basis)).toBe(false);
    expect(isTodayEmphasisWeek(week, week, basis)).toBe(false);
  });

  it("suppresses the marker after the year ends", () => {
    const today = new Date(2027, 7, 1); // after YEAR_END
    const { week, basis, totalWeeks } = resolveCurrentWeek(
      today,
      YEAR_START,
      YEAR_END,
    );

    expect(basis).toBe("after-end");
    expect(week).toBe(totalWeeks);
    expect(isTodayEmphasisWeek(week, week, basis)).toBe(false);
  });

  it("suppresses the marker when the academic year is unusable", () => {
    const { week, basis } = resolveCurrentWeek(
      new Date(2026, 7, 30),
      new Date(Number.NaN),
      YEAR_END,
    );

    expect(basis).toBe("unconfigured");
    expect(isTodayEmphasisWeek(week, week, basis)).toBe(false);
  });

  it("suppresses it on EVERY week, not just the clamped one", () => {
    // The marker must not slide to some other column when clamped.
    const { week, basis, totalWeeks } = resolveCurrentWeek(
      new Date(2026, 6, 31),
      YEAR_START,
      YEAR_END,
    );
    for (let w = 1; w <= totalWeeks; w++) {
      expect(isTodayEmphasisWeek(w, week, basis)).toBe(false);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Part 2 — adoption: the surfaces themselves stopped reading the fixture
// ───────────────────────────────────────────────────────────────────────────
//
// The gate above can be correct while a component ignores it — pre-fix, each
// of these files carried its own inline `week === CURRENT_WEEK`. Behaviour
// alone therefore cannot prove the migration landed, so this half reads the
// sources.
//
// It is NOT a duplicate of `tests/no-mock-in-live-surfaces.test.ts`. That test
// bans the import; this one asserts the POSITIVE — that each surface now reads
// the derived value from the store — which a ban cannot express. A file that
// dropped the import and hard-coded `12` would pass there and fail here.

const repoRoot = path.resolve(__dirname, "..");

/** Every surface migrated off the fixture, with the symbol it must now read. */
const MIGRATED: ReadonlyArray<{ file: string; reads: string }> = [
  // (a) WRONG ACTION — controls that NAVIGATED to the fixture week.
  { file: "components/daily/TodayJumpButton.tsx", reads: "currentWeek" },
  { file: "lib/use-keyboard-shortcuts.ts", reads: "currentWeek" },
  { file: "components/weekly/WeeklyShell.tsx", reads: "currentWeek" },
  { file: "components/weekly/weekly-board.tsx", reads: "currentWeek" },
  // (b) WRONG PIXELS — today-rings / status splits drawn at the fixture week.
  { file: "components/week-v2/WeekA.tsx", reads: "currentWeekBasis" },
  { file: "components/week-v2/WeekC.tsx", reads: "currentWeekBasis" },
  { file: "components/weekly/WeekColumns.tsx", reads: "currentWeekBasis" },
  { file: "components/grid/WeeklyGrid.tsx", reads: "currentWeekBasis" },
  { file: "components/daily/DailyView.tsx", reads: "currentWeekBasis" },
  { file: "components/daily/NowLine.tsx", reads: "currentWeekBasis" },
  { file: "components/year/TimelineYear.tsx", reads: "currentWeek" },
  { file: "components/year/YearView.tsx", reads: "currentWeekBasis" },
  { file: "components/year/YearMobile.tsx", reads: "currentWeek" },
  { file: "components/year/SubjectCalendar.tsx", reads: "currentWeekBasis" },
  { file: "components/year/RoadmapView.tsx", reads: "currentWeekBasis" },
  { file: "components/year/ProgressionView.tsx", reads: "currentWeekBasis" },
];

/**
 * Frozen v1 rollback copies, reachable only under `NEXT_PUBLIC_V2=0`. They are
 * verbatim snapshots of what shipped to prod and must NOT be modernised — a
 * rollback that renders differently from the thing it rolls back to is not a
 * rollback. Listed so the exemption is deliberate and reviewable rather than
 * an omission.
 */
const FROZEN_V1 = ["components/weekly/WeeklyShellV1.tsx"];

// `lib/home/today.ts` is the OTHER v1-only reader (it feeds components/home,
// the "Quiet Dawn" home that /home serves under NEXT_PUBLIC_V2=0). It is
// deliberately NOT asserted here: it belongs to a different lane, so pinning
// its contents from this file would turn a legitimate change over there into a
// failure over here. Noted so the exemption is on the record either way.

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

/** Strip line and block comments so a NARRATIVE mention of the fixture (this
 *  migration left several, explaining what changed) can't read as a use. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("live surfaces read the derived current week, not the fixture", () => {
  it.each(MIGRATED)("$file no longer uses CURRENT_WEEK", ({ file }) => {
    expect(stripComments(read(file))).not.toContain("CURRENT_WEEK");
  });

  it.each(MIGRATED)("$file reads $reads from the store", ({ file, reads }) => {
    expect(stripComments(read(file))).toContain(reads);
  });

  it("does not silently hard-code the fixture value instead", () => {
    // Dropping the import and writing `week === 12` would satisfy the ban in
    // the sibling ratchet while preserving the bug exactly.
    for (const { file } of MIGRATED) {
      const src = stripComments(read(file));
      expect(src, `${file} compares a week against a literal 12`).not.toMatch(
        /\bweek\s*===?\s*12\b/,
      );
    }
  });

  it("leaves the frozen v1 rollback copies alone", () => {
    for (const file of FROZEN_V1) {
      expect(read(file), `${file} should still be the v1 snapshot`).toContain(
        "CURRENT_WEEK",
      );
    }
  });
});
