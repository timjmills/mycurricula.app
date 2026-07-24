import { describe, it, expect } from "vitest";

import {
  subjectUnitGroups,
  unitProgressByKey,
  unitProgressKey,
  unitPace,
  unitGaps,
  arcPhasesReached,
  ARC_PHASES,
} from "@/lib/unit-workspace-derive";
import type {
  Lesson,
  LessonResource,
  Subject,
  SubjectId,
  Unit,
} from "@/lib/types";

// Pure + structural derivations (no React, no store) — the fixtures build only
// the fields each helper reads and cast, matching tests/year-v2-data.test.ts.

function subject(id: SubjectId): Subject {
  return { id, name: id, cls: id, icon: "" } as unknown as Subject;
}

function unit(id: string, subj: SubjectId): Unit {
  return { id, subject: subj, name: id, weeks: "", shade: 0 } as unknown as Unit;
}

function res(type: LessonResource["type"], label: string): LessonResource {
  return { type, label };
}

function lesson(partial: {
  id: string;
  subject?: SubjectId;
  unit?: string;
  week?: number;
  day?: number;
  status?: Lesson["status"];
  objective?: string;
  resources?: LessonResource[];
  standards?: string[];
}): Lesson {
  return {
    subject: "math",
    unit: "u-m3",
    title: partial.id,
    week: 11,
    day: 0,
    objective: "I can do the thing",
    resources: [res("slides", "Deck")],
    standards: ["5.NBT.1"],
    notes: "",
    status: "not_done",
    ...partial,
  } as unknown as Lesson;
}

describe("subjectUnitGroups — group units by subject", () => {
  const subjects = [subject("math"), subject("reading"), subject("writing")];
  const units: Unit[] = [
    unit("m-u1", "math"),
    unit("m-u2", "math"),
    unit("r-u1", "reading"),
  ];

  it("groups each subject's units, preserving subject and unit order", () => {
    const groups = subjectUnitGroups(subjects, units);
    expect(groups.map((g) => g.subject.id)).toEqual(["math", "reading"]);
    expect(groups[0].units.map((u) => u.id)).toEqual(["m-u1", "m-u2"]);
    expect(groups[1].units.map((u) => u.id)).toEqual(["r-u1"]);
  });

  it("drops subjects that have no units (no empty rail headings)", () => {
    // "writing" has no units — it must not appear as an empty group.
    expect(subjectUnitGroups(subjects, units).some((g) => g.subject.id === "writing")).toBe(
      false,
    );
  });

  it("follows the subjects list order, not the units list order", () => {
    // reading listed before math in `subjects` → reading first.
    const reordered = [subject("reading"), subject("math")];
    const groups = subjectUnitGroups(reordered, units);
    expect(groups.map((g) => g.subject.id)).toEqual(["reading", "math"]);
  });

  it("does not leak a unit into a subject that does not own it", () => {
    const groups = subjectUnitGroups([subject("math")], units);
    expect(groups).toHaveLength(1);
    expect(groups[0].units.map((u) => u.id)).toEqual(["m-u1", "m-u2"]);
  });

  it("returns [] when there are no subjects or no units", () => {
    expect(subjectUnitGroups([], units)).toEqual([]);
    expect(subjectUnitGroups(subjects, [])).toEqual([]);
  });
});

describe("unitPace — honest completion, remaining = total − taught", () => {
  it("reports taught/total and remaining as total − taught (never /5)", () => {
    const lessons = [
      lesson({ id: "a", status: "done" }),
      lesson({ id: "b", status: "done" }),
      lesson({ id: "c", status: "not_done" }),
      lesson({ id: "d", status: "not_done" }),
    ];
    expect(unitPace(lessons)).toEqual({
      total: 4,
      taught: 2,
      remaining: 2,
      fraction: 0.5,
      state: "in_progress",
    });
  });

  it("is 'complete' when every lesson is taught", () => {
    const lessons = [
      lesson({ id: "a", status: "done" }),
      lesson({ id: "b", status: "done" }),
    ];
    expect(unitPace(lessons)).toMatchObject({
      total: 2,
      taught: 2,
      remaining: 0,
      fraction: 1,
      state: "complete",
    });
  });

  it("is 'empty' with a 0 fraction and no divide-by-zero for no lessons", () => {
    expect(unitPace([])).toEqual({
      total: 0,
      taught: 0,
      remaining: 0,
      fraction: 0,
      state: "empty",
    });
  });

  it("counts only 'done' as taught (other statuses remain remaining)", () => {
    const lessons = [
      lesson({ id: "a", status: "carried" }),
      lesson({ id: "b", status: "done" }),
    ];
    expect(unitPace(lessons)).toMatchObject({ taught: 1, remaining: 1 });
  });
});

describe("unitGaps — planning completeness on not-taught lessons only", () => {
  it("counts objective/resources/standards gaps and the union", () => {
    const lessons = [
      // fully planned — no gaps
      lesson({ id: "a" }),
      // missing objective only
      lesson({ id: "b", objective: "   " }),
      // missing resources AND standards → one lesson, both flags
      lesson({ id: "c", resources: [], standards: [] }),
    ];
    expect(unitGaps(lessons)).toEqual({
      missingObjective: 1,
      missingResources: 1,
      missingStandards: 1,
      lessonsWithGaps: 2,
    });
  });

  it("ignores taught lessons entirely (their planning is history)", () => {
    const lessons = [
      // taught but incomplete — must NOT count as a gap
      lesson({ id: "a", status: "done", objective: "", resources: [], standards: [] }),
      // not-taught, fully planned — no gap
      lesson({ id: "b" }),
    ];
    expect(unitGaps(lessons)).toEqual({
      missingObjective: 0,
      missingResources: 0,
      missingStandards: 0,
      lessonsWithGaps: 0,
    });
  });

  it("treats a whitespace-only objective as missing", () => {
    expect(unitGaps([lesson({ id: "a", objective: "\n  \t " })]).missingObjective).toBe(1);
  });

  it("returns all-zero for no lessons", () => {
    expect(unitGaps([])).toEqual({
      missingObjective: 0,
      missingResources: 0,
      missingStandards: 0,
      lessonsWithGaps: 0,
    });
  });
});

describe("arcPhasesReached + ARC_PHASES", () => {
  it("ARC_PHASES is the canonical six-phase default", () => {
    expect(ARC_PHASES).toHaveLength(6);
    expect(ARC_PHASES[0]).toBe("Introduce & Explore");
  });

  it("maps completion fraction onto the phase count (round)", () => {
    // 2/4 = 0.5 × 6 = 3
    expect(arcPhasesReached({ total: 4, taught: 2 })).toBe(3);
    // 3/4 = 0.75 × 6 = 4.5 → round → 5 (round-half-up)
    expect(arcPhasesReached({ total: 4, taught: 3 })).toBe(5);
  });

  it("is 0 for an empty unit and full at completion", () => {
    expect(arcPhasesReached({ total: 0, taught: 0 })).toBe(0);
    expect(arcPhasesReached({ total: 5, taught: 5 })).toBe(6);
  });

  it("honors a custom phase count and clamps into range", () => {
    expect(arcPhasesReached({ total: 4, taught: 2 }, 4)).toBe(2);
    expect(arcPhasesReached({ total: 4, taught: 4 }, 4)).toBe(4);
    // non-positive phase count → 0
    expect(arcPhasesReached({ total: 4, taught: 2 }, 0)).toBe(0);
  });
});

describe("unitProgressByKey — one-pass per-unit taught/total map", () => {
  it("counts total + taught (status done) per subject+unit key", () => {
    const map = unitProgressByKey([
      lesson({ id: "a", status: "done" }), // math / u-m3
      lesson({ id: "b", status: "not_done" }), // math / u-m3
      lesson({ id: "c", subject: "reading", unit: "r-u1", status: "done" }),
    ]);
    expect(map.get(unitProgressKey("math", "u-m3"))).toEqual({
      total: 2,
      taught: 1,
    });
    expect(map.get(unitProgressKey("reading", "r-u1"))).toEqual({
      total: 1,
      taught: 1,
    });
  });

  it("excludes archived lessons, matching unitLessons/unitProgress", () => {
    const map = unitProgressByKey([
      lesson({ id: "a", status: "done" }),
      { ...lesson({ id: "b", status: "done" }), archived: true } as Lesson,
    ]);
    // Only the non-archived lesson is counted.
    expect(map.get(unitProgressKey("math", "u-m3"))).toEqual({
      total: 1,
      taught: 1,
    });
  });

  it("keys on subject AND unit — same slug across subjects never merges", () => {
    const map = unitProgressByKey([
      lesson({ id: "a", subject: "math", unit: "shared", status: "done" }),
      lesson({ id: "b", subject: "reading", unit: "shared", status: "not_done" }),
    ]);
    expect(map.get(unitProgressKey("math", "shared"))).toEqual({
      total: 1,
      taught: 1,
    });
    expect(map.get(unitProgressKey("reading", "shared"))).toEqual({
      total: 1,
      taught: 0,
    });
  });

  it("returns an empty map for no lessons; misses read as undefined", () => {
    const map = unitProgressByKey([]);
    expect(map.size).toBe(0);
    expect(map.get(unitProgressKey("math", "nope"))).toBeUndefined();
  });
});
