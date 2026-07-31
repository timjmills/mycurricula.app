import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { deriveCatchupItems } from "@/lib/catchup-data";
import type { CatchupToday } from "@/lib/catchup-data";
import { CatchUpRowMeta } from "@/components/catchup-v2/CatchUpModal";
import { orderedWeekdaysFrom } from "@/lib/week-order";
import type { Weekday } from "@/lib/use-school-week";
import type { Lesson, Unit } from "@/lib/types";

// `daysLate` is measured against TODAY — not against the end of a week.
//
// WHAT WAS WRONG. deriveCatchupItems computed lateness as
//
//   max(0, (currentWeek - week) * dayCount + (dayCount - 1 - day))
//
// which never consulted today at all: the second term is "how many days remain
// in the lesson's week AFTER it", i.e. it measured every lesson from the END of
// the week it was scheduled in. On a Mon–Fri school that made a lesson planned
// for TODAY read "3 days late" when today is Tuesday, and a lesson planned for
// THURSDAY of this week — which has not happened yet — read "2 days late".
// Catch-Up is the triage screen a teacher decides what to re-teach from, and
// the row prints the number verbatim ("N days late", CatchUpRowMeta), so the
// screen was making a definite, false claim about work that was not yet due.
//
// WHAT IS RIGHT. Lateness is the number of INSTRUCTIONAL days between the
// lesson's slot and today's slot, both expressed in the CONFIGURED school week:
//
//   max(0, (today.week - week) * dayCount + (today.day - day))
//
// Clamped at 0, so a lesson due today or later is simply "not late" and the row
// prints no lateness chip at all.
//
// WHY `today` IS NULLABLE, AND WHY null MEANS "SAY NOTHING". `today` comes from
// `useAppState().currentWeek` + `todayColumnIndex(new Date(), days)`, and it is
// genuinely absent in real states: before/after the configured academic year
// `currentWeekBasis` is a CLAMP rather than a derivation (lib/now-anchor), and
// on a non-school day today has no column in the school week. The honest
// rendering there is no number, not a confident one — so `daysLate` is
// `number | null` and the chip disappears. Every absence assertion below is
// paired with the same lessons under a resolved `today`, so a derivation that
// returned null for everything could not pass.
//
// THE CASE TABLE, not one fixture. The naive fix hard-codes five days per week
// (CLAUDE.md §1 forbids assuming the weekday set OR the count), so every case
// runs against a five-day AND a three-day school, and the same (week, day) pair
// deliberately yields different answers in each.

const MON_FRI: Weekday[] = ["mon", "tue", "wed", "thu", "fri"];
/** A three-day school — CLAUDE.md §1 names this case. Only the day COUNT
 *  changing can separate a real fix from a relabelled 5-day assumption. */
const MON_WED: Weekday[] = ["mon", "tue", "wed"];

const UNIT: Unit = {
  id: "u-alpha",
  subject: "math",
  name: "Unit 7 · Volume",
  weeks: "Wk 20–24",
  shade: 1,
} as unknown as Unit;

function lesson(id: string, week: number, day: number): Lesson {
  return {
    id,
    subject: "math",
    unit: "u-alpha",
    title: `L${id}`,
    preview: "",
    week,
    day,
    status: "not_done",
    archived: false,
    modified: false,
    isPersonal: false,
    standards: [],
    resources: [],
    reasonNotDone: "",
  } as unknown as Lesson;
}

/** Derive one item's `daysLate`. `viewedWeek` is the eligibility horizon the
 *  modal passes (its focused week); `today` is the lateness anchor. They are
 *  deliberately different numbers here so a fix cannot pass by conflating
 *  them. */
function lateness(
  week: number,
  day: number,
  days: Weekday[],
  today: CatchupToday | null,
  viewedWeek = 14,
): number | null {
  const [item] = deriveCatchupItems([lesson("l1", week, day)], {
    currentWeek: viewedWeek,
    schoolWeek: orderedWeekdaysFrom(days),
    units: [UNIT],
    today,
  });
  return item.daysLate;
}

/** Tuesday of week 12, in both schools (index 1 of Mon-first). */
const TODAY: CatchupToday = { week: 12, day: 1 };

// week, day, expected, description
type Case = [number, number, number, string];

const FIVE_DAY: Case[] = [
  [12, 1, 0, "today itself"],
  [12, 0, 1, "yesterday (earlier this week)"],
  [12, 2, 0, "tomorrow (later this week) is not late"],
  [12, 4, 0, "the end of this week is not late"],
  [11, 1, 5, "the same weekday last week"],
  [11, 0, 6, "the first day of last week"],
  [11, 4, 2, "the last day of last week"],
  [10, 0, 11, "two weeks back, first day"],
  [13, 0, 0, "next week is not late"],
  [14, 4, 0, "the far end of the viewed range is not late"],
];

const THREE_DAY: Case[] = [
  [12, 1, 0, "today itself"],
  [12, 0, 1, "yesterday (earlier this week)"],
  [12, 2, 0, "tomorrow (later this week) is not late"],
  [11, 1, 3, "the same weekday last week — THREE days, not five"],
  [11, 0, 4, "the first day of last week — four, where a 5-day school says six"],
  [11, 2, 2, "the last day of last week"],
  [10, 0, 7, "two weeks back, first day — seven, where a 5-day school says 11"],
  [13, 0, 0, "next week is not late"],
];

describe("daysLate is measured from today, on a five-day school week", () => {
  for (const [week, day, expected, desc] of FIVE_DAY) {
    it(`wk${week} d${day} → ${expected} (${desc})`, () => {
      expect(lateness(week, day, MON_FRI, TODAY)).toBe(expected);
    });
  }
});

describe("daysLate counts the CONFIGURED week's days, not five", () => {
  for (const [week, day, expected, desc] of THREE_DAY) {
    it(`wk${week} d${day} → ${expected} (${desc})`, () => {
      expect(lateness(week, day, MON_WED, TODAY)).toBe(expected);
    });
  }

  it("gives the same lesson different answers in a 3-day and a 5-day school", () => {
    // The single assertion that cannot pass with any hard-coded count: one
    // (week, day) pair, two school weeks, two different numbers.
    expect(lateness(11, 0, MON_WED, TODAY)).toBe(4);
    expect(lateness(11, 0, MON_FRI, TODAY)).toBe(6);
  });
});

describe("the reported headline case", () => {
  it("a lesson planned for TODAY, on today's own week, is 0 days late", () => {
    // The case as it reaches a teacher: the modal is focused on the current
    // week (horizon === today's week) and the first day of that week is today.
    // The old arithmetic answered 4 here — "4 days late" printed against a
    // lesson the teacher is about to teach this morning.
    expect(lateness(12, 0, MON_FRI, { week: 12, day: 0 }, 12)).toBe(0);
  });
});

describe("today moves the answer", () => {
  it("reports one more day late for each day of the week that passes", () => {
    // Three points on the counter, not one: the same lesson seen from the
    // first, middle and last day of the current week.
    const wk11d0 = (todayDay: number) =>
      lateness(11, 0, MON_FRI, { week: 12, day: todayDay });
    expect(wk11d0(0)).toBe(5);
    expect(wk11d0(2)).toBe(7);
    expect(wk11d0(4)).toBe(9);
  });

  it("counts up as the lesson recedes into past weeks", () => {
    const at = (week: number) => lateness(week, 1, MON_FRI, TODAY);
    expect(at(12)).toBe(0);
    expect(at(11)).toBe(5);
    expect(at(8)).toBe(20);
  });
});

describe("an unresolvable today produces no claim, not a wrong one", () => {
  it("returns null for every item when today is null — and numbers when it is not", () => {
    // Absence assertion + its positive control in one evaluation: the same
    // three lessons, derived twice. If the null arm passed because the
    // derivation was broken outright, the control arm would be null too.
    const lessons = [lesson("a", 10, 0), lesson("b", 11, 2), lesson("c", 12, 0)];
    const opts = {
      currentWeek: 14,
      schoolWeek: orderedWeekdaysFrom(MON_FRI),
      units: [UNIT],
    };
    const unknown = deriveCatchupItems(lessons, { ...opts, today: null });
    const known = deriveCatchupItems(lessons, { ...opts, today: TODAY });

    expect(unknown.map((i) => i.daysLate)).toEqual([null, null, null]);
    expect(known.map((i) => i.daysLate)).toEqual([11, 4, 1]);
  });

  it("returns null when the caller supplies no today at all", () => {
    // A callsite that has not been taught about `today` must lose the number
    // rather than inherit the old end-of-week arithmetic. Fails CLOSED.
    const [item] = deriveCatchupItems([lesson("a", 10, 0)], {
      currentWeek: 14,
      schoolWeek: orderedWeekdaysFrom(MON_FRI),
      units: [UNIT],
    });
    expect(item.daysLate).toBeNull();
  });
});

describe("the row renders exactly what the number claims", () => {
  const item = (daysLate: number | null) => ({
    lessonId: "a",
    subject: "math" as const,
    unit: "Unit 7 · Volume",
    dayLabel: "Tue · Wk 11",
    week: 11,
    day: 1,
    title: "Volume",
    preview: "",
    status: "not_done" as const,
    standards: [],
    resources: 0,
    reasonNotDone: "",
    daysLate,
    isPersonal: false,
    modified: false,
  });
  const render = (daysLate: number | null) =>
    renderToStaticMarkup(createElement(CatchUpRowMeta, { item: item(daysLate) }));

  it("prints no lateness chip when lateness is unknown — but does when it is 5", () => {
    // Paired again: the absence only means something next to the presence.
    expect(render(null)).not.toContain("late");
    expect(render(5)).toContain("5 days late");
  });

  it("prints no lateness chip for a lesson that is due today", () => {
    expect(render(0)).not.toContain("late");
    expect(render(1)).toContain("1 day late");
  });
});
