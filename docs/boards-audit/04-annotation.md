# Boards Audit 04 — Annotation Layer & Tool Docks

**Scope:** the annotation engine + every drawing/tool dock for the Teach boards.
**Method:** read-only static review (no build/run). **Date:** 2026-06-13.

Files reviewed (13):
- `components/teach/annotation/AnnotationLayer.tsx` + `.module.css`
- `components/teach/annotation/BoardToolbar.tsx` + `.module.css`
- `components/teach/annotation/ToolDock.tsx` + `.module.css`
- `components/teach/annotation/index.ts`
- `components/teach/tools/ToolsDock.tsx` + `index.ts`
- `components/teach/left/modules/ToolsModule.tsx`
- `components/teach/board/fullscreen/BoardFullscreen.tsx` (present-mode surface)
- `components/resources/PreviewAnnotation.tsx` (scratch surface)
- `lib/board-annotations.ts` (pure model/reducer/renderer)
- `lib/use-board-annotations.ts` (React hook + persistence)
- `lib/teach/use-docked-tools.ts`, `lib/teach/types.ts`
- consumer: `components/teach/TeachWorkspace.tsx` (state owner, wiring)

---

## (a) INVENTORY — tools and which dock each lives in

The "annotation engine" (`lib/board-annotations.ts` + `use-board-annotations.ts` +
`AnnotationLayer`) is shared by **three** different toolbars/surfaces. There is
ALSO a fourth, unrelated "Tools" dock that has nothing to do with drawing.

### Drawing tools — the `BoardTool` union (`lib/teach/types.ts:41`)
`select · pen · highlighter · eraser · rect · line · arrow · text`

| Tool | Implemented? | Where |
| --- | --- | --- |
| Select (pointer-through) | yes | model + all toolbars |
| Pen (freehand, coalesced, smoothed) | yes (`drawStroke` `case "pen"`, `board-annotations.ts:371`) | all |
| Highlighter (wide, multiply) | yes, but see **F4** | all |
| Eraser (object/whole-stroke) | yes (`strokeHit`, `:261`) | all |
| Rect / Box | yes (`:376`) | BoardToolbar only |
| Line | yes (`:383`) | BoardToolbar only |
| Arrow (with head) | yes (`:393`, `drawArrowHead :454`) | BoardToolbar only |
| Text (floating textarea → stroke) | yes (`AnnotationLayer.tsx:133`, `:404`) | BoardToolbar + BoardFullscreen |
| Undo / Redo | yes (snapshot history, `:192`/`:205`) | all |
| Clear | yes (`:218`) | all |
| Color picker | yes (token swatches) | all (different palettes per surface) |
| Stroke-width picker | yes — **but only BoardToolbar + PreviewAnnotation** | NOT in BoardFullscreen (**F7**) |
| Laser pointer | **MISSING** | — |
| Select/move/transform existing strokes | **MISSING** (select = pointer pass-through only; no marquee, no move/resize of a placed mark) | — |
| Shape fill / dashed / opacity-per-stroke control | **MISSING** | — |
| Sticky-note "tool" | present only in BoardFullscreen, but it is a **widget-drop**, not annotation (`BoardFullscreen.tsx:197,271`) | — |

### The four docks
1. **`BoardToolbar`** (`annotation/BoardToolbar.tsx`) — the full horizontal annotation
   toolbar (all 8 tools + swatches + width + undo/redo + Clear). Rendered ONLY in
   `centerMode === "resource"` (`TeachWorkspace.tsx:1290`). **Not shown over the
   widget board grid, and not in present mode.**
2. **`ToolDock`** (`annotation/ToolDock.tsx`) — a floating, draggable mini-cluster
   (select / pen / text) + four disabled "Soon" tiles (sticky/timer/dice/poll).
   Rendered alongside BoardToolbar in the SAME resource view (`:1284`).
3. **`BoardFullscreen` markup panel** (`board/fullscreen/BoardFullscreen.tsx:423`) —
   a vertical left/right-dockable panel (select/pen/highlighter/eraser/text/sticky +
   6 color dots + undo/redo/clear). This is the **present-mode** drawing UI and is a
   **hand-rolled re-implementation** of the toolbar (own local state, own color
   table `MARKUP_COLORS`, own tool list `TOOLS`).
4. **`ToolsDock` / `ToolsModule`** (`tools/ToolsDock.tsx`, `left/modules/ToolsModule.tsx`) —
   UNRELATED to drawing: a stack of teaching *widgets* (timer/dice/poll/…),
   persisted via `lib/teach/use-docked-tools.ts`. Named "Tools," which collides
   conceptually with the drawing "tools." Pure widget-dock; out of the annotation
   path but a naming/IA source of confusion (**C3**).

So the same engine drives **3 different drawing toolbars** with **3 different color
palettes** and **2 different code paths** (one shared component, one bespoke).

---

## (b) FLAWS / BUGS

### F1 — CRITICAL — Present-mode annotations auto-persist; violates the NEW ephemeral requirement
`components/teach/board/fullscreen/BoardFullscreen.tsx:230`
```ts
const annotations = useBoardAnnotations({
  lessonId: board.masterLessonId,
  boardId: board.id,
  resourceId: activePage?.id ?? null,
  // <-- NO `ephemeral: true`
});
```
`useBoardAnnotations` writes to localStorage on **every committed stroke**
(`use-board-annotations.ts:362-373`, `writeEntry`). So in Present mode, the instant
a teacher finishes a pen stroke it is saved to
`mycurricula:user:teach-annotations:<uid>` under the board/page key — there is **no
"present is ephemeral" gate and no end-of-session "Save these annotations?" prompt**.
The requirement ("writing/annotating must NOT auto-create a saved board;
annotations are ephemeral during present; prompt at the END") is **entirely
unmet**. Worse, because the key is board+page scoped, the ink silently **reappears**
the next time that board is opened (present or resource view) — a surprise
persistence the owner explicitly does not want.
**Fix:** run the present-mode hook with `ephemeral: true`, buffer strokes in memory,
and on `onExit` show a "Save these annotations?" dialog that, on Yes, writes the
buffered `BoardAnnotations` into a board (the only persistence path).

### F2 — HIGH — No exit interception in Present mode → annotations lost or saved with zero user control
`BoardFullscreen.tsx:299` (`onExit()` on Esc) and `TeachWorkspace.tsx:1125`
(`onExit={() => dispatch({ type: "setPresent", present:false })}`).
Exit is immediate and unconditional. Combined with F1 this is lose-lose: ink is
*already* persisted (no prompt to discard), yet the *act of exiting* does nothing
intentional with it. There is no hook to ask "save / discard," no dirty check, no
`beforeunload`. **Fix:** gate `onExit` behind a save-prompt when
`annotations.strokes.length > 0`; only then dispatch `setPresent:false`.

### F3 — HIGH — Object eraser is point-sampled, skips fast drags (gaps), and can't be continuous over shapes
`AnnotationLayer.tsx:162-166` + `use-board-annotations.ts:475`. The eraser only
hit-tests the single current pointer point per move event; it does **not**
interpolate between the previous and current sample, so a fast erase drag leaves
un-erased strokes between samples (the pen path uses `getCoalescedEvents` for
exactly this reason, but the eraser branch returns before reaching it). Also
`eraseAt` no-ops entirely until the box is measured (`:480`) — correct for safety
but means the very first erase after mount can silently do nothing.
**Fix:** in the eraser move branch, walk coalesced events (or interpolate
prev→curr) and `eraseAt` each.

### F4 — HIGH — Highlighter uses `globalCompositeOperation:"multiply"` on a transparent canvas → ink can render invisibly / wrong
`lib/board-annotations.ts:364-369`. The overlay canvas is fully transparent
(`AnnotationLayer.module.css:33`, no background). `multiply` blends the source
against the **canvas** pixels, not the board underneath the canvas — and multiply
against transparent (0,0,0,0) yields a transparent or near-black result depending
on the browser's premultiplied-alpha handling. The highlighter will not read as a
translucent marker over the projected content the way `mix-blend-mode` on the DOM
layer would. At minimum it is browser-dependent. **Fix:** drop the canvas-level
`multiply` and rely on `globalAlpha` (already set to 0.4), or move the highlighter
to a separate DOM layer with CSS `mix-blend-mode: multiply` so it multiplies
against the board, not the empty canvas.

### F5 — MEDIUM — Redraw is O(all strokes) on EVERY pointer move; whole board repaints per sample
`use-board-annotations.ts:343` (`redraw` clears + redraws **every** committed stroke
plus the draft) fires from the `state.strokes/draft` effect (`:348`) on each
`APPEND`/`UPDATE_LAST`. For a long lesson with dozens of strokes, every freehand
sample re-rasterizes the entire scene. rAF-batching caps it to one repaint/frame
(good) but it is still full-scene each frame. **Fix:** paint committed strokes to a
cached layer and only redraw the live draft on top during a drag (composite the two
on commit).

### F6 — MEDIUM — Every stroke causes a full React re-render of the workspace
`use-board-annotations.ts:493` returns a memo keyed on `state.strokes`/`state.draft`;
`APPEND` produces a new `draft` object each move, so the hook's return identity
changes every sample, re-rendering `AnnotationLayer` and its `TeachWorkspace`
parent throughout a drag. The canvas paint is imperative (refs), so this React
churn is pure overhead. **Fix:** keep the draft in a ref during the drag and only
push it into reducer state on commit (or expose draft via a ref + manual redraw).

### F7 — MEDIUM — Present mode (BoardFullscreen) offers no stroke-width control
`BoardFullscreen.tsx:389` renders `<AnnotationLayer … />` with **no `width` prop**,
so all present-mode strokes use the per-tool default (`toolDefaults`, pen=3) with no
way to go thicker/thinner — the one surface most needs bold projector strokes.
Meanwhile BoardToolbar and PreviewAnnotation both expose a 3-step width picker. The
markup panel has room. **Fix:** add the width radiogroup to the panel and thread it
into the layer.

### F8 — MEDIUM — Text-tool input loses its content if it loses focus to another control; commit-on-blur is lossy and the textarea ignores stroke width
`AnnotationLayer.tsx:248` commits on blur. Clicking a color/width control (or the
toolbar) while a text draft is open blurs the textarea and commits prematurely with
whatever was typed; there is no explicit confirm/cancel affordance beyond
Enter/Esc, which a touch user can't easily reach. Also the text font is a fixed
`22px` (`AnnotationLayer.module.css:54`) / `DEFAULT_TEXT_PX = 22`
(`board-annotations.ts:332`) regardless of the chosen stroke width, so "thick" does
nothing for text. **Fix:** commit only on Enter / explicit ✓, keep the draft across
unrelated focus changes, and map width → text size.

### F9 — MEDIUM — Hardcoded `font-size: 22px` in the textarea breaks the tokens-only rule and desyncs from the canvas text size
`AnnotationLayer.module.css:54` (`font-size: 22px`) duplicates the magic number in
`board-annotations.ts:332`. Two independent literals that must stay equal for the
typed text to match the rendered stroke; a change to one silently misaligns them,
and 22px is a hardcoded px size CLAUDE.md §4 forbids. **Fix:** drive both from one
token / shared constant.

### F10 — LOW — `idCounter`/`Date.now()` stroke ids can collide across two surfaces mounted in the same ms; HYDRATE drops redo silently
`use-board-annotations.ts:410`. Two annotation hooks (e.g. resource view + a preview)
mounting in the same millisecond share the `Date.now()` seed and each restart their
own `idCounter` at 0, so ids like `stroke-<ts>-1` can repeat across surfaces. Harmless
today (ids are per-surface) but fragile if strokes are ever merged/saved together
(the save-prompt model will do exactly that). Separately, `HYDRATE` resets undo+redo
(`board-annotations.ts:127`), so an account/page switch silently discards redo —
acceptable but undocumented at the call site. **Fix:** use `crypto.randomUUID()` for
ids.

---

## (c) CROWDING / REDUNDANCY

### C1 — HIGH — Two drawing docks stacked on the SAME resource view (BoardToolbar + ToolDock)
`TeachWorkspace.tsx:1284-1300`. The resource center mode renders BOTH the full
`BoardToolbar` (which already has select/pen/text + everything else) AND the
floating `ToolDock` whose only live tools are **select / pen / text** — a strict
subset already present two rows up. The ToolDock adds a draggable, z-stacked overlay
plus four disabled "Soon" tiles (`ToolDock.tsx:58`) that advertise unbuilt features
on top of live content. This is the "too many things open at once" complaint
directly: redundant tools + dead "Soon" chrome floating over the canvas.
**Fix (Wave-1 declutter):** drop `ToolDock` from the resource view (BoardToolbar
already covers it), or collapse the two into one. Remove the "Soon" tiles until
those widgets ship.

### C2 — HIGH — The annotation toolbar is duplicated as a bespoke re-implementation in BoardFullscreen
The present-mode markup panel (`BoardFullscreen.tsx:423-515`) reproduces tool
selection, color dots, and undo/redo/clear by hand with its **own** state, its
**own** color palette (`MARKUP_COLORS`, 6 colors that don't match BoardToolbar's 8
`ANNOTATION_SWATCHES`), and its own glyph set. Same engine underneath, two divergent
UIs and palettes. A teacher who learns the resource-view colors meets a different
set in Present mode. **Fix:** extract one shared annotation-controls component
(horizontal + vertical variants) with one palette; have both surfaces consume it.

### C3 — MEDIUM — "Tools" naming collision: widget dock vs. drawing tools
`tools/ToolsDock.tsx` + `left/modules/ToolsModule.tsx` present a panel literally
titled "Tools" (`ToolsDock.tsx:120`) for *widgets*, while the drawing controls are
also universally called "tools" (BoardToolbar `aria-label="Annotation tools"`,
ToolDock `aria-label="Quick tools"`). Three things called "tools," two unrelated
meanings. IA confusion that compounds the crowding. **Fix:** rename the widget dock
("Widgets" / "Teaching widgets") and reserve "tools" for drawing, or vice-versa —
but disambiguate.

### C4 — LOW — ToolDock z-index/placement can overlap BoardToolbar and resource chrome
`ToolDock` is `position`-floating and draggable within `resourceContainerRef`
(`TeachWorkspace.tsx:1287`); nothing constrains it away from the BoardToolbar strip
or the resource toolbar, so its default placement and any drag can occlude live
controls (and, under reduced motion, it's pinned with no way to move it off them).
Folds into C1's fix.

---

## (d) CONNECTIONS

- **State owner:** `TeachWorkspace.tsx` holds `activeTool` (reducer, `:195`),
  `colorId` + `strokeWidth` as local UI state (`:344-345`), and ONE
  `useBoardAnnotations` instance for the resource view (`:590`). BoardToolbar +
  ToolDock + AnnotationLayer all share that instance and dispatch `setTool`.
- **Present mode is a separate subtree:** when `state.present`, the whole workspace
  is replaced by `BoardFullscreen` (`:1118`), which spins up its **own** annotation
  hook and its **own** tool/color state — disconnected from the workspace's
  `activeTool`/`colorId`/`strokeWidth`. So tool/color choices do NOT carry between
  the editing view and Present.
- **Scratch path:** `PreviewAnnotation.tsx` is the only surface that correctly
  passes `ephemeral: true` (`:146-151`) — it is the working template for what
  Present mode should do (in-memory only, wiped on close). The new save-prompt model
  is essentially "PreviewAnnotation's ephemerality + a save dialog on exit."
- **Persistence seam:** all persistence funnels through `writeEntry`/`readEntry` in
  `use-board-annotations.ts` keyed by `lessonId:boardId:resourceId` and namespaced
  per authenticated uid (`:54`, finding #19 isolation). `onChange` is the documented
  swap point for a future `board_annotations` table. The save-prompt feature should
  reuse `toAnnotations(state)` (`board-annotations.ts:230`) as the payload.
- **Widget dock** (`use-docked-tools.ts`) is fully independent: its own `LS_KEY`
  (`teach-docked-tools-v1`), not uid-namespaced, structure-only. No connection to
  the annotation store.

---

## (e) MUST-HAVE STATUS

### #5 — Annotate with markup/pen, text, and shape tools
**Status: SUBSTANTIALLY PRESENT, with caveats.**
- Pen ✅, text ✅, shapes (rect/line/arrow) ✅ — all implemented in the engine and
  exposed in `BoardToolbar`. Highlighter ✅ (but rendering is suspect, **F4**).
  Eraser ✅ (but sampling gap, **F3**). Undo/redo/clear ✅. Color ✅. Width ✅
  (except Present, **F7**).
- **Gaps vs a complete markup toolset:** no laser pointer; no select/move/transform
  of an existing mark (the "select" tool only passes pointers through); no per-stroke
  opacity/dashed/fill options.
- **Shape/text reach is uneven:** shapes exist ONLY in `BoardToolbar` (resource
  view). `BoardFullscreen` (Present) and `PreviewAnnotation` (scratch) expose **no
  shape tools at all** — so in front of a class you can pen/highlight/text but cannot
  box/arrow. For a "present to the class and annotate" must-have, missing shapes in
  Present mode is a real shortfall.

### Ephemeral-in-present + save-prompt-at-end
**Status: NOT IMPLEMENTED (the engine can support it cheaply).**
- Present mode currently **auto-persists every stroke** (F1) and **exits without any
  prompt** (F2). There is **no "Save these annotations?" dialog anywhere** in the
  codebase (confirmed by grep across the Teach tree).
- The mechanism to implement it already exists and is proven: `ephemeral: true`
  (used by `PreviewAnnotation`) gives in-memory-only ink; `toAnnotations(state)`
  serializes the buffer; `writeEntry`/`onChange` (or the future board write) is the
  save sink. The work is: (1) flip BoardFullscreen's hook to `ephemeral`, (2)
  intercept `onExit` with a save/discard dialog, (3) on Yes, persist the buffered
  `BoardAnnotations` into a board. Low risk, high alignment with the new requirement.

---

## Severity tally
- **Critical:** F1.
- **High:** F2, F3, F4, C1, C2.
- **Medium:** F5, F6, F7, F8, F9, C3.
- **Low:** F10, C4.
