# Full-session audit — 2026-05-25 evening → 2026-05-26

**Lane:** BK (full-session audit, read-only)
**Scope:** every commit on `schedule-and-auth-5.24` in the range
`cfa3f82..HEAD` — i.e. the 32 commits landed in the late-night Wave 1A,
the F1 calendar fix, the tooltip restyle, Wave 1B (school week + academic
year + holidays + Lane BJ critical fixes), and the two post-Wave 1.5
commits (`977bd57` Schedule-as-side-panel + `423a53e` Lane V research).
**Constraint:** no code changes. Read-only against committed files via
`git show HEAD:<path>`; uncommitted in-flight lanes (Lane BA/BB/BD/BG and
the new `GlobalRail`/`SubjectCalendar` modules) deliberately ignored.

---

## Executive summary

- **Total findings:** 3 blockers, 6 majors, 9 minors, 4 deferred = **22 findings.**
- **Overall posture:** **hold-for-fixes.** Top-3 blockers can each be
  fixed in <60 min and should land before the late-August beta gate.
  Nothing here is a "needs-rework" of a whole lane.
- **What works well:** the tokens-only discipline holds; the
  Button+Tooltip primitive pair is clean and consumed correctly by Lane
  Z's sweep on the routes it reached; the team/user scope split is
  rigorously applied across all four new hooks
  (`use-school-week`, `use-school-months`, `use-academic-year`,
  `use-holidays`); Lane BJ's three fixes are real and durable.

### Top 5 issues to fix first

1. **BLOCKER — `/schedule` tooltip coverage 14% (51 buttons).** Lane Z's
   universal sweep missed the entire Schedule view family. See
   `components/schedule/ScheduleDayPane.tsx`, `ScheduleBlock.tsx`,
   `SchedulePanel.tsx` — only 8 tooltip/title attrs total across 3 files.
   CLAUDE.md §4's onboarding-tooltip mandate is violated for the
   most-touched non-grid route.
2. **BLOCKER — `/settings/catch-up` 0% tooltip coverage (3 buttons).**
   `app/settings/catch-up/page.tsx:58-94` — On/Off toggle + "Open
   Catch-up screen →" button carry no tooltip. Lane Z missed this page
   entirely (it touched the planner `/catch-up` route but not
   `/settings/catch-up`).
3. **BLOCKER — RoadmapView / ProgressionView / YearMobile still read
   `DEFAULT_SCHOOL_WEEK` constant, not `useSchoolWeek()`.** Wave 1B
   plumbed the configurable school week into Settings and persisted it
   to `mycurricula:team:school-week-days`, but the three /year consumer
   files still import the hardcoded constant from `lib/year-calendar.ts`.
   A teacher who switches to Mon-Fri sees the labels still say Su-Th.
   Lane BJ flagged this as deferred minor — re-classified BLOCKER here
   because CLAUDE.md §1 ("Never hard-code the weekday set — every
   calendar surface derives its days from this configuration") is the
   one rule the planning doc highlights with bold.
4. **MAJOR — `/year/print` 10% tooltip coverage on 41 buttons.** Print
   surface may have fewer interactive controls per-spec, but 90% of
   buttons missing onboarding text on a teacher-facing surface still
   misses the §4 mandate. Likely audit-readiness #43 ("did the user
   actually ask for this?") cuts the priority — but the buttons are
   there and they're untooltipped.
5. **MAJOR — Live Clock not on settings routes.** User asked "live clock
   on all pages". `app/(planner)/layout.tsx` mounts `<Clock />`;
   `app/settings/layout.tsx` does not. Settings is reached from every
   route's avatar / IconRail gear; "all pages" arguably includes it.
   Either mount Clock in the settings layout too, or document the
   intentional exclusion.

---

## Per-commit verification

For each commit (newest first), audit-pass rate against §5 (15+ failure
modes) and §6 (pre-audit checklist) and concrete findings. **PASS** = no
findings concretely tied to this commit's diff; **FINDINGS** = see
findings detail below.

| SHA | Subject | §5/§6 verdict | Notes |
|---|---|---|---|
| `423a53e` | docs: Lane V research | PASS | Research doc only — no code surface to audit. 368 lines all under docs/. |
| `977bd57` | Wave 1.5 partial — Schedule as side panel | **FINDINGS** | F#15, F#16 below. Schedule tab removed from top-bar tabs (`VIEWS` array no longer lists Schedule); new `SchedulePanel.tsx` created with **only 4 tooltip/title attrs across 304 lines**. The IconRail gained a Schedule trigger (correct), but the panel itself missed Lane Z's voice. |
| `1ac8d67` | Wave 1B — school week + academic year + holidays | **FINDINGS** | F#3 (BLOCKER), F#9, F#10 below. Lane BJ already fixed three things; remaining gaps catalogued. |
| `151b472` | Stylish black tooltips + onboarding tips on top-bar tabs | PASS | Token additions to `app/tokens.css` (`--tooltip-bg`, `--tooltip-fg`); top-bar tabs got `tooltip` attrs. User explicitly asked "popups should be stylish black bg light text" — satisfied. |
| `8ad1ded` | Universal onboarding-voice tooltip sweep (Lane Z) | **FINDINGS** | F#1 (BLOCKER), F#2 (BLOCKER), F#4 (MAJOR), F#11, F#12 below. The sweep delivers good coverage on the routes it reached (weekly 81-91%, daily 68%) but skipped /schedule, /settings/catch-up, /year/print, and parts of /year. |
| `b19b93a` | Live clock + page titles on every major view (Lane BE) | **FINDINGS** | F#5 (MAJOR), F#7. Clock mounted in (planner)/layout.tsx as floating bottom-right chip; missing from settings/layout.tsx. Page titles delivered via bespoke h1+subtitle pattern (not via `PageHeader` primitive on /year and /weekly /daily; primitive used on the 3 settings pages only). |
| `39c9b9b` | /settings landing + /settings/curriculum + unify access | PASS | Landing redirect logic + last-visited persistence is clean; layout sidebar has 44px min-height (Lane BJ's earlier read of 17px was against a stale build). User's "free-text curriculum label" delivered via existing P′ data layer + new editor UI. |
| `efd551f` | Button.tooltip prop + Tooltip disabled-button fallback (Lane X) | PASS | `components/ui/Button.tsx` + `Tooltip.tsx` are well-commented and idiomatic. Both the `title=` fallback and the wrapper-span disabled-trigger path are implemented and documented. |
| `e0cb380` | /year: header month bands no longer get span:1 from empty months | PASS | F1 from `audit-roadmap-progression-days-2026-05-25.md` — fixed in `QuarterMonthWeekHeader.tsx` with the proposed `.filter((m) => m.weeks > 0)` shape. Confirmed via `git show`. |
| `76ed08d` | docs: queue Lane Y-cal | PASS | Doc-only. |
| `7c375b7` | docs: queue Lane BG | PASS | Doc-only. |
| `d8c3d2a` | docs: queue Wave 1.5 | PASS | Doc-only. |
| `b0110de` | CLAUDE.md: mandate onboarding explanations | PASS | The §4 addition introduces the rule that Lane Z then enforces. Doc-only. |
| `9cb5a36` | icon-rail: settings gear → real `<Link>` | PASS | One-line change, mechanically correct. |
| `495f6dc` | docs: queued work pause | PASS | Doc-only. |
| `8f70a88` | school-months data layer + useSchoolMonths hook | PASS | Hook follows the SSR-safe pattern from §5.13; `allYearMonths()` returns 12 entries; mock fixtures untouched. |
| `8239986` | m3 wordmark — curriculumLabel free text | PASS | `lib/app-state.tsx:152` defaults to "Grade 5" with the legacy-key migration; `top-bar.tsx:214` renders the suffix only when set. User's "free-text not just grade number" — satisfied. |
| `c77ca07` | /year/print dedicated route | PASS | New `app/(planner)/year/print/page.tsx` + `print.module.css`. F#13 below applies (10% tooltip coverage) but the route is print-targeted so the bar is lower. |
| `e873089` | /year M3+m2 CSS-only dual-mount | PASS | F#14 below is a *probe artifact* (h1=2 in Playwright DOM count) but not an a11y bug — the `aria-hidden=true` on the inactive shell is correct. Document explicitly. |
| `09890a3` | /year eyebrow rail sticky-left + chameleon gradient width | PASS | CSS-only fix. |
| `9fdd92c` | docs: research deferred /year items | PASS | Doc-only. |
| `c4876a5` | /year visual wave — tighter zoom + /weekly subject buttons + sticky lane column | PASS | Multi-file CSS update. No findings against committed CSS. |
| `4bd3c0f` | /daily list-mode right-rail covered list + filter panel | PASS | CSS + small JSX change. |
| `e3f0f25` | year-audit m5+m4+M5 — CurriculumFilter share + Today pulse + ToggleGroup note | PASS | Three small audit follow-ups. |
| `070e8c2` | year-audit m1+m6 — kill "Students" landmines | PASS | The `/year` "24 students" badge was correctly removed; CurriculumFilter/YearSidebar copy now teacher-only. CLAUDE.md §1 "teachers only" — re-aligned. |
| `da4bcc2` | year-audit M2+M5 — hex purge + touch targets | PASS | Confirmed via grep: zero hex remaining in `components/year/` (only in code comments). |
| `b47c9d7` | year-audit M1+m1 — LaneCard hit area + drop "24 students" badge | PASS | LaneCard minimize button is now 44×44. |
| `ff4074a` | /year audit deliverables — report + probes + screenshots | PASS | Doc + probe scripts. |
| `be87ec7` | audit majors — /year cleanup | PASS | Dead Filters/Export removed. |
| `329010f` | audit major — hex purge → tokens (lesson-flow + lesson-card) | PASS | Verified via grep — surviving hex usage in `lesson-flow.tsx` is the documented §3.1 spec exception; `resource-type-pill.tsx` is the documented bespoke pill exception. |
| `0867ce1` | audit P1 blockers — ListRow checkbox + page h1 + Standards2 dedup | PASS | ListRow now uses real `<button>`, page h1s land, Standards2 dedupe is real. |
| `b4071d6` | audit P1 blocker — top-bar overflow menu | PASS | TopBarMoreMenu collapses cleanly; verified the cascade unchanged. |

**Pass rate:** 27 of 32 commits land clean. 5 commits have new findings, all
caught downstream of the commits that introduced them (the universal
sweep skipped routes; the Wave 1B school-week didn't fully propagate;
Lane BE didn't reach Settings; etc.).

---

## User-asks scorecard

| User ask | Status | Evidence |
|---|---|---|
| "all 12 months in yearly" (default) | **delivered** | `lib/use-school-months.ts` default + `allYearMonths()` returns 12; YearView consumes via `useSchoolMonths()` |
| "settings to pick which months show" | **delivered** | `app/settings/curriculum/page.tsx:200-280` — 12 month toggles + preset dropdown |
| "free-text curriculum label" not just grade number | **delivered** | `lib/app-state.tsx:152` (default "Grade 5") + Settings UI editor (text input) at `app/settings/curriculum/page.tsx` |
| "settings button for left icon bar" | **delivered (partial)** | `components/daily/IconRail.tsx:298` Settings gear is real `<Link href="/settings">`. Note: the Daily IconRail is the *only* route with this rail today — `/weekly /year /catch-up /subject /schedule` reach Settings only via the avatar. Uncommitted Lane CC (`GlobalRail.tsx`) addresses this but is OUT OF SCOPE for this audit. |
| "every button popup explanation on hover" | **partial** | CLAUDE.md §4 rule added; Button.tooltip prop landed; Lane Z swept ~70% of buttons; **failed on /schedule (14%), /settings/catch-up (0%), /year/print (10%), parts of /year (49%) and /catch-up (32%)**. |
| "popups should be stylish black bg light text" | **delivered** | `app/tokens.css` `--tooltip-bg` / `--tooltip-fg` tokens + `components/ui/Tooltip.module.css` updated. |
| "live clock on all pages" | **partial** | `<Clock />` in `(planner)/layout.tsx` — visible on all 6 planner routes. **Missing from `app/settings/layout.tsx`** (4 settings pages have no Clock). |
| "title + subtitle on every major view" | **delivered** | All 4 planner views and all 3 settings sub-pages carry an h1 + subtitle pair. /year uses a bespoke pattern (`h1.pageTitle` + `p.pageSubtitle`) instead of the `PageHeader` primitive — design choice, not a violation. |
| "settings shared with team vs user-private" | **delivered** | All four new hooks use `mycurricula:team:*` keys (curriculum-label, school-months, school-week-days, academic-year-start/end, holidays). User-private would be `mycurricula:user:*` (settings-last-page, view-mode prefs). |
| "academic year start + end dates" | **delivered** | `lib/use-academic-year.ts` (308 LOC, SSR-safe, validates clamp); Settings UI at `app/settings/curriculum/page.tsx` Section 3; RoadmapView consumes `yearStart` via `useAcademicYear()`. |
| "school week configurable" | **partial — BLOCKER** | Hook + Settings UI delivered; **RoadmapView/ProgressionView/YearMobile still read `DEFAULT_SCHOOL_WEEK` constant**. See F#3 below. |
| "holidays in scope" | **delivered (with caveat)** | `lib/use-holidays.ts` + Settings UI Section 5 + UnitBar overlay (Lane BJ's holiday-overlay anchor fix). Caveat: weekly/daily views don't yet visualize holidays (out of Wave 1B scope per the doc). |
| "audit roadmap/progression day+week accuracy" | **delivered** | `audit-roadmap-progression-days-2026-05-25.md`'s F1/F2/F3 all addressed (F1 in `e0cb380`, F2+F3 in Lane BJ's fixes inside `1ac8d67`). |
| F2/F3 calendar bugs | **delivered** | Lane BJ's commit message + audit doc confirm both fixes applied. |
| "schedule out of top tabs → side panel" | **partial** | `977bd57` removed Schedule from `VIEWS` array, new SchedulePanel component exists. **The trigger wiring lives in `IconRail.tsx` — only reachable from Daily route** (the icon rail is Daily-only today). Schedule is unreachable from /weekly, /year, /catch-up unless the user navigates to /daily first. Plus the Wave 1.5 doc itself says "in flight, do not audit" but the commit landed. |

**Scorecard:** 9 delivered, 5 partial. Two partials (school-week
propagation, schedule reachability) graduate to BLOCKERS in the findings
detail below.

---

## CLAUDE.md compliance

### §1 — multi-grade-ready, teacher-only, school-week + schedule configurable

| Sub-rule | Verdict | Evidence |
|---|---|---|
| Multi-grade by design — no hardcoded "Grade 5" outside the configurable default | **PASS** | `grep` across `lib/` finds only `curriculumLabel: "Grade 5"` as the FALLBACK_USER default (documented sample) and references in comments/docstrings. The type system (`SubjectId`, `Lesson`, `Unit`) carries no grade field, so nothing breaks at grade boundaries. |
| Teacher-only — no student/parent/admin scope | **PASS** | "24 students" badge purged in `070e8c2`. Verified — no remaining "students" copy outside docs. |
| Team-vs-personal scoping for settings | **PASS** | All five Settings hook keys carry `:team:` or `:user:` namespacing. |
| School-week configurable | **FAIL (BLOCKER F#3)** | Settings UI saves it; planner views don't read the hook. |
| Schedule customizable + rotating cycles | **DEFERRED** | No schedule-rotation work landed this session (rotation captured in onboarding only; the brief explicitly defers it). |

### §4 — design system rules

| Sub-rule | Verdict | Evidence |
|---|---|---|
| Tokens-only, no hex in components/ or lib/ | **PASS (with documented exceptions)** | Grep finds hex only in: (a) `lesson-flow.tsx` pinColor §3.1 documented exception, (b) `resource-type-pill.tsx` spec-locked exception (commented), (c) `google-sign-in-button.tsx` Google brand SVG (legit), (d) comments noting contrast ratios. |
| ≥44px touch targets phone/tablet | **MOSTLY PASS** | Settings sidebar nav: 44px (committed CSS). Button primitive inflates on `(max-width: 900px)`. LaneCard minimize button fixed. **Holiday submit button** flagged by Lane BJ as "40px visual but Button ::before inflates" — verified as compliant per their note. |
| Responsive at three tiers (360-480 / 600-900 / 1024-1920) | **PASS** | No document h-scroll measured at any tier (probe confirms `htmlScrollWidth === htmlClientWidth` everywhere it captured). |
| Reduced-motion respected | **PASS** | New `app/settings/layout.module.css` has the reduced-motion block; Clock.tsx documents the no-motion design. |
| **NEW** onboarding-tooltip mandate on every interactive control + named panel | **PARTIAL — BLOCKER** | Lane Z achieved 70%+ on /weekly /daily /settings/{curriculum, lesson-templates} but **dropped** /schedule (14%), /settings/catch-up (0%), /year/print (10%), parts of /year (49%) and /catch-up (32%). |

### §5 (do) — read spec, recreate faithfully, reuse vocabulary, multi-grade-scoping in data, single-purpose surfaces, build infrastructure data shapes, lint+format

**PASS.** The four new hooks (`use-school-week`, `use-academic-year`,
`use-holidays`, `use-school-months`) mirror `use-school-months.ts`
exactly — same SSR-safe pattern, same cross-tab `storage` listener, same
`hydratedRef` gate. The settings page reuses `SettingsCard` and
`PageHeader` primitives instead of inventing card chrome.

### §6 (do not) — out-of-phase, theme colors in tailwind, hardcoded hex/fonts, Documents/ imports, breaking forking model, confirm dialogs for Master, single-grade assumption, hardcoded school-week, hardcoded daily-schedule

**Mostly PASS.** One concrete violation:

- **Hardcoded school-week.** RoadmapView/ProgressionView/YearMobile
  hardcode `DEFAULT_SCHOOL_WEEK` (F#3, BLOCKER).

The forking model is untouched; no confirm dialogs were added for
Master; no Documents/ imports; tailwind.config.ts still has no theme
colors.

---

## Live probe results

Run via `scripts/probe-lane-bk-audit.mjs` against a fresh dev server on
`localhost:3000` with `Authorization: Bearer <CLAUDE_BYPASS_TOKEN>`. The
canonical run completed on a fresh `.next` build before webpack-chunk
corruption made subsequent runs flaky (Lane BJ documented the same
issue). Findings reproducible from `docs/screenshots/lane-bk-audit/*`.

| Route | Tier | doc h-scroll | h1 count | btn tot | tooltip % | console errors | screenshot |
|---|---|---|---|---|---|---|---|
| /weekly | phone | NO | 1 | 174 | 87% | 1 (dev-mode segment-explorer noise) | `weekly__phone.png` |
| /weekly | tablet | NO | 1 | 282 | 81% | 1 (same) | `weekly__tablet.png` |
| /weekly | desktop | NO | 1 | 282 | 81% | 1 | `weekly__desktop.png` |
| /daily | phone | NO | 1 | 146 | 68% | 1 | `daily__phone.png` |
| /daily | tablet | NO | 1 | 146 | 68% | 1 | `daily__tablet.png` |
| /daily | desktop | NO | 1 | 146 | 68% | 1 | `daily__desktop.png` |
| /year | phone | NO | **2** | 74 | **49%** | 4 (404s on optional fonts) | `year__phone.png` |
| /year | tablet | NO | 2 | 74 | 49% | 4 | `year__tablet.png` |
| /year | desktop | NO | 2 | 74 | 49% | 4 | `year__desktop.png` |
| /catch-up | phone | NO | 1 | 53 | **32%** | 1 | `catch-up__phone.png` |
| /catch-up | tablet | NO | 1 | 53 | 32% | 1 | `catch-up__tablet.png` |
| /catch-up | desktop | NO | 1 | 53 | 32% | 1 | `catch-up__desktop.png` |
| /subject (→ /subject/math) | * | * | * | * | * | 500 from dev-mode webpack chunk loss | * |
| /schedule | phone | NO | 1 | 51 | **14%** | 2 | `schedule__phone.png` |
| /schedule | tablet | NO | 1 | 51 | 14% | 2 | `schedule__tablet.png` |
| /schedule | desktop | NO | 1 | 51 | 14% | 2 | `schedule__desktop.png` |
| /settings (→ /settings/curriculum) | phone | NO | 1 | 20 | 100% | redirect chain | `settings__phone.png` |
| /settings/curriculum | desktop | NO | 1 | 20 | 100% | 1 | `settings-curriculum__desktop.png` |
| /settings/appearance | desktop | NO | 1 | 19 | **47%** | 1 | `settings-appearance__desktop.png` |
| /settings/catch-up | desktop | NO | 1 | 3 | **0%** | 4 | `settings-catch-up__desktop.png` |
| /settings/lesson-templates | desktop | NO | 1 | 16 | 100% | 4 | `settings-lesson-templates__desktop.png` |
| /year/print | desktop | NO | 1 | 41 | **10%** | 4 | `year-print__desktop.png` |

**Highlights:**

- **NO document horizontal scroll at any route × tier.** RES-CRIT-001's
  guarantee holds; the Wave 1A/1B work didn't regress it.
- **`/year` h1=2.** Probe artifact: YearView + YearMobile both mount;
  the inactive shell carries `aria-hidden=true`. A11y tree is correct
  (one h1 announced); DOM count is two. Not a code bug — flagged as a
  documentation gap (a future audit should note the dual-mount h1 count
  is expected).
- **Console errors are mostly dev-mode noise.** The "segment-explorer
  module not found" + 404s on optional fonts come from the Next dev
  bundler, not the committed app. Reproducible only in dev mode; not a
  ship-blocker.
- **Tooltip coverage variance is the audit's headline issue.** Routes
  Lane Z directly walked (weekly, daily, settings/curriculum,
  settings/lesson-templates) sit at 68-100%. Routes Lane Z missed or
  partial-walked (schedule, settings/catch-up, year/print, catch-up,
  year) sit at 0-49%. The user explicitly asked for "every button
  popup" — this is the most concrete unmet ask in the session.

---

## Findings detail

### F#1 — BLOCKER — `/schedule` tooltip coverage 14% (51 buttons)

- **Where:** `components/schedule/ScheduleDayPane.tsx`,
  `components/schedule/ScheduleBlock.tsx`,
  `components/schedule/SchedulePanel.tsx`.
- **What I saw:** grep finds 8 total `title=` or `tooltip=` attributes
  across all three files. Probe measured 7 of 51 rendered buttons
  carrying a title (14%).
- **Why it matters:** CLAUDE.md §4 says "every interactive control + every
  named panel needs a tooltip in onboarding voice." Lane Z's commit
  message claims "universal" coverage; on the most-recently-redesigned
  view it's 14%.
- **Proposed fix:** dispatch a follow-up Lane Z′ that walks
  `components/schedule/*.tsx` with the tooltip-copy library from
  `docs/research-settings-and-plan-2026-05-25.md` §3.4. Estimated ~25 min.

### F#2 — BLOCKER — `/settings/catch-up` 0% tooltip coverage (3 buttons)

- **Where:** `app/settings/catch-up/page.tsx:58-94`.
- **What I saw:** the ToggleGroup options "On"/"Off" have no `title=`
  on the ToggleGroup itself; the "Open Catch-up screen →" Button (line
  93) has no `tooltip=` prop.
- **Why it matters:** same §4 mandate; this is a settings page so
  first-time teachers landing here will not know what "On" / "Off"
  refer to without context.
- **Proposed fix:** add `tooltip` to the Button and per-option `title`
  to the ToggleGroup options.

### F#3 — BLOCKER — RoadmapView/ProgressionView/YearMobile read DEFAULT_SCHOOL_WEEK, not useSchoolWeek()

- **Where:** `components/year/RoadmapView.tsx:31`,
  `components/year/ProgressionView.tsx:29-30`,
  `components/year/YearMobile.tsx:23`. All three import
  `DEFAULT_SCHOOL_WEEK` from `lib/year-calendar.ts` and use it directly
  for `schoolWeekLen` and per-day labels.
- **What I saw:** the Settings UI persists the user's chosen school
  week to `mycurricula:team:school-week-days`. The hook is read by
  `app/settings/curriculum/page.tsx` and by Lane BJ's holiday-overlay
  fix in `UnitBar.tsx`. But the three Year-view consumers above ignore
  it.
- **Why it matters:** CLAUDE.md §1 names this as a hard rule. A
  Mon-Fri school configures the week in Settings, then sees Su-Th
  column labels on Roadmap and Progression. Lane BJ's audit deferred
  this as a "minor" because lessons remain 1:1-by-index correct; I'm
  re-classifying it BLOCKER because the visible-label mismatch is the
  exact failure mode CLAUDE.md §1 calls out.
- **Proposed fix:** replace the three `DEFAULT_SCHOOL_WEEK` imports
  with `useSchoolWeek()` calls. ~15-20 min if the hook returns the same
  shape; longer if the call sites need refactoring to pass through a
  derived `schoolWeekLen`.

### F#4 — MAJOR — `/year/print` 10% tooltip coverage (41 buttons)

- **Where:** `app/(planner)/year/print/page.tsx` and the descendant
  print components.
- **What I saw:** 41 buttons in the rendered tree (mostly month / week
  jump triggers and the print/back chrome) carry 4 title attrs.
- **Why it matters:** print surfaces are usually less interactive, but
  41 buttons IS interactive. The §4 mandate doesn't exempt print.
- **Proposed fix:** if these are visual buttons mostly for layout
  (carrying no real action), they should be plain `<span>`. If real
  actions, tooltip them.

### F#5 — MAJOR — Live Clock missing from /settings/*

- **Where:** `app/settings/layout.tsx` (no `<Clock />` mount).
- **What I saw:** the user asked for "live clock on all pages"; the
  planner layout mounts Clock; the settings layout does not.
- **Why it matters:** Settings is reached from every planner route's
  avatar / IconRail gear, and a teacher inside Settings still wants to
  know "what time is it" — same rationale Lane BE used for the planner.
- **Proposed fix:** add `<Clock />` to `app/settings/layout.tsx` (one
  line). Or document the deliberate exclusion in the layout file.

### F#6 — MAJOR — /catch-up tooltip coverage 32% (53 buttons)

- **Where:** the planner `/catch-up` route — `components/catchup/*`.
- **What I saw:** probe captured 17 of 53 rendered buttons with
  title/tooltip. Lane Z touched `CatchupRow.tsx` (added 7 tooltips) and
  `BulkActionBar.tsx` (added 36 LOC of tooltips) — the per-row tooltips
  landed but the bulk-action variants + status chip filters didn't get
  full coverage.
- **Why it matters:** same §4 mandate; /catch-up is a primary triage
  surface.
- **Proposed fix:** finish the sweep on `CatchupScreen.tsx` (the parent
  shell), `BulkActionBar.tsx` remaining variants, and the status filter
  chip row.

### F#7 — MAJOR — /settings/appearance tooltip coverage 47% (19 buttons)

- **Where:** `app/settings/appearance/page.tsx` + descendant components
  (`subject-colors.tsx`, `style-picker.tsx`, `palette-toggle.tsx`).
- **What I saw:** about half the buttons carry tooltips; the subject
  color swatches and the hierarchy-labels save buttons don't.
- **Why it matters:** Appearance is a high-touch settings page;
  teachers re-coloring subjects will benefit most from onboarding
  tooltips.
- **Proposed fix:** sweep the remaining 10 buttons.

### F#8 — MAJOR — Schedule unreachable except from /daily

- **Where:** `components/daily/IconRail.tsx` carries the Schedule-panel
  trigger; the IconRail mounts only on the Daily route. The Schedule
  tab was removed from `VIEWS` in `components/shell/top-bar.tsx` per
  Wave 1.5 partial commit `977bd57`.
- **What I saw:** A teacher on /weekly, /year, /catch-up, /subject
  cannot open the Schedule panel without first navigating to /daily.
- **Why it matters:** The Wave 1.5 plan says the rail-arrangement
  system that would surface Schedule on every route is a follow-up
  (Lane CC `GlobalRail.tsx`, uncommitted). Until that lands, a primary
  feature regressed from "one click in the tab strip" to "two clicks
  via /daily-IconRail-Schedule".
- **Proposed fix:** either (a) restore the Schedule tab to `VIEWS`
  temporarily, (b) mount the IconRail or the Schedule trigger as a
  top-bar More-menu entry on non-Daily routes, or (c) prioritize Lane
  CC `GlobalRail` to land same wave.

### F#9 — MINOR — Section-comment typo in curriculum page

- **Where:** `app/settings/curriculum/page.tsx:646`.
- **What I saw:** Section 5 (Holidays) has a `// ── Section 4 — Holidays`
  header. With Academic Year inserted as Section 3 / re-numbering, the
  Holidays section is now Section 5. Lane BJ noted this; not yet fixed.
- **Why it matters:** Cosmetic; future audits will get tripped up.
- **Proposed fix:** one-character edit.

### F#10 — MINOR — `PlaceholderSection` is dead code (intentional)

- **Where:** `app/settings/curriculum/page.tsx:811-828`.
- **What I saw:** unused function carrying an eslint-disable. Lane BJ
  noted this; the comment explicitly says "kept for future cards." OK
  as documented; flagged so a future audit doesn't re-find it.

### F#11 — MINOR — Native `<input type="date">` styling on phone

- **Where:** `app/settings/curriculum/page.module.css`.
- **What I saw:** native date pickers look unstyled on phone. Acceptable
  for Phase 1A — locale-aware + keyboard-accessible. Lane BJ flagged.
- **Proposed fix:** custom `components/ui/DatePicker.tsx` primitive,
  scheduled for a future wave.

### F#12 — MINOR — /year header h1=2 (probe artifact, not a real bug)

- **Where:** `components/year/YearView.tsx:361` + `YearMobile.tsx:134`.
- **What I saw:** both shells render `<h1>Yearly View</h1>`; one is
  `aria-hidden=true`. Playwright's `querySelectorAll("h1")` counts DOM,
  not a11y tree, so it reports h1=2.
- **Why it matters:** it's a probe trap — a future agent measuring h1
  count and not knowing about the dual-mount will file a false
  blocker. The committed pattern is intentional and documented in
  `app/(planner)/year/page.tsx` comments.
- **Proposed fix:** either (a) leave + document in audit-readiness as a
  known probe trap, or (b) refactor so only one shell renders h1 and
  the other carries a different element (probably more work than the
  value).

### F#13 — MINOR — Onboarding rotation captured + discarded post-onboarding

- **Where:** `components/onboarding/steps/rotation-step.tsx` writes to
  `OnboardingData.rotation` + `.cycleLength`; nothing post-onboarding
  consumes them.
- **What I saw:** research doc `research-settings-and-plan-2026-05-25.md`
  flagged this; no settings UI exists yet. Listed in user's "schedule
  customizable including rotating cycles" ask (CLAUDE.md §1) as
  deferred — the brief's open questions explicitly defer it. Logged as
  background for the next planning round.

### F#14 — MINOR — settings-layout sidebar nav at 17px (already fixed in committed CSS)

- **Where:** `app/settings/layout.module.css`.
- **What I saw:** Lane BJ's audit reported this as MAJOR; the committed
  CSS at HEAD has `.tabLink { min-height: 44px }` (line 55) and
  reaffirms it on phone (line 141). The reported 17px was likely
  measured against a stale dev-mode build before HMR settled.
- **Verdict:** RESOLVED. Logged so future audits don't re-find it.

### F#15 — MINOR — SchedulePanel.tsx tooltip surface low

- **Where:** `components/schedule/SchedulePanel.tsx` — 304 LOC, only 4
  title/tooltip attrs.
- **What I saw:** the new SchedulePanel landed in `977bd57` did not
  pick up Lane Z's voice — Lane Z committed before SchedulePanel was
  created.
- **Proposed fix:** apply Lane Z's voice library to the new panel.

### F#16 — MINOR — IconRail tooltip on Schedule trigger inconsistent voice

- **Where:** `components/daily/IconRail.tsx` Schedule trigger button.
- **What I saw:** the new Schedule trigger has a tooltip but its
  onboarding voice doesn't fully match the library — the existing rail
  triggers say "Today's lessons + schedule" but the trigger calls itself
  "Schedule" alone.
- **Proposed fix:** unify voice — "Schedule — today's time blocks".

### F#17 — MINOR — `/year/print` button density vs role unclear

- **Where:** `app/(planner)/year/print/page.tsx`.
- **What I saw:** 41 buttons rendered on the print route — that's high
  for a print surface. Are they all real interactive controls or
  decorative spans rendered with `<button>`?
- **Proposed fix:** audit-readiness for the next pass — distinguish
  `<button>` (interactive) vs `<span role="presentation">` for visual
  chrome on print.

### F#18 — DEFERRED — Cross-tab hydration debounce

- Lane BJ flagged. Acceptable for Phase 1A.

### F#19 — DEFERRED — Schedule rotation post-onboarding state surface

- See F#13.

### F#20 — DEFERRED — Holiday visualization on /weekly + /daily

- Wave 1B scoped this to /year only. Logged for the next holiday wave.

### F#21 — DEFERRED — Lane BG (subject-tinted chameleon calendar)

- Uncommitted. Out of scope per the brief.

### F#22 — DEFERRED — Lane CC (GlobalRail)

- Uncommitted (`components/shell/GlobalRail.tsx` is untracked). Out of
  scope per the brief.

---

## Audit-readiness checklist meta-review

The checklist in `research-settings-and-plan-2026-05-25.md` §5 caught
**most** of these. Reviewing each rule against this session's findings:

- §5.1 (read user's screenshot literally) — not exercised this session.
- §5.2 (probe / reality matching) — Lane BJ documented the dev-server
  webpack-cache decay problem; this audit reproduced it. **Suggested
  new rule:** §5.2.5 — "When two dev servers coexist on the same
  `.next/` they corrupt each other's webpack chunks; always kill all
  node processes + `rm -rf .next` before probing."
- §5.3 (build environment hygiene) — exercised heavily; the orphan
  `next dev` problem is *the* environmental hazard on this branch.
- §5.4 (affordance discovery) — exercised at F#8 (Schedule reachability).
- §5.5 (cross-lane file ownership) — Wave 1A's W/X/Y coordination
  worked cleanly because the plan declared section ownership in
  advance.
- §5.6 (header / chrome conflicts) — exercised at F#8 (Schedule tab
  removal regressed reachability).
- §5.7 (sticky/overflow/scroll) — RES-CRIT-001 / 002 / TopBarMoreMenu
  hold. No regressions found.
- §5.8 (tokens, colors, palette) — exercised cleanly; the spec-locked
  exceptions are documented.
- §5.9 (a11y) — exercised; one new failure mode found (F#3 — labels
  out of sync with data).
- §5.10 (motion + reduced-motion) — PASS; new files all carry the
  prefers-reduced-motion block.
- §5.11 (forking model integrity) — untouched this session.
- §5.12 (data shape rules) — F#3 violates the school-week rule.
- §5.13 (persistence + hydration) — PASS; all four new hooks follow
  the SSR-safe pattern.
- §5.14 (gut-check) — exercised; the brief defers rotation, holidays-
  on-weekly, etc. correctly.

**Suggested additions:**

- **§5.7.5** — "When the user asks for `X on every page`, count the
  layouts. App/(planner)/layout.tsx mounts the chrome for 6 planner
  routes; app/settings/layout.tsx mounts the chrome for 4 settings
  routes. 'Every page' means BOTH layouts." Would have caught F#5.
- **§5.15** — "After a universal sweep lane lands, immediately enumerate
  the routes it touched vs the routes it didn't. Coverage by file count
  is not coverage by route — Lane Z touched 50+ files but missed entire
  routes." Would have caught F#1, F#2, F#4, F#6, F#7.
- **§5.16** — "When a tab is removed from `top-bar.tsx`'s `VIEWS`
  array, audit whether its target route is reachable from every other
  route's chrome. Removing a tab without confirming the trigger lands
  on every route's chrome regresses reachability." Would have caught
  F#8.

---

## Open questions for the user

1. **Lane Z′ follow-up — is the universal-sweep gap (F#1, F#2, F#4,
   F#6, F#7) a single fix-it lane or a bundled "polish before beta"
   wave?** Suggested split: a 90-min Lane Z′ to close /schedule,
   /settings/catch-up, /year/print, /catch-up, /settings/appearance.

2. **Schedule reachability (F#8) — restore the tab temporarily, or
   block the beta on Lane CC GlobalRail landing first?** The Wave 1.5
   partial commit removed the tab without confirming the trigger
   reaches every route.

3. **Holiday visualization scope — should /weekly and /daily show
   holiday markers in Phase 1A, or is /year-only acceptable for beta?**
   The data layer exists in `lib/use-holidays.ts`; the consumer wiring
   is the work.

4. **`/year/print` button volume (F#17) — these are interactive or
   decorative?** Determines whether F#4's tooltip gap is real or a
   misclassification.

5. **F#12 dual-mount h1 — document the pattern as a known probe trap,
   or refactor to one-h1?** Trade-off: refactor cost vs ongoing audit
   noise.

---

## Probe environment notes

Reproducing this audit's probe needs:

- All node processes killed (`Get-Process node | Stop-Process`).
- `.next/` removed (`Remove-Item -Recurse -Force .next`).
- Single fresh `npm run dev` started — note the port reported in the
  output (orphan listeners on 3000/3001/3002 are common; Lane BJ
  documented this).
- `Authorization: Bearer <CLAUDE_BYPASS_TOKEN>` on every request, OR
  `?claude=<url-encoded-token>` on the URL.
- Probe runs at 3 tiers per route × 12 routes = 36 captures; allow
  ~10-15 minutes of wall-clock.

After the first complete run the dev server tends to wedge on the
~10th-20th compile; the cleanest reproduction is one fresh server per
probe run.

---

## Closing posture

Hold-for-fixes. Three small follow-up lanes close the BLOCKERS:

- **Lane Z′** (~90 min) — tooltip sweep finish on Schedule,
  Settings/Catch-up, Year/print, Catch-up, Settings/Appearance.
- **Lane Y′** (~25 min) — wire `useSchoolWeek()` into RoadmapView,
  ProgressionView, YearMobile.
- **Lane CC priority** (the uncommitted GlobalRail) OR a temporary
  Schedule-tab restoration in the top bar — so /schedule stays
  reachable from non-Daily routes.

After those three, this branch is beta-ready against CLAUDE.md §1, §4,
and §5/§6 audit-readiness rules.
