# Criteria — Visual Design

Use with rendered evidence. Assessing these from source produces guesses.

## Hierarchy

The interface should answer, without the user thinking about it: where am I, what
is this for, what matters most, what is interactive, what do I do next.

Look for:

- competing focal points — two or more elements fighting to be primary
- uniform visual weight across items of genuinely different importance
- emphasis applied to what is easy to emphasise rather than what is important
- large regions with no clear job
- weak differentiation between adjacent sections
- primary action that is not visually primary

The most common real failure is not ugliness. It is flatness: everything styled
equally, so the user has to read the whole screen to find one thing.

## Typography

Review size scale, weight, line height, line length, letter spacing, density, and
consistency across pages.

Specific checks:

- Body text below ~14px in a reading context, or line length beyond ~75
  characters
- More than three or four weights or sizes in a single view without reason
- Headings distinguished only by weight, so hierarchy collapses at a glance
- Type used decoratively where it competes with content
- Numeric data not using tabular figures, so columns fail to align

## Colour

- Contrast against the actual background it lands on, not the intended one
- State colours used consistently — success, warning, error, info, selected
- Accent colour applied often enough to lose its meaning
- Semantic meaning carried by colour alone (see accessibility criteria)
- Background layering that establishes depth vs. background layering that
  produces mud
- Dark mode as a genuine treatment vs. an inverted light mode with broken
  shadows and washed-out imagery

## Layout and spacing

- Grid and alignment consistency; elements that are almost-but-not aligned read
  as sloppier than deliberate offsets
- Spacing values drawn from the scale vs. arbitrary one-off values
- Spacing that groups related things and separates unrelated things — proximity
  is the cheapest hierarchy tool available
- Container widths and edge spacing consistent between pages
- Density appropriate to the task: a data tool being airy is as wrong as a
  marketing page being cramped

Watch for **containers compensating for weak layout**: borders and cards added
because spacing and alignment were not doing their job. Removing the card and
fixing the spacing usually produces a better result.

## Components

Compare every repeated component across every place it appears: buttons, inputs,
selects, tabs, cards, modals, menus, tables, toolbars, navigation, alerts, chips,
empty states, loading states.

Two failures to hunt for specifically:

- components that **look alike but behave differently** — teaches users the wrong
  model
- components that **behave alike but look unrelated** — makes them relearn the
  same thing

Also check: does a new variant exist because the design genuinely needed it, or
because someone did not find the existing one?

## Imagery and iconography

- Image quality, cropping, and aspect-ratio consistency
- Whether images carry information or fill space
- Icon style consistency — mixed stroke weights and mixed metaphor families are
  immediately visible once you look for them
- Icon-only controls without labels or accessible names, especially for
  destructive actions
- Decorative elements adding visual noise to a dense screen

## Motion and interaction

- Does each animation communicate something — causality, origin, state change,
  progress — or is it decoration?
- Timing: fast enough not to delay the task. Interface feedback generally wants
  ~120–250ms; anything over ~400ms on a frequent action becomes an obstacle.
- Easing consistency: a single motion language, not per-component improvisation
- Feedback within ~100ms of every user action, even if only a pressed state
- Hover-dependent affordances that do not exist on touch
- `prefers-reduced-motion` respected — and respected properly, meaning reduced or
  replaced, not merely instant-snapped if that causes disorientation
- Motion that hides a state change rather than explaining it

## Common defaults worth questioning

Not forbidden — but if any of these appears, it should be a decision, not a
default: heavy glassmorphism, large gradient blobs, neon glow, everything-is-a-card
layouts, floating elements without purpose, uniformly large corner radii, drop
shadows substituting for hierarchy, and full-width hero sections on a working
tool.
