# mycurricula.app — Project Guide

This file is the source of truth for **what this project is, how we build it, and the
rules every contributor (human or agent) must follow**. Read it before touching code.

> **Companion file — read this too:** `BUILD_STANDARD.md` at the repo root is the
> visual, structural, and responsive contract — what every page must look and behave
> like. The Weekly view (`/weekly`) is the canonical reference. CLAUDE.md is the
> _policy_ (rules, phasing, what not to do); BUILD*STANDARD.md is the \_content*
> (color recipe, type hierarchy, spacing scale, canonical primitives, new-page
> prompt template). Read both at the start of every build session.

---

## 1. What this app is

**`mycurricula.app`** is a Learning Management System (LMS) for school teaching teams.
Its first deployment is a Grade 5 team (4–6 teachers) at a school in Qatar, but the
product is built for any school. It consolidates five fragmented planning surfaces —
Padlet resource boards, a week-by-week lesson doc, a weekly-focus doc, a CCSS standards
doc, and per-teacher personal copies — into **one filterable, editable curriculum
operating system**.

### Current build status (2026-05-27)

Phase 1A is **shipped to a live beta-ready prototype** at the Cloudflare custom domain
`mycurricula.app`. Every primary view renders against `lib/mock/` fixtures; the
Supabase backend is the Phase 1B wave. The honest map:

| Route / feature | Status |
| --- | --- |
| `/weekly` (Grid + List) | Shipped Phase 1A |
| `/daily` (Day pane + lesson detail + IconRail) | Shipped Phase 1A |
| `/year` (Roadmap + Progression + Print) | Shipped Phase 1A |
| `/subject` (Curriculum view, per-subject unit pages) | Shipped Phase 1A |
| `/schedule` (timetable) | Shipped as deep-link + side-panel via GlobalRail (Phase 1A complete; rotation cycles deferred to Phase 1B) |
| `/catch-up` (lessons-not-covered triage) | Shipped Phase 1A |
| `/settings/*` (unified hub: curriculum, school week, school months, academic year, holidays, appearance, lesson templates, catch-up rules) | Shipped Phase 1A |
| Master/Personal forking model | Visual + state shipped; persistence to Supabase is Phase 1B |
| Onboarding wizard | Shipped Phase 1A (`Documents/Claude Design/.../onboarding_wizard` is the spec) |
| Cloudflare deploy (custom domain `mycurricula.app`) | Live |
| Claude auth bypass (Bearer + URL + cookie) | Live — all three flows working |
| Supabase backend (auth + DB rows + realtime) | **Not yet wired** — Phase 1B gate. Mock data in `lib/mock/` drives every view today. |

Phase 1B is the **Supabase + multi-school config wave**: wiring the backend so the
forking model persists, holidays render on weekly/daily, schedule rotation cycles work
end-to-end, and unit-import lands. Phase 2+ brings annotation, admin, and AI.

- **Users:** teachers only. No student, parent, or admin-facing product in scope.
- **Core job:** "What are we teaching this week, and where am I in the plan?"
- **Multi-grade ready by design:** launches Grade 5-only, but the data model and UI
  must never assume a single grade. Build grade-scoping in from day one.
- **The school week is configurable.** The app must support any school's week
  configuration — which weekdays the school runs and how many. During initial setup the
  teacher/school picks the school week: a **preset** (Sunday–Thursday, Monday–Friday) or
  a **custom** set of weekdays (e.g. a 3-day week). **Never hard-code the weekday set** —
  every calendar surface (Weekly grid columns, Daily day list, Schedule, etc.) derives
  its days from this configuration. The first beta school runs Sunday–Thursday with an
  optional **Ramadan timetable** mode and may need MOEHE-compliant exports — that is
  per-school configuration, not a built-in assumption.
- **Schedules are customizable, including rotating cycles.** The daily timetable — the
  time blocks defining when each subject/period meets — is configured per school and per
  teacher, never fixed. It must support **rotating schedule patterns**: e.g. an **A/B
  schedule** that alternates on a cycle other than the calendar week (every 4
  instructional days, a 6-day rotation, etc.). Schedules can be edited and reset. Never
  assume a single fixed daily schedule or a weekly-only cycle.

It is **not** a gradebook, an attendance tracker, a student portal, or a
marketplace. See §6 for the full out-of-scope list.

---

## 2. The approach — the one idea that defines the product

**Git-style forking applied to curriculum.** There is one **Master** plan (also called
"Core Curriculum" in newer design copy). Each teacher sees their **Personal** copy of a
lesson where one exists, and the Master as fallback where it doesn't.

- **Lazy forking:** a personal copy is created automatically the first time a teacher
  edits a lesson in Personal mode. There is no manual "make a copy" step.
- **Friction where it matters:** editing Personal is invisible and automatic. Editing
  Master is intentional and explicit — gated by a top-bar **Personal | Master** toggle
  and a flashing-then-persistent red banner ("Heads up — changes here affect the whole
  team"). No confirm dialogs.
- **Completion is independent of forking.** Marking a lesson done never forks it.
- **Three-tier visual differentiation** tells a teacher at a glance whose version a
  card is:
  - _Unedited from Master_ → solid 4px subject-color left stripe.
  - _Personally modified (content changed)_ → **dashed** stripe + "Modified" pill.
  - _Personally moved (day/order changed)_ → solid stripe + move-arrow icon (↔ / ⤴).
  - _Both_ → all three compose.

This forking model is the product's competitive differentiator. It will surface in
nearly every feature — respect it everywhere.

### Core product principles

1. **Single source of truth.** One Master plan; teachers fork as needed.
2. **Personal-first viewing.** A teacher always sees their version where one exists.
3. **Each UI surface has one clear job.** Toggles change a surface's _content_, never
   its purpose. Filtering/management live in dedicated panels, not primary views.
4. **Filter everywhere.** Every view filters by subject, unit, time period, completion
   status, and standards.
5. **Color carries meaning, never decoration.** Every colored element is information.
6. **Print- and paper-friendly.** Views have clean print templates.
7. **Reusable year-over-year.** Plans archive and roll forward.

---

## 3. Tech stack & architecture

| Layer         | Choice                                                             |
| ------------- | ------------------------------------------------------------------ |
| Framework     | Next.js (App Router) + React 19 + TypeScript                       |
| Styling       | Tailwind (layout/spacing only) + CSS custom-property design tokens |
| Data (later)  | Supabase (Postgres + Auth + Realtime), row-level security          |
| Auth (later)  | Supabase Auth — Google SSO, restricted to the school domain        |
| Files (later) | Cloudflare R2 for resources; Supabase Storage for exports          |
| PDF / Excel   | `@react-pdf/renderer` / SheetJS, client-side                       |
| Hosting       | Cloudflare Pages                                                   |

**Current state of the repo:** a **frontend-complete Phase 1A prototype** deployed to
Cloudflare at `mycurricula.app`. See §1's status table for what is shipped vs.
mock-driven. Every view today reads from `lib/mock/`; the Supabase backend lands in
Phase 1B.

### Folder conventions

```
app/            Next.js routes (App Router). tokens.css + globals.css live here.
components/<x>/ One folder per component family, with a barrel index.ts.
lib/            theme, palette, types, and lib/mock/ fixtures.
lib/admin/queries.ts   Convention: all aggregation/admin queries go here (even pre-UI).
styles/         Reserved for additional stylesheets.
Documents/      Planning docs + design handoff — NOT part of the app, never imported.
```

### Naming

- Components: `PascalCase.tsx`. Hooks: `useThing.ts`. Utilities: `camelCase.ts`.
- DB columns (when the backend lands): `snake_case`.
- Each component folder exposes its public surface through `index.ts`; consumers import
  from the folder (`@/components/lesson-card`), never a deep file.
- Path aliases: `@/components/*`, `@/lib/*`, `@/app/*`.

---

## 4. Design system rules

The visual system has two independent axes, both set as `<html>` data attributes by
`lib/theme.tsx`:

- `data-style` ∈ `quiet | calm | vivid` — card treatment. **The app defaults to
  `vivid`**; `quiet` and `calm` remain available as teacher preferences.
- `data-palette` ∈ `normal | highlight` — subject-color saturation. **Defaults to
  `highlight`.**

**Hard rules:**

- **Tailwind supplies layout and spacing utilities only.** Do **not** add theme colors,
  fonts, or semantic spacing to `tailwind.config.ts`.
- **All color, type, and spacing tokens live in `app/tokens.css`** as CSS custom
  properties. Reference them with `var(--token)`. Never hard-code a hex color or px
  font size in a component.
- Subject colors come through the `.cp-subj.<subject>` classes (driven by the palette
  bridge in `lib/palette.tsx`) or the `useSubjectColor(subjectId)` hook. Never invent a
  subject color.
- The 8 subjects (`math, reading, writing, grammar, spelling, ufli, explorers, sel`)
  and their swatch mapping are **locked team-wide**. Style + palette are per-teacher
  preference; the subject→color mapping is not.
- Respect `prefers-reduced-motion`: the master-mode banner appears solid (no flash) and
  urgent notes never pulse under reduced motion.
- Accessibility: WCAG AA contrast minimum, full keyboard navigation, ≥44px touch
  targets on primary actions.
- Motion is allowed where it clarifies (card expand ~200ms, slide-outs ~250ms,
  drag ghosting). No bounce, parallax, or confetti.
- **Responsive is a hard requirement, not a polish pass.** Every page, view, and
  feature must lay out and remain usable at **three viewport tiers**:
  - **Phone** — 360–480px
  - **Tablet** — 600–900px
  - **Desktop** — 1024–1920px

  No page-level horizontal scroll at any tier; every primary control reachable
  without a horizontal scroll or off-screen overflow; touch targets ≥44px on
  phone and tablet; sticky chrome must not eat more than ~30% of the viewport
  height on phone. Internal element scroll (e.g. a wide grid inside a
  scrollable container) is acceptable; the document itself must not scroll
  sideways. Work is only "done" once it has been verified at all three tiers
  (DevTools device emulation is fine; document in the PR/commit message which
  widths were checked).
- **Every interactive control and every named panel must have an onboarding
  explanation.** The intent is first-time-teacher discoverability — a new
  teacher should be able to learn the app by hovering or long-pressing things.
  - **Surface:** desktop = tooltip on hover **and** keyboard focus; touch
    (phone/tablet) = long-press OR a native `title=` attribute the platform
    surfaces on touch-hold OR a visible `?` affordance for ambiguous controls.
  - **Scope:** every `<Button>`, every switch / toggle / radio, every named
    panel (sticky rails, drawers, modals), every icon-only control, every
    disabled control (the tooltip explains _why_ it's disabled), every
    settings input. Plain text buttons whose label IS the explanation
    ("Save", "Cancel") still get a tooltip — but the tooltip _expands_
    on the verb to teach the action ("Save your edits to this lesson",
    not just "Save").
  - **Voice:** tell a first-time teacher what the control _accomplishes_, in
    the surrounding context. Not "Toggle X" but "Switch to editing the
    team's curriculum (changes affect everyone)".
  - **Implementation:** the `components/ui/Button` primitive carries a
    `tooltip?: string` prop that wraps the rendered button in `<Tooltip>` AND
    mirrors to native `title=` for the disabled-button browser quirk. Other
    interactive primitives (ToggleGroup, etc.) accept a similar prop or wrap
    each option in a Tooltip. Panels carry a `title` attribute on their root
    so touch users get an explanation by holding the header.
  - **Reduced-motion + accessibility:** tooltip fade respects
    `prefers-reduced-motion`; tooltip text is linked to the trigger via
    `aria-describedby` so screen-reader users hear it.

---

## 5. How we work — DO

- **Read the spec before building a screen.** `Documents/Project Files/5.16.26
planning_document.md` has a screen-by-screen section (§5) and the data model (§4).
  The design handoff under `Documents/Claude Design/` has pixel-level artboards
  (`.jsx` files) for each surface.
- **Recreate designs faithfully, in idiomatic React.** Match the artboards' visual
  output — dimensions, colors, spacing — but write clean TypeScript/React. Do **not**
  copy the prototype's HTML/CSS structure verbatim.
- **Reuse the existing component vocabulary.** New views consume `LessonCard`, the
  theme/palette hooks, the mock data, and the token system. Match the comment density,
  naming, and idioms of the surrounding code.
- **Keep grade-scoping in every data shape and query**, even while only Grade 5 is
  active.
- **Keep each surface single-purpose.** If a feature is filtering or management, it
  belongs in a panel or Settings — not bolted onto a primary view.
- **Build the data shapes for infrastructure (audit log, coverage snapshots, roles)
  when the backend lands**, even if there is no UI for them yet.
- **Run `npm run lint` and `npm run format:check`** before considering work done.
- **Verify the responsive contract.** Before declaring a screen done, eyeball it at
  ~400px, ~768px, and ~1280px in DevTools device emulation. Confirm: no
  document-level horizontal scroll, all primary controls reachable, touch
  targets ≥44px on phone/tablet, chrome doesn't crowd the content on phone.
  See §4 for the full responsive rule.
- **Track multi-step work with the task tools** and, for parallelizable work, split it
  across agents with clear, non-overlapping file ownership.

## 6. How we work — DO NOT

- **Do not build out of phase.** Phase 1A is the late-August beta gate; everything else
  waits. See the roadmap (§8 of the planning doc) and the status table in §1 for what
  is already shipped. In particular, do **not** start:
  student/parent/admin-facing features, gradebook/attendance, a marketplace, file
  hosting/annotation (Phase 1B+), AI features (Phase 3+),
  LMS/SIS integration, or multi-language UI.
- **Do not add theme colors or design tokens to `tailwind.config.ts`.** Tokens live in
  `tokens.css`.
- **Do not hard-code colors, fonts, or subject palettes.** Use tokens and the palette
  system.
- **Do not import anything from `Documents/`.** It is reference material only.
- **Do not break the forking model.** Don't make completion fork a lesson; don't let
  Personal edits silently write to Master; don't let Master be editable without the
  explicit toggle + banner.
- **Do not add confirm dialogs for entering Master mode** — the flashing/persistent
  banner is the deliberate safety mechanism.
- **Do not assume a single grade level** anywhere in data or queries.
- **Do not hard-code the school week** (the set of weekdays, or a 5-day assumption). It
  is chosen at setup; every calendar surface derives its day columns from it. Today's
  mock fixtures use a Sun–Thu week — treat that as sample data, not a constraint.
- **Do not hard-code the daily schedule or assume a weekly cycle.** Timetables are
  customizable and may rotate on A/B (or longer) cycles independent of the week.
- **Do not introduce new dependencies** without a clear need; prefer the existing
  stack. No component/UI kits — components are bespoke against the token system.
- **Do not commit or push** unless explicitly asked. Branch off `main` first if you do.

---

## 7. Reference documents

All under `Documents/` (reference only — never imported by the app):

- `Project Files/5.16.26 planning_document.md` — the master spec. §3 IA, §4 data model,
  §5 screen-by-screen, §6 design system, §7 tech architecture, §8 phased roadmap,
  §9 acceptance criteria, §10 open questions.
- `Project Files/5.16.26 conversation_record.md` — the decision history behind the spec.
- `Project Files/5.16.26 MyCurricula_Business_Plan_Addendum.md` — positioning, pricing.
- `Project Files/5.16.26 *Competetor Anaylisis*` + `5.12.26 *Planbook*` — competitive
  context; selectively absorbed features.
- `Claude Design/5.16.26 Build A Curriculum-handoff/` — the design handoff bundle.
  `project/*.jsx` are per-surface artboards; `project/tokens.css` is the token source;
  `project/README.md` explains the handoff.

**Operational docs** (under `docs/`, checked into the repo, not reference-only):

- `docs/5.24.26 claude-access.md` — how AI assistants (Claude Code / Chat / Co-work /
  Code Cloud) authenticate to the deployed app via the token-gated bypass. Includes
  the three entry points, audit-log queries, Cloudflare secret-rotation procedure,
  and the security checklist. Read this before changing auth, middleware, or the
  Supabase service-role surface.
- `docs/claude-bypass.sql` — DDL for `public.claude_access_log` (the bypass audit
  table). Run once in the Supabase SQL editor.

**Phasing reminder:** Phase 1A shipped — Weekly/Daily/Subject/Year/Schedule/Catch-up
views, Master/Personal toggle, Simple/Task/Advanced view modes, standards tagging,
daily notes, basic print/export, Vivid theme as default, unified Settings hub, and
the onboarding wizard (see §1 status table for the full list). Phase 1B is the
**Supabase backend wave** — wiring persistence so the forking model writes through,
holidays render, schedule rotation cycles work end-to-end, unit-import lands. Phase 2
brings full forking semantics + year rollover. Phase 3+ brings annotation, admin, and
AI. When in doubt about whether to build something, check the §1 table and the
roadmap, and ask.

---

## 8. Canonical names, route map, and audit-doc disclaimer

This section disambiguates the doc landscape so a new agent or contributor doesn't
chase contradictions.

### Authoritative MDs (the only docs that bind current behavior)

- **`CLAUDE.md`** — policy, phasing, product principles, and the rules every
  contributor must follow. This file.
- **`BUILD_STANDARD.md`** — the visual, structural, and responsive contract. The
  only authoritative visual contract. The older
  `Documents/Project Files/5.24.26 website_build_standard_claude_codex.md` was
  removed in this consolidation as it overlapped with `BUILD_STANDARD.md`.
- **`Documents/Project Files/5.16.26 planning_document.md`** — the master spec
  (data model, screen-by-screen, roadmap, acceptance criteria).

Everything else under `Documents/` and `docs/` is historical reference or
dated audit-snapshot. See "Audit-doc disclaimer" below.

### App name — canonical spelling

**`mycurricula.app`** (plural). The GitHub repo is `timjmills/mycurricula.app`
and the deployed Cloudflare custom domain is the same. Older docs that use the
singular `mycurriculum.app` predate the canonical name; treat those as
historical.

### Route aliases (planning-doc names vs. current routes)

The planning doc and some older artifacts name routes that have since been
renamed in the codebase. These have not changed in 2 months; older docs that
say `/curriculum` or `/yearly` refer to the same surfaces.

| Planning-doc name | Current route | Top-bar tab label |
| --- | --- | --- |
| `/curriculum` | `/subject` (→ `/subject/<id>`) | "Curriculum" |
| `/yearly` | `/year` | "Yearly" |

### Audit-doc disclaimer

Every `docs/*audit*.md` and `docs/research-*.md` is a **dated snapshot**.
Findings, recommendations, and "open questions" recorded in those docs may
already be fixed, deferred, regressed, or superseded by later work. Each
audit doc carries a snapshot-disclaimer header noting its date. **Verify
against current code before treating any finding as open or any
recommendation as binding.** A quick check:

```
git log --oneline -- <relevant-file-path>
```

The canonical project guide for what's true today is **this file
(`CLAUDE.md`)** plus `BUILD_STANDARD.md`.
