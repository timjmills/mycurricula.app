# Mode A — Build a New Website or Page

**Read alongside:** `criteria-visual.md`, `criteria-ux-ia.md`,
`criteria-responsive.md`, `criteria-accessibility.md`, plus the technique toolkit
matching the surface.

## 1. Discovery

Establish before writing code:

1. Purpose of the site or page
2. Primary audience
3. Main user tasks
4. Most important content
5. Desired tone
6. Required pages and views
7. Framework and technical constraints
8. Existing brand assets, colours, type, imagery
9. Accessibility and performance targets
10. References the user already likes, and what they like about them

Take these from `project-context.md`, the repo, and the user's brief before
asking. Do not re-ask what is already stated.

Where information is genuinely missing, make the smallest reasonable assumption,
build, and list the assumptions explicitly in the deliverable. A blocking
question is only worth asking when a wrong guess would waste substantial work.

## 2. Creative direction before implementation

Write a short direction statement — a paragraph, not a document — covering:

- The concept: the one idea the design is built around
- Typography approach
- Colour system, including semantic roles
- Layout and grid system
- Spacing scale
- Image and illustration treatment
- Motion language
- Interaction character
- Light and dark approach, if relevant

Then check it against the audience and the tasks. If the concept cannot be stated
in one sentence, it is not yet a concept, and the result will read as assembled
rather than designed.

## 3. Structure before styling

For each page or view, define: primary purpose, primary action, secondary
actions, content sections, navigation, and required states (see
`criteria-ux-ia.md` for the state list).

The user should always know where they are, what the page is for, what matters
most, and what to do next.

## 4. Build order

1. Semantic HTML structure and content
2. Layout and spacing at one width
3. Type and colour system as tokens, not literals
4. Responsive behaviour across the standard viewport set
5. States — empty, loading, error, disabled, success
6. Interaction and motion
7. Accessibility pass (keyboard, focus, contrast, semantics)
8. Performance pass
9. Advanced technique, last and only where it earns its place

Building in this order means accessibility and responsiveness are structural
rather than retrofitted, which is both cheaper and more effective.

## 5. Dependencies

Before adding one, confirm: the existing stack does not already solve it; it
meaningfully improves the result; it is maintained and compatible; and its weight
is proportionate to the problem. A large library for a small feature is a
recurring cost for a one-time convenience.

## 6. Implementation standards

Modular, readable, consistently named, extensible, free of duplicated logic, and
documented where behaviour is non-obvious. Preserve existing functionality unless
a change is necessary and justified.

## Deliverable

See `output-formats.md` §A.
