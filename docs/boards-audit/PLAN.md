# Teach / Learning Boards — Audit Findings & Redesign Plan

_Working artifact (not committed unless asked). Synthesizes the 6-agent code audit
(`docs/boards-audit/01..06-*.md`) + a live Chrome/Playwright pass + the owner's
direction. Wave 1 = **declutter + clarify IA**. Generated 2026-06-13._

---

## 0. Owner direction & decisions

- **Hybrid rebuild, in waves.** Wave 1 = declutter + clarify the information
  architecture. We will do all of it, wave by wave.
- **North star:** a board opens **clean, clear, well-organized — focus on the
  teaching/content, NOT a wall of menus.**
- **Creation rule:** a board exists **only when explicitly** opened, added as a
  resource, attached to a lesson/lesson-phase, or created from the Boards page.
  **No auto-board-per-lesson.** Presenting + writing does **not** create a board —
  at the end of presenting, prompt **"Save these annotations?"**
- **Open behavior:** a board **opens blank** unless (a) opened from a resource
  ("open in board") → it opens containing that resource, or (b) it was already
  **saved as a board or board template** → it loads that content.
- **Board templates** = first-class (reusable starting layouts).
- **Board sizes:** A4 / A3 / 16:9 (PowerPoint), switchable in **board settings**.
  ⇒ boards are **fixed-size pages**, not an infinite canvas.
- **Scratch boards** live in both a dedicated **Boards page** and the Teach library.
- **Must-haves (11):** 1 insert resources + write · 2 insert widgets mid-lesson ·
  3 attach to lesson and/or phase · 4 multiple pages · 5 annotate (pen/text/shape) ·
  6 standalone scratch boards · 7 backgrounds (colors + paper styles) · 8 tagged or
  untagged on a Boards page · 9 board counts as a resource · 10 explicit-creation
  only · 11 any notecard/resource card opens into a board.

### Finalized direction — all 22 answered (2026-06-13)

- **Worst clutter:** left rail + modules · the widget picker(s) · top/sub bars + tool
  dock. (Right panel is OK — leave it.)
- **Present mode:** hide **all** editing chrome → board + one floating toolbar.
- **Appearance:** **one "Board appearance" popover** (size + background/paper + theme)
  on the board toolbar; replaces the 3 scattered/broken surfaces.
- **Paper:** full set (Cornell / grid / handwriting / dot / lined / blank + colors);
  **board paper defaults to WHITE**; background settable **per-page AND per-board,
  with a board-level default**.
- **Display target:** projector + interactive touch whiteboard; **students
  display-only for now** (don't design the device path out).
- **Aesthetic:** **hybrid** — chrome re-hues with the 6 themes, board surface stays a
  neutral/white writing surface. References: **Classpoint/Curipod, Padlet,
  Jamboard/Apple Freeform**.
- **Boards per lesson:** many; **default to lesson-level**; bound to a **specific
  phase only when explicitly phase-tagged or created from that phase's add button**.
- **Tagged board surfaces in:** lesson Resources + unit resource list + the Boards page.
- **Open-in-board from a card:** **ask each time** (new board vs add to the existing
  one); placed resources are **linked but detachable**.
- **Widgets:** tier to a **CORE 6** (timer, agenda, learning target, directions,
  groups, name-picker), rest behind "More"; **the board opens with NO widgets visible
  — they appear only when "Add widget" is pressed** (the clean-board rule).
- **Pages:** thumbnail filmstrip, hidden until 2+ pages.
- **Annotation:** full set (pen, highlighter, shapes, text, eraser, laser, select/move,
  undo/redo, colour + width) working in editor + present + scratch.
- **Persistence: WIRE SUPABASE NOW.** `supabaseTeachSource` exists but is OFF; land the
  pending Teach-persistence port + flip `NEXT_PUBLIC_TEACH_USE_SUPABASE`. (Promotes the
  old "Wave 5" persistence into active scope.)
- **Delivery:** incremental PR per wave. **No hard deadline** (quality over speed).

---

## 1. Problems found (48) — severity · file:line · why

Severity: **C**ritical / **H**igh / **M**edium / **L**ow. Deduped across the 6 reports
+ the live pass.

### Crowding & information architecture (the headline)

1. **C** — ~10 control surfaces can be open at once; **~768px of chrome before the
   board renders**; live metric = **82 visible buttons / 73 unique labels** on the
   initial board view, and the teaching surface is a minority of the viewport and
   starts empty. `01-shell-ia` inventory · live probe.
2. **C** — "Tools" duplicated across **5–6 surfaces** (rail icon, left tab, both
   panels' "+", right-panel body); two pickers list the identical 12 types.
   `PanelAddMenu.tsx:34`, `TeachLeftPanel.tsx:247`, `TeachRightPanel.tsx:159,256`.
3. **C** — Board management spread across **4 surfaces**; "Add Board" in 3; the board
   list rendered twice at once. `TeachSubBar.tsx:148`, `BoardsModule.tsx`,
   `TeachWorkspace.tsx:1462`, `TeachFooter.tsx:111`.
4. **C** — **Three divergent board-background systems**; the editor teachers actually
   use (`BoardEditor`) **never reads `board.background`** (bg hard-coded) → this IS
   "the theme doesn't work." `editor.module.css:196-200`; `TeachWorkspace.tsx:896`
   vs `BoardSettingsPopover.tsx:163` vs `BoardFullscreen.tsx:209`.
5. **C** — Present mode uses its own local-state backdrop (`useState("dusk")`) that
   never persists or reads `board.background`. `BoardFullscreen.tsx:86-105,209`.
6. **H** — An **entire second board system** (`TeachingBoard` grid + `WidgetPicker` +
   `WidgetSettingsPopover` + `FocusMode` + `BoardEmptyState` + `WidgetShell` + the
   `layout` reducer) is **dead code** — `BoardEditor` always wins.
   `TeachWorkspace.tsx:1302,1311`.
7. **H** — Sub-bar and editor toolbar are near-duplicate command strips stacked
   vertically (Present/theme/widget/resource/fullscreen in both).
   `TeachSubBar.tsx:268`, `BoardEditor.tsx:770`.
8. **H** — **7+ non-functional "SOON" stubs** across the top bars eat prime space
   (Search-soon ×, Subject-soon, Pop-Out-soon, Duplicate-soon).
   `TeachSubBar.tsx:133,141,302,307`, `TeachTopBar.tsx:116` · live shot.
9. **H** — Two drawing docks on one view (`BoardToolbar` AND floating `ToolDock`, a
   strict subset) + 4 disabled "Soon" tiles over live content.
   `TeachWorkspace.tsx:1284-1300`.
10. **M** — Footer echoes the rails / sub-bar / Help (module dots, board count,
    shortcut hints). `TeachFooter.tsx:84`.

### Widgets

11. **H** — **51 widget ids / 40 addable**, but ~12 are pure duplicate aliases
    resolving to a survivor body (dupes carried through catalog + dispatch + seeds).
    `WidgetBody.tsx:88-125`.
12. **H** — **4 overlapping time widgets** (timer / clock / countdown / stopwatch).
    `catalog.ts:276-307`.
13. **H** — `WidgetSettingsPopover` edits only **2 of 40** types; the other 38 open a
    "coming soon" dead popover. `WidgetSettingsPopover.tsx:51`.
14. **H** — **Three fragmented widget-add paths** (empty-cell `WidgetPicker` modal,
    full-screen `WidgetLibrary` overlay, panel "+" with a hardcoded 12-subset); no
    canonical "Add widget"; the fast path is gated on a visible empty cell.
    `WidgetPicker.tsx` / `WidgetLibrary.tsx` / `PanelAddMenu.tsx:34`.
15. **M** — ~21 display-only widgets render hardcoded FALLBACK sample content with no
    edit path (vs 19 interactive). `03-widgets`.
16. **M** — Duplicate objective widgets; the **retired** `objective` is the only
    editable one, not its `learning-target` replacement. `ObjectiveWidget.tsx:34`.
17. **M** — Every tile always renders 5 icon buttons (drag/pin/expand/settings/
    remove). `WidgetShell.tsx:78-151`.
18. **M** — `_WidgetKit` Avatar/Face emit runtime `hsl()` (token loophole) → don't
    re-hue across themes. `_WidgetKit.tsx:313,338`.

### Canvas · size · pages · backgrounds

19. **H** — Fixed **1180×840** stage, no fit/zoom (`ZoomPanCanvas` exists but unused)
    → overflow/clipping. `editor.module.css:206-211`.
20. **H** — `backgrounds.ts` has 45 colour/pattern/gradient swatches but **zero paper
    styles** (Cornell/grid/lined/dot/handwriting); not per-page. `lib/teach/backgrounds.ts`.
21. **H** — Board **SIZE (A4/A3/16:9) missing entirely** — no field, UI, or token.
    `lib/types.ts:555`.
22. **M** — Multi-page is **add-only** in the UI; `deletePage`/`reorderPages` exist in
    the data layer but no delete/reorder/rename UI. `BoardEditor.tsx:96-97,809-817`.
23. **M** — Three overlapping appearance surfaces (`BoardSettingsPopover` 420px modal
    vs `AppearancePanel` vs present picker), with a "reorder elsewhere" hint admitting
    controls aren't there; `AppearancePanel` has a second "Background" control that
    name-collides. `BoardSettingsPopover.module.css:16`, `AppearancePanel.tsx:84-102`.

### Annotation

24. **C** — Present mode **auto-persists every stroke** (no `ephemeral` flag) → ink
    silently reappears next open; violates the new ephemeral-present rule.
    `BoardFullscreen.tsx:230`.
25. **H** — **No exit interception / no "Save annotations?" prompt** anywhere.
    `BoardFullscreen.tsx:299`, `TeachWorkspace.tsx:1125`.
26. **H** — Eraser hit-tests only the current point per move → gaps on fast erase.
    `AnnotationLayer.tsx:162`.
27. **H** — Highlighter uses canvas `multiply` against an empty transparent canvas →
    browser-dependent / can render invisibly. `board-annotations.ts:364`.
28. **H** — Present re-implements the toolbar by hand (own 6-colour palette vs
    `BoardToolbar`'s 8); **shapes exist only in `BoardToolbar`** (Present + scratch
    have none). `BoardFullscreen.tsx:423`.
29. **M** — Full-scene canvas repaint + a workspace React re-render on **every pointer
    sample** (perf). `use-board-annotations.ts:343,493`.
30. **M** — Text tool hardcodes `22px` in two places (token violation + desync).
    `AnnotationLayer.module.css:54`, `board-annotations.ts:332`.

### Data · linkage · board-as-resource · creation

31. **H** — `listBoardsForLesson` **auto-seeds** a default 5-phase board set on first
    lesson-open → violates "create only on explicit action" (#10).
    `mock-source.ts:213`, `supabase-source.ts:850`.
32. **H** — Board-as-resource (#9) **structurally impossible**: only `LessonResource`
    is adapted; resource `kind` has no `"board"`; no `Board→TeachResource` adapter.
    `lib/types.ts:634`, `toTeachResource.ts`.
33. **H** — **No annotation persistence shape** (only a transient `activeTool` enum);
    no `Annotation` type, no save-at-end model. `lib/teach/types.ts:41,158`.
34. **M** — Phase linkage is a soft free-slug `BoardTag{kind:"phase"}`, no FK/
    validation. `lib/mock/boards.ts:127`.
35. **M** — `pushBoardsToTeam` is a destructive team-wide replace with no Undo.
    `BoardsModule.tsx:261`.
36. **M** — Load effect swallows errors to `[]` (silent failure).
    `TeachWorkspace.tsx:451`.
37. **M** — Boards do **not** use the app's lazy copy-on-write fork; team-board widget
    edits write through to everyone with no Master gate (violates CLAUDE.md §2).
    `05-data-linkage`.
38. **L** — Orphan ephemeral whiteboards accumulate unbounded. `05-data-linkage`.

### Resources · notecards · Boards page

39. **H** — **No dedicated Boards page/route exists**; board browsing is a modal
    overlay (`BoardLibraryModule`) + an active-lesson-only strip (`BoardsModule`).
    `app/(teach)/teach/page.tsx`.
40. **H** — Scratch-board engine (`createBlankBoard`/`keepBoard`) is **dead code** at
    the UI layer — the exact #6 contract is built and wired to nothing.
    `queries.ts:166,176`.
41. **H** — #11 broken: notecards & daily/lesson-flow tiles have **no "open in
    board"**; the only "Open in board" (Teach `ResourcesModule`) embeds onto the
    already-active board and **no-ops** if none is active. `ResourcesModule.tsx:174`,
    `TeachWorkspace.tsx:969`.
42. **M** — Embedded resources are **static copies** (`{url,label,kind}` snapshot),
    not live links. `TeachWorkspace.tsx:946`.
43. **M** — `BoardLibraryModule` favorites/archived scopes match nothing (dead
    controls); overdense for a modal. `BoardLibraryModule.tsx:168-170`.
44. **M** — Library "Open" overloaded across 3 behaviors; can unexpectedly copy a Team
    board and consume a cap slot. `TeachWorkspace.tsx:1464-1533`.
45. **M** — `ResourceViewerToolbar` PDF page/zoom cluster = 3 dead `FutureControl`s
    crowding the bar. `ResourceViewerToolbar.tsx:60-79`.

### Runtime / build

46. **C — FIXED this session** — `/teach` returned HTTP 500
    (`mockTeachSource` circular-import TDZ). Fixed via a `lib/teach/constants.ts`
    leaf; verified `/teach` 200 in the live probe.
47. **M** — Board appearance/settings appears **inaccessible with no board open**
    ("Board 0 of 0"); the settings click no-ops with no feedback. Live probe.
48. **L** — `linkedom` "Can't resolve 'canvas'" module-not-found warning on every
    compile (`sanitize-html` → linkedom). Cosmetic build noise. Server log.

---

## 2. Improvements (33) — mapped to problems & must-haves

### Declutter & IA — Wave 1 core

- **I1** Collapse chrome to **one top bar + one optional context panel**; drop the
  sub-bar (merge its controls). Target: board surface ≥70% of viewport. (P1,P7,P10)
- **I2** **One left panel, mutually-exclusive modes** (Lessons / Boards / Notes /
  Class / Tools) — opening one closes the others. No more 3–7 simultaneous tabs. (P1,P2)
- **I3** **Remove all "SOON" stubs** from chrome; ship them when real. (P8)
- **I4** **Delete the dead second board system**; one canonical renderer. (P6)
- **I5** **One canonical "Add"** (widget/resource): a single searchable inserter via a
  persistent "+" and a mid-canvas affordance; replaces the 3 add paths. (P14, #2)
- **I6** **Consolidate Tools** into one place (remove the 5–6 duplications). (P2,P9)
- **I7** **Present mode hides all editing chrome** → board + one minimal floating
  toolbar. (P9, Q2 default)
- **I8** Strip the footer's redundant echoes; keep board pager + save state. (P10)

### Board appearance — fix "doesn't work"

- **I9** Make `BoardEditor` **read `board.background`** (and per-page bg); delete the 3
  divergent systems → one source of truth, shared by present. (P4,P5,P23)
- **I10** **One "Board appearance" popover** (size + background/paper + theme) on the
  board toolbar; same control in present. (P23, #7)
- **I11** Add **paper styles** to `backgrounds.ts`: blank, solid colours, lined, grid/
  checkered, dot, Cornell, handwriting (3-line); **per-page**. (P20, #7)
- **I12** Add board **SIZE** (A4 / A3 / 16:9) as a `Board` field + size-derived stage;
  fit-to-viewport with zoom; default 16:9 landscape. (P19,P21, size)

### Creation / open behavior

- **I13** **Remove the auto-seed** of a default board set on lesson-open. (P31, #10)
- **I14** Board **opens blank** unless from a resource (seed it) or a saved board/
  template (load it). (#10/#11 owner rule)
- **I15** Present ink **ephemeral**; on exit **prompt "Save these annotations?"** (sink
  exists: `toAnnotations()` + `onChange`). (P24,P25, save-rule)
- **I16** **Board templates**: create-from-template + save-as-template. (templates)

### Boards page & resource integration

- **I17** Build a dedicated **`/boards` page** (lift `BoardLibraryModule` to a route):
  scratch/untagged home + create-blank + templates + search; wire the dead
  `createBlankBoard`/`keepBoard`. (P39,P40,P43, #6/#8)
- **I18** **Board-as-resource**: add a `board` resource kind + `Board→TeachResource`
  adapter; surface boards in lesson Resources + unit resource list. (P32, #9)
- **I19** **"Open in board"** on notecards + daily/lesson-flow tiles → create a new
  board containing that card and open it. (P41, #11)
- **I20** Keep placed resources **linked** to source (edits sync) with a detach
  option. (P42, #1)

### Lesson / phase linkage

- **I21** Attach a board to a lesson **and/or a specific phase** (promote phase from
  soft slug to a validated reference); tagged + untagged both first-class. (P34, #3/#8)

### Widgets

- **I22** **Tier the catalog**: ~12 CORE shown, advanced behind "More"; collapse the
  12 alias dupes + 4 timers → 1 configurable timer. (P11,P12,P16, #2)
- **I23** Real settings for every widget (kill the "coming soon" popover) or remove
  unconfigurable ones. (P13)
- **I24** Tile action icons on **hover/focus only**; shared `WidgetShell`. (P17)
- **I25** Fix `_WidgetKit` `hsl()` → tokens so widgets re-hue across themes. (P18)

### Annotation

- **I26** **One annotation engine/toolbar** (pen, highlighter, shapes, text, eraser,
  laser, select-move, undo/redo, colour, width) across editor + present + scratch;
  add laser + select/move. (P28, #5)
- **I27** Fix eraser fast-drag (segment hit-test) + highlighter blend (DOM
  `mix-blend-mode`); tokenize the 22px text size. (P26,P27,P30)
- **I28** rAF/throttle the canvas repaint; avoid per-sample React re-renders. (P29)

### Data · forking · safety

- **I29** Add an **Annotation persistence shape** + saved-vs-ephemeral distinction. (P33)
- **I30** Respect the **Master/Personal lazy fork** for team boards (gate write-through;
  copy-on-write on personal edit). (P37)
- **I31** Add Undo to `pushBoardsToTeam`; stop swallowing load errors (surface retry). (P35,P36)
- **I32** ✅ Fix the `/teach` 500 TDZ. (P46 — done)

### Cross-cutting (every wave)

- **I33** Verify the IA at **390 / 768 / 1280** and across **all 6 themes** (chrome via
  `--chrome-accent`, ≥44px touch, AA contrast); run the §4a review gate + live QA.

---

## 3. Wave plan

| Wave | Theme | Improvements |
| --- | --- | --- |
| **1 (now)** | **Declutter + IA** | I1–I10, I13, I22, I24, I7 + ✅I32. One top bar, one panel, one Add, one appearance popover; no SOON stubs; dead system removed; auto-seed removed; widget tiering + tile declutter. |
| 2 | Board model | I11, I12, I14, I16, I22-pages — sizes, paper backgrounds per-page, open-blank + templates, page filmstrip. |
| 3 | Boards page + resources | I17, I18, I19, I20, I21 — /boards page, board-as-resource, notecard→board, lesson/phase linkage. |
| 4 | Annotation + present-save | I15, I26, I27, I28, I29 — ephemeral + save prompt, unified engine, data shape. |
| 5 | Forking + persistence | I30, I31, wire `NEXT_PUBLIC_TEACH_USE_SUPABASE`, data shapes end-to-end. |

Each wave ends with **I33** (responsive + 6 themes + a11y), the **code-review gate**,
and a **live QA pass**.

---

## 4. Evidence

- Code audit: `docs/boards-audit/01..06-*.md`.
- Live styled "before": `docs/screenshots/boards-audit-live/desktop-01-initial.png`
  (the ChatGPT-mockup reference), `desktop-04-night.png`, plus `REPORT.txt`
  (metrics: 82 buttons / 73 labels, no horizontal scroll at any tier).
