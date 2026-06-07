-- claude-bypass.sql — schema for the Claude auth-bypass audit log.
--
-- CANONICAL SOURCE: this table is codified in
-- supabase/migrations/20260607120000_claude_access_log_reconcile.sql — that
-- migration is the executable source of truth (it creates the table on a fresh
-- DB, REPAIRS a table that drifted to the old success/path shape, sets RLS, and
-- reloads PostgREST). Apply it with `supabase db push`.
--
-- This file mirrors that migration's CLEAN-CREATE path for reference and is
-- self-contained on a FRESH database (it defines is_claude_admin() below). It
-- does NOT repair an already-drifted table — use `supabase db push` for that.
--
-- The table records every successful and failed bypass attempt. Failed
-- attempts include the failure reason (invalid_token / rate_limited /
-- no_token / ensureUser failed / etc.) so token-guessing or
-- misconfiguration shows up clearly.
--
-- RLS is enabled and configured so:
--   • The service-role key (used by lib/claude-bypass.ts) can insert.
--   • Only the account OWNER may read — the `claude_admin_read` policy gates
--     SELECT on `is_claude_admin()` (JWT email == owner). SELECT-only (not the
--     FOR ALL used elsewhere): this is an append-only audit log, so app-side
--     sessions must never UPDATE/DELETE/forge rows — only the service role writes.
--   • Other authenticated users and anonymous users read nothing — important
--     now that multi-tenant (individual) provisioning is live.

create table if not exists public.claude_access_log (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  ok          boolean     not null,
  pathname    text        not null,
  user_agent  text,
  reason      text
);

-- Most useful index for the owner's "what has Claude done lately" view.
create index if not exists claude_access_log_created_at_idx
  on public.claude_access_log (created_at desc);

-- Failed-attempt index helps spot token-guess floods.
create index if not exists claude_access_log_failed_idx
  on public.claude_access_log (ok, created_at desc) where ok = false;

alter table public.claude_access_log enable row level security;

-- The service role inserts. Other server-side helpers should NOT use
-- this table — keep writes scoped to the bypass module.
drop policy if exists "service_role inserts" on public.claude_access_log;
create policy "service_role inserts"
  on public.claude_access_log
  for insert
  to service_role
  with check (true);

-- is_claude_admin() — owner gate (JWT email == owner). Defined here so this file
-- is self-contained on a fresh DB; mirrors the live function and the migration.
create or replace function public.is_claude_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'timothyjamesmills@gmail.com'
$$;

-- Reads are OWNER-ONLY and SELECT-only. `is_claude_admin()` returns true iff the
-- caller's JWT email is the account owner. SELECT-only (not FOR ALL) keeps this
-- append-only audit log tamper-proof from app-side credentials — only the
-- service role writes. This REPLACES the original `authenticated selects
-- USING (true)`, which would expose the owner's Claude telemetry to every
-- authenticated teacher now that multi-tenant provisioning is live.
drop policy if exists "authenticated selects" on public.claude_access_log;
drop policy if exists "claude_admin_all" on public.claude_access_log;
drop policy if exists "claude_admin_read" on public.claude_access_log;
create policy "claude_admin_read"
  on public.claude_access_log
  for select
  to authenticated
  using (public.is_claude_admin());
