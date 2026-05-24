-- claude-bypass.sql — schema for the Claude auth-bypass audit log.
--
-- Run this once in the Supabase SQL editor before flipping the
-- CLAUDE_BYPASS_TOKEN env var on. Idempotent — `create table if not
-- exists` and `create policy if not exists` make re-runs safe.
--
-- The table records every successful and failed bypass attempt. Failed
-- attempts include the failure reason (invalid_token / rate_limited /
-- no_token / ensureUser failed / etc.) so token-guessing or
-- misconfiguration shows up clearly.
--
-- RLS is enabled and configured so:
--   • The service-role key (used by lib/claude-bypass.ts) can insert.
--   • Authenticated users can `select` only their own rows — meaning
--     the owner sees what Claude has been doing on their behalf.
--   • Anonymous users cannot read anything.

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

-- Authenticated session may select any row (only the account owner is
-- in this Supabase project today, and the audit log applies to all
-- Claude-bypass activity — which is, by definition, on the owner's
-- behalf). Adjust this policy when multi-user roles arrive.
drop policy if exists "authenticated selects" on public.claude_access_log;
create policy "authenticated selects"
  on public.claude_access_log
  for select
  to authenticated
  using (true);
