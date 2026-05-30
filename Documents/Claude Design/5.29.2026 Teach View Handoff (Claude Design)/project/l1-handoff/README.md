# L1 — Weekly list view (highlight palette)

Developer handoff package for the **Weekly list view** artboard (L1)
from the *5.23.26 Mock-Up* design exploration. An alternative to the
grid weekly: same data, flat list grouped by day, designed for
read-through and check-off.

## What it shows

- Top: page title + "Same data as the grid view, listed by day" hint.
- Body: 5 day sections (Sunday → Thursday). Each section has a header
  with the day name + lesson count, then a vertically-stacked list of
  `ListRow` lesson rows.
- Right: `RightDock523` panel (Resources / Day Shoutbox / To-do).

Each `ListRow` carries: subject monogram tile (Ma / Re / Wr / Gr / Sp /
Uf / Ex / Se) → time + subject label → title + 1-line preview → CCSS
chip → resource count → completion check. Modified rows get a dashed
left edge in the subject's deep color.

## Files

- `mock523-v2.jsx` — `ABWeeklyList` + `ListRow` (shared with L2/L3) +
  S1 (`ABSubjectV2`) and the other list-view artboards.
- `artboards-mock523.jsx` — chrome (top bar, left rail, right dock,
  `M523_SUBJ` palette, `M523_DAYS`, `M523_WEEK` data).
- `data.jsx`, `shared.jsx`, `tokens.css` — base data and styling.
- `index.html` — minimal boot.

## Component anatomy

| Symbol | Purpose |
| --- | --- |
| `ABWeeklyList` | Top-level Weekly list view. Wraps `TopBar523` + `LeftRail523` + the day-grouped list + `RightDock523`. |
| `ListRow` | The shared list-row primitive. Used by L1 / L2 / L3 so the visual rhythm is consistent. Renders subject tile, time/weekday chip, title, preview, CCSS chip, resource count, completion box. |
| `M523_WEEK` (from `artboards-mock523.jsx`) | Source-of-truth lesson data. Object keyed by subject id; each value is an array of 5 day-slots (sun..thu), each containing a lesson record or `null`. |

## `ListRow` props

```ts
{
  lesson: {
    subject: string,            // key into M523_SUBJ
    title: string,
    preview: string,
    standards: number,          // CCSS chip count
    resources: number,
    modified?: boolean,         // adds the dashed left edge
    carryOver?: boolean,
    core?: boolean,
  },
  time?: string,                // e.g. "8:10-9:10"
  weekday?: string,             // alternative to time, e.g. "W12 · Mon"
  dense?: boolean,              // suppresses the preview line
}
```

## Subject palette

Eight subject monogram + color pairs live in `M523_SUBJ`
(`artboards-mock523.jsx`). Each carries `tile` (pastel fill), `bg`
(card background), `deep` (text-on-pastel), `label` (uppercase
subject name), `short` (two-letter monogram).

## How to run

```sh
cd l1-handoff
python3 -m http.server 8080
# visit http://localhost:8080
```

## Re-implementation notes

1. Grouping is currently by source-data `day` index (0..4 = Sun..Thu).
   Production should resolve real dates.
2. Modified state is shown with a dashed left edge — production wires
   this to the lesson's `personalized` / `modified_from_master` flag.
3. The completion checkbox at the right edge is visual-only —
   production wires to the lesson's status mutator (same as the
   grid view).
4. Row click should navigate to lesson detail (currently no handler).
