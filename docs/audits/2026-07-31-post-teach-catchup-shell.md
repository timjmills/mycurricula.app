# Audit — Post · Teach · Catch-Up · Site Shell

**Date:** 2026-07-31 · **HEAD:** `6ba6ae8` · **Method:** static (read-only). No dev
server, no render.

**Precondition block (§4b).**

```
$ git rev-parse --short HEAD
6ba6ae8
$ git diff HEAD --stat -- components lib app
(empty — no uncommitted edits under components/, lib/, app/)
```

Tree was dirty only in `agent_shared_log.md` + untracked `docs/`/screenshot
folders. **Every code citation below is HEAD state.**

**Evidence tags.** `Observed` = a literal value or line read in source, cited.
`Inferred` = reasoned from type shapes / call graphs without rendering.
`Unverified` = needs a live pass to settle. Because this audit could not render,
**nothing visual is Observed unless it is a literal value in source.**

**Authority chain** (latest wins): `7.21.26 Design Handoff Update` >
`7.2.26 Design Handoff Updated Surfaces` > `6.24.26 design_handoff_v2_site` >
the older per-surface handoffs (5.24 Catch-Up, 5.29 Teach, 5.31 Widgets/Boards).

Handoff paths below are relative to `Documents/Claude Design/`.

---

## (A) HANDOFF CONFORMANCE GAPS

Ranked by build value within each surface. Sizes are build effort: S ≈ under a
day, M ≈ a few days, L ≈ a wave.

### SHELL / CHROME

#### A1 — The compact auto-hiding bar does not exist. The prop is dead. · **M** · Observed

`components/chrome/ImmersiveBar.tsx:82` declares `hidden?: boolean` and
`app/chrome.css:1514` styles `.immersbar.immersbar-hidden`. **No caller ever
passes it.** `components/chrome/ChromeShell.tsx:115-144` is the only callsite and
omits the prop. There is no idle timer, no mouse-to-top wake, no touch
swipe-down, and no peek pill anywhere under `components/`.

Handoff — `7.21.26 Design Handoff Update/source-home/app.jsx:532-542`:

- 3.2 s desktop / 5 s touch stillness timer (`touch?5000:3200`).
- Wake on `mousemove` with `e.clientY<70`; touch wake at `clientY<28`.
- **Disabled below 640 px** — `if(window.innerWidth<640){ setBarHidden(false); return; }`
  with the comment `/* phones: bar IS the nav */`.
- Suppressed while the ⋯ menu is open (`dotsRef.current`).
- `app.jsx:558` — `onMouseEnter` on the bar itself un-hides it.
- `app.jsx:593` — `.cb-peek` chevron button renders only while hidden.
- `compact-bar.css:15` — `.cbar.hidden{transform:translateY(-150%);opacity:0;pointer-events:none}`,
  with an explicit comment **not** to animate `margin-top` (relayouts every frame
  under the views' `backdrop-filter` stacks and can wedge the tab).
- `compact-bar.css:51-55` — `.cb-peek` is `display:none` by default, `display:grid`
  under `@media (hover:none)`, `display:none` again under `@media (max-width:640px)`.

The 7.21 README names this as a headline delta of the cycle. Largest verified gap
on these four surfaces.

**Implementation constraint that must survive:** `ImmersiveBar.tsx:94-98` uses
`immersbar-hidden`, **never the bundle's bare `hidden`** — Tailwind's `.hidden`
utility (`display:none`) is emitted after `chrome.css` and would beat the
opacity/transform slide. Recorded bundle-parity deviation; keep the name.

#### A2 — `/teach` gets no chrome bar at all, despite being enrolled as immersive. · **M** · Observed

`ChromeShell.tsx:49` — `IMMERSIVE_PREFIXES = ["/planner", "/post", "/teach"]`. But
`/teach` lives in route group `(teach)`, and `app/(teach)/layout.tsx` mounts
`AppStateProvider` / `PlannerProvider` / `ConsequenceToastProvider` only — **never
`ChromeShell`**. The `/teach` entry in that array is inert.

Teach supplies its own v1-era bar (`components/teach/chrome/TeachTopBar.tsx:55`
links `/weekly`), so no one is stranded — but the handoff's compact-bar contract
covers Teach · Plan · Post, and it reaches only Plan and Post here. A prior lane
pre-registered this seam: "if Teach lands later, it needs its own map entry too"
(`agent_shared_log.md`, Wave 9a chrome-enrollment entry).

#### A3 — Compact-bar contents diverge from the handoff. · **M** · Observed

`ImmersiveBar.tsx:99-125` renders: back · title | nav | ModeSwitch (Plan only) ·
tools. Handoff `source-home/app.jsx:558-592` additionally has:

| Handoff element | Handoff line | Shipped |
| --- | --- | --- |
| Brand glyph → home (`.cb-glyph`) | `app.jsx:560` | absent |
| Optional wordmark (`.cb-wm`) + divider (`.cb-div`) | `app.jsx:561-562` | absent |
| Notification bell | `app.jsx:583` | absent from the immersive bar |
| ⋯ menu → **Tools** section | `app.jsx:586` | partially — `ChromeToolsMenu` |
| ⋯ menu → **Planner hub** item | `app.jsx:585` | absent |
| ⋯ menu → "This bar": brand toggle | `app.jsx:587` | absent |
| ⋯ menu → "This bar": ✓ Auto-hide on idle | `app.jsx:588` | absent (see A1) |
| ⋯ menu → "This bar": Exit compact bar | `app.jsx:589` | absent |
| Personal/Team on **all three** compact views | `app.jsx:573-576` | Plan only |

On the last row: `ChromeShell.tsx:52` restricts `ModeSwitch` to `/planner`, sourced
from the **7.2** bundle. 7.21's `app.jsx` puts the icon mode-switch in `.cb-right`
for Teach/Plan/Post alike. **7.21 outranks 7.2**, so the Plan-only restriction is
now a divergence, not a verified constraint — but a live Team-mode toggle on a
projection surface may be a deliberate hazard. **Get a ruling before changing it.**

#### A4 — Frame C is the 6.24 "Color-forward" recipe; 7.21 respecifies it as Pastel. · **L** · Observed · NEEDS A USER RULING

7.21 README §6: *"Pastel frame — a third frame beside Glass and Bright
(`source-home/pastel-frame.css`), Common-Planner styling, Source Sans 3."*

`source-home/pastel-frame.css:1-14` is a complete alternative skin:
`#f1f5f9` slate canvas · white cards · `#09090b` text · one teal primary
`#007595` · subject colours softened to pastel tints of themselves · **Source
Sans 3 throughout** · pill buttons · hairline borders · feather shadows · photo
ghosted to `saturate(.35) brightness(1.28) opacity .38` · theme washes explicitly
neutralised (`.theme-tint{opacity:0}`).

Shipped `app/themes.css:1149-1190` implements `[data-frame="color"]` as the older
colour-forward recipe.

**No ruling found.** Grepped `agent_shared_log.md` and `docs/` for
pastel / Common Planner / Source Sans — only unrelated hits and the AI-gameplan
competitor teardown. This is either a large unbuilt re-skin or a deliberate
rejection nobody recorded. It also collides with `CLAUDE.md` §4 (which names C
"Color-forward") and would add a font to the `next/font` set. **Do not start it
without the user's call.**

#### A5 — `data-dense` view-cinematics suppression was never ported. · **S** · Observed (absence) / Unverified (impact)

The 7.21 `home.css` delta — the only substantive change in that file between 6.24
and 7.21 — adds `.home[data-dense="1"]` rules killing photo animation, ambient
animation, `.scrim.min` animation and `.frame::before` animation on every
non-home view. Its comment names the failure mode: continuous photo zoom + long
cross-fades under the views' large `backdrop-filter` surfaces saturate the main
thread → **blank screen**.

Zero matches for `data-dense` in this repo. `app/themes.css:262` and `:284` run
`stage-drift` at 40 s / 54 s unconditionally outside `prefers-reduced-motion`.

Marked Unverified on impact: our stage/photo architecture differs from the
prototype's, and I could not profile. Worth one trace on /week or /year — the
handoff author hit this hard enough to write a paragraph about it.

### POST (Resource Wall)

#### A6 — Section lesson tags are absent, and need NO data change. · **S/M** · Observed

Handoff `source-home/resource-wall.jsx:221-227`: each section header carries up to
three **"Tagged to \<lesson\>"** link chips derived from `sec.items[].lessons`,
plus a `+N` button opening a `.rw-sectagpop` listing every tagged lesson. Both
the drag handler (`:213`) and the collapse-cycle click handler (`:215`) are
explicitly taught to ignore `.rw-sectags` so the chips are independently
clickable.

Zero matches for `sectag` / `Tagged` / `tagLessons` in
`components/resource-wall-v2/`.

**The data is already there:** `lib/wall-scope.ts:170` — `WallItem.lessons:
WallLessonRef[]`, documented at `:162-169` as "EVERY lesson tagging this same
content, across the whole visible lesson set". Pure UI work. Cheapest real win on
/post.

#### A7 — Solo is a stub against the 7.21 `SoloBoard`. · **M** · Observed

`components/resource-wall-v2/ResourceWall.tsx:1229-1257` renders a scrim, a title,
a count, a close button, and re-mounts `<Section>`.

Handoff `resource-wall.jsx:370-407` (`function SoloBoard`) gives Solo its own:
search field · type filter `<select>` · view switcher · slideshow-play button ·
section background · an "Add resource" tile · and a footer **"Add section"**
(`:404`) whose hint reads *"Adding a section turns this into a custom wall in My
Walls, linked to this lesson."*

That footer calls `soloPromote` (`resource-wall.jsx:518-530`), which converts the
solo view into a **draft custom wall**: `{ id:'cw'+Date.now(), name: sec.title+' (working)',
anchor:'lesson', lessonId, lessonLabel, draft:true, layout, view, secCount:2 }`,
prepends it to `cc_customwalls`, and toasts *"Created '… (working)' in My Walls —
linked to this lesson ✓"*. Absent here.

Related: the `rw-custlink` chip in the wall switcher (`resource-wall.jsx:570`),
which shows a custom wall's linked lesson label instead of the generic anchor
count, is also absent. `components/resource-wall-v2/wall-state.ts:54-66`
`CustomWall` carries `id`/`name`/`anchor`/`forkedFrom`/`layout`/`view`/`bg`/`created`
but **no `lessonId`/`lessonLabel`** — two fields to add. localStorage-only today,
so **no migration**.

#### A8 — The composer's second specified callsite (planbook chips) is unwired. · **S** · Observed

7.21 README:96-98 — the shared resource action menu is "Used by **workspace
resource pills and the planbook chips**". The first landed
(`components/composer/ResMenuTrigger.tsx:69` wired at
`components/lesson-editor/SectionBlock.tsx:318`). The second —
`source-home/planbook-edit.jsx`'s `.pb-rchip` chips carrying
`data-type/name/url/note` and opening the same menu — has no equivalent here.

### TEACH

#### A9 — Keep-screen-awake is absent. · **S** · Observed

Handoff `source-home/teach.jsx:186-193` requests
`navigator.wakeLock.request('screen')` behind a persisted toggle
(`cc_teach_layout.awake`, written at `:97`), surfaced as a board-header button at
`:347` whose tooltip even names the caveat: *"Screen staying awake — uses the
browser's wake lock so the display doesn't sleep mid-lesson (school policies can
still override)."*

Zero matches for `wakeLock` / `keepAwake` under `components/`. For a projection
surface driving a 45-minute lesson this is a classroom defect, not a nicety.

#### A10 — The countdown timer has no end signal. · **S** · Observed

`components/teach-v2/BoardTimer.tsx` counts to `00:00` and stops silently — no
`chime`, no audio, no visual end state (grep: zero `chime`/`Audio`/`onEnd`).
Handoff `teach.jsx:107` fires a two-tone WebAudio chime on expiry via `chime()`.
A timer a teacher must watch to know it finished does not do its job across a
classroom.

#### A11 — The lesson pane is tabs where the handoff is a resizable split. · **M** · Observed · **UNKNOWN whether desired**

`components/teach-v2/LessonRail.tsx:46` — `type RailTab = "lessons" | "resources"
| "class"`. Lesson plan and resources are mutually exclusive.

Handoff `teach.jsx:291-315` is a **vertical split** (`.tl-split`): "Lesson plan"
(`:293`) and "Resources" (`:304`) both visible, each independently collapsible via
`.tl-sechead`, separated by a drag-to-resize divider with double-click-to-even-out
(`:302`), all persisted to `cc_teach_layout`. Plus a **peek** affordance when the
pane is hidden — an edge hotzone (`:510`) and a peek tab (`:511`) that slides the
pane out temporarily, dismissed by outside pointerdown (`:98`).

**Marked UNKNOWN.** `teach-v2` was built from the 5.29/5.31 Teach handoffs and is a
far richer engine than the 7.21 site prototype's Teach. 7.21 wins on authority,
but the 7.21 README's "What changed" section never mentions Teach — these deltas
were carried in undocumented. **Get a ruling before building: this is a layout
rewrite of a shipped surface.**

### CATCH-UP

#### A12 — Only the Post action is missing. · **S** · Observed

`components/catchup-v2/CatchUpModal.tsx:271-306` gives every row Mark taught ·
Reschedule · Bump · Plan · Teach. Handoff `source-home/catchup.jsx:60` has a
sixth: **Post** — `onPost && onPost(l); onClose();` — opening the lesson on the
Resource Wall.

Everything else matches or exceeds the handoff: the six scope chips, subject
grouping, the standards-gap group, the empty state, and **real** mutators
(`planScope` / `standardGaps` in `lib/catchup-scope`) where the artboard had
`slice(0,4)` / `slice(0,8)` placeholders (`catchup.jsx:25-26`).

`catchup.jsx` is **byte-identical** between the 6.24 and 7.21 handoffs (`diff` = 0
lines), so nothing new landed on Catch-Up this cycle.

---

## (B) IMPROVEMENTS

Kept strictly separate from (A). Marked **Correction** (something is wrong or
missing that a user will hit) / **Enhancement** (right today, better tomorrow) /
**Experiment** (needs a render to judge).

### B1 — Catch-Up computes five triage data points and renders none. · **Correction** · Observed

`lib/catchup-data.ts:60-92` defines `CatchupItem` with:

| Field | Line | Purpose per its own comment |
| --- | --- | --- |
| `dayLabel` | `:69` | "Tue · Wk 11" — when it was scheduled |
| `week` | `:70` | the week index |
| `resources` | `:84` | a count, sized so the row can render "📎 N" **without instantiating each resource** |
| `reasonNotDone` | `:86` | "Teacher-supplied note about why this didn't happen" |
| `daysLate` | `:89` | "How many instructional days late the item is" |

`components/catchup-v2/CatchUpModal.tsx:260-262` renders
`[item.unit, standards[0], statusWord]` and nothing else. **Grep for
`daysLate|reasonNotDone|item.resources|dayLabel|item.week` across
`CatchUpModal.tsx` returns zero matches.**

This is the surface whose entire job is "what did I miss, and what do I fix
first". Facing fifteen rows, a teacher cannot tell which is three days late and
which is three weeks late, cannot see the note they themselves wrote about why it
slipped, and cannot see that one already has six resources attached and is nearly
ready to reteach. The derivation is done and paid for; only the render is
missing. **Highest value-per-line finding in this audit.**

### B2 — Catch-Up's lateness maths hard-codes a five-day school week. · **Correction** · Observed

`lib/catchup-data.ts:99-103`:

```ts
/** Five instructional days per week — the mock school runs Sun–Thu. The
 *  schedule is configurable in production (CLAUDE.md §1), but every
 *  fixture in the repo assumes a 5-day instructional week today. */
const DAYS_PER_WEEK = 5;
```

`daysLate` derives from it. A direct `CLAUDE.md` §6 violation ("Do not hard-code
the school week"). Currently invisible because nothing renders `daysLate` — so
**B1 and B2 must land together**, or B1 ships a number that is silently wrong for
the first school with a 3- or 4-day week.

### B3 — Teach shows the SUBJECT on the board, never the lesson. · **Correction** · Observed

`components/teach-v2/TeachV2Shell.tsx:280-282` — the board header's only identity
is `{subjectLabel}` beside `{subjectMeta?.icon}`. The lesson title appears only in
the left rail (`components/teach/left/modules/LessonListModule.tsx:70`). When the
board is expanded (`lessonHidden`, `TeachV2Shell.tsx:266`) or in true fullscreen,
the rail is gone and **the only thing on screen naming what is being taught is
the word "Math"**.

Worse: `Lesson.objective` exists (`lib/types.ts:346-347` — "'I Can' objective
statement shown beneath the title") and `Lesson.standards` (`:361`), and **neither
is rendered anywhere in `components/teach-v2/`** (grep for `objective`: zero
matches). The handoff's own board seeds "Learning target" as slide one
(`teach.jsx` `seedSlides`).

A teacher asked mid-lesson "what are we learning today?" has to leave the board to
find out. Put the lesson title + "I can…" in the board header.

### B4 — The board timer is disconnected from the lesson's real period. · **Enhancement** · Observed

`components/teach-v2/BoardTimer.tsx:24-33` is a fixed preset list
(1/3/5/10/15/20/30 min) defaulting to 600 s, described in its own header comment
as having "no contract coupling". The lesson knows its length —
`Lesson.durationMinutes` (`lib/types.ts:421`) and `Lesson.time` (`:342`). The
handoff derives each flow step's minutes proportionally from the real period
(`teach.jsx` `seedSlides`: `Math.max(15, toMin(end) - toMin(start))`, split across
the flow phases by `SEQ_MIN=[5,15,20,5]`).

Two data points a teacher wants at a glance and cannot get: **how long this period
actually is**, and **how much of it is left**. Pair with A10 (no end signal).

### B5 — The shell's Right Panel serves MOCK to-dos and FROZEN comment counts on every planner route. · **Correction** · Observed · **NEW mock-leak finding**

`app/(planner)/layout.tsx:270` mounts `<RightPanel />` **ungated** — live on Day,
Week, Year, Plan, Post, Boards, everything in the group.

- `components/shell/right-panel.tsx:145-146` —
  `TODOS.filter(t => t.scope === "personal")` / `"team"`. The to-do slide-out is
  the `lib/mock` `TODOS` fixture. Not the store, not the DB. Nothing a teacher
  does can add, complete, or remove one.
- `:402` — `LESSONS.filter(l => l.commentCount > 0)` builds the entire
  comments/discussion feed from the **static `LESSONS` fixture array**, not from
  `usePlanner()`. Its comment at `:391-398` explains the *shape* is a backend
  stand-in, but not the consequence: after any real lesson edit the counts are
  frozen. Identical class to the bug the wall lane already fixed on /post
  (`agent_shared_log.md`, Wave 9a: *"`lesson.resources` is only the fixture seed
  and never updates post-edit; a wall built on it looks alive and is frozen"*).
- `:858` — `lessons.find(...) ?? LESSON_BY_ID[lessonId]` falls back to the fixture
  when the store misses, so a stale row can render as a live one.

**Biggest mock leak on this patch**, and unlike the Teach chat badge it is on
*every* planner route.

### B6 — The command palette's subject entries are built from the mock catalog at module scope. · **Correction** · Observed · **NEW mock-leak finding**

`components/shell/command-palette.tsx:51` imports `SUBJECTS` from `@/lib/mock`;
`:125` — `const SUBJECT_VIEW_RESULTS = SUBJECTS.map(...)`, evaluated **once at
module load**. A school whose subjects differ from the eight fixture subjects gets
a palette offering subjects it does not teach and missing the ones it does, with
no re-derivation on data load.

### B7 — Seven Teach modules are built, mock-fed, and unreachable in v2. · **Enhancement** (decide, then delete or re-home) · Observed

`components/teach/TeachWorkspace.tsx:1471-1476` renders `TeachV2Shell` when `V2` is
on (`lib/v2-flag.ts:64` — default on, `NEXT_PUBLIC_V2 !== "0"`). `TeachV2Shell`
composes only `LessonListModule` + `ResourcesModule` via `LessonRail.tsx:26`.

That leaves reachable **only under `NEXT_PUBLIC_V2=0`**:
`right/modules/ChatModule.tsx`, `right/modules/TodoModule.tsx`,
`left/modules/NotesModule.tsx`, `left/modules/ToolsModule.tsx`,
`left/modules/ClassModule.tsx`, `left/modules/GroupsModule.tsx`,
`left/modules/BoardsModule.tsx`.

Two are also fixture-backed: `NotesModule.tsx:9,26` reads
`notesForDay(selectedDay)` + `TEACHER_BY_ID` from `lib/mock`;
`library/BoardLibraryModule.tsx:45` reads `TEACHER_BY_ID`. So they are dark code
*and* mock-fed. At cutover they get re-homed into the v2 rail (Notes and Tools are
the two a teacher plausibly wants mid-lesson) or deleted. **No ruling found
either way.**

### B8 — `/post` has no "when did this last change" anywhere. · **Enhancement** · Inferred

`WallItem` (`lib/wall-scope.ts:149-174`) carries `key`, `type`, `label`,
`resource`, `subjectId`, `lessonId`, `lessonTitle`, `lessons`, `composing` — **no
timestamp**. `CustomWall` (`wall-state.ts:54-66`) carries `created` but no
`updated`. A resource wall is the surface a team returns to across a year;
"what's new since I last looked" is unanswerable, and on a shared team wall that
is the primary question. `LessonResource` would need the field, so this is
adjacent to **C1** — fold it in rather than migrating twice.

### B9 — Solo mode traps the teacher in a modal with no way to reach the next section. · **Correction** · Observed

`ResourceWall.tsx:1229-1257` — Solo renders one `<Section>` inside a
`role="dialog" aria-modal="true"` scrim whose only exit is ✕ or Escape (`:772`).
To compare two sections a teacher closes, scrolls, and re-opens. Prev/next section
arrows in `soloHead` are a few lines. (This is the narrower UX point on the same
component as A7 — **not a second count of that work**.)

### B10 — Teach's board header has no exit and no orientation. · **Enhancement** · Observed

`TeachV2Shell.tsx:263-342` — the header is subject · board switcher · timer ·
settings · expand · present. No back, no breadcrumb, no "which lesson of the day
is this". `components/teach/chrome/TeachTopBar.tsx:55` does carry `href="/weekly"`,
so no one is stranded — but that is separate v1-era chrome above the v2 shell, and
**A2** establishes that the compact bar never reaches `/teach`. Building A1+A2
resolves this; if they are deferred, this stands alone.

### B11 — Give the wall's per-section empty state a designed face. · **Experiment** · Unverified

`ResourceWall.tsx:1194-1210` defers correctly to `PlannerEmpty` for the
*wall-level* empty. A live preset wall with a section that legitimately scopes to
zero resources appears (from source) to get an empty grid plus an add tile.
Whether that reads as "nothing here yet" or as "something is broken" needs a
render. Experiment, not a claim.

### Loading/empty-state honesty — checked, and these four surfaces hold

Stated explicitly because a whole class of surfaces was found lying during the
11–16 s hydrate today. `/post` (`ResourceWall.tsx:321`, `:1194-1210`), Catch-Up
(`CatchUpModal.tsx:380`, `:547`), and Teach's rail modules
(`LessonCardModule.tsx:51-60`, `LessonListModule.tsx:103-106`,
`ResourcesModule.tsx:418`, `:577-584`) **all** route empties through
`PlannerEmpty` and gate on `usePlannerDataState()`. `ResourceWall.tsx:1194-1197`
even carries the reasoning ("a permanent skeleton, a worse bug than this one").

**None of these four surfaces is in the lying-during-hydrate set.** The mock-data
problem (B5, B6) is a different failure: those surfaces are not lying about
*loading*, they are confidently rendering fixture data as the teacher's own.

---

## (C) DATA-MODEL GAPS — MIGRATIONS. REPORT ONLY, NEVER APPLY.

### C1 — Unit-level resource filing does not exist anywhere in the stack. · **L** · Observed

Verified independently at HEAD (and matching `agent_shared_log.md`'s B4.5
correction entry):

1. **No wall-column field.** `LessonResource` (`lib/types.ts`) has no
   `wall`/column/lane field. The handoff stamps one — `ph-app.jsx:240`:
   `sec: r.sec||''`, `wall: r.wall||''`. No migration under
   `supabase/migrations/*` defines one (the three files matching "wall" all match
   on the word *swallows*).
2. **No unit-level storage to file INTO.** `Unit` (`lib/types.ts:56+`) has **no
   `resources` field at all**, so a "Whole unit" destination has nowhere to go.
3. **Nothing unit-scoped reaches the composer.** `ResourceComposerProps` has no
   `unitId`/`unitName` (0 matches), so `ComposerOpenOptions` cannot carry them and
   no callsite can pass them. The handoff chooses unit-level filing *inside* the
   composer: `ph-composer.jsx:57` `canUnit=!!req.unitId`; `:155-163` the file-to
   `<select>` + wall-column `<select>`.
4. **`/post` has nothing to read.** `lib/wall-scope.ts` groups by `lesson:` /
   `subject:` / `day:` / `unit:<subj>:<id>` only — zero references to a
   resource-level wall/column field.

Our composer footer is a four-level **narrowing path to one lesson** labelled
"Destination" (`components/daily/ResourceComposer.tsx:2368`); Subject and Unit are
**filters** (`unitId` only scopes `lessonOptions`, `:810`), not destinations.

**Closing it is:** a `wall` column on `LessonResource` · a `resources` field on
`Unit` · a `UnitPatch` widening · a store action · **a DB column (migration)** ·
the two selects · `/post` reading the column. A wave, not a wiring change.

**Nothing is currently "landing uncolumned" — the column concept does not exist.**

### C2 — `CustomWall` needs `lessonId` + `lessonLabel` for the solo-promote flow. · **S** · **NOT a migration** · Observed

`wall-state.ts:54-66` lacks both. Required by A7. `cc_customwalls` is localStorage
only today, so this is a type + parser change (`parseWall`, `:208-230`), not SQL.
Recorded here so it is not mistaken for one.

### C3 — A resource "last updated" timestamp (B8) would be a migration. · **M** · Inferred

`LessonResource` has no timestamp. Adding one to answer "what's new on this wall"
is a DB column. **Fold into C1** — same table, same wave, one migration instead of
two.

---

## (D) DELIBERATELY DROPPED — DO NOT COUNT AS GAPS

Each verified against its ruling. Counting any of these would inflate a build
estimate and waste a lane.

| Item | Ruling + source |
| --- | --- |
| **Wave 9b share links** (`source/share.jsx`) | **User-deferred.** `mintLink` (`share.jsx:11`) is `btoa(JSON.stringify(...))` — plain base64, forgeable: decode, edit the `id`, re-encode, mint a link for any lesson/unit/wall/board. The `Viewer` (`:38-68`) fetches nothing and renders a hardcoded fake list. Combined with the plan's proposed `PUBLIC_PATHS` entry it would make the school's curriculum an unauthenticated read API. Also out of scope per `CLAUDE.md` §1 (teachers only). `agent_shared_log.md`, Wave 9 entry. Teach's artboard Share button is omitted for the same reason — `components/teach-v2/TeachV2Shell.tsx:22`. |
| **The six cosmetic wall presets** | The artboard's `setPreset` changed the **name** only; `buildSections` always built one wall ("Today's Lessons (Mixed)"). All six scoping behaviours were **designed and built new** in `lib/wall-scope.ts` (rotation-aware today/week, per-subject unit resolution, grade-agnostic). `agent_shared_log.md`, Wave 9a entry. |
| **Raw-CSS background injection** | `resource-wall.jsx:201`'s ``url('${bg.value}')`` and its colour/wash arms were CSS-injection holes (React does not sanitize style values). Replaced by allowlisted descriptors + `isSafePhotoSrc` + escaped `cssUrl` — `components/resource-wall-v2/backgrounds.ts:178`, `:219`, `:272`. **Security decision — never port the raw form.** The 7.21 `WallBgControl`'s photo-**upload** arm (`resource-wall.jsx:363`, `URL.createObjectURL`) falls under the same ruling plus the "blob: dies on reload" QA finding. |
| **`ResMenu` on `/post` cards** | Handoff-decided, not taste: `ph-more.jsx` contains zero `openResMenu`/`rmore`/`⋯` — a wall card there is one click target that opens the resource's lesson (`ph-more.jsx:157`, `:163`). Our `/post` Card's four inline view/present buttons already exceed the handoff. README:96-98 names the two real callsites. `agent_shared_log.md`, B4 close-out. |
| **Composer in Teach (B4.6 Teach half)** | **NOT APPLICABLE**, two independent reasons. Structural: `app/(teach)/layout.tsx` never mounts `ComposerProvider`, so `useComposer()` would throw. Semantic (the decisive one): `teach-v2/WritingBar.tsx:144`'s "Resource" popover emits `{type:"addResource", pageId, resource, canvas:{x,y,w}}` — it **places an existing** resource on a board page at canvas coordinates; the composer **creates** a resource row on a lesson. Different verb, target, store. Recorded explicitly "so it is not re-litigated as an omission". |
| **B4.6 `/post` composer wiring** | **Shipped `e0eab58`, then REVERTED in full** — correctly. The wall is collection-only (`ph-more.jsx:136`, `:169`); the add verb is lesson-scoped inside the workspace Lessons tab (`ph-workspace.jsx:404`). The wall's per-section "Add" making only a wall-local note **is the specified behaviour**. Survivors: the `safeHref` open-redirect fix and honest "Add note" copy. |
| **Teach → `/boards`, not `/teach`, in the console** | Documented divergence — `components/chrome/Console.tsx:20-22`: `/boards` is the board home that inherits corner-grammar chrome; the full-screen editor is its own route group with its own chrome. Not a routing bug. |
| **Teach's Chat / Todo / Notes / Tools modules** | **NOT a deliberate drop — see B7.** They are built and orphaned, reachable only under `NEXT_PUBLIC_V2=0`. No ruling found. Needs a decision, not an assumption. |
| **Board-library per-kind preview thumbnails** (`5.31.26 Widget and Boards Handoff/boardlib.jsx:21-35`) | **Would require fabricating data — do not build as specified.** `Preview({kind})` switches on a prototype-only `kind` (`warmup`/`centers`/`guided`/`whiteboard`/`grammar`/`science`/`exit`/`morning`) and each branch draws invented board CONTENT: the literal string `7 × 8 = ?` (`:25`), a "Week 2 Grammar" table whose row reads `Past` / `I walked to the park.` (`:28`), "Science Lab Notes" (`:29`), "Exit Ticket" (`:30`). `Board` carries no `kind` field, so shipping this means (a) inventing a classification the model does not have and (b) painting lesson material nobody authored onto a teacher's own card — the same class this session closed on six other surfaces. It is an artboard using fake content in place of a screenshot, not a conformance gap. The shipped equivalent is honest and already in HEAD: `boardFamily` + `boardIcon` derive a family chip from real tags (`BoardLibraryCard.tsx`). A REAL thumbnail means rendering the board's own widgets scaled down — a different and much larger job, and the only version worth building. Reached independently by the Wave 5 and Wave 6 lanes; recorded here so it is not re-derived as an omission. |

---

## (E) WHAT WORKS — MUST NOT REGRESS

- **Resource Wall backgrounds are complete and audited.** Preset
  (`ResourceWall.tsx:787`), custom-wall (`wall-state.ts:66`), per-section and
  per-subject (`Section.tsx:232`; `wall-state.ts:36-37`), all through
  `parseWallBackground`'s allowlist gate (`wall-state.ts:217-229`). **Do not let a
  reading of the 7.21 `WallBgControl` delta trigger a rebuild** — the capability
  is there, through a different and safer control.
- **`lib/wall-scope.ts`** — 51 node tests, including the no-catalog-row and
  no-cross-subject-leak regressions. The route injects the canonical deduped
  resource union (section-level via `getSections` + lesson-level), never the
  frozen `lesson.resources` fixture seed.
- **`ResMenuTrigger`'s contrast + toggle fixes.** 4.41:1 light / 5.09:1 dark
  (quiet from size, not `opacity`), `aria-expanded` owned by `ResMenu` (the only
  thing that observes every close path), and 44px behind **`any-pointer: coarse`**
  — *not* `pointer: coarse`, which a touchscreen laptop does not match.
  `scripts/probe-resmenu-row.mjs` is mutation-checked (34 assertions); keep it
  green.
- **`safeHref` is deleted; `isSafeUrl` is the one sink.** Do not reintroduce a
  local URL guard — the drifted copy was an open redirect via tab-smuggling
  (`"/<TAB>/evil.com"` satisfies its `^\/(?![/\\])` arm; the browser strips the
  tab before parsing and resolves to `//evil.com`).
- **Catch-Up's real mutators** — `setLessonStatus` / `relocateLesson` /
  `bumpLesson` with undo, and honest empty states via `usePlannerDataState()` +
  `PlannerEmpty`.
- **`ImmersiveBar` uses `immersbar-hidden`, never bare `hidden`**
  (`ImmersiveBar.tsx:94-98`). Anyone implementing A1 must keep that name or
  Tailwind's `display:none` utility kills the slide.
- **The Catch-Up modal host is elected app-wide** (`ChromeShell.tsx:114`, and
  again at `:154`), so the Tools popover's Catch-up item works from the immersive
  routes too.

---

## Two direct answers

**Is the Shared Composer's B4.5/B4.6 still outstanding at HEAD?** **No — the plan
line is stale.** B4.6 `/post` shipped and was correctly reverted (spec says the
wall is collection-only). B4.6 Teach is NOT APPLICABLE on structural + semantic
grounds. `ResMenuTrigger` has since LANDED at its handoff-specified home
(`components/composer/ResMenuTrigger.tsx:69` → `lesson-editor/SectionBlock.tsx:318`).
What genuinely remains is **not wiring**: it is C1, a data-model + migration wave,
plus the second `ResMenu` callsite (A8, S).

**Does the compact auto-hiding bar on Teach/Plan/Post actually exist?** **No.** The
prop exists (`ImmersiveBar.tsx:82`), the CSS exists (`app/chrome.css:1514`), and
no caller passes it (`ChromeShell.tsx:115-144`). No timer, no wake, no peek pill.
And `/teach` never receives the bar at all, because `(teach)` does not mount
`ChromeShell`. See A1 + A2.
