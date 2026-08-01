// subject-color.ts — the OKLCh derivation behind the `--subj-N` token scale.
//
// WHY THIS EXISTS (read before changing a value). CLAUDE.md §4a makes the v2
// design handoff authoritative for look, and the handoff hand-authors all 60
// subject values (15 slots × solid / tint / ink / bright); `oklch` appears zero
// times in the bundle. Deriving them instead is a DELIBERATE, USER-APPROVED
// OVERRIDE of that rule, decided 2026-08-01 — not a handoff violation, and not
// something to revert on sight. Two facts drove it:
//
//   1. Ten of the fifteen handoff solids fail WCAG 1.4.11 (3:1, non-text) on the
//      light surface. Gold (`--subj-1`, #DCC674) measures 1.70:1 against a 3.0
//      floor. Subject colour carries TEAM-WIDE MEANING (CLAUDE.md §4 — the
//      subject→slot map is not a teacher preference), so a stripe or dot a
//      teacher cannot distinguish is a functional failure, not a compliance nit.
//   2. Hand-authored hexes cannot survive subjects-as-data. The moment a school
//      invents its own subject there is no hex for it and no designer in the
//      loop. A recipe gives any hue the four roles with a guaranteed floor.
//
// THE HARD CONSTRAINT — ANCHORING. The derivation is calibrated to REPRODUCE the
// handoff hex byte-for-byte wherever that hex already clears its floor. A
// derivation that passes every ratio but silently restyles the values that were
// already fine has failed the brief. That is why the shape here is
// "seed, then repair the minimum": `anchorSubjectSlot` returns its seed
// UNCHANGED when the seed passes, and otherwise walks OKLCh lightness in small
// steps and stops at the FIRST value that clears the floor — never further.
// tests/subject-color-derivation.test.ts pins both halves of that claim.
//
// WHAT IS NOT UNLOCKED: the subject→slot map (CLAUDE.md §4) stays locked
// team-wide; see lib/palette-data.ts and tests/subject-slot-map.test.ts.

/* ────────────────────────────────────────────────────────────────────────────
   Reference surfaces + floors
   ──────────────────────────────────────────────────────────────────────────── */

/** `:root { --surface }` — app/tokens.css:141. The light-tone card/panel fill. */
export const LIGHT_SURFACE = "#ffffff";

/** `:root[data-tone="dark"] { --surface }` — app/tokens.css:1699. The dark-tone
 *  card/panel fill. Subject solids and brights are deliberately NOT re-themed by
 *  tone (app/tokens.css:1448 — "hue carries team-wide subject meaning"), so ONE
 *  value has to clear the floor on BOTH surfaces. That is a two-sided band, not
 *  a one-sided minimum: too light fails on white, too dark fails on #1e1d2c. */
export const DARK_SURFACE = "#1e1d2c";

/** WCAG 1.4.11 — non-text contrast, for stripes, dots, chip outlines, icons. */
export const NON_TEXT_MIN = 3;

/** WCAG 1.4.3 AA — body text. Applies to `-ink` on its own `-tint` only. */
export const TEXT_MIN = 4.5;

/** Added to the floor when a value is ALREADY being repaired, so a repaired
 *  value does not come to rest exactly on the boundary where an 8-bit rounding
 *  or a slightly-off backdrop would tip it under. It is deliberately NOT added
 *  to the KEEP test: raising the keep threshold above the WCAG floor would evict
 *  handoff values that legitimately pass, which is precisely what the anchoring
 *  constraint forbids. */
export const REPAIR_MARGIN = 0.05;

/* ────────────────────────────────────────────────────────────────────────────
   Colour maths — sRGB ⇄ OKLab ⇄ OKLCh, and WCAG relative luminance.
   Pure, dependency-free, and usable on the server (CLAUDE.md §6 — no new deps).
   ──────────────────────────────────────────────────────────────────────────── */

export type Rgb = readonly [number, number, number];
/** OKLCh: lightness 0–1, chroma (unbounded in principle), hue in DEGREES. */
export type Lch = readonly [number, number, number];

/** `#rgb` / `#rrggbb` → 0–255 channels. Throws on anything else: a silently
 *  mis-parsed colour would produce a passing contrast number nobody earned. */
export function hexToRgb(hex: string): Rgb {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) throw new Error(`not a hex colour: ${hex}`);
  const h =
    m[1].length === 3
      ? m[1]
          .split("")
          .map((c) => c + c)
          .join("")
      : m[1];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 0–255 channels → lowercase `#rrggbb`, rounded and clamped to 8 bits. Every
 *  contrast check in this module runs on the ROUNDED value, because that is
 *  what the browser paints — checking the float would let a value pass here and
 *  fail on screen. */
export function rgbToHex(rgb: Rgb): string {
  return (
    "#" +
    rgb
      .map((v) => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

const srgbToLinear = (c: number): number => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};
const linearToSrgb = (c: number): number =>
  255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/** Björn Ottosson's OKLab transform (the same one CSS `oklch()` implements). */
export function rgbToOklab(rgb: Rgb): Rgb {
  const R = srgbToLinear(rgb[0]);
  const G = srgbToLinear(rgb[1]);
  const B = srgbToLinear(rgb[2]);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Inverse of {@link rgbToOklab}. May return out-of-gamut channels (outside
 *  0–255); callers go through {@link lchToHex}, which clips chroma first. */
export function oklabToRgb(lab: Rgb): Rgb {
  const l = (lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2]) ** 3;
  const m = (lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2]) ** 3;
  const s = (lab[0] - 0.0894841775 * lab[1] - 1.291485548 * lab[2]) ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export function hexToLch(hex: string): Lch {
  const [L, a, b] = rgbToOklab(hexToRgb(hex));
  return [L, Math.hypot(a, b), (Math.atan2(b, a) * 180) / Math.PI];
}

const lchToRgbUnclipped = ([L, C, h]: Lch): Rgb => {
  const rad = (h * Math.PI) / 180;
  return oklabToRgb([L, C * Math.cos(rad), C * Math.sin(rad)]);
};

// A hair of slack, because a channel that lands at 255.0000001 is in gamut for
// every practical purpose and rejecting it would cost real chroma.
const IN_GAMUT_EPS = 0.5;
const inGamut = (rgb: Rgb): boolean =>
  rgb.every((v) => v >= -IN_GAMUT_EPS && v <= 255 + IN_GAMUT_EPS);

/**
 * OKLCh → hex, reducing CHROMA (never lightness, never hue) until the colour
 * fits sRGB. Lightness is the variable the repair solver is steering, and hue is
 * the subject's identity, so chroma is the only one that may give way.
 */
export function lchToHex([L, C, h]: Lch): string {
  let lo = 0;
  let hi = C;
  if (inGamut(lchToRgbUnclipped([L, C, h]))) {
    lo = C;
  } else {
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(lchToRgbUnclipped([L, mid, h]))) lo = mid;
      else hi = mid;
    }
  }
  return rgbToHex(lchToRgbUnclipped([L, lo, h]));
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (
    0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
  );
}

/** WCAG 2.x contrast ratio, order-independent. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* ────────────────────────────────────────────────────────────────────────────
   The repair solver
   ──────────────────────────────────────────────────────────────────────────── */

/** Lightness step for the solve. Fine enough that the "minimum move" claim is
 *  true to well under one 8-bit level, cheap enough to run in a test. */
const L_STEP = 0.0004;

/**
 * Walk OKLCh lightness away from `seed` in `direction` (−1 darker, +1 lighter),
 * holding hue and chroma, and return the FIRST rounded hex satisfying `passes`.
 *
 * Returns `seed` untouched when it already passes — that identity case is the
 * anchoring guarantee, and it is why this is a walk rather than a re-synthesis.
 * Returns `null` when no lightness in (0,1) satisfies the predicate, so an
 * impossible constraint surfaces as a failure instead of a plausible-looking
 * colour that does not actually pass.
 */
export function solveLightness(
  seed: string,
  direction: -1 | 1,
  passes: (hex: string) => boolean,
): string | null {
  if (passes(seed)) return seed;
  const [L0, C, h] = hexToLch(seed);
  for (let L = L0 + direction * L_STEP; L > 0 && L < 1; L += direction * L_STEP) {
    const candidate = lchToHex([L, C, h]);
    if (passes(candidate)) return candidate;
  }
  return null;
}

/**
 * Bring a solid / bright into the two-sided non-text band: ≥3:1 on BOTH
 * {@link LIGHT_SURFACE} and {@link DARK_SURFACE}. Too light darkens, too dark
 * lightens, and a value already inside the band comes back byte-identical.
 */
export function repairNonText(seed: string): string {
  const onLight = contrastRatio(seed, LIGHT_SURFACE);
  const onDark = contrastRatio(seed, DARK_SURFACE);
  if (onLight >= NON_TEXT_MIN && onDark >= NON_TEXT_MIN) return seed;
  const floor = NON_TEXT_MIN + REPAIR_MARGIN;
  const direction = onLight < NON_TEXT_MIN ? -1 : 1;
  const fixed = solveLightness(
    seed,
    direction,
    (c) =>
      contrastRatio(c, LIGHT_SURFACE) >= floor &&
      contrastRatio(c, DARK_SURFACE) >= floor,
  );
  if (!fixed) {
    throw new Error(
      `no lightness clears ${floor}:1 on both ${LIGHT_SURFACE} and ${DARK_SURFACE} for ${seed}`,
    );
  }
  return fixed;
}

/**
 * Bring an ink to AA on its own tint by darkening it. The tint is the fill and
 * stays put: moving the fill would restyle a large area to fix a small one.
 */
export function repairInk(seed: string, tint: string): string {
  if (contrastRatio(seed, tint) >= TEXT_MIN) return seed;
  const fixed = solveLightness(
    seed,
    -1,
    (c) => contrastRatio(c, tint) >= TEXT_MIN + REPAIR_MARGIN,
  );
  if (!fixed) throw new Error(`no lightness reaches ${TEXT_MIN}:1 on ${tint} for ${seed}`);
  return fixed;
}

/* ────────────────────────────────────────────────────────────────────────────
   The four roles
   ──────────────────────────────────────────────────────────────────────────── */

export interface SubjectRoles {
  /** `--subj-N` — stripes, dots, icons, headers. Non-text, both tones. */
  solid: string;
  /** `--subj-N-tint` — the light-tone fill (lanes, chips, card washes). */
  tint: string;
  /** `--subj-N-ink` — light-tone text ON that tint. AA against it. */
  ink: string;
  /** `--subj-N-bright` — the saturated accent dot / outline. Non-text, both tones. */
  bright: string;
}

/**
 * Canonical OKLCh (lightness, chroma) per role, for a subject that has NO
 * handoff anchor — i.e. one a school invents at runtime (subjects-as-data).
 *
 * The numbers are read off the handoff values that already pass, so a derived
 * subject sits in the same family as the authored ones rather than announcing
 * itself as the odd one out: the passing solids cluster at L 0.62–0.69 / C ~0.12
 * and the authored tints and inks are near-constant across all fifteen hues
 * (tint L 0.92–0.95 C 0.012–0.024; ink L 0.33–0.52 C 0.07–0.15). Chroma is a
 * CEILING, not a target — {@link lchToHex} clips it per hue, so a hue with less
 * available chroma simply gets what it has.
 */
const ROLE_SEEDS: Record<keyof SubjectRoles, { L: number; C: number }> = {
  solid: { L: 0.66, C: 0.12 },
  tint: { L: 0.93, C: 0.02 },
  ink: { L: 0.42, C: 0.13 },
  bright: { L: 0.6, C: 0.21 },
};

/**
 * The full recipe for one subject, from a hue alone. Every role is synthesised
 * from {@link ROLE_SEEDS} at that hue and then run through the SAME repair the
 * anchored path uses, so a school-invented subject carries the same guaranteed
 * floors as the fifteen authored slots.
 */
export function deriveSubjectRoles(hueDegrees: number): SubjectRoles {
  const at = (role: keyof SubjectRoles) =>
    lchToHex([ROLE_SEEDS[role].L, ROLE_SEEDS[role].C, hueDegrees]);
  const tint = at("tint");
  return {
    solid: repairNonText(at("solid")),
    tint,
    ink: repairInk(at("ink"), tint),
    bright: repairNonText(at("bright")),
  };
}

/**
 * The anchored path — the one the fifteen authored slots take.
 *
 * Each role starts from its HANDOFF hex and is returned unchanged when that hex
 * already clears its floor; only a failing role is repaired, and only as far as
 * the floor requires. This is the operative half of the user-locked decision:
 * the authored palette survives wherever it was already legible.
 */
export function anchorSubjectRoles(handoff: SubjectRoles): SubjectRoles {
  return {
    solid: repairNonText(handoff.solid),
    tint: handoff.tint,
    ink: repairInk(handoff.ink, handoff.tint),
    bright: repairNonText(handoff.bright),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   The handoff anchors
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The v2 handoff's authored values for `--subj-1 … --subj-15`, transcribed.
 *
 * SOURCE, in the handoff's own authority order (CLAUDE.md §4a — the runnable
 * bundled mockup wins, then the design-system CSS):
 *   Documents/Claude Design/6.24.26 design_handoff_v2_site/mockup/New v2 Site Design.bundled.html
 *   Documents/Claude Design/6.24.26 design_handoff_v2_site/design-system/colors_and_type.css:31-52
 * Both carry identical values; they were diffed, not sampled.
 *
 * TRANSCRIBED, NOT PARSED, for the same reason tests/subject-slot-map.test.ts
 * transcribes the slot map: `Documents/` is reference material the app must
 * never import (CLAUDE.md §6) and is not guaranteed present in a CI checkout, so
 * a reader would fail OPEN exactly where it matters most.
 */
export const HANDOFF_SLOTS: readonly SubjectRoles[] = [
  { solid: "#dcc674", tint: "#f4efdf", ink: "#7a671f", bright: "#e8bb17" }, // 1  gold
  { solid: "#dca574", tint: "#f4e9df", ink: "#7a491f", bright: "#e87917" }, // 2  apricot
  { solid: "#dc8274", tint: "#f4e2df", ink: "#7a2b1f", bright: "#e83317" }, // 3  coral
  { solid: "#cf778d", tint: "#f2e1e5", ink: "#7a1f36", bright: "#e8174b" }, // 4  rose
  { solid: "#cf77af", tint: "#f2e1ec", ink: "#7a1f59", bright: "#e8179b" }, // 5  pink
  { solid: "#c77ac7", tint: "#f0e2f0", ink: "#752475", bright: "#d147d1" }, // 6  magenta
  { solid: "#ab7ac7", tint: "#ebe2f0", ink: "#572475", bright: "#9f47d1" }, // 7  purple
  { solid: "#917ac7", tint: "#e6e2f0", ink: "#3c2475", bright: "#7147d1" }, // 8  violet
  { solid: "#7a7fc7", tint: "#e2e3f0", ink: "#242975", bright: "#4751d1" }, // 9  periwinkle
  { solid: "#7a9ec7", tint: "#e2e9f0", ink: "#244a75", bright: "#4788d1" }, // 10 blue
  { solid: "#7ab8c7", tint: "#e2eef0", ink: "#246575", bright: "#47b6d1" }, // 11 cyan
  { solid: "#7ac7b8", tint: "#e2f0ee", ink: "#247565", bright: "#47d1b6" }, // 12 teal
  { solid: "#7ac79b", tint: "#e2f0e8", ink: "#247547", bright: "#47d183" }, // 13 green
  { solid: "#7ac77a", tint: "#e2f0e2", ink: "#257425", bright: "#47d147" }, // 14 leaf
  { solid: "#9ac77a", tint: "#e8f0e2", ink: "#467524", bright: "#81d147" }, // 15 lime
] as const;

/**
 * The fifteen slots as the app should ship them: the handoff, anchored.
 *
 * This is the SOURCE the literal values in `app/tokens.css` are generated from,
 * and tests/subject-color-derivation.test.ts asserts the stylesheet still agrees
 * with it declaration by declaration. Regenerate with
 * `node scripts/gen-subject-tokens.mjs` (which prints the CSS block and the
 * kept-vs-moved ledger) rather than editing the hexes by hand.
 */
export const SUBJECT_SLOTS: readonly SubjectRoles[] =
  HANDOFF_SLOTS.map(anchorSubjectRoles);
