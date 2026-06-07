-- ###########################################################################
-- ## audit_log — tighten the owner gate to APPEND-ONLY (SELECT-only) reads.
-- ###########################################################################
-- WHY THIS MIGRATION EXISTS
-- public.audit_log is an APPEND-ONLY audit trail: §4.2 of the planning doc
-- ("Append-only; every mutation writes one row"), and in the live DB the ONLY
-- write path is the SECURITY DEFINER function public.log_audit_event() — every
-- product mutation funnels its audit row through that RPC, which bypasses RLS.
-- No application code writes audit_log via an authenticated (non-service-role,
-- non-RPC) client (grepped lib/ + app/ + components/ on 2026-06-07: zero direct
-- writes), and prosecdef=true on log_audit_event() was confirmed live the same
-- day.
--
-- THE TAMPER VECTOR THIS CLOSES
-- The prior migration 20260607130000_codify_claude_admin_rls.sql codified the
-- live-only `claude_admin_all` policy (FOR ALL, authenticated, gated by
-- public.is_claude_admin()) onto audit_log — FAITHFULLY, as a pure no-semantic-
-- change reconciliation of the live posture — and in its header explicitly
-- FLAGGED audit_log as the "ONE FLAGGED EXCEPTION": because audit_log is an
-- append-only trail, a FOR-ALL grant lets an authenticated OWNER session
-- UPDATE or DELETE (forge / erase) audit rows. An independent review (Codex)
-- flagged this exact vector. Tightening it was deliberately deferred to a
-- separate follow-up rather than smuggled into that codification PR. This is
-- that follow-up.
--
-- WHY THERE IS NO FUNCTIONAL LOSS
-- Downgrading the owner's access from FOR ALL to SELECT removes only the
-- authenticated-session UPDATE/DELETE/INSERT grant — which nothing legitimately
-- uses (writes go through the SECURITY DEFINER RPC, reads are all this app
-- needs). The account owner retains FULL read/write access to audit_log via the
-- service role and the Supabase SQL editor (table owner), both of which bypass
-- RLS entirely. So owner-scoping the authenticated reads loses no capability
-- while closing the in-session tamper vector. This mirrors the posture already
-- applied to public.claude_access_log in 20260607120000 (claude_admin_read,
-- SELECT-only).
--
-- WHAT IS AND IS NOT TOUCHED
--   • TOUCHED: only public.audit_log. The `claude_admin_all` FOR-ALL policy is
--     replaced with a SELECT-only `claude_admin_read` policy (same owner gate).
--   • NOT TOUCHED: the pre-existing `audit_log_read` policy (SELECT-only, gated
--     by is_grade_admin()/is_school_admin()) is left intact — it is already a
--     correctly-scoped read-only policy (grade/school admins reading their own
--     scope) and is NOT a tamper vector, so it must survive. After this
--     migration, audit_log SELECT is permitted by EITHER that admin policy OR
--     the owner policy (RLS policies are permissive / OR'd), and NO policy grants
--     INSERT/UPDATE/DELETE to any authenticated role — exactly the append-only
--     posture intended.
--   • NOT TOUCHED: the other 34 tables carrying `claude_admin_all` (the product's
--     DATA/CONFIG tables) keep FOR ALL — the account owner legitimately needs
--     full read/write there for support and backfills. That distinction is the
--     whole point of the "ONE FLAGGED EXCEPTION" in 20260607130000.
--
-- DEPENDENCY ORDER (migrations run in filename order)
--   • public.audit_log is created in 20260518102823_initial_schema.sql.
--   • public.is_claude_admin() is created in 20260607120000_claude_access_log_
--     reconcile.sql.
--   • 20260607130000_codify_claude_admin_rls.sql adds `claude_admin_all` to
--     audit_log. All three sort BEFORE this file, so on a fresh `db reset` this
--     migration runs last and nets a SELECT-only owner read — the correct end
--     state.
--
-- IDEMPOTENCY / SAFETY
--   • `enable row level security` is a no-op when RLS is already on (it is, live).
--   • `drop policy if exists` for both the old FOR-ALL name and the new SELECT
--     name makes this safe to re-run and order-independent w.r.t. 20260607130000:
--     re-running drops the just-created `claude_admin_read` and recreates it; on
--     prod it drops the live `claude_admin_all` and installs the strict read.
--   • This migration does NOT touch `audit_log_read`, so a re-run never disturbs
--     the admin read path.
-- ###########################################################################

-- RLS is already enabled on audit_log (20260518102823 §RLS); assert idempotently
-- so this migration is self-contained on a table that somehow had it disabled.
alter table public.audit_log enable row level security;

-- Remove the FOR-ALL owner escape hatch (the tamper vector). Also drop the new
-- SELECT-only name first so the create below is a clean re-create on re-run.
-- (audit_log_read is intentionally NOT dropped — see header "WHAT IS AND IS NOT
-- TOUCHED": it is a correctly-scoped admin read policy, not a tamper vector.)
drop policy if exists "claude_admin_all" on public.audit_log;
drop policy if exists "claude_admin_read" on public.audit_log;

-- Owner-only, SELECT-only read. Same gate as the retired FOR-ALL policy
-- (public.is_claude_admin()), but it can no longer mutate audit rows. The owner
-- keeps full read/write via the service role / SQL editor (both bypass RLS).
create policy "claude_admin_read"
  on public.audit_log
  for select
  to authenticated
  using (public.is_claude_admin());
