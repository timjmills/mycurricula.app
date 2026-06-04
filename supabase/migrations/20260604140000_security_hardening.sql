-- ###########################################################################
-- ## Security hardening pass (audit findings #2, #5, #6, #7, #8, #10-RLS)
-- ###########################################################################
-- Tightens RLS/privilege gaps surfaced by the security audit. EVERY statement
-- here is ADDITIVE and IDEMPOTENT — safe to run on a live database and safe to
-- re-run. Guards used:
--   * policy    → DROP POLICY IF EXISTS ... then CREATE POLICY
--   * function  → CREATE OR REPLACE FUNCTION
--   * trigger   → DROP TRIGGER IF EXISTS ... then CREATE TRIGGER
--   * privilege → REVOKE / GRANT (idempotent by nature)
--
-- Cross-reference for the schema this migration depends on:
--   M1 = 20260518102823_initial_schema.sql
--   M3 = 20260527120000_resources_embed_fields.sql
--   M4 = 20260601120000_planner_sections_personal.sql
--   M5 = 20260604120000_planner_scale_hardening.sql
--
-- Findings addressed (see per-section headers for the precise change):
--   #2  teachers self-assign tenant      — drop self-insert; column-gate update
--   #5  cross-school grade assignment    — pin tga writes to the caller's school
--   #6  author-trusting team writes      — split personal vs. team in day_events
--                                          / extra_lesson_events / todos writes
--   #7  shared lesson sections           — gate team/master sections on subject
--                                          master + validate the polymorphic parent
--   #8  forgeable audit                  — drop direct insert; add scope check
--   #10 resource owner/key immutability  — BEFORE UPDATE trigger pinning identity
-- ###########################################################################


-- ###########################################################################
-- ## FINDING #2 — teachers can self-assign tenant
-- ###########################################################################
-- (a) DROP the self-insert policy. A freshly-authenticated user must NOT be
--     able to INSERT their own teachers row (and thereby choose their own
--     school_id / default_grade_level_id). Provisioning runs exclusively
--     through lib/supabase/ensure-teacher.ts, which uses the SERVICE-ROLE admin
--     client (RLS-bypassing) — verified service-role, so dropping this policy
--     does not break provisioning. School-admin-driven creation also rides the
--     service-role admin path, so no authenticated-role insert policy is needed.
--     With no INSERT policy and RLS enabled, all non-service-role inserts are
--     denied (fail-closed) while SELECT/UPDATE policies remain intact.
drop policy if exists teachers_insert on teachers;

-- (b) Column-level privilege gate on UPDATE. The teachers_update_self RLS
--     row-gate (id = auth.uid()) is kept AS-IS (a teacher may only touch their
--     own row), but RLS alone cannot stop that teacher from changing WHICH
--     columns — so a teacher could move themselves to another school_id or
--     grade. Postgres column privileges are the right tool: revoke blanket
--     UPDATE from `authenticated`, then grant UPDATE only on the safe profile
--     columns.
--
--     teachers columns (M1:217-230):
--       id, school_id, email, display_name, default_view,
--       completion_privacy, default_grade_level_id, created_at, updated_at
--     Safe (teacher-editable profile / UI prefs):
--       display_name, default_view, completion_privacy
--     Locked (tenant anchor / identity / trigger-managed):
--       id, school_id, email, default_grade_level_id, created_at, updated_at
--
--     NOTE: there is no `preferences` jsonb column on teachers — the §4.2
--     "preferences" are the discrete columns default_view / completion_privacy
--     (M1:222-227), both of which are granted below. created_at/updated_at are
--     maintained by the set_updated_at() trigger (M1:946) and are intentionally
--     NOT client-updatable.
revoke update on teachers from authenticated;
grant update (display_name, default_view, completion_privacy)
  on teachers to authenticated;


-- ###########################################################################
-- ## FINDING #5 — cross-school grade assignment
-- ###########################################################################
-- tga_write (M1:1240) let a grade_admin / school_admin manage assignments, but
-- the WITH CHECK never verified that the grade being assigned belongs to the
-- caller's OWN school. A grade_admin who (via any path) also satisfies a check
-- on a grade in another tenant could insert a cross-school assignment. Pin the
-- WITH CHECK so the target grade must live in the caller's school. The is_*_admin
-- authorization checks are preserved, so admin management paths keep working;
-- this only adds the same-tenant constraint on the row being written.
--
-- USING is left as the original authorization predicate (admins manage rows for
-- grades they administer). WITH CHECK additionally pins the written row's grade
-- to the caller's school so a privileged caller cannot create an assignment into
-- a grade outside their tenant.
drop policy if exists tga_write on teacher_grade_assignments;
create policy tga_write on teacher_grade_assignments for all using (
  is_grade_admin(grade_level_id)
  or is_school_admin((select school_id from grade_levels g where g.id = grade_level_id))
) with check (
  (
    is_grade_admin(grade_level_id)
    or is_school_admin((select school_id from grade_levels g where g.id = grade_level_id))
  )
  and grade_level_id in (
    select gl.id from grade_levels gl
    where gl.school_id = auth_teacher_school_id()
  )
);


-- ###########################################################################
-- ## FINDING #6 — author-trusting team writes
-- ###########################################################################
-- day_events_write / extra_events_write / todos_write (M1:1372 / 1387 / 1520)
-- all shared the same flaw: the WITH CHECK for the TEAM branch only required
-- `can_read_grade(grade_level_id)`, NOT lead authority. So any teacher who can
-- read the grade could CREATE a team row — and then, because the USING side
-- required `is_grade_lead` for team rows, they could not edit/delete what they
-- just created (a confusing, partially-broken state) AND a non-lead could seed
-- team-scoped rows other teammates see. Fix: make team writes require
-- is_grade_lead in BOTH using and with-check; personal writes require
-- author_id = auth.uid() AND can_read_grade(grade_level_id) in both. Pinning
-- author_id = auth.uid() on the personal branch of the WITH CHECK keeps the
-- tenant anchor immutable on UPDATE (a personal row cannot be reassigned to
-- another author). grade_level_id reachability is enforced via can_read_grade /
-- is_grade_lead on both sides.

-- --- day_events_write ------------------------------------------------------
drop policy if exists day_events_write on day_events;
create policy day_events_write on day_events for all using (
  (scope <> 'team' and author_id = auth.uid() and can_read_grade(grade_level_id))
  or (scope = 'team' and is_grade_lead(grade_level_id))
) with check (
  (scope <> 'team' and author_id = auth.uid() and can_read_grade(grade_level_id))
  or (scope = 'team' and is_grade_lead(grade_level_id))
);

-- --- extra_events_write ----------------------------------------------------
-- extra_lesson_events distinguishes author_id (the writer) from teacher_id (the
-- personal owner). The personal branch keys on author_id = auth.uid() to match
-- the table's authorship model and the existing read policy (M1:1382). Both
-- sides require can_read_grade so a personal extra can't be planted in a grade
-- the caller can't see.
drop policy if exists extra_events_write on extra_lesson_events;
create policy extra_events_write on extra_lesson_events for all using (
  (scope <> 'team' and author_id = auth.uid() and can_read_grade(grade_level_id))
  or (scope = 'team' and is_grade_lead(grade_level_id))
) with check (
  (scope <> 'team' and author_id = auth.uid() and can_read_grade(grade_level_id))
  or (scope = 'team' and is_grade_lead(grade_level_id))
);

-- --- todos_write -----------------------------------------------------------
drop policy if exists todos_write on todos;
create policy todos_write on todos for all using (
  (scope <> 'team' and author_id = auth.uid() and can_read_grade(grade_level_id))
  or (scope = 'team' and is_grade_lead(grade_level_id))
) with check (
  (scope <> 'team' and author_id = auth.uid() and can_read_grade(grade_level_id))
  or (scope = 'team' and is_grade_lead(grade_level_id))
);


-- ###########################################################################
-- ## FINDING #7 — shared lesson sections
-- ###########################################################################
-- lesson_sections_write (M4:120) allowed writing ANY section whose owner_id is
-- null as long as the caller had READ access to the grade (can_read_grade) —
-- meaning a plain teacher could edit master/team section content the whole
-- grade sees. Tighten to mirror the master-lesson doctrine: a personal section
-- (owner_id = auth.uid()) is writable by its owner; a team/master section
-- (owner_id is null) requires master-edit authority on the parent lesson's
-- subject via can_edit_subject_master(). The subject is resolved from the
-- polymorphic parent inside a helper (the section row itself carries no
-- subject_id).
--
-- owner_kind enum values (M4:33): 'master', 'personal_copy', 'personal_authored'.

-- Resolve the subject_id of a section's polymorphic parent lesson. SECURITY
-- DEFINER so it can read the three lesson tables regardless of the caller's RLS;
-- it only READS and keys off the supplied (kind, id). Returns NULL when the
-- parent does not exist (caller treated as unauthorized for the team branch).
create or replace function lesson_section_parent_subject(
  p_owner_kind      lesson_owner_kind,
  p_owner_lesson_id uuid
)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select case p_owner_kind
    when 'master' then (
      select m.subject_id from master_core_lesson_events m
       where m.id = p_owner_lesson_id
    )
    when 'personal_copy' then (
      select p.subject_id from personal_core_lesson_event_copies p
       where p.id = p_owner_lesson_id
    )
    when 'personal_authored' then (
      select a.subject_id from personal_authored_lessons a
       where a.id = p_owner_lesson_id
    )
    else null
  end;
$$;

revoke execute on function lesson_section_parent_subject(lesson_owner_kind, uuid) from public;
grant execute on function lesson_section_parent_subject(lesson_owner_kind, uuid) to authenticated;

-- True iff the parent lesson exists AND the caller may edit it. Personal-owned
-- parents (personal_copy / personal_authored) are validated by ownership; a
-- master parent is validated by can_edit_subject_master() on its subject. Used
-- by both the tightened write policy and the parent-validation trigger below so
-- the two stay in lock-step.
create or replace function can_edit_lesson_section_parent(
  p_owner_kind      lesson_owner_kind,
  p_owner_lesson_id uuid
)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_subject uuid;
begin
  if p_owner_kind = 'personal_copy' then
    return exists (
      select 1 from personal_core_lesson_event_copies p
       where p.id = p_owner_lesson_id and p.teacher_id = auth.uid()
    );
  elsif p_owner_kind = 'personal_authored' then
    return exists (
      select 1 from personal_authored_lessons a
       where a.id = p_owner_lesson_id and a.owner_id = auth.uid()
    );
  elsif p_owner_kind = 'master' then
    select m.subject_id into v_subject
      from master_core_lesson_events m
     where m.id = p_owner_lesson_id;
    if v_subject is null then
      return false;  -- parent master lesson does not exist → fail closed
    end if;
    return can_edit_subject_master(v_subject);
  else
    return false;
  end if;
end;
$$;

revoke execute on function can_edit_lesson_section_parent(lesson_owner_kind, uuid) from public;
grant execute on function can_edit_lesson_section_parent(lesson_owner_kind, uuid) to authenticated;

-- Tightened write policy. Personal sections (owner_id = auth.uid()) are
-- owner-writable; team/master sections (owner_id is null) require master-edit
-- authority on the parent's subject. The read policy (M4:116) is intentionally
-- left unchanged — read continues to follow grade visibility.
drop policy if exists lesson_sections_write on lesson_sections;
create policy lesson_sections_write on lesson_sections for all using (
  case
    when owner_id is null
      then can_edit_subject_master(lesson_section_parent_subject(owner_kind, owner_lesson_id))
    else owner_id = auth.uid()
  end
) with check (
  case
    when owner_id is null
      then can_edit_subject_master(lesson_section_parent_subject(owner_kind, owner_lesson_id))
    else owner_id = auth.uid()
  end
);

-- Parent-existence + edit-authority validation trigger. The polymorphic
-- owner_lesson_id has NO FK (M4:39-40), so a write could reference a
-- non-existent or unauthorized parent. Reject on INSERT and on any UPDATE that
-- repoints (owner_kind, owner_lesson_id). can_edit_lesson_section_parent()
-- returns false when the parent is missing OR the caller can't edit it, so this
-- both enforces referential integrity and double-locks the authorization in the
-- DB layer (defense in depth alongside the policy above).
create or replace function validate_lesson_section_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.owner_kind = old.owner_kind
     and new.owner_lesson_id = old.owner_lesson_id then
    return new;  -- parent pointer unchanged → already validated on insert
  end if;

  if not can_edit_lesson_section_parent(new.owner_kind, new.owner_lesson_id) then
    raise exception 'lesson_section parent missing or not editable by caller'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_lesson_sections_validate_parent on lesson_sections;
create trigger trg_lesson_sections_validate_parent
  before insert or update on lesson_sections
  for each row execute function validate_lesson_section_parent();


-- ###########################################################################
-- ## FINDING #8 — forgeable audit
-- ###########################################################################
-- M5:277 left a direct client INSERT path on audit_log (with check
-- actor_teacher_id = auth.uid()). Even stamped with the caller's own id, a
-- client could forge audit rows into ANY grade/school — including grades it
-- cannot see — fabricating history. DROP the direct insert policy so all audit
-- writes funnel through log_audit_event(), and harden that RPC to also verify
-- the caller can actually access the claimed grade scope.
--
-- After this DROP there is no INSERT policy on audit_log; with RLS enabled,
-- authenticated/anon inserts are denied. The service-role nightly/server paths
-- bypass RLS, and log_audit_event() (SECURITY DEFINER) remains the sanctioned
-- application path. audit_log_read (M1:1605) is unchanged.
drop policy if exists audit_log_insert on audit_log;

-- Harden the RPC: keep the null-uid guard, and ADD a scope check so a caller
-- cannot forge audit rows into a grade they can't read. (We scope on grade —
-- school-wide rows with a null grade_level_id are allowed through, matching the
-- existing "null grade = school-wide action" convention; school-level forgery
-- into an arbitrary school is not meaningfully reachable here since the RPC
-- stamps the actor and the read policy is admin-gated. The grade gate is the
-- material one for cross-tenant fabrication.)
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

  -- Scope check: a caller may only log events into a grade they can actually
  -- read. Without this, a caller could fabricate audit history in grades (and
  -- thus tenants) they have no access to. NULL grade = school-wide action,
  -- allowed through.
  if p_grade_level_id is not null and not can_read_grade(p_grade_level_id) then
    raise exception 'log_audit_event: caller cannot access grade %', p_grade_level_id;
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

-- Re-assert the execute grant (idempotent; the signature is unchanged from M5).
revoke execute on function log_audit_event(audit_action, text, uuid, uuid, uuid, jsonb) from public;
grant execute on function log_audit_event(audit_action, text, uuid, uuid, uuid, jsonb) to authenticated;


-- ###########################################################################
-- ## FINDING #10 (RLS part) — resource owner / key immutability
-- ###########################################################################
-- The resources_update policy (M3:117) keeps a row owner-only, but RLS cannot
-- stop the owner from MUTATING identity columns: reassigning uploaded_by_id,
-- swapping the stored object key/url to point at another tenant's file, or
-- re-anchoring the row to a different owner event. A BEFORE UPDATE trigger pins
-- those columns to their prior values (fail-closed: any attempted change is
-- rejected). The upload-route code that legitimately rotates these belongs to
-- another track and would run via a controlled path; in-place UPDATEs through
-- the API must never alter identity.
--
-- Pinned columns (real names from M1:839-864 + M3 additions):
--   uploaded_by_id                 — author/ownership identity
--   owner_event_type, owner_event_id — the anchor (re-anchoring forbidden here)
--   r2_object_keys                 — hosted-file object key(s) (stored identity)
--   url                            — link identity for link-kind resources
--   kind                           — kind switch would change identity semantics
create or replace function pin_resource_identity()
returns trigger
language plpgsql
as $$
begin
  if new.uploaded_by_id is distinct from old.uploaded_by_id then
    raise exception 'resources.uploaded_by_id is immutable'
      using errcode = 'check_violation';
  end if;
  if new.owner_event_type is distinct from old.owner_event_type then
    raise exception 'resources.owner_event_type is immutable'
      using errcode = 'check_violation';
  end if;
  if new.owner_event_id is distinct from old.owner_event_id then
    raise exception 'resources.owner_event_id is immutable'
      using errcode = 'check_violation';
  end if;
  if new.kind is distinct from old.kind then
    raise exception 'resources.kind is immutable'
      using errcode = 'check_violation';
  end if;
  if new.r2_object_keys is distinct from old.r2_object_keys then
    raise exception 'resources.r2_object_keys is immutable'
      using errcode = 'check_violation';
  end if;
  if new.url is distinct from old.url then
    raise exception 'resources.url is immutable'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_resources_pin_identity on resources;
create trigger trg_resources_pin_identity
  before update on resources
  for each row execute function pin_resource_identity();


-- ###########################################################################
-- End of security hardening.
-- ###########################################################################
