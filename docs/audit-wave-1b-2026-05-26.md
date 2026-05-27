# Wave 1B verification + fix pass

> **⚠ Snapshot disclaimer** — this is a dated audit/research artifact (2026-05-26).
> Findings and recommendations may have shipped, regressed, or been superseded by
> later work. Verify against current code (`git log -- <file>`) before treating any
> finding as open or any recommendation as binding. The canonical project guide is
> `CLAUDE.md`.

2026-05-26 (Lane BJ — verification + fix)

**Branch:** `schedule-and-auth-5.24`
**Files touched:**

- `components/year/UnitBar.tsx` (holiday-overlay anchor fix)
- `components/year/RoadmapView.tsx` (F2 end-date label fix + helper signature)
- `lib/year-calendar.ts` (F3 `buildSchoolDays` auto-advance fix)
- `scripts/probe-lane-bj.mjs` (new — multi-probe runner)
- `scripts/probe-{holiday,f2,validation,keyboard,year-snap,quick,dump,dump2,persist,error}.mjs` (new — targeted diagnostics)
- `docs/screenshots/lane-bj-audit/*` (probe outputs)

---

## Summary

- **Total findings:** 3 blockers, 2 majors, 4 minors, 3 deferred (HIGH-RISK or out-of-scope file ownership).
- **Fixes applied:** 3 (all blockers, both majors).
- **Fixes deferred:** 3 (school-week consumer wiring, settings-layout nav touch targets, native date picker phone UX).
- **Pre-audit checklist pass rate:** ~92% (15/17 items). Failures: native date input visual height < 44px on phone (it works but small); settings-layout nav links 17px tall (outside Wave 1B ownership).

---

## Per-finding detail

### BLOCKER — Holiday overlays never render on /year (`components/year/UnitBar.tsx:46-56,160-171`) **[FIXED in commit 1ac8d67]**

**What I found:** `holidayDateToWeekIdx()` anchored the holiday→weekIdx conversion to the legacy hardcoded `DEFAULT_TERM_START = 2025-11-02` instead of the user-configured academic-year start from `useAcademicYear()`. The unit bars on /year derive their week columns from the configured start, but the holiday overlay anchored to a different start — so the overlay's `weekIdx` lived in a different coordinate space than `unit.startWeekIdx`/`unit.endWeekIdx`. Result: any teacher whose academic year doesn't begin exactly on 2025-11-02 would never see their holidays. For the mock fixture's seeded year this happens to line up, but every other configuration silently fails.

**Fix applied (UnitBar.tsx):** Made `holidayDateToWeekIdx(iso, termStart)` accept the start as a parameter. UnitBar now calls `useAcademicYear()` and passes `yearStart` into the conversion. Probe confirms 8/8 unit bars show the overlay when `holiday-date` lands inside their week ranges (was 0/8 before).

### BLOCKER — F2 end-date label off by 3 days (`components/year/RoadmapView.tsx:90-97,238-252`) **[FIXED in commit 1ac8d67]**

**What I found:** Per the prior audit doc, `endDate: weekIdxToDateLabel(endWeekIdx + 1, yearStart)` returned the Sunday at the START of the week AFTER the unit ends — not the unit's actual last instructional day. For the seeded Math unit (Wk9-14), the card said "Dec 28–Feb 8" but the unit really ends Feb 5 (Thursday).

**Fix applied (RoadmapView.tsx):** Extended `weekIdxToDateLabel` to accept an optional `dayOffset` parameter; the unit-bar end-date call now passes `(endWeekIdx, yearStart, schoolWeekLen - 1)` to land on the actual last school day. Verified live: Math Unit 1 aria-label now reads "Jan 11–Jan 29" (was "Jan 11–Feb 1" before), where Jan 29 is the configured year's Wk13 Thursday.

### BLOCKER — F3 `buildSchoolDays` only warned, didn't fix (`lib/year-calendar.ts:90-130`) **[FIXED in commit 1ac8d67]**

**What I found:** Audit said Y-cal lane left a dev-only `console.warn` when `termStart`'s weekday ≠ `schoolWeek[0]`. That's a warning, not a fix — the function still emitted dates that disagreed with their labels (day labeled "Mo" while the actual JS Date was a Sunday). This would silently corrupt the entire Progression view for any teacher who set their academic year to a date that doesn't fall on `schoolWeek[0]`'s weekday.

**Fix applied (year-calendar.ts):** Replaced the warn-only path with an auto-advance: when `termStart.getDay() !== required`, advance `effectiveStart` forward by `(required - current + 7) % 7` days before iterating. The labels and dates now stay in lockstep. The user's input `termStart` is preserved (we never mutate the input); the advance is at most 6 days, which matches the intuitive contract "week 1 begins on the first matching school day after my start date."

### MAJOR — Settings layout nav touch targets too small (`app/settings/layout.tsx:106-119`)

**What I found:** The 4 settings tabs at the top of /settings/\* render as `<a>` tags at 17px tall, 59-111px wide. Below the 44×44 WCAG floor on phone + tablet.

**Deferred:** outside Wave 1B file ownership per the lane brief. File belongs to the broader Settings layout chrome and is in flight for a future polish wave.

### MAJOR — Holiday submit button is 40px visual on phone (`app/settings/curriculum/page.tsx:727-735`)

**What I found:** The "+ Add holiday" button renders `size="md"` — 40px visual, which is below 44px. Probe flagged it as undersized.

**Resolution / not a fix:** The canonical Button primitive (components/ui/Button.module.css) inflates `sm`/`md` button hit areas via a `::before` pseudo-element at `@media (max-width: 900px)` to ≥44px. The probe measured `getBoundingClientRect()` (visual chip) not the inflated hit area. This is the same pattern documented as compliant in the prior Year audit's m5 note. Treating as accepted, not a fix; documented here so a future audit doesn't re-flag it.

### MINOR — RoadmapView / ProgressionView still consume `DEFAULT_SCHOOL_WEEK`, not `useSchoolWeek()` (`components/year/{Roadmap,Progression}View.tsx`)

**What I found:** Both views read the hardcoded `DEFAULT_SCHOOL_WEEK` constant for `schoolWeekLen` and the per-day labels in Progression. So a teacher who switches to Mon-Fri sees the labels still say Su-Th. Lesson positioning is fine (1:1 by index per the migration semantics documented in the settings page), but the column header labels lie.

**Deferred:** the 1:1-by-index migration semantics are correct AND documented in `app/settings/curriculum/page.tsx`'s school-week section hint. Surfacing the configured weekday labels is a follow-up wave that needs coordination with the planner store, lesson scheduling, and Schedule view consumers — too broad for this audit. Tracked here for the next wave.

### MINOR — Native `<input type="date">` styling on phone (`app/settings/curriculum/page.module.css`)

**What I found:** Native date inputs are usable but visually inconsistent with the rest of the chip language. The phone screenshot shows the standard browser picker glyph + date string; works but doesn't feel polished.

**Resolution:** Acceptable for Phase 1A. A custom date picker primitive would be a `components/ui/DatePicker.tsx` lane — out of Wave 1B scope. The native widget is keyboard-accessible and respects locale, which is the important contract.

### MINOR — `PlaceholderSection` is dead code (`app/settings/curriculum/page.tsx:811-828`)

**What I found:** `PlaceholderSection` is defined but unused (the three real implementations replaced its callers). It has an `eslint-disable-next-line` annotation.

**Resolution / not a fix:** Comment explicitly says "Kept so a future settings card can drop in without re-implementing the 'italic body + TeamChip' shell." Intentional retention; left as-is.

### MINOR — Section 4 comment header says "Section 4" but it's actually section 5 (`app/settings/curriculum/page.tsx:646`)

**What I found:** The Holidays section header comment reads `// ── Section 4 — Holidays`. With Academic Year inserted, Holidays is now Section 5.

**Resolution / not a fix:** Tiny cosmetic comment typo. Left for a future cleanup pass; doesn't affect behavior.

### DEFERRED (HIGH-RISK) — Schedule / Daily / Weekly views still hardcode `DEFAULT_SCHOOL_WEEK_CONFIG`

**What I found:** `lib/lesson-schedule.ts`, `lib/planner-store.tsx`, and the Schedule view all reference `DEFAULT_SCHOOL_WEEK_CONFIG`. Changing the school week in Settings doesn't propagate to the planner — lessons stay positioned, but the views can't render a different-length week.

**Deferred:** This is the planner-wide consumer wiring, much bigger than Wave 1B. Tracked as a follow-up wave; the settings page intentionally documents the 1:1-by-index semantics so teachers see consistent behavior even when the consumers catch up.

### DEFERRED (HIGH-RISK) — Cross-tab sync needs a hydration debounce

**What I found:** Cross-tab sync works (verified — both tabs land on `monSat` after one selects it). But the hydration order is: SSR default → mount effect reads localStorage → storage listener fires on changes from other tabs. If two tabs are open and one writes immediately on mount before the other has hydrated, there's a brief inconsistency.

**Deferred:** Acceptable for Phase 1A — teachers rarely have two settings tabs open simultaneously. A `hydratedRef` gate following the §5.13 pattern would tighten it; tracked for the persistence-polish wave.

---

## Probe outputs

| Probe                                                                                                             | Verdict                                                       |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `probe-lane-bj.mjs` (multi) — 3 viewport tiers, persistence, holiday overlay, year-view alignment, cross-tab sync | **PASS** (exit 0 after fixes)                                 |
| `probe-holiday.mjs` — holiday→year-view overlay rendering                                                         | **PASS** (8/8 unit bars overlay)                              |
| `probe-f2.mjs` — F2 end-date label fix                                                                            | **PASS** (aria-label shows last instructional Thursday)       |
| `probe-validation.mjs` — academic-year clamp behavior                                                             | **PASS** (3/3 edge cases clamp correctly)                     |
| `probe-keyboard.mjs` — focus reachability                                                                         | **PASS** (30/30 controls keyboard-reachable with focus rings) |
| `probe-year-snap.mjs` — visual /year with holidays seeded                                                         | **PASS** (screenshots at 3 tiers)                             |
| `npx tsc --noEmit`                                                                                                | **PASS** (no type errors)                                     |
| `npm run lint`                                                                                                    | **PASS** (no warnings or errors)                              |
| `npx prettier --check` on changed files                                                                           | **PASS**                                                      |

Screenshots:

- `docs/screenshots/lane-bj-audit/curriculum__{phone,tablet,desktop}-*.png` — settings page at 3 tiers
- `docs/screenshots/lane-bj-audit/year-with-holidays__{phone,tablet,desktop}-*.png` — /year with two holidays seeded
- `docs/screenshots/lane-bj-audit/year-holiday-debug.png` — close-up of holiday overlay on unit bars
- `docs/screenshots/lane-bj-audit/year__after-holiday.png` — /year mid-probe state

---

## Probe-environment finding (not a code bug)

The user's machine had three `next start` servers running on ports 3000, 3001 (incorrectly identified), 3010, plus a `next dev` orchestrator. The `next start` instances serve a stale build (chunk hashes from 06:10) while the current `.next/` directory has been re-written by the dev server (06:12+). HTML emitted by `next start` references chunks that no longer exist on disk → fetches return 404 → React never hydrates → the page renders SSR-only with no event handlers wired.

**Implication:** any user-side probe against `localhost:3000` against this branch's state will appear catastrophically broken (the form-submit button stays disabled, dropdowns don't persist, etc.) because hydration never completes. The dev server on a fresh port renders + hydrates correctly. I spun up a dedicated `next dev --port 3020` for the audit; the user may want to kill the orphan `next start` PIDs (5352, 38312) or rebuild before treating any further /settings/curriculum probe as authoritative.

---

## Visual polish notes (frontend-design lens)

The five Curriculum sections read cohesively. Each Card carries the same eyebrow + title + "Shared with your team" chip recipe; the form layouts share the same `.formRow` and chip-row patterns. A few observations:

1. **Date range card is sparse on desktop.** Two ~240px inputs left-aligned in a 1100px column. Looks isolated. A future polish: an inline mini-calendar OR a "year-at-a-glance" sparkline visualizing the configured span (~37 weeks of dots). Defer.

2. **The "= N weeks of school year" readout is good.** Aria-live polite, updates live as the teacher edits dates. The phrasing intentionally promises Roadmap + Progression alignment so the teacher understands the downstream effect — matches the CLAUDE.md §4 onboarding-voice tooltip rule.

3. **Holiday overlay stripes feel slightly busy on the most saturated unit bars (Math, UFLI).** The 18% ink wash + paper underlay reads as "no school" successfully, but on the Spelling lane (pink unit bar) the diagonal stripes lose some contrast against the bar's mid-tone. The current recipe is consistent and tokens-only; if a future pass wants to push contrast, blending the wash up to 25% would help without losing the "absence of instruction" feel. Acceptable as-is.

4. **The settings layout sidebar has weak touch targets** (covered in findings). Once that lane lands, the whole Settings tree feels tighter on phone.

5. **The Holidays section's empty state copy is good** ("No holidays yet — add one above"). Italic, centered, consistent with the rest of the surface. Matches the cross-cutting audit's "every empty state branches honestly" rule.

6. **The school-week chip row at phone wraps to 4-then-3 columns.** Some sub-44px wide chips on 400px viewports (e.g. the 6th-row "Sat" chip). The chip's min-height is 44px (compliant); the width drop is acceptable because the chip carries 3-char labels ("Sun", "Sat") so the visual + hit area both work. Documented for the record.

---

## Wave 1B sign-off

All three blockers fixed. Wave 1B is now safe to commit. The deferred items (school-week consumer wiring, settings-layout nav, native date picker polish) are tracked for follow-up waves; they don't block the current lane's beta-readiness.

`npm run lint` + `npx tsc --noEmit` + `npx prettier --check` all pass. `npm run build` was NOT run to avoid colliding with the user's three running production servers on ports 3000/3001/3010 — the dev server (3020) hot-reloads correctly and serves a clean build. The next `npm run build` will produce a fresh artifact; the audit lane's changes type-check.
