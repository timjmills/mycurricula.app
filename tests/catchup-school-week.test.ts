import { describe, it, expect } from "vitest";

import { deriveCatchupItems } from "@/lib/catchup-data";
import { orderedWeekdaysFrom } from "@/lib/week-order";
import type { Weekday } from "@/lib/use-school-week";
import type { Lesson, Unit } from "@/lib/types";

// Regression tests for lib/catchup-data's hard-coded school week and its
// hard-coded unit catalog — two leaks of the same class in one derivation.
//
// BEFORE: `deriveCatchupItems` read three things it should have been given.
//
//   const DAYS_PER_WEEK = 5;                       // the beta school's week
//   dayLabel: WEEK_DAYS_SHORT[day]                 // ["Sun","Mon",…"Thu"]
//   unit:     UNITS[lesson.subject].name           // ONE unit per subject
//
// CLAUDE.md §1 forbids hard-coding the school week: it is chosen at setup and
// every calendar surface derives its days from that configuration. The comment
// on `DAYS_PER_WEEK` conceded the rule and hard-coded it anyway.
//
// WHAT WAS ACTUALLY BROKEN, and it is not what the const's comment implies:
//
//   • `dayLabel` IS RENDERED — components/catchup/CatchupRow.tsx:194 and
//     components/hub-v2/browse/CatchUpBrowse.tsx:125. A lesson's `day` is a
//     0-based index INTO the configured week (0 = the school's FIRST day,
//     whatever weekday that is — see lib/week-order), so indexing a Sun-first
//     fixture array mislabels every column of any school that does not start on
//     Sunday. A Mon–Fri school read "Sun · Wk 11" against a Monday lesson, and
//     "Thu" against a Friday one. Visible, wrong, and reachable with no flag.
//   • `unit` IS RENDERED in three places, and came from the fixture map of one
//     active unit PER SUBJECT — so `lesson.unit` was discarded outright and
//     every Math row claimed "Unit 3 · Fractions on a Number Line" whatever
//     unit its lesson was really in. Wrong on the mock path too, not only over
//     Supabase.
//   • `daysLate` is computed but rendered NOWHERE today, so its 5-day
//     arithmetic was silently wrong. It is asserted here so that whenever
//     something does surface it, it is already right.
//
// The options are REQUIRED rather than defaulted-to-Sun–Thu on purpose: a
// default would let the next callsite reintroduce the bug in silence, which is
// how the original const survived this long. tsc is the check that every
// callsite was migrated.

const MON_FRI: Weekday[] = ["mon", "tue", "wed", "thu", "fri"];
const SUN_THU: Weekday[] = ["sun", "mon", "tue", "wed", "thu"];
/** A three-day school. CLAUDE.md §1 names this case explicitly, and it is the
 *  one that separates a real fix from a relabelled 5-day assumption: only the
 *  day COUNT changing can move `daysLate`. */
const MON_WED: Weekday[] = ["mon", "tue", "wed"];

const UNIT_A: Unit = {
  id: "u-alpha",
  subject: "math",
  name: "Unit 7 · Volume",
  weeks: "Wk 20–24",
  shade: 1,
} as unknown as Unit;

const UNIT_B: Unit = {
  id: "u-beta",
  subject: "math",
  name: "Unit 9 · Coordinate Plane",
  weeks: "Wk 25–28",
  shade: 2,
} as unknown as Unit;

function lesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: "l1",
    subject: "math",
    unit: "u-alpha",
    title: "Volume of rectangular prisms",
    preview: "",
    week: 10,
    day: 0,
    status: "not_done",
    archived: false,
    modified: false,
    isPersonal: false,
    standards: [],
    resources: [],
    reasonNotDone: "",
    ...over,
  } as unknown as Lesson;
}

function derive(lessons: Lesson[], days: Weekday[], currentWeek = 12) {
  return deriveCatchupItems(lessons, {
    currentWeek,
    schoolWeek: orderedWeekdaysFrom(days),
    units: [UNIT_A, UNIT_B],
  });
}

describe("the day label follows the configured school week", () => {
  it("labels day 0 as the school's FIRST day, not Sunday", () => {
    // The headline case. Same lesson, same `day: 0`, two schools.
    const [sunThu] = derive([lesson({ day: 0 })], SUN_THU);
    const [monFri] = derive([lesson({ day: 0 })], MON_FRI);
    expect(sunThu.dayLabel).toBe("Sun · Wk 10");
    expect(monFri.dayLabel).toBe("Mon · Wk 10");
  });

  it("labels the last day of a Mon–Fri week as Friday", () => {
    // `day: 4` under the old Sun-first fixture array read "Thu" — the label was
    // off by one weekday for the whole school, every row.
    const [item] = derive([lesson({ day: 4 })], MON_FRI);
    expect(item.dayLabel).toBe("Fri · Wk 10");
  });

  it("labels a three-day week without inventing days it does not have", () => {
    const [item] = derive([lesson({ day: 2 })], MON_WED);
    expect(item.dayLabel).toBe("Wed · Wk 10");
  });

  it("falls back rather than mislabelling a day past the end of the week", () => {
    // A real state, not a defensive fiction: a school drops a day and lessons
    // already scheduled on it keep their old `day` index (the same case
    // lib/plan-timeline/lanes.ts calls out as live). Showing SOME weekday would
    // be a confident lie about when the lesson was.
    const [item] = derive([lesson({ day: 4 })], MON_WED);
    expect(item.dayLabel).toBe("— · Wk 10");
  });
});

describe("daysLate counts the configured week's days", () => {
  it("counts five days per elapsed week for a five-day school", () => {
    // Week 10 day 0, viewed from week 12: two whole weeks elapsed (10 days)
    // plus the 4 days remaining in week 10 after day 0.
    const [item] = derive([lesson({ week: 10, day: 0 })], MON_FRI, 12);
    expect(item.daysLate).toBe(14);
  });

  it("counts THREE days per elapsed week for a three-day school", () => {
    // The assertion the old code could not satisfy at any label: 2 elapsed
    // weeks × 3 days + 2 days left in week 10 after day 0 = 8. The old constant
    // returned 14 here — it reported a three-day school as six days later than
    // it was, and would have done so on whatever surface first rendered it.
    const [item] = derive([lesson({ week: 10, day: 0 })], MON_WED, 12);
    expect(item.daysLate).toBe(8);
  });

  it("never reports negative lateness", () => {
    const [item] = derive([lesson({ week: 12, day: 4 })], MON_FRI, 12);
    expect(item.daysLate).toBe(0);
  });
});

describe("the unit name comes from the lesson's own unit", () => {
  it("names the unit the lesson is actually in", () => {
    const [item] = derive([lesson({ unit: "u-beta" })], MON_FRI);
    expect(item.unit).toBe("Unit 9 · Coordinate Plane");
  });

  it("distinguishes two lessons in different units of the same subject", () => {
    // The precise shape of the old bug: keyed by SUBJECT, both rows collapsed
    // onto one unit name. Nothing about a single-lesson assertion catches that.
    const items = derive(
      [
        lesson({ id: "l1", unit: "u-alpha" }),
        lesson({ id: "l2", unit: "u-beta" }),
      ],
      MON_FRI,
    );
    expect(items.map((i) => i.unit)).toEqual([
      "Unit 7 · Volume",
      "Unit 9 · Coordinate Plane",
    ]);
  });

  it("renders nothing rather than another unit's name when the unit is unknown", () => {
    // A unit deleted out from under a lesson, or a catalog still hydrating.
    // Every consumer treats the unit as optional (`shortUnit("")`,
    // `filter(Boolean)`, a ternary), so "" disappears; a substituted name would
    // be a fabrication.
    const [item] = derive([lesson({ unit: "u-gone" })], MON_FRI);
    expect(item.unit).toBe("");
  });
});

describe("the rest of the projection is unchanged", () => {
  // Anti-overshoot: the eligibility filter and the action overlay are not part
  // of this fix and must not have moved.
  it("still drops archived, future, and covered lessons", () => {
    const items = derive(
      [
        lesson({ id: "keep", week: 11 }),
        lesson({ id: "archived", week: 11, archived: true }),
        lesson({ id: "future", week: 13 }),
        lesson({ id: "done", week: 11, status: "done" }),
      ],
      MON_FRI,
      12,
    );
    expect(items.map((i) => i.lessonId)).toEqual(["keep"]);
  });

  it("still carries the lesson's standards, resources and note through", () => {
    const [item] = derive(
      [
        lesson({
          standards: ["5.MD.C.3"],
          resources: [{ id: "r1" }, { id: "r2" }] as unknown as Lesson["resources"], // prettier-ignore
          reasonNotDone: "Fire drill",
        }),
      ],
      MON_FRI,
    );
    expect(item.standards).toEqual(["5.MD.C.3"]);
    expect(item.resources).toBe(2);
    expect(item.reasonNotDone).toBe("Fire drill");
  });
});
