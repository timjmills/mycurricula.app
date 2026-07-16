// tests/wall-scope.test.ts — the pure Resource Wall core (Wave 9a).
//
// The vitest project is `environment: "node"` with no jsdom/RTL, so component
// tests are impossible and lib/wall-scope.ts carries ALL of the wall's real
// logic. These tests therefore ARE the wall's correctness gate, and they lean
// hardest on the three rules the module exists to enforce:
//
//   1. unit ids are unique only WITHIN a subject (never `unitById[slug]`),
//   2. today/this-week are rotation-aware (never a hard-coded weekday slice),
//   3. grade-scoping is never assumed.

import { describe, expect, it } from "vitest";
import {
  WALL_PRESETS,
  WALL_PRESET_LABEL,
  makeNoteItem,
  findUnit,
  resolveWall,
  scopeLessons,
  unitKey,
  wallItemCount,
  wallTypeOf,
  type WallScopeInput,
} from "@/lib/wall-scope";
import type { Lesson, LessonResource, SubjectId, Unit } from "@/lib/types";

// ── Fixtures ────────────────────────────────────────────────────────────────

function res(
  label: string,
  type: LessonResource["type"] = "link",
): LessonResource {
  return { type, label };
}

/** A lesson with only the fields wall-scope reads; the rest satisfy the type. */
function lesson(over: {
  id: string;
  subject: SubjectId;
  unit: string;
  week: number;
  day: number;
  title?: string;
  time?: string;
  archived?: boolean;
  resources?: LessonResource[];
}): Lesson {
  return {
    id: over.id,
    subject: over.subject,
    unit: over.unit,
    title: over.title ?? `Lesson ${over.id}`,
    time: over.time,
    objective: "",
    preview: "",
    directions: "",
    notes: "",
    resources: over.resources ?? [res(`${over.id}-r0`)],
    standards: [],
    week: over.week,
    day: over.day,
    isPersonal: false,
    pendingMaster: false,
    reasonNotDone: "",
    modified: false,
    moved: null,
    status: "not_done",
    commentCount: 0,
    unreadComments: 0,
    tasks: [],
    archived: over.archived,
  };
}

/**
 * THE COLLISION FIXTURE (rule 1). Math and Reading BOTH carry a unit whose id
 * is "u-1" — legitimate, because unit ids are namespaced by subject. Any
 * resolution keyed on the bare id merges these two different units.
 */
const UNITS_COLLIDING: Unit[] = [
  {
    id: "u-1",
    subject: "math",
    name: "Math · Fractions",
    weeks: "Wk 9–14",
    shade: 2,
  },
  {
    id: "u-1",
    subject: "reading",
    name: "Reading · Realistic Fiction",
    weeks: "Wk 7–12",
    shade: 2,
  },
  {
    id: "u-2",
    subject: "math",
    name: "Math · Decimals",
    weeks: "Wk 15–18",
    shade: 3,
  },
];

/** Default injected resource resolver — the lesson's own array. */
const resourcesFor: WallScopeInput["resourcesFor"] = (l) => l.resources;

function input(
  over: Partial<WallScopeInput> & Pick<WallScopeInput, "scope">,
): WallScopeInput {
  return {
    lessons: [],
    units: UNITS_COLLIDING,
    currentWeek: 12,
    todayCol: 0,
    resourcesFor,
    ...over,
  };
}

// ── Rule 1 — unit ids collide across subjects ───────────────────────────────

describe("rule 1 — unit ids are unique only WITHIN a subject", () => {
  it("findUnit resolves by subject AND id, never the bare id", () => {
    expect(findUnit(UNITS_COLLIDING, "math", "u-1")?.name).toBe(
      "Math · Fractions",
    );
    expect(findUnit(UNITS_COLLIDING, "reading", "u-1")?.name).toBe(
      "Reading · Realistic Fiction",
    );
  });

  it("findUnit returns null when THIS subject has no such unit, even though another subject does", () => {
    // "u-2" exists — but only under math. Asking as reading must not borrow it.
    expect(findUnit(UNITS_COLLIDING, "reading", "u-2")).toBeNull();
  });

  it("unitKey namespaces by subject so colliding ids can never share a key", () => {
    expect(unitKey("math", "u-1")).toBe("unit:math:u-1");
    expect(unitKey("math", "u-1")).not.toBe(unitKey("reading", "u-1"));
  });

  it("Unit View never leaks the same unit id from another subject", () => {
    const lessons = [
      lesson({ id: "m1", subject: "math", unit: "u-1", week: 12, day: 0 }),
      // Same unit id, different subject — MUST NOT appear in math's u-1 wall.
      lesson({ id: "r1", subject: "reading", unit: "u-1", week: 12, day: 0 }),
    ];
    const got = scopeLessons(
      input({
        scope: { preset: "unit", subject: "math", unit: "u-1" },
        lessons,
      }),
    );
    expect(got.map((l) => l.id)).toEqual(["m1"]);
  });

  it("Unit View resolves EMPTY when the unit has no catalog row for the subject", () => {
    // A lesson can carry a unit id whose catalog row was deleted, or that only
    // exists under ANOTHER subject. spelling has NO catalog units at all, yet a
    // lesson is tagged spelling/u-1 (u-1 exists under math + reading). The
    // anchor is unresolvable for spelling → empty wall, never lessons behind a
    // phantom unit (Codex R1 MEDIUM). The cross-subject no-leak is the same
    // assertion: u-1 resolves for math/reading but NOT spelling.
    const lessons = [
      lesson({ id: "s1", subject: "spelling", unit: "u-1", week: 12, day: 0 }),
    ];
    const got = scopeLessons(
      input({
        scope: { preset: "unit", subject: "spelling", unit: "u-1" },
        lessons,
      }),
    );
    expect(got).toEqual([]);
    // And resolveWall paints nothing for that scope.
    expect(
      resolveWall(
        input({
          scope: { preset: "unit", subject: "spelling", unit: "u-1" },
          lessons,
        }),
      ),
    ).toEqual([]);
  });

  it("Subject View titles each unit section from ITS OWN subject's unit row", () => {
    const lessons = [
      lesson({ id: "m1", subject: "math", unit: "u-1", week: 12, day: 0 }),
      lesson({ id: "m2", subject: "math", unit: "u-2", week: 13, day: 1 }),
    ];
    const sections = resolveWall(
      input({ scope: { preset: "subject", subject: "math" }, lessons }),
    );
    // A bare unitById["u-1"] lookup would title this "Reading · Realistic
    // Fiction" whenever reading's row won the map — the bug this asserts away.
    expect(sections.map((s) => s.title)).toEqual([
      "Math · Fractions",
      "Math · Decimals",
    ]);
    expect(sections.map((s) => s.id)).toEqual([
      "unit:math:u-1",
      "unit:math:u-2",
    ]);
  });

  it("two subjects' same-id units never merge into one section", () => {
    // Reading's u-1 wall resolves reading's row — proving the map is per-subject.
    const lessons = [
      lesson({ id: "r1", subject: "reading", unit: "u-1", week: 12, day: 0 }),
    ];
    const sections = resolveWall(
      input({ scope: { preset: "subject", subject: "reading" }, lessons }),
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Reading · Realistic Fiction");
    expect(sections[0].id).toBe("unit:reading:u-1");
  });

  it("falls back to the raw unit id when the subject has no unit row (no cross-subject borrow)", () => {
    const lessons = [
      lesson({ id: "s1", subject: "spelling", unit: "u-1", week: 12, day: 0 }),
    ];
    const sections = resolveWall(
      input({ scope: { preset: "subject", subject: "spelling" }, lessons }),
    );
    // spelling has no u-1 row; math and reading do. Borrowing either is the bug.
    expect(sections[0].title).toBe("u-1");
    expect(sections[0].meta).toBe("");
  });
});

// ── Rule 2 — rotation-aware today / this week ───────────────────────────────

describe("rule 2 — today/this-week are rotation-aware", () => {
  const lessons = [
    lesson({ id: "a", subject: "math", unit: "u-1", week: 12, day: 0 }),
    lesson({ id: "b", subject: "reading", unit: "u-1", week: 12, day: 2 }),
    lesson({ id: "c", subject: "math", unit: "u-1", week: 12, day: 4 }),
    lesson({ id: "d", subject: "math", unit: "u-1", week: 13, day: 2 }),
  ];

  it("a non-school day resolves to an EMPTY wall, never a wrong day", () => {
    const got = resolveWall(
      input({ scope: { preset: "today" }, lessons, todayCol: null }),
    );
    expect(got).toEqual([]);
    expect(wallItemCount(got)).toBe(0);
  });

  it("Today keys on the CONFIGURED-week column, not a weekday number", () => {
    const got = scopeLessons(
      input({ scope: { preset: "today" }, lessons, todayCol: 2 }),
    );
    // Only week 12 / column 2 — not week 13's column-2 lesson.
    expect(got.map((l) => l.id)).toEqual(["b"]);
  });

  it("honours a column beyond a 5-day week (no slice(0,4) assumption)", () => {
    const sixDay = [
      ...lessons,
      lesson({ id: "e", subject: "sel", unit: "u-9", week: 12, day: 5 }),
    ];
    const got = scopeLessons(
      input({ scope: { preset: "today" }, lessons: sixDay, todayCol: 5 }),
    );
    expect(got.map((l) => l.id)).toEqual(["e"]);
  });

  it("a 3-day custom week: column 1 is the second CONFIGURED day, whatever weekday that is", () => {
    // The module never sees weekdays — only the injected column index. Proving
    // it, a Mon/Wed/Fri school's Wednesday (todayCol 1) picks day===1.
    const custom = [
      lesson({ id: "x", subject: "math", unit: "u-1", week: 12, day: 0 }),
      lesson({ id: "y", subject: "math", unit: "u-1", week: 12, day: 1 }),
      lesson({ id: "z", subject: "math", unit: "u-1", week: 12, day: 2 }),
    ];
    expect(
      scopeLessons(
        input({ scope: { preset: "today" }, lessons: custom, todayCol: 1 }),
      ).map((l) => l.id),
    ).toEqual(["y"]);
  });

  it("This Week ignores the day column entirely", () => {
    const got = scopeLessons(
      input({ scope: { preset: "week-mixed" }, lessons, todayCol: null }),
    );
    expect(got.map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  it("This Week · Mixed sections by day column ASCENDING, with injected labels", () => {
    const sections = resolveWall(
      input({
        scope: { preset: "week-mixed" },
        lessons,
        dayLabel: (i) =>
          ["Sun", "Mon", "Tue", "Wed", "Thu"][i] ?? `Day ${i + 1}`,
      }),
    );
    expect(sections.map((s) => s.id)).toEqual(["day:0", "day:2", "day:4"]);
    expect(sections.map((s) => s.title)).toEqual(["Sun", "Tue", "Thu"]);
  });

  it("falls back to a neutral 'Day n' label rather than inventing a weekday", () => {
    const sections = resolveWall(
      input({ scope: { preset: "week-mixed" }, lessons }),
    );
    expect(sections[0].title).toBe("Day 1");
  });

  it("Today's Lessons builds one section per lesson taught today", () => {
    const twoToday = [
      lesson({
        id: "a",
        subject: "math",
        unit: "u-1",
        week: 12,
        day: 0,
        time: "8:00–8:45",
      }),
      lesson({ id: "b", subject: "reading", unit: "u-1", week: 12, day: 0 }),
      lesson({ id: "c", subject: "math", unit: "u-1", week: 12, day: 1 }),
    ];
    const sections = resolveWall(
      input({ scope: { preset: "today" }, lessons: twoToday, todayCol: 0 }),
    );
    expect(sections.map((s) => s.id)).toEqual(["lesson:a", "lesson:b"]);
    expect(sections[0].meta).toBe("8:00–8:45");
    expect(sections[1].meta).toBe(""); // no time → no meta, never a fake one
  });
});

// ── Rule 3 — no grade assumption ────────────────────────────────────────────

describe("rule 3 — grade-scoping is never assumed", () => {
  it("resolves purely over the injected lesson set (multi-grade callers compose)", () => {
    // Two grades' lessons, same subject/unit/week/day. This module has no grade
    // concept and must return BOTH — the caller passes the grade-scoped set.
    const mixedGrades = [
      lesson({ id: "g5-a", subject: "math", unit: "u-1", week: 12, day: 0 }),
      lesson({ id: "g6-a", subject: "math", unit: "u-1", week: 12, day: 0 }),
    ];
    const got = scopeLessons(
      input({ scope: { preset: "today" }, lessons: mixedGrades, todayCol: 0 }),
    );
    expect(got.map((l) => l.id)).toEqual(["g5-a", "g6-a"]);

    // ...and the grade-scoped call sees only its own grade's lesson.
    const scoped = scopeLessons(
      input({
        scope: { preset: "today" },
        lessons: mixedGrades.filter((l) => l.id.startsWith("g5")),
        todayCol: 0,
      }),
    );
    expect(scoped.map((l) => l.id)).toEqual(["g5-a"]);
  });
});

// ── Anchors: a missing anchor is empty, never a silent "everything" ─────────

describe("anchors", () => {
  const lessons = [
    lesson({ id: "a", subject: "math", unit: "u-1", week: 12, day: 0 }),
    lesson({ id: "b", subject: "reading", unit: "u-1", week: 12, day: 0 }),
  ];

  it("Current Lesson without a lessonId is empty", () => {
    expect(
      resolveWall(input({ scope: { preset: "lesson" }, lessons })),
    ).toEqual([]);
  });

  it("Current Lesson with an unknown lessonId is empty (not the first lesson)", () => {
    expect(
      resolveWall(
        input({ scope: { preset: "lesson", lessonId: "nope" }, lessons }),
      ),
    ).toEqual([]);
  });

  it("Current Lesson resolves exactly its lesson", () => {
    const sections = resolveWall(
      input({ scope: { preset: "lesson", lessonId: "b" }, lessons }),
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].lessonIds).toEqual(["b"]);
    expect(sections[0].subjectId).toBe("reading");
  });

  it.each([
    ["week-subject", { preset: "week-subject" as const }],
    ["subject", { preset: "subject" as const }],
    ["unit", { preset: "unit" as const, unit: "u-1" }],
  ])("%s without a subject anchor is empty", (_name, scope) => {
    expect(resolveWall(input({ scope, lessons }))).toEqual([]);
  });

  it("Unit View without a unit anchor is empty", () => {
    expect(
      resolveWall(
        input({ scope: { preset: "unit", subject: "math" }, lessons }),
      ),
    ).toEqual([]);
  });

  it("This Week · Subject keeps only that subject", () => {
    const got = scopeLessons(
      input({ scope: { preset: "week-subject", subject: "math" }, lessons }),
    );
    expect(got.map((l) => l.id)).toEqual(["a"]);
  });
});

// ── Archived lessons ────────────────────────────────────────────────────────

describe("archived lessons never render", () => {
  it("is filtered from every preset", () => {
    const lessons = [
      lesson({ id: "live", subject: "math", unit: "u-1", week: 12, day: 0 }),
      lesson({
        id: "gone",
        subject: "math",
        unit: "u-1",
        week: 12,
        day: 0,
        archived: true,
      }),
    ];
    for (const preset of WALL_PRESETS) {
      const got = scopeLessons(
        input({
          scope: { preset, lessonId: "gone", subject: "math", unit: "u-1" },
          lessons,
          todayCol: 0,
        }),
      );
      expect(got.some((l) => l.id === "gone")).toBe(false);
    }
  });

  it("an archived lesson is not resolvable as the Current Lesson", () => {
    const lessons = [
      lesson({
        id: "gone",
        subject: "math",
        unit: "u-1",
        week: 12,
        day: 0,
        archived: true,
      }),
    ];
    expect(
      resolveWall(
        input({ scope: { preset: "lesson", lessonId: "gone" }, lessons }),
      ),
    ).toEqual([]);
  });
});

// ── Items ───────────────────────────────────────────────────────────────────

describe("items", () => {
  it("keys stay unique when a lesson carries duplicate-looking rows", () => {
    const lessons = [
      lesson({
        id: "a",
        subject: "math",
        unit: "u-1",
        week: 12,
        day: 0,
        resources: [res("Same"), res("Same")],
      }),
    ];
    const sections = resolveWall(
      input({ scope: { preset: "today" }, lessons, todayCol: 0 }),
    );
    const keys = sections[0].items.map((i) => i.key);
    expect(keys).toEqual(["a#0", "a#1"]);
    expect(new Set(keys).size).toBe(2);
  });

  it("carries the lesson context each card needs (subject color + board target)", () => {
    const lessons = [
      lesson({
        id: "a",
        subject: "reading",
        unit: "u-1",
        week: 12,
        day: 0,
        title: "Fables",
      }),
    ];
    const [item] = resolveWall(
      input({ scope: { preset: "today" }, lessons, todayCol: 0 }),
    )[0].items;
    expect(item.subjectId).toBe("reading");
    expect(item.lessonId).toBe("a");
    expect(item.lessonTitle).toBe("Fables");
  });

  it("uses the INJECTED resolver, not lesson.resources directly", () => {
    // The real caller unions sections + lesson-level rows and de-dupes; proving
    // the seam is honoured keeps that composition possible.
    const lessons = [
      lesson({ id: "a", subject: "math", unit: "u-1", week: 12, day: 0 }),
    ];
    const sections = resolveWall(
      input({
        scope: { preset: "today" },
        lessons,
        todayCol: 0,
        resourcesFor: () => [res("From the seam"), res("And another")],
      }),
    );
    expect(sections[0].items.map((i) => i.resource.label)).toEqual([
      "From the seam",
      "And another",
    ]);
  });

  it("a lesson with no resources yields an empty section, not a crash", () => {
    const lessons = [
      lesson({
        id: "a",
        subject: "math",
        unit: "u-1",
        week: 12,
        day: 0,
        resources: [],
      }),
    ];
    const sections = resolveWall(
      input({ scope: { preset: "today" }, lessons, todayCol: 0 }),
    );
    expect(sections).toHaveLength(1);
    expect(wallItemCount(sections)).toBe(0);
  });

  it("is deterministic — same inputs, same output", () => {
    const lessons = [
      lesson({ id: "a", subject: "math", unit: "u-1", week: 12, day: 1 }),
      lesson({ id: "b", subject: "reading", unit: "u-1", week: 12, day: 0 }),
    ];
    const args = input({ scope: { preset: "week-mixed" }, lessons });
    expect(resolveWall(args)).toEqual(resolveWall(args));
  });
});

// ── Type mapping + filters ──────────────────────────────────────────────────

describe("card type mapping", () => {
  it.each([
    ["notecard", "note"],
    ["pdf", "worksheet"],
    ["image", "image"],
    ["slides", "doc"],
    ["doc", "doc"],
    ["youtube", "video"],
    ["website", "link"],
    ["link", "link"],
  ] as const)("%s → %s", (type, expected) => {
    expect(wallTypeOf(res("x", type))).toBe(expected);
  });

  it("every resource type maps to a family (the switch is total)", () => {
    const families = (
      [
        "notecard",
        "pdf",
        "image",
        "slides",
        "doc",
        "youtube",
        "website",
        "link",
      ] as const
    ).map((t) => wallTypeOf(res("x", t)));
    expect(families.every(Boolean)).toBe(true);
  });
});

// ── Cross-lesson tagging (the "which board?" chooser's input) ──────────────

describe("item.lessons — every lesson tagging this content", () => {
  const shared: LessonResource = {
    type: "doc",
    label: "Fractions anchor chart",
    url: "https://docs.example.org/anchor",
  };

  it("lists BOTH lessons when the same URL is linked from each", () => {
    const lessons = [
      lesson({
        id: "a",
        subject: "math",
        unit: "u-1",
        week: 12,
        day: 0,
        resources: [shared],
      }),
      lesson({
        id: "b",
        subject: "reading",
        unit: "u-1",
        week: 12,
        day: 0,
        title: "Reading block",
        resources: [{ ...shared }],
      }),
    ];
    const sections = resolveWall(
      input({ scope: { preset: "today" }, lessons, todayCol: 0 }),
    );
    expect(sections[0].items[0].lessons.map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("matches on the persisted row id even when the URLs differ", () => {
    const lessons = [
      lesson({
        id: "a",
        subject: "math",
        unit: "u-1",
        week: 12,
        day: 0,
        resources: [
          {
            type: "pdf",
            label: "Sheet",
            resourceId: "row-9",
            url: "/api/resources/row-9",
          },
        ],
      }),
      lesson({
        id: "b",
        subject: "math",
        unit: "u-1",
        week: 12,
        day: 0,
        resources: [{ type: "pdf", label: "Sheet", resourceId: "row-9" }],
      }),
    ];
    const sections = resolveWall(
      input({ scope: { preset: "today" }, lessons, todayCol: 0 }),
    );
    expect(sections[0].items[0].lessons.map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("scans the WHOLE visible set, not just the scoped lessons", () => {
    // The Current-Lesson wall shows lesson a — but the chooser must still learn
    // that lesson b (a different week, off this wall) also tags the resource.
    const lessons = [
      lesson({
        id: "a",
        subject: "math",
        unit: "u-1",
        week: 12,
        day: 0,
        resources: [shared],
      }),
      lesson({
        id: "b",
        subject: "math",
        unit: "u-1",
        week: 30,
        day: 3,
        resources: [{ ...shared }],
      }),
    ];
    const sections = resolveWall(
      input({ scope: { preset: "lesson", lessonId: "a" }, lessons }),
    );
    expect(sections[0].items[0].lessons.map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("never lists a lesson twice when it carries the same content twice", () => {
    const lessons = [
      lesson({
        id: "a",
        subject: "math",
        unit: "u-1",
        week: 12,
        day: 0,
        resources: [shared, { ...shared }],
      }),
    ];
    const sections = resolveWall(
      input({ scope: { preset: "today" }, lessons, todayCol: 0 }),
    );
    expect(sections[0].items[0].lessons.map((l) => l.id)).toEqual(["a"]);
  });

  it("never lists an ARCHIVED lesson (its board is not an option)", () => {
    const lessons = [
      lesson({
        id: "a",
        subject: "math",
        unit: "u-1",
        week: 12,
        day: 0,
        resources: [shared],
      }),
      lesson({
        id: "gone",
        subject: "math",
        unit: "u-1",
        week: 12,
        day: 0,
        archived: true,
        resources: [{ ...shared }],
      }),
    ];
    const sections = resolveWall(
      input({ scope: { preset: "today" }, lessons, todayCol: 0 }),
    );
    expect(sections[0].items[0].lessons.map((l) => l.id)).toEqual(["a"]);
  });

  it("distinct resources never share lesson refs", () => {
    const lessons = [
      lesson({
        id: "a",
        subject: "math",
        unit: "u-1",
        week: 12,
        day: 0,
        resources: [
          shared,
          { type: "link", label: "Other", url: "https://example.org/x" },
        ],
      }),
      lesson({
        id: "b",
        subject: "math",
        unit: "u-1",
        week: 12,
        day: 1,
        resources: [{ ...shared }],
      }),
    ];
    const sections = resolveWall(
      input({ scope: { preset: "week-mixed" }, lessons }),
    );
    const [anchor, other] = sections[0].items;
    expect(anchor.lessons.map((l) => l.id)).toEqual(["a", "b"]);
    expect(other.lessons.map((l) => l.id)).toEqual(["a"]);
  });
});

// ── makeNoteItem ────────────────────────────────────────────────────────────

describe("makeNoteItem", () => {
  it("mints a composing notecard bound to its lesson", () => {
    const note = makeNoteItem({
      key: "k1",
      subjectId: "math",
      lessonId: "a",
      lessonTitle: "Fractions",
    });
    expect(note.type).toBe("notecard");
    expect(note.composing).toBe(true);
    expect(note.resource.type).toBe("notecard");
    expect(wallTypeOf(note.resource)).toBe("note");
    expect(note.lessons).toEqual([]);
  });

  it("allows a wall-local note with no lesson (a custom section)", () => {
    const note = makeNoteItem({ key: "k2", subjectId: "sel" });
    expect(note.lessonId).toBe("");
    expect(note.lessons).toEqual([]);
  });
});

// ── The flattened item fields the Section's filter + search read ────────────

describe("flattened item fields", () => {
  it("mirrors type + label off the resource so the filter never re-derives them", () => {
    const lessons = [
      lesson({
        id: "a",
        subject: "math",
        unit: "u-1",
        week: 12,
        day: 0,
        resources: [res("Deck", "slides"), res("Clip", "youtube")],
      }),
    ];
    const items = resolveWall(
      input({ scope: { preset: "today" }, lessons, todayCol: 0 }),
    )[0].items;
    expect(items.map((i) => i.type)).toEqual(["slides", "youtube"]);
    expect(items.map((i) => i.label)).toEqual(["Deck", "Clip"]);
    // ...and they agree with the row they were lifted from.
    for (const i of items) {
      expect(i.type).toBe(i.resource.type);
      expect(i.label).toBe(i.resource.label);
    }
  });
});

// ── Presets ─────────────────────────────────────────────────────────────────

describe("preset vocabulary", () => {
  it("every preset has the artboard's label", () => {
    for (const p of WALL_PRESETS) expect(WALL_PRESET_LABEL[p]).toBeTruthy();
    expect(WALL_PRESETS).toHaveLength(6);
    expect(WALL_PRESET_LABEL["today"]).toBe("Today's Lessons (Mixed)");
  });
});
