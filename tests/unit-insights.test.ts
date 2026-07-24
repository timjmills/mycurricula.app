// unit-insights.test.ts — the B3 Insights derivations. The point of that module
// is that it never invents a statistic, so most of these tests are honesty
// assertions: a missing input must surface as `unavailable` with a reason, a
// partial sample must carry its own denominator, and the buckets must sum.

import { describe, it, expect } from "vitest";

import {
  assessmentCoverage,
  plannedTime,
  prepReadiness,
  planningGaps,
  standardsSpread,
  taughtDateCoverage,
  unitInsights,
} from "@/lib/unit-insights";
import type { Lesson, LessonAssessment, LessonResource } from "@/lib/types";

// Pure derivations (no React, no store) — the fixtures build only the fields
// the helpers read and cast, matching tests/unit-workspace-derive.test.ts.

function res(type: LessonResource["type"], label: string): LessonResource {
  return { type, label };
}

function lesson(partial: {
  id: string;
  status?: Lesson["status"];
  objective?: string;
  resources?: LessonResource[];
  standards?: string[];
  /** Real `standards.id` uuids, index-aligned with `standards`. */
  standardIds?: string[];
  archived?: boolean;
  assessment?: LessonAssessment;
  durationMinutes?: number;
  builds?: string;
  prep?: string;
  taughtAt?: string;
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

/** A lesson carrying none of the Track-B fields — the shape every lesson has
 *  while the Track-B read seam is off. */
function bare(id: string): Lesson {
  return lesson({ id });
}

describe("assessmentCoverage — kinds, and the unclassified bucket", () => {
  it("splits formative / summative and counts lessons without an assessment", () => {
    const got = assessmentCoverage([
      lesson({ id: "a", assessment: { kind: "formative", title: "Exit" } }),
      lesson({ id: "b", assessment: { kind: "summative" } }),
      lesson({ id: "c" }),
    ]);
    expect(got).toEqual({
      state: "available",
      lessonCount: 3,
      value: {
        withAssessment: 2,
        withoutAssessment: 1,
        formative: 1,
        summative: 1,
        unclassified: 0,
      },
    });
  });

  it("counts a kind-less assessment as UNCLASSIFIED, not as absent", () => {
    // assessmentFromRow round-trips a title-only assessment, so a naive
    // kind-filter would silently hide this lesson and under-report coverage.
    const got = assessmentCoverage([
      lesson({ id: "a", assessment: { title: "Observation" } }),
      lesson({ id: "b", assessment: { notes: "conference" } }),
      lesson({ id: "c", assessment: { purpose: "check fluency" } }),
    ]);
    expect(got.state).toBe("available");
    if (got.state !== "available") return;
    expect(got.value.unclassified).toBe(3);
    expect(got.value.withAssessment).toBe(3);
    expect(got.value.withoutAssessment).toBe(0);
  });

  it("buckets always sum: formative + summative + unclassified = withAssessment", () => {
    const got = assessmentCoverage([
      lesson({ id: "a", assessment: { kind: "formative" } }),
      lesson({ id: "b", assessment: { kind: "summative" } }),
      lesson({ id: "c", assessment: { title: "Watch" } }),
      lesson({ id: "d" }),
    ]);
    if (got.state !== "available") throw new Error("expected available");
    const v = got.value;
    expect(v.formative + v.summative + v.unclassified).toBe(v.withAssessment);
    expect(v.withAssessment + v.withoutAssessment).toBe(got.lessonCount);
  });

  it("treats a garbage kind as no-kind (same guard as the read mapper)", () => {
    // Text present → it is still a real assessment, just unclassified.
    const withText = assessmentCoverage([
      lesson({
        id: "a",
        assessment: { kind: "pop-quiz" as never, title: "Surprise" },
      }),
    ]);
    if (withText.state !== "available") throw new Error("expected available");
    expect(withText.value.unclassified).toBe(1);

    // No text either → nothing is there; assessmentFromRow would have returned
    // undefined for the same row, so it must not inflate the count.
    const empty = assessmentCoverage([
      lesson({ id: "a", assessment: { kind: "pop-quiz" as never } }),
    ]);
    if (empty.state !== "available") throw new Error("expected available");
    expect(empty.value.withAssessment).toBe(0);
  });

  it("does not count an empty or whitespace-only assessment", () => {
    const got = assessmentCoverage([
      lesson({ id: "a", assessment: {} }),
      lesson({ id: "b", assessment: { title: "   ", notes: "\n\t" } }),
    ]);
    if (got.state !== "available") throw new Error("expected available");
    expect(got.value.withAssessment).toBe(0);
    expect(got.value.withoutAssessment).toBe(2);
  });

  it("reports zeros (not unavailable) when the unit simply has no assessments", () => {
    // An un-assessed lesson is a REAL state a teacher acts on, so a count of 0
    // is honest — unlike an aggregate over an empty sample.
    const got = assessmentCoverage([bare("a"), bare("b")]);
    expect(got.state).toBe("available");
    if (got.state !== "available") return;
    expect(got.value.withAssessment).toBe(0);
  });

  it("is unavailable ('no_lessons') for an empty unit", () => {
    expect(assessmentCoverage([])).toEqual({
      state: "unavailable",
      lessonCount: 0,
      reason: "no_lessons",
    });
  });
});

describe("plannedTime — a partial sum that carries its own denominator", () => {
  it("sums only the lessons that set a duration and reports N of M", () => {
    const got = plannedTime([
      lesson({ id: "a", durationMinutes: 45 }),
      lesson({ id: "b", durationMinutes: 30 }),
      lesson({ id: "c" }),
      lesson({ id: "d" }),
    ]);
    expect(got).toEqual({
      state: "available",
      lessonCount: 4,
      value: {
        totalMinutes: 75,
        lessonsWithDuration: 2,
        lessonsMissingDuration: 2,
        complete: false,
      },
    });
  });

  it("NEVER extrapolates the missing lessons from the sample", () => {
    // 2 lessons × 45 min with 8 lessons in the unit is 90 minutes of PLANNED
    // time, not 360. The average-times-count fabrication is the failure mode.
    const lessons = [
      lesson({ id: "a", durationMinutes: 45 }),
      lesson({ id: "b", durationMinutes: 45 }),
      ...Array.from({ length: 6 }, (_, i) => lesson({ id: `x${i}` })),
    ];
    const got = plannedTime(lessons);
    if (got.state !== "available") throw new Error("expected available");
    expect(got.value.totalMinutes).toBe(90);
    expect(got.value.lessonsWithDuration).toBe(2);
    expect(got.lessonCount).toBe(8);
  });

  it("flags `complete` only when every lesson carries a duration", () => {
    const got = plannedTime([
      lesson({ id: "a", durationMinutes: 40 }),
      lesson({ id: "b", durationMinutes: 20 }),
    ]);
    if (got.state !== "available") throw new Error("expected available");
    expect(got.value).toEqual({
      totalMinutes: 60,
      lessonsWithDuration: 2,
      lessonsMissingDuration: 0,
      complete: true,
    });
  });

  it("is unavailable ('no_data') when no lesson has a duration — never 0 minutes", () => {
    expect(plannedTime([bare("a"), bare("b"), bare("c")])).toEqual({
      state: "unavailable",
      lessonCount: 3,
      reason: "no_data",
    });
  });

  it("treats a non-positive or non-finite duration as not-set, not as a value", () => {
    // The column has no CHECK, so 0 / -30 / NaN can arrive. None of them is a
    // real planned length: they are excluded from the sum AND counted as
    // missing, so the denominator never silently shrinks.
    const got = plannedTime([
      lesson({ id: "a", durationMinutes: 50 }),
      lesson({ id: "b", durationMinutes: 0 }),
      lesson({ id: "c", durationMinutes: -30 }),
      lesson({ id: "d", durationMinutes: Number.NaN }),
      lesson({ id: "e", durationMinutes: Number.POSITIVE_INFINITY }),
    ]);
    if (got.state !== "available") throw new Error("expected available");
    expect(got.value.totalMinutes).toBe(50);
    expect(got.value.lessonsWithDuration).toBe(1);
    expect(got.value.lessonsMissingDuration).toBe(4);
  });

  it("is unavailable ('no_lessons') for an empty unit", () => {
    expect(plannedTime([])).toMatchObject({
      state: "unavailable",
      reason: "no_lessons",
    });
  });
});

describe("prepReadiness — builds / prep, with a union that never double-counts", () => {
  it("counts each field and the union of the two", () => {
    const got = prepReadiness([
      lesson({ id: "a", builds: "place value", prep: "print grids" }),
      lesson({ id: "b", builds: "arrays" }),
      lesson({ id: "c", prep: "cut cards" }),
      lesson({ id: "d" }),
    ]);
    expect(got).toEqual({
      state: "available",
      lessonCount: 4,
      value: {
        withPrep: 2,
        withBuilds: 2,
        withEither: 3,
        withNeither: 1,
      },
    });
  });

  it("treats whitespace-only prose as empty", () => {
    const got = prepReadiness([
      lesson({ id: "a", builds: "  \n\t", prep: "" }),
    ]);
    if (got.state !== "available") throw new Error("expected available");
    expect(got.value).toEqual({
      withPrep: 0,
      withBuilds: 0,
      withEither: 0,
      withNeither: 1,
    });
  });

  it("reports zeros for a unit with nothing prepped (a real state)", () => {
    const got = prepReadiness([bare("a"), bare("b")]);
    if (got.state !== "available") throw new Error("expected available");
    expect(got.value.withEither).toBe(0);
    expect(got.value.withNeither).toBe(2);
  });

  it("is unavailable ('no_lessons') for an empty unit", () => {
    expect(prepReadiness([])).toMatchObject({
      state: "unavailable",
      reason: "no_lessons",
    });
  });
});

describe("planningGaps — unitGaps verbatim, with its own denominator", () => {
  it("reports the gap counts alongside the not-taught denominator", () => {
    const got = planningGaps([
      lesson({ id: "a" }), // fully planned, not taught
      lesson({ id: "b", objective: "   " }), // missing objective
      lesson({ id: "c", resources: [], standards: [] }), // two gaps, one lesson
      lesson({ id: "d", status: "done", objective: "" }), // taught → ignored
    ]);
    expect(got).toEqual({
      state: "available",
      lessonCount: 4,
      value: {
        gaps: {
          missingObjective: 1,
          missingResources: 1,
          missingStandards: 1,
          lessonsWithGaps: 2,
        },
        // 3 of the 4 are not taught — the denominator unitGaps counts against,
        // which is NOT lessonCount.
        notTaught: 3,
      },
    });
  });

  it("reports notTaught: 0 for a fully taught unit (zero gaps is then true)", () => {
    const got = planningGaps([
      lesson({ id: "a", status: "done", objective: "", resources: [] }),
      lesson({ id: "b", status: "done" }),
    ]);
    if (got.state !== "available") throw new Error("expected available");
    expect(got.value.notTaught).toBe(0);
    expect(got.value.gaps.lessonsWithGaps).toBe(0);
  });

  it("counts every non-done status as not-taught (carried, skipped, …)", () => {
    const got = planningGaps([
      lesson({ id: "a", status: "carried" }),
      lesson({ id: "b", status: "done" }),
    ]);
    if (got.state !== "available") throw new Error("expected available");
    expect(got.value.notTaught).toBe(1);
  });

  it("is unavailable ('no_lessons') for an empty unit", () => {
    expect(planningGaps([])).toMatchObject({
      state: "unavailable",
      reason: "no_lessons",
    });
  });
});

describe("standardsSpread — distinct codes + reinforcement, and NO ratio", () => {
  it("counts distinct codes with per-code lesson counts, sorted by code", () => {
    const got = standardsSpread([
      lesson({ id: "a", standards: ["5.NBT.1", "5.NF.2"] }),
      lesson({ id: "b", standards: ["5.NBT.1"] }),
      lesson({ id: "c", standards: [] }),
    ]);
    expect(got).toEqual({
      state: "available",
      lessonCount: 3,
      value: {
        distinctCodes: 2,
        codes: [
          { identity: "code:5.NBT.1", code: "5.NBT.1", lessonCount: 2 },
          { identity: "code:5.NF.2", code: "5.NF.2", lessonCount: 1 },
        ],
        lessonsTagged: 2,
        lessonsUntagged: 1,
      },
    });
  });

  it("does NOT merge same-code standards from different frameworks", () => {
    // A code is unique only WITHIN a framework — the beta school runs more than
    // one, so AERO "S1" and WIDA "S1" are different standards. Grouping by code
    // would report ONE standard tagged by two lessons and understate coverage.
    // `standardIds` carries the real standards.id uuids, index-aligned.
    const got = standardsSpread([
      lesson({ id: "a", standards: ["S1"], standardIds: ["uuid-aero-s1"] }),
      lesson({ id: "b", standards: ["S1"], standardIds: ["uuid-wida-s1"] }),
    ]);
    if (got.state !== "available") throw new Error("expected available");
    expect(got.value.distinctCodes).toBe(2);
    expect(got.value.codes).toEqual([
      { identity: "uuid-aero-s1", code: "S1", lessonCount: 1 },
      { identity: "uuid-wida-s1", code: "S1", lessonCount: 1 },
    ]);
    // Distinct React keys — a duplicated key destabilizes reconciliation.
    expect(new Set(got.value.codes.map((c) => c.identity)).size).toBe(2);
    expect(got.value.lessonsTagged).toBe(2);
  });

  it("counts a duplicated tag within ONE lesson once", () => {
    // lessonCount reads as "N lessons reinforce this" — a lesson carrying the
    // same standard twice must not present as two lessons.
    const got = standardsSpread([
      lesson({ id: "a", standards: ["5.NBT.1", "5.NBT.1"] }),
    ]);
    if (got.state !== "available") throw new Error("expected available");
    expect(got.value.distinctCodes).toBe(1);
    expect(got.value.codes).toEqual([
      { identity: "code:5.NBT.1", code: "5.NBT.1", lessonCount: 1 },
    ]);
  });

  it("still groups by code when standardIds is absent (pre-backfill rows)", () => {
    const got = standardsSpread([
      lesson({ id: "a", standards: ["5.NBT.1"] }),
      lesson({ id: "b", standards: ["5.NBT.1"] }),
    ]);
    if (got.state !== "available") throw new Error("expected available");
    expect(got.value.distinctCodes).toBe(1);
    expect(got.value.codes).toEqual([
      { identity: "code:5.NBT.1", code: "5.NBT.1", lessonCount: 2 },
    ]);
  });

  it("groups a mixed row set by id where present, else by code", () => {
    const got = standardsSpread([
      lesson({ id: "a", standards: ["S1"], standardIds: ["uuid-aero-s1"] }),
      lesson({ id: "b", standards: ["S1"] }), // no id — falls back to the code
    ]);
    if (got.state !== "available") throw new Error("expected available");
    // Deliberately 2: an id-bearing row and a code-only row are not provably
    // the same standard, and merging them would be a guess.
    expect(got.value.distinctCodes).toBe(2);
  });

  it("exposes NO coverage ratio (units.standards has no editor — it'd be fabricated)", () => {
    const got = standardsSpread([lesson({ id: "a" })]);
    if (got.state !== "available") throw new Error("expected available");
    const keys = Object.keys(got.value).sort();
    expect(keys).toEqual([
      "codes",
      "distinctCodes",
      "lessonsTagged",
      "lessonsUntagged",
    ]);
  });

  it("reports zeros when nothing in the unit is tagged", () => {
    const got = standardsSpread([
      lesson({ id: "a", standards: [] }),
      lesson({ id: "b", standards: [] }),
    ]);
    if (got.state !== "available") throw new Error("expected available");
    expect(got.value).toEqual({
      distinctCodes: 0,
      codes: [],
      lessonsTagged: 0,
      lessonsUntagged: 2,
    });
  });

  it("is unavailable ('no_lessons') for an empty unit", () => {
    expect(standardsSpread([])).toMatchObject({
      state: "unavailable",
      reason: "no_lessons",
    });
  });
});

describe("taughtDateCoverage — unavailable, never zero", () => {
  it("is 'not_recorded' for the shape every lesson has today (no taughtAt)", () => {
    // Nothing writes taught_at (it is read-only in B2), so this is the real
    // production answer — and it must NOT read as "taught zero times".
    expect(taughtDateCoverage([bare("a"), bare("b"), bare("c")])).toEqual({
      state: "unavailable",
      lessonCount: 3,
      reason: "not_recorded",
    });
  });

  it("distinguishes 'not_recorded' from 'no_lessons'", () => {
    expect(taughtDateCoverage([])).toMatchObject({
      state: "unavailable",
      lessonCount: 0,
      reason: "no_lessons",
    });
  });

  it("treats an unparseable timestamp as absent rather than poisoning the range", () => {
    expect(
      taughtDateCoverage([lesson({ id: "a", taughtAt: "someday" })]),
    ).toEqual({ state: "unavailable", lessonCount: 1, reason: "not_recorded" });
  });

  it("reports the real range verbatim once dates exist, comparing by instant", () => {
    // "2026-03-01T00:00:00+02:00" is 2026-02-28T22:00Z — EARLIER than the Z
    // value, even though it sorts later as a string. The range must compare
    // parsed instants, not text.
    const got = taughtDateCoverage([
      lesson({ id: "a", taughtAt: "2026-02-28T23:00:00Z" }),
      lesson({ id: "b", taughtAt: "2026-03-01T00:00:00+02:00" }),
      lesson({ id: "c" }),
    ]);
    expect(got).toEqual({
      state: "available",
      lessonCount: 3,
      value: {
        lessonsWithDate: 2,
        lessonsWithoutDate: 1,
        firstTaughtAt: "2026-03-01T00:00:00+02:00",
        lastTaughtAt: "2026-02-28T23:00:00Z",
      },
    });
  });
});

describe("unitInsights — the one-sweep aggregate", () => {
  const lessons = [
    lesson({
      id: "a",
      status: "done",
      assessment: { kind: "formative", title: "Exit" },
      durationMinutes: 45,
      builds: "place value",
      standards: ["5.NBT.1"],
    }),
    lesson({
      id: "b",
      assessment: { title: "Observation" },
      prep: "print grids",
      standards: ["5.NBT.1", "5.NF.2"],
    }),
    lesson({ id: "c", objective: "", resources: [], standards: [] }),
  ];

  it("matches the standalone functions exactly", () => {
    const all = unitInsights(lessons);
    expect(all.lessonCount).toBe(3);
    expect(all.assessments).toEqual(assessmentCoverage(lessons));
    expect(all.plannedTime).toEqual(plannedTime(lessons));
    expect(all.prep).toEqual(prepReadiness(lessons));
    expect(all.planningGaps).toEqual(planningGaps(lessons));
    expect(all.standards).toEqual(standardsSpread(lessons));
    expect(all.taughtDates).toEqual(taughtDateCoverage(lessons));
  });

  it("carries lessonCount on unavailable metrics too (so the UI can phrase it)", () => {
    const all = unitInsights([bare("a"), bare("b")]);
    expect(all.plannedTime).toEqual({
      state: "unavailable",
      lessonCount: 2,
      reason: "no_data",
    });
    expect(all.taughtDates.lessonCount).toBe(2);
  });

  it("is entirely unavailable for a unit with no lessons", () => {
    const all = unitInsights([]);
    expect(all.lessonCount).toBe(0);
    for (const metric of [
      all.assessments,
      all.plannedTime,
      all.prep,
      all.planningGaps,
      all.standards,
      all.taughtDates,
    ]) {
      expect(metric).toMatchObject({
        state: "unavailable",
        reason: "no_lessons",
      });
    }
  });

  it("excludes archived lessons from EVERY denominator", () => {
    // Soft-deleted rows are hidden on every surface; if they leaked in here
    // they would inflate lessonCount and drag every "N of M" down.
    const all = unitInsights([
      lesson({ id: "a", durationMinutes: 45 }),
      lesson({ id: "b", durationMinutes: 30, archived: true }),
      lesson({ id: "c", archived: true }),
    ]);
    expect(all.lessonCount).toBe(1);
    expect(all.plannedTime).toEqual({
      state: "available",
      lessonCount: 1,
      value: {
        totalMinutes: 45,
        lessonsWithDuration: 1,
        lessonsMissingDuration: 0,
        complete: true,
      },
    });
    expect(all.standards).toMatchObject({ lessonCount: 1 });
  });
});
