# CHANGELOG — what's new since the previous handoff

> Previous package: **`design_handoff_v2_site`** (the first V2 site handoff).
> This package: **`design_handoff_v2_2026-07-02`** — captures everything shipped
> into the working mockup since that package.
>
> The single source of truth for *how it should look and behave* is
> **`design-system/V2 Framework.md`** (now updated with the new patterns below) and
> its visual companion **`design-system/V2 Design System.html`**. The runnable
> reference is **`mockup/New v2 Site Design.bundled.html`**.

Everything below is **built and working in the mockup**. It is still Phase-1A
(mock-data) fidelity — no Supabase yet (see README §"Mock vs. real").

---

## 1. View / Edit modes on Day & Week  *(new — Framework §9a)*

- **View ↔ Edit toggle** (an icon pair in the top-left title cluster). The choice
  is **remembered per view**. The **global appearance** (frame · background · glass
  · theme) is shared across both modes — flipping never restyles the page.
- **View** = the read-optimized Day agenda / Week grid (unchanged in purpose).
- **Day edit** = a **two-pane** surface: a **fixed** compact agenda list on the left
  (time · dot · title · subject; current/next lesson selected by default) + a
  **scrolling** fill-in template on the right. Selecting a lesson swaps the template
  (animated). The split is **resizable**. Phone: list becomes a top strip.
- **Week edit** = a **period-aligned column board** (Common-Planner style): day
  columns, lessons as flush stacked cells in shared period rows so the same time
  band lines up across days. Cells **drag across days & periods** (leaving an empty
  slot), a live **drop placeholder** shows the landing spot, cells **minimize to
  their header while dragging**, and the shift **FLIP-animates**. An **Aligned by
  time / Stacked** layout toggle packs cells flush regardless of gaps.
- Both edit modes bind to the **same unified lesson data** View shows and respect
  the current **Personal/Team** fork, with an explicit **Save to team**.
- **The old "Plan" view is retired** — the **Plan** nav entry now opens the
  **Planning Hub**.

## 2. The lesson editor (fill-in template)  *(new — Framework §10)*

The shared authoring surface (Day-edit right pane · Week cell expand · lesson popup):

- **Customizable section blocks** — drag-reorder (hold the banner), inline-rename,
  per-section **wash color** (each header defaults to a *different* subject wash
  unless overridden in the lesson-template defaults), a toggle to tint just the
  header or the field background too, add / delete / **duplicate** (⋯ menu), and a
  **permanent Resources section**.
- **Selection-driven floating rich-text bar** — appears only when text is selected
  / a field is focused: **B/I/U**, three sizes, font, **text + highlight color**
  (curated washes behind a ▾), **numbered + bulleted lists with indent**, links,
  images, and a **resource chip** (from computer · link · image · note · Drive · the
  built-in library).
- **Load template / Save as template**, and a **Load standards** picker with
  add/delete standards.
- **Standards** and **Materials** are their own tabs; **Stats** and **Notes** too.
- **Autosaves on every keystroke**; edits **broadcast live** between the popup and
  the inline card.
- Resources tab has a **list / thumbnail** view toggle and **Open in Resource Wall**.

## 3. Lesson popup modal

- In **View** mode, a lesson's popup menu → **Plan** opens a centered **resizable**
  modal of the lesson editor over a **glassed-out backdrop**. It closes **only via
  Exit or Esc** — an outside click does **not** close it (can't lose work by
  mis-clicking).
- Opens with a clean light/glass face to match the app; **per-heading wash colors**.
- In **Day edit**, the same action **selects the lesson into the right pane** instead
  of popping a modal (the surface is already an editor).

## 4. Immersive surfaces — Plan · Post · Teach  *(new — Framework §9b)*

- These three go **full-bleed**: the two-row nav chrome, the view console, and the
  notification cluster **drop away** so the surface fills the whole rounded canvas.
- In their place: **one slim floating bar** (soft top scrim) with **Back**, the
  **title + style gear**, and — on Plan — the **Personal/Team** toggle. The bar
  **auto-hides** and returns on pointer movement near the top.
- Day/Week/Year keep full chrome; immersion is scoped to these three.

## 5. Resource Wall — custom walls  *(new — Framework §10)*

- **Enlarge a section** → a focused board with the full **edit bar** (search · type
  filter · four card sizes) and **Add resource**.
- **Add a section** promotes it into **one custom wall in My Walls**, **anchored to
  the originating lesson** (never created by resource edits alone).
- The lesson's own Resources keeps showing its first section **plus a "N sections ·
  M more resources" chip** that opens the linked wall; My Walls tags the wall with
  its linked lesson.
- **Every wall's background is fully customizable** (color · translucent
  shade+opacity · wash · photo · upload), **persisted per wall**. When set, the
  toolbar gets a **frosted contrast plate** and the floating bar a tone-matched
  scrim so chrome stays legible over any background.
- Sections show the **lesson(s) they're tagged to**, capped at **3 + a "+N" reveal**.
- **Default card size is the small thumbnail.** Section background **persists into**
  the soloed board. The **Back arrow** returns to the main wall.
- **Renamed "board" → "custom wall"** everywhere (avoids confusion with Teach
  boards). "Color sections by subject" moved into the per-view style menu; the old
  blue fallback is gone (sections key off their own subject color).

## 6. Notifications · enriched To-Do · Tools dock  *(new — Framework §10)*

- **Notifications** — toasts (type-keyed rail: message=brand · to-do=amber ·
  overdue=red · team=pink), a **bell + notification center** (unread badge,
  Today/Earlier, filter chips, Mark-all-read), and **inline badges**; a scheduler
  promotes due-soon/overdue tasks. Local store today → Supabase realtime in 1B.
- **Enriched To-Do** — assignee · due date/time · priority · status · optional
  lesson/subject link; Mine/Everyone filter; overdue pinned; assigning fires a
  notification.
- **Tools dock** — a floating **resizable** window (Shout Box · To-Do · Notes +
  Resources / Catch-Up shortcuts) that drags anywhere, snap-docks at the right edge,
  and **collapses to a draggable icon rail** that flips vertical/horizontal.
  Position/size/mode/tab persist.

## 7. Top bar & navigation

- **Personal / Team** is now an **icon toggle** (single-person / group), centered,
  with hover/focus help tooltips.
- The **view title + style gear** moved **into the top bar next to the logo**.
- Planner Hub: **dark accent strip** across the page header; the **Color-frame
  header uses the multicolored gradient** (not blue); the lesson banner is a soft
  **mix of the light subject washes**.

## 8. Rule #1 — NO SHARP CORNERS  *(Framework §6)*

- Codified as the **#1 visual rule** in both `V2 Framework.md` and
  `V2 Design System.html`. Every panel, card, tab, chip, field, preview tile and
  menu is rounded. Offending square corners (list-view wall chips, resource cards,
  color preview tiles, Catch-Up group heads) were fixed.

## 9. Legibility fixes

- **Week period-rail labels** now stay light + shadowed over dark tone and photo
  backgrounds. **Upcoming/idle badge** contrast darkened to a readable slate. Wall
  chrome stays legible over any custom background (§5).

---

## Design-doc changes in this package

- **`V2 Framework.md`** — added **§9a View & Edit modes**, **§9b Immersive
  surfaces**, and expanded **§10 Components** with the **lesson editor** and
  **custom walls**. (It already documented Tools dock, notifications, the glass
  registers + Liquid-on-wash, the six-axis combinatorial system, the legibility
  contract, and surface tiers.)
- **`V2 Design System.html`** — the browsable visual guide (unchanged structure;
  `@dsCard` tag stripped in this copy so it doesn't register as a card).

## Source additions in this package

- **`source/planbook-edit.jsx`** + **`source/planbook-edit.css`** — the Week/Day
  **editor** implementation. These were previously **inline-only** in the bundle;
  they are now extracted as standalone modules so the modular `source/` set is
  complete and matches the bundle.
