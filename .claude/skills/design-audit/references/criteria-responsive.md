# Criteria — Responsive Behaviour

Use the viewport set in `evidence-protocol.md` §7. Findings here require rendered
evidence; responsive failures are almost never visible in source.

## What to look for at each width

- Broken or overlapping layout
- Horizontal scrolling that was not intended
- Text truncation that loses meaning (an ellipsis on a title is not neutral)
- Navigation that becomes unusable or unreachable
- Touch targets below ~44×44 CSS px, or spaced too close to hit reliably
- Fixed heights that clip content when text wraps to more lines
- Important content hidden entirely at small widths rather than reorganised
- Tables that neither scroll, stack, nor prioritise columns
- Modals, drawers, and popovers that overflow the viewport or trap scroll
- Layout shift as content, images, or fonts load

## Reconsider per breakpoint, not just resize

At each breakpoint, the following should be a decision rather than a consequence:

- information priority — what moves up, what moves down, what is deferred
- navigation pattern
- column count and reading order
- type scale and line length
- spacing scale (dense screens usually need *less* padding on mobile, not more)
- placement of primary actions — reachable by thumb on phones
- visibility of secondary information
- behaviour of complex graphics, canvases, and charts

Shrinking a desktop layout is not responsive design. The test is whether each
width has its own information priority, not whether nothing visibly breaks.

## Interaction assumptions that fail on touch

- hover-only affordances (tooltips, reveal-on-hover controls, hover menus)
- right-click context menus with no alternative
- drag interactions with no keyboard or tap-based equivalent
- precise targets — resize handles, small close buttons, thin scrub bars
- `:active` styles missing, so taps give no feedback on the ~300ms before
  navigation

## Also check

- **Orientation change** — portrait to landscape mid-task should not lose state
- **Browser chrome** — mobile URL bars change viewport height; `100vh` layouts
  clip. Prefer `100dvh`.
- **Safe areas** — notches and home indicators on iOS
- **Text-size override** — users who set larger system text
- **Zoom to 200%** — this is a responsive concern as much as an accessibility one
- **Keyboard-open state** on mobile — fixed footers and sticky action bars
  frequently collide with the on-screen keyboard

## Recording responsive findings

For each, record: viewport range affected, page or component, what breaks,
severity, likely cause, recommended fix. A responsive finding without a width is
not actionable.
