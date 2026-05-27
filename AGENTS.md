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
