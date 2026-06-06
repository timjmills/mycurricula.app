-- ###########################################################################
-- ## Individual (teacher-first) provisioning RPC (Phase 1B, Wave 3)
-- ###########################################################################
-- Source: docs/6.6.26 Teacher-First Individual + Invite Ultraplan.md §2
-- (architecture — the hidden workspace), §3 (the teams/team_memberships control
-- plane), §4 (provisioning), §5 (the "solo = Master" linchpin + the STM-defaults
-- redeem hazard). Implements the LOCKOUT-FREE path: when
-- `PROVISIONING_MODE="individual"`, a freshly-authenticated user idempotently
-- gets their OWN private workspace — NO domain check, NO shared-tenant lookup.
--
-- This migration is ADDITIVE ONLY and IDEMPOTENT-FRIENDLY — safe to run on a
-- live database and safe to re-run:
--   * function → CREATE OR REPLACE FUNCTION (re-definable in place)
--   * grants   → REVOKE-then-GRANT (idempotent)
--   * NO table is created or altered (it writes into existing tables only).
--   * NO RLS policy is added or changed (Wave 4 owns RLS on the new tables).
--   * NO seed change (the per-tenant 8-subject graph is replicated AT RUNTIME by
--     this function, mirroring the seed's names/colors/display_order exactly).
--
-- Cross-references for the schema this depends on:
--   M1 = 20260518102823_initial_schema.sql  (schools, grade_levels, teachers,
--        teacher_grade_assignments, subjects, subject_team_memberships,
--        school_years, grade_role enum, set_updated_at()).
--   M9 = 20260606120000_teams_invitations.sql (teams, team_memberships).
--
-- ── ATOMICITY ──────────────────────────────────────────────────────────────
-- The ENTIRE provisioning graph is built inside ONE plpgsql function body, which
-- executes within the single transaction of the calling statement. Any failure
-- at any insert raises and rolls back EVERY insert — there is no code path that
-- can leave a half-built workspace (orphan school / grade / subjects with no
-- teacher, etc.). Because a failed run persists nothing, the only idempotency
-- concern is a *successful* prior run, handled by the early-return guard below.
--
-- ── IDEMPOTENCY ────────────────────────────────────────────────────────────
-- The function is keyed off the auth uid (p_uid):
--   1. If this uid already OWNS a team (teams.owner_teacher_id = p_uid), the
--      workspace already exists → return it (pure no-op). This is the re-run /
--      double-signup case.
--   2. Else if a `teachers` row already exists for this uid (e.g. it was
--      provisioned by the DOMAIN path, or any other prior binding), FAIL CLOSED
--      with `existing-teacher-not-individual` — we must NOT mint a second
--      workspace for an account already bound to a tenant, and we must NOT
--      migrate it across tenants. (A domain→individual flip is an explicit
--      migration, never an accidental side effect of a login.)
--   3. Otherwise build the workspace fresh.
-- A concurrent first-signup for the same uid is made safe by the `teachers` PK
-- (= uid): the loser's INSERT raises unique_violation, rolling back its whole
-- transaction (no orphans); the EXCEPTION handler then re-resolves the winner's
-- team and returns it, so concurrent first-entry still converges on ONE
-- workspace.
--
-- ── SECURITY ───────────────────────────────────────────────────────────────
-- SECURITY DEFINER: the caller is the SERVICE-ROLE admin client (server-side
-- provisioning hook). A freshly-authenticated user has NO teachers row yet, so
-- they cannot write any of these RLS-gated rows themselves — exactly the gap
-- ensure-teacher.ts exists to close (mirrors the domain path's admin-client
-- writes). `set search_path = public` pins schema resolution so a malicious
-- session search_path cannot shadow `public.*` objects (injection hazard for
-- SECURITY DEFINER fns). EXECUTE is granted to the service_role ONLY — never to
-- `authenticated`/`anon`, because this function mints a brand-new tenant and
-- must never be reachable from a normal user session (that would let any signed
-- in user fabricate schools/teams at will).
--
-- ── CROSS-TENANT ISOLATION ─────────────────────────────────────────────────
-- Every row the function writes references the school/grade it JUST created in
-- this same call (captured into locals). It never reads or attaches to any
-- pre-existing school, grade, or subject. The result is a wholly self-contained
-- tenant owned by p_uid — no path to another teacher's data.
--
-- ── MASTER-EDIT SCOPE (ultraplan §5 redeem hazard, applied here) ────────────
-- subject_team_memberships.can_edit_master DEFAULTS true (M1:334). For the SOLO
-- owner that is correct and intended — "solo = Master in your own space"
-- (ultraplan §2): the owner edits their own Master directly. We therefore insert
-- a self STM ONLY for the 8 subjects of THIS teacher's OWN new grade. No STM is
-- ever written for any other teacher or any other subject, so the broad default
-- cannot leak master-edit beyond the owner's own freshly-created subjects.
-- ###########################################################################

create or replace function provision_individual_workspace(
  p_uid          uuid,
  p_email        text,
  p_display_name text
)
returns table (teacher_id uuid, grade_level_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_grade_id  uuid;
  v_year_id   uuid;
  v_team_id   uuid;
  v_existing_school uuid;
  -- A safe, bounded display name. The email local-part is the fallback label,
  -- matching the domain path (ensure-teacher.ts displayName derivation).
  v_display   text := left(
    coalesce(nullif(btrim(p_display_name), ''), 'Teacher'),
    120
  );
begin
  if p_uid is null then
    raise exception 'provision_individual_workspace: p_uid is required';
  end if;

  -- ── IDEMPOTENCY GUARD #1 — already provisioned (re-run / double signup) ──
  -- If this uid already owns a team, the workspace exists. Resolve its school's
  -- first active grade and return it unchanged. No write happens.
  select t.id, t.school_id
    into v_team_id, v_school_id
  from teams t
  where t.owner_teacher_id = p_uid
  limit 1;

  if v_team_id is not null then
    select g.id into v_grade_id
    from grade_levels g
    where g.school_id = v_school_id
      and g.is_active = true
    order by g.display_order asc
    limit 1;
    return query select p_uid, v_grade_id;
    return;
  end if;

  -- ── IDEMPOTENCY GUARD #2 — uid already bound to a (non-individual) tenant ──
  -- A teachers row that exists WITHOUT an owned team means this account was
  -- provisioned by another path (domain mode, backfill, etc.). Do NOT create a
  -- second workspace and do NOT migrate it — fail closed, diagnosable.
  select tc.school_id into v_existing_school
  from teachers tc
  where tc.id = p_uid;

  if v_existing_school is not null then
    raise exception
      'provision_individual_workspace: uid % already bound to school % without an owned team',
      p_uid, v_existing_school
      using errcode = 'raise_exception';
  end if;

  -- ── BUILD THE WORKSPACE (atomic — one transaction) ──────────────────────
  -- 1) Hidden per-tenant school. The name is cosmetic + never shown in the UI
  --    (the workspace is invisible per Strategy A). Defaults match the seed
  --    (Sun–Thu week is sample data, NOT a constraint — but it is a sensible
  --    solo default until a solo-config UI lands; ultraplan §9 open item 4).
  insert into schools (name)
  values (v_display || '''s Curriculum')
  returning id into v_school_id;

  -- 2) One active grade in that school. Generic name (no single-grade
  --    assumption baked into the data model — this is just the solo teacher's
  --    one grade for now).
  insert into grade_levels (school_id, name, display_order, is_active)
  values (v_school_id, 'My Class', 0, true)
  returning id into v_grade_id;

  -- 3) The 8 LOCKED subjects, replicated per-tenant with the EXACT same names,
  --    color slugs, and display_order as supabase/seed.sql. The team-wide rule
  --    is about the color MAPPING, not row identity — each tenant owns its own
  --    8 subject rows (ultraplan §8 R8). scope='team' / owner_id null (these are
  --    the workspace's shared subjects, not personal subjects).
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

  -- 4) A personal school_year so calendar surfaces have an active year. Dates +
  --    label mirror the seed's 2025–2026 baseline (a sensible default; the solo
  --    teacher can adjust it once a config UI exists).
  insert into school_years (
    school_id, label, start_date, end_date, weeks, is_active, active_cycle_pattern
  )
  values (
    v_school_id, '2025–2026', date '2025-08-24', date '2026-06-18',
    40, true, 'one_week'
  )
  returning id into v_year_id;

  -- 5) The teachers row — id = auth uid, school_id = the NEW school, defaults
  --    identical to the domain path (default_view 'weekly', completion_privacy
  --    'private'), default_grade_level_id = the new grade.
  insert into teachers (
    id, school_id, email, display_name,
    default_view, completion_privacy, default_grade_level_id
  )
  values (
    p_uid, v_school_id, coalesce(nullif(btrim(p_email), ''), ''), v_display,
    'weekly', 'private', v_grade_id
  );

  -- 6) The lead grade assignment (this teacher leads their own grade).
  insert into teacher_grade_assignments (teacher_id, grade_level_id, role)
  values (p_uid, v_grade_id, 'lead');

  -- 7) Self STM with can_edit_master=true for EVERY one of this teacher's own
  --    new subjects (solo = Master, ultraplan §2). Scoped strictly to the 8
  --    subjects just created for v_grade_id — no other teacher, no other subject.
  insert into subject_team_memberships (subject_id, teacher_id, can_edit_master)
  select s.id, p_uid, true
  from subjects s
  where s.grade_level_id = v_grade_id;

  -- 8) The team (1:1 with the hidden school), owned by this teacher; default
  --    seat_cap (5) from the column default (1 owner + 4 invited, ultraplan §0).
  insert into teams (school_id, name, owner_teacher_id)
  values (v_school_id, v_display || '''s Team', p_uid)
  returning id into v_team_id;

  -- 9) The owner's membership seat (role 'lead').
  insert into team_memberships (team_id, teacher_id, role)
  values (v_team_id, p_uid, 'lead');

  return query select p_uid, v_grade_id;
  return;

exception
  when unique_violation then
    -- CONCURRENCY: a parallel first-signup for the SAME uid won the race and
    -- committed the teachers/teams rows; this transaction's INSERT collided and
    -- has been rolled back in full (no orphans). Re-resolve the winner's team
    -- and return it, so concurrent first-entry still converges on ONE workspace.
    -- If somehow no owned team is found (the collision was on something else),
    -- re-raise so the caller sees a real error rather than a silent empty result.
    select t.id, t.school_id
      into v_team_id, v_school_id
    from teams t
    where t.owner_teacher_id = p_uid
    limit 1;

    if v_team_id is null then
      raise;
    end if;

    select g.id into v_grade_id
    from grade_levels g
    where g.school_id = v_school_id
      and g.is_active = true
    order by g.display_order asc
    limit 1;

    return query select p_uid, v_grade_id;
    return;
end;
$$;

-- EXECUTE is restricted to the service role ONLY. This function mints a new
-- tenant; it must be unreachable from any `authenticated`/`anon` session (that
-- would let any signed-in user fabricate schools/teams). The server-side admin
-- client (service_role) is the sole caller. REVOKE-then-GRANT is idempotent.
revoke execute on function provision_individual_workspace(uuid, text, text) from public;
revoke execute on function provision_individual_workspace(uuid, text, text) from anon;
revoke execute on function provision_individual_workspace(uuid, text, text) from authenticated;
grant  execute on function provision_individual_workspace(uuid, text, text) to service_role;


-- ###########################################################################
-- End of individual provisioning RPC.
-- ###########################################################################
