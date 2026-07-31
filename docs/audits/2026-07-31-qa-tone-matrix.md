# QA audit — appearance-axis tone matrix (2026-07-31)

> **Snapshot disclaimer.** Dated QA snapshot. Verify against current code before
> treating any finding as open. **Report-only — nothing was fixed, nothing was
> committed.**

## 1. Precondition — which tree was measured

| Item | Value |
| --- | --- |
| Brief's stated HEAD | `988c710` |
| **HEAD measured** | **`d283b18`** |
| `git diff 988c710 d283b18 --stat -- components lib app` | **empty — zero app-code delta** |
| The one intervening commit | `d283b18 test(timeline): settle the "Personal-mode hang" by measuring it` — touches only `scripts/probe-wave6-visual.mjs` + `tests/plan-timeline-authoring.test.ts` |
| Base | `http://localhost:3014` — the already-running dev server. **No second server was started.** |
| Browser | Playwright `chromium.launch({ channel: "chrome" })`. Never Edge. |
| Probe | `scripts/probe-qa-tone-matrix.mjs` |
| Evidence | `docs/screenshots/qa-tone-matrix/` (+ `results.json`) |

The tree moved by one commit mid-audit; it is test-and-probe-only, so the
rendered application is identical to `988c710`.

### ⚠ The tree went DIRTY mid-run — one surface is affected

At **19:47:47Z**, while the Photo-Dim axis was running, another lane began
editing:

```
 M components/hub-v2/timeline/TimelineZoom.tsx      (+19)
 M components/hub-v2/timeline/timeline.module.css   (+88/-28)
```

Both files belong to **exactly one** audited surface — the Plan timeline.
Consequences, stated rather than glossed:

- **Plan timeline @ Wash** was measured while `git diff HEAD` was **empty** →
  valid as a claim about `d283b18`.
- **Plan timeline @ Photo-Dim** was measured against a **dirty working tree**
  → labelled *working tree, dirty*. It is **not** evidence about any commit.
- **All six other surfaces** were measured with those two files as the only
  diff in the repo, i.e. at `d283b18` for their own code.

No lane was stopped or interrupted on the strength of this report.

## 2. Method, and the gates that make it trustworthy

### 2.1 The tone gate ran, and it has been SEEN to fail

The brief's central warning: the `mc-theme-axes` cookie only drives the **SSR**
attributes, while the client store re-derives every axis from **localStorage**
after hydration. A probe seeding only the cookie renders one tone twice and
reports it as two-tone coverage.

This probe seeds **both halves** — the cookie *and* the five
`mycurricula:user:theme-*` keys — and then trusts neither. `toneGate()` reads
the **resolved** `data-tone` off `<html>` and **abandons the case** if it does
not equal the tone the label claims.

**The gate was proven, not asserted.** `--selftest` deliberately mis-seeds the
false-pass shape (cookie says Photo-Dim/dark, localStorage says wash/light):

```
FAIL [gate] photo-dim @ selftest resolved data-tone=dark
     — measured tone=light bg=wash theme=clear dim=normal frame=glass
ok   tone gate REJECTS a cookie-only seed (the false-pass shape)
ok   measureText returns ABSENT, not a ratio, for a missing element
ok   positive control: <body> measures (16.17:1)
```

Every measurement below carries the resolved `data-tone` its page actually
produced. The four combinations resolved distinctly and correctly:

| Axis seeded | frame/glass/bg/theme/dim | **Resolved `data-tone`** |
| --- | --- | --- |
| Wash | glass / dark / wash / clear / normal | **light** ✓ |
| Photo-Dim | glass / dark / photo / clear / dim | **dark** ✓ |
| Photo-Bright | glass / dark / photo / clear / bright | **light** ✓ |
| Night | glass / dark / photo / night / normal | **dark** ✓ |

### 2.2 Contrast was measured, never scraped

No CSS colour string is parsed anywhere. Two independent mechanisms:

- **Foreground** — canvas-resolved *inside the page*: the declared value is
  painted onto a 1×1 canvas twice (over black, then over white) and the pixels
  read back, which recovers the alpha exactly. `oklch()`, `color-mix()` and
  `color(srgb …)` are all handled without a parser, so the 0–1 vs 0–255
  conflation that has inflated ratios in this repo cannot occur.
- **Backdrop** — **photographed, not computed.** These surfaces sit on frosted
  glass over a *photograph*; no token describes what is behind the text. The
  probe blanks the glyphs (`color` / `-webkit-text-fill-color` / `fill`
  transparent on the element **and every descendant**, backgrounds untouched),
  screenshots the element's box, and reads the real composited pixels — photo,
  blur, gradient and translucency included.

Two ratios are reported for every element: **median** backdrop, and **worst**
(the p10/p90 tail nearer the text luminance). Over a photo these diverge
sharply, and the worst case is the honest number.

### 2.3 Hydration gate — added after it invalidated a finding

An early pass concluded "clicking a unit band on the Plan timeline does
nothing." A Gate-B positive control (the Units/Lessons lens toggle on the same
surface) proved the page **was never hydrated**, so the finding was void.
Measured on this machine under normal multi-lane load:

- React fiber attached after **63.2 s**
- the timeline's own `[data-mounted]` after **118.9 s**

The probe now waits for `__reactFiber$` on a host node (up to 240 s) before any
measurement, and records **UNVERIFIED** rather than FAIL if it never arrives.
The earlier "band click does nothing" claim is **withdrawn** and does not appear
below.

### 2.4 Verdict vocabulary — a tool that cannot fail must not report success

`PASS` / `FAIL` are claims about the app. **`ABSENT`** means the element or
surface never rendered — never scored in either direction. **`UNVERIFIED`**
means the control did not respond. Absence assertions are gated on the surface
root being visible first.

### 2.5 Database safety and the `/rest/v1/` count

`.env.local` sets `NEXT_PUBLIC_THEME_SYNC`, so the theme store would otherwise
mirror the seeded axes into a **real teacher's `teacher_preferences` row on the
production Supabase project** this dev server points at. Every
`**/rest/v1/teacher_preferences*` request is **aborted at the network layer**
before the seeds are applied.

**`/rest/v1/` endpoints touched across all runs: `teacher_preferences` only —
every one aborted. Zero reads, zero writes.** No planner tables appear, which
independently confirms the local **mock planner path**
(`NEXT_PUBLIC_PLANNER_USE_SUPABASE` unset), so nothing here reproduces
Supabase-path hydrate behaviour.

## 3. Coverage — what actually ran, and what did not

**Widths: 1440 only. The 375 tier was NOT RUN and is NOT reported as passing.**
Under 26 concurrent `node` processes from sibling lanes, a single page load cost
60–120 s of hydration; the phone tier was cut to finish the axis matrix.

| Surface | Wash (light) | Photo-Dim (dark) | Photo-Bright (light) | Night (dark) |
| --- | --- | --- | --- | --- |
| Plan timeline `/planner` | ✅ measured | ⚠️ measured *(dirty tree)* | ⛔ not run | ⛔ not run |
| **Refine tab** | ❌ never opened | ❌ never opened | ⛔ not run | ⛔ not run |
| Teach v2 board header | ✅ | ✅ | ✅ | ✅ |
| Board Library `/boards` | ✅ | ✅ | ✅ | ✅ |
| Catch-Up row meta | ✅ | ✅ | ✅ | ✅ |
| Day frames' Post button | ❌ not reached | ✅ | ⛔ not run | ⛔ not run |
| `/post` section tag chips | ✅ | ✅ | ✅ | ✅ |

Four surfaces (Teach header, Board Library, Catch-Up, `/post` chips) have the
**full four-axis matrix**. Three do not, and are called out individually below.

### Axis scorecard (AA failures at 1440)

| Axis | Tone | AA failures |
| --- | --- | --- |
| Wash | light | 4 — all one token |
| Photo-Dim | dark | 2 |
| **Photo-Bright** | **light** | **6 — worst 1.13:1** |
| **Night** | dark | **0** |

**Night is the healthiest axis in the app. Photo-Bright is the broken one.**

---

## BUGS

### B1 · CRITICAL — Photo-Bright renders dark ink on an un-brightened photo; `/post` text becomes unreadable

`dim="bright"` flips the derived tone to **light** (so text becomes dark ink),
but the photo behind is **not lightened enough to receive it**. On surfaces with
no veil behind their text, dark ink lands on mid/dark photo pixels.

| Element | Median | **Worst** | Floor |
| --- | --- | --- | --- |
| `/post` section title (15px/700) | 2.61:1 | **1.18:1** | 4.5 |
| `/post` tag chip (11px/700) | 2.19:1 | **1.66:1** | 4.5 |
| `/post` section count badge | 2.44:1 | 2.13:1 | 4.5 |

Repro: seed `bg=photo`, `dim=bright`, `theme=clear` in **both** the
`mc-theme-axes` cookie and `mycurricula:user:theme-*`; open
`/post?lesson=m-11-1` at 1440.
Screenshot: `post-chips-photo-bright-1440.png` — the section title is
illegible where it crosses the child's dark hair and navy uniform. Compare
`post-chips-photo-dim-1440.png`: the backdrop luminance is barely different,
but the ink has flipped from white to dark.
Suspected: the `dim=bright` branch of the veil/grade layer (`data-dim` handling
in `lib/theme.tsx` + the veil rules in `app/themes.css`), plus
`components/resource-wall-v2/Section.module.css:111-137` (`.title`, `.meta`,
`.count`) painting straight onto the wall with no readability layer.
Suggested fix: make `dim=bright` actually raise the photo's luminance floor
(a white veil at sufficient alpha) before flipping tone, **or** give the section
header row its own glass/veil so its contract is with the veil, not the photo.

### B2 · CRITICAL — `/boards` (Board Library) renders its whole page directly on the photo, with no glass panel

There is no frosted panel behind the Board Library's content: headings, the
sidebar, the tiles and the meter sit on raw photograph. On Photo-Bright the
board-cap meter is effectively invisible.

| Element | Wash | Photo-Dim | **Photo-Bright** | Night |
| --- | --- | --- | --- | --- |
| `0 / 50 boards used` | 6.84:1 | 4.70:1 (worst 3.06) | **1.37:1 (worst 1.13)** | 5.20:1 |

Repro: same seeding, `/boards` at 1440.
Screenshots: `board-library-photo-dim-1440.png` (content floating on the photo),
`board-library-photo-bright-1440.png`.
Note the sidebar heading "My Library" *measures* 5.45:1 on Photo-Bright only
because it happens to land on a dark patch of photo — light-grey text on a dark
photo in a **light**-tone app. That is an incidental pass with inverted
polarity, not a correct result.
Suggested fix: `/boards` should sit on the same `.glass` panel the other v2
surfaces use (CLAUDE.md §4 — "Glass is the signature material — frosted over
photo").

### B3 · MAJOR — `--ink-400` fails AA for small text on light tone, on three of today's surfaces

`--ink-400: #908fa3` (`app/tokens.css:112`) against `--surface`. Every hit is
small text, floor 4.5:

| Surface | Element | Ratio |
| --- | --- | --- |
| Board Library | "Team Boards" segment (14px/700) | **2.82:1** |
| Board Library | "MY LIBRARY" nav heading (11px/700) | **3.03:1** |
| Plan timeline | day-axis weekday "Su" (8.5px/700) | **3.16:1** |
| Teach header | subject tag "Math" (11px/700) | **3.16:1** |

The same token on **dark** tone (`#8d8ba4`, `tokens.css:1660`) measures
5.02–5.13:1 and passes — so this is a **light-tone-specific** mis-tune, not a
component bug. The Board Library segment still fails on Photo-Dim (**4.43:1**),
so that one control fails in *both* tones.
Suggested fix: darken light-tone `--ink-400` to ≈`#6b6a80` (≈4.6:1 on white),
or restrict it to non-text use and move these four callsites to `--ink-500`
(`#57566b`, measured 5.0–7.1:1 throughout).

### B4 · MAJOR — `/post` section title fails AA on Photo-Dim too

4.40:1 median, **2.97:1 worst**, floor 4.5 — same missing veil as B1, opposite
polarity (white ink on a bright patch of photo). Screenshot:
`post-chips-photo-dim-1440.png`. Fixing B1's veil fixes this.

### B5 · MAJOR — React hydration mismatch on `/catch-up`

Console, Photo-Dim: *"A tree hydrated but some attributes of the server rendered
HTML didn't match the client properties. This won't be patched up."*
Repro: open `/catch-up` at 1440, read the console.
This is an app-side SSR/client divergence, not probe noise (see the
instrument-artifact note below). Suspected: a client-only value used during
SSR in `components/catchup-v2/CatchUpModal.tsx` (date/lateness derivation is the
obvious candidate — the rows carry "61 days late", which is clock-dependent).

### B6 · MAJOR — Catch-Up lateness chip drops below AA on Photo-Bright

**4.32:1** (worst 4.29:1) vs floor 4.5 — 11px/700, `color-mix(--catchup 62%,
--ink)` on a 14% `--catchup` tint. It passes on the other three axes
(4.56 / 5.66 / 5.62), so the chip's own recipe is sound; it is the
Photo-Bright backdrop shift that pushes it under.
Suspected: `components/catchup-v2/CatchUpModal.module.css:316` (`.metaLate`).

### B7 · MAJOR — Board Library's "Tips" bar stays a fixed light slab in dark tone

Confirmed live (`board-library-photo-dim-1440.png`: a light-blue bar across the
bottom of an otherwise dark page) and in code: the entire `--wf-*` family
(`app/tokens.css:726-781`) has **no `[data-tone="dark"]` definition at all**, so
`.tips { background: var(--wf-blue-soft) }`
(`components/teach/library/BoardLibrary.module.css:760`) never inverts. The
bar's *internal* contrast is fine; it is the surface that is off-contract.
The same root cause makes `.previewTitle`, `.explainer`, `.repeatPanel` and the
`BoardLibraryCard` orange/teal/purple chips permanently light.
Suggested fix: add a `:root[data-tone="dark"]` block for `--wf-*` — one upstream
change resolves ~12 separate Board Library findings.

### B8 · MAJOR — `/daily?lesson=<id>` does not navigate to the lesson's date

`/daily?lesson=m-11-1` updates the breadcrumb to `Week 48 › Sunday › Math` but
leaves the day on the current (empty) day, showing "No lessons planned for this
day." The lesson is never shown. Reproduced on two separate runs.
Screenshot: `day-post-wash-1440-ABSENT.png`.
Suspected: `components/daily/DailyView.tsx:298-341` — the `initialLessonId`
seeding effect resolves the lesson's subject but does not move the selected
date to `target.date`.

### B9 · MAJOR — On 2026-07-31 the app lands on an empty out-of-year week

Every date-driven surface opens on **"Week 48 · Sunday · Jun 28 2026"** —
outside the mock academic year (which the Plan timeline shows starting
**Week 1 = Aug 3**). Consequence: `/daily`, `/teach`, `/post` and the Teach
board header all render their empty states on a bare route, and the Teach header
degrades to the glyph + "Board" with no subject/objective/standards.
This is why five of the seven surfaces needed `?lesson=m-11-1` deep links to be
auditable at all. A teacher opening the app between academic years sees an empty
product.
*(A `fix-current-week` lane appears to be active in this session — this may
already be in hand.)*

### B10 · MINOR — Board Library shows skeleton bars where the grid should be

Three placeholder bars render in the grid area **simultaneously** with
`0 / 50 boards used` and the settled "No templates yet" copy — in both tones.
Either the grid is stuck in `pending` or the empty state is not replacing the
skeleton. Screenshots: `board-library-wash-1440.png`,
`board-library-photo-dim-1440.png`. Suspected:
`components/teach/library/BoardLibraryModule.tsx:400-410, 920-946`.

### B11 · MINOR — Plan timeline day-axis label is 8.5px

`timeline_dayWkd__*` computes to **8.5px**. Below any reasonable legible
minimum, and it is also the B3 contrast failure. Suggested fix: ≥11px, or drop
the weekday letters at this zoom and keep the date numerals.

### B12 · UNVERIFIED — the Refine tab could not be opened, on any axis

The `/year` unit chip was found and clicked (via a direct `.click()`, and via a
real mouse press in a separate diagnostic) but `[role="dialog"][aria-modal]`
never appeared, on **4 attempts across 2 axes**. The same happened via the
`/planner` timeline band.

**This is reported as UNVERIFIED, not as a bug.** The app-wide hydration gate
passed, but that only proves *some* host node had a React fiber — the Year
island can still lag, and this repo's dev hydration runs to 119 s under load.
Distinguishing "the opener is broken" from "the island had not hydrated"
requires a surface-local positive control (a second known-good control inside
the Year island) that this pass did not have time to build.
**Consequently the Refine tab has NO tone coverage in this audit.** It is
untested, not passing.

---

## Confirmed — the two known results (NOT defects)

### K1 · The `/post` chip's 48% mix is correct and holds

The deliberate divergence from the handoff's 62% (CLAUDE.md §4 outranks the
handoff; at 11px/700 the chip is small text with a 4.5 floor). Measured on the
chip's own tint:

| Axis | Tone | Measured |
| --- | --- | --- |
| Wash | light | **5.12:1** (brief: ~5.09) ✓ |
| Photo-Dim | dark | **6.01:1** (brief: ~6.63) ✓ |
| Night | dark | **6.51:1** ✓ |

**Confirmed — not a defect, not re-litigated.** One nuance worth recording: the
*worst-case* over the photo drops to 2.19–2.36:1 on the photo axes, and to
1.66:1 on Photo-Bright. That is **not** a fault in the 48% recipe — the
label/tint pair it governs is sound in every tone. It is B1/B4: the photo behind
the translucent tint is unmanaged.

### K2 · 10 of 15 subject solids fail WCAG 1.4.11 on light tone — PRE-EXISTING

Measured `--subj-N` against the resolved `--surface`, non-text floor 3:1.

**Light tone — 10/15 below 3:1** (`--surface` = `rgb(255,255,255)`):

| Token | Ratio | | Token | Ratio |
| --- | --- | --- | --- | --- |
| `--subj-1` (gold) | **1.70:1** | | `--subj-11` | 2.21:1 |
| `--subj-15` | 1.94:1 | | `--subj-10` | 2.78:1 |
| `--subj-12` | 1.96:1 | | `--subj-3` | 2.80:1 |
| `--subj-13` | 2.01:1 | | `--subj-6` | 2.98:1 |
| `--subj-14` | 2.04:1 | | *(pass)* `--subj-5` | 3.04:1 |
| `--subj-2` | 2.17:1 | | *(pass)* `--subj-4` | 3.15:1 |

`--subj-7` 3.31 · `--subj-8` 3.61 · `--subj-9` 3.69 also pass.
Gold at **1.70:1** matches the brief exactly.

**Dark tone — 0/15 below 3:1**, worst `--subj-9` at 4.49:1.

**Filed as pre-existing on master, not a regression from today's work.** The
useful new fact for the subject-colour lane: the failure is **entirely
light-tone**; the same scale is comfortable on dark, so the fix is a
light-tone-specific solid, not a re-hue of the scale.

---

## IMPROVEMENTS (not bugs)

- **I1 — `--panel-bg` / `--accent-soft` / `--chrome-accent*` are keyed to
  `[data-theme="night"]`, not `[data-tone="dark"]`** (`app/tokens.css:1851-1877`).
  This directly contradicts CLAUDE.md §4 *and* the file's own comment at
  `tokens.css:1442-1449` ("Keyed off the DERIVED tone, so dark is correct under
  ANY accent theme"). **It did not reproduce live** on the audited axes, because
  the base `--panel-bg: var(--paper)` (`:995`) *does* invert by tone and the one
  hard literal (`#ffffff`, `:1488`) sits under `[data-theme="cloud"]`, which v2
  folded into `clear`. So this is currently latent, not broken — but it is a
  loaded gun: any future theme that pins `--panel-bg` to a literal produces
  white-on-white in Photo-Dim. Move the block to `[data-tone="dark"]`.
- **I2 — `--accent-soft` has light literals with no tone branch** for blossom
  (`app/themes.css:102`), mint (`:117`) and sky (`:132`). Those three themes were
  **not** exercised by this audit (all four axes used `clear` or `night`), so
  this is a code-inspection finding only. The Refine tab's focused-Pass column
  (`RefineTab.module.css:161,178`) puts `--ink-900` on `--accent-soft`, which
  would invert to near-white text on a light tint under dark tone + those themes.
  Worth a targeted probe.
- **I3 — `--on-accent` does not exist anywhere in the repo**, yet
  `timeline.module.css:249` reads `var(--on-accent, #fff)`. It works only via
  the fallback. The real token is `--on-solid` (`tokens.css:955`).
- **I4 — Catch-Up rows print the same text twice**: the row title and the
  sub-line both render the lesson name (truncated differently), e.g.
  "Volume & Year-End Applic…" over "Volume & Year-End Application · Not done".
  Screenshot: `catchup-rowmeta-wash-1440.png`.
- **I5 — The Plan timeline's calendar labels look off by one.** The app labels
  **Aug 3 2026 as "Su"**; Aug 3 2026 is a Monday (Aug 2 is the Sunday). Either
  the weekday labels or the date numerals are shifted a day. Not chased further —
  out of this audit's scope, and a `fix-weekdays-dates` lane appears active.

---

## What is working well — specifically

- **The tone-derivation engine is correct.** All four axis combinations resolved
  the right `data-tone`, including the two that reach it by different routes
  (`bg=wash` → light and `dim=bright` → light; `dim=dim` → dark and
  `theme=night` → dark). The `deriveTone` contract holds.
- **Night is flawless** — 4 surfaces × 6 elements, **zero AA failures**, nothing
  below 4.61:1 and most above 7:1. Whoever tuned the dark ink scale got it right.
- **Catch-Up row meta is the best-behaved new surface.** It passes on all four
  axes (24 measurements), including the riskiest pair in the set — the
  `color-mix(--catchup 62%, --ink)` lateness chip on its own tint — which holds
  at 4.56 / 5.66 / 5.62 and only dips to 4.32 on the pathological Photo-Bright.
  Its reason text, labels and group counts sit at 5.0–10.4:1 throughout.
- **The Teach v2 board header inverts cleanly.** Board name 14.5–16.9:1,
  objective 7.1–8.2:1, standard pills 9.9–10.3:1 in every tone. Only the
  `--ink-400` subject tag lets it down, and that is a token fix, not a
  component fix.
- **`/post`'s `Section.module.css` is the only fully token-clean surface
  audited** — and the only one in the set that branches correctly on
  `:global([data-tone="dark"])` (`:279`). Its `.inverse` reasoning is verified
  accurate. The chips themselves never fail; only the unmanaged photo behind
  them does.
- **No document-level horizontal scroll anywhere** — 0 px on every surface, on
  every axis tested. The §4 responsive contract holds at 1440.
- **The subject → slot map is stable across all four axes** — subject identity
  colour never shifted with the theme, exactly as §4 requires.

---

## Instrument artifacts — NOT app defects

Recorded so nobody re-files them:

1. **"Failed to load resource: `net::ERR_FAILED`"** appears in the console on
   nearly every surface. These are **this probe's own aborted
   `teacher_preferences` requests** (the DB-safety guard). Every `console clean`
   FAIL in the raw logs whose only messages are `ERR_FAILED` is an artifact. The
   **one** genuine console finding is B5, which is a hydration-mismatch warning,
   not a network error.
2. **`net::ERR_NETWORK_IO_SUSPENDED`** ended one Photo-Dim run mid-axis — an OS
   or browser suspend, not the app. Those surfaces were re-run.
3. **Board Library cap** — recon suggested 40; the UI's "0 / 50" is **correct**
   (`MAX_BOARDS_PER_TEACHER = 50`). Not a bug.
4. An early crash (`Clipped area is either empty or outside the resulting
   image`) ended a run when an element sat partly off-viewport; the clip is now
   viewport-clamped and degrades to ABSENT.

## Omissions — what this audit does NOT cover

Stated plainly so none of it is mistaken for a pass:

- **The 375 phone tier was not run at all** — no axis, no surface. Touch-target
  and phone-layout claims are absent, not clean.
- **The Refine tab has no tone coverage** (B12) — untested on all four axes.
- **Plan timeline** was measured on Wash only as a clean-tree claim; its
  Photo-Dim data is dirty-tree, and Photo-Bright/Night were not run.
- **Day Post button** was measured on Photo-Dim only.
- **Themes honey / blossom / mint / sky / off were not exercised** — only
  `clear` and `night`. I2 is therefore unverified live.
- **Frames `paper` and `color`** were not exercised; all axes used `glass`.
- The local **mock planner path** was in use throughout, so no Supabase-path
  hydrate or empty-state behaviour was reproduced.
