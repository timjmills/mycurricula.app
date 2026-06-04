# Live-page replicas — Year, Curriculum, Daily & Teach

Self-contained HTML snapshots of the **current live** pages, for design
iteration in Claude design (or any browser).

- `year.html` — the live `/year` (Timeline) view.
- `curriculum.html` — the live `/subject/[slug]` (Workspace) view.
- `daily.html` — the live `/daily` view (week strip + lesson detail + resources rail).
- `teach.html` — the live `/teach` board (widgets, board theme, rails).

## What they are
Each file is the **real rendered DOM** of the production page with **all CSS
inlined** (one `<style>` block) and scripts stripped — so it opens standalone,
looks pixel-identical to the app, and needs no server. Fonts load from Google
Fonts (Poppins / DM Sans / Plus Jakarta Sans) via a `<link>` in the head, so
type renders correctly online.

The data shown is the app's real mock curriculum (8 subjects, real units +
lessons), so the replica is a true starting point, not a mock-up.

## How to use
1. Open the `.html` in a browser (or hand it to the Claude design skill) and
   mark up / restyle freely — it won't touch production.
2. When a direction is locked, it gets ported back into the React views
   (`components/year/TimelineYear.tsx`, `components/subject/SubjectView.tsx`).

## Regenerating
These are snapshots — re-capture after the live pages change. (They were
produced by rendering the routes and inlining `document.styleSheets`.)

> Note: class names are the app's hashed CSS-module names. They're stable
> within a snapshot; restyle by structure/selector or hand it to the design
> skill, which reads the layout directly.
</content>
