# Criteria — Front-End Code Quality

Scope this to code that affects the interface. A general code review is a
different task.

## Design system integrity

This is where UI codebases decay first, and it is worth checking before anything
else:

- Are spacing, colour, radius, shadow, and type values coming from tokens, or are
  arbitrary values appearing inline?
- Are there near-duplicate tokens (`gray-450` alongside `gray-400` and
  `gray-500`) added because someone did not find the existing one?
- Do new components duplicate existing ones with slight differences?
- Are global styles being modified to solve a local problem?
- Is there a second visual language forming in a newer part of the product?

Token and global-style drift is cheap to fix early and expensive later, because
every subsequent screen inherits the ambiguity.

## Component structure

- Clear boundaries and single responsibility; components that both fetch, format,
  and render are hard to reuse and harder to test
- Reasonable size — a 600-line component usually contains three components
- Props that describe intent (`variant="destructive"`) rather than appearance
  (`isRed`)
- Composition preferred over an ever-growing set of boolean flags
- Presentational and container concerns separable where it helps
- No circular dependencies

## State and data

- State held at the lowest level that works
- Server state and client state distinguished, using the project's established
  pattern
- Loading, error, and empty branches actually present — not just the success path
- Optimistic updates with a rollback path
- Race conditions on rapid input or navigation handled
- Derived state computed rather than duplicated and kept in sync manually

## Correctness and safety

- Type coverage on component contracts; `any` at boundaries defeats the point
- User-supplied content escaped; `dangerouslySetInnerHTML` justified and
  sanitised
- No secrets, keys, or privileged data in client bundles
- Permission checks not implemented only in the UI layer
- External links with `rel="noopener noreferrer"` where relevant

## Maintainability

- Naming consistent with the rest of the project
- Repeated logic extracted once it has repeated, not before
- Dead code, commented-out blocks, debug logging, and stale TODOs removed
- Feature flags with a stated removal plan
- Tests where behaviour is non-obvious or regression-prone
- Comments explaining *why*, where the reason is not evident from the code

## Rewrite discipline

Do not recommend a rewrite because the code differs from your preference.

Recommend one only when the current structure causes measurable risk,
duplication, instability, or actively blocks the requested work — and when you
do, propose an incremental migration path rather than a stop-the-world rewrite.
Large rewrites of working UI code lose accumulated bug fixes and edge-case
handling that nobody remembers to re-add.
