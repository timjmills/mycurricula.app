# Plan timeline — redesign proposal (Mode B: improve existing)

**Date:** 2026-07-31 · **Surface:** the Plan tab's timeline at `/planner`
(`components/hub-v2/timeline/**`, `lib/plan-timeline/**`)
**Plan only. No component, token, or migration file was edited.** Two probe
scripts were added under `scripts/` as instruments; nothing was committed.

---

## 0. Evidence line

> **Evidence:** 12 findings — **10 Observed, 2 Inferred (UX-01, UX-02), 0
> Unverified.** Separately, every claim this document makes about **Photo-Bright
> and Photo-Dim on this surface is Unverified** and is flagged inline; those
> axes were not run. Rendered
> live at 375 / 768 / 1440 on **two** appearance axes (Wash → resolved
> `data-tone=light`, Night → resolved `data-tone=dark`), Playwright
> `chromium.launch({ channel: "chrome" })`, against the already-running dev
> server on `:3014` (no second server started). Contrast measured
> **canvas-resolved inside the page**, never scraped. **Photo-Bright and
> Photo-Dim were NOT run on this surface** — every claim about them is marked
> Unverified with the check named. `tsc` / `lint` / `build` not run (no code
> changed). Team-mode drag geometry not re-measured, and the axis-span probe
> **did not complete** (see §0.3).

### 0.1 Precondition — which tree this describes

**The tree was dirty throughout, on exactly the files this proposal is about, and
it got dirtier while I worked.** Both endpoints, recorded rather than smoothed
over:

```
AT SESSION START                          AT WRITING
git rev-parse --short HEAD → d283b18      → d908049       (HEAD moved)
git diff HEAD --stat -- components lib app:
  TimelineZoom.tsx      (+19)               TimelineZoom.tsx     (+26/-…)
  timeline.module.css   (+88/-28)           timeline.module.css  (+121/-…)
                                            TimelineDrawer.tsx   (+9/-…)
  ── 2 files ──                             TimelineList.tsx     (+8/-…)
                                            plan-timeline/drag.ts   (+20/-…)
                                            plan-timeline/library.ts (+9/-…)
                                            planner-store.tsx    (+116/-…)
                                            planner/source.ts    (+37/-…)
                                            planner/unit-write-queue.ts (+34/-…)
                                            ── 9 files, 283 insertions ──
```

Stated consequences:

- **Every live measurement below is labelled "working tree, dirty."** It is *not*
  evidence about `d283b18`, `d908049`, or any other commit. The screenshots were
  taken against the 2-file state; the 9-file state arrived afterwards.
- The one working-tree change I read in full is `TimelineZoom.tsx`: it removes
  the slider tooltip's promise of lesson titles (QA #3) and rewrites `MAX_COL`'s
  comment. That lane is fixing a defect this proposal also names, and the slider
  it is fixing is the control this proposal **replaces** — compatible, not in
  conflict.
- **The other eight diffs were not read.** Any statement below about a
  `timeline.module.css` line number is against the tree as read at the time of
  writing and **must be re-confirmed before implementation** — the CSS file alone
  has moved by +121 lines since the numbers were taken.
- **No lane was stopped, reverted, or interrupted on the strength of this
  report**, and nothing outside `docs/audits/`, `docs/screenshots/` and
  `scripts/probe-design-timeline*.mjs` was created or edited by this pass. No
  component, token, or migration file was touched.

**Data path — the MOCK planner.** `NEXT_PUBLIC_PLANNER_USE_SUPABASE` is unset
locally; the only `/rest/v1/` traffic was `teacher_preferences`, which this
probe **aborts at the network layer** because `.env.local` points theme-sync at
the production Supabase project. **Zero reads, zero writes.** The `pending` and
`error` hydration states are therefore unreachable here and no claim is made
about them.

### 0.2 The gates, and one that fired

Dev hydration on this machine has been measured at **63 s** (React fiber) and
**119 s** (`[data-mounted]`) under multi-lane load. Every measurement below is
behind a **pure wait** on `[data-lane-subject]` then `[data-mounted]` — no
click-gating — and every absence claim is paired with positive controls
asserted *in the same evaluation*: **8 lanes, 52 band labels with non-empty
text, 310 lesson dots.**

**The tone gate fired and voided a run.** The first pass seeded the
`mc-theme-axes` cookie as JSON and the localStorage keys as `JSON.stringify`'d
values. Both are wrong: the cookie is a **dot-packed** `v1.<frame>.<glass>.<bg>.<theme>.<dim>.<style>.<palette>`
string (`lib/theme-values.ts:191-245`) and localStorage stores **raw strings**
which `readValidated` guards directly (`lib/theme.tsx:255-267`). The seed
silently fell back to defaults; the gate read the resolved `data-tone` off
`<html>`, saw `dark` where the label said `light`, and **abandoned the case**
rather than reporting it. Screenshot kept as `desktop-wash-GATEFAIL.png`.

**A hole in my own gate, disclosed.** The gate checked `data-tone` only, not
`data-theme`. Because the app's default (`bg=photo, dim=normal`) also resolves
to `dark`, the first run's "Night" cases would have passed a tone-only gate
while actually rendering **Clear**. They are excluded because the probe records
the full resolved axis set on every line, and the re-run's Night cases verify
`theme: "night", bg: "photo", tone: "dark"` explicitly. **Any future probe on
this surface should gate on the resolved theme as well as the tone.**

### 0.3 What was NOT measured — so silence is not mistaken for a pass

1. **Photo-Bright and Photo-Dim were not run on this surface.** The tone-matrix
   audit reports Photo-Bright as the broken axis (6 AA failures, worst 1.13:1)
   and its Plan-timeline Photo-Dim data as dirty-tree. **Every contrast target
   in this proposal is stated as a target requiring measurement on all four
   axes, never as a claim.**
2. **The grip ↔ dot collision was not reproduced here.** `gripVsLastDot` sampled
   **0** band-wraps, because grips only render in Team mode (`dragEnabled`) and
   this pass ran in Personal mode. The "15 of 310 dots untappable" figure is
   **reported by a sibling lane and is carried here as Inferred**, not
   re-verified. My proposal's resolution of it is geometric and does not depend
   on the exact count.
3. **`toolbarWrappedRows` is an instrument artifact.** My row-bucketing rounded
   control tops to 6 px and returned "4 rows" for what is visibly one row.
   Toolbar **height** (69 / 158.5 / 234 px) is sound; the row count is not
   reported.
4. **`bandsWiderThanTrack` is an instrument artifact** — my selector
   (`timeline_track__`) never matched the real class (`timeline_laneTrack__`),
   so the track width read as 0 and all 52 bands "exceeded" it. Not reported.
5. **The axis-span probe did not complete.**
   `scripts/probe-design-timeline-span.mjs` is written and left in place, but
   both runs died on the claude-login hop under concurrent load
   (`page.goto: Timeout 120000ms exceeded`). **The academic year's total column
   count is therefore an assumption, not a measurement**, and no figure for it
   is asserted below — see the box in §1.4. Re-run on a quiet server.
6. `prefers-reduced-motion` was not exercised. Screen-reader behaviour was not
   tested. Frames `paper` / `color` and themes honey / blossom / mint / sky /
   off were not exercised.

### 0.4 Authority order used

Project contract first, always: **CLAUDE.md §2/§4 + BUILD_STANDARD.md** outrank
the handoff; within the handoff, the bundled mockup > `V2 Framework.md` >
design-system CSS > plan. No colour, typeface, radius, or spacing value in this
document comes from outside `app/tokens.css`. Where the handoff and the project
contract disagree, the divergence is named and the contract wins.

---

## 1. Why the surface reads weak — the structural read

Four things, in the order they damage the page. This is not a list of blemishes;
each one is a hierarchy decision that went the wrong way, and they compound.

### 1.1 The eye lands on the control strip, which serves the lowest-priority job

The user's own ranking for this surface is **(1) where are we · (2) what needs
my attention · (3) where can I add or move.** Measure the page against that
ranking and it is inverted.

What is actually loudest, in `desktop-wash-01-default.png`:

| Rank in the visual hierarchy | What it is | Which job it serves |
|---|---|---|
| 1 | two segmented trays + a full sentence of instructions + a slider + a Reset button | job **3** (authoring), plus view plumbing |
| 2 | 52 pale subject-tinted slabs | job 1, weakly |
| 3 | 310 coloured rings | nothing the row does not already say (§1.2) |
| 4 | a 2 px accent rule for **today** | job **1** — the top priority, drawn as the faintest mark on the canvas |

The permanent hint — *"Click a unit bar to open its planner, or drag it to
change the weeks it is planned for · click a lesson dot to plan it."*
(`PlanTimeline.tsx:626-630`) — is the largest single text object in the control
strip, and on a phone it wraps to two full lines. It describes job 3. The app
already has a purpose-built mechanism for exactly this copy — the §4
dismissible onboarding-tooltip system — and the band's own `title` already says
it better and in context. (The live QA audit is right to call those band
tooltips "unusually good.")

Meanwhile **today** — the answer to "where are we" — is a 2 px rule
(`timeline.module.css:323-330`) plus a 7 %-alpha week tint (`:298-303`), sitting
underneath 52 bands that are far more saturated than it is.

**Measured cost of the chrome:**

| tier | viewport | px before the first lane | % of viewport | toolbar height |
|---|---|---|---|---|
| desktop | 1440 × 900 | **558.5** | **62.1 %** | 69 |
| tablet | 768 × 1024 | **677** | **66.1 %** | 158.5 |
| **phone** | **375 × 812** | **698.3** | **86 %** | **234** |

*(Observed, both tones — the figures are identical on Wash and Night, so this is
structure, not theming.)* On a phone a teacher opening the Plan tab sees the app
header, the search bar, the hub tabs, a page title, a three-line explanation of
a gesture they may never use, a zoom slider, a Reset button and a pair of scroll
arrows — and then one lane label at the bottom edge
(`phone-night-01-default.png`). CLAUDE.md §4 caps sticky chrome at ~30 % of the
phone viewport.

### 1.2 Colour says "subject" five times per row, so four of them are decoration

Walk one Math lane, left to right:

1. `.laneSwatch` — a subject-coloured dot in the label gutter
2. `.laneName` — "Math"
3. `.band` `background: var(--c-surface, var(--cl))` — a subject-tinted fill
4. `.band` `border: 1.5px solid var(--c)` — a subject-coloured edge
5. `.band` `color: var(--c-deep, var(--cd))` — subject-coloured text
6. `.dot::before` `border: 2.5px solid var(--c)` — **× 310**

CLAUDE.md §4: *"Color is information, never decoration."* The lane has already
delivered "this row is Math" twice before the first band. Everything after that
is repetition, and the repetition is what makes the canvas read as noise rather
than as data — 310 marks whose colour channel is spent on a fact the row
established before they were drawn.

**This is also a divergence from the handoff, not a faithful port.** The
prototype's dot is **status**-coloured with a neutral default —
`ph-v2.css:564-572` overrides the subject border: `.ph-tick { border-color: var(--faint) }`,
then `.st-taught → --done`, `.thin → --warn`, `.missed → --danger`. The shipped
build substituted `var(--c)`. So the user's instinct ("the dots should be solid
colour", "the dot carries state, not subject") is **the handoff's own
specification**, and returning to it is a correction, not an invention.

### 1.3 The mark does three jobs at 14 px, and is measurably illegible at all three

`.dot.dot::before` (`timeline.module.css:598-649`) is 14 px (fine) / 18 px
(coarse) and carries:

- **identity** — a 2.5 px `var(--c)` border. On a 14 px circle that border is
  **36 % of the diameter**; the interior is 9 px.
- **status** — filled vs hollow, plus `border-style: dashed` + `--warn` /
  `--danger`.
- **fork tier** — `box-shadow: 0 0 0 1.5px var(--surface), 0 0 0 3px var(--cd)`
  for *modified*, `border-radius: 4px` for *moved*.

Three encodings on one mark is a §3 single-job violation, and the existence of a
five-key legend beside the canvas is the tell: a mark that needs a legend is a
mark that failed.

**Two measurements make this concrete.**

**(a) The mark fails WCAG 1.4.11 against the surface it sits on.** Dots are
painted *on top of* the band, so the honest backdrop is the band's tint, not
`--surface`. Canvas-resolved, Wash, 1440:

| | ratio | floor |
|---|---|---|
| the live taught Math dot (`--subj-1` on `--subj-1-tint`) | **1.48 : 1** | 3.0 |
| subject solids below 3:1 **against their own band tint** | **13 of 15** | |
| subject solids below 3:1 **against `--surface`** | **10 of 15** | |

The `--surface` column independently reproduces the tone-matrix audit's K2 to
two decimals (`--subj-1 = 1.70:1` in both, measured by different instruments on
different runs), which is the cross-check that the number can be trusted.

**(b) The alarm state is the majority state.** Measured status distribution
across all 310 dots, identical on every tier:

| state | count | share | how it is drawn |
|---|---|---|---|
| `needs_work` | **203** | **65 %** | dashed 2.5 px ring, `--warn` |
| `taught` | 73 | 24 % | filled `var(--c)` |
| `planned` | 34 | 11 % | hollow `var(--c)` ring |
| `missed` | 0 | 0 % | — |

Two consequences. First, a dashed 2.5 px stroke around a 14 px circle produces
four or five dashes and reads, at a glance, as a **loading spinner** — visible
in `desktop-wash-01-default.png` at roughly x = 990 in every lane. Second, a
signal carried by 65 % of the marks is not a signal. The "needs work" alarm has
no dynamic range on data of this shape.

*(Caveat, stated: this is one mock fixture. A real plan may be distributed
differently. But a design that only works when exceptions are rare is a design
that fails on the data in front of us today, and it must tolerate both.)*

### 1.4 The page promises a year and delivers five and a half weeks

The page's own subtitle is *"Your whole year, subject by subject."*
(`PlanTimeline.tsx:707`). At 1440 with the default 34 px day column, the visible
axis runs **Aug 3 → Sep 8** — about **5.5 weeks** (Observed,
`desktop-wash-01-default.png`).

And the zoom cannot fix it. **Inferred** from measured inputs — `--tl-col-floor: 24px`
and `--tl-lbl: 190px` (both Observed off the live canvas) inside a 1440 viewport
— the widest *scope* the control can reach is a ~1230 px track at 24 px per day,
which is **about 10 weeks**. The two ends of the slider's travel therefore differ
by a factor of **1.4** in the direction the teacher actually wants, and by 3.8×
in the direction they mostly do not.

**There is no setting of the current control at which the surface answers the
question its own heading poses.** That, more than any styling choice, is why the
zoom feels wrong: it is a continuous slider whose entire range sits inside a
single scope.

> ⚠ **Not measured.** `scripts/probe-design-timeline-span.mjs` was written to
> settle this exactly — axis column count, full axis width, visible track, and
> the column width that *would* fit the year — and it **did not complete**: two
> runs died on the claude-login hop / hydration wait under concurrent load
> (`page.goto: Timeout 120000ms exceeded`). The 10-week figure above is
> arithmetic from Observed inputs; **the total column count of the academic year
> is an assumption and is not asserted anywhere in this document as a number.**
> Re-run the probe on a quiet server before quoting one.

The slider also has no landing points. 54 positions, no ticks, no labels, no
persistence of intent — the teacher is asked to solve a continuous optimisation
problem every time they open the page, and the answer is never "the year".

**Verdict.** The surface is not ugly because of a colour choice. It is a page
whose loudest element serves its lowest-priority job, whose most-repeated
element repeats information its container already gave, whose top-priority
element (today) is its faintest mark, and whose headline promise no control can
deliver.

---

## 2. What is working well — and must survive the redesign

Named specifically, because these are the things a redesign of this size
usually breaks.

1. **The CSS zoom floor is enforced by the cascade, and that is architecturally
   correct.** `--tl-col: max(var(--tl-col-floor), var(--tl-col-user, var(--tl-col-base)))`
   (`timeline.module.css:32`) means a teacher writing `--tl-col-user: 8px`
   directly onto the card root still gets **44 px** columns on a coarse pointer
   and 24 px on desktop. The QA audit proved this by fighting the control and
   losing. **This resolution order is untouchable.** Every proposal below writes
   `--tl-col-base` (and, at one stop, `--tl-col-floor`) — **never `--tl-col`,
   and never an inline `--tl-col`**, which would beat the coarse-pointer media
   query and let a teacher shrink their own targets below contract.
2. **Visible size and hit size are already separate.** `.dot.dot` is
   `--tl-hit` (22/44 px); the mark is `::before` at `--tl-dot` (14/18 px).
   Measured visible/hit ratio 0.64 fine, 0.41 coarse. This separation is what
   makes it *safe* to shrink the visible mark, and it must not be collapsed.
3. **The drag model is measured precisely correct.** A 230 px drag at 46 px/day
   moved a unit Wk 1–6 → Wk 2–7 with the band's **width unchanged**; the
   right-edge resize grew it 1380 → 1610 px (exactly +230) and moved only the
   end. The 4 px threshold makes a 2 px twitch a no-op. `data-dragging` and the
   ghost were both **0 after pointerup** — no leaked session. Keyboard parity is
   real (`Shift+←/→`, `Alt+Shift+←/→`). **None of this is up for
   renegotiation**; §5 changes only what the ghost *says*, not how the gesture
   works.
4. **Team-mode gating is exactly CLAUDE.md §2.** Flipping the pill sets
   `<html data-mode="team">`, lights the pink frame edge, and only then do the
   52 bands gain `data-draggable` and 52 grips. Authoring is Team-only, and
   there is no confirm dialog. Preserve verbatim.
5. **Accessible names say what things do, not what they are** — "Timeline zoom —
   how wide each school day is", `aria-valuetext="34 pixels per day"`, dots
   reading "Empathy & Relationships — Week 25 lesson. Needs work. Opens the
   lesson." The visual mark can be simplified precisely *because* the accessible
   name is carrying the full state; §4's redesign must keep every word of it.
6. **The band tooltips are the best copy on the surface.** They carry state,
   plan position, both gestures and both keyboard equivalents in one sentence,
   and they update after an edit. §3.4 moves the toolbar's permanent hint into
   this channel because this channel is already better.
7. **The sticky subject label survives horizontal scroll** (`position: sticky; left: 0`,
   `:365-378`) — the one thing the handoff gets unambiguously right, preserved.
8. **The drawer's collapsed state is done properly** — `aria-expanded="false"`,
   the body **absent from the DOM** rather than hidden, `aria-controls` omitted
   while closed so there is no dangling idref, and a literal id rather than
   `useId` (with the hydration mismatch that motivated it documented at
   `TimelineDrawer.tsx:37-50`). §6's auto-open builds on this; it does not
   replace it.
9. **No document-level horizontal scroll at any tier**, verified two ways
   (`scrollWidth == clientWidth` **and** a real `scrollTo(400,0)` leaving
   `scrollX` at 0) at 375 / 768 / 1440 on both tones.
10. **Night is in good shape and must not regress.** On Night the band's fill is
    nearly subject-neutral and identity arrives via the border and text, so only
    **2 of 15** subject solids fall below 3:1 against the band (`--subj-8` 2.82,
    `--subj-9` 2.76) versus **13 of 15** on light — and the live dot measures
    **6.01:1**. The dark tone is not the problem; the light tone is.

---

## 3. The `Fit` control — three stops, fully specified

**Locked by the user:** three options, named for the planning horizon —
**Year · Term · Week** — with lesson titles on the bars at **Week**.

### 3.1 Shape

Use the existing **`ToggleGroup`** primitive (`components/ui/ToggleGroup`),
`size="md"`, `variant="subtle"`. Not a new control: BUILD_STANDARD §4 makes
segmented the default button treatment and §16 says in terms *"do not invent new
toggle styles."* Reusing it inherits, for free and without drift:

- `role="radiogroup"` on the tray, `role="radio"` + **`aria-checked`** on each
  option (`ToggleGroup.tsx:216, 239-240`) — note it is `aria-checked`, **not**
  `aria-pressed`.
- Roving tabindex: the group is **one** tab stop (`:244`).
- The **44 px `::before` hit-area inflation** under
  `@media (any-pointer: coarse), (max-width: 900px)` (`ToggleGroup.module.css:80-98`),
  which applies to both `.md` and `.sm`. Touch sizing is therefore satisfied by
  the primitive rather than by a bespoke rule that can rot.
- `onChange` **never fires when re-selecting the active option** (`:161-168`) —
  a teacher tapping the stop they are already on causes no state write.

**Visible group label: `Fit`**, rendered with the `.ds-label` role class
(Jakarta 11 px / 700 / .09em / uppercase — `app/tokens.css:60-99`, `:1052-1113`),
replacing the current hard-coded 11 px `.zoomLabel`. It reads as "Fit year / Fit
term / Fit week", which is a quantity, not a destination — this matters because
the console nav directly above the card already carries **Day · Week · Year**
tabs, and the label is what stops the tray reading as navigation.

### 3.2 Options, tooltips, and what each stop is *for*

| value | label | the teacher's question | `title` (onboarding tooltip, `tooltipId` set, `required: false`) |
|---|---|---|---|
| `year` | **Year** | "what is the shape of the whole plan?" | "Fit the whole year on one screen — which units run when, and where the gaps are. Individual lessons are too small to read at this width, so they are left out." |
| `term` | **Term** | "what am I working on next?" *(default)* | "Fit about a term. Unit bars carry their names and progress, and every lesson shows as a mark you can tap." |
| `week` | **Week** | "what exactly is happening these days?" | "Spread the days right out — wide enough for each lesson to show its title, and the easiest width for tapping." |

Tooltips are **dismissible, not required**: this is a view control, not a
destructive or team-wide one, so it does not meet §4's `required: true` bar
(which is reserved for the Personal/Team toggle, destructive actions, and
team-wide settings). Each option passes a stable `tooltipId`
(`tl-fit-year` / `-term` / `-week`).

### 3.3 Mechanism — an authored `data-span`, not three slider presets

`.card` gains **`data-span="year" | "term" | "week"`**, and the **stylesheet**
owns the pixels:

```
.card                     { --tl-col-base:  34px; }   /* term, fine pointer  */
.card[data-span="week"]   { --tl-col-base: 120px; }
.card[data-span="year"]   { /* week columns — see 3.4 */ }

@media (any-pointer: coarse), (max-width: 900px) {
  .card                   { --tl-col-base:  46px; }
  .card[data-span="week"] { --tl-col-base: 132px; }
}
```

Three reasons this beats writing three px values from React:

1. **The stops become media-dependent for free.** A phone's "Week" is not a
   laptop's "Week", and a stylesheet can say so where a React constant cannot.
2. **`max(--tl-col-floor, …)` is untouched**, so §2.1's guarantee holds
   unchanged: the teacher still cannot shrink their own touch targets.
3. **It restores the density attribute the build dropped.** The handoff derives
   `data-zoom = colw>=80 ? 'roomy' : colw>=30 ? 'cozy' : 'compact'`
   (`ph-units.jsx:314`) and the shipped build has **no `data-zoom` anywhere**
   (QA #9). Everything in §4 and §5 that changes per stop — whether marks are
   drawn, whether they carry titles, how much of the axis header is shown — is
   then **pure CSS on one attribute**, not props threaded through three
   components. Worth knowing: in the prototype `data-zoom` governs *the lesson
   dot and nothing else* (nine rules, all on `.ph-tick`); this proposal extends
   its reach deliberately, and that extension is the change.

State replaces `colWidth: number | null` with `span: FitSpan` (default `"term"`),
persisted under the repo's `mycurricula:user:*` convention. **`Reset`
disappears** — with three named stops, the default *is* a stop, so a fourth
control explaining how to get back to it is dead weight.

### 3.4 The `Year` stop, and the honest problem it exposes

`Year` cannot be a day-column view. A full academic year is on the order of 175–190
school-day columns (a 35–38-week year on a 5-day school week — **derived, not
measured**, see the box in §1.4); at the 24 px desktop floor that is ~4200–4600 px
inside a ~1230 px track. Lowering the floor is not available either: the floor
exists to stop 44 px touch targets overlapping in narrower columns.

*(The exact figure does not change the conclusion — the shortfall is 3–4×, so no
plausible column count makes a day-column year fit. But it should be measured
before it is written down as a number.)*

**But the floor exists to protect the dot — and at `Year` there is no dot.**
That releases the constraint, and gives two routes:

**Route A (recommended) — at `Year`, one axis column is one school WEEK.**
~36 columns instead of ~180 — a 5× reduction, whatever the exact year length. On
a 1440 laptop at 34 px/week that is ~1224 px against a ~1230 px track: **the year
fits, with nothing to spare.** (Which is why the column count must be measured
before this is built — at 38 weeks it needs 32 px/week, still fine; the design
should read the count and divide, not hard-code 34.) What changes at this stop,
all in CSS on `data-span="year"` except the slot mapping:

- the axis day row is replaced by a week row; month labels carry the calendar
- **no lesson marks** (§4.4) — they have no column of their own, and at a year
  scope 310 of them were never legible anyway
- bands keep their name and `ready/total`, and gain room
- the touch floor is trivially met: nothing smaller than a band is a target, and
  the shortest band is one week wide
- lane height **drops ~25 %** (§4.6) — more subjects on screen exactly when the
  teacher wants the whole picture

Cost, stated honestly: `band.startSlot` / `weekRangeSlots` are in **day** slots,
so this stop needs a slot→week projection. `lib/plan-timeline/axis.ts` already
computes week numbers, so the data is there. **`use-band-drag` measures the
track to recover one column's pixel width** — at week columns a one-week nudge
becomes a one-column nudge, which is arguably simpler, but this **must be
verified, not assumed**, because the drag is the single most correct thing on
this surface (§2.3).

**Route B (cheaper, and not recommended alone)** — keep day columns and make
`Year` the floor. It ships far faster and does not fix the promise: 10 weeks vs
the Term stop's 7 is not three meaningfully different views, and the user would
be right to still dislike it.

**Phone limit, stated rather than glossed.** At 375 the track is ~259 px. Even
at week columns, 36 weeks needs ~7 px each, and a 7 px column makes a one-week
band untappable. Clamping to ~14 px/week gives ~504 px — **on a phone, `Year` is
about two screens wide, not one.** That is the honest limit of a 375 px device,
and it is still a 4–5× improvement on today's eight-screen year. The label stays
`Year` on all tiers because a control whose option set changes by device is
worse than a stop that scrolls a little.

### 3.5 Keyboard, motion, touch

- **Tab** reaches the tray once. **← / →** move and commit (`selectOnFocus`
  stays at its default `true` — the ARIA radio default, and correct here because
  this is a view control, not an edit that could lazily fork a Team lesson).
  **Home / End are not implemented by `ToggleGroup`** — a small, real gap worth
  closing in the primitive, not worked around here.
- **Motion: none.** Do **not** transition `--tl-col`. Animating a width across
  ~180 columns and 362 positioned marks is exactly the "entrance animation on
  data refresh" the product-surface toolkit warns against, and it buys nothing —
  the stop change is a discrete re-read, not a continuity story. This also means
  there is no `prefers-reduced-motion` branch to get wrong.
- **Touch: 44 × 44** via the primitive's `::before` inflation. ⚠ **Inferred, not
  measured.** The QA audit's open item #2 measured the *visible* box of these
  options at 34 px and could not complete the hit-test. **Required check:** an
  `elementFromPoint` hit-test at ±20 px from an option's centre on a genuinely
  coarse context (`pointer:coarse` true **and** `pointer:fine` false).
- At `max-width: 560px` the tray may need `size="sm"` to sit on one line; the
  toolbar is `flex-wrap: wrap` so the fallback (it wraps to its own row) is
  acceptable and is what happens today.

### 3.6 Wireframe — the toolbar, before and after

```
BEFORE (measured: 69px desktop / 158.5px tablet / 234px phone)

┌──────────────────────────────────────────────────────────────────────────┐
│ (Units│Lessons) (Timeline│List)  Click a unit bar to open its planner,   │
│ or drag it to change the weeks it is planned for · click a lesson dot    │
│ to plan it.                          ZOOM ▬▬●▬▬▬▬▬▬▬▬  ⟨Reset⟩          │
└──────────────────────────────────────────────────────────────────────────┘
        job 3            job 3               job 3          job 3
   ── nothing in this strip serves job 1 or job 2 ──


AFTER (target: one row on desktop and tablet, two on phone)

┌──────────────────────────────────────────────────────────────────────────┐
│ (Units│Lessons)  (Timeline│List)                    FIT (Year│Term│Week) │
└──────────────────────────────────────────────────────────────────────────┘
   what is in front   how it is drawn                  how much is on screen

  · the instruction sentence → the band tooltips (which already say it better)
    + a §4 dismissible onboarding tooltip on first visit
  · Reset → deleted; the default is a named stop
  · the 5-key legend → 2 rows, moved off the toolbar to the canvas foot (§4.5)
```

---

## 4. The lesson mark — solid, status-carrying, two-channel

**Locked by the user:** solid fill · fill carries **status**, not subject ·
"blue planned / grey taught / red missed / yellow assessment" as **intent** ·
**assessment is yellow, with a red ring when it was not completed** ·
and, absolutely: *"we don't want the dots to carry the subject, all should be
blue if planned, grey if completed etc."*

### 4.0 The rule, and why it makes everything downstream smaller

> **A dot's colour encodes STATE and nothing else. Every planned lesson is the
> same blue whether it is Math or Reading. Subject identity lives only in the
> lane label and the unit band — never in the dot, at any zoom, in any state.**

This is a *simplification*, and it should be read as one:

| | before | after |
|---|---|---|
| values the mark can take | 15 subject hues × 5 states | **a closed set of ~5**: 3 fills + 1 assessment fill + 1 ring |
| contrast pairs to measure | 15 solids × 15 band tints × 4 axes | **5 values × 4 axes = 20 measurements** |
| backdrop to measure against | 15 different subject tints | **one** resolved `--surface` (with §4.4's sub-row) |
| does the mark repeat its container? | yes, 310 times (VIS-01) | **the question no longer exists** |

The measurement surface drops from *approximately right* to *genuinely right* —
20 numbers is a table someone can read and sign off, and it is small enough that
Photo-Bright, the axis that breaks things, can be covered properly instead of
sampled.

It also reinforces the density goal (all eight lanes on a laptop without
scrolling): a uniform palette resolves faster at 10 px than fifteen hues would,
because the eye is matching against a set of four rather than discriminating
neighbouring tints of gold and apricot.

**⚠ One consequence that must be checked, not assumed.** The dots were
reinforcing subject identity 310 times. Removing that leaves the **lane
swatch + lane name + band** carrying it alone — so the band must be strong
enough on its own. §4.7 revisits the band with that in mind, and it changes the
recommendation there.

### 4.1 The two-channel system, and whether it generalises

It does generalise, cleanly, and the generalisation is the best thing in this
proposal:

> **FILL says what the lesson is and where it stands. RING says whether it
> happened.**

| | fill | ring |
|---|---|---|
| an ordinary lesson still ahead | `--progress` (blue) | — |
| an ordinary lesson marked taught | `--ink-400` (grey) | — |
| an **assessment**, either way | **`--warn` (yellow)** | — |
| **anything** whose day has passed and which is not marked taught | *(its own fill, unchanged)* | **`--danger`, 2 px** |

Why this is better than four mutually-exclusive fills:

- **It answers the composition question the user's own decision raised.** A
  missed assessment is *both*, and it renders as both — yellow fill, red ring —
  instead of one fact destroying the other.
- **It makes "missed" mean one thing in one place.** Under a literal reading,
  red would be a *fill* for a missed lesson and a *ring* for a missed
  assessment; a teacher would have to learn two rules for one idea. That is the
  same error §4 already forbids elsewhere (the shipped dot uses `dashed` for
  "needs work" **and** the fork ring for "modified" — two meanings, one channel,
  no signal).
- **It shrinks the legend to two short rows** instead of five (§4.5).
- **Assessments stay scannable across a whole year**, which is the thing a
  teacher actually scans a year-view for, and they stay scannable *after* they
  are taught.

**⚠ This is the one place I am interpreting rather than obeying, and it needs a
yes/no.** The user said "solid red as missed lessons". Under the unified system
a missed ordinary lesson is **blue with a red ring**, not red-filled. The
literal alternative — red fill for missed ordinary lessons, red ring only on
assessments — is fully buildable and costs one extra legend row plus the
two-rules-for-one-idea problem. **Recommendation: unified. Decision: theirs.**

### 4.2 Where `needs_work` goes — and why the user's own list already answered it

The user listed four things a dot should say. **"Needs work" is not one of
them**, and the measurement in §1.3(b) says why that instinct is right: 203 of
310 dots are `needs_work`, so as a visual alarm it is worthless.

**Proposal: `needs_work` merges into "still ahead" on the canvas** and the
"thin" fact moves to the two places that can act on it:

1. the band's own `ready/total` count, which already reads `0/6`; and
2. the **Needs Attention** drawer — a locked, in-flight feature whose
   `AttentionKind` already includes `thin` (`lib/plan-timeline/library.ts:98-104`,
   rank 1).

**The accessible name loses nothing.** `DOT_STATE_LABEL` keeps all four states
and the dot keeps announcing "Needs work" — only the *visual* channel merges.
That is the §3 "one clear job" principle: the canvas answers "where are we", the
drawer answers "what needs my attention", and the same fact is not drawn twice
in two places with different weights.

**⚠ Behaviour change — needs sign-off**, because it removes a distinction that
is on screen today.

### 4.3 Tokens, and what must be measured before any of it is built

Every value below is an existing token. **None of these ratios is a claim** —
they are targets, with the measurement named.

| role | token | value (light / dark) | why this token |
|---|---|---|---|
| still ahead ("blue") | **`--progress`** | `#3b6cf6` | A **status**-tier blue. Critically **not** `--accent` / `--chrome-accent`: BUILD_STANDARD §2 says *"Themes remap `--accent` only — never subject or status colors"*, so an accent-tier blue would change hue under Honey / Blossom / Mint / Sky and a teacher who learned "blue = ahead" would be wrong on four themes. |
| taught ("grey") | **`--ink-400`** | `#908fa3` / `#8d8ba4` | Tone-branched, and the tone-matrix audit **measured** it at **3.16:1** on light and **5.02–5.13:1** on dark against `--surface`. 3.16 clears the **3:1 non-text** floor for a mark while failing the **4.5:1 text** floor — which is exactly why it is right here and wrong for the 8.5 px weekday label that shares it (finding VIS-04). `--idle` (`#b6b5c6`) is the better-named alternative but is lighter and **has no dark-tone branch**, so it would need one added first. |
| assessment ("yellow") | **`--warn`** | `#e9a526` | ⚠ `tokens.css:320-324` states plainly that `--warn` is a **fill** colour measuring ~2.0:1 as text on a light surface. As a **fill** that is its intended use — but ~2.0:1 is also below the **3:1 non-text** floor, so **this is the highest-risk value in the proposal and must be measured first.** If it fails, the fallbacks in order are: (a) `--warn-ink` (`color-mix(in oklab, var(--warn) 55%, #000)`) as the fill — still honey, materially darker; (b) `--warn` fill with a 1 px `--warn-ink` rim. |
| did not happen (ring) | **`--danger`** | `#ef5a5a` | Estimated ~3.1:1 on white — **marginal, measure it.** If it fails, darken via `color-mix(in oklab, var(--danger) 70%, #000)` rather than introducing a new hue. |

**Not used:** `--assess-summative` (`#8352c7`) and the formative-reuses-`--done`
convention (`tokens.css:328-341`). The app already colours assessments purple
(summative) and green (formative), and the user has chosen yellow for the
timeline. That is a **real inconsistency with the rest of the product** and I am
flagging it rather than burying it: either the timeline diverges deliberately
(defensible — a year-scan wants one "assessment" signal, not two kinds), or
`--assess-summative` is used and yellow is dropped. **Recommendation:** keep
yellow as one signal on the timeline, and let the *kind* (formative/summative)
surface where there is room for it — the `Week` pill's glyph and the accessible
name. Flagged for the user.

**Required measurement, before implementation — and it is now a small, finite
table.** Because the palette is a closed set (§4.0) and the marks sit on a
single backdrop (§4.4), the whole obligation is **5 values × 4 axes = 20
numbers**:

| | Wash | Photo-Dim | Photo-Bright | Night |
|---|---|---|---|---|
| `--progress` (ahead) | | | | |
| `--ink-400` (taught) | | | | |
| `--warn` (assessment) ⚠ | | | | |
| `--danger` (ring) ⚠ | | | | |
| ring vs its own fill | | | | |

Extend `scripts/probe-design-timeline.mjs` — it already canvas-resolves colour
inside the page and photographs backdrops — to fill that grid at 375 and 1440
against the **resolved `--surface`**. Floor: **3:1** (WCAG 1.4.11, non-text).
The last row matters and is easy to forget: a red ring drawn immediately around
a yellow fill has to be distinguishable *from that fill*, not only from the
page.

This is the payoff of the subject-free rule. The same obligation under the old
scheme was 15 solids against 15 tints across 4 axes — a number nobody was ever
going to actually measure, which is how `1.48:1` shipped.

One protective property is worth stating, and one caveat with it. The card is
`background: var(--surface)` (`timeline.module.css:58`), and `--surface`
measured **opaque** on both axes run here (`[255,255,255]` Wash, `[30,29,44]`
Night). So these marks sit on a **resolved surface, not on the photograph**, and
Photo-Bright's characteristic failure — dark ink on an un-brightened photo, 1.13:1
elsewhere in the app — should not reach them. **⚠ Unverified: Photo-Bright was
not run on this surface.** The check is one probe case, and it is a
precondition, not a nicety.

### 4.4 Geometry per stop — and this is where the collision is resolved

| stop | axis column | the mark |
|---|---|---|
| **Year** | one school **week** | **none** |
| **Term** | one school day (34 / 46 px) | solid disc, `--tl-dot` **10 px fine / 12 px coarse** (down from 14 / 18) |
| **Week** | one school day (120 / 132 px) | a **labelled pill** carrying the lesson title |

The disc shrinks *because* it no longer carries a 2.5 px ring: a solid 10 px
disc reads where a ringed 14 px donut with a 9 px hole does not.

**The hit target does not move.** `.dot.dot` stays `--tl-hit` — 22 px fine,
**44 px coarse** — and the mark stays a `::before` inside it. Visible size and
hit size stay separate, exactly as they are today (§2.2).

**The ring must not grow the mark.** Draw it *inside* the existing footprint:

```
.dot[data-late]::before {
  width:  calc(var(--tl-dot) - 4px);
  height: calc(var(--tl-dot) - 4px);
  box-shadow: 0 0 0 2px var(--danger);   /* total diameter == --tl-dot */
}
```

so a ringed dot and a plain dot occupy **identical** space and no ring can push
a mark into its neighbour.

**The `Week` pill**, from the handoff (`ph-v2.css:1645-1653`) with two
deliberate divergences:

- `height: 22px`, `border-radius: 12px`, `padding: 0 8px 0 6px`, `gap: 4px` — as
  specified.
- **Title at `--small` (13 px), not the handoff's 10 px.** BUILD_STANDARD §7:
  *"Never below 13px UI."* CLAUDE.md §4 outranks the handoff.
- **Left-aligned to its column, not centred.** The handoff keeps
  `transform: translate(-50%,-50%)` on a `max-width: 102px` chip, so chips on
  adjacent days visually collide and the prototype makes no attempt to avoid it.
  Instead: `transform: translate(0,-50%)`, `left: calc(var(--tl-col) * slot + 4px)`,
  `max-width: calc(var(--tl-col) - 8px)`. A pill then **cannot** cross into the
  next day, at any column width. This is a fix to the handoff, not a port of it.

#### The grip ↔ dot collision, resolved by geometry

This is the structural change, and it pays for itself several times over.

**Today** the band and the marks occupy the same strip. `.bandWrap` is
`top: var(--tl-band-top); height: var(--tl-band-h)`; the first dot's *centre* is
`--tl-row-axis = --tl-band-top + --tl-band-h / 2` — the band's own vertical
midline. The grip is `top: 0; bottom: 0` inside that wrap. So the grip and the
first dot of a stack are guaranteed to share pixels, and widening the grip to
44 px is what made 15 of 310 dots untappable.

**That single overlap is the root cause of three separate defects:**

1. the grip ↔ last-dot collision (15 untappable);
2. the band's leading edge is not grabbable — the QA audit hit-tested it and
   found the first band-owned pixel **48 px in**, because a dot sits on the
   band's first day (QA #4);
3. `.band` needs `padding: 0 10px 0 calc(var(--tl-col) / 2 + 10px)` — a hack the
   file documents as the fix for every unit reading *"ace Value & Decimals"*.

**Proposal: give the marks their own sub-row beneath the band.**

```
BEFORE — one strip, three objects fighting for it

 lane top ─┬─ 11px
           │   ┌────────────────────────────────────────────┬──┐
  --tl-row-axis│ ●  Place Value & Decimals   ●    ✳    ●   ●│▌ │ ← grip
           │   └────────────────────────────────────────────┴──┘
           │   ▲                                          ▲▲▲
           │   └ dot covers the band's leading edge        └ dot UNDER the grip
           └─ 22px of dead space
 lane bottom     (measured: 75px lane, 42px band at 11px top)


AFTER — two tiers, one object each

 lane top ─┬─ 8px
           │  ▐┌───────────────────────────────────────────┬──┐
    band row │ ▐│ Place Value & Decimals             4/6   │▌ │ ← grip owns
           │  ▐└───────────────────────────────────────────┴──┘   this edge
           ├─ 4px                                                  outright
    mark row │   ●    ●    ●     ◉     ●    ●    ●                ← nothing
           │       (on --surface, one contrast pair, not 15)        else here
           └─ 8px
                 ▐ = 4px subject stripe (§4.7)   ◉ = red-ringed
```

`top` for a mark becomes
`calc(var(--tl-band-top) + var(--tl-band-h) + var(--tl-mark-gap) + var(--tl-hit)/2 + stackIndex * var(--tl-hit))`.
The grip's bottom edge is `--tl-band-top + --tl-band-h`. The mark row's top is
that plus the gap. **They cannot overlap, at any `--tl-grip` width, by
construction — no z-index involved.**

What it buys, beyond the collision:

- the band's leading edge becomes grabbable → **QA #4 resolved**
- the `padding-left` hack is deleted → every band label gains ~17–23 px
- marks sit on **`--surface`**, so the contrast contract is **one pair** instead
  of fifteen subject tints — which is what makes §4.3's measurement plan finite
- the `Week` pills have a clear line and cannot collide with band names
- the drag ghost gains somewhere to show displaced marks (§5.2), which is a
  better cue than a band outline and survives clipping (**QA #7**)

**What it costs, measured:**

| | desktop | coarse | at `Year` |
|---|---|---|---|
| today | 75 px | 113 px | 75 px |
| proposed (8 + band + 4 + `--tl-hit` + 8) | **82 px** (+9 %) | **112 px** (−1 %) | **56 px** (−25 %) |

On touch it is free — the dead space absorbs it. At `Year` lanes get materially
shorter, which is exactly when more of them should be on screen.

#### The density target: all eight lanes on a laptop, without scrolling

Worth stating as a number, because it decides whether the surface can answer
"where are we" in one look. On a 1440 × 900 laptop:

| | today | proposed, `Term` | proposed, `Year` |
|---|---|---|---|
| 8 lanes | 8 × 75 = 600 | 8 × 82 = **656** | 8 × 56 = **448** |
| + axis header | 63 | 63 | 63 |
| + toolbar | 69 | ~44 | ~44 |
| **card total** | **732** | **763** | **555** |
| page chrome above the card (measured) | **558.5** | — | — |
| **space actually available (900 − chrome)** | **341** | | |

**The lane maths is not the binding constraint — the page chrome is.** Even at
`Year`'s 555 px the card does not fit in the 341 px left over, and no amount of
lane compression closes a 558 px gap. **RSP-01 is therefore a prerequisite for
the density goal, not a parallel nicety**, which is why wave 1 in §11 is the
chrome and not the mark.

**The residual risk, named:** a mark under a bar is associated with it by
adjacency rather than superimposition. Marks must remain full-track (lessons can
fall outside their unit's weeks — that is what `lessonsOutside` is for), so the
link is x-alignment. **This is the one part of the proposal I would prototype
before committing**, and it is the reason §7 sequences it after the cheaper
wins.

*(If the sub-row is rejected: there is no clean alternative. Moving the grip
outside the band's right edge collides with an abutting band; suppressing the
last dot's hit area strands a real lesson; z-index ordering leaves a 44 px
control sitting on a 44 px control. The overlap has to be removed, not
arbitrated.)*

### 4.5 The legend — can it go away entirely?

**Partly, and the honest answer is "shrink it, don't delete it."**

What genuinely *becomes* self-evident once the mark is subject-free:

- **grey = behind you, blue = ahead of you** is reinforced by position — the
  today column (§6.1) sits between them, so the legend is confirming what the
  x-axis already showed. This pair could stand without a key.
- **a red ring = something did not happen** is close to universal.

What stays arbitrary and therefore still needs a key:

- **yellow = assessment.** Nothing about a yellow dot says "assessment". This
  one is a pure convention and a teacher cannot derive it.

So the legend shrinks from five keys to **two rows**, and moves off the toolbar
to the canvas foot where it stops competing with the controls:

```
 fill    ● Ahead     ● Taught     ● Assessment
 ring    ◉ a red ring means the day passed without being marked taught
```

**Better still: make it dismissible rather than permanent.** This is exactly the
shape §4's onboarding-tooltip system exists for — a first-time teacher needs it,
a teacher in week six does not, and the app already has the machinery
(`lib/tooltip-dismissal.ts`, a stable `tooltipId`, "Turn off these tips", and a
master switch plus reset in Settings → Appearance). **Recommendation:** render
the two-row key by default with a `tooltipId` of `tl-legend`; once dismissed, it
collapses to a single `ⓘ` that re-opens it. That is the honest version of "it
disappears" — it disappears *for the teacher who no longer needs it*, which is
the §4 policy, rather than for everyone on day one.

Also fixed regardless: the legend renders **only in the Lessons lens** today
(`PlanTimeline.tsx:638`) while the marks render in **both**. It should follow
the marks. And the shipped legend's best property is kept — it reuses the
**real mark**, so the ring channel stays discoverable rather than being drawn as
a swatch that behaves differently from the thing it describes.

### 4.6 What happens to the fork tier

Today: `modified` → a double `box-shadow` ring; `moved` → `border-radius: 4px`.
On a 10 px disc neither is legible, and the ring channel is now spoken for by
"did not happen".

**Proposal: draw fork at the `Week` stop only, on the pill, in CLAUDE.md §2's
own card grammar** — solid leading edge for Master, **dashed** for personally
modified. At `Term` and `Year` it is not drawn and lives in the accessible name,
which already says "Modified" / "Moved".

This is **not** a §2 violation. §2's three-tier differentiation is specified for
lesson **cards** (stripe · Modified pill · move arrow) and is preserved there
untouched; the timeline dot's ring/square encoding is an extension the timeline
invented, and the file's own comment says as much (*"absent from the handoff's
marks entirely"*). Scoping an invented encoding to the width where it can be
read is better than drawing it illegibly everywhere. **Flagged for sign-off**
regardless, because it removes a mark that exists today.

### 4.7 The band — now the *only* thing carrying subject on the track

Because the dots no longer carry subject (§4.0), the band has to do that job
alone. That raises an obvious worry — "won't a weaker band lose the subject?" —
and the answer, measured, is the opposite of what it looks like.

**The tint was never the identity channel. The solid is.** Compare the tokens
for three adjacent subjects:

| | `--subj-1` gold | `--subj-2` apricot | `--subj-3` coral | separation |
|---|---|---|---|---|
| **tint** (today's band fill) | `#f4efdf` | `#f4e9df` | `#f4e2df` | identical R and B; **13 points of green across three subjects** |
| **solid** (`--c`) | `#dcc674` | `#dca574` | `#dc8274` | **68 points of green** — 5× more separable |

Today's band fills *cannot* tell gold from coral, and never could — the dots
were papering over it. So the fix is not "keep the wash"; it is **move the
identity onto the channel that can actually carry it.**

**(a) Subject identity concentrates into a 4 px left stripe.** This is the
handoff's own band (`ph-v2.css:927-940`: frosted off-white,
`border-left: 4px solid var(--bc)`) *and* CLAUDE.md §2's card grammar
(*"solid 4px subject-color left stripe"*), so the timeline stops being the one
surface in the product with its own subject vocabulary:

```
background:  color-mix(in oklab, var(--c) 14%, var(--surface));   /* row banding */
border:      1px solid var(--border);
border-left: 4px solid var(--c);                                  /* the identity */
color:       var(--ink-900);
```

The remaining 14 % tint stops being an identity claim and becomes what it
always really was — quiet row banding that groups a lane's bands together. Band
text moves from `--cd` (fifteen contrast pairs, one per subject) to `--ink-900`
(one).

**(b) The lane label gets the second half of the job.** With the track's
identity down to a 4 px edge, the sticky label must be unambiguous — and it is
the better place for it, because it is *pinned* and survives horizontal scroll
(§2.7). Strengthen `.laneSwatch` to the full `--c` solid and keep `.laneName` at
`--small`/700. Identity then reads: **a solid swatch + the subject's name,
always on screen**, with the stripe echoing it on the track.

**⚠ Required check before this ships:** render all eight lanes at `Term` on
each of the four axes and confirm a teacher can name the subject of a band from
the stripe alone with the label gutter covered. This is the one claim in the
proposal that a contrast number cannot settle — it is a discrimination question,
not a legibility one, and it should be answered by looking.

**(c) `--tl-band-h` drops from 42 → 40 px (fine) and 52 → 48 px (coarse)** to
fund the mark row, keeping the desktop lane growth to +9 % and the coarse lane
flat.

### 4.8 Where the assessment data comes from

**This is a new field and must not be hand-waved.** `TimelineDot`
(`lib/plan-timeline/types.ts:83-96`) carries `lessonId · unitId · title · slot ·
state · fork · stackIndex · stackSize` — **no assessment**. `Lesson.assessment`
exists (formative / summative / null) and the dot builder in
`lib/plan-timeline/dots.ts` already reads the lesson objects it projects from,
so this is a **projection widening, not a query widening** — one field on
`TimelineDot`, set where `state` is set (`dots.ts:132-143`).

Two things to get right:

- **`data-late` is derived, not stored.** The red ring's condition is exactly
  today's `missed` predicate — *day has passed **and** not marked taught* —
  which `dots.ts:126-141` already computes, deliberately under-claiming when the
  reference date is `null` so a lesson is never wrongly accused. Reuse that
  predicate; do not write a second one.
- **State composition is explicit.** `fill` is chosen by
  `assessment ? "assessment" : taught ? "taught" : "ahead"`; `ring` is set
  independently by the late predicate. They are two attributes (`data-fill`,
  `data-late`), never one enum — an enum is what forces the "which wins?"
  question the user's decision exists to avoid.

---

## 5. Drag — the ghost must state its consequence before release

**Locked:** dragging a unit always moves its lessons, **including already-taught
ones**, and the ghost must say so **before** the pointer is released.

### 5.1 Why this is a design requirement, not a nicety

Today the consequence arrives *after* the write. In Team mode that write is
team-wide, and §2 forbids a confirm dialog — the pink caution glow is the safety
mechanism, deliberately. So the **only** place a teacher can learn what a drag
will do before it does it is the ghost. That makes the ghost's content
load-bearing.

It also fixes a measured defect: QA #7 found the ghost invisible for any band
wider than the visible track (a 6-week band is 1380 px inside a 768 px track, so
at Δ = 0 the ghost sits exactly under the band and at Δ = 1 week its displaced
edge is off-screen — nothing visibly changes across a 230 px drag).

### 5.2 The ghost

```
        ┌ leading edge of the drag, clamped to the visible track ┐
        ▼
   ┌───────────────────────────────────────────────┐
   │ ╭──────────────────────────────────────────╮  │
   │ │ Wk 2–7 → Wk 3–8                          │  │  ← chip, --shadow-popover
   │ │ moves 12 lessons · re-dates 4 already    │  │
   │ │ taught                                   │  │
   │ ╰──────────────────────────────────────────╯  │
   │ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │  ← existing dashed ghost
   │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
   │   ○    ○    ○     ○    ○    ○    ○           │  ← marks preview at their
   └───────────────────────────────────────────────┘     new columns (the cue
                                                          that survives clipping)
```

- **Anchor the chip to the ghost's leading edge in the drag direction, clamped
  to the visible track**, so a band wider than the viewport still shows it.
- **Preview the marks at their new columns** in the mark row. Because marks are
  distributed across the whole range rather than only at its edges, *something*
  is always on screen — this is the displacement cue that survives clipping, and
  it is only available because of §4.4's sub-row.
- Copy: `"Wk 2–7 → Wk 3–8 · moves 12 lessons"`, plus
  `" · re-dates 4 already taught"` **only when that count is non-zero**. Say the
  number, not the risk — "re-dates 4 already taught" is a fact a teacher can
  act on; "warning" is not.
- Reduced motion: the chip appears and updates instantly; no transition.

### 5.3 Keyboard parity — required, and easy to miss

`Shift+←/→` commits **directly, with no preview session**. So a keyboard user
would get the write with no consequence statement at all. Required: an
`aria-live="polite"` region announcing the same sentence after each nudge. §4's
full-keyboard-navigation rule makes this non-optional, not a bonus.

### 5.4 Designing for the carve-out either way

If the pending decision lands as "taught lessons stay put", the design absorbs
it with **no structural change**:

- the chip's second clause becomes `" · 4 already-taught lessons stay where they
  are"`;
- `band.lessonsOutside` becomes non-zero after such a drag, and the existing
  `.bandOutside` "N out" pill — which already exists and is already explained in
  the band tooltip — carries it. Its wording should state the **cause**:
  *"3 already-taught lessons stayed where they were."*

Under the current decision (everything moves), `lessonsOutside` should normally
be **0** after a drag, and the pill's meaning shifts from "the drag created
this" to "someone dated a lesson outside these weeks deliberately". Either way
the pill survives and its copy is the only thing that changes.

---

## 6. Today, and the drawer that opens itself

### 6.1 Today as a soft tinted column

**Locked:** a full-height gentle band behind the lanes, not a rule on top of
them — because it serves the **first** priority.

```
   ┌──────────────┬──────────────────────╥─────────────────────────┐
   │              │ SEP                  ║ OCT                     │
   │              │  1  2  3  4  5  6  7 ║ 8  9 10 11 12 13 14     │
   │              │                      ║[9]  ← accent pill (kept)│
   ├──────────────┼──────────────────────╫─────────────────────────┤
   │ ● Math       │ ▐ Place Value…       ║      ▐ Fractions…       │
   │              │   ●   ●   ●          ║ ●    ●   ●              │
   ├──────────────┼──────────────────────╫─────────────────────────┤
   │ ● Reading    │ ▐ Readers' Workshop  ║                         │
   └──────────────┴──────────────────────╫─────────────────────────┘
                                          ╨
                        soft tint behind everything (z-1)
                        + a 1px edge pair that survives being crossed
```

- **The tint** paints at `z-index: 1` — behind the lanes, above the card
  surface: `color-mix(in oklab, var(--chrome-accent) 10%, transparent)`.
- **The edges** are the part that must survive: a band is an opaque-ish fill, so
  a tint *behind* it is invisible wherever a band crosses. Give the column a
  1 px left/right pair at a stronger alpha, painted above the bands. The handoff
  does exactly this for its current-week band
  (`border-left/right: 1px solid rgba(59,108,246,.18)`), and it is why the
  column reads as a column rather than as two disconnected slivers.
- **`.todayLine`'s 2 px rule is retired.** The column replaces it. The accent
  pill on the day number in the sticky axis header stays — it is the marker that
  survives vertical scroll.
- **`--chrome-accent` is theme-remapped**, and that is correct here: today is
  chrome, not a status, so it should follow the theme (unlike §4.3's status
  fills, which must not).
- **Over photo:** the card is `background: var(--surface)`, measured opaque on
  both axes run. So the tint composites against a resolved surface, not the
  photograph. **⚠ Unverified on Photo-Bright/Photo-Dim — must be measured.**
- **Measurement required, and it is not a contrast ratio.** A decorative
  background band has no WCAG text floor, so scoring it at 4.5:1 would be
  measuring the wrong thing. Measure instead: (a) the **perceptual delta**
  between the today column and its neighbour on all four axes, and (b) the
  **edge pair against the band it crosses**, which *is* a boundary and does owe
  3:1.

**And one thing the column cannot do alone.** The decision says today must be
findable *from anywhere on the canvas*, including when it is scrolled past. A
tint cannot do that. Add a **"Jump to today"** control in the existing
scroll-arrow group, appearing only when today's column is outside the scroller's
visible range. `TimelineCanvas.tsx:102-111` already scrolls to today on mount
(`el.scrollLeft = todaySlot * colWidth - clientWidth * 0.45`, instant, correctly
not animated) — this is the same maths, exposed as a control. It is the single
cheapest thing on this list that serves priority 1.

*(Related, and worth chasing separately: the tone-matrix audit's B9 records that
on 2026-07-31 the app opens on Week 48 · Jun 28 2026 — **outside** the mock
academic year, whose Week 1 is Aug 3. When today is out of range there is no
today column to draw, and every "where are we" affordance on this surface has
nothing to say. A `fix-current-week` lane appears active.)*

### 6.2 The drawer opens itself — and the threshold matters

**Locked:** opens when something is urgent, closed when the plan is clean,
remembers the teacher's choice.

**⚠ There is no `severity` field.** `AttentionItem`
(`lib/plan-timeline/library.ts:106-116`) carries `kind · subject · title ·
detail · target` and the ordering is a `rank` map (`:368-375`):
`missed 0 · thin 1 · off_calendar 2 · off_axis_unit 3 · outside_range 4 ·
unscheduled_unit 5`. So the rule must be written on `kind`, or a `severity`
field must be added. Prefer adding it — a rule that hard-codes a kind list will
drift the moment a seventh kind lands.

**The rule:**

```
urgentCount = items.filter(i => severityOf(i.kind) === "urgent").length
            = items.filter(i => i.kind === "missed").length      // today

open on load  ⟺  urgentCount > 0
                 AND NOT dismissedFor(currentUrgentSignature)
when auto-opened, the active tab is "attention", never "units"
when urgentCount === 0, closed, and the bar reads "Nothing needs attention"
```

- **`missed` only.** Not the total. Today's fixture has **203 `thin` items**;
  under any count-based rule the drawer would open on every visit, forever, and
  the auto-open would become the thing teachers learn to close. The measurement
  in §1.3(b) is what makes this concrete rather than theoretical.
- **`dismissedFor(signature)`** persists under the repo's `mycurricula:user:*`
  convention. The signature is derived from the **set of urgent target ids**, so
  closing the drawer on a known problem is respected indefinitely, while a
  **new** missed lesson re-opens it exactly once. A plain boolean would either
  nag forever or go silent forever; neither is the decision.
- The handoff already defaults its tab this way (`ph-drawer.jsx:54`:
  `issues.length ? 'attn' : 'library'`), so this is consistent with the source.
- **Preserve** the drawer's current collapsed-state correctness (§2.8) — the
  body absent from the DOM, `aria-controls` omitted while closed. Auto-open must
  not become "always rendered, sometimes hidden".
- ⚠ **`aria-expanded` must not change without the teacher acting** *during* a
  session. Opening on load is fine; opening under a focused teacher's hands is
  not. Auto-open applies **on mount only**.

Also fold in the locked drawer work: **drag-to-resize + double-click-to-collapse**
(QA #12 — both measured absent; height is fixed at `max-height: 46vh`). The
handoff's model is `min 150px, max round(innerHeight * 0.62)`, inverted axis,
`ph-drawer.jsx:76-79`. ⚠ Note the handoff applies it as `minHeight`, so its
drawer **pushes the page** rather than scrolling internally — do not port that
part; this drawer should stay a bounded, internally-scrolling panel.

---

## 7. Findings — 12, ranked by severity then user impact

| ID | Area | Finding | Evidence | Tier | Sev | Teacher impact |
|---|---|---|---|---|---|---|
| **RSP-01** | responsive | **86 % of the phone viewport is chrome before the first lane** (698.3 / 812; toolbar alone 234 px). 66 % on tablet, 62 % on desktop. §4 caps sticky chrome at ~30 % on phone. | probe, all tiers, both tones; `phone-night-01-default.png` | Observed | **Critical** | On a phone the plan is entirely below the fold; the surface cannot do its first job at all. |
| **UX-01** | IA / control | **The page promises a year and no zoom setting can show one.** 5.5 weeks at the default (Observed); ~10 weeks at the 24 px floor (Inferred from Observed `--tl-col-floor: 24px`, `--tl-lbl: 190px`, 1440 viewport) — the slider's two ends differ by 1.4× in the useful direction. | `desktop-wash-01-default.png`; `timeline.module.css:31,33`; subtitle `PlanTimeline.tsx:707`. Year column count **not measured** (§0.3.5) | Inferred | **High** | "Where are we" cannot be answered at year scale — the top-priority job. |
| **A11Y-01** | contrast | **The lesson mark fails WCAG 1.4.11 against the surface it sits on: 1.48 : 1.** 13 of 15 subject solids are below 3:1 against their own band tint; 10 of 15 against `--surface`. | canvas-resolved in-page, Wash 1440; independently matches tone-matrix K2 (`--subj-1 = 1.70`) | Observed | **High** | The most repeated control on the page is at the edge of invisibility on light tone. |
| **VIS-01** | hierarchy | **Colour states "subject" five times per row**, so four are decoration (§4). The dot's `border: 2.5px solid var(--c)` repeats what the lane, swatch, band fill, band border and band text already said. **A divergence from the handoff**, which colours the mark by *status* with a `--faint` default (`ph-v2.css:564-572`). | `timeline.module.css:603`, `:441-443`, `:380`; handoff cited | Observed | **High** | The canvas reads as noise; nothing draws the eye because everything does. |
| **VIS-02** | hierarchy | **203 of 310 marks (65 %) are `needs_work`**, drawn as a dashed 2.5 px ring on a 14 px circle — which reads as a loading spinner, and which cannot function as an alarm at 65 % prevalence. | probe `dotStatusCounts`, all tiers; `desktop-wash-01-default.png` ≈ x 990 | Observed | **High** | The one state meant to demand attention is the visual background. |
| **UX-02** | geometry | **Bands and marks share one strip**, which causes three defects at once: the grip covers the last dot (15/310 untappable), the band's leading edge is un-grabbable (first band-owned pixel 48 px in), and `.band` needs a `padding-left: calc(var(--tl-col)/2 + 10px)` hack to stop reading *"ace Value & Decimals"*. | `:453` (the hack, self-documented); QA #4; grip count **Inferred** — not reproduced here (`gripVsLastDot` sampled 0, Personal mode) | Inferred | **Medium** | Re-pacing a unit — job 3 — misfires from the most natural grab point, and 15 lessons cannot be opened by touch. |
| **VIS-03** | content | **A permanent instruction sentence is the largest text object in the toolbar**, wrapping to two lines on phone, describing the lowest-priority job. §4's dismissible onboarding-tooltip system exists for exactly this, and the band tooltips already say it better. | `PlanTimeline.tsx:626-630`; `phone-night-01-default.png` | Observed | **Medium** | Permanent chrome cost for a one-time lesson; on phone it displaces the plan. |
| **VIS-04** | typography | **No type hierarchy: 8 hard-coded sizes between 8.5 and 13.5 px**, none from `--t-*` or `.ds-*`. 8.5 px (`.dayWkd`, `:260`) is below §7's 13 px UI floor *and* is a measured 3.16 : 1 contrast failure for text. Spacing uses 3 / 6 / 9 / 10 / 14 px — §7 forbids 6, 10 and 14 inside cards/rows by name. | `timeline.module.css` (22 raw sizes, zero `--s*`); tone-matrix B3/B11 | Observed | **Medium** | Eight sizes inside a 5 px range produce fuzz, not hierarchy — the "almost-aligned" feel §7 names. |
| **VIS-05** | alignment | **The subject label does not line up with its own bar.** `.laneLabel` centres vertically (`:365-378`); `.bandWrap` is top-anchored (`:431-435`). The drift grows with lane height. | `phone-night-01-default.png`: band ≈ y 1810, "Math" ≈ y 1877 | Observed | **Medium** | The row's two halves read as unrelated — worst on the tiers where lanes are tallest. |
| **VIS-06** | rhythm | **~22 px of dead space below every band** on desktop (75 px lane, 42 px band at 11 px top) — the canvas manages to read sparse and crowded at once. | probe `laneRowHeight` 75 vs `--tl-band-h` 42 + `--tl-band-top` 11 | Observed | **Medium** | Fewer subjects on screen than the space allows, for no gain. |
| **A11Y-02** | affordance | **A five-key legend is required to read the mark** — the tell that the mark is not self-describing — **and it renders only in the Lessons lens** while the same marks render in both. | `TimelineLegend.tsx:19-43`; `PlanTimeline.tsx:638`; probe `legendItems: 0` in Units lens | Observed | **Low** | In the default lens the marks have no key at all. |
| **CODE-01** | tokens | **Two dead token references.** `var(--on-accent, #fff)` (`:272`) — `--on-accent` does not exist anywhere in the repo; it works only via the fallback, and the real token is `--on-solid`. `var(--warn-line, var(--border))` (`:925`) — `--warn-line` does not exist, so the drawer count chip's border is silently `--border`, not a warn-hued edge. | token inventory; matches tone-matrix I3 | Observed | **Low** | Invisible today; a trap for the next person who assumes the token resolves. |

**Nothing was dropped to meet the cap.** Three further items are deliberately
**not** filed here because they belong to other reports or other lanes:
the `.cp-root button` reset stripping the scroll arrows to 5 px and the grip's
`ew-resize` cursor (**QA #1**, already filed and partly in flight); the 8.5 px
weekday's contrast failure (**tone-matrix B3/B11**); and the subject→slot map
drift between the docs and `app/tokens.css:247-285` for *writing · spelling ·
ufli · sel*, which is out of this surface's scope (→ §10).

---

## 8. LOOK improvements — prioritised, each tied to a teacher's task

Ordered by (visible improvement ÷ risk). Every value is an existing token.

| # | Change | Task it serves | Tokens | Fixes | Type |
|---|---|---|---|---|---|
| **L1** | **Solid, status-carrying, subject-free marks** — a closed set: fill `--progress` / `--ink-400` / `--warn`, ring `--danger`. **No subject tint, outline or shade anywhere, at any zoom, in any state.** No borders, no dashes, no white holes punched in the band. Disc drops to 10 / 12 px. | *"what is the state of my year?"* — one palette of four, read the same on every lane | `--progress` `--ink-400` `--warn` `--danger` | VIS-01 VIS-02 A11Y-01 | **Correction** |
| **L2** | **Retire the instruction sentence and `Reset`; three segmented trays on one row.** | *"where are we"* — give the row back to the plan | — | VIS-03 RSP-01 | Correction |
| **L3** | **Today becomes a soft tinted column with a surviving edge pair**, plus "Jump to today" when it is scrolled off. | *"where are we"* — priority 1, currently the faintest mark | `--chrome-accent` | §1.1 | Correction |
| **L4** | **Band: 4 px subject stripe on a near-white fill**, text `--ink-900`, plus a full-solid lane swatch. With the dots subject-free, this pair carries subject **alone** — and the stripe is measurably 5× more separable than the tint it replaces (§4.7). Matches §2's card grammar. | *"whose row is this, and what unit is running?"* | `--c` `--surface` `--border` `--ink-900` | VIS-01 | Correction |
| **L5** | **Marks move to their own sub-row.** Lane rebalances to 8 / band / 4 / mark-row / 8. | *"tap the right thing"* — and it is what makes L1's contrast contract finite | `--tl-*` | UX-02 VIS-06 | Correction |
| **L6** | **Type onto the scale.** `.ds-label` for the `Fit` label and month row, `--small` (13 px) for band names and pills, `--t-12` floor for the axis. Delete the 8.5 / 9.5 / 10.5 / 11.5 / 12.5 / 13.5 px values. Spacing onto `--s1…--s6`. | legibility everywhere; §7 compliance | `--t-*` `.ds-*` `--s*` | VIS-04 | Correction |
| **L7** | **Align the subject label to its band's top**, not the lane's centre. | *"read a row as one thing"* | — | VIS-05 | Correction |
| **L8** | **Legend → two rows, at the canvas foot, in both lenses, and dismissible** (`tooltipId: tl-legend`, collapsing to an `ⓘ`). Only "yellow = assessment" is genuinely arbitrary once the mark is subject-free. | first-week learning, then it stops costing attention | — | A11Y-02 | Correction |
| **L9** | **Lesson titles on the bars at `Week`** — the handoff's pill, at 13 px, **left-aligned to its column** so pills cannot collide. | *"what exactly is happening that day?"* | `--small` `--r-12` | locked feature | **Enhancement** |

## 9. FUNCTION improvements — prioritised

| # | Change | Task it serves | Fixes | Type |
|---|---|---|---|---|
| **F1** | **`Fit: Year · Term · Week`** replaces the slider — `ToggleGroup`, `data-span`, no `Reset`. | *"show me the horizon I am working at"* | UX-01 | **Correction** |
| **F2** | **`Year` fits the year** — one column = one school week, no marks, month labels only. | *"what is the shape of the whole plan?"* | UX-01 | Correction |
| **F3** | **The drag ghost states its consequence before release** — `"Wk 2–7 → Wk 3–8 · moves 12 lessons · re-dates 4 already taught"`, anchored to the leading edge and clamped to the track; marks preview at their new columns. | *"what will this actually do to my team's plan?"* | QA #7 | Correction |
| **F4** | **Keyboard parity for F3** — `aria-live` announcing the same sentence after each `Shift+←/→`. | keyboard users get the same warning | §4 rule | Correction |
| **F5** | **Drawer auto-opens on `missed` only**, remembers dismissal per urgent-signature, defaults to the Attention tab. | *"what needs my attention"* — priority 2, surfaced without being asked | §1.1 | Correction |
| **F6** | **"Jump to today"** in the scroll-arrow group when today is off-screen. | *"where are we"* from anywhere | §1.1 | Correction |
| **F7** | **Drawer drag-resize + double-click-collapse**, bounded and internally scrolling. | *"give me more room to triage"* | QA #12 | locked feature |
| **F8** | **Assessment as a first-class dot state** — one field on `TimelineDot`, composing on the fill channel while `data-late` composes on the ring. | *"when are the assessments, and did they happen?"* | new | **Enhancement** |
| **F9** | **Restrict `Timeline│List` to the Units lens** and confirm Density's placement. | one control, one job | QA #5, #10 | locked feature |

---

## 10. Open questions, and follow-ups outside this scope

**Needs a decision before building:**

1. **Missed ordinary lessons: red ring (unified) or red fill (literal)?** §4.1.
   Recommendation: unified.
2. **`needs_work` merging into "ahead" on the canvas** — §4.2. It removes a
   distinction that is on screen today, even though the accessible name keeps
   it.
3. **Assessment yellow vs the app's existing `--assess-summative` purple /
   formative-green convention** — §4.3. Recommendation: yellow on the timeline,
   kind carried by the `Week` pill and the accessible name.
4. **Fork tier drawn only at `Week`** — §4.6.
5. **`Year` via week columns (Route A) or px presets (Route B)** — §3.4.
   Recommendation: A, and B is not worth shipping alone.

**Follow-up observations, deliberately not pursued:**

- ~~**The subject→slot map in `app/tokens.css:247-285` disagrees with CLAUDE.md §4
  and BUILD_STANDARD §7 for four subjects** — *writing* is `--subj-2` (docs say
  `--subj-5`), *spelling* `--subj-5` (docs: `--subj-9`), *ufli* `--subj-3`
  (docs: `--subj-2`), *sel* `--subj-9` (docs: `--subj-12`).~~ **RESOLVED
  2026-08-01 (task #50).** It was code-vs-handoff drift, not doc drift: the
  mockup's own `source/data.js`, `V2 Framework.md` §4 and CLAUDE.md §4 all agreed
  with each other, and `tokens.css` plus `DEFAULT_SUBJECT_MAPPING` were the sole
  divergent sources. Both now carry the handoff map, and
  `tests/subject-slot-map.test.ts` pins them against it — including the
  `-light/-deep/-bright` companions, which is what catches a half-applied
  re-point.
- **`--warn-ink` exists and is the text-safe honey**; `--warn` is documented as a
  fill. Several surfaces may be using the wrong one.
- **The timeline uses raw `rgb()` shadows** (`:461`, `:503`) where `--sh-md` /
  `--sh-lg` exist, and **zero `--s*` spacing tokens**. Re-expressing the surface
  in tokens is a net *reduction* in hard-codes.
- **`ToggleGroup` has no `Home`/`End` key handling** and no `lg` size.
- **The "prominent" `ToggleGroup` variant is not what its comment says** — both
  variants resolve to `--surface` + `--chrome-accent-deep`, differing only
  `--sh-xs` vs `--sh-sm`. The `Timeline│List` tray uses `variant="prominent"`
  expecting a filled chip it does not get.

---

## 11. Suggested sequence

Each step leaves the product working, and the cheap high-value work lands first.

| Wave | Contents | Why here |
|---|---|---|
| **1 — free wins** | L2 · L7 · L8 · CODE-01 · F6 | Pure deletion and alignment. No new geometry, no new colour, no data change. Fixes the worst of RSP-01 on its own. |
| **2 — the control** | F1 (+ L6 for the toolbar) | `data-span` lands with `term` and `week` only; `year` maps to today's floor. Ships a usable three-stop control without touching the axis. |
| **3 — the mark** | L1 · L4 · F8 · L3 | The look change the user asked for. **Gated on the four-axis contrast measurement in §4.3.** |
| **4 — the geometry** | L5 · L9 | The sub-row, and the titles it makes room for. Resolves UX-02 by construction. Prototype the adjacency read first. |
| **5 — the year** | F2 | Week columns. Needs the slot→week projection and a drag re-verification. |
| **6 — authoring + triage** | F3 · F4 · F5 · F7 · F9 | Priority-3 work, last, once 1 and 2 are being served. |

**Validation each wave must pass:** render at 375 / 768 / 1440 on **all four**
axes (Wash · Photo-Dim · Photo-Bright · Night) behind the `[data-mounted]` gate
with positive controls in the same evaluation; canvas-resolved contrast for
every new mark against the resolved `--surface`, floor 3:1; a real
`elementFromPoint` hit-test on a genuinely coarse context (`pointer:coarse` true
**and** `pointer:fine` false) for every target ≥44 px; `scrollTo(400,0)` leaving
`scrollX` at 0; and **Night re-measured to confirm it has not regressed** — it is
the healthiest axis in the app and it is the easiest thing here to break.

---

## 12. Instruments added

| File | What it does |
|---|---|
| `scripts/probe-design-timeline.mjs` | Renders `/planner` at 375 / 768 / 1440 on Wash + Night; measures chrome depth, lane/band/axis geometry, dot anatomy and status distribution, and canvas-resolves subject-solid contrast against both `--surface` and the band tint. Seeds **both** halves of the theme state and **abandons any case whose resolved `data-tone` disagrees with its label.** Aborts every `teacher_preferences` request. |
| `scripts/probe-design-timeline-span.mjs` | One question: how much of the year fits. Reports axis columns, resolved column px, visible track width, and the column width that *would* fit the year. **⚠ Written but NOT YET SUCCESSFUL** — two runs died on the claude-login hop under concurrent load. It produced no readings and none are quoted. Re-run on a quiet server; it is a ~90 s job. |

Evidence: `docs/screenshots/design-timeline/` (`results.json` + PNGs, including
the kept `*-GATEFAIL.png` from the voided run).

**Known gap in both:** the tone gate checks `data-tone` but not `data-theme`
(§0.2). Tighten it before reuse.
