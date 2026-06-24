# mycurricula.app - Agent Guide

This file is the operating contract for coding agents working in this repo.
Read it before editing code, then read the authoritative docs it points to.

## Source-of-Truth Order

When docs disagree, use this hierarchy:

1. `CLAUDE.md` - current project truth: product rules, phase gates, shipped vs. pending status, architecture, and "do not" constraints.
2. `BUILD_STANDARD.md` - current visual, structural, responsive, and component contract.
3. `Documents/Project Files/5.16.26 planning_document.md` - master product spec, data model, screen-by-screen intent, and historical roadmap context.
4. `docs/5.24.26 claude-access.md` - operational auth-bypass instructions. Read before changing auth, middleware, service-role access, or the Claude bypass.
5. `docs/*audit*.md`, `docs/research-*.md`, and `docs/historical/*` - dated snapshots or historical reference. Verify against current code before treating any finding as open or binding.

Important planning-doc caveat: its roadmap section preserves the May 12 planning state. The 2026-05-27 update in that section says Vivid, visual/state forking, and Schedule already landed in Phase 1A. For current shipped/pending status, `CLAUDE.md` wins.

## Current Product State

Phase 1A is shipped as a live beta-ready prototype at `mycurricula.app`.
Every primary view currently uses `lib/mock/` fixtures. Supabase persistence,
auth rows, realtime, holidays-on-weekly/daily, schedule rotation cycles, and
unit import are Phase 1B work.

Shipped Phase 1A surfaces:

- `/weekly`
- `/daily`
- `/year`
- `/subject`
- `/schedule` as a deep-link and side-panel via GlobalRail
- `/catch-up`
- `/settings/*`
- Onboarding wizard
- Master/Personal visual and local state model
- Vivid style as the default
- Claude auth bypass

Do not treat old roadmap text that places Vivid, Schedule, or visual forking
in Phase 2 as current.

## Non-Negotiable Product Rules

- Teachers are the only users in scope. Do not build student, parent, admin-facing, gradebook, attendance, marketplace, LMS/SIS, or multilingual product surfaces unless the phase guidance explicitly changes.
- The app is multi-grade by design. Never assume Grade 5 in data shapes, queries, or reusable UI.
- The school week is configurable. Never hard-code a five-day week, Sun-Thu, or Mon-Fri outside sample/mock data.
- Timetables are configurable and may rotate on cycles independent of calendar weeks. Never assume a single fixed daily schedule or a weekly-only cycle.
- Master/Personal forking is core. Personal edits lazily fork; completion never forks; Master edits require the explicit Personal/Master toggle and banner. Do not add confirm dialogs for entering Master mode.
- Color carries information. Do not use color as decoration or invent subject colors.

## Build Standards

Use the existing stack and patterns:

- Next.js App Router, React 19, TypeScript.
- Tailwind only for layout and spacing utilities.
- CSS custom-property tokens in `app/tokens.css` for color, type, spacing, radius, shadow, and z-index.
- Subject colors only through `.cp-subj.<subjectId>` or `useSubjectColor(subjectId)`.
- Import public component surfaces from folder barrels where they exist; avoid deep imports when a component family exposes `index.ts`.
- Never import app code from `Documents/`; that folder is reference material only.

For UI work:

- Match `/weekly` as the canonical visual reference.
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

| Older/planning name | Current route | Tab label |
| --- | --- | --- |
| `/curriculum` | `/subject` and `/subject/<id>` | Curriculum |
| `/yearly` | `/year` | Yearly |

Use current routes in code and implementation notes.

## When To Read Extra Docs

- New screen or major UI change: read `BUILD_STANDARD.md`, `CLAUDE.md`, the relevant planning-doc section, and the matching design handoff under `Documents/Claude Design/` if one exists.
- Auth, middleware, Cloudflare bypass, service-role, or audit-log work: read `docs/5.24.26 claude-access.md` and `docs/claude-bypass.sql`.
- Lesson-flow resources or daily detail work: check `docs/historical/5.20.26 Plugin Directions - Daily View Lesson Panel.md`.
- Drag/drop behavior: check `docs/historical/5.18.26 collapse_on_drag_pattern.md`.
- Onboarding or lesson template work: check `docs/historical/5.17.26 Onboarding & Lesson-Flow Template Plan.md`.
