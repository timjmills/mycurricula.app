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
- File hosting for **lesson resources** (Phase 2) — note: small generated PDF/Excel files from the Export Center are stored from Phase 1.
- PDF / image annotation (Phase 3)
- Auto-tagging of standards (Phase 2+)
- Vertical CCSS alignment across grade levels (Phase 3+)
- Bilingual exports (Phase 2 if MOEHE templates require it)
- Custom branded PDF templates (Phase 2 — Phase 1 ships with one clean default template)

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

- **Top bar:** **grade-level switcher** (when multiple grades are active), view switcher (the six views), today/week jumper, master-vs-personal toggle, search, to-do panel toggle, **comments panel toggle (with unread badge)**, profile menu.
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
SchoolAdmin (school-wide, optional teacher link)
     │
GradeLevel ──< TeacherGradeAssignment >── Teacher ──< TeacherUIState (one per teacher)
     │                                       │
     │                                       └──< PersonalCoreLessonEventCopy ──> MasterCoreLessonEvent
     │                                                 │
     │                                                 └──< Completion Status
     │
     ├──< GradeFrameworkAssignment >── StandardsFramework ──< Standard
     │                                       (catalog or school_uploaded)
     │
School Year (school-wide) ──< Unit (grade-scoped) ──< CoreLessonEvent ──< Resource (link or file)
                                              ├──< Standard (any framework, multi-tag allowed)
                                              ├──< Direction (collapsible body)
                                              └──< Notes (hover-revealed body)

Day ──< Time Block (per teacher, per grade) ──< CoreLessonEvent | ExtraLessonEvent | DayEvent | Non-academic block
Day ──< DayEvent (assembly, drill, guest speaker — not curriculum)
Day ──< ExtraLessonEvent (one-off teaching activity outside the master curriculum)
Day ──< EventDayOrderOverride (per teacher, per date — orders all three event types in the sequence actually taught)

Daily Note ──< Day (grade-scoped, shared or personal, with priority level)

ToDo ──< Tag (color-coded, grade-scoped if team, teacher-scoped if personal)
   └─ scope: personal | team
   └─ optional: due_date, linked_event_or_unit_or_resource

SavedExport (snapshot mode only) ──> SchoolYear

Comment (anchored to CoreLessonEvent | ExtraLessonEvent | DayEvent | Unit | Resource | day_shoutbox date)
   └─ optional parent_comment_id (one level of nesting only)
   └─< CommentRead (per-teacher read state, drives unread badges)

CoverageSnapshot (nightly scheduled job: per school_year × grade × framework × subject)

AuditLog (append-only, every mutation writes a row)
   ├─ actor: Teacher OR SchoolAdmin
   ├─ scope: grade-level OR school-wide
   └─ entity: core_lesson_event | extra_lesson_event | day_event | unit | export | role | grade | framework | ...
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
- `role`: `teacher` | `lead` | `grade_admin` (per grade)
  - `teacher` — standard access (default).
  - `lead` — can edit master content for this grade, manage team to-dos and team tags, delete saved exports for this grade.
  - `grade_admin` — superset of `lead`: can additionally view the audit log scoped to this grade, see aggregate completion across teammates, manage `TeacherGradeAssignment` records for this grade.
- A teacher can be assigned to multiple grades; role can differ per grade.

**SchoolAdmin** (separate role, not tied to grades)
- `id`, `teacher_id` (can be a teacher who is also a school admin, OR a standalone admin account with no grade assignment), `granted_at`, `granted_by_teacher_id`
- A school admin has **read-only access across all grades by default**, plus the ability to:
  - Manage `GradeLevel` records (activate/deactivate grades)
  - Manage `TeacherGradeAssignment` records school-wide
  - Manage `SchoolYear` records (start new year, archive, configure holidays/Ramadan)
  - View school-wide audit logs and system metrics
  - View (but not edit) any grade's master content
- School admins do not get write access to lesson content unless they also hold a `lead` or `grade_admin` role for that grade.
- **Why separate from `TeacherGradeAssignment`:** a school-wide admin (principal, IT coordinator, curriculum coordinator) may not teach any single grade, so they should not require a grade assignment to function. Conversely, a teacher who is also a school admin needs both records.

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

**MasterCoreLessonEvent**
- `id`, `unit_id` (which carries grade_level_id transitively), `subject_id`, `week_number`, `day_of_week` (`sun`–`thu`)
- `title`, `directions` (rich text, collapsed by default in UI)
- **`learning_objectives`** (rich text or array of strings — explicit learning objectives required for governing-authority exports; surfaced in PDF/Excel exports and on the lesson detail panel)
- `notes` (rich text, hover-revealed in UI)
- `resources`: array of `{type, url, label}` where type is `pdf | image | doc | youtube | slides | website | other`
- `standards`: array of standard IDs (CCSS or other)
- `display_order_within_day`

**PersonalCoreLessonEventCopy**
- `id`, `teacher_id`, `master_core_lesson_event_id`, `forked_at`
- All fields from MasterCoreLessonEvent (independent copy)
- `is_diverged_from_master`: boolean
- `pending_master_updates`: array of `{change_type, master_field, master_value, queued_at}` — awaiting teacher's accept/reject

**StandardsFramework**
- `id`, `name` (e.g. "Common Core State Standards", "Qatar MOEHE Standards", "International Baccalaureate Primary Years", "School EE Standards")
- `short_code` (e.g. "CCSS", "MOEHE", "IB-PYP", "EE") — used in tag display and the picker
- `jurisdiction` (e.g. "US national", "Qatar MOEHE", "International (IB)", "Custom — Acme School")
- `description`
- `provenance`: `catalog | school_uploaded`
  - **Catalog frameworks** are vetted and maintained by the planner's team (eventually a community library). Visible to all schools using the planner, read-only.
  - **School-uploaded frameworks** are uploaded by a school admin via CSV. Private to that school.
- `owner_school_id` (nullable; only populated when `provenance = school_uploaded`)
- `color`, `icon` — display metadata so tags can visually indicate their framework at a glance.
- `max_depth`: integer indicating hierarchy depth (e.g., 3 for CCSS-style domain → cluster → standard; 1 for flat frameworks). The standards picker uses this to decide how to render.
- `supports_languages`: array — `['en']` for Phase 1; ready for `['en', 'ar']` or others when bilingual UI ships.
- `is_active`: boolean — archived frameworks remain visible on historical lessons but don't appear in the picker.

**GradeFrameworkAssignment** (junction)
- `grade_level_id`, `framework_id`
- `display_order` (controls grouping order in the standards picker)
- One row per (grade, framework) combination this grade actually uses. A Grade 5 team using both CCSS and EE has two rows.

**Standard**
- `id`, **`framework_id`**, **`grade_level_id`** (nullable for cross-grade frameworks; usually set)
- `code` (e.g. "CCSS.5.NBT.B.5", "EE-5.2.1", "IB-PYP-LA-5") — unique within a framework
- `description` (rich text)
- `parent_standard_id` (nullable, self-referential — supports any hierarchy depth)
- `description_translations`: JSON keyed by language code (Phase 1: just `en`)
- `display_order_within_parent`
- Standards are queryable across frameworks but presented grouped by framework in the picker.

**Event-to-standards relationship (clarification)**
- The `CoreLessonEvent.standards`, `ExtraLessonEvent.standards`, and `DayEvent.standards` arrays can hold standard IDs from **any framework** simultaneously. A single Core Lesson Event in Math can be tagged with CCSS.5.NBT.B.5 + EE-5.2.1 + SEL-4.A at the same time.
- Each tag visibly carries its framework badge (small colored chip from the framework's color/icon).
- All three event types use the same standards-picker component for tagging.

**Completion Status**
- `teacher_id`, `core_lesson_event_id` (master OR personal — fork-aware)
- `status`: `not_done | done | skipped | carried_over | partial`
- `updated_at`
- `is_public`: derived from teacher's privacy preference

**Daily Note**
- `id`, **`grade_level_id`**, `date`, `priority` (`urgent | important | fyi`)
- `scope`: `shared | personal`
- `author_id`, `body`, `created_at`
- Shared notes are scoped to a single grade level's team.

**EventDayOrderOverride**
- `id`, `teacher_id`, `class_id` (or `grade_level_id` if class concept not yet introduced — see future-secondary section), `date`
- `ordered_event_refs`: array of `{event_type, event_id}` pairs in the order the teacher chose for that specific date. `event_type` is `core_lesson_event | extra_lesson_event | day_event`.
- `created_at`, `updated_at`
- **Lazy creation:** only written when a teacher actually reorders. Until then, the master `display_order_within_day` applies for core lesson events, and extra lesson events / day events fall at the end in creation order.
- **Per-teacher, per-date.** Reordering on Tuesday Week 12 does NOT propagate to Tuesday Week 13. Reordering by one teacher does NOT affect a teammate's view. If permanent change is needed, that's a master edit.
- **Persistent history.** Overrides are never auto-deleted. They become part of the historical record — months later, viewing Tuesday Week 12 shows the order that was actually taught that day, not the master order. This makes the planner a teaching journal as well as a planner.
- **Covers all three event types.** Reordering can interleave Core Lesson Events, Extra Lesson Events, and Day Events in any sequence the teacher chooses.

**DayEvent**
- `id`, **`grade_level_id`**, `date`, `title` *(required — the only required field)*
- `description` (optional, longer text)
- `learning_objective` (optional — same field shape as on Lesson)
- `standards` (optional — array of standard IDs; can be from any framework assigned to the grade)
- `resources` (optional — array of `{type, url, label}`, same shape as Lesson resources)
- `time` (optional — null if all-day or untimed)
- `duration_minutes` (optional)
- `scope`: `team | personal`
- `author_id` (the teacher who created it)
- `event_type` (optional enum): `assembly | guest_speaker | drill | celebration | field_trip | teachable_moment | other`
- `is_complete`: boolean (defaults false; each event has its own completion checkbox)
- `completed_at`, `completed_by_id` (nullable)
- `created_at`, `updated_at`
- **Distinct from Lessons and ExtraLessonEvents.** A DayEvent is something that happens during the school day but is **not curriculum** — assembly, drill, guest speaker, birthday celebration, field trip. The standards/objective/resources fields exist for the rare case where an event genuinely maps to learning (a guest speaker's talk maps to a SEL standard) but are typically unused.
- **Authoring symmetry.** When a teacher adds anything to the day, they go through the same "+ Add to day" chooser (see §6.5). Day Events share the same authoring fields as Lessons — only `title` is required.
- **Appears in Daily View** at the end of the day's left-pane list (after academic blocks and any extra lesson events), in **Schedule View** as its own block (at assigned time or at end of day), and in **Weekly View** as a small banner at the bottom of each day column.
- **Exportable.** Day events are included in PDF and Excel exports by default (toggle present in the Export Center to exclude).
- **Auditable.** Every create / edit / delete / complete writes to the audit log.

**ExtraLessonEvent**
- `id`, `teacher_id` (or **`grade_level_id`** for team-wide extras), `date`, `title` *(required)*
- `description` (optional)
- `learning_objective` (optional)
- `standards` (optional — array of standard IDs from any framework)
- `resources` (optional — same shape as Lesson resources)
- `subject_id` (optional — many extras don't belong to a single subject)
- `time` (optional)
- `duration_minutes` (optional)
- `scope`: `team | personal` (defaults `personal` — most extras are a teacher's own ritual)
- `author_id`
- `is_complete`: boolean (own completion checkbox, independent of lessons)
- `completed_at`, `completed_by_id` (nullable)
- `created_at`, `updated_at`
- **What this is.** An Extra Lesson Event is a one-off teaching activity that is **not part of the master curriculum** — examples: a teacher's signature "closing circle," a one-off enrichment activity in response to a student question, an interdisciplinary moment that doesn't belong to a unit. Same authoring shape as a Lesson; different downstream behavior.
- **What it isn't.** Not master/personal forked (it's owned by the teacher who created it). Not part of a unit. Not driving the catch-up filter (since it isn't expected to be taught on a schedule). Not tied to a `unit_id` or `week_number`.
- **Templates (deferred).** Phase 2+: a teacher can save an Extra Lesson Event as a personal `ExtraLessonTemplate` so they can drop it into any future day with one click ("my Closing Circle template"). Not in Phase 1.
- **Appears alongside lessons** in Daily/Schedule/Weekly views, with a subtle visual marker (different border style or a small ✨ icon) indicating it's an extra, not a master-derived lesson.
- **Exportable.** Included in PDF/Excel exports by default, with a checkbox in the Export Center to toggle off if needed.
- **Auditable.** Every create / edit / delete / complete writes to the audit log.

**Time Block (Schedule View)**
- `id`, `teacher_id`, **`grade_level_id`**, `day_of_week`, `start_time`, `end_time`
- `type`: `academic | non_academic`
- `subject_id` (null for non-academic)
- `label` (e.g. "Lunch", "PE", "Arabic", "Math")
- `ramadan_variant`: alternate `{start_time, end_time}` used when Ramadan mode is on
- A teacher assigned to multiple grades has independent time blocks per grade.
- **Multiple events per block:** the relationship from Time Block to events is **one-to-many**, not one-to-one. A block can host two or more events — any combination of Core Lesson Events, Extra Lesson Events, and Day Events (e.g. combined Reading + Writing, parallel group rotations, co-teaching with a specialist, a lesson + a brief celebration). Each event in a multi-event slot retains its own completion status, standards, directions, and resources — they are presentationally grouped, not relationally merged. An event can be dragged out of a shared slot at any time into its own slot, with no effect on the other events. UI renders side-by-side for two events, stacked for three or more.

**ToDo**
- `id`, `title`, `description` (optional)
- `scope`: `personal | team`
- **`grade_level_id`** (team scope: scoped to grade; personal scope: teacher's currently active grade at creation, optional cross-grade visibility)
- `author_id` (teacher who created it)
- `assignee_id` (optional, team scope only)
- `due_date` (optional — null means "no date")
- `priority` (optional): `urgent | important | fyi` — reuses daily-notes priority palette
- `tags`: array of Tag IDs
- `linked_entity` (optional): `{type, id}` where type is `core_lesson_event | extra_lesson_event | day_event | unit | resource`
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
- `expanded_event_ids`: array of `{event_type, event_id}` pairs for events currently expanded (Weekly / Subject / Unit views). `event_type` is `core_lesson_event | extra_lesson_event | day_event`.
- `last_active_view`: which view the teacher had open last (`daily | weekly | schedule | unit | subject | year`)
- `last_active_grade_level_id`: which grade was active last (for multi-grade teachers)
- `filter_state`: JSON blob holding the teacher's active filter selections per view (subject filter, unit filter, completion filter, tag filter, etc.)
- `panel_state`: JSON blob holding left/right panel open/closed states, to-do slide-out open/closed, etc.
- `updated_at`
- **Sync behavior:** writes are **debounced ~500ms** after the last interaction to avoid hammering the database on rapid clicks. Reads happen once on login/view-mount and via realtime subscription for cross-device sync (teacher's laptop and iPad stay in sync within a second or two of each other).
- **Why server-side, not localStorage:** teachers frequently switch between laptop (planning at home) and iPad (in classroom). Expansion state, filters, and active view should follow them across devices.

**SavedExport**
- `id`, **`grade_level_id`**, `created_by_teacher_id`, `created_at`
- `format`: `pdf | excel`
- `scope`: `daily | weekly | unit | subject_year`
- `scope_params`: JSON identifying what was exported (e.g. `{week_number: 12}`, `{unit_id: "..."}`, `{subject_id: "...", school_year_id: "..."}`)
- `mode`: `live | snapshot` — `live` exports are not stored (downloaded and discarded); only `snapshot` records exist in this table
- `data_version`: `master | personal` (personal exports include the exporting teacher's diverged copies)
- `include_completion`: boolean (whether per-teacher completion status is rendered in the export)
- `file_url`: link to the generated file in Supabase Storage (snapshots only)
- `label`: optional teacher-supplied label ("End-of-Q2 MOEHE submission")
- **Retention:** snapshots persist indefinitely until manually deleted by a lead. Live exports are not retained.
- **Visibility:** snapshots are visible to all teachers in the same grade (so any teammate can re-download what was sent to admin).

**Comment**
- `id`, `author_id`, **`grade_level_id`**, `created_at`, `updated_at`
- `anchor_type`: `core_lesson_event | extra_lesson_event | day_event | unit | resource | day_shoutbox`
- `anchor_id`: the ID of the anchored entity. For `day_shoutbox`, this is the date (ISO string).
- `parent_comment_id`: nullable. Null for top-level comments; set for replies. **One level of nesting only** — replies cannot have replies.
- `body`: text. Plain text in Phase 1; rich-text upgrade possible later.
- `is_edited`: boolean, set true on any update after creation.
- `deleted_at`: nullable timestamp. Soft delete — body is replaced with "[Comment removed]" in the UI, but the row stays so reply threads keep their structure.
- **Visibility:** all comments are readable by every teacher in the comment's `grade_level_id`. No DMs, no private comments.
- **Edit/delete rules:** author can edit and delete their own. `lead` and `grade_admin` can delete (not edit) any comment in their grade. School admins can read but not edit/delete.
- **Day shoutbox auto-archive:** comments with `anchor_type = day_shoutbox` and an anchor date older than 7 days are still readable in the Comment Browser but are not displayed inline in the Daily View. A flag on the query handles this — no separate archive table.

**CommentRead** (per-teacher read state)
- `comment_id`, `teacher_id`, `read_at`
- One row per teacher per comment they have viewed. Drives the "unread" filter in the Comment Browser and the badge counts.
- Inserted lazily when a teacher's view actually rendered the comment in their viewport (intersection observer on the client).

**AuditLog**
- `id`, `timestamp`, `actor_teacher_id` (or `actor_admin_id`)
- **`grade_level_id`** (nullable — null for school-wide actions like grade activation)
- `action`: enum — `core_lesson_event_created | core_lesson_event_edited | master_edited | personal_forked | personal_reset_to_master | event_reordered | event_moved_into_slot | event_moved_out_of_slot | unit_created | unit_edited | subject_created | subject_edited | standard_tagged | completion_status_changed | daily_note_created | daily_note_deleted | day_event_created | day_event_edited | day_event_deleted | day_event_completed | extra_lesson_event_created | extra_lesson_event_edited | extra_lesson_event_deleted | extra_lesson_event_completed | framework_uploaded | framework_assigned_to_grade | framework_unassigned_from_grade | todo_created | todo_completed | todo_deleted | tag_created | tag_deleted | export_generated | export_deleted | comment_posted | comment_edited | comment_deleted | role_changed | grade_activated | grade_deactivated | teacher_assigned_to_grade | school_year_started | school_year_archived | login | settings_changed`
- `entity_type`: enum — `core_lesson_event | extra_lesson_event | day_event | unit | subject | standard | framework | grade_framework_assignment | coverage_snapshot | completion | daily_note | todo | tag | export | comment | role_assignment | grade_level | school_year | settings`
- `entity_id` (nullable)
- `metadata`: JSON — for edits, contains a before/after diff of changed fields; for status changes, the old and new status; for exports, the export params; for logins, IP/user-agent fingerprint
- **Write strategy:** every mutation writes one row, fire-and-forget (small server-side function or RPC, errors logged but don't block the user action). Reads come later, only from admin surfaces.
- **Indexes:** `(actor_teacher_id, timestamp DESC)`, `(grade_level_id, timestamp DESC)`, `(entity_type, entity_id)`. Add when query workloads materialize, not before.
- **Retention:** indefinite in Phase 1; revisit in Phase 3 once table grows beyond ~5M rows.
- **Why now:** building this in Phase 1 means a future admin section can show months of history. Adding it later means history starts the day the table is created — too late for any retrospective analysis.

**CoverageSnapshot**
- `id`, `school_year_id`, `grade_level_id`, `framework_id`, `subject_id` (nullable — null for cross-subject framework summaries), `snapshot_date`
- `total_standards` (count of standards in the framework × grade × subject scope)
- `standards_touched_count` (count tagged on at least one lesson, anywhere)
- `standards_touched_in_completed_lessons_count` (count tagged on a lesson that has status `done` for at least one teacher)
- `total_lessons_tagged` (sum of standard-tag instances across all lessons)
- `per_teacher_coverage`: JSON `{teacher_id: standards_touched_count}` — aggregated counts per teacher (for the "variance" admin report; admin UI defaults to aggregate, drill-in required to see per-teacher data)
- `metadata`: JSON room for additional metrics added in future phases
- **Computed once daily by a scheduled job.** Cheap to read at report time. Phase 1: write only, no UI reads. Phase 3+: backs the admin dashboards.
- **Retention:** indefinite. A row per (school_year, grade, framework, subject) per day is tiny — for one grade with 3 frameworks × 7 subjects × 365 days, ~7,665 rows per year. Negligible.

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
- **Within-day reordering:** in addition to inter-day drag, events can be dragged **up or down within their cell** to change their order for that specific day. Writes an `EventDayOrderOverride` for that teacher × date. The reordered sequence persists as historical record (never auto-cleared) — viewing Tuesday Week 12 months later shows the order that was actually taught.
- **Multi-lesson stacking:** if two or more lessons are scheduled in the same effective slot, they appear stacked within the cell, each with its own card, completion checkbox, and disclosure controls. Drag one out of the shared stack to separate them.
- **Day Events banner:** below each day's column (at the bottom, beneath all subject rows for that day) is a small banner listing any `DayEvent` records for that date. Each event shows its title, an event-type icon, and a completion checkbox if applicable. Click to expand for description; right-click to edit/delete (author or lead/grade_admin only).

**Card expansion (weekly view specific):**
- Click a lesson card to **expand it inline within its grid cell** — directions appear (still collapsible), notes accessible, resources listed, standards visible, **comment thread visible at the bottom**. Card grows downward; adjacent cards in the same column reflow.
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
- **Left pane:** list of the day's subjects in display order. Each item shows subject color stripe, event title, and a completion checkbox. Click to select. **Events can be reordered by dragging up or down** — this writes an `EventDayOrderOverride` for that teacher × date. The reordered sequence persists as part of the historical record (never auto-cleared).
- **Right pane:** has **one job at a time** — either lesson detail, or the Today dashboard. Never mixed.

**Day Events at the end of the left pane:**
- Below the academic-block list, a labeled section ("Today's Events") lists any `DayEvent` records for the current date.
- Quick-add input: "+ Add an event" → opens a small inline form (title, optional time, optional description, scope team/personal).
- Each event row shows its title, time if set, an icon for its event_type, and its own completion checkbox.
- Events stay visible historically — viewing Daily View for a past date shows events that occurred that day.

**Right pane states:**
- **Lesson selected:** full lesson detail — directions (collapsible), notes (hover-revealed), resources, standards, completion controls, **comment thread for this lesson at the bottom (top-level comments + one level of replies)**.
- **Nothing selected (Today dashboard):** read-only summary of the day, with quick-add inputs:
  - Today's daily notes (shared on top, personal underneath) + quick-add input
  - Today's to-dos: a read-only slice of items dated today or in the "Today" bucket (personal and team) + quick-add input
  - Daily completion summary (X of Y subjects done, % remaining)
  - Note: full to-do management is in the slide-out panel, not here. The dashboard surfaces today's items; it does not replace the to-do panel.

**Top of view:**
- Daily Notes banner (shared + personal, all three priority levels) is also displayed inline with the day for context.
- **Day shoutbox** appears immediately below the Daily Notes banner: a single team thread for the current day. Flat list (no threading), quick-add input at the bottom, author + timestamp on each post. Auto-archives from this inline view after 7 days (still readable in the Comment Browser).

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

**Time block reordering and multi-lesson slots:**
- Time blocks themselves are fixed by the teacher's master schedule (set in Settings) — they don't move around per day.
- **Events inside academic blocks can be dragged up or down within the day**, just like Daily View. This re-sequences which event is in which slot for that date only. Writes an `EventDayOrderOverride`.
- **A lesson can be dragged into a slot that already has a lesson.** The slot then shows both lessons side-by-side (two) or stacked (three+). Each lesson keeps its own completion checkbox, standards, directions, and resources — they are presentationally grouped, not merged.
- **A lesson can be dragged back out of a shared slot** into a different slot (or its own slot). The other lessons in the shared slot are unaffected.

**Day Events:**
- Day events appear inline in the timeline at their assigned time (if a time is set) or in a "Today's Events" section at the bottom of the left pane (if no time).
- Same quick-add affordance as Daily View.
- Same historical persistence — past dates still show their events.

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
- **Comment thread** at the bottom of the unit page (top-level + one level of replies). Anchored to the unit itself — separate from comments on individual lessons within the unit.

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

**Purpose:** searchable across all frameworks assigned to the active grade. Used as a typeahead picker when tagging lessons/events, AND as a full-screen browser for understanding what standards exist and what they cover.

**Layout:**
- **Top:** search box + filter chips for framework (multi-select; defaults to all frameworks active for this grade), subject (if applicable), standard hierarchy depth (top-level domains vs. deepest standards).
- **Body:** grouped list. Group header = framework name with its color/icon. Within each group, standards rendered as tree if the framework has hierarchy; flat list if `max_depth = 1`.
- Each standard row shows: code, description (truncated, expandable), tag count ("touched on N lessons this year").
- Click a standard → opens a side panel showing every lesson currently tagged with it (across master + personal, filterable by completion status). Useful for "show me every place we teach fractions."

**Standards picker (used inside lesson/event authoring):**
- Compact version of the browser: search box, framework-grouped results, click to add. Selected standards show as colored chips below the picker.
- Multiple frameworks selectable simultaneously — a single lesson can hold CCSS + EE + SEL tags at the same time, each visibly identified by framework color.

**Acceptance:**
- Picker returns results across all assigned frameworks within ~100ms for ≤5,000 standards.
- Each tag visibly shows its framework via color and short-code badge.
- Tagging a lesson with a standard creates a `standard_tagged` audit-log entry.

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
- **Standards frameworks management** (school admin only):
  - Browse catalog frameworks (CCSS, IB, NZ Curriculum, Cambridge, etc.) and enable them for the school.
  - Assign enabled frameworks to specific grades (e.g., "CCSS + EE for Grade 5; CCSS + Cambridge for Grade 7").
  - Upload custom frameworks via CSV — columns: `framework_short_code, code, description, parent_code, grade_level, language`. Phase 1: basic parse and insert. Phase 2: preview before commit, validation, edit-after-upload. Phase 3+: in-app standards editor.
  - View per-framework standards counts, last-updated date.
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

### 5.12 Export Center

Curriculum exports for school and governing-authority submission. Reachable from a top-bar **Export** icon and from a "Print / Export" item in any lesson's right-click context menu.

**Trigger surfaces:**
- Top-bar Export icon → opens the Export Center modal (full configuration).
- Right-click on a lesson card → "Export…" submenu (quick single-lesson PDF).
- "Export" button on Unit view header → pre-fills scope = this unit.
- "Export" button on Subject view header → pre-fills scope = this subject (with the active time-range filter applied).
- "Print preview" pages from §5.9 remain for ad-hoc browser printing; the Export Center is the **archival** export path with consistent layout.

**Modal layout (linear, top-to-bottom):**
1. **Scope** — radio buttons: Daily / Weekly / Unit / Subject (year) / Custom range.
2. **Scope params** — auto-shown based on choice: date picker (daily), week number (weekly), unit picker (unit), subject + school-year picker (subject), date range picker (custom).
3. **Format** — radio: PDF | Excel | Both.
4. **Data version** — Personal (this teacher's diverged copies + master fallback) | Master only.
5. **Content toggles** — checkboxes:
   - Include learning objectives (default on)
   - Include directions / lesson content (default on)
   - Include standards (default on)
   - Include resource links (default on)
   - Include completion status (default off — admins usually want the plan, not the per-teacher progress)
   - Include teacher notes (default off — private by nature)
   - **Include day events (default on)** — appends each day's events (assemblies, drills, guest speakers, teachable moments) to the corresponding date in the export.
6. **Mode** — Live (download once, not retained) | Snapshot (save to Reports library for re-download).
7. **Optional label** — text input shown only when Snapshot is selected.
8. **Preview** button → opens a side-pane preview rendered from the same template.
9. **Generate** button → produces the file(s) and triggers download. If Snapshot, also saves a `SavedExport` record.

**PDF layout (default template — Phase 1):**
- Cover page: school name, grade level, scope description (e.g. "Math — Unit 3: Fractions — Weeks 8–12"), generation date.
- One section per unit (if scope spans multiple), one subsection per week, one block per lesson.
- Each lesson block: title, day, learning objectives (bulleted), standards (CCSS codes + descriptions), directions (full text), resource links (URLs printed for reference).
- Page numbers and small footer ("Generated by [App Name] on [date]").
- Letter and A4 friendly.

**Excel layout (default — Phase 2):**
- One sheet, one row per lesson, columns: `Week | Day | Subject | Unit | Lesson Title | Learning Objectives | Standards (codes) | Standards (descriptions) | Directions | Resource Links | Completion Status (optional)`.
- Header row frozen. Auto-filter on. Resource links written as Excel hyperlinks.
- Wide cells, line-wrapped text — designed for an admin to scan and filter, not for visual polish.

**Reports library (Snapshot mode):**
- A section in Settings (visible to all grade-level teachers, manageable by leads) lists all saved exports.
- Columns: created date, format, scope, label, exporter, file size, download / delete.
- Delete restricted to leads.

**Acceptance behavior:**
- All exports include the lesson title, learning objectives, standards, and lesson content (per teacher's request).
- A Live export is generated on demand from current data; nothing is retained server-side.
- A Snapshot export is identical to a Live one at generation time, but the file is also persisted to `SavedExport` for later re-download.
- The "Personal" data version produces a PDF that reflects the exporting teacher's diverged copies; "Master only" reflects the team-wide master regardless of who exports it.

### 5.13 Admin section (Phase 3+ placeholder)

> **Status:** Data infrastructure ships in Phase 1; UI is a Phase 3 (or later) build. This subsection exists so the data model and architecture are designed correctly *now* — actual screens are not specified yet.

**Who sees it:**
- `SchoolAdmin` role holders (school principal, IT coordinator, curriculum coordinator) — full school-wide view.
- `grade_admin` role holders within `TeacherGradeAssignment` — grade-scoped view.

**Access pattern:**
- Top-bar profile menu shows an "Admin" item only for users with one of these roles.
- The admin section sits outside the six main views (it's a separate area, not a seventh view).

**Anticipated surfaces (not specified in detail — to be designed when this phase begins):**

*Activity / oversight surfaces:*
- **Activity timeline** — filtered view of `AuditLog`. Filter by actor, action, entity type, date range, grade.
- **Roster** — list of teachers, role assignments per grade, last-login timestamps. Admin can promote/demote (lead/grade_admin/teacher), add or remove a teacher from a grade, deactivate accounts.
- **Grade-level management** — activate/deactivate grades, set up teaching teams.
- **School year management** — start a new year, archive a previous year, configure holidays and Ramadan range.
- **System metrics dashboard** — number of active teachers (last 7/30 days), lessons created, exports generated, storage used, snapshot count.

*Instructional leadership surfaces (the key payoff of building data infrastructure now):*
- **Standards coverage dashboard** — matrix + heatmap showing which standards in each framework are tagged on lessons, filterable by framework / grade / subject / school year / completion status. Drives the "what are we teaching" question.
- **Coverage gaps report** — list of standards in a framework's full list that have ZERO lessons tagged. The "what are we missing" report.
- **Distribution over time** — for each standard, a histogram of which weeks it appears in. Surfaces unevenness (front-loading, late-skipping).
- **Repetition / depth view** — how many lessons touch each standard. Standards touched once may be under-emphasized; standards touched 20+ times may be over-emphasized.
- **Cross-subject integration** — for cross-cutting frameworks (SEL, 21st-century skills, digital citizenship), shows how many lessons across each subject touched standards from that framework.
- **Teacher variance** — for the same grade and school year, compare which standards each teacher's *personal* copies touched. Reveals drift between master and what's actually being taught. **Defaults to aggregate view** ("the team's coverage is 67%") with explicit drill-in required for per-teacher data.
- **Comment intensity heatmap** — units with high discussion vs. silent units. Highlights where teachers are engaging (or stuck).
- **Year-over-year comparison** — same coverage reports across archived school years. "How does Grade 5's standards coverage this year compare to last year?"
- **Unit deep-read** — one unit at a time: all standards covered, completion rates, comments, teacher variations. The drill-down view of a single unit's reality.
- **Custom report builder** *(Phase 4+, deferred)* — lets an admin pick dimensions and filters to build their own report. Probably overkill until you've used the curated ones for a year.

*Design principles for all reports (locked in now):*
- **Aggregate by default; per-teacher views require deliberate drill-in.** The data shouldn't feel like surveillance. "67% of standards covered across the team" is more useful and less weaponizable than ranking teachers.
- **Per-teacher drill-in may require a separate, higher permission tier** (configurable per school).
- **All reports are read-only.** Admins observe; they don't edit teacher data from these screens.
- **Reports run against `CoverageSnapshot` not live data** — fast loads, historical accuracy, no expensive joins at request time.

**What ships in Phase 1 to make this work:**
- `SchoolAdmin` table created (empty by default).
- `TeacherGradeAssignment.role` enum includes `grade_admin`.
- `AuditLog` table written-to from every mutation across the app (see §7.8).
- RLS policies for the audit log: only admins (school-wide or grade-level) can read; everyone can write through a security-definer function.

**What doesn't ship in Phase 1:**
- No admin UI of any kind. No menu item. No screens.
- The data is collecting silently. When you're ready, the UI is a Phase 3+ project against a database that already has months of history.

### 5.14 Comment Browser

The dedicated surface for searching, filtering, and reading all comments across the grade. Reached from the 💬 icon in the top bar (with unread badge) or from a "View all comments on this lesson/unit" link inside any inline thread.

**Purpose:**
- Inline comments live on the entity they're attached to. The Browser is where a teacher answers questions like "what's been discussed this week?", "what did Sarah comment on across the unit?", "what comments do I have unread?".
- Mirrors the to-do slide-out's filtering grammar so teachers don't learn two filtering UIs.

**Layout:**
- **Slide-out from the right** (same surface pattern as the to-do panel) for quick access, with an optional expand-to-full-screen button for power browsing.
- **Filter chips at top:**
  - **Scope:** `Today` | `Past 7 days` | `This week` | `This month` | `All` (mutually exclusive, one active at a time)
  - **Anchor type:** `All` | `Lesson` | `Unit` | `Resource` | `Day shoutbox` (mutually exclusive)
- **Filters below chips:**
  - **Subject** (multi-select dropdown — color-coded chips matching the subject palette)
  - **Unit** (multi-select)
  - **Author** (multi-select — pick teammates by name/avatar)
  - **Has-replies-from-me** (toggle — "comments where I'm in the thread")
  - **Unread only** (toggle — shows comments not yet in `CommentRead` for this teacher)
- **Quick filter shortcuts at the very top** (icon buttons): "Unread", "Comments on lessons I taught today", "Comments I started", "Replies to me".

**Result list:**
- Most recent first.
- Each row shows: author avatar + name, anchor label (e.g. "📘 Math · Unit 3 · Lesson 5 · Mon Wk 12"), timestamp ("2h ago"), body excerpt (~140 chars), reply count, unread dot if applicable.
- Click a row → opens the parent view (Weekly grid scrolled and expanded to that lesson, or Unit view scrolled to the unit-level thread, or Daily view scrolled to the shoutbox for that date), with the comment thread scrolled into view.
- Hover row → reveals: copy-link-to-comment, jump-to-anchor, mark-as-read.

**Empty states:**
- "No comments yet — start a conversation on any lesson, unit, or resource."
- Filter-empty: "No comments match these filters. Try widening the scope or clearing filters."

**Notifications (Phase 1):**
- The 💬 top-bar icon shows an unread-count badge.
- Badge updates on app load and on view-switch. **No real-time push in Phase 1.**

**Notifications (Phase 2):**
- Real-time badge updates via Supabase realtime subscription.
- Optional opt-in daily email digest ("3 new comments since yesterday on lessons/units you authored or commented on").
- No browser push, no toast popups, no SMS. Teachers should not feel surveilled or interrupted.

**Acceptance behavior:**
- Filtering is fast (<200ms) even with thousands of comments.
- Unread state is per-teacher and survives sign-out/sign-in.
- Jumping from a Browser row to the anchor view always lands with the thread visible and scrolled into view.

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
15. **Export Center modal** (scope picker, format toggle, content checkboxes, Live/Snapshot mode, preview pane).
16. **Reports library** (saved exports list in Settings, with re-download and delete).
17. **Inline comment thread** (top-level comments + one level of replies, on lesson detail and unit pages).
18. **Day shoutbox** (flat list, quick-add input, anchored to a date, displayed in Daily view below daily notes).
19. **Comment Browser slide-out** (scope chips, anchor-type chips, subject/unit/author filters, result list with anchor labels and jump-to behavior).
20. **Multi-lesson slot** (side-by-side for two, stacked for three+; each lesson card retains full functionality; drag-out interaction).
21. **Day Events** in three places: inline at end of Daily View's left pane, inline in Schedule View's timeline (at assigned time or end of day), banner at bottom of each day column in Weekly View. Include the quick-add form.
22. **Within-day reordering** — the up/down drag pattern in Daily View and within a Weekly View cell, with the "this changes only today" subtle messaging.
23. **"+ Add to day" chooser** — small modal/popover offering Core Lesson Event / Extra Lesson Event / Day Event; same authoring shape across all three, only required fields differ.
24. **Multi-framework standards picker** — search across all assigned frameworks, results grouped by framework with color/icon badges, multiple frameworks selectable on one lesson.
25. **Framework management screen in Settings** — catalog browser, enable/assign-to-grade flow, CSV upload form for custom frameworks.

### 6.5 Interaction patterns

- **Drag-and-drop:** events between days, weeks, units. **Plus within-day vertical reordering** in Daily View and within a Weekly View cell — moves the event up or down in that day's sequence and writes an `EventDayOrderOverride` for that teacher × date.
- **Multi-lesson slots:** dragging a lesson onto a slot that already has a lesson stacks them (side-by-side for two, vertical for three+). Each retains its full lesson functionality. Drag one back out to separate.
- **"+ Add to day" chooser (universal authoring entry point).** From Daily, Schedule, and Weekly views, a single "+ Add to day" affordance triggers a small picker:
  - 📘 **Core Lesson Event** — the main lesson type, derived from the master curriculum (unit, week, master/personal forking, drives completion + catch-up filter, standards strongly encouraged).
  - ✨ **Extra lesson event** — one-off teaching activity outside the master curriculum (e.g., closing circle, enrichment moment). Same authoring fields as a lesson, only title required, scoped to teacher or team.
  - 📅 **Day event** — non-curriculum (assembly, drill, guest speaker, celebration). Same authoring fields as a lesson, only title required.
  - All three flows share the same standards picker, resource attacher, and learning-objective field — symmetric authoring experience, different required fields, different downstream behavior.
  - Phase 2+: ability to convert between types ("oh, this should be an Extra Lesson Event, not a Day Event") via a "Convert to…" action. Phase 1: delete and recreate.
- **Day Events:** the lightweight non-curriculum flavor of the above. Always quick-addable from the chooser. Each event has its own completion checkbox. Events persist forever — no auto-clear, no archive.
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

### 6.6 Design tokens, accessibility, and state design

> **For Claude Design.** This subsection captures cross-cutting visual and behavioral requirements that apply to every component, not specific surfaces. Use as a checklist when prototyping.

**Design tokens file (`tokens.css` or `tokens.json`):**
- **Spacing scale:** 4, 8, 12, 16, 24, 32, 48, 64 px.
- **Radius scale:** 4, 6, 8, 12 px.
- **Elevation scale:** 0, 1, 2, 3 (shadows for cards, slide-outs, modals).
- **Type scale:** 11, 12, 13, 14, 16, 18, 22 px; weights 400 and 500.
- **Semantic color tokens:** `background`, `surface`, `surface-elevated`, `text-primary`, `text-secondary`, `border`, `focus`, `danger`, `success`, `warning`, `info`. Plus the eight-subject palette and ten-tag palette named explicitly.
- **Dark-mode-compatible:** every color reference is a token, never a hex literal. Dark mode is Phase 2+ but tokens make retrofit cheap.

**Empty states (specify per surface):**
- Weekly view (week with zero lessons), Daily view (day with no academic blocks), Subject view (filtered with no matches), Unit view (no lessons assigned), Comment Browser (no matches), To-Do panel (no items in active scope), Reports library (no saved exports), Standards picker (uploaded framework with no rows), first-login welcome.
- Every empty state surfaces the **next action** ("Add a lesson", "Copy from a previous week"), not just an apology.

**Loading, error, offline:**
- **Loading:** skeleton placeholders matching the eventual layout. Specify for weekly grid, lesson card, right pane, to-do slide-out, Comment Browser. No spinners as primary loading state.
- **Error:** inline error anchored to the failed action with a retry affordance. No global toast popups.
- **Offline:** persistent subtle banner ("You're offline — changes will sync when you reconnect"). Optimistic UI for completion checkboxes and note edits so flaky school Wi-Fi doesn't break flow.

**Accessibility (WCAG AA baseline):**
- Keyboard navigation: arrow keys across the weekly grid; Tab through right pane; Enter to expand; Esc to collapse; the right-click menu reachable via keyboard menu key or focus on the "⋯" affordance.
- ARIA landmarks on top bar, side panels, main canvas, modals.
- Color contrast on subject-colored backgrounds: AA minimum.
- Color-blind safety: test the eight-subject palette against deuteranopia and protanopia simulators. If two subjects collapse, adjust hue or add secondary differentiator (subtle pattern, short text code).
- Focus indicators: visible 2px outline on whatever is keyboard-focused. Not optional.

**iPad and tablet ergonomics:**
- Touch targets ≥ 44px square.
- Drag-and-drop on touch uses an explicit grab handle (drag-bars icon on the card's left edge), not long-press on the body (conflicts with click-to-expand).
- The "⋯" context-menu affordance is always visible on iPad (not hover-revealed).
- Soft keyboard handling: quick-add inputs must scroll into view when the on-screen keyboard appears.

**Motion and animation:**
- Allowed: card expand/collapse (200ms ease-out), drag ghosting, slide-out panel transitions (250ms), focus indicators (instant).
- Forbidden: bounce, parallax, page-flip, decorative confetti, anything implying delight at the expense of speed.
- `prefers-reduced-motion` respected: drop expand/collapse animation and the urgent-pulse when the OS setting is on.

**Iconography:**
- Single icon family (Lucide recommended for size + license; Heroicons and Phosphor are acceptable alternatives). Don't mix line and filled styles.
- Emojis only in the "+ Add to day" chooser (📘 ✨ 📅), priority indicators (🔴 🟡 🔵), and notification badges (💬 🔥). Never in lesson content or core UI.

**Holiday and Ramadan visual markers:**
- Holidays: week-cell ribbon or subtle backdrop tint with holiday name in small text at the top of the day cell. Multi-day holidays span their days. No screaming red banner.
- Ramadan: small "🌙 Ramadan timetable active" indicator at the top of any view when the date range is active; Schedule view shows the shortened time blocks; Daily view shows a small indicator on the date.
- Weekends (Fri/Sat in Qatar): visually distinct from school days but not hidden — a thin end-of-row marker makes the Sun–Thu school week unambiguous.

**Print and export design:**
- Print stylesheet designed alongside the weekly view, not bolted on. Margins, page breaks between weeks, repeated headers (subject + week number on every page), font sizing for paper legibility.
- Export PDF template (Phase 1 default): clean typographic hierarchy, no UI chrome, B&W-safe (use shape/label for standards type, not just color).

**Onboarding (first-run experience):**
- First login: short welcome modal — confirm name, pick default view, pick completion privacy. Skippable.
- Empty-year state on Weekly view: guided prompt ("Let's add your first lesson, or import last year's plan from a CSV").
- First lesson created: tooltip on completion checkbox explaining the privacy model.
- First master-mode entry: one-shot tooltip explaining the "Now editing master" button.

**Notification surface (Phase 2 build; Phase 1 design slot):**
- Reserve a notification icon slot in the top bar from Phase 1, even if no notifications fire yet. Add badge + dropdown panel in Phase 2 for master-change notifications and real-time comment updates.

**Search results surface:**
- Top-bar search queries lessons, units, standards, comments, and to-dos. Results grouped by type with clear anchor labels and jump-to behavior. Its own component, deserves a prototype.

**Density (Phase 2 toggle; Phase 1 architecture):**
- Lesson card padding uses spacing tokens, not hardcoded values. A future "compact mode" toggle can be added by swapping tokens, not redrawing components.



> **Primarily for Claude Code.**

### 7.1 Stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend framework | Next.js (App Router) or React + Vite | Familiar React stack; Next.js gives API routes if needed later |
| Styling | Tailwind CSS | Fast, low-decision-cost styling |
| State / data fetching | TanStack Query | Caching, optimistic updates, easy realtime |
| Database | Supabase (Postgres) | Free tier; rich relational queries; row-level security |
| Authentication | Supabase Auth (Google SSO) | Built into Supabase; ~10 lines of integration code |
| File storage (Phase 2 for lesson resources; Phase 1 for snapshot exports) | Supabase Storage (1GB free) → Cloudflare R2 (10GB free) if outgrown | Pluggable |
| **PDF generation** | `@react-pdf/renderer` (client-side) for Phase 1; Puppeteer in a Cloudflare Worker if branded templates needed in Phase 2 | Consistent output across browsers; archival-quality vs. `window.print()` |
| **Excel generation** | SheetJS (`xlsx`) — runs client-side | Free, well-maintained, generates real `.xlsx` files |
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
- Only `lead` or `grade_admin` role **for a given grade** can write to that grade's master content (lessons, units, subjects, team tags, team to-dos as creator/admin).
- `grade_admin` additionally can read that grade's audit log and `TeacherGradeAssignment` records.
- `SchoolAdmin` role: read-only across all grades by default; can write to `GradeLevel`, `TeacherGradeAssignment` (school-wide), `SchoolYear`, and `SchoolAdmin` records.
- Daily notes: shared notes readable by all teachers in the grade-level team; personal notes readable only by author.
- Completion records honor `is_public` based on each teacher's privacy preference.
- **Comments:** all teachers in the comment's `grade_level_id` can read; only the author can edit; author + `lead` + `grade_admin` can delete (soft delete). `CommentRead` rows are private per-teacher (only the owning teacher can read/write their own).
- **Standards frameworks:**
  - Catalog frameworks readable by all authenticated users; only the planner team can write.
  - School-uploaded frameworks readable only by teachers in the owning school; writable by `SchoolAdmin` of that school.
  - `GradeFrameworkAssignment` writable by `SchoolAdmin`; readable by all teachers in the grade.
- **CoverageSnapshot:** read restricted to `SchoolAdmin` and `grade_admin`; written only by the scheduled snapshot job (security-definer function).
- **Audit log:**
  - All authenticated users can INSERT into `AuditLog` via a security-definer function (so writes always succeed but the user can't choose what action or actor to log).
  - SELECT restricted: `grade_admin` can read rows where `grade_level_id` matches their assignment; `SchoolAdmin` can read everything; everyone else, nothing.

### 7.6 Print and export pipelines

Two distinct paths, do not conflate:

- **Ad-hoc print** (the §5.9 Print preview pages): browser-native `window.print()` with dedicated `@media print` Tailwind classes. Inconsistent across browsers, but zero-cost and fine for a teacher printing a substitute folder.
- **Archival export** (the §5.12 Export Center): `@react-pdf/renderer` for PDF and SheetJS (`xlsx`) for Excel. Both run client-side; no server PDF rendering needed for Phase 1. Output is consistent across browsers, archival-quality, and required for school/MOEHE submission.

Phase 2 may add Puppeteer (Cloudflare Worker) for PDFs if the school or MOEHE requires a specific branded template that `react-pdf` can't easily produce.

### 7.7 Performance budget

- Weekly view first paint < 1.5s on a school Chromebook.
- Lesson card hover/click responses < 50ms.
- Drag-and-drop frame rate ≥ 50 fps.
- Catch-up filter applies in < 200ms across all 40 weeks.

### 7.8 Audit logging architecture

**Goal:** every state-changing action in the app writes a single row to `AuditLog`, fire-and-forget, so a future admin UI can reconstruct activity history.

**Pattern:** wrap all Supabase mutations in a thin helper that:
1. Performs the mutation.
2. On success, calls a `log_action` RPC (security-definer Postgres function) that inserts into `AuditLog` with the authenticated user's ID as actor.
3. If logging fails, the failure is captured to console / Sentry but does NOT block the user's action.

**Why an RPC:** prevents users from forging audit rows (the RPC checks the JWT and sets actor server-side). Bypasses RLS for the insert.

**Conventions enforced at the library level:**
- All admin-style queries (audit reads, cross-grade aggregates, system metrics) live in `lib/admin/queries.ts`. Even in Phase 1 when this file has only one helper, the convention is set.
- All audit writes go through a single `auditLog(action, entity, metadata)` helper. Adding a new action type is a code change in one place.
- No direct INSERT into `AuditLog` from app code — always via `auditLog()` → RPC.

**Actions logged from day one (Phase 1):**
- Lesson create / edit / delete (master and personal)
- Master-mode enter / exit
- Personal-copy fork / reset-to-master
- Completion status change
- Daily note create / delete
- To-do create / complete / delete
- Tag create / delete
- Export generated (both Live and Snapshot)
- Export deleted from Reports library
- Login
- Settings changed (privacy preference, default view, etc.)

**Actions logged when their feature ships (Phase 2+):**
- Master-change accept/reject (Phase 2)
- Year rollover (Phase 2)
- Role change (whenever admin UI ships)
- Grade activation/deactivation (whenever admin UI ships)
- Teacher assigned/removed from grade (whenever admin UI ships)

### 7.9 Reporting infrastructure

**Goal:** all admin/instructional-leadership reports run fast against pre-computed snapshots, not live joins. The data infrastructure ships in Phase 1; the UI is Phase 3+.

**Nightly snapshot job:**
- A scheduled Postgres function (Supabase pg_cron or a Cloudflare Worker scheduled task) runs once daily.
- Computes per (school_year, grade, framework, subject) standards-coverage stats and inserts one `CoverageSnapshot` row per combination.
- Idempotent — re-running on the same date overwrites the day's snapshot.
- Phase 1: writes only. No UI consumes the data yet.

**Reporting query layer:**
- All admin/reporting queries live in `lib/admin/queries.ts` and are called through Postgres functions marked `SECURITY DEFINER` so they can bypass RLS for aggregation while still enforcing admin role checks.
- No teacher-facing surface ever queries reporting tables directly.
- Convention is set in Phase 1 even though there's no admin UI yet — when the UI arrives, every aggregation query already has a home.

**Design principles baked in from Phase 1:**
- **Aggregate by default.** Reporting queries return team-aggregated counts (not per-teacher) unless an admin explicitly requests drill-in.
- **Per-teacher detail requires explicit permission flag.** Configurable per school — some schools want per-teacher transparency, others want only aggregate.
- **Reports are read-only.** Admin queries never write to lesson/curriculum tables.
- **Snapshot date is the report's truth.** A coverage report for a date last month uses that day's snapshot, not today's data. This means archived reports stay accurate even as new lessons are added.

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
- **Learning objectives field** on every lesson (required for governing-authority exports).
- **Export Center** — PDF export (daily / weekly / unit / subject-year scopes) via `@react-pdf/renderer`; Live and Snapshot modes; Reports library for snapshots. **Excel export is Phase 2.**
- **Audit logging infrastructure** — `AuditLog` table created and written from every mutation; `log_action` RPC; `auditLog()` helper. **No admin UI yet** — data collects silently for a future Phase 3+ admin section.
- **Admin role infrastructure** — `SchoolAdmin` table, `grade_admin` enum value on `TeacherGradeAssignment`, RLS policies that recognize all three role tiers. No admin role is granted at launch (data is collected, but nothing reads it).
- **Comments and Day shoutbox** — inline threaded comments on lessons, units, and resources; flat day-shoutbox stream below the Daily Notes banner; Comment Browser slide-out with filters; unread badge on top-bar icon updated on app load/view-switch. **No real-time push in Phase 1.**
- **Within-day reordering** — drag lessons up/down in Daily View and within Weekly View cells; per-teacher, per-date override; persists forever as historical record.
- **Multi-lesson slots** — a Time Block can host multiple lessons simultaneously; each retains independent completion, standards, and resources; drag-out separates them again.
- **Day Events** — lightweight non-curriculum entries (assembly, drill, guest speaker, teachable moment, etc.) with optional time, completion checkbox, team/personal scope. Appear in Daily View end-of-list, Schedule View inline at time, and Weekly View as bottom banner. Included in exports by default.
- **Extra Lesson Events** — teacher-owned (or team-owned) one-off teaching activities outside the master curriculum (e.g., closing circle). Same authoring fields as a Lesson; only title required; no master/personal forking; no unit/week binding. Appear alongside lessons with a subtle visual marker.
- **Unified "+ Add to day" chooser** — single entry point in Daily, Schedule, and Weekly views; picker offers Core Lesson Event / Extra Lesson Event / Day Event; same authoring fields, different downstream behavior.
- **Multi-framework standards infrastructure** — `StandardsFramework`, `GradeFrameworkAssignment` entities; `Standard` rewritten to be framework-aware and hierarchy-capable; standards picker groups by framework and supports multi-framework tagging on a single lesson. **CCSS Grade 5 preloaded** in the catalog; **EE standards uploaded via CSV** as a school-uploaded framework.
- **CSV upload for custom standards frameworks** — basic parse-and-insert form in Settings (school admin only). Validation polish deferred to Phase 2.
- **CoverageSnapshot infrastructure** — `CoverageSnapshot` table created; nightly scheduled job computes coverage stats per (school_year, grade, framework, subject); writes only. **No reporting UI in Phase 1.**
- **`lib/admin/queries.ts` convention** — established as the home for any aggregation/admin-style queries via `SECURITY DEFINER` Postgres functions. Empty in Phase 1 except for the snapshot computation function.
- Print stylesheet: weekly view.

**Out of Phase 1:** Schedule view, full personal-copy forking, master-change notifications, year rollover, unit dashboards, file uploads (lesson resources), annotation, auto-tagging, **Excel export**, **branded MOEHE PDF templates** (if needed beyond the default).

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
- **Excel export** via SheetJS — one row per lesson, all metadata as columns.
- **Custom PDF templates** (if MOEHE or school provides a required format that the Phase 1 default can't satisfy) — likely via Puppeteer in a Cloudflare Worker.
- **Real-time comment badge updates** via Supabase realtime; optional opt-in daily email digest of new comments.
- **Comments in exports** — opt-in checkbox in the Export Center to include comment threads in PDF exports.
- **CSV upload polish** for custom standards frameworks — preview-before-commit, validation errors surfaced inline, edit-after-upload.
- **Catalog framework expansion** — add IB, NZ Curriculum, British curriculum, Cambridge, etc. as they're requested.
- **ExtraLessonEvent → ExtraLessonTemplate** — teachers can save an extra lesson event as a personal template ("my Closing Circle template") and drop it into any future day with one click.
- **Type conversion** — convert a record between Lesson / ExtraLessonEvent / DayEvent via a "Convert to…" action, preserving data where possible.

### Phase 3 — Resources, annotation, hosting (open-ended)

**Replaces:** Padlets (#1).

- File uploads to Supabase Storage / Cloudflare R2.
- In-app preview of PDFs, images, docs, embedded YouTube and Slides.
- PDF annotation (PDF.js + canvas overlay).
- Image annotation + whiteboard mode.
- Vertical CCSS alignment (Grade 4 / 6 view).
- Audit trail for master changes.
- Anonymous team coverage view (aggregate completion).
- **Admin section UI** — activity timeline (filtered audit log), roster + role management, grade-level management, school-year management, system metrics dashboard, export audit, **and the full instructional-leadership reporting suite**: standards coverage dashboard, coverage gaps, distribution over time, repetition/depth, cross-subject integration, teacher variance, comment intensity, year-over-year comparison, unit deep-read. Built against `CoverageSnapshot` and `AuditLog` data that has been accumulating since Phase 1.
- **In-app standards editor** — for school-uploaded frameworks, an in-app editor lets school admins add/edit/remove individual standards without re-uploading CSV.

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
- [ ] Lessons have a `learning_objectives` field visible in the lesson detail panel and editable in master-edit mode.
- [ ] Export Center reachable from top-bar Export icon AND from any lesson card's context menu.
- [ ] PDF export generates for daily / weekly / unit / subject-year scopes, includes title, learning objectives, standards, lesson content, and resource links by default.
- [ ] Live export downloads immediately without persisting anything server-side.
- [ ] Snapshot export downloads AND persists a `SavedExport` record; the file is re-downloadable from the Reports library in Settings.
- [ ] Reports library is visible to all grade-level teammates; delete restricted to leads.
- [ ] PDF output is consistent across Chrome, Safari, and Firefox (visual diff small enough to be archival).
- [ ] `AuditLog` table exists; every mutation across the app writes one row via the `auditLog()` helper (verify with a sample run of 20 mixed actions in dev — all 20 appear in the log within 2 seconds).
- [ ] Audit-log INSERTs go through a security-definer RPC; users cannot forge actor IDs or arbitrary actions.
- [ ] `SchoolAdmin` table exists; `TeacherGradeAssignment.role` enum includes `grade_admin`.
- [ ] RLS policies recognize `teacher`, `lead`, `grade_admin`, and `SchoolAdmin` roles; tests cover that a `teacher` cannot read another teacher's personal copy and that no role outside admins can read `AuditLog`.
- [ ] No admin UI is exposed in Phase 1 (audit data and admin roles exist in the DB but no menu item appears for any user).
- [ ] Inline comment threads appear under lesson detail (in Weekly expanded card + Daily right pane + Unit page); top-level + one level of replies; authors can edit/delete their own; soft-deleted comments display as "[Comment removed]".
- [ ] Day shoutbox appears in the Daily view below the Daily Notes banner; flat post list; quick-add input; auto-hides from inline view after 7 days (still findable in the Comment Browser).
- [ ] Comment Browser opens from the 💬 top-bar icon; filters (scope, anchor type, subject, unit, author, has-replies-from-me, unread) work independently; result rows include anchor labels.
- [ ] Clicking a Browser result row jumps to the parent view with the relevant comment thread scrolled into view.
- [ ] Unread badge on the 💬 icon shows the count of unread comments for the current teacher; updates on app load and on view-switch.
- [ ] Lead and grade_admin roles can delete any comment in their grade; teachers can delete only their own.
- [ ] Lessons can be reordered up/down within a single day in Daily View AND within a single Weekly View cell; reorder persists per teacher × date; original master order is unaffected for other dates.
- [ ] `EventDayOrderOverride` records are created on first reorder for a given teacher × date and updated on subsequent reorders.
- [ ] Reorder history is preserved indefinitely — viewing a past date shows the order taught, not the master order.
- [ ] Two lessons can occupy the same time block (side-by-side rendering); three or more stack vertically. Each lesson retains its own completion checkbox and full functionality.
- [ ] A lesson dragged out of a multi-lesson slot moves cleanly to its new slot with no effect on the other lessons.
- [ ] "+ Add to day" chooser appears in Daily, Schedule, and Weekly views; offers Core Lesson Event / Extra Lesson Event / Day Event; renders the same authoring shape for all three with only required fields differing.
- [ ] Core Lesson Event, Extra Lesson Event, and Day Event each have title, learning objective, standards, and resources fields. Only title is required for each.
- [ ] Extra Lesson Events appear alongside Core Lesson Events in Daily/Schedule/Weekly views with a visual marker (border style or ✨ icon).
- [ ] Day Events appear at end of left pane (Daily), inline at time (Schedule), and as bottom banner (Weekly), with their own completion checkbox.
- [ ] All three event types persist indefinitely; past dates still show what occurred.
- [ ] Export Center includes day events and extra lesson events by default; toggle present to exclude each.
- [ ] `StandardsFramework` and `GradeFrameworkAssignment` entities exist. CCSS Grade 5 is preloaded as a catalog framework. The EE framework can be uploaded via CSV in Settings and immediately appears in the standards picker.
- [ ] Standards picker shows results grouped by framework, color-coded by framework, with the framework's short-code badge on each result.
- [ ] A single lesson, extra lesson event, or day event can be tagged with standards from multiple frameworks simultaneously.
- [ ] CSV upload form accepts `framework_short_code, code, description, parent_code, grade_level, language` columns, parses, and inserts standards rows. Errors surface inline. (Polish/preview deferred to Phase 2.)
- [ ] `CoverageSnapshot` table exists. A nightly scheduled job computes coverage stats per (school_year, grade, framework, subject). Verify with a manual trigger of the job; a row appears for each combination.
- [ ] `lib/admin/queries.ts` exists with the snapshot-computation function as its only entry. No teacher-facing UI queries this file.
- [ ] Audit log records `event_reordered`, `event_moved_into_slot`, `event_moved_out_of_slot`, `day_event_created`, `day_event_edited`, `day_event_deleted`, `day_event_completed`, `extra_lesson_event_created`, `extra_lesson_event_edited`, `extra_lesson_event_deleted`, `framework_uploaded`, `framework_assigned_to_grade`, `standard_tagged` actions.
- [ ] Lighthouse score ≥ 85 on the weekly view.

### Phase 2 acceptance

- [ ] Personal copy auto-creates on first edit in personal mode.
- [ ] Master-mode banner is unmissable; editing master requires explicit "Now editing master" confirmation.
- [ ] Master changes queue notifications on diverged personal copies, with per-change accept/reject.
- [ ] Schedule view auto-slots lessons into the correct time blocks for the teacher's day.
- [ ] Ramadan toggle swaps time blocks and persists.
- [ ] Unit dashboard shows summary, completion %, and standards coverage map.
- [ ] Year rollover archives current year and seeds the next year without manual reentry.
- [ ] Excel export generates a single `.xlsx` with one row per lesson, all required columns, hyperlinked resource URLs, and frozen header row.
- [ ] If a custom MOEHE/school PDF template is provided, the Export Center offers it as a selectable layout in addition to the default.
- [ ] Comment unread badge updates in real time when a teammate posts a new comment (badge increments within ~2 seconds without page reload).
- [ ] Opt-in daily email digest sends to teachers who enable it in Settings; digest includes only comments since the last digest.
- [ ] Export Center has a "Include comment threads" checkbox; when on, the PDF export appends comments per lesson/unit.

### Phase 3 acceptance

- [ ] PDFs and images upload, preview inline, and can be annotated.
- [ ] Annotated copies save to the resource record.
- [ ] Whiteboard mode is reachable from any displayed resource.
- [ ] Admin section is visible only to `SchoolAdmin` or `grade_admin` role holders; hidden from all other accounts.
- [ ] Activity timeline can filter audit-log entries by actor, action, entity, date range, and grade.
- [ ] Roster screen allows promoting/demoting roles and assigning teachers to grades, with each change written to the audit log.
- [ ] Aggregate metrics (active teachers last 7/30 days, lessons created, exports generated, storage used) load in under 2 seconds for a school with ≤200 teachers and ≤100k audit rows.

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
| 11 | Does MOEHE or the school have a specific required PDF template (logo, header, layout)? | Phase 1 PDF scope | If yes: collect templates before Phase 1 build and either match closely in `react-pdf` or push to Phase 2 with Puppeteer. If no: ship the Phase 1 default. |
| 12 | Should exports include teacher notes by default, or never? | Export defaults | Default off. Teachers can opt in per export. Notes are private by nature. |
| 13 | Reports library retention policy: indefinite, auto-delete after N months, or manual only? | Storage cost, audit trail | Manual delete only in Phase 1; revisit in Phase 2 if storage grows. |
| 14 | Is the eventual admin role likely school-internal (principal, IT, curriculum coordinator) or external (MOEHE inspector)? | Admin role design, login flow | Spec assumes school-internal, read-only by default. External access would need a separate, more locked-down flow. |
| 15 | Should `SchoolAdmin` be a standalone account (no teacher record needed) or always linked to a teacher record? | Schema choice | Designed both-ways: `SchoolAdmin.teacher_id` is nullable, supporting non-teacher admins (e.g., IT coordinator) and teacher-admins (e.g., a teacher who is also curriculum coordinator). |
| 16 | Audit log retention — indefinite or rolling window (e.g., 2 years)? | Database growth, compliance | Indefinite in Phase 1 (small team, low row count). Revisit at 5M rows or Phase 3, whichever comes first. |
| 17 | Should `grade_admin` be a separate role from `lead`, or just expanded permissions on `lead`? | Role enum design | Separate. `lead` = curriculum authority. `grade_admin` = lead + audit-log read + assignment management. Keeps responsibilities clean and migrations easy. |
| 18 | Should comments support @mentions (with notifications) in Phase 1, or defer to Phase 2? | Notification scope, complexity | Defer. Phase 1 = unread badges only. Add @mentions in Phase 2 alongside real-time and email digest, if teachers ask for them. |
| 19 | Day shoutbox archive — auto-hide from inline view at 7 days, or configurable per team? | Daily view noise | 7 days hard-coded in Phase 1. Make it a team setting only if teachers complain. |
| 20 | Should "reactions" (👍 ❤️ etc.) be added to comments? | Engagement design | Defer to a later phase. Easy to add when there's evidence the team wants them; premature now. |
| 21 | Catalog frameworks vetted by the planner team vs. crowdsourced? | Quality control, scaling | Vetted by planner team in Phase 1–2. Defer crowdsourcing model to Phase 4+ when there's enough demand. |
| 22 | Per-teacher drill-in on admin reports — separate role, configurable school setting, or always available to school admin? | Privacy, surveillance risk | Configurable per school. Default: aggregate-only. Schools can opt in to per-teacher visibility for specific admins. |
| 23 | Closing-circle-style templates: should an Extra Lesson Event template be personal-only or shareable with the team? | Phase 2+ scope | Personal-only in Phase 2. Add team-shareable templates if requested. |
| 24 | When CSV upload encounters a duplicate `code` within a framework, behavior — error, overwrite, skip? | CSV upload UX | Error in Phase 1 (safest). Add overwrite/merge options in Phase 2. |
| 25 | Dark mode — Phase 2 or Phase 3? | Theming, design tokens | Phase 2. Tokens are designed dark-mode-ready from Phase 1; building the actual dark palette in Phase 2 is cheap if tokens are in place. |
| 26 | Density toggle (compact/comfortable) — Phase 2 or never? | Token system, retrofit cost | Phase 2 toggle if teachers request it after using the app. Phase 1 ensures lesson card padding uses spacing tokens so a future toggle is a token swap, not a redraw. |
| 27 | Bulk import of last year's curriculum from CSV/Excel — Phase 1 or later? | Onboarding flow | Likely Phase 1 (deferred) — flag for revisit. Without it, the school's first weeks on the tool require manual entry of an entire year, which is a huge friction barrier. |

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
| **Learning objectives** | Per-lesson explicit objectives statement, separate from directions and notes. Required for governing-authority exports. |
| **Export Center** | The dedicated screen for generating archival PDF and Excel exports of curriculum at daily, weekly, unit, or subject-year scopes. Distinct from ad-hoc browser print. |
| **Live export** | An export generated on demand from current data, downloaded once, not retained server-side. |
| **Snapshot export** | An export saved to the Reports library so any grade-level teammate can re-download the exact file later — used for archival submissions to school or MOEHE. |
| **Reports library** | Settings-page list of all `SavedExport` records, visible to grade-level teammates, re-downloadable, deletable by leads only. |
| **School admin** | A school-wide role with read-only access across all grades by default, plus management rights over grade levels, teacher-grade assignments, school years, and the audit log. May or may not be a teacher. |
| **Grade admin** | A per-grade role that is a superset of `lead` — adds read access to that grade's audit log and the ability to manage `TeacherGradeAssignment` records for that grade. |
| **Audit log** | Append-only table holding one row per state-changing action across the app. Written from day one; read only by admin roles in a future Phase 3+ admin section. |
| **Admin section** | A separate UI area (not a seventh view) visible only to school admins and grade admins. Phase 3+ build. The data infrastructure ships in Phase 1 so history is available when the UI arrives. |
| **Comment** | A team-visible note anchored to a specific lesson, unit, resource, or shoutbox date. Threaded one level deep (top-level + replies). Editable and deletable by the author; deletable by lead/grade_admin. |
| **Day shoutbox** | A flat, single-thread team conversation tied to one date, displayed inline in the Daily view below the Daily Notes banner. Auto-hides from inline view after 7 days but remains in the Comment Browser. |
| **Comment Browser** | A slide-out (with optional full-screen) for filtering and searching all comments across the grade. Mirrors the to-do panel's filtering UX. |
| **CommentRead** | Per-teacher row recording that a teacher has viewed a comment. Drives unread badges and the "unread only" filter. |
| **Standards Framework** | A named collection of standards (CCSS, IB, NZ Curriculum, Cambridge, EE, etc.). Can be catalog (built-in, shared across schools) or school-uploaded (private to one school). |
| **Catalog framework** | A built-in standards framework vetted by the planner team. Read-only; available for any school to enable. CCSS is the launch example. |
| **School-uploaded framework** | A standards framework uploaded by a school admin (via CSV in Phase 1) for the school's own use. Private to that school. |
| **GradeFrameworkAssignment** | Junction record linking a grade level to a framework it uses. A grade can use multiple frameworks. |
| **Coverage snapshot** | A nightly-computed row capturing standards-coverage stats for a (school_year, grade, framework, subject) combination. Backs the future admin reporting UI without requiring expensive live queries. |
| **Coverage gap** | A standard in a framework's assigned scope that has not been tagged on any lesson — i.e., not (yet) taught. |
| **Core Lesson Event** | The main lesson type, derived from the master curriculum. Belongs to a unit and week, has master/personal forking, drives completion and catch-up filter. Implemented by the `MasterCoreLessonEvent` and `PersonalCoreLessonEventCopy` entities. Pairs with Extra Lesson Event and Day Event in the "+ Add to day" chooser. |
| **Extra lesson event** | A one-off teaching activity outside the master curriculum (e.g., closing circle, enrichment). Same authoring shape as a lesson, but no unit/week binding and no master/personal forking. Per-teacher or team-scoped. |
| **Day event** | Non-curriculum entry on a day (assembly, drill, guest speaker, celebration). Same authoring fields as a lesson but only title is required. |
| **"+ Add to day" chooser** | The universal authoring entry point in Daily/Schedule/Weekly views: a small picker that asks Core Lesson Event / Extra Lesson Event / Day Event before opening the form. |
| **Aggregate-by-default principle** | A design rule for admin reports: data is shown team-aggregated by default; drill-in to per-teacher data requires explicit permission. Reduces the risk of reports being used as surveillance. |
| **Design tokens** | A shared file (`tokens.css` or `tokens.json`) holding every spacing, radius, elevation, color, and type value used in the design system. Both Claude Design (prototyping) and Claude Code (building) read from it, preventing drift between prototype and production. Dark-mode-ready from Phase 1 even though dark mode itself is Phase 2+. |
| **Empty state** | The intentional design of a surface when it contains no data (new school year, filter with no matches, brand-new teacher's first login). Always surfaces the next action, never a blank screen. |
| **Skeleton placeholder** | A loading state that visually matches the eventual layout — gray boxes shaped like the lesson card or weekly grid — rather than a generic spinner. Keeps visual rhythm stable while data arrives. |

---

*End of planning document. Companion document: `conversation_record.md`.*
