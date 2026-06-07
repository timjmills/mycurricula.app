-- ###########################################################################
-- ## Workspace + notebook admin RPCs (Phase 1B, Wave W-B)
-- ###########################################################################
-- Source: docs/6.6.26 Workspace-Notebook-Team Build Ultraplan.md §3 (W-B:
-- multi-notebook + member/admin RPCs), §4 (RLS / security must-holds — admin
-- checks server-side only; TGA/STM writes stay RPC-only), §5 (risk register —
-- "Admin RPC privilege bug": server-side capability re-check + audit on EVERY
-- admin RPC), §0 decision #2 (the TWO admin tiers, both by REUSE of existing /
-- dormant infra — no new role tables);
-- docs/6.6.26 Workspace-Notebook-Team Model.md (the spatial model: Workspace =
-- `schools` row, Notebook = `grade_levels` row + its 8 subjects).
--
-- WHAT THIS WAVE ADDS — the two admin tiers' WRITE path, activating dormant
-- infra (`school_admins` / `is_school_admin()`) without any new role table:
--   1. create_notebook / rename_notebook / archive_notebook — multi-notebook
--      lifecycle (a notebook = a `grade_levels` row + its 8 locked subjects).
--   2. set_member_role / remove_member — per-notebook membership (TGA + STM)
--      management, retaining personal forks on removal.
--   3. grant_workspace_admin / revoke_workspace_admin — the workspace-admin
--      (school_admins) grant/revoke path.
-- All are SECURITY DEFINER, do their OWN server-side capability re-check off
-- auth.uid() (UI gating is cosmetic — ultraplan §4), are scoped to the caller's
-- own workspace, audited via log_audit_event, atomic, and idempotent where
-- sensible. TGA/STM/school_admins writes funnel through these privileged RPCs
-- (mirroring how audit_log writes are locked to log_audit_event, and how the
-- invite RPCs are the sole non-admin TGA writers).
--
-- ── ADMIN CAPABILITY MODEL (REUSE — ultraplan §0 decision #2) ──────────────
--   * Workspace admin  = is_school_admin(auth.uid()) for the caller's workspace
--     (`schools` row). Administers the whole Workspace: all notebooks, members,
--     workspace-admin grants. Activated here (see SECTION 0b — founding-owner
--     seeding) because provisioning does NOT mint a school_admins row.
--   * Notebook lead    = the caller's TGA role ∈ ('lead','grade_admin') for that
--     grade_level → the existing is_grade_lead(p_grade_level_id) helper (M1).
--
-- ── PROVISIONING PARITY (the canonical pattern) ────────────────────────────
-- create_notebook MIRRORS provision_individual_workspace
-- (20260606130000_individual_provisioning.sql) EXACTLY for how a notebook is
-- seeded: the new grade_levels row, the 8 LOCKED subjects with their exact
-- names / color slugs / display_order / scope='team' / default_pacing, the
-- creator's TGA 'lead', and the creator's self STM can_edit_master=true for the
-- new team subjects. It does NOT create a school_year — a notebook shares its
-- workspace's existing year (there is no grade_levels→school_years FK; calendar
-- surfaces resolve the active school_years row by school_id), so a new notebook
-- automatically inherits the workspace's active year. The ultraplan's "links to
-- the workspace's school_year" is satisfied by that shared-school relationship;
-- create_notebook additionally asserts an active year EXISTS so a notebook is
-- never created into a workspace with no calendar (fail-closed, diagnosable).
--
-- ── ROLE → STM MAPPING (mirror redeem_invite — §5 redeem hazard R2) ────────
-- subject_team_memberships.can_edit_master is written EXPLICITLY per role —
-- true ONLY for 'lead'/'grade_admin', false for 'teacher' (viewer/collaborator).
-- We NEVER rely on the column's DEFAULT of true (M1:334). This is identical to
-- redeem_invite (20260606140000:501) and provisioning's self-STM (which is the
-- 'lead' case → true).
--
-- ── LAST-LEAD / LAST-ADMIN GUARDS (lockout prevention) ─────────────────────
-- set_member_role and remove_member REFUSE the operation when it would remove
-- the notebook's LAST lead/grade_admin (no notebook left unmanageable).
-- revoke_workspace_admin REFUSES removing the LAST workspace-admin (no workspace
-- left unmanageable). Each is computed under a row lock / consistent snapshot so
-- two concurrent demotions cannot both pass the "there is another lead" check
-- and strand the notebook/workspace.
--
-- ── CROSS-WORKSPACE ISOLATION ──────────────────────────────────────────────
-- Every RPC pins its target to the CALLER'S OWN workspace
-- (auth_teacher_school_id()): a notebook must live in it; a target teacher must
-- be a member of it (teachers.school_id = the caller's school). A caller can
-- never read, grant into, or mutate another tenant's rows.
--
-- ADDITIVE ONLY and IDEMPOTENT-FRIENDLY — safe to run on a live database and
-- safe to re-run:
--   * function → CREATE OR REPLACE FUNCTION (re-definable in place).
--   * enum     → ALTER TYPE ... ADD VALUE IF NOT EXISTS (idempotent).
--   * grants   → REVOKE-then-GRANT (idempotent by nature).
--   * NO table is created or altered; NO RLS policy is added or changed (the
--     existing ~40 policies are untouched — ultraplan §4, the biggest safety
--     lever). SECURITY DEFINER RPCs bypass RLS, so no new policy is needed.
--   * NO seed change (the 8-subject graph is replicated AT RUNTIME by
--     create_notebook, mirroring provisioning exactly).
--
-- Cross-references for the schema this depends on:
--   M1  = 20260518102823_initial_schema.sql   (schools, grade_levels, teachers,
--         teacher_grade_assignments [TGA, unique (teacher_id, grade_level_id)],
--         subjects [scope/color/display_order], subject_team_memberships
--         [STM, unique (subject_id, teacher_id), can_edit_master DEFAULT true],
--         school_admins [NO unique on (school_id, teacher_id) — see note below],
--         school_years, grade_role enum, audit_action / audit_entity enums,
--         is_school_admin(), is_grade_lead(), auth_teacher_school_id(),
--         can_read_grade(), log_audit_event()).
--   M9  = 20260606120000_teams_invitations.sql (teams, team_memberships).
--   M11 = 20260606130000_individual_provisioning.sql (provision_individual_
--         workspace — the canonical notebook-seed pattern mirrored here).
--   M12 = 20260606140000_invite_lifecycle.sql  (redeem_invite — the role→STM
--         mapping mirrored here).
--
-- ── school_admins IDEMPOTENCY NOTE (no unique constraint) ───────────────────
-- M1's school_admins table has NO unique constraint on (school_id, teacher_id)
-- (verified: M1:252 + no later migration adds one), so ON CONFLICT cannot be
-- used for idempotent admin seeding/granting. Every school_admins INSERT here is
-- guarded with `WHERE NOT EXISTS (... same school_id + teacher_id ...)` so a
-- re-run (or a double-grant) inserts at most one row. (teacher_id is nullable in
-- M1 for standalone admin accounts; all rows we write set it.)
-- ###########################################################################


-- ###########################################################################
-- ## SECTION 0a — AUDIT ENUM EXTENSION (notebook / member / admin actions)
-- ###########################################################################
-- Add the W-B action values to the existing audit_action enum (M1:107). Per the
-- ENUM-IN-TRANSACTION precedent (M9 header + W-A 20260606150000): Supabase runs
-- each migration file in one transaction; ALTER TYPE ... ADD VALUE is permitted
-- in a transaction on PG 12+ (this project is PG 17). The only restriction is
-- that a newly-added value may not be REFERENCED AT RUNTIME in the same
-- transaction — but a plpgsql function BODY is resolved only at CALL time, and
-- none of these RPCs run during this migration, so the literals below are
-- resolved later in committed transactions where the values are fully usable.
-- IF NOT EXISTS makes each ADD idempotent.
--
-- We reuse the EXISTING entity values (M1:152): 'grade_level' for notebook
-- lifecycle, 'role_assignment' for member/admin grants (mirroring how the invite
-- RPCs use 'role_assignment' for an invitation). No audit_entity extension is
-- needed.
alter type audit_action add value if not exists 'notebook_created';
alter type audit_action add value if not exists 'notebook_renamed';
alter type audit_action add value if not exists 'notebook_archived';
alter type audit_action add value if not exists 'member_role_set';
alter type audit_action add value if not exists 'member_removed';
alter type audit_action add value if not exists 'workspace_admin_granted';
alter type audit_action add value if not exists 'workspace_admin_revoked';


-- ###########################################################################
-- ## SECTION 0b — FOUNDING-OWNER WORKSPACE-ADMIN SEEDING (activate dormant tier)
-- ###########################################################################
-- provision_individual_workspace (M11) makes the founding teacher the team owner
-- + TGA 'lead' + self STM, but does NOT mint a school_admins row — so the
-- workspace-admin tier (is_school_admin) is dormant for every workspace created
-- so far. Activate it idempotently: for every team OWNER who is NOT already a
-- school_admin of their team's school, insert one school_admins row. This is the
-- "the founding teacher is auto workspace-admin" rule (ultraplan §0 decision #2),
-- applied retroactively to existing data and as a one-time backfill.
--
-- Scoped to team OWNERS only (teams.owner_teacher_id) — never a plain member —
-- so an invited teacher does NOT become a workspace-admin. Guarded by NOT EXISTS
-- (school_admins has no unique key, see header) so re-running inserts nothing
-- new. granted_by_teacher_id is the owner themselves (self-grant at founding).
--
-- NOTE: this backfill runs as the migration (table owner), bypassing RLS — it is
-- a privileged one-time data fix, not a user-reachable path. New workspaces
-- minted AFTER this migration still rely on the provisioning path; folding this
-- seed into provision_individual_workspace is W-A's job (this migration must NOT
-- touch that function — hard constraint), so we backfill here and the
-- create_notebook RPC below additionally self-heals the caller (a workspace-admin
-- calling create_notebook is, by definition, already seeded).
insert into school_admins (school_id, teacher_id, granted_by_teacher_id)
select t.school_id, t.owner_teacher_id, t.owner_teacher_id
from teams t
where t.owner_teacher_id is not null
  and not exists (
    select 1 from school_admins sa
    where sa.school_id = t.school_id
      and sa.teacher_id = t.owner_teacher_id
  );


-- ###########################################################################
-- ## SECTION 1 — create_notebook RPC (workspace-admin only)
-- ###########################################################################
-- Creates a new Notebook (a grade_levels row + its 8 LOCKED subjects) inside the
-- CALLER'S OWN workspace and makes the caller its lead.
--
-- AUTHZ: workspace-admin ONLY — is_school_admin(auth_teacher_school_id()). A
-- notebook lead cannot create sibling notebooks (that is a workspace-level act).
--
-- ATOMICITY: the whole graph (grade + 8 subjects + creator TGA + creator STM) is
-- built in one function body = one transaction; any failure rolls back the lot
-- (no half-built notebook). Returns the new grade_level_id.
--
-- PROVISIONING PARITY: the grade name defaults to the trimmed p_name; the 8
-- subjects are seeded with the EXACT names / color slugs / display_order /
-- scope='team' / default_pacing='synchronized' as M11 (provisioning) and the
-- seed. The creator's self STM is can_edit_master=true (the 'lead' case of the
-- role→STM rule). No school_year is created — the notebook shares the workspace's
-- existing active year (asserted to exist below).
create or replace function create_notebook(
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_school_id uuid;
  v_grade_id  uuid;
  v_order     integer;
  v_name      text := left(coalesce(nullif(btrim(p_name), ''), 'New Notebook'), 120);
begin
  if v_uid is null then
    raise exception 'create_notebook: requires an authenticated caller';
  end if;

  -- ── RESOLVE + CAPABILITY RE-CHECK (server-side; never trust the client) ──
  -- The caller's own workspace, then the workspace-admin gate against it.
  v_school_id := auth_teacher_school_id();
  if v_school_id is null then
    raise exception 'create_notebook: caller has no workspace';
  end if;
  if not is_school_admin(v_school_id) then
    raise exception 'create_notebook: caller is not a workspace admin';
  end if;

  -- ── WORKSPACE MUST HAVE AN ACTIVE YEAR ────────────────────────────────
  -- A notebook shares the workspace's calendar; refuse to create one into a
  -- workspace with no active school_years row (would yield a notebook whose
  -- calendar surfaces have no year). Provisioning always seeds one, so this is a
  -- guard against a misconfigured/legacy workspace, not a normal path.
  if not exists (
    select 1 from school_years sy
    where sy.school_id = v_school_id and sy.is_active = true
  ) then
    raise exception 'create_notebook: workspace % has no active school year', v_school_id;
  end if;

  -- ── NEW GRADE_LEVELS ROW (= the notebook), active, ordered last ────────
  -- display_order = max(existing) + 1 so the new notebook sorts after current
  -- ones (provisioning seeds the solo grade at order 0).
  select coalesce(max(g.display_order), -1) + 1 into v_order
  from grade_levels g where g.school_id = v_school_id;

  insert into grade_levels (school_id, name, display_order, is_active)
  values (v_school_id, v_name, v_order, true)
  returning id into v_grade_id;

  -- ── THE 8 LOCKED SUBJECTS — replicated EXACTLY as M11 / the seed ───────
  -- Same names, color slugs, display_order, scope='team', default_pacing. The
  -- team-wide rule is about the color MAPPING, not row identity — each notebook
  -- owns its own 8 subject rows (ultraplan §8 R8 / provisioning §3).
  insert into subjects (grade_level_id, name, color, display_order, scope, default_pacing)
  values
    (v_grade_id, 'Math',      'math',      0, 'team', 'synchronized'),
    (v_grade_id, 'Reading',   'reading',   1, 'team', 'synchronized'),
    (v_grade_id, 'Writing',   'writing',   2, 'team', 'synchronized'),
    (v_grade_id, 'Grammar',   'grammar',   3, 'team', 'synchronized'),
    (v_grade_id, 'Spelling',  'spelling',  4, 'team', 'synchronized'),
    (v_grade_id, 'UFLI',      'ufli',      5, 'team', 'synchronized'),
    (v_grade_id, 'Explorers', 'explorers', 6, 'team', 'synchronized'),
    (v_grade_id, 'SEL',       'sel',       7, 'team', 'synchronized');

  -- ── CREATOR'S TGA 'lead' (they lead the notebook they created) ─────────
  -- on-conflict do-nothing is belt-and-suspenders (a fresh grade has no TGA yet).
  insert into teacher_grade_assignments (teacher_id, grade_level_id, role)
  values (v_uid, v_grade_id, 'lead')
  on conflict on constraint teacher_grade_assignments_teacher_id_grade_level_id_key do nothing;

  -- ── CREATOR'S SELF STM (can_edit_master=true — the 'lead' case) ────────
  -- Scoped strictly to the 8 subjects just created; mirrors provisioning's
  -- self-STM and the role→STM rule (lead ⇒ true).
  insert into subject_team_memberships (subject_id, teacher_id, can_edit_master)
  select s.id, v_uid, true
  from subjects s
  where s.grade_level_id = v_grade_id
  on conflict on constraint subject_team_memberships_subject_id_teacher_id_key do nothing;

  -- ── AUDIT ──────────────────────────────────────────────────────────────
  -- Grade scope = the new grade (the creator now holds a TGA 'lead' for it, so
  -- can_read_grade(v_grade_id) is true within this transaction → the grade gate
  -- passes). School = the caller's own workspace (passes log_audit_event's school
  -- gate, which requires p_school_id = auth_teacher_school_id()). The grade lives
  -- in that school (just inserted), so the cross-field consistency check passes.
  perform log_audit_event(
    'notebook_created',
    'grade_level',
    v_grade_id,
    v_grade_id,
    v_school_id,
    jsonb_build_object('name', v_name)
  );

  return v_grade_id;
end;
$$;


-- ###########################################################################
-- ## SECTION 2 — rename_notebook RPC (workspace-admin OR notebook-lead)
-- ###########################################################################
-- Renames a notebook (grade_levels.name). Read/edit access: a workspace-admin of
-- the notebook's workspace, OR a lead/grade_admin of that grade.
create or replace function rename_notebook(
  p_grade_level_id uuid,
  p_name           text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_school_id uuid;
  v_name      text := left(coalesce(nullif(btrim(p_name), ''), ''), 120);
begin
  if v_uid is null then
    raise exception 'rename_notebook: requires an authenticated caller';
  end if;
  if v_name = '' then
    raise exception 'rename_notebook: name is required';
  end if;

  -- ── RESOLVE the notebook's workspace, pinned to the CALLER'S workspace ──
  -- Constraining to auth_teacher_school_id() means a caller can only ever name a
  -- notebook in their OWN tenant; a foreign / non-existent grade resolves to NULL.
  select g.school_id into v_school_id
  from grade_levels g
  where g.id = p_grade_level_id
    and g.school_id = auth_teacher_school_id();

  if v_school_id is null then
    raise exception 'rename_notebook: notebook % not found in caller''s workspace', p_grade_level_id;
  end if;

  -- ── CAPABILITY RE-CHECK: workspace-admin OR notebook-lead ──────────────
  if not (is_school_admin(v_school_id) or is_grade_lead(p_grade_level_id)) then
    raise exception 'rename_notebook: caller is not a workspace admin or lead of this notebook';
  end if;

  update grade_levels
     set name = v_name, updated_at = now()
   where id = p_grade_level_id;

  -- ── AUDIT ── grade + own-school scope both pass their gates (see create). ─
  perform log_audit_event(
    'notebook_renamed',
    'grade_level',
    p_grade_level_id,
    p_grade_level_id,
    v_school_id,
    jsonb_build_object('name', v_name)
  );
end;
$$;


-- ###########################################################################
-- ## SECTION 3 — archive_notebook RPC (workspace-admin only)
-- ###########################################################################
-- SOFT archive a notebook (grade_levels.is_active=false). NEVER deletes — all
-- content (subjects/lessons/forks/TGA/STM) is retained; the notebook simply
-- stops surfacing as active. Workspace-admin ONLY (a structural workspace act).
create or replace function archive_notebook(
  p_grade_level_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_school_id uuid;
begin
  if v_uid is null then
    raise exception 'archive_notebook: requires an authenticated caller';
  end if;

  -- Pin to the caller's own workspace (cross-tenant isolation).
  select g.school_id into v_school_id
  from grade_levels g
  where g.id = p_grade_level_id
    and g.school_id = auth_teacher_school_id();

  if v_school_id is null then
    raise exception 'archive_notebook: notebook % not found in caller''s workspace', p_grade_level_id;
  end if;

  -- Workspace-admin ONLY.
  if not is_school_admin(v_school_id) then
    raise exception 'archive_notebook: caller is not a workspace admin';
  end if;

  -- Soft archive (idempotent: archiving an already-archived notebook is a no-op
  -- update). NEVER a delete.
  update grade_levels
     set is_active = false, updated_at = now()
   where id = p_grade_level_id;

  perform log_audit_event(
    'notebook_archived',
    'grade_level',
    p_grade_level_id,
    p_grade_level_id,
    v_school_id,
    jsonb_build_object('is_active', false)
  );
end;
$$;


-- ###########################################################################
-- ## SECTION 4 — set_member_role RPC (workspace-admin OR notebook-lead)
-- ###########################################################################
-- Set (upsert) a teacher's role on a notebook (TGA role) and bring their per-
-- subject STM into line with that role. The target MUST be a member of the
-- caller's workspace.
--
-- AUTHZ: workspace-admin of the notebook's workspace OR a lead/grade_admin of
-- the grade. GRANTABLE-ROLE BOUND (review H1): a notebook-lead may assign
-- 'teacher'/'lead' only; assigning 'grade_admin' (which unlocks a direct
-- authenticated TGA-write via the tga_write RLS policy + admin reads) requires
-- the caller to be a WORKSPACE-ADMIN — mirroring create_invite's H1 guard.
--
-- ROLE → STM (mirror redeem_invite R2): can_edit_master = true ONLY for
-- 'lead'/'grade_admin', false for 'teacher'. Applied to all of the notebook's
-- TEAM subjects (scope='team') — never personal subjects.
--
-- LAST-LEAD GUARD: refuse a change that would leave the notebook with ZERO
-- lead/grade_admin (demoting the only lead to 'teacher', or demoting a lead when
-- they are the last one). Computed under the SAME lock window as the write
-- (advisory lock on the grade) so two concurrent demotions cannot both observe
-- "another lead exists" and strand the notebook.
create or replace function set_member_role(
  p_teacher_id     uuid,
  p_grade_level_id uuid,
  p_role           grade_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_school_id    uuid;
  v_can_edit     boolean;
  v_target_school uuid;
  v_was_lead     boolean;
  v_other_leads  integer;
  v_is_admin     boolean;
begin
  if v_uid is null then
    raise exception 'set_member_role: requires an authenticated caller';
  end if;
  if p_teacher_id is null then
    raise exception 'set_member_role: target teacher is required';
  end if;
  if p_role is null then
    raise exception 'set_member_role: role is required';
  end if;

  -- Pin the notebook to the caller's own workspace (cross-tenant isolation).
  select g.school_id into v_school_id
  from grade_levels g
  where g.id = p_grade_level_id
    and g.school_id = auth_teacher_school_id();

  if v_school_id is null then
    raise exception 'set_member_role: notebook % not found in caller''s workspace', p_grade_level_id;
  end if;

  -- ── CAPABILITY RE-CHECK: workspace-admin OR notebook-lead ──────────────
  v_is_admin := is_school_admin(v_school_id);
  if not (v_is_admin or is_grade_lead(p_grade_level_id)) then
    raise exception 'set_member_role: caller is not a workspace admin or lead of this notebook';
  end if;

  -- ── GRANTABLE-ROLE GUARD (review H1 — escalation via grade_admin) ──────
  -- A notebook-lead may assign 'teacher' or 'lead' ONLY. 'grade_admin' is a
  -- strictly larger capability — it unlocks the tga_write RLS policy (M1:1240:
  -- is_grade_admin OR is_school_admin), i.e. a DIRECT authenticated TGA-write
  -- path that bypasses these RPCs, plus every is_grade_admin-gated read — so it
  -- is reserved for WORKSPACE-ADMINS only, mirroring create_invite's H1 guard
  -- that forbids minting 'grade_admin' invites (20260606140000:210-225). Without
  -- this a notebook-lead could self-promote (or promote a confederate) to
  -- grade_admin and escalate beyond a lead's intended authority.
  if p_role = 'grade_admin' and not v_is_admin then
    raise exception
      'set_member_role: only a workspace admin may assign the grade_admin role';
  end if;

  -- ── TARGET MUST BE IN THE SAME WORKSPACE ───────────────────────────────
  -- A teacher belongs to exactly one workspace (scalar teachers.school_id). The
  -- target must share the caller's workspace — otherwise this RPC could grant a
  -- foreign account access to this notebook.
  select tc.school_id into v_target_school
  from teachers tc where tc.id = p_teacher_id;

  if v_target_school is null then
    raise exception 'set_member_role: target teacher % not found', p_teacher_id;
  end if;
  if v_target_school is distinct from v_school_id then
    raise exception 'set_member_role: target teacher % is not in this workspace', p_teacher_id;
  end if;

  -- ── SERIALIZE PER-NOTEBOOK MUTATIONS (last-lead race) ──────────────────
  -- A transaction-scoped advisory lock keyed off the grade serializes
  -- set_member_role / remove_member on the SAME notebook, so the last-lead check
  -- below and the subsequent write see a stable roster. hashtextextended gives a
  -- stable bigint key from the grade uuid text.
  perform pg_advisory_xact_lock(hashtextextended(p_grade_level_id::text, 0));

  -- ── LAST-LEAD GUARD ────────────────────────────────────────────────────
  -- If the target is CURRENTLY a lead/grade_admin and the NEW role is NOT, the
  -- change is a demotion: refuse it when no OTHER lead/grade_admin remains.
  select exists (
    select 1 from teacher_grade_assignments tga
    where tga.teacher_id = p_teacher_id
      and tga.grade_level_id = p_grade_level_id
      and tga.role in ('lead', 'grade_admin')
  ) into v_was_lead;

  if v_was_lead and p_role not in ('lead', 'grade_admin') then
    select count(*) into v_other_leads
    from teacher_grade_assignments tga
    where tga.grade_level_id = p_grade_level_id
      and tga.role in ('lead', 'grade_admin')
      and tga.teacher_id <> p_teacher_id;

    if v_other_leads = 0 then
      raise exception
        'set_member_role: cannot demote the last lead of notebook %', p_grade_level_id
        using errcode = 'check_violation';
    end if;
  end if;

  -- ── UPSERT THE TGA ROLE ────────────────────────────────────────────────
  -- The §5 fix-2 sanctioned non-admin TGA write path (TGA has no authenticated
  -- self-insert policy; this SECURITY DEFINER RPC is a privileged writer).
  insert into teacher_grade_assignments (teacher_id, grade_level_id, role)
  values (p_teacher_id, p_grade_level_id, p_role)
  on conflict on constraint teacher_grade_assignments_teacher_id_grade_level_id_key
    do update set role = excluded.role, updated_at = now();

  -- ── BRING STM INTO LINE (role → can_edit_master, mirror redeem) ────────
  -- true ONLY for lead/grade_admin; never relies on the column default. Applied
  -- to every TEAM subject of the notebook (insert missing rows, update existing).
  v_can_edit := (p_role in ('lead', 'grade_admin'));

  insert into subject_team_memberships (subject_id, teacher_id, can_edit_master)
  select s.id, p_teacher_id, v_can_edit
  from subjects s
  where s.grade_level_id = p_grade_level_id
    and s.scope = 'team'
  on conflict on constraint subject_team_memberships_subject_id_teacher_id_key
    do update set can_edit_master = excluded.can_edit_master, updated_at = now();

  -- ── AUDIT ──────────────────────────────────────────────────────────────
  perform log_audit_event(
    'member_role_set',
    'role_assignment',
    p_teacher_id,
    p_grade_level_id,
    v_school_id,
    jsonb_build_object(
      'teacher_id', p_teacher_id,
      'role', p_role,
      'can_edit_master', v_can_edit
    )
  );
end;
$$;


-- ###########################################################################
-- ## SECTION 5 — remove_member RPC (workspace-admin OR notebook-lead)
-- ###########################################################################
-- Remove a teacher from ONE notebook: delete their TGA + STM for that grade.
-- RETAINS their personal forks (personal_core_lesson_event_copies /
-- personal_authored_lessons are NEVER deleted) — they simply become unreadable
-- to that teacher once the TGA is gone (ultraplan §3 / W-B: "Personal forks are
-- retained (unreadable to them) not deleted").
--
-- AUTHZ: workspace-admin of the notebook's workspace OR a lead/grade_admin of
-- the grade. Target MUST be in the same workspace.
--
-- LAST-LEAD GUARD: refuse removing the notebook's last lead/grade_admin (same
-- serialized check as set_member_role).
--
-- WORKSPACE SEAT (team_memberships) SCOPE — DOCUMENTED DECISION: this RPC
-- manages NOTEBOOK membership only (TGA + STM). It deliberately does NOT touch
-- team_memberships (the workspace SEAT ledger). Rationale: a teacher may
-- participate in several notebooks within one workspace, so removing them from
-- ONE notebook must not silently free their workspace seat (they may still be in
-- others, and the seat is a workspace-level resource). Releasing the seat
-- (deleting team_memberships, which frees a seat for a new invite) is the
-- team/seat flow's job — the safest default per the task. A future "remove from
-- workspace entirely" RPC would own that, after checking the teacher has no
-- remaining notebooks.
create or replace function remove_member(
  p_teacher_id     uuid,
  p_grade_level_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid           uuid := auth.uid();
  v_school_id     uuid;
  v_target_school uuid;
  v_was_lead      boolean;
  v_other_leads   integer;
begin
  if v_uid is null then
    raise exception 'remove_member: requires an authenticated caller';
  end if;
  if p_teacher_id is null then
    raise exception 'remove_member: target teacher is required';
  end if;

  -- Pin the notebook to the caller's own workspace (cross-tenant isolation).
  select g.school_id into v_school_id
  from grade_levels g
  where g.id = p_grade_level_id
    and g.school_id = auth_teacher_school_id();

  if v_school_id is null then
    raise exception 'remove_member: notebook % not found in caller''s workspace', p_grade_level_id;
  end if;

  -- Capability re-check: workspace-admin OR notebook-lead.
  if not (is_school_admin(v_school_id) or is_grade_lead(p_grade_level_id)) then
    raise exception 'remove_member: caller is not a workspace admin or lead of this notebook';
  end if;

  -- Target must be in the same workspace (cross-tenant guard). A target with no
  -- teachers row, or one in another workspace, is rejected.
  select tc.school_id into v_target_school
  from teachers tc where tc.id = p_teacher_id;

  if v_target_school is null then
    raise exception 'remove_member: target teacher % not found', p_teacher_id;
  end if;
  if v_target_school is distinct from v_school_id then
    raise exception 'remove_member: target teacher % is not in this workspace', p_teacher_id;
  end if;

  -- Serialize per-notebook membership mutations (last-lead race) — same key as
  -- set_member_role.
  perform pg_advisory_xact_lock(hashtextextended(p_grade_level_id::text, 0));

  -- ── LAST-LEAD GUARD ────────────────────────────────────────────────────
  -- If the target is the notebook's last lead/grade_admin, refuse removal.
  select exists (
    select 1 from teacher_grade_assignments tga
    where tga.teacher_id = p_teacher_id
      and tga.grade_level_id = p_grade_level_id
      and tga.role in ('lead', 'grade_admin')
  ) into v_was_lead;

  if v_was_lead then
    select count(*) into v_other_leads
    from teacher_grade_assignments tga
    where tga.grade_level_id = p_grade_level_id
      and tga.role in ('lead', 'grade_admin')
      and tga.teacher_id <> p_teacher_id;

    if v_other_leads = 0 then
      raise exception
        'remove_member: cannot remove the last lead of notebook %', p_grade_level_id
        using errcode = 'check_violation';
    end if;
  end if;

  -- ── DELETE TGA for this grade ──────────────────────────────────────────
  delete from teacher_grade_assignments tga
  where tga.teacher_id = p_teacher_id
    and tga.grade_level_id = p_grade_level_id;

  -- ── DELETE STM for this grade's subjects (any scope) ───────────────────
  -- Removes their master-edit/membership on the notebook's subjects. Personal
  -- subjects they OWN (subjects.scope='personal', owner_id=target) are NOT
  -- deleted — only their STM rows are. Their personal forks/authored lessons are
  -- untouched (retained, unreadable once the TGA is gone).
  delete from subject_team_memberships stm
  where stm.teacher_id = p_teacher_id
    and stm.subject_id in (
      select s.id from subjects s where s.grade_level_id = p_grade_level_id
    );

  -- ── AUDIT ──────────────────────────────────────────────────────────────
  perform log_audit_event(
    'member_removed',
    'role_assignment',
    p_teacher_id,
    p_grade_level_id,
    v_school_id,
    jsonb_build_object('teacher_id', p_teacher_id, 'forks_retained', true)
  );
end;
$$;


-- ###########################################################################
-- ## SECTION 6 — grant_workspace_admin / revoke_workspace_admin (admin only)
-- ###########################################################################
-- Insert / delete a school_admins row for a teacher in the CALLER'S workspace.
-- Workspace-admin ONLY. Target MUST be in the same workspace.
--
-- IDEMPOTENCY: school_admins has no unique key (header note), so grant guards
-- with NOT EXISTS (re-grant inserts nothing); revoke is a delete (re-revoke is a
-- no-op). LAST-ADMIN GUARD: revoke refuses removing the workspace's last admin.

-- ── grant_workspace_admin ─────────────────────────────────────────────────
create or replace function grant_workspace_admin(
  p_teacher_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid           uuid := auth.uid();
  v_school_id     uuid;
  v_target_school uuid;
begin
  if v_uid is null then
    raise exception 'grant_workspace_admin: requires an authenticated caller';
  end if;
  if p_teacher_id is null then
    raise exception 'grant_workspace_admin: target teacher is required';
  end if;

  v_school_id := auth_teacher_school_id();
  if v_school_id is null then
    raise exception 'grant_workspace_admin: caller has no workspace';
  end if;

  -- Capability re-check: workspace-admin ONLY.
  if not is_school_admin(v_school_id) then
    raise exception 'grant_workspace_admin: caller is not a workspace admin';
  end if;

  -- Target must be in the same workspace.
  select tc.school_id into v_target_school
  from teachers tc where tc.id = p_teacher_id;

  if v_target_school is null then
    raise exception 'grant_workspace_admin: target teacher % not found', p_teacher_id;
  end if;
  if v_target_school is distinct from v_school_id then
    raise exception 'grant_workspace_admin: target teacher % is not in this workspace', p_teacher_id;
  end if;

  -- Idempotent insert (no unique key on school_admins): only insert when the
  -- (school, teacher) admin row does not already exist. granted_by = the caller.
  insert into school_admins (school_id, teacher_id, granted_by_teacher_id)
  select v_school_id, p_teacher_id, v_uid
  where not exists (
    select 1 from school_admins sa
    where sa.school_id = v_school_id
      and sa.teacher_id = p_teacher_id
  );

  perform log_audit_event(
    'workspace_admin_granted',
    'role_assignment',
    p_teacher_id,
    null,
    v_school_id,
    jsonb_build_object('teacher_id', p_teacher_id)
  );
end;
$$;

-- ── revoke_workspace_admin ────────────────────────────────────────────────
create or replace function revoke_workspace_admin(
  p_teacher_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid           uuid := auth.uid();
  v_school_id     uuid;
  v_target_school uuid;
  v_other_admins  integer;
begin
  if v_uid is null then
    raise exception 'revoke_workspace_admin: requires an authenticated caller';
  end if;
  if p_teacher_id is null then
    raise exception 'revoke_workspace_admin: target teacher is required';
  end if;

  v_school_id := auth_teacher_school_id();
  if v_school_id is null then
    raise exception 'revoke_workspace_admin: caller has no workspace';
  end if;

  -- Capability re-check: workspace-admin ONLY.
  if not is_school_admin(v_school_id) then
    raise exception 'revoke_workspace_admin: caller is not a workspace admin';
  end if;

  -- Target must be in the same workspace (defensive — admins always are, but a
  -- foreign target id must never reach the delete below).
  select tc.school_id into v_target_school
  from teachers tc where tc.id = p_teacher_id;

  if v_target_school is not null and v_target_school is distinct from v_school_id then
    raise exception 'revoke_workspace_admin: target teacher % is not in this workspace', p_teacher_id;
  end if;

  -- ── SERIALIZE + LAST-ADMIN GUARD ───────────────────────────────────────
  -- Advisory lock keyed off the school serializes concurrent revokes so two
  -- cannot both see "another admin exists" and remove the last two. Refuse the
  -- revoke when no OTHER admin (a distinct teacher_id) would remain for the
  -- workspace.
  perform pg_advisory_xact_lock(hashtextextended(v_school_id::text, 1));

  select count(*) into v_other_admins
  from school_admins sa
  where sa.school_id = v_school_id
    and sa.teacher_id is distinct from p_teacher_id
    and sa.teacher_id is not null;

  if v_other_admins = 0 then
    raise exception
      'revoke_workspace_admin: cannot revoke the last workspace admin'
      using errcode = 'check_violation';
  end if;

  -- Delete every admin row for this (school, teacher) — idempotent (re-revoke is
  -- a no-op). Pinned to the caller's workspace.
  delete from school_admins sa
  where sa.school_id = v_school_id
    and sa.teacher_id = p_teacher_id;

  perform log_audit_event(
    'workspace_admin_revoked',
    'role_assignment',
    p_teacher_id,
    null,
    v_school_id,
    jsonb_build_object('teacher_id', p_teacher_id)
  );
end;
$$;


-- ###########################################################################
-- ## SECTION 7 — RPC EXECUTE GRANTS
-- ###########################################################################
-- Every RPC runs its OWN server-side capability re-check off auth.uid(), so each
-- is granted to `authenticated` and explicitly REVOKED from public/anon (no RPC
-- is callable by anon; a SECURITY DEFINER fn must never run with a null uid —
-- each guards that). REVOKE-then-GRANT is idempotent.

revoke execute on function create_notebook(text) from public;
revoke execute on function create_notebook(text) from anon;
grant  execute on function create_notebook(text) to authenticated;

revoke execute on function rename_notebook(uuid, text) from public;
revoke execute on function rename_notebook(uuid, text) from anon;
grant  execute on function rename_notebook(uuid, text) to authenticated;

revoke execute on function archive_notebook(uuid) from public;
revoke execute on function archive_notebook(uuid) from anon;
grant  execute on function archive_notebook(uuid) to authenticated;

revoke execute on function set_member_role(uuid, uuid, grade_role) from public;
revoke execute on function set_member_role(uuid, uuid, grade_role) from anon;
grant  execute on function set_member_role(uuid, uuid, grade_role) to authenticated;

revoke execute on function remove_member(uuid, uuid) from public;
revoke execute on function remove_member(uuid, uuid) from anon;
grant  execute on function remove_member(uuid, uuid) to authenticated;

revoke execute on function grant_workspace_admin(uuid) from public;
revoke execute on function grant_workspace_admin(uuid) from anon;
grant  execute on function grant_workspace_admin(uuid) to authenticated;

revoke execute on function revoke_workspace_admin(uuid) from public;
revoke execute on function revoke_workspace_admin(uuid) from anon;
grant  execute on function revoke_workspace_admin(uuid) to authenticated;


-- ###########################################################################
-- End of workspace + notebook admin RPCs.
-- ###########################################################################
