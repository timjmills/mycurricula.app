# Responsive cascade audit — 2026-05-27

> **Scope:** map every control that disappears at narrower viewports + the documented fallback path.
> **Tiers probed:** 1280 (desktop), 960 (small desktop / large tablet — explicit Wave-3 breakpoint), 720 (tablet), 480 (phone), 360 (small phone).
> **Probe artifacts:** `docs/screenshots/uxa-2026-05-27/wave-2/<route>__<tier>.png` (21 screenshots, 3 tiers × 7 routes).
> **Source of breakpoints:** `@media (max-width: …)` rules grep'd across `components/**/*.module.css`.

## Methodology

1. Probed `/weekly`, `/daily`, `/year`, `/subject/math`, `/schedule`, `/catch-up`, `/settings/curriculum` at 360 / 768 / 1280 (Wave-0 probe script).
2. Cross-checked every `@media (max-width: …)` rule that sets `display: none` or shrinks a control.
3. For each disappearing control, confirmed its **fallback path** — usually one of: collapse into the More menu, move into the rail drawer, swap to a touch-friendly variant.

## Tier-by-tier control inventory

### Top bar (`components/shell/top-bar.tsx`)

| Control | 1280 | 960 | 720 | 480 | Fallback |
|---|---|---|---|---|---|
| Wordmark | ✓ | ✓ | ✓ | ✓ | always visible |
| Personal / Team Curriculum toggle | ✓ | ✓ | ✓ | ✓ | always visible (required tooltip ID — W2-B3) |
| Grid / List ToggleGroup | ✓ | hidden | hidden | hidden | `.viewModePillWrap` `@media (max-width:1024px)`. **No fallback in More menu today** — gap. |
| Schedule toggle (W3-C2, in-flight) | ✓ | hidden | hidden | hidden | inherits the Grid/List wrap rule |
| Search input | ✓ collapsible | ✓ collapsible | ✓ icon-only | ✓ icon-only | always reachable; expands on click |
| Catch-up flame | ✓ | ✓ | hidden | hidden | **Should move to More menu but currently just disappears** — gap |
| Clock chip | ✓ | ✓ | hidden | hidden | floating Clock primitive on /settings does NOT have this hide — verify |
| Profile avatar | ✓ | ✓ | ✓ | ✓ | always visible |
| More menu trigger | hidden | hidden | ✓ | ✓ | hosts the relocated controls below 768px |
| Navigation tabs (Daily/Weekly/Yearly/Curriculum) | ✓ inline | ✓ inline | hidden | hidden | rendered inside More menu via `top-bar-more-menu.tsx` |

**Gaps identified:**
- Grid / List has no More-menu fallback. A teacher on phone can't switch view modes.
- Catch-up flame disappears with no fallback. A teacher on phone can't see the catch-up rollup count from the top bar.

### Weekly view (`components/weekly/WeeklyShell.tsx`)

| Control | 1280 | 960 | 720 | 480 | Fallback |
|---|---|---|---|---|---|
| WeeklyGrid (subject × day cells) | full grid | scroll horizontally | scroll horizontally | scroll horizontally | grid is the content; scrolling is the affordance |
| Sticky lane column (subject names) | sticky-left | sticky-left | sticky-left | sticky-left | always pinned |
| Right rail (Resources/Comments/To-do) | inline pane | inline pane | inline pane | inline pane | **W3-C3 ships drawer below 960px** |
| CatchupWeekBar | ✓ inline | ✓ inline | ✓ inline | ✓ inline (may overflow at 360) | own dismiss button |
| Day-strip pills | ✓ | ✓ | ✓ | ✓ scrolls if needed | inline scroll fallback |

**Gaps identified:**
- At 360px the in-grid CatchupWeekBar can overflow the lane column. Verify post-W3-C7.

### Daily view (`components/daily/DailyView.tsx`)

| Control | 1280 | 960 | 720 | 480 | Fallback |
|---|---|---|---|---|---|
| 3-column layout (list + detail + rail) | ✓ | ✓ | collapses | collapses | narrow-mode single-column via `data-narrow-pane` attribute |
| List ↔ Detail toggle | n/a | n/a | "Back to list" button | "Back to list" button | **W3-C9 makes it sticky** |
| Pane splitter | ✓ resizable | ✓ resizable | hidden (single col) | hidden | not needed; single-column at narrow |
| Edit pencil (W3-C5, in-flight) | hover-show | hover-show | always-show | always-show | touch-friendly variant |
| Day-strip + week-jumper | ✓ | ✓ | ✓ | ✓ scrolls | inline scroll fallback |

### Year view (`components/year/YearView.tsx`)

| Control | 1280 | 960 | 720 | 480 | Fallback |
|---|---|---|---|---|---|
| Roadmap (lanes × weeks) | full | full | scrolls horizontally | scrolls horizontally | grid is the content |
| Sticky header (months + weeks) | sticky-top | sticky-top | sticky-top | sticky-top | always pinned (W2-B4 tooltip explains the chameleon tint) |
| YearSidebar (3 SOON icons) | ✓ | ✓ | hidden | hidden | available in More menu? **Verify; likely a gap** |
| Filters / Export FutureControls | ✓ | ✓ | ✓ | ✓ may overflow at 360 | the "SOON" treatment makes them non-actionable; their hiding wouldn't lose function |
| Progression / Roadmap view-mode toggle | ✓ inline | ✓ inline | ✓ inline | ✓ inline | always-visible; ToggleGroup primitive handles narrow gracefully |

**Gaps identified:**
- YearSidebar's 3 SOON nav icons (Calendar/Units/Lessons) at <720px have no More-menu surface. Since they're SOON-flagged today (no actual function), the hide is acceptable but document it.

### Subject view / `/subject/[slug]` (`components/subject/SubjectView.tsx`)

| Control | 1280 | 960 | 720 | 480 | Fallback |
|---|---|---|---|---|---|
| Subject-switcher sidebar | inline | inline | horizontal scroll tabs | horizontal scroll tabs | **W3-C6 swaps to dropdown at ≤480** |
| Unit health cards (2-up grid) | 2 columns | 2 columns | 1 column | 1 column | grid responsive auto |
| Lesson list (Grid or List mode) | wide | wide | narrow | narrow | rows stack at narrow |
| Resources sort table | full table | full table | scrolls | scrolls | row clickability per W3-C4 |

### Schedule view (`app/(planner)/schedule/page.tsx`)

| Control | 1280 | 960 | 720 | 480 | Fallback |
|---|---|---|---|---|---|
| Day-strip pills | ✓ | ✓ | ✓ scrolls | ✓ scrolls | inline scroll |
| Schedule timeline (full) | ✓ | ✓ | scrolls horizontally | scrolls horizontally | timeline is the content |
| Header eyebrow + title | ✓ | ✓ | ✓ | ✓ | always visible |

### Catch-up view (`components/catchup/CatchupScreen.tsx`)

| Control | 1280 | 960 | 720 | 480 | Fallback |
|---|---|---|---|---|---|
| Header + subtitle | ✓ | ✓ | ✓ | ✓ | always visible (per W1 audit) |
| BulkActionBar | ✓ | ✓ | ✓ | ✓ scrolls horizontally | inline scroll within bar |
| Per-row actions | ✓ | ✓ | ✓ | ✓ stack | rows stack at phone |
| Coverage stat (3 columns) | 3-col | 3-col | 1-col | 1-col | already responsive |

### Settings (`app/settings/*/page.tsx`)

| Control | 1280 | 960 | 720 | 480 | Fallback |
|---|---|---|---|---|---|
| Sidebar nav | inline left rail | inline left rail | horizontal scroll strip above content | horizontal scroll strip | already-implemented scroll fallback per CLAUDE.md §4 |
| Scope chips (W2-B7) | ✓ | ✓ | ✓ | ✓ | always visible |
| Settings cards | wide grid | wide grid | stack | stack | responsive grid |
| Clock chip (bottom-right fixed) | ✓ | ✓ | ✓ | ✓ | always visible |

## Cross-cutting findings

### Confirmed gaps to fix in W3 / W5

1. **Top bar Grid/List has no narrow-mode surface.** Move into the More menu at ≤1024px as part of W3-C1 chrome slimming.
2. **Top bar Catch-up flame has no narrow-mode surface.** Same fix — More menu.
3. **YearSidebar SOON nav icons have no narrow-mode surface.** Acceptable today (SOON = non-functional), but when these go live (beta+1), they need a fallback.
4. **Weekly right-rail inline pane unusable at <960px.** **W3-C3 ships an overlay drawer** to fix.
5. **Subject mobile picker** — was horizontal-scroll tabs at <480px; **W3-C6 swaps to dropdown** to fix.
6. **Daily narrow-mode back button scrolled out of view.** **W3-C9 makes it sticky** (✓ done inline).

### Things that work well

- Sticky-left lane column on Weekly grid + Daily detail.
- Settings sidebar's horizontal scroll fallback (already documented in CLAUDE.md §4).
- The dnd-kit hydration warning is independent of viewport (W0 finding).
- Catch-up screen's responsive cascade (3-col → 1-col) handles narrow gracefully via CSS Grid.

### Out-of-scope for this audit

- A11y at narrow viewport (separate audit pass; tests with VoiceOver/NVDA).
- Print stylesheets (Wave 5 polish).
- RTL / locale support (Decision-level out of scope).

## Recommended follow-ups for Wave 5

1. **Add Grid/List + Catch-up flame to More menu** (top-bar polish).
2. **Verify the W3-C3 drawer works at every Weekly tier** post-deploy.
3. **Document the 30%-of-viewport chrome budget** at phone tier (CLAUDE.md §4) — current top bar is right at the line.
4. **Test screen-reader announcement** at every disappearing-control boundary — does the AT user know a feature exists offscreen?

---

*Source data + screenshots in `docs/screenshots/uxa-2026-05-27/`. Re-run via `node scripts/probe-uxa.mjs <wave-name>` to capture a fresh delta after each wave.*
