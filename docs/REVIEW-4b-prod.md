# §4b live QA — the read-only subset, run against PRODUCTION

**I measured the deployed production build, not a local tree.** Every result
below comes from `https://mycurricula.app` in Chrome, against the real Beta
School G5 workspace and the real Supabase project. No dev server was involved.

---

## Finding 0 — the instrument was broken more often than the code

This is first because it is the most transferable thing in the report, and
because it is the fourth distinct instance today of a **verification mechanism**
being the defective part:

1. the contrast probe that inflated every ratio it reported;
2. `probe-uxa`, a `CLAUDE.md`-mandated gate that could not launch at all;
3. **Gate B's default control, whose verdict was `typeof before === "string"`** —
   a tautology, in the branch most checks use, in the mechanism specifically
   built to make a FAIL verdict impossible without a live control;
4. **`codeHas()`**, twice — answering "no" to a question it never asked when a
   path was mistyped, and answering "yes" to a regex that matched the file's own
   header comment four commits before the feature existed.

Every one of them was **silent and fail-open**. None produced an error. Three
produced comfortable-looking output that nobody would have queried: a green
ratio, a plausible ABSENT, a passing gate. Two had already manufactured a false
finding before being caught — Gate B invented `zero openers` on `/year` against
an opener sitting at `TimelineYear.tsx:611`, and the loose regex turned "B4.6
isn't deployed" into "B4.6 is deployed and broken".

The pattern that catches them is not more care. It is: **a gate you have not
seen fail is not evidence.** A `--selftest` helps only insofar as it covers the
path actually used — this harness had one, it passed, and it exercised the two
*named* Gate B controls while the *default* went untested. A selftest that skips
the default path tests the exception and certifies the rule.

**On this repo, budget as much scepticism for the instrument as for the code.**

---

## Precondition block

Run before a browser was opened, and repeated at the end.

| | |
|---|---|
| **Base** | `https://mycurricula.app` (production, Cloudflare Worker) |
| **Deployed build (the artifact)** | **`798e7e7`** |
| **Oracle sha (what `codeHas()` reads)** | **`798e7e7`** — passed explicitly as `--oracle-sha`, **not** local HEAD |
| **Local HEAD at run time** | `882f456` — **14 commits ahead of the artifact** |
| **Local tree** | dirty (263 files) — irrelevant here: nothing in this run reads the working tree |
| **Mode** | `--read-only` (enforced; the runner refuses a remote base without it) |
| **Build fingerprint** | 13 content-hashed chunks at start **and** at end, identical digest → **the build did not change underneath the run** |
| **Write attempts blocked by the guard** | **0** — nothing tried to mutate |
| **Broken probe paths** | none |
| **Wall-clock** | 2026-07-25 09:00:42Z → 09:04:49Z (pass 1), plus two targeted re-runs |
| **Evidence** | `docs/screenshots/4b-consolidated/` (screenshots + `results.json`) |

Three passes, because two probe defects were found mid-run and fixed (§ *Defects
I found in my own harness*). Pass 1 = all seven contexts. Pass 2 = contexts 1
and 4 with the widened tooltip/`/post` selectors. Pass 3 = context 1 with the
corrected `/post` oracle marker. Where they disagree, the later pass wins and
the reason is stated.

**Command:**

```bash
node scripts/probe-4b-consolidated.mjs \
  --base=https://mycurricula.app --read-only --oracle-sha=798e7e7
```

### Why the oracle is stated, and why it is not local HEAD

`codeHas()` decides **absent** ("the fix is not in the build I'm looking at")
versus **fail** ("it is in the build and it's broken"). That verdict is only
sound if the sha it reads is the sha the browser is rendering. Reading local
HEAD — 14 commits ahead — would have reported *"the fix is in the commit but the
page doesn't show it"* → **FAIL**, spuriously, on eight checks. Same failure as
measuring a dirty tree, one layer further out: **the oracle and the artifact
have to be the same thing.**

So the runner now takes the oracle as a **required explicit argument** and exits
2 rather than defaulting it:

```
REFUSING TO RUN: --base=https://mycurricula.app is remote, so --oracle-sha=<sha> is required.
```

### The pin is confirmed from the artifact side, not just from CI

CI's run list is *outside* the thing being measured, so it is an assumption, not
a measurement. B4.6 either wired a "Resource" add into the Resource Wall or it
didn't, and the browser can say which — so the run asserts agreement between the
two and treats a disagreement as an environment fault that invalidates every
`absent`/`fail` verdict, rather than tolerating it.

**Result — the pin holds, confirmed from both sides:**

```
ok  ORACLE PIN confirmed from the artifact side
    B4.6 absent in 798e7e7 and the live wall agrees (0 Resource button(s))
```

It earned its place immediately. On pass 2 it **fired a disagreement**, and the
fault was mine: `codeHas()` was looking for the bare string `"Resource"`, which
matches the file's own header comment ("one kanban column of the Resource
Wall") four commits *before* B4.6. So the oracle claimed the wiring was present,
the browser correctly showed no button, and the pin caught the contradiction and
marked the resulting FAIL untrustworthy — which is exactly what it is for. The
marker is now `<span>Resource</span>`, a string the fix introduced. **A
provenance check with a loose regex is a coin flip.**

---

## Environment finding — production was frozen 14 commits behind master

Not a bug in the app, and the most consequential thing in this report.

```
09:00  pending    882f456
09:00  cancelled  83f4e02
08:58  cancelled  ab06913
08:44  cancelled  125f57f   ← the fix for this very problem
08:40  cancelled  e7e169c
08:37  cancelled  0eeb3af
08:34  cancelled  7354c97
08:32  cancelled  6a6abf6
08:29  cancelled  e0eab58
08:26  cancelled  e9cc673
08:25  SUCCESS    798e7e7   ← what production served for the whole run
```

`.github/workflows/deploy.yml` was `concurrency: {group: deploy-<ref>,
cancel-in-progress: true}`. A deploy takes ~2.5 min; master was taking a push
every ~2–3 min. **Every push killed the running build**, so the pipeline could
only land a commit during a ≥3-minute gap in pushes — and there was none for
~20 minutes. Nine consecutive runs, one success.

**Nothing failed and nothing alerted.** A cancelled run is a grey tick, not a
red one, so the dashboard looked healthy while production quietly stopped
moving. `cancel-in-progress: true` is right for a preview branch and wrong for
an auto-deploying production branch: it converts push pressure into deploy
starvation, silently.

Already fixed on master in `125f57f` (`cancel-in-progress: false`). **One
correction so nobody over-reads it:** GitHub still cancels *pending* runs in a
concurrency group, keeping only the newest, so this does **not** deploy every
intermediate commit. What it fixes is convergence — production now catches up
to the latest commit instead of freezing. That is the right behaviour for a
deploy pipeline; just don't expect one deploy per commit.

**Consequence for this pass, stated plainly:** the last commit in production
with any *behavioural* content is `f76bcae` (B5.4/B5.5). `798e7e7`, `7232ebe`,
`c030e7e`, `e8f403f`, `c1190f7` are scripts and docs. Everything from `e9cc673`
onward — Year arrow scoping, the /post composer, the six hidden menu items, the
planner data layer, `any-pointer`, B5.7, ToggleGroup — **is not live**, and is
reported as `absent`, correctly.

---

## What I did not look at, and why

**These are `skipped`, not `absent`.** Absent is evidence about the artifact —
"the fix is not in this build". Skipped is the absence of evidence about *us*.
Rolling one up as the other would claim knowledge of a surface nobody looked at.

### Skipped by constraint

- **4.3 / 4.4 — ToggleGroup keyboard semantics + Kind field-preservation.**
  The defect under test *is* "the arrow key commits in transit". On a build
  where the fix is absent — and it is absent — **running the check performs the
  write it is looking for**, against a real unit assessment in a real school's
  curriculum. There is no way to observe this bug without causing it. 4.3.2 is
  out for the same reason: "re-selecting fires `onChange`" is a no-op only if the
  fix is present, which is the question.

- **`scripts/probe-b46-post-composer.mjs` — not run.** It clicks "Add note",
  which appends a card and persists it: a real write to a real school's Resource
  Wall. It was named in the read-only subset by mistake and caught before it ran.
  The /post seam is verified by a hand-rolled read-only check instead (§4.7).

### Not reachable read-only — the frame is not ours to choose

The plan called for glass / paper / colour contexts. On production **the server
resolves the frame from the teacher's stored preference and re-stamps it on
every response**, overriding both the `mc-theme-axes` cookie and the theme
localStorage keys the probe seeds. It resolved **paper**. Forcing it would mean
writing to their preferences — the one thing this pass must not do.

So the frame guard now **relabels and continues** instead of aborting: every
result carries the frame actually observed. **This run covers the paper frame
only.** Glass and colour are unverified here, and I would rather say that than
leave three contexts in the report wearing labels they did not earn.

### Weaker than it looks

- **4.10 touch targets** passed at 375 and 768 — but that does not exercise
  what `0eeb3af` fixes. The `pointer: coarse` → `any-pointer: coarse` widening
  targets **hybrid** devices (`pointer: fine` *and* `any-pointer: coarse`);
  Playwright's `isMobile` emulation matches `pointer: coarse`, so the un-widened
  guard still applied and the measurement says nothing about the hybrid case.
- **4.11 cross-device onboarding** is `[SIMULATED]`: only `localStorage` was
  cleared. A **fail** would be strong; the **pass** is weak, because the config
  could be re-seeded from sessionStorage / IndexedDB / a cookie / a server value
  I did not enumerate. Recorded as `unverified` alongside the pass, deliberately.

---

## Findings

### MAJOR — `/daily` tells a teacher there is nothing planned, for ~11 seconds, on the real production build

**Measured four times, in four independent browser contexts:**

| Context | Lie appears | Lessons resolve | Lie window |
|---|---|---|---|
| 2 · paper | 542 ms | 12 219 ms | **11 677 ms** |
| 3 · paper | 938 ms | 11 516 ms | **10 578 ms** |
| 7 · canary | 498 ms | 10 635 ms | **10 137 ms** |

A teacher opening `/daily` sees **"No lessons planned for this day"** within
~0.5 s and keeps seeing it for ~10–12 s before the day appears. There is **no
loading affordance** — no "Loading your plan…", no skeleton. The screen states a
falsehood confidently and then silently replaces it.

Three things make this the headline finding:

1. **It is not a dev-server artifact.** Earlier measurements of this were open to
   the objection that `next dev` hydrates in 11–16 s. This is a production
   build, sub-second first paint, and the window is essentially unchanged.
2. **It is not merely undeployed — it is unfixed.** `components/day-v2/DayA.tsx`
   has zero references to `usePlannerDataState` or `PlannerEmpty` at the
   deployed sha **and at local HEAD**. The loading-honesty work landed in
   `/weekly`, the catch-up surfaces and the unit drawer; `/daily`'s three day
   frames (`DayA`, `DayB`, `DayC`) were not included.
3. **The failure mode is the worst available one.** "No lessons planned" is
   indistinguishable from a genuinely empty day, so the honest empty state and
   the lie are the same pixels. A teacher checking their morning on a slow
   connection has no way to tell "still loading" from "you have nothing today".

**Suggested fix:** the same three-state treatment already applied elsewhere —
`usePlannerDataState` + `PlannerEmpty` in `DayA/DayB/DayC`, so loading, error
and genuinely-empty are three different screens. And keep the honest empty
state: replacing a lie with a permanent skeleton is not a fix either.

**Evidence:** `docs/screenshots/4b-consolidated/c2-daily-paper.png`,
`c3-daily-paper.png`, `c7-daily-paper.png` (all post-resolution),
`results.json`.

### MEDIUM — `/weekly` Schedule mode has no route to the unit workspace, and this one is open at HEAD too

`4.2 /weekly schedule has a workspace opener — zero openers`, with Gate B
(`week-viewmode`) passing in the same step, so the page was demonstrably live.

Code side, at **both** the deployed sha and local HEAD: no file under
`components/schedule/` contains a workspace opener — `grep -rn "unit
workspace\|UnitChip\|openUnitWorkspace" components/schedule/` is empty. The
List-view gap is `absent` (fixed at HEAD in `components/list/ListRow.tsx`, 2
hits, awaiting deploy); **Schedule is not fixed anywhere.**

**One caveat I will not paper over:** my check clicks a control labelled
"Schedule" and then counts openers. It does **not** assert that the Schedule
canvas was on screen when it counted. The code evidence is strong and the live
measurement is consistent with it, but the live half alone does not prove the
mode rendered. Treat this as "strong code evidence + consistent live result",
not as a clean two-sided result — and note that task #14 is currently marked
complete, which the code does not support for the Schedule third of it.

### MEDIUM — focusing the appearance gear hides five of the six primary nav destinations behind an opaque panel, on phone

Focusing the appearance gear on `/year` opens a 280×74 bubble that overlaps the
console nav (Day · Week · Year · Plan · Post · Teach):

| Viewport | Overlap with the nav | Bubble width |
|---|---|---|
| **375** | **83% of the nav's area** | 75% of the viewport |
| **768** | **53%** | 36% |
| 1440 | 18% | 19% |

The bubble is a fixed 280px at every tier, so the narrower the screen the more
of the nav it buries — the opposite of what you want on a phone.

Two things keep this MEDIUM rather than MAJOR, and both are measurements, not
assumptions:

- **Clicks still pass through.** The bubble is `pointer-events: none`
  (`components/ui/Tooltip.module.css:44`), and `elementFromPoint` at every nav
  item's centre returns the nav item, not the tooltip. Zero of six items are
  blocked. Nothing is unreachable.
- **The panel is near-opaque** — painted `rgba(10, 10, 12, 0.94)` — so this is
  not a translucency bug.

It is triggered by **keyboard focus**, which is documented behaviour
(`CLAUDE.md` §4: the tooltip surfaces on hover *and* keyboard focus). A teacher
tabbing through the top bar reproduces it; it is not an artefact of the probe
merely because the probe used `focus()`.

**The mechanism, settled by a clipped screenshot of the nav row itself.** The
full-page screenshots read ambiguously — it looks like the nav labels might be
bleeding *through* the bubble — and my first attempt to settle it numerically
failed: a min/max-luminance sample inside each nav item's box cannot separate
"the tooltip covers the label" from "the label paints over the tooltip", because
both produce a near-black minimum (the panel is `#0a0a0c`; the nav ink is nearly
as dark). It returned confident-looking numbers that meant nothing.

Clipping the screenshot to the nav row answers it in one look. **375, tooltip
closed:**

```
Day | Week | Year | Plan | Post | Teach
```

**375, tooltip focused:**

```
[ opaque black panel: "…pearance — theme, frame & background" ]  Teach
```

**Five of six destinations are gone.** At 768 it is three of six (Day, Week,
Year hidden; Plan, Post, Teach visible). `z-index: 9000` on the tooltip versus
`--z-topbar: 30` on the bar is exactly what the CSS predicted; the bleed-through
reading was wrong.

Evidence: `tooltip-legibility-375-closed.png` vs `tooltip-legibility-375-open.png`
(and the 768 pair). Those four images are the finding.

**Suggested fix (independent of the mechanism):** clamp the bubble to the
viewport (`max-width: min(280px, calc(100vw - 32px))`) and flip its placement
when the anchor sits above the nav, so the tip opens away from the primary
route switcher rather than across it. The fixed 280px is the root of the
size-inversion.

Evidence: `tooltip-occlusion.json`, `tooltip-legibility.json`,
`tooltip-legibility-{375,768}-{closed,open}.png`, `c5-touch-768.png`,
`c6-touch-375.png`. Probes: `scripts/probe-tooltip-occlusion.mjs`,
`scripts/probe-tooltip-legibility.mjs` (both read-only).

---

### Two things the run could not close, reported as open rather than guessed

- **`4.6` — the "Turn off these tips" dismissal is UNVERIFIED.** The bubble
  opens on hover (`4.6.1 pass`), but clicking the dismiss link times out at 30s
  in all three passes: `TimeoutError: locator.click`. Playwright times out that
  way when the element never becomes stable and actionable — consistent with the
  bubble closing as the pointer travels toward the link, and **also** consistent
  with the focus-open click-swallow defect that lane #9 is already chasing. I
  cannot separate the two from the outside, so the persist-after-reload
  assertion — the one that would catch "the dismiss link never actually
  dismissed" — never ran. It is `abort`, not `pass`.

- **`4.5` — "Delete from Team Curriculum" is reported `absent`, and the wording
  understates it.** The probe asks whether the string was removed. It was not:
  `components/lesson-card/context-menu.tsx` contains it **twice at the deployed
  sha and twice at local HEAD**. `6a6abf6` removed six *inert* items and did not
  touch this one. Separately — and this is the part that matters — the item is
  gated on `isMaster`, and **no host threads that prop**, so it has never
  rendered for anyone. The live half of the check is therefore not merely
  undeployed; it is untestable through the UI until a host passes the prop.

## Verified good on production

All gated: no `pass` below was recorded without a live control in the same step.

- **The B5.1 global unit-workspace host is solid on `/year` and `/daily`.**
  16/16 assertions, two open→close cycles each: **exactly one** `.ue-modal` and
  **one** `.ue-scrim` (never zero, never two), URL unchanged (it pops in rather
  than navigating), scroll lock applied on open and released on close, both
  cycles. Evidence: `c1-entry-year-paper.png`, `c1-entry-daily-paper.png`.
- **`/year` on the paper frame reaches the workspace.** The `⤢` opener
  (`data-year-unit-workspace`, `components/year/TimelineYear.tsx`) is present
  and functional — see the harness note below, because this is where my own
  tooling first claimed the opposite.
- **Touch targets pass by hit test** at 375 (10 controls) and 768 (13
  controls) — with the hybrid-device caveat above. Evidence: `c6-touch-375.png`,
  `c5-touch-768.png`.
- **Cross-device onboarding does not bounce.** A context with the same auth and
  **empty** client storage lands on `/weekly`, not `/onboarding` — the onboarded
  state is server-side, not a localStorage flag. (Weak pass; see caveats.)
- **`/post`'s composer seam is clean, and its empty state is honest.** The wall
  mounts, and **zero** `.cmp-modal` / `.cmp-scrim` leak onto it unbidden
  (absence-assertion, gated on a live control). Its empty state reads *"Nothing
  on this wall yet. Pick another wall, or add a section to start one"* — which
  is what `/daily` should be doing and isn't. Evidence: `c1-post-wall.png`.
- **No write reached the database.** The guard blocked 0 attempts, meaning
  nothing in the subset even tried to mutate. The primary control was check
  selection, not the guard.

---

## Defects I found in my own harness, before it could report

Three of these would have produced exactly the false findings this pass exists
to prevent. Two aborted starts were spent on them.

1. **Gate B's default control was vacuous *and* destructive.** Its verdict was
   `gateBOk = typeof before === "string"` — a tautology. The gate I described as
   structurally blocking FAIL verdicts was **unconditional for the default
   branch, which is the branch most checks use**. It also drove
   `goBack()/goForward()`, so the next assertion ran mid-navigation. It
   manufactured `FAIL 4.8 /year · paper has an opener — zero openers` against an
   opener that is plainly in the DOM at the deployed sha. Now: canvas has real
   rows **and** the tree takes focus — proves liveness, disturbs nothing.
2. **`codeHas()` answered "no" to a question it never asked.** `git show
   <sha>:<path>` is empty for a nonexistent path, coerced to `false` — so a
   **mistyped path reads as "the fix is not in this build"**, fail-open in the
   opposite direction from the absence-assertions. It had already fired on
   `components/weekly/WeeklyList.tsx`, which exists at **no commit**. Now
   distinguishes "missing at the oracle, present at HEAD" (real evidence) from
   "missing at both" (broken probe), and says so loudly.
3. **A call with no import.** `probe-4b-consolidated.mjs` used
   `authedStorageState` without importing it — shipped in `798e7e7`. It degrades
   into a caught `abort` at boot, so the run would have "completed" with zero
   verified results.
4. **`scripts/lib/auth.mjs` hijacked `--selftest` from every importer.** The
   selftest block was keyed on `process.argv.includes("--selftest")`, which fires
   at *import* and calls `process.exit()`. Every probe importing it printed a
   confident `SELFTEST PASS` for a test that never ran. Now guarded on being the
   entry module.
5. **My "8 probes migrated" claim in `docs/REVIEW-landed-4.md` was wrong — it is
   6.** `probe-4b-consolidated` called without importing (above), and
   **`probe-b46-post-composer.mjs` was never migrated**: it still builds the
   login URL inline (`:72`). It reads the token from the environment rather than
   hard-coding it, so it is **not a leak**, but its `page.goto` error path can
   surface the token the same way the others did. That file belongs to the
   composer lane — reported, not touched.
6. **Selectors written for one frame.** The tooltip check looked only for
   `[data-ue-drawer-toggle], [data-year-chip]` and aborted with "none found" on
   paper, the only frame a production account actually renders; the paper opener
   is `[data-year-unit-workspace]`. The `/post` readiness wait looked for
   `<section>`, which the wall renders **zero of until a preset is chosen** —
   a probe limitation wearing an outage's clothes. Both widened.
7. **A provenance regex that matched a comment.** `codeHas()` on `/post` looked
   for the bare string `"Resource"`, which appears in `Section.tsx`'s own header
   comment four commits before B4.6 landed. The oracle said "the fix is here",
   the browser said "no button", and the **ORACLE PIN caught the contradiction**
   and marked the resulting FAIL untrustworthy — which is what it exists for.
   Marker is now `<span>Resource</span>`. **A provenance check with a loose regex
   is a coin flip**, and a fail-open one: a comment mentioning the feature reads
   as the feature.
8. **A metric that could not answer its own question.** The tooltip-legibility
   probe sampled min/max luminance in a box where both competing hypotheses
   produce a near-black minimum, and returned confident-looking contrast ratios
   that mean nothing about legibility. The answer came from **clipping the
   screenshot to the nav row** — a picture of the thing in question beat a
   number about it. Worth remembering: when a metric can't distinguish the two
   explanations, more precision on that metric is wasted effort; change the
   instrument.

**The canary is not usable as designed in this run.** Context 7 re-runs 4.1 to
detect session degradation, and 4.1 genuinely fails on production — so its
"failure" carries no information about the session. Read the opposite way, it is
reassuring: three measurements of the same defect, 10.1 / 10.6 / 11.7 s, same
shape. **The results are not SUSPECT.** A canary has to be a check you expect to
pass; this one was chosen when we expected the fix to be deployed.

---

## Tally

Pass 1 (all seven contexts), which is the run of record for everything except
`/post` and the tooltip trigger:

```
50 verified: 43 pass, 7 fail
 6 unverified · 2 abort · 7 absent (not in build 798e7e7) · 1 skipped-by-constraint
build drift: none · write attempts blocked: 0 · broken probe paths: 0
```

Pass 3 (context 1, with the corrected `/post` oracle marker) supersedes pass 1's
`/post` and tooltip-trigger rows:

```
24 verified: 24 pass, 0 fail
 1 unverified · 1 abort (4.6 dismiss click) · 2 absent · 1 skipped-by-constraint
ORACLE PIN confirmed from the artifact side
```

The seven `fail` rows in pass 1 are **three distinct defects**, not seven: the
`/daily` lie and its missing loading affordance, each measured three times
independently, plus Schedule reachability.

### Net

| | |
|---|---|
| **Live defects on production** | 3 — `/daily`'s ~11 s false-empty (MAJOR), `/weekly` Schedule reachability (MEDIUM), tooltip nav occlusion (MEDIUM) |
| **Additional finding** | 1 — the appearance tooltip hides 5/6 nav destinations at 375, 3/6 at 768 (MEDIUM) |
| **Environment finding** | 1 — deploy starvation; production 14 commits behind, since fixed in `125f57f` |
| **Honest `absent`** | 7 — the fix is not in `798e7e7` |
| **Skipped by constraint** | 1 — the Kind data-loss check; running it performs the write it tests for |
| **Unverified / aborted** | the frame matrix (paper only, read-only cannot choose), tooltip dismissal, cross-device per-setting persistence |
| **Writes to production data** | **0** |

That is six trustworthy results and a column of honest absents, which is what
was asked for. What it is **not** is a clean sheet: the glass and colour frames
are unmeasured on production, the highest-value data-loss check was not run, and
the tooltip dismissal is still open.
