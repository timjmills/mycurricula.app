# Boards Audit 02 — Canvas, Sizing, Multi-Page, Backgrounds & Board Settings

Scope: the board canvas model, board size, multi-page, backgrounds/paper, and
board appearance/settings surfaces. READ-ONLY audit (no code changed).

Files reviewed (15): `components/teach/board/TeachingBoard.tsx`,
`components/teach/board/editor/BoardEditor.tsx`,
`components/teach/board/editor/AppearancePanel.tsx`,
`components/teach/board/editor/editor.module.css`,
`components/teach/board/BoardBackgroundPicker.tsx`,
`components/teach/board/BoardSettingsPopover.tsx` (+`.module.css`),
`components/teach/board/WidgetSettingsPopover.tsx`,
`components/teach/board/BoardEmptyState.tsx`,
`components/teach/board/FocusMode.tsx`,
`components/teach/board/fullscreen/BoardFullscreen.tsx`,
`components/ui/ZoomPanCanvas.tsx`,
`lib/teach/backgrounds.ts`, `lib/teach/board-migrate.ts`, `lib/teach/limits.ts`,
`lib/teach/types.ts`, `lib/types.ts`, `lib/teach/mock-source.ts`,
`lib/teach/supabase-source.ts`, `lib/teach/queries.ts`,
`components/teach/TeachWorkspace.tsx`, `app/tokens.css`.

---

## The headline: THREE divergent board renderers coexist

There is no single "board." The center stage is rendered by one of three
different components depending on state, and they disagree on layout model,
background, and capabilities:

| Renderer | When it mounts | Layout model | Background source | Pages |
| --- | --- | --- | --- | --- |
| `BoardEditor` | `activeBoard && resolvedPageId` (the normal case) — `TeachWorkspace.tsx:1303` | Free-form absolute (`widget.canvas` x/y/w) on a **fixed 1180×840px** stage | **Hard-coded dotted paper** — ignores `board.background` | Tab bar (add only) |
| `TeachingBoard` | else fallback — `TeachWorkspace.tsx:1312` | **Fixed CSS grid** (`widget.position` col/row/span) from `BOARD_LAYOUT_GRID` | `boardBackgroundCss(board.background)` (the 45-swatch catalog) | None |
| `BoardFullscreen` | `state.present` — `TeachWorkspace.tsx:1120` | Free-form absolute (read-only) | **Its own 10 hard-coded gradient presets** (`BACKDROPS`), local state, not persisted | `‹ N ›` nav |

This split is the root cause of "the background picker doesn't work" and of the
general crowding/confusion: two background systems, two layout models, and the
one the teacher actually sees (`BoardEditor`) honors neither the catalog nor any
size choice. `board-migrate.ts` (`gridToCanvas`) shows the grid model was meant
to be *replaced* by the canvas model in the 5.31 redesign, but `TeachingBoard`
+ the grid `position` field + `BOARD_LAYOUT_GRID` were never removed — they
still ship and still own the background catalog.

---

## (a) INVENTORY

- **Canvas model (`BoardEditor`)** — free-form absolute placement. Widgets carry
  `canvas:{x,y,w}` (`lib/types.ts:458`), placed via inline `left/top/width`
  (`BoardEditor.tsx:242`). The stage `.canvasInner` is a **fixed 1180×840 px**
  box (`editor.module.css:206-211`); `.canvas` is `overflow:auto` with
  `clamp(420px,70vh,880px)` height (`:194`). NOT infinite, NOT zoomable, NOT a
  named page size.
- **`ZoomPanCanvas`** (`components/ui/ZoomPanCanvas.tsx`) — a real fit/pan/pinch
  infinite-style canvas, BUT it is built for the planner boards (Weekly/Yearly/
  Subject; see its header comment) and is **not imported anywhere under
  `components/teach/`**. The Teach board does not use it.
- **Backgrounds catalog** (`lib/teach/backgrounds.ts`) — 45 entries: 15 solids,
  15 patterns, 15 gradients; tokens `--teach-bg-*` exist in `app/tokens.css`
  (48 occurrences, lines 384-577). `BoardBackgroundPicker` (tabbed swatch grid +
  "None") writes `Board.background` via `teach.updateBoard`.
- **Multi-page** — `BoardPage` type (`lib/types.ts:542`); data source implements
  `addPage`/`deletePage`/`reorderPages` in BOTH mock (`mock-source.ts:950-992`)
  and Supabase (`supabase-source.ts:2045-2073`) and they are on the `queries.ts`
  interface (`:250-254`). Editor renders a page tab bar + "Add page"
  (`BoardEditor.tsx:788-818`); fullscreen renders `‹ N ›` nav.
- **Board settings** — `BoardSettingsPopover` (modal: rename, background picker,
  reorder *hint*, destructive reset) opened from the sub-bar gear
  (`TeachWorkspace.tsx:1203,1414`). `AppearancePanel` (docked right panel / phone
  bottom-sheet in the editor: board theme + per-widget bg/accent/text/size/
  radius/font). `WidgetSettingsPopover` (per-widget: objective text / timer
  minutes only).
- **Board SIZE (A4/A3/16:9)** — **does not exist anywhere.** No `size` /
  `aspectRatio` / `pageSize` field on `Board`/`BoardPage`, no UI, no token. The
  only "size" in scope is `ThemeOverride.size` (text scale).
- **Present-mode save-prompt (#10)** — **does not exist.** `BoardFullscreen`
  annotates onto per-page surfaces via `useBoardAnnotations` (persists by
  lesson/board/page id immediately); there is no end-of-present "save
  annotations?" prompt and no ephemeral/scratch distinction at exit.

---

## (b) FLAWS / BUGS

### F1 — CRITICAL · Background picker is a no-op on the board the teacher sees
`BoardEditor.tsx` never reads `board.background`. Its canvas hard-codes the
dotted-paper fill (`editor.module.css:196-200`,
`background-image: radial-gradient(var(--ink-150)…)`). The only consumer of
`boardBackgroundCss(board.background)` is `TeachingBoard.tsx:120`, the fallback
renderer that effectively never mounts for a real (paged) board. So: teacher
opens Board settings → picks "Pattern 3" → `Board.background` is persisted →
**nothing changes on screen.** This is exactly the reported "DOESN'T WORK."
Fix: apply `boardBackgroundCss(board.background)` (with `isDarkBackground`
chrome flip) as the `.canvas`/`.canvasInner` background in `BoardEditor`, and
delete the hard-coded dotted fill (make "Dots" a catalog pattern instead).

### F2 — HIGH · Present mode ignores the persisted board background entirely
`BoardFullscreen.tsx:86-105` defines its own 10 `BACKDROPS` gradients held in
local `useState("dusk")` (`:209`), never reading `board.background` and never
writing it back. A teacher who sets a board background sees a *different*,
unrelated backdrop the moment they present, and any backdrop change made while
presenting is lost on exit. Fix: seed from `board.background`, persist changes
through `updateBoard`, and converge `BACKDROPS` onto the `lib/teach/backgrounds`
catalog so present and edit share one source.

### F3 — HIGH · No paper styles exist (Cornell / grid / lined / dot / handwriting)
Must-have #7 wants paper rulings. The catalog (`backgrounds.ts`) is purely
decorative *colours/patterns/gradients* — the "patterns" are tiled motifs, not
writing rulings, and there is no Cornell / lined / grid / handwriting-guide /
dot-grid family, no per-page selectability, and no notion that a background is a
writing substrate. The lone dotted look is a hard-coded editor CSS detail
(F1), not a selectable paper. Fix: add a `paper` category (Cornell, grid,
checkered, dot, lined, handwriting) to the catalog + tokens, selectable per page.

### F4 — HIGH · Fixed 1180×840 canvas with no scaling = guaranteed overflow / clipping
`.canvasInner` is `width:1180px; height:840px` (`editor.module.css:208-209`)
inside an `overflow:auto` box. On phone/tablet the teacher must scroll a fixed
slab (touch-pan is wired, `:204`), and a widget dragged toward the bottom-right
can be placed past 840px with no growth and no zoom-to-fit. There is no
fit/zoom control (unlike `ZoomPanCanvas`). This is the "crowded, things off
screen" feeling at the canvas level. Fix: adopt `ZoomPanCanvas` (or a fit
transform) and derive the stage size from the chosen board SIZE (F8).

### F5 — MEDIUM · Multi-page is add-only in the editor; delete/reorder/rename are dead capability
The data layer fully supports `deletePage`/`reorderPages`
(`mock-source.ts:964-992`, `supabase-source.ts:2059-2073`) but `BoardEditor`
only emits `selectPage` + `addPage` (`BoardEditor.tsx:96-97,809-817`); there is
no delete-page, no reorder, no rename control, and `BoardEditorIntent` has no
`deletePage`/`reorderPage`/`renamePage` variants (`:95-131`). Pages can be
created and never removed or ordered — they accumulate. Fix: add the three
intents + per-tab affordances (drag to reorder, ✕ to delete with the always-on
destructive tooltip, dbl-click to rename).

### F6 — MEDIUM · localStorage editor draft is keyed only by board, not page → cross-board/page bleed risk
`BoardEditor` writes a single `be-board-v1` LS key (`BoardEditor.tsx:61,520-534`)
holding `{boardId, activePageId, widgets,…}`. It is documented "fallback only,"
but it is overwritten on every board/page switch with no board-scoping in the
key, so it is useless as a recovery cache (last board wins) and is dead weight
that can momentarily mismatch the active board. Fix: key by `boardId` (and drop
it, since props are the source of truth) or remove it.

### F7 — LOW · `BoardEmptyState` pills route through the GRID picker, re-introducing the grid model
`BoardEmptyState.tsx:38` builds a `BoardCellTarget {col:0,row:0}` and the pills
call `onPick(firstCell)` → `handleAddWidget` → grid `WidgetPicker`
(`TeachWorkspace.tsx:1400`), NOT the canvas `addWidget` intent. So the empty
board's first-widget path uses the legacy grid placement while every subsequent
add uses canvas placement — two code paths to the same goal. Fix: route empty
state through the canvas `addWidget` intent.

---

## (c) CROWDING / CONFUSION

### C1 — HIGH · Three overlapping "appearance/settings" surfaces, no clear home
A teacher who wants to change how a board looks faces: (1) the sub-bar **gear →
BoardSettingsPopover** (rename + background + reset), (2) the toolbar **"Board
theme" button → AppearancePanel** (docked right / phone bottom-sheet: theme +
per-widget styling), and (3) **present mode's own background picker**. Background
lives in surface (1); theme lives in surface (2); a *second, different*
background lives in (3). Nothing tells the teacher size/page/background/theme
are different axes or where each lives. Fix: one "Board settings" home with
tabbed sections — *Size · Background/Paper · Theme · Pages · Tags · Danger* —
and make the toolbar "Board theme" button deep-link into that same surface.

### C2 — MEDIUM · `BoardSettingsPopover` is a cramped 420px modal carrying five unrelated jobs
`BoardSettingsPopover.module.css:16` caps the panel at `min(420px,100%)`, and
into it are stacked: rename, the full 45-swatch tabbed background grid
(`:156-164`), a free-text reorder *hint* (`:166-170`), and a destructive reset
zone (`:172-220`). The swatch grid alone wants more room than 420px; the
"reorder by dragging thumbnails elsewhere" hint is an admission the control
isn't here. This is the "badly placed picker." Fix: move background into the
roomy settings home (C1); keep the popover for rename + danger only, or retire
it.

### C3 — LOW · Two "Background" controls in the editor mean different things
The toolbar/right-panel `AppearancePanel` has a **"Background"** row
(`AppearancePanel.tsx:84-102`) that sets the *widget/board theme* `bg`
(`--wf-*-grad` tiles), while the gear's picker sets the *board canvas*
background. Same word, different target, different surface — a teacher cannot
predict which one paints behind the widgets. Fix: rename the theme one to "Tile
style"/"Card fill" and reserve "Background" for the canvas/paper.

---

## (d) CONNECTIONS

- `BoardSettingsPopover` → embeds `BoardBackgroundPicker` → `teach.updateBoard({background})`
  → `reloadBoards()`. Persistence works; **rendering is the broken link (F1)**.
- `BoardEditor` → `onChange(BoardEditorIntent)` → `TeachWorkspace.handleEditorIntent`
  (`:814-937`) → `teach.*` → `reloadBoards`+`reloadPages`. `addPage` is wired
  (`:823-828`); delete/reorder are not surfaced (F5).
- `Board.background` (persisted) is consumed by `TeachingBoard` only; `BoardEditor`
  and `BoardFullscreen` each ignore it and use their own thing.
- `ThemeOverride.size` (text scale) is unrelated to board SIZE — naming collision
  to avoid when adding the size field.
- `MAX_BOARDS_PER_TEACHER=50` (`limits.ts`) caps boards; there is no per-board
  page cap, so add-only pages (F5) are unbounded.

---

## (e) MUST-HAVE STATUS

| # | Feature | Status | Where it must live |
| --- | --- | --- | --- |
| **#4 Multiple pages per board** | **PARTIAL** — data layer complete (add/delete/reorder in mock+Supabase+interface); editor exposes **add only**, fullscreen navigates. No delete/reorder/rename UI; no per-page background. | Add `deletePage`/`reorderPage`/`renamePage` intents to `BoardEditorIntent`; per-tab affordances in `BoardEditor.tsx:788-818`; page list in the settings home. |
| **SIZE (A4/A3/16:9) — NEW** | **MISSING** — no field, no UI, no token; stage is a fixed 1180×840. | New `Board.size` (or per-page) enum on `lib/types.ts`; selector in the new Board-settings "Size" section (C1); drive `.canvasInner` dimensions + the present aspect from it; pair with a fit/zoom canvas (F4). |
| **#7 Backgrounds = colours + paper styles** | **PARTIAL/BROKEN** — 45 colour/pattern/gradient swatches exist and persist, but (a) the editor doesn't render them (F1), (b) present uses a separate set (F2), (c) **no paper styles at all** (Cornell/grid/lined/dot/handwriting — F3), (d) not per-page. | Fix the render link in `BoardEditor`; add a `paper` catalog category + tokens; unify present onto the catalog; make it per-page; house the picker in the settings home (C2). |
| **Present-mode save-prompt (#10)** | **MISSING** — present annotations persist immediately by id; no end-of-session "save annotations?" prompt, no ephemeral-vs-kept distinction at exit. | Add an exit interceptor in `BoardFullscreen.onExit` (and the `TeachWorkspace` present→edit transition) that, when the present surface created ink on an unsaved/scratch board, prompts save/discard before tearing down — mirroring the sandbox `sandboxDirty` keep-prompt pattern already in `TeachWorkspaceState`. |

---

## Suggested Wave 1 (declutter + IA) priorities

1. **F1** — make the background picker actually paint the editor canvas (fixes
   the #1 reported bug). _CRITICAL._
2. **C1/C2** — collapse the three appearance/settings surfaces into one tabbed
   Board-settings home; move background out of the 420px modal. _HIGH._
3. **F4 + SIZE** — give the canvas a fit/zoom and a real, size-derived stage
   (unblocks A4/A3/16:9). _HIGH._
4. **F3** — add the paper-style family (Cornell/grid/lined/dot/handwriting).
5. **F5** — finish multi-page (delete/reorder/rename) so pages stop being
   one-way.
6. **F2** — unify present-mode background with the persisted catalog.
