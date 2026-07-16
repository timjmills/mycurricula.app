// theme-values.test.ts — pins the mc-theme-axes cookie codec contracts the
// SSR no-flash design leans on (FRAME-FLASH-SSR-DESIGN.md §3a/§3b):
//   1. round-trip: decode(encode(axes)) === axes for every legal combination
//   2. the LITERAL field order (the encode/decode lockstep — "normal" is a
//      legal value in BOTH the dim and palette slots, so an order drift
//      between the two functions would corrupt axes SILENTLY)
//   3. hostile/malformed input never throws and always yields frozen-set
//      members (the XSS-safe-by-construction posture extended to SSR)
//   4. deriveTone parity with the boot script's five-rule replica

import { describe, expect, it } from "vitest";
import {
  APP_THEMES,
  BG_VALUES,
  DEFAULT_THEME_AXES,
  DIM_VALUES,
  FRAME_VALUES,
  GLASS_VALUES,
  PALETTE_VALUES,
  STYLE_VALUES,
  type ThemeAxesSnapshot,
  decodeThemeAxesCookie,
  deriveTone,
  encodeThemeAxesCookie,
  isThemeBg,
  isThemeDim,
  isThemeFrame,
  isThemeGlass,
  isThemePalette,
  isThemeSetting,
  isThemeStyle,
} from "@/lib/theme-values";

const SAMPLE: ThemeAxesSnapshot = {
  frame: "paper",
  glass: "light",
  bg: "wash",
  theme: "night",
  dim: "bright",
  style: "quiet",
  palette: "normal",
};

describe("mc-theme-axes cookie codec", () => {
  it("round-trips every legal axis combination", () => {
    for (const frame of FRAME_VALUES)
      for (const glass of GLASS_VALUES)
        for (const bg of BG_VALUES)
          for (const theme of [...APP_THEMES, "system"] as const)
            for (const dim of DIM_VALUES)
              for (const style of STYLE_VALUES)
                for (const palette of PALETTE_VALUES) {
                  const axes: ThemeAxesSnapshot = {
                    frame,
                    glass,
                    bg,
                    theme,
                    dim,
                    style,
                    palette,
                  };
                  expect(decodeThemeAxesCookie(encodeThemeAxesCookie(axes))).toEqual(
                    axes,
                  );
                }
  });

  it("pins the literal field order (the dim/palette 'normal' collision)", () => {
    // If this fixture fails, encode/decode drifted — see the codec header in
    // lib/theme-values.ts. Do NOT update this string without updating BOTH
    // functions and bumping the version tag.
    expect(encodeThemeAxesCookie(SAMPLE)).toBe(
      "v1.paper.light.wash.night.bright.quiet.normal",
    );
    // The collision itself: "normal" in the DIM slot must decode as dim, and
    // "normal" in the PALETTE slot as palette — never cross-assigned.
    const collided = decodeThemeAxesCookie("v1.glass.dark.photo.clear.normal.vivid.normal");
    expect(collided.dim).toBe("normal");
    expect(collided.palette).toBe("normal");
  });

  it("falls to full defaults on missing/empty/versionless/oversized input", () => {
    for (const raw of [
      undefined,
      null,
      "",
      "garbage",
      "v0.paper.light.wash.night.bright.quiet.normal", // wrong version
      "paper.light.wash.night.bright.quiet.normal", // missing version tag
      "v1".padEnd(300, ".paper"), // oversized (cookie-bomb guard)
    ]) {
      expect(decodeThemeAxesCookie(raw as string | null | undefined)).toEqual(
        DEFAULT_THEME_AXES,
      );
    }
  });

  it("falls back PER FIELD on partially hostile input, never throws", () => {
    // frame hostile, theme "system" legal, dim missing entirely.
    const decoded = decodeThemeAxesCookie('v1."><script>.dark.photo.system');
    expect(decoded.frame).toBe(DEFAULT_THEME_AXES.frame); // hostile → default
    expect(decoded.glass).toBe("dark");
    expect(decoded.bg).toBe("photo");
    expect(decoded.theme).toBe("system"); // sentinel is legal in the cookie
    expect(decoded.dim).toBe(DEFAULT_THEME_AXES.dim); // missing → default
    // Every decoded field is ALWAYS a frozen-set member (attribute safety).
    expect(isThemeFrame(decoded.frame)).toBe(true);
    expect(isThemeGlass(decoded.glass)).toBe(true);
    expect(isThemeBg(decoded.bg)).toBe(true);
    expect(isThemeSetting(decoded.theme)).toBe(true);
    expect(isThemeDim(decoded.dim)).toBe(true);
    expect(isThemeStyle(decoded.style)).toBe(true);
    expect(isThemePalette(decoded.palette)).toBe(true);
  });
});

describe("deriveTone (SSR/boot/provider parity)", () => {
  it("applies the five rules in order, autoTone last", () => {
    expect(deriveTone("night", "light", "wash", "bright", "light")).toBe("dark");
    expect(deriveTone("clear", "light", "photo", "dim", null)).toBe("light");
    expect(deriveTone("clear", "dark", "wash", "dim", null)).toBe("light");
    expect(deriveTone("clear", "dark", "photo", "dim", "light")).toBe("dark");
    expect(deriveTone("clear", "dark", "photo", "bright", "dark")).toBe("light");
    expect(deriveTone("clear", "dark", "photo", "normal", null)).toBe("dark");
    expect(deriveTone("clear", "dark", "photo", "normal", "light")).toBe("light");
  });
});
