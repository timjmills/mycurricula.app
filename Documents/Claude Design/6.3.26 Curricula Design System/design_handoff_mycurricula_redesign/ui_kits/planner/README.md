# Planner UI kit — mycurricula.app

A high-fidelity, interactive recreation of the **mycurricula.app teacher planner**, dressed in
the **v1.3** visual language (warm canvas, Poppins/DM Sans headings, indigo + honey, bright subject
cascade). It's a *reference build* — cosmetically faithful, intentionally light on real logic — so
designers and engineers can lift components and screens straight into product work.

## Run it
Open `index.html`. It boots into the **Weekly** view; use the top tabs / left rail to move between
surfaces. State is in-memory (no backend).

## Surfaces
| View | What it shows |
|---|---|
| **Weekly** | The gold-standard 5-day grid of subject-colored lesson cards (grid + list modes). |
| **Daily** | A single teaching day, period by period, with a side rail of reminders + progress. |
| **Year** | Subject lanes of unit chips — the color cascade across the whole year. |
| **Subject** | A unit drilled into weeks → lessons (the cascade in a column layout). |
| **Catch-up** | Lessons that slipped, with reschedule / skip / merge actions. |
| **Settings** | Appearance + planner behavior (card style, subject palette, toggles). |
| **Teach** | The projector-facing teaching board with live widgets (timer, noise meter, name picker, now & next, objective). |

## Files
```
index.html      ← entry; loads tokens + ui_kit.css, then the JSX below
ui_kit.css      ← the v1.3 shell + every surface's styles (built on ../../colors_and_type.css)
data.js         ← mock subjects, week schedule, year roadmap, unit drill-down, catch-up
icons.jsx       ← <Icon name> — Lucide-style line icons (24px, round caps)
Shell.jsx       ← app shell: team banner, top bar, icon rail, view routing
Weekly.jsx      ← Weekly grid + LessonCard (the cascade recipe in card form)
Surfaces.jsx    ← Daily · Year · Subject · Catch-up · Settings
Teach.jsx       ← Teach board + widgets
```

## Conventions worth copying
- **Cascade via two vars.** Every subject sets `--c` (bright accent), `--ct` (tint), `--ck` (ink),
  `--cs` (solid) on a container; chips inherit them. Re-theme a whole lane in one line. See `sv(id)`
  in `data.js`.
- **Lesson card** = white surface, 4px subject stripe on the left, "Subject · time" meta, dominant
  title, em-dash subtitle, standard chip, status ring. Dashed stripe = modified from the team plan.
- **Status is separate from subject** — green done / blue in-progress / grey not-started / honey
  needs-review, so progress always reads the same on any subject.
- **Icons are Lucide-style** line icons (see `icons.jsx`); swap in the real Lucide set in production.

## Caveats
- Fonts load from **Google Fonts** (Poppins + DM Sans + Plus Jakarta Sans) — the official
  delivery for this system. No self-hosting needed; they're loaded via `../../colors_and_type.css`.
- This is a visual/interaction reference, not production code — data is mocked and most actions are
  cosmetic.
