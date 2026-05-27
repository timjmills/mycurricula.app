# Wave 2 — audit notes (2026-05-27)

## Gate result: ✓ pass

- `npm run lint` clean.
- `npx tsc --noEmit` clean.
- `npm run build` clean (all 34 routes generate including the 4 /api/* added by the resource-embed slices).
- Probe: 21/21 screenshots at 360/768/1280 across all 7 routes.
- No document-level horizontal scroll at any tier.
- Error count back to the W1 baseline (0-2 per route — pre-existing @dnd-kit/sortable hydration warning).

## Lanes delivered

| Lane | Status | Files | Verification |
|---|---|---|---|
| B2 vocab sweep | ✓ committed 190d538 | 24 files, ~47 user-facing string replacements (Master → Team Curriculum, Core → Team Curriculum, Personalized → Personal). Internal code (`editMode === "master"`, localStorage keys, filenames) kept. | Grep shows zero remaining user-facing "Master" / "Core Curriculum" / "Personalized" strings. |
| B3 dismissible tooltips | ✓ committed 190d538 + 4a9760e | `components/ui/Tooltip.tsx` (new `tooltipId` + `required` props), `lib/tooltip-dismissal.ts` (provider + per-id set + global flag), `app/settings/appearance/page.tsx` (toggle + reset button), `CLAUDE.md` §4 rewritten. | The "Turn off these tips" link paints inside the bubble on non-required tooltips; `required: true` callsites (Personal/Team toggle) bypass dismissal entirely. localStorage keys: `mycurricula:user:tooltip-dismissed`, `mycurricula:user:tooltips-off`. |
| B7 settings scope chips | ✓ this commit | `app/settings/layout.tsx` (extend TABS with `scope` + sidebar chip), `app/settings/layout.module.css` (chip styles), `components/appearance/settings-card.tsx` (new `scope?` prop + header chip), `components/appearance/settings-card.module.css`, `app/settings/curriculum/page.tsx` (Curriculum label card now `scope="team"`). | Sidebar shows Team / Personal chips per tab; Curriculum is Team, Appearance/Catch-up/Lesson templates are Personal (per Decision #7). |
| B8 consequence toasts | ✓ this commit | New `lib/consequence-toast.tsx` (Provider + `useConsequenceToast()`), new `components/ui/ConsequenceToast.tsx` (lifted visual from `archive-toast.tsx`), mounted in `app/(planner)/layout.tsx` + `app/settings/layout.tsx`, wired in `app/settings/curriculum/page.tsx` for curriculum-label save. | Editing the curriculum label fires a 5-sec toast naming the team-wide effect with an Undo button. |
| B1 Personal/Team teaching | ✓ this commit | New `components/shell/team-mode-intro.tsx` (one-time popover, anchored under the toggle, dismissible "Got it"), new `components/shell/team-mode-intro.module.css`, new `lib/use-team-mode-edit-cue.ts` (hook + class const), cue class added to `app/globals.css`, popover mounted in `components/shell/top-bar.tsx`, cue applied to lesson title in `components/lesson-card/lesson-card.tsx`. | localStorage gate: `mycurricula:user:team-mode-introduced`. Three-layer safety stack now intact: popover (B1) + persistent banner (existing MasterBanner) + inline cue ring (B1). |
| B4 Year chameleon tooltip | ✓ this commit | `components/year/QuarterMonthWeekHeader.tsx` (wrap header in `<Tooltip>` + enrich `aria-label` with active subject name when set). | `tooltipId="year-chameleon-header"` so it's dismissible. |
| B5 Catchup flame concept tooltip | ✓ this commit | `components/shell/catchup-flame-button.tsx` (rich tooltip content with concept + count + jump cue). | `tooltipId="catchup-flame-button"`. |
| B6 UnitHealth STANDARDS tooltip + subtitle | ✓ this commit | `components/subject/UnitHealthCard.tsx` (subtitle under unit name + Tooltip on STANDARDS stat label), `.module.css` (new `.unitSubtitle` class). | Subtitle shows `{lessons} lessons · {standardsCovered}/{standardsTotal} standards`. |

## Errors / bugs / omissions / gaps surfaced

1. **FIXED — `:global()` selector in CSS Module file** (build-blocking). The first attempt placed the inline-edit-cue class in `components/shell/master-banner.module.css` using `:global(.myc-team-mode-edit-cue)`. CSS Modules require selectors to be "pure" (contain at least one local class/id), so the build threw `Selector ... is not pure`. Fix: moved the rule into `app/globals.css` instead (already imported at the root, no module-purity constraint).

2. **FIXED — dev-server module manifest race** (recurring pattern). Concurrent `npm run build` + active `next dev` corrupted `.next/server/` chunks again, surfacing as 500s on `/weekly` post-build. Same root cause as the W0 finding. Fix: `kill dev → rm -rf .next → npm run dev`. Recommend never running `npm run build` while the dev server is up — use a sandbox build directory or stop dev first.

3. **GAP — B8 partial coverage.** The ConsequenceToast primitive + provider ship, and curriculum-label save is wired. Holiday add/remove, academic-year save, and school-week change are NOT wired yet — placeholder for a follow-on commit (or Wave 5 polish). Track as a checklist item.

4. **GAP — B1 inline cue applied to a single canonical surface.** The plan calls for the cue on "lesson title / objective / section editable surfaces." I applied it to the lesson title in `lesson-card.tsx` only. Objective + section editable spots can be wrapped in subsequent passes — the cue mechanism (`useTeamModeEditCue()` + class) is in place and reusable.

5. **OMISSION resolved — tooltip-dismissal.ts** (the W0+W1 audit caught this earlier; restored in commit 4a9760e). The B2 agent had shipped imports without the file; the post-resource-embed audit surfaced it.

## Probe screenshots

`docs/screenshots/uxa-2026-05-27/wave-2/` — 21 screenshots, captured post-W2.

## Open carry-over to W3

- Decision input for W3-C8 "Replay tour" CTA requires Tim's answer on Open Question 2 (onboarding re-entry data safety).
- W3 first lanes: C1 chrome slimming, C2 Schedule discoverability near Grid/List, then C3/C4/etc.
