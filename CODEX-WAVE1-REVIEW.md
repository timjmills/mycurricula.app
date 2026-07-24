# CODEX-WAVE1-REVIEW.md — REVIEW 1 (Codex, §4a gate) — SUCCESSFUL RUN

> NOTE: earlier concurrent-session attempts hit API blocks (`claude -p` ConnectionRefused;
> `codex exec` stream-disconnect) and fell back to manual reviews. **This session's Codex
> run succeeded** — `codex exec --sandbox read-only`, model gpt-5.5, reasoning xhigh, exit 0.
> Raw transcript (full echoed stdin + findings): the background task output file
> `…/tasks/biwoxci3u.output`. Sandbox never weakened.

**Gate:** `git diff master..claude/v2-wave1-docs` + the v2 handoff (`V2 Framework.md`,
`colors_and_type.css`, `themes.css`, `modes.css`) + the canonical merged plan, all piped to
`codex exec --sandbox read-only` so Codex verifies the diff against the source of truth (not the
docs' own claims). Commit `773f67d`, docs-only (4 files: AGENTS.md, BUILD_STANDARD.md, CLAUDE.md,
planning_document.md). Scope independently confirmed: 4 docs, zero app code.

## Codex verdict: 2 High + 2 Medium, no Critical

(Codex did NOT emit "NO BLOCKING ISSUES" → it flagged blocking issues. All four
orchestrator-validated against the handoff as legitimate; folded into `CLAUDE-WAVE1-REVIEW.md`.)

1. **[High] → M6** `BUILD_STANDARD:37, CLAUDE:179, AGENTS:75, planning:1939` — Docs say `night`
   is "now the dark tone, **not a peer theme**" while also listing `data-theme="night"`. Handoff
   (`V2 Framework.md:575` "Night is the only dark theme and forces dark tone") requires Night to
   remain a `data-theme` value that forces `data-tone="dark"`. Risk: Wave-2 migration/CHECK drops
   `night` from the enum, stranding persisted Night users. (Severity reduced to Medium: docs DO
   list night in the enum everywhere.) Fix: "Night is a `data-theme` value that forces
   `data-tone="dark"`; dark rendering branches on `data-tone`."

2. **[High] → M5** `BUILD_STANDARD:47, CLAUDE:195, AGENTS:80, planning:1941` — Tone derivation
   "Photo **Dim/Normal → dark**" contradicts Normal being the auto/luminance-sampled mode. Light
   photos in Normal would force dark-tone/white text → WCAG AA contrast failure. Fix: "Dim forces
   dark; Bright forces light; Normal samples photo luminance to derive light/dark tone."

3. **[Medium] → S2** `BUILD_STANDARD:9-13, 674-677` — "When this doc and the code disagree, the
   code is the truth" weakens the handoff's authority; the handoff wins for v2 look/behavior. Fix:
   carve out — handoff wins for v2 look/behavior (fix the code to match); code-is-truth only for
   current-state implementation facts.

4. **[Medium] → S1** `BUILD_STANDARD:330-363` (now §8) — Button guidance (`--chrome-accent-*` +
   neutral resting shadow) conflicts with V2 Framework §10 (`:404` "Primary = `--accent` fill +
   colored shadow"). Fix: keep the `.btn.<variant>` specificity rule; align visual values to
   `--accent` + the handoff's primary-button colored-shadow recipe.

## Orchestrator independent confirmations (Codex correctly did NOT flag these)
- Subject→slot map `math1·ufli2·writing5·grammar7·spelling9·reading10·sel12·explorers13` — exact
  vs `V2 Framework.md:186-193`; zero off-by-one.
- Pink Team glow `#E8179B` = `--subj-5-bright` — exact vs `colors_and_type.css:49`.
- §4a/§4b gates + folder/naming conventions — byte-identical to master.
- No app code; diff = the 4 docs only.

**Full synthesis, must-fix-before-Wave-2 list, the dismissed false positive, and the
independent 3-agent REVIEW 2: see `CLAUDE-WAVE1-REVIEW.md`.**
