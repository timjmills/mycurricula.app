// palette.ts — the 20-color paired palette and subject-color resolution.
//
// Architecture (per the design handoff project/palette.jsx):
//   • Core Curriculum has ONE subject → color mapping, set by the team
//     lead. All teachers see the same hue for the same subject.
//   • Each color is a PAIR: a Normal (saturated, ~500 weight) and a
//     Highlight (highlighter-marker, bright/electric) variant of the
//     same hue.
//   • Each teacher individually picks Normal OR Highlight as a viewing
//     preference (Appearance settings).
//
// This module owns the pure data + the resolution function. The React
// context, hook, and CSS-variable bridge live in `palette.tsx`, which
// re-exports everything from here so `@/lib/palette` is the full surface.

import { SUBJECT_SLOTS } from "./subject-color";
import type { SubjectId } from "./types";

/** Which of the two saturation variants a teacher views. */
export type PaletteType = "normal" | "highlight";

/** One paired swatch in the subject-color pool. */
export interface PaletteSwatch {
  id: string;
  name: string;
  /** Saturated, darker hex — the "regular" school-palette color. */
  normal: string;
  /** Highlighter-marker hex — bright, electric, candy-soft. */
  highlight: string;
  /** Text-on-color hex (~700–800). AA on either fill. */
  deep: string;
  /**
   * v1.3 soft tint — the pastel fill used for chips, lanes and card fills
   * (the "--ct" in the cascade). When present, resolveSubjectColor uses this
   * as the fill instead of mixing one from `normal`. Legacy 20-swatches omit
   * it and fall back to a computed mix.
   */
  tint?: string;
  /**
   * v1.3 bright accent — the more-saturated outline/stripe/dot/tile color
   * (the "--c" in the cascade) used under the Highlight palette. Legacy
   * swatches omit it and reuse `highlight`.
   */
  bright?: string;
}

/** Resolved color tokens for a subject under the active palette type. */
export interface SubjectColor {
  /** Stripe / accent color. */
  c: string;
  /** Light fill color. */
  cl: string;
  /** Deep text color — AA on either fill, palette-type independent. */
  cd: string;
  /** Alias of `cl` style tile color for calm/vivid headers. */
  tile: string;
  /** Alias of `cd`. */
  deep: string;
  /** Card background — a soft vertical gradient. */
  bg: string;
  /** Solid card background fallback. */
  bgSolid: string;
  /** Stripe color (deep tone for highlight, saturated for normal). */
  stripe: string;
  /** Alias of `bg`. */
  gradient: string;
}

// ── The 20 paired swatches ──────────────────────────────────────────────
// normal    — saturated, DARKER hex. Confident, readable, slightly serious.
// highlight — highlighter-marker hex. Bright, electric (Stabilo/Mildliner).
// deep      — text-on-color hex (~700-800), AA on either fill.
export const PALETTE_20: readonly PaletteSwatch[] = [
  // Blues
  { id: "ocean", name: "Ocean", normal: "#1A4ED9", highlight: "#7FB6FF", deep: "#0C2870" }, // prettier-ignore
  { id: "sky", name: "Sky", normal: "#1373C9", highlight: "#74D0FF", deep: "#0B416E" }, // prettier-ignore
  { id: "indigo", name: "Indigo", normal: "#3D2DBF", highlight: "#A095FF", deep: "#1A1170" }, // prettier-ignore
  // Greens / Teals
  { id: "teal", name: "Teal", normal: "#0A7E72", highlight: "#7CECDE", deep: "#053A33" }, // prettier-ignore
  { id: "mint", name: "Mint", normal: "#0E9385", highlight: "#7DF0DC", deep: "#054E45" }, // prettier-ignore
  { id: "leaf", name: "Leaf", normal: "#188542", highlight: "#9CF488", deep: "#093D1F" }, // prettier-ignore
  { id: "forest", name: "Forest", normal: "#1F5B23", highlight: "#A8E89B", deep: "#0D2C0F" }, // prettier-ignore
  // Yellows / Warms
  { id: "lemon", name: "Lemon", normal: "#B58400", highlight: "#FFF176", deep: "#4E380A" }, // prettier-ignore
  { id: "amber", name: "Amber", normal: "#A66A0E", highlight: "#FFD86B", deep: "#502F08" }, // prettier-ignore
  { id: "apricot", name: "Apricot", normal: "#C2671E", highlight: "#FFBE76", deep: "#5A2C0A" }, // prettier-ignore
  // Reds / Pinks
  { id: "coral", name: "Coral", normal: "#C7401E", highlight: "#FFA984", deep: "#581A09" }, // prettier-ignore
  { id: "rose", name: "Rose", normal: "#BA1A41", highlight: "#FF95AB", deep: "#5B0A1E" }, // prettier-ignore
  { id: "blush", name: "Blush", normal: "#B22368", highlight: "#FFA1C9", deep: "#560E36" }, // prettier-ignore
  { id: "magenta", name: "Magenta", normal: "#9C1377", highlight: "#FF9DDC", deep: "#460835" }, // prettier-ignore
  // Purples
  { id: "lavender", name: "Lavender", normal: "#5E2EE0", highlight: "#C7A8FF", deep: "#2A1170" }, // prettier-ignore
  { id: "violet", name: "Violet", normal: "#4F1FAA", highlight: "#B496FF", deep: "#220A5C" }, // prettier-ignore
  { id: "plum", name: "Plum", normal: "#6E1788", highlight: "#DAA1F2", deep: "#330842" }, // prettier-ignore
  // Neutrals
  { id: "slate", name: "Slate", normal: "#3E4A65", highlight: "#A8B2C8", deep: "#1B2233" }, // prettier-ignore
  { id: "stone", name: "Stone", normal: "#6D5947", highlight: "#D6BC9A", deep: "#352819" }, // prettier-ignore
  { id: "charcoal", name: "Charcoal", normal: "#1C2535", highlight: "#9CA3B5", deep: "#080D17" }, // prettier-ignore
] as const;

// ── The v1.3 subject scale — 15 muted slots (White Rose register) ────────
// The active brand palette. Each slot carries the muted `solid` (normal), the
// `bright` accent (outline/stripe/dot under Highlight), the soft `tint` fill,
// and the `ink` text (deep). These are the "15 options" a teacher can assign;
// the 8 locked subjects map onto them by default (see DEFAULT_SUBJECT_MAPPING).
//
// The colours are IMPORTED, not transcribed. They used to be fifteen rows of
// literal hexes with a comment promising they "mirror app/tokens.css --subj-N*
// exactly" — a promise nothing checked, on a table the Appearance picker paints
// AND prints the hex of (components/appearance/palette-reference.tsx:118,132).
// A stylesheet-only edit would have left the picker showing a teacher a swatch
// and a hex code the app no longer renders anywhere. Both now read the one
// derivation in lib/subject-color.ts; see that file for why the values are
// computed rather than taken from the handoff verbatim.
const SLOT_NAMES = [
  "Gold", "Apricot", "Coral", "Rose", "Pink", "Magenta", "Purple", "Violet",
  "Periwinkle", "Blue", "Cyan", "Teal", "Green", "Leaf", "Lime",
] as const;

export const SUBJECT_SWATCHES: readonly PaletteSwatch[] = SUBJECT_SLOTS.map(
  (slot, i) => ({
    id: `subj-${i + 1}`,
    name: SLOT_NAMES[i],
    normal: slot.solid,
    bright: slot.bright,
    tint: slot.tint,
    deep: slot.ink,
    // The v1.3 scale has no separate highlighter-marker variant: the bright
    // accent IS what the Highlight palette shows. Kept as its own field because
    // `PaletteSwatch` is shared with the legacy 20-pool, where the two differ.
    highlight: slot.bright,
  }),
);

/** Swatch lookup by id — both the v1.3 15-slot scale and the legacy 20-pool
 *  resolve here, so saved mappings referencing either keep working. v1.3
 *  slots are listed first so a duplicate id (there are none today) would
 *  prefer the brand scale. */
export const PALETTE_BY_ID: Record<string, PaletteSwatch> = Object.fromEntries(
  [...SUBJECT_SWATCHES, ...PALETTE_20].map((s) => [s.id, s]),
);

/** Subject → swatch id mapping. */
export type SubjectMapping = Record<SubjectId, string>;

// Default subject → swatch assignment. The 8 locked subjects map onto the muted
// 15-slot brand scale per the v2 design handoff:
//   math→1  ufli→2  writing→5  grammar→7  spelling→9  reading→10
//   sel→12  explorers→13
//
// This is the mapping used by the context-driven `useSubjectColor` hook and the
// global PaletteCssBridge `.cp-subj` rules — i.e. the map every live read path
// resolves, on both the v2 and the flag-OFF v1 paths. It mirrors the
// named-subject aliases in app/tokens.css `:root`, which are the static
// SSR/no-JS fallback; tests/subject-slot-map.test.ts pins the two together
// against the handoff so they cannot drift apart again.
//
// HISTORY — why this changed. Four subjects (writing, spelling, ufli, sel) were
// previously on the wrong slots, attributed in-comment to "the design kit's
// data.js". No data.js in any handoff has ever carried those values: the
// mockup's own source (6.24.26 …/source/data.js:7-14 and the 7.21.26 update),
// V2 Framework.md:184-193 and CLAUDE.md §4 all specify the map above, and all
// four agree with each other. The old comment also argued this map "MUST stay
// intact" to avoid recolouring flag-OFF v1 — but v1's colours were wrong by the
// same handoff, and `NEXT_PUBLIC_V2` defaults ON (lib/v2-flag.ts), so the wrong
// map was what production actually rendered. The slot is team-wide MEANING
// (CLAUDE.md §4), not per-path styling, so both paths carry the handoff map.
//
// Nothing is migrated by this change: colour is a derived slug (subjects.color
// stores e.g. "writing"), and the Appearance page's team mapping is local
// component state that is never persisted. No stored row pins a slot id.
export const DEFAULT_SUBJECT_MAPPING: SubjectMapping = {
  math: "subj-1",
  reading: "subj-10",
  writing: "subj-5",
  grammar: "subj-7",
  spelling: "subj-9",
  ufli: "subj-2",
  explorers: "subj-13",
  sel: "subj-12",
};

// A second map, `V2_SUBJECT_SLOTS`, used to live here — the handoff's values,
// kept alongside the divergent default behind a staging note describing a
// "later stage" that would wire it to v2 callsites as inline `--sc/--sct/--sci`.
// That stage never came: it had ZERO consumers repo-wide while every surface
// resolved the divergent default, so the corrected slots it held never reached
// a pixel. It is deleted rather than kept in sync with the map above, because a
// second table nobody reads is precisely how the original divergence was born.
// tests/subject-slot-map.test.ts now pins the single live map — and the
// tokens.css aliases — against the handoff instead.

/** v1.3 brand-scale slot ids look like `subj-7`; legacy 20-pool ids are
 *  named hues (`ocean`, `coral`, …). Slots carry a matching `--subj-N-*`
 *  token family in app/tokens.css, which the dark (night) theme overrides. */
const SLOT_ID = /^subj-\d+$/;

/**
 * Resolve a subject's color tokens for a given palette type and mapping.
 * Pure — usable on the server or outside React, and it NEVER reads
 * PaletteContext: the mapping is always an explicit argument. Callers reach it
 * via the `useSubjectColor` hook in `palette.tsx`, which wraps it with the
 * active PaletteContext (seeded from `DEFAULT_SUBJECT_MAPPING`, which now
 * carries the handoff map — see the note there). Passing an explicit mapping
 * is still supported and is how a caller scopes a colour read to something
 * other than the active context.
 *
 * The returned values are CSS color EXPRESSIONS — `var(--token)` references
 * (for v1.3 slot swatches, so the night theme's token overrides flow through)
 * or `color-mix(...)` / hex literals (for legacy swatches). They are valid in
 * inline `style` and CSS custom properties but NOT raw hex; consumers must
 * assign them as CSS values and must never parse them as colors.
 */
export function resolveSubjectColor(
  subjectId: SubjectId,
  type: PaletteType,
  mapping: SubjectMapping = DEFAULT_SUBJECT_MAPPING,
): SubjectColor {
  const swatchId = mapping[subjectId] ?? DEFAULT_SUBJECT_MAPPING[subjectId];
  const swatch = PALETTE_BY_ID[swatchId] ?? PALETTE_BY_ID["subj-1"];

  // v1.3 cascade recipe: a SOFT TINT is always the fill (--ct / --cl); the
  // bright/solid accent lives only on the outline, stripe, dot and icon tile
  // (--c). Text stays dark `ink` (--cd) for legibility — color never moves
  // into the words. The Highlight palette uses the brighter accent; Normal
  // uses the muted solid.
  //
  // For v1.3 slots we emit token REFERENCES (`var(--subj-N-*)`) rather than the
  // literal hexes, so the night theme's per-slot overrides in tokens.css cascade
  // through. Legacy 20-pool swatches have no token family, so they keep their
  // hexes — but any mix toward white targets `var(--tint-base)` (white on light
  // themes, a dark surface on night) instead of a hard-coded `#fff`.
  if (SLOT_ID.test(swatch.id)) {
    const tint = `var(--${swatch.id}-tint)`;
    const accent =
      type === "highlight"
        ? `var(--${swatch.id}-bright)`
        : `var(--${swatch.id})`;
    const ink = `var(--${swatch.id}-ink)`;
    const gradient = `linear-gradient(180deg, ${tint} 0%, color-mix(in oklch, ${tint} 55%, var(--tint-base)) 100%)`;
    return {
      c: accent,
      cl: tint,
      cd: ink,
      tile: tint,
      deep: ink,
      bg: gradient,
      bgSolid: tint,
      stripe: accent,
      gradient,
    };
  }

  // Legacy 20-pool swatch: `tint` is absent, so mix a soft fill from `normal`.
  const tint =
    swatch.tint ?? `color-mix(in oklch, ${swatch.normal} 18%, var(--tint-base))`;
  const accent =
    type === "highlight" ? (swatch.bright ?? swatch.highlight) : swatch.normal;

  // Card background — a soft vertical wash of the tint so fills never read flat.
  const gradient = `linear-gradient(180deg, ${tint} 0%, color-mix(in oklch, ${tint} 55%, var(--tint-base)) 100%)`;

  return {
    c: accent,
    cl: tint,
    cd: swatch.deep,
    tile: tint,
    deep: swatch.deep,
    bg: gradient,
    bgSolid: tint,
    stripe: accent,
    gradient,
  };
}
