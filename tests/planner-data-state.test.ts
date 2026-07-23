// Unit test for the hydration → data-state mapping that backs PlannerEmpty.
// The whole point of the primitive is that "loading" and "error" are NOT the
// same as "empty" — so this pins that mapping down explicitly.
import { describe, it, expect } from "vitest";
import {
  plannerDataStateFromHydration,
  type PlannerHydration,
} from "@/lib/planner-store";

describe("plannerDataStateFromHydration", () => {
  it("treats in-flight hydration as pending (never empty)", () => {
    expect(plannerDataStateFromHydration("idle")).toBe("pending");
    expect(plannerDataStateFromHydration("loading")).toBe("pending");
  });

  it("surfaces a hydrate failure as its own error state, not empty", () => {
    expect(plannerDataStateFromHydration("error")).toBe("error");
  });

  it("only reports settled once the store is ready or genuinely empty", () => {
    expect(plannerDataStateFromHydration("ready")).toBe("settled");
    expect(plannerDataStateFromHydration("empty")).toBe("settled");
  });

  it("covers every PlannerHydration value (exhaustiveness guard)", () => {
    const all: PlannerHydration[] = [
      "idle",
      "loading",
      "ready",
      "empty",
      "error",
    ];
    for (const h of all) {
      expect(["pending", "error", "settled"]).toContain(
        plannerDataStateFromHydration(h),
      );
    }
  });
});
