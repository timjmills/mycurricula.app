-- ###########################################################################
-- ## teachers.onboarded_at + mark_onboarded() RPC (onboarding activation gate)
-- ###########################################################################
-- Adds the server-side "has this teacher completed onboarding?" signal the v2
-- first-run redirect reads (lib/onboarding-v2-remote.ts → isOnboardedRemote),
-- plus the sanctioned write that stamps it (markOnboardedRemote →
-- mark_onboarded()). Until this file is hand-applied the column does not exist,
-- so the client SELECT errors → isOnboardedRemote returns null → NO teacher is
-- ever redirected: shipping the client code ahead of this migration is a no-op
-- (the activation gate's safety invariant #1).
--
-- WHY AN RPC, NOT A CLIENT UPDATE: 20260604140000_security_hardening.sql
-- (FINDING #2) column-gates the `authenticated` UPDATE privilege on teachers to
-- exactly (display_name, default_view, completion_privacy) — a browser
-- `update teachers set onboarded_at = …` would be denied by column privilege.
-- mark_onboarded() is SECURITY DEFINER and keys off auth.uid(), so it writes the
-- caller's OWN row (and only that row) without widening the client's column
-- grant. teachers.id IS the auth uid (M1:218 references auth.users(id)), so
-- `where id = auth.uid()` is the caller's row by construction.
--
-- ADDITIVE + IDEMPOTENT (safe on a live DB, safe to re-run):
--   * column   → ADD COLUMN IF NOT EXISTS.
--   * backfill → UPDATE … WHERE onboarded_at IS NULL (re-run touches nothing).
--   * function → CREATE OR REPLACE FUNCTION.
--   * grants   → REVOKE-then-GRANT.
--
-- SEARCH_PATH HARDENING: `set search_path = public, pg_temp` with pg_temp pinned
-- LAST — the posture 20260726120000_rename_workspace.sql established today. Without
-- it PostgreSQL searches the caller's temp schema FIRST for relation lookup, so a
-- session able to create a temp `teachers` could shadow the real table inside this
-- SECURITY DEFINER body. Listing pg_temp last removes that implicit precedence.
--
-- INERT UNTIL ENABLED: no CI applies migrations, and the client seam that reads /
-- writes this column (lib/onboarding-v2-remote.ts) is gated on
-- isPlannerSupabaseConfigured() (NEXT_PUBLIC_PLANNER_USE_SUPABASE=1 + a real URL).
-- So this file changes nothing until it is hand-applied.
--
-- Cross-references:
--   M1  = 20260518102823_initial_schema.sql        (teachers table, :217-230;
--         teachers.id references auth.users(id); set_updated_at trigger :946).
--   MH2 = 20260604140000_security_hardening.sql     (FINDING #2 — the column-level
--         UPDATE grant that makes this RPC necessary, :65-67).
--   MW  = 20260726120000_rename_workspace.sql       (the `public, pg_temp` pin +
--         SECURITY DEFINER + null-uid guard + REVOKE/GRANT posture mirrored here).
-- ###########################################################################


-- ###########################################################################
-- ## SECTION 0+1 — onboarded_at column + ONE-SHOT backfill (atomic pair)
-- ###########################################################################
-- Nullable timestamptz: NULL means "has not completed onboarding", a non-null
-- stamp records WHEN they finished. No default — a brand-new teacher row starts
-- NULL (needs onboarding); mark_onboarded() sets it exactly once.
--
-- The backfill runs ONLY in the same invocation that ADDS the column: existing
-- teachers predate the gate and must never be bounced into the first-run
-- wizard, but a bare `where onboarded_at is null` on a RE-RUN would silently
-- stamp genuinely-new post-migration teachers and suppress their wizard
-- forever (§4a round-1 finding). Column-existence is the "have we run before"
-- discriminator, making the whole migration safely re-runnable: second run =
-- complete no-op.
do $$
begin
  -- Serialize concurrent apply attempts (two sessions could both observe the
  -- column as absent and race the ALTER). Transaction-scoped; auto-released.
  perform pg_advisory_xact_lock(hashtext('20260727120000_teacher_onboarded_at'));
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'teachers'
      and column_name = 'onboarded_at'
  ) then
    alter table public.teachers add column onboarded_at timestamptz;
    update public.teachers
       set onboarded_at = now()
     where onboarded_at is null;
  end if;
end $$;


-- ###########################################################################
-- ## SECTION 2 — mark_onboarded(p_expected_teacher) RPC (stamp own row)
-- ###########################################################################
-- Idempotent: coalesce(onboarded_at, now()) stamps only the FIRST time and
-- returns the existing stamp on every later call, so finishing the wizard twice
-- (or a retried fire-and-forget write) never moves the timestamp. Fail-closed on
-- a null caller, a missing teacher row, AND an identity mismatch: the caller
-- passes the uid it BELIEVES it is stamping (read client-side before the call),
-- and the RPC rejects unless that equals auth.uid() — closing the client-side
-- TOCTOU where an account switch between the client's getUser() and this call
-- would otherwise stamp the NEW session's row on the OLD identity's behalf
-- (§4a round-2 finding). Returns the resolved onboarded_at.
create or replace function mark_onboarded(
  p_expected_teacher uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_ts  timestamptz;
begin
  -- ── FAIL CLOSED: SECURITY DEFINER bypasses RLS, so it must never run
  --    unauthenticated (a null uid would target no row / a wrong row). ──────
  if v_uid is null then
    raise exception 'mark_onboarded: requires an authenticated caller';
  end if;
  if p_expected_teacher is null or v_uid is distinct from p_expected_teacher then
    raise exception 'mark_onboarded: caller identity does not match the expected teacher';
  end if;

  -- Stamp only if unset (idempotent), keyed to the caller's own row. The
  -- column grant does not apply to a SECURITY DEFINER body, so this writes
  -- onboarded_at even though the client role cannot (see the header).
  update teachers
     set onboarded_at = coalesce(onboarded_at, now())
   where id = v_uid
  returning onboarded_at into v_ts;

  -- No teachers row for this uid (not provisioned) → fail closed rather than
  -- returning a null "success".
  if not found then
    raise exception 'mark_onboarded: no teacher row for caller %', v_uid;
  end if;

  return v_ts;
end;
$$;


-- ###########################################################################
-- ## SECTION 3 — RPC EXECUTE GRANT (authenticated only; never anon/public)
-- ###########################################################################
-- The RPC guards a null uid and writes only the caller's own row, so it is
-- granted to `authenticated` and revoked from public/anon. REVOKE-then-GRANT is
-- idempotent (mirrors the wave's grant posture).
revoke execute on function mark_onboarded(uuid) from public;
revoke execute on function mark_onboarded(uuid) from anon;
grant  execute on function mark_onboarded(uuid) to authenticated;


-- ###########################################################################
-- End of teacher_onboarded_at.
-- ###########################################################################
