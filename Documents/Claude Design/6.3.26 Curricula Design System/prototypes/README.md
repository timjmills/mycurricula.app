# Prototypes — Year Overview directions

Two **fully interactive** design directions for the mycurricula.app **Year Overview** — the central
"plan the whole year" surface. Both are v1.3-branded (warm canvas, Bricolage headings, indigo +
honey, bright subject cascade) and are kept side by side so you can choose — or ship both.

These were built as reference designs to drive a **website / product redesign** alongside the design
system and a developer handoff.

## A · Timeline — `Year Overview - Timeline (Curriculy).html`
A horizontal, calendar-style timeline. Each **subject is a row**; its **units** sit across the
school year. The signature interaction: click a unit and its breakdown **expands inline directly
under that row** (pushing later subjects down), with a **downward arrow** connecting the selected
unit to its detail.

- **Progressive selection** — nothing is auto-selected. Open a unit → pick a week → pick a day.
- **Lesson drawer** — selecting a day slides a lesson viewer in from the right (overview, timed
  activities, objectives, standards, resources, mark-complete). Subject color cascades into it.
- **No scrollbars** — weeks/days use an auto-fitting grid that **wraps** to even rows for any unit
  length (5, 10, 12 weeks).
- Files: `Year Overview - Timeline (Curriculy).html`, `curriculy.js`, `curriculy-data.js`.

## B · Workspace — `Year Overview - Workspace (EduPlan).html`
A dense, multi-panel workspace. **Left:** all subjects (each its own color) with an inline unit
list. **Center:** stacked Year Overview → Subject Roadmap → Week Breakdown → Daily Lessons.
**Right:** a docked **lesson viewer** for the selected day (Overview / Standards / Resources /
Assessments / Progress, plus unit-level assessments).

- **Per-subject cascade** — selecting a subject recolors the roadmap, weeks and days to that hue.
- **Responsive, one-at-a-time** — panels dock on desktop; under ~1240px the lesson viewer becomes a
  right slide-over (opens on day-select), under ~1000px the subjects list becomes a left slide-over,
  and under ~720px the rail collapses to icons.
- **No scrollbars** — roadmap/weeks/days wrap via auto-fitting grids.
- Files: `Year Overview - Workspace (EduPlan).html`, `eduplan.js`.

## Notes
- Both names ("Curriculy" / "EduPlan") were working titles for the two directions; the brand
  throughout is **mycurricula.app**.
- Interactions are real (selection, expand/collapse, slide-overs, drawer); data is mocked.
- Slide-overs/drawers open **instantly** rather than animating — the preview environment freezes CSS
  transitions, so end-states are applied directly. Add transitions back for production.
