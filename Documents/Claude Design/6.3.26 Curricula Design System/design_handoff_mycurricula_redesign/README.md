# Handoff: mycurricula.app — v1.3 website & product redesign

## Overview
This package is the developer handoff for redesigning **mycurricula.app** (a teacher curriculum
planner — "for teachers, by teachers") onto the **v1.3 brand** design language. It contains the full
design system (tokens, style guide, foundations), two UI kits (the teacher **planner** and the public
**marketing** site), and two interactive **Year Overview** design directions to choose from.

The brand idea in one line: **dashboard clarity with landing-page warmth, where color is the
navigation** — every subject owns a hue that cascades to its units, weeks and lessons; status
(done / in-progress / not-started / needs-review) is a separate, more-saturated layer.

## About the design files
The files in this bundle are **design references created in HTML/CSS/JSX** — prototypes that show the
intended look and behavior. They are **not production code to copy directly.** Your task is to
**recreate these designs in the target codebase's environment** using its established patterns and
libraries.

> The shipping app is **Next.js + React + Tailwind + Supabase** (`github.com/timjmills/mycurricula.app`).
> Recreate these designs there using React components + the project's conventions. The repo's *current*
> styling is **not yet v1.3** — these files are the target. Take **structure & vocabulary** from the
> existing app and **look & feel** from this bundle.

The HTML prototypes use vanilla JS / inline React only to make them clickable; do **not** port that
logic — reimplement with the app's real components, state, and data layer.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, radii, shadows, and interactions are all
intentional. Recreate the UI pixel-faithfully using the codebase's libraries. Exact values are in
`colors_and_type.css` and summarized under **Design Tokens** below; the browseable spec is
`Design System.html`.

---

## Screens / Views

### 1 · Marketing landing page  — `ui_kits/marketing/index.html`
- **Purpose:** public site; convert teachers to sign up.
- **Layout:** single column, max content ~1100px centered, generous vertical rhythm (section padding
  ~64px). Sticky translucent nav (blur). Sections in order: Nav → Hero → Product peek → Trust strip →
  Features (4-col) → How it works (4-col steps) → Teach-mode band (2-col) → Testimonial → Pricing
  (3-col) → CTA band → Footer.
- **Key components:**
  - **Hero:** honey eyebrow pill; H1 in Bricolage 800 ~60px; lead 19px; two CTAs (honey primary pill +
    secondary). Background is the hero-mesh (peach→pink→violet→mint radial blend) over cream.
  - **Product peek:** window-chrome card (3 traffic dots) showing the Year Overview cascade — three
    subject lanes (Reading blue, Math gold, Science green) each with a tinted header + unit chips.
  - **Feature tiles:** white cards, 24px radius, soft shadow, a colored icon tile, H3 + body.
  - **Pricing:** Teacher (free) · Team (featured, honey tag, scaled 1.02) · School. Check-bulleted lists.
  - **CTA band:** dark `#1C1B2E` rounded panel with honey + indigo corner glows.
- **Responsive:** tiles/steps/plans collapse to 2-col then 1-col; nav links hide < 720px.

### 2 · Planner product (teacher app) — `ui_kits/planner/index.html`
Interactive recreation of the seven core surfaces. Shell = optional team banner → sticky top bar
(brand, week nav, view tabs, Personal/Team segmented, avatar) → 62px icon rail + scrolling canvas.
- **Weekly** (gold standard): 5-column day grid of subject-colored **lesson cards** (grid + list modes).
- **Daily:** one teaching day as a vertical list + a side rail (reminders, progress metrics).
- **Year:** subject **lanes** of unit chips — the cascade across the year.
- **Subject:** a unit drilled into weeks → lessons (3-column cascade).
- **Catch-up:** rows of slipped lessons with reschedule / skip / merge.
- **Settings:** appearance (card style, subject palette, toggles).
- **Teach:** projector board with widgets (timer, noise meter, name picker, now & next, objective).
- **Lesson card anatomy:** white surface, **4px left stripe** in the subject solid color, "Subject ·
  time" meta row (subject dot + name + right-aligned time), title (Jakarta 700 ~13.5px), em-dash
  subtitle, a standard-code chip, and a right-aligned **status ring**. A **dashed** left stripe = the
  lesson was modified from the team plan.

### 3 · Year Overview — TWO directions (pick one or ship both)

#### A · Timeline — `prototypes/Year Overview - Timeline (Curriculy).html`
- Horizontal, calendar-style. Each **subject is a row**; its **units** span the school year on a
  month axis (Aug→Jun) with a vertical "today" line.
- **Interaction:** click a unit → its breakdown **expands inline directly under that row** (later
  subjects push down), with a **downward caret** (subject color) connecting the unit to its detail.
  Click again (or the row chevron / detail collapse) to close. Only one unit open at a time.
- **Progressive selection — nothing auto-selected:** open unit → weeks appear (none highlighted) +
  hint → pick a week → days appear (none highlighted) → pick a day → **lesson drawer** slides in from
  the right.
- **Lesson drawer (right):** subject-tinted; day/date, lesson title (Bricolage), subject/duration/
  status badges, **Lesson overview**, **Activities** (numbered, timed), **Objectives** (checked),
  **Standards**, **Resources**, and a **Mark complete / Edit** footer. Closes via X, scrim, or Esc.
- **Selected states** fill with the subject **tint** + accent border (unit, week, and day cards) —
  white/hairline by default.

#### B · Workspace — `prototypes/Year Overview - Workspace (EduPlan).html`
- Multi-panel. **Left rail** (icon nav) · **Subjects panel** (all 8 subjects, each its own color, with
  an inline unit list) · **Center** (stacked: Year Overview bar → Subject Roadmap → Week Breakdown →
  Daily Lessons) · **Right lesson viewer** (docked).
- **Per-subject cascade:** selecting a subject recolors the roadmap, weeks, and days to that subject's
  hue.
- **Right lesson viewer:** tabs — Overview / Standards / Resources / **Assessments** / Progress — plus
  unit-level assessments (Diagnostic / Mid-Unit Quiz / Performance Task / Exit Tickets with status).
- **Responsive (one at a time):** docked on desktop; ≤1240px the lesson viewer becomes a **right
  slide-over** (opens on day-select); ≤1000px the subjects panel becomes a **left slide-over** (top-bar
  toggle); ≤720px the left rail collapses to icons.

---

## Interactions & behavior
- **Cascade theming:** a container sets `--c` (subject *bright* accent) and `--ct` (subject *tint*);
  chips/cards inherit them. Re-theme a whole lane/column in one line. Also `--ck` (ink on tint),
  `--cs` (solid).
- **Hover:** small lift (`translateY(-2px)`) + deeper shadow; links → brand-600.
- **Press:** settle down 1px; no color flash on buttons.
- **Status ring:** done = filled green check; in-progress = ringed dot (brand); not-started = empty ring.
- **Drawers / slide-overs:** in production, animate with a ~0.26s `cubic-bezier(.2,.7,.3,1)` transform.
  *(The bundled HTML opens them instantly because the preview tool freezes CSS transitions — re-add the
  transition when you build.)*
- **Reduced motion:** gate entrance animations behind `prefers-reduced-motion: no-preference`.

## State management
Reimplement against the app's real data layer; the prototypes mock everything. State the surfaces need:
- **Selection:** `selectedSubject`, `openUnit`, `selectedWeek`, `selectedDay` (Timeline keeps these
  null until chosen; Workspace defaults to a subject/unit/week/day).
- **Lesson drawer/panel:** `lessonOpen` (+ which day), tab (`Overview|Standards|Resources|Assessments|Progress`).
- **View routing:** Weekly/Daily/Year/Subject/Catch-up/Settings/Teach.
- **Mode toggles:** Personal vs. Team plan; grid vs. list; week navigation; undo/redo.
- **Responsive panel state (Workspace):** `subjectsPanelOpen`, `lessonPanelOpen` (slide-overs under breakpoints).
- **Data:** subjects (id, name, color slot, grade), units (name, dates, status, progress), weeks,
  daily lessons (title, objectives, standards, resources, status), assessments, catch-up items.

## Design tokens
Full set in **`colors_and_type.css`** (CSS custom properties). Summary:
- **Brand / Indigo:** primary `#3B6CF6` (500), ramp 50→700 — actions, links, focus, in-progress.
- **Accent / Honey:** `#F4B740` (400), ramp 50→700 — marketing CTA, highlights, needs-review, the
  `.app` in the wordmark.
- **Subjects (1–15):** muted scale; each has `--subj-N` (solid), `--subj-N-tint`, `--subj-N-ink`,
  `--subj-N-bright`. Aliases: `--math` (1), `--reading` (10), `--science` (13), `--social` (7). Real
  app subjects (Grade 5): Reading, Math, Writing, Grammar, Spelling, UFLI, Explorers, SEL.
- **Status:** done `#16A06B`, in-progress `#3B6CF6`, idle `#B6B5C6`, warn/needs-review `#E9A526`,
  danger `#EF5A5A` (each with a `-tint`).
- **Neutrals:** canvas `#FCFAF6`, surface `#FFFFFF`, surface-warm `#FFFDF8`, ink `#1C1B2E`, body
  `#57566B`, muted `#908FA3`, border `#ECEAE3`, hairline `#F4F2EC`.
- **Type:** display/headings **Bricolage Grotesque** (700/800); UI/body/data **Plus Jakarta Sans**
  (400–700). Scale: display 44 / H1 28 / H2 22 / H3 18 / body-L 16 / body 14 / small 13 / label 11
  (uppercase, +0.09em). Delivered via Google Fonts.
- **Space:** 4px scale (`--s1`..`--s16` = 4,8,12,16,20,24,32,40,48,64).
- **Radius:** sm 10 / md 14 / lg 18 / xl 24 / 2xl 32 / pill 999. Every button/badge/field is a pill.
- **Elevation:** `--sh-xs/sm/md/lg` (soft, cool); `--sh-brand` / `--sh-honey` color glows for primary
  buttons only.
- **Gradients:** `--grad-hero`, `--grad-honey`, `--grad-brand`, `--grad-dawn`, `--grad-mint` — reserve
  for hero/CTA/onboarding/avatars, not ordinary cards.

## Assets
- `assets/logo-glyph.svg` — the brand **open-book / two-page** glyph (indigo + honey).
- `assets/logo-glyph-on-honey.svg` — glyph for use on a honey tile (white + dark).
- **Wordmark:** "mycurricula" + ".app" (the `.app` in honey `#C9871A`), glyph in a honey-gradient
  rounded tile. See the brand block in `Design System.html`.
- **Icons:** **Lucide-style** line icons (~2px stroke, round caps, 24×24), delivered inline. The
  prototypes ship a small inline set; use the real **Lucide** package in production. No emoji.
- **Fonts:** Google Fonts — Bricolage Grotesque + Plus Jakarta Sans.

## Screenshots
Reference renders are in `screenshots/`:
- `01-design-system.png` — the style-guide page
- `02-marketing-landing.png` — the landing page hero
- `03-planner-weekly.png` — the planner Weekly grid
- `04-prototype-A-timeline.png` — Year Overview A (Timeline) with a unit expanded + lesson drawer
- `05-prototype-B-workspace.png` — Year Overview B (Workspace), multi-panel

## Files in this bundle
```
Design System.html        ← single-page style guide (browse this first)
design-system.css         ← styles for the style guide
colors_and_type.css       ← ALL design tokens + type roles/classes (the source of truth)
README.md (design)        ← full written spec: content fundamentals, visual foundations, iconography
SKILL.md                  ← brand brief / agent skill manifest
assets/                   ← brand glyph SVGs
ui_kits/
  planner/                ← teacher app recreation (index.html + JSX components + README)
  marketing/              ← landing page (index.html + marketing.css + README)
prototypes/               ← Year Overview directions A (Timeline) + B (Workspace) + README
```
Open `Design System.html` for the visual spec, read `README.md` (design) for the written rules, then
build from `colors_and_type.css`.
