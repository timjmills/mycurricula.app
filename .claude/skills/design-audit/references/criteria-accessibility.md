# Criteria — Accessibility

Target WCAG 2.2 AA unless `project-context.md` states otherwise.

Separate findings into three groups, always:

1. **Confirmed failures** — reproduced by tool or manual test
2. **Likely failures** — need manual verification; say which test
3. **Best-practice improvements** — not conformance failures

Automated tools detect roughly a third of real barriers. Reporting a clean axe
run as "accessible" is a false claim.

## Semantics and structure

- Native elements before ARIA. A `<button>` is better than a `div` with
  `role="button"`, `tabindex`, and two key handlers.
- One `<h1>` per page; heading levels descending without skips
- Landmarks present: `header`, `nav`, `main`, `aside`, `footer`
- Lists marked up as lists; tables with `<th>`, `scope`, and a caption where the
  structure is not obvious
- ARIA used to fill genuine gaps only. Incorrect ARIA is worse than none — it
  overrides correct native semantics.

## Keyboard

- Every interactive element reachable by `Tab`
- Focus order matches visual order
- Visible focus indicator on every focusable element, with sufficient contrast
  against each background it appears over
- Focus trapped inside open modals, and returned to the trigger on close
- `Escape` closes overlays
- No keyboard traps anywhere
- Custom widgets (menus, comboboxes, tabs, trees, grids, drag-and-drop) implement
  the expected key patterns — arrow keys, `Home`/`End`, type-ahead
- Skip link to main content on pages with substantial navigation

Do the keyboard-only pass on the primary task. It finds more real problems than
any automated tool.

## Visual and colour

- Text contrast ≥ 4.5:1; large text (≥18.66px bold or ≥24px) ≥ 3:1
- UI components and focus indicators ≥ 3:1 against adjacent colours
- Meaning never carried by colour alone — pair with icon, text, or pattern
- Content reflows without horizontal scrolling at 320px equivalent (400% zoom)
- Text resizes to 200% without loss of content or function
- No loss of function in forced-colours / high-contrast mode
- Content still usable with custom text spacing applied

## Forms

- Every input has a programmatically associated label
- Error messages associated with their field (`aria-describedby`) and announced
- Required fields indicated by more than colour or an unlabelled asterisk
- Grouped controls wrapped in `fieldset` with `legend`
- Autocomplete attributes present for common personal fields

## Dynamic content

- Live regions for content that changes without user action — but sparingly;
  over-announcing is its own barrier
- Loading states announced, not just spun
- Success and error outcomes reaching screen-reader users, not only shown as a
  toast that disappears
- Route changes announced and focus moved appropriately in single-page apps

## Motion and time

- `prefers-reduced-motion` honoured across all animation, including scroll
  effects, parallax, autoplay, and transitions
- No content flashing more than three times per second
- Auto-advancing carousels, timeouts, and countdowns pausable or extendable

## Media and graphics

- Meaningful images have alt text describing purpose, not appearance
- Decorative images have empty alt (`alt=""`)
- Complex graphics — charts, diagrams, canvas, WebGL — have a text or table
  equivalent conveying the same information
- Icon-only buttons have accessible names
- Video has captions; audio has transcripts

## Touch

- Targets ≥ 24×24 CSS px minimum (WCAG 2.2), ≥ 44×44 recommended
- Adequate spacing between adjacent targets
- No path-based or multipoint gesture without a single-pointer alternative
- Drag operations have a non-drag alternative (WCAG 2.2 *Dragging Movements*) —
  this is a common failure in kanban boards, schedulers, and reorderable lists

## RTL and internationalisation

Where the product serves right-to-left languages:

- Logical CSS properties (`margin-inline-start`, not `margin-left`)
- Directional icons mirrored; non-directional icons not mirrored
- Numbers, dates, and code left-to-right within RTL text
- Drag, swipe, and progress directions reversed appropriately
- Layout tested with `dir="rtl"`, not assumed to work
