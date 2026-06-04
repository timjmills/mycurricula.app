-- ###########################################################################
-- ## Security hardening pass 2 (Codex findings #1, #2, #5-support)
-- ###########################################################################
-- Second tenant-safety pass over the planner schema. EVERY statement here is
-- ADDITIVE and IDEMPOTENT — safe to run on a live database holding production
-- data, and safe to re-run. Guards used:
--   * function  → CREATE OR REPLACE FUNCTION
--   * trigger   → DROP TRIGGER IF EXISTS ... then CREATE TRIGGER
--   * privilege → REVOKE / GRANT (idempotent by nature)
--
-- Cross-reference for the schema this migration depends on:
--   M1 = 20260518102823_initial_schema.sql
--   M4 = 20260601120000_planner_sections_personal.sql
--   M5 = 20260604120000_planner_scale_hardening.sql
--   M6 = 20260604140000_security_hardening.sql
--
-- Findings addressed (see per-section headers for the precise change):
--   #1  audit RPC forges school_id/grade  — bind p_school_id to the caller's
--                                           tenant + require the grade to live
--                                           in that school.
--   #2  master event derives a foreign    — BEFORE trigger validating that
--       grade from a guessed unit_id         unit_id belongs to subject_id.
--   #5  transactional section replace      — SECURITY INVOKER RPC that deletes
--       (support)                            + reinserts the caller's sections
--                                            atomically (RLS still applies).
-- ###########################################################################


-- ###########################################################################
-- ## FINDING #1 — audit RPC still forges arbitrary school_id / grade
-- ###########################################################################
-- M6 hardened log_audit_event() to require an authenticated caller and to
-- gate the grade via can_read_grade(), but it never validated p_school_id at
-- all. A caller could therefore stamp an audit row into ANY school (and, with
-- a NULL grade, evade the grade gate entirely), fabricating cross-tenant
-- history. Tighten the RPC so that:
--   * when p_school_id is non-null, it MUST equal the caller's own tenant
--     (auth_teacher_school_id());
--   * when BOTH p_grade_level_id and p_school_id are non-null, the grade MUST
--     belong to that school (no deriving a foreign grade into a valid school).
-- The existing null-uid guard and can_read_grade(p_grade_level_id) check are
-- preserved. Signature, SECURITY DEFINER, search_path, and the
-- REVOKE/GRANT are unchanged (idempotent). Fails closed on any mismatch.
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
  -- SECURITY DEFINER bypasses RLS, so it must never run unauthenticated —
  -- otherwise auth.uid() is NULL and the row is stamped with a null actor.
  if auth.uid() is null then
    raise exception 'log_audit_event requires an authenticated caller';
  end if;

  -- Grade gate (from M6): a caller may only log into a grade they can read.
  -- NULL grade = school-wide action, allowed through this check.
  if p_grade_level_id is not null and not can_read_grade(p_grade_level_id) then
    raise exception 'log_audit_event: caller cannot access grade %', p_grade_level_id;
  end if;

  -- School gate (#1): a non-null school MUST be the caller's own tenant. This
  -- closes the hole where a caller stamped audit rows into an arbitrary school
  -- (especially with a NULL grade, which evades the grade gate above).
  if p_school_id is not null and p_school_id is distinct from auth_teacher_school_id() then
    raise exception 'log_audit_event: caller cannot log into school %', p_school_id;
  end if;

  -- Cross-field consistency (#1): if both scopes are given, the grade must
  -- belong to the claimed school — otherwise a caller could pair a readable
  -- grade with their own school but reference a grade from a different school.
  if p_grade_level_id is not null and p_school_id is not null
     and not exists (
       select 1 from grade_levels g
       where g.id = p_grade_level_id
         and g.school_id = p_school_id
     ) then
    raise exception 'log_audit_event: grade % does not belong to school %',
      p_grade_level_id, p_school_id;
  end if;

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

-- Re-assert the execute grant (idempotent; signature unchanged from M5/M6).
revoke execute on function log_audit_event(audit_action, text, uuid, uuid, uuid, jsonb) from public;
grant execute on function log_audit_event(audit_action, text, uuid, uuid, uuid, jsonb) to authenticated;


-- ###########################################################################
-- ## FINDING #2 — master_events_write is subject-only; a guessed unit_id
-- ##              from another grade can be derived in
-- ###########################################################################
-- master_events_write (M1:1337) only checks can_edit_subject_master(subject_id).
-- So a teacher with master-edit on subject X could INSERT a
-- master_core_lesson_events row whose unit_id belongs to ANOTHER grade/subject;
-- the M5 grade-derivation trigger (set_master_event_grade_level) then derives
-- that FOREIGN grade onto the row, mis-scoping the lesson into a grade the
-- caller never had authority over.
--
-- Close the hole with a BEFORE INSERT OR UPDATE trigger that fails closed
-- unless the row's unit_id actually belongs to its subject_id. units carries
-- subject_id (M1:347, confirmed), so this is an authoritative check. With this
-- in place the derived grade_level_id is trustworthy: a unit that belongs to
-- the row's subject also belongs to that subject's grade, which the master-edit
-- grant is scoped to.
--
-- Trigger ordering: Postgres fires BEFORE row triggers in trigger-NAME order
-- (alphabetical). This validation trigger is named trg_master_events_validate_unit,
-- which sorts before trg_master_events_grade_level ("validate" > "grade"? no —
-- 'g' < 'v'), so the grade-derivation trigger would actually run first. That is
-- fine: both are BEFORE triggers on the same write, and a RAISE in EITHER aborts
-- the entire statement before the row is persisted. The validation does not
-- depend on the derived grade (it checks unit↔subject directly), so order is
-- immaterial — if the unit/subject pair is invalid the write is rejected
-- regardless of which BEFORE trigger fires first.
create or replace function validate_master_event_unit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from units u
    where u.id = new.unit_id
      and u.subject_id = new.subject_id
  ) then
    raise exception
      'master_core_lesson_events: unit % does not belong to subject %',
      new.unit_id, new.subject_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_master_events_validate_unit on master_core_lesson_events;
create trigger trg_master_events_validate_unit
  before insert or update on master_core_lesson_events
  for each row execute function validate_master_event_unit();


-- ###########################################################################
-- ## FINDING #5 (support) — transactional section replace RPC
-- ###########################################################################
-- The planner supabase-source calls this for ATOMIC section replacement: the
-- delete-then-reinsert of a lesson's sections happens in ONE function call, so
-- a failed reinsert never leaves the lesson with its sections deleted.
--
-- SECURITY INVOKER (the default, stated explicitly for clarity): RLS and the
-- M4/M6 lesson_sections policies + the validate_lesson_section_parent() trigger
-- (M6) all still evaluate against the CALLER. This RPC is sugar for an atomic
-- delete+insert, NOT a privilege escalation — every row written must pass the
-- caller's own write policy and parent-validation, exactly as if the client
-- had issued the statements itself.
--
-- Column mapping (caller passes a JSON array; each element → one row):
--   p_sections[i] ->> 'heading'             -> heading            (text, default '')
--   p_sections[i] ->> 'prompt'              -> prompt             (text, default '')
--   p_sections[i] ->> 'body'                -> body               (text, default '')
--   p_sections[i] -> 'resources'            -> resources          (jsonb, default '[]')
--   p_sections[i] ->> 'display_order'       -> display_order      (integer, default 0)
--   p_sections[i] ->> 'template_section_id' -> template_section_id (uuid, nullable)
-- Fixed per-call (NOT read from the element):
--   owner_lesson_id := p_owner_lesson_id
--   owner_kind      := p_owner_kind
--   owner_id        := p_owner_id            (null for team/master sections)
--   grade_level_id  := p_grade_level_id
-- id / created_at / updated_at are DB-managed (defaults / triggers).
create or replace function replace_lesson_sections(
  p_owner_lesson_id uuid,
  p_owner_kind      text,
  p_owner_id        uuid,
  p_grade_level_id  uuid,
  p_sections        jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Clear the caller's existing rows for this lesson. `is not distinct from`
  -- matches a NULL owner_id (team/master sections) as well as a concrete owner,
  -- so the delete scope mirrors exactly what we are about to reinsert.
  delete from lesson_sections
   where owner_lesson_id = p_owner_lesson_id
     and owner_id is not distinct from p_owner_id
     and owner_kind = p_owner_kind::lesson_owner_kind;

  -- Reinsert one row per element of the JSON array. coalesce() reproduces the
  -- table defaults when a key is absent. A NULL p_sections (or a JSON array
  -- with zero elements) inserts nothing — leaving the lesson with no sections,
  -- which is the intended "cleared" state.
  insert into lesson_sections (
    owner_kind,
    owner_lesson_id,
    owner_id,
    grade_level_id,
    template_section_id,
    heading,
    prompt,
    body,
    resources,
    display_order
  )
  select
    p_owner_kind::lesson_owner_kind,
    p_owner_lesson_id,
    p_owner_id,
    p_grade_level_id,
    nullif(elem ->> 'template_section_id', '')::uuid,
    coalesce(elem ->> 'heading', ''),
    coalesce(elem ->> 'prompt', ''),
    coalesce(elem ->> 'body', ''),
    coalesce(elem -> 'resources', '[]'::jsonb),
    coalesce((elem ->> 'display_order')::integer, 0)
  from jsonb_array_elements(coalesce(p_sections, '[]'::jsonb)) as elem;
end;
$$;

revoke execute on function replace_lesson_sections(uuid, text, uuid, uuid, jsonb) from public;
grant execute on function replace_lesson_sections(uuid, text, uuid, uuid, jsonb) to authenticated;


-- ###########################################################################
-- End of security hardening pass 2.
-- ###########################################################################
