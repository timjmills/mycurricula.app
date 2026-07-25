// write-failure-signal.test.ts — the two decisions behind "your write didn't save".
//
// Both were previously buried in callbacks with NO coverage, in the diff whose
// whole purpose is making silent failures visible. They are now pure exported
// functions, and this pins them:
//
//   buildWriteFailure   — speak at all? and was this a definite FAILURE or an
//                         unknowable TIMEOUT?
//   writeFailureMessage — the sentence. Its second half was factually INVERTED
//                         for two of six verbs before review: a failed archive
//                         means the lesson COMES BACK on reload, not that it
//                         "will be gone".

import { describe, expect, it } from "vitest";
import { buildWriteFailure } from "@/lib/planner-store";
import { SerialWriteTimeoutError } from "@/lib/planner/serial-write-queue";
import { writeFailureMessage } from "@/components/shell/write-failure-bridge";

describe("buildWriteFailure — speak, or stay quiet", () => {
  it("returns null when the failure is inconsequential", () => {
    // A newer queued payload covers this one; saying "your work was lost" while
    // the queue is busy saving it is the failure mode here.
    expect(
      buildWriteFailure(1, "updateLesson", "team", new Error("denied"), true),
    ).toBeNull();
  });

  it("returns a signal when nothing supersedes it", () => {
    const f = buildWriteFailure(
      7,
      "updateLesson",
      "team",
      new Error("permission denied"),
      false,
    );
    expect(f).not.toBeNull();
    expect(f?.id).toBe(7);
    expect(f?.op).toBe("updateLesson");
    expect(f?.scope).toBe("team");
    expect(f?.message).toBe("permission denied");
  });

  it("classifies a SerialWriteTimeoutError as a TIMEOUT, not a failure", () => {
    // The queue distinguishes "did not land" from "we stopped waiting and it
    // may still commit". Collapsing them one layer later would discard it.
    const f = buildWriteFailure(
      1,
      "updateLesson",
      "personal",
      new SerialWriteTimeoutError("l1::personal::f:title", 20_000),
      false,
    );
    expect(f?.kind).toBe("timeout");
  });

  it("classifies anything else as a definite failure", () => {
    expect(
      buildWriteFailure(1, "move", "personal", new Error("RLS denied"), false)
        ?.kind,
    ).toBe("failed");
  });

  it("falls back to a plain message for a non-Error rejection", () => {
    const f = buildWriteFailure(1, "move", "personal", "just a string", false);
    expect(f?.message).toBe("The change could not be saved.");
  });
});

describe("writeFailureMessage — what the teacher will actually see", () => {
  const sig = (over: Partial<Parameters<typeof writeFailureMessage>[0]> = {}) =>
    ({
      id: 1,
      kind: "failed" as const,
      op: "updateLesson",
      scope: "personal" as const,
      message: "boom",
      ...over,
    }) as Parameters<typeof writeFailureMessage>[0];

  it("an edit disappears on reload", () => {
    const m = writeFailureMessage(sig(), 0);
    expect(m).toContain("lesson edit");
    expect(m).toContain("it will be gone if you reload");
  });

  it("a failed ARCHIVE says the lesson COMES BACK — not that it vanishes", () => {
    // The lesson was already removed optimistically and the row still exists
    // server-side. "It's still on screen, but it will be gone if you reload"
    // was false in BOTH clauses.
    const m = writeFailureMessage(sig({ op: "archive" }), 0);
    expect(m).toContain("come back if you reload");
    expect(m).not.toContain("will be gone");
    expect(m).not.toContain("still on screen");
  });

  it("a failed MOVE says the lesson returns to its old slot", () => {
    const m = writeFailureMessage(sig({ op: "move" }), 0);
    expect(m).toContain("go back to where it was");
    expect(m).not.toContain("will be gone");
  });

  it("a failed UNARCHIVE says the lesson gets hidden again", () => {
    const m = writeFailureMessage(sig({ op: "unarchive" }), 0);
    expect(m).toContain("hidden again");
  });

  it("names the TEAM scope, because that is the consequence-carrying word", () => {
    const m = writeFailureMessage(sig({ scope: "team" }), 0);
    expect(m).toContain("for the Team Curriculum");
  });

  it("says nothing about scope for a personal write", () => {
    expect(writeFailureMessage(sig({ scope: "personal" }), 0)).not.toContain(
      "Team Curriculum",
    );
  });

  it("a TIMEOUT predicts nothing about a reload", () => {
    // The request was abandoned, not cancelled — it may still commit, and the
    // edit at risk is the NEWER one. Any prediction would invent a certainty.
    const m = writeFailureMessage(sig({ kind: "timeout" }), 0);
    expect(m).toContain("may or may not have gone through");
    expect(m).not.toContain("will be gone");
    expect(m).not.toContain("come back");
    expect(m).not.toContain("didn’t save");
  });

  it("admits how many other failures it is standing in for", () => {
    // A multi-field save that is denied fails once per lane; React batches them
    // and one toast survives. Showing one is right; speaking for six silently
    // is not.
    expect(writeFailureMessage(sig(), 5)).toContain("and 5 other changes");
    expect(writeFailureMessage(sig(), 1)).toContain("and 1 other change");
  });

  it("says nothing about others when there are none", () => {
    expect(writeFailureMessage(sig(), 0)).not.toContain("other change");
  });

  it("still produces a usable sentence for an unknown verb", () => {
    const m = writeFailureMessage(sig({ op: "somethingNew" }), 0);
    expect(m).toContain("Your change");
    expect(m).toContain("Reload to see what the server actually has.");
  });
});
