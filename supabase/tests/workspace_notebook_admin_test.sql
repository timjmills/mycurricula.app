-- ###########################################################################
-- ## Functional test — workspace + notebook admin RPCs (Wave W-B)
-- ###########################################################################
-- Covers the admin RPCs added by
-- supabase/migrations/20260606160000_workspace_notebook_admin.sql:
--   (0) founding-owner workspace-admin seeding: every team owner is a
--       school_admins row after the migration (the dormant tier is active).
--   (a) create_notebook: workspace-admin makes a notebook = a grade + EXACTLY
--       the 8 locked subjects (names/colors/order) + creator TGA 'lead' + self
--       STM can_edit_master=true; non-admin caller is REJECTED; audited.
--   (b) rename_notebook: lead OR admin may rename; pinned to the caller's
--       workspace; a foreign-workspace grade is rejected.
--   (c) archive_notebook: admin-only soft archive (is_active=false, never
--       deleted); non-admin rejected.
--   (d) set_member_role: admin/lead upserts TGA role + flips STM
--       can_edit_master (true for lead, false for teacher); cross-workspace
--       target rejected; last-lead demotion REFUSED.
--   (e) remove_member: deletes TGA+STM, RETAINS personal forks; last-lead
--       removal REFUSED; cross-workspace target rejected.
--   (f) grant/revoke_workspace_admin: admin-only; cross-workspace target
--       rejected; last-admin revoke REFUSED.
--
-- ── HOW TO RUN ─────────────────────────────────────────────────────────────
-- Mirrors supabase/tests/redeem_invite_convergence_test.sql EXACTLY: there is
-- NO database/RPC test harness wired into `npm test` in this repo (vitest is
-- `environment: "node"`, pure units only — no DB, no pgTAP, no local-supabase
-- client). So this is a SELF-CONTAINED psql harness that runs against any
-- Postgres with the full migration chain applied. Two ways:
--
--   1. Local Supabase (preferred, exact PG 17 parity):
--        supabase start            # applies supabase/migrations/* to the local db
--        psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--          -v ON_ERROR_STOP=1 -f supabase/tests/workspace_notebook_admin_test.sql
--
--   2. A throwaway Postgres with the migrations applied in order, after creating
--      the Supabase stubs the migrations assume (the `anon`, `authenticated`,
--      `service_role` roles; an `auth` schema; `auth.users`; and an `auth.uid()`
--      that reads `request.jwt.claim.sub`).
--
-- The script runs each scenario as the relevant user by setting
-- `request.jwt.claim.sub` (which `auth.uid()` reads) via `_become()`, asserts via
-- `_check()`, and RAISEs at the end if ANY assertion is false (non-zero exit in
-- CI). Capability-rejection paths (a non-admin calling an admin RPC, a
-- cross-workspace target, a last-lead/last-admin guard) RAISE inside the RPC, so
-- they are exercised with a plpgsql BEGIN/EXCEPTION wrapper (`_expect_raise`)
-- that asserts the call DID raise. Run on a FRESH database (it INSERTs fixed-id
-- auth.users rows); re-running against a dirty db trips users_pkey.
--
-- NOTE (recorded honestly): because no DB harness is wired into `npm test`, this
-- CANNOT run under `npm test` in this environment. It is authored to run against
-- an ephemeral Postgres with the full migration chain (the same out-of-band path
-- the convergence test documents); wiring a `supabase db`-backed CI job is the
-- Wave W-G test-pass follow-up. The companion vitest file
-- tests/workspace-notebook-admin.test.ts statically asserts the migration's
-- load-bearing invariants and DOES run in CI today.
-- ###########################################################################

\set ON_ERROR_STOP on
\pset pager off

-- Assertion collector (psql has no native assert): each scenario appends
-- (name, ok); the final gate RAISEs if any are false. Session-scoped temp table
-- (no `on commit drop` — psql auto-commits each statement).
create temporary table _t_results (name text, ok boolean);
create or replace function _check(p_name text, p_ok boolean) returns boolean
language sql as $$ insert into _t_results values (p_name, p_ok); select p_ok; $$;

-- Become a given user for subsequent statements (drives auth.uid()).
create or replace function _become(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, false)::void $$;

-- Run an arbitrary SQL string and record whether it RAISED. Used for the
-- capability-rejection + guard paths (which fail closed via `raise exception`).
-- Returns true iff the statement raised (i.e. the RPC correctly rejected).
create or replace function _expect_raise(p_name text, p_sql text) returns boolean
language plpgsql as $$
begin
  execute p_sql;
  -- No error → the RPC did NOT reject. Record a FAILED assertion.
  insert into _t_results values (p_name, false);
  return false;
exception when others then
  -- Any error → the RPC rejected as intended. Record a PASSED assertion.
  insert into _t_results values (p_name, true);
  return true;
end $$;

-- Fixed-id auth users: an admin/owner, a plain member, an outsider in another
-- workspace, and two more for multi-lead / multi-admin scenarios.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1','admin@team.test'),   -- founding owner = workspace admin
  ('00000000-0000-0000-0000-0000000000b1','member@team.test'),  -- plain member (joins the team)
  ('00000000-0000-0000-0000-0000000000c1','outsider@solo.test'),-- stays in their own workspace
  ('00000000-0000-0000-0000-0000000000d1','second@team.test'),  -- second member (for multi-lead)
  ('00000000-0000-0000-0000-0000000000e1','third@team.test');   -- third member (for multi-admin)

-- Each gets an auto-seeded solo workspace.
select provision_individual_workspace('00000000-0000-0000-0000-0000000000a1','admin@team.test','Admin');
select provision_individual_workspace('00000000-0000-0000-0000-0000000000b1','member@team.test','Member');
select provision_individual_workspace('00000000-0000-0000-0000-0000000000c1','outsider@solo.test','Outsider');
select provision_individual_workspace('00000000-0000-0000-0000-0000000000d1','second@team.test','Second');
select provision_individual_workspace('00000000-0000-0000-0000-0000000000e1','third@team.test','Third');

-- The admin's team + its seeded grade (the workspace everyone converges into).
select t.id as team_id, t.school_id as team_school, g.id as team_grade
from teams t
join grade_levels g on g.school_id = t.school_id
where t.owner_teacher_id = '00000000-0000-0000-0000-0000000000a1'
\gset

-- The outsider's own (foreign) workspace + grade, for cross-workspace tests.
select school_id as out_school from teachers where id='00000000-0000-0000-0000-0000000000c1' \gset
select id as out_grade from grade_levels where school_id=:'out_school' \gset

-- ===========================================================================
\echo '== SCENARIO (0): founding owner is auto workspace-admin (dormant tier active) =='
-- ===========================================================================
select
  _check('s0_owner_is_school_admin',
    exists(select 1 from school_admins where school_id=:'team_school'
             and teacher_id='00000000-0000-0000-0000-0000000000a1')),
  _check('s0_member_not_admin_yet',
    not exists(select 1 from school_admins where school_id=:'team_school'
                 and teacher_id='00000000-0000-0000-0000-0000000000b1'));

-- Bring the plain member + second/third into the team via the invite path so
-- they share the workspace (re-home) and hold a notebook TGA.
select _become('00000000-0000-0000-0000-0000000000a1');
select create_invite(:'team_id', :'team_grade', 'teacher', null, 'joinB', now() + interval '7 days');
select create_invite(:'team_id', :'team_grade', 'teacher', null, 'joinD', now() + interval '7 days');
select create_invite(:'team_id', :'team_grade', 'teacher', null, 'joinE', now() + interval '7 days');
select _become('00000000-0000-0000-0000-0000000000b1'); select redeem_invite('joinB');
select _become('00000000-0000-0000-0000-0000000000d1'); select redeem_invite('joinD');
select _become('00000000-0000-0000-0000-0000000000e1'); select redeem_invite('joinE');

-- ===========================================================================
\echo '== SCENARIO (a): create_notebook — admin seeds 8 subjects + creator lead; non-admin rejected =='
-- ===========================================================================
-- Non-admin (the plain member) must be REJECTED.
select _expect_raise('a0_create_notebook_nonadmin_rejected',
  $q$ select create_notebook('Music') $q$);

-- Admin creates a notebook.
select _become('00000000-0000-0000-0000-0000000000a1');
select create_notebook('Music') as new_grade \gset

select
  _check('a1_grade_created_active',
    (select is_active from grade_levels where id=:'new_grade') = true),
  _check('a2_grade_in_admin_workspace',
    (select school_id from grade_levels where id=:'new_grade') = :'team_school'),
  -- EXACTLY the 8 locked subjects, with the exact names + color slugs + order.
  _check('a3_exactly_8_subjects',
    (select count(*) from subjects where grade_level_id=:'new_grade') = 8),
  _check('a4_subject_names_match',
    (select array_agg(name order by display_order) from subjects where grade_level_id=:'new_grade')
      = array['Math','Reading','Writing','Grammar','Spelling','UFLI','Explorers','SEL']),
  _check('a5_subject_colors_match',
    (select array_agg(color order by display_order) from subjects where grade_level_id=:'new_grade')
      = array['math','reading','writing','grammar','spelling','ufli','explorers','sel']),
  _check('a6_all_team_scope',
    (select bool_and(scope='team') from subjects where grade_level_id=:'new_grade')),
  -- Creator gets TGA 'lead'.
  _check('a7_creator_tga_lead',
    (select role from teacher_grade_assignments
       where teacher_id='00000000-0000-0000-0000-0000000000a1' and grade_level_id=:'new_grade') = 'lead'),
  -- Creator self STM can_edit_master=true for all 8.
  _check('a8_creator_self_stm_master_edit',
    (select count(*) from subject_team_memberships stm join subjects s on s.id=stm.subject_id
       where stm.teacher_id='00000000-0000-0000-0000-0000000000a1' and s.grade_level_id=:'new_grade'
         and stm.can_edit_master=true) = 8),
  _check('a9_create_audited',
    exists(select 1 from audit_log where action='notebook_created' and entity_id=:'new_grade'));

-- ===========================================================================
\echo '== SCENARIO (b): rename_notebook — lead or admin; foreign workspace rejected =='
-- ===========================================================================
-- The admin renames their notebook.
select _become('00000000-0000-0000-0000-0000000000a1');
select rename_notebook(:'new_grade', 'Music & Movement');
select _check('b0_renamed', (select name from grade_levels where id=:'new_grade') = 'Music & Movement');

-- A foreign-workspace grade (the outsider's) must be rejected even for the admin
-- (it is not in the admin's workspace).
select _expect_raise('b1_rename_foreign_grade_rejected',
  format($q$ select rename_notebook(%L, 'Hijack') $q$, :'out_grade'));

-- ===========================================================================
\echo '== SCENARIO (c): archive_notebook — admin-only soft archive; non-admin rejected =='
-- ===========================================================================
-- Non-admin rejected.
select _become('00000000-0000-0000-0000-0000000000b1');
select _expect_raise('c0_archive_nonadmin_rejected',
  format($q$ select archive_notebook(%L) $q$, :'new_grade'));

-- Admin archives (soft) — row still exists, is_active=false.
select _become('00000000-0000-0000-0000-0000000000a1');
select archive_notebook(:'new_grade');
select
  _check('c1_archived_inactive', (select is_active from grade_levels where id=:'new_grade') = false),
  _check('c2_grade_not_deleted', exists(select 1 from grade_levels where id=:'new_grade')),
  _check('c3_subjects_retained', (select count(*) from subjects where grade_level_id=:'new_grade') = 8),
  _check('c4_archive_audited',
    exists(select 1 from audit_log where action='notebook_archived' and entity_id=:'new_grade'));

-- ===========================================================================
\echo '== SCENARIO (d): set_member_role — STM flip; cross-workspace + last-lead guards =='
-- ===========================================================================
-- Promote the plain member (b1) to lead on the TEAM grade → STM flips to true.
select _become('00000000-0000-0000-0000-0000000000a1');
select set_member_role('00000000-0000-0000-0000-0000000000b1', :'team_grade', 'lead');
select
  _check('d0_member_now_lead',
    (select role from teacher_grade_assignments
       where teacher_id='00000000-0000-0000-0000-0000000000b1' and grade_level_id=:'team_grade') = 'lead'),
  _check('d1_stm_master_edit_true',
    (select bool_and(can_edit_master=true) from subject_team_memberships stm join subjects s on s.id=stm.subject_id
       where stm.teacher_id='00000000-0000-0000-0000-0000000000b1' and s.grade_level_id=:'team_grade')),
  _check('d2_role_set_audited',
    exists(select 1 from audit_log where action='member_role_set'
             and entity_id='00000000-0000-0000-0000-0000000000b1'));

-- Demote b1 back to teacher → STM flips to false (admin a1 is still a lead, so
-- this is NOT the last lead → allowed).
select set_member_role('00000000-0000-0000-0000-0000000000b1', :'team_grade', 'teacher');
select
  _check('d3_member_back_to_teacher',
    (select role from teacher_grade_assignments
       where teacher_id='00000000-0000-0000-0000-0000000000b1' and grade_level_id=:'team_grade') = 'teacher'),
  _check('d4_stm_master_edit_false',
    (select bool_and(can_edit_master=false) from subject_team_memberships stm join subjects s on s.id=stm.subject_id
       where stm.teacher_id='00000000-0000-0000-0000-0000000000b1' and s.grade_level_id=:'team_grade'));

-- GRANTABLE-ROLE guard (review H1): a NOTEBOOK-LEAD (not a workspace-admin)
-- may assign 'teacher'/'lead' but NOT 'grade_admin'. Make b1 a lead again, then
-- — acting AS b1 (a lead, not an admin) — attempt to grant grade_admin: REFUSED.
select _become('00000000-0000-0000-0000-0000000000a1');
select set_member_role('00000000-0000-0000-0000-0000000000b1', :'team_grade', 'lead');
select _become('00000000-0000-0000-0000-0000000000b1');
select _expect_raise('d5a_lead_cannot_grant_grade_admin',
  format($q$ select set_member_role('00000000-0000-0000-0000-0000000000d1', %L, 'grade_admin') $q$, :'team_grade'));
select _check('d5b_target_not_grade_admin',
  (select role from teacher_grade_assignments
     where teacher_id='00000000-0000-0000-0000-0000000000d1' and grade_level_id=:'team_grade') <> 'grade_admin');
-- A WORKSPACE-ADMIN (a1), by contrast, MAY assign grade_admin.
select _become('00000000-0000-0000-0000-0000000000a1');
select set_member_role('00000000-0000-0000-0000-0000000000d1', :'team_grade', 'grade_admin');
select _check('d5c_admin_can_grant_grade_admin',
  (select role from teacher_grade_assignments
     where teacher_id='00000000-0000-0000-0000-0000000000d1' and grade_level_id=:'team_grade') = 'grade_admin');
-- Restore the roster to a single lead (a1) before the last-lead checks below:
-- demote both b1 and d1 back to teacher (a1 remains a lead → allowed each time).
select set_member_role('00000000-0000-0000-0000-0000000000b1', :'team_grade', 'teacher');
select set_member_role('00000000-0000-0000-0000-0000000000d1', :'team_grade', 'teacher');

-- Cross-workspace target rejected: the outsider (c1) is not in this workspace.
select _expect_raise('d6_cross_workspace_target_rejected',
  format($q$ select set_member_role('00000000-0000-0000-0000-0000000000c1', %L, 'teacher') $q$, :'team_grade'));

-- LAST-LEAD guard: a1 is now the ONLY lead on the team grade. Demoting a1 to
-- 'teacher' must be REFUSED.
select _expect_raise('d7_last_lead_demotion_refused',
  format($q$ select set_member_role('00000000-0000-0000-0000-0000000000a1', %L, 'teacher') $q$, :'team_grade'));
select _check('d8_admin_still_lead',
  (select role from teacher_grade_assignments
     where teacher_id='00000000-0000-0000-0000-0000000000a1' and grade_level_id=:'team_grade') = 'lead');

-- ===========================================================================
\echo '== SCENARIO (e): remove_member — retains forks; last-lead refused; cross-workspace rejected =='
-- ===========================================================================
-- Give d1 a personal authored lesson in the TEAM grade so we can prove removal
-- RETAINS personal forks.
select id as team_subject from subjects where grade_level_id=:'team_grade' order by display_order limit 1 \gset
insert into personal_authored_lessons (owner_id, grade_level_id, subject_id, week_number, day_of_week, title)
values ('00000000-0000-0000-0000-0000000000d1', :'team_grade', :'team_subject', 1, 'sun', 'D private lesson');

-- Admin removes d1 from the notebook → TGA + STM gone, personal lesson KEPT.
select _become('00000000-0000-0000-0000-0000000000a1');
select remove_member('00000000-0000-0000-0000-0000000000d1', :'team_grade');
select
  _check('e0_tga_removed',
    not exists(select 1 from teacher_grade_assignments
                 where teacher_id='00000000-0000-0000-0000-0000000000d1' and grade_level_id=:'team_grade')),
  _check('e1_stm_removed',
    not exists(select 1 from subject_team_memberships stm join subjects s on s.id=stm.subject_id
                 where stm.teacher_id='00000000-0000-0000-0000-0000000000d1' and s.grade_level_id=:'team_grade')),
  _check('e2_personal_fork_retained',
    exists(select 1 from personal_authored_lessons where owner_id='00000000-0000-0000-0000-0000000000d1')),
  _check('e3_seat_ledger_untouched',
    exists(select 1 from team_memberships where team_id=:'team_id' and teacher_id='00000000-0000-0000-0000-0000000000d1')),
  _check('e4_remove_audited',
    exists(select 1 from audit_log where action='member_removed'
             and entity_id='00000000-0000-0000-0000-0000000000d1'));

-- Cross-workspace target rejected.
select _expect_raise('e5_remove_cross_workspace_rejected',
  format($q$ select remove_member('00000000-0000-0000-0000-0000000000c1', %L) $q$, :'team_grade'));

-- LAST-LEAD guard: a1 is the only lead on the team grade → removing a1 refused.
select _expect_raise('e6_remove_last_lead_refused',
  format($q$ select remove_member('00000000-0000-0000-0000-0000000000a1', %L) $q$, :'team_grade'));
select _check('e7_admin_tga_intact',
  exists(select 1 from teacher_grade_assignments
           where teacher_id='00000000-0000-0000-0000-0000000000a1' and grade_level_id=:'team_grade'));

-- ===========================================================================
\echo '== SCENARIO (f): grant/revoke_workspace_admin — admin-only; cross-workspace; last-admin =='
-- ===========================================================================
-- Non-admin (e1) cannot grant admin.
select _become('00000000-0000-0000-0000-0000000000e1');
select _expect_raise('f0_grant_nonadmin_rejected',
  $q$ select grant_workspace_admin('00000000-0000-0000-0000-0000000000e1') $q$);

-- Admin grants e1 workspace-admin.
select _become('00000000-0000-0000-0000-0000000000a1');
select grant_workspace_admin('00000000-0000-0000-0000-0000000000e1');
select
  _check('f1_e1_now_admin',
    exists(select 1 from school_admins where school_id=:'team_school'
             and teacher_id='00000000-0000-0000-0000-0000000000e1')),
  _check('f2_grant_audited',
    exists(select 1 from audit_log where action='workspace_admin_granted'
             and entity_id='00000000-0000-0000-0000-0000000000e1'));

-- Idempotent re-grant inserts no duplicate (school_admins has no unique key).
select grant_workspace_admin('00000000-0000-0000-0000-0000000000e1');
select _check('f3_grant_idempotent_single_row',
  (select count(*) from school_admins where school_id=:'team_school'
     and teacher_id='00000000-0000-0000-0000-0000000000e1') = 1);

-- Cross-workspace target rejected (the outsider c1).
select _expect_raise('f4_grant_cross_workspace_rejected',
  $q$ select grant_workspace_admin('00000000-0000-0000-0000-0000000000c1') $q$);

-- Revoke e1 → there are now 2 admins (a1 + e1), so revoking e1 is allowed.
select revoke_workspace_admin('00000000-0000-0000-0000-0000000000e1');
select
  _check('f5_e1_revoked',
    not exists(select 1 from school_admins where school_id=:'team_school'
                 and teacher_id='00000000-0000-0000-0000-0000000000e1')),
  _check('f6_revoke_audited',
    exists(select 1 from audit_log where action='workspace_admin_revoked'
             and entity_id='00000000-0000-0000-0000-0000000000e1'));

-- LAST-ADMIN guard: a1 is now the only workspace admin → revoking a1 refused.
select _expect_raise('f7_revoke_last_admin_refused',
  $q$ select revoke_workspace_admin('00000000-0000-0000-0000-0000000000a1') $q$);
select _check('f8_admin_still_admin',
  exists(select 1 from school_admins where school_id=:'team_school'
           and teacher_id='00000000-0000-0000-0000-0000000000a1'));

-- ===========================================================================
-- FINAL GATE — print results + RAISE if any assertion failed (non-zero exit).
-- ===========================================================================
\echo '== RESULTS =='
select name, ok from _t_results order by name;

do $$
declare
  v_failed int;
  v_total  int;
begin
  select count(*) filter (where not ok), count(*) into v_failed, v_total from _t_results;
  raise notice 'workspace/notebook admin test: % of % assertions passed', v_total - v_failed, v_total;
  if v_failed > 0 then
    raise exception 'workspace/notebook admin test FAILED: % assertion(s) false', v_failed;
  end if;
end $$;
