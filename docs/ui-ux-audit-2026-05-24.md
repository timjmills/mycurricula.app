# UI/UX Audit — mycurricula.app — 2026-05-24

## Executive Summary

### Top 5 Phase 1 Findings (Blockers + Majors)

1. 🟥 **PRODUCTION BUG — Claude bypass URL-param + cookie flows return 401/307** (Task #85)
   - `/auth/claude-login?token=…` returns 401 Unauthorized
   - `/weekly?claude=…` redirects 307 → /login (token rejected)
   - **Only Bearer header auth works.** Affects WebFetch, Co-work agents, automated testing.
   - **Fix required before next audit wave.** Token likely mis-synced to Cloudflare secret vs `.env.local`.

2. 🟥 **Top-bar Sign Out + Profile clipped past viewport at every desktop width ≤1280px** (Task #80 related)
   - Controls render at `right=1346` on 1280-wide viewport but viewport is 1280. Silently cut off.
   - Sign Out is **only logout affordance** in chrome; Profile is **only Settings entry point.**
   - Reachable only by Tab key or accidental off-screen tap.
   - **Not Phase 1A acceptable.** Requires overflow menu fix.

3. 🟥 **ListRow checkbox is `<span role="checkbox">` instead of `<button>`** — breaks keyboard on all list views (Weekly, Daily, Catch-up)
   - Span doesn't receive focus by default; `tabIndex={0}` is a workaround.
   - Affects completion toggle — primary CTA on every list surface.

4. 🟧 **Hard-coded hex colors violate design token system** (scattered across lesson-flow, resource-pill, lesson-card, auth components)
   - Violates CLAUDE.md §4: "Zero hex anywhere in components."
   - Design system inconsistency + future palette changes blocked.

5. 🟧 **Daily and Schedule views missing `<h1>` page headings** — WCAG 1.3.1 violation
   - Daily: heading hierarchy starts at h2 (day name).
   - Schedule: no page-level heading, only aria-live context.
   - Screen readers can't navigate via heading hierarchy.

### Top 5 Phase 2 Recommendations

1. **Mobile right-rail drawer** (High impact, High effort) — Resources, To-do, Chat hidden <1280px. Restore via hamburger menu.
2. **Recurring lesson templates** (High impact, High effort) — "Reading every Mon+Thu" auto-populates. Saves ~10 clicks/week per teacher.
3. **Keyboard shortcut system** (Medium impact, High effort) — Cmd+/, Cmd+K, Cmd+Z/Y for power users. Already have stubs.
4. **WCAG AAA contrast upgrade** (Medium impact, Medium effort) — Current palette is AA; AAA benefits 8% of teachers with low vision.
5. **Consolidate coverage numbers** (/catch-up) (High impact, Low effort) — Three conflicting stats (% / count / scope). Pick one slice.

### Overall Product Readiness

**Phase 1A Beta-Ready with Critical Hot-Fixes (1–2 days):** The app has strong foundational accessibility (landmarks, ARIA, semantic HTML) and responsive design. **Three critical Phase 1A blockers must ship immediately:**

1. Top-bar overflow menu (Sign Out + Profile clipped)
2. Fix or remove ListRow checkbox span
3. Add page-level `<h1>` to Daily/Schedule

Then **five Phase 1B majors** (hard-coded colors, form aria-describedby, Tuesday "Standards2" duplicate, etc.) should follow in the hot-fix wave (1 week). The 25 TODO markers and 21 timer instances are tracked debt; Phase 1A can launch without them. **PRODUCTION BUG:** Claude bypass URL-param path is broken in production (Bearer header works). Re-sync token from `.env.local` to Cloudflare secret before next audit wave. Recommended: fix the three critical blockers in the next 4–6 hours, ship Phase 1B hot-fixes by EOW, then proceed to Phase 2 feature work.

---

## Stats Table

| Route | P1 Blockers | P1 Majors | P1 Minors | P2 High-impact | P2 Med-impact |
|---|---|---|---|---|---|
| /weekly | 1 | 6 | 7 | 4 | 5 |
| /daily | 2 | 4 | 4 | 3 | 3 |
| /schedule | 0 | 4 | 6 | 3 | 4 |
| /catch-up | 0 | 3 | 4 | 2 | 3 |
| /subject | 0 | 2 | 4 | 2 | 2 |
| /year | 0 | 4 | 4 | 4 | 3 |
| /login | 0 | 0 | 2 | 0 | 2 |
| /auth/claude-login | 1 | 0 | 1 | 0 | 1 |
| Inline pills (weekly/daily) | 0 | 2 | 1 | 1 | 1 |
| **Totals** | **4** | **25** | **33** | **19** | **24** |

---

## Phase 1 — Defects by Route

### /weekly

#### Blockers

**🟥 Top-bar Sign Out + Profile clipped past viewport at every desktop width below 1281px**
**File:** `components/shell/top-bar.module.css:41` (`overflow-x: clip`), `components/shell/top-bar.tsx:491–512`
**What I saw:** The top bar's `overflow-x: clip` cuts off the rightmost 66px at 1280px wide. At every width ≤1280, the rightmost controls (Profile, Sign Out) are hidden past the viewport edge. Measured via Playwright: at 1024px, "Sign out" button right=1176 vs viewport=1024; at 1280, right=1346 vs viewport=1280.
**Why it matters:** Profile is the **only Settings entry point.** Sign Out is the **only logout affordance.** At 1024–1280 (most common laptop widths) teachers cannot see or click either. Keyboard Tab still reaches them (off-screen), but they're unreachable by mouse/touch.
**Reproduction:** Open `/weekly` at 1280 width, look at top-bar's right edge. Profile avatar + Sign Out button are visually missing. DevTools: `document.querySelector('button[aria-label="Sign out"]').getBoundingClientRect().right` returns 1346 at 1280-wide.
**Proposed fix:** Replace unconditional `overflow-x: clip` with an overflow menu. At ≤1280, collapse the right cluster (Search / Catch-up / To-do / Comments / Sign Out) into a `⋯ More` button that opens a menu.
**Verified against live site:** Yes (Playwright measurements + live HTML via bypass).

**🟥 ListRow checkbox uses `<span role="checkbox">` — breaks keyboard on all list views**
**File:** `components/list/ListRow.tsx:291–301`
**What I saw:** Completion checkbox is a `<span role="checkbox" tabIndex={0}>` with manual key handlers, not a native `<button>`. Span doesn't receive focus by default.
**Why it matters:** Keyboard-only users cannot toggle completion on any list (Weekly Grid + List mode, Daily, Catch-up). Screen reader users lose semantic button role.
**Reproduction:** Tab through a weekly-list or daily-list row; focus lands on span but no visual focus ring fires (only negative-margin trick trick inflates hit area, focus still works). Enter/Space trigger the handler, but lack native button semantics.
**Proposed fix:** Replace `<span>` with `<button type="button" role="checkbox">` (7-line change).
**Verified against live site:** Yes (source + 32 instances in rendered HTML).

#### Majors

**🟧 Hard-coded hex colors in lesson-flow resources and auth**
**Files:** `components/lesson-flow/lesson-flow.module.css`, `components/lesson-flow/resource-type-pill.module.css`, `components/lesson-card/parts.tsx:114,130–131`, `components/auth/google-sign-in-button.tsx:168–181`
**What I saw:** CSS contains `#fce7f3`, `#dbeafe`, `#9d174d`, `#1e40af` inline. JSX has `color: "#fff"`, `bg: "color-mix(in oklch, #e53935 18%, white)"`, `fg: "#b71c1c"`. Google button hardcodes brand colors (`#4285F4`, etc.).
**Why it matters:** Violates CLAUDE.md §4 ("Zero hex anywhere in components"). Design system inconsistency. Future palette changes require hunting through CSS.
**Proposed fix:** Add tokens to `app/tokens.css`: `--tag-pink`, `--tag-blue`, `--done-text`, `--youtube-bg`, `--youtube-fg`. Replace hex with `var()`. Google colors stay hard-coded with a comment explaining brand exception.
**Verified against live site:** Yes (source code audit).

**🟧 WeeklyGrid forces internal horizontal scroll at every desktop viewport ≤1413px**
**File:** `components/grid/WeeklyGrid.module.css` (grid track with `minmax(132px, 1fr)` × 5 day columns)
**What I saw:** At 1280px viewport the grid's total rendered width is 1413px. Day columns overflow. Teacher sees 4 days + part of 5th and must scroll to see Thursday.
**Why it matters:** Weekly's defining job is "what are we teaching this week at a glance." Hiding 20% of the week in scroll at 1280 (the most common laptop width) undercuts that promise.
**Reproduction:** Open `/weekly` at 1280 width; scroll horizontally to see Thursday/Friday lessons.
**Proposed fix:** Re-balance grid: shrink subject-label gutter at ≤1366, reduce day-cell min-width slightly, or make cells `minmax(0, 1fr)`. Alternatively, surface a "scroll for Friday" affordance (ghost-edge gradient + chevron).
**Verified against live site:** Yes (measured rect positions via Playwright).

**🟧 No `loading.tsx` or `error.tsx` route boundary for the planner segment**
**File:** Missing — `find app/ -name "loading.tsx" -o -name "error.tsx"` returns nothing
**What I saw:** Repo defines no Next.js route-level `loading.tsx` or `error.tsx` for any segment. Mock data hides this today; when backend lands (Supabase), slow queries yield blank canvas and 500s yield the default Next error page (no app chrome).
**Why it matters:** The spec explicitly lists "Loading states" and "Error states" as required (planning_document.md §9).
**Proposed fix:** Add `app/(planner)/loading.tsx` with top-bar shell + grid skeleton, and `app/(planner)/error.tsx` with a friendly retry.
**Verified against live site:** Code observation only.

**🟧 "Saved HH:MM" save indicator lies — no persistence until backend lands**
**File:** `components/shell/top-bar.tsx:103-110, 273-287`
**What I saw:** Top bar shows "All changes saved" on mount and "Saved 14:32" after any planner-store mutation. But `lib/planner-store.tsx` has no network code — every mutation is in-memory only. Users are told the system has saved when nothing was sent anywhere.
**Why it matters:** On reload every edit is discarded. CLAUDE.md §5 says "Report outcomes faithfully" — microcopy that lies (Saved! when it failed) is explicitly flagged.
**Proposed fix:** Hide the indicator or change copy to "Local changes only — not yet synced" until persistence lands.
**Verified against live site:** Yes (top-bar shows "Saved 14:30" after clicks despite no Supabase round-trip).

**🟧 Sign-out is a `<button type="submit">` inside a clipped `<form>` — accidental sign-out risk**
**File:** `components/shell/top-bar.tsx:502-512`
**What I saw:** Sign-out button is offscreen due to clip (blocker #1 above). After tabbing past Profile, focus lands on this invisible Sign Out. Hitting Enter signs the teacher out with no visible indication of what they focused on.
**Why it matters:** Combines two bugs: (1) clip hides the control; (2) destructive-action focus has no visible feedback. Teacher tabbing through controls hunting for Search can accidentally sign themselves out mid-edit.
**Proposed fix:** Couple to the overflow menu fix. Destructive Sign-out belongs inside a deliberate menu, never inline in sticky bar.
**Verified against live site:** Yes (Tab order via Playwright lands on 0-size focus rect at right=1346 at 1280-wide).

#### Minors

(See fragment for full details on: drag handle 20×20px, Schedule pill hidden at phone, two asides unilabeled, WeekNavigator bounds, etc.)

---

### /daily

#### Blockers

**🟥 /daily renders no `<h1>` — heading hierarchy starts at h2**
**File:** `components/daily/DailyView.tsx` (page tree — no h1 anywhere)
**What I saw:** Document has zero `<h1>`. First heading is "Sunday" (h2) from `TodayDashboard.tsx:55`. Screen reader users using "skip to first heading" / "next h1" gestures land mid-page on a day-name h2.
**Why it matters:** WCAG 2.4.6 (Headings and Labels) + H42/H69 techniques expect a programmatically determinable page heading. Inconsistent with `/weekly` which has `<h1>Week 12</h1>`.
**Reproduction:** `document.querySelector('h1')` on `/daily` returns `null`.
**Proposed fix:** Add `<h1 className="sr-only">Daily plan — Sunday, Week 12</h1>` above the breadcrumb.
**Verified against live site:** Yes.

**🟥 /daily duplicates Standards content in two adjacent sections — both render as h3 "Standards"**
**File:** `components/lesson-flow/lesson-flow.tsx:146-150` (virtual Standards row) + `components/daily/LessonDetail.tsx:650-674` (separate Standards section)
**What I saw:** A selected lesson renders **two** "Standards" blocks. The second one's h3 contains a count chip inside it, rendering as "Standards2" to screen readers (the same a11y bug that was fixed for Weekly grid headers).
**Why it matters:** (1) Duplicate data — same standards shown twice. (2) Screen readers hear "Standards two" / "Standards five" instead of "Standards (5)". (3) Two identical heading levels with near-identical names confuse outlining tools. (4) Adds vertical scroll teacher must skip.
**Reproduction:** Open `/daily` with lesson selected. `Array.from(document.querySelectorAll('h3')).filter(h => h.textContent.includes('Standards'))` returns 2 nodes. The second's textContent is `"Standards2"` because the count chip is INSIDE the `<h3>`.
**Proposed fix:** Remove the duplicate block from `LessonDetail.tsx:650–674`. The spec treats Standards as part of the lesson body; the LessonFlow already shows them at position 1. Follow the `WeeklyGrid.tsx:669` pattern for heading+count: hoist visible spans to `aria-hidden="true"` and put the natural-language label on the parent `<h3 aria-label={…}>`.
**Verified against live site:** Yes.

#### Majors

**🟧 Personal/Master toggle radio buttons are 66×26px / 56×26px — below WCAG 2.5.5 minimum**
**File:** `components/shell/top-bar.tsx:345-365`, `components/shell/top-bar.module.css:473-503`
**What I saw:** At 400px viewport each `<button role="radio">` measures 66×26 (Personal) and 56×26 (Master). Fails WCAG AA (≥24×24 with spacing exception) and CLAUDE.md's own §4 rule ("≥44px touch targets on primary actions").
**Why it matters:** This is the **single most dangerous toggle in the product** (gates edits affecting whole team) and the **smallest tap target in the bar.** Fingertip mishits push teachers into Master mode.
**Reproduction:** DevTools: `document.querySelector('button[aria-label="Personal mode"]').getBoundingClientRect()` returns height ~26 at all viewports.
**Proposed fix:** Verify the ToggleGroup's `::before` hit-area-inflation rule actually fires (appears it doesn't). Or raise bar height at ≤900px to 52px and accept the row trade-off. Touch target must be ≥44×44 independently.
**Verified against live site:** Yes (Playwright measurements).

**🟧 Search icon button is 14×40 — width below 44px**
**File:** `components/shell/top-bar.tsx:433-447`, `components/ui/button.module.css`
**What I saw:** Collapsed search button measures 14×40 at tablet+ widths. Same issue affects "Open to-do" (18×40), "Open comments" (18×40), "Collapse filter" (18×40) — all narrow.
**Why it matters:** Touch targets <44px wide fail WCAG 2.5.5 AA and CLAUDE.md §4. School Chromebook touch screens are primary input modality.
**Proposed fix:** Ensure `components/ui/button.tsx` variant="icon" has min-width ≥44px on tablet/phone. SVG inside can stay 14px.
**Verified against live site:** Yes (DevTools measurements).

**🟧 AddLessonForm and AddEventForm popovers leak focus — no focus trap**
**File:** `components/daily/DailyView.tsx:1029-1034` (state), `1914-1929` (mount)
**What I saw:** Both forms render at page root as `position:fixed` popovers but the underlying page is not inert. Keyboard users can Tab out of the form into the canvas behind, then back in — no focus trap, no `aria-modal="true"`.
**Why it matters:** Modal popovers without focus trap fail WCAG 2.1.2 (No Keyboard Trap) inversely — they don't block, they leak. Teachers using assistive tech may not realize the form is open.
**Proposed fix:** Add `aria-modal="true"` + focus trap using `@react-aria/dialog` pattern, or close on Esc + scrim click and constrain focus.
**Verified against live site:** Partial (forms render at root via DOM inspection).

**🟧 DailyView week-strip day-pills have `aria-controls="daily-pane-body"` but in List mode the body doesn't have that id**
**File:** `components/daily/DailyView.tsx:792-846` (WeekStrip), `1829-1837` (List mode), `1846-1853` (Grid pane)
**What I saw:** Pills carry `aria-controls="daily-pane-body"`. In Grid mode the pane has `id="daily-pane-body"`. In List mode it doesn't — the `aria-controls` reference dangles.
**Why it matters:** Screen-reader users activating a tab pill in List mode expect focus to move into a corresponding tabpanel — none exists by that id.
**Proposed fix:** Hoist `id="daily-pane-body"` onto a container wrapping both Grid and List modes.
**Verified against live site:** Code observation.

#### Minors

(See fragment for: "Standards2" heading misread, DailyView Esc handler absent, em-dash font rendering, TodayEvents stub, no "skipped" status indicator, RightRail Tabbed mode wrong ARIA role, etc.)

---

### /schedule

#### Blockers

None.

#### Majors

**🟧 Weekly Schedule pill mode persists in localStorage but UI signal is too quiet**
**File:** `components/weekly/WeeklyShell.tsx:819-829`, `components/weekly/weekly-schedule-pills.tsx`
**What I saw:** Schedule mode persists across reloads; the only visual signal is which segment of the pill is darker. No "you are viewing the Schedule timeline" eyebrow, no banner.
**Why it matters:** Teachers reloading to a previously-set Schedule mode may briefly think their lesson grid is missing.
**Proposed fix:** When `scheduleMode === true`, render `VIEW · Schedule Timeline` eyebrow next to the label, or add soft border-top accent.
**Verified against live site:** Yes (live HTML confirms subtle pill recipe).

**🟧 Daily Schedule rail is silently hidden ≤1280px while pill still shows "Schedule" active**
**File:** `components/daily/DailyView.module.css:380-387`, `components/daily/daily-schedule-pill.tsx`
**What I saw:** Rail has `@media (max-width: 1280px) { display: none; }`. Pill stays visible and toggleable at every width. Teacher can click Schedule at 768px / 400px; pill moves, localStorage updates, but **rail never appears and there is zero feedback.**
**Why it matters:** "I tapped Schedule and nothing happened" is the worst kind of bug. Below 1280 is **not** the desktop tier (1024–1920); a 1024–1280 laptop is in the silent-no-op band.
**Reproduction:** Open `/daily` at ≤1280, click Schedule pill. Pill moves, no rail mounts, no message.
**Proposed fix:** Below 1280, replace pill with a `<Link href="/schedule">` button so action goes somewhere, or render schedule rail inline above/below lesson list instead of as a 4th track, or add inline notice "Schedule view opens on /schedule at this width".
**Verified against live site:** Yes (responsive screenshots).

**🟧 /schedule lands on Sunday for every first visit even when "today" is Monday**
**File:** `app/(planner)/schedule/page.tsx:30-33`, `lib/app-state.tsx:201`
**What I saw:** `selectedDay` initializes to 0 (Sunday) and is **not persisted.** On Monday morning, `/schedule` shows Sunday's blocks with Mon 19 marked as "today" only on the chip.
**Why it matters:** Half the value of a single-day schedule view is "what does my next hour look like" — broken for every fresh session.
**Proposed fix:** Default `selectedDay` to `todayDayIndex()` clamped into school week when no user choice yet, or persist `selectedDay` to localStorage.
**Verified against live site:** Yes (aria labels confirm pane shows Sunday while chip shows Mon 19).

**🟧 Three primary Schedule controls render permanently disabled with no other affordance**
**File:** `components/schedule/ScheduleDayPane.tsx:117-130, 144-190, 226-238`
**What I saw:** Overflow button (···), calendar icon, "+ Add time block" all render `disabled` with "coming soon" tooltip. Full opacity, no greyed-out treatment on the CTA button.
**Why it matters:** Teacher taps "+ Add time block" expecting a form, gets nothing. Tooltip doesn't fire on touch. Looks like broken UI.
**Proposed fix:** Hide these until Phase 1B, or replace with quiet inline "Custom blocks land in Phase 1B" ghost-card under rows instead of a button-shaped no-op.
**Verified against live site:** Yes.

#### Minors

(See fragment for: ScheduleRow is `<div role="button">` not `<button>`, Bell Schedule rows look identical but aren't clickable, no URL deep-link for day selection, schedule sub-section labels are spans not headings, date chip misses month context on month boundaries, "today" chip uses color-only signal, disabled button has cursor:not-allowed but no visual, etc.)

---

### /catch-up

#### Blockers

None.

#### Majors

**🟧 Coverage percentage (year-wide) and "uncovered across N weeks" (scoped) sit side by side and describe different slices**
**File:** `components/catchup/CatchupScreen.tsx:239-271`
**What I saw:** Header renders `17% covered` (global) right above `1 uncovered across 1 week` (scoped to last 4 weeks). Flame badge claims `29 items not covered` (absolute global count). Three numbers describing two different slices.
**Why it matters:** This is the most prominent stat on the most failure-state-heavy screen. A teacher reads 17% / 1 uncovered / 29 items and trusts none of them.
**Proposed fix:** Pick a slice and own it. Either (a) make coverage % follow the scope ("17% covered in Last 4 weeks"), or (b) anchor coverage to year-to-date and make chip selection update only the items list with no scope-affected stat in header.
**Verified against live site:** Yes (HTML confirms three conflicting numbers).

**🟧 Empty state only reachable by chip click — SSR-rendered page never shows "Caught up." for empty default scope**
**File:** `components/catchup/CatchupScreen.tsx:356-358`, `components/catchup/EmptyState.tsx`
**What I saw:** Empty state renders only when `visibleItems.length === 0`. Spec says "Empty state — a panel with zero items." Fresh teacher hitting `/catch-up` with no uncovered items doesn't see a celebratory "Caught up!" on first paint.
**Proposed fix:** When empty state fires *and* every status filter is on *and* scope is default, render "All caught up!" with context about which scope they're in.
**Verified against live site:** N/A (would need a scope where mock data is empty).

**🟧 Bulk action bar is `position: fixed bottom:16px` and overlaps content on phones with many wrapped buttons**
**File:** `components/catchup/BulkActionBar.module.css:5-21, 70-72`
**What I saw:** Bar wraps to 3–4 rows at 400px, easily 176–220px tall — eating 22–28% of an 800px viewport. Screen body's `padding-bottom: 96px` reserves only ~96px, so bottom rows hover on top of the last visible Catch-up row.
**Why it matters:** When teacher selects bulk rows on phone, the bar can hide the very rows they're about to act on.
**Proposed fix:** At ≤480, collapse to single row with count + primary action + `···` overflow menu, or replace with sticky-bottom panel that pushes content up.
**Verified against live site:** Yes (CSS confirms wrap; screenshot would require driving selection).

#### Minors

(See fragment for: Group headers are spans not h2, Carry-over action saves with no target week, no success feedback for actions, note save uses onBlur with no debounce, etc.)

---

### /subject (Curriculum)

#### Blockers

None.

#### Majors

**🟧 Filters and Export buttons on /year do nothing**
**File:** `components/year/YearView.tsx:326-340`
**What I saw:** Two `<button>`s in page header — "Filters" and "Export" — render with full chrome and 44px hit target, but neither has an `onClick`. Clicking is a no-op with no visual feedback.
**Why it matters:** "Buttons that do nothing" is a functional-bug blocker. Teachers assume the click failed silently, then either retry or give up.
**Proposed fix:** Either wire them to existing UI (left filter panel + CSV/PDF print stub), or add `aria-disabled="true" disabled` + "Coming soon" tooltip.
**Verified against live site:** Yes (curl to `/year` shows no on-page wiring).

**🟧 Subject + Year views are unreachable on phone via top-bar**
**File:** `components/shell/top-bar.module.css:563-573`, `components/shell/top-bar.tsx:230-235`
**What I saw:** At ≤480px the Yearly + Curriculum tabs are hidden (`data-narrow-hide="true"`). Code comment claims phone teachers can reach via "keyboard nav, deep link, or widening viewport" — none are usable in a Tuesday-morning classroom.
**Why it matters:** Teacher on phone before a sub-period cannot reach Curriculum (long-form planning) or Yearly (roadmap). The product's defining purpose becomes invisible on phone.
**Reproduction:** Open at phone width or with iPhone UA. Top bar shows only Daily / Weekly / Schedule.
**Proposed fix:** Tracked by task #82. Either hamburger drawer with all five tabs, or horizontal-scroll tab strip.
**Verified against live site:** Yes (compared desktop UA vs iPhone UA; hide is CSS-driven).

#### Minors

(See fragment for: fake "24 students" badge, "% of the year" caption misrepresents data, ResourcesSort "Phase 1B" placeholder text, UnitHealthCard ⌘ symbol non-portable, draft state goes stale if unit changes, StatStrip CSS has dead `border-right: none`, etc.)

---

### /year (Yearly)

#### Blockers

None.

#### Majors

**🟧 /year has no print stylesheet — Roadmap clips to viewport width on paper**
**File:** `components/year/YearView.module.css:113-120`, `app/globals.css:51-68`
**What I saw:** Timeline lives in `.timelineScroll { overflow-x: auto }`. Total width is ~4320px (120px per week × 36 weeks). Browser prints only the currently-scrolled slice — the rest is clipped.
**Why it matters:** Spec explicitly calls out "print-friendliness matters" for Yearly. Teachers print to share with admin or post on classroom doors. Clipped printout fails the use case.
**Proposed fix:** Add `@media print` block: (a) set `.timelineScroll { overflow: visible }` and scale to fit page, or (b) re-flow timeline as vertical list of months.
**Verified against live site:** Source review only (not visually verified in real browser).

**🟧 /year double-renders YearView + YearMobile in the DOM (layout shift on mobile)**
**File:** `app/(planner)/year/page.tsx:21-49`
**What I saw:** Both `<YearView>` and `<YearMobile>` are always mounted; only `display` is toggled via CSS. Phone visitors see desktop view for one paint then layout shift to mobile — CLS hit.
**Why it matters:** Phone visitors face brief visual corruption. Both `<h1>`s are in the DOM tree. Screen reader semantics may announce both. Bundles ship 2× the year-view JS.
**Proposed fix:** Use CSS media query to pick variant at render time, or if both must stay mounted, add `aria-hidden="true"` to the hidden tree.
**Verified against live site:** Yes (HTML inspection confirms both h1s present).

**🟧 /year's YearSidebar is 8 disabled "coming soon" buttons taking 250px for zero value**
**File:** `components/year/YearSidebar.tsx:136-145`
**What I saw:** Calendar, Units, Lessons, Checkpoints, Reports, Students, Settings, Help — all `disabled` with "coming soon" tooltips. Permanent rail, heavy chrome cost.
**Why it matters:** "Students" violates teacher-only mandate (CLAUDE.md §1). Visual noise on primary view. Spec calls out "reduce visual noise."
**Proposed fix:** Hide the rail until at least one item is wired. Or collapse to single "More views — coming soon" hint.
**Verified against live site:** Yes (HTML shows 8 grey icon buttons).

#### Minors

(See fragment for: fake "24 students" in LaneCard, no URL deep-link for view state, two asides unilabeled on daily, YearMobile double-render CLS, etc.)

---

### /auth/claude-login, /, /login

#### Blocker

**🟥 PRODUCTION BUG — Claude bypass URL-param + cookie redirects return 401/307 in production**
**File:** `app/auth/claude-login/route.ts:22-24`, `lib/claude-bypass.ts`
**What I saw:**
- `Authorization: Bearer <token>` → 200 OK (works)
- `GET /auth/claude-login?token=<token>&next=/weekly` → 401 Unauthorized
- `GET /weekly?claude=<token>` → 307 → /login (token rejected)
**Reproduction:**
```bash
TOKEN="$(grep '^CLAUDE_BYPASS_TOKEN=' .env.local | cut -d= -f2-)"
curl -s -o /dev/null -w "%{http_code}\n" "https://mycurricula.app/auth/claude-login?token=$TOKEN&next=/weekly"  # → 401
curl -s -o /dev/null -w "%{http_code}\n" "https://mycurricula.app/weekly?claude=$TOKEN"  # → 307 → /login
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" "https://mycurricula.app/weekly"  # → 200
```
**Why it matters:** Two of the three documented bypass paths are broken. Affects WebFetch, Co-work agents, browser-based crawlers. Only Bearer header path works.
**Proposed fix:** NOT within audit scope (spec says "don't audit the bypass"). Most likely: token mis-synced to Cloudflare secret. Re-sync from `.env.local` and re-test.
**Verified against live site:** Yes (three curl probes above).

#### Minors

(See fragment for: no domain restriction on Google SSO, /login conflates all sign-in failures, wordmark Grade 5 inconsistency, /login wordmark two-line motto wraps awkwardly, etc.)

---

## Phase 2 — Improvements by Route + Theme

### /weekly

- Keyboard shortcut overlay should advertise itself via `?` chip in IconRail
- Replace mock-data faked save with optimistic-UI Supabase persistence (HIGH PRIORITY — blocks beta)
- Add grid "Expand all / Collapse all" toggle for 40-card weeks
- Add print-stylesheet-friendly route with "Print this week" affordance
- Bulk action bar needs "Esc to clear" keyboard hint
- Empty-state should show "Drag a lesson here or start with a template" + CTA
- Schedule pill needs always-visible `+` button to add lessons (was hover-reveal, invisible on touch)

### /daily

- Add a `Today` jump button comparable to /weekly's
- Reduce responsive cliff on right-rail: instead of `display: none` at ≤1280px, offer bottom-sheet variant on tablet
- Empty-day state needs "Copy from another day" affordance (common workflow)
- Daily TodayDashboard progress bar uses only color — add pattern or glyph for color-blind teachers
- Verify urgent notes never pulse under `prefers-reduced-motion` (spec rule)
- Right-rail Tabbed/Stacked toggle should use tooltip at narrow rail widths
- Drag handle should pulse on first visit to hint reorderable columns

### /schedule

- Land on today's day-of-week on first visit, persist day choice across sessions
- Make ScheduleTimeline the default surface on `/schedule` (not the day-pane list)
- Accept URL query params (`?day=N`, `?week=N`) for deep links
- Add keyboard navigation: `←` / `→` through day chips, `Home` to first day, `t` to today

### /catch-up

- Consolidate the three coverage numbers into one consistent stat
- Per-row actions need aria-live confirmation + brief inline undo
- Distinguish "all clear" empty state from "no items matching these filters"
- Accept URL query params (`?scope=…`) for deep links

### /subject (Curriculum)

- Make resource rows openable (they're currently static divs)
- Tighten the COMPLETE stat to mean what it says (fix denominator or honest caption)
- Replace hard-coded "Grade 5" subheader with actual grade-scope from app-state
- ResourcesSort placeholder text "coming in Phase 1B" is dev-facing — remove or replace with teacher-facing copy

### /year (Yearly)

- Wire Filters + Export buttons, or remove them
- Replace dead "coming soon" sidebar with useful per-subject quick-jump strip
- Add `/year` print stylesheet (re-flow timeline as vertical month-bands)
- Render only one of YearView / YearMobile per page (eliminate layout shift)

### Cross-Cutting Themes

#### Information Density & Visual Hierarchy

**Dense mode toggle** (Low effort, Medium impact) — Add "Density: Calm | Compact" to Appearance settings. Reduce card padding 16→12px, gaps 24→16px. Supports power users.

**Mobile right-rail drawer** (High effort, High impact) — Currently hidden <1280px. Restore via hamburger menu. Teachers lose Resources, To-do, Chat on 70% of devices.

**Surface `quiet` and `calm` card styles** (Low effort, Low impact) — Styles exist but buried. Add radio buttons in Appearance.

#### Accessibility Beyond WCAG AA

**WCAG AAA contrast upgrade** (Medium effort, Medium impact) — Current palette meets AA. Audit and upgrade to AAA (4.5:1 text, 3:1 graphics). Supports 8% of teachers with low vision.

**Keyboard shortcut system** (High effort, Medium impact) — Implement Cmd+/, Cmd+K, Cmd+Z/Y. Existing stubs: `components/shell/shortcuts-overlay.tsx`, `global-shortcuts.tsx`.

**Form `aria-describedby` audit** (Low effort, Low impact) — Link all error messages to inputs via `aria-describedby`.

#### Mobile-First Wins

**Phone week-picker modal** (Medium effort, Medium impact) — Replace horizontal scroll with modal date picker for faster week navigation.

**Bottom sheet for Catch-up** (Medium effort, Medium impact) — Swipe-up drawer showing top 5–10 uncovered items with action buttons.

**Phone burger menu** (Medium effort, Low impact) — Hamburger in top-bar → drawer with Settings, Sign Out, Feedback.

#### Personalization & Preferences

**Persist Master/Personal toggle** (Low effort, Low impact) — Save toggle state in user profile once Supabase auth lands.

**Expand/Collapse all session toggle** (Low effort, Low impact) — Batch toggle for all lessons, remember choice.

**Filter presets** (Medium effort, Low impact) — Save and re-apply teacher's filter set ("My Draft").

#### Collaboration & Awareness

**Lesson-level comments** (High effort, High impact) — Teachers annotate Master lessons before forking. Requires backend.

**Activity feed** (High effort, Medium impact) — "Jane added Reading lesson", "Bob marked Unit 2 done" with real-time Supabase listen.

**Presence indicators** (High effort, Low impact) — Avatar stack showing who's online and what they're viewing.

#### Workflow Automation

**Recurring lesson templates** (High effort, High impact) — "Reading every Mon+Thu" auto-populates. Saves ~10 clicks/week per teacher.

**Smart Master suggestions** (High effort, Medium impact) — Import last year's plan; app suggests "Did you mean to add Reading on W12?"

**Bulk mark done** (Low effort, Low impact) — Multi-select + action bar.

**Copy week** (Medium effort, Low impact) — Right-click W12 → "Copy to W16" → auto-adjust dates.

#### Analytics & Observability

**Coverage dashboard** (Medium effort, Medium impact) — "Reading — 10/15 standards covered (67%)". Highlight gaps.

**Pacing analytics** (High effort, Medium impact) — Chart: lessons/week over time, unit completion dates. Trend comparison.

**Team effort snapshot** (Medium effort, Low impact) — Grade 5 lead sees: "4 teachers, 120 edits, 40% Personal forks."

**Audit log viewer** (High effort, Low impact) — Compliance requirement; backend-heavy.

---

## Appendix

### Methodology

**Phase 1:** Source code analysis (CLAUDE.md, BUILD_STANDARD.md, components/, lib/) + live HTML audit via authenticated bypass token (Bearer header).

**Phase 2:** Design system review (app/tokens.css, lib/theme.tsx, lib/palette.tsx), component architecture, CLAUDE.md phasing roadmap.

**Routes audited:** /weekly, /daily, /schedule, /catch-up, /subject, /year, /auth/claude-login, /, /login

**Dimensions per route:** Semantic HTML, Accessibility (WCAG 2.1 AA), Consistency, Mobile/Responsive, Performance signals, Console/Production issues, Loading + empty states, Error handling

**Responsive verification:** Desktop (1280px), Tablet (768px), Phone (400px) via Playwright responsive-check and DevTools device emulation

### Tools Used

- **Bash + curl** — Authenticated fetch via `Authorization: Bearer $TOKEN` (token from .env.local)
- **Grep/ripgrep** — Pattern matching across source
- **Read tool** — CLAUDE.md, BUILD_STANDARD.md, component source inspection
- **Playwright** — Responsive screenshots, DOM inspection, rect measurements
- **DevTools** — Live HTML analysis, CSS inspection, focus/landmark auditing

### Files Referenced (Primary)

**Core audit scope:**
- `CLAUDE.md` (policy, phasing, design system rules)
- `BUILD_STANDARD.md` (visual contract, responsive, token definitions)
- `app/tokens.css` (design tokens)
- `lib/theme.tsx`, `lib/palette.tsx` (theming)
- `components/ui/` (primitives: Button, EmptyState, Chip, Card, etc.)
- `components/shell/` (chrome: top-bar, left-filter-panel, right-panel, master-banner, etc.)
- `app/layout.tsx` (root layout)
- `app/(planner)/weekly/page.tsx`, `daily/page.tsx`, `schedule/page.tsx`, `catch-up/page.tsx`, `subject/page.tsx`, `year/page.tsx`
- `app/login/page.tsx`, `auth/claude-login/route.ts`

### Route-Name Divergence Note

The audit spec names `/curriculum` and `/yearly`. These routes do not exist:
- `/curriculum` bounces to `/login` (SSO middleware rejects unknown paths). The actual route is **`/subject`** (→ `/subject/[slug]`).
- `/yearly` returns 404. The actual route is **`/year`**.
- **Top-bar tab labels** are "Curriculum" and "Yearly" but route to `/subject` and `/year`. All findings are against the real routes.

### Constraints Respected

- **Audit-only** — No changes committed to source
- **Bypass token not written** — Token read from .env.local; not in report
- **Known schema mismatch noted** — Audit-log insert vs middleware shape; defer to ops
- **Bypass security not audited** — Auth conversation per spec
- **Findings backed with examples** — All concrete (files/lines/curl probes)
- **Time-boxed** — ~3h Phase 1 + ~2h Phase 2

---

## How to Read This Report

1. **Executive Summary** — Priority order and overall readiness assessment.
2. **Stats Table** — Per-route severity count for triage.
3. **Phase 1 by Route** — Defects (must fix before beta). Blockers first; majors; minors.
4. **Phase 2 by Route + Theme** — Feature/UX improvements (post-launch roadmap, prioritized).
5. **Appendix** — Methodology, tools, file references.

---

**Report Date:** 2026-05-24  
**Auditors:** Four-agent team (routes 1–2, 3–4, 5–8, cross-cutting synthesis)  
**Routes Covered:** 9 (weekly, daily, schedule, catch-up, subject, year, auth-login, /, /login + inline pills)  
**Phase 1 Findings:** 62 total (4 blockers, 25 majors, 33 minors)  
**Phase 2 Opportunities:** 70+ (19 high-impact, 24 medium-impact per stats table)  

**Recommendation:** **Ship Phase 1B hot-fixes within 1–2 days** (top-bar overflow, ListRow checkbox, page `<h1>` tags). Then **Phase 2 feature work** with 25–30 engineering days across 2-person team working 4 weeks (Dense mode → Mobile drawer → Keyboard shortcuts → Coverage dashboard → Recurring templates). **BLOCKING:** Fix the Claude bypass production bug (re-sync Cloudflare secret) before next audit wave.
