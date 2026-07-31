# Subject Colour System — data-driven subjects, unlimited colour

**Mode E — plan unbuilt work.** Report and plan only; no component, token, or
migration code was written.

- **Date:** 2026-07-31
- **Tree measured:** `c8963ca`, working tree **dirty** (many concurrent lanes).
  Every source citation below was read from the working tree. No claim here is
  made *about a commit* — this is a plan, not a regression report.
- **Evidence mix:** 12 findings — **8 Observed, 3 Inferred, 1 Unverified.**
- **Measurement instrument:** `chromium.launch({channel:"chrome"})` against a
  standalone harness linking the real `app/tokens.css`. Colours were
  **canvas-resolved to sRGB 0–255** (`ctx.fillStyle` → `getImageData`) before any
  WCAG maths, because Chrome returns `oklch(...)` for `color-mix(in oklch, …)`
  and a string-scraping parser cannot read it. The instrument carries a control
  (a known hex must round-trip exactly; a known `oklch()` must not fall back to
  `#000`); **all 5 control runs passed**. Harness lives outside the repo at
  `C:\Users\losey\AppData\Local\Temp\subjmeasure\` (`harness.html`,
  `measure.mjs`, `refine.mjs`, `result.json`).

> **Authority chain applied:** bundled mockup > `V2 Framework.md` >
> design-system CSS > plan. Where this document proposes something the handoff
> does not contain, it says so explicitly (see §A.4 and F-03).

---

## A. Recommendation summary

**The capability.** Subjects become school-defined data with an arbitrary stored
colour. The 15 `--subj-*` slots become *presets*; a full picker sits behind them.
On a pick that fails contrast the system **accepts it and auto-adjusts** — the
teacher's colour is stored as the subject's identity, and the tint/ink/mark
companions are **computed per tone** so legibility always holds.

**The recommended direction — "Preset-preserving derivation."**

1. **Store one colour** (the identity solid) per subject, plus an optional
   preset slot id. Nothing else is stored — no baked-in tint/ink.
2. **Presets short-circuit.** If the subject points at one of the 15 slots, it
   keeps the hand-authored `-tint` / `-ink` / `-bright` triad exactly as today.
   This is what makes locked decision 3 true by construction: the 8 subjects do
   not move because *their code path does not change*.
3. **Custom colours derive**, in **OKLCh**, by *setting absolute lightness and
   clamping chroma* — not by mixing a fixed percentage. Measured below: this is
   the difference between 100% pass and 3-in-12 failure.
4. **The ink/tint pair is a closed opaque system.** Contrast is guaranteed
   between the derived ink and the derived tint, never against the page. That is
   what makes the guarantee survive Photo/Glass, where the backdrop is
   genuinely unknowable at token-definition time.

**Why it matters.** Today an unrecognised subject is silently painted Math gold
(§D, DATA-01) — a school with 12 subjects gets 12 correct names and up to 12
gold cards. The colour system is the product's primary at-a-glance signal, and
it currently only works for one hard-coded school.

### A.4 — What the handoff does and does not sanction

Read directly (Observed):

- `design-system/colors_and_type.css:31-52` — **all 45 tint/ink values and all
  15 brights are hand-authored hexes.** Zero `color-mix`, zero derivation in the
  whole 143-line file.
- `V2 Framework.md:176-198` — describes `-tint`/`-ink`/`-bright` as *given*
  companions with semantic roles. **It states no derivation formula and no
  contrast ratio** beyond a blanket "WCAG AA minimum" (`:518`).
- The house colour space is **oklab**: `color-mix(in oklab, …)` appears **415**
  times across the bundle vs **40** `in srgb`. **`oklch` appears zero times in
  the entire handoff.** The repo's `app/tokens.css:1743-1774` dark recipe
  (`color-mix(in oklch, …)`) is a repo-only invention.
- **The mockup already derives fills from the solid** —
  `mockup/New v2 Site Design.bundled.html:5596-5603` paints a week cell as
  `color-mix(in oklab, var(--subj-N) 26%, white)` with `borderLeftColor` = the
  raw solid and `color` = the **hand-authored** ink. So: *the handoff derives
  tints and never derives inks.* Deriving the ink is the genuinely new step.
- `design-system/themes.css:278-283` — the handoff's existing answer to "a light
  subject colour under white text" is to **deepen the fill floor**:
  `color-mix(in oklab, var(--cellc) 92%, #15131f)`. Prior art for a
  lightness-forcing step.

**Therefore:** proposing a derivation is an *extension beyond the handoff*, not
an application of it. It is justified because the handoff's premise — a fixed set
of curated hues — is exactly the premise locked decision 1 removes. Using
**OKLCh** rather than OKLab is a coordinate change, not a colour-space change:
OKLCh *is* OKLab in polar form, and only the polar form lets you clamp chroma
while preserving hue in a single expression. The perceptual space the handoff
committed to is preserved.

---

## B. Existing-product context

### B.1 What the derivation must survive

`data-tone` ∈ `light | dark` is **derived**, never chosen (`CLAUDE.md` §4;
`BUILD_STANDARD.md:612-614`). Every surface must branch on tone, never theme.
The combinations in scope: Wash, Photo-Dim, Photo-Bright, Night, and the light
themes.

Verified (Observed, `Documents/.../design-system/themes.css`, 409 lines): **no
rule keyed on `[data-theme=…]` touches any `--subj-*` value.** The CLAUDE.md
claim "subject + status colors never move" holds **for the theme axis only** —
tone, background and photo-brightness *do* re-render subject colour
(`themes.css:211`, `:278-283`; `modes.css:360-366`). That distinction matters:
the derivation must be a function of **tone**, and it is safe to ignore theme.

### B.2 The two colour families already in the repo

`--subj-1…15` (+`-tint`/`-ink`/`-bright`) is the subject family.
`--wf-*` (`app/tokens.css:726-781`) is a **second, parallel, hand-authored
family** — 10 colours × `bg`/`chip`/`accent`/`soft`/`line`/`grad` — driving the
Resource Wall's per-card colours, and explicitly excluded from theming
(`tokens.css:1429-1430`). A generic derivation should be built once and be
capable of serving both; building a third bespoke ramp would be the mistake.

### B.3 The delivery mechanism that already exists

`lib/palette.tsx:65-108` `PaletteCssBridge` renders a single `<style>` element
emitting one `.cp-subj.<id> { --c; --cl; --cd; --sc; --sct; --sci }` rule per
subject. **This is the right insertion point** — it already does runtime
per-subject CSS variable emission. It just iterates the wrong list (the 8-member
`SUBJECTS` fixture).

---

## C. User and product definition

- **Users:** teachers; in practice the one teacher per team who sets up the
  roster. Subject colour is **team-wide** (locked decision 5) — one teacher's
  pick changes what every colleague sees.
- **Problem:** the colour system encodes one school's eight subjects. Any other
  school gets silent mis-colouring, not an error.
- **Primary task:** set a subject's colour and see it take effect everywhere.
- **Secondary tasks:** rename/add/archive a subject; distinguish which subject a
  Lesson Plan or Unit Plan belongs to at a glance.
- **Entry point:** `app/settings/subjects/page.tsx` (exists; has a swatch grid at
  `:569-598`) and the onboarding course step
  (`components/onboarding-v2/steps/courses-step.tsx:24-33`).
- **Permissions:** team-scoped write. Because the change is team-wide, the
  control's tooltip must pass `required: true` (`CLAUDE.md` §4 always-on
  exception — "team-wide settings").
- **Success criteria:** (a) a school with 12 arbitrary subjects renders 12
  distinguishable colours; (b) every derived ink-on-tint pair measures ≥4.5:1 at
  both tones; (c) the 8 locked subjects render byte-identically to today.

---

## D. Findings

12 findings. IDs are stable for later resolution.

### DATA-01 — `subjectSlugOf` unconditionally returns `"math"`. **Critical. Observed.**

`lib/planner/supabase-source.ts:1050-1060`:

```ts
return (SUBJECT_IDS.has(row.color) ? row.color : "math") as SubjectId;
```

The condition is **dead** — line 1054 already returned when
`SUBJECT_IDS.has(row.color)` was true, so by line 1059 it is known false and the
expression is always `"math"`. Every subject row whose slug is not one of the 8
is coerced to Math *at index-build time*, before any lookup can miss.

Nine production coercion sites, eight of them in this one file: `:1059`,
`:1474`, `:1508`, `:1564`, `:1578`, `:2832`, `:2967`, `:3027`, plus
`lib/subjects/row.ts:58-60` (the courses/sharing seam). Two more in UI:
`components/teach/left/modules/LessonCardModule.tsx:29`,
`components/resource-wall-v2/ResourceWall.tsx:631`.

Worst is `:1578` (`listSubjects`) — the coerced id drives **`cls`** (the CSS
class) and **`icon`**, so a school's twelve subjects display correct *names* over
up to twelve gold `Ma` monograms.

A second, structural miss source: `loadSubjectIndex` filters
`.eq("scope","team")` (`:1074`), so any lesson pointing at a `scope='personal'`
subject misses the map entirely and takes `?? "math"` **today**.

**Fix:** the fallback must die in the same change. Replace with an explicit
unresolved-subject representation that renders neutral and is observable, never
a silent alias of a real subject.

### DATA-02 — the schema has nowhere to put a colour. **High. Observed.**

`supabase/migrations/20260518102823_initial_schema.sql:289-324` — `subjects.color`
is `text not null`, **unconstrained**, and it does not store a colour: it stores
the SubjectId slug (`'math'`, `'reading'`). There is no hex column, no swatch
column, no CHECK, no Postgres enum.

The good news: every FK is already **uuid-keyed** (`units.subject_id`,
`boards.subject_id`, `time_blocks.subject_id`, `coverage_snapshots.subject_id`,
…). The relational layer is already arbitrary-subject-ready. The break is
entirely in the slug round-trip and in TypeScript.

### VIS-01 — there is no light-tone derivation, and the dark one cannot be reused. **Critical. Observed (measured).**

Light tone uses literal hand-authored hexes (`tokens.css:178-222`). The only
derivation in the repo is the dark branch (`:1743-1774`). Applying that same
recipe on the light surface, measured:

| Input | ink-on-tint | |
|---|---|---|
| `#ffff00` | **1.03** | FAIL |
| `#ffffff` | **1.00** | FAIL |
| `#ff0000` | **1.71** | FAIL |
| `#808080` | **1.66** | FAIL |
| … | | **11 of 12 fail 4.5:1** |

Only `#000000` (4.69) passes. The light tone needs its own derivation, and it
does not exist today in any form.

### VIS-02 — the existing fixed-percentage dark recipe fails on arbitrary input. **High. Observed (measured).**

`color-mix(in oklch, X 24%, var(--surface))` / `color-mix(in oklch, X 62%, white)`
holds for all 15 curated slots (measured 5.81–7.43) **because those hues are
curated to a narrow lightness band**. On arbitrary input, against surface
`#1e1d2c`:

| Input | ink-on-tint | |
|---|---|---|
| `#000000` pure black | **1.87** | FAIL |
| `#0b1030` deep navy | **2.82** | FAIL |
| `#0000ff` pure blue | **4.44** | FAIL |
| `#ffff00` | 8.21 | pass |
| … | | **3 of 12 fail** |

A fixed mix ratio preserves the *input's* lightness; a guarantee requires
*setting* lightness. This is the technical heart of the whole change.

### A11Y-01 — the shipped subject solids fail non-text contrast on light tone. **High. Observed (measured). Pre-existing.**

Each `--subj-N` measured as a mark against `--surface` `#ffffff`. WCAG 1.4.11
requires **3:1** for informational non-text (a subject stripe *is*
informational — it is the three-tier forking signal):

| Slot | ratio | | Slot | ratio |
|---|---|---|---|---|
| subj-1 gold | **1.70** | | subj-12 teal | **1.96** |
| subj-15 lime | **1.94** | | subj-13 green | **2.01** |
| subj-14 leaf | **2.04** | | subj-2 apricot | **2.17** |
| subj-11 cyan | **2.21** | | subj-10 blue | **2.78** |
| subj-3 coral | **2.80** | | subj-6 magenta | **2.98** |

**10 of 15 fail.** (Dark tone passes all 15, 4.49–9.76.) This is not introduced
by the new work — but it *is* the reason the derivation must produce a **fourth
role**: a contrast-clamped **mark** for stripes/dots/outlines, distinct from the
identity solid. Locked decision 3 keeps the 8 solids unchanged; the mark is what
makes them usable as marks.

### VIS-03 — the derivation visibly moves the 8 locked subjects. **Medium. Observed (measured).**

Applying the proposed recipe to the curated slots changes them:

| Slot | authored tint / ink | derived tint / ink |
|---|---|---|
| subj-1 | `#f4efdf` / `#7a671f` | `#faefc5` / `#5f4b00` |
| subj-9 | `#e2e3f0` / `#242975` | `#e6ebff` / `#424486` |
| subj-12 | `#e2f0ee` / `#247565` | `#c7fbf0` / `#005b4f` |

Measured ink-on-tint moves from a 4.70–9.99 spread to a flat 7.05–7.66. More
uniform, but **different** — which locked decision 3 forbids.

**This is why presets must short-circuit to the authored triad.** The cost is a
hybrid: two subjects with near-identical colours can get companions from
different rules. Accepted, and worth documenting in the token file.

### VIS-04 — achromatic picks collapse to one tint. **Medium. Observed (measured).**

Because the tint clamps chroma, three different picks produce the *same* fill:

| Pick | derived light tint | derived dark tint |
|---|---|---|
| `#000000` | `#eeeeee` | `#2e2e2e` |
| `#ffffff` | `#eeeeee` | `#2e2e2e` |
| `#808080` | `#eeeeee` | `#2e2e2e` |

Their **marks** still differ (the L clamp maps black→0.30, white→0.58), so
stripes and dots stay distinguishable; only the fills merge. Consistent with
locked decision 4 (accept and auto-adjust, never block), but it must be a
documented consequence, and the picker should avoid *offering* near-grey presets.

### CODE-01 — the closed union is load-bearing in ~35 places. **High. Observed.**

- `lib/types.ts:5-14` — the union. `Subject` (`:16-25`) has **no colour field**;
  colour is derived from `id` alone. That is the crux.
- `lib/palette.tsx:65-108` — `PaletteCssBridge` iterates the 8-member fixture.
- `lib/mock/subjects.ts` — a "mock" imported by **9 production modules** as the
  authoritative catalog (`lib/palette.tsx:16`,
  `lib/planner/supabase-source.ts:1045`, `lib/subjects/row.ts:16`,
  `lib/use-subject-settings.ts:49`, `lib/subject-order.ts:40`, …).
- **21** `Record<SubjectId, …>` declarations; **11** hard-coded 8-item arrays
  (incl. `app/(planner)/subject/[slug]/page.tsx:14-23`, which also drives
  `generateStaticParams` → 8 prerendered pages).
- **No switch statements and no zod enums** over subjects — every dispatch is an
  object literal. That makes the refactor mechanical.
- CSS is better than feared: **16 rules in 2 files** (`tokens.css:247-285` and
  `:1157-1277`; `globals.css:162-244`). No component CSS module hard-codes a
  subject name as a selector — the whole `components/**` tree only *consumes*
  `var(--c)`/`--cl`/`--cd`.

### CODE-02 — print hatch patterns assume exactly 8 subjects. **Medium. Observed.**

`app/globals.css:162-244` — 8 `@media print` rules assigning a distinct
`--subject-pattern` hatch (angle/dash/density) per subject, with a comment at
`:130-161` stating the set is deliberately sized to "eight distinct hatch
patterns, one per canonical subject". Colour is unavailable in B&W print, so
this shape cue is the *only* subject signal on paper. Needs a generative answer
(index the pattern off stored data, cycling) or an explicit decision to drop it.

### UX-01 — the Lesson Plan spends its title slot on a `<select>`, leaving unit identity at 12px. **High. Observed.**

Per the clarified requirement: colour carries subject, **numbering carries
unit**. On the Lesson Plan the numbering is nearly absent.

- `components/lesson-plan-v2/PlanPage.tsx:244-263` — the `--t-20`/700 title slot
  (`ExplorerShell.module.css:168-183`) is a lesson `<select>`.
- `PlanPage.tsx:271-286` — the unit is a **12px underlined crumb** in `.hsub`,
  downstream of the subject name.
- `LessonWorkspace.tsx:622-641` — the only body-level unit reference is in
  `MetaStrip`, which the **modal host suppresses**. In the modal the entire
  scrolling body states no unit at all.

Contrast with the Unit Plan, which gets this right: `UnitExplorer.tsx:559-567`
splits the ordinal off and **bolds it** in the `--t-20` title
(`<b>{prefix}</b>&nbsp;{rest}`). The fix is to give the Lesson Plan the same
treatment — structural and typographic, **not** chromatic.

### UX-02 — the unit navigator strips the unit number. **High. Observed.**

`components/year-v2/UnitWorkspaceRail.tsx:33-36`, rendered at `:167`:

```ts
function stripUnitPrefix(name: string): string {
  const idx = name.indexOf("·");
  return idx === -1 ? name.trim() : name.slice(idx + 1).trim();
}
```

The rail lists "Fractions on a Number Line", "Realistic Fiction" — with the
ordinal removed **exactly where the teacher is choosing between units**. This is
the single clearest instance of the clarified requirement being violated, and it
is a four-line fix.

### DATA-03 — unit number is not modelled; two ordinal sources disagree. **Medium. Observed.**

`lib/types.ts:55-74` — `Unit` has `id, subject, name, weeks, startWeek?,
endWeek?, shade`. **No `order` / `number`.** Every ordinal is either parsed out
of the name string (`splitUnitName`, `stripUnitPrefix`) or derived from array
position (`lib/year-v2-data.ts:81-91`).

Both are rendered **side by side in the same header**: `UnitExplorer.tsx:562`
shows bold `Unit 3` (parsed from the name) while `:571` shows `Unit 3 of 7`
(derived from index). Nothing keeps them in agreement. If numbering is to carry
unit identity, it has to be a real field.

### A11Y-02 — the shell title is not a heading. **Medium. Inferred.**

`ExplorerShell.tsx:412` renders the title as `<div id={titleId}>`, with the
accessible name supplied only via `aria-labelledby`. Both the Lesson Plan and the
Unit Plan therefore expose no heading for their primary identity. Inferred from
source; **not verified with a screen reader** — the check is a VoiceOver/NVDA
pass, or an axe run on an open Unit Plan.

**Omitted (4):** the `--math-light`/`--math-deep` vs handoff `--math-tint`/
`--math-ink` naming drift; the repo's `oklch` vs handoff `oklab` mixing drift;
`specs/design-system-brief.md:57-66` contradicting the Framework subject map
(stale — Framework/mockup win); and the hard-coded `#fff`/`rgba(255,255,255,…)`
cluster in `plan-page.module.css` that only works because it always sits on the
gradient.

---

## E. What is working well — preserve these

Named specifically, because a colour refactor is exactly the kind of change that
regresses things nobody complained about.

1. **The 15-slot scale with the tint/ink/bright triad is genuinely good prior
   art, and it is measurably correct.** All 15 authored pairs clear AA at both
   tones — **4.70–9.99 light, 5.81–7.43 dark** (measured). Three roles is also
   the *right* decomposition: fill, text-on-fill, and mark. **Keep the triad, keep
   the 15 values, keep them as the preset path.** The change adds a fourth role
   and a fallback; it should not touch these numbers.

2. **Tone-branching rather than theme-branching is already correct.** The dark
   overrides key off `:root[data-tone="dark"]` (`tokens.css:1441-1448`), unioning
   the night selector in only for the flag-OFF v1 DOM. Verified: no theme rule
   anywhere touches a subject token. The derivation inherits a sound axis model —
   it needs one branch, not seven.

3. **The `@media screen` wrapper around every theme override**
   (`tokens.css:1412-1416`) means **print always falls back to the light values**
   with no per-component print overrides. Any derivation must be authored inside
   the same wrapper or it will silently leak into print.

4. **The whole per-subject CSS surface is only 16 rules in 2 files.** Every
   component module consumes `var(--c)`/`--cl`/`--cd` generically. This is why an
   apparently sweeping change is tractable — the abstraction was drawn in the
   right place years before it was needed.

5. **`PaletteCssBridge` already is the runtime colour-injection mechanism**
   (`lib/palette.tsx:65-108`) — a single `<style>` element, memoised on context.
   No new architecture is required; it needs a different input list.

6. **The database is already uuid-FK'd throughout.** Ten tables reference
   `subjects(id)` by uuid, never by slug. The hard part of a
   "subjects-become-data" migration is already done.

7. **`resolveSubjectColor` returns token *references*, not resolved hexes**
   (`lib/palette-data.ts:216-226` emits `var(--subj-N-tint)`), which is precisely
   what lets the night overrides cascade through for free. Preserve that
   indirection — the derivation must also emit references or expressions, never
   pre-resolved hexes, or the tone branch dies.

8. **The Unit Plan's bolded-ordinal title is the pattern to copy**
   (`UnitExplorer.tsx:559-567`). It already does what the clarified requirement
   asks for.

---

## F. The derivation (A)

### F.1 Colour space, and why

**OKLCh**, via CSS relative colour syntax. Justification:

- OKLCh **is** OKLab in polar coordinates. The handoff's commitment to a
  perceptual space (415 × `color-mix(in oklab`) is preserved; only the
  coordinates change.
- The polar form exposes **chroma as a single scalar**, so "clamp saturation,
  preserve hue" is one expression. In OKLab it requires manipulating `a`/`b`
  jointly and does not preserve hue.
- `color-mix()` **cannot set absolute lightness** — it can only interpolate
  between two colours. VIS-02 is precisely a fixed-interpolation failure. Setting
  `L` requires relative colour syntax.

**Verified supported** in the installed Chrome:
`CSS.supports("color","oklch(from #dcc674 0.42 0.13 h)")` → `true` (Observed).

### F.2 The four roles

| Role | Purpose | Contrast partner | Target |
|---|---|---|---|
| **solid** | stored identity; the swatch the teacher chose | — | none (identity) |
| **tint** | fills, lanes, chips, card bodies | the ink | — |
| **ink** | text on tint | the tint | **≥4.5:1** (WCAG AA) |
| **mark** | stripes, dots, outlines, rings | the surface | **≥3:1** (WCAG 1.4.11) |

`mark` is the new role and it is what A11Y-01 requires. `bright` is retained as
the preset-only name for the same role.

### F.3 The recipe — measured, not proposed

Let `S` be the stored colour.

**Light tone**

```
tint  = oklch(from S 0.95 min(c, 0.055) h)
ink   = oklch(from S 0.42 min(c, 0.14)  h)
mark  = oklch(from S clamp(0.30, l, 0.58) c h)
```

**Dark tone**

```
tint  = oklch(from S 0.30 min(c, 0.06) h)
ink   = oklch(from S 0.86 min(c, 0.11) h)
mark  = oklch(from S clamp(0.62, l, 0.82) min(c, 0.16) h)
```

**Measured results** — 12 deliberately extreme inputs (pure black, pure white,
pure yellow, pure blue, neon green, hot magenta, mid grey, deep navy, pastel
peach, muted olive, pure red, pure cyan):

| Check | Target | Light | Dark |
|---|---|---|---|
| ink on tint | ≥4.5 | **6.32 – 7.63, 0/12 fail** | **8.27 – 9.10, 0/12 fail** |
| mark on surface | ≥3.0 | **3.56 min, 0/12 fail** | **4.36 min, 0/12 fail** |
| ink on tint, 15 curated slots | ≥4.5 | 7.05 – 7.66, 0/15 | 8.30 – 9.08, 0/15 |

The dark `mark` clamp was **tuned by measurement, not guessed**. A first attempt
(`clamp(0.55, l, 0.78) c`) failed pure blue at **2.64** — a fully saturated blue
has intrinsically low luminance even at high OKLCh L, so a lightness clamp alone
cannot rescue it. Sweeping the floor:

| Variant | min ratio | fails |
|---|---|---|
| `L≥0.55`, chroma untouched | 2.64 | 1 (pure blue) |
| `L≥0.62`, chroma untouched | 3.40 | 0 |
| `L≥0.62`, `min(c,0.16)` | **4.36** | **0** ← chosen |
| `L≥0.70`, `min(c,0.14)` | 5.82 | 0 (too washed) |

The chroma cap is what buys the margin: reducing saturation raises luminance for
dark-but-saturated hues. **A lightness clamp alone is not sufficient — the
derivation needs the chroma step.**

### F.4 The closed-system rule — the load-bearing constraint

**The ink/tint pair must be painted opaque.** Both are derived, so their contrast
is a closed two-body problem, independent of whatever sits behind the glass.
This is what makes the guarantee survive Photo-Dim, Photo-Bright, Wash and
Night without ever needing to know the backdrop — the trap that makes
"canvas-resolve the stacked translucent background" otherwise unsolvable at
token-definition time.

**If any surface paints the tint at reduced alpha over glass, the guarantee
breaks.** `modes.css:193` and `:228` do exactly that in the handoff's frame
engine (mixing `--sc` into `rgba(255,255,255,.9)` / `rgba(32,36,52,.87)`).
Verifying which repo surfaces paint a translucent subject fill is **the single
most important pre-build check** and is listed as Unverified in §J.

The `mark`, by contrast, *is* measured against the surface — so `--surface` must
be the opaque token, and a mark placed directly over a photo needs the existing
scrim/veil, exactly as today.

### F.5 Preset short-circuit

```
if subject.preset_slot is one of subj-1..15:
    tint = var(--subj-N-tint); ink = var(--subj-N-ink); mark = var(--subj-N-bright)
else:
    derive from subject.color per F.3
```

This makes locked decision 3 true **by construction** — the 8 subjects keep the
authored triad because their code path is unchanged. It also preserves the
night-override cascade (see §E.7).

### F.6 No dependency is required

The recipe is pure CSS. **No colour-manipulation library is needed and none
should be added.** If relative colour syntax were ever unavailable, the fallback
is ~40 lines of published OKLab↔sRGB matrix maths computed in
`PaletteCssBridge` — still no dependency. Stating this explicitly per the brief:
a library is *not* unavoidable here.

---

## G. The picker (B)

### G.1 Where it lives

**`app/settings/subjects/page.tsx`.** It already hosts a swatch grid
(`:569-598`), a tooltip vocabulary, and the team/personal split. No new route.
Second entry point: `components/onboarding-v2/steps/courses-step.tsx:24-33`,
which should reuse the same component.

The page is inside `.set-panel`, already registered in the **SURFACE THEMING
CONTRACT** (`app/themes.css:1557`). If the picker opens its own popover it must
either reuse a registered class or add its root **and** scrim to that rule
(`themes.css:1550-1595`) — otherwise it looks off-theme in Honey/Blossom/Mint/
Sky/Night.

### G.2 Structure — presets first, custom behind

```
Colour
┌──────────────────────────────────────────────┐
│  ●  ●  ●  ●  ●   ← 15 preset slots, 44×44,  │
│  ●  ●  ●  ●  ●     radio group, hue order    │
│  ●  ●  ●  ●  ●                               │
│  ─────────────────────────────────────────   │
│  [ ⬛ Custom colour…                       ]  │
└──────────────────────────────────────────────┘
```

- **Presets are the fast path.** 15 slots, hue-ordered, `role="radiogroup"`.
  Already-used slots are marked (not disabled — reuse is legal, just flagged).
- **Custom** discloses a hue/lightness field plus a hex input. The hex input is
  the accessible path and must accept typed entry, since a 2-D gradient field is
  not keyboard-operable on its own.
- **≥44px** targets at every tier (`CLAUDE.md` §4). Rounded, per RULE #1.
- Preview shows all four roles live — **a chip (tint+ink) and a stripe (mark)** —
  because that is what the teacher will actually see, and because after
  auto-adjust the rendered chip legitimately sits a shade off the raw swatch.

### G.3 The auto-adjust disclosure

Locked decision 4 says accept and auto-adjust — never block, never merely warn.
So the UI must **explain, not gate**. Below the preview, only when the derived
colour departs measurably from the pick:

> Adjusted for readability. Your colour stays this subject's identity — the
> text and fill shades shift slightly so labels stay legible on every
> background.

This is a statement of fact, not a warning. No icon, no amber, no dismiss
button — it is not an error state.

### G.4 The always-on tooltip (`required: true`)

Subject colour is team-wide, so per `CLAUDE.md` §4 it is in the always-on
exception list and **ignores both per-id dismissal and the global off switch**.
It renders no "Turn off these tips" link.

Proposed copy — states the *consequence*, in the surrounding context, per the
§4 voice rule:

> **Sets this subject's colour for everyone on your team.** Every teacher's
> cards, stripes and chips for this subject change to match. The exact shades
> are adjusted per background so labels stay readable.

Existing page copy that becomes **false** and must change: `:381` ("Subject
colors are locked team-wide"), `:320`, `:313`, `:538`, and the "borrows a team
subject's colour" strings at `:576`/`:582`/`:622`. The team-wide *scope* claim
stays true; the *locked to eight* claim does not.

### G.5 States to design

Default · hover · focus-visible · selected · custom-open · invalid hex ·
duplicate-colour · saving · save-failed · read-only (non-owner) · reduced-motion
· 375/768/1440. The 15-swatch grid must reflow to 5 columns at 375px without
dropping below 44px — the constraint that decides the grid.

---

## H. Carrying colour into Lesson Plan and Unit Plan (C)

**Agreed on the clarification, explicitly:** colour carries subject identity,
numbering carries unit identity, and neither should do the other's job. Two units
of one subject **sharing** a colour is correct, not a collision. This is the
right reading of §4's "colour is information, never decoration" — a per-unit hue
would be decoration, because it would encode nothing the number does not already
encode, while spending the one signal that means "subject".

I found **no surface that needs more colour than this gives it.** No push-back.

### H.1 Both surfaces are one shell

`components/year-v2/ExplorerShell.tsx` is the shared modal chrome;
`UnitExplorer.tsx` (mode `unit`) and `lesson-plan-v2/PlanPage.tsx` (mode
`lesson`) are the two bodies. `UnitExplorer.tsx:484-493` swaps one for the other.
**One change to the shell serves both.**

### H.2 Subject colour — already present, and adequate

- `ExplorerShell.tsx:360` puts `cp-subj ${subject.cls}` on the modal root.
- `ExplorerShell.module.css:154-158` — the header band gradient from `var(--c)`.
- `planner-v2/atoms.module.css:25` — the 40px subject monogram, `background: var(--c)`.
- `UnitExplorer.module.css:317` — `border-left: 4px solid var(--c)` per lesson row.

**Recommendation: add no new subject tint here.** The header band plus the glyph
already answer "which subject am I in?" at the top of the viewport, and the §4
rule cuts against tinting more. The one gap worth closing:

- **`components/lesson-editor/LessonEditor.tsx`** — the largest region of the
  Lesson Plan — contains **zero** subject-colour references. It is embedded at
  `LessonWorkspace.tsx:763` as the default-open "Lesson flow" section. When a
  teacher scrolls, the header leaves the viewport and every subject cue goes with
  it. **Justification for the one addition:** a sticky section header carrying
  the subject **mark** (a 3px rule or dot), so identity survives scroll. That is
  information — "you are still in Math" — not decoration. A full tint of the
  editor body would be decoration and should not be added.

### H.3 Unit identity — the real gap

| Fix | Where | Change |
|---|---|---|
| **U-1** | `UnitWorkspaceRail.tsx:33-36`, `:167` | Delete `stripUnitPrefix`; render the ordinal. Four lines. Highest value per unit of effort in this document. |
| **U-2** | `PlanPage.tsx:244-286` | Promote the unit into the `--t-20` title line as a bolded ordinal (`<b>Unit 3</b> Fractions…`), matching `UnitExplorer.tsx:559-567`. Demote the lesson `<select>` to a secondary control beneath, or keep it inline but subordinate. |
| **U-3** | `LessonWorkspace.tsx:752` | Show `MetaStrip` in the modal host too, so the unit is stated in the body, not only in chrome that scrolls away. |
| **U-4** | `lib/types.ts:55-74` | Add `order: number` to `Unit`; make it the single ordinal source. Resolves DATA-03 and removes the parse-the-name hack that U-1 and U-2 both depend on. |
| **U-5** | `ExplorerShell.tsx:412` | Make the title a real heading (resolves A11Y-02). |

U-4 should land **first** — U-1 and U-2 are cleaner on top of a real field than
on top of `indexOf("·")`.

---

## I. Migration shape (D)

**No SQL here — the user and orchestrator own migrations.** What the schema must
carry:

1. **A colour on the subject.** `subjects.color` currently holds a slug. Either
   repurpose it to hold a CSS colour and add `preset_slot text null`, or add a
   new column and retire the slug. **Recommend: add `color_hex` + `preset_slot`,
   leave `color` in place during the transition**, so rollback is a read-path
   flip rather than a data restore.
2. **Backfill the 8 with their present slots** — `math→subj-1`, `ufli→subj-2`,
   `writing→subj-5`, `grammar→subj-7`, `spelling→subj-9`, `reading→subj-10`,
   `sel→subj-12`, `explorers→subj-13` (`V2 Framework.md:184-193`, which wins over
   the stale `specs/design-system-brief.md:57-66`). With the preset short-circuit
   (F.5) this makes decision 3 exact.
3. **A stable client identifier that is not the slug.** Today `cls` is the
   SubjectId and drives `.cp-subj.<id>`. It must become the subject **uuid** (or a
   per-workspace slug), because names and colours are now editable and neither is
   a stable key.
4. **Validation at the write boundary**, not a DB CHECK — the value space is open
   by design. Reject unparseable colour strings at the API; never store
   unvalidated text that will later be interpolated into CSS.
5. **`SubjectId` becomes `string`** (a branded id), `Subject` gains
   `color: string` and `presetSlot: string | null`. The 21 `Record<SubjectId,…>`
   become `Record<string,…>` or `Map`.
6. **The `?? "math"` fallback dies** (DATA-01) — all 11 sites, in the same
   change. Replacement: an explicit unresolved state rendering a neutral grey
   with the subject's real name, plus a logged warning. It must be *visible* that
   resolution failed. Also drop or widen `loadSubjectIndex`'s
   `.eq("scope","team")` (`:1074`).
7. **Provisioning/seed sites** that insert exactly 8 rows must carry the new
   columns: `supabase/seed.sql:65-82`, `seed-cloud.sql`,
   `20260724120000_multi_workspace.sql:471-481`,
   `20260606130000_individual_provisioning.sql:162`,
   `20260606160000_workspace_notebook_admin.sql:241`.

**Security note.** A stored colour is interpolated into a `<style>` element by
`PaletteCssBridge`. **This is a CSS-injection sink.** The stored value must be
validated against a strict colour grammar on write **and** re-validated on read
before interpolation — a subject name/colour is team-writable, so this is a
cross-tenant vector, not just a rendering bug. Treat as a Critical review item
for the §4a gate when the build lands.

### What breaks, ranked

1. `lib/planner/supabase-source.ts` — 8 coercions + the scope filter. The whole
   data-layer risk in one file.
2. `lib/palette-data.ts` + `lib/palette.tsx` — `resolveSubjectColor` must take a
   colour, not a subject id; `PaletteCssBridge` must iterate real subjects.
3. `lib/mock/subjects.ts` — a fixture that 9 production modules treat as
   authoritative. Must become a seed, not a source.
4. `app/(planner)/subject/[slug]/page.tsx:14-23` — 8 prerendered redirects;
   `generateStaticParams` must go dynamic.
5. `app/globals.css:162-244` — print hatches (CODE-02).
6. ~7 tests pinning the exact 8.

---

## J. What I could NOT verify

1. **Whether any repo surface paints a subject tint at reduced alpha over
   glass.** This is the one thing that would break the closed-system guarantee
   (F.4). The handoff's `modes.css:193`/`:228` do it; whether the repo's
   components do is **unchecked**. **Check:** grep `components/**/*.css` for
   `--cl`/`--sct`/`var(--c)` inside `rgba()`/`color-mix` with a transparent
   partner, then render one such card over Photo-Dim and measure the resolved
   text/background pair. **Until this is done, "contrast always passes" is
   guaranteed only for opaque fills.**
2. **Contrast over Photo backgrounds generally.** Everything measured here used
   the opaque `--surface`. Photo-Dim/Photo-Bright were **not** measured. The
   ink/tint pair should be immune by construction; the **mark** is not, since it
   is measured against the surface.
3. **Live rendering.** No dev server was started and no app route was opened —
   this is a plan, and §4b's live QA gate has not run. All layout, hierarchy and
   "how it looks" statements about Lesson/Unit Plan are from source
   (**Inferred**), not from pixels.
4. **Screen-reader behaviour** for A11Y-02 (Inferred only).
5. **Non-Chrome engines.** Relative colour syntax was verified in the installed
   Chrome only. Safari and Firefox were **not** tested. **Check:**
   `CSS.supports("color","oklch(from red l c h)")` in each, plus a decision on
   whether a `@supports` fallback to the preset triad is required.
6. **Whether 15 presets is still the right number** once schools define their own
   subjects. Unverified product question, not a technical one.

---

## K. Next build brief

Self-contained. Do these in order.

**Phase 0 — decide (blocks everything).**
- Confirm: add `color_hex` + `preset_slot`, keep `color` during transition (I.1).
- Confirm: `SubjectId` → branded `string`; `cls` → uuid (I.3).
- Run check J.1 (translucent subject fills). If any exist, the closed-system rule
  needs a documented exception before the derivation is authored.
- Run check J.5 (Safari/Firefox relative colour) and decide on a `@supports`
  fallback.

**Phase 1 — unit identity (independent of everything else; ship first).**
- U-4: add `Unit.order`. U-1: delete `stripUnitPrefix`. U-2: promote the unit into
  the Lesson Plan title. U-3: show `MetaStrip` in the modal host. U-5: real
  heading.
- No colour work. No migration. Verify at 375/768/1440.

**Phase 2 — the derivation, tokens only.**
- Author the four roles in `app/tokens.css` **inside the existing `@media screen`
  wrapper** (§E.3), light and dark branches, per F.3.
- Preset short-circuit per F.5 — the 15 authored triads are untouched.
- **Completion criterion:** re-run
  `C:\Users\losey\AppData\Local\Temp\subjmeasure\measure.mjs`; every derived
  ink-on-tint ≥4.5 and every mark-on-surface ≥3.0 at both tones, and the 15
  curated slots must measure **byte-identical** to the pre-change values.
  Promote that script to `scripts/probe-subject-contrast.mjs` so it is a
  standing gate.

**Phase 3 — data layer.**
- Kill all 11 `?? "math"` sites (DATA-01) and the `.eq("scope","team")` filter.
- Widen `resolveSubjectColor` / `PaletteCssBridge`.
- Add the write-boundary colour validation (I, security note).

**Phase 4 — the picker.**
- `app/settings/subjects/page.tsx` per §G, including the `required: true` tooltip
  and the copy corrections at `:313`, `:320`, `:381`, `:538`, `:576`, `:582`, `:622`.

**Phase 5 — long tail.** Print hatches (CODE-02), `generateStaticParams`, tests.

**Gates before done:** §4a Codex review (the security note in §I makes this
mandatory, not optional) **and** §4b live QA at 375/768/1440 across Wash,
Photo-Dim, Photo-Bright and Night.

---

## Closing

1. **Reviewed:** `app/tokens.css` (subject + `--wf-*` families, tone branches),
   `app/themes.css` (surface-theming contract), `lib/palette.tsx`,
   `lib/palette-data.ts`, `lib/types.ts`, `lib/theme.tsx`,
   `lib/planner/supabase-source.ts`, `lib/mock/subjects.ts`,
   `app/settings/subjects/page.tsx`, the Lesson Plan / Unit Plan component tree,
   the initial-schema migration, `BUILD_STANDARD.md` §7/§15, and the v2 handoff
   (`V2 Framework.md`, `colors_and_type.css`, `themes.css`, `modes.css`, the
   bundled mockup).
2. **Changed:** nothing in the app. One new document (this file).
3. **Files affected:** `docs/audits/2026-07-31-subject-colour-system.md` only.
   No token, component, or migration file was edited.
4. **Checks run:** canvas-resolved WCAG measurement of 15 curated pairs × 2 tones,
   15 solids × 2 tones, 12 arbitrary inputs × 2 recipes × 2 tones, and a 5-variant
   clamp sweep — with instrument controls passing on all 5 runs. **Checks not
   run:** no dev server, no live rendering, no Photo-background measurement, no
   screen-reader pass, no non-Chrome engine test, no lint/tsc/build (nothing was
   changed to lint).
5. **Risks:** the translucent-fill question (J.1) is the one unknown that could
   force a redesign of F.4. Non-Chrome relative-colour support (J.5) could force
   the JS fallback. The preset/derived hybrid (VIS-03) is a permanent, accepted
   inconsistency.
6. **Next step:** Phase 0 decisions, then ship Phase 1 (unit identity) — it is
   independent, small, and fixes the clearest user-facing defect found.
