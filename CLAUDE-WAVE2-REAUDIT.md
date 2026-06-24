# CLAUDE-WAVE2-REAUDIT.md — independent §4a re-audit

> Reviewer: independent Claude (§4a "strict, skeptical Senior Security & QA
> Engineer"). I did **not** author the engine or the fix commit. Codex was
> unavailable for this pass (terminal-team run), so this is the independent-agent
> substitute per CLAUDE.md §4a. Scope: the fix commit `580711b` (FIX-ONLY, 3
> files) plus the full engine diff `claude/v2-wave1-docs..claude/v2-wave2-engine`
> (standing 8-point checklist). Verified against the design handoff
> (`origin/claude/design-handoff-v2-site`), the frozen value matrix, and the live
> CSS — not the diff's self-description.

---

## TOP-LINE VERDICT: **GO-WITH-CHANGES**

The two NO-GO blockers from the prior audit are genuinely fixed at the
code/contract level: the body no longer paints an opaque mesh that occludes the
`.stage` (W2 blocker 1), and `.theme-tint` is now mounted in the DOM and its CSS
selector was adapted to `:root[data-theme] .theme-tint` so it actually matches
(W2 blocker 2). Lockstep is intact. The fix is surgically scoped (3 files, no
frozen arrays touched). Print suppression is correctly nested. The probe gate is
materially better and its `/login` guard is sound.

**Why GO-WITH-CHANGES and not GO:** the fix ships one acknowledged-but-unresolved
design defect (`.theme-tint` is `position:absolute` on a non-positioned body
child → the whole-app wash covers only the first viewport and scrolls away), and
introduces two real regression risks that the code review alone cannot clear and
that the §4b live pass MUST confirm: (a) the soft-light `.theme-tint` at z-90
blends over **all** primary interactive chrome (topbar, rails, banner, the
`#E8179B` Team glow, buttons, focus rings) — this is by-design per the handoff
but is exactly the kind of thing that silently discolors a CTA; and (b) the
now-transparent body means any route whose root container is not a full-viewport
opaque cover will leak the stage photo through its gutters. None of these are
Critical; they are Medium and must be eyes-on-confirmed before Wave 3.

No Critical or High findings. Findings below are Medium and Low.

---

## Findings table

| # | file:line | sev | concrete failure scenario | suggested fix |
|---|---|---|---|---|
| M1 | `app/themes.css:505-507` (`.theme-tint{position:absolute;inset:0}`) + `app/layout.tsx:152` (mounted as a non-positioned `<body>` child) | **Medium** | `.theme-tint` is `position:absolute` with no positioned ancestor (body has `cp-root`+flex but no `position:relative`), so its containing block is the initial containing block: it sizes to the first viewport and **scrolls up and away with the document**. On any page taller than the viewport (`/year`, a long lesson, `/daily`), the per-theme wash vanishes below the fold — the whole-app wash is actually a first-screen-only wash. The fix commit itself flags this as a deferred question. | Decide via the handoff (see R2). If the intent is a pinned whole-app wash, change to `position:fixed` (matches `.stage`, which is correctly `fixed`). If absolute is intentional (handoff scopes it to a positioned `.home` panel), then mounting it as a bare body child is the wrong host — it must live inside the positioned full-height surface, not at body root. Right now it is neither: absolute against the ICB. |
| M2 | `app/themes.css:506-512` (`.theme-tint{z-index:90;mix-blend-mode:soft-light}`) over all chrome z<90 | **Medium** | A z-90 `soft-light` layer paints over every app surface whose stacking sits below 90 — the topbar, both icon rails, the Personal/Team banner, primary buttons, active-tab indicator, focus rings, subject-color stripes, and the `#E8179B` Team caution glow. `soft-light` shifts hue/luminance of everything beneath it. The prior audit proved this was *dead* (never mounted); mounting it now makes the blend **live for the first time** over real interactive chrome. The risk is a muted/discolored CTA or a Team glow that no longer reads as the alert color. | This is by-design per the handoff's surface-theming contract (overlays at z>90 opt out), so it is not a code bug — but it has **never been seen live**. Mandatory §4b confirmation: toggle Personal↔Team and verify the `#E8179B` glow still reads; check primary buttons, active tab, and focus rings across Honey/Night/Mint (highest-opacity tints). If any is muted, lift the offending chrome above z-90 or exclude it from the tint. |
| M3 | `app/globals.css:44-49` (`body{background:transparent}`) — app-wide | **Medium** | Body is now transparent everywhere, not just on app routes. Any route whose root element is not a full-viewport opaque cover will show the fixed `.stage` photo through its gutters/short-content area. `/welcome` `.page` sets `background:var(--canvas)` but has no `min-height:100vh` (only `overflow:hidden`); if its content is shorter than the viewport, the stage photo bleeds below it. Same risk for any error/empty state with short content. | §4b: load `/welcome`, any error page, and short-content states; confirm no stage bleed. If bleed exists, give the relevant root containers `min-height:100dvh` + opaque background, or gate the `.stage`/`.theme-tint` mount to authenticated app routes only (they are currently mounted unconditionally in the root layout, so they paint behind `/welcome`, `/login`, every route). |
| L1 | `scripts/probe-theme-wave.mjs:579` (`PHOTO_FILENAME = "p1.webp"`) | **Low** | The photo-paint assertion hard-codes the basename `p1.webp` and asserts `::before` background-image `.includes("p1.webp")`. It is decoupled from `DEFAULT_STAGE_PHOTO` (`lib/stage-photo.ts` → `STAGE_PHOTOS[0]`). If the default photo is ever reordered/renamed, the probe **silently false-fails** (red) even though the engine is correct — or worse, if combined with a different default, false-passes. | Import/derive the basename from `DEFAULT_STAGE_PHOTO` instead of hard-coding, or assert against the value of `--stage-photo` it already harvested (`facts.stagePhoto`) rather than a literal. |
| L2 | `scripts/probe-theme-wave.mjs:638-659` (route resolver runs once at w=1280) | **Low** | The `/weekly`→`/login` redirect guard resolves the route **once** at 1280px, then reuses `paintRoute` for all widths. If `/weekly` is auth-gated only at some widths (it isn't today, but the resolver's single-shot design assumes route availability is width-independent), or if the first resolve transiently times out (caught → falls back to `/`), every subsequent width silently tests `/` instead of `/weekly` while the log still prints the resolved route. The fallback-to-`/` on a *transient* timeout is indistinguishable from a real 404. | Acceptable as-is (route availability is width-independent here). Optionally: distinguish a transient nav error from a real 404/redirect (retry once before falling back), and log which condition triggered the fallback so a `/`-fallback run isn't mistaken for a `/weekly` pass. |
| L3 | `scripts/probe-theme-wave.mjs:613-628` (`bodyBgIsOpaque`) | **Low** | The opacity heuristic parses `rgb()/rgba()` and treats any other non-empty keyword/function as opaque. A body painted with `color-mix(...)`, `oklch(... / 0)`, a `linear-gradient`, or `var(--x)` that resolves to a 0-alpha color would be reported **opaque** (false-positive failure) — but note `getComputedStyle` resolves to `rgb/rgba` in Chrome, so the parser is correct **for the channel it actually receives**. The fragility is latent, not active. | Fine for the current Chrome-only probe. If the probe ever runs cross-engine or against a body that uses a background *image* of a transparent gradient, prefer sampling an actual pixel (`getImageData`) over string-parsing the color. |
| L4 | `app/layout.tsx:144-152` + commit msg + `app/globals.css:106` (comments say `:root[data-theme] .theme-tint`) | **Low** | The layout comment and commit message assert the selector is `:root[data-theme="…"] .theme-tint`. The *actual* CSS (`app/themes.css:514-590`) uses a **dual** selector `:root[data-theme="…"] .theme-tint, .home[data-theme="…"] .theme-tint` (the `.home` arm is the handoff's original scope). The comment is incomplete, not wrong — the `:root` arm is what makes the body-level mount match — but it hides that the handoff authored this as `.home`-scoped, which is the root cause of M1. | Update the comment to note both arms and that the `.home` arm is the handoff's original (positioned-panel) scope — this is the breadcrumb a future reader needs to understand M1. |

---

## The six fix-only points (i–vi) — explicit notes

**(i) Does `body{background:transparent}` break a token/contrast assumption?**
Code review: **no token/contrast assumption broken.** `--ink` stays on body;
`<html>` retains `background:var(--canvas)` as the anti-FOUC base; no module
sets a competing body background (grepped `app/**`, `components/**` — none). The
real exposure is **stage bleed on non-app routes** (M3), not a contrast break.
Print is handled: the `@media print` block forces `body{background:white}` +
suppresses `.stage`/`.theme-tint`. **Note:** the reduced-motion body rule
(`background-attachment:scroll`) was removed — correct, because the body no
longer carries the mesh; the `.stage` now owns drift and is independently
reduced-motion-guarded (`themes.css:1669`). No regression.

**(ii) Is mounting `.theme-tint` as a static (non-positioned) body child correct
for the selector AND the z-90 intent?**
- **Selector match: YES.** The app's `app/themes.css` `.theme-tint` rules were
  adapted to `:root[data-theme="…"] .theme-tint` (dual with `.home`), and the div
  is a descendant of the `<html>` that carries `data-theme` — so the selector
  matches. (The handoff's raw `themes.css` is `.home`-only scoped; had the app
  not added the `:root` arm, the body-level mount would have matched **nothing**
  and the fix would be inert. It does add it — confirmed `themes.css:514` etc.)
- **z-90 stacking: PARTIALLY correct, see M1+M2.** The div is `position:absolute`
  → it *is* a positioned element so its `z-index:90` is honored, and it is removed
  from the body's flex flow so it doesn't disturb layout. BUT (M1) with no
  positioned ancestor it covers only the first viewport and scrolls away
  (**absolute-vs-fixed defect**), and (M2) the soft-light blend now goes live over
  all chrome below z-90. The "static child" framing in the prompt is slightly off
  — it is absolute, not static — but the conclusion stands: the host is wrong for
  a whole-app wash.

**(iii) Is the print suppression correctly NESTED inside `@media print`?**
**YES.** `app/globals.css:104-113`: `.stage, .theme-tint { display:none
!important }` sits inside the `@media print { … }` block (opened at line 91,
closed at line 119). Not global. Belt-and-suspenders only, since all of
`themes.css` (where `.theme-tint`/`.stage` get their screen styles) is already
inside `@media screen` — so on paper both are unstyled default divs anyway. No
defect.

**(iv) Are the new probe assertions false-positive/negative-proof?**
- **`/login` redirect guard: SOUND.** It detects the redirect by the **final
  landing URL** (`/\/login(\?|$)/.test(page.url())`), not the status code, so the
  silent `307→/login→200` follow that fooled the cloud pass is caught and falls
  back to `/`. Good — it cannot pass while believing it tested `/weekly` when it
  actually landed on `/login`. (Caveat L2: a transient timeout also falls back to
  `/` and is logged identically to a real 404.)
- **`getComputedStyle(body).backgroundImage === 'none'`: CORRECT for the fix.**
  With `body{background:transparent}`, Chrome serializes background-image to
  `"none"` and background-color to `rgba(0,0,0,0)`; both assertions pass. The
  `bodyBgIsOpaque` helper correctly treats `rgba(...,0)` as not-opaque (L3 is a
  latent cross-engine fragility, inert today).
- **Photo filename assertion: brittle (L1)** — hard-coded `p1.webp` decoupled
  from `DEFAULT_STAGE_PHOTO`; correct today (`STAGE_PHOTOS[0]==="/stage/p1.webp"`)
  but a silent false-fail if the default photo changes.
- **Reduced-motion false-fail: NONE.** The reduced-motion `.stage::before` rule
  only sets `animation:none` — it does not drop `background-image`, so the url
  assertion holds under a reduced-motion CI runner.

**(v) SSR/hydration — server-rendered `.theme-tint` matches first client paint?**
**YES — no hydration mismatch.** The div is a static, prop-less,
server-rendered `<div className="theme-tint" aria-hidden="true" />` with no
client-state-dependent attributes; React renders identical markup on server and
client. Ordering is correct: `.stage` then `.theme-tint` then `<ThemeInit/>`
(the inline no-FOUC boot script) then the provider tree. The boot script mutates
`<html>` data-attrs (not the tint div), so the tint's *appearance* updates via
CSS selector match the instant the boot script sets `data-theme` — no React
re-render, no mismatch. SSR paints `data-theme="clear"` → `.theme-tint{opacity:0}`
(invisible), which is the safe first frame; a Night/Honey teacher's wash arrives
pre-hydration via the boot script. No FOUC introduced by the tint div itself.

**(vi) Lockstep UNTOUCHED by the fix?**
**CONFIRMED.** `git show 580711b --name-only` = exactly `app/globals.css`,
`app/layout.tsx`, `scripts/probe-theme-wave.mjs`. None of the five frozen-array
surfaces (`lib/theme.tsx` guards, `lib/theme-init.tsx` boot arrays,
`supabase/migrations/20260624120000_v2_theme_axes.sql` CHECKs) are touched.

**Full-engine lockstep (the 5 surfaces agree):** verified the value sets are
identical across surfaces:
- themes: `[clear, night, honey, blossom, mint, sky, off]` — `lib/theme.tsx`
  (`APP_THEMES`) == `lib/theme-init.tsx:57` == migration CHECK line 138 (v2 set)
  == `app/layout.tsx:113` SSR `data-theme="clear"`. Migration additionally
  accepts the v1 set `paper,cloud` + sentinel `system` **on read only**, per the
  matrix's transition design — correct, not drift.
- frame `[glass,paper,color]`, glass `[dark,light]`, bg `[photo,wash]`,
  dim `[dim,normal,bright]` — identical across `lib/theme.tsx` (FRAME/BG/DIM_VALUES),
  `lib/theme-init.tsx:65/81/86`, and migration CHECKs (lines 102/108/114/120).
No lockstep drift found.

---

## Standing 8-point §4a checklist (full engine diff) — results

1. **Logic errors:** none Critical/High. The `data-tone` derivation (matrix §4,
   first-match-wins) is mirrored consistently in `theme.tsx` `deriveTone` and the
   boot script. M1 (absolute wash) is a logic/placement defect → Medium.
2. **Security flaws:** none. No new auth/RLS/data surface; the migration keeps
   legacy columns nullable, CHECKs widen (don't strand rows), RLS unchanged. The
   `--stage-photo` is a same-origin webp inlined via `url(...)` — no injection
   surface (path is a const, not user input).
3. **Race conditions:** the AUTO luminance sample (photo+normal) defaults to
   `dark` until the post-mount sample resolves (safe white-text-on-scrim
   fallback) — no AA-failing flash. Tainted-canvas/CORS path falls back to
   persisted/default tone. No new race introduced by the fix.
4. **Unhandled edge cases:** M3 (transparent body bleed on short/non-app routes)
   is the main one — Medium, needs §4b. Tainted-canvas handled.
5. **Broken error handling:** probe try/catch is sound; the route-resolver
   `catch → fallback` conflates transient errors with real 404s (L2).
6. **Missing/wrong tests:** the render-paint gate is a real improvement and
   exits non-zero on failure (wired into `totalFails`). Gaps: it does not test
   `/welcome` bleed (M3) or the M2 chrome-blend over the Team glow — those are
   §4b-only. L1 brittleness noted.
7. **SSR/hydration:** correct (point v). No mismatch.
8. **Design-token / lockstep rules:** intact (point vi). The fix adds no tokens,
   hard-codes no hex in a component (the `#E8179B`/photo hues live in
   `themes.css` engine vars, pre-existing), and edits no `tailwind.config.ts`.

---

## must-fix-before-Wave-3

1. **Resolve M1 (absolute-vs-fixed) with a handoff citation.** This is the
   prompt's explicit open design question (R2). Determine from the bundled mockup
   / `themes.css` / source whether the whole-app wash is meant to be pinned
   (`fixed`) or first-screen (`absolute`, `.home`-scoped). If pinned → change
   `.theme-tint` to `position:fixed`. If `.home`-scoped → move the mount inside
   the positioned full-height surface, don't leave it absolute-against-the-ICB at
   body root. Shipping it as-is means the wash silently disappears on scroll on
   every long page — a visible regression vs. the handoff intent.
2. **§4b live-confirm M2:** the soft-light z-90 tint over the `#E8179B` Team glow,
   primary buttons, active-tab, and focus rings across the high-opacity themes
   (Honey 0.4 / Sky 0.38 / Mint 0.36 wash). Toggle Personal↔Team and verify the
   caution glow still reads as alert-pink through the tint. If any chrome is
   muted, lift it above z-90 or exclude it.
3. **§4b live-confirm M3:** load `/welcome`, `/login`, and a short-content/error
   state; confirm no `.stage` photo bleed through the body now that it is
   transparent. Consider gating the `.stage`/`.theme-tint` mount to authenticated
   app routes if bleed exists.
4. **(Low, nice-to-have) Fix L1** — derive the probe's photo basename from
   `DEFAULT_STAGE_PHOTO` so the gate can't silently false-fail on a default-photo
   change before Wave 3 builds on this engine.

---

## Sign-off

Codex unavailable (terminal-team run); this independent-agent review is the §4a
substitute per CLAUDE.md §4a, on the record. **Verdict: GO-WITH-CHANGES** — no
Critical/High; three Mediums (M1 absolute-wash defect is the headline and is the
deferred design question; M2/M3 are live-confirmation gates), four Lows. The two
original NO-GO blockers are correctly fixed; lockstep, print nesting, SSR, and
the `/login` probe guard all pass. Clear M1 (decision + handoff citation) and
eyes-on M2/M3 in the §4b pass before Wave 3 lands on top of this engine.
