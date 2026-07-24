# Boards Audit 06 — Resource/Notecard ↔ Board Integration + the Boards Page

**Scope:** resource/notecard ↔ board surfaces and the Boards page/library/homescreen.
**Method:** read-only code inspection (no app run). Dated snapshot 2026-06-13; verify
against current code before treating any finding as binding.
**Files reviewed (count):** 18 primary + supporting greps —
`components/teach/canvas/{BoardCanvasResource,ResourceViewerToolbar}.tsx`,
`components/teach/right/modules/ResourcesModule.tsx`,
`components/teach/left/modules/BoardsModule.tsx`,
`components/teach/library/{BoardLibraryModule,BoardLibraryCard,RepeatScheduleEditor}.tsx`,
`components/teach/board/BoardEmptyState.tsx`,
`components/teach/chrome/TeachSubBar.tsx`,
`components/teach/TeachWorkspace.tsx`,
`components/notecards/{Gallery,NotecardFullscreen,NotecardCard}.tsx`,
`components/resources/*`,
`components/daily/{ResourcesPanel,ResourceComposer}.tsx`,
`components/lesson-flow/{section-resources,resource-tile,lesson-flow}.tsx`,
`lib/board-embed.ts`, `lib/teach/{queries,toTeachResource}.ts`, `app/(teach)/teach/page.tsx`.

---

## VERDICT — Does a Boards page exist?

**NO — there is no dedicated Boards page.** The only route in the Teach area is
`app/(teach)/teach/page.tsx` (the live `/teach` workspace). Board browsing lives
ENTIRELY inside that workspace as two in-app surfaces:

1. **`BoardLibraryModule`** — a full Team/Personal browser, but it is mounted only as a
   modal **overlay** inside `TeachWorkspace` (opened via the sub-bar "Library" chip →
   `setLibraryOverlay("boards")`, `TeachWorkspace.tsx:1435–1538`). It is gated behind
   a selected lesson/board context.
2. **`BoardsModule`** — the left-rail strip of boards **for the active lesson only**
   (`components/teach/left/modules/BoardsModule.tsx`).

There is no `/boards` route (`Glob app/**/boards/** → none`), no top-level nav entry,
and no homescreen of untagged/standalone boards. **Must-have #8 (untagged boards live
on a dedicated Boards page) is MISSING as a page**; the *content* a Boards page needs
(a board grid, filters, My/Team segments, a usage meter) already exists, fully built,
inside `BoardLibraryModule` and could be lifted into a route with modest work.

---

## MUST-HAVE STATUS TABLE

| # | Must-have | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Insert resources onto a board + write on it | **PRESENT** | Drag-drop + "Open in board" both wired (`ResourcesModule.tsx:174`, `TeachWorkspace.embedResourceAtCell:940`); annotation layer writes on the resource canvas (`TeachWorkspace.tsx:1276`, `AnnotationLayer`). |
| 6 | Standalone scratch boards (tied to no lesson) | **PARTIAL — engine only, no UI** | `createBlankBoard`/`keepBoard` defined in the repo (`queries.ts:166,176`) but called by **zero** components. Only the lesson-bound `createBoard` is wired. Sandbox mode (`?sandbox=1`) is the closest thing but is reachable only by hand-typed URL and is framed as ephemeral "not saved". |
| 8 | Untagged boards on a dedicated Boards page | **MISSING (as a page)** | No route; `BoardLibraryModule` is an in-workspace overlay only. |
| 9 | A board counts as a RESOURCE / appears in resource lists | **MISSING** | No resource list (daily `ResourcesPanel`, lesson-flow `section-resources`, Teach `ResourcesModule`) ever sources a board. `toTeachResource` only maps `LessonResource`; there is no board→resource adapter. `LessonResource["type"]` has no `board` member. |
| 10 | Boards created only on explicit open/add/attach/create-from-Boards-home | **PARTIAL** | Explicit-create is honored for the wired paths (Add Board, library pull). But there is no Boards-home to "create from", and the ephemeral whiteboard contract that would make implicit-open safe is unused. |
| 11 | ANY notecard/resource card opens into a board (creating/opening one) | **MISSING** | Notecards (`NotecardCard`, `NotecardFullscreen`) and resource tiles (daily, lesson-flow) have **no** "open in board" action. The only "Open in board" lives in Teach's `ResourcesModule` and it *embeds onto the already-active board* — it does not create/open a board from the card. |

---

## (a) INVENTORY — where board-surfacing exists

- **Route:** `app/(teach)/teach/page.tsx` only. Deep links `?lesson`/`?board`/`?resource`/`?sandbox`.
- **Board browser:** `BoardLibraryModule` (Team/Personal segments, My-Library scopes,
  Filter-by-Use, tag pills, usage meter, Team strip, Tips) — overlay only.
- **Per-lesson strip:** `BoardsModule` (left rail) — thumbnails, reorder, Add board,
  Share-to-team, sandbox pin/save.
- **Sub-bar:** `TeachSubBar` — numbered board tabs + "Add Board" + "Library" chip.
- **Resource→board placement:** `ResourcesModule` (drag source + "Open in board"),
  `TeachWorkspace.embedResourceAtCell`/`handleEmbedResource`, board cell drop in
  `handleDragEnd`.
- **Resource-on-canvas renderer:** `BoardCanvasResource` + `ResourceViewerToolbar` +
  `lib/board-embed.ts` (sandbox tiers, src resolution, kind branching).
- **Library card:** `BoardLibraryCard` (preview, tag chips, Open/Duplicate/Repeat/Share/Delete).
- **Repo (board CRUD):** `lib/teach/queries.ts` (incl. unused `createBlankBoard`/`keepBoard`).

---

## (b) FLAWS / BUGS

**F1 — Standalone scratch board is dead code at the UI layer.** *Major.*
`lib/teach/queries.ts:166–176` — `createBlankBoard` (ephemeral, uncapped) and `keepBoard`
(cap-enforced promotion) are fully implemented in BOTH the mock and Supabase sources, but
`Grep createBlankBoard|keepBoard` across the repo returns only `lib/**` (types + 2 sources
+ the interface). **No component ever calls them.** The "scratch instantly, keep later"
contract that exactly satisfies must-have #6 is built and wired to nothing.
*Fix:* add an "Open scratch board" entry (Boards-home / sub-bar / left-rail) that calls
`createBlankBoard`, and a close-time "Keep this board?" prompt that calls `keepBoard`/`deleteBoard`.

**F2 — `ResourceViewerToolbar` page/zoom controls are non-functional in v1.** *Minor.*
`components/teach/canvas/ResourceViewerToolbar.tsx:60–79` — for a PDF the page label
("1 / 1"), zoom −/+ and "100%" render as `FutureControl` disabled affordances (browser owns
real paging inside the iframe). Honest, but a row of three dead controls crowds the bar (see C1).
*Fix:* collapse the PDF page/zoom cluster behind a single "PDF controls (coming soon)" affordance.

**F3 — Board-as-resource is structurally impossible today.** *Major (feature gap, not a crash).*
`lib/teach/toTeachResource.ts` only projects `LessonResource`→`TeachResource`; `LessonResource["type"]`
(used by every resource list) has no `board` variant; `lib/board-embed.ts` resolves a *resource onto a
board*, not a *board as a resource*. So #9 has no data path at all.
*Fix:* add a `board` resource type + a `boardToResource(board)` adapter and surface it in the
aggregation helpers (`lessonResources`/`lessonResourceRefs`).

**F4 — "Open in board" silently no-ops when no board is active.** *Minor.*
`ResourcesModule.tsx:303,372` + `TeachWorkspace.handleEmbedResource:969` — `onEmbedResource` is
optional and `handleEmbedResource` early-returns `if (!activeBoard) return;` with no feedback. In an
empty sandbox (no board yet) the menu item appears enabled but does nothing.
*Fix:* disable/relabel "Open in board" when `activeBoard` is null, or create a board first.

**F5 — Embedded resources are STATIC copies, not live links.** *Minor (by design, but worth flagging).*
`TeachWorkspace.embedResourceAtCell:946–962` copies `url`/`label`/`kind` into a NEW `embed` widget's
`config`. Editing the source resource later does NOT update the embedded copy; deleting the resource
leaves a dangling embed. Answers the prompt's "linked vs static" question: **static snapshot.**
*Fix (optional):* store the resource id on the widget config and resolve live, or document the snapshot semantics.

---

## (c) CROWDING / CONFUSION

**C1 — `ResourceViewerToolbar` PDF cluster crowds a small bar.** *Minor.* Five elements
(filename, page label, zoom−, 100%, zoom+) plus fullscreen + close on one row; on a narrow
canvas this is tight and three of them are dead (F2). *Fix:* hide the zoom/paging trio until pdf.js lands.

**C2 — `BoardLibraryModule` is very dense for an overlay.** *Minor.*
`BoardLibraryModule.tsx` packs a segment toggle + search + meter (top row), a sidebar with
**6** My-Library scopes + **8** Filter-by-Use entries + a usage card, a tag-pill row, the card
grid, an explainer, a Team strip, AND a Tips bar — all inside a modal panel. Two of the six
scopes (`favorites`, `archived`) intentionally match nothing (`boardMatchesScope:168–170`), so a
teacher who clicks them gets a confusing empty state for a control that "can't ever work yet".
*Fix:* hide `favorites`/`archived` until backing fields exist; this is the natural Boards-page content,
where the density is appropriate — as a modal it overwhelms.

**C3 — Two parallel "board lists" with different mental models.** *Minor.*
`BoardsModule` (left rail) = boards *for this lesson*; `BoardLibraryModule` (overlay) =
*all* boards Team/Personal. Same nouns, different scope, no cross-link from one to the other.
A teacher can't tell from the rail strip that a wider library exists except via the sub-bar chip.
*Fix:* a "See all boards" link from `BoardsModule` into the (future) Boards page.

**C4 — Library "Open" semantics are overloaded and surprising.** *Minor.*
`TeachWorkspace.tsx:1464–1533` — clicking Open on a library board does one of THREE different things
(navigate if lesson-attached; **pull a copy into the current lesson** if detached + a lesson is in
view; pull into My Boards if sandbox). A teacher pressing "Open" on a Team board may unexpectedly
create a copy and consume a cap slot. *Fix:* distinguish "Open" (view) from "Add to this lesson" (copy)
as separate actions on the card.

---

## (d) CONNECTIONS

- **Resource→board (place):** `ResourcesModule` (drag/menu) → `TeachWorkspace.embedResourceAtCell`
  → `teach.upsertWidget` (embed widget) → `reloadBoards`. Drop path: `handleDragEnd` →
  `parseBoardCellDroppableId` → `embedResourceAtCell`. **Wired.**
- **Resource→canvas (full-bleed view + annotate):** `ResourcesModule` "Magnify" /
  `?resource=` deep link → `dispatch openResource` → `centerMode:"resource"` →
  `BoardCanvasResource` + `AnnotationLayer`. **Wired.**
- **Library→workspace:** `BoardLibraryModule.onOpenBoard` → `TeachWorkspace` open handler
  (navigate or copy-pull). **Wired.**
- **Sandbox→lesson:** `BoardsModule` pin/save → `replacePersonalSetForLesson`. **Wired.**
- **Notecard/resource-card→board:** **NO CONNECTION.** Notecards and daily/lesson-flow tiles
  expose enlarge/preview/edit-note only.
- **Board→resource list:** **NO CONNECTION.** No resource list reads boards.
- **Boards-home→create:** **NO CONNECTION.** No Boards page exists to create from.

---

## (e) MUST-HAVE DEEP-DIVES

**#1 Resources on a board (`BoardCanvasResource`) — PRESENT, static.**
Resources are placed onto a board two ways: (1) drag a `ResourcesModule` card onto a board cell,
or (2) the card's "Open in board" menu item → `embedResourceAtCell`, which mints an `embed` widget
whose `config` holds a *copy* of `{url,label,kind}` (`TeachWorkspace.tsx:946`). They are **static
snapshots**, not live links (F5). The full-bleed annotate-on-resource path is separate
(`BoardCanvasResource` + `AnnotationLayer`) and works. Crowding in `ResourceViewerToolbar`: yes, mild (C1).

**#6 Standalone scratch boards — PARTIAL.**
Engine present (`createBlankBoard`/`keepBoard`) but **no UI caller** (F1). `?sandbox=1` mode is the
only lesson-less surface and it's URL-only + "not saved"-framed (`BoardsModule.tsx:348`). No
discoverable "new blank board" button anywhere.

**#8 Boards page — MISSING (verdict above).** Content exists in `BoardLibraryModule`; route does not.

**#9 Board-as-resource — MISSING.** No type, no adapter, no list integration (F3).

**#11 Notecard/resource → board — MISSING.** The only "Open in board" (`ResourcesModule.tsx:174`)
embeds onto the *current* board and does not exist on notecards or the daily/lesson-flow tiles. There
is no action anywhere that turns a card INTO (or opens it AS) a board.

---

## TOP RECOMMENDATIONS (priority order)

1. **Build the Boards page (#8).** New route (e.g. `app/(teach)/boards/page.tsx` or a planner-shell
   route) hosting `BoardLibraryModule` as a full page; add a nav entry. Reuses existing, tested UI.
2. **Wire the scratch-board engine (#6).** Surface `createBlankBoard` + a close-time `keepBoard`
   prompt from the Boards page / sub-bar / left rail.
3. **Add "Open in board" to notecards & resource tiles (#11).** A card action that calls
   `createBlankBoard` (or opens the active board) and embeds the card — the create-on-open path (#10).
4. **Add board-as-resource (#9).** `board` resource type + `boardToResource` adapter + surface in
   the three resource lists.
5. **De-crowd `ResourceViewerToolbar` (C1/F2)** and **hide non-functional library scopes (C2).**
6. **Disambiguate library "Open" vs "Add to lesson" (C4)** and **feed back on no-op embed (F4).**
