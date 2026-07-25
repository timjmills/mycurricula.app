-- ###########################################################################
-- ## Pin `pg_temp` LAST on every SECURITY DEFINER function in `public`
-- ###########################################################################
-- ⚠ AUTHORED, NOT APPLIED. Agents never apply anything to the production
-- database (standing hard rule, 2026-07-24). The orchestrator + user own the
-- apply. See the runbook at the bottom.
--
-- ---------------------------------------------------------------------------
-- THE DEFECT
-- ---------------------------------------------------------------------------
-- A SECURITY DEFINER function declared with
--
--     set search_path = public
--
-- does NOT have a fully-pinned resolution order. Postgres searches the caller's
-- `pg_temp` schema IMPLICITLY, and — because the explicit list does not name it
-- — implicitly FIRST. A session that can create a temporary table named after a
-- relation the definer body reads (`teachers`, `grade_members`, `subjects`,
-- `workspace_members`, …) shadows the real table inside a body running with the
-- function OWNER's privileges. Naming `pg_temp` explicitly at the END forces it
-- to be searched last, which is the fix:
--
--     set search_path = public, pg_temp
--
-- This repo has already recorded this as a Critical once (commit cb83e46), and
-- `20260726120000_rename_workspace.sql` back-filled it — but only for the
-- workspace / course-sharing family it touched (15 names). Everything older was
-- left behind, including the tenancy helpers that gate nearly every RLS policy
-- in the schema: `can_read_grade`, `can_edit_subject_master`,
-- `auth_teacher_grade_ids`, `is_grade_lead`, `is_grade_admin`.
--
-- ---------------------------------------------------------------------------
-- EXPLOITABILITY — LATENT, NOT LIVE
-- ---------------------------------------------------------------------------
-- Not reachable by a Data-API caller today: PostgREST exposes no DDL, so an
-- `authenticated` client cannot create the temp table the attack needs. The
-- exposure requires a direct SQL connection (psql / a connection-string leak /
-- a future RPC that runs caller-supplied SQL). This is therefore hardening of a
-- latent hole, not incident response — which is exactly why it should land
-- BEFORE something opens that door, not after.
--
-- PRE-EXISTING: none of these functions were introduced by the B1–B3 planner
-- work. The two functions B3 added (`reorder_unit_assessments`,
-- `rename_workspace`'s sibling) already pin `public, pg_temp` correctly.
--
-- ---------------------------------------------------------------------------
-- WHY A CATALOG-DRIVEN LOOP RATHER THAN 38 HAND-WRITTEN STATEMENTS
-- ---------------------------------------------------------------------------
-- `alter function` needs an EXACT signature, and several of these take composite
-- enum arguments across multiple lines (`log_audit_event(audit_action, text,
-- uuid, uuid, uuid, jsonb)`, `lesson_section_parent_subject(lesson_owner_kind,
-- uuid)`, …). Transcribing 38 of those by hand is how one silently ends up
-- targeting a signature that does not exist — the statement errors, or worse,
-- matches an overload nobody meant. Resolving each through `pg_proc` and
-- formatting `oid::regprocedure` makes the signature exact by construction, and
-- makes the migration self-maintaining: it re-pins whatever is actually there.
--
-- NARROWLY SCOPED SO IT CANNOT CLOBBER A DELIBERATE SETTING. It touches ONLY
-- functions whose current setting is EXACTLY `search_path=public`. In
-- particular it leaves alone:
--   • `is_claude_admin()`, which uses `set search_path to ''` — the STRICTEST
--     possible setting (nothing is searched; every name must be qualified).
--     A blanket "add pg_temp everywhere" sweep would WEAKEN it.
--   • any function with a bespoke multi-schema path (there are none today; the
--     guard is there so a future one survives a re-run).
--   • SECURITY INVOKER functions, which run with the caller's own privileges and
--     so have nothing to escalate.
--
-- IDEMPOTENT: after it runs, no function matches `search_path=public` any more,
-- so a re-run is a no-op. Safe to re-apply, safe under `db push`.
-- ---------------------------------------------------------------------------

do $$
declare
  f       record;
  n_fixed int := 0;
begin
  for f in
    select p.oid::regprocedure as sig,
           p.proname           as name
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prosecdef                                  -- SECURITY DEFINER only
       and p.proconfig is not null                      -- has SOME setting…
       and 'search_path=public' = any (p.proconfig)     -- …and it is exactly this
     order by p.proname
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
    n_fixed := n_fixed + 1;
    raise notice 're-pinned search_path on %', f.sig;
  end loop;

  raise notice 'search_path back-fill complete: % function(s) re-pinned', n_fixed;
end $$;

-- ---------------------------------------------------------------------------
-- EXPECTED SCOPE at authoring time (2026-07-25), derived from the migration
-- history. Recorded so the apply can be checked against an expectation rather
-- than just "it ran". 38 functions, oldest first:
--
--   20260518102823_initial_schema
--     auth_teacher_grade_ids, is_grade_lead, is_grade_admin, is_school_admin,
--     can_edit_subject_master
--   20260527120000_resources_embed_fields      auth_can_access_event
--   20260530090000_teach_view                  auth_can_read_lesson
--   20260604120000_planner_scale_hardening     can_read_grade
--   20260604140000_security_hardening          lesson_section_parent_subject
--   20260604150000_security_hardening_2        log_audit_event
--   20260606130000_individual_provisioning     provision_individual_workspace
--   20260606140000_invite_lifecycle
--     create_invite, revoke_invite, expire_invitations, is_team_member
--   20260606160000_workspace_notebook_admin
--     create_notebook, rename_notebook, archive_notebook, remove_member,
--     set_member_role, grant_workspace_admin, revoke_workspace_admin
--   20260607160000_teach_golive_hardening      teach_enforce_board_lesson_grade
--   20260612200000_daily_redesign_persistence
--     lesson_section_parent_grade, can_edit_lesson_section_parent,
--     validate_lesson_section_parent
--   20260620000000_effective_frameworks…       teacher_effective_framework_ids
--   20260717120000_course_sharing_rpcs         share_course, unshare_course,
--                                              list_course_sharing
--   20260724120000_multi_workspace
--     auth_teacher_school_id, is_workspace_member, set_active_workspace,
--     create_workspace, list_my_workspaces, redeem_invite,
--     sync_owner_workspace_membership
--   20260725120000_workspace_roster            list_workspace_members
--
-- The last twelve (course-sharing + multi-workspace + roster, plus
-- is_school_admin and log_audit_event) are ALSO in 20260726120000's back-fill
-- list. They appear here because that block re-pins by NAME through pg_proc and
-- this file re-pins by SETTING — if 20260726120000 has already run on the target
-- database they simply will not match the `search_path=public` filter, and the
-- notice count will be correspondingly lower. Either count is correct; the
-- verification query below is the thing that matters.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- APPLY-DAY RUNBOOK (ORCHESTRATOR + USER ONLY; agents never apply)
-- ---------------------------------------------------------------------------
--   # from the project dir (the supabase link lives here):
--   supabase db push
--
--   # VERIFY — this must return ZERO rows afterwards. Any row is a SECURITY
--   # DEFINER function in public whose search_path does NOT end in pg_temp.
--   #
--   # It checks the LAST element, not mere presence. `search_path = pg_temp,
--   # public` CONTAINS pg_temp and is exactly as vulnerable as omitting it — the
--   # whole defect is that pg_temp resolves FIRST. A `like '%pg_temp%'` test
--   # would pass that configuration and report all-clear on a live hole.
--   # NOTE the chr(34)/chr(39) instead of literal quote characters. The empty
--   # search path is stored as the two-character value "" (or ''), and writing
--   # that literally inside a shell-quoted --linked "..." argument means nesting
--   # quotes three deep; one wrong escape and the clause silently stops matching,
--   # so is_claude_admin() gets reported as unsafe and the runbook's "expect zero
--   # rows" becomes untrustworthy. chr() sidesteps every layer of quoting.
--   supabase db query --linked "
--     with defs as (
--       select p.oid::regprocedure as sig,
--              (select s from unnest(p.proconfig) s
--                where s like 'search_path=%') as setting
--         from pg_proc p
--         join pg_namespace ns on ns.oid = p.pronamespace
--        where ns.nspname = 'public' and p.prosecdef
--     ), parsed as (
--       select sig, setting,
--              btrim(
--                replace(
--                  replace(
--                    coalesce(substr(setting, length('search_path=') + 1), ''),
--                    chr(34), ''),          -- strip double quotes
--                  chr(39), '')             -- strip single quotes
--              ) as path
--         from defs
--     )
--     select sig, setting from parsed
--      where setting is null                       -- no pin at all
--         or (
--              path <> ''                           -- empty path is STRICTER: ok
--              and btrim(
--                    (string_to_array(path, ','))[
--                      array_length(string_to_array(path, ','), 1)
--                    ]
--                  ) <> 'pg_temp'                   -- must be the LAST element
--            )
--      order by sig;"
--
--   # is_claude_admin() pins the EMPTY search path — stricter than pg_temp-last —
--   # and the `path <> ''` clause excludes it once the quote characters are
--   # stripped. A correct run returns ZERO rows, with no expected exceptions.
--
-- NO APPLICATION COUPLING. This file changes no signature, no return type, no
-- body and no policy — only the resolution order inside each definer body. It
-- can be applied before or after any application deploy, and nothing in
-- `lib/planner/**` or the RPC callers needs to change with it.
-- ###########################################################################
