-- ###########################################################################
-- ## Teacher theme preferences (cross-device sync for the 3 visual axes)
-- ###########################################################################
-- WHAT THIS ADDS
-- A per-teacher row holding the three theme axes the app currently persists to
-- localStorage only (lib/theme.tsx): the app-wide color `theme`, the card
-- `theme_style`, and the subject-saturation `theme_palette`. Persisting them
-- server-side lets a teacher's chosen look FOLLOW them across devices/browsers,
-- the same way teacher_ui_state already syncs expansion/filters/active view
-- (M1:793 header: "server-side so … follow the teacher across devices").
--
-- DORMANT BY DEFAULT — like the Teach + planner seams, this is wired but unused
-- until the client opt-in flag flips. lib/theme-sync.ts no-ops unless
-- NEXT_PUBLIC_THEME_SYNC=1 (and a real Supabase project is configured), so this
-- table sits empty in prod today and the localStorage path remains the source of
-- immediacy. Authoring the migration does NOT deploy it: `supabase db push` is a
-- separate, deliberate step the operator runs.
--
-- WHY A DEDICATED TYPED TABLE (not teacher_ui_state.appearance_settings)
-- teacher_ui_state carries an `appearance_settings jsonb` blob (M1:805), but the
-- three theme axes are small, closed enumerations. Discrete text columns with
-- CHECK allowlists give DB-level validation that MIRRORS the client allowlists in
-- lib/theme.tsx / lib/theme-init.tsx — defense in depth in the same spirit as the
-- existing CHECK/trigger hardening (e.g. widget_type_nonempty_chk). A future pass
-- may consolidate appearance_settings into this table; that is a deliberate
-- behavior change, not smuggled in here.
--
-- IDEMPOTENT + ADDITIVE — safe to run on a live database and safe to re-run:
--   * table     → CREATE TABLE IF NOT EXISTS
--   * policy    → DROP POLICY IF EXISTS … then CREATE POLICY
--   * trigger   → DROP TRIGGER IF EXISTS … then CREATE TRIGGER
--   * privilege → REVOKE / GRANT (idempotent by nature)
-- It creates one new table and touches no existing row.
--
-- Cross-reference for the schema this depends on:
--   M1 = 20260518102823_initial_schema.sql  (teachers, set_updated_at(),
--        teacher_ui_state — the per-teacher-state template this mirrors).
--   20260607130000_codify_claude_admin_rls.sql — the owner/admin `claude_admin_all`
--        FOR ALL gate that every data/config table carries; reproduced here so the
--        new table matches the live posture (support/backfill access for the
--        account owner only; for any other user is_claude_admin() is false).
--
-- ── ALLOWLIST PARITY (READ BEFORE EDITING) ─────────────────────────────────
-- The three CHECK lists below MUST stay in lockstep with lib/theme.tsx
-- (APP_THEMES + the "system" sentinel, STYLE_VALUES, PALETTE_VALUES) and the
-- mirrored inline allowlists in lib/theme-init.tsx. If they drift, a value the
-- client accepts and the DB rejects (or vice-versa) fails a write SILENTLY at the
-- sync boundary. The client treats the localStorage value as authoritative and
-- swallows remote errors, so a CHECK mismatch would NOT surface as a user-visible
-- error — it would just stop syncing. Keep the three lists identical across all
-- three files.
--   theme         : paper, cloud, night, mint, sky, blossom, system
--   theme_style   : quiet, calm, vivid
--   theme_palette : normal, highlight
-- 'system' is a STORED sentinel (resolved to night/paper at runtime); it is a
-- legal persisted value, so it is in the allowlist.
-- ###########################################################################

create table if not exists public.teacher_preferences (
  teacher_id    uuid primary key references public.teachers(id) on delete cascade,
  -- The stored theme CHOICE — a concrete AppTheme or the 'system' sentinel
  -- (resolved to night/paper at paint time by the client). Matches
  -- lib/theme.tsx DEFAULT_THEME = 'paper'.
  theme         text not null default 'paper'
    check (theme in ('paper', 'cloud', 'night', 'mint', 'sky', 'blossom', 'system')),
  -- Card-treatment axis. App default is 'vivid' (lib/theme.tsx DEFAULT_STYLE).
  theme_style   text not null default 'vivid'
    check (theme_style in ('quiet', 'calm', 'vivid')),
  -- Subject-saturation axis. App default is 'highlight' (DEFAULT_PALETTE).
  theme_palette text not null default 'highlight'
    check (theme_palette in ('normal', 'highlight')),
  updated_at    timestamptz not null default now()
);

-- updated_at maintenance — the same shared BEFORE UPDATE trigger every other
-- table uses (M1:166 set_updated_at(); applied per-table at M1:944-971).
drop trigger if exists trg_teacher_preferences_updated_at on public.teacher_preferences;
create trigger trg_teacher_preferences_updated_at
  before update on public.teacher_preferences
  for each row execute function set_updated_at();

-- ── Row-Level Security ─────────────────────────────────────────────────────
-- Strictly the owning teacher's row, mirroring teacher_ui_state_owner (M1:1554)
-- verbatim: teacher_id IS the auth uid (teachers.id = auth.uid(); see
-- teachers_update_self M1:1229 and provision_individual_workspace, which inserts
-- teachers.id = p_uid). A teacher may read/insert/update/delete ONLY their own
-- preferences row. No anon access (no anon policy + the grants below exclude
-- anon), so an unauthenticated session sees nothing.
alter table public.teacher_preferences enable row level security;

drop policy if exists teacher_preferences_owner on public.teacher_preferences;
create policy teacher_preferences_owner on public.teacher_preferences for all using (
  teacher_id = auth.uid()
) with check (
  teacher_id = auth.uid()
);

-- Owner/admin escape hatch, identical to the `claude_admin_all` FOR ALL gate
-- every data/config table carries (20260607130000). It is PERMISSIVE — OR'd with
-- the owner policy above — and widens access ONLY for the single account-owner
-- identity public.is_claude_admin() returns true for (JWT email == account
-- owner); for every other authenticated user the predicate is false and this
-- grants nothing. Kept consistent so support/backfill reach this table like the
-- rest. (public.is_claude_admin() is defined in
-- 20260607120000_claude_access_log_reconcile.sql, which sorts before this file.)
drop policy if exists "claude_admin_all" on public.teacher_preferences;
create policy "claude_admin_all"
  on public.teacher_preferences
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- ── Privilege grants ───────────────────────────────────────────────────────
-- The owner RLS policy is the real gate; grants scope which roles may attempt an
-- operation at all. `authenticated` gets the table DML the owner policy permits
-- (select/insert/update/delete on the caller's own row). `anon` is explicitly
-- revoked — an unauthenticated visitor never reads or writes preferences (and
-- auth.uid() would be NULL, so the policy would deny it regardless; the revoke
-- makes the intent explicit and removes any reliance on a default ACL). REVOKE
-- then GRANT is idempotent.
revoke all on public.teacher_preferences from anon;
grant select, insert, update, delete on public.teacher_preferences to authenticated;

-- ###########################################################################
-- End of teacher preferences.
-- ###########################################################################
