# Technique Toolkit — Product Surfaces

For application interfaces: dashboards, editors, tables, forms, schedulers,
settings, dense data views. Places where people work repeatedly.

The measure of quality on these surfaces is **how fast and confidently a
returning user completes a task**, not how impressive the first three seconds
are. Techniques below are chosen accordingly.

Treat this as a starting point, not a boundary. Research better-fitting
approaches when they exist, and prefer ones compatible with the existing stack.

## Structure and density

- **Information density done well** — more useful data per screen without
  crowding, achieved through alignment, type scale, and restrained rules rather
  than shrinking everything
- **Tabular figures and aligned decimals** so numeric columns scan vertically
- **Sticky headers, frozen columns, and column prioritisation** for wide tables
- **Virtualised lists** for long collections, with correct keyboard and
  screen-reader behaviour preserved
- **Progressive disclosure** — advanced controls tucked away, essential controls
  never
- **Inline editing** where it removes a modal round-trip; modals where focus and
  commitment genuinely help
- **Split views and master-detail** where users compare or move between items
  rapidly

## Feedback and state

- **Optimistic updates** with visible rollback on failure
- **Skeletons matched to the real layout**, so content arrival causes no shift —
  a spinner in the wrong shape is worse than no spinner
- **Autosave with a truthful status indicator** (saving / saved / failed / offline)
- **Undo instead of confirmation** for reversible actions; confirmation reserved
  for genuinely destructive ones
- **Inline validation** phrased as the fix
- **Empty states that teach** — what belongs here, why it matters, one clear
  action
- **Persistent unsaved-changes protection** across navigation and refresh

## Motion

Motion on a product surface should explain causality, continuity, or state — and
then get out of the way. Budget: ~120–250ms for feedback, ~200–350ms for
transitions between views.

- **View Transitions API** for route and view changes, so context is preserved
  rather than re-established
- **Shared-element transitions** when an item expands into a detail view
- **Spring physics for drag-and-drop** — grabbed, moving, valid target, invalid
  target, dropped, settled. Physics here is functional: it communicates weight
  and commitment.
- **FLIP animation** for reordering and filtering, so items appear to move rather
  than teleport
- **Layout-preserving collapse** patterns during drag, to maximise visible drop
  targets
- **Micro-feedback** — pressed states, focus rings, subtle scale on commit
- **Staggered entry** used once and briefly, never on every data refresh

Everything above needs a `prefers-reduced-motion` path, and drag needs a keyboard
alternative.

## Typography and rendering

- **Variable fonts** for a tighter weight scale without extra network cost
- **Optical size axes** where the product mixes very small labels with large
  headings
- **`text-wrap: balance` / `pretty`** for headings and short copy
- **Container queries** so components adapt to their slot rather than the
  viewport — usually more correct than breakpoints in a componentised app
- **CSS subgrid** for aligning content across cards and rows
- **`:has()`** for state-dependent styling without extra classes or JS
- **Scroll-driven animations** in CSS for scroll indicators and sticky effects,
  off the main thread
- **Anchor positioning / popover API** for menus and tooltips without a
  positioning library

## Data visualisation

- Chart type chosen for the question being asked, not for visual variety
- Direct labelling in preference to a legend the eye must round-trip to
- Colour scales that survive greyscale and common colour-vision deficiencies
- Accessible table equivalent for every chart
- Interaction — hover, brush, zoom — with keyboard equivalents
- Canvas or WebGL only past the point where SVG genuinely stalls (usually a few
  thousand elements), and only with a stated fallback

## Output surfaces

Easy to forget and frequently broken:

- **Print and PDF export** — dedicated stylesheet or renderer, page-break
  control, and a real check that the output is legible
- **Email templates**, if the product sends them
- **Shareable and embedded views**, which often skip the app shell entirely

## What to be sceptical of here

Custom cursors, scroll hijacking, kinetic typography, particle backgrounds,
raymarched or shader-driven decoration, sound, entrance animations on data
refresh, and full-viewport hero sections. These are not banned — but on a surface
someone uses forty times a day, each one costs attention and time on every visit.
Require a specific functional argument, not "it would look impressive."

If a proposal on a product surface cannot state which user task it makes faster,
clearer, or less error-prone, it belongs in a prototype, not the roadmap.
