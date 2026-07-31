# Mode D — Review a New Feature, PR, or Work Wave

For a coherent body of newly completed or in-progress work inside an established
codebase: a feature, page, module, component redesign, refactor, migration,
sprint, or pull request.

**Read first:** `evidence-protocol.md`.
**Read alongside:** criteria files relevant to what changed.

This is not a full-project audit. Review the new work, what it touches, and where
it is likely to have broken something.

## 1. Establish intent and baseline

Before judging the implementation, find out what it was meant to do. Check the
ticket, brief, acceptance criteria, design files, commit messages, PR
description, and existing conventions.

State: intended outcome, users affected, required behaviours, constraints to
preserve, what is out of scope, and the baseline used for comparison (branch,
tag, or commit).

Evaluate against stated intent and established project patterns — not against
personal preference. "I would have done it differently" is not a finding.

## 2. Define the audit boundary

Three tiers, stated explicitly in the report:

**Primary — the new work.** Files, components, routes, styles, tests, APIs,
schemas, and assets created or changed.

**Secondary — direct integration surfaces.** What calls it, contains it, or
depends on it: parent and child components, shared layouts, routing, shared
state, design tokens, common UI, data models, APIs, auth and permissions,
analytics, feature flags, build config.

**Tertiary — regression comparison points.** A small number of existing screens
checked for consistency and breakage.

Expand beyond this only if a critical issue affects the new work, the new work
exposes a system-wide defect, a shared dependency creates release risk, or the
change genuinely cannot be evaluated in isolation. Otherwise record unrelated
problems as follow-up observations rather than silently widening the review.

## 3. Map the change footprint

```bash
git diff --stat <baseline>...HEAD
git diff <baseline>...HEAD -- '*.css' '*.scss' 'tailwind.config.*' '*tokens*'
git diff <baseline>...HEAD -- package.json
```

Look at: changed files, added and removed dependencies, new routes, changed
component contracts, shared types, state changes, API changes, schema changes,
token and global style changes, test changes, config changes, assets.

Produce a short impact map: what was added, what was modified, what now depends
on it, which user flows changed, and which areas are most likely to regress.

A small diff does not mean small impact. Shared components, global styles,
routing, permissions, schemas, and state have a large effect radius — a two-line
token change can alter every page.

## 4. Review the work

Check across these areas, going deep only where the change actually reaches:

**Functional correctness** — acceptance criteria met; main workflows complete;
validation complete; errors handled; loading, empty, success, and failure states
present; permissions enforced; existing behaviour unchanged unless intended.

**Architectural integration** — fits the project structure; reuses existing
components and utilities; no parallel implementation of something that already
exists; clear boundaries; established data-fetching and state patterns; no
feature-specific logic leaking into global layers; no circular dependencies;
extensible.

Where it departs from existing patterns, ask for a reason and a migration path —
but do not demand conformity when the new approach is demonstrably better.

**Visual and UX quality** — see `criteria-visual.md` and `criteria-ux-ia.md`.

**Responsive, accessibility, performance, code** — see the matching criteria
files.

**Data, error, and security behaviour** — input validation, output encoding,
permission checks, sensitive data exposure, failure recovery, retries,
idempotency, race conditions, stale state, optimistic rollback, destructive-action
confirmation, API compatibility, migration and rollback safety.

## 5. Visual coherence check

The characteristic failure of new work is not that it looks bad in isolation —
it usually looks fine, sometimes better than its surroundings. The failure is
that it introduces a **second visual language**.

Render the new work inside the real product shell, next to established screens,
and look specifically for:

- a competing visual language
- spacing values off the scale
- new components duplicating existing ones
- typography drift
- inconsistent iconography
- new colours without semantic purpose
- changed global styles affecting unrelated pages
- emphasis heavier than the surrounding product
- motion that feels different from everything else

Compare baseline and changed screenshots where possible.

## 6. Regression review

Three levels:

- **Direct** — inside the changed files
- **Adjacent** — routes, components, workflows, and data flows connected to it
- **System-level** — caused by shared styles, shared components, global state,
  dependencies, config, schema, or build changes

Before calling it ready, check where relevant: build, lint, type check, unit
tests, integration tests, e2e tests, visual regression, accessibility checks,
responsive checks, browser compatibility, data migration, rollback path, feature
flag behaviour, monitoring and analytics.

Passing automated tests is not evidence that the experience is right.

## 7. Improvement plan (when requested or justified)

Read the relevant technique toolkit. Keep improvements compatible with the wider
project's architecture, visual language, performance expectations, accessibility
standard, and release process — the new work is part of a product, not a showcase.

Prefer phasing: technical spike → integrated prototype → production
implementation → regression and release validation → follow-up refinement.

## Deliverable

See `output-formats.md` §D, ending in an explicit release decision.
