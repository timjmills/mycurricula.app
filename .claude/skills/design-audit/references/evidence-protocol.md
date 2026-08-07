# Evidence Protocol

Read this before any audit or review mode. It converts "review the UI" from a
guessing exercise into an inspection.

## Contents

- **1.** Why this exists
- **2.** Evidence tiers
- **2A.** Measurement traps that manufacture findings ← *read before instrumenting*
- **3.** Getting visual evidence
- **4.** Getting accessibility evidence
- **5.** Getting performance evidence
- **6.** Getting correctness evidence
- **7.** Standard viewport set
- **8.** State matrix
- **9.** When you cannot render

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

## 2A. Measurement traps that manufacture findings

Every trap below has produced a confident, well-formatted finding that was not
true. They share a failure direction: each one fails **open** — the instrument
reports success it did not earn, so nothing looks wrong. Budget scepticism for
the instrument, not only for the code.

(Lettered rather than numbered so the §7 viewport-set and §8 state-matrix
cross-references elsewhere in the skill keep pointing at the right sections.)

### Hydration — gate on a client-only signal, never a fixed wait

**Why:** server-rendered HTML is the **desktop** branch at every width, because
viewport hooks default to `false` on the server. A sample taken at 375px before
hydration therefore reads a desktop canvas and manufactures a false critical.

Never `waitForTimeout(n)` and call the page settled. Gate every responsive or
behavioural read on a signal only the client can produce:

- an element that a client-side media query **removes or adds** — poll for it; or
- the operation itself, retried until it takes effect (act → assert → retry).

Record the observed convergence time in the report. Dev servers under load
hydrate in **5–30 s**, so a fixed wait that worked yesterday is a coin flip today.

### Measure the real scroll container

**Why:** many app shells scroll an inner element rather than the document — this
repo scrolls `#main-content` and the document **never** scrolls — so a
`document.scrollingElement.scrollWidth` check passes green while controls are
visibly clipped.

1. Identify the actual scroll container first: the ancestor whose `scrollHeight >
   clientHeight` (or `scrollWidth > clientWidth`).
2. Measure overflow against **its** padding box, not the viewport's.
3. **Name the container in the report.** "No horizontal scroll" says nothing
   unless it says what was measured.
4. Before calling a control clipped, resolve it against its nearest scrollable
   ancestor. Internal element scroll may be explicitly permitted by the project's
   responsive contract, in which case it is not a finding at all.

### The precondition block

**Why:** a browser renders the working tree, not a commit, so a live result
carries no information about what shipped unless the report says which tree it
measured.

Open every live report with:

```bash
git rev-parse --short HEAD               # the sha you are making claims about
git diff HEAD --stat -- <source dirs>    # must be empty, or say plainly that it isn't
```

followed by one of these two sentences:

> The browser was showing exactly `<sha>`.

> Working tree, **dirty** — this is not evidence about any commit.

A pass over a dirty tree is still useful; it simply cannot be reported as
evidence about a commit. Never stop, revert, or overwrite another lane's work on
the strength of a live report alone — confirm against `HEAD` first.

### Contrast

**Why:** each of these four independently turns a real failure into a pass.

- **Composite translucent surfaces over what is actually beneath them.** An
  element's own `background-color` is not what the eye sees; frosted glass,
  overlays, and ambient washes stack. Resolve the composite before the maths.
- **When a probe verdict and the rendered pixels disagree, the pixels win.**
  Screenshot it and judge the image. A number contradicting what you can plainly
  see is a broken instrument, not a finding.
- **Sample after the palette settles.** Apps that apply stored preferences flip
  tokens *after* first paint. Sample twice, ≥1 s apart, and require the two
  readings to agree before grading.
- **Parse colour spaces correctly.** `color(srgb 0.1 0.2 0.3)` carries 0–1
  floats; `rgb(26 51 77)` carries 0–255. Scraping both with one parser conflates
  them and inflates every ratio it touches.

### Appearance seeding can silently lose

**Why:** synced server-side preferences can override a locally seeded cookie or
localStorage value — this repo's `teacher_preferences` does — so a run labelled
"dark mode" may have measured light.

Read the axis back off the root element after load and confirm it applied
**before** grading anything under it. If it did not apply, record the condition
as **ABSENT / unmeasured**. Grading the wrong condition is worse than skipping
it, because it still looks like coverage.

### Absence assertions need a positive control

**Why:** "the bug never appeared" and "the page never loaded" produce identical
observations.

Before any *not-present* or *not-changed* assertion, prove the page is alive with
a control that MUST be present, read in the **same** observation. Without it the
assertion fails open — a blank page passes every absence test ever written.

### Probe exit-code contract

**Why:** an instrument that exits 0 having measured nothing reports the app
healthy on the strength of being blind.

| Code | Meaning |
|---|---|
| **0** | fully verified — the intended coverage ran, and passed |
| **1** | real failures — the app is broken |
| **2** | incomplete coverage — the *instrument* is blind |

`0 / 0 assertions` exits **2**, never 0. Declare intended coverage up front and
reconcile against it at the end. And never let a fallback value be one that
satisfies the assertion: a default that passes is a check that cannot fail.

### An emulated phone is not a narrow window

**Why:** coarse-pointer, hover-capability, and phone-only layout rules do not
fire in a merely-narrow desktop window, so real phone bugs stay invisible.

A phone check needs `isMobile: true`, touch, and a real `deviceScaleFactor`
(2–3). Anything narrow-but-not-emulated must be **labelled as such** in the
report — "375 px desktop window, not phone-emulated" — so a later reader does
not mistake it for phone coverage.

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
