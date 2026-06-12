# Handoff: Daily View (mycurricula.app redesign)

## Overview
The **Daily View** is the teacher's day-at-a-glance lesson workspace. It shows the day's
lessons in a list, the selected lesson's full plan (phases, standards, objectives, notes,
differentiation, resources) in an editable center column, and a side panel for resources,
team to-dos, and chat. The redesign turns the three columns into a **dockable, resizable,
collapsible panel system** with persistence, keyboard control, and clearer visual hierarchy.

This package documents the redesign so it can be rebuilt in the production app.

## About the Design Files
The files in this bundle are **design references created in HTML/CSS/JS** — a working
prototype showing the intended look and behavior. They are **not** production code to copy
directly. The task is to **recreate this design in the mycurricula.app codebase** using its
existing environment, component library, and conventions (the prototype's tokens were lifted
from the live `app/tokens.css` v1.3, so they should map cleanly onto existing variables).

Two files are included:
- `Daily View (redesign).html` — the target design (implement this).
- `Daily View (current).html` — the current production view, for before/after comparison.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, radii, shadows, and interactions are
all specified. Recreate the UI pixel-accurately using the codebase's existing primitives.
All interaction logic (docking, persistence, keyboard, etc.) is implemented in the prototype
and should be treated as the behavioral spec.

---

## Layout

### App shell
```
┌──────┬──────────────────────────────────────────────────────────────┐
│ side │  TopBar (52px)                                                 │
│ nav  ├──────────────────────────────────────────────────────────────┤
│ 224/ │  Page header  (title "Daily View" + breadcrumb · view pills · │
│ 64px │                Present button)                                 │
│      ├──────────────────────────────────────────────────────────────┤
│      │  Body row — THREE dockable columns separated by drag splitters│
│      │  ┌─────────┬──────────────────────────┬──────────────────────┐│
│      │  │ left    │  center (lesson detail)  │  right (side panel)  ││
│      │  │ "Day"   │  forced TABS mode         │  Resources/To-do/Chat││
│      │  │ panel   │  (lesson plan + phases)   │                      ││
│      │  └─────────┴──────────────────────────┴──────────────────────┘│
└──────┴──────────────────────────────────────────────────────────────┘
```

- **SideNav**: `224px` expanded, `64px` icon-rail when collapsed; states `data-nav="collapsed|pinned"`. Glass background (`backdrop-filter: blur(12px)`), `border-right: 1px solid var(--border)`.
- **Body columns** use `flex-grow: var(--w)` with `flex-basis: 0`, so widths are ratios driven by a `--w` custom property the splitters write. Defaults: left `312`, center `620`, right `332`. Min-widths: left `220`, center `340`, right `260`.
- **Splitters** sit between columns; `data-on="false"` disables them when a neighbor is collapsed/hidden.

### Page header (redesigned — single tightened bar)
- Background `var(--surface)`, `border-bottom: 1px solid var(--border)`, padding `14px 22px`, `display:flex; align-items:center; gap:16px`.
- Left: `.pageTitle` "Daily View" (`Poppins` 700, `22px`, `letter-spacing:-.02em`, color `--ink`) with the **breadcrumb directly underneath** (`.headerCrumb`, `12px`, links `--body`, separators `›` in `--faint`). *The previous separate breadcrumb band and the generic subtitle were removed to calm the top of the page.*
- Right (`.headerActions`, `margin-left:auto`): segmented **view pill** (Subjects / Schedule — pill container `--surface-warm` with 1px border; active button white with `--sh-xs`, color `--brand-600`) and a **Present** button (pill, `--brand-500` bg, white, `--sh-brand` shadow; hover `--brand-600`).

---

## Components & Behavior

### 1. Dockable panel system (the core of the redesign)
Each of the three columns is a **slot** (`data-slot="left|center|right"`). Slots hold one or
more **dock panels** (`.dockPanel[data-panel]`). Panel identities: `day`, `lesson`, `side`.

- **Tab strip** (`.slotTabs`) at the top of each slot: one `.slotTab` per docked panel, each with a 6-dot drag grip, title, and (for side slots) pin + collapse controls. Active tab: white bg, `--ink` text, `--sh-xs`, bordered.
- **Modes** (`data-mode`): `tabs` (one panel visible, others as tabs) or `stack` (panels stacked vertically). Center slot and any slot containing the `lesson` panel are **forced to `tabs`**. A segmented Tabs/Stack control appears in the strip otherwise.
- **Move panels between columns** by dragging a tab. While dragging, `body.docking` is set and a **dock overlay** (`.dockLayer`) appears.

#### Drag-to-dock shadow preview (redesign detail)
- The three drop zones (`.dockZone[data-zone]`) are **absolutely positioned to align with the real columns** (computed from each slot's bounding rect, with a `170px` minimum landing footprint for collapsed rails). They are not equal thirds.
- A zone shows a dashed brand outline by default; on `dragenter` it gets `.hot` (solid `--brand-500` border, brand-tinted fill) and reveals a **ghost panel preview** (`.dockGhost`): a card with the dragged panel's icon + title in a header and skeleton lines below, animating in (`ghostIn` 0.16s). The "Move left/center/right" hint hides while hot.

### 2. Side-column collapse / pin → icon rail (redesign detail)
Side columns (left + right) carry `data-pinned` and `data-collapsed`.
- **Collapsed** (`data-collapsed="true"`) or **unpinned** (`data-pinned="false"`) → column shrinks to a **50px rail** (`.colRail`, `--surface-warm`).
- The rail shows: an **expand chevron** at top, then a **vertical stack of icon buttons** (`.colRailIcon`, 34×34, `--r-sm`) — **one icon per panel in that column**, plus a vertical text label and a brand dot.
  - For the multi-tab `side` panel, the rail expands into one icon **per inner tab**: Resources (folder), To-do (checklist), Chat (speech bubble).
  - Day panel → calendar icon; Lesson panel → book icon.
  - Clicking an icon re-pins + expands the column and activates that panel/inner tab. The active panel's icon shows the `.on` state (`--brand-50` bg, `--brand-600`).
- **Rail badges**: To-do icon shows a numeric `.railBadge` (count of incomplete to-dos, `--brand-500` pill, top-right); Chat icon shows a `.railDotBadge` (unread dot, `--urgent`).
- **Pin button** toggles float vs. pinned; **collapse chevron** collapses to rail. Tooltips include the keyboard shortcut.

### 3. Resize, reset & collapse shortcuts
- **Drag a splitter** to resize neighbors (writes `--w` on both, clamped to min-widths). Layout persists on pointer-up.
- **Double-click a splitter** → resets all column widths to defaults (removes `--w`).
- **Double-click a side panel's tab** → collapses that column to its rail.

### 4. Keyboard shortcuts
- `[` toggles the **left** column (collapse ↔ expand); `]` toggles the **right** column.
- Ignored while focus is in an `input`, `textarea`, `select`, or `contenteditable`, and when a modifier (⌘/Ctrl/Alt) is held.

### 5. Layout persistence
On any layout change the full state is written to `localStorage` under key
**`cc_daily_layout_v1`** and restored on load. Persisted: per-column panel list & order,
active panel, `collapsed`/`pinned`/`usermode`, column `--w` widths, and the active inner
side-panel tab. *In production, persist this per-user (and ideally per-device) rather than in
a single localStorage blob.*

### 6. Center column — lesson plan
- **Lesson header card** (subject-tinted) with subject chip, title, time range, edit/expand actions, and a rich-text toolbar (`.rtToolbar`, sticky).
- **Phase nav** (`.agendaNav`): sticky left rail inside the workspace listing lesson phases. Each `.agendaItem` = numbered circle + `.agendaText` (name + time). **Phases are drag-reorderable** and **rename-on-double-click**.
  - **Redesign fix:** `.agendaText` is now `display:flex; flex-direction:column` and `.agendaName`/`.agendaTime` are `display:block`, so the **phase name and minutes sit on separate lines** (they previously rendered inline and merged).
  - **Minutes are optional:** `.agendaTime` is left empty when a phase has no time and is hidden via `.agendaTime:empty{display:none}` — no dangling "·" separator. Time is parsed from the phase title's `.min` span (format `· 15 min`).
- **Planning tabs** (`.planTab` inside `.planTabs`): Objective, Standards, Lesson Notes, Differentiation (+ optionally Chat, Resources). Tabs are drag-reorderable, closable, and addable from a menu.
  - **Redesign fix — colored tab tops:** each tab carries a `--pc` accent color and renders a **colored bar across its top** via `::before` (`height:3px`, `--r-sm` top corners). Inactive `opacity:.5`, hover `.85`, active `opacity:1; height:4px`. Tab top padding was bumped to `12px` to seat the bar.
  - Tab `--pc` colors: Objective `--brand-500`, Standards `--done`, Lesson Notes `--writing-bright`, Differentiation `--grammar-bright`, Chat/Resources from their `META` color.

### 7. Phases
`.phase` sections with `.phaseHead` (title + `.min` time + status chip), teacher instructions,
check-for-understanding lists, and per-phase tagged resources (`.resChip`, drag-reorderable,
editable, deletable). Phases are addable; status chips: `done` / `progress` / `idle`.

---

## Interactions & Behavior summary
| Action | Result |
|---|---|
| Drag panel tab | Dock overlay appears; column-aligned zones with ghost preview; drop moves panel |
| Click rail icon | Re-pin + expand column, activate that panel/inner tab |
| Pin button | Toggle floating ↔ pinned |
| Collapse chevron / dbl-click tab | Collapse column to icon rail |
| `[` / `]` | Toggle left / right column |
| Drag splitter | Resize neighbors (persisted) |
| Dbl-click splitter | Reset all widths |
| Dbl-click phase name | Rename phase inline |
| Drag phase / plan tab | Reorder |
| Any layout change | Saved to `localStorage['cc_daily_layout_v1']` |

Transitions: nav width `0.2s cubic-bezier(.2,.7,.3,1)`; ghost preview `ghostIn 0.16s ease`;
generic hover/opacity `0.12s`. Respect `prefers-reduced-motion` in production.

## State Management
Per-column: `panels[]` (ordered), `active` panel id, `collapsed` (bool), `pinned` (bool),
`usermode` (`tabs`|`stack`), `width` (`--w` ratio). Plus active inner side-panel tab.
Lesson-level: selected lesson, phase order, per-phase status, plan-tab order/visibility,
resource chips. To-do completion drives the rail badge count.

## Design Tokens
Lifted from `app/tokens.css` v1.3 — map onto existing variables.

**Fonts:** Display `Poppins`; Display-sm / Logo `DM Sans`; Body `Plus Jakarta Sans`; Mono system.
**Type scale (px):** 28 26 24 22 20 18 16 15 14 13 12 11 10. Base body `13px / 1.4`.

**Ink / neutrals:** `--ink-900 #1c1b2e`, `--ink-700 #3a3950`, `--ink-500 #57566b`, `--ink-400 #908fa3`, `--ink-300 #bfbed0`, `--ink-200 #d9d6cc`, `--ink-150 #eceae3`, `--ink-100 #f4f2ec`, `--ink-50 #fcfaf6`, `--paper #fff`.
**Surfaces:** `--canvas #fcfaf6`, `--surface #fff`, `--surface-warm #fffdf8`, `--border #eceae3`, `--border-cool #e8eaf2`, `--hairline #f4f2ec`.
**Brand (blue):** `--brand-50 #eef3ff`, `100 #dce6ff`, `200 #baccff`, `300 #8fa8ff`, `400 #6383fb`, `500 #3b6cf6`, `600 #2e55db`, `700 #2543b0`.
**Honey:** `--honey-100 #ffefc2`, `300 #f8cc5c`, `400 #f4b740`, `600 #c9871a`.
**Status:** done `#16a06b` (tint `#e4f6ee`), progress `#3b6cf6` (tint `#eef3ff`), idle `#b6b5c6` (tint `#f1f0f4`), warn `#e9a526` (tint `#fff8e7`), urgent `#d92b3c` (bg `#fde6e8`).
**Subjects** (solid / light / deep / bright) — 8 locked: math `#dcc674`/`#f4efdf`/`#7a671f`/`#e8bb17`; reading `#7a9ec7`/…/`#4788d1`; writing `#dca574`/…/`#e87917`; grammar `#ab7ac7`/…/`#9f47d1`; spelling `#cf77af`/…/`#e8179b`; ufli `#dc8274`/…/`#e83317`; explorers `#7ac79b`/…/`#47d183`; sel `#7a7fc7`/…/`#4751d1`.
**Radii:** 2 4 6 8 12; xs 6, sm 10, md 14, lg 18, xl 24, 2xl 32, pill 999.
**Shadows:** `--sh-xs 0 1px 2px rgba(28,27,46,.05)`; `--sh-sm 0 2px 6px rgba(28,27,46,.06)`; `--sh-md 0 10px 24px -10px rgba(28,27,46,.14)`; `--sh-lg 0 22px 48px -16px rgba(28,27,46,.2)`; `--sh-brand 0 12px 26px -10px rgba(59,108,246,.45)`; `--sh-honey 0 12px 26px -10px rgba(233,165,38,.55)`.
**Misc:** `--topbar-h 52px`; gradients `--grad-honey` (135° honey-300→400), `--grad-dawn`.

## Assets
- **Fonts:** Google Fonts — Poppins, DM Sans, Plus Jakarta Sans (the only external dependency). Swap to the codebase's hosted fonts if available.
- **Icons:** all inline SVG (stroke-based, `stroke-width:2`, round caps/joins). Replace with the app's icon set, matching weight.
- **Logo:** honey-gradient rounded glyph in the SideNav brand area.
- No raster images.

## Files
- `Daily View (redesign).html` — the design to implement (self-contained: tokens, layout, all panel/agenda/tab logic inline).
- `Daily View (current).html` — current production view for comparison.

Key class anchors to search in the redesign file: `.app`, `.sidenav`, `.dailyPageHeader`,
`.headerCrumb`, `.colList/.colDetail/.railColumn`, `.slot/.slotTabs/.slotTab`, `.dockPanel`,
`.dockLayer/.dockZone/.dockGhost`, `.colRail/.colRailIcon/.railBadge`, `.agendaNav/.agendaItem`,
`.planTabs/.planTab`, `.phase`. Layout JS is the IIFE beginning `var body=document.querySelector('.body')`.
