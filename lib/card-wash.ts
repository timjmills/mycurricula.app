// card-wash.ts — the per-card colour palette, in ONE place.
//
// `LessonResource.wash` (lib/types.ts) is the teacher's per-card colour
// override: absent = the subject's own colour, `"paper"` = white body, a number
// = that `--subj-<n>-tint` pastel. The FIELD has been in the model since the
// 6.12.26 redesign; what it never had was one owner for the palette.
//
// WHY THIS FILE EXISTS. Two surfaces let a teacher set a card's colour — the
// lesson resource card (components/resources/ResourceCardFace) and the Resource
// Wall's note composer — and they were about to offer DIFFERENT swatches, because
// each would have carried its own array. A teacher who colours a card amber in a
// lesson and cannot find amber on the wall has not found a preference, they have
// found a bug. The list lives here so the two cannot drift.
//
// The subject scale itself runs `--subj-1 … --subj-15` precisely so per-card
// colour has room to exist without reusing a subject's hue (V2 Framework.md §4,
// "the Resource Wall's per-card colors"). This is the curated subset of it.

/**
 * The offered tints, in swatch order — a curated subset of `--subj-1…15`, not
 * the whole scale.
 *
 * THE SEVEN SLOTS NO TEAM SUBJECT OWNS. The eight locked subjects sit on
 * 1, 2, 5, 7, 9, 10, 12 and 13 (CLAUDE.md §4, DEFAULT_SUBJECT_MAPPING); these
 * are the remainder. That is the whole point of the header above — the scale
 * runs to fifteen "precisely so per-card colour has room to exist without
 * reusing a subject's hue" — and until now this list did not honour it: it was
 * `[1, 2, 5, 7, 10, 11, 12, 13, 9]`, i.e. every team slot plus one. A teacher
 * washing a card in Writing's pink was making it look like a Writing card.
 *
 * `5` was the sharpest case, because the paragraph directly above claimed it
 * was RESERVED — `--subj-5-bright` is the Team caution pink (CLAUDE.md §2),
 * which must never read as a colour a teacher chose for decoration — while the
 * array offered it anyway.
 *
 * Seven, not nine: dropping the eight team slots and keeping cyan leaves these.
 * Each still reads as a distinct PASTEL behind body text at every tone, which
 * was the original selection criterion (a picker where two swatches look the
 * same teaches a teacher that their choice did not register).
 *
 * ALREADY-STORED CARDS ARE UNAFFECTED. `LessonResource.wash` stores the NUMBER,
 * and `cardWashValue` builds `var(--subj-<n>-tint)` from it without consulting
 * this list — so a card saved on a now-unlisted slot keeps rendering exactly the
 * wash it always had. The one visible consequence is in the picker: its checked
 * state is `wash === n` over this array, so such a card shows no swatch
 * selected. Migrating stored values is a separate, deliberate decision.
 *
 * Order is deliberate and warm→cool, not numeric.
 */
export const CARD_WASH_TINTS: readonly number[] = [3, 4, 6, 8, 11, 14, 15];

/** Every choice the picker offers, including the two non-numeric ones. */
export type CardWash = "paper" | number | null;

/** The hue each offered slot actually is, for swatch labels. A picker whose
 *  accessible name is "Card colour 14" tells a screen-reader user nothing, and
 *  tells a sighted user nothing on hover either. Keyed by slot so a slot that
 *  leaves CARD_WASH_TINTS cannot leave a stale name behind. */
export const CARD_WASH_NAMES: Readonly<Record<number, string>> = {
  3: "Coral",
  4: "Rose",
  6: "Magenta",
  8: "Violet",
  11: "Cyan",
  14: "Leaf",
  15: "Lime",
};

/**
 * The CSS value for a card's body wash, or `null` to leave the subject default
 * in place.
 *
 * Returns a `var(…)` reference, never a resolved colour: the tints move with
 * the theme and the tone (tokens.css re-declares every `--subj-<n>-tint` under
 * the dark-tone branch), so resolving here would freeze a light-mode pastel into
 * a card that later renders on a dark surface — the exact legibility break
 * CLAUDE.md §4 forbids.
 */
export function cardWashValue(wash: CardWash | undefined): string | null {
  if (wash === "paper") return "var(--paper)";
  if (typeof wash === "number") return `var(--subj-${wash}-tint)`;
  return null;
}
