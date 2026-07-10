import { describe, it, expect } from "vitest";

import {
  todayItems,
  thisWeekItems,
  planScope,
  standardGaps,
} from "@/lib/catchup-scope";
import type { CatchupItem } from "@/lib/catchup-data";
import type { Lesson } from "@/lib/types";

// Pure scope derivations behind the v2 Catch-Up modal. No DOM, no clock —
// `todayCol` and `currentWeek` are always injected.

// ── Fixtures ────────────────────────────────────────────────────────────────

/** Build a CatchupItem with sensible defaults; override per test. */
function item(over: Partial<CatchupItem> & Pick<CatchupItem, "lessonId">): CatchupItem {
  return {
    subject: "math",
    unit: "Unit 1",
    dayLabel: "Sun · Wk 11",
    week: 11,
    day: 0,
    title: "Lesson",
    preview: "",
    status: "not_done",
    standards: [],
    resources: 0,
    reasonNotDone: "",
    daysLate: 0,
    isPersonal: false,
    modified: false,
    ...over,
  };
}

/** Build a minimal Lesson (only the fields standardGaps reads). */
function lesson(over: Partial<Lesson> & Pick<Lesson, "id">): Lesson {
  return {
    subject: "math",
    week: 11,
    day: 0,
    title: "Lesson",
    status: "not_done",
    standards: [],
    archived: false,
    ...over,
  } as Lesson;
}

// ── todayItems ──────────────────────────────────────────────────────────────

describe("todayItems", () => {
  const items = [
    item({ lessonId: "a", week: 11, day: 0 }),
    item({ lessonId: "b", week: 11, day: 2 }),
    item({ lessonId: "c", week: 10, day: 0 }),
  ];

  it("keeps only current-week items on today's configured column", () => {
    expect(todayItems(items, 11, 0).map((i) => i.lessonId)).toEqual(["a"]);
    expect(todayItems(items, 11, 2).map((i) => i.lessonId)).toEqual(["b"]);
  });

  it("returns nothing on a non-school day (todayCol === null)", () => {
    expect(todayItems(items, 11, null)).toEqual([]);
  });

  it("uses the injected column, not a hard-coded slice", () => {
    // day 2 is 'today' — a slice(0,4) or day===0 assumption would miss this.
    expect(todayItems(items, 11, 2).map((i) => i.lessonId)).toEqual(["b"]);
    // A column with no item today yields empty (not a fallback to day 0).
    expect(todayItems(items, 11, 4)).toEqual([]);
  });
});

// ── thisWeekItems ───────────────────────────────────────────────────────────

describe("thisWeekItems", () => {
  it("keeps every item in the current week regardless of day", () => {
    const items = [
      item({ lessonId: "a", week: 11, day: 0 }),
      item({ lessonId: "b", week: 11, day: 3 }),
      item({ lessonId: "c", week: 10, day: 0 }),
    ];
    expect(thisWeekItems(items, 11).map((i) => i.lessonId)).toEqual(["a", "b"]);
  });
});

// ── planScope ───────────────────────────────────────────────────────────────

describe("planScope", () => {
  const all = [
    item({ lessonId: "a", week: 11, day: 0 }),
    item({ lessonId: "b", week: 11, day: 2 }),
    item({ lessonId: "c", week: 9, day: 1 }),
  ];

  it("everything → all items, grouped by subject", () => {
    const plan = planScope("everything", all, 11, 0);
    expect(plan.mode).toBe("lessons");
    expect(plan.groupBy).toBe("subject");
    expect(plan.items).toHaveLength(3);
  });

  it("today → only today's column, grouped by subject", () => {
    const plan = planScope("today", all, 11, 2);
    expect(plan.mode).toBe("lessons");
    expect(plan.items.map((i) => i.lessonId)).toEqual(["b"]);
  });

  it("week → the current week, grouped by subject", () => {
    const plan = planScope("week", all, 11, 0);
    expect(plan.items.map((i) => i.lessonId)).toEqual(["a", "b"]);
  });

  it("unit → all items, grouped by unit", () => {
    const plan = planScope("unit", all, 11, 0);
    expect(plan.groupBy).toBe("unit");
    expect(plan.items).toHaveLength(3);
  });

  it("subject → all items, grouped by subject", () => {
    const plan = planScope("subject", all, 11, 0);
    expect(plan.groupBy).toBe("subject");
    expect(plan.items).toHaveLength(3);
  });

  it("standards → gap mode, no items", () => {
    const plan = planScope("standards", all, 11, 0);
    expect(plan.mode).toBe("gaps");
    expect(plan.items).toEqual([]);
  });

  it("returns a fresh array (never aliases the input)", () => {
    const plan = planScope("everything", all, 11, 0);
    expect(plan.items).not.toBe(all);
  });
});

// ── standardGaps ────────────────────────────────────────────────────────────

describe("standardGaps", () => {
  const describe_ = (code: string) => `Desc for ${code}`;

  it("surfaces standards with no taught (done) lesson", () => {
    const lessons = [
      // 5.NBT.1 taught (a done lesson tags it) → NOT a gap.
      lesson({ id: "l1", subject: "math", standards: ["5.NBT.1"], status: "done" }),
      // 5.NF.1 tagged only by a not-done lesson → a gap.
      lesson({ id: "l2", subject: "math", standards: ["5.NF.1"], status: "not_done" }),
    ];
    const gaps = standardGaps(lessons, 11, describe_);
    expect(gaps.map((g) => g.code)).toEqual(["5.NF.1"]);
    expect(gaps[0].desc).toBe("Desc for 5.NF.1");
    expect(gaps[0].subject).toBe("math");
    expect(gaps[0].unit).toBeTruthy();
  });

  it("excludes archived and future-week lessons from the coverage set", () => {
    const lessons = [
      // Archived → invisible: its standard should not appear at all.
      lesson({
        id: "a",
        standards: ["ARCH.1"],
        status: "not_done",
        archived: true,
      }),
      // Future week → not yet missable.
      lesson({ id: "f", standards: ["FUT.1"], status: "not_done", week: 20 }),
      // Eligible gap.
      lesson({ id: "g", standards: ["NOW.1"], status: "not_done", week: 11 }),
    ];
    const gaps = standardGaps(lessons, 11, describe_);
    expect(gaps.map((g) => g.code)).toEqual(["NOW.1"]);
  });

  it("returns no gaps when every standard is taught", () => {
    const lessons = [
      lesson({ id: "l1", standards: ["S1"], status: "done" }),
      lesson({ id: "l2", standards: ["S2"], status: "done" }),
    ];
    expect(standardGaps(lessons, 11, describe_)).toEqual([]);
  });
});
