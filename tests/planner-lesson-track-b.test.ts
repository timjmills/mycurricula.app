// planner-lesson-track-b.test.ts — the PURE Track-B lesson-field mappers (B2).
// These functions are the read/write heart of B2: `lessonTrackBColumns` is the
// SOLE validity gate for the deliberately un-CHECKed `assessment_kind` column
// (a mistyped kind must never reach the DB), and it is the ONE mapper every
// updateLesson write branch applies (fork-per-field parity). `assessmentFromRow`
// is its read inverse. Tested here directly — the supabase source that calls
// them is server-only (awaits cookies()) and can't be imported into a unit test.

import { describe, expect, it } from "vitest";
import {
  assessmentFromRow,
  lessonTrackBColumns,
} from "@/lib/planner/lesson-track-b";
import type { LessonPatch } from "@/lib/planner/source";

describe("lessonTrackBColumns — write mapping + assessment-kind validation", () => {
  it("emits ONLY the keys present in the patch (an unrelated edit clears nothing)", () => {
    // A title-only edit (no Track-B keys) produces an empty Track-B column set,
    // so Object.assign into the branch `next` touches no Track-B column.
    const cols = lessonTrackBColumns({ title: "Just the title" });
    expect(Object.keys(cols)).toHaveLength(0);
  });

  it("maps the scalar rich fields to their snake_case columns", () => {
    const cols = lessonTrackBColumns({
      durationMinutes: 45,
      builds: "prior fractions work",
      prep: "print number lines",
      frameworkId: "pyp",
      frameworkData: { line_of_inquiry: "equivalence" },
      carried: { legacy: "kept" },
    });
    expect(cols.duration_minutes).toBe(45);
    expect(cols.builds).toBe("prior fractions work");
    expect(cols.prep).toBe("print number lines");
    expect(cols.fw_id).toBe("pyp");
    expect(cols.fw_data).toEqual({ line_of_inquiry: "equivalence" });
    expect(cols.carried).toEqual({ legacy: "kept" });
  });

  it("keeps a VALID assessment kind and flattens the four columns together", () => {
    const cols = lessonTrackBColumns({
      assessment: {
        kind: "formative",
        title: "Exit ticket",
        purpose: "fluency check",
        notes: "3 problems",
      },
    });
    expect(cols.assessment_kind).toBe("formative");
    expect(cols.assessment_title).toBe("Exit ticket");
    expect(cols.assessment_purpose).toBe("fluency check");
    expect(cols.assessment_notes).toBe("3 problems");
  });

  it("DROPS an invalid assessment kind to null while keeping the other fields (sole validity gate)", () => {
    const cols = lessonTrackBColumns({
      // A caller/legacy value the narrow union rejects — must not reach the DB.
      assessment: { kind: "quiz" as never, title: "Unit test" },
    });
    expect(cols.assessment_kind).toBeNull();
    // The rest of the assessment still persists (the guard drops only `kind`).
    expect(cols.assessment_title).toBe("Unit test");
  });

  it("clears the assessment columns to null on an empty-object patch (None selected)", () => {
    const cols = lessonTrackBColumns({ assessment: {} });
    expect(cols.assessment_kind).toBeNull();
    expect(cols.assessment_title).toBeNull();
    expect(cols.assessment_purpose).toBeNull();
    expect(cols.assessment_notes).toBeNull();
  });

  it("persists an empty-string scalar as-is (a real value, not a clear)", () => {
    const patch: LessonPatch = { builds: "", frameworkId: "" };
    const cols = lessonTrackBColumns(patch);
    expect(cols.builds).toBe("");
    expect(cols.fw_id).toBe("");
  });

  it("CLEARS a present-but-undefined scalar to null (§4a HIGH-2 — the editor's clear path)", () => {
    // Emptying the Duration field sends { durationMinutes: undefined } — the KEY
    // is PRESENT. Key-presence semantics must emit duration_minutes: null (clear
    // the column), NOT skip it — skipping would leave the stale DB value AND, in
    // personal mode, spurious-fork on an otherwise-empty patch.
    const cols = lessonTrackBColumns({ durationMinutes: undefined });
    expect("duration_minutes" in cols).toBe(true);
    expect(cols.duration_minutes).toBeNull();
    expect(Object.keys(cols)).toHaveLength(1);
  });

  it("leaves a column ABSENT from the patch untouched (no key emitted)", () => {
    // An unrelated edit (builds only) must not emit any other Track-B column, so
    // it can never clear a field the teacher didn't touch.
    const cols = lessonTrackBColumns({ builds: "x" });
    expect("duration_minutes" in cols).toBe(false);
    expect("assessment_kind" in cols).toBe(false);
    expect("prep" in cols).toBe(false);
    expect("fw_id" in cols).toBe(false);
  });

  it("preserves an ARRAY carried value (the column permits object OR array)", () => {
    const cols = lessonTrackBColumns({ carried: [{ orphan: 1 }, "note"] });
    expect(Array.isArray(cols.carried)).toBe(true);
    expect(cols.carried).toEqual([{ orphan: 1 }, "note"]);
  });

  it("NEVER emits taught_at (read-only in B2 — writing it would fork a pristine master)", () => {
    // taughtAt is not even a key on LessonPatch, but assert the mapper output
    // carries no taught_at under any Track-B patch.
    const cols = lessonTrackBColumns({
      durationMinutes: 30,
      assessment: { kind: "summative" },
    });
    expect("taught_at" in cols).toBe(false);
  });
});

describe("assessmentFromRow — read reassembly + kind re-validation", () => {
  it("returns undefined when every assessment column is null (no assessment)", () => {
    expect(
      assessmentFromRow({
        assessment_kind: null,
        assessment_title: null,
        assessment_purpose: null,
        assessment_notes: null,
      }),
    ).toBeUndefined();
    // …and when the columns are simply absent.
    expect(assessmentFromRow({})).toBeUndefined();
  });

  it("reassembles a full assessment from its four columns", () => {
    const a = assessmentFromRow({
      assessment_kind: "summative",
      assessment_title: "Unit test",
      assessment_purpose: "mastery",
      assessment_notes: "40 min",
    });
    expect(a).toEqual({
      kind: "summative",
      title: "Unit test",
      purpose: "mastery",
      notes: "40 min",
    });
  });

  it("DROPS a stored garbage kind to undefined (the column is un-CHECKed)", () => {
    const a = assessmentFromRow({
      assessment_kind: "pop-quiz",
      assessment_title: "Surprise",
    });
    expect(a?.kind).toBeUndefined();
    // A title-only assessment still round-trips (kind absent is valid).
    expect(a?.title).toBe("Surprise");
  });

  it("round-trips a title-only assessment (no kind) rather than dropping it", () => {
    const a = assessmentFromRow({ assessment_title: "Observation" });
    expect(a).toEqual({
      kind: undefined,
      title: "Observation",
      purpose: undefined,
      notes: undefined,
    });
  });

  it("write→read round-trips a valid assessment", () => {
    const cols = lessonTrackBColumns({
      assessment: { kind: "formative", title: "Exit ticket", notes: "3 Qs" },
    });
    const back = assessmentFromRow(cols);
    expect(back?.kind).toBe("formative");
    expect(back?.title).toBe("Exit ticket");
    expect(back?.notes).toBe("3 Qs");
  });
});
