-- ###########################################################################
-- ## school_years — one active year per school, and a safe way to switch it
-- ###########################################################################
-- ⚠ AUTHORED, NOT APPLIED. Agents never apply anything to the production
-- database (standing hard rule). Orchestrator + user own the apply. Nothing in
-- this file has been run against any database.
--
-- ⚠ PROVENANCE OF THE "verified" CLAIMS BELOW, so a reviewer knows what to
-- re-check rather than inherit. Two authoring passes:
--   • Pass 1 (2026-08-07) took READ-ONLY catalog/row SELECTs against production
--     and recorded the row counts + index list quoted further down. Those are a
--     SNAPSHOT of that moment, not a standing guarantee.
--   • Pass 2 (2026-08-09, this one) ran NO database queries of any kind. Every
--     schema fact it relies on was re-derived from the COMMITTED migrations in
--     this folder, and each is cited inline by file:line so it can be checked
--     without a database. Where pass 2 could only confirm a fact from committed
--     SQL and not from live state, it says so.
--
-- ⚠ CONCURRENCY IS ANALYSED, NOT TESTED. The locking and the guard triggers
-- were reasoned through, not exercised: there is no local Postgres here and
-- agents never write to production. The interleavings are documented inline at
-- each decision point for a reviewer to check, rather than claimed as
-- empirically verified. No concurrency test was manufactured; do not read the
-- absence of one as an oversight.
--
-- Audit item: docs/audits/2026-07-31-settings-config.md §B5 — "Curriculums has
-- no home". That entry says `school_years.is_active` exists and nothing writes
-- it, and stops there. This file records WHY simply writing it from a server
-- action would be wrong, and supplies the mechanism that makes it safe.
--
-- ---------------------------------------------------------------------------
-- IN ONE PARAGRAPH, FOR A NON-SPECIALIST
-- ---------------------------------------------------------------------------
-- A school's plan lives inside a "school year" row, and exactly one of those
-- rows is supposed to be flagged as the live one. The whole planner reads that
-- flag to decide which year's lessons to show. Today nothing in the app can set
-- the flag, the database does not require that at most one row carries it, and
-- one school in production carries it on NO row at all — which makes the planner
-- silently fall back to showing EVERY year at once. This migration (1) makes "at
-- most one live year per school" a rule the database enforces, (2) adds a
-- single, transactional, admin-only operation for moving the flag, and (3)
-- closes the three side doors — a direct edit of the flag, a direct insert of an
-- already-live year, and a delete of the live year — through which an ordinary
-- client could otherwise leave a school with no live year at all.
--
-- ---------------------------------------------------------------------------
-- WHY A SERVER ACTION ALONE IS NOT ENOUGH (i.e. why this is a migration)
-- ---------------------------------------------------------------------------
-- Permission is NOT the blocker. From the committed schema:
--
--   • `school_years.is_active boolean not null default false`
--     (20260518102823_initial_schema.sql:277).
--   • policy `school_years_write`, cmd `ALL`,
--       using       is_school_admin(school_id)
--       with check  is_school_admin(school_id)
--   • `authenticated` holds INSERT/UPDATE/DELETE/SELECT on public.school_years
--     (observed in the pass-1 read of information_schema.role_table_grants).
--
-- So a school admin ALREADY has the privilege to insert a year, flip the flag,
-- and delete a year. What is missing is atomicity and an invariant:
--
--   1. NO UNIQUENESS. Live indexes on public.school_years were exactly
--      `school_years_pkey` (id) and `idx_school_years_school` (school_id).
--      Nothing stops two rows in one school being active at once.
--
--   2. THE SWITCH IS TWO WRITES, AND PostgREST CANNOT MAKE THEM ONE.
--      "Deactivate the old year, activate the new one" is two HTTP requests from
--      a server action, in two separate transactions. If the second one fails —
--      network, RLS, a deploy mid-flight — the school is left with ZERO active
--      years. That is not a cosmetic failure: `resolveActiveSchoolYearId`
--      (lib/planner/supabase-source.ts:337-379) FAILS OPEN by design, returning
--      null and dropping the year filter, so every archived year's lessons and
--      units merge into the live weekly grid for every teacher in that school.
--      The comment at lib/planner/supabase-source.ts:322-324 names that exact
--      merge as the production bug the filter was written to stop. A half-
--      completed switch re-creates it school-wide.
--
--   3. THE HAZARD IS NOT HYPOTHETICAL — IT WAS THE STATE AT PASS 1.
--      Read 2026-08-07 (read-only): 5 schools, 6 school_years rows, 4 active.
--      School f5fc6c08-7e70-4092-9345-00da5e18d0fa's ONLY year row was
--      `is_active = false`. Its teachers were on the fail-open all-years read.
--      (lib/archive/school-years.ts:60-69 independently observed this row and
--      drew the same conclusion from the other direction.)
--
--   4. AND THE SWITCH IS NOT THE ONLY WAY TO REACH ZERO. A single DELETE of the
--      live row reaches it in one request, and a single direct PATCH of
--      `is_active = false` reaches it in one request. SECTION 3 closes both.
--
-- Both fixes are DDL. Hence: migration, not server action.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DELIBERATELY DOES NOT DO — the product decision
-- ---------------------------------------------------------------------------
-- The audit's B5 is "create / select active curriculum". This file supplies only
-- the SELECT half. CREATE is blocked on a product decision that no schema can
-- make, and shipping it blind would be worse than shipping nothing:
--
--   • `units.school_year_id` binds content to a year
--     (20260518102823_initial_schema.sql:348), and there is NO rollover or
--     roll-forward code anywhere in the repo (lib/archive/school-years.ts:55-79
--     states this and it still holds — grep `school_year` under lib/ and app/
--     finds reads only). Creating a fresh year and activating it therefore
--     empties the planner for EVERY teacher in the school, instantly, with no
--     copy-forward and no in-app way back.
--   • The `school_year_archived` audit action has existed in the `audit_action`
--     enum since the initial schema (:149-150) and has never been emitted,
--     because nothing archives a year.
--   • "Archived" is not expressible. It is only ever inferable as `not
--     is_active`, and that predicate is WRONG on live data — see the f5fc6c08
--     row above, a provisioned-but-never-activated year that would render as a
--     sealed volume of a year nobody taught.
--
-- So "start a new curriculum" needs, at minimum, a decision on: does the new
-- year start empty, copy the previous year's units, or copy per-subject by the
-- existing `subjects.rollover_preference`? And an explicit sealed/archived
-- marker (an `archived_at`, or a status enum that separates "sealed" from
-- "provisioned, never activated"). Those are a second migration AFTER the
-- decision, not a guess made here.
--
-- ---------------------------------------------------------------------------
-- WHAT UI WOULD FOLLOW (once this is applied)
-- ---------------------------------------------------------------------------
-- A `/settings/curriculums` page in the existing Planning group, rendering the
-- school's `school_years` rows as a radio group of one active year, admin-only:
--
--   • Non-admins see the list read-only with an explanatory line — the same
--     shape `app/settings/standards/page.tsx` already uses for its school-default
--     section (gated on `getStandardsCaller().isSchoolAdmin`).
--   • The change control is team-scoped and high-consequence, so per CLAUDE.md
--     §4 it takes `tooltipRequired` (always-on tooltip, no "turn off these tips"
--     link) and a `useConsequenceToast` Undo — the Undo being a second call to
--     this same RPC with the previous year id, which is exactly why the RPC is
--     idempotent and returns whether it changed anything.
--   • The server action re-checks authorisation server-side and STRING-MATCHES
--     the stable error prefixes raised below into distinct user copy, following
--     `app/settings/team/actions.ts` rather than collapsing to one generic
--     string. The cases are enumerated in SECTION 2's header — note that one of
--     them is deliberately AMBIGUOUS and must be rendered as a plain "that year
--     isn't available", never as "no such row" (see SECTION 2, DISCLOSURE).
--   • Because the switch repoints the whole school's planner, the confirm copy
--     must name the consequence ("every teacher will see <label> from now on"),
--     not just ask "are you sure".
--
-- ---------------------------------------------------------------------------
-- THE INVARIANT THIS FILE ENFORCES, IN ONE SENTENCE
-- ---------------------------------------------------------------------------
-- A school never has more than one active school_year row, and no Supabase
-- CLIENT role can create, move, or destroy an active year except through
-- set_active_school_year() — so no client-reachable write path can leave a
-- school holding year rows but no active one.
--
-- Note the two deliberate limits in that sentence, stated up front rather than
-- buried: (a) "at most one", not "exactly one" — a school with ZERO active years
-- remains legal, because forcing one would require a backfill decision this file
-- refuses to guess (see SECTION 1); and (b) "no CLIENT role" — the migration
-- owner, seeds and pg_restore are exempt by design (see SECTION 3, ROLE GATE).
-- ###########################################################################


-- ###########################################################################
-- ## SECTION 0 — re-runnability over an earlier draft of THIS file
-- ###########################################################################
-- This migration is unapplied, but it has been REVISED, and the revision renamed
-- the guard: pass 1 shipped ONE trigger + function called
-- `school_years_guard_active_switch`; pass 2 ships THREE triggers over a
-- function called `school_years_guard_active_year`. If any earlier draft was
-- ever run in a scratch/branch database, re-running this file must converge
-- rather than leave the superseded objects behind — a stale
-- `..._guard_active_switch` trigger would keep firing forever with no code path
-- able to satisfy it once the RPC stops setting the old GUC.
--
-- Trigger BEFORE function: Postgres refuses to drop a function a trigger still
-- references without CASCADE, and CASCADE here would be a blunt instrument.
drop trigger  if exists school_years_guard_active_switch on public.school_years;
drop function if exists public.school_years_guard_active_switch();


-- ###########################################################################
-- ## SECTION 1 — at most one active year per school
-- ###########################################################################
-- A PARTIAL unique index, not a table constraint: the rule is "unique among the
-- rows where is_active", which a `unique` constraint cannot express.
--
-- THIS IS THE TABLE-LEVEL HALF OF THE INVARIANT. It holds against every writer —
-- client, RPC, migration owner, psql — because an index is not a policy and
-- cannot be bypassed by role. SECTION 3's triggers are the other half, and they
-- guard the direction an index structurally cannot: an index forbids TWO active
-- rows; only a trigger can forbid dropping to ZERO.
--
-- APPLY-DAY PRECONDITION — RE-CHECK IT, do not inherit pass 1's snapshot. At
-- pass 1 the 4 active rows sat in 4 DISTINCT schools (a1 → …0000c2 only;
-- 03e64ffe; 7e507b32; f68eb744) and f5fc6c08 had none, so max actives per school
-- was 1 and the index would build. That was 2026-08-07 and nothing has enforced
-- it since. Run the runbook's BEFORE query first — a failed CREATE INDEX aborts
-- the whole migration.
--
-- ZERO active rows remains legal. Tightening that to "exactly one" would demand
-- a backfill decision for f5fc6c08 (which year is live for a school that never
-- activated one?) and is left to the rollover work above. SECTION 3 is what
-- stops any NEW school from arriving in that state.
--
-- COMPATIBLE WITH BOTH PROVISIONING PATHS: `provision_individual_workspace`
-- (20260606130000_individual_provisioning.sql:176) and `create_workspace`
-- (20260724120000_multi_workspace.sql:484) each insert ONE active year into a
-- school they just created, so neither can collide. Ditto the seeds
-- (supabase/seed.sql:42, supabase/seed-cloud.sql:32).
--
-- NOT `concurrently`: CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction, and the block below deliberately IS one. The table held 6 rows
-- at pass 1, so the brief ACCESS EXCLUSIVE lock is not a concern.
--
-- ── WHY LOCK + CHECK + CREATE ARE ONE STATEMENT ───────────────────────────
-- Three separate problems, one structure that solves all three.
--
--   1. The runbook's BEFORE query runs in its OWN transaction, possibly minutes
--      before `supabase db push`. One concurrent write in that gap adds a second
--      active row and CREATE UNIQUE INDEX fails mid-deploy — a green preflight
--      is not evidence about the moment the index actually builds.
--   2. Moving the check into the file is not sufficient either: a bare SELECT
--      takes only ACCESS SHARE, so a writer can still slip between the check and
--      the build. The check has to hold a lock that blocks writers.
--   3. A STANDALONE `lock table` does NOT fix that, and an earlier revision of
--      this file was WRONG to claim it did. Its comment argued the statement
--      "doubles as an assertion that the runner wraps the file in a
--      transaction". It does not: if the runner applies statements
--      individually, the lock's implicit single-statement transaction ENDS with
--      the statement and the lock is RELEASED long before the index is built —
--      and the claim's stronger form (that a non-wrapping runner would fail
--      loudly and abort cleanly) is worse than useless, because SECTION 0's
--      drops would already have committed by then. That is a partially applied
--      migration, not a clean abort.
--
-- The fix is to stop depending on the runner's transaction behaviour for the
-- one part of this file where statement order is load-bearing. A DO block is a
-- SINGLE statement, so it gets a transaction context whether or not the runner
-- supplies one: the lock is taken, the duplicate check runs, and the index is
-- built without any other session able to write in between. Six rows, so this
-- is microseconds, not a maintenance window.
--
-- ── AND WHY THE INDEX IS NOT `create ... if not exists` ANY MORE ──────────
-- `IF NOT EXISTS` matches on NAME ONLY. A pre-existing index called
-- school_years_one_active_per_school with the wrong columns, the wrong
-- predicate, or no uniqueness at all would be silently accepted and this
-- migration would report success while the invariant it advertises is absent —
-- the whole file's table-level half, quietly missing. The block below checks
-- the SHAPE of any existing index of that name and raises with its actual
-- definition if it disagrees, so remediation is explicit rather than assumed.
do $$
declare
  v_bad        text;
  -- regclass, not oid: to_regclass returns regclass, and `v_relid::text` then
  -- renders a readable schema-qualified name straight into the error message.
  v_idx        regclass;
  v_relid      regclass;
  v_isunique   boolean;
  v_isvalid    boolean;
  v_isready    boolean;
  v_nkeyatts   smallint;
  v_hasexprs   boolean;
  v_keyattnum  smallint;
  v_pred       text;
  v_def        text;
  v_keycol     text;
  v_why        text;
begin
  -- Block every writer for the remainder of this statement. This is the lock
  -- CREATE INDEX would take anyway, just taken early enough to also cover the
  -- check.
  lock table public.school_years in access exclusive mode;

  -- Turn the raw 23505 the index would otherwise throw into a message that
  -- names the schools to fix. The lock is already held, so this answer is still
  -- true when the index is built a few lines below.
  select string_agg(school_id::text, ', ' order by school_id::text)
    into v_bad
  from (
    select school_id
    from public.school_years
    where is_active
    group by school_id
    having count(*) > 1
  ) dupes;

  if v_bad is not null then
    raise exception
      'school_years: cannot create school_years_one_active_per_school — more than one active year in school(s): %. Resolve each to a single active year, then re-run this migration.',
      v_bad;
  end if;

  -- ── DOES AN INDEX OF THIS NAME ALREADY EXIST, AND IS IT THE RIGHT ONE? ──
  -- Validated STRUCTURALLY, from the catalog, not by pattern-matching
  -- pg_get_indexdef. A review pass found three ways a text-matching version
  -- false-passed, each of which would have let this migration report success
  -- with NO effective one-active-year constraint — the exact invariant the file
  -- exists to establish:
  --
  --   1. Looking the index up by NAME + schema alone finds an index of that
  --      name on a DIFFERENT TABLE. Index names are unique per schema, so such
  --      an index genuinely blocks `create index` here — and the name-only
  --      lookup would have silently skipped creation and called it done.
  --   2. `indisvalid` / `indisready` unchecked: an INVALID index (a failed
  --      CREATE INDEX CONCURRENTLY) has a perfect-looking definition and
  --      enforces nothing.
  --   3. Predicate checked by regex rather than by expression. A narrower
  --      predicate that excludes other schools' rows still enforces nothing
  --      useful. (For the record: the anchored regex DID reject the specific
  --      `WHERE school_id = '…' AND is_active` case, because pg_get_indexdef
  --      renders it as `WHERE ((school_id = …) AND is_active)` and the pattern
  --      required the predicate to be is_active and nothing else. But relying
  --      on the exact spelling of generated SQL to catch a semantic problem is
  --      the wrong instrument, so it is gone.)
  --
  -- `pg_get_expr(indpred, indrelid)` renders the predicate canonically, so any
  -- EXTRA condition changes the string and is treated as the wrong shape.
  --
  -- SCOPE OF THE CHECK, STATED RATHER THAN IMPLIED: it does NOT inspect the
  -- access method or the operator class. A nonstandard btree opclass on
  -- school_id whose equality semantics differ from ordinary uuid equality would
  -- satisfy every condition below and still not enforce what we mean by "one
  -- active year per school". This is an ASSUMPTION OF TRUSTED DDL OWNERSHIP,
  -- and it is a deliberate stopping point, not an oversight: creating such an
  -- opclass requires privileges that already allow dropping these triggers
  -- outright, so the check cannot be made meaningful against an adversary who
  -- has them. Verifying pg_am + opclass is one more branch of intricate,
  -- never-executed SQL guarding a threat this file cannot defend against
  -- anyway — the wrong trade at this point in the task. If this migration is
  -- ever applied to a database whose DDL history is not trusted, verify the
  -- index by hand with \d+ public.school_years instead of trusting this block.
  --
  -- INCLUDE COLUMNS ARE DELIBERATELY ALLOWED. Uniqueness is enforced over KEY
  -- columns only, so `unique (school_id) include (id) where is_active` enforces
  -- this invariant exactly as well as the canonical form. The check therefore
  -- constrains `indnkeyatts` (key attributes) and says nothing about
  -- `indnatts` (key + included) — aborting a one-shot live apply over a
  -- payload column would be a false alarm.
  v_idx := to_regclass('public.school_years_one_active_per_school');

  if v_idx is null then
    execute 'create unique index school_years_one_active_per_school'
         || ' on public.school_years (school_id) where is_active';
  else
    select i.indrelid, i.indisunique, i.indisvalid, i.indisready,
           i.indnkeyatts, (i.indexprs is not null), i.indkey[0],
           pg_get_expr(i.indpred, i.indrelid),
           pg_get_indexdef(i.indexrelid)
      into v_relid, v_isunique, v_isvalid, v_isready,
           v_nkeyatts, v_hasexprs, v_keyattnum, v_pred, v_def
    from pg_index i
    where i.indexrelid = v_idx;

    if not found then
      -- to_regclass matches any relation kind, so the name may be taken by a
      -- table/view/sequence. `create index` would fail on the name collision.
      raise exception
        'school_years: the name school_years_one_active_per_school is already taken in schema public by a % , not an index. Rename or drop it, then re-run.',
        (select relkind from pg_class where oid = v_idx);
    end if;

    select a.attname
      into v_keycol
    from pg_attribute a
    where a.attrelid = v_relid
      and a.attnum   = v_keyattnum;

    -- First failing condition wins, so the message names ONE concrete reason.
    v_why := case
      when v_relid <> 'public.school_years'::regclass
        then 'it indexes ' || v_relid::text || ', not public.school_years'
      when not v_isvalid or not v_isready
        then 'it is INVALID or NOT READY (a failed concurrent build), so it enforces nothing'
      when not v_isunique
        then 'it is not UNIQUE'
      when v_hasexprs
        then 'it is keyed on an expression rather than a plain column'
      when v_nkeyatts <> 1
        then 'it has ' || v_nkeyatts || ' key columns, not exactly 1'
      when v_keycol is distinct from 'school_id'
        then 'its key column is ' || coalesce(v_keycol, '<unresolvable>') || ', not school_id'
      when btrim(coalesce(v_pred, ''), '() ') <> 'is_active'
        then 'its predicate is '
             || coalesce(v_pred, '<none — the index is not partial>')
             || ', not exactly is_active'
      else null
    end;

    if v_why is not null then
      raise exception
        'school_years: an index named school_years_one_active_per_school already exists but does NOT enforce the one-active-year invariant — %. Definition: %. Expected: UNIQUE on public.school_years (school_id) WHERE is_active (INCLUDE columns are fine). Inspect and drop it deliberately, then re-run.',
        v_why, coalesce(v_def, '<none>');
    end if;
  end if;
end $$;

comment on index public.school_years_one_active_per_school is
  'At most one active (live) school year per school. The planner resolves the '
  'year filter from is_active and fails OPEN (reads every year) when none is '
  'found, so a second active row would be silently resolved by start_date '
  'instead of erroring. Use set_active_school_year() to move the flag.';


-- ###########################################################################
-- ## SECTION 2 — set_active_school_year(uuid) — the transactional switch
-- ###########################################################################
-- Moves the active flag to `p_school_year_id` within its school. Returns TRUE if
-- the flag moved, FALSE if that year was already active (idempotent — a repeat
-- call, or an Undo back to the year already live, is a no-op, not an error).
--
-- SECURITY DEFINER because it must deactivate the sibling row and activate the
-- target in ONE transaction; RLS is therefore bypassed and every authorisation
-- rule below is re-checked explicitly in the body. `search_path = public,
-- pg_temp` per the standing rule (20260730120000_security_definer_search_path_
-- backfill.sql) — `= public` alone leaves pg_temp resolvable FIRST, so an
-- attacker who can create a temp object can shadow a real one and have this
-- function call their version with the owner's privileges. pg_temp is named
-- explicitly and LAST.
--
-- ── DISCLOSURE: THE ERROR SURFACE IS PART OF THE SECURITY BOUNDARY ─────────
-- A SECURITY DEFINER function reads rows RLS would have hidden, so anything it
-- says about a row it read is a disclosure. An earlier draft raised
--     'school year % not found'                       (row does not exist)
--     'school year belongs to a different workspace'  (row exists, elsewhere)
-- as DISTINCT errors before checking anything about the caller. Any
-- authenticated teacher could therefore enumerate uuids and learn which ones
-- name a real school_years row in a tenant they have no relationship with — a
-- cross-tenant existence oracle, and with it the school_id partitioning of the
-- whole customer base.
--
-- The fix is a MEMBERSHIP gate that runs before any row detail is disclosed, and
-- ONE shared error for both of the cases the caller is not entitled to
-- distinguish:
--
--   'set_active_school_year: no such school year'
--        raised IDENTICALLY when the row does not exist AND when it exists in a
--        school the caller is not a member of. Indistinguishable by design.
--        The action layer must render this as "that year isn't available" — it
--        must NOT restate it as "not found", which would re-leak the
--        distinction the database just spent effort hiding.
--
--   'set_active_school_year: school year belongs to a different workspace'
--        raised ONLY once membership is established, i.e. the caller already
--        knows this school exists because they belong to it. Discloses nothing
--        new, and stays distinct because it is RECOVERABLE by the teacher
--        (switch workspace, retry) and must not read as a permission refusal.
--
--   'set_active_school_year: caller is not an admin of that school'
--        likewise post-membership; the caller is in this school, they simply
--        lack the admin role in it.
--
--   'set_active_school_year: requires an authenticated caller'
--        pre-everything; discloses nothing.
--
-- RESIDUAL, ACCEPTED: the two paths that share a message do not share a
-- code path, so a determined attacker could in principle time the extra
-- membership probe. Closing a timing channel of that size is not worth
-- constant-time gymnastics in plpgsql; it is noted, not ignored.
--
-- ── WORKSPACE PIN — STRICTER THAN THE TABLE POLICY, ON PURPOSE ─────────────
-- `school_years_write` gates on `is_school_admin(school_id)` alone. This
-- function additionally requires the target's school to be the caller's ACTIVE
-- workspace (auth_teacher_school_id(), 20260724120000_multi_workspace.sql:278),
-- mirroring the pin in `share_course` / `unshare_course`
-- (20260717120000_course_sharing_rpcs.sql). An operation that repoints an entire
-- school's planner should not be reachable from a workspace the teacher is not
-- currently looking at.
--
-- ── GRADE SCOPING ─────────────────────────────────────────────────────────
-- A school year spans the whole school, every grade in it. Nothing here is
-- grade-scoped and nothing here may assume a single grade (CLAUDE.md §6): the
-- audit call passes p_grade_level_id = NULL, which log_audit_event
-- (20260604150000_security_hardening_2.sql:66-69) documents as "school-wide
-- action" and lets through its grade gate. Passing any grade here would both be
-- wrong and would fail that function's cross-field consistency check.
create or replace function public.set_active_school_year(
  p_school_year_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid           uuid := auth.uid();
  v_probe_school  uuid;   -- pre-lock, advisory only: used ONLY as the lock key
  v_school_id     uuid;   -- authoritative, read under the lock
  v_label         text;
  v_was_active    boolean;
  v_prev_ids      uuid[];
begin
  if v_uid is null then
    raise exception 'set_active_school_year: requires an authenticated caller';
  end if;

  -- ── ISOLATION PRECONDITION ────────────────────────────────────────────────
  -- The whole serialisation argument below rests on the post-lock re-read
  -- seeing a FRESH snapshot — i.e. on Read Committed, where each statement
  -- takes its own. At REPEATABLE READ or SERIALIZABLE the snapshot is fixed at
  -- the transaction's first query, which here is the pre-lock probe: the
  -- re-read would then return the SAME stale rows it already saw, the winner's
  -- committed switch would be invisible, and this call would either violate
  -- SECTION 1's unique index (raw 23505) or die with a serialization failure —
  -- after the caller was told the checks passed.
  --
  -- PostgREST runs Read Committed, so this never fires in normal use. It exists
  -- for the caller who wraps this RPC in a stricter transaction: refuse
  -- explicitly, with a message that says why, rather than produce a wrong
  -- result or an opaque error. A retry is not available as a fix — at those
  -- levels the transaction must abort and be re-run from the top, which is the
  -- CALLER's job, not something this function can do from the inside.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception
      'set_active_school_year: requires read committed isolation (transaction is %) — the post-lock re-read depends on a fresh snapshot; re-run this call in its own read committed transaction',
      current_setting('transaction_isolation');
  end if;

  -- ── PRE-LOCK PROBE ────────────────────────────────────────────────────────
  -- Resolves the lock key, and gates OUT callers with no relationship to the
  -- target before they can make this function take a lock at all. Without this
  -- gate any authenticated teacher could force a transaction-scoped advisory
  -- lock on an arbitrary FOREIGN school (the function is SECURITY DEFINER, so it
  -- can read the row) and serialise that tenant's switches from outside it — a
  -- small but real cross-tenant availability lever.
  --
  -- NOTHING from this read is trusted for a DECISION. It is stale by
  -- construction: the lock is not held yet.
  select sy.school_id
    into v_probe_school
  from public.school_years sy
  where sy.id = p_school_year_id;

  -- `v_probe_school is null` is a sound stand-in for NOT FOUND here, and only
  -- here, because `school_years.school_id` is `not null`
  -- (20260518102823_initial_schema.sql:272) — a row that exists cannot yield a
  -- null school_id, so null means "no row". Stated because the equivalence is a
  -- property of the schema, not of the query, and would break silently if the
  -- column ever became nullable.
  --
  -- ONE raise site for the two cases the caller may not distinguish; see
  -- DISCLOSURE above. `is_workspace_member(null)` is `exists(... = null)` =
  -- false and `null = auth_teacher_school_id()` is null, so a missing row
  -- reaches the raise through the first disjunct with no null-propagation trap.
  if v_probe_school is null
     or not (
          public.is_workspace_member(v_probe_school)
          or v_probe_school = public.auth_teacher_school_id()
        )
  then
    raise exception 'set_active_school_year: no such school year';
  end if;

  -- ── SERIALISATION — a SCHOOL-level lock, then a RE-READ ───────────────────
  --
  -- An earlier draft locked only the TARGET row (SELECT … FOR UPDATE) and
  -- reasoned that was sufficient. It is not: two concurrent calls activating
  -- two DIFFERENT years of the SAME school lock two different rows, so neither
  -- blocks the other. Interleaving that breaks it: both read "no active
  -- sibling" (school currently has zero active, the exact f5fc6c08 state), both
  -- skip the deactivate, both race to activate — the loser hits SECTION 1's
  -- partial unique index and surfaces a raw 23505 instead of one of this
  -- function's stable error prefixes.
  --
  -- Fix, in two load-bearing halves:
  --
  --   1. A transaction-scoped ADVISORY lock keyed by school, so every switch
  --      within one school serialises regardless of which row it targets.
  --      Different schools never contend. xact-scoped ⇒ released automatically
  --      at commit/abort; there is no unlock path to forget.
  --   2. THE RE-READ BELOW IS THE PART THAT ACTUALLY FIXES IT — do not
  --      optimise it away. Every decision (was-active idempotence, which sibling
  --      to deactivate, and every authorisation check) must run on state read
  --      AFTER the lock is acquired, because while this transaction waited on
  --      the lock the winner may have committed a switch, changed the row, or
  --      deleted it.
  --
  -- ON THE KEY ITSELF: the key is derived from a value read BEFORE the lock, so
  -- it is only trustworthy if that value cannot change. Pass 1 asserted
  -- school_id was immutable "because nothing in this schema moves a year between
  -- schools" — a claim about current CODE, not an enforced rule; `school_years_
  -- write` is FOR ALL, so an admin of two schools could PATCH school_id and move
  -- a year under a lock keyed on its old school. SECTION 3 now ENFORCES the
  -- immutability that claim assumed, and the post-lock assertion below fails
  -- closed if it is ever removed. Belt and braces, because a silently
  -- mis-keyed lock is invisible until it corrupts.
  --
  -- Analysed interleaving (NOT empirically tested — see the file header):
  --   T1 and T2 both call for years A and B of school S (A ≠ B, both inactive).
  --   T1 acquires the advisory lock; T2 blocks at the same call. T1 re-reads A
  --   (inactive), deactivates the sibling (none), activates A, commits; the
  --   xact lock releases. T2 wakes, re-reads B under the lock — a fresh MVCC
  --   snapshot taken after T1's commit, so it SEES A active — deactivates A,
  --   activates B, commits. No index violation, no zero-active instant visible
  --   to any third session, and a T2 that targeted A instead of B returns
  --   false via the idempotence branch.
  --
  -- hashtextextended gives a bigint over the full namespaced string —
  -- collisions across unrelated advisory-lock users are the standard (accepted)
  -- caveat, and a false collision only over-serialises; it can never
  -- under-serialise.
  perform pg_advisory_xact_lock(
    hashtextextended('school_years:active_switch:' || v_probe_school::text, 0)
  );

  -- RE-READ under the lock. FOR UPDATE also row-locks the target against
  -- non-RPC writers for the rest of the transaction. The row can have been
  -- DELETED while we waited, so every gate repeats — none of them is a
  -- formality.
  select sy.school_id, sy.label, sy.is_active
    into v_school_id, v_label, v_was_active
  from public.school_years sy
  where sy.id = p_school_year_id
  for update;

  if v_school_id is null
     or not (
          public.is_workspace_member(v_school_id)
          or v_school_id = public.auth_teacher_school_id()
        )
  then
    raise exception 'set_active_school_year: no such school year';
  end if;

  -- The advisory lock is keyed on the PRE-lock school_id. If the row's school
  -- changed while we waited, the lock we hold is for the wrong school and the
  -- serialisation guarantee above is void — so refuse rather than proceed
  -- unserialised. SECTION 3's immutability guard makes this unreachable from a
  -- client role; it is kept as a fail-closed assertion, not as a live path. Its
  -- message is safe to be distinct: it is only reachable post-membership.
  if v_school_id is distinct from v_probe_school then
    raise exception 'set_active_school_year: school year moved between schools mid-switch; retry';
  end if;

  -- Workspace pin BEFORE the admin check, so a cross-workspace attempt gets the
  -- recoverable message rather than a permission refusal it cannot act on.
  if v_school_id is distinct from public.auth_teacher_school_id() then
    raise exception 'set_active_school_year: school year belongs to a different workspace';
  end if;

  if not public.is_school_admin(v_school_id) then
    raise exception 'set_active_school_year: caller is not an admin of that school';
  end if;

  if v_was_active then
    return false;   -- already live; idempotent no-op (Undo-safe)
  end if;

  -- ── THE SANCTIONED WINDOW ────────────────────────────────────────────────
  -- Unlock SECTION 3's guard triggers for THIS transaction only (`is_local =
  -- true` ⇒ the setting evaporates at commit/abort, so no session ever keeps
  -- the permission). A direct PATCH/DELETE never has this GUC set and the guard
  -- raises. The window is CLOSED again the moment the two statements are done —
  -- see the reset below.
  --
  -- HONESTLY: this is currently BELT AND BRACES, not the load-bearing part.
  -- Because this function is SECURITY DEFINER and owned by the migration role,
  -- the guard's role test already exempts the two updates below. The GUC is
  -- what keeps them working if this function is ever changed to SECURITY
  -- INVOKER, and it is what documents intent at the trigger. Do not read its
  -- presence as evidence the role gate is doing nothing.
  perform set_config('mycurricula.active_year_switch', 'rpc', true);

  -- ORDER MATTERS, AND IT IS LOAD-BEARING. The partial unique index from
  -- SECTION 1 is an INDEX, so it is checked per row as each row is updated and
  -- cannot be deferred to end-of-transaction (a `unique ... deferrable` CONSTRAINT
  -- could be, but constraints cannot be partial). A single
  --     update school_years set is_active = (id = p_school_year_id) where school_id = …
  -- would therefore violate the index whenever the planner happens to update the
  -- new row before the old one — a row order Postgres does not promise. Two
  -- statements, deactivate FIRST, in one function body (= one transaction):
  -- there is no instant at which two rows are active, and no instant VISIBLE to
  -- any other session at which zero are.
  --
  -- `updated_at` is NOT set explicitly: trg_school_years_updated_at
  -- (20260518102823_initial_schema.sql:949) is a BEFORE UPDATE trigger that
  -- already stamps it, and it sorts AFTER the guard triggers by name, so both
  -- fire in a well-defined order on the same row.
  --
  -- The deactivate collects an ARRAY, not a scalar. With SECTION 1's index in
  -- place at most one row can match, so the array holds 0 or 1 element — but
  -- `RETURNING … INTO <scalar>` on a multi-row UPDATE silently keeps only the
  -- LAST row, so if the index is ever absent (a partial rollback, a future DROP)
  -- the audit trail would quietly under-report which years were switched off.
  -- The array cannot lie, at the cost of one aggregate.
  with deactivated as (
    update public.school_years
       set is_active = false
     where school_id = v_school_id
       and is_active
       and id <> p_school_year_id
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[])
    into v_prev_ids
  from deactivated;

  update public.school_years
     set is_active = true
   where id = p_school_year_id;

  -- Close the window immediately. Leaving the GUC set would disarm SECTION 3
  -- for the REST of the transaction — harmless while this function is the whole
  -- transaction (a PostgREST RPC call), but silently unsafe the first time
  -- another function calls this one and then does more work on school_years.
  -- Resetting here means the guard is armed except across these two statements.
  perform set_config('mycurricula.active_year_switch', '', true);

  -- AUDIT. `school_year_started` (audit_action) and `school_year`
  -- (audit_entity) both already exist in the enums
  -- (20260518102823_initial_schema.sql:149, :156); this is their first emitter.
  --
  -- Deliberately NOT wrapped in an exception handler: if the audit row cannot be
  -- written, the switch aborts. A team-wide repointing of every teacher's
  -- planner that leaves no trace is worse than one that fails loudly. Given the
  -- workspace pin above, log_audit_event's own school gate
  -- (20260604150000_security_hardening_2.sql:74) cannot reject this call, so the
  -- abort path is genuinely exceptional rather than routine.
  perform public.log_audit_event(
    'school_year_started',
    'school_year',
    p_school_year_id,
    null::uuid,                 -- school-wide action, not grade-scoped
    v_school_id,
    jsonb_build_object(
      'actor', v_uid,
      'label', v_label,
      'previous_school_year_ids', to_jsonb(v_prev_ids),
      'deactivated_count', coalesce(array_length(v_prev_ids, 1), 0)
    )
  );

  return true;
end;
$$;

comment on function public.set_active_school_year(uuid) is
  'Move a school''s active-year flag to the given school_years row, atomically. '
  'Admin-only, pinned to the caller''s active workspace. Returns true if the '
  'flag moved, false if that year was already active. Raises an identical '
  '"no such school year" for a missing row and for a row in a school the '
  'caller does not belong to — do not re-split those in the UI.';

-- EXECUTE: name `anon` EXPLICITLY. Revoking from PUBLIC does not remove the
-- grant anon holds in its own right via Supabase's default privileges — the
-- exact no-op documented in 20260729130000_unit_assessments_anon_revoke.sql.
revoke execute on function public.set_active_school_year(uuid) from public;
revoke execute on function public.set_active_school_year(uuid) from anon;
grant  execute on function public.set_active_school_year(uuid) to authenticated;


-- ###########################################################################
-- ## SECTION 3 — close the three direct write paths
-- ###########################################################################
-- SECTIONS 1–2 alone leave the RPC as the POLITE path, not the ONLY one. Policy
-- `school_years_write` is FOR ALL and `authenticated` holds INSERT/UPDATE/DELETE
-- on the table, so a school admin can reach the fail-open zero-active state this
-- whole file exists to prevent, in ONE PostgREST request, three different ways:
--
--   (a) UPDATE — PATCH `is_active = false` on their school's only active row.
--   (b) DELETE — delete that row outright. THE PARTIAL INDEX CANNOT SEE THIS
--       AT ALL: it forbids two active rows, and deleting takes the count from
--       one to zero, which no uniqueness rule has an opinion about. This is the
--       most damaging of the three by a wide margin, because
--       `units.school_year_id` is `on delete cascade`
--       (20260518102823_initial_schema.sql:348) — and so are
--       `recurrence_patterns.school_year_id` (:375) and
--       `coverage_snapshots.school_year_id` (:908). Deleting a year does not
--       merely unset a flag; it destroys every unit in that year and everything
--       hanging off those units, for every grade in the school, with no undo.
--   (c) INSERT — insert a NEW row with `is_active = true`. Where the school
--       already has an active year the index rejects it loudly, but a school
--       sitting at zero active (the f5fc6c08 state, and the state any future
--       rollover work will pass through) accepts it silently — bypassing the
--       workspace pin, the admin re-check, and the audit trail in one request.
--
-- All three are closed by ONE trigger function on three triggers.
--
-- ── ROLE GATE — what "closed" means, and the bug that made it a NO-OP ─────
--
-- 🚨 THIS FUNCTION MUST BE `SECURITY INVOKER`. NEVER MAKE IT DEFINER. 🚨
-- An earlier revision declared it SECURITY DEFINER and then asked
-- `current_user in ('anon','authenticated','service_role')`. Inside a SECURITY
-- DEFINER function `current_user` is the function OWNER, not the calling
-- PostgREST role — so that test was FALSE ON EVERY INVOCATION, the exemption
-- branch returned early every time, and all three guards below were INERT while
-- reading as if they worked. Every direct write this section exists to stop was
-- still permitted. The file said "closed"; the database said "come in".
--
-- SECURITY INVOKER is what makes the role test mean what it says: under
-- PostgREST the request role really is the effective user, so `current_user` is
-- 'authenticated' (or 'anon' / 'service_role'). It also still gives the right
-- answer on the exempt paths, for the same reason in reverse — inside
-- `provision_individual_workspace` (itself SECURITY DEFINER) the effective user
-- IS the owner, so the trigger sees the owner and exempts it.
--
-- `session_user` is NOT an alternative fix: under PostgREST that is the
-- connection role (`authenticator`), not the request role, so it would exempt
-- every client write instead of gating it — the same bug wearing a different
-- hat.
--
-- This function therefore reads NO tables. That is deliberate, not incidental:
-- as INVOKER it would read them through the caller's RLS, and a policy that
-- hid a row would make the guard draw the wrong conclusion. It looks only at
-- `current_user`, one GUC, and OLD/NEW.
--
-- Closed to Supabase CLIENT roles: `anon`, `authenticated`, `service_role` —
-- i.e. everything reachable over PostgREST with a browser session or an API key.
-- NOT closed to the migration owner. That exemption is deliberate and it is what
-- keeps the following working, none of which this migration is allowed to
-- rewrite:
--
--   • `provision_individual_workspace` (…individual_provisioning.sql:79, 176)
--     and `create_workspace` (…multi_workspace.sql:414, 484) — both SECURITY
--     DEFINER, so `current_user` inside them is the function owner, not the
--     caller. They insert the school's FIRST active year and must keep working.
--   • `supabase/seed.sql:42` and `supabase/seed-cloud.sql:32`, which run as the
--     migration/superuser role.
--   • `pg_restore` and any future data migration. A guard that made a restore
--     of an already-active year impossible would be a far worse foot-gun than
--     the hole it closes.
--
-- Pass 1's comment claimed the trigger made the RPC "the ONLY path that can flip
-- is_active", while its own runbook admitted the postgres role was out of scope.
-- Both cannot be true. The honest statement is the one at the top of this file:
-- no CLIENT role can. That is the actual threat model — a school admin with a
-- browser and the REST API — and it is fully covered.
--
-- ── OTHER DESIGN NOTES, in decision order ─────────────────────────────────
--   • TRIGGER, NOT COLUMN-LEVEL GRANT SURGERY. Postgres column privileges are
--     ADDITIVE: the existing table-level `UPDATE` grant to `authenticated`
--     covers every column, so revoking one column would mean revoking the table
--     grant and re-granting every-column-except-is_active — a list that silently
--     goes stale the next time a column is added. And column grants cannot
--     express the DELETE rule at all.
--   • The UPDATE trigger is `BEFORE UPDATE OF is_active, school_id` + an IS
--     DISTINCT FROM check, so updates that touch neither column (label edits,
--     holidays, ramadan dates, cycle anchors) never enter the guard's failure
--     path, and updates that mention them without changing them pass through.
--   • school_id is made IMMUTABLE here. Not cosmetic tidiness: it is the
--     precondition SECTION 2's advisory-lock key depends on, and moving a year
--     between schools would also silently re-tenant every unit under it.
--   • CASCADE FROM `schools` NEEDS NO SPECIAL CASE, and an earlier revision was
--     wrong to add one. `school_years.school_id` is `on delete cascade`
--     (initial_schema.sql:272), so deleting a school deletes its years including
--     the active one, and a naive DELETE guard would make schools undeletable.
--     That revision detected the cascade by probing whether the parent school
--     still existed — which required SECURITY DEFINER to be trustworthy (as
--     INVOKER, RLS on `schools` could hide a real school and the guard would
--     wave a client DELETE through as if it were a cascade), and DEFINER is
--     exactly what broke the role gate above. Trying to keep the probe under
--     INVOKER is no better: it would need a DEFINER helper that any client could
--     also call directly, i.e. a school-existence oracle — reintroducing, in a
--     new place, the cross-tenant disclosure SECTION 2 just closed.
--     None of that is necessary — but the FIRST version of this justification
--     was still wrong, and the corrected reasoning is the point. It argued
--     "`schools` has no client DELETE policy, so no client can trigger the
--     cascade." That does not follow: `service_role` BYPASSES RLS, so the
--     absence of a policy says nothing about what a service-key script can do.
--     A service_role DELETE of a school WOULD start the cascade, and the child
--     school_years delete would then reach this guard as a listed client role
--     and be refused — blocking a legitimate operational action. Note that is
--     the OPPOSITE failure from the one being avoided: over-blocking, not
--     under-blocking.
--
--     THE CONCLUSION SURVIVES, ON DIFFERENT AND VERIFIED GROUNDS: no code path
--     in this repository deletes a school, by any role. Verified 2026-08-09 by
--     grep over app/, lib/, components/, supabase/ and scripts/ — there is no
--     `delete from schools`, no `.from("schools").delete()`, and no
--     delete_workspace anywhere. Every one of the four `schools` call sites is
--     a read or an update:
--       lib/planner/supabase-source.ts:293   select school_week
--       lib/school-week-remote.ts:169        select school_week
--       lib/school-week-remote.ts:362        update school_week
--       lib/supabase/ensure-teacher.ts:272   select id
--     The service-role client (lib/supabase/admin.ts) never touches `schools`
--     at all. So this is a LATENT trap, not a live breakage.
--
--     `service_role` STAYS GATED anyway, deliberately: it is an API key sitting
--     in server config, and a stray script stranding a school at zero active
--     years is precisely the failure this file exists to prevent. Default
--     closed. The operational path is not blocked, it is made explicit — see
--     OPS ESCAPE HATCH in the runbook, which is one `set_config` line in the
--     same transaction.
--     WHEN A REAL SCHOOL-DELETION FEATURE LANDS: make it a SECURITY DEFINER RPC
--     (the pattern every other workspace RPC in this repo already follows —
--     `create_workspace` :414, `provision_individual_workspace` :79) and it is
--     exempt automatically, audited, and able to do the cascade in one
--     transaction. Do NOT reach for the escape hatch to build a feature.
--   • The GUC namespace ('mycurricula.') cannot collide with server settings;
--     `current_setting(..., missing_ok := true)` returns NULL (coalesced to '')
--     when it was never set in this session, so the guard fails CLOSED.
--   • Every failure message names the supported path, so an admin who hits one
--     learns what to call rather than just being denied.
create or replace function public.school_years_guard_active_year()
returns trigger
language plpgsql
-- SECURITY INVOKER — stated explicitly rather than left to the default,
-- because the default is the only thing standing between this file and the
-- inert-guard bug described above. See the 🚨 note in the ROLE GATE section
-- before changing this line.
security invoker
set search_path = public, pg_temp
as $$
declare
  -- The one sanctioned window: set_active_school_year() sets this transaction-
  -- locally for exactly the two statements that move the flag.
  v_via_rpc boolean :=
    coalesce(current_setting('mycurricula.active_year_switch', true), '') = 'rpc';
  -- TRUE only for writes arriving as a Supabase client role. Everything else —
  -- the migration owner, SECURITY DEFINER functions it owns, seeds, restores —
  -- is out of scope by design; see ROLE GATE above. This is ONLY correct
  -- because the function is SECURITY INVOKER.
  v_client_write boolean :=
    current_user in ('anon', 'authenticated', 'service_role');
begin
  -- Branched rather than `return case when tg_op = 'DELETE' then old else new
  -- end`: OLD and NEW are plpgsql records, and a CASE expression over two
  -- records has no common type to resolve to. Explicit returns also keep OLD
  -- from being referenced at all on the INSERT path, where it is unassigned.
  if v_via_rpc or not v_client_write then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- (c). Inserting an INACTIVE year is fine and stays fine — that is how a
    -- future "create next year" flow should work: insert dormant, then switch.
    if new.is_active then
      raise exception
        'school_years: a year may not be created already-active — insert it with is_active = false, then call set_active_school_year()';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.school_id is distinct from old.school_id then
      raise exception
        'school_years: school_id is immutable — moving a year between schools would re-tenant every unit under it and mis-key the active-switch lock';
    end if;
    if new.is_active is distinct from old.is_active then
      raise exception
        'school_years: is_active may only be changed via set_active_school_year() — direct writes can strand a school with zero active years';
    end if;
    return new;
  end if;

  -- DELETE. No cascade special-case, and no table read — see the CASCADE note
  -- in the header. Nothing in this repo deletes a school (verified by grep,
  -- cited there), and `service_role` — which COULD, since it bypasses RLS —
  -- is gated on purpose with a documented one-line escape hatch in the runbook.
  if old.is_active then
    raise exception
      'school_years: the active year may not be deleted — activate another year with set_active_school_year() first (deleting a year CASCADES to its units and everything under them)';
  end if;
  return old;
end;
$$;

comment on function public.school_years_guard_active_year() is
  'Guard behind three triggers on school_years. For Supabase client roles only '
  '(anon/authenticated/service_role): rejects INSERT of an already-active year, '
  'any change to is_active or school_id, and DELETE of the active year — unless '
  'the transaction-local GUC mycurricula.active_year_switch is set, which only '
  'set_active_school_year() does. MUST stay SECURITY INVOKER: as DEFINER, '
  'current_user is the owner and the client-role test is false on every call, '
  'silently disabling all three guards. '
  'Together with the partial unique index school_years_one_active_per_school '
  'this keeps a school at exactly 0 or 1 active years and stops a client '
  'reaching 0 while years remain.';

drop trigger if exists school_years_guard_active_insert on public.school_years;
create trigger school_years_guard_active_insert
  before insert on public.school_years
  for each row
  execute function public.school_years_guard_active_year();

-- Column-scoped: fires only when an UPDATE's SET list mentions one of these, so
-- ordinary edits (label, dates, weeks, holidays, ramadan, cycle) never reach it.
drop trigger if exists school_years_guard_active_update on public.school_years;
create trigger school_years_guard_active_update
  before update of is_active, school_id on public.school_years
  for each row
  execute function public.school_years_guard_active_year();

drop trigger if exists school_years_guard_active_delete on public.school_years;
create trigger school_years_guard_active_delete
  before delete on public.school_years
  for each row
  execute function public.school_years_guard_active_year();

-- NO EXECUTE REVOKES HERE — deliberately, and against this repo's usual habit
-- (cf. 20260729130000_unit_assessments_anon_revoke.sql). An earlier revision
-- revoked from public + anon "for symmetry" and left a runbook step to check the
-- guard still fired. That trade is backwards:
--
--   • The revoke buys nothing. This is a `returns trigger` function, and
--     Postgres refuses to invoke one outside a trigger context ("trigger
--     functions can only be called as triggers"), so there is no direct-call
--     surface to close. It reads no tables and returns no data, so there is
--     nothing to probe either.
--   • The revoke carries risk. It is safe ONLY under the belief that Postgres
--     checks EXECUTE at CREATE TRIGGER time rather than per fire. That belief is
--     correct — but this file has already shipped one plausible-and-wrong
--     privilege assumption (see the 🚨 note above), and if it were wrong here
--     the guard would fail with 'permission denied' on every client write:
--     loud, but a total outage of a table teachers do legitimately edit.
--
-- Removing the revoke removes the failure mode instead of documenting how to
-- spot it. The RPC in SECTION 2 keeps its revokes, where they protect a real
-- callable surface.


-- ###########################################################################
-- ## RLS / GRANTS — why this migration adds neither
-- ###########################################################################
-- The standing rule is that RLS needs BOTH a table GRANT and a POLICY; a policy
-- without the grant is inert. It is recorded here as CHECKED, not skipped:
--
--   • This migration creates NO tables, so there is no new relation needing a
--     grant/policy pair. It creates one index, two functions and three triggers.
--   • `public.school_years` keeps its existing pair unchanged —
--     `school_years_write` (FOR ALL, using/with check is_school_admin(school_id))
--     plus the INSERT/UPDATE/DELETE/SELECT grants `authenticated` already holds
--     in information_schema.role_table_grants. Nothing here revokes or narrows
--     either; the triggers sit UNDERNEATH them and reject a subset of what the
--     policy still permits. That layering is intentional: policy answers "may
--     this caller touch this row", the trigger answers "may ANY caller reach
--     this state this way".
--   • Function privileges are the grant surface that DOES change, and only ONE
--     of the two new functions has one. `set_active_school_year(uuid)` revokes
--     from PUBLIC and from `anon` BY NAME (revoking from PUBLIC alone does not
--     remove the grant anon holds in its own right) and grants EXECUTE to
--     `authenticated`. `school_years_guard_active_year()` gets NO grant
--     statements at all — it is a `returns trigger` function with no callable
--     surface; see the note at the end of SECTION 3 for why revoking it would
--     add risk without adding safety.
--   • Neither function's privileges are what enforces the invariant. The index
--     is enforced by the storage engine and the triggers by the trigger
--     machinery; both are indifferent to who holds EXECUTE.
--
-- Verify after applying with the runbook's steps 2, 3 and 6.


-- ###########################################################################
-- ## APPLY-DAY RUNBOOK (ORCHESTRATOR + USER ONLY; agents never apply)
-- ###########################################################################
--
-- ── ATOMICITY: WHAT THIS FILE DOES AND DOES NOT GUARANTEE ────────────────
-- An earlier revision asserted that the runner wraps each migration file in one
-- transaction, and leaned on that for correctness. That assertion is NOT
-- established here, so the file no longer depends on it:
--
--   • The one part where statement ORDER is load-bearing — lock, duplicate
--     check, index build — is now a SINGLE `do` block, so it is atomic whether
--     or not the runner wraps anything.
--   • Everything else is INDEPENDENTLY RE-RUNNABLE: `drop … if exists`,
--     `create or replace function`, `drop trigger if exists` + `create trigger`,
--     and idempotent revoke/grant. If the file half-applies, RE-RUN IT — that
--     converges, it does not compound.
--   • The section ORDER is deliberately fail-safe for a half-apply: the RPC
--     (SECTION 2) is created BEFORE the triggers (SECTION 3). A partial apply
--     can therefore leave the RPC with no guards — which is merely today's
--     status quo — but can never leave guards with no RPC, which would make
--     is_active unwritable by any client.
--
-- If you want a hard guarantee anyway, apply inside an explicit transaction
-- rather than adding BEGIN/COMMIT to this file (a nested BEGIN under a wrapping
-- runner warns and then commits the OUTER transaction early, which is worse
-- than the problem):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 --single-transaction \
--     -f supabase/migrations/20260807120000_active_school_year_switch.sql
--
-- BEFORE — 1. ADVISORY ONLY, no longer the gate. SECTION 1 now takes the lock
--   and runs this same check inside its own `do` block, so a green result here
--   is a convenience (you find out now rather than mid-deploy), not a
--   guarantee. Zero rows = the index will build.
--   supabase db query --linked "
--     select school_id, count(*) from public.school_years
--      where is_active group by school_id having count(*) > 1;"
--
-- BEFORE — 2. know which schools are already at zero active years. This
--   migration does NOT fix them (see SECTION 1); it only stops new ones. Each
--   row returned is a school whose teachers are on the fail-open all-years read
--   and needs a set_active_school_year() call after the apply.
--   supabase db query --linked "
--     select s.id, s.name, count(sy.id) filter (where sy.is_active) as active_years,
--            count(sy.id) as total_years
--       from public.schools s
--       left join public.school_years sy on sy.school_id = s.id
--      group by s.id, s.name
--     having count(sy.id) > 0 and count(sy.id) filter (where sy.is_active) = 0;"
--
--   supabase db push
--
-- AFTER:
--   # 1. The index exists and is partial.
--   supabase db query --linked "
--     select indexdef from pg_indexes
--      where schemaname='public' and indexname='school_years_one_active_per_school';"
--
--   # 2. anon really cannot execute (the trap the unit_assessments file caught).
--   #    Expect f, t.
--   supabase db query --linked "
--     select has_function_privilege('anon','public.set_active_school_year(uuid)','execute'),
--            has_function_privilege('authenticated','public.set_active_school_year(uuid)','execute');"
--
--   # 3. search_path is public, pg_temp on BOTH functions — not bare public —
--   #    AND the security mode of each is right. THIS IS THE HIGHEST-VALUE
--   #    CHECK IN THE LIST: prosecdef must be TRUE for set_active_school_year
--   #    and FALSE for school_years_guard_active_year. A `t` on the guard means
--   #    current_user resolves to the owner and ALL THREE GUARDS ARE INERT while
--   #    every object still exists and every other check here passes.
--   supabase db query --linked "
--     select proname, prosecdef, proconfig from pg_proc
--      where proname in ('set_active_school_year','school_years_guard_active_year');"
--
--   # 4. All THREE guard triggers exist, on the right ops/columns, and the
--   #    superseded pass-1 trigger is gone. Expect exactly 3 rows, none named
--   #    school_years_guard_active_switch.
--   supabase db query --linked "
--     select tgname, pg_get_triggerdef(oid) from pg_trigger
--      where tgrelid='public.school_years'::regclass and not tgisinternal;"
--
--   # 5. THE FUNCTIONAL TESTS. Run every one of these as an AUTHENTICATED school
--   #    admin over PostgREST — NOT in the SQL editor, whose postgres role is
--   #    exempt by design and will pass all of them for the wrong reason.
--   #
--   #    READ THE ERROR TEXT, not just the fact that it "did not work". Two
--   #    different outcomes look like a rejection; only one is the guard:
--   #      • the guard fired              → the quoted message below. PASS.
--   #      • zero rows affected, NO error → RLS filtered the row BEFORE the
--   #        trigger ran, so the write was never authorised and this proves
--   #        nothing about the guard. THIS IS THE ONE THAT LOOKS LIKE SUCCESS:
--   #        a PostgREST PATCH matching no rows returns 200/204, not an error.
--   #        Re-run as a genuine school_admin of that school.
--   #
--   #    a. PATCH is_active on any row            → must fail, 'may only be changed via'
--   #    b. PATCH label on the same row           → must SUCCEED (guard is column-scoped)
--   #    c. PATCH school_id on any row            → must fail, 'school_id is immutable'
--   #    d. DELETE the school's ACTIVE year       → must fail, 'may not be deleted'
--   #    e. DELETE an INACTIVE year               → must succeed (and will cascade
--   #       its units — do this on a throwaway row only)
--   #    f. POST a new row with is_active = true  → must fail, 'may not be created already-active'
--   #    g. POST a new row with is_active = false → must succeed
--   #    h. rpc/set_active_school_year on the row from (g) → must return true
--   #    i. the same call again                   → must return false, no error
--   #    j. the same call as a NON-admin member   → 'caller is not an admin'
--   #    k. a random uuid, and a real year id from another tenant → the two must
--   #       return the SAME 'no such school year' message. If they differ, the
--   #       disclosure fix has regressed.
--
--   # 6. Provisioning still works end-to-end (the role-gate exemption). Create a
--   #    workspace through the app and confirm it lands with exactly one active
--   #    year — a failure here means the client-role list in SECTION 3 does not
--   #    match this project's actual roles.
--
--   # 6b. THE OWNERSHIP PRECONDITION BEHIND step 6. The exemption works because
--   #    a SECURITY DEFINER function runs as its OWNER, so the owner must NOT be
--   #    one of the gated client roles. Expect neither owner in
--   #    (anon, authenticated, service_role) — typically postgres.
--   supabase db query --linked "
--     select p.proname, pg_get_userbyid(p.proowner) as owner, p.prosecdef
--       from pg_proc p
--      where p.proname in ('provision_individual_workspace','create_workspace');"
--
-- ---------------------------------------------------------------------------
-- PRIVILEGED SQL BYPASS — what the GUC actually is
-- ---------------------------------------------------------------------------
-- ⚠ NAME IT HONESTLY: this is a bypass of the ENTIRE guard, not a
-- school-deletion tool. An earlier revision of this comment described it as
-- "the ops escape hatch for deleting a school", which is what it is USED for,
-- not what it PERMITS. The trigger treats the GUC itself as the authorisation
-- capability, so any principal that can set it can, in that same transaction,
-- do every single thing SECTION 3 exists to prevent: insert an already-active
-- year, flip is_active by hand, move school_id between tenants, or delete a
-- live year. "Only use it to delete a school" is a procedural convention, and
-- nothing enforces it.
--
-- WHO CAN REACH IT: only a principal that can execute arbitrary SQL in a
-- transaction — a SQL console or a direct database connection. It is NOT
-- reachable through PostgREST with an `authenticated` or service JWT, because
-- those interfaces do not expose arbitrary `set_config`. So the reachable path
-- is already-privileged access, which is why this is accepted rather than
-- closed: someone with a direct connection can drop the triggers outright.
--
-- WHAT IT IS FOR TODAY: `service_role` bypasses RLS, so it CAN delete a school;
-- the FK cascade then deletes that school's years and the guard refuses the
-- active one. Nothing in this repo does that (see the grep in SECTION 3), but
-- the operation must not be impossible for an operator:
--
--   begin;
--     select set_config('mycurricula.active_year_switch', 'rpc', true);
--     delete from public.schools where id = '<school-uuid>';
--   commit;
--
-- `is_local => true` means the setting dies with the transaction, so no session
-- keeps the capability. Never use it to flip is_active by hand —
-- set_active_school_year() is the audited path and this one writes no audit row.
--
-- THE INTENDED REPLACEMENT, so this stops being the answer: a
-- `delete_workspace()` SECURITY DEFINER RPC, owned by a non-client role and NOT
-- executable by anon/authenticated/service_role, which does the deletion and
-- its audit in one transaction and is exempt by ownership rather than by GUC.
-- Build that when the feature lands (SECTION 3's CASCADE note has the shape);
-- do not build a feature on top of this hatch.
--
-- ROLLBACK (drop ALL SIX or NONE — they form one mechanism):
--   drop trigger  if exists school_years_guard_active_insert on public.school_years;
--   drop trigger  if exists school_years_guard_active_update on public.school_years;
--   drop trigger  if exists school_years_guard_active_delete on public.school_years;
--   drop function if exists public.school_years_guard_active_year();
--   drop function if exists public.set_active_school_year(uuid);
--   drop index    if exists public.school_years_one_active_per_school;
-- Dropping the index restores the pre-existing (unconstrained) state; dropping
-- the RPC removes the only atomic switch; the triggers MUST NOT outlive the RPC
-- (they would make is_active permanently unwritable by any client — no path sets
-- the GUC), and triggers before function (Postgres refuses to drop a function a
-- trigger still references without CASCADE).
--
-- APPLICATION COUPLING: NONE TODAY. No app code writes public.school_years, and
-- the only reader is `resolveActiveSchoolYearId` (lib/planner/supabase-source.ts
-- :361), which SELECTs `is_active` and is unaffected by any object here.
-- Applying this changes nothing a teacher can see until the
-- /settings/curriculums surface described above is built. It DOES change what a
-- future writer is allowed to do — anything that creates a school year must now
-- insert it inactive and switch, and nothing may delete a live year.
-- ###########################################################################
