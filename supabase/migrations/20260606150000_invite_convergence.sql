-- ###########################################################################
-- ## Invite → workspace convergence (Phase 1B, Wave W-A)
-- ###########################################################################
-- Source: docs/6.6.26 Workspace-Notebook-Team Build Ultraplan.md §3 (W-A: fold
-- convergence into redeem_invite), §4 (RLS must-holds — conservative pristine
-- guard), §5 (risk register — re-home must never destroy/orphan real content);
-- docs/6.6.26 Workspace-Notebook-Team Model.md (the spatial model: one Workspace
-- = one schools row shared by every teammate).
--
-- WHAT THIS CLOSES — "the linchpin gap". Under Strategy A a team is 1:1 with a
-- `schools` row (= the Workspace). For the existing ~40 RLS policies to isolate a
-- teammate into the shared workspace (teammate list, school_years, frameworks,
-- resources — all gated by auth_teacher_school_id()), every member MUST share
-- `teachers.school_id` = the team's school. redeem_invite (M10 =
-- 20260606140000_invite_lifecycle.sql) deliberately granted the TGA + STM +
-- membership but LEFT `teachers.school_id` untouched (its own boundary comment,
-- M10 lines 54-67, 519-520) — deferring convergence to the auth path. This
-- migration folds that convergence INTO redeem_invite so a fresh invitee truly
-- shares the workspace, and reports the deferred multi-workspace case (R4)
-- cleanly instead of half-joining an existing-content user.
--
-- HOW — CREATE OR REPLACE redeem_invite (SAME signature + return type) that is
-- byte-for-byte the M10 body EXCEPT for two inserted pieces, placed AFTER the
-- team lock + already-member fast path and BEFORE the seat re-check:
--   1. An `existing_workspace` early-return: if the redeemer's current workspace
--      is NOT the team's AND is NOT a pristine auto-seeded solo space, grant
--      NOTHING and mutate NOTHING — report the new `existing_workspace` status so
--      the UI can say "joining additional teams is coming soon" (R4 deferred, no
--      data loss).
--   2. A re-home block (run only when pristine AND the redeemer is not already in
--      the team's workspace): part of the SAME grant transaction, after the
--      membership/TGA/STM grants — rewrite teachers.school_id to the team's
--      school and NON-DESTRUCTIVELY retire the now-orphaned solo NOTEBOOK grants
--      (the redeemer's old-school TGA/STM/owner-team membership) so they don't
--      see a phantom empty notebook. Audited via log_audit_event.
--
-- ADDITIVE ONLY and IDEMPOTENT-FRIENDLY — safe to run on a live database and
-- safe to re-run:
--   * function → CREATE OR REPLACE FUNCTION (return type UNCHANGED from M10, so
--     no DROP is needed — re-definable in place).
--   * enum     → ALTER TYPE ... ADD VALUE IF NOT EXISTS (idempotent).
--   * grant    → REVOKE-then-GRANT (idempotent by nature).
--   * NO table is created or altered; NO RLS policy is added or changed (the ~40
--     policies are untouched — ultraplan §2/§4, the single biggest safety lever).
--   * NO seed change.
--
-- Cross-references for the schema this depends on:
--   M1  = 20260518102823_initial_schema.sql   (teachers.school_id NOT NULL,
--         teacher_grade_assignments [TGA], subjects [scope/grade_level_id],
--         subject_team_memberships [STM], grade_levels.school_id, school_admins,
--         audit_action enum, can_read_grade(), auth_teacher_school_id()).
--   M3p = 20260601120000_planner_sections_personal.sql (personal_authored_lessons
--         — OWNER COLUMN `owner_id`).  M1:427 = personal_core_lesson_event_copies
--         — OWNER COLUMN `teacher_id` (the lazy-fork table).
--   M9  = 20260606120000_teams_invitations.sql (teams [school_id NOT NULL UNIQUE,
--         owner_teacher_id], team_memberships, invitations).
--   M10 = 20260606140000_invite_lifecycle.sql  (redeem_invite — the body this
--         migration reproduces verbatim with the two convergence inserts).
--
-- ── PRISTINE GUARD (ultraplan §4/§5 — conservative by design) ───────────────
-- The redeemer is convergeable iff EITHER they are already in the team's
-- workspace (v_old_school = v_school_id — idempotent, nothing to re-home) OR ALL
-- of: (a) they are the solo OWNER of their old workspace (a teams row with
-- school_id = old school AND owner_teacher_id = the redeemer) — i.e. the
-- auto-seeded solo space provision_individual_workspace (M11) created; AND (b)
-- that workspace holds NO real personal content authored by them — zero
-- personal_authored_lessons (owner_id) AND zero personal_core_lesson_event_copies
-- (teacher_id) owned by them. ANY doubt ⇒ NOT pristine ⇒ defer to
-- `existing_workspace`. We never re-home (and thus never orphan) a workspace that
-- has personal content. The re-home is NON-DESTRUCTIVE: it deletes only the
-- redeemer's OWN grant rows for the OLD school; it never deletes any
-- schools/grade_levels/subjects/school_years row — those are left as empty
-- orphans for a future cleanup job (ultraplan §6).
--
-- ── ENUM-IN-TRANSACTION SAFETY (workspace_converged) ────────────────────────
-- We add `workspace_converged` to the audit_action enum here and reference it as
-- a literal inside redeem_invite's body in the SAME migration (Supabase runs each
-- file in one transaction). The PG restriction is that a newly-added enum value
-- may not be *referenced at runtime* in the transaction that added it — but a
-- plpgsql function BODY is only resolved at CALL time. redeem_invite never runs
-- during this migration, so the literal is resolved in a later, committed
-- transaction where the value is fully usable. This mirrors M9, which added the
-- invite_* values that M10's redeem_invite references. (Verified empirically on
-- PG 16: ALTER TYPE ADD VALUE + a function body using the literal commit
-- together, and the function returns the new value when called afterward.)
-- ###########################################################################


-- ###########################################################################
-- ## SECTION 0 — AUDIT ENUM EXTENSION (workspace_converged)
-- ###########################################################################
-- No existing audit_action value names a workspace re-home; add one so the
-- convergence in redeem_invite below is auditable. IF NOT EXISTS keeps it
-- idempotent. See the ENUM-IN-TRANSACTION note in the header for why referencing
-- it from the function body in this same migration is safe.
alter type audit_action add value if not exists 'workspace_converged';


-- ###########################################################################
-- ## SECTION 1 — redeem_invite (M10 body + the two convergence inserts)
-- ###########################################################################
-- Return type is UNCHANGED from M10, so CREATE OR REPLACE (no DROP). The body is
-- reproduced VERBATIM from 20260606140000_invite_lifecycle.sql, differing ONLY
-- by three clearly-marked deltas: (1) two added locals (v_old_school /
-- v_pristine, used solely by the inserted logic); (2) the two CONVERGENCE blocks
-- between the already-member fast path and the seat re-check; and (3) a one-line
-- PRE-EXISTING-BUG fix on the team_memberships on-conflict target — see DELTA #3
-- below and the note here. Every existing status is preserved exactly (invalid /
-- already_accepted / revoked / expired / email_mismatch / seat_full /
-- already_member / accepted); only `existing_workspace` is added.
--
-- ── DELTA #3: PRE-EXISTING BUG IN M10 (surfaced + fixed here) ───────────────
-- M10's redeem_invite is BROKEN on its `accepted` path. The function's OUT
-- columns are (redeem_status, team_id, grade_level_id). TWO of its on-conflict
-- inserts list a column whose name equals an OUT column:
--   * team_memberships          on conflict (team_id, teacher_id)
--   * teacher_grade_assignments on conflict (teacher_id, grade_level_id)
-- plpgsql resolves the unqualified conflict-target name to the VARIABLE, so
-- PostgreSQL raises `column reference "<name>" is ambiguous` and the whole redeem
-- rolls back. Verified empirically: the unmodified M10 function throws on EVERY
-- fresh accept (first on `team_id`, then on `grade_level_id`). Convergence (this
-- wave) sits on that same path, so it literally cannot run until both are fixed.
-- (The STM insert's `(subject_id, teacher_id)` does NOT collide — neither is an
-- OUT name — so it stays verbatim.) The minimal fix targets each NAMED unique
-- constraint (deterministic auto-names from M9/M1), which is unambiguous and
-- alters no other behavior. NOTE FOR REVIEW: this is an M10-origin defect;
-- ideally M10 is patched too, but this CREATE OR REPLACE supersedes M10's
-- definition, so the live function is correct after this migration runs.
create or replace function redeem_invite(
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
  -- ── CONVERGENCE LOCALS (W-A) — used only by the two inserted blocks below ──
  v_old_school   uuid;     -- the redeemer's CURRENT workspace (teachers.school_id)
  v_pristine     boolean;  -- true ⇒ safe to re-home into the team's workspace
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
  -- audit + no actual change). Report 'already_member'.
  if exists (
    select 1 from team_memberships m
    where m.team_id = v_inv.team_id and m.teacher_id = v_uid
  ) then
    -- Seat hygiene (review L3): if this was an EMAIL-BOUND invite to that member,
    -- retire it (accepted) so its reserved seat is released now instead of being
    -- held until expiry. No membership/grant/audit is written — the caller is
    -- already in with their existing role. An OPEN-LINK invite (null email) is
    -- deliberately left pending: its seat is legitimately reserved for a future
    -- NEW joiner who can still use the link.
    if v_inv.invitee_email is not null then
      update invitations
         set status = 'accepted', accepted_by = v_uid, accepted_at = now()
       where id = v_inv.id and status = 'pending';
    end if;
    return query select 'already_member'::text, v_inv.team_id, v_inv.target_grade_level_id;
    return;
  end if;

  -- ╔═══════════════════════════════════════════════════════════════════════╗
  -- ║ CONVERGENCE INSERT #1 (W-A) — existing_workspace guard (R4 deferral)   ║
  -- ╚═══════════════════════════════════════════════════════════════════════╝
  -- The redeemer is NOT yet a member of this team (handled above). Decide whether
  -- they can be safely converged into the team's workspace. Capture their current
  -- workspace first (teachers.school_id is NOT NULL — provisioning seeds a solo
  -- workspace for every teacher, so this is always populated → convergence is an
  -- UPDATE/re-home, never an insert).
  --
  -- FOR UPDATE locks the redeemer's teachers row for the rest of this tx. This
  -- serializes two CONCURRENT redeems by the SAME user of invites to DIFFERENT
  -- teams: without it, both could read the same solo school, both pass the
  -- pristine check on that stale snapshot, and both re-home — landing the user in
  -- two teams at once (the exact R4 state we defer). With the lock, the second
  -- redeem blocks until the first commits, then re-reads the now re-homed
  -- school_id and takes the correct path (existing_workspace for a different
  -- team, or the idempotent fall-through). The invitation + teams rows are
  -- already FOR UPDATE-locked above; this extends that same discipline to the
  -- one identity row this function mutates.
  select t.school_id into v_old_school
  from teachers t where t.id = v_uid
  for update;

  -- Pristine ⇒ safe to re-home. EITHER already in this workspace (idempotent —
  -- nothing to re-home) OR (solo OWNER of the old workspace AND that workspace
  -- holds NO teacher-authored content). Conservative: ANY content check finding a
  -- row, or the redeemer not solo-owning the old workspace, makes them NOT
  -- pristine (defer to existing_workspace). Over-deferring is safe; under-
  -- deferring orphans data.
  --
  -- DATA-LOSS GUARD (external audit 2026-06-06, reproduced on real PG): the
  -- "solo = Master" linchpin (CLAUDE.md §2) means a solo teacher's curriculum
  -- lives in master_core_lesson_events / units — NOT the personal_* tables — so
  -- checking only personal_* (the original bug) silently orphaned full year plans,
  -- boards, and notes on re-home. We therefore check every teacher-authored
  -- content table scoped to the OLD workspace. The auto-seed
  -- (provision_individual_workspace, M11) creates ONLY grade + 8 team subjects +
  -- school_year + grants, so a genuine fresh invitee has zero rows here and still
  -- converges. KEEP THIS LIST IN SYNC as new content tables are added — an
  -- omission re-introduces the silent-data-loss bug.
  v_pristine := (
    v_old_school = v_school_id
    or (
      exists (
        select 1 from teams t
        where t.school_id = v_old_school
          and t.owner_teacher_id = v_uid
      )
      and not exists (
        select 1 from personal_authored_lessons pal
        where pal.owner_id = v_uid
      )
      and not exists (
        select 1 from personal_core_lesson_event_copies pcc
        where pcc.teacher_id = v_uid
      )
      -- Curriculum core (solo = Master): units + their master lesson events.
      and not exists (
        select 1 from units u
        where u.grade_level_id in (
          select g.id from grade_levels g where g.school_id = v_old_school
        )
      )
      and not exists (
        select 1 from master_core_lesson_events m
        join subjects s on s.id = m.subject_id
        where s.grade_level_id in (
          select g.id from grade_levels g where g.school_id = v_old_school
        )
      )
      -- Planner + Teach content authored in the old workspace.
      and not exists (
        select 1 from daily_notes dn
        where dn.grade_level_id in (
          select g.id from grade_levels g where g.school_id = v_old_school
        )
      )
      and not exists (
        select 1 from boards b
        where b.grade_level_id in (
          select g.id from grade_levels g where g.school_id = v_old_school
        )
      )
      and not exists (
        select 1 from extra_lesson_events ele
        where ele.grade_level_id in (
          select g.id from grade_levels g where g.school_id = v_old_school
        )
      )
      and not exists (
        select 1 from time_blocks tb
        where tb.grade_level_id in (
          select g.id from grade_levels g where g.school_id = v_old_school
        )
      )
      and not exists (
        select 1 from event_day_order_overrides edo
        where edo.grade_level_id in (
          select g.id from grade_levels g where g.school_id = v_old_school
        )
      )
      and not exists (
        select 1 from recurrence_patterns rp
        where rp.owner_id = v_uid
      )
      -- Teach/planner content the first fix missed (external audit 2026-06-06
      -- reproduced day_events + todos re-home/orphan). Provisioning seeds NONE of
      -- these, so a genuine fresh skeleton still converges.
      and not exists (
        select 1 from day_events de
        where de.grade_level_id in (
          select g.id from grade_levels g where g.school_id = v_old_school
        )
      )
      and not exists (
        select 1 from todos td
        where td.grade_level_id in (
          select g.id from grade_levels g where g.school_id = v_old_school
        )
      )
      and not exists (
        select 1 from board_templates bt
        where bt.grade_level_id in (
          select g.id from grade_levels g where g.school_id = v_old_school
        )
      )
      -- tags: team tags are grade-scoped; personal tags hang off owner_id.
      and not exists (
        select 1 from tags tg
        where tg.owner_id = v_uid
           or tg.grade_level_id in (
             select g.id from grade_levels g where g.school_id = v_old_school
           )
      )
    )
  );

  -- Different workspace AND not pristine ⇒ defer (R4). Grant NOTHING, mutate
  -- NOTHING — the existing-content user is never half-joined; the pending invite
  -- is left untouched (its seat stays reserved) and the UI surfaces "joining
  -- additional teams is coming soon".
  if v_old_school <> v_school_id and not v_pristine then
    return query select 'existing_workspace'::text, null::uuid, null::uuid;
    return;
  end if;
  -- (Fall through when pristine — re-home happens after the grants, INSERT #2.)

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
  -- ┌─ DELTA #3 vs. the M10 body (PRE-EXISTING BUG FIX, see header) ──────────┐
  -- │ M10 wrote `on conflict (team_id, teacher_id)`. `team_id` is ALSO this   │
  -- │ function's OUT column, so plpgsql resolves the unqualified `team_id` in │
  -- │ the conflict target to the VARIABLE, not the column → every real accept │
  -- │ throws `column reference "team_id" is ambiguous` and rolls back (the    │
  -- │ `accepted` path — and thus convergence — can never run). BOTH `team_id` │
  -- │ AND `grade_level_id` are OUT columns, so the TGA insert below collides  │
  -- │ the same way; the STM insert (subject_id, teacher_id) is the only one   │
  -- │ that does NOT collide and stays verbatim. The OUT name `redeem_status`  │
  -- │ was deliberately chosen to dodge the `invitations.status` collision,    │
  -- │ but these two OUT collisions were missed. Minimal fix: target the NAMED │
  -- │ unique constraint (deterministic auto-name from M9's                    │
  -- │ `unique (team_id, teacher_id)`); unambiguous, no other behavior change. │
  -- └────────────────────────────────────────────────────────────────────────┘
  insert into team_memberships (team_id, teacher_id, role)
  values (v_inv.team_id, v_uid, coalesce(v_inv.role, 'teacher'))
  on conflict on constraint team_memberships_team_id_teacher_id_key do nothing;

  -- ── GRANT: grade assignment (TGA) ─────────────────────────────────────
  -- The §5 fix-2 sanctioned non-admin TGA write: TGA carries no authenticated
  -- self-insert policy (M7), so this SECURITY DEFINER RPC is the only non-admin
  -- path. Idempotent on (teacher_id, grade_level_id) unique (M1).
  -- DELTA #3 (cont.): `grade_level_id` is the function's OTHER OUT column, so
  -- M10's `on conflict (teacher_id, grade_level_id)` collides exactly like the
  -- membership insert above (column-vs-variable ambiguity → hard error on every
  -- accept). Same minimal fix: target the named unique constraint.
  insert into teacher_grade_assignments (teacher_id, grade_level_id, role)
  values (v_uid, v_inv.target_grade_level_id, coalesce(v_inv.role, 'teacher'))
  on conflict on constraint teacher_grade_assignments_teacher_id_grade_level_id_key do nothing;

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

  -- ╔═══════════════════════════════════════════════════════════════════════╗
  -- ║ CONVERGENCE INSERT #2 (W-A) — re-home into the team's workspace        ║
  -- ╚═══════════════════════════════════════════════════════════════════════╝
  -- Runs ONLY when the redeemer is pristine AND currently in a DIFFERENT
  -- workspace (when v_old_school = v_school_id there is nothing to re-home; the
  -- pristine path already fell through). Part of the SAME grant transaction, so
  -- the membership/TGA/STM grants above and this re-home commit or roll back
  -- atomically. STRICTLY scoped to v_uid + v_old_school — it touches only the
  -- redeemer's OWN grant rows for the OLD school, and deletes NO
  -- schools/grade_levels/subjects/school_years row (those become empty orphans
  -- for a future cleanup job — ultraplan §6).
  if v_pristine and v_old_school <> v_school_id then
    -- (a) Re-home: share the team's workspace so the ~40 school-scoped RLS
    -- policies (auth_teacher_school_id()) now resolve the teammate into it.
    update teachers
       set school_id = v_school_id, updated_at = now()
     where id = v_uid;

    -- (b) Retire the now-orphaned solo NOTEBOOK grants so the redeemer doesn't
    -- see a phantom empty notebook. Each delete is pinned to v_uid AND the OLD
    -- school's grades — never the new workspace, never another teacher.
    --   • old-school TGA rows (their grade assignments in the solo workspace)
    delete from teacher_grade_assignments tga
    where tga.teacher_id = v_uid
      and tga.grade_level_id in (
        select g.id from grade_levels g where g.school_id = v_old_school
      );
    --   • old-school STM rows (their subject memberships there — any scope, so
    --     the solo owner's self-STM on its own subjects is fully cleared)
    delete from subject_team_memberships stm
    where stm.teacher_id = v_uid
      and stm.subject_id in (
        select s.id from subjects s
        join grade_levels g on g.id = s.grade_level_id
        where g.school_id = v_old_school
      );
    --   • old-school owner-team membership(s) (their seat in the solo team they
    --     own). Scoped to teams with school_id = old school AND owned by v_uid,
    --     and to this teacher's own membership row.
    delete from team_memberships tm
    where tm.teacher_id = v_uid
      and tm.team_id in (
        select t.id from teams t
        where t.school_id = v_old_school
          and t.owner_teacher_id = v_uid
      );

    -- Audit the convergence. Grade scope = the target grade (after the TGA
    -- insert above, can_read_grade(target) is true for this caller within the
    -- same transaction → the grade gate passes). School NULL: keep parity with
    -- the invite_accepted audit below and avoid coupling to teachers.school_id
    -- ordering (both old/new school live in the metadata for traceability).
    perform log_audit_event(
      'workspace_converged',
      'role_assignment',
      v_inv.id,
      v_inv.target_grade_level_id,
      null,
      jsonb_build_object(
        'team_id', v_inv.team_id,
        'old_school_id', v_old_school,
        'new_school_id', v_school_id
      )
    );
  end if;

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
-- ## SECTION 2 — RPC EXECUTE GRANT (re-assert; signature unchanged from M10)
-- ###########################################################################
-- redeem_invite runs its OWN authz off auth.uid(), so it stays granted to
-- `authenticated` and explicitly REVOKED from public/anon. REVOKE-then-GRANT is
-- idempotent. (The other invite RPCs are untouched by this migration.)
revoke execute on function redeem_invite(text) from public;
revoke execute on function redeem_invite(text) from anon;
grant  execute on function redeem_invite(text) to authenticated;


-- ###########################################################################
-- End of invite → workspace convergence.
-- ###########################################################################
