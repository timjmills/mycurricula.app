# The consolidated §4b pass — design

**Design only. Not yet run.** One browser session, one server, one settled tree.

---

## 0. PRECONDITION BLOCK — fill this in at run time, before the browser opens

```sh
git rev-parse --short HEAD                 # the sha this pass certifies
git status --short | wc -l                 # MUST be 0, or name what is dirty
gh run list --limit 3 --json headSha,conclusion,workflowName
```

**State the sha in the result.** HEAD moved three times while this document was being
written (`c1190f7` → `e8f403f` → `63ec7cf`), so quoting the sha from the brief is not
good enough — quote the one you measured.

**Abort the whole pass if the tree is dirty.** The point of waiting for the lanes is that
this pass certifies a commit. A dirty-tree run certifies nothing, and we have already had
one incident from measuring uncommitted work.

**One server, and prove it:**

```sh
# Windows: expect exactly ONE listener in 3000-3099
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -ge 3000 -and $_.LocalPort -le 3099 }
```

More than one → stop and kill the strays. Five servers on one `.next` already faked an
SSR deadlock convincingly enough to stop the line.

---

## 1. Harness contract

- **Auth: cookie-only.** The claude-login hop is a GET; let the session cookies do the
  rest. A global `Authorization: Bearer` header overrides Supabase's session key and
  manufactures ~21 false `403`s plus a false `hydrate failed` cascade.
- **Block `teacher_preferences` at the network layer.** Local dev points at the **prod**
  Supabase project, so seeding theme `localStorage` would make theme-sync **write to a
  real teacher's row**. Blocking the table also stops the reconcile from flipping the
  frame mid-test (it does so 10–45 s after hydrate).
- **Never block non-GET generally.** The planner hydrate runs through Next **server
  actions** — POSTs to the page route — so reads and writes share method and URL. A
  blanket gate produces a false "no data".
- **Pin the frame with cookie + `localStorage` + the block, all three.** The
  `mc-theme-axes` cookie seeds SSR attributes only; the client reconciles over it.
  Assert `document.documentElement.dataset.frame` **before** judging anything.
- **Seed `mycurricula:onboarding` finished** or `FirstRunRedirect` yanks a long-lived
  page to `/onboarding` mid-measurement.
- **Frame-agnostic openers:** `[data-year-chip], [data-year-unit-workspace]`.
- **`net::ERR_ABORTED` on prefetch/navigation is not a failure signal.**

---

## 2. The core problem: telling "broken" from "not hydrated"

Every false finding today came from asserting against a page that had not finished
hydrating. The dev server is contended, hydrate is ~10 s and variable, and a
`ChunkLoadError` can wipe the hydrated DOM entirely. **An unhydrated page is
indistinguishable from "the control does nothing" and from "zero results".**

Three gates, in order. **All three abort; none of them report a finding.**

### Gate A — the page is hydrated (positive signal, polled, never slept)

```js
// Poll for real canvas data, up to 45s. NEVER a fixed sleep.
await page.locator('[data-planner-item^="lesson:"], [data-year-chip], [data-year-unit-workspace]')
  .first().waitFor({ state: "attached", timeout: 45000 });
await page.waitForTimeout(2500);  // handlers attach AFTER the node exists
```
Never appears → **ABORT this step: "not hydrated in 45s"**. That is an environment
result, not a defect.

### Gate B — the page is INTERACTIVE (a control-group control)

This is the gate that was missing all day, and it is the one that makes a
"this control does nothing" claim trustworthy.

Before asserting that a *suspect* control does nothing, prove a *known-good* control in
the same tree still works — e.g. switch drawer panes and confirm `aria-selected` moves,
or toggle Grid→List and confirm the canvas changes. If the known-good control also does
nothing, **the page is dead, not the feature** → ABORT.

**No "X does nothing" finding may be filed without a passing Gate B in the same step.**

### Gate C — no chunk failure during the step

```js
page.on("console", m => { if (/ChunkLoadError|Loading chunk .* failed/.test(m.text())) stepDead = true; });
page.on("pageerror", e => { if (/ChunkLoadError/.test(String(e))) stepDead = true; });
```
Set → **ABORT and retry the step once.** A wiped DOM produces exactly the "element not
found" signature of a real regression.

### And the assertion-order rule for anything that persists

Immediately-after-write **with no reload** → after collapse/re-expand → after full reload
→ in the DB. A value that passes the last two but fails the first is the post-mutation
reload bug, and reloading before asserting hides it.

---

## 3. Ordering — one session, minimal churn

The expensive operations are **context creation** (auth + ~10 s hydrate) and **frame
changes** (cookie + `localStorage` + reload). Route changes are cheap by comparison.

So: **group by (frame × viewport), and do every check that combination allows before
moving on.** Seven contexts total.

| # | Context | Checks |
| --- | --- | --- |
| 1 | **1440 · glass** | the workhorse — §4.3 ToggleGroup, §4.4 Kind, §4.5 Delete removal, §4.6 Tooltip, §4.8 workspace entry points, §4.9 Hub, §4.7 `/post` |
| 2 | 1440 · paper | §4.1 `/daily` empty-state (paper copy), §4.8 opener in paper |
| 3 | 1440 · color | §4.1 `/daily` empty-state (color copy), §4.8 opener in color |
| 4 | 1440 · glass | §4.2 `/weekly` List (explicit toggle) + Schedule |
| 5 | 768 · glass · coarse | §4.2 narrow `/weekly`, §4.10 touch targets |
| 6 | 375 · glass · coarse (`isMobile` + DSF 3) | §4.2 narrow, §4.10 touch targets |
| 7 | 1440 · glass | re-run §4.1 on glass **last**, as a canary — if it now fails, the session degraded and everything after context 1 is suspect |

Context 1 does the most because most checks are frame-agnostic; only `/daily`'s
empty-state and the openers genuinely need all three frames.

---

## 4. The checks

### 4.1 `/daily` no longer claims "No lessons planned" — all three frames

Each of `DayA` / `DayB` / `DayC` carries its own copy of the string, so one frame passing
proves nothing about the other two.

**Method** — poll at 250 ms from navigation, recording the first appearance of the empty
string and the first appearance of a lesson:

- **PASS:** the empty string is never observed while lessons are still loading; a loading
  affordance (skeleton / "Loading your plan…") is observed instead.
- **FAIL:** the string appears at any sample before lessons render.
- **ABORT:** no lessons ever render (Gate A) — cannot distinguish a fixed empty state from
  a genuinely empty day.

**Measure the lie window, not the nav time.** The previous report said ~20 s; polling
properly gave **9.5–11.6 s**. Report first-appearance → resolution.

**Also assert the honest states still work:** a genuinely empty day must still say so
*after* hydrate, and the error state must render when the store errors. A fix that
replaces the lie with a permanent skeleton is not a fix.

### 4.2 `/weekly` reaches the unit workspace at ≤900px, in List, and in Schedule

**A design note that shapes this check:** `WeeklyShell.tsx:1251` is
`const showList = isNarrow || viewMode === "list"` — **narrow width forces List**. So
"≤900px" and "List mode" are partly the same code path. Test them as three distinct
cases anyway:

| Case | How to reach it | Why it is distinct |
| --- | --- | --- |
| List at **1440** | explicit Grid→List toggle | List renderer at desktop width |
| **768 / 375** | width alone forces List | narrow layout + coarse pointer |
| **Schedule** at 1440 | explicit Schedule toggle | a different renderer entirely |

Each: locate an opener, activate it, assert **exactly one** `.ue-modal` / `.ue-scrim`,
URL unchanged (pop-in, not navigation), Escape closes, scroll lock released.

**Assert exactly one, never zero** — with local mounts retired, a surface wired to
neither source renders **zero** dialogs, and "at most one" would pass that silently.

### 4.3 `ToggleGroup` keyboard semantics

Three separate assertions; do not collapse them:

1. **Arrow moves focus without committing** when a destructive/clearing option is
   present: focus the last option, ArrowRight, assert `document.activeElement` moved
   **and** `aria-checked` / the bound value did **not** change.
2. **The already-selected option does not fire `onChange`**: activate the selected
   option, assert no state change and no store mutation.
3. **No double-commit when nested inside another arrow handler.** **Precondition:** a
   real nested instance must exist. Search for a `ToggleGroup` inside a `role="tablist"`
   or another arrow-key container; **if none exists, record "no instance — not testable"
   rather than writing an assertion that cannot fail.**

### 4.4 The assessment Kind control specifically

The highest-consequence instance, and it needs its own step because it is about **data
loss**, not focus.

1. Open a unit assessment with all four fields populated (title, kind, purpose, notes).
2. Focus the Kind group on **Summative**.
3. **ArrowRight** (the wrap that previously committed `Not set`).
4. **Assert all four fields still hold their values** — in the editor with **no reload**,
   then after a reload.

**PASS:** four fields intact. **FAIL:** any field cleared. **ABORT** (Gate B) if the
control is not responding at all.

### 4.5 "Delete from Team Curriculum" removed, nothing positional broken

- Open a lesson context menu **in Team Curriculum mode** (the item was `isMaster`-gated).
- Assert the item is **absent**.
- **Assert the menu did not break around its removal:** no leading, trailing or doubled
  divider; every remaining item still fires its own action (activate two by keyboard and
  confirm the expected effect, not just that the menu closed).

The removed row sat behind a `{ kind: "divider" }`, so an orphaned divider is the likely
collateral.

### 4.6 Tooltip — three distinct behaviours

1. **Hover-open bubble still clickable** — hover the trigger, move into the bubble,
   click a link inside it, assert the click landed.
2. **Focus-open no longer swallows a click** — Tab to the trigger (opening the bubble via
   focus), then click the control *underneath/behind* the bubble, and assert **that**
   control received the click.
3. **"Turn off these tips" actually dismisses — it never has.** Click it; assert (a) the
   bubble closes, (b) the id is written to the dismissal store, and (c) **the tooltip does
   not reappear on a fresh hover**, and (d) **still does not after a page reload**.
   (c) and (d) are the assertions that would have caught this; (a) alone always passed.

Also assert a `required: true` tooltip (the Personal/Team toggle) **still shows** and
offers no dismiss link.

### 4.7 `/post` composer Resource button

`scripts/probe-b46-post-composer.mjs` already exists — **run it rather than rewriting it**,
and treat its exit code as the result. Add only what it lacks: Gate B before any
"button does nothing" conclusion.

### 4.8 Unit workspace from every entry point — exactly one, never zero

`/year` (glass · paper · color), `/daily`, `/weekly` (Grid · List · Schedule), Hub.
Per entry: **exactly one** `.ue-modal` and `.ue-scrim`, URL unchanged, close returns to
zero, `document.body.style.overflow` applied on open and **removed** on close (the inline
property — computed style only shows the lock is not stuck, not that cleanup ran), across
**two** open/close cycles.

### 4.9 The Hub cannot put two dialogs on screen; the page is never left unscrollable

- Drive the Hub path that previously allowed a second dialog; assert the count never
  exceeds 1 at any point (poll during the transition, not only after it settles).
- After every close in the whole pass, assert `document.body.style.overflow === ""`.
- **The behavioural scroll check does not apply here** — this app scrolls in internal
  containers, and `document.body.scrollHeight > clientHeight` is false even before any
  modal opens. Assert the **inline property**, and if you want a behavioural check, target
  the internal scroll region.

### 4.10 Touch targets — coarse pointer, by HIT TEST not bounding box

`Button` / `Chip` / `ToggleGroup` inflate to ≥44 px via a transparent `::before` at
≤900 px, which a `getBoundingClientRect` read **cannot see** — that produced a wrong
MAJOR earlier today.

**Method:** scroll the control to the centre of its scroll container, require its **own
centre** to hit itself (sanity gate), then `elementFromPoint` at the extremities of a
44 × 44 box, and bisect for the true extent. Use **real coarse-pointer emulation**
(`isMobile: true` + deviceScaleFactor, and a context that reports `pointer: coarse`) — a
desktop window resize does not reproduce it.

**And check for clipping:** a correctly-guarded `::before` can still be cut by an
ancestor with `overflow` (this is exactly how the Kind chips measured 36.6 px). Walk the
ancestor chain for the first clipping ancestor when a target comes up short.


### 4.11 Cross-device onboarding persistence — **SIMULATED**

Covers the defect found in `WORKSPACE-MODEL-RECONCILE.md`: `onboarded_at` persists while
courses / schedule / year do not, so a second device gets an app that believes it is
configured and is not.

**Label every result from this check `SIMULATED`.** It is a model of the failure, not the
failure.

**Method — a second context, same identity, empty client storage:**

1. Context A: complete the wizard (workspace name, at least one course, a school week, a
   year, an appearance change). Record what was entered.
2. Capture `storageState()` and **strip `localStorage`/`origins` from it, keeping only
   the auth cookies.** That is the model: same teacher, new device.
3. Context B: open with the cookies-only state. Assert:
   - **Not redirected to `/onboarding`** — proves `onboarded_at` persisted.
   - Then, per setting: workspace name present? courses present? school week correct?
     year correct? appearance correct?

**Expected at time of writing** (this check should FAIL until the persistence fix lands —
if it passes on the first run, verify the simulation is real before believing it):
workspace ✅, appearance ✅, courses ❌, schedule ❌, year ❌.

**What this simulation CANNOT prove:** that nothing *else* re-seeds the config from a
source I did not clear. Stripping `localStorage` models a new device, but the app may
also read `sessionStorage`, IndexedDB, a cookie, or a server value I have not enumerated.
So a **PASS here is weaker than a FAIL**: a failure proves the config did not travel; a
pass only proves it travelled *by some route*, which is what we want, but does not prove
the route is durable. If it passes, name which store it came from before calling it fixed.

**Also assert the recovery path**, since it is the mitigation: `/onboarding` still loads
the v2 wizard directly by URL, and `shortcuts-overlay.tsx:254` is the only in-app link to
it.
---

## 5. What this pass CANNOT verify live — named, not faked

1. ~~**Cross-device onboarding persistence.**~~ **NOW COVERED — as a SIMULATION, see
   §4.11.** A second context sharing the auth cookie with stripped `localStorage` models
   the real failure. Read §4.11's limits: a PASS there is weaker evidence than a FAIL.
2. **The nested-ToggleGroup double-commit**, if no nested instance exists in the tree
   (see 4.3.3). No instance → no assertion.
3. **The `unit_assessments` reorder partial-renumber race.** It needs a concurrent
   delete between the RPC's ownership check and its `UPDATE`. A single browser session
   cannot force that window; it needs two concurrent writers. The *ordering* assertion
   (`display_order` exactly `0..n-1`) is still worth running — it detects the damage even
   though it cannot cause it.
4. **Anything requiring a real second teacher** — the RLS lead-visibility inversion needs
   a second authenticated identity, which this session does not have.
5. **The four §4c write round-trips** — out of scope here; they live in
   `docs/4c-write-plan.md` and are held for the user.

---

## 6. Partial results — the reporting shape

A degrading server must produce a **map of what is trustworthy**, not a blanket verdict.

### 6.1 The failure mode that makes this necessary: absence-assertions fail OPEN

This is the trap to design around, and it is not obvious.

Several checks here assert an **absence** — `/daily` never shows "No lessons planned";
the Kind arrow never clears four fields; "Delete from Team Curriculum" is not in the menu;
the dialog count never exceeds one.

**On a dead or unhydrated page, every one of those passes.** The string never appears
because nothing appears. The fields are never cleared because they never render. The menu
item is absent because the menu is absent. A degrading server therefore manufactures
**false passes** in exactly the checks that matter most today.

**Rule: an absence-assertion is only valid with a passing Gate B recorded at the same
moment.** Without it, the result is `UNVERIFIED`, never `PASS`.

### 6.2 Per-context trust ledger

Do not rely on the single end-of-run canary alone — it tells you *that* the session
degraded, not *when*. Instead:

- **Entry canary** at the top of every context: Gate A + Gate B on a known-good surface.
- **Checkpoint** after every individual check: a one-line Gate B re-probe (cheap — click a
  known-good control, confirm it responds).
- **Exit canary** at the end of every context.

That gives an exact boundary rather than a guess.

| Entry | Exit | Context verdict | What it means for the checks inside |
| --- | --- | --- | --- |
| pass | pass | **TRUSTED** | results stand |
| pass | **fail** | **DEGRADED** | checks up to the **last passing checkpoint** stand; everything after is `UNVERIFIED` |
| **fail** | — | **NOT RUN** | no results; not a failure of the code |

### 6.3 Result vocabulary — four values, and `UNVERIFIED` is not a soft `FAIL`

| Value | Meaning |
| --- | --- |
| `PASS` | asserted true, with Gate B passing at that moment |
| `FAIL` | asserted false, with Gate B passing at that moment — a real defect |
| `UNVERIFIED` | the assertion ran but its trust preconditions did not hold. **Not evidence either way.** |
| `NOT RUN` | never reached (context aborted, or precondition failed) |

`UNVERIFIED` and `NOT RUN` must never be summarised as "no problems found". The headline
count is `PASS` / `FAIL` **out of checks actually verified**, with the unverified count
stated beside it — e.g. *"14 verified: 13 pass, 1 fail. 5 unverified (context 4 degraded).
2 not run."*

### 6.4 Re-run policy

- A `FAIL` inside a `DEGRADED` context is **re-run in a fresh context before being
  reported** — a degraded server produces false failures as readily as false passes.
- A `FAIL` in a `TRUSTED` context is reported as-is; do not re-run to seek a nicer answer.
- If two or more contexts come back `DEGRADED`, **stop the pass and report the
  environment**, rather than finishing a run whose results are mostly unverifiable. The
  server being unfit is itself the finding, and it is a cheaper thing to report than a
  half-trustworthy audit.

---

## 7. The fail-open guard, and its proof

Everything in `scripts/probe-4b-consolidated.mjs` is only as trustworthy as one guard:
the thing that stops an absence-assertion reporting `PASS` on a dead page. So the guard
has its own test, which needs no server, no browser, and one second.

Run it **before every real pass** and paste the output beside the results:

```
node scripts/probe-4b-consolidated.mjs --selftest
```

### Output — recorded 2026-07-25 against `6f0e737`

```
── SELFTEST — the fail-open guard ──
  UNVF [selftest] guard: absent + NO control — REFUSED: absence-assertion constructed
                                               without a control probe (fail-open guard)
  UNVF [selftest] guard: absent + DEAD control — control-group control did NOT respond at
                                                 assertion time — page may be dead, so
                                                 "absent" proves nothing.
  ok   [selftest] guard: absent + LIVE control
  UNVF [selftest] guard: fail without Gate B — WOULD-FAIL but Gate B did not pass in this
                                               step (page may be dead) — must downgrade,
                                               not fail

selftest got : ["unverified","unverified","pass","unverified"]
selftest want: ["unverified","unverified","pass","unverified"]
SELFTEST PASS — a bare or dead absence-check cannot report PASS
```

Exit code `0`. Four cases, and the middle two are the ones that matter:

| Case | Result | Why it matters |
| --- | --- | --- |
| absence + **no** control | `unverified` | the check is **unconstructible** without a control — refused at the signature, not by convention |
| absence + **dead** control | `unverified` | a control that does not respond *at the moment of assertion* proves the page may be dead, so "absent" proves nothing |
| absence + **live** control | `pass` | the only path to a green absence result |
| `fail()` with no Gate B | `unverified` | a would-be defect downgrades rather than being filed against a possibly-dead page |

### Why this artifact exists at all

The contrast probe that inflated every ratio it reported had one property in common with
a broken absence-check: **the error ran in the direction that manufactures passes**, and
nobody investigates a comfortable number. That probe's gate had never been *seen to fail*,
so there was no evidence it could.

This selftest is that evidence. It is deliberately cheap enough that there is no excuse
for skipping it, and it fails loudly (exit 1) if the guard ever stops holding — which is
what would happen if someone later added a convenience overload accepting a bare boolean.

### The rehearsal, for completeness

Against a dead port (`--base=http://localhost:3199 --rehearse`): **0 pass, 0 fail,
8 abort, 0 token leaks, exit 1**, no throws escaped. A harness that reports a tidy green
against a server that is not running is wrong, and this is the cheapest way to find out.
