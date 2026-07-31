# Entry-path audit — `/` · `/login` · `/welcome` · `/onboarding` · `/invite/[token]`

**Date:** 2026-07-31 · **Scope:** a teacher's first five minutes · **Mode:** read-only
(no dev server, no browser, no production contact)

> **Snapshot disclaimer** (CLAUDE.md §8). This is a dated snapshot. Verify against
> current code before treating any finding as open or any recommendation as binding.

## Precondition block (CLAUDE.md §4b)

```
git rev-parse --short HEAD                → 6ba6ae8
git diff HEAD --stat -- app/page.tsx app/login app/welcome app/onboarding \
    app/invite components/onboarding-v2 components/invite components/auth \
    components/shell/first-run-redirect.tsx lib/onboarding-v2-shape.ts \
    lib/onboarding-v2-state.tsx lib/supabase middleware.ts
                                          → EMPTY (clean)
```

Every entry-path file is **clean at `6ba6ae8`**. The working tree is dirty only in
`agent_shared_log.md` and untracked `docs/screenshots/**` — neither is in scope. So
the findings below are claims **about the commit**, not about another lane's
in-flight edits.

**Evidence tags used throughout:** **Observed** (the exact line was read — cited) ·
**Inferred** (follows from code that was read) · **Unverified** (needs a render that
this audit could not perform).

---

## (A) HANDOFF CONFORMANCE

### A0. There is no handoff for any of these five surfaces — S (docs fix). Observed.

All three handoff generations were searched:

| Handoff | Covers the entry path? | Evidence |
| --- | --- | --- |
| `7.21.26 Design Handoff Update/README.md` | **No** | §"What changed" lists only the unified workspace, shared composer, workspace recolor, pop-in overlay, cross-tree bridge, compact bar, pastel frame, planning drawer, timeline. |
| `7.2.26 Design Handoff Updated Surfaces/` (README + CHANGELOG) | **No** | `grep -i "sign.in\|sign-in\|/login\|welcome"` → **zero matches**. |
| `6.24.26 design_handoff_v2_site/` | **No** | Only onboarding hits are the *tooltip* system (`V2 Framework.md:534`, `CLAUDE.md:192-213`), not a wizard. |

This is already a **recorded ruling**, not a new discovery —
`agent_shared_log.md:1476-1478`:

> *"No wizard artboard exists in the v2 bundle — design from the ConfigPage
> register. NOTE: CLAUDE.md §1's 'onboarding_wizard spec' folder reference is
> STALE (dir absent from the repo)."*

Confirmed independently: `find . -iname "*onboarding_wizard*"` returns **nothing**.

**Consequence:** the entry path is the largest un-designed surface in the app.
Conformance findings are therefore near-empty by construction, and almost everything
of value in this audit lands in section (B). The one conformance obligation that
*does* apply — "design from the ConfigPage register" — **is met**:
`components/onboarding-v2/wizard-v2.module.css:1-10` cites the register explicitly
and is token-clean.

**Action:** delete the `onboarding_wizard` citation from CLAUDE.md §1's status
table. It currently sends every new agent hunting a folder that does not exist.

### A1. Token-rule violations on the two public surfaces — S. Observed.

Conformance against **CLAUDE.md §4** (not against a handoff, since none exists):
*"Never hard-code a hex color or px font size in a component."*

| Violation | Location |
| --- | --- |
| `font-size: 60px` | `app/welcome/welcome.module.css:170` |
| `font-size: 40px` | `app/welcome/welcome.module.css:938` |
| `font-size: 30px` | `app/welcome/welcome.module.css:969` |
| three raw `rgba(...)` mesh stops | `app/login/page.module.css:21,27,32` |

Low severity — both files are otherwise disciplined and both predate current
enforcement. Noted because `/welcome` and `/login` are the only two surfaces a
stranger ever sees, and they are the two that opt out of the token system.

---

## (B) IMPROVEMENTS

Ranked by user impact. Each tagged **Correction** (something is wrong or misleading),
**Enhancement** (something is missing but nothing is wrong), or **Experiment**
(worth trying, outcome uncertain).

### B1. The wizard collects a great deal that nothing reads — Correction / L. Observed.

**This is the headline finding.** Full trace of every field in
`lib/onboarding-v2-shape.ts` `defaultV2Data()` (lines 183-207) to its consumer:

| Wizard answer | Written by | Consumed by | Verdict |
| --- | --- | --- | --- |
| Workspace name | `workspace-step.tsx:75` (RPC) / `:93` (localStorage) | `renameWorkspace` / `use-workspace-settings` | **REAL** |
| `workspaceMode` (solo / team) | `workspace-step.tsx:113` | **nothing** | **INERT** |
| Subject `isAcademic` | `courses-step.tsx:175` | `use-subject-settings.ts:199` seed | **REAL** |
| Subject `color` | `courses-step.tsx:173` | **nothing** | **INERT** |
| Subject `name` | `courses-step.tsx:171` | **nothing** | **INERT** |
| Wizard-**added** subjects | `courses-step.tsx:183-195` | **nothing — explicitly skipped** | **INERT** |
| `weekdays` / `weekPreset` | schedule step via `useSchoolWeek` | real server write | **REAL** |
| `rotation` / `cycleLength` | schedule step | `use-schedule-settings.ts:148` seed → `useScheduleRotation` | **ECHO-ONLY** (see B2) |
| `yearStart` / `yearEnd` | `year-step.tsx:46,66` | `use-academic-year.ts:201` seed | **REAL** |
| `defaultTemplateId` | **no v2 step writes it** | `use-default-template.ts:37` | **UNASKED** (see B9) |
| `standards` | **no v2 step** | **nothing** | **DEAD FIELD** |
| `grade: "5"` | **no v2 step** | **nothing** | **DEAD FIELD** |
| `teacherName: ""` | **no v2 step** | **nothing** | **DEAD FIELD** |

Three sub-findings deserve separate attention:

**B1a — "Add subject" is an affirmative button that silently discards its result.**
`courses-step.tsx:222-230` renders an "Add subject" CTA; `add()` (lines 183-195)
mints `id: subj-${Date.now()}`. But the only consumer, `seedOverridesFromOnboarding`
(`lib/use-subject-settings.ts:213-215`), does:

```ts
// Only locked roster ids are seedable — wizard-added custom
// subjects are a different concept (they map to PERSONAL subjects,
// a separate adoption wave, not team overrides).
if (!isSubjectId(s.id)) continue;
```

A teacher who adds "Science" during setup sees it in the wizard, sees it counted on
the summary (`summary-step.tsx:136-137` counts `data.subjects.length`), and then
never sees it again. The comment shows this is a *known* seam awaiting an adoption
wave — but the button ships today with no indication it is inert.

**B1b — the colour picker is decorative.** The seeder lifts **only**
`isAcademic: false` (`use-subject-settings.ts:219-221`). The swatch grid
(`courses-step.tsx:100-118`) and the rename input (`:125-132`) write to the
onboarding record and nothing reads them. The courses step's two most prominent
interactions do nothing.

**B1c — `workspaceMode` changes nothing.** Exhaustive grep: `workspaceMode` appears
only in the shape file, the step that sets it, and the summary that displays it back.
"Just me" vs "Invite my team" is a fork in the interface with no fork in the product.
(The "Invite my team" branch does render a real, working link to Settings →
Workspace & Team at `workspace-step.tsx:230` — that part is genuine. It is the
*stored choice* that is inert.)

**Suggested fix, in priority order:** (1) hide or disable "Add subject" until the
personal-subjects adoption wave lands, or wire it through; (2) either seed
colour/name or remove those controls from the step; (3) drop `standards`, `grade`,
and `teacherName` from the v2 shape, or wire them.

### B2. Rotation is collected, stored, echoed in Settings, and rendered nowhere — Correction / M. Observed.

Worth stating precisely, because the shorthand "consumed by nothing" is not quite
right and the difference matters to whoever fixes it.

The rotation answer **is** seeded: `lib/use-schedule-settings.ts:148`
`seedRotationFromOnboarding()`, keyed off the same `mycurricula:onboarding` storage
key the v2 wizard writes, with matching field names. That machinery works.

But `useScheduleRotation` (`lib/use-schedule-settings.ts:182`) has **exactly one**
callsite in the entire repo:

```
./app/settings/schedule/page.tsx:64,131
```

(The only other hits are inside `.claude/worktrees/context-trim/` — a stale
worktree copy, not live code.)

**No calendar surface consumes it.** Not the weekly grid, not daily, not year, not
the schedule timetable rendering. So a school on a 6-day rotation answers the
rotation question during setup, sees the answer reflected back in Settings →
Schedule, and gets a plain weekly grid everywhere it would actually matter.

CLAUDE.md §1 states rotating cycles are Phase 1B, so the *rendering* gap is in
phase. The **onboarding question is not** — asking a setup question the product
cannot yet honour is the same class of defect as `/archive` inventing a prior year.

**Suggested fix:** either defer the rotation question to Phase 1B alongside the
rendering, or caption it honestly ("we'll use this once rotating timetables land —
you can change it any time in Settings").

### B3. The marketing nav vanishes on phone and tablet with no replacement — Correction / S. Observed.

`app/welcome/welcome.module.css:931-933`:

```css
@media (max-width: 720px) {
  .links { display: none; }
```

No hamburger, no sheet, no anchor row. Features / How it works / Teach mode /
**Pricing** become unreachable except by scrolling the entire page. This is the
public front door on the device teachers actually browse on. (Matches the recorded
`chrome-responsive-qa-traps` pattern: hiding a nav orphans that tier.)

**Fix:** collapse to a `<details>` sheet or an inline horizontally-scrollable anchor
row.

### B4. The hero's second CTA promises a sample and delivers a login wall — Correction / S. Observed.

`app/welcome/page.tsx:502-506` — "See a sample plan" → `/weekly`.

`/weekly` is not in `PUBLIC_PATHS` (`lib/supabase/middleware.ts:26` — only
`/login`, `/auth`, `/welcome`), so a signed-out visitor is redirected to
`/login?next=/weekly` (`lib/supabase/middleware.ts:105-109`).

The single CTA offering proof-before-signup is the one that cannot deliver it.

**Fix:** point it at the page's own product-peek anchor, or add a genuinely public
read-only sample route.

### B5. Privacy and Terms are dead links on a page that sells a paid plan — Correction / S. Observed.

`app/welcome/page.tsx:800-808` renders all twelve `FOOT_COLS` entries as `href="#"`
— including **Privacy**, **Terms**, **Help center**, and **Contact**.

Paired with a live pricing section offering a **$2.99/mo "Basic"** tier
(`app/welcome/page.tsx:409-423`), this is a trust and plausibly a compliance
problem, not a polish item.

Related, same section: the Basic tier's CTA goes to `/login`
(`app/welcome/page.tsx:763`) and there is no billing anywhere in the product — so a
teacher who chooses the paid plan lands in the free planner having bought nothing.
The Plus tier is honestly handled ("Coming soon", disabled, with a `title` that
explains why — `:745-761`); Basic is not.

### B6. The invite screen redeems before the teacher knows what they are joining, and offers no exit — Correction / M. Observed.

`components/invite/InviteAccept.tsx:109-117` auto-redeems on mount. The screen never
names the workspace or the inviter. A teacher clicks a link from email and is joined
to an unnamed team with zero confirmation.

Two follow-ons:

- **The consent button described in the docblock does not exist.** Lines 22-24
  claim *"The 'Join this team' primary button (shown in the interim loading/ready
  state before auto-redeem completes)…"* — but line 193 renders `null` in the
  loading state. The comment documents a consent step that was never built.
- **`email_mismatch` has no remedy.** For that status (lines 62-65) the only action
  offered is "Create your own space instead" → `/weekly` (line 186). The actual fix
  — sign out, sign in with the invited address — is offered nowhere, and there is
  **no sign-out affordance on this screen at all**. On a shared staffroom device, a
  teacher signed in as a colleague is stuck.

### B7. Nothing on the entry path ever asks the teacher their name — Correction / M. Observed.

`lib/supabase/ensure-teacher.ts:300` and `:528`:

```ts
const displayName = (email.split("@")[0] || "Teacher").slice(0, 120);
```

Provisioning never reads the Google `full_name`, though `lib/app-state.tsx:174-179`
shows the codebase already knows how to. And the v2 wizard dropped v1's name step
(v1: `components/onboarding/steps/welcome-step.tsx:34`; v2:
`lib/onboarding-v2-shape.ts:185` keeps `teacherName: ""` with no UI writing it).

Consequence: `lib/workspaces/row.ts:130,159` reads `display_name` for the **team
roster**, so teammates see `sarah.rivera` rather than "Sarah Rivera".

*Not a v2 regression* — v1's `teacherName` had no readers either. It is a standing
gap that v2 inherited.

**Fix:** cheapest is provisioning-side (read `user_metadata.full_name`, fall back to
the local part). The magic-link path still needs a wizard field.

### B8. The Appearance step cannot show what it is previewing — Correction / S. Observed in code, **Unverified** in render.

`app/onboarding/layout.tsx:28` paints an **opaque** `background: var(--ink-50)` on
the onboarding `<main>`. The `.stage` photo/wash layer lives in the root layout at
`z-index: -2` (`app/layout.tsx:126-158`) — i.e. *behind* it.

So when a teacher uses `AppearanceControls` (`appearance-step.tsx:24`) to choose
Photo vs Wash vs a theme, the background those axes govern is covered by flat grey;
only the card's `--panel-bg` re-hues. The one step whose entire job is a live preview
is the one step that cannot render its own subject.

Marked **Unverified** for the visual claim specifically: `--ink-50` is opaque and
sits above `z-index: -2`, so the conclusion follows — but it was not seen rendered.

### B9. A teacher can finish setup, permanently, with no school year — Correction / S. Observed.

`lib/onboarding-v2-state.tsx:155-157` — `goTo` is an unguarded clamp. The rail
(`wizard-v2.tsx:130`) lets any step be clicked, including Review.

`yearStart` / `yearEnd` default to `""` (`lib/onboarding-v2-shape.ts:189-190`), the
year step has no validation and no start-before-end check
(`year-step.tsx:41-70`), and `finish()` stamps `teachers.onboarded_at` — after which
**the wizard never re-offers itself on any device**.

The summary is honest about it ("Not set yet" — `summary-step.tsx:109`), but nothing
blocks it, and the year bounds anchor the entire roadmap and pacing.

Related: `defaultTemplateId` has **no v2 step** (the v1 wizard had
`lesson-template-step.tsx`; the v2 `RAIL` at `wizard-v2.tsx:42-49` has none), yet
the summary reports "Lesson template: <name>" (`summary-step.tsx:97-98,164-166`) —
asserting a choice the teacher was never offered. The value *is* consumed
(`use-default-template.ts:37`), so it is not inert; it is unasked.

**Fix:** soft-gate the finish buttons on year bounds, or render the empty-year recap
row as a visible warning rather than neutral text.

### B10. The wizard step-rail disappears at ≤720px, and its own comment misdescribes the replacement — Correction / S. Observed.

`components/onboarding-v2/wizard-v2.module.css:228-230` — `.rail { display: none }`.

The file header (line 5) claims *"a left step-rail that **collapses to a progress
strip** on phone."* There is no progress strip — only `display: none`. On phone the
teacher loses every step name and the ability to jump, leaving one-step-at-a-time
`back` (`wizard-v2.tsx:179`). The 4px `.progress` bar survives but carries no labels.

**Fix:** a horizontal chip row, or a "Step 3 · Schedule" breadcrumb in `.stepCount`.

### B11. Broken `aria-describedby` on the first form in the product — Correction / S. Observed.

`components/auth/magic-link-form.tsx:141-145` sets
`aria-describedby="magic-link-error"`. The error `<p>` at line 121 has **no `id`**.
A repo-wide grep for `magic-link-error` returns exactly one hit — the reference
itself. Screen-reader users get no error association. One-line fix.

### B12. The sign-in tablist announces a keyboard pattern it does not implement — Correction / S. Observed.

`app/login/SignInTabs.tsx:32-71` implements `role="tablist"` / `role="tab"` /
`aria-selected` / `aria-controls` correctly, but the file contains **no `onKeyDown`
anywhere**. The WAI-ARIA tabs pattern requires Arrow-key navigation with a roving
`tabIndex`; here both tabs sit in the tab order and arrows do nothing.

Announcing the tabs pattern to assistive tech and then not honouring it is worse
than plain buttons would have been.

**Fix:** add arrow-key handling, or drop `role="tab*"` and ship two plain toggle
buttons.

### B13. The default subject roster is beta-school-specific — Enhancement / M. Observed.

`lib/onboarding-v2-shape.ts:195-202` seeds all eight locked subjects, every one
`isAcademic: true`.

For the Qatar Grade-5 beta that is exactly right. For the "any school" positioning
in CLAUDE.md §1, a US or UK teacher's first substantive screen pre-fills **UFLI**,
**Explorers**, and **SEL** — house-specific names they must then delete one at a
time (`courses-step.tsx:179-182`).

**Fix:** seed a small neutral core (Math, Reading, Writing) and offer the full beta
roster as a one-click preset.

### B14. `/login` is a cul-de-sac for anyone who does not yet know the product — Enhancement / S. Observed.

`app/login/page.tsx` renders the card with no link to `/welcome`, and no Terms or
Privacy. Any teacher who arrives via a deep link (middleware bounce,
`lib/supabase/middleware.ts:105-109`) lands on a sign-in wall with no route to
finding out what they are signing in to.

**Fix:** add a "What is mycurricula?" link to `/welcome` under the fineprint.

---

## (C) DATA-MODEL GAPS REQUIRING A MIGRATION

**None. No finding in this audit requires a schema change.** Reported explicitly
because the absence is itself the useful answer for the migration gate.

The closest candidate is **B7** (teacher name), and it is *not* a migration:
`teachers.display_name` already exists and is already written at
`lib/supabase/ensure-teacher.ts:380`. The fix is to *source* the value better, not
to add a column. If a wizard name field is added later it writes that same existing
column through the `teachers` UPDATE grant already documented at
`lib/onboarding-v2-remote.ts:94` (`display_name, default_view, completion_privacy`).

**B1**'s inert fields are the reverse of a migration: they are *fewer* stored
concepts than the shape declares, and the fix is deletion or wiring in application
code.

---

## (D) DELIBERATELY DROPPED — do not re-file as gaps

Verified against `agent_shared_log.md` before writing, per the ruling-first rule.

| Item | Ruling | Citation |
| --- | --- | --- |
| **The guided screen tour** | Commissioned, explicitly scoped as its own follow-on slice within W12c; `startScreenTour()` is a seam that only navigates to `/home`. The finish buttons were deliberately relabelled ("Go to Home" / "Start planning") so neither promises a tour. | `agent_shared_log.md:1462`; `wizard-v2.tsx:14-15,199-205`; `lib/screen-tour.ts` |
| **`/welcome` not matching the v2 glass register** | Ruled a marketing landing page — a different visual register, deliberately not v2 chrome. | `agent_shared_log.md:716-718,750` |
| **The ~2.1s planner flash before first-run redirect** | Measured, documented, deliberately not fixed. | `components/shell/first-run-redirect.tsx:16-19`; hook docblock in `lib/onboarding-v2-state.tsx` |
| **Existing teachers never seeing the wizard** | User decision 2026-07-24: onboarding is new-signups-only; the backfill set `onboarded_at` for everyone already present. Reversible per-account by nulling the column. | `agent_shared_log.md:2888,2926` |
| **Wizard-added subjects not reaching the planner** | *Partly* deliberate — the seeder comment names a "separate adoption wave" for personal subjects. **But the UI ships the button today with no signal it is inert**, so B1a stands as a finding against the *interface*, not the data plan. | `lib/use-subject-settings.ts:213-215` |

### NOT a gap — verified working, previously suspected

- **Re-entry to `/onboarding` after leaving mid-setup.** The workspace step
  (`:230`) and year step (`:93`) both `router.push` out to `/settings/*`. `app/settings`
  lives **outside** the `(planner)` route group, so `FirstRunRedirect` (mounted only at
  `app/(planner)/layout.tsx:197`) does not fire there — no bounce loop. And a "Setup
  guide" tile at `app/settings/page.tsx:366-375` provides the route back. Both
  concerns checked and cleared.

---

## (E) WHAT WORKS — MUST NOT REGRESS

- **The auth gate is correct and subtle.** `lib/supabase/middleware.ts:99-116`
  *rewrites* `/` to `/welcome` (preserving the clean URL) but *redirects* every other
  protected path to `/login?next=…`, copying refreshed session cookies onto both
  responses. The rewrite-vs-redirect distinction is deliberate and easy to break.
- **`next=` survives the whole round trip** — `app/login/page.tsx:24` → `SignInTabs`
  → `MagicLinkForm` / `GoogleSignInButton` → OAuth callback → `/invite/[token]`.
- **The invite auth bounce re-encodes its token correctly**
  (`app/invite/[token]/page.tsx:58-59`) and uses `getUser()` not `getSession()`,
  matching the repo convention, with the reasoning written down at lines 39-45.
- **The summary step's honesty work is exemplary and must not be flattened back
  into a blanket claim.** `summary-step.tsx:80-95` contradicts its own static caption
  when the school-week write was *refused*, and names exactly which answers will not
  travel to a second device. This is the correct pattern for every "we saved it"
  claim in the product.
- **The finish gate on the in-flight team write** (`wizard-v2.tsx:190-231`) —
  `onboarded_at` is irreversible from the UI, so gating finish on `weekSaving` is
  load-bearing, and the 15s abort bound means it can never trap a teacher.
- **Magic-link sign-in does not leak account existence** — the server returns the
  same generic success either way (`magic-link-form.tsx:5-7,61-62`), and 429 is
  handled distinctly (`:46-52`).
- **Escape is intentionally a no-op in the wizard** (`wizard-v2.tsx:16-18`) — it is a
  first-run gate; an accidental Escape must not drop a teacher out of setup.
- **The one-time seeders are correctly one-time.** Each of
  `seedRotationFromOnboarding`, `seedOverridesFromOnboarding`, and
  `seedFromOnboarding` fires only when the destination key is unset, so re-running the
  wizard can never silently overwrite team settings someone has since edited
  (`use-schedule-settings.ts:142-148`, `use-subject-settings.ts:186-197`,
  `use-academic-year.ts:187-188`).

---

## Bottom line: can a brand-new school complete onboarding today?

**Yes — it completes end-to-end, with no dead-end and no hard blocker.** Traced:
sign-up → provisioning mints a solo workspace (`ensure-teacher.ts`) → planner →
`FirstRunRedirect` → `/onboarding` → six steps, none with a required-field gate →
`finish()` → `mark_onboarded()` RPC → `/weekly` or `/home`. The one write that can
be *refused* (the team-wide school week) is refused gracefully, reported honestly on
the summary, and does not block finishing. **Inferred** — traced through code, not
executed.

**But it completes while quietly discarding much of what it collected.** Of the
thirteen answers the wizard's shape declares, **four are real**, one is echo-only,
one is unasked, and **seven are inert or dead** (B1). The two most prominent
interactions on the subjects step — renaming and recolouring — write to a record
nothing reads, and the "Add subject" button produces a subject that never reaches
the planner.

That is the same failure class the team saw today in `/archive` inventing a prior
year: **the interface asserts more than the system delivers.** Nothing here errors,
so it will not surface in logs or in a smoke test — a teacher simply finds, days
later, that the setup they completed did not take.
