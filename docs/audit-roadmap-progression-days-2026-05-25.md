# Audit — Roadmap & Progression day/week accuracy (2026-05-25)

> **⚠ Snapshot disclaimer** — this is a dated audit/research artifact (2026-05-25).
> Findings and recommendations may have shipped, regressed, or been superseded by
> later work. Verify against current code (`git log -- <file>`) before treating any
> finding as open or any recommendation as binding. The canonical project guide is
> `CLAUDE.md`.

**Lane:** lane-bh-calendar-audit (Task #40)
**Branch:** `schedule-and-auth-5.24`
**Scope:** calendar-math only. NOT visual redesign of UnitBar / lanes
/ chameleon; NOT data-shape changes the Lane Y-cal wave is queued to do.

## Methodology

`scripts/probe-calendar-accuracy.mjs` mirrors every calendar helper in
`lib/year-calendar.ts` + `lib/mock/calendar.ts` against an independent
re-derivation using bare `new Date()` arithmetic, then asserts each
output. 50 assertions — all 50 PASS. The probe also surfaces two
non-failing structural concerns (the `INFO` lines).

To re-run:

```
node scripts/probe-calendar-accuracy.mjs
```

Exit code is non-zero on any FAIL; commit as a regression check.

---

## Findings

| #   | Severity      | File                                | One-line                                                                          |
| --- | ------------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| F1  | **MAJOR**     | `components/year/QuarterMonthWeekHeader.tsx:79` | `gridColumn: span 0` is invalid CSS; out-of-session months take 1 cell, drifting the header 3 cells right of the lane body. **[FIXED in commit e0cb380]** |
| F2  | **MINOR**     | `components/year/RoadmapView.tsx:239`           | UnitBar `endDate` label points at the Sunday AFTER the unit's last instructional week, not the actual last lesson day. Off by 3 calendar days. **[FIXED in commit 1ac8d67]** |
| F3  | **MINOR**     | `lib/year-calendar.ts:90`                       | `buildSchoolDays()` silently mislabels days when `termStart`'s weekday ≠ `schoolWeek[0]`. Latent for the Sun-Thu mock; will burn future Mon-Fri schools. **[FIXED in commit 1ac8d67]** |
| F4  | **NON-ISSUE** | `lib/mock/calendar.ts:48`                       | Anchor 2025-11-02 is a Sunday — confirmed. Wk1 day0..day4 align to JS weekdays 0..4 exactly. |
| F5  | **NON-ISSUE** | `lib/year-calendar.ts:243`                      | `quarterForWeek` / `monthsForQuarter(1)` / `weeksInQuarter(1)` all sum to expected counts (9 weeks/quarter, 36 weeks total). Cross-checked against an independent re-derivation. |
| F6  | **NON-ISSUE** | `components/year/UnitBar.tsx:116-117`           | `left` and `width` are correct for the inclusive Wk9-14 case. spanWeeks = 6; left = 768px; width = 568px; bar right-edge (1336) sits below wk15's left-edge (1344) — no bleed. |
| F7  | **NON-ISSUE** | `components/year/TodayMarker.tsx:43-44`         | `currentWeekIdx = CURRENT_WEEK - 1 = 11` maps to Sun 2026-01-18 — the documented "today" date. TodayMarker centers correctly on column 11 at 1104px. |

---

## F1 — MAJOR — month header drifts 3 cells right of body grid

### Where

- **Producer:** `lib/year-calendar.ts:406-464` — `allYearMonths()`
  returns 12 calendar-month bands, including bands with
  `weeks: 0`/`hasData: false` for months that have no academic weeks.
  Documented behavior, intentional, used by `MonthPicker`.
- **Consumer:** `components/year/QuarterMonthWeekHeader.tsx:75-83`
  renders each band as a Grid item with
  `style={{ gridColumn: `span ${m.weeks}` }}`. For the 3 bands with
  `weeks: 0` (in the default mock anchor: August, September, October —
  the gap between July Wk36 and November Wk1) this produces
  `gridColumn: span 0`.

### Why it's broken

Per CSS Grid Level 1 §10.2 — "If the integer is 0, the declaration is
invalid." Browsers fall back to the initial value (`auto / span 1`).
That means each empty band consumes **one column** of the grid
template even though it should consume zero. With 3 empty bands the
header is **3 columns wider** than the week template
(`leftRailWidthPx + 36 × columnWidthPx`), so the month names no
longer sit above their correct week columns. The lane-body grid below
the header is unaffected — it doesn't iterate `months` — so the
header silently desynchronizes from the lanes.

### Expected vs actual

| metric                          | expected   | actual                                  |
| ------------------------------- | ---------- | --------------------------------------- |
| Sum of rendered month-cell spans | 36         | 36 + (count of `weeks:0` bands) = **39** |
| Header-row column count         | 36 (+ rail) | 39 (+ rail) — **drifts 3 cells right** |
| Lane-body column count          | 36 (+ rail) | 36 (+ rail)                              |

### Proposed fix (consumer side — owner Lane Y-cal or similar)

`QuarterMonthWeekHeader.tsx` line 75: filter out bands with
`weeks === 0` (or `hasData === false`) before mapping:

```tsx
{months
  .filter((m) => m.weeks > 0)
  .map((m, mi) => (
    <div
      key={`${m.label}-${mi}`}
      className={`${styles.monthCell} ${mi > 0 ? styles.monthBorder : ""}`}
      style={{ gridColumn: `span ${m.weeks}` }}
    >
      {m.label}
    </div>
  ))}
```

The `MonthPicker` consumer is unaffected because it iterates the
full 12-entry list directly and gates on `hasData`.

### Cannot fix in this lane

Lane BH is restricted from `components/year/*` (Lane W in-flight). The
producer-side alternative — return only `hasData` bands from
`allYearMonths()` — would break `MonthPicker` and the queued Lane T
settings work, which depends on the 12-entry contract.

---

## F2 — MINOR — UnitBar `endDate` label off by 3 calendar days

### Where

`components/year/RoadmapView.tsx:239`

```ts
endDate: weekIdxToDateLabel(endWeekIdx + 1),
```

`weekIdxToDateLabel(weekIdx)` returns "Mon DD" for `termStart + weekIdx * 7`
days — i.e. the Sunday at the START of that week. So passing
`endWeekIdx + 1` returns the Sunday at the START of the week AFTER the
unit ends.

### Expected vs actual

For the seeded Math unit "Wk 9–14":

- `startWeekIdx = 8` → `weekIdxToDateLabel(8)` → "Dec 28" (Wk9 Sun) ✓
- `endWeekIdx = 13` → `weekIdxToDateLabel(14)` → **"Feb 8"** (Wk15 Sun)

A Sun-Thu school's Wk14 last instructional day is **Thu Feb 5**, not
Sun Feb 8. The card shows "Dec 28–Feb 8" but the unit actually ends
Feb 5. Teachers reading the card will mis-plan the boundary day.

### Proposed fix

```ts
// Unit's actual end day is week `endWeekIdx`'s last instructional day.
// For a Sun-Thu school week, that's Thursday — index 4 (schoolWeekLen-1).
endDate: weekIdxToDateLabel(endWeekIdx, schoolWeekLen - 1),
```

…and extend `weekIdxToDateLabel` to accept an optional dayIndex (it
already builds a Date internally — just add the `+ dayIndex` offset).

### Cannot fix in this lane

`components/year/RoadmapView.tsx` is under Lane W's in-flight scope.
Documenting only.

---

## F3 — MINOR — `buildSchoolDays` silent mislabel when termStart ≠ schoolWeek[0]

### Where

`lib/year-calendar.ts:90-121`

The function adds `w*7 + d` days to `termStart` and labels day `d` with
`schoolWeek[d]`. This is correct IFF `termStart`'s JS weekday equals
the weekday `schoolWeek[0]` represents. The function's docstring says
so ("should correspond to the first school day, i.e. schoolWeek[0]
weekday") but doesn't enforce it.

### Expected vs actual

Probe section 10 of `probe-calendar-accuracy.mjs`:

- `buildSchoolDays(sundayAnchor, 1, ["Mo","Tu","We","Th","Fr"])`
- `days[0].wkd === "Mo"` but the actual JS `.getDay() === 0` (Sunday).
- Every subsequent dateNum is off by one weekday.

For the current mock (Sun-Thu + Sun anchor) this is a non-issue. But
the queued Lane Y-cal "academic year dates" work will introduce
configurable term-start dates — the first time a Mon-Fri school sets
their term start to, say, Mon Sep 7 2026, the function will compute
correct dates (because all the date arithmetic is correct) BUT the
labels and the corresponding `firstOfMonth` checks won't drift since
the offsets ARE consistent. So this is closer to a "constraint not
asserted" than an active bug — but it is a footgun for the upcoming
calendar rewrite.

### Proposed fix (defer to Lane Y-cal)

Add a guard at the top of `buildSchoolDays`:

```ts
// Map "Su"|"Mo"|"Tu"|"We"|"Th"|"Fr"|"Sa" -> JS .getDay() 0..6.
const WEEKDAY_TO_JS = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };
const requiredJsDay = WEEKDAY_TO_JS[schoolWeek[0]];
if (termStart.getDay() !== requiredJsDay) {
  // Either auto-advance termStart to the next requiredJsDay, or throw.
  // Lane Y-cal should pick.
}
```

Lane Y-cal will rewrite the calendar derivation anyway — leave the
decision to that lane and capture the constraint in code there.

---

## Low-risk fixes applied in this lane

**None.** Every concrete bug found lives in a component file Lane BH
cannot touch (Lane W in-flight, Lane Y-cal queued). The producer-side
helpers in `lib/year-calendar.ts` and `lib/mock/calendar.ts` ARE
mathematically correct against an independent re-derivation (50/50
probe assertions pass) — the bugs are at the consumer boundary.

The probe script is committed as a regression check so any future
edits to those helpers are guarded.

---

## Out-of-scope concerns surfaced (for Lane Y-cal awareness)

1. **Anchor consistency.** `DEFAULT_TERM_START` (year-calendar.ts:220)
   and `WEEK_1_DAY_0` (mock/calendar.ts:48) are independent constants
   that happen to match (2025-11-02). Lane Y-cal should unify them
   behind a single source of truth — drift between them would corrupt
   /year vs /daily date alignment.
2. **November term-start is mock-only.** A real US/Qatar school year
   doesn't start on Nov 2 — it starts in Aug/Sep. The `weeks: 0`
   bands the header currently mis-renders (F1) are an artifact of
   this mock. Real schools would have no `weeks: 0` bands across the
   active months and F1 would be silently latent until a school
   configures a short year. Fix F1 anyway — it's correct hygiene.
3. **No holiday / break support.** `buildSchoolDays` advances 7
   calendar days per academic week with no skip — a Ramadan timetable
   or a winter break will silently double-count those weeks.
   CLAUDE.md §1 names this as a deferred concern; Lane Y-cal should
   land week-renumbering before this matters.

---

## Probe output (abbreviated)

```
PASS: 50
FAIL: 0

Notes (INFO lines):
  • Unit-card endDate label = "Feb 8" but actual end = Feb 5 (F2).
  • Mon-Fri school week + Sun anchor → days[0] labeled "Mo" but
    JS getDay()=0 (F3).
```

Full output: re-run `node scripts/probe-calendar-accuracy.mjs`.
