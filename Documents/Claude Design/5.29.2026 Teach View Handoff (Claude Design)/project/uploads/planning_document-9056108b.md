# Grade 5 Curriculum Planner — Planning Document

> **Audience:** This document is written to serve BOTH Claude Design (for prototyping the UI and visual components) AND Claude Code (for building the production application). Sections are tagged where they primarily serve one audience or the other.
>
> **Status:** Draft v1.0 — derived from the conversation record dated this session. Open questions are listed in §10 and should be resolved before Phase 1 build kickoff.

---

## Table of Contents

1. Product Overview
2. User & Use Cases
3. Information Architecture
4. Data Model
5. Screen-by-Screen Specifications
6. Visual Design System
7. Technical Architecture
8. Phased Roadmap
9. Acceptance Criteria
10. Open Questions
11. Glossary

---

## 1. Product Overview

### 1.1 Purpose

A single-page web application that consolidates the Grade 5 teaching team's five separate planning documents into one unified, filterable, editable curriculum operating system. Replaces:

- Padlet resource boards (one per unit per subject)
- Week-by-week lesson planning document
- Weekly focus document
- CCSS standards document
- Per-teacher personal copies of the above

**Multi-grade ready by design.** The app launches with Grade 5 as the only active grade level, but the data model and UI support additional grade levels being enabled at any time without re-architecture. Each grade has its own teaching team, master plan, units, standards, and lead teachers.

### 1.2 Core principles

- **Single source of truth.** One master plan; teachers fork personal copies as needed.
- **Personal-first viewing.** A teacher always sees their version where one exists; master appears as fallback.
- **Friction where it matters.** Editing the master is intentional and explicit. Editing personal is invisible and automatic.
- **Each UI surface has one clear job.** Modes and toggles change the *content* of a surface, not its purpose. Filtering and management live in dedicated surfaces (slide-outs, settings), not in primary view panes.
- **Filter everywhere.** Every view supports filtering by subject, unit, time period, completion status, and standards.
- **Color-driven recognition.** Subjects and units are visually unmistakable at a glance.
- **Print and paper friendly.** Daily, weekly, and unit views all have clean print templates.
- **Reusable year-over-year.** Plans archive and roll forward with minimal manual rebuilding.

### 1.3 Out of scope (v1)

- Student-facing portal (this is teacher-only)
- Parent communication
- Grading or gradebook integration
- Attendance tracking
- File hosting (Phase 2)
- PDF / image annotation (Phase 3)
- Auto-tagging of standards (Phase 2+)
- Vertical CCSS alignment across grade levels (Phase 3+)

---

## 2. User & Use Cases

### 2.1 Primary users

**Grade 5 teaching team** — small group (estimated 4–6 teachers) at a single school in Qatar. All teach the same grade level. Some lessons are taught in lockstep across all classes; others are paced individually per class.

### 2.2 Authentication scope

- Google SSO via the school's Google Workspace account.
- Sign-up restricted to the school's email domain (TBD — see §10 open question).

### 2.3 Use case archetypes

| # | Use Case | Who | How Often |
|---|---|---|---|
| 1 | Pull up today's plan, mark items done as I teach | All teachers | Daily |
| 2 | Adjust this week's plan because we ran behind | All teachers | Weekly |
| 3 | Update the master because the team agreed on a change | Whoever's leading that subject | Weekly–monthly |
| 4 | Print the week's plan for my substitute folder | All teachers | Weekly |
| 5 | See all math resources across the year | All teachers | Unit-prep |
| 6 | Tag a new assignment with its CCSS standards | Whoever creates it | Per new lesson |
| 7 | Catch up on what was missed last week | All teachers | Weekly |
| 8 | Archive this year's plan and start fresh for next year | Lead teacher | Once per year |

---

## 3. Information Architecture

### 3.1 The six views

| View | Time Frame | Default? | Use Case |
|---|---|---|---|
| **Daily** | One day | Optional | "What am I teaching today" |
| **Weekly** | One school week (Sun–Thu) | Most likely default | "What are we doing this week" |
| **Schedule** | One day, slotted into teacher's actual time blocks | Optional | "What does my actual day look like, including PE and lunch" |
| **Unit** | One unit (variable length) | Occasional | "Where are we in this unit, what's the summary" |
| **Subject** | All time / unit / month / week (filterable) | Frequent | "All math resources across the year" |
| **Year** | Whole 40-week calendar | Occasional | "Annual overview, drag-and-drop reshuffling" |

Default view is per-teacher preference, saved to their profile.

### 3.2 Navigation model

- **Top bar:** **grade-level switcher** (when multiple grades are active), view switcher (the six views), today/week jumper, master-vs-personal toggle, search, to-do panel toggle, profile menu.
- **Left side panel (collapsible):** subject filter, unit filter, completion status filter, standards filter, holiday/Ramadan toggle.
- **Main canvas:** the active view.
- **Right side panel (collapsible, contextual):** details for selected lesson — directions, notes, resources, standards, completion status. The right side also hosts the **to-do slide-out** (a separate panel toggled from the top bar).

For Grade 5–only launch, the grade switcher is hidden if the teacher is assigned to only one grade.

### 3.3 Master vs. Personal mode

- A single toggle in the top bar: **Personal | Master**. This is the **only** way to flip between personal and master in any view. There are no separate "Daily Master" or "Daily Personal" views — the toggle does that work.
- **Personal mode** (default): shows personal-where-exists, master-as-fallback. Edits write to personal (auto-forking from master if needed).
- **Master mode**: shows only master content. Editing requires pressing an additional "Now editing master" button to enable writes. A clear banner displays at the top.
- **Visual marker:** in Personal mode, each lesson is tagged with a small indicator showing whether it's a personal-fork (e.g., a small dot or "M" badge) or unedited master (no badge).

---

## 4. Data Model

### 4.1 Entity overview

```
GradeLevel ──< TeacherGradeAssignment >── Teacher ──< TeacherUIState (one per teacher)
     │                                       │
     │                                       └──< Personal Copy ──> Master Lesson
     │                                                 │
     │                                                 └──< Completion Status
     │
School Year (school-wide) ──< Unit (grade-scoped) ──< Lesson ──< Resource (link or file)
                                              ├──< Standard (CCSS, grade-scoped)
                                              ├──< Direction (collapsible body)
                                              └──< Notes (hover-revealed body)

Day ──< Time Block (per teacher, per grade) ──> Lesson | Non-academic block

Daily Note ──< Day (grade-scoped, shared or personal, with priority level)

ToDo ──< Tag (color-coded, grade-scoped if team, teacher-scoped if personal)
   └─ scope: personal | team
   └─ optional: due_date, linked_lesson_or_unit_or_resource
```

### 4.2 Entity definitions

**GradeLevel**
- `id`, `name` (e.g. "Kindergarten", "Grade 1", "Grade 5", "Grade 6")
- `display_order`, `is_active` (only Grade 5 = true at launch)

**Teacher**
- `id`, `email`, `display_name`
- `preferences`: default view, completion-privacy (`private` | `shared`), default `grade_level_id` (the one shown on login)
- Role is granted per-grade via `TeacherGradeAssignment`, not on the teacher record itself.

**TeacherGradeAssignment** (junction)
- `teacher_id`, `grade_level_id`
- `role`: `teacher` | `lead` (per grade)
- A teacher can be assigned to multiple grades; role can differ per grade.

**School Year**
- `id`, `label` (e.g. "2025–2026"), `start_date`, `end_date`, `weeks` (40), `is_active`
- `holidays`: array of dates
- `ramadan_range`: optional `{start, end}` for the Ramadan timetable override

**Subject**
- `id`, **`grade_level_id`**, `name`, `parent_id` (null, or e.g. Literacy → Reading)
- `default_pacing`: `synchronized` | `self_paced`
- `color`: from a fixed team-wide palette (see §6.2)
- `display_order`
- Subjects are grade-scoped: Grade 5's "Math" and Grade 3's "Math" are separate records.

**Unit**
- `id`, **`grade_level_id`**, `subject_id`, `school_year_id`, `name`, `summary`, `start_week`, `end_week`
- `pacing_override`: optional, overrides the subject's default pacing for this unit only

**Master Lesson**
- `id`, `unit_id` (which carries grade_level_id transitively), `subject_id`, `week_number`, `day_of_week` (`sun`–`thu`)
- `title`, `directions` (rich text, collapsed by default in UI)
- `notes` (rich text, hover-revealed in UI)
- `resources`: array of `{type, url, label}` where type is `pdf | image | doc | youtube | slides | website | other`
- `standards`: array of standard IDs (CCSS or other)
- `display_order_within_day`

**Personal Lesson Copy**
- `id`, `teacher_id`, `master_lesson_id`, `forked_at`
- All fields from Master Lesson (independent copy)
- `is_diverged_from_master`: boolean
- `pending_master_updates`: array of `{change_type, master_field, master_value, queued_at}` — awaiting teacher's accept/reject

**Standard**
- `id`, **`grade_level_id`**, `code` (e.g. "CCSS.5.NBT.B.5"), `description`, `taxonomy` (`ccss` | `sel` | `school_local`)
- Standards are grade-scoped. Standards pickers filter to the active grade.

**Completion Status**
- `teacher_id`, `lesson_id` (master OR personal — fork-aware)
- `status`: `not_done | done | skipped | carried_over | partial`
- `updated_at`
- `is_public`: derived from teacher's privacy preference

**Daily Note**
- `id`, **`grade_level_id`**, `date`, `priority` (`urgent | important | fyi`)
- `scope`: `shared | personal`
- `author_id`, `body`, `created_at`
- Shared notes are scoped to a single grade level's team.

**Time Block (Schedule View)**
- `id`, `teacher_id`, **`grade_level_id`**, `day_of_week`, `start_time`, `end_time`
- `type`: `academic | non_academic`
- `subject_id` (null for non-academic)
- `label` (e.g. "Lunch", "PE", "Arabic", "Math")
- `ramadan_variant`: alternate `{start_time, end_time}` used when Ramadan mode is on
- A teacher assigned to multiple grades has independent time blocks per grade.

**ToDo**
- `id`, `title`, `description` (optional)
- `scope`: `personal | team`
- **`grade_level_id`** (team scope: scoped to grade; personal scope: teacher's currently active grade at creation, optional cross-grade visibility)
- `author_id` (teacher who created it)
- `assignee_id` (optional, team scope only)
- `due_date` (optional — null means "no date")
- `priority` (optional): `urgent | important | fyi` — reuses daily-notes priority palette
- `tags`: array of Tag IDs
- `linked_entity` (optional): `{type, id}` where type is `lesson | unit | resource`
- `is_complete`: boolean
- `completed_by_id`, `completed_at` (null if not complete)
- `created_at`, `updated_at`

**Tag**
- `id`, `name`, `color` (from a palette of ~10 distinct colors)
- `scope`: `personal | team`
- **`grade_level_id`** (team tags scoped to a grade; personal tags can be cross-grade for the teacher)
- `owner_id` (teacher_id for personal tags; null for team tags)
- Team tags are managed by `lead` role; personal tags by the owning teacher

**TeacherUIState**
- `teacher_id` (one row per teacher, upserted on change)
- `expanded_lesson_ids`: array of lesson IDs currently expanded (Weekly / Subject / Unit views)
- `last_active_view`: which view the teacher had open last (`daily | weekly | schedule | unit | subject | year`)
- `last_active_grade_level_id`: which grade was active last (for multi-grade teachers)
- `filter_state`: JSON blob holding the teacher's active filter selections per view (subject filter, unit filter, completion filter, tag filter, etc.)
- `panel_state`: JSON blob holding left/right panel open/closed states, to-do slide-out open/closed, etc.
- `updated_at`
- **Sync behavior:** writes are **debounced ~500ms** after the last interaction to avoid hammering the database on rapid clicks. Reads happen once on login/view-mount and via realtime subscription for cross-device sync (teacher's laptop and iPad stay in sync within a second or two of each other).
- **Why server-side, not localStorage:** teachers frequently switch between laptop (planning at home) and iPad (in classroom). Expansion state, filters, and active view should follow them across devices.

### 4.3 Fork-and-merge semantics

- **Lazy forking.** Personal copies materialize only when a teacher first edits a master lesson in personal mode. Until then, all reads in personal mode pass through to master.
- **Divergence tracking.** When master is edited after a personal copy was forked, the personal copy stays unchanged but a `pending_master_updates` record is queued.
- **Merge UX.** Teacher sees a notification badge (count of pending updates). Clicking shows a per-change diff with Accept / Reject buttons.
- **No three-way merge.** If a teacher edits the same field on personal that master later changes, the teacher sees "Master also changed this field — your version, master's version, choose one."

### 4.4 Year rollover

- Marking the year complete archives the current `School Year` record (read-only).
- Creating a new year clones the master plan structure (units, lessons, standards, resource links) into a new `School Year` record with empty completion statuses and no personal copies.
- Teachers' personal copies from previous years are kept archived but not active.

---

## 5. Screen-by-Screen Specifications

> Each screen is described well enough that Claude Design can prototype it and Claude Code can build it. Visual specifics (colors, fonts) live in §6.

### 5.1 Login / Sign-up
- Single button: "Sign in with Google."
- (Optional) domain restriction message: "Use your @school.edu.qa account."

### 5.2 Weekly view (default)
**Layout:**
- Top: school-year selector, week-of-N navigator (with prev/next), master/personal toggle, view-switcher, search.
- Daily notes banner row: 5 columns (Sun–Thu) with shared notes on top, personal underneath, color-coded by priority.
- Main grid:
  - Rows = subjects (in display order). Literacy parent row is expandable into its four strands.
  - Columns = Sun, Mon, Tue, Wed, Thu.
  - Cells contain 0 or more lesson cards. Variable cell height to accommodate ~7 subjects, with horizontal scroll if needed.
- Each lesson card shows, in its **collapsed (default) state**:
  - Title
  - Subject color stripe (left edge)
  - **Preview paragraph** — a meaningful 2–3 line summary of the lesson, drawn from the first portion of the lesson's directions field (auto-truncated with ellipsis). Long enough to convey what the lesson is actually about at a glance, not just its name. ~140–200 characters visible.
  - Completion checkbox
  - Standards count badge
  - Resource icons (one per attached resource)
  - "Personal" indicator if it's a fork
- Cards are draggable to other days, weeks, or units.

**Card expansion (weekly view specific):**
- Click a lesson card to **expand it inline within its grid cell** — directions appear (still collapsible), notes accessible, resources listed, standards visible. Card grows downward; adjacent cards in the same column reflow.
- **Expanded cards stay open until explicitly closed.** Opening one card does NOT close others — teachers can have multiple cards expanded across the grid simultaneously. This lets a teacher open Monday's math + Wednesday's writing + Thursday's science and compare them side by side.
- To close an expanded card: click its collapse caret/chevron, click the card's header again, or press Esc (which closes the last-focused expanded card).
- **Expansion state persists per-teacher across devices.** State is stored server-side (see §4.2 `TeacherUIState`), so a teacher who expands three cards on her laptop sees those same three expanded when she opens the planner on her classroom iPad. Sync is debounced (~500ms after the last interaction) to avoid hammering the database.
- The right-side detail panel is **not** the primary detail surface for the weekly view — inline expansion is. (Right panel is the surface for Daily view.)

**Right-click context menu** (also accessible via a "⋯" affordance on hover for touch/keyboard users):
- Move to → submenu of week / day / unit targets
- Duplicate
- Copy to my personal (or Reset to master, if already a personal fork)
- Mark status → done / skipped / carried over / partial / not done
- Add to to-do list (creates a linked to-do)
- Delete (master mode only, with confirmation)
- See standards
- Print this lesson

**Filters (left side panel):**
- Subject (checkboxes)
- Unit (checkboxes)
- Completion status (multi-select)
- Standards (typeahead)
- "Show only uncovered" toggle (the catch-up filter)

**Header callouts:**
- "🔥 N items not covered" badge if catch-up filter would find something.
- Holiday markers as week-row backgrounds.
- Ramadan ribbon if active.

### 5.3 Daily view

**Two-pane layout (different from weekly's inline-expand pattern):**
- **Left pane:** list of the day's subjects in display order. Each item shows subject color stripe, lesson title, and a completion checkbox. Click to select.
- **Right pane:** has **one job at a time** — either lesson detail, or the Today dashboard. Never mixed.

**Right pane states:**
- **Lesson selected:** full lesson detail — directions (collapsible), notes (hover-revealed), resources, standards, completion controls.
- **Nothing selected (Today dashboard):** read-only summary of the day, with quick-add inputs:
  - Today's daily notes (shared on top, personal underneath) + quick-add input
  - Today's to-dos: a read-only slice of items dated today or in the "Today" bucket (personal and team) + quick-add input
  - Daily completion summary (X of Y subjects done, % remaining)
  - Note: full to-do management is in the slide-out panel, not here. The dashboard surfaces today's items; it does not replace the to-do panel.

**Top of view:**
- Daily Notes banner (shared + personal, all three priority levels) is also displayed inline with the day for context.

**Default selection on open:** first not-yet-done subject.

**Personal vs. Master:** controlled by the top-bar toggle. Same view, same layout, different data source.

**Mobile / narrow screens:** Left pane collapses to a header dropdown; right pane fills the screen.

### 5.4 Schedule view

**Two-pane layout:**
- **Left pane:** vertical timeline of the teacher's day, in real time slots. Each slot shows time range, label, and (for academic blocks) lesson title + completion checkbox. Non-academic blocks (lunch, recess, PE, Arabic) display with neutral styling.
- **Right pane:** has **one job at a time**:
  - **Academic block selected** → full lesson detail.
  - **Non-academic block selected** → notes editor for that block (notes only, no curriculum).
  - **Nothing selected** → Today dashboard (same content as Daily view's dashboard).

**Highlighting:**
- The current/next time block is highlighted in the left pane based on the **individual teacher's clock**, per-teacher (not a team-wide indicator).

**Default selection on open:** the time block that matches the current time of day.

**Source-of-truth rules (reaffirmed):**
- Defaults to personal copy where one exists; falls back to master.
- Edits write to personal only (auto-fork from master on first edit).
- Master is unreachable from this view.

**Ramadan mode:** A toggle (or auto-detected by date range) swaps in the alternate timings; left pane reflows accordingly.

**Mobile / narrow screens:** Left collapses to dropdown; right fills screen.

### 5.5 Unit view
- Header: unit name, subject, weeks covered, completion summary (% per teacher).
- Unit summary panel (editable in master mode).
- List of all lessons in the unit, grouped by week.
- "Copy unit to my personal" action.
- Master-change notification banner if personal copy exists and master has changed.
- Standards coverage map: visual showing which CCSS codes are touched in this unit.

### 5.6 Subject view
- Header: subject name, total lessons, completion %, total resources.
- Time-period filter: All / Unit / Month / Week.
- Grouped lesson list (by unit or by week, toggleable).
- Resource browser: all resources for this subject in one filterable list (Phase 2 expands this to file previews).

### 5.7 Year view
- 40-week calendar grid.
- One row per subject (parent rows; can expand into strands).
- Each cell = one week of one subject = the unit currently active that week.
- Holiday weeks visually marked.
- Drag-and-drop to reshuffle units across the calendar.

### 5.8 Standards browser
- Searchable list of all CCSS / SEL / school-local standards.
- Click a standard to see all lessons currently tagged with it.
- Used both for adding tags to lessons (typeahead) and for browsing.

### 5.9 Print preview
- Templates: Daily / Weekly / Unit.
- Toggle: include standards / include notes / include resource links / personal vs. master version.
- Optimized for letter / A4 paper.

### 5.10 Settings
- Profile: name, default view, default grade level, completion-privacy.
- Year management: active year, archive year, start new year.
- Subject management (lead role only, per grade): add / remove / reorder subjects, edit colors.
- Time-block setup: define teacher's daily schedule (and Ramadan variant), per grade if multi-grade.
- Master change log (lead role only): audit trail of all master edits.
- Tag management: create / rename / recolor / delete personal tags. Lead role manages team tags per grade.
- **Grade-level management** (admin / school lead only): activate or deactivate grade levels, assign teachers to grades, assign lead roles per grade.

### 5.11 To-Do panel and view

**The slide-out panel is the full to-do management surface.** This is where filtering, scoping, editing, bulk actions, and tagging happen. Today's to-dos also appear in the Daily/Schedule view's Today dashboard as a read-only slice for at-a-glance use — but management itself lives here.

**Slide-out panel (primary access):**
- Toggled from a checklist icon in the top bar, slides in from the right.
- Two tabs at top: **Mine** | **Team**.
- **Scope filter chips (one-click time scoping):** `Today` | `This week` | `This month` | `No date` | `All`. Mutually exclusive (one active at a time).
- **Tag filter:** typeahead + color chips. Multiple tags selectable (OR semantics).
- Below filters: a quick-add input ("Add a task…" with Enter to save). Optional date, tag, and priority pickers appear when the user clicks an expand caret.
- Body: list of to-do items, sorted by due date (no-date items at the bottom of the active view).
- Each item shows: checkbox, title, tag color dot(s), due date if any, linked-entity icon if any, and (on team list) "✅ done by Sarah" attribution when complete.
- Hover an item to reveal: edit, delete, link-to-lesson, assign-to-teammate (team scope).

**Full-screen To-Do view:**
- Optional expand button on the slide-out opens a dedicated page with the same data, wider layout, and bulk-action support (multi-select, mark several complete, bulk re-tag).
- This is the power-user surface; daily use is via the slide-out.

**Today dashboard (in Daily and Schedule views):**
- A **read-only summary**, not a management surface. Shows today's to-dos (personal + team, dated today or in the "Today" bucket) with completion checkboxes and a quick-add input.
- Full editing, scoping, filtering, and tag management happen in the slide-out — not in the dashboard.

**Acceptance behavior:**
- Anyone on the team can check off a team-list item; the system records who completed it.
- Personal items are private to the author; never visible to other teachers.
- Tags filter inclusively (multiple tags = OR); scope chips filter restrictively (one bucket at a time).

---

## 6. Visual Design System

> **Primarily for Claude Design.** This section locks the visual language so prototypes and production code share the same look.

### 6.1 Tone

- Clean, flat, calm — not playful. Teachers spend hours in this tool; visual noise becomes fatigue.
- High information density tolerated for power users, but progressive disclosure (collapsibles, hover reveals) keeps surfaces uncluttered.
- Color carries meaning, never decoration.

### 6.2 Color system

**Subject palette (one color per subject, team-wide, fixed):**
- Math — blue
- Reading — green
- Writing — purple
- Grammar — teal
- Spelling — pink
- UFLI — coral
- Explorers — amber
- SEL — gray

Subject colors appear as a left-edge stripe on every lesson card, on row headers, and on filter chips.

**Unit shading:** Within a subject's color, units cycle through three shade levels (light / medium / deep) of the same hue, so a teacher can tell Unit 1 from Unit 2 at a glance without changing the subject's identity color.

**Status / semantic colors:**
- Urgent (daily notes) — red, pulsing animation
- Important — yellow / amber background
- FYI — blue background
- Completed — green checkmark
- Uncovered / catch-up — flame-red badge
- Master-mode editing — red banner across the top of the screen

**Master / personal indicator:**
- A small dot or "M" badge on each lesson card showing personal-fork status. Subtle by design.

**Tag palette (for to-do tags):**
- A fixed set of ~10 distinct colors teachers can pick from when creating tags: red, orange, amber, green, teal, blue, indigo, purple, pink, gray.
- Visually distinct from the subject palette to avoid confusion (tags use rounded pills; subject stripes are flat bars).

### 6.3 Typography

- Sans-serif body, weights 400 and 500 only.
- Heading hierarchy: 22 / 18 / 16 / 14 / 12 px.
- Lesson titles 14px, weight 500.
- Lesson body text 13px, weight 400.
- Standards codes in mono font, 11px.

### 6.4 Components to design / prototype

Priority order for prototyping in Claude artifacts:

1. **Lesson card** (default state with **2–3 line preview paragraph from directions**, hover state, selected state, **expanded-inline state for grid views**, personal-vs-master indicator, completion checkbox, right-click context menu).
2. **Weekly grid** (3 sample weeks, all subjects, ~7 per day, fake data with drag-and-drop).
3. **Daily notes banner** (showing shared + personal, all 3 priority levels).
4. **Right-side detail panel** (lesson details with collapsible directions and hover-revealed notes).
5. **Subject view** (filtered list, resource browser sketch).
6. **Unit summary card** (header + summary + completion bar + standards coverage).
7. **Schedule view** (time-blocked timeline with academic + non-academic blocks).
8. **Master/personal toggle + editing-master banner** (the key safety UX).
9. **Catch-up filter affordance** (badge + filter activation flow).
10. **Print preview** (letter-size weekly plan).
11. **To-do slide-out panel** (Mine / Team tabs, Today/Week/Month/No date/All scope chips, tag filter, item list with completion checkboxes, quick-add).
12. **Two-pane Daily/Schedule layout** with single-purpose right pane — three states: lesson detail, notes editor (Schedule view's non-academic blocks only), Today dashboard.
13. **Today dashboard** (read-only daily summary: notes + today's to-dos + completion summary + quick-add).
14. **Grade-level switcher** in top bar (only visible when teacher is assigned to multiple grades).

### 6.5 Interaction patterns

- **Drag-and-drop:** lessons between days, weeks, units.
- **Lesson card expansion is view-dependent:**
  - In the **Weekly view**, clicking a card **expands it inline within its grid cell**. This keeps the teacher anchored in the week context.
  - In the **Daily view** and **Schedule view**, clicking a card **opens detail in the right pane** (per the two-pane layout). Inline expansion is not used in daily-shaped views.
  - In **Subject view** and **Unit view**, clicking a card expands inline within the list.
  - This per-view difference is intentional: weekly is grid-oriented and benefits from in-place expansion; daily is selection-oriented and benefits from a dedicated detail surface.
- **Expanded cards are sticky:** once opened, a card stays open until the teacher explicitly closes it (collapse caret, click header, or Esc). Multiple cards can be expanded simultaneously across a view. Expansion state is persisted **per-teacher across devices** via server-side `TeacherUIState` (§4.2) — a teacher's expanded cards on her laptop sync to her iPad and back.
- **Right-click context menu** is available on every lesson card across all views. Menu items:
  - Move to (week / day / unit)
  - Duplicate
  - Copy to my personal (or Reset to master if already a fork)
  - Mark status (done / skipped / carried over / partial / not done)
  - Add to to-do list (creates a linked to-do)
  - Delete (master mode only, with confirmation)
  - See standards
  - Print this lesson
- For touch and keyboard users, a "⋯" affordance appears on card hover/focus and opens the same menu.
- **Inline editing:** click a field, type, blur to save. No "Edit" buttons for routine edits.
- **Lesson card content disclosure tiers:**
  - **Collapsed (default)** — title, color stripe, 2–3 line preview paragraph (truncated from the directions field), completion checkbox, standards badge, resource icons. Always visible without interaction.
  - **Expanded (after click)** — full directions (still collapsible into deeper sub-sections if very long), notes (hover-revealed), full resource list, full standards list. View-dependent location: inline in grid views, right pane in daily views.
- **Collapsibles:** Directions collapsed by default; click to expand.
- **Hover reveals:** Notes hidden; hover surfaces an icon; click expands. (Iterate if it feels too hidden in practice.)
- **Filters:** persistent across view switches within a session.
- **Keyboard:** arrow keys to navigate the grid; Cmd/Ctrl-F to search; Esc to close detail panel or collapse expanded card; right-click works on focused card via the keyboard menu key.

---

## 7. Technical Architecture

> **Primarily for Claude Code.**

### 7.1 Stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend framework | Next.js (App Router) or React + Vite | Familiar React stack; Next.js gives API routes if needed later |
| Styling | Tailwind CSS | Fast, low-decision-cost styling |
| State / data fetching | TanStack Query | Caching, optimistic updates, easy realtime |
| Database | Supabase (Postgres) | Free tier; rich relational queries; row-level security |
| Authentication | Supabase Auth (Google SSO) | Built into Supabase; ~10 lines of integration code |
| File storage (Phase 2) | Supabase Storage (1GB free) → Cloudflare R2 (10GB free) if outgrown | Pluggable |
| Code hosting | GitHub | Existing workflow |
| Deployment | Cloudflare Pages | Free, fast, GitHub integration; aligned with MathQuest setup pattern |
| Public site | Squarespace (existing) | Links out to planner via subdomain |

### 7.2 Repository structure

```
/planner-app
  /app                 — Next.js routes
    /(auth)            — login flow
    /weekly            — weekly view
    /daily             — daily view
    /schedule          — schedule view
    /unit/[id]         — unit detail
    /subject/[id]      — subject detail
    /year              — year overview
    /settings          — settings
    /api/*             — server routes if needed
  /components          — shared React components
    /lesson-card
    /grid
    /filters
    /panels
    /print-templates
  /lib
    /supabase          — client + queries
    /standards         — CCSS taxonomy data
    /utils
  /styles              — Tailwind config, globals
  /public              — static assets
  /docs                — this planning doc, conversation record
```

### 7.3 Authentication flow

1. Teacher hits the app URL.
2. Redirected to Supabase-hosted Google OAuth flow.
3. (Optional) email domain check; reject non-school accounts.
4. On first login, a `Teacher` row is created with default preferences.
5. Session persists via Supabase cookie.

### 7.4 Realtime considerations

- Supabase supports realtime subscriptions to Postgres changes.
- Use realtime for: daily notes (immediate visibility across team), master-change notifications, completion status (if shared mode), **TeacherUIState (cross-device sync of expansion / filters / active view)**.
- Skip realtime for: most lesson edits (low-collision, optimistic updates suffice).
- Writes to `TeacherUIState` are debounced ~500ms to avoid one-write-per-click spam.

### 7.5 Row-level security (RLS)

All policies are grade-scoped: a teacher only sees data for the grade(s) they're assigned to.

- A teacher can read master lessons, master units, subjects, standards, daily notes (shared), team to-dos, and team tags **for any grade they are assigned to**.
- A teacher can read/write only their own personal copies, completion records, personal notes, personal to-dos, and personal tags.
- Only `lead` role **for a given grade** can write to that grade's master content (lessons, units, subjects, team tags, team to-dos as creator/admin).
- School-wide admins (separate role, if/when needed) can manage `GradeLevel`, `TeacherGradeAssignment`, and `SchoolYear` records.
- Daily notes: shared notes readable by all teachers in the grade-level team; personal notes readable only by author.
- Completion records honor `is_public` based on each teacher's privacy preference.

### 7.6 Print pipeline

- Browser-native `window.print()` triggered from print preview pages.
- Dedicated `@media print` Tailwind classes per template.
- No server-side PDF rendering needed for Phase 1.

### 7.7 Performance budget

- Weekly view first paint < 1.5s on a school Chromebook.
- Lesson card hover/click responses < 50ms.
- Drag-and-drop frame rate ≥ 50 fps.
- Catch-up filter applies in < 200ms across all 40 weeks.

---

## 8. Phased Roadmap

### Phase 1 — Core planner (4–6 weeks)

**Replaces:** Week-by-week Google Doc (#2) + Focus doc (#3) + Standards doc (#4).

- Auth + teacher profiles.
- School year + units + subjects setup.
- Master lessons: weekly view + daily view + subject view.
- Standards (CCSS preloaded) with manual tagging and mouseover.
- Drag-and-drop lessons between days.
- Daily notes (shared + personal, three priority levels).
- Resource links (paste a URL, auto-hyperlink, no file uploads).
- Color by subject + unit shading.
- Completion checkboxes + catch-up filter.
- Personal notes per lesson (small text field, no full forking yet).
- **To-do lists** — personal + team, with optional dates (date buckets: Today / This week / No date), tags with color, slide-out panel, full-screen view, embedded preview in daily view.
- **Two-pane layout for Daily view** (left list + right detail) with command-center empty state.
- **Multi-grade data model** baked in: `GradeLevel`, `TeacherGradeAssignment`, grade-scoped foreign keys, RLS rules. Grade 5 is the only active grade at launch; grade switcher hidden when a teacher belongs to only one grade.
- Print stylesheet: weekly view.

**Out of Phase 1:** Schedule view, full personal-copy forking, master-change notifications, year rollover, unit dashboards, file uploads, annotation, auto-tagging.

### Phase 2 — Fork, copy, schedule (4–6 weeks)

**Replaces:** Personal teacher copies (#5) + adds unit-level structure.

- Personal copies with lazy forking.
- Master-vs-personal toggle in top bar.
- Master-change notifications + accept/reject flow.
- Master-editing mode + safety banner.
- Schedule view (time blocks + non-academic blocks + Ramadan toggle).
- Unit view + unit summaries.
- Year view (40-week reshuffleable).
- Print templates: daily + unit.
- Year rollover (archive + clone structure).
- Auto-tagging suggestions for standards (Claude API).
- Holiday display.

### Phase 3 — Resources, annotation, hosting (open-ended)

**Replaces:** Padlets (#1).

- File uploads to Supabase Storage / Cloudflare R2.
- In-app preview of PDFs, images, docs, embedded YouTube and Slides.
- PDF annotation (PDF.js + canvas overlay).
- Image annotation + whiteboard mode.
- Vertical CCSS alignment (Grade 4 / 6 view).
- Audit trail for master changes.
- Anonymous team coverage view (aggregate completion).

### Phase 4 — Polish & expansion (TBD)

- Substitute mode (read-only printable bundle for a sub).
- Parent-share links (read-only excerpts of a week).
- Mobile responsive refinements.
- Multi-grade-level support (if the school expands the tool beyond Grade 5).

---

## 9. Acceptance Criteria

> Each phase ships when these criteria are met. Use as a checklist.

### Phase 1 acceptance

- [ ] All teachers can log in via Google SSO.
- [ ] The team's existing year of master lessons is imported (or recreated) and viewable.
- [ ] Weekly view renders Sun–Thu × ~7 subjects with no horizontal-scroll surprises on a 1366-wide screen.
- [ ] Drag-and-drop moves a lesson between days, with state persisting across reloads.
- [ ] Lesson cards in collapsed state show a 2–3 line preview paragraph drawn from the lesson's directions field, not just a title.
- [ ] Clicking a lesson card in the Weekly view expands it inline; expanded cards stay open until explicitly closed (collapse control or Esc); multiple cards can be expanded simultaneously; expansion state syncs **across devices** for the same teacher via `TeacherUIState` (open three cards on laptop → see same three open on iPad within ~2 seconds).
- [ ] Clicking a lesson card in Daily or Schedule view opens detail in the right pane (no inline expansion).
- [ ] Right-clicking a lesson card opens a context menu with Move to / Duplicate / Mark status / Add to to-do / See standards / Print options.
- [ ] Right-click context menu is also reachable via a "⋯" hover affordance for touch and keyboard users.
- [ ] Subject color stripes + unit shading are visible and consistent across all views.
- [ ] CCSS code shows on hover; click opens standard details.
- [ ] Completion checkbox toggles state, persists, and respects per-teacher privacy.
- [ ] Catch-up filter surfaces uncovered items accurately.
- [ ] Daily notes display with correct priority styling, and shared/personal scoping.
- [ ] To-do slide-out opens from any view; Mine and Team tabs work independently.
- [ ] Date-bucket filters (Today / This week / No date) accurately scope the visible items.
- [ ] Tag creation, color assignment, and tag-based filtering work for both personal and team scopes.
- [ ] Checking off a team item attributes completion to the correct teacher and is visible team-wide in real time.
- [ ] To-do slide-out has scope chips (Today / This week / This month / No date / All); chips are mutually exclusive.
- [ ] Daily view renders the two-pane layout; selecting a subject on the left fills the right pane with that lesson's detail.
- [ ] Daily and Schedule view right panes show the Today dashboard (read-only) when no lesson/block is selected.
- [ ] Today dashboard does NOT include to-do filtering or scope controls — those live only in the slide-out panel.
- [ ] Personal/Master toggle in the top bar changes data source in every view (including Daily); no "Daily Master" or "Daily Personal" view exists separately.
- [ ] Schedule view auto-highlights the current time block based on the individual teacher's clock.
- [ ] All Phase 1 data tables include `grade_level_id` where applicable; queries filter by active grade automatically.
- [ ] RLS policies prevent any teacher from reading data outside the grades they're assigned to.
- [ ] Grade switcher in top bar is hidden for single-grade teachers (most users at launch).
- [ ] Weekly view prints cleanly on letter or A4.
- [ ] Lighthouse score ≥ 85 on the weekly view.

### Phase 2 acceptance

- [ ] Personal copy auto-creates on first edit in personal mode.
- [ ] Master-mode banner is unmissable; editing master requires explicit "Now editing master" confirmation.
- [ ] Master changes queue notifications on diverged personal copies, with per-change accept/reject.
- [ ] Schedule view auto-slots lessons into the correct time blocks for the teacher's day.
- [ ] Ramadan toggle swaps time blocks and persists.
- [ ] Unit dashboard shows summary, completion %, and standards coverage map.
- [ ] Year rollover archives current year and seeds the next year without manual reentry.

### Phase 3 acceptance

- [ ] PDFs and images upload, preview inline, and can be annotated.
- [ ] Annotated copies save to the resource record.
- [ ] Whiteboard mode is reachable from any displayed resource.

---

## 10. Open Questions

Resolve these before Phase 1 build kickoff. Each blocks at least one design or technical decision.

| # | Question | Affects | Recommendation |
|---|---|---|---|
| 1 | Who can enter "Editing master" mode — anyone, or restricted to `lead` role? | RBAC, RLS policies | Lead role only; reduces risk of accidental master edits. |
| 2 | Color scheme: subject = primary color + unit shading, OR subject color + unit ribbon at top of week? | Visual design language | Start with subject + shading (cleaner). Iterate after prototype review. |
| 3 | Auth domain restriction enabled? | Supabase config | Yes — restrict to school's Google Workspace domain. |
| 4 | Year rollover: clone full master structure, or just unit skeletons? | Year-end workflow | Clone full master (units + lessons + standards + resource links); empty completion and personal copies. |
| 5 | Master-change merge prompt UX: live banner, sidebar queue, on-next-login dialog? | Notifications system | Sidebar queue with badge count; teacher reviews when ready. No interruption mid-edit. |
| 6 | Auto-tagging standards: Phase 2 or Phase 3? | Phase 2 scope, API cost | Phase 2 — small per-lesson cost, high time savings. |
| 7 | Concurrent master editing: last-write-wins, conflict warning, or row-level lock? | Concurrency model | Last-write-wins with a "Sarah is also editing this lesson" presence indicator (via Supabase realtime presence). |
| 8 | Default view per teacher: configurable now, or hard-default to weekly? | Settings scope | Configurable from Phase 1. Cheap to build. |
| 9 | Single school year active at a time, or can teachers toggle between past years? | Data model + UI | One active year; archived years read-only and accessed from Settings. |
| 10 | Print: server-rendered PDF, or browser print only? | Print pipeline complexity | Browser print only in Phase 1–2. Server PDF if needed in Phase 3. |

---

## 11. Glossary

| Term | Definition |
|---|---|
| **Master** | The official team-wide curriculum plan. Single source of truth. Edited only in master mode. |
| **Personal copy** | A teacher's forked version of a master lesson, unit, or week. Default editing target. |
| **Lazy fork** | A personal copy materializes only when a teacher first edits a master lesson, not before. |
| **Synchronized subject** | All teachers teach the same lesson the same week (Math, Writing, Reading, Grammar, Explorers, SEL). |
| **Self-paced subject** | Each teacher's class moves at its own pace through the lesson sequence (UFLI; sometimes Spelling). |
| **Strand** | A sub-subject under a parent (Reading, Writing, Grammar, Spelling are strands under Literacy). |
| **Unit** | A coherent block of weeks within a subject. Variable length, redefined each year. |
| **Daily Note** | A per-day reminder (urgent / important / fyi), either shared with team or personal. |
| **Catch-up filter** | "Show only uncovered" toggle in any view, surfaces missed/incomplete items. |
| **Schedule View** | Time-blocked daily timeline including non-academic periods (lunch, PE, Arabic, recess). |
| **Ramadan mode** | Toggle that swaps in shortened 30-minute class times for the Ramadan date range. |
| **CCSS** | Common Core State Standards — the primary standards taxonomy used. |
| **Editing master** | The explicit mode required to make changes to the master plan. Requires confirmation button. |
| **Carryover** | A status indicating a lesson was meant to be taught but wasn't, and has been rescheduled. |
| **To-Do** | A task item (not a lesson) on either the personal or team running list. Optional date and tags. |
| **Tag** | A user-defined, color-coded label for grouping and filtering to-do items. Personal or team scoped. |
| **Date bucket** | The to-do filter scope: Today, This week, or No date. |
| **Grade level** | A teaching cohort (e.g., Grade 5). The app supports multiple grade levels in one database; only Grade 5 is active at launch. |
| **Teacher-grade assignment** | The junction record linking a teacher to a grade with a specific role (teacher or lead). A teacher can be assigned to multiple grades with different roles per grade. |
| **Two-pane daily layout** | The Daily and Schedule view layout: left list of subjects/time-blocks, right pane shows selected lesson detail, or notes editor (Schedule view's non-academic blocks), or the Today dashboard when nothing is selected. |
| **Today dashboard** | The right pane's "no selection" state in Daily and Schedule views — a **read-only** summary of today's daily notes, today's to-dos (slice of items dated today), and completion summary. Quick-add inputs are available; full management lives in the to-do slide-out. |
| **Single-purpose surface principle** | Each UI surface has one clear job at a time. Modes and toggles change content, not purpose. Filtering and management live in dedicated surfaces (slide-outs, settings), not in primary view panes. |
| **Inline expansion** | Weekly/Subject/Unit view pattern: clicking a lesson card expands its detail in place within the grid or list, keeping the teacher anchored in context. |
| **Right-pane detail** | Daily/Schedule view pattern: clicking a lesson card or time block opens its detail in the right pane. Replaces inline expansion in daily-shaped views. |
| **Context menu** | Right-click (or "⋯" affordance) menu on a lesson card: Move to, Duplicate, Mark status, Add to to-do, See standards, Print, and (in master mode) Delete. |
| **TeacherUIState** | Server-side per-teacher record holding ephemeral UI state (expanded cards, active filters, last view, panel open/closed). Syncs across devices via Supabase realtime; writes debounced ~500ms. |

---

*End of planning document. Companion document: `conversation_record.md`.*
