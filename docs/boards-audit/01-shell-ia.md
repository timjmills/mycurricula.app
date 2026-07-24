# Teach / Learning-Boards Audit — 01: Shell, Information Architecture & Chrome

**Scope:** the Teach workspace shell, IA, and chrome — the "crowding" itself.
**Mode:** READ-ONLY audit. No app code edited. Files reviewed: 30 (listed at end).
**Date:** 2026-06-13. **Audience:** Wave 1 (declutter + clarify IA) redesign.

The owner's verdict — "extremely bad — crowded, too many things open at once,
the board-theme picker is badly placed and doesn't work" — is corroborated by
the code. The root cause is not styling; it is **architectural duplication**:
the surface ships *two parallel board systems* (a grid board + a free-form
editor) and *three independent board-background/theme pickers*, then layers a
five-zone shell (top bar + sub bar + 2 rails + 2 panels + footer) on top, every
piece of which can be open simultaneously. Below: (a) inventory, (b) flaws/bugs,
(c) crowding/bloat contributors (the core), (d) connections to other surfaces,
(e) must-have status.

---

## (a) INVENTORY — what mounts, and how much can be open at once

In the **default (non-present) state** the shell mounts, top→bottom, all at once:

| Zone | Component | File |
| --- | --- | --- |
| Top bar | `TeachTopBar` (wordmark · grade · 6 view tabs · Search · + · bell · Help · avatar) | `components/teach/chrome/TeachTopBar.tsx` |
| Sub bar | `TeachSubBar` (Week ▾ · Subject ▾ · board pill strip · +Add Board · Widgets · Library · ⚙ · Present · Full Screen · Pop-Out · Duplicate) | `components/teach/chrome/TeachSubBar.tsx` |
| Left rail | `TeachLeftRail` — 7 icons (Lessons/Lesson/Boards/Notes/Groups/Class/Tools) | `components/teach/left/TeachLeftRail.tsx` |
| Left panel | `TeachLeftPanel` — 7 tabs + body + "+" PanelAddMenu | `components/teach/left/TeachLeftPanel.tsx` |
| Center | `BoardEditor` (own toolbar: Widget·Resource·Board theme·Present·Share + page bar + AppearancePanel) | `components/teach/board/editor/BoardEditor.tsx` |
| Right panel | `TeachRightPanel` — 3–4 tabs + body + "+" PanelAddMenu + collapse | `components/teach/right/TeachRightPanel.tsx` |
| Right rail | `TeachRightRail` — Resources/Chat/To-do icons | `components/teach/right/TeachRightRail.tsx` |
| Footer | `TeachFooter` (Panels ▴ · module dots · Board N of M · Saved · ⌘P/⌘//⌘? hints) | `components/teach/chrome/TeachFooter.tsx` |
| Overlays (mountable concurrently) | WidgetPicker, BoardSettingsPopover (→BoardBackgroundPicker), WidgetSettingsPopover, TeachHelpOverlay, Library overlay (Boards/Widgets) | `TeachWorkspace.tsx` 1396–1558 |

On desktop, **8 persistent chrome regions** frame the board before any overlay
opens. With both panels open at 320px each (`DEFAULT_PANEL_WIDTH`,
`use-teach-workspace.ts:81`) plus two 64px rails, **~768px of horizontal space is
chrome** before the board gets a pixel. The center *also* renders the
`BoardEditor`, which carries its **own** toolbar + appearance panel — a 9th and
10th chrome layer nested inside the 8.

**Maximum simultaneously-open count:** top bar + sub bar + left rail + left panel
+ editor toolbar + editor appearance panel + editor page bar + right panel +
right rail + footer = **10 control surfaces**, before a teacher opens the Library
overlay or a settings popover on top.

---

## (b) FLAWS / BUGS

### B1 — `TeachWorkspace.tsx:1118` & `:1302` — the board-theme picker "doesn't work" because there are THREE of them, and the most prominent one never persists. (Critical)
There are three independent, non-interoperating board-background/theme systems:
1. **Editor "Board theme"** (`BoardEditor.tsx:761` → `AppearancePanel`) writes
   `ThemeOverride.bg` from `BG_OPTS` (`--wf-*-grad`), persisted via the
   `setBoardTheme` intent → `teach.setBoardTheme` (`TeachWorkspace.tsx:896`).
2. **Sub-bar gear** (`⚙` → `BoardSettingsPopover.tsx:163` → `BoardBackgroundPicker`)
   writes a *different field* `Board.background` from a *different catalog*
   (`BOARD_BACKGROUNDS`, `--teach-bg-*`), persisted via `updateBoard({background})`.
3. **Present mode** (`BoardFullscreen.tsx:209`) uses a *third* set — 10 hard-coded
   `BACKDROPS` presets in `useState("dusk")` that are **never persisted**
   (`:597` just `setBg`), so the chosen backdrop is **lost on exit** and never
   reflects what the editor/settings picker set.

So a teacher can set a background three ways, in three places, and none of the
three agree with the others; the one they meet first in Present (the big swatch
popup) silently discards their choice. This is precisely "badly placed and
doesn't work." **Fix:** collapse to ONE board-background model (one field, one
catalog) surfaced from ONE place (board settings), and have Present read it.

### B2 — Present mode does NOT prompt "save annotations?" — it auto-persists silently, the opposite of the new requirement. (High)
`BoardFullscreen.onExit` (`TeachWorkspace.tsx:1125`) is just
`dispatch({setPresent:false})`. Present-mode ink is written live by
`useBoardAnnotations` keyed on the page id (`BoardFullscreen.tsx:230`), so it
persists with no confirmation. The new spec wants present-mode writing to NOT
auto-create/commit but to prompt "save annotations?" at the end. Today there is
no prompt and no discard path. **Fix:** gate present-exit on a save/discard
dialog when the annotation doc is dirty.

### B3 — A whole parallel grid-board system (`TeachingBoard` + WidgetPicker + WidgetSettingsPopover + FocusMode + BoardEmptyState + WidgetShell) is shipped but effectively dead. (High)
The center renders `BoardEditor` whenever `activeBoard && resolvedPageId`
(`TeachWorkspace.tsx:1302`). `resolvedPageId = activePageId ?? pages[0]?.id`
(`:1113`) and `listPages` **always** materializes an implicit page-0
(`mock-source.ts:148–151, 944`), so `pages[0]` is essentially always defined.
The `TeachingBoard` fallback branch (`:1311–1322`) and everything it drives —
`handleAddWidget`→`WidgetPicker` (`:1400`), `handleWidgetSettings`→
`WidgetSettingsPopover` (`:1423`), `FocusMode`, `BoardEmptyState`, `WidgetShell`,
the entire `BOARD_LAYOUT_GRID`/`setLayout`/`layout` reducer surface, and the
`handleEmbedResource` grid-scan (`:969`) — are unreachable in the live path. Two
board models coexist; one is invisible cost (bundle, mental model, the `⌘/`
"switch layout" shortcut that does nothing useful). **Fix:** delete the grid
board path or make the editor the sole board; drop the dead layout/picker code.

### B4 — `⌘/` "Layout" shortcut + footer hint are dead. (Medium)
The footer advertises `⌘/ Layout` (`TeachFooter.tsx:139`) and `use-teach-shortcuts.ts:195`
cycles `state.layout`, but layout only matters to the dead grid board (B3); the
free-form editor ignores it. The Help overlay also lists "Switch the board
layout" (`TeachHelpOverlay.tsx:64`). Teaching a shortcut for a non-feature.
**Fix:** remove the layout shortcut/hint, or repurpose `⌘/` for page nav.

### B5 — Two Present entry points + an editor-local `present` flag can disagree. (Medium)
Present is launched from the sub-bar (`TeachSubBar.tsx:268`) AND the editor
toolbar (`BoardEditor.tsx:770`), both dispatching `setPresent:true`. But the
editor *also* keeps its **own** `present` boolean (`BoardEditor.tsx:475`) that it
flips on the same click (`:773`) to hide its page bar/panel — independent of the
workspace flag that swaps in `BoardFullscreen`. Two sources of truth for one
mode; if the workspace guard fails (`!activeBoard || !resolvedPageId`,
`:1118`) the editor thinks it's presenting while the shell does not. **Fix:** one
present flag, owned by the workspace.

### B6 — `BoardEditor` ships a fake resource picker (`SAMPLE_RESOURCES`) that can mask the real one. (Medium)
`BoardEditor.tsx:81` defines hard-coded `SAMPLE_RESOURCES` and `resources` defaults
to them (`:471`). The workspace passes real `editorResources` (`:1309`), but if a
lesson has zero resources `editorResources` is `[]` → the modal still renders the
six fake "Verb Tenses Chart"/"Place Value Slides" items (`ResourceModal`, `:363`).
A teacher can "add" a resource that doesn't exist. **Fix:** show an empty state
instead of sample data when `resources.length === 0`.

### B7 — Esc handling is split across ≥5 independent listeners with overlapping scope. (Medium)
Esc is bound in: the workspace drawer-dismiss effect (`TeachWorkspace.tsx:388`,
capture phase), `use-teach-shortcuts` cascade (`:129`), `PresentBar` local handler
(`PresentBar.tsx:67`), `BoardFullscreen` (`:290`), `BoardEditor` deselect
(`:537`), `BoardSettingsPopover` (`:53`), `WidgetPicker` (`:61`), `PanelAddMenu`
(`:110`), `TeachHelpOverlay` (`:43`), `ToolsDock` (`:241`). Several use capture +
`stopPropagation` to "win," which is fragile ordering — e.g. the workspace
capture handler (`:396`) tries to defer to the resource canvas but not to the
Library overlay or settings popovers. **Fix:** a single Esc cascade owner with an
explicit layer stack.

---

## (c) CROWDING / BLOAT / CONFUSION — the core

### C1 — "Tools" is duplicated across FIVE surfaces. (Critical — top declutter target)
The same dockable tool set (timer/dice/poll/…) is reachable as: (1) a **left-rail
icon** (`modules-meta.ts:68`), (2) a **left-panel tab** → `ToolsModule`→`ToolsDock`
(`TeachLeftPanel.tsx:247`), (3) the **left** panel "+" `PanelAddMenu` `TOOL_TYPES`
(`PanelAddMenu.tsx:34`), (4) the **right** panel "+" `PanelAddMenu` (same list,
`TeachRightPanel.tsx:256`), and (5) the **right-panel** can also render a `tools`
body (`TeachRightPanel.tsx:159`). `ToolsDock` *also* has its own internal add
picker (`ToolsDock.tsx:228`). That is up to **six** ways to add a timer, with
two different pickers (`PanelAddMenu` vs `AddToolButton`) listing the identical
12 types. **Fix:** one Tools entry point; remove the PanelAddMenu tool list and
the right-side tools rendering.

### C2 — Board management is spread across FOUR surfaces that must be kept in sync. (Critical)
Boards appear as: the **sub-bar numbered pill strip + "Add Board"**
(`TeachSubBar.tsx:148–204`), the **left-panel Boards module** with its *own* "Add
board" + drag-reorder + Share (`BoardsModule.tsx`), the **Board Library overlay**
(`TeachWorkspace.tsx:1462`), and the **footer "Board N of M"** count
(`TeachFooter.tsx:111`). "Add Board" exists in three of them. The code carries a
large comment apparatus ("single source of truth, audit A1-left") precisely
because keeping four board surfaces consistent is hard. A teacher sees the same
board list rendered twice (sub-bar pills + left panel) at the same time. **Fix:**
pick ONE primary board switcher (the sub-bar strip) and make the left "Boards"
module the *management* surface (reorder/share/settings) only — not a second
switcher.

### C3 — The sub bar is half dead controls. (High)
Of the sub bar's ~11 controls, **four are `FutureControl` "Soon" stubs**: Week ▾
(`:133`), Subject ▾ (`:141`), Pop-Out (`:302`), Duplicate (`:307`). They occupy
prime horizontal space, compete with live controls, and on a phone push the real
Present/Full Screen buttons toward overflow. The top bar adds three *more* "Soon"
stubs (Search, +, bell — `TeachTopBar.tsx:116–136`). Seven non-functional
affordances across the two top bars. **Fix:** drop "Soon" chrome from the primary
bars; surface post-beta features only when they exist.

### C4 — Present + Full Screen + theme + add-widget + add-resource each appear in BOTH the sub bar and the editor toolbar. (High)
Because the center is the `BoardEditor` (which has its own toolbar), the sub bar
and the editor toolbar are **near-duplicate command strips stacked vertically**:
Present (sub-bar `:268` / editor `:770`), board theme (gear→`BoardBackgroundPicker`
/ editor "Board theme" `:761`), add widget (sub-bar "Widgets" `:216` / editor
"Widget" `:742`), add resource (right-panel embed + editor "Resource" `:756`),
fullscreen (sub-bar `:289` / fullscreen own button `BoardFullscreen.tsx:407`).
The teacher sees two toolbars one above the other offering overlapping verbs.
**Fix:** decide whether the board command strip lives in the chrome OR the editor,
not both; collapse the sub bar to context (week/board switcher) and let the
editor own board actions (or vice-versa).

### C5 — The footer re-implements navigation the rails already provide. (Medium)
`TeachFooter` shows "module dots" that jump to panels (`:84–106`) — duplicating
the left/right rail icons that do exactly that — plus a "Panels ▴" toggle
duplicating per-panel collapse, plus a "Board N of M" duplicating the sub-bar pill
strip, plus shortcut hints duplicating the Help overlay. A whole zone whose every
element echoes another zone. **Fix:** reduce the footer to save-status (and maybe
the panels toggle); drop the module dots and board count.

### C6 — Resources is a fourth heavyweight filtering surface. (Medium)
`ResourcesModule` carries its own search box + grid/list toggle + filter chips +
tag chips + count (`ResourcesModule.tsx:382–499`). Single-purpose-surface rule
(CLAUDE.md §3) says filtering belongs in panels — fine — but this panel's chrome
density (search + 2 view buttons + N chips + footer) inside a 320px column is a
lot of UI for "drag a card onto the board," and it triples the search inputs on
screen (top-bar Search stub, this, plus the Library/WidgetPicker searches).
**Fix:** trim to a single filter row; defer grid/list + tag chips.

### C7 — `BoardEditor`'s appearance panel is a permanent docked column on desktop. (Medium)
On desktop the editor always renders the `AppearancePanel` as a docked right
column (`BoardEditor.tsx:902`) — a *third* panel competing with the workspace's
right panel for the right edge. So at the right edge a teacher can have: editor
appearance panel + workspace right panel + right rail, three stacked vertical
strips. **Fix:** make appearance a popover/sheet on demand (as it already is on
tablet/phone, `:914`), not an always-docked column.

### C8 — `boards`, `pages`, and `activePageId` keep large trees mounted and re-deriving on every board action. (Low–Medium)
`TeachWorkspace` keeps `boards` + `pages` in state and calls
`Promise.all([reloadBoards(), reloadPages()])` after **every** widget mutation
(`:843, :858, :863, :867, :881, :890, :905`). Each reload swaps fresh array
identities, re-running the page-derivation effects and re-rendering the whole
editor tree. Combined with both panels staying mounted (never unmounted, only
hidden via `!collapsed` guards), the surface keeps a lot live. **Fix:** reload
the single mutated board, not the whole set; consider unmounting the inactive
panel body.

---

## (d) CONNECTIONS to other surfaces

- **Top-bar view tabs** reuse `VIEWS` from `components/shell/top-bar`
  (`TeachTopBar.tsx:20`) — good single-source; Teach is the active tab. The
  wordmark routes to `/weekly`, the avatar to `/settings`.
- **Lesson selection is bidirectional with the planner:** `LessonListModule`
  dispatches `selectLesson` AND mirrors `setSelectedLessonId`
  (`LessonListModule.tsx:92`), so Teach ↔ Daily stay coherent. Deep links
  `?lesson=&board=&resource=&sandbox=` are honored (`teach/page.tsx`).
- **Resources derive from the planner** via `getSections → lessonResources →
  toTeachResource` (`ResourcesModule.tsx:326`) — no separate fetch; agrees with
  Daily/Weekly. This is the natural seam for must-have #9 (a board AS a resource):
  today resources flow *into* boards, but a board never appears *in* a resource
  list. Not built.
- **Notes/Class/Groups are display-only mirrors** of Daily fixtures
  (`NotesModule.tsx`, etc.) — they add rail/tab weight for read-only glances that
  Daily already owns. Candidates to demote in Wave 1.
- **Forking/consequence model** is honored: push-to-team is gated + toasts
  (`BoardsModule.tsx:254`), matching CLAUDE.md §2.

---

## (e) CROSS-CUTTING MUST-HAVE STATUS (what's visible from the shell)

| # | Must-have | Status from shell/IA |
| --- | --- | --- |
| 2 | Insert widgets mid-lesson | **Over-built & scattered.** ≥5 entry points (sub-bar "Widgets", left/right PanelAddMenu, editor "Widget", Library overlay, dead WidgetPicker). Needs *consolidation*, not addition. |
| 3 | Attach board to lesson AND/OR phase | **Partial.** Boards attach to a lesson (`masterLessonId`); "phase" = a board ≈ a teaching phase (sub-bar copy "a new teaching phase"), but there is no explicit lesson-*phase* binding. |
| 4 | Multiple pages per board | **Built.** Editor page bar + `listPages/addPage` (`BoardEditor.tsx:789`). |
| 5 | Annotate (pen/text/shapes) | **Pen/highlighter/eraser/text built** (`BoardFullscreen` + `AnnotationLayer`); **shapes not present** in the tool set (`:340`). |
| 6 | Standalone scratch boards | **Built** via sandbox (`?sandbox=1`, `SANDBOX_LESSON_ID`, BoardsModule pin/save). |
| 7 | Backgrounds = colors + paper styles (Cornell/grid/dot/lined…) | **Fragmented (B1).** Three pickers, three catalogs; "paper styles" partially in `BOARD_BACKGROUNDS` patterns + the fullscreen Dots preset, but inconsistent and the present one doesn't persist. |
| 8 | Boards tagged to lessons/phases OR untagged on a Boards page | **Partial.** Tagging exists (`BoardTagPicker`/`BoardTagChips`); **no dedicated Boards page** — only the in-workspace Library overlay. |
| 9 | A board counts as a RESOURCE in resource lists | **Not built.** Resources flow into boards; boards don't appear in resource lists. |
| 10 | Boards created only on explicit open/add/attach/create | **At risk.** Chrome "Add Board" is explicit (good), BUT the workspace auto-seeds `DEFAULT_LESSON_ID` on mount (`TeachWorkspace.tsx:414`) and present-mode ink auto-persists with no prompt (B2). The "prompt save annotations at end of present" requirement is **unmet**. |
| 11 | Any notecard/resource card opens into a board | **Partial.** Resource cards embed onto a board (drag / "Open in board") but do not *open as* a board. |
| — | **Dedicated Boards page** (NEW) | **Not built** — only the modal Library overlay. |
| — | **Selectable board SIZE (A4/A3/16:9)** (NEW) | **Not built** — no size field in `BoardSettingsPopover`; canvas is free-form px. |

---

## Top recommendations for Wave 1 (declutter + IA)

1. **Kill the duplication first** (biggest crowding wins, low behavioral risk):
   one board system (drop the dead grid path, B3), one Tools entry point (C1),
   one board switcher (C2), one board-background model (B1).
2. **Choose one command home for board actions** — chrome OR editor toolbar, not
   both (C4); collapse the sub bar to a context/switcher bar and strip its "Soon"
   stubs (C3).
3. **Demote echo zones:** shrink the footer to save-status (C5); make the editor
   appearance panel on-demand (C7); demote read-only Notes/Class/Groups.
4. **Fix the two correctness gaps the new spec names:** present→"save
   annotations?" prompt (B2/#10) and a real **Boards page** + **board size** field
   (NEW must-haves) — these are net-new, but the declutter above frees the IA room
   for them.

---

### Files reviewed (30)
`app/(teach)/layout.tsx`, `app/(teach)/teach/page.tsx`,
`components/teach/TeachWorkspace.tsx`, `TeachWorkspace.module.css`,
`chrome/TeachTopBar.tsx`, `chrome/TeachSubBar.tsx`, `chrome/PresentBar.tsx`,
`chrome/TeachFooter.tsx`, `chrome/TeachHelpOverlay.tsx`,
`left/TeachLeftRail.tsx`, `left/TeachLeftPanel.tsx`, `left/modules-meta.ts`,
`left/PanelAddMenu.tsx`, `left/modules/ToolsModule.tsx`,
`left/modules/BoardsModule.tsx`, `left/modules/LessonListModule.tsx`,
`left/modules/NotesModule.tsx`, `right/TeachRightRail.tsx`,
`right/TeachRightPanel.tsx`, `right/modules/ResourcesModule.tsx`,
`board/editor/BoardEditor.tsx`, `board/editor/AppearancePanel.tsx`,
`board/fullscreen/BoardFullscreen.tsx`, `board/BoardSettingsPopover.tsx`,
`board/BoardBackgroundPicker.tsx`, `board/WidgetPicker.tsx`,
`board/BoardEmptyState.tsx`, `board/FocusMode.tsx`, `tools/ToolsDock.tsx`,
`lib/use-teach-workspace.ts` + `use-teach-viewport.ts` + `use-teach-shortcuts.ts`
+ `lib/teach/mock-source.ts` (page contract).
