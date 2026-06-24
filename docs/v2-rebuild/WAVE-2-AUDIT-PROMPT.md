# Wave audit prompt — dual §4a (Claude + Codex) + §4b live-QA (phone/tablet/desktop)

> Reusable per-wave audit, run **in the terminal** (Codex + browser MCP + native git live there).
> Instantiated below for **Wave 2 (appearance engine)**. For later visual waves, swap the BRANCH/RANGE
> and the §4b "surfaces to walk" list; everything else holds.
>
> Cadence: cloud builds the wave + runs the STATIC verify (tsc/lint/build + lockstep/additive greps);
> this terminal audit runs the §4a adversarial code review (Codex + an independent Claude) **and** the
> §4b live browser QA for real. Don't build the same wave in both sessions.

---

## Parameters (Wave 2)
- **BRANCH:** `claude/v2-wave2-engine`  ·  **DIFF RANGE:** `claude/v2-wave1-docs..claude/v2-wave2-engine` (engine code only; the docs already landed in Wave 1).
- **Handoff (truth):** `git fetch origin claude/design-handoff-v2-site` → `Documents/Claude Design/6.24.26 design_handoff_v2_site/design-system/{V2 Framework.md,colors_and_type.css,themes.css,modes.css}`.
- **Frozen value matrix:** `docs/v2-rebuild/WAVE-2-VALUE-MATRIX.md` on the branch. **Canonical plan:** `git show origin/claude/v2-merged-plan:docs/v2-rebuild/CANONICAL-MERGED-PLAN.md` (§3, §7).

---

## PART 0 — DESIGN-FIDELITY VERIFICATION (MANDATORY every wave; feeds both §4a and §4b)
Every audit verifies the wave against the **FULL v2 design handoff — not just the markdown.** Fetch
read-only (`git fetch origin claude/design-handoff-v2-site`), dir
`Documents/Claude Design/6.24.26 design_handoff_v2_site/`:
- **design-system/** — `V2 Framework.md` (written rules); `V2 Design System.html` + `Design Language.html`
  (visual gallery + narrative — **open in a browser**); `colors_and_type.css` + `themes.css` + `modes.css`
  + `styles.css` (tokens/engine).
- **mockup/** — `New v2 Site Design.bundled.html` — the **CANONICAL runnable reference**; open it in the
  browser and compare behavior + exact values against the build.
- **specs/** — `three-frames-spec.md`, `design-system-brief.md`, `wall-library-spec.md`, `v2-three-frames-audit.md`.
- **source/** — the per-surface `*.jsx` + `*.css` reference implementations (exact values + component logic).
- **assets/** — every image used.

**Authority chain (handoff README):** the **runnable bundled mockup wins for look/behavior** > **V2
Framework.md** for rules > **design-system CSS** for tokens > the plan for sequencing.
- In **§4a** (code): open the relevant HTML/CSS/jsx/mockup and verify every value/recipe/axis the wave
  touches matches the handoff — do NOT trust the diff or the plan's restatements.
- In **§4b** (live): compare the **rendered** result to the **bundled mockup + the design HTMLs** at each
  device width, not just to a mental model.

---

## PART A — §4a Code Review Gate (two independent reviewers)

```text
SETUP
  git fetch origin claude/v2-wave2-engine claude/v2-wave1-docs claude/design-handoff-v2-site
  git switch claude/v2-wave2-engine
  Review the diff: git diff claude/v2-wave1-docs..claude/v2-wave2-engine
  Verify claims against the handoff + the frozen matrix doc + the canonical plan — do NOT trust the code.

REVIEW 1 — Codex (sandbox NEVER weakened; pipe the diff per the §4a Windows note):
  git diff claude/v2-wave1-docs..claude/v2-wave2-engine | codex exec --sandbox read-only "Act as a strict,
  skeptical Senior Security & QA Engineer reviewing the v2 APPEARANCE-ENGINE diff on stdin. Per issue:
  file/line, severity, concrete failure scenario, fix. VERIFY against the handoff + the frozen value matrix.
  Focus: (1) ADDITIVE/back-compat — NO v1-only token tier deleted from app/tokens.css (--chrome-accent-*,
  --rail-bg/--panel-bg, --logo-*, --wf-*/--teach-*, --tag-*, --hl-*, scrims, z-scale); style/palette/
  setStyle/setPalette still on useTheme() so flag-OFF v1 + command-palette compile. (2) ALLOWLIST LOCKSTEP —
  the value matrix is IDENTICAL across lib/theme.tsx guards, lib/theme-init.tsx boot arrays, the
  teacher_preferences SQL CHECK, app/layout.tsx SSR attrs, scripts/probe-theme-wave.mjs; list any mismatch.
  (3) MIGRATION safety — the localStorage + teacher_preferences migration maps paper/cloud→clear and seeds
  frame from style WITHOUT stranding rows; legacy columns stay nullable; the CHECK matches the matrix; it is
  reversible/forward-safe; RLS unchanged. (4) SSR no-FOUC — theme-init stays a frozen sync script, SSR
  initializers return defaults (server HTML == first client paint), data-tone is DERIVED, tainted-canvas
  (CORS R2) falls back to persisted/default tone (never force-dark→AA fail). (5) Subject map — v2 map applied
  on the v2 read path only (pure resolveSubjectColor, no context read); dual-emit bridge keeps flag-OFF
  .cp-subj intact; NO lesson-row migration; seed/aliases slug-compatible. (6) Tone derivation — Normal SAMPLES
  luminance (not forced dark). (7) Night decomposed onto data-tone (subject/tag/hl recipes re-keyed). (8)
  Confirm tsc --noEmit + lint + build pass. Report only problems. If nothing is Medium+, output exactly:
  NO BLOCKING ISSUES."  → capture to CODEX-WAVE2-REVIEW.md

REVIEW 2 — independent Claude (the §4a substitute, required on cloud where Codex may not converge): a fresh
  agent that did NOT author the engine runs the same 8-point checklist vs the diff + handoff + matrix +
  canonical plan, in the §4a persona → writes CLAUDE-WAVE2-REVIEW.md (file/line, severity, scenario, fix).
```

## PART B — §4b Live QA Audit Gate (REAL browser; phone 375–414 · tablet 768–834 · desktop 1280–1440)

```text
Wave 2 has NO new v2 SCREEN yet (it's the engine), so the live-QA = a regression proof + an engine smoke,
each run at ALL THREE device widths. Use the playwright/chrome-devtools MCP (or a local
chromium.launch script). Sign in via the claude-login bypass. Dev server on a port ≥3010; never run
`npm run build` while `next dev` is up.

B1 — FLAG-OFF regression (NEXT_PUBLIC_V2 unset) — the "v1 stays green" proof:
  For /weekly, /daily, /year, /settings/appearance — at phone (≈390px), tablet (≈768px), desktop (≈1280px):
  • screenshot each; confirm it renders UNCHANGED vs current prod v1 (no layout shift, no broken chrome).
  • switch all 6 v1 themes (paper/cloud/night/mint/sky/blossom) via Settings → Appearance; confirm chrome
    re-hues, no dark-on-dark / light-on-light, WCAG-AA text contrast (esp. Night), and SUBJECT COLORS are
    UNCHANGED (the no-recolor proof — the v2 remap must not touch flag-OFF v1).
  • browser console: zero new errors/warnings during theme switches + navigation.

B2 — FLAG-ON engine smoke (NEXT_PUBLIC_V2=1) — the v2 axes paint without breaking:
  • root <html> carries the v2 attrs (data-frame/glass/bg/theme/dim/derived data-tone); hard-reload in Clear
    and in Night shows NO FOUC (no flash of wrong theme/tone before hydration).
  • drive AppearanceControls: Frame (glass/paper/color), Glass register, Background (photo/wash), Theme (all 7
    incl. Clear + off/Photo), Dim (dim/normal/bright) — confirm the stage/wash/frame material repaints and
    tone derives (a bright photo → light tone/dark text; dark photo → dark tone/white text; Normal = auto).
  • run the 7-theme × 3-frame × photo/wash × tone matrix on whatever surface renders; screenshot the corners
    of the matrix (Clear/glass/photo-bright, Night/paper/wash, a color/honey case) at all three widths.

B3 — Responsive contract at all three widths (both flag states): NO document-level horizontal scroll, every
  control reachable, touch targets ≥44px on phone/tablet, no visible scrollbars, sticky chrome ≤~30% of
  phone height.

Write findings to QA-REPORT.md: severity (critical/major/minor), description, repro, the device width +
theme/frame/flag state, screenshot filename, suspected file/line, suggested fix. Report-only (don't fix).
Use video capture (Method A) if you see flicker/FOUC you can't pin from stills.
```

## DELIVERABLE
Bring back **CODEX-WAVE2-REVIEW.md + CLAUDE-WAVE2-REVIEW.md + QA-REPORT.md**, each with a
**GO / GO-WITH-CHANGES / NO-GO** verdict + findings table + must-fix-before-Wave-3 list. Paste them into the
cloud session; it validates each finding against code and folds the legitimate ones in before Wave 3.
