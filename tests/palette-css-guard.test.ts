// palette-css-guard.test.ts — the CSS-colour grammar guard on PaletteCssBridge.
//
// Why this exists: PaletteCssBridge interpolates colour values into a <style>
// element. docs/audits/2026-07-31-subject-colour-system.md flags that
// interpolation as a CSS-injection sink that ARMS when subject colours become
// team-writable (subjects-as-data, Phase 1B). guardCssColor is the read-side
// defence: values outside a strict colour grammar emit a neutral fallback, not
// the stored string. These tests pin both directions — every value the bridge
// can legitimately reach today passes, and every declaration-escape vector is
// rejected — by importing the REAL guard, never a local re-implementation.

import { describe, expect, it } from "vitest";
import {
  guardCssColor,
  PALETTE_20,
  PALETTE_BY_ID,
  SUBJECT_SWATCHES,
} from "@/lib/palette";

const FALLBACK = "var(--idle)";

describe("guardCssColor — everything the bridge legitimately emits passes", () => {
  it("accepts every hex the static palette table carries", () => {
    for (const swatch of [...PALETTE_20, ...SUBJECT_SWATCHES]) {
      for (const value of [
        swatch.normal,
        swatch.highlight,
        swatch.deep,
        // Optional fields on v1.3 slot entries.
        ...(swatch.bright ? [swatch.bright] : []),
        ...(swatch.tint ? [swatch.tint] : []),
      ]) {
        expect(guardCssColor(value), `swatch ${swatch.id} value ${value}`).toBe(
          value,
        );
      }
    }
  });

  it("accepts the constructed expressions the legacy branch builds", () => {
    // The tint fallback for legacy swatches, exactly as PaletteCssBridge
    // constructs it.
    const sample = PALETTE_BY_ID["ocean"];
    expect(sample).toBeDefined();
    const tint = `color-mix(in oklch, ${sample.normal} 18%, var(--tint-base))`;
    expect(guardCssColor(tint)).toBe(tint);
    expect(guardCssColor("var(--subj-1-bright)")).toBe("var(--subj-1-bright)");
    expect(guardCssColor("#E8179B")).toBe("#E8179B");
    expect(guardCssColor("oklch(0.72 0.11 55)")).toBe("oklch(0.72 0.11 55)");
  });
});

describe("guardCssColor — declaration-escape vectors are rejected", () => {
  const hostile = [
    // Close the declaration and open a new rule.
    "red; } body { background: url(//evil.example) ",
    "#fff;}*{display:none}",
    // Smuggle a brace inside a function argument span.
    "rgb(1,2,3); } .cp-subj{",
    "var(--x){}",
    // Remote fetch — url() is banned outright, bare or nested.
    "url(https://evil.example/p.png)",
    "color-mix(in srgb, url(//evil.example) 50%, #fff)",
    // At-rules and HTML-escape characters.
    "@import 'https://evil.example/x.css'",
    "red</style><script>1</script>",
    // Not a colour at all.
    "expression(alert(1))",
    "",
  ];

  for (const value of hostile) {
    it(`rejects ${JSON.stringify(value.slice(0, 40))}`, () => {
      expect(guardCssColor(value)).toBe(FALLBACK);
    });
  }

  it("the fallback itself passes the grammar (no self-rejection loop)", () => {
    expect(guardCssColor(FALLBACK)).toBe(FALLBACK);
  });
});
