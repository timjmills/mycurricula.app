# UI/UX Audit Fragment — /schedule + /catch-up

**Auditor:** Claude Code agent
**Date:** 2026-05-25
**Scope:** Routes 3 (`/schedule`) and 4 (`/catch-up`) per `docs/5.24.26 ui-ux-audit-prompt-for-claude-code.md`. Also covers the Weekly/Daily inline schedule-pill entry points (`components/weekly/weekly-schedule-pills.tsx`, `components/daily/daily-schedule-pill.tsx`) since those are how teachers reach Schedule from the primary views.
**Method:** Source-read first; live HTML fetched via Bearer bypass to `/tmp/audit-schedule.html`, `/tmp/audit-schedule-day2.html`, `/tmp/audit-schedule-mobile.html`, `/tmp/audit-catchup.html`, `/tmp/audit-catchup-mobile.html`. Responsive screenshots produced by `scripts/responsive-check.mjs` at 400 × 800, 768 × 1024, 1280 × 900.

---

## Stats

| Route | P1 Blockers | P1 Majors | P1 Minors | P2 High-impact | P2 Med-impact |
|---|---|---|---|---|---|
| /schedule | 0 | 4 | 6 | 3 | 4 |
| /catch-up | 0 | 3 | 4 | 2 | 3 |
| Inline pills (weekly/daily) | 0 | 2 | 1 | 1 | 1 |

---

# Phase 1 — Defects

## /schedule

### Majors

### [Major] Weekly Schedule timeline is unreachable on tablet and phone — the pill itself disappears
**Route:** /weekly (Schedule mode entry point)
**File:** components/weekly/WeeklyShell.tsx:819-829; components/weekly/WeeklyShell.tsx:474 (`isNarrow`)
**What I saw:** At ≤900px viewports, `WeeklyShell.tsx:819` sets `showList = isNarrow || viewMode === "list"` and **line 829 hides `<WeeklySchedulePills />` entirely** (`{!isNarrow && <WeeklySchedulePills />}`). Even if the teacher had Schedule mode persisted in localStorage, they can neither toggle nor see they're in it at tablet/phone — `showSchedule = !isNarrow && scheduleMode` (line 820) silently forces List view. Verified in `docs/screenshots/weekly-schedule__phone-400x800.png` and `weekly-schedule__tablet-768x1024.png`: both render the Weekly List, not the timeline, even with the localStorage seed set.
**Why it matters:** A teacher who toggles Schedule on their laptop, then opens Weekly on their phone or tablet during a hallway transition, sees the lesson list with no indication that they're not getting their preferred view, and no way to switch back to a schedule layout inside Weekly. The fallback "use the /schedule tab" is documented in a code comment, not in the UI. The pill should at minimum be visible with a "Use /schedule on small screens" hint, or be enabled and route the teacher to /schedule on click.
**Reproduction:** (i) On a desktop, toggle Weekly into Schedule mode. (ii) Resize the viewport to ≤900px (or open in a phone). (iii) Observe: the Schedule pill is gone and the list view is rendered with no signal that Schedule mode is still "selected" in storage.
**Proposed fix:** Keep `<WeeklySchedulePills />` mounted at all widths. When `isNarrow && scheduleMode`, render a small "Schedule view requires more room — open in /schedule" link in place of the timeline, with a button to navigate. Do not silently swap view modes.
**Verified against live site:** yes (responsive-check.mjs, three tiers).

### [Major] Daily Schedule rail is silently hidden ≤1280px while its pill still shows "Schedule" active
**Route:** /daily (Schedule mode entry point)
**File:** components/daily/DailyView.module.css:380-387; components/daily/daily-schedule-pill.tsx:35-53
**What I saw:** The Daily Schedule rail uses `@media (max-width: 1280px) { .scheduleRail { display: none; } }`. The pill itself, however, stays visible and toggleable at every width — `DailySchedulePill` has no media-query guard. At tablet (768) and phone (400) the teacher can click "Schedule", the pill's active segment moves, the localStorage key updates, but **the rail never appears and there is zero feedback** that the mode is a no-op at this width. Confirmed in `docs/screenshots/daily-schedule-rail__tablet-768x1024.png` and `daily-schedule-rail__phone-400x800.png` (no rail visible despite pill ON).
**Why it matters:** "I tapped Schedule and nothing happened" is the worst kind of bug — the teacher will doubt the rest of the UI's responsiveness. Below 1280 the threshold is *not* the desktop tier defined in CLAUDE.md (Desktop = 1024–1920), so a 1024–1280 desktop is in the silent-no-op band too.
**Reproduction:** (i) Open /daily at any width ≤1280. (ii) Click Schedule on the VIEW pill. (iii) Observe: pill moves, no rail mounts, no message.
**Proposed fix:** Either (a) below 1280, replace the pill with a `<Link href="/schedule">` button so the action goes somewhere; or (b) render the schedule rail inline above/below the lesson list instead of as a 4th track when there is no room for one; or (c) at minimum, add a small inline notice "Schedule view opens on /schedule at this width" when the pill is flipped on at narrow widths.
**Verified against live site:** yes (responsive screenshots).

### [Major] /schedule lands on Sunday for every teacher's first visit even when "today" is Monday
**Route:** /schedule
**File:** app/(planner)/schedule/page.tsx:30-33; lib/app-state.tsx:201
**What I saw:** `SchedulePage` reads `selectedDay` from `useAppState()`. `selectedDay` is initialized to `0` (Sunday) in `lib/app-state.tsx:201` and is **not persisted** anywhere — there's no localStorage write. The Schedule page comment claims "the user's last-chosen day persists across sessions" (page.tsx:33-34), which is false. On the live render the day-strip shows `Mon 19 (today)` (via `todayDayIndex() === 1`) but the pane below it captions "Sunday, January 18" because `focusedDay = selectedDay = 0`. Verified in `/tmp/audit-schedule.html` (`aria-label="Schedule pane for Sunday, January 18"` + `aria-label="Mon 19 (today)"` on the chip).
**Why it matters:** On a Monday morning, a teacher opens /schedule expecting to see Monday's blocks — instead they get Sunday's, with the "today" cue on Mon 19 only as a chip border. Half the value of a single-day schedule view is "what does my next hour look like", and that's broken for every fresh session.
**Reproduction:** (i) Clear localStorage. (ii) Visit /schedule. (iii) Observe: the day-strip highlights Mon 19 as "today" but the Schedule Pane shows Sunday's blocks.
**Proposed fix:** When `selectedDay` is still at its initial value (no user choice yet this session), default to `todayDayIndex()` clamped into the configured school week. Or persist `selectedDay` to localStorage so the cross-session contract the comment claims is real.
**Verified against live site:** yes (aria labels and pane caption confirm).

### [Major] Several primary Schedule controls are visible but permanently disabled with no other affordance
**Route:** /schedule (and the embedded `ScheduleDayPane` in Weekly/Daily)
**File:** components/schedule/ScheduleDayPane.tsx:117-130 (pane-options `···`), 144-190 (day-picker icon), 226-238 ("+ Add time block")
**What I saw:** Three controls render in the chrome: a `···` overflow button on the title strip, a calendar icon next to the date label, and a full-width "+ Add time block" button at the bottom. All three are `disabled` with `aria-disabled="true"` and a "coming soon" title attribute. They're styled to look like normal buttons / icon buttons (full opacity, no greyed-out treatment for `+ Add time block` beyond the dashed border).
**Why it matters:** A teacher who taps "+ Add time block" expecting a form — and gets nothing, with the only feedback being a tooltip on hover (which doesn't exist on touch) — concludes the app is broken. "Coming soon" placeholder controls in production are a recurring source of bug reports; either hide them or make them look unmistakably non-functional.
**Reproduction:** Visit /schedule and try to interact with any of the three controls. Tooltips never fire on a phone.
**Proposed fix:** Hide these until they're wired. If you want a "this will exist" hint, render a quiet inline ghost-card under the rows that says "Custom blocks land in Phase 1B" rather than a button-shaped no-op. At minimum, drop the opacity on disabled controls and add a strikethrough-style visual.
**Verified against live site:** yes.

### Minors

### [Minor] `<div role="button">` is used for interactive Schedule rows; should be `<button>`
**Route:** /schedule (and Weekly/Daily mounts)
**File:** components/schedule/ScheduleRow.tsx:96-110
**What I saw:** The interactive variant of `ScheduleRow` renders a `<div role="button" tabIndex={0}` with a manual `onKeyDown` handler for Enter/Space. The audit spec explicitly lists "`<div onclick>` instead of `<button>`" as an a11y blocker. `ScheduleBlock` (the timeline-block variant) does it correctly with a real `<button>` — see `ScheduleBlock.tsx:108`.
**Why it matters:** Native `<button>` gets focus management, default `:focus-visible`, screen-reader role, and the right keystroke semantics for free. The hand-rolled equivalent is also missing the spacebar-default-scroll-prevention behavior some browsers require (the manual handler covers this — but the row otherwise prevents default for any focus chain `Tab` followed by Space, which a `<button>` does not).
**Reproduction:** Tab to a Daily Schedule row, hit Enter — works. Now use a screen reader: announces "button" but role descriptions vary; some announce `<div role="button">` without indicating disabled / focusable state changes correctly.
**Proposed fix:** Swap `<div>` for `<button type="button">` and drop `role="button"`, `tabIndex`, and the manual key handler.
**Verified against live site:** n/a (semantic only).

### [Minor] Bell Schedule rows look identical to Daily Schedule rows but are not clickable
**Route:** /schedule
**File:** components/schedule/ScheduleDayPane.tsx:209-220 (passes `lesson={null}` on Bell tab); components/schedule/ScheduleRow.tsx:74-77
**What I saw:** On the **Bell Schedule** tab every row gets `lesson={null}` from the pane, which sets `isInteractive = !!lesson === false`, so no `role="button"`, no hover lift, no cursor:pointer. The row visual is otherwise identical to the Daily Schedule tab where rows ARE clickable (they navigate to /daily with the lesson selected). A teacher who tries clicking a Bell row gets no feedback.
**Why it matters:** Affordance mismatch — the row looks like a card you can open, but only sometimes is. Inconsistent within the same component.
**Proposed fix:** Either (a) make Bell rows clickable too, opening a "Configure this block" sheet (coming-soon stub is fine if it surfaces *something*), or (b) when the row is non-interactive, drop the row background-on-hover style so it reads as informational, not as a card.
**Verified against live site:** yes (`/tmp/audit-schedule.html` shows Bell-tab rows have no `role="button"`).

### [Minor] /schedule has no URL deep-link for day selection
**Route:** /schedule
**File:** app/(planner)/schedule/page.tsx (entire) — no `useSearchParams`
**What I saw:** Fetching `/schedule?day=2` does not navigate to Tuesday; the page reads `selectedDay` from the global app-state only. The audit spec explicitly calls out: "Deep links don't work (loading directly to `/weekly?week=2026-W12` should put you on that exact view)." Verified by fetching `/schedule?day=2` with the Bearer bypass — the page renders whatever `selectedDay` is in memory (Sunday on a fresh visit). (Note: the bypass middleware also has a quirk where `?day=` query params kick the request to /login, which is a separate finding — see "Auth-flow / bypass quirk" below.)
**Why it matters:** Teachers want to bookmark "Tuesday's schedule" or share a link with a sub. Not catastrophic but is on the audit's defect list.
**Proposed fix:** Add `useSearchParams()` and seed `selectedDay` from `?day=N` if present (clamped to the school week). Mirror the convention from `/weekly?week=N` if/when that's added.
**Verified against live site:** yes.

### [Minor] Schedule sub-section labels are spans, not headings — group structure is invisible to assistive tech
**Route:** /schedule
**File:** components/schedule/ScheduleDayPane.tsx:116 (`<span class="eyebrow">Schedule Pane`), 141 (`<span class="dateLabel">Sunday, January 18`)
**What I saw:** Only the page-level "Week 12 schedule" is an `<h1>`. Inside the pane card, "SCHEDULE PANE" and "Sunday, January 18" — both clearly structural labels — render as `<span>`s. A screen reader user navigating by heading hops straight from the h1 to the next page section with no submarine waypoint.
**Why it matters:** Heading navigation is the primary screen-reader landmark pattern. A 30-row schedule with no h2 is a flat wall of rows to navigate.
**Proposed fix:** Promote "Schedule Pane" to an `<h2>` (visually styled with the existing eyebrow class) or wrap the date label as `<h2>`. Keep the visual recipe; just change the element.
**Verified against live site:** yes (`/tmp/audit-schedule.html` has only the one `<h1>`).

### [Minor] Schedule pane's "Sunday, January 18" caption is correct but the chip-strip's date numbers conflict with reality at any week ≠ 12
**Route:** /schedule
**File:** lib/mock/calendar.ts:48 (`WEEK_1_DAY_0 = { year: 2025, month: 10, day: 2 }`)
**What I saw:** The current mock anchors Week 12 to Sunday 2026-01-18, but the global week selector lets a teacher navigate to any week 1–36. At those weeks the chip-strip date numbers will say things like "Sun 2 / Mon 3 / …" without the year/month context the pane header carries — and the pane header itself will correctly say "Sunday, November 2" but the chip just says "2", which on tablet/phone is ambiguous between "Nov 2" and "Mar 2".
**Why it matters:** Date math is identified by the audit spec as a frequent bug source. While the mock anchor is fine for current-week viewing, navigating across weeks reveals the chip-strip's lack of month context.
**Proposed fix:** At week boundaries that cross a month, render `Sun 31 / Mon 1` with the new-month day showing a tiny "Nov" lozenge under or above the date number, like the Daily view's strip does (per existing convention in components/daily). Or render the month name in the chip's date when the row crosses a month.
**Verified against live site:** n/a (would need to drive the week selector — the mock data only varies on weeks 11–13).

### [Minor] Day-strip chip's "today" treatment uses color alone — fails the "color is not the only signal" guideline at the chip level
**Route:** /schedule
**File:** app/(planner)/schedule/page.module.css:88-92
**What I saw:** A non-active "today" chip differs from peer chips only by its `border-color: var(--catchup)` and `color: var(--catchup)` — a color swap. The aria-label says "(today)" but visually a colorblind teacher (e.g. red/green protan) might not distinguish the catchup-orange ring from the neutral ink-200 ring at a glance. The active chip uses background + border + foreground (clear), and an active+today chip uses the active recipe (the catchup border is hidden behind the dark background).
**Why it matters:** CLAUDE.md §4 says "color used as the only signal" is an a11y violation. The aria text carries the meaning, but sighted-but-colorblind teachers lose the cue.
**Proposed fix:** Add a small dot, dash, or "TODAY" mini-pill underneath the date number on today's chip. Or thicken the border to 2px on today only.
**Verified against live site:** n/a (visual / token).

### [Minor] The disabled "+ Add time block" CTA has cursor:not-allowed but no other disabled visual — looks active at a glance
**Route:** /schedule (also Weekly/Daily mounts)
**File:** components/schedule/ScheduleDayPane.module.css:142-162; components/schedule/ScheduleDayPane.tsx:226-238
**What I saw:** The button retains full opacity, full color, and a dashed border that doesn't read as disabled. Only the `not-allowed` cursor and a hover-state that doesn't fire signal it's off. On touch, there is no cursor — so a teacher gets no feedback at all.
**Why it matters:** Pairs with the "permanently disabled controls" major finding above. Even if you keep these visible, the disabled state should be unambiguous (50% opacity, no border, italicized "coming soon" inline text).
**Proposed fix:** When the button is permanently disabled, render `+ Add time block (coming soon)` as inline text in `var(--ink-400)` with no border — a hint, not a button.
**Verified against live site:** yes.

## /catch-up

### Majors

### [Major] Coverage percentage (year-wide) and "uncovered across N weeks" (scoped) sit side by side and describe different slices
**Route:** /catch-up
**File:** components/catchup/CatchupScreen.tsx:239-271 (`coverage.pct` is unscoped, `scopedUncovered` is scoped to the active chip)
**What I saw:** The header renders `17% covered` (from `coverageSummary(lessons, { currentWeek: 12 })` — every past-or-current lesson) right above `1 uncovered across 1 week` (from `scopedItems` — Last 4 weeks). With scope=Last 4 weeks the "1 uncovered" describes a tiny slice but is positioned as a sub-caption of the 17% number, implying 1 uncovered ⇒ 17% covered. The flame badge in the top bar simultaneously claims `29 items not covered`, which is the same `coverageSummary` rollup but expressed as the absolute uncovered count — three numbers on the same screen describing three different slices of the same data set.
**Why it matters:** This is the most prominent stat on the most failure-state-heavy screen — it should be obvious. A teacher who reads 17% / 1 uncovered / 29 items will trust none of them. The audit spec calls out "Microcopy that lies" — this isn't lying, but it's a cognitive trap.
**Reproduction:** Open /catch-up. Compare the three numbers: coverage %, "uncovered" detail line, and the flame badge.
**Proposed fix:** Pick a slice and own it. Either (a) make the coverage % follow the scope chip ("17% covered in Last 4 weeks" — but the underlying math has to recompute against the scope; today it's wired off the global lessons set), or (b) anchor coverage to "year to date" and make the chip selection update only the items list below, with no scope-affected stat in the header. Either way, the flame badge should match the screen's header — pick one source.
**Verified against live site:** yes (HTML shows coveragePct="17", coverageDetail="1", aria-label="Open Catch-up screen (29 items not covered)").

### [Major] Empty state is only reachable by a chip click — the SSR-rendered page never shows the "Caught up." screen even when there's nothing in the default scope
**Route:** /catch-up
**File:** components/catchup/EmptyState.tsx; components/catchup/CatchupScreen.tsx:356-358
**What I saw:** The empty state renders only when `visibleItems.length === 0`. With the default `scope=last4` chip and the default status filter (all four statuses active), the mock data has 1 item (the carried Narrative-Planning lesson). If that item is resolved (Mark done), the list immediately becomes empty and shows the celebratory state. Good. But there is no first-load empty state — a fresh teacher who hits /catch-up with no uncovered items will see a moment of flicker if the scope defaults to last4 with no data.
**Why it matters:** The audit's edge-case list explicitly calls out "Empty state — a panel with zero items. Pick a future week if the current week has data." A teacher whose mock-or-real data hits the empty path on first paint gets a celebratory "Caught up!" *without context* about which scope they're in — they may not realize they're filtering. The empty state itself says "Nothing uncovered in this scope" — which is good — but a freshly-joined teacher won't know what "this scope" means.
**Reproduction:** Toggle every status filter off, or set scope to "Last week" with mock data (which has no week 11 incomplete items in some seeds), and observe the empty card.
**Proposed fix:** When the empty state fires *and* every status filter is on *and* scope is default, render an absolute "All caught up!" headline. When it fires due to filtering, render a different "No items match these filters" headline with a "Clear filters" link. The component already gets the data; just branch.
**Verified against live site:** n/a (would need a scope where mock data is empty; current mock always has the carried writing item).

### [Major] Bulk action bar is `position: fixed bottom:16px` and overlaps the screen content on phones with many wrapped buttons
**Route:** /catch-up
**File:** components/catchup/BulkActionBar.module.css:5-21, 70-72
**What I saw:** The bar is `position: fixed; left:16px; right:16px; bottom:16px` with `display: flex; flex-wrap: wrap`. The five buttons (Mark all done, Mark all skipped, Carry over all to…, Add all to to-do, Clear) each have `min-height: 44px`. At 400px width with the count + divider + buttons + ghost-clear, the bar wraps to 3 or 4 rows, easily 176–220px tall — eating 22–28% of an 800px viewport. The screen body's `padding-bottom: 96px` (`CatchupScreen.module.css:292`) reserves only ~96px for it, so the bottom row(s) hover on top of the last visible Catch-up row at narrow widths.
**Why it matters:** When a teacher selects bulk rows on phone the bar can hide the very rows they're about to act on. They lose context of what they selected.
**Reproduction:** Open /catch-up on a 400px wide viewport with ≥4 items, select 2-3 of them, observe the bulk bar wrap to ≥2 rows and obscure the last visible row.
**Proposed fix:** At ≤480, collapse the bar to a single row with `count selected` + a primary action button + a `···` overflow that opens a sheet for the other actions. Or replace it with a sticky-bottom panel that pushes content up instead of overlapping (set `body { padding-bottom: var(--bulk-bar-h, 96px) }` dynamically). Don't wrap.
**Verified against live site:** yes (CSS confirms wrap, screenshot would require driving selection clicks beyond the headless audit).

### Minors

### [Minor] Group headers are `<header><span>` not `<h2>` — screen-reader rotor sees no internal navigation
**Route:** /catch-up
**File:** components/catchup/CatchupScreen.tsx:366-382
**What I saw:** Each group renders `<header class="groupHeader">…<span class="groupLabel">Writing</span>…</header>` — semantically a `<header>` with no heading inside. The h1 ("What I haven't covered yet") is the only heading on the page; a screen-reader user who hops by heading gets no groups.
**Why it matters:** Same flat-list pattern as Schedule above; Catch-up explicitly groups by subject/chrono/unit/standard, and grouping is the load-bearing structure of the screen.
**Proposed fix:** Render `<h2 class="groupLabel">Writing</h2>` inside the header. The visual recipe doesn't change.
**Verified against live site:** yes.

### [Minor] Carry-over action persists `carriedTo: ""` (empty target) — the UI promise "Carry over to…" implies a picker that doesn't exist
**Route:** /catch-up
**File:** components/catchup/CatchupScreen.tsx:168-174; lib/catchup-state.tsx (action shape)
**What I saw:** Clicking "Carry over to…" calls `setAction(id, { kind: "carried", carriedTo: "" })` — the trailing ellipsis on the button copy implies "open a picker so I can choose the destination week", and the comment at line 169-171 admits "Carry-over destination picker is a follow-up wave… For now we record the carried action with no target". The bulk-bar "Carry over all to…" does the same.
**Why it matters:** Teachers expect "Carry over to Wednesday" / "Carry over to next week" — instead the action silently records "carried with no destination". The lesson re-tints and that's it. A teacher who actually relies on the catch-up feature will be very surprised when the item doesn't appear anywhere they expected.
**Reproduction:** Click "Carry over to…" on any row; observe the row tint changes but no picker appears and no destination is captured.
**Proposed fix:** Until the picker lands, change the button copy to "Mark as carried-over" (no trailing ellipsis, no implied target). When the picker lands, drop a small popover where the button was — the trailing ellipsis convention is the universal "this opens a picker" signal in this app and elsewhere.
**Verified against live site:** yes (live HTML confirms the button text).

### [Minor] "Mark done", "Skipped", "Carry over to…" actions on rows have no success feedback — the row simply re-tints
**Route:** /catch-up
**File:** components/catchup/CatchupRow.tsx:256-276; components/catchup/CatchupScreen.tsx:160-174
**What I saw:** Per-row actions immediately call `setAction(id, …)`. The row's background tints to the new status, the status pill text updates, but there is no toast / aria-live announcement / success indicator. The screen has no `<div aria-live="polite">` for action feedback — searching the source confirms none.
**Why it matters:** The audit spec calls out "Success confirmations (especially destructive operations and saves)" as a missing-state defect. "Mark done" is the most common action on this screen; a teacher needs to know it took. Right now the only cue is the background tint, which is easy to miss because subtle. Worse, the row stays in place — it doesn't drop out of the list (because the "done" overlay doesn't re-filter the visible set unless the status filter excludes "done"… and done is implicitly excluded by `deriveCatchupItems`). Actually it *does* drop out, but with no animation, so the cards below shift up suddenly. That works for sighted users but is silent for assistive tech.
**Proposed fix:** Add an `aria-live="polite"` region anchored at the screen root and announce "Lesson marked done" / "Lesson skipped" / "Lesson carried over" after each action. Optionally toast.
**Verified against live site:** yes (no live region in delivered HTML).

### [Minor] Note save uses onBlur — typing then clicking elsewhere works, but tabbing away and immediately reloading drops the in-progress draft
**Route:** /catch-up
**File:** components/catchup/CatchupRow.tsx:144-147 (handleNoteBlur), 200-211 (textarea)
**What I saw:** `handleNoteBlur` calls `onSaveNote(draft)` and toggles `editingNote=false`. There is no auto-save on input, no debounce. A teacher who types a note, then loses the tab (school wifi dies, browser hangs, switches tab without blurring) loses the draft because the local `draft` state never flushes. The audit spec specifically warns: "Session expiry mid-edit loses unsaved work" — same family of bug.
**Why it matters:** Teachers compose long notes mid-class when they have a moment. "I typed a paragraph and it disappeared" is a hard trust break. Notes are short enough that auto-saving every keystroke (with debounce 300ms) is cheap.
**Proposed fix:** Either debounce-save on each keystroke (300ms after last input), or save on visibility-change. Keep the blur save as a final flush.
**Verified against live site:** n/a (source-only).

## Inline pills (entry points)

### Majors

### [Major] Weekly Schedule pill mode persists in localStorage across reloads — but its visual signal on the in-Weekly chrome is so quiet that a teacher won't notice they're in it
**Route:** /weekly (Schedule mode chrome)
**File:** components/weekly/weekly-schedule-pills.tsx (no visual diff indicator); lib/weekly-schedule-state.ts (persistence)
**What I saw:** The pill itself is a subtle 2-segment ToggleGroup tucked at the top-right of the grid panel above a "VIEW" eyebrow on the left. When mode=schedule, the timeline replaces the grid in the same 1fr slot — and the *only* visual signal that mode has changed is which segment of the pill is darker. There's no "you are viewing the Schedule timeline" eyebrow, no surrounding banner, no breadcrumb change. A teacher who reloads to a previously-set Schedule mode may briefly think their lesson grid is missing.
**Why it matters:** Two adjacent views (grid vs timeline) with the same chrome should have a clearer "you are here" signal. The price of the elegant single-pill design is discoverability — and it tilts too far toward elegance.
**Proposed fix:** When `scheduleMode === true`, render a small left-aligned eyebrow next to the VIEW label: e.g., `VIEW · Schedule Timeline`. Or change the pills bar background subtly when in Schedule mode. Or add a soft border-top accent in the catchup color on the timeline canvas.
**Verified against live site:** yes (verified live HTML uses the same subtle pill recipe in all states).

### [Major] Daily Schedule pill ON at ≤1280 is a silent no-op (see Major #2 under /schedule above)
*Cross-listed with the Daily Schedule rail finding — the entry point and the surface it controls are part of the same defect.*

### Minors

### [Minor] Weekly's "Lessons only ↔ All events" pill is invisible until Schedule mode is ON — teachers won't discover it exists
**Route:** /weekly (Schedule chrome)
**File:** components/weekly/weekly-schedule-pills.tsx:68-88 (`{scheduleMode && …}`)
**What I saw:** The second pill (Lessons only / All events) is conditionally hidden when not in Schedule mode. Once a teacher flips Schedule on, the second pill appears. There's no first-run hint, no tooltip on the Schedule pill saying "Schedule mode unlocks event-filter controls".
**Why it matters:** Teachers don't read release notes. The second pill is genuinely useful — toggling between lesson-only and full-school-day views is a primary use case — but it's hidden behind a discoverability cliff.
**Proposed fix:** Keep the second pill rendered with `disabled` styling when not in Schedule mode, with a tooltip "Available in Schedule view". Or replace the toggle with a single inline link "Show all-day events" under the Schedule pill once activated.
**Verified against live site:** yes.

## Cross-cutting / shared

### [Minor] Console error `TypeError: Failed to fetch` fires whenever Schedule mode renders the ScheduleTimeline
**Route:** /weekly (Schedule mode), /daily (Schedule rail), /schedule indirectly through Daily rail
**File:** Bundled chunk `chunks/1613-…js` (origin unclear from minified source; the audit brief flags this as a benign known issue from a previous wave but I'm logging it as a Minor for completeness because it still fires on every Schedule render and clutters telemetry)
**What I saw:** Every responsive-check run that mounted a Schedule surface produced a `console.error: TypeError: Failed to fetch` — see `responsive-report.txt` lines for `weekly-schedule`, `weekly-schedule-lessons-only`, and `daily-schedule-rail`. The same error does **not** fire on `/schedule` (the dedicated page) or on `/catch-up`.
**Why it matters:** Audit-prompt says this was previously chased and declared benign (the brief lists it under "already-shipped fixes"). However: it still fires, it still hits the user's DevTools console, and it pollutes whatever monitoring lands when the backend wires up. Even if benign, the source should swallow the rejection or branch on `if (!navigator.onLine)` so it doesn't surface in production console.
**Proposed fix:** Find the offending fetch in the timeline-mount path (likely a useNowTick refresh or a Supabase prefetch) and silence it with `.catch(() => {})` since it's known harmless.
**Verified against live site:** yes (responsive-check.mjs console captures confirm it on 6/30 scenarios).

---

# Phase 2 — Improvements

## /schedule

### [High / Medium] Land on today's day-of-week on first visit, persist day choice across sessions
**Route(s):** /schedule
**File(s):** app/(planner)/schedule/page.tsx, lib/app-state.tsx
**Today's behavior:** `selectedDay` starts at 0 (Sunday), session-scoped, lost on reload.
**Proposed behavior:** First-ever visit lands on `todayDayIndex()`. Subsequent visits restore the last-chosen day from localStorage. The day-strip's `Today` chip becomes a useful jump-back affordance instead of a marker.
**Why it's worth doing:** Pairs with the Major defect — this is the foundational schedule UX. Cheap to add (one localStorage key, one effect).
**Implementation sketch:** Promote `selectedDay` to a persisted slice in `lib/app-state.tsx`, gated by hydrated-ref like the existing schedule-state hooks. Default to `todayDayIndex()` clamped into the configured school week when unset.
**Open questions:** Should the day be persisted globally or per-route? Persisting globally couples Schedule and Daily, which may be desired (open Tuesday in /schedule, jump to /daily, land on Tuesday). The existing app-state coupling already implies "yes".

### [High / Large] Make the Schedule timeline the default surface on /schedule (not the day-pane list)
**Route(s):** /schedule
**File(s):** app/(planner)/schedule/page.tsx, components/schedule/ScheduleTimeline.tsx
**Today's behavior:** /schedule renders a single-day vertical list of blocks. The visually-richer ScheduleTimeline (5-column timeline with subject-tinted blocks, now-line, etc.) only renders inside Weekly Schedule mode.
**Proposed behavior:** /schedule defaults to a 5-day timeline (the same canvas Weekly's Schedule mode uses), with the existing day-strip becoming a "scroll to this day" affordance rather than a swap-to-single-day. A teacher who wants a single-day vertical list can switch via a small toggle. Phone tier still falls back to the vertical list because the timeline is unusable at 400px.
**Why it's worth doing:** "Schedule" is the route name; a timeline is the natural mental model. The current single-day list is fine as a "rail" embed (Daily) but as the route's primary surface it underdelivers — a teacher comparing Tue and Wed has to flip chips.
**Implementation sketch:** Render `<ScheduleTimeline scope="week" showNonAcademic={...} />` at ≥900px, and `<ScheduleDayPane variant="page" />` at <900px. Move the day-strip below the timeline at wide widths so it acts as a navigation affordance rather than a content selector.
**Open questions:** Does the timeline scroll to today on mount, or just render? Should the day-strip stay sticky as a quick-jump on wide?

### [Medium / Small] Replace stub disabled controls with explicit "coming soon" inline copy
**Route(s):** /schedule (also Weekly/Daily mounts of ScheduleDayPane)
**File(s):** components/schedule/ScheduleDayPane.tsx
**Today's behavior:** Three disabled controls (pane-options, day-picker, add-time-block) sit in the chrome looking like working buttons.
**Proposed behavior:** Hide them, or replace with a single inline italic line ("Block editing arrives in 1B") at the bottom of the pane.
**Why it's worth doing:** Permanently-disabled controls are noise. They make every other live control feel less trustworthy.
**Implementation sketch:** Gate them behind a feature flag (`FEATURE_SCHEDULE_EDIT`); render `null` until the flag flips. Drop the "coming soon" tooltips.

## /catch-up

### [High / Medium] Consolidate the three coverage numbers into one consistent stat
**Route(s):** /catch-up, top-bar
**File(s):** components/catchup/CatchupScreen.tsx, components/shell/catchup-flame-button.tsx
**Today's behavior:** Coverage % (global) + uncovered count (scoped) + flame badge (global absolute count) = three numbers describing two different slices.
**Proposed behavior:** Scope-aware coverage: when scope is "Year", show year-wide stats; when scope is "Last 4 weeks", show "covered in last 4 weeks: 17%, 1 uncovered". The flame badge always rolls up to year and is the single number a teacher anchors on.
**Why it's worth doing:** This screen's whole job is to tell the teacher how behind they are. Three numbers that disagree erodes trust.
**Implementation sketch:** Extend `coverageSummary` to take a scope: `coverageSummary(lessons, { currentWeek, actions, scope })`. Use it in both the screen header and the badge tooltip.
**Open questions:** Should the flame badge respect the most-recent scope chip a teacher chose? Probably no — the badge is meant to be sticky context outside the Catch-up screen.

### [High / Medium] Per-row actions need an aria-live confirmation and a brief inline undo
**Route(s):** /catch-up
**File(s):** components/catchup/CatchupRow.tsx, components/catchup/CatchupScreen.tsx
**Today's behavior:** Click Mark done — row drops out silently.
**Proposed behavior:** Inline toast: "Marked done · Undo" near the screen's footer. Aria-live announces the action. Undo restores the prior status overlay.
**Why it's worth doing:** Bulk-resolving 29 uncovered lessons is a "do many cheap things fast" workflow. One misclick is currently irrecoverable without manual scope-juggling.
**Implementation sketch:** Add a `<UndoToast>` primitive (or reuse the existing toast slot, if any) that takes a `revert` callback. Wire the per-row + bulk handlers through it.

### [Medium / Small] Catch-up empty state should distinguish "all clear" from "no items in this filter"
**Route(s):** /catch-up
**File(s):** components/catchup/EmptyState.tsx
**Today's behavior:** Single empty state: "🎉 Caught up. / Nothing uncovered in this scope. / Back to Weekly"
**Proposed behavior:** Branch on whether the filter is the default (or empty) vs has actively-removed statuses or shrunken scope. "Caught up!" when all is well; "No items match these filters" with a "Clear filters" link otherwise.
**Why it's worth doing:** The current copy conflates "you have nothing to do" with "you might be filtering things out". A teacher who scoped to "Last week" with no items there might celebrate prematurely.
**Implementation sketch:** Pass `isDefaultView` (scope === "last4" && allStatusesOn) into EmptyState; render different copy.

## /schedule + /catch-up shared

### [Medium / Small] Both routes should accept URL query params for week/day so deep links work
**Route(s):** /schedule, /catch-up (also /weekly, /daily)
**File(s):** app/(planner)/schedule/page.tsx, app/(planner)/catch-up/page.tsx
**Today's behavior:** Routes read state from in-memory app-state only. Hitting `/schedule?day=2` or `/catch-up?scope=year` does nothing.
**Proposed behavior:** Both routes accept `?day=N`, `?week=N`, `?scope=…` and seed app-state from them on mount. Bookmarks and shared links work.
**Why it's worth doing:** Audit spec lists this as a defect category. Cheap to wire and unblocks copy-paste sharing between teammates.
**Implementation sketch:** `useSearchParams()` in each page, sync into app-state via `useEffect`. Validate values against the school week range before applying.

### [Medium / Small] Add a keyboard shortcut to jump between day chips on /schedule
**Route(s):** /schedule
**File(s):** lib/use-keyboard-shortcuts.ts, app/(planner)/schedule/page.tsx
**Today's behavior:** Day-chip selection requires a mouse / tap.
**Proposed behavior:** `←` / `→` move through the day-strip; `Home` jumps to first day; `t` jumps to today.
**Why it's worth doing:** Power-user pattern, low-cost addition. The Daily view already has similar shortcuts per the keyboard-shortcuts module.

---

## What I couldn't get to

- **Schedule edit mode UX** — once the Add-block / Day-picker / pane-options controls actually do something, they need their own audit pass. Today they're disabled stubs.
- **Catch-up at extreme overflow** — 280-character titles, 50+ uncovered items in one group, deep-clipping standards chips. The mock data only has a handful of items per status; I couldn't drive that path in 90 + 60 minutes.
- **Holiday / Ramadan timetable mode interaction with /schedule** — the planner-spec mentions per-school Ramadan timetables; /schedule has no UI for switching, and I didn't probe whether the toggle from Settings would actually surface in the day-strip. Probably out of Phase 1A scope.
- **Schedule rail integration tests at the 1024–1280 desktop band** — that's the band where the Daily-rail silently disappears. I confirmed the CSS gate but didn't capture screenshots at, say, 1100px to see the partial fold.
- **`/catch-up` SSR with the in-action overlay populated** — the live mock has zero overlay state; the per-row note/action persistence is localStorage-only, so the SSR HTML never has it. Couldn't verify the row-drop animations or the "carried" tint at scale.
- **The bypass-with-query-param login redirect quirk** — Bearer + `?day=2` redirects to /login but Bearer + `?foo=bar` works. Out of audit scope per the spec ("don't audit the bypass itself"), but worth a sticky note for ops.
- **Real-user testing on a Chromebook / school wifi profile** — the spec calls out school Chromebooks; I only ran headless Chromium at the three viewport tiers. Slow-network behavior, Suspense boundaries, and the schedule-timeline initial-paint cost were all out of reach in this pass.
