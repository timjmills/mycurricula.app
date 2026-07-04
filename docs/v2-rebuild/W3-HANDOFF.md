# W3-HANDOFF — cloud → terminal takeover snapshot

> **Dated session snapshot (2026-07-04).** Written at the moment the Wave-3
> build moved from the cloud session to the terminal (real Codex §4a
> per-commit + live §4b inline). This file records the SOFT state — open
> findings, verbal decisions, deferred items — that the branch history and
> `WAVE-3-PLAN.md` don't carry. Per the CLAUDE.md §8 audit-doc disclaimer:
> verify against current code before treating anything here as still open.

---

## 1. Branch state

- **Branch:** `claude/v2-wave3-chrome` · **head at handoff: `70e9f8a`**.
- **Remote is the single source of truth.** Verified at handoff: local ==
  `origin/claude/v2-wave3-chrome` == `70e9f8a`, working tree clean, **no
  stashes, no un-pushed commits, no bundles** left on the cloud side.
- W3.6 commit train (all pushed):
  | SHA | What |
  | --- | --- |
  | `ff413c1` | View↔Edit toggle mount (right tools cluster, /daily + /weekly) + inert `.va-ph` legibility CSS |
  | `e19617d` | Frame material register on the rich `WeeklyLessonCard` (glass/paper/color surfaces) |
  | `5f6f368` | `WeekColumns` — the Frame-B day-column Week layout |
  | `e99ca6d` | Re-fix after failed terminal audit: full-height drop lanes, pointer-first collision, archived-hidden + lifted undo toast, 1024 width fit |
  | `70e9f8a` | Wordmark-yield breakpoint 900 → 1100 (View/Edit pill overflowed the 1024 tier) |

## 2. Open findings on `70e9f8a` (Codex final — FIX THESE FIRST)

These are the three findings from the terminal Codex §4a run that closed the
W3.6 re-audit. They are recorded here so they survive the session hand-off;
none are fixed at head.

1. **High — `components/weekly/WeekColumns.tsx:277` (collision fallback).**
   `collisionDetection` falls back to `closestCenter` for POINTER drags too,
   so a pointer drop in the inter-column gap / bottom padding / just outside
   a lane resolves to the nearest day → wrong-day move + spurious undo
   entry. **Fix:** use `closestCenter` only when `args.pointerCoordinates`
   is absent (keyboard drags); for a pointer drag with no `pointerWithin`
   hit return `[]` so the drop cancels.
2. **Medium — `components/weekly/WeeklyShell.tsx:631` / `:657`
   (archived selection leak).** Archived lessons are filtered from the
   WeekColumns lanes but not from `weekLessons` / `selectedLesson`, so a
   lesson archived while selected stays active in the right rail + URL.
   **Fix:** filter `weekLessons` by `l.archived !== true` and clear
   `selectedLessonId` on archive.
3. **Medium — `components/lesson-card/archive-toast.tsx:87` +
   `components/weekly/WeekColumns.tsx:608-615` (toast race).** The exit
   `setTimeout(onDismiss, exitDuration)` in `handleDismiss` is never
   cleared, so a fast second archive can let the OLD toast's deferred
   dismiss null out the NEW toast's state in the parent. **Fix:** store +
   clear the exit timer in the toast, and make the parent's `onDismiss`
   generation-safe (only clear state if the dismissing toast's `key` is
   still current).

Already fixed, not open: the 1024px document h-scroll Medium (chrome
top-bar, not WeekColumns) landed in `70e9f8a` — wordmark-yield ≤900 → ≤1100.
Still pending live confirmation at 1024 on /weekly AND /daily.

## 3. Scope decisions on record (do not re-litigate)

- **W3.6 frame strategy — "B + C real, A = material."** Frame B (paper)
  gets a REAL day-column layout (`WeekColumns`); Frames A (glass) and C
  (color) keep the subject grid (`WeeklyGrid`) re-skinned via the card's
  frame material register. Reasoning: the bundle's Frame-A period×day board
  has no data to drive it (fixture `Lesson.time` is empty; the schedule
  subsystem is unjoined) and W3.8c owns the period-aligned board; building
  only the material re-skin (the rejected "Option 3") was explicitly ruled
  insufficient — the day-column layout is what makes W3.6 real.
- **Card re-skin is non-destructive — option (i).** `WeeklyLessonCard`
  keeps every feature; the bundle's minimal-cell density is a SEPARATE
  future product decision, never slipped in via a re-skin.
- **WeekColumns archive semantics (terminal-audit product ruling —
  supersedes the earlier "grid parity" approach):** archived lessons are
  filtered out of `byDay` immediately, and the archive-undo toast is LIFTED
  into WeekColumns (store-wide `archived:false→true` transition watcher →
  own `ArchiveToast` → `unarchiveLesson(id)`), because the in-card toast
  unmounts with the card. Other weekly surfaces still use the in-card toast.
- **Frame selection seam:** `WeeklyShell.renderGridPanel` branches
  `frame === "paper" ? <WeekColumns /> : <WeeklyGrid />` (narrow ≤900 /
  schedule / list precedence untouched). This is the pattern W3.7 should
  reuse for Day/Year frame branches.
- **View↔Edit toggle is INERT UI state until W3.8b/c.** It persists a
  `cc_editmode` localStorage map keyed `"Day"`/`"Week"` (bundle-exact,
  capitalized — a casing finding was dismissed for this reason). This is
  NOT `useAppState().editMode` (the personal|master forking axis) — same
  word, unrelated meaning; never conflate.
- **Team caution glow scoping:** the pink `#E8179B` glow fires on
  `.modesw.modesw-fork` only (marker class on the Personal/Team ModeSwitch)
  so it can never hit the View/Edit pill. `chrome.css` carries a
  do-not-relax comment; keep the marker on exactly one control.
- **Subject map:** v1 `DEFAULT_SUBJECT_MAPPING` is what renders today;
  `V2_SUBJECT_SLOTS` exists but is NOT wired. Decision: keep v1 for
  consistency until slot-map wiring is its own explicit change.
- **W3.5 style menu writes WHOLE-SITE appearance only.** The
  "This page / Whole site" scope toggle (`.vt-scope`) is deferred to its
  own wave.
- **Deployment:** no piecemeal deploys — the whole v2 chrome ships
  together at launch, coupled with the theme-sync migration (task #13
  below). Until then dev writes v2 theme names at prod → the known
  theme-sync 400 in the console (expected, not a bug).

## 4. Deferred Lows / task backlog

- **Task #12 — holistic chrome-responsive phone pass (≤480/375).** Batched
  overflow debt in the top-bar right cluster: base ~104px (W3.3 tools +
  W3.4 compact console) + the W3.6 View/Edit pill's +104px (measured 375:
  total 335px; 414: total 296px). One coherent phone treatment for the
  whole cluster — not per-control patches. (`70e9f8a` fixed only the 1024
  tier.)
- **Task #13 — apply the theme-sync migration AT v2 launch only** (the
  `teacher_preferences` CHECK-constraint update; applying it early breaks
  prod standalone — see ALLOWLIST LOCKSTEP, CLAUDE.md §4).
- **WeekColumns parity gaps vs WeeklyGrid (deferred Lows, revisit with
  W3.8c):** canvas click-off-to-deselect and the roving/keyboard cell-grid
  navigation are not ported to the day-column layout.
- **First-paint frame flash (pre-existing class of issue):** the
  frame-branched canvas resolves client-side, so a Paper user can flash the
  glass grid on first paint. Same family as the existing theme-boot FOUC
  handling; take it as part of a dedicated boot-attributes pass, not W3.6.
- **Panel `title=` scoping (Low):** the touch-tooltip `title` attributes on
  panel roots want an audit pass so nested titles don't shadow each other.

## 5. Sub-wave status + notes for the successor

- **W3.6 — near-done.** Live-verified at the terminal: archive/undo
  end-to-end ✅, cross-day move via keyboard ✅ (no snap-back, undo entry),
  full-height lanes ✅, console clean ✅. Remaining: the three §2 findings
  plus a 1024 re-measure of `70e9f8a` (/weekly and /daily). Fix, re-gate
  (§4a Codex + live §4b), and W3.6 closes; task #11 completes with it.
- **W3.7 — Day + Year VIEW frame-aware rebuilds (+ additions)** — plan
  lines ~153-159. Frame-C Year constellation keyed off the subject scale;
  Day adds the frames-B/C "Add lesson" affordances (`.vb-railadd` /
  `.vc-aadd`, dashed row + `.rplus` badge → stub lesson into the planner)
  and dblclick-to-open-planner on lesson rows in all three frames, wired
  behind a seam until W3.8/W3.8b. **Port from the bundle's views-a/b/c
  sections — that JSX is bundle-only** (not in the design-system CSS).
  Head start already at head: the View↔Edit mount covers /daily since
  `ff413c1`, and the `.va-ph` legibility CSS is staged (inert) in
  `app/chrome.css`. Reuse the WeeklyShell frame-branch seam pattern.
- **W3.8 / W3.8b / W3.8c** — per the plan: lesson editor + LessonModal
  (fill-in template, autosave via `lib/planner-store`, explicit Save-to-team
  as the ONLY push), Day EDIT split-pane, Week EDIT period-aligned board
  (consumes `.va-ph`; Aligned-by-time/Stacked toggle). W3.8b is where the
  View/Edit toggle gains real behavior — note the bundle qualifier: Day
  force-resets to View on Home→Day nav; only Week's mode truly persists.
- **Working method that held up:** deliver each sub-wave as small
  reviewable commits; gate each (adversarial §4a + live §4b) BEFORE calling
  it done; pointer-dnd bugs only ever surfaced under human pointer testing
  — budget a manual drag pass for anything touching dnd.

## 6. Environment gotchas (documented so nobody re-hits them)

- **Cloud (Claude Code on the web) cannot run §4b live QA on this app.**
  `lib/supabase/middleware.ts:64` hard-crashes without
  `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`, and every
  chrome-bearing route sits behind the auth gate. To give a cloud container
  eyes: add those two + the four bypass vars from
  `docs/5.24.26 claude-access.md` §Local development (`CLAUDE_BYPASS_TOKEN`,
  `CLAUDE_USER_EMAIL`, `CLAUDE_BYPASS_PROVISION=1`,
  `SUPABASE_SERVICE_ROLE_KEY`) to the environment config — env lands at
  CONTAINER CREATION, so only new sessions see it. Chromium + Playwright
  are pre-installed in the container. Security: the service-role key is the
  full-power key — rotate after the wave.
- **Custom pointer dnd is flaky under Playwright automation** (observed in
  BOTH environments — synthetic pointer sequences drop mid-drag on
  re-render). Working recipe: automate the keyboard-drag path + DOM/count/
  scrollWidth assertions, and verify pointer behavior by hand; Codex covers
  the collision logic at code level.
- **Dev server:** use a port ≥3010 when another session may own 3000;
  never `npm run build` while `next dev` runs (clobbers `.next`).
- The console's **theme-sync 400 is expected** until the launch migration
  (task #13) — dev writes v2 theme names against the prod constraint.
