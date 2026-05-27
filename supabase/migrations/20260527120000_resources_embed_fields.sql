-- Phase 1B — resources embed slice.
-- Extends the dormant `resources` table (added in
-- 20260518102823_initial_schema.sql:839-864) with the columns the embed
-- renderer + composer need, tightens RLS to a proper team check, and
-- enforces the per-event count limits Tim set in the 2026-05-27 brief:
--   ≤10 hosted files (pdf/docx/rtf) per (owner_event_type, owner_event_id)
--   ≤10 hosted images (image/image_stack) per (owner_event_type, owner_event_id)
--   links unlimited

-- ── 1. Columns ──────────────────────────────────────────────────────────────
alter table resources
  add column if not exists display_mode text
    check (display_mode in ('literal', 'hyperlink', 'thumbnail'))
    default 'thumbnail',
  add column if not exists link_text text,
  add column if not exists mime_type text,
  add column if not exists width int,
  add column if not exists height int,
  add column if not exists position int not null default 0,
  add column if not exists provider text;

-- Sanity check on `provider` values — kept as a text column (not an enum)
-- so adding a new provider later doesn't require a schema migration.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'resources_provider_chk'
  ) then
    alter table resources
      add constraint resources_provider_chk check (
        provider is null or provider in (
          'youtube', 'vimeo', 'gslides', 'gdocs', 'gsheets', 'gdrive',
          'pdf', 'image', 'video', 'audio', 'website'
        )
      );
  end if;
end $$;

-- Index for the in-event ordering used by the renderer.
create index if not exists idx_resources_owner_position
  on resources (owner_event_type, owner_event_id, position);


-- ── 2. RLS helper — auth_can_access_event ───────────────────────────────────
-- Resolve a polymorphic (owner_event_type, owner_event_id) pointer to whether
-- the current auth.uid() can read/write resources attached to it. Used by
-- the resources_read policy below. Mirrors the per-table baseline policies
-- already established in 20260518102823_initial_schema.sql §11.
create or replace function auth_can_access_event(
  p_owner_event_type resource_owner_type,
  p_owner_event_id   uuid
)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case p_owner_event_type
    when 'core_lesson_event' then exists (
      select 1
        from master_core_lesson_events m
        join units u on u.id = m.unit_id
       where m.id = p_owner_event_id
         and can_read_grade(u.grade_level_id)
    )
    when 'extra_lesson_event' then exists (
      select 1
        from extra_lesson_events e
       where e.id = p_owner_event_id
         and (e.author_id = auth.uid()
              or e.teacher_id = auth.uid()
              or (e.scope = 'team' and can_read_grade(e.grade_level_id)))
    )
    when 'day_event' then exists (
      select 1
        from day_events d
       where d.id = p_owner_event_id
         and can_read_grade(d.grade_level_id)
         and (d.scope = 'team' or d.author_id = auth.uid())
    )
    when 'unit' then exists (
      select 1
        from units u
       where u.id = p_owner_event_id
         and can_read_grade(u.grade_level_id)
    )
    when 'personal_subject' then exists (
      select 1
        from subjects s
       where s.id = p_owner_event_id
         and s.owner_id = auth.uid()
    )
    else false
  end;
$$;


-- ── 3. Tightened RLS policies ───────────────────────────────────────────────
-- Old policies (read = any teacher in school, write = uploader-only) were
-- baseline-only. Replace with the helper above for read, and split write
-- into _insert / _update / _delete so the read-side gate is a team check
-- while the write-side stays uploader-only.
drop policy if exists resources_read   on resources;
drop policy if exists resources_write  on resources;
drop policy if exists resources_insert on resources;
drop policy if exists resources_update on resources;
drop policy if exists resources_delete on resources;

create policy resources_read on resources for select using (
  auth_can_access_event(owner_event_type, owner_event_id)
);

create policy resources_insert on resources for insert with check (
  uploaded_by_id = auth.uid()
  and auth_can_access_event(owner_event_type, owner_event_id)
);

create policy resources_update on resources for update using (
  uploaded_by_id = auth.uid()
) with check (
  uploaded_by_id = auth.uid()
);

create policy resources_delete on resources for delete using (
  uploaded_by_id = auth.uid()
);


-- ── 4. Count-enforcement trigger ────────────────────────────────────────────
-- Per Tim's 2026-05-27 brief: ≤10 hosted_file rows of (pdf|docx|rtf) per
-- owner event; ≤10 of (image|image_stack); links unlimited. The API route
-- pre-checks counts before presigning, so this trigger only fires on race
-- conditions or direct DB inserts.
create or replace function enforce_resource_limits()
returns trigger
language plpgsql
as $$
declare
  doc_count   int;
  image_count int;
begin
  if new.kind <> 'hosted_file' then
    return new;
  end if;

  if new.file_type in ('pdf', 'docx', 'rtf') then
    select count(*) into doc_count
      from resources
     where owner_event_type = new.owner_event_type
       and owner_event_id   = new.owner_event_id
       and kind             = 'hosted_file'
       and file_type        in ('pdf', 'docx', 'rtf')
       and id <> new.id;
    if doc_count >= 10 then
      raise exception 'resource_limit_files'
        using hint = 'Up to 10 files per lesson.';
    end if;
  end if;

  if new.file_type in ('image', 'image_stack') then
    select count(*) into image_count
      from resources
     where owner_event_type = new.owner_event_type
       and owner_event_id   = new.owner_event_id
       and kind             = 'hosted_file'
       and file_type        in ('image', 'image_stack')
       and id <> new.id;
    if image_count >= 10 then
      raise exception 'resource_limit_images'
        using hint = 'Up to 10 images per lesson.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_resources_enforce_limits on resources;
create trigger trg_resources_enforce_limits
  before insert on resources
  for each row execute function enforce_resource_limits();
