# B1B — Widget bodies handoff notes (for the lead integrator)

Build agent **B1b**. Scope was confined to `components/teach/widgets/`. Delivered
the 10 remaining named widgets + restyled the existing generics into the 5.31
visual system (the `--w-*` themeable contract + `_WidgetKit` primitives +
`--tone-*` palette). No shared/dispatch files were touched
(`WidgetBody.tsx`, `catalog.ts`, `index.ts`, `lib/types.ts`, `app/tokens.css`,
`lib/teach/*`, `_WidgetKit.tsx`, `widgets530.module.css` are all untouched).
**No files were deleted** — dedup is the lead's call (recommendations below).

## Deliverable 1 — the 10 new named widgets

Each is a `*.tsx` + co-located `*.module.css`, matching the B1a pattern (WHead +
`kit.body`/`kit.card`/`kit.chip` + em sizing so `--w-scale` rescales). Default
themes match `lib/teach/widget-defaults.ts` SEEDS exactly.

| Widget type id          | File                              | Export                      | Default `{bg, accent}` | Interactive |
| ----------------------- | --------------------------------- | --------------------------- | ---------------------- | ----------- |
| `center-rotation`       | `CenterRotationWidget.tsx`        | `CenterRotationWidget`      | `{ blue, blue }`       | no          |
| `teacher-table`         | `TeacherTableWidget.tsx`          | `TeacherTableWidget`        | `{ green, green }`     | no          |
| `vocabulary`            | `VocabularyWidget.tsx`            | `VocabularyWidget`          | `{ blue, blue }`       | no          |
| `sentence-frames`       | `SentenceFramesWidget.tsx`        | `SentenceFramesWidget`      | `{ orange, orange }`   | no          |
| `discussion-protocol`   | `DiscussionProtocolWidget.tsx`    | `DiscussionProtocolWidget`  | `{ blue, blue }`       | no          |
| `brain-break`           | `BrainBreakWidget.tsx`            | `BrainBreakWidget`          | `{ purple, purple }`   | YES         |
| `calm-corner`           | `CalmCornerWidget.tsx`            | `CalmCornerWidget`          | `{ green, green }`     | YES         |
| `class-points`          | `ClassPointsWidget.tsx`           | `ClassPointsWidget`         | `{ green, green }`     | YES         |
| `teacher-notes`         | `TeacherNotesWidget.tsx`          | `TeacherNotesWidget`        | `{ orange, orange }`   | no          |
| `mini-whiteboard`       | `MiniWhiteboardWidget.tsx`        | `MiniWhiteboardWidget`      | `{ blue, blue }`       | YES (tool select only) |

### Interactive widgets — STRUCTURE-ONLY state via `useWidgetState`

Per Ultraplan §4.3 / privacy §11.4, persisted state is structure only — counts
and indices keyed by position, never names:

- **`brain-break`** — `{ index }`: a single integer ring-position into the
  activity list; "Next activity" advances it. No PII.
- **`calm-corner`** — `{ selected }`: the chosen mood index (`-1` = none). A
  private, anonymous self-signal; no per-student data.
- **`class-points`** — `{ points }`: a single CLASS-LEVEL integer tally (+1/−1,
  Reset), never per-student. Goal/reward are read from config.
- **`mini-whiteboard`** — `{ tool }`: the selected tool index. The real drawing
  engine lives in the Fullscreen markup layer (Ultraplan §5.2); this body is a
  prompt + write-on surface + tool strip. No strokes/PII stored here.

### Privacy (§11.4) — student-bearing named widgets

- **`teacher-table`** renders the students at the table as INITIALS-ON-TINT
  `Avatar`s only; the config/persisted shape carries `initials` (single letters),
  never names. Fallback roster is `["A","C","M","T","R"]`.
- **`center-rotation`** uses anonymous GROUP labels ("Red Group", "Group 1") —
  no student names.
- The interactive widgets store no names (see above).

## Deliverable 2 — restyled generics

All restyled to consume `--w-*` + `_WidgetKit` + `--tone-*`, em-sized so
`--w-scale` rescales. Behaviour + export names unchanged. Two sub-groups:

### A. Display-only generics — full rewrite into the new system

Rewritten TSX (now use `WHead` + `kit.*` + co-located `*.module.css`) and dropped
the old `widgets.module.css` body classes:

- `ObjectiveWidget` (now WHead "Objective", `target` chip, `I CAN` pill, standards
  as `purple` Pills)
- `NotesWidget` (soft card + `note` icon)
- `ModelWidget` (bar fill/outline now `--w-accent`/`--w-soft`)
- `ManipulativesWidget` (strip fill/outline now themeable)
- `MediaCard` + `SlidesWidget` / `YouTubeWidget` / `EmbedWidget` (light framed
  placeholder instead of dark video chrome; `MediaCard` now takes a `heading` prop
  and KitIcon names — `easel`/`laptop`/`puzzle`)
- `GroupsWidget` (members now render via the privacy-safe `Avatar`; footer is a
  `FootNote`)
- `AgendaWidget` (kept interactive done-toggle behaviour; restyled rows/check into
  the new system; `KitIcon` check)

### B. Utility / interactive widgets — restyled in place

These were already fully token-based, responsive (clamp + vh/vw), and visually
polished, but predated the `--w-*` themeable contract (they used the per-lesson
subject-tint system `--c`/`--cl`/`--cd` via a `cp-subj` wrapper) and had bare-px
chrome font-sizes. Restyle applied without touching interactive logic:

- Converted every bare `font-size: Npx` to `em` (≈ /14 base). `clamp(...px, ...)`
  display readouts were left as-is — they are viewport-driven and pass the
  px-font-size gate (the regex only matches a bare leading number).
- Swapped the subject-tint tokens to the themeable contract: `--c`→`--w-accent`,
  `--cl`→`--w-soft`, `--cd`→`--w-accent` (CSS + the few inline `style`/SVG
  `stroke`/`fill` refs), and removed the now-unused `cp-subj ${subjectId}`
  wrapper + the unused `subjectId` destructure on each. They now theme via the
  lead's `.tw` `--w-*` wrapper like the named widgets.
- Global non-subject tokens that are not part of the themeable contract were left
  intact where they carry fixed meaning: `--ink-*` (neutral chrome), `--paper`,
  `--line`, `--teach-alarm`, `--traffic-*`, `--light-colour`. These are not
  violations and swapping them would change semantics.

Files: `TimerWidget`, `ClockWidget`, `CountdownWidget`, `StopwatchWidget`,
`DiceWidget`, `ScoreboardWidget`, `PollWidget`, `NamesWidget`,
`TrafficLightWidget`, `WorkSymbolsWidget`, `SoundLevelWidget`, `TextWidget`.

### Left essentially as-is (noted)

- **`TextWidget`** — its display font-sizes were already 100% `clamp(...)` and it
  used no subject hex; the only change was the `--c`/`cp-subj` swap for
  consistency. It already looked correct under the new system.
- **`widgets.module.css`** — trimmed to ONLY the `.fallback` / `.fallbackLabel`
  rules (em-sized) that `WidgetBody.tsx` (lead's file) still consumes for an
  unmapped type. Every per-widget body class that used to live here is now owned
  by a co-located module; the orphaned px-font-size rules were removed. I did NOT
  delete the file because the dispatch still imports `.fallback`.

## Dedup recommendations (lead decides during the catalog rebin)

These existing generics are now functional/visual duplicates of named widgets.
Recommendation per the `lib/types.ts` "(restyles X)" comments + Ultraplan §4.2:

| Pair (generic ↔ named) | Recommendation |
| --- | --- |
| `objective` ↔ `learning-target` | RETIRE `objective`; `learning-target` (B1a) is the richer survivor. Keep `objective` only if a leaner "I Can + standards" card is still wanted. |
| `notes` ↔ `teacher-notes` | RETIRE `notes`; `teacher-notes` adds the explicit "Private" marker + reminders. Same orange/orange family. |
| `names` ↔ `namepick` | MERGE to one id (`namepick` per the type comment). `NamesWidget` is the only body built; point `namepick` at it or rename. |
| `soundlevel` ↔ `sound` | MERGE to `sound` (mic level) per the type comment. `SoundLevelWidget` is the built body. |
| `agenda` ↔ `now-next-then` / `lesson-flow` | RETIRE `agenda` per Ultraplan §4.2 → folds into `lesson-flow`. I restyled `agenda` so it reads correctly until the rebin; no `lesson-flow` body exists yet. |
| `stopwatch` ↔ `timer` | RETIRE `stopwatch` per §4.2 (folds into `timer`). Both bodies exist and are restyled; keep both only if count-up + laps is wanted separately. |
| `model` / `manipulatives` | RETIRE per §4.2 → `text` / resource embed. Restyled so they read until then. |
| `slides` / `youtube` / `embed` | RETIRE per §4.2 → resource embed / `note-view`. All three now share the restyled `MediaCard` placeholder. |
| `work_symbols` | MERGE/split per §4.2 → `work-sound` + `class-points`. `class-points` (mine) is built; `work-sound` body not built. `WorkSymbolsWidget` restyled until then. |

## Verification (my files only)

- `npx tsc --noEmit` → 0 errors.
- `rg '#[0-9a-fA-F]{3,6}' <my new + restyled files>` → no matches (the only
  computed colours are the documented `hsl(...)` avatar/face tints inside
  `_WidgetKit`, which I did not touch).
- `rg 'font-size:\s*[0-9]+px' components/teach/widgets` → no matches.
- `npx prettier --check` my files → all clean.
- `npx next lint --dir components/teach/widgets` → no warnings/errors.
- `npm run build` → succeeds.
- Responsive: flex/grid + em/% only; multi-column widgets (center-rotation,
  calm-corner moods) collapse to one column at the phone tier via `max-width` em
  breakpoints; interactive buttons are ≥2.75em (~44px) touch targets. Motion
  (calm-corner breathing ring, class-points bar) is gated behind
  `prefers-reduced-motion: no-preference`. Per the gate, I did NOT run the Codex
  review and did NOT commit — the lead commits.
