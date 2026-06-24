# Wave 2 RE-AUDIT prompt — post-fix verification (dual §4a + §4b live-QA)

> **Run in the terminal** (Codex + browser MCP + native git + a real backend/auth live there — the
> cloud session could NOT verify the two items marked ⭐ below, which is the whole reason this round
> goes to the terminal). This is a **re-audit of the audit-fix commit**, not a fresh wave. It
> supplements (does not replace) the reusable `WAVE-2-AUDIT-PROMPT.md`; everything in that doc's
> PART 0 / PART A / PART B still applies — this file sharpens the focus to the fix + the two gaps.

---

## Why this re-audit exists
The first Wave-2 dual audit returned **NO-GO** on two convergent blockers:
1. the photo background never visibly painted (`.stage` was occluded), and
2. the whole-app theme wash was dead CSS (`.theme-tint` never mounted).

The fix commit (below) was implemented + independently verified in the cloud and returned **GO** —
but the cloud verification was **computed-style-only** on `/welcome`/`/login`, because that env has
**no Supabase backend (routes auth-wall)** and **no handoff bundle in the checkout**. So two things
were proven by `getComputedStyle` but **never seen by a human eye on a real app route, and never
compared to the design handoff**. This re-audit closes exactly those gaps and hunts for regressions
the fix could have introduced.

---

## Parameters
- **BRANCH:** `claude/v2-wave2-engine` · remote tip after the fix ≈ `580711b13`
  (local `08bb101` "fix(v2 Wave 2.7): make the background-stage engine visibly paint").
- **FULL ENGINE DIFF (for the standing 8-point §4a checklist):**
  `git diff claude/v2-wave1-docs..claude/v2-wave2-engine`
- **FIX-ONLY DIFF (the new surface this round adds):** the tip commit —
  `git show claude/v2-wave2-engine` (touches **3 files**: `app/globals.css`, `app/layout.tsx`,
  `scripts/probe-theme-wave.mjs`).
- **Handoff (truth):** `git fetch origin claude/design-handoff-v2-site` →
  `Documents/Claude Design/6.24.26 design_handoff_v2_site/` (mockup + design-system CSS + source).
- **Frozen value matrix:** `docs/v2-rebuild/WAVE-2-VALUE-MATRIX.md` on the branch.

---

## What the fix changed (audit against the handoff — do NOT trust this summary)
- `app/globals.css` — `<body>` was painting an **opaque `--canvas` atmospheric mesh** (with
  `background-attachment:fixed`) that occluded the fixed `z-index:-2` `.stage`. Now: **`body`
  background is `transparent`**; `<html>` keeps `background: var(--canvas)` as the anti-FOUC base;
  the reduced-motion `background-attachment` rule was removed; **`@media print { .stage,.theme-tint
  { display:none } }`** added.
- `app/layout.tsx` — mounted **`<div className="theme-tint" aria-hidden="true" />`** as a sibling of
  `.stage` (first children of `<body>`) so the styled-but-never-mounted `.theme-tint`
  (z-90 soft-light per-theme wash) now paints.
- `scripts/probe-theme-wave.mjs` — added a render-paint gate (theme-tint mounted / stage not
  occluded / photo paints / sampling side-effect / real route at 390·768·1280) and a guard so the
  route resolver falls back when auth redirects `307→/login` (not just on 404).

---

## ⭐ RE-AUDIT FOCUS — the must-do list (these are why it's in the terminal)

**⭐ R1 — AUTHENTICATED-ROUTE VISUAL CONFIRMATION (the #1 gap).** Sign in via the claude-login bypass
against a **real backend** (`PROVISIONING_MODE=individual` locally per `docs/5.24.26 claude-access.md`)
and reach the actual app shell — **`/weekly`, `/daily`, `/year`, the Lesson Plan, Teach** — NOT
`/welcome`/`/login`. With `data-bg="photo"`, **look with your eyes** at phone (≈390) / tablet (≈768) /
desktop (≈1280):
  - the classroom photo (`/stage/p1.webp`) is **visibly painted behind the glass** — a real graded
    photo, not a flat dark/cream fill. Screenshot each width.
  - switching `data-theme` (Clear → Honey → Night → Mint/Sky/Blossom → off/Photo) **visibly changes
    the whole-app wash** via `.theme-tint` (Clear = no wash; off/Photo = ungraded photo). Screenshot
    Clear vs Honey vs Night side by side.
  - the `data-tone` **legibility contract holds on real content** — on photo+dark, white text on
    translucent-dark glass; on wash/photo-bright, ink on light. Hunt for any **dark-on-dark or
    white-on-white** that the new transparent body or the z-90 tint introduced. Run a WCAG-AA check
    on Night + on a photo-dark card.
  - **`.theme-tint` over interactive content:** it sits at **z-index:90 (above topbar/rail/banner,
    below drawers/menus)** with `mix-blend-mode:soft-light` + `pointer-events:none`. Confirm it does
    **not** (a) block any click/scroll/drag, (b) mute or discolor primary buttons / active-tab /
    focus rings / the **pink Team caution glow `#E8179B`** / subject-color stripes below it, or (c)
    harm text contrast. Toggle Personal↔Team and confirm the pink glow still reads correctly through
    the tint.

**⭐ R2 — HANDOFF FIDELITY of the stage + theme-tint (the #2 gap).** Open the **canonical runnable
bundled mockup** (`mockup/New v2 Site Design.bundled.html`) + the design HTMLs in the browser next to
the running app. Verify against the handoff (authority chain: mockup > V2 Framework.md > design-system
CSS):
  - the **photo grade / duotone / scrim** on `.stage` matches the mockup's background (blend modes,
    saturation, the per-frame scrim opacities) at each width.
  - the **per-theme `.theme-tint` opacities + gradients** match the handoff's whole-app wash.
  - **`.theme-tint` is `position:absolute` in our code, so the wash covers only the first viewport
    and scrolls away.** Determine from the mockup/`themes.css`/`source` whether the handoff intends a
    **pinned (`fixed`) whole-app wash** or an absolute one. **This is the open design question from
    the fix** — give a definitive answer with the handoff citation, and a verdict: keep `absolute`
    or change to `fixed`. Scroll a long page (`/year` or a long lesson) and screenshot whether the
    wash falls off below the fold.

**R3 — REGRESSION SURFACE of the body-transparent change.** The cloud grep found no dependents, but
verify **live**:
  - the **`/welcome` marketing route** paints its own opaque `--canvas` hero over the stage — confirm
    that's still intact and intended (photo correctly NOT showing there is expected, not a bug).
  - **print** (`/weekly/print` + browser print preview): `.stage` + `.theme-tint` are suppressed and
    the body is white — no photo/tint bleed into paper output.
  - **Teach view** (`[data-teach-view]`) and any `[data-print-view]` surface still render their own
    backgrounds correctly with the body now transparent.
  - **no white FOUC** on hard-reload in Clear and in Night — `<html>`'s `--canvas` base must paint
    before `.stage` does. Use video capture (Method A) if you suspect a flash.

**R4 — PROBE actually proves it now.** Run `node scripts/probe-theme-wave.mjs` against the
**authenticated** dev server (so it tests `/weekly`, not the `/login` fallback). Confirm it **passes**
the new render-paint gate (theme-tint mounted, body bg `none`, `--stage-photo` resolves, `::before`
paints the photo url, auto-tone resolves on photo+normal) at all three widths, and exits 0. If it
still silently lands on `/login`, the R1 auth setup isn't real — fix that first.

---

## PART A — §4a (two independent reviewers), run on BOTH diffs
Run the standing **8-point checklist** from `WAVE-2-AUDIT-PROMPT.md` PART A against the **full engine
diff**, AND add a focused pass on the **fix-only diff** for: (i) does `body { background: transparent }`
break any token/contrast assumption; (ii) is mounting `.theme-tint` as a static (non-positioned) child
correct for the `:root[data-theme] .theme-tint` selector + the z-90 stacking intent; (iii) is the print
suppression correctly **nested inside** `@media print`; (iv) are the new probe assertions
false-positive/-negative-proof (esp. the `/login` redirect guard and `getComputedStyle(body)
.backgroundImage === 'none'`); (v) SSR/hydration — the new server-rendered div matches first client
paint; (vi) **lockstep untouched** (the fix must not have edited any of the 5 frozen value arrays).
  - **Review 1 — Codex:** `git show claude/v2-wave2-engine | codex exec --sandbox read-only "<persona +
    the 6 focus points above + the standing 8-point checklist>"` → `CODEX-WAVE2-REAUDIT.md`.
    Sandbox NEVER weakened; if it can't run under `--sandbox read-only`, STOP and report.
  - **Review 2 — independent Claude** (fresh agent, did NOT author the fix): same checklist vs the
    diffs + handoff + matrix, in the §4a persona → `CLAUDE-WAVE2-REAUDIT.md`.

## PART B — §4b live QA
Run `WAVE-2-AUDIT-PROMPT.md` PART B (B1 v1-compat regression, B2 v2 engine smoke, B3 responsive) **at
all three widths**, but treat **⭐R1 + ⭐R2 + R3 as the priority** — the engine smoke must now be done
**on an authenticated app route with eyes on the photo + wash**, not on computed styles alone.
Report-only; write to `QA-REPORT.md` with severity / repro / device-width + full axis state
(frame·glass·bg·theme·dim·derived-tone) / screenshot filename / suspected file:line / fix.

---

## DELIVERABLE
Bring back **CODEX-WAVE2-REAUDIT.md + CLAUDE-WAVE2-REAUDIT.md + QA-REPORT.md**, each with a
**GO / GO-WITH-CHANGES / NO-GO** verdict, a findings table, and a must-fix-before-Wave-3 list. The two
⭐ items each need an explicit **CONFIRMED / NOT-CONFIRMED** line (with a screenshot ref for R1 and a
handoff citation for R2). Paste them into the cloud session; it validates each finding against the
code and folds the legitimate ones in before Wave 3.
