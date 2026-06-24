# Terminal adversarial-review prompt — v2 rebuild plan

> Paste the block below into a **Claude Code terminal session that has this repo checked out**
> (where Codex is installed). It runs TWO independent adversarial reviews of the v2 rebuild plan —
> Claude-terminal itself, and Codex — using the repo's Code Review Gate methodology
> (`CLAUDE.md` §4a / `AGENTS.md`). Each produces findings; bring both back to the planning session.

---

```text
You are running TWO independent adversarial reviews of a planning proposal, then reporting both
sets of findings. Do NOT implement anything. Read-only.

SETUP
1. Fetch and check out the plan branch:
     git fetch origin claude/v2-rebuild-plan && git switch claude/v2-rebuild-plan
2. Read these (the artifacts under review):
     docs/v2-rebuild/PHASED-PLAN.md          (the proposal)
     docs/v2-rebuild/V2-DELTA-ANALYSIS.md    (the surface-by-surface delta it is built on)
     docs/v2-rebuild/ADVERSARIAL-AUDIT-PROMPT.md  (context: the attack framing)
3. You also have the full codebase locally — VERIFY the plan's claims against actual code; do not
   take them on faith. The v2 design spec is NOT in this repo's working tree (it lives on branch
   claude/design-handoff-v2-site under Documents/Claude Design/6.24.26 design_handoff_v2_site/);
   fetch that branch read-only if you want to check design claims:
     git fetch origin claude/design-handoff-v2-site

REVIEW 1 — Claude-terminal (you), independent of the plan's author.
Adopt the Code Review Gate persona from CLAUDE.md §4a: "a strict, skeptical Senior Security & QA
Engineer." This is a PLAN review (architecture, sequencing, feasibility, risk, hidden assumptions),
not a code-diff review — adapt the gate's rigor accordingly. For every finding report: plan
section (or file:line in the repo that contradicts it), severity (Critical/High/Medium/Low), the
concrete failure scenario, and a suggested fix. Do not praise; report only problems. If nothing is
Medium or above, output exactly: NO BLOCKING ISSUES. Write the result to CLAUDE-PLAN-REVIEW.md.

REVIEW 2 — Codex, independent.
Run Codex non-interactively under the read-only sandbox (NEVER weaken the sandbox; if it cannot
run, stop and report why — per CLAUDE.md §4a):
    codex exec --sandbox read-only "$(cat docs/v2-rebuild/_codex-review-prompt.txt)"
where _codex-review-prompt.txt contains the prompt under "CODEX PROMPT" below (create it first).
Capture Codex's output to CODEX-PLAN-REVIEW.md.

CODEX PROMPT (write to docs/v2-rebuild/_codex-review-prompt.txt, then pass as above):
---8<---
Act as a strict, skeptical Senior Software Architect + Security & QA Engineer. You are reviewing a
PLANNING PROPOSAL, not a code diff. Read docs/v2-rebuild/PHASED-PLAN.md and
docs/v2-rebuild/V2-DELTA-ANALYSIS.md, and verify their claims against the actual codebase in this
repo. For each issue report: plan section or repo file:line, severity (Critical/High/Medium/Low),
the concrete failure scenario, and a suggested fix. Focus on: false claims about the current code;
infeasible "preserve data plumbing / rebuild presentation" separation given CSS-module + token
coupling; the appearance-engine port risks (allowlist lockstep across theme.tsx / theme-init.tsx /
migration CHECKs, SSR tone-flash from canvas luminance); the D1 subject-color remap actually being
no-data-migration (verify subjects are referenced by id and color is derived in lib/palette-data.ts);
basing the rebuild on the uncommitted, self-described "not standalone-buildable" WIP branch (does
`npm run build` even pass?); phase dependency/sequencing errors; missing data-model gaps; the
three-tier forking-cue preservation risk; and unrealistic net-new scope. Do not praise; report only
problems. If nothing is Medium or above, output exactly: NO BLOCKING ISSUES.
---8<---

SPECIFIC LOAD-BEARING CLAIMS BOTH REVIEWS MUST ATTACK
1. "Preserve data plumbing, rebuild presentation" is feasible — find surfaces where a faithful v2
   rebuild forces state/type/hook changes, not just CSS.
2. Token migration is safe as ADDITIVE-over-tokens.css — confirm no surface deletes the planner/
   Teach/chrome token tiers; confirm base tokens really are aligned.
3. D1 subject remap (writing->subj-5, spelling->subj-9, ufli->subj-2, sel->subj-12) is a token/alias
   change with NO data migration — verify in lib/palette-data.ts + tokens.css aliases; check nothing
   persists a color rather than a SubjectId.
4. Appearance engine (data-frame/glass/bg/tone + photo auto-luminance) — verify the allowlist-lockstep
   and SSR/no-FOUC boot-script risks are real and the plan's mitigation (persist last-known-tone) is sound.
5. Base-on-WIP decision (§5) — does the working tree actually `npm run build`? Is the WIP author's
   unfinished settings-modal a blocker? Quantify the collision.
6. Phase ordering — is Phase 0 truly the only hard prerequisite? Any cross-phase dependency the plan
   misses (e.g., net-new surfaces needing the data-model migration before the engine)?
7. The three-tier forking cue — confirm it is absent from the v2 demo and that the plan's
   "carry it into each frame by hand" is the right call, not a hand-wave.
8. Completeness — what does the plan omit entirely (rollback, feature-flag kill-switch, data-migration
   safety, perf budget, accessibility gates, the View-Transitions/persistent-shell feasibility in
   Next.js App Router)?

DELIVERABLE
Report back, in this session, BOTH: CLAUDE-PLAN-REVIEW.md and CODEX-PLAN-REVIEW.md — each with a
GO / GO-WITH-CHANGES / NO-GO verdict, the findings table, and a must-resolve-before-coding list.
Do not commit these review files unless asked.
```
