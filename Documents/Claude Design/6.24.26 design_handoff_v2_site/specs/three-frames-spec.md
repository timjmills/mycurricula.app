# The Three Frames — Mode Specification

> **Curricula Design System v1.3 — Calm · Light · Alive.** This document specifies the three layout characters ("Frames") in detail: background, wash, material, headings, structure, color behavior, and motion. It is the written companion to the live demo `Three-Frames-Showcase.html`, which renders one mock curriculum-overview page in all three modes with a per-user frame picker.
>
> **One rule above all:** a Frame changes **layout, material, and emphasis** — *never the global tone* (light/Night) and *never the meaning of color*. Frosted glass is the load-bearing material across all three; what changes is how present it is. The same data, the same tokens, three temperaments.


> **Subject mapping (this project).** The demo hexes match `colors_and_type.css` exactly. The app's locked subject→scale mapping is: **math → subj-1, spelling → subj-9, writing → subj-5, grammar → subj-7, sel → subj-12, ufli → subj-2, reading → subj-10, explorers → subj-13** (see `home/data.js`). Use these — not the demo's sequential numbers — when building real surfaces. The wider subj-1…15 scale is retained.

---

## How frames are chosen

Frame is a **per-user appearance preference, set once and carried app-wide** (a settings-style picker; demoed bottom-center of the showcase). It is the teacher's standing aesthetic — not a per-view toggle and not tied to subject or status. Whatever frame a teacher picks, every view (Day, Week, Year, Plan, Post, Teach) honors it. This matches the v1.3 principle *"chosen once, carried across every page."*

The six color **themes** (Normal, Night, Honey, Blossom, Mint, Sky) and **tone** (light / Night-dark) layer *on top of* the chosen frame — they are an independent axis. This spec is written in light tone; §6 notes how Night interacts.

---

## At a glance

| | **A · Calm Glass** | **B · Bright Workspace** | **C · Color-Forward** |
|---|---|---|---|
| **One-liner** | Frosted panels float over a living photo | Paper, ink, thin accent underline | Subject color leads every surface |
| **Temperament** | Ambient, cinematic, calmest | Focused, document-like, efficient | Expressive, warm, vibrant |
| **Background** | Alive duotone photo/mesh, slow drift, dark veil | Near-white paper; photo recedes to a faint wash | Warm dawn gradient, present but subordinate |
| **Card material** | Translucent glass, heavy blur, white text | Opaque white, hairline border, `--sh-sm`, ink text | Subject-tint fill, subject-ink text |
| **Text on cards** | White (`#F4F6FB`) | Ink (`--ink`) | Subject ink (`--subj-N-ink`) |
| **Subject color** | Luminous rail + dot; gentle, washed | A dot + small label; minimal, neutral-default | Leads — full tinted fills, gradient heading |
| **Hero heading** | White Poppins, soft glow shadow | Ink Poppins, 84px brand underline | Gradient-filled Poppins (clip-text) |
| **Density** | Airy, generous | Tight, list-efficient | Medium, roomy |
| **Best for** | Home, Day, ambient overview moments | Planning work: Plan, Explorers, Catch-Up, dense Year | Marketing/expressive moments, low-density hero pages |
| **Saturation budget** | Low — color is whispered | Lowest — *saturation is earned* | High — color is the point |

---

## The second axis — Background (Photo × Wash)

Frame and background are **independent**. Every frame works over either background, controlled by `data-bg`:

- **`data-bg="photo"`** — a rotating teaching photo with a duotone colour-grade (in the demo, a warm+cool mesh over a slate base, slow ~38s drift).
- **`data-bg="wash"`** — the brand-mesh **ambient wash**: light per-theme radial blooms (peach / indigo / mint / lilac) over the warm canvas, slow ~52s drift.

What changes is **not the frame's identity but the scrim and the text-contrast strategy**, tuned per frame so each reads on either background:

| | **on Photo** | **on Wash** |
|---|---|---|
| **Calm Glass** | Dark veil over the photo; **white** text on translucent dark glass. Cinematic. | Near-invisible scrim; **ink** text on **bright** frosted glass that's pushed to *stand out* — see below. |
| **Bright Workspace** | Photo faded ~82% toward paper; ink on opaque white cards — the photo is a whisper of texture. | Near-white brand wash; ink on clean white cards. The canonical work look. |
| **Color-Forward** | Light warm scrim (~58%); subject-tint cards lead, photo peeks at the margins. | Light warm scrim (~28%); subject-tint cards over the dawn wash. Most expressive. |

**The contrast rule:** text colour follows the *card's* luminosity, not the background's. Paper and Color cards are always light (opaque white / subject-tint) → ink / subject-ink text on any background. Only **Calm Glass** flips: translucent cards go **white-on-dark** over a photo and **ink-on-bright-glass** over a wash.

### Calm Glass on Wash — two registers, "Liquid v5" finish

Calm Glass on the wash ships in **two user-selectable materials** (`data-glass`), both using the finalized **Liquid v5** finish — a flat, dimensional liquid-glass look with sharp, pronounced highlights and shadows:

**White frosted** (`data-glass="light"`, the lighter default) and **Dark frosted** (`data-glass="dark"`, dark islands on the light wash). Both share the Liquid v5 recipe:

- A **flat liquid body** with a **sharp bright top reflection** — a tight `linear-gradient(180deg, …)` highlight band across the top, plus a small off-centre glint — the wet, screen-like cue, with no soft inner bevel.
- A subtle **subject tint** in the glass body (`color-mix` of the subject colour into the fill) so each lane is faintly its subject's colour.
- A **crisp bright top rim** (`inset 0 2px 0 #fff`) and a **defined bottom edge** (`inset 0 -1px 0`), for a sharp, dimensional read.
- A **deep, pronounced drop shadow** (`0 30px 58px -22px`) plus a tight contact shadow — the panel floats clearly off the wash.
- A **glowing subject rail** — a glossy rounded left rail (`::before`, ~7px) whose subject-coloured glow bleeds out past the card's left edge (`-8px 0 22px` subject-tinted shadow). Clipped to the card's rounded corners (`overflow:hidden`) so corners stay clean.
- **Glossy progress + now-chip** carrying the subject colour; **headings stay ink** on dark frosted (they sit on the light wash, not the panel).

Chrome and meta-pills get the same lift, so the whole UI feels like glass resting above the wash — flat, polished, and unmistakably dimensional. (Photo keeps the plain dark / white frosted materials; the Liquid finish is a wash-only treatment.)

### Keeping the three frames distinct *on the wash*

A light wash is the hardest place to tell the frames apart — left alone, Glass and Paper both collapse into "white card + ink text," and Color's muted tints wash out. The fix is to stop relying on material alone and give each frame a different **silhouette**, separating them on five structural axes at once:

| Axis | **Calm Glass** (float) | **Bright Workspace** (document) | **Color-Forward** (chroma) |
|---|---|---|---|
| **Fill** | Translucent (white .60→.38) so the wash colour *bleeds through* | Opaque white | Subject-**tinted** fill (not white) |
| **Blur / saturation** | Heavy — `blur(30px) saturate(1.7)`, frosted | None | None |
| **Radius** | Soft & large — `--r-xl` / `--r-2xl` | Crisp & small — `--r-sm` | Medium — `--r-lg` |
| **Elevation** | Deep float shadow + lit rim, hover lifts 4px | Flat — `--sh-xs`/none, no lift; border highlights on hover | Light `--sh-sm` |
| **Density / structure** | Airy — wide gaps, roomy padding | Tight — `--s1` gaps, compact rows, hairline borders (worksheet) | Medium gaps; **6px** subject rail, coloured titles |

The principle: **glass floats, paper lies flat, colour saturates.** Because the three now differ in translucency, shadow, corner radius, spacing, *and* colour — not just one of them — they read as three genuinely different surfaces even on the same pale background. The same five-axis logic is what keeps them distinct in Night tone and across themes.

---

## A · Calm Glass

**Intent.** Morning light through a window. The teaching photo is alive and present; content floats above it on frosted glass. This is the calmest, most cinematic read — for at-a-glance surfaces where the teacher is orienting, not grinding through edits.

**Background & wash.**

- A living duotone mesh stands in for a rotating teaching photo: warm peach + sky-blue + sage + mauve radial blooms over a deep slate base, `saturate(1.12)`, drifting on a ~38s `ease-in-out` alternate loop (translate ≤2.2% + scale 1.02→1.08).
- A two-layer **veil** sits over it: a top-down radial darkening plus a `rgba(12,16,26,.10→.30)` gradient, so white text and translucent glass stay legible. *The veil is what makes glass mode work* — without it, white-on-glass washes out.

**Material (glass).**

```css
background: rgba(255,255,255,.13);
backdrop-filter: blur(22px) saturate(1.25);
border: 1px solid rgba(255,255,255,.22);
box-shadow: 0 18px 40px -20px rgba(8,12,22,.55), inset 0 1px 0 rgba(255,255,255,.25);
color: #F4F6FB;
```

The inner top highlight (`inset 0 1px 0`) gives the glass a physical lit edge. Chrome (top bar, nav, pills) uses the same recipe at `.14` alpha.

**Headings.** `.ds-display` in white with a soft glow (`text-shadow: 0 2px 20px rgba(8,12,22,.45)`). Eyebrow and body at `rgba(255,255,255,.86)`. The active nav tab inverts to a solid white pill with ink text for a crisp anchor.

**Color behavior.** Subject color is *whispered*: a 3px luminous left rail on cards, a colored dot, and a progress fill of `color-mix(subject 78%, #fff)` with a soft glow. The subject badge is translucent white ringed in its subject color. Done-chips drop to `.65` opacity; the "now" chip blends subject color into the glass.

**Structure & density.** Airy — generous gaps, cards breathe. Lanes are full translucent panels.

**Motion.** Background drift (slow), gentle card hover-lift (`translateY(-2px)`), 280ms easing. Respects `prefers-reduced-motion`.

**Pitfalls.** Don't drop the veil; don't put ink text on glass (use white); don't over-saturate the mesh — it should set mood, never compete.

---

## B · Bright Workspace

**Intent.** The document-like mode. The background recedes almost to paper so the content reads like a clean planning sheet. This is the **default for dense work surfaces** — Plan, Lesson/Unit Explorers, Catch-Up, and any data-heavy Year view — and is the frame the Planning-Hub redesign targets.

**Background & wash.**

- Near-white: the canvas (`--canvas #FCFAF6`) with two extremely faint corner blooms (`#F1ECFF` top-right, `#EAF6FF` bottom-left) and a `rgba(252,250,246,.55)` scrim. No drift, no photo. Calm and still.

**Material (paper).**

```css
background: var(--surface);            /* #FFFFFF */
border: 1px solid var(--border);       /* #ECEAE3 */
box-shadow: var(--sh-sm);
color: var(--ink);                     /* #1C1B2E */
```

Opaque white cards, hairline borders, the softest shadow. Strip cards take a 3px subject accent on the **top** edge; lanes stay neutral with subject expressed by the badge + dot only.

**Headings.** `.ds-display` in ink with a signature **84px × 4px brand underline** (`--brand-500`) beneath the title — the most recognizable cue of this frame. Eyebrow in `--muted`, body in `--body`. Active nav tab is a solid ink pill (`--ink`, white text); the Personal|Team segment uses a `--brand-50` active fill.

**Color behavior.** *Saturation is earned.* Neutral is the baseline: chips sit on `--idle-tint`, done-chips go outline/muted, and only the **"now"** chip fills with solid subject color. Progress tracks are `--idle-tint` with a subject fill. The result reads as a professional document with color used sparingly as signal.

**Structure & density.** Tightest of the three — efficient, list-like, scannable. This is where teachers get work done.

**Motion.** Minimal and crisp — hover lift only; no background motion.

**Pitfalls.** Don't reintroduce glass translucency on every card (kills the paper feel); don't let subject color spread beyond dot + "now" chip + rail; keep contrast high (ink on white).

---

## C · Color-Forward

**Intent.** The most expressive frame. Subject color leads every surface — tinted card fills, a gradient hero, colored everything-that-means-something. For low-density, expressive moments (a hero overview, a celebratory or marketing-leaning page) rather than dense editing.

**Background & wash.**

- The warm `--grad-hero` dawn gradient (peach → cream → lilac → mint) with four soft corner blooms, `saturate(1.04)`, on a slow ~46s drift. A light `rgba(255,253,248,.30)` scrim keeps it warm, not loud. Atmosphere is present but **subordinate to the cards' color.**

**Material (color).**

```css
/* strip cards — subject-led gradient fill */
background: linear-gradient(135deg, color-mix(in srgb, var(--sc) 26%, #fff) 0%, var(--sct) 100%);
border: 1px solid color-mix(in srgb, var(--sc) 30%, #fff);
color: var(--sci);                     /* subject ink */
```

Lanes use a lightly frosted white panel with a **5px** subject left rail (heavier than other frames) so each subject's color reads instantly. Chrome is white-frosted with a solid `--brand-500` active state.

**Headings.** `.ds-display` with a **gradient text clip** spanning magenta → coral → indigo → teal — the signature flourish. (This is the only place gradient-on-type is sanctioned; gradients elsewhere stay in the background per *"gradients are atmosphere, not surfaces."*) Eyebrow/body in `--ink-soft`.

**Color behavior.** Maximal but still tasteful — the muted White Rose register keeps full tint fills from getting garish. Cards carry `--subj-N-tint` fills with `--subj-N-ink` text; chips use tint/ink; "now" chips invert to solid subject + white. Color is doing the most work here, but every hue still *means a subject* — never decoration.

**Structure & density.** Medium — roomier than Bright Workspace so the color has space to sit. Cards are the heroes.

**Motion.** Slow background drift, gentle hover; nothing flashy. Still Calm · Light · Alive — just turned up.

**Pitfalls.** Resist using this for dense planning grids (color fatigue); keep tints in the muted register (no raw subject solids as large fills); only the hero gets gradient type.

---

## 6. How tone & themes layer on top

Frames are orthogonal to **tone** and **theme**:

- **Night tone** (`data-tone="dark"`): glass becomes `rgba(28,30,44,.92)` with white borders at ~14%; paper's "white" cards become a dark surface with raised text contrast; color-forward tints darken while keeping subject hue. Frame *identity* (glass float / paper underline / color-led) persists.
- **Themes** (Honey/Blossom/Mint/Sky/Normal/Night) drive `--accent`, the ambient background palette, and a soft-light `.theme-tint`. In Calm Glass the theme mostly colors the mesh; in Bright Workspace it tints the hero underline + active states; in Color-Forward it warms the gradient wash. Subject and status colors never change with theme.

When building any new screen: pick the frame's material rules from §A/§B/§C, then let the active theme/tone supply `--accent` and background palette. Never hard-code — every value is a `var(--token)`.

---

## 7. Implementation notes

- Drive everything from a single attribute on the app root — the demo uses `body[data-frame="glass|paper|color"]`; in-app this is the user's saved preference on `<html>` / `.home`.
- Keep **markup identical** across frames. Only CSS changes. (The showcase proves this: one DOM, three looks.)
- Set per-row subject tokens inline: `style="--sc:var(--subj-6);--sct:var(--subj-6-tint);--sci:var(--subj-6-ink)"`, or via `useSubjectColor(subjectId)` / `.cp-subj.<subject>`.
- Always gate motion behind `@media (prefers-reduced-motion: reduce)`.
- Verify each frame at 400 / 768 / 1280px; lanes collapse to single-column under ~880px.

**See it live:** `Three Frames Showcase.html` (in this project) — toggle frame, background and theme with the bottom picker. The engine lives in `modes.css`; tokens in `colors_and_type.css`. — toggle the three frames with the bottom picker.
