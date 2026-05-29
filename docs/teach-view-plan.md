# Teach View — Implementation Plan

> **Status:** Plan for review (2026-05-29). No feature code written yet.
> **Source brief:** `Documents/Claude Design/5.24.26 Teach View Handoff/teach-handoff/`
> (`spec.md`, `README.md`, `teach524.jsx` — 11 artboards T1–T11).
> **Author workflow:** plan-first. This document is the checkpoint; implementation
> begins only after Tim approves the scope, the architecture, and the open
> questions in §13.

This plan was assembled from the design brief plus three deep investigations of
the current codebase (architecture/integration, resource-rendering + annotation
canvas, and the Supabase data model). It honours `CLAUDE.md` and
`BUILD_STANDARD.md` throughout.

---

## 0. Scope decisions (locked with Tim, 2026-05-29)

These four answers shape everything below.

1. **Faithful core first.** Build the teaching surface from artboards
   **T1, T2, T5, T6, T7, T9, T10** (+ the T3/T4 resource-in-canvas mode — see
   #2): top/sub bars, both icon rails, collapsible left+right panels with module
   tabs, the widget grid (1-up → 3×3), the widget picker, **Present + Focus**
   modes, the empty-board state, and the Mini-Lesson board flip. **Deferred to a
   later phase:** floating windows, dragging tabs between panels, full layout
   presets, **Pop-Out** (T11) + **Duplicate** with cross-window state sync, and
   pdf.js content-anchored annotation.
2. **Resource rendering + the live board toolbar are the interactive priority.**
   The center canvas must render a real resource (PDF / Slides / YouTube / image
   / link) full-bleed (artboards T3/T4) **and** carry a working
   annotation/drawing toolbar (pen / highlighter / eraser / shapes / text /
   undo-redo / colour swatches) over it. **All other widgets are display-only
   for v1**, rendered from their payloads. A fully interactive **widget library**
   (live timers, polls, randomizers, editable groups/agenda, whiteboard) is a
   dedicated follow-up phase.
3. **Mock data + localStorage now; Supabase designed-in.** v1 reads boards/
   widgets/resources from new mock fixtures and persists per-teacher workspace
   layout to `localStorage`, exactly as `use-rail-layout.ts` and
   `tooltip-dismissal.ts` already do. **But** the plan includes a complete,
   ready-to-apply Supabase migration, the TS types, and a repository seam so the
   backend can be switched on with a localized change (§11).
4. **Plan-first.** Write this doc, push it, and pause for review before any
   feature code.

---

## 1. What the Teach view is

A new top-level **Teach** surface: the live, in-class delivery screen. A teacher
opens it during a lesson and gets one workspace that combines the lesson plan
(read-only context from Daily), an interactive **Teaching Board** (a configurable
widget grid + a full-bleed resource viewer with annotation), the lesson's
resources, and ambient context (notes, groups, chat, to-do). The intent: the
teacher never leaves the app mid-lesson.

It **extends** the existing Daily/Weekly/Subject/Year flow rather than replacing
it — those planning surfaces link *out* to a lesson's Teach view.

### Relationship to the product phasing

Teach is a **new surface not in the current Phase 1A/1B roadmap** (`CLAUDE.md`
§1). Tim has explicitly directed this build, so it proceeds as its own track. It
respects every standing rule: grade-scoping everywhere, the Master/Personal
forking model, configurable school week + schedule, tokens-only colour, the
dismissible onboarding-tooltip system, and the three-tier responsive contract.

---

## 2. Architecture & integration

### 2.1 Its own route group: `app/(teach)/`

**Decision: Teach lives in a new `app/(teach)/` route group, NOT under
`(planner)`.**

Rationale — the `(planner)` layout (`app/(planner)/layout.tsx`) wraps every
route in chrome that directly collides with the Teach workspace:

| `(planner)` chrome | Teach equivalent | Conflict |
| --- | --- | --- |
| `TopBar` (Daily/Weekly/… tabs, week jumper, filters) | Teach top bar (board context) + sub bar (board tabs, Present) | Two different top bars |
| `GlobalRail` (left icon rail) | Teach left icon rail (Lessons/Boards/…) | Two left rails |
| `LeftFilterPanel` | Teach left panel (lesson/boards modules) | Two left panels |
| `RightPanel` + `RightIconRail` | Teach right panel + right rail (Resources/Chat/To-do) | Two right panels |

Also, **Present** and **Full Screen** must escape the planner shell entirely.
Nesting Teach inside `(planner)` would mean fighting that chrome on every screen.

**Provider inheritance makes this cheap.** `ThemeProvider` (which itself mounts
`PaletteProvider` + the `.cp-subj` CSS bridge), `LabelsProvider`, and the Geist
fonts are all mounted at the **root** layout (`app/layout.tsx`) — so a
`(teach)` group inherits subject colours, the palette bridge, renameable
labels, and tokens *for free*. The `(teach)` layout only needs to re-mount the
two data providers that currently live in the planner layout:

```
app/(teach)/layout.tsx
  └─ AppStateProvider        (week, subject, selectedLessonId, editMode, search)
       └─ PlannerProvider    (lessons, getSections, lesson mutations)
            └─ {children}     (no planner chrome — Teach renders its own)
```

`ConsequenceToastProvider` is added only if the Team-Curriculum toggle's
confirmation toast is surfaced in Teach (likely yes — see §10 tooltips). No
`CatchupProvider` / `UnitNotesProvider` needed.

### 2.2 Routes

| Route | Renders | Notes |
| --- | --- | --- |
| `app/(teach)/teach/page.tsx` | `<TeachWorkspace initialLessonId initialBoardId initialResourceId />` | Thin server component awaiting `searchParams` (`?lesson=&board=&resource=`), mirroring `daily/page.tsx`. |
| `app/(teach)/teach/pop/page.tsx` | *(Phase 2)* detached board for second monitor (T11). | Deferred — needs cross-window `postMessage` sync. |

### 2.3 Entry points

1. **Top-nav tab.** Add `{ label: "Teach", href: "/teach", tooltip }` to the
   `VIEWS` array in `components/shell/top-bar.tsx`. It appears automatically on
   desktop and in the `≤768px` More menu (both read the same exported `VIEWS`).
   Clicking it is a full navigation **out** of the planner shell into the Teach
   group.
2. **Per-lesson deep link.** A "Teach this lesson" affordance on the Daily
   lesson detail (and optionally Weekly/Subject lesson cards) links to
   `/teach?lesson=<id>`. *(Wired in Wave 2; low-risk, additive.)*

### 2.4 Central workspace state (the integration contract)

`components/teach/TeachWorkspace.tsx` is the top-level client component. It owns
the state every zone consumes and mounts one `DndContext` for the whole surface.
Defining this contract in **Wave 0** is what lets the zone agents work in
parallel without stepping on each other:

```ts
interface TeachWorkspaceState {
  activeLessonId: string;            // master lesson id (forking §11)
  activeBoardId: string;
  centerMode: "board" | "resource";  // board grid (C) vs full-bleed resource (D)
  activeResource: TeachResource | null;
  layout: BoardLayout;               // "1up" | "2up" | "3up" | "2x2" | "2x3" | "3x3"
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  focusedWidgetId: string | null;    // Focus mode (T7)
  present: boolean;                  // Present mode (T6)
  fullscreen: boolean;
  activeTool: BoardTool;             // select | pen | highlighter | eraser | rect | line | arrow | text
  // module tab focus per panel, panel widths, etc.
}
```

- **Center boundary (C vs D):** `centerMode === "board"` → Agent C's
  `<TeachingBoard>`; `centerMode === "resource"` → Agent D's
  `<BoardCanvasResource>` + `<AnnotationLayer>`. They never share a file; they
  share this state.
- **Drag-resource-to-cell (T8):** the drag *source* is a resource card (Agent
  E), the drop *target* is a board cell (Agent C); both register against the
  one `DndContext` mounted here. The drag/drop ids + payload shape are defined
  in Wave 0.

---

## 3. The five-zone shell

Left-to-right (from `README.md` shell diagram + T1):

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TeachTopBar    wordmark · Grade · [view tabs] · search · + · bell · ? · av │
├──────────────────────────────────────────────────────────────────────────┤
│ TeachSubBar    Week ▾ · Subject ▾ · ①Warm-Up ②Mini ③Guided ④Centers ⑤Exit │
│                + Add Board · [Layout ▾ 1up 2up 3up 2x2 2x3 3x3] · ⚙ ·      │
│                Present · Pop-Out · Duplicate · Full Screen                  │
├──────┬───────────────┬───────────────────────────────┬───────────┬────────┤
│ Left │ Left Panel    │  Center: Teaching Board        │ Right     │ Right  │
│ rail │ (module tabs) │  ┌ CanvasToolbar / PDF bar ──┐ │ Panel     │ rail   │
│ 64px │ Lesson card   │  │ widget grid 1×1 → 3×3     │ │ (module   │ 64px   │
│ icons│ Lesson list   │  │   OR full-bleed resource  │ │  tabs)    │ icons  │
│ +lbl │ Boards thumbs  │  │   + AnnotationLayer       │ │ Resources │ +lbl   │
│      │ Notes/Groups/ │  └ ToolDock (floating) ──────┘ │ Chat/Todo │        │
├──────┴───────────────┴───────────────────────────────┴───────────┴────────┤
│ TeachFooter    Panels ▴ · Lessons · Resources• · Notes · Board 1/5 · Saved │
│                · ⌘P Present · ⌘/ Search · ⌘? Help                          │
└──────────────────────────────────────────────────────────────────────────┘
```

Each side has a **64px icon rail** (always visible) + a **panel** (collapsible to
the rail). The center is the persistent workspace — it can be fullscreened or
(Phase 2) popped out, but never moved or hidden.

### 3.1 Modules & default rail split (spec §3.1)

| Module | Default side | v1 behaviour |
| --- | --- | --- |
| Lessons | Left | Day's lesson list (reuse `usePlanner().lessons`) |
| Lesson | Left | Read-only lesson text + "Open in Daily" |
| Boards | Left | Board thumbnails for active lesson, + Add Board |
| Notes | Left | Free-form teacher notes (reuse Daily notes) — **display/basic** |
| Groups | Left | Student groups (from widget config) — **display-only** |
| Class | Left | Roster/attendance — **stub** (see §13 scope tension) |
| Tools | Left | Picker/dice/etc. — **stub** |
| Resources | Right | Grid/list of lesson resources (interactive: embed/open) |
| Chat | Right | Day Shoutbox (reuse Daily `<Shoutbox>`) |
| To-do | Right | Day to-do list (reuse Daily `<TodayTodos>`) |

Rails are drag-rearrangeable and the arrangement persists per teacher; a "Reset
to default rails" option restores this split. v1 ships the default split + the
persistence hook; **dragging icons between rails reuses the proven
`@dnd-kit` + `use-rail-layout`-style pattern** (§8).

---

## 4. Center: Teaching Board (board mode)

### 4.1 Board tabs

Each lesson has one-or-many boards; the default phase set is Warm-Up · Mini
Lesson · Guided Practice · Centers · Exit Ticket. They render as the numbered
pill strip in the sub bar (`+ Add Board` at the end) and as thumbnails in the
left Boards module. Clicking a tab swaps both the active state and the entire
widget mix (T1 vs T10). Boards come from `Board.widgets` via the repository
(§11).

### 4.2 Widget grid

A CSS-grid board. The layout toolbar offers **1-up, 2-up, 3-up, 2×2, 2×3, 3×3**.
Switching animates ~200ms (respecting reduced motion); existing widgets keep
their top-left anchor; new cells appear empty. Widgets snap to cells. Any widget
can **expand to Focus mode** (T7) without destroying the layout (Esc returns).
Widget reorder + resize within the grid uses `@dnd-kit` (the established repo
pattern). Empty cells show a dashed outline with a `+` (opens the picker).

### 4.3 Widget chrome (T1 hover)

Each widget tile's header reveals on hover/focus: **drag handle · pin · expand ·
settings · remove**. Chrome is hidden in Present mode for projection clarity.

### 4.4 Widget picker (T5)

`+` on an empty cell (or "Add widget") opens a centered popover with the 12
core types (Timer · I Can · Groups · Agenda · Notes · Model It · Slides ·
YouTube · Poll · Names · Manipulatives · Embed), searchable, categorized
(Display / Timing / Engagement / Content embed / Utilities).

### 4.5 Display-only widget bodies (v1)

All widgets render faithfully from their payloads but are **not interactive** in
v1 (per scope decision #2). The bodies to build (matching the prototype):
`ObjectiveWidget` ("I Can" + standard chips), `TimerWidget` (static ring +
digits), `GroupsWidget`, `ModelWidget` (bar model + fractions), `AgendaWidget`,
`NotesWidget` (paper tint), `ManipulativesWidget`, `SlidesWidget`,
`YouTubeWidget`, `PollWidget`, `NamesWidget`. The **interactive widget library**
(live timers, polls, randomizers, editable agenda/groups, whiteboard widget) is
the dedicated follow-up phase (§12).

### 4.6 Empty board (T9) & Focus (T7) & Present (T6)

- **Empty:** dashed frame, "Add your first widget" CTA + one-tap widget pills.
- **Focus:** one widget fullscreened within the canvas; Esc/click-outside
  returns. (Timer demoed at 96px in the prototype — rendered display-only in v1.)
- **Present:** all chrome hidden; thin top strip (board name, slide counter,
  prev/next, Esc-to-exit); widget chrome hidden. Functional in v1.

---

## 5. Center: Resource-in-canvas + live annotation toolbar (T3/T4 — **v1 priority**)

This is the interactive heart of v1. (Full technical design from the
annotation/resource investigation.)

### 5.1 `BoardCanvasResource` — full-bleed resource renderer

A client component taking a `TeachResource` and rendering it full-bleed,
branching on an **effective kind**. It reuses `lib/resource-embed.ts`
(`parseResourceUrl`) and the exact `allow` + `sandbox` strings from
`components/resources/ResourceEmbed.tsx` — no provider re-detection, no new
embed logic.

**Src resolution (hosted files have no public URL):**
```ts
const src = resource.url
  ?? (resource.resourceId ? `/api/resources/${resource.resourceId}` : null);
```
`/api/resources/{id}` 302-redirects to a short-lived **inline** presigned R2 URL
(`lib/r2.ts` + `app/api/resources/[id]/route.ts`) — so PDFs/images render
in-browser. Because that app-relative src won't match provider regexes, branch
on `provider`/`mimeType` **first**, then fall back to `parsed.kind`.

| Effective kind | Render |
| --- | --- |
| embed (youtube/vimeo/gslides/gdocs/gsheets/gdrive) | `<iframe>` filling board, reusing `ResourceEmbed`'s `allow`+`sandbox` |
| image | `<img style="object-fit:contain">` centered |
| video / audio | native `<video controls>` / `<audio>` |
| **pdf** | `<iframe src="/api/resources/{id}">` — **browser-native viewer (no pdf.js in v1)** |
| link (`canEmbed:false`) | `EmptyState` card "This link can't be displayed" + "Open in new tab" |

**Sandbox tiers** live in a new `lib/board-embed.ts`: a `trustedProviderSandbox`
(the current `ResourceEmbed` string, for the known Google/YouTube/Vimeo
allowlist) and a stricter `genericLinkSandbox` (drops `allow-same-origin`) for
arbitrary HTTPS links that claim embeddable. Always `referrerPolicy="no-referrer"`,
never `allow-top-navigation`. Consult the stored og-preview `canEmbed`
(`/api/og-preview`) to refuse blank iframes upfront for known frame-blockers.

> **PDF decision (deliberate):** ship v1 with the browser-native iframe (zero
> new deps, reuses infra that already works end-to-end). `pdfjs-dist` —
> rendering pages onto our own canvas for *content-anchored* annotation and
> designed chrome — is a **Phase 2** item; it carries a real Cloudflare/OpenNext
> worker-bundling cost (`workerSrc`, cmaps, fonts) that only a content-anchored
> feature justifies.

The T3/T4 **PDF viewer toolbar** (filename bar, page `1/1`, zoom `±/100%`,
fullscreen) is built as chrome above the canvas; in v1 the browser owns actual
PDF paging/zoom inside the iframe, so the custom toolbar's page/zoom controls
are display affordances (functional page/zoom arrives with pdf.js in Phase 2).

### 5.2 `AnnotationLayer` — custom `<canvas>` overlay (net-new)

There is **no** existing canvas/whiteboard/annotation code, and **no** drawing
library in the repo — this is fully net-new, built custom (no new deps).

- **Stroke model (`lib/board-annotations.ts`, pure + testable):**
  ```ts
  type BoardTool = "select" | "pen" | "highlighter" | "eraser" | "rect" | "line" | "arrow" | "text";
  type Pt = { x: number; y: number };          // normalized 0..1 of board box
  interface Stroke {
    id: string; tool: Exclude<BoardTool,"select"|"eraser">;
    color: string; width: number; opacity?: number;
    points: Pt[]; text?: string;
  }
  interface BoardAnnotations { version: 1; strokes: Stroke[] }
  ```
  Coordinates are **normalized** (fraction of the board box) so ink survives
  resize and is resolution-independent; converted to device pixels at draw time
  (`getBoundingClientRect()` × `devicePixelRatio`, standard crisp-canvas setup).
- **Undo/redo:** snapshot history (full `strokes[]` per entry, capped ~50) — at
  teaching-board stroke counts this is trivially correct and makes undo a pure
  re-render. Managed by a `useReducer` in `lib/use-board-annotations.ts`.
- **Pointer:** single `onPointerDown/Move/Up` with `setPointerCapture` +
  `getCoalescedEvents()` for smooth lines; `touch-action:none`. When tool =
  `select`, the layer is `pointer-events:none` so the underlying iframe/image is
  interactive; a draw tool flips it to capture.
- **Eraser = object eraser** (hit-test + remove whole strokes), not pixel —
  composes with the redraw-from-model architecture and is cleanly undoable.
- **Text tool:** a positioned `<textarea>` on click → commit a `text` stroke
  drawn via `ctx.fillText`. Single-style for v1.
- **Shapes (rect/line/arrow):** two-point strokes with live preview; arrow head
  computed from the angle.
- **v1 registration model — "projector glass":** the board is a fixed,
  non-scrolling frame; the annotation canvas is locked to the board box. Ink
  lives in **board-space, not resource-content-space** — scrolling a PDF
  *inside* its iframe does not move the ink (like drawing on glass over a
  projector). Content-anchored ink is Phase 2 (needs pdf.js for PDFs; cross-
  origin iframes can't expose scroll, a stated hard limit).
- **Persistence:** `BoardAnnotations` is plain JSON. v1 keeps it in React +
  optional `sessionStorage` keyed by `lessonId:resourceId`. Designed to drop
  into a DB column later via an `onChange(annotations)` callback (no v1 schema
  change).

### 5.3 `BoardToolbar` + `ToolDock`

- **`BoardToolbar`** (the live annotation toolbar, T3/T4): tool group (pen /
  highlighter / eraser / rect / line / arrow / text), colour swatches, width,
  undo/redo, clear. Built on `@/components/ui` `ToggleGroup` / `Button` /
  `Tooltip`. Colour swatches source from `--hl-*` highlighter tokens + ink/
  subject tokens (no hard-coded hex).
- **`ToolDock`** (floating bottom dock, T1): select/text/pen/sticky/timer/… —
  draggable (framer-motion `drag`, honouring `useReducedMotion()`). `sticky`/
  `timer`/poll/etc. that map to the deferred widget library render as `FutureControl`
  "Soon" tiles in v1.

---

## 6. Panels, rails, resize, collapse

- **Icon rails (64px):** stacked 24px icons + 10px label, active = filled bg +
  inner accent bar, hover tooltip with name + shortcut. Collapsible: a panel
  collapses into its rail (T2/T4). `+ More` opens all modules.
- **Module tabs:** thin header per panel; each tab = icon + label + close;
  `+` opens the module picker. (v1: open/close + focus + reorder within a
  panel. **Dragging tabs *between* panels and detaching to floating windows is
  Phase 2.**)
- **Resize:** drag handles on the inner edge of each side panel (2px hit, 6px on
  hover); double-click snaps to default width; center is the flex remainder.
  Widths persist.
- **Collapse animation:** 200ms ease-out; tab switch 120ms crossfade — both
  reduced-motion-aware.

---

## 7. Present / Pop-Out / Duplicate / Full Screen

| Action | v1 | Notes |
| --- | --- | --- |
| **Present** (T6) | ✅ | Fullscreen the center board, hide all chrome + widget chrome; thin top strip; Esc exits. |
| **Full Screen** | ✅ | Fullscreen the entire Teach view (Fullscreen API), hiding browser chrome only. |
| **Pop-Out** (T11) | ⛔ Phase 2 | New window at `/teach/pop?board=<id>` + `postMessage` state sync. Renders as a "Soon" affordance in v1. |
| **Duplicate** | ⛔ Phase 2 | Mirror board to a second window. "Soon" in v1. |

---

## 8. Persistence — `TeachWorkspaceLayout` (USER-scoped)

Per-teacher UI state, the direct analogue of `use-rail-layout.ts`. New hook
`lib/use-teach-workspace.ts` copies that file's proven SSR-safe pattern exactly:

- **Key:** `mycurricula:user:teach-workspace` (matches the `mycurricula:user:*`
  convention; scoping doctrine in `lib/app-state.tsx`).
- Initial `useState` = `DEFAULT_TEACH_WORKSPACE` (context-scoped rail split) so
  server HTML == first client paint; post-mount `useEffect` reads localStorage;
  `normalize()` repairs unknown/missing module ids; `storage` event + in-process
  bus for cross-tab/same-tab coherence.
- Stores: `panelDock`, `tabOrder`, `panelWidths`, `floatingWindows` (Phase 2),
  `iconRailLeftOrder`, `iconRailRightOrder`, `lastUsedBoardPerLesson`,
  `layoutPresetPreferences` (spec §9).
- **Migration hook:** docstring notes it migrates to the
  `teach_workspace_layouts` row in Phase 1B; localStorage stays as the offline
  cache, so the swap is additive.

Board/widget *content* (not UI layout) flows through the repository seam (§11),
not this hook.

---

## 9. Design-system mapping

All colour/type/spacing tokens come from `app/tokens.css`; **no hard-coded hex**
(`CLAUDE.md` §4). The prototype's literal palette maps cleanly:

| Prototype (`teach524.jsx`) | Token | Notes |
| --- | --- | --- |
| `T.blue #2563EB` | `var(--math)` via `.cp-subj.math` | **Derive from the lesson's subject**, not hard-coded math-blue (README note #8) — use `useSubjectColor(subjectId)` / `.cp-subj.<id>`. |
| `T.blueTile #DBEAFE` | `--math-light` / `--tag-blue-bg` | subject-tinted tile |
| `T.blueDeep #1E3A8A` | `--math-deep` / `--tag-blue-fg` | text-on-tint |
| `T.ink #0B1220` | `--ink-900` | |
| `T.ink2 #4B5563` | `--ink-700` / `--ink-500` | |
| `T.ink3 #9CA3AF` | `--ink-400` / `--ink-300` | |
| `T.line #E5E7EB` | `--ink-150` | card outline |
| `T.lineSoft #F1F2F6` | `--ink-100` | soft/hover |
| `T.pageBg #F4F6FB` | `--ink-50` | page bg |
| resource-type pills (PDF/SLIDES/…) | `--tag-*-bg` / `--tag-*-fg` pairs | per type |
| annotation colours | `--ink-900`, subject `--c`, `--urgent`, `--done`, `--writing` | |
| highlighter swatches | `--hl-lemon … --hl-*` | already exist in tokens.css |

**New tokens to add** (in `app/tokens.css`, not Tailwind): a small set of widget
canvas tints — `--board-tint-yellow|mint|sky|pink|lavender|peach` — for the
widget tile backgrounds (yellow/mint/sky/pink/lavender/peach in the brief).

**Handwriting (Notes widget):** the prototype uses `Caveat` (cursive). Adding a
font is discouraged (`CLAUDE.md`). **v1 default: use the existing Geist stack
with an italic treatment**; adding `Caveat` via `next/font/google` is an open
question (§13).

**Onboarding tooltips (`CLAUDE.md` §4):** every non-obvious control gets a
`<Tooltip>` with a stable `tooltipId` and contextual voice ("Switch the center
to the board grid", not "Toggle board"). **Always-on (`required:true`):** the
Team-Curriculum toggle (if surfaced), and any destructive action (remove widget,
delete board, reset board, clear annotations). Named panels carry a `title` on
their root for touch users.

---

## 10. Responsive plan (three tiers — hard requirement, `CLAUDE.md` §4)

Resolves the brief's open question ("degrade or redirect?"): **degrade, never
redirect.** Teach is laptop/projector-first, but must not break on phone/tablet.

| Tier | Behaviour |
| --- | --- |
| **Desktop 1024–1920** | Full five-zone shell. |
| **Tablet 600–900** | Both panels collapse to 64px rails by default; tapping a rail icon opens that panel as an **overlay drawer** over the board (one at a time). Board grid caps at 2×2; sub-bar board tabs scroll horizontally *inside* their strip (no page scroll). |
| **Phone 360–480** | Single column: rails become a bottom tab bar; panels become full-height bottom sheets. Board grid forced to **1-up** with horizontal swipe between widgets. Top/sub bars condense (board tabs → a `Board ▾` dropdown). Present mode is the natural phone experience. |

No document-level horizontal scroll at any tier; touch targets ≥44px on
phone/tablet; sticky chrome ≤~30% viewport height on phone. Verified at ~400 /
~768 / ~1280 via DevTools + `scripts/probe-uxa.mjs` before "done".

---

## 11. Supabase data model + persistence layer

v1 runs on mock + localStorage, but the migration, types, and repository seam
are designed now so the backend is a localized switch. (Full design from the
Supabase investigation; matches the existing schema's conventions exactly.)

### 11.1 Migration `supabase/migrations/20260530090000_teach_view.sql`

Adds: `boards`, `widgets`, `board_templates`, `teach_workspace_layouts`; and two
columns on the existing `resources` table (`default_render_target`,
`tags text[]`) — **resources are NOT re-modelled** (the Teach "Resource" is the
existing row; its presentation `kind` is derived from `provider`/`file_type` via
the `lib/resource-embed.ts` taxonomy, not a new enum).

Conventions matched against `20260518102823_initial_schema.sql`:

- Native enums up front: `widget_type`, `widget_persistence`
  (`inherit|persist|reset_each_session`), `resource_render_target`
  (`embed|magnify|external`), `board_scope` (`personal|team`).
- Grade-scoping: every Teach entity carries `grade_level_id` (never assume one
  grade).
- `set_updated_at()` triggers; FK + hot-path indexes; `display_order_within_lesson`.
- **Forking-aware:** a `Board` hangs off a lesson via the **master lesson id**
  (`master_core_lesson_event_id`), the same stable identity `completion_status`
  uses. Boards are modeled as **owned-per-teacher** (`owner_id` + `scope`, like
  `time_blocks`/`extra_lesson_events`) — a personal board is one teacher's
  delivery surface; a `team` board is lead-authored and shared. Sharing happens
  via "Save board as template", not a master/personal fork pair. **(This is the
  #1 open question — §13.1.)**
- **RLS** on all four tables, via the existing `security definer` helpers
  (`can_read_grade`, `is_grade_lead`, `can_edit_subject_master`) plus one new
  helper `auth_can_read_lesson(master_lesson_id)` (mirrors the polymorphic
  resolver added in the resources-embed migration). Personal rows: owner-only.
  Team rows: readable by the grade, writable by a grade lead. Widgets inherit
  their board's policy. `teach_workspace_layouts`: strictly the owning teacher's
  row (identical to `teacher_ui_state_owner`).

The complete SQL is ready to drop in (≈220 lines) — held until backend wiring so
`supabase db reset` stays green; it applies cleanly on top of both existing
migrations (FK soft-cycle `boards.template_id → board_templates.id` broken by
creating `boards` first, then `alter table … add constraint`).

### 11.2 TS types (append to `lib/types.ts`)

`WidgetType`, `WidgetPersistence`, `ResourceRenderTarget`, `BoardScope`,
`WidgetGridPosition`, `Widget`, `Board`, `BoardTemplate`, `TeachResource`
(extends `LessonResource`), `TeachPanelDock`, `TeachFloatingWindow`,
`TeachWorkspaceLayout`. TS is `camelCase`; the repository adapter maps to the
DB's `snake_case` + uuid↔slug.

### 11.3 The repository seam — `lib/teach/queries.ts`

Follows the documented `lib/admin/queries.ts` convention: the **only** module
the Teach UI imports for board/widget/template data. A `TeachDataSource`
interface with a swappable implementation:

- **v1:** `lib/teach/mock-source.ts` — in-memory store seeded from a new
  `lib/mock/boards.ts` fixture (built in `lib/mock/lessons.ts` style), optionally
  mirrored to `localStorage` so the prototype keeps a teacher's live board across
  refresh. Holds the **id bridge** (mock slugs ↔ db uuids): `resolveLessonId`,
  `resolveOwnerId`.
- **Phase 1B:** `lib/teach/supabase-source.ts` — same interface via
  `lib/supabase/{server,client}.ts`, RLS-enforced, with one `rowToBoard` /
  `boardToRow` adapter. Switching is a one-line import change in `queries.ts`.

Resources reuse the existing data path (a `toTeachResource()` adapter derives
`kind` from `provider`/`type`); **no new resource fetch path**.

---

## 12. Phasing

### Phase v1 (this build — see §14 for the agent breakdown)
The faithful core: `(teach)` route group + shell, top/sub bars + footer, both
rails + collapsible panels (default split + persistence), board tabs + widget
grid (1up→3×3) + picker + chrome + Focus + Present + empty state + Mini-Lesson
flip, **display-only widgets**, **interactive resource-in-canvas + live
annotation toolbar + ToolDock**, right-panel Resources/Chat/To-do (reusing Daily
components), localStorage workspace persistence, full token mapping + tooltips +
responsive, and the **designed-but-unwired** Supabase migration + repository
seam.

### Phase 2 (workspace power + PDF)
Floating windows + detach; drag tabs between panels; full layout presets + "save
preset"; **Pop-Out** + **Duplicate** with `postMessage` sync; pdf.js
content-anchored annotation + designed PDF chrome; rail-to-rail icon drag parity
with the shell.

### Phase 3 (interactive widget library)
Live timers/stopwatch/countdown, polls/traffic-light with results, randomizer/
name-picker, dice, editable groups + agenda (elapsed time), the whiteboard
widget, scoreboard, per-widget persistence overrides + "Reset board".

### Phase 4 (backend on)
Wire `supabase-source.ts`; apply the migration; persist boards/widgets/workspace/
annotations through RLS; realtime for team boards/chat. (Real-time student
devices, co-teaching, public sharing, marketplace remain **out of scope**, spec
§11.)

---

## 13. Open questions for Tim (review gate)

1. **Do boards fork, or are they per-teacher live state?** *(highest-stakes —
   shapes the schema.)* The spec is silent. The plan models boards as
   owned-per-teacher keyed to the master lesson (sharing via templates), because
   boards are *delivery* artifacts, not curriculum. If instead a lead should
   author a **default board that lazily forks** into every teacher's copy of a
   lesson (like `master_core_lesson_events` → `personal_..._copies`), boards need
   the two-table fork shape. **Which model?**
2. **Groups / Class scope.** Spec says these reuse existing data, but there is
   **no roster/students table** and students are explicitly out of product scope
   (`CLAUDE.md` §1). v1 treats Groups as widget-config only and Class as a stub.
   OK, or do you want a shared roster (new scope)?
3. **`Caveat` handwriting font** for the Notes widget — add via
   `next/font/google`, or keep the Geist italic fallback? (Leaning fallback to
   honour the "no new fonts" rule.)
4. **Team-board write gate** — grade-lead-only (conservative, matches deferred
   co-teaching), or any team member?
5. **Annotation persistence** — is "projector glass" (board-space, per-session)
   acceptable for v1, with content-anchored ink deferred to Phase 2?
6. **Top-nav placement** — Teach as a primary `VIEWS` tab now, or only reachable
   via per-lesson "Teach this lesson" deep links until it's further along?

---

## 14. Implementation plan — agent task breakdown

All new code under `app/(teach)/`, `components/teach/`, `lib/teach/`, plus small
touches to `components/shell/top-bar.tsx`, `app/tokens.css`, `lib/types.ts`, and
`supabase/migrations/`. Ownership is **directory-disjoint** so Wave 1 agents run
in parallel without file conflicts.

### Wave 0 — Foundation (one agent; everything depends on it)

Establishes the route group, the central workspace state contract, the data
seam, and the shell skeleton with stubbed zones.

- `lib/types.ts` — append all Teach types (§11.2).
- `lib/teach/types.ts` — view-only types (`BoardLayout`, `BoardTool`,
  `centerMode`, dnd ids/payloads).
- `lib/mock/boards.ts` — board/widget fixtures for the active mock lessons.
- `lib/teach/queries.ts` + `lib/teach/mock-source.ts` + `lib/teach/toTeachResource.ts`
  — repository seam (mock-backed) + resource adapter + id bridge.
- `lib/use-teach-workspace.ts` — localStorage workspace hook (§8).
- `app/(teach)/layout.tsx` — providers only (§2.1); `app/(teach)/teach/page.tsx`.
- `components/teach/TeachWorkspace.tsx` — shell skeleton, central state, the one
  `DndContext`, zone mount points (stubs), `index.ts` barrel.
- `app/tokens.css` — `--board-tint-*` tokens.
- `components/shell/top-bar.tsx` — add the `Teach` entry to `VIEWS`.

**Gate before Wave 1:** `npm run lint && npx tsc --noEmit && npm run build`
green with stubbed zones; the contract in §2.4 is frozen.

### Wave 1 — Five parallel agents (directory-disjoint)

| Agent | Owns | Builds |
| --- | --- | --- |
| **A — Chrome & modes** | `components/teach/chrome/*` | `TeachTopBar`, `TeachSubBar` (board tabs, layout toolbar, action cluster), `TeachFooter`, `PresentMode` (T6), Full-Screen wiring, layout-switcher; `use-teach-shortcuts.ts` (⌘1–9, ⌘L/R/J/K, ⌘/, ⌘P, Esc cascade). Pop-Out/Duplicate as "Soon". |
| **B — Left zone** | `components/teach/rails/TeachLeftRail*`, `components/teach/panels/left/*` | Left icon rail + collapsible left panel + module tabs; Lesson card, Lesson list (reuse `usePlanner`), Boards thumbs (+Add), Notes/Groups/Class/Tools (display/stub). |
| **C — Center board** | `components/teach/board/*`, `components/teach/widgets/*` | `TeachingBoard` (CSS-grid + layout switch + `@dnd-kit` reorder), `WidgetShell` (hover chrome), `WidgetPicker` (T5), `BoardEmptyState` (T9), `FocusMode` (T7), all **display-only** widget bodies, droppable cells for T8. |
| **D — Resource canvas & annotation** ⭐ | `components/teach/canvas/*`, `components/teach/annotation/*`, `lib/board-annotations.ts`, `lib/board-embed.ts`, `lib/use-board-annotations.ts` | `BoardCanvasResource` (§5.1), `AnnotationLayer` (§5.2), `BoardToolbar` + `ToolDock` (§5.3), PDF viewer toolbar chrome (T3/T4). **The v1 interactive priority.** |
| **E — Right zone** | `components/teach/rails/TeachRightRail*`, `components/teach/panels/right/*` | Right icon rail + collapsible right panel + module tabs; `ResourcesModule` (grid/list, search, filter chips, hover menu → Embed/Open Large, draggable cards for T8), `ChatModule` (reuse Daily `<Shoutbox>`), `TodoModule` (reuse Daily `<TodayTodos>`). |

Shared touch-points are read-only contracts from Wave 0 (workspace state, dnd
ids, repository). Agents C + E coordinate **only** through the Wave-0 dnd
contract for drag-resource-to-cell; C + D **only** through `centerMode`.

### Wave 2 — Integration, backend design, polish (one agent / me)

- Wire the zones together in `TeachWorkspace`; per-lesson "Teach this lesson"
  deep link from Daily.
- Land the **Supabase migration** `20260530090000_teach_view.sql` +
  `lib/teach/supabase-source.ts` (designed, **not** switched on).
- Cross-cutting: tooltips on every control (`tooltipId`/`required`), responsive
  pass (§10) at all three tiers, a11y (tab order, focus traps in Present/Focus,
  `aria-pressed` tools, live-region announcements), reduced-motion audit.
- **Verification:** `npm run lint && npm run format:check && npx tsc --noEmit &&
  npm run build`; `node scripts/probe-uxa.mjs`; manual responsive check at
  400/768/1280.
- **Codex review gate** (`CLAUDE.md` §4a) on the uncommitted diff for every
  logic/security/data-handling change (the annotation canvas, embed sandboxing,
  and the repository seam all qualify) — `codex exec --sandbox read-only` with
  the standard review prompt, before commit.

### Dependency graph

```
Wave 0 ──┬─> A (chrome/modes)
         ├─> B (left)
         ├─> C (center board) ─┐
         ├─> D (resource/annot)─┼─ share Wave-0 contracts only
         └─> E (right) ─────────┘
                                 └─> Wave 2 (integration + backend design + polish + gates)
```

---

## 15. Risks & mitigations (carry into the build)

- **Embed security** — never inject HTML; only `src`/`href`; tiered sandboxes;
  refuse blank iframes via og-preview `canEmbed`. (Codex-gated.)
- **Hosted-file src indirection** — always iframe `/api/resources/{id}` (re-signs
  on reload), never a raw presigned URL.
- **Canvas perf at 4K/DPR** — rAF-batch redraws; optionally cache committed
  strokes to an offscreen canvas and redraw only the live draft.
- **Widget `state` concurrency** (Phase 4) — add `version`/`state_updated_at`
  before realtime; or single-authoritative-window via `postMessage`.
- **`grade_level_id` denormalization drift** — documented; lessons don't change
  grade today.
- **Scope creep** — floating windows / pop-out / live widgets / pdf.js are
  explicitly Phase 2+; resist pulling them into v1.

---

*End of plan. Awaiting review (§13) before implementation.*
