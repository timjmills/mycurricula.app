# mycurricula.app — Build Standard (v2)

The visual, structural, and responsive contract every page must follow.
Read this file at the start of every build session. CLAUDE.md links to it.

> **Handoff origin.** This standard is grafted from the **V2 Site Design &
> Design System handoff** — `Documents/Claude Design/6.24.26
> design_handoff_v2_site/`. The canonical sources are the **v2 mockup**
> (`mockup/New v2 Site Design.bundled.html`) and **`design-system/V2
> Framework.md`** (plus `colors_and_type.css`, `themes.css`, `modes.css`).
> **The handoff wins for look and behavior; the Framework wins for rules.**
> When this doc and the handoff disagree, the handoff is the truth — fix this
> doc. The v2 handoff/Framework wins for v2 look & behavior — fix the code to
> match it, then update the docs. The code is the truth for **current-state
> implementation facts**. BUILD_STANDARD is the authoritative checked-in
> contract; the handoff is its upstream design origin.

> **One-sentence rule:** build every new surface to match the **v2 mockup +
> V2 Framework** — the canonical reference for material, color, type, the
> three frames, the seven themes, corner grammar, and motion. (The old
> `/weekly`-as-gold-standard rule from v1 is retired; the v2 mockup is the
> anchor now.)

---

## 1. How to use this file

When building a new surface, redesigning an existing one, or reviewing work:

1. Read this file in full.
2. Open the **v2 mockup** in a browser and read **V2 Framework.md** — that is
   the reference for what "looks right" means in this product. Verify every
   surface at the three viewport tiers (§9) and under the four tone/contrast
   extremes (Wash · Photo-Dim · Photo-Bright · Night).
3. Build from the appearance engine (§2), the materials (§5), and the tokens
   (§7). Do not re-build a button, card, list row, header, badge, chip, or
   toggle inline.
4. Run the new-page prompt template in §11 verbatim. Edit only the bracketed
   slots.
5. Include the per-tier verification line (§10) in every commit that touches a
   primary surface.

CLAUDE.md is the _policy_ (rules, phasing, gates, what not to do); this file is
the _content_ — what the design actually is. Read both.

---

## 2. The appearance engine — locked axes on the app root

The v2 system is **combinatorial**: independent axes the teacher mixes freely,
all set as `<html>`/app-root data attributes. **These are LOCKED decisions.**
This REPLACES the v1 three-axis model (`data-style quiet|calm|vivid`,
`data-palette normal|highlight`, `data-theme paper|cloud|night|mint|sky|blossom`).
In v2: **`data-style` is dropped, `data-palette` is dropped, `paper`+`cloud`
FOLD into `clear`, and Night is a `data-theme` value (the only dark theme)
that forces `data-tone="dark"`.**

| Axis | Values | What it controls |
| --- | --- | --- |
| **Frame** | `data-frame="glass\|paper\|color"` (≡ legacy `data-version="A\|B\|C"` — same axis) | Layout character + material + emphasis |
| **Glass register** (Frame A) | `data-glass="dark\|light"` | Frosted register — **surface-only; NEVER washes/lightens the background** |
| **Background** | `data-bg="photo\|wash"` | What lives behind the glass |
| **Theme** | `data-theme="clear\|night\|honey\|blossom\|mint\|sky\|off"` (off = Photo) | Palette, ambient bloom, accent, tone |
| **Photo brightness** | `data-dim="dim\|normal\|bright"` | Photo prominence + text treatment (Photo only; `normal` is auto) |
| **Tone** (DERIVED) | `data-tone="light\|dark"` | **Everything branches on this, never on the theme** |

Plus the supporting axes `data-canvas` (the home center panel — Glass / Light /
Minimal), `data-veil` (readability scrim), and `data-zoom`.

- **`data-frame` ≡ `data-version`** — `glass`=A (Calm Glass), `paper`=B
  (Bright workspace), `color`=C (Color-forward). Treat them as the same axis.
- **Tone is computed once at the root** from theme + background brightness
  (including photo auto-luminance) and every surface reads `data-tone`. In
  `normal` photo brightness the app samples the photo's average luminance
  (a 32×32 canvas read): **light photo → dark text, dark photo → light text.**
- **Themes remap `--accent` only** — never subject or status colors.

---

## 3. North star, principles & aesthetic

Curricula is a **calm operating surface for a teaching team** — minimal, light,
airy, "like an Apple product." Three words govern every decision:

- **Calm** — generous whitespace, one clear action per surface, nothing
  competing. Quiet by default; color and motion arrive only when they mean
  something.
- **Light** — white and warm-cream surfaces, soft daylight, frosted glass.
  Never heavy, never dark (except the deliberate Night theme). Content floats.
- **Alive** — a slow-drifting background, gentle entrances, a photo breathing
  behind glass. Movement is ambient, never demanding.

Operating principles: **Float, don't fill** · **The background is alive but
silent** · **Glass is the primary material** · **Color is information, never
decoration** · **One surface, one job** · **Navigate in place** (switching
views swaps content on the glass; the background holds) · **Motion clarifies,
never decorates** · **Progressive disclosure** · **Personal-first, with
deliberate friction for shared edits**.

Gut-checks before shipping: Does it feel _light_? Could I remove something and
lose nothing? Is there one clear focus? Does color mean something here? Would it
feel at home next to the home screen?

---

## 4. The spatial model & corner grammar

Layers, back to front: **Background** (full-bleed, drifting photo or
brand-mesh wash) → **Frame** (the rounded, inset "window" the photo lives in;
inset ~30px, radius 30px, soft shadow) → **Scrim / veil** (invisible
readability layer, tuned per theme + photo brightness) → **Overlay** (the
foreground glass: four corners + center console).

**Corners are a fixed grammar (do not move these):**

- **Top-left:** the wordmark (home).
- **Top-right:** Personal / Team toggle, Tools, Help (?), Settings (⋯).
- **Bottom-left:** school · grade · unit · week context.
- **Bottom-right:** live clock with now / next class.
- **Bottom-center:** the daily inspirational quote (dismissible).

### The segmented console

The center of the home screen is a **segmented console** of the five views —
**Day · Week · Curricular plan · Lesson plan · Teach**. It is the spine of the
app. Clicking a view **navigates in place** (the photo holds, content swaps with
a soft entrance). A compact version sits at the top of every view for switching.
Segmented is the default button treatment.

---

## 5. Materials — glass is the signature

**GLASS is the signature material** — frosted, translucent panels that let the
background bleed through. Glass always carries an **inner top highlight** (an
`inset 0 1px 0` white line) — that's what reads as a lit glass edge. Never
replace glass with a flat opaque card in the floating chrome.

> **Gradients are atmosphere, not surfaces.** Use them for washes, blooms, and
> the photo grade — not as the fill of every panel.

### Two frosted registers — Dark & White (the `data-glass` sub-axis)

Calm Glass (Frame A) ships in two registers, chosen by the teacher
(`data-glass="dark|light"`), independent of background and tone:

- **Dark frosted** — translucent dark panels (`rgba(46,46,64,~.4–.5)`),
  **white** text. The default; most cinematic over photos.
- **White frosted** — translucent **white** panels
  (`rgba(255,255,255,~.5–.66)`), **dark ink** text. **Surface-only** — it
  changes the panels, it must **NEVER** wash or lighten the background itself.

The register flips a panel's fill **and** its text color together (the
legibility contract, §15). Subject-color and per-section custom backgrounds
still override the register.

### Material by background — Frosted vs Liquid (the two glass recipes)

The finalized signature: **frosted on photo, liquid on wash**, each in a dark
or white register.

**Recipe A — frosted-over-photo** (plain frosted glass, dark or white register):

```
/* DARK frosted on photo (default, cinematic) */
background: linear-gradient(180deg, rgba(24,28,42,.62) 0%, rgba(15,18,28,.52) 100%);
border: 1px solid rgba(255,255,255,.15);
backdrop-filter: blur(22px) saturate(1.25);
box-shadow: 0 18px 40px -20px rgba(8,12,22,.6), inset 0 1px 0 rgba(255,255,255,.14);
color: #F4F6FB;                      /* white register */
border-left: 4px solid var(--sc);    /* subject rail */

/* WHITE frosted on photo (data-glass="light"), bright/airy */
background: linear-gradient(180deg, rgba(255,255,255,.76) 0%, rgba(255,255,255,.58) 100%);
border: 1px solid rgba(255,255,255,.85);
backdrop-filter: blur(34px) saturate(1.7);
box-shadow: 0 22px 50px -22px rgba(8,12,22,.5), inset 0 1px 0 rgba(255,255,255,.95);
color: var(--ink);
```

**Recipe B — "Liquid v5"-over-wash** (a flatter, glassier sheen with sharper,
more pronounced highlight/shadow edges, a lit top rim, and a glowing subject
rail — panels read as crystal over the abstract wash). Both registers get the
Liquid treatment over Wash:

```
/* WHITE Liquid v5 on wash (default wash register) */
background:
  linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(255,255,255,.55) 4%,
    rgba(255,255,255,.08) 13%, rgba(255,255,255,0) 26%),
  radial-gradient(80% 38% at 26% 0%, rgba(255,255,255,.92) 0%, rgba(255,255,255,0) 38%),
  linear-gradient(180deg, color-mix(in srgb,var(--sc) 8%, rgba(255,255,255,.9)) 0%,
    color-mix(in srgb,var(--sc) 19%, rgba(255,255,255,.58)) 100%);
backdrop-filter: blur(24px) saturate(2.4) brightness(1.05);
border: 1px solid rgba(255,255,255,1);
box-shadow:
  -8px 0 22px -8px color-mix(in srgb,var(--sc) 58%,transparent),
  0 2px 5px rgba(22,26,42,.18), 0 30px 58px -22px rgba(22,26,42,.52),
  inset 0 2px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(22,26,42,.12);

/* glowing subject rail (both registers) — a ::before, 7px, radius-matched */
.card::before {
  content:""; position:absolute; left:0; top:0; bottom:0; width:7px; z-index:1;
  border-radius: var(--r-xl) 0 0 var(--r-xl);
  background: linear-gradient(180deg, color-mix(in srgb,var(--sc) 55%,#fff) 0%,
    var(--sc) 44%, color-mix(in srgb,var(--sc) 86%,#000 10%) 100%);
  box-shadow: 0 0 16px 1px color-mix(in srgb,var(--sc) 60%,transparent),
    1px 0 3px color-mix(in srgb,var(--sc) 75%,transparent), inset 0 1px 0 rgba(255,255,255,.9);
}
```

The **DARK Liquid v5 on wash** register (`data-glass="dark"`) uses the same
sheen geometry over a dark body (`rgba(32,36,52,.87)` → `rgba(16,19,30,.78)`),
`color: #F4F6FB`. Exact values: handoff `modes.css` §2.

### RULE #1 — NO SHARP CORNERS, EVER

> **Every panel, card, tab, chip, button, image, preview tile, and input is
> rounded — no exceptions. When in doubt, round it. This is the single most
> important visual rule in the app.**

Radius scale: `--r-sm 10` · `--r-md 14` · `--r-lg 18` · `--r-xl 24` ·
`--r-2xl 32` · `--r-pill`. Bias large.

### Elevation

Shadows are wide, faint, and cool over the warm canvas: `--sh-xs → --sh-lg`,
plus colored `--sh-brand` / `--sh-honey` rationed to primary actions. Never a
hard or black drop shadow. (A **primary** button MAY carry a rationed colored
shadow — `--sh-brand` / `--sh-honey` — per the v2 handoff; non-primary/secondary
buttons keep tight neutral elevations, never a color glow — §8.)

---

## 6. The three frames

The same data renders in one of three layout characters, chosen once per
teacher and carried across every page. A frame changes **layout, material, and
emphasis — never the global tone, never the meaning of subject color.**

- **A · Calm glass** (`data-frame="glass"`) — frosted cards float over the
  blurred background; the calmest, most ambient reading. Carries the Dark /
  White frosted register sub-axis (§5) and is **frosted over photo, liquid over
  wash**.
- **B · Bright workspace** (`data-frame="paper"`) — the background recedes to a
  near-white paper; clean white cards, ink text, the most document-like. Card
  gets a 3px subject-deep **top** border; the paper heading carries a signature
  84px brand underline. Over wash it flattens to a crisp document (smaller
  radius, hairline rows, no float).
- **C · Color-forward** (`data-frame="color"`) — subject color leads. Each
  section/row/card is filled with **its own subject color** (never one global
  accent): soft, luminous, translucent subject tints, subject color on the
  leading edge. The color heading is the **only** sanctioned gradient-text clip.
  The most expressive frame; still obeys the legibility contract.

Per-row subject color is set inline on each card/lane:
`style="--sc:var(--subj-2); --sct:var(--subj-2-tint); --sci:var(--subj-2-ink)"`.

---

## 7. Color, type & tokens

**Tokens live in `app/tokens.css`** as CSS custom properties; the handoff
source of truth is `design-system/colors_and_type.css`. **Tailwind supplies
layout/spacing only** — never color, type, or semantic spacing. Reference
`var(--token)`; never hard-code a hex or a px font size in a component.

> **Token migration is ADDITIVE.** v2 names are added and ~6 shared collisions
> re-pointed, but **ALL v1-only tiers are preserved** — `--chrome-accent-*`,
> `--rail-bg` / `--panel-bg`, `--logo-*`, `--wf-*` / `--teach-*`, `--tag-*`,
> `--hl-*`, the scrims, and the z-scale. Do not delete a v1 tier to make room
> for a v2 name; add the v2 name alongside it.

### Color rules

- **Neutrals (the default world).** Warm whites over cream: `--canvas #FCFAF6`,
  `--surface #FFFFFF` / `--surface-warm #FFFDF8`, text `--ink #1C1B2E →
  --ink-soft → --body → --muted → --faint`, lines `--border` / `--hairline`.
- **Brand (functional primary).** Indigo `--brand-500 #3B6CF6` — actions,
  links, focus, "in progress."
- **Subjects (the load-bearing color).** Eight **named** subjects, **locked
  team-wide**, on a wider `--subj-1 … --subj-15` scale (15 hues + brand = 16
  swatches, no reuse). Each has `-tint` (fills), `-ink` (text on tint), and
  `-bright` (dots/outlines). Pull from the scale or `useSubjectColor` — never
  invent a subject color.
- **Subject → slot map (V2 §4, locked team-wide; color carries team-wide
  meaning):**

  | Subject | Slot | Subject | Slot |
  | --- | --- | --- | --- |
  | math | `--subj-1` (gold) | spelling | `--subj-9` (periwinkle) |
  | ufli | `--subj-2` (apricot) | reading | `--subj-10` (blue) |
  | writing | `--subj-5` (pink) | sel | `--subj-12` (teal) |
  | grammar | `--subj-7` (purple) | explorers | `--subj-13` (green) |

- **Status (semantic, louder than subjects).** `--done` green · `--progress`
  blue · `--idle` slate · `--warn` amber · `--danger` red, each with a `-tint`.
- A colored element **always means something**. A blue ring on a Reading card
  means "this is math" — never use a subject color for a non-subject signal.

### Typography

Three families, each with a job, **delivered via `next/font`** — do **NOT**
switch to a Google Fonts `@import` (the handoff CSS uses `@import` for prototype
convenience; production uses `next/font`).

- **Poppins** — large display & H1 (geometric, friendly).
- **DM Sans** — smaller headings & the wordmark.
- **Plus Jakarta Sans** — all UI, body, and data.

| Role | Font | Size | Weight |
| --- | --- | --- | --- |
| Display | Poppins | 44px | 700 |
| H1 | Poppins | 28px | 700 |
| H2 | DM Sans | 22px | 700 |
| H3 | DM Sans | 18px | 700 |
| Body L | Jakarta | 16px | 400 |
| Body | Jakarta | 14px | 400 |
| Small | Jakarta | 13px | 500 |
| Label | Jakarta | 11px, `.09em`, UPPERCASE | 700 |

Lean on lighter weights + open tracking for airy moments (hero greeting, quote);
tighten (`-.02em`) only on large display. Never below 13px UI / 24px on the
Teach board. `text-wrap: pretty` on running text. Use the role tokens / `.ds-*`
classes, never raw sizes.

### Spacing rhythm

Strict 4px-base scale: **4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64** (from
the `--s1…--s16` tokens). No 6, 10, 14, 18, 22 inside cards/rows — those create
the "almost-aligned" feeling that telegraphs inconsistent design.

### Surfaces & hosting

New v2 surfaces/routes ship behind **`NEXT_PUBLIC_V2`** (a build-time flag;
per-wave reveal; rollback is redeploy-gated): **Planner Hub (`/planner`),
Resource Wall (`/post`), Tools dock, 3-layer notifications, the per-heading
style cog, and share-links (signed tokens).** Hosting is **Cloudflare Workers
via OpenNext + R2.**

---

## 8. Buttons & pills — the `.cp-root` double-class rule

Every button is the **`components/ui/Button`** primitive. There is no other
button. Variants `primary · honey · secondary · ghost · icon · destructive`;
sizes `sm / md / lg`. **Never hand-roll a pill CTA** — add a variant to
`Button.module.css`, never invent one at the callsite.

Buttons are **pill-shaped** (`--r-pill`), label weight 700, ≥44px touch target
on primary actions. Filled `primary` uses `var(--chrome-accent)` at rest /
`var(--chrome-accent-strong)` on hover (re-hues per theme; both clear ≥4.5:1
against the always-white `--on-solid` ink). `honey` and `destructive` are
deliberately NOT theme-recolored.

### RULE — every control module double-qualifies its base class

> **Every variant/size/state rule must double-qualify the base class — e.g.
> `.btn.primary`, `.btn.md` — so the `.cp-root` reset can't strip it.**

The Settings UI and several slide-out panels render inside `.cp-root`, whose
base reset `.cp-root button { background:none; border:none; padding:0 }` is
specificity **(0,1,1)**. A bare single-class rule like `.primary { background }`
is **(0,1,0)** — the reset WINS and silently strips the fill, border, and
padding (the visible failure: floating label text with a leftover shadow halo at
rest, a zero-padding cramped pill on hover). Qualifying with the base class —
`.btn.primary` → **(0,2,0)** — outranks the reset so the primitive renders
identically in every context. The double-class trick (`.foo.foo`) is the same
fix where there is no base class to lean on. **Do not de-qualify these rules.**

```
/* ✗ BEFORE — (0,1,0) loses to .cp-root's reset; raw brand ignores theme; glow blooms */
.primary { background: var(--brand-500); box-shadow: var(--sh-brand); }

/* ✓ AFTER — (0,2,0) outranks the reset, re-hues per theme, tight neutral shadow */
.btn.primary { background: var(--chrome-accent); color: var(--on-solid); box-shadow: var(--sh-sm); }
.btn.primary:hover:not(:disabled) {
  background: var(--chrome-accent-strong); box-shadow: var(--sh-md); transform: translateY(-1px);
}
```

Two more DON'Ts: **no oversized colored glow as the resting shadow** — a
non-primary/secondary button's resting shadow is a tight neutral elevation,
never a color wash; a **primary** button MAY carry a rationed colored shadow
(`--sh-brand` / `--sh-honey`, the `--accent` fill's companion) per the v2
handoff, but it stays rationed, never an oversized bloom; **no raw
`--brand-*` for a button's hover/active color** (route through the
`--chrome-accent-*` tier so every theme re-hues its own buttons). The hover lift
and transition are dropped under `prefers-reduced-motion`.

---

## 9. Responsive contract

Three viewport tiers. Every surface works at every tier. **This is a build
requirement from the first commit, not a polish pass.**

| Tier | Width range | Primary device |
| --- | --- | --- |
| **Phone** | 360 – 480px | Phone portrait |
| **Tablet** | 600 – 900px | Tablet portrait, phone landscape |
| **Desktop** | 1024 – 1920px | Laptop, monitor |

### Hard rules at every tier

- **No document-level horizontal scroll.** Internal element scroll (a contained
  `overflow-x: auto`) is fine; the document body must not scroll sideways.
- **All primary controls reachable.** Hiding a primary control behind a
  responsive collapse without an alternative path is a critical bug.
- **Touch targets ≥44 × 44px** on phone + tablet (visual size can stay smaller
  if a padding-with-negative-margin trick inflates the target); ≥36 × 36px
  visual on desktop is acceptable when the hit area still inflates to ≥44 × 44.
- **Sticky chrome ≤~30% of viewport height on phone.**
- **No visible scrollbars** as a brand rule — content moves by drag, arrows, or
  hidden-scroll regions.

### Touch is first-class

Tap = click (≥44px, never hover-only). Horizontal swipe is primary navigation
(between console views, days, weeks, Teach slides); finger drag for reorder /
resize (Pointer Events, never mouse-only); long-press for discovery + context
actions; pinch-zoom the Teach board; pull-to-dismiss sheets. **No hover-only
state, ever** — hover may _enhance_ on desktop, but the feature must be fully
operable by tap/swipe/long-press.

### Verification

Before declaring work done, verify the surface at **~400px**, **~768px**, and
**~1280px** AND with touch emulation. Phone is the riskiest tier — do not skip
it. Verify under **Wash · Photo-Dim · Photo-Bright · Night** (the tone/contrast
extremes) too — treat that as a release gate, same as the responsive + touch
checks.

---

## 10. PR / commit responsive verification line

Every commit that touches a primary surface (any `app/**/page.tsx` or
`components/**`) must end with a one-line responsive verification:

```
Verified: 360 OK / 768 OK / 1280 OK
```

If a tier has a known issue, state it (`360 NEEDS WORK (week-strip overflow at
360–400px), 768 OK, 1280 OK`). The honesty matters more than the boast — a
`NEEDS WORK` note that becomes the next task beats an `OK` that was never
checked.

---

## 11. New-page prompt template

Copy-paste this exactly. Edit only the bracketed slots.

```
Build a new surface at `app/[route-segment]/page.tsx`.

Read `BUILD_STANDARD.md` and `CLAUDE.md` in the repo root before starting.
The canonical visual reference is the v2 mockup
(`Documents/Claude Design/6.24.26 design_handoff_v2_site/mockup/New v2 Site Design.bundled.html`)
and `V2 Framework.md`. The handoff wins for look/behavior; the Framework wins
for rules. (Do NOT use /weekly as the reference — that v1 anchor is retired.)

Use primitives from `components/ui/` and existing reusable components under
`components/`. Do not re-create a button, card, list row, header, badge, chip,
toggle group, or tooltip inline.

Match the v2 design exactly:
  - Build from the appearance engine: branch on `data-tone` (light/dark),
    NEVER on a specific theme. Read data-frame/data-glass/data-bg/data-dim
    from the root; do not re-derive them.
  - Glass is the signature material — frosted over photo, Liquid v5 over wash,
    in the dark or white register. Always carry the inner top highlight.
  - RULE #1: NO SHARP CORNERS, EVER. Round everything.
  - Subject color via inline `--sc/--sct/--sci` (or the .cp-subj cascade);
    color is information, never decoration. Honor the subject→slot map.
  - Typography via the role tokens; fonts via next/font.
  - Respect the legibility contract: text flips with tone; accent only on
    interactive/emphasis; subject color wins for identity.
  - Carry the theme on overlays (faint accent wash; see §15 surface-theming).

Tokens only — zero hex in components or lib. Spacing on the 4-8-12-16-24-32 scale.
If the surface is a v2 route/feature, gate it behind NEXT_PUBLIC_V2.

Responsive contract:
  - Phone (360–480px) must work as a single-column list. No horizontal scroll.
  - Tablet (600–900px) — verify primary controls reach.
  - Desktop (1024–1920px) — full layout.
  - Touch targets ≥44 × 44 on phone/tablet; touch is first-class.

Verify at 360px, 768px, and 1280px, with touch, and under Wash / Photo-Dim /
Photo-Bright / Night. Report one line per tier in the commit message:
  Verified: 360 OK / 768 OK / 1280 OK

The surface is: [one sentence describing what it does and who uses it]
The data source is: [path to mock data or store]
The reference is: the v2 mockup [+ specific source file if any]
```

---

## 12. The forking model — preserved (label change only)

The forking model is **UNCHANGED in value space**: internal `editMode ∈
personal | master`, `SaveTarget ∈ personal | core`. **Only the UI LABEL
changes:** the top-right toggle now reads **Personal / Team Curriculum**
(Master → "Team Curriculum"). Lazy forking, personal-first viewing, and "edit
Personal is silent, edit Team is deliberate" all hold.

- **The red master banner becomes a PINK CAUTION GLOW** (`#E8179B`,
  `--subj-5-bright`) firing on **`[data-mode="team"]`** — a frame edge-glow
  (brief two-pulse), the toggle, and the planning header all glow pink, a
  persistent caution that "changes here affect the whole team." **Solid under
  reduced-motion** (no flash). **NEVER a confirm dialog** — the glow _is_ the
  safety mechanism.
- **Completion never forks.**
- **The three-tier lesson cues are PRESERVED:** solid 4px subject-deep stripe
  (from Master/Team) · **dashed** stripe + "Modified" pill (personally edited) ·
  move-arrow (↔ same-week / ⤴ across-weeks; personally moved). Both compose.

---

## 13. Components (canonical inventory)

Build from primitives in `components/ui/`; no new surface re-creates one inline.
The v2 inventory (full live examples in the v2 mockup / V2 Design System.html):

- **Buttons** — §8. Pill-shaped, the single Button primitive.
- **Glass chips & chrome** — logo, mode toggle, Tools, clock, context: all
  frosted glass with the inner highlight.
- **Cards** — tone-aware: frosted over dark, white-hairline over light; always
  rounded `--r-xl`.
- **Subject glyph / badge** — rounded tile with the subject initial, filled in
  the subject color (soft pastel chip in Bright mode).
- **Pills / type tags** — standards as mono pills; resource types color-coded.
- **Lesson cells** — subject-striped, hover → tinted dark-glass popup; titles
  inline-editable. The em-dash subtitle split (split a title on ` — ` into
  dominant title + small subtitle) applies on every lesson-title surface.
- **Manila tabs / lesson flow / differentiation tiers** — rounded, seamless;
  subject-accent stripes; expand/collapse.
- **Teach board** — minimizable lesson rail, fullscreen board, slide filmstrip,
  annotation bar, drag/click resources.
- **Tools dock** — floating, drag-anywhere, corner-resizable; snap-to-dock at
  the right edge; collapses to a draggable icon rail (flips vertical/horizontal);
  Esc closes; mode/size/position/tab persist.
- **Notifications (3-layer)** — toasts (top-right, stack max 3, auto-dismiss
  ~6s, type-keyed rail: message=brand · to-do=amber · overdue=red · team=pink) +
  bell/notification center (unread badge, Today/Earlier, filter chips) + inline
  badges (Tools button, To-Do tab).
- **Enriched To-Do** — assignee · due date/time · priority · status; due chips
  (green/amber/red); Mine/Everyone; overdue pinned; assigning fires a
  notification.
- **Settings panel** — right-side frosted drawer; the appearance controls are a
  single shared `AppearanceControls` reused verbatim by the landing menu, the
  per-heading style cog, Setup, and the Planner Hub (with the This-page /
  Whole-site scope toggle).
- **Per-heading style cog** — a gear after each view title opens a Style menu
  (Frame · Glass register · Background · Theme · photo · motion), scoped This
  page or Whole site (a page override always wins; choosing Whole site clears
  the page override). Scope is color-coded: accent = this page, ink = whole site.

Every primary view and major panel must declare a **title** (top-left over the
background for views; own header treatment for popovers/drawers). Never ship a
titleless primary surface.

---

## 14. The seven themes

A theme washes the whole app — background palette, a gentle tint over everything
(including buttons), and the accent/glow hue. **One tone governs the entire app**
(Night = dark; everything else = light); the frame only changes a view's
_layout_, never the tone. Themes remap `--accent` only — never subject/status
colors. Washes are smoothed multi-stop gradients (origin off-canvas, no banding)
and drift slowly by default.

| Theme | `data-theme` | Feel | Accent |
| --- | --- | --- | --- |
| **Clear** *(resting; formerly Normal/paper; paper+cloud fold here)* | `clear` | the original balanced brand mesh (honey · violet · sky · rose on neutral); white swatch | sky-blue, slowly cycling the four light hues in Photo mode |
| **Night** *(the only dark theme; forces `data-tone="dark"`)* | `night` | deep slate-navy dark mode | soft indigo |
| **Honey** | `honey` | warm gold · amber · coral · yellow | gold |
| **Blossom** | `blossom` | pink · violet · periwinkle · soft coral | pink |
| **Mint** | `mint` | blue-green with a touch of yellow | green |
| **Sky** | `sky` | cool blues | blue |
| **Photo (Off)** | `off` | no wash/tint — the true original photo, white-on-photo | brand indigo |

> **Naming note:** the resting theme is **Clear** (white swatch); older
> docs/code may still say `normal`. Clear and Photo(Off) get no surface wash.

### Backgrounds & photo brightness

- **Wash** — a soft brand-mesh gradient (the active theme's palette) that slowly
  pans/zooms/twirls. Clear cross-fades its four hues on a long dissolve.
- **Photo** — a rotating teaching photo behind the frosted glass, with a
  four-layer premium grade (duotone color-grade, directional light + vignette,
  saturation/contrast lift, theme-tinted glass + accent inner glow).
- **Photo brightness:** **Dim / Normal** → white-text-on-photo, photo recedes
  behind a scrim; **Bright** → photo stays vivid behind _white_ frosted cards
  (light tone, dark text); UI hardens. **Normal is auto** (samples photo
  luminance → tone). All view text follows `data-tone`, never raw `data-bg`.

---

## 15. The legibility contract & forward rules (V2 §15)

The appearance system is combinatorial; the discipline is keeping every
combination legible and calm.

### The legibility contract (text × surface) — non-negotiable

- **Tone derivation:** Dim forces dark tone; Bright forces light tone;
  **Normal samples the photo's luminance** to derive light/dark (light
  photo→dark text, dark photo→light text); Night forces dark.
- **Dark tone:** text is **white** (`#fff →
  rgba(255,255,255,.7)`); glass is translucent-dark; menus/popups are dark glass
  with white text. Subject cells deepen their floor so white labels hold.
- **Light tone (Wash, Photo Bright, or any light theme):** text is
  **ink/off-black** (`--ink → --muted`); cards are white/translucent-white; the
  wash or photo tint sits _over_ the text without recoloring it.
- **Never** put ink text on a dark scrim or white text on a white card. When a
  surface flips tone, its text flips with it.
- **Accent ≠ body text.** The accent colors _interactive_ and _emphasis_
  elements only (primary buttons, active tab, now-ring, focus) — never plain
  reading text or nav labels.
- **Subject color always wins for identity**, on any background: over light it's
  the solid/ink; over dark it's the bright variant or a deepened gradient.

### Forward rule — every new menu / function must inherit the mix

1. **Read tone, not theme.** Branch on `data-tone`, never a specific theme —
   that keeps you correct across all seven automatically.
2. **Use glass + the tokens.** Build from the `.glass`/card recipe and
   `var(--accent)` / subject tokens. Don't hard-code a color or white/black.
3. **Respect the legibility contract** above.
4. **Default to neutral, earn color.** A new control arrives quiet; accent only
   for its primary action or active state.
5. **Survive every background.** Verify over Wash, Photo-Dim, Photo-Bright, and
   Night before shipping.
6. **Round everything, float it, keep one job.**
7. **Carry the theme on overlays.** Modals/drawers/popovers/menus sit above the
   app-wide wash (`.theme-tint`, z-index 90), so they get a faint **accent wash**
   from the central rule in `themes.css` ("SURFACE THEMING CONTRACT"). A new
   overlay must reuse one of the registered container classes (`.hub-modal`,
   `.cfg-modal`, `.cu-modal`, `.ue-modal`, `.set-panel`, `.ll-dlg`, `.td-dock`,
   the popover/menu classes, …) **or** add its own root + scrim to that rule.
   Mandatory — a surface that opts out looks off-theme in Honey/Blossom/Mint/
   Sky/Night.

### Surface-theming tier table — how far each axis reaches

Not every axis reaches every surface. Classify every surface into a tier:

| | **Tier 1 — Major surfaces** | **Tier 2 — Lesser menus** |
| --- | --- | --- |
| **Examples** | Resource Wall, Planner Hub, Tools dock, lesson/resource panels, Config & Settings hubs, Catch-Up, Unit/Lesson planner | Lesson right-click menu, Tools popover, preset/add dropdowns, reschedule/print dialogs, quote popup, row menus |
| **Theme** (tone + accent + wash) | ✅ always | ✅ always (accent + a _whisper_ of wash) |
| **Background** (Photo/Wash) | ✅ when full-bleed; modals blur it through | ❌ floats above the background; never renders its own |
| **Frame** (Glass/Bright/Color) | ✅ on data-layout surfaces only | ❌ a menu has no layout character |

**Why:** Theme is universal and cheap — inconsistency there reads as "broken."
Background is a property of the root canvas; an overlay floats above it and
already reveals it through frosted blur, so a 180px context menu must not render
its own photo. Frame is a data-layout character — meaningless on a utility
popover. **Full-screen = page, not menu** (Teach board, full-screen wall) and
honors Background + Frame like a primary view. **Override clause:** a surface may
pin a fixed look when its job demands it (Teach projection stage; neutral
share/export/print viewer) — allowed **only when documented as deliberate**.

---

## 16. Known open items

- **Toggle redesign** — the segmented `ToggleGroup` primitive (Personal/Team,
  By-Unit/By-Week, Grid/List, Roadmap/Progression) ships with the v2 segmented
  visual; migrate existing inline toggles to it. Until then, do not invent new
  toggle styles.
- **Fork-diff data seam** — "Compare with Team Curriculum" UI is real
  (`components/lesson-card/fork-diff/`); the DATA side (`Lesson.masterSnapshot?`)
  is still the prototype seam, replaced by persisted fork lineage from Supabase
  in Phase 1B.
- **Add-lesson / add-event persistence** — modal UI is wired; persistence is
  stubbed pending the backend (no `addLesson` / `addBlock` store action yet).

---

## 17. Doc maintenance

Update this file when a new primitive lands in `components/ui/`, a token is
added to `app/tokens.css`, a responsive breakpoint changes, or a new interaction
pattern is established across more than one surface. The v2 handoff/Framework
wins for v2 look & behavior — fix the code to match it, then update the docs.
The code is the truth for **current-state implementation facts**.
BUILD_STANDARD is the authoritative checked-in contract; the handoff is its
upstream design origin. For look/behavior questions the **v2 mockup + V2
Framework** is the origin authority; cite it.

_This is the contract. Build to it, and the product stays calm, light, and alive._
