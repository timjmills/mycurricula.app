# QA audit — `/year` Refine tab + `/teach` v2 board header

**Date:** 2026-07-31 · **Scope:** the Unit workspace's **Refine** tab and the
**v2 Teach board header**, both new in `a571d87` · **Report only — nothing was
fixed, nothing was committed.**

---

## Precondition — which tree this measures

```
git rev-parse --short HEAD                                  → 988c710  (named in the brief)
git rev-parse --short HEAD                                  → d283b18  (probe start AND end)
git diff HEAD --stat -- components lib app                  → EMPTY at both points
git diff --name-only 988c710..d283b18 -- components lib app → 0 files
```

HEAD **moved before the first probe ran**: a concurrent lane landed `d283b18`
("test(timeline): settle the 'Personal-mode hang' by measuring it, not
guessing"), which touches only `scripts/probe-wave6-visual.mjs` and
`tests/plan-timeline-authoring.test.ts`. **No file under `components/`, `lib/`
or `app/` differs between `988c710` and `d283b18`**, and the working tree was
clean for those paths at the start and end of every run. So every measurement
below describes app code that is byte-identical at the commit named in the
brief: **clean tree, app code as of both `988c710` and `d283b18`.**

**Data path — this is the MOCK planner.** Across the whole main pass there were
**8** `/rest/v1/` requests, every one a `GET teacher_preferences?select=frame,…`
(the theme-sync read). **Zero** planner reads. There is no
`NEXT_PUBLIC_PLANNER_USE_SUPABASE` in `.env.local`, so hydration pins to
"ready": the `pending` and `error` branches of `PlannerEmpty` — including
Refine's own empty state — are **unreachable locally and were not tested.** No
claim is made about them.

**Instrumentation.** The dev server already running on `http://localhost:3014`
was used as-is (no second server started — §4b "one dev server per repo").
Browser: Playwright `chromium.launch({ channel: "chrome" })`, never Edge.
Probes: `scripts/probe-qa-year-teach.mjs` (main pass) and
`scripts/probe-qa-year-teach-detail.mjs` (corrections, counterfactuals, phone
tier — run in stages via `STAGES=teach,refine,phone`). Raw records:
`docs/screenshots/qa-year-teach/results.json` (main pass), `results-detail.json`
(last detail run) and `detail-runs.log` (all detail runs, concatenated);
screenshots in the same folder. Method **B**
(screenshot key moments) throughout — nothing on these two surfaces was
time-dependent enough to need video.

**Hydration was gated on, not slept through.** This dev server is shared with
several build lanes: a cold `/year` took **77 s to respond and 113 s to attach
React**; `/teach` took 43–172 s. A server-rendered button is clickable long
before `onClick` exists, which is exactly how "the click does nothing" gets
fabricated. Every click in both probes waits for `__reactProps$…` to appear **on
the element it is about to click**, and prints the wait. (A throwaway diagnostic
that waited a flat 14 s did produce a false "clicking a unit chip opens
nothing" — discarded, not reported.)

### Device emulation (it lies twice, so this is explicit)

| Tier | Viewport | `isMobile` | `hasTouch` | DSF | What the page itself reported, in the same observation |
|---|---|---|---|---|---|
| phone | 375×812 | true | true | 3 | `pointer:coarse` ✅ · `any-pointer:coarse` ✅ · `max-width:900` ✅ · `dpr 3` |
| tablet | 768×1024 | true | true | 2 | `pointer:coarse` ✅ · `any-pointer:coarse` ✅ · `max-width:900` ✅ |
| desktop | 1440×950 | false | false | 1 | — |

Touch-target numbers are quoted **only** from contexts that reported
`pointer: coarse` in the same evaluation as the measurement. The pill/tool
geometry at 768 and 375 in Bug 1 was additionally taken by **resizing the
desktop context** — that is layout geometry, not a pointer-media claim, and is
labelled as such where used; the phone conclusion is corroborated by the real
mobile context (`26-teach-header-375.png`).

**No contrast ratios are quoted.** Conflating `color(srgb …)` with `rgb()` has
produced false AA passes in this repo; nothing here needed a ratio, so none was
computed rather than computed badly.

### Absence-assertion discipline

Every "X is not there" below is paired with a positive control from the **same
evaluation**, named in the finding. The `<900px` standards-pill rule gets a
**two-sided** control as well — 901 px shows the pills, 899 px hides them, same
page, same session — so "hidden by the rule" cannot be mistaken for "never
rendered".

---

## What is working well (specifics, not vibes)

1. **The Refine table's width budget holds at 1440.** Table wrap
   `scrollWidth 778 = clientWidth 778`; the right-most column ("Planned") ends
   at **x=1109 against a wrap edge of 1110** inside the 820 px dialog. All 8
   columns render — `Lesson number | Lesson | Objective | Standards | Min |
   Assessment | Res | Planned` — and **nothing is stranded behind a
   scrollbar**. (`02-refine-1440.png`) The specific thing the re-budget was for
   is fixed; how the width is *distributed* between the columns is Bug 5.
2. **The Pass mechanic works for 3 of its 4 passes.** Objectives tints 12 cells
   (`color(srgb 0.136 0.163 0.299)` vs a transparent plain cell) and the counter
   reads "Objectives: 11 of 11 done". (`03-pass-objectives-1440.png`)
3. **Enter-advance is real, tested with real keys.** Objective → focus lands on
   `Objective, lesson 2` **with its text selected (0–59 of 59 chars)**;
   Durations → `Minutes, lesson 2`; Assessment (a `<select>`) →
   `Assessment, lesson 2`. On the last row Enter is **not swallowed** — focus
   stays on `Objective, lesson 11` rather than stranding.
4. **Fill-down's anti-wipe guard fires.** With the source cell emptied, the
   duration fill-down went `disabled=true` while a sibling fill-down (Standards)
   stayed enabled **in the same observation** — so the disable is the guard, not
   a dead toolbar. (`05-filldown-disabled-1440.png`)
5. **Fill-down really is ONE undo step.** 10 of 11 rows changed on the fill; a
   **single Ctrl+Z restored 11/11** rows to their pre-fill values
   (`before=[535,,,,,,,,,,]` → `afterFill=[535×11]` → `afterUndo=[535,,,,,,,,,,]`).
   (`06-`, `07-…1440.png`)
6. **The rich-text cell is honest, and the anti-overshoot holds.** Markup
   authored through the app's *own* editor (`<b>compare two fractions</b>`)
   arrives in Refine as `readOnly` / `aria-readonly="true"` showing the stripped
   text `I can compare two fractions` — no tags leaked. It **looks** inert, not
   merely behaves inert: ink `rgb(180,178,200)` vs a live cell's
   `rgb(240,239,248)`, `border-bottom: dotted 1px rgb(52,50,74)` vs transparent,
   `cursor: default` vs `text`, plus a title saying *why* ("…Open the lesson in
   the Lesson Planner to edit it."). Real keystrokes into it changed nothing,
   and a **plain lesson's cell stayed fully editable** (typed and read back
   "plain cell still editable OK"). (`08-`, `09-…png`)
7. **Teach identity survives the two states it exists for.** Board expanded
   (rail confirmed hidden) and fullscreen: title + objective + 1 standards pill
   still render, and **no tool is off-screen** in either state.
   (`11-`, `12-…1440.png`) It survives on the phone too — 375 expanded still
   shows the title. (`27-teach-375-expanded.png`)
8. **The `<900px` pill hide is genuinely the rule firing.** 901 px → 1 pill,
   `display:flex`; 899 px → the same pill still in the DOM, `display:none`;
   title visible at 899 as the control. Header height moves only 63 px → 65 px
   across the boundary, and the header **stays at 2 wrapped rows** — measured as
   distinct child row offsets, at 1440 (`[.. 2 rows ..]`, 63 px), 768 (65 px)
   and 375 (`tops [10, 63]`, 118 px). It never grows a third row.
   (`22-teach-header-899.png`, `26-teach-header-375.png`)
9. **No document-level horizontal scroll at any tier.** 1440: 1440 = 1440.
   768: 768 = 768. 375 under real mobile emulation (isMobile + DSF 3):
   **375 = 375**. Refine's table scrolls *inside its own card* at 768
   (`scrollWidth 842 / clientWidth 678`, `overflow-x:auto`) — the §4-allowed
   shape — and **0 of 69** in-table controls fall under the 44 px floor on a
   genuinely coarse pointer. (`14-refine-768.png`)
10. **Persistence works both ways.** An objective typed in Refine survived a
    trip to the Lessons tab and back; an objective authored in the Lesson
    Planner appeared in its Refine row afterwards.

---

## BUGS (ranked)

### 1. MAJOR — below 900 px the floating "Lesson ›" pill covers **Present fullscreen** and **Expand board**

*Regression, attributable to this commit's header change.*

The absolutely-positioned lesson toggle (`.mobToggle`, `position:absolute;
top:8px; right:8px; z-index:8`) sits **on top of** the two right-most header
tools at 768 px. Measured: pill box `left 709, right 760, top 8, bottom 52`;
collisions `["Expand board", "Present fullscreen"]`. A teacher on a tablet
cannot tap Present — the tap lands on the lesson toggle.

**Attribution is measured, not guessed.** In the same observation the probe set
`.boardTitle { flex: none }` — its value before `a571d87`, per the CSS comment
at `TeachV2Shell.module.css:101-106` recording the change to `flex: 1 1 auto` —
and re-measured: the right-most tool moves from **x=754 to x=561** and the
collision **disappears**. The growing identity slot is what pushed the
`flex:none` tool cluster under the pill.

- Repro: `/teach?lesson=m-11-1` at 768 (anything ~480–900 px with the lesson
  panel showing). Screenshots `24-teach-toolpill-768.png`,
  `22-teach-header-899.png`.
- Suspected: `components/teach-v2/TeachV2Shell.module.css:63` (`.mobToggle`) ×
  `:106` (`.boardTitle { flex: 1 1 auto }`).
- Suggested fix: stop overlapping rather than re-shrinking the identity — below
  900 px render the lesson toggle **inside** `.boardTools` (it is a header
  control in every other respect), or reserve room for it with
  `padding-inline-end` on `.boardHead` in the same media query.

### 2. MAJOR — clicking the middle of Refine's **Min** cell silently writes a duration, and the result is then clipped out of sight

The Minutes input is **44 px wide** (`.cDur { width: 56px }` minus padding) and
is a native `type="number"`, so Chrome's stepper occupies the middle of the
field. Measured, three ways in one observation:

| what was done | resulting value |
|---|---|
| click the cell's **left edge**, type `45` | `45` ✅ |
| click the cell's **centre**, type `45` | **`545`** ❌ |
| click the cell's **centre** and type *nothing* | **`5`** ❌ — the click alone wrote a value |
| CONTROL: same keys into a text Objective cell | `45` ✅ |

So a click intended to focus the field **increments the lesson's duration**
(`min={5}` → the first step is 5), with no confirmation and no visible cue. It
composes badly with the column's width: 3 digits do not fit, so the stored
`545` **renders as "53"/"54"** (`09-rich-readonly-row-crop.png`,
`06-filldown-applied-1440.png`) — the teacher sees a plausible two-digit number
while a wrong three-digit one is stored, and a fill-down then copies it to every
lesson in the unit. Durations over 99 minutes are ordinary (a double period), so
the truncation is not only a symptom of this bug.

- Repro: Refine → click the centre of any empty Min cell → read the value.
  Screenshot `25-refine-number-typing.png`.
- Suspected: `components/year-v2/unit-tabs/RefineTab.module.css:268-270`
  (`.cDur` width) and `RefineTab.tsx:586-612` (the `type="number"` cell).
- Suggested fix: hide the spinner in a cell this narrow
  (`appearance: textfield` + `::-webkit-outer/inner-spin-button {display:none}`,
  which the design system wants anyway — a stepper is not a token-styled
  control) **and** widen `.cDur` to ~72 px so three digits fit. The table has
  the slack (declared budget ~736 px against 778 px of container).

### 3. MAJOR — the board header's tool cluster is 32 px on touch, including **Present fullscreen**

*Pre-existing, not introduced here — but it is on the audited surface and it
contradicts `CLAUDE.md` §4 ("touch targets ≥44px on primary actions").*

At 375 under real mobile emulation (`pointer:coarse` true, DSF 3), **4 of the 5
header buttons measure 32 px tall**: Start timer, Reset timer, Expand board,
Present fullscreen. Only the countdown button clears the floor (44 px). The
same 32 px sizes were measured at 768. The `@media (any-pointer: coarse),
(max-width: 900px)` block only bumps `.mobToggle` and `.zoomReset`
(`TeachV2Shell.module.css:350-355`); the board tools are
`<Button variant="icon" size="sm">` and are never bumped.

- Repro: `/teach?lesson=m-11-1` at 375 or 768, measure the header buttons.
  Screenshot `26-teach-header-375.png`.
- Suspected: `components/teach-v2/TeachV2Shell.module.css:350-355` (the coarse
  block) and `TeachV2Shell.tsx:302-344` (the `size="sm"` icon buttons).
- Suggested fix: add `.boardTools button { min-width: 44px; min-height: 44px; }`
  to the existing coarse-pointer block rather than changing the desktop size.

### 4. MAJOR — at 375 px the same floating pill prints across the lesson title

Same element, different victim: at 375 the tools have wrapped to a second row,
so the pill lands on the **title**. Measured overlap **45 px** (title box
`l 52 → r 361`, pill `l 316 → r 367`; vertical bands 8–52 vs 10–32),
`pillOverTitle: true`. The screenshots show "Lesson ›" printed over "area
models" — in the resized context *and* in the real mobile context. This is new
because the header used to hold only the short subject name; a full lesson title
now reaches the pill.

- Repro: `/teach?lesson=m-11-1` at 375. Screenshots `24-teach-toolpill-375.png`,
  `26-teach-header-375.png`.
- Suspected: same two rules as Bug 1 — one fix covers both.

### 5. MAJOR — every Lesson and Objective cell in the unit is truncated, with no ellipsis and no tooltip

Measured at 1440: **11 of 11 titles and 11 of 11 objectives** are wider than
their cell. Example: `Equivalent fractions — area models` needs **235 px in a
148 px** input. They are `<input>`s, so the text is *clipped*, not ellipsed —
there is no "…" to signal truncation, and the editable cells carry no `title`,
so a cut title reads as a complete one ("Equivalent fractions –", "Fractions as
division -", "I can generate equivalent"). On a tab whose whole purpose is
seeing a unit's lessons side by side, nothing can be read in full without
clicking into each cell and arrowing through it.

The columns settle at **Lesson 162 px / Objective 180 px** inside the 820 px
dialog — the two longest strings get the narrowest cells, while `Assessment`
(a two-option select) gets 108 px.

- Repro: Refine at 1440, read any row. Screenshots `02-`, `03-`, `08-…1440.png`,
  `23-refine-clipping-1440.png`.
- Suspected: `RefineTab.module.css:256-263` (`.cTitle` / `.cObj`) and
  `RefineTab.tsx:517-545` (no `title=` on the editable cells).
- Suggested fix: mirror the read-only cell — put the full value in a `title=` on
  every title/objective cell (works on hover and long-press) — and rebalance the
  budget toward the two text columns, or let the dialog exceed 820 px on this
  one tab, which is a spreadsheet rather than a reading pane.

### 6. MAJOR — the Standards pass promises an Enter-walk it cannot do

The pass counter renders **"Standards: 7 of 11 done — Enter jumps to the next
lesson"**, but the Standards column is a `<button>` that opens the tag picker
and is never registered in `cellRefs`. Pressing Enter there **opens the
Standards dialog** (focus landed on `Search standards by code or wording`, 2
dialogs on the page) instead of moving down the column. The teacher is told the
keyboard run works on the one pass where it doesn't — and this is the pass most
in need of it (7 of 11 tagged, i.e. 4 rows to walk).

The suffix is emitted unconditionally for any incomplete pass
(`RefineTab.tsx:427-429`), while `REFINE_PASSES`' own Standards tip
(`lib/unit-refine.ts:170-174`) is careful *not* to mention Enter — the two
already disagree in the source.

- Repro: Refine → Pass = Standards → focus a Standards cell → Enter.
  Screenshot `04-standards-pass-enter-1440.png`.
- Suspected: `components/year-v2/unit-tabs/RefineTab.tsx:424-431` (the copy),
  `:560-585` (the unregistered cell).
- Suggested fix: gate the suffix on the pass actually having an Enter-walk
  (`pass !== "standards"`); or, better for the feature, give the Standards
  button an `onKeyDown` that advances on Enter and opens the picker on
  Space/click, and register it in `cellRefs`.

### 7. MINOR (pre-existing, reachable from the new tab) — the Standards picker claims "no match" before any search

Opening the picker from a Refine cell renders **"No standards match these
filters. Try a broader search."** with an empty query and no filters set — a
definite, false statement about a search the teacher has not run. Same
false-empty family this commit set out to remove elsewhere.

- Repro: Refine → any Standards cell. Screenshot
  `04-standards-pass-enter-1440.png`.
- Suspected: `components/standards/StandardsTaggingPicker.tsx:604-608`.
- Suggested fix: branch the resting state ("Search by code or wording to tag
  this lesson.") from the searched-and-empty state.

### 8. MINOR — `PlannedDots` adds a focus stop per row in the middle of a keyboard surface

Each row's completeness cluster is a `<span tabIndex={0} role="note">`
(`RefineTab.tsx:225-240`), so tabbing an 11-row unit crosses 11 non-interactive
stops. Refine is the one surface designed around a keyboard run, so the cost
lands where it hurts most. (It exists to expose the tooltip to keyboard users —
a real need, hence minor.)

- Suggested fix: keep the accessible name on the existing text count and drop
  `tabIndex`, or make the whole `Planned` cell a single stop.

### 9. MINOR — fill-down is a mass write with a *dismissible* tooltip, on a tab that never says whose plan it writes

`CLAUDE.md` §4's always-on list covers destructive actions including
**mass-clear**, and team-wide changes. One fill-down click writes **10 lessons**
(measured), and in Team Curriculum mode those are the team's lessons. Its
tooltip passes `tooltipId="ue-refine-filldown"` but **not** `required: true`
(`RefineTab.tsx:246-300`), so a teacher who has switched tips off gets a bare ↓
icon before a ten-row write.

The contrast with the sibling tab is the tell: Unit Plan renders a visible
**"Team · read-only"** chip and marks its team-content warning `required: true`
(`UnitPlanFields.tsx:8-14, 267`); Refine, which writes far more rows per click,
shows no mode chip at all. The app-wide pink Team glow is still present, so this
is a gap in per-action explanation, not a missing safety mechanism.

- Suggested fix: pass `required: true` on the three `FillDown` tooltips and name
  the target in the copy ("…to every lesson in this unit **on the team plan**"
  when `editMode === "master"`).

---

## IMPROVEMENTS (not bugs)

1. **"Changes save as you type" is invisible to sighted users.** The only place
   Refine says its edits persist is the `<caption>`, which is `sr-only`
   (`RefineTab.module.css:106-118`). A spreadsheet that autosaves should say so
   where it can be seen — a small "Saved" affordance beside the Pass picker.
2. **Below 900 px the standards disappear with no trace.** Hiding the pills is
   the right call for width, but with the board expanded on a tablet the lesson
   rail is gone too, so a projecting teacher has **no** standards anywhere. A
   "+3" chip that expands, or one surviving pill, would at least signal they
   exist.
3. **`Res` and `Planned` are only reachable by scrolling the table at 768.**
   Completeness ("3/5") is the most scannable column in the tab and the first to
   leave the viewport. Consider pinning `Planned` — or moving it beside the row
   number — below 900 px.

---

## Findings I retracted after measuring (recorded so nobody re-reports them)

- **"The board header shows no title at 1440."** False. The main probe's
  `document.querySelector("header")` matched the **lesson rail's** header — there
  are 2 `<header>` elements on `/teach`. Re-measured against the header that
  contains the identity block: title, objective and 1 pill all present with the
  rail shown.
- **"The header grows to three rows at 768."** False — that metric counted text
  lines. Measured as wrapped flex rows: 2 rows everywhere (63 px at 1440, 65 px
  at 768, 118 px at 375 with child tops `[10, 63]`).
- **"The bottom writing bar is clipped at the left edge when the board is
  expanded."** False — that is the Next.js dev-overlay badge sitting on top of
  it. Measured bar box `left 0 → right 1440` at `vw 1440` in both expanded and
  fullscreen states, **0 clipped controls**.
- **"`/daily?lesson=m-11-1` doesn't select the lesson."** False — that came from
  a 14 s wait on a page that needs ~113 s to hydrate here. The deep link
  resolves once hydration is gated on.

---

## Not tested, and what was omitted from the ranking

- **Untestable locally:** `pending` / `error` hydration states (mock path — see
  Precondition). No claim is made about them.
- **Needed three attempts, not skipped:** the Refine `scrollWidth` and Min-cell
  measurements (Bugs 2 and 5). `/year` failed to hydrate inside 420 s on two
  consecutive runs under multi-lane dev-server load; the third run reached it
  (108 s) and both numbers in this report come from that run, not from
  inference.
- **Out of scope:** the Plan timeline, Catch-Up, Resource Wall and Board Library
  changes in `a571d87` belong to other lanes' briefs.
- **Omitted from the ranking** (seen, judged not worth a slot): the dev-only
  `linkedom → Can't resolve 'canvas'` warning (pre-existing, unrelated);
  `refineFillPatch` being recomputed three times per render for the disabled
  checks (no measurable cost at 11 rows); the "Ma" subject monogram (intended —
  `lib/mock/subjects.ts:7`); and the Teach lesson rail reading "No lessons
  planned for week 48" beside a header naming a week-11 lesson — both statements
  are true, but together they read as a contradiction (rail copy, another lane's
  surface).

### Console

**6 errors** across the entire audit, **all** `ChunkLoadError: Loading chunk
app/(planner)/layout … (timeout)` / `app/(teach)/teach/page` — the dev server
timing out under multi-lane load, not product code. **26 warnings**, all the
pre-existing dev-only `linkedom` resolve warning plus one Fast Refresh
full-reload notice. **No `useId` hydration mismatch was seen on either
surface**, and no React error of any kind. The final phone-tier run recorded
**0** console errors.
