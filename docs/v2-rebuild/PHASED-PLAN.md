# mycurricula.app — v2 Site Rebuild + Backend Rewiring — Phased Implementation Plan

> **Status:** FINALIZED proposal, ready for adversarial audit (Claude-terminal + Codex) and for
> reconciliation with the user's terminal plan.
> **Companion:** `v2-delta-analysis.md` — the consolidated surface-by-surface delta (8 analyses) this
> plan is built on. Read it alongside this file.

---

## 0. Decisions locked (user, this session)

| # | Decision | Build implication |
|---|---|---|
| D1 | **Subject→color mapping = adopt v2** (writing→subj-5, spelling→subj-9, ufli→subj-2, sel→subj-12) | Token/alias change in `lib/palette-data.ts` + `tokens.css` `--<subject>` aliases. Subjects are referenced by `SubjectId`, color is derived → **no data migration**, re-hues UI only. |
| D2 | **Appearance engine = `data-frame`, drop `data-style`** | New `data-frame` (glass/paper/color) + `data-glass` + `data-bg` + `data-dim` + derived `data-tone`; `data-theme` splits into accent (`data-theme`) + neutral (`data-tone`); `data-palette` → inline `--sc/--sct/--sci`. Clean `modes.css` naming, bundle's proven behavior. |
| D3 | **Teach = keep WIP infra, re-skin to v2, drop widgets** | Keep `AnnotationLayer`, `BoardFullscreen`, intent model, backgrounds. **Remove the free-form widget system.** Present v2 slide/resource look (filmstrip, resource cards on a stage, pinnable lesson rail). |
| D4 | **Navigation = seamless feel, keep routing** | Keep Next.js App Router (deep-links/SSR/seams); make background + chrome a **persistent shell that doesn't unmount**; client-side **View Transitions** for the seamless swap. |
| D5 | **Scope endorsed** | Preserve data plumbing; rebuild presentation + appearance engine + net-new surfaces. |

---

## 1. Context

**What:** Rebuild `mycurricula.app`'s frontend to the v2 site design and wire the (already-seamed)
Supabase backend so it reads/writes real data instead of mock fixtures.

**Why:** A mature **Phase 1A** app runs entirely on `lib/mock/` fixtures. The v2 design
(`6.24.26 design_handoff_v2_site`) is a **design-language overhaul**, now fully in hand at
`/home/user/v2-handoff/`.

**Scope (per D5):** preserve the **data layer** (stores, types, forking model, grade-scoping,
configurable school-week/schedule, mock→Supabase seams); **rebuild** the view/chrome/appearance
layer from the v2 spec; **build** the four net-new surfaces. Per the delta: ~20% re-skin / ~30%
restructure / ~50% net-new.

**Execution model (user):** dynamic `Workflow` orchestration — fan-out per surface, pipeline per
component, adversarial verify, loop-until-clean — one workflow per phase so the user stays in the loop.

**Outcome:** every surface matches v2 across the frame/theme/tone matrix at all device tiers; the
forking model + grade-scoping + school-week config are intact; backend wired behind flags; no
regression of the working app's behavior.

---

## 2. v2 source — in hand (blocker resolved)

GitHub *git protocol* is org-egress-blocked (403), but the **REST API/codeload is allowed** — the
full v2 branch is extracted to `/home/user/v2-handoff/`, including
`Documents/Claude Design/6.24.26 design_handoff_v2_site/` (README, CLAUDE.md, 4 specs,
design-system tokens, the two design HTMLs, the canonical bundled mockup, all 20 `source/*.jsx`).
**The bundled mockup is canonical for look/behavior; `V2 Framework.md` for rules.** The v2 branch =
`master` + one docs-only commit, so v2 is a **build-from-spec**, not a code merge.

---

## 3. What we preserve (the "preserve" half)

Next.js 15 (App Router) + React 19 + TS, Tailwind layout-only, tokens in `app/tokens.css`,
Cloudflare Workers (OpenNext) + R2.

**Reuse as-is (data/logic core):**
- `lib/planner-store.tsx` — section CRUD, reorder, duplicate, resource tagging, **50-step undo/redo**,
  700ms coalescing (backs every v2 flow edit).
- `lib/lesson-flow.ts` (exactly the v2 flow shape), `lib/lesson-templates.ts` + `custom-templates.tsx`.
- `lib/catchup-data.ts` + `catchup-state.tsx` (richer than the v2 demo).
- `components/teach/*` annotation engine + `BoardFullscreen` + intent model (per D3).
- `NotificationBell` + `lib/realtime-presence.ts`; the `Todo` type.
- `useOrderedWeekdays`/`--day-count` (the school-week contract v2's hard-coded `repeat(5,…)` must
  adopt), `useAcademicYear`, the palette bridge, grade-scoping, the forking model + types.
- Backend seams (see §4). The v2 prototype's `cc_*` localStorage + `window.DS` fixtures are NOT the target.

**Token base is ~identical** between v2 `colors_and_type.css` and current `tokens.css` (brand,
subject 1–15, grades, radius, shadows, type families byte-for-byte). **Migrate additively** — never
replace `tokens.css` (it carries planner/Teach/chrome tiers v2 lacks: `--chrome-accent-*`,
`--rail-bg`, `--wf-*`, `--teach-bg-*`, `--tag-*`, `--hl-*`, `--logo-*`).

---

## 4. Backend rewiring — mostly seamed already

**Present:** Supabase clients (`lib/supabase/{client,server,admin}.ts`); feature-flag seams
(`lib/planner/source.ts` → `supabase-source.ts` vs `mock-source.ts` via
`NEXT_PUBLIC_PLANNER_USE_SUPABASE`; same for teach); auth (`middleware.ts` + Google SSO + Claude
bypass); API routes (`app/api/resources/*` R2, `app/api/og-preview`); `lib/admin/queries.ts`;
migrations dir.

**Rewiring work (Phase 4):** complete `lib/planner/supabase-source.ts` and
`lib/teach/supabase-source.ts` against the same contract the mock sources satisfy; add migrations for
new v2 tables (resource walls, teacher preferences extensions, to-dos, unscheduled-lesson state);
flip flags per surface after parity verification; keep mock sources working (flags off) for
designer-mode builds.

---

## 5. Base branch & WIP (decided)

**Build ON the current branch `claude/settings-popup-year-curriculum-chips`.** It carries a coherent,
high-quality "Wave 1 appearance + settings consolidation" WIP that rewrites the *exact* files the
rebuild touches (tokens, ui primitives, settings, year, appearance, shell, theme) — high collision,
~40–85h of relevant work (theme-sync, the load-bearing `.btn` specificity fix, year polish, chrome
tier, error boundaries, Teach Wave-1). `master` is code-identical to v2 and retrievable, but basing
elsewhere discards this work. **Prerequisites:** (a) run `npm run build` to confirm the uncommitted
working tree compiles; (b) the WIP author should commit/finish the partial settings-modal work — **I
did not author the WIP and will not commit it**. The plan branch (§push) commits ONLY plan docs.

---

## 6. Phased build roadmap

Dependency-ordered. Each phase = one (or a few) `Workflow` invocations; the user reviews between
phases. **Phase 0 is the critical path** — Home, the style cog, every frame-aware view, the Teach
re-skin, and the net-new surfaces all depend on the appearance engine.

### Phase 0 — Foundations (appearance engine + tokens + shell) — *critical path, XL*
The rebuild's load-bearing layer. Build before any surface.
1. **Token migration (additive).** Add `--s1..s16` spacing, `--accent*`, `--amb-*`, `--duo-*`, inline
   `--sc/--sct/--sci`, `.ds-*` type-role classes. Apply the **D1 subject-mapping swap** in
   `palette-data.ts` + aliases. Reconcile `--idle`. Grep-gate: no component references a dropped token.
2. **Frame engine (D2).** Introduce `data-frame` (glass/paper/color), `data-glass`, `data-bg`,
   `data-dim`; split `data-theme`→`data-theme`+`data-tone`; **remove `data-style`** + its allowlist/
   persistence; move `data-palette` to inline subject vars. Port `modes.css` material recipes
   (frosted-over-photo, Liquid-v5-over-wash, dark/white registers) onto generic primitives
   (`.card/.lane/.stage`). Update `lib/theme.tsx` guards + `lib/theme-init.tsx` boot arrays +
   `theme-sync.ts` columns + migration CHECKs in **lockstep**.
3. **Photo background + auto-luminance tone.** New `.stage`/`.frame`/`.scrim`/`.veil`/`.theme-tint`
   layers; photo library + upload; canvas luminance sampling → derived `data-tone`. **Persist
   last-known-tone** and paint it synchronously in the boot script to avoid the SSR tone-flash.
4. **Persistent shell + View Transitions (D4).** A shared layout hosting the background + corner-
   grammar chrome that does NOT unmount across routes; client-side View Transitions for seamless swaps.
5. **Shared `AppearanceControls`** component (Frame/Glass/Background/photo/Theme/motion) + the
   **surface-theming tier contract** (Tier-1 vs Tier-2 enrollment + a review rule for new overlays).
6. **Gate:** the theme/tone/frame matrix renders (Wash · Photo-Dim · Photo-Bright · Night) at
   400/768/1280; `npm run build` green.

### Phase 1 — Chrome + core views (restructure) — *large*
Depends on Phase 0.
- **Global chrome → corner grammar** (wordmark TL; mode/Tools/bell/hub TR; context BL; clock BR;
  quote bottom-center); deprecate the arrangeable icon-rail subsystem; **Team-mode pink glow**
  replaces the red `MasterBanner`.
- **Home / landing** (net-new) — full-bleed bg + centered segmented console (fills the dead `/home` link).
- **Per-heading style cog** — This-page/Whole-site scope over the shared `AppearanceControls`.
- **Day / Week / Year** — frame-aware rebuilds. New unified per-view markup that all three frames
  re-skin (Week is the hardest "identical markup" case — period×day / day-cols / subject-lanes).
  **Carry the three-tier forking cue into each frame's material by hand** (the demo omits it — the
  #1 preservation risk). Keep `usePlanner`, dnd, filters, holidays, `useOrderedWeekdays`,
  `useAcademicYear`.
- **Lesson Plan document** — scroll-stack → 8 tabs (Plan/Flow/Resources/Support/Standards/Materials/
  Stats/Notes). Flow-edit plumbing already in the store; add the 3-pane Flow tab + "apply/save preset".

### Phase 2 — Net-new surfaces + stores — *large*
Depends on Phase 0; surfaces are independent workstreams (parallelize).
- **Data-model migrations first** (additive to `lib/types.ts`): nullable **unscheduled lesson date**
  (keystone), **ResourceWall/WallSection/WallBackground**, lesson `differentiation`/`materials`/
  per-section `minutes`+`teacherNotes`, standards `{code,desc}`, `UnitDetail` aggregate, `Todo`
  `priority`/`status`/concrete due.
- **Resource Wall** (kanban sections, per-section subject color + bg override, view modes).
- **Wall Library** + **Lesson Library** (6 views × 4 buckets + reschedule/bump/cascade) + **Unit
  Explorer** (modal, unit+lesson tabs, hover chip).
- **Planner Hub** (doc-tab workspace shell over Lessons/Units/Resources/Catch-Up; reuse `SubjectView`,
  catchup, `search-index`).
- **Tools dock** (floating/drag/resize/snap/collapse-to-rail + persistence) + **shared to-do store** +
  enriched To-Do + **notification scheduler** + generalized toasts + notification-center filter chips.

### Phase 3 — Re-skins + restructures of existing surfaces — *medium*
Depends on Phase 0.
- **Teach (D3):** strip the widget system; re-skin the kept editor/annotation/fullscreen to the v2
  slide/resource look (filmstrip, stage cards, pinnable lesson rail).
- **Settings/Setup:** keep the route hub; restyle to v2; embed the shared `AppearanceControls`.
- **Catch-Up:** re-skin only (current is richer than the demo); add the standards-gaps block.
- **Notifications:** re-skin bell/center; wire scheduler + filter chips from Phase 2.

### Phase 4 — Backend wiring + full verification — *medium*
- Complete `supabase-source.ts` (planner, then teach) to seam-contract parity; add migrations for the
  Phase-2 tables; flip flags per surface after smoke-testing; keep mock sources working.
- **Verification (every phase, hard gate at the end):** `npm run lint && npx tsc --noEmit &&
  npm run build`; Vitest; the responsive probe; the **§4a code-review gate** (Codex or independent
  agent) before each logic/data commit; the **§4b live QA gate** (Playwright/chrome-devtools, real
  clicks) across the frame/tone/responsive matrix; manual run via the `run` skill + Claude bypass.

---

## 7. Dynamic-workflow orchestration

- **Phase 0:** a single workflow — token-diff → apply → engine port → adversarial verify (grep gate +
  build + matrix render). Sequential within, because everything depends on it.
- **Phases 1–3:** `pipeline(SURFACES, build, verify)` — each surface re-skinned/restructured against
  its v2 source in a worktree, then an **independent verify agent** confirms (a) v2 fidelity at
  400/768/1280 across Wash/Photo-Dim/Photo-Bright/Night, (b) the forking cue is present, (c) the diff
  is presentation-scoped (no data/state change). Loop-until-clean. Net-new surfaces run as parallel
  thunks.
- **Phase 4:** `pipeline([planner, teach], implement-source, verify-parity-then-flip-flag)`.
- **Scaling:** lean to thorough adversarial verification — this is a full rebuild; verify agents hunt
  for regressions, never rubber-stamp.

---

## 8. Critical files
Tokens/engine: `app/tokens.css`, `lib/theme.tsx`, `lib/palette.tsx`, `lib/palette-data.ts`,
`lib/theme-init.tsx`, `lib/theme-sync.ts` (+ new `modes`/`stage` CSS). Chrome/primitives:
`components/shell/*`, `components/ui/*`. Surfaces: `components/{daily,grid,year,subject,catchup,teach,
settings,appearance}/*` + routes. Net-new: new `components/{home,resource-wall,libraries,
unit-explorer,hub,tools-dock,todo}/*`. Backend: `lib/planner/*`, `lib/teach/*`, `lib/supabase/*`,
`middleware.ts`, `app/api/resources/*`, `supabase/migrations/*`. Types: `lib/types.ts` (additive only).

---

## 9. Reconciliation with the user's terminal plan
The v2 design is now extracted directly, so the terminal plan is a **cross-check on phasing/priorities
and intent**, not the source of the design. Merge points: (1) phase ordering & priority; (2) any v2
surface/route not in the delta inventory; (3) backend tables for new surfaces; (4) whether the Wave-1
WIP decisions are superseded or preserved; (5) anything the terminal plan flags that this plan misses.
After the adversarial reviews (§10) + my review of the terminal plan, I merge both into one plan.

## 10. Audit & review flow (this hand-off)
1. **Push** this plan + `v2-delta-analysis.md` + `audit-prompt-toasty-puddle.md` to GitHub.
2. **Claude-terminal** runs an adversarial review using the repo's **Code Review Gate** methodology
   (CLAUDE.md §4a / AGENTS.md) → findings.
3. **Codex** runs an independent adversarial review (`codex exec --sandbox read-only`) → findings.
4. User brings both findings back here; I review the user's **terminal plan**; I merge the two plans +
   all findings into the final reconciled plan.
