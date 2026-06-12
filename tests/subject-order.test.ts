import { describe, it, expect } from "vitest";

import { reconcileOrder } from "@/lib/subject-order";
import { SUBJECTS } from "@/lib/mock";
import type { SubjectId } from "@/lib/types";

// Tests for the per-teacher subject-row order normalizer (Weekly view). These
// exercise the pure `reconcileOrder` helper only — the React hook
// (useSubjectOrder) is not invoked under node. `reconcileOrder` is the single
// guard that keeps the rendered grid from ever dropping or duplicating a
// subject, so it carries the correctness weight of the feature.

const CANONICAL = SUBJECTS.map((s) => s.id) as SubjectId[];

describe("reconcileOrder — completeness invariant", () => {
  it("returns the canonical order when given null", () => {
    expect(reconcileOrder(null)).toEqual(CANONICAL);
  });

  it("returns the canonical order when given undefined", () => {
    expect(reconcileOrder(undefined)).toEqual(CANONICAL);
  });

  it("returns the canonical order when given an empty array", () => {
    expect(reconcileOrder([])).toEqual(CANONICAL);
  });

  it("preserves a full valid permutation exactly", () => {
    const shuffled: SubjectId[] = [
      "sel",
      "math",
      "ufli",
      "reading",
      "explorers",
      "writing",
      "grammar",
      "spelling",
    ];
    expect(reconcileOrder(shuffled)).toEqual(shuffled);
  });

  it("always returns exactly the catalog set (no drops, no dupes) for any input", () => {
    const inputs: unknown[][] = [
      ["math"],
      ["sel", "sel", "math"],
      ["bogus", "math", 42, null, "reading"],
      ["explorers", "writing"],
    ];
    for (const input of inputs) {
      const out = reconcileOrder(input);
      // Same length as the catalog.
      expect(out.length).toBe(CANONICAL.length);
      // Each catalog subject present exactly once.
      expect(new Set(out).size).toBe(CANONICAL.length);
      for (const id of CANONICAL) expect(out).toContain(id);
    }
  });
});

describe("reconcileOrder — stale / partial saves", () => {
  it("drops ids that are no longer real subjects", () => {
    const out = reconcileOrder(["math", "history", "reading"]);
    expect(out).not.toContain("history" as SubjectId);
    // The two valid saved ids keep their relative order at the front.
    expect(out.indexOf("math")).toBeLessThan(out.indexOf("reading"));
  });

  it("appends catalog subjects missing from a partial save, canonical-relative", () => {
    // Save only the last two canonical subjects, reversed.
    const out = reconcileOrder(["sel", "explorers"]);
    // The explicit saved ids come first, in saved order.
    expect(out[0]).toBe("sel");
    expect(out[1]).toBe("explorers");
    // The remaining (appended) ids follow in canonical order relative to one
    // another.
    const appended = out.slice(2);
    const canonicalAppended = CANONICAL.filter(
      (id) => id !== "sel" && id !== "explorers",
    );
    expect(appended).toEqual(canonicalAppended);
  });

  it("de-dupes repeated ids in a corrupt save (first occurrence wins)", () => {
    const out = reconcileOrder(["math", "math", "reading", "math"]);
    expect(out.filter((id) => id === "math").length).toBe(1);
    expect(out[0]).toBe("math");
  });

  it("ignores non-string entries", () => {
    const out = reconcileOrder([null, 1, {}, "math", undefined]);
    expect(out.length).toBe(CANONICAL.length);
    expect(out[0]).toBe("math");
  });
});

describe("reconcileOrder — custom catalog (multi-grade ready)", () => {
  it("reconciles against a passed-in catalog, not the locked 8", () => {
    const customCatalog: SubjectId[] = ["math", "reading", "writing"];
    const out = reconcileOrder(["writing", "bogus", "math"], customCatalog);
    // Only the custom-catalog members survive, saved order first, then the
    // missing custom member appended.
    expect(out).toEqual(["writing", "math", "reading"]);
  });

  it("KEEPS a saved id that is in the custom catalog but NOT in the locked 8", () => {
    // Regression guard for the double-reconcile bug: a future grade's subject
    // id (here a stand-in `science`) is not in the module's hard-coded SUBJECTS.
    // If anything reconciled against SUBJECTS before the live catalog, this id
    // would be dropped. Reconciling once against the live catalog preserves it.
    const customCatalog = ["science", "art", "music"] as unknown as SubjectId[];
    const saved = ["music", "science"] as unknown as SubjectId[];
    const out = reconcileOrder(saved, customCatalog);
    // Saved order first (both survive — they ARE in the custom catalog), then
    // the missing custom member appended in canonical-relative order.
    expect(out).toEqual(["music", "science", "art"]);
  });
});
