# Queued work — paused at session limit 2026-05-25

The 2026-05-25 evening session hit the Anthropic API session token limit
mid-wave. Six dispatched agents (P'/R/S/T/U/V) and one prior agent (Q)
all terminated with "You've hit your session limit · resets 6:30pm
Asia/Riyadh". Lane P' and Lane R landed clean working code before
termination and were committed (`8239986`, `8f70a88`). The remaining
lanes did not land code.

This doc captures the queued work so the next session can resume
without re-deriving scope.

---

## Already landed + committed

- **Lane P'** — wordmark `curriculumLabel` free text (audit m3 fix).
  Field added to `CurrentUser`; FALLBACK_USER seeds "Grade 5"; the
  top-bar wordmark renders whatever the user configures. Settings UI
  to edit it still pending (Lane S).

- **Lane R** — school-months data layer + `useSchoolMonths()` hook.
  `ALL_SCHOOL_MONTHS`, `SCHOOL_MONTH_PRESETS`, `YearMonthBand` with
  `monthIndex` + `hasData`, `allYearMonths()` now returns 12 entries.
  Settings UI + /year consumers still pending (Lanes S, T).

---

## Paused — need to re-dispatch after 6:30pm Riyadh

### Lane Q — m7 Tooltip cross-browser verification
Verify in headed Playwright (Chromium/Firefox/WebKit) whether the
styled Tooltip fires on hover over /year's disabled Filters/Export
buttons. If broken, fix in `components/ui/Tooltip.tsx` by binding
listeners to a wrapper for disabled children. Was the smallest of all
lanes; ~20 min of work.

### Lane S — `/settings/curriculum` settings page
New `app/settings/curriculum/page.tsx` + `.module.css`. Bundles two
controls:
1. **Curriculum label** — free-text input. Persists to
   `currentUser.curriculumLabel` (Lane P''s field). Default "Grade 5".
2. **School months** — 12 month toggles (Jan-Dec) + preset selector
   (All Year / US / Qatar / Southern / Summer). Persists via Lane R's
   `useSchoolMonths()` hook. Default: all 12.

Match existing `app/settings/{appearance,catch-up,lesson-templates}`
page structure. Add a "Curriculum" entry to the settings nav.

### Lane T — wire /year + /year/print to schoolMonths
Read `useSchoolMonths()` and filter the displayed months to the
active subset. Touches:
- `components/year/QuarterMonthWeekHeader.tsx`
- `components/year/YearView.tsx` — add a "Configure" link to
  `/settings/curriculum` next to Filters/Export/Print
- `components/year/MonthPicker.tsx`
- `app/(planner)/year/print/page.tsx`

Default = all 12 active so first visit shows full year.

### Lane U — `/year` "+ Add Unit" feature
Plus button in /year header opens a modal with:
1. Unit type label (free text — "Unit of Study" / "Unit of Inquiry").
2. Unit name.
3. Subject.
4. Start date.
5. End date.
6. Number of weeks (auto from dates, user can override).
7. Number of lessons (auto from weeks × days-per-week below).
8. **NEW per user 2026-05-25 late-session note:** Days of the week the
   course runs (multi-select from the school week). Auto-computes
   lesson count = weeks × selected days. The Year-view visual must
   only render lesson markers on the selected weekdays. Default: all
   school days.

Persistence: new `lib/use-custom-units.ts` hook backed by
localStorage `mycurricula:custom-units`. Render on Year timeline via
the existing UnitBar pattern.

### Lane V — RESEARCH unit import strategy
Read-only research. Output: `docs/research-unit-import-2026-05-25.md`
covering Excel / Google Sheets / Google Docs / Word / paste. Output
shape per user clarification: **units AND lessons (with titles)** —
the nested hierarchy. Implementation lane breakdown for a follow-up
wave.

### NEW lane (post-session-limit user request)
**Settings button for the left icon bar.** Currently the icon rail
on the left of the planner (the column with the icon-only buttons —
see `components/shell/left-filter-panel.tsx` or wherever the rail
lives) does not have a "Settings" entry. Add one that links to
`/settings/curriculum` (or to `/settings` if the rail should be the
generic gateway).

---

## Coordination notes for the next session

- Lane S consumes Lane P' (`curriculumLabel`) and Lane R
  (`useSchoolMonths`). Both already landed.
- Lane T consumes Lane R. Lane R landed; Lane T can start immediately.
- Lane U is independent of Lanes S/T but touches `YearView.tsx`'s
  header — coordinate with Lane T (which also adds a header button).
  Put the buttons on adjacent lines for a clean merge.
- Lane V is research-only; runs in parallel with any implementation.
- The new "settings button on icon bar" lane is independent of
  everything else — likely the smallest lane.

## What WORKS right now in the committed tree

- `mycurricula.app/year` already shows the latest from earlier in the
  day: tighter zoom, compact /weekly-style subject buttons, sticky
  lane column, eyebrow rail sticky-left, chameleon gradient at full
  width, dual-mount CSS-only switch, dedicated /year/print route.
- `/daily` list-mode right-rail overlap fix is live.
- The wordmark suffix is now `curriculumLabel`-driven (defaults to
  "Grade 5"); changing it requires editing `lib/app-state.tsx` until
  Lane S ships the UI.
- The `useSchoolMonths()` hook exists and `allYearMonths()` returns
  12 entries, but no consumer reads the filter yet — `/year` still
  shows the same 9-month range as before Lane T lands.

---

## Late-session addition 2 — Schedule as side panel (not a top tab)

User direction (after Wave 1A dispatch):
> "the schedule view/pane, I want to take out from one of the main buttons at the top and I want to instead have it as one of the side panes. The side pane buttons panels can be combined and moved whereever they would like them."

**Scope (Wave 1.5, queued for after Lane W lands):**

1. **Drop Schedule from the top-bar tab strip.** Currently: Daily / Weekly /
   Yearly / Curriculum / Schedule. New: Daily / Weekly / Yearly / Curriculum.
   The `/schedule` route may stay as a deep-link surface or be deleted —
   the user can decide.

2. **Schedule lives as a side panel.** Accessible from:
   - The Daily IconRail (currently has a "Schedule" coming-soon button —
     wire it as the trigger).
   - Or the right rail / panel manifest if we treat it as one of N
     toggleable side panels.

3. **Side panels are user-arranged.** The user can combine and reposition
   side panels — currently the right rail has Resources / To-dos / Comments,
   and the left has the filter panel. Add panel-management chrome that lets
   the user pick which panels appear in which rail, and persist the layout
   (USER-scoped — per the team/user scoping doctrine, since panel arrangement
   is a personal preference).

**Coordination with currently in-flight work:**
- Lane W touches `components/shell/top-bar.tsx` (unify gear/avatar destination).
  Removing the Schedule tab also touches `top-bar.tsx`. Must dispatch AFTER
  Lane W merges.
- Lane W also touches `components/daily/IconRail.tsx` (gear destination).
  Wiring the Schedule trigger there is touch-adjacent. Must dispatch AFTER
  Lane W merges.

**Lane breakdown (rough):**
- **Lane BA** — remove Schedule tab from top-bar; redirect `/schedule` route
  to its panel form OR keep as deep-link.
- **Lane BB** — Schedule side-panel component (consume existing
  `components/schedule/*` content; render in a rail slot).
- **Lane BC** — panel-arrangement system: which-panel-in-which-rail UI,
  persistence as `mycurricula:user:panel-layout`.
- **Lane BD** — entry points: wire Schedule trigger in IconRail / right rail
  toggle.

This is a substantial wave — probably 3-4 hr parallelized. Defer to after
Wave 1A (W + X) and Wave 1B (Y + Y-hol) settle.

---

## Late-session addition 3 — Subject-filtered chameleon calendar (Lane BG)

User direction (after Lane X landed):
> "The roadmap and progression calendar visuals should follow the color of the selected subject."

Clarified via 3 AskUserQuestion answers:
- **Trigger:** subject filter chips, BUT a new calendar is shown ABOVE the main roadmap — in the selected subject's color. So it stacks: per-subject tinted calendar(s) on top, neutral multi-subject roadmap below.
- **Intensity:** Full chameleon (use the same `linear-gradient(var(--c), var(--cl))` pattern the QuarterMonthWeekHeader already uses — recently fixed by Lane M to span the full content width).
- **No subject selected (or all selected):** Return to neutral (no extra calendar, just the main multi-subject view).

**Lane BG file scope:**
- MODIFY: `components/year/YearView.tsx` — when the subject filter has exactly N selected (where 0 < N < 8), render N subject-tinted calendars above the existing Roadmap/Progression mount. Each gets `subjectId={s}` so its descendant header carries the cp-subj cascade and chameleon class.
- NEW: `components/year/SubjectCalendar.tsx` (+ `.module.css`) — a per-subject filtered view of the Roadmap layout, scoped to that one subject's units and tinted via the cp-subj cascade. Likely a thin wrapper over RoadmapView with a subjectFilter prop.
- MODIFY: `components/year/RoadmapView.tsx` if needed to accept a single-subject filter prop (probably already does — it has `subjectFilter`).

**Dependencies:** Lane W is in `components/year/YearView.tsx`'s header (Configure button) — Lane BG also touches YearView.tsx body. Wait for Lane W to merge to avoid collision.

**Coordination notes:**
- The chameleon gradient + sticky-left + sticky-top fixes from Lane M are reused — SubjectCalendar's header is a `<QuarterMonthWeekHeader subjectId={s} />` mount; the existing CSS already paints the chameleon when `subjectId` is set.
- Default neutral state stays untouched.
