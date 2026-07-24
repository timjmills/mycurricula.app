// planner-unit-fields.test.ts — the B1.7 unit-edit SEAM on the in-memory mock
// source (lib/planner/mock-source.ts). Pins that updateUnitFields patches the
// live unit, returns the merged unit, and that a follow-up listUnits reflects
// the edit (a real backend within a session) while an absent field is never
// nulled. The Supabase source's shape is pinned by tests/track-b-workspace-
// fields.test.ts (the read/write column locks); this covers the runtime write.

import { describe, expect, it } from "vitest";
import { plannerMockSource } from "@/lib/planner/mock-source";

const GRADE = "g5";
const OWNER = "teacher-1";

describe("mock source — updateUnitFields", () => {
  it("returns the patched unit with only the given fields changed", async () => {
    const units = await plannerMockSource.listUnits(GRADE);
    const target = units[0];
    expect(target).toBeDefined();

    const updated = await plannerMockSource.updateUnitFields(
      target.id,
      {
        bigIdea: "Big idea under test",
        essentialQuestions: ["Q1", "Q2"],
        vocab: [{ term: "numerator", definition: "top number" }, { term: "denominator" }],
        kud: { know: ["k"], understand: ["u"], doGoal: ["d"] },
        notes: "seam note",
      },
      OWNER,
    );

    expect(updated.id).toBe(target.id);
    expect(updated.bigIdea).toBe("Big idea under test");
    expect(updated.essentialQuestions).toEqual(["Q1", "Q2"]);
    expect(updated.vocab?.[0]).toEqual({
      term: "numerator",
      definition: "top number",
    });
    expect(updated.vocab?.[1]).toEqual({ term: "denominator" });
    expect(updated.kud?.doGoal).toEqual(["d"]);
    expect(updated.notes).toBe("seam note");
    // Identity/scheduling fields untouched.
    expect(updated.subject).toBe(target.subject);
    expect(updated.name).toBe(target.name);
  });

  it("persists across a follow-up listUnits (a backend within the session)", async () => {
    const units = await plannerMockSource.listUnits(GRADE);
    const target = units[1] ?? units[0];

    await plannerMockSource.updateUnitFields(
      target.id,
      { bigIdea: "persisted idea" },
      OWNER,
    );

    const after = await plannerMockSource.listUnits(GRADE);
    const reread = after.find((u) => u.id === target.id);
    expect(reread?.bigIdea).toBe("persisted idea");
  });

  it("an absent patch field is never nulled (partial merge)", async () => {
    const units = await plannerMockSource.listUnits(GRADE);
    const target = units[2] ?? units[0];

    await plannerMockSource.updateUnitFields(
      target.id,
      { bigIdea: "keep me" },
      OWNER,
    );
    // A second patch touching ONLY notes must leave bigIdea intact.
    const updated = await plannerMockSource.updateUnitFields(
      target.id,
      { notes: "only notes changed" },
      OWNER,
    );
    expect(updated.bigIdea).toBe("keep me");
    expect(updated.notes).toBe("only notes changed");
  });

  it("throws for an unknown unit id", async () => {
    await expect(
      plannerMockSource.updateUnitFields("no-such-unit", { notes: "x" }, OWNER),
    ).rejects.toThrow(/Unit not found/);
  });


  it("returned units are cloned — a caller mutation never leaks into the store", async () => {
    const units = await plannerMockSource.listUnits(GRADE);
    const target = units[0];
    const updated = await plannerMockSource.updateUnitFields(
      target.id,
      { essentialQuestions: ["original"] },
      OWNER,
    );
    // Mutate the returned array; the store must be unaffected.
    updated.essentialQuestions?.push("leaked");
    const after = await plannerMockSource.listUnits(GRADE);
    const reread = after.find((u) => u.id === target.id);
    expect(reread?.essentialQuestions).toEqual(["original"]);
  });
});
