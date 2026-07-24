import { describe, it, expect } from "vitest";

import {
  ONBOARDING_V2_STEPS,
  SKIPPABLE_V2_STEPS,
  ONBOARDING_STORAGE_KEY,
  defaultV2Data,
  normalizeV2Persist,
  computeNeedsOnboarding,
  weekdaysForV2Preset,
  type OnboardingV2Persist,
} from "@/lib/onboarding-v2-shape";

describe("onboarding-v2 step order", () => {
  it("is workspace-first and summary-last (the locked product model)", () => {
    expect(ONBOARDING_V2_STEPS[0]).toBe("workspace");
    expect(ONBOARDING_V2_STEPS[ONBOARDING_V2_STEPS.length - 1]).toBe("summary");
  });

  it("has the six expected steps in order", () => {
    expect([...ONBOARDING_V2_STEPS]).toEqual([
      "workspace",
      "courses",
      "schedule",
      "year",
      "appearance",
      "summary",
    ]);
  });

  it("marks schedule/year/appearance skippable but not workspace/courses/summary", () => {
    expect(SKIPPABLE_V2_STEPS.has("schedule")).toBe(true);
    expect(SKIPPABLE_V2_STEPS.has("year")).toBe(true);
    expect(SKIPPABLE_V2_STEPS.has("appearance")).toBe(true);
    expect(SKIPPABLE_V2_STEPS.has("workspace")).toBe(false);
    expect(SKIPPABLE_V2_STEPS.has("courses")).toBe(false);
    expect(SKIPPABLE_V2_STEPS.has("summary")).toBe(false);
  });
});

describe("onboarding-v2 storage-shape compatibility", () => {
  it("uses the SAME key as the v1 wizard (the three live seeders read it)", () => {
    expect(ONBOARDING_STORAGE_KEY).toBe("mycurricula:onboarding");
  });

  it("defaultV2Data carries every field the live seeders read", () => {
    const d = defaultV2Data();
    // use-schedule-settings seeder
    expect(d.rotation).toBe("none");
    expect(typeof d.cycleLength).toBe("number");
    // use-subject-settings seeder — the {id,name,color,isAcademic} shape
    expect(d.subjects.length).toBeGreaterThan(0);
    for (const s of d.subjects) {
      expect(typeof s.id).toBe("string");
      expect(typeof s.name).toBe("string");
      expect(typeof s.color).toBe("string");
      expect(typeof s.isAcademic).toBe("boolean");
    }
    // use-default-template seeder
    expect(typeof d.defaultTemplateId).toBe("string");
    expect(d.defaultTemplateId).not.toBe("");
    // the new, additive field
    expect(d.workspaceMode).toBe("solo");
  });

  it("round-trips a written record through normalize unchanged", () => {
    const payload: OnboardingV2Persist = {
      stepIndex: 2,
      data: { ...defaultV2Data(), rotation: "ab", workspaceMode: "team" },
      finished: true,
    };
    const round = normalizeV2Persist(JSON.parse(JSON.stringify(payload)));
    expect(round.stepIndex).toBe(2);
    expect(round.finished).toBe(true);
    expect(round.data.rotation).toBe("ab");
    expect(round.data.workspaceMode).toBe("team");
    // seeder fields survive the round-trip
    expect(round.data.subjects).toEqual(payload.data.subjects);
    expect(round.data.defaultTemplateId).toBe(payload.data.defaultTemplateId);
  });

  it("resume-merges a partial v1-style record — missing fields fall back to defaults", () => {
    // A record written by a different wizard version that only carried rotation.
    const partial = { data: { rotation: "cycle", cycleLength: 6 } };
    const norm = normalizeV2Persist(partial);
    expect(norm.data.rotation).toBe("cycle");
    expect(norm.data.cycleLength).toBe(6);
    // Everything else defaulted, so no seeder sees a missing field.
    expect(norm.data.subjects.length).toBeGreaterThan(0);
    expect(norm.data.defaultTemplateId).not.toBe("");
    expect(norm.data.workspaceMode).toBe("solo");
    expect(norm.stepIndex).toBe(0);
    expect(norm.finished).toBe(false);
  });

  it("coerces junk fields to safe defaults", () => {
    const junk = normalizeV2Persist({
      stepIndex: 999,
      finished: "yes",
      data: { rotation: "bogus", workspaceMode: "nonsense" },
    });
    expect(junk.stepIndex).toBe(ONBOARDING_V2_STEPS.length - 1); // clamped
    expect(junk.finished).toBe(false); // only boolean true counts
    expect(junk.data.rotation).toBe("none"); // unknown token → none
    expect(junk.data.workspaceMode).toBe("solo"); // only "team" is honored
  });

  it("tolerates a non-object record", () => {
    const fromNull = normalizeV2Persist(null);
    expect(fromNull.stepIndex).toBe(0);
    expect(fromNull.finished).toBe(false);
    expect(fromNull.data.workspaceMode).toBe("solo");
  });

  it("weekdaysForV2Preset returns the expected sets", () => {
    expect(weekdaysForV2Preset("sun_thu")).toEqual([
      "sun",
      "mon",
      "tue",
      "wed",
      "thu",
    ]);
    expect(weekdaysForV2Preset("mon_fri")).toEqual([
      "mon",
      "tue",
      "wed",
      "thu",
      "fri",
    ]);
  });
});

describe("onboarding-v2 first-run matrix", () => {
  it("remote authority wins over both the local flag and the config gate", () => {
    // remote says onboarded → never needs it, regardless of the local flag or
    // which path we're on.
    expect(computeNeedsOnboarding(false, true, true)).toBe(false);
    expect(computeNeedsOnboarding(true, true, true)).toBe(false);
    expect(computeNeedsOnboarding(false, true, false)).toBe(false);
    // remote says NOT onboarded → always needs it.
    expect(computeNeedsOnboarding(true, false, true)).toBe(true);
    expect(computeNeedsOnboarding(false, false, true)).toBe(true);
    expect(computeNeedsOnboarding(true, false, false)).toBe(true);
  });

  it("DEPLOYED path never redirects on an unknown remote (fail-safe)", () => {
    // Supabase configured + remote unknown (pre-migration column, no session,
    // read error) → never redirect, regardless of the local finished flag. This
    // is the activation-gate safety invariant: shipping the code before the
    // migration lands is a guaranteed no-op.
    expect(computeNeedsOnboarding(false, null, true)).toBe(false);
    expect(computeNeedsOnboarding(true, null, true)).toBe(false);
  });

  it("PROTOTYPE path falls back to the local finished flag when remote is unknown", () => {
    // Supabase OFF → no server to ask → the per-device flag governs, exactly as
    // before this gate existed.
    expect(computeNeedsOnboarding(false, null, false)).toBe(true); // not finished → needs
    expect(computeNeedsOnboarding(true, null, false)).toBe(false); // finished → done
  });
});
