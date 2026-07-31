# Evidence Protocol

Read this before any audit or review mode. It converts "review the UI" from a
guessing exercise into an inspection.

## Contents

1. Why this exists
2. Evidence tiers
3. Getting visual evidence
4. Getting accessibility evidence
5. Getting performance evidence
6. Getting correctness evidence
7. Standard viewport set
8. State matrix
9. When you cannot render

---

## 1. Why this exists

Reading JSX and Tailwind classes tells you what was *intended*. It does not tell
you what a user sees. Spacing collapses, text overflows, contrast fails against
an unexpected background, a flex child refuses to shrink, a modal traps scroll on
iOS. None of these are visible in source.

An agent asked to "audit the UI" with only source access will produce
confident-sounding findings generated from priors about what usually goes wrong.
Some will be right by coincidence. The user cannot tell which. That is worse than
no audit, because it consumes trust.

So: render it, or label it Unverified.

## 2. Evidence tiers

Tag every finding.

**Observed** — you rendered the page, ran the tool, or read the exact source
line. Cite it: screenshot filename, command output, or `path/to/file.tsx:142`.

**Inferred** — a reasonable conclusion from code you read, without seeing the
result. Example: "`overflow-hidden` on a container with dynamic text will clip
long titles" — likely, but unconfirmed until you render a long title.

**Unverified** — plausible, needs a check you could not perform. State the check
explicitly so someone else can run it.

Report the mix at the top of every audit, e.g. "9 findings: 6 observed, 2
inferred, 1 unverified." This tells the reader how much weight the audit carries.

## 3. Getting visual evidence

In order of preference.

### Browser MCP (Playwright, Puppeteer, or Chrome extension)

Preferred, because you can interact — hover, focus, open menus, fill forms, drag.

1. Start the dev server if it is not running. Confirm the port.
2. Navigate to each in-scope route.
3. Capture at each viewport in the standard set (§7).
4. Drive the state matrix (§8) — do not only screenshot the happy path.
5. Capture focus states by pressing `Tab` repeatedly and screenshotting.

### `scripts/capture-screens.mjs`

Batch capture when the MCP is unavailable or you want a repeatable artifact set.

```bash
node scripts/capture-screens.mjs \
  --base http://localhost:3000 \
  --routes / /dashboard /settings \
  --out .audit/screens \
  --axe
```

Writes `<route>__<width>.png` plus `axe-<route>.json`. Requires
`npm i -D playwright @axe-core/playwright` and `npx playwright install chromium`.

### User-supplied screenshots

Fine, but ask what viewport and state they represent. A screenshot without a
width is hard to reason about.

### Existing visual-regression baselines

If the project has Percy, Chromatic, or Playwright snapshots, those directories
are free evidence. Look before generating new captures.

## 4. Getting accessibility evidence

Automated tools catch roughly a third of real issues. Run them, then do the
manual checks — the manual ones find the problems users actually hit.

```bash
npx @axe-core/cli http://localhost:3000/route --exit
npx lighthouse http://localhost:3000/route --only-categories=accessibility --quiet
npx pa11y http://localhost:3000/route
```

Manual checks that no tool performs:

- **Keyboard-only pass.** Tab through the whole flow. Can you reach every
  control, see where you are, escape every modal, and complete the primary task
  without a mouse?
- **Focus order.** Does it follow visual order, or jump?
- **Focus visibility.** Is the ring visible against every background it lands on?
- **Reduced motion.** Set the OS or emulate `prefers-reduced-motion: reduce`.
  Does anything still animate that shouldn't?
- **Zoom to 200%** and text-size to 200%. Does content reflow or clip?
- **Meaning without colour.** Screenshot in greyscale. Is state still legible?

Record automated and manual findings separately. Conflating them overstates
coverage.

## 5. Getting performance evidence

```bash
npx lighthouse http://localhost:3000/route --only-categories=performance --quiet
npm run build          # read the bundle output
npx source-map-explorer 'dist/**/*.js'   # or @next/bundle-analyzer
```

For animation and render cost, use the browser's Performance panel via MCP if
available. Otherwise mark cost estimates as Inferred — "this looks expensive" is
not a measurement.

Distinguish **measured regressions** from **code-level risks requiring
profiling**. Both are worth reporting; conflating them is not.

## 6. Getting correctness evidence

Cheap, deterministic, and frequently skipped:

```bash
npm run build
npm run lint
npx tsc --noEmit
npm test
```

Run these before reporting. A type error or failed build outranks every spacing
observation, and finding one changes what the review should be about.

## 7. Standard viewport set

Test at least the starred widths. Add project-specific targets from
`project-context.md`.

| Name | Width × Height | |
|---|---|---|
| Small mobile | 360 × 740 | ★ |
| Large mobile | 414 × 896 | |
| Tablet portrait | 768 × 1024 | ★ |
| Tablet landscape | 1024 × 768 | |
| Laptop | 1280 × 800 | ★ |
| Desktop | 1440 × 900 | |
| Large desktop | 1920 × 1080 | ★ |

Also check, where the product warrants it:

- **Print / PDF** — if the product exports or prints, render that path. Print
  stylesheets rot silently because nobody looks at them.
- **RTL** — if the product serves Arabic, Hebrew, Farsi, or Urdu markets, set
  `dir="rtl"`. Logical-property mistakes (`ml-*` instead of `ms-*`), mirrored
  icons, and direction-dependent drag interactions only appear here.
- **Dark mode** — if supported, every capture doubles.

## 8. State matrix

The populated happy path is the state least likely to be broken, because it is
the one the developer looked at. Drive these instead:

| Category | States |
|---|---|
| Data | empty, one item, typical, very many items, very long strings, missing optional fields |
| Loading | initial, partial, refetching, slow network, failed |
| Interaction | default, hover, focus, focus-visible, active, selected, disabled, read-only |
| Outcome | success, validation error, server error, offline, conflict / stale data |
| Permission | full access, restricted, no access |
| Content | shortest realistic, longest realistic, non-Latin script, no content |

For each state that matters, note what the user sees, what the system explains,
what action is available, what is preserved, and how they recover.

Prefer real data over placeholder data. "Lorem ipsum" is uniformly sized and
hides exactly the overflow problems you are looking for.

## 9. When you cannot render

Say so explicitly, at the top of the report:

> Visual evidence unavailable — no dev server or browser access. Visual,
> spacing, hierarchy, and contrast findings below are Inferred from source and
> require confirmation.

Then narrow the audit to what source genuinely supports: component architecture,
token usage, semantic HTML, ARIA correctness, obvious contrast pairs computable
from token values, dependency weight, missing state branches, missing error
handling.

Do not produce a visual audit and quietly omit the fact that nothing was seen.
