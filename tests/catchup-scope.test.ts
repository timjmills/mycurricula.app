import { describe, it, expect } from "vitest";

import {
  todayItems,
  thisWeekItems,
  planScope,
  standardGaps,
  type ScopeToday,
} from "@/lib/catchup-scope";
import type { CatchupItem } from "@/lib/catchup-data";
import type { Lesson, Unit } from "@/lib/types";

// Pure scope derivations behind the v2 Catch-Up modal. No DOM, no clock — the
// `ScopeToday` anchor and the unit catalog are always injected.
//
// The property under test throughout: these filters answer to the CLOCK, never
// to the week the planner happens to be browsing. `useAppState().week` is the
// FOCUSED week and reads like the current week at every callsite; passing it
// here made "Today" mean "the Tuesday of the week you're looking at" (the same
// defect 41aab70 fixed in `daysLate`). The only legitimate use of the browsed
// week is upstream, as `deriveCatchupItems`' eligibility horizon — which is
// modelled below by varying the ITEM SET, not by varying an argument to these
// functions, because they no longer take one.

// ── Fixtures ────────────────────────────────────────────────────────────────

/** Build a CatchupItem with sensible defaults; override per test. */
function item(
  over: Partial<CatchupItem> & Pick<CatchupItem, "lessonId">,
): CatchupItem {
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

/**
 * One item per (week, column) slot — the item set `deriveCatchupItems` would
 * hand over for a school week `dayCount` days long, browsing up to `throughWeek`
 * (its horizon is `lesson.week <= browsedWeek`).
 *
 * Ids read "w12d2", so an assertion names the exact slot it expects and a
 * wrong-week match is legible in the failure output rather than a bare count.
 */
function horizon(dayCount: number, throughWeek: number): CatchupItem[] {
  const out: CatchupItem[] = [];
  for (let week = throughWeek - 4; week <= throughWeek; week++) {
    for (let day = 0; day < dayCount; day++) {
      out.push(item({ lessonId: `w${week}d${day}`, week, day }));
    }
  }
  return out;
}

const ids = (items: readonly CatchupItem[]): string[] =>
  items.map((i) => i.lessonId);

/** Build a minimal Lesson (only the fields standardGaps reads). */
function lesson(over: Partial<Lesson> & Pick<Lesson, "id">): Lesson {
  return {
    subject: "math",
    unit: "u-m3",
    week: 11,
    day: 0,
    title: "Lesson",
    status: "not_done",
    standards: [],
    archived: false,
    ...over,
  } as Lesson;
}

/** A unit catalog with TWO units in the same subject — the shape that makes a
 *  per-subject unit lookup detectably wrong. A single-unit catalog would pass
 *  the old `UNITS[subject].name` code vacuously. */
const CATALOG: Unit[] = [
  { id: "m-u2", subject: "math", name: "Multiplication & Division", weeks: "Wk 7–10", shade: 1 }, // prettier-ignore
  { id: "u-m3", subject: "math", name: "Fractions", weeks: "Wk 11–16", shade: 2 }, // prettier-ignore
  { id: "u-e2", subject: "explorers", name: "Ancient Civilizations", weeks: "Wk 7–14", shade: 1 }, // prettier-ignore
];

// The two school-week lengths every day-indexed assertion runs under. Column 2
// is the LAST day of a 3-day week and the MIDDLE of a 5-day one, so no
// hard-coded day count — `slice(0, 4)`, `length - 1`, `day === 0` — can satisfy
// both. CLAUDE.md §1: never assume a 5-day Sun–Thu week.
const WEEK_LENGTHS = [
  { label: "3-day school week", dayCount: 3 },
  { label: "5-day school week", dayCount: 5 },
] as const;

// ── todayItems ──────────────────────────────────────────────────────────────

describe.each(WEEK_LENGTHS)("todayItems ($label)", ({ dayCount }) => {
  const items = horizon(dayCount, 12);

  it("keeps only items in TODAY's week, on today's configured column", () => {
    expect(ids(todayItems(items, { week: 12, day: 2 }))).toEqual(["w12d2"]);
    expect(ids(todayItems(items, { week: 10, day: 0 }))).toEqual(["w10d0"]);
  });

  it("uses the injected column, not a hard-coded slice or the week's end", () => {
    // Column 2 is the last day of a 3-day week and the middle of a 5-day one.
    expect(ids(todayItems(items, { week: 11, day: 2 }))).toEqual(["w11d2"]);
    // A column past this school's week has no item — and does NOT fall back
    // to day 0, which is how a length assumption would show up.
    expect(todayItems(items, { week: 11, day: dayCount })).toEqual([]);
  });

  it("returns nothing on a non-school day (day === null), and something on a school day", () => {
    // Absence + its positive control in ONE evaluation: the empty result is
    // only meaningful because the same item set answers the resolved anchor.
    expect([
      todayItems(items, { week: 12, day: null }).length,
      todayItems(items, { week: 12, day: 2 }).length,
    ]).toEqual([0, 1]);
  });

  it("returns nothing when today's WEEK is unknown, and something when it isn't", () => {
    expect([
      todayItems(items, { week: null, day: 2 }).length,
      todayItems(items, { week: null, day: null }).length,
      todayItems(items, { week: 12, day: 2 }).length,
    ]).toEqual([0, 0, 1]);
  });
});

// ── thisWeekItems ───────────────────────────────────────────────────────────

describe.each(WEEK_LENGTHS)("thisWeekItems ($label)", ({ dayCount }) => {
  const items = horizon(dayCount, 12);

  it("keeps every item in TODAY's week, on every column of it", () => {
    const kept = thisWeekItems(items, { week: 12, day: 2 });
    expect(kept).toHaveLength(dayCount);
    expect(ids(kept)).toEqual(
      Array.from({ length: dayCount }, (_, d) => `w12d${d}`),
    );
  });

  it("does not need a day column — a weekend still has a 'this week'", () => {
    // The two halves of the anchor fail independently. Collapsing them would
    // empty this chip every Saturday, which would be a new bug, not a fix.
    expect(ids(thisWeekItems(items, { week: 12, day: null }))).toEqual(
      ids(thisWeekItems(items, { week: 12, day: 2 })),
    );
    expect(thisWeekItems(items, { week: 12, day: null })).toHaveLength(
      dayCount,
    );
  });

  it("returns nothing when today's week is unknown, and something when it isn't", () => {
    expect([
      thisWeekItems(items, { week: null, day: 2 }).length,
      thisWeekItems(items, { week: 12, day: 2 }).length,
    ]).toEqual([0, dayCount]);
  });
});

// ── planScope — the browsed-week defect ─────────────────────────────────────

describe.each(WEEK_LENGTHS)(
  "planScope anchors 'Today' and 'This week' to the clock ($label)",
  ({ dayCount }) => {
    // Today is week 12, column 2, in every case below. Only the BROWSED week
    // moves — expressed, as it is in production, through the item set that
    // `deriveCatchupItems` returns for that horizon.
    const TODAY: ScopeToday = { week: 12, day: 2 };

    it("browsing FORWARD does not move 'Today' onto the browsed week", () => {
      // Horizon through week 14 (teacher paged two weeks ahead). Both w12d2
      // and w14d2 are in the set, so this is value-vs-value, not an absence:
      // the pre-fix code answered w14d2 because the browsed week was the only
      // week it consulted.
      const browsedAhead = horizon(dayCount, 14);
      const plan = planScope("today", browsedAhead, TODAY);
      expect(ids(plan.items)).toEqual(["w12d2"]);
      expect(plan.todayUnknown).toBe(false);
    });

    it("browsing FORWARD does not move 'This week' onto the browsed week", () => {
      const browsedAhead = horizon(dayCount, 14);
      const plan = planScope("week", browsedAhead, TODAY);
      expect(ids(plan.items)).toEqual(
        Array.from({ length: dayCount }, (_, d) => `w12d${d}`),
      );
      expect(plan.todayUnknown).toBe(false);
    });

    it("browsing BACK yields nothing for 'Today' rather than that week's column", () => {
      // Horizon through week 9 — today's lessons are outside the set being
      // triaged, so nothing of today's is there to keep. The pre-fix code
      // answered w9d2: a lesson from three weeks ago, labelled "Today".
      const browsedBack = horizon(dayCount, 9);
      const today = planScope("today", browsedBack, TODAY);
      const everything = planScope("everything", browsedBack, TODAY);
      // Absence + positive control in one evaluation: the empty "Today" is
      // only evidence because the same item set is demonstrably non-empty.
      expect([today.items.length, everything.items.length]).toEqual([
        0,
        5 * dayCount,
      ]);
      expect(ids(today.items)).not.toContain(`w9d2`);
    });

    it("browsing BACK yields nothing for 'This week' rather than that week's rows", () => {
      const browsedBack = horizon(dayCount, 9);
      const week = planScope("week", browsedBack, TODAY);
      const everything = planScope("everything", browsedBack, TODAY);
      expect([week.items.length, everything.items.length]).toEqual([
        0,
        5 * dayCount,
      ]);
    });

    it("reports todayUnknown when the year has no place for today — and the same call with an anchor does not", () => {
      const items = horizon(dayCount, 12);
      // `week: null` is the live state for a school whose year starts in
      // August: `currentWeekBasis` is a CLAMP, not a derivation.
      const unanchored = planScope("week", items, { week: null, day: 2 });
      const anchored = planScope("week", items, TODAY);
      expect([
        unanchored.items.length,
        unanchored.todayUnknown,
        anchored.items.length,
        anchored.todayUnknown,
      ]).toEqual([0, true, dayCount, false]);
    });

    it("does NOT report todayUnknown on a non-school day — that is a real answer", () => {
      // Nothing was due today because today is not a teaching day. The modal
      // may honestly say "all caught up"; it may not say "we don't know".
      const plan = planScope("today", horizon(dayCount, 12), {
        week: 12,
        day: null,
      });
      expect([plan.items.length, plan.todayUnknown]).toEqual([0, false]);
    });

    it("leaves the clock-independent scopes alone whatever the anchor says", () => {
      const items = horizon(dayCount, 12);
      const blind: ScopeToday = { week: null, day: null };
      for (const scope of ["everything", "unit", "subject"] as const) {
        const plan = planScope(scope, items, blind);
        expect([scope, plan.items.length, plan.todayUnknown]).toEqual([
          scope,
          5 * dayCount,
          false,
        ]);
      }
    });
  },
);

// ── planScope — mode / grouping ─────────────────────────────────────────────

describe("planScope", () => {
  const all = [
    item({ lessonId: "a", week: 11, day: 0 }),
    item({ lessonId: "b", week: 11, day: 2 }),
    item({ lessonId: "c", week: 9, day: 1 }),
  ];
  const today: ScopeToday = { week: 11, day: 2 };

  it("everything → all items, grouped by subject", () => {
    const plan = planScope("everything", all, today);
    expect(plan.mode).toBe("lessons");
    expect(plan.groupBy).toBe("subject");
    expect(plan.items).toHaveLength(3);
  });

  it("today → only today's column, grouped by subject", () => {
    const plan = planScope("today", all, today);
    expect(plan.mode).toBe("lessons");
    expect(ids(plan.items)).toEqual(["b"]);
  });

  it("week → today's week, grouped by subject", () => {
    const plan = planScope("week", all, today);
    expect(ids(plan.items)).toEqual(["a", "b"]);
  });

  it("unit → all items, grouped by unit", () => {
    const plan = planScope("unit", all, today);
    expect(plan.groupBy).toBe("unit");
    expect(plan.items).toHaveLength(3);
  });

  it("subject → all items, grouped by subject", () => {
    const plan = planScope("subject", all, today);
    expect(plan.groupBy).toBe("subject");
    expect(plan.items).toHaveLength(3);
  });

  it("standards → gap mode, no items", () => {
    const plan = planScope("standards", all, today);
    expect(plan.mode).toBe("gaps");
    expect(plan.items).toEqual([]);
    // Gap mode never consults the clock, so an empty gap list is a real
    // "no gaps" and must not be excused as a missing anchor.
    expect(plan.todayUnknown).toBe(false);
  });

  it("returns a fresh array (never aliases the input)", () => {
    const plan = planScope("everything", all, today);
    expect(plan.items).not.toBe(all);
  });
});

// ── standardGaps ────────────────────────────────────────────────────────────

describe("standardGaps", () => {
  const describe_ = (code: string) => `Desc for ${code}`;

  it("surfaces standards with no taught (done) lesson", () => {
    const lessons = [
      // 5.NBT.1 taught (a done lesson tags it) → NOT a gap.
      lesson({ id: "l1", subject: "math", standards: ["5.NBT.1"], status: "done" }), // prettier-ignore
      // 5.NF.1 tagged only by a not-done lesson → a gap.
      lesson({ id: "l2", subject: "math", standards: ["5.NF.1"], status: "not_done" }), // prettier-ignore
    ];
    const gaps = standardGaps(lessons, 11, describe_, CATALOG);
    expect(gaps.map((g) => g.code)).toEqual(["5.NF.1"]);
    expect(gaps[0].desc).toBe("Desc for 5.NF.1");
    expect(gaps[0].subject).toBe("math");
    expect(gaps[0].unit).toBe("Fractions");
  });

  it("names EACH row's own unit — two gaps in one subject, two different units", () => {
    // The defect this pins: `UNITS[subject].name` resolved per SUBJECT, so
    // both rows below read "Unit 3 · Fractions on a Number Line" and a teacher
    // could not tell which unit either gap belonged to. Two units of the SAME
    // subject is the minimum fixture that can detect it — with one unit the
    // old code passes vacuously.
    const lessons = [
      lesson({ id: "early", unit: "m-u2", week: 8, standards: ["5.NBT.5"] }),
      lesson({ id: "later", unit: "u-m3", week: 11, standards: ["5.NF.1"] }),
    ];
    const gaps = standardGaps(lessons, 11, describe_, CATALOG);
    expect(gaps.map((g) => [g.code, g.unit])).toEqual([
      ["5.NBT.5", "Multiplication & Division"],
      ["5.NF.1", "Fractions"],
    ]);
    // Stated as the property, not just the values: the rows disagree.
    expect(new Set(gaps.map((g) => g.unit)).size).toBe(2);
  });

  it("takes subject AND unit from the same lesson, so the two never disagree", () => {
    // One gap per subject, each in its own subject's unit. A per-subject
    // lookup would still pass here; what it pins is that the row's colour
    // (subject) and its "(unit)" suffix describe the same lesson.
    const lessons = [
      lesson({ id: "m", subject: "math", unit: "u-m3", standards: ["M.1"] }),
      lesson({ id: "e", subject: "explorers", unit: "u-e2", standards: ["E.1"] }), // prettier-ignore
    ];
    const gaps = standardGaps(lessons, 11, describe_, CATALOG);
    expect(gaps.map((g) => [g.code, g.subject, g.unit])).toEqual([
      ["E.1", "explorers", "Ancient Civilizations"],
      ["M.1", "math", "Fractions"],
    ]);
  });

  it("reads the INJECTED catalog, not a fixture — a renamed unit renames the row", () => {
    // The old code answered from lib/mock regardless of the teacher's plan, so
    // it was wrong on the Supabase path too. Rename the unit in the catalog and
    // the row must follow.
    const lessons = [lesson({ id: "a", unit: "u-m3", standards: ["5.NF.1"] })];
    const renamed: Unit[] = [
      { ...CATALOG[1], name: "Fractions on a Number Line — Term 2" },
    ];
    expect(standardGaps(lessons, 11, describe_, renamed)[0].unit).toBe(
      "Fractions on a Number Line — Term 2",
    );
  });

  it("prints no unit when the lesson's unit is missing from the catalog", () => {
    // A unit deleted out from under a lesson, or a catalog still hydrating.
    // Paired with a row that DOES resolve, in one evaluation, so the null is
    // evidence rather than the sound of nothing happening.
    const lessons = [
      lesson({ id: "orphan", unit: "u-gone", standards: ["ORPH.1"] }),
      lesson({ id: "ok", unit: "u-m3", standards: ["OK.1"] }),
    ];
    const gaps = standardGaps(lessons, 11, describe_, CATALOG);
    expect(gaps.map((g) => [g.code, g.subject, g.unit])).toEqual([
      // Subject survives a missing unit — the row keeps its colour.
      ["OK.1", "math", "Fractions"],
      ["ORPH.1", "math", null],
    ]);
  });

  it("returns no unit at all for an empty catalog, without throwing", () => {
    const lessons = [lesson({ id: "a", standards: ["5.NF.1"] })];
    const gaps = standardGaps(lessons, 11, describe_, []);
    expect(gaps.map((g) => [g.code, g.unit])).toEqual([["5.NF.1", null]]);
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
    const gaps = standardGaps(lessons, 11, describe_, CATALOG);
    expect(gaps.map((g) => g.code)).toEqual(["NOW.1"]);
  });

  it("returns no gaps when every standard is taught", () => {
    const lessons = [
      lesson({ id: "l1", standards: ["S1"], status: "done" }),
      lesson({ id: "l2", standards: ["S2"], status: "done" }),
    ];
    expect(standardGaps(lessons, 11, describe_, CATALOG)).toEqual([]);
  });
});
