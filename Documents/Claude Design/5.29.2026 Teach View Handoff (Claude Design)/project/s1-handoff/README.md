# S1 — Subject (Math) view

Developer handoff package for the **Subject view** artboard (S1) from
the *5.23.26 Mock-Up* design exploration. Replicates the
mycurricula.app `/subject/math` page with three substantive additions:

1. **5-stat strip** at the top — Done (41/85), Complete (48%), Standards
   (13/29), Skipped (2), Resources (62).
2. **Per-unit Health cards** — each unit shows coverage % with progress
   bar, standards covered, skipped count, the month range it spans,
   and a **"Don't miss"** callout with the one move not to forget.
3. **Current-unit lesson list** kept (the original by-unit table) plus
   a **Resources sort** at the bottom with the All / Slides / Video /
   Link / Doc / PDF / Image type-filter chips.

The unit-timeline calendar was removed from this view — it lives on
the Year tab (R1 handoff) per design direction.

## Files

- `mock523-v2.jsx` — the S1 component (exported as `window.ABSubjectV2`)
  plus L1/L2/L3 list views in the same file.
- `artboards-mock523.jsx` — top bar, left rail, right dock primitives
  (`TopBar523`, `LeftRail523`, `M523_SUBJ` palette, etc.).
- `data.jsx` — `SUBJECTS`, `LESSONS`, `STANDARDS`, `TEACHERS`, `UNITS`.
- `shared.jsx` — base UI primitives.
- `tokens.css` — CSS variables for ink ramps, subject palette, status colors.
- `index.html` — minimal boot. Open in a browser to preview.

## Component anatomy

`window.ABSubjectV2` is composed of:

| Symbol | Purpose |
| --- | --- |
| `ABSubjectV2` | Top-level subject page. Uses `TopBar523` + `LeftRail523` for chrome. |
| `M523V2_UNITS` | Array of 6 demo units (Place Value → Geometry). Each: `id`, `name`, `start`, `end`, `color`, `done`, `total`, `skipped`, `standardsCovered`, `standardsTotal`, `dontMiss`, `current?`. |
| `M523V2_COLOR` | Per-unit color mapping (soft / mid / deep / text / lane / check). |
| `Stat2` | 5-stat top strip cell. |
| `UnitHealthCard` | The per-unit card. Stripe at top in unit color, header with U-tile + name + NOW pill (if current), progress bar, three-stat row (Standards / Skipped / When), and "Don't miss" callout in unit-soft background. |
| `UnitLessonList` | The same by-unit lesson table from the live build, kept for triage. |
| `ResourcesSort` | All-resources sort table with type filters. |
| `SectionHeader` | Section heading with kicker + title + hint. |

## Data shape

```ts
// Unit object
{
  id: string,
  name: string,
  start: number,           // day index (0..170)
  end: number,
  color: keyof M523V2_COLOR,
  done: number,            // lessons taught
  total: number,
  skipped: number,
  standardsCovered: number,
  standardsTotal: number,
  dontMiss: string,        // the one-line callout
  current?: boolean,
}
```

## How to run

```sh
cd s1-handoff
python3 -m http.server 8080
# visit http://localhost:8080
```

Or double-click `index.html` in any modern browser.

## Re-implementation notes

1. The 5-stat values (41/85, 48%, etc.) are hard-coded in `ABSubjectV2`.
   In production wire to the real subject-progress aggregate.
2. `UnitHealthCard` reads `done`, `total`, `skipped`, `standardsCovered`,
   `standardsTotal` directly. Production gets these from a per-unit
   aggregate query.
3. `dontMiss` is a free-text field per unit — production should let the
   team lead edit this from the Subject settings.
4. The lesson list inside `UnitLessonList` is hard-coded for Unit 3.
   Production binds it to the currently-expanded unit.
5. The Resources sort surfaces 10 of 62 resources for the demo —
   production paginates with the type-filter chips as filters.
