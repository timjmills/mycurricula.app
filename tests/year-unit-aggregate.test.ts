import { describe, it, expect } from "vitest";

import {
  unitResources,
  unitStandards,
  unitNotes,
} from "@/lib/year-unit-aggregate";
import type { Lesson, LessonResource, SubjectId } from "@/lib/types";

// CHARACTERIZATION tests — year-unit-aggregate.ts is load-bearing for the B1
// workspace (its Resources / Standards / Notes rollups) but shipped without a
// unit test. These lock its CURRENT behavior before B1 builds on it; they
// assert what the code does today, they do not propose changes.
//
// The helpers are pure + structural — they read only
// week/day/id/title/resources/standards/notes off a lesson — so the fixtures
// build just those fields and cast, matching tests/year-v2-data.test.ts and the
// rest of the node-env suite (no React, no store).

function res(type: LessonResource["type"], label: string): LessonResource {
  return { type, label };
}

function lesson(partial: {
  id: string;
  title?: string;
  week: number;
  day: number;
  subject?: SubjectId;
  unit?: string;
  resources?: LessonResource[];
  standards?: string[];
  notes?: string;
}): Lesson {
  return {
    subject: "math",
    unit: "u-m3",
    title: partial.id,
    resources: [],
    standards: [],
    notes: "",
    status: "not_done",
    ...partial,
  } as unknown as Lesson;
}

describe("unitResources — flatten + provenance", () => {
  it("emits every resource in week→day order, tagged with its lesson origin", () => {
    const rows: Lesson[] = [
      lesson({
        id: "b",
        title: "Second",
        week: 12,
        day: 0,
        resources: [res("slides", "Deck B")],
      }),
      lesson({
        id: "a",
        title: "First",
        week: 11,
        day: 2,
        resources: [res("pdf", "Sheet A1"), res("link", "Link A2")],
      }),
    ];
    const out = unitResources(rows);
    expect(
      out.map((r) => [r.resource.label, r.lessonId, r.week, r.day]),
    ).toEqual([
      ["Sheet A1", "a", 11, 2],
      ["Link A2", "a", 11, 2],
      ["Deck B", "b", 12, 0],
    ]);
    // Provenance carries the lesson title too.
    expect(out[0].lessonTitle).toBe("First");
  });

  it("does NOT de-duplicate a resource that recurs across lessons", () => {
    const rows: Lesson[] = [
      lesson({ id: "a", week: 11, day: 0, resources: [res("image", "Anchor chart")] }),
      lesson({ id: "b", week: 11, day: 1, resources: [res("image", "Anchor chart")] }),
    ];
    const out = unitResources(rows);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.lessonId)).toEqual(["a", "b"]);
  });

  it("contributes nothing for a lesson with no resources", () => {
    const rows: Lesson[] = [
      lesson({ id: "a", week: 11, day: 0, resources: [] }),
      lesson({ id: "b", week: 11, day: 1, resources: [res("doc", "Doc B")] }),
    ];
    expect(unitResources(rows).map((r) => r.lessonId)).toEqual(["b"]);
  });

  it("returns [] for no lessons", () => {
    expect(unitResources([])).toEqual([]);
  });

  it("does not mutate the caller's array (sorts a copy)", () => {
    const rows: Lesson[] = [
      lesson({ id: "b", week: 12, day: 0, resources: [res("slides", "B")] }),
      lesson({ id: "a", week: 11, day: 0, resources: [res("slides", "A")] }),
    ];
    const snapshot = rows.map((l) => l.id);
    unitResources(rows);
    expect(rows.map((l) => l.id)).toEqual(snapshot);
  });
});

describe("unitStandards — unique codes with lesson counts", () => {
  it("counts how many lessons tag each code and sorts by code", () => {
    const rows: Lesson[] = [
      lesson({ id: "a", week: 11, day: 0, standards: ["5.NBT.1", "5.OA.2"] }),
      lesson({ id: "b", week: 11, day: 1, standards: ["5.NBT.1"] }),
      lesson({ id: "c", week: 12, day: 0, standards: ["5.MD.3"] }),
    ];
    const out = unitStandards(rows);
    expect(out).toEqual([
      { code: "5.MD.3", lessonCount: 1 },
      { code: "5.NBT.1", lessonCount: 2 },
      { code: "5.OA.2", lessonCount: 1 },
    ]);
  });

  it("returns [] when no lesson tags a standard", () => {
    const rows: Lesson[] = [
      lesson({ id: "a", week: 11, day: 0, standards: [] }),
      lesson({ id: "b", week: 11, day: 1, standards: [] }),
    ];
    expect(unitStandards(rows)).toEqual([]);
  });

  it("sort is by code string, not insertion or frequency", () => {
    const rows: Lesson[] = [
      lesson({ id: "a", week: 11, day: 0, standards: ["W.5.3", "RL.5.1"] }),
      lesson({ id: "b", week: 11, day: 1, standards: ["RI.5.2"] }),
    ];
    expect(unitStandards(rows).map((s) => s.code)).toEqual([
      "RI.5.2",
      "RL.5.1",
      "W.5.3",
    ]);
  });
});

describe("unitNotes — non-empty teacher notes with provenance", () => {
  it("emits trimmed notes in week→day order, tagged with lesson origin", () => {
    const rows: Lesson[] = [
      lesson({ id: "b", title: "Second", week: 12, day: 0, notes: "  later note  " }),
      lesson({ id: "a", title: "First", week: 11, day: 3, notes: "earlier note" }),
    ];
    const out = unitNotes(rows);
    expect(out.map((n) => [n.text, n.lessonId, n.week, n.day])).toEqual([
      ["earlier note", "a", 11, 3],
      ["later note", "b", 12, 0],
    ]);
    expect(out[0].lessonTitle).toBe("First");
  });

  it("drops whitespace-only and empty notes", () => {
    const rows: Lesson[] = [
      lesson({ id: "a", week: 11, day: 0, notes: "   " }),
      lesson({ id: "b", week: 11, day: 1, notes: "" }),
      lesson({ id: "c", week: 11, day: 2, notes: "kept" }),
    ];
    expect(unitNotes(rows).map((n) => n.lessonId)).toEqual(["c"]);
  });

  it("returns [] for no lessons", () => {
    expect(unitNotes([])).toEqual([]);
  });

  it("does not mutate the caller's array (sorts a copy)", () => {
    const rows: Lesson[] = [
      lesson({ id: "b", week: 12, day: 0, notes: "b" }),
      lesson({ id: "a", week: 11, day: 0, notes: "a" }),
    ];
    const snapshot = rows.map((l) => l.id);
    unitNotes(rows);
    expect(rows.map((l) => l.id)).toEqual(snapshot);
  });
});
