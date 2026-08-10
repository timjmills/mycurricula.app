-- ###########################################################################
-- ## Functional test — active school-year switch + the school_years guards
-- ###########################################################################
-- Covers supabase/migrations/20260807120000_active_school_year_switch.sql:
--   (1) the partial unique index school_years_one_active_per_school
--   (2) set_active_school_year() — switch, idempotence, audit, and each of its
--       four authorisation outcomes
--   (3) the three guard triggers — INSERT of an active year, UPDATE of
--       is_active / school_id, DELETE of the active year
--
-- Written against the review findings, one scenario per finding, so a reviewer
-- can map them 1:1:
--   CRITICAL  DELETE of the sole active year          → scenario (f)
--   CRITICAL  SECURITY DEFINER made the guards inert  → scenarios (c)(f)(g)
--   HIGH      cross-tenant existence disclosure       → scenario (d)
--   HIGH      direct INSERT ... is_active = true      → scenario (g)
--   HIGH      lock keyed on a mutable school_id       → scenarios (c2)(k)
--   MEDIUM    advisory lock assumes read committed    → scenario (l)
--   MEDIUM    service_role gated but untested         → scenario (m)
--   MEDIUM    no executable DB tests                  → this file
--
-- ── THE SECOND CRITICAL, AND WHY THIS FILE EARNED ITS KEEP ─────────────────
-- A review pass found that the guard function had been declared SECURITY
-- DEFINER while deciding "is this a client?" with `current_user` — which inside
-- a DEFINER function is the OWNER, so the test was false on every call and all
-- three guards were INERT. Note what that implies for THIS file: scenarios (c),
-- (f) and (g) would have gone RED, because the direct writes they expect to be
-- rejected are RLS-authorised for a school_admin and would have succeeded. The
-- harness was not fooled by the bug; it was simply never run. That is the whole
-- argument for running it before the migration is applied, and the reason the
-- status note at the bottom of this header is worded the way it is.
--
-- ── THE ROLE TRAP — READ THIS BEFORE TRUSTING A GREEN RUN ──────────────────
-- The guards deliberately exempt every role that is NOT a Supabase client role
-- (see the migration's ROLE GATE section: provisioning RPCs, seeds and
-- pg_restore must keep working). psql connects as `postgres`, which is exempt.
-- A version of this file that forgot to `set role authenticated` would
-- therefore see EVERY negative assertion pass — while proving nothing at all,
-- because no guard would have run. Every scenario below that expects a
-- rejection runs under `set role authenticated`, and scenario (b) is a
-- deliberate control that FAILS if the role switch is not in effect.
--
-- Second trap: an "it raised, so the guard works" assertion. `_expect_raise`
-- now REQUIRES an expected-message fragment, because accepting any error means
-- an unrelated RLS, privilege or schema failure reads as a passing guard test.
-- A failing assertion names which of the three outcomes occurred — guard fired,
-- wrong error (quoted), or no error at all — so a red run is diagnosable
-- without re-running it.
--
-- Third trap, same family: as `authenticated`, RLS is live, and a policy
-- mismatch on UPDATE/DELETE silently affects ZERO rows instead of raising. A
-- rejection assertion could pass because RLS filtered the row, not because the
-- guard fired. Every negative is therefore run as a user who PASSES the
-- `school_years_write` policy (a school_admin of that school), and each is
-- paired with a positive control proving the same user CAN write that row by a
-- permitted route.
--
-- ── HOW TO RUN ─────────────────────────────────────────────────────────────
-- Mirrors supabase/tests/workspace_notebook_admin_test.sql EXACTLY: there is NO
-- database test harness wired into `npm test` in this repo (vitest is
-- `environment: "node"`, pure units only — no DB, no pgTAP). This is a
-- self-contained psql harness that runs against any Postgres with the full
-- migration chain applied, INCLUDING the migration under test.
--
--   1. Local Supabase (preferred, exact PG 17 parity):
--        supabase start
--        psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--          -v ON_ERROR_STOP=1 -f supabase/tests/active_school_year_switch_test.sql
--
--   2. A throwaway Postgres with the migrations applied in order, after
--      creating the Supabase stubs the migrations assume (the `anon`,
--      `authenticated`, `service_role` roles; an `auth` schema; `auth.users`;
--      and an `auth.uid()` reading `request.jwt.claim.sub`).
--
-- NEVER run this against production. It creates schools, teachers and years,
-- and scenario (i) deletes a school.
--
-- Run on a FRESH database (it INSERTs fixed-id auth.users rows); re-running
-- against a dirty db trips users_pkey.
--
-- ── WHAT THIS FILE STILL CANNOT TEST ───────────────────────────────────────
-- Real concurrency. Every scenario runs in ONE psql session, so two callers
-- racing the same school — the case the advisory lock exists for — is not
-- reproduced here and would need two coordinated sessions (dblink, or a
-- driver script). Scenario (k) is the closest single-session substitute: it
-- asserts the lock is actually TAKEN and keyed exactly as documented, which
-- catches a mis-keyed lock (HIGH-4's failure mode) without catching a genuine
-- interleaving bug. Do not read a green run as concurrency coverage.
--
-- ── STATUS: EXECUTED 2026-08-10. 47 of 47 assertions passed. ───────────────
-- This header used to warn that the file had never been run. It has now been
-- run, and the migration applied clean, so that warning is retired rather than
-- softened. Environment: PostgreSQL 16.14 on a throwaway cluster (no Docker
-- available; the server binaries were extracted from the Ubuntu .debs into a
-- user directory, so nothing was installed system-wide). All 39 migrations in
-- supabase/migrations/ applied in order, then this file.
--
-- ⚠ TWO SUPABASE STUBS THE MIGRATIONS ASSUME, beyond the ones listed under
-- HOW TO RUN — both were discovered by hitting them, and a bare Postgres needs
-- both or the chain stops:
--   • `auth.jwt()` returning `current_setting('request.jwt.claims', true)::jsonb`
--     — 20260607120000_claude_access_log_reconcile.sql:51 needs it.
--   • an `extensions` SCHEMA with pgcrypto installed into it
--     — 20260615120000_framework_selection.sql:192 needs it.
--
-- ⚠ AND ONE THAT IS NOT A STUB BUT A REAL PROPERTY OF THIS SCHEMA: no migration
-- GRANTS anything on `school_years` (nor on the teach tables). Freshly applied
-- to a bare Postgres, `information_schema.role_table_grants` shows privileges
-- for `postgres` ONLY, while three policies exist — so as `authenticated` every
-- scenario here dies with "permission denied for table school_years" before a
-- single guard runs. The app works because a real Supabase PROJECT grants
-- anon/authenticated/service_role on public tables by default; the repo relies
-- on that platform default rather than creating it. A throwaway database must
-- therefore run, AFTER the migrations:
--     grant all on all tables    in schema public to anon, authenticated, service_role;
--     grant all on all sequences in schema public to anon, authenticated, service_role;
--     grant execute on all functions in schema public to anon, authenticated, service_role;
--
-- ── THE INSTRUMENT WAS PROVEN, NOT ASSUMED ─────────────────────────────────
-- A green run on a never-before-executed harness is worth little on its own, so
-- the counterfactual was run: the three guard triggers were dropped and the file
-- re-run. It did NOT print a green table — it recorded 9 failures before
-- aborting, and the four that matter name their own failure mode rather than
-- reporting a bare false:
--     c1_direct_deactivate_rejected  [NO ERROR — the write SUCCEEDED]
--     c2_school_id_change_rejected   [NO ERROR — the write SUCCEEDED]
--     f3_delete_active_year_rejected [NO ERROR — the write SUCCEEDED]
--     g1_insert_active_year_rejected [NO ERROR — the write SUCCEEDED]
-- plus the state checks c3/c4/f4/g2/g4. That is the SECURITY DEFINER
-- inert-guard bug reproduced deliberately, and this file detecting it — which
-- is the claim the header above makes and could not previously back.
--
-- STILL TRUE: this is not concurrency coverage (see above), and a green run
-- here is not a substitute for the apply-day runbook checks in the migration.
-- ###########################################################################

\set ON_ERROR_STOP on
\pset pager off

-- ---------------------------------------------------------------------------
-- Harness (same shape as the two existing test files).
-- ---------------------------------------------------------------------------
-- DELIBERATE DEVIATION from the sibling tests, which use a TEMPORARY table.
-- The scenarios below run under `set role authenticated`, and a temp table
-- lives in a per-session pg_temp schema whose USAGE cannot be granted to
-- another role by a stable name. A plain table in `public` sidesteps that
-- entirely; the script already requires a throwaway database, and it is dropped
-- after the final gate (on a PASSING run only — a failure leaves it for
-- inspection).
drop table if exists _t_results;
create table _t_results (name text, ok boolean);

-- `authenticated` must be able to record results, since most assertions are
-- made while that role is active. The helpers stay SECURITY INVOKER on
-- purpose: a SECURITY DEFINER _expect_raise would execute its payload as
-- postgres — the exempt role — and every guard assertion would pass
-- vacuously. That is the exact trap described in the header.
grant select, insert on _t_results to authenticated;

create or replace function _check(p_name text, p_ok boolean) returns boolean
language sql as $$ insert into _t_results values (p_name, p_ok); select p_ok; $$;

-- Become a given user for subsequent statements (drives auth.uid()).
create or replace function _become(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, false)::void $$;

-- Record whether a statement raised THE EXPECTED error. The expected-message
-- fragment is a REQUIRED third argument, deliberately: an earlier version
-- accepted ANY error, so a negative could go green because of an unrelated RLS,
-- privilege or schema failure — a red (or a green) that was never attributed to
-- the guard it claims to be testing. That is the same class of defect as
-- everything else this migration has been chased for.
--
-- MATCHING IS SUBSTRING (`position(p_expect in sqlerrm) > 0`), NOT PREFIX, and
-- that is deliberate — do not "tighten" it to a prefix test. Not one of the
-- five fragments below sits at position 0 of its message: every guard message
-- opens with the `school_years: ` namespace, and the index violation opens with
-- Postgres's own `duplicate key value violates unique constraint "…"` with the
-- index name in the MIDDLE. A prefix match would fail all five, reporting five
-- correctly-firing guards as "raised the WRONG error" — an assertion added to
-- prevent misattributed reds, itself producing them. Verified mechanically
-- against the migration's actual raise literals, not from memory.
--
-- Three distinguishable outcomes, and the two failures say WHICH they were in
-- the assertion name, so a failing run is diagnosable without a re-run.
create or replace function _expect_raise(p_name text, p_sql text, p_expect text)
returns boolean
language plpgsql as $$
declare
  v_msg text;
begin
  execute p_sql;
  -- Outcome 1: no error at all. The write SUCCEEDED — the guard is not there.
  insert into _t_results
    values (p_name || '  [NO ERROR — the write SUCCEEDED]', false);
  return false;
exception when others then
  v_msg := sqlerrm;
  if position(p_expect in v_msg) > 0 then
    -- Outcome 2: the expected guard fired.
    insert into _t_results values (p_name, true);
    return true;
  end if;
  -- Outcome 3: something raised, but not the guard. Record what, so the red is
  -- attributed rather than merely observed.
  insert into _t_results
    values (p_name || '  [raised the WRONG error: ' || left(v_msg, 140) || ']', false);
  return false;
end $$;

-- Like _expect_raise, but returns the MESSAGE. Scenario (d) needs to compare
-- two error texts for equality, which is the whole point of the disclosure fix.
-- Returns a sentinel when the statement unexpectedly succeeded, so a silent
-- success can never masquerade as a matching message.
create or replace function _raise_msg(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return '<<NO ERROR RAISED>>';
exception when others then
  return sqlerrm;
end $$;

-- ===========================================================================
\echo '== FIXTURES =='
-- ===========================================================================
-- A  = school admin of school SA               (the actor in most scenarios)
-- B  = plain member of SA, NOT an admin        (the admin-check scenario)
-- C  = outsider, sole member of foreign SC     (the disclosure scenario)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a001','a@sy.test'),
  ('00000000-0000-0000-0000-00000000b001','b@sy.test'),
  ('00000000-0000-0000-0000-00000000c001','c@sy.test');

-- Each provisioning call mints a school with EXACTLY ONE ACTIVE YEAR. That is
-- itself the first assertion: provisioning must survive the new INSERT guard
-- (it is SECURITY DEFINER, so current_user inside it is the owner, not the
-- caller — the ROLE GATE exemption). If the exemption were wrong, these three
-- calls would fail and the script would abort here rather than report.
select provision_individual_workspace('00000000-0000-0000-0000-00000000a001','a@sy.test','A');
select provision_individual_workspace('00000000-0000-0000-0000-00000000b001','b@sy.test','B');
select provision_individual_workspace('00000000-0000-0000-0000-00000000c001','c@sy.test','C');

select school_id as sa from teachers where id='00000000-0000-0000-0000-00000000a001' \gset
select school_id as sb from teachers where id='00000000-0000-0000-0000-00000000b001' \gset
select school_id as sc from teachers where id='00000000-0000-0000-0000-00000000c001' \gset

select id as ya1 from school_years where school_id=:'sa' \gset
select id as yc1 from school_years where school_id=:'sc' \gset

-- Provisioning does NOT mint a school_admins row (20260606160000 header, :32),
-- so grant A admin of SA explicitly. B is deliberately left non-admin.
insert into school_admins (school_id, teacher_id)
values (:'sa', '00000000-0000-0000-0000-00000000a001');

-- B joins SA as a plain member: a workspace_members row plus the active
-- pointer, which is what auth_teacher_school_id() validates against.
insert into workspace_members (school_id, teacher_id)
values (:'sa', '00000000-0000-0000-0000-00000000b001');
update teachers set active_school_id=:'sa'
 where id='00000000-0000-0000-0000-00000000b001';

-- A is ALSO a member of SB but stays focused on SA — the setup scenario (e)
-- needs to separate "not your workspace" from "no such row".
insert into workspace_members (school_id, teacher_id)
values (:'sb', '00000000-0000-0000-0000-00000000a001');
insert into school_admins (school_id, teacher_id)
values (:'sb', '00000000-0000-0000-0000-00000000a001');
select id as yb1 from school_years where school_id=:'sb' \gset

-- A second, INACTIVE year for SA. Inserted as postgres (exempt) because the
-- guard forbids clients creating an ALREADY-ACTIVE year, not an inactive one —
-- scenario (g) proves both halves of that from the client side.
insert into school_years (school_id, label, start_date, end_date, weeks, is_active)
values (:'sa','2026–2027', date '2026-08-24', date '2027-06-18', 40, false)
returning id as ya2 \gset

select
  _check('f0_sa_has_exactly_one_active',
    (select count(*) from school_years where school_id=:'sa' and is_active) = 1),
  _check('f1_ya2_starts_inactive',
    (select is_active from school_years where id=:'ya2') = false),
  _check('f2_provisioning_survived_insert_guard',
    (select count(*) from school_years where school_id in (:'sa',:'sb',:'sc') and is_active) = 3);

-- ===========================================================================
\echo '== (a) the partial unique index rejects a second active year =='
-- ===========================================================================
-- Run as postgres ON PURPOSE: an index is not a policy and cannot be bypassed
-- by role, so this proves the table-level half of the invariant holds even for
-- the role every trigger exempts.
-- Expect the INDEX, named in the unique-violation text — not the trigger, which
-- exempts postgres. Asserting the name is what distinguishes "the invariant is
-- enforced by the index" from "some other constraint happened to fire".
select _expect_raise('a1_index_blocks_second_active_even_as_owner',
  format($q$ update school_years set is_active = true where id = %L $q$, :'ya2'),
  'school_years_one_active_per_school');

select _check('a2_ya2_still_inactive',
  (select is_active from school_years where id=:'ya2') = false);

-- ===========================================================================
\echo '== (b) CONTROL — as authenticated, an admin CAN still edit a year =='
-- ===========================================================================
-- The control that makes every later rejection meaningful. If this fails, the
-- role switch or the RLS policy is blocking writes wholesale and every
-- `_expect_raise` below would pass for the wrong reason.
select _become('00000000-0000-0000-0000-00000000a001');
set role authenticated;

select _check('b0_role_really_switched', current_user = 'authenticated');

update school_years set label = 'RENAMED BY TEST' where id = :'ya2';

reset role;
select _check('b1_label_edit_succeeded_as_authenticated',
  (select label from school_years where id=:'ya2') = 'RENAMED BY TEST');

-- ===========================================================================
\echo '== (c) UPDATE guard — is_active and school_id are not client-writable =='
-- ===========================================================================
select _become('00000000-0000-0000-0000-00000000a001');
set role authenticated;

-- The original hole: one PATCH, school stranded at zero active years.
select _expect_raise('c1_direct_deactivate_rejected',
  format($q$ update school_years set is_active = false where id = %L $q$, :'ya1'),
  'may only be changed via set_active_school_year');

-- HIGH 4's precondition: school_id must be immutable, or the advisory lock key
-- is meaningless.
select _expect_raise('c2_school_id_change_rejected',
  format($q$ update school_years set school_id = %L where id = %L $q$, :'sb', :'ya1'),
  'school_id is immutable');

reset role;
select
  _check('c3_ya1_still_active',
    (select is_active from school_years where id=:'ya1') = true),
  _check('c4_ya1_still_in_sa',
    (select school_id from school_years where id=:'ya1') = :'sa');

-- ===========================================================================
\echo '== (d) HIGH — no cross-tenant existence disclosure =='
-- ===========================================================================
-- The heart of the disclosure fix: a uuid that does not exist and a uuid naming
-- a REAL year in a school the caller has no relationship with must produce
-- BYTE-IDENTICAL errors. If these ever diverge, the RPC is an existence oracle
-- over the whole customer base again.
select _become('00000000-0000-0000-0000-00000000a001');
set role authenticated;

select
  _raise_msg(format($q$ select set_active_school_year(%L) $q$,
                    '00000000-0000-0000-0000-0000deadbeef')) as msg_missing,
  _raise_msg(format($q$ select set_active_school_year(%L) $q$, :'yc1')) as msg_foreign
\gset

reset role;
select
  _check('d1_missing_and_foreign_are_identical', :'msg_missing' = :'msg_foreign'),
  _check('d2_message_is_the_opaque_one',
    :'msg_missing' like '%no such school year%'),
  _check('d3_foreign_call_did_raise_at_all',
    :'msg_foreign' <> '<<NO ERROR RAISED>>'),
  _check('d4_message_does_not_name_a_workspace',
    :'msg_foreign' not like '%different workspace%'),
  _check('d5_foreign_year_untouched',
    (select is_active from school_years where id=:'yc1') = true);

-- ===========================================================================
\echo '== (e) the other three authorisation outcomes stay distinguishable =='
-- ===========================================================================
-- These are safe to distinguish precisely BECAUSE they are only reachable once
-- membership is established — the caller already knows the school exists.
select _become('00000000-0000-0000-0000-00000000a001');
set role authenticated;
-- A is a member AND admin of SB, but is focused on SA → recoverable message.
select _raise_msg(format($q$ select set_active_school_year(%L) $q$, :'yb1')) as msg_ws \gset
reset role;
select _check('e1_cross_workspace_is_its_own_message',
  :'msg_ws' like '%different workspace%');

-- B is a member of SA but not an admin → permission message, not the opaque one.
select _become('00000000-0000-0000-0000-00000000b001');
set role authenticated;
select _raise_msg(format($q$ select set_active_school_year(%L) $q$, :'ya2')) as msg_adm \gset
reset role;
select
  _check('e2_non_admin_gets_admin_message', :'msg_adm' like '%not an admin%'),
  _check('e3_non_admin_did_not_switch',
    (select is_active from school_years where id=:'ya2') = false);

-- ===========================================================================
\echo '== (f) CRITICAL — the active year cannot be deleted by a client =='
-- ===========================================================================
-- The finding this whole revision exists for. Deleting a year CASCADES to
-- units/recurrence_patterns/coverage_snapshots, so this is destructive as well
-- as invariant-breaking.
select _become('00000000-0000-0000-0000-00000000a001');
set role authenticated;

select _expect_raise('f3_delete_active_year_rejected',
  format($q$ delete from school_years where id = %L $q$, :'ya1'),
  'the active year may not be deleted');

-- Positive control: the SAME user deleting an INACTIVE year must succeed, or
-- the assertion above proves only that DELETE is broken generally.
delete from school_years where id = :'ya2';

reset role;
select
  _check('f4_active_year_survived',
    exists(select 1 from school_years where id=:'ya1')),
  _check('f5_inactive_year_deleted_ok',
    not exists(select 1 from school_years where id=:'ya2'));

-- ===========================================================================
\echo '== (g) HIGH — a client cannot INSERT an already-active year =='
-- ===========================================================================
-- The zero-active school is the dangerous case: the index has no opinion, so
-- only the trigger stands between a direct POST and a bypassed audit trail.
-- Drive SA to zero active as postgres (exempt) to build exactly that state.
update school_years set is_active = false where id = :'ya1';
select _check('g0_sa_now_has_zero_active',
  (select count(*) from school_years where school_id=:'sa' and is_active) = 0);

select _become('00000000-0000-0000-0000-00000000a001');
set role authenticated;

select _expect_raise('g1_insert_active_year_rejected',
  format($q$ insert into school_years
              (school_id, label, start_date, end_date, weeks, is_active)
            values (%L,'SNEAKY', date '2027-08-24', date '2028-06-18', 40, true) $q$,
          :'sa'),
  'may not be created already-active');

-- Positive control: the same INSERT with is_active = false must succeed. This
-- is also the supported way to create next year's row.
insert into school_years (school_id, label, start_date, end_date, weeks, is_active)
values (:'sa','2027–2028', date '2027-08-24', date '2028-06-18', 40, false);

reset role;
select
  _check('g2_no_sneaky_active_row',
    not exists(select 1 from school_years where school_id=:'sa' and label='SNEAKY')),
  _check('g3_inactive_insert_succeeded',
    exists(select 1 from school_years where school_id=:'sa' and label='2027–2028')),
  _check('g4_still_zero_active',
    (select count(*) from school_years where school_id=:'sa' and is_active) = 0);

-- ===========================================================================
\echo '== (h) the RPC is the one path that works — switch, audit, idempotence =='
-- ===========================================================================
select id as ya3 from school_years where school_id=:'sa' and label='2027–2028' \gset

select _become('00000000-0000-0000-0000-00000000a001');
set role authenticated;
select set_active_school_year(:'ya3') as sw1 \gset
-- Second call on the SAME year: idempotent no-op, false, NOT an error. This is
-- what makes the planned Undo safe to double-fire.
select set_active_school_year(:'ya3') as sw2 \gset
reset role;

select
  _check('h1_switch_returned_true',  :'sw1' = 't'),
  _check('h2_repeat_returned_false', :'sw2' = 'f'),
  _check('h3_exactly_one_active_now',
    (select count(*) from school_years where school_id=:'sa' and is_active) = 1),
  _check('h4_the_right_year_is_active',
    (select is_active from school_years where id=:'ya3') = true),
  _check('h5_audit_row_emitted',
    exists(select 1 from audit_log
            where action='school_year_started'
              and entity_id=:'ya3'
              and school_id=:'sa'));

-- Now switch BACK, so the deactivate arm runs with a real sibling to turn off
-- (the h1 switch ran from zero-active, which never exercises it).
select _become('00000000-0000-0000-0000-00000000a001');
set role authenticated;
select set_active_school_year(:'ya1') as sw3 \gset
reset role;

select
  _check('h6_switch_back_returned_true', :'sw3' = 't'),
  _check('h7_old_year_deactivated',
    (select is_active from school_years where id=:'ya3') = false),
  _check('h8_still_exactly_one_active',
    (select count(*) from school_years where school_id=:'sa' and is_active) = 1),
  _check('h9_audit_records_the_deactivated_year',
    (select metadata->'previous_school_year_ids' from audit_log
      where action='school_year_started' and entity_id=:'ya1'
      order by timestamp desc limit 1) @> to_jsonb(:'ya3'::uuid));

-- ===========================================================================
\echo '== (i) the GUC window closes again inside the same transaction =='
-- ===========================================================================
-- Tests the "reset the GUC after the two updates" fix, which is otherwise
-- invisible: psql autocommits, so a transaction-local GUC would evaporate
-- between statements anyway and a per-statement test would pass either way.
-- Both statements must therefore share ONE explicit transaction. The direct
-- UPDATE must still be rejected even though set_active_school_year() ran
-- moments earlier in the same transaction.
select _become('00000000-0000-0000-0000-00000000a001');
set role authenticated;

-- The result is captured into a PSQL variable, not recorded via _check, because
-- an _expect_raise here would INSERT its row inside this transaction and the
-- rollback would throw the evidence away with it. psql variables survive.
begin;
  select set_active_school_year(:'ya3');
  select _raise_msg(
    format($q$ update school_years set is_active = false where id = %L $q$, :'ya3')
  ) as msg_rearm \gset
rollback;

reset role;
select
  _check('i1_guard_rearmed_after_rpc_in_same_txn',
    :'msg_rearm' like '%may only be changed via set_active_school_year%'),
  _check('i2_rollback_left_ya1_active',
    (select is_active from school_years where id=:'ya1') = true);

-- ===========================================================================
\echo '== (j) deleting a school still works (the school→years RI cascade) =='
-- ===========================================================================
-- A DELETE guard on an active year could make any school with one permanently
-- undeletable, since school_years.school_id is `on delete cascade`.
--
-- HONEST LIMITATION: this runs as postgres, which the ROLE GATE exempts
-- outright, so it proves the guard does not break school deletion — nothing
-- more. It cannot prove anything about a CLIENT-initiated cascade, because
-- `schools` has no client DELETE policy, so no client can start one. The
-- migration relies on exactly that fact rather than on a cascade special case
-- (an earlier revision had one; detecting the cascade required a table read
-- that only SECURITY DEFINER made trustworthy, and DEFINER is what broke the
-- role gate). If a client-facing school-deletion feature ever lands, come back
-- here: if it is a SECURITY DEFINER RPC it stays exempt and this scenario still
-- covers it; if it grants clients a DELETE policy on `schools`, this scenario
-- must be rewritten under `set role authenticated` and the guard extended.
delete from schools where id = :'sc';
select
  _check('j1_school_deleted', not exists(select 1 from schools where id=:'sc')),
  _check('j2_its_active_year_cascaded',
    not exists(select 1 from school_years where id=:'yc1'));

-- ===========================================================================
\echo '== (k) the advisory lock is really taken, and keyed per school =='
-- ===========================================================================
-- HIGH-4 was a lock keyed on a value that could change under it. A mis-keyed
-- lock is invisible: the function still returns true, still writes the right
-- rows, and only corrupts under concurrency that this single-session harness
-- cannot produce. So assert the KEY directly instead.
--
-- pg_advisory_xact_lock holds until commit/abort, so inside an explicit
-- transaction the lock is still in pg_locks and its objid/classid encode the
-- bigint key. Compare against the key the migration documents.
select _become('00000000-0000-0000-0000-00000000a001');
set role authenticated;

-- The comparison splits the EXPECTED key into the two 32-bit halves Postgres
-- stores it as, rather than reassembling classid/objid into a bigint:
-- hashtextextended can return a negative bigint, and `classid::bigint << 32`
-- on the unsigned high half overflows bigint when it does.
begin;
  select set_active_school_year(:'ya3');
  with k as (
    select hashtextextended('school_years:active_switch:' || :'sa', 0) as key
  )
  select count(*) as lock_hits
    from pg_locks l, k
   where l.locktype = 'advisory'
     and l.pid      = pg_backend_pid()
     and l.objsubid = 1                                   -- 1 = single-bigint key
     and l.classid  = ((k.key >> 32) & 4294967295)::oid   -- high half
     and l.objid    = ( k.key        & 4294967295)::oid   -- low half
  \gset
rollback;

reset role;
select _check('k1_advisory_lock_keyed_by_school', :lock_hits >= 1);

-- ===========================================================================
\echo '== (l) the RPC refuses non-read-committed isolation =='
-- ===========================================================================
-- At REPEATABLE READ the pre-lock probe fixes the snapshot, so the post-lock
-- re-read cannot see a concurrent winner's commit and the serialisation
-- argument collapses. The RPC must refuse rather than return a wrong result.
select _become('00000000-0000-0000-0000-00000000a001');
set role authenticated;

begin isolation level repeatable read;
  select _raise_msg(format($q$ select set_active_school_year(%L) $q$, :'ya3'))
    as msg_iso \gset
rollback;

reset role;
select _check('l1_repeatable_read_refused', :'msg_iso' like '%read committed%');

-- ===========================================================================
\echo '== (m) service_role is gated too, and the privileged bypass works =='
-- ===========================================================================
-- Every scenario above runs as `authenticated`. `service_role` is the OTHER
-- gated client role and the one whose gating was argued about, so leaving it
-- untested would mean the design decision under review is the one thing the
-- suite does not check.
--
-- This is a CLEANER test than the authenticated ones: service_role bypasses
-- RLS, so there is no policy that could filter the row and produce a
-- zero-rows-no-error false pass. Any rejection here is unambiguously the guard.
grant select, insert on _t_results to service_role;

set role service_role;

select _expect_raise('m1_service_role_direct_deactivate_rejected',
  format($q$ update school_years set is_active = false where id = %L $q$, :'ya1'),
  'may only be changed via set_active_school_year');

-- Positive control: service_role CAN still edit the row by a permitted route,
-- so m1 is the guard talking and not a blanket denial.
update school_years set label = 'RENAMED BY SERVICE ROLE' where id = :'ya1';

reset role;
select
  _check('m2_service_role_label_edit_succeeded',
    (select label from school_years where id=:'ya1') = 'RENAMED BY SERVICE ROLE'),
  _check('m3_ya1_still_active',
    (select is_active from school_years where id=:'ya1') = true);

-- The privileged bypass the runbook advertises. An advertised-but-untested
-- recovery path is exactly the thing that fails the first time someone needs
-- it, so exercise it end to end: open the window, delete a whole school whose
-- active year would otherwise be undeletable, confirm the cascade ran.
select id as sb_year from school_years where school_id=:'sb' and is_active \gset

set role service_role;
begin;
  select set_config('mycurricula.active_year_switch', 'rpc', true);
  delete from schools where id = :'sb';
commit;
reset role;

select
  _check('m4_privileged_bypass_deleted_the_school',
    not exists(select 1 from schools where id=:'sb')),
  _check('m5_its_active_year_cascaded',
    not exists(select 1 from school_years where id=:'sb_year'));

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
  raise notice 'active school-year switch test: % of % assertions passed',
    v_total - v_failed, v_total;
  if v_failed > 0 then
    raise exception 'active school-year switch test FAILED: % assertion(s) false', v_failed;
  end if;
end $$;

-- Only reached when every assertion passed — a FAILED run deliberately leaves
-- _t_results behind so the failing rows can be inspected.
drop table _t_results;
