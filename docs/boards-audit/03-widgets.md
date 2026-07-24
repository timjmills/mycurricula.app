# Boards Audit 03 — The Widget System

> READ-ONLY audit snapshot, 2026-06-13. Scope: `components/teach/widgets/**`,
> `components/teach/board/{WidgetPicker,WidgetSettingsPopover,WidgetShell}.tsx`,
> `components/teach/library/WidgetLibrary.tsx`, and
> `lib/teach/{widget-defaults,use-widget-state,widget-theme}.ts`.
> Owner brief: "extremely bad — crowded, too many things open at once." This is
> the **widget bloat** area. Verify against current code before treating any
> finding as binding.

---

## (a) INVENTORY — the full widget list

### Count

- **`WidgetType` union (`lib/types.ts:274-334`): 51 distinct type ids.**
- **`catalog.ts` `ALL_WIDGETS`: 51 metas** (one per union member).
- **Addable in the picker (`addable !== false`): 40 widgets.**
- **Retired generics kept renderable but not offered (`addable: false`): 11**
  (`objective`, `notes`, `agenda`, `stopwatch`, `model`, `manipulatives`,
  `slides`, `youtube`, `embed`, `names`, `soundlevel`, `work_symbols` — note
  the comment header says the retired tail is one thing but it actually holds
  12 entries listed; `work_symbols` is the 12th).
- **`.tsx` widget body files on disk: 56** (some share a body via alias ids;
  some `.module.css` exist with no matching live picker entry).

So the teacher is offered **40 widgets** in a flat-ish grouped grid. That alone
is the core of the "crowded" complaint: 40 is roughly 3× a sane core set.

### Interactive vs. display-only split (a hidden inconsistency)

Two whole generations of widget coexist:

- **Interactive (persist via `useWidgetState`): 19 files** — TextWidget,
  TimerWidget, StopwatchWidget, ClockWidget, CountdownWidget, DiceWidget,
  ScoreboardWidget, TrafficLightWidget, WorkSymbolsWidget, SoundLevelWidget,
  PollWidget, NamesWidget, AgendaWidget, UnderstandingCheckWidget,
  ParticipationTrackerWidget, HelpQueueWidget, MiniWhiteboardWidget,
  BrainBreakWidget, CalmCornerWidget, ClassPointsWidget.
- **Display-only (render `config` + a hardcoded `FALLBACK` sample, NO edit
  path): ~21** — ObjectiveWidget, LearningTargetWidget, NotesWidget,
  TeacherNotesWidget, DirectionsWidget, MaterialsNeededWidget,
  NowNextThenWidget, WorkCompletedWidget, TransitionWidget,
  AttentionSignalWidget, VoiceMovementWidget, WhenDoneWidget,
  StudentJobsWidget, ExitTicketWidget, QuestionParkingLotWidget,
  CenterRotationWidget, TeacherTableWidget, VocabularyWidget,
  SentenceFramesWidget, DiscussionProtocolWidget, ModelWidget,
  ManipulativesWidget, SlidesWidget, YouTubeWidget, EmbedWidget.

A teacher adds, say, "Directions" and gets a tile pre-filled with sample steps
that **cannot be edited from the board** (only the `objective` and `timer`
types have editors — see Finding F1). Half the catalog is effectively a
read-only mock.

### Suggested CORE vs. ADVANCED tiering (Wave-1 declutter target)

Aim: ~10 addable in the default picker; the rest behind an "Advanced / More"
tab inside the picker or the full Widget Library.

**CORE (12) — the everyday teaching loop:**

| Type | Why core |
| --- | --- |
| `learning-target` | the lesson's objective; #1 board item |
| `directions` | numbered task steps |
| `timer` | the single visual timer (absorbs countdown/stopwatch — see C1) |
| `text` | the universal "put words on the board" tile |
| `agenda` / `lesson-flow` | the lesson plan spine |
| `poll` | the single check-for-understanding tally (absorbs understanding-check — C5) |
| `namepick` | random student picker |
| `groups` | small-group display |
| `traffic` | work-mode / noise signal (absorbs work_symbols, work-sound — C4) |
| `scoreboard` | class points / teams (absorbs class-points — C6) |
| `when-done` | early-finisher options |
| `materials-needed` | supplies |

**ADVANCED (everything else):** now-next-then, transition, attention-signal,
voice-movement, student-jobs, exit-ticket, help-queue, participation-tracker,
question-parking-lot, center-rotation, teacher-table, vocabulary,
sentence-frames, discussion-protocol, brain-break, calm-corner, teacher-notes,
mini-whiteboard, work-completed, clock, dice, sound, note-view, resource.

**RETIRE from the union entirely (not just `addable:false`):** the 12 alias
duplicates listed below in C2 — they bloat the type, the dispatch, the seed
table, and the on-disk file count for zero user benefit.

---

## (c) BLOAT / DUPLICATION — the core finding

The single biggest source of "too much" is **overlapping widgets**. Concrete
clusters:

### C1 — FOUR time widgets — `catalog.ts:276-307` · MAJOR

`timer` (VISUAL TIMER), `clock` (CLOCK), `countdown` (COUNTDOWN), plus the
retired-but-still-on-disk `stopwatch`. Three are addable; all four ship a full
interactive body + `.module.css`. A teacher cannot tell "Timer" from
"Countdown" from "Clock" at the picker. **Fix:** ship ONE Timer widget with a
mode switch (count-down / count-up / time-of-day); retire `countdown`,
`stopwatch`, `clock` as ids.

### C2 — TWELVE alias ids that resolve to a survivor body — `WidgetBody.tsx:88-125` · MAJOR

The dispatch has explicit `case` aliases where two ids render the *same*
component:

- `agenda` + `lesson-flow` → `AgendaWidget`
- `slides` + `note-view` → `SlidesWidget`
- `embed` + `resource` → `EmbedWidget`
- `names` + `namepick` → `NamesWidget`
- `soundlevel` + `sound` + `work-sound` → `SoundLevelWidget`
- `objective` (retired) duplicates `learning-target` conceptually

Every alias still has a catalog row, a seed in `widget-defaults.ts`, and a
default-theme entry. This is pure duplication carried for "backward-compatible
rendering." **Fix:** keep ONE id per concept, write a one-time
`board-migrate.ts` rule mapping retired ids → survivor, and delete the alias
cases + catalog rows.

### C3 — TWO objective widgets — `ObjectiveWidget.tsx:34` vs `LearningTargetWidget.tsx` · MAJOR

`objective` ("I Can" + standard chips, fallback "Find three equivalent
fractions…") and `learning-target` ("I-can + success criteria") are the same
pedagogical tile. `objective` is `addable:false` but still renderable and still
the ONLY type (with `timer`) that has a settings editor (Finding F1) — so the
retired one is more editable than its replacement. **Fix:** fold `objective`
into `learning-target`; move the editor onto the survivor.

### C4 — THREE work-mode / sound widgets — `catalog.ts` · MAJOR

`work_symbols` (WORK SYMBOLS, retired), `work-sound` (WORK SOUND), `sound`/
`soundlevel` (SOUND LEVEL), and `traffic` (TRAFFIC LIGHT) all express "how
should the room be working right now." Four ids, overlapping intent. **Fix:**
one "Work Mode" widget (silent/whisper/partner/group + a noise indicator);
retire the rest.

### C5 — TWO tally / check widgets — `PollWidget.tsx` vs `UnderstandingCheckWidget.tsx` · MEDIUM

`poll` (teacher-tap tally, choice/yesno/smiley) and `understanding-check`
(emoji/face mood + class summary) are both "tap to gauge the class." **Fix:**
make mood a poll `kind`; retire `understanding-check`.

### C6 — TWO points widgets — `ScoreboardWidget.tsx` vs `ClassPointsWidget.tsx` · MEDIUM

`scoreboard` (team points +/−) and `class-points` (single class reward bar) are
the same reward mechanic at two granularities. **Fix:** one Points widget with
a "teams vs. whole-class" toggle.

### C7 — THREE note/text surfaces — `NotesWidget.tsx` · `TeacherNotesWidget.tsx` · `TextWidget.tsx` · MEDIUM

`notes` (retired generic), `teacher-notes` (private reminders), and `text`
(big display text) overlap heavily; `notes` and `teacher-notes` are nearly
identical (both read `config.text ?? config.notes`, both render a card +
note-icon, both ship a sample FALLBACK). **Fix:** retire `notes`; keep
`teacher-notes` (private) + `text` (public display) as the two distinct intents.

**Net:** the 40-addable set collapses to ~22 meaningfully-distinct widgets
before any tiering, and to a ~12 CORE picker after tiering. That is the
declutter.

---

## (b) FLAWS / BUGS / A11Y

### F1 — WidgetSettingsPopover edits only 2 of 40 widget types — `WidgetSettingsPopover.tsx:51` · MAJOR

`const editable = widget.type === "objective" || widget.type === "timer";`
Every other widget opens the cog and gets *"Detailed settings for this widget
are coming after beta."* So 38 of 40 addable widgets are **uneditable from the
board**, and the two that ARE editable include a retired type (`objective`).
Combined with the display-only split (section a), most widgets are decorative.
**Fix:** either give each widget an inline edit affordance (click-to-edit like
TextWidget) or gate the cog so it never opens a dead popover; do not ship a cog
that 95% of the time says "coming soon."

### F2 — WidgetPicker header comment says "12 types" but ships 40 — `WidgetPicker.tsx:1-6` · MEDIUM

The file docstring: *"12 types, searchable, grouped by category (Display /
Timing / Engagement / Content embed / Utilities)."* The actual categories are
the six handoff families and the actual count is 40. Stale doc = the grid grew
3× past its design intent without the contract being revisited. **Fix:** update
the contract and, more importantly, treat the 12 as the intended ceiling
(matches the CORE tier above).

### F3 — `_WidgetKit` Avatar/Face/StepNum emit computed `hsl()` colors — `_WidgetKit.tsx:313, 338-339` · MEDIUM

`background: linear-gradient(160deg, hsl(${H} 65% 88%), …)`,
`color: hsl(${H} 45% 38%)`, mood-face `ink/tint` are runtime-computed HSL, not
tokens. The file documents this as "the handoff's pip/face exception," but it
means avatar/face tints do NOT re-hue across the six themes (CLAUDE.md §4 theme
axis) and bypass the palette. Grep found **0 hex** in `*.tsx` (good) but the
`hsl()` path is the loophole. **Fix:** drive avatar/face tints from a small
tokenized `--tone-*` ramp so Night/washes re-tint them.

### F4 — Display-only widgets render fabricated student-ish sample content — `NotesWidget.tsx:14`, `ObjectiveWidget.tsx:21,31`, +~20 more · MEDIUM

95 `FALLBACK`/sample matches across 38 files. e.g. NotesWidget hardcodes
*"Circulate during centers. Check in with the group working on partitioning…"*;
ObjectiveWidget hardcodes a fractions objective + `["5.NF.B.3","5.NF.A.1"]`.
On a real (empty) board these read as if the teacher wrote them. **Fix:** show
a genuine empty state ("Add directions…") instead of plausible fake content, so
an unconfigured tile is obviously unconfigured.

### F5 — WidgetShell cog tooltip promises editing it can't deliver — `WidgetShell.tsx:127-139` · MEDIUM

The settings button's onboarding tooltip is "Edit this widget's settings," but
per F1 the click yields "coming soon" for 38/40 types. A `required:false`
onboarding tip that lies about capability is worse than none. **Fix:** make the
tooltip honest, or hide the cog where no editor exists.

### F6 — Tile chrome = 5 icon buttons per widget, always rendered — `WidgetShell.tsx:78-151` · MEDIUM (crowding)

Every non-present tile renders drag · pin · expand · settings · remove (5
controls) in the header. With many tiles on a board that is a wall of tiny
icon-only buttons — directly the "crowded / too many things open" complaint.
Touch targets are the `.chromeBtn` size (verify ≥44px in board.module.css; the
14px icons suggest small hit areas). **Fix:** collapse secondary actions
(pin/settings/remove) into a single "…" overflow menu; keep only
drag + expand inline.

### F7 — `nextDisplayOrder` / id generation is fragile — `WidgetPicker.tsx:43-47, 99` · LOW

`newWidgetId()` uses a module-level `pickerSeq` + `Date.now()`; `displayOrder`
is passed as `widgets.length`, so deleting then adding can collide orders. Not
user-visible today (mock), but will matter once persistence + multi-tab land.
**Fix:** derive order from `max(displayOrder)+1`, generate ids via
`crypto.randomUUID()`.

---

## (e) #2 INSERTION UX — "insert widgets mid-lesson"

**Status: works, but fragmented across THREE different add paths with
inconsistent reach — the insertion story is confusing, not fast.**

There are three distinct ways to add a widget:

1. **WidgetPicker modal** (`WidgetPicker.tsx`, mounted by
   `TeachWorkspace.tsx:1400`). Triggered by clicking an **empty board cell**
   (`handleAddWidget` → `setPickerTarget`). Centered dialog, search input
   (filters on `label` only — NOT kicker/keyword), grouped by the six
   categories, focus-trapped, Esc/backdrop closes. **Clicks to insert: open
   empty cell → (optional type) → click tile = ~2 clicks.** Good — but only
   reachable if an empty cell is visible; on a full board there is no obvious
   "+ add widget" entry from here.

2. **WidgetLibrary full overlay** (`WidgetLibrary.tsx`, opened via
   `setLibraryOverlay("widgets")` from PanelAddMenu / SubBar). A whole
   browser: left sidebar (All/Favorites/Recent/Suggested + 6 categories),
   search, filter pills, a gold Favorites band, and a 4-col card grid of all
   40. **This is heavy** — a full-screen modal to drop one widget mid-lesson is
   the opposite of fast, and it duplicates the picker's job. "Suggested" is a
   hardcoded empty set; "Recent" = whatever's already on the board (not real
   recency).

3. **PanelAddMenu "+"** (`PanelAddMenu.tsx`) on the left/right panel bars.
   Offers a **hardcoded 12-tool subset** (`TOOL_TYPES`, lines 34-47:
   timer/stopwatch/clock/countdown/dice/scoreboard/poll/namepick/sound/
   traffic/work-sound/class-points) as *dockable* tools, plus a "Browse widget
   library" link. So a 4th implicit tier exists (docked tools) with its own
   curated list that overlaps the picker but is maintained separately.

**Problems with insertion:**

- **No single canonical "Add widget" action.** Empty-cell click, panel "+",
  and SubBar library button each do a *different* thing with a *different*
  surface and a *different* widget subset. A teacher can't form one mental
  model.
- **Search is label-only in the picker** (`WidgetPicker.tsx:76`) vs.
  label+kicker in the library (`WidgetLibrary.tsx:188`) — inconsistent recall.
- **The fast path (picker) is gated on a visible empty cell;** the always-
  available path (library) is the slowest, heaviest one. That is backwards for
  a mid-lesson insert.
- **`TOOL_TYPES` is a third hand-maintained widget list** (after `ALL_WIDGETS`
  and the library's derived sets) that will drift.

**Fix for Wave 1:** make ONE insertion surface — a single command-style "Add
widget" affordance (always reachable: a `+` on the board toolbar AND on hover
between tiles for true mid-lesson insertion), opening the lightweight
`WidgetPicker` (search across label+kicker+category, CORE tier first, "More"
reveals ADVANCED). Demote the full `WidgetLibrary` to a "manage/browse"
destination, not the primary add path. Retire `TOOL_TYPES` in favor of the
catalog's CORE tier.

---

## (d) CONNECTIONS — consistency & shared infrastructure

- **`catalog.ts` is a clean single source** (label/kicker/icon/tint/category/
  addable) consumed by picker, library, shell, empty-state. Good. BUT the
  `category` taxonomy has migrated and `WidgetLibrary.tsx:91-123` still carries
  a dead `match[]` legacy-folding heuristic + a `TODO(lead)` that the catalog
  rebin already made moot — dead code to delete.
- **Two parallel theming systems, not one.** Display-only widgets use
  `_WidgetKit` + `widgets530.module.css` (`--w-*`, `--tone-*`). Interactive
  widgets each import their **own** `<Name>Widget.module.css`. There is no
  shared widget shell for the *body* — each interactive widget is bespoke. The
  `widget-theme.ts` / `widget-defaults.ts` `--w-*` resolution exists but is
  only consumed by the editor/fullscreen path and the `_WidgetKit` set, not the
  interactive bodies. **So a widget's look is governed by 3 different mechanisms
  depending on which generation it belongs to.** Fix: converge on one widget
  shell + the `--w-*` contract.
- **`use-widget-state.ts` is solid and shared** (SSR-safe, same-tab bus, cross-
  tab `storage` sync, privacy-scoped to structure-only). Only ~19 widgets use
  it; the display-only set persists nothing. Good module; under-used.
- **`widget-defaults.ts` SEEDS includes retired/alias ids** (`names`,
  `soundlevel`, `agenda`, `objective`, `note-view`, …) — it carries dead seeds
  for ids that should not exist post-dedup. Tracks the C2 bloat.
- **WidgetShell ↔ WidgetBody ↔ catalog** wiring is consistent and the
  `default` fallback in `WidgetBody.tsx:183` is correct belt-and-braces.

---

## Severity rollup (top findings)

| # | Severity | Finding | Anchor |
| --- | --- | --- | --- |
| C1 | MAJOR | 4 overlapping time widgets (timer/clock/countdown/stopwatch) | `catalog.ts:276-307` |
| C2 | MAJOR | 12 alias ids resolve to a survivor body (pure dup) | `WidgetBody.tsx:88-125` |
| F1 | MAJOR | Settings popover edits only 2 of 40 types; 38 say "coming soon" | `WidgetSettingsPopover.tsx:51` |
| C3 | MAJOR | Duplicate objective widgets; retired one is the only editable one | `ObjectiveWidget.tsx:34` |
| C4 | MAJOR | 3-4 overlapping work-mode/sound widgets | `catalog.ts` (work_symbols/work-sound/sound/traffic) |
| E  | MAJOR | 3 fragmented insertion paths, no canonical "Add widget", slow path is the always-available one | `WidgetPicker.tsx` · `WidgetLibrary.tsx` · `PanelAddMenu.tsx:34` |
| F6 | MEDIUM | 5 icon buttons per tile, always rendered (crowding) | `WidgetShell.tsx:78-151` |
| F3 | MEDIUM | Avatar/Face emit computed `hsl()` — no theme re-hue | `_WidgetKit.tsx:313,338` |
| C5/C6/C7 | MEDIUM | Duplicate tally (poll/understanding), points (scoreboard/class-points), notes (notes/teacher-notes/text) | resp. files |
| F4 | MEDIUM | ~21 display-only widgets render fabricated sample content as if real | `NotesWidget.tsx:14` +20 |
| D  | LOW | Two parallel theming systems + dead `match[]`/`TODO` + dead SEEDS | `WidgetLibrary.tsx:91-123`, `widget-defaults.ts:18` |

**Wave-1 declutter recommendation:** (1) collapse the duplication clusters
C1-C7 to cut the addable set from 40 → ~22; (2) tier to a ~12 CORE picker with
an "Advanced" reveal; (3) unify the three add paths behind one lightweight,
always-reachable `WidgetPicker` with mid-tile `+` insertion; (4) resolve the
settings-popover dead-end (F1) by making widgets inline-editable or hiding the
cog where it does nothing.
