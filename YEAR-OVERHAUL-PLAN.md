# Year Page Overhaul — Audit Findings + Build Plan

> Working artifact (do **not** commit). Audited live on `localhost:3014/year`
> (working-tree rewrite, theme=blossom, 2026-06-13) + full code read via 3
> mapping agents. Constraints: tokens only (no hex outside `tokens.css`), mix
> toward `--paper`/`--tint-base` (never `#fff`), 6-theme system, chrome uses
> `--chrome-accent-*`/`--rail-bg`/`--panel-bg`, print stays Paper (`@media
> screen` wrapper), verify 6 themes × 3 viewport tiers, ≥44px touch targets.

## Source of truth (file:line anchors)
- Year view: `components/year/TimelineYear.tsx` + `.module.css`
- Right panel: `components/shell/right-panel.tsx` (`LessonDetailPanel` :840 — **read-only**)
- Daily editable detail (reuse template): `components/daily/LessonDetail.tsx`; phases = `components/lesson-flow/lesson-flow.tsx:712`
- Rich text: `components/rich-text/rich-text-editor.tsx` (bespoke contentEditable; already does bold/italic/u/s, sub/sup, color, highlight×3, lists+md, link, image, embed, font family×5, size×4)
- Store write path: `editLesson(id, patch, coalesce)` `lib/planner-store.tsx:1464`; `setLessonStatus` :1457; `getSections(id)` :1439
- Sidebar: `components/shell/SideNav.tsx` + `.module.css` (icons-only mode already exists as `@media(max-width:900px)` :204-230)
- Background mesh: `app/globals.css:32-43` (`--canvas` + `--mesh-a/b/c`, fixed); per-theme tokens `app/tokens.css` (blossom mesh :1352-1354 = rose/orchid/honey @ .11/.09/.06 — too weak)
- Teach swash model: `components/teach/TeachWorkspace.module.css:31-47` (3 radial `color-mix` glows over `--canvas`; chrome transparent)
- Weekly card tint to mirror: `weekly-lesson-card.tsx:438` (`color-mix(in oklch, cl 72%, surface)`)
- Design-system gradient doc (pre-themes): `Documents/Claude Design/6.3.26 Curricula Design System/` (`colors_and_type.css:81-85`, `DESIGN-v1.3.md:148-158`)

---

## Part A — Your requested items

1. **Collapsible sidebar (icons-only + pin).** Promote the existing ≤900px icons-only block to a state-driven `[data-collapsed]`; add a pin/toggle (`aria-pressed` + Tooltip); persist one boolean `mycurricula:user:sidenav-collapsed` (use-rail-layout.ts SSR-safe pattern); icons → `--ink-900` when collapsed (theme-correct). Flex layout reflows for free — **no shell-grid surgery**. Compose with the ≤900px auto-collapse.
2. **Heading left margin.** `.root` padding is `18px 20px` → heading sits 20px from content edge while the card content starts ~230px in. Increase the page gutter (e.g. 32–40px) and align eyebrow/title/subtitle with the timeline card's content rhythm.
3. **Gradient background (Teach-style, all 6 themes).** Not a missing layer — chrome is translucent + blurred, so the body mesh shows through; blossom's mesh is just low-alpha. Retune each theme's `--mesh-*` (and/or add per-theme `--swash-*`) for a tasteful soft swash; blossom = pink/orange-leaning (rose + honey). Port Teach's `color-mix` radial recipe so it's theme-aware (drive stops from per-theme tokens, not fixed subject hues). Deepen `--rail-bg`/`--panel-bg` slightly so the chrome carries the wash. Keep print = white.
4. **Unit cards.** Replace flat `color-mix(--cl 78%, --paper)` (`:764`) with a subject gradient mirroring Weekly's band tint (via `--uc/--ud/--ut`); stronger, distinct **selected** state (ring + deeper fill + elevation).
5. **Week chips / tiering.** Make week vs unit vs day tiers visually distinct (own backgrounds, real borders, separation), stronger selected state. Drop redundant text (see B3).
6. **Paper icon clarity.** Day card shows a bare `IconDoc`; "Open lesson" is `opacity:0` until hover (`:605-619`). Always show an affordance (label or aria-labeled icon) so its purpose is obvious.
8. **Richer lesson stats.** Add unit (`unitById[lesson.unit]`), date (derive from `week`+`day` via `dateForWeekDay` / Phase-1B `year-calendar`), weekday (`useOrderedWeekdays`), time (`lessonTime`), phases (`getSections`), resource/standard counts, fork state.
9. **Editable lesson panel.** Adopt Daily's in-place editing (title/objective/notes via `RichTextEditor`+`editLesson` coalesced; status via `setLessonStatus`; phases via `<LessonFlow>`; `cellRef` dock target).
10. **Full rich formatting.** Editor already covers most; see Q2 for scope (headings + interactive checklist + in-editor resource cards are the only gaps).
- **UNIFY (new):** Extract Daily's `LessonDetail` into ONE shared component used by both `/daily` and the right panel (keyed by `selectedLessonId`), so the lesson panel is identical app-wide. Retires the read-only panel + its "Go to lesson" hand-off.

## Part B — Additional improvements found in audit (for approval)
- **B1. Unit titles break mid-word** ("Multiplicatio n & Divisio n", "Volum e") — `word-break:break-word` in narrow columns. Fix wrapping (hyphenate / no mid-word break / smarter min-width).
- **B2. Today-marker points at the wrong month** — `CURRENT_WEEK=12` (mock) puts "today" at OCT though the date is June. Drive from the real configured calendar (or hide when unknown).
- **B3. Week-chip text is redundant** — "Multiplication & Division — Week 7 lesson" repeats the unit name + "1 lesson". Show the actual lesson title/objective instead.
- **B4. Status is color-only** — week circles + day dots are `aria-hidden`; screen-reader users get no status. Add text/aria labels (also a WCAG win).
- **B5. Empty/hint states** — "Select a week above…" is a large empty bordered box; make it compact + on-brand. Handle subjects with no units gracefully.
- **B6. "Go to lesson" reconciliation** — becomes redundant once the panel is editable/unified; remove or repurpose.
- **B7. Month-axis legibility** — labels are faint + centered; strengthen contrast/alignment.
- **B8. Stat-strip color hack** — wrapper forces `cp-subj math` to resolve `--c`; give the strip its own neutral/multi-subject treatment.

## Part C — Cross-cutting
- Per-theme gradient set: paper/cloud/mint/sky/blossom/night (cloud currently flattest @ .05).
- Re-verify the Year **print** template after card/chip changes.
- Re-verify all six themes × {390, 768, 1440}; no horizontal scroll; ≥44px targets.
- Onboarding tooltips for new controls (pin toggle, edit affordances) per CLAUDE.md §4.

## Build checklist
- [ ] A1 sidebar collapse + pin + persist + black icons
- [ ] A2 heading/page gutter
- [ ] A3 per-theme gradient swashes (×6) + rail/panel deepen
- [ ] A4 unit-card gradient + selected state
- [ ] A5 tier differentiation (unit/week/day) + week-chip redesign
- [ ] A6 paper-icon affordance
- [ ] UNIFY shared `LessonDetail` (Daily + right panel)
- [ ] A8 richer stats (unit/date/phases/counts/fork)
- [ ] A9 editable panel (title/objective/notes/status/phases)
- [ ] A10 rich-text scope (per Q2)
- [ ] B1–B8 (per approval)
- [ ] Print re-verify · 6 themes × 3 tiers · a11y · tooltips
- [ ] Code-review gate (Codex/independent) + live QA gate before "done"

## Verification gates (before "done")
1. Code review (Codex `--sandbox read-only`, or independent agent if unavailable).
2. Live QA across 6 themes × 3 tiers + console check.
3. Deliver as a PR off the branch (master merge = Cloudflare prod deploy).
