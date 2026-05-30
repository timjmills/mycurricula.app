# B1A — Widget bodies handoff notes (for the lead integrator)

15 new themeable widget bodies + 1 shared kit, authored against the 5.31 Widget
& Boards handoff. All consume the `--w-*` themeable vars set by the lead's `.tw`
wrapper; internal sizing is in `em` so `--w-scale` rescales each widget. Semantic
status colours (Pill / FootNote / summary bars) resolve through `--tone-*` vars
defined locally in `widgets530.module.css` (composed from existing `--tag-*` /
`--wf-*` tokens — no new global tokens, no raw hex).

## Shared kit (not a widget)

- `components/teach/widgets/_WidgetKit.tsx` — `WHead`, `Avatar` (privacy-safe,
  initial-on-hashed-tint), `Face`, `Pill`, `StepNum`, `FootNote`, plus a local
  `KitIcon` set (the shared `icons.tsx` lacks book/pencil/clock/etc.) and the
  `Tone` / `KitIconName` / `FaceMood` types.
- `components/teach/widgets/widgets530.module.css` — shared primitive styles +
  the `--tone-*` palette (opt in by adding `kit.tones` to a widget root).

## Widget files → export name → default theme → interactive?

| Widget type id          | File                                 | Export                          | Default theme `{bg, accent}` | Interactive |
| ----------------------- | ------------------------------------ | ------------------------------- | ---------------------------- | ----------- |
| `learning-target`       | `LearningTargetWidget.tsx`           | `LearningTargetWidget`          | `{ yellow, purple }`         | no          |
| `now-next-then`         | `NowNextThenWidget.tsx`              | `NowNextThenWidget`             | `{ blue, blue }`             | no          |
| `directions`            | `DirectionsWidget.tsx`               | `DirectionsWidget`              | `{ green, green }`           | no          |
| `materials-needed`      | `MaterialsNeededWidget.tsx`          | `MaterialsNeededWidget`         | `{ purple, purple }`         | no          |
| `work-completed`        | `WorkCompletedWidget.tsx`            | `WorkCompletedWidget`           | `{ orange, orange }`         | no          |
| `transition`            | `TransitionWidget.tsx`               | `TransitionWidget`              | `{ green, green }`           | no          |
| `attention-signal`      | `AttentionSignalWidget.tsx`          | `AttentionSignalWidget`         | `{ blue, blue }`             | no          |
| `voice-movement`        | `VoiceMovementWidget.tsx`            | `VoiceMovementWidget`           | `{ purple, purple }`         | no          |
| `when-done`             | `WhenDoneWidget.tsx`                 | `WhenDoneWidget`                | `{ orange, orange }`         | no          |
| `student-jobs`          | `StudentJobsWidget.tsx`              | `StudentJobsWidget`             | `{ yellow, orange }`         | no          |
| `exit-ticket`           | `ExitTicketWidget.tsx`               | `ExitTicketWidget`              | `{ purple, purple }`         | no (static Submit affordance) |
| `understanding-check`   | `UnderstandingCheckWidget.tsx`       | `UnderstandingCheckWidget`      | `{ green, green }`           | YES         |
| `help-queue`            | `HelpQueueWidget.tsx`                | `HelpQueueWidget`               | `{ orange, orange }`         | YES         |
| `participation-tracker` | `ParticipationTrackerWidget.tsx`     | `ParticipationTrackerWidget`    | `{ blue, blue }`             | YES         |
| `question-parking-lot`  | `QuestionParkingLotWidget.tsx`       | `QuestionParkingLotWidget`      | `{ pink, pink }`             | no          |

Each `*.tsx` has a co-located `*.module.css` matching the existing
TimerWidget pattern.

## Interactive widgets (client state via `useWidgetState`)

All three persist STRUCTURE ONLY (counts / status indices / booleans keyed by
position) — never names (privacy §11.4):

- **`understanding-check`** — taps on the 3 mood faces bump three integer
  tallies; the Class Summary bar + percentages recompute live. Has a Reset.
- **`help-queue`** — tapping a row cycles its serve status
  (Waiting → Helping now → Done); the "waiting" count recomputes. Roster is
  initials + reason tags from config.
- **`participation-tracker`** — tapping a student avatar moves it between
  "Shared Today" / "Not Yet Shared"; both badge counts recompute. Roster is a
  list of initials.

These are `"use client"` and import `useWidgetState` from
`@/lib/teach/use-widget-state`.

## Privacy (§11.4) — student-bearing widgets

`work-completed`, `student-jobs`, `help-queue`, `participation-tracker`,
`understanding-check`, `question-parking-lot` all render INITIALS-ON-TINT
avatars (`Avatar`) or anonymous tallies only. Sample/fallback data is seeded
with single-letter initials ("A", "B", …), never realistic full names. The
config/persisted shapes carry an `initial` field, never a name.

## Integration TODO for the lead

1. Register each export in `WidgetBody.tsx`'s switch (the 15 type ids are
   already in the `WidgetType` union).
2. Add the 15 default themes above to the widget-theme defaults registry.
3. Add catalog entries (`catalog.ts`) — label/icon/grouping. The bodies don't
   render their own chrome; the `.tw` wrapper owns the WHead chrome row.
4. Barrel-export from `index.ts` if that's the consumer convention.

## Verification (my files only)

- `npx tsc --noEmit` → 0 errors.
- `rg '#[0-9a-fA-F]{3,6}'` over my .tsx + .module.css → no matches.
- `rg 'font-size:\s*[0-9]+px'` over my files → no matches.
- `npx prettier --write` → all formatted.
- Responsive: stacking + flex/grid + `em`/`%` only; matrix/queue use internal
  overflow on narrow tiles (no document-level horizontal scroll); buttons are
  ≥44px touch targets. `understanding-check` bar transition + nothing else is
  gated behind `prefers-reduced-motion: no-preference`.
