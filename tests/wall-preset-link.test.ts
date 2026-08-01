import { describe, it, expect } from "vitest";

import { weekResourcesHref, wallPresetHref } from "@/lib/wall-link";
import { WALL_PRESETS, WALL_PRESET_LABEL } from "@/lib/wall-scope";

// The Week's Resources button is the ONLY replacement for a capability the
// right-panel removal deleted: the rail's week-wide resource aggregation, which
// nothing else in the product answered. It works by routing to the Wall's own
// "This Week · Mixed" preset — so the link and the preset it names have to
// stay in step, and this file is what stops them drifting apart silently.
//
// ── WHY THIS IS NOT A TAUTOLOGY ────────────────────────────────────────────
// A test that asserted `weekResourcesHref() === "/post?preset=week-mixed"` and
// stopped there would pass just as happily if `week-mixed` were deleted from
// the preset union tomorrow — it would be checking a string against itself.
// So every assertion below is anchored to the CATALOGUE (`WALL_PRESETS`,
// `WALL_PRESET_LABEL`), which is the thing that can actually move.
//
// The handoff's six preset labels are verbatim from `source/resource-wall.jsx:92`
// and byte-identical across both bundles, so the LABEL is a legitimate anchor:
// if the week preset's display copy ever changed, the Week's button would be
// pointing at something a teacher no longer recognises as "this week".

describe("the Week's Resources link and the Wall preset it names", () => {
  it("names a preset that actually exists in the catalogue", () => {
    // The load-bearing assertion. `wallPresetHref` takes a `WallPreset`, so the
    // compiler catches a typo — but it cannot catch the preset being REMOVED
    // from the union and the helper being updated to some other member. This
    // pins the specific one whose meaning the button's label promises.
    const href = weekResourcesHref();
    const value = new URL(href, "http://x").searchParams.get("preset");

    expect(value).not.toBeNull();
    expect(WALL_PRESETS).toContain(value);
    // …and it is the WEEK one, not merely *a* valid preset. Without this the
    // test would pass with the button routed to "Subject View".
    expect(WALL_PRESET_LABEL[value as (typeof WALL_PRESETS)[number]]).toBe(
      "This Week · Mixed",
    );
  });

  it("emits a parseable URL on the /post route", () => {
    const url = new URL(weekResourcesHref(), "http://x");
    expect(url.pathname).toBe("/post");
    // No anchors: the week presets read the week from app state, and a stray
    // ?lesson= / ?subject= would change which preset the wall infers.
    expect(url.searchParams.get("lesson")).toBeNull();
    expect(url.searchParams.get("subject")).toBeNull();
    expect(url.searchParams.get("unit")).toBeNull();
  });

  it("round-trips every preset in the catalogue", () => {
    // The route narrows `?preset=` by testing membership of WALL_PRESETS
    // against the raw string. If a preset id ever contained a character that
    // needed escaping, the emitted href and the parsed value would disagree and
    // that preset would become silently unreachable — falling back to the
    // anchor inference rather than erroring, which is the quiet kind of break.
    for (const preset of WALL_PRESETS) {
      const parsed = new URL(wallPresetHref(preset), "http://x").searchParams.get(
        "preset",
      );
      expect(parsed).toBe(preset);
    }
  });
});
