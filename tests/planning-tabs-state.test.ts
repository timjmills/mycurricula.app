// planning-tabs-state.test.ts — normalizePlanningTabs (the /daily planning
// panel's persisted-arrangement validator, components/daily/planning-tabs).
//
// The panel persists { order, hidden, active } to localStorage. The
// normalizer must repair ANY parsed shape into a valid state: `order` a
// permutation of all six tools, `hidden` a deduped subset, `active` a
// VISIBLE tool. These tests pin that contract so a stale or hand-edited
// payload can never wedge the panel. (Deep import: the vitest setup
// transforms plain .ts only — the barrel would pull the .tsx component.)

import { describe, expect, it } from "vitest";
import { normalizePlanningTabs } from "@/components/daily/planning-tabs/planning-tabs-state";

const ALL = [
  "objective",
  "standards",
  "notes",
  "diff",
  "chat",
  "resources",
] as const;

describe("normalizePlanningTabs", () => {
  it("returns the defaults for non-object input", () => {
    for (const raw of [null, undefined, 42, "junk", []]) {
      const s = normalizePlanningTabs(raw);
      expect(s.order).toEqual([...ALL]);
      expect(s.hidden).toEqual(["chat", "resources"]);
      expect(s.active).toBe("objective");
    }
  });

  it("preserves a valid saved arrangement", () => {
    const saved = {
      order: ["notes", "objective", "standards", "diff", "chat", "resources"],
      hidden: ["chat"],
      active: "notes",
    };
    expect(normalizePlanningTabs(saved)).toEqual(saved);
  });

  it("drops unknown tools and duplicates, then appends missing tools", () => {
    const s = normalizePlanningTabs({
      order: ["notes", "bogus", "notes", "diff"],
      hidden: [],
      active: "notes",
    });
    expect(s.order.slice(0, 2)).toEqual(["notes", "diff"]);
    expect([...s.order].sort()).toEqual([...ALL].sort());
    expect(new Set(s.order).size).toBe(6);
  });

  it("repairs an active tool that is hidden or unknown to the first visible", () => {
    const hiddenActive = normalizePlanningTabs({
      order: [...ALL],
      hidden: ["objective"],
      active: "objective",
    });
    expect(hiddenActive.active).toBe("standards");

    const unknownActive = normalizePlanningTabs({
      order: [...ALL],
      hidden: [],
      active: "bogus",
    });
    expect(unknownActive.active).toBe("objective");
  });

  it("yields active null when every tool is hidden", () => {
    const s = normalizePlanningTabs({
      order: [...ALL],
      hidden: [...ALL],
      active: "notes",
    });
    expect(s.active).toBeNull();
    expect(s.hidden).toEqual([...ALL]);
  });

  it("dedupes and filters the hidden list", () => {
    const s = normalizePlanningTabs({
      order: [...ALL],
      hidden: ["chat", "chat", "bogus"],
      active: "objective",
    });
    expect(s.hidden).toEqual(["chat"]);
  });
});
