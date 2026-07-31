# Day · Week · Year — handoff conformance + improvement audit

**Date:** 2026-07-31 · **Scope:** `/daily`, `/weekly`, `/year` × all three frames
**Method:** source reading only. No browser was opened. Nothing below is tagged
**Observed** unless it is a literal value or line in source.

> Snapshot disclaimer (CLAUDE.md §8): this is a dated audit. Verify against current
> code before treating any finding as open.

## Precondition

```
git rev-parse --short HEAD          → 6ba6ae8
git diff HEAD --stat -- components lib app   → empty (clean)
```

Every code citation below describes **HEAD `6ba6ae8`**, not a dirty working tree.

### Handoff authority chain (latest wins)

`7.21.26 Design Handoff Update` > `7.2.26 Design Handoff Updated Surfaces` >
`6.24.26 design_handoff_v2_site`.

**⚠ The 7.21 package's `source-home/New v2 Site Design.bundled.html` is STALE.** It
contains no `ViewsA`, no `ViewsC`, and no `ViewSet` string at all (title: "New Site
Design"). The live 7.21 entry is `V2 Site Design.html` → `source-home/New v2 Site
Design.html`, which links `pastel-frame.css` (`:26`) and loads `app.jsx` +
`views-{shared,a,b,c}.jsx` (`:45-49`). **For these three surfaces the 7.21 ground
truth is `source-home/*.jsx`, not that bundle.** Anyone citing the 7.21 bundle for
Day/Week/Year is citing a stale artifact. *(Observed.)*

---

## 0. The root cause — 7.21 remapped frame→view and the remap was never ported

Six of the nine cells below trace to one line.

```js
// 7.2   source/app.jsx:492
const ViewSet = { A:window.ViewsA, B:window.ViewsB, C:window.ViewsC }[effVersion];

// 7.21  source-home/app.jsx:522   ← LATEST, authoritative
const ViewSet = { A:window.ViewsA, B:window.ViewsC, C:window.ViewsC }[effVersion];
```

With the deliberate comment immediately above it, `7.21 source-home/app.jsx:519-521`:

> `/* Bright (B) adopts the subject-led views (tinted week cells, color day panel, Year constellation) — the old "Color" views on Bright's white paper. Pastel (C) reskins the same views via pastel-frame.css. */`

Consequences under 7.21:

1. **`ViewsB` is retired.** `DayB` / `WeekB` / `YearB` are still *loaded*
   (`New v2 Site Design.html:48`) but never *selected*.
2. **Frame B (paper/Bright) renders `DayC` / `WeekC` / `YearC`** on Bright's white paper.
3. **Frame C is PASTEL**, not "color-forward" — `7.21 source-home/pastel-frame.css:1-6`:
   `data-version="C"` reskin, canvas `#f1f5f9`, white cards, teal `--accent:#007595`,
   Source Sans 3, photo ghosted to `.38` opacity, and theme washes **explicitly
   neutralised** (`.theme-tint{opacity:0 !important}`, `:22`). Same layouts as B; skin only.

**Shipped instead:** the *7.2* mapping, implemented consistently — `paper→B`, `color→C`
on Day and Week; `paper→TimelineYear`, `color→YearC` on Year.

**Repo trace of the remap:** exactly one mention, five words inside a compound bullet —
`docs/7.23.26-unified-v2-plan.md:267-268` (*"frames = Glass / Bright(subject-led) /
Pastel"*). No wave, no owner, no gap entry. `agent_shared_log.md:2779` logged Pastel as
a **vocabulary** trap ("frames = glass|paper|color; 'bright' = dim level"), which
mis-diagnoses it: it is not a naming mismatch for an existing frame, it is an unbuilt
skin plus a layout remap. Zero occurrences of `pastel` in `lib/ app/ components/`
outside unrelated widget-tint tokens. *(All Observed.)*

---

## (A) The nine cells — surface × frame

| | **Glass (A)** | **Paper (B)** | **Colour (C)** |
|---|---|---|---|
| **Day** | ✅ **Fine.** `DayA.tsx` faithful — timeline rows, finish toggle, Plan/Post/Teach split, dashed "Add to \<day\>" + 3-option menu (`DayA.tsx:217-237`). | ⚠ Renders `DayB` (`DayViewV2.tsx:71`) — 7.2-correct, 7.21 wants `DayC`. `DayB` itself faithful minus `Room` (`DayB.tsx:252-260` ships Standard/Time/Status). | ⚠ `DayC.tsx` faithful (learning target `:236`, flow strip `:35,:239`). Needs the **pastel skin** — absent. |
| **Week** | ✅ **Fine.** `WeekA` = period×day grid (`WeeklyShell.tsx:1312`). | ⚠ `WeekColumns` (`WeeklyShell.tsx:1305`) — 7.2-correct, 7.21 wants `WeekC`. Also the **only** frame carrying "Open in editor" (`weekly-lesson-card.tsx:1613`). | ⚠ `WeekC` faithful. Needs the pastel skin — absent. |
| **Year** | ✅ **Fine.** `YearA.tsx` — month scale (`:141-151`), lane glyph + name + `{pct}% complete` (`:172`), chip fill = **real** taught/total (`:186-203`), better than the handoff's mock fraction. | ❌ **The gap.** `TimelineYear` — the pre-v2 surface (`YearShell.tsx:190-191`). See §(B1). | ⚠ `YearC.tsx` faithful (link line `:101`, ✓ disc `:129`, partial percent `:131`). Needs the pastel skin — absent. |

*(Frame routers: `components/day-v2/DayViewV2.tsx:71-72`; `components/weekly/WeeklyShell.tsx:1305,1312`; `components/year-v2/YearShell.tsx:190-196`. All Observed.)*

### One-line answer on Day and Week

**Yes — Day and Week have the same shape of problem, one degree milder.** Both route
`paper` to a component the *latest* design does not specify (`DayB`, `WeekColumns`), and
both route `color` to a component that is correct in layout but missing its specified
skin. The difference from Year is that `DayB`/`WeekColumns` **were** specified — by the
7.2 handoff, which 7.21 superseded — whereas `TimelineYear` was never specified by any
handoff, in any frame. Day/Week is "built to a superseded spec"; Year is "not built".

---

## (B) Conformance gaps — ranked, sized

### B1 · `/year` on paper is the pre-v2 surface — **L** — *Observed*

**Handoff says:** a v2 Year in every frame.
- 7.2: `YearB`, a **progress list** — `7.2 source/views-b.jsx:90-124` + `views.css:263-273`.
  Per subject: `SubjGlyph` + full name + `Now: {current unit}` (`:103`), a segmented
  `.vb-track2` (one flex segment per unit — solid at 100%, `color-mix(… 55%, white)`
  partial, `var(--hairline)` unstarted, `:108-110`), wrapped unit pills (`:113-114`),
  right-aligned `{pct}%` (`:117`). **34 lines of JSX, 11 CSS rules.**
- 7.21: `YearC`, the constellation (§0).

**Code says:** `components/year-v2/YearShell.tsx:190-191` — `frame === "paper" ?
<TimelineYear /> : …`. No `YearB` exists anywhere (`components/year-v2/` holds only
`YearA.tsx`, `YearC.tsx`, `YearShell.tsx` + explorer/drawer/workspace files).

**No handoff puts a subjects sidebar, a standards-coverage panel, year filters, or a
week→lesson drill on the Year page, in any frame.** A grep for
`sidebar|coverage|breadcrumb|legend|today|statcard|filter` across all three 7.21 view
files returns **zero hits** (the sole `filter` hit is `day.lessons.filter(isDone)` in
`views-a.jsx:14`). The only "Standards coverage" string in the entire 7.21 home source
is inside the unit drill-down modal — `7.21 source-home/unit-explorer.jsx:302` — i.e.
**per-unit, not per-year**.

The justification at `YearShell.tsx:182-189` is factually accurate about the code and is
an honest in-repo product judgement — but it is **a repo decision, not a handoff
ruling**. See §(B1a) for what the now-approved swap costs.

### B1a · What breaks when paper routes to the v2 Year — *Observed*

The user has ruled that all three frames render the v2 design, and `build-year-b` is
recreating the Frame-B progress list. **The handoff does not provide homes for
`TimelineYear`'s capabilities. It simply does not have them.** Following it literally
**is** a capability regression for paper users, and that trade should be shown to the
user rather than discovered post-build.

| `TimelineYear` capability | Code | Home in handoff Frame-B? |
|---|---|---|
| Subjects sidebar | `TimelineYear.tsx:50, :997` | **None.** Zero `sidebar` hits in any handoff view file. |
| Standards-coverage panel + filter/coverage loop | `:58, :65, :447, :1087` | **None at year scope.** Only analogue is per-UNIT, inside the explorer (`unit-explorer.jsx:302`). |
| Year filters popover + grid/list toggle | `:60-63, :958`; `:387-388` | **None.** The handoff Year has no filters at all, in any frame. |
| Stat cards | `:49, :989` | **None at year scope.** The 7.21 workspace Overview has 6 stat cards — **per unit**, not per year. |
| Breadcrumb | `:51, :1009` | **None.** No drill to walk back up from. |
| subject→unit→week→lesson drill + `YearLessonPane` | `:52, :1058`; `:576` | **Replaced, not rehomed.** The handoff's only Year affordance is `UE.Chip` → the unit workspace modal; weeks/lessons live in the workspace's Lessons tab. |
| **"Open in Daily"** — Year's only hand-off to editing | `YearLessonPane.tsx:297-305` | **None.** No equivalent anywhere in the handoff Year. |
| Today line + month axis + list fallback | `TodayMarker` via `RoadmapView.tsx:490`, `SubjectCalendar.tsx:269`; `TimelineYear.tsx:90-91, :387-388` | **None.** No today marker in any handoff Year frame; `YearB` has no month axis at all (only `YearA` has one, and it is decorative — see §C3). |
| Status legend | `StatusFilterBar`, `StatusGlyph` | **None.** |

**The structural reading:** the handoff deliberately makes Year a *pure index* and moves
everything else into the unit-workspace modal. That is coherent as a design — but it
relocates capability from **year scope** to **unit scope**. A teacher asking "which
standards am I not covering this year?" can answer it today on paper and will not be
able to answer it after the swap, in any frame. *(Structural reading: **Inferred**. Every
row of the table: **Observed**.)*

**Recommended framing for the user:** the swap is two decisions, not one — (i) should
Year *look* like the v2 design (settled: yes), and (ii) should the year-scope
sidebar/coverage/filters/drill exist at all (unsettled). If (ii) is "yes", they need a
home in the v2 Year for **every** frame, not a paper-only carve-out — the current state
is an accidental frame asymmetry where a third of teachers get a different *product*.

### B2 · Frame B should render the subject-led views — **M** — *Observed*

`7.21 source-home/app.jsx:522` (§0) vs `DayViewV2.tsx:71` / `WeeklyShell.tsx:1305`.
Router-only in principle (~3 lines), but it retires three shipped components and
**removes information on Week** — see §(C4). Price that in.

### B3 · The Pastel skin for frame C — **M** — *Observed*

`7.21 source-home/pastel-frame.css` (§0) vs **absent** — zero `pastel` hits in
`lib/ app/ components/`. **NOT a migration** (see §D).

### B4 · "Open in editor" reachability — **M** — *Observed*

§9a (`7.2 design-system/V2 Framework.md:400-436`): in View mode a lesson's popup menu →
Plan opens the lesson editor. Shipped at exactly one callsite —
`components/weekly/weekly-lesson-card.tsx:1613` — rendered only by `WeekColumns`, i.e.
**/weekly, paper frame, expanded card, double-click only** (probe lane burned on this:
`agent_shared_log.md:5058-5063`). `WeekA` and `WeekC` have no equivalent; Day has none on
any frame. The *destination* is correct — the centered popup was deliberately retired for
the unified workspace (`components/year-v2/UnitExplorer.tsx:27`), matching 7.21 §1. It is
the *reachability* that is one-ninth complete.

### B5 · `YearB` progress list — **S–M** — *Observed*

Only if 7.2 governs Year rather than 7.21. My reading is that it does not (§0). Listed so
the decision is explicit rather than implicit. **NOTE:** `build-year-b` is building this,
i.e. the 7.2 target, not the 7.21 one. That is a defensible call — `YearB` is strictly
closer to what paper users have — but it should be a stated choice, not an accident.

---

## (C) IMPROVEMENT findings

Kept strictly separate from (B). These are places the shipped surface — or the handoff
itself — is weaker than it should be.

### C1 · **Correction** — `/year` has no loading or error state on any frame — **S–M**
*Observed (source) · Unverified (live)*

Another live instance of the bug class fixed for `/daily` at `bf3329f`.

- `components/year-v2/YearShell.tsx:167-168` reads `useTheme()` and `usePlanner()` only —
  **no `usePlannerDataState`**. Nor do `YearA.tsx`, `YearC.tsx`, or
  `components/year/TimelineYear.tsx:274`. Grep `dataState|PlannerEmpty|Skeleton` across
  those four files: **zero hits**.
- During hydrate, `buildLanes` computes `pct = total > 0 ? Math.round(done/total*100) : 0`
  (`YearShell.tsx:157-159`), so every lane paints **"0% complete"** (`YearA.tsx:172`) and
  **"No units planned yet."** (`YearA.tsx:177-181`). `YearC.tsx:82` does the same.
- `/weekly` is protected (`WeeklyShell.tsx:1291-1304`: `WeekGridSkeleton` on pending,
  `PlannerEmpty` on error). `/daily` is protected (`components/day-v2/DayEmptyState.tsx`
  + the pure `dayEmptyKind` in `day-empty.ts`). **`/year` was never wired.**

The repo documents this exact hazard one directory down —
`components/year-v2/drawer/InsightsPanel.tsx:64-83`: *"11–16s, during which `lessons` is
legitimately empty — with no `dataState` … MUST pass `usePlannerDataState()` through."*
**The drawer inside the Year modal is protected; the Year page around it is not.**

`/year` is the surface that answers "where am I in the plan?". Telling a teacher **0% of
everything** for 11–16 seconds is the most alarming lie the app can tell.

**Unverified live by construction:** with `NEXT_PUBLIC_PLANNER_USE_SUPABASE` unset,
hydration pins to `"ready"` and `pending`/`error` are unreachable — the vacuous-pass trap
logged at `agent_shared_log.md:5690-5700`. Any probe must run flag-ON or report SKIP.

### C2 · **Correction** — "am I behind?" is unanswerable, and the blocker is the forking model — **L** — *Observed*

The most important improvement finding here, and bigger than a Year redesign.

- `taught_at` **exists** on the read shape: `lib/planner/supabase-source.ts:437, 472, 506`.
- It is **never written**: `lib/planner/lesson-track-b.ts:22-25` (*"`taught_at` is
  READ-ONLY in B2"*), `:77` (*"`taughtAt` is DELIBERATELY NOT here"*).
- The reason is architectural — `lib/planner/source.ts:65-67`: *"writing `taught_at` on a
  pristine master lesson would fork it."*
- Consequence, shipped as a documented refusal: `lib/unit-insights.ts:26-27` — *"NO pace /
  projected finish / ahead-behind / overdue"*, restated at `:238-239`.

So the datum the Year view most needs — **when was this actually taught** — is blocked by
the fork boundary, not by schema. **This is not a migration** (§D). It needs a design
decision: a per-teacher teaching event recording completion **without forking the master
lesson** (a side table keyed `(teacher, lesson)` is the obvious shape). Until it exists,
every "% complete" in the app measures *catalogue coverage*, never *pace*.

### C3 · **Enhancement** — the Year month scale is decorative; units carry no time, and there is no today marker — **M** — *Observed*

- `YearA.tsx:74` states it: *"Decorative: it's the ambient timeline the lanes sit under,
  not an interactive axis."*
- `YearA.module.css:145` makes every chip `flex: 1 1 0` — **equal width regardless of unit
  duration** — under a `repeat(var(--month-count,11), 1fr)` month grid (`:58-62`) they do
  not align to.
- Grep `today|nowRing` across `YearA.tsx`, `YearC.tsx`, `YearA.module.css`: **zero hits.**

A month ruler above unaligned equal-width chips invites a wrong reading — a teacher will
infer "Unit 3 runs through November" from geometry encoding nothing. `TodayMarker` +
real week-axis projection (`TimelineYear.tsx:90-91`) already do this correctly on paper —
**and are on the list to be removed by `build-year-b`.** Either align chips to the axis or
drop the month row.

### C4 · **Correction (context, not work)** — on Week and Year, PAPER is the RICHEST frame — *Observed*

Load-bearing, because the user is on paper comparing against glass mockups.

- **Week.** Paper's card (`components/weekly/weekly-lesson-card.tsx`, 2254 lines) carries
  subject + **time** + title band, a 2-line preview, standards badge, resources,
  completion check, fork cues, move handle, ⋯ menu, and expands into
  objective/directions/notes/tasks/resources/standards (`:6-13`, `:132-151`). Glass's
  `WeekA` tile is **title + subject name + unit chip + fork cues and nothing else**
  (`WeekA.tsx:331-370`) — no time, no preview, no standard, no resource count. `WeekC`
  adds only a start time (`WeekC.tsx:489`).
- **Year.** Paper has today marker, filters, coverage, sidebar; glass/colour have none.

**"Paper looks different from the mockup" and "paper is behind" are not the same
statement.** On Week and Year, moving paper to the 7.21 subject-led views *removes*
information a teacher currently has. On Day it does not. This is a real cost inside gap
**B2**, and it compounds **B1a**.

### C5 · **Enhancement** — the handoff's own hover preview is unbuilt, and it is the missing scan layer — **S–M** — *Observed*

`7.21 source-home/views-shared.jsx:115-135` wraps **every** week cell (all three frames)
in `LessonHover`, surfacing **title · objective · standard · "N resources"** on hover.
Grep across `components/` for `LessonHover|lhov|HoverPreview|hovercard`: **zero hits.**
`WeekA` offers only `title="Double-click to open the full lesson"` (`:353`).

On glass/colour Week this is the only affordance letting a teacher answer "what is this
lesson, and am I ready to teach it" without a click that opens a side panel. Both a
conformance gap and the cheapest fix for C4's asymmetry.

### C6 · **Enhancement** — no "not covered" signal reaches Day, Week, or Year — **S** — *Observed*

`setLessonStatus(id, "not_done")` is written from all three Day frames (`DayA.tsx:179`,
`DayB.tsx:269`, `DayC.tsx:254`), but grep for `catch.?up|notCovered|not_done` across
`components/week-v2/`, `YearA.tsx`, `YearC.tsx` returns **zero reads**. The signal is
captured and then only surfaces on a separate `/catch-up` route.

A not-covered count on the Week header and Year lanes is the cheapest honest partial
answer to "am I behind" — and unlike C2 it needs **no new data at all**.

### C7 · **Experiment** — "% complete" rewards under-planning — **S** — *Inferred*

`pct = done / total` over *catalogued* lessons (`YearShell.tsx:155-159` — Observed). A
subject whose spring units aren't written yet reports a **higher** percentage than one
planned end to end. *Arithmetic: Observed. That teachers misread it: Inferred.* Pair with
a "units planned vs. year length" figure, or reframe. Overlaps C2 — solve C2 first.

---

## (D) Data-model gaps needing a migration

**None of the conformance work in §(B) requires a migration.** Stated positively so a
build lane does not stall waiting on one.

| Item | Verdict |
|---|---|
| **Pastel frame (B3)** | **NO migration.** 7.21 maps B and C to the *same* `ViewsC` layouts and separates them by CSS alone (`pastel-frame.css` keys on `data-version="C"`). So `lib/theme.tsx:7`'s `frame ∈ {glass, paper, color}` is unchanged and the 5-surface ALLOWLIST LOCKSTEP — including the `teacher_preferences` `CHECK` constraint — is **untouched**. Ship it as a stylesheet. *(Observed.)* |
| **Frame-B remap (B2), YearB (B5), Year states (C1), hover card (C5), not-covered badge (C6)** | **NO migration.** Pure UI/read-path. *(Observed.)* |
| **`taught_at` / pacing (C2)** | **NO migration — the column already exists** (`supabase-source.ts:437,472,506`). It is a **write-path design problem**: writing it forks the master lesson (`source.ts:65-67`). Needs a fork-safe per-teacher teaching-event shape. This is the real blocker behind every "am I behind" feature. *(Observed.)* |
| **`room`** | No column on `Lesson` (`lib/types.ts`). Handoff `DayC` renders `sel.room` (`7.21 views-c.jsx:51`); we omit it (`DayB.tsx:252-260`). Either drop the chip or add one nullable column — additive, not worth scheduling alone. *(Observed.)* |
| **`Lesson.time`** | No DB column (`lib/types.ts`; `agent_shared_log.md:1941-1942`). Week-edit's cross-period drop **re-times** a lesson (`WeekEditBoard.tsx:14,18`), so a time-only write can spuriously fork. Known trap, now on a *shipped* drag path — deserves a re-check. *(Observed.)* |
| **"Hero theme"** — OUT OF SCOPE, flagged | `docs/7.23.26-unified-v2-plan.md:269`. A new `data-theme` value **WOULD** hit the `teacher_preferences` CHECK constraint and the full 5-surface lockstep. **This is the migration hiding in the same one-line bullet as Pastel.** *(Observed.)* |

---

## (E) Deliberately dropped — do NOT count as gaps

1. **Unit pace / projected-finish / vs-last-year stats** — refused on principle, "no dead
   placeholders", `components/year-v2/UnitExplorer.tsx:6-15`. 7.21 re-specifies them as 6
   stat cards; flagged as an open *product* decision at `agent_shared_log.md:1919-1924`.
2. **Phone Day/Week EDIT** — view-only by product decision 2026-07-10,
   `WeeklyShell.tsx:623-627`, with a render-layer guard so a persisted flag can't strand a
   phone user. Handoff §9a specifies a phone Day-edit strip; knowing divergence.
3. **The centered lesson-editor popup** — retired for the unified workspace
   (`UnitExplorer.tsx:27`); matches 7.21 §1.
4. **`Room`** on Day meta — no DB column; dropped rather than faked.
5. **`TimelineYear`'s dead `frame==="color"` branch** — deliberately left
   (`agent_shared_log.md:943`).
6. **postMessage bridge + the split `pw-data.js` dataset** — prototype artifacts,
   do-not-port (`docs/7.23.26-unified-v2-plan.md:277-283`).
7. **Mockup's fabricated Year tabs** (Catch-Up/Pacing/Assessment/Stats) and **Materials +
   Stats lesson tabs** — previously ruled, not re-derived here.

---

## (F) What works and must not regress

- **View ↔ Edit (§9a) is built, and built well.** `lib/edit-mode-state.tsx` is
  bundle-exact down to the `cc_editmode` key, capitalised view names, and the force-reset
  rule (`:39-46`, citing bundle `B:11978/B:11986`). `WeekEditBoard.tsx` (1116 lines) ships
  the aligned/stacked toggle (`:16-19`, `usePbLayout` `:129`), cross-period re-timing
  (`:14,:18`), FLIP glide (`:24-25,:313`), collapse-while-dragging (`:332`), and one
  `moveLesson` per drop for a single undo step (`:24`). `DayEditSplit.tsx` implements the
  two-pane resizable split.
  - **⚠ Do not "fix" Day edit to the handoff's file-header comment.**
    `7.21 source-home/planbook-edit.jsx:5` calls Day edit a *"single stacked column (no
    rail)"*, but its own `DayEdit` (`:521-598`) **is** the two-pane resizable split
    (`de-split` / `de-left` / `de-divider` drag / `cc_deLeftW`). Framework §9a and the JSX
    agree; only the comment lies. **Our build matches the JSX.** *(Observed.)*
- **Pop-in overlay (7.21 §4) is genuinely shipped.** `UnitChip` → `openUnitWorkspace`
  renders in `DayA/DayB/DayC`, `WeekA/WeekC`, `WeekColumns`, `ListRow`, `DayEditSplit`;
  `YearShell.tsx:173` and `TimelineYear.tsx` both open it. Unit clicks open the workspace
  with no navigation, on every frame of all three surfaces. *(Observed.)*
- **`YearA` progress is REAL, not the handoff's mock fraction** — `YearA.tsx:9`,
  `:186-203` derive taught/total from live planner data via `unitProgress`. Better than
  the handoff. Preserve it in any `YearB` build. *(Observed.)*
- **`/daily` and `/weekly` loading honesty** (`DayEmptyState`, `WeekGridSkeleton` +
  `PlannerEmpty`) — the pattern `/year` needs in C1. Do not regress it while adding it
  elsewhere. *(Observed.)*
- **Add-lesson affordances** are shipped and *extended past* the handoff — `DayB`/`DayC`
  carry add menus the handoff's `ViewsB`/`ViewsC` do not (`DayB.tsx:150`, `DayC.tsx:148`),
  and `WeekA` has a per-day non-instructional-event popover (`WeekA.tsx:316, :457-489`).
  *(Observed.)*

---

## Open / UNKNOWN

- **UNKNOWN** — whether the 7.21 B→`ViewsC` remap was ever reviewed here. One mention,
  five words, no owner (`docs/7.23.26-unified-v2-plan.md:267-268`).
- **Unverified** — every rendering claim in this document. Source reading only; and per C1
  the loading states are unreachable on a mock dev server regardless of instrumentation.
