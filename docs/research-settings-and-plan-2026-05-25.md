# Settings landscape, queued-work integration, master plan
2026-05-25 (research lane — no code changes)

**Author:** research agent (Opus 4.7, 1M context). Read-only pass.
**Scope:** survey what settings the app needs (or already has), reconcile with
the queued-work doc, plan a universal button-tooltip sweep, and produce a
wave-based execution plan with audit-readiness guards. Branch `schedule-and-auth-5.24`.

---

## 1. Settings landscape inventory

The product is "Phase 1A frontend-only prototype" today. Every preference below
is either (a) already shipped, (b) already shipped at the data layer but with
no Settings UI to mutate it, or (c) hard-coded in source and needs both a hook
and a Settings UI. Persistence target: `localStorage` today (under the
`mycurricula:` namespace), Supabase row when the backend lands.

> **How to read the status column:**
> - **shipped** — UI + persistence both live.
> - **data-only** — hook + storage exist; no Settings UI yet.
> - **hard-coded** — value sits in source; no hook, no UI.
> - **missing** — feature does not exist anywhere yet.

### 1.1 Curriculum identity (already part-shipped — Lane P′)

| Setting | What it controls | Lives in | Default | Status | Persist |
|---|---|---|---|---|---|
| `curriculumLabel` | Top-bar wordmark suffix ("Grade 5", "K-12 Math", "Year 7 Science") | `lib/app-state.tsx:80-104` (CurrentUser.curriculumLabel); read by `components/shell/top-bar.tsx:182-194` | "Grade 5" via `FALLBACK_USER` | data-only — no editor UI | localStorage today / Supabase column later |
| Teacher display name | Profile name on avatar + future audit log | `lib/app-state.tsx` `CurrentUser.name` | derived from Supabase or `ME.name` | shipped (read-only — from Auth session) | Supabase Auth metadata |
| Teacher avatar | Top-bar avatar img | `CurrentUser.avatarUrl` | Google profile photo when SSO | shipped (read-only) | Supabase Auth metadata |

### 1.2 School calendar — "the school week, the school year, holidays"

CLAUDE.md §1 is **explicit**: the school week is configurable; never hard-code
the weekday set; every calendar surface derives from this config. The
prototype currently violates this in several places (see audit findings).

| Setting | What it controls | Lives in | Default | Status | Persist |
|---|---|---|---|---|---|
| **School-week weekdays** | Which weekdays the school runs (Sun-Thu, Mon-Fri, custom 3-day, etc.) | Hard-coded `[0..4]` in `app/(planner)/schedule/page.tsx:27` ("SCHOOL_WEEK_DAYS"); hard-coded `DEFAULT_SCHOOL_WEEK = ["Su","Mo","Tu","We","Th"]` in `lib/year-calendar.ts:207-213`; hard-coded `WEEK_DAYS` in `lib/mock/index.ts:18-34`; onboarding has a real picker at `components/onboarding/steps/school-week-step.tsx` → writes to `OnboardingData.weekdays` BUT the value is discarded after the wizard finishes (no Settings page surfaces it post-onboarding) | Sun-Thu | **hard-coded** post-onboarding (CLAUDE.md §1 violation that everyone has been ignoring) | localStorage `mycurricula:school-week-days` |
| **School year months** | Which calendar months "count" — Aug-May (US), Sep-May (Qatar), Feb-Nov (Southern), etc. | `lib/use-school-months.ts` (hook lives); `lib/year-calendar.ts:337-357` (presets) | All 12 months | data-only — Lane R landed; Lane S/T pending | localStorage `mycurricula:school-months` |
| **Term start date** | Anchor for Week 1 → calendar date math | `lib/year-calendar.ts:220` `DEFAULT_TERM_START = new Date(2025, 10, 2)`; `lib/mock/calendar.ts:48` `WEEK_1_DAY_0 = {2025-11-02}` | 2025-11-02 (hard-coded mock anchor) | **hard-coded** | localStorage later / school row in Supabase |
| **Holidays / non-instruction days** | Days where no lessons render; week-renumbering | Not present anywhere yet — mock data has zero holiday markers; `app-state.PlannerFilters.showHolidays` toggle exists but feeds no data | none | **missing** | localStorage list of dates + reasons; Supabase `school_holidays` row later |
| **Ramadan timetable mode** | Alternate timetable + week numbering during Ramadan | Mentioned twice in code as a future need; no toggle, no data | n/a | **missing** | per-school config later |
| **Weeks per quarter** | Used by Year view band math | `lib/year-calendar.ts:237` `WEEKS_PER_QUARTER = 9` | 9 | **hard-coded** | unlikely needs Settings UI in Phase 1 — flag for later |
| **Total weeks in year** | Whether the year is 36 weeks vs 32 vs 40 | `lib/year-calendar.ts:317` `WEEKS_IN_YEAR = WEEKS_PER_QUARTER * 4` (=36) | 36 | **hard-coded** | derived from WEEKS_PER_QUARTER — same story |

### 1.3 Daily schedule / timetable

CLAUDE.md §1: "Schedules are customizable, including rotating cycles… A/B schedule
that alternates on a cycle other than the calendar week… Never assume a single fixed
daily schedule or a weekly-only cycle." The current prototype is the worst offender in
the codebase on this rule.

| Setting | What it controls | Lives in | Default | Status | Persist |
|---|---|---|---|---|---|
| **Per-day time blocks** | The list of academic + non-academic blocks per weekday | Hard-coded `SCHEDULE_BY_DAY` in `lib/schedule-data.ts:90-264`; subject defaults in `lib/mock/schedule.ts:24-33`; `+ Add time block` button is `disabled` ("coming soon") in `components/schedule/ScheduleDayPane.tsx:226-238` | Sun-Thu fixture with 10-12 blocks each | **hard-coded** with a disabled stub control already in the UI | localStorage `mycurricula:timetable` later / Supabase `time_blocks` |
| **Day start / day end** | Earliest + latest minute the timeline shows | `lib/schedule-data.ts:26-29` `DAY_START_MIN = 8 * 60, DAY_END_MIN = 15 * 60 + 30` | 08:00-15:30 | **hard-coded** | localStorage `mycurricula:day-window` |
| **Px per minute (timeline zoom)** | Timeline density | `lib/schedule-data.ts:23` `PX_PER_MIN = 1.4` | 1.4 | **hard-coded** | localStorage `mycurricula:timeline-zoom` (low priority) |
| **Rotation kind** | none / A-B / longer cycle | Captured during onboarding (`OnboardingData.rotation`, `cycleLength` — see `components/onboarding/steps/rotation-step.tsx`); discarded afterwards | none | **missing** post-onboarding | localStorage `mycurricula:schedule-rotation` |
| **Cycle length** | If rotating: how many instructional days | Same as above | 4 | **missing** post-onboarding | same |
| **Today's day in cycle** | Where on the A-B cycle "today" sits | n/a | n/a | **missing** | Supabase later — needs server time |

### 1.4 Personal preferences (theme + display)

| Setting | What it controls | Lives in | Default | Status | Persist |
|---|---|---|---|---|---|
| **Card style** (Quiet / Calm / Vivid) | `data-style` attribute → CSS recipe | `lib/theme.tsx`; UI in `components/appearance/style-picker.tsx` | "vivid" | shipped (UI in Appearance) | **NOT** persisted to localStorage — resets on reload (audit gap) |
| **Palette** (Normal / Highlight) | `data-palette` attribute → saturation | `lib/theme.tsx`; UI in `components/appearance/palette-toggle.tsx` | "highlight" | shipped (UI) | same gap — not persisted |
| **Subject → swatch mapping** | Which palette swatch a subject uses | `components/appearance/subject-colors.tsx`; `lib/palette.tsx` | `DEFAULT_SUBJECT_MAPPING` | shipped (UI) | local React state — **not persisted at all** (audit-cross-cutting calls this out) |
| **Hierarchy labels** | Renaming Subject / Unit / Lesson / Section | `lib/labels.tsx`; UI in `app/settings/appearance/page.tsx:96-224` | factory defaults | shipped | localStorage `mycurricula:hierarchy-labels` |
| **Dense / compact spacing** | Power-user reduced padding | not present | n/a | **missing** | listed as cross-cutting improvement |
| **Reduced-motion respect** | App respects `prefers-reduced-motion`; no override needed for now | OS media query | n/a | shipped via CSS | n/a |

### 1.5 View defaults

These would let a teacher pick their landing experience.

| Setting | What it controls | Lives in | Default | Status | Persist |
|---|---|---|---|---|---|
| **Default tab on app load** | Daily / Weekly / Yearly / Schedule | none — hard-coded "/weekly" home redirect | Weekly | **missing** | localStorage `mycurricula:default-route` |
| **Default Grid / List per route** | Initial layout mode per view | `app-state.viewMode` starts at "grid"; `WeeklyShell.tsx` forces "list" on phone | "grid" | partly-shipped (the runtime preference exists; persistence is **not** wired) | localStorage `mycurricula:view-mode` |
| **Default Personal / Master** | Always land in Personal; teachers want it sticky | `app-state.editMode` starts at "personal" | "personal" | shipped (default fine; cross-cutting audit asks to persist last choice across sessions) | localStorage `mycurricula:edit-mode` |
| **Default Catch-up scope** | "Last 4 weeks" vs Year on /catch-up | `components/catchup/CatchupScreen.tsx` | "last4" | shipped (no UI yet to change default) | localStorage already exists for catch-up |
| **Default Schedule day** | Which day /schedule lands on | `selectedDay` initialized to 0 (Sunday) in `app-state.tsx:217` — Major bug per `docs/audit-fragments/schedule-catchup.md` | 0 (Sunday — wrong) | **bug — should default to today** | localStorage `mycurricula:selected-day` |

### 1.6 Catch-up (settings page already exists — list gaps)

`app/settings/catch-up/page.tsx` ships today with:
- **Layer-1 on/off toggle** (the on/off for ambient catch-up chrome). Shipped.
- **Open Catch-up screen** button. Shipped.

Gaps the cross-cutting audit + the per-route audit identified:
- No way to set the **default catch-up scope** ("Last 4 weeks" / "Year").
- No way to **clear dismissed weeks** (the per-week dismissal grows forever in localStorage and there's no audit UI to reset).
- No way to set a **"behind by N weeks" threshold** for when a lesson becomes "catch-up worthy".
- No **"surface in flame badge" filter** (e.g. ignore Reading because the teacher is co-taught on it).

### 1.7 Lesson templates (settings page already exists — list gaps)

`app/settings/lesson-templates/page.tsx` ships today with:
- **15 built-in templates** (read-only). Shipped.
- **Duplicate-and-edit** flow for creating custom ones. Shipped.
- **Custom templates manager** (name, description, sections, prompts). Shipped.

Gaps:
- No way to **assign a default template per subject** (today's "default" is a single account-wide value captured during onboarding into `OnboardingData.defaultTemplateId` and… not surfaced anywhere).
- No way to **delete a custom template** (or "deleted" is silent — needs verification).
- No way to **import / export** a template (research-deferred per the queued doc).

### 1.8 Notifications (does any setting exist? no)

The app has zero notification surface today. The audit-cross-cutting doc proposes
real-time presence / activity feeds in Phase 2. For Phase 1A there is **nothing
to set, so nothing to surface** — call this out as deferrable in the master plan.

### 1.9 Data + export

| Setting | What it controls | Status | Persist |
|---|---|---|---|
| **Default print template** | Print-friendly layout per route | partly shipped — `/weekly/print`, `/year/print` routes exist | n/a (route-driven) |
| **Export format** | Excel / PDF / CSV / Google Doc | **missing** (Phase 1B per planning doc) | n/a |
| **Auto-export cadence** | Weekly email of next week's plan | **missing** | n/a |
| **MOEHE-compliant export** | Per-school compliance export | **missing** (Phase 1B+) | n/a |

The user has **not asked about export settings** in this lane — defer to Phase 1B.

### 1.10 Bypass / access control (locked, out-of-scope to surface)

`docs/5.24.26 claude-access.md` documents the Claude bypass. This is operational,
not user-configurable, and **must not** appear in a teacher-facing Settings UI.
Flagged here for completeness only.

### 1.11 Filters & filter presets

| Setting | What it controls | Lives in | Status |
|---|---|---|---|
| **Active filters** | `subjects[]`, `units[]`, `statuses[]`, `standards[]`, `showHolidays` | `app-state.PlannerFilters`; UI in `components/shell/left-filter-panel.tsx` | shipped (session-scoped; **not persisted** across reloads — cross-cutting audit's #4-3 item) |
| **Named filter presets** | "Save this filter set as 'My Drafts'" | **missing** | listed as Phase 2 in cross-cutting audit |

### 1.12 Onboarding state replay

Onboarding (`/onboarding`) collects everything in §1.2-§1.4 once. But there is
**no Settings UI that lets a teacher re-edit any of it after the fact**. The
queued-work Lane S is the first step to closing this gap. The full closure
needs at least: school-week, schedule rotation, subject set + colors, default
template, term start, holidays. None of that exists yet.

### 1.13 Summary table — by user-ask status

| User has asked for it explicitly? | Settings category |
|---|---|
| **Yes — explicit in queue + Lane S** | curriculumLabel, school months |
| **Yes — implicit in CLAUDE.md hard rules** | school-week weekdays, schedule timetable, rotation, term start, holidays |
| **Yes — audit findings + user "settings button on left rail"** | a Settings entry point on the icon rail; persistence of theme + palette + view-mode |
| **No (defer)** | dense mode, notifications, export, real-time presence, named filter presets, default-template-per-subject, deletion of custom templates |

---

## 2. Queued-work inventory (from `docs/queued-work-2026-05-25.md`)

Restated in one line each. "Survived" = code already on `schedule-and-auth-5.24`.
"Pending" = needs a fresh agent.

| Lane | What | Survived | Pending |
|---|---|---|---|
| **P′** | Wordmark `curriculumLabel` data field on `CurrentUser`; default "Grade 5" wired through | data layer + top-bar render | no Settings UI to edit it |
| **R** | `useSchoolMonths()` hook + presets + `allYearMonths()` returns 12 entries | hook + data | no Settings UI; no `/year` consumer |
| **Q** | m7 — verify Tooltip on disabled buttons works cross-browser; fix if not | nothing landed | full lane (~20 min) |
| **S** | `/settings/curriculum` page bundling curriculumLabel + school months | nothing landed | full lane |
| **T** | Wire `/year` + `/year/print` to `useSchoolMonths()` filter | nothing landed | full lane |
| **U** | `/year` "+ Add Unit" modal with weekday-of-week multi-select | nothing landed | full lane |
| **V** | RESEARCH unit-import strategy (Excel / Sheets / Docs / Word / paste) | nothing landed | full research lane |
| **NEW (post-session)** | Settings button on left icon bar | **already landed** in `components/daily/IconRail.tsx:288-298` — Settings gear links to `/settings/curriculum` | the gear sits on the *Daily* icon rail; the *Weekly/Subject/Schedule/Year* left filter panel does **not** carry a Settings entry, so the gear is unreachable from those routes |

---

## 3. Universal button-tooltip sweep plan

### 3.1 Inventory

| Pattern | Approx count | Locations |
|---|---|---|
| `<Button …>` (the primitive) | **333 callsites** across 52 files | every page + every component family |
| `<button>` (raw DOM, mostly inside `lesson-flow` editor, `daily/ResourceComposer`, `daily/ResourcesPanel`, `IconRail`, schedule rows, etc.) | **~150-200 callsites** (>670 occurrences but counting JSX tags inside `.tsx` only — see grep) | scattered |
| `<Tooltip …>` already wrapping a button | **122 callsites** across 26 files | `top-bar.tsx:12`, `weekly-lesson-card.tsx:9`, `IconRail.tsx:7`, etc. |
| `title="…"` HTML attribute fallback | **17 callsites** across 11 files | mostly EmptyState + the soon-affordances in IconRail |

**Realistic total of "should have a tooltip" interactive controls:** ~250-400.
Already covered: ~120. Gap: ~150-280.

### 3.2 Tooltip primitive review

`components/ui/Tooltip.tsx` (266 lines, full read in research):
- Portals to `document.body` → escapes overflow:hidden parents. Good.
- Computes placement with auto-flip + viewport clamp. Good.
- Suppresses hover-only tooltips on `(hover: none)` touch devices via the `byHover` flag + a `.hoverOnly` CSS class. **Important caveat:** the comment at line 14-16 says "tooltip only shows on keyboard focus" on touch — most teachers on iPads / Chromebooks won't get a tooltip at all. Acceptable for now; revisit Phase 2.
- Clones the trigger via `cloneElement` to inject `ref`, `aria-describedby`, and four event handlers. **The trigger must be a single ReactElement that forwards a ref** — DOM elements + forwardRef components do; the `Button` primitive uses a plain `<button>` underneath so it works.
- **Known weakness — disabled buttons.** From `docs/year-audit-2026-05-25.md` "Lane D side effects": `disabled` buttons don't fire `mouseenter` in some browsers, so the styled Tooltip may never paint. The `title=""` attribute survives as a fallback in the JSX. **Lane Q is meant to fix this** — bind hover listeners on a wrapper around the disabled child.

### 3.3 Approach: hybrid (b) + (c) — Button primitive grows a `tooltip` prop, plus a few wrapper Tooltips for non-Button controls

I considered the three options the brief proposes:

- **(a) Per-callsite Tooltip wrappers everywhere.** Adding `<Tooltip>` around every Button across 333 callsites bloats JSX, inflates rendered DOM (portals), and creates 150+ files to touch. Not realistic in a single wave.
- **(b) Button primitive accepts `tooltip` prop.** Touches one file (`components/ui/Button.tsx`); every existing `<Button …>` callsite picks up a tooltip slot. Most controls in the app use the Button primitive. **Reduces 250+ wrappers to a single prop addition.**
- **(c) `data-tooltip` attribute + global listener.** Cheapest, but it (i) reimplements positioning that Tooltip.tsx already nails, (ii) duplicates the touch-device + reduced-motion behavior, and (iii) loses the keyboard-focus tooltip semantics.

**Recommendation: extend Button with a `tooltip?: string` prop** that internally
wraps the rendered `<button>` in the existing `<Tooltip>` component, falls back
to a native `title=""` when disabled (browsers that drop hover events on
disabled buttons still surface `title=`), and is a no-op when omitted. For the
~50-100 raw `<button>` callsites and the cases that aren't Buttons (Links,
spans-as-buttons, the day-strip chips in `/schedule`, etc.), wrap with `<Tooltip>`
case-by-case in the targeted-tooltip-content lane below.

This lets the wave's surface area be one primitive edit + one mechanical sweep
that adds `tooltip="…"` to existing Button callsites, plus a handful of explicit
`<Tooltip>` wraps where the control isn't a Button.

### 3.4 Tooltip-copy library (per-control suggested copy)

The brief asks for per-control suggested text. Below is the working library. Keep
it short — 5-9 words is the sweet spot. Verb-first ("Save", "Open", "Toggle")
when the action is destructive or state-changing; noun-first ("Today's lessons")
when the control is a navigation.

#### Top bar (`components/shell/top-bar.tsx`)

| Control | Suggested tooltip |
|---|---|
| Wordmark link → /weekly | (already has `title="Built for teachers, by teachers."` — keep) |
| Left-panel collapse toggle (open) | "Collapse filter panel" (already) |
| Left-panel collapse toggle (closed) | "Expand filter panel" (already) |
| Daily tab | "Daily — today's lessons + schedule" |
| Weekly tab | "Weekly — the lesson grid" |
| Yearly tab | "Yearly — the full year at a glance" |
| Curriculum tab | "Curriculum — drill into one subject" |
| Schedule tab | "Schedule — the day's time blocks" |
| Save indicator | "Last saved at HH:MM" (already, dynamic) |
| Undo (enabled) | `Undo: ${undoLabel}` (already, dynamic) |
| Undo (disabled) | "Nothing to undo" (already) |
| Redo (enabled) | `Redo: ${redoLabel}` (already) |
| Redo (disabled) | "Nothing to redo" (already) |
| Personal toggle | "Personal — edit your copy only" |
| Master toggle | "Master — changes affect the whole team" |
| Grid toggle | "Grid view" |
| List toggle | "List view" |
| Search trigger | "Search lessons" (already) |
| Catch-up flame | "Open Catch-up — N items uncovered" (dynamic) |
| To-do toggle | "Toggle to-do panel" |
| Comments toggle | "Toggle comments panel — N unread" (dynamic) |
| Profile avatar | "Settings" |
| Sign out | "Sign out" (already) |

#### IconRail (`components/daily/IconRail.tsx`)

Most already have tooltips. Confirm coverage:
- Today ✓, To-dos ✓, Settings gear ✓.
- Schedule / Year / Voice (the "coming soon" affordances) — currently use plain `title=""`. Replace with the Tooltip primitive **only after Lane Q** confirms it fires on inert children; until then leave as-is.

#### Left filter panel (`components/shell/left-filter-panel.tsx`)

| Control | Suggested tooltip |
|---|---|
| "Reset filters" | "Clear all filters" |
| Each subject chip | "Filter to {subject name}" (dynamic) |
| Each unit row | "Filter to {unit name}" |
| Each status chip | "Show {status label} only" |
| Each standard chip | `${code}: ${description}` (use full standard text) |
| "Show holidays" checkbox | "Show holiday & event markers on the grid" |

#### Weekly view chrome

| Control | Suggested tooltip |
|---|---|
| WeekNavigator Prev | "Previous week" |
| WeekNavigator Next | "Next week" |
| WeekNavigator Today | "Jump to today's week" |
| Grid/List inline pill | (covered by the top-bar pair) |
| Schedule pill | "Switch to Schedule timeline" |
| "Lessons only / All events" pill | "Show lesson blocks only" / "Show every block including specials & lunch" |

#### Year view (`components/year/YearView.tsx` and family)

| Control | Suggested tooltip |
|---|---|
| Filters button (disabled today) | "Filters — coming in Phase 1B" (Lane Q fixes the disabled-tooltip case) |
| Export button (disabled today) | "Export — coming in Phase 1B" |
| Print button | "Print this year view" |
| MonthPicker buttons | `Jump to ${month}` |
| Roadmap / Progression toggle | "Roadmap — high-level unit timeline" / "Progression — per-lesson glyph grid" |
| LaneCard minimize chevron | `Minimize ${subject}` (already aria-labeled) |
| LaneCard restore chevron | `Restore ${subject}` |
| Curriculum filter buttons | `Show ${subject} only` |
| StatusFilterBar buttons | `Show ${status} lessons only` |

#### Lesson card (`components/lesson-card/`)

| Control | Suggested tooltip |
|---|---|
| Status checkbox (off) | "Mark as done" |
| Status checkbox (done) | "Mark as not done" |
| Card menu ⋯ | "More actions" |
| Drag handle | "Drag to reorder" |
| Modified pill | "You've modified this lesson — hover for details" (the existing dashed-edge tooltip) |
| Compare-to-Master action | "Compare your version to the team's Master" |
| Restore-from-Master action | "Revert to the team's Master version" |
| Archive action | "Archive this lesson" |
| Move-to-day action | `Move to ${target day}` |

#### Schedule (`components/schedule/`)

| Control | Suggested tooltip |
|---|---|
| Day-strip chip | `${day name}, ${date}` (already aria-labeled) |
| `+ Add time block` (disabled) | "Add time block — coming in Phase 1B" |
| `···` pane options (disabled) | "Pane options — coming in Phase 1B" |
| Day-picker icon (disabled) | "Pick a date — coming in Phase 1B" |
| Each ScheduleBlock | `${time range} · ${subject / label}` |

#### Catch-up (`components/catchup/`)

| Control | Suggested tooltip |
|---|---|
| Scope chip (Last week / Last 4 weeks / Year) | `Show items from ${scope}` |
| Status filter chips | `Toggle ${status}` |
| "Mark all done" | "Mark every visible lesson done" |
| "Mark all skipped" | "Mark every visible lesson skipped" |
| "Carry over all to…" | "Carry every visible lesson over (date picker coming)" |
| "Add all to to-do" | "Add every visible lesson to your to-do list" |
| "Clear" | "Clear selection" |
| Per-row "Mark done" | "Mark this lesson done" |
| Per-row "Skipped" | "Mark this lesson skipped" |
| Per-row "Carry over to…" | "Mark this lesson as carried over" (note: copy bug — see audit) |
| Per-row "Add note" | "Add a note to this lesson" |

#### Settings (`app/settings/**`)

| Control | Suggested tooltip |
|---|---|
| Card-style radio (Quiet) | "Minimal white cards, thin stripe" |
| Card-style radio (Calm) | "White cards with subject monogram" |
| Card-style radio (Vivid) | "Subject color fills the card" |
| Palette radio (Normal) | "Confident, slightly darker" |
| Palette radio (Highlight) | "Highlighter-marker bright" |
| Subject color swatch | `Pick a color for ${subject}` |
| Restore-defaults button | "Restore the factory defaults" (when active) / "Already at defaults" (when disabled) — already exists |
| Catch-up toggle | "Show catch-up cues across the planner" |
| Lesson template "Duplicate & edit" | `Make an editable copy of "${template}"` |
| Custom template "Edit" | "Edit this template" |
| Custom template "Delete" (if it exists) | "Delete this template" (destructive — destructive variant) |

### 3.5 Coordinate with Lane Q (disabled-button tooltip fix)

Lane Q must land **before** the universal sweep enables tooltips on every
disabled button. Otherwise the disabled "+ Add time block", "Filters", "Export"
buttons advertise tooltips that never render in Safari + Firefox. Either: order
the lanes (Q → universal sweep) or have the Button primitive fall through to the
native `title=` attribute when `disabled` is true so there is always a textual
fallback regardless of which browser the teacher uses.

**Decision:** ship the Button primitive's `tooltip` prop with **both** — the
Tooltip primitive AND a parallel `title=` attribute on the same button — so the
fallback works regardless. Lane Q remains valuable for keyboard-focus
visibility on disabled buttons, but the title-attribute fallback closes the
worst-case browser-quirk gap immediately.

---

## 4. Master implementation plan

Lane letters resume from V. **W, X, Y, Z, AA, AB, AC** in this plan.
Waves are sequential; lanes inside a wave run in parallel and own disjoint
files.

### Wave 1 — settings unification + tooltip primitive (the foundation)

The user wants a single coherent Settings story + tooltips everywhere. Both are
foundational: subsequent waves consume them. Cap Wave 1 to ~3 hours of agent time.

#### Lane W — `/settings/curriculum` page (supersedes Lane S)
- **Files:**
  - new: `app/settings/curriculum/page.tsx`
  - new: `app/settings/curriculum/page.module.css`
  - **MODIFY** `components/shell/left-filter-panel.tsx` — add a Settings entry at the bottom of the panel (mirrors IconRail's gear)
- **Goal:** Single editable home for `curriculumLabel` (Lane P′) and `useSchoolMonths()` (Lane R), plus a placeholder section for school-week weekdays (to be filled in Lane Y).
- **Audit-ready checklist:** § 5 + § 6 below.
- **Effort:** 35 min.
- **Dependencies:** none — both consumed pieces (P′ + R) already landed.

#### Lane X — Tooltip on the Button primitive + the disabled-button fallback (supersedes Lane Q)
- **Files:**
  - **MODIFY** `components/ui/Button.tsx` — accept `tooltip?: string`; when set, wrap rendered `<button>` in `<Tooltip>` AND set `title=tooltip` on the underlying button as the disabled-browser fallback
  - **MODIFY** `components/ui/Tooltip.tsx` — fix Lane Q m7 by binding hover listeners to a wrapper span when `cloneElement` detects a disabled child
  - **MODIFY** `components/ui/Button.module.css` — no expected change; verify Tooltip portal positioning works
  - **MODIFY** `components/ui/index.ts` — no surface change (Button + Tooltip already exported)
- **Goal:** every `<Button>` callsite can grow tooltip support with one prop; disabled buttons in every supported browser surface the tooltip.
- **Audit-ready checklist:** § 5 + § 6 below.
- **Effort:** 45 min.
- **Dependencies:** none.

#### Lane Y — School-week weekdays Settings UI + hook
- **Files:**
  - new: `lib/use-school-week.ts` — mirrors `lib/use-school-months.ts` exactly; reads the school-week weekdays from localStorage `mycurricula:school-week-days`; default = `["sun","mon","tue","wed","thu"]`; presets = the `weekdaysForPreset` helper in `lib/onboarding-state.tsx:89-93`.
  - **MODIFY** `app/settings/curriculum/page.tsx` (Lane W's file — coordinate header line ownership in advance) — add a "School week" section using `useSchoolWeek()`
  - **MODIFY** `lib/year-calendar.ts` — `DEFAULT_SCHOOL_WEEK` stays as the fallback constant; export a new helper that hooks into the hook (see how `useSchoolMonths` interacts with `ALL_SCHOOL_MONTHS`)
- **Goal:** unlock CLAUDE.md §1 — the school week is configurable post-onboarding.
- **Audit-ready checklist:** § 5 + § 6.
- **Effort:** 50 min.
- **Dependencies:** Lane W's page exists (must merge first).

### Wave 2 — universal tooltip sweep + Year-view wiring

#### Lane Z — Tooltip rollout across all `<Button>` callsites
- **Files:** ~50-60 components consuming Button. **Carefully coordinated** — see the file matrix in § 5.5.
- **Goal:** add `tooltip="…"` to every `<Button>` callsite in the app, using the copy library in §3.4.
- **Audit-ready checklist:** § 5 + § 6, plus a per-route sanity verification at three viewport tiers.
- **Effort:** 70 min.
- **Dependencies:** Lane X (the prop must exist).

#### Lane AA — `/year` + `/year/print` consume `useSchoolMonths()` (supersedes Lane T)
- **Files:**
  - **MODIFY** `components/year/QuarterMonthWeekHeader.tsx`
  - **MODIFY** `components/year/YearView.tsx` — add a "Configure" link to `/settings/curriculum`
  - **MODIFY** `components/year/MonthPicker.tsx`
  - **MODIFY** `app/(planner)/year/print/page.tsx`
- **Goal:** Year view filters by the chosen school months.
- **Audit-ready checklist:** § 5 + § 6.
- **Effort:** 40 min.
- **Dependencies:** Lane W landed (so the link target exists).

#### Lane AB — `/year` "+ Add Unit" modal (supersedes Lane U)
- **Files:**
  - new: `components/year/AddUnitForm.tsx` (+ `.module.css`)
  - new: `lib/use-custom-units.ts`
  - **MODIFY** `components/year/YearView.tsx` — add the `+` button next to Configure/Filters/Export/Print
  - **MODIFY** `components/year/UnitBar.tsx` (or sibling) — render custom-unit markers
- **Goal:** teachers can add a custom unit with weekday selection.
- **Audit-ready checklist:** § 5 + § 6.
- **Effort:** 60 min.
- **Dependencies:** Lane AA (same Year header file; merge first) AND Lane Y (the weekday set the modal multi-selects against).

### Wave 3 — persistence + view defaults + onboarding replay

#### Lane AC — Persist theme + palette + viewMode + editMode + filters
- **Files:**
  - **MODIFY** `lib/theme.tsx` — load + persist `data-style` and `data-palette` to localStorage (`mycurricula:theme-style`, `mycurricula:theme-palette`)
  - **MODIFY** `lib/palette.tsx` — persist the subject→swatch mapping (`mycurricula:subject-mapping`)
  - **MODIFY** `lib/app-state.tsx` — persist `viewMode`, `editMode`, `selectedDay`, `filters` to localStorage
- **Goal:** Settings + view choices survive a reload. Closes audit cross-cutting #4 +
  the /schedule "default day Sunday" major.
- **Audit-ready checklist:** § 5 + § 6.
- **Effort:** 50 min.
- **Dependencies:** Lanes W/X/Y/Z/AA/AB all merged (this lane touches files those lanes don't).

#### Lane AD — Lesson template defaults per subject
- **Files:**
  - **MODIFY** `lib/custom-templates.tsx` — add `defaultTemplateBySubject: Record<SubjectId, string | null>`
  - **MODIFY** `app/settings/lesson-templates/page.tsx` — add per-subject default picker
  - **MODIFY** `components/lesson-templates/lesson-templates-manager.tsx` — wire UI
- **Goal:** teachers map a default template per subject (so the academic-subject-uses-template logic actually has a per-subject value).
- **Audit-ready checklist:** § 5 + § 6.
- **Effort:** 35 min.
- **Dependencies:** Lane X (Button tooltip prop, since the new pickers need them).

#### Lane AE — Catch-up settings gaps
- **Files:**
  - **MODIFY** `app/settings/catch-up/page.tsx`
  - **MODIFY** `lib/catchup-state.tsx` — add `defaultScope`, "Clear dismissed weeks" action
- **Goal:** default scope picker + "Clear dismissed weeks" button + (deferred to Phase 2) the per-subject ignore filter.
- **Audit-ready checklist:** § 5 + § 6.
- **Effort:** 30 min.
- **Dependencies:** none.

### Wave 4 — final integration testing + the UI/UX audit pass

#### Lane AF — Self-audit pass against §5 + §6
- **Files:** none modified — the agent runs the audit checklist against every prior lane's commits and files findings as a follow-up doc.
- **Goal:** the post-execution audit (per the user's brief — "then ui/ux audit").
- **Effort:** 60-75 min.

#### Lane AG — Probe at 360 / 768 / 1280 + screenshot diff
- **Files:** new screenshots in `docs/screenshots/settings-curriculum-…`, etc.
- **Goal:** screenshots for the audit deliverable.
- **Effort:** 30 min.
- **Dependencies:** all prior waves merged.

### Total estimated effort

| Wave | Lanes | Wall-clock if serial | If parallelized (3 agents) |
|---|---|---|---|
| 1 | W, X, Y | 130 min | ~50 min |
| 2 | Z, AA, AB | 170 min | ~70 min |
| 3 | AC, AD, AE | 115 min | ~50 min |
| 4 | AF, AG | 105 min | ~75 min (some serialization) |
| **Total** | **8 lanes** | **~8.5 hours serial** | **~4 hours parallelized** |

---

## 5. Audit-readiness checklist — the meta gift

These are the failure modes today's waves hit. Every future lane MUST satisfy
each before reporting "done." Print this list and tape it to the agent's
forehead.

### 5.1 Reading the user's screenshot literally

1. **Do not infer scroll axis.** If the user shows a screenshot with the
   horizontal scrollbar at the bottom, the page is scrolling horizontally —
   even if the dev probe says it isn't. Probe with the same viewport, the same
   zoom level, and the same OS.
2. **Re-derive the bug from the screenshot pixels** before opening source.
   "What is the symptom in this image" should be writeable in one sentence
   before any tool call.
3. **Treat the user's report as ground truth.** If the probe disagrees, the
   probe is what's wrong — not the report.

### 5.2 Probe / reality matching

4. **Playwright headless ≠ Edge/Chrome on Windows.** When the user reports a
   bug they hit on their own browser, run the probe in a headed Playwright
   session or in the actual browser via DevTools device mode. Headless
   Chromium misses scrollbar widths, font rendering, OS-level chrome.
5. **Verify the probe URL matches the page the user is on.** If the user
   reports `/year` but the probe captures `/year/print`, the screenshots
   describe two different pages.
6. **Probe at `scrollLeft=0` AND `scrollLeft=max` after every CSS sticky
   change.** Sticky-left bugs only appear after panning. Same for
   `scrollTop=max` for sticky-top.
7. **Confirm the bypass cookie is fresh.** Stale `claude_session` cookies
   silently 401 the URL-param flow — the probe will look like the page is
   broken when actually the auth is.

### 5.3 Build environment hygiene

8. **Do not run `npm run build` while a dev server is using `.next`.**
   It corrupts the cache and the dev server starts serving 500s. Either kill
   the dev server first, build in a separate clone, or rely on `next lint` +
   `next typecheck` for the lane's gate.
9. **Re-read `package.json` scripts before running one.** This repo has
   `build`, `build:cf`, `deploy:cf` — each does very different things.
10. **Don't run scripted `prettier --write .`** during a lane's commit; the
    lane should only `prettier --write` the files it touched, otherwise it
    creates noise diffs other agents step on.

### 5.4 Affordance discovery

11. **If a Settings affordance exists, reuse it.** The IconRail gear (Daily
    only) and the avatar (every route) both link to Settings — adding a third
    "Settings entry" without auditing the existing two creates a discoverability
    mess. **The fix is the same affordance, available on every route**, not
    a new affordance.
12. **Search the repo for the feature name in lowercase, PascalCase, and
    camelCase before declaring it doesn't exist.** ("catchup" / "Catchup" /
    "catch_up" / "catch-up" all coexist.)
13. **Check the queued-work doc + the audit fragments before drafting a new
    feature.** The user has often already asked for it and someone has
    half-built it.

### 5.5 Cross-lane file ownership

14. **When two lanes touch the same file, name the section + the line range
    each owns.** Today's failure: Lane T and Lane U both wanted to add a
    button to the `/year` header — without coordination they would have
    written conflicting JSX. Solution: in the plan, write
    `Lane AA owns YearView.tsx lines 30-50 (header buttons)` and
    `Lane AB owns YearView.tsx lines 51-70 (Add Unit modal mount)`.
15. **For shared files, the lane lower in the alphabet merges first.**
    Predictable rebase order beats heroic conflict resolution.
16. **The first lane to touch a "+ button" group in a header sets the layout
    contract.** Subsequent lanes append; they don't re-arrange.

### 5.6 Header / chrome conflicts

17. **Never add a primary action button to the top bar without checking the
    collapse cascade.** The top-bar collapse breakpoints in BUILD_STANDARD §8
    are tight; adding a button inflates the 1024-1280px overflow risk.
18. **The Personal/Master toggle stays visible at every width.** Don't
    "hide it on phone" — the entire forking model relies on it being a
    consistent affordance.
19. **The Profile avatar is the ONLY guaranteed-visible Settings entry
    point.** Don't move it, hide it, or replace it without replacing the
    Settings entry path too.

### 5.7 Sticky / overflow / scroll

20. **`overflow-x: clip` on the top bar is load-bearing — but it silently
    cuts controls past viewport.** Always pair with an overflow menu (the
    `TopBarMoreMenu` pattern is the precedent). The audit's #1 blocker was
    this exact bug.
21. **No `document.body` horizontal scroll at any viewport tier.** Internal
    element scroll inside a contained `overflow-x: auto` is fine. Document-
    level horizontal scroll is never acceptable.
22. **Sticky chrome ≤30% of viewport height on phone** — a 600px viewport
    gets at most ~180px of sticky header.

### 5.8 Tokens, colors, palette

23. **Zero hex in `components/` or `lib/`.** Even `#fff`. Use `var(--paper)`,
    `color-mix(in srgb, var(--token) X%, white)`, or add a new token.
24. **Subject colors only through `.cp-subj.<id>`** or the `useSubjectColor`
    hook. Never invent a swatch.
25. **Don't add theme colors to `tailwind.config.ts`.** Tokens live in
    `app/tokens.css`. Tailwind is layout + spacing only.

### 5.9 Accessibility

26. **Every interactive control has a ≥44×44px hit target on phone + tablet.**
    Use the padding-trick (negative margin around the icon) if the visual is
    smaller. The Year LaneCard 24×24 minimize button is the current
    counter-example.
27. **Every interactive control has either visible text or an
    `aria-label`/`iconAriaLabel`.** The Button primitive enforces this for
    `variant="icon"`.
28. **Don't use `<div onClick>` or `<span role="checkbox">`** — use a
    `<button type="button">`. ListRow's span-checkbox is the audit's #3
    blocker.
29. **Form errors carry `aria-describedby` linking input → error span.**
30. **Heading hierarchy is contiguous.** `<h1>` per page; `<h2>` for primary
    sections. The Schedule + Catch-up audits both call out flat headings.

### 5.10 Motion + reduced-motion

31. **Every animation has a `@media (prefers-reduced-motion: reduce)` block
    that drops it.** No bounce, parallax, confetti, surprise motion.
32. **The Master-mode banner flashes then persists — but does NOT flash
    under reduced-motion.** Solid from the start.

### 5.11 Forking model integrity

33. **Marking a lesson done never forks it.** Completion is independent.
34. **Editing Personal is invisible + automatic.** No "make a copy" step.
35. **Editing Master is gated by the explicit toggle + the flashing-then-
    persistent red banner.** No confirm dialog.
36. **The three-tier visual differentiation rule is non-negotiable.**
    Unedited = solid 4px stripe; Modified = dashed stripe + pill; Moved =
    move-arrow.

### 5.12 Data shape rules

37. **No hard-coded grade level anywhere in queries or data shapes.** The
    app is multi-grade by design even though Phase 1A is Grade 5-only.
38. **No hard-coded school-week assumption (Sun-Thu vs Mon-Fri vs N-day).**
    Every calendar surface accepts the configured weekday set as a parameter.
39. **No hard-coded daily-schedule assumption** (no implicit "8 to 3").
    Every schedule surface accepts day-start / day-end / blocks as data.

### 5.13 Persistence + hydration

40. **Every localStorage hook follows the SSR-safe pattern:** initial state
    = SSR default; post-mount effect reads storage; `storage` event handler
    syncs cross-tab. See `lib/use-school-months.ts` for the reference.
41. **Hydration mismatch = ship-blocker.** Test in `npm run build && npm run start`
    once before declaring a persistence lane done.
42. **The first effect in a hydratable store gates writes on a `hydratedRef`
    flag** so the initial load doesn't immediately overwrite localStorage
    with the default.

### 5.14 The "did the user actually ask for this?" gut-check

43. **If the user didn't explicitly ask for a feature, it doesn't go in.**
    Phase 1A is the late-August beta gate. The cross-cutting audit has 30
    Phase-2 ideas — they wait.
44. **Defer all backend-dependent improvements** (real-time presence, audit
    log, named filter presets, share-by-link) until Supabase lands.

---

## 6. Pre-audit checklist — agents run this BEFORE declaring lane done

Print this and tape it to the other side of the agent's forehead.

- [ ] All interactive controls have a ≥44×44px hit target on phone + tablet (use padding-trick where needed)
- [ ] All interactive controls have an `aria-label` OR visible text content
- [ ] All interactive controls have either a `tooltip` prop (when using Button), a `<Tooltip>` wrapper, or — on disabled buttons — a `title=` fallback
- [ ] Zero hex / raw rgb() / hsl() in any file under `components/` or `lib/`
- [ ] Zero subject colors invented locally — all via `.cp-subj.<id>` or `useSubjectColor`
- [ ] Responsive verified at **400**, **768**, and **1280** in DevTools device mode (NOT just Playwright headless)
- [ ] At each tier: no document-level horizontal scroll; every primary control reachable; sticky chrome ≤30% of phone viewport
- [ ] Print stylesheet considered where relevant (any page that surfaces lesson data)
- [ ] Empty state branched: "all clear" vs "no items match these filters"
- [ ] Loading state present (skeleton or spinner) for any data fetch
- [ ] Error state present (toast or inline message) for any mutation
- [ ] Reduced-motion respected for any animation (`@media (prefers-reduced-motion: reduce)` block)
- [ ] Keyboard reachable + focus ring visible on every interactive control
- [ ] `<h1>` per page; `<h2>` for primary sections; no skipped levels
- [ ] Persistence hooks follow the SSR-safe pattern (`use-school-months.ts` as reference)
- [ ] Lane's file ownership doesn't collide with any in-flight or queued lane (check `docs/queued-work-*.md` and this plan's §4)
- [ ] Commit message ends with `Verified: 360 OK / 768 OK / 1280 OK` (or honest `NEEDS WORK`)
- [ ] `npm run lint` + `npm run format:check` pass

---

## 7. Open questions for the user

Settle before execution. Each has a default the agents will assume if no answer
arrives.

1. **Settings on the icon rail vs the avatar — should both stay?** The Daily
   IconRail gear (`components/daily/IconRail.tsx:288-298`) already links to
   `/settings/curriculum`. The avatar (every route) links to
   `/settings/appearance`. Are these duplicates or do they have separate jobs?
   **Default if no answer:** unify — the avatar always opens the last-visited
   settings sub-page; the gear is removed from the Daily rail; a Settings
   entry is added to the global `LeftFilterPanel` (so it's reachable from
   every non-Daily route).

2. **Universal tooltip rollout — every Button, or just the icon buttons?** The
   user said "every button should have a popup explanation of what it does
   when moused over." Text buttons whose label is "Save" or "Cancel" are
   self-describing — a tooltip restating "Save" is noise. **Default if no
   answer:** the `tooltip` prop is added everywhere it conveys extra info
   (icon buttons, ambiguous text buttons, disabled controls); plain-text
   primary actions ("Save", "Cancel", "Continue") get a tooltip only when
   the action is destructive or has a non-obvious side effect.

3. **School-week edit in Settings — does changing it AFTER lessons exist
   re-shuffle the lessons?** The mock data hard-codes `day: 0..4`. If a
   teacher switches Sun-Thu → Mon-Fri, do existing lessons map 1:1 (the
   first day stays "first day") or do they get re-bound to weekday names?
   **Default if no answer:** 1:1 by index — `lesson.day = 0` means "first
   day of the school week" regardless of which weekday that is. Document
   this in the migration note.

4. **`/schedule` default day — today, or last-chosen?** The audit calls this
   out as a Major. **Default:** today on first visit; last-chosen on
   subsequent visits (per the cross-cutting audit's resolution).

5. **Holidays — in scope for this wave or deferred?** A holidays feature
   needs a data structure (Holiday[], with date + name + reason),
   an editor UI in Settings, plus consumer logic in every calendar surface
   (Year, Weekly, Daily, Schedule). **Default:** defer. The `showHolidays`
   filter exists already and feeds no data — landing the feature in this
   wave would balloon Wave 1 by ~90 min.

6. **Rotation / A-B schedules — in scope?** Onboarding captures it; nothing
   else uses it. **Default:** defer. Same reasoning — landing the data
   surface adds ~60 min and a 7th lane to Wave 1.

7. **Settings page navigation — flat sidebar or grouped?** Today's
   `app/settings/layout.tsx` is a flat scroll surface — each page exists at
   `/settings/<id>` but there's no internal sidebar listing them.
   **Default:** add a small left-rail sidebar inside the Settings layout
   listing the four (then five, then six) sub-pages. Reuse the existing
   IconRail / LeftFilterPanel chrome idiom for visual consistency.

---

## Appendix A — files that exist and where each lives

For each Wave 1-2 lane, the exact files the agent will touch. Confirms no
collisions.

| Lane | Files (path + role) |
|---|---|
| W | `app/settings/curriculum/page.tsx` (new), `app/settings/curriculum/page.module.css` (new), `components/shell/left-filter-panel.tsx` (modify — add Settings entry at the bottom) |
| X | `components/ui/Button.tsx`, `components/ui/Tooltip.tsx`, `components/ui/Tooltip.module.css` |
| Y | `lib/use-school-week.ts` (new), `app/settings/curriculum/page.tsx` (modify — coordinate with Lane W: Lane W owns lines 1-N for curriculumLabel + schoolMonths; Lane Y owns N+1 onward for schoolWeek) |
| Z | ~50 Button-consuming components — coordinate by section (top-bar, IconRail, LeftFilterPanel, every settings page, every Year sub-component, every lesson-card sub, every onboarding step, every catch-up sub, every daily sub). Each agent owns ONE section. |
| AA | `components/year/QuarterMonthWeekHeader.tsx`, `components/year/YearView.tsx` (Lane AA owns header-buttons row), `components/year/MonthPicker.tsx`, `app/(planner)/year/print/page.tsx` |
| AB | `components/year/AddUnitForm.tsx` (new) + `.module.css` (new), `lib/use-custom-units.ts` (new), `components/year/YearView.tsx` (Lane AB owns lines AFTER Lane AA's header-buttons row), `components/year/UnitBar.tsx` (modify — render custom units) |
| AC | `lib/theme.tsx`, `lib/palette.tsx`, `lib/app-state.tsx` |
| AD | `lib/custom-templates.tsx`, `app/settings/lesson-templates/page.tsx`, `components/lesson-templates/lesson-templates-manager.tsx` |
| AE | `app/settings/catch-up/page.tsx`, `lib/catchup-state.tsx` |
| AF | none (audit pass — writes `docs/audit-post-wave-2026-05-25.md`) |
| AG | screenshots only — writes to `docs/screenshots/post-wave-2026-05-25/` |

Cross-lane collision matrix:
- **W ↔ Y** both edit `app/settings/curriculum/page.tsx` → coordinate by section ownership (Lane W's header for curriculumLabel + months; Lane Y's tail for schoolWeek).
- **AA ↔ AB** both edit `components/year/YearView.tsx` → AA owns the header-buttons row (Configure + existing Filters/Export/Print); AB owns the new "+" button next to them AND the modal-mount slot below.
- All other lanes touch disjoint files.

---

End of plan. Next action: confirm § 7 open questions with the user, then
dispatch Wave 1 (Lanes W, X, Y) in parallel.
