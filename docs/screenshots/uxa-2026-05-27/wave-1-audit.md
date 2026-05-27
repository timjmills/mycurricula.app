# Wave 1 — audit notes (2026-05-27)

## Gate result: ✓ pass

- `npm run lint` clean (0 warnings, 0 errors).
- `npm run build` clean (31 routes generated successfully).
- Probe: 21/21 screenshots captured at 360/768/1280 across `/weekly`, `/daily`, `/year`, `/subject/math`, `/schedule`, `/catch-up`, `/settings/curriculum`.
- No document-level horizontal scroll at any tier.

## Lanes delivered

| Lane | Status | Files touched | Verification |
|---|---|---|---|
| A1 nested buttons | ✓ | `components/subject/SubjectView.tsx` (LessonRowItem + GroupBlock outer buttons → `<div role="button">` with `e.target===e.currentTarget` guard on the keydown handler) | `/subject/math` error count dropped from **3 nested-button hydration warnings → 0**. Verified by re-probe. |
| A2 Catch-up bulk actions | ✓ | `components/catchup/BulkActionBar.tsx`, `components/catchup/CatchupScreen.tsx` | "Add all to to-do" button removed entirely (and its handler/prop). "Carry over all to…" renamed "Mark all as needs carry-over" with honest tooltip copy. Decision per Tim AskUserQuestion = "Disable + rename". |
| A3 Daily pane 280px min | ✓ | `components/daily/DailyView.tsx` (PANE_VISIBLE_MIN const added; clampPaneWidth + paneBounds bounded by 280 not 40) | Splitter now snaps to ≥280 px; PANE_FLOOR retained only as the reservation arithmetic floor for the other-pane share. Collapsed-state chevron toggle deferred (the audit's core complaint — unreadable slivers — is resolved). |
| A4 useSchoolWeek in Schedule | ✓ | `app/(planner)/schedule/page.tsx`, `components/schedule/SchedulePanel.tsx`, `lib/use-school-week.ts` (exported `WEEKDAY_INDEX`) | Both surfaces derive day list from `useSchoolWeek()` + `WEEKDAY_INDEX[token]`. Hardcoded `[0,1,2,3,4]` constants removed. |
| A5 Grade 5 leaks | ✓ | `app/layout.tsx` (metadata → static "MyCurricula — Curriculum Planner"), `components/subject/SubjectView.tsx:866`, `components/catchup/CatchupScreen.tsx:269`, `app/(planner)/year/print/page.tsx:166`, `app/(planner)/weekly/print/page.tsx:110` | All read `useAppState().currentUser.curriculumLabel`; suffix omitted entirely when empty. |
| A6 FutureControl primitive | ✓ partial | New `components/ui/FutureControl.tsx` + `.module.css` + barrel; applied to `components/year/YearView.tsx` (Filters, Export), `components/year/YearSidebar.tsx` (3 nav items), `components/lesson-flow/section-resources.tsx` (Show more) | Distinct treatment: dashed outline, 70% opacity, `cursor:not-allowed`, inline/corner SOON pill, onboarding-voice tooltip. **Not yet applied** to ResourceComposer Search tile (rework in W3-C4) or any schedule-disabled options (none found in current code). |
| V5 Subject→Daily jump | ✓ | `app/(planner)/daily/page.tsx` (async server component awaiting searchParams), `components/daily/DailyView.tsx` (accepts `initialLessonId` prop; seeds selectedId + syncs week/selectedDay + router.replace clears the query) | Subject row click at `SubjectView.tsx:943` now actually lands on the intended lesson — even on a different week+day than the user's previous Daily selection. |

## Errors / bugs / omissions / gaps surfaced

1. **App-wide hydration mismatch warning (NEW finding, pre-existing in code).** Every route fires one React hydration warning: "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties." Trace: `GlobalRail → SortableContext → SortableWrap → <li style={{transform:undefined, transition:undefined, opacity:1, zIndex:undefined, touchAction:"none"}}>`. The mismatch comes from `@dnd-kit/sortable`'s `useSortable()` returning dynamic style values that differ SSR vs CSR. Not introduced by W1 (was already present in Wave 0 baseline once the SSR 500 was fixed); not blocking. **Defer to Wave 5 polish** — fix candidates: `suppressHydrationWarning` on the SortableWrap `<li>`, or migrate to a client-only mount pattern for the rail's dnd context.

2. **A6 partial coverage.** FutureControl is applied to 6 placeholder callsites in W1 (YearView × 2 + YearSidebar × 3 + section-resources × 1). The audit's full A6 list also names ResourceComposer Search tile (uses ToolTile — different shape, needs the SOON treatment as a tile-overlay prop instead of a wrapper) and "schedule disabled options" (none located in current code — possibly stale finding). Track for W3-C4 / W5 cleanup.

3. **Dev-server cold-compile slowness (infrastructure, not code).** First navigation to `/weekly` after restart takes ~12 s on this machine. Subsequent navigations are fast. Not a regression; just a `next dev` characteristic. Pre-warm the dev server before any probe (`curl /auth/claude-login?...&next=/weekly`).

## Probe screenshots

`docs/screenshots/uxa-2026-05-27/wave-1/` — 21 screenshots, captured post-W1.

## Open carry-over to W2

- W2-B1 onboarding re-entry data safety (Open Question 2) — need Tim's call before W3-C8 "Replay tour" CTA ships.
- W2 starts with **B2 vocab sweep** (load-bearing — all downstream copy uses Personal/Team Curriculum).
