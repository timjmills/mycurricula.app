# Project Context

Read at the start of every `design-audit` session. Every fact below was verified
against the repo, with its source file in parentheses. Items that could not be
determined are marked **UNKNOWN** and collected at the bottom.

> **Precedence.** This repo's own design contract outranks any skill's opinions:
> `BUILD_STANDARD.md` (visual/structural/responsive contract) and `CLAUDE.md` §4
> (design-system rules) win over generic best practice. The v2 design handoff
> under `Documents/Claude Design/.../6.24.26 design_handoff_v2_site/` is the
> canonical visual reference — authority chain: bundled mockup (look/behaviour) >
> `V2 Framework.md` (rules) > design-system CSS (tokens) > plan (sequencing).
> Never import a skill's palette, font pairing, or component kit.

## Product

- **Product:** mycurricula.app
- **What it does, in one sentence:** a curriculum operating system for school
  teaching teams — consolidates five fragmented planning surfaces (Padlet
  boards, a week-by-week lesson doc, a weekly-focus doc, a standards doc, and
  per-teacher personal copies) into one filterable, editable plan (`CLAUDE.md` §1).
- **Primary users:** teachers only. No student, parent, or admin-facing product
  is in scope. First deployment is a Grade 5 team of 4–6 at a school in Qatar,
  but the data model is multi-grade and multi-school by design (`CLAUDE.md` §1).
- **Primary user tasks:** "What are we teaching this week, and where am I in the
  plan?"; plan/edit a lesson; adapt a team lesson into a personal copy; triage
  lessons not covered (Catch-Up); project a lesson to the class (Teach).
- **Surfaces:** **application only** — there is no marketing site. Use the
  product technique toolkit, not the marketing one.

## Stack

- **Framework:** Next.js `^15.2.4` App Router · React `^19` · TypeScript `^5`
  `strict`, target `ES2017` (`package.json`, `tsconfig.json`). Path aliases
  `@/*`, `@/components/*`, `@/lib/*`, `@/app/*`.
- **Styling:** Tailwind **v3** `^3.4.17` for **layout and spacing only** —
  `theme.extend` is an empty object, verified (`tailwind.config.ts`) — plus CSS
  Modules and CSS custom properties. Import order is
  `tokens.css → themes.css → chrome.css → @tailwind` (`app/globals.css:15-29`).
- **Component library:** none. Bespoke primitives in `components/ui/` (Button,
  Card, Chip, Badge, ToggleGroup, Tooltip, EmptyState, Skeleton, UndoToast,
  ConsequenceToast, …). **No icon library** — inline `<svg>` in 143 component
  files.
- **State / data:** React context stores — chiefly `lib/planner-store.tsx`
  (~4,400 lines; reducer + optimistic writes + serial write queue),
  `lib/app-state.tsx`, `lib/theme.tsx`.
- **Animation and DnD:** `framer-motion ^11.18.2`; `@dnd-kit`
  core/sortable/utilities across 24 files — **not** native HTML5 drag-and-drop
  (`components/weekly/WeekEditBoard.tsx:22`).
- **Backend / data layer:** Supabase (Postgres + RLS + Auth). HTML sanitisation
  via `dompurify` + `linkedom` (`lib/sanitize-html.ts`); `pdfjs-dist` for PDF
  thumbnails only.
- **Hosting:** Cloudflare Workers via OpenNext (`build:cf` / `deploy:cf`,
  `open-next.config.ts`, `wrangler.jsonc`, custom domain `mycurricula.app`).
  **Not Vercel.** The repo **auto-deploys on push to master** (`.gitignore:76`).

## Design system

- **Token source:** `app/tokens.css` — the VALUES layer (888 lines beginning a
  `--` declaration, including per-tone re-declarations). `app/themes.css` is the
  MATERIAL layer (frosted/liquid glass, ambient washes, photo duotone);
  `app/chrome.css` is the chrome overlay. **`themes.css` and `chrome.css` are
  each wrapped in `@media screen`, so print falls back to plain tokens.**
  The appearance-axis value matrix originates in `lib/theme-values.ts`.
- **Type scale:** `--t-28` … `--t-10` (`app/tokens.css:39-51`).
- **Fonts:** `--font-display` Poppins · `--font-display-sm` / `--font-logo`
  DM Sans · `--font-sans` Plus Jakarta Sans · `--font-mono` Geist Mono, plus
  Quicksand and Caveat variables — **seven families in total** via `next/font`
  (`app/layout.tsx:2-65`, `app/tokens.css:16-35`). Note: `CLAUDE.md` names only
  three; the code is the source of truth.
- **Colour roles:** subject scale `--subj-1` … `--subj-15`, each with `-tint`
  (fills), `-ink` (text-on-tint) and `-bright` (dots/outlines)
  (`app/tokens.css:173-229`). The subject→slot map is **team-wide, never a
  teacher preference** (`lib/palette-data.ts:175-184`): math `subj-1`, ufli 2,
  writing 5, grammar 7, spelling 9, reading 10, sel 12, explorers 13.
- **Appearance axes** (canonical values in `lib/theme-values.ts`, kept in
  **five-surface lockstep** with `lib/theme.tsx`, `lib/theme-init.tsx`, the
  `teacher_preferences` CHECK migration, `app/layout.tsx`, and
  `scripts/probe-theme-wave.mjs`):

  | Axis | Values | Default |
  |---|---|---|
  | `data-frame` | `glass \| paper \| color` | `glass` |
  | `data-glass` | `dark \| light` | `dark` |
  | `data-bg` | `photo \| wash` | `photo` |
  | `data-theme` | `clear \| night \| honey \| blossom \| mint \| sky \| off` | `clear` |
  | `data-dim` | `dim \| normal \| bright` | `normal` |
  | `data-canvas` | `glass-dim \| glass-light` | `glass-dim` |
  | `data-tone` | `light \| dark` | **derived, never persisted** |

  `deriveTone` precedence, first match wins: night→dark; glass light→light;
  bg wash→light; dim→dark; bright→light; else `autoTone ?? dark`
  (`lib/theme-values.ts:168-181`).
- **The legibility contract (non-negotiable):** every surface branches on
  **`data-tone`, never on the theme** (135 CSS files do). Dark tone → white text
  on translucent-dark glass; light tone → ink on white. Accent colours only
  interactive/emphasis elements, never reading text.
- **Radius / elevation:** RULE #1 — **no sharp corners, ever**. Every panel,
  card, chip, tab, input, and image is rounded. Glass always carries an inner
  top highlight (`inset 0 1px 0`).
- **Motion conventions:** card expand ~200ms, slide-outs ~250ms. Drag tokens:
  collapse 200ms easeOut, drop 220ms, indicator 150ms, reduced-motion 150ms
  linear (`lib/collapse-on-drag.ts:43-52`). No bounce, parallax, or confetti.
  `prefers-reduced-motion` is handled in 213 files.
- **Icon set:** none — bespoke inline SVG.
- **Dark mode:** supported. `data-theme="night"` is the only dark theme and
  forces `data-tone="dark"`; **branch on the tone, not the theme name.**

## Targets

- **Browser support:** **evergreen, last 2 versions** of Chrome, Edge, Safari,
  and Firefox (owner-stated 2026-08-07; still no `.browserslistrc` in the repo,
  so this doc is the only record). Reference hardware is **school-managed
  mid-tier** machines and tablets, not developer laptops — judge performance and
  interaction cost against that, not against the machine you are testing on.
- **Accessibility target:** WCAG **2.2 AA** — AA contrast minimum, full keyboard
  navigation, **≥44px touch targets** on primary actions (`CLAUDE.md` §4).
- **Performance budget:** **~250 kB first-load JS per route**, and **interactive
  in under ~3 s** on the school-managed mid-tier hardware above (owner-stated
  2026-08-07). Prior bundle work was measured ad-hoc against no target (e.g.
  "/catch-up first-load 405→239 kB"); that number is now gradeable.
- **Viewports that matter most:** phone **360–480**, tablet **600–900**, desktop
  **1024–1920**; audited at **375 / 768 / 1440**. Hard rule: **no
  document-level horizontal scroll at any tier**; internal element scroll is
  fine. Sticky chrome must not eat >~30% of phone viewport height.
- **RTL required:** **aspirational, not a near-term commitment** (owner-stated
  2026-08-07). The target market includes Arabic-medium schools, so it is a
  later programme rather than a dropped idea — see criterion 6. Practical rule:
  **new CSS should prefer logical properties where they cost nothing**
  (`margin-inline-start` over `margin-left`), but do **not** raise RTL findings
  above Low, and do not propose a migration wave unless asked. Treat as
  greenfield, not partial.
- **Print or PDF output:** **print yes** — dedicated routes
  `app/(planner)/weekly/print` (subject×day matrix, semantic `<table>`) and
  `app/(planner)/year/print` (month-stack with page breaks), driven by
  `[data-print-view]` shell suppression in `app/globals.css`; 11 files carry
  `@media print`. **`@react-pdf/renderer` is NOT installed, and browser print is
  the current answer** (owner-stated 2026-08-07) — audit the print routes and
  their stylesheets; do not report against a programmatic PDF path that does not
  exist.
- **Offline behaviour:** none — no service worker found.
- **Localisation:** none. English only; no i18n library, no `Intl` usage.

## Commands

```bash
# dev server — use a port ≥3010 when another session may own 3000.
# ONE dev server per repo (concurrent servers contend for one .next and
# manufacture false findings). Never run a build while `next dev` is running.
npm run dev                      # port: 3010+ (default 3000)

# checks
npm run build                    # NOT while next dev is running
npm run lint                     # next lint
npx tsc --noEmit
npm test                         # vitest run — node env, tests/**/*.test.ts, 64 files
```

## Conventions and constraints

- **Component location and naming:** `components/<family>/` with a barrel
  `index.ts`; consumers import the folder (`@/components/lesson-card`), **never
  a deep file**. Components `PascalCase.tsx`, hooks `useThing.ts`, utilities
  `camelCase.ts`, DB columns `snake_case`.
- **Buttons:** use the `components/ui/Button` primitive only — never hand-roll a
  pill CTA, never a colored-glow resting shadow. Qualify variant/size CSS with
  `.btn` so the `.cp-root` reset can't strip it (`BUILD_STANDARD.md` §8).
- **Never hard-code** a hex colour or px font size (tokens only); **never
  hard-code the school week** (the weekday set is configured) or the daily
  schedule (timetables rotate).
- **Files that must not be modified without discussion:** `app/tokens.css`
  (shared token contract), `lib/theme-values.ts` (five-surface lockstep),
  `Documents/**` (reference material — never imported by the app).
- **Known technical debt to work around rather than fix:**
  - `data-veil` and `data-zoom` exist **only** as CSS selectors in
    `app/themes.css` and are written by no TypeScript — dead-but-landed.
  - ~~`V2_SUBJECT_SLOTS` is defined but `lib/palette.tsx` still emits the v1
    mapping through the `.cp-subj.<id>` bridge.~~ Resolved 2026-08-01 (task
    #50): the constant had zero consumers, so the v1 map rendered everywhere.
    `DEFAULT_SUBJECT_MAPPING` now carries the handoff map and the twin is
    deleted — there is one subject→slot map, pinned by
    `tests/subject-slot-map.test.ts`.
  - ~180 loose QA `.png` files sit in the repo root.
- **Areas permanently out of scope:** student/parent/admin surfaces, gradebook,
  attendance, marketplace, LMS/SIS integration, multi-language UI, and AI
  features (Phase 3+).

## Product-specific review criteria

Things a generic audit would miss. Each is written against what the code
actually does today.

1. **Dense planning-grid ergonomics outrank visual polish.** Three distinct
   grids: `components/grid/WeeklyGrid.tsx` (subject-row × day-column),
   `components/weekly/WeekColumns.tsx` (day columns), and
   `components/weekly/WeekEditBoard.tsx` (**period × day**, ALIGNED vs STACKED
   layouts via `lib/pblayout-state.ts`; period bands are *derived* by
   `lib/week-edit-periods.ts`, never hard-coded). Judge scan-ability, row
   density, and hit-target size before aesthetics.

2. **Drag-and-drop must have a keyboard equivalent (WCAG 2.2 *Dragging
   Movements*).** A shared `useDndSensors()` (`lib/collapse-on-drag.ts:78-90`)
   provides Space-lift / arrows / Space-drop / Esc. **Do not infer coverage from
   that**: `sortableKeyboardCoordinates` silently no-ops on bare (non-Sortable)
   droppables, which is why `WeekEditBoard.tsx:148-162` ships a custom
   `boardKeyboardCoordinates`. **Verify per surface, in a live browser.** The
   only non-drag fallback found is the "Move to day" menu
   (`WeeklyGrid.tsx:1005`). Unverified surfaces: `shell/RailsDndProvider.tsx`,
   `lesson-flow/lesson-flow.tsx`, `teach/*`.

3. **Collapse-on-drag interaction.** `lib/collapse-on-drag.ts` defines
   `DragState` (`idle | dragging | dropping`) and `densityFor()`, which returns
   `full` **iff** the phase is `idle` — so **re-expansion is the return to
   idle**, and a stuck non-idle phase leaves every peer collapsed. Each surface
   owns its own `DragState`; **there is no shared store** (20 consumers). Check
   per-surface: drag-state clearing on drop *and* on cancel/Esc, re-expansion,
   and residual float styles (`floatingScale 1.02` / `floatingOpacity 0.95`).

4. **Unsaved state and autosave across navigation.** Writes are **fully
   optimistic** fire-and-forget tees; the write queue discards the row the
   server returns. There is **no save button on the planner and no
   `beforeunload` guard anywhere**. Failures surface only through
   `components/shell/write-failure-bridge.tsx` (per-verb copy, deliberately no
   Undo). The "Autosaves" label in `components/hub-v2/HubTopBar.tsx:218` is a
   **static affordance, not a per-save success claim** — audit that no UI
   implies a save that did not happen. The app's only dirty-state guard is
   `lib/use-settings-dirty.ts` + `components/settings/save-confirm-dialog.tsx`.

5. **Print and export fidelity.** Audit the two print routes above, the
   `[data-print-view]` suppression cascade, and the `@media screen` wrapper that
   keeps glass/chrome off paper. **There is no `@react-pdf/renderer` path to
   audit** — do not report against one.

6. **RTL layout (Arabic-medium schools).** Currently **greenfield**: no `dir`
   attribute anywhere (`app/layout.tsx` renders `<html lang="en">` with none),
   no `[dir="rtl"]` selector in any CSS, no i18n library, and roughly **20
   logical-property declarations against 163 physical `left/right` rules in
   component CSS alone**. Report as a scoped programme with a migration order,
   not a list of individual bugs.

7. **Sun–Thu school week and Ramadan.** The week is genuinely configurable —
   `lib/use-school-week.ts` (presets `sunThu` / `monFri` / `monSat` + custom;
   `normalize()` never returns empty so the grid is never asked for zero
   columns; cached under `mycurricula:team:school-week-days`, server value
   wins). Sun–Thu is **sample data, not a constraint**. **Ramadan: schema
   columns (`schools.ramadan_timetable_enabled`, `school_years.ramadan_start/
   end`, `time_blocks.ramadan_start_time/end_time`) and a markers-visibility
   toggle (`components/shell/left-filter-panel.tsx:457`) exist, but the
   timetable is enforced nowhere.** Audit the toggle; do not assume a mode.

8. **Fork / merge states.** `EditMode = "personal" | "master"` — **"Team
   Curriculum" is the UI label, `master` is the code word** (`lib/app-state.tsx:51`);
   `SaveTarget = "personal" | "core"` (`lib/planner/source.ts:58`). Lineage
   tables: `master_core_lesson_events`, `personal_core_lesson_event_copies`,
   `personal_authored_lessons`. Review as separate states: unedited, personally
   modified, personally moved, both, re-sync, conflict, stale. The three-tier
   cue must compose — solid stripe / **dashed stripe + "Modified" pill** /
   move-arrow (↔ same-week, ⤴ across) (`components/lesson-card/lesson-card.tsx:11-15`,
   shared atom `components/planner-v2/atoms.tsx`). The pink caution glow
   `#E8179B` (= `--subj-5-bright`) fires on `[data-mode="team"]`, written
   **only** by `ChromeShell`; it is the safety mechanism — **never a confirm
   dialog**. Under reduced motion it is solid, not pulsing.
   **Hard lesson recorded in the code:** never re-introduce a Team option that
   has no write behind it — `components/weekly/save-target-dialog.tsx:10-28`
   documents exactly that false-success control.

9. **Role and permission variants are separate states.** Three non-unified
   vocabularies: `WorkspaceRole = owner | admin | member`
   (`lib/workspaces/row.ts:16`), `GradeRole = teacher | lead | grade_admin`
   (`lib/admin/queries.ts:34`), `TeacherRole = lead | teacher` (`lib/types.ts:27`).
   Honest current state: most UI gating is by **`editMode`, with the real
   permission enforced server-side by RLS** — a teacher lacking
   `can_edit_subject_master` sees a completely normal edit that is silently
   RLS-denied and gone tomorrow (`components/shell/write-failure-bridge.tsx:21-24`).
   Audit the **visibility of that failure**, not just role labels.

### Running the capture script correctly

```bash
node ${CLAUDE_SKILL_DIR}/scripts/capture-screens.mjs \
  --base http://localhost:3010 --widths 375 768 1440 \
  --routes /weekly /daily /year /planner /post /catch-up --axe --out .audit/screens
```

- Pass `--base http://localhost:3010` — the script defaults to `:3000`, which
  another session may own.
- Pass `--widths 375 768 1440` — the defaults (`360 768 1280 1920`) do not match
  this project's audited tiers.
- **The script enforces the 0/1/2 exit contract** (hardened 2026-08-07): `0`
  fully verified · `1` real failures · `2` the instrument was blind. It exits `2`
  — never `0` — when nothing was captured, when every route was redirected off
  its requested path, when `--axe` ran no on-route scan, or when a requested
  variant never applied. **Trust the exit code; do not read the ✓ lines alone.**
- **Narrow widths are now true phone emulation** (`isMobile`, `hasTouch`,
  `deviceScaleFactor: 3` at ≤480px), and viewports use real device heights
  (375→740 tall, not the old width×0.72 letterbox). Each capture prints an
  `[emulated: phone|desktop-window]` tag. The `chrome-devtools` MCP `emulate`
  path (`375x812x3,mobile,touch`) remains the better tool for *interactive*
  phone checks.
- **axe now runs at whichever requested width is nearest 1280** — under this
  project's `--widths 375 768 1440` it scans at 1440. It was previously gated on
  `width === 1280`, so at our documented widths **it silently ran no scan at
  all** and printed nothing. axe `incomplete` results are reported separately as
  "needs manual check" and never folded into a pass; frosted glass makes contrast
  unresolvable for axe, so expect them and judge those by eye.
- **`--dark` alone will not put this app in dark mode.** It emulates
  `prefers-color-scheme`, which this app ignores — dark comes from
  `data-theme="night"` (deriving `data-tone="dark"`). Pass
  `--dark --dark-attrs data-theme=night`; the script stamps the attribute, reads
  it back after load, and exits 2 with `dark: NOT APPLIED` rather than let a
  light capture be graded as dark.
- Output goes to `.audit/screens` (gitignored) for throwaway runs. **Captures
  worth keeping go to `docs/screenshots/<wave>/`** — the curated convention (150
  existing folders), which is the project's answer for anything cited in a report.
- Authentication: local dev needs `PROVISIONING_MODE=individual` in `.env.local`;
  sign in via the `?claude=<CLAUDE_BYPASS_TOKEN>` bypass
  (`docs/5.24.26 claude-access.md`). The onboarding gate will redirect a fresh
  session to `/onboarding`. **Verified 2026-08-07:** an unauthenticated run
  against `:3014` bounced `/weekly` and `/daily` to `/login?next=…`, producing
  six green captures and a "0 violations" axe report *about the login page* —
  the /weekly and /daily 768px PNGs were byte-identical. The script now detects
  this and exits 2. Authenticate before capturing, or the run is a portrait of
  the sign-in screen.
- **Windows/Git Bash foot-gun:** MSYS path conversion rewrites a leading-slash
  route argument, turning `--routes /weekly` into
  `C:/Program Files/Git/weekly`. Run the script from **PowerShell**, or prefix
  with `MSYS_NO_PATHCONV=1`.

## Current design debt

Screens known to need work, so an audit does not spend its finding budget
re-reporting them. **Do not re-report these as new findings** — if you confirm one
is fixed, say so; if you find it is worse or has a cause the ledger missed, that
is worth reporting.

Sources: the 2026-08-02 QA ledger (`docs/qa/2026-08-02-{day,week,post}.md`) and
the 2026-08-01 day-consolidation audit (`docs/audits/2026-08-01-day-consolidation.md`).
**Severity uses the project's own scale — critical / major / minor** (`CLAUDE.md`
§4b), not the Critical/High/Medium/Low of the §4a Codex gate; severity is quoted
from the source docs.

**Status is cross-referenced, not quoted.** The source docs leave every finding
*unassigned* — "fix in flight" and "F2 scheduled" are this file's mapping onto
the live F0/F1/F2 work lanes as of **2026-08-07**, and the lanes are the thing to
verify, not the ledger. Several rows also carry the source doc's own caveat that
a finding is documentation-only, unconfirmed, or deliberate; read the Status cell
before treating a row as a defect. Verify against code before treating any row as
still open.

| Screen / area | Known issue | Severity | Status |
|---|---|---|---|
| Day — focus card | The action row (Done/Plan/Post/Teach) is clipped below the pane at 1280×800 and 1440×900, covered by the floating clock card, and reachable only via a hidden inner scroll (C1) | critical | fix in flight (F0) |
| Day — focus card @375 | The card cannot shrink to its container, so `Open in Teach` is clipped off the right edge (M2) | major | fix in flight (F0) |
| Day — frames | `data-frame` applies, but only Frame B is distinguishable; A and C render byte-identical on every surface (M0) | major | F2 scheduled (frame respec) |
| Day — flow chips | Flow chips fail WCAG AA on the focus card in 4 of 6 measured runs (8-01 #2) | major | F2 scheduled |
| Day — hero | The hero gradient is far darker than the handoff's (Math reads deep olive-brown, not bright gold) and the footer drops a chip, 2 of 3 (8-01 #11) | major | F2 scheduled — **the darkening is a deliberate AA-contrast tradeoff per a code comment**; the audit asks for a decision, not a code fix |
| Day — Frame C | Frame C's focus card has no border, so it is 2px shorter than A and B (m4) | minor | F2 scheduled (frame respec); ledger unsure whether intentional |
| Day @375 | The Day pane gets only 269px of an 812px viewport (m3) | minor | open, unassigned |
| Day — agenda rail | Rail titles are 31px tall at phone and tablet widths, under the 44px target (m5) | minor | open, unassigned |
| Week — view switch | Below 600px the Grid radio reads as selected while List renders, and pressing it silently does nothing (MAJOR 1) | major | fix in flight (F0) |
| Week — chrome | Touch targets below 44px at phone and tablet (MINOR 1) | minor | open, unassigned |
| Year (`/year`) | Commit `5d0b9a2`'s message claims Year inherited the `AddLessonMenu` portal fix, but `/year` has zero callsites (MINOR 2) | minor | **documentation only — the ledger records no code defect**; do not fix code |
| Week — add menu | A canvas re-mount between opening the add menu and pressing Escape strands focus on `<body>` (MINOR 3) | minor | open; ledger calls it low-probability and **not a defect in the Escape path itself** |
| Week — console | Intermittent (2 of ~15 sessions) `TypeError: Failed to fetch` from `@supabase/auth-js` token refresh on `/weekly` (MINOR 4) | minor | informational — ledger attributes it to the network, not app code |
| Week — quick-add | Silent no-ops in `WeeklyList`'s quick-add (MINOR 5) | minor | open, unassigned |
| Post — composer | "Remove link" then Done does not remove the link (#1) | major | fix in flight (F0) |
| Post — composer | Double-clicking a note opens the preview lightbox *over* the composer (#2) | major | fix in flight (F0) |
| App-wide — colour | Every subject colour changes shade seconds after the page is usable (#3, pre-existing) | minor | **CLOSED by mechanism 2026-08-10** — F1 landed. `lib/palette.tsx` no longer branches the emission on palette type, so first paint IS the final hue by construction; the `type` param survives only for compile-compat and `lib/palette-data.ts:220` records it as no longer read. ⚠ Closed by code inspection, NOT by observation — the "does not shift" property is live-observable and is owed a look during the §4b sweep. |
| Post — composer | After Cancel, re-opening the composer loses the saved link (code-identified, never exercised live) (#4) | minor | **PREMISE DISPUTED — re-measured 2026-08-10, not inherited.** `linkValue` is a *draft input buffer*, not the saved link: `ResourceComposer.tsx:909` clears it only AFTER `addItem(parsed)` has committed the link into the captured-items gallery, and the on-open reset at `:503-522` re-seeds that gallery from `editResource.resource.gallery`. No code path loses a *committed* link on re-open. The observable the report describes is most likely Cancel discarding an uncommitted draft, which is intended. **Still needs one live exercise to close** — do not mark fixed on this note alone. |
| Post / lesson card | The same card-colour picker is hue-named on the wall and numbered on the lesson card (#5) | minor | open, unassigned |
| Year — Progression | `ProgressionView.tsx` `StarIcon` still on the `var(--explorers)` alias — missed by the same `a9b3909` that fixed `FlagIcon` 16 lines above (#6) | minor | **RECLASSIFIED 2026-08-10 — NOT a live defect.** `components/year/ProgressionView.tsx` is **unreachable under both flag states** (its only importer, `components/year/YearView.tsx`, is itself unreachable), verified by a symbol-aware import walk at `f77acd6`. No teacher can render this icon. The alias is still wrong and should be fixed *if* the file is ever revived, but it is dead code, not an open UI defect — and it must not be counted as evidence that the colour sweep missed a live surface. Disposition belongs to task #29 (orphaned features), not to a colour fix. |

**Known coverage gaps, not defects.** The Day ledger records three things it
could not reach, so an audit should not read their silence as a pass: the "+N"
standards overflow (U1) and the honest empty-flow state (U2) are **unreachable
from local data**, and 7 of the 12 tone combinations were captured but never
pixel-reviewed (U3). See also the standing note that localhost carries zero
lessons, which makes "empty" the expected local state on every lesson-scoped
surface.

---

## UNKNOWN — open questions for the project owner

1. ~~**Browser support matrix** — no `.browserslistrc` and no `browserslist`
   key. Which browsers and minimum versions are supported?~~
   **Answered 2026-08-07:** evergreen **last 2 versions** of Chrome, Edge,
   Safari, Firefox. Reference hardware is **school-managed mid-tier** machines
   and tablets. No `.browserslistrc` was added, so this doc is the record.
2. ~~**Performance budget** — none declared. Is there a target (LCP / CLS / INP,
   or a first-load KB ceiling)?~~
   **Answered 2026-08-07:** **~250 kB first-load JS per route**, **interactive
   in under ~3 s** on the mid-tier hardware above.
3. **Offline behaviour** — no service worker exists. Is offline use expected?
4. **`data-veil` / `data-zoom`** — dead CSS to delete, planned-but-unwired axes,
   or set by something outside the repo?
5. ~~**`V2_SUBJECT_SLOTS`** — `lib/palette-data.ts:200` says no callsite exists
   yet. Is that comment still true, or is the v2 subject remap live?~~
   **Answered 2026-08-01 (task #50):** the comment was true — zero consumers
   repo-wide — so the remap was never live and the v1 map rendered on every
   surface. The live map now carries the handoff values and the constant is
   deleted.
6. **Keyboard-DnD coverage** — should the audit live-verify rails
   (`RailsDndProvider`), phase reorder (`lesson-flow`), and `teach/*`, given the
   documented `sortableKeyboardCoordinates` no-op on bare droppables?
7. ~~**RTL scope** — is RTL a committed near-term requirement or aspirational?
   This changes the severity of every RTL finding.~~
   **Answered 2026-08-07: aspirational** — a later programme, not near-term.
   New CSS prefers logical properties where they are free; RTL findings stay
   **Low** and no migration wave is proposed unless asked.
8. ~~**PDF export** — is `@react-pdf/renderer` still the intended path, or is
   browser print the permanent answer?~~
   **Answered 2026-08-07: browser print is the current answer.**
   `@react-pdf/renderer` is not installed; do not audit against it.
9. ~~**Screenshot destination** — is `.audit/screens` (gitignored) right, or
   should audit captures live in `docs/screenshots/<audit-name>/` with the
   rest?~~
   **Answered 2026-08-07:** keepers go to **`docs/screenshots/<wave>/`**, the
   curated convention. `.audit/screens` stays for throwaway runs.
10. ~~**`/post` (Resource Wall)** — confirm it is in scope for design audits.~~
    **Answered 2026-08-07: yes, `/post` is in scope.**
