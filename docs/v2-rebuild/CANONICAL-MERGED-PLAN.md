# v2 Redesign — Canonical Merged Plan

> **What this is.** The single reconciled plan, combining the best of two independently-authored
> plans and corrected by two independent adversarial audits:
> - **Plan A** (cloud): `claude/v2-rebuild-plan` — `PHASED-PLAN.md` + `V2-DELTA-ANALYSIS.md`.
> - **Plan B** (terminal): `claude/v2-redesign-plan` — `6.24.26-v2-redesign-plan.md` (13-wave, exact-values appendix).
> - **Audit of B** (cloud, master-verified): `claude/plan-audit` — `plan-audit-findings.md`.
> - **Audit of A** (terminal, code-verified): `claude/v2-rebuild-plan-reviews` — `CLAUDE-PLAN-REVIEW.md` + Codex.
>
> Both audits returned **GO-WITH-CHANGES**. This doc resolves their union of must-fixes. **Spine =
> Plan B's 13 waves** (the more execution-ready doc); **baseline facts + structure = Plan A**
> (master-accurate where B's recon was stale); **all corrections folded in.**

---

## 0. Reconciliation of the two audits (now binding)

### 0.1 Consensus findings — BOTH audits independently raised these (highest confidence)
1. **Theme/tone migration is Critical.** Neither plan published the final `data-theme`/`data-tone`
   value lists or a data migration. Existing `paper/cloud/night` users would silently lose their
   theme; a `teacher_preferences` CHECK change without a row migration strands rows; `theme-sync`
   swallows errors and **silently stops** on a stale CHECK. → **Freeze the value lists and ship an
   old→new localStorage + `teacher_preferences` migration BEFORE any engine/allowlist/CHECK code.**
2. **Reconcile the engine vocabulary to the BUNDLE, not `modes.css`.** The runnable bundle (the
   handoff's behavioral source of truth) uses `data-version`/`ambient` + `data-canvas/veil/dim/mode/zoom`;
   `modes.css` uses `data-frame`/`wash` and is **only ~⅓ of the engine** (frame materials). The
   premium 4-layer photo-grading (auto-luminance/duotone/brightness) lives in `themes.css` keyed on the
   axes `modes.css` lacks. Adopting `modes.css` vocabulary alone **drops photo-grading**. → Standardize
   internally on one axis name (`data-frame ≡ data-version`, choose `data-frame`) but **implement the
   bundle's full axis set + behavior**; port `themes.css` photo-grading, not just `modes.css` materials.
3. **Token migration is MERGE-not-replace + Night must be decomposed.** "Replace `:root` with the v2
   set" deletes ~7 v1-only tiers (`--chrome-accent-*` 23 files, `--scrim*`, `--logo-*`, `--wf-*`/`--teach-*`,
   `--tag-*`, z-scale, geometry) → flag-OFF v1 breaks. And the current `[data-theme="night"]` block fuses
   neutrals + accent + per-subject/tag/hl `color-mix`; v2's `data-tone="dark"` (~5 lines) only covers
   neutrals. → Merge (re-point ~6 shared collisions, ADD new names, **preserve every v1-only tier**); add
   the `--s1..s16` scale; **decompose Night**: neutrals→`data-tone`, accent→`data-theme`, re-key the
   subject/tag/hl recipes onto `data-tone` or dark mode corrupts.
4. **Three-tier forking cue must be carried from CURRENT code.** Absent from the v2 demo (Tier-3
   move-arrow unimplemented; v2 data model has no fork/move state). Schedule it per-frame with a verify
   step; preserve the lesson-level fork state.
5. **Backend is prod-live — EXTEND, don't "complete"/"rewrite".** `planner/supabase-source.ts` (2184
   lines, 84 DB calls, 0 TODO) and `teach/supabase-source.ts` (2450, 100, 0) are shipped + Codex-audited.
   Reword to "extend for net-new tables + finish the client→action seam swap; do not rewrite existing
   methods."
6. **Land data-model migrations BEFORE the net-new surfaces that need them** (not after the engine only).
7. **`NEXT_PUBLIC_*` is build-time-inlined** → rollback is redeploy-gated, no per-user dark-launch.
8. **Additive-token drift** (`--idle` + `--idle-tint`), **keep `next/font`** (don't adopt the v2
   Google-Fonts `@import`), **`data-palette` is a dropped axis** (product decision, not "moved inline").

### 0.2 Where the two plans corrected each other (adopt the correct side)
| Topic | Stale/over-claim | Corrected truth (master-verified) | Source |
|---|---|---|---|
| Default route | B: `/home` is default | **`/weekly`** (`use-account-settings.ts:207`); `/home` not in `DEFAULT_VIEW_ROUTES` | A correct; my audit C2/C3 |
| `/subject` | B: "STILL LIVE, retire it" | **already retired** — redirect shims; `components/subject/` gone; no `SubjectView` | my audit C1 |
| `isSafeUrl`/`isSafeImgSrc` | B: unexported dupes, "promote before Wave 9" | **already exported + shared** in `lib/resource-embed.ts` | my audit C3 |
| `PUBLIC_PATHS` | B: `[login,auth]`, `/welcome` auth-gated | **`[login,auth,welcome]`**; `/welcome` is public | my audit H6 |
| Provider tree | B: 6 providers "verbatim" | **7** — includes `UndoToastProvider` | my audit H7 |
| `getViewMode` | A: bound `getViewMode` | **`viewMode`/`setViewMode`** (type `grid\|list`) | their review (phantom in B too) |
| Backend | A: "complete the source" | **prod-live; extend only** | their review F7 |
| Build state | A: "not standalone-buildable" | **builds clean** (tsc+lint+`next build` green) | their review F13 |
| "Presentation-only" | A: re-skin/preserve presentation | core views (card/Week/Day/Year) are **render RESTRUCTURE** | their review F2/A2 |
| Persistent shell | (both ok) | **already exists** (`app/(planner)/layout.tsx`) — D4's hard part is free | their review |
| themes.css counts | B: "179 `.home[data-version]`" | **12 `data-version="A"`** (no B/C); ~186 `.home`, mostly `data-theme/bg` | my audit C4 |
| Auto-luminance | both: "first photo" | **averages first 6 photos** (`slice(0,6)`) | their review / my audit H9 |

---

## 1. Locked decisions & base

**Base branch = clean `master`** (Plan B's choice; both audits confirm it builds clean). Rationale: the
v2 rebuild **replaces the appearance engine entirely**, so the WIP branch's Wave-1 appearance
consolidation would be discarded by it — building on the WIP wastes the collision. **Forward-port the
WIP's still-relevant non-appearance fixes** into the right waves: the `.cp-root`/`.btn` double-class
rule (already codified in Plan B §2.8), `app/error.tsx`/`not-found.tsx`, and **reconcile the WIP's
`teacher_preferences` theme-sync migration into the single Wave-2 theme migration (§0.1.1)** so the value
space isn't migrated twice.

**Decisions locked (Plan A D1–D5, confirmed by both audits):**
- **D1** Subject map → adopt v2 (Writing→5, Spelling→9, UFLI→2, SEL→12). Safe: color is a derived slug
  (`subjects.color` stores `'writing'`, not a hue) — **no data migration**; it's a **3-site edit**
  (mapping in `palette-data.ts:140-149` + the 4 `--math/reading/science/social` aliases + static
  `.cp-subj`), via the **pure `resolveSubjectColor(id,type,V2_MAP)` resolver** on the v2 path (never
  `useSubjectColor()` which reads context); extend `PaletteCssBridge` to emit **both** `--sc/--sct/--sci`
  and `--c/--cl/--cd`.
- **D2** Engine = `data-frame` naming, **bundle behavior** (per §0.1.2); drop `data-style` **but keep
  `style/palette/setStyle/setPalette` as deprecated compat fields through cutover** (typed-API used by 17
  components; `theme_style` is `NOT NULL DEFAULT 'vivid'` in prod — needs a follow-up nullable/drop
  migration).
- **D3** Teach = keep WIP infra (annotation, fullscreen, intent model), re-skin to v2 slide/resource look.
- **D4** Navigation = keep routing + the **already-existing** persistent non-remounting layout + View
  Transitions.
- **D5** Scope = preserve the data/logic core; **rebuild the view/chrome/appearance layer (render
  restructure, not pure CSS)**; build the net-new surfaces.

**Decisions CONFIRMED (user, this session) — all blocking decisions resolved:**
- **Base = clean `master`** — forward-port only the WIP's non-appearance fixes (`error.tsx`/`not-found.tsx`,
  the `.btn`/`cp-root` rule); discard the Wave-1 appearance work the v2 engine replaces.
- **Theme fold `paper`+`cloud`→`clear`** — migrate `cloud`-persisted users to `clear`; build the v2 7-theme
  set, no 8th theme.
- **Adopt the v2 subject map** — Writing→5 / Spelling→9 / UFLI→2 / SEL→12 re-color team-wide (no data
  migration; color is a derived slug).
- **Rollout = per-wave flag-on-prod, redeploy-gated rollback** — reveal each wave behind `NEXT_PUBLIC_V2`;
  rollback = redeploy (no runtime kill-switch / per-user dark-launch in scope; revisit only if instant
  rollback becomes a hard requirement).

**Remaining minor items (defaulted — flag to change):** `data-style`→frame seeding
(`calm`→glass / `quiet`→paper / `vivid`→color) and dropping `data-palette` proceed as planned (mechanical,
covered by the Wave-2 migration shim); orphan routes default to **defer** the optional ones (`/month`,
`/welcome`, `/archive` → small post-cutover waves or v1-under-flag) and keep `/onboarding` on **v1 under the
flag** until a dedicated wave. None block Wave 2.

---

## 2. Corrected ground-truth baseline (supersedes both plans where they erred)
Use these, not the plans' originals: default `/weekly`; `/subject` retired (verify shims survive);
`isSafeUrl`/`isSafeImgSrc` already the shared sink; `PUBLIC_PATHS=[login,auth,welcome]`; provider tree =
7 (incl `UndoToastProvider`); `viewMode`/`setViewMode` (not `getViewMode`); backend prod-live (extend);
**the WIP base already altered live behavior** (planner +97; teach −68 removed default-team-set auto-seed
— verify that delta vs prod independently); build is clean; `YearView.tsx` is **retired dead code**
(target `TimelineYear`/`RoadmapView`); `--day-count` school-week contract **already exists** (the v2
mockup's hardcoded `repeat(5)` must adopt IT, not the reverse); rotation is config-only (no calendar
read-seam — net-new Phase-1B, nothing to preserve).

---

## 3. Appearance engine (Wave 2) — the most-corrected wave
The critical path. Sequence inside Wave 2:
1. **Theme migration FIRST** — freeze `data-theme` + `data-tone` value lists (resolve bundle-vs-modes.css
   derive-vs-store tone); ship old→new localStorage + `teacher_preferences` migration; reconcile the WIP
   theme-sync migration into it. No engine code before this lands.
2. **Tokens = MERGE** — re-point ~6 shared collisions to v2 values, ADD new names + `--s1..s16`,
   **preserve every v1-only tier**; enumerate each drifted base token (`--idle`/`--idle-tint`) and decide
   per-token (keep v1 value on the OFF path or document the shift). Keep `next/font`.
3. **Engine = bundle vocabulary + full axis set**; port `themes.css` photo-grading (auto-luminance/
   duotone/brightness), not just `modes.css` materials. Re-derive the `.home`→root CSS transform from the
   real file (~186 selectors, mostly `data-theme/bg`; 12 `data-version="A"`; rewrite both `[data-bg=ambient]`
   and `.ambient.t-*`).
4. **Night decomposed** (neutrals→`data-tone`, accent→`data-theme`, subject/tag/hl recipes re-keyed to
   `data-tone`).
5. **Subject map** via pure resolver + dual-emit bridge (D1).
6. **Tone-flash mitigation** — persist tone **per photo-set key**, deterministic first-load default
   (light), and **R2 CORS headers (or server-side luminance at upload)** so `getImageData` can't taint →
   force-dark → AA fail.
7. **Lockstep checklist** = `theme.tsx` guards + `theme-init.tsx` boot arrays + SQL CHECK +
   **`app/layout.tsx` SSR root attrs** + **`scripts/probe-theme-wave.mjs`** (both omitted by Plan A).
8. **Ship `AppearanceControls` + Tooltip/dismissal here** (Plan B §2.9), consumed by Waves 3/8.

---

## 4. The 13-wave spine (Plan B), with corrections folded per wave
1. **Docs** — set the v2 contract (BUILD_STANDARD/CLAUDE/AGENTS).
2. **Appearance engine** — as §3 above.
3. **Shell & navigate-in-place** — corner grammar + segmented console over the **existing** persistent
   layout; rehome RightPanel/todo/comments/schedule; **landing is `/weekly`** (not `/home`); console binds
   **`viewMode`** correctly. Tools dock + 3-layer notifications (separate from `ConsequenceToastProvider`).
   **`PUBLIC_PATHS` baseline already includes `/welcome`.**
3.5 **Home** — `/home` exists as a route but is **not** the default; build it, but drop the "it's the
   landing route, can't be an orphan" justification.
4. **Day** · 5. **Week** · 6. **Year** — **reclassified as render RESTRUCTURE** (inline-style/JS-px/dnd
   DOM welded into TSX); carry the three-tier forking cue per frame from current code; Week derives columns
   from `--day-count`; Year targets `TimelineYear`/`RoadmapView` (Frame C constellation is net-new). **Wave
   6 `/subject` sub-task = just verify the existing redirect shims survive** (don't retire a `SubjectView`
   that's gone).
7. **Lesson Plan** — binds section CRUD + `setSaveTarget`; data-model adds (differentiation/materials/
   per-section minutes+notes/standards `{code,desc}`).
8. **Planner Hub** (NET-NEW) — Hub `.ph-root` **writes its own `data-tone`** (a local writer with a
   formula reconciled to the global writer — not "reads from a shared context"). **Add Wave 8 to the §4a
   gate list.**
9. **Resource Wall** (NET-NEW) — bind the **already-exported** `isSafeUrl`/`isSafeImgSrc` (no "promote"
   step); land ResourceWall types first.
9b. **Share-link system** (NET-NEW, security) — new `PUBLIC_PATHS` entry + read-only path; mandatory §4a +
   claude-login+cookie smoke test.
10. **Catch-Up** — re-skin (current is richer than the demo) + Hub browse area.
11. **Teach** — D3 (keep infra, re-skin); `getActiveGradeLevelId` is on `lib/planner` (teach-flag-ON
   requires planner-flag-ON or it throws on "g5").
12. **Settings/Setup** — full ConfigPage; embeds Wave-2 `AppearanceControls`; `/settings/team`→**307**→
   `/settings/workspace`; `theme_style` column deprecation migration. **Add Wave 12 to the §4a gate list.**
13. **Verification & cutover** — flag flip (redeploy-gated), delete v1, rollback runbook.

---

## 5. Preserve-ledger (Plan B's + the symbols both plans omitted)
Plan B's preserve list, **plus** these real `usePlanner` symbols a v2 screen needs:
`restoreLesson` (the fork-revert gesture — central to the differentiator), `revertPlacement`,
`bumpLesson`, `archiveLesson`/`unarchiveLesson`, `setCellLayout`/`cellLayouts` (Week grid), the full
section-resource set (`editSectionResource`/`removeSectionResource`/`moveSectionResource`), history
introspection (`canUndo`/`historyDepth`/`undoLabel`…), `lastChange` (scroll-after-undo), and
**`useCatalogOptional()`** (the no-provider-safe accessor a Settings/AppearanceControls preview outside
`<PlannerProvider>` must use, or it throws). Grade-uuid gates must run **flag-ON** (two mock `g5` sources
otherwise validate the mock).

---

## 6. Verification, gates & orchestration
- **Both gates (§4a code-review + §4b live QA) on every data/security wave — including Waves 8 and 12**
  (both plans' enumerated lists dropped them).
- **Token-migration-first is a HARD barrier**: serialize edits to `tokens.css` + `components/ui/*` (143
  importers); **no surface fan-out until Phase 0/Wave 2 lands.**
- **Down-scope the per-surface verify gate** from "presentation-scoped diff (no state change)" to "**no
  change to the data/logic core (stores/hooks/types)**" — the strict version false-positives on every
  restructured view.
- **a11y/WCAG gates** (keyboard, focus, contrast — incl. AA on white-text-over-uploaded-photo with a scrim
  floor), **print suppression** (pink glow/`.stage`/`data-veil` under `@media print`), and **rotation
  caveat** (don't assert a calendar read-wire — it's vacuous today).
- **Migration safety/rollback**: additive token rollback (Wave-2 additive), nullable legacy columns through
  cutover, and a **runtime kill-switch decision** (cookie/edge-config) or explicit acceptance that rollback
  is redeploy-gated.
- **Settings-modal**: hard live-QA gate before Wave 2 (it's the surface the rebuild re-skins).

---

## 7. Combined MUST-FIX before coding (union of both audits, deduped)
1. **Theme/tone value lists frozen + old→new localStorage + `teacher_preferences` migration** (reconcile
   the WIP migration into it). *[A-F1 + my audit]* — **the single must-fix-first.**
2. **Engine vocabulary reconciled to the bundle + photo-grading ported** (modes.css is ⅓). *[A-A1 + my H8]*
3. **Tokens MERGE-not-replace + Night decomposed + `--s` scale + per-token drift decisions.** *[my C1 + A-F6/A3]*
4. **Subject map via pure resolver + dual-emit bridge; D1 is 3-site.** *[A-F16/F14 + my H1]*
5. **Keep `data-style` compat fields; sequence card re-skin as a dependency of the drop; `theme_style`
   column migration.** *[A-F3/A4]*
6. **Reclassify card/Week/Day/Year as render restructure; fix the effort split; down-scope the verify gate.** *[A-F2/A2]*
7. **Three-tier forking cue scheduled per-frame, carried from current code.** *[both]*
8. **Tone-flash: per-photo-set tone + first-load default + R2 CORS/server-side luminance.** *[A-F5]*
9. **Backend = extend prod-live sources + client→action seam swap; flag the WIP's live-behavior delta.** *[A-F7/F8]*
10. **Data-model migrations before the net-new surfaces.** *[both]*
11. **Token-first hard barrier; serialize `tokens.css`/`ui/*`.** *[A-F11 + my orchestration]*
12. **Runtime kill-switch decision + a11y gates + migration rollback/safety.** *[A-F10]*
13. **Re-baseline recon to master** (the §0.2 table): `/weekly`, `/subject` retired, `isSafeUrl` exported,
    `PUBLIC_PATHS`+`/welcome`, `UndoToastProvider`, `getViewMode`→`viewMode`, themes.css counts, 6-photo
    luminance, Hub local-tone-writer, gate coverage 8/12. *[my audit]*

---

## 8. Exact-values appendix
Use **Plan B's appendix** (`6.24.26-v2-redesign-plan.md` "Appendix — exact values") — independently
**verified correct** by my audit (subject map, pink glow `#E8179B`, theme accents, tone derivation,
luminance math, frame grids, TWEAK_DEFAULTS, washes, Resource-Wall presets, `#5BA8FF`=Photo accentcycle,
lit-edge register values, `data-bg` split). Apply two corrections: **auto-luminance averages the first 6
photos** (not "the first"); **the bundle sets `data-version`/`ambient`** (canonicalize to `data-frame`/
`wash` in the port, framed as "adopt modes.css over the bundle," not "the bundle uses wash").

---

> **Net:** Plan B supplies the executable spine, exact values, and deep engine/route detail; Plan A
> supplies the master-accurate baseline and the correct backend/build framing; the two audits converge on
> one Critical (theme migration) and a tight High set (engine-to-bundle, token-merge/Night, forking cue,
> render-restructure, backend-extend, tone-flash). Resolve §7 and this is execution-ready off clean `master`.
