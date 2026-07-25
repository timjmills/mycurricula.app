// planner-doc-replay.test.ts — the pure diff behind undo/redo persistence.
//
// WHY THIS MATTERS. Six planner mutators (undo, redo, bumpLesson,
// relocateLesson, unarchiveLesson, restoreLesson) changed the document and wrote
// nothing. ⌘Z rewound the reducer only: the toast confirmed an undo that came
// back on reload, and in Team mode the value the teacher had just taken back
// stayed shared with the whole team. `diffLessonsForReplay` is what makes those
// writes real, so a regression here silently re-opens that whole class of bug.
//
// The diff is pure, so every case below is exact — no provider, no clock, no
// network. What it CANNOT express (a lesson appearing or vanishing) must be
// reported as `unpersistable`, never skipped: a change we cannot write must not
// look like one we did.

import { describe, expect, it } from "vitest";
import { diffLessonsForReplay } from "@/lib/planner/doc-replay";
import type { Lesson } from "@/lib/types";

function lesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: "l1",
    subject: "math",
    unit: "u-m3",
    title: "Fractions",
    objective: "I can add fractions",
    preview: "",
    directions: "",
    notes: "",
    resources: [],
    standards: [],
    week: 11,
    day: 0,
    isPersonal: false,
    pendingMaster: false,
    reasonNotDone: "",
    modified: false,
    moved: null,
    status: "not_done",
    commentCount: 0,
    unreadComments: 0,
    tasks: [],
    ...over,
  };
}

describe("diffLessonsForReplay — nothing to write", () => {
  it("emits no ops for an identical document", () => {
    const a = [lesson()];
    expect(diffLessonsForReplay(a, a)).toEqual([]);
  });

  it("emits no ops when the lesson objects differ by reference only", () => {
    // The reducer rebuilds lessons by spread on every edit, so reference
    // inequality is the norm — a diff keyed on identity would re-send the whole
    // document on every undo.
    expect(diffLessonsForReplay([lesson()], [lesson()])).toEqual([]);
  });

  it("treats a structurally equal array/object field as unchanged", () => {
    const res = [{ type: "link" as const, label: "x", url: "https://a.test" }];
    const before = [lesson({ resources: res })];
    const after = [
      lesson({
        resources: [
          { type: "link" as const, label: "x", url: "https://a.test" },
        ],
      }),
    ];
    expect(diffLessonsForReplay(before, after)).toEqual([]);
  });
});

describe("diffLessonsForReplay — slot, completion, content", () => {
  it("emits a move carrying the RESOLVED final slot", () => {
    // Never a partial: a bare { day } lets the omitted week default to 0
    // server-side and the lesson vanishes on reload.
    const ops = diffLessonsForReplay(
      [lesson({ week: 11, day: 0 })],
      [lesson({ week: 12, day: 3 })],
    );
    expect(ops).toEqual([{ kind: "move", lessonId: "l1", week: 12, day: 3 }]);
  });

  it("emits a move for a day-only change", () => {
    const ops = diffLessonsForReplay([lesson({ day: 0 })], [lesson({ day: 2 })]);
    expect(ops).toEqual([{ kind: "move", lessonId: "l1", week: 11, day: 2 }]);
  });

  it("emits a completion op, never a content patch, for a status change", () => {
    // CLAUDE.md §2: completion must never fork. The op carries BOTH completion
    // fields even though only one moved — they are one row, written
    // read-modify-write, so sending them separately loses one of them.
    const ops = diffLessonsForReplay(
      [lesson({ status: "not_done" })],
      [lesson({ status: "done" })],
    );
    expect(ops).toEqual([
      { kind: "completion", lessonId: "l1", status: "done", reasonNotDone: "" },
    ]);
  });

  it("emits a completion op when only the REASON moved", () => {
    const ops = diffLessonsForReplay(
      [lesson({ reasonNotDone: "" })],
      [lesson({ reasonNotDone: "assembly" })],
    );
    expect(ops).toEqual([
      {
        kind: "completion",
        lessonId: "l1",
        status: "not_done",
        reasonNotDone: "assembly",
      },
    ]);
  });

  it("emits ONE completion op when both fields moved together", () => {
    // Two ops would be two requests racing on one row.
    const ops = diffLessonsForReplay(
      [lesson({ status: "not_done", reasonNotDone: "" })],
      [lesson({ status: "done", reasonNotDone: "caught up" })],
    );
    expect(ops).toEqual([
      {
        kind: "completion",
        lessonId: "l1",
        status: "done",
        reasonNotDone: "caught up",
      },
    ]);
  });

  it("emits a patch holding ONLY the changed content keys", () => {
    const ops = diffLessonsForReplay(
      [lesson({ title: "Old", notes: "keep" })],
      [lesson({ title: "New", notes: "keep" })],
    );
    expect(ops).toEqual([
      { kind: "patch", lessonId: "l1", patch: { title: "New" } },
    ]);
  });

  it("carries standardIds alongside a standards change so the two agree", () => {
    const ops = diffLessonsForReplay(
      [lesson({ standards: ["5.NF.A.1"], standardIds: ["id-1"] })],
      [lesson({ standards: ["5.NF.A.2"], standardIds: ["id-2"] })],
    );
    expect(ops).toEqual([
      {
        kind: "patch",
        lessonId: "l1",
        patch: { standards: ["5.NF.A.2"], standardIds: ["id-2"] },
      },
    ]);
  });

  it("detects an IDS-ONLY remap, where the codes never move", () => {
    // Codes are unique only PER framework ("S1" exists in AERO and WIDA), so
    // re-pointing a tag at a different framework's standard changes the uuids
    // and nothing else. Diffing `standards` alone sees no change at all and the
    // undo sends nothing — the server keeps the old ids after reload.
    const ops = diffLessonsForReplay(
      [lesson({ standards: ["S1"], standardIds: ["aero-uuid"] })],
      [lesson({ standards: ["S1"], standardIds: ["wida-uuid"] })],
    );
    expect(ops).toEqual([
      {
        kind: "patch",
        lessonId: "l1",
        patch: { standards: ["S1"], standardIds: ["wida-uuid"] },
      },
    ]);
  });

  it("emits both standards fields even when only the codes moved", () => {
    const ops = diffLessonsForReplay(
      [lesson({ standards: ["A"], standardIds: ["i1"] })],
      [lesson({ standards: ["B"], standardIds: ["i1"] })],
    );
    expect(ops).toEqual([
      {
        kind: "patch",
        lessonId: "l1",
        patch: { standards: ["B"], standardIds: ["i1"] },
      },
    ]);
  });

  it("emits nothing when neither standards field moved", () => {
    const ops = diffLessonsForReplay(
      [lesson({ standards: ["A"], standardIds: ["i1"] })],
      [lesson({ standards: ["A"], standardIds: ["i1"] })],
    );
    expect(ops).toEqual([]);
  });

});

describe("diffLessonsForReplay — keys that must NEVER be written", () => {
  it("ignores the derived fork signals", () => {
    // modified / isPersonal / moved / pendingMaster are derived from
    // `is_diverged_from_master`, not columns a client may set. Writing them
    // would paint a fork that does not exist.
    const ops = diffLessonsForReplay(
      [lesson({ modified: false, isPersonal: false, moved: null })],
      [
        lesson({
          modified: true,
          isPersonal: true,
          moved: "across-weeks",
          pendingMaster: true,
        }),
      ],
    );
    expect(ops).toEqual([]);
  });

  it("ignores `time` — a content key with no column that would fork empty", () => {
    const ops = diffLessonsForReplay(
      [lesson({ time: "8:00–8:45" })],
      [lesson({ time: "9:00–9:45" })],
    );
    expect(ops).toEqual([]);
  });

  it("ignores derived/read-only fields (preview, taughtAt, comment counts)", () => {
    const ops = diffLessonsForReplay(
      [lesson()],
      [
        lesson({
          preview: "new preview",
          taughtAt: "2026-07-24T00:00:00.000Z",
          commentCount: 3,
          unreadComments: 1,
        }),
      ],
    );
    expect(ops).toEqual([]);
  });
});

describe("diffLessonsForReplay — archive ordering", () => {
  it("emits unarchive BEFORE the edits that follow it", () => {
    // Restoring then editing is coherent; editing a row the teacher still has
    // archived is not.
    const ops = diffLessonsForReplay(
      [lesson({ archived: true, title: "Old" })],
      [lesson({ archived: false, title: "New" })],
    );
    expect(ops).toEqual([
      { kind: "unarchive", lessonId: "l1" },
      { kind: "patch", lessonId: "l1", patch: { title: "New" } },
    ]);
  });

  it("emits archive LAST, after the edits it hides", () => {
    const ops = diffLessonsForReplay(
      [lesson({ archived: false, title: "Old" })],
      [lesson({ archived: true, title: "New" })],
    );
    expect(ops).toEqual([
      { kind: "patch", lessonId: "l1", patch: { title: "New" } },
      { kind: "archive", lessonId: "l1" },
    ]);
  });

  it("treats absent `archived` and false as the same state", () => {
    const ops = diffLessonsForReplay(
      [lesson({ archived: undefined })],
      [lesson({ archived: false })],
    );
    expect(ops).toEqual([]);
  });
});

describe("diffLessonsForReplay — what it cannot express", () => {
  it("reports an ADDED lesson rather than silently skipping it", () => {
    const ops = diffLessonsForReplay(
      [lesson({ id: "a" })],
      [lesson({ id: "a" }), lesson({ id: "b" })],
    );
    expect(ops).toEqual([
      { kind: "unpersistable", lessonId: "b", reason: "lesson-added" },
    ]);
  });

  it("reports a REMOVED lesson rather than guessing softDeleteLesson", () => {
    // softDeleteLesson ARCHIVES (the lesson stays, hidden); it does not remove a
    // row. Emitting it here would persist a state the document does not describe.
    const ops = diffLessonsForReplay(
      [lesson({ id: "a" }), lesson({ id: "b" })],
      [lesson({ id: "a" })],
    );
    expect(ops).toEqual([
      { kind: "unpersistable", lessonId: "b", reason: "lesson-removed" },
    ]);
  });
});

describe("diffLessonsForReplay — a realistic undo", () => {
  it("reverses a move + retitle in one pass", () => {
    // The exact shape of ⌘Z after a drag and a rename: the diff runs from the
    // CURRENT doc back to the restored one, so the ops carry the OLD values.
    const edited = [lesson({ week: 12, day: 3, title: "New" })];
    const restored = [lesson({ week: 11, day: 0, title: "Old" })];
    expect(diffLessonsForReplay(edited, restored)).toEqual([
      { kind: "move", lessonId: "l1", week: 11, day: 0 },
      { kind: "patch", lessonId: "l1", patch: { title: "Old" } },
    ]);
  });

  it("scopes ops per lesson and follows the next document's order", () => {
    const before = [
      lesson({ id: "a", title: "A" }),
      lesson({ id: "b", week: 11 }),
    ];
    const after = [
      lesson({ id: "a", title: "A2" }),
      lesson({ id: "b", week: 13 }),
    ];
    expect(diffLessonsForReplay(before, after)).toEqual([
      { kind: "patch", lessonId: "a", patch: { title: "A2" } },
      { kind: "move", lessonId: "b", week: 13, day: 0 },
    ]);
  });
});

// ── Write-lane derivation ─────────────────────────────────────────────────
// The serial queue only orders writes that share a LANE. While the lane came
// from the caller's coalesce key, a direct editor write (`lesson:<id>:title`)
// and the undo reversing it (`replay::title`) sat in DIFFERENT lanes — both
// could be in flight for the same column at once, and a late-committing "New"
// would overwrite the "Old" the teacher had just undone. Deriving the lane from
// the patch itself is what makes "an edit and its undo can never race" true.

import { splitPatchByField } from "@/lib/planner-store";

describe("splitPatchByField — one lane per column", () => {
  it("gives a single-field patch one group named for the field", () => {
    expect(splitPatchByField({ title: "New" })).toEqual([
      ["title", { title: "New" }],
    ]);
  });

  it("splits a multi-field patch so each column gets its own lane", () => {
    // Keying by the field COMBINATION instead would put `{title}` and
    // `{title, notes}` in different lanes and re-open the same race on `title`.
    expect(splitPatchByField({ title: "T", notes: "N" })).toEqual([
      ["notes", { notes: "N" }],
      ["title", { title: "T" }],
    ]);
  });

  it("keeps standards + standardIds together in ONE group", () => {
    // They are index-aligned (same position = same standard). Split across two
    // lanes they can commit out of order and end up disagreeing.
    expect(
      splitPatchByField({ standards: ["5.NF.A.1"], standardIds: ["id-1"] }),
    ).toEqual([["standards", { standards: ["5.NF.A.1"], standardIds: ["id-1"] }]]);
  });

  it("groups standards with standardIds while other fields stay separate", () => {
    expect(
      splitPatchByField({ title: "T", standards: ["A"], standardIds: ["i"] }),
    ).toEqual([
      ["standards", { standards: ["A"], standardIds: ["i"] }],
      ["title", { title: "T" }],
    ]);
  });

  it("preserves a present-but-undefined value (the editor's CLEAR path)", () => {
    // Dropping the key here would turn a clear into a no-op.
    const [[group, patch]] = splitPatchByField({ durationMinutes: undefined });
    expect(group).toBe("durationMinutes");
    expect("durationMinutes" in patch).toBe(true);
    expect(patch.durationMinutes).toBeUndefined();
  });

  it("keeps status + reasonNotDone in ONE completion group", () => {
    // They are one row, written read-modify-write by the source. On separate
    // lanes two concurrent requests each read the same prior row and each writes
    // the OTHER field's stale value back — silently reverting one of them.
    expect(
      splitPatchByField({ status: "done", reasonNotDone: "caught up" }),
    ).toEqual([
      ["completion", { status: "done", reasonNotDone: "caught up" }],
    ]);
  });

  it("puts a status-only patch on the SAME lane as a status+reason patch", () => {
    // The direct toggle sends { status }; a replayed undo sends both. Different
    // lanes would let them commit concurrently on one row.
    const direct = splitPatchByField({ status: "done" }).map(([g]) => g);
    const replayed = splitPatchByField({
      status: "not_done",
      reasonNotDone: "assembly",
    }).map(([g]) => g);
    expect(direct).toEqual(["completion"]);
    expect(replayed).toEqual(["completion"]);
  });

  it("separates completion from content in the same patch", () => {
    expect(splitPatchByField({ title: "T", status: "done" })).toEqual([
      ["completion", { status: "done" }],
      ["title", { title: "T" }],
    ]);
  });

  it("returns no groups for an empty patch", () => {
    expect(splitPatchByField({})).toEqual([]);
  });

  it("is deterministic in order", () => {
    const a = splitPatchByField({ notes: "n", title: "t", prep: "p" });
    const b = splitPatchByField({ prep: "p", title: "t", notes: "n" });
    expect(a).toEqual(b);
  });

  it("an edit and the undo reversing it land in the SAME lane", () => {
    // The end-to-end property the fix exists for: whatever produced the patch,
    // one column means one lane.
    const direct = splitPatchByField({ title: "New" }).map(([g]) => g);
    const undone = splitPatchByField({ title: "Old" }).map(([g]) => g);
    expect(direct).toEqual(undone);
  });
});
