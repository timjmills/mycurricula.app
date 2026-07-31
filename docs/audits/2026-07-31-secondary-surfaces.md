# Secondary & print surfaces — audit

**Date:** 2026-07-31
**Surfaces:** `/home`, `/schedule`, `/archive`, `/boards`, `/weekly/print`, `/year/print`, `/subject` + `/subject/[slug]`
**Method:** static read only. No dev server, no browser. Read-only pass — no code changed.

## Precondition block (§4b)

```
git rev-parse --short HEAD                    → 6ba6ae8
git diff HEAD --stat -- components lib app    → (empty)
```

The tree was **clean** for `app/`, `components/`, and `lib/` at the time of the read, so
every claim below is a claim **about commit `6ba6ae8`**, not about a dirty working tree.
Untracked `docs/` and `Documents/` files were present; none are imported by the app.

**Evidence tags.** Every finding is tagged:

- **Observed** — the exact line was read; it is cited. An *absence* is Observed only
  when the grep that would have found it is stated.
- **Inferred** — follows from Observed code paths but the rendered result was not seen.
- **Unverified** — needs a check that could not be run here; the check is named.

No finding in this document was verified in a browser. Anything about layout, overflow,
or paint is at best **Inferred** and is marked so. A live pass is still owed on these
surfaces.

**Provenance.** Sections marked *(verified here)* were read directly during this audit.
Three parallel sub-lanes (schedule rotation, print templates, boards+archive) reported
separately to the team lead; their raw output did not reach this file, so rather than
restate it second-hand, every item below was re-derived from source. Where the lead
cited a fix-lane scope item, this file records whether it was independently confirmed.

---

## (A) Conformance gaps — ranked

Ranked by user impact. Size is implementation effort: **S** ≤ a few lines, **M** a
contained change, **L** a real piece of work.

### A1 — Both print routes are unreachable from the running app · **HIGH · S**

**Handoff / contract:** CLAUDE.md §2 principle 6 — "Print- and paper-friendly. Views
have clean print templates." CLAUDE.md §1 lists basic print/export as shipped Phase 1A.
**Code:** entry points **absent**.

*Observed.* The templates exist and are good (see §E). What is missing is any way in.

- `/weekly/print` — **no `href` anywhere**. `grep -rn "weekly/print" --include=*.tsx
  --include=*.ts .` over the repo returns only two code *comments*
  (`components/lesson-card/context-menu.tsx:64`, `app/(planner)/year/print/page.tsx:12`)
  plus generated `.next/` type files. Zero links.
- `/year/print` — exactly one link, `components/year/YearView.tsx:433`. **`YearView` is
  not mounted anywhere.** `app/(planner)/year/page.tsx:15-17` mounts `YearShell` (V2) or
  `TimelineYear` (v1). Grepping `YearView` across `app/` and `components/` outside its
  own file returns only comments. It is exported from `components/year/index.ts` and
  consumed by nobody — dead code holding the app's only print link.
- Neither `TimelineYear.tsx` nor any file in `components/year-v2/` contains the string
  `print` (case-insensitive, excluding "footprint"/"blueprint").
- No print entry in `components/shell/command-palette.tsx`,
  `components/chrome/ChromeToolsMenu.tsx`, or `components/shell/top-bar-more-menu.tsx`.

**Consequence:** a teacher cannot print. The feature is built and invisible.

**Fix:** add a Print action to the Year and Week view chrome. Size S — the routes and
stylesheets already work.

---

### A2 — `/weekly/print` hard-codes a Sunday–Thursday week · **HIGH · S**

**Handoff / contract:** CLAUDE.md §1 + §6 — "**Do not hard-code the school week** (the
set of weekdays, or a 5-day assumption)… every calendar surface derives its day columns
from it."
**Code:** `app/(planner)/weekly/print/page.tsx:74`; `lib/mock/index.ts:20-26`.

*Observed.* The print page computes its columns as:

```
app/(planner)/weekly/print/page.tsx:72-75
  // Number of instructional days — derived from the mock's WEEK_DAYS so we
  // respect the school-week configuration rather than assuming 5 days.
  const dayCount = WEEK_DAYS.length;
  const dayIndices = Array.from({ length: dayCount }, (_, i) => i);
```

The comment asserts the opposite of what the code does. `WEEK_DAYS` is a frozen literal:

```
lib/mock/index.ts:20-26
  export const WEEK_DAYS: readonly string[] = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday",
  ] as const;
```

`useSchoolWeek()` is never imported by this file. `lib/use-school-week.ts:158-162` ships
`monFri` and `monSat` presets, so this is not hypothetical: **a Mon–Fri school prints a
Sunday column and never prints Friday.** A Mon–Sat school loses two days.

The on-screen `/schedule` route *does* read the configured week
(`app/(planner)/schedule/page.tsx:31`) — the print template was simply never brought
along.

**Fix:** replace `WEEK_DAYS` with `useSchoolWeek().days`. Size S.
**Note:** the misleading comment must be corrected too — it is the reason this survived.

---

### A3 — `/schedule` ignores the timetable the teacher configured · **HIGH · M**

**Handoff:** `Documents/Claude Design/5.24.26 Schedule View Handoff/`. CLAUDE.md §1 —
"The daily timetable… is configured per school and per teacher, never fixed."
**Code:** `lib/use-my-schedule.ts:8-11` (the seam, unadopted); `lib/schedule-data.ts:90`
(the fixture that is used instead).

*Observed, and self-documented as deliberate.*

`app/settings/schedule/page.tsx` is 888 lines of real timetable configuration.
`lib/use-my-schedule.ts` is the read seam that turns those settings into
`TimelineBlock`s. Its own header states the problem:

```
lib/use-my-schedule.ts:8-11
  // ── Status: NOT ADOPTED YET ────────────────────────────────────────────
  // Planner surfaces still read the hand-authored fixture directly via
  // `getDayBlocks()` in lib/schedule-data.ts. This hook is the drop-in
  // replacement they migrate to in a follow-up wave…
```

Confirmed: `useMySchedule` has **one** consumer app-wide —
`app/settings/schedule/page.tsx:401`, the settings page's own preview.
`ScheduleDayPane`, `SchedulePanel`, and `ScheduleTimeline` all import `getDayBlocks`
from `lib/schedule-data.ts`, whose `SCHEDULE_BY_DAY` (`:90`) is a hand-authored Sun–Thu
fixture and whose `getWeekBlocks()` (`:276`) hard-codes `[0, 1, 2, 3, 4]`.

So the teacher configures a timetable, sees it previewed correctly in Settings, and
every view shows a *different* sample timetable. The deferral is phased and intended
(see §D), but nothing on the surface says the data is sample data — and
`use-my-schedule.ts:23` shows that was anticipated: it returns `source: "fixture"` so
surfaces "can badge it honestly ('Sample timetable')". No surface does.

**Fix:** adopt the seam (`getDayBlocks(dayIndex)` → `useMySchedule(weekdayToken).blocks`;
the shapes are identical per the header). Size M. **Interim (size S):** render the
`source: "fixture"` badge so the surface stops presenting sample data as the teacher's.

---

### A4 — `/schedule` passes a weekday number where a school-week *position* is required · **HIGH · S**

**Contract:** CLAUDE.md §1 (multi-school-week).
**Code:** `app/(planner)/schedule/page.tsx:32`; `lib/use-my-schedule.ts:26-31`;
`lib/now-anchor.ts:98-105`; `components/schedule/ScheduleDayPane.tsx:71,101,107`.

*Observed on the code paths. **Inferred** on the render — see the check below.*

Two different units are being mixed:

1. The page builds its day list as **absolute weekday numbers**:
   `app/(planner)/schedule/page.tsx:32` — `configuredDays.map((d) => WEEKDAY_INDEX[d])`,
   where `lib/use-school-week.ts:88-96` maps `sun:0 … sat:6`. It passes these as
   `ScheduleDayPane`'s `day`.
2. The fixture is keyed by **position in the school week**, stated explicitly:

```
lib/use-my-schedule.ts:26-31
  // Fixture indexing: lib/schedule-data.ts keys its days 0..4 by POSITION
  // in the school week (the same semantics as `Lesson.day` …). So the
  // fixture index for a weekday token is its position in the configured
  // `useSchoolWeek().days`, never a hard-coded Sun..Thu mapping.
```

3. `ScheduleDayPane` then compares that same `day` against `todayColumnIndex(...)`
   (`:101`, `:107`), which returns a **position** (`lib/now-anchor.ts:98-105`:
   `schoolWeekDays.indexOf(token)`).

For a **Sun–Thu** week position == weekday number, which is why this has never shown.
For **Mon–Fri** every index is off by one and index `5` falls off the fixture entirely
(blank Friday); for **Mon–Sat**, two days are blank.

The prop contract itself carries the confusion:

```
components/schedule/ScheduleDayPane.tsx:71
  /** Day index into the school week (0 = Sun … 4 = Thu). */
```

— which is a school-week index *and* a weekday mapping in one sentence, true only for
one configuration.

**Check needed (Unverified):** set the school week to Mon–Fri, load `/schedule`, confirm
the strip is off by one and Friday is blank.
**Fix:** pass positions (`configuredDays.map((_, i) => i)`) and correct the prop doc.
Size S.

---

### A5 — Three callsites hard-code "today" to Monday · **MED · S**

**Code:** `lib/schedule-data.ts:326-328`.

*Observed.*

```
lib/schedule-data.ts:326-328
  export function todayDayIndex(): number {
    return 1; // Monday
  }
```

Consumed at `app/(planner)/schedule/page.tsx:52` (the day-strip "today" ring),
`components/schedule/SchedulePanel.tsx:271`, and `components/schedule/ScheduleTimeline.tsx:57`
(the timeline's default day).

Meanwhile `ScheduleDayPane` resolves the **real** today via
`todayColumnIndex(new Date(), schoolWeekDays)` (`:101`), SSR-safely, with a 60 s
midnight re-check, and runs a live 30 s now-tick (`:113`).

So on any day but Monday, **two widgets on one screen disagree about what day it is** —
the strip rings Monday while the pane's now-line sits on the real day.

**Fix:** repoint the three callsites at `todayColumnIndex` from `lib/now-anchor.ts`.
Size S. (Do A4 first — they share the units problem.)

---

### A6 — `selectedDay` is never clamped to the configured school week · **MED · S**

**Code:** `lib/app-state.tsx:310`; `app/(planner)/schedule/page.tsx:35`.

*Observed.* `lib/app-state.tsx:310` — `useState<number>(0)`, i.e. Sunday.
`app/(planner)/schedule/page.tsx:35` — `const focusedDay = selectedDay;`, with no clamp
against `configuredDays`. Grepping `components/daily` and `components/weekly` for a
clamp/`includes`/school-week guard on `selectedDay` returns nothing.

For a Mon–Fri school on first visit, `/schedule` opens on a day that is **not in the
school week**: no chip is active, the `<h1>` reads "Schedule — Sunday, Week N", and the
pane shows its empty state. It is recoverable (the empty state is well-worded — see §E)
but it is a broken first impression for the most common school week in the world.

**Fix:** clamp `focusedDay` to the first configured day when `selectedDay` is outside
the school week. Size S.

---

### A7 — The six-chip console cannot fit a phone · **MED · S**

**Handoff:** 7.21 `source-home/app.jsx:276-303` (`Hero`) — the console is the landing
surface; CLAUDE.md §4 responsive contract — "No page-level horizontal scroll at any
tier", phone 360–480px.
**Code:** `app/chrome.css:584,596-612,736-740,1748-1751`;
`components/chrome/Console.tsx:50-93,102-107`.

*Observed on the CSS. **Inferred** on the overflow.*

- `app/chrome.css:604,612` — `.view { flex: 1 1 0; min-width: 96px; }`
- `app/chrome.css:584` — `.views.console { flex-wrap: nowrap; }`, re-asserted for
  ≤420px at `:1748-1751`.
- No media query anywhere in the file relaxes `min-width` (`grep -n "min-width: 96px"`
  returns exactly one hit, `:612`).
- `components/chrome/Console.tsx:50-93` defines **six** entries — Day, Week, Year, Plan,
  Post, Teach.

Six chips × 96px = **576px hard minimum** inside a 375px viewport, less
`.cp-home-console` padding (`:715`, ~15px/side at that width) → ~345px usable.

The one phone rule that exists only hides the captions, and its comment records the
stale assumption:

```
app/chrome.css:733-736
  /* RESPONSIVE-AUDIT polish: at phone width the FULL home console's four chips
     compress to ~66px each … */
```

Four chips, not six — written before Post and Teach were restored, which
`Console.tsx:14-18` documents. `min-width: 96px` also makes "compress to ~66px"
impossible as written.

This hits `/home` and, via `CompactConsole`, `/daily`, `/weekly`, `/year`, and `/boards`
(`Console.tsx:102-107`). The team already reasons about this failure mode elsewhere —
`app/chrome.css:1905` discusses 88px items that "clip at 375".

**Check needed (Unverified):** render `/home` at 375px. **Measure the console element's
own `scrollWidth` against its `clientWidth`** — `document.scrollWidth` will not reveal
this if an ancestor uses `overflow-x: clip`.
**Fix:** drop `min-width` at ≤480px, or allow wrap. Size S.

---

### A8 — `/weekly/print` prints archived lessons · **MED · S**

**Code:** `app/(planner)/weekly/print/page.tsx:68-70` (filter, no `archived` clause) vs
`app/(planner)/year/print/page.tsx:103`.

*Observed.* The Year print filters archived lessons out:

```
app/(planner)/year/print/page.tsx:103
  if (l.archived) continue;
```

The Weekly print does not — its only filter is
`lessons.filter((l) => l.week === week)` (`:68-69`), and grepping the file for
`archived` returns nothing. Archived lessons therefore appear in the printed week as
though they were live plan. The two templates disagree with each other, which is the
tell that this is an oversight rather than a decision.

**Fix:** add the `archived` filter to match Year. Size S.

---

### A9 — Print templates omit custom subjects and custom units · **MED · M**

**Code:** `app/(planner)/year/print/page.tsx:35,109,215`;
`app/(planner)/weekly/print/page.tsx:30,81`.

*Observed.* Both templates resolve their catalogs from `@/lib/mock`:

- `year/print/page.tsx:215` — `SUBJECTS.map(...)` builds the subject lanes.
- `weekly/print/page.tsx:81` — `for (const subj of SUBJECTS)` builds the rows.
- `year/print/page.tsx:109` — `UNIT_BY_ID[l.unit]`.

Personal custom subjects exist (`lib/use-subject-settings.ts:12,479` — "PERSONAL custom
subjects (e.g. 'Band')") and custom units exist (`lib/use-custom-units.ts`). Neither
resolves through the mock catalogs, so a teacher's custom subject or unit **silently
vanishes from the printout** with no indication anything was dropped.

**Explicitly checked and NOT a bug:** because both files iterate `SUBJECTS` to build
their keys, the downstream `SUBJECT_BY_ID[subjectId]` lookups
(`weekly/print:139`, `year/print:243`) are always defined. There is **no crash** here —
only a silent omission. (An earlier reading of this audit suspected an unguarded index;
reading the key-construction loops disproved it.)

**Fix:** resolve subjects/units through the same live catalog the screen views use.
Size M.

---

### A10 — `/weekly/print` cannot print any week but the selected one · **MED · S**

**Code:** `app/(planner)/weekly/print/page.tsx:63`.

*Observed.* The page reads `const { week } = useAppState()` and neither file imports
`useSearchParams` (grep for `searchParams|useSearchParams` across both print pages
returns nothing). There is no `?week=` deep link. Since `week` lives in client React
state rather than the URL, opening `/weekly/print` directly (a bookmark, a new tab, a
shared link) resolves to the derived current week, not the week the teacher was looking
at. Printing next week's plan — the single most likely reason to print — requires
navigating Weekly first and then finding a link that does not exist (A1).

**Fix:** accept `?week=` and seed from it. Size S. Pairs naturally with A1.

---

### A11 — Print headers do not repeat across pages · **LOW · S**

**Code:** `@page`/`thead` rules **absent** from both print stylesheets.

*Observed (absence).* `grep -n "display: table-header-group\|thead\|table-header"` over
`app/(planner)/weekly/print/print.module.css` and `app/(planner)/year/print/print.module.css`
returns **zero** hits. Both templates render real `<table>`s with `<thead>`
(`weekly/print/page.tsx:125`, `year/print/page.tsx:203`). Without
`thead { display: table-header-group }`, a table that breaks across sheets loses its
day/week column headers on every page after the first — the reader gets a grid of
lessons with no idea which column is which day.

The Year template does set `page-break-before: always` per month
(`year/print/print.module.css:224-235`), so short months may not break; a full year at
A4 landscape plausibly will.

**Fix:** add `thead { display: table-header-group }` inside the existing `@media print`
blocks. Size S.

---

### A12 — Print pages compute `new Date()` during render · **LOW · S**

**Code:** `app/(planner)/weekly/print/page.tsx:88`;
`app/(planner)/year/print/page.tsx:137`.

*Observed on the code; **Inferred** on whether a hydration warning actually fires.*

Both do `const today = new Date();` at render time in a client component that is still
server-rendered. The house pattern elsewhere in this codebase is explicitly the
opposite — derive time-dependent values post-mount so the two renders agree:

- `components/chrome/Console.tsx:180-181` — `const [mounted, setMounted] = useState(false)`
- `components/schedule/ScheduleDayPane.tsx:95-106` — "Today resolution — SSR-safe house
  pattern (findings M3/M4). Initial null → the server HTML carries no active-now tint"

**Check needed (Unverified):** load either print route and watch the console for a
hydration mismatch.
**Fix:** adopt the post-mount pattern. Size S.

---

### A13 — `/subject` is a clean redirect (as required), with two stale edges · **LOW · S**

**Contract:** CLAUDE.md §8 route-alias table — `/subject` is a legacy redirect to `/year`.

*Observed — the brief's question answered: **yes, it is still just a redirect, and
carries no stale UI.***

- `app/(planner)/subject/page.tsx` — 11 lines, a bare `redirect("/year")`. No markup.
- `app/(planner)/subject/[slug]/page.tsx` — 43 lines, `redirect()` to
  `/year?subject=<slug>` or `/year`. No markup. `generateStaticParams` prerenders one
  redirect per subject.

Two small staleness items:

1. `subject/[slug]/page.tsx:14-23` — `VALID_SUBJECT_IDS` is a hard-coded 8-id set
   "kept in sync with lib/types.ts". A **custom** subject's old bookmark falls through
   to the all-subjects Year, losing its focus. Minor, since these are legacy links.
2. `lib/help-copy.ts:68` — still carries a `/subject` help entry for a route that can
   never render. Dead copy.

---

## (B) Improvements — Correction / Enhancement / Experiment

### B1 — `/archive` shows fabricated school-year numbers to every workspace · **Correction · HIGH**

> **In flight** — the team lead reports a `fix-archive` lane is already on this. Recorded
> here for completeness, not as a new finding.

*Observed.* `lib/archive/school-years.ts:91-98`:

```
export function useSchoolYears(): { current: …; archived: … } {
  const current = FIXTURE.find((y) => y.isCurrent) ?? null;
  const archived = FIXTURE.filter((y) => !y.isCurrent);
  return { current, archived };
}
```

A hook with no hooks in it, filtering a module-level constant. Its own header (`:9-13`)
claims "When the planner flips to Supabase the same hook reads `school_years` instead" —
**there is no such branch.** Every teacher in every workspace sees the same hardcoded
"2026–2027 · 185 lessons · 35 units" and a sealed "2025–2026" that is not theirs.

**Not a migration.** The seam already exists: `school_years` is in
`supabase/migrations/20260518102823_initial_schema.sql`, and `lib/planner/source.ts:182`
already accepts `opts?: { schoolYearId?: string }`. This is wiring.

### B2 — `/archive` is a surface nothing populates and nothing can be read out of · **Enhancement · HIGH**

*Observed.* Distinct from B1 and, as far as this audit can tell, **not covered by the
`fix-archive` lane** — worth confirming with that lane before it closes.

Opening a sealed volume reveals four aggregate counts and a subject legend
(`components/archive/ArchiveScreen.tsx:207-222`). You cannot reach a single lesson,
unit, week, or note from a past year.

And **nothing anywhere can archive a year.** `grep -rniE "roll.?forward|rollForward|
archive_year|seal.*year"` across `lib/ components/ app/ supabase/` returns only the
archive's own empty-state copy — which promises a feature that does not exist:

```
components/archive/ArchiveScreen.tsx:259-261
  No archived years yet. When you roll forward to a new year, this
  year's plan is sealed and shelved here.
```

CLAUDE.md §2 principle 7 is "Reusable year-over-year. Plans archive and roll forward."

**The missing data point:** *"show me last year's Unit 3 so I can copy it into this
year."* That is the entire reason to open an archive, and neither the design nor the
build offers it. Until a drill-in exists, `/archive` is a display case.

### B3 — v2 `/home` gives a teacher no information at all · **Enhancement · MED**

*Observed. Raise with the user rather than fix unilaterally — the handoff is explicit,
so this is a deliberate-looking loss that may not have been weighed.*

Under the default flag, `/home` renders a greeting, six nav buttons, a date, a bottom
quote, and a context/clock bar (`components/chrome/Console.tsx:193-214`;
`ChromeShell.tsx:87-88,186-187`).

This is **faithful to the handoff** — 7.21 `source-home/app.jsx:276-303` (`Hero`) is
exactly greeting + console + date, and `QuoteLine` (`:306-315`) is the bottom quote. So
it is not a conformance gap.

But the flag-OFF `HomeV1` it replaced had six data rows — today's schedule, today's
to-dos, today's lessons, week progress, the shoutbox, notes
(`components/home/rows.tsx:11-19`; `HomeV1.tsx:39-46`). All are now unreachable code
(`CustomizeHome`, `HomeScreenSettings`, `HomeHero`, `RollingInsight`, `HeroPhotos`, and
`rows.tsx` have no consumer outside `components/home/`).

The landing surface now answers "where do I click" and not "what's happening today" —
which is the product's stated core job: *"What are we teaching this week, and where am I
in the plan?"* (CLAUDE.md §1).

### B4 — Two keyboard shortcuts are advertised and unimplemented, one harmfully · **Correction · MED**

*Observed.* `components/shell/shortcuts-overlay.tsx:66-67` advertises:

- `⌘D — Mark lesson done / not done`
- `⌘P — Open lesson print view`

Neither has a handler. The only `metaKey` listeners outside Teach and the palette are
undo/redo (`lib/undo-toast.tsx:150`, `components/shell/global-shortcuts.tsx:72`,
`components/shell/top-bar.tsx:201`), and `lib/use-keyboard-shortcuts.ts` handles only
`k / g / [ ] / t / 1-4 / / / ?`.

`⌘P` is the harmful one: the teacher is told it opens a lesson print view, presses it,
and gets the browser's native print dialog for whatever is on screen.

Already on the record and still open — `agent_shared_log.md:3795-3796`: *"`print` has no
handler anywhere (the working `/weekly/print` and `/year/print` routes are not wired to
it)."*

> ⚠ **Landmine for whoever implements print.** Per `agent_shared_log.md:4500-4503`, a
> live v2 lesson-card context-menu item labelled **"Edit Template"** emits
> `onContextAction("print")`. Re-point that emitter **before** wiring print, or "Edit
> Template" starts printing. `components/weekly/weekly-lesson-card.tsx:1555-1567`
> carries a warning comment about exactly this.

### B5 — Rotation is configurable and consumed by nothing · **Correction · MED**

*Observed.* `ScheduleRotation` / `cycleLength` are written by both Settings → Schedule
and the onboarding wizard (`lib/onboarding-state.tsx:78-79`;
`lib/onboarding-v2-shape.ts:52,191`), persisted to `mycurricula:team:schedule-rotation`
(`app/settings/schedule/page.tsx:18`). `app/settings/schedule/page.tsx:6-9` documents
the three modes: weekly / A-B / N-day cycle.

**No view reads them.** The only `use-schedule-settings` consumers are the settings page
itself and the onboarding step.

The deferral is phased and intended (§D), so this is not a build gap. But a
**team-scoped control that changes nothing, with no "arrives later" signal**, is a trust
cost during a beta — and CLAUDE.md §4 marks team-wide settings as
`required: true` tooltip territory precisely because they read as consequential.

**Cheapest honest fix:** the `source: "fixture"` badge the seam already returns
(`lib/use-my-schedule.ts:23`), plus a note on the rotation card.

### B6 — Help copy is missing on the surfaces v2 made primary · **Correction · LOW**

*Observed.* `lib/help-copy.ts` covers `/daily`, `/weekly`, `/year`, `/subject`,
`/schedule`, `/catch-up`, `/settings`. `helpForPathname` returns `null` for anything
else, and the overlay then renders shortcuts only.

So pressing `?` on **`/home`**, **`/boards`**, `/planner`, `/post`, or **`/archive`**
teaches nothing. `/home` is the landing surface and `/boards` is a primary console tab.
Meanwhile `/subject`, which *does* have an entry, is a redirect that cannot render.

This matters more than it looks, because under v2 the left rail is not mounted at all —
`app/(planner)/layout.tsx:236`: `{!V2 && <SideNav />}`. `/schedule` and `/archive` are
reachable only via the Tools popover (`ChromeToolsMenu.tsx:146,160`), the command
palette, and one keyboard shortcut.

### B7 — Double undo on the flag-OFF rollback build · **Correction · LOW**

*Inferred.* **Check needed:** build with `NEXT_PUBLIC_V2=0`, make two changes, press ⌘Z
once, see whether both revert.

`components/shell/top-bar.tsx:200-215` and `components/shell/global-shortcuts.tsx:71-84`
register structurally identical `⌘Z` window listeners. Under v2 only `GlobalShortcuts`
mounts, so this is inert. Under v1 **both** mount — `app/(planner)/layout.tsx:76` mounts
`<TopBar />` in the `!V2` branch, and `GlobalShortcuts` mounts unconditionally at `:187`.

`lib/undo-toast.tsx:155-156` pre-empts them with capture-phase `stopPropagation()` — but
only *while a toast is live*; with no toast it returns early (`:147`) and both handlers
fire. Its comment says "pre-empt the top-bar bubble handler", **singular** — written
before `GlobalShortcuts` was extracted.

Low severity because it is the rollback path only. Noted because the rollback path is
the safety net.

### B8 — `/home` greeting flips text on hydration · **Correction · LOW**

*Observed.* `components/chrome/Console.tsx:184` —
`const greet = mounted ? greetingFor(now.getHours()) : "Welcome";`

The first paint reads "Welcome, Tim" and then swaps to "Good morning, Tim". The
SSR-safety reasoning (`:174-179`) is sound — the hour differs by timezone — but the
chosen resolution shows the user a word that changes under them. Rendering the greeting
only post-mount (as the sibling `eyebrow` already does at `:209`) costs one frame of
absence instead of a visible swap.

---

## (C) Data-model gaps requiring a migration

**None found on these surfaces.** Reported, never applied — and in this case there is
nothing to apply.

Each candidate was checked against the live schema and the read layer:

| Candidate | Verdict | Evidence |
| --- | --- | --- |
| `/archive` school years | **No migration.** Table exists; read layer already scoped. | `supabase/migrations/20260518102823_initial_schema.sql` contains `school_years`; `lib/planner/source.ts:182` — `listLessons(opts?: { schoolYearId?: string })` |
| Archived-year drill-in (B2) | **No migration.** Same scoped read serves it. | `lib/planner/source.ts:167-182` — "`schoolYearId` scopes master/authored lessons to one school year" |
| Schedule rotation (A3/B5) | **No migration for the UI.** Settings persist to `localStorage`, not Postgres. A future *cross-device* rotation sync would need a column — out of scope today. | `app/settings/schedule/page.tsx:18` — `mycurricula:team:schedule-rotation` |
| Roll-forward / seal-a-year (B2) | **Unverified — the one open question.** No code exists, so the required shape cannot be read off anything. Whether `school_years` already carries the columns a roll-forward would write is not determinable from a static read. | `grep -rniE "roll.?forward\|archive_year\|seal.*year"` → no implementation |

**The one thing to check before a build lane commits to B2:** inspect the live
`school_years` columns (`list_tables`, or `\d school_years`) to confirm it can express
"sealed / read-only" and the current-year pointer. If it cannot, B2 grows a migration.
Do not assume from the committed SQL — this repo has a recorded history of live RLS/schema
drift from migration files.

---

## (D) Deliberately dropped / deferred — do not re-litigate

| Item | Ruling | Source |
| --- | --- | --- |
| `/schedule` + `/archive` visual pass | **Deliberately left as-is.** Audited during the v2 sweep and found "already v2-consistent (dark-on-glass)"; the lane stood down. | `agent_shared_log.md:716-717, 748-749` |
| Schedule rotation engine | **Phase 1B.** The seam is designed and the plug point is named. | `lib/now-anchor.ts:11-15`; CLAUDE.md §1 status table — "rotation cycles deferred to Phase 1B" |
| `useMySchedule` adoption | **Follow-up wave, tracked with Phase 1B.** | `lib/use-my-schedule.ts:8-15` |
| Stage-photo picker / upload | **Later wave.** The handoff's `HomeCog` (`app.jsx:300`) has no v2 equivalent by choice; p1 ships as a fixed default and the `data-stage-photo` seam is already in place. Same-origin is load-bearing for the auto-tone luminance sampler. | `lib/stage-photo.ts:1-31`; `app/layout.tsx:139` |
| Home `canvas` variant (`min`, transparent) | **Recorded divergence** from the bundle's glass-light default; deferred to a W3.5 style-gear choice. | `components/chrome/Console.tsx:196-201` |
| `/planner` not V2-gated | **Known, intentional exception** — no v1 form exists on master to restore. | `lib/v2-flag.ts` (`V2_ROUTER_GATED` docblock) |
| `.cdot-av` / `.ctx-gear` chrome recipes | **Resolved, comment stale.** `ChromeContext.tsx:12-23` flags them as missing from `chrome.css`; they landed at `app/chrome.css:1588, 1606`. Only the TODO comment needs deleting. | verified here |

---

## (E) What works — must not regress

- **The print stylesheets are genuinely good.** `@page { size: A4 landscape }`
  (`weekly/print/print.module.css:175`; `year/print/print.module.css:171`), chrome
  suppressed under `@media print`, `page-break-inside: avoid` and per-month
  `page-break-before: always` (`year/print/print.module.css:224-235`), and a B&W hatch
  fallback so subject stripes survive a mono laser (`weekly/print/page.tsx:141-145`,
  `myc-print-stripe`). `app/themes.css:33` already guarantees "no stage, photo, glass
  float, or glow reaches print". **Fix the entry points and the data, not the CSS.**
- **Both print pages read live lesson data** — `usePlanner()` at
  `weekly/print/page.tsx:65` and `year/print/page.tsx:34`. The mock problem is confined
  to the *catalogs* (A9), not the lessons.
- **`/boards` has the best state handling on these surfaces.** Loading, truly-empty, and
  no-search-match are three distinct messages with role-aware copy
  (`components/teach/library/BoardLibraryModule.tsx:709-719`), plus an honest empty (not
  infinite-spinner) fallback when the client is misconfigured (`:231`).
- **`ScheduleDayPane`'s today-resolution is the correct house pattern** — SSR-safe null
  start, 60 s midnight re-check, now-tick enabled only for today's pane
  (`:95-113`). It is the one schedule surface that gets the day right; make the others
  match it, don't change it.
- **`/archive`'s empty state is well-written** and its collapse is a11y-consistent —
  `aria-hidden` tracks a genuine `max-height: 0; overflow: hidden` collapse
  (`ArchiveScreen.module.css:538-558`), so nothing is hidden from AT while visible.
- **`ChromeQuote` is carefully built** — `aria-haspopup="dialog"`, Escape + scrim
  dismissal, and a deliberate, documented refusal to claim `aria-modal` without a focus
  trap (`:292-299`).
- **`/home`'s week is correctly derived** — `lib/app-state.tsx:341-356` seeds from
  `resolveCurrentWeek(...)` against the configured academic year, explicitly **not** the
  frozen `CURRENT_WEEK` fixture. That regression was already found and fixed; do not
  reintroduce a mock seed here.
- **`/subject` redirects are minimal and correct** (A13) — 11 and 43 lines, no UI,
  prerendered. Leave them.

---

## Appendix — the systemic question: which of these surfaces run on mock fixtures?

This is the pattern behind what the user has been calling "v1 remnants". It is a data
problem, not a styling one.

**Three independent Supabase flags, each defaulting to mock:**

| Flag | Gates | Default | Evidence |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_PLANNER_USE_SUPABASE` | lessons, units, resources | off | `lib/planner/source.ts:418` |
| `NEXT_PUBLIC_TEACH_USE_SUPABASE` | **boards + widgets** | off | `lib/teach/client.ts:29-32` |
| `NEXT_PUBLIC_V2` | shell + router only (not data) | **on** | `lib/v2-flag.ts` |

All three are repo secrets in `.github/workflows/deploy.yml:105-107`, so their
production values are **UNKNOWN** from a static read.

**Surface by surface:**

- **`/boards` — YES, mock-backed, on its own third flag.** `lib/teach/client.ts:4-6`:
  *"In the default prototype path every method delegates straight to the in-memory
  mock."* `NEXT_PUBLIC_TEACH_USE_SUPABASE` is **separate from the planner flag** — so
  turning the planner on does not turn boards on. Additionally
  `components/boards/BoardsHome.tsx:28,51` imports `ME` from `@/lib/mock/teachers` and
  uses it as the board owner id whenever the flag is off:
  `const ownerId = USE_SUPABASE ? currentUser.id : ME.id`. **This is the finding most
  likely to be missed**, because `/boards` *looks* live — it has a real client facade, a
  real empty state, and real create/delete — and the flag that decides it is not the one
  anybody is watching.
- **`/schedule` — YES, mock-backed, and not behind any flag at all.**
  `lib/schedule-data.ts:90` `SCHEDULE_BY_DAY` is a hand-authored fixture read
  unconditionally. No flag switches it. (A3.)
- **`/archive` — YES, mock-backed, not behind any flag.** `useSchoolYears()` has no
  branch at all. (B1.)
- **Both print views — SPLIT.** Lessons are live (`usePlanner()`); the *catalogs*
  (`SUBJECTS`, `SUBJECT_BY_ID`, `UNIT_BY_ID`, `WEEK_DAYS`) come from `@/lib/mock`
  unconditionally. (A2, A9.)
- **`/home` — NO for its own data, and it is the clean one.** `HomeConsole` reads only
  `currentUser` and a live clock. The `week` shown in `ChromeContext` is properly derived
  from the academic year (`lib/app-state.tsx:341-356`) — the frozen `CURRENT_WEEK` bug
  was already found and fixed. **But** the flag-OFF `HomeV1` is heavily mock-fed
  (`lib/home/today.ts` imports `lib/schedule-data` and `TEACHER_BY_ID` from `lib/mock`),
  so the rollback build's home shows fixture data. Under the default flag `/home` renders
  almost no data at all, which is why it has so little to be wrong about — and is also
  exactly B3.
- **`/subject` — N/A**, pure redirect.

**The load-bearing observation.** The three flags are the *known* seam, and each one is
at least documented. The **unflagged `lib/mock` catalog imports are the real systemic
problem**: `SUBJECTS`, `SUBJECT_BY_ID`, `UNIT_BY_ID`, `WEEK_DAYS`, `TEACHER_BY_ID`, and
`ME` are imported directly by live surfaces and **no flag switches them**. Flipping every
Supabase flag to `1` would still leave `/weekly/print` printing Sunday–Thursday (A2),
both print views dropping custom subjects (A9), `/boards` owning boards as `ME.id`, and
`/schedule` showing a fixture timetable.

**Recommended follow-up beyond these surfaces:** a repo-wide sweep for
`from "@/lib/mock"` in `app/` and `components/`, classifying each import as *sample
content* (fine) or *catalog/identity* (a live-data bug). That sweep is the thing that
would find the rest of this class, and it is not scoped to any lane currently running.
