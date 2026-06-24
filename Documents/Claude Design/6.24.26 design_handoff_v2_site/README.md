# Handoff: mycurricula.app — V2 Site Design & Design System

## Overview

This package is the complete design handoff for **`mycurricula.app`** — a Learning
Management System (LMS) for school teaching teams. It consolidates fragmented
planning surfaces (resource boards, week/lesson docs, standards docs, per-teacher
copies) into one filterable, editable **curriculum operating system**.

The deliverable is a **frontend-complete, interactive mockup** of the whole product
plus the **design system** that governs it. Everything a developer needs to rebuild
this in a production codebase is here: the runnable mockup, the un-bundled source,
the design-system contract (rules + visual guide + tokens), the per-feature specs,
and every image used.

> **Read these two first, in order:** `mockup/New v2 Site Design.bundled.html`
> (open in a browser — this is the canonical visual + behavioral truth) and
> `design-system/V2 Framework.md` (the written design contract). When anything is
> ambiguous, the running mockup wins for *look/behavior* and the Framework wins for
> *rules*.

---

## About the design files

The files here are **design references created in HTML/CSS + in-browser React
(Babel)** — high-fidelity prototypes showing the intended look and behavior. They
are **not production code to copy verbatim.** The task is to **recreate these designs
in the target production stack** (per `CLAUDE.md`: **Next.js App Router + React +
TypeScript**, Tailwind for layout only, CSS-custom-property design tokens, Supabase
later) using its established patterns — not to ship the prototype's Babel/inline-JSX
as-is.

Use the prototype source for **exact values and logic** (colors, spacing, glass
recipes, gradients, component structure, interaction details) and re-express them
idiomatically in the real codebase.

## Fidelity: **High-fidelity (hifi)**

Final colors, typography, spacing, materials, motion, and interactions are all
resolved. Recreate the UI pixel-faithfully using the codebase's libraries and the
tokens in `design-system/colors_and_type.css`. Do **not** invent new colors,
spacing, or type sizes — pull from the tokens.

---

## ⚠️ Hard rule — must work on phone, tablet, AND computer

**The design must be built to work, and every single surface — every page, view,
panel, menu, modal, popover, and feature — must work and lay out correctly across all
three device widths: phone, tablet, and desktop.** This is a build requirement for
every surface, not a final polish pass.

- **Phone** 360–480px · **Tablet** 600–900px · **Desktop** 1024–1920px.
- No page-level horizontal scroll at any width; every control reachable without
  off-screen overflow (internal element scroll is fine; the document is not).
- Touch targets ≥44px on phone/tablet; sticky chrome ≤~30% of phone height.
- **Touch is first-class** — tap / swipe / drag / long-press, no hover-only state.
- A surface is **not "done"** until verified at **~400 / ~768 / ~1280** and with
  touch. (Framework §0 + §13.)

---

## What's in this bundle

```
design_handoff_v2_site/
├── README.md                         ← you are here
├── CLAUDE.md                         ← product guide: what the app is, phasing,
│                                       the forking model, hard rules, scope
│
├── mockup/                           ← THE canonical reference (self-contained)
│   ├── New v2 Site Design.bundled.html   open this in a browser
│   └── photos/  p1–p5.png            background photo library it references
│
├── design-system/                   ← the design contract
│   ├── V2 Framework.md               the written design language (READ THIS)
│   ├── V2 Design System.html         browsable visual guide (open in browser)
│   ├── Design Language.html          narrative design-language page
│   ├── colors_and_type.css           ★ the token implementation (source of truth)
│   ├── themes.css                    the 7 theme washes + surface-theming contract
│   ├── modes.css                     frame engine (frame × background × tone)
│   ├── styles.css                    global resets / base
│   └── photos/  p1–p2.png            images the visual guide renders
│
├── specs/                           ← per-feature written specs
│   ├── three-frames-spec.md          the 3-frame system in depth
│   ├── design-system-brief.md        system brief
│   ├── wall-library-spec.md          Resource Wall / library spec
│   └── v2-three-frames-audit.md      per-surface audit (gaps → fixes log)
│
├── source/                          ← the un-bundled prototype implementation
│   │                                  (read for exact CSS values + component logic)
│   ├── app.jsx                       app shell, appearance state, view router
│   ├── views-a/b/c.jsx, views-shared.jsx, views.css   Day/Week/Year per frame
│   ├── hub.jsx, hub-planner.jsx, hub.css              Planner Hub (Lessons/Units/
│   │                                                  Resources/Catch-Up)
│   ├── planning.jsx/.css             lesson-plan document (tabs, flow editor)
│   ├── resource-wall.jsx/.css        Resource Wall (kanban sections)
│   ├── wall-library.jsx/.css, lesson-library.jsx/.css unit/lesson libraries
│   ├── unit-explorer.jsx/.css        unit explorer
│   ├── catchup.jsx/.css              Catch-Up triage
│   ├── teach.jsx                     Teach board (projection)
│   ├── tools-dock.jsx/.css           floating Tools dock + collapsible rail
│   ├── settings.jsx/.css, config.jsx/.css   appearance controls + Setup hub
│   ├── lesson-nav.jsx/.css, share.jsx, tweaks-panel.jsx
│   ├── colors_and_type.css, themes.css   (same tokens as design-system/)
│   ├── data.js                       mock fixtures (subjects, lessons, schedule)
│   ├── dragscroll.js, tooltip.js, logo-glyph.svg
│   └── photos/  p1–p5.png
│
└── assets/                          ← every image used
    ├── photos/  p1–p5.png            the photo background library
    ├── classroom-photo.png           the real classroom photo (Photo-background source)
    ├── logo-glyph.svg                wordmark glyph
    └── logo-glyph-on-honey.svg       glyph variant
```

---

## The product in one screen

**Users:** teachers only (no student/parent/admin product). **Core job:** "What are
we teaching this week, and where am I in the plan?" Built **multi-grade and
multi-school ready** — never hard-code a single grade, a 5-day week, or a fixed
daily schedule (see `CLAUDE.md` §1).

**The one idea that defines it — git-style forking of curriculum:** there is one
**Master / Team** plan; each teacher sees their **Personal** copy where one exists,
the Master as fallback otherwise. Personal edits are silent and automatic; editing
the Team plan is deliberate and signaled by a **pink caution glow** across the app
(never a confirm dialog). Three-tier lesson cues show whose version a card is (solid
subject stripe = Master · dashed stripe + "Modified" pill = personally edited ·
move-arrow = personally moved). **Do not break this model** (see `CLAUDE.md` §2, §6).

---

## The design system (summary — full contract in `V2 Framework.md`)

**Feel:** calm, light, airy — "like an Apple product." Float, don't fill. Glass is
the signature material. **Color is information, never decoration.**

### The appearance system is combinatorial — independent axes the teacher mixes

| Axis | Options | Data attribute |
|---|---|---|
| **Frame** | A Calm Glass · B Bright · C Color | `data-frame="glass\|paper\|color"` (a.k.a. `data-version="A\|B\|C"`) |
| **Glass register** (Frame A) | Dark frosted · White frosted | `data-glass="dark\|light"` — **surface-only, never washes the background** |
| **Background** | Photo · Wash | `data-bg="photo\|ambient"` |
| **Theme** | Clear · Night · Honey · Blossom · Mint · Sky · Photo(Off) | `data-theme="…"` |
| **Photo brightness** | Dim · Normal(auto) · Bright | `data-dim="…"` |
| **Tone** (derived) | light · dark | `data-tone="light\|dark"` — **everything branches on this** |

- **Three frames** change a view's *layout character*, never the global tone:
  **A** floats frosted cards · **B** is near-white paper · **C** leads with each
  item's **own subject color** (soft luminous translucent tints).
- **Glass material by background:** **frosted over Photo**, **Liquid glass ("Liquid
  v5")** over Wash — a flatter, glassier sheen with sharper highlight/shadow edges.
  Each in a **Dark** or **White** frosted register (Frame A).
- **Auto-brightness:** in `Normal`, the app samples the photo's average luminance and
  sets tone automatically — **light photo → dark text, dark photo → light text.**
- **Themes** wash the whole app (background palette + accent + tone). **Clear**
  (formerly "Normal", shown as a white swatch) is the resting theme; **Night** is the
  only dark theme. Themes remap **`--accent`** only — never subject or status colors.
- **Legibility contract (non-negotiable):** dark tone → white text on dark glass;
  light tone → ink text on white/translucent-white. Accent colors interactive/emphasis
  elements only, never plain reading text. Subject color always wins for identity.

### Tokens — `design-system/colors_and_type.css` is the source of truth
- **Neutrals:** warm whites over cream (`--canvas #FCFAF6`, `--surface #FFFFFF`,
  text `--ink #1C1B2E → --ink-soft → --muted → --faint`).
- **Brand:** indigo `--brand-500 #3B6CF6` (actions, links, focus).
- **Subjects:** named 8 (locked team-wide) on a wider `--subj-1 … --subj-15` scale
  (15 hues + brand → 16 swatches, no reuse). UFLI=`--subj-2`, Reading=`--subj-10`,
  Math=`--subj-1`, Writing=`--subj-5`, Grammar=`--subj-7`, Spelling=`--subj-9`,
  Explorers=`--subj-13`, SEL=`--subj-12`. Each has `-tint` / `-ink` / `-bright`.
- **Status:** `--done` green · `--progress` blue · `--idle` slate · `--warn` amber ·
  `--danger` red, each with a `-tint`.
- **Type:** Poppins (display/H1) · DM Sans (headings/wordmark) · Plus Jakarta Sans
  (UI/body/data). Never below 13px UI / 24px on Teach board.
- **Radius:** `--r-sm 10 → --r-2xl 32 → --r-pill`. **Rule #1 — NO SHARP CORNERS,
  EVER.** Every panel, card, tab, chip, button, image, preview tile, input is rounded.
- **Elevation:** wide, faint, cool shadows; never hard/black.

---

## Screens / views

Each is in the mockup; source files are noted for exact values.

1. **Home / landing** — full-bleed background (photo or wash) with floating glass
   chrome in a fixed corner grammar (wordmark TL; Personal/Team toggle, Tools, Help,
   Settings TR; school·grade·unit·week context BL; live clock BR; quote bottom-center)
   and a centered **segmented console** of the five views. *(source: `app.jsx`,
   `home.css`)*
2. **The Day** — time-ordered class list + lesson detail. *(`views-*.jsx`,
   `views.css`)*
3. **The Week** — grid (columns derive from the configurable school week — never
   hard-code Mon–Fri) + list. *(`views-*.jsx`)*
4. **The Year** — roadmap / progression "constellation" of subject clusters.
   *(`views-c.jsx`)*
5. **Lesson Plan** — a document with tabs: **Plan · Flow · Resources · Support ·
   Standards · Materials · Stats · Notes**. Editable lesson-flow (rename/add/delete/
   reorder sections, presets, per-section rich-text + resource tagging). *(`planning.jsx/.css`)*
6. **Planner Hub** — Lessons / Units / Resources / Catch-Up, each with a clear section
   kicker. Unit planner (Overview / Lessons / Assessments). *(`hub.jsx`,
   `hub-planner.jsx`, `hub.css`)*
7. **Resource Wall** — kanban sections; each section carries its **subject color**
   across all frames; per-section custom photo/color/wash override; list & thumbnail
   views. *(`resource-wall.jsx/.css`)*
8. **Catch-Up** — lessons-behind triage grouped by subject. *(`catchup.jsx/.css`)*
9. **Teach Board** — fullscreen projection: minimizable lesson rail, slide filmstrip,
   annotation bar, drag/click resources onto the board. *(`teach.jsx`)*
10. **Settings / Setup** — appearance hub + config. The appearance controls are one
    **shared `AppearanceControls`** component reused by the landing menu, the
    per-view style cog, Setup, and the Planner Hub. *(`settings.jsx/.css`,
    `config.jsx/.css`)*

---

## Interactions & behavior

- **Navigate in place** — switching views swaps content on the glass; the background
  holds. No page reloads.
- **Per-heading style cog** — a gear after each view title opens a **Style** menu
  (Frame · Glass register · Background · Theme · photo picker/upload · motion),
  scoped **This page** or **Whole site** (a page override always wins; choosing Whole
  site clears the page override so it follows the site).
- **Tools dock** — floating, drag-anywhere, **corner-resizable** window
  (Shout Box · To-Do · Notes + Resources/Catch-Up shortcuts); snap-to-dock at the
  right edge; **collapses to a draggable icon rail** that flips vertical/horizontal;
  Esc closes; mode/size/position/active-tab persist.
- **Notifications** — toasts (top-right, type-keyed, auto-dismiss), a **bell +
  notification center** with unread badge / filter chips, and inline badges (Tools
  button, To-Do tab). A scheduler promotes due-soon/overdue tasks to notifications.
- **Enriched To-Do** — assignee · due date/time · priority · status; due chips
  (green/amber/red); Mine/Everyone; overdue pinned; assigning fires a notification.
- **Forking cues** — Personal/Team toggle (person vs group icons); Team mode glows
  the app pink; three-tier lesson stripes.
- **Motion** — ambient background drift (30–60s); ~200–350ms view entrances; theme
  washes are smoothed multi-stop gradients (no banding); the accent glow lives in the
  background wash, not as a hard per-card halo. **All decorative motion gated on
  `prefers-reduced-motion: no-preference`**, with the visible end-state as the base.
- **Touch is first-class** — tap=click (≥44px), swipe between views/days/slides,
  finger drag for reorder/resize, long-press for discovery/context. No hover-only
  state, ever. (Framework §13.)

## State management

The prototype persists appearance and tool state in `localStorage` (frame, glass,
background, theme, brightness, per-page style overrides, photo selection, Tools dock
mode/size/position/tab, notifications, to-dos). In production these become user/team
settings in Supabase (Phase 1B), but the **shapes** are visible in `app.jsx` and the
tool/notification components. Tone (`data-tone`) is **derived** from theme +
background brightness (incl. photo auto-luminance) — compute it once at the root and
let every surface branch on it.

---

## Design tokens

Use `design-system/colors_and_type.css` verbatim as the token layer (colors, type
scale, radius, shadows, spacing). `themes.css` holds the 7 theme washes and the
**surface-theming contract** (how overlays receive a faint accent wash above the
app-wide tint). `modes.css` holds the frame engine. **Per `CLAUDE.md`: tokens live in
CSS custom properties, never in `tailwind.config.ts`; Tailwind supplies layout/spacing
utilities only. Never hard-code a hex or px font size.**

## Assets

- `assets/photos/p1–p5.png` — the rotating teaching-photo background library.
- `assets/classroom-photo.png` — the real classroom photo used as a Photo background.
- `assets/logo-glyph.svg`, `logo-glyph-on-honey.svg` — the wordmark glyph. (The
  mockup also inlines the glyph as an SVG string.)
- Resource thumbnails / external resources in the mockup are mock URLs (Google
  Slides/Docs/Drive, YouTube) — placeholders for real resource links.

## Files (where the design lives)

- **Canonical runnable reference:** `mockup/New v2 Site Design.bundled.html`
- **Design contract:** `design-system/V2 Framework.md` (+ `V2 Design System.html`,
  `Design Language.html`)
- **Tokens/engine:** `design-system/colors_and_type.css`, `themes.css`, `modes.css`,
  `styles.css`
- **Per-feature specs:** everything in `specs/`
- **Exact implementation values/logic:** the `source/` tree
- **Product policy & scope:** `CLAUDE.md`

---

## Build guidance (do / don't)

**Do:** recreate faithfully in Next.js + React + TS; reuse the token system; keep
grade-scoping and the configurable school-week/schedule in every data shape; keep
each surface single-purpose; verify every surface at **phone 360–480 / tablet
600–900 / desktop 1024–1920** and under **Wash · Photo-Dim · Photo-Bright · Night**
(the tone/contrast extremes) and with **touch** (tap/swipe/drag/long-press).

**Don't:** ship the prototype HTML/Babel as production; add theme colors to
`tailwind.config.ts`; hard-code colors/fonts/subject palettes, a single grade, a
5-day week, or a fixed daily schedule; break the forking model (completion never
forks; Personal edits never silently write to Master; Team mode is never gated by a
confirm dialog — the pink glow is the safety); use sharp corners (Rule #1); add
filler/decorative data.

_This README is self-sufficient: a developer who wasn't in the design sessions can
implement the product from it plus the bundled mockup and `V2 Framework.md`._
