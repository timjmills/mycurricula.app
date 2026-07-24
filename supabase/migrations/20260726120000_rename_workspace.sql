-- ###########################################################################
-- ## rename_workspace RPC (follow-up to 20260724120000_multi_workspace.sql)
-- ###########################################################################
-- CUTOVER-BUNDLE ITEM (docs/7.23.26-unified-v2-plan.md §0). Until this RPC
-- exists, renaming a workspace on the MULTI_WORKSPACE ON path is a silent no-op:
-- the Settings → Workspace card and the v2 onboarding wizard both source the
-- workspace name from the DB (list_my_workspaces), and the only shipped write
-- path was the legacy localStorage OVERRIDE — which the ON-path provider IGNORES
-- (lib/notebook-state.tsx). This adds the sanctioned server write.
--
-- PRIVILEGE MODEL (matches the wave's "workspace admin", per-workspace, never
-- any-school): a caller may rename workspace `p_school_id` iff, for THAT
-- workspace, they are (1) a MEMBER (is_workspace_member — the same fail-closed
-- gate set_active_workspace / list_workspace_members use) AND (2) a WORKSPACE
-- ADMIN of it — is_school_admin(p_school_id) OR the founding owner
-- (workspace_members.is_owner). That is exactly the owner-OR-admin capability
-- the Settings card gates its rename control on (isWorkspaceAdminRole in
-- lib/workspaces/row.ts) and that create_workspace seeds (founding owner is
-- BOTH is_owner AND a school_admins row). A non-member, or a plain member who is
-- not an admin, is rejected — the RPC is the enforcement point; the UI gate is
-- cosmetic.
--
-- FAIL CLOSED on every path: null caller, null target, non-member, non-admin,
-- and blank name each raise (never a silent success). The name is trimmed and
-- length-clamped to match create_workspace's `left(…, 120)` clamp on the SAME
-- schools.name column; an empty name is REJECTED (a workspace always has a name)
-- rather than defaulted the way create_workspace defaults a mint.
--
-- teachers.school_id (HOME) and teachers.active_school_id (the pointer) are
-- NEVER touched — a rename only relabels the schools row. This mirrors the
-- wave's invariant that switch/create/redeem never re-home school_id.
--
-- ADDITIVE + IDEMPOTENT-FRIENDLY (safe on a live DB, safe to re-run):
--   * enum     → ALTER TYPE ... ADD VALUE IF NOT EXISTS (the wave's idiom).
--   * function → CREATE OR REPLACE FUNCTION.
--   * grants   → REVOKE-then-GRANT.
-- The new audit_action value is only REFERENCED inside the RPC BODY (resolved at
-- CALL time, in a later committed transaction), never in this migration's
-- transaction — the same ENUM-IN-TRANSACTION precedent the wave relies on for
-- 'workspace_created' / 'active_workspace_changed' (PG 17).
--
-- INERT UNTIL ENABLED: no CI applies migrations, and the client seam that calls
-- this RPC (lib/workspaces/*) is double-gated on MULTI_WORKSPACE (default OFF)
-- AND isPlannerSupabaseConfigured(). So this file changes nothing until it is
-- hand-applied together with the enable cutover.
--
-- Cross-references:
--   M1  = 20260518102823_initial_schema.sql   (schools, is_school_admin(uuid)
--         ~:1101 — keyed off auth.uid(), audit_entity 'settings' ~:156).
--   MH2 = 20260604150000_security_hardening_2.sql (log_audit_event(audit_action,
--         text, uuid, uuid, uuid, jsonb) — the current signature; its SCHOOL
--         GATE requires a non-null p_school_id to equal auth_teacher_school_id(),
--         which is why the audit call below passes school NULL, see the note).
--   MW  = 20260724120000_multi_workspace.sql   (workspace_members,
--         is_workspace_member(uuid), set_active_workspace, create_workspace,
--         the new workspace_* audit_action values + the enum-in-transaction
--         precedent, and the SECURITY DEFINER + membership-re-check + REVOKE/GRANT
--         posture mirrored here one-for-one).
--   WR  = 20260725120000_workspace_roster.sql  (list_workspace_members — the
--         sibling membership-re-checked SECURITY DEFINER RPC pattern).
-- ###########################################################################


-- ###########################################################################
-- ## SECTION 0 — AUDIT ENUM EXTENSION (workspace rename action)
-- ###########################################################################
-- Reuse the existing 'settings' audit_entity for entity_type; only the verb is
-- new. IF NOT EXISTS makes it idempotent. Resolved only at RPC CALL time (see
-- header) so it is safe to add in this migration's transaction.
alter type audit_action add value if not exists 'workspace_renamed';


-- ###########################################################################
-- ## SECTION 1 — rename_workspace(p_school_id, p_name) RPC
-- ###########################################################################
-- Relabel a workspace the caller administers. Validates membership + admin
-- rights server-side (the UI is cosmetic), trims + clamps the name, and updates
-- schools.name. No-op-safe: renaming to the current name commits nothing and
-- writes no audit row. Returns void.
create or replace function rename_workspace(
  p_school_id uuid,
  p_name      text
)
returns void
language plpgsql
security definer
-- pg_temp is pinned explicitly LAST: without it, PostgreSQL searches the
-- caller's temp schema FIRST for relations, so a session able to create a
-- temp `workspace_members` could shadow the real table inside this SECURITY
-- DEFINER body and forge the membership/owner checks. Listing pg_temp last
-- removes that implicit precedence (SECTION 3 back-fills the same pin onto
-- the already-shipped workspace-family functions).
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := left(btrim(coalesce(p_name, '')), 120);
  v_old  text;
begin
  -- ── FAIL CLOSED: authenticated caller + present target ──────────────────
  if v_uid is null then
    raise exception 'rename_workspace: requires an authenticated caller';
  end if;
  if p_school_id is null then
    raise exception 'rename_workspace: target workspace is required';
  end if;

  -- ── MEMBERSHIP RE-CHECK (fail closed) ──────────────────────────────────
  -- is_workspace_member keys off auth.uid(), so this validates the CALLER's own
  -- membership in p_school_id. A non-member can never rename a foreign tenant.
  if not is_workspace_member(p_school_id) then
    raise exception 'rename_workspace: caller is not a member of workspace %', p_school_id;
  end if;

  -- ── ADMIN RE-CHECK (owner OR school_admin of THIS workspace) ───────────
  -- Exactly the owner-OR-admin capability the Settings rename control gates on
  -- (isWorkspaceAdminRole). is_school_admin(p_school_id) covers the founding
  -- owner too (create_workspace seeds a school_admins row), but the explicit
  -- is_owner clause is defense in depth so an owner whose school_admins row was
  -- ever removed can still rename their own workspace.
  if not (
    is_school_admin(p_school_id)
    or exists (
      select 1 from workspace_members wm
      where wm.teacher_id = v_uid
        and wm.school_id = p_school_id
        and wm.is_owner = true
    )
  ) then
    raise exception 'rename_workspace: caller is not a workspace admin of %', p_school_id;
  end if;

  -- ── NAME VALIDATION (a workspace always has a name) ─────────────────────
  if v_name = '' then
    raise exception 'rename_workspace: a workspace name is required';
  end if;

  -- ── NO-OP GUARD (renaming to the current name commits + audits nothing) ─
  -- Membership above guarantees the schools row exists (workspace_members FKs
  -- to schools). Read the current name to short-circuit an unchanged rename and
  -- to record the prior value for traceability. FOR UPDATE serializes
  -- concurrent renames of the same workspace so the audit row's previous_name
  -- is the value this rename actually replaced, never a stale read.
  select s.name into v_old from schools s where s.id = p_school_id for update;
  if v_old is not distinct from v_name then
    return;
  end if;

  -- ── RELABEL (only the name; HOME school_id + active pointer untouched) ──
  update schools set name = v_name where id = p_school_id;

  -- ── AUDIT ──────────────────────────────────────────────────────────────
  -- School passed NULL (parity with redeem_invite's rationale): log_audit_event's
  -- school gate requires a non-null p_school_id to equal auth_teacher_school_id()
  -- (the caller's ACTIVE workspace), but an admin may legitimately rename a
  -- workspace they administer that is NOT their active one. Passing school NULL
  -- dodges that gate while the renamed workspace id is recorded in entity_id +
  -- metadata for traceability.
  perform log_audit_event(
    'workspace_renamed',
    'settings',
    p_school_id,
    null,
    null,
    jsonb_build_object(
      'school_id', p_school_id,
      'previous_name', v_old,
      'name', v_name
    )
  );
end;
$$;


-- ###########################################################################
-- ## SECTION 2 — RPC EXECUTE GRANT (authenticated only; never anon)
-- ###########################################################################
-- The RPC runs its own server-side capability re-check off auth.uid() and guards
-- a null uid, so it is granted to `authenticated` and revoked from public/anon.
-- REVOKE-then-GRANT is idempotent (mirrors the wave's SECTION 12 posture).
revoke execute on function rename_workspace(uuid, text) from public;
revoke execute on function rename_workspace(uuid, text) from anon;
grant  execute on function rename_workspace(uuid, text) to authenticated;


-- ###########################################################################
-- ## SECTION 3 — SEARCH_PATH HARDENING BACK-FILL (workspace-family RPCs)
-- ###########################################################################
-- The shipped workspace/course-sharing/audit SECURITY DEFINER functions were
-- created with `set search_path = public`, which leaves the caller's pg_temp
-- schema implicitly FIRST for relation lookup — a session that could create a
-- temp table named after a checked relation (e.g. workspace_members) could
-- shadow it inside the definer body. Not reachable through the Data API today
-- (PostgREST exposes no DDL), but the pin is the standard hardening and this
-- cutover migration is the natural vehicle. Idempotent + signature-agnostic:
-- resolves each function through pg_proc (skips any that don't exist) and
-- re-pins `public, pg_temp`. Re-running is a no-op.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname in (
        -- 20260724120000_multi_workspace
        'sync_owner_workspace_membership',
        'is_workspace_member',
        'auth_teacher_school_id',
        'set_active_workspace',
        'create_workspace',
        'list_my_workspaces',
        'redeem_invite',
        -- 20260725120000_workspace_roster
        'list_workspace_members',
        -- 20260717120000_course_sharing_rpcs
        'share_course',
        'unshare_course',
        'list_course_sharing',
        -- helpers the checks above route through
        'is_school_admin',
        'log_audit_event',
        -- this migration (belt — CREATE above already pins it)
        'rename_workspace'
      )
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
  end loop;
end $$;


-- ###########################################################################
-- End of rename_workspace.
-- ###########################################################################
