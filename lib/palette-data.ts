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
// and the `ink` text (deep). Values mirror app/tokens.css `--subj-N*` exactly.
// These are the "15 options" a teacher can assign; the 8 locked subjects map
// onto them by default (see DEFAULT_SUBJECT_MAPPING).
export const SUBJECT_SWATCHES: readonly PaletteSwatch[] = [
  { id: "subj-1",  name: "Gold",       normal: "#DCC674", bright: "#E8BB17", tint: "#F4EFDF", deep: "#7A671F", highlight: "#E8BB17" }, // prettier-ignore
  { id: "subj-2",  name: "Apricot",    normal: "#DCA574", bright: "#E87917", tint: "#F4E9DF", deep: "#7A491F", highlight: "#E87917" }, // prettier-ignore
  { id: "subj-3",  name: "Coral",      normal: "#DC8274", bright: "#E83317", tint: "#F4E2DF", deep: "#7A2B1F", highlight: "#E83317" }, // prettier-ignore
  { id: "subj-4",  name: "Rose",       normal: "#CF778D", bright: "#E8174B", tint: "#F2E1E5", deep: "#7A1F36", highlight: "#E8174B" }, // prettier-ignore
  { id: "subj-5",  name: "Pink",       normal: "#CF77AF", bright: "#E8179B", tint: "#F2E1EC", deep: "#7A1F59", highlight: "#E8179B" }, // prettier-ignore
  { id: "subj-6",  name: "Magenta",    normal: "#C77AC7", bright: "#D147D1", tint: "#F0E2F0", deep: "#752475", highlight: "#D147D1" }, // prettier-ignore
  { id: "subj-7",  name: "Purple",     normal: "#AB7AC7", bright: "#9F47D1", tint: "#EBE2F0", deep: "#572475", highlight: "#9F47D1" }, // prettier-ignore
  { id: "subj-8",  name: "Violet",     normal: "#917AC7", bright: "#7147D1", tint: "#E6E2F0", deep: "#3C2475", highlight: "#7147D1" }, // prettier-ignore
  { id: "subj-9",  name: "Periwinkle", normal: "#7A7FC7", bright: "#4751D1", tint: "#E2E3F0", deep: "#242975", highlight: "#4751D1" }, // prettier-ignore
  { id: "subj-10", name: "Blue",       normal: "#7A9EC7", bright: "#4788D1", tint: "#E2E9F0", deep: "#244A75", highlight: "#4788D1" }, // prettier-ignore
  { id: "subj-11", name: "Cyan",       normal: "#7AB8C7", bright: "#47B6D1", tint: "#E2EEF0", deep: "#246575", highlight: "#47B6D1" }, // prettier-ignore
  { id: "subj-12", name: "Teal",       normal: "#7AC7B8", bright: "#47D1B6", tint: "#E2F0EE", deep: "#247565", highlight: "#47D1B6" }, // prettier-ignore
  { id: "subj-13", name: "Green",      normal: "#7AC79B", bright: "#47D183", tint: "#E2F0E8", deep: "#247547", highlight: "#47D183" }, // prettier-ignore
  { id: "subj-14", name: "Leaf",       normal: "#7AC77A", bright: "#47D147", tint: "#E2F0E2", deep: "#257425", highlight: "#47D147" }, // prettier-ignore
  { id: "subj-15", name: "Lime",       normal: "#9AC77A", bright: "#81D147", tint: "#E8F0E2", deep: "#467524", highlight: "#81D147" }, // prettier-ignore
] as const;

/** Swatch lookup by id — both the v1.3 15-slot scale and the legacy 20-pool
 *  resolve here, so saved mappings referencing either keep working. v1.3
 *  slots are listed first so a duplicate id (there are none today) would
 *  prefer the brand scale. */
export const PALETTE_BY_ID: Record<string, PaletteSwatch> = Object.fromEntries(
  [...SUBJECT_SWATCHES, ...PALETTE_20].map((s) => [s.id, s]),
);

/** Subject → swatch id mapping. */
export type SubjectMapping = Record<SubjectId, string>;

// Default subject → swatch assignment (v1.3). The 8 locked subjects map onto
// the muted 15-slot brand scale per the design kit's data.js:
//   math→1  reading→10  writing→2  grammar→7  spelling→5  ufli→3
//   explorers→13  sel→9
export const DEFAULT_SUBJECT_MAPPING: SubjectMapping = {
  math: "subj-1",
  reading: "subj-10",
  writing: "subj-2",
  grammar: "subj-7",
  spelling: "subj-5",
  ufli: "subj-3",
  explorers: "subj-13",
  sel: "subj-9",
};

/**
 * Resolve a subject's color tokens for a given palette type and mapping.
 * Pure — usable on the server or outside React. The `useSubjectColor`
 * hook in `palette.tsx` wraps this with the active PaletteContext.
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
  // `tint` is explicit on the v1.3 15-slot scale; legacy 20-pool swatches
  // omit it, so we mix a soft fill from `normal` to keep them usable.
  const tint = swatch.tint ?? `color-mix(in oklch, ${swatch.normal} 18%, #fff)`;
  const accent =
    type === "highlight" ? (swatch.bright ?? swatch.highlight) : swatch.normal;

  // Card background — a soft vertical wash of the tint so fills never read flat.
  const gradient = `linear-gradient(180deg, ${tint} 0%, color-mix(in oklch, ${tint} 55%, #fff) 100%)`;

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
