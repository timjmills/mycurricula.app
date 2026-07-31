# QA audit — the Plan timeline at `/planner`

**Date:** 2026-07-31 · **Scope:** the Plan timeline only (zoom, the two toggle
pairs, the library drawer, unit-band drag) · **Report only — nothing was fixed.**

---

## Precondition — which tree this measures

```
git rev-parse --short HEAD          → 988c710   (at audit start)
git rev-parse --short HEAD          → d283b18   (at audit end)
git diff HEAD --stat -- components lib app   → EMPTY at both points
git diff --name-only 988c710..d283b18 -- components lib app   → 0 files
```

HEAD **moved during the audit** — a concurrent lane landed `d283b18`
("test(timeline): settle the 'Personal-mode hang' by measuring it, not
guessing"). That commit touches only `scripts/probe-wave6-visual.mjs` and
`tests/plan-timeline-authoring.test.ts`: **zero files under `components/`,
`lib/`, or `app/` differ between the two commits**, and the working tree
carried no uncommitted app-code changes at either point. So every measurement
below describes app code that is byte-identical at `988c710` and `d283b18`,
and the report is labelled accordingly: **clean tree, app code as of both
HEADs.**

**Data path — this is the MOCK planner.** `/rest/v1/` request count was **1**
per tier (a preferences read), and **0** on the drag context. The planner data
itself never leaves `lib/mock/`. Consequently the `pending` and `error`
hydration states are **unreachable locally and were not tested** — no claim is
made about them.

**Instrumentation.** Dev server already running at `http://localhost:3014`
(not started by this audit; verified answering, `307 → /login?next=/planner`,
1.47 s). Browser: Playwright `chromium.launch({ channel: "chrome" })`. Probes:
`scripts/probe-qa-timeline.mjs` (Method B, 3 tiers),
`scripts/probe-qa-timeline-drag.mjs` (Method A, video),
`scripts/probe-qa-timeline-3.mjs` / `-4.mjs` / `-5.mjs` (gated re-checks). Raw
records: `docs/screenshots/qa-timeline/results.json`.

**Method.** Method B (screenshot key moments) for the static work — zoom stops,
toggle visibility, drawer tabs, touch targets, horizontal scroll at 375 / 768 /
1440. Method A (video + 2 fps frame extraction) for the unit-band drag, since a
drag is time-based behaviour that stills between states cannot explain; the
drag pass also screenshots after every pointer step, so each frame has a known
preceding action.

### How device emulation was done (it lies twice, so this is explicit)

| Tier | Viewport | `isMobile` | `hasTouch` | DSF | What the **page itself** reported |
|---|---|---|---|---|---|
| phone | 375×812 | true | true | 3 | `pointer:coarse` ✅, `any-pointer:coarse` ✅, `pointer:fine` ❌, `hover` ❌, `maxTouchPoints` 1 |
| tablet | 768×1024 | true | true | 2 | `pointer:coarse` ✅, `any-pointer:coarse` ✅, `pointer:fine` ❌, `hover` ❌, `maxTouchPoints` 1 |
| desktop | 1440×900 | false | false | 1 | `pointer:fine` ✅, `hover` ✅, `maxTouchPoints` 0 |

Both touch tiers are **genuinely coarse, not hybrids** — `pointer:fine` is
false and `hover` is false, so the `@media (any-pointer: coarse)` bumps really
were exercised. Every touch-target number below was measured under that
reading.

### The absence-assertion discipline used here

Every "X is not there" below is paired with a positive control asserted **in
the same evaluation**: lanes > 0 (8), band labels with non-empty text (52),
and — for interaction-dependent claims — a *demonstrated state change*
(`data-lens` flipping to `lessons`).

This mattered **five** times, and each time it stopped a false finding from
reaching this report. Four of the five would have been Critical or Major
entries:

1. A first drag pass reported **"0 bands carry `data-draggable` in Team mode."**
   The screenshot showed the Personal/Team pill still on Personal with only its
   tooltip open — the click had never landed. That zero was a **failed control,
   not a finding**. Once the switch was actually flipped (`aria-pressed="true"`,
   `<html data-mode="team">`), there were **52 draggable bands and 52 grips**.
2. A follow-up pass waited a flat 3 s, clicked "Lessons", and read back
   `data-lens="units"`. Its own control caught it, so all of its readings were
   **voided** and re-taken behind a retry gate.
3. **A near-miss headline.** Three separate desktop runs found no
   `data-mounted` anywhere in the document, while phone and tablet had it —
   which looked exactly like a desktop-only broken mount seam, and would have
   led this report. Re-measuring *after* a demonstrated state change (the gate
   needed **36 retries**) found `data-mounted="true"` present. **The finding
   was an artifact of measuring too early and is withdrawn.**
4. A drag that moved a band 230 px (a full school week) committed nothing and
   raised no `data-dragging`. Before reporting "drag is broken", the grab point
   was hit-tested: at `band.x + 30` on a coarse tier the pointer lands on a
   **lesson dot** — a 44 px `<button>` painted on the band, whose `pointerdown`
   never calls `begin`. With a hit-tested grab point the same gesture committed
   correctly. (The same shape of error made the right-edge **resize** look
   broken: a 6-week band is 1380 px wide inside a 768 px track, so its grip sat
   at x≈1569 — off-viewport. Scrolled into view, the resize works.)
5. **The desktop zoom slider looked like it lied about its own value.** Before
   hydration the thumb read `24` (the component's `FALLBACK_FLOOR`) while the
   canvas drew **34 px** columns — which would mean a teacher's first nudge
   *rightward*, asking for wider columns, made them narrower. Re-measured
   behind a pure wait on the mount seam (no clicking — `[data-mounted]` present
   *is* the proof that post-mount effects ran):

   ```
   desktop  mountSeamPresent:true → slider 34 · dayColumn 34px · base 34px · floor 24px
   tablet   mountSeamPresent:true → slider 46 · dayColumn 46px · base 46px · floor 44px
                                    thumbAgreesWithCanvas: true (both)
                                    thumbParkedAtFloor:   false (both)
   ```

   A pre-hydration transient, on both tiers. **Withdrawn.**

**Not reported as findings, because the environment confounds them.** Four
*other* agents were driving their own Playwright probes against this same dev
server during the audit (`probe-qa-year-teach`, `probe-qa-tone-matrix`,
`probe-qa-console-sweep`, `probe-qa-day-week` — six concurrent Chrome
instances). Time-to-interactive drifted from ~2 s to >2 min under that load,
and one probe died on a `page.reload` timeout. **No latency or
time-to-hydrate number from this session is a product claim**, and the
"desktop is slower to hydrate than phone" asymmetry that made finding #3 look
plausible is most likely the same contention.

---

## Three of the brief's four premises describe the prototype, not this build

Before the bug list, the reconciliation — because "verify the titles appear at
`colw>=80`" cannot be answered yes/no about code that never implements a title.
All four were confirmed **live**, each paired with a positive control:

| The brief expects | What the running app does | Where the expectation comes from |
|---|---|---|
| lesson **titles** appear at `colw>=80` | no dot carries text at **any** width, 16→130 px | `ph-units.jsx:616` (prototype) |
| derived `data-zoom` flips roomy/cozy/compact at 80/30 | **no `data-zoom`** anywhere on the surface | `ph-units.jsx:314` (prototype) |
| the mode pair is **absent** in the Lessons lens | it renders in **both** lenses | deliberate — `PlanTimeline.tsx:158-164` |
| drawer has **three** tabs, drag-to-resize, dbl-click-collapse | **two** tabs, fixed height, no dbl-click | deliberate — `TimelineDrawer.tsx:12-19` |

These are logged as findings #9–#12 below. Two are deliberate, documented
decisions that contradict the spec (a reconciliation call, not a fix); two are
prototype behaviour that was never ported, one of which the app still
advertises to teachers in a tooltip.

## BUGS

### 1. MAJOR — `.cp-root button` strips the timeline's buttons: 5 px scroll arrows, and the drag affordance's cursor

One cascade defect with several casualties, all measured live.

**What I saw.** On desktop the two axis-scroll arrows measure **5.1 × 28 px**
and render as bare `‹` `›` glyphs with no border, no fill, no padding.

```
computed on button[aria-label="Scroll back two weeks"] @1440:
  width 5.1  height 28
  padding "0px"        ← stylesheet asks for "0 9px"
  border-top-width "0px"  ← stylesheet asks for 1px solid var(--border)
  background "rgba(0, 0, 0, 0)"  ← stylesheet asks for var(--surface)
  font-size "13px"     ← stylesheet asks for 11px
  closest(".cp-root") → true
```

**Cause.** `app/tokens.css:1128` — `.cp-root button { padding:0; border:none;
background:none; font-size:inherit }` has specificity (0,1,1) and beats
`timeline.module.css:134-145` — `.zoomReset, .scrollBtn { … }` at (0,1,0). This
is the documented `.cp-root` reset trap; CLAUDE.md §4 and BUILD_STANDARD.md §8
require qualifying such rules so the reset cannot strip them.

**Why it is major, not cosmetic.** `TimelineCanvas.tsx:152-155`'s own comment
states these buttons exist because "a year-long axis is otherwise reachable
only by a horizontal-scroll gesture, which a plain mouse does not have." They
are the only mouse route across a 36-week axis, and they are 5 px wide.

**Reproduce.** `/planner` at 1440 → the Plan card → top-right of the canvas.
**Evidence.** `docs/screenshots/qa-timeline/desktop-01-default.png` (arrows at
≈1245,476); computed values above.
**Also affected by the same rule:** `.zoomReset` (measured 36.2 × 28, no
border/fill — reads as plain text "Reset"), `.drawerToggle` and `.drawerCount`
(measured 62.7 × 32 and 121.1 × 32 — "▸ Library" and "203 need attention" read
as plain text, visible in `desktop-05-drawer-open.png`).
**Note on the touch tiers:** they still measure 44 × 44, because `min-height` /
`min-width` are not properties the reset touches — but border, fill and padding
are stripped there too, so on *every* tier these are unstyled glyphs rather
than buttons.
**The second casualty — the resize cursor.** The same reset carries
`cursor: pointer`, and `.bandGrip` loses to it:

```
button[aria-label^="Change how many weeks"] → computed cursor "pointer"
                                              stylesheet asks for "ew-resize"
```

**This is a missed spot, not an unknown hazard — and that is what makes it easy
to fix.** The module already applies the doubling convention deliberately and
almost everywhere:

| doubled (protected) | single-class (stripped) |
|---|---|
| `.band.band` (:413, :437, :444, :467, :477) | `.zoomReset`, `.scrollBtn` (:134-135) |
| `.dot.dot` (:561 …) | `.bandGrip` (:485) |
| `.row.row` (:774 …), `.legendDot.legendDot` (:638) | `.drawerToggle` (:867), `.drawerCount` (:881) |

So the band's own `cursor: grab` survives — `timeline.module.css:466` says of it
*"cursor is the first place that promise is either kept or broken"*, and for the
band it is kept. Only the **grip** was missed, which is why the move gesture
advertises itself and the resize gesture does not. Combined with finding #8
(the grip's visual is `opacity: 0` until hover), the resize gesture has **no
resting affordance at all** on a fine pointer: no mark, and now no cursor.

**Suggested fix.** Apply the convention the file already uses to the four
stragglers — `.scrollBtn.scrollBtn`, `.zoomReset.zoomReset`,
`.bandGrip.bandGrip`, `.drawerToggle.drawerToggle` / `.drawerCount.drawerCount`
— or route them through `components/ui/Button` per CLAUDE.md §4.

### 2. MAJOR — the band resize grip is 28 px wide on touch, below the ≥44 px contract

**What I saw.** Measured live in Team mode on a genuinely coarse 768 context
(`pointer:coarse` true, `pointer:fine` false, `maxTouchPoints` 1), with 52
draggable bands present as the control:

```
button[aria-label^="Change how many weeks"]  →  28 × 52 px
  computed width  "28px"    touch-action "pan-y"
  ::before opacity 0.9      (visible at rest on coarse — good)
```

`timeline.module.css:520-523` bumps the grip to `width: 28px` under
`@media (any-pointer: coarse)`, while every other control in the file goes to
44 (`--tl-hit: 44px`, the `min-height/min-width: 44px` block at :165-170).
CLAUDE.md §4 requires ≥44 px touch targets on phone and tablet; this is the one
control in the timeline that misses, and it is the only pointer route to
changing how long a unit runs.

Note also that the coarse query for the grip is `(any-pointer: coarse)` **alone**,
unlike the geometry block at :664 which is `(any-pointer: coarse), (max-width: 900px)`
— so a narrow *desktop* window keeps the 12 px grip.

**Reproduce.** `/planner` → Team Curriculum → hover a unit bar → its right edge.
**Evidence.** `frames/f013_resize-00-hover.png`; measurement above.
**Suggested fix.** Raise to 44 px on coarse, and align the media query with the
rest of the file.

### 3. MAJOR — the zoom slider advertises lesson titles that no zoom level produces

**What I saw.** The slider's `title` reads *"Widen or narrow each day column.
**Lesson titles appear on the bars once the columns are wide enough.**"*
(`TimelineZoom.tsx:100`), and `MAX_COL = 130` is commented "the width at which
a dot can carry its lesson title" (`TimelineZoom.tsx:27-29`). No lesson title
ever appears.

Measured at every stop, on all three tiers — `dotsWithText` is the count of the
310 lesson dots carrying any text, and the **positive control in the same
evaluation** is `bandNamesNonEmpty`, the unit labels that *do* carry text:

| requested | applied day-px | dots with text | control: band labels with text |
|---|---|---|---|
| 16 | 24 (desktop floor) | 0 / 310 | 52 ("Place Value & Decimals") |
| 34 | 34 | 0 / 310 | 52 |
| 80 | 80 | 0 / 310 | 52 |
| 130 | 130 | 0 / 310 | 52 |

**Cause.** `TimelineLaneRow.tsx:296-315` renders each dot as a childless
`<button>`; the comment there records dropping the handoff's `colw>=80` title.
The tooltip promising it was not updated to match.
**Reproduce.** `/planner` → drag Zoom to maximum → no dot gains a label.
**Evidence.** `desktop-02-zoom-130.png`, `desktop-02-zoom-80.png`.
**Suggested fix.** Either implement the dot title above the threshold, or drop
the second sentence of the tooltip. Shipping copy that describes unbuilt
behaviour is the worse half of the two.

### 4. MINOR — a lesson dot covers the leading edge of every unit band, so the natural grab point is not draggable

**What I saw.** The first lesson dot of a unit sits on the band's left edge and
is a real `<button>` painted above it. Hit-testing the band's own centre-line
left-to-right, the first point the *band* actually owns is **48 px in** from
its left edge on a coarse pointer:

```
band box x = 201 ; first band-owned point found at x = 249
  → x 209…245 all resolve to a lesson dot (44px wide on coarse, 22px on fine)
```

A teacher reaching for the left end of a bar — the natural place to grab
something you want to slide — presses the dot, which opens a lesson instead.
The band's own tooltip says "Drag to change the weeks it is planned for", so
the affordance is advertised at the point where it does not work.

**Reproduce.** `/planner` → Team Curriculum → press the very start of a unit
bar and drag right → nothing moves; press 50 px further in → it re-paces.
**Evidence.** The two runs of `probe-qa-timeline-drag.mjs`: identical gestures,
`committed:false` at `x+30` and `committed:true` at the hit-tested point.
**Suspected file.** `TimelineLaneRow.tsx:296-315` (dot geometry) over
`:217-232` (band). **Suggested fix.** Inset the first dot, or let a dot that
receives a horizontal drag hand the gesture to the band beneath it.

### 5. MINOR — Organize / Status / Sort need *two* choices, and Density is not lens-gated

Measured matrix (each row's control, `_controlRows`, was > 0):

| lens | mode | Organize | Status | Sort | Density | Zoom |
|---|---|---|---|---|---|---|
| Lessons | List | ✅ | ✅ | ✅ | ✅ | ❌ |
| Units | List | ❌ | ❌ | ❌ | ✅ | ❌ |
| Units | Timeline | ❌ | ❌ | ❌ | ❌ | ✅ |
| Lessons | Timeline | ❌ | ❌ | ❌ | ❌ | ✅ |

Organize/Status/Sort behave as the brief expects *within* List mode
(`TimelineList.tsx:77`), but they are invisible in Lessons+Timeline, so
"Organize appears only in the Lessons lens" is true and incomplete — it needs
List mode too. **Density** (`TimelineList.tsx:113`) is the odd one out: it
renders in Units+List as well.
**Suggested fix.** None required if intended; worth confirming Density's
placement is deliberate.

### 6. MINOR — a hover tooltip covers the filter row it just revealed

**What I saw.** Clicking **List** renders Organize / Status / Sort directly
beneath the Timeline|List pill. The pointer is still over that pill, so its
tooltip ("Read the same plan as a list you can group, filter and sort.") is
open — and lands squarely on top of the newly-revealed controls.
**Reproduce.** `/planner` → Lessons → click List → do not move the pointer.
**Evidence.** `desktop-04-Lessons-List.png` (the bubble covers the Status
group), `phone-04-Lessons-List.png` (it covers the first lesson row).
**Suggested fix.** Dismiss the tooltip on click/activation, or place the
revealed controls where the bubble cannot reach them.

## IMPROVEMENT IDEAS

### 7. The drop preview is invisible for any band wider than the visible track

`data-dragging` and `.dragGhost` both appear correctly in the DOM from the
first step past the 4 px threshold (`dragging: 1, ghosts: 1` at every sampled
step). But the ghost is drawn at the band's *snapped* position, and a 6-week
band at the coarse floor is 1380 px wide inside a 768 px track — so at
`deltaWeeks = 0` the ghost sits exactly under the band, and at
`deltaWeeks = 1` its displaced edge is off-screen. Across frames `f006`→`f011`
(dx 19→230 px) nothing visibly changes.

The result is that the first half-week of every drag looks like nothing is
happening, and the confirmation arrives only after release. Consider a
displacement cue that survives clipping — a leading-edge marker at the target
week, a week-count chip on the cursor, or highlighting the target column range
in the axis header.

*(Caveat: this is a read of the captured frames plus the DOM counts, not a
per-pixel measurement of the ghost's box — worth confirming before acting.)*

### 8. The band grip is invisible until hover, with no keyboard hint on screen

`.bandGrip::before` is `opacity: 0` until `.bandWrap:hover` or `:focus-visible`
(`timeline.module.css:499-515`). On a touch tier there is no hover, so the
resize affordance has no resting visual at all — the gesture is discoverable
only by reading the band's `title`. The keyboard equivalents
(Shift+←/→ to move, Alt+Shift+←/→ to resize) exist and are good, but live only
in the `title` string.

### 9. Reconciliation — no derived `data-zoom` (roomy / cozy / compact)

Confirmed live: **0** elements carry `data-zoom` inside the timeline root, with
the control that the root itself *was* found and carried `data-lens="units"` in
the same read. The `colw>=80 ? 'roomy' : colw>=30 ? 'cozy' : 'compact'` line
exists only in the prototype (`ph-units.jsx:314`). Nothing in the shipped
stylesheet keys off it, so this is a spec-vs-build reconciliation item rather
than a defect — but any probe or plan asserting `data-zoom` will read `null`
forever.

### 10. Reconciliation — the mode pair renders in both lenses

`[role="radiogroup"][aria-label="How the plan is drawn"]` is present in the
Units lens **and** the Lessons lens, at 375, 768 and 1440 (controls: 8 lanes,
52 band labels in every read). `PlanTimeline.tsx:158-164` argues the lens and
mode are orthogonal and all four combinations are meaningful. That is a
defensible design position that contradicts the brief — it needs a decision,
not a patch.

### 11. Reconciliation — the drawer has two tabs, not three

Measured tabs: **`Units`** and **`Needs attention (203)`**;
`hasLessonLibraryTab: false`, taken with the drawer body present in the DOM and
the radiogroup found (the control). `TimelineDrawer.tsx:12-19` records that the
Lesson Library's "+New" and drag-to-timeline were deliberately dropped this
wave.

### 12. MAJOR-if-specced — the drawer has no drag-to-resize and no double-click-to-collapse

Both were exercised live and both are absent:

| tier | dbl-click on drawer body | drag the top edge −120 px |
|---|---|---|
| phone | open before ✅ → open after ✅ (no collapse) | 374 px → 374 px |
| tablet | open before ✅ → open after ✅ | 471 px → 471 px |
| desktop | open before ✅ → open after ✅ | 414 px → 414 px |

Control for these absence checks: the drawer really was open —
`#plan-timeline-library` in the DOM, `aria-expanded="true"`, both tabs present.
Additionally `resizeGripCount: 0` and **0** elements with a `resize` cursor.
Height is fixed by `max-height: 46vh` (`timeline.module.css:912`). If these
were scoped for this wave they are unbuilt; if they were not, the brief is
ahead of the plan.

## Open — measured but unresolved, or not measured at all

Listed so nobody mistakes silence for a pass.

1. **Do the scroll arrows actually scroll?** Finding #1 establishes that they
   are 5 px wide and unstyled; whether a successful click still moves the axis
   two weeks was not verified.
2. **Phone toggle hit area — NOT reported as a failure.** The lens/mode toggle
   options measure **34 px** tall on both coarse tiers, under the 44 px
   contract. `ToggleGroup.module.css:80-92` claims a ≥44 px `::before` hit-area
   inflation under coarse pointers, so the visible box is probably not the
   real target. That hit-test did not complete, so **34 px is reported as an
   unverified observation, not a violation.**
3. **Phone chrome depth.** On a 375 × 812 phone the first subject lane appears
   roughly 750 px down — nearly a full viewport of app header, hub tabs, page
   title and a four-row timeline toolbar before any plan data. This is read off
   `phone-01-default.png`, not measured, so it is an observation for triage
   rather than a finding against the §4 "sticky chrome ≤ ~30% of viewport"
   rule.
4. **The `pending` / `error` data states were not tested** and no claim is made
   about them — localhost runs the mock planner (see the precondition).
5. **`prefers-reduced-motion`** was not exercised on this surface.
6. **A hydration attribute mismatch is logged on desktop, and only on desktop.**
   Phone and tablet finished the whole interaction sweep with zero console
   errors; 1440 logged *"A tree hydrated but some attributes of the server
   rendered HTML didn't match the client properties. **This won't be patched
   up.** … a server/client branch `if (typeof window !== 'undefined')`."*
   Worth chasing, but **not attributed to the timeline** — the page renders far
   more than this surface, and this audit did not isolate which subtree emits
   it. (It is also the "1 Issue" badge visible in every desktop screenshot.)

## What is working well

- **The zoom floor is genuinely enforced by the cascade — the thing the code
  most wanted to be true, and it is.** Writing `--tl-col-user: 8px` and `16px`
  directly onto the card root (bypassing the slider entirely) still yields
  **44 px** columns on both coarse tiers and **24 px** on desktop, because
  `--tl-col: max(var(--tl-col-floor), var(--tl-col-user, …))` wins. A teacher
  cannot shrink their own touch targets below the contract, even by fighting
  the control. This is a CSS fact no unit test could have established.
- **Zoom maps 1:1 above the floor.** On desktop, requested 24 / 30 / 34 / 44 /
  80 / 100 / 130 produced measured day-columns of exactly 24 / 30 / 34 / 44 /
  80 / 100 / 130 px. On the coarse tiers every sub-floor request (16, 24, 30,
  34) clamped to 44 and everything above it tracked exactly — which is the
  floor doing its job, not a mapping error.
- **The slider's floor is correctly media-dependent** — `min="24"` on a fine
  pointer, `min="44"` on a coarse one, `max="130"`, `step="2"` everywhere — so
  the control never advertises travel the canvas will not honour.
- **And once hydrated the slider tells the truth about the canvas** — thumb 34
  / columns 34 px on desktop, 46 / 46 px on tablet, with `aria-valuetext`
  reading "34 pixels per day". The control and the surface agree, which is what
  makes the zoom trustworthy.
- **No document-level horizontal scroll at any tier**, verified two ways
  because `scrollWidth` alone is blind to an `overflow-x: clip` bar: at 375,
  768 and 1440, `scrollWidth == clientWidth` **and** a real `scrollTo(400, 0)`
  left `scrollX` at 0. `#main-content` does not overflow either.
- **Touch targets under a genuinely coarse pointer** (`pointer:coarse` true,
  `pointer:fine` false, `hover` false): scroll arrows 44 × 44, zoom Reset
  44 × 44, zoom range height 44, drawer buttons height 44, lesson dots
  44 × 44.
- **The drawer's collapsed state is done properly**: `aria-expanded="false"`,
  the body absent from the DOM rather than hidden, and `aria-controls` omitted
  while closed so there is no dangling idref.
- **Accessible names say what things do, not what they are** — the zoom slider
  is "Timeline zoom — how wide each school day is" with
  `aria-valuetext="34 pixels per day"`; dots read "Empathy & Relationships —
  Week 25 lesson. Needs work." with a title adding "Opens the lesson."
- **Zero console errors on phone and tablet** across the entire interaction
  sweep (lens flips, all four lens×mode combinations, zoom stops, drawer
  open/close).
- **Unit-band re-pacing is correct, and precisely correct.** Driven with a real
  pointer in Team mode on a coarse tier: a 230 px drag (exactly one school week
  at 46 px/day) moved *Place Value & Decimals* from **Wk 1–6 to Wk 2–7** —
  `committed: true`, `dx: 230`, `expectedWeekPx: 230`, and the band's **width
  did not change**, so a move really is a move and not a resize. `data-dragging`
  and the dashed `.dragGhost` preview appeared from the first step past the
  threshold and were both **0 after pointerup** — no leaked session, no
  orphaned ghost.
- **Right-edge resize is equally correct.** Dragging the grip one week right
  grew the band **1380 → 1610 px (exactly +230 px)** and took the unit from
  **Wk 2–7 to Wk 2–8** — the start stayed put and only the end moved, which is
  the whole difference between a resize and a move.
- **The 4 px drag threshold does its job.** A deliberate 2 px twitch on a band
  changed nothing (`title` identical) and did not navigate (`urlNow` still
  `/planner`) — so a slightly-shaky click still opens the planner instead of
  silently rescheduling a unit for the whole team.
- **Keyboard parity is real, not just declared.** `Shift+ArrowRight` on a
  focused band moved it Wk 2–7 → Wk 3–8, committing directly with no preview
  session. This was also the control that proved the write path worked while
  the pointer drag was being debugged.
- **The Team caution glow works exactly as CLAUDE.md §2 describes.** Flipping
  the pill set `<html data-mode="team">`, lit the pink frame edge and the
  toggle, and swapped the toolbar hint to "…**or drag it to change the weeks it
  is planned for**" — the drag affordance is correctly Team-only, and the 52
  bands gained `data-draggable` plus 52 grips only in that mode.
- **Band tooltips are unusually good.** They carry state, plan position, both
  gestures and both keyboard equivalents in one sentence, and they update after
  an edit — "Planned for Wk 2–7. **1 of its lessons is dated outside those
  weeks.**" is exactly the consequence a teacher needs to see after re-pacing.

---

## Findings count

**12 findings reported** (6 bugs, 6 improvement/reconciliation items) — exactly
the cap, and nothing was dropped to meet it — plus 6 open items above.

**5 further candidates were investigated and withdrawn** because their controls
failed (detailed in the precondition): "0 draggable bands in Team mode",
"missing desktop mount seam", "drag does nothing", "resize does nothing", and
"the zoom slider misreports its own value". Four of those would have been
Critical or Major entries. They are listed rather than silently dropped,
because the cheapest way to read this report wrongly is to assume the four
withdrawn items were never looked at.

## Evidence index

| Artifact | Path |
|---|---|
| Raw records (Method B, 3 tiers) | `docs/screenshots/qa-timeline/results.json` |
| Screenshots, all tiers | `docs/screenshots/qa-timeline/*.png` |
| Drag step frames (per-action) | `docs/screenshots/qa-timeline/frames/f001…f019` |
| Drag session video (Method A) | `docs/screenshots/qa-timeline/video/page@999835c4baf1dd60bb8a1f6f609c3ee8.webm` |
| Video frames @2 fps | `docs/screenshots/qa-timeline/vframes-drag/f_001…f_231.png` |
| Probes | `scripts/probe-qa-timeline.mjs`, `-drag.mjs`, `-2.mjs` … `-6.mjs` |

`-2.mjs` voided its own interaction readings (see the precondition) but its
computed-style read of the scroll arrow — a pure `getComputedStyle` call that
does not depend on interactivity — stands, and is the source for finding #1.

`-5.mjs` (scroll-arrow function, sticky-label overlap, list-row dot geometry,
phone hit-test and fold depth) is written and left in place but **was starved
out** by the concurrent load and produced no readings — that is why the items
above sit in "Open" rather than in the findings. `-6.mjs` is the cheap
replacement pattern worth reusing: it gates on a **pure wait for
`[data-mounted]`** instead of retrying clicks, which is why it completed in
about a minute where the click-gated probes took ten or never finished.

Frames were extracted with Playwright's bundled ffmpeg
(`ms-playwright/ffmpeg-1011/ffmpeg-win64.exe`) — the system has no ffmpeg on
PATH, and that build ships no `fps` filter, so `-r 2` was used in place of
`-vf fps=2`.

Key frames: `f005` pointerdown · `f006`–`f011` the move (dx 19→230 px,
`data-dragging` and `.dragGhost` both live throughout) · `f012` committed
Wk 1–6 → Wk 2–7 · `f013` grip revealed on hover · `f014`–`f018` the resize
(+230 px, Wk 2–7 → Wk 2–8) · `f019` keyboard `Shift+ArrowRight`.
