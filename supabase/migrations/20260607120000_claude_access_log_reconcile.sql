-- ###########################################################################
-- ## claude_access_log — codify + reconcile the Claude-bypass audit table.
-- ###########################################################################
-- WHY THIS MIGRATION EXISTS
-- The Claude-bypass audit table (public.claude_access_log) was historically
-- created BY HAND — pasting docs/claude-bypass.sql into the Supabase SQL editor —
-- and was NEVER part of a migration. That is how the LIVE table silently DRIFTED:
-- it ended up with columns `success`/`path` (the app inserts `ok`/`pathname`), a
-- NOT NULL `reason` (the app logs reason=NULL on a successful bypass), and ZERO
-- RLS policies. Result: lib/claude-bypass.ts → audit() recorded 0 rows — for both
-- success and failure paths — until the table was reconciled by hand 2026-06-07.
--
-- This migration codifies the CANONICAL shape so it is reproducible and can no
-- longer drift unnoticed. It handles ALL three starting states idempotently:
--   • FRESH db (no table)            → creates the canonical table.
--   • ALREADY-CANONICAL (prod today) → every statement is a no-op.
--   • OLD DRIFTED shape (success/    → repaired in place (guarded renames +
--     path, reason NOT NULL)            reason DROP NOT NULL) before the indexes
--                                        and policies, so it never errors on `ok`.
--
-- WHAT audit() WRITES (lib/claude-bypass.ts), via the SERVICE-ROLE admin client:
--   { ok, pathname, user_agent, reason, created_at }
--   • success → audit({ ok:true,  pathname, userAgent })  → reason = NULL
--   • failure → audit({ ok:false, ..., reason })          → reason = text
--
-- SCOPE NOTES
--   • is_claude_admin() also exists live-only (never migrated). It is codified
--     here because the read policy below depends on it and no earlier migration
--     defines it. The `claude_admin_all` policies on the OTHER infra tables
--     (teachers, daily_notes, audit_log, …) remain live-only — a separate
--     follow-up, out of scope here.
--   • The live prod table additionally carries vestigial columns (method, ip,
--     user_email, extra) from the historical drift; they are unused by the app
--     and intentionally NOT reproduced — a fresh db gets the clean canonical
--     shape; prod keeps the harmless extras.
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- is_claude_admin() — owner gate (JWT email == the account owner). Mirrors the
-- live hand-applied function verbatim. SECURITY DEFINER + empty search_path per
-- the project's RLS-helper convention. create-or-replace == idempotent.
-- ---------------------------------------------------------------------------
create or replace function public.is_claude_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'timothyjamesmills@gmail.com'
$$;

-- ---------------------------------------------------------------------------
-- 1. Create the canonical table when absent (fresh db). `reason` NULLABLE
--    (success rows carry no reason); `pathname` NOT NULL (always supplied).
-- ---------------------------------------------------------------------------
create table if not exists public.claude_access_log (
  id          bigserial   primary key,
  created_at  timestamptz not null default now(),
  ok          boolean     not null,
  pathname    text        not null,
  user_agent  text,
  reason      text
);

-- ---------------------------------------------------------------------------
-- 2. Repair an EXISTING table still on the old hand-created shape. Every step is
--    guarded → a no-op on a fresh or already-canonical table, and the renames
--    run ONLY when the old column exists and the new one does not (ALTER ...
--    RENAME COLUMN has no IF EXISTS form). This guarantees `ok`/`pathname` exist
--    before the indexes/policies below, so the migration never errors on a
--    drifted db.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='claude_access_log'
               and column_name='success')
     and not exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='claude_access_log'
               and column_name='ok')
  then execute 'alter table public.claude_access_log rename column success to ok'; end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='claude_access_log'
               and column_name='path')
     and not exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='claude_access_log'
               and column_name='pathname')
  then execute 'alter table public.claude_access_log rename column path to pathname'; end if;
end $$;

-- A drifted table may predate user_agent and/or reason; add them (no-op when
-- present) so the next statement can't error on a missing column. Then the
-- load-bearing fix: reason must be NULLABLE or every SUCCESSFUL-bypass insert
-- (reason=NULL) fails.
alter table public.claude_access_log add column if not exists user_agent text;
alter table public.claude_access_log add column if not exists reason text;
alter table public.claude_access_log alter column reason drop not null;

-- ---------------------------------------------------------------------------
-- 3. Indexes — "what has Claude done lately" + a partial failed-attempt index
--    (token-guess floods). `ok` is guaranteed to exist by step 2.
-- ---------------------------------------------------------------------------
create index if not exists claude_access_log_created_at_idx
  on public.claude_access_log (created_at desc);
create index if not exists claude_access_log_failed_idx
  on public.claude_access_log (ok, created_at desc) where ok = false;

-- ---------------------------------------------------------------------------
-- 4. RLS — service-role writes; OWNER-ONLY *reads* (SELECT) via is_claude_admin().
--
--    Reads are SELECT-only (not FOR ALL): this is an append-only audit log, so an
--    app-side owner/Claude session must never be able to UPDATE/DELETE/forge rows
--    — only the server-side service role writes. This REPLACES the original
--    `authenticated selects USING (true)`, which — now that individual
--    provisioning (multi-tenant) is live — would expose the owner's Claude
--    telemetry (paths, user-agents, failure/token-guess reasons) to EVERY
--    authenticated teacher. There is no app read path (only the service-role
--    INSERT); the owner reads via the SQL editor (table owner, bypasses RLS), so
--    owner-scoping the reads loses no function. (anon/authenticated hold no table
--    grants today, so this policy is also the durable control if a grant is ever
--    added.)
-- ---------------------------------------------------------------------------
alter table public.claude_access_log enable row level security;

-- Make the policy set DETERMINISTIC. RLS policies are permissive (OR'd), so a
-- stale broad SELECT policy left under ANY name (a manual paste's
-- `authenticated selects`, the interim `claude_admin_all`, or anything else)
-- would silently re-open the cross-tenant leak even after the strict one is
-- added. So drop EVERY existing policy on the table first, then create exactly
-- the two canonical ones. Atomic within the migration's transaction (no exposed
-- window). Idempotent: a re-run drops the two just made and recreates them.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'claude_access_log'
  loop
    execute format('drop policy if exists %I on public.claude_access_log', pol.policyname);
  end loop;
end $$;

-- service_role bypasses RLS, so this is belt-and-suspenders — but it documents
-- intent (only the service role writes this table).
create policy "service_role inserts"
  on public.claude_access_log
  for insert
  to service_role
  with check (true);

create policy "claude_admin_read"
  on public.claude_access_log
  for select
  to authenticated
  using (public.is_claude_admin());

-- ---------------------------------------------------------------------------
-- 5. Refresh PostgREST's schema cache. The app inserts via supabase-js →
--    PostgREST, which caches the column list; after any rename in step 2 the
--    cache must reload or app inserts keep failing on the renamed columns.
--    Harmless when no PostgREST is listening (fresh local db).
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
