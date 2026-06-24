# Adversarial Audit — `6.24.26-v2-redesign-plan.md` (terminal plan)

> **Auditor:** independent cloud session (did not author the plan). **Method:** every load-bearing
> claim re-verified against real `origin/master` (extracted tree, 2,067 files) and the v2 handoff
> (`claude/design-handoff-v2-site`), by 5 parallel verification agents across the 5 audit lenses.
> Claims were NOT trusted; files were opened and cited. **Date:** 2026-06-24.
>
> **Verdict: GO-WITH-CHANGES — but NO-GO if executed literally as written.** The plan's
> architecture, wave sequencing, invariant-awareness, and v2 *design* fidelity are strong
> (subject map, theme accents, pink-glow values, washes, frame grids, TWEAK_DEFAULTS, Resource-Wall
> presets, and full surface coverage all verified **correct**; the rotation-read-seam analysis is
> exemplary). But its **repo recon is stale** — it describes an older repo state than `master` — and
> its **central token-migration instruction (§2.1) is a destructive swap, not the additive merge the
> strategy promises.** Four Criticals and a cluster of Highs must be fixed before any wave executes.

---

## 0. Root cause behind most findings: STALE RECON

Five of the most serious findings are the same failure mode — the plan's reconnaissance reflects a
repo state that `master` has already moved past (the plan even distrusts the *correct* "merged to
prod" memory and sides with the stale state). The plan states it builds "off clean `master`" (§0.1),
so `master` is the correct base to verify against, and these are real errors to fix — **re-baseline
the entire recon against `master` before Wave 1.** (If the plan author was on a divergent working
branch, that divergence is itself a must-resolve: pin one base.)

Stale-recon inversions: `/subject` (already retired), default route (`/weekly` not `/home`),
`isSafeUrl` (already exported), `PUBLIC_PATHS` (already includes `/welcome`), `DEFAULT_VIEW_ROUTES`
(no `/subject`; migration shim already present).

---

## 1. CRITICAL

### C1 — §2.1 "Replace `:root` with the verbatim v2 token set" is a DESTRUCTIVE swap; it deletes ~7 v1-only token tiers and breaks flag-OFF v1
**Plan:** §0.1 (additive/"v1 stays green") vs §2.1 ("Replace `:root` with the verbatim v2 token set," enumerating only v2 tiers).
**Verified (master `app/tokens.css` + v2 `colors_and_type.css`):** the v2 source has **none** of these v1 tiers, and §2.1 would drop them: `--chrome-accent-*` (**23 files**, the tier CLAUDE.md §4 mandates over raw `--brand-*`), `--rail-bg`/`--panel-bg` (10), `--logo-*` (8), `--core-mode*` (12, the master-banner pink), `--scrim*` (12, every modal backdrop), `--wf-*` (16) + `--teach-*` (9, the entire Teach board appearance system), plus `--tag-*`, `--hl-*`/`--hlp-*`, `--board-tint-*`, `--urgent/important/fyi/catchup`, `--z-*`, `--topbar-h`.
**Failure scenario:** flag-OFF v1 renders with unstyled chrome, transparent modal backdrops, no logo, broken Teach boards — the exact opposite of the rollback guarantee the whole flag strategy depends on.
**Fix:** rewrite §2.1 from "replace `:root`" to **"merge"**: re-point the ~6 genuinely-shared collisions to v2 values, ADD all new v2 names, and **preserve verbatim every v1-only tier.** This is the single most dangerous instruction in the plan.

### C2 — `/subject` is ALREADY retired; the Wave-6 preserve/retire sub-task and "Finding K" are phantom work
**Plan:** glossary L76, §0.2 Wave 6, §3.4, §6 L552–556, §2.6 "Finding K" — all assert `/subject` + `SubjectView` + `components/subject/` (6 files) are "STILL LIVE on this branch."
**Verified (master):** `app/(planner)/subject/page.tsx` is a `redirect("/year")` shim; `[slug]/page.tsx` redirects to `/year?subject=<slug>` (header: "merged into the Yearly view"); **`components/subject/` does not exist**; no `SubjectView` anywhere. `DEFAULT_VIEW_ROUTES` (`lib/use-account-settings.ts:202`) = `["/weekly","/daily","/year"]` (no `/subject`); the `/subject→/year` default-view migration shim already exists at `:212–213`. "Finding K"'s claim that line 207 lists `/subject` is false (207 is `DEFAULT_DEFAULT_VIEW`).
**Failure scenario:** Wave 6 budgets a sub-task (retire `SubjectView`, write a deep-link regression test) for code already shipped; an executor hunts for nonexistent files.
**Fix:** strike the "/subject not merged" claims everywhere; reframe Wave 6 as "verify the existing `/subject`→`/year` redirect shims survive the shell rewrite." Delete "Finding K."

### C3 — Default landing route is `/weekly`, NOT `/home`; the navigate-in-place "from a Home console" premise is inverted
**Plan:** L209–212 "Correction (a-1)", §0.2 Wave 3.5, §3.4 L490, §X — assert default is `/home` and attribute `DEFAULT_DEFAULT_VIEW="/home"`.
**Verified (master `lib/use-account-settings.ts`):** `:207` `DEFAULT_DEFAULT_VIEW = "/weekly"`; `/home` is **not** in `DEFAULT_VIEW_ROUTES` (not a selectable startup route); `app/page.tsx` → `readDefaultView()` falls back to `/weekly`. (`/home` the *route* exists, but it is not the landing.)
**Failure scenario:** the Wave-3.5 promotion ("Home cannot be an orphan because it's the landing route") and the navigate-in-place rationale rest on the opposite of reality; a teacher with no stored pref lands on `/weekly`.
**Fix:** correct every "/home is the default" statement; either make `/home` the default as an explicit, called-out behavior change, or re-found the navigate-in-place premise on `/weekly`.

### C4 — The `themes.css` selector counts driving the Wave-2 CSS reframe are fabricated (off ~15×; the B/C variants don't exist)
**Plan:** §0 banner L24–28, glossary L71, §2.2 L256–263 — "themes.css is **179** `.home[data-version="A|B|C"]` selectors (0 bare-root)."
**Verified (handoff `design-system/themes.css`, identical to `source/themes.css`):** `data-version` appears on **12 lines, all `="A"`** (`:386–408`); **zero** `="B"`/`="C"`. The file is overwhelmingly scoped by `data-theme`/`data-bg` (`data-bg` ~85×), with ~186 `.home`-prefixed selectors total. The "0 bare-root" half is correct.
**Failure scenario:** §2.2's "rewrite every `data-version="A|B|C"`" finds only 12 `="A"` lines and misses the bulk of the real `.home`→root rewrite; the promised A→glass/B→paper/C→color mapping has no B/C rules to map.
**Fix:** re-derive from the real file — "~186 `.home`-prefixed selectors, predominantly `data-theme`/`data-bg`-keyed, plus 12 `data-version="A"` lines (no B/C present)."

---

## 2. HIGH

### H1 — Subject-map gating mechanism is self-defeating as written
**Plan §2.5:** v2 path "assigns `--sc/--sct/--sci` inline **from `useSubjectColor`**."
**Verified (`lib/palette.tsx`):** `useSubjectColor` reads the mapping from `PaletteContext` — i.e. the **flag-OFF** mapping. It takes no mapping argument. So v2 components calling it get the v1 map, not §4; and mounting a 2nd `PaletteProvider` with the §4 map re-emits global `.cp-subj` rules via a 2nd `PaletteCssBridge` that recolors flag-OFF v1 (last-wins). The *separability the plan bets on is real*, but only via the **pure `resolveSubjectColor(id, type, V2_MAP)`** resolver.
**Fix:** §2.5 must specify the v2 path uses the pure resolver with an explicit V2 mapping — never `useSubjectColor()` (context) and never a second bridge-mounting provider.

### H2 — `--idle` re-point is a real flag-OFF v1 regression
v1 `--idle:#b6b5c6` (light grey, `tokens.css:252`) → v2 `#6E6C82` (mid-violet). Singular `:root` ⇒ shifts flag-OFF v1 immediately. Concrete darkening: `year/UnitBar.module.css:230`, `grid/lesson-chip.module.css:122`, `appearance/settings-card.module.css:203`, `catchup/CatchupScreen.module.css:137`, et al. **Fix:** keep `--idle` at the v1 value on the OFF path, or document the shift in Decision #1. (The plan's blanket "collisions v1 tolerates" is unverified per-token; `--idle` falsifies it.)

### H3 — Font tokens are not verbatim-portable
v1 `tokens.css:23–34` uses `var(--font-poppins), …` (the **next/font** vars injected by `app/layout.tsx`). v2 `colors_and_type.css:114–118` hardcodes families + a Google-Fonts `@import`. A verbatim port drops next/font (self-hosted, CSP-clean) and loses `--font-quicksand`/`--font-caveat` (used by `lib/teach/widget-theme.ts`). **Fix:** keep v1's `var(--font-*), "Family"` indirection.

### H4 — `useAppState().getViewMode` is a phantom bind
**Plan §4 / §3.2** bind `getViewMode`. **Master (`lib/app-state.tsx`):** no such symbol — the real API is `viewMode`/`setViewMode` (type `"grid"|"list"`, `:47,197–198`). A console calling `getViewMode()` crashes / fails tsc. **Fix:** use `viewMode` (a value); note it's the Grid/List toggle, unrelated to the console "which view" — do not conflate.

### H5 — `isSafeUrl`/`isSafeImgSrc` are already exported & shared; the Wave-9 "promote" prerequisite would churn an audited XSS sink
**Plan §9 / §(d):** "`isSafeUrl` not exported, duplicated file-locally … promote before Wave 9." **Master:** `lib/resource-embed.ts:324` `export function isSafeUrl`; `:347` `export … isSafeImgSrc`; `ResourceEmbed.tsx`/`ResourcePreview.tsx` **import** it; `isSafeImgSrc` is **not** in `sanitize-html.ts`; `LessonPhasePanel` does not exist. **Fix:** delete the prerequisite; the canonical sink already exists. Only residual: one local `safeHref` copy in `UnitDrawer.tsx:288` (optional consolidation). Do not refactor a working security sink on a false premise.

### H6 — `PUBLIC_PATHS` already includes `/welcome`; `/welcome` is public (contradicts §X)
**Master `lib/supabase/middleware.ts:26`:** `PUBLIC_PATHS = ["/login","/auth","/welcome"]` (signed-out `/` → `/welcome`). Plan §3.4 says 2 entries; §X calls `/welcome` "auth-gated, NOT in PUBLIC_PATHS." **Fix:** correct the baseline; reclassify `/welcome` as already-public. Matters because Wave-9b's "first time we touch PUBLIC_PATHS" security framing must start from the true set.

### H7 — §3.5 "PRESERVE VERBATIM" provider tree drops `UndoToastProvider`
**Master `app/(planner)/layout.tsx:39–61`:** `AppState → Notebook → Planner → ConsequenceToast → **UndoToastProvider** → UnitNotes → Catchup`. The plan's "verbatim" tree omits `UndoToastProvider` (between ConsequenceToast and UnitNotes). An executor recreating the 6-provider tree breaks `useUndoToast` consumers. **Fix:** add it in its real position (7 providers).

### H8 — The bundle sets `data-version` + `data-bg="ambient"`, not `data-frame`/`wash` (plan's "bundle uses wash" is false; internal contradiction)
**Handoff `source/app.jsx:499`:** root sets `data-version={effVersion}` and `data-bg={ambient?'ambient':'photo'}`. The bundle never sets `data-frame` or `wash`; those live only in `modes.css`/the Framework. The plan's glossary/§2.2/§2.4 say "bundle uses wash," while its own Appendix (L713–717) uses "ambient." **Fix:** frame the canonicalization as "adopt `modes.css`'s `wash`/`data-frame` over the bundle's `ambient`/`data-version`," and reconcile the internal ambient/wash inconsistency. (The data-bg counts the plan cites — `themes.css` `data-bg="ambient"`=3, `modes.css` `wash`=46 — are themselves correct.)

### H9 — Auto-luminance averages the FIRST 6 photos, not "the first photo only"
**Handoff `app.jsx:470`:** `Promise.all(photoList.slice(0,6).map(measureLum))` → average. The plan §2.7/Appendix says "first active photo only / photo #1." (The "not per 7000ms tick" half is correct — deps `[photoList.join('|'), photoShowing]`.) **Fix:** "averages luminance across the first 6 selected photos, once per photo-set change."

### H10 — Hub nested-root tone mechanism is mis-specified (a 2nd writer with a divergent formula)
**Plan §8:** the Hub "reads tone from a shared context, does not run a second luminance writer." **Handoff `source/hub.jsx:91,346`:** `.ph-root` **re-derives tone locally** (`night ? dark : (bg==='photo' && frame==='A') ? dark : light`) and writes `data-tone` directly — a *second* tone writer, with a **simpler formula that diverges** from the global `night/photoBright/photoShowing+luminance` writer (a photo-bright case the global calls `light`, the Hub calls `dark`). No shared tone-context exists to "read from." **Fix:** specify `.ph-root` writes its own `data-tone`; reconcile its formula with the global writer or document the divergence as intentional.

### H11 — Forking glow has NO master implementation to "preserve"; the lockstep is net-new (highest residual risk)
**Verified:** master signals Master mode via the red `MasterBanner`, not a `[data-mode="team"]` glow; there is **no `[data-mode]` forking seam** in master (`.frame`/`.modesw`/`.pl-head` glow classes don't exist), and the write path (`saveTargetRef→"core"`, `planner-store.tsx:2007`) is **fully decoupled** from any visual signal. The plan correctly self-flags this (§2.4) — but it must be reclassified from "preserve" to **"build from scratch in Wave 2/3,"** and the §4 lockstep trace (`editMode→data-mode→glow→SaveTarget`) verified per wave. Risk: "looks Personal, writes Team."

---

## 3. MEDIUM

- **M1 — `data-bg` ambient rewrite scope too narrow.** §2.2 says rewrite "3 occurrences" of `ambient`; the handoff `themes.css` also has the `.ambient.t-*` **class** wash-palette selectors (total `ambient` ≈12) — the plan's own Appendix wash table calls them `.ambient.t-*`. The port must rewrite both the `[data-bg="ambient"]` attribute form (3) AND the `.ambient.t-*` class form, or the wash palettes go unmatched.
- **M2 — Two mock `g5` sources ⇒ grade-uuid gates pass vacuously.** `useNotebookState()` returns `gradeLevelId:"g5"` (`notebook-state.tsx:75`) **and** the planner catalog returns `activeGradeId:"g5"` (`planner-store.tsx:684,1941`) under flag-OFF. The real uuid resolves only via `plannerClient.getActiveGradeLevelId` under flag-ON. Any "real grade uuid" gate must run flag-ON or it validates the mock.
- **M3 — Rotation calendar read-wire is net-new, not preservable.** `use-my-schedule.ts` is weekday-indexed with zero rotation awareness; `useScheduleRotation` is config-only. The plan is **correct** to flag this (its strongest analysis), but its invariant-(c) "rotating schedules" coverage should state plainly that wiring rotation into a calendar read is **net-new Phase-1B work** — there is nothing to "preserve."
- **M4 — Light-glass recipe conflated.** Appendix/§2.2 cite light glass as `rgba(255,255,255,.66)`+`blur(18px) saturate(1.2)`. Real: `.fr-chrome` light = `.66`/`blur(22px) saturate(1.25)` (`modes.css:123,164`); `glass-light` main = `blur(34px) saturate(1.7)` (`:194`). No surface pairs `.66`+`blur(18px) saturate(1.2)`. (The dark recipe `.16`+`blur(18px)` IS correct.)
- **M5 — Gate-coverage list omits Waves 8 & 12.** §4–12 intro says every per-screen wave "runs both gates," but the §13 enumerated §4a list is `4/5/6/7/9/9b/10/11` — drops Wave 8 (Hub) and Wave 12 (Settings, which binds settings-write hooks + the `teacher_preferences` migration). Add them or state the exemption.
- **M6 — Buttons/`CANVAS_VALUES` allowlist is internally out of lockstep.** §2.3 `CANVAS_VALUES=['glass-dim','glass-light','min']` excludes the Buttons-axis values (`light|dark|console`), while §2.9 leaves "if it persists, allowlist it" unresolved and notes `TWEAK_DEFAULTS` persists `viewStyle:'console'` (so it DOES boot/persist). Resolve as a decision-register item; as written the plan violates its own ALLOWLIST LOCKSTEP.
- **M7 — `/settings/team` destination unstated.** The 307 claim is correct (`redirect("/settings/workspace")`, App-Router default; the layout's "308s" comment is indeed stale). But the plan never states the destination is `/settings/workspace` — a deep-link regression test needs it.
- **M8 — `getActiveGradeLevelId` ownership inconsistency.** It lives on the **planner** source (`lib/planner/*`), not `lib/teach/*` as the Wave-11 binds list implies. (The teach-flag-ON + planner-flag-OFF failure the plan describes IS real: `supabase-source.ts` `resolveGradeId` throws on non-uuid "g5".)
- **M9 — Post-segment divergence from the bundle (defensible, flag it).** The plan's 5-segment console (Day/Week/Year/Lesson/Teach, Post as launcher) follows V2 Framework §9, but the runnable bundle (`app.jsx:13`) ships **6** segments incl. Post. Since the plan's own authority chain ranks the bundle as ground-truth for behavior, demoting Post should be documented as an intentional deviation, not "per §9."
- **M10 — Preserve-ledger omits ~18 real `usePlanner` symbols a v2 screen needs:** `restoreLesson` (the fork-revert gesture central to the forking model), `revertPlacement`, `bumpLesson`, `archiveLesson`/`unarchiveLesson`, `setCellLayout`/`cellLayouts` (Week grid), the full section-resource set (`editSectionResource`/`removeSectionResource`/`moveSectionResource` — plan lists only `addSectionResource`), history introspection (`canUndo`/`historyDepth`/`undoLabel`…), `lastChange` (scroll-after-undo), and **`useCatalogOptional()`** (the no-provider-safe accessor a Settings/AppearanceControls preview outside `<PlannerProvider>` must use, or it throws).

---

## 4. LOW
- **L1** — §2.10 over-lists `rich-text-editor` (and global-shortcuts) as theme-compat consumers; they use a local `setPaletteOpen`, not `useTheme()`. The core "retain compat fields till Wave 13 or tsc breaks" claim is **correct** (verified: command-palette/style-picker/palette-toggle/etc. do read them).
- **L2** — `/boards` route exists in master (`app/(planner)/boards/page.tsx`) but is not named in the §X orphan-disposition table (maps to Wave 11 implicitly). Minor gap.

---

## 5. Verified SOUND (do not re-litigate in the merge)
**Design fidelity:** subject→slot map (all 8 exact), pink-glow values, the 6 theme accents, tone-derivation formula, luminance math (32×32, Rec-709, >0.6), photo cycle 7000ms, frame grids, `TWEAK_DEFAULTS`, lit-edge register-dependence, `#5BA8FF`=Photo accentcycle (not a competing Clear base), `data-bg` split (ambient 3 / wash 46), `data-frame≡data-version` per §9, modes.css bare-root (135 `data-frame`, 0 `.home`), Resource-Wall 6 preset names verbatim, and **full v2 surface coverage** (every surface in `source/`/`specs/`/bundle is assigned a wave; none omitted).
**Backend:** `usePlanner` surface; **no** `createLesson`/`listLessons`; completion-never-forks (`setLessonStatus` threads no SaveTarget); `EditMode`/`SaveTarget` value spaces; app-state RightPanel fields; schedule hooks; **rotation config-only / no calendar read-seam** (exemplary); `NEXT_PUBLIC_V2` genuinely net-new + build-time-inlined (rollback honestly stated as redeploy-gated, never "instant"); backend flags; standards seam (`getEffectiveFrameworkIds` async server fn, no `useEffectiveFrameworkIds`; `Lesson.standardIds` uuid); teach symbols (`teachClient`/`MAX_BOARDS_PER_TEACHER`/`BoardCapError`/etc.); middleware Claude-bypass-first order; API routes; route existence (`/month` correctly absent); 307 settings redirect; `/invite/[token]` disposition; the "delete compat fields → tsc breaks" mitigation; no genuine sequencing forward-reference violations; wash-gradient table fully inlined (executable from doc alone).

---

## 6. MUST-FIX before executing (prioritized)
1. **§2.1: change "replace `:root`" → "merge + preserve every v1-only tier."** (C1 — would break prod v1 on flag-OFF.)
2. **Re-baseline the recon against `master`:** `/subject` retired (C2), default route `/weekly` (C3), `isSafeUrl` already exported (H5), `PUBLIC_PATHS` incl `/welcome` (H6), provider tree incl `UndoToastProvider` (H7), `getViewMode`→`viewMode` (H4), drop "Finding K."
3. **Re-derive the §2.2 CSS-reframe** from the real `themes.css` (C4 + M1): ~186 `.home`/`data-theme`/`data-bg` selectors + 12 `data-version="A"` (no B/C); rewrite both `[data-bg=ambient]` and `.ambient.t-*`.
4. **Fix the subject-map mechanism** to the pure `resolveSubjectColor(id,type,V2_MAP)` resolver (H1); keep `--idle`/fonts off the destructive path (H2/H3).
5. **Reclassify the forking glow as build-not-preserve** with a per-wave lockstep gate (H11).
6. **Correct the design misreads:** bundle uses `data-version`/`ambient` (H8), auto-luminance = 6-photo average (H9), Hub writes its own divergent `data-tone` (H10), light-glass blur values (M4).
7. **Close the smaller gaps:** add Waves 8/12 to the gate list (M5), resolve the Buttons allowlist (M6), add the ~18 forgotten `usePlanner` symbols (M10), flag the Post-segment deviation (M9), grade-uuid gates run flag-ON (M2).

**Bottom line:** an unusually thorough, self-aware plan whose *design* reading and *sequencing* are largely correct, but whose *repo recon* is a release behind and whose *token-migration step contradicts its own additive strategy*. Fix C1–C4 + the Highs and it is executable; ship it as-written and flag-OFF v1 breaks on day one of Wave 2.
