# Wave 2 RE-AUDIT — orchestrator synthesis

Three independent streams ran against engine fix commit `580711b` on an
**authenticated, real-backend** local server (`:3014`, `PROVISIONING_MODE=individual`)
— the two gaps the cloud pass could not close. Deliverables:
`CODEX-WAVE2-REAUDIT.md`, `CLAUDE-WAVE2-REAUDIT.md`, `QA-REPORT.md`.

| Stream | Verdict |
|---|---|
| §4a Codex (sandbox read-only) | NO-GO (1 High, 4 Medium) |
| §4a independent Claude | GO-WITH-CHANGES (3 Medium, 4 Low) |
| §4b live QA (browser, 390/768/1280, 22 screenshots) | GO-WITH-CHANGES |

## Consolidated verdict: **GO-WITH-CHANGES**
The two original NO-GO blockers are genuinely fixed and **eyes-on confirmed**: the
classroom photo paints behind the glass (`year-photo-off-1280.png` is unmistakable;
`/stage/p1.webp` → 200, luminance 1–235), and the per-theme `.theme-tint` mounts and
re-hues. ⭐R1 and ⭐R2 both **CONFIRMED** by the live pass. No Critical, no legitimate
High. Two MAJORs to clear before Wave 3, both adjacent to (not inside) the blocker fix.

## ⭐ Both ⭐ items confirmed
- **R1 CONFIRMED** — photo paints at all 3 widths on /weekly·/daily·/year·appearance·Teach;
  per-theme wash re-hues (honey gold / sky blue / night violet / clear+off zero); Night AA
  43/43; the z-90 soft-light tint blocks **no** click/scroll/menu and does **not** mute the
  `#E8179B` Team caution glow (`weekly-team-glow-1280.png`). → clears reviewer **M2**.
- **R2 CONFIRMED + verdict = change to `position:fixed`** — definitive handoff citation:
  handoff `themes.css:83` is `position:absolute` **but its parent `.home` is
  `position:fixed; overflow:hidden`** (`mockup/New v2 Site Design.bundled.html:174-178`),
  so the handoff tint is viewport-pinned. Our tint is parented to the **scrolling `<body>`**
  and measurably scrolls off (tint top=−400 at scrollY=400 on a 2595px /weekly). Handoff
  intent is explicit: "washes over the whole app" (`themes.css:3-5`).

## Adjudication of every finding (orchestrator-owned)

### Must-fix before Wave 3
1. **`.theme-tint` → `position:fixed`** (or re-parent into the fixed `.stage`). **MAJOR.**
   Unanimous: Codex #2 = reviewer M1 = live B1, with a live measurement + handoff citation.
   `app/themes.css:506`. This is the standing R2 open question — **now settled.**
2. **glass=light ("White frosted") tone derivation + bright washout.** **MAJOR, new** (live B2).
   **Validated in code:** `deriveTone(resolved, bg, dim, autoTone)` at `lib/theme.tsx:366`
   takes **no `glass` argument** — so White-frosted cannot select the light register; at
   dim=normal over a dark-sampling photo it returns `autoTone ?? "dark"`. User picks
   "translucent white panels with dark text," gets the dark register. Decide: should
   `glass=light` force `tone=light`? (design-intent call; the axes are currently decoupled
   by design — confirm against the value matrix before coding). Plus raise white-frosted card
   opacity so a bright photo can't bleed through (`weekly-lightglass-clear-bright-1280.png`).

### Dismissed / downgraded (with reason)
- **Codex #1 (High — probe `/login` false-green): OVERSTATED → Low.** Two independent reads
  (the §4a reviewer's point iv + my own) found the guard **sound** — it detects the bounce by
  **final URL** (`/\/login(\?|$)/.test(page.url())`), not status, and the live R4 run
  empirically reached the authed app (not /login). Residual kernel = assert it reached an
  authed route / distinguish a transient timeout from a real 404 (reviewer **L2**). Low.

### Probe-robustness (Low — not blocking; the live pass independently proved the engine)
- **Codex #3** (`E:auto-tone-sampled` can't prove sampling ran) and **Codex #4**
  (`C:photo-paints` checks the CSS url, not pixels) — valid probe-rigor critiques. The live
  pass went further than the probe (asset 200 + luminance histogram + visible figures), so the
  **engine is proven**; these only harden the probe. Overlap reviewer **L1/L3**.
- Reviewer **L1** (hard-coded `p1.webp` decoupled from `DEFAULT_STAGE_PHOTO` → silent
  false-fail if the default photo changes) — fix before Wave 3 builds on this.

### Minor / pre-existing (track, not gate)
- **Codex #5 (off-theme still grades the stage photo): confirmed as code fact, minor.** No
  `:root[data-theme="off"]` `--duo-*` override exists — `off` overrides live only under
  `.home[data-theme="off"]`, so the global `.stage::before` inherits duotone grading on app
  routes. "Ungraded photo" is true only on the home surface. Edge theme; needs a one-line
  spec decision (strip duotone for `[data-theme="off"][data-bg="photo"] .stage::before`, or
  reword the spec).
- **Live B3 (theme-sync overrides a just-seeded theme): pre-existing, orthogonal.** This is
  the sole cause of the probe's **exit code 1** — 4 `/settings/appearance` checks where
  `loadRemotePrefs()` pulls Tim's saved remote `theme=night` over the probe's localStorage
  seed. **Not a paint regression**; the render-paint gate itself is 0 failures. `lib/theme-sync.ts`
  load-vs-recent-local-change ordering.
- Reviewer **M3 (transparent body → stage bleed on non-app routes): cleared for /welcome**
  (opaque hero, no bleed — R3 PASS), but `.stage`/`.theme-tint` are mounted unconditionally in
  the root layout, so short-content/error states are an untested residual. Low.

## Probe result (R4)
Render-paint gate **fully green** — 0 paint / 0 contrast / 0 tone-derivation / 0 corner /
0 render-paint failures at 390/768/1280 for photo **and** wash; Night AA 43/43, light-chrome
15/15, tone matrix 5/5, corners 6/6. Process **exit 1** solely from the 4 orthogonal
theme-sync route checks above (B3), not the engine.

## Bottom line for Wave 3
Ship-blocking for the *engine fix*: nothing — both blockers fixed and confirmed. **Before
Wave 3 lands on top:** (1) `.theme-tint` → `fixed`, (2) decide + fix the glass=light/auto-tone
interaction, (3) cheap probe hardening (L1 + Codex#3/#4 + assert authed-route), and a spec
decision on `off`-theme grading. Screenshots: `docs/screenshots/wave2-reaudit/`.
