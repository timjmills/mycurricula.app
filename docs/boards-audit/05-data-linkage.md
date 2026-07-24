# Teach / Learning-Boards — Data Model, Persistence, Tagging & Boards-as-Resource Audit

**Scope:** the board DATA layer only — `lib/teach/types.ts`, `queries.ts`, `actions.ts`,
`mock-source.ts`, `supabase-source.ts`, `board-tags.ts`, `client.ts`, `limits.ts`,
`board-migrate.ts`, `lib/mock/boards.ts`, `lib/types.ts`, `lib/board-embed.ts`, plus the two
UI creation entry points in `components/teach/`. READ-ONLY audit. Date: 2026-06-13.

This is a planning input for the WAVES redesign. It is NOT a fix list. Severities are
relative to the new MUST-HAVE requirements (size / multi-page / phase-tagging /
boards-as-resource / no-auto-create / ephemeral-vs-saved annotations), not to the current
shipped prototype's own goals.

---

## (a) INVENTORY — the key types (verbatim shapes)

The **persistable DOMAIN** types live in `lib/types.ts`. The **transient view-state** types
live in `lib/teach/types.ts` (never persisted; the integration contract for the UI zones).

### `Board` — `lib/types.ts:555`

```ts
interface Board {
  id: string;
  masterLessonId: string | null;      // lesson link (null = sandbox/library/detached)
  ownerId: string | null;             // teacher for a personal board; null = team set
  scope: BoardScope;                  // "personal" | "team"
  title: string;
  displayOrderWithinLesson: number;   // pill-strip order
  templateId: string | null;
  background?: string | null;         // bg catalog id (e.g. "pattern-3")
  tags?: BoardTag[];                  // library + auto-surface tags; absent = untagged
  whiteboard?: boolean;               // free-form blank canvas flag
  ephemeral?: boolean;                // unsaved scratch — does NOT count toward cap
  libraryVisibility?: BoardLibraryVisibility; // "private" | "team"
  publishedBy?: string | null;        // provenance (team-library copy)
  sourceBoardId?: string | null;      // provenance (copy origin)
  pages?: BoardPage[];                // 5.31 multi-page; authoritative when present
  boardTheme?: ThemeOverride;         // board-wide appearance
  repeat?: RepeatSchedule;            // REAL schedule/lesson/day/week/subject links
  widgets: Widget[];                  // legacy flat list + page-0 MIRROR
  gradeLevelId: string;
  createdAt: string;
  updatedAt: string;
}
```

### `BoardPage` — `lib/types.ts:542`

```ts
interface BoardPage {
  id: string;
  order: number;            // 0-based
  title?: string;           // defaults to "Page N"
  widgets: Widget[];        // free-form canvas widgets on this page
}
```

### `BoardTag` / `BoardTagKind` — `lib/types.ts:371,382`

```ts
type BoardTagKind = "subject" | "lesson" | "phase" | "weekday" | "week" | "slot" | "label";
interface BoardTag { kind: BoardTagKind; value: string; label?: string; }
```

`phase` value = a lesson-phase slug ("warm-up"); `lesson` value = a master lesson id.

### `Widget` — `lib/types.ts:510` (key fields)

```ts
interface Widget {
  id; boardId; type: WidgetType; title;
  position: WidgetGridPosition;   // LEGACY grid (col/row/colSpan/rowSpan)
  canvas?: CanvasPosition;        // 5.31 free-form {x,y,w}; wins when present
  appearance?: ThemeOverride;
  displayOrder; pinned;
  config: Record<string, unknown>; // STRUCTURE only — no names
  state: Record<string, unknown>;  // live interactive state — no names
  persistence: WidgetPersistence;  // "inherit" | "persist" | "reset_each_session"
  gradeLevelId;                    // denormalized from board
}
```

`WidgetType` (`lib/types.ts:274`) already includes `"resource"` (an embedded resource card
on the canvas) and `"note-view"` (a multi-page resource slideshow). There is **no annotation
widget type** and **no annotation field on Board/Widget/BoardPage at all.**

### View-state (transient, `lib/teach/types.ts`)

- `BoardLayout = "1up"|"2up"|"3up"|"2x2"|"2x3"|"3x3"` — a CSS-grid arrangement of cells, NOT
  a paper size. (line 20)
- `BoardTool = "select"|"pen"|"highlighter"|"eraser"|"rect"|"line"|"arrow"|"text"` — the live
  annotation toolbar. **In-memory only**; `TeachWorkspaceState.activeTool` holds the current
  tool (line 158) but **no annotation geometry is stored or persisted anywhere.** (line 41)
- `TeachWorkspaceState` (line 131) carries `present: boolean` (line 148) and `sandbox` /
  `sandboxDirty` (lines 156,159) but **no annotation buffer, no "annotations dirty" flag, and
  no save-at-end-of-present model.**

### `TeachResource` — `lib/types.ts:631` (the resource shape)

```ts
interface TeachResource extends LessonResource {
  kind: "pdf"|"link"|"video"|"doc"|"image"|"slides"|"tool";  // NO "board" member
  defaultRenderTarget: ResourceRenderTarget;
  tags: string[];
}
```

---

## (e) MUST-HAVE STATUS TABLE

| # | Requirement | Status | Where |
| --- | --- | --- | --- |
| 3 | Attach board to a lesson | **PRESENT** | `Board.masterLessonId`; `copyBoardToLesson`, `replacePersonalSetForLesson` |
| 3 | Attach board to a specific **phase** | **PARTIAL (tag-only, soft)** | `BoardTag{kind:"phase"}`; no hard phase FK, no phase entity |
| 8 | Boards tagged to lessons/phases OR untagged | **PRESENT** | `tags?:BoardTag[]` optional; untagged = `tags` absent/empty |
| 8 | Untagged boards on a Boards page | **PRESENT (data)** | `listMyBoards` returns all kept boards regardless of tags |
| 9 | Board counts as a RESOURCE / appears in resource lists | **MISSING** | no `Board→TeachResource` adapter; `kind` has no `"board"`; flow is resource→board only |
| 10 | Boards created ONLY on explicit open/add/attach/create | **VIOLATED** | `listBoardsForLesson` auto-seeds a 5-phase team set on first lesson-open |
| NEW | Board **size** (A4/A3/16:9) field | **MISSING** | no field on `Board` or `BoardRow`; `BoardLayout` is a grid, not a page size |
| NEW | Multi-page model | **PRESENT** | `Board.pages: BoardPage[]`; `listPages/addPage/deletePage/reorderPages` wired in both sources + `boards.pages` jsonb |
| NEW | Per-page background | **PARTIAL** | background is **board-level** (`Board.background`); `BoardPage` has no `background` |
| NEW | Ephemeral-vs-saved **annotation** persistence shape | **MISSING** | no annotation type persisted; only a transient `activeTool` enum + ephemeral canvas strokes (not in the data model) |
| — | Supabase wired end-to-end | **PARTIAL — built but gated OFF; client read-path not swapped** | see verdict below |
| — | Master/Personal forking for boards | **PRESENT (board-set forking, not lesson-fork semantics)** | `scope` + personal-over-team fallback; see (f) |

---

## (b) FLAWS / BUGS (data integrity, races, silent failures)

**F1 — `listBoardsForLesson` AUTO-CREATES a default board set on first lesson-open.**
`mock-source.ts:213` (`setForLesson`) and `supabase-source.ts:833-850` (`seedDefaultTeamSet`)
both lazily INSERT a full 5-phase team board set the first time any lesson is opened with no
existing boards. *Severity: HIGH (directly violates new req #10).* This is the exact
"auto-made per presented lesson" behavior the owner now does NOT want. *Fix: gate seeding
behind an explicit user action (return `[]` from `listBoardsForLesson` on an empty lesson;
move default-set creation into `handleAddBoard` / a "Start from default phases" button).*

**F2 — `seedDefaultTeamSet` is a check-then-act race with data-loss potential.**
`supabase-source.ts:833-850` (documented "KNOWN LOW RISK" at 838): two teachers first-opening
the same lesson simultaneously both observe an empty set and both seed; the loser hits
`uniq_boards_team_lesson_title` and the **whole open fails with a raw error** (not a silent
dup). *Severity: MEDIUM* (LOW today — single beta teacher). *Fix: atomic seed via
`on conflict do nothing` upsert or a `teach_seed_default_set` RPC — but moot if F1 removes
auto-seeding entirely.*

**F3 — `TeachWorkspace` load effect swallows every error to an empty board list.**
`components/teach/TeachWorkspace.tsx:451` `.catch(() => setBoards([]))`. Any repo/RLS/network
failure renders as "no boards" with **no toast, no log, no retry** — indistinguishable from a
genuinely empty lesson. *Severity: MEDIUM (silent failure).* *Fix: surface a consequence toast
+ console.error; distinguish "error" from "empty".*

**F4 — `updateBoard` mock has no mass-assignment guard; Supabase does.**
`supabase-source.ts:948-971` whitelists only cosmetic fields (title/order/background/tags/
theme/repeat) and drops structural keys (scope, ownerId, libraryVisibility, …) — a documented
defense against the `'use server'` dispatch being POSTed a malicious patch. The **mock**
(`mock-source.ts:328` `Object.assign(board, patch, …)`) applies the **entire patch verbatim**.
*Severity: MEDIUM (divergence + latent privilege bug if the mock ever backs a multi-user
path).* *Fix: apply the same whitelist in the mock so the two sources can't diverge in
behavior the UI relies on.*

**F5 — `widgetPatchToRow` cannot move a widget between pages.** Both sources' `updateWidget`
only ever rewrites the widget **in its current page** (`mock-source.ts:387`,
`supabase-source.ts:1192`). There is no "move widget to page N" operation. *Severity: LOW
today, but a GAP the multi-page redesign will hit.* *Fix: add a `moveWidgetToPage(widgetId,
pageId)` repo method.*

**F6 — Sandbox boards are repo-global, not session-scoped.** `mock-source.ts` keeps the
mutable `boards` array at module scope; sandbox/ephemeral boards persist for the page's
lifetime and are visible to every `listMyBoards`/context call until discarded. The mock has
no GC for ephemerals that were never kept or discarded (e.g. a navigation away mid-sandbox).
*Severity: LOW (prototype-only).* *Fix: irrelevant once Supabase is the path; under Supabase,
ephemerals linger as rows too — needs a sweep job (see F8).*

**F7 — Orphaned ephemeral whiteboards accumulate.** `createBlankBoard` inserts `ephemeral:
true` rows (`supabase-source.ts:1697`); they only clear via `keepBoard` or explicit
`deleteBoard`. A teacher who opens a whiteboard then closes the tab leaves a permanent
ephemeral row (uncapped, so unbounded). *Severity: MEDIUM (unbounded growth + privacy: stale
structure rows).* *Fix: a periodic "delete ephemeral boards older than N hours" job, or
delete-on-unload.*

**F8 — `pushBoardsToTeam` has no Undo despite a destructive, team-wide, irreversible delete.**
`BoardsModule.tsx:261` shows a consequence toast but the comment at 265 admits "No automatic
rollback wired in v1 (the previous team set was displaced server-side)". The old team set is
**gone** the moment the RPC commits. *Severity: MEDIUM (irreversible team-wide data loss by
one teacher).* *Fix: snapshot the displaced set into an undo buffer / soft-delete tier before
the RPC, OR an explicit "this replaces the team set permanently" confirm (the flashing-banner
pattern) rather than a post-hoc toast.*

**F9 — Page-0 widget mirror is a denormalization that can desync.** A board's widgets live in
BOTH the `pages` jsonb (authoritative) AND the flat `widgets` table (page-0 mirror).
`commitPages` keeps them in sync via the `teach_commit_board_pages` RPC (atomic), but the
`upsertWidget` flat path (`supabase-source.ts:1109`) deliberately does NOT materialize pages —
so the SAME board is read differently depending on whether `pages` is null. The audit comments
(F3/H1) show this has already caused "invisible widget" bugs. *Severity: MEDIUM (fragile
dual-write invariant).* *Fix: the redesign should pick ONE container (pages jsonb) and drop the
flat-table mirror, or formalize page-0 as a generated projection.*

---

## (c) GAPS for the NEW requirements

**G1 — No board SIZE field (A4 / A3 / 16:9).** *Severity: HIGH (new req).* Nothing on `Board`,
`BoardRow`, or the migration carries a page size / aspect ratio. `BoardLayout`
(`lib/teach/types.ts:20`) is a transient GRID arrangement (cells per board), not a paper size,
and isn't persisted. *Fix: add `Board.size?: "a4"|"a3"|"16:9"` (+ a `boards.size` text column +
the jsonb/scalar mapper line). Decide board- vs page-level (likely board-level, all pages share
a size).*

**G2 — No annotation persistence model (ephemeral-vs-saved).** *Severity: HIGH (new req).*
Present-mode annotations are entirely transient: `BoardTool` drives a drawing layer in the UI
(`TeachWorkspaceState.activeTool`, `lib/teach/types.ts:158`), but **no stroke geometry is
modeled, stored, or persisted** — there is no `Annotation` type, no `Board.annotations[]`, no
per-page annotation layer, and no "save these annotations at the end of present mode" flag.
The requirement (ephemeral by default, prompt-to-save at end) needs a brand-new shape. *Fix:
add an `Annotation`/`AnnotationLayer` type (strokes/shapes keyed to a page + optional session
id), a `BoardPage.annotations?: Annotation[]` (or a separate `board_annotations` table), and a
`saved: boolean` distinction; wire a save-at-end-of-present prompt off
`TeachWorkspaceState.present` going false.*

**G3 — Per-page background absent.** *Severity: MEDIUM (new req — "background per page").*
`Board.background` is board-wide (`lib/types.ts:570`); `BoardPage` has no `background` field.
A multi-page board cannot give page 2 a different background. *Fix: add
`BoardPage.background?: string | null`; render falls back to `Board.background`.*

**G4 — Phase linkage is a soft tag, not a hard binding.** *Severity: MEDIUM (new req #3 "attach
to a specific lesson phase").* A board attaches to a phase ONLY via `BoardTag{kind:"phase",
value:"warm-up"}` (`lib/mock/boards.ts:127`). The phase value is a **free slug**, not a FK to a
lesson-phase entity; nothing validates it against the lesson's real phase set, and two boards
can claim the same phase. There is no `Board.phaseId`. If the redesign wants "this board IS the
Warm-Up board for THIS lesson" as a first-class, validated relationship, the tag model is
insufficient. *Fix: decide whether phase stays a soft tag (flexible, current) or becomes a hard
`Board.phaseId` + uniqueness per (lesson, phase, scope). Tag model is fine for "surfaces in
warm-up contexts"; hard FK is needed for "the single warm-up board".*

**G5 — Boards are invisible to the resource system (#9).** *Severity: HIGH (new req #9).* See
(d) below — a board cannot be represented as a `TeachResource` and never appears in any resource
list. *Fix: add a `kind:"board"` (or a `boardId` discriminator) to `TeachResource`, an adapter
`boardToTeachResource(board)`, and teach the resource-list reads to union boards in.*

---

## (d) CONNECTIONS — how the pieces wire

**Lesson/phase linkage (#3/#8).**
- **Lesson:** hard link via `Board.masterLessonId` → planner `core_lesson_events.id` (FK under
  Supabase). The board set a teacher sees = personal-over-team fallback (`setForLesson`
  `mock-source.ts:209`; `supabase-source.ts:853-861`).
- **Phase:** SOFT link only, via `BoardTag{kind:"phase"}`. `board-tags.ts:114`
  `boardMatchesContext` makes a `phase`-tagged board auto-surface when the open context's
  `phase` matches. No phase entity, no FK, no validation. The seed builder auto-derives a phase
  tag from the board title (`lib/mock/boards.ts:127` `phaseSlug(o.title)`).
- **Untagged boards:** `tags` is optional; absent/empty = untagged. `boardMatchesContext`
  returns `false` for a board with no positively-matching context tag (line 127), so untagged
  boards **never auto-surface** — they're reachable only via their lesson strip or the library
  list (`listMyBoards`, which ignores tags entirely). This satisfies #8.

**Board-as-resource (#9) — TRACE (the connection that does NOT exist).**
- `lib/teach/toTeachResource.ts:82` `toTeachResource(resource: LessonResource)` maps a
  *resource* row → `TeachResource`. There is **no** `board → resource` direction.
- `TeachResource.kind` (`lib/types.ts:634`) has no `"board"` member.
- `lib/board-embed.ts` is the ONLY board↔resource bridge and it runs the **opposite** way:
  it renders a `TeachResource` full-bleed *inside* the board canvas (`resolveBoardSrc`,
  `boardEffectiveKind`). The `WidgetType` `"resource"` (`lib/types.ts:334`) likewise embeds a
  resource ONTO a board, not a board into a resource list.
- The `queries.ts` header (line 9) states "Resources do NOT flow through here … This seam is
  board/widget/template only" — boards and resources are deliberately separate data paths.
- **Conclusion:** #9 is NET-NEW. Nothing today lets a board appear in a resource list, be
  embedded as a resource elsewhere, or be counted among a lesson's resources.

**Creation entry points (#10) — full inventory.**
1. **AUTO (the one to remove): `listBoardsForLesson` first-open seed** — `mock-source.ts:213`
   / `supabase-source.ts:850` insert a 5-phase team set whenever a lesson opens empty. Fires
   from `TeachWorkspace.tsx:447` (load effect) and `:467` (reload) and `BoardsModule.tsx:329`
   (pin pre-check) — i.e. on **mere navigation to a lesson**, no user "add" action.
2. `createBoard` — explicit "Add Board": `BoardsModule.tsx:233` + `TeachWorkspace.tsx:702`.
3. `createBlankBoard` — "New whiteboard" (ephemeral). Repo `queries.ts:166`.
4. `duplicateBoard` — `queries.ts:158`.
5. `copyTeamBoardToMine` / `copyBoardToLesson` — pull from Team Library. `queries.ts:204,213`.
6. `publishBoardToTeamLibrary` — publish a copy. `queries.ts:199`.
7. `replacePersonalSetForLesson` (sandbox pin) — `BoardsModule.tsx:301`.
8. `pushBoardsToTeam` — re-inserts the pushed set as the team set. `queries.ts:112`.
   → All of 2–8 are explicit user actions. **Only #1 violates req #10.**

**Persistence seam topology.**
`teachClient` (Proxy, `client.ts:38`) → if `NEXT_PUBLIC_TEACH_USE_SUPABASE==="1"` →
`teachDispatch` server action (`actions.ts:41`) → `source()` picks `supabaseTeachSource` when
`isSupabaseConfigured()` (`queries.ts:278`), else `mockTeachSource`. Default (flag unset) →
mock directly, no server round-trip. The CLIENT-side `teach` export (`queries.ts:293`) is
**hard-wired to the mock** regardless of flag — see verdict.

---

## (f) FORKING — Master/Personal

Boards implement a **board-SET fork**, not the lesson-content fork the rest of the app uses:
- `Board.scope: "personal"|"team"` + `Board.ownerId`. A teacher sees their personal set for a
  lesson where one exists, else the team set (`setForLesson`). This is the read-side fork.
- A personal set is created EXPLICITLY (add/duplicate/pin/copy), NOT lazily on first edit of a
  team board — so the app's signature "lazy fork on first edit" does **not** apply to boards.
  Editing a widget on a team board (`upsertWidget`) mutates the **team** board in place; there
  is no copy-on-write that forks the board to personal first.
- `pushBoardsToTeam` = personal → team displacement (destructive). `replacePersonalSetForLesson`
  = its personal twin.
- **GAP vs forking model:** there is no three-tier visual provenance (unedited/modified/moved)
  and no copy-on-write at the board level; `sourceBoardId` records copy provenance but isn't a
  live fork link. *Severity: MEDIUM (design decision to confirm in the redesign — do boards
  fork like lessons, or stay set-scoped?).* Worth an explicit owner decision: today a teacher
  editing a shared team board's widget silently changes it for everyone, with no banner/toggle
  gate (the lesson-edit Master gate does not cover boards).

---

## SUPABASE-WIRING VERDICT

**Built but not live; client read-path not swapped.** Three-part state:

1. **`supabaseTeachSource` is a COMPLETE, hardened implementation** — every `TeachDataSource`
   method is implemented against the live `boards`/`widgets`/`board_templates` schema +
   `teach_*` RPCs (`teach_commit_board_pages`, `teach_replace_lesson_set`,
   `teach_grade_for_lesson`). All 5.31 columns (pages, board_theme, repeat, tags, background,
   whiteboard, ephemeral, library_visibility, published_by, source_board_id, canvas, appearance)
   are read+written. It carries extensive security hardening: structural-field whitelist on
   `updateBoard` (F1), recursive name-stripping (`stripNamesDeep`), uuid guards on `.or()`
   filters, grade-integrity via trigger, atomic displacement RPCs, source validation on
   push/pin/publish. **Mock↔Supabase parity is high and deliberately maintained** (every
   divergence is a documented audit finding).

2. **Two independent flags gate it, and they don't agree:**
   - `NEXT_PUBLIC_TEACH_USE_SUPABASE` (`client.ts:29`) — the CLIENT decides whether to route
     through the server action at all. **Default OFF** → the mock runs in-process.
   - `isSupabaseConfigured()` (`queries.ts:278`) — the SERVER decides mock vs Supabase, opting
     in on a real (non-localhost) `NEXT_PUBLIC_SUPABASE_URL` OR `TEACH_USE_SUPABASE=1`.
   - Per MEMORY, `NEXT_PUBLIC_TEACH_USE_SUPABASE` is **not yet enabled in prod** (the
     ecstatic-bohr note: "port before enabling NEXT_PUBLIC_TEACH_USE_SUPABASE=1"), so the live
     app is still mock-backed for Teach.

3. **`queries.ts` `teach` export is hard-wired to the mock** (`queries.ts:293`,
   `export const teach = mockTeachSource`). Any consumer importing `teach` (not `teachClient`)
   bypasses Supabase entirely even with the flag on. `TeachWorkspace.tsx` imports — confirm
   which: if it uses `teach` rather than `teachClient`, the flag has no effect on the main
   surface. (The seam comment at `queries.ts:290` flags this as "the remaining wiring step.")

**Net:** the backend is real and mostly production-ready, but Teach board persistence is **OFF
in prod**; turning it on is a flag flip PLUS confirming the client surface calls `teachClient`
(not `teach`) PLUS the ecstatic-bohr port. No silent unhandled rejections in `actions.ts` (the
dispatch fail-closes on unknown methods, `actions.ts:53`); the silent-failure risk is in the
UI catch at `TeachWorkspace.tsx:451` (F3), not the action layer.

---

## TOP FINDINGS (ranked)

1. **F1 / G-context — `listBoardsForLesson` auto-seeds a 5-phase board set on first lesson-open.**
   HIGH. `mock-source.ts:213`, `supabase-source.ts:850`. Directly violates new req #10.
2. **G5 — Boards cannot be represented as resources (#9).** HIGH. No `Board→TeachResource`
   adapter; `TeachResource.kind` (`lib/types.ts:634`) has no `"board"`. Net-new build.
3. **G1 — No board SIZE field (A4/A3/16:9).** HIGH. Absent from `Board`/`BoardRow`/migration.
4. **G2 — No annotation persistence model (ephemeral-vs-saved).** HIGH. `BoardTool`/`activeTool`
   are transient; no `Annotation` type, no save-at-end-of-present shape.
   `lib/teach/types.ts:41,158`.
5. **F8 — `pushBoardsToTeam` destructive team-wide replace with no Undo.** MEDIUM.
   `BoardsModule.tsx:261-266`. Irreversible team data loss by one teacher.
6. **F3 — `TeachWorkspace` load effect swallows all errors to `[]`.** MEDIUM.
   `TeachWorkspace.tsx:451`. Silent failure indistinguishable from empty lesson.
7. **F9 — Page-0 widget-mirror dual-write invariant is fragile (already caused invisible-widget
   bugs).** MEDIUM. `supabase-source.ts:1109` vs the `pages` jsonb. Pick one container in the
   redesign.
8. **G4 — Phase linkage is a soft free-slug tag, not a validated FK.** MEDIUM.
   `BoardTag{kind:"phase"}`, `lib/mock/boards.ts:127`. Confirm soft-tag vs hard-`phaseId`.
9. **F7 — Orphaned ephemeral whiteboards accumulate unbounded (uncapped rows).** MEDIUM.
   `supabase-source.ts:1697`. Needs a sweep job.
10. **F4 — Mock `updateBoard` lacks the mass-assignment whitelist the Supabase source enforces.**
    MEDIUM. `mock-source.ts:328` vs `supabase-source.ts:948`. Divergence + latent privilege bug.
11. **G3 — No per-page background.** MEDIUM (new req). `BoardPage` has no `background`.
12. **F2 — `seedDefaultTeamSet` check-then-act race fails the loser's open with a raw error.**
    MEDIUM (LOW today). `supabase-source.ts:838`. Moot if F1 removes auto-seed.
13. **(f) — Boards don't follow the app's lazy copy-on-write fork; team-board widget edits write
    through to everyone with no Master-gate.** MEDIUM. Confirm intended forking semantics.

---

### Files reviewed (13)

`lib/teach/types.ts`, `lib/teach/queries.ts`, `lib/teach/actions.ts`, `lib/teach/mock-source.ts`,
`lib/teach/supabase-source.ts`, `lib/teach/board-tags.ts`, `lib/teach/client.ts`,
`lib/teach/limits.ts`, `lib/teach/board-migrate.ts`, `lib/mock/boards.ts`, `lib/types.ts`,
`lib/board-embed.ts`, `lib/teach/toTeachResource.ts` (+ creation entry points in
`components/teach/TeachWorkspace.tsx`, `components/teach/left/modules/BoardsModule.tsx`).
