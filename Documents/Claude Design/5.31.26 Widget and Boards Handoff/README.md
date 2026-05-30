# Handoff: Classroom Boards & Widgets (5.30.26)

## Overview
A teacher-facing **classroom board** product: teachers assemble interactive "boards" out of
**widgets** (timers, polls, learning targets, name pickers, etc.), browse and manage boards in a
**Board Library**, edit a board on a **canvas** (place, resize, recolor widgets, drop in resources),
and run a board **full-screen** in front of the class with annotation tools.

This bundle contains the design for that product across five HTML prototype "tabs" dated 5.30.26.

## Screenshots (`screenshots/`)
Visual ground truth for each tab — compare your rebuild against these.
- `1-widgets.png` — Widget gallery (early exploration): dashboard + expanded panels.
- `2-widget-library.png` — Widget Library browser (sidebar, filters, favorites band, widget grid).
- `3-board-library.png` — Board Library (team/personal, usage meter, board cards, team library).
- `4-board-editor.png` — Board Editor canvas with the Board Theme appearance panel.
- `4b-board-editor-appearance.png` — Editor appearance panel + swatch/accent/size/radius/font controls.
  (The **per-widget Appearance** panel and the **Board Theme** panel use identical controls — selecting
  a widget shows "Appearance · overrides the board theme for this widget"; deselecting shows "Board
  Theme · applies to every widget.")
- `5-board-fullscreen.png` — Full-screen board (gradient bg, favorites bar, markup tools docked left).
- `5b-board-fullscreen-library.png` — Full-screen board with the Widget Library pop-up open.

Note: prototypes load React/Babel from a CDN; if opened offline they render blank — use these
screenshots as the reference in that case.


## About the Design Files
**The files in this bundle are design references created in HTML** — prototypes that show the intended
look, layout, and behavior. They are **not** production code to ship as-is. They use React 18 + Babel
loaded from a CDN and transpiled in the browser (fine for a prototype, not for production).

Your task is to **recreate these designs in the target codebase's environment** using its established
patterns and libraries (React/Vue/Svelte/etc., your component library, your state/router). If there is
no existing front-end yet, pick an appropriate modern stack (e.g. React + TypeScript + Vite, CSS
variables or Tailwind) and implement there. Lift the **exact** design tokens, layouts, and copy from
these files; re-implement the structure idiomatically.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, radii, gradients, and interactions are all
specified. Recreate the UI pixel-closely. The one intentional placeholder convention: **student photos**
are drawn as initial-on-tint avatars, and **resource/PDF/photo content** is shown as striped
placeholders with monospace labels — wire these to real images/data in production.

---

## The five tabs (screens)

### 1. `5.30.26 - Widgets.html` — Widget gallery (early exploration)
- **Purpose:** the first widget visual system — a live "All-in-One Dashboard" plus expanded widget forms.
- **Layout:** a centered `.page` (max 1480px). A white dashboard card holds a 3-column grid of compact
  widgets; below, expanded widgets sit in framed pastel "panels" (Participation & Games, Groups &
  Classroom Flow, Board Setup & Announcements) each with its own chrome (toolbar / app bar).
- **Note:** superseded conceptually by the Widget Library tab, but kept as the origin of the widget
  visual language. Self-contained (inline `<style>`); depends on `widgets530-core.jsx`,
  `widgets530-dashboard.jsx`, `widgets530-expanded-a.jsx`, `widgets530-expanded-b.jsx`.

### 2. `5.30.26 - Widget Library.html` — Widget catalogue + 5 board panels + Note/View widget
- **Purpose:** browse/add widgets; reference every widget in its full form across 5 themed panels.
- **Widget Library browser:** top app bar (hamburger · green house logo · "Widget Library" · chrome +
  teacher avatar). Left sidebar: **Browse** (All Widgets, Favorites[active], Recently Used, Suggested) +
  **Categories** (Lesson, Management, Assessment, Language, Well-Being, Utilities) + a "Customize your
  board" promo card. Main: search field + filter pills (All[active]/Lesson/Management/Assessment/
  Language/Favorites) + a gold **Favorites band** (6 quick chips + "Manage Favorites") + a 4-column grid
  of widget cards (preview thumbnail, favorite star, title, description, **Add** button; the first card,
  Learning Target, shows the **Added ✓** state). Dashed footer: "Drag widgets onto your board or tap Add."
- **5 panels** (each a rounded `.screen` with the app bar + a "Panel N of 5" pill, holding the named
  widgets — every widget is labelled):
  - **Panel 1 · Lesson Essentials:** Learning Target, Now–Next–Then, Directions, Materials Needed, Work Completed
  - **Panel 2 · Routines & Classroom Management:** Transition, Attention Signal, Voice + Movement Expectations, When You're Done (Must Do / May Do), Student Jobs
  - **Panel 3 · Assessment & Support:** Exit Ticket, Understanding Check, Help Queue, Participation Tracker, Question Parking Lot
  - **Panel 4 · Small Groups & Language Support:** Center Rotation, Small Group Teacher Table, Vocabulary / Key Words, Sentence Frames, Discussion Protocol
  - **Panel 5 · Regulation & Teacher Tools:** Brain Break, Calm Corner / Regulation, Behavior / Class Points, Teacher Notes (Private), Mini Whiteboard
- **Note / View widget:** a card holding multiple photos/PDF pages ("Day 1: Verb Tenses" with a facsimile
  fillable worksheet + carousel dots + Grammar/Brainpop caption). Clicking **expand** opens a full-screen
  slideshow: top bar (Close · ‹ page / 46 › · Notes/Download/Open-in-new/More), large page on the left,
  notes panel on the right. Arrow keys page through; Esc closes.
- **Depends on:** `widgets530.css`, `widgets530-core.jsx`, `widgets530-wkit.jsx`, `widgets530-p1…p5.jsx`,
  `widgets530-padlet.jsx`, `widgets530-screens.jsx`.

### 3. `5.30.26 - Board Library.html` — Board manager
- **Purpose:** browse, tag, duplicate, repeat, share, and organize boards (max 50 per teacher).
- **Top bar:** school logo · **Team Boards / Personal Boards** segmented toggle · search · **18 / 50 boards
  used** meter + info · blue **+ New Board**.
- **Left sidebar:** **My Library** (All Boards[active], Favorites, Recent, Shared with Team, My Boards,
  Archived) · **Filter by Use** (Lesson, Part of Lesson, Free Board, Day, Week, Subject, Schedule Time,
  Whiteboard — each color-keyed) · a "50 boards" usage card with progress + Manage boards.
- **Main:** colored filter pills (All/Lesson/Part of Lesson/Whiteboard/Day/Week/Subject/Schedule Time/
  Shared) + Sort by. A 4-column grid of **board cards** — each: preview thumbnail (with optional star),
  title, colored **tags** (subject/day/time/type), a **Repeats:** line + owner (Grade 5 Team / Personal),
  and an action row: **Open · Duplicate · Repeat · Share · More**. Below: a blue "Boards are separate from
  resources" explainer (drag a resource → drop zone) and a **Team Library** card (4 shared-board mini
  cards: who shared + when). Bottom **Tips** bar (dismissible).
- **Board model (from product discussion):** boards are tagged for a Lesson / Part of Lesson / Free board
  (whiteboard) / Day / Week / Subject / Schedule Time. Tags are **labels/filters now**, intended to become
  **real links** later (open a board in the context of a schedule slot / lesson / day). **Repeat**
  schedules a board on specific weekdays, specific times, daily, weekly, by subject, or by schedule slot.
  **Share** is team-wide (teammates can view + copy). Boards are **separate from resources**; resources
  can be dragged or selected onto a board but live independently.
- **Depends on:** `widgets530.css`, `widgets530-core.jsx`, `boardlib.jsx`.

### 4. `5.30.26 - Board Editor.html` — Board canvas + editable appearance
- **Purpose:** open a board to a canvas; place/move/resize widgets; recolor them; drop in resources.
- **Toolbar:** back · board name + tags · **Widget** (add-widget menu) · **Resource** (picker modal) ·
  **Board theme** (deselect → global theme panel) · **Present** · **Share**.
- **Canvas:** dotted background; widgets are absolutely positioned, **draggable** (grab anywhere) and
  **resizable** (corner handle). Selecting a widget shows a small tools bar (drag · duplicate · delete).
- **Editable appearance (key feature):** a **global board theme** with **per-widget overrides** on top
  (per-widget wins). Both expose the same controls: **Background** (9 swatches — 6 pastel families +
  Slate / White / Night neutrals), **Accent** (8 dots), **Text color** (Dark / Slate / White), **Text
  size** (slider, 80–140%), **Corner radius** (slider, 6–30px), **Font** (Sans / Rounded / Serif / Marker
  / Mono). Selecting a widget → right panel = **Appearance** (this widget); empty selection → right panel
  = **Board Theme** (all widgets). Reset links: "Reset to board theme" (per-widget) / "Clear all
  per-widget overrides" (board). **State persists** to `localStorage` (`be-board-v1`).
- **Add resource:** modal grid of resources; **click to add** or **drag onto canvas** (HTML5 DnD,
  `text/resource`). Resources render as titled placeholder cards.
- **Depends on:** `widgets530.css`, `widgets530-core.jsx`, `boardeditor-widgets.jsx`, `boardeditor.jsx`.

### 5. `5.30.26 - Board Fullscreen.html` — Run a board in front of the class
- **Purpose:** immersive full-viewport board with a custom background, a favorites bar + library, and
  annotation (markup) tools.
- **Background:** full-bleed soft gradient; a **Background** button opens a swatch picker (Dusk, Cream,
  Sky, Blossom, Mint, Apricot, Lilac, Night, Dots, Plain).
- **Favorites bar (bottom-center):** Background button · "Favorites" label · favorite widget chips
  (Text · Timer · Poll · Name Picker · Clock · Traffic) — click to add to the board · purple **Library**
  button → opens the **widget-library pop-up** (search + grid of widget cards with favorite stars; click
  to add).
- **Markup tools panel (docks left or right):** a vertical toolbar — a **move button** flips the whole
  panel between the left and right edges — with **Select · Pen · Highlighter · Eraser · Text · Sticky**,
  6 **color** dots, and **Undo / Redo / Clear**. Pen/Highlighter draw freehand strokes (highlighter =
  thick translucent); Eraser removes a stroke on click; Text/Sticky drop a widget at the click point.
- **Chrome:** Home (top-left) · Fullscreen + More (top-right) · page nav ‹ 9 › (bottom-right).
- **Depends on:** `widgets530.css`, `widgets530-core.jsx`, `boardeditor-widgets.jsx`, `boardfull.jsx`.

---

## Interactions & Behavior
- **Board Editor / Fullscreen widgets:** drag to move (only in Select mode on the full-screen board);
  corner handle resizes (editor); select shows duplicate/delete; everything is pointer-driven.
- **Appearance:** every control updates the live preview immediately by re-deriving CSS variables on the
  widget wrapper (see Design Tokens → themeable widget). Per-widget override beats board theme beats the
  widget's built-in default.
- **Persistence:** Board Editor saves `{ widgets, boardTheme }` to `localStorage["be-board-v1"]` on every
  change and restores on load.
- **Markup drawing:** strokes are arrays of `"x,y"` points rendered as SVG `<polyline>`; undo/redo are
  stacks; clear empties both.
- **Note/View slideshow:** `←/→` change page, `Esc` closes, expand icon opens.
- **Pop-ups / modals** close on outside click (board mousedown / overlay click).
- **Transitions:** subtle — `pop` keyframe (scale .7→1, cubic-bezier(.34,1.56,.64,1)) for appearing
  elements; `spin` for refresh; 0.08–0.12s ease on button press/hover. No heavy animation.
- **Hover:** chrome icon buttons get a faint `rgba(16,23,41,.06)` wash; cards lift via shadow only.

## State Management
- **Board Editor:** `widgets[]` (`{id,type,x,y,w,ov,data}`), `boardTheme` (override object), `sel` (id),
  `addOpen`, `resOpen`, `present`. Effective theme = `merge(widgetDefault, boardTheme, widget.ov)`.
- **Board Fullscreen:** `widgets[]`, `bg` (preset key), `sel`, `tool` (select/pen/highlighter/eraser/
  text/sticky), `color`, `strokes[]`, `redo[]`, `side` (left/right), `bgOpen`, `libOpen`, `page`.
- **Board Library / Widget Library:** mostly presentational (filter/toggle local state); data arrays
  (`BOARDS`, `LIB`, `FAVS`) are inline and should come from the backend in production.

## Design Tokens
All tokens live in **`widgets530.css`** under `:root` (the Widgets.html tab inlines an equivalent set).

**Typography**
- Font: `"Plus Jakarta Sans"` (primary). Optional alternates used by the theme picker: `"Quicksand"`
  (Rounded), `Georgia` (Serif), `"Caveat"` (Marker / whiteboard handwriting), `ui-monospace` (Mono).
- Weights 400/500/600/700/800. Titles/numbers 800 with tight tracking (titles `-0.3px`, big numbers
  `-1.5px`). Body 500–600. Uppercase widget labels: 12px / 700 / `letter-spacing:.12em`.

**Neutrals / ink**
- `--ink:#101729` · `--ink-soft:#37405a` · `--ink-mute:#6b7280` · `--ink-faint:#9aa1ad` ·
  `--chrome:#abb1bd` · `--line:#e9ebf0` · `--paper:#fff` · `--page:#f6f7f9`.

**Widget color families** (each has `-bg`, `-chip`, `-accent`, `-soft`, `-line`, and a `-grad` gradient
`linear-gradient(165deg, near-white → tint)`):
- yellow `#d99c08` · green `#1fa85a` · pink `#e84e93` · purple `#7c5cf6` · orange `#f2802b` · blue `#2e6be6`.
- Example accents above; see CSS for the full bg/chip/soft/line values.

**Neutral theme options** (appearance editor): `slate` (accent `#5b6478`), `cloud`/White (accent
`#3b4456`), `dark`/Night (bg `#1c2333`, accent `#9db4e8`), plus `--ink-accent:#101729`.

**Radii:** card 22px · inner 16px · buttons 14px · chips 11px · pills 999px (`--r-card`, `--r-inner`, …).

**Shadows:** `--shadow-card: 0 1px 2px rgba(16,23,41,.04), 0 6px 20px rgba(16,23,41,.05)` ·
`--shadow-inner: 0 1px 2px rgba(16,23,41,.05), 0 2px 8px rgba(16,23,41,.04)` ·
`--shadow-pop: 0 18px 60px rgba(16,23,41,.22)`. Cards also carry a 1px inset ring `rgba(16,23,41,.04)`.

**Themeable widget contract** (`.tw` in CSS + `themeVars()` in `boardeditor-widgets.jsx`): a widget reads
`--w-grad, --w-soft, --w-chip, --w-line, --w-card, --w-accent, --w-ink, --w-radius, --w-font, --w-scale`.
Internal sizes use `em` so `--w-scale` rescales the whole widget. This is the mechanism to replicate so
appearance editing works in production.

## Icons
A single inline SVG icon set (Lucide/Feather-style, `stroke=currentColor`, stroke-width 2) lives in
**`widgets530-core.jsx`** (the `I` object) — ~70 icons. Replace with your codebase's icon library
(lucide-react, etc.); names map directly (pin, expand, sun, x, users, mic, trophy, clock, target,
ticket, bell, megaphone, lotus, etc.). A few custom glyphs (Aa text, hourglass, traffic light, cursor)
are defined inline in `boardfull.jsx`.

## Assets
- **No external image assets.** Backgrounds are CSS gradients; "photos"/"PDF pages" are striped CSS
  placeholders with monospace labels; student avatars are initials-on-tint. Swap these for real
  uploads/CDN images in production.
- **Fonts:** Google Fonts (Plus Jakarta Sans, Quicksand, Caveat) — self-host or use your font pipeline.
- **Decorative shapes** (confetti dots, sparkles, star doodle, dice pips, emoji faces) are simple inline
  SVG/CSS — re-create or drop as desired.

## Files
HTML tabs (each loads its JSX via `<script type="text/babel" src=…>`):
- `5.30.26 - Widgets.html` → core, dashboard, expanded-a, expanded-b (inline CSS)
- `5.30.26 - Widget Library.html` → widgets530.css + core, wkit, p1–p5, padlet, screens
- `5.30.26 - Board Library.html` → widgets530.css + core, boardlib
- `5.30.26 - Board Editor.html` → widgets530.css + core, boardeditor-widgets, boardeditor
- `5.30.26 - Board Fullscreen.html` → widgets530.css + core, boardeditor-widgets, boardfull

Shared / supporting:
- `widgets530.css` — all design tokens + base + `.screen`/`.appbar`/`.tw` primitives
- `widgets530-core.jsx` — icon set (`I`), `DieFace`, `Chrome`, `Chip`
- `widgets530-wkit.jsx` — `WHead`, `Avatar`, `Face`, `Pill`, `StepNum`, `FootNote`
- `widgets530-p1…p5.jsx` — the 25 panel widgets
- `widgets530-padlet.jsx` — Note / View widget + slideshow modal
- `widgets530-screens.jsx` — app bar, 5 panel shells, Widget Library browser, page composition
- `boardeditor-widgets.jsx` — theme model (`themeVars`, option sets) + themeable widget renderers
- `boardeditor.jsx` — editor shell (canvas, drag/resize, appearance + board-theme panels, resource modal)
- `boardfull.jsx` — full-screen board (favorites bar, library popup, markup tools panel, draw)
- `WIDGET-UPDATE-GUIDE.md` — the original spec for converting an existing widget set to this visual system

## Open product questions (not yet resolved in the design)
- "Use agent teams" — meaning TBD; likely team sub-spaces or AI-assisted board building/sharing.
- Tags → real links: which of schedule-slot / lesson / day should drive opening a board in context.
- Wiring Library **Open** → Editor → Fullscreen into one navigable flow (currently separate tabs).
- Whether the editable-appearance system should also be retrofitted onto the Widget Library panel widgets
  (currently it lives in the Board Editor / Fullscreen, which is where recoloring happens in-product).

## Minor known note
On the full-screen board, the vertically-centered markup panel can visually approach the top-left Home
button in a very short viewport; at real full-screen heights it clears it. If you want it bulletproof,
constrain the panel to a vertical band between the Home button and the favorites bar.
