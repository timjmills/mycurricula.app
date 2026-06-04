-- ###########################################################################
-- ## Planner scale hardening
-- ###########################################################################
-- Scale + tenant-safety pass over the planner schema. EVERY statement in this
-- migration is ADDITIVE and IDEMPOTENT — it is safe to run on a live database
-- that already holds production data, and safe to re-run. Guards used:
--   * add column      → ADD COLUMN IF NOT EXISTS
--   * backfill        → UPDATE ... WHERE col IS NULL  (no-op on a second run)
--   * index           → CREATE INDEX IF NOT EXISTS  (plain, NOT CONCURRENTLY —
--                       CONCURRENTLY is illegal inside the migration tx)
--   * function        → CREATE OR REPLACE FUNCTION
--   * trigger         → DROP TRIGGER IF EXISTS ... then CREATE TRIGGER
--   * policy          → DROP POLICY IF EXISTS ... then CREATE POLICY
--
-- Ordering is deliberate and matters: within each table we add the column,
-- backfill existing rows, install the keep-it-filled trigger, then build the
-- index that depends on the column, and only then swap the policies that read
-- it. Sections that only touch policies/functions run after the columns they
-- depend on already exist.
--
-- Sections:
--   1. Denormalize grade_level_id onto the two hot lesson tables (the #1 scale
--      fix — removes the units join from the hottest read path) + a keep-filled
--      BEFORE trigger on each.
--   2. archived_at on personal copies (a teacher hiding a master lesson for
--      themselves only).
--   3. deleted_at partial indexes + missing hot/FK indexes.
--   4. Rewrite can_read_grade() for one-shot assignment-set evaluation
--      (identical security semantics).
--   5. Swap the two hottest read policies onto the local grade_level_id column.
--   6. Tenant-safety (P0): scope team recurrence writes to the writer's school;
--      tighten recurrence-override writes; lock audit_log inserts to the caller
--      + add a SECURITY DEFINER server-path insert RPC.
--   7. daily_notes.updated_at + its keep-filled trigger.
-- ###########################################################################


-- ###########################################################################
-- ## SECTION 1 — DENORMALIZE grade_level_id (the #1 scale fix)
-- ###########################################################################
-- master_core_lesson_events / personal_core_lesson_event_copies previously had
-- to JOIN units to resolve their grade on every read. We carry grade_level_id
-- locally and keep it filled with a BEFORE trigger so policies can drop the
-- join. Order: add column → backfill → trigger.

-- --- master_core_lesson_events --------------------------------------------
alter table master_core_lesson_events
  add column if not exists grade_level_id uuid references grade_levels(id);

-- Backfill from the lesson's unit. Idempotent: only touches NULL rows.
update master_core_lesson_events m
   set grade_level_id = u.grade_level_id
  from units u
 where u.id = m.unit_id
   and m.grade_level_id is null;

-- --- personal_core_lesson_event_copies ------------------------------------
alter table personal_core_lesson_event_copies
  add column if not exists grade_level_id uuid references grade_levels(id);

-- Backfill via the copy's own unit_id (a personal copy always has a unit_id —
-- it is NOT NULL on this table). Idempotent: only touches NULL rows.
update personal_core_lesson_event_copies p
   set grade_level_id = u.grade_level_id
  from units u
 where u.id = p.unit_id
   and p.grade_level_id is null;

-- Defensive fallback: if any copy still lacks a grade (e.g. its unit row was
-- removed), inherit the grade from the master row it forked from.
update personal_core_lesson_event_copies p
   set grade_level_id = m.grade_level_id
  from master_core_lesson_events m
 where m.id = p.master_core_lesson_event_id
   and p.grade_level_id is null
   and m.grade_level_id is not null;

-- --- keep-filled trigger function (shared shape, one fn per table) ---------
-- On INSERT/UPDATE, if the caller did not supply grade_level_id, derive it from
-- the row's unit_id. Lets every write path stay grade-agnostic while the column
-- is always populated for the read policies below.
create or replace function set_master_event_grade_level()
returns trigger
language plpgsql
as $$
begin
  if new.grade_level_id is null then
    new.grade_level_id := (select grade_level_id from units where id = new.unit_id);
  end if;
  return new;
end;
$$;

create or replace function set_personal_copy_grade_level()
returns trigger
language plpgsql
as $$
begin
  if new.grade_level_id is null then
    new.grade_level_id := (select grade_level_id from units where id = new.unit_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_master_events_grade_level on master_core_lesson_events;
create trigger trg_master_events_grade_level
  before insert or update on master_core_lesson_events
  for each row execute function set_master_event_grade_level();

drop trigger if exists trg_personal_copies_grade_level on personal_core_lesson_event_copies;
create trigger trg_personal_copies_grade_level
  before insert or update on personal_core_lesson_event_copies
  for each row execute function set_personal_copy_grade_level();


-- ###########################################################################
-- ## SECTION 2 — archived_at FOR PERSONAL DELETE
-- ###########################################################################
-- A teacher can hide a master lesson for THEMSELVES only by archiving their
-- personal copy (a personal soft-delete that never touches the master row).
alter table personal_core_lesson_event_copies
  add column if not exists archived_at timestamptz;


-- ###########################################################################
-- ## SECTION 3 — deleted_at PARTIAL INDEXES + MISSING HOT INDEXES
-- ###########################################################################
-- Partial indexes on (… ) WHERE deleted_at IS NULL keep the live-row indexes
-- small and let the planner skip soft-deleted rows on the hot read paths.

-- master_core_lesson_events — live rows by grade / unit / week-day slot.
create index if not exists idx_master_events_grade_live
  on master_core_lesson_events (grade_level_id)
  where deleted_at is null;
create index if not exists idx_master_events_unit_live
  on master_core_lesson_events (unit_id)
  where deleted_at is null;
create index if not exists idx_master_events_week_day_live
  on master_core_lesson_events (week_number, day_of_week)
  where deleted_at is null;

-- personal_core_lesson_event_copies — grade lookups for the denormalized column.
create index if not exists idx_personal_copies_grade
  on personal_core_lesson_event_copies (grade_level_id);

-- personal_authored_lessons — live rows by grade + week (planner grid lookup).
create index if not exists idx_personal_authored_grade_week_live
  on personal_authored_lessons (grade_level_id, week_number)
  where deleted_at is null;

-- comments — live comments by grade, newest first.
create index if not exists idx_comments_grade_created_live
  on comments (grade_level_id, created_at)
  where deleted_at is null;

-- Missing FK / hot-path indexes (Postgres does not auto-index FK columns).
create index if not exists idx_extra_events_author
  on extra_lesson_events (author_id);
create index if not exists idx_comments_author
  on comments (author_id);
create index if not exists idx_recurrence_patterns_school_year
  on recurrence_patterns (school_year_id);
create index if not exists idx_saved_exports_school_year
  on saved_exports (school_year_id);
create index if not exists idx_coverage_snapshots_subject
  on coverage_snapshots (subject_id);
create index if not exists idx_boards_published_by
  on boards (published_by);


-- ###########################################################################
-- ## SECTION 4 — OPTIMIZE can_read_grade()  (was M1:1139)
-- ###########################################################################
-- Same security semantics as the original: TRUE iff the caller is assigned to
-- the grade OR is an admin of that grade's school. The teacher branch is
-- rewritten to `= ANY(auth_teacher_grade_ids())` so the assignment set is
-- evaluated once; the school-admin EXISTS is the short-circuited second branch.
-- Signature, SECURITY DEFINER, STABLE, and search_path are all unchanged.
create or replace function can_read_grade(p_grade_level_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    p_grade_level_id = any (auth_teacher_grade_ids())
    or exists (
      select 1
      from grade_levels g
      join school_admins sa on sa.school_id = g.school_id
      where g.id = p_grade_level_id
        and sa.teacher_id = auth.uid()
    );
$$;


-- ###########################################################################
-- ## SECTION 5 — SWAP HOT READ POLICIES TO THE LOCAL COLUMN
-- ###########################################################################
-- Now that grade_level_id is denormalized + kept filled (Section 1), the
-- hottest read policies drop their units join and read the local column.

-- master_core_lesson_events — read uses the local grade column, no units join.
-- (master_events_write stays subject-scoped and is intentionally untouched.)
drop policy if exists master_events_read on master_core_lesson_events;
create policy master_events_read on master_core_lesson_events for select using (
  can_read_grade(grade_level_id)
);

-- completion_status — public completion is for MASTER lessons; resolve the
-- master event's local grade (no units join). The owner policy still covers a
-- teacher's own private completion rows.
drop policy if exists completion_read_public on completion_status;
create policy completion_read_public on completion_status for select using (
  is_public = true
  and exists (
    select 1 from master_core_lesson_events e
    where e.id = core_lesson_event_id
      and can_read_grade(e.grade_level_id)
  )
);


-- ###########################################################################
-- ## SECTION 6 — TENANT-SAFETY FIXES (P0)
-- ###########################################################################

-- --- recurrence_patterns_write --------------------------------------------
-- Previously a 'team' pattern was writable by ANY authenticated user in ANY
-- school. Scope the team branch to the writer's own school via the pattern's
-- school_year_id, closing a cross-tenant write hole.
drop policy if exists recurrence_patterns_write on recurrence_patterns;
create policy recurrence_patterns_write on recurrence_patterns for all using (
  owner_id = auth.uid()
  or (scope = 'team' and school_year_id in (
        select id from school_years where school_id = auth_teacher_school_id()))
) with check (
  owner_id = auth.uid()
  or (scope = 'team' and school_year_id in (
        select id from school_years where school_id = auth_teacher_school_id()))
);

-- --- recurrence_overrides_rw ----------------------------------------------
-- Mirror the same constraint on per-instance overrides: the parent pattern must
-- be the caller's own OR a team pattern in the caller's school. This prevents a
-- user in another tenant from editing overrides on a team pattern.
drop policy if exists recurrence_overrides_rw on recurrence_instance_overrides;
create policy recurrence_overrides_rw on recurrence_instance_overrides for all using (
  exists (
    select 1 from recurrence_patterns p
    where p.id = recurrence_pattern_id
      and (
        p.owner_id = auth.uid()
        or (p.scope = 'team' and p.school_year_id in (
              select id from school_years where school_id = auth_teacher_school_id()))
      )
  )
) with check (
  exists (
    select 1 from recurrence_patterns p
    where p.id = recurrence_pattern_id
      and (
        p.owner_id = auth.uid()
        or (p.scope = 'team' and p.school_year_id in (
              select id from school_years where school_id = auth_teacher_school_id()))
      )
  )
);

-- --- audit_log_insert ------------------------------------------------------
-- Remove the forgeable `OR actor_teacher_id IS NULL` escape hatch: a client
-- could previously insert an audit row with a null actor (or, via the null
-- branch, never have its actor verified). Inserts must now stamp the caller.
drop policy if exists audit_log_insert on audit_log;
create policy audit_log_insert on audit_log for insert with check (
  actor_teacher_id = auth.uid()
);

-- Sanctioned server path: a SECURITY DEFINER RPC that stamps
-- actor_teacher_id = auth.uid() server-side so application code never sets the
-- actor itself. entity_type is taken as text and cast to the audit_entity enum
-- (NULL passes through for school-wide / entity-less actions).
create or replace function log_audit_event(
  p_action          audit_action,
  p_entity_type     text,
  p_entity_id       uuid,
  p_grade_level_id  uuid,
  p_school_id       uuid,
  p_metadata        jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into audit_log (
    actor_teacher_id,
    grade_level_id,
    school_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    auth.uid(),
    p_grade_level_id,
    p_school_id,
    p_action,
    nullif(p_entity_type, '')::audit_entity,
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;


-- ###########################################################################
-- ## SECTION 7 — daily_notes.updated_at
-- ###########################################################################
-- daily_notes shipped without updated_at (and so without the shared
-- keep-updated trigger). Add the column and attach the existing
-- set_updated_at() trigger function so edits are timestamped like every other
-- table. DEFAULT now() backfills existing rows in place.
alter table daily_notes
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_daily_notes_updated_at on daily_notes;
create trigger trg_daily_notes_updated_at
  before update on daily_notes
  for each row execute function set_updated_at();

-- ###########################################################################
-- End of planner scale hardening.
-- ###########################################################################
