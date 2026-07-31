# Independent review — the four commits live on production

**Reviewer:** the QA lane. I did not author `63ec7cf`, `6f0e737` or `5317880`. I **did**
author `798e7e7`, and it is reviewed hardest below rather than softest.
**Persona:** strict, skeptical Senior Security & QA Engineer. **Read-only**; no writes, no
database.

**Scope:** `git show 63ec7cf 6f0e737 5317880 798e7e7` and
`git diff 21e511d..798e7e7 -- components lib scripts`, read at those commits.

---

## Verdict for the live consequence — read this first

**Nothing here warrants a revert.** No Critical, no High. Production is not harming a
teacher because of these four commits.

The two commits touching production code are both **net safety improvements** that fix
real defects, and the one commit I would have expected to be risky — the app-wide CSS
primitive change — turns out to have a much smaller live blast radius than its own commit
message implies (finding M2). `798e7e7` touches only `scripts/`, so it cannot reach a
teacher at all; its findings are about probe reliability, not product behaviour.

One **Medium** and three **Low** below. Per the contract I am therefore not writing
`NO BLOCKING ISSUES` — but nothing on this list should stop anyone's day.

---

## M1 · MEDIUM · `798e7e7` (mine) — the retry I centralised triples worst-case failure time on six probes

**`scripts/lib/auth.mjs:~105`** — `retries = 3` is the **default**.

I lifted the retry out of `probe-tooltip` (which had it locally, deliberately) and made it
the default for every caller. Six probes previously made **one** attempt and failed fast:
`probe-uxa`, `probe-b46-post-composer`, `probe-theme-wave`, `probe-b5-dayweek`,
`probe-loading-states`, `probe-v2-hydrate-gate`.

**Concrete failure scenario.** `probe-b46-post-composer` passes `timeout: 240000`. Against
a wedged or saturated dev server — the normal state of this repo today — it used to report
failure after **4 minutes**. It now burns **3 × 240s = 12 minutes** before saying the same
thing. An operator waiting on a gate, or any wrapper with a timeout under 12 minutes, gets
a kill instead of a result — and a killed probe reports nothing at all, which is strictly
worse than a fast failure.

I introduced this while arguing all day that a slow server must not be mistaken for a
defect; making failures three times slower to surface cuts against that.

**Suggested fix:** default `retries = 1` and let callers opt in. Restore `retries: 3` at
`probe-tooltip`'s callsite, which is where it was earned. Alternatively keep 3 but cap the
per-attempt timeout so total wall-clock is bounded.

## M2 · LOW → but the commit message overstates its own evidence · `5317880`

**`components/ui/Chip.module.css`** — `.filter.filter { padding: 5px 13px }`.

The change is correct in principle: `.cp-root button { padding: 0 }` (tokens.css:1128,
specificity 0,1,1) does out-rank `.chip`'s `padding` (0,1,0), so doubling the class to
(0,2,0) is the right instrument, and it is the house fix for this exact trap.

**But the live blast radius is close to zero, which the commit does not say.** Tracing the
consumers:

- `Chip`'s default variant is `"default"`, not `"filter"` (`Chip.tsx:52`), so only explicit
  `variant="filter"` callsites are affected — six lines across four files.
- The only one inside `.cp-root` (the planner root, `app/(planner)/layout.tsx:176`) is
  **`components/year/ResourcesSort.tsx`** — and `ResourcesSort` **has no importers**. A grep
  across `components/` and `app/` finds only two passing mentions in comments.
- The other three are onboarding steps, which sit outside the `(planner)` group and so
  never had the `.cp-root` reset applied — for them this is a genuine same-value no-op.

So the commit's claim that the zero-padding was *"measured live at both 1024 and 1280
(padding-left: 0px)"* is hard to reconcile with the only `.cp-root` consumer being dead
code. Either the measurement was taken against a component that is not mounted, or there is
a consumer neither I nor the commit has identified.

**Why it still matters even though nothing renders it:** this is a shared primitive. The
day someone mounts a filter-chip row inside the planner, every chip is **+26px wider and
+10px taller** than the geometry that row was designed against. That is a latent layout
change sitting in a canonical primitive, recorded as a no-op.

**Suggested fix:** no code change. Amend the record to state that the `.cp-root` path has
no live consumer, so the next person sizing a chip row knows the padding is now real.

## M3 · LOW · `5317880` — the coarse-pointer change was verified by hit test on the *other* primitive

**`components/ui/Chip.module.css`** — the `@media (pointer: coarse), (max-width: 900px)`
block sets `.filter.filter { min-height: 44px; padding-top/bottom: 10px }`.

Unlike `Button`'s change — a transparent `::before`, pure hit area, **no layout effect** —
this one changes **real geometry**: on any coarse-pointer device at any width, filter chips
grow from 36px to 44px tall. That is a layout change on tablets that previously received
the desktop geometry.

The commit's verification is *"Button.sm 32px visual / 44px hit at coarse@1024"* — a **hit
test**, on **`Button`**. Chip's height change at coarse@1024 was not verified for layout.

**Concrete failure scenario.** A teacher on an iPad Pro in landscape (1024px, coarse
pointer) opens onboarding's school-week step — a wrapping row of weekday filter chips. Each
chip is now 8px taller than the layout was tested against; a row tuned to fit on one line
can wrap onto two, shifting the step's controls. Low, because the row wraps rather than
clips and onboarding is a one-time surface.

**Suggested fix:** screenshot the three live filter-chip callsites (`grade-step`,
`school-week-step`, `onboarding-v2/schedule-step`) at coarse@1024 and confirm the rows still
lay out. A hit test on `Button` does not cover it.

## M4 · LOW · `63ec7cf` — the dismiss link is now provably mouse-only

**`components/ui/Tooltip.tsx`** — `interactive = showDismissLink && pointerEngaged`, and
`pointerEngaged` is set **only** in `handleMouseEnter`.

A keyboard-only teacher therefore never gets an interactive bubble, so "Turn off these
tips" can never be activated by keyboard. Tabbing toward it does not help either:
`handleBlur → hide()` closes the bubble before focus could reach the link.

**This is pre-existing, not introduced.** Before the change the bubble had
`pointer-events: auto` on focus-open, but `pointer-events` does not confer focusability and
the blur-closes-bubble path was identical — so the link was unreachable by keyboard then
too. The commit does not regress it; it makes it structural, while the message describes
the change as *"the better a11y outcome"*, which is true of the mousedown fix and not of
this.

**Mitigation that keeps this Low:** CLAUDE.md §4 provides a keyboard-reachable global
alternative — Settings → Appearance has "Show onboarding tooltips" and "Reset dismissed
tooltips". A keyboard user can turn tips off; they just cannot dismiss them one at a time.

**Suggested fix:** none required. If per-id keyboard dismissal is wanted, the bubble needs
to survive a focus move into it (a focus-within guard on the hide path) — a larger change
than this commit's scope, and it should be a deliberate decision rather than a patch.

## M5 · LOW · `798e7e7` (mine) — one token-leak shape the helper cannot close

**`scripts/lib/auth.mjs`.** The helper owns the URL and redacts everything it throws or
returns, and the selftest proves that on a real Playwright navigation error. Shapes I
checked and believe are covered: rejected promises, timeout strings (the URL appears
quoted, and the regex terminates on `"`), unhandled rejections (the thrown error is mine,
with my stack), `authedStorageState`'s propagation path, and screenshot filenames (the URL
never reaches one).

**The shape it cannot close:** a caller that installs its own **context-level route
interception** before calling the helper. `ctx.route("**/*", handler)` sees the login
navigation, and `request.url()` in that handler carries the token — outside the helper's
reach entirely. No current caller does this on a context it also authenticates
(`probe-4b-consolidated` routes a context, but `authedStorageState` builds its own
internally), so this is latent.

**Suggested fix:** document it in the module header as the one residual shape, and have any
probe that both routes and authenticates run `request.url()` through the exported
`redact()`. Worth doing precisely because the helper's existence invites callers to assume
they are safe.

---

## Checked and found clean — stated so the absence is evidence, not an omission

**`5317880`, the menu removal.** No positional breakage:

- Nothing indexes menu rows by position. The two `cleanedRows[...]` accesses are the
  divider-collapse logic, and the trailing-divider `while` is guarded by
  `cleanedRows.length > 0 &&` — present **before** this commit too, so an empty menu cannot
  crash.
- Leading/consecutive/trailing dividers are all collapsed, so removing an item that sat
  behind a `{ kind: "divider" }` cannot orphan a separator.
- The `"delete"` union member was removed with its only producer; no consumer references it
  (the three remaining matches are the explanatory comments).
- No test or probe asserts the old shape. `probe-4b-consolidated` greps for the string but
  treats *presence* as "fix not landed", so its verdict flips correctly to pass.

**A correction to my own earlier finding.** I reported this item as something *"a teacher
opens the context menu in Team mode and sees"*. That was wrong: the row is gated on
`isMaster`, and **no host threads that prop** — `grep isMaster` across `components/` returns
only `context-menu.tsx` itself. The item was **latent, never rendered**. The commit's own
severity note says exactly this and it is correct; my framing overstated the live exposure.
The removal was still right, but it prevented a future defect rather than fixing a live one.

**`6f0e737`** is probe-only (`scripts/probe-tooltip.mjs`), converting crashes into reported
FAILs. No production reach; consistent with the three-state discipline.

**`63ec7cf`, the rest of the Tooltip change.** I tried and failed to construct a
stale-`pointerEngaged` leak — the state is set only on trigger mouseenter and cleared in
`hide()`, which every close path runs; the 120ms grace window keeps it true only while the
cursor is genuinely in flight between trigger and bubble. `onMouseDown` is attached when
`showDismissLink` but can only fire when the bubble is `pointer-events: auto`, so it cannot
swallow a mousedown meant for content underneath. SSR is untouched: the portal renders only
while open, so first paint is unchanged and the "initial render assumes not dismissed"
contract holds. `required: true` bubbles still render no link and stay inert.

---

## Summary

| ID | Sev | Commit | Issue |
| --- | --- | --- | --- |
| M1 | **Medium** | `798e7e7` (mine) | centralised `retries = 3` triples worst-case failure latency on six probes |
| M2 | Low | `5317880` | `.filter.filter` padding is live-inert (only `.cp-root` consumer is dead code); message overstates its evidence |
| M3 | Low | `5317880` | coarse-pointer Chip height is a real layout change, verified only by a hit test on `Button` |
| M4 | Low | `63ec7cf` | dismiss link is mouse-only (pre-existing; Settings provides a keyboard alternative) |
| M5 | Low | `798e7e7` (mine) | a caller's own `ctx.route` can still observe the login URL |

**Revert recommendation: no.** All four should stay. M1 is the only one I would fix
promptly, and it is in my own commit, in `scripts/` — it costs an operator time, not a
teacher anything.
