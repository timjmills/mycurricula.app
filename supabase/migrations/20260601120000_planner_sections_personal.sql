-- ###########################################################################
-- ## Planner sections + personal (teacher-authored) lessons
-- ###########################################################################
-- Closes the two schema gaps the planner Supabase source (lib/planner/
-- supabase-source.ts) flagged:
--
--   1. No table for editable lesson SECTIONS — the frontend
--      `LessonSectionContent` (heading / prompt / body / ordered resources) had
--      nowhere to persist, so section headings/bodies/order were lost and
--      getSections could only synthesize a single section from the lesson's flat
--      `resources` jsonb. This adds `lesson_sections`.
--   2. No home for a teacher-AUTHORED lesson (createLesson) — a brand-new
--      personal lesson with NO master to fork. `personal_core_lesson_event_copies`
--      requires a master FK, and `extra_lesson_events` is date-keyed, not
--      week/day-keyed. This adds `personal_authored_lessons`.
--
-- Both are ADDITIVE (new tables only) — nothing existing changes, so the
-- grid-era + mock paths are untouched. RLS mirrors the established planner
-- doctrine: personal/owner-scoped rows are owner-only; a section inherits its
-- parent lesson's grade visibility.
--
-- PRIVACY (plan §11.4): STRUCTURE only — heading/prompt/body are teacher lesson
-- content, never student names.

-- ---------------------------------------------------------------------------
-- lesson_sections — the editable section content for a lesson (any owner kind).
-- A section belongs to exactly one lesson, identified polymorphically by
-- (owner_kind, owner_lesson_id) so it can hang off a master event, a personal
-- fork copy, or a personal-authored lesson without three FK columns. Resources
-- stay in the section's `resources` jsonb (the lightweight inline shape the
-- frontend uses); the richer `resources` table remains the later normalization.
-- ---------------------------------------------------------------------------
create type lesson_owner_kind as enum ('master', 'personal_copy', 'personal_authored');

create table lesson_sections (
  id                 uuid primary key default gen_random_uuid(),
  -- Which lesson entity this section belongs to (polymorphic, not a hard FK so
  -- it can reference any of the three lesson tables).
  owner_kind         lesson_owner_kind not null,
  owner_lesson_id    uuid not null,
  -- The owning teacher (null for a team/master section visible grade-wide).
  owner_id           uuid references teachers(id) on delete cascade,
  -- Grade for RLS scoping (denormalized from the parent lesson).
  grade_level_id     uuid not null references grade_levels(id) on delete cascade,
  -- The template section this came from, or null for an ad-hoc section.
  template_section_id uuid,
  -- Rich-text HTML (styled independently of the body).
  heading            text not null default '',
  -- Guiding prompt shown as placeholder while the body is empty.
  prompt             text not null default '',
  -- Rich-text HTML body.
  body               text not null default '',
  -- Ordered inline resources: array of {id, type, url, label} (structure only).
  resources          jsonb not null default '[]',
  display_order      integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index idx_lesson_sections_owner on lesson_sections (owner_kind, owner_lesson_id);
create index idx_lesson_sections_grade on lesson_sections (grade_level_id);
create index idx_lesson_sections_owner_id on lesson_sections (owner_id);

-- ---------------------------------------------------------------------------
-- personal_authored_lessons — a teacher's OWN lesson with no master to fork
-- (createLesson). Week/day-keyed like the curriculum grid (unlike the date-keyed
-- extra_lesson_events). Mirrors the master event's content columns so the same
-- domain mapper handles it.
-- ---------------------------------------------------------------------------
create table personal_authored_lessons (
  id                       uuid primary key default gen_random_uuid(),
  owner_id                 uuid not null references teachers(id) on delete cascade,
  grade_level_id           uuid not null references grade_levels(id) on delete cascade,
  unit_id                  uuid references units(id) on delete set null,
  subject_id               uuid not null references subjects(id) on delete cascade,
  week_number              integer not null,
  day_of_week              weekday not null,
  title                    text not null,
  directions               text,
  learning_objectives      jsonb not null default '[]',
  notes                    text,
  resources                jsonb not null default '[]',
  standards                uuid[] not null default '{}',
  display_order_within_day integer not null default 0,
  status                   text,
  reason_not_done          text,
  deleted_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index idx_personal_authored_owner on personal_authored_lessons (owner_id);
create index idx_personal_authored_grade_week
  on personal_authored_lessons (grade_level_id, week_number);

-- ---------------------------------------------------------------------------
-- Triggers — keep updated_at fresh (reuse the existing set_updated_at()).
-- ---------------------------------------------------------------------------
create trigger trg_lesson_sections_updated_at
  before update on lesson_sections
  for each row execute function set_updated_at();
create trigger trg_personal_authored_lessons_updated_at
  before update on personal_authored_lessons
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — owner-scoped writes; reads follow the parent lesson's grade visibility.
-- ---------------------------------------------------------------------------
alter table lesson_sections           enable row level security;
alter table personal_authored_lessons enable row level security;

-- lesson_sections: a teacher reads sections for a grade they can read (master/
-- team sections, owner_id null) PLUS their own personal sections; writes only
-- their own (owner_id = auth.uid()). Master/team section authoring rides the
-- same grade-membership doctrine as master lessons (can_read_grade).
create policy lesson_sections_read on lesson_sections for select using (
  (owner_id is null and can_read_grade(grade_level_id))
  or owner_id = auth.uid()
);
create policy lesson_sections_write on lesson_sections for all using (
  case
    when owner_id is null then can_read_grade(grade_level_id)
    else owner_id = auth.uid()
  end
) with check (
  case
    when owner_id is null then can_read_grade(grade_level_id)
    else owner_id = auth.uid()
  end
);

-- personal_authored_lessons: strictly owner-only (a teacher's own lessons).
create policy personal_authored_owner on personal_authored_lessons for all using (
  owner_id = auth.uid()
) with check (
  owner_id = auth.uid()
);
