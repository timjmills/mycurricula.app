// plan-timeline-library.test.ts — the Plan drawer's three bodies.
//
// The drawer sits eighty pixels under the timeline canvas and describes the
// same lessons. Every assertion here is really the same assertion: the drawer
// and the canvas must never disagree about what a lesson IS.

import { describe, expect, it } from "vitest";
import {
  buildLessonLibrary,
  buildNeedsAttention,
  buildUnitLibrary,
  filterLessons,
  groupLessons,
  sortLessons,
  type BuildLibraryInput,
  type LibraryLesson,
} from "@/lib/plan-timeline/library";
import type { Lesson, Subject, Unit } from "@/lib/types";

const LEN = 5;
const AXIS = 200; // 40 weeks

function subject(id: string, name: string): Subject {
  return { id, name, cls: `s-${id}`, color: "#000" } as unknown as Subject;
}

function unit(over: Partial<Unit> & Pick<Unit, "id" | "subject">): Unit {
  return {
    name: `Unit ${over.id}`,
    weeks: "",
    archived: false,
    ...over,
  } as unknown as Unit;
}

function lesson(over: Partial<Lesson> & Pick<Lesson, "id" | "subject">): Lesson {
  return {
    title: `Lesson ${over.id}`,
    unit: "u1",
    week: 1,
    day: 0,
    status: "not_done",
    objective: "I can do the thing",
    resources: [{ id: "r" }],
    standards: ["S1"],
    archived: false,
    modified: false,
    moved: null,
    ...over,
  } as unknown as Lesson;
}

function input(over: Partial<BuildLibraryInput> = {}): BuildLibraryInput {
  return {
    subjects: [subject("math", "Math"), subject("reading", "Reading")],
    units: [],
    lessons: [],
    schoolWeekLen: LEN,
    axisLength: AXIS,
    now: null,
    ...over,
  };
}

describe("buildLessonLibrary", () => {
  it("resolves the unit name PER SUBJECT, never by slug alone", () => {
    // A unit slug is unique only WITHIN a subject. A flat `unitById[slug]`
    // would label Reading's u1 with Math's unit name — the same collision
    // lanes.ts:35-40 and PlannerHub.tsx:59-62 both guard.
    const rows = buildLessonLibrary(
      input({
        units: [
          unit({ id: "u1", subject: "math", name: "Place Value" }),
          unit({ id: "u1", subject: "reading", name: "Folktales" }),
        ],
        lessons: [
          lesson({ id: "l1", subject: "reading", unit: "u1" }),
          lesson({ id: "l2", subject: "math", unit: "u1" }),
        ],
      }),
    );
    expect(rows.find((r) => r.lessonId === "l1")?.unitName).toBe("Folktales");
    expect(rows.find((r) => r.lessonId === "l2")?.unitName).toBe("Place Value");
  });

  it("keeps a lesson whose unit slug resolves to nothing, named as unfiled", () => {
    // The shipped "unfiled" case. The prototype only walks `unit.lessons`
    // (ph-units.jsx:602) and would drop it silently — showing a teacher a year
    // with lessons missing from it.
    const rows = buildLessonLibrary(
      input({ lessons: [lesson({ id: "l1", subject: "math", unit: "ghost" })] }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].unitName).toBeNull();
  });

  it("marks a lesson OFF-CALENDAR when its day is past the school week", () => {
    // The live case: a lesson saved on day 4 of a 5-day week keeps `day: 4`
    // after the school moves to a 4-day week, where the arithmetic lands it on
    // day 0 of the FOLLOWING week. CLAUDE.md §1 makes this a supported
    // transition, not a corrupt row.
    const rows = buildLessonLibrary(
      input({
        schoolWeekLen: 4,
        lessons: [lesson({ id: "l1", subject: "math", week: 3, day: 4 })],
      }),
    );
    expect(rows[0].placeable).toBe(false);
    expect(rows[0].slot).toBeNull();
  });

  it("marks a lesson off-calendar when its week is past the academic year", () => {
    const rows = buildLessonLibrary(
      input({
        axisLength: 50,
        lessons: [lesson({ id: "l1", subject: "math", week: 30, day: 0 })],
      }),
    );
    expect(rows[0].placeable).toBe(false);
  });

  it("never calls an OFF-CALENDAR lesson missed", () => {
    // It has no slot, so "is it in the past" is unanswerable — and a lesson
    // wrongly accused of being missed sends a teacher to triage a lesson that
    // is fine (the direction dots.ts:NowRef argues for throughout).
    const rows = buildLessonLibrary(
      input({
        schoolWeekLen: 4,
        now: { currentWeek: 20, todayColumn: 0, schoolWeekLen: 4 },
        lessons: [
          lesson({
            id: "l1",
            subject: "math",
            week: 3,
            day: 9,
            objective: "",
            resources: [],
            standards: [],
          }),
        ],
      }),
    );
    expect(rows[0].placeable).toBe(false);
    expect(rows[0].state).not.toBe("missed");
  });

  it("never calls a HOLIDAY lesson missed", () => {
    const rows = buildLessonLibrary(
      input({
        now: { currentWeek: 20, todayColumn: 0, schoolWeekLen: LEN },
        isHolidaySlot: (s) => s === 10,
        lessons: [
          lesson({
            id: "l1",
            subject: "math",
            week: 3,
            day: 0, // slot 10
            objective: "",
            resources: [],
            standards: [],
          }),
        ],
      }),
    );
    expect(rows[0].state).toBe("needs_work");
  });

  it("counts a section-only resource through the injected predicate", () => {
    // Section resources are the canonical half and are not on the Lesson
    // shape; without the predicate a fully-resourced lesson reads as a gap.
    const l = lesson({ id: "l1", subject: "math", resources: [] });
    const withPredicate = buildLessonLibrary(
      input({ lessons: [l], hasResources: () => true }),
    );
    const without = buildLessonLibrary(input({ lessons: [l] }));
    expect(withPredicate[0].gaps).toBe(0);
    expect(without[0].gaps).toBe(1);
  });

  it("excludes archived lessons", () => {
    const rows = buildLessonLibrary(
      input({
        lessons: [
          lesson({ id: "l1", subject: "math" }),
          lesson({ id: "l2", subject: "math", archived: true }),
        ],
      }),
    );
    expect(rows.map((r) => r.lessonId)).toEqual(["l1"]);
  });
});

describe("buildUnitLibrary", () => {
  it("reports lessonsOutside only against a DECLARED week range", () => {
    // Against a lesson-derived range the number is zero by construction, and
    // reporting it would let a unit with no schedule at all read as a clean
    // bill of health.
    const lessons = [
      lesson({ id: "l1", subject: "math", unit: "u1", week: 2 }),
      lesson({ id: "l2", subject: "math", unit: "u1", week: 30 }),
    ];
    const declared = buildUnitLibrary(
      input({
        units: [unit({ id: "u1", subject: "math", startWeek: 1, endWeek: 4 })],
        lessons,
      }),
    );
    expect(declared[0].lessonsOutside).toBe(1);

    const undeclared = buildUnitLibrary(
      input({ units: [unit({ id: "u1", subject: "math" })], lessons }),
    );
    expect(undeclared[0].weekRange).toBeNull();
    expect(undeclared[0].lessonsOutside).toBe(0);
  });

  it("counts ready and taught over the unit's own lessons only", () => {
    const rows = buildUnitLibrary(
      input({
        units: [
          unit({ id: "u1", subject: "math" }),
          unit({ id: "u1", subject: "reading" }),
        ],
        lessons: [
          lesson({ id: "l1", subject: "math", unit: "u1", status: "done" }),
          lesson({ id: "l2", subject: "math", unit: "u1", objective: "" }),
          lesson({ id: "l3", subject: "reading", unit: "u1" }),
        ],
      }),
    );
    const math = rows.find((r) => r.subject === "math");
    expect(math).toMatchObject({ total: 2, taught: 1, ready: 1 });
    expect(rows.find((r) => r.subject === "reading")?.total).toBe(1);
  });
});

describe("buildUnitLibrary — off-axis units", () => {
  it("flags a unit whose declared weeks lie past the end of the academic year", () => {
    // NOT prevented at the write seam: a range goes out of range when someone
    // SHORTENS the academic year in Settings, with no write involved. Refusing
    // the write would fix nothing and would make a legitimately-stored unit
    // unwritable after a config change — so it is surfaced instead.
    const rows = buildUnitLibrary(
      input({
        axisLength: 50, // 10 weeks
        units: [unit({ id: "u1", subject: "math", startWeek: 999, endWeek: 1000 })],
      }),
    );
    expect(rows[0].offAxis).toBe(true);
  });

  it("does NOT flag a unit that merely overhangs the end", () => {
    // Weeks 8–14 in a 10-week year still has seven days of itself on screen.
    // Flagging it would put a unit a teacher can see in a list of units they
    // cannot.
    const rows = buildUnitLibrary(
      input({
        axisLength: 50,
        units: [unit({ id: "u1", subject: "math", startWeek: 8, endWeek: 14 })],
      }),
    );
    expect(rows[0].offAxis).toBe(false);
  });

  it("reports it as ONE finding, not as a lessons-outside pile-up", () => {
    // "12 lessons dated outside Wk 999–1000" is true, useless, and buries the
    // actual problem.
    const rows = buildUnitLibrary(
      input({
        axisLength: 50,
        units: [unit({ id: "u1", subject: "math", startWeek: 999, endWeek: 1000 })],
        lessons: [lesson({ id: "l1", subject: "math", unit: "u1", week: 2 })],
      }),
    );
    const items = buildNeedsAttention([], rows);
    expect(items.map((i) => i.kind)).toEqual(["off_axis_unit"]);
    expect(items[0].detail).toContain("outside this academic year");
  });
});

describe("buildNeedsAttention", () => {
  const thin = { objective: "", resources: [], standards: [] };

  it("lists a missed lesson ONCE, not also as thin", () => {
    // A missed lesson is thin by construction — that is how dotStateFor
    // decided it was missed. Listing it twice inflates the count a teacher is
    // working through.
    const rows = buildLessonLibrary(
      input({
        now: { currentWeek: 10, todayColumn: 0, schoolWeekLen: LEN },
        lessons: [lesson({ id: "l1", subject: "math", week: 2, ...thin })],
      }),
    );
    const items = buildNeedsAttention(rows, []);
    expect(items.filter((i) => i.target.id === "l1")).toHaveLength(1);
    expect(items[0].kind).toBe("missed");
  });

  it("puts missed lessons before thin ones before configuration problems", () => {
    const rows = buildLessonLibrary(
      input({
        now: { currentWeek: 10, todayColumn: 0, schoolWeekLen: LEN },
        lessons: [
          lesson({ id: "past", subject: "math", week: 2, ...thin }),
          lesson({ id: "future", subject: "math", week: 20, ...thin }),
        ],
      }),
    );
    const items = buildNeedsAttention(rows, [
      {
        unitId: "u9",
        name: "Unscheduled",
        subject: "math",
        subjectName: "Math",
        weekRange: null,
        total: 0,
        ready: 0,
        taught: 0,
        lessonsOutside: 0,
        offAxis: false,
      },
    ]);
    expect(items.map((i) => i.kind)).toEqual([
      "missed",
      "thin",
      "unscheduled_unit",
    ]);
  });

  it("reports an off-calendar lesson even when it is otherwise fine", () => {
    // A fully-planned lesson that has fallen off the calendar is invisible on
    // the timeline and reads as "not planned" everywhere else. It is the one
    // problem a teacher cannot discover by looking.
    const rows = buildLessonLibrary(
      input({
        schoolWeekLen: 4,
        lessons: [lesson({ id: "l1", subject: "math", week: 2, day: 6 })],
      }),
    );
    const items = buildNeedsAttention(rows, []);
    expect(items.map((i) => i.kind)).toEqual(["off_calendar"]);
  });

  it("is empty for a healthy plan", () => {
    // The assertion that stops the panel becoming decorative — a list that
    // always has something in it teaches a teacher to ignore it.
    const rows = buildLessonLibrary(
      input({
        lessons: [lesson({ id: "l1", subject: "math", week: 2 })],
      }),
    );
    const units = buildUnitLibrary(
      input({
        units: [unit({ id: "u1", subject: "math", startWeek: 1, endWeek: 4 })],
        lessons: [lesson({ id: "l1", subject: "math", unit: "u1", week: 2 })],
      }),
    );
    expect(buildNeedsAttention(rows, units)).toEqual([]);
  });

  it("is empty for a lesson missing exactly ONE of the three", () => {
    // The threshold this list is built on: `isThin` is `planningGapCount >= 2`
    // (dots.ts:47-52) — one missing axis is an ordinary work-in-progress
    // lesson. Pinned because the DRAWER'S EMPTY STATE makes a claim about it:
    // it used to read "every lesson has an objective, a resource and a
    // standard", which an empty list has never meant. If the threshold ever
    // moves to >= 1, this test fails and the copy has to move with it
    // (TimelineDrawer.tsx, the `attention.length === 0` branch).
    for (const gap of [
      { objective: "" },
      { resources: [] },
      { standards: [] },
    ]) {
      const rows = buildLessonLibrary(
        input({
          lessons: [lesson({ id: "l1", subject: "math", week: 2, ...gap })],
        }),
      );
      expect(
        buildNeedsAttention(rows, []),
        `one gap: ${Object.keys(gap)[0]}`,
      ).toEqual([]);
    }
  });
});

describe("filterLessons", () => {
  const rows = buildLessonLibrary(
    input({
      now: { currentWeek: 10, todayColumn: 0, schoolWeekLen: LEN },
      lessons: [
        lesson({ id: "ready-taught", subject: "math", week: 2, status: "done" }),
        lesson({ id: "ready", subject: "math", week: 20 }),
        lesson({
          id: "thin",
          subject: "math",
          week: 20,
          objective: "",
          resources: [],
        }),
        lesson({
          id: "missed",
          subject: "math",
          week: 2,
          objective: "",
          resources: [],
        }),
      ],
    }),
  );

  it("counts a TAUGHT lesson as ready when it is fully planned", () => {
    // "Ready" is `gaps === 0`, not `state === "planned"`. Filtering on state
    // would tell a teacher checking their preparation that work they already
    // did and delivered does not exist.
    expect(ids(filterLessons(rows, "ready"))).toContain("ready-taught");
    expect(ids(filterLessons(rows, "ready"))).toContain("ready");
  });

  it("folds missed into needs-work", () => {
    expect(ids(filterLessons(rows, "needs_work")).sort()).toEqual([
      "missed",
      "thin",
    ]);
  });

  it("makes taught and not-yet a partition of every row", () => {
    const taught = ids(filterLessons(rows, "taught"));
    const notYet = ids(filterLessons(rows, "not_yet"));
    expect([...taught, ...notYet].sort()).toEqual(ids(rows).sort());
    expect(taught.filter((id) => notYet.includes(id))).toEqual([]);
  });

  it("never mutates its input", () => {
    const before = ids(rows);
    filterLessons(rows, "ready");
    expect(ids(rows)).toEqual(before);
  });
});

describe("sortLessons", () => {
  it("sinks off-calendar lessons to the END of a schedule sort", () => {
    // Sorting a null slot as 0 would put the rows a teacher can do least about
    // at the top of every schedule-ordered list.
    const rows = buildLessonLibrary(
      input({
        schoolWeekLen: 4,
        lessons: [
          lesson({ id: "off", subject: "math", week: 2, day: 7 }),
          lesson({ id: "late", subject: "math", week: 20, day: 0 }),
          lesson({ id: "early", subject: "math", week: 1, day: 0 }),
        ],
      }),
    );
    expect(ids(sortLessons(rows, "schedule"))).toEqual([
      "early",
      "late",
      "off",
    ]);
  });

  it("orders a status sort worst-first", () => {
    const rows = buildLessonLibrary(
      input({
        now: { currentWeek: 10, todayColumn: 0, schoolWeekLen: LEN },
        lessons: [
          lesson({ id: "taught", subject: "math", week: 1, status: "done" }),
          lesson({ id: "ok", subject: "math", week: 20 }),
          lesson({
            id: "missed",
            subject: "math",
            week: 2,
            objective: "",
            resources: [],
          }),
        ],
      }),
    );
    expect(ids(sortLessons(rows, "status"))).toEqual([
      "missed",
      "ok",
      "taught",
    ]);
  });

  it("never mutates its input", () => {
    const rows = buildLessonLibrary(
      input({
        lessons: [
          lesson({ id: "b", subject: "math", week: 5 }),
          lesson({ id: "a", subject: "math", week: 1 }),
        ],
      }),
    );
    const before = ids(rows);
    sortLessons(rows, "title");
    expect(ids(rows)).toEqual(before);
  });
});

describe("groupLessons", () => {
  it("keeps group order following the row order, not the alphabet", () => {
    // A schedule-sorted list whose GROUPS jumped to alphabetical would read as
    // unsorted.
    const rows = buildLessonLibrary(
      input({
        lessons: [
          lesson({ id: "l1", subject: "reading", week: 1 }),
          lesson({ id: "l2", subject: "math", week: 2 }),
        ],
      }),
    );
    expect(
      groupLessons(sortLessons(rows, "schedule"), "subject").map((g) => g.label),
    ).toEqual(["Reading", "Math"]);
  });

  it("names an unresolvable unit rather than filing it under its own slug", () => {
    const rows = buildLessonLibrary(
      input({ lessons: [lesson({ id: "l1", subject: "math", unit: "ghost" })] }),
    );
    expect(groupLessons(rows, "unit")[0].label).toBe("Math · Unfiled");
  });

  it("separates two same-slug units across subjects", () => {
    const rows = buildLessonLibrary(
      input({
        units: [
          unit({ id: "u1", subject: "math", name: "Place Value" }),
          unit({ id: "u1", subject: "reading", name: "Folktales" }),
        ],
        lessons: [
          lesson({ id: "l1", subject: "math", unit: "u1" }),
          lesson({ id: "l2", subject: "reading", unit: "u1" }),
        ],
      }),
    );
    expect(groupLessons(rows, "unit")).toHaveLength(2);
  });
});

function ids(rows: readonly LibraryLesson[]): string[] {
  return rows.map((r) => r.lessonId);
}
