// plan-timeline-drag.test.ts — the week-granularity band drag maths.
//
// Every helper under test is PURE (no React, no DOM, no store), which is the
// whole reason the geometry lives in lib/plan-timeline/ rather than inside the
// component: a drag that miscomputes a week is a data-corrupting bug, and it
// has to be provable without a browser.
//
// GRANULARITY IS WEEK, and that is a user ruling, not an implementation
// convenience — `units.start_week` / `end_week` already exist
// (20260518102823_initial_schema.sql:351-352) while day-level `anchor_slot` /
// `position` are deferred because they would "run two scheduling vocabularies
// in parallel" (20260728120000_track_b_workspace_fields.sql:36-42).

import { describe, expect, it } from "vitest";
import {
  MIN_UNIT_WEEKS,
  axisWeekCount,
  moveWeekRange,
  resizeWeekRange,
  weekOfSlot,
  weekRangeEquals,
  weekRangeSlots,
  weeksLabel,
} from "@/lib/plan-timeline/drag";
// Hoisted to module scope, not `await import`ed inside a test.
//
// A dynamic import inside a test charges that ONE test the cold transform cost
// of the imported module's whole dependency graph — `plannerMockSource` pulls
// in every fixture in lib/mock. Alone that is ~1.7s and invisible; under a full
// parallel `vitest run` it crossed vitest's 5s default and the file passed in
// isolation while failing in the suite. Deliberately not fixed by raising the
// timeout: that would leave a real hang, if one ever appeared here,
// indistinguishable from this.
import {
  assertUnitWeekPatch,
  expandStaleUnitKeys,
} from "@/lib/planner/source";
import { plannerMockSource } from "@/lib/planner/mock-source";

const LEN = 5; // a Mon–Fri school week
const SUN_THU = 5;

describe("weekOfSlot", () => {
  it("is 1-based and matches Lesson.week", () => {
    expect(weekOfSlot(0, LEN)).toBe(1);
    expect(weekOfSlot(4, LEN)).toBe(1);
    expect(weekOfSlot(5, LEN)).toBe(2);
    expect(weekOfSlot(49, LEN)).toBe(10);
  });

  it("never returns week 0 or a negative week for a negative slot", () => {
    // A pointer dragged left of the first column produces a negative slot. It
    // must clamp to week 1, not to week 0 — week 0 does not exist in this
    // app's vocabulary and would be written straight into `units.start_week`.
    expect(weekOfSlot(-1, LEN)).toBe(1);
    expect(weekOfSlot(-40, LEN)).toBe(1);
  });

  it("degrades to week 1 rather than dividing by zero", () => {
    // An empty school week (every weekday deselected in Settings) is a
    // reachable configuration, and `slot / 0` is Infinity — which would flow
    // into a week number and then into a patch.
    expect(weekOfSlot(12, 0)).toBe(1);
  });
});

describe("axisWeekCount", () => {
  it("counts the weeks an axis of N columns spans", () => {
    expect(axisWeekCount(50, LEN)).toBe(10);
  });

  it("counts a PARTIAL trailing week as a week", () => {
    // The academic year rarely divides evenly by the school week. A unit must
    // still be draggable into the final, short week.
    expect(axisWeekCount(52, LEN)).toBe(11);
  });

  it("is 0 for a degenerate axis", () => {
    expect(axisWeekCount(0, LEN)).toBe(0);
    expect(axisWeekCount(50, 0)).toBe(0);
  });
});

describe("moveWeekRange", () => {
  it("shifts both ends and preserves duration", () => {
    expect(moveWeekRange({ start: 9, end: 14 }, -6, 40)).toEqual({
      start: 3,
      end: 8,
    });
  });

  it("is an identity at delta 0", () => {
    expect(moveWeekRange({ start: 9, end: 14 }, 0, 40)).toEqual({
      start: 9,
      end: 14,
    });
  });

  it("clamps at week 1 WITHOUT squashing the unit", () => {
    // The failure this guards: clamping each end independently turns a 6-week
    // unit dragged off the left edge into a 1-week unit sitting on week 1, and
    // the teacher has silently lost five weeks of declared schedule.
    expect(moveWeekRange({ start: 3, end: 8 }, -10, 40)).toEqual({
      start: 1,
      end: 6,
    });
  });

  it("clamps at the last week WITHOUT squashing the unit", () => {
    expect(moveWeekRange({ start: 30, end: 35 }, 20, 40)).toEqual({
      start: 35,
      end: 40,
    });
  });

  it("REFUSES to move a unit longer than the year, rather than shortening it", () => {
    // Degenerate but reachable (a stale range, or an academic year later
    // shortened in Settings). Clamping it to the axis was the first
    // implementation and it is a data-loss bug: one nudge of a 50-week unit in
    // a 40-week year silently deleted ten weeks of declared schedule and
    // reported it as a move. A move must never change duration.
    expect(moveWeekRange({ start: 1, end: 50 }, 5, 10)).toEqual({
      start: 1,
      end: 50,
    });
    expect(moveWeekRange({ start: 1, end: 50 }, -5, 10)).toEqual({
      start: 1,
      end: 50,
    });
  });

  it("preserves duration EXACTLY at every clamped edge", () => {
    // The general form of the bug above. Any move, clamped or not, must return
    // a range of the same length.
    const cases: Array<[number, number, number, number]> = [
      [9, 14, -100, 40],
      [9, 14, 100, 40],
      [1, 1, -3, 40],
      [38, 40, 5, 40],
    ];
    for (const [start, end, delta, max] of cases) {
      const out = moveWeekRange({ start, end }, delta, max);
      expect(out.end - out.start).toBe(end - start);
      expect(out.start).toBeGreaterThanOrEqual(1);
      expect(out.end).toBeLessThanOrEqual(max);
    }
  });

  it("normalises a reversed stored range instead of rejecting it", () => {
    // `unitWeekRange` already normalises reversed input (bands.ts:64-66), and a
    // drag must not be the one place that hands one back out reversed.
    expect(moveWeekRange({ start: 14, end: 9 }, 1, 40)).toEqual({
      start: 10,
      end: 15,
    });
  });

  it("refuses a non-integer delta rather than writing a fractional week", () => {
    // `units.start_week` is an integer column and `slotOf` multiplies by the
    // school-week length — a 0.5 would place a band between two days and be
    // rejected by the mapper's `Number.isInteger` guard on the way back in,
    // making the write appear to succeed and then silently vanish on reload.
    expect(moveWeekRange({ start: 9, end: 14 }, 1.5, 40)).toEqual({
      start: 9,
      end: 14,
    });
    expect(moveWeekRange({ start: 9, end: 14 }, Number.NaN, 40)).toEqual({
      start: 9,
      end: 14,
    });
  });

  it("is an identity when the axis has no weeks", () => {
    expect(moveWeekRange({ start: 9, end: 14 }, -3, 0)).toEqual({
      start: 9,
      end: 14,
    });
  });
});

describe("resizeWeekRange", () => {
  it("moves the END only", () => {
    expect(resizeWeekRange({ start: 9, end: 14 }, 2, 40)).toEqual({
      start: 9,
      end: 16,
    });
  });

  it("never shrinks below MIN_UNIT_WEEKS", () => {
    // A zero- or negative-length unit is not expressible: `end_week` would sit
    // before `start_week` and the band would render inside-out.
    expect(resizeWeekRange({ start: 9, end: 14 }, -20, 40)).toEqual({
      start: 9,
      end: 9 + MIN_UNIT_WEEKS - 1,
    });
  });

  it("clamps the end to the last week of the axis", () => {
    expect(resizeWeekRange({ start: 30, end: 35 }, 20, 40)).toEqual({
      start: 30,
      end: 40,
    });
  });

  it("leaves a unit that starts past the axis end alone", () => {
    // Reachable with a stale range and a shortened academic year. Clamping the
    // END to the axis while the START sits beyond it would invert the range.
    expect(resizeWeekRange({ start: 45, end: 48 }, -1, 40)).toEqual({
      start: 45,
      end: 47,
    });
  });

  it("refuses a non-integer delta", () => {
    expect(resizeWeekRange({ start: 9, end: 14 }, 0.4, 40)).toEqual({
      start: 9,
      end: 14,
    });
  });
});

describe("weeksLabel", () => {
  it("matches the Supabase mapper's format exactly", () => {
    // supabase-source.ts:987-991. This label is the DISPLAY collapse every
    // non-timeline surface reads (unit cards, the rail). If the drag's
    // optimistic label and the mapper's echoed label differ by so much as the
    // dash character, the unit card visibly flickers between two spellings on
    // every successful write.
    expect(weeksLabel(9, 14)).toBe("Wk 9–14");
    expect(weeksLabel(12, 12)).toBe("Wk 12");
  });

  it("uses an EN DASH, not a hyphen", () => {
    expect(weeksLabel(1, 2)).toContain("–");
    expect(weeksLabel(1, 2)).not.toContain("-");
  });

  it("round-trips through the bands.ts parser", async () => {
    // The parser is the fallback path for any unit whose numeric fields are
    // absent (every mock unit, and any row read before the mapper widening).
    // A label this parser cannot read surfaces the unit as UNSCHEDULED.
    const { unitWeekRange } = await import("@/lib/plan-timeline/bands");
    expect(
      unitWeekRange({ weeks: weeksLabel(9, 14) } as never),
    ).toEqual({ start: 9, end: 14 });
    expect(unitWeekRange({ weeks: weeksLabel(3, 3) } as never)).toEqual({
      start: 3,
      end: 3,
    });
  });
});

describe("weekRangeSlots", () => {
  it("spans the whole of the first day of start to the last day of end", () => {
    expect(weekRangeSlots({ start: 2, end: 3 }, SUN_THU, 100)).toEqual({
      startSlot: 5,
      endSlot: 14,
    });
  });

  it("clamps to the axis", () => {
    expect(weekRangeSlots({ start: 1, end: 40 }, SUN_THU, 12)).toEqual({
      startSlot: 0,
      endSlot: 11,
    });
  });

  it("is null for a range entirely off the axis", () => {
    expect(weekRangeSlots({ start: 50, end: 52 }, SUN_THU, 12)).toBeNull();
  });
});

describe("weekRangeEquals", () => {
  it("distinguishes a real move from a no-op drag", () => {
    // The guard that stops a click-with-a-2px-wobble from issuing a write, a
    // toast, and an undo entry for a change the teacher did not make.
    expect(weekRangeEquals({ start: 9, end: 14 }, { start: 9, end: 14 })).toBe(
      true,
    );
    expect(weekRangeEquals({ start: 9, end: 14 }, { start: 9, end: 15 })).toBe(
      false,
    );
    expect(weekRangeEquals(null, { start: 9, end: 14 })).toBe(false);
    expect(weekRangeEquals(null, null)).toBe(true);
  });
});

// ── The write seam's own guard ─────────────────────────────────────────────
// `moveWeekRange` cannot emit an invalid range, but `UnitPatch` is a PUBLIC
// write seam and any caller can. These pin the guard that stands between an
// arbitrary caller and shared team content.

describe("assertUnitWeekPatch", () => {
  it("passes a patch with no week keys at all", async () => {
    expect(() => assertUnitWeekPatch({})).not.toThrow();
    expect(() => assertUnitWeekPatch({ notes: "hi" })).not.toThrow();
  });

  it("passes a well-formed pair, including a single-week unit", async () => {
    expect(() =>
      assertUnitWeekPatch({ startWeek: 3, endWeek: 8 }),
    ).not.toThrow();
    expect(() =>
      assertUnitWeekPatch({ startWeek: 3, endWeek: 3 }),
    ).not.toThrow();
  });

  it("REJECTS one end without the other", async () => {
    // The hole this closes: `{ startWeek: 20 }` on a unit whose end_week is 5
    // produces an inverted range that renders inside-out and runs the pacing
    // maths against a negative duration — on TEAM content every teacher sees.
    // A single end cannot be validated without reading the row, and a read
    // opens a race, so the pair is required.
    expect(() => assertUnitWeekPatch({ startWeek: 20 })).toThrow(
      /must be patched together/,
    );
    expect(() => assertUnitWeekPatch({ endWeek: 2 })).toThrow(
      /must be patched together/,
    );
  });

  it("REJECTS an inverted pair", async () => {
    expect(() => assertUnitWeekPatch({ startWeek: 9, endWeek: 4 })).toThrow(
      /must not be after/,
    );
  });

  it("REJECTS a fractional or non-positive week", async () => {
    // Both columns are NOT NULL integers; PostgREST would reject the whole
    // statement, taking the content keys in the same patch down with it.
    expect(() => assertUnitWeekPatch({ startWeek: 1.5, endWeek: 4 })).toThrow(
      /positive integer week/,
    );
    expect(() => assertUnitWeekPatch({ startWeek: 0, endWeek: 4 })).toThrow(
      /positive integer week/,
    );
    expect(() => assertUnitWeekPatch({ startWeek: 1, endWeek: -2 })).toThrow(
      /positive integer week/,
    );
  });

  it("is enforced by BOTH sources, not just the Supabase one", async () => {
    // Parity, or the flag-OFF path stores what production refuses and the bug
    // only ever appears for real teachers.
    await expect(
      plannerMockSource.updateUnitFields("u1", { startWeek: 9 }, "owner"),
    ).rejects.toThrow(/must be patched together/);
    await expect(
      plannerMockSource.updateUnitFields(
        "u1",
        { startWeek: 9, endWeek: 2 },
        "owner",
      ),
    ).rejects.toThrow(/must not be after/);
  });
});

describe("expandStaleUnitKeys", () => {
  it("drops the whole schedule when any one of its three keys is stale", async () => {
    // The retry path drops keys one at a time, which is right for content and
    // wrong here: `{ startWeek }` without `endWeek` is a patch the write seam
    // refuses, so a per-key drop leaves a retry that can never succeed.
    expect(expandStaleUnitKeys(["startWeek"]).sort()).toEqual([
      "endWeek",
      "startWeek",
    ]);
    expect(expandStaleUnitKeys(["endWeek"]).sort()).toEqual([
      "endWeek",
      "startWeek",
    ]);
  });

  it("leaves content keys exactly as they were", async () => {
    expect(expandStaleUnitKeys(["notes", "bigIdea"]).sort()).toEqual([
      "bigIdea",
      "notes",
    ]);
    expect(expandStaleUnitKeys([])).toEqual([]);
  });

  it("does not duplicate a key already in the set", async () => {
    const out = expandStaleUnitKeys(["startWeek", "endWeek", "notes"]);
    expect(out).toHaveLength(3);
    expect(new Set(out).size).toBe(3);
  });
});
