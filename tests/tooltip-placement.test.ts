// tooltip-placement.test.ts — the Tooltip bubble's occlusion contract.
//
// The bug: focusing the appearance gear in the top bar opened a 280px bubble
// straight over the console nav (Day · Week · Year · Plan · Post · Teach) —
// 83% of the nav row's area at 375px, 53% at 768, 18% at 1440. Keyboard focus
// is documented behaviour (CLAUDE.md §4), so a teacher tabbing the top bar
// reproduces it.
//
// Two obvious fixes were measured and DISPROVED before this one, and the
// fixtures below are why they are not re-attempted here:
//   • Flipping to side="top" — computePlacement chooses on VIEWPORT space, and
//     the room above the gear is 29 / 64 / 80px against a 74+8 = 82px
//     requirement. `top` fails its fit test at all three tiers, desktop
//     included, and falls straight back to `bottom`.
//   • Clamping the width — the occlusion is VERTICAL. The gear's bottom edge
//     is ~15px above the nav and GAP is 8px, so any bubble taller than ~7px
//     lands on the nav whatever its width.
// What does work is sliding the bubble PAST the region, which is what
// slideClear() does and what the `avoid` prop opts into.
//
// The geometry below is not invented: every rect is taken from the live
// production measurement in docs/screenshots/4b-consolidated/
// tooltip-occlusion.json (2026-07-25), so the "before" assertions reproduce
// the shipped defect exactly and the "after" ones are measured against the
// same rects. The repo's vitest gate is node-environment (no DOM, no
// DOMRect), so the contract is pinned on the exported pure function; the
// rendered result is verified in a real browser per §4b.

import { describe, expect, it } from "vitest";
import {
  computePlacement,
  graceForGap,
  rectGap,
  type RectLike,
} from "@/components/ui/Tooltip";

function rect(x: number, y: number, w: number, h: number): RectLike {
  return { left: x, top: y, right: x + w, bottom: y + h, width: w, height: h };
}

function overlap(a: RectLike, b: RectLike): number {
  const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return w * h;
}

/** The bubble as placed, so overlap can be measured against the result. */
function placed(p: { x: number; y: number }, bubble: RectLike): RectLike {
  return rect(p.x, p.y, bubble.width, bubble.height);
}

// The appearance gear + console nav + bubble at each tier, from the live
// production probe. `gear` is the trigger, `nav` the region it buried.
const TIERS = [
  {
    name: "375",
    viewport: { width: 375, height: 812 },
    gear: rect(126, 29, 44, 44), // bottom edge 73 — 15px above the nav
    nav: rect(36, 88, 303, 34),
    bubble: rect(0, 0, 280, 74),
    shippedAt: { x: 8, y: 81 },
    shippedPctOfNav: 83,
  },
  {
    name: "768",
    viewport: { width: 768, height: 1024 },
    gear: rect(238.5, 64, 33, 33), // bottom edge 97
    nav: rect(183, 115, 401, 34),
    bubble: rect(0, 0, 280, 74),
    shippedAt: { x: 115, y: 105 },
    shippedPctOfNav: 53,
  },
  {
    name: "1440",
    viewport: { width: 1440, height: 900 },
    gear: rect(378, 80, 40, 23), // bottom edge 103
    nav: rect(439, 136, 562, 42),
    bubble: rect(0, 0, 280, 74),
    shippedAt: { x: 258, y: 111 },
    shippedPctOfNav: 18,
  },
] as const;

describe("computePlacement — the shipped defect, reproduced", () => {
  // Guards the fixtures. If these drift, the "after" numbers below are
  // measuring something other than the bug that was reported.
  for (const t of TIERS) {
    it(`buries ${t.shippedPctOfNav}% of the nav at ${t.name}px without \`avoid\``, () => {
      const p = computePlacement(t.gear, t.bubble, "bottom", t.viewport);
      expect(p.side).toBe("bottom");
      expect({ x: p.x, y: p.y }).toEqual(t.shippedAt);
      const pct = Math.round(
        (overlap(placed(p, t.bubble), t.nav) / (t.nav.width * t.nav.height)) *
          100,
      );
      expect(pct).toBe(t.shippedPctOfNav);
    });
  }
});

describe("computePlacement — `avoid` clears the nav", () => {
  for (const t of TIERS) {
    it(`covers none of the nav at ${t.name}px`, () => {
      const p = computePlacement(t.gear, t.bubble, "bottom", t.viewport, [
        t.nav,
      ]);
      expect(overlap(placed(p, t.bubble), t.nav)).toBe(0);
    });

    it(`keeps the bubble on-screen and off its own trigger at ${t.name}px`, () => {
      // A bubble pushed off the viewport, or one covering the control the
      // teacher is focused on, would be a different bug rather than a fix.
      const p = computePlacement(t.gear, t.bubble, "bottom", t.viewport, [
        t.nav,
      ]);
      const r = placed(p, t.bubble);
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.top).toBeGreaterThanOrEqual(0);
      expect(r.right).toBeLessThanOrEqual(t.viewport.width);
      expect(r.bottom).toBeLessThanOrEqual(t.viewport.height);
      expect(overlap(r, t.gear)).toBe(0);
    });

    it(`reports the bubble as displaced at ${t.name}px so the arrow hides`, () => {
      const p = computePlacement(t.gear, t.bubble, "bottom", t.viewport, [
        t.nav,
      ]);
      expect(p.displaced).toBe(true);
    });
  }

  it("slides below the region rather than flipping side", () => {
    // The regression guard for the two disproved fixes: the answer is a
    // downward slide on the PREFERRED side, not a flip to top/left/right.
    const t = TIERS[0];
    const p = computePlacement(t.gear, t.bubble, "bottom", t.viewport, [t.nav]);
    expect(p.side).toBe("bottom");
    expect(p.y).toBe(t.nav.bottom + 8); // GAP
  });
});

describe("computePlacement — callsites that did not opt in are untouched", () => {
  // ~30+ callsites share this primitive. The `avoid` path must be reachable
  // only by passing the prop.
  const trigger = rect(500, 400, 40, 40);
  const bubble = rect(0, 0, 200, 60);
  const viewport = { width: 1280, height: 800 };

  it("omitting `avoid` gives the historical fit-first placement", () => {
    const p = computePlacement(trigger, bubble, "top", viewport);
    // Room above (400) exceeds 60+8, so the preferred side is taken as-is.
    expect(p).toEqual({ x: 420, y: 332, side: "top", displaced: false });
  });

  it("an empty `avoid` list is identical to omitting it", () => {
    expect(computePlacement(trigger, bubble, "top", viewport, [])).toEqual(
      computePlacement(trigger, bubble, "top", viewport),
    );
  });

  it("falls back off the preferred side exactly as before", () => {
    // No room above → the historical fallback order (top, bottom, right,
    // left) picks bottom.
    const tight = rect(500, 10, 40, 40);
    const p = computePlacement(tight, bubble, "top", viewport);
    expect(p.side).toBe("bottom");
    expect(p.displaced).toBe(false);
  });

  it("never displaces when the avoid region is nowhere near the bubble", () => {
    const far = rect(0, 700, 100, 40);
    expect(computePlacement(trigger, bubble, "top", viewport, [far])).toEqual(
      computePlacement(trigger, bubble, "top", viewport),
    );
  });
});

describe("computePlacement — overlap demotes, it never forbids", () => {
  it("still returns an on-screen placement when nothing can fully clear", () => {
    // A viewport too short to escape below the nav. A tooltip that vanishes
    // is worse than one that overlaps, so a placement is still returned —
    // and it is better than the un-avoided one.
    const t = TIERS[0];
    const cramped = { width: 375, height: 160 };
    const p = computePlacement(t.gear, t.bubble, "bottom", cramped, [t.nav]);
    const r = placed(p, t.bubble);
    expect(r.left).toBeGreaterThanOrEqual(0);
    expect(r.top).toBeGreaterThanOrEqual(0);
    expect(r.right).toBeLessThanOrEqual(cramped.width);
    expect(r.bottom).toBeLessThanOrEqual(cramped.height);

    const without = computePlacement(t.gear, t.bubble, "bottom", cramped);
    expect(overlap(r, t.nav)).toBeLessThan(
      overlap(placed(without, t.bubble), t.nav),
    );
  });

  it("picks the least-bad side when every side covers something", () => {
    // Avoid regions tiled over the whole viewport: no escape exists, so the
    // contract is simply that a placement comes back at all.
    const trigger = rect(140, 100, 40, 40);
    const bubble = rect(0, 0, 200, 60);
    const viewport = { width: 360, height: 300 };
    const everywhere = [rect(0, 0, 360, 150), rect(0, 150, 360, 150)];
    const p = computePlacement(trigger, bubble, "bottom", viewport, everywhere);
    expect(["top", "bottom", "left", "right"]).toContain(p.side);
    const r = placed(p, bubble);
    expect(r.left).toBeGreaterThanOrEqual(0);
    expect(r.bottom).toBeLessThanOrEqual(viewport.height);
  });

  it("gives the cursor time to cross to a displaced bubble", () => {
    // §4a finding: the mouse-leave grace was a flat 120ms, sized for the 8px
    // GAP. A displaced bubble sits ~57px away at 375px, so a deliberate but
    // unhurried cursor would never reach "Turn off these tips" before the
    // close fired — silently removing a documented affordance (CLAUDE.md §4).
    const t = TIERS[0];
    const p = computePlacement(t.gear, t.bubble, "bottom", t.viewport, [t.nav]);
    const gap = rectGap(t.gear, placed(p, t.bubble));
    expect(gap).toBeCloseTo(t.nav.bottom + 8 - t.gear.bottom, 5); // 57px
    expect(graceForGap(gap)).toBeGreaterThan(200);
  });

  it("leaves the historical grace untouched for a normal bubble", () => {
    // The REGRESSION GUARD for ~30+ callsites: an 8px gap must still be
    // exactly 120ms, not a scaled value.
    expect(graceForGap(8)).toBe(120);
    expect(graceForGap(0)).toBe(120);
    expect(graceForGap(29)).toBe(120); // still under the floor
  });

  it("caps the grace so a wandering cursor cannot park the bubble", () => {
    expect(graceForGap(10000)).toBe(600);
  });

  it("measures the gap as zero for touching or overlapping rects", () => {
    const a = rect(0, 0, 100, 100);
    expect(rectGap(a, rect(100, 0, 50, 50))).toBe(0); // edge-to-edge
    expect(rectGap(a, rect(50, 50, 100, 100))).toBe(0); // overlapping
    expect(rectGap(a, rect(0, 140, 100, 20))).toBe(40); // straight below
  });

  it("clears a stack of two regions, not just the first", () => {
    // An immersive bar above a nav row: clearing one must not park the
    // bubble on the other.
    const trigger = rect(100, 20, 40, 30);
    const bubble = rect(0, 0, 200, 60);
    const viewport = { width: 800, height: 900 };
    const bars = [rect(0, 60, 800, 40), rect(0, 110, 800, 40)];
    const p = computePlacement(trigger, bubble, "bottom", viewport, bars);
    const r = placed(p, bubble);
    for (const bar of bars) expect(overlap(r, bar)).toBe(0);
  });
});
