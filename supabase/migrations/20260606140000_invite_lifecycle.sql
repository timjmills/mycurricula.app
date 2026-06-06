-- ###########################################################################
-- ## Invite lifecycle backend (Phase 1B, Wave 4)
-- ###########################################################################
-- Source: docs/6.6.26 Teacher-First Individual + Invite Ultraplan.md §3 (data
-- model), §4 (provisioning), §5 (invites/seats + the two RLS fixes that
-- remain), §8 (risk table — the must-fix RLS items for the team model).
--
-- This wave gives the W2 control-plane tables (teams / team_memberships /
-- invitations, created deny-all in 20260606120000) a working WRITE path and a
-- member-read RLS surface:
--   A. Three SECURITY DEFINER RPCs — create_invite / redeem_invite /
--      revoke_invite — that own ALL invitation+membership mutations and do
--      their OWN authz off auth.uid(). (+ a lazy expire helper.)
--   B. RLS SELECT policies so a teammate may READ their own team's rows; NO
--      INSERT/UPDATE/DELETE policies for `authenticated` — every mutation
--      funnels through the definer RPCs (mirrors how audit_log writes are
--      locked to log_audit_event, M8/M9).
--   C. The §8 must-fix RLS items for the team model (see SECTION C header).
--
-- ADDITIVE ONLY and IDEMPOTENT-FRIENDLY — safe to run on a live database and
-- safe to re-run:
--   * function → CREATE OR REPLACE FUNCTION (re-definable in place)
--   * policy   → DROP POLICY IF EXISTS ... then CREATE POLICY
--   * grants   → REVOKE-then-GRANT (idempotent by nature)
--   * NO table is created or altered (writes into the W2 tables + existing
--     identity/curriculum tables only).
--   * NO seed change (the beta Grade-5 backfill is Wave 6).
--   * The W2 (20260606120000) and W3 (20260606130000) migrations and the seed
--     are NOT modified.
--
-- Cross-references for the schema this depends on:
--   M1 = 20260518102823_initial_schema.sql   (schools, grade_levels, teachers,
--        teacher_grade_assignments [TGA], subjects, subject_team_memberships
--        [STM, can_edit_master DEFAULT true], grade_role enum, audit_action /
--        audit_entity enums, can_read_grade(), auth_teacher_school_id()).
--   M7 = 20260604140000_security_hardening.sql      (tga_write pinned to caller
--        school; no authenticated self-insert on TGA — §5 fix 2 already holds).
--   M8 = 20260604150000_security_hardening_2.sql    (log_audit_event signature +
--        its scope gates: requires auth.uid(); if grade non-null caller must
--        can_read_grade(); if school non-null it must equal
--        auth_teacher_school_id(); if both set the grade must live in school).
--   M9 = 20260606120000_teams_invitations.sql       (teams / team_memberships /
--        invitations + indexes + the invite_* audit_action values).
--
-- ── AUDIT ENTITY NOTE ──────────────────────────────────────────────────────
-- The audit_action enum already carries invite_created / invite_accepted /
-- invite_revoked / invite_expired (added in M9). The audit_entity enum (M1:152)
-- has NO 'invitation'/'team' value — extending it would be a second enum change
-- and is unnecessary. log_audit_event casts nullif(p_entity_type,'')::audit_entity,
-- so we pass entity_type 'role_assignment' (an invitation IS a pending grade-role
-- assignment; on accept it becomes a real TGA) with entity_id = the invitation
-- id, and put team_id / role / grade / email-bound flag in the JSON metadata.
--
-- ── WHAT THIS WAVE DELIBERATELY DOES NOT DO (boundary) ─────────────────────
-- redeem_invite grants GRADE access via a TGA (which is what can_read_grade()
-- keys off — so the invitee can read the team's Master and fork personal copies,
-- the Wave-4 accept criterion). Under Strategy A a teammate also SHARES the
-- team's `schools` row (teachers.school_id = team's school) for school-scoped
-- surfaces (teammate list, school_years, frameworks). Rewriting
-- teachers.school_id is the job of the provisioning-convergence hook (ultraplan
-- §4: "invite-accept takes precedence over auto-workspace-creation") for a
-- FRESH-signup invitee, and an existing-solo-user joining a different team is the
-- documented v1 limitation R4 (scalar school_id, one team per teacher deferred).
-- Per the wave's "keep it migration-only / don't touch TS auth paths" rule, this
-- migration does NOT mutate teachers.school_id; that convergence lives in the
-- auth path. redeem_invite is written to be safely re-runnable so the auth hook
-- can call it after (or instead of) workspace creation.
-- ###########################################################################


-- ###########################################################################
-- ## SECTION A0 — SHARED SECURITY DEFINER MEMBERSHIP HELPERS
-- ###########################################################################
-- Keep the RPC authz and the RLS policies DRY + in lock-step. Both are
-- `security definer` + `set search_path = public` (the SECURITY DEFINER
-- injection guard) so they read the membership tables regardless of the
-- caller's RLS — they only READ and key strictly off the supplied uid.
-- They are SQL/STABLE so the planner can inline them inside policy predicates.

-- True if p_uid is a member (any role) of p_team_id. Powers the member-read RLS
-- policies on the three new tables.
create or replace function is_team_member(p_team_id uuid, p_uid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from team_memberships m
    where m.team_id = p_team_id
      and m.teacher_id = p_uid
  );
$$;

-- is_team_member is the SOLE authorization predicate for the invite RPCs. Per
-- the owner-locked decision #4 (ultraplan §0 / §5: "any member may invite or
-- rescind"), create_invite and revoke_invite authorize on team MEMBERSHIP, not
-- an owner/lead subset. The seat cap (not role) is what bounds invite volume.
-- (The team owner always holds a membership row — provisioning/backfill insert
-- it atomically with the team — so the owner is always covered by is_team_member.)

-- is_team_member is a read-only authorization predicate. It is safe to expose to
-- authenticated callers (it leaks only "are you a member of this team", which the
-- caller already knows about their own teams). EXECUTE is granted to
-- authenticated; never to anon. REVOKE-then-GRANT is idempotent.
revoke execute on function is_team_member(uuid, uuid) from public;
revoke execute on function is_team_member(uuid, uuid) from anon;
grant  execute on function is_team_member(uuid, uuid) to authenticated;


-- ###########################################################################
-- ## SECTION A1 — create_invite RPC
-- ###########################################################################
-- Creates a pending invitation, holding a seat, AFTER an atomic seat-cap check.
--
-- AUTHZ: auth.uid() MUST be a member of the team (is_team_member) — owner-locked
-- decision #4: "any member may invite or rescind." The seat cap, not role,
-- bounds invite volume.
--
-- ATOMICITY (seat overshoot, ultraplan §8 R6): we take a ROW LOCK on the teams
-- row (SELECT ... FOR UPDATE) BEFORE counting. Two concurrent create_invite (or
-- a create racing a redeem) on the same team serialize on that lock, so the
-- "active members + pending invites < seat_cap" predicate is evaluated against a
-- stable snapshot and the cap can never be exceeded by interleaving.
--
-- TOKEN: the RAW token is generated CLIENT-SIDE and shown to the inviter once;
-- only its sha-256 hash (p_token_hash) is passed in and stored. This RPC never
-- sees, stores, or returns a raw token.
--
-- Returns the new invitation id.
create or replace function create_invite(
  p_team_id              uuid,
  p_target_grade_level_id uuid,
  p_role                 grade_role,
  p_invitee_email        text,
  p_token_hash           text,
  p_expires_at           timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_school_id  uuid;
  v_seat_cap   integer;
  v_used       integer;
  v_email      citext := nullif(btrim(p_invitee_email), '')::citext;
  v_invite_id  uuid;
begin
  -- Never run unauthenticated: SECURITY DEFINER bypasses RLS, so a null uid
  -- would let an anonymous caller mint invites.
  if v_uid is null then
    raise exception 'create_invite: requires an authenticated caller';
  end if;

  if p_token_hash is null or btrim(p_token_hash) = '' then
    raise exception 'create_invite: token hash is required';
  end if;
  if p_expires_at is null then
    raise exception 'create_invite: expires_at is required';
  end if;
  if p_expires_at <= now() then
    raise exception 'create_invite: expires_at must be in the future';
  end if;

  -- ── AUTHZ + ROW LOCK ──────────────────────────────────────────────────
  -- Lock the teams row first so the seat-cap check below is race-free, and
  -- capture school_id + seat_cap from the locked snapshot.
  select t.school_id, t.seat_cap
    into v_school_id, v_seat_cap
  from teams t
  where t.id = p_team_id
  for update;

  if v_school_id is null then
    raise exception 'create_invite: team % not found', p_team_id;
  end if;

  if not is_team_member(p_team_id, v_uid) then
    raise exception 'create_invite: caller is not a member of team %', p_team_id;
  end if;

  -- ── GRADE VALIDATION ──────────────────────────────────────────────────
  -- The invited grade MUST belong to the team's (hidden) school. Otherwise an
  -- admin could mint an invite that, on redeem, would grant a TGA to a grade in
  -- a different tenant.
  if not exists (
    select 1 from grade_levels g
    where g.id = p_target_grade_level_id
      and g.school_id = v_school_id
  ) then
    raise exception
      'create_invite: grade % does not belong to team %''s school',
      p_target_grade_level_id, p_team_id;
  end if;

  -- ── INVITER MUST BE ABLE TO READ THE TARGET GRADE (review M2) ─────────
  -- The grade is pinned to the team's SCHOOL above; also require the caller to
  -- be able to READ that grade. This closes the gap where a member with a TGA
  -- for only one grade mints an invite into another grade of the same school,
  -- and prevents an opaque rollback inside log_audit_event's grade gate (the
  -- audit below passes this grade) for a future multi-grade team.
  if not can_read_grade(p_target_grade_level_id) then
    raise exception
      'create_invite: caller cannot access the target grade %',
      p_target_grade_level_id;
  end if;

  -- ── GRANTABLE-ROLE GUARD (review H1 — escalation via unbounded p_role) ─
  -- "Any member may invite" (decision #4) is bounded BY ROLE: a plain member may
  -- mint VIEWER invites ('teacher') only; minting a 'lead' invite (which grants
  -- master-write on redeem) requires the caller to already be a lead/grade_admin
  -- of the target grade. 'grade_admin' is NEVER an invite role (it is a
  -- school-admin grant, outside the §5 viewer/collaborator/lead mapping) — reject
  -- it outright. Without this, a fork-only viewer could invite a second account
  -- they control as 'lead'/'grade_admin' and manufacture master/admin access.
  if coalesce(p_role, 'teacher') not in ('teacher', 'lead') then
    raise exception 'create_invite: % is not an invitable role', p_role;
  end if;
  if coalesce(p_role, 'teacher') = 'lead'
     and not is_grade_lead(p_target_grade_level_id) then
    raise exception
      'create_invite: only a grade lead may invite at the lead role';
  end if;

  -- ── ATOMIC SEAT-CAP CHECK ─────────────────────────────────────────────
  -- A seat is consumed by an active membership OR a still-pending invite.
  -- (Both counts are read under the teams row lock taken above.)
  select
    (select count(*) from team_memberships m where m.team_id = p_team_id)
    + (select count(*) from invitations i
         where i.team_id = p_team_id and i.status = 'pending')
    into v_used;

  if v_used >= v_seat_cap then
    raise exception
      'create_invite: team % is at capacity (% of % seats used)',
      p_team_id, v_used, v_seat_cap
      using errcode = 'check_violation';
  end if;

  -- ── INSERT THE INVITATION ─────────────────────────────────────────────
  -- status defaults to 'pending'. The partial unique index
  -- invitations_one_pending_per_email (M9) rejects a second pending invite to
  -- the same email on this team; surface that as a clean error.
  begin
    insert into invitations (
      team_id, target_grade_level_id, role,
      token_hash, invitee_email, inviter_teacher_id, expires_at
    )
    values (
      p_team_id, p_target_grade_level_id, coalesce(p_role, 'teacher'),
      btrim(p_token_hash), v_email, v_uid, p_expires_at
    )
    returning id into v_invite_id;
  exception
    when unique_violation then
      -- Two constraints can fire here: the partial-unique
      -- invitations_one_pending_per_email (a second pending invite to the same
      -- email on this team) OR the global-unique token_hash (a token collision —
      -- astronomically unlikely with a 256-bit hash, but possible on a buggy
      -- client RNG). Report both possibilities rather than mislabeling a token
      -- collision as an email duplicate (review L2).
      raise exception
        'create_invite: a pending invite already exists for this email on team %, or the token is already in use (regenerate the token)',
        p_team_id
        using errcode = 'unique_violation';
  end;

  -- ── AUDIT ─────────────────────────────────────────────────────────────
  -- Grade scope = the target grade: any team member holds a TGA for the team's
  -- (single, v1) grade, so can_read_grade(target) is true and the grade gate
  -- passes. School is passed NULL deliberately: under the v1 scalar-school model
  -- (ultraplan §8 R4) a NON-owner member's auth_teacher_school_id() is still
  -- their own solo school, not the team's school, so passing the team school
  -- would trip log_audit_event's school gate and roll back the whole invite for
  -- any non-owner inviter. The grade gate is the meaningful scope here (mirrors
  -- redeem_invite, which nulls school for the same reason).
  perform log_audit_event(
    'invite_created',
    'role_assignment',
    v_invite_id,
    p_target_grade_level_id,
    null,
    jsonb_build_object(
      'team_id', p_team_id,
      'role', coalesce(p_role, 'teacher'),
      'email_bound', (v_email is not null),
      'expires_at', p_expires_at
    )
  );

  return v_invite_id;
end;
$$;


-- ###########################################################################
-- ## SECTION A2 — redeem_invite RPC
-- ###########################################################################
-- The invitee (auth.uid()) accepts a pending invite by its token hash. Creates
-- the membership + grade assignment + per-role subject memberships and marks the
-- invite accepted.
--
-- RETURN CONTRACT (review M1/H2): returns ONE row (redeem_status, team_id,
-- grade_level_id). Terminal invite states are reported via `redeem_status`
-- rather than `raise`, because a raise rolls back the whole transaction — which
-- for lazy expiry would also undo the very status='expired' write + audit we
-- need to persist (else the held seat is never freed). redeem_status values:
--   'accepted'         success, or idempotent re-redeem by the same caller —
--                      team_id + grade_level_id are set.
--   'already_member'   caller is already on this team — ids set so the UI can
--                      route them in; the pending invite is left untouched.
--   'already_accepted' the invite was already accepted by someone else.
--   'revoked'          the invite was revoked.
--   'expired'          expired; lazy expiry PERSISTS the transition + audit here.
--   'email_mismatch'   email-bound invite; caller's email differs.
--   'seat_full'        team is at capacity.
--   'invalid'          unknown token, or the team/grade no longer exists.
-- For every status other than 'accepted'/'already_member' the ids are NULL. Only
-- a null auth.uid() / null token (programming errors, never normal flow) raise.
--
-- LOCKING / ATOMICITY:
--   * The invitation row is locked (FOR UPDATE) so two concurrent redeems of the
--     same token serialize; the second sees status<>'pending' and reports it.
--   * The teams row is locked (FOR UPDATE) and the seat cap re-checked at redeem.
--     INVARIANT (review L1): team_memberships rows are created ONLY by this RPC
--     (provisioning seeds a different, NEW team's owner), so create_invite's
--     "members + pending" cap accounting and this "active members" re-check
--     cannot overshoot the cap.
--
-- EMAIL BINDING: if invitee_email is non-null it MUST match the caller's email
-- (case/space-insensitive). Open-link invites (null email) skip this.
--
-- §5 REDEEM HAZARD FIX (R2): STM rows are written with can_edit_master set
-- EXPLICITLY per role — true ONLY for 'lead'/'grade_admin', false for 'teacher'
-- (viewer/collaborator). We NEVER rely on the column's default of true. Because
-- create_invite now forbids minting 'grade_admin' invites and gates 'lead'
-- invites behind grade-lead authority (review H1), a 'teacher' redeemer here can
-- only have come from a viewer invite.
--
-- NOTE: the OUT column is named `redeem_status` (not `status`) so it cannot be
-- confused with the `invitations.status` COLUMN inside the UPDATE ... WHERE
-- status='pending' clauses (plpgsql variable/column ambiguity). The return type
-- changed from the first cut, so DROP then CREATE (CREATE OR REPLACE cannot
-- change a function's return type); DROP IF EXISTS is a no-op on a fresh reset
-- and keeps the migration safe to re-run.
drop function if exists redeem_invite(text);
create function redeem_invite(
  p_token_hash text
)
returns table (redeem_status text, team_id uuid, grade_level_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_inv          invitations%rowtype;
  v_school_id    uuid;
  v_seat_cap     integer;
  v_active       integer;
  v_caller_email citext;
  v_can_edit     boolean;
begin
  if v_uid is null then
    raise exception 'redeem_invite: requires an authenticated caller';
  end if;
  if p_token_hash is null or btrim(p_token_hash) = '' then
    raise exception 'redeem_invite: token hash is required';
  end if;

  -- ── LOOK UP + LOCK THE INVITE ─────────────────────────────────────────
  select * into v_inv
  from invitations i
  where i.token_hash = btrim(p_token_hash)
  for update;

  if v_inv.id is null then
    -- Do not reveal whether a token ever existed beyond "invalid".
    return query select 'invalid'::text, null::uuid, null::uuid;
    return;
  end if;

  -- ── IDEMPOTENCY: already accepted BY THIS caller → success, no-op ──────
  if v_inv.status = 'accepted' and v_inv.accepted_by = v_uid then
    return query select 'accepted'::text, v_inv.team_id, v_inv.target_grade_level_id;
    return;
  end if;

  -- ── TERMINAL (non-pending) STATES → report, do not mutate ─────────────
  -- accepted-by-someone-else, revoked, or already-marked expired.
  if v_inv.status <> 'pending' then
    return query select
      (case when v_inv.status = 'accepted' then 'already_accepted' else v_inv.status end)::text,
      null::uuid, null::uuid;
    return;
  end if;

  -- ── LAZY EXPIRY — PERSIST then report (no raise → the write commits) ───
  if v_inv.expires_at <= now() then
    update invitations set status = 'expired'
     where id = v_inv.id and status = 'pending';
    -- Audit the lazy expiry. NULL grade + NULL school: the expirer may be any
    -- signed-in user who clicked a stale link, not necessarily a team member, so
    -- neither scope gate would pass.
    perform log_audit_event(
      'invite_expired', 'role_assignment', v_inv.id, null, null,
      jsonb_build_object('team_id', v_inv.team_id, 'reason', 'expired_on_redeem')
    );
    return query select 'expired'::text, null::uuid, null::uuid;
    return;
  end if;

  -- ── EMAIL BINDING ─────────────────────────────────────────────────────
  if v_inv.invitee_email is not null then
    select nullif(btrim(t.email), '')::citext into v_caller_email
    from teachers t where t.id = v_uid;
    -- citext compares case-insensitively; btrim handles incidental whitespace.
    if v_caller_email is null or v_caller_email <> v_inv.invitee_email then
      return query select 'email_mismatch'::text, null::uuid, null::uuid;
      return;
    end if;
  end if;

  -- ── LOCK TEAM + CAPTURE ───────────────────────────────────────────────
  select t.school_id, t.seat_cap
    into v_school_id, v_seat_cap
  from teams t
  where t.id = v_inv.team_id
  for update;

  if v_school_id is null then
    return query select 'invalid'::text, null::uuid, null::uuid;  -- team gone
    return;
  end if;

  -- ── ALREADY A MEMBER → report cleanly (review H2) ─────────────────────
  -- A caller already on this team must NOT re-run the grants: the on-conflict
  -- do-nothing inserts would silently drop the new invite's role (a misleading
  -- audit + no actual change). Report 'already_member' and leave the pending
  -- invite untouched (it may be an open link a different new teacher can still
  -- use, or it will expire).
  if exists (
    select 1 from team_memberships m
    where m.team_id = v_inv.team_id and m.teacher_id = v_uid
  ) then
    return query select 'already_member'::text, v_inv.team_id, v_inv.target_grade_level_id;
    return;
  end if;

  -- ── ATOMIC SEAT RE-CHECK ──────────────────────────────────────────────
  -- Caller is confirmed NOT yet a member, so this pending→active conversion adds
  -- exactly one seat; verify active members < cap under the teams row lock.
  select count(*) into v_active
  from team_memberships m where m.team_id = v_inv.team_id;

  if v_active >= v_seat_cap then
    return query select 'seat_full'::text, null::uuid, null::uuid;
    return;
  end if;

  -- ── GRADE STILL VALID FOR THIS TEAM ───────────────────────────────────
  if not exists (
    select 1 from grade_levels g
    where g.id = v_inv.target_grade_level_id
      and g.school_id = v_school_id
  ) then
    return query select 'invalid'::text, null::uuid, null::uuid;  -- grade detached
    return;
  end if;

  -- ── GRANT: membership ─────────────────────────────────────────────────
  -- on-conflict is belt-and-suspenders for a concurrent same-invite redeem (the
  -- already-member fast path above handles normal re-entry).
  insert into team_memberships (team_id, teacher_id, role)
  values (v_inv.team_id, v_uid, coalesce(v_inv.role, 'teacher'))
  on conflict (team_id, teacher_id) do nothing;

  -- ── GRANT: grade assignment (TGA) ─────────────────────────────────────
  -- The §5 fix-2 sanctioned non-admin TGA write: TGA carries no authenticated
  -- self-insert policy (M7), so this SECURITY DEFINER RPC is the only non-admin
  -- path. Idempotent on (teacher_id, grade_level_id) unique (M1).
  insert into teacher_grade_assignments (teacher_id, grade_level_id, role)
  values (v_uid, v_inv.target_grade_level_id, coalesce(v_inv.role, 'teacher'))
  on conflict (teacher_id, grade_level_id) do nothing;

  -- ── GRANT: per-role subject memberships (§5 fix-1 / R2) ────────────────
  -- can_edit_master EXPLICIT: true only for lead/grade_admin, false for
  -- 'teacher' (viewer/collaborator). Never relies on the column default (true).
  v_can_edit := (coalesce(v_inv.role, 'teacher') in ('lead', 'grade_admin'));

  insert into subject_team_memberships (subject_id, teacher_id, can_edit_master)
  select s.id, v_uid, v_can_edit
  from subjects s
  where s.grade_level_id = v_inv.target_grade_level_id
    and s.scope = 'team'
  on conflict (subject_id, teacher_id) do nothing;

  -- ── MARK ACCEPTED ─────────────────────────────────────────────────────
  -- Guarded on still-pending (the FOR UPDATE on this row already serializes us).
  update invitations
     set status = 'accepted', accepted_by = v_uid, accepted_at = now()
   where id = v_inv.id
     and status = 'pending';

  -- ── AUDIT ─────────────────────────────────────────────────────────────
  -- After the TGA insert, can_read_grade(target) is true for this caller within
  -- the same transaction, so the grade gate passes. School null per R4 (the
  -- redeemer's auth_teacher_school_id() may still be their own solo school).
  perform log_audit_event(
    'invite_accepted',
    'role_assignment',
    v_inv.id,
    v_inv.target_grade_level_id,
    null,
    jsonb_build_object(
      'team_id', v_inv.team_id,
      'role', coalesce(v_inv.role, 'teacher'),
      'can_edit_master', v_can_edit
    )
  );

  return query select 'accepted'::text, v_inv.team_id, v_inv.target_grade_level_id;
  return;
end;
$$;


-- ###########################################################################
-- ## SECTION A3 — revoke_invite RPC
-- ###########################################################################
-- An owner/lead rescinds a PENDING invite, immediately freeing the held seat.
-- AUTHZ: is_team_member of the invite's team (decision #4: any member may
-- rescind). Only a currently-'pending' invite
-- transitions to 'revoked' (revoking an accepted/expired/already-revoked invite
-- is a no-op error). A revoked token can never redeem (the redeem state gate).
create or replace function revoke_invite(
  p_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv invitations%rowtype;
begin
  if v_uid is null then
    raise exception 'revoke_invite: requires an authenticated caller';
  end if;

  -- Lock the invite so a concurrent redeem of the same invite serializes with
  -- the revoke (whichever takes the row lock first wins; the loser then sees a
  -- non-pending status and no-ops).
  select * into v_inv
  from invitations i
  where i.id = p_invitation_id
  for update;

  if v_inv.id is null then
    raise exception 'revoke_invite: invitation % not found', p_invitation_id;
  end if;

  if not is_team_member(v_inv.team_id, v_uid) then
    raise exception 'revoke_invite: caller is not a member of the team';
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'revoke_invite: invite is % (only pending invites can be revoked)',
      v_inv.status
      using errcode = 'check_violation';
  end if;

  update invitations set status = 'revoked' where id = v_inv.id;

  -- Audit. Grade scope = the target grade (any member holds a TGA for the team's
  -- v1 grade → grade gate passes). School is NULL for the same v1 scalar-school
  -- reason as create_invite/redeem_invite: a non-owner reviser's
  -- auth_teacher_school_id() is their own solo school, which would trip the
  -- school gate. team_id is recorded in the metadata for traceability.
  perform log_audit_event(
    'invite_revoked',
    'role_assignment',
    v_inv.id,
    v_inv.target_grade_level_id,
    null,
    jsonb_build_object('team_id', v_inv.team_id, 'role', v_inv.role)
  );
end;
$$;


-- ###########################################################################
-- ## SECTION A4 — expire_invitations admin helper (lazy expiry is the floor)
-- ###########################################################################
-- Lazy-on-redeem (SECTION A2) is the FLOOR per the wave spec. This batch helper
-- lets a scheduled/admin sweep mark every overdue pending invite 'expired' so
-- held seats are reclaimed even if a stale invite is never clicked. It is
-- SECURITY DEFINER + service_role-ONLY (a cron/edge function path), NOT callable
-- by authenticated/anon — it would otherwise let any user expire arbitrary
-- teams' invites. It does NOT call log_audit_event (that RPC requires auth.uid()
-- and per-grade scope; a service-role sweep has neither). Returns the count
-- expired.
create or replace function expire_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with expired as (
    update invitations
       set status = 'expired'
     where status = 'pending'
       and expires_at <= now()
    returning 1
  )
  select count(*) into v_count from expired;
  return v_count;
end;
$$;


-- ###########################################################################
-- ## SECTION A5 — RPC EXECUTE GRANTS
-- ###########################################################################
-- create/redeem/revoke run their OWN authz off auth.uid(), so they are granted
-- to `authenticated` and explicitly REVOKED from public/anon (no RPC is
-- callable by anon). expire_invitations is service_role-ONLY (batch sweep).
-- REVOKE-then-GRANT is idempotent.

revoke execute on function create_invite(uuid, uuid, grade_role, text, text, timestamptz) from public;
revoke execute on function create_invite(uuid, uuid, grade_role, text, text, timestamptz) from anon;
grant  execute on function create_invite(uuid, uuid, grade_role, text, text, timestamptz) to authenticated;

revoke execute on function redeem_invite(text) from public;
revoke execute on function redeem_invite(text) from anon;
grant  execute on function redeem_invite(text) to authenticated;

revoke execute on function revoke_invite(uuid) from public;
revoke execute on function revoke_invite(uuid) from anon;
grant  execute on function revoke_invite(uuid) to authenticated;

revoke execute on function expire_invitations() from public;
revoke execute on function expire_invitations() from anon;
revoke execute on function expire_invitations() from authenticated;
grant  execute on function expire_invitations() to service_role;


-- ###########################################################################
-- ## SECTION B — RLS POLICIES ON THE THREE W2 TABLES (member-read only)
-- ###########################################################################
-- W2 (M9) enabled RLS on teams / team_memberships / invitations with NO
-- policies (deny-all). Add ONLY SELECT policies so a teammate can read their own
-- team's control-plane rows. There are deliberately NO INSERT/UPDATE/DELETE
-- policies for `authenticated`: every mutation funnels through the SECURITY
-- DEFINER RPCs above (which run as the definer and bypass RLS), exactly mirroring
-- how audit_log writes are locked to log_audit_event (M8 finding #8). With RLS
-- enabled and no write policy, all non-service-role writes are denied
-- (fail-closed). Service-role server/backfill paths bypass RLS as usual.
--
-- token_hash exposure: ultraplan §5 requires that `invitations.token_hash` is
-- "never selectable to non-admins beyond existence" — a member may know an
-- invite EXISTS but must not read its token_hash (which, with client-side
-- hashing, is the value redeem_invite matches on, i.e. a usable redeem
-- credential). The member-read policy below is therefore paired with a
-- COLUMN-level grant in SECTION B2 that exposes every invitation column EXCEPT
-- token_hash to `authenticated`. The SECURITY DEFINER RPCs (create/redeem/revoke)
-- run as the function owner and retain full column access; service_role bypasses
-- RLS. Non-members (and anon) still read nothing (the row policy requires
-- membership).

-- teams: a member of the team may read the team row (match on teams.id).
drop policy if exists teams_read on teams;
create policy teams_read on teams for select using (
  is_team_member(id, auth.uid())
);

-- team_memberships: a member of the team may read the full roster.
drop policy if exists team_memberships_read on team_memberships;
create policy team_memberships_read on team_memberships for select using (
  is_team_member(team_id, auth.uid())
);

-- invitations: a member of the team may read the team's invites (pending +
-- history). Non-members see none.
drop policy if exists invitations_read on invitations;
create policy invitations_read on invitations for select using (
  is_team_member(team_id, auth.uid())
);


-- ---------------------------------------------------------------------------
-- SECTION B2 — COLUMN PRIVILEGE: hide token_hash from authenticated (§5)
-- ---------------------------------------------------------------------------
-- Make the "token_hash not selectable beyond existence" rule deterministic and
-- independent of whatever blanket table grant Supabase applied: REVOKE the
-- table-wide SELECT from `authenticated`, then GRANT SELECT back on every column
-- EXCEPT token_hash. Row visibility is still governed by invitations_read above;
-- this only removes one column from what a member may read. Consumers (the Wave 5
-- Settings→Team UI) MUST select explicit columns — a `select *` by an
-- authenticated member is rejected for lack of column privilege, which is the
-- intended fail-closed behavior. anon never had access (no policy). The definer
-- RPCs and service_role are unaffected (they do not read as `authenticated`).
revoke select on invitations from authenticated;
grant select (
  id, team_id, target_grade_level_id, role, invitee_email, status,
  inviter_teacher_id, expires_at, accepted_by, accepted_at, created_at
) on invitations to authenticated;


-- ###########################################################################
-- ## SECTION C — §8 MUST-FIX RLS ITEMS FOR THE TEAM MODEL
-- ###########################################################################
-- Ultraplan §8 names exactly TWO RLS must-fixes for the team/invite model, and
-- §2/§5 are explicit that the legacy scope-doc "must-fix #1" (re-scope
-- same-school reads to co-membership) is NOT needed under Strategy A, because
-- teammates literally SHARE a school, so the existing ~40 policies isolate
-- correctly with no rewrite. The two we DO keep are both about the invite path:
--
--   §8 R2 — "Invitee silently gets Master-write (STM defaults true)."
--           MUST-FIX: redeem sets can_edit_master EXPLICITLY per role; viewers
--           get no master-edit. → IMPLEMENTED in redeem_invite (SECTION A2): we
--           compute v_can_edit and pass it explicitly, true ONLY for
--           lead/grade_admin, NEVER relying on the column default of true.
--
--   §8 R3 — "RLS regression = full cross-tenant breach ... TGA stays
--           RPC-only-write."
--           MUST-FIX: teacher_grade_assignments must have NO authenticated
--           self-insert policy; the only non-admin TGA write is the redeem RPC.
--           → This already holds from M1 + M7 (tga_write requires
--           is_grade_admin/is_school_admin and pins the target grade to the
--           caller's school; there is NO authenticated self-insert policy). This
--           wave RELIES on and PRESERVES that posture and adds the sanctioned
--           SECURITY DEFINER writer (redeem_invite). To make the invariant
--           explicit + self-documenting (and guard against a future migration
--           accidentally adding a self-insert path that this comment alone
--           wouldn't catch), we DEFENSIVELY re-drop any authenticated
--           self-insert policy name here. This is a no-op on the current schema
--           (no such policy exists) and is safe/idempotent.
--
-- No other RLS changes are made to the existing tables — Strategy A keeps the
-- 40 policies untouched (ultraplan §2 / §8 R3), which is the single biggest
-- safety lever and the reason this pivot is low-risk.

-- Defensive: ensure no authenticated self-insert path exists on TGA. The
-- sanctioned writes are (a) admin via tga_write (M1/M7) and (b) redeem_invite
-- (SECURITY DEFINER). DROP IF EXISTS is a no-op today and keeps the invariant
-- from silently regressing if a future change re-introduces such a policy name.
drop policy if exists tga_self_insert on teacher_grade_assignments;
drop policy if exists tga_insert_self on teacher_grade_assignments;


-- ###########################################################################
-- End of invite lifecycle backend.
-- ###########################################################################
