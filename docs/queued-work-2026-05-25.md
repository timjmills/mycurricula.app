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
