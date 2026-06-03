# Curricula Design System

The brand & product design system for **mycurricula.app** — curriculum and teaching
solutions built *for teachers, by teachers*. This is **v1.3** of the system.

> A design language that merges two references: a **curriculum-planning dashboard**
> (dense, structured, navigated by color, with a timeline of subjects → units → weeks → days)
> and a **creative-studio landing page** (soft gradients, rounded forms, generous whitespace,
> a honey-yellow call to action). It keeps the dashboard's clarity while borrowing the
> landing page's warmth.

---

## What this is for

mycurricula.app helps teachers **plan a year of curriculum** the way they actually think about
it — by subject, broken into units, then weeks, then individual lessons — and track progress
across all of it. The product is **teacher-facing and warm**: it has the information density of
a planning tool, but the friendliness of a fresh notebook. This design system exists so any
designer or agent can produce on-brand mycurricula screens, marketing, and decks without
re-deriving the rules.

The system's signature idea is the **color cascade**: every subject owns a hue, and that hue
flows down to its units, weeks and lessons. Color *is* the navigation. Status (done / in progress
/ not started) is a separate, semantic layer so progress always reads the same on every subject.

---

## Sources

This system was authored from the following materials. You may not have access to all of them;
they are recorded here so you can go deeper if you do.

| Source | What it is | Notes |
|---|---|---|
| `uploads/DESIGN-v1.3.md` | The written v1.3 spec | The **canonical source of truth** for tokens, rules and rationale (look & feel). |
| `uploads/design-system-v1.3.html` | The living style-guide page | Real component CSS + HTML for every token and pattern. Lifted into this system. |
| [`github.com/timjmills/mycurricula.app`](https://github.com/timjmills/mycurricula.app) | The product repo (reachable) | The shipping app (Next.js + Tailwind + Supabase). Used for **product structure & vocabulary** — the real surfaces (Weekly, Daily, Year, Subject, Catch-up, Settings, Teach), shell layout, and lesson-card anatomy. **Note:** the repo's current visual styling is *not yet updated to v1.3* — per the brand owner, take **look & feel from the v1.3 docs**, and structure/flows from the repo. Explore it to go deeper on real product behavior. |

**Sibling products** live under the same `cultivatingthedigital.org` umbrella — *Math Quest,
Reading Quest, Grammar Quest* ([github.com/timjmills](https://github.com/timjmills)) (student-facing
practice apps). They use a **different, kid-facing visual language** (Duolingo-style: purple/teal,
Nunito, chunky 3D shadows) and are intentionally **out of scope** for this system, which documents
the **mycurricula teacher planner brand only**.

---

## Index — what's in this folder

```
README.md                  ← you are here: context, content & visual foundations, iconography
Design System.html         ← single-page style guide (tokens, cascade, type, components — the "design HTML")
colors_and_type.css        ← all design tokens (color, space, radius, shadow) + type roles & classes
design-system.css          ← styles for Design System.html
SKILL.md                   ← Agent-Skill manifest (lets this system load as a Claude skill)
assets/                    ← logos, brand glyph, exported imagery
preview/                   ← small HTML specimen cards that populate the Design System tab
ui_kits/
  planner/                 ← Planner UI kit (the teacher product) — index.html + JSX + README
  marketing/               ← Marketing landing page (v1.3 hero, features, pricing) — index.html + README
prototypes/                ← two interactive Year Overview directions (Timeline + Workspace) + README
uploads/                   ← the original v1.3 spec + style-guide page (preserved)
```

**Where to start**
- **The whole system on one page** → `Design System.html` (the browseable style guide)
- **Tokens** → `colors_and_type.css`
- **The product, assembled** → `ui_kits/planner/index.html` (Weekly · Daily · Year · Subject · Catch-up · Settings · Teach)
- **Year Overview directions** → `prototypes/` (A · Timeline with expand-under-row + lesson drawer; B · Workspace, responsive multi-panel) — see `prototypes/README.md`
- **Public site look** → `ui_kits/marketing/index.html`
- **Specimens** → `preview/` (also shown as cards in the Design System tab)

These reference designs + the tokens + a developer handoff are meant to drive a **website / product
redesign** onto the v1.3 brand.

---

## CONTENT FUNDAMENTALS

How mycurricula writes. The voice is a **fellow teacher**, not a vendor.

- **Casing:** **Sentence case** everywhere — headings, buttons, menu items. The only uppercase is
  the small **LABEL / eyebrow** style (`+0.09em` tracking), used sparingly for section kickers.
  Never Title Case Every Word; never ALL CAPS for emphasis in body copy.
- **Person & address:** Speaks **to** the teacher ("you") and **from** experience. Warm and direct,
  never bureaucratic. Implied "you" in actions ("Add unit", "Start planning").
- **Tone:** Encouraging, practical, calm. The eyebrow *"Curriculum planning, made warm"* and the
  hero *"Structured like a planner, friendly like a fresh start."* set the register: competent and
  reassuring, with one small note of delight. Marketing earns a little lyricism; in-product copy is
  plain and functional.
- **Length:** Short. Hero subheads run ~1–2 sentences. Button labels are 1–2 words
  (*"Add unit", "Export", "Get started", "Start planning", "Cancel"*). Helper text is a single line.
- **Domain vocabulary:** Use the planner's real nouns — **subject, unit, week, lesson, standard,
  grade, term**. Content reads like a real plan: *"Unit 3 · Multiplication"*, *"Week 3 overview"*,
  *"Multiply by 2-digit numbers"*. The middle-dot `·` separates a label from its detail.
- **Status language:** Fixed, friendly, capital-first: **Completed · In progress · Not started ·
  Needs review**. Don't invent synonyms ("Done", "WIP") — these four are the vocabulary.
- **Placeholders & examples:** Lead with *"e.g."* — *"e.g. Multiplication & Division"*,
  *"Search units, lessons, standards…"*. Examples are always real curriculum content, never lorem.
- **Numbers & metrics:** Quiet. A metric is a big number with a small, lowercase-ish label
  (*"12 units", "Week 3 of 8"*). Avoid stat-stuffing; show a number only when a teacher would act on it.
- **Emoji:** **Not used** in the mycurricula teacher brand. Meaning is carried by color, icon and
  word. (The student Quest apps *do* use emoji — that's a different brand. Don't borrow it here.)

**Quick litmus test:** if a line sounds like it came from a teacher leaving a sticky note for a
colleague — warm, specific, brief — it's on-voice. If it sounds like enterprise SaaS, rewrite it.

---

## VISUAL FOUNDATIONS

The look, in rules. Tokens live in `colors_and_type.css`; this is the *why* and the *how*.

### Color
- **Two voices, one palette.** **Indigo `#3B6CF6`** is the functional primary — buttons, links,
  focus rings, active nav, the *in-progress* status. **Honey `#F4B740`** is the warm accent —
  marketing CTAs, highlighted headings, celebration, *needs-review* warnings. They never compete:
  indigo does the work, honey does the welcome.
- **Color is navigation, and it cascades.** A subject's hue flows down to its units, weeks and
  lessons via two CSS vars on a container (`--c` = bright accent, `--ct` = tint fill). One line
  re-themes a whole column.
- **Muted & harmonious subjects.** 15 subject hues sit at moderate saturation and a shared lightness
  (the White Rose register) so a dozen-plus can coexist without clashing. Each has a **solid**
  (headers/icons), a **tint** (fills/lanes) and an **ink** (AA-legible text on its tint).
- **Status stays separate & more saturated** than subjects, so a marker always reads as progress,
  never as a subject. Green = done, brand blue = in progress, grey = not started, honey = needs review.
- **Warm neutrals.** White surfaces sit on a **cream canvas `#FCFAF6`**; ink is a near-black violet
  `#1C1B2E`, not pure black. Borders are warm (`#ECEAE3`), cooling to `#E8EAF2` only next to brand color.

### Type
- **Display & headings: Bricolage Grotesque** (700/800) — warm, slightly editorial, tight tracking
  (−0.02 to −0.03em). **UI, body & data: Plus Jakarta Sans** (400–700) — clean and professional.
- **Labels/eyebrows** are the one uppercase style: 11px, 700, `+0.09em`, in muted or honey.
- Display 44/H1 28/H2 22 are Bricolage; H3 18 and everything smaller is Jakarta. See the type scale
  in `colors_and_type.css`.

### Backgrounds
- The app background is the flat **cream canvas**, lifted by a **page-level atmospheric mesh**:
  three very low-opacity radial glows (honey top-left, violet top-right, green bottom-right) fixed
  behind everything for depth. It's barely-there, never busy.
- **Gradients are atmosphere, not decoration on every surface.** Reserve them for hero areas,
  onboarding, empty states and CTAs: **Hero mesh** (peach→pink→violet→mint), **Honey CTA**,
  **Brand soft**, **Dawn** (avatars), **Mint** (accents). No gradient on ordinary cards or panels.
- No photography in the core system; no heavy textures. Imagery, where present, is soft and warm.

### Shape, border, radius
- **Generous, rounded radii**: chips 10–14px, cards 18px, panels 24px, hero/cover 32px, and **pills
  (999px)** for every button, badge and search field. Rounding is what makes a dense planner feel soft.
- **Hairline borders** do most of the structural work — 1px warm borders and `#F4F2EC` internal
  dividers. The UI is built from outlined, low-shadow cards, not heavy containers.

### Elevation & shadow
- Shadows are **soft, low-contrast, and cast cool** (`rgba(28,27,46,…)`) over the warm canvas — a
  4-step scale from `xs` (1px) to `lg` (48px blur, for overlays). They lift, they don't dramatize.
- **Color glows are rationed to primary buttons only** — a brand-blue glow under the indigo button,
  a honey glow under the CTA. Never glow a static card.
- **Cascade chips** combine a **soft neutral drop shadow + a bright colored outline**; the active
  unit/week deepens both (2px outline, larger shadow). Inner shadows are not used.

### Motion
- Restrained and physical. Sections **rise + fade in** on load (`translateY(14px)→0`, ~0.6s, a gentle
  ease `cubic-bezier(.2,.7,.3,1)`). Interactive lifts use ~0.16s ease.
- **Hover** = a small lift (`translateY(-2 to -3px)`) plus a deeper shadow; links shift to brand-600.
- **Press** = settle down by 1px (`translateY(1px)`), no color flash on buttons.
- No bounces, no infinite decorative loops, respects `prefers-reduced-motion`.

### Transparency & blur
- Used for **chrome that floats over content**: the sticky side-nav and hero chips use a translucent
  cream fill with `backdrop-filter: blur(10px)`. Cover/marketing chips use `blur(3–4px)` white glass.
- Blur is for navigation and atmosphere only — never blur body content or data.

### Cards & chips (the recurring objects)
- **Card:** white surface, 1px warm border, 18px radius, `sh-sm` shadow, 24px inner padding. Lifts on
  hover. That's the default container — no colored left-borders, no gradients.
- **Palette / subject card:** a solid color header band with a big numeral + a small tint swatch
  top-right, then name, token and hex below.
- **Cascade chips** (unit / week / lesson): tint fill, **bright colored outline**, soft shadow, **dark
  ink text** (color lives in the outline, icon tile and dot — not the words), and a leading icon tile
  (unit = solid bright, week = soft neutral) or a bright dot (lesson).
- **Badge:** pill with a leading dot. **Avatar:** dawn-gradient circle with white initials when no photo.

### Layout rules
- **Planner shell:** a sticky 248px side-nav (translucent, blurred) + a segmented header + color-coded
  subject lanes. Each lane sets its subject trio so its chips inherit the color; the current unit is outlined.
- Max content width ~1440px, centered. Sections breathe with 48–64px gaps; cards use 24px internal rhythm.
- Fixed elements: the side-nav and the page atmospheric mesh. Everything else scrolls.

---

## ICONOGRAPHY

- **Style:** clean **line icons** — stroked, ~2–2.4px weight, **round linecaps and linejoins**, on a
  24×24 viewbox. This is a Feather / **Lucide**-family aesthetic: geometric, friendly, unfilled.
  Glyphs inside colored chip tiles are drawn in white (solid tile) or the bright accent (soft tile).
- **Delivery:** the source ships icons as **inline SVG** (no icon font, no sprite, no PNG icons).
  For new work, use **[Lucide](https://lucide.dev)** — it matches the stroke weight and round-cap
  style exactly and is the recommended icon set for this system. Link from CDN
  (`https://unpkg.com/lucide@latest`) or paste individual SVGs inline.
  - **Substitution flag:** the original repo's exact icon SVGs were not available at authoring time,
    so the UI kits use **Lucide** as the closest match. If mycurricula ships a specific icon set,
    drop it into `assets/icons/` and update this section.
- **Brand glyph:** an **open-book / two-page** mark (see `assets/logo-glyph.svg`). In the wordmark it
  sits in a rounded tile with the **honey gradient** and a honey glow; on light it's the two-tone
  indigo/honey version. Pair it with the wordmark **"Curricula"** in Bricolage 800 + a small uppercase
  "Design System" / product label beneath.
- **Emoji:** **not used** in the teacher brand. **Unicode** is used only as typographic punctuation —
  the **middle dot `·`** as a label/detail separator and the arrow **`→`** in CTAs. Meaning is carried
  by color + line icon + word, never by emoji.

---

*Maintained as the mycurricula.app brand system. When in doubt, the rule is: **dashboard clarity,
landing-page warmth, color that cascades, and copy that sounds like a teacher.***
