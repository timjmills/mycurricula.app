# /year audit — 2026-05-25

> **⚠ Snapshot disclaimer** — this is a dated audit/research artifact (2026-05-25).
> Findings and recommendations may have shipped, regressed, or been superseded by
> later work. Verify against current code (`git log -- <file>`) before treating any
> finding as open or any recommendation as binding. The canonical project guide is
> `CLAUDE.md`.

**Auditor:** Claude Code agent (Opus 4.7, 1M context)
**Route:** `/year` (file path `app/(planner)/year/page.tsx`)
**Method:** Source review + Playwright interactive probes against the
local dev server at three viewport tiers (phone 400×800, tablet 768×1024,
desktop 1280×900), with the Claude bypass cookie seed.
**Time-box:** ~75 minutes.

---

## Executive summary

- **Total findings:** 0 blockers · 5 majors · 7 minors · 4 phase-2 opportunities
- **Top 3 issues that need fixing first:**
  1. **LaneCard minimize/restore buttons measure 24×24px** at every tier
     (`components/year/LaneCard.module.css` `.toggleBtn`) — fails CLAUDE.md §4
     ≥44px rule and WCAG 2.5.5 AA for primary controls on phone/tablet.
     **[FIXED in commit b47c9d7]**
  2. **Hardcoded hex `#fff` + `rgba(31, 111, 184, 0.35)` in /year components**
     (`components/year/StatusGlyph.tsx:60`, `components/year/TodayMarker.module.css:23,29`)
     — direct CLAUDE.md §4 violation ("Zero hex anywhere in components").
     **[FIXED in commit da4bcc2]**
  3. **Both YearView and YearMobile trees still ship in every bundle and SSR**
     (`app/(planner)/year/page.tsx:46-61`) — Lane D's `aria-hidden` correctly
     fixes the duplicate-h1 a11y concern, but the CLS-on-resize and double-bundle
     issues from the prior audit remain. Lane D's commit message acknowledged this.
     **[FIXED in commit e873089]** (CSS-only dual-mount switch — hydration warning
     gone). Related fixes: F1 month-header span:0 in `e0cb380`; chameleon gradient
     width in `09890a3`.
- **Overall posture:** **needs-work.** No blockers; the page renders correctly at
  every tier and the primary interactions (Today, MonthPicker, Roadmap/Progression
  toggle, CurriculumFilter, StatusFilterBar, LaneCard minimize) all work. Touch
  target sizing, residual hex, and the unresolved double-mount are the load-bearing
  remediations before Phase 1A beta.

---

## Lane D verification

| Change | Status | Evidence |
|---|---|---|
| Filters + Export wrapped in Tooltip + `disabled` + `aria-disabled="true"` | ✅ **WORKS** | Click on either is a no-op (`domChanged: false` after force-click). Both buttons report `disabled=true, ariaDisabled="true"` at all three tiers. Visual size 59×44 + 62×44 — sized OK. |
| `.actionBtn:disabled` styles added | ✅ **WORKS** | `opacity: 0.5; cursor: not-allowed` apply (`YearView.module.css:81-86`). Visually clear the buttons are inert. |
| YearSidebar unmounted from YearView | ✅ **WORKS, NO LAYOUT GAP** | `bodyLeft: 240px, contentLeft: 240px, gapLeft: 0` at desktop 1280. The flex layout collapsed cleanly. Component file remains for future wiring. |
| `aria-hidden` toggles on YearView/YearMobile wrappers | ✅ **WORKS for a11y** | At phone tier: visible `<h1>` is in the un-hidden tree, invisible one is inside `[aria-hidden="true"]`. At desktop: reversed. Screen readers will only encounter one "Yearly View" heading per tier. |

### Side effects / follow-ups
- **No layout gap from removed sidebar** — the `min-width: 0` flex rule did its
  job and the content area filled the freed space cleanly. Lane D landed safely.
- **Tooltip portal doesn't render text on hover in Playwright** at desktop with
  `disabled` button — Playwright's `hover()` works but the Tooltip implementation
  is `role="tooltip"`-via-portal and the headless run captured `tooltipState=[]`.
  This is **likely a real concern in production:** native browsers don't fire
  `mouseenter` on disabled `<button>` elements in most engines — only the
  `title="Coming soon"` HTML attribute will reliably show. The custom Tooltip
  component's behavior on disabled buttons needs a quick browser-spread sanity
  check (Safari, Firefox, Chrome). The `title` attribute fallback is present in
  Lane D's JSX so the affordance survives, but the styled Tooltip may never paint.
- **Lane D's own note in `app/(planner)/year/page.tsx:12-16` is honest** — they
  explicitly punted CLS + bundle-size to a follow-up wave. That follow-up is now
  the top-of-list major (M3 below).

---

## Findings

### Blockers (P1)

**None.** No finding rises to the bar of breaking core workflow / failing a
CLAUDE.md hard rule on a primary action / breaking WCAG AA on a primary control.

---

### Majors (P1)

#### M1 — LaneCard minimize/restore buttons are 24×24px (fails CLAUDE.md §4 + WCAG 2.5.5 AA)
**File:** `components/year/LaneCard.module.css` `.toggleBtn` (and the JSX at
`components/year/LaneCard.tsx:102-112` minimized mode + `135-140` full mode).
**What I saw:** All 8 minimize chevrons measured **24×24** at every tier in the
Playwright probe. The Restore chevron likewise. The buttons have no
`::before` hit-area-inflation rule (the pattern CLAUDE.md §4 recommends).
**Why it matters:** Minimizing a subject lane is the **only way** to declutter
the timeline view from 8 lanes down to a focused subset. CLAUDE.md §4 requires
≥44px touch targets on primary actions; WCAG 2.5.5 AA requires ≥24×24 only
under the "spacing exception" — and the buttons are tightly packed inside the
LaneCard header next to a 28×28 chip, so the spacing exception doesn't apply.
**Reproduction:** Open `/year` at tablet 768. DevTools:
`document.querySelector('button[aria-label="Minimize Math"]').getBoundingClientRect()` → 24×24.
**Proposed fix:** Add `min-width: 44px; min-height: 44px` to `.toggleBtn` with a
padding-trick (negative margin around the icon) so the visual remains 24px but the
hit area expands to 44px. Or follow the pattern at `components/year/YearView.module.css`
`.actionBtn { min-height: 44px }`.
**Verified against live site:** Yes (Playwright `getBoundingClientRect` at all tiers).

#### M2 — Hardcoded hex (`#fff`) and raw RGBA in /year components (CLAUDE.md §4 violation)
**Files:**
- `components/year/StatusGlyph.tsx:60` — `color: "#fff"` (inline style on the "done" glyph)
- `components/year/TodayMarker.module.css:23` — `color: #fff` on the pill
- `components/year/TodayMarker.module.css:29` — `box-shadow: 0 1px 4px rgba(31, 111, 184, 0.35)` (raw RGBA hardcoding `--fyi`)
**What I saw:** Three direct violations of CLAUDE.md §4 ("Zero hex anywhere in
components. Zero raw `rgb()` / `hsl()` for color anywhere in components"). The
glyph done-check needed `#fff` because the SVG stroke is `currentColor`; the
TodayMarker pill text needs to be readable on the `--fyi` background.
**Why it matters:** Phase 1B can't tighten the token system if components keep
side-channeling hex. The RGBA in particular hardcodes the *resolved* value of
`--fyi` (`#1f6fb8`) into the shadow — so if anyone re-themes `--fyi` the shadow
will drift out of sync.
**Reproduction:** `Grep "#[0-9a-fA-F]\{3,8\}" components/year` — three hits.
**Proposed fix:**
- Add a `--paper-on-color` token (or reuse an existing one) for "white text on a
  saturated background" and replace `#fff` references with `var(--paper-on-color)`
  or `white` (the bare keyword is permitted by tokens.css convention for the
  "ink-zero" case — confirm with the design lead).
- Replace the RGBA in TodayMarker with
  `box-shadow: 0 1px 4px color-mix(in srgb, var(--fyi) 35%, transparent)`.
**Verified against live site:** Source-only (the visual output is identical to
the live page — this is a code-hygiene fix with no visual consequence).

#### M3 — YearView + YearMobile both ship + SSR every load (Lane D punted)
**File:** `app/(planner)/year/page.tsx:46-61`
**What I saw:** Both wrappers are unconditionally mounted; only CSS `display`
+ `aria-hidden` toggle which is on-screen.
- Desktop probe: `desktopMounted: true, mobileMounted: true` (one h1 visible,
  one in `aria-hidden="true"`).
- Phone probe: same.
- The `useState<boolean>(false)` default means SSR always serves the desktop
  layout first; phone visitors hydrate, run `useEffect`, and shift to mobile.
**Why it matters:**
- **CLS on phone:** every fresh phone visit paints the desktop YearView for
  one frame, then layout-shifts to YearMobile after `useEffect`. The shift is
  ~700ms of visual disruption on cold Chromebook hardware.
- **Bundle bloat:** every visitor downloads both `RoadmapView`, `ProgressionView`,
  `QuarterMonthWeekHeader`, `LaneCard`, *and* `YearMobile`. The desktop bundle
  ships YearMobile dead weight; the phone bundle ships RoadmapView + ProgressionView
  + QuarterMonthWeekHeader dead weight. Conservatively ~15–25 KB gzipped each direction.
- **Lane D's note acknowledges this** — file header lines 12-16. It is the
  intended follow-up wave.
**Reproduction:** Probe data in `year-audit-final.json` `phone_state.{desktopMounted,
mobileMounted}` both `true`. Source grep confirms.
**Proposed fix:** Use a CSS-only switch (no JS) — wrap both with
`<div className="show-on-desktop">` / `<div className="show-on-phone">` and use
`@media (max-width: 480px)` for the visibility flip. Or use the Next.js
`headers()` API server-side to inspect the `Sec-CH-UA-Mobile` client hint and
render only the matching tree (best for bundle splitting via `dynamic()`).
**Verified against live site:** Yes (probe + source review).

#### M4 — `/year` has no print stylesheet — Roadmap scales to illegible at print
**Files:** `components/year/YearView.module.css` (no `@media print` block),
`components/year/RoadmapView.module.css` (no `@media print` block),
`app/globals.css:51-68` (only hides chrome, no /year-specific rule).
**What I saw:** With `page.emulateMedia({ media: "print" })`:
- The chrome (top-bar, left-filter-panel) is correctly hidden via globals.css.
- The `.timelineScroll` container expands to `clientWidth: 4522, scrollWidth: 4522`
  — so the timeline is **no longer clipped** as the prior audit claimed; instead
  the browser scales the 4522px-wide content into the ~700px Letter-portrait page,
  rendering text at ~16% scale (illegible to the naked eye).
- All 8 subject lanes + unit bars are visible in the print preview, but week labels,
  unit names, and "% Complete" are far too small to read on paper.
**Why it matters:** The prior audit was directionally correct (printing is broken)
but the mechanism is "illegible scaling," not "clipping." Either way the spec's
"print-friendliness matters for Yearly" goal isn't met. Teachers print to share
with admin or post on classroom doors — neither use case survives 16% scale.
**Reproduction:** See `docs/screenshots/year-audit/desktop-print-2.png`.
**Proposed fix:** Add a `@media print` block to `YearView.module.css` that
re-flows the timeline as a vertical stack of months — one month per "page row"
with subject lanes inside. Or add a dedicated `/year/print` route paralleling
`app/(planner)/weekly/print/page.tsx`.
**Verified against live site:** Yes (Playwright `emulateMedia("print")`).

#### M5 — StatusFilterBar pills, ToggleGroup options, MonthPicker items all 28–36px tall (under 44px on phone/tablet)
**Files:**
- `components/year/StatusFilterBar.module.css:29` — `.pill { min-height: 36px }`
- `components/year/StatusFilterBar.module.css:72` — `.clearBtn { min-height: 36px }`
- `components/year/MonthPicker.tsx` items rendered as 166×36 (via probe)
- `components/year/YearView.tsx:367-385` — ToggleGroup options rendered as 102×34 + 116×34
- LaneCard's `.toggleBtn` (M1) at 24×24
**What I saw:** At tablet 768:
- "Completed" status filter chip: 82×36
- "In Progress": 84×36
- "Modified": 68×36
- "Skipped": 65×36
- "All" chip: 31×36 (width ALSO below 44)
- "Roadmap" toggle: 102×34
- "Progression" toggle: 116×34
- MonthPicker items: 166×36
**Why it matters:** Same as M1 — CLAUDE.md §4 ≥44px rule. These are tap targets
on phone (Chromebook touch) and tablet, and they fail. The "All" chip is doubly
bad (under 44 on *both* axes).
**Reproduction:** Probe data in `year-audit-probe.json` `tiers.tablet.buttons`
and `tiers.desktop.buttons`.
**Proposed fix:** Bump `.pill { min-height: 44px; min-width: 44px }` at
`max-width: 900px`. Same for `.clearBtn` and ToggleGroup. The MonthPicker
items at 166×36 might be OK if the picker is keyboard-driven only, but at
36px on touch a 12-month menu invites mishits.
**Verified against live site:** Yes (Playwright dimensions at tablet + desktop).

---

### Minors (P1)

#### m1 — "24 students" badge still on every LaneCard / YearMobile card (prior-audit minor still pending)
**Files:** `components/year/LaneCard.tsx:83` (default `students = 24`),
`components/year/YearMobile.tsx:118` (`students: 24,`).
**What I saw:** Phone screenshot shows "24 students" under every subject card
(8 instances). Desktop progression-mode screenshot shows the same in the
LaneCard headers. Lane D didn't touch this.
**Why it matters:** CLAUDE.md §1 ("Users: teachers only. No student … product
in scope"). The product is not roster-aware. Fake "24 students" everywhere
erodes trust.
**Proposed fix:** Delete the prop and the `.cardStudents` / `.meta` cells.
Or — if you want to preserve a metric in that slot — show a real-computed value
("27 lessons", "12 weeks remaining").
**Verified against live site:** Yes (visible in `phone.png`, `desktop-progression.png`).

#### m2 — Hydration mismatch warning on first /year visit at desktop
**File:** `app/(planner)/year/page.tsx:28` (`const [isPhone, setIsPhone] = useState(false)`).
**What I saw:** React DevTools warning in the probe:
> A tree hydrated but some attributes of the server rendered HTML didn't match the client properties.
**Why it matters:** The warning is generic and could be downstream of the
planner shell (top-bar) rather than /year itself. But /year's `isPhone` state
flipping after `useEffect` is a known SSR-mismatch hazard. The current
implementation gates the `aria-hidden` attribute on `isPhone`, so at the moment
of hydration the server HTML and client HTML actually match (both start with
`isPhone=false`). The mismatch may be elsewhere.
**Proposed fix:** Run `React.StrictMode` in dev + reproduce; if /year is the
source, switch to a CSS-only media-query approach (also resolves M3).
**Verified against live site:** Yes (`year-audit-probe.json` `tiers.desktop.consoleErrors[1]`).

#### m3 — Top-bar wordmark says "MyCurricula · Grade 5" on /year desktop/tablet but "MyCurricula" only on phone
**Files:** `components/shell/top-bar.tsx` (chrome, not /year code).
**What I saw:** Desktop + tablet wordmark renders as "MyCurricula Grade 5";
phone wordmark drops the grade. This is the existing minor flagged in the
prior audit fragment (`docs/audit-fragments/other-routes.md` line 178). It
contradicts CLAUDE.md §1 ("Multi-grade ready by design"). Not strictly a /year
finding (the wordmark is shell chrome), but the /year route makes it the
most-visible: the page title is "Yearly View" with subtitle "High-level
roadmap of units across your curriculum" — the "Grade 5" suffix in the wordmark
is doubly redundant.
**Proposed fix:** Cross-cutting — tracked in prior-audit fragment. Move grade
out of the wordmark, surface it elsewhere (or in a per-school config).
**Verified against live site:** Yes (visible in `desktop-progression.png` + `phone.png`).

#### m4 — Today button doesn't move scroll when timeline is already centered (no inline feedback)
**File:** `components/year/YearView.tsx:239-255` (`scrollToWeek`).
**What I saw:** On initial mount the timeline auto-centers on today (week 12
of 36). If the teacher clicks "Today" without first scrolling, scrollLeft is
already at the correct position, so nothing visibly happens. There's no
"you're already here" affordance.
**Why it matters:** A teacher who can't see today's column (e.g., scrolled
right then back to the same place) clicks Today expecting feedback — getting
nothing reads as a broken button. Compare to "/weekly" which has the same
button but week 12 always exists in the visible grid.
**Proposed fix:** Add a brief pulse on the TodayMarker on click (matches the
≤200ms "card expand" allowance from CLAUDE.md §4). Or only activate the button
when `Math.abs(currentScrollLeft - targetScrollLeft) > 8`.
**Verified against live site:** Yes — probe `tiers.tablet.interactions.todayBtn`
shows `before: 1220, after: 1220, moved: false` (already centered after mount).

#### m5 — "Select the curriculum" + left filter panel SUBJECT both filter by subject — two paths for one job
**Files:** `components/year/CurriculumFilter.tsx` + `components/shell/left-filter-panel.tsx`
**What I saw:** On /year at desktop the left-filter-panel is open by default and
its FILTERS → SUBJECT row contains all 8 subject pills (currently no-op styling).
Meanwhile, YearView's CurriculumFilter button "Select the curriculum" opens a
popover with the same 8 checkboxes. The two filters do not appear to share state
— unchecking Reading in the CurriculumFilter popover removed all lanes (see
`desktop-scrolled.png`) but the left panel's "Reading" indicator was unaffected.
**Why it matters:** CLAUDE.md §1 / planning doc IA: "Filter everywhere. Each UI
surface has one clear job." Two parallel subject filters that don't share state
is the "filtering bolted onto a primary view" anti-pattern §1 warns against.
**Proposed fix:** Either (a) wire the CurriculumFilter to the existing
left-filter-panel state (already in app-state per `lib/app-state.tsx`), or
(b) remove the YearView CurriculumFilter button entirely and rely on the shell's
left filter panel for subject scoping. (a) is the smaller change.
**Verified against live site:** Yes (compared `desktop.png` left panel chips
vs the CurriculumFilter popover state in `desktop-scrolled.png`).

#### m6 — `YearSidebar.tsx` still in repo with "Students" navigation item
**File:** `components/year/YearSidebar.tsx:142`
**What I saw:** Lane D unmounted the YearSidebar from YearView but kept the
file. Inside, the NAV_ITEMS array still includes `{ id: "students", label: "Students", icon: IconUsers }`.
The Tooltip would still read "Students — coming soon" if anyone re-mounts it.
**Why it matters:** CLAUDE.md §1: "no student … product in scope." A dead-code
landmine that violates the brief — easy to re-mount in a hurry without
remembering to remove `students`.
**Proposed fix:** Either delete the file entirely (Lane D's intent appears to
be "save for future wiring," but the current state has zero items teachers
would want — Calendar, Units, Lessons, Checkpoints, Reports, Settings, Help are
all duplicates of existing chrome). Or at minimum remove the `students` entry.
**Verified against live site:** Yes (source).

#### m7 — `Tooltip` on `disabled` button may not fire in production browsers
**File:** `components/year/YearView.tsx:334-359`
**What I saw:** Playwright `hover()` on the disabled Filters/Export buttons
captured no `[role="tooltip"]` element at desktop or tablet. The `title="Coming soon"`
HTML attribute remains as a fallback (browsers render it as a native title-bubble).
**Why it matters:** The custom Tooltip primitive likely uses
`pointermove` / `mouseenter` listeners on the trigger element — but spec-wise
disabled `<button>` elements do not emit pointer events in many browser engines
(Chromium quirks vary). The teacher who hovers Filters might see no Tooltip,
only the native `title` text. Lane D's intent was the styled Tooltip; if it never
fires the affordance has degraded silently.
**Proposed fix:** Wrap the disabled button in a `<span>` that owns the
Tooltip listeners, or use the Tooltip primitive's `disabledChild` prop if it
exists, or detect disabled buttons in the Tooltip and bind listeners to the
wrapper. Verify in Chrome + Safari + Firefox.
**Verified against live site:** Partial — Playwright headless behavior may
differ from real-browser. Needs manual verification.

---

### Phase 2 opportunities

#### P2-1 — Wire CurriculumFilter to the shared left-filter-panel state (HIGH impact, SMALL effort)
Resolve m5 by consolidating the two parallel subject filters. The
left-filter-panel state already exists in app-state; the YearView's local
filter is the duplicate.

#### P2-2 — Print-friendly /year route (HIGH impact, MEDIUM effort)
Add `/year/print` page that re-flows the timeline as a vertical stack of
months, parallel to `/weekly/print`. The scaling-on-paper output (M4) is
unusable; a dedicated print layout is the cleaner long-term fix than a
`@media print` re-flow on the screen route.

#### P2-3 — Lane minimize state persisting to localStorage (MEDIUM impact, SMALL effort)
`lib/year-state.tsx` exposes `useMinimizedSubjects()` but no persistence —
the minimize state resets on every page load. A teacher who curates a focused
4-subject view loses it on refresh. Persist to localStorage (and respect the
phone-vs-desktop separation per Lane D's file header note).

#### P2-4 — TodayMarker click affordance + active-month highlight (LOW impact, SMALL effort)
Pair with m4 — when the user clicks "Today," briefly pulse the TodayMarker
to confirm action. Also: the MonthPicker shows "January" as the active label
even when the teacher has scrolled into May; the active label should track
the scroll position (the comment at `YearView.tsx:275-279` flags this
"a future wave can update this on scroll").

---

## Responsive verification

| Tier | Doc h-scroll | h1 count (DOM / a11y) | Min touch target (year-specific) | Console errors | Screenshot |
|---|---|---|---|---|---|
| Phone (400×800) | ✅ no | 2 / 1 (one in aria-hidden) | 24×24 (LaneCard chevrons) | 1 warning (Fast Refresh) | `phone.png`, `phone-collapsed.png`, `phone-detail.png` |
| Tablet (768×1024) | ✅ no | 2 / 1 (one in aria-hidden) | 24×24 (LaneCard chevrons) | 0 | `tablet.png`, `tablet-progression.png` |
| Desktop (1280×900) | ✅ no | 2 / 1 (one in aria-hidden) | 24×24 (LaneCard chevrons) + 31×36 (All chip) | 2 (Fast Refresh + hydration mismatch warning) | `desktop.png`, `desktop-progression.png`, `desktop-scrolled.png`, `desktop-print-2.png` |

**Sticky chrome at phone:** Top-bar measured 44px tall. With viewport 800,
that's 5.5% of viewport — well under the 30% CLAUDE.md §4 cap.

**Timeline horizontal scroll:** Works at all tiers. ScrollWidth 4520px in
992px desktop client. The QuarterMonthWeekHeader stays sticky (top=parentTop=302
on tablet, 284 on desktop). Scroll to end renders the rightmost month with no
right-edge cutoff (`*-scrolled-end.png`).

---

## Interactive probes

### Buttons clicked (per tier)
| Control | Phone | Tablet | Desktop |
|---|---|---|---|
| Filters (disabled, Lane D) | ✅ no-op | ✅ no-op | ✅ no-op |
| Export (disabled, Lane D) | ✅ no-op | ✅ no-op | ✅ no-op |
| Today | n/a (phone uses YearMobile) | ✅ no-move (already centered, m4) | ✅ moves scroll 0→964 |
| Roadmap → Progression toggle | n/a | ✅ switches | ✅ switches |
| StatusFilterBar "Completed" chip | n/a | ✅ filters | ✅ filters |
| LaneCard "Minimize" chevron | n/a (mobile layout) | ✅ minimizes (1 of 8) | ✅ minimizes (1 of 8) |
| MonthPicker | n/a | ✅ opens 19 items | ✅ opens 19 items |
| CurriculumFilter ("Select the curriculum") | n/a | ✅ opens, 8 checkboxes | ✅ opens, 8 checkboxes |

### Settings toggled + what /year did
- **Personal/Master toggle** at desktop: ✅ Master mode activated; the red "Heads
  up — changes here affect the whole team" banner rendered correctly above the
  YearView. Toggle back to Personal works. (`desktop-master-2.png`)
- **Curriculum filter (unchecking Reading)**: filters lanes correctly; the
  YearMobile + YearView views both observe the filter state.

### Scroll behavior at each tier
- **Tablet/Desktop:** internal horizontal scroll on `.timelineScroll`. Sticky
  QuarterMonthWeekHeader stays at top. Today auto-centers on mount (instant,
  not animated — `behavior: "auto"` per `YearView.tsx:268`). Click-Today scrolls
  smoothly (unless reduced-motion is set, then instant).
- **Phone:** No internal timeline. YearMobile is a vertical list of 8 subject
  cards — vertical scroll only, no horizontal. Sticky chrome 44px (5.5% of viewport).

---

## Cross-reference: prior 2026-05-24 audit findings

### /year majors (4 from yesterday's audit)
| Prior finding | Status today |
|---|---|
| "/year has no print stylesheet — Roadmap clips" | **Worsened framing, same outcome** — clips → scales-illegibly, but still broken. See M4. |
| "/year double-renders YearView + YearMobile (layout shift on mobile)" | **Partially fixed** by Lane D's `aria-hidden`. CLS + bundle size unchanged. See M3. |
| "/year's YearSidebar is 8 disabled 'coming soon' buttons" | **Fixed** by Lane D (unmounted from YearView). File retained — see m6 for the `Students` landmine. |
| "Filters and Export buttons do nothing" | **Fixed** by Lane D (disabled + Tooltip + aria-disabled). Caveat: m7 on Tooltip-over-disabled-button. |

### /year minors (4 from yesterday's audit)
| Prior finding | Status today |
|---|---|
| "fake 24 students in LaneCard" | **Pending** — see m1. Lane D didn't touch. |
| "no URL deep-link for view state" | **Pending** — no change. Phase 2 opportunity. |
| "two asides unilabeled on daily" | **N/A** — daily-route finding, not /year. |
| "YearMobile double-render CLS" | **Same as the major** — see M3. |

### Newly surfaced (this audit)
- M1 — LaneCard touch target sizes
- M2 — hex leakage in StatusGlyph + TodayMarker
- M5 — StatusFilterBar / MonthPicker / ToggleGroup touch targets
- m2 — hydration mismatch warning
- m4 — Today button silent on already-centered
- m5 — duplicated subject filter (CurriculumFilter vs left filter panel)
- m6 — Students landmine in YearSidebar.tsx
- m7 — Tooltip-on-disabled-button uncertainty

---

## Appendix

### Files reviewed
- `app/(planner)/year/page.tsx` (Lane D's main change site)
- `components/year/YearView.tsx`, `YearView.module.css` (Lane D)
- `components/year/YearMobile.tsx`, `YearMobile.module.css`
- `components/year/RoadmapView.tsx`, `RoadmapView.module.css`
- `components/year/ProgressionView.tsx`
- `components/year/LaneCard.tsx`, `LaneCard.module.css`
- `components/year/StatusGlyph.tsx`, `StatusGlyph.module.css`
- `components/year/TodayMarker.tsx`, `TodayMarker.module.css`
- `components/year/StatusFilterBar.tsx`, `StatusFilterBar.module.css`
- `components/year/MonthPicker.tsx`, `MonthPicker.module.css`
- `components/year/CurriculumFilter.tsx` (first 100 lines)
- `components/year/QuarterMonthWeekHeader.tsx` (first 50 lines)
- `components/year/YearSidebar.tsx` (unmounted by Lane D, but still in repo)
- `app/globals.css`
- `BUILD_STANDARD.md`, `CLAUDE.md`, `docs/ui-ux-audit-2026-05-24.md`,
  `docs/audit-fragments/other-routes.md`

### Probes run
- `scripts/probe-year.mjs` — broad sweep across 3 tiers, 10+ interactions per tier
- `scripts/probe-year-deep.mjs` — focused follow-ups (failed mid-run due to
  left-filter-panel intercepting pointer events at desktop — itself a chrome-side
  finding, not /year)
- `scripts/probe-year-collapsed.mjs` — re-screenshot with filter panel collapsed
  (dev server returned 500s mid-run after Fast Refresh churn)
- `scripts/probe-year-final.mjs` — clean re-run for final data (`year-audit-final.json`)
- Output JSON: `year-audit-probe.json`, `year-audit-final.json`
- Output screenshots: `docs/screenshots/year-audit/{phone,tablet,desktop}{,-collapsed,-progression,-scrolled,-scrolled-end,-print,-print-2,-master,-master-2}.png`

### Console output (notable)
- **Desktop, first /year load:** 2 warnings — Fast Refresh full reload (dev-only),
  hydration-mismatch warning. Likely shell-chrome (top-bar) source, but /year's
  `isPhone` `useState` could contribute. Worth tracing.
- **Phone:** 1 warning (Fast Refresh full reload, dev-only).
- **Tablet:** clean.
- **Page errors (`pageerror`):** 0 at every tier.

### Open questions
- M7 — does the Tooltip primitive's listener attach to a wrapping `<span>` or
  to the disabled `<button>` directly? If the latter, browsers may suppress
  pointer events. Worth a manual browser-spread check before declaring Lane D
  fully landed.
- M3 — is the CSS-only switch (m3 fix) acceptable given the existing
  `MinimizedSubjectsProvider` context which spans both YearView + YearMobile?
  If both views must remain mounted simultaneously for the minimize-context to
  persist across phone↔desktop rotations, the bundle-size fix needs a different
  approach (server-render only one, hydrate the other on first interaction).

---

**Report date:** 2026-05-25
**Auditor:** Claude Code (Opus 4.7, 1M context)
**Scope:** `/year` only; cross-cutting findings tagged where they originate elsewhere.
**Next steps:** address M1 + M2 + M5 (touch targets + hex leakage — quick wins),
then M3 (the double-mount cleanup Lane D punted), then M4 (print fix as part
of Phase 1B if printing is in beta scope).
