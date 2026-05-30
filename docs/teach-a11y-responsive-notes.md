# Teach View — A11y + Responsive Audit Notes (Wave 2 → Wave 3 fix list)

> **Snapshot disclaimer.** Dated audit, 2026-05-30. Findings are read against the
> committed Wave-1 zone source (`components/teach/**`, read-only) and the plan's
> `docs/teach-view-plan.md` §4 / §10 contract + `CLAUDE.md` §4. This is a
> **punch-list for Wave 3** — nothing here is fixed in Wave 2 (the zone files are
> owned/in-use by a parallel agent). Verify each item against current code before
> acting; line numbers are as of this snapshot.

Severity legend: **[H]** breaks the contract / blocks a user; **[M]** degraded
but usable; **[L]** polish.

---

## A. Keyboard / focus

### A1. `aria-modal` dialogs declare modality but do not trap focus — **[H]**

Both modal-like overlays set `role="dialog"` + `aria-modal="true"` but neither
intercepts `Tab`/`Shift+Tab`, so focus escapes behind the overlay to the still-
interactive board/chrome underneath. `aria-modal="true"` is a promise to AT that
the rest of the page is inert; without a trap that promise is false.

- `components/teach/board/FocusMode.tsx:50-60` — `role="dialog" aria-modal="true"`;
  moves focus into the card on open (`:45-47`) and closes on Esc (`:33-42`), but
  there is **no Tab containment** and **no focus restoration** to the widget's
  Expand button on close.
- `components/teach/board/WidgetPicker.tsx:115-117` — `role="dialog"
  aria-modal="true"`; focuses the search input on open (`:60-61`) and closes on
  Esc (`:63`), but again **no Tab trap** and **no return-focus** to the `+` cell
  that opened it.

Fix (Wave 3): add a small focus-trap utility (cycle Tab within the dialog;
remember `document.activeElement` on open and restore it on close). The repo has
no shared trap helper today — build one once and reuse for both. Confirmed
absent: `grep -rn "FocusTrap\|trapFocus\|inert" components/teach` returns nothing.

### A2. Present mode is not a focus container — **[M]**

In Present mode `TeachWorkspace.tsx:563-585` swaps the top/sub bars for
`<PresentBar>` and correctly *unmounts* the rails/panels
(`TeachWorkspace.tsx` body: each rail/panel is gated `!state.present`, ~lines
610-625). Good — there is no hidden-but-focusable chrome. But `PresentBar.tsx`
(`role="toolbar"`, `:88-92`) does not move focus into itself on entering Present,
so a keyboard user who pressed ⌘P stays focused wherever they were (now possibly
on an unmounted-then-remounted subtree). Esc-to-exit is robust (local handler
`PresentBar.tsx:67-82` + the global cascade). Fix: focus the PresentBar (or its
Exit button) on mount; restore focus to the Present trigger on exit.

### A3. `aria-pressed` on toggles — mostly correct, two gaps — **[L/M]**

Good coverage where it matters:
- Pin toggle `WidgetShell.tsx:104-106` — `aria-pressed={widget.pinned}`. ✓
- Full Screen `TeachSubBar.tsx:271` — `aria-pressed={state.fullscreen}`. ✓
- Annotation tool group, colour, width use `role="radio"`/`aria-checked`
  (`BoardToolbar.tsx:182-188, 213-221`) and the canonical `ToggleGroup` for the
  tool set (`:153-161`). ✓

Gaps:
- **Present button** (`TeachSubBar.tsx:246-254`) is a plain `<button>` that
  enters a persistent mode but exposes no pressed/expanded state. It is arguably
  an action (not a toggle, since exit is via PresentBar), so this is **[L]** —
  but consider `aria-keyshortcuts="Meta+P"`.
- **Layout toolbar** renders via `ToggleGroup` (`TeachSubBar.tsx:213-220`) — verify
  the underlying `ToggleGroup` emits `aria-pressed`/`role="radio"` for the *single-
  select* layout case; if it emits `aria-checked` that is fine, but it must emit
  one. (Cross-check `components/ui/ToggleGroup` — out of this audit's file scope.)

### A4. Tab strips are tabs in name only — no `aria-controls`/`id` wiring — **[M]**

Three `role="tablist"` strips declare `role="tab"` + `aria-selected` but none link
a tab to its panel via `aria-controls`, and the panels have no matching `id`:
- Sub-bar board strip — `TeachSubBar.tsx:159-189` (`role="tablist"`, tabs at
  `:173-186`).
- Left panel module tabs — `TeachLeftPanel.tsx:112-113, 260`.
- Right panel module tabs — `TeachRightPanel.tsx:150,164-165` with the panel body
  at `:191` (`role="tabpanel"` but no `id`/`aria-labelledby`).

`grep -rn "aria-controls\|aria-labelledby" components/teach` → **no matches.**
Also missing: arrow-key roving tabindex within each tablist (WAI-ARIA tabs expect
Left/Right to move between tabs). Fix: give each panel body an `id`, point the
active tab's `aria-controls` at it + `aria-labelledby` back, and add roving
tabindex (or downgrade `role` if full tab semantics aren't wanted).

### A5. Tab order top→left→center→right — **[L], verify**

DOM order in `TeachWorkspace.tsx` body is left rail → left panel → center
(`<main>`) → right, preceded by the top/sub bars, which matches the intended
top→left→center→right reading order. No positive `tabIndex` values were found in
the zone source (only `tabIndex={-1}` on the FocusMode card, `FocusMode.tsx:80`,
which is correct for a programmatic focus target). Confirm visually in Wave 3 that
collapsing a panel (it unmounts, ~`:611-625`) doesn't strand focus — collapsing
the panel a user is focused inside will drop focus to `<body>`; consider moving
focus to the rail icon on collapse.

### A6. AnnotationLayer keyboard story — **[M], by design but document it**

`AnnotationLayer.tsx` is a pointer-only drawing surface: the `<canvas>` is
`aria-hidden` (`:231`), the wrapper is `role="img"` with a live description
(`:218-219`), and the text tool uses a real `<textarea>` with a labelled
`aria-label` + Enter-to-commit (`:244-249`). There is **no keyboard path to
draw** — acceptable for a freehand canvas, but the **Clear** action (destructive)
and undo/redo live on `BoardToolbar` and ARE keyboard reachable, so the
data-loss path is covered. Action: ensure the `role="img"` `aria-label` updates
(live region) when strokes change so a SR user knows annotations exist; verify the
description string at `:219` is non-static.

---

## B. Responsive — three tiers vs plan §10

Plan §10 contract: **Desktop 1024–1920** full shell; **Tablet 600–900** both
panels collapse to 64px rails by default + open as overlay drawers, **board grid
caps at 2×2**, board tabs scroll horizontally inside their strip; **Phone
360–480** rails → bottom tab bar, panels → bottom sheets, **board grid forced to
1-up** with swipe, top/sub bars condense (board tabs → `Board ▾`). No
document-level horizontal scroll at any tier; touch targets ≥44px.

### B1. Board grid does NOT cap at smaller tiers — **[H]**

`components/teach/board/board.module.css` has **only one** `@media` query, and it
is `prefers-reduced-motion` (`:471`) — **no viewport breakpoints at all.** The
grid template is driven purely by `state.layout` → `BOARD_LAYOUT_GRID`
(`TeachingBoard.tsx:114, 142-145`), so a teacher who left the board on 3×3 keeps
nine cells on a 390px phone. Plan §10 requires the grid to **cap at 2×2 on tablet
and force 1-up on phone.** This is the single biggest responsive gap. Fix
(Wave 3): clamp the effective layout by viewport — either a CSS `@media` override
of `grid-template-*`, or (better, since cell count also changes which widgets
show) a viewport-aware layout clamp in `TeachingBoard`/`TeachWorkspace` state.
Nine 1fr cells at 390px will also push widget bodies below usable size
(`min-height: 80px` tile, `board.module.css:132`).

### B2. Panels do not become overlay drawers / bottom sheets — **[H]**

The left/right panels are flex children with fixed pixel widths
(`TeachWorkspace.tsx:539-553`, `leftWidth`/`rightWidth`) and the panel CSS
(`left/TeachLeft.module.css`, `right/TeachRightPanel.module.css`) carries **no
viewport `@media`** (`grep -n "@media" left/TeachLeft.module.css` → none;
right rail CSS only has `@media (hover: none)`). So on tablet/phone both panels
keep occupying inline width next to the center instead of collapsing-by-default to
rails + opening as overlay drawers (tablet) or bottom sheets (phone) per §10.
With two ~320px panels either side, a 390px or 768px viewport will force the
center to near-zero or trigger **document-level horizontal scroll** — a hard
contract violation (`CLAUDE.md` §4: "no page-level horizontal scroll at any
tier"). Fix: default `leftCollapsed`/`rightCollapsed` true below ~900px, and
render an open panel as a positioned overlay (tablet) / bottom sheet (phone)
rather than an inline flex column.

### B3. Only the chrome is responsive — **[M], confirms the gap above**

`chrome/TeachChrome.module.css` is the **only** zone CSS with viewport
breakpoints: `900px` hides the search-pill label + footer shortcut labels
(`:486-496`), `768px` hides the view switcher and bumps icon buttons to 44px
(`:498-512`), `600px` hides the context chips (`:514-519`). This is correct and
good for the bars, but it means responsiveness was implemented **only** for
Agent A's chrome — the board (B1), panels (B2), and rails were not carried
through to the §10 spec. The board-tab strip's horizontal-scroll requirement
(§10 tablet) depends on `.boardStrip` (`TeachChrome.module.css:201`) having
`overflow-x: auto` and a `min-width: 0` flex context — verify it scrolls inside
its strip rather than pushing the bar wide.

### B4. Touch targets — **[L], mostly handled, spot-check the board**

Chrome bumps to 44px at ≤768px (`TeachChrome.module.css:503-511`); the resource
toolbar row is 44px (`ResourceViewerToolbar.module.css:9`); the BoardToolbar
documents a 44px hit area via padding (`BoardToolbar.module.css:39`). **But** the
widget-tile chrome buttons (`WidgetShell.tsx:83-150`, drag/pin/expand/settings/
remove) render small `chromeBtn`s with no phone-tier 44px bump — they are
hover-revealed, which is itself a touch problem (no hover on touch). On
phone/tablet these per-widget controls may be unreachable or sub-44px. Fix: on
`@media (hover: none)` surface the widget chrome persistently and size to ≥44px.
The empty-cell add button is fine (`board.module.css:345` `min-height: 44px`).

---

## C. Reduced motion

Coverage is partial but the high-motion surfaces are handled:
- `ToolDock` — `useReducedMotion()` disables drag + spring
  (`ToolDock.tsx:11-15,79`) and the CSS has a reduce block
  (`ToolDock.module.css:47`). ✓
- Board layout-switch animation — `board.module.css:471` reduce block neutralises
  the `gridAnimated` transition (`TeachingBoard.tsx:154`). ✓
- `BoardCanvasResource.module.css` + `widgets.module.css` carry reduce blocks. ✓
- `TeachRightPanel.tsx` references reduced motion. ✓

Gaps to verify **[M]**:
- The **panel collapse** (200ms, plan §6) and **tab crossfade** (120ms) — confirm
  these transitions in `TeachLeft.module.css` / `TeachRightPanel.module.css` are
  wrapped in a `prefers-reduced-motion: reduce` override. `grep` shows reduced-
  motion blocks in the board/canvas/widgets/tooldock CSS but **not** in the
  left-panel CSS — if the collapse animates there, it needs a reduce guard.
- `FocusMode` open and `WidgetPicker` open — if their scrim/scale animates
  (`board.module.css`), confirm it is inside the existing reduce block.

---

## D. Tooltip coverage (CLAUDE.md §4 — required on destructive / team-wide)

Strong overall. `required` (always-on, non-dismissible) is correctly applied to
the destructive / high-consequence controls found:
- Remove widget — `WidgetShell.tsx:141` `<Tooltip ... required>`. ✓
- Clear annotations — `BoardToolbar.tsx:261-265` `required`. ✓
- Help — `TeachTopBar.tsx:185-190` `required` (reasonable). ✓

Most non-obvious controls carry a stable `tooltipId` for the dismissible system
(board tabs, layout options, swatches, widths, week/subject chips, quick-add,
bell). Good.

Gaps / verify:
- **D1 [M] — Team-curriculum / Share-to-team is `required` but not in this audit's
  file scope.** Plan §13.1's *push-to-team* (which destructively displaces the
  team board set) lives in Agent B's `BoardsModule`
  (`left/modules/BoardsModule.tsx`). Per `CLAUDE.md` §4 the team-wide write +
  destructive displacement MUST use `required: true` and a consequence toast.
  **Verify** `BoardsModule.tsx` gates the push behind a `required` tooltip +
  confirm — it is the single highest-consequence Teach action and is the reason
  the migration's team-board RLS allows any member to overwrite the set.
- **D2 [M] — Board settings → "reset this board" is destructive.** The gear opens
  board settings (`TeachSubBar.tsx:223-236`, `tooltipId="teach-board-settings"`,
  **not** `required`). The gear itself is fine, but whatever "reset board"
  control the settings surface exposes must be `required` (plan §9 lists "reset
  board" as a destructive action). Flag for whoever builds the settings popover.
- **D3 [L] — Add Board** (`TeachSubBar.tsx:192-207`) is creative, not destructive
  — `tooltipId` only is correct.
- **D4 [L] — Present** has a `tooltipId` (`TeachSubBar.tsx:241-245`); it is a mode
  switch, not destructive/team-wide, so dismissible is acceptable, though the
  plan's §4 voice note ("required on the Personal/Team toggle") does not apply
  here since that toggle isn't surfaced in Teach v1.

---

## E. Cross-cutting note — hard-coded grade label (CLAUDE.md §1) — **[M], not a11y but caught while auditing**

`TeachWorkspace.tsx:586` passes `gradeLabel="Grade 5"` literally to `TeachTopBar`,
and `:585` region likewise. `CLAUDE.md` §1 forbids assuming a single grade. The
prop itself is multi-grade-ready (`TeachTopBarProps.gradeLabel` is free-text), so
the fix is to source the label from the active lesson's grade, not a literal.
Flag for the integration pass.

---

## Wave 3 priority order

1. **B1** (grid cap) + **B2** (panel drawers/sheets) — these are the only **[H]**
   responsive items and together they are what currently breaks the §10 contract
   / risk document-level horizontal scroll.
2. **A1** (focus trap + restore for FocusMode & WidgetPicker) — **[H]** a11y.
3. **D1/D2** (verify push-to-team + reset-board are `required` + confirmed).
4. **A4** (tab `aria-controls` wiring + roving tabindex), **A2** (Present focus),
   **B4** (touch-surface widget chrome), **C** gaps (panel-collapse reduce guard).
5. **E**, **A3**, **A5**, **A6**, **D3/D4** polish.
