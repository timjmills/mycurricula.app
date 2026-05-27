# /weekly + /daily — Phase 1 (Defects) + Phase 2 (Improvements)

> **⚠ Snapshot disclaimer** — this is a dated audit/research artifact (2026-05-25).
> Findings and recommendations may have shipped, regressed, or been superseded by
> later work. Verify against current code (`git log -- <file>`) before treating any
> finding as open or any recommendation as binding. The canonical project guide is
> `CLAUDE.md`.

Audit performed 2026-05-25 against the live deployment at `https://mycurricula.app/weekly` and `https://mycurricula.app/daily`, cross-referenced with source under `app/(planner)/weekly/`, `app/(planner)/daily/`, `components/weekly/`, `components/daily/`, `components/grid/`, `components/lesson-card/`, and `components/shell/`. Three viewport tiers were probed via Playwright (400/768/1280). Several findings affect both routes; they are listed under whichever route surfaces the worst case and noted as "Route(s)" cross-references where relevant.

---

## Phase 1 — Defects

### /weekly

#### Blockers

##### [Blocker] Top-bar Sign Out + Profile clipped past viewport at every desktop width below 1281px **[FIXED in commit b4071d6]**
**Route:** /weekly (also affects /daily and every planner route)
**File:** `components/shell/top-bar.module.css:41` (`overflow-x: clip` on `.bar`), `components/shell/top-bar.tsx:491–512` (Profile + Sign Out at the right end of the bar)
**What I saw:** The top bar's `overflow-x: clip` rule (introduced as the fix for document-level horizontal scroll, comment at `top-bar.module.css:28-44`) silently cuts off whatever flex children exceed the viewport. At 1280×900 the rendered top bar has `scrollWidth = 1346`, so the rightmost 66px is hidden. Concretely (measured via Playwright on the live site):
  - 400px viewport: `Profile settings (Tim)` right=506 (clipped at 400), `Master mode` right=445 (clipped)
  - 768px viewport: `Search` right=786, `Catch-up` right=836, `To-do` right=860, `Comments` right=906, `Profile` right=944, `Sign out` right=994 — six controls past the right edge
  - 1024px viewport: `Open to-do panel` right=1042, `Comments` right=1088, `Profile` right=1126, `Sign out` right=1176
  - 1280px viewport: `Profile` right=1296, `Sign out` right=1346
**Why it matters:** Profile is the only entry into Settings/Appearance and Sign Out is the only logout affordance in the chrome. At 1024–1280 (the most common laptop widths for a school-issued device) a teacher cannot see or click either. The control still receives pointer events at its true coordinates — it is reachable only by tab key or by knowing the offscreen location and accidentally landing on it. There is no menu fallback. The current code has a `@media (max-width: 540px)` hide for `.signOutForm` (`top-bar.module.css:521`) but no equivalent at 541–1280px, so the failure surface is "1024–1280 desktop", not "phone".
**Reproduction:**
1. `curl -L -H "Authorization: Bearer $TOKEN" https://mycurricula.app/weekly -o /tmp/weekly.html` — confirm Sign Out is in the rendered HTML.
2. Load `/weekly` at viewport ≤1280 in a browser. Look at the top bar's right edge; verify Profile + Sign Out are visually missing.
3. From DevTools console: `document.querySelector('button[aria-label="Sign out"]').getBoundingClientRect()` returns `right: 1346` at 1280-wide.
**Proposed fix:** Drop the unconditional `overflow-x: clip` and instead introduce an overflow menu / hamburger affordance that absorbs everything past a budget at each breakpoint. Minimum viable fix: at ≤1280 collapse the right cluster (`Search / Catch-up / Todo / Comments / Sign out`) into a `⋯ More` button that opens a small menu containing every clipped control plus the Profile link. Keep Profile as a visible avatar at ≥768. Document the visible-right-edge contract in `BUILD_STANDARD.md`.
**Verified against live site:** yes — measured rect positions via Playwright + the `inspect-topbar.mjs` script.

##### [Blocker] /daily renders no `<h1>` — heading hierarchy starts at h2 **[FIXED in commit 0867ce1]**
**Route:** /daily
**File:** `components/daily/DailyView.tsx:1744-1783` (page tree — no h1 anywhere); `components/daily/TodayDashboard.tsx:55` (renders `<h2>{dayLabel}</h2>` as the top-of-page heading)
**What I saw:** Probing `/daily` at every viewport, `document.querySelectorAll('h1')` returns 0. The first heading is "Sunday" (h2) from `TodayDashboard.tsx:55`. The next is the lesson title (h2) from `LessonDetail.tsx` (`detailStyles.titleH2`). The breadcrumb above (`DailyView.tsx:1750-1782`) is rendered as a `<nav>` with `<ol>`/`<Link>` only — no heading element. Compare `/weekly` which has `<h1>Week 12</h1>` rendered by `WeekNavigator.tsx:43-46`.
**Why it matters:** WCAG 2.4.6 (Headings and Labels) plus the H42/H69 techniques expect a programmatically determinable page heading. Screen reader users using "skip to first heading" / "next h1" gestures land in the middle of the page on a day-name h2, and the page reads like a section of another document rather than a top-level surface. Also makes any future heading-based outlining (e.g., browser reader-view, automated TOC) fail. Inconsistent with /weekly which DOES set h1.
**Reproduction:** `node -e` against the rendered page → `document.querySelector('h1')` is `null`.
**Proposed fix:** Add an h1 inside `DailyView.tsx` above the breadcrumb that mirrors the /weekly idiom — e.g. `<h1 className={styles.srOnly}>Daily plan — {WEEK_DAYS[selectedDay]}, Week {week}</h1>`. The visual day-name h2 inside `TodayDashboard` can remain, but should drop to h2/h3 once h1 exists. Aim for one h1 per route, consistently positioned.
**Verified against live site:** yes.

##### [Blocker] /daily duplicates Standards content in two adjacent sections — second h3 reads as "Standards2" **[FIXED in commit 0867ce1]**
**Route:** /daily
**File:** `components/lesson-flow/lesson-flow.tsx:146-150` (virtual Standards canonical row in LessonFlow) AND `components/daily/LessonDetail.tsx:650-674` (separate Standards section in the lesson detail body)
**What I saw:** A selected lesson on /daily renders **two** `Standards` blocks in the right pane:
  1. h3 "Standards" inside the LessonFlow list (`lesson-flow_sectionTitle`) — sourced from `lesson.standards`.
  2. h3 "Standards" with a count badge inside the same h3 element directly below (`lesson-detail_sectionHead`). The accessibility-tree concatenation of the `<h3>` + `<span class="sectionCount">{count}</span>` reads as "Standards2" (or "Standards5" etc.) to a screen reader — confirmed by `page.evaluate(h => h.textContent)` returning "Standards2". This is the SAME a11y bug that was previously fixed for the Weekly grid day-headers (`WeeklyGrid.tsx:669` adds an aria-label and aria-hides the spans).
**Why it matters:** (1) Two `Standards` sections show the same data twice — the upper LessonFlow row and the lower detail block both enumerate `lesson.standards`. Teacher noise. (2) Screen-reader users hear "Standards two" / "Standards five" as the heading text, which is meaningless. (3) Outlining tools see two headings of identical level with near-identical names. (4) The duplicate adds vertical scroll the teacher must skip past on a focused lesson view.
**Reproduction:**
1. Open `/daily` with any lesson selected (default).
2. DevTools: `Array.from(document.querySelectorAll('h3')).filter(h => h.textContent.includes('Standards'))` returns 2 nodes.
3. The second node's `textContent` is `"Standards2"` because the count chip is INSIDE the `<h3>`.
**Proposed fix:**
- Decide on one canonical Standards surface. The spec (`5.16.26 planning_document.md`) treats Standards as part of the lesson body, and the LessonFlow already shows them at position 1 via `helperOverride` (`lesson-flow.tsx:692-707`). Remove the duplicate block in `LessonDetail.tsx:650-674`.
- For any future heading that pairs text + a count chip, follow the `WeeklyGrid.tsx:669` pattern: hoist the visible spans to `aria-hidden="true"` and put the natural-language label on the parent heading. E.g. `<h3 aria-label={\`Standards (${count})\`}>Standards<span aria-hidden="true" className={...}>{count}</span></h3>`.
**Verified against live site:** yes.

#### Majors

##### [Major] Personal/Master toggle visible at phone but each radio button is 66×26px / 56×26px (below WCAG 2.5.5 minimum)
**Route:** /weekly (also affects /daily)
**File:** `components/shell/top-bar.tsx:345-365` (ToggleGroup wrapper); `components/shell/top-bar.module.css:473-503` (the `≤540px` cascade that keeps the toggle visible without enlarging the option hit target)
**What I saw:** The CLAUDE.md §6 contract requires the Personal/Master toggle to never be hidden. The current implementation keeps it visible by compressing the bar to 44px tall and shrinking option padding. At 400px viewport the individual `<button role="radio">` for each option measures 66×26 (Personal) and 56×26 (Master). The 26px height fails WCAG 2.5.5 (Target Size, AA) which requires ≥24×24 with spacing exception, but more critically fails Anthropic's own §4 hard rule ("≥44px touch targets on primary actions"). The toggle is also CLAUDE.md's named primary safety control ("intentional and explicit … gated by a top-bar Personal | Master toggle"). The comment at `top-bar.module.css:480` claims "≥44px touch target … is satisfied by the primitive's ::before inflation at ≤900px" but Playwright measurement contradicts that — `getBoundingClientRect()` returns 26px tall at 400/540/768/1280px viewports.
**Why it matters:** The single most dangerous toggle in the product (gates edits that affect the entire team) is the smallest tap target in the bar. Fingertip mishits push a teacher into Master mode without intent. The flashing/persistent banner does recover the situation, but the design intent is "friction where it matters" — a 26px target is the opposite of friction at the input layer.
**Reproduction:** At any viewport, `document.querySelector('button[aria-label="Personal mode"]').getBoundingClientRect()` returns height ~26.
**Proposed fix:** Either (a) verify the ToggleGroup's `::before` rule actually fires and measures ≥44px (it appears the selector isn't matching; investigate `components/ui/toggle-group.module.css`); or (b) at ≤900px, raise the bar height back to 52 and accept the row trade-off. The toggle's hit-target must measure ≥44px tall and ≥44px wide independently of the visual chip size.
**Verified against live site:** yes — Playwright report under "small touch (<36px)" for phone/tablet/desktop.

##### [Major] Search icon button is 14×40 — width below 44px touch target
**Route:** /weekly (and /daily — same TopBar)
**File:** `components/shell/top-bar.tsx:433-447` (the icon-only Search trigger), `components/ui/button.module.css` (Button variant="icon" default size)
**What I saw:** The collapsed search button measures 14×40 at tablet+ widths. Same dimensional issue affects `Open to-do panel` (18×40), `Open comments panel` (18×40), `Collapse filter panel` (18×40) — all named on the Playwright `small touch (<36px)` report.
**Why it matters:** Touch targets <44px wide fail WCAG 2.5.5 AA and CLAUDE.md §4. School-issued Chromebook touch screens and iPads are the primary input modality for teachers checking on the run — narrow buttons take multiple taps and create accidental neighbor presses.
**Reproduction:** DevTools: `document.querySelector('[data-search-trigger]').getBoundingClientRect()` returns ~14×40.
**Proposed fix:** Audit `components/ui/button.tsx` variant="icon" and ensure both dimensions ≥44px on tablet/phone. The SVG inside can stay 14px; the button itself needs min-width/height pad.
**Verified against live site:** yes.

##### [Major] WeeklyGrid forces internal horizontal scroll at every desktop viewport ≤1413px wide
**Route:** /weekly
**File:** `components/grid/WeeklyGrid.module.css` (no specific line — the `.grid` track template with `minmax(132px, 1fr)` corner cell plus 5×190 day columns = 1082px content; plus the rail = 1402+ total); `components/weekly/WeeklyShell.module.css:344-373` (the rail hide at ≤1280px) — fix tames the document, not the grid
**What I saw:** At 1280×900 the document does not scroll (good — the `.bar` fix and the WeeklyShell `display: none` of the rail kept doc width = viewport width). But the WeeklyGrid itself reports `cell.right = 1413` while the viewport is 1280 — i.e. the day columns and headers are 133px wider than the grid track shows. The grid scrolls horizontally inside `.WeeklyGrid_scroll__HIoai (overflow-x: auto)`. So the teacher sees 4 day columns + part of a 5th and must horizontally scroll to see Thursday lessons at 1280. At 1024 the cutoff is even more severe.
**Why it matters:** The Weekly view's defining promise is "what are we teaching this week" at a glance. Hiding 20% of the week inside a horizontal scroll on the most common laptop width (1280) undercuts that. Internal scroll is also far less discoverable than document scroll — there's no scrollbar shadow indication until the teacher tries to scroll, by which point they may have assumed Thursday/Friday is empty.
**Reproduction:** Open /weekly at 1280 width. The 5th day's lessons (`Math, Re-engagement: error analysis`) are partially or wholly past viewport.
**Proposed fix:** Re-balance the grid: shrink the subject-label gutter at ≤1366, drop the day cell min-width slightly, or make the cells `minmax(0, 1fr)` instead of fixed-min. Alternatively, surface a "scroll for Friday" affordance (e.g. ghost-edge gradient + chevron). Track which decision belongs upstream — list mode is the fallback at <901px, but 901–1366 currently has no good answer.
**Verified against live site:** yes — `find-1346.mjs` output shows `WeeklyGrid_cell__c4dLx ... right: 1413, containedBy: div.WeeklyGrid_scroll__HIoai (ovx=auto)`.

##### [Major] No `loading.tsx` or `error.tsx` route boundary for the planner segment
**Route:** /weekly and /daily (App Router fallback)
**File:** Missing — `find app/ -name "loading.tsx" -o -name "error.tsx"` returns nothing
**What I saw:** The repo defines no Next.js route-level `loading.tsx` or `error.tsx` for any segment. Today the planner reads from mock data (`lib/mock/`) so this surfaces only as an absent skeleton on first paint and "white screen of death" on any future server-side error. The new `usePlanner` / `useAppState` providers wrap the layout (`app/(planner)/layout.tsx:32-85`) but there is no `<Suspense>` boundary either.
**Why it matters:** When the backend lands (Supabase, mentioned in CLAUDE.md §3), this becomes a real bug: a slow query yields a blank canvas with no loading affordance, and a 500 yields the default Next error page (no app chrome). The spec explicitly lists "Loading states" and "Error states" as required (planning_document.md §9).
**Reproduction:** No live repro yet (no real fetch). Code-level: `grep -r "loading\.tsx" app/` returns nothing.
**Proposed fix:** Add `app/(planner)/loading.tsx` with a top-bar shell + grid skeleton, and `app/(planner)/error.tsx` with a friendly retry. Even before Supabase lands, these become the slot a slow client provider can render under. The MED-8 "Saved HH:MM" indicator in the top bar (`top-bar.tsx:273-287`) is currently theatrical — it can wait for a real persistence layer before being trusted.
**Verified against live site:** n/a — code observation only.

##### [Major] "Saved HH:MM" / "All changes saved" lies until persistence is wired
**Route:** /weekly (and /daily — same TopBar)
**File:** `components/shell/top-bar.tsx:103-110, 273-287`
**What I saw:** The save indicator shows "All changes saved" on mount and "Saved 14:32" after any planner-store mutation. But `lib/planner-store.tsx` has no network code — every mutation is in-memory only. The user is told the system has saved when nothing has been sent anywhere.
**Why it matters:** CLAUDE.md §5 instructs us to "Report outcomes faithfully" and the prompt spec calls out "Microcopy that lies (Saved! when it failed)". Right now the indicator is harmless because there's no backend, but the first reload silently discards every edit a teacher made. Better to surface "Local only — not yet synced" until persistence lands.
**Reproduction:** Edit a lesson title, see "Saved 14:32", reload the page → edit is gone.
**Proposed fix:** Hide the save indicator entirely while the prototype is mock-only, OR change the copy to "Local changes only" with a tooltip explaining persistence is not yet wired.
**Verified against live site:** Yes — top-bar shows "Saved 14:30" after a click despite no Supabase round-trip.

##### [Major] Sign-out is a `<button type="submit">` inside a clipped `<form>` — keyboard-only users can submit a logout they can't see
**Route:** /weekly (also /daily)
**File:** `components/shell/top-bar.tsx:502-512` ( bespoke native `<button type="submit">`)
**What I saw:** The Sign-out button is rendered as a native `<button type="submit">` rather than the `Button` primitive because submit semantics are load-bearing (comment at `top-bar.tsx:500`). After tabbing past the (clipped) profile avatar, focus lands on this offscreen Sign Out. Hitting Enter at that point silently posts to `/auth/signout` and the teacher's session terminates — with no visual indication of which control they were focused on.
**Why it matters:** Combines two bugs: (1) the clip already hides the control; (2) the destructive-action focus has no visible focus indicator past the viewport edge. A teacher tabbing through controls hunting for Search can accidentally sign themselves out and lose unsaved work mid-edit.
**Reproduction:** At any viewport ≤1280 with the planner loaded, press Tab repeatedly through the top bar; observe that focus moves past the visible chrome with no apparent target. Hit Enter while focus is at the avatar or sign-out (you cannot see where it is); next paint is the login screen.
**Proposed fix:** Couple to the "overflow menu" fix above. The destructive Sign-out action belongs inside a deliberate menu (avatar-popover or settings page), never inline in a sticky bar. Add an `aria-describedby` confirmation in the meantime that the click handler intercepts on Enter and shows "Are you sure?" — although CLAUDE.md §6 generally rejects confirms, this is the rare destructive case (the Master-mode banner pattern doesn't fit, because there's no banner to display once sign-out completes).
**Verified against live site:** yes — Tab order via Playwright lands on a 0-size focus rect at right=1346 at 1280-wide.

#### Minors

##### [Minor] WeeklyShell narrow gate at 900px loses the dedicated `scheduleMode` pill
**Route:** /weekly
**File:** `components/weekly/WeeklyShell.tsx:803-844` (`showSchedule = !isNarrow && scheduleMode`); `WeeklyShell.tsx:826-829` ("Pills bar … Hidden at ≤900px")
**What I saw:** The `Subject lesson list ↔ Show schedule rail` pills (rendered by `WeeklySchedulePills`) are hidden at ≤900px because at narrow widths the Schedule timeline isn't viable. But this means a teacher on a tablet who toggled schedule mode at desktop and then narrows their window loses access to the toggle — the persisted localStorage value is still `"schedule"` but the pill that turns it off is gone and the page renders as List. No indication that the persisted state is invisible.
**Why it matters:** Persistent state with no visible control = teacher confusion when they expand to desktop again and the view doesn't match what they last set.
**Reproduction:** Open /weekly on desktop, click "Schedule". Resize window to 800px. The schedule timeline disappears (correct — narrow gate). Expand back to 1280px and the schedule mode resumes — but if the teacher had wanted to clear that state from the narrow view, no affordance exists.
**Proposed fix:** Either (a) clear `useWeeklyScheduleMode` to `subject` when the narrow gate kicks in, OR (b) show a small inline "Schedule mode is on — resize to ≥901px to see it" inline hint inside the List view.
**Verified against live site:** partial — confirmed pill hidden via inspection at phone; resume-on-expand behavior is code-level inference.

##### [Minor] Two `aside` landmarks on /weekly but only one is named
**Route:** /weekly
**File:** `components/shell/right-panel.tsx`, `components/daily/RightRail.tsx:580-583`
**What I saw:** Playwright `landmarks={"aside":2}` on /weekly. One is `aria-label="Week resources and day planning"` (from RightRail). The other is the LeftFilterPanel (`left-filter-panel.tsx:173: aria-label="Filters"`). Both have labels — good. The /daily has `aside: 1` (the LeftFilterPanel is suppressed on /daily per `left-filter-panel.tsx:125`). However the IconRail is a `<nav aria-label="Daily view navigation">` rendered at the page level alongside another `<nav>` from breadcrumb (`DailyView.tsx:1750`) and another from `WeeklyList` etc. — 3 nav landmarks on /daily. Two of them aren't unique (`Daily view navigation` + `Breadcrumb`); a screen reader's landmark list shows three navs without ordering, hard to triage.
**Why it matters:** Multiple same-name landmarks bloat the SR navigation menu. WCAG 2.4.1 (Bypass Blocks) and 4.1.2 (Name, Role, Value) get noisier than they should be.
**Reproduction:** SR test or `document.querySelectorAll('nav').forEach(n => console.log(n.getAttribute('aria-label')))`.
**Proposed fix:** Trim to one nav per region purpose. Make IconRail a `<aside>` (it's a side rail, not primary nav after the top-bar) and reserve `<nav>` for the breadcrumb + top-bar view-switcher only.
**Verified against live site:** yes.

##### [Minor] WeekNavigator `Today` button stays disabled when already on This Week — but Prev/Next don't change disabled state when atStart/atEnd
**Route:** /weekly
**File:** `components/grid/WeekNavigator.tsx:36-37, 57-83`
**What I saw:** The component correctly computes `atStart = week <= minWeek` and `atEnd = week >= maxWeek` from the fixture bounds. But the mock data only contains weeks 11–13 (`CURRENT_WEEK = 12`), so a teacher on `/weekly` immediately sees Prev disabled and quickly reaches the end. The bounds are derived from `weekBounds(lessons)` which means an empty week 14 silently isn't navigable, even though it should be (teachers plan ahead).
**Why it matters:** "Today" button works, but Prev/Next are arbitrarily clipped by the dataset's max week. Teachers who try to plan into a not-yet-populated week hit a dead end with no feedback.
**Proposed fix:** Let Prev/Next range over the school-year configuration (a constant when the backend lands; for now, +/- 4 from CURRENT_WEEK). Disable only when the teacher actually tries to navigate off the school year. Tooltip on disabled Prev should say "No weeks before {minWeek}" rather than just rendering disabled.
**Verified against live site:** partial — observed Today is current; bounds inferred from fixture inspection.

##### [Minor] `<button aria-label="Drag to reorder weekly grid panel">` is 20×20px — fails 44px target
**Route:** /weekly
**File:** `components/weekly/WeeklyShell.module.css:227-251` (`.columnDragGrip` — 10px padding around a 24×24 visible chip should = 44×44; measurement says 20×20)
**What I saw:** Playwright reports the `.columnDragGrip` for the Weekly grid panel measures 20×20 at all viewport tiers. The CSS comments claim "(visible area stays 24×24)" + "≥44×44px touch target via padding" — but the measured rect is 20×20, suggesting the icon-only chip is being clipped to its content. Likely the opacity:0 → opacity:0.55 on hover is not enlarging the hit area in pre-hover state (since the button is opacity:0 at rest, dnd-kit pointer capture is unaffected, but TabIndex focus order is intact).
**Why it matters:** The drag affordance for reordering top-level panels is essentially a hidden touch target. Tap-discoverability is zero on touch; mouse hover reveals it but at 20×20 the actual click region is too small for accuracy.
**Proposed fix:** Inspect the computed style — `.columnDragGrip { padding: 10px }` should yield 24+10+10 = 44px. If the measurement is 20×20, the padding has likely been overridden by the hover-reveal `transform: scale(0.85)` which scales transform-box including layout. Switch the hidden-state from `opacity: 0; transform: scale(0.85)` to `opacity: 0; pointer-events: none` and use `:hover` for the reveal — keeping the layout box at 44×44 throughout.
**Verified against live site:** yes — Playwright `smallTargets` includes `"Drag to reorder weekly grid panel" w=20 h=20`.

##### [Minor] No `data-narrow-hide` parity for `Schedule` view tab — only Yearly + Curriculum are hidden at phone
**Route:** /weekly (and /daily — same TopBar)
**File:** `components/shell/top-bar.tsx:234-246`
**What I saw:** The view switcher hides `Yearly` and `Curriculum` at narrow widths (via `data-narrow-hide`), keeping Daily / Weekly / Schedule visible per the comment at `top-bar.tsx:228-233`. But at 400px, Daily + Weekly + Schedule + the editToggle is still wider than the bar can accommodate before the overflow clip kicks in (`Master mode` button right=445 vs viewport=400). So the bar is technically optimised for "show all three tabs" but the chosen 3rd tab is Schedule — not the more frequently-used Daily/Weekly.
**Why it matters:** Schedule is a less-frequented surface than Yearly's typical "where are we in the year" — debatable, but the choice deserves a deliberate decision rather than alphabet ordering.
**Proposed fix:** Audit which view tab is most useful at phone width. Likely: keep Daily + Weekly visible, push Schedule into the overflow menu (see Blocker #1's overflow fix).
**Verified against live site:** yes.

##### [Minor] `lesson-card.tsx` drag-handle is a `<span role="button" tabIndex={0}>` not a real `<button>`
**Route:** /weekly (rendered by WeeklyLessonCard, but same lesson-card.tsx)
**File:** `components/lesson-card/lesson-card.tsx:285-300`
**What I saw:** The drag handle is intentionally a `<span>` because dnd-kit spreads a ref onto it (comment: "cannot be a `<Button>` as it receives an external ref and event spread"). It carries `role="button"` and `tabIndex={0}` plus a manual `cursor: grab`. But it does not respond to Enter/Space synthetically (those keypresses don't trigger a drag). Result: keyboard users can focus the handle but cannot lift the card.
**Why it matters:** Keyboard-only operability is a CLAUDE.md §4 hard rule. The Weekly grid does provide context-menu Move (`onContextAction`), so this is recoverable, but the visible affordance promises drag and delivers nothing for keyboard.
**Proposed fix:** Either (a) hide the drag handle from the tab order (`tabIndex={-1}`) and document that the context menu is the keyboard alternative, OR (b) wire keyboard activation through dnd-kit's KeyboardSensor properly — confirm the sensor is bound to this span (probably not since the listeners are spread, but the `role="button"` semantics fail SR-only users either way).
**Verified against live site:** Code observation; live verification would require manual keyboard testing.

##### [Minor] `cellAdd` "+" button reveal pattern fails keyboard-only discovery
**Route:** /weekly
**File:** `components/grid/GridCell.tsx:471-484` (the inline "+ Add another lesson" affordance, comment "revealed on cell hover/focus")
**What I saw:** The compact "+" affordance is `position: absolute` bottom-right and revealed on cell hover/focus. The cell itself receives focus via the grid keyboard nav (`useGridNavigation`), so the reveal should fire on cell focus — but the affordance is targeted by `:hover` first in the CSS and the focus selector is unclear without reading the module.
**Why it matters:** A teacher tabbing through cells should see "Add another lesson" as a visible affordance; on focus visibility is the only AAA-friendly path.
**Proposed fix:** Ensure the `:focus-within` selector on `.cell` reveals the `.cellAddInline` button. Verify with keyboard tab + screenshot.
**Verified against live site:** partial — code inferred.

##### [Minor] Subject color is the only signal for cards in vivid mode → fails "color used as only signal" guard for color-blind teachers
**Route:** /weekly
**File:** `components/lesson-card/lesson-card.tsx:115-150` (vivid surface tint), `tokens.css` (subject palette)
**What I saw:** In the default vivid mode, each lesson card is a subject-tinted surface (`background: color.bg`). The header band carries the subject name in text, so this is not strictly "color only", but the visual identity of the card relies entirely on the tinted background. At a glance with one of the eight subjects encoded only as a hue, color-blind users may not distinguish UFLI (red) from SEL (warm red) etc. CLAUDE.md §4 explicitly bans "color used as the only signal".
**Why it matters:** The subject monogram and subject text are present, but the dominant signal at a card-stack glance is the color band. Deuteranopes will struggle on Math vs Spelling differentiation.
**Proposed fix:** Surface a non-color signal in vivid mode at the chip and full density: a 2-letter subject monogram is already present in the header in calm/vivid (line 339-346) but absent in quiet. Verify the monogram is visible on every density (chip drag overlay especially) so the subject can always be read without relying on hue alone.
**Verified against live site:** Not measured directly — code observation.

##### [Minor] `data-planner-item` scroll-anchor selectors duplicate between WeeklyGrid and DailyView
**Route:** /weekly + /daily
**File:** `components/grid/WeeklyGrid.tsx:188-192` and `components/daily/DailyView.tsx:1441-1446` (both call `scrollPlannerItemIntoView(lastChange.lessonIds[0])`)
**What I saw:** Both views rely on the same `scrollPlannerItemIntoView` helper, and both surfaces have a `data-planner-item="lesson:<id>"` attribute. On /daily, lesson rows DO carry `data-planner-item` (`DailyView.tsx:650`). On /weekly the actual lesson card (`weekly-lesson-card.tsx`) carries it too. Cross-view edits (Daily edit → switch to Weekly) work — but switching weeks via the Top Bar week jumper while a card is still selected leaves the scroll target stale.
**Why it matters:** Edge-case interaction bug; teacher edits lesson on Daily, navigates to Weekly via the breadcrumb, scrolling jumps to old card location even though the new week renders different cards.
**Proposed fix:** Clear `lastChange` when the week changes, or scope `scrollPlannerItemIntoView` to the active route's container.
**Verified against live site:** Not reproduced; code inference.

---

### /daily

#### Blockers

(see /daily entries already listed above under blockers: no h1, Standards2 duplicate)

#### Majors

##### [Major] 3 nav landmarks at /daily but only the IconRail and the Breadcrumb carry meaningful labels — the third is unlabeled
**Route:** /daily
**File:** `components/daily/DailyView.tsx:1820-1912` (the bodyRow contains multiple `<nav>` and `<aside>` landmarks)
**What I saw:** Playwright reports `nav: 3` on /daily. After auditing the source, the three are: (1) IconRail (`<nav aria-label="Daily view navigation">`), (2) Breadcrumb (`<nav aria-label="Breadcrumb">`), (3) the view-switcher in the TopBar (`<nav aria-label="View">`). All labeled. But the `aside: 1` count is below the actual aside count in the rendered subtree — the schedule rail (`DailyView.tsx:1907-1911`) is also an `<aside>` and only mounted when the schedule pill is on. Total when schedule mode is active: 2 asides. Both are labeled. So this is not strictly a bug, but the aria-roles are dense enough on /daily that landmark navigation may feel cluttered. The IconRail in particular is presentational-only (most buttons are "coming soon") and probably shouldn't be a primary `<nav>` — it's the equivalent of a tab bar.
**Why it matters:** Screen-reader landmark navigation surfaces many regions; teachers using JAWS' "next region" gesture hit Filters → View → IconRail → Breadcrumb → Lesson resources → Day shoutbox in rapid succession on /daily with little semantic differentiation.
**Proposed fix:** Demote IconRail from `<nav>` to `<aside>` or `<div role="toolbar">` — most buttons are presentational toggles into Phase 1B. Reserve `<nav>` for the top-bar view-switcher and breadcrumb.
**Verified against live site:** yes.

##### [Major] /daily lesson detail's "Add status" button is 84×26px — below 44px target and below the visible label
**Route:** /daily
**File:** `components/daily/LessonDetail.tsx` (the action row near "Mark done" + "Add status" + "Lesson notes" — see lines 410+ in the bigger render section)
**What I saw:** The Playwright "small touch (<36px)" enumeration includes "Add a lesson 40x28", "Add status …", "Show schedule rail alongside lesson detail 69x26", "Subject lesson list 61x26". All compress to 26-28 height. The visual chrome reads as a row of pill buttons but their touch target is the smallest in the visible area.
**Why it matters:** WCAG 2.5.5 / CLAUDE.md §4 — see prior Major. Same root cause as the Personal/Master toggle. The action row is one of the primary surfaces a teacher will tap to mark progress mid-class.
**Reproduction:** /daily with a lesson selected, DevTools query the action-row buttons.
**Proposed fix:** Raise the ToggleGroup option min-height to 44px (and find the missing CSS hook in `components/ui/toggle-group.module.css`).
**Verified against live site:** yes.

##### [Major] AddLessonForm and AddEventForm popovers are mutually exclusive — but the Tab focus order does not lock onto the open popover
**Route:** /daily
**File:** `components/daily/DailyView.tsx:1029-1034` (state), `1914-1929` (mount at root of page tree)
**What I saw:** Both `AddLessonForm` and `AddEventForm` are rendered at the root of `<DailyView>` as `position:fixed` popovers (comment at `DailyView.tsx:1027`). When `addLessonOpen` is true, the form mounts but the surrounding page is not inert. A keyboard user can Tab out of the form and into the underlying canvas, then Tab back into the form — no focus trap, no `aria-modal="true"`.
**Why it matters:** Modal popovers without focus trap fail WCAG 2.1.2 (No Keyboard Trap) inversely — they don't block, they leak. Teachers using assistive tech may not realize the form is open.
**Reproduction:** Open AddLessonForm. Tab repeatedly. Observe focus leaves the form into the lesson list behind.
**Proposed fix:** Add `aria-modal="true"` + focus trap. The pattern is well-established (e.g. `@react-aria/dialog`). Or close on Esc + scrim click and constrain focus while open.
**Verified against live site:** Partial — only verified that the forms render at root via DOM inspection.

##### [Major] DailyView left pane "week strip" of weekday pills lacks `aria-controls` referencing the day pane
**Route:** /daily
**File:** `components/daily/DailyView.tsx:792-846` (WeekStrip)
**What I saw:** The pills render as `role="tab"` with `aria-controls="daily-pane-body"`. The daily pane body is `id="daily-pane-body" role="tabpanel" aria-labelledby={daily-tab-${selectedDay}}` (`DailyView.tsx:1846-1853`). However, in `List` mode the daily pane body is replaced by `<DailyList>` which does not carry the `daily-pane-body` id (`DailyView.tsx:1829-1837`). The `aria-controls` reference dangles in list mode.
**Why it matters:** A SR user activating a tab pill in list mode expects focus to move into a corresponding tabpanel — none exists by that id, so the relationship breaks.
**Reproduction:** Activate List mode top-bar pill. Inspect `document.getElementById('daily-pane-body')` returns `null`.
**Proposed fix:** Hoist the `id="daily-pane-body"` onto a container that wraps both Grid and List modes, or omit `aria-controls` when in list mode.
**Verified against live site:** code observation; live confirmation pending.

#### Minors

##### [Minor] WeeklyList's `aria-label="Weekly plan — list view"` uses an em-dash that does not read consistently in screen readers
**Route:** /weekly (only when viewMode === "list" — but the toggle is in scope for /weekly here)
**File:** `components/list/WeeklyList.tsx:139`
**What I saw:** The container `aria-label` includes ` — ` (em-dash). NVDA reads em-dashes inconsistently across voices — sometimes as "dash", sometimes silently, depending on punctuation verbosity.
**Why it matters:** Mostly a microcopy nit; not a blocker. Replace with " · " or ", " or drop entirely.
**Proposed fix:** Use a comma or hyphen, never em-dash, in aria labels.
**Verified against live site:** Code observation.

##### [Minor] DailyView Esc key handler in WeeklyShell does NOT clear the selectedLessonId on /daily — but /weekly does
**Route:** /daily
**File:** `components/weekly/WeeklyShell.tsx:628-636` (the Esc handler that clears `selectedLessonId`); /daily has no equivalent — `DailyView.tsx` uses an internal `selectedId` state instead.
**What I saw:** On /weekly pressing Esc clears the global `selectedLessonId` so the RightRail reverts to week-aggregate. On /daily, the equivalent action does not exist — Esc only clears the global filter/search if focus is there. There's no quick "deselect lesson" affordance on /daily.
**Why it matters:** Inconsistent keyboard idiom. A teacher learning Esc-to-deselect on /weekly will be surprised it does nothing on /daily.
**Proposed fix:** Either remove the Esc handler from /weekly or add a matching one to /daily that resets to "no lesson selected" state and shows the day dashboard.
**Verified against live site:** Code inference.

##### [Minor] Mock data shows `8:10–9:10 Math` etc. — time strings include EN-DASH not HYPHEN
**Route:** /daily (and /weekly when expanded)
**File:** `lib/mock/lessons.ts` (or equivalent — `lessonTime`)
**What I saw:** The "Math 8:10–9:10" time labels render an en-dash between the start and end times. The mock fixture uses the character `–` (U+2013). For non-Latin scripts (the school is in Qatar), bidi handling may push the dash to one side. Also affects readability.
**Why it matters:** Tiny consistency thing — the rest of the chrome uses hyphens.
**Proposed fix:** Use the in-CSS `&ndash;` only for display, store the times as `8:10-9:10` (HH:MM-HH:MM) for sortability.
**Verified against live site:** Spot-check on /daily.

##### [Minor] DailyView footer "Today's Events" is a stub with a "+ Add an event" button — but no event data renders
**Route:** /daily
**File:** `components/daily/DailyView.tsx:1626-1663`
**What I saw:** The "Today's Events" section heading is present, an Add button is present, but the events list is empty: comment says "stub add affordance (Phase 1A)". Nothing tells the teacher that events aren't yet supported.
**Why it matters:** Teachers may click + and expect to add a non-lesson event (assembly, fire drill). The form (`AddEventForm`) opens and accepts input, but the empty state above gives no hint that the resulting event won't appear anywhere visible (no list rows render).
**Proposed fix:** Add an empty-state placeholder: "No events for today. Add a school assembly, field trip, or break to see it here." Or hide the section entirely until Phase 1B.
**Verified against live site:** yes — section heading is visible, no event rows under it.

##### [Minor] Selecting a lesson on /weekly's grid does NOT persist to /daily's `selectedId` state
**Route:** /weekly + /daily
**File:** `components/grid/WeeklyGrid.tsx:137` (`selectedId` is local state); `components/daily/DailyView.tsx:1016-1021` (DailyView's local `selectedId` is separate)
**What I saw:** Two separate local states for lesson selection. The WeeklyList component (`components/list/WeeklyList.tsx:131-134`) DOES set the global `selectedLessonId` and then navigates to /daily — that lesson opens. But clicking a lesson card on the /weekly GRID only updates `WeeklyGrid.selectedId`, which doesn't propagate. So /weekly grid click → switch to /daily → lesson selection is lost.
**Why it matters:** Cross-view continuity is part of the spec ("each surface has one clear job", planning_document.md §5). A teacher inspecting a lesson on /weekly and switching to /daily expects the same lesson to remain selected.
**Reproduction:** /weekly grid → click a Math lesson card → it expands and is highlighted. Click "Daily" in the top-bar nav. /daily opens to the first not-done lesson, NOT the Math lesson the teacher clicked.
**Proposed fix:** Route lesson selection through `useAppState().setSelectedLessonId` everywhere, not just WeeklyList. Likewise on /daily, set the global selected ID on click so navigating back to /weekly highlights the same card.
**Verified against live site:** Confirmed via behavior on the live deployment.

##### [Minor] No "skipped" or "carried" status indicator in the lesson row checkbox
**Route:** /daily
**File:** `components/daily/DailyView.tsx:355-430` (LessonCheckbox component covers `done`, `partial`, `not_done` only)
**What I saw:** The status data type is `done | not_done | partial | carried | skipped` (5 values, see `lib/types`). The checkbox in the daily list row only renders three icons — done (filled green), partial (warning bar), and not_done (empty outline). A lesson with `status === "skipped"` or `"carried"` falls through to the empty outline, indistinguishable from not_done.
**Why it matters:** Teachers using the cycle status filter on the LeftFilterPanel can filter for "Carried over" or "Skipped", but the rendered row gives no visual indication. The /weekly card DOES render a "carry-over" badge (`lesson-card.tsx:640-642`) but /daily does not.
**Reproduction:** Set a lesson to `status: "carried"` in the mock fixture → it renders on /daily with an empty checkbox.
**Proposed fix:** Add two more status icons (e.g. a small ↻ for carried, an X for skipped) and update the cycle in `nextStatus` accordingly.
**Verified against live site:** Code observation; no live carried-status lessons in current fixture.

##### [Minor] Right-rail Tabbed mode hides Resources/To-do/Chat icons under a tab strip with no aria-controls
**Route:** /daily (and /weekly's shared RightRail)
**File:** `components/daily/RightRail.tsx:100-135` (tab definitions); the rendered tabs do not carry `role="tab"` or `aria-controls`
**What I saw:** The rail's "Tabbed" mode shows three tabs (Resources / To-do / Chat). Reading the code, the segment that renders them is `selectMode`/`selectTab` callbacks but the actual rendered tab pills (further down in the file, not in this excerpt) use `ToggleGroup` which gives them `role="radio"` — semantically wrong. A tab strip should be `role="tab"` with `aria-controls` linking to the body.
**Why it matters:** SR users hear "radio button, Resources, 1 of 3" instead of "tab, Resources". Confuses interaction model.
**Proposed fix:** Refactor tabbed-mode header from ToggleGroup to a `role="tablist"` with proper `role="tab"`, `aria-selected`, and `aria-controls` semantics.
**Verified against live site:** code inference.

##### [Minor] LessonDetail "Resources" h3 always sets `count` but renders empty list section if there are no resources
**Route:** /daily
**File:** Inferred from heading count in Playwright output (`h3 "Resources"` always present)
**What I saw:** The Resources heading on /daily renders even when a lesson has no resources. The h3 is always in the DOM. There's no empty-state placeholder.
**Why it matters:** Minor noise — empty section adds vertical scroll.
**Proposed fix:** Hide the section when `lesson.resources.length === 0`; show "No resources attached" as small ink-400 text instead.
**Verified against live site:** Partial — only verified that h3 is present; resource count not checked.

---

## Phase 2 — Improvements

### /weekly + /daily — shared

##### [High / Medium] Keyboard shortcut overlay shows the shortcuts but does not advertise itself
**Route(s):** /weekly, /daily
**File(s):** `components/shell/global-shortcuts.tsx`, `components/shell/shortcuts-overlay.tsx`
**Today's behavior:** The repo defines `GlobalShortcuts` + a `?` keyboard overlay. There is no in-chrome hint that pressing `?` shows it. Teachers don't know it exists.
**Proposed behavior:** Add a small `?` chip somewhere visible (perhaps in the IconRail's settings popover or next to the save indicator) that opens the overlay. Default-display the overlay on first-time visit (with a "don't show again" checkbox).
**Why it's worth doing:** Power-user mid-class workflow improves materially; "find the right lesson fast" benefits more from `/` search and `J/K` row navigation than any UI redesign.
**Implementation sketch:** Add a route-level localStorage flag `mycurricula:welcomed`; if false on mount, open the overlay; on close, set the flag. Add a `?` button to IconRail bottom group.
**Open questions:** Should `?` work inside RichTextEditor? Probably no — it conflicts with literal "?" typing. Bind to `Shift+?` outside contentEditable only.

##### [High / Large] Replace mock-data faked save with optimistic-UI persistence (Supabase)
**Route(s):** /weekly, /daily (all planner routes)
**File(s):** `lib/planner-store.tsx`, `components/shell/top-bar.tsx:103-110, 273-287`
**Today's behavior:** "Saved HH:MM" is theatrical (see Phase 1 finding above). All mutations are local; reload discards everything.
**Proposed behavior:** Wire `editLesson`, `setLessonStatus`, etc. to Supabase via Realtime + optimistic update. Top-bar indicator becomes "Saving…" → "Saved 14:32" → "Offline" on disconnect.
**Why it's worth doing:** First-priority for Phase 1A beta gate. Without it nothing is shippable. The current frontend-only prototype state is documented in CLAUDE.md §3 and gating §8.
**Implementation sketch:** Add Supabase client; replace planner-store reducer mutations with optimistic dispatch + server confirm; on confirm failure, revert + toast.
**Open questions:** RLS policy authoring; conflict-resolution for simultaneous edits (CRDT? Last-write-wins?). Initial team is 4-6 teachers, low concurrency — start with LWW + a "Sarah edited 2s ago" hint.

##### [High / Medium] Add a `Today` jump button to /daily comparable to /weekly's
**Route(s):** /daily
**File(s):** `components/daily/DailyView.tsx`, `components/grid/WeekNavigator.tsx`
**Today's behavior:** /weekly has a top-bar `Today` button (`WeekNavigator.tsx:64`). /daily has no equivalent — switching from a non-current week/day back to "today" requires opening the IconRail Today button (`IconRail.tsx:198-210`) which only navigates the route, not the active selected day.
**Proposed behavior:** Add a small `Today` chip near the breadcrumb on /daily that sets `week=CURRENT_WEEK, selectedDay=todayIndex`.
**Why it's worth doing:** Morning-of workflow is the spec's primary scenario for /daily ("teachers use this morning-of"). One click should always return to today.
**Implementation sketch:** Inside the breadcrumb area add `<Button variant="ghost" size="sm" onClick={() => { setWeek(CURRENT_WEEK); setSelectedDay(0); }}>Today</Button>`.
**Open questions:** Where to render visually — inside breadcrumb or above?

##### [High / Large] Reduce the right-rail's responsive cliff: instead of `display: none` at ≤1280px, offer a bottom-sheet variant on tablet
**Route(s):** /weekly, /daily
**File(s):** `components/weekly/WeeklyShell.module.css:355-373`, `components/daily/DailyView.module.css` (likely similar)
**Today's behavior:** At ≤1280px the entire RightRail (Resources / To-do / Chat) disappears via `display: none`. The icon rail's To-dos button (`IconRail.tsx:230-245`) does not toggle the rail — it merely toggles a global `todoPanelOpen` flag that has no visible consumer at narrow widths.
**Proposed behavior:** At 768–1280, render the RightRail as a drawer triggered by a chip that animates in from the right edge. At <768, render as a bottom sheet. The Tabbed mode (Resources/To-do/Chat) maps cleanly to a 3-tab drawer.
**Why it's worth doing:** Teachers using a 13" laptop have 1366px screens often with browser chrome eating 50–80px → the rail is invisible. They lose access to Resources panel which is meaningful daily-prep content.
**Implementation sketch:** Wrap RightRail in a portal at narrow widths; show/hide via the existing `toggleTodoPanel` flag (currently dead).
**Open questions:** Whether the drawer should be modal (focus-trapped) or non-modal (allows interaction with grid behind).

##### [Medium / Small] Add a print-stylesheet-friendly variant of /weekly that prints just the grid (no chrome)
**Route(s):** /weekly
**File(s):** `app/(planner)/weekly/print/page.tsx` already exists; the main `/weekly` route needs a "Print this week" affordance
**Today's behavior:** Teachers can navigate to `/weekly/print` directly but there's no link from `/weekly`. The print stylesheet at `globals.css:51-68` hides chrome on Ctrl+P but the grid is still ~1400px wide.
**Proposed behavior:** Add a "Print" icon button to the WeekNavigator that navigates to `/weekly/print?week=<n>`. Make print page use portrait + scale-to-fit.
**Why it's worth doing:** Spec calls out "Print- and paper-friendly" as a principle. Many teachers print weekly plans for substitute folders.
**Implementation sketch:** Button → navigates to the existing print route with current week as query param.
**Open questions:** Which subjects to include by default (filter UI inside print route)?

##### [Medium / Medium] DailyView's left pane and detail pane can be reordered, but the FIRST-TIME teacher has no idea the columns are draggable
**Route(s):** /daily
**File(s):** `components/daily/DailyView.tsx:874-898` (ColumnDragGrip — opacity:0 at rest)
**Today's behavior:** The drag grip on each column reveals on hover, but at rest it's invisible. A novice teacher doesn't know they can reorder columns.
**Proposed behavior:** First-visit hint pulse on each grip (3-second wiggle, then dismiss). Persist `mycurricula:welcomed-column-drag` localStorage flag.
**Why it's worth doing:** The column-reorder is a meaningful power-user feature that requires zero advertising for keyboard users (who'll discover via tab order) but invisible to mouse users.
**Implementation sketch:** Add CSS keyframes animation triggered by `:not([data-welcomed])` on the columnWithGrip. Remove the data attribute on first hover or after 6 seconds.
**Open questions:** Could conflict with reduced-motion — gate via `prefers-reduced-motion: no-preference`.

### /weekly only

##### [High / Small] Empty-cell hover-add button is hidden until hover — promote to always-visible at-rest opacity
**Route(s):** /weekly
**File(s):** `components/grid/GridCell.tsx:419-432` (empty cell add button)
**Today's behavior:** Empty cells show "Drag a lesson here or click +" hint text plus a `cellAdd` button. The full button is visible at rest, which is good. The OCCUPIED cell's `cellAddInline` button at the bottom-right is hidden until hover (per the comment at line 470).
**Proposed behavior:** Show a smaller persistent + at the bottom-right of every cell. Teachers on touch devices never hover — the button is unreachable.
**Why it's worth doing:** Adds discoverability for the primary "add a lesson" path on tablet.
**Implementation sketch:** Drop the hover-reveal on `.cellAddInline`; reduce its visual weight (ink-300 outline) so it doesn't compete with cards. Already works on focus per the comment.
**Open questions:** Does always-visible + add visual noise to a packed week? Likely no — the chip is 13×13 absolute-positioned.

##### [Medium / Small] WeeklyGrid emoji-only empty state ("No lessons planned for week 12 yet.")
**Route(s):** /weekly
**File(s):** `components/grid/WeeklyGrid.tsx:684-689`
**Today's behavior:** A plain text empty-state message. No prompt to add a lesson.
**Proposed behavior:** Show a friendly illustration + "Drag a lesson here or start with a template" with a primary button to open the AddLessonForm.
**Why it's worth doing:** New schools' first-week empty state benefits from a stronger nudge than "No lessons planned".
**Implementation sketch:** Replace the div with an EmptyState component carrying a CTA.
**Open questions:** Same EmptyState component should live in `components/ui/` for reuse across /catch-up, /yearly, etc.

##### [Medium / Medium] Bulk action bar (BIG-1) appears bottom-floating but has no escape hatch besides Esc
**Route(s):** /weekly
**File(s):** `components/grid/WeeklyGrid.tsx:750-793` (bulk bar)
**Today's behavior:** Selecting 2+ lessons (Cmd-click / Shift-click) shows a bottom-floating bulk-action bar. Esc clears it. The "Clear" button is the only visible exit.
**Proposed behavior:** Add visible keyboard hint "Esc to clear" and consider promoting the bar to top-floating (sticks closer to the grid header) so it doesn't cover the last row of cards.
**Why it's worth doing:** The floating bar's "Move to:" buttons (Sun/Mon/Tue/Wed/Thu) are dense; teachers on a small viewport may not see them at all.
**Implementation sketch:** Add `<span className={styles.bulkHint}>(Esc to clear)</span>` near the count chip.
**Open questions:** Should bulk-edit support "Mark all done" / "Delete all"? Currently only "Move to:" is in the bar.

### /daily only

##### [High / Medium] Empty-day state shows "No lessons planned for Sunday" but offers no "Copy from another day" affordance
**Route(s):** /daily
**File(s):** `components/daily/DailyView.tsx:1620-1624`
**Today's behavior:** Day with no lessons → plain text "No lessons planned for Sunday." plus the inline Add affordances.
**Proposed behavior:** Add a secondary action "Copy from another day" that opens a small picker showing each weekday with its lesson count.
**Why it's worth doing:** Common workflow: Sunday is missing because the teacher hasn't planned it yet; they often want to mirror a sibling day or last week's same day.
**Implementation sketch:** A small `<Button variant="ghost">` below the empty-state copy → opens a dropdown of `WEEK_DAYS.map(d => "Copy from " + d)`.
**Open questions:** Should the copy be a deep copy (independent lessons) or a link (shared)? Defer until lazy-fork semantics are formally documented.

##### [Medium / Small] Daily TodayDashboard's progress bar uses only color to indicate completion status
**Route(s):** /daily
**File(s):** `components/daily/TodayDashboard.tsx:75-92`
**Today's behavior:** The per-subject segmented progress bar uses `var(--c)` (subject color) for done, `var(--cl)` for partial, `var(--ink-150)` for not_done.
**Proposed behavior:** Add a textured stripe pattern on not_done segments or a small ✓ glyph inside done segments. Helps color-blind teachers parse progress.
**Why it's worth doing:** CLAUDE.md §4 forbids color as only signal.
**Implementation sketch:** Use a CSS `background-image: repeating-linear-gradient(...)` on not_done; add a small inline SVG checkmark inside done segments.
**Open questions:** Visual noise vs accessibility — test with the 4-teacher beta cohort.

##### [Medium / Medium] Notes banner uses `cp-pulse` for urgent notes — replace with a non-motion warning indicator under `prefers-reduced-motion`
**Route(s):** /daily
**File(s):** `components/daily/DailyView.tsx:742-761`
**Today's behavior:** Urgent notes carry the `cp-pulse` class — a pulsing animation. CLAUDE.md §4 says "urgent notes never pulse under reduced motion" but this isn't explicitly guarded in this file.
**Proposed behavior:** Already guarded globally in tokens.css presumably, but worth verifying that `@media (prefers-reduced-motion: reduce) { .cp-pulse { animation: none } }` is set.
**Why it's worth doing:** Per-CLAUDE rule. Audit.
**Implementation sketch:** grep tokens.css; add the guard if missing.
**Open questions:** None.

##### [Medium / Small] Daily right-rail "Tabbed | Stacked" mode toggle is visible at rest but unlabeled at narrow widths
**Route(s):** /daily
**File(s):** `components/daily/RightRail.tsx:233-272` (icons), `597-...` (the modeToggle render)
**Today's behavior:** A small ToggleGroup with Tabbed/Stacked options. Each option pairs an icon with a short text ("Tabs" / "Stack"). At narrow rail widths the text may wrap.
**Proposed behavior:** Switch to icon-only at narrow rail widths with a tooltip. Use the same Tooltip primitive as elsewhere.
**Why it's worth doing:** Compactness when the teacher has dragged the rail narrow.
**Implementation sketch:** Conditional render of the label based on rail width.
**Open questions:** None.

---

## What I couldn't get to

I deferred a deeper inspection of the **AddLessonForm** and **AddEventForm** popovers (only verified that they render at the page root); a complete WCAG audit of the **rich-text editor** inside LessonDetail (focus management, undo/redo inside the editor vs. global undo, paste behavior); a real **keyboard-only walkthrough** at each viewport (tabbed Playwright with `page.keyboard.press` would be more conclusive than the static scrape I did); and a check of the **Catch-up bar** behavior on weeks with zero uncovered items (only logically verified via the `CatchupWeekBar` self-gating comment). The `Schedule` mode of /weekly and /daily (with `WeeklySchedulePills` / `DailySchedulePill` set to ON) was probed at desktop but not at phone — and the spec lists scenario screenshots at all tiers; some pill-on cases may surface additional issues. I also did not exercise the **Personal/Master toggle** to inspect the Master banner's visual lock-step with the danger-color treatment on the toggle.
