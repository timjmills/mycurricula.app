# design-audit

A Claude Code skill for planning, building, improving, auditing, and reviewing
web UI. Restructured from `advanced-web-design-planning-and-audit-prompt-v3.md`.

## Install

**Per project** — commit it, so it travels with the repo:

```bash
mkdir -p .claude/skills
cp -r design-audit .claude/skills/
```

**Globally** — available in every project:

```bash
mkdir -p ~/.claude/skills
cp -r design-audit ~/.claude/skills/
```

Then, in the target project:

```bash
cp .claude/skills/design-audit/assets/project-context-template.md docs/project-context.md
# fill it in once
```

Optional, for the capture script:

```bash
npm i -D playwright @axe-core/playwright
npx playwright install chromium
```

## Using it

The skill triggers on design/UI/UX/audit phrasing. To force it:

```
Use the design-audit skill. Mode D — review the unit editor branch
against main, focus on visual coherence and keyboard access.
```

Stating the mode saves a round trip. If you don't, it will pick one and tell you.

## What changed from v3

**Structure.** One 1,882-line prompt became a 176-line router plus reference
files loaded on demand. A typical session now loads ~450–600 lines — the router,
one mode, and two or three criteria files — instead of everything at once,
including the four modes that don't apply.

**Deduplication.** Accessibility, responsive, and performance criteria appeared
three times each; the advanced-techniques argument appeared four times. Each now
has one canonical file that the modes point at, so edits land in one place.

**Evidence protocol (new).** v3 said "do not assess visual quality from code
alone" but never said how to see the page. `references/evidence-protocol.md` adds
concrete acquisition — browser MCP, the capture script, axe, Lighthouse, build
and type checks — plus a three-tier evidence labelling scheme (Observed /
Inferred / Unverified) and a required evidence line at the top of every report.
This is the change that most affects output quality.

**Technique split.** v3's Section 5 list came from a portfolio-demo prompt and
was invoked four times as an active toolkit. It is now split into
`techniques-product.md` (density, state, feedback, functional motion, View
Transitions, drag physics, print/PDF, container queries) and
`techniques-marketing.md` (where WebGL, shaders, and scroll choreography belong).
The mode files point at whichever matches the surface.

**Finding budget.** Maximum 12 findings, ranked, with stable IDs (`VIS-01`,
`A11Y-03`). Uncapped lists avoid the work of prioritising.

**Persistent artifact.** Reports are written to `docs/audits/YYYY-MM-DD-<scope>.md`
rather than evaporating into chat scrollback, so findings can be resolved and
audits diffed over time.

**Scope discipline.** An explicit no-touch list — tokens, global styles,
dependencies, routing, schema, permissions — plus a "Follow-up observations"
section so out-of-scope problems get recorded instead of silently widening the
diff.

**Anti-padding rule.** Template fields that don't apply are omitted rather than
filled with "N/A". v3's 13-field proposal templates reliably produced filler.

**New criteria coverage:** RTL and logical properties, print and PDF output,
WCAG 2.2 dragging-movements and target-size, `100dvh` and mobile browser chrome,
container queries, tabular figures, drag-and-drop keyboard equivalents, unsaved
state protection, and design-token drift as a first-class code concern.

**Capture script (new).** `scripts/capture-screens.mjs` batches screenshots
across the standard viewport set with optional dark, RTL, and reduced-motion
variants, and runs axe-core per route.

## Files

```
SKILL.md                            router, global rules, budgets
references/evidence-protocol.md     ← the important one
references/mode-{a,b,c,d,e}-*.md    one per mode
references/criteria-*.md            six criteria files, one copy each
references/techniques-*.md          product vs marketing toolkits
references/output-formats.md        report structures
scripts/capture-screens.mjs         Playwright + axe capture
assets/project-context-template.md  per-project context
```
