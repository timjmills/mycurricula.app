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

/** One paired swatch in the 20-color pool. */
export interface PaletteSwatch {
  id: string;
  name: string;
  /** Saturated, darker hex — the "regular" school-palette color. */
  normal: string;
  /** Highlighter-marker hex — bright, electric, candy-soft. */
  highlight: string;
  /** Text-on-color hex (~700–800). AA on either fill. */
  deep: string;
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

/** Swatch lookup by id. */
export const PALETTE_BY_ID: Record<string, PaletteSwatch> = Object.fromEntries(
  PALETTE_20.map((s) => [s.id, s]),
);

/** Subject → swatch id mapping. */
export type SubjectMapping = Record<SubjectId, string>;

// Default subject → swatch assignment. Picks the closest match to the
// tokens.css palette so the Quiet/Normal view keeps its established look.
export const DEFAULT_SUBJECT_MAPPING: SubjectMapping = {
  math: "ocean",
  reading: "leaf",
  writing: "violet",
  grammar: "teal",
  spelling: "blush",
  ufli: "coral",
  explorers: "amber",
  sel: "slate",
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
  const swatch = PALETTE_BY_ID[swatchId] ?? PALETTE_BY_ID.ocean;

  if (type === "highlight") {
    // HIGHLIGHT — highlighter-marker aesthetic. Card fills use a subtle
    // vertical gradient from the highlight hue to a softer mix.
    const gradient = `linear-gradient(180deg, ${swatch.highlight} 0%, color-mix(in oklch, ${swatch.highlight} 65%, #fff) 100%)`;
    return {
      c: swatch.highlight,
      cl: swatch.highlight,
      cd: swatch.deep,
      tile: swatch.highlight,
      deep: swatch.deep,
      bg: gradient,
      bgSolid: swatch.highlight,
      stripe: swatch.deep, // deep tone reads against the highlight fill
      gradient,
    };
  }

  // NORMAL — darker, confident school palette. Card fills still get a
  // soft vertical gradient so cards never feel flat.
  const gradient = `linear-gradient(180deg, color-mix(in oklch, ${swatch.normal} 18%, #fff) 0%, color-mix(in oklch, ${swatch.normal} 8%, #fff) 100%)`;
  return {
    c: swatch.normal,
    cl: `color-mix(in oklch, ${swatch.normal} 22%, #fff)`,
    cd: swatch.deep,
    tile: `color-mix(in oklch, ${swatch.normal} 35%, #fff)`,
    deep: swatch.deep,
    bg: gradient,
    bgSolid: `color-mix(in oklch, ${swatch.normal} 14%, #fff)`,
    stripe: swatch.normal,
    gradient,
  };
}
