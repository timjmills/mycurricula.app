-- ###########################################################################
-- ## Functional test — redeem_invite workspace convergence (Wave W-A)
-- ###########################################################################
-- Covers the convergence logic added by
-- supabase/migrations/20260606150000_invite_convergence.sql:
--   (a) pristine fresh invitee  → 'accepted' + teachers.school_id re-homed to the
--       team's school + solo-notebook grants (TGA/STM/owner-team membership)
--       retired + 'workspace_converged' audited + old school/subjects KEPT
--       (re-home is non-destructive);
--   (b) existing-content user (different school) → 'existing_workspace' with ZERO
--       mutation (no membership/TGA/STM, school unchanged, invite still pending);
--   (c) already in this workspace → 'already_member', idempotent, no spurious
--       deletes, email-bound invite retired for seat hygiene;
--   (d) re-redeem of the same token by the same caller → 'accepted' (idempotent);
--   (e) seat cap still enforced → redeem-time seat re-check returns 'seat_full'
--       and grants/mutates nothing in the target workspace.
--
-- ── HOW TO RUN ─────────────────────────────────────────────────────────────
-- There is NO database/RPC test harness in this repo today: vitest
-- (vitest.config.ts) is configured `environment: "node"` for PURE units only
-- (no DB, no network), and there is no pgTAP / local-supabase test client. So
-- this file is a SELF-CONTAINED psql harness, NOT wired into `npm test`. It runs
-- against any Postgres that has the full migration chain applied. Two ways:
--
--   1. Local Supabase (preferred, exact PG 17 parity):
--        supabase start            # applies supabase/migrations/* to the local db
--        psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--          -v ON_ERROR_STOP=1 -f supabase/tests/redeem_invite_convergence_test.sql
--
--   2. A throwaway Postgres with the migrations applied in order, after creating
--      the Supabase-provided stubs the migrations assume (the `anon`,
--      `authenticated`, `service_role` roles; an `auth` schema; `auth.users`;
--      and an `auth.uid()` that reads `request.jwt.claim.sub`). This is exactly
--      how the convergence migration was verified during authoring (PG 16,
--      all 28 assertions below green).
--
-- The script runs each scenario as the relevant user by setting
-- `request.jwt.claim.sub` (which `auth.uid()` reads) via the `_become()` helper,
-- and RAISEs at the end if ANY assertion is false (so it exits non-zero in CI).
-- It is meant to run on a FRESH database (it INSERTs fixed-id auth.users rows);
-- re-running against a dirty db will trip the users_pkey unique constraint —
-- recreate the db (or run inside a transaction you roll back) between runs.
--
-- NOTE (recorded honestly): because no DB harness exists in-repo, this test
-- CANNOT run under `npm test` in this environment. It was authored and verified
-- out-of-band against an ephemeral Postgres with the full migration chain; wiring
-- it into CI (a `supabase db`-backed job) is a follow-up for Wave W-G's test pass.
-- ###########################################################################

\set ON_ERROR_STOP on
\pset pager off

-- A collector for assertion results so we can fail the whole script if any are
-- false (psql has no native assert). Each scenario appends (name, ok) rows. NOTE:
-- no `on commit drop` — psql auto-commits each statement, which would drop such a
-- temp table immediately; a plain session-scoped temp table persists across the
-- script and is gone when the psql session ends.
create temporary table _t_results (name text, ok boolean);
create or replace function _check(p_name text, p_ok boolean) returns boolean
language sql as $$ insert into _t_results values (p_name, p_ok); select p_ok; $$;

-- Become a given user for subsequent statements (drives auth.uid()).
create or replace function _become(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, false)::void $$;

-- Fixed-id auth users: an owner (inviter) + several invitees.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1','owner@team.test'),
  ('00000000-0000-0000-0000-0000000000b1','fresh@solo.test'),
  ('00000000-0000-0000-0000-0000000000c1','content@solo.test'),
  ('00000000-0000-0000-0000-0000000000d1','seat2@solo.test'),
  ('00000000-0000-0000-0000-0000000000e1','seat3@solo.test');

-- Each gets an auto-seeded solo workspace (the convergence precondition: every
-- teacher already has a workspace, so convergence is a re-home/UPDATE).
select provision_individual_workspace('00000000-0000-0000-0000-0000000000a1','owner@team.test','Owner');
select provision_individual_workspace('00000000-0000-0000-0000-0000000000b1','fresh@solo.test','Fresh');
select provision_individual_workspace('00000000-0000-0000-0000-0000000000c1','content@solo.test','Content');
select provision_individual_workspace('00000000-0000-0000-0000-0000000000d1','seat2@solo.test','Seat2');
select provision_individual_workspace('00000000-0000-0000-0000-0000000000e1','seat3@solo.test','Seat3');

-- The owner's team + the grade invitees will converge into.
select t.id as team_id, t.school_id as team_school, g.id as team_grade
from teams t
join grade_levels g on g.school_id = t.school_id
where t.owner_teacher_id = '00000000-0000-0000-0000-0000000000a1'
\gset

-- ===========================================================================
\echo '== SCENARIO (a): pristine fresh invitee -> accepted + re-home =='
-- ===========================================================================
select _become('00000000-0000-0000-0000-0000000000a1');
select create_invite(:'team_id', :'team_grade', 'teacher', null, 'hashA', now() + interval '7 days');

select school_id as b_old_school from teachers where id='00000000-0000-0000-0000-0000000000b1' \gset
select id as b_old_grade from grade_levels
  where school_id=(select school_id from teachers where id='00000000-0000-0000-0000-0000000000b1') \gset

select _become('00000000-0000-0000-0000-0000000000b1');
select redeem_status from redeem_invite('hashA') \gset a_
select _check('a0_status_accepted', :'a_redeem_status' = 'accepted');

select
  _check('a1_rehomed_to_team_school',
    (select school_id from teachers where id='00000000-0000-0000-0000-0000000000b1') = :'team_school'),
  _check('a2_member_of_team',
    exists(select 1 from team_memberships where team_id=:'team_id' and teacher_id='00000000-0000-0000-0000-0000000000b1')),
  _check('a3_tga_team_grade',
    exists(select 1 from teacher_grade_assignments where teacher_id='00000000-0000-0000-0000-0000000000b1' and grade_level_id=:'team_grade')),
  _check('a4_old_tga_removed',
    not exists(select 1 from teacher_grade_assignments where teacher_id='00000000-0000-0000-0000-0000000000b1' and grade_level_id=:'b_old_grade')),
  _check('a5_old_team_membership_removed',
    not exists(select 1 from team_memberships m join teams t on t.id=m.team_id
               where m.teacher_id='00000000-0000-0000-0000-0000000000b1' and t.school_id=:'b_old_school')),
  _check('a6_old_stm_removed',
    not exists(select 1 from subject_team_memberships stm join subjects s on s.id=stm.subject_id
               join grade_levels g on g.id=s.grade_level_id
               where stm.teacher_id='00000000-0000-0000-0000-0000000000b1' and g.school_id=:'b_old_school')),
  _check('a7_eight_team_stm',
    (select count(*) from subject_team_memberships stm join subjects s on s.id=stm.subject_id
     where stm.teacher_id='00000000-0000-0000-0000-0000000000b1' and s.grade_level_id=:'team_grade') = 8),
  _check('a8_viewer_no_master_edit',
    (select bool_and(can_edit_master=false) from subject_team_memberships stm join subjects s on s.id=stm.subject_id
     where stm.teacher_id='00000000-0000-0000-0000-0000000000b1' and s.grade_level_id=:'team_grade')),
  _check('a9_convergence_audited',
    exists(select 1 from audit_log where action='workspace_converged' and actor_teacher_id='00000000-0000-0000-0000-0000000000b1')),
  -- Re-home is NON-DESTRUCTIVE: the orphaned old school + subjects still exist.
  _check('a10_old_school_kept',  exists(select 1 from schools where id=:'b_old_school')),
  _check('a11_old_subjects_kept',exists(select 1 from subjects where grade_level_id=:'b_old_grade'));

-- ===========================================================================
\echo '== SCENARIO (b): existing-content user, different school -> existing_workspace, ZERO mutation =='
-- ===========================================================================
-- A personal authored lesson in the content user's solo space makes them NOT
-- pristine, so convergence MUST defer (no data loss, nothing half-joined).
select grade_level_id, id as c_subject from subjects
  where grade_level_id=(select id from grade_levels
                        where school_id=(select school_id from teachers where id='00000000-0000-0000-0000-0000000000c1'))
  limit 1 \gset
insert into personal_authored_lessons (owner_id, grade_level_id, subject_id, week_number, day_of_week, title)
values ('00000000-0000-0000-0000-0000000000c1', :'grade_level_id', :'c_subject', 1, 'sun', 'My private lesson');

select school_id as c_old_school from teachers where id='00000000-0000-0000-0000-0000000000c1' \gset
select
  (select count(*) from team_memberships where teacher_id='00000000-0000-0000-0000-0000000000c1') as c_tm_before,
  (select count(*) from teacher_grade_assignments where teacher_id='00000000-0000-0000-0000-0000000000c1') as c_tga_before,
  (select count(*) from subject_team_memberships where teacher_id='00000000-0000-0000-0000-0000000000c1') as c_stm_before
\gset

select _become('00000000-0000-0000-0000-0000000000a1');
select create_invite(:'team_id', :'team_grade', 'teacher', null, 'hashC', now() + interval '7 days');
select _become('00000000-0000-0000-0000-0000000000c1');
select redeem_status from redeem_invite('hashC') \gset b_
select _check('b0_status_existing_workspace', :'b_redeem_status' = 'existing_workspace');

select
  _check('b1_school_unchanged',
    (select school_id from teachers where id='00000000-0000-0000-0000-0000000000c1') = :'c_old_school'),
  _check('b2_tm_unchanged',
    (select count(*) from team_memberships where teacher_id='00000000-0000-0000-0000-0000000000c1') = :c_tm_before),
  _check('b3_tga_unchanged',
    (select count(*) from teacher_grade_assignments where teacher_id='00000000-0000-0000-0000-0000000000c1') = :c_tga_before),
  _check('b4_stm_unchanged',
    (select count(*) from subject_team_memberships where teacher_id='00000000-0000-0000-0000-0000000000c1') = :c_stm_before),
  _check('b5_invite_still_pending',
    (select status from invitations where token_hash='hashC') = 'pending'),
  _check('b6_not_joined_team',
    not exists(select 1 from team_memberships where team_id=:'team_id' and teacher_id='00000000-0000-0000-0000-0000000000c1')),
  _check('b7_content_intact',
    exists(select 1 from personal_authored_lessons where owner_id='00000000-0000-0000-0000-0000000000c1'));

-- ===========================================================================
\echo '== SCENARIO (c): already in this workspace -> already_member, idempotent =='
-- ===========================================================================
-- b1 is now in the team workspace (from scenario a). An email-bound invite to b1
-- redeemed again must NOT re-grant; the email-bound invite is retired (seat
-- hygiene) and no spurious deletes occur.
select _become('00000000-0000-0000-0000-0000000000a1');
select create_invite(:'team_id', :'team_grade', 'teacher', 'fresh@solo.test', 'hashB2', now() + interval '7 days');
select
  (select count(*) from team_memberships where teacher_id='00000000-0000-0000-0000-0000000000b1') as b1_tm_before,
  (select count(*) from teacher_grade_assignments where teacher_id='00000000-0000-0000-0000-0000000000b1') as b1_tga_before
\gset
select _become('00000000-0000-0000-0000-0000000000b1');
select redeem_status from redeem_invite('hashB2') \gset c_
select _check('c0_status_already_member', :'c_redeem_status' = 'already_member');

select
  _check('c1_tm_unchanged',
    (select count(*) from team_memberships where teacher_id='00000000-0000-0000-0000-0000000000b1') = :b1_tm_before),
  _check('c2_tga_unchanged',
    (select count(*) from teacher_grade_assignments where teacher_id='00000000-0000-0000-0000-0000000000b1') = :b1_tga_before),
  _check('c3_still_team_school',
    (select school_id from teachers where id='00000000-0000-0000-0000-0000000000b1') = :'team_school'),
  _check('c4_emailbound_retired',
    (select status from invitations where token_hash='hashB2') = 'accepted');

-- ===========================================================================
\echo '== SCENARIO (d): re-redeem idempotency (same caller, same token) =='
-- ===========================================================================
select _become('00000000-0000-0000-0000-0000000000b1');
select redeem_status from redeem_invite('hashA') \gset d_
select _check('d0_status_accepted', :'d_redeem_status' = 'accepted');
select
  _check('d1_still_team_school',
    (select school_id from teachers where id='00000000-0000-0000-0000-0000000000b1') = :'team_school'),
  _check('d2_single_membership',
    (select count(*) from team_memberships where teacher_id='00000000-0000-0000-0000-0000000000b1') = 1);

-- ===========================================================================
\echo '== SCENARIO (e): seat cap still enforced =='
-- ===========================================================================
-- Free the seat scenario (b) legitimately still holds (existing_workspace keeps
-- its reserved seat) so the cap math is clean for this scenario.
select _become('00000000-0000-0000-0000-0000000000a1');
select revoke_invite(id) from invitations where token_hash='hashC';

-- Members now: owner + b1 = 2 of cap 5. Add 3 → exactly at cap.
insert into auth.users (id,email) values
  ('00000000-0000-0000-0000-0000000000f1','seat4@solo.test'),
  ('00000000-0000-0000-0000-0000000000f2','seat5@solo.test'),
  ('00000000-0000-0000-0000-0000000000f3','seat6@solo.test');
select provision_individual_workspace('00000000-0000-0000-0000-0000000000f1','seat4@solo.test','S4');
select provision_individual_workspace('00000000-0000-0000-0000-0000000000f2','seat5@solo.test','S5');
select provision_individual_workspace('00000000-0000-0000-0000-0000000000f3','seat6@solo.test','S6');
select _become('00000000-0000-0000-0000-0000000000a1');
select create_invite(:'team_id', :'team_grade', 'teacher', null, 'seatT1', now() + interval '7 days');
select create_invite(:'team_id', :'team_grade', 'teacher', null, 'seatT2', now() + interval '7 days');
select create_invite(:'team_id', :'team_grade', 'teacher', null, 'seatT3', now() + interval '7 days');
select _become('00000000-0000-0000-0000-0000000000d1'); select redeem_invite('seatT1');
select _become('00000000-0000-0000-0000-0000000000e1'); select redeem_invite('seatT2');
select _become('00000000-0000-0000-0000-0000000000f1'); select redeem_invite('seatT3');

-- 5 members = cap. Inject a pending invite by DIRECT insert (bypassing
-- create_invite's pre-check) so we exercise redeem's OWN atomic seat re-check.
insert into invitations (team_id, target_grade_level_id, role, token_hash, invitee_email, inviter_teacher_id, expires_at)
values (:'team_id', :'team_grade', 'teacher', 'seatOVER', null, '00000000-0000-0000-0000-0000000000a1', now() + interval '7 days');
select _become('00000000-0000-0000-0000-0000000000f2');
select redeem_status from redeem_invite('seatOVER') \gset e_
select _check('e0_status_seat_full', :'e_redeem_status' = 'seat_full');

select
  _check('e1_five_members_at_cap',
    (select count(*) from team_memberships where team_id=:'team_id') = 5),
  _check('e2_overflow_not_rehomed',
    (select school_id from teachers where id='00000000-0000-0000-0000-0000000000f2') <> :'team_school'),
  _check('e3_overflow_no_target_membership',
    (select count(*) from team_memberships tm join teams t on t.id=tm.team_id
       where tm.teacher_id='00000000-0000-0000-0000-0000000000f2'
         and t.owner_teacher_id='00000000-0000-0000-0000-0000000000a1') = 0);

-- ===========================================================================
-- FINAL GATE — print the full result table and RAISE if any assertion failed
-- (so the script exits non-zero in CI).
-- ===========================================================================
\echo '== RESULTS =='
select name, ok from _t_results order by name;

do $$
declare
  v_failed int;
  v_total  int;
begin
  select count(*) filter (where not ok), count(*) into v_failed, v_total from _t_results;
  raise notice 'convergence test: % of % assertions passed', v_total - v_failed, v_total;
  if v_failed > 0 then
    raise exception 'convergence test FAILED: % assertion(s) false', v_failed;
  end if;
end $$;
