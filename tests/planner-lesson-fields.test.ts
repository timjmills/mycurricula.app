// planner-lesson-fields.test.ts — the B2 lesson-edit SEAM on the in-memory mock
// source (lib/planner/mock-source.ts). Pins that updateLesson patches the live
// lesson with the Track-B rich fields (duration, assessment, builds/prep,
// framework data/id, carried), returns the merged lesson, that a follow-up
// listLessons reflects the edit (a real backend within a session), that an
// absent field is never nulled, and that returned nested objects are cloned so a
// caller mutation never leaks into the store. The Supabase source's column
// mapping is covered by tests/planner-lesson-track-b.test.ts (the pure mappers)
// + tests/track-b-workspace-fields.test.ts (the read/write column locks); this
// covers the mock runtime write path (flag-OFF, the shipped default).

import { describe, expect, it } from "vitest";
import { plannerMockSource } from "@/lib/planner/mock-source";

const GRADE = "g5";
const OWNER = "teacher-1";

async function firstLessonId(offset = 0): Promise<string> {
  const lessons = await plannerMockSource.listLessons(GRADE, OWNER);
  const lesson = lessons[offset] ?? lessons[0];
  expect(lesson).toBeDefined();
  return lesson.id;
}

describe("mock source — updateLesson Track-B rich fields (B2)", () => {
  it("returns the patched lesson with every Track-B field set", async () => {
    const id = await firstLessonId(0);
    const updated = await plannerMockSource.updateLesson(
      id,
      {
        durationMinutes: 45,
        assessment: {
          kind: "formative",
          title: "Exit ticket",
          purpose: "fluency",
          notes: "3 problems",
        },
        builds: "prior fractions work",
        prep: "print number lines",
        frameworkId: "pyp",
        frameworkData: { line_of_inquiry: "equivalence" },
        carried: { legacy: "kept" },
      },
      OWNER,
    );
    expect(updated.id).toBe(id);
    expect(updated.durationMinutes).toBe(45);
    expect(updated.assessment).toEqual({
      kind: "formative",
      title: "Exit ticket",
      purpose: "fluency",
      notes: "3 problems",
    });
    expect(updated.builds).toBe("prior fractions work");
    expect(updated.prep).toBe("print number lines");
    expect(updated.frameworkId).toBe("pyp");
    expect(updated.frameworkData).toEqual({ line_of_inquiry: "equivalence" });
    expect(updated.carried).toEqual({ legacy: "kept" });
  });

  it("persists across a follow-up listLessons (a backend within the session)", async () => {
    const id = await firstLessonId(1);
    await plannerMockSource.updateLesson(
      id,
      { durationMinutes: 60, assessment: { kind: "summative", title: "Test" } },
      OWNER,
    );
    const after = await plannerMockSource.listLessons(GRADE, OWNER);
    const reread = after.find((l) => l.id === id);
    expect(reread?.durationMinutes).toBe(60);
    expect(reread?.assessment?.kind).toBe("summative");
    expect(reread?.assessment?.title).toBe("Test");
  });

  it("a patch touching one Track-B field never nulls the others (per-field merge)", async () => {
    const id = await firstLessonId(2);
    await plannerMockSource.updateLesson(
      id,
      { builds: "keep me", durationMinutes: 30 },
      OWNER,
    );
    // A second patch touching ONLY prep must leave builds + duration intact.
    const updated = await plannerMockSource.updateLesson(
      id,
      { prep: "only prep changed" },
      OWNER,
    );
    expect(updated.builds).toBe("keep me");
    expect(updated.durationMinutes).toBe(30);
    expect(updated.prep).toBe("only prep changed");
  });

  it("returned nested objects are cloned — a caller mutation never leaks into the store", async () => {
    const id = await firstLessonId(3);
    const updated = await plannerMockSource.updateLesson(
      id,
      { assessment: { kind: "formative", title: "original" } },
      OWNER,
    );
    // Mutate the returned assessment; the store must be unaffected.
    if (updated.assessment) updated.assessment.title = "leaked";
    const after = await plannerMockSource.listLessons(GRADE, OWNER);
    const reread = after.find((l) => l.id === id);
    expect(reread?.assessment?.title).toBe("original");
  });

  it("throws for an unknown lesson id", async () => {
    await expect(
      plannerMockSource.updateLesson("no-such-lesson", { builds: "x" }, OWNER),
    ).rejects.toThrow(/Lesson not found/);
  });

  it("clearing duration (present-but-undefined) removes it on the round-trip (§4a HIGH-2)", async () => {
    const id = await firstLessonId(0);
    await plannerMockSource.updateLesson(id, { durationMinutes: 50 }, OWNER);
    const cleared = await plannerMockSource.updateLesson(
      id,
      { durationMinutes: undefined },
      OWNER,
    );
    expect(cleared.durationMinutes).toBeUndefined();
    const after = await plannerMockSource.listLessons(GRADE, OWNER);
    expect(after.find((l) => l.id === id)?.durationMinutes).toBeUndefined();
  });

  it("picking None on an assessment clears it (empty-object patch) — §4a MED", async () => {
    const id = await firstLessonId(1);
    await plannerMockSource.updateLesson(
      id,
      { assessment: { kind: "formative", title: "temp" } },
      OWNER,
    );
    // The editor's "None" handler sends an empty-object assessment.
    const cleared = await plannerMockSource.updateLesson(
      id,
      { assessment: {} },
      OWNER,
    );
    expect(cleared.assessment?.kind).toBeUndefined();
    expect(cleared.assessment?.title).toBeUndefined();
  });
});
