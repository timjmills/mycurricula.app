import { describe, it, expect } from "vitest";

import {
  unitLessons,
  unitProgress,
  unitOrdinal,
  resolveUnitHeader,
} from "@/lib/year-v2-data";
import type { Lesson, Subject, SubjectId, Unit } from "@/lib/types";

// The year-v2-data helpers are pure + structural — they read only
// subject/unit/archived/status/week/day off a lesson — so these fixtures build
// just those fields and cast. (Matches the rest of the node-env suite: no
// React, no store.)

function lesson(partial: {
  id: string;
  subject: SubjectId;
  unit: string;
  week: number;
  day: number;
  status?: Lesson["status"];
  archived?: boolean;
}): Lesson {
  return {
    status: "not_done",
    ...partial,
  } as unknown as Lesson;
}

function unit(
  id: string,
  subject: SubjectId,
  extra: { name?: string; weeks?: string } = {},
): Unit {
  return {
    id,
    subject,
    name: extra.name ?? id,
    weeks: extra.weeks ?? "",
    shade: 0,
  } as unknown as Unit;
}

function subject(id: SubjectId): Subject {
  return { id, name: id, cls: id, icon: "" } as unknown as Subject;
}

describe("unitLessons — filter + sort", () => {
  const rows: Lesson[] = [
    lesson({ id: "a", subject: "math", unit: "u-m3", week: 12, day: 1 }),
    lesson({ id: "b", subject: "math", unit: "u-m3", week: 11, day: 3 }),
    lesson({ id: "c", subject: "math", unit: "u-m3", week: 11, day: 1 }),
    // different unit, same subject — excluded
    lesson({ id: "d", subject: "math", unit: "m-u4", week: 11, day: 0 }),
    // same unit slug but different subject — excluded (defensive: slugs are
    // unique per subject, but the filter must gate on subject too)
    lesson({ id: "e", subject: "reading", unit: "u-m3", week: 11, day: 0 }),
    // archived — excluded
    lesson({
      id: "f",
      subject: "math",
      unit: "u-m3",
      week: 10,
      day: 0,
      archived: true,
    }),
  ];

  it("keeps only the subject+unit's non-archived lessons", () => {
    const out = unitLessons(rows, "math", "u-m3");
    expect(out.map((l) => l.id)).toEqual(["c", "b", "a"]);
  });

  it("sorts week-then-day", () => {
    const out = unitLessons(rows, "math", "u-m3");
    expect(out.map((l) => [l.week, l.day])).toEqual([
      [11, 1],
      [11, 3],
      [12, 1],
    ]);
  });

  it("excludes archived rows", () => {
    const out = unitLessons(rows, "math", "u-m3");
    expect(out.some((l) => l.id === "f")).toBe(false);
  });

  it("returns a fresh array (no aliasing / no mutation of the input)", () => {
    const input = [...rows];
    const out = unitLessons(rows, "math", "u-m3");
    expect(out).not.toBe(rows);
    // The source order is untouched (sort ran on a copy).
    expect(rows).toEqual(input);
  });

  it("returns empty for a unit with no lessons", () => {
    expect(unitLessons(rows, "math", "m-u7")).toEqual([]);
  });
});

describe("unitProgress — taught / total", () => {
  it("counts done lessons as taught", () => {
    const rows = [
      lesson({ id: "a", subject: "math", unit: "u-m3", week: 11, day: 0, status: "done" }),
      lesson({ id: "b", subject: "math", unit: "u-m3", week: 11, day: 1, status: "not_done" }),
      lesson({ id: "c", subject: "math", unit: "u-m3", week: 11, day: 2, status: "done" }),
    ];
    expect(unitProgress(rows)).toEqual({ total: 3, taught: 2 });
  });

  it("only 'done' counts — other statuses are not taught", () => {
    const rows = [
      lesson({ id: "a", subject: "math", unit: "u-m3", week: 11, day: 0, status: "carried" }),
      lesson({ id: "b", subject: "math", unit: "u-m3", week: 11, day: 1, status: "skipped" as Lesson["status"] }),
    ];
    expect(unitProgress(rows)).toEqual({ total: 2, taught: 0 });
  });

  it("handles an empty unit (no divide-by-zero surprises)", () => {
    expect(unitProgress([])).toEqual({ total: 0, taught: 0 });
  });
});

describe("unitOrdinal — position within the subject's units", () => {
  const units: Unit[] = [
    unit("m-u1", "math"),
    unit("m-u2", "math"),
    unit("u-m3", "math"),
    unit("r-u1", "reading"),
    unit("u-r2", "reading"),
  ];

  it("finds the 0-based index and per-subject count", () => {
    expect(unitOrdinal(units, "math", "u-m3")).toEqual({ index: 2, count: 3 });
    expect(unitOrdinal(units, "reading", "r-u1")).toEqual({
      index: 0,
      count: 2,
    });
  });

  it("returns index -1 for a slug absent from the subject's list", () => {
    expect(unitOrdinal(units, "math", "does-not-exist")).toEqual({
      index: -1,
      count: 3,
    });
  });

  it("does not leak a slug across subjects", () => {
    // "u-m3" is a math unit — asking under reading must not find it.
    expect(unitOrdinal(units, "reading", "u-m3")).toEqual({
      index: -1,
      count: 2,
    });
  });
});

describe("resolveUnitHeader — the subject-vanished guard", () => {
  const units: Unit[] = [
    unit("m-u1", "math"),
    unit("m-u2", "math"),
    unit("u-m3", "math", { name: "Unit 3 · Fractions", weeks: "Wk 11–16" }),
  ];
  const subjectById = { math: subject("math") };

  it("resolves name, span and ordinal when subject + unit are both present", () => {
    const header = resolveUnitHeader(subjectById, units, "math", "u-m3");
    expect(header).not.toBeNull();
    expect(header?.subject.id).toBe("math");
    expect(header?.name).toBe("Unit 3 · Fractions");
    expect(header?.spanLabel).toBe("Wk 11–16");
    expect(header?.ordinalLabel).toBe("Unit 3 of 3");
  });

  // THE GUARD (Codex M2): a catalog / notebook swap can drop the subject while
  // the modal is open. Returning null is what tells the modal to close instead
  // of dereferencing `subject.cls` and taking the whole Year surface down.
  it("returns null when the subject is missing from the catalog", () => {
    expect(resolveUnitHeader({}, units, "math", "u-m3")).toBeNull();
  });

  it("returns null for a subject absent from the map, even with a valid unit", () => {
    // `reading` has no entry — a Record<SubjectId, Subject> lies about this at
    // the type level, so the runtime guard is the only thing standing here.
    expect(resolveUnitHeader(subjectById, units, "reading", "u-m3")).toBeNull();
  });

  it("degrades (does NOT close) when only the UNIT is missing", () => {
    const header = resolveUnitHeader(subjectById, units, "math", "ghost-unit");
    expect(header).not.toBeNull();
    expect(header?.name).toBe("ghost-unit"); // raw slug stands in
    expect(header?.spanLabel).toBe("");
    expect(header?.ordinalLabel).toBe(""); // ordinal -1 drops the label
  });

  it("drops the span label when the catalog unit carries no week range", () => {
    const header = resolveUnitHeader(subjectById, units, "math", "m-u1");
    expect(header?.spanLabel).toBe("");
    expect(header?.ordinalLabel).toBe("Unit 1 of 3");
  });

  // Slugs are unique only WITHIN a subject, so the header must be resolved by
  // searching the subject's own units. A flat `unitById[slug]` map (a) hands
  // back the wrong subject's name/span, and (b) can hold only ONE entry per
  // slug, so whichever subject loses the race vanishes from the map entirely
  // and its own valid unit degrades to a bare slug. Both directions here.
  describe("a slug shared by two subjects", () => {
    const shared: Unit[] = [
      unit("shared-slug", "math", { name: "Math · Ratios", weeks: "Wk 4–8" }),
      unit("shared-slug", "reading", {
        name: "Reading · Book Clubs",
        weeks: "Wk 20–24",
      }),
    ];
    const both = { math: subject("math"), reading: subject("reading") };

    it("gives each subject its OWN metadata, regardless of catalog order", () => {
      const math = resolveUnitHeader(both, shared, "math", "shared-slug");
      expect(math?.name).toBe("Math · Ratios");
      expect(math?.spanLabel).toBe("Wk 4–8");
      expect(math?.ordinalLabel).toBe("Unit 1 of 1");

      // `reading` is LAST in the list — the entry a flat map would have kept.
      const reading = resolveUnitHeader(both, shared, "reading", "shared-slug");
      expect(reading?.name).toBe("Reading · Book Clubs");
      expect(reading?.spanLabel).toBe("Wk 20–24");
      expect(reading?.ordinalLabel).toBe("Unit 1 of 1");
    });

    it("degrades rather than borrowing when the subject has no such unit", () => {
      // Only reading owns the slug; asking as math must not paint reading's
      // name + week span above math's glyph and math's lessons.
      const mathOnly = { math: subject("math"), reading: subject("reading") };
      const readingOnly = [shared[1]];
      const header = resolveUnitHeader(
        mathOnly,
        readingOnly,
        "math",
        "shared-slug",
      );
      expect(header).not.toBeNull();
      expect(header?.subject.id).toBe("math");
      expect(header?.name).toBe("shared-slug"); // NOT "Reading · Book Clubs"
      expect(header?.spanLabel).toBe(""); // NOT "Wk 20–24"
      expect(header?.ordinalLabel).toBe("");
    });
  });
});
