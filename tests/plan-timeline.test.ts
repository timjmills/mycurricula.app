import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildTimelineAxis,
  buildTimelineLanes,
  dotStateFor,
  forkTierFor,
  isPastLesson,
  monthBands,
  packLevels,
  planningGapCount,
  slotOf,
  stackBySlot,
  todayLineSlot,
  unitSpan,
  unitWeekRange,
  weekSlotRange,
} from "@/lib/plan-timeline";
import type { NowRef } from "@/lib/plan-timeline";
import { buildSchoolDays } from "@/lib/year-calendar";
import type { Holiday } from "@/lib/use-holidays";
import type { Lesson, Subject, Unit } from "@/lib/types";

// Unit tests for the pure layer behind the Plan tab's timeline landing
// (components/hub-v2/timeline). Everything the canvas draws — axis columns,
// month bands, unit band geometry + anchor stacking, per-lesson dot state and
// fork tier — is computed in lib/plan-timeline so it can be pinned without a
// browser.
//
// The handoff prototype has none of this as testable code: its Timeline reads a
// synchronous `PW.build()` and computes geometry inline in JSX
// (`ph-units.jsx:533-641`). Porting it that way would have made every rule
// below unverifiable except by eye.

// ── Fixtures ───────────────────────────────────────────────────────────────

const WEEK_LEN = 5;
const SCHOOL_WEEK = ["Su", "Mo", "Tu", "We", "Th"];
/** Sunday 2 Nov 2025 — the repo's DEFAULT_TERM_START (year-calendar.ts:257). */
const TERM_START = new Date(2025, 10, 2);

function axisOf(weeks: number, holidays: Holiday[] = []) {
  return buildTimelineAxis(
    buildSchoolDays(TERM_START, weeks, SCHOOL_WEEK),
    holidays,
    WEEK_LEN,
  );
}

function subject(id: string, name: string): Subject {
  return { id, name, cls: id, icon: id[0] } as unknown as Subject;
}

function unit(over: Partial<Unit> & Pick<Unit, "id" | "subject">): Unit {
  return {
    name: "Unit",
    weeks: "",
    shade: 2,
    ...over,
  } as unknown as Unit;
}

function lesson(over: Partial<Lesson> & Pick<Lesson, "id">): Lesson {
  return {
    subject: "math",
    unit: "u1",
    title: "Lesson",
    week: 1,
    day: 0,
    status: "not_done",
    archived: false,
    modified: false,
    moved: null,
    objective: "I can add",
    resources: [{ id: "r" }],
    standards: ["5.NBT.1"],
    ...over,
  } as unknown as Lesson;
}

// ── Axis ───────────────────────────────────────────────────────────────────

describe("buildTimelineAxis", () => {
  it("numbers slots flat and speaks the LESSON's 1-based week dialect", () => {
    // year-calendar's SchoolDay.week is 0-based while Lesson.week is 1-based
    // (year-calendar.ts:186-190). Every consumer of the axis compares against a
    // lesson, so the axis converts once, here, rather than at each callsite.
    const axis = axisOf(3);
    expect(axis).toHaveLength(15);
    expect(axis[0]).toMatchObject({ slot: 0, week: 1, day: 0, weekStart: true });
    expect(axis[4]).toMatchObject({ slot: 4, week: 1, day: 4, weekStart: false });
    expect(axis[5]).toMatchObject({ slot: 5, week: 2, day: 0, weekStart: true });
  });

  it("builds ISO dates from the calendar PARTS, never via UTC", () => {
    // `new Date(...).toISOString()` shifts to UTC and renders 2025-11-02 as
    // 2025-11-01 in a negative-offset locale — the footgun documented at
    // components/year/UnitBar.tsx:49-51. Zero-padding is part of the contract:
    // an unpadded "2025-11-2" would never match a stored holiday date.
    const axis = axisOf(1);
    expect(axis[0].iso).toBe("2025-11-02");
    expect(axis[1].iso).toBe("2025-11-03");
  });

  it("tints a holiday column instead of removing it from the numbering", () => {
    // DIVERGENCE FROM THE HANDOFF, deliberate: `pw-data.js:30-37` pushes a NULL
    // slot for a holiday, so its slot numbering skips holidays entirely. This
    // app addresses lessons by week+day, which do not skip, so a holiday here
    // is a tint on a column that still exists. Running both numberings at once
    // is exactly what migration 20260728120000 warns against.
    const axis = axisOf(1, [{ id: "h", date: "2025-11-04", name: "Eid" }]);
    expect(axis[2].holiday).toBe("Eid");
    expect(axis[2].slot).toBe(2);
    expect(axis[3].holiday).toBeNull();
    expect(axis[3].slot).toBe(3);
  });

  it("keeps the first name when two holidays share a date", () => {
    const axis = axisOf(1, [
      { id: "a", date: "2025-11-04", name: "National Day" },
      { id: "b", date: "2025-11-04", name: "Staff PD" },
    ]);
    expect(axis[2].holiday).toBe("National Day");
  });
});

describe("monthBands", () => {
  it("merges consecutive columns of one month and splits at the boundary", () => {
    const bands = monthBands(axisOf(6));
    expect(bands.map((b) => b.label)).toEqual(["November", "December"]);
    expect(bands.map((b) => b.span)).toEqual([21, 9]);
    // Spans must total the axis, or the header row and the day row drift apart.
    expect(bands.reduce((a, b) => a + b.span, 0)).toBe(30);
  });

  it("keys on year AND month so an axis crossing a new year never merges", () => {
    const bands = monthBands(axisOf(12));
    const keys = bands.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("todayLineSlot", () => {
  const base = {
    currentWeek: 3,
    currentWeekBasis: "in-range",
    todayColumn: 2,
    schoolWeekLen: WEEK_LEN,
    axisLength: 30,
  };

  it("places the line at week+day", () => {
    expect(todayLineSlot(base)).toBe(12);
  });

  it("draws NO line when today is not a school day", () => {
    // Friday in a Sun–Thu week. The handoff always has a today column because
    // its axis is built from the school calendar itself; ours is not, and a
    // line parked on an arbitrary column is a claim we cannot back.
    expect(todayLineSlot({ ...base, todayColumn: null })).toBeNull();
  });

  it("draws NO line when currentWeek was CLAMPED rather than derived", () => {
    // `currentWeekBasis` is the honesty flag: anything but "in-range" means the
    // school year has not started, has ended, or is unconfigured, so
    // `currentWeek` is a fallback and not a location (lib/app-state.tsx:228-236).
    for (const basis of ["before-start", "after-end", "unconfigured"]) {
      expect(todayLineSlot({ ...base, currentWeekBasis: basis })).toBeNull();
    }
  });

  it("draws NO line when the slot falls outside the configured year", () => {
    expect(todayLineSlot({ ...base, currentWeek: 40 })).toBeNull();
  });
});

describe("weekSlotRange", () => {
  it("returns the inclusive slot range of a week", () => {
    expect(weekSlotRange(3, WEEK_LEN, 30)).toEqual({
      startSlot: 10,
      endSlot: 14,
    });
  });

  it("clamps a week that runs off the end of the axis", () => {
    expect(weekSlotRange(6, WEEK_LEN, 28)).toEqual({
      startSlot: 25,
      endSlot: 27,
    });
  });

  it("returns null for a week entirely off the axis", () => {
    expect(weekSlotRange(40, WEEK_LEN, 30)).toBeNull();
  });
});

// ── Bands ──────────────────────────────────────────────────────────────────

describe("unitWeekRange", () => {
  it("prefers the numeric columns over the display label", () => {
    // THE POINT OF THE TYPE WIDENING. `units.start_week`/`end_week` have existed
    // since 20260518102823_initial_schema.sql:351-352 and were already SELECTed,
    // but the mapper collapsed them to `weeks: "Wk 9–14"`
    // (supabase-source.ts:979-981) so no consumer could do week arithmetic.
    // Where the two disagree, the numbers are the data and the label is a
    // rendering of it.
    expect(
      unitWeekRange(unit({ id: "u", subject: "math", startWeek: 5, endWeek: 8, weeks: "Wk 1" })),
    ).toEqual({ start: 5, end: 8 });
  });

  it("falls back to parsing the label, which is all the mock source carries", () => {
    expect(unitWeekRange(unit({ id: "u", subject: "math", weeks: "Wk 9–14" }))).toEqual({
      start: 9,
      end: 14,
    });
    expect(unitWeekRange(unit({ id: "u", subject: "math", weeks: "Wk 12" }))).toEqual({
      start: 12,
      end: 12,
    });
  });

  it("treats a numeric start with no end as a one-week unit", () => {
    expect(unitWeekRange(unit({ id: "u", subject: "math", startWeek: 4 }))).toEqual({
      start: 4,
      end: 4,
    });
  });

  it("refuses a fractional week rather than placing a band between two days", () => {
    // §4a Codex finding (Medium), second pass. `Unit` is a domain type, but its
    // week fields are fed from an untyped PostgREST row.
    expect(
      unitWeekRange(unit({ id: "u", subject: "math", startWeek: 1.5, weeks: "" })),
    ).toBeNull();
    expect(
      unitWeekRange(unit({ id: "u", subject: "math", startWeek: 3, endWeek: 5.5 })),
    ).toEqual({ start: 3, end: 3 });
  });

  it("normalises a reversed range rather than dropping the unit", () => {
    // A teacher can save end-before-start. A band that silently vanishes is
    // worse than a band drawn the right way round.
    expect(
      unitWeekRange(unit({ id: "u", subject: "math", startWeek: 8, endWeek: 5 })),
    ).toEqual({ start: 5, end: 8 });
  });

  it("reads only the week token, not any digit in the label", () => {
    // §4a Codex finding (Medium). `weeks` is a DISPLAY string; a bare `\d+`
    // scan reads "Grade 5 · Wk 9–14" as weeks 5–9 and places the band five
    // weeks early with no signal it guessed.
    expect(
      unitWeekRange(unit({ id: "u", subject: "math", weeks: "Grade 5 · Wk 9–14" })),
    ).toEqual({ start: 9, end: 14 });
    expect(
      unitWeekRange(unit({ id: "u", subject: "math", weeks: "Term 2 — Wk 3" })),
    ).toEqual({ start: 3, end: 3 });
  });

  it("refuses a label with no week token rather than guessing from it", () => {
    // Unscheduled is the honest answer; "scheduled in week 5" is not.
    expect(unitWeekRange(unit({ id: "u", subject: "math", weeks: "Grade 5" }))).toBeNull();
    expect(
      unitWeekRange(unit({ id: "u", subject: "math", weeks: "Quarter 2, 6 lessons" })),
    ).toBeNull();
  });

  it("returns null when there is nothing to read", () => {
    expect(unitWeekRange(unit({ id: "u", subject: "math", weeks: "" }))).toBeNull();
    expect(
      unitWeekRange(unit({ id: "u", subject: "math", weeks: "Unscheduled" })),
    ).toBeNull();
    // Week 0 does not exist — a null column arriving as 0 must not place a band.
    expect(
      unitWeekRange(unit({ id: "u", subject: "math", startWeek: 0, weeks: "" })),
    ).toBeNull();
  });
});

describe("unitSpan", () => {
  const u = unit({ id: "u1", subject: "math", startWeek: 3, endWeek: 4 });

  it("spans whole weeks from the declared range", () => {
    expect(unitSpan(u, [], WEEK_LEN, 30)).toEqual({
      startSlot: 10,
      endSlot: 19,
      source: "weeks",
    });
  });

  it("falls back to the days its lessons occupy, and says so", () => {
    // `source` is surfaced in the band's accessible name so the UI never
    // implies a precision the data does not have.
    const bare = unit({ id: "u1", subject: "math", weeks: "" });
    const span = unitSpan(
      bare,
      [lesson({ id: "a", week: 2, day: 1 }), lesson({ id: "b", week: 3, day: 0 })],
      WEEK_LEN,
      30,
    );
    expect(span).toEqual({ startSlot: 6, endSlot: 10, source: "lessons" });
  });

  it("clamps a range that overruns the end of the axis", () => {
    expect(unitSpan(u, [], WEEK_LEN, 12)).toEqual({
      startSlot: 10,
      endSlot: 11,
      source: "weeks",
    });
  });

  it("refuses to relocate a unit whose DECLARED range is off-axis", () => {
    // §4a Codex finding (Medium), sixth pass. Falling back to the lesson dates
    // here drew a unit stored for weeks 90–92 at week 2 — and labelled it "it
    // has no week range set", contradicting both its own schedule and the
    // band's tooltip. It is misconfigured; "unscheduled" says so truthfully.
    const stale = unit({ id: "u1", subject: "math", startWeek: 90, endWeek: 92 });
    expect(
      unitSpan(stale, [lesson({ id: "a", week: 2, day: 0 })], WEEK_LEN, 30),
    ).toBeNull();
  });

  it("returns null — never slot 0 — when the unit has no position at all", () => {
    // Pinning an unplaceable unit to column 0 would read as "scheduled for the
    // first week of the year", which is a fabrication. The lane builder counts
    // these instead.
    expect(unitSpan(unit({ id: "u1", subject: "math", weeks: "" }), [], WEEK_LEN, 30)).toBeNull();
    expect(unitSpan(unit({ id: "u1", subject: "math", startWeek: 90 }), [], WEEK_LEN, 30)).toBeNull();
  });
});

describe("packLevels", () => {
  it("keeps non-overlapping units on one level", () => {
    expect(
      packLevels([
        { startSlot: 0, endSlot: 4 },
        { startSlot: 5, endSlot: 9 },
      ]),
    ).toEqual([0, 0]);
  });

  it("stacks overlapping units instead of overdrawing them", () => {
    expect(
      packLevels([
        { startSlot: 0, endSlot: 9 },
        { startSlot: 5, endSlot: 14 },
      ]),
    ).toEqual([0, 1]);
  });

  it("reuses the lowest freed level rather than growing forever", () => {
    expect(
      packLevels([
        { startSlot: 0, endSlot: 9 },
        { startSlot: 5, endSlot: 14 },
        { startSlot: 10, endSlot: 12 },
      ]),
    ).toEqual([0, 1, 0]);
  });

  it("stacks three-deep when three genuinely overlap", () => {
    expect(
      packLevels([
        { startSlot: 0, endSlot: 20 },
        { startSlot: 1, endSlot: 20 },
        { startSlot: 2, endSlot: 20 },
      ]),
    ).toEqual([0, 1, 2]);
  });
});

// ── Dots ───────────────────────────────────────────────────────────────────

describe("planningGapCount", () => {
  it("counts the same three axes as unitGaps, so the two can never disagree", () => {
    expect(planningGapCount(lesson({ id: "a" }))).toBe(0);
    expect(
      planningGapCount(lesson({ id: "a", objective: "  ", resources: [], standards: [] })),
    ).toBe(3);
  });

  it("honours an injected section-aware resource predicate", () => {
    // Section resources are the canonical half and are not on the Lesson shape
    // (unit-workspace-derive.ts:166-179). Without this a lesson whose resources
    // all live on its sections is wrongly counted as having none.
    const l = lesson({ id: "a", resources: [] });
    expect(planningGapCount(l)).toBe(1);
    expect(planningGapCount(l, () => true)).toBe(0);
  });
});

describe("dotStateFor", () => {
  const now: NowRef = { currentWeek: 5, todayColumn: 2, schoolWeekLen: WEEK_LEN };
  const thin = { objective: "", resources: [], standards: [] };

  it("reads taught from the SHIPPED status, without widening the enum", () => {
    // The design's five dot states are not five status values (audit §C1).
    expect(dotStateFor(lesson({ id: "a", status: "done", ...thin }), now)).toBe("taught");
  });

  it("calls a fully-planned lesson planned", () => {
    expect(dotStateFor(lesson({ id: "a", week: 9 }), now)).toBe("planned");
  });

  it("calls a barely-planned FUTURE lesson needs_work, not missed", () => {
    expect(dotStateFor(lesson({ id: "a", week: 9, ...thin }), now)).toBe("needs_work");
  });

  it("calls a barely-planned PAST lesson missed", () => {
    expect(dotStateFor(lesson({ id: "a", week: 2, ...thin }), now)).toBe("missed");
  });

  it("stops calling it missed once catch-up has handled it", () => {
    // `carried` and `skipped` are explicit catch-up decisions — the shipped
    // equivalent of the prototype's `cuHandled` flag (ph-more.jsx:16), a column
    // that was never migrated because it is derivable.
    for (const status of ["carried", "skipped"] as const) {
      expect(dotStateFor(lesson({ id: "a", week: 2, status, ...thin }), now)).toBe(
        "needs_work",
      );
    }
  });

  it("never calls a lesson parked on a HOLIDAY missed", () => {
    // §4a Codex finding (Medium), sixth pass. The axis labels that column
    // "no school", so nothing could have taught it — sending the teacher to
    // Catch-up for it is a false alarm. It still needs work, and says so.
    const l = lesson({ id: "a", week: 2, ...thin });
    expect(dotStateFor(l, now)).toBe("missed");
    expect(dotStateFor(l, now, { onHoliday: true })).toBe("needs_work");
  });

  it("never invents a missed lesson when today has no known position", () => {
    // THE HONESTY RULE. `now` is null on the server, before mount, and whenever
    // currentWeekBasis is not "in-range". Under-claiming is the safe direction:
    // a lesson wrongly accused of being missed sends a teacher to triage a
    // lesson that is fine.
    expect(dotStateFor(lesson({ id: "a", week: 2, ...thin }), null)).toBe("needs_work");
  });

  it("treats one missing axis as ordinary work in progress", () => {
    expect(dotStateFor(lesson({ id: "a", week: 2, standards: [] }), now)).toBe("planned");
  });
});

describe("isPastLesson", () => {
  const now: NowRef = { currentWeek: 5, todayColumn: 2, schoolWeekLen: WEEK_LEN };

  it("is exclusive of today itself", () => {
    expect(isPastLesson(lesson({ id: "a", week: 5, day: 1 }), now)).toBe(true);
    expect(isPastLesson(lesson({ id: "a", week: 5, day: 2 }), now)).toBe(false);
    expect(isPastLesson(lesson({ id: "a", week: 5, day: 3 }), now)).toBe(false);
  });

  it("claims nothing about THIS week when today has no column", () => {
    // §4a Codex finding (Medium), fifth pass. A null column is not "the week is
    // spent": the school week is a configurable SET, not a contiguous run
    // (CLAUDE.md §1). On a Mon/Wed/Fri week, TUESDAY is also null — and reading
    // that as "week spent" marks Wednesday's and Friday's thin lessons missed
    // before they are taught. The cut falls at the start of the current week.
    const noColumn: NowRef = { ...now, todayColumn: null };
    expect(isPastLesson(lesson({ id: "a", week: 5, day: 4 }), noColumn)).toBe(false);
    expect(isPastLesson(lesson({ id: "a", week: 5, day: 0 }), noColumn)).toBe(false);
    // Earlier weeks are still unambiguously past.
    expect(isPastLesson(lesson({ id: "a", week: 4, day: 4 }), noColumn)).toBe(true);
  });

  it("is false for everything when today has no position", () => {
    expect(isPastLesson(lesson({ id: "a", week: 1 }), null)).toBe(false);
  });
});

describe("forkTierFor", () => {
  it("distinguishes all four tiers", () => {
    // CLAUDE.md §2's three-tier contract, which the handoff's dot carries none
    // of (`ph-units.jsx:609-611`).
    expect(forkTierFor({ modified: false, moved: null })).toBe("master");
    expect(forkTierFor({ modified: true, moved: null })).toBe("modified");
    expect(forkTierFor({ modified: false, moved: "same-week" })).toBe("moved");
    expect(forkTierFor({ modified: true, moved: "across-weeks" })).toBe("both");
  });
});

describe("stackBySlot", () => {
  it("fans same-day lessons apart instead of overdrawing them", () => {
    const out = stackBySlot([
      { lessonId: "a", unitId: "u", title: "A", slot: 5, state: "planned", fork: "master" },
      { lessonId: "b", unitId: "u", title: "B", slot: 5, state: "planned", fork: "master" },
      { lessonId: "c", unitId: "u", title: "C", slot: 7, state: "planned", fork: "master" },
    ]);
    expect(out.map((d) => [d.stackIndex, d.stackSize])).toEqual([
      [0, 2],
      [1, 2],
      [0, 1],
    ]);
  });
});

// ── Lanes ──────────────────────────────────────────────────────────────────

describe("buildTimelineLanes", () => {
  const subjects = [subject("math", "Math"), subject("reading", "Reading")];
  const now: NowRef = { currentWeek: 3, todayColumn: 0, schoolWeekLen: WEEK_LEN };

  it("builds one lane per subject that has anything to show", () => {
    const lanes = buildTimelineLanes({
      subjects,
      units: [unit({ id: "u1", subject: "math", name: "Place Value", startWeek: 1, endWeek: 2 })],
      lessons: [lesson({ id: "l1", week: 1, day: 0 })],
      schoolWeekLen: WEEK_LEN,
      axisLength: 30,
      now,
      todaySlot: 10,
    });
    // Reading has neither a unit nor a dated lesson. An empty row would read as
    // "planned nothing" when the truth is "not part of this plan".
    expect(lanes.map((l) => l.subject)).toEqual(["math"]);
    expect(lanes[0].bands).toHaveLength(1);
    expect(lanes[0].dots).toHaveLength(1);
  });

  it("counts a unit it cannot place instead of dropping it silently", () => {
    const lanes = buildTimelineLanes({
      subjects,
      units: [
        unit({ id: "u1", subject: "math", startWeek: 1, endWeek: 2 }),
        unit({ id: "u2", subject: "math", name: "Someday", weeks: "" }),
      ],
      lessons: [],
      schoolWeekLen: WEEK_LEN,
      axisLength: 30,
      now,
      todaySlot: 10,
    });
    expect(lanes[0].bands).toHaveLength(1);
    expect(lanes[0].undatedUnits).toBe(1);
  });

  it("keeps a lesson whose unit slug resolves to nothing", () => {
    // The prototype only ever walks `unit.lessons` (`ph-units.jsx:602`). Here a
    // lesson can carry an "unfiled" unit slug, and dropping it would show a
    // teacher a year with lessons missing from it.
    const lanes = buildTimelineLanes({
      subjects,
      units: [],
      lessons: [lesson({ id: "l1", unit: "no-such-unit", week: 2, day: 1 })],
      schoolWeekLen: WEEK_LEN,
      axisLength: 30,
      now,
      todaySlot: 10,
    });
    expect(lanes[0].bands).toHaveLength(0);
    expect(lanes[0].dots.map((d) => d.lessonId)).toEqual(["l1"]);
  });

  it("excludes archived lessons and archived units", () => {
    const lanes = buildTimelineLanes({
      subjects,
      units: [unit({ id: "u1", subject: "math", startWeek: 1, endWeek: 2, archived: true })],
      lessons: [lesson({ id: "l1", week: 1, day: 0, archived: true })],
      schoolWeekLen: WEEK_LEN,
      axisLength: 30,
      now,
      todaySlot: 10,
    });
    expect(lanes).toHaveLength(0);
  });

  it("counts a lesson dated outside the configured year rather than clamping it", () => {
    // Clamping would draw it on the last day of the year, which is a date it is
    // not on. It used to be dropped silently; it is now REPORTED, because a
    // teacher whose lesson has fallen off the calendar needs to know it exists.
    const lanes = buildTimelineLanes({
      subjects,
      units: [],
      lessons: [lesson({ id: "far", week: 40, day: 0 })],
      schoolWeekLen: WEEK_LEN,
      axisLength: 30,
      now,
      todaySlot: 10,
    });
    expect(lanes[0].dots).toHaveLength(0);
    expect(lanes[0].unplaceableLessons).toBe(1);
  });

  it("does not confuse two same-slug units in different subjects", () => {
    // A unit slug is unique only WITHIN a subject — the same trap
    // PlannerHub.tsx:59-62 documents for doc tab keys.
    const lanes = buildTimelineLanes({
      subjects,
      units: [
        unit({ id: "u1", subject: "math", name: "Math U1", startWeek: 1, endWeek: 1 }),
        unit({ id: "u1", subject: "reading", name: "Reading U1", startWeek: 1, endWeek: 1 }),
      ],
      lessons: [
        lesson({ id: "m1", subject: "math", unit: "u1", week: 1, day: 0 }),
        lesson({ id: "r1", subject: "reading", unit: "u1", week: 1, day: 1 }),
        lesson({ id: "r2", subject: "reading", unit: "u1", week: 1, day: 2 }),
      ],
      schoolWeekLen: WEEK_LEN,
      axisLength: 30,
      now,
      todaySlot: 10,
    });
    expect(lanes.find((l) => l.subject === "math")?.bands[0].total).toBe(1);
    expect(lanes.find((l) => l.subject === "reading")?.bands[0].total).toBe(2);
  });

  it("opens the RIGHT unit when two subjects share a slug", () => {
    // §4a Codex finding (High), second pass. A unit slug is unique only WITHIN
    // a subject, so the band has to carry its lane's subject through to the
    // open handler — matching on the slug alone opens whichever subject's unit
    // sorts first. Pinned at the model level: every band must be reachable
    // together with the subject that owns it.
    const lanes = buildTimelineLanes({
      subjects,
      units: [
        unit({ id: "u1", subject: "math", name: "Math U1", startWeek: 1, endWeek: 1 }),
        unit({ id: "u1", subject: "reading", name: "Reading U1", startWeek: 1, endWeek: 1 }),
      ],
      lessons: [],
      schoolWeekLen: WEEK_LEN,
      axisLength: 30,
      now,
      todaySlot: 10,
    });
    const pairs = lanes.flatMap((l) => l.bands.map((b) => `${l.subject}:${b.unitId}`));
    expect(pairs).toEqual(["math:u1", "reading:u1"]);
    // The name is the only thing distinguishing them, so it must travel too.
    expect(lanes.find((l) => l.subject === "reading")?.bands[0].name).toBe("Reading U1");
  });

  it("counts a unit's OFF-CALENDAR lessons in its band totals", () => {
    // §4a Codex finding (Medium), second pass. A lesson that lost its column to
    // a school-week change is still a lesson IN the unit. Counting only
    // placeable ones made the band read "1 lesson" the moment the others fell
    // off — understating the unit exactly when a teacher is working out what
    // happened to it. Geometry still uses placeable lessons only.
    const lanes = buildTimelineLanes({
      subjects,
      units: [unit({ id: "u1", subject: "math", startWeek: 1, endWeek: 2 })],
      lessons: [
        lesson({ id: "a", week: 1, day: 0 }),
        lesson({ id: "b", week: 1, day: 4 }), // day 4 does not exist in a 4-day week
        lesson({ id: "c", week: 1, day: 1, status: "done" }),
      ],
      schoolWeekLen: 4,
      axisLength: 40,
      now,
      todaySlot: 10,
    });
    expect(lanes[0].bands[0].total).toBe(3);
    expect(lanes[0].bands[0].taught).toBe(1);
    expect(lanes[0].dots).toHaveLength(2);
    expect(lanes[0].unplaceableLessons).toBe(1);
  });

  it("reports ready/taught per band from the lessons that are actually in it", () => {
    const lanes = buildTimelineLanes({
      subjects,
      units: [unit({ id: "u1", subject: "math", startWeek: 1, endWeek: 2 })],
      lessons: [
        lesson({ id: "a", week: 1, day: 0, status: "done" }),
        lesson({ id: "b", week: 1, day: 1 }),
        lesson({ id: "c", week: 1, day: 2, objective: "", resources: [], standards: [] }),
      ],
      schoolWeekLen: WEEK_LEN,
      axisLength: 30,
      now,
      todaySlot: 10,
    });
    expect(lanes[0].bands[0]).toMatchObject({ total: 3, taught: 1, ready: 2 });
  });

  it("never places a lesson on a weekday the school week no longer has", () => {
    // §4a Codex finding (High). The school week is configurable (CLAUDE.md §1).
    // A lesson saved on day 4 of a Sun–Thu week keeps `day: 4` after the school
    // moves to a 4-day week, and `(week-1)*4 + 4` is day 0 of the FOLLOWING
    // week — so it would render, and be clickable, on a date it is not on, and
    // could be marked missed a week early.
    const lanes = buildTimelineLanes({
      subjects,
      units: [],
      lessons: [
        lesson({ id: "ok", week: 2, day: 3 }),
        lesson({ id: "stale", week: 2, day: 4 }),
      ],
      schoolWeekLen: 4,
      axisLength: 40,
      now,
      todaySlot: 10,
    });
    expect(lanes[0].dots.map((d) => d.lessonId)).toEqual(["ok"]);
    expect(lanes[0].unplaceableLessons).toBe(1);
  });

  it("rejects a negative or non-integer day rather than computing with it", () => {
    const lanes = buildTimelineLanes({
      subjects,
      units: [],
      lessons: [
        lesson({ id: "neg", week: 2, day: -1 }),
        lesson({ id: "frac", week: 2, day: 1.5 }),
        lesson({ id: "wk0", week: 0, day: 0 }),
      ],
      schoolWeekLen: WEEK_LEN,
      axisLength: 30,
      now,
      todaySlot: 10,
    });
    expect(lanes[0].dots).toHaveLength(0);
    expect(lanes[0].unplaceableLessons).toBe(3);
  });

  it("still gives a lane to a subject whose lessons are ALL unplaceable", () => {
    // "N lessons are not on this timeline" is exactly what that teacher needs
    // told; dropping the lane would hide the problem it exists to report.
    const lanes = buildTimelineLanes({
      subjects,
      units: [],
      lessons: [lesson({ id: "stale", week: 2, day: 4 })],
      schoolWeekLen: 4,
      axisLength: 40,
      now,
      todaySlot: 10,
    });
    expect(lanes).toHaveLength(1);
    expect(lanes[0].unplaceableLessons).toBe(1);
    expect(lanes[0].dots).toHaveLength(0);
  });

  it("reports the deepest same-day stack so the lane can make room for it", () => {
    // §4a Codex finding (Medium). Stacked dots each need a 44px target at a
    // coarse pointer; the lane height is driven off this number.
    const lanes = buildTimelineLanes({
      subjects,
      units: [],
      lessons: [
        lesson({ id: "a", week: 1, day: 0 }),
        lesson({ id: "b", week: 1, day: 0 }),
        lesson({ id: "c", week: 1, day: 0 }),
        lesson({ id: "d", week: 2, day: 0 }),
      ],
      schoolWeekLen: WEEK_LEN,
      axisLength: 30,
      now,
      todaySlot: 10,
    });
    expect(lanes[0].maxDotStack).toBe(3);
  });

  it("names the current unit only when today has a position", () => {
    const args = {
      subjects,
      units: [
        unit({ id: "u1", subject: "math", name: "First", startWeek: 1, endWeek: 2 }),
        unit({ id: "u2", subject: "math", name: "Second", startWeek: 3, endWeek: 4 }),
      ],
      lessons: [],
      schoolWeekLen: WEEK_LEN,
      axisLength: 30,
      now,
    };
    // Today in week 3 → the second unit is the one in progress.
    expect(buildTimelineLanes({ ...args, todaySlot: 10 })[0].currentUnitName).toBe("Second");
    // Today unplaceable → "Now:" is omitted, not guessed. The handoff falls back
    // to `units[0]` unconditionally (`ph-units.jsx:474`), which would name the
    // WRONG unit rather than none.
    const blind = buildTimelineLanes({ ...args, todaySlot: null, now: null })[0];
    expect(blind.currentUnitName).toBeNull();
    expect(blind.upcomingUnitName).toBeNull();
  });

  it("says Next, not Now, when today falls in the gap between two units", () => {
    // §4a Codex finding (Medium). The handoff takes the first unit that has not
    // ENDED (`ph-units.jsx:474`), so in a gap it labels the upcoming unit
    // "Now:" — naming a unit the teacher is not teaching.
    const args = {
      subjects,
      units: [
        unit({ id: "u1", subject: "math", name: "First", startWeek: 1, endWeek: 2 }),
        unit({ id: "u2", subject: "math", name: "Second", startWeek: 5, endWeek: 6 }),
      ],
      lessons: [],
      schoolWeekLen: WEEK_LEN,
      axisLength: 40,
      now,
    };
    // Week 3 — after "First" ends (slot 9), before "Second" starts (slot 20).
    const gap = buildTimelineLanes({ ...args, todaySlot: 12 })[0];
    expect(gap.currentUnitName).toBeNull();
    expect(gap.upcomingUnitName).toBe("Second");

    // Inside "First" → Now, and no Next competing with it.
    const inside = buildTimelineLanes({ ...args, todaySlot: 3 })[0];
    expect(inside.currentUnitName).toBe("First");
    expect(inside.upcomingUnitName).toBeNull();

    // Past the last unit → neither. There is nothing true to say.
    const after = buildTimelineLanes({ ...args, todaySlot: 38 })[0];
    expect(after.currentUnitName).toBeNull();
    expect(after.upcomingUnitName).toBeNull();
  });

  it("reports a stacking depth the lane can pad for", () => {
    const lanes = buildTimelineLanes({
      subjects,
      units: [
        unit({ id: "u1", subject: "math", startWeek: 1, endWeek: 3 }),
        unit({ id: "u2", subject: "math", startWeek: 2, endWeek: 4 }),
      ],
      lessons: [],
      schoolWeekLen: WEEK_LEN,
      axisLength: 30,
      now,
      todaySlot: 10,
    });
    expect(lanes[0].levels).toBe(2);
    expect(lanes[0].bands.map((b) => b.level)).toEqual([0, 1]);
  });

  it("returns nothing rather than dividing by a zero-length school week", () => {
    expect(
      buildTimelineLanes({
        subjects,
        units: [unit({ id: "u1", subject: "math", startWeek: 1 })],
        lessons: [lesson({ id: "a" })],
        schoolWeekLen: 0,
        axisLength: 0,
        now: null,
        todaySlot: null,
      }),
    ).toEqual([]);
  });
});

describe("slotOf", () => {
  it("agrees with year-calendar's lessonToFlatIndex", () => {
    expect(slotOf(1, 0, WEEK_LEN)).toBe(0);
    expect(slotOf(3, 2, WEEK_LEN)).toBe(12);
  });
});

// ── The mapper widening (source-text, per the repo's precedent) ─────────────

describe("the Supabase unit mapper carries the week NUMBERS", () => {
  // `mapUnitRow` is not exported, so this follows the pattern
  // tests/track-b-workspace-fields.test.ts uses for the same seam: assert
  // against the source text. Without this the columns are SELECTed
  // (supabase-source.ts:615) and then thrown away by the mapper, and the
  // timeline silently falls back to re-parsing the display label for every
  // Supabase-backed unit.
  const SOURCE = readFileSync(
    join(__dirname, "..", "lib", "planner", "supabase-source.ts"),
    "utf8",
  );

  it("maps start_week / end_week onto the domain Unit", () => {
    expect(SOURCE).toContain("startWeek: finiteWeek(row.start_week)");
    expect(SOURCE).toContain("endWeek: finiteWeek(row.end_week)");
  });

  it("guards them, so a null column can never become week 0", () => {
    expect(SOURCE).toMatch(/function finiteWeek\([\s\S]*?value > 0/);
  });
});
