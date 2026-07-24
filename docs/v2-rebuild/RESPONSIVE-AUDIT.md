# v2 Responsive Readiness Audit — phone / tablet / desktop

> **Dated snapshot — 2026-07-04, audited at `claude/v2-wave3-chrome` tip `91eaa98`.**
> Live headless capture (Chrome) of the **v2 surfaces only** at 375 / 768 / 1024 / 1280,
> authenticated via the claude-login bypass, on a real Supabase backend. Report-only.
> Per CLAUDE.md §8: verify against current code before treating any finding as still open.
> Scope excludes v1 surfaces slated for replacement (/year, /daily content, /catch-up,
> /schedule, /archive, /boards, /teach, /subject, other /settings, /welcome, /login,
> /onboarding). `/daily` is audited for its **shared chrome only** — its content is being
> rebuilt in W3.7 by another session.
>
> Method: 28 captures (7 surfaces × 4 widths) with programmatic measurement
> (document scrollWidth vs innerWidth, offending elements + overflow-ancestor check,
> touch-target sizes, resolved axes, console errors) + screenshots, then three parallel
> analysis agents, then orchestrator synthesis with an empirical root-cause verification.
> Screenshots: `docs/screenshots/resp-audit/`.

---

## Resolution log

**2026-07-04 — F1 / Task #12 RESOLVED** (`app/chrome.css`, `components/chrome/ChromeTopBar.tsx`).
The phone document horizontal-scroll on /home, /weekly (all frames), and /daily is fixed by
collapsing the top-bar right `.tools` cluster: at ≤480 it hides the inert View/Edit toggle +
To-dos + Team Shoutbox; at 481–540 it hides only the inert View/Edit (closing a pre-existing
overflow band in the phone↔tablet gap). Keeps Search, the Personal/Team safety switch, and
Notifications at every width. Live-verified 0 document overflow at 375/414/481/500/520/540/
600/768/1024/1280; gates: Codex §4a **GO / NO BLOCKING ISSUES**, live §4b **CONFIRMED**.

**Accepted product decision (option A, signed off 2026-07-04):** at ≤480px the **To-dos** and
**Team Shoutbox** panels are intentionally omitted from the phone top bar (no inline entry
point at phone-portrait; they return at ≥481px and on tablet/desktop). They are secondary
collaboration surfaces; a `.toolspop` phone overflow menu is the documented fast-follow if we
later want them reachable at ≤480. This records the sign-off both gates asked for — it is a
deliberate scope choice, not an unhandled a11y gap.

**2026-07-04 — F2 RESOLVED** (`components/shell/SideNav.module.css`). The collapsed icon-rail
nav items were ~38px (below the 44px touch floor). Fix: 44px min-height on `.item`/`.user` at
≤900, and the phone rail inherits the 64px icon-rail width (the ≤480→54px override was
removed), yielding ≥44px-wide tap targets. Live-verified 47×44 items at 375/414/768 on /home,
/weekly, /daily (0 items <44); no document overflow; task #12 top-bar fit unaffected. Gates:
Codex §4a **GO**, live §4b **CONFIRMED**.

**2026-07-04 — F3 RESOLVED** (`components/grid/WeeklyGrid.module.css`). The weekly header
`.navbar` (Week title + Grid/List/Schedule toggle + prev/next/today) was a nowrap flex row
that overflowed into the grid's internal horizontal scroll on the ~227px phone canvas. Fix:
`flex-wrap: wrap` so the row stacks and every control stays on-screen; single row (no wrap) at
desktop. Live-verified Grid/List + prev/next reachable at 375/414 (navbar right edge ≤ viewport);
1280 unchanged. Gates: Codex §4a **GO**, live §4b **CONFIRMED**.

**Minor follow-up (pre-existing, not from F3):** the "Today" (jump-to-current-week) button is
`display:none` at ≤768 via an existing media query (`WeeklyGrid.module.css` ~L986) — current-week
nav on phone/tablet is still reachable via the prev/next arrows. Worth restoring a compact Today
affordance on phone in a later pass.

**Phone tier now clear.** All audited v2 surfaces (home, weekly ×3, planner-stub, appearance,
shared chrome) are ✅ across phone / tablet / desktop, with the one documented option-A tradeoff
(To-dos/Shoutbox hidden at ≤480).

---

## 2026-07-10 — NEW Wave-3 surfaces audited (W3.7–W3.9, at merged tip `d02608c`)

Same harness (headless capture, 375/768/1024/1280, ≥10s hydration waits, Edit modes forced
via `cc_editmode` localStorage seeding, constellation via the frame=color cookie).
Screenshots `docs/screenshots/resp-audit/W3NEW-*.png`.

| Surface | 375 | 768 | 1024 | 1280 |
|---|---|---|---|---|
| Week EDIT board (`WeekEditBoard`) | ⚠ usable (internal side-scroll, cards + actions intact) | ✅ | ✅ | ✅ |
| Day EDIT split (`.de-split`) | ❌ editor pane collapses — title wraps ONE CHARACTER PER LINE | ✅ | ✅ | ✅ |
| Year Frame-C constellation | ✅ (header/stat cards clean; constellation below fold) | ✅ | ✅ | ✅ |

**Hard contract: PASS everywhere** — 0 document h-scroll on all three surfaces at all four
widths, all markers mount, no unexpected console errors.

**F6 (major, latent) — Day EDIT split unusable at 375** (`W3NEW-day-edit-375.png`): the
two-pane `.de-split` gives the editor pane near-zero width at phone; text renders
letter-per-line. Suspected: the divider/pane width (`cc_deLeftW` default) has no narrow-tier
collapse (stack panes / full-width editor below ~600px). Owner: the Day EDIT surface (Wave-3
views work). **Currently latent, not user-facing**: the View/Edit toggle is hidden ≤540 (task
#12), so no phone user can reach it today.

**F7 (product decision) — Edit mode has NO phone entry point.** The task-#12 collapse hid the
View/Edit toggle at ≤480 (and 481–540) while it was inert; W3.8b made it the functional entry
to Day/Week EDIT. Given F6 (Day EDIT broken at 375) and Week EDIT being merely-workable, the
coherent near-term position is **Edit = tablet+ (≥600); phone = view-only, as a documented
decision** — revisit when F6 is fixed (the `.toolspop` More-menu is the natural phone home for
the toggle if/when phone editing becomes a goal).

**2026-07-04 — polish batch RESOLVED** (commit `3f9b7ad` on `claude/v2-w3-phone-topbar-fix`,
PR #55; gates: Codex §4a GO, live §4b findings fixed pre-commit):
- "Today" jump restored ≤768 (its hiding rule was obsoleted by the F3 navbar wrap) **+ 44px
  touch floor on the Today pill and prev/next arrows** via `min-*` clamps — the module's base
  44px rules were always inert (lost to the Button primitive's stacked `.btn(.icon).sm`; the
  pills shipped 32px). Desktop keeps compact 32px.
- Home console word-only at ≤480 (subs return ≥481; compact console unaffected). **F4 itself
  was corrected**: post-hydration all four chips fit at 375 — the "Plan clipped" report was a
  pre-hydration sampling artifact; the residual was sub-label crowding, now addressed.
- **F5 partially resolved**: settings-search input 44px at ≤900 (replacing a DEAD ≤600 rule —
  single-class `.input` silently lost to the `.input.input` cp-root guard) + theme-quick-switch
  chips 44×44 at ≤900. Remaining F5 leftover: the `Button_icon Button_sm` 32×32 instances are a
  shared-primitive change deferred to a deliberate Button-primitive pass.
- **Durable lesson (bit twice this session):** dev-mode hydration takes 5–9s; any live audit
  sampling before hydration measures SSR-default HTML (default frame, default layout) and
  produces false findings. Wait ≥9s or poll for a hydration marker.

---

## 1. Readiness matrix — "what is already done"

Legend: ✅ ready · ⚠ minor issues (usable) · ❌ not ready (hard-contract h-scroll or unreachable controls). `*` = stub/placeholder, nothing real to certify yet.

| Surface | 375 (phone) | 768 (tablet) | 1024 | 1280 (desktop) |
|---|---|---|---|---|
| **/home** (landing console) | ❌ chrome h-scroll 43px + "Plan" chip clipped | ✅ | ✅ | ✅ |
| **/weekly — glass** | ❌ chrome h-scroll 147px; header controls off-screen | ✅ | ✅ | ✅ |
| **/weekly — paper** | ❌ same (also: rendered WeeklyGrid, not WeekColumns¹) | ✅ | ✅ | ✅ |
| **/weekly — color** | ❌ same | ✅ | ✅ | ✅ |
| **/planner** (immersive) | ✅* stub | ✅* | ✅* | ✅* |
| **/settings/appearance** | ✅ | ✅ | ✅ | ✅ |
| **Shared chrome** (on /daily) | ❌ task #12: chrome h-scroll 147px | ✅ | ✅ | ✅ |
| **SideNav rail** (all surfaces) | ⚠ 37×40px touch target (<44) | ⚠ 40px tall (<44) | ✅ | ✅ |

**Bottom line:**
- **Tablet (768), 1024, and Desktop (1280) are READY** across every v2 surface — 0 document h-scroll, all primary controls reachable. This tier is done.
- **Phone (375) is NOT ready**, but for essentially **one shared root cause** (§2) plus two app-wide touch-target/reachability items.
- **/settings/appearance is READY at all four tiers.**
- **/planner is a stub** (placeholder card over the hero photo) — clean, but re-audit when the real surface is built.

¹ ~~At the widths checked, the `paper` frame rendered the `WeeklyGrid` subject-grid, not the `WeekColumns` day-column layout~~ **CORRECTED 2026-07-04 (verified live):** the W3.6 paper seam works — WeekColumns renders at 1280 with frame=paper. The capture sampled at ≤3s, which in dev-mode is pre-hydration SSR HTML; SSR renders the default frame (glass grid) because the server can't read localStorage, and WeekColumns appeared at t≈9s once hydration + the theme seeding effect completed (dev-compile slow-path). Not a seam bug. It DOES re-confirm the known **first-paint frame flash** (W3-HANDOFF deferred item: a Paper teacher sees the glass grid until hydration — needs the dedicated boot-attributes/SSR-cookie pass). Responsive findings are unaffected (the chrome overflow is CSS-level, hydration-independent).

---

## 2. Root cause — one chrome bug breaks phone across every surface

The 375px document horizontal scroll on **/home, /weekly (all three frames), and /daily is the same element**: the top-bar **right tools cluster** (`div.tools`) — the notification bell + badge, chat/list icons, and (on weekly/daily) the View↔Edit pill. It cannot fit the phone viewport and pushes the document sideways.

**Empirically verified** (not inferred from the offender list): on `/weekly` at 375, `document.scrollWidth = 522`, and the only elements setting that width that are **not** inside an internal scroller are `top-bar_badgeWrap` + `NotificationBell` (right edge 522 = the tools cluster). The WeeklyGrid **is** correctly inside an `overflow-x:auto` scroller (`MAIN`, clientW 233 / scrollW 483) and contributes **nothing** to document width. So:

- **The grid is contract-compliant** (internal scroll is allowed). It is *not* the h-scroll cause — correcting an initial mis-attribution.
- **The document h-scroll = the chrome cluster = task #12.** Fix it once and phone overflow clears on home + weekly×3 + daily simultaneously.

The overflow scales with cluster contents: **/home = 43px** (base cluster + bell, no View/Edit pill, cluster width 304) vs **weekly/daily = 147px** (+ the ~104px View/Edit pill, cluster width 408). Same bug, two magnitudes.

---

## 3. Findings (normalized severities, deduped)

| # | Sev | Surface(s) | Width | Description | Measured | Element | Screenshot | Fix direction |
|---|---|---|---|---|---|---|---|---|
| **F1** | **Major** (gates phone-ready) | /home, /weekly ×3, /daily (shared chrome) | 375 (≤480) | Top-bar right tools cluster overflows → document h-scroll (hard-contract violation). Bell/chat/list pushed off-screen. **= Task #12.** | overflow 43px (home) / 147px (weekly+daily); `div.tools` width 304→408; needs ≤~320px | `tools` › `NotificationBell_bellBtn` + `top-bar_badgeWrap` | daily-chrome-375.png, home-375.png, weekly-*-375.png | Collapse the ≤480 cluster: mode pills → icons or an overflow "…" menu; secondary icons (list/chat) behind that menu. Shed ~100–150px. §4. |
| **F2** | **Major** | all (shared SideNav) | 375, 768 | Collapsed nav-rail items are 37×40px (375) / 47×40px (768) — below the 44px touch floor (both dims at 375; height at 768). Independently found by all three analysis passes. | 37×40 (375); 40 tall (768); OK at 1024+ | `SideNav_item__fjFXv`, `SideNav_brand` | home-375.png, weekly-glass-375.png, daily-chrome-375.png | Give the tappable rail element ≥44×44 hit area (padding, not just the glyph) at phone/tablet. Fix once, centrally. |
| **F3** | **Major** | /weekly ×3 | 375 | The Grid/List/Schedule view toggle and the ‹ Today › week-nav ride off-screen right (within the internally-scrolled content), so switching view mode / changing week needs a sideways scroll to reach. | header controls past x=375 | weekly header control row | weekly-glass-375.png, weekly-color-375.png | Let the weekly header controls wrap or move into a phone control cluster so view-switch + week-nav stay on-screen at 375. |
| **F4** | Minor | /home | 375 | The Day/Week/Year/**Plan** quick-nav chip strip clips the 4th ("Plan") chip (internal clip → not counted in doc overflow, but a reachability gap). | "Plan" chip truncated | hero quick-nav chip strip | home-375.png | Wrap to 2×2, make horizontally scrollable with an affordance, or shrink chip padding ≤400px. |
| **F5** | Minor | /settings/appearance | 375, 768 | Sub-44px touch targets: search field h=36, `sm` icon buttons 32×32, theme quick-switch chips 40×36. No layout break; app-wide pattern. | 36 / 32×32 / 40×36 | `settings-search_input`, `Button_icon Button_sm`, `theme-quick-switch_chipBtn` | appearance-375.png | Bump `sm` icon buttons + search + chips to ≥44px on touch tiers. Low urgency. |

**No real console errors** on any v2 surface at any width (post-filtering the known theme-sync 400 upsert and the pre-existing WeeklyShell `useId` hydration warning).

**Chrome height:** the captured `chromeHeight≈812 / 100%` is a measurement artifact (matched the full-viewport photo stage). Real sticky chrome at 375 is ~145px (≈18–26% of the viewport) — **under the 30% ceiling** on every surface. Pass.

---

## 4. TASK #12 — fix spec (phone top-bar cluster)

The single highest-leverage fix: it clears F1 on home + weekly×3 + daily at once.

**The overflow, measured:**
- 375 viewport → `document.scrollWidth` 522 → **147px** document h-scroll (weekly/daily); **43px** on home.
- Overflowing container: **`div.tools`** (top-bar right cluster). Width **408px** on weekly/daily (right edge 522), **304px** on home (right edge 418).
- Space available at 375: `375 − rail (~37) − left brand/wordmark+gear` ≈ **≤320px** for `tools` → it is **~90–150px too wide**.

**Cluster composition** (left→right, from the 768 shot where all fit):
1. View/Edit mode pill (eye + pencil) — **~104px** ← weekly/daily only; the dominant cost
2. Palette / Personal-Team toggle pill — **~104px**
3. Search icon — ~44px
4. List/view icon — ~44px
5. Chat icon — ~44px
6. Notification bell + badge — ~44px

Two 104px pills + four 44px icons + gaps ≈ **408px**. **Shed ~100–150px:** collapse the two mode pills to icon-only (or an overflow "…" menu) at ≤480, and/or move search/list/chat/bell behind a single overflow affordance. Keep the Personal/Team control reachable (it carries the `#E8179B` caution glow and is a `required` tooltip control). Verify after: 0 document overflow on /home, /weekly (all frames), /daily at 375 **and** 414.

---

## 5. Improvement ideas (not contract failures)

- **Weekly at phone is a sideways-scroll grid.** The week grid is ~483px in a 233px scroller at 375 — contract-legal (internal scroll) but you can't see a week at a glance on a phone. A phone-specific weekly layout (single-day focus, or stacked subject list) is a worthwhile product decision, separate from task #12.
- **Appearance section-nav** is a horizontal-scroll tab strip on phone (allowed); add a scroll fade/affordance so hidden tabs (Standards/Calendar…) are discoverable.
- **In-card touch density** on weekly (~160 sub-44px affordances — checkboxes, subject chips, chevrons) is a density product call, not a responsive break.

---

## 6. Recommended fix order

1. **F1 / Task #12** — phone top-bar cluster collapse. One fix, clears phone document h-scroll on 5 surfaces. **Start here.**
2. **F2** — SideNav ≥44px touch targets (central, app-wide).
3. **F3** — weekly header controls (Grid/List/Schedule + week-nav) reachable at 375.
4. **F4 / F5** — home Plan-chip wrap; appearance touch-target bumps.

Re-run this capture (`.resp-capture.mjs` in the worktree) after each fix to confirm the matrix cells flip to ✅.
