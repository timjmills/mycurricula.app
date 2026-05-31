# Widget Visual Refresh — Update Guide

**Goal:** make the existing `mycurricula.app` widgets match the new mockups (`5.30.26 - Widgets.html`).
This is a **visual / styling** pass only — no behavior or data changes. Everything below is derived
from the rebuilt reference set. Hand this to a developer (or to Claude Code) as the spec.

> Once you grant the GitHub App access to `timjmills/mycurricula.app`, I can rewrite this as
> file-by-file edits against your actual components. Until then, this is framework-agnostic.

---

## 1. The shift in one sentence

Go from flat utilitarian cards to **soft pastel "paper" cards**: each widget is a rounded, lightly
color-tinted card, with a **colored icon chip + bold title** header, **white inner sub-cards**, and a
consistent **line-icon chrome row** (pin · expand · sun · more · ×) on the top right.

---

## 2. Drop in these design tokens

Add once, globally (CSS variables shown; Tailwind users map these to `theme.extend.colors`).

```css
:root{
  --font: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;

  --ink:#101729;        /* titles, numbers   */
  --ink-soft:#37405a;   /* secondary text    */
  --ink-mute:#6b7280;   /* subtitles, labels */
  --ink-faint:#9aa1ad;
  --chrome:#abb1bd;     /* header icons      */

  --r-card:22px;        /* OUTER widget radius */
  --r-inner:16px;       /* inner sub-cards     */
  --shadow-card:0 1px 2px rgba(16,23,41,.04), 0 6px 20px rgba(16,23,41,.05);
  --shadow-inner:0 1px 2px rgba(16,23,41,.05), 0 2px 8px rgba(16,23,41,.04);

  /* widget color families — bg(card) · chip(icon) · accent · soft(inner tint) · line */
  --yellow-bg:#fdf5da; --yellow-chip:#f6df84; --yellow-accent:#d99c08; --yellow-soft:#fbeec3; --yellow-line:#f0e3b0;
  --green-bg:#eaf6ed;  --green-chip:#bce6c6;  --green-accent:#1fa85a;  --green-soft:#d9f0df;  --green-line:#cde9d4;
  --pink-bg:#fce5ee;   --pink-chip:#f7bcd4;   --pink-accent:#e84e93;   --pink-soft:#fad3e3;   --pink-line:#f3c9da;
  --purple-bg:#f0ecfc; --purple-chip:#d6cbf7; --purple-accent:#7c5cf6; --purple-soft:#e5dcfb; --purple-line:#ddd3f5;
  --orange-bg:#fdeede; --orange-chip:#fbd2ac; --orange-accent:#f2802b; --orange-soft:#fbddc1; --orange-line:#f7d8bc;
  --blue-bg:#e9f1fe;   --blue-chip:#c1d9fb;   --blue-accent:#2e6be6;   --blue-soft:#d8e7fd;   --blue-line:#cfe0fb;

  /* card gradients — near-white top fading into the family tint (this is what each card uses) */
  --yellow-grad:linear-gradient(165deg,#fffdf3 0%,#fbf1cf 100%);
  --green-grad: linear-gradient(165deg,#f7fcf9 0%,#e4f3e9 100%);
  --pink-grad:  linear-gradient(165deg,#fef5f9 0%,#fbe0e9 100%);
  --purple-grad:linear-gradient(165deg,#faf8fe 0%,#ede8fb 100%);
  --orange-grad:linear-gradient(165deg,#fffbf5 0%,#fce8d6 100%);
  --blue-grad:  linear-gradient(165deg,#f6faff 0%,#e4edfe 100%);
}
```

**Family assignments** (keep these consistent — color carries meaning):

| Family | Widgets |
|---|---|
| Yellow | Text / Announcement · Sound Input · Lesson Flow (alt) |
| Green | Sound (mic) · Student Groups · Lesson Flow |
| Pink | Countdown |
| Purple | Quick Poll · Scoreboard · Board settings chip |
| Orange | Name Picker · Dice |
| Blue | Work Sound |

---

## 3. Global rules (apply to every widget)

1. **Card.** `background: var(--{family}-grad); border-radius: var(--r-card); padding: 22px;
   box-shadow: var(--shadow-card);` Cards use a **soft gradient** (near-white top → family tint bottom),
   NOT a flat fill — this is what gives the mockups their depth. Remove hard 1px borders; the gradient
   + soft shadow define the edge.
2. **Header.** Two supported styles:
   - *Compact* (dashboard): a small `UPPERCASE` label — `12px / 700 / letter-spacing:.12em /
     color:var(--ink-mute)` — then the chrome row.
   - *Expanded* (full view): **icon chip** (38×38, `border-radius:11px`, `background:var(--{family}-chip)`,
     icon in `var(--{family}-accent)`) + **bold 18px title** + optional **13px muted subtitle**.
3. **Chrome row.** Right-aligned line icons, `color:var(--chrome)`, 28×28 hit targets, hover →
   `background:rgba(16,23,41,.06)`. Order: `pin · expand · sun · more(⋮) · ×`. Use stroke-2
   Lucide/Feather icons. **Replace any filled/heavy icons with thin stroked ones.**
4. **Inner sub-cards** (numbers, dice, score tiles, meters): white, `border-radius:var(--r-inner)`,
   `box-shadow:var(--shadow-inner)`, no border.
5. **Type.** Plus Jakarta Sans everywhere. Titles/numbers `font-weight:800` with tight tracking
   (`letter-spacing:-.3px` titles, `-1.5px` big numbers). Body `500–600`.
6. **Primary buttons** are solid in the family accent, `border-radius:14px`, `font-weight:700`
   (e.g. orange "Pick a name" / "Roll"). Secondary = white pill with `--shadow-inner`.
7. **Radii ladder:** card 22 · inner 16 · buttons 14 · chips 11 · pills 999.

---

## 4. Per-widget before → after

**Text / Announcement** — yellow card; large centered `25–30px/800` navy text; optional accent
color on a key span (e.g. page numbers in `--orange-accent`). Decorations optional, keep to a few
small dots/squares.

**Work Sound** — blue card. Big headphones + current level (`34px/800`) in a `--blue-soft` inner card,
then a row of level buttons (Silent/Whisper/Partner/Group[/Ask teacher]). Selected button =
`background:#bcd6fb` + `inset 0 0 0 2px var(--blue-accent)`, label + icon in accent. Add the info pill
"Students can see the current voice level" with a pin-location icon.

**Quick Poll** — purple card. Question in a `--purple-soft` inset; each option row = white pill with an
emoji face circle, label, a `9px` rounded track filled in `--purple-accent`, count, and `%`. Footer
"N responses".

**Countdown** — pink card. Three `--pink-soft` tiles, number `46–52px/800` navy, unit label
`12px/800` in `--pink-accent`. "Edit" as a small pencil action in the header.

**Scoreboard** — purple card. Two white score tiles; big number in the team's accent
(team 1 = `--purple-accent`, team 2 = `--blue-accent`); `−` = neutral `#eef0f5` button, `+` = solid
accent button. Optional `vs` chip between tiles. Footer: "Add team" / "Reset all scores".

**Dice** — orange card. White dice tiles with navy pips (render faces from pip coordinates, not a font);
"Sum N" in a `--orange-soft` strip; solid orange "Roll" button.

**Sound Input / Microphone** — green (expanded) or yellow (compact) card. A segmented level meter
(rounded bars; lit bars in accent), "Turn on microphone" with mic icon, and a "Loud at" slider with a
white knob + value.

**Lesson Flow** — green/yellow card. Each activity row = tinted inner card with a grip handle, a colored
numbered circle, title + subtitle, a time pill (`clock` + "20 min"), and a `⋮`. "+ Add activity" =
dashed-border ghost row.

**Student Groups** — green card. Each group = white inner card: colored numbered circle (cycle hues
140/210/265/330), "Group N" + "N students", then 4 dashed-circle `+` add-slots tinted to the group hue.
Footer hint card with a people icon.

**Name Picker** — orange card. Dashed `--orange-line` box on `--orange-soft`; empty state = users icon +
"No name selected yet"; solid orange "Pick a name" button with a pointing-hand icon. Bar variant: same
palette laid out horizontally with a "Pick from: Class ▾" selector.

**Board settings** — white card (this one stays neutral). Gear chip + "Board settings" + ×; "Board name"
field + solid blue "Save"; tab row (Background/Colours/Patterns/Gradients) with active tab underlined in
`--purple-accent`; the "None" option as a selected radio row; 5-swatch rows for colours/patterns/gradients;
a soft-red "Reset board" warning card at the bottom (`background:#fdecec`, text `#cf4544`).

---

## 5. Suggested order of work

1. Add tokens + load Plus Jakarta Sans.
2. Build/centralize three shared pieces: `WidgetCard`, `WidgetHeader` (icon chip + chrome), and the
   line-icon set. Almost everything else is composition.
3. Convert widgets family-by-family; verify each against the matching card in `5.30.26 - Widgets.html`.
4. Last: the decorative confetti/sparkle accents (Text, Countdown) — purely cosmetic, basic shapes only.

The reference file `5.30.26 - Widgets.html` is the source of truth for exact spacing, sizes, and color
usage — open any widget there and match it.
