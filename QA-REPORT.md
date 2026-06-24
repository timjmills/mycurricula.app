# QA-REPORT — v2 "background-stage engine" re-audit (§4b live)

**Date:** 2026-06-24
**Build under test:** engine fix commit `580711b`, dev server `http://localhost:3014`,
engine worktree `C:\Users\losey\Projects\mc-wave2-audit`.
**Tooling:** chrome-devtools MCP (playwright MCP was held by another session —
`Browser is already in use … use --isolated`). Real clicks + real eyes on
screenshots; computed-style + canvas-readback contrast sampling; the
`scripts/probe-theme-wave.mjs` render-paint gate.
**Auth:** claude-login bypass cookie set via the token URL; every judged route
verified `onLogin:false` before assessment.

Screenshots: `docs/screenshots/wave2-reaudit/`.

---

## TOP-LINE VERDICT: **GO-WITH-CHANGES**

The body-transparent engine fix does exactly what it set out to do, and the part
it set out to fix is **fully confirmed green**: the classroom photo paints behind
the glass, the per-theme `.theme-tint` mounts and re-hues, the body no longer
occludes the fixed stage, the print path suppresses both layers, and the z-90
tint blocks no interaction and mutes no brand/caution color. The render-paint
probe gate passes every A/B/C/E assertion at 390/768/1280 for both photo and
wash, with **0 contrast failures** on the Night audit and the light-theme chrome
audit.

Two changes are recommended before "done", neither a blocker to the engine fix
itself:

1. **MAJOR — the whole-app theme wash scrolls away below the fold.** `.theme-tint`
   is `position:absolute` against the scrolling `<body>`, so it covers only the
   first viewport. The handoff INTENT is a whole-app wash. Fix: `position:fixed`
   (or mount inside the fixed `.stage` host). Definitive handoff citation below.
2. **MAJOR — the "White frosted" (glass=light) selection is not honored at the
   default brightness, and the opposite extreme washes out content.** The
   explicit `glass=light` register only appears when the derived `data-tone` is
   `light`; at `dim=normal` over a dark-sampling photo, `tone` derives `dark` and
   the user gets the dark register despite picking White frosted. At the other
   end (`glass=light` + `dim=bright`) the bright photo bleeds through the
   translucent cards on content routes and washes text out. This is the
   glass-axis / auto-tone interaction the transparent body newly EXPOSED.

Everything the team-lead flagged as the engine's job is CONFIRMED. The two
changes are in the adjacent light-glass/brightness logic and the tint's
containing block.

---

## ⭐ R1 — AUTHENTICATED-ROUTE VISUAL CONFIRMATION: **CONFIRMED**

- **Photo paints behind the glass — CONFIRMED.** Clearest proof:
  `year-photo-off-1280.png` (theme=off, ungraded photo) shows a real classroom
  photo with visible people/figures behind the translucent header and stat
  cards — not a flat fill. Asset `/stage/p1.webp` returns `200 image/webp`,
  natural size 1448×1086, luminance range 1–235 (mean 90) = a genuine graded
  photo. `--stage-photo` resolves to `url(/stage/p1.webp)` and the `.stage`
  `::before` background-image layers four duotone radial gradients (soft-light)
  over `url("http://localhost:3014/stage/p1.webp")`. `data-bg="photo"`. Stage is
  `position:fixed; z-index:-2; opacity:1; display:block`. Verified at
  390/768/1280 on /weekly and on /daily, /year, /settings/appearance, and the
  Team-mode /weekly.
  - `weekly-photo-clear-1280.png`, `weekly-photo-clear-390.png`,
    `weekly-photo-clear-768.png`, `daily-photo-night-1280.png`,
    `year-photo-off-1280.png`, `appearance-clear-1280.png`.
- **Switching theme changes the whole-app wash — CONFIRMED (per-theme tint
  re-hues), with a visibility caveat.** The `.theme-tint` gradient changes per
  theme (honey = warm gold `rgb(244,183,64)…` @ opacity .26; sky = blue
  `rgb(91,168,255)…` @ .24; night = ink-violet @ .18/.3; clear/off = opacity 0).
  Captured: `weekly-photo-honey-1280.png`, `weekly-photo-night-1280.png`,
  `weekly-photo-off-1280.png`, `weekly-wash-night-1280.png`,
  `year-photo-honey-1280.png` vs `year-photo-off-1280.png`.
  - **Caveat (minor):** at the default `glass=dark` register the wash is genuinely
    subtle over dense content — clear/honey/night/off look near-identical on the
    /weekly grid because dark-glass cards cover ~85% of the viewport and the tint
    is a 0.18–0.26 soft-light overlay. The wash reads best on `bg=wash`
    (`weekly-wash-night-1280.png`) and on sparser routes. This matches the handoff
    photo opacities exactly (see R2), so it is fidelity-correct, not a regression.
- **data-tone legibility on real content — CONFIRMED on the default + Night
  registers.** Night audit: `--ink on --surface` 14.52, `--body on --surface`
  8.0, `--muted` 5.02 — all ≥ AA. On /daily and /weekly (dark glass) white text
  reads on translucent-dark cards; no dark-on-dark found at defaults. (Light-glass
  exception is the MAJOR finding B2 below.)
- **z-90 .theme-tint does not block interaction or mute brand color —
  CONFIRMED.** Toggled Personal→Team on /weekly: the click registered through the
  tint (mode flipped to Team, `aria-checked=true`), the caution banner appeared
  ("Heads up — changes here affect the whole team"), and **the pink Team caution
  glow #E8179B reads vividly through the tint** — banner, toggle glow, and the
  pink-bordered popover all un-muted (`weekly-team-glow-1280.png`). Opened a
  lesson "More actions" menu (14 items rendered) and scrolled the document
  (scrollY 0→400) — neither blocked. Subject-color stripes intact at all widths.

---

## ⭐ R2 — HANDOFF FIDELITY + the absolute-vs-fixed question: **CONFIRMED**, verdict = **change to `fixed`**

**Photo grade / tint opacities match the handoff.** Live `.theme-tint` photo
opacities (honey .26, sky .24, night .18, clear/off 0) match
`design-system/themes.css` lines 92–96 byte-for-byte:
```
.home[data-bg="photo"][data-theme="honey"]   .theme-tint{opacity:.26}
.home[data-bg="photo"][data-theme="blossom"] .theme-tint{opacity:.24}
.home[data-bg="photo"][data-theme="mint"]    .theme-tint{opacity:.22}
.home[data-bg="photo"][data-theme="sky"]     .theme-tint{opacity:.24}
.home[data-bg="photo"][data-theme="night"]   .theme-tint{opacity:.18}
```
The duotone over the photo uses `mix-blend-mode:color; opacity:.2` (handoff
lines 138-141: `.frame::before{… mix-blend-mode:color;opacity:.2 …}`), and the
tint is `mix-blend-mode:soft-light` (handoff line 83). Live matches.

**The absolute-vs-fixed question — DEFINITIVE ANSWER WITH CITATION.**

- **Handoff literal:** `design-system/themes.css` line 83:
  ```css
  .theme-tint{position:absolute;inset:0;z-index:90;pointer-events:none;mix-blend-mode:soft-light;opacity:0;transition:opacity .5s ease}
  ```
  So the handoff CSS says `absolute` — and our implementation matches it literally.
- **BUT the containing block differs.** In the mockup
  (`mockup/New v2 Site Design.bundled.html` lines 174-178), the stage host is:
  ```css
  /* ============ STAGE ============ */
  .home{ position:fixed; inset:0; background:var(--canvas); overflow:hidden; }
  ```
  `.theme-tint` (and `.mesh`/`.scrim`/`.veil`) are `position:absolute;inset:0`
  **inside the `position:fixed; overflow:hidden` `.home` stage** — a single,
  non-scrolling, full-viewport host. So in the handoff the tint is effectively
  **viewport-pinned**: it never scrolls because its absolutely-positioned parent
  is fixed and clips overflow.
- **Handoff stated intent** (`design-system/themes.css` lines 3-5):
  > "A theme washes over **the whole app**: the ambient background palette, a
  > gentle soft-light tint over everything (incl. buttons)… Tone is global … so
  > every page matches the home screen."
- **Our implementation:** live DOM shows `.theme-tint` is `position:absolute`
  with `offsetParent = BODY` — a **sibling of the fixed `.stage`, parented to the
  scrolling `<body>`**, NOT inside the fixed stage. Measured live: at scrollY=400
  on a 2595px-tall /weekly, the tint's `top` = −400 and `bottom` = 428, height =
  828 (one viewport). **Below y≈428 the wash is gone** — ~68% of the scrollable
  page has no wash. The fixed `.stage` (photo) stays pinned, but the `.theme-tint`
  (color wash) scrolls off — an asymmetry where the photo persists but the
  color wash falls away below the fold.

**VERDICT: change `.theme-tint` to `position:fixed`** (or re-parent it inside the
fixed `.stage` host as the mockup parents it inside fixed `.home`). The handoff's
literal `absolute` is only correct because its parent is `fixed`; replicating
`absolute` against a scrolling `<body>` violates the handoff's explicit
"washes over the whole app" intent. Evidence: scroll-off measured live;
`weekly-wash-night-1280.png` shows the wash present above the fold.

---

## R3 — REGRESSION SWEEP of the body-transparent change: **PASS**

| Check | Result | Evidence |
| --- | --- | --- |
| /welcome paints own opaque hero, photo NOT showing | PASS | `welcome-1280.png` — dark gradient hero over the stage; hero bg `rgb(20,19,29)`; photo does not bleed. |
| print: `.stage` + `.theme-tint` suppressed | PASS | `@media print { .stage, .theme-tint { display:none !important } }` found in stylesheet. |
| print: body white, no photo/tint bleed | PASS | `@media print { body { background:white; color:rgb(28,27,46) } }` found; `weekly-print-route-1280.png` renders white grid, no photo/tint. |
| Teach view renders own background, body transparent | PASS | `teach-1280.png` — full Teach board shell renders (widget rail, board library, present canvas); body bg `rgba(0,0,0,0)`; stage present but Teach surfaces paint over it. (Note: the `[data-teach-view]` attribute the brief named is not present in this build's DOM, but the practical contract — Teach paints its own surfaces, not broken by transparent body — holds.) |
| No white FOUC on hard reload (Clear + Night) | PASS | `<html>` background resolves to `--canvas` = `#14131d` (dark) for clear/night/honey alike, so first paint is the dark canvas before `.stage` mounts. `weekly-reload-fouc-night-1280.png` post-hard-reload shows no white flash. |

No console errors on /daily or /weekly during interaction. Only a benign build
warning (`linkedom` optional `canvas` dep "Module not found") — not runtime.

---

## R4 — PROBE: render-paint gate **PASS**; probe exits **1** on an orthogonal theme-sync artifact

Ran `node scripts/probe-theme-wave.mjs` from `mc-wave2-audit` with
`CLAUDE_BYPASS_TOKEN` + `PROBE_BASE=http://localhost:3014`. The probe
self-authenticates (own Chrome) and DID reach the authenticated app (not /login —
every weekly/daily route painted the seeded theme at DCL).

**The render-paint gate — the contract under audit — is fully green:**
```
contrast failures: 0
tone-derivation checks failed: 0
corner checks failed: 0
render-paint gate checks failed: 0
```
All A:theme-tint-mounted / B:stage-not-occluded / C:photo-paints / C:wash-renders
pass at **390/768/1280** for both photo and wash; E:auto-tone-sampled passes.
Night AA audit: 43/43 pairs pass (`--ink` 14.52, subjects 5.8–7.4, tags 6.3–7.5,
chrome-accent 5.3–7.5). Light-theme chrome audit: 15/15 pass. data-tone matrix:
5/5 pass. frame×glass×bg corners: 6/6 pass.

**Probe exit code = 1, from 4 NON-engine route checks** — all the same pattern:
```
blossom  appearance  dcl=blossom  after=night  FAIL
mint     appearance  dcl=mint     after=night  FAIL
sky      appearance  dcl=sky      after=night  FAIL
off      appearance  dcl=off      after=night  FAIL
```
These are **theme-SYNC**, not theme-paint. On `/settings/appearance` the theme
paints the seeded value at DCL, then the post-mount `loadRemotePrefs()` (cross-
device sync, `NEXT_PUBLIC_THEME_SYNC=1`) pulls the signed-in account's saved
remote `teacher_preferences.theme` (= "night", Tim's account) and overrides the
probe's localStorage-only seed. weekly/daily for the same themes pass (timing —
the seed wins transiently before the sync effect runs on those routes). I
reproduced this live (see B3). It is pre-existing sync behavior unrelated to the
body-transparent engine fix, and an artifact of the probe seeding only
localStorage while the live account has a remote pref. **Not a paint regression.**

---

## FINDINGS

### Bugs

| # | Severity | Description | Repro | Width + axis state | Screenshot | Suspected file:line | Suggested fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B1 | **MAJOR** | Whole-app theme wash scrolls away below the fold. `.theme-tint` is `position:absolute` parented to scrolling `<body>` (offsetParent=BODY), so it covers only the first viewport while the fixed `.stage` photo stays pinned — the color wash falls off below ~1 viewport on every long route. Contradicts the handoff's "washes over the whole app" intent. | Open /weekly (doc 2595px tall), scroll 400px; tint top=−400, bottom=428 — no wash below y≈428. | 1280 · frame=glass·glass=dark·bg=photo·theme=night·dim=normal·tone=dark | `weekly-wash-night-1280.png` (wash present above fold) | the `.theme-tint` mount (sibling of `.stage`, per the fix note) + its CSS `position:absolute` | Change `.theme-tint` to `position:fixed` (matches the mockup, whose `absolute` tint lives inside a `position:fixed` `.home` host: `mockup/New v2 Site Design.bundled.html:174-178`; `design-system/themes.css:83`). |
| B2 | **MAJOR** | "White frosted" (glass=light) not honored at default brightness; opposite extreme washes out. With glass=light + dim=normal + clear, `data-tone` derives `dark` (photo sampled dark) so `--ink`=rgb(240,239,248) on `--surface`=rgb(30,29,44) — the DARK register, though the user picked "White frosted · translucent white panels with **dark text**". Conversely glass=light + dim=bright forces tone=light, but on content routes the bright photo bleeds through the translucent cards and washes text out. Surfaced by the now-visible photo. | (a) Settings→Appearance: Frosted glass=White, Photo brightness=Normal, Theme=Clear → modal stays dark-register. (b) Set White + Light/Bright → /weekly washes out. | (a) 1280 · glass=light·bg=photo·dim=normal·theme=clear·tone=dark. (b) 1280 · glass=light·bg=photo·dim=bright·theme=clear·tone=light | (a) `appearance-lightglass-clear-normal-1280.png`; (b) `weekly-lightglass-clear-bright-1280.png` (washed out), `appearance-lightglass-clear-bright-1280.png` (white register on the modal) | the auto-tone derivation vs the `glass` axis (lib/theme tone derivation / WAVE-2-VALUE-MATRIX §4) | Make `glass=light` force `tone=light` (white-frosted should imply the light register regardless of sampled photo luminance), and/or raise the white-frosted card surface opacity so a bright photo can't bleed through. Token contrast itself is AA-fine in both states — the bug is register selection + photo bleed, not token pairs. |
| B3 | minor | Cross-device theme-sync can override a just-made/seeded theme on `/settings/appearance` (and on probe seeds). A picker theme change immediately followed by navigation sometimes reverts to the remote-saved theme before the debounced write commits; the probe's localStorage seed is overridden by the remote pref on the appearance route. | Pick a theme, navigate away fast; or run the probe against an account with a saved remote pref. | 1280 · any · `NEXT_PUBLIC_THEME_SYNC=1` | (probe output: 4 appearance FAILs) | `lib/theme-sync.ts` `loadRemotePrefs` vs local seed/recent-change ordering | Have the post-mount remote load defer to a more-recent local change (timestamp/seq guard) so an in-flight user change isn't clobbered. Pre-existing, orthogonal to the engine fix. |

### Improvement ideas

- **I1.** At the default `glass=dark` register the per-theme wash is barely
  perceptible over dense content (clear/honey/night/off look near-identical on
  /weekly). Consider a slightly higher photo-tint opacity, or surfacing the wash
  in chrome (rail/tabs) so the chosen theme reads at a glance even when cards
  cover the background. (Fidelity-correct to the handoff today — treat as a
  product call, not a bug.)
- **I2.** The `linkedom` "Can't resolve 'canvas'" build warning is noise; add
  `canvas` to webpack externals or the optional-dep ignore list to keep the
  console clean.

---

## CONFIRMED / NOT-CONFIRMED summary

- **⭐R1 — CONFIRMED.** Photo paints behind the glass (`year-photo-off-1280.png`
  is the unmistakable proof; `--stage-photo` + `.stage::before` resolve the real
  webp; asset 200). Per-theme tint re-hues (honey gold / sky blue / night violet
  / clear+off zero). Default + Night legibility holds (Night AA 43/43). z-90 tint
  blocks no click/scroll/menu and does NOT mute the pink Team glow #E8179B
  (`weekly-team-glow-1280.png`). Caveats: wash subtle at glass=dark over dense
  content (minor/fidelity-correct), and the glass=light register issue is B2.
- **⭐R2 — CONFIRMED.** Opacities + blend modes match the handoff
  (`design-system/themes.css:83,92-96,138-141`). **Absolute-vs-fixed verdict:
  change to `fixed`.** Handoff literal is `absolute` (`themes.css:83`) but only
  because its parent `.home` is `position:fixed; overflow:hidden`
  (`mockup/New v2 Site Design.bundled.html:174-178`); the handoff intent is a
  whole-app wash (`themes.css:3-5`). Our tint is parented to the scrolling
  `<body>` and scrolls off below the fold (measured: tint top=−400 at scrollY=400
  on a 2595px page). Fix = `position:fixed` or re-parent into the fixed `.stage`.
- **R4 probe — render-paint gate PASS (0 paint/contrast/tone/corner failures);
  process exit 1** from 4 orthogonal theme-sync route checks on
  /settings/appearance (remote pref overriding the localStorage seed), not a paint
  regression.
