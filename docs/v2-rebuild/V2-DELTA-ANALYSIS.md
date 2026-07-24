# v2 Surface-by-Surface Delta — current code vs the 6.24.26 v2 handoff

> Source of truth analyzed: the v2 handoff at `/home/user/v2-handoff/Documents/Claude Design/6.24.26 design_handoff_v2_site/`
> — README + CLAUDE.md + 4 specs + design-system tokens (`colors_and_type/themes/modes/styles.css`)
> + the two design HTML guides + the **canonical bundled mockup** (10,869 lines) + all 20 `source/*.jsx`.
> Compared against the current tree at `/home/user/repo/` (branch `claude/settings-popup-year-curriculum-chips`).
> Produced by 8 parallel analysts; this is the synthesis.

---

## 0. Headline

**v2 is a design-language overhaul, not a re-skin.** The agreed "re-skin / preserve plumbing"
scope holds for the **data layer** but not the **presentation + appearance layer**. Accurately:
**preserve the *data* plumbing; rebuild the *view + chrome + appearance-engine* layer from the v2 spec.**

- **~20% RE-SKIN** — base tokens are already aligned; Catch-Up, Teach annotation/fullscreen, and the
  notification bell already exist (some current code is *ahead* of the v2 prototype).
- **~30% RESTRUCTURE** — Day/Week/Year, Lesson Plan, global chrome, Settings/Setup: same data, new
  markup/layout/material.
- **~50% NET-NEW** — the Frame/glass/photo **appearance engine**, Home/landing, Tools dock, Resource
  Wall, Wall Library, Lesson Library, Unit Explorer, the shared AppearanceControls, the to-do store.

---

## 1. Appearance-engine resolution (was: "two engines")

The v2 bundle appeared to contain two engines. **Resolved by reading the shipped mockup:**

- The **runnable mockup uses ONE engine exclusively**: attributes `data-version` (A/B/C),
  `data-theme`, `data-glass`, `data-tone`, `data-bg`, `data-dim`, `data-canvas`, `data-mode`,
  `data-zoom`, `data-veil` on a single root `.home`, with `cc_*` localStorage keys.
- `modes.css` (the cleaner `data-frame="glass|paper|color"` model) is a **spec-grade restatement**
  of the same idea; `data-frame` ≡ `data-version`. **Decided (§4.2):** adopt the clean `data-frame`
  naming, implement the *behavior the bundle demonstrates* (the bundle is canonical for behavior per
  the README).
- The current app's `data-style` (quiet/calm/vivid) + `data-palette` (normal/highlight) +
  `mycurricula:user:theme*` keys have **ZERO presence** in v2. → `data-style` is **replaced** by the
  Frame axis; `data-palette`'s global toggle is **dropped** (subject color goes inline `--sc/--sct/--sci`).
- **v2 axis set (7):** Frame (A/B/C) · Glass register (dark/white) · Background (photo/wash) ·
  Theme (Clear/Night/Honey/Blossom/Mint/Sky/Photo-off) · Photo brightness (dim/normal/bright) ·
  derived Tone (light/dark) · [+ the design HTML adds Glass register as an explicit 7th axis card].
- **Tone is *derived*** by sampling photo luminance (32×32 canvas, mean Rec-709, >0.6 → light tone).
  Net-new, async, **SSR-unsafe** in the current synchronous no-FOUC boot script → guaranteed tone
  flash unless a last-known-tone is persisted and painted synchronously.

**Base tokens are nearly identical** (`colors_and_type.css` ⊂ current `tokens.css`): brand, honey,
subject 1–15 + tint/ink/bright, grades, gradients, radius, shadows, type families are byte-for-byte.
The only base value drift: `--idle` (`#6E6C82` v2 vs `#b6b5c6` current). **Migration must be ADDITIVE
over current `tokens.css`** — v2's CSS has none of the current planner/Teach/chrome token tiers
(`--chrome-accent-*`, `--rail-bg`, `--wf-*`, `--teach-bg-*`, `--tag-*`, `--hl-*`, `--logo-*`, …);
replacing the file would silently delete the entire planner + Teach + chrome theming surface.

---

## 2. Master classification table

| Surface | Class | Effort | Current home | Key reuse |
|---|---|---|---|---|
| **Appearance engine** (Frame/glass/photo/tone) | **NET-NEW** | XL | `lib/theme.tsx` (3-axis) | token base, `data-theme` mechanism |
| Base token values | RE-SKIN | XS | `app/tokens.css` | already aligned (1 value drift) |
| Subject→slot mapping | RE-SKIN (decided: adopt v2) | XS | `lib/palette-data.ts` | token/alias change, no data migration (§4.1) |
| Type system (`--t-NN` → `.ds-*` role tokens) | RESTRUCTURE | M | `tokens.css` | additive |
| **Home / landing** | **NET-NEW** | XL | none (`/` redirects to `/weekly`; dead `/home` link) | Clock, theme |
| **Global chrome** (corner grammar + navigate-in-place) | RESTRUCTURE | L | `components/shell/*` (TopBar/SideNav/RightPanel/rails) | NotificationBell, Clock, toggle |
| **Tools dock** (drag/resize/snap/collapse/persist) | **NET-NEW** | L | none (To-Do/Shout exist as fixed panels) | right-panel content |
| **Per-heading style cog** (This page/Whole site scope) | **NET-NEW** | L | none (central settings only) | needs appearance engine |
| Day view | RESTRUCTURE (all frames) | L | `components/daily/*` | `usePlanner`, LessonDetail, ordered-weekdays |
| Week view | RESTRUCTURE (C lightest) | L | `components/grid/WeeklyGrid` (≈ Frame C) | dnd, filters, holidays, `--day-count` |
| Year view | A/B RESTRUCTURE, **C NET-NEW** (constellation) | M–L | `components/year/TimelineYear` (≈ Frame A) | academic-year axis, UnitDrawer |
| Lesson Plan document (scroll→8 tabs) | RESTRUCTURE + 3 NET-NEW tabs | H | `components/daily/LessonDetail`, `lesson-flow/*` | **planner-store flow API (done)** |
| Flow editor (rename/add/del/reorder/presets) | mostly DONE in store | low glue | `planner-store` + `lesson-flow.ts` | undo/redo, templates |
| **Planner Hub** (doc-tab workspace shell) | **NET-NEW** | H | none | search-index, SubjectView, catchup |
| Unit planner (Overview/Lessons/Assess) | RESTRUCTURE | M | `components/subject/SubjectView` | `unitAssessments`, unit-notes |
| **Resource Wall** (kanban sections) | **NET-NEW** | XL | none | LessonResource, `lessonResourceRefs`, ResourceEmbed |
| **Wall Library** | **NET-NEW** | L | none | mirror Teach Boards-Library pattern |
| **Lesson Library** (6 views + buckets + reschedule) | **NET-NEW** | H | scattered (`lesson-schedule`, catchup, SubjectView) | needs nullable date |
| **Unit Explorer** (modal, 9+8 tabs, hover chip) | **NET-NEW** | H | partial (`UnitHealthCard`+`StatStrip`) | year-pacing, lesson-flow |
| Catch-Up | RE-SKIN / minor RESTRUCTURE | low | **shipped** `/catch-up` + `lib/catchup-data.ts` | whole data layer (current richer) |
| Teach board | RE-SKIN to v2, drop widgets (§4.4) | M | **mature WIP** `components/teach/*` | keep AnnotationLayer, fullscreen, intent model |
| Settings / Setup hub | RESTRUCTURE | M | `app/settings/*` routes | every settings page exists |
| Shared AppearanceControls component | NET-NEW | H | only `ThemeQuickSwitch` (theme-only) | — |
| Notifications (bell/center) | RE-SKIN + small adds | low | `NotificationBell`, `realtime-presence` | exists; add filter chips, scheduler |
| Enriched To-Do | type exists, behaviors NET-NEW | M | `Todo` type + `TodayTodos` | needs shared store |

---

## 3. The single biggest preservation risk — the three-tier forking cue

The Master/Personal **three-tier visual cue** (solid stripe = Master · dashed stripe + "Modified"
pill = personally edited · move-arrow = personally moved) is the product's competitive
differentiator (CLAUDE.md §2). **It is almost entirely ABSENT from the v2 demo and bundle** — the
mockup shows only a partial dashed-stripe + "Modified" pill on the Plan header, and a bare "Personal"
dot in some rows. The current code implements all three tiers richly across weekly/daily/detail.
**The v2 spec gives no guidance for how the cue renders in glass vs paper vs color frames** — so each
frame's cue treatment must be *designed during implementation*, carried forward from current code, not
copied from the demo. Same for the **Team-mode pink caution glow** (v2 replaces the current red
`MasterBanner` with an app-wide pink edge-glow, `#E8179B` = `--subj-5-bright`).

---

## 4. Decisions — RESOLVED (user, this session)

1. **Subject→color mapping → ADOPT v2 MAPPING** (writing→subj-5, spelling→subj-9, ufli→subj-2,
   sel→subj-12). Subjects are referenced by `SubjectId` and color is *derived* via
   `lib/palette-data.ts` + `tokens.css` `.cp-subj` aliases / the palette bridge → this is a
   **token/alias change, NOT a data migration**; it re-hues the UI but touches no saved lesson data.
   Update all 8 in `palette-data.ts` + the `--<subject>` aliases.
2. **Appearance-engine naming → `data-frame` ENGINE, DROP `data-style`.** Clean `modes.css`
   `data-frame` (glass/paper/color) naming, implemented with the bundle's proven behavior.
   `data-palette` → inline `--sc/--sct/--sci`; `data-theme` splits into `data-theme` + `data-tone`.
3. **Navigation → SEAMLESS FEEL, KEEP ROUTING (hybrid).** Keep Next.js App Router (deep-links/SSR/
   seams) but make background + chrome a **persistent shell that doesn't unmount**, with client-side
   **View Transitions** for the seamless swap. (User: best long-term, ok with either.)
4. **Teach board → KEEP WIP INFRASTRUCTURE, RE-SKIN TO v2, DROP WIDGETS.** Retain annotation engine,
   `BoardFullscreen`, intent model, backgrounds; **remove the free-form widget system**; present the
   v2 slide/resource look (filmstrip, resource cards on a stage, pinnable lesson rail).

---

## 5. Data-model gaps (additive to `lib/types.ts`)

- **Nullable scheduled-date / "unscheduled" lesson** — the keystone gap. `Lesson` has `week`/`day`
  (always present); v2's Lesson Library "Not-taught" bucket, Unit Explorer "not scheduled", and the
  Catch-Up "not yet taught" vs "overdue" all need a first-class unscheduled state.
- **Resource Wall types** — no `ResourceWall` / `WallSection` / `WallBackground` (color|wash|photo|
  gradient + scope) exist at all. Mirror the Teach `Board` library shape (`libraryVisibility`,
  `publishedBy`, `sourceBoardId`).
- **Lesson doc fields** — `differentiation {support,onLevel,extension}`, `materials`, per-section
  `minutes`, per-section `teacherNotes`; standards as `{code,desc}` not bare `string[]`.
- **UnitDetail aggregate** — pacing/coverage/projectedFinish/standards-with-hits rollup (derive).
- **To-Do** — add `priority`, real `status`, concrete due date/time; a **shared to-do store**
  (provider) is the keystone unblocking management panel, due chips, overdue-pin, Mine/Everyone, and
  the notification scheduler.

---

## 6. Preserved plumbing (reused as-is — the "preserve" half)

`lib/planner-store.tsx` (section CRUD, reorder, duplicate, resource tagging, 50-step undo/redo, 700ms
coalescing) · `lib/lesson-flow.ts` (exactly the v2 flow shape) · `lib/lesson-templates.ts` +
`custom-templates.tsx` · `lib/catchup-data.ts` + `catchup-state.tsx` (richer than v2) ·
`components/teach/*` (BoardEditor, AnnotationLayer, fullscreen) · `NotificationBell` +
`realtime-presence.ts` · `Todo` type · `useSubjectColor`/palette bridge · `useOrderedWeekdays`/
`--day-count` (the school-week contract v2's hard-coded `repeat(5,…)` CSS must adopt) ·
`useAcademicYear` axis · the forking model + types · grade-scoping. **The data layer stays; the
v2 prototype's ad-hoc `cc_*` localStorage + `window.DS` fixtures are NOT the target.**

---

## 7. What this means for the plan

- Re-frame scope (plan §1): **preserve data plumbing, rebuild presentation + appearance engine.**
- The **appearance engine is the critical path** — Home, the style cog, every frame-aware view, and
  the shared AppearanceControls all depend on it. Build it first (plan §6 Phase A becomes "appearance
  engine + token migration", much larger than a token swap).
- Sequence net-new surfaces (Resource Wall, libraries, Unit Explorer, Tools dock, to-do store) as
  their own workstreams, not "re-skins."
- The four §4 decisions are **RESOLVED** (this session) — see §4; the build plan can sequence
  against them directly.
