# mycurricula.app - Agent Guide

This file is the operating contract for coding agents working in this repo.
Read it before editing code, then read the authoritative docs it points to.

## Source-of-Truth Order

When docs disagree, use this hierarchy:

1. `CLAUDE.md` - current project truth: product rules, phase gates, shipped vs. pending status, architecture, and "do not" constraints.
2. The **v2 visual contract**: the **v2 mockup + `V2 Framework.md`** (under `Documents/Claude Design/.../design-system/`) is the canonical visual reference for the v2 rebuild, alongside `BUILD_STANDARD.md` (the structural, responsive, and component contract). The handoff **wins for look and behavior** — when code and the handoff disagree, fix the code. Recreate it faithfully in idiomatic React; cite the handoff as the origin. The older `/weekly` is no longer the canonical visual reference.
3. `Documents/Project Files/5.16.26 planning_document.md` - master product spec, data model, screen-by-screen intent, and historical roadmap context.
4. `docs/5.24.26 claude-access.md` - operational auth-bypass instructions. Read before changing auth, middleware, service-role access, or the Claude bypass.
5. `docs/*audit*.md`, `docs/research-*.md`, and `docs/historical/*` - dated snapshots or historical reference. Verify against current code before treating any finding as open or binding.

Important planning-doc caveat: its roadmap section preserves the May 12 planning state. The 2026-05-27 update in that section says Vivid, visual/state forking, and Schedule already landed in Phase 1A. For current shipped/pending status, `CLAUDE.md` wins.

## Current Product State

Phase 1A is shipped as a live beta-ready prototype at `mycurricula.app`.
Every primary view currently uses `lib/mock/` fixtures. Supabase persistence,
auth rows, realtime, holidays-on-weekly/daily, schedule rotation cycles, and
unit import are Phase 1B work.

The v2 console spine is **Day · Week · Year · Lesson Plan · Teach**, plus the
Planner Hub and Resource Wall. Surfaces:

- `/daily` (Day — "what now?")
- `/weekly` (Week)
- `/year` (Year — the v2 "Curricular plan"; `/subject` is a legacy redirect to `/year`, already retired on master)
- Lesson Plan (the unit/lesson planner)
- Teach (the projection board)
- `/planner` — **Planner Hub** (v2 planning home / hub surface)
- `/post` — **Resource Wall** (v2 resource board: per-card colors, per-section photos)
- `/schedule` as a deep-link and side-panel via GlobalRail
- `/catch-up`
- `/settings/*`
- Onboarding wizard
- Master/Personal visual and local state model
- Claude auth bypass

New v2 surfaces / capabilities also include a **Tools dock**, **3-layer
notifications** (toasts · bell + notification center · inline badges), a
**per-heading style cog** (set a surface's Background + Frame, this-page vs
whole-site), and **share-links** (signed tokens).

**v2 redesign is in progress behind `NEXT_PUBLIC_V2`** — a build-time flag with
per-wave reveal; rollback is redeploy-gated. **Default appearance:** Frame A
(Calm Glass) · Photo background · Theme Clear · auto tone (luminance-sampled from
the active photo). **Hosting:** Cloudflare Workers via OpenNext + R2.

## Non-Negotiable Product Rules

- Teachers are the only users in scope. Do not build student, parent, admin-facing, gradebook, attendance, marketplace, LMS/SIS, or multilingual product surfaces unless the phase guidance explicitly changes.
- The app is multi-grade by design. Never assume Grade 5 in data shapes, queries, or reusable UI.
- The school week is configurable. Never hard-code a five-day week, Sun-Thu, or Mon-Fri outside sample/mock data.
- Timetables are configurable and may rotate on cycles independent of calendar weeks. Never assume a single fixed daily schedule or a weekly-only cycle.
- Master/Personal forking is core, and **unchanged in value space**: internal `editMode ∈ personal | master`, `SaveTarget ∈ personal | core`. Only the **UI label** changes — Master is surfaced to teachers as **"Team Curriculum."** Personal edits lazily fork; completion never forks; Team edits require the explicit **Personal / Team Curriculum** toggle plus a **pink caution glow** (`#E8179B`) firing on `[data-mode="team"]` (frame edge-glow + toggle + planning header), persistent, with a brief two-pulse; **solid under reduced-motion**, **NEVER a confirm dialog** — the glow IS the safety mechanism. The three-tier lesson cues are **preserved**: solid subject stripe (from Team/Master) · dashed stripe + "Modified" pill (personally edited) · move-arrow (personally moved).
- Color carries information. Do not use color as decoration or invent subject colors.

## Build Standards

Use the existing stack and patterns:

- Next.js App Router, React 19, TypeScript.
- Tailwind only for layout and spacing utilities.
- Fonts: **Poppins** (display/H1) · **DM Sans** (headings/wordmark) · **Plus Jakarta Sans** (UI/body/data), delivered via `next/font` — do **not** switch to a Google Fonts `@import`.
- CSS custom-property tokens in `app/tokens.css` for color, type, spacing, radius, shadow, and z-index. **Token migration is ADDITIVE:** v2 names are added and ~6 shared collisions re-pointed, but **all v1-only tiers are preserved** (`--chrome-accent-*`, `--rail-bg` / `--panel-bg`, `--logo-*`, `--wf-*` / `--teach-*`, `--tag-*`, `--hl-*`, scrims, the z-scale). Do not delete a v1 tier just because v2 doesn't reference it.
- Subject colors only through `.cp-subj.<subjectId>` or `useSubjectColor(subjectId)`.
- Import public component surfaces from folder barrels where they exist; avoid deep imports when a component family exposes `index.ts`.
- Never import app code from `Documents/`; that folder is reference material only.

### The v2 appearance engine — attribute vocabulary

The visual system is a set of independent axes, all set as `<html>` / app-root
data attributes by `lib/theme.tsx`. **This replaces the v1 3-axis model**
(`data-style ∈ quiet|calm|vivid`, `data-palette ∈ normal|highlight`,
`data-theme ∈ paper|cloud|night|mint|sky|blossom`): `data-style` and
`data-palette` are **dropped**; `paper` + `cloud` **fold to `clear`**; `night`
is now the dark **tone**, not a peer theme.

- `data-frame` ∈ `glass | paper | color` — layout character + material + emphasis. The working build also carries the equivalent `data-version ∈ A|B|C` on the app root (A=Glass, B=Bright/paper, C=Color-forward) — **treat them as the same axis.** A frame changes layout/material, never the global tone.
- `data-glass` ∈ `dark | light` — the two frosted **registers** of Frame A (dark frosted = translucent dark panels + white text; white frosted = translucent white panels + dark ink). Surface-only — flips a panel's fill **and** its text together; must never wash the background.
- `data-bg` ∈ `photo | wash` — what lives behind the glass. **Frosted glass over Photo, Liquid glass ("Liquid v5") over Wash.**
- `data-theme` ∈ `clear | night | honey | blossom | mint | sky | off` — the seven themes (below). (`off` = Photo, the true ungraded photo.)
- `data-dim` ∈ `dim | normal | bright` — Photo prominence + text treatment (Photo only); `normal` is an **auto** mode (samples photo luminance to derive tone).
- `data-tone` ∈ `light | dark` — **DERIVED**, not chosen: Night forces dark; Photo Dim/Normal → dark; Wash / Photo-Bright / any light theme → light. **Every surface branches on `data-tone`, never on the theme.**
- Plus the supporting axes `data-canvas` (home center panel), `data-veil` (readability layer), and `data-zoom` (ambient drift on/off).

**The 7 themes** (a theme washes the whole app — ambient palette, soft-light tint,
and the `--accent`/glow; subject + status colors never move):

| Theme | Role |
|---|---|
| **Clear** | the resting theme (formerly Normal/paper); balanced brand mesh, white/clear swatch |
| **Night** | the dark theme — the dark **tone** |
| **Honey** | warm gold/amber/coral |
| **Blossom** | pink/violet/periwinkle multi-hue |
| **Mint** | blue-green |
| **Sky** | cool blues |
| **Off (Photo)** | no wash/grade — the true original photo |

**Material + glass.** **GLASS is the signature material** — frosted over photo,
"Liquid v5" over wash, in a dark or white register. Glass always carries an inner
top highlight (`inset 0 1px 0` white line, the lit-edge read); over dark it tints
darker, over light it stays bright; never replace floating-chrome glass with a
flat opaque card. **RULE #1 — NO SHARP CORNERS, EVER**: every panel, card, tab,
chip, button, image, preview tile, and input is rounded. **Color is information,
never decoration**; **gradients are atmosphere, not surfaces**. The legibility
contract = **branch on `data-tone`, never the theme**.

**The §4 subject→slot map** (locked **team-wide** — not a teacher preference; color
carries team-wide meaning). The token scale is wider than the named subjects
(`--subj-1 … --subj-15`, each with `-tint` / `-ink` / `-bright` companions):

| Subject | Slot | | Subject | Slot |
|---|---|---|---|---|
| math | `--subj-1` (gold) | | reading | `--subj-10` (blue) |
| ufli | `--subj-2` (apricot) | | sel | `--subj-12` (teal) |
| writing | `--subj-5` (pink) | | explorers | `--subj-13` (green) |
| grammar | `--subj-7` (purple) | | | |
| spelling | `--subj-9` (periwinkle) | | | |

(The pink Team caution glow `#E8179B` is `--subj-5-bright`.)

For UI work:

- The canonical visual reference is the **v2 mockup + `V2 Framework.md`**, not `/weekly`.
- Reuse canonical primitives and established component families before creating anything new.
- Do not recreate buttons, cards, list rows, headers, badges, chips, toggle groups, or tooltips inline.
- Use the 4/8/12/16/24/32 spacing rhythm.
- Keep cards, panels, and controls token-driven. No hard-coded hex colors or raw font sizes in components.
- Every interactive control and named panel needs an onboarding explanation via the Tooltip/Button pattern described in `CLAUDE.md`.
- Respect reduced motion. No bounce, parallax, confetti, or surprise motion.

## Responsive Requirement

Every primary surface must work at:

- Phone: 360-480px
- Tablet: 600-900px
- Desktop: 1024-1920px

Before calling UI work done, verify at roughly 360 or 400px, 768px, and 1280px:

- no document-level horizontal scroll
- all primary controls reachable
- phone/tablet touch targets at least 44 x 44px
- sticky chrome does not crowd phone content

Use the commit/PR verification line from `BUILD_STANDARD.md` when committing:

```text
Verified: 360 OK / 768 OK / 1280 OK
```

If a tier is not OK, state the actual issue instead of marking it OK.

## Required Commands

Before considering work complete, run:

```bash
npm run lint
npm run format:check
```

For UI work, also run the app and inspect the affected views at the required
responsive widths. If you cannot run a command or verification step, say so
clearly in the handoff.

## Code Review Gate

For changes that affect logic, security, data handling, or public interfaces,
run an adversarial review before declaring the task complete or asking for user
review. Trivial comments, formatting, and copy-only edits do not require this
gate.

**Precondition — stage every in-scope file first.** The review prompt reads
`git diff` (working tree vs index) and `git diff --cached` (index vs HEAD),
which together cover staged and unstaged tracked-file changes but NOT
untracked (`??`) files. New files sitting as `??` in `git status` would be
invisible to the reviewer. Run `git status --short` first and `git add`
every file that's in scope for the change before invoking the gate.

Codex must invoke Claude Code headlessly with read-only tools only:

```bash
claude -p "$REVIEW_PROMPT" --allowedTools "Read,Grep,Glob,Bash(git diff:*),Bash(git diff --cached:*)"
```

Use this exact review prompt:

```text
Act as a strict, skeptical Senior Security & QA Engineer. Review the current
uncommitted changes (run `git diff` and `git diff --cached` for context). For
each issue report: file/line, severity (Critical / High / Medium / Low), the
concrete failure scenario, and a suggested fix. Focus on logic errors, security
flaws, race conditions, unhandled edge cases, broken error handling, and missing
or wrong tests. Do not praise; report only problems. If nothing is Medium or
above, output exactly: NO BLOCKING ISSUES.
```

Evaluate Claude Code's findings critically. Do not apply suggestions blindly:
fix every Critical and High finding that is legitimate, and state why any
dismissed finding is a false positive, out of scope, or intended behavior.
Re-run the review after fixes until Claude Code reports `NO BLOCKING ISSUES`, or
until only justified Low/Medium items remain.

If local policy, sandboxing, authentication, or CLI availability prevents the
review command from running (for example, the `claude` CLI is unavailable in the
environment), do not bypass the restriction or send code through another path.
Report the blocker, then do BOTH of the following — neither substitutes for the
other:

1. **Mandatory adversarial review — run by whichever reviewer is the more
   rigorous for the change.** The gate's defining property is INDEPENDENT
   adversarial review — a reviewer that did not author the code. When the
   primary reviewer is unavailable, choose the substitute that best preserves
   that, by rigor:
   - **An independent review pass** that did NOT author the diff (e.g. a freshly
     spawned review agent) is the closest substitute: clean eyes, none of the
     author's blind spots. Prefer it for security / auth / data-handling /
     migration / privilege / public-interface changes.
   - **Your own self-administered review** brings full intent + integration
     context. Prefer it when that context is scarce or an independent pass isn't
     practical.
   - **Both** is the most rigorous, and is REQUIRED for high-consequence changes
     (auth, RLS/privileges, data migrations — tenant-leak or lockout risks).
   - If the two are genuinely equally good for the change at hand, either alone
     suffices — pick one.

   Regardless of who reviews: the reviewer must be INDEPENDENT of the author (an
   implementation pass reviewing its OWN diff does not count); adopt the "strict,
   skeptical Senior Security & QA Engineer" persona; read the full diff; and
   report file/line, severity (Critical / High / Medium / Low), the concrete
   failure scenario, and a fix. NOT satisfied by lint/typecheck/build alone. You
   OWN the outcome — critically validate every finding (never rubber-stamp a
   `NO BLOCKING ISSUES`), fix every legitimate Critical and High before
   committing, justify any dismissal, and conclude with `NO BLOCKING ISSUES` (or
   the remaining justified Low/Medium items). State plainly which reviewer(s) ran
   and that the primary gate was unavailable, so the substitution is on the
   record.

2. **Local verification stack**, on top of the self-review — the project's lint,
   typecheck, build, and the relevant test suite.

## Live QA Audit Gate

The Code Review Gate above checks the diff. A second, separate gate checks
the running app: a live QA audit — visual + interaction testing in a real
browser. **Both gates run before a build is said to be done.** This gate is
not performed through the headless review command: whichever agent has
browser tooling runs it (in Claude Code, the user-scope `playwright` /
`chrome-devtools` MCP servers; otherwise a local Playwright script with
`channel: "chrome"`).

Breadth scales with the build — an app-wide wave gets the full template
below; a focused change gets every surface it touches plus a browser-console
error check. The audit is report-only; triage findings afterwards. An
unresolved critical finding on a touched surface means the build is not
done. Full contract: `CLAUDE.md` §4b.

Use this audit prompt (canonical template):

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

**Visual verification method — never sign off on UI from code review
alone.** Pick by the change (full rationale in `CLAUDE.md` §4b):

- **Method A — video + frame-by-frame.** Record the whole session, then
  extract frames and review them as images. Use for motion / time-based
  behavior (animations, transitions, loading states, scroll,
  drag-and-drop), layout shift / flicker / jank between states, long
  multi-step flows, post-major-change audits (replayable evidence), or
  vague "something looks off" reports. Capture with Playwright video
  (`recordVideo` / `--save-video`), then:

  ```bash
  ffmpeg -i session.webm -vf fps=1 frames/frame_%03d.png
  ```

  `fps=2`+ for fast animations. Note frame number + preceding action per
  anomaly; keep the `.webm` for replay.
- **Method B — screenshot key moments.** Screenshot after each meaningful
  action and assess before the next (what the `scripts/probe-*.mjs`
  probes do). Use for static/discrete states, responsive checks
  (375/768/1440), targeted one-change verification, and console/network
  debugging. Screenshot before AND after destructive actions; name files
  descriptively.

Default to **B** for routine/targeted checks; escalate to **A** when
behavior over time matters or for full post-major-change audits.
Combining is fine. Cite the frame number + `.webm` path (A) or
screenshot filename (B) as evidence in `QA-REPORT.md`.

## Sandbox Discipline

Run commands inside the normal sandbox. Do not request escalation or execute
outside sandboxing unless the user explicitly asks for that specific command to
run unsandboxed after being told why sandboxing blocks it. If a command fails
because of sandbox limits, stop that path, report the blocker, and use a safer
sandboxed alternative when one exists.

## Working Practices

- Read nearby code before editing. Follow local naming, comment density, component boundaries, and state-management patterns.
- Keep edits scoped to the requested work. Do not perform broad refactors just because you see them.
- Preserve user work. Do not revert unrelated changes or run destructive git commands unless explicitly asked.
- Do not commit or push unless explicitly asked. If asked to commit, branch from `main` first unless the user says otherwise.
- Prefer existing dependencies. Add a dependency only when there is a clear need and the existing stack does not reasonably cover it.
- For multi-step or parallel work, split ownership by file or surface so agents do not overwrite each other.

## Route Names

Current routes differ from some older docs:

| Older/planning name | Current route | v2 console / tab label |
| --- | --- | --- |
| `/curriculum`, `/subject` (→ `/subject/<id>`) | `/year` (`/subject` is a legacy redirect to `/year`) | Year (the v2 "Curricular plan") |
| `/yearly` | `/year` | Year |
| (the unit/lesson planner) | Lesson Plan | Lesson Plan |
| (the projection board) | Teach | Teach |
| (new in v2) | `/planner` | Planner Hub |
| (new in v2 — resource board) | `/post` | Resource Wall |

Use current routes in code and implementation notes.

## When To Read Extra Docs

- New screen or major UI change: read the **v2 mockup + `V2 Framework.md`** (the canonical v2 visual contract, under `Documents/Claude Design/.../design-system/`), `BUILD_STANDARD.md`, `CLAUDE.md`, and the relevant planning-doc section. The handoff wins for look/behavior.
- Auth, middleware, Cloudflare bypass, service-role, or audit-log work: read `docs/5.24.26 claude-access.md` and `docs/claude-bypass.sql`.
- Lesson-flow resources or daily detail work: check `docs/historical/5.20.26 Plugin Directions - Daily View Lesson Panel.md`.
- Drag/drop behavior: check `docs/historical/5.18.26 collapse_on_drag_pattern.md`.
- Onboarding or lesson template work: check `docs/historical/5.17.26 Onboarding & Lesson-Flow Template Plan.md`.
