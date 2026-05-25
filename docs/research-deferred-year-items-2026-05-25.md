# Research: 5 deferred /year audit items — options + trade-offs

2026-05-25

For each finding: 2–3 concrete implementation options with effort + blast-radius
+ recommended pick. User reads, picks, implementation agents dispatch.

Source-of-truth for findings: `docs/year-audit-2026-05-25.md` (M3 L115-141,
M4 L143-164, m2 L211-223, m3 L225-237, m7 L287-303).

---

## M3 — YearView + YearMobile both mount + SSR every load (CLS + bundle)

### Current state

- `app/(planner)/year/page.tsx:25-61` mounts BOTH `<YearView>` and `<YearMobile>`
  unconditionally inside a `<MinimizedSubjectsProvider>`. Visibility is flipped
  via inline `style={{ display: isPhone ? "none" : "contents" }}` plus an
  `aria-hidden` flip — driven by `useState<boolean>(false)` + a `useEffect` that
  reads `window.matchMedia("(max-width: 480px)")`.
- SSR always emits desktop HTML; phone visitors hydrate, run `useEffect`, then
  layout-shift to mobile (~700ms on cold Chromebook hardware per audit).
- Existing matchMedia precedent in the repo: `components/weekly/WeeklyShell.tsx`
  L432-494 uses the exact same SSR-safe matchMedia pattern (start `false`,
  sync on mount, subscribe to changes, `addEventListener` with `addListener`
  fallback). No shared `useMediaQuery` / `useViewport` / `useResponsive` hook
  exists yet — both call-sites are the same hand-rolled effect.
- Lane D's `aria-hidden` already neutralised the duplicate-h1 / duplicate-landmark
  a11y issue; CLS + bundle weight are what remain.

### Options

**Option 1: CSS-only switch (display:none via @media in module CSS)**

- How:
  - Delete the `useState` + `useEffect` block from `app/(planner)/year/page.tsx`.
  - Render both subtrees inside two static wrappers — e.g.
    `<div className={styles.desktopOnly}>...<YearView />...</div>` /
    `<div className={styles.phoneOnly}>...<YearMobile />...</div>`.
  - Add `.desktopOnly { display: contents } @media (max-width: 480px) {
    .desktopOnly { display: none } }` and the mirror to a small new file (e.g.
    `app/(planner)/year/year-page.module.css`) since the page is a client
    component and there's no existing module for the page-shell wrappers.
  - Hide each subtree's primary landmark from AT via CSS-driven `aria-hidden`
    is NOT possible — `aria-hidden` is an attribute, so we keep the static
    attribute on the always-on wrappers? No — the issue is that `aria-hidden`
    cannot be media-query driven. Workaround: render each subtree with its own
    `role="region"` inside the wrapper, and let the duplicate-landmark a11y
    finding return.
  - Alternative — keep the `useState` + `useEffect` ONLY to drive `aria-hidden`,
    but use CSS for the `display` swap. That keeps a11y clean and still
    eliminates the visible-paint CLS (because CSS applies pre-paint).
- Effort: 30 min (the alternative variant above is ~45 min).
- Pros: zero SSR mismatch; deterministic at every viewport; tiny diff; matches
  the WeeklyShell precedent's "CSS is the truth, JS only mirrors it" instinct.
- Cons: BOTH React trees still ship in the client bundle and still render to
  the DOM (just hidden) — phone visitors still pay the desktop JS download
  cost (~15-25 KB gzipped per audit estimate) AND the desktop DOM-render cost.
  The audit's bundle-bloat half is unsolved.
- Bundle delta: 0.
- CLS: eliminated (CSS applies pre-paint).

**Option 2: Server-detect via headers() + Sec-CH-UA-Mobile + next/dynamic**

- How:
  - Convert `app/(planner)/year/page.tsx` to a server component (drop
    `"use client"`). Read `headers().get("sec-ch-ua-mobile")` — returns `"?1"`
    on mobile clients that send the hint, `"?0"` on desktop, `null` otherwise.
  - In the page render, branch: if `"?1"` → render only `<YearMobile />`;
    otherwise → render only `<YearView />`. Lazy-load each via
    `next/dynamic(() => import("@/components/year/YearMobile"))` and
    `next/dynamic(() => import("@/components/year/YearView"))` so the inactive
    one is code-split out of the response.
  - Add `<meta http-equiv="Accept-CH" content="Sec-CH-UA-Mobile">` to
    `app/layout.tsx` so Chrome/Edge send the hint on the next request. First
    visit on Chromium = desktop fallback; subsequent visits = correct.
  - Add a client-side `useEffect` in the page that calls `window.matchMedia`
    once on mount and triggers a router.refresh() if the server's guess was
    wrong (Safari/Firefox don't send the hint at all; iPad lies about it). The
    re-render is a one-time correction.
- Effort: 1 hr.
- Pros: only one variant ships per response; cleanest bundle split. Solves
  both halves of the audit (CLS + bundle).
- Cons:
  - Sec-CH-UA-Mobile is Chrome/Edge-only — Safari and Firefox visitors hit the
    fallback every time, get desktop HTML, then potentially re-render. CLS for
    those users is NOT solved unless we accept the re-render flash.
  - The page is currently a client component because both child trees use the
    `MinimizedSubjectsProvider` context — that context wrap might force keeping
    the page client. Need to verify; if blocking, the file split becomes
    `page.tsx (server) → wrapper.tsx (client provider) → branch.tsx (server)`.
  - Adds a layout dependency on `Accept-CH` — non-zero blast radius for first-
    visit users (always-desktop until the second visit).
- Bundle delta: ~15-25 KB gzipped saved per direction (per audit estimate).
- CLS: eliminated for Chromium; mitigated-not-eliminated for Safari/Firefox.

**Option 3: New `useMediaQuery` hook + `next/dynamic({ ssr: false })`**

- How:
  - Add `lib/use-media-query.ts` — extract the matchMedia pattern from
    `WeeklyShell.tsx` L474-494 into a reusable hook
    `useMediaQuery(query: string): boolean`.
  - Refactor BOTH `app/(planner)/year/page.tsx` and `WeeklyShell.tsx` to consume
    the hook (small drift-reducing win).
  - In `page.tsx`, use the hook + `next/dynamic(() => import(...), { ssr:
    false })` for each variant. Server renders neither; client mounts the
    correct one after hydration.
- Effort: 45 min (hook + refactor + page wiring).
- Pros: reusable primitive future surfaces will need; bundle split is real;
  hook becomes the cross-app idiom.
- Cons: `ssr: false` means the page paints a blank screen until the client
  bundle loads + hook resolves — measurable first-meaningful-paint regression
  on phone (where bundle download is slowest). The CLS problem becomes a
  blank-frame problem, which is arguably worse for perceived perf.
- Bundle delta: bundle split is real, but the inactive variant downloads
  on-demand if the viewport ever flips (rare in practice; mostly never
  downloads).
- CLS: replaced with empty-paint-then-content flash.

### Recommended

**Option 1 (CSS-only switch + keep the JS-driven `aria-hidden`).** It is the
minimum diff that resolves the CLS half of the audit finding deterministically
at every viewport on every engine, and it preserves the a11y win Lane D
already shipped. Both bundles still ship — that's a real cost, but the audit's
~15-25 KB estimate is small enough that it isn't worth the
Sec-CH-UA-Mobile/Accept-CH complexity or the empty-paint flash of `ssr: false`.

**What would change my mind:** if the planner shell is moving toward
server-component-by-default (e.g. for the Phase 2 Supabase data layer), then
Option 2 becomes free piggy-back work and worth doing.

---

## M4 — /year has no print stylesheet (timeline scales to ~16% on paper)

### Current state

- `components/year/YearView.module.css` and `RoadmapView.module.css` have no
  `@media print` block (grep confirmed; module files for other Year components
  do have `@media (prefers-reduced-motion)` rules but never `@media print`).
- `app/globals.css:51-68` already hides the planner shell chrome (`header`,
  `aside`, `[role="complementary"]`) under `@media print`. The /year body
  itself is untouched.
- The timeline `.timelineScroll` is 4520px wide. Browsers fit-to-page-scale
  the whole thing to ~700px Letter portrait → ~16% scale → illegible.
- Precedent: `app/(planner)/weekly/print/page.tsx` is a 200-line dedicated
  print route that reads from `usePlanner()` + `useAppState()`, renders a
  `<table>` matrix, and is gated by `[data-print-view]` on its root + the
  `body:has([data-print-view])` cascade in `globals.css:44-48` to suppress
  shell chrome on-screen too (the print page is also viewable on-screen as a
  preview).
- Phase 1A beta gate (CLAUDE.md §6 phasing reminder): "basic print/export"
  is in scope. Whether Yearly print is in scope vs. Phase 1B is a judgment
  call — the planning doc says Weekly + Daily are the priority prints.

### Options

**Option 1: @media print block in YearView.module.css + RoadmapView.module.css**

- How: add `@media print { .timelineScroll { overflow: visible; transform:
  scale(...); transform-origin: top left; width: auto } ... }` plus rules to
  hide `.controls`, `.statusBar`, the in-page Roadmap/Progression toggle, and
  to unstick the QuarterMonthWeekHeader. Force landscape via `@page { size:
  landscape }`.
- Effort: 45-90 min (lots of visual iteration; transform-scale + page-break
  interactions are notoriously fiddly).
- Pros: no new route; single file pair.
- Cons: fundamentally fighting the medium — a 4520px-wide flex row doesn't
  re-flow legibly inside an 11×8.5 landscape page (~1056px usable) no matter
  how you scale. Best case: 4520→1056 = 23% scale, still illegible. You'd
  need page-break-inside controls AND month-wise horizontal pagination, which
  CSS only barely supports. The audit's recommendation hints at this trap.
- Bundle: 0.
- Print quality: mediocre at best.

**Option 2: Dedicated `/year/print` route (mirrors /weekly/print)**

- How:
  - New file `app/(planner)/year/print/page.tsx` paralleling the /weekly/print
    structure. Read `usePlanner()` + the year-calendar helpers (`allYearMonths`,
    `monthIndexForWeek`).
  - Re-flow as **vertical month-stack**: one section per month, each section a
    table of 8 subject rows × 4-5 week columns. ~9 months per academic year =
    9 sections, fits comfortably in landscape Letter with page-break-before
    rules between sections.
  - Add a small `app/(planner)/year/print/print.module.css` (same naming as
    the weekly one).
  - Add a `<Tooltip><Button onClick={() => router.push('/year/print')}>Print
    this year</Button></Tooltip>` next to the existing Filters/Export
    placeholders in `YearView.tsx:344-369`. (Or wire it through the existing
    `Export` button if we want a single export-actions surface.)
  - Set `[data-print-view]` on the page root — the existing globals.css
    cascade then suppresses the shell chrome for free on-screen preview AND
    on paper.
- Effort: 2-3 hr (new component + month-stack layout + button wiring +
  per-tier verification per CLAUDE.md §5 (the print preview is its own
  responsive surface that must work in landscape A4 + landscape Letter)).
- Pros: cleanest separation of concerns; can use a totally different (and
  legible) layout optimised for paper; matches the established /weekly/print
  precedent so future agents have one pattern to learn.
- Cons: more code; two views to keep in sync as the data model evolves
  (mitigated by the fact that they both consume `usePlanner()` + the
  year-calendar pure functions — there's no UI duplication).
- Bundle: small new route (~5-10 KB).
- Print quality: high — purpose-built.

**Option 3: Hybrid — @media print rules in YearView.module.css that re-flow
the timeline as month-blocks, no new route**

- How: in `YearView.module.css`, add `@media print` rules that:
  1. Hide all chrome (controls, status bar, toggle).
  2. Override `.timelineScroll { overflow: visible }` and the inner
     `.timeline { display: grid; grid-template-columns: 1fr }` — collapsing
     the horizontal flex into a vertical stack.
  3. Override each `.laneCard` to render with `page-break-inside: avoid` and
     full-page width.
  4. Force `@page { size: landscape }`.
- Effort: 60-90 min.
- Pros: middle ground — no new file; reasonable paper layout.
- Cons:
  - You're re-implementing the YearMobile vertical-stack treatment via print
    CSS instead of reusing YearMobile itself. Code-as-data duplication.
  - The QuarterMonthWeekHeader is sticky + scroll-bound; un-sticking and
    un-flexing it for print is non-trivial.
  - Still print-CSS-driven, which is the maintenance hot spot Option 2 was
    designed to avoid.
- Bundle: 0.
- Print quality: medium-high but brittle.

### Recommended

**Option 2 (dedicated /year/print route)** — but only if Yearly print is in
Phase 1A scope. Given that the Weekly print precedent exists and the audit
calls this out specifically, building it the same way is the architecturally
honest fix. The /weekly/print template is a 200-line file; /year/print
should be similar.

**If Phase 1A scope says "Weekly + Daily print only, defer Yearly to 1B":**
Defer entirely. The current "16% illegible scale" is bad UX, but the page
isn't broken — teachers who try to print just won't. Mark M4 as Phase 1B in
the audit and move on.

**What would change my mind:** if the user says "no new routes this sprint,"
fall back to Option 3 (hybrid print CSS); Option 1 alone is not worth doing.

---

## m2 — Hydration-mismatch warning at desktop first /year visit

### Current state

- React DevTools warning in audit probe: "A tree hydrated but some attributes
  of the server rendered HTML didn't match the client properties."
- `app/(planner)/year/page.tsx:28` does `useState<boolean>(false)`. Server
  HTML and first client render BOTH start with `isPhone === false`, so the
  /year `isPhone` state is NOT the smoking gun — the audit notes this on
  L218-220.
- Plausible culprits (descending likelihood):
  1. `components/shell/top-bar.tsx` — calls `useAppState().currentUser`,
     which hydrates from Supabase `auth.getUser()` in a post-mount effect
     (`lib/app-state.tsx:212-232`). The avatar Image src changes between SSR
     (always `FALLBACK_USER`) and client (real user). Image src mismatch is a
     classic source of this warning.
  2. `TopBarMoreMenu` — its open/closed state likely starts from
     `localStorage` (consistent pattern in the codebase); the SSR pass has no
     localStorage so the first paint mismatches.
  3. Save indicator `savedAt` (top-bar.tsx:113-118) — null on SSR, possibly
     hydrated from elsewhere, renders `toLocaleTimeString()` on client only.
- Probe data attributed the warning to "desktop /year first visit" but the
  shell chrome is rendered on EVERY route — if it were shell-sourced you'd see
  it everywhere. So the warning is /year-specific OR the audit happened to
  capture it on /year and it's everywhere (and just hasn't been flagged on
  other routes yet).

### Options

**Option 1: Investigation first (no code change yet)**

- How: spawn a focused debug agent that:
  - Launches HEADED Playwright at /year on a fresh-cold session.
  - Watches the React DevTools profiler / `console.error` stream for the full
    hydration warning string (includes the offending DOM node and attribute
    name in dev mode).
  - Reproduces the warning at /weekly and /daily — to determine whether it's
    /year-specific.
  - Returns a one-line root cause + proposed surgical fix.
- Effort: 30-45 min investigation + remediation depends on the finding
  (probably another 15-30 min).
- Pros: targeted; doesn't change unrelated code; addresses Karpathy guideline
  "Surface assumptions" — we're guessing at the source today.
- Cons: requires a second pass; can't be batched with M3.

**Option 2: Apply M3 Option 1 (CSS-only switch), then re-check**

- How: M3's CSS-only fix removes the `useState` + `useEffect` from
  `app/(planner)/year/page.tsx` entirely. If /year was the source the warning
  goes away with M3.
- Effort: 0 incremental over M3.
- Pros: kills two birds; zero extra effort.
- Cons: per the audit's own analysis (L218-220) /year is unlikely to be the
  source. Probability this resolves m2: ~25%. The other 75% the warning
  persists and we still need Option 1.

**Option 3: Suppress the warning**

- How: wrap suspect components in `suppressHydrationWarning` or
  `<ClientOnly>`.
- Effort: 10 min.
- Pros: quickest.
- Cons: cargo-cult; masks rather than fixes; violates the spirit of
  CLAUDE.md §5 (report outcomes faithfully) AND
  `andrej-karpathy-guidelines` (surface assumptions, define verifiable
  success criteria).

### Recommended

**Option 2 in the same wave as M3, with Option 1 as the fallback if the
warning persists.** Doing M3 anyway buys the cheap shot at resolving m2
for free; if the warning survives M3 the investigation is a separate
targeted PR. Do NOT pursue Option 3.

**What would change my mind:** if M3 is deferred (e.g. user picks Option 2
on M3 with a longer timeline), do Option 1 standalone now — the warning
shouldn't ride along in shipping releases.

---

## m3 — Wordmark "Grade 5" suffix inconsistency

### Current state

- `components/shell/top-bar.tsx:174-182` renders the wordmark as two spans:
  `<span className={styles.wordmarkApp}>MyCurricula</span>
  <span className={styles.wordmarkGrade}>Grade 5</span>` — "Grade 5" is a
  hard-coded literal in JSX.
- `components/shell/top-bar.module.css` `.wordmarkGrade` styles it as a
  small muted suffix (`var(--t-12)` / `var(--ink-400)`). Likely hidden at
  phone widths by a `@media (max-width: 480px) { .wordmarkGrade { display:
  none } }` rule (the audit reports the phone wordmark drops "Grade 5",
  consistent with this).
- CLAUDE.md §1 explicitly mandates: "Multi-grade ready by design… build
  grade-scoping in from day one." The hard-coded "Grade 5" is a direct
  violation.
- `lib/app-state.tsx` exposes a `CurrentUser` shape via `currentUser`. Lines
  176, 212. No `grade` field on it today. The Supabase user shape would have
  to add it (or it comes from a `teacher` row joined off the user).
- Probable Supabase column path: a `teachers` table somewhere — confirmed by
  the file `lib/mock/teachers.ts` existing.

### Options

**Option 1: Drop "Grade 5" from the wordmark entirely**

- How: delete the `<span className={styles.wordmarkGrade}>Grade 5</span>` in
  `top-bar.tsx`. Optionally also delete the `.wordmarkGrade` CSS class.
- Effort: 10 min.
- Pros: simplest; eliminates the inconsistency in one stroke; removes the
  hard-coded literal that violates the multi-grade mandate.
- Cons: loses the visual cue. Teachers in a multi-grade school (Phase 1B+)
  would benefit from a grade-scope indicator; removing it now means adding
  it back later in a different form.

**Option 2: Tie wordmark grade to a config value (`currentUser.grade`)**

- How:
  - Add `grade?: string` to the `CurrentUser` shape in `lib/app-state.tsx`.
  - In the mock `FALLBACK_USER` (and the Supabase `toCurrentUser` mapper),
    populate it with `"5"`.
  - In `top-bar.tsx:181`, replace the literal with `{currentUser.grade &&
    <span className={styles.wordmarkGrade}>Grade {currentUser.grade}</span>}`.
  - Strip the responsive `display:none` so the chip behaves consistently
    across widths (or keep it for phone-budget reasons).
- Effort: 30 min if `CurrentUser` is well-encapsulated; 45 min if the
  Supabase mapper needs adjustments.
- Pros: respects the multi-grade mandate; data-driven; ready for a Phase 1B
  settings UI to flip it per teacher.
- Cons: touches the auth/state surface; the value is still effectively
  hard-coded (in the mock + the Supabase fallback), so it's only "config-
  driven" in name until Phase 1B ships the actual setting.

**Option 3: Move grade out of the wordmark, into the left filter panel
header or a breadcrumb slot**

- How: same data plumbing as Option 2, but the display surface changes —
  the grade chip lives in a less-prominent slot (e.g. left panel header or
  page breadcrumb).
- Effort: 45-75 min (data + new slot + visual integration).
- Pros: cleaner separation of brand vs. user context; freeing the wordmark
  is a small architectural win.
- Cons: more UX redesign than the audit asked for; bikeshed risk on slot
  placement.

### Recommended

**Option 2.** The audit finding is fundamentally about the multi-grade
mandate from CLAUDE.md §1 — Option 1 sidesteps it; Option 3 over-solves it.
Option 2 makes the smallest diff that aligns with the policy: the wordmark
keeps showing the grade context (which teachers do want at a glance),
but the literal is gone and the path to per-teacher config is open. The
phone responsive-hide rule can stay — that's a layout decision unrelated to
the data shape.

**What would change my mind:** if the user is allergic to touching
auth/state for a chrome polish item, Option 1 is acceptable (with a
clear ticket noting Phase 1B should re-add it data-driven).

---

## m7 — Tooltip on disabled `<button>` may not fire in production browsers

### Current state

- `components/year/YearView.tsx:334-369` wraps two disabled buttons (Filters,
  Export) in `<Tooltip content="…">`. Both have `disabled` + `aria-disabled`
  + a native `title="Coming soon"` fallback attribute.
- `components/ui/Tooltip.tsx:218-228` uses `cloneElement` to inject ref +
  `onMouseEnter`/`onMouseLeave`/`onFocus`/`onBlur` onto the child element.
  No wrapper element is created.
- Spec issue: per HTML spec, disabled `<button>` elements DO NOT fire mouse
  events in Chromium and WebKit (Firefox is more lenient). The `mouseenter`
  handler injected by cloneElement onto the disabled button → never fires.
- The Playwright headless probe found no `[role="tooltip"]` element on hover.
  Headless Chromium honours the disabled-button pointer suppression so the
  probe is consistent with the spec issue.
- `title="Coming soon"` IS present, so users see SOMETHING (the OS-native
  title bubble) — but it's not the styled Tooltip Lane D intended.

### Options

**Option 1: Verify in real (headed) browsers first**

- How: spawn an agent that launches headed Playwright (or Playwright with
  `--headed`) in Chromium + Firefox + WebKit, navigates to /year on desktop,
  hovers the disabled buttons, screenshots, and inspects the DOM for
  `[role="tooltip"]`. Reports per-engine.
- Effort: 20-30 min.
- Pros: zero assumption; no code change unless broken. Aligns with the
  Karpathy guideline "define verifiable success criteria."
- Cons: requires the agent to actually launch headed browsers (Windows
  Playwright headed mode is reliable in this repo per the existing audit
  workflow); still a second-pass effort.

**Option 2: Wrap disabled button in a `<span>` owning the listeners (per-callsite fix)**

- How: change the two callsites in `YearView.tsx:344-369` from
  `<Tooltip><button disabled>...</button></Tooltip>` to
  `<Tooltip><span tabIndex={0} role="button" aria-disabled="true" aria-label="…">
  <button disabled aria-hidden tabIndex={-1}>…</button></span></Tooltip>`.
  The span receives pointer events that the disabled button suppresses, so
  Tooltip's injected `mouseenter` fires on it.
- Effort: 30 min for the two callsites + a11y audit of the span-as-button
  pattern.
- Pros: works around the disabled-button event-suppression universally;
  per-callsite blast radius.
- Cons:
  - Applies the fix without verifying it was needed (Option 1's gap).
  - The span-as-button + nested disabled button is an a11y smell — screen
    readers may announce it twice or report contradictory state.
  - Doesn't help future Tooltip consumers who repeat the bug.

**Option 3: Detect disabled in the Tooltip primitive itself**

- How: modify `components/ui/Tooltip.tsx:218-228`. Detect whether the cloned
  child is `disabled` (children?.props?.disabled). If so, instead of cloning
  the disabled element, wrap it in a `<span style={{display:'inline-flex'}}>`
  that receives all the listeners. Existing API stays unchanged.
- Effort: 45-60 min (the Tooltip is a fairly load-bearing primitive — needs
  testing across consumers, especially the focus/blur path that currently
  relies on the trigger being focusable).
- Pros: fixes at the primitive level — every consumer benefits including
  future disabled-button uses; matches the way Radix Tooltip and other
  libraries handle this.
- Cons: cross-cutting change to a primitive that's wired into the top bar,
  every icon button across the app, and the Year action buttons. Broad
  blast radius. Karpathy guideline "make surgical changes" cautions against
  this when one consumer has the issue.

### Recommended

**Option 1 (verify first), and if verification confirms the Tooltip is
broken on disabled buttons, then Option 3 (primitive-level fix).** The audit
explicitly notes Playwright headless behaviour may differ from real-browser
(L302) — that gap MUST be closed before code change. If the verification
finds the Tooltip IS broken on disabled buttons (likely), the primitive
fix is the right move because the bug is intrinsic to disabled-button
event-suppression — it will affect every future consumer, and the codebase
already has multiple disabled-Tooltip pairings (the undo/redo buttons in
top-bar.tsx:331-356 use disabled + Tooltip and are probably affected too).

**What would change my mind:** if Option 1 finds the Tooltip works in
Firefox/WebKit and only fails in headless Chromium → the issue is
test-tool-side and Lane D's pattern is fine in production; close as
won't-fix. If real-browser verification confirms breakage but the user
prefers a minimum-diff PR this week, do Option 2 on YearView and ticket
Option 3 separately.

---

## Cross-cutting notes

- **M3 and m2 are coupled.** M3 Option 1 deletes the only obvious /year-side
  hydration trigger; doing M3 first is the cheapest way to test the m2
  hypothesis. They should ship in the same PR or paired commits.

- **No shared responsive hook exists.** Both `app/(planner)/year/page.tsx`
  and `components/weekly/WeeklyShell.tsx` hand-roll the same SSR-safe
  `matchMedia` pattern. Whether or not M3 picks Option 3 (the hook
  extraction), there's a small future-proofing win in extracting
  `lib/use-media-query.ts` at some point — but it does not need to gate any
  of these five findings.

- **m3 (Grade 5 hard-code) is in the shell, not in /year.** The audit
  surfaces it on /year because the page title there ("Yearly View") makes
  the redundant wordmark suffix most visible. The fix lives in
  `components/shell/top-bar.tsx`. If a wave of shell-chrome polish is
  planned anyway, batch m3 there.

- **m7's primitive-fix scope.** If Option 3 is chosen for m7, audit ALL
  `<Tooltip>` callsites that wrap a disabled element. Grep target:
  `<Tooltip[^>]*>\s*<Button[^>]*disabled` and the manual
  `<button disabled` pattern. The top-bar undo/redo buttons
  (`top-bar.tsx:331-356`) are likely candidates and would silently benefit
  from the primitive-level fix.

- **The /year route still has 5 deferred medium/minor items beyond these
  five.** This research doc only covers M3, M4, m2, m3, m7. The remaining
  audit items (m1 fake "24 students", m4 Today-button no-feedback, m5
  duplicate subject filter, m6 dead YearSidebar file, M5 touch targets)
  are simpler and don't need an options doc — they each have a single
  obvious fix path. They can be picked off in a single cleanup wave once
  the items here are resolved.

- **Phase awareness.** M4 (print stylesheet) is the only finding here that
  might be genuinely deferrable to Phase 1B — print export is in scope per
  CLAUDE.md §6 phasing, but "basic print/export" is the bar and Weekly
  print already meets it. If the user wants beta-ready in late August (per
  CLAUDE.md §6), M3, m2, m3, m7 should ship; M4 can ride a later wave.
