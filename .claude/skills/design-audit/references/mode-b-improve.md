# Mode B — Improve an Existing Interface

**Read alongside:** the criteria files relevant to the stated goal, plus
`evidence-protocol.md`.

Mode B assumes the problem is already known or stated. If it is not, run Mode C
first — redesigning before understanding is how products lose things that were
working.

## 1. Inspect before editing

Understand what exists: project structure, framework, routing, component
architecture, design tokens, global styles, layout system, dependencies,
reusable components, state management, data flow, accessibility patterns,
animation approach, responsive strategy, tests.

Then classify each relevant part as: preserve, refine, replace, or remove.

Do not dismantle working structure to impose a preferred architecture. The
existing code usually encodes constraints and bug fixes that are invisible until
they are gone.

## 2. Understand the current experience

- What the interface is trying to do
- Who uses it and how often
- Which workflows matter most
- Which screens carry the most weight
- **What already works well** — name it specifically, because this is what the
  change must not break

## 3. Identify and categorise problems

Sort into: critical usability, hierarchy, responsive, accessibility,
performance, interaction, code quality, consistency, content structure.

Then rank: Critical / High / Medium / Low / Enhancement. Problems that obstruct
tasks come before problems that offend the eye.

## 4. Define the revised direction

State plainly:

- What changes
- What stays, and why
- Why the change is needed — tied to an observed problem
- What the user gains
- What technical risk is introduced
- What could regress

## 5. Implement incrementally

Prefer targeted, reviewable changes over a rewrite. Sequence so that each step
leaves the product in a working state, and so that the highest-value change lands
first — momentum is worth more than completeness on a redesign.

## Redesign rules

- Preserve familiar workflows that work; unfamiliarity has a real cost for
  returning users
- Remove clicks, duplicate controls, and scattered information
- Clarify primary vs. secondary actions
- Reduce visual noise before adding visual interest
- Reach for spacing and typography before adding another container
- Resist turning every section into a card
- Keep controls next to what they affect
- Make state visible
- Avoid interactions that cannot be discovered
- Redesign mobile deliberately rather than letting it fall out of the desktop
  layout

The redesign should solve identified problems. A new aesthetic applied to
unchanged problems is a cosmetic change presented as an improvement.

## 6. Validate

Confirm the result: preserves required functionality, improves the hierarchy it
set out to improve, works across the standard viewport set, supports keyboard
use, respects reduced motion, introduces no obvious performance regression, and
creates no inconsistency elsewhere in the product.

Compare against the original problem statement, not against how much better it
looks.

## Deliverable

See `output-formats.md` §B.
