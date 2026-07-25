// planner-mock-move.test.ts — the mock source's move-flag derivation.
//
// `Lesson.moved` drives the three-tier card signal CLAUDE.md §2 defines: a
// personally-MOVED lesson gets a move-arrow icon, ⤴ across weeks vs ↔ within
// one. The mock derived it AFTER assigning `lesson.week = target.week`, so the
// `target.week !== lesson.week` test compared the target against itself and was
// always false: EVERY cross-week move on the flag-OFF path (the shipped default)
// was labelled "same-week" and drew the wrong arrow. Supabase's `deriveMoved` is
// correct, so this was a mock/Supabase divergence with no coverage on either
// side of it.
//
// ORDER-COUPLED BY DESIGN: `plannerMockSource` mutates one module-level document
// with no reset hook, so each case below picks its own lesson and asserts only
// on that lesson — never on a shared starting slot.

import { describe, expect, it } from "vitest";
import { plannerMockSource } from "@/lib/planner/mock-source";
import type { Lesson } from "@/lib/types";

const GRADE = "g5";
const OWNER = "teacher-1";

async function lessonAt(offset: number): Promise<Lesson> {
  const lessons = await plannerMockSource.listLessons(GRADE, OWNER);
  const lesson = lessons[offset] ?? lessons[0];
  expect(lesson).toBeDefined();
  return lesson;
}

describe("mock source — moveLesson `moved` flag", () => {
  it("labels a WEEK change 'across-weeks'", async () => {
    const before = await lessonAt(20);
    const moved = await plannerMockSource.moveLesson(
      before.id,
      { week: before.week + 2, day: before.day },
      OWNER,
    );
    // The regression: this read "same-week" for every cross-week move.
    expect(moved.moved).toBe("across-weeks");
    expect(moved.week).toBe(before.week + 2);
    expect(moved.day).toBe(before.day);
  });

  it("labels a DAY-ONLY change 'same-week'", async () => {
    const before = await lessonAt(21);
    const moved = await plannerMockSource.moveLesson(
      before.id,
      { week: before.week, day: before.day === 0 ? 1 : 0 },
      OWNER,
    );
    expect(moved.moved).toBe("same-week");
    expect(moved.week).toBe(before.week);
  });

  it("labels 'across-weeks' when BOTH week and day change", async () => {
    const before = await lessonAt(22);
    const moved = await plannerMockSource.moveLesson(
      before.id,
      { week: before.week + 1, day: before.day === 0 ? 2 : 0 },
      OWNER,
    );
    expect(moved.moved).toBe("across-weeks");
  });

  it("leaves the flag untouched for a no-op move to the SAME slot", async () => {
    const before = await lessonAt(23);
    const moved = await plannerMockSource.moveLesson(
      before.id,
      { week: before.week, day: before.day },
      OWNER,
    );
    // A drag that lands back where it started must not mint a "moved" badge.
    expect(moved.moved).toBe(before.moved);
  });

  it("persists the new slot for a follow-up read", async () => {
    const before = await lessonAt(24);
    const targetWeek = before.week + 3;
    await plannerMockSource.moveLesson(
      before.id,
      { week: targetWeek, day: before.day },
      OWNER,
    );
    const after = await plannerMockSource.listLessons(GRADE, OWNER);
    const found = after.find((l) => l.id === before.id);
    expect(found?.week).toBe(targetWeek);
    expect(found?.moved).toBe("across-weeks");
  });
});

describe("mock source — unarchiveLesson (the archive Undo's write)", () => {
  it("round-trips archive → unarchive", async () => {
    const target = await lessonAt(25);
    // `listLessons` excludes archived lessons (plan §4.3), so disappearing from
    // the list IS the archive, and reappearing IS the restore.
    await plannerMockSource.softDeleteLesson(target.id, OWNER);
    let all = await plannerMockSource.listLessons(GRADE, OWNER);
    expect(all.find((l) => l.id === target.id)).toBeUndefined();

    await plannerMockSource.unarchiveLesson(target.id, OWNER);
    all = await plannerMockSource.listLessons(GRADE, OWNER);
    // Without this verb the Undo toast affirmed a restore that never committed.
    expect(all.find((l) => l.id === target.id)?.archived).toBe(false);
  });

  it("is idempotent on a lesson that was never archived", async () => {
    const target = await lessonAt(26);
    await expect(
      plannerMockSource.unarchiveLesson(target.id, OWNER),
    ).resolves.toBeUndefined();
  });

  it("is a no-op (never a throw) for an unknown lesson id", async () => {
    // Mirrors softDeleteLesson's documented idempotence.
    await expect(
      plannerMockSource.unarchiveLesson("no-such-lesson", OWNER),
    ).resolves.toBeUndefined();
  });
});
