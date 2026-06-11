# Handoff: UX Roadmap (9 needed changes) + Resource & Notecard Redesign

Target codebase: **`timjmills/mycurricula.app`** — Next.js (App Router) + React 19 +
TypeScript, Tailwind for layout/spacing only, design tokens in `app/tokens.css`.
This bundle contains two deliverables:

1. **UX Roadmap — Needed Changes** — a planning spec for nine UX features
   (priority, phase, affected surfaces, acceptance criteria). This is a
   *requirements document*, not a screen to build.
2. **Resource & Notecard Redesign** — a high-fidelity design canvas for the
   lesson-resource system: resources panel (right rail), section resources,
   the add-resource/notecard composer, notecard fullscreen, preview +
   annotation, and the rich-text editor spec.

## About the design files

Everything in this bundle is a **design reference created in HTML/JSX** — prototypes
showing intended look and behavior, **not production code to copy**. The task is to
**recreate these designs in the mycurricula.app codebase** using its established
patterns: bespoke components under `components/`, the token system, the
`cp-subj.<subjectId>` palette cascade, the `Tooltip`/`Button` primitives, and the
repo's naming/idiom conventions (see the repo's `CLAUDE.md` and `BUILD_STANDARD.md`,
which bind all of this work).

The prototype JSX uses Babel-in-browser and a pan/zoom "design canvas" shell
(`resource_redesign/design-canvas.jsx`) — that shell is presentation tooling only.
Do not port it.

## How to view

Open either HTML file in a browser (needs network for React/Babel/Google Fonts CDNs):

- `UX Roadmap — Needed Changes.html` — scrollable document; each feature links from
  the summary table; print-friendly.
- `Resource & Notecard Redesign.html` — pan/zoom canvas of artboards grouped into
  sections 0–6. A **"Show annotations"** toggle (top right) reveals numbered
  callouts explaining each design decision; click any artboard's expand icon to
  focus it fullscreen.

## Fidelity

- **UX Roadmap:** spec only. Implement the *features it describes*, in the phases it
  assigns. Its visual styling is incidental (it's an internal doc).
- **Resource & Notecard Redesign: high-fidelity.** Recreate pixel-perfectly. Every
  color, radius, shadow, and type size in `resource_redesign/rn.css` and
  `card-faces.css` references a `var(--token)` from `app/tokens.css` (bundled —
  same token vocabulary as the repo's `app/tokens.css`). The only raw values are
  layout math (px sizes, hit-area insets), which BUILD_STANDARD §3 permits.

---

# Part 1 — UX Roadmap: the nine needed changes

Full specs with acceptance criteria are in the HTML. Summary:

| # | Change | Priority | Phase | Effort |
|---|--------|----------|-------|--------|
| 01 | **Fork diff view** — inline Master-vs-personal diff on lesson detail; whole-lesson + per-field revert; "Propose to Team" via the existing Master-mode banner flow. Diff colors use semantic tokens (`--danger-tint` removed / `--done-tint` added), never subject colors. | P1 | 1B (prototype now) | L |
| 02 | **Undo toasts** — one global toast (bottom-center, 6s, hover pauses, ⌘Z triggers, last-in-wins, no stacking) for moves, completion, first-time forks, reverts, bulk shift. First-fork copy doubles as forking-model education. | P1 | 1A.5 | M |
| 03 | **"Now" anchor** — Today column emphasis on Weekly (`--surface-warm` wash + chip), now-line on Daily positioned from the *configured* schedule (incl. A/B rotation), "Today" jump button on Weekly/Daily/Year. Never `scrollIntoView`; container scroll only. Hidden in print. | P1 | 1A.5 | S |
| 04 | **Command palette (⌘K)** — jump to week/unit/lesson/standard/settings; domain-vocabulary queries ("week 14", "CCSS 5.NBT.5"); subject-color dots on results; recents on empty query; full-height sheet on touch. | P2 | 1B | M |
| 05 | **Holiday-aware drag & drop** — non-instructional days are inert drop targets (hatched, no-drop); attempted drop offers "Move to next school day →" computed from school week + holidays + rotation. Guards programmatic moves too. | P2 | 1B | M |
| 06 | **Bulk shift** — Select mode on Weekly/Catch-up; lane header selects a subject-week; bottom action bar with N-day stepper; grid previews landing days before commit; counts *instructional* days; one undo for the batch; lazy-forks moves in Personal mode. | P2 | 1B | M |
| 07 | **Deep links** — stable URLs for every week/unit/lesson (`/weekly?week=14&subject=math`, `/subject/math#unit-3`); "Copy link" in overflow menus; links resolve Personal-first per viewer. Do the URL scheme now; 04 builds on it. | P2 | 1A.5 | S |
| 08 | **Skeleton states** — per-primitive skeletons matching exact card geometry (zero CLS); `--idle-tint` shimmer, subject `--c-surface` where route context knows the subject; column count derives from configured school week; shimmer off under reduced motion; no spinners on view loads. | P2 | 1B gate | S |
| 09 | **Quiet team signals** — ≤6 avatar dots on lesson *detail* only (solid ring = completed, dashed = forked); aggregate line in Master view; per-school off switch; explicitly **no** grid-card badges, feeds, or notifications. Validate with the beta team first. | P3 | 1B+ | M |

**Sequencing:** ship 03 → 02 → 07 → prototype 01 now against mock data; build
08, 01 (wired), 05, 06, 04 with the Supabase 1B wave; 09 only after 1B is stable.

**Hard constraints that bind all nine** (from the repo's CLAUDE.md):
configurable school week (never hard-code weekday sets), rotating A/B schedules,
grade scoping everywhere, no confirm dialogs (undo instead), completion never
forks, Master edits only via toggle + banner, `prefers-reduced-motion` respected,
≥44px touch targets, three responsive tiers (360–480 / 600–900 / 1024–1920),
no new dependencies.

---

# Part 2 — Resource & Notecard Redesign

## What it is

A redesign of the lesson-resource system per the 6.11.26 brief. Frozen
constraints respected throughout: a notecard IS a `LessonResource` (body + flat
gallery, `gallery[0]` = poster), JSONB storage seam, live-only annotation ink,
sanitizer boundary on rich text, locked subject palette, no new deps.

Brief coverage (also shown on the canvas's "Coverage map" artboard):

- **P1 duplicates** — sections are canonical; the lesson-level array merges by content identity (§1)
- **P2 composer** — two entry points, one capture engine, visible mode badge, staged capture → review (§3)
- **P3 rhythm** — notecard gets a *tile face* in grids and a *compact row* in sections, replacing the oversized strip (§1, §2)
- **P4 targets** — every notecard affordance ≥44px via hit-area inflation (§2)
- **P5 blank frames** — `canEmbed ∧ CSP` as the single embed predicate; designed link-card fallback so previews are never broken (§5)
- **P6 create** — "New notecard" is a first-class entry in the panel (§1)
- **P7 mistrust** — calm "Session only" badge instead of alarming copy (§3)
- **AC-7 gallery** — remove + drag-reorder in the composer; poster = `gallery[0]`, made visible (§3)
- **Delegated decisions taken:** a Notes tab added to the panel (notecards appear in All + Notes); poster override is just reorder — no separate "set poster" control.

## Sections & artboards (the canvas, in order)

### §0 · Card faces — finished
The end-state resource/notecard card recipe, matching the Vivid Weekly card:
subject tint fills the body, `--c-surface-strong` header band with icon tile,
4px deep left stripe (locked palette).
- **Resource · Resource + notes · Notecard** — the three card faces side by side
- **Preview is never broken** — fallback chain across 3 source types
- **⋯ menu** — duplicate + card-color actions
- **Subject default · white · teacher washes** — wash variants (`cfc` classes in `card-faces.css`)
- **Click → functional lightbox**
- **Resources rail rebuilt with cards** (344px column)

### §1 · Resources panel (right rail)
- **Desktop rail · grid** (560): header (title + count chip + add button + list/grid segmented control + collapse), pill tabs (All · Files · Links · Media · **Notes**) with per-tab counts, dashed **"New notecard"** entry row (44px min-height, honey icon tile), 2-column tile grid. Notecard tiles share the plain-tile footprint: honey-50 thumb, white "NOTE" glyph pill bottom-left, dark gallery-count pill bottom-right.
- **Tile overflow menu** (380): Open · Enlarge · Add/edit note · ─ · Remove from lesson (danger). 188px wide, `--shadow-popover`.
- **Desktop rail · list** (560): 44px rows — type icon tile (30px), label, type tag, hover-revealed ⋯ button.
- **Tablet/phone drawer · 390**: same panel as a right drawer over the Daily view; opened from a grid icon in the top bar.

### §2 · Section resources (center column)
- **Expanded · desktop** (560): the 2×2 colored slot grid is kept (slot fills are indexed tints); each slot has a hover edit button (32px visual, inflated to ≥44). Below: the **notecard row** (48px min-height, honey-50 fill, honey-200 border, 34px poster thumb, title + meta) replaces the old full-card strip; then a "more resources" list and a dashed "Add resource" row.
- **Minimized quick access** (380) and **Phone · 360** variants.

### §3 · Composer (one dialog, two modes)
- **Step 1 · capture** (560): dialog (`--r-xl`, `--sh-lg`) with mode badge (blue "Resource" / honey "Notecard"), 2-step stepper dots, a 4-up capture grid (Upload / Link / Google Drive / camera — disabled tools at 55% opacity with "soon"), drop hint, captured-items strip (86px items, removable ×, drag-reorder, poster outlined in honey + "POSTER" tag), quiet **"Session only"** badge (grey pill, amber dot) in the footer.
- **Step 2 · review & route** (560): title field, routing selects (lesson · section — locked selects at 60% opacity when context-fixed), error strip pattern (danger tint + inline Retry).
- **New notecard / edit note** (560): same dialog in note mode — title, rich-text body, editable gallery strip.
- **Phone sheet · 390**: full-height sheet variant.

### §4 · Notecard fullscreen
Split view kept: media pane (left, `--ink-50`, 44px circular chevrons, dot
pagination, enlarge button) + notes pane (right, padded 18–20px). Header adds an
**Edit** affordance (honey icon button) + close. Notes typography spec:
DM Sans 700 h3, 13px body, styled links/lists/`mark` highlights (`.rn-notesBody`).

### §5 · Preview, link card & annotation
- **Link-card fallback**: thumb (120px, `--ink-100`) + title/description/domain row — shown whenever `canEmbed ∧ CSP` fails. One predicate, one designed state — never a blank iframe.
- **Preview chrome + annotation**: floating pill toolbar (pen/highlighter/eraser · 4 color swatches · undo/redo/clear), all 36px buttons inflated to ≥44; an ephemeral dark tooltip pill states "ink is temporary and clears when you close" (live-only ink).

### §6 · Rich-text editor spec
Finite toolbar: B / I / U / highlight · H / bulleted list · link / image. 30px
buttons (inflated hits), `--surface-warm` toolbar strip, link popover with
Save/Open/Remove. Output passes the existing sanitizer boundary — the toolbar
defines the *entire* allowed vocabulary.

## Interactions & behavior

- **Hover-revealed controls:** tile ⋯ buttons are `opacity: 0` at rest, revealed on tile hover (`transition: opacity .12s`) — same pattern as the Weekly card.
- **Hit-area inflation:** small visual buttons get `::after { inset: -Npx }` pseudo-elements to reach ≥44px touch targets (`.rn-44`, `.rn-tileMore`, `.rn-capX`, `.rn-rteBtn`, swatches). Reuse the codebase's existing inflation idiom if one exists.
- **Composer flow:** capture (stage N items, remove, reorder; `gallery[0]` = poster) → review & route → save. Mode badge is always visible so the teacher knows whether they're making a resource or a notecard.
- **Session messaging:** unsaved captures show the quiet "Session only" pill; never alarming copy, no modal warnings.
- **Annotation ink is live-only:** never persisted; the toolbar tooltip says so; "Clear all ink" warns it cannot be undone (tooltip, not dialog).
- **Notecard tile → fullscreen split view**; chevrons/arrow keys navigate the gallery; Esc closes.
- **Every non-obvious control carries a `title`** in the prototype — these map to the repo's `Tooltip` primitive with `tooltipId` (dismissible onboarding tips). Destructive actions (Remove from lesson, Clear all ink) should pass `required: true`.
- **Reduced motion:** hover lifts and reveal transitions are the only motion; gate anything animated on `prefers-reduced-motion`.

## State management

- **Panel:** active tab (All/Files/Links/Media/Notes), view mode (grid/list), collapsed state; counts per tab.
- **Composer:** `mode: 'resource' | 'notecard'`, `step: 1 | 2`, staged `captures[]` (ordered; index 0 = poster), routing target (lesson/section), error + retry state, dirty/session flag.
- **Notecard:** `body` (sanitized rich text), `gallery[]` (flat, ordered), current gallery index in fullscreen.
- **Dedup (P1):** sections are the canonical owner of a resource; the lesson-level array merges by content identity — render each resource once.
- **Embed predicate (P5):** a single `canEmbed(resource) && cspAllows(origin)` authority decides iframe vs. link card — both the preview pane and tiles consult the same function.

## Design tokens

`app/tokens.css` (bundled) is the source of truth — it is the same token
vocabulary as the repo's `app/tokens.css`. Per BUILD_STANDARD: **zero hex** in
components; subject colors only via the `cp-subj.<id>` cascade; new tokens go in
`tokens.css`, never inline. Token families used heavily here: `--ink-*` ramp,
`--paper`, `--surface(-warm)`, `--border`/`--hairline`, `--honey-*` (notecard
identity color), `--brand-*` (primary actions), `--tag-*-bg/fg` (type-tinted
thumbs), `--r-xs…--r-xl`/`--r-pill`, `--shadow-card(-hover)`,
`--shadow-popover`, `--sh-xs…lg`, `--t-10…--t-16` type scale.

The roadmap document uses the brand-system tokens in `colors_and_type.css`
(bundled) — relevant only if you render the roadmap itself somewhere.

## Assets

- **No bitmap assets.** All icons are inline SVG line icons (Lucide-family: ~2px stroke, round caps, 24×24 viewbox) defined in the JSX files. Use the icon approach already in the repo.
- **Fonts** via Google Fonts: Poppins (display), DM Sans (smaller headings), Plus Jakarta Sans (UI/body). The repo loads its fonts via next/font — map the token font stacks accordingly.
- Mock content (fraction-lesson resources, IXL/Khan links) is sample data only.

## Screenshots

`screenshots/` holds one PNG per artboard, named `s<section>-<artboard>.png` (e.g.
`s1-panel-desktop-grid.png`, `s3-composer-review.png`), plus three `roadmap-*.png`
captures of the roadmap document. They are **layout/structure reference only** —
the capture environment could not load the brand webfonts, so text in the PNGs
renders in a system sans stack instead of Poppins / DM Sans / Plus Jakarta Sans.
For true typography, colors, and hover states, open the live HTML files; the CSS
is the authoritative spec.

## Files in this bundle

```
README.md                              ← you are here
UX Roadmap — Needed Changes.html       ← deliverable 1 (spec document)
colors_and_type.css                    ← brand tokens used by the roadmap doc
Resource & Notecard Redesign.html      ← deliverable 2 (design canvas entry point)
app/tokens.css                         ← product tokens (mirror of the repo's)
resource_redesign/
  rn.css                               ← all component styles for §1–§6 (authoritative measurements)
  card-faces.css / card-faces.jsx      ← §0 card-face recipe + states
  surface-panel.jsx                    ← §1 resources panel artboards
  surface-section.jsx                  ← §2 section resources artboards
  surface-composer.jsx                 ← §3 composer artboards
  surface-notecard.jsx                 ← §4–§6 fullscreen, preview, RTE artboards
  rn-shared.jsx                        ← shared icons/helpers for the artboards
  design-canvas.jsx                    ← canvas shell (presentation only — do not port)
screenshots/                           ← PNG per artboard + roadmap captures (see §Screenshots)
```

## Suggested implementation order

1. Roadmap items 03 (now anchor) and 02 (undo toast) — small, unblocked, the toast is a prerequisite for later items.
2. §0 card faces + §1 resources panel (the most-used surface; establishes the tile/row primitives).
3. §3 composer (both modes) + §2 section resources.
4. §4 fullscreen + §5 preview/link-card predicate + §6 RTE.
5. Roadmap item 07 (deep links), then the Phase 1B wave per the roadmap's sequencing plan.
