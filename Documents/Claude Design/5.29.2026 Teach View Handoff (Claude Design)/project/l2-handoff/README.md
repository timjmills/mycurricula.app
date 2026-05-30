# L2 — Daily list view (highlight palette)

Developer handoff package for the **Daily list view** artboard (L2)
from the *5.23.26 Mock-Up* design exploration. The single-column
counterpart to L1 — Sunday's lessons, all in one vertical list, no
right-panel chrome (just the row-anatomy that carries across L1/L2/L3).

## What it shows

- Top: "DAILY PLAN · LIST VIEW" kicker, Sunday · Jan 18 title with
  "X lessons planned · 0 done" subtitle.
- Body: vertical list of `ListRow` items (one per subject's first
  lesson of the day). Same row anatomy as L1 (subject tile → label →
  title → preview → CCSS chip → resource count → completion check).
- Right: `RightDock523` panel scoped to "Sunday".

## Files

- `mock523-v2.jsx` — `ABDailyList` + the shared `ListRow` primitive
  (also used by L1 + L3) + the other list-view artboards.
- `artboards-mock523.jsx` — chrome (`TopBar523`, `LeftRail523`,
  `RightDock523`, `M523_SUBJ`, `M523_WEEK`).
- `data.jsx`, `shared.jsx`, `tokens.css` — base data and styling.
- `index.html` — minimal boot.

## Component anatomy

| Symbol | Purpose |
| --- | --- |
| `ABDailyList` | Top-level Daily list. Reads `M523_WEEK`, picks the first lesson per subject, renders each via `ListRow`. |
| `ListRow` | Shared list-row primitive (see L1 README for full prop reference). |

## How to run

```sh
cd l2-handoff
python3 -m http.server 8080
# visit http://localhost:8080
```

## Re-implementation notes

1. `ABDailyList` currently filters to "first lesson of the day per
   subject" from `M523_WEEK`. Production should query by date and
   return all lessons for that day (multiple lessons per subject
   should appear as separate rows in chronological order by their
   time slot).
2. The "Sunday · Jan 18" header is hard-coded — production resolves
   from the active date selector.
3. The "0 done" stat is hard-coded — wire to a `lessons.filter(l =>
   l.status === "done").length / lessons.length` computation.
4. Empty-day state (no lessons planned) is not yet designed — add it
   in production as a centered illustration + "+ Add a lesson" CTA.
5. Same `ListRow` as L1 — keep one source-of-truth implementation.
