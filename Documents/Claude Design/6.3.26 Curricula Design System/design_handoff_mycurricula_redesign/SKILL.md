---
name: mycurricula-design
description: Use this skill to generate well-branded interfaces and assets for mycurricula.app (the "Curricula" teacher curriculum-planner — for teachers, by teachers), either for production or throwaway prototypes/mocks/decks. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc.), copy assets out and create
static HTML files for the user to view. If working on production code, you can copy assets and read
the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or
design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production
code, depending on the need.

## What's here
- `README.md` — product context, **content fundamentals** (voice/tone), **visual foundations**
  (color, type, space, motion, cards), and **iconography**. Read this first.
- `colors_and_type.css` — all design tokens (color palette + subject cascade, spacing, radius,
  shadow) and type roles/classes. Import it, or copy the values.
- `assets/` — the brand glyph (open-book) and logo marks.
- `preview/` — small specimen cards (colors, type, components) for reference.
- `ui_kits/planner/` — interactive recreation of the teacher planner (Weekly, Daily, Year, Subject,
  Catch-up, Settings, Teach). Lift components and screens from here.
- `ui_kits/marketing/` — the public landing-page treatment (hero, features, pricing).
- `prototypes/` — two interactive **Year Overview** directions (Timeline + Workspace).

## The one-paragraph brief
mycurricula.app is a **teacher-facing curriculum planner**: dashboard clarity with landing-page
warmth. Plan a year by **subject → unit → week → lesson**. **Color is the navigation** — each
subject owns a hue that **cascades** down to its units, weeks and lessons; **status** (done /
in-progress / not-started / needs-review) is a separate, more-saturated layer. **Indigo `#3B6CF6`**
is the functional primary; **honey `#F4B740`** is the warm accent (and the `.app` in the wordmark).
Large display &amp; H1 are **Poppins**; smaller headings (H2/H3) are **DM Sans**; UI/body is **Plus
Jakarta Sans**. The logo wordmark is **DM Sans**. Surfaces are white on a
**warm cream canvas**, generous radii, soft cool shadows, pill buttons. Copy sounds like a fellow
teacher: warm, brief, sentence case, no emoji.

## Gotchas
- Fonts load from **Google Fonts** (Poppins + DM Sans + Plus Jakarta Sans) — the official delivery; no self-hosting needed.
- Icons are **Lucide**-style line icons — the system's current set; keep them unless the product ships its own.
- Don't confuse this with the kid-facing **Quest** apps (Math/Reading/Grammar Quest) — different brand.
