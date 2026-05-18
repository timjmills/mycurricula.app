-- =============================================================================
-- MyCurricula — initial Postgres schema
-- =============================================================================
-- Authoritative source: Documents/Project Files/5.16.26 planning_document.md §4
-- (Data Model). This migration translates §4.1–§4.8 into a Supabase Postgres
-- schema. CLAUDE.md §5 mandates building the infrastructure data shapes
-- (audit_log, coverage_snapshots, edit_undo_stack) NOW, even though no UI
-- consumes them yet — so they are included here.
--
-- Conventions
--   * Tables: snake_case, plural.
--   * PKs: `uuid primary key default gen_random_uuid()` (except `teachers`,
--     whose id IS `auth.users.id`).
--   * Timestamps: `timestamptz default now()`; `updated_at` maintained by the
--     shared `set_updated_at()` trigger.
--   * Enums: native Postgres enum types — cleaner than `text + check`, and the
--     §4 spec is enum-heavy. Where a column needs values added later, an enum
--     is still fine (`alter type ... add value`).
--   * Grade-scoping: every grade-scoped entity carries `grade_level_id`. The
--     product launches Grade 5-only but the model NEVER assumes a single grade.
--   * Multi-tenancy: `schools` is the tenant root. The spec references
--     `owner_school_id` / per-school scoping without defining School; it is
--     added here as the multi-tenant root.
--
-- Forking model (§4.3): `master_core_lesson_events` is the single source of
-- truth; `personal_core_lesson_event_copies` is the per-teacher lazy fork.
-- `completion_status` is SEPARATE and keyed by (teacher, event) — completion
-- never forks a lesson.
--
-- Deferred / future (appear ONLY in the §4.2 AuditLog `action` enum, no entity
-- definition — intentionally NOT modelled here):
--   modification-bank, curriculum-bundle, class-website, stickers, AI logging,
--   SchoolStorageUsage snapshot, ExtraLessonTemplate (Phase 2+).
-- =============================================================================

create extension if not exists "pgcrypto";  -- gen_random_uuid()


-- #############################################################################
-- ## SECTION 0 — ENUM TYPES
-- #############################################################################
-- All enums from §4 declared up front so table DDL below reads cleanly.

create type grade_role            as enum ('teacher', 'lead', 'grade_admin');
create type completion_privacy    as enum ('private', 'shared');
create type app_view              as enum ('daily', 'weekly', 'schedule', 'unit', 'subject', 'year');
create type view_mode             as enum ('simple', 'task', 'advanced');

create type cycle_pattern         as enum ('one_week', 'ab_two_week');
create type pacing                as enum ('synchronized', 'self_paced');
create type subject_scope         as enum ('team', 'personal');
create type promotion_status      as enum ('not_requested', 'pending', 'approved', 'rejected');
create type rollover_preference   as enum ('ask_me', 'yes', 'no');

-- Days of the school week. The full weekday set is stored so any school's
-- configurable week is representable; the FIRST beta school runs sun–thu.
create type weekday               as enum ('sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat');

create type framework_provenance  as enum ('catalog', 'school_uploaded');

create type lesson_completion     as enum ('not_done', 'done', 'skipped', 'carried_over', 'partial');
create type note_priority         as enum ('urgent', 'important', 'fyi');
create type reminder_category     as enum ('behavioral', 'academic');

-- The three event types that can be ordered / commented / etc.
create type event_type            as enum ('core_lesson_event', 'extra_lesson_event', 'day_event');

create type day_event_type        as enum (
  'assembly', 'guest_speaker', 'drill', 'celebration',
  'field_trip', 'teachable_moment', 'other'
);
create type collab_scope          as enum ('personal', 'team');

create type recurrence_frequency  as enum ('daily', 'weekly', 'every_n_days', 'every_n_weeks');
create type recurrence_end        as enum ('never', 'end_date', 'after_n_occurrences');
create type recurrence_override   as enum ('edited', 'deleted', 'moved');

create type time_block_type       as enum ('academic', 'non_academic');
create type week_cycle            as enum ('every_week', 'week_a', 'week_b');

create type export_format         as enum ('pdf', 'excel');
create type export_scope          as enum ('daily', 'weekly', 'unit', 'subject_year');
create type export_mode           as enum ('live', 'snapshot');
create type export_data_version   as enum ('master', 'personal');

-- Comment / undo / resource owners. `personal_subject` distinguishes a
-- personal-scoped subject from a team subject where the spec calls it out.
create type comment_anchor        as enum (
  'core_lesson_event', 'extra_lesson_event', 'day_event',
  'unit', 'resource', 'day_shoutbox'
);
create type undo_entity           as enum (
  'core_lesson_event', 'extra_lesson_event', 'day_event',
  'unit', 'subject', 'personal_subject', 'comment', 'daily_note', 'todo'
);
create type resource_owner_type   as enum (
  'core_lesson_event', 'extra_lesson_event', 'day_event', 'unit', 'personal_subject'
);
create type resource_kind         as enum ('hosted_file', 'external_link', 'youtube_link', 'drive_link');
create type hosted_file_type      as enum ('pdf', 'docx', 'rtf', 'image', 'image_stack');

-- Audit log enums (§4.2). The `action` enum is large by design — every
-- mutation in the app maps to one value. Values whose entities are NOT
-- modelled in this migration (modification-bank, curriculum-bundle,
-- class-website, stickers, AI) are still kept so the log can record them when
-- those features ship.
create type audit_action          as enum (
  'core_lesson_event_created', 'core_lesson_event_edited', 'master_edited',
  'personal_forked', 'personal_reset_to_master', 'event_reordered',
  'event_moved_into_slot', 'event_moved_out_of_slot', 'unit_created',
  'unit_edited', 'subject_created', 'subject_edited', 'personal_subject_created',
  'personal_subject_promotion_requested', 'personal_subject_promotion_approved',
  'personal_subject_promotion_rejected', 'personal_subject_promotion_cancelled',
  'personal_subject_rollover_decided', 'personal_subject_archived',
  'personal_subject_restored', 'time_block_converted_to_subject',
  'subject_converted_to_time_block', 'standard_tagged',
  'completion_status_changed', 'daily_note_created', 'daily_note_deleted',
  'day_event_created', 'day_event_edited', 'day_event_deleted',
  'day_event_completed', 'extra_lesson_event_created',
  'extra_lesson_event_edited', 'extra_lesson_event_deleted',
  'extra_lesson_event_completed', 'framework_uploaded',
  'framework_assigned_to_grade', 'framework_unassigned_from_grade',
  'curriculum_imported', 'background_uploaded', 'background_deleted',
  'todo_created', 'todo_completed', 'todo_deleted', 'tag_created',
  'tag_deleted', 'export_generated', 'export_deleted', 'comment_posted',
  'comment_edited', 'comment_deleted', 'role_changed', 'grade_activated',
  'grade_deactivated', 'teacher_assigned_to_grade',
  'promotion_approval_delegated', 'subject_team_membership_changed',
  'subject_team_member_added_from_outside_grade', 'undo_applied',
  'copied_from_archive', 'permission_changed', 'ai_call_logged',
  'departed_teacher_subject_archived', 'teaching_reminder_created',
  'teaching_reminder_edited', 'teaching_reminder_deleted',
  'teaching_reminder_csv_imported', 'resource_attached', 'resource_edited',
  'resource_deleted', 'resource_reordered', 'resource_reanchored',
  'resource_hosting_mode_changed', 'view_mode_changed', 'lesson_bumped_forward',
  'lesson_bumped_backward', 'lesson_extended', 'lesson_locked',
  'lesson_unlocked', 'sticker_added', 'sticker_removed',
  'class_website_enabled', 'class_website_disabled',
  'class_website_settings_changed', 'standards_report_exported',
  'lesson_status_changed', 'lesson_personal_note_created',
  'lesson_personal_note_edited', 'lesson_personal_note_deleted',
  'lesson_searched', 'curriculum_bundle_sent', 'curriculum_bundle_received',
  'curriculum_bundle_accepted', 'curriculum_bundle_declined',
  'admin_year_transferred', 'bank_lesson_added', 'bank_lesson_used',
  'bank_lesson_removed', 'plan_submission_deadline_set',
  'plan_submission_reminded', 'modification_shared', 'modification_revoked',
  'modification_promoted_to_master', 'modification_pulled_to_personal',
  'modification_added_to_bank', 'modification_sharing_enabled_school',
  'modification_sharing_disabled_school', 'school_year_started',
  'school_year_archived', 'login', 'settings_changed'
);
create type audit_entity          as enum (
  'core_lesson_event', 'extra_lesson_event', 'day_event', 'unit', 'subject',
  'standard', 'framework', 'grade_framework_assignment', 'coverage_snapshot',
  'completion', 'daily_note', 'todo', 'tag', 'export', 'comment',
  'role_assignment', 'grade_level', 'school_year', 'settings'
);


-- #############################################################################
-- ## SECTION 1 — SHARED TRIGGER FUNCTION
-- #############################################################################

-- Maintains `updated_at` on every table that has the column. Applied via a
-- per-table BEFORE UPDATE trigger at the end of each table's definition.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- #############################################################################
-- ## SECTION 2 — IDENTITY & ROLES
-- #############################################################################

-- ---------------------------------------------------------------------------
-- schools — multi-tenant root. The §4 spec references `owner_school_id` and
-- per-school scoping without defining a School entity; this is that root.
-- ---------------------------------------------------------------------------
create table schools (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  -- The configurable school week (§1): which weekdays the school runs, in
  -- order. NEVER hard-code 5 days. Beta school = sun..thu.
  school_week  weekday[] not null default array['sun','mon','tue','wed','thu']::weekday[],
  ramadan_timetable_enabled boolean not null default false,
  -- Phase 1B school admin setting: 'links_only' | 'files_and_links'.
  resource_hosting_mode text not null default 'links_only'
    check (resource_hosting_mode in ('links_only', 'files_and_links')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- grade_levels — §4.2 GradeLevel. Grade-scoped root for curriculum content.
-- ---------------------------------------------------------------------------
create table grade_levels (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id) on delete cascade,
  name          text not null,                       -- "Grade 5", "Kindergarten"
  display_order integer not null default 0,
  is_active     boolean not null default false,      -- only Grade 5 = true at launch
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- teachers — §4.2 Teacher. The PK IS the Supabase Auth user id, so RLS can
-- key directly off auth.uid(). Role is NOT on this record — it lives on
-- teacher_grade_assignments, per grade.
-- ---------------------------------------------------------------------------
create table teachers (
  id            uuid primary key references auth.users(id) on delete cascade,
  school_id     uuid not null references schools(id) on delete cascade,
  email         text not null,
  display_name  text not null,
  -- §4.2 `preferences`: default view, completion-privacy, default grade shown
  -- on login. Kept as discrete columns (queried individually) rather than a
  -- blob; the larger free-form UI state lives in teacher_ui_state.
  default_view              app_view not null default 'weekly',
  completion_privacy        completion_privacy not null default 'private',
  default_grade_level_id    uuid references grade_levels(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- teacher_grade_assignments — §4.2 TeacherGradeAssignment (junction).
-- Carries the per-grade role. A teacher may be assigned to many grades with a
-- different role in each.
-- ---------------------------------------------------------------------------
create table teacher_grade_assignments (
  id              uuid primary key default gen_random_uuid(),
  teacher_id      uuid not null references teachers(id) on delete cascade,
  grade_level_id  uuid not null references grade_levels(id) on delete cascade,
  role            grade_role not null default 'teacher',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (teacher_id, grade_level_id)
);

-- ---------------------------------------------------------------------------
-- school_admins — §4.2 SchoolAdmin. School-wide role, NOT tied to a grade.
-- `teacher_id` may be null for a standalone admin account that teaches no
-- grade (principal / IT / curriculum coordinator).
-- ---------------------------------------------------------------------------
create table school_admins (
  id                       uuid primary key default gen_random_uuid(),
  school_id                uuid not null references schools(id) on delete cascade,
  teacher_id               uuid references teachers(id) on delete cascade,
  granted_at               timestamptz not null default now(),
  granted_by_teacher_id    uuid references teachers(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);


-- #############################################################################
-- ## SECTION 3 — CURRICULUM STRUCTURE
-- #############################################################################

-- ---------------------------------------------------------------------------
-- school_years — §4.2 School Year + §4.8 week cycles. School-wide.
-- ---------------------------------------------------------------------------
create table school_years (
  id                   uuid primary key default gen_random_uuid(),
  school_id            uuid not null references schools(id) on delete cascade,
  label                text not null,                 -- "2025–2026"
  start_date           date not null,
  end_date             date not null,
  weeks                integer not null default 40,
  is_active            boolean not null default false,
  holidays             date[] not null default '{}',  -- §4.2 array of dates
  ramadan_start        date,                          -- §4.2 optional ramadan_range
  ramadan_end          date,
  -- §4.8 week cycles. Default one_week for all schools at launch.
  active_cycle_pattern cycle_pattern not null default 'one_week',
  -- For ab_two_week: the date the cycle "starts" on Week A.
  cycle_anchor_date    date,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- subjects — §4.2 Subject. Grade-scoped. Team OR personal. The 8 locked
-- Grade 5 subjects seed as team subjects (see seed.sql).
-- ---------------------------------------------------------------------------
create table subjects (
  id                     uuid primary key default gen_random_uuid(),
  grade_level_id         uuid not null references grade_levels(id) on delete cascade,
  name                   text not null,
  parent_id              uuid references subjects(id) on delete set null,  -- Literacy → Reading
  default_pacing         pacing not null default 'synchronized',
  -- Subject color from the fixed team-wide palette (§6.2 / lib/types.ts
  -- SubjectId). Stored as a stable slug ('math', 'reading', ...) so the
  -- frontend palette bridge / .cp-subj.<x> classes resolve it.
  color                  text not null,
  display_order          integer not null default 0,
  scope                  subject_scope not null default 'team',
  -- teacher_id for personal subjects; null for team subjects.
  owner_id               uuid references teachers(id) on delete cascade,
  promotion_status       promotion_status not null default 'not_requested',
  promotion_requested_at timestamptz,
  promotion_approver_id  uuid references teachers(id) on delete set null,
  promotion_resolved_at  timestamptz,
  -- Array of standards_frameworks ids the picker shows by default.
  default_framework_ids  uuid[] not null default '{}',
  rollover_preference    rollover_preference not null default 'ask_me',
  -- §4.5 — archived (not deleted) personal subjects after a year-rollover
  -- "Archive" decision; restorable via Settings.
  is_archived            boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- A team subject has no owner; a personal subject must have one.
  constraint subject_owner_scope_chk check (
    (scope = 'team'     and owner_id is null) or
    (scope = 'personal' and owner_id is not null)
  )
);

-- ---------------------------------------------------------------------------
-- subject_team_memberships — §4.2 SubjectTeamMembership. Master-edit
-- permission is enforced at the SUBJECT level via this table, NOT the grade.
-- ---------------------------------------------------------------------------
create table subject_team_memberships (
  id              uuid primary key default gen_random_uuid(),
  subject_id      uuid not null references subjects(id) on delete cascade,
  teacher_id      uuid not null references teachers(id) on delete cascade,
  can_edit_master boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (subject_id, teacher_id)
);

-- ---------------------------------------------------------------------------
-- units — §4.2 Unit. Grade-scoped; carries grade_level_id explicitly even
-- though it is derivable via subject (the spec lists it on Unit).
-- ---------------------------------------------------------------------------
create table units (
  id              uuid primary key default gen_random_uuid(),
  grade_level_id  uuid not null references grade_levels(id) on delete cascade,
  subject_id      uuid not null references subjects(id) on delete cascade,
  school_year_id  uuid not null references school_years(id) on delete cascade,
  name            text not null,
  summary         text,
  start_week      integer not null,
  end_week        integer not null,
  -- Optional pacing override for this unit only.
  pacing_override pacing,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);


-- #############################################################################
-- ## SECTION 4 — EVENTS & FORKING
-- #############################################################################

-- ---------------------------------------------------------------------------
-- recurrence_patterns — §4.2 RecurrencePattern. Powers recurrence for BOTH
-- ExtraLessonEvent and recurring MasterCoreLessonEvent (one mechanism, §4.2).
-- Instances are NOT pre-materialized — views compute firing dates and store
-- only per-instance edits as recurrence_instance_overrides.
-- ---------------------------------------------------------------------------
create table recurrence_patterns (
  id                uuid primary key default gen_random_uuid(),
  -- teacher_id for personal patterns; null for team-scoped patterns.
  owner_id          uuid references teachers(id) on delete cascade,
  scope             collab_scope not null default 'personal',
  school_year_id    uuid not null references school_years(id) on delete cascade,
  frequency         recurrence_frequency not null,
  -- `interval` is a reserved word in Postgres; column named `interval_count`.
  interval_count    integer not null default 1,        -- for every_n_days / every_n_weeks
  days_of_week      weekday[] not null default '{}',   -- for weekly patterns
  start_date        date not null,
  end_condition     recurrence_end not null default 'never',
  end_date          date,                              -- with end_condition = end_date
  occurrences_limit integer,                            -- with end_condition = after_n_occurrences
  -- Per-teacher opt-out dates even on team patterns (§4.2).
  skip_dates        date[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- master_core_lesson_events — §4.2 MasterCoreLessonEvent. The single source
-- of truth for curriculum lessons. Personal forks live in the next table.
-- ---------------------------------------------------------------------------
create table master_core_lesson_events (
  id                       uuid primary key default gen_random_uuid(),
  unit_id                  uuid not null references units(id) on delete cascade,
  subject_id               uuid not null references subjects(id) on delete cascade,
  week_number              integer not null,
  day_of_week              weekday not null,
  title                    text not null,
  directions               text,                       -- rich text (HTML/markdown)
  -- Explicit learning objectives — required for governing-authority exports.
  learning_objectives      jsonb not null default '[]',  -- array of strings
  notes                    text,
  -- §4.2 resources array of {type,url,label}. The richer Resource entity
  -- (§4.5a, `resources` table) is the Phase 1B model; this jsonb mirror keeps
  -- the lightweight inline shape the current frontend mock uses.
  resources                jsonb not null default '[]',
  -- Standard IDs from ANY framework (multi-framework tagging, §4.2).
  standards                uuid[] not null default '{}',
  display_order_within_day integer not null default 0,
  -- §4.2 recurrence: lessons inside units can recur.
  recurrence_pattern_id    uuid references recurrence_patterns(id) on delete set null,
  is_recurrence_template   boolean not null default false,
  -- §4.6 Phase 1: 30-day soft-delete window for master lessons.
  deleted_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- personal_core_lesson_event_copies — §4.2 PersonalCoreLessonEventCopy.
-- The per-teacher LAZY fork (§4.3): a row exists only once a teacher has
-- actually edited a master lesson in personal mode. Holds an independent copy
-- of every master field.
-- ---------------------------------------------------------------------------
create table personal_core_lesson_event_copies (
  id                          uuid primary key default gen_random_uuid(),
  teacher_id                  uuid not null references teachers(id) on delete cascade,
  master_core_lesson_event_id uuid not null
                                references master_core_lesson_events(id) on delete cascade,
  forked_at                   timestamptz not null default now(),
  -- Independent copy of all MasterCoreLessonEvent content fields.
  unit_id                     uuid not null references units(id) on delete cascade,
  subject_id                  uuid not null references subjects(id) on delete cascade,
  week_number                 integer not null,
  day_of_week                 weekday not null,
  title                       text not null,
  directions                  text,
  learning_objectives         jsonb not null default '[]',
  notes                       text,
  resources                   jsonb not null default '[]',
  standards                   uuid[] not null default '{}',
  display_order_within_day    integer not null default 0,
  -- True once the copy's content diverges from the master it forked from.
  is_diverged_from_master     boolean not null default false,
  -- §4.3 divergence tracking: queued master changes awaiting accept/reject.
  -- Array of {change_type, master_field, master_value, queued_at}.
  pending_master_updates      jsonb not null default '[]',
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  -- One fork per (teacher, master event).
  unique (teacher_id, master_core_lesson_event_id)
);

-- ---------------------------------------------------------------------------
-- completion_status — §4.2 Completion Status. SEPARATE from the lesson and
-- from forking (§4.3): a teacher marks any lesson done WITHOUT forking it.
-- Keyed by (teacher, core lesson event). The event reference is the MASTER
-- event id — completion follows the lesson, not its fork.
-- ---------------------------------------------------------------------------
create table completion_status (
  id                  uuid primary key default gen_random_uuid(),
  teacher_id          uuid not null references teachers(id) on delete cascade,
  core_lesson_event_id uuid not null
                         references master_core_lesson_events(id) on delete cascade,
  status              lesson_completion not null default 'not_done',
  -- §4.2 — reason a lesson did not go as planned (catch-up surfaces).
  reason_not_done     text,
  -- Derived from the teacher's completion_privacy preference at write time.
  is_public           boolean not null default false,
  updated_at          timestamptz not null default now(),
  unique (teacher_id, core_lesson_event_id)
);

-- ---------------------------------------------------------------------------
-- day_events — §4.2 DayEvent. Something during the school day that is NOT
-- curriculum (assembly, drill, guest speaker, celebration). Grade-scoped.
-- ---------------------------------------------------------------------------
create table day_events (
  id                uuid primary key default gen_random_uuid(),
  grade_level_id    uuid not null references grade_levels(id) on delete cascade,
  date              date not null,
  title             text not null,                  -- the only required content field
  description       text,
  learning_objective text,
  standards         uuid[] not null default '{}',
  resources         jsonb not null default '[]',
  time              time,                            -- null = all-day / untimed
  duration_minutes  integer,
  scope             collab_scope not null default 'team',
  author_id         uuid not null references teachers(id) on delete cascade,
  event_type        day_event_type,
  is_complete       boolean not null default false,
  completed_at      timestamptz,
  completed_by_id   uuid references teachers(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- extra_lesson_events — §4.2 ExtraLessonEvent. A teaching activity OUTSIDE
-- the master curriculum. Owned by its author (personal) or grade-scoped
-- (team). Not master/personal forked, not part of a unit.
-- ---------------------------------------------------------------------------
create table extra_lesson_events (
  id                     uuid primary key default gen_random_uuid(),
  -- §4.2: teacher_id (personal) — grade_level_id is also set for team-wide
  -- extras. Both kept; scope disambiguates.
  teacher_id             uuid references teachers(id) on delete cascade,
  grade_level_id         uuid not null references grade_levels(id) on delete cascade,
  date                   date not null,
  title                  text not null,
  description            text,
  learning_objective     text,
  standards              uuid[] not null default '{}',
  resources              jsonb not null default '[]',
  -- Optional — may reference a team OR personal subject, or none.
  subject_id             uuid references subjects(id) on delete set null,
  time                   time,
  duration_minutes       integer,
  scope                  collab_scope not null default 'personal',
  author_id              uuid not null references teachers(id) on delete cascade,
  is_complete            boolean not null default false,  -- per-instance for recurring
  completed_at           timestamptz,
  completed_by_id        uuid references teachers(id) on delete set null,
  recurrence_pattern_id  uuid references recurrence_patterns(id) on delete set null,
  is_recurrence_template boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- recurrence_instance_overrides — §4.2 RecurrenceInstanceOverride. Per-date
-- edit/skip/move of one materialized instance of a recurring series.
-- ---------------------------------------------------------------------------
create table recurrence_instance_overrides (
  id                    uuid primary key default gen_random_uuid(),
  recurrence_pattern_id uuid not null references recurrence_patterns(id) on delete cascade,
  original_date         date not null,
  override_type         recurrence_override not null,
  -- For 'edited' → field changes; for 'moved' → {new_date}.
  override_data         jsonb not null default '{}',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (recurrence_pattern_id, original_date)
);

-- ---------------------------------------------------------------------------
-- event_day_order_overrides — §4.2 EventDayOrderOverride. Per-teacher,
-- per-date ordering of all three event types as actually taught. Lazily
-- created; never auto-deleted (becomes a teaching journal).
-- ---------------------------------------------------------------------------
create table event_day_order_overrides (
  id                 uuid primary key default gen_random_uuid(),
  teacher_id         uuid not null references teachers(id) on delete cascade,
  -- §4.2 — `class_id` when classes exist; until then, grade_level_id.
  grade_level_id     uuid not null references grade_levels(id) on delete cascade,
  date               date not null,
  -- Array of {event_type, event_id} in the chosen order.
  ordered_event_refs jsonb not null default '[]',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (teacher_id, grade_level_id, date)
);

-- ---------------------------------------------------------------------------
-- time_blocks — §4.2 Time Block (Schedule View). Per teacher, per grade.
-- Academic blocks host events from a subject; non-academic blocks are labeled
-- time slots (lunch, recess). §4.8 — `week_cycle` handles AB scheduling.
-- ---------------------------------------------------------------------------
create table time_blocks (
  id                  uuid primary key default gen_random_uuid(),
  teacher_id          uuid not null references teachers(id) on delete cascade,
  grade_level_id      uuid not null references grade_levels(id) on delete cascade,
  day_of_week         weekday not null,
  start_time          time not null,
  end_time            time not null,
  type                time_block_type not null default 'non_academic',
  -- Required for academic blocks, null for non-academic.
  subject_id          uuid references subjects(id) on delete set null,
  label               text not null,
  notes               text,
  resources           jsonb not null default '[]',
  -- §4.2 alternate {start_time,end_time} used in Ramadan mode.
  ramadan_start_time  time,
  ramadan_end_time    time,
  -- §4.8 — which cycle week this block fires on.
  week_cycle          week_cycle not null default 'every_week',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint time_block_academic_subject_chk check (
    (type = 'academic'     and subject_id is not null) or
    (type = 'non_academic')
  )
);


-- #############################################################################
-- ## SECTION 5 — STANDARDS
-- #############################################################################

-- ---------------------------------------------------------------------------
-- standards_frameworks — §4.2 StandardsFramework. Catalog frameworks are
-- shared and read-only; school_uploaded frameworks are private to a school.
-- ---------------------------------------------------------------------------
create table standards_frameworks (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  short_code       text not null,                    -- "CCSS", "MOEHE", "IB-PYP"
  jurisdiction     text,
  description      text,
  provenance       framework_provenance not null default 'catalog',
  -- Populated only when provenance = school_uploaded.
  owner_school_id  uuid references schools(id) on delete cascade,
  color            text,
  icon             text,
  max_depth        integer not null default 1,       -- hierarchy depth for the picker
  supports_languages text[] not null default array['en'],
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint framework_provenance_owner_chk check (
    (provenance = 'catalog'         and owner_school_id is null) or
    (provenance = 'school_uploaded' and owner_school_id is not null)
  )
);

-- ---------------------------------------------------------------------------
-- grade_framework_assignments — §4.2 GradeFrameworkAssignment (junction).
-- One row per (grade, framework) the grade actually uses.
-- ---------------------------------------------------------------------------
create table grade_framework_assignments (
  id              uuid primary key default gen_random_uuid(),
  grade_level_id  uuid not null references grade_levels(id) on delete cascade,
  framework_id    uuid not null references standards_frameworks(id) on delete cascade,
  display_order   integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (grade_level_id, framework_id)
);

-- ---------------------------------------------------------------------------
-- standards — §4.2 Standard. Self-referential hierarchy of any depth.
-- ---------------------------------------------------------------------------
create table standards (
  id                         uuid primary key default gen_random_uuid(),
  framework_id               uuid not null references standards_frameworks(id) on delete cascade,
  -- Nullable for cross-grade frameworks; usually set.
  grade_level_id             uuid references grade_levels(id) on delete cascade,
  code                       text not null,          -- "CCSS.5.NBT.B.5"
  description                text,
  parent_standard_id         uuid references standards(id) on delete cascade,
  -- JSON keyed by language code; Phase 1 holds just `en`.
  description_translations   jsonb not null default '{}',
  display_order_within_parent integer not null default 0,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  -- §4.2 — code is unique within a framework.
  unique (framework_id, code)
);


-- #############################################################################
-- ## SECTION 6 — COLLABORATION & TEACHER STATE
-- #############################################################################

-- ---------------------------------------------------------------------------
-- daily_notes — §4.2 Daily Note. PERSONAL ONLY — private reminders for the
-- author. Grade-scoped. (Team-by-date discussion is the Day Shoutbox, modelled
-- as comments with anchor_type = day_shoutbox.)
-- ---------------------------------------------------------------------------
create table daily_notes (
  id              uuid primary key default gen_random_uuid(),
  grade_level_id  uuid not null references grade_levels(id) on delete cascade,
  teacher_id      uuid not null references teachers(id) on delete cascade,
  date            date not null,
  priority        note_priority not null default 'fyi',
  body            text not null,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- teaching_reminders — §4.2 TeachingReminder. Curated quotes / research
-- summaries surfaced in slim banners. School-scoped catalog (Phase 1).
-- ---------------------------------------------------------------------------
create table teaching_reminders (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id) on delete cascade,
  category      reminder_category not null,
  quote_text    text not null,
  summary       text,
  source_name   text,
  source_link   text,
  is_active     boolean not null default true,
  display_count integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- teacher_reminder_state — §4.2 TeacherReminderState. Per-teacher reminder
-- history powering anti-repeat rotation logic. One row per teacher.
-- ---------------------------------------------------------------------------
create table teacher_reminder_state (
  teacher_id                uuid primary key references teachers(id) on delete cascade,
  -- Arrays of {reminder_id, shown_at} for the last ~20 of each category.
  last_shown_behavioral_ids jsonb not null default '[]',
  last_shown_academic_ids   jsonb not null default '[]',
  updated_at                timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tags — §4.2 Tag. Team tags are grade-scoped; personal tags can be
-- cross-grade for the owning teacher (so grade_level_id is nullable).
-- ---------------------------------------------------------------------------
create table tags (
  id              uuid primary key default gen_random_uuid(),
  grade_level_id  uuid references grade_levels(id) on delete cascade,
  name            text not null,
  color           text not null,                     -- from a ~10-color palette
  scope           collab_scope not null default 'team',
  owner_id        uuid references teachers(id) on delete cascade,  -- personal tags
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint tag_scope_owner_chk check (
    (scope = 'team'     and owner_id is null) or
    (scope = 'personal' and owner_id is not null)
  )
);

-- ---------------------------------------------------------------------------
-- todos — §4.2 ToDo. Personal or team scope; both carry grade_level_id.
-- ---------------------------------------------------------------------------
create table todos (
  id               uuid primary key default gen_random_uuid(),
  grade_level_id   uuid not null references grade_levels(id) on delete cascade,
  title            text not null,
  description      text,
  scope            collab_scope not null default 'personal',
  author_id        uuid not null references teachers(id) on delete cascade,
  assignee_id      uuid references teachers(id) on delete set null,  -- team scope only
  due_date         date,                              -- null = no date
  priority         note_priority,                     -- reuses daily-note priority palette
  -- Array of tag ids (kept as array per §4.2; tag rows live in `tags`).
  tag_ids          uuid[] not null default '{}',
  -- §4.2 linked_entity {type, id}: core_lesson_event|extra_lesson_event|
  -- day_event|unit|resource.
  linked_entity_type text check (linked_entity_type in (
    'core_lesson_event','extra_lesson_event','day_event','unit','resource')),
  linked_entity_id uuid,
  is_complete      boolean not null default false,
  completed_by_id  uuid references teachers(id) on delete set null,
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- comments — §4.2 Comment. Anchored to several entity types incl. the
-- day_shoutbox (anchor_id is the ISO date for shoutbox). One level of reply
-- nesting. Soft-deleted (row kept so reply threads survive).
-- ---------------------------------------------------------------------------
create table comments (
  id                uuid primary key default gen_random_uuid(),
  author_id         uuid not null references teachers(id) on delete cascade,
  grade_level_id    uuid not null references grade_levels(id) on delete cascade,
  anchor_type       comment_anchor not null,
  -- Generic anchor: a uuid for entity anchors, an ISO date string for
  -- day_shoutbox. Stored as text to accommodate both; not a hard FK.
  anchor_id         text not null,
  -- Self-reference; one level of nesting only (enforced in app logic).
  parent_comment_id uuid references comments(id) on delete cascade,
  body              text not null,
  is_edited         boolean not null default false,
  deleted_at        timestamptz,                      -- soft delete
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- comment_reads — §4.2 CommentRead. Per-teacher read state; drives unread
-- badges. Inserted lazily when a comment scrolls into a teacher's viewport.
-- ---------------------------------------------------------------------------
create table comment_reads (
  comment_id uuid not null references comments(id) on delete cascade,
  teacher_id uuid not null references teachers(id) on delete cascade,
  read_at    timestamptz not null default now(),
  primary key (comment_id, teacher_id)
);

-- ---------------------------------------------------------------------------
-- teacher_ui_state — §4.2 TeacherUIState. One row per teacher; server-side so
-- expansion / filters / active view follow the teacher across devices.
-- ---------------------------------------------------------------------------
create table teacher_ui_state (
  teacher_id                  uuid primary key references teachers(id) on delete cascade,
  -- Array of {event_type, event_id} pairs for currently-expanded events.
  expanded_event_ids          jsonb not null default '[]',
  last_active_view            app_view not null default 'weekly',
  last_active_grade_level_id  uuid references grade_levels(id) on delete set null,
  view_mode                   view_mode not null default 'simple',
  filter_state                jsonb not null default '{}',
  panel_state                 jsonb not null default '{}',
  appearance_settings         jsonb not null default '{}',
  teaching_reminders_settings jsonb not null default
    '{"show_behavioral": true, "show_academic": true, "hide_all": false}',
  hide_missed_events          boolean not null default false,
  catch_up_global_enabled     boolean not null default true,
  updated_at                  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- saved_exports — §4.2 SavedExport. Only `snapshot` mode exports get a row;
-- `live` exports are downloaded and discarded. Grade-scoped.
-- ---------------------------------------------------------------------------
create table saved_exports (
  id                    uuid primary key default gen_random_uuid(),
  grade_level_id        uuid not null references grade_levels(id) on delete cascade,
  school_year_id        uuid references school_years(id) on delete set null,
  created_by_teacher_id uuid not null references teachers(id) on delete cascade,
  format                export_format not null,
  scope                 export_scope not null,
  scope_params          jsonb not null default '{}',
  mode                  export_mode not null default 'snapshot',
  data_version          export_data_version not null default 'master',
  include_completion    boolean not null default false,
  file_url              text,                          -- Supabase Storage (snapshots)
  label                 text,
  created_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- resources — §4.5a Resource (Phase 1B). The richer attachment model:
-- hosted files (Cloudflare R2) or external/youtube/drive links. The lightweight
-- jsonb `resources` arrays on events remain for the current frontend; this
-- table is the durable Phase 1B model.
-- ---------------------------------------------------------------------------
create table resources (
  id                       uuid primary key default gen_random_uuid(),
  owner_event_type         resource_owner_type not null,
  owner_event_id           uuid not null,             -- generic; not a hard FK
  kind                     resource_kind not null,
  display_label            text not null,
  display_order_within_event integer not null default 0,
  -- hosted_file fields --------------------------------------------------
  file_type                hosted_file_type,
  r2_object_keys           text[] not null default '{}',  -- multiple for image_stack
  file_size_bytes          bigint,
  original_filename        text,
  -- link fields (external / youtube / drive) ---------------------------
  url                      text,
  preview_title            text,
  preview_description      text,
  preview_thumbnail_url    text,
  preview_fetched_at       timestamptz,
  uploaded_by_id           uuid not null references teachers(id) on delete cascade,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint resource_kind_shape_chk check (
    (kind = 'hosted_file' and file_type is not null) or
    (kind in ('external_link','youtube_link','drive_link') and url is not null)
  )
);

-- ---------------------------------------------------------------------------
-- unit_start_records — §4.4 UnitStartRecord (Phase 2 entity). Records when a
-- teacher started a unit; powers reporting and the one-shot intro tooltip.
-- ---------------------------------------------------------------------------
create table unit_start_records (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  unit_id    uuid not null references units(id) on delete cascade,
  started_at timestamptz not null default now(),
  unique (teacher_id, unit_id)
);


-- #############################################################################
-- ## SECTION 7 — INFRASTRUCTURE  (built now per CLAUDE.md §5 — no UI yet)
-- #############################################################################

-- ---------------------------------------------------------------------------
-- audit_log — §4.2 AuditLog. Append-only; every mutation writes one row.
-- Actor is a teacher OR a school admin. Grade-scoped or school-wide.
-- ---------------------------------------------------------------------------
create table audit_log (
  id               uuid primary key default gen_random_uuid(),
  timestamp        timestamptz not null default now(),
  actor_teacher_id uuid references teachers(id) on delete set null,
  actor_admin_id   uuid references school_admins(id) on delete set null,
  -- Null for school-wide actions (e.g. grade activation).
  grade_level_id   uuid references grade_levels(id) on delete set null,
  school_id        uuid references schools(id) on delete set null,
  action           audit_action not null,
  entity_type      audit_entity,
  entity_id        uuid,
  -- Before/after diff for edits; old/new status for status changes; etc.
  metadata         jsonb not null default '{}'
);

-- ---------------------------------------------------------------------------
-- coverage_snapshots — §4.2 CoverageSnapshot. Computed nightly per
-- (school_year × grade × framework × subject). Write-only in Phase 1.
-- ---------------------------------------------------------------------------
create table coverage_snapshots (
  id                                       uuid primary key default gen_random_uuid(),
  school_year_id                           uuid not null references school_years(id) on delete cascade,
  grade_level_id                           uuid not null references grade_levels(id) on delete cascade,
  framework_id                             uuid not null references standards_frameworks(id) on delete cascade,
  -- Null for cross-subject framework summaries.
  subject_id                               uuid references subjects(id) on delete cascade,
  snapshot_date                            date not null default current_date,
  total_standards                          integer not null default 0,
  standards_touched_count                  integer not null default 0,
  standards_touched_in_completed_lessons_count integer not null default 0,
  total_lessons_tagged                     integer not null default 0,
  -- {teacher_id: standards_touched_count}
  per_teacher_coverage                     jsonb not null default '{}',
  metadata                                 jsonb not null default '{}',
  created_at                               timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- edit_undo_stack — §4.6 EditUndoStack. One row per edit; per-entity,
-- per-teacher. App keeps the 5 most recent per (entity, teacher); the cap is
-- enforced in app logic (oldest snapshot dropped on the 6th edit).
-- ---------------------------------------------------------------------------
create table edit_undo_stack (
  id          uuid primary key default gen_random_uuid(),
  entity_type undo_entity not null,
  entity_id   uuid not null,                          -- generic; not a hard FK
  teacher_id  uuid not null references teachers(id) on delete cascade,
  snapshot    jsonb not null,                         -- entity's prior state
  created_at  timestamptz not null default now()
);


-- #############################################################################
-- ## SECTION 8 — TRIGGERS  (updated_at maintenance)
-- #############################################################################
-- One trigger per table that has an `updated_at` column.

create trigger trg_schools_updated_at                    before update on schools                    for each row execute function set_updated_at();
create trigger trg_grade_levels_updated_at               before update on grade_levels               for each row execute function set_updated_at();
create trigger trg_teachers_updated_at                   before update on teachers                   for each row execute function set_updated_at();
create trigger trg_tga_updated_at                        before update on teacher_grade_assignments  for each row execute function set_updated_at();
create trigger trg_school_admins_updated_at              before update on school_admins              for each row execute function set_updated_at();
create trigger trg_school_years_updated_at               before update on school_years               for each row execute function set_updated_at();
create trigger trg_subjects_updated_at                   before update on subjects                   for each row execute function set_updated_at();
create trigger trg_stm_updated_at                        before update on subject_team_memberships   for each row execute function set_updated_at();
create trigger trg_units_updated_at                      before update on units                      for each row execute function set_updated_at();
create trigger trg_recurrence_patterns_updated_at        before update on recurrence_patterns        for each row execute function set_updated_at();
create trigger trg_master_events_updated_at              before update on master_core_lesson_events  for each row execute function set_updated_at();
create trigger trg_personal_copies_updated_at            before update on personal_core_lesson_event_copies for each row execute function set_updated_at();
create trigger trg_completion_status_updated_at          before update on completion_status          for each row execute function set_updated_at();
create trigger trg_day_events_updated_at                 before update on day_events                 for each row execute function set_updated_at();
create trigger trg_extra_lesson_events_updated_at        before update on extra_lesson_events        for each row execute function set_updated_at();
create trigger trg_recurrence_overrides_updated_at       before update on recurrence_instance_overrides for each row execute function set_updated_at();
create trigger trg_event_day_order_updated_at            before update on event_day_order_overrides  for each row execute function set_updated_at();
create trigger trg_time_blocks_updated_at                before update on time_blocks                for each row execute function set_updated_at();
create trigger trg_frameworks_updated_at                 before update on standards_frameworks       for each row execute function set_updated_at();
create trigger trg_gfa_updated_at                        before update on grade_framework_assignments for each row execute function set_updated_at();
create trigger trg_standards_updated_at                  before update on standards                  for each row execute function set_updated_at();
create trigger trg_teaching_reminders_updated_at         before update on teaching_reminders         for each row execute function set_updated_at();
create trigger trg_teacher_reminder_state_updated_at     before update on teacher_reminder_state     for each row execute function set_updated_at();
create trigger trg_tags_updated_at                       before update on tags                       for each row execute function set_updated_at();
create trigger trg_todos_updated_at                      before update on todos                      for each row execute function set_updated_at();
create trigger trg_comments_updated_at                   before update on comments                   for each row execute function set_updated_at();
create trigger trg_teacher_ui_state_updated_at           before update on teacher_ui_state           for each row execute function set_updated_at();
create trigger trg_resources_updated_at                  before update on resources                  for each row execute function set_updated_at();


-- #############################################################################
-- ## SECTION 9 — INDEXES
-- #############################################################################
-- §4.2 explicitly calls for the audit_log indexes below. The rest are FK /
-- hot-path indexes (Postgres does NOT auto-index FK columns).

-- audit_log — the three indexes §4.2 names explicitly.
create index idx_audit_log_actor_ts   on audit_log (actor_teacher_id, timestamp desc);
create index idx_audit_log_grade_ts   on audit_log (grade_level_id, timestamp desc);
create index idx_audit_log_entity     on audit_log (entity_type, entity_id);

-- Identity & roles
create index idx_grade_levels_school          on grade_levels (school_id);
create index idx_teachers_school              on teachers (school_id);
create index idx_tga_teacher                  on teacher_grade_assignments (teacher_id);
create index idx_tga_grade                    on teacher_grade_assignments (grade_level_id);
create index idx_school_admins_school         on school_admins (school_id);
create index idx_school_admins_teacher        on school_admins (teacher_id);

-- Curriculum structure
create index idx_school_years_school          on school_years (school_id);
create index idx_subjects_grade               on subjects (grade_level_id);
create index idx_subjects_owner               on subjects (owner_id);
create index idx_stm_subject                  on subject_team_memberships (subject_id);
create index idx_stm_teacher                  on subject_team_memberships (teacher_id);
create index idx_units_grade                  on units (grade_level_id);
create index idx_units_subject                on units (subject_id);
create index idx_units_school_year            on units (school_year_id);

-- Events & forking
create index idx_master_events_unit           on master_core_lesson_events (unit_id);
create index idx_master_events_subject        on master_core_lesson_events (subject_id);
create index idx_master_events_week_day       on master_core_lesson_events (week_number, day_of_week);
create index idx_personal_copies_teacher      on personal_core_lesson_event_copies (teacher_id);
create index idx_personal_copies_master       on personal_core_lesson_event_copies (master_core_lesson_event_id);
create index idx_completion_teacher           on completion_status (teacher_id);
create index idx_completion_event             on completion_status (core_lesson_event_id);
create index idx_day_events_grade_date        on day_events (grade_level_id, date);
create index idx_day_events_author            on day_events (author_id);
create index idx_extra_events_grade_date      on extra_lesson_events (grade_level_id, date);
create index idx_extra_events_teacher         on extra_lesson_events (teacher_id);
create index idx_extra_events_subject         on extra_lesson_events (subject_id);
create index idx_recurrence_patterns_owner    on recurrence_patterns (owner_id);
create index idx_recurrence_overrides_pattern on recurrence_instance_overrides (recurrence_pattern_id);
create index idx_event_day_order_teacher_date on event_day_order_overrides (teacher_id, date);
create index idx_time_blocks_teacher_grade    on time_blocks (teacher_id, grade_level_id);
create index idx_time_blocks_subject          on time_blocks (subject_id);

-- Standards
create index idx_frameworks_school            on standards_frameworks (owner_school_id);
create index idx_gfa_grade                    on grade_framework_assignments (grade_level_id);
create index idx_gfa_framework                on grade_framework_assignments (framework_id);
create index idx_standards_framework          on standards (framework_id);
create index idx_standards_grade              on standards (grade_level_id);
create index idx_standards_parent             on standards (parent_standard_id);

-- Collaboration
create index idx_daily_notes_teacher_date     on daily_notes (teacher_id, date);
create index idx_daily_notes_grade            on daily_notes (grade_level_id);
create index idx_teaching_reminders_school    on teaching_reminders (school_id);
create index idx_tags_grade                   on tags (grade_level_id);
create index idx_tags_owner                   on tags (owner_id);
create index idx_todos_grade                  on todos (grade_level_id);
create index idx_todos_author                 on todos (author_id);
create index idx_todos_assignee               on todos (assignee_id);
create index idx_comments_anchor              on comments (anchor_type, anchor_id);
create index idx_comments_grade               on comments (grade_level_id);
create index idx_comments_parent              on comments (parent_comment_id);
create index idx_comment_reads_teacher        on comment_reads (teacher_id);
create index idx_saved_exports_grade          on saved_exports (grade_level_id);
create index idx_resources_owner              on resources (owner_event_type, owner_event_id);
create index idx_unit_start_records_teacher   on unit_start_records (teacher_id);

-- Infrastructure
create index idx_coverage_snapshots_lookup    on coverage_snapshots (school_year_id, grade_level_id, framework_id);
create index idx_edit_undo_stack_entity       on edit_undo_stack (entity_type, entity_id, teacher_id);


-- #############################################################################
-- ## SECTION 10 — RLS HELPER FUNCTIONS
-- #############################################################################
-- `security definer` helpers centralise the repeated authorization checks so
-- policy bodies stay short. They run as the table owner and bypass RLS while
-- reading the role/membership tables — that is intentional and safe because
-- they only read, and they key strictly off auth.uid().

-- The set of grade_level ids the current auth user is assigned to teach.
create or replace function auth_teacher_grade_ids()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select grade_level_id
  from teacher_grade_assignments
  where teacher_id = auth.uid();
$$;

-- True if the current user has a `lead` or `grade_admin` role for the grade.
create or replace function is_grade_lead(p_grade_level_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from teacher_grade_assignments
    where teacher_id = auth.uid()
      and grade_level_id = p_grade_level_id
      and role in ('lead', 'grade_admin')
  );
$$;

-- True if the current user is a `grade_admin` for the grade (superset of lead:
-- audit log, aggregate completion, manage assignments).
create or replace function is_grade_admin(p_grade_level_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from teacher_grade_assignments
    where teacher_id = auth.uid()
      and grade_level_id = p_grade_level_id
      and role = 'grade_admin'
  );
$$;

-- True if the current user is a school admin for the given school.
create or replace function is_school_admin(p_school_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from school_admins
    where teacher_id = auth.uid()
      and school_id = p_school_id
  );
$$;

-- The school the current auth user belongs to.
create or replace function auth_teacher_school_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select school_id from teachers where id = auth.uid();
$$;

-- §4.2 RLS implication: master-edit is gated PER SUBJECT via
-- subject_team_memberships.can_edit_master, NOT at the grade level.
create or replace function can_edit_subject_master(p_subject_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from subject_team_memberships
    where subject_id = p_subject_id
      and teacher_id = auth.uid()
      and can_edit_master = true
  );
$$;

-- Convenience: true if the current user can read any data in the given grade
-- (assigned teacher OR a school admin of that grade's school).
create or replace function can_read_grade(p_grade_level_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    p_grade_level_id in (select grade_level_id from teacher_grade_assignments
                         where teacher_id = auth.uid())
    or exists (
      select 1
      from grade_levels g
      join school_admins sa on sa.school_id = g.school_id
      where g.id = p_grade_level_id
        and sa.teacher_id = auth.uid()
    );
$$;


-- #############################################################################
-- ## SECTION 11 — ROW-LEVEL SECURITY
-- #############################################################################
-- RLS is enabled on EVERY table. Baseline policy shape:
--   * read  — a teacher reads data for grades they are assigned to; school
--     admins read-all for their school.
--   * write — `lead`/`grade_admin` write master/team content for their grade;
--     master lesson edits are additionally gated per-subject via
--     can_edit_subject_master(); personal data is owner-only.
-- Where a policy would be very intricate, a reasonable baseline is given with
-- a `-- TODO refine` note — schema-shape correctness matters most in pass 1.

alter table schools                            enable row level security;
alter table grade_levels                       enable row level security;
alter table teachers                           enable row level security;
alter table teacher_grade_assignments          enable row level security;
alter table school_admins                      enable row level security;
alter table school_years                       enable row level security;
alter table subjects                           enable row level security;
alter table subject_team_memberships           enable row level security;
alter table units                              enable row level security;
alter table recurrence_patterns                enable row level security;
alter table master_core_lesson_events          enable row level security;
alter table personal_core_lesson_event_copies  enable row level security;
alter table completion_status                  enable row level security;
alter table day_events                         enable row level security;
alter table extra_lesson_events                enable row level security;
alter table recurrence_instance_overrides      enable row level security;
alter table event_day_order_overrides          enable row level security;
alter table time_blocks                        enable row level security;
alter table standards_frameworks               enable row level security;
alter table grade_framework_assignments        enable row level security;
alter table standards                          enable row level security;
alter table daily_notes                        enable row level security;
alter table teaching_reminders                 enable row level security;
alter table teacher_reminder_state             enable row level security;
alter table tags                               enable row level security;
alter table todos                              enable row level security;
alter table comments                           enable row level security;
alter table comment_reads                      enable row level security;
alter table teacher_ui_state                   enable row level security;
alter table saved_exports                      enable row level security;
alter table resources                          enable row level security;
alter table unit_start_records                 enable row level security;
alter table audit_log                          enable row level security;
alter table coverage_snapshots                 enable row level security;
alter table edit_undo_stack                    enable row level security;

-- ---------------------------------------------------------------------------
-- Identity & roles
-- ---------------------------------------------------------------------------

-- schools — readable by any member of the school; admins manage.
create policy schools_read on schools for select using (
  id = auth_teacher_school_id() or is_school_admin(id)
);
create policy schools_write on schools for all using (is_school_admin(id))
  with check (is_school_admin(id));

-- grade_levels — readable by everyone in the school; school admins manage
-- (activate/deactivate grades).
create policy grade_levels_read on grade_levels for select using (
  school_id = auth_teacher_school_id() or is_school_admin(school_id)
);
create policy grade_levels_write on grade_levels for all using (is_school_admin(school_id))
  with check (is_school_admin(school_id));

-- teachers — a teacher reads teammates in the same school (needed for author
-- chips, assignee pickers); a teacher updates only their own profile.
create policy teachers_read on teachers for select using (
  school_id = auth_teacher_school_id() or is_school_admin(school_id)
);
create policy teachers_update_self on teachers for update using (id = auth.uid())
  with check (id = auth.uid());
-- Insert is handled by an auth trigger / admin flow; school admins may insert.
create policy teachers_insert on teachers for insert
  with check (id = auth.uid() or is_school_admin(school_id));

-- teacher_grade_assignments — readable by anyone in the grade; managed by
-- grade_admin (for their grade) or school admin (school-wide).
create policy tga_read on teacher_grade_assignments for select using (
  can_read_grade(grade_level_id)
);
create policy tga_write on teacher_grade_assignments for all using (
  is_grade_admin(grade_level_id)
  or is_school_admin((select school_id from grade_levels g where g.id = grade_level_id))
) with check (
  is_grade_admin(grade_level_id)
  or is_school_admin((select school_id from grade_levels g where g.id = grade_level_id))
);

-- school_admins — readable within the school; managed by existing school admins.
create policy school_admins_read on school_admins for select using (
  school_id = auth_teacher_school_id() or is_school_admin(school_id)
);
create policy school_admins_write on school_admins for all using (is_school_admin(school_id))
  with check (is_school_admin(school_id));

-- ---------------------------------------------------------------------------
-- Curriculum structure
-- ---------------------------------------------------------------------------

-- school_years — readable school-wide; managed by school admins (start /
-- archive / configure holidays & Ramadan).
create policy school_years_read on school_years for select using (
  school_id = auth_teacher_school_id() or is_school_admin(school_id)
);
create policy school_years_write on school_years for all using (is_school_admin(school_id))
  with check (is_school_admin(school_id));

-- subjects — visibility: team subjects to the whole grade; personal subjects
-- only to their owner. Writes: team subjects by `lead`; personal subjects by
-- their owner. -- TODO refine: outside-grade extension needs school-admin sign-off.
create policy subjects_read on subjects for select using (
  (scope = 'team' and can_read_grade(grade_level_id))
  or (scope = 'personal' and owner_id = auth.uid())
  or is_grade_lead(grade_level_id)
);
create policy subjects_insert on subjects for insert with check (
  (scope = 'team'     and is_grade_lead(grade_level_id))
  or (scope = 'personal' and owner_id = auth.uid()
        and can_read_grade(grade_level_id))
);
create policy subjects_update on subjects for update using (
  (scope = 'team'     and is_grade_lead(grade_level_id))
  or (scope = 'personal' and owner_id = auth.uid())
) with check (
  (scope = 'team'     and is_grade_lead(grade_level_id))
  or (scope = 'personal' and owner_id = auth.uid())
);
create policy subjects_delete on subjects for delete using (
  (scope = 'team'     and is_grade_lead(grade_level_id))
  or (scope = 'personal' and owner_id = auth.uid())
);

-- subject_team_memberships — readable by anyone who can see the subject's
-- grade; managed by the grade `lead`. -- TODO refine: adding an outside-grade
-- teacher requires school-admin approval.
create policy stm_read on subject_team_memberships for select using (
  exists (select 1 from subjects s where s.id = subject_id and can_read_grade(s.grade_level_id))
);
create policy stm_write on subject_team_memberships for all using (
  exists (select 1 from subjects s where s.id = subject_id and is_grade_lead(s.grade_level_id))
) with check (
  exists (select 1 from subjects s where s.id = subject_id and is_grade_lead(s.grade_level_id))
);

-- units — readable within the grade; written by teachers who can edit the
-- unit's subject master (per-subject gate).
create policy units_read on units for select using (can_read_grade(grade_level_id));
create policy units_write on units for all using (
  can_edit_subject_master(subject_id) or is_grade_lead(grade_level_id)
) with check (
  can_edit_subject_master(subject_id) or is_grade_lead(grade_level_id)
);

-- ---------------------------------------------------------------------------
-- Events & forking
-- ---------------------------------------------------------------------------

-- recurrence_patterns — owner sees/edits personal patterns; team patterns are
-- visible to the whole school-year's grades. -- TODO refine: tie team-pattern
-- writes to subject membership once patterns carry a subject link.
create policy recurrence_patterns_read on recurrence_patterns for select using (
  owner_id = auth.uid()
  or (scope = 'team' and school_year_id in (
        select id from school_years where school_id = auth_teacher_school_id()))
);
create policy recurrence_patterns_write on recurrence_patterns for all using (
  owner_id = auth.uid() or scope = 'team'
) with check (
  owner_id = auth.uid() or scope = 'team'
);

-- master_core_lesson_events — readable within the grade (via unit→grade);
-- editing master is gated PER SUBJECT via can_edit_subject_master() (§4.2).
create policy master_events_read on master_core_lesson_events for select using (
  exists (select 1 from units u where u.id = unit_id and can_read_grade(u.grade_level_id))
);
create policy master_events_write on master_core_lesson_events for all using (
  can_edit_subject_master(subject_id)
) with check (
  can_edit_subject_master(subject_id)
);

-- personal_core_lesson_event_copies — a personal fork is visible and editable
-- ONLY by its owning teacher.
create policy personal_copies_owner on personal_core_lesson_event_copies for all using (
  teacher_id = auth.uid()
) with check (
  teacher_id = auth.uid()
);

-- completion_status — a teacher fully manages their own completion. Teammates
-- see it only when public; grade_admin sees aggregate completion for the grade.
create policy completion_owner on completion_status for all using (
  teacher_id = auth.uid()
) with check (
  teacher_id = auth.uid()
);
create policy completion_read_public on completion_status for select using (
  is_public = true
  and exists (
    select 1 from master_core_lesson_events m
    join units u on u.id = m.unit_id
    where m.id = core_lesson_event_id and can_read_grade(u.grade_level_id)
  )
);

-- day_events — readable within the grade; team events writable by any grade
-- teacher, personal events by their author. -- TODO refine.
create policy day_events_read on day_events for select using (
  can_read_grade(grade_level_id)
  and (scope = 'team' or author_id = auth.uid())
);
create policy day_events_write on day_events for all using (
  author_id = auth.uid()
  or (scope = 'team' and is_grade_lead(grade_level_id))
) with check (
  author_id = auth.uid()
  or (scope = 'team' and can_read_grade(grade_level_id))
);

-- extra_lesson_events — personal extras owner-only; team extras visible to the
-- grade. Author manages their own; lead manages team extras.
create policy extra_events_read on extra_lesson_events for select using (
  (scope = 'team' and can_read_grade(grade_level_id))
  or author_id = auth.uid()
  or teacher_id = auth.uid()
);
create policy extra_events_write on extra_lesson_events for all using (
  author_id = auth.uid()
  or (scope = 'team' and is_grade_lead(grade_level_id))
) with check (
  author_id = auth.uid()
  or (scope = 'team' and can_read_grade(grade_level_id))
);

-- recurrence_instance_overrides — follow the parent pattern's owner; team
-- overrides editable by anyone (skip is per-teacher in app logic). -- TODO refine.
create policy recurrence_overrides_rw on recurrence_instance_overrides for all using (
  exists (select 1 from recurrence_patterns p where p.id = recurrence_pattern_id
            and (p.owner_id = auth.uid() or p.scope = 'team'))
) with check (
  exists (select 1 from recurrence_patterns p where p.id = recurrence_pattern_id
            and (p.owner_id = auth.uid() or p.scope = 'team'))
);

-- event_day_order_overrides — strictly per-teacher (§4.2: one teacher's
-- reorder never affects a teammate's view).
create policy event_day_order_owner on event_day_order_overrides for all using (
  teacher_id = auth.uid()
) with check (
  teacher_id = auth.uid()
);

-- time_blocks — a teacher's schedule is their own (per teacher, per grade).
create policy time_blocks_owner on time_blocks for all using (
  teacher_id = auth.uid()
) with check (
  teacher_id = auth.uid() and can_read_grade(grade_level_id)
);

-- ---------------------------------------------------------------------------
-- Standards
-- ---------------------------------------------------------------------------

-- standards_frameworks — catalog frameworks are world-readable; school-uploaded
-- frameworks are private to their school and managed by its admins.
create policy frameworks_read on standards_frameworks for select using (
  provenance = 'catalog'
  or owner_school_id = auth_teacher_school_id()
  or is_school_admin(owner_school_id)
);
create policy frameworks_write on standards_frameworks for all using (
  provenance = 'school_uploaded' and is_school_admin(owner_school_id)
) with check (
  provenance = 'school_uploaded' and is_school_admin(owner_school_id)
);

-- grade_framework_assignments — readable within the grade; managed by lead /
-- school admin.
create policy gfa_read on grade_framework_assignments for select using (
  can_read_grade(grade_level_id)
);
create policy gfa_write on grade_framework_assignments for all using (
  is_grade_lead(grade_level_id)
) with check (
  is_grade_lead(grade_level_id)
);

-- standards — catalog-framework standards world-readable; school-uploaded
-- standards readable within the owning school; writes only by school admins
-- of school-uploaded frameworks. -- TODO refine.
create policy standards_read on standards for select using (
  exists (
    select 1 from standards_frameworks f
    where f.id = framework_id
      and (f.provenance = 'catalog'
           or f.owner_school_id = auth_teacher_school_id()
           or is_school_admin(f.owner_school_id))
  )
);
create policy standards_write on standards for all using (
  exists (select 1 from standards_frameworks f
          where f.id = framework_id and f.provenance = 'school_uploaded'
            and is_school_admin(f.owner_school_id))
) with check (
  exists (select 1 from standards_frameworks f
          where f.id = framework_id and f.provenance = 'school_uploaded'
            and is_school_admin(f.owner_school_id))
);

-- ---------------------------------------------------------------------------
-- Collaboration & teacher state
-- ---------------------------------------------------------------------------

-- daily_notes — personal only (§4.2): owner-only for everything.
create policy daily_notes_owner on daily_notes for all using (
  teacher_id = auth.uid()
) with check (
  teacher_id = auth.uid() and can_read_grade(grade_level_id)
);

-- teaching_reminders — readable by the school's teachers; managed by school
-- admins (the Phase 1 catalog is school-scoped, admin-curated).
create policy teaching_reminders_read on teaching_reminders for select using (
  school_id = auth_teacher_school_id() or is_school_admin(school_id)
);
create policy teaching_reminders_write on teaching_reminders for all using (
  is_school_admin(school_id)
) with check (
  is_school_admin(school_id)
);

-- teacher_reminder_state — strictly the owning teacher's row.
create policy teacher_reminder_state_owner on teacher_reminder_state for all using (
  teacher_id = auth.uid()
) with check (
  teacher_id = auth.uid()
);

-- tags — team tags visible to the grade & managed by lead; personal tags
-- owner-only.
create policy tags_read on tags for select using (
  (scope = 'team' and grade_level_id is not null and can_read_grade(grade_level_id))
  or (scope = 'personal' and owner_id = auth.uid())
);
create policy tags_write on tags for all using (
  (scope = 'team' and grade_level_id is not null and is_grade_lead(grade_level_id))
  or (scope = 'personal' and owner_id = auth.uid())
) with check (
  (scope = 'team' and grade_level_id is not null and is_grade_lead(grade_level_id))
  or (scope = 'personal' and owner_id = auth.uid())
);

-- todos — team todos visible to the grade; personal todos to their author.
-- Author manages their own; lead manages team todos.
create policy todos_read on todos for select using (
  (scope = 'team' and can_read_grade(grade_level_id))
  or author_id = auth.uid()
  or assignee_id = auth.uid()
);
create policy todos_write on todos for all using (
  author_id = auth.uid()
  or (scope = 'team' and is_grade_lead(grade_level_id))
) with check (
  author_id = auth.uid()
  or (scope = 'team' and can_read_grade(grade_level_id))
);

-- comments — readable by every teacher in the comment's grade; author edits
-- own; lead/grade_admin may delete (delete handled in app via deleted_at, so
-- update is permitted to lead too). -- TODO refine edit-vs-delete split.
create policy comments_read on comments for select using (
  can_read_grade(grade_level_id)
);
create policy comments_insert on comments for insert with check (
  author_id = auth.uid() and can_read_grade(grade_level_id)
);
create policy comments_update on comments for update using (
  author_id = auth.uid() or is_grade_lead(grade_level_id)
) with check (
  author_id = auth.uid() or is_grade_lead(grade_level_id)
);
create policy comments_delete on comments for delete using (
  author_id = auth.uid() or is_grade_lead(grade_level_id)
);

-- comment_reads — strictly the owning teacher's rows.
create policy comment_reads_owner on comment_reads for all using (
  teacher_id = auth.uid()
) with check (
  teacher_id = auth.uid()
);

-- teacher_ui_state — strictly the owning teacher's row.
create policy teacher_ui_state_owner on teacher_ui_state for all using (
  teacher_id = auth.uid()
) with check (
  teacher_id = auth.uid()
);

-- saved_exports — snapshots are visible to all teachers in the grade so any
-- teammate can re-download; lead may delete.
create policy saved_exports_read on saved_exports for select using (
  can_read_grade(grade_level_id)
);
create policy saved_exports_insert on saved_exports for insert with check (
  created_by_teacher_id = auth.uid() and can_read_grade(grade_level_id)
);
create policy saved_exports_delete on saved_exports for delete using (
  created_by_teacher_id = auth.uid() or is_grade_lead(grade_level_id)
);

-- resources — visibility/edit follows the owning event. The owner_event_id is
-- generic (no FK), so a precise grade check is deferred. Baseline: any teacher
-- in the uploader's school can read; uploader or a lead can write.
-- TODO refine: resolve owner_event → grade and gate read/write on that grade.
create policy resources_read on resources for select using (
  uploaded_by_id = auth.uid()
  or exists (select 1 from teachers t where t.id = uploaded_by_id
               and t.school_id = auth_teacher_school_id())
);
create policy resources_write on resources for all using (
  uploaded_by_id = auth.uid()
) with check (
  uploaded_by_id = auth.uid()
);

-- unit_start_records — strictly the owning teacher's rows.
create policy unit_start_records_owner on unit_start_records for all using (
  teacher_id = auth.uid()
) with check (
  teacher_id = auth.uid()
);

-- ---------------------------------------------------------------------------
-- Infrastructure
-- ---------------------------------------------------------------------------

-- audit_log — append-only. Any authenticated teacher may insert their own
-- entries (mutations log fire-and-forget). Reads: grade_admin for their grade,
-- school admin school-wide. -- TODO refine: lock inserts to a SECURITY DEFINER
-- RPC so actor fields can't be spoofed.
create policy audit_log_insert on audit_log for insert with check (
  actor_teacher_id = auth.uid() or actor_teacher_id is null
);
create policy audit_log_read on audit_log for select using (
  (grade_level_id is not null and is_grade_admin(grade_level_id))
  or (school_id is not null and is_school_admin(school_id))
);

-- coverage_snapshots — write-only in Phase 1 (nightly job). Reads (Phase 3):
-- grade_admin for their grade, school admin school-wide. The nightly job runs
-- with the service-role key, which bypasses RLS — so no insert policy here.
create policy coverage_snapshots_read on coverage_snapshots for select using (
  is_grade_admin(grade_level_id)
  or is_school_admin((select school_id from grade_levels g where g.id = grade_level_id))
);

-- edit_undo_stack — strictly the owning teacher's rows (§4.6: undo is always
-- against the teacher's own last edit, never a teammate's).
create policy edit_undo_stack_owner on edit_undo_stack for all using (
  teacher_id = auth.uid()
) with check (
  teacher_id = auth.uid()
);

-- =============================================================================
-- End of initial schema.
-- =============================================================================
