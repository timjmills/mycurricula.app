-- ###########################################################################
-- ## Codify the live-only `claude_admin_all` RLS policies (owner/admin gate).
-- ###########################################################################
-- WHY THIS MIGRATION EXISTS
-- Across many infra/data tables the LIVE database carries an identical RLS
-- policy named `claude_admin_all` — a FOR ALL owner/admin escape hatch gated by
-- public.is_claude_admin(). Those policies were applied BY HAND in the Supabase
-- SQL editor and live in NO committed migration (the drift recorded in the
-- project's CLAUDE memory, and called out as a deferred follow-up in the SCOPE
-- NOTES of 20260607120000_claude_access_log_reconcile.sql). Because they are
-- live-only, a `supabase db reset` / fresh environment would silently come up
-- WITHOUT them, and prod keeps drifting from the migration history.
--
-- This migration codifies those policies FAITHFULLY so they are reproducible.
-- It is a pure reconciliation: NO semantic change. Each policy is reproduced
-- with the exact command (FOR ALL), role (authenticated), permissive mode, and
-- USING / WITH CHECK expression (public.is_claude_admin()) observed live on
-- 2026-06-07 — verified by grouping all 35 live `claude_admin_all` policies,
-- which collapse to a single identical definition.
--
-- WHY THESE STAY `FOR ALL` (not downgraded to SELECT)
-- 20260607120000 deliberately made the claude_access_log read SELECT-only,
-- because that table is an APPEND-ONLY audit log no session may mutate. That
-- reasoning is specific to the audit log and does NOT apply here: these are the
-- product's DATA/CONFIG tables (schools, teachers, units, lessons, …) where the
-- account owner/admin legitimately needs full read/write for support and
-- backfills. So they are codified AS-IS — FOR ALL — exactly as live.
--
-- ONE FLAGGED EXCEPTION — `audit_log`: it IS an append-only audit trail (written
-- only by the SECURITY DEFINER log_audit_event() fn; verified no app code writes
-- it via an authenticated client), so FOR-ALL admin access is a genuine tamper
-- vector: an authenticated owner session could UPDATE/DELETE audit rows. (The
-- account owner keeps full access via the service role regardless.) An
-- independent review (Codex) flagged this. It is codified AS-IS here to keep this
-- migration a pure, no-semantic-change reconciliation of the LIVE posture;
-- tightening audit_log to append-only (SELECT-only, like claude_access_log) is a
-- DELIBERATE behavior change tracked as a separate follow-up — not smuggled into
-- a codification PR.
--
-- SECURITY NOTE — these are PERMISSIVE policies, OR'd with each table's normal
-- tenant policies. They WIDEN access only for the single owner identity that
-- public.is_claude_admin() returns true for (JWT email == the account owner);
-- for every other authenticated user the predicate is false and the policy
-- grants nothing. This codifies the live posture verbatim; it neither widens
-- nor narrows it.
--
-- DEPENDENCY ORDER (migrations run in filename order)
--   • public.is_claude_admin() is created in 20260607120000_claude_access_log_
--     reconcile.sql (which sorts before this file), so the predicate resolves.
--   • All 35 target tables are created in 20260518102823_initial_schema.sql, so
--     every `alter table` / `create policy` below has its relation present.
--
-- IDEMPOTENCY
--   • `enable row level security` is a no-op when RLS is already on (it is, on
--     all 35 tables live).
--   • Each policy is dropped-if-exists then recreated, so a re-run is safe and
--     the statement is a no-op on prod (which already holds the identical
--     policy). Drop-then-create also self-heals any future hand-edit back to
--     this canonical definition.
--
-- SCOPE — claude_access_log is intentionally EXCLUDED: its policies
-- (claude_admin_read + "service_role inserts") are already codified in
-- 20260607120000 and are NOT named claude_admin_all. No other drift exists:
-- every other live policy name resolves to a `create policy` in an earlier
-- migration.
-- ###########################################################################

-- Each table below: ensure RLS is on (idempotent), then drop+recreate the
-- canonical `claude_admin_all` policy. Tables are in alphabetical order to make
-- the set easy to diff against the live catalog. The policy body is identical
-- for every table — the owner/admin FOR ALL gate — so the only thing that
-- varies line to line is the table name.

-- audit_log — see header "ONE FLAGGED EXCEPTION": FOR-ALL is a tamper vector on
-- this audit trail; codified as-is (faithful to live); append-only hardening is a
-- tracked follow-up, not done here.
alter table public.audit_log enable row level security;
drop policy if exists "claude_admin_all" on public.audit_log;
create policy "claude_admin_all"
  on public.audit_log
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- comment_reads
alter table public.comment_reads enable row level security;
drop policy if exists "claude_admin_all" on public.comment_reads;
create policy "claude_admin_all"
  on public.comment_reads
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- comments
alter table public.comments enable row level security;
drop policy if exists "claude_admin_all" on public.comments;
create policy "claude_admin_all"
  on public.comments
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- completion_status
alter table public.completion_status enable row level security;
drop policy if exists "claude_admin_all" on public.completion_status;
create policy "claude_admin_all"
  on public.completion_status
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- coverage_snapshots
alter table public.coverage_snapshots enable row level security;
drop policy if exists "claude_admin_all" on public.coverage_snapshots;
create policy "claude_admin_all"
  on public.coverage_snapshots
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- daily_notes
alter table public.daily_notes enable row level security;
drop policy if exists "claude_admin_all" on public.daily_notes;
create policy "claude_admin_all"
  on public.daily_notes
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- day_events
alter table public.day_events enable row level security;
drop policy if exists "claude_admin_all" on public.day_events;
create policy "claude_admin_all"
  on public.day_events
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- edit_undo_stack
alter table public.edit_undo_stack enable row level security;
drop policy if exists "claude_admin_all" on public.edit_undo_stack;
create policy "claude_admin_all"
  on public.edit_undo_stack
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- event_day_order_overrides
alter table public.event_day_order_overrides enable row level security;
drop policy if exists "claude_admin_all" on public.event_day_order_overrides;
create policy "claude_admin_all"
  on public.event_day_order_overrides
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- extra_lesson_events
alter table public.extra_lesson_events enable row level security;
drop policy if exists "claude_admin_all" on public.extra_lesson_events;
create policy "claude_admin_all"
  on public.extra_lesson_events
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- grade_framework_assignments
alter table public.grade_framework_assignments enable row level security;
drop policy if exists "claude_admin_all" on public.grade_framework_assignments;
create policy "claude_admin_all"
  on public.grade_framework_assignments
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- grade_levels
alter table public.grade_levels enable row level security;
drop policy if exists "claude_admin_all" on public.grade_levels;
create policy "claude_admin_all"
  on public.grade_levels
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- master_core_lesson_events
alter table public.master_core_lesson_events enable row level security;
drop policy if exists "claude_admin_all" on public.master_core_lesson_events;
create policy "claude_admin_all"
  on public.master_core_lesson_events
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- personal_core_lesson_event_copies
alter table public.personal_core_lesson_event_copies enable row level security;
drop policy if exists "claude_admin_all" on public.personal_core_lesson_event_copies;
create policy "claude_admin_all"
  on public.personal_core_lesson_event_copies
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- recurrence_instance_overrides
alter table public.recurrence_instance_overrides enable row level security;
drop policy if exists "claude_admin_all" on public.recurrence_instance_overrides;
create policy "claude_admin_all"
  on public.recurrence_instance_overrides
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- recurrence_patterns
alter table public.recurrence_patterns enable row level security;
drop policy if exists "claude_admin_all" on public.recurrence_patterns;
create policy "claude_admin_all"
  on public.recurrence_patterns
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- resources
alter table public.resources enable row level security;
drop policy if exists "claude_admin_all" on public.resources;
create policy "claude_admin_all"
  on public.resources
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- saved_exports
alter table public.saved_exports enable row level security;
drop policy if exists "claude_admin_all" on public.saved_exports;
create policy "claude_admin_all"
  on public.saved_exports
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- school_admins
alter table public.school_admins enable row level security;
drop policy if exists "claude_admin_all" on public.school_admins;
create policy "claude_admin_all"
  on public.school_admins
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- school_years
alter table public.school_years enable row level security;
drop policy if exists "claude_admin_all" on public.school_years;
create policy "claude_admin_all"
  on public.school_years
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- schools
alter table public.schools enable row level security;
drop policy if exists "claude_admin_all" on public.schools;
create policy "claude_admin_all"
  on public.schools
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- standards
alter table public.standards enable row level security;
drop policy if exists "claude_admin_all" on public.standards;
create policy "claude_admin_all"
  on public.standards
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- standards_frameworks
alter table public.standards_frameworks enable row level security;
drop policy if exists "claude_admin_all" on public.standards_frameworks;
create policy "claude_admin_all"
  on public.standards_frameworks
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- subject_team_memberships
alter table public.subject_team_memberships enable row level security;
drop policy if exists "claude_admin_all" on public.subject_team_memberships;
create policy "claude_admin_all"
  on public.subject_team_memberships
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- subjects
alter table public.subjects enable row level security;
drop policy if exists "claude_admin_all" on public.subjects;
create policy "claude_admin_all"
  on public.subjects
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- tags
alter table public.tags enable row level security;
drop policy if exists "claude_admin_all" on public.tags;
create policy "claude_admin_all"
  on public.tags
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- teacher_grade_assignments
alter table public.teacher_grade_assignments enable row level security;
drop policy if exists "claude_admin_all" on public.teacher_grade_assignments;
create policy "claude_admin_all"
  on public.teacher_grade_assignments
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- teacher_reminder_state
alter table public.teacher_reminder_state enable row level security;
drop policy if exists "claude_admin_all" on public.teacher_reminder_state;
create policy "claude_admin_all"
  on public.teacher_reminder_state
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- teacher_ui_state
alter table public.teacher_ui_state enable row level security;
drop policy if exists "claude_admin_all" on public.teacher_ui_state;
create policy "claude_admin_all"
  on public.teacher_ui_state
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- teachers
alter table public.teachers enable row level security;
drop policy if exists "claude_admin_all" on public.teachers;
create policy "claude_admin_all"
  on public.teachers
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- teaching_reminders
alter table public.teaching_reminders enable row level security;
drop policy if exists "claude_admin_all" on public.teaching_reminders;
create policy "claude_admin_all"
  on public.teaching_reminders
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- time_blocks
alter table public.time_blocks enable row level security;
drop policy if exists "claude_admin_all" on public.time_blocks;
create policy "claude_admin_all"
  on public.time_blocks
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- todos
alter table public.todos enable row level security;
drop policy if exists "claude_admin_all" on public.todos;
create policy "claude_admin_all"
  on public.todos
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- unit_start_records
alter table public.unit_start_records enable row level security;
drop policy if exists "claude_admin_all" on public.unit_start_records;
create policy "claude_admin_all"
  on public.unit_start_records
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- units
alter table public.units enable row level security;
drop policy if exists "claude_admin_all" on public.units;
create policy "claude_admin_all"
  on public.units
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());
