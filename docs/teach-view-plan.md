# Teach View — Implementation Plan (ultraplan)

> **Status:** Plan, ready to execute wave-by-wave. Authored 2026-05-29.
> **Source of truth for design:** `Documents/Claude Design/5.29.2026 Teach View Handoff (Claude Design)/`
> — the build spec (`project/uploads/5.24.26 mycurricula-teach-view-spec.md`) and the
> artboard (`project/teach524.jsx`, 2812 lines). Recreate the artboard's visual output
> faithfully in idiomatic React; do **not** copy its inline-style structure.
> **Governing rules:** `CLAUDE.md` + `BUILD_STANDARD.md` (tokens only, responsive 3 tiers,
> ≥44px touch targets, dismissible onboarding tooltips, forking model, no new deps without need).

---

## 0. Scope decisions (locked with Tim, 2026-05-29)

| Question | Decision |
| --- | --- |
| **Entry point** | BOTH a top-bar **Teach** tab (`/teach`) AND a **Present** button on Daily. |
| **Immersion** | `/teach` renders inside the normal app shell. The **Present** button goes fullscreen-immersive, but the two side rails still surface on hover/click of the left/right edges so the teacher can add to the board. "Present" is the button label; fullscreen is an optional toggle. |
| **Data scope** | Navigable: defaults to **today / current schedule**, but the teacher can move to other days, subjects, lessons, and units. Honors the Personal/Team curriculum toggle. |
| **v1 features** | Core teaching loop + in-place edits + resources inline + keyboard/swipe/countdown — all in. |
| **Panel system v1** | Fixed zones (far rails + left/center/right panels) with **resize + collapse** (reuse `PaneSplitter`) PLUS **module tabs** (reorder within a panel) and **drag icons between rails** (persisted). **NO floating/detached windows in v1** (deferred to v2). |
| **Widget library v1** | ⚠️ **NEEDS RECONFIRM — answers conflicted.** First pass: "all four groups are must-haves." Second pass (scope): "Embed + utilities only." Plan currently assumes **all four groups, sequenced** (essentials first) and treats the second answer as "Embed + utilities are the non-negotiable floor." Resolve before Wave 4 — see §2 Wave 4 note. |
| **Persistence v1** | **Design the Supabase schema now** (spec §10: `Board`, `Widget`, `Resource`, `TeachWorkspaceLayout`, `BoardTemplate`). Tables + types defined and the app wired to read/write them. This pulls Teach into the **Phase 1B backend wave** rather than the mock-only Phase-1A pattern — a deliberate exception Tim approved. Mock fixtures still seed local dev where the backend isn't reachable. |
| **Delivery** | **Remote `/ultraplan`** (Claude Code on the web) for the rich planning pass; this doc is the seed context. Execution afterward here with agent teams, wave by wave. |

### Phasing note (important)
Per `CLAUDE.md §1/§6`, the Teach View is **net-new Phase-2+ scope**. We are building it
mock-driven (no backend), consistent with every shipped view today. Each wave is gated
(tsc + lint + build + responsive probe + Codex review) and shown to Tim before the next
wave starts. **Do not begin Wave 1 until the in-progress Weekly chrome cleanup is verified
and signed off.**

### Explicitly deferred to v2 (do NOT build in v1)
- Floating/detached windows + re-dock previews (spec §5.4).
- Pop-Out to a second browser window / second display, and Duplicate-to-window (spec §8).
  *(v1 ships **Present** fullscreen + **Full Screen**; Pop-Out/Duplicate render as
  disabled "coming soon" buttons with explanatory tooltips.)*
- Layout presets save/load (spec §5.5) — v1 ships the built-in presets as one-way applies,
  but **"Save current as preset"** is deferred.
- Board templates / "Save board as template" (spec §10 `BoardTemplate`).
- Real-time student devices, co-teaching, version history, marketplace (spec §11).
- Supabase persistence (spec §10 tables) — Phase 1B.

---

## 1. Architecture overview

### Route & shell
- New route group segment: **`app/(planner)/teach/page.tsx`** → renders `<TeachShell/>`.
  Lives in `(planner)` so it inherits auth + the Personal/Team banner, but `TeachShell`
  suppresses the default left filter panel / right panel (like the print routes do) because
  Teach owns its own chrome.
- Top-bar tab added in `components/shell/top-bar.tsx` nav array: `{ label: "Teach", href: "/teach" }`
  inserted after Daily. Mirror the existing `narrowOnly` hide logic so it degrades on phones.
- **Present** button on Daily (`components/daily/DailyView.tsx` PageHeader actions) →
  `router.push("/teach?present=1")`. TeachShell reads the `present` search param to start
  in fullscreen-immersive mode.

### Component tree (new, under `components/teach/`)
```
TeachShell.tsx              orchestrator: zones, layout state, keyboard, present/fullscreen
  TeachTopControls.tsx      sub-bar: week + subject + board-tab-strip + layout toolbar + action cluster
  TeachIconRail.tsx         far rail (left & right instances); reorderable icons, drag-between-rails
  TeachPanel.tsx            generic dockable panel: tab header + body + resize handle + collapse
    TeachTabStrip.tsx       tabs (icon+label+close), reorder within panel, "+" module picker
  TeachBoard.tsx            center: board tab strip + layout toolbar + widget grid
    WidgetGrid.tsx          CSS-grid of cells per layout (1up/2up/3up/2x2/2x3/3x3)
    WidgetTile.tsx          widget chrome (drag handle, pin, expand, settings, remove) + body slot
    WidgetPicker.tsx        categorized popover (Display/Timing/Engagement/Content/Utilities)
  widgets/                  one file per widget (see Wave 4)
  modules/                  thin adapters wrapping existing Daily surfaces as Teach modules
    LessonsModule.tsx       day's lesson list (wraps the Daily lesson list data)
    LessonModule.tsx        read-only full lesson text + "Open in Daily"
    BoardsModule.tsx        board thumbnails for active lesson, reorder, + Add Board
    NotesModule.tsx         per-lesson private teacher notes
    GroupsModule.tsx        student groups (shared with Groups widget)
    ClassModule.tsx         roster + attendance (v1: read-only roster + name picker)
    ToolsModule.tsx         name picker / dice / calculator launchers
    ResourcesModule.tsx     wraps existing ResourcesPanel ({lesson}) grid/list
    ChatModule.tsx          wraps existing <Shoutbox/>
    TodoModule.tsx          wraps existing <TodayTodos/>
```

### State & persistence (new, under `lib/`) — **Supabase-backed (Phase 1B exception)**
- **`lib/teach/teach-types.ts`** — `Board`, `Widget`, `WidgetType`, `BoardLayout`,
  `ModuleId`, `TeachWorkspaceLayout`, `RailSide`, `PanelDock`, `BoardTemplate`, `Resource`
  (kind/url_or_file_ref/thumbnail/default_render_target/tags). Mirrors spec §10 shapes,
  **snake_case DB columns** (CLAUDE.md naming). Grade-scoped — every board ties to a lesson
  which ties to subject/day/week/grade.
- **`supabase/migrations/<ts>_teach.sql`** — DDL for the spec §10 tables with **row-level
  security** (teacher owns their `TeachWorkspaceLayout`; boards/widgets scoped to the
  lesson's team + grade per the forking model). `Board`→`Lesson`, `Widget`→`Board`,
  `Resource`→`Lesson`, `TeachWorkspaceLayout`→`User`, `BoardTemplate` standalone.
  Modules backed by existing Daily data (Chat, To-do, Notes, Groups, Class) get **no new
  tables** — they surface existing sources (spec §3.5/§10 footnote).
- **`lib/teach/teach-queries.ts`** — typed Supabase reads/writes (board/widget CRUD,
  workspace-layout upsert). Follows the `lib/admin/queries.ts` convention. **Optimistic
  local cache + write-through**, so the UI stays responsive; falls back to
  **`lib/teach/teach-fixtures.ts`** mock seed when the backend is unreachable (local dev /
  the current mock-only deploy), keeping parity with how views render today until 1B lands.
- **`lib/teach/use-teach-workspace.ts`** / **`use-teach-boards.ts`** — hooks over the
  queries layer (Supabase when configured, localStorage+fixtures otherwise), same SSR-safe
  hydration + write-gate discipline as `lib/weekly-schedule-state.ts`. Per-widget persistence
  override (timer resets / ink persists / poll persists) + Reset-board.
- Reuse existing `usePlanner()` for lessons, `useAppState()` for week/subject/Personal-Team.

> **Coordination flag:** wiring real Supabase here is the first backend write in the repo
> (everything else is mock-driven, CLAUDE.md §1). The schema + RLS must be reviewed against
> the broader Phase-1B data-model plan in `Documents/Project Files/5.16.26 planning_document.md §4`
> so Teach's tables don't diverge from the forthcoming forking-persistence design. This is a
> primary reason to run the remote `/ultraplan` pass before building.

### Reuse map (do NOT rebuild these)
| Need | Reuse |
| --- | --- |
| Resources grid/list panel | `components/daily/ResourcesPanel.tsx` (`{lesson}` prop) + `components/lesson-flow/resource-tile.tsx` + `resource-type-pill.tsx` |
| Chat | `components/daily/Shoutbox.tsx` |
| To-do | `components/daily/TodayTodos.tsx` |
| Lesson text / sections | `components/daily/LessonDetail.tsx` (read-only mode) |
| Schedule/day awareness | `components/schedule/ScheduleDayPane.tsx`, `lib/use-school-week.ts` |
| Resize splitter | `components/daily/PaneSplitter.tsx` |
| Segmented controls | `components/ui/ToggleGroup.tsx` |
| Title row | `components/ui/PageHeader.tsx` |
| Tooltips (dismissible) | `components/ui/Tooltip.tsx` + `lib/tooltip-dismissal.ts` |
| Drag/drop | `@dnd-kit` (already used by WeeklyShell column reorder + WeeklyGrid) |
| Subject color | `lib/palette.tsx` `useSubjectColor` / `.cp-subj.<id>` |

### Hard constraints (every wave)
- **Tokens only** — all color/type/spacing via `var(--token)` from `app/tokens.css`.
  The artboard's `const T = {...}` hex values map to existing tokens; never hard-code hex/px/font.
- **Responsive** — Teach is desktop-first (it's a projector surface) but must not break:
  below ~900px collapse to a single-panel stacked view (center board + a bottom tab bar for
  modules) OR redirect to Daily — **decided in Wave 1 design spike** (spec open question §363).
- **Accessibility** — full keyboard map (spec §7.6), aria-labels on every rail icon, focus
  rings, focus-trap in Present/focus mode, live regions for timer/poll changes.
- **Reduced motion** — all 120–200ms transitions gated by `prefers-reduced-motion`.
- **The harness read-glitch** — files importing `WEEK_DAYS`/`WEEKDAY` corrupt tool reads;
  every implementing agent runs the Step-0 integrity check (counts + base64 reads) used in
  the Weekly cleanup task.

---

## 2. Waves

Each wave: implement → self-verify (tsc 0 / lint clean / build) → responsive probe →
Codex review gate (`codex exec --sandbox read-only`) → live check on `localhost:3000/teach`
→ show Tim → next wave. Agent-team split noted per wave with non-overlapping file ownership.

### Wave 0 — Design spike & skeleton (1 agent)
**Goal:** the route exists, renders the five zones with placeholder content, no functionality.
- Create `app/(planner)/teach/page.tsx` + `<TeachShell/>` shell with the 5 zones laid out
  (far-left rail, left panel, center, right panel, far-right rail) using CSS grid.
- Add the **Teach** top-bar tab + the Daily **Present** button (push `/teach`).
- Decide & document the **<900px fallback** (stacked single-panel vs redirect) — implement
  the chosen one as a stub.
- `lib/teach/teach-types.ts` with all interfaces (no logic).
**Acceptance:** `/teach` returns 200, renders 5 labeled zones, tab highlights, Present button
navigates, tsc 0, lint clean, no horizontal scroll at 1280/768/400.

### Wave 1 — Panels, rails, tabs, workspace persistence (1–2 agents)
**Goal:** the dockable-lite workspace works and remembers itself.
- `TeachPanel` + `TeachTabStrip` + `TeachIconRail` with: resize (PaneSplitter), collapse to
  32px strip, tab reorder (dnd-kit), "+" module picker, drag-icon-between-rails.
- `use-teach-workspace.ts` persisting panel widths/collapse/tab order/rail order; "Reset to
  default rails" in a panel overflow menu.
- Wire the module **adapters** that are pure reuse: `ResourcesModule` (→ ResourcesPanel),
  `ChatModule` (→ Shoutbox), `TodoModule` (→ TodayTodos). These prove the panel system with
  real content before widgets exist.
**Acceptance:** tabs/rails reorder and persist across reload; resize/collapse persist;
Resources/Chat/To-do render real mock data in panels; keyboard reaches every tab/icon;
gate green.

### Wave 2 — Lesson context modules + navigation (1–2 agents)
**Goal:** the teaching loop's context is live and navigable.
- `LessonsModule` (day's lessons), `LessonModule` (read-only `LessonDetail` + "Open in Daily"),
  `NotesModule` (per-lesson notes via planner-store), `BoardsModule` (board thumbnails +
  reorder + Add Board), `GroupsModule`, `ClassModule` (roster + name picker), `ToolsModule`.
- **Navigation:** `TeachTopControls` week selector + subject selector + day/now awareness
  (default today/current period via `lib/use-school-week.ts` + schedule); selecting a
  lesson/subject/unit swaps the active lesson and its boards. Honors Personal/Team toggle.
**Acceptance:** changing week/subject/lesson updates every module + the board set; "now"
auto-highlights the current period; in-place note edits write through planner-store and
respect forking; gate green.

### Wave 3 — Teaching Board: grid, layouts, widget chrome, picker (1–2 agents)
**Goal:** boards hold widgets in a configurable grid (no widget bodies yet).
- `TeachBoard` board-tab strip (Warm-Up…Exit Ticket + Add Board), layout toolbar
  (1up/2up/3up/2x2/2x3/3x3, 200ms animated switch), `WidgetGrid`, `WidgetTile` chrome
  (drag/pin/expand-focus/settings/remove), `WidgetPicker` popover (categorized), empty-cell
  "+" affordance, drag-resource-onto-cell → Embed pre-config.
- `use-teach-boards.ts` board/widget CRUD + per-widget persistence + Reset board.
- Focus mode (expand widget to fill board; Esc to return) with focus trap.
**Acceptance:** add/remove/move/pin widgets; switch layouts keeping top-left anchors;
focus mode + Esc; per-widget state persists per its default; drag a resource tile to embed;
gate green.

### Wave 4 — Widget library (2–3 agents, split by group; sequenced)
> ⚠️ **RECONFIRM SCOPE FIRST.** Tim's two answers conflicted (all-four vs Embed+utilities-only).
> This plan assumes **all four groups** with **Embed + utilities as the non-negotiable floor**:
> if the wave runs long, ship Embed+utilities + Core display, and the remaining Timing/
> Engagement widgets render as "coming soon" tiles. Confirm in the remote ultraplan pass.
Each widget = `components/teach/widgets/<Name>.tsx` implementing the `WidgetTile` body slot
+ its settings + persistence default. Build **in this order** so the confirmed floor lands first:
1. **Embed + utilities (floor)** — Resource Embed (PDF/YouTube inline; arbitrary HTTPS via
   sandboxed iframe, others → external/magnify), Draw/Whiteboard, Sound level, QR, Calendar,
   Hyperlink.
2. **Core display** — Objective/I-can (standard chip), Model It, Teacher Notes, Agenda/Checklist.
3. **Timing** — Visual countdown timer (ring), Stopwatch, Countdown-to-event.
4. **Engagement** — Student Groups, Randomizer/Name picker, Dice, Poll/Traffic-light, Scoreboard.
**Per-widget acceptance:** renders from config, settings round-trip, persistence matches its
default (timer resets / ink persists / poll persists), WCAG AA, reduced-motion, live-region
for timer/poll. Agents own disjoint widget files; the shared `WidgetType` union + registry is
edited once by the lead to avoid merge conflicts.

### Wave 5 — Present / Full Screen / immersive rails + keyboard + swipe (1–2 agents)
**Goal:** the live-delivery affordances.
- **Present** = fullscreen the center board, hide chrome, edge-hover/click reveals the rails so
  the teacher can still add widgets; "Exit" button + Esc. **Full Screen** = fullscreen whole
  Teach view. Pop-Out/Duplicate = disabled "coming soon" with tooltips.
- Full keyboard map (spec §7.6): Cmd+1..9 boards, Cmd+L/Shift+L/R/J/K focus modules, Cmd+/
  layout switcher, Cmd+P Present, Esc cascade (focus → fullscreen → close), arrow keys move
  between cells. Touch **swipe** between boards/periods. Period **countdown** in the sub-bar.
- Layout presets (Lesson focus / Resource heavy / Presentation / Default) as one-way applies.
**Acceptance:** Present hides chrome + rails reveal on edge; every shortcut works; swipe
changes board on touch; countdown ticks; presets apply; focus trapped in Present; gate green.

### Wave 6 — Polish, empty states, full-app responsive + final gate (1–2 agents)
- All empty states (spec §7.4). Animations/feedback (spec §7.5). Dismissible onboarding
  tooltips on every non-obvious control (spec §7.2/§7.6, CLAUDE.md §4).
- Verify the <900px fallback end-to-end. Cross-view: ensure the new Teach tab + Daily Present
  button don't regress the top bar at any tier.
- Full verification stack + Codex gate on the whole feature diff. Update `CLAUDE.md §1`
  status table (Teach View → shipped, mock-driven) + this doc's status.

---

## 3. Acceptance criteria (feature-level)
1. A teacher opens `/teach` (tab or Daily Present) and sees today's current lesson with its
   default boards, the active period highlighted.
2. They can navigate to any day/subject/lesson/unit; boards + modules follow.
3. They can arrange the workspace (resize/collapse panels, reorder tabs, drag icons between
   rails) and it persists across reloads.
4. They can build a board from the full v1 widget set, switch layouts, focus a widget, and
   widget state persists per its sensible default.
5. In-place edits (notes, task checkboxes, lesson status) write through the planner store and
   respect the Personal/Team forking model.
6. Resources show inline (grid/list) and can be embedded onto the board by drag or menu.
7. Present mode goes fullscreen with edge-revealed rails; keyboard + swipe + countdown work.
8. Everything is token-based, responsive at 3 tiers (or degrades gracefully <900px),
   keyboard-operable, AA-contrast, reduced-motion-safe.
9. Every wave passed tsc 0 / lint clean / build / responsive probe / Codex `NO BLOCKING ISSUES`.

## 4. Risks & mitigations
- **Scope (largest risk).** Mitigation: strict wave gating + Tim sign-off between waves;
  widgets sequenced so a long Wave 4 still ships essentials; floating windows/pop-out deferred.
- **Panel DnD complexity.** Mitigation: reuse dnd-kit (already in repo) + PaneSplitter; no
  floating windows in v1.
- **Embed security** (spec §362). Mitigation: allowlist PDF + YouTube inline; sandbox other
  HTTPS in an `iframe sandbox`; everything else opens external/magnify.
- **Harness read-glitch.** Mitigation: mandatory Step-0 integrity check in every agent brief.
- **No test suite.** Mitigation: verification = tsc + lint + build + responsive probe +
  Codex gate + live check; add reproduction tests only if Tim wants them for timer/keyboard logic.

## 5. Out-of-repo references
- Spec: `Documents/Claude Design/5.29.2026 Teach View Handoff (Claude Design)/project/uploads/5.24.26 mycurricula-teach-view-spec.md`
- Artboard: `…/project/teach524.jsx` (+ `teach-handoff/` variant)
- Reference HTML: `…/project/5.24.26 - Teach View.html`
- These are reference only — never imported (CLAUDE.md §6).

---

## 6. Wave 0 decisions (recorded 2026-05-30)

- **<900px fallback → stacked single-panel (not redirect).** Below ~900px the
  five-zone grid collapses to a single column showing only the **center board**,
  with a short note that the rails/panels are available on a larger screen. This
  keeps Teach reachable on tablet/phone rather than redirecting away to Daily.
  Implemented purely in CSS (a `@media (max-width: 900px)` block in
  `components/teach/TeachShell.module.css`) as the Wave 0 stub; later waves add
  the real single-panel module switcher.
- **Shell suppression mirrors the print route.** `/teach` lives in `(planner)`
  so it inherits auth + the Personal/Team banner + the top bar (top bar stays so
  the Teach tab highlights). A `data-teach-view` attribute on the `TeachShell`
  root triggers `:global` rules in `app/globals.css` that hide the planner's
  default left filter panel (`aside`), right panel (`[role="complementary"]`),
  and the two icon rails (`nav:has([data-rail-side])`) — Teach owns its own
  chrome. This deliberately leaves the top-bar `<header>` and the `MasterBanner`
  in place.
- **Present param is a stub.** Daily's Present button will push
  `/teach?present=1`; Wave 0 reads the param (`useSearchParams`, under a
  `<Suspense>` boundary as the App Router requires) and surfaces a small note.
  Full fullscreen-immersive Present mode is Wave 5.
