---
name: design-audit
description: Plan, build, improve, audit, and review the visual design, UI, UX, accessibility, responsive behaviour, and front-end quality of a website or web application. Use this skill whenever the user asks to audit a UI, review a design, critique a screen or page, improve how something looks or feels, plan an unbuilt feature or work wave, review a new feature or pull request for visual and UX quality, check accessibility or responsive behaviour, or asks questions like "does this look right", "how can I make this better", "review my new page", or "what should this screen look like". Use it even when the request is phrased casually or as a small styling question, because the skill supplies the evidence protocol and severity discipline that keep the answer grounded rather than speculative.
---

# Design, UX & Front-End Audit

A structured workflow for reviewing and planning interface work. It exists because
unstructured design review produces two predictable failures: **speculation**
(critiquing a rendered UI from source code alone) and **flat lists** (thirty
undifferentiated observations with no priority). Everything below is aimed at
those two problems.

## Step 1 — Load project context

Read `docs/project-context.md` (or `.claude/project-context.md`) if it exists. It
records stack, design tokens, browser targets, accessibility target, and
out-of-scope areas.

If it does not exist, copy `assets/project-context-template.md` into the repo,
fill in what you can infer from the codebase, and flag the gaps. Do not invent
requirements the project has already stated somewhere.

## Step 2 — Select the mode

Confirm the mode in one line before starting. If genuinely ambiguous, ask.

| Mode | Situation | Reference |
|---|---|---|
| **A — Build** | Page or site does not exist yet | `references/mode-a-build.md` |
| **B — Improve** | Existing UI, goal is to change it | `references/mode-b-improve.md` |
| **C — Audit** | Existing UI, goal is to understand it before changing | `references/mode-c-audit.md` |
| **D — Review new work** | A feature, PR, sprint, or refactor just landed | `references/mode-d-new-work.md` |
| **E — Plan unbuilt work** | Feature does not exist; needs a design and delivery plan | `references/mode-e-plan.md` |

Disambiguation: existing product, broad review → **C**. Completed or in-progress
change set → **D**. Nothing built yet, inside an established product → **E**.

Modes A and B change code; C, D, and E do not. A **report-only QA gate** — such
as this repo's `CLAUDE.md` §4b live audit — must therefore run as **C or D,
never A or B**, and never fixes anything in the same pass. Triage the report
afterwards; fixing while auditing destroys the record of what was found.

Read only the one mode file you need. Each mode file names the criteria files it
requires; read those too, and nothing else.

## Step 3 — Gather evidence before judging

Read `references/evidence-protocol.md`. This is the most important reference in
the skill.

The short version: a rendered interface cannot be assessed from source alone.
Before writing a single visual, spacing, hierarchy, or contrast finding, either
render the page (browser MCP, or `scripts/capture-screens.mjs`) or state plainly
that you could not, and downgrade every affected finding to *Unverified*.

Tag every finding with its evidence tier:

- **Observed** — you rendered it, ran the tool, or read the exact line. Cite the
  screenshot, command output, or `file:line`.
- **Inferred** — follows from code you read, but you did not see the result.
- **Unverified** — plausible, needs a check you could not perform. Say what check.

Never present Inferred or Unverified as Observed. A short audit of things you
actually verified is worth more than a long one built on pattern-matching.

## Step 4 — Produce the output

Read `references/output-formats.md` for the per-mode structure.

Write findings to a file, not just to chat: `docs/audits/YYYY-MM-DD-<scope>.md`.
Audits that live only in scrollback cannot be resolved, diffed, or tracked.

## Global rules

These apply in every mode.

### Finding budget

Report a **maximum of 12 findings**, ranked by severity then user impact. If you
found more, report the top 12 and state how many were omitted and roughly what
they were. An uncapped list is a way of avoiding the work of prioritising.

Give every finding a stable ID so later sessions can resolve it:
`VIS-01`, `UX-01`, `RSP-01`, `A11Y-01`, `PERF-01`, `CODE-01`, `DATA-01`.

### Severity

| Level | Meaning |
|---|---|
| **Critical** | Blocks task completion, loses data, or creates a serious accessibility barrier |
| **High** | Major confusion, repeated task failure, or substantial responsive/performance damage |
| **Medium** | Noticeable friction or inconsistency; task still completes |
| **Low** | Polish, consistency, maintainability |
| **Enhancement** | Optional improvement; no existing failure |

Severity describes impact on the user, not how much the code offends you.

If the project defines its own severity scale (e.g. a `CLAUDE.md` QA gate using
critical / major / minor), **report in the project's scale** and note the mapping
once, at the top of the report.

### Scope discipline

Stay inside the stated scope. Without asking first, do not:

- modify design tokens, global styles, or theme files
- add, upgrade, or remove dependencies
- refactor files outside the scope
- rename or move shared components
- change routing, schema, or permissions

Record out-of-scope problems in a "Follow-up observations" section instead of
silently widening the task. Tempting adjacent cleanup is how a focused review
turns into an unreviewable diff.

### Write only what applies

Templates in this skill list the fields a thorough answer *may* need. Omit fields
that do not apply to the case at hand. Never write "N/A", "None identified", or a
restated heading as filler — padded sections make the real findings harder to
find.

### Claims discipline

Do not state that the work is accessible, responsive, performant, tested, or
production-ready unless you ran checks that support it. Name the checks you ran
and the checks you skipped. "Keyboard navigation verified on the settings form;
screen-reader behaviour not tested" is useful. "Fully accessible" is not.

Also distinguish, in improvement proposals:

- **Correction** — fixes an observed failure
- **Enhancement** — strengthens the product beyond correction
- **Experiment** — worth prototyping, not yet justified for production

### Technique selection

Two toolkits, deliberately separate:

- `references/techniques-product.md` — application surfaces: dense data, forms,
  editors, dashboards, tables, drag-and-drop. Motion serves causality and state.
- `references/techniques-marketing.md` — landing pages, campaigns, portfolios.
  This is where WebGL, shaders, and scroll choreography legitimately live.

Read the one matching the surface. Applying marketing techniques to a working
tool is the most common way an ambitious redesign makes a product worse, and
applying product restraint to a landing page is how it becomes forgettable.

If an advanced technique would not solve the actual problem, say so and propose
the structural, content, or interaction fix instead. Most interface problems are
hierarchy, spacing, and wording problems.

### Preserve what works

Every audit output includes a "What is working well" section, and it must be
specific — name the component, page, or pattern and say why it works. A review
that only lists problems gives no guidance on what to protect during the fix, and
is the reason redesigns often regress things nobody complained about.

## Files in this skill

```
SKILL.md                              this file
references/
  evidence-protocol.md                how to obtain and tier evidence  ← read early
  mode-a-build.md                     new build
  mode-b-improve.md                   improve existing
  mode-c-audit.md                     full audit
  mode-d-new-work.md                  review a change set
  mode-e-plan.md                      plan unbuilt work
  criteria-visual.md                  hierarchy, type, colour, layout, motion
  criteria-ux-ia.md                   navigation, flows, states, content
  criteria-responsive.md              breakpoints, touch, reflow
  criteria-accessibility.md           semantics, keyboard, contrast, AT
  criteria-performance.md             bundle, render, animation cost
  criteria-code.md                    architecture, tokens, maintainability
  techniques-product.md               app-surface toolkit
  techniques-marketing.md             marketing-surface toolkit
  output-formats.md                   per-mode report structures
scripts/
  capture-screens.mjs                 Playwright screenshots + axe-core
assets/
  project-context-template.md         per-project context file
```
