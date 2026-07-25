// planner-completion-gate.test.ts — the "completion never forks" gate.
//
// CLAUDE.md §2 is unambiguous: marking a lesson done — or saying why it did not
// happen — must NEVER fork it. `updateLesson`'s content gate decides that, and
// `reasonNotDone` was missing from it, which broke the rule in two directions:
//
//   { status, reasonNotDone }  → the completion-only branch delegated to a
//     status-only writer that takes no reason, so the reason was SILENTLY
//     DROPPED.
//   { reasonNotDone } alone    → `hasContent` was false and `status` undefined,
//     so it fell past the gate to `forkAndPatch` with an EMPTY column mapper:
//     `ensurePersonalCopy` + `is_diverged_from_master: true`. A personal fork
//     with a "Modified" pill, conjured out of a teacher explaining an absence,
//     persisting no content change at all.
//
// The gate lives in the pure `lesson-track-b` leaf precisely so it is testable
// without the server-only Supabase module — the mock path handles reasonNotDone
// correctly, so a flag-OFF live pass would never have caught this.

import { describe, expect, it } from "vitest";
import {
  isCompletionOnlyPatch,
  patchHasContent,
} from "@/lib/planner/lesson-track-b";
import type { LessonPatch } from "@/lib/planner/source";

describe("isCompletionOnlyPatch — must be TRUE (never forks)", () => {
  it("status alone", () => {
    expect(isCompletionOnlyPatch({ status: "done" })).toBe(true);
  });

  it("reasonNotDone alone — the spurious-fork case", () => {
    expect(isCompletionOnlyPatch({ reasonNotDone: "fire drill" })).toBe(true);
  });

  it("status AND reasonNotDone together — the silent-drop case", () => {
    expect(
      isCompletionOnlyPatch({ status: "not_done", reasonNotDone: "assembly" }),
    ).toBe(true);
  });

  it("clearing a reason back to empty text", () => {
    expect(isCompletionOnlyPatch({ reasonNotDone: "" })).toBe(true);
  });
});

describe("isCompletionOnlyPatch — must be FALSE (content forks)", () => {
  it("an empty patch touches no completion at all", () => {
    expect(isCompletionOnlyPatch({})).toBe(false);
  });

  it("content alone", () => {
    expect(isCompletionOnlyPatch({ title: "New" })).toBe(false);
  });

  it("completion RIDING ALONG with content still forks", () => {
    // The content is what forks; the completion is written per-teacher either
    // way. Treating this as completion-only would drop the title.
    expect(isCompletionOnlyPatch({ status: "done", title: "New" })).toBe(false);
  });

  it("a Track-B field alone is content, not completion", () => {
    expect(
      isCompletionOnlyPatch({
        status: "done",
        assessment: { kind: "formative" },
      }),
    ).toBe(false);
  });

  it("a CLEARED Track-B field still counts as content", () => {
    // A clear is PRESENT-but-undefined, which a `!== undefined` scan misses.
    // Miscounting it as completion-only would drop the clear AND skip the fork.
    const cleared: LessonPatch = { status: "done", durationMinutes: undefined };
    expect(isCompletionOnlyPatch(cleared)).toBe(false);
  });
});

describe("patchHasContent — the fork trigger", () => {
  it("is false for completion-only patches", () => {
    expect(patchHasContent({ status: "done" })).toBe(false);
    expect(patchHasContent({ reasonNotDone: "assembly" })).toBe(false);
  });

  it("is true for every documented content key", () => {
    const keys: LessonPatch[] = [
      { title: "x" },
      { objective: "x" },
      { preview: "x" },
      { directions: "x" },
      { notes: "x" },
      { resources: [] },
      { standards: [] },
      { tasks: [] },
      { differentiation: { support: "", onLevel: "", extension: "" } },
      { durationMinutes: 45 },
      { assessment: { kind: "formative" } },
      { builds: "x" },
      { prep: "x" },
      { frameworkId: "pyp" },
      { frameworkData: {} },
      { carried: {} },
    ];
    for (const patch of keys) {
      expect(patchHasContent(patch), JSON.stringify(patch)).toBe(true);
    }
  });

  it("counts `time` as content even though no column exists for it", () => {
    // `time` is unmodelled: every write branch skips it, so a time-only patch
    // reaching updateLesson forks with an EMPTY payload. The gate keeps it as
    // content deliberately; the STORE is what must never send a time-only patch
    // (it keeps re-times reducer-local). Pinned so a future "cleanup" that drops
    // `time` from the key list doesn't quietly reroute it into the
    // completion-only branch instead.
    expect(patchHasContent({ time: "9:00–9:45" })).toBe(true);
  });

  it("does not accept taughtAt at all (read-only in B2)", () => {
    // `taughtAt` is not a member of LessonPatch — writing it would fork a
    // pristine master, breaking completion-never-forks — so the type itself is
    // the guard. Cast past it to prove the runtime gate agrees: an unknown key
    // is not content, so it can never trigger a fork on its own.
    const notInPatch = {
      taughtAt: "2026-07-24T00:00:00.000Z",
    } as unknown as LessonPatch;
    expect(patchHasContent(notInPatch)).toBe(false);
  });
});
