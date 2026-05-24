# Catch-up — Claude Code handoff

Developer handoff for the **Catch-up** feature from the
*4.10.26 - Design Exploration.html* exploration. Catch-up surfaces
every uncovered or incomplete lesson across the year and gives the
teacher tools to triage it. Built per planning-doc §5.17 with the
three-layer control system from §1262.

## Files

- `artboards-new.jsx` — **ABCatchupScreen** (§5.17 full-page triage)
  and supporting components. Exports `CATCHUP_ITEMS` as the
  source-of-truth data fixture.
- `artboards-extras.jsx` — **ABCatchupFlow** (Off → Menu → On stages
  of the three-layer control system).
- `artboards-tasklist.jsx` — **ABTaskListViews** (Day / Week / Unit /
  Missed scopes). The Missed scope IS the task-view of Catch-up.
- `artboards-simple.jsx` — **ABSimpleCatchup** (low-floor variant
  with plain-English actions: Decide what to do → Move / Mark done /
  Add a note / Skip for now / Decide later).
- `data.jsx` — `LESSONS`, `STANDARDS`, `SUBJECTS`, `UNITS`, `TEACHERS`.
- `shared.jsx` — base UI primitives (CPLessonCard, CPStatusGlyph,
  status helpers, etc).
- `tokens.css` — CSS variables for ink ramps, subject palette,
  status colors (incl. `--catchup`).
- `index.html` — minimal preview page rendering all 4 artboards.

## The four artboards

| # | Name | What it covers |
| --- | --- | --- |
| C1 | Catch-up filter flow | The three-layer control system: (a) Off (Settings toggle disabled), (b) Menu (toggled on, shown in the per-week dismissible bar with a ✕ to dismiss), (c) On (after dismissal — top-bar flame badge with count). |
| C2 | Catch-up screen (§5.17) | Full-page triage. Scope chips (Last week / Last 4 weeks / This term / All year). Group-by chips (Subject / Chronological / Standard / Unit). Status filter. Bulk actions (Mark done / Skip / Carry over / Add to to-dos / Print). Per-row actions + carry-over destination picker. Optional "Add a note" textarea per row. Celebratory empty state. |
| C3 | Task view (Missed scope) | Same items as a flat checklist. Multi-select with bulk-action bar. |
| C4 | Simple Catch-up | Low-floor variant. Each missed lesson is a single card with a "Decide what to do" button → 4 plain-English choices (Move to this week / Mark done anyway / Add a note / Skip for now / Decide later). |

## The three-layer control system

Per planning-doc §1262 ("Catch-up controls"):

1. **Layer 1 — Global on/off toggle in Settings.** Default on. When
   off, no in-grid bar, no top-bar flame badge, no ambient catch-up
   anywhere. The Catch-up screen is still reachable from Settings.
2. **Layer 2 — Per-week dismissible in-grid bar.** The "🔥 N items
   not covered" callout above the Weekly grid. Has a small ✕ to
   dismiss for the current week. After dismissal, a flame badge with
   the count appears in the top bar; clicking it offers to restore
   the bar or open the Catch-up screen.
3. **Layer 3 — Dedicated Catch-up screen (§5.17).** Full-page triage,
   reachable from Settings, the top-bar flame badge dropdown, the
   Today dashboard carry-over click-through, or `g c` keyboard
   shortcut.

## Catch-up screen data shape

`CATCHUP_ITEMS` (exported from `artboards-new.jsx`) is the demo
fixture. Production maps it to a real query against
`CoreLessonEvent` + `CompletionStatus`:

```ts
type CatchupItem = {
  lessonId: string;
  title: string;
  subject: keyof Subjects;
  unitId: string;
  originalDate: string;       // ISO
  daysLate: number;
  standards: string[];        // CCSS codes
  resources: number;
  status: "not_done" | "skipped" | "partial" | "carried";
  reasonNotDone?: string;     // optional note from the teacher
  type: "core" | "extra" | "personal";
};
```

## Decisions / language

- **"Add a note"** is the neutral phrasing. Replaced the earlier
  "Why didn't this happen?" prompt per user feedback (October 2026).
  The teacher chooses to add a note; the system doesn't ask them to
  justify a miss.
- **"Skip for now"** is the row action, not "Skip" or "We won't get
  to it" — keeps the door open.
- **Modified stripe** on the related lesson cards is dashed
  (alternating colored segments), never dotted.
- **Carry-over click-through** — Today dashboard's "N from last week"
  stat opens C2 (Catch-up screen) filtered to `lastWeek`.

## Tokens used

- **Background** — `var(--ink-50)` page; `var(--paper)` cards.
- **Catch-up accent** — `var(--catchup)` rust; `var(--catchup-bg)`
  soft tint for the "Note" pill background.
- **Status glyphs** — see `CPStatusGlyph` in `shared.jsx` for the
  four states (done / current / skipped / upcoming).
- **Subject palette** — keyed by subject id, see `tokens.css` ramps.

## Behaviour notes

1. **Scope chips** at the top of C2 default to `last4` ("Last 4
   weeks"). Other options: `lastWeek`, `term`, `year`.
2. **Group-by chips** default to `subject`. Other options: chrono,
   standard, unit.
3. **Bulk-select** — clicking the row left-edge checkbox enters
   multi-select. A bulk-action bar slides in from the bottom.
4. **Add a note** — hovering a row reveals an inline "Add a note"
   pill on the right; clicking opens an inline textarea in the row.
   Saved notes display as a small soft-rust "Note" chip in the row.
5. **Carry-over destination picker** — clicking "Carry over to…"
   on a row opens a small calendar picker positioned to the row.
6. **Celebratory empty state** — when all items are resolved, the
   screen shows a centered "Caught up!" card with a fern illustration
   and a "Back to Weekly" link.

## How to run

```sh
cd catchup-handoff
python3 -m http.server 8080
# open http://localhost:8080
```

Or open `index.html` in a modern browser.

## Re-implementation notes for production

1. Lift out of Babel-in-browser. Move the four artboards' components
   to a `src/catchup/` directory and remove the `Object.assign(window,
   …)` exports.
2. C2 (the Catch-up screen) is the production target. C1, C3, C4 are
   integrations of it (filter chrome + task-view variant + low-floor
   variant) — same data source, different framing.
3. The `daysLate` field is computed at query time relative to "today";
   make sure the scope chip filters short-circuit to indexed date
   queries against `CoreLessonEvent.scheduledDate`.
4. Bulk actions enqueue the same per-row mutations as the per-row
   actions — share the action handlers.
5. Carry-over destinations should default-suggest "next teaching day
   of this subject" per the planning-doc §5.17 spec.
6. The `?` keyboard cheat sheet (separate feature) lists `g c` as
   the Catch-up screen shortcut — wire it up at the global key
   handler level.

## Cross-reference

- Catch-up is **Phase 1B** in the planning-doc roadmap (the
  Phase-1A late-August beta ships without it; it lands in early fall).
- The Today dashboard's "N from last week" stat is a click-through
  into C2 filtered to `lastWeek` — see the Today dashboard handoff.
- The Print Center has a `Not-done` scope that reuses C2's filter set.
