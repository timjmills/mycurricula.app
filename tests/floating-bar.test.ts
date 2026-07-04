// floating-bar.test.ts — pure placement geometry of the W3.8 floating
// rich-text bar (components/lesson-editor/FloatingBar.tsx).
//
// The bar's DOM behavior (focus gating, bus dispatch) rides on the
// browser-only command bus and live rects; what IS unit-testable is the
// bundle-recipe geometry: anchor selection (selection rect vs field-rect
// fallback), the 140px horizontal edge clamp, and the above/below flip that
// keeps the bar on-screen near the viewport top. These tests pin that
// contract down against the extracted recipe (mockup SelectionToolbar
// ~B:10874-10929).

import { describe, expect, it } from "vitest";
import {
  anchorFromRects,
  clampBarX,
  placeBar,
  MIN_TOP_FOR_ABOVE,
  type RectLike,
} from "@/components/lesson-editor/FloatingBar";

const field: RectLike = { left: 100, top: 300, width: 400, height: 120 };

describe("anchorFromRects", () => {
  it("centers on the selection rect when it has width", () => {
    const sel: RectLike = { left: 200, top: 320, width: 80, height: 18 };
    const a = anchorFromRects(sel, field);
    expect(a.x).toBe(240); // left + width/2
    expect(a.top).toBe(320);
    expect(a.bottom).toBe(338); // top + height
  });

  it("follows a collapsed caret rect (zero width, real height)", () => {
    // A collapsed caret's client rect is 0px wide but line-height tall —
    // the mock's `!r.width && !r.height` guard deliberately accepts it.
    const caret: RectLike = { left: 250, top: 340, width: 0, height: 18 };
    const a = anchorFromRects(caret, field);
    expect(a.x).toBe(250);
    expect(a.top).toBe(340);
  });

  it("falls back to the field rect when the selection rect is fully empty", () => {
    const empty: RectLike = { left: 0, top: 0, width: 0, height: 0 };
    const a = anchorFromRects(empty, field);
    // left + min(width/2, 120) = 100 + min(200, 120)
    expect(a.x).toBe(220);
    expect(a.top).toBe(300);
    expect(a.bottom).toBe(300);
  });

  it("falls back to the field rect when there is no selection rect", () => {
    const a = anchorFromRects(null, field);
    expect(a.x).toBe(220);
    expect(a.top).toBe(300);
  });

  it("caps the field-fallback x offset at 120px on wide fields", () => {
    const wide: RectLike = { left: 50, top: 200, width: 1000, height: 40 };
    expect(anchorFromRects(null, wide).x).toBe(170); // 50 + 120, not 50 + 500
  });

  it("uses the true half-width on narrow fields", () => {
    const narrow: RectLike = { left: 50, top: 200, width: 100, height: 40 };
    expect(anchorFromRects(null, narrow).x).toBe(100); // 50 + 50
  });
});

describe("clampBarX", () => {
  it("passes through when the anchor is comfortably inside", () => {
    expect(clampBarX(500, 1440)).toBe(500);
  });

  it("clamps to the 140px fallback left edge pre-measure", () => {
    expect(clampBarX(10, 1440)).toBe(140);
    expect(clampBarX(-999, 1440)).toBe(140);
  });

  it("clamps to the 140px fallback right edge pre-measure", () => {
    expect(clampBarX(1430, 1440)).toBe(1300);
    expect(clampBarX(99999, 1440)).toBe(1300);
  });

  // ── Measured-width clamp (W3.8 gate fix — the fixed 140 clipped a bar
  //    wider than 280px on small viewports) ─────────────────────────────

  it("keeps the whole MEASURED bar inside both edges", () => {
    // 344px bar on a 375px phone: half = 172 + 8 margin = 180.
    // Far-left anchor → center clamps to 180 → left edge at 0 + 8.
    expect(clampBarX(20, 375, 344)).toBe(180);
    // Far-right anchor → center clamps to 195 → right edge at 375 - 8.
    expect(clampBarX(370, 375, 344)).toBe(195);
    // Comfortable anchor passes through.
    expect(clampBarX(187, 375, 344)).toBe(187);
  });

  it("never lets either edge escape the viewport for any anchor x", () => {
    const barWidth = 344;
    const vw = 375;
    for (const x of [-500, 0, 100, 187.5, 300, 375, 900]) {
      const center = clampBarX(x, vw, barWidth);
      expect(center - barWidth / 2).toBeGreaterThanOrEqual(0);
      expect(center + barWidth / 2).toBeLessThanOrEqual(vw);
    }
  });

  it("centers exactly when the bar is at the CSS max-width cap (vw - 16)", () => {
    // barWidth = vw - 16 → min and max clamp bounds coincide at vw/2.
    expect(clampBarX(0, 360, 344)).toBe(180);
    expect(clampBarX(999, 360, 344)).toBe(180);
  });

  it("uses the measured width on desktop too (wide bar, roomy viewport)", () => {
    // 500px bar: half = 258 > the recipe's 140 — the old clamp would let
    // 110px hang off the left edge at x=140.
    expect(clampBarX(140, 1440, 500)).toBe(258);
  });

  it("falls back to the recipe edge for zero/unmeasured widths", () => {
    expect(clampBarX(10, 1440, 0)).toBe(140);
    expect(clampBarX(10, 1440, null)).toBe(140);
  });

  it("caps the pre-measure fallback at half the viewport on tiny screens", () => {
    // 200px viewport pre-measure: edge = min(140, 100) = 100 → centered,
    // not pushed 40px past the right edge like a raw 140 would.
    expect(clampBarX(0, 200)).toBe(100);
    expect(clampBarX(999, 200)).toBe(100);
  });
});

describe("placeBar", () => {
  it("places above the anchor by default", () => {
    const p = placeBar({ x: 500, top: 400, bottom: 420 }, 1440);
    expect(p).toEqual({ left: 500, top: 400, side: "above" });
  });

  it("flips below when the anchor is too close to the viewport top", () => {
    const p = placeBar({ x: 500, top: 40, bottom: 58 }, 1440);
    expect(p.side).toBe("below");
    // Below-placement hangs from the anchor rect's BOTTOM edge.
    expect(p.top).toBe(58);
  });

  it("flips exactly below the MIN_TOP_FOR_ABOVE threshold", () => {
    const at = placeBar({ x: 500, top: MIN_TOP_FOR_ABOVE, bottom: 510 }, 1440);
    expect(at.side).toBe("above");
    const under = placeBar(
      { x: 500, top: MIN_TOP_FOR_ABOVE - 1, bottom: 510 },
      1440,
    );
    expect(under.side).toBe("below");
  });

  it("clamps x while flipping", () => {
    const p = placeBar({ x: 5, top: 10, bottom: 28 }, 1440);
    expect(p.left).toBe(140);
    expect(p.side).toBe("below");
  });

  it("clamps x with the measured width", () => {
    const p = placeBar({ x: 20, top: 400, bottom: 418 }, 375, 344);
    expect(p.left).toBe(180); // 344/2 + 8
    expect(p.side).toBe("above");
  });

  it("accepts a custom flip threshold", () => {
    const p = placeBar({ x: 500, top: 100, bottom: 118 }, 1440, null, null, 200);
    expect(p.side).toBe("below");
  });

  // ── Measured-height flip (small-viewport wrapped bar) ────────────────

  it("raises the flip threshold when the measured bar is taller than the default allows", () => {
    // Wrapped two-row bar ≈ 96px → needs 96 + 10 gap + 8 margin = 114px of
    // headroom. An anchor at top=100 fits under the 90px default but NOT
    // under the measured bar — it must flip below.
    const p = placeBar({ x: 500, top: 100, bottom: 118 }, 375, 344, 96);
    expect(p.side).toBe("below");
    expect(p.top).toBe(118);
  });

  it("keeps the default threshold when the measured bar is short", () => {
    // Single-row 38px bar → 38 + 18 = 56 < the 90px default, which wins
    // (it also buys clearance under the app's top chrome).
    const above = placeBar({ x: 500, top: 100, bottom: 118 }, 1440, 480, 38);
    expect(above.side).toBe("above");
    const below = placeBar({ x: 500, top: 80, bottom: 98 }, 1440, 480, 38);
    expect(below.side).toBe("below");
  });

  it("treats zero/unmeasured height as the default threshold", () => {
    const p = placeBar({ x: 500, top: 100, bottom: 118 }, 1440, null, 0);
    expect(p.side).toBe("above");
  });
});
