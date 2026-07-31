# Live QA audit — /daily Post pill · /weekly paper add menu · /catch-up row meta

**Date:** 2026-07-31 · **Scope:** the three surfaces landed 7.31 · **Report only — nothing was fixed, nothing was committed.**

> Snapshot disclaimer (CLAUDE.md §8): this is a dated snapshot. Verify against
> current code before treating any finding as open.

---

## Precondition — which tree was measured

Re-verified independently at the start of this run (not taken on trust from the brief):

```
git rev-parse --short HEAD              → d283b18          ✓ matches expectation
git diff HEAD --stat -- components lib app
  components/hub-v2/timeline/TimelineZoom.tsx     | 19 +++-
  components/hub-v2/timeline/timeline.module.css  | 88 ++++++---
```

**Label: working tree — DIRTY, but clean on every file under test.**

The two dirty files belong to a sibling lane's Plan-timeline work. They are
**not** my surfaces, and I confirmed they are not reachable from them:

```
grep -rl "hub-v2/timeline" components/{day-v2,weekly,catchup-v2,planner-v2,list} app/{daily,weekly,catch-up}
  → no matches
```

So the three surfaces below rendered from **committed d283b18 code**. The
features under test are confirmed present in the commit itself, not just the
working tree:

```
git show HEAD:components/day-v2/DayA.tsx        | grep -c "post?lesson"   → 1
git show HEAD:components/catchup-v2/CatchUpModal.tsx | grep -c CatchUpRowMeta → 2
git show HEAD:components/planner-v2/atoms.module.css | grep -c menuEnd    → 1
```

### Environment

| | |
|---|---|
| Dev server | `http://localhost:3014` — **already running; I did not start a second one** (verified answering: `307 → /login?next=/daily`, 0.018s) |
| Browser | Playwright `chromium.launch({ channel: "chrome" })` — never Edge |
| Data path | **Mock planner.** `/rest/v1/` requests observed: **6** (section B), **0** (section C). `pending` / `error` data states are unreachable locally and are **not** claimed either way. |
| Widths | 375 · 560 · 768 · 950 · 1440 |
| Phone emulation | `isMobile: true` + `hasTouch: true` + `deviceScaleFactor: 3` together. Verified genuine in-page before any touch verdict: `pointer:coarse=true`, `any-pointer:fine=false`, `dpr=3`. No touch verdict was issued from a hybrid context. |

### Instruments

`scripts/probe-qa-day-week.mjs` (pre-existing, from the aborted attempt) plus three
written for this run: `probe-qa-verify.mjs`, `probe-qa-daily-post.mjs`,
`probe-qa-post-click.mjs`. All untracked, none committed.

---

## Read this first — five results that looked like bugs and are not

This run produced more instrument failures than product failures. Each was
caught by a control and re-measured; none is a defect. Recording them so they
are not re-filed later from the raw logs.

| Apparent result | What it actually was |
|---|---|
| `/catch-up` — "rows=474 metas=237", i.e. half the rows missing a meta line | `[class*="row"]` matched **both** `.row` and the nested `.rowMain`. Exact class-token count: **237 rows / 237 metas, every row carrying exactly one meta line.** Not a bug. |
| `/catch-up` — action pills measure "43×43", 1px under contract | Re-measured unrounded: **44.00 × 44.00**, computed `44px`, `box-sizing: border-box`. The 43 came from measuring *during the modal's entry animation*. Not a bug. |
| `/weekly@768` — "add triggers not hydrated after 3 min" | At ≤900px the page **is** the List view (see BUG 2). The probe's fallback control clicked "List" — while already in List — so it could not move, and the probe mis-attributed it to hydration. Mis-attribution. |
| `/weekly` — "one quick-add click creates exactly one lesson: FAIL, delta [0,0,0,0,0]" — *and the two PASSes beside it* | The counter (`[data-lesson-card], article, li`) read **0 even after a confirmed real add**. A counter that cannot see one card cannot tell one from two, so the FAIL **and** both neighbouring "no double-create" PASSes were void. Re-run with a gated oracle — see "Working well". |
| `/daily` glass — "Post pill does not navigate" | Produced by a synthetic `el.click()`. A real user gesture at the element's centre navigates correctly in all three frames. Not a bug. |

The lesson generalises: on this surface an absence assertion without a control
that has been *seen to move* fails open.

---

## BUGS

### 1 · MAJOR — the paper Week add menu is clipped at the last column below ~1010px

**What I saw.** At a **950px** viewport the last day column's add menu overhangs
the week's scroll container by **90px** and runs **37px past the right edge of
the viewport**. The first column at the same width is clean (`clipL=0 clipR=0`).
At 1440 both edges are clean.

```
V4@950 — first column menu not clipped   PASS  clipL=0  clipR=0   offR=0
V4@950 — last  column menu not clipped   FAIL  clipL=0  clipR=90  offR=37
V4@950 — GATE B: probe can SEE a clip    PASS  (control reproduces a clip at this width)
```

**Why the zeros elsewhere are trustworthy.** Gate B re-centres the menu to its
pre-fix geometry and confirms the instrument reproduces a clip at *both* widths
(39px at 1440, and a clip at 950). So the passing measurements are earned.

**Root cause.** `align="end"` pins the menu to the **last column's** right edge
(`components/weekly/WeekColumns.tsx:673-679` → `.menuEnd { right: 0 }` at
`components/planner-v2/atoms.module.css:170-174`). But the day track scrolls
*horizontally inside* `.scroll` as soon as its intrinsic width exceeds the pane:
`grid-template-columns: repeat(5, minmax(176px, 1fr))` + 4×10px gaps + 40px
padding ≈ **920px**, against a pane of ~822px at a 950px viewport. The last
column's right edge is then itself outside the visible box, so pinning to it
puts the menu off-screen.

**Blast radius is wider than one width.** The grid only renders above 900px
(BUG 2), so on a 5-day week this is the **901–1010px band**. But per CLAUDE.md
the school week is configurable and must never be assumed 5-day — each extra
day adds ~186px of intrinsic width, so a **6- or 7-day week reproduces this at
desktop widths too** (a 7-day week overflows a 1440px viewport's ~1312px pane).

**Repro.** `/weekly`, paper frame, viewport 950px, click `+Add` on the **last**
day column.
**Screenshot.** `docs/screenshots/qa-day-week/V-week-950-menu-last.png`
**Suspected:** `components/planner-v2/atoms.module.css:170-174`;
`components/weekly/WeekColumns.tsx:673-679`
**Suggested fix.** Anchor to the **visible scroll box**, not the column — the
menu needs viewport/container collision detection (a fixed-position layer whose
left is clamped into `.scroll`'s rect), rather than a static `right: 0`. A
static pin cannot be correct while the element it pins to can itself be
off-screen.

---

### 2 · MAJOR — /weekly has no per-day add affordance at all on phone or tablet

**What I saw.** The 768px canvas census shows the day grid present for ~6s and
then gone for the rest of the run — `C5/5 C5/5 -0/0 -0/0 -0/0 …`. That is not a
crash: `WeeklyShell` forces the List view at ≤900px, and the SSR-rendered grid
is swapped out once `matchMedia` resolves post-mount.

`components/list/WeeklyList.tsx` contains **no add affordance whatsoever** —
grepping it for `AddMenu|onQuickAdd|New lesson|Add` returns nothing. The
affordance exists only in the grid frames (`WeekColumns`, `WeekA`), both of
which are suppressed below 901px.

**Consequence.** The feature shipped today is **desktop-only**. On phone (375)
and tablet (768) a teacher cannot add a lesson to a day from `/weekly` at all.
This is the §4 responsive contract's "every primary control reachable at all
three tiers", not a cosmetic layout question.

**Repro.** `/weekly` at 375 or 768 — no `+Add` control on any day.
**Screenshot.** `docs/screenshots/qa-day-week/B-week-768-nothydrated.png`
**Suspected:** `components/weekly/WeeklyShell.tsx:530` (`NARROW_MQ = "(max-width: 900px)"`), `:1314`; `components/list/WeeklyList.tsx`
**Suggested fix.** Give `WeeklyList` a per-day add row reusing the same
`onQuickAdd` path. The narrow→List fallback is sound; losing the *capability*
with the layout is the defect.

> Note: this also means **the 768px verification requested in the brief is not
> performable on the Grid** — there is no grid at 768 to clip. I substituted
> 950px, the narrowest width at which the grid still renders, which is the worst
> real clipping case — and it is where BUG 1 surfaced.

---

### 3 · MINOR — the catch-up scope chips miss the 44px touch target

**What I saw.** "Today" / "This week" measure **~40px** tall at 375, 560 and 768
— inside a CSS block explicitly headed *"Touch tiers — ≥44px primary targets"*.
The `.action` pills in that same block set `height: 44px` and do clear it; the
chips only bump padding.

Arithmetic confirms it is real, not the animation artifact that inflated the
earlier 43×43 reading: `11px + 11px padding + 16.8px line-height + 2px border ≈ 40.8px`.

**Repro.** `/catch-up` at ≤900px or any coarse pointer; measure the scope chips.
**Screenshot.** `docs/screenshots/qa-day-week/C-catchup-375.png`
**Suspected:** `components/catchup-v2/CatchUpModal.module.css:432-435`
**Suggested fix.** Add `min-height: 44px` to `.chip.chip` in that media block —
matching how `.action.action` solves it three lines below, rather than guessing
a padding value.

---

### 4 · MINOR — the day add menu cannot be dismissed by keyboard or touch

**What I saw.** The menu closes only via `onMouseLeave` or a second click on the
trigger. There is no Escape handler, no outside-click dismissal, no `role="menu"`,
and no focus management.

A keyboard user who opens it with Enter has no Escape route. A touch user never
generates `mouseleave` at all, so on phone/tablet the only exit is re-tapping the
exact trigger.

**Repro.** `/weekly` paper ≥1010px, focus a `+Add` trigger, press Enter, then
press Escape — the menu stays open.
**Suspected:** `components/planner-v2/atoms.tsx:261-285`
**Suggested fix.** Add an Escape keydown handler and an outside-pointerdown
listener; give the container `role="menu"` and its rows `role="menuitem"`.

---

### 5 · LOW — quick-add fails silently when the subject catalog has not settled

`handleQuickAdd` returns with no user feedback when no subject is resolvable:

```ts
if (!subject) return; // catalog not settled yet (backend hydrate)
```

Ten lines below, the genuine failure path *does* set a visible message. The
click is consumed and nothing happens — the shape of defect that reads to a
teacher as "the button is broken".

Unreachable on the mock path (so **not observed live**, reported from code);
reachable on the Supabase path during the 11–16s hydrate window.

**Suspected:** `components/weekly/WeekColumns.tsx:285`
**Suggested fix.** Reuse the existing `setErrorDay`/`setErrorMsg` path.

---

## IMPROVEMENTS

### 6 · The catch-up modal renders 237 rows / 1187 buttons unvirtualized
Every width rendered the full backlog in one modal. It is correct and it does not
overflow, but it is a lot of DOM for a triage surface, and the oldest entries read
"93 days late". Worth virtualizing or paging before real data arrives.
*(Local is mock, so treat the backlog size itself as fixture shape, not product truth.)*

### 7 · The Post / Plan / Teach pill tooltips carry no `tooltipId`
Per CLAUDE.md §4 every onboarding tooltip takes a stable `tooltipId` so a teacher
can dismiss it, unless it is on the always-on `required: true` list. "Post" is not
high-consequence, so it should be dismissible. Its siblings have the same gap, so
this is a pattern-level cleanup rather than a regression in today's work.
*Suspected:* `components/day-v2/DayA.tsx:199`, `DayB.tsx:295`, `DayC.tsx:272`

### 8 · The account avatar is the LCP element and lacks `priority`
```
Image with src "https://lh3.googleusercontent.com/a/…" was detected as the
Largest Contentful Paint (LCP). Please add the "priority" property.
```
Genuine app output (Next.js), reproduced on `/catch-up`.

### 9 · Dev-only build warning on every route
`Module not found: Can't resolve 'canvas' in node_modules/linkedom/commonjs`.
Noise rather than breakage, but it is on every console in every run.

---

## What is working well — with the evidence

- **The edge-pin fix genuinely holds at 1440, and the zeros are earned.** First
  and last column menus both `clipL=0 clipR=0 offL=0 offR=0` — *and* Gate B
  reproduced the historical **39px** clip by re-centring the menu, proving the
  instrument could have failed. This is the check the brief flagged as
  regression-prone; at 1440 it has not regressed.
- **The quick-add sync guard does its job, verified with an oracle proven able
  to move.** After discovering the original counter was blind, I gated on a
  counter that goes 0→1 on a known-good single add, then measured: one click →
  **+1**; a **same-tick double click** → **+1**. `quickAddInFlightRef`
  (`WeekColumns.tsx:283`) is holding the line, including the same-tick case that
  `addingDay` state alone could not catch.
- **The Post pill is correct in all three Day frames.** Present in each; order
  matches the handoff exactly — glass `Plan · Post · Teach`, paper
  `Open in Teach · Lesson plan · Post`, color `Plan · Post · Teach`; and it
  routes to a real, distinct lesson id: `/post?lesson=lesson-ms9f2y89-1`
  (glass), `lesson-ms9f3w6x-1` (paper), `lesson-ms9f4n4j-1` (color). Verified
  with **real user gestures** and with `__reactFiber$` + a live `onClick` prop
  asserted **on the exact node clicked** — not a page-level hydration guess.
  6/6, zero console errors.
- **Post clears 44px on a real phone in every frame** — glass 54.6×44, paper and
  color 76.9×45.6 — and the emulation was verified genuine before the verdict
  was issued.
- **The catch-up meta line is correct at every width.** 237/237 rows carry
  exactly one meta line; **zero** `"0 days late"` chips; **zero** zero-count
  resource chips; the "why not" notes render (*"Fire drill ate 15 min — pushed
  drafting to Wed"*); and **0 of 1187** action pills were pushed outside the
  modal at 375, 560, 768 or 1440. The meta row never pushes the actions off.
- **No page-level horizontal scroll anywhere**, measured on the real scrolling
  container (`#main-content`) rather than the document, plus a per-element
  right-edge sweep: 375, 560, 768, 950, 1440 across all three surfaces.

---

## What I did NOT measure — do not read silence as coverage

1. **The known `/catch-up` React hydration mismatch did not reproduce.** Across
   four loads (375/560/768/1440) plus the verification run, the only console
   output was the `linkedom/canvas` build warning and the LCP notice. **I am not
   claiming it is fixed.** My contexts pre-seed `mycurricula:onboarding` in
   localStorage and stub `teacher_preferences` to `[]` — either could mask a
   mismatch. It needs a clean-profile load to confirm.
2. **`/weekly` at 768 for the menu-clip question — untestable, not skipped.** No
   grid exists at that width (BUG 2). Substituted 950px.
3. **The add-event form's double-submit is NOT established.** The original probe
   reported it created "exactly one entry" using the blind counter, so that PASS
   is void. I re-verified the **quick-add** path with a gated oracle but did not
   re-run the **event-form submit** with it. The form opens correctly (3 fields,
   `role="dialog"`); its create-count is unverified.
4. **`/daily?lesson=` (known, already filed) — not re-filed, but it affected
   this run.** The day pane opens on an out-of-year **"Week 48"** while the mock
   fixtures sit elsewhere, so I could not deep-link to a fixture lesson and had
   to seed through the UI instead. It did not block the Post verification.
5. **`color` frame at 1440 in the section-A sweep lost its hydration gate**
   (contention from concurrent probes; control failed, verdicts withheld rather
   than passed). Covered instead by the dedicated Post-click probe, which
   verified color at 1440 cleanly.
6. **Not covered at all:** keyboard-only traversal of any surface, screen-reader
   output, print templates, Night or any non-Clear theme, the Wash background,
   `/catch-up` action *behaviour* (I measured the pills' geometry and presence,
   not what Mark taught / Reschedule / Bump actually do), and the `pending` /
   `error` data states (unreachable on the mock path).

---

## Triage note

Nothing here was fixed and nothing was committed, per the brief.

**BUG 1** and **BUG 2** both land on `/weekly`'s per-day add — the affordance
this wave shipped — and both are responsive-contract failures on a touched
surface, so by CLAUDE.md §4b they should be resolved or explicitly deferred
before this build is called done. BUGS 3–5 are small and safely deferrable.

The four probe scripts (`probe-qa-verify.mjs`, `probe-qa-daily-post.mjs`,
`probe-qa-post-click.mjs`, and the pre-existing `probe-qa-day-week.mjs`) are
untracked working artifacts.
