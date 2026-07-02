# Wave 3 — Chrome + core views (PHASED-PLAN Phase 1)

> **Status:** ACTIVE build plan — **REVISED 2026-07-02 for the 7.2.26 handoff.**
> Branch `claude/v2-wave3-chrome` (off `claude/v2-wave2-engine`, which holds the
> Phase-0 appearance engine). W3.1, W3.2, and W3.3a are landed on this branch.
> **Scope authority:** `PHASED-PLAN.md` §6 Phase 1 (on `claude/v2-rebuild-plan`);
> design authority per CLAUDE.md §4a — bundled mockup > `V2 Framework.md` >
> design-system CSS > this plan.
>
> **Design authority — two handoffs now exist; 7.2.26 supersedes 6.24.26:**
>
> - **7.2.26 handoff (NEW design authority):** committed on the design branch at
>   `Documents/Claude Design/7.2.26 Design Handoff Updated Surfaces/`. Its
>   runnable `mockup/New v2 Site Design.bundled.html` is ground truth for look +
>   behavior; `design-system/V2 Framework.md` (now with §9a View/Edit modes,
>   §9b Immersive surfaces, and an expanded component inventory) wins on rules.
> - **6.24.26 handoff (superseded, still required):** sibling snapshot at
>   `/home/user/v2-handoff/Documents/Claude Design/6.24.26 design_handoff_v2_site/`
>   (mockup/ + design-system/ + source/ + specs/). Keep it for (a) **photo
>   assets** — the 7.2.26 package ships zero photos while its bundle and
>   `WallBgControl` still reference `photos/p1-p5.png` (packaging omission, not a
>   design removal; the repo already serves equivalents under `public/stage/`),
>   and (b) the **diff baseline** for delta verification. The old package
>   otherwise survives only in `scratchpad/v2.tar.gz` — pin it somewhere durable.
>
> **CRITICAL source-of-truth caveat (verified):** the 7.2.26 `source/` tree is
> **STALE for the app shell** — `source/app.jsx`, `source/home.css`,
> `source/themes.css` are byte-identical to 6.24.26 and do NOT contain the new
> top-bar / immersive / edit-mode work. Only five files were re-extracted:
> `planbook-edit.jsx/.css` (new), `resource-wall.jsx/.css`, `hub-planner.jsx`,
> `lesson-nav.jsx`, `views.css`. **All shell/chrome/views porting diffs against
> the BUNDLE's sections**, never `source/`. The true 6.24→7.2 code delta is
> confined to: bundle app.jsx (~104 lines), home.css (~50 lines, purely
> additive), themes.css (3), views.css (9), views-a/b/c (2–8 each, bundle-only
> JSX), hub-planner.jsx (10), lesson-nav.jsx (6), resource-wall.jsx (136) +
> resource-wall.css (64, additive), plus the new planbook-edit module. Anything
> the 7.2.26 CHANGELOG claims beyond that list is a phantom delta (see §3, R7).

---

## 0. Carried in from Wave 2

**Landed so far on this branch:** **W3.1** (theme-sync last-writer-wins fix, closing C1) · **W3.2** (persistent shell + View Transitions, closing the shell half of C4) · **W3.3a** (inert `app/chrome.css` port of the 6.24.26 corner grammar). All three survive the 7.2.26 revision — see §3 R10.

| # | Item | Disposition |
|---|---|---|
| C1 | **theme-sync load-vs-local ordering** — the remote row clobbers a fresh local write | **W3.1 — SHIPPED** (last-writer-wins fix landed) |
| C2 | `.theme-tint` (fixed, z-90, soft-light) possibly washing overlays below z-90 on scroll | Verify during every W3 §4b pass; fix if seen |
| C3 | Wave-2 glass=light live confirm | User terminal pass (prompt delivered); any finding lands as a W3.0 hotfix |
| C4 | Phase-0 leftovers: persistent shell + View Transitions (D4); photo library/upload; persist-last-known-tone | **Shell+VT = W3.2 — SHIPPED.** Photo library + last-known-tone = stretch or fast-follow |
| C5 | theme-sync still carries the v1 triple; widening to the v2 axes deferred | **W3.1b** — unchanged (columns + CHECKs + guards, 5-surface lockstep, §4a with BOTH reviewers — data migration). Also revisit the debounced echo-save on remote-apply. **Explicitly EXCLUDES the new 7.2 per-view keys** (edit mode, board layout, divider width — `cc_editmode`/`cc_pblayout`/`cc_deLeftW` analogues): those are per-view LOCAL UI state, never synced appearance axes |

## 1. Sub-waves (dependency-ordered)

- **W3.1 — theme-sync ordering (last-writer-wins). [SHIPPED]** Select
  `updated_at` in `loadRemotePrefs`; local `mycurricula:user:theme-updated-at`
  stamp; apply remote only when newer. Probe seeds the stamp (lockstep #5).
- **W3.1b — widen theme-sync to the v2 axes.** Columns + SQL CHECKs + guards,
  5-surface ALLOWLIST LOCKSTEP, §4a with both reviewers (data migration).
  Excludes the per-view edit-mode/board-layout/divider keys (local UI state).
- **W3.2 — persistent shell + View Transitions (D4). [SHIPPED]** Shared layout
  hosting `.stage`/`.frame`/scrim/veil + corner chrome that does not unmount
  across routes; client-side View Transitions ("photo holds, content swaps").
  Confirmed UNCHANGED by 7.2.26: FLIP/pane/modal animations are
  component-level, immersive surfaces still route normally.
- **W3.3a — inert chrome.css port of the 6.24 corner grammar. [SHIPPED]**
  Kept; partially superseded by W3.3b below. The bulk remains valid 7.2
  vocabulary (glass chip base, brand, tools cluster + toolspop, BOTH modesw
  variants, console/views, hero-quote + qpop, clock, ctx, homecog, responsive
  block). One dead rule: `.iconbtn-planner` (the planner icon button was
  removed in 7.2).
- **W3.3b — NEW: inert chrome.css DELTA PORT to the 7.2.26 bundle.** Port FROM
  THE BUNDLE's home.css section (modular `source/home.css` is stale); the
  delta is purely additive (~50 lines):
  - `.topbar-left` (brand + in-bar ViewTitle host) **including the responsive
    rule `@media(max-width:720px){.brand .wm{display:none}}`** — a change to
    the brand recipe chrome.css already carries; do not port only the named
    new selectors.
  - `.overlay.immersive` (padding 0, `grid-template-rows:1fr`, radius follows
    `--frame-radius`).
  - `.immersbar` / `.immersbar-left` / `.immersbar-right` / `.ib-exit`, plus
    the light-tone scrim variant — **and BOTH scrim recipes**: the home.css
    base (`rgba(8,8,16,.42)` gradient) AND the resource-wall.css per-surface
    override (`rgba(12,11,20,.5)`). Both must land.
  - `.viewwrap.pb-editing .view-titlebar{display:none}` — port for bundle
    parity, but note it is **vestigial** in 7.2: the ViewTitle renders in
    `.topbar-left` OUTSIDE `.viewwrap` (the viewwrap slot is `{null}`), so
    this rule hides nothing; the real edit-mode chrome changes are bottom-row
    (`showBot`) suppression and body reflow (wired in W3.8b).
  - Deprecate `.iconbtn-planner` (remove from the render path when W3.3 wires
    components; the CSS may be dropped then).
  - Note: the immersive rules reference base classes (`.viewwrap`, `.navwrap`,
    `.view-titlebar`, `.viewbody`, `.vt-cogbtn`) that neither chrome.css nor
    the repo has yet — inert-safe; they stay dead selectors until W3.5/W3.6/
    W3.7 introduce that class vocabulary.
- **W3.3 — corner-grammar chrome COMPONENTS (rescoped).** Framework §3 grammar,
  now with the 7.2 top-bar layout and an immersive-capable shell:
  - Top bar: brand + `.topbar-left` (ViewTitle + per-view style-gear host —
    the title/gear no longer live in the view body) · **Personal/Team icon
    toggle in the RIGHT `.tools` cluster** (single-person/group SVGs +
    required tooltips; the recipe already sits in chrome.css — this is
    component wiring, not CSS; the changelog's "centered" claim is refuted by
    both bundles, and the toggle itself pre-exists in 6.24) · tools/bell
    cluster TR · ctx BL · live clock BR · dismissible quote bottom-center.
  - **Team-mode pink glow (`#E8179B` on `[data-mode="team"]`) replaces the red
    `MasterBanner`** (CLAUDE.md §2 — glow, never a confirm dialog).
  - Deprecate the arrangeable icon-rail subsystem (`GlobalRail`,
    `RightIconRail`, `RailsDndProvider`, `rail-icons`).
  - **Immersive shell branch** keyed by route: Day/Week/Year/Home = full
    corner grammar; Plan/Post/Teach routes = `.overlay.immersive` +
    `.immersbar` (round `.ib-exit` Back · title + gear · Personal/Team on
    Plan ONLY). Auto-hide is **Teach-only** (2.8s stillness, wakes on any
    mousemove/touch — not "near the top edge" as the docs say). The Back
    button must settle any pending View Transition and honor the
    `cc-rw-back`-style custom-wall back-pop before router navigation.
  - W3.3 builds the CAPABILITY and enrolls `/planner` only; Post/Teach content
    enrollment ships with those surfaces (Phases 2–3). **Route caveat:** no
    `/planner` or `/post` route exists on this branch (CLAUDE.md's status
    table does not match this tree) — the `/planner` stub lands in W3.4 and
    W3.3's enrollment depends on it.
  - **DESIGN FLAG (unresolved):** the bundle's immersive Plan surface is the
    LEGACY PlanPage, not the Planning Hub — `PlannerHub` mounts as a separate
    overlay that never receives the immersbar. There is no mockup reference
    for the hub under an immersbar. We follow Framework §9a/§9b intent
    (immersive Plan = Planning Hub) as a recorded, deliberate deviation from
    the bundle; flag upstream to design.
- **W3.4 — Home / landing console (rescoped).** Full-bleed bg + greeting +
  centered segmented console; fills the dead `/home` link. Console changes:
  the "Lesson plan" entry becomes **"Planner hub"** and routes to `/planner`
  (**net-new: create the `/planner` route** — a stub hosting the Planning-Hub
  seam until the Phase-2 hub lands; the route does not exist on this branch).
  This follows §9a (rules authority) and **deliberately diverges from the
  runnable bundle**, whose Home console still opens the legacy PlanPage
  full-bleed under the "Planner hub" label (only the nav ROW was repointed) —
  record the divergence; flag upstream. Compact console variant on
  Day/Week/Year only — suppressed on immersive surfaces.
- **W3.5 — per-view style gear (rescoped).** Lives in the top bar next to the
  logo (`.topbar-left`), and inside the immersbar on immersive surfaces —
  not lower in the page. This-page / Whole-site scope over the shared
  `AppearanceControls`. Hosts the per-view style-menu slot that W3.8c's
  Aligned/Stacked toggle plugs into.
- **W3.6 — Week VIEW frame-aware rebuild (scope unchanged + additions).** One
  unified markup all three frames re-skin (period×day / day-cols /
  subject-lanes). **Carry the three-tier forking cue into each frame's
  material by hand** — the demo omits it; #1 preservation risk. Keep
  `usePlanner`, dnd, filters, holidays, `useOrderedWeekdays`,
  `useAcademicYear`. ADD: the `.va-ph` period-rail legibility overrides
  (forced-light on `data-tone=dark`; white + text-shadow on `data-bg=photo`
  when not `data-dim=bright` — existing axes only, lockstep-safe) and the
  View↔Edit toggle **mount point in the RIGHT tools cluster** (bundle
  position; the changelog/§9a "top-left title cluster" is contradicted by the
  bundle, which wins). Mode defaults to View until W3.8c.
- **W3.7 — Day + Year VIEW frame-aware rebuilds (+ additions).** Frame-C Year
  constellation keyed off the subject scale. Day adds: frames-B/C "Add
  lesson" buttons (`.vb-railadd`/`.vc-aadd` — dashed row + `.rplus` badge,
  creates a stub lesson into the planner) and double-click-to-open-planner on
  lesson rows in all three frames (wired behind a seam until W3.8/W3.8b
  land); `.va-ph` legibility; View↔Edit toggle mount point (right cluster).
  **Port from the bundle's views-a/b/c sections — this JSX is bundle-only.**
- **W3.8 — Lesson editor + LessonModal (REPLACES the planned "8-tab
  document").** The old W3.8 is superseded before being built: standalone-Plan
  authoring is retired; the shared **fill-in template** is the authoring
  surface, hosted in three places (Day-edit right pane · Week cell expand ·
  the lesson popup modal). Build:
  - Customizable **section blocks**: drag-reorder by the banner, inline
    rename, per-section wash color (headers default to DIFFERENT subject
    washes, overridable in lesson-template defaults) + a header-only vs
    field-too tint toggle, add/delete/duplicate via ⋯ menu, permanent
    (non-deletable, auto-ensured) Resources section.
  - **Selection-driven floating rich-text bar** (appears only on selection/
    field focus, never docked): B/I/U, three sizes, text + highlight color
    (curated wash swatches behind ▾), numbered/bulleted lists + indent/
    outdent, links, resource chip. **Per the bundle (which wins): NO font
    picker and NO image button in the bar** — the docs overstate; and the
    rich source picker (computer · link · image · note · Drive · built-in
    library) is the **section-footer "+ Add resource ▾" menu**, not the bar.
  - Load template / Save as template + Load standards picker (add/delete
    entries).
  - **Autosave on every input + live cross-host broadcast via
    `lib/planner-store`** (50-step undo/redo + 700ms coalescing) — NOT the
    mockup's `cc_pbsec_*` localStorage broadcast. Explicit **Save to team**
    remains the ONLY push (fork model intact: lazy-fork on first personal
    edit; team pill + warning banner in team mode).
  - **LessonModal**: centered, resizable (CSS `resize:both`, min 360×300, max
    96vw/92vh) over a glassed backdrop; closes ONLY via Exit or Esc — the
    scrim deliberately has no click-to-close.
  - **Dropped from W3.8 (verifier-refuted):** the Standards · Materials ·
    Stats · Notes · Resources tab set, the Resources list/thumb toggle, and
    "Open in Resource Wall" are NOT part of the mockup's lesson editor —
    they are hub-planner's PRE-EXISTING lesson pane (unchanged since 6.24)
    and stay a Phase-2 Planning-Hub concern, sourced from `hub-planner.jsx`.
  - Depends on W3.3 (modal/chrome host); independent of W3.6/W3.7 markup.
- **W3.8b — NEW: Day EDIT mode.** Two-pane `.de-split`: fixed compact agenda
  list left (time · dot · title · subject; current/next auto-selected;
  "+ Add lesson" at bottom) + scrolling fill-in template right; selecting a
  lesson swaps the right template (animated); drag-resizable divider
  (220–520px, width persisted); phone (≤820px) collapses the list to a top
  strip. View/Edit toggle wiring + per-view mode persistence — **qualified
  per the bundle: Day force-resets to View on Home→Day nav and on the Day
  nav item; only Week's mode truly persists across nav.** `openPlan` in Day
  edit selects into the right pane instead of opening the modal. Bottom
  clock/console row suppressed while editing (the real edit-mode chrome
  change; the `.pb-editing` titlebar rule is vestigial — see W3.3b). Global
  appearance axes shared across modes — flipping the toggle never restyles.
  Depends on W3.7 + W3.8.
- **W3.8c — NEW: Week EDIT mode.** Period-aligned column board (day columns,
  lessons as flush stacked cells in shared period rows): cross-day AND
  cross-period drag, origin leaves an empty slot, live drop placeholder,
  cells minimize to their colored header while dragging, resulting shift
  FLIP-animates. **Aligned-by-time / Stacked** layout toggle, persisted per
  user and exposed in the W3.5 per-view style menu (WeekLayoutToggle
  equivalent). Reuses the existing `usePlanner`/dnd plumbing; binds to the
  same unified lesson data as View; respects the fork (team pill/warning,
  explicit push). Depends on W3.6 + W3.8.
- **W3.9 — gates (extended).** §4a per logic commit (independent agent on
  cloud); §4b live at 375/768/1280 vs **the 7.2.26 runnable bundled mockup**
  (`mockup/New v2 Site Design.bundled.html` in the 7.2.26 handoff — the
  scratchpad `bundle-new/` extracts are a diffing aid, not the comparison
  target; user terminal — cloud is browser-egress-blocked). Extend
  `probe-theme-wave.mjs` with: chrome/home assertions; immersive-shell
  assertions (immersbar present + nav absent on `/planner`); edit-mode
  assertions — **appearance axes identical across View/Edit; Week edit-mode
  persists across nav; Day resets to View on Home→Day/Day-nav (assert the
  bundle behavior, not the doc text)**. C2 `.theme-tint` overlay check every
  pass.

## 2. Standing rules for every sub-wave

- Branch on `data-tone`, never the theme; tokens only (no hex/px in components);
  Button/Tooltip primitives; onboarding-tooltip contract for every new
  non-obvious control; rounded everything (Rule #1 — no sharp corners, ever);
  three-tier responsive before "done".
- The ALLOWLIST LOCKSTEP (5 surfaces) applies to ANY axis/value change.
- New overlays enroll in the SURFACE THEMING CONTRACT rule in `themes.css`.
- Deprecations are removals from the render path, not deletions of v1 tokens
  (token migration stays additive).
- **7.2 additions:**
  - Shell/chrome/views porting diffs against the 7.2.26 BUNDLE's sections,
    never the stale modular `source/` (trustworthy only for the five
    re-extracted files listed in the header).
  - Where the 7.2.26 CHANGELOG/Framework text contradicts the runnable bundle
    (toggle placement, "centered" claims, auto-hide scope, Plan retirement),
    the BUNDLE wins per the handoff README; record the contradiction and flag
    it upstream rather than silently following doc text.
  - Per-view local UI state (edit mode, board layout, divider width) never
    enters theme-sync or the appearance axes; global appearance is one source
    of truth across View/Edit modes.

## 3. The 7.2.26 revision record (delta → decision)

Why each rescope happened, so the next agent doesn't re-derive it. Verifier
corrections are folded in — refuted claims dropped, adjusted wording used.

- **R1 — Immersive chrome (§9b) → W3.3b + W3.3 rescope.** Plan/Post/Teach drop
  the two-row nav, console, and bell for `.overlay.immersive` + a floating
  `.immersbar`; on non-immersive views the ViewTitle + gear relocate into
  `.topbar-left`. None of that existed in the 6.24 chrome.css port, so the
  6.24 corner grammar is now CONDITIONAL, not universal. The home.css delta is
  purely additive → an inert delta port (W3.3b) precedes component work
  (W3.3), exactly like W3.3a preceded it. Verified details baked in: immersive
  is scoped to exactly Plan/Post/Teach; Personal/Team appears in the immersbar
  on Plan only; auto-hide is Teach-only (2.8s, any mousemove).
- **R2 — Plan retirement (§9a) → W3.4 rescope + design flag.** NAV_SUB.Plan →
  "Planner hub", the nav row routes to the Planning Hub, `openPlan` no longer
  navigates to a Plan view, and the planner icon button is gone. BUT the
  bundle is internally inconsistent: its Home console still opens the legacy
  PlanPage (immersive-wrapped), and PlannerHub is a separate overlay that
  never gets the immersbar. Decision: follow §9a intent (console → Planning
  Hub via a new `/planner` stub — the route does NOT exist on this branch),
  record it as a deliberate bundle divergence, flag both inconsistencies
  upstream. This also raises Planning Hub's priority inside Phase 2.
- **R3 — View/Edit modes (§9a) → new W3.8b/W3.8c; W3.6/W3.7 add mount points
  only.** Day/Week gain an Edit mode bound to the SAME unified lesson data and
  the Personal/Team fork — too big to fold into the view rebuilds, which stay
  the hardest identical-markup frame-aware VIEW work. Placement corrected to
  the bundle (right tools cluster, not "top-left"); persistence qualified
  (Week persists, Day force-resets on nav). Per-view keys are local UI state,
  out of W3.1b sync scope.
- **R4 — Lesson editor + modal (§9a/§10) → W3.8 superseded and rewritten.**
  The planned 8-tab document (= hub-planner's allTabs) is retired as W3.8's
  shape; the shared section-block editor + Esc/Exit-only resizable modal
  replaces it, backed by `lib/planner-store` instead of the mockup's
  localStorage broadcast. Verifier corrections applied: the editor has NO tab
  set, NO font/image controls in the floating bar, and the rich resource
  source picker lives in the section footer — the hub's tabs/thumb-toggle/
  "Open in Resource Wall" are pre-existing Phase-2 surface.
- **R5 — Day-view additions → folded into W3.6/W3.7.** `.va-ph` rail
  legibility (existing axes only), frames-B/C Add-lesson buttons, and
  double-click→openPlan are small additive recipes; the JSX is bundle-only,
  so W3.7 ports from the bundle's views-a/b/c sections and seams dblclick
  until the editor lands.
- **R6 — Immersive enrollment + wall scope → phase notes, not Wave 3.**
  Post/Teach enroll in the W3.3 immersive shell when their surfaces build
  (Phase 2/3); the Resource Wall's real 7.2 deltas (solo-board edit bar,
  lesson-anchored promotion into ONE custom wall, section lesson tags 3+"+N",
  hub linked-wall chip, per-wall backgrounds + frosted plate/scrim, card
  default med→icon, board→"custom wall" copy) go to Phase 2. Note 6.24
  already shipped `cc_customwalls` with section/unanchored/forked anchors —
  the migration delta is the LESSON anchor + per-wall background keying
  (WallBackground is already in the Phase-2 migration list).
- **R7 — Phantom deltas DROPPED (verified byte-identical to 6.24; zero new
  porting work).** The 7.2.26 CHANGELOG over-reports against its own stated
  baseline: §6 notifications/enriched-To-Do/tools-dock (tools-dock.jsx/.css
  identical; NotifBell/scheduler/cc-toast all pre-exist), §7's "centered"
  Personal/Team icon toggle (identical JSX+CSS in 6.24; not centered in
  either bundle), §7's Planner-Hub header recolor (hub.css identical — keep
  only as a Phase-2 spec annotation), §8's four concrete corner fixes
  (catchup.css identical; resource-wall.css additions-only), §9's "idle badge
  darkened" (no code diff anywhere), §5's "subject-color toggle moved to the
  style menu" and "blue fallback removed" (both pre-date the package).
  Builders must not hunt for these diffs.
- **R8 — Tokens/axes: no-op, lockstep untouched.** The ONLY token diff in the
  package (`--idle` #6E6C82→#B6B5C6 + `--idle-tint`) exists solely in the
  design-system copy and contradicts the new bundle AND source (still
  #6E6C82) and the changelog's own "darkened" claim — bundle wins; flag the
  divergence upstream. (The repo's current `:root --idle` is the v1 #b6b5c6,
  coincidentally equal to the divergent value — resolve when the idle recipe
  is next touched.) All five appearance axes are byte-identical selector/value
  sets; the editor/immersive CSS keys only onto existing axes. Zero changes
  to `lib/theme.tsx`, `lib/theme-init.tsx`, SQL CHECKs, `app/layout.tsx`, or
  the probe allowlists.
- **R9 — Doc artifacts flagged upstream, no build impact.** The new Framework
  accidentally deleted the "## 10. Components" heading (the inventory is
  headless under §9b; §9a's "see §10" dangles) — when citing §10, cite the
  headless inventory block. The Design System.html change is a stripped
  registration comment. WallBgControl ships 3 stock photos (p1–p3); the
  p1–p5 references elsewhere are page backgrounds.
- **R10 — Confirmed survivors.** W3.1 (no synced-key changes), W3.2 (the §9
  navigation contract is unchanged; FLIP/pane/modal animations are
  component-level; one wiring note — the immersbar Back settles pending
  transitions, a W3.3 detail), W3.3a (all but `.iconbtn-planner` remains
  valid 7.2 vocabulary — additive delta, not a rebuild), and the preserved
  data core (planner-store, lesson-flow, catchup, teach annotation,
  `useOrderedWeekdays`/`useAcademicYear`, the forking model — `data.js` and
  all other source modules are byte-identical; the editor explicitly binds to
  unified lesson data + the fork).
