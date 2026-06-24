# Wave 1 audit prompt (per CLAUDE.md §4a + §4b)

> Paste the block below into a Claude Code terminal session (repo checked out, Codex installed).
> Wave 1 is **docs-only**, so the **§4b Live QA gate is N/A this wave** (no UI/code change) — it resumes at
> Wave 2. This runs the **§4a Code Review Gate** (Codex + an independent Claude review), adapted to verify
> the doc rewrites against the v2 handoff and confirm nothing was weakened.

---

```text
You are running the CLAUDE.md §4a Code Review Gate on a DOCS-ONLY wave. Read-only. Do NOT implement.

SETUP
1. git fetch origin claude/v2-wave1-docs && git switch claude/v2-wave1-docs
2. Review range: master..claude/v2-wave1-docs  (commit 773f67dc6).
   Changed files (must be ONLY these four): BUILD_STANDARD.md, CLAUDE.md, AGENTS.md,
   "Documents/Project Files/5.16.26 planning_document.md".
3. v2 handoff = source of truth. Fetch read-only:
   git fetch origin claude/design-handoff-v2-site
   then read "Documents/Claude Design/6.24.26 design_handoff_v2_site/design-system/{V2 Framework.md,
   colors_and_type.css,themes.css,modes.css}". Also cross-check the canonical plan:
   git show origin/claude/v2-merged-plan:docs/v2-rebuild/CANONICAL-MERGED-PLAN.md
4. Do NOT run `npm run build` — no app code changed; a build is irrelevant to a docs wave and only
   burns the sandbox budget (per the §4a Windows sandbox note, pipe the diff instead).

REVIEW 1 — Codex (sandbox NEVER weakened):
   git diff master..claude/v2-wave1-docs | codex exec --sandbox read-only "$(cat <<'P'
Act as a strict, skeptical Senior Security & QA Engineer reviewing a DOCS-ONLY change (the diff on
stdin = master..claude/v2-wave1-docs). For each issue report file/line, severity (Critical/High/
Medium/Low), the concrete failure scenario, and a fix. This wave rewrites the project contract docs to
the v2 design. VERIFY every load-bearing claim against the v2 handoff — do NOT trust the docs. Check:
(1) the 7 themes are named correctly and paper+cloud FOLD to clear; (2) the appearance axes
(data-frame/data-glass/data-bg/data-theme/data-dim + derived data-tone + data-canvas/veil/zoom) match
the handoff/bundle; (3) the subject->slot map is EXACTLY math=1, ufli=2, writing=5, grammar=7,
spelling=9, reading=10, sel=12, explorers=13; (4) RULE #1 NO SHARP CORNERS + the two glass recipes
(frosted-on-photo, Liquid-v5-on-wash) + the legibility contract are present and correct; (5) the §4a
Code Review Gate, the §4b Live QA Audit Gate, and the folder/naming conventions were PRESERVED VERBATIM
(not weakened or deleted) in CLAUDE.md and AGENTS.md; (6) the token guidance is ADDITIVE (no "replace
:root verbatim"; all v1-only tiers kept); (7) NO app code was modified (only the 4 docs); (8) the
forking value space is unchanged (internal master/core; only the UI label becomes "Team Curriculum";
completion never forks; pink glow #E8179B on [data-mode=team]). Also flag any drift from the locked
decisions: base = clean master, default route /weekly, /subject is a retired redirect to /year. Do not
praise; report only problems. If nothing is Medium or above, output exactly: NO BLOCKING ISSUES.
P
)"
   Capture Codex's output to CODEX-WAVE1-REVIEW.md. If Codex can't run, say why (do not weaken the sandbox).

REVIEW 2 — independent Claude (the §4a substitute, REQUIRED on cloud/remote where Codex may not
converge): a fresh agent that did NOT author the docs runs the same checklist above against the diff +
the handoff + the canonical plan, in the §4a persona, and writes CLAUDE-WAVE1-REVIEW.md with the same
findings format.

DELIVERABLE: both reviews, each ending with GO / GO-WITH-CHANGES / NO-GO + a findings table + a
must-fix-before-Wave-2 list. Paste them back into the cloud session; it will validate each finding and
fold the legitimate ones in before starting Wave 2.
```
