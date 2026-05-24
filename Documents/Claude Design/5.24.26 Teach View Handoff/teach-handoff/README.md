# Teach View — Claude Code handoff

Developer handoff for the **Teach view** prototype from the
*5.24.26 - Teach View.html* design exploration. A top-level view in
MyCurricula that drives live in-class teaching: tabbed boards
(Warm-Up · Mini Lesson · Guided Practice · Centers · Exit Ticket · +)
with a flexible widget grid (up to 3×3) on a 3-zone shell.

## Files

- `teach524.jsx` — the entire Teach view, self-contained React
  (no third-party deps beyond React + Inter + Caveat fonts).
  Exports 11 artboards to `window.AB*`.
- `index.html` — the prototype page with all 11 artboards stacked.
  Open in a browser to preview.
- `spec.md` — the original build specification (architecture, data
  shapes, widget catalog, interaction notes).
- `README.md` — this file.

## The 11 artboards

| # | Name | What it shows |
| --- | --- | --- |
| T1 | Default Teach view | Warm-Up board active. 3-row widget grid: I Can spans 2 cols + Visual Timer, Student Groups + Model It + Agenda, Manipulatives spans 2 cols + Teacher Notes. Hover any widget for drag/expand chrome. |
| T2 | Collapsed side panels | Same as T1 but both side panels collapsed into 64px icon rails (left + right). Canvas widens. |
| T3 | Resource opened in board | Fraction Wall Poster PDF loaded as main canvas. PDF viewer toolbar + annotation toolbar (pen / highlighter / eraser / shapes / text / undo-redo / colour swatches). Left panel: Lesson + I CAN widget + Agenda + Teaching Boards. Right panel: pinned Visual Timer + Resources grid. |
| T4 | Resource opened, both panels collapsed | Same as T3 with both side panels collapsed into 64px icon rails. PDF nearly full width. |
| T5 | Widget picker popover | + on an empty cell opens a centered picker with 12 widget types (Timer · I Can · Groups · Agenda · Notes · Model It · Slides · YouTube · Poll · Names · Manipulatives · Embed). |
| T6 | Present mode | All chrome hidden. Thin top strip with board name + slide counter + prev/next + Esc-to-exit. Widget chrome stays hidden for projection clarity. |
| T7 | Focus mode | One widget fullscreened (Visual Timer demonstrated). Esc returns to the board. |
| T8 | Drag-drop resource onto empty cell | Dashed math-blue drop target on an empty 1×1 cell. Floating drag-ghost of the resource card showing what's being dragged. |
| T9 | Empty board state | Centred "Add your first widget" CTA with one-tap widget pills. |
| T10 | Mini-Lesson board active | Different widget mix: Slides anchor spans 2 rows, Model It + YouTube + Name Picker + Poll fill the rest. Proves the board-tabs flip changes both active state and the widget mix. |
| T11 | Pop-Out window | Detached board (`/teach/pop?board=warm-up`) for second-monitor projection. Minimal chrome: title bar + Full-screen + Reattach. |

## Shell architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│ TopBar     MyCurricula · Grade 5 · Dashboard · Plan · Teach (active)  │
│            · Assess · Report · Resources · search · + · 🔔 · ? · LH    │
├────────────────────────────────────────────────────────────────────────┤
│ SubBar     Week 12 · Math · [1 Warm-Up active] [2 Mini Lesson] ...    │
│            + Add Board · Present · Pop-Out · Duplicate · Full Screen   │
├──────┬───────────┬────────────────────────────────────────────┬────────┤
│ 64px │ Lessons   │ Drawing toolbar                            │ Resour-│
│ rail │ Lesson    │ Widget grid (1×1 → 3×3)                    │ ces    │
│      │ card +    │                                            │ search │
│ Less │ list      │  ┌─I CAN (2-col)──┐ ┌─Visual Timer──┐      │ filter │
│ Boards│ Teaching │  │                │ │ 08:14         │      │ Grid/  │
│ Group│ Boards    │  ├────────────────┴─┴───────────────┤      │ List   │
│ Class│ thumbs    │  │ Student Groups (2-col) │ Model It│      │        │
│ Notes│           │  │                        │         │      │ thumb  │
│ Timer│           │  └────────────────────────┴─────────┘      │ cards  │
│ Tools│           │            ToolDock (floating)              │ + hover│
│      │           │                                            │ menu   │
├──────┴───────────┴────────────────────────────────────────────┴────────┤
│ Footer    Panels · Lessons · Resources · Notes · Board 1 of 5 · Saved  │
│           · ⌘P Present · ⌘/ Search · ⌘? Help                          │
└────────────────────────────────────────────────────────────────────────┘
```

## Component map

| Symbol | Purpose |
| --- | --- |
| `T` | Colour-token dict (blue, purple, rose, etc. + resource-type palettes) |
| `Icon` | Inline-SVG icon set keyed by name |
| `TopBar` / `SubBar` | The two top bars |
| `LeftRail({ collapsed })` | 64px icon rail (always shown) |
| `LeftPanel` | Default left side-panel (Lesson card + lesson list + Teaching Boards) |
| `LeftPanelWithWidgets` | Variant used in T3/T4 — Lesson + I CAN + Agenda + Boards |
| `RightRail` | 64px collapsed right rail |
| `ResourcesPanel({ view, hoverItem })` | Default right side-panel — grid + list + search + filters + thumb cards |
| `RightPanelWithTimer` | Variant — pinned Visual Timer above the grid |
| `CanvasToolbar` | Drawing toolbar above the widget canvas |
| `Widget` | Widget shell (header + body + hover chrome) |
| `ICanWidgetRaw` · `TimerWidget` · `GroupsWidget` · `ModelWidget` · `AgendaWidget` · `ManipulativesWidget` · `NotesWidget` · `ResThumb` · `ResArt` · `MiniLessonBoard` | Widget bodies / pieces |
| `ToolDock` | Floating bottom tool palette (select/text/pen/sticky/timer/...) |
| `PdfPreview` · `AnnotationToolbar` | T3/T4 PDF viewer + annotation toolbar |
| `Footer` · `FooterPanda` | Bottom status bars |

## Data shape (for production wire-up)

```ts
type Board = {
  id: string;
  label: string;          // e.g. "Warm-Up"
  tint: string;           // canvas-tint token id
  widgets: Widget[];      // grid contents
};

type Widget = {
  id: string;
  type: "icon" | "timer" | "groups" | "agenda" | "notes" | "model"
      | "slides" | "youtube" | "poll" | "names" | "manipulatives" | "embed";
  gridCol: { start: number; span: number };
  gridRow: { start: number; span: number };
  payload: any;           // type-specific config (see below)
};
```

Widget-payload examples:

- **Timer** — `{ minutes: 8, secondsRemaining: 494, paused: false, color: "purple" }`
- **I Can** — `{ text: "...", standards: ["5.NF.B.3", "5.NF.A.1"] }` (uses subject blue accent)
- **Groups** — `{ groups: [{ name: "Group 1", students: [{ initials, color }] }] }`
- **Agenda** — `{ items: [{ label, time, status: "done"|"todo"|"current" }] }`
- **Notes** — `{ html: "…", paper: "yellow" }` (Caveat font on the body)
- **Model It** — `{ problem: "2/3", equivalents: [[3,2],[6,4],[9,6]] }`
- **Slides** — `{ url, currentSlide, totalSlides }`
- **YouTube** — `{ videoId, title, durationSec }`
- **Poll** — `{ question, options: [{ label, votes }] }`
- **Manipulatives** — `{ kind: "fraction-strips" | "image", src? }`
- **Embed** — `{ url }`

## Tokens used

- **Background** — `#F4F6FB` (page); `#fff` (cards / chrome); `#FAFBFC` (lane label cells).
- **Borders** — `#E5E7EB` (card outline); `#F1F2F6` (soft / hover); subject-deep at 25% (math).
- **Text** — `#0B1220` primary; `#4B5563` secondary; `#9CA3AF` tertiary.
- **Subject (Math) accents** — `#2563EB` (active), `#DBEAFE` (tile), `#1E3A8A` (deep, for text-on-tint).
- **Resource types** — `rPdf`, `rSlides`, `rVideo`, `rLink`, `rDoc`, `rImage`, `rTools` (see top of `teach524.jsx`).
- **Widget tints** — yellow / mint / sky / pink / lavender / peach (also at top of file).

## Behaviour notes

1. **Widget chrome on hover** — `.teach-widget:hover .teach-chrome { opacity: 1 }`. Drag / pin / expand / settings / remove icons only appear when the cursor is over the widget.
2. **Board-tab flip** — clicking a sub-bar tab changes both the active state pill and the entire widget mix on the canvas (T1 vs T10). The canvas tint can subtly shift per board.
3. **Side panels collapse to 64px rails** — both left and right panels can independently collapse. The icon rail stays + a label under each icon.
4. **Resource hover menu** — hovering a resource thumbnail surfaces "Embed to Board" + "Open Large" inside the right panel (see T1).
5. **PDF / Resource opened in board** — the entire centre canvas becomes the resource viewer with its own toolbar + annotation toolbar. Widgets that were on the board move into the left panel (I Can, Agenda) and right panel (Visual Timer).
6. **Present mode** — chrome hidden, widget chrome hidden, only the board content + a thin top strip showing presentation state.
7. **Drag-and-drop** — resources dragged from the right panel show a rotated drag-ghost; empty cells highlight as drop-targets with a dashed math-blue border.

## How to run

```sh
cd teach-handoff
python3 -m http.server 8080
# open http://localhost:8080
```

Or just double-click `index.html` in a modern browser.

## Re-implementation notes for production

1. Lift out of Babel-in-browser. Move each component to its own file
   under `src/teach/`. Remove the `Object.assign(window, …)` exports.
2. Widget positions in the grid are demoed via inline `gridColumn` /
   `gridRow` props. Production should store these in `Board.widgets`
   and render via CSS grid.
3. The Visual Timer is hard-coded to 08:14 / 3:42 in the focus state.
   Production runs an interval timer and stores state in the board.
4. PDF viewer is a static SVG/HTML mock. Production renders via
   `pdf.js` or a similar viewer. The annotation layer is a separate
   `<canvas>` overlay synced to scroll/zoom.
5. The Boards thumbnail strip on the left panel is currently 5 boards
   + an Add board button. Production reads from `Lesson.boards`.
6. The resource hover menu (Embed to Board / Open Large) is shown on
   one card. Production wires the hover state to the right panel's
   `useState` and shows the menu via portal.
7. T11 Pop-Out renders inside the same React tree; production opens
   a new browser window at `/teach/pop?board=<id>` and posts message
   updates between the main + popped window for state sync.
8. Subject color is currently Math-blue throughout. Production reads
   from `Lesson.subject.color` and tints `T.blue` / `T.blueTile` /
   `T.blueDeep` at the root `<TopBar>` / `<SubBar>` level via context.

## Cross-reference

This Teach view **extends** the 4.10.26 / 5.23.26 Daily/Weekly/Subject
flow rather than replacing it: those pages link out to a lesson's
Teach view rather than rendering it inline. See the 4.10.26 handoff
for the planning-side surfaces.
