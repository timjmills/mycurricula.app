# QA audit — Board Library (`/boards`) + app-wide console sweep

**Date:** 2026-07-31 · **Method:** live browser (Playwright, `chromium.launch({ channel: "chrome" })`) + code inspection
**Scope:** the Board Library rewritten in `a571d87`; app-wide console sweep.
**Status:** REPORT ONLY — nothing was fixed, nothing was committed.

---

## 0. Precondition — which tree was measured

Re-verified at the start **and** at the end of the run, because this repo is a shared
checkout with several lanes writing to one dev server.

| | at start | at end |
|---|---|---|
| `git rev-parse --short HEAD` | `988c710` | **`d283b18`** |
| `git diff HEAD --stat -- components lib app` | empty | **NOT empty** — `components/hub-v2/timeline/TimelineZoom.tsx`, `components/hub-v2/timeline/timeline.module.css` |

**HEAD moved under me and the tree went dirty mid-audit.** That is disclosed rather
than glossed, but it does **not** invalidate this report, because:

```bash
git diff --stat 988c710 d283b18 -- components lib app          # EMPTY
git diff --stat 988c710 d283b18 -- components/teach/library components/boards lib/teach lib/mock/boards.ts   # EMPTY
git status --short -- components/teach/library components/boards lib/teach lib/mock/boards.ts                # EMPTY
```

Every file this audit makes a claim about (`components/teach/library/*`,
`components/boards/*`, `lib/teach/*`, `lib/mock/boards.ts`) is **identical in both
commits and clean in the working tree**. The dirty files belong to a different lane
and a different route (`hub-v2/timeline`).

One real consequence: that other lane saving files caused Next dev recompiles during
my runs, and I observed a page blank out mid-session as a result. Treated as
environmental noise, not as a finding.

**Files created by this audit** (nothing else was written): `scripts/probe-qa-boards.mjs`,
`scripts/tmp/*.mjs` (scratch), `docs/screenshots/qa-boards/*`, this file.

---

## 1. The instrument comes first — seven ways this audit nearly returned a false result

This section is not padding. Every item below is a check that **reported nothing
wrong while being incapable of detecting anything wrong**. Each was caught and
corrected; they are recorded so the next person does not re-earn them.

1. **`route.abort()` cannot reach the board path at all.** Locally
   `NEXT_PUBLIC_TEACH_USE_SUPABASE` is unset, so `lib/teach/client.ts` proxies every
   call straight to the in-memory `mockTeachSource`. Measured on `/boards`:
   **0 xhr/fetch requests, 0 `/rest/v1/` requests.** The abort matcher matched **0**
   requests. The requested instrument is *vacuous by construction* here — it would
   have aborted nothing, the mock would have settled, and I would have reported a
   pass. **What a 0 means:** no claim in this report rests on network behaviour, and
   nothing here tests the live Supabase path.
2. **My own abort aborted the page document.** The first matcher used
   `/board/i.test(url.pathname)`, which matches `/boards` itself → `net::ERR_FAILED`
   on the document. This is precisely the "your injected error misread as an
   application failure" trap. Fixed with a strict `resourceType` gate.
3. **The login step poisoned the cache.** Booting via
   `claude-login?next=/boards` warmed the 8.4 MB `app/(planner)/boards/page.js`
   chunk; the later navigation served it from cache, `page.route()` never saw it,
   and fault injection patched **nothing while still "passing"**. Fixed by booting
   to `/`.
4. **The marker regex silently matched nothing.** The dev bundle emits
   `async listMyBoards (ownerId) {` — *with a space*. A `listMyBoards\(` matcher
   patched 0 bytes and reported success. Fixed to `\s*\(`.
5. **`route.fetch()` on a 304 returns an empty body.** One run served a
   zero-byte chunk; the page then rendered SSR markup only and never hydrated,
   which looks exactly like a stuck UI.
6. **Double quotes break the dev bundle.** Webpack dev wraps module source in
   `eval("…")`. Injecting `throw new Error("…")` terminated that string →
   `missing ) after argument list` → `ChunkLoadError` → blank page. Injected code
   must use single quotes.
7. **Hydration is the big one.** This dev server ships
   **`app/(planner)/layout.js` = 26 MB, `boards/page.js` = 8.4 MB,
   `main-app.js` = 7.6 MB**. Cold, I measured `/weekly` taking
   **162,583 ms to become interactive**, with repeated
   `ChunkLoadError: Loading chunk app/(planner)/layout failed (timeout)`.

   An un-hydrated `/boards` renders **"Loading your boards…" + "0 / 50 boards used"
   + "No templates yet" + "No team-shared boards yet"** — every one of those is the
   component's *initial state*, and together they look like a catalogue of severe
   bugs. I very nearly filed "Board Library is stuck on a permanent skeleton" as a
   critical finding. It is not a bug; it is an unhydrated page.

**Therefore every live claim below is gated.** The gate is a pure client-state
control: click **"Dismiss tips"** and confirm the Tips bar actually disappears. That
only succeeds if React has hydrated and is handling events. Any result without
`hydrated=true` is reported as **DID NOT RUN**, never as a pass.

---

## 2. What the local fixtures can and cannot exercise

`lib/mock/boards.ts` builds every board with `ownerId: null` and `scope: "team"`.
`myBoards()` filters `scope === "personal" && ownerId === owner`, so
**`listMyBoards(ME.id)` legitimately returns `[]`.**

- The **Personal** segment is *correctly* empty locally — the expected render is the
  empty copy, and there are **zero personal board cards to inspect**.
- The **Team** segment has 3 fixture boards, so tints / sort / rows were exercised
  there instead.
- `BOARD_TEMPLATES` supplies 3 templates.

This bounds several checks below, and each is labelled where it bites.

---

## 3. BUGS

Ranked. Severity is about the teacher's experience, not the size of the fix.

### BUG-1 · MAJOR · Templates strip still reports a failed read as "you have none"

**Confirmed live, with a hydration gate and a positive control.**

Injecting a failure into `listBoardTemplates` renders:

> No templates yet — save a board as a template using its ⚙ settings.

**Positive control proving this is real and not an unhydrated page:** in the very
same render, the board list showed its correct settled-empty copy and the Team
Library strip listed all three fixture boards — so the page was hydrated and *only*
the template read was broken.

```
patched: 1  hydrated: true
templatesLine   : "No templates yet — save a board as a template using its ⚙ settings."
boardListRegion : "No boards yet — click “New board” to create your first one…"   <- control
teamStripTitles : ["Number Talks Routine","Close Reading Stations","Friday Reflection Whiteboard"]  <- control
```

This is the identical defect class the commit fixed one panel over: a teacher who has
saved templates is told they have none, and invited to go make one. The `.catch()` at
`components/teach/library/BoardLibraryModule.tsx:446` only clears the loading flag —
there is no error state, and the render at `:999-1002` reaches the empty copy on both
the empty *and* the failed path.

- **Repro:** open `/boards`, make `teach.listBoardTemplates` reject.
- **Screenshot:** `docs/screenshots/qa-boards/FINAL-templates-failure-1440.png`
- **Suspected:** `BoardLibraryModule.tsx:437-448` (effect) and `:997-1002` (render)
- **Fix:** give templates the same three-value readiness as the board list — a
  `templatesState: "pending" | "error" | "settled"`, with the empty copy reachable
  only from `settled`.

### BUG-2 · MAJOR · `OpenInBoardDialog` has the same lie (code-confirmed, not live)

```ts
// components/boards/OpenInBoardDialog.tsx:150-151
} catch {
  setExisting([]); // fail soft — the picker shows its empty state
}
```

`existing.length === 0` then renders (`:226-229`):

> No boards to add to yet — go back and create a new one.

A teacher with 40 boards whose read fails is told to go create one. Same class,
third instance.

- **Live check: DID NOT RUN.** Reaching this picker needs a resource → "Open in
  board" → "Add to an existing board…" flow I did not drive. Reported on code
  reading only.
- **Fix:** distinguish `null` (pending) / error / settled-empty, as
  `BoardListRegion` now does.

### BUG-3 · MINOR · Team Library byline silently drops the age

The handoff's row is `{by} · {ago}`. Live, all three rows render the name only:

```
"Number Talks Routine | math | warm-up | Sarah Khouri"
"Close Reading Stations | reading | centers | Maya Al-Rashid"
"Friday Reflection Whiteboard | Friday | Reflection | Jonas Delacroix"
```

`relativeAgo()` returns `null` beyond 30 days (`BoardLibraryModule.tsx:250-251`) and
the byline joins away the missing half. Deliberate ("no honest short form"), but the
result is that *every* board older than a month loses its recency signal — which is
exactly when a teacher most wants it.

- **Screenshot:** `docs/screenshots/qa-boards/FINAL-team-1440.png`
- **Fix:** fall back to an absolute date ("Jun 2026") rather than nothing.

### BUG-4 · MINOR · Touch targets below 44 px at phone and tablet

Emulation stated up front, because device emulation lies twice: contexts were created
with **`isMobile: true`, `hasTouch: true`, `deviceScaleFactor: 3 (375) / 2 (768)`**,
and I verified `matchMedia("(pointer: coarse)")` returned **true** at both tiers.

**23 interactive controls under 44 px at 375 px and at 768 px.** The worst are the
primary console tabs:

| control | 375 px | 768 px |
|---|---|---|
| Day / Week / Year / Plan / Post / Teach | 47-54 × **32** | 61-74 × **32** |
| Team Boards / Personal Boards segments | 158 × **40** | 123 × **40** |
| "Skip to content" | 136 × 38 | 136 × 38 |

CLAUDE.md §4 requires ≥44 px on phone and tablet. The nav tabs are global chrome
rather than Board-Library code, but they are on the audited surface at both mobile
tiers.

- **Screenshots:** `docs/screenshots/qa-boards/boards-375.png`, `boards-768.png`

### BUG-5 · TRIVIAL · Inline style bypasses the token layer

`BoardLibraryModule.tsx:990` — `style={{ marginTop: "var(--r-16)" }}`. CLAUDE.md §4
puts spacing in the `.module.css`. Cosmetic, but it is the one place in this file
that reaches around the stylesheet.

---

## 4. What is working well — specifically

Not a courtesy paragraph. These were each adversarially attacked and held.

**The honesty fix does exactly what it claims, in both directions, live.** This is
the headline result and it is a genuine pass, proven with real fault injection plus a
hydration gate:

| direction | injected condition | rendered | verdict |
|---|---|---|---|
| read FAILS | `listMyBoards` + `countMyBoards` throw (`patched:1, hydrated:true`) | **"Couldn't load your boards" / "Check your connection and reload. Your saved work is safe."** — and **no** "No boards yet" | PASS |
| read SUCCEEDS, genuinely empty | untampered (fixtures hold 0 personal boards) | **"No boards yet — click "New board" to create your first one, or start from a template below."** — and **no** error copy | PASS |

Both directions matter: a fix that answered "couldn't load" for an empty library
would pass the first row and lie in the second. It does not.
Corroborated off-browser by `tests/board-library-load-failure.test.ts` — **12/12 pass**.

- **Screenshots:** `FINAL-injected-error-1440.png`, `FINAL-personal-empty-1440.png`

**Per-kind preview tints are real — no card is hard-coded blue.** Resolved values
from the Team segment:

- `Number Talks Routine`, `Close Reading Stations` → `--preview-accent: #2e6be6`
  (blue, subject)
- `Friday Reflection Whiteboard` → `--preview-accent: #f2802b` (orange, day)

**Sort genuinely reorders.** "Title A–Z" changed the order and was verified
programmatically to be alphabetical:

```
updated : ["Friday Reflection Whiteboard","Close Reading Stations","Number Talks Routine"]
title   : ["Close Reading Stations","Friday Reflection Whiteboard","Number Talks Routine"]   alphabetical: true
```

**Team Library rows carry all three bands** — family chip (`chip: true` on every
row), tag chips (`math` / `warm-up`, `reading` / `centers`, `Friday` / `Reflection`),
and a publisher byline resolved to a real teacher name.

**No document-level horizontal scroll** at 375 / 768 / 1440 (`scrollWidth ===
clientWidth` at all three). Cross-checked against the `overflow-x: clip` blind spot
by also measuring the widest element overhang; the only overhang was the loading
`Skeleton` sheen, which is clipped and not user-visible.

**Console is clean on `/boards`.** Across four hydrated loads the only output was the
known-benign dev warning `Can't resolve 'canvas'` (linkedom). Zero unprompted errors,
zero unhandled rejections — including in the injected-failure run, which is the point
of the fix: the failure is *rendered*, not thrown.

---

## 5. Checks that DID NOT RUN — stated, not quietly dropped

| check | why it could not run |
|---|---|
| `route.abort()` error injection (as briefed) | **0** matching requests on the mock path. Replaced with chunk-level fault injection, which is what actually produced the §4 result. |
| Preview tints for **purple / green / slate** | No fixture board resolves to those kinds. "Friday Reflection Whiteboard" has no `whiteboard: true` flag, so it resolves via its weekday tag to *day/orange*, not purple. Only 2 of 5 families are observable locally. |
| Sort "Recently updated" vs "Recently created" | Both produce the **identical** order across the 3 fixtures, so the two cannot be told apart. This is **not** evidence of a bug — the instrument cannot separate them. |
| Per-kind tints / sort on the **Personal** segment | Zero personal boards in fixtures (§2). |
| `useId` hydration mismatch on the sort control (item 1e) | **NOT REPRODUCED.** Four hydrated `/boards` loads, console listeners attached before navigation, produced only the linkedom warning — no `htmlFor`/`id` mismatch, no hydration warning of any kind. Positive control: the hydration gate passed in all four (Tips bar dismissed by a real click). I cannot confirm the reported finding on this build; I also cannot prove its absence, since a mismatch only logs during the initial hydration pass. |
| BUG-2 live reproduction | Picker flow not driven (see BUG-2). |
| Part 2 app-wide console sweep | Delegated; see §7. |

### The ~300 px side-panel wrap guard — measured, but the guard is not the binding constraint

Forcing the module's root to a narrow width on a 1440 viewport (8 filter pills
present on the Team segment):

| container | filter row width | pills fit? | sort fits? | sort on own line? | overflow |
|---|---|---|---|---|---|
| 280 px | 28 px | no | no | yes | 2 px |
| 300 px | 48 px | no | no | yes | 0 |
| 340 px | 88 px | no | no | yes | 0 |
| 420 px | 168 px | **yes** | no | yes | 0 |

The sort control does wrap to its own line as designed. But the `.filters
{ min-width: 200px }` guard never gets to matter, because the **sidebar does not
collapse**: that collapse lives behind `@media (max-width: 1023px)`, a *viewport*
query, so in a narrow container on a wide viewport the sidebar keeps its full width
and leaves `.main` only ~48 px.

**Severity: informational, not a bug.** The module's own header comment claims it is
"usable inside a ~300-340px side panel", which a viewport media query cannot deliver
— but neither real callsite renders it that narrow: `BoardsHome` is full-width and
`TeachOverlays` uses `width: min(1100px, 100%)`. The comment overstates; the app is
fine. If the module is ever genuinely put in a side panel, this needs a container
query.

---

## 6. IMPROVEMENTS (not bugs)

1. **Give the Team Library strip and the Templates strip the same three-state
   treatment as the board list.** The strip already got its own error copy in
   `a571d87`; templates did not (BUG-1). Doing all three from one shared
   `useAsyncList` hook would stop this class recurring a fourth time.
2. **Audit every remaining `catch { setX([]) }` in the boards/teach tree.** Three
   instances of one lie have now been found; the pattern, not the instance, is the
   defect.
3. **On `dataState === "error"`, the tag filter pills still derive from the stale
   `boards` state** and would render above the error message. Not observed live
   (the failing segment had no boards, hence no pills), so this is a code
   observation only — but it is inconsistent with "a failed refresh reports the
   failure instead of silently showing stale content as current"
   (`BoardLibraryModule.tsx:419-421`).
4. **Dev bundle size is a real developer-experience cost** — 42 MB of JS across
   three chunks, 162 s to interactive cold. It makes every live QA pass on this repo
   slow and, worse, makes false negatives the default outcome for anyone who waits
   the "normal" 8 s.

---

## 7. Part 2 — app-wide console sweep

**Status: DID NOT COMPLETE.** Delegated to a parallel agent covering `/planner`,
`/weekly`, `/daily`, `/year`, `/teach`, `/post`, `/catch-up`, `/settings`. Route
screenshots were produced (`docs/screenshots/qa-boards/sweep-*-1440.png`) but no
verified per-route console result was returned before this report was written.

It is reported as *not run* rather than as *clean*, and this matters more than usual
here: per §1.7, a sweep that waited ~8 s per route on this dev server would have
measured **unhydrated pages**, where the console is quiet because nothing has
executed. Such a sweep would report "no errors" on every route and would be worth
nothing. In particular the known `WeeklyShellInner` `useId` mismatch **cannot fire on
an unhydrated page**, so a "not seen" result there is a false negative by
construction.

**To finish this properly:** pre-warm each route's chunks (`curl` the route and its
`/_next/static/chunks/app/(planner)/<route>/page.js`) until they return in seconds,
then load each route with the same hydration gate used above, and only then read the
console. Anything else is not a measurement.

---

## 8. Verdict

The change under audit — making the Board Library's failed read say *"couldn't
load"* instead of *"you have none"* — **works, in both directions, and is
confirmed live under real fault injection.** That was the point of the commit and it
holds up.

The unfinished business is that the same lie survives in two sibling places: the
Templates strip (BUG-1, confirmed live) and `OpenInBoardDialog` (BUG-2, code-level).
Neither is on the critical path of the audited surface, so this build is not blocked
by them — but they are the same defect, and the commit message already
acknowledges the templates one as deliberately out of scope.

No critical finding on the audited surface. **Part 2 remains outstanding.**
