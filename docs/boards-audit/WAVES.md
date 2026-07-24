# Teach / Learning Boards — Redesign Goal, Context & Per-Wave To-Do

_Companion to `PLAN.md` (which holds the 48 findings + 33 improvements + the why).
**This file is the build contract:** the success goal, the original context, the 10
non-negotiable features, and a detailed, checkbox-tracked to-do list for every wave.
Generated 2026-06-13._

---

## 0. Goal for success (definition of done)

The redesign is **done** only when ALL of the following hold:

1. **The 10 non-negotiable features (§2) are present and working** — not stubbed, not
   "coming soon".
2. **No crowding.** A board **opens clean, clear, and well-organized**, with the focus
   on the **teaching / content — NOT** a wall of menus and UI. (Today: 82 visible
   buttons, ~768px of chrome, board surface a minority of the viewport. Target: the
   board surface dominates; chrome is minimal and single-purpose; nothing opens unless
   asked for.)
3. **≥20 problems found** (done: 48) and **≥20–30 improvements defined** (done: 33),
   then **built, tested, and implemented with no errors, bugs, omissions, or gaps.**
4. **Every wave passes the verification gate (§6):** `lint` + `tsc` + `build` green;
   responsive at 390 / 768 / 1280; all 6 themes; the §4a code-review gate; and a live
   QA pass in a real browser.

---

## 1. Context — what these boards are

`mycurricula.app` has a **learning-board** surface (the `/teach` workspace). A board is
where a teacher can:

- pull in resources and **write/annotate** on them,
- drop in **widgets** during a lesson (timer, agenda, etc.),
- **attach the board to a lesson or a lesson phase**, or keep it **untagged** as scratch
  paper,
- build **multiple pages** in one board,
- pick **paper backgrounds** (Cornell, grid, handwriting, …),
- have the board **count as a resource** and show in resource lists,
- **open any notecard / resource card into a board**.

**The problem (owner's words):** the board UI/UX is *"extremely bad — crowded, too many
things open at once. The board options like the board theme is not placed well and don't
work. Many other problems as well."*

**The solution:** an exhaustive audit of the code + live function and every connection
(lessons, tags, resources, the board-selection page, units, phases, the resource pane,
present mode), a complete problem/improvement list, and a **waved** rebuild — **hybrid**
(rebuild the shell/chrome/IA, keep/refit the widget + data logic) — built with agent
teams and tracked by this exhaustive to-do list.

---

## 2. The 10 non-negotiable design features

These are the **must-haves**. (The owner listed 11 line-items and calls them "the 10" —
kept verbatim; #10 carries the owner's later revision.)

1. **Insert resources + write/type** on a board.
2. **Insert widgets** during a lesson.
3. **Attach a board to a specific lesson and/or lesson phase.**
4. **Multiple pages** within a board.
5. **Annotate** with markup / text / shape tools.
6. **Scratch boards** — boards tied to no lesson.
7. **Different backgrounds** — colors + paper styles (Cornell notes, checkered/grid,
   handwriting paper, …).
8. **Tagged to lessons/phases OR untagged** and living on a **Boards page**.
9. **A board counts as a resource** and is added to the resource lists.
10. ~~A board is created any time a lesson is presented.~~ **REVISED (owner):** a board
    is **created only on an explicit action** (opened, added as a resource, attached to
    a lesson/phase, or created from the Boards page). **Presenting + writing does NOT
    create a board** — at the end of presenting, **prompt "Save these annotations?"**
11. **Any notecard / resource card can be opened into a board** (creating/opening one).

> Open-behavior rule (owner): a board **opens blank** UNLESS it was opened **from a
> resource** ("open in board" → contains that resource) or it is a **saved board /
> board template** (→ loads its content). **Board templates** are first-class.

---

## 3. Finalized direction (the 22 answers — full detail in `PLAN.md` §0)

Worst clutter = left rail + widget pickers + top/sub bars (right panel OK) · present
hides **all** chrome · **one** "Board appearance" popover (size+paper+theme) · **full**
paper set · **board paper defaults to WHITE** · background **per-page AND per-board + a
default** · target = projector + touch, students display-only · **hybrid** look (themed
chrome, neutral board) · boards default **lesson-level**, phase only when explicitly
phase-tagged / created from a phase add-button · tagged board shows in lesson Resources +
unit list + Boards page · "open in board" **asks each time**, resources **linked but
detachable** · widgets **tiered to a CORE 6** (timer, agenda, learning-target,
directions, groups, name-picker) and **the board opens with NO widgets visible — they
appear only on "Add widget"** · pages = **thumbnail filmstrip** · **full** annotation
set everywhere · **WIRE SUPABASE NOW** · incremental PR per wave · no deadline ·
references: Classpoint/Curipod, Padlet, Jamboard/Freeform.

---

## 4. Must-have → wave coverage map

| # | Non-negotiable | Wave(s) |
| --- | --- | --- |
| 1 | Insert resources + write | W1 (clean), W3 (open-in-board), W4 (annotate) |
| 2 | Insert widgets mid-lesson | W1 (one Add, core-6, opens-empty) |
| 3 | Attach to lesson / phase | W3 |
| 4 | Multiple pages | W2 (filmstrip + delete/reorder/rename) |
| 5 | Annotate (markup/text/shape) | W4 (full set everywhere) |
| 6 | Scratch boards | W3 (Boards page + wire scratch engine) |
| 7 | Backgrounds + paper styles | W2 |
| 8 | Tagged or untagged + Boards page | W3 |
| 9 | Board counts as a resource | W3 |
| 10 | Explicit creation + save-prompt | W1 (no auto-seed), W4 (save prompt) |
| 11 | Notecard/card → board | W3 |
| — | No crowding / clean open | **W1** (the core declutter) |
| — | Persistence | W5 (Supabase) |

---

## 5. Per-wave to-do

> Convention: each wave = **one PR**, and every wave ends with the **§6 verification
> gate**. `[x]` = done, `[~]` = in progress, `[ ]` = to do.

### Wave 0 — Stabilize (foundation)

- [x] Fix `/teach` HTTP 500 — `mockTeachSource` circular-import TDZ → `lib/teach/constants.ts` leaf.
- [x] 6-agent code audit → `docs/boards-audit/01..06-*.md`.
- [x] Live Chrome/Playwright pass → `docs/screenshots/boards-audit-live/` (before-shots + metrics).
- [x] Synthesize findings + plan → `PLAN.md` (48 problems, 33 improvements).
- [x] Requirements Q&A (22 answers) captured into `PLAN.md` §0.
- [ ] Land a clean dev-server baseline (detached on :3014) for live verification each wave.

### Wave 1 — Declutter + IA (the "clean board" PR)

**Goal:** the board opens clean and content-first; chrome is minimal and single-purpose.

Chrome
- [~] Remove all **SOON stubs** from chrome — `TeachTopBar` (Search / quick-add / bell **done**), `TeachSubBar` (Week / Subject / Pop-Out / Duplicate), `ToolDock` "Soon" tiles.
- [ ] **Collapse to ONE top bar** — fold `TeachSubBar`'s real controls (board tabs, Add Board, ⚙ appearance, Present, Full Screen, Library) into a single bar / a slim board toolbar; delete the duplicate command strip. Files: `chrome/TeachTopBar.tsx`, `chrome/TeachSubBar.tsx`, `TeachWorkspace.tsx:1179-1214`, `chrome/TeachChrome.module.css`.
- [ ] **Slim the footer** — drop the module-dots / board-count / shortcut echoes that duplicate the rails + Help. `chrome/TeachFooter.tsx`.

Panels & rails
- [ ] **One mutually-exclusive left panel** — opening a module closes the others; no 3–7 simultaneous tabs. `left/TeachLeftPanel.tsx`, `left/TeachLeftRail.tsx`, `left/PanelAddMenu.tsx`, `TeachWorkspace.tsx:1219-1249`.
- [ ] **Consolidate "Tools"** — remove the 5–6 duplicate Tools entry points down to one. `left/modules/ToolsModule.tsx`, `PanelAddMenu.tsx:34`, `right/TeachRightPanel.tsx`.
- [ ] Keep the **right panel** (owner says it's fine) — just ensure it's collapsed by default on open.

Board surface (the star)
- [ ] **Delete the dead second board system** — `TeachingBoard` grid + `WidgetPicker` + `WidgetSettingsPopover` + `FocusMode` + `WidgetShell` + the `layout` reducer (BoardEditor always wins). `TeachWorkspace.tsx:1311-1323` + imports `:83-88`.
- [ ] **Board opens CLEAN** — a clear empty state when no board is open ("No board yet — start blank, open from a resource, or pick from the Boards page"); **no widgets visible** until "Add widget".
- [ ] **Remove the auto-seed** of a default 5-phase board set on lesson-open (`mock-source.ts:213`, `supabase-source.ts:850`) — boards exist only on explicit action (#10).
- [ ] **Present mode hides ALL editing chrome** → board + one minimal floating toolbar (verify `TeachWorkspace.tsx:1118` `BoardFullscreen`; remove the second/duplicate drawing dock). Files: `board/fullscreen/BoardFullscreen.tsx`, `annotation/ToolDock.tsx`.

Appearance (fix "doesn't work")
- [ ] **BoardEditor must READ `board.background`** (currently hard-coded `editor.module.css:196-200`) — one source of truth, **board paper defaults to white**.
- [ ] **One "Board appearance" popover** on the board toolbar (size + background + theme placeholder); delete the 3 divergent systems (editor hard-code / `BoardSettingsPopover` / `BoardFullscreen` local state). Files: `board/editor/BoardEditor.tsx`, `board/editor/AppearancePanel.tsx`, `board/BoardBackgroundPicker.tsx`, `board/BoardSettingsPopover.tsx`.

Widgets (clean-board rule)
- [ ] **One canonical "Add widget"** inserter (replace the 3 add paths) — a single searchable picker via a persistent "+", **core 6 shown** (timer, agenda, learning-target, directions, groups, name-picker), the rest under **"More"**. Files: `widgets/catalog.ts`, `library/WidgetLibrary.tsx`, `TeachWorkspace.tsx` add-widget flow.
- [ ] **Collapse widget duplicates** — 12 alias ids + 4 timers → 1, dup objective/notes/points/tally. `widgets/WidgetBody.tsx:88-125`, `catalog.ts:276-307`.
- [ ] **Tile actions on hover/focus only** (not 5 always-visible icons). Live-board tile rendering in `BoardEditor`.

**Acceptance:** board opens to a clean surface with the board dominant; ≤1 top bar + 1 board toolbar; no SOON stubs; one panel at a time; present = board + 1 toolbar; appearance popover visibly changes the board; widgets hidden until Add. Verified at 3 widths × 6 themes.

### Wave 2 — Board model: sizes, pages, paper, open-blank, templates

- [ ] **Board SIZE** field (A4 / A3 / 16:9) on `Board` + a size-derived stage; fit-to-viewport with zoom (use `ZoomPanCanvas`, drop the fixed 1180×840). Switchable in the appearance popover. `lib/types.ts:555`, `editor.module.css:206-211`, `lib/teach/backgrounds.ts`.
- [ ] **Paper styles** in `backgrounds.ts`: blank, solid colors, lined, grid/checkered, dot, Cornell, handwriting (3-line). **Per-page AND per-board + a board default** (owner). Render them in `BoardEditor`.
- [ ] **Multi-page UI** = bottom **thumbnail filmstrip** (hidden until 2+ pages): add / **delete / reorder / rename** (data layer already supports delete/reorder — `mock-source.ts:964-992`). `BoardEditor.tsx:96-97,809-817`.
- [ ] **Open-blank rule** — board opens blank UNLESS opened from a resource (seed it) or it's a saved board/template (load it).
- [ ] **Board templates** — create-from-template + save-as-template; a small starter set.
- [ ] Data shapes: add `size`, per-page `background`, `templateId` semantics (see W5 for persistence).

**Acceptance:** can set A4/A3/16:9; pick any paper per page and per board; add/delete/reorder/rename pages via filmstrip; new boards open blank; save + reuse a template.

### Wave 3 — Boards page + resources + linkage

> RE-SCOPED 2026-06-14: the "Replace Teach with Boards" decision inserted a NEW
> Wave 3 (IA consolidation), so the items below shipped across the consolidation
> wave + Wave 4 (split into 4a/4b). Original numbering kept; status annotated.

- [x] **Dedicated `/boards` page** — SHIPPED (consolidation Wave 3, **PR #37**): `/boards` route + nav + `BoardsHome` lifting `BoardLibraryModule`; `createBlankBoard`/`keepBoard` wired ("New board").
- [x] **Board-as-resource** (#9) — SHIPPED (**Wave 4a, PR #38**): `boardId` on LessonResource + `"board"` TeachResource kind + `boardToTeachResource`; surfaced in the **Teach Resources panel + daily Resources panel**. (Subject/unit table + lesson-flow chips deferred — documented in the PR.)
- [x] **Notecard / resource card → board** (#11) — SHIPPED (**Wave 4b, PR #39**): `lib/teach/open-in-board.ts` + `OpenInBoardDialog` (ask each time: new board / add to existing) wired into the daily `ResourcesPanel` kebab (covers resources + notecards there). Standalone notecard components + lesson-flow tiles deferred (documented).
- [x] Placed resources **linked but detachable** — SHIPPED (**Wave 4a**): `embedResourceAtCell` records `sourceResourceId` on the embed config; snapshot still renders (detach-safe). Full live-resolve deferred.
- [x] **Lesson AND/OR phase linkage** (#3) — SHIPPED (**Wave 4b, PR #39**): validated phase `<select>` in `BoardTagPicker` driven by `phasesForLesson(getSections)` + orphaned-phase chip flag in `BoardTagChips`. Also re-wired `BoardTagPicker` into `BoardSettingsPopover` (it was dead code — restores the tag editor #8 too). `lib/teach/lesson-phases.ts`.
- [x] Remove the dead `favorites`/`archived` library scopes — SHIPPED (consolidation Wave 3, PR #37).

**Acceptance:** a real Boards page exists + is navigable ✓; a board shows up as a resource (daily + Teach) ✓; any card opens into a board (asking first) — 4b; phase tagging validates — 4b.

### Wave 4 — Annotation + present-save

> RE-SCOPED 2026-06-14: split into **Wave 5a** (present save/restore + ink
> correctness — SHIPPED PR #40), **Wave 5b₁** (toolbar-source unify + present
> parity [shapes/width] + canvas perf + auth-race — SHIPPED PR #42), and
> **Wave 5b₂** (laser — SHIPPED PR #43; select/move-strokes DEFERRED, see below).
> The annotation wave is COMPLETE. Items annotated below.

- [x] **Ephemeral present ink** — SHIPPED (**5a, PR #40**): `BoardFullscreen` present hook uses `ephemeral:true`; silent auto-persist removed.
- [x] **"Save these annotations?" prompt** on present exit — SHIPPED (**5a, PR #40**): Save/Discard/Cancel prompt fires only when ink changed (baseline content-diff); Esc routed through the prompt via `stopImmediatePropagation`. **Plus save/restore beyond the spec** — saved ink is pre-seeded back into the present buffer on re-entry (`readBoardAnnotations` + `hydrateKey` nonce) so it reappears.
- [x] **One annotation engine/toolbar everywhere** (editor + present + scratch) — full set: pen, highlighter, **shapes (box/line/arrow)**, text, eraser, **laser**, undo/redo, color + width. **5a** unified the engine internals (the `hydrating` reducer flag + persist gate). **5b₁ (PR #42)** added a canonical `lib/teach/annotation-tools.ts` source consumed by BOTH the editor `BoardToolbar` and the present panel (no more drift), removed the dead `ToolDock`, and gave present **shapes (box/line/arrow) + width** parity. **5b₂ (PR #43)** added the **laser** pointer (transient fading overlay — `lib/use-laser-trail.ts`, never committed/persisted) to both toolbars via the shared source. **DEFERRED — select/MOVE of committed strokes:** it needs its OWN tool. The existing `select` is the pointer-PASSTHROUGH tool (interact with the PDF/video/iframe underneath); overloading it to grab+drag ink would make clicking near a stroke ambiguous and break passthrough. A power-user feature for a later slice; passthrough `select` already satisfies "select everywhere".
- [x] Fix **eraser fast-drag** (5a F3: walk coalesced events + interpolate between samples), **highlighter blend** (5a F4: dropped canvas `multiply`, rely on `globalAlpha` — chosen over DOM `mix-blend-mode` to keep ink on the single canvas), and **tokenize** the hard-coded 22px text size (5a F9: single `DEFAULT_TEXT_PX` source for canvas + textarea).
- [x] **Perf** — SHIPPED (**5b₁, PR #42**, F5/F6): offscreen committed-layer cache in `use-board-annotations.ts` (`paintCommitted` + `composite` in `board-annotations.ts`); per-frame draw is now O(draft) not O(all strokes). Caught+fixed a regression where `rafRef` stuck across a StrictMode remount → committed layer never composited (cleanup now nulls the ref).
- [~] **Annotation persistence shape** — 5a added `persistBoardAnnotations`/`readBoardAnnotations` + the saved-vs-ephemeral distinction via `ephemeral`/`hydrating`; a first-class `Annotation` data-model type lands with **Wave 6** (Supabase). `lib/teach/types.ts`.
- [x] **LOW carryover (5a review)** — pre-seed auth race FIXED (**5b₁, PR #42**): if the teacher draws while `readBoardAnnotations` is in flight, the saved ink is now MERGED under the drawn ink (rather than dropped), so an exit-Save can't overwrite saved ink.

**Acceptance:** present ink is ephemeral + prompts to save ✓ (5a); saved ink restores on re-entry ✓ (5a); no erase gaps ✓ (5a); highlighter renders reliably ✓ (5a); shapes + width parity in present ✓ (5b₁); smooth strokes ✓ (5b₁ perf); laser in editor + present ✓ (5b₂); select/move-strokes deferred w/ rationale (its own tool, future slice). **Annotation wave COMPLETE.**

### Wave 5 — Supabase persistence + forking (owner: WIRE NOW)
> RE-SCOPED 2026-06-14: this is now **Wave 6** (task #16) after the consolidation
> wave shifted the numbering.

- [ ] **Land the pending Teach-persistence port** (the `ecstatic-bohr` branch / `fe53805`) before flipping the flag.
- [ ] **Wire `supabaseTeachSource`** — flip `NEXT_PUBLIC_TEACH_USE_SUPABASE`; the client `teach` export currently hard-wires the mock (`queries.ts:293`).
- [ ] **Mock ↔ Supabase parity** for all new W2/W4 fields (size, per-page background, pages, annotations, templates); verify atomic RPCs + the mass-assignment whitelist.
- [ ] **Master/Personal lazy fork** for team boards — gate team write-through; copy-on-write on personal edit (CLAUDE.md §2). Today team-board edits write through to everyone.
- [ ] **Undo** for `pushBoardsToTeam` (destructive team replace `BoardsModule.tsx:261`); stop swallowing load errors to `[]` (`TeachWorkspace.tsx:451`) — surface a retry.
- [ ] Bound orphan ephemeral whiteboards (cleanup).

**Acceptance:** boards/widgets/pages/annotations persist to Supabase under the flag with no regressions; forking respects Master/Personal; destructive actions are reversible; no silent failures.

---

## 6. Cross-cutting verification gate (run at the END of every wave)

- [ ] `npm run lint` and `npm run format:check` clean.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` green (only when no `next dev` is running — it clobbers `.next`).
- [ ] `node scripts/probe-uxa.mjs` (responsive probe) — no document-level horizontal scroll at 390 / 768 / 1280; touch targets ≥44px.
- [ ] **Live QA** in a real browser (Chrome + Playwright): click every new control, check the console, screenshot before/after.
- [ ] **All 6 themes** (paper, cloud, night, mint, sky, blossom): chrome re-hues via `--chrome-accent`, no dark-on-dark / light-on-light, WCAG AA.
- [ ] **§4a code-review gate** — `codex exec --sandbox read-only` on the staged diff (pipe the diff via stdin); fix every Critical/High; else an independent review agent + self-review per the fallback protocol.
- [ ] No errors, bugs, omissions, or gaps. Update this file's checkboxes; open the wave PR.
