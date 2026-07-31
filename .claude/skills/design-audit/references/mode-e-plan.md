# Mode E — Plan Unbuilt Work

For a feature, module, page, workflow, redesign, or work wave that does not yet
exist inside an established product.

**Read alongside:** `criteria-ux-ia.md`, `criteria-visual.md`,
`criteria-responsive.md`, `criteria-accessibility.md`, plus the technique toolkit
matching the surface.

An unbuilt feature is not a blank canvas. Plan it as part of the existing system.

## 1. Inspect the product first

Before proposing screens, understand what the work must fit into: product purpose
and users, existing navigation and IA, related workflows, routes and layouts,
design tokens and component library, typography and motion language, shared UI
patterns, state and data-fetching conventions, APIs, schemas, permissions,
responsive patterns, accessibility conventions, performance constraints, known
technical debt, and any existing roadmap or notes.

Identify: what the work connects to, what to reuse, what to extend, what may need
redesigning first, what would cause architectural or visual drift, and what
missing decisions could block it.

## 2. Define the capability before designing screens

State, in this order — problem before solution:

1. Purpose — why it should exist
2. Primary users
3. User problem — what is currently difficult, missing, slow, or unclear
4. Desired outcome
5. Primary tasks
6. Secondary tasks
7. Entry points
8. Exit points
9. Permissions and roles
10. Data requirements
11. Constraints
12. Out of scope
13. Success criteria — observable evidence it worked

When the request arrives as an attractive solution with an unclear underlying
problem, name the problem first. Planning built around an untested visual idea
produces something that demos well and gets abandoned.

## 3. UX and IA plan

For each major workflow: user goal, entry point, information required, main
actions, decision points, system feedback, completion state, recovery path, and
relationship to existing workflows.

Then decide **placement** — existing page, new page, tab, panel, drawer, modal,
embedded workspace, global tool, contextual action, or background process. Base
it on task frequency, importance, complexity, and the user's context at the
moment they need it. Do not add a new page because a new page is easy to build.

Propose structure for: navigation, page hierarchy, sections, tabs or views,
filters and search, primary and secondary actions, progressive disclosure,
cross-links, and mobile task completion.

Aim for few clicks without producing one screen that shows everything at once.

## 4. Visual and interaction directions

Where useful, give two or three genuinely different directions:

- **Integrated refinement** — extends the existing language, minimal disruption
- **Distinctive evolution** — stronger identity, still system-compatible
- **Experimental** — high ambition, proven through a controlled prototype

Three variations on the same idea are one direction, not three.

For each, cover only the fields that apply: concept · hierarchy · layout ·
typography · colour · components reused, extended, or new · interaction model ·
motion language · advanced techniques and why each fits · imagery and
iconography · responsive adaptation (how it *changes*, not how it shrinks) ·
accessibility · performance and fallback · fit with the larger product.

Then recommend one and explain why it beats the alternatives. A comparison
without a recommendation pushes the decision back to the user unhelped.

## 5. Design every state

Do not plan only the populated happy path. Work through the state matrix in
`evidence-protocol.md` §8, and for each state that matters, specify: what the
user sees, what the system explains, what action is available, what is preserved,
and how the user recovers or continues.

Use realistic content in mockups. Placeholder data hides the overflow, wrapping,
and density problems that will define the real build.

## 6. Technical and design-system blueprint

Document what applies: routes and navigation changes, page and layout structure,
component tree, existing components to reuse, existing components to extend, new
shared components required, reusable tokens, genuinely new tokens,
state-management approach, API and data requirements, schema or type changes,
permissions, analytics events, feature flags, assets and content, browser and
device constraints, testing requirements, and migration, rollout, and rollback.

Classify every proposed element as: existing and reusable · existing but needs
extension · new and feature-local · new and shared · experimental and
prototype-only.

Two opposite mistakes to avoid: building a feature-local copy of something that
should be shared, and generalising a one-off component into a shared abstraction
before there is a second use case.

## 7. Phased plan

- **Phase 0 — Questions and decisions.** Resolve open product, data, permission,
  content, and technical decisions.
- **Phase 1 — UX structure.** IA, flows, screen inventory, state requirements.
- **Phase 2 — Visual concepts.** Directions compared using real product content.
- **Phase 3 — Prototype or spike.** Test the riskiest interaction, rendering
  technique, data flow, or architectural assumption.
- **Phase 4 — Integrated prototype.** Inside the real shell, real data, real
  states.
- **Phase 5 — Production build.** Accessibility, responsive, performance,
  permissions, errors, edge cases.
- **Phase 6 — Validation and rollout.** Usability checks, regression, visual and
  accessibility review, profiling, analytics, staged release, rollback.

For each phase state: objective, deliverables, dependencies, risks, review point,
completion criteria.

Do not collapse design and engineering into one undifferentiated
"implementation" phase — that is where scope silently expands and review points
disappear.

## Deliverable

See `output-formats.md` §E. Do not begin implementation unless asked. When asked,
confirm the direction first, then build in small reviewable stages.
