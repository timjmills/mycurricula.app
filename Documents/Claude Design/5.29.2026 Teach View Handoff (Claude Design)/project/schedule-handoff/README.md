# Schedule view — Claude Code handoff

Developer handoff for the **Schedule view** from the
*4.10.26 - Design Exploration.html*. A time-blocked week timeline
covering one school week (Sun–Thu) with academic + non-academic
blocks per the planning-doc §5.4 spec.

## Files

- `artboards-views.jsx` — **ABScheduleView** + supporting components.
  Schedule blocks live in the `schedule` object inside the component
  (per-day, minutes-from-midnight).
- `artboards-core.jsx` — shared chrome (`CPTopBar`, view-mode switch,
  Personalized / Core toggle, sample lesson-card flow).
- `data.jsx` — `LESSONS`, `SUBJECTS`, `UNITS`, `TEACHERS`, `STANDARDS`.
- `shared.jsx` — base UI primitives.
- `tokens.css` — CSS variables for ink ramps + subject palette +
  status colors.
- `index.html` — minimal preview page.

## What's covered

- **Time grid** — Sun → Thu day columns, vertical time gutter on
  the left (7:30 AM → 3:30 PM in 30-min increments), `PX_PER_MIN`
  scaling so blocks size to their real duration.
- **Academic blocks** — subject-tinted, with title + I-Can pill +
  resource icons + standards chip; clicking opens the lesson detail.
- **Non-academic blocks** — neutral chrome for Morning Meeting,
  Recess, Lunch, Specials, PE; not driven by curriculum.
- **Today column (Mon)** — gets a 2px subject-color top border + a
  horizontal red "now line" at the current minute, plus a pulsing
  "▶ NOW" badge on the currently-active block.
- **Multi-lesson stacking** — when two lessons share a slot, they
  appear side-by-side; three+ stack vertically (each keeps full
  card functionality).
- **View-mode flip** — the global view-mode pill (Grid / Task / Simple)
  in the top bar swaps the timeline for a flat task-list scoped to
  the week, with the same multi-lesson handling.
- **Day-events banner** — a small row at the bottom of each column
  for non-curriculum events (assembly, drill, guest speaker).

## Data shape (production)

```ts
type TimeBlock = {
  id: string;
  teacherId: string;
  gradeLevelId: string;
  dayOfWeek: 0|1|2|3|4;   // Sun..Thu
  startTime: string;       // "08:00"
  endTime: string;         // "08:30"
  type: "academic" | "non_academic";
  subjectId?: string;       // for academic blocks
  label?: string;           // for non-academic (e.g. "Morning Meeting")
  weekCycle?: "A" | "B";    // Phase 2 AB-week support
};

type ScheduleEvent = {
  // either a CoreLessonEvent / ExtraLessonEvent / DayEvent
  // assigned to a specific date + (optionally) a TimeBlock slot
  id: string;
  date: string;             // ISO
  timeBlockId?: string;     // null → end-of-day banner
  type: "core_lesson" | "extra_lesson" | "day_event";
  // ... payload depends on type
};
```

## Tokens used

- **Today border** — 2px `var(--c)` (active subject color on the
  current block).
- **Now line** — `var(--urgent)` 2px horizontal stripe across the
  timeline at the current minute.
- **Academic block bg** — `var(--cl)` (subject light tint).
- **Non-academic block bg** — `var(--ink-100)` neutral.
- **Block stripe** — `var(--c)` 3px on the left edge.

## How to run

```sh
cd schedule-handoff
python3 -m http.server 8080
# open http://localhost:8080
```

## Re-implementation notes for production

1. Lift out of Babel-in-browser. Move components to `src/schedule/`
   and remove the `Object.assign(window, …)` exports.
2. The demo `schedule` object inside `ABScheduleView` is hard-coded.
   Production wires to:
   - `TimeBlock` query (per teacher × grade × week_cycle) for the
     skeleton.
   - `ScheduleEvent` query (per teacher × date range) for the events
     that fill the slots.
3. The "now line" position is hard-coded. Production runs a 30-second
   `setInterval` to recompute it (`(now - dayStart) * PX_PER_MIN`).
4. The day-events banner is rendered as a separate row below the
   timeline grid. Production reads `DayEvent` records filtered by
   the visible week.
5. Ramadan timetable — Phase 1B/2 feature. When `school.calendar`
   indicates the current date is in the Ramadan range, the
   `TimeBlock` query swaps to the school's `ramadan_schedule` set
   and a "🌙 Ramadan timetable active" indicator shows at the top.
6. Schedule view is **Phase 2** in the roadmap (per planning-doc
   §1169 / §1171). Phase 1 ships the Daily + Weekly views; the
   time-blocked Schedule comes in Phase 2 along with the time-block
   setup UI in Settings.

## Cross-reference

- Daily view's lesson-detail right pane is the same UI used when you
  click a block on Schedule view — see the Daily handoff.
- The view-mode pill (Grid / Task / Simple) is the same component
  across Schedule / Weekly / Daily — see `CPViewModeSwitch` in
  `shared.jsx`.
- The Personalized / Core toggle in the top bar drives the same
  master-mode entry banner sequence on Schedule as on Weekly.
