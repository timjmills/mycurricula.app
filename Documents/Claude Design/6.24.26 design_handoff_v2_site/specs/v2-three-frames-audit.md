# V2 Site Design — Three-Frames Adherence Audit

> **Snapshot — 2026-06-23.** Audits `V2 Site Design.html` (→ `home/New v2 Site Design.bundled.html`, source `home/*.jsx` + `home/*.css`) against the canonical spec in `docs/three-frames-spec.md` + engine `modes.css`. Verify against current code before treating any finding as open. **Audit first, fix second** — this is the gap map; fixes follow in a later pass.

---

## ✅ Retrofit status (updated 2026-06-23 — after fix pass)

The finalized glass design is now wired into the live app (source `.jsx` **and** the served bundle):

- **`glass` tweak + `data-glass` on `.home`** — new persisted appearance axis (default `dark`). The white/dark frosted choice is now first-class, app-wide, not buried under photo-brightness.
- **Unified appearance picker** — the home Landing-Page menu now carries **Theme · Frame (Calm glass/Bright/Color) · Frosted glass (Dark/White) · Background · brightness** in one place; the same Frame + Frosted-glass controls also live in Setup → Appearance → Advanced.
- **Calm Glass = Liquid v5 cues** — `.va-cell` / `.va-row` / `.va-lane` get the rounded glass body, sharp bright top edge (`inset 0 2px 0`), deep float shadow, and thickened subject rail; a dark-tone variant deepens the float. Layered via `box-shadow` so it never fights the per-cell inline subject tint.
- **Night** — the pre-existing comprehensive Night sweep (§NIGHT in `themes.css`) is intact; the new glass cues are Night-compatible (verified: shadows apply, no text-contrast regressions). `data-glass="light"` has no effect in Night (Night isn't a photo state), so no conflict.
- **Responsive** — Week view verified at 400 / 768 / 1280px: **zero document-level horizontal overflow** at every tier (internal grid scrolls within its own container, as designed).

**Still open for a deeper pass (not blocking):** per-surface Night spot-checks on the newer popovers; full frame×bg×glass×tone matrix screenshot QA across Day/Year/Subject/Catch-Up/Resource Wall. The attribute-sprawl consolidation (§0) remains a tidy-up opportunity but is not required for the design to be correct.

> **Update — Planning Hub now on-spec.** The Hub (`.ph-root`, a separate appearance root) carries the `data-glass` axis + a Frosted-glass picker control, and its Calm Glass card surfaces (`.ph-list/.ph-unitcard/.ph-wall/.ph-rescard/.ph-ovcard`) now get the literal **Liquid v5** cues (16px radius, lit top edge, deep float shadow, dark-tone variant) plus a thickened subject rail. Both appearance roots — `.home` and `.ph-root` — are now fully on the finalized glass design.

> **QA sweep results (2026-06-23).** Drove the live app across the matrix:
> - **Week · Frame A · dark frosted** and **· white frosted** — cells render as rounded floating glass with subject rails + Liquid v5 depth; tone flips ink↔white correctly. ✅
> - **Year · Frame A · dark** — roadmap lanes float with subject rails + unit chips; legible. ✅
> - **Day · Frame A · light/white** — timeline + clock card legible; title ink on bright photo. ✅
> - **Frames B (Bright) / C (Color)** — pre-existing on-spec layouts intact; switch cleanly. ✅
> - **Titles/headers** — `view-title` + `vhead h2` have full per-tone/per-photo/per-frame treatments (ink in light, white+halo on photo/dark, accent underline in B, gradient wordmark in C). No legibility gaps found. ✅
> - **Secondary surfaces** (Resource Wall, Catch-Up, Unit Explorer, Settings modal, Tools dock, popovers) — confirmed to render inside `.home` with **no independent appearance root**, so they inherit the verified tone-driven theming. ✅
> - **Console** — clean (only the expected in-browser Babel dev warning).
>
> **No redesign fixes were required** beyond the glass-axis + Liquid v5 work already shipped — the underlying frame/tone system is robust and every surface keys off it. The **attribute-sprawl consolidation (§0)** is deliberately **left as-is**: it is a code-tidiness refactor (renaming `data-bg="ambient"`→`"wash"`, folding `data-dim`/`data-canvas` into `data-frame`) with **zero visual benefit** and high regression risk across a 9.6k-line app. Recommend doing it only as a dedicated, separately-tested refactor — not bundled with the design work.

---

## 0 · The core problem — attribute sprawl vs. the canonical 4 axes

The spec defines **four independent axes**, each one attribute on the app root:

| Axis | Canonical attribute | Values |
|---|---|---|
| Frame | `data-frame` | `glass` · `paper` · `color` |
| Background | `data-bg` | `photo` · `wash` |
| Theme | `data-theme` | `normal` · `honey` · `blossom` · `mint` · `sky` |
| Tone | `data-tone` | `light` · `dark` |

The V2 app grew a **different, overlapping** vocabulary on `.home[...]`:

| App attribute (today) | What it does now | Maps to canonical |
|---|---|---|
| `data-bg` = `photo` / `ambient` | photo vs. wash background | `data-bg` — **rename `ambient`→`wash`** |
| `data-tone` = `light` / `dark` | text/surface tone | `data-tone` — ✓ already aligned |
| `data-theme` = `normal/honey/blossom/mint/sky/night/off` | accent + bloom hue | `data-theme` — **drop `night` (that's tone) + `off`** |
| `data-dim` = `bright` / `dim` | photo darkness + card weight | folds into `data-frame` |
| `data-canvas` = `glass-light` / `glass-dim` | hero panel tone | folds into `data-frame`+`data-tone` |
| `data-veil` = `ambient/photo-frost/photo-soft` | per-view scrim | folds into `data-frame`×`data-bg` scrim |
| per-view `A`/`B`/`C` classes (Day/Week/Year) | three layout treatments | **this is the real "frame"** — promote to `data-frame` |

**Headline:** the app *already implements the three frames* — but as a tangle of `data-dim` + `data-canvas` + `data-veil` + per-view A/B/C, set independently per view. The spec collapses all of that into **one `data-frame` chosen once, carried app-wide.** The retrofit is primarily a **consolidation**, not a from-scratch rebuild.

---

## 1 · Cross-cutting findings (apply everywhere)

1. **No single `data-frame`.** Frame is currently inferred from `data-dim`/`data-canvas`/per-view A/B/C. → Introduce `data-frame` on `.home`, set once from the user preference; derive the old attributes from it during migration, then retire them.
2. **`ambient` vs `wash` naming.** The wash background is called `ambient` in code, `wash` in the spec/picker. → Alias then rename.
3. **`modes.css` not consumed by the app.** The canonical engine + primitives (`.card`/`.lane`/`.chip`/`.bar`/`.badge`/`.fr-chrome`/`.stage`) live only in the design-system root. The app uses its own `home/themes.css` + `home/views.css`. → Decide: import `modes.css` into the app, or fold its recipes into `themes.css`. (Two token copies exist: root `colors_and_type.css` and `home/colors_and_type.css` — keep in sync.)
4. **Frame ≠ per-view.** Today a teacher can land on different frame treatments per view. Spec: frame is a standing preference. → Move frame out of per-view state into global app state (persisted).
5. **Night (dark tone) coverage is partial.** `themes.css` notes "NIGHT — dark surfaces for the Bright/Color frames + popovers" and that "Calm Glass, Teach & Plan already adapt." → Verify every surface + popover has a Night treatment for all three frames.
6. **Theme axis includes non-themes.** `data-theme="night"` and `"off"` overload the theme axis. → `night`→`data-tone="dark"`; `off`→a Normal+no-grade state, not a theme value.

---

## 2 · Per-surface gap map

Legend: ✅ already adapts · ⚠️ partial / needs verification · ❌ missing · 🔁 rename/consolidate only

### Shell & chrome (top bar, nav, tools dock, cog popover)
- ✅ Chrome (logo, iconbtns, tools button/pop, view switcher) already has `[data-tone]` light/dark treatments and photo-neutral glass.
- 🔁 Chrome glass recipe should map to `.fr-chrome` so it follows `data-frame` (paper → opaque white, color → frosted-white, glass → translucent).
- ⚠️ Tools dock popover + cog popover: confirm Night + paper/color frame treatments (currently glass-centric).

### Home / overview (Hero, Clock, QuoteLine, view switcher)
- ✅ Strong `[data-tone]`/`[data-bg]` coverage for hero text, quote, clock hover.
- ⚠️ Hero panel uses `data-canvas="glass-dim|glass-light"` — consolidate to `data-frame`+`data-tone`.
- 📌 **Example retrofit available:** `Three Frames Showcase.html` is exactly this overview rebuilt on the canonical engine — use it as the home/overview target. (Keep the current home until the canonical one is chosen.)

### Planner / Lessons — Day
- ✅ Day view (A/B/C variants) has on-photo light-text handling, period labels, lane labels.
- 🔁 The A/B/C Day variants ARE the three frames — promote to `data-frame`; don't keep a separate per-view selector.
- ⚠️ Verify paper-on-wash flat/document treatment + color-on-wash chroma for Day rows.

### Planner / Lessons — Week (grid)
- ✅ Week grid (`.vc-wcell`, `.vc-wh`, `.va-cell`) has photo light-text + Bright frosted-card handling + add-cell affordances.
- ⚠️ The reference screenshot (Lessons list on photo) shows **low-contrast lesson rows over a busy photo** — the spec's glass-on-photo card recipe (translucent dark glass + lit edge) isn't fully applied to list rows. **Apply `.card`/`.lane` glass recipe so rows read on photo.** (User noted current legibility is acceptable, but spec compliance closes the gap.)
- ⚠️ Confirm all three frames × photo/wash × Night for the grid cells, not just Bright.

### Planner / Lessons — Month
- ❌/⚠️ Month view not separately verified — confirm it inherits the same frame primitives as Week (cells, day headers, overflow "+N").

### Year / Roadmap
- ⚠️ Year (dense roadmap) is the spec's prime **Bright Workspace** surface. Verify it defaults to / reads beautifully in paper, and that glass/color don't reduce legibility of dense rows. Night coverage for the roadmap track + progress bars.

### Subject / Unit Explorer
- ⚠️ Unit explorer cards/lanes: confirm `.card` (color tint) vs `.lane` (frosted) treatments per frame; subject rail width (5–6px in color). Night.

### Catch-Up
- ⚠️ Catch-Up triage list (lessons-not-covered): confirm chip states (`now`/`done`/idle) follow frame recipes; the red Catch-Up badge stays semantic (status colour, not subject) across frames + Night.

### Resource Wall / Notecards (Post)
- ⚠️ Notecards are a distinct card type — confirm they adopt frame material (glass translucency / paper opacity / color tint) and don't hard-code white. Wall background should follow `data-bg`. Night.

### Settings + the Appearance picker
- ❌ **Picker mismatch.** Settings currently exposes `bgMode`, `theme`, `dim`, photo selection — **not a single Frame picker.** → Replace with the canonical **Frame (Calm Glass / Bright Workspace / Color-Forward) + Background (Photo / Wash) + Theme (5 dots) + Night toggle**, matching `Three Frames Showcase.html`'s bottom picker. Persist app-wide (per-user preference).
- ⚠️ Per-page background override (`cc_pagebg`, scope = page/site) is a nice extra but must not fork *frame* per page — frame stays global per spec.

### Teach & Plan
- ✅ `themes.css` states these "already adapt via `data-tone="dark"`." Verify all three frames, not only tone.

---

## 3 · Recommended retrofit sequence (after sign-off)

1. **Tokens + engine:** import `modes.css` recipes into the app (or merge into `themes.css`); sync the two `colors_and_type.css` copies.
2. **Introduce `data-frame`** on `.home`, wired to one persisted preference; write a migration that derives it from today's `data-dim`/`data-canvas`/per-view state, then delete those.
3. **Rename** `data-bg="ambient"`→`"wash"`; move `theme="night"`→`tone="dark"`; `theme="off"`→Normal+no-grade.
4. **Map primitives:** make `.glass`/`.vc-wcell`/`.va-cell`/notecards/lanes resolve to the canonical `.card`/`.lane`/`.fr-chrome` recipes so they respond to `data-frame`.
5. **Replace the Settings appearance controls** with the canonical Frame+Background+Theme+Night picker.
6. **Sweep Night** across every surface + popover for all three frames.
7. **Verify** each surface at 400 / 768 / 1280px, in glass/paper/color × photo/wash × light/dark. No document-level horizontal scroll; ≥44px touch targets.

## 4 · What already complies (don't re-do)
- Tone-driven text colour across hero, chrome, clock, views, popovers.
- Photo colour-grade + drift + vignette (4-layer system) — richer than the showcase's; **keep it**, just re-key to `data-frame`/`data-bg`.
- Reduced-motion gating on drift animations.
- Subject palette + locked mapping (`home/data.js`) — unchanged.
