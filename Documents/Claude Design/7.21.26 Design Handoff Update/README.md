# mycurricula.app — V2 Site Design Handoff (2026-07-20)

An **incremental** handoff for **mycurricula.app** (a Grade-5 teaching-team LMS).
This package documents **everything that changed since the `2026-07-02` handoff**,
plus a current map of the live design so a developer can rebuild it in the target
Next.js/React/TypeScript codebase.

> **Have the `design_handoff_v2_2026-07-02` package?** That one is still the baseline
> for the design system (tokens, three frames, six-axis appearance, legibility
> contract, forking model, the hard rules). **Nothing in those foundations changed.**
> This document is the delta on top of it. Read §"What changed" first.

---

## The design files are references, not shippable code

Everything in `source-*/` is an **HTML/React-in-the-browser prototype** (Babel-in-page
JSX, plain CSS, `window.*` globals — no bundler). It is the **ground truth for look
and behavior**, not code to paste into production. The task is to **recreate these
surfaces in the real codebase** (Next.js App Router + React 19 + TS, Tailwind for
layout only, all color/type/spacing as CSS custom properties) using its established
patterns — exactly as the `2026-07-02` handoff instructs.

**Fidelity: high (hifi).** Final colors, type, spacing, and interactions. Recreate
pixel-faithfully using the token system.

---

## The app is now ONE site with an embedded planner

- **Entry:** `V2 Site Design.html` → iframes `source-home/New v2 Site Design.html`
  (the whole app: Day · Week · Year · **Plan** · Post · Teach).
- **The "Plan" tab embeds the Planning Hub** (`source-planning-hub/V2 Planning Hub.html`)
  as an iframe, seamlessly (the hub's own header/search are hidden under `?embed=1`).
  The two React trees talk over `postMessage` (see §"Cross-tree bridge").

---

## What changed since 2026-07-02

### 1. Unified Unit/Lesson Workspace — the single planner (biggest change)
`source-planning-hub/ph-workspace.jsx` (+ styles in `ph-v2.css`). This **replaces
three older surfaces**, all now retired: the tabbed **unit-explorer** popup, the
**focus lesson** popup, and the legacy in-page unit view. There is now **one**
planner, reached from every entry point (timeline band/dot, Unit/Lesson Library,
list rows, Year/Day/Week unit clicks).

- **Presentation: modal-with-expand.** Opens as a centered modal over a dimmed
  scrim (`.ph-wswrap.mode-modal` + `.ph-ws-scrim`); a **⤢ expand** button promotes
  it to full-page (`data-mode="full"`), **⤡** collapses back, **×**/Esc closes. Last
  mode is remembered (`__phTLMem.wsMode`).
- **Header** — subject-tinted gradient bar (`linear-gradient(105deg,var(--uc),
  color-mix(in oklab,var(--uc) 58%,#141a3c))`, white text). Shows unit name +
  subject, taught count + bar, Ends date, pace pill, Share ↗, ⋯ (Start-date /
  Duplicate / Archive), **Insights**, expand, close.
- **Tabs:** `Unit Plan · Lessons · Assessments · Refine · Insights`.
- **Left rail (`.ph-wsrail`)** — **defaults to Units grouped by subject**
  (`.wsr-units` → `.wsr-sgrp` subject headers + `.wsr-unit` rows, current unit
  highlighted in its subject color). A **Units | Lessons** switch (`.wsrview`,
  persisted `__phTLMem.wsRailView`) flips to the lesson list. Lesson mode keeps the
  This-unit | All-units scope, status/subject/unit filters, drag-to-reorder,
  multi-select **bulk bar** (Bump · mark taught · Flow · Delete), and a collapse
  (`‹`/`›`, numbers-only) toggle.
- **Lessons tab** — one lesson editor: title, objective, date (opens a date
  popover), duration, flow template + sequence chips, and collapsible sections
  (Standards, Resources, Assessment, Differentiation, Notes, Builds toward,
  **Framework fields** per the unit's framework, Teacher preparation). Each section
  card carries the **subject-color left stripe** (`.wsec{border-left:3px solid
  color-mix(in srgb,var(--uc) 62%,transparent)}`). A ⋯ menu does Move-to-date /
  Bump / Duplicate / Move-to-unit / Send-to-Unscheduled / Mark taught / Delete.
- **Unit Plan → Overview** — recolored (see §3): progress **ring**, 6 semantic
  **stat cards**, Summary, **Big ideas · Essential questions** (multiple, add/remove),
  **Unit vocabulary** (chips), **Instructional sequence** arc with per-phase checks.
  Sub-nav: Overview · Stage 1/2/3 (Desired Results / Evidence / Learning Plan) ·
  Framework designer. K/U/D labels adapt to the unit's framework.
- **Assessments tab** — arc strip (green square = formative, purple diamond =
  summative) + formative/summative tables; row click opens an inline detail card
  (purpose, notes, prep status, cross-link to the lesson).
- **Insights tab** — 5 summary cards + actionable issues (missed, pacing risk,
  missing differentiation, assessments in progress, missing resources) each with a
  fix action + dismiss; "Great progress!" when clean.
- **Right context drawer** — Context (essential question + alignment ticks
  Objective→Standard→Evidence + prev/next lesson + related resources) · Resources ·
  Standards · AI Help; Assessments/Insights swap in their own drawer tabs.

### 2. Shared Composer — one way to add a note/resource, app-wide
`source-planning-hub/ph-composer.jsx` + **`composer.css`** (self-contained light
palette so it renders identically in either React tree). Mounted once per tree
(`window.PHComposer`), opened via **`window.openComposer(opts)`**.
- A **rich note that can hold attachments**; each attachment becomes its **own
  stacked resource**. Centered modal over a dimmed page.
- Tool rail (Upload · Link · Image URL · Video/YouTube · Draw · All-tools picker),
  full rich-text toolbar (bold/italic/underline, **multi-color highlight**, text
  color, size H1/H2/body, lists, checklist, link, font), background-color chip,
  file-location + wall-column targeting, edit mode (prefill).
- **Shared resource action menu** — `window.PHResMenu` / `window.openResMenu({res,
  x,y,edit,remove})`: Open · Open in new tab · Copy link · Edit · Remove. Used by
  workspace resource pills and the planbook chips.
- **Resource pills** are color-coded by type (`DS.RESTYPES`) with a hover/click
  thumbnail preview. In the home planbook editor, `.pb-rchip` chips carry
  `data-type/name/url/note` and open this same menu (see `source-home/planbook-edit.jsx`).

### 3. Vibrant workspace recolor (subject + semantic palette)
Color now **organizes** the planner (all in `ph-v2.css`, driven by `--uc` = the
unit's subject color set on `.ph-ws`):
- Subject-gradient **header**; active **tab** (`.ph-wstabs button.on`) and selected
  **rail** row tinted with `--uc`.
- **Progress ring** — `conic-gradient(var(--uc) calc(var(--p)*1%),var(--phx-chip))`.
- **Stat cards** — each a distinct semantic tint (card bg = `color-mix(in srgb,
  <color> 15%, var(--phx-panel,#fff))`, matching number + icon-tile color). Mapping:
  taught `--brand-500/600`, remaining `--done`, standards `#8352C7`, gaps `--warn`
  (→ `--danger` when >0), resources `#5f79c8`, pace `--done` (→ `--danger` when
  behind). *Specificity note:* the semantic rules are written `.wsstrip .wsum.st-*`
  (0-3-0) to beat the Insights-tab `.wsum b` rule — keep that if you port the CSS.
- **Section headers** colored (Big ideas purple, Vocabulary green); **instructional
  arc** circles use `--uc` (filled when done, tinted upcoming).
- Follows the active frame (tints mix into theme tokens, legible on Glass/Bright/Pastel).

### 4. Pop-in overlay — the planner opens over Year/Day/Week (no navigation)
`source-home/app.jsx`. Clicking a unit in Year/Day/Week no longer routes to the Plan
tab — it opens the planner as a **modal overlay** (`.unitpop-scrim`) hosting the hub
iframe in **bare mode** (`?embed=1&bare=1` → hub renders only the workspace, no
timeline). Stays on the current view; × or the workspace close returns.

### 5. Cross-tree bridge (home ⇄ embedded hub)
`postMessage` protocol between the two React trees:
- `cc-scope` (parent→hub): personal/team.
- `cc-hub-ready` (hub→parent): hub's `ph-app` announces it mounted.
- `cc-open-unit {name,sid,lid}` (parent→hub): open a unit's workspace; the hub
  matches by name, else first unit of that subject.
- `cc-close-unitpop` (hub→parent): bare-mode close → parent dismisses the overlay.
- `cc-open-plan` / `cc-open-post` (window events, home): open a lesson in Plan/Post.

**Known data gap:** the home Year uses `source-home/data.js` `ROADMAP` (all 8
subjects); the hub planner uses `plan_workbench/pw-data.js` `PW.build()` (only
math/reading/writing/explorers, 11 units). So Year clicks on UFLI/grammar/spelling/
SEL units have no exact hub unit to open. **Unifying these two datasets onto one
source is the top open task** for a faithful build (in production both read the same
DB, so this is purely a mock-data artifact).

### 6. Earlier deltas in this cycle (already in the live files)
- **Compact top bar** for Teach/Plan/Post (`source-home/compact-bar.css`) — slim
  one-row bar, centered nav, ⋯ overflow, idle **auto-hide** (returns on mouse-to-top;
  tablet gets a visible peek pill + swipe-down; disabled < 640px), "Compact top bar"
  and brand-mode tweaks.
- **Pastel frame** — a third frame beside Glass and Bright (`source-home/pastel-frame.css`),
  Common-Planner styling, Source Sans 3.
- **Planning drawer** under the timeline (`source-planning-hub/ph-drawer.jsx`):
  **Unit Library** (cards → open plan / locate) · **Lesson Library** (every lesson,
  group/filter/sort, Rows|Cards, +New, drag-to-timeline, right-click/⋯ actions) ·
  **Needs Attention** (issues + dateless drafts as an expandable summary).
- **Timeline** (`source-planning-hub/ph-units.jsx`): unit bands + lesson dots, drag
  with ripple + easing, anchor-stacking on drop, **paint-a-new-unit** on empty lanes,
  **+ New subject** (custom subjects persisted to `localStorage cc_subjects`), zoom
  slider, scroll arrows, hover lesson preview.
- Fixes: Year-view crash guard (subject with no `ROADMAP` entry), blank-screen
  "wedge" fixes (accent-cycle, canvas-refit loop, compact-bar layout animation),
  embedded-hub self-heal.

---

## Current file map

```
design_handoff_v2_2026-07-20/
├── README.md                       ← this file (the delta)
├── V2 Site Design.html             ← entry wrapper (iframes the home app)
├── composer.css                    ← shared Composer styles (both trees)
├── source-home/                    ← the main app (Day/Week/Year/Post/Teach + shell)
│   ├── New v2 Site Design.html         ← home entry; loads the JSX below
│   ├── app.jsx                         ← shell: nav, compact bar, view routing, Plan iframe, unit-pop overlay, bridge
│   ├── views-a/-b/-c.jsx · views*.css  ← Day/Week/Year in the 3 frames
│   ├── planbook-edit.jsx · .css        ← Week/Day edit-mode lesson editor + .pb-rchip chips
│   ├── teach.jsx · teach-plus.css      ← Teach board
│   ├── compact-bar.css · home.css · pastel-frame.css · colors_and_type.css …
│   └── data.js                         ← mock curriculum + ROADMAP (window.DS)
├── source-planning-hub/            ← the embedded planner (the "Plan" tab)
│   ├── V2 Planning Hub.html             ← hub entry (?embed=1[&bare=1])
│   ├── ph-app.jsx                       ← hub app: state, history, bridge listeners, bare mode
│   ├── ph-workspace.jsx                 ← THE unified unit/lesson workspace
│   ├── ph-units.jsx                     ← timeline (bands/dots/drag/paint) + Refine table
│   ├── ph-lessons.jsx                   ← Lessons lens (list, grouped)
│   ├── ph-drawer.jsx                    ← Unit/Lesson Library · Needs Attention
│   ├── ph-composer.jsx                  ← shared Composer + resource menu
│   ├── ph-shell.jsx · ph-*.jsx          ← hub chrome, settings, frameworks, design
│   └── ph-v2.css · ph.css               ← hub + workspace styles
└── plan_workbench/pw-data.js       ← the hub's planner data (PW.build)
```

## New design tokens / values introduced this cycle
- `--uc` — per-render **unit subject color**, set inline on `.ph-ws`; everything in
  the planner keys off it.
- Semantic stat colors: taught `--brand-500`/`--brand-600`, remaining/pace `--done`,
  standards `#8352C7`, gaps/warn `--warn`, danger `--danger`, resources `#5f79c8`.
- Composer palette (in `composer.css`): `--cbrand #4f6bed`, `--cdanger #d1435b`,
  plus its own `--phx-*` light surfaces so it's tree-independent.
- Modal geometry: modal `min(1080px,96vw) × min(88vh,880px)`, radius `20px`; full
  mode `min(88vh,940px)`, radius `var(--r-lg)`.

## Still true from the 2026-07-02 handoff (unchanged)
Tokens, the three frames + six-axis appearance system, the legibility contract
(tone not theme), the forking Team/Personal model, "no sharp corners", tokens-only,
one-surface-one-job, phone/tablet/desktop + touch, and the Phase-1A-mock / Phase-1B-
Supabase phasing. **Those documents remain authoritative — this package does not
restate them.**
