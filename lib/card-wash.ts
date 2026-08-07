// card-wash.ts — the DECORATIVE colour palette, in ONE place.
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
// WHAT IT NOW ALSO OWNS. The same question — "which hues may a teacher pick for
// something that is not a subject?" — was being answered separately, and
// differently, by every other decorative picker in the app: the rich-text
// editor's font-colour ramp, the lesson-editor floating bar's short row, the
// Daily planning-tab accents, the Year progression legend's checkpoint glyphs.
// Each had drifted onto team-owned slots. They now all read `UNOWNED_SLOTS`
// from here, so the rule is enforced by construction rather than by four
// independent acts of care.
//
// The subject scale itself runs `--subj-1 … --subj-15` precisely so per-card
// colour has room to exist without reusing a subject's hue (V2 Framework.md §4,
// "the Resource Wall's per-card colors"). This is the curated subset of it.

/**
 * The slots the eight locked team subjects occupy (CLAUDE.md §4's subject map:
 * math 1, ufli 2, writing 5, grammar 7, spelling 9, reading 10, sel 12,
 * explorers 13).
 *
 * TRANSCRIBED, NOT DERIVED, and deliberately so. Importing
 * `DEFAULT_SUBJECT_MAPPING` here would pull `lib/palette-data` — and through it
 * the whole 20-swatch palette module — into every client component that only
 * wants a list of seven numbers. The drift risk that buys is covered instead by
 * `tests/decorative-slots.test.ts`, which imports BOTH this module and the real
 * mapping and fails if a subject ever lands on a slot listed as unowned. A
 * transcription with a test behind it is the same discipline
 * `tests/subject-slot-map.test.ts` already uses for the handoff map.
 */
export const TEAM_OWNED_SLOTS: readonly number[] = [1, 2, 5, 7, 9, 10, 12, 13];

/**
 * THE SEVEN SLOTS NO TEAM SUBJECT OWNS — the only hues decorative and tool
 * colour may use.
 *
 * THE RULE. Colour is information, never decoration (CLAUDE.md §4), and the
 * subject→slot map is team-wide meaning, not a preference. So anything a
 * teacher picks for a reason that is NOT "this is that subject" — a card wash, a
 * word coloured in a note, an annotation pen — must come from the complement of
 * `TEAM_OWNED_SLOTS`. Otherwise a teacher who washes a card in Writing's pink
 * has made it look like a Writing card, and the stripe beside it means two
 * different things on one screen.
 *
 * Until this list was corrected it read `[1, 2, 5, 7, 10, 11, 12, 13, 9]` —
 * every team slot plus one. `5` was the sharpest case, because the paragraph
 * that introduced it claimed it was RESERVED (`--subj-5-bright` is the Team
 * caution pink, CLAUDE.md §2, which must never read as a colour someone chose
 * for decoration) while the array offered it anyway.
 *
 * Seven, not nine: dropping the eight team slots leaves exactly these. Each
 * still reads as a distinct hue at every tone, which was the original selection
 * criterion — a picker where two swatches look the same teaches a teacher that
 * their choice did not register.
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
export const UNOWNED_SLOTS: readonly UnownedSlot[] = [3, 4, 6, 8, 11, 14, 15];

/**
 * The slots decorative colour may name, as a TYPE.
 *
 * This is the load-bearing half of the rule. Every helper below takes
 * `UnownedSlot`, so a picker that reaches for a subject's hue is a compile
 * error at the callsite — caught by `tsc --noEmit` in the same pass that would
 * catch a typo, rather than at runtime on a teacher's screen. The runtime guard
 * in `slotSwatches` remains for values that arrive as plain `number` (a stored
 * wash, a probe, a JS test).
 */
export type UnownedSlot = 3 | 4 | 6 | 8 | 11 | 14 | 15;

/**
 * The offered card-wash tints, in swatch order.
 *
 * An ALIAS of `UNOWNED_SLOTS`, not a copy: a card wash is decorative colour, so
 * the two lists were always the same list, and the aliasing makes it impossible
 * for a later edit to answer the question differently in the two places. The
 * name is kept because the wash pickers read in wash vocabulary.
 */
export const CARD_WASH_TINTS: readonly number[] = UNOWNED_SLOTS;

/** Every choice the wash picker offers, including the two non-numeric ones. */
export type CardWash = "paper" | number | null;

/** The hue each unowned slot actually is, for swatch labels. A picker whose
 *  accessible name is "Card colour 14" tells a screen-reader user nothing, and
 *  tells a sighted user nothing on hover either. Keyed by slot so a slot that
 *  leaves `UNOWNED_SLOTS` cannot leave a stale name behind, and shared by every
 *  decorative picker so one hue cannot be "Leaf" in one menu and "Green" in
 *  the next. */
export const SLOT_HUE_NAMES: Readonly<Record<number, string>> = {
  3: "Coral",
  4: "Rose",
  6: "Magenta",
  8: "Violet",
  11: "Cyan",
  14: "Leaf",
  15: "Lime",
};

/** Wash-vocabulary alias of {@link SLOT_HUE_NAMES} — see `CARD_WASH_TINTS`. */
export const CARD_WASH_NAMES: Readonly<Record<number, string>> = SLOT_HUE_NAMES;

/** Is this slot free for decorative use? A TYPE GUARD, so a value that arrives
 *  as a plain `number` — a stored wash, a probe reading, a JS test — narrows to
 *  `UnownedSlot` once checked. The predicate the pickers and their tests share,
 *  so neither can be right about a rule the other gets wrong. */
export function isUnownedSlot(slot: number): slot is UnownedSlot {
  return (UNOWNED_SLOTS as readonly number[]).includes(slot);
}

/** One entry in a decorative colour picker: the slot, its hue name, and the
 *  custom-property NAME holding the colour (callers resolve it — `execCommand`
 *  cannot parse `var()`, and a resolved hex would freeze a light-tone value
 *  into a surface that later renders dark). */
export interface SlotSwatch {
  slot: UnownedSlot;
  label: string;
  /** e.g. `"--subj-3"`. */
  variable: string;
}

/**
 * Build a picker's swatch row from the unowned scale.
 *
 * `slots` lets a cramped surface offer FEWER than seven (the lesson-editor
 * floating bar is one row beside a dozen other controls) — but only ever a
 * subset of `UNOWNED_SLOTS`, which the parameter type enforces. The runtime
 * throw catches what the type cannot: a value that reached here as `number`
 * through an `as` cast or from untyped JS. A picker offering a subject's hue is
 * the exact bug this module exists to make impossible, and a silent fallback
 * would hide it behind a perfectly plausible swatch.
 */
export function slotSwatches(
  slots: readonly UnownedSlot[] = UNOWNED_SLOTS,
): SlotSwatch[] {
  return slots.map((slot) => {
    if (!isUnownedSlot(slot)) {
      throw new Error(
        `slotSwatches: --subj-${slot} is owned by a team subject (CLAUDE.md §4). ` +
          `Decorative colour may only use ${UNOWNED_SLOTS.join(", ")}.`,
      );
    }
    return { slot, label: SLOT_HUE_NAMES[slot], variable: `--subj-${slot}` };
  });
}

/** The `-` suffixed companions each slot carries (see CLAUDE.md §4's subject
 *  scale: solid, `-tint` fills, `-ink` text-on-tint, `-bright` dots/outlines). */
export type SlotVariant = "" | "-tint" | "-ink" | "-bright";

/**
 * A ready-to-use `var()` reference for a decorative colour — the form a style
 * attribute or SVG `stroke` wants.
 *
 * Returns the reference, never a resolved colour, for the same reason
 * `cardWashValue` does: every `--subj-*` token is re-declared under the
 * dark-tone branch, so resolving here would freeze a light-tone hue into a
 * surface that later renders dark (the legibility break CLAUDE.md §4 forbids).
 *
 * The `UnownedSlot` parameter is the point: callers that used to hard-code
 * `var(--subj-13)` for a decorative glyph now cannot name a subject's slot
 * without failing `tsc`.
 */
export function unownedSlotVar(
  slot: UnownedSlot,
  variant: SlotVariant = "",
): string {
  return `var(--subj-${slot}${variant})`;
}

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
