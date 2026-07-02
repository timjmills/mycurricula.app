# Wave 3 — Chrome + core views (PHASED-PLAN Phase 1)

> **Status:** ACTIVE build plan. Branch `claude/v2-wave3-chrome` (off
> `claude/v2-wave2-engine`, which holds the Phase-0 appearance engine).
> **Scope authority:** `PHASED-PLAN.md` §6 Phase 1 (on `claude/v2-rebuild-plan`);
> design authority per CLAUDE.md §4a — bundled mockup > `V2 Framework.md` >
> design-system CSS > this plan.
> **Handoff location (cloud sessions):** the full 6.24.26 bundle is NOT in this
> repo's `Documents/` — it lives in the sibling snapshot at
> `/home/user/v2-handoff/Documents/Claude Design/6.24.26 design_handoff_v2_site/`
> (mockup/ + design-system/ + source/ + specs/). Read it there; never import it.

---

## 0. Carried in from Wave 2

| # | Item | Disposition |
|---|---|---|
| C1 | **theme-sync load-vs-local ordering** — the remote row clobbers a fresh local write when they differ (probe exit-1; race guard only protects post-mount changes) | **W3.1** (fix now — it's the one real defect in the wave-2 probe run) |
| C2 | `.theme-tint` (fixed, z-90, soft-light) possibly washing overlays below z-90 on scroll | Verify during every W3 §4b pass; fix if seen |
| C3 | Wave-2 glass=light live confirm | User terminal pass (prompt delivered); any finding lands as a W3.0 hotfix |
| C4 | Phase-0 leftovers Wave 2 did not build: persistent shell + View Transitions (D4); photo library/upload; persist-last-known-tone (SSR tone-flash) | Shell+VT = **W3.2** (gates the chrome). Photo library + last-known-tone = W3.2 stretch or fast-follow |
| C5 | theme-sync still carries the v1 triple (theme/style/palette); widening to the v2 axes (frame/glass/bg/dim + SQL CHECKs) was deferred | **W3.1b** — after the ordering fix, same lockstep discipline (5 surfaces + migration; §4a with BOTH reviewers — data migration). Also revisit the pre-existing debounced echo-save on remote-apply (it bumps the row's updated_at with unchanged values, which can out-time another device's concurrent real edit — weakens the W3.1 LWW guarantee) |

## 1. Sub-waves (dependency-ordered)

- **W3.1 — theme-sync ordering (last-writer-wins).** Select `updated_at` in
  `loadRemotePrefs`; stamp a local `mycurricula:user:theme-updated-at` on every
  synced-axis change; apply remote only when the remote row is NEWER than the
  local stamp. Probe seeds the stamp alongside the axis keys (lockstep #5).
  **W3.1b** widens the synced set to the v2 axes (columns + CHECKs + guards).
- **W3.2 — persistent shell + View Transitions (D4).** Shared layout hosting
  `.stage`/`.frame`/scrim/veil + corner chrome that does NOT unmount across
  routes; client-side View Transitions for the in-place swap (Framework §3, §9
  "navigates in place — the photo holds, the content swaps on the glass").
- **W3.3 — corner-grammar chrome.** Framework §3 fixed grammar: wordmark TL ·
  Personal/Team toggle + Tools + Help(?) + Settings(⋯) TR · school·grade·unit·week
  context BL · live clock (now/next class) BR · dismissible daily quote
  bottom-center. Deprecate the arrangeable icon-rail subsystem (`GlobalRail`,
  `RightIconRail`, `RailsDndProvider`, `rail-icons`); **Team-mode pink glow
  (`#E8179B` on `[data-mode="team"]`) replaces the red `MasterBanner`** (CLAUDE.md
  §2 — glow, never a confirm dialog).
- **W3.4 — Home / landing console.** Net-new: full-bleed bg + greeting + centered
  segmented console (Day · Week · Curricular plan · Lesson plan · Teach); fills
  the dead `/home` link. Compact console variant at the top of every view.
- **W3.5 — per-heading style cog.** This-page / Whole-site scope over the shared
  `AppearanceControls`.
- **W3.6 — Week frame-aware rebuild.** The hardest identical-markup case: one
  unified markup all three frames re-skin (period×day / day-cols /
  subject-lanes). **Carry the three-tier forking cue into each frame's material
  by hand** — the demo omits it; #1 preservation risk. Keep `usePlanner`, dnd,
  filters, holidays, `useOrderedWeekdays`, `useAcademicYear`.
- **W3.7 — Day + Year frame-aware rebuilds.** Same approach; Frame-C Year is the
  constellation view keyed off the subject scale.
- **W3.8 — Lesson Plan 8-tab document.** Scroll-stack → tabs
  (Plan/Flow/Resources/Support/Standards/Materials/Stats/Notes); 3-pane Flow tab
  + apply/save preset (store plumbing exists).
- **W3.9 — gates.** §4a per logic commit (independent agent on cloud); §4b live
  vs the bundled mockup at 375/768/1280 (user terminal — cloud is
  browser-egress-blocked); extend `probe-theme-wave.mjs` with chrome/home
  assertions; C2 overlay check.

## 2. Standing rules for every sub-wave

- Branch on `data-tone`, never the theme; tokens only (no hex/px in components);
  Button/Tooltip primitives; onboarding-tooltip contract for every new
  non-obvious control; rounded everything; three-tier responsive before "done".
- The ALLOWLIST LOCKSTEP (5 surfaces) applies to ANY axis/value change.
- New overlays enroll in the SURFACE THEMING CONTRACT rule in `themes.css`.
- Deprecations are removals from the render path, not deletions of v1 tokens
  (token migration stays additive).
