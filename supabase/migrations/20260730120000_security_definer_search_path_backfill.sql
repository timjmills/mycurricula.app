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
-- formatting an explicitly
-- schema-qualified `%I.%I(%s)` makes the signature exact by construction, and
-- makes the migration self-maintaining: it re-pins whatever is actually there.
--
-- NARROWLY SCOPED SO IT CANNOT CLOBBER A DELIBERATE SETTING. Part 1 touches
-- ONLY functions whose current setting is EXACTLY `search_path=public`. In
-- particular it leaves alone:
--   • `is_claude_admin()`, which uses `set search_path to ''`. A blanket
--     "add pg_temp everywhere" sweep would rewrite that to `public, pg_temp`
--     and hand it visibility of every table in `public` — hardening on paper, a
--     WIDENING in fact. It is instead handled deliberately in PART 2 below,
--     which moves it to `pg_catalog, pg_temp`: pg_temp named last, and no new
--     schema visibility. Part 1 and Part 2 are not in tension — Part 1 must not
--     touch it, and Part 2 does the one thing that is actually safe for it.
--   • any function with a bespoke multi-schema path (there are none today; the
--     guard is there so a future one survives a re-run).
--   • SECURITY INVOKER functions, which run with the caller's own privileges and
--     so have nothing to escalate.
--
-- IDEMPOTENT: after it runs, no function matches `search_path=public` any more,
-- so a re-run is a no-op. Safe to re-apply, safe under `db push`.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- PART 1 — the bulk back-fill: `search_path=public` → `public, pg_temp`.
-- ---------------------------------------------------------------------------
do $$
declare
  f       record;
  n_fixed int := 0;
begin
  for f in
    select ns.nspname                                  as schema_name,
           p.proname                                   as name,
           pg_get_function_identity_arguments(p.oid)   as args
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prosecdef                                  -- SECURITY DEFINER only
       and p.proconfig is not null                      -- has SOME setting…
       and 'search_path=public' = any (p.proconfig)     -- …and it is exactly this
     order by p.proname
  loop
    -- SCHEMA-QUALIFIED, and that matters here more than anywhere. Formatting a
    -- bare `oid::regprocedure` renders the schema ONLY when it is not already
    -- visible on the session search_path — so the emitted statement would be
    -- re-RESOLVED by name under whatever path the applying session happens to
    -- have, rather than targeting the oid we selected. In a migration whose
    -- entire subject is search_path resolution, that is the one mistake not to
    -- make: under a session whose path omits or shadows `public` it errors, or
    -- worse, pins a different function of the same name.
    execute format(
      'alter function %I.%I(%s) set search_path = public, pg_temp',
      f.schema_name, f.name, f.args
    );
    n_fixed := n_fixed + 1;
    raise notice 're-pinned search_path on %.%(%)', f.schema_name, f.name, f.args;
  end loop;

  raise notice 'search_path back-fill complete: % function(s) re-pinned', n_fixed;
end $$;


-- ---------------------------------------------------------------------------
-- PART 2 — is_claude_admin(), the one that needed a judgement rather than a
-- rule. It is NOT covered by Part 1 (its setting is `''`, not `public`).
-- ---------------------------------------------------------------------------
-- THE SEMANTICS, because this is easy to get backwards. Per the Postgres
-- "Schema Search Path" docs: the temporary schema "is always searched if it
-- exists… If it is not listed in the path then it is searched FIRST (even
-- before pg_catalog)." That rule is about the schema being ABSENT from the
-- list, not about the list being long — so `set search_path to ''` does NOT
-- escape it. An empty path still leaves pg_temp implicitly first for relation
-- lookups, and the function therefore fails the same rule as the other 25.
--
-- NOT EXPLOITABLE TODAY, for a second reason worth recording: the body is
-- `select coalesce(auth.jwt() ->> 'email', '') = '…'` — it touches no
-- relations at all, and the same docs paragraph notes the temporary schema "is
-- never searched for function or operator names." So there is nothing for a
-- temp table to shadow. This is rule-compliance, not incident response.
--
-- WHY `pg_catalog, pg_temp` AND NOT `public, pg_temp`. `''` is the STRICTER
-- setting: nothing resolves unqualified. Moving it to `public, pg_temp` would
-- grant this function visibility of every table in `public` that it does not
-- have today and does not need — hardening on paper, a widening in fact.
-- `pg_catalog, pg_temp` grants NOTHING new: pg_catalog is always searched
-- anyway and naming it first matches its implicit position, while naming
-- pg_temp explicitly LAST is precisely the fix. Zero new visibility, rule
-- satisfied.
--
-- WHY CHANGE IT AT ALL, given it is not exploitable. Because the alternative is
-- a verification query with a known exception, and "expect zero rows except
-- this one" is exactly where the next real regression hides. After this
-- statement the check below returns zero rows with no exceptions to remember.
--
-- The function's body is fully schema-qualified (`auth.jwt()`), so it continues
-- to resolve identically under the new path. No behaviour change.
alter function public.is_claude_admin() set search_path = pg_catalog, pg_temp;

-- ---------------------------------------------------------------------------
-- EXPECTED SCOPE at authoring time (2026-07-25). Recorded so the apply can be
-- checked against an expectation rather than just "it ran".
--
-- TWO COUNTS, AND THEY ARE BOTH RIGHT. 38 functions still READ
-- `set search_path = public` in their own `create` statement. Only **26** are
-- actually unpinned at RUNTIME, because `20260726120000_rename_workspace.sql`
-- §3 runs a `DO` block that resolves 14 names through `pg_proc` and
-- `alter function … set search_path = public, pg_temp` on each, AFTER their
-- creates — and no later migration re-creates any of them, which would silently
-- re-strip the pin. So `is_school_admin` and `log_audit_event` are live-correct
-- today DESPITE their create clauses reading `= public`. Reading the source text
-- alone gives 38 and over-counts by 12.
--
-- This file keys off the LIVE setting, not the source text, so it lands on
-- exactly the 26 (25 here + is_claude_admin in Part 2) regardless of which
-- reading you start from. The already-pinned 14 simply will not match the
-- `search_path=public` filter, and Part 1's notice count will say so.
--
-- Already live-correct via 20260726120000 §3 — DO NOT "fix" these:
--   is_school_admin, log_audit_event, redeem_invite, share_course,
--   unshare_course, list_course_sharing, sync_owner_workspace_membership,
--   is_workspace_member, auth_teacher_school_id, set_active_workspace,
--   create_workspace, list_my_workspaces, list_workspace_members,
--   rename_workspace
--
-- The 25 Part 1 targets, oldest first. `is_grade_lead` leads deliberately: it is
-- the tenancy predicate `subjects_read`, `subjects_update` and `subjects_delete`
-- all route through, so it is the worst one in this list to leave unpinned.
-- (Ordering inside the DO block is cosmetic — every statement runs in one
-- transaction, so all 25 land together or none do.)
--
--   20260518102823_initial_schema
--     is_grade_lead, auth_teacher_grade_ids, is_grade_admin,
--     can_edit_subject_master
--   20260527120000_resources_embed_fields      auth_can_access_event
--   20260530090000_teach_view                  auth_can_read_lesson
--   20260604120000_planner_scale_hardening     can_read_grade
--   20260604140000_security_hardening          lesson_section_parent_subject
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
--
-- Plus is_claude_admin() in Part 2 = 26.
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
--   # A correct run returns ZERO rows, with NO expected exceptions — that is
--   # the point of Part 2. (The `path <> ''` clause is a belt: it excuses a
--   # function pinned to the empty path, which nothing is once Part 2 has run.
--   # Before Part 2, is_claude_admin() would have been excused by it; after,
--   # it passes on the merits because pg_temp is LAST.)
--
-- NO APPLICATION COUPLING — and here that claim is exact, not a hopeful
-- summary. This file changes no signature, no return type, no body, no policy
-- and no visible data; only the resolution order INSIDE each definer body. It
-- can be applied before or after any application deploy, and nothing in
-- `lib/planner/**` or the RPC callers needs to change with it.
-- ###########################################################################
