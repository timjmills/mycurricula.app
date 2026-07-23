-- ###########################################################################
-- ## Multi-workspace tenancy (Wave 12b-2 — the membership control plane)
-- ###########################################################################
-- PRODUCT MODEL (user-locked): a workspace is a real, separate tenant (its own
-- `schools` row). A teacher may CREATE their own workspaces (bounded by an
-- anti-abuse cap) AND join others by invite. Joining now means BELONGING TO
-- BOTH: the invite becomes a non-destructive ADD (a new membership), NOT the
-- former MOVE (which re-homed teachers.school_id and deleted the old grants).
-- Solo vs. team is DERIVED per workspace from its membership count.
--
-- ── THE FUNNEL (kept, not rewritten) ───────────────────────────────────────
-- Today ALL tenancy funnels through ONE helper, auth_teacher_school_id() (M1
-- ~:1114), which returns the SCALAR teachers.school_id and is read by ~20 RLS
-- policies (schools_read, grade_levels_read, teachers_read, school_years_read,
-- school_admins_read, subjects_read, …) plus every workspace/notebook RPC. We
-- KEEP that funnel and REDEFINE it to resolve a MEMBERSHIP-VALIDATED
-- ACTIVE-WORKSPACE POINTER. Not one of the ~20 policies is touched — they
-- inherit the new resolution transparently because the signature is unchanged.
--
-- ── FAIL-CLOSED RESOLVER (the crown jewel) ─────────────────────────────────
-- auth_teacher_school_id() := coalesce(
--     active_school_id  — ONLY IF (auth.uid(), active_school_id) is a real row
--                          in workspace_members (join-validated),
--     home school_id )  — the fallback = today's exact behavior.
-- A poked / foreign active_school_id that is NOT a membership resolves back to
-- the HOME school, NEVER to a non-member school. A NULL pointer (every teacher
-- on deploy) resolves to home → ZERO behavior change on deploy. This is the
-- single most important property in the file: it makes the pointer incapable of
-- escalating a non-member into another tenant, independent of any UI or grant.
--
-- ── DEFENSE IN DEPTH (three layers guard the pointer) ──────────────────────
--   1. Column privilege (M6, security_hardening): `authenticated` may UPDATE
--      only (display_name, default_view, completion_privacy) on teachers — it
--      has NO privilege on active_school_id, so a client cannot set it directly
--      at all. The SECURITY DEFINER RPCs (owned by postgres) are the sole write
--      path and bypass this.
--   2. Hardened teachers_update_self WITH CHECK (SECTION 7): even if a future
--      migration grants update(active_school_id) to authenticated, the pointer
--      may only ever be set to NULL or a real membership.
--   3. The fail-closed resolver above: the runtime net — a stale/foreign
--      pointer NEVER widens read scope regardless of how it got there.
--
-- ── CONTENT vs. CHROME (an intentional, accepted asymmetry) ────────────────
-- School-scoped CHROME (schools/grade_levels/teachers/school_years/
-- school_admins) resolves to the ACTIVE workspace via the scalar funnel.
-- Grade-scoped CONTENT (units, lessons, notes, boards, …) is gated by
-- can_read_grade()/auth_teacher_grade_ids() off teacher_grade_assignments — so
-- a teacher who legitimately BELONGS TO BOTH workspaces (a home TGA + an
-- invited TGA) can read content in BOTH, regardless of which is active. That is
-- BY DESIGN ("joining = belong to both"): membership grants content-read; the
-- active pointer scopes chrome + the app's default filter. A NON-member never
-- gets a TGA (or a workspace_members / school_admins row) in a foreign tenant,
-- so a non-member can read NEITHER its chrome (resolver fails closed) NOR its
-- content (no TGA) — isolation holds. See the self-review for the full argument.
--
-- ADDITIVE + IDEMPOTENT-FRIENDLY (safe on a live DB, safe to re-run):
--   * table    → CREATE TABLE IF NOT EXISTS.
--   * column   → ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
--   * function → CREATE OR REPLACE FUNCTION.
--   * trigger  → DROP TRIGGER IF EXISTS ... then CREATE TRIGGER.
--   * policy   → DROP POLICY IF EXISTS ... then CREATE POLICY (the house idiom
--               for revising a shipped policy — security_hardening.sql:42/85).
--   * enum     → ALTER TYPE ... ADD VALUE IF NOT EXISTS.
--   * grants   → REVOKE-then-GRANT.
-- The new audit_action values are only REFERENCED inside RPC BODIES (resolved at
-- CALL time, in later committed transactions), never in this migration's
-- transaction — the same ENUM-IN-TRANSACTION precedent as M9 / invite_convergence
-- / workspace_notebook_admin (PG 17).
--
-- ── SHIPPED OBJECTS TOUCHED (each flagged HIGH-CONSEQUENCE in the self-review) ─
--   * auth_teacher_school_id()  — REDEFINED (SECTION 6). Same signature; all ~20
--     policies inherit it. Fail-closed; NULL-pointer path == today.
--   * teachers_update_self       — HARDENED (SECTION 7). Adds a WITH CHECK clause
--     pinning active_school_id to NULL-or-membership.
--   * redeem_invite(text)        — REVISED MOVE→ADD (SECTION 11). Drops the
--     re-home + solo-grant deletion; adds a workspace_members join + active
--     pointer. Every other status/grant preserved verbatim.
--   * teams (INSERT)             — a NEW trigger (SECTION 3) keeps workspace_members
--     in lockstep with team creation for future paths (incl. the UNMODIFIED
--     provision_individual_workspace), so new solo owners are members of their own
--     home workspace without reproducing that tenant-minting function.
--
-- Cross-references:
--   M1  = 20260518102823_initial_schema.sql   (schools, grade_levels, teachers,
--         teacher_grade_assignments, school_admins, school_years, subjects,
--         subject_team_memberships, audit_action/audit_entity enums,
--         auth_teacher_school_id() ~:1114, is_school_admin() ~:1101,
--         can_read_grade() ~:1139, log_audit_event(), teachers_update_self ~:1229).
--   M6  = 20260604140000_security_hardening.sql (teachers column-privilege lock;
--         the drop-policy-then-create idiom for revising a shipped policy).
--   M9  = 20260606120000_teams_invitations.sql  (teams [school_id UNIQUE,
--         owner_teacher_id, seat_cap], team_memberships, invitations).
--   M11 = 20260606130000_individual_provisioning.sql (provision_individual_
--         workspace — the full per-tenant graph create_workspace mints one tier up).
--   WA  = 20260606150000_invite_convergence.sql (redeem_invite — the MOVE body
--         this migration converts to ADD).
--   WB  = 20260606160000_workspace_notebook_admin.sql (create_notebook — mirrored
--         one tier up for create_workspace; founding-owner=school_admin seeding).
--   CS  = 20260717120000_course_sharing_rpcs.sql (the mirrored RPC posture:
--         SECURITY DEFINER + search_path pin + auth.uid() re-check + audit +
--         REVOKE/GRANT + coalesce(...,false) on nullable authz).
-- ###########################################################################


-- ###########################################################################
-- ## SECTION 0 — AUDIT ENUM EXTENSION (workspace lifecycle actions)
-- ###########################################################################
-- Reuse the existing 'settings' audit_entity (M1:156) for entity_type; only the
-- three action verbs are new. 'workspace_left' is added for the FUTURE
-- leave-workspace flow (no RPC in this migration uses it yet — it exists so that
-- flow, when it lands, is auditable and MUST reset active_school_id when the
-- pointer targets the left workspace; see the SECTION 7 note). IF NOT EXISTS
-- makes each idempotent. These literals are resolved only at RPC CALL time.
alter type audit_action add value if not exists 'workspace_created';
alter type audit_action add value if not exists 'active_workspace_changed';
alter type audit_action add value if not exists 'workspace_left';


-- ###########################################################################
-- ## SECTION 1 — workspace_members table (the membership ledger + its RLS)
-- ###########################################################################
-- One row per (workspace, teacher) the teacher belongs to. is_owner marks the
-- founding/creating teacher of the workspace. A teacher may hold MANY rows here
-- (their home + every workspace they created or joined).
create table if not exists workspace_members (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id)  on delete cascade,
  teacher_id uuid not null references teachers(id) on delete cascade,
  is_owner   boolean not null default false,
  created_at timestamptz not null default now(),
  -- A teacher appears at most once per workspace. NAMED explicitly so the
  -- ON CONFLICT targets in every RPC/backfill below are unambiguous and stable.
  constraint workspace_members_school_id_teacher_id_key unique (school_id, teacher_id)
);

-- FK / hot-path indexes (Postgres does NOT auto-index FK columns). The
-- (teacher_id) index serves "which workspaces am I in" (list_my_workspaces, the
-- resolver's membership probe). The (school_id) index overlaps the leading
-- column of the composite unique above but is kept per the wave spec and serves
-- "who is in this workspace" (member_count) directly.
create index if not exists idx_workspace_members_teacher on workspace_members (teacher_id);
create index if not exists idx_workspace_members_school  on workspace_members (school_id);

-- ── RLS: self-only read, NO client write path ──────────────────────────────
-- RLS is the real gate (Supabase default ACLs otherwise grant authenticated/anon
-- broad access to every new public table). Posture:
--   * anon: stripped of ALL privileges (defense in depth beyond RLS).
--   * authenticated: SELECT only — a teacher may see their OWN memberships (to
--     know which workspaces they are in); the self-only predicate stops any
--     cross-tenant enumeration of other teachers' memberships.
--   * NO insert/update/delete policy — with RLS enabled and no write policy,
--     every non-service-role write is DENIED (fail-closed). ALL membership
--     writes funnel through the SECURITY DEFINER RPCs / the SECTION 3 trigger.
--     An INSERT policy here would let a teacher join any tenant at will = breach.
alter table workspace_members enable row level security;

revoke all on workspace_members from public, anon, authenticated;
grant  select on workspace_members to authenticated;

-- DROP-then-CREATE so the migration is safe to re-run (create policy alone
-- errors on a second run).
drop policy if exists workspace_members_read on workspace_members;
create policy workspace_members_read on workspace_members
  for select using (teacher_id = auth.uid());


-- ###########################################################################
-- ## SECTION 2 — BACKFILL workspace_members 1:1 from current reality
-- ###########################################################################
-- Every existing teacher becomes a member of their CURRENT home workspace
-- (teachers.school_id), is_owner=true iff they own that workspace's team
-- (teams.owner_teacher_id). This makes the resolver's fallback path and the new
-- RPCs consistent for all pre-existing accounts, with ZERO behavior change (the
-- resolver still returns the home school while active_school_id is NULL for
-- everyone). ON CONFLICT DO NOTHING makes the backfill re-runnable.
insert into workspace_members (school_id, teacher_id, is_owner)
select t.school_id,
       t.id,
       exists (
         select 1 from teams tm
         where tm.school_id = t.school_id
           and tm.owner_teacher_id = t.id
       )
from teachers t
on conflict on constraint workspace_members_school_id_teacher_id_key do nothing;


-- ###########################################################################
-- ## SECTION 3 — OWNER-MEMBERSHIP SYNC TRIGGER (future team-creation paths)
-- ###########################################################################
-- The backfill above covers teachers that exist NOW. Going forward, a team's
-- owner is — by definition — a member (is_owner=true) of that team's workspace.
-- Rather than reproduce the tenant-minting provision_individual_workspace (M11,
-- which inserts a teams row but predates this table and is deliberately NOT
-- touched here), an AFTER INSERT trigger on `teams` maintains that invariant for
-- EVERY team-creation path — provision (first-signup solo workspace),
-- create_workspace (SECTION 9), and any future path — automatically. Without
-- this, a teacher provisioned AFTER this migration would have no home membership
-- and would vanish from list_my_workspaces. SECURITY DEFINER so it writes past
-- RLS; on-conflict keeps it idempotent and harmless where create_workspace also
-- inserts the owner row explicitly.
create or replace function sync_owner_workspace_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into workspace_members (school_id, teacher_id, is_owner)
  values (new.school_id, new.owner_teacher_id, true)
  on conflict on constraint workspace_members_school_id_teacher_id_key
    do update set is_owner = true;
  return new;
end;
$$;

drop trigger if exists trg_teams_owner_workspace_member on teams;
create trigger trg_teams_owner_workspace_member
  after insert on teams
  for each row execute function sync_owner_workspace_membership();


-- ###########################################################################
-- ## SECTION 4 — teachers.active_school_id (the workspace pointer)
-- ###########################################################################
-- Nullable pointer to the teacher's currently-focused workspace. NULL ⇒ the
-- resolver falls back to teachers.school_id (today's behavior). ON DELETE SET
-- NULL: if the pointed-at workspace is torn down, the pointer clears and the
-- resolver falls back to home — never dangles. Every teacher is NULL here on
-- deploy, so the resolver is unchanged until a workspace is explicitly switched.
alter table teachers
  add column if not exists active_school_id uuid
    references schools(id) on delete set null;

comment on column teachers.active_school_id is
  'The teacher''s currently-focused workspace (schools row). NULL ⇒ resolver '
  'uses home school_id. Only ever set by set_active_workspace / create_workspace '
  '/ redeem_invite to a MEMBERSHIP-validated value; the resolver fails closed on '
  'any non-member value. See 20260724120000_multi_workspace.sql.';


-- ###########################################################################
-- ## SECTION 5 — is_workspace_member(p_school_id) helper
-- ###########################################################################
-- True iff the current auth user is a member of the given workspace. Mirrors
-- is_school_admin() (M1:1101) EXACTLY in posture: SQL, STABLE, SECURITY DEFINER,
-- search_path pinned, keyed strictly off auth.uid() (so an anon caller, whose
-- auth.uid() is NULL, always gets false). Left at the default PUBLIC execute
-- like the other is_* helpers so RLS policies (SECTION 7) can call it.
create or replace function is_workspace_member(p_school_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from workspace_members
    where teacher_id = auth.uid()
      and school_id = p_school_id
  );
$$;


-- ###########################################################################
-- ## SECTION 6 — REDEFINE auth_teacher_school_id() (membership-validated pointer)
-- ###########################################################################
-- HIGH-CONSEQUENCE: this is the funnel ~20 RLS policies read. CREATE OR REPLACE
-- keeps the EXACT signature/volatility (uuid, SQL, STABLE, SECURITY DEFINER), so
-- every policy inherits the new resolution with no policy edit.
--
-- Resolution (fail-closed):
--   * active_school_id set AND (auth.uid(), active_school_id) ∈ workspace_members
--       → return active_school_id (the validated focus workspace).
--   * else (NULL pointer, OR a pointer that is NOT a membership — poked / foreign
--     / a workspace the teacher was removed from) → return home school_id.
-- The inner select yields a row ONLY when the pointer is a genuine membership;
-- otherwise it is NULL and coalesce falls through to home. A non-member can
-- therefore NEVER widen their scope to a foreign tenant by writing the pointer.
create or replace function auth_teacher_school_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (
      select t.active_school_id
      from teachers t
      where t.id = auth.uid()
        and t.active_school_id is not null
        and exists (
          select 1
          from workspace_members wm
          where wm.teacher_id = auth.uid()
            and wm.school_id = t.active_school_id
        )
    ),
    (select t2.school_id from teachers t2 where t2.id = auth.uid())
  );
$$;


-- ###########################################################################
-- ## SECTION 7 — HARDEN teachers_update_self (pointer must be NULL or a member)
-- ###########################################################################
-- HIGH-CONSEQUENCE: revising a SHIPPED policy (M1:1229). The original WITH CHECK
-- was `id = auth.uid()` only — it row-gates a teacher to their own row but does
-- not constrain WHICH values a column may take. Add a clause so active_school_id
-- may only ever be set to NULL or a workspace the caller is a member of. The
-- expression is total: `active_school_id is null` short-circuits, and
-- is_workspace_member(...) returns a non-null boolean (exists()), so there is no
-- three-valued-logic gap.
--
-- Today this is DEFENSE IN DEPTH: the M6 column-privilege lock already denies
-- `authenticated` any UPDATE on active_school_id (only the SECURITY DEFINER RPCs,
-- which bypass it, write the pointer). It becomes load-bearing if a future
-- migration ever grants update(active_school_id) to authenticated.
--
-- INTERACTION NOTE (flagged for the reviewer + any future leave-workspace flow):
-- this check fires on WRITE, so it cannot retroactively fix a pointer that goes
-- stale because a membership was DELETED after the pointer was set. Any future
-- path that removes a workspace_members row (a leave/remove flow — the SECTION 0
-- 'workspace_left' verb anticipates it) MUST also reset active_school_id when it
-- targets the removed workspace, else a profile UPDATE could be rejected by this
-- check. The runtime is never broken meanwhile (the resolver fails closed to
-- home); only a direct profile UPDATE via this policy would be affected — and
-- NONE of the writes in THIS migration ever delete a membership.
--
-- DROP-then-CREATE is the house idiom for revising a shipped policy (M6:42/85)
-- and is idempotent + atomic within this migration transaction.
drop policy if exists teachers_update_self on teachers;
create policy teachers_update_self on teachers for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and (active_school_id is null or is_workspace_member(active_school_id))
  );


-- ###########################################################################
-- ## SECTION 8 — set_active_workspace(p_school_id) RPC
-- ###########################################################################
-- Switch the caller's active workspace. Validates membership server-side (the UI
-- is cosmetic), then repoints active_school_id. No-op-safe (re-selecting the
-- current workspace is fine). Mirrors the CS RPC posture.
create or replace function set_active_workspace(
  p_school_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'set_active_workspace: requires an authenticated caller';
  end if;
  if p_school_id is null then
    raise exception 'set_active_workspace: target workspace is required';
  end if;

  -- ── MEMBERSHIP RE-CHECK (fail closed) ──────────────────────────────────
  -- is_workspace_member keys off auth.uid(), so this validates the CALLER's own
  -- membership in p_school_id. A non-member can never point their active
  -- workspace at a foreign tenant.
  if not is_workspace_member(p_school_id) then
    raise exception 'set_active_workspace: caller is not a member of workspace %', p_school_id;
  end if;

  update teachers
     set active_school_id = p_school_id, updated_at = now()
   where id = v_uid;

  -- AUDIT. After the update, auth_teacher_school_id() resolves to p_school_id (a
  -- validated membership), so log_audit_event's school gate (p_school_id must
  -- equal the caller's own tenant) passes.
  perform log_audit_event(
    'active_workspace_changed',
    'settings',
    p_school_id,
    null,
    p_school_id,
    jsonb_build_object('school_id', p_school_id)
  );
end;
$$;


-- ###########################################################################
-- ## SECTION 9 — create_workspace(p_name) RPC (mint a full tenant, one tier up)
-- ###########################################################################
-- Mint a WHOLE new tenant graph for the ALREADY-EXISTING caller and switch them
-- to it. Mirrors create_notebook (WB) one tier up (a workspace = a schools row,
-- a notebook = a grade_levels row) and provision_individual_workspace (M11)'s
-- "never attach to a pre-existing school" invariant — every row references the
-- school/grade JUST created in this call, so there is no path to another
-- teacher's data.
--
-- Graph minted (all in ONE transaction — any failure rolls back the lot, no
-- half-built tenant): schools · one active grade_levels · the 8 LOCKED subjects
-- (exact names/slugs/order/scope/pacing as M11 + the seed) · an active
-- school_years · the caller's TGA 'lead' · the caller's self-STM
-- (can_edit_master=true) · a teams row (owner = caller) · the owner's
-- team_membership · a workspace_members row (is_owner=true) · a school_admins row
-- (the founding owner is the workspace admin — ultraplan §0 #2, matching what
-- every provision+backfill workspace looks like, so a create_workspace tenant is
-- STRUCTURALLY IDENTICAL and fully manageable by its creator). active_school_id
-- is repointed to the new school; teachers.school_id (HOME) is NOT touched.
--
-- ANTI-ABUSE CAP: reject when the caller already OWNS a safety number of
-- workspaces. This is a DoS / fabrication guard on tenant minting, NOT a business
-- tier — packaging (free-tier limits, seat counts) is undecided per CLAUDE.md §1
-- and must not be encoded here. The constant is deliberately GENEROUS.
create or replace function create_workspace(
  p_name text
)
returns table (school_id uuid, grade_level_id uuid)
language plpgsql
security definer
set search_path = public
as $$
-- OUT names (school_id, grade_level_id) collide with column names used in the
-- INSERT column lists below. Those lists are never variable-substituted, but pin
-- resolution to COLUMN so a future unqualified edit cannot silently bind an OUT
-- param (a call-time-only failure this repo's no-DB tests would miss).
#variable_conflict use_column
declare
  v_uid      uuid := auth.uid();
  v_school   uuid;
  v_grade    uuid;
  v_year     uuid;
  v_team     uuid;
  v_owned    integer;
  v_name     text := left(coalesce(nullif(btrim(p_name), ''), 'My Workspace'), 120);
  -- Abuse safeguard, NOT a plan limit (see header). Generous by intent.
  c_max_owned constant integer := 25;
begin
  if v_uid is null then
    raise exception 'create_workspace: requires an authenticated caller';
  end if;

  -- The caller must already have a teacher profile (this RPC extends an existing
  -- account with a new tenant; it does NOT mint a teachers row — that is M11's
  -- job). A clean, diagnosable error instead of an opaque downstream FK failure.
  if not exists (select 1 from teachers t where t.id = v_uid) then
    raise exception 'create_workspace: caller has no teacher profile';
  end if;

  -- ── ANTI-ABUSE CAP ─────────────────────────────────────────────────────
  select count(*) into v_owned
  from workspace_members wm
  where wm.teacher_id = v_uid and wm.is_owner = true;

  if v_owned >= c_max_owned then
    raise exception
      'create_workspace: workspace-creation safety cap reached (owns %, max %). '
      'This is an abuse safeguard, not a plan limit.', v_owned, c_max_owned
      using errcode = 'check_violation';
  end if;

  -- ── 1) new hidden per-tenant school ────────────────────────────────────
  insert into schools (name)
  values (v_name)
  returning id into v_school;

  -- ── 2) one active grade ────────────────────────────────────────────────
  insert into grade_levels (school_id, name, display_order, is_active)
  values (v_school, 'My Class', 0, true)
  returning id into v_grade;

  -- ── 3) the 8 LOCKED subjects (exact names/slugs/order/scope/pacing, M11) ─
  insert into subjects (grade_level_id, name, color, display_order, scope, default_pacing)
  values
    (v_grade, 'Math',      'math',      0, 'team', 'synchronized'),
    (v_grade, 'Reading',   'reading',   1, 'team', 'synchronized'),
    (v_grade, 'Writing',   'writing',   2, 'team', 'synchronized'),
    (v_grade, 'Grammar',   'grammar',   3, 'team', 'synchronized'),
    (v_grade, 'Spelling',  'spelling',  4, 'team', 'synchronized'),
    (v_grade, 'UFLI',      'ufli',      5, 'team', 'synchronized'),
    (v_grade, 'Explorers', 'explorers', 6, 'team', 'synchronized'),
    (v_grade, 'SEL',       'sel',       7, 'team', 'synchronized');

  -- ── 4) an active school_year (mirrors M11's baseline) ──────────────────
  insert into school_years (
    school_id, label, start_date, end_date, weeks, is_active, active_cycle_pattern
  )
  values (
    v_school, '2025–2026', date '2025-08-24', date '2026-06-18',
    40, true, 'one_week'
  )
  returning id into v_year;

  -- ── 5) the caller leads their new grade ────────────────────────────────
  insert into teacher_grade_assignments (teacher_id, grade_level_id, role)
  values (v_uid, v_grade, 'lead')
  on conflict on constraint teacher_grade_assignments_teacher_id_grade_level_id_key do nothing;

  -- ── 6) self-STM (can_edit_master=true) for the 8 new subjects (solo=Master) ─
  insert into subject_team_memberships (subject_id, teacher_id, can_edit_master)
  select s.id, v_uid, true
  from subjects s
  where s.grade_level_id = v_grade
  on conflict on constraint subject_team_memberships_subject_id_teacher_id_key do nothing;

  -- ── 7) the team (1:1 with the school), owned by the caller ─────────────
  -- The SECTION 3 trigger fires on THIS insert and creates the owner's
  -- workspace_members row (is_owner=true); the explicit insert in step 9 is the
  -- belt-and-suspenders equivalent and conflicts harmlessly.
  insert into teams (school_id, name, owner_teacher_id)
  values (v_school, v_name, v_uid)
  returning id into v_team;

  -- ── 8) the owner's team seat ───────────────────────────────────────────
  insert into team_memberships (team_id, teacher_id, role)
  values (v_team, v_uid, 'lead');

  -- ── 9) the owner's workspace membership (is_owner=true) ────────────────
  insert into workspace_members (school_id, teacher_id, is_owner)
  values (v_school, v_uid, true)
  on conflict on constraint workspace_members_school_id_teacher_id_key
    do update set is_owner = true;

  -- ── 10) founding owner is the workspace admin (ultraplan §0 #2). Matches
  -- every provision+backfill workspace so this tenant is fully manageable (add
  -- notebooks, grant admin). school_admins has NO unique key (WB header), so
  -- guard with NOT EXISTS for idempotency. granted_by = the caller (self-grant).
  insert into school_admins (school_id, teacher_id, granted_by_teacher_id)
  select v_school, v_uid, v_uid
  where not exists (
    select 1 from school_admins sa
    where sa.school_id = v_school and sa.teacher_id = v_uid
  );

  -- ── 11) switch the caller to the new workspace (HOME school_id untouched) ─
  update teachers
     set active_school_id = v_school, updated_at = now()
   where id = v_uid;

  -- ── AUDIT ──────────────────────────────────────────────────────────────
  -- active_school_id + the membership now exist, so auth_teacher_school_id()
  -- resolves to v_school and log_audit_event's school gate passes.
  perform log_audit_event(
    'workspace_created',
    'settings',
    v_school,
    null,
    v_school,
    jsonb_build_object('name', v_name, 'school_id', v_school, 'grade_level_id', v_grade)
  );

  return query select v_school, v_grade;
  return;
end;
$$;


-- ###########################################################################
-- ## SECTION 10 — list_my_workspaces() RPC
-- ###########################################################################
-- Return one row per workspace the caller belongs to, with the display name,
-- ownership, admin capability, member count, and which is active. SECURITY
-- DEFINER so it can read sibling schools.name + count members WITHOUT widening
-- schools_read (which only exposes the active workspace + admined schools) or the
-- self-only workspace_members read policy. It exposes NO other teacher's identity
-- — only aggregate counts + the caller's own membership set.
create or replace function list_my_workspaces()
returns table (
  school_id    uuid,
  name         text,
  is_owner     boolean,
  is_admin     boolean,
  member_count integer,
  is_active    boolean
)
language plpgsql
security definer
set search_path = public
as $$
-- OUT names double as locals; every reference below is table-qualified, but pin
-- resolution to COLUMN so a later unqualified edit cannot silently shadow a
-- column with an OUT param (a call-time-only failure this repo's tests would miss).
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'list_my_workspaces: requires an authenticated caller';
  end if;

  return query
  select wm.school_id,
         s.name,
         wm.is_owner,
         is_school_admin(wm.school_id) as is_admin,
         (
           select count(*)::integer
           from workspace_members wm2
           where wm2.school_id = wm.school_id
         ) as member_count,
         (wm.school_id = auth_teacher_school_id()) as is_active
  from workspace_members wm
  join schools s on s.id = wm.school_id
  where wm.teacher_id = v_uid
  order by s.name;
end;
$$;


-- ###########################################################################
-- ## SECTION 11 — REVISE redeem_invite (MOVE → ADD; non-destructive join)
-- ###########################################################################
-- HIGH-CONSEQUENCE: revising the SHIPPED invite redemption (WA). CREATE OR
-- REPLACE keeps WA's exact signature + return type. The body is WA's, with the
-- former CONVERGENCE deltas REMOVED and a JOIN added:
--   REMOVED  · the `existing_workspace` deferral (a redeemer with other content
--              is no longer turned away — joining = belong to both).
--   REMOVED  · the v_pristine content-scan (nothing is re-homed, so nothing can
--              be orphaned — the entire data-loss surface is gone).
--   REMOVED  · CONVERGENCE INSERT #2's re-home: the `update teachers set
--              school_id=…` AND the deletion of the redeemer's old-workspace
--              TGA / STM / owner-team membership. NOTHING destructive remains.
--   ADDED    · a workspace_members row for the joined workspace (the ADD), and a
--              switch of active_school_id to it (membership-validated — the row
--              just written guarantees it). teachers.school_id (HOME) is NEVER
--              touched now.
-- Every invite status + grant is otherwise PRESERVED VERBATIM, including WA's
-- DELTA #3 fix (the NAMED on-conflict constraint targets on the team_membership
-- and TGA inserts, which dodge the OUT-column ambiguity bug). The join insert
-- and the active repoint are the only new writes. Idempotent: on-conflict on the
-- membership; re-redeem hits the already-member / already-accepted fast paths.
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
    return query select 'invalid'::text, null::uuid, null::uuid;
    return;
  end if;

  -- ── IDEMPOTENCY: already accepted BY THIS caller → success, no-op ──────
  if v_inv.status = 'accepted' and v_inv.accepted_by = v_uid then
    return query select 'accepted'::text, v_inv.team_id, v_inv.target_grade_level_id;
    return;
  end if;

  -- ── TERMINAL (non-pending) STATES → report, do not mutate ─────────────
  if v_inv.status <> 'pending' then
    return query select
      (case when v_inv.status = 'accepted' then 'already_accepted' else v_inv.status end)::text,
      null::uuid, null::uuid;
    return;
  end if;

  -- ── LAZY EXPIRY — PERSIST then report ─────────────────────────────────
  if v_inv.expires_at <= now() then
    update invitations set status = 'expired'
     where id = v_inv.id and status = 'pending';
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

  -- ── ALREADY A MEMBER → report cleanly (their home membership already exists
  -- via provision/backfill/an earlier redeem; do NOT re-run grants) ─────────
  if exists (
    select 1 from team_memberships m
    where m.team_id = v_inv.team_id and m.teacher_id = v_uid
  ) then
    if v_inv.invitee_email is not null then
      update invitations
         set status = 'accepted', accepted_by = v_uid, accepted_at = now()
       where id = v_inv.id and status = 'pending';
    end if;
    return query select 'already_member'::text, v_inv.team_id, v_inv.target_grade_level_id;
    return;
  end if;

  -- ── ATOMIC SEAT RE-CHECK ──────────────────────────────────────────────
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

  -- ── GRANT: membership (WA DELTA #3 — NAMED constraint dodges OUT ambiguity) ─
  insert into team_memberships (team_id, teacher_id, role)
  values (v_inv.team_id, v_uid, coalesce(v_inv.role, 'teacher'))
  on conflict on constraint team_memberships_team_id_teacher_id_key do nothing;

  -- ── GRANT: grade assignment (TGA) ─────────────────────────────────────
  insert into teacher_grade_assignments (teacher_id, grade_level_id, role)
  values (v_uid, v_inv.target_grade_level_id, coalesce(v_inv.role, 'teacher'))
  on conflict on constraint teacher_grade_assignments_teacher_id_grade_level_id_key do nothing;

  -- ── GRANT: per-role subject memberships (STM) ─────────────────────────
  -- can_edit_master EXPLICIT: true only for lead/grade_admin, never the default.
  v_can_edit := (coalesce(v_inv.role, 'teacher') in ('lead', 'grade_admin'));

  insert into subject_team_memberships (subject_id, teacher_id, can_edit_master)
  select s.id, v_uid, v_can_edit
  from subjects s
  where s.grade_level_id = v_inv.target_grade_level_id
    and s.scope = 'team'
  on conflict (subject_id, teacher_id) do nothing;

  -- ╔═══════════════════════════════════════════════════════════════════════╗
  -- ║ JOIN (MOVE → ADD) — the redeemer now BELONGS TO BOTH workspaces         ║
  -- ╚═══════════════════════════════════════════════════════════════════════╝
  -- Non-destructive: ADD a membership for the team's workspace. The redeemer's
  -- HOME workspace_members row + all their home grants (TGA/STM/team seat) are
  -- LEFT INTACT (the old MOVE deleted them; it no longer does). Idempotent via
  -- the named unique constraint.
  insert into workspace_members (school_id, teacher_id, is_owner)
  values (v_school_id, v_uid, false)
  on conflict on constraint workspace_members_school_id_teacher_id_key do nothing;

  -- Switch the redeemer's ACTIVE workspace to the one they just joined — a
  -- membership-validated pointer (the row above guarantees it). teachers.school_id
  -- (HOME) is deliberately NOT touched; the resolver simply focuses chrome here.
  update teachers
     set active_school_id = v_school_id, updated_at = now()
   where id = v_uid;

  -- ── MARK ACCEPTED ─────────────────────────────────────────────────────
  update invitations
     set status = 'accepted', accepted_by = v_uid, accepted_at = now()
   where id = v_inv.id
     and status = 'pending';

  -- ── AUDIT ─────────────────────────────────────────────────────────────
  -- School null (parity with WA / the R4 rationale — no coupling to
  -- teachers.school_id ordering). Grade gate passes: the TGA insert above makes
  -- can_read_grade(target) true within this transaction. joined_school_id in the
  -- metadata records which workspace was added for traceability.
  perform log_audit_event(
    'invite_accepted',
    'role_assignment',
    v_inv.id,
    v_inv.target_grade_level_id,
    null,
    jsonb_build_object(
      'team_id', v_inv.team_id,
      'role', coalesce(v_inv.role, 'teacher'),
      'can_edit_master', v_can_edit,
      'joined_school_id', v_school_id
    )
  );

  return query select 'accepted'::text, v_inv.team_id, v_inv.target_grade_level_id;
  return;
end;
$$;


-- ###########################################################################
-- ## SECTION 12 — RPC EXECUTE GRANTS (authenticated only; never anon)
-- ###########################################################################
-- Each RPC runs its own server-side capability re-check off auth.uid() and guards
-- a null uid, so each is granted to `authenticated` and revoked from public/anon.
-- REVOKE-then-GRANT is idempotent. The is_* helpers (SECTION 5/6) keep the
-- default PUBLIC execute like M1's is_school_admin so RLS policies can call them
-- (an anon caller gets false/null from them). redeem_invite's grant is
-- re-asserted (signature unchanged from WA).
revoke execute on function set_active_workspace(uuid) from public;
revoke execute on function set_active_workspace(uuid) from anon;
grant  execute on function set_active_workspace(uuid) to authenticated;

revoke execute on function create_workspace(text) from public;
revoke execute on function create_workspace(text) from anon;
grant  execute on function create_workspace(text) to authenticated;

revoke execute on function list_my_workspaces() from public;
revoke execute on function list_my_workspaces() from anon;
grant  execute on function list_my_workspaces() to authenticated;

revoke execute on function redeem_invite(text) from public;
revoke execute on function redeem_invite(text) from anon;
grant  execute on function redeem_invite(text) to authenticated;


-- ###########################################################################
-- End of multi-workspace tenancy.
-- ###########################################################################
