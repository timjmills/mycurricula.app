# mycurricula.app — V2 Design Handoff (2026-07-02)

A complete, self-contained handoff for building **mycurricula.app** — an LMS for
school teaching teams. This package captures the design system **and** a fully
working, mock-data reference of the whole product, current as of **July 2, 2026**.

> **New since the last handoff?** See **`CHANGELOG.md`** — it lists every feature
> and design-doc change added since the first V2 package. Start there if you have
> the previous package.

---

## Start here (in order)

1. **`mockup/New v2 Site Design.bundled.html`** — open it in a browser. This is the
   **runnable reference**: the entire app as an interactive prototype (all views,
   all three frames, six themes, photo/wash, edit modes, walls, tools, notifications).
   Everything is inlined; the only external files it needs are `mockup/photos/`.
   *This is the ground truth for behavior and look — when in doubt, match the mockup.*
2. **`design-system/V2 Framework.md`** — the **written contract**: principles,
   color/type/material tokens, the three frames, the six-axis appearance system, the
   legibility contract, components, motion, responsive + touch rules. When code and
   this document disagree, **this document wins**.
3. **`design-system/V2 Design System.html`** — the **visual guide**: open in a
   browser to browse colors, type, materials, components, and themes as live swatches.
4. **`source/`** — the mockup's **modular source** (React/JSX + CSS + plain JS),
   for reading how a surface is actually built. Not a production app — a faithful,
   readable reference to translate into the real Next.js codebase.

---

## Package map

```
design_handoff_v2_2026-07-02/
├── README.md                         ← this file
├── CHANGELOG.md                      ← everything new since the last handoff
├── mockup/
│   ├── New v2 Site Design.bundled.html   ← the runnable app (open this)
│   └── photos/                           ← background photos it references
├── design-system/
│   ├── V2 Framework.md                   ← THE written contract (updated)
│   ├── V2 Design System.html             ← the browsable visual guide
│   ├── Design Language.html              ← one-page design-language overview
│   ├── colors_and_type.css               ← token implementation (colors, type, radius, shadow)
│   ├── modes.css · themes.css · styles.css  ← frame/register, theme, and base token layers
│   └── photos/
├── source/                           ← modular source of the mockup
│   ├── app.jsx                            ← app shell: nav, view routing, top bar, immersive chrome
│   ├── views-shared/-a/-b/-c.jsx · views.css  ← Day/Week/Year in the 3 frames
│   ├── planbook-edit.jsx · planbook-edit.css  ← the Week/Day EDIT-mode lesson editor
│   ├── planning.jsx · planning.css        ← lesson-plan tools (objective/standards/flow)
│   ├── hub.jsx · hub-planner.jsx · hub.css    ← Planning Hub (the retired "Plan" tab now opens this)
│   ├── resource-wall.jsx · .css           ← Resource Wall + custom walls + wall backgrounds
│   ├── wall-library.jsx · .css            ← wall browser (Presets · My Walls)
│   ├── teach.jsx                          ← Teach board (immersive)
│   ├── lesson-nav.jsx · .css              ← shared lesson/resource left-rail navigator
│   ├── lesson-library.jsx · .css          ← lesson scheduler/organizer
│   ├── unit-explorer.jsx · .css           ← unit hover-chip + modal
│   ├── catchup.jsx · .css                 ← Catch-Up triage popup
│   ├── config.jsx · config.css            ← Settings/Setup hub
│   ├── settings.jsx                       ← the shared AppearanceControls (reused everywhere)
│   ├── tools-dock.jsx · .css              ← Tools dock (Shout Box · To-Do · Notes)
│   ├── share.jsx                          ← read-only share links
│   ├── data.js                            ← mock curriculum data + live status (window.DS)
│   ├── dragscroll.js · tooltip.js         ← pan-by-drag + global styled tooltips
│   └── photos/
└── assets/
    ├── photos/                            ← the 5 rotating background photos
    ├── classroom-photo.png                ← the real classroom photo (Photo background)
    └── logo-glyph*.svg                    ← app logo marks
```

---

## The build stack (target)

Per the product's `CLAUDE.md`: **Next.js (App Router) + React 19 + TypeScript**,
**Tailwind for layout/spacing only**, **all color/type/spacing as CSS custom
properties** in `tokens.css` (here: `colors_and_type.css`), Supabase later for
data/auth/realtime, Cloudflare Pages hosting. Recreate the mockup's **visual output
faithfully** in idiomatic React — do **not** copy the prototype's HTML/CSS verbatim.

---

## The hard rules (do not violate)

1. **Rule #1 — NO SHARP CORNERS, EVER.** Every panel, card, tab, chip, field,
   preview tile, and menu is rounded (`--r-sm`…`--r-2xl`, `--r-pill`). This is the
   single most important visual rule.
2. **Works on every device, every surface.** Every page/view/panel/modal/popover
   must lay out and be usable at **phone 360–480 · tablet 600–900 · desktop
   1024–1920**. No page-level horizontal scroll; touch targets ≥44px; touch is
   first-class (tap/swipe/drag/long-press). Not a polish pass — a build requirement.
3. **Tokens only.** Never hard-code a hex color or px font size. Reference
   `var(--token)`. Subject colors come through the subject scale, never invented.
4. **The legibility contract.** Text color flips with **tone** (`data-tone`
   light/dark), never with a specific theme. Accent colors *interactive/emphasis*
   only — never plain reading text. Subject color always wins for subject identity.
   Verify every new surface over **Wash, Photo-Dim, Photo-Bright, and Night**.
5. **The forking model is sacred.** One **Team/Master** plan; each teacher sees
   their **Personal** copy where one exists. Lazy-fork on first personal edit;
   editing Team is explicit (toggle + banner). Completion never forks. Don't break
   this anywhere.
6. **One surface, one job.** Toggles change a surface's *content*, never its purpose.
   Filtering/management live in panels or Settings, not bolted onto a primary view.

---

## The appearance system (six independent axes)

The whole app is combinatorial — a teacher mixes these, and **every new surface
must inherit the mix, not fight it** (Framework §15):

- **Frame** — `data-frame=glass|paper|color` (a.k.a. `data-version=A|B|C`): Calm
  Glass · Bright workspace · Color-forward.
- **Glass register** (Glass frame only) — **Dark** or **White** frosted; **frosted
  over photo, Liquid over wash**.
- **Background** — **Photo** (rotating teaching photo) or **Wash** (brand-mesh
  gradient).
- **Theme** — Clear · Honey · Blossom · Mint · Sky · **Night** (Night = the one
  deliberate dark tone). Themes remap `--accent`.
- **Photo brightness** and **Buttons/edges/motion** sub-axes.

The visual-settings menu is **one shared `AppearanceControls` component**
(`source/settings.jsx`) reused verbatim by the landing menu, every per-view style
gear, the Setup modal, and the Planning Hub — so all appearance menus look and
behave identically, with the This-page / Whole-site scope toggle.

---

## Mock vs. real (phasing)

This is **Phase-1A fidelity**: every view renders from **`source/data.js`** (mock
curriculum for a Grade-5 team). There is **no backend** — the forking model,
notifications, walls, and edits persist to **localStorage** only. **Phase 1B** wires
Supabase (auth, DB rows, realtime) so forking persists, holidays render, schedule
rotation works, and unit-import lands. Build the data shapes to be grade-scoped and
school-configurable from day one (never hard-code the grade, the school week, or a
weekly-only schedule cycle — see the product `CLAUDE.md`).

---

## Building with Claude Code

- Open the **mockup** and the **Framework** side by side; implement surface by
  surface, matching the mockup's output.
- Reuse the **token system** and the **shared AppearanceControls** contract — don't
  re-invent per-surface styling.
- For any new surface, run the Framework's **forward checklist** (§15): read tone
  not theme; build from glass + tokens; respect the legibility contract; default to
  neutral and earn color; survive all four background extremes; and **round every
  corner**.
- Verify each surface at the three device widths **and** with touch before calling
  it done.
