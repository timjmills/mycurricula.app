# mycurricula.app — Project Guide

This file is the source of truth for **what this project is, how we build it, and the
rules every contributor (human or agent) must follow**. Read it before touching code.

> **Companion file — read this too:** `BUILD_STANDARD.md` at the repo root is the
> visual, structural, and responsive contract — what every page must look and behave
> like. The Weekly view (`/weekly`) is the canonical reference. CLAUDE.md is the
> _policy_ (rules, phasing, what not to do); BUILD*STANDARD.md is the \_content*
> (color recipe, type hierarchy, spacing scale, canonical primitives, new-page
> prompt template). Read both at the start of every build session.

---

## 1. What this app is

**`mycurricula.app`** is a Learning Management System (LMS) for school teaching teams.
Its first deployment is a Grade 5 team (4–6 teachers) at a school in Qatar, but the
product is built for any school. It consolidates five fragmented planning surfaces —
Padlet resource boards, a week-by-week lesson doc, a weekly-focus doc, a CCSS standards
doc, and per-teacher personal copies — into **one filterable, editable curriculum
operating system**.

### Current build status (2026-05-27)

Phase 1A is **shipped to a live beta-ready prototype** at the Cloudflare custom domain
`mycurricula.app`. Every primary view renders against `lib/mock/` fixtures; the
Supabase backend is the Phase 1B wave. The honest map:

| Route / feature | Status |
| --- | --- |
| `/weekly` (Grid + List) | Shipped Phase 1A |
| `/daily` (Day pane + lesson detail + IconRail) | Shipped Phase 1A |
| `/year` (Roadmap + Progression + Print) | Shipped Phase 1A |
| `/subject` (Curriculum view, per-subject unit pages) | Shipped Phase 1A |
| `/schedule` (timetable) | Shipped as deep-link + side-panel via GlobalRail (Phase 1A complete; rotation cycles deferred to Phase 1B) |
| `/catch-up` (lessons-not-covered triage) | Shipped Phase 1A |
| `/settings/*` (unified hub: curriculum, school week, school months, academic year, holidays, appearance, lesson templates, catch-up rules) | Shipped Phase 1A |
| Master/Personal forking model | Visual + state shipped; persistence to Supabase is Phase 1B |
| Onboarding wizard | Shipped Phase 1A (`Documents/Claude Design/.../onboarding_wizard` is the spec) |
| Cloudflare deploy (custom domain `mycurricula.app`) | Live |
| Claude auth bypass (Bearer + URL + cookie) | Live — all three flows working |
| Supabase backend (auth + DB rows + realtime) | **Not yet wired** — Phase 1B gate. Mock data in `lib/mock/` drives every view today. |

Phase 1B is the **Supabase + multi-school config wave**: wiring the backend so the
forking model persists, holidays render on weekly/daily, schedule rotation cycles work
end-to-end, and unit-import lands. Phase 2+ brings annotation, admin, and AI.

- **Users:** teachers only. No student, parent, or admin-facing product in scope.
- **Core job:** "What are we teaching this week, and where am I in the plan?"
- **Multi-grade ready by design:** launches Grade 5-only, but the data model and UI
  must never assume a single grade. Build grade-scoping in from day one.
- **The school week is configurable.** The app must support any school's week
  configuration — which weekdays the school runs and how many. During initial setup the
  teacher/school picks the school week: a **preset** (Sunday–Thursday, Monday–Friday) or
  a **custom** set of weekdays (e.g. a 3-day week). **Never hard-code the weekday set** —
  every calendar surface (Weekly grid columns, Daily day list, Schedule, etc.) derives
  its days from this configuration. The first beta school runs Sunday–Thursday with an
  optional **Ramadan timetable** mode and may need MOEHE-compliant exports — that is
  per-school configuration, not a built-in assumption.
- **Schedules are customizable, including rotating cycles.** The daily timetable — the
  time blocks defining when each subject/period meets — is configured per school and per
  teacher, never fixed. It must support **rotating schedule patterns**: e.g. an **A/B
  schedule** that alternates on a cycle other than the calendar week (every 4
  instructional days, a 6-day rotation, etc.). Schedules can be edited and reset. Never
  assume a single fixed daily schedule or a weekly-only cycle.

It is **not** a gradebook, an attendance tracker, a student portal, or a
marketplace. See §6 for the full out-of-scope list.

---

## 2. The approach — the one idea that defines the product

**Git-style forking applied to curriculum.** There is one **Master** plan (also called
"Core Curriculum" in newer design copy). Each teacher sees their **Personal** copy of a
lesson where one exists, and the Master as fallback where it doesn't.

- **Lazy forking:** a personal copy is created automatically the first time a teacher
  edits a lesson in Personal mode. There is no manual "make a copy" step.
- **Friction where it matters:** editing Personal is invisible and automatic. Editing
  Master is intentional and explicit — gated by a top-bar **Personal | Master** toggle
  and a flashing-then-persistent red banner ("Heads up — changes here affect the whole
  team"). No confirm dialogs.
- **Completion is independent of forking.** Marking a lesson done never forks it.
- **Three-tier visual differentiation** tells a teacher at a glance whose version a
  card is:
  - _Unedited from Master_ → solid 4px subject-color left stripe.
  - _Personally modified (content changed)_ → **dashed** stripe + "Modified" pill.
  - _Personally moved (day/order changed)_ → solid stripe + move-arrow icon (↔ / ⤴).
  - _Both_ → all three compose.

This forking model is the product's competitive differentiator. It will surface in
nearly every feature — respect it everywhere.

### Core product principles

1. **Single source of truth.** One Master plan; teachers fork as needed.
2. **Personal-first viewing.** A teacher always sees their version where one exists.
3. **Each UI surface has one clear job.** Toggles change a surface's _content_, never
   its purpose. Filtering/management live in dedicated panels, not primary views.
4. **Filter everywhere.** Every view filters by subject, unit, time period, completion
   status, and standards.
5. **Color carries meaning, never decoration.** Every colored element is information.
6. **Print- and paper-friendly.** Views have clean print templates.
7. **Reusable year-over-year.** Plans archive and roll forward.

---

## 3. Tech stack & architecture

| Layer         | Choice                                                             |
| ------------- | ------------------------------------------------------------------ |
| Framework     | Next.js (App Router) + React 19 + TypeScript                       |
| Styling       | Tailwind (layout/spacing only) + CSS custom-property design tokens |
| Data (later)  | Supabase (Postgres + Auth + Realtime), row-level security          |
| Auth (later)  | Supabase Auth — Google SSO, restricted to the school domain        |
| Files (later) | Cloudflare R2 for resources; Supabase Storage for exports          |
| PDF / Excel   | `@react-pdf/renderer` / SheetJS, client-side                       |
| Hosting       | Cloudflare Pages                                                   |

**Current state of the repo:** a **frontend-complete Phase 1A prototype** deployed to
Cloudflare at `mycurricula.app`. See §1's status table for what is shipped vs.
mock-driven. Every view today reads from `lib/mock/`; the Supabase backend lands in
Phase 1B.

### Folder conventions

```
app/            Next.js routes (App Router). tokens.css + globals.css live here.
components/<x>/ One folder per component family, with a barrel index.ts.
lib/            theme, palette, types, and lib/mock/ fixtures.
lib/admin/queries.ts   Convention: all aggregation/admin queries go here (even pre-UI).
styles/         Reserved for additional stylesheets.
Documents/      Planning docs + design handoff — NOT part of the app, never imported.
```

### Naming

- Components: `PascalCase.tsx`. Hooks: `useThing.ts`. Utilities: `camelCase.ts`.
- DB columns (when the backend lands): `snake_case`.
- Each component folder exposes its public surface through `index.ts`; consumers import
  from the folder (`@/components/lesson-card`), never a deep file.
- Path aliases: `@/components/*`, `@/lib/*`, `@/app/*`.

---

## 4. Design system rules

The visual system has three independent axes, all set as `<html>` data attributes by
`lib/theme.tsx`:

- `data-style` ∈ `quiet | calm | vivid` — card treatment. **The app defaults to
  `vivid`**; `quiet` and `calm` remain available as teacher preferences.
- `data-palette` ∈ `normal | highlight` — subject-color saturation. **Defaults to
  `highlight`.**
- `data-theme` ∈ `paper | cloud | night | mint | sky | blossom` — the app-wide color
  theme (foundation neutrals, scrims, shadows, mesh, logo lockup). **Defaults to
  `paper`** (the original warm-cream look; the plain `:root` block in `tokens.css`
  IS the Paper theme). `night` is the dark mode. A teacher can also store
  `"system"` (the "Follow system" picker option) — it resolves to `paper`/`night`
  via `prefers-color-scheme` before reaching the DOM, so `data-theme` only ever
  carries a concrete theme. Theme overrides live in `:root[data-theme="…"]` blocks
  at the end of `tokens.css`, wrapped in `@media screen` so **print always renders
  Paper**. Subject hues are deliberately NOT themed (color carries team-wide
  meaning); Night re-tints only the subject `-tint`/`-ink` companions. The logo
  re-colors per theme through the `--logo-*` tokens. All three axes persist to
  localStorage (`mycurricula:user:theme*`) and paint pre-hydration via the
  no-FOUC boot script in `lib/theme-init.tsx`. Theme changes pulse a
  `data-theme-transition` attribute on `<html>` for ~220ms so tokens.css can
  cross-fade the swap (suppressed under reduced motion). Optional cross-device
  sync (`lib/theme-sync.ts`, OFF unless `NEXT_PUBLIC_THEME_SYNC=1`) mirrors the
  three axes to the `teacher_preferences` table. ALLOWLIST LOCKSTEP: the value
  lists live canonically in `lib/theme.tsx` (exported guards); the boot
  script's inline arrays and the migration's SQL CHECK constraints must mirror
  them exactly. CHROME TIER: active/selected chrome (nav items, tabs, rail
  icons, filter chips) and chrome surfaces consume the `--chrome-accent-*` /
  `--rail-bg` / `--panel-bg` tokens — never raw `--brand-*` — so every theme
  re-hues its own chrome; Paper's chrome tokens default to the original
  brand/paper values (see BUILD_STANDARD.md §Themes).

**Hard rules:**

- **Tailwind supplies layout and spacing utilities only.** Do **not** add theme colors,
  fonts, or semantic spacing to `tailwind.config.ts`.
- **All color, type, and spacing tokens live in `app/tokens.css`** as CSS custom
  properties. Reference them with `var(--token)`. Never hard-code a hex color or px
  font size in a component.
- Subject colors come through the `.cp-subj.<subject>` classes (driven by the palette
  bridge in `lib/palette.tsx`) or the `useSubjectColor(subjectId)` hook. Never invent a
  subject color.
- **Buttons:** use the `components/ui/Button` primitive only — never hand-roll a pill CTA, never give a button a colored-glow resting shadow, and qualify variant/size CSS with `.btn` so the `.cp-root` reset can't strip it. See BUILD_STANDARD.md §7a (Buttons & pills).
- The 8 subjects (`math, reading, writing, grammar, spelling, ufli, explorers, sel`)
  and their swatch mapping are **locked team-wide**. Style, palette, and theme are
  per-teacher preference; the subject→color mapping is not.
- Respect `prefers-reduced-motion`: the master-mode banner appears solid (no flash) and
  urgent notes never pulse under reduced motion.
- Accessibility: WCAG AA contrast minimum, full keyboard navigation, ≥44px touch
  targets on primary actions.
- Motion is allowed where it clarifies (card expand ~200ms, slide-outs ~250ms,
  drag ghosting). No bounce, parallax, or confetti.
- **Responsive is a hard requirement, not a polish pass.** Every page, view, and
  feature must lay out and remain usable at **three viewport tiers**:
  - **Phone** — 360–480px
  - **Tablet** — 600–900px
  - **Desktop** — 1024–1920px

  No page-level horizontal scroll at any tier; every primary control reachable
  without a horizontal scroll or off-screen overflow; touch targets ≥44px on
  phone and tablet; sticky chrome must not eat more than ~30% of the viewport
  height on phone. Internal element scroll (e.g. a wide grid inside a
  scrollable container) is acceptable; the document itself must not scroll
  sideways. Work is only "done" once it has been verified at all three tiers
  (DevTools device emulation is fine; document in the PR/commit message which
  widths were checked).
- **Every non-obvious interactive control and every named panel must have an
  onboarding explanation — shown ONCE, then dismissible.** The intent is
  first-time-teacher discoverability without long-term hover noise. A new
  teacher learns the app by hovering / long-pressing; once they know it, they
  turn it off. Mechanism: the W2-B3 **dismissible onboarding-tooltip system**
  in `lib/tooltip-dismissal.ts` (source of truth for state).
  - **Surface:** desktop = tooltip on hover **and** keyboard focus; touch
    (phone/tablet) = long-press surfacing the native `title=` attribute the
    Tooltip primitive mirrors, OR a visible `?` affordance for ambiguous
    controls.
  - **Scope:** every non-obvious `<Button>`, every switch / toggle / radio,
    every named panel (sticky rails, drawers, modals), every icon-only
    control, every disabled control (the tooltip explains _why_ it's
    disabled), every settings input. **Self-evident text buttons whose label
    IS the explanation ("Save", "Cancel", "Close") do NOT get a tooltip** —
    this supersedes the prior rule that even "Save" should expand to "Save
    your edits to this lesson". A tooltip that restates the label adds noise
    without teaching.
  - **Dismissibility model:** every onboarding tooltip passes a stable
    `tooltipId` to the `<Tooltip>` primitive. On the first hover the bubble
    paints with an inline "Turn off these tips" mini-link. Clicking it
    dismisses that id forever (persisted to localStorage). Settings →
    Appearance has a master toggle ("Show onboarding tooltips") and a
    "Reset dismissed tooltips" button.
  - **Always-on exception (`required: true`).** High-consequence tooltips
    ignore both per-id dismissal AND the global off switch:
    - The **Personal / Team Curriculum** toggle (top-bar).
    - **Destructive actions** — archive, delete, remove, mass-clear, etc.
    - **Team-wide settings** — every SettingsCard whose change affects every
      teacher (curriculum-label save, holidays, academic year, school
      week, …).

    These callsites pass `required: true` and never render the "Turn off
    these tips" link. For segmented controls the `ToggleGroup` primitive
    exposes a `tooltipRequired` prop that propagates `required` to every
    option's wrapping tooltip.
  - **Voice:** tell a first-time teacher what the control _accomplishes_, in
    the surrounding context. Not "Toggle X" but "Switch to editing the
    team's curriculum (changes affect everyone)".
  - **Implementation:** the `components/ui/Tooltip` primitive carries:
    - `tooltipId?: string` — opt-in dismissibility id. When set, the bubble
      renders the "Turn off these tips" mini-link and reads/writes the
      dismissal state via `lib/tooltip-dismissal.ts`.
    - `required?: boolean` — always-on override for the high-consequence
      list above. Ignores both per-id dismissal and the global flag, and
      hides the dismiss link.

    The `components/ui/Button` primitive's existing `tooltip?: string` prop
    wraps the rendered button in `<Tooltip>` and mirrors to native `title=`
    for the disabled-button browser quirk; future passes will expose a
    matching `tooltipId` / `tooltipRequired` pair on Button for ergonomic
    callsite migration. Panels carry a `title` attribute on their root so
    touch users get an explanation by holding the header.
  - **Reduced-motion + accessibility:** tooltip fade respects
    `prefers-reduced-motion`; tooltip text is linked to the trigger via
    `aria-describedby` so screen-reader users hear it. SSR-safe — the
    initial render assumes "not dismissed" so the server-rendered HTML
    matches the first client paint; the real state arrives in a post-mount
    effect.

---

## 4a. Code Review Gate (Claude Code → Codex)

> Mirror image of the gate in `AGENTS.md` §"Code Review Gate" (which covers
> the Codex → Claude direction). The cross-review contract is the same; only
> the invocation differs because each agent reviews via the other.

> **HARD RULE — never execute the review command without sandboxing.** Every
> invocation MUST carry `--sandbox read-only` (or a stricter sandbox). Never
> use `--dangerously-bypass-approvals-and-sandbox`. Never run Codex
> unsandboxed "just to see if it works" — the sandbox IS the gate.
>
> If the sandboxed command refuses to run (Codex missing / not authenticated
> / sandbox blocked by local policy / network unavailable / unknown flag in
> the installed CLI version / anything else that stops the gate from
> completing under `--sandbox read-only`), STOP and tell the user. Do not
> remove or weaken the sandbox flag, do not retry with a permissive flag,
> and do not send code through another channel. Report the blocker and the
> strongest local fallback verification you can run instead (typically
> `npm run lint && npx tsc --noEmit && npm run build` + the responsive
> probe script).

For changes that affect logic, security, data handling, or public interfaces,
run an adversarial review via Codex before declaring the task complete or
asking for user review. Trivial comments, formatting, and copy-only edits do
not require this gate.

**Invocation.** Run Codex non-interactively with the read-only sandbox so it
cannot write to the tree and cannot stall on approval prompts:

```bash
codex exec --sandbox read-only "$REVIEW_PROMPT"
```

The legacy `--approval-policy never` flag from earlier docs is NOT recognized
by Codex CLI 0.133+. `--sandbox read-only` is sufficient — `exec` mode is
already non-interactive and the read-only sandbox blocks every side effect
that could otherwise trigger an approval prompt.

**Review prompt** (use verbatim):

```text
Act as a strict, skeptical Senior Security & QA Engineer. Review the current
uncommitted changes (run `git diff` and `git diff --cached` for context). For
each issue report: file/line, severity (Critical / High / Medium / Low), the
concrete failure scenario, and a suggested fix. Focus on logic errors, security
flaws, race conditions, unhandled edge cases, broken error handling, and missing
or wrong tests. Do not praise; report only problems. If nothing is Medium or
above, output exactly: NO BLOCKING ISSUES.
```

**When to run.** Before committing a logic / security / data-handling / public-
interface change. The gate reviews the **uncommitted** diff (`git diff` +
`git diff --cached`), so it has to fire BEFORE the commit lands — once
committed, the diff against working tree is empty and the gate has nothing to
read.

**Precondition — stage every in-scope file first.** The review prompt reads
`git diff` (working tree vs index) and `git diff --cached` (index vs HEAD),
which together cover staged and unstaged tracked-file changes but NOT
untracked (`??`) files. A new route, new API handler, new lib, or new helper
sitting as `??` in `git status` would be invisible to the reviewer. Always
run `git status --short` first, then `git add` every file that's in scope
for the change being reviewed, BEFORE invoking the gate. The gate then sees
the full picture.

**Acting on findings.** Evaluate Codex's findings critically. Do not apply
suggestions blindly: fix every Critical and High finding that is legitimate,
and state why any dismissed finding is a false positive, out of scope, or
intended behavior. Re-run the gate after fixes until Codex outputs
`NO BLOCKING ISSUES`, or until only justified Low/Medium items remain.

**If the gate cannot run** (Codex not installed, not authenticated, sandbox
denied by local policy, network unavailable, etc.), do not bypass the
restriction or send code through another path. Report the blocker to the user,
then do BOTH of the following — neither substitutes for the other:

1. **Mandatory adversarial review — run by whichever reviewer is the more
   rigorous for the change.** The gate's defining property is INDEPENDENT
   adversarial review — a reviewer that did not author the code. With Codex
   gone, choose the substitute that best preserves that, by rigor:
   - **An independent review agent** (a freshly spawned agent that did NOT write
     the diff) is the closest substitute for Codex: clean eyes, none of the
     author's blind spots. Prefer it for security / auth / data-handling /
     migration / RLS / privilege / public-interface changes, where independence
     matters most.
   - **Your own self-administered review** brings full intent + cross-change
     integration context. Prefer it when that context is the scarce thing, or
     when spawning an agent isn't practical.
   - **Both** is the most rigorous, and is REQUIRED for high-consequence changes
     (auth, RLS/privileges, data migrations — anything that can leak tenants or
     lock users out): the agent supplies independence, the self-review supplies
     context.
   - If the two are genuinely equally good for the change at hand, either alone
     suffices — pick one and move on.

   **Invariants regardless of who reviews:**
   - The reviewer must be INDEPENDENT of the author. An implementation agent
     reviewing its OWN diff does NOT count (no marking your own homework); a
     fresh review agent — or the orchestrator reviewing an agent's output —
     does.
   - Adopt the reviewer persona ("strict, skeptical Senior Security & QA
     Engineer"), read the full diff (`git diff` + `git diff --cached`; for
     already-committed work, the commit range under review), and report findings
     in the gate's format — file/line, severity (Critical / High / Medium /
     Low), the concrete failure scenario, a suggested fix. Hunt for logic
     errors, security flaws, race conditions, unhandled edge cases, broken error
     handling, and missing/wrong tests. NOT satisfied by lint/tsc/build alone.
   - The orchestrator OWNS the outcome: critically validate every finding (never
     rubber-stamp an agent's `NO BLOCKING ISSUES`), fix every legitimate
     Critical and High before committing, and justify any dismissed finding.
     Conclude with `NO BLOCKING ISSUES` or the remaining justified Low/Medium
     items.
   - State on the record which reviewer(s) ran (self / independent agent / both)
     and that Codex was unavailable, so the substitution is auditable.

   **This applies on every cloud / remote (Claude Code on the web) session**,
   where Codex is not installed and cannot act as the gate — there, this review
   IS the gate, and it runs for every logic / security / data-handling /
   public-interface change, every time, before the commit lands.

2. **Local verification stack**, on top of the self-review — typically
   `npm run lint && npx tsc --noEmit && npm run build`, the responsive probe
   script (`node scripts/probe-uxa.mjs`), and the relevant test suite
   (`npm run test`).

### Known sandbox limitations + mitigations (Windows, 2026-05-28)

Observed during the first real gate invocations on this machine. Surface
these to the user if the gate behaves unexpectedly — they are not
permission to bypass the gate.

1. **`windows sandbox: spawn setup refresh` on git commands.** Codex's
   read-only sandbox can fail to spawn `git diff` / `git diff --cached` /
   downstream shells on Windows. Codex falls back to direct file reads +
   `git status --short`, so findings still arrive — but the diff-centric
   prompt loses some context. The failure is sometimes intermittent (first
   invocation succeeds, later invocations in the same shell session fail).
2. **Mitigations** (in increasing order of intrusiveness):
   - **(a) Retry in a fresh shell.** The spawn failure sometimes resolves
     after closing + reopening the terminal.
   - **(b) Upgrade Codex CLI.** `npm i -g @openai/codex@latest`. The npm
     package is `@openai/codex` (not `@anthropic/codex`). The
     `--approval-policy` flag was removed around the 0.133/0.134 boundary;
     as of 2026-05-28 the latest is 0.134.0. If a newer release ships with
     a Windows-sandbox fix, this is where it lands. Verify the installed
     version with `npm list -g --depth=0 | grep codex`.
   - **(c) Pipe the diff as stdin context.** Bypass Codex's in-sandbox
     `git diff` by capturing the diff yourself + piping it into the
     prompt: `git diff --cached | codex exec --sandbox read-only
     "$REVIEW_PROMPT"`. The `[PROMPT]` argument is optional when stdin is
     piped (Codex appends stdin as a `<stdin>` block, per
     `codex exec --help`). This lets Codex review even when its own
     sandbox can't shell out for the diff.
   - **(d) Accept the gate as best-effort on Windows.** If (a)+(b)+(c)
     all still fail, the gate is genuinely blocked. Surface the blocker
     per the failure protocol above + run the full local verification
     stack instead. Note in the commit message that the gate could not
     run, what was tried, and what local verification was substituted.
3. **Do NOT use `--dangerously-bypass-approvals-and-sandbox` as a
   workaround.** Per the hard rule at the top of this section, every
   invocation runs under `--sandbox read-only`. If you cannot get a
   read-only run to work, that's a blocker to report, not a license to
   weaken the sandbox.

---

## 4b. Live QA Audit Gate (browser MCP — separate from the code review)

> Mirror image of `AGENTS.md` §"Live QA Audit Gate". Added 2026-06-12,
> alongside the user-scope `playwright` and `chrome-devtools` MCP servers.
> A user-wide copy of this rule lives in `~/.claude/CLAUDE.md`, so it
> applies to every project on this machine, not just this repo.

The §4a code review checks the **diff**; this gate checks the **running
app**. They are separate gates, and **both run before a build is said to be
done**. This gate does not involve Codex — Claude Code (or any agent with
browser tooling) performs it directly.

**Requirement.** For each build, live-interaction-test the affected app
surfaces in a real browser using one or both of:

- `playwright` MCP (`npx @playwright/mcp@latest`) — navigate, click, type,
  submit forms, screenshot.
- `chrome-devtools` MCP (`npx chrome-devtools-mcp@latest`) — the same, plus
  browser-console messages, network inspection, and device emulation.

Both are registered at user scope (verify with `claude mcp list`). If
neither is available (e.g. a cloud/remote session), fall back to a local
Playwright script (`chromium.launch({ channel: "chrome" })`, like the
`scripts/probe-*.mjs` probes) — the live pass itself is never skipped.

**Scope.** Breadth scales with the build: an app-wide wave gets the full
audit template below; a focused change gets every surface it touches plus a
browser-console error check. What never scales away: real clicks in a real
browser before "done".

**Operational notes.**

- Start the dev server if one isn't already running; use a port ≥3010 when
  another session may own 3000, and never run `npm run build` while
  `next dev` is running (it clobbers `.next`).
- For auth flows, sign in via the claude-login bypass (see
  `docs/5.24.26 claude-access.md`; localhost needs
  `PROVISIONING_MODE=individual` in `.env.local`).
- `QA-REPORT.md` is a working artifact — do not commit it unless asked.

**QA audit prompt** (canonical template):

```text
Goal: QA audit — code inspection + live visual testing.
Inspect this codebase and visually test the running website, then produce a
prioritized report of bugs and improvements.

1. Code inspection. Review the project structure, components, routing, and
   state management. Flag dead code, error-handling gaps, accessibility
   issues (missing alt text, labels, focus states), hardcoded values, and
   obvious performance problems.
2. Run and visually inspect the site. Start the dev server. Open the site
   and take screenshots of every page/route. Compare what renders against
   what the code intends.
3. Interact like a user. Click every button, link, and menu item. Fill out
   and submit every form — including with invalid/empty input. Test all
   interactive features (modals, dropdowns, search, filters, auth flows).
   Note anything that errors, dead-ends, or behaves unexpectedly. Check the
   browser console for errors/warnings during all interactions.
4. Responsive testing. Resize the window to mobile (375px), tablet (768px),
   and desktop (1440px) widths. Screenshot each. Flag layout breaks,
   overflow, overlapping elements, unusable touch targets, and hidden
   content.
5. Report. Write findings to QA-REPORT.md with: severity
   (critical/major/minor), description, steps to reproduce, screenshot
   reference, suspected file/line where applicable, and suggested fix.
   Separate "bugs" from "improvement ideas." Do not fix anything yet —
   report only.
```

**Acting on the report.** The audit is report-only — it never fixes anything
in the same pass. Triage `QA-REPORT.md` afterwards: an unresolved
**critical** finding on a surface the build touched means the build is not
done; majors/minors are fixed or explicitly deferred with the user. (The
375/768/1440 widths sit inside the §4 responsive tiers — this audit
supplements the §4 contract, it does not replace it.)

### Visual verification method (A: video · B: screenshots)

Visual verification is mandatory — **never sign off on UI work from code
review alone; run the site and look at it.** Pick a method by what the
change is:

**Method A — video + frame-by-frame.** Record the whole browser session,
then extract and review frames as images.
- _Use when:_ motion / time-based behavior (animations, transitions,
  loading/skeleton states, scroll, drag-and-drop); hunting layout shift,
  flicker, or jank that only shows up _between_ states; auditing a long
  multi-step flow end-to-end where the journey matters; any
  post-major-change pass where you want a replayable record as evidence;
  or a vague "something looks off when I click around" report where you
  don't yet know where to look.
- _How:_ run Playwright with video capture (`playwright` MCP with
  `--save-video=800x600 --output-dir …`, or a local script —
  `chromium.launch({ channel: "chrome" })`, `recordVideo` on the
  context). Drive the full flow in one session, narrating each action in
  your notes. Extract frames:

  ```bash
  ffmpeg -i session.webm -vf fps=1 frames/frame_%03d.png
  ```

  Use `fps=2` or higher for fast animations/transitions; `fps=1` is the
  default. Review frames in sequence; for each anomaly note the frame
  number, what's wrong, and the action that preceded it. Keep the
  `.webm` and reference it in the report so a human can replay it.
- _Cost:_ slower (record → extract → review many images). Don't use it
  for a single page or one button.

**Method B — screenshot key moments.** Screenshot after each meaningful
action and assess it before proceeding (this is what the
`scripts/probe-*.mjs` probes already do).
- _Use when:_ static / discrete states (layouts, forms, modals,
  empty/error states, dark mode); responsive checks (screenshot each
  surface at 375 / 768 / 1440); targeted verification of one specific
  change; fast fix → screenshot → confirm → next iteration; or
  console/network-error focus (pair with `chrome-devtools` MCP). Always
  screenshot before AND after a destructive/state-changing action, and
  save with descriptive names (`calendar-chips-night-1280.png`).
- _Cost:_ misses anything that happens _between_ shots (transitions,
  flicker, races).

**Choosing.** Default to **B** for routine reviews and targeted checks
(faster, cheaper). Escalate to **A** when behavior over time matters or
for a full post-major-change audit (B for the spot-checks after the
fixes). When unsure, start with B and switch to A the moment you see
something you can't explain from stills. Combining is fine — video for
the main flow pass, screenshots for responsive and error-state checks.
Evidence in `QA-REPORT.md` is the frame number + `.webm` path (A) or the
screenshot filename (B).

---

## 5. How we work — DO

- **Read the spec before building a screen.** `Documents/Project Files/5.16.26
planning_document.md` has a screen-by-screen section (§5) and the data model (§4).
  The design handoff under `Documents/Claude Design/` has pixel-level artboards
  (`.jsx` files) for each surface.
- **Recreate designs faithfully, in idiomatic React.** Match the artboards' visual
  output — dimensions, colors, spacing — but write clean TypeScript/React. Do **not**
  copy the prototype's HTML/CSS structure verbatim.
- **Reuse the existing component vocabulary.** New views consume `LessonCard`, the
  theme/palette hooks, the mock data, and the token system. Match the comment density,
  naming, and idioms of the surrounding code.
- **Keep grade-scoping in every data shape and query**, even while only Grade 5 is
  active.
- **Keep each surface single-purpose.** If a feature is filtering or management, it
  belongs in a panel or Settings — not bolted onto a primary view.
- **Build the data shapes for infrastructure (audit log, coverage snapshots, roles)
  when the backend lands**, even if there is no UI for them yet.
- **Run `npm run lint` and `npm run format:check`** before considering work done.
- **Run the Live QA Audit gate (§4b) before declaring a build done** — real
  clicks in a real browser via the `playwright` / `chrome-devtools` MCP
  servers, in addition to (never instead of) the §4a code review.
- **Verify the responsive contract.** Before declaring a screen done, eyeball it at
  ~400px, ~768px, and ~1280px in DevTools device emulation. Confirm: no
  document-level horizontal scroll, all primary controls reachable, touch
  targets ≥44px on phone/tablet, chrome doesn't crowd the content on phone.
  See §4 for the full responsive rule.
- **Track multi-step work with the task tools** and, for parallelizable work, split it
  across agents with clear, non-overlapping file ownership.

## 6. How we work — DO NOT

- **Do not build out of phase.** Phase 1A is the late-August beta gate; everything else
  waits. See the roadmap (§8 of the planning doc) and the status table in §1 for what
  is already shipped. In particular, do **not** start:
  student/parent/admin-facing features, gradebook/attendance, a marketplace, file
  hosting/annotation (Phase 1B+), AI features (Phase 3+),
  LMS/SIS integration, or multi-language UI.
- **Do not add theme colors or design tokens to `tailwind.config.ts`.** Tokens live in
  `tokens.css`.
- **Do not hard-code colors, fonts, or subject palettes.** Use tokens and the palette
  system.
- **Do not import anything from `Documents/`.** It is reference material only.
- **Do not break the forking model.** Don't make completion fork a lesson; don't let
  Personal edits silently write to Master; don't let Master be editable without the
  explicit toggle + banner.
- **Do not add confirm dialogs for entering Master mode** — the flashing/persistent
  banner is the deliberate safety mechanism.
- **Do not assume a single grade level** anywhere in data or queries.
- **Do not hard-code the school week** (the set of weekdays, or a 5-day assumption). It
  is chosen at setup; every calendar surface derives its day columns from it. Today's
  mock fixtures use a Sun–Thu week — treat that as sample data, not a constraint.
- **Do not hard-code the daily schedule or assume a weekly cycle.** Timetables are
  customizable and may rotate on A/B (or longer) cycles independent of the week.
- **Do not introduce new dependencies** without a clear need; prefer the existing
  stack. No component/UI kits — components are bespoke against the token system.
- **Do not commit or push** unless explicitly asked. Branch off `main` first if you do.

---

## 7. Reference documents

Reference material (never imported by the app). The master spec lives under
`Documents/Project Files/`; all other historical-reference docs live under
`docs/historical/`. The `Documents/` folder otherwise holds only the design
handoff bundle.

- `Documents/Project Files/5.16.26 planning_document.md` — the master spec. §3 IA,
  §4 data model, §5 screen-by-screen, §6 design system, §7 tech architecture, §8
  phased roadmap, §9 acceptance criteria, §10 open questions.
- `docs/historical/5.16.26 conversation_record.md` — the decision history behind
  the spec.
- `docs/historical/5.16.26 MyCurricula_Business_Plan_Addendum.md` — positioning,
  pricing.
- `docs/historical/5.16.26 *Competetor Anaylisis*` + `docs/historical/5.12.26
  *Planbook*` — competitive context; selectively absorbed features.
- `docs/historical/5.17.26 Onboarding & Lesson-Flow Template Plan.md` — cited by
  `lib/lesson-templates.ts`.
- `docs/historical/5.18.26 collapse_on_drag_pattern.md` — cited by
  `lib/collapse-on-drag.ts` and `components/grid/WeeklyGrid.tsx`.
- `docs/historical/5.20.26 Plugin Directions - Daily View Lesson Panel.md` — cited
  by `components/daily/LessonDetail.tsx` and the three `components/lesson-flow/`
  files.
- `Documents/Claude Design/5.16.26 Build A Curriculum-handoff/` — the design
  handoff bundle. `project/*.jsx` are per-surface artboards;
  `project/tokens.css` is the token source; `project/README.md` explains the
  handoff.

**Operational docs** (under `docs/`, checked into the repo, not reference-only):

- `docs/5.24.26 claude-access.md` — how AI assistants (Claude Code / Chat / Co-work /
  Code Cloud) authenticate to the deployed app via the token-gated bypass. Includes
  the three entry points, audit-log queries, Cloudflare secret-rotation procedure,
  and the security checklist. Read this before changing auth, middleware, or the
  Supabase service-role surface.
- `docs/claude-bypass.sql` — DDL for `public.claude_access_log` (the bypass audit
  table). Run once in the Supabase SQL editor.

**Phasing reminder:** Phase 1A shipped — Weekly/Daily/Subject/Year/Schedule/Catch-up
views, Master/Personal toggle, Simple/Task/Advanced view modes, standards tagging,
daily notes, basic print/export, Vivid theme as default, unified Settings hub, and
the onboarding wizard (see §1 status table for the full list). Phase 1B is the
**Supabase backend wave** — wiring persistence so the forking model writes through,
holidays render, schedule rotation cycles work end-to-end, unit-import lands. Phase 2
brings full forking semantics + year rollover. Phase 3+ brings annotation, admin, and
AI. When in doubt about whether to build something, check the §1 table and the
roadmap, and ask.

---

## 8. Canonical names, route map, and audit-doc disclaimer

This section disambiguates the doc landscape so a new agent or contributor doesn't
chase contradictions.

### Authoritative MDs (the only docs that bind current behavior)

- **`CLAUDE.md`** — policy, phasing, product principles, and the rules every
  contributor must follow. This file.
- **`BUILD_STANDARD.md`** — the visual, structural, and responsive contract. The
  only authoritative visual contract. The older
  `Documents/Project Files/5.24.26 website_build_standard_claude_codex.md` was
  removed in this consolidation as it overlapped with `BUILD_STANDARD.md`.
- **`Documents/Project Files/5.16.26 planning_document.md`** — the master spec
  (data model, screen-by-screen, roadmap, acceptance criteria).

Everything else under `Documents/` (the design handoff bundle) and
`docs/historical/` (historical reference) and `docs/*audit*.md` / `docs/research-*.md`
(dated audit snapshots) is reference material. See "Audit-doc disclaimer" below.

### App name — canonical spelling

**`mycurricula.app`** (plural). The GitHub repo is `timjmills/mycurricula.app`
and the deployed Cloudflare custom domain is the same. Older docs that use the
singular `mycurriculum.app` predate the canonical name; treat those as
historical.

### Route aliases (planning-doc names vs. current routes)

The planning doc and some older artifacts name routes that have since been
renamed in the codebase. These have not changed in 2 months; older docs that
say `/curriculum` or `/yearly` refer to the same surfaces.

| Planning-doc name | Current route | Top-bar tab label |
| --- | --- | --- |
| `/curriculum` | `/subject` (→ `/subject/<id>`) | "Curriculum" |
| `/yearly` | `/year` | "Yearly" |

### Audit-doc disclaimer

Every `docs/*audit*.md` and `docs/research-*.md` is a **dated snapshot**.
Findings, recommendations, and "open questions" recorded in those docs may
already be fixed, deferred, regressed, or superseded by later work. Each
audit doc carries a snapshot-disclaimer header noting its date. **Verify
against current code before treating any finding as open or any
recommendation as binding.** A quick check:

```
git log --oneline -- <relevant-file-path>
```

The canonical project guide for what's true today is **this file
(`CLAUDE.md`)** plus `BUILD_STANDARD.md`.
