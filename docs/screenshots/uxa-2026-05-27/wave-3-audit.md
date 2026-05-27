# Wave 3 — audit notes (2026-05-27)

## Gate result: ✓ pass

- `npm run lint` clean (consolidated state, post all agent commits + inline lanes).
- `npx tsc --noEmit` clean.
- `npm run build` clean (34 routes generated, all 4 /api/* routes registered).
- 14/14 lanes landed (C1–C13 + V1).
- 8 parallel agents dispatched + 2 inline lanes; all reconciled cleanly on master.

## Lane summary

| Lane | Owner | Files | Commit | Notes |
|---|---|---|---|---|
| C1 chrome slimming | Agent G | `top-bar.tsx`, `top-bar.module.css`, `top-bar-more-menu.tsx` | `1b385e6` | Catch-up flame already folds to More at ≤1280, Clock self-hides at ≤900 — verified existing collapse handles it; TODO documented for future Grid/List relocation |
| C2 Schedule near Grid/List | Agent G | `top-bar.tsx`, `ToggleGroup.tsx` (additive `tooltipId?:` prop) | `1b385e6` | Route-derived (pathname `/schedule` → "schedule" selected) — avoided widening ViewMode |
| C3 Weekly rail tablet/phone drawer | Agent E | new `WeeklyRailDrawer.tsx` + `.module.css`, `WeeklyShell.tsx` | `f1cb15a` | Breakpoint set to 1280px to match the existing inline-rail hide; OR's `todoPanelOpen \|\| commentsPanelOpen` for open state |
| C4 ResourcesSort actionable rows | Agent A | `ResourcesSort.tsx`, `.module.css`, new `subject/icons.tsx`, `SubjectView.tsx` | `4033f1b` | Provider-first icon mapping; URL-row → new tab; no-URL → `/daily?lesson=<id>`; search + 3-way sort header |
| C5 Daily edit affordances | Agent D | `LessonDetail.tsx`, `lesson-detail.module.css` | `8b1b34b` | Pencil opacity 0 on desktop, hover/focus-within reveals; always visible at ≤480 |
| C6 Mobile subject picker | Agent B | `SubjectView.tsx`, `SubjectView.module.css` | `760d434` | Native `<select>` with chevron at ≤480; horizontal-scroll tab strip hidden below that |
| C7 Rails grab + SOON | Agent C | `GlobalRail*`, `RightIconRail*`, `rail-icons.tsx`, new `lib/use-rails-drag-intro.ts` | `142c474` | `cursor: grab/grabbing`, first-session pulse on first left-rail icon, catchup-red SOON pill at top-right |
| C8 Help "?" overlay | Agent G | `top-bar.tsx`, `shortcuts-overlay.tsx`, `global-shortcuts.tsx`, new `lib/help-copy.ts` | `1b385e6` | Visible `?` button + window CustomEvent shared with the keyboard `?` shortcut; route-aware help-copy registry (longest-prefix wins) |
| **C9 Sticky back (narrow Daily)** | inline | `DailyView.module.css` | this commit | `position: sticky; top: 0; z-index: 5; background: var(--paper);` on the narrow-mode `.backToList` |
| C10 Intro subtitles | Agent F | new `ui/IntroSubtitle.tsx` + `.module.css`, `ui/index.ts`, 4 view mounts | `3b4609c` | localStorage key `mycurricula:user:<view>-intro-seen`; SSR-safe init, post-mount hydrate |
| C11 Daily empty states | Agent H | `DailyView.tsx` | `46587d1` | Both empty regions now use `<EmptyState>` primitive |
| **C12 Responsive cascade audit doc** | inline | `docs/responsive-cascade-2026-05-27.md` | this commit | 7-route × 4-tier matrix of disappearing controls + fallbacks |
| C13 Daily reorder teaching | Agent H | `DailyView.tsx` | `46587d1` | Drag-handle tooltip + first-drop toast (`mycurricula:user:daily-reorder-taught`) |
| V1 Filter-panel close-on-mount fix | Agent B | `SubjectView.tsx` | `760d434` | Deleted close-on-mount effect; filter panel defaults open on /subject per Decision #11 |

## Errors / bugs / omissions / gaps surfaced

1. **Worktree-race concurrency** — multiple agents detected parallel-lane work in the worktree mid-session. Recovery patterns observed:
   - Agent D used `git reset --mixed HEAD~1` after accidentally staging another agent's files.
   - Agent A detected its own `.tsx` writes being reverted mid-session and re-wrote/committed before the next revert.
   - Agent F observed that DailyView + SubjectView IntroSubtitle mounts had already landed (committed by parallel agents that included the import alongside their own work) — net effect matches spec.
   - **My inline C9 work also got reverted during agent activity** — re-applied for this commit.
   - **Recommendation:** future multi-agent waves should either (a) use `isolation: "worktree"` so each agent works in its own git worktree, or (b) serialize agent dispatches when they share a file root (e.g., all `components/shell/*` agents in one chain instead of parallel).

2. **Agent E flagged: `<RightPanel>` duplicate-mount on Weekly at ≤1280px.** Both the planner-shell's `RightPanel` and the new `WeeklyRailDrawer` mount when a rail icon clicks. Out-of-scope for C3 but worth a follow-up: either gate RightPanel off on Weekly, or replace it broadly with the drawer pattern. Track for W5 polish.

3. **Agent G left a chrome-slim TODO** in `top-bar.tsx` comments — relocating Grid/List/Schedule INTO each route's local toolbar would be a multi-file refactor; deferred per the brief's "stop short" directive. Track for a W4 chrome-relocation pass.

4. **Open Question 2 (onboarding re-entry data safety)** is still pending. Agent G's `?` overlay ships the "Replay onboarding tour" CTA pointing at `/onboarding`. Whether the wizard pre-fills or overwrites a teacher's existing config is the Tim-decision still pending — surface before Wave 5 if it bites.

## Probe screenshots

`docs/screenshots/uxa-2026-05-27/wave-3/` — capture via `node scripts/probe-uxa.mjs wave-3` post-deploy (the GitHub Actions pipeline has multiple deploys queued from the 8 agent pushes; the LAST one wins and is the canonical Wave 3 state).

## Live state

- `master` branch HEAD post-consolidation: this commit
- Worker version: whatever the last GitHub Actions deploy lands. Auto-deploy queue runs sequentially per ref-concurrency rule.
- Live URL: https://mycurricula.app

## Carry-over to W4

- D1 notification surface + editing indicator (minimal)
- D2 search-everything
- Decision needed: Open Question 2 (onboarding wizard re-entry data safety) — gates Replay-tour fully working.
