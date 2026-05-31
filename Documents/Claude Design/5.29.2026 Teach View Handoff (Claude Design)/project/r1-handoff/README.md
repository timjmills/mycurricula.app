# R1 — Curriculum Roadmap + Progression (Year view)

Developer handoff package for the **Curriculum Roadmap** artboard (R1) from
the *5.23.26 Mock-Up* design exploration. One component with two view
modes selectable via the toggle at the top:

| Mode toggle label | What it shows |
| --- | --- |
| **Roadmap** | Weekly-column overview with class summary cards (% Complete progress bar), unit bars with status pills (IN PROGRESS / COMPLETE / MODIFIED / UPCOMING), per-lesson dot rows positioned by date, and checkpoint flags between units. Best for "monthly-level" overview. |
| **Progression** | Day-by-day calendar with a gradient month-header strip, F/M/T/W/R weekday + date columns, lane cards with progress bar on the left, per-day **StatusGlyph** rows (✓ completed, hollow ring = skipped, soft fill = in progress, gray dot = not yet encountered), and bright highlighter-marker unit bars sized to their exact date range. Best for end-of-day check-ins. |

## What's included in this build

1. **Two view modes** with a labeled toggle (Roadmap / Progression).
2. **Status filter pill bar** above the calendar: All / Completed / In progress / Skipped / Not yet encountered + Clear filters.
3. **Lane cards** on the left of every lane row showing lane name, student count, and a % Complete progress bar in the lane's tone.
4. **TODAY column marker** — vertical highlight on Oct 9 with a "TODAY" pill at the top.
5. **DATE / CURRICULUM LANES** header above the left column.
6. **Highlighter unit bars** — bright marker-color rectangles with clean rounded corners (no jagged edges per design direction), each carrying a U1/U2/U3 tile + unit title + lesson count.
7. **Per-day StatusGlyph** in the LESSONS row — four states distinguishable by both color and shape.
8. **Expanded legend** at the bottom — LESSON STATUS + CHECKPOINTS & MILESTONES (Unit Checkpoint / Mid-Unit Checkpoint / Major Milestone) + Collapse all.
9. **Per-lane kebab menu** at the right edge of each row.
10. **Bottom stat strip** — Total Units / Total Lessons / Weeks in View / Active Curriculum Lanes.

## Files

- `mock523-roadmap.jsx` — the entire R1 component, self-contained
  (React, no third-party deps beyond React itself).
- `index.html` — minimal boot file. Open in a browser to preview.
- `README.md` — this file.

## Component anatomy

`mock523-roadmap.jsx` exports a single component to `window.ABRoadmap`.
Internal pieces (private to the file):

| Symbol | Purpose |
| --- | --- |
| `ROAD_TONES` | Bright highlighter palette. 6 tones (yellow / green / cyan / purple / pink / orange). Each carries `stroke` (fill), `deep` (text + dot), `lane` (low-saturation bg for the lane card), `text` (on-fill text color), `check` (the "done" green). |
| `MarkerBrush` | Flat highlighter-color rectangle used for unit bars. Bright fill, 8px corners, subtle inset shadow for a marker feel — no turbulence, no rotation. |
| `Brush` | Alternate flat rectangle used in the Roadmap (zoomed-in) view. |
| `StatusGlyph` | Per-day status icon — `state` ∈ `"done"` / `"current"` / `"skipped"` / `"upcoming"`. Differentiable by both color and shape (hollow ring for skipped, check inside filled circle for done). |
| `StatusLegendCompact` | The bottom legend strip with LESSON STATUS + CHECKPOINTS & MILESTONES. |
| `RoadmapZoomedOut` | The Progression view (day-by-day calendar). Contains the lane rendering with lane cards, day columns, and unit brushes. |
| `RoadmapZoomedIn` | The Roadmap view (weekly columns + class summary cards). |
| `ABRoadmap` | Wrapper with tab toggle between the two modes. |
| `BrushDefs` | (Vestigial SVG turbulence filters from an earlier brush-stroke iteration. Currently unused but kept for future use.) |

Icons are inline SVGs (`IconCal`, `IconBook`, `IconLayers`, `IconFlag`,
`IconStar`, `IconUsers`, etc.) — no icon-library dependency.

## Data shape

### Progression-view lane (the day-by-day calendar)

```ts
{
  id: string,
  name: string,                  // class display name
  tone: "yellow"|"green"|"cyan"|"purple"|...,
  textTone: "rose"|"purple"|"teal",
  units: Array<{
    name: string,
    startMonth: number,          // 0=Sept, 1=Oct, 2=Nov in the demo data
    startDay: number,            // calendar day-of-month
    endMonth: number,
    endDay: number,
    tone: keyof ROAD_TONES,
    lessons: number,
  }>,
}
```

The grid is built from `monthDays`: each month carries an array of
school days (weekends skipped) with `{ wkd, n }`. Unit bars are absolutely
positioned over the day grid using
`findDayIdx(monthIdx, dayN) * COL` where `COL = 30` (px per day).

### Roadmap-view lane (the weekly-column overview)

```ts
{
  id: string,
  name: string,
  sub: string,                   // e.g. "First Period"
  students: number,
  complete: number,              // 0-100, drives the progress bar
  tone: keyof ROAD_TONES,
  units: Array<{
    name: string,
    status: "IN PROGRESS"|"COMPLETE"|"MODIFIED"|"UPCOMING",
    lessons: number,
    weeks: number[],             // week indices the unit spans
    doneIdx: number,             // # of lessons completed
  }>,
  checkpoints: Array<{
    weekIdx: number,
    label: string,
    date: string,
  }>,
}
```

## Design tokens used

- **Background** — `#F4F6FB` (page); `#fff` (cards); `#FAFBFC` (lane label cell).
- **Borders** — `#E6E9F4` (card outline); `#ECEEF7` (inner row dividers); `#F5F6FA` (day grid lines).
- **Text** — `#1F2A4E` (primary); `#5B6580` (secondary); `#94A3B8` (tertiary / day labels).
- **Highlight bars** — `ROAD_TONES[].stroke` (yellow `#FFE56B`, green `#A0F0B8`, cyan `#9CECE2`, purple `#CBB3F7`, pink `#FBB9D5`, orange `#FFC392`).
- **Status pills** — see `StatusPill` for the bg/fg pairs.
- **Today** — `#5B61F4` (indigo) accent with low-alpha background tint on the column.

## How to run

```sh
cd r1-handoff
python3 -m http.server 8080
# visit http://localhost:8080
```

Or double-click `index.html` in any modern browser.

## Re-implementation notes for production

1. Lift out of Babel-in-browser. Remove `Object.assign(window, { ABRoadmap })`.
2. The day-column model is the truth-source for Progression. In production wire `monthDays` to the school-year calendar so it skips real holidays / PD days.
3. Unit bars span by start/end (month, day). Production should accept ISO dates.
4. `StatusGlyph` per-day state is currently faked from a `ratio` of the unit's date range. Production binds each dot to a real lesson record so hover → tooltip with title + status.
5. The two view modes are independent components — make them route-driven in production (`?view=roadmap` vs `?view=progression`) rather than the inline `useState` toggle.
6. Status filter chips are visual-only in this build; wire them up to a filter state and gray out the non-matching glyphs.
7. The `today` column is hard-coded to Oct 9. In production this should be `new Date()` resolved against the school-year calendar.
8. Checkpoint flag rendering between units (overlay layer over the day grid) is sketched in the Roadmap view but not yet placed in Progression — add this in production using a similar absolute-positioned overlay over the LESSONS row.
