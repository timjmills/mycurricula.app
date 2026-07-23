# Curricula — UI/UX Framework

> **The definitive design language for `mycurricula.app`.**
> This document and its companion visual guide (`V2 Design System.html`) are the
> single source of truth for how the product looks, feels, and behaves. When code
> and this document disagree, this document wins — fix the code.

The companion files:
- **`V2 Design System.html`** — the browsable visual guide (colors, type, materials, components, themes). Open it in a browser.
- **`colors_and_type.css`** (project root) — the token implementation. Every value below is a `var(--token)`; never hard-code.

---

## 0. Hard rule — works on every device, every surface

> **The design MUST be built to work, and every surface — every page, view, panel,
> menu, modal, popover, and feature — MUST work and lay out correctly across all
> three device widths: phone, tablet, and computer.** This is not a final polish
> pass; it is a build requirement for every surface from the first commit.
>
> - **Phone** 360–480px · **Tablet** 600–900px · **Desktop** 1024–1920px.
> - No page-level horizontal scroll at any width; every control reachable without
>   off-screen overflow; internal element scroll is fine, the document is not.
> - Touch targets ≥44px on phone/tablet; sticky chrome ≤~30% of phone height.
> - Touch is first-class (tap / swipe / drag / long-press) — see §13.
> - A surface is not "done" until it has been verified at **~400 / ~768 / ~1280**
>   AND with touch. Full details in §13.

## 1. North Star

Curricula is a calm operating surface for a teaching team. The feeling is
**minimal, light, airy — like an Apple product.** A teacher should open it and
exhale.

Three words govern every decision:

- **Calm.** Generous whitespace, one clear action per surface, nothing competing for attention. Quiet by default; color and motion arrive only when they mean something.
- **Light.** White and warm-cream surfaces, soft daylight, frosted glass. Never heavy, never dark (except the deliberate Night theme). Content floats; it is never boxed in.
- **Alive.** A slow-drifting background, a gentle entrance, a photo breathing behind glass. Movement is ambient, never demanding.

If a design choice does not serve calm, light, or quiet aliveness, it is wrong.

---

## 2. Principles

1. **Float, don't fill.** Content sits on soft-cornered panels that float over the
   background with breathing room around them. Nothing runs edge-to-edge except
   the background itself. The working canvas is inset, rounded, and shadowed.

2. **The background is alive but silent.** A rotating teaching photo or a soft
   brand-mesh wash sits behind everything, drifting slowly. It sets mood and
   never competes — foreground glass and scrims keep it readable.

3. **Glass is the primary material.** Foreground surfaces are frosted, translucent
   panels that let the background bleed through. They feel light and physical, not
   like opaque cards stacked on a page.

4. **Color is information, never decoration.** The eight subjects own fixed colors.
   Status owns fixed colors. A colored element always means something. Neutral is
   the default; saturation is earned.

5. **One surface, one job.** Each view answers one question. Day = "what now?"
   Week = "what this week?" Curricular plan = "where in the year?" Lesson plan =
   "what's in this lesson?" Teach = "project it." Toggles change a surface's
   _content_, never its purpose.

6. **Navigate in place.** The app is one continuous space. Switching views swaps
   the content on the glass while the background holds — no page reloads, no
   jarring cuts. The user never feels they "left."

7. **Motion clarifies, never decorates.** Slow background drift, ~200–350ms
   content transitions, gentle entrances. No bounce, no parallax, no confetti.
   Everything respects `prefers-reduced-motion`.

8. **Progressive disclosure.** Show the few things that matter; tuck the rest
   behind "Advanced," "Details," or hover. A first-time teacher sees a clean
   surface; the power is there when they reach for it.

9. **Personal-first, with deliberate friction for shared edits.** A teacher always
   sees their own version. Editing the team's shared plan is gated and signaled
   (the pink Team glow) — never accidental.

---

## 2a. Aesthetic sensibilities

The principles say _what_ to do; these are the taste judgments — the felt sense of
"this is Curricula, that isn't." When a decision is ambiguous, lean here.

- **Daylight, not screens.** The mood is morning light through a window — warm
  whites, soft shadows, glass that catches light. Never the flat, cold grey of a
  generic dashboard. If a surface feels like "an app," warm it up.
- **Restraint reads as quality.** The premium feeling comes from what we leave
  out: few borders, few fills, lots of air. One focal element per surface; let it
  breathe. Empty space is a feature, not waste.
- **Depth by light, not by lines.** Separate things with translucency, blur, and
  soft shadow — not hard dividers and boxes. The interface is layered glass over a
  living background, not stacked cards with strokes.
- **Color whispers, then speaks.** The resting state is near-neutral. Color enters
  only to carry meaning (a subject, a status, the active accent) — and when it
  does, it's confident, never muddy. One color leads at a time.
- **Soft everything.** Rounded corners, feathered shadows, gentle gradients, eased
  motion. No hard edges, no abrupt cuts, no harsh contrast except where contrast
  _is_ the message (text legibility, an urgent state).
- **Motion is breath.** The app is alive but at rest — a slow drift, a gentle
  settle. Movement should feel like breathing, never like a demo reel. If an
  animation calls attention to itself, it's too much.
- **Type is calm and confident.** Generous line-height, open tracking on the airy
  moments, lighter weights over bold. Words have room. Headings are quiet display,
  not shouty.
- **Tactile and physical.** Glass, light, and momentum make it feel like an object
  you can touch — surfaces respond, follow the finger, and settle. Digital, but
  with the weight of something real.
- **Honest and humane.** No dark patterns, no fake urgency, no decorative data.
  Everything on screen is true and useful. The tone respects a busy teacher's
  attention.

**Quick gut-checks before shipping a surface:** Does it feel _light_? Could I
remove something and lose nothing? Is there one clear focus? Does color mean
something here? Would this feel at home next to the home screen? If any answer is
no, keep refining.

---

## 3. The spatial model

The app is built in layers, back to front:

```
┌─ Background ───────────────────────────────────┐  full-bleed, drifting
│   teaching photo (graded)  OR  brand-mesh wash │
│   ┌─ Frame ───────────────────────────────┐   │  inset ~30px, radius 30px,
│   │  scrim / veil (readability)           │   │  soft shadow — the photo's
│   │   ┌─ Overlay (foreground) ─────────┐  │   │  rounded "window"
│   │   │  top:    logo · tools · ⋯      │  │   │
│   │   │  center: greeting · console    │  │   │  glass chrome floats here
│   │   │  bottom: context · clock       │  │   │
│   │   │  footer: quote                 │  │   │
│   │   └────────────────────────────────┘  │   │
│   └───────────────────────────────────────┘   │
└────────────────────────────────────────────────┘
```

- **Background** fills the viewport and never stops moving (unless Motion = Still).
- **Frame** is the rounded, inset window the photo lives in — it gives the
  "floating, not filling" feel. In full-bleed mode it relaxes to the edges.
- **Scrim / veil** is an invisible readability layer — just enough shading to keep
  white text legible, tuned per theme and per Photo brightness.
- **Overlay** holds the foreground glass: the four corners and the center console.

**Corners are a fixed grammar:**
- **Top-left:** the wordmark (home).
- **Top-right:** Personal / Team toggle, Tools, Help (?), Settings (⋯).
- **Bottom-left:** school · grade · unit · week context.
- **Bottom-right:** live clock with now / next class.
- **Bottom-center:** the daily inspirational quote (dismissible).

---

## 4. Color

The full palette lives in `colors_and_type.css`. The rules for _using_ it:

### Neutrals (the default world)
Warm whites over a cream canvas. This is where most of the app lives.
- `--canvas` `#FCFAF6` — the page behind everything.
- `--surface` `#FFFFFF` / `--surface-warm` `#FFFDF8` — solid card fills.
- Text: `--ink` `#1C1B2E` → `--ink-soft` → `--body` → `--muted` → `--faint`.
- Lines: `--border`, `--hairline`.

### Brand (functional primary)
Indigo. Actions, links, focus rings, "in progress." `--brand-500` `#3B6CF6` is
the workhorse; `--brand-600` for text-on-light.

### Subject scale (the load-bearing color)
Eight **named** subjects, **locked team-wide**, each mapped to a muted hue with a
`-tint` (fills) and `-ink` (text on tint), plus a `-bright` variant for
dots/outlines. The underlying token scale is **wider than eight** (`--subj-1 …
--subj-15`, 15 hues + brand indigo) so the system supports more subjects and a
16-swatch palette (e.g. the Resource Wall's per-card colors) without reuse; the
eight below are the named curriculum subjects:

| Subject | Token |
|---|---|
| UFLI | `--subj-2` apricot |
| Reading | `--subj-10` blue |
| Math | `--subj-1` gold |
| Writing | `--subj-5` pink |
| Grammar | `--subj-7` purple |
| Spelling | `--subj-9` periwinkle |
| Explorers | `--subj-13` green |
| SEL | `--subj-12` teal |

**Rules:** never invent a subject color; always pull from the scale or the
`useSubjectColor` hook. A subject's identity (stripe, glyph, dot, lane, lesson
title highlight) is always its color. The subject→color map is locked; only
theme/appearance is per-teacher.

### Status (semantic, more saturated than subjects)
`--done` green · `--progress` blue · `--idle` grey · `--warn` amber · `--danger`
red. Each has a `-tint`. These read louder than subjects on purpose.

### Themes shift the accent
The active theme remaps `--accent` (see §7). Honey→gold, Sky→blue, Mint→green,
etc. Primary buttons, glows, focus, and active states follow `--accent`; subject
and status colors never change.

---

## 5. Typography

Three families, each with a job (loaded in `colors_and_type.css`):

- **Poppins** — large display & H1. Geometric, friendly, confident.
- **DM Sans** — smaller headings, the wordmark.
- **Plus Jakarta Sans** — all UI, body, and data.

Use the role tokens / `.ds-*` classes, never raw sizes:

| Role | Font | Size | Weight |
|---|---|---|---|
| Display | Poppins | 44px | 700 |
| H1 | Poppins | 28px | 700 |
| H2 | DM Sans | 22px | 700 |
| H3 | DM Sans | 18px | 700 |
| Body L | Jakarta | 16px | 400 |
| Body | Jakarta | 14px | 400 |
| Small | Jakarta | 13px | 500 |
| Label | Jakarta | 11px, `.09em`, UPPERCASE | 700 |

**Apple-like type behavior:** lean on lighter weights and open tracking for the
airy moments (the hero greeting, the quote line use weight 300–400 with positive
letter-spacing). Tighten (`-.02em`) only on large display. Never below 13px for
UI, 24px on the Teach board. `text-wrap: pretty` on running text.

---

## 6. Materials, radius & elevation

### Glass (the signature material)
Frosted, translucent panels. The recipe (see `.glass` and the view cards):
```
background: rgba(255,255,255,.14–.66)   /* lighter over photo, denser when needed */
border: 1px solid rgba(255,255,255,.34)
backdrop-filter: blur(18–34px) saturate(1.3)
box-shadow: 0 10–40px … rgba(12,11,20,…)  +  inset 0 1px 0 rgba(255,255,255,.4)
```
Glass always carries an **inner top highlight** (the `inset 0 1px 0` white line) —
that's what reads as a lit glass edge. Over dark backgrounds it tints darker;
over light it stays bright. Never replace glass with a flat opaque card in the
floating chrome.

#### Two frosted registers — Dark & White (a glass sub-axis)
Calm Glass (Frame A) ships in **two frosted registers**, chosen by the teacher
(`data-glass="dark" | "light"`), independent of the background and tone:
- **Dark frosted** — translucent dark panels (`rgba(46,46,64,~.4–.5)`), **white**
  text. The default; the most cinematic over photos.
- **White frosted** — translucent **white** panels (`rgba(255,255,255,~.5–.66)`),
  **dark ink** text. The register is **surface-only** — it changes the panels, it
  must **never** wash or lighten the background itself.

The glass register flips a panel's fill **and** its text color together (the
legibility contract, §15). Subject-color and per-section custom backgrounds still
override the register.

#### Material by background — Frosted vs Liquid
- **Over Photo** → plain **frosted** glass (the recipe above), dark or white register.
- **Over Wash** → **Liquid glass** ("Liquid v5"): a flatter, glassier sheen with
  sharper, more pronounced highlight/shadow edges and a lit top rim, so panels read
  as crystal over the abstract wash rather than soft frost. Both dark and white
  registers get the Liquid treatment over Wash.

These two material choices are the finalized signature of the system: **frosted on
photo, liquid on wash**, each in a dark or white register.

### Radius (generous, soft)
`--r-sm 10` · `--r-md 14` · `--r-lg 18` · `--r-xl 24` · `--r-2xl 32` · `--r-pill`.
Bias large. **Rule #1 — NO SHARP CORNERS, EVER.** Every panel, card, tab, chip,
button, image, preview tile, and input is rounded — no exceptions. When in doubt,
round it. This is the single most important visual rule in the app.

### Elevation (soft, low-contrast, cool)
Shadows are wide and faint, cast cool over the warm canvas: `--sh-xs` → `--sh-lg`,
plus colored `--sh-brand` / `--sh-honey` for primary actions. Never a hard or
black drop shadow.

---

## 7. The theme system

A **theme washes over the whole app** — background palette, a gentle tint over
everything (including buttons), and the accent/glow color. **One tone governs the
entire app** so every page matches the home screen: Night = dark; everything else
= light. The frame (§9) only changes a view's _layout_, never the tone.

| Theme | Feel | Accent |
|---|---|---|
| **Clear** *(formerly "Normal")* | the original balanced brand mesh (honey · violet · sky · rose on neutral); shown with a clear/white swatch in the picker | sky-blue, slowly cycling the four light hues in Photo mode |
| **Night** | deep slate-navy dark mode | soft indigo |
| **Honey** | warm gold · amber · coral · yellow | gold |
| **Blossom** | pink · violet · periwinkle · soft coral (multi-hue, not flat pink) | pink |
| **Mint** | blue-green with a touch of yellow | green |
| **Sky** | cool blues | blue |
| **Photo (Off)** | no wash/tint — the true original photo, white-on-photo | brand indigo |

> **Naming:** the resting theme is **Clear** (white swatch); older docs/code may
> still say `normal` for the data value. Theme washes are smoothed multi-stop
> gradients (origin pushed off-canvas) so they never show a hard band, and a
> gentle accent glow lives in the **background wash**, not as a hard halo per card.

Each theme also lightly **shades the glass and shifts the accent** so the whole
surface reads as that theme, not "neutral + a hint." Themes (and all washes)
**drift slowly** by default; Motion = Still stops them.

**Overlays carry the theme too.** Modals, drawers, popovers and menus render
_above_ the app-wide wash layer (`.theme-tint`, z-index 90), so the whole-app
tint can't reach them. They instead receive their own faint **accent wash**
centrally — see `home/themes.css` → "SURFACE THEMING CONTRACT." Combined with
tone (`data-tone`) and the accent token, this makes every surface — not just the
background — belong to the active theme. Normal and Photo(Off) get no wash.

---

## 8. Backgrounds

Two background modes, chosen in Settings → Appearance:

### Wash
A soft brand-mesh gradient (the active theme's palette) that slowly pans, zooms,
and gently twirls — alive without being distracting. Normal cycles its four hues
on a long, imperceptible cross-fade.

### Photo
A rotating teaching photo behind the frosted glass. Photo mode adds a four-layer
**premium grade** so the theme lives _in_ the image, not as a film on top:
1. **Duotone color-grade** — recolors by hue toward the theme (subtle, ~20%).
2. **Directional light + vignette** — a soft light from upper-left, gentle vignette opposite; doubles as a readability scrim where text sits. Neutral (white/black), not tinted — so text stays crisp.
3. **Saturation/contrast lift** — the photo itself reads richer.
4. **Theme-tinted glass + accent inner glow** — the chrome belongs to the theme.

**Photo brightness** (Dim / Normal / Bright):
- **Dim / Normal** — white-text-on-photo treatment; the photo recedes behind a soft scrim.
- **Bright** — the photo stays prominent and **frosted** behind _white_ content cards (light tone, dark text), like a bright, airy workspace. UI hardens (stronger text-shadows, firmer borders) so it holds on light or white photos.

**Auto-brightness.** `Normal` is an **auto** mode: the app samples the active
photo's average luminance (a 32×32 canvas read) and derives tone automatically —
a **light photo → dark text**, a **dark photo → light text**. `Dim` and `Bright`
are manual overrides. Because tone is what every surface branches on, this makes
text legible on any photo the teacher loads without a manual toggle. All view
list/rail/header text follows `data-tone`, not the raw `data-bg`.

**Per-screen photos.** A teacher can select multiple photos to rotate through,
upload their own, and choose drift/zoom/still motion — scoped to **this page** or
the **whole site** (the per-heading style cog, §10a). Per-section custom photos in
the Resource Wall override the page background for that section only.

Picking **Off / Photo** gives the true, ungraded original.

**Presets:** Background is wired to two sensible bundles — choosing **Photo** sets
Light canvas · Calm-glass frame · Segmented buttons; choosing **Wash** sets Light
canvas · Bright frame · Segmented buttons · Mesh off.

---

## 9. Navigation, IA & the three frames

### The console
The center of the home screen is a **segmented console** of the five views:

**Day · Week · Curricular plan · Lesson plan · Teach**

It is the spine of the app. Clicking a view **navigates in place** — the photo
holds, the content swaps on the glass with a soft entrance. A compact version of
the same console sits at the top of every view for switching.

### The three frames (a per-teacher look, not per-view)
The same data renders in one of three layout characters, chosen once and carried
across every page:

- **A · Calm glass** — frosted cards float over the (blurred) background; the
  calmest, most ambient reading. Carries the **Dark / White frosted register**
  sub-axis (§6) and is **frosted over photo, liquid over wash**.
- **B · Bright workspace** — the background recedes to a near-white paper; clean
  white cards, ink text; the most document-like.
- **C · Color-forward** — subject color leads. Each section/row/card is filled with
  **its own subject color** (never one global accent): headers and rows are soft,
  luminous, translucent subject tints (light pastel over white in the planner),
  with the subject color on the leading edge. The constellation year view, subject
  doc headers, and per-subject resource sections all key off the subject scale.
  The most expressive frame; still obeys the legibility contract.

A frame changes _layout and emphasis_, never the global tone. **Canonical names &
data attributes:** `data-frame="glass|paper|color"` is the spec vocabulary; the
working build also carries the equivalent `data-version="A|B|C"` on the app root —
treat them as the same axis (A=Calm Glass, B=Bright/paper, C=Color).

---

## 9a. View & Edit modes (Day & Week)

Day and Week each carry a **View ↔ Edit** toggle (an icon pair parked in the
top-left cluster next to the title). The choice is **remembered per view**, and the
global appearance settings (frame, background, glass, theme) are **one source of
truth shared across both modes** — flipping View/Edit never restyles the page.

- **View** — the read-optimized surface (the existing Day agenda / Week grid).
  It answers "what's happening"; it is not for authoring.
- **Edit** — the planner, bound to the **same unified lesson data** View shows and
  respecting the current Personal/Team fork (with an explicit **Save to team** on
  the editor):
  - **Day edit** is a **two-pane** surface: a **fixed** compact agenda list on the
    left (time · dot · title · subject, the current/next lesson selected by
    default) and a **scrolling** fill-in template on the right. Selecting a lesson
    on the left swaps the right template to it (single template, animated slide).
    The split is **resizable**. On phone the list becomes a horizontal strip on
    top, the template fills the rest.
  - **Week edit** is a **period-aligned column board** (Common-Planner style): day
    columns, lessons as flush stacked cells sitting in shared period rows so the
    same time band lines up across days. Cells **drag across days and periods**,
    leaving an empty slot behind; a live **drop placeholder** shows where a lesson
    will land, cells **minimize to their colored header while dragging**, and the
    shift **FLIP-animates** into place. An **Aligned by time / Stacked** layout
    toggle packs cells flush regardless of gaps.
- **The lesson editor** (the fill-in template) is the shared authoring surface used
  by Day edit's right pane, the Week cell's inline expand, and the **lesson popup**
  — see §10.
- **Lesson popup.** In **View** mode a lesson's popup menu → **Plan** opens a
  centered **resizable modal** of the lesson editor over a **glassed-out backdrop**;
  it closes only via **Exit** or **Esc** (an outside click does *not* close it, so
  you can't lose work by mis-clicking). In **Day edit** the same action selects the
  lesson into the right pane instead (no modal — the surface is already an editor).
- **Plan tab retired.** The old standalone "Plan" view is gone; the **Plan** nav
  entry now opens the **Planning Hub**.

## 9b. Immersive surfaces (Plan · Post · Teach)

The three working surfaces — **Planning Hub, Resource Wall (Post), Teach Board** —
go **full-bleed**: the two-row nav chrome, the view console, and the notification
cluster all drop away so the surface fills the entire rounded canvas. In their
place is a **single slim floating bar** (soft top scrim for legibility) carrying
only **Back**, the **title + style gear**, and — on Plan — the **Personal/Team**
toggle. The bar **auto-hides** and returns on pointer movement near the top. Normal
views (Day/Week/Year) keep their full chrome; immersion is scoped to these three.

---


The canonical inventory (see the visual guide for live examples):

- **Buttons.** Pill-shaped. Primary = `--accent` fill + colored shadow; secondary
  = glass or white with a hairline border; ghost = text only. ≥44px touch target
  on primary actions. Labels that _are_ the explanation ("Save", "Close") get no
  tooltip.
- **Glass chips & chrome.** The logo, mode toggle, Tools, clock, context — all
  frosted glass with the inner highlight.
- **Cards.** Tone-aware: frosted over dark, white with a hairline + soft shadow
  over light. Always rounded `--r-xl`.
- **Subject glyph.** A rounded tile with the subject's initial, filled in the
  subject color (a soft pastel chip in Bright mode).
- **Pills / type tags.** Standards as mono pills; resource types color-coded
  (Slides, Worksheet, Image, Doc, Video, Link).
- **Lesson cells.** Subject-striped, click → Plan/Teach menu, hover → a **tinted
  dark-glass popup** with title, objective, standard, resource count. Titles are
  inline-editable.
- **Manila tabs.** The lesson-planning tools (Objective · Standards · Notes ·
  Differentiation · Resources) live in one rounded card; the active tool is a
  soft accent-tinted tab with an accent underline. Draggable to reorder, wrap to
  stack. No protruding shapes — rounded, seamless.
- **Differentiation tiers.** Support / On level / Extension as frosted-glass
  cards, each with a thick subject-accent stripe on top.
- **Lesson flow.** Expandable, typeable sections; each title highlighted in the
  subject color; expand-all / collapse-all at the top.
- **Lesson editor (fill-in template).** The shared authoring surface (Day-edit
  right pane · Week cell expand · lesson popup). Fully customizable **section
  blocks**: drag-reorder (hold the banner), inline-rename, per-section **wash color**
  (each header defaults to a different subject wash unless overridden in the lesson
  template defaults; a toggle tints just the header or the field background too),
  add / delete / duplicate (⋯ menu), and a permanent **Resources** section. A
  **selection-driven floating rich-text bar** appears only when text is selected /
  a field is focused — B/I/U, three sizes, font, text + highlight color (curated
  washes behind a ▾), numbered + bulleted lists with indent, links, images, and a
  **resource chip** (from computer, link, image, note, Drive, or the built-in
  library). **Load template / Save as template** and a **Load standards** picker
  (add/delete standards) sit alongside Add section. Autosaves on every keystroke;
  edits broadcast live between the popup and the inline card. **Standards** and
  **Materials** are their own tabs; **Stats** and **Notes** round out the set.
- **Custom walls.** Enlarging a Resource-Wall **section** opens it as its own
  focused board with the full edit bar (search · type filter · four card sizes) and
  **Add resource**. **Adding a section** promotes it into **one custom wall in My
  Walls**, **anchored to the originating lesson** (never created by resource edits
  alone). The lesson's own Resources keeps showing its first section plus a
  **"N sections · M more resources"** chip that opens the linked wall; My Walls tags
  the wall with its linked lesson. **Every wall's background is fully customizable**
  (color · translucent shade+opacity · wash · photo · upload), persisted per wall;
  when set, the toolbar gets a **frosted contrast plate** and the floating bar a
  tone-matched scrim so chrome stays legible over any background. Sections show the
  lesson(s) they're tagged to, capped at **3 + a "+N" reveal**. (Called a *custom
  wall*, never a "board" — to avoid confusion with the Teach board.)
- **Teach board.** Minimizable/pinnable lesson rail, fullscreen board, slide
  filmstrip with a floating **+**, a bottom annotation bar (pen · highlighter ·
  eraser · text · color · clear), and resources you drag/click onto the board or
  open in a new tab. An invisible resizer splits lesson and board.
- **Clock widget.** Live time + day, now / next class with subject dots.
- **Tools dock.** A floating, **resizable** tool window (Shout Box · To-Do · Notes,
  plus Resources / Catch-Up shortcuts) that the teacher drags anywhere and resizes
  from the corner; snap-to-dock at the right edge. It **collapses to an icon rail**
  (the “–” control) that is itself draggable and can flip **vertical or horizontal**;
  re-expanding restores it where it was. Compact letter badges (S·T·N) in the small
  popup, full labels when larger. Mode, size, position, and active tab persist;
  Esc closes. Inherits tone, theme accent, glass, and modal-grade shadow/radius.
- **Notifications.** A three-layer attention system: **toasts** (top-right, stack
  max 3, auto-dismiss ~6s, a type-keyed left rail — message=brand · to-do=amber ·
  overdue=red · team=pink — with an action button and ✕); a **bell + notification
  center** in the top bar with an unread badge, Today/Earlier groups, filter chips
  (All · Messages · To-dos · Team) and “Mark all read”; and **inline badges** (unread
  count on the Tools button, due/overdue count on the To-Do tab). Click jumps to the
  source. A scheduler promotes due-soon/overdue tasks into notifications. Backed by
  a local store today; wires to Supabase realtime in Phase 1B.
- **Enriched To-Do.** Each task has **assignee, due date/time, priority, status**,
  and an optional lesson/subject link. Row UI: checkbox · title · colored assignee
  avatar · due chip (green upcoming / amber soon / red overdue) · priority flag.
  Mine/Everyone filter; overdue pinned to top. Assigning a task fires a notification.
- **Settings panel.** A right-side frosted drawer. **Basic** (Theme · Background ·
  Photo brightness · Quote) always visible; **Advanced** (Canvas · Frame ·
  Buttons · Captions · Motion · Mesh · Edges) behind a dropdown. The appearance
  controls are a **single shared `AppearanceControls` component** reused verbatim by
  every surface that lets a teacher restyle: the landing menu, the per-view style
  cog (§10a), the Setup modal, and the Planner Hub — so all visual-settings menus
  look and behave identically, with the This-page/Whole-site scope toggle.
- **Quote.** A quiet bottom-centered line (light weight, truncates at two lines)
  that opens a frosted popup with full context + a source link.

---

## 10a. Page & panel titles

Every primary view and every major panel carries a clear title so a teacher always
knows where they are.

- **View titles** (top-left, over the background): **The Day · The Week · The Year ·
  Lesson Plan · Resource Wall · Teach Board.** The title adapts to the active **frame**
  and is consistent within each:
  - **A · Calm glass** — large quiet display (Poppins), white/ink by tone.
  - **B · Bright workspace** — tighter DM Sans heading with a thin **accent underline**.
  - **C · Color-forward** — accent **gradient** wordmark.

  Existing context (e.g. "2025–26 · Grade 5", the week range, the day's date) stays as a
  sub-line beneath the title, never replaced.
- **Panel titles** — every major panel has a heading: Planner hub ("Planner"), Setup,
  Catch-Up, Tools, the Unit/Lesson Planner (the unit/lesson name), the Resource Wall
  (the wall name). Pages title top-left; popovers/drawers use their own header treatment,
  kept consistent across panels.
- **Per-heading style cog.** A small gear sits right after each view title; it opens a
  **Style** menu to set that surface's **Background** (Photo/Wash) and **Frame**
  (Glass/Bright/Color), scoped to **this page** or the **whole site** — a page override
  always wins over the site default. Scope is colour-coded: **accent = this page**, **ink
  = whole site**.
- **Rule:** a new view or major panel must declare a title in this same system — never
  ship a titleless primary surface.

## 11. The forking model (Personal / Team)

The product's core idea: one **Master / Team** plan; each teacher sees their
**Personal** copy where one exists. Editing Personal is silent and automatic;
editing Team is deliberate.

**Visual cues:**
- Top-right **Personal / Team Curriculum** toggle.
- Switching to **Team** glows the whole app **pink** — a frame edge-glow (with a
  brief two-pulse), the toggle, and the planning header — a persistent caution
  that "changes here affect the whole team." Reduced-motion shows it solid, no flash.
- Three-tier lesson differentiation: solid subject stripe (from Master) · dashed
  stripe + "Modified" pill (personally edited) · move-arrow (personally moved).

Never gate Team mode behind a confirm dialog — the glow _is_ the safety mechanism.

---

## 12. Motion

- **Ambient drift** — backgrounds pan/zoom/twirl on 30–60s loops; Normal cross-fades its hues over ~26s with a long dissolve.
- **Entrances** — views fade/rise in ~350ms; the quote fades in ~1.4s; the settings drawer slides ~300ms.
- **Micro-interactions** — hovers lift 1–2px; buttons ~150ms.
- **Always** gate decorative motion on `prefers-reduced-motion: no-preference`, and make the visible end-state the base style (so print/PDF/reduced-motion show content, never a pre-animation blank).

---

## 13. Accessibility, touch & responsive

- **Contrast:** WCAG AA minimum. On photos, scrims/shadows guarantee legibility; Bright mode flips to dark-on-white.
- **Targets:** ≥44px on primary/touch controls.
- **Keyboard:** every control reachable and operable; Esc closes popups/drawers.
- **Reduced motion:** honored everywhere — no drift, no flash, no pulse.
- **Responsive:** three tiers — phone 360–480, tablet 600–900, desktop 1024–1920. No page-level horizontal scroll at any tier; internal scroll is fine. Sticky chrome never eats >30% of phone height. Verify at ~400 / ~768 / ~1280 before "done."
- **No visible scrollbars** as a brand rule — content moves by drag, arrows, or hidden-scroll regions; never an exposed scrollbar.

### Touch & swipe — a first-class input, not an afterthought

This is a tablet-and-phone product as much as a desktop one (a teacher holds an
iPad at the board). **Everything is touchable and swipable.** Every interaction has
a finger-native path at least as good as the mouse path:

- **Tap = click.** Every clickable target is tappable, ≥44px, with no reliance on hover to reveal it. Anything that _only_ appears on hover (the week + add button, the lesson hover card) must also surface on tap / long-press.
- **Swipe is primary navigation.** Horizontal swipe moves between console views (Day → Week → Curricular plan → Lesson plan → Teach), between days, week-to-week, and across Teach-board slides. Vertical swipe scrolls within a surface, never the page.
- **Drag works by finger.** Tab reorder, resource drag-to-board, the Teach lesson/board resizer, slide reordering — all respond to touch drag. Use Pointer Events (`pointerdown/move/up`), never mouse-only handlers.
- **Long-press = secondary / discovery.** Long-press surfaces the onboarding explanation on touch (the desktop hover tooltip) and opens context actions (skip / duplicate / delete) where desktop uses right-click.
- **Pinch / pull where expected.** Pinch-zoom the Teach board; pull-to-dismiss (swipe-down) the settings drawer and sheet popups.
- **Momentum & snap.** Swipe transitions follow the finger, then snap to the nearest view with easing — no dead, instant cuts on touch.
- **No hover-only state, ever.** Hover may _enhance_ on desktop, but the feature must be fully operable by tap/swipe/long-press. If you can't do it with a finger, it isn't done.
- **Generous spacing.** Touch rows and chips get larger hit areas and gaps than a mouse design would — err roomy on phone/tablet.

Verify every new surface with touch emulation (tap, swipe, drag, long-press) before "done," the same way you verify the three responsive tiers.

---

## 14. Voice & content

- **Quiet and human.** Tell a teacher what a control _accomplishes_, in context — "Switch to editing the team's curriculum (changes affect everyone)," not "Toggle mode."
- **Less is more.** No filler, no decorative stats, no dummy sections. Every element earns its place.
- **No emoji** unless a brand decision says otherwise.
- **One thousand no's for every yes.** When in doubt, remove it.

---

## 15. Combinations & pairings

The appearance system is **combinatorial** — six independent axes the teacher mixes
freely. The power is in the combinations; the discipline is in keeping every
combination legible and calm. This section is the contract for how the axes behave
alone, what pairs well, and how any _new_ menu or surface must drop into the mix.

### The six axes

| Axis | Options | What it controls |
|---|---|---|
| **Background** | Wash · Photo | What lives behind the glass |
| **Theme** | Normal · Night · Honey · Blossom · Mint · Sky · Photo(Off) | Palette, tint, accent, tone |
| **Photo brightness** | Dim · Normal · Bright | Photo prominence + text treatment (Photo only) |
| **Canvas** | Glass · Light · Minimal | The home center panel |
| **Frame** | A Calm glass · B Bright · C Color-forward | Data-view layout character |
| **Buttons** | Light · Dark · Segmented | View-switcher treatment |

### Each axis, on its own

- **Background — Wash:** calmest, most abstract. Always light tone (except Night). Text is ink/off-black; the wash tints _over_ the text, never recolors it. Best when the teacher wants zero distraction.
- **Background — Photo:** warmest, most human. Tone depends on brightness (below). The photo is graded to the theme but text/menus stay neutral white or black.
- **Theme:** sets the accent and the wash/grade hue. **Night is the only dark theme** and forces dark tone app-wide. All others are light. The theme never touches subject or status colors — only the accent (buttons, glows, focus, active states) and the background palette.
- **Photo brightness (Photo only):**
  - **Dim** → dark tone, **white** text, heavy scrim, white menu/chrome text. Maximum contrast; use over busy or light photos.
  - **Normal** → dark tone, **white** text, soft scrim. The balanced default.
  - **Bright** → **light** tone, **dark** text on **white frosted cards**, photo stays vivid behind. The bright airy workspace; UI hardens (text-shadows, firmer borders) to survive light photos.
- **Canvas:** Glass (dim frosted, white text) · Light (light frosted, ink text) · Minimal (no panel, text floats). Canvas is the _home_ panel only.
- **Frame:** A floats frosted cards (white text, dark-tone reading) · B is white paper (ink text) · C leads with subject-color panels. Frame sets data-view layout, **never** global tone.
- **Buttons:** Light/Dark pills or one Segmented console. Segmented is the default spine.

### The legibility contract (text × surface)

This is non-negotiable — every combination must satisfy it:

- **Dark tone (Night, or Photo Dim/Normal):** text is **white** (`#fff` → `rgba(255,255,255,.7)`); glass is translucent-dark; menus/popups are dark glass with white text. Subject cells deepen their floor so white labels hold.
- **Light tone (Wash, Photo Bright, or any light theme):** text is **ink/off-black** (`--ink` → `--muted`); cards are white/translucent-white; the wash or photo tint sits _over_ the text without recoloring it.
- **Never** put ink text on a dark scrim or white text on a white card. When a surface flips tone, its text flips with it (this is why the Bright override exists).
- **Accent ≠ body text.** The theme accent colors _interactive_ and _emphasis_ elements (primary buttons, active tab, now-ring, focus). It must never tint plain reading text or nav labels — those stay neutral so the wash/grade can pass over them.
- **Subject color** always wins for subject identity, on any background. Over light it's the solid/ink; over dark it's the bright variant or a deepened gradient.

### Signature combinations (the powerful pairings)

Curated presets — each is internally consistent and has a clear "best for":

1. **Daylight Studio** *(the default)* — Photo · Normal · Light canvas · Frame A · Segmented.
   Warm, ambient, human. Best for the everyday home screen.
2. **Bright Desk** — Photo · **Bright** · Light canvas · Frame **B** · Segmented.
   Photo stays alive behind crisp white workspaces. Best for heads-down planning while keeping the room's photo.
3. **Quiet Paper** — **Wash** · Normal theme · Light canvas · Frame **B** · Segmented · Mesh off.
   The calmest, most document-like. Best for long lesson-writing sessions.
4. **Color Studio** — Wash or Photo-Bright · any color theme (Honey/Mint/Sky) · Frame **C** · Segmented.
   Expressive, subject-color-led. Best for the Curricular-plan/Week overviews where color navigation matters.
5. **Focus Night** — **Night** theme · Wash · Glass canvas · Frame **A** · Segmented.
   Low-light, after-hours. Best for evening prep; the only dark world.

The Background→preset wiring already snaps to the two most common bundles
(Photo → A/Light/Segmented; Wash → B/Light/Segmented/Mesh-off). The list above is
the human menu of "known-good" looks to offer or default to.

### Anti-patterns (combinations to avoid)

- **Minimal canvas over a busy Bright photo** — the floating text loses its background; pair Minimal with Dim/Normal or Wash.
- **Frame C (color panels) under a strong color theme on Photo-Dim** — subject gradients + a dark photo + a heavy accent = muddy. Use C on light tone.
- **Dark pills on a light Wash** — heavy and out of character; prefer Segmented or Light.
- **Two saturated layers** — e.g. a vivid wash _and_ vivid subject panels _and_ a colored accent all at once. Let one layer carry the color; keep the others neutral.

### Surface tiers — how far each axis reaches

Not every axis reaches every surface. The three teacher-facing axes have
**different natural scopes**, and treating them uniformly is what makes small
menus feel wrong. Classify every surface into a tier:

| | **Tier 1 — Major surfaces** | **Tier 2 — Lesser menus** |
|---|---|---|
| **Examples** | Full-screen resource wall, Planner hub, Tools dock, lesson/resource left panel, Config & Settings hubs, Catch-up, Unit/Lesson planner | Lesson right-click menu, Tools popover, preset/add dropdowns, reschedule/print dialogs, quote popup, row menus |
| **Theme** (tone + accent + wash) | ✅ always | ✅ always (accent + a *whisper* of wash) |
| **Background** (Photo/Wash) | ✅ when full-bleed (it replaces the view); modals let it blur through | ❌ — floats above the background; never renders its own |
| **Frame** (Glass/Bright/Color) | ✅ on data-layout surfaces only | ❌ — a menu has no layout character |

**Why:** Theme is universal and cheap — inconsistency there is what reads as
"broken." Background is a property of the *root canvas*; an overlay floats above
it and already reveals it through frosted blur, so a 180px context menu must not
render its own photo. Frame is a *data-layout character* — meaningless on a
utility popover. Forcing Background/Frame onto small menus is noise and a
legibility risk, and violates "calm / color whispers / earn color."

**Full-screen = page, not menu.** Anything that goes full-screen (Teach board,
full-screen wall, full-page library) is effectively a page and honors Background
+ Frame like a primary view.

**Override clause.** A surface may deliberately pin a fixed look when its job
demands it — the Teach board may hold a stable projection stage; the
share/export/print viewer stays neutral for paper. Such exceptions are allowed
**only when documented as deliberate**, never by accident.

### Forward rule — for new menus & functions

Any surface added later (a new panel, menu, view, modal) must **inherit the mix, not fight it.** Concretely:

1. **Read tone, not theme.** Branch on `data-tone` (light/dark), never on a specific theme — that's what keeps you correct across all seven themes automatically.
2. **Use glass + the tokens.** Build from the `.glass`/card recipe and `var(--accent)` / subject tokens. Don't hard-code a color or a white/black; you'll break a tone.
3. **Respect the legibility contract** above: text flips with tone, accent only on interactive/emphasis, subject color for identity.
4. **Default to neutral, earn color.** A new control arrives quiet; it picks up the accent only for its primary action or active state.
5. **Survive every background.** Verify the new surface over Wash, Photo-Dim, Photo-Bright, and Night before shipping — those four cover the tone + contrast extremes.
6. **Round everything, float it, keep one job.** New surfaces obey §§1–6: rounded, floating, single-purpose, progressive disclosure.
7. **Carry the theme on overlays.** Every modal, drawer, popover and menu must read as part of the active theme, not a neutral box. Overlays sit above the app-wide wash, so they get a faint **accent wash** from the central rule in `home/themes.css` ("SURFACE THEMING CONTRACT"). A new overlay must either reuse one of the registered surface container classes (`.hub-modal`, `.cfg-modal`, `.cu-modal`, `.ue-modal`, `.set-panel`, `.ll-dlg`, `.td-dock`, the popover/menu classes, …) **or** add its own root + scrim to that rule. This is mandatory: a surface that opts out will look off-theme in Honey/Blossom/Mint/Sky/Night.

**Audit rule:** every surface, menu, panel, page and feature must display correctly across all three axes the teacher controls — **Background** (Photo/Wash), **Frame/Canvas** (Glass / Bright / Color), and the **theme palette** (the six washes + Photo). Treat "does it hold under Wash, Photo-Dim, Photo-Bright, and Night" as a release gate, the same as the responsive + touch checks.

Follow these and a new feature drops into any of the millions of axis combinations
looking like it was always there.

---

_This is the contract. Build to it, and the product stays calm, light, and alive._

