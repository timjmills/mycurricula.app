# MyCurricula: Teach View Build Specification

**Owner:** Tim
**Product:** MyCurricula
**Feature:** New top-level "Teach" view
**Status:** Design brief, ready for implementation
**Last updated:** 24 May 2026

---

## 1. Purpose

Add a new top-level view called **Teach** alongside the existing Dashboard, Plan, Assess, Report, and Resources views. Teach is the live classroom delivery surface. A teacher opens it during a lesson and gets one unified screen combining:

- The lesson plan (read-only context from Daily view).
- An interactive teaching board (Classroomscreen-style widgets in a configurable grid).
- The lesson's resources (PDFs, slides, videos, links, tools).
- The teacher's ambient working context (notes, groups, chat, to-do).

The intent is that a teacher never leaves the app mid-lesson. Everything they need to deliver a 60-90 minute lesson block lives behind one keyboard shortcut.

## 2. High-level structure

The Teach view has four structural zones, left to right:

1. **Far-left icon rail.** Persistent vertical strip of module icons, ~52px wide.
2. **Left panel.** Default ~280px, resizable, collapsible, hosts module tabs.
3. **Center panel.** Flexible width. The active Teaching Board with widget grid.
4. **Right panel.** Default ~320px, resizable, collapsible, hosts module tabs.
5. **Far-right icon rail.** Symmetric to the far-left rail.

Every panel except the center is dockable, moveable, resizable, tabbable, and detachable to a floating window. Any module can live in any panel. The center is the persistent workspace and cannot be moved or hidden (only fullscreened or popped out).

## 3. The module set

A "module" is any of the dockable tools below. Each appears as an icon on the rails and as a tab inside a panel. Users can drag icons between rails and tabs between panels. All movements persist per user as workspace state.

| Module | Default location | Purpose |
|---|---|---|
| Lessons | Left | Day's lesson list, mirroring Daily view |
| Lesson | Left | Read-only full lesson text from Daily (objective, standards, sections, teacher notes), with "Open in Daily" link |
| Boards | Left | Thumbnails of teaching boards for active lesson (Warm-Up, Mini Lesson, etc.), reorderable, + Add Board |
| Notes | Left | Free-form private teacher notes for the active lesson |
| Groups | Left | Student group definitions (same data that powers the Student Groups widget) |
| Class | Left | Class roster with attendance, behavior tracking, quick name picker |
| Tools | Left | Random name picker, dice, calculator, unit converter |
| Resources | Right | Padlet grid or list view of all resources for the active lesson |
| Chat | Right | The Day Shoutbox (same thread as Daily view, see section 7) |
| To-do | Right | Teacher's running to-do list (same as Daily view, single source of truth) |

### 3.1 Rail behavior

Rails start **context-scoped** by default:

- **Left rail (planning and lesson context):** Lessons, Lesson, Boards, Notes, Groups, Class, Tools.
- **Right rail (resources and ambient context):** Resources, Chat, To-do.

Users can drag any icon from one rail to the other. The change persists per user in their `TeachWorkspaceLayout`. A "Reset to default rails" option in the workspace settings menu restores the context-scoped default.

Clicking a rail icon opens that module as a tab in the nearest panel on the same side. If the module is already open, the click focuses its tab. Cmd-click opens the module in a floating window instead of docking.

## 4. Center panel: Teaching Board

### 4.1 Board structure

Each Subject's Lesson has one or many Teaching Boards. The default board set follows the lesson phase structure: Warm-Up, Mini Lesson, Guided Practice, Centers, Exit Ticket. Boards appear as a tab strip at the top of the center panel, with an "+ Add Board" affordance at the end.

### 4.2 Grid layout

A board holds widgets in a configurable grid. The layout toolbar above the grid offers:

- 1-up (1x1, single widget fills the board)
- 2-up (1x2)
- 3-up (1x3)
- 2x2 (four widgets)
- 2x3 (six widgets)
- 3x3 (nine widgets)

Switching layouts animates over 200ms. Existing widgets keep their top-left anchor; new cells appear empty. Widgets snap to grid cells. Any widget can be expanded to fill the full board temporarily (focus mode) without destroying the underlying layout. Press Esc to return.

### 4.3 Widget library

Display:
- Objective / I-can statement (large text, optional standard code chip)
- Model It (display worked example, image, or formula)
- Teacher Notes (rich text, private to teacher, not shown in Present mode by default)

Timing:
- Visual timer (countdown ring)
- Stopwatch
- Countdown to event

Engagement:
- Student Groups (named groups with student chips)
- Agenda / Checklist (with elapsed time per item)
- Poll / Traffic Light (thumbs, faces, A/B/C/D)
- Draw / Whiteboard
- Randomizer / Name picker
- Dice
- Scoreboard

Content embed:
- Embed (loads an arbitrary resource: PDF, slides, video, link, image)

Utilities (matching Classroomscreen widget set):
- Sound level
- QR code
- Calendar
- Event countdown
- Hyperlink shortcut

### 4.4 Widget chrome

Every widget tile has a header strip with:

- Drag handle (move within grid)
- Pin (lock to position; widget survives layout change)
- Expand to focus mode
- Settings (widget-specific config)
- Remove

### 4.5 Adding a widget

When a board is empty, the grid shows light dashed cell outlines with a "+" in each cell. Clicking "+" opens the widget picker as a popover, categorized by Display, Timing, Engagement, Content embed, Utilities.

Dragging a resource from the Resources tab onto a cell shows a blue drop-target highlight; releasing embeds the resource as an Embed widget pre-configured for that resource.

## 5. Panel mechanics (applies to left and right panels)

### 5.1 Docking

Each panel can be:
- Docked left (default for left panel)
- Docked right (default for right panel)
- Collapsed to a 32px strip showing vertical tab labels or icons
- Detached as a floating window

### 5.2 Tabs

- Tabs sit in a thin header (~32px) at the top of each panel.
- Each tab shows icon + label + close (x) on hover.
- Drag a tab to reorder within the panel.
- Drag a tab out to detach as a floating window.
- Drag a tab into another panel to re-dock there.
- A "+" button at the end of the tab strip opens a picker of available modules.
- A three-dot overflow menu per panel offers: collapse, dock left, dock right, float, close panel.

### 5.3 Resize

- Resize handles on the inner edge of each side panel (2px hit area, 6px on hover).
- Double-click handle to snap back to default width.
- Center panel is always the flex remainder.

### 5.4 Floating windows

- A detached tab becomes a draggable, resizable window with the same header chrome plus a minimize button.
- Floating windows remember their position per user, per module.
- Hovering near a panel edge during drag shows a re-dock preview (translucent fill of the dock target).

### 5.5 Layout presets

A "Panels" button in the top bar opens a quick-switch menu with presets:

- **Lesson focus:** small left, large center, no right.
- **Resource heavy:** small left, medium center, large right.
- **Presentation:** center only, both panels collapsed.
- **Default:** left and right at default widths.
- Plus a "Save current as preset" option.

## 6. Right panel modules in detail

### 6.1 Resources

View toggle in the panel header: grid icon vs list icon.

**Grid (padlet style):**
- Cards ~140px tall.
- Thumbnail at top (or generic icon by type).
- Title (2-line clamp).
- Type pill in bottom-left (PDF, SLIDES, VIDEO, LINK, DOC, IMAGE, TOOL).
- Magnify icon on hover in top-right.

**List style:**
- Rows 40px tall.
- Type pill on the left.
- Title in the middle.
- Magnify and overflow icons on the right.

Search input at the top of the panel; filter chips below (All, Slides, Handouts, Tools, plus custom tags).

**Interactions (both modes):**
- Drag handle on every card/row. Drag onto a board cell to embed, drag onto another resource to reorder.
- Right-click or three-dot menu: Open in board, Magnify, Open in new tab, Copy link, Edit, Remove from lesson. (Both drag and menu are supported.)
- Magnify opens the resource as a fullscreen overlay over the entire Teach view, dismissible with Esc.

### 6.2 Chat

Reuses the existing Day Shoutbox thread from Daily view. Same conversation, same participants, same persistence. No Teach-scoped sub-thread.

- Matches Daily Shoutbox visual style: avatar, name, timestamp, message bubble.
- Unread badge on the rail icon and on the tab when new messages arrive while the panel isn't focused.
- Compose input at the bottom with emoji and attachment buttons.
- Enter sends, Shift+Enter inserts newline.
- @mentions trigger a roster picker (sourced from the Class module).

### 6.3 To-do

Reuses the existing To-do List from Daily view. Single source of truth.

- Compact list of tasks: checkbox, text, optional due chip, optional lesson tag.
- Quick-add input at the top. Pressing Enter creates a todo automatically tagged with the active lesson.
- Completed items collapse into an expandable "X completed" footer.

## 7. UI / UX detail

### 7.1 Visual language

Inherits MyCurricula's existing system:

- White surfaces, soft shadows, 8-12px rounded corners.
- Blue primary accent for active states.
- Grey-50 panel backgrounds, grey-100 dividers.
- Existing sans-serif font stack.
- Teach view feels visually quieter than Daily (less chrome, more workspace) because the teacher is presenting, not planning.

### 7.2 Icon rail behavior

- 52px wide, full viewport height below the top nav.
- Icons 24px, vertically stacked, 16px gap, with optional 10px label below (hideable via preference).
- Active module shows a 3px coloured accent bar on the inner edge plus a subtle filled background.
- Hover shows a tooltip with module name and current keyboard shortcut.
- A "+ More" icon at the bottom of each rail opens a sheet of all installed modules.
- Drag any icon between rails; drop position determines vertical order.

### 7.3 Top bar (Teach view)

Mirrors the mockup pattern:

- Week selector
- Subject selector
- Board tab strip (Warm-Up / Mini Lesson / Guided Practice / Centers / Exit Ticket / + Add Board)
- Layout toolbar (Layout, 1-up, 2-up, 3-up, 2x2, 2x3, 3x3)
- Board settings gear
- Action cluster on the right: Panels (preset picker), Present, Pop-Out, Duplicate, Full Screen

### 7.4 Empty states

- Empty left panel: "Add a module" with module picker grid.
- Empty board: dashed cell outlines, central "Add your first widget" CTA.
- Empty Resources: "No resources attached yet, drag files here or pick from your library."
- Empty Chat: "No messages today, ping a teammate to start the day."
- Empty To-do: "Nothing on your list, you're caught up."

### 7.5 Feedback and animation

- Panel collapse/expand: 200ms ease-out.
- Tab switch within a panel: 120ms crossfade.
- Drag preview: semi-transparent ghost of the tab or card following the cursor.
- Drop targets pulse softly in blue during drag.
- Widget add/remove: 180ms scale + fade.
- All animations respect `prefers-reduced-motion`.

### 7.6 Keyboard shortcuts

| Shortcut | Action |
|---|---|
| Cmd+1..9 | Jump to board 1-9 of active lesson |
| Cmd+L | Focus Lessons tab |
| Cmd+Shift+L | Focus Lesson (text) tab |
| Cmd+R | Focus Resources tab |
| Cmd+J | Focus Chat tab |
| Cmd+K | Focus To-do tab |
| Cmd+/ | Open layout switcher |
| Cmd+P | Present |
| Cmd+Shift+P | Pop-Out |
| Esc | Exit focus mode, then fullscreen, then close floating window |
| Arrow keys | Move between widget cells (when grid is focused) |

### 7.7 Accessibility

- All icon-rail icons have aria-labels, tooltips, and visible keyboard focus rings.
- Tab order: top bar, left rail, left panel tabs, center board, right panel tabs, right rail.
- Focus mode and Present mode trap focus within the surface and provide an "Exit" button accessible via Tab.
- Widget colors meet WCAG AA contrast.
- Live regions announce poll result changes and timer state changes for screen reader users.
- Drag and drop operations have keyboard equivalents (select tab, then Cmd+arrows to move).

## 8. Present, Pop-Out, Duplicate, Full Screen

- **Present.** Fullscreens the center Teaching Board on the current display, hiding side panels and chrome. Shows an "Exit" button (top-right) and responds to Esc.
- **Pop-Out.** Opens the Teaching Board in a new browser window so the teacher can drag it to a second display (e.g., classroom projector) while keeping side panels on their laptop.
- **Duplicate.** Mirrors the board to a second window without losing focus on the source. Useful for "I see what they see" sanity checks.
- **Full Screen.** Fullscreens the entire Teach view including side panels, hiding browser chrome only.

## 9. Persistence

Per-user `TeachWorkspaceLayout` stores:

- `panel_dock` (left, right, float, collapsed) for each module currently in use
- `tab_order` per panel
- `panel_widths` (left, right)
- `floating_windows`: array of `{module, x, y, w, h}`
- `icon_rail_left_order`: array of module IDs
- `icon_rail_right_order`: array of module IDs
- `last_used_board_per_lesson`
- `layout_preset_preferences`

Per-board state stores widget instance state with **per-widget persistence settings**. Each widget type has a sensible default (e.g., timer resets, drawn ink persists, poll results persist) which the teacher can override per widget. A "Reset board" affordance in the board settings clears all widget state at once.

## 10. Data model additions

```
Board
  belongs_to Lesson (Lesson belongs_to Subject, Day, Week)
  has_many Widgets
  fields: title, position, template_id (nullable)

Widget
  belongs_to Board
  fields: type, grid_position {row, col, rowspan, colspan}, config (JSON), pinned (bool), state (JSON), persistence_override (enum)

Resource
  belongs_to Lesson
  fields: kind (pdf|link|video|doc|image|slides|tool), title, url_or_file_ref, thumbnail_url, default_render_target (embed|magnify|external), tags

TeachWorkspaceLayout
  belongs_to User
  fields: as listed in section 9

BoardTemplate
  fields: title, subject_scope, layout, widgets (array of widget configs)
  (Used by "Save board as template" for reuse across lessons)
```

Modules backed by existing Daily data (Chat, To-do, Notes, Groups, Class) do not require new tables. They surface existing data sources as dockable Teach modules.

## 11. Out of scope for v1

Flagging now to set expectations and prevent scope creep:

- Real-time student devices (students answering polls from their own iPads). Defer to v2.
- Collaborative co-teaching (two teachers editing the same board live).
- Board version history / undo across sessions.
- Public board sharing across schools.
- Third-party widget marketplace.
- Native mobile or tablet teacher app (web-responsive only for v1).

## 12. Decisions log

Decisions made during spec refinement, recorded for future reference:

| # | Question | Decision |
|---|---|---|
| 1 | Should board state persist between sessions? | Per-widget setting, each widget type has sensible default |
| 2 | Resource embed via drag only or also menu? | Both, since teachers' hands differ mid-class |
| 3 | Right icon rail mirror left rail? | Context-scoped by default, user can drag any icon to either rail, change persists, "Reset to default" available |
| 4 | Is Teach Chat its own thread or shared with Daily? | Shared. Same Day Shoutbox thread, no Teach-scoped sub-thread |

## 13. Open questions for build phase

- Which third-party libraries for the panel docking system? (Candidates: rc-dock, golden-layout, flexlayout-react, or custom.)
- Embed widget security: which resource types render inline vs require external open? (PDFs and YouTube safe inline; arbitrary HTTPS links may need iframe sandboxing.)
- Mobile fallback: does Teach degrade to a single-panel stacked view below a breakpoint, or redirect to Daily?
- Real-time chat: WebSocket connection scope (per workspace, per day, per lesson)?
- Telemetry: which Teach interactions feed back into Plan/Report? (e.g., "widget used in lesson", "resource opened during teaching" might be useful planning signals.)
