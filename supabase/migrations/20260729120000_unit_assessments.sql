-- ###########################################################################
-- ## unit_assessments — MANY assessments per unit (B3, the Assessments drawer)
-- ###########################################################################
-- THE ONE THING 20260728120000 DELIBERATELY DEFERRED. That migration's end-note:
--   "A unit-level ASSESSMENTS table — USER DECISION 1: ship the 4 LESSON
--    assessment fields now, keep them nullable/additive so a unit-level
--    assessments table can land later without a rewrite. Not built here by
--    design."
-- This is that table. It is PURELY ADDITIVE (one NEW table + one NEW RPC), it
-- alters NO existing table, and it is INERT until the B3 seam + panel are wired:
-- nothing in the planner read path (listLessons / listUnits / getSections)
-- touches it, so applying — or NOT applying — this file changes nothing that
-- renders today.
--
-- MODEL (user-locked, do not redesign):
--   * A unit owns MULTIPLE assessments (pre-test / mid-unit / final), each with a
--     kind (formative | summative), title, purpose, notes, and a stable order.
--   * They are TEAM-LEVEL CURRICULUM CONTENT, exactly like the editable unit
--     fields B1.7 shipped — there is NO personal fork table and NO SaveTarget.
--     One shared row set per unit, gated by the SAME tenancy predicate as
--     `units` itself (see RLS below).
--   * LESSON-level assessments (B2's assessment_kind/_title/_purpose/_notes on
--     all three fork tables) are a SEPARATE, untouched model — "a lesson wearing
--     a hat". This table does not replace, mirror, or migrate them.
--
-- ASSESSMENT KIND — OPEN TEXT, NO CHECK. Verbatim inheritance of the F1 team
-- ruling that governs `lessons.assessment_kind` (20260728120000): a DB CHECK enum
-- is the silent-write trap — a value the client accepts and the DB rejects fails
-- the write SILENTLY at the sync boundary. So `kind` is UNCONSTRAINED text; the
-- narrow union lives in the TS seam type (lib/types.ts UnitAssessment.kind =
-- 'formative' | 'summative') and the WRITE PATH VALIDATES against it via
-- `isAssessmentKind` before writing (lib/planner/unit-assessments.ts — the pure
-- mapper leaf, mirroring lib/planner/lesson-track-b.ts). The READ path
-- re-validates, so a garbage value written by a direct SQL/import path is dropped
-- to undefined rather than leaking a kind the panel's filters can't match.
--
-- ORDERING: `display_order` (the house name — lesson_sections.display_order,
-- subjects.display_order, *.display_order_within_day), NOT `position`.
-- `units.position` was ADJUDICATED OUT of 20260728120000 and reserved for B6
-- timeline authoring; reusing that word here would read as the deferred concept.
-- The domain field is `UnitAssessment.position` (mapped in the seam leaf), the
-- same camel/snake divergence as defaultDuration↔default_dur, frameworkId↔fw_id.
--
-- RE-RUN SEMANTICS (precise, not "purely additive"): the table/index/column adds
-- are strictly guarded no-ops; the trigger / policy / function / grant blocks use
-- the repo's drop-then-recreate idiom, so a re-run RESTORES this file's
-- definitions. Safe under the repo convention that live objects are amended only
-- by NEW migrations, never hand-edits.
--
-- MIGRATION BASE: timestamp AFTER 20260728120000 (the Track-B tranche whose
-- end-note deferred this table). Hand-apply runbook at end of file.
--
-- Cross-references:
--   M1  = 20260518102823_initial_schema.sql        (units + `units_read` /
--         `units_write` — the policies mirrored below; set_updated_at() :166;
--         can_read_grade / can_edit_subject_master / is_grade_lead.)
--   MSC = 20260604120000_planner_scale_hardening.sql (can_read_grade re-defined
--         on auth_teacher_grade_ids(); the denormalize-grade doctrine this file
--         deliberately does NOT follow — see the end-note.)
--   MH2 = 20260604150000_security_hardening_2.sql  (replace_lesson_sections — the
--         SECURITY INVOKER atomic-RPC + revoke/grant template mirrored here.)
--   MCA = 20260607130000_codify_claude_admin_rls.sql (the canonical
--         `claude_admin_all` escape-hatch policy every data table carries.)
--   MTB = 20260728120000_track_b_workspace_fields.sql (the deferral this closes;
--         the assessment-kind OPEN-TEXT ruling; planner_settings' REVOKE/GRANT
--         posture.)
-- ###########################################################################


-- ###########################################################################
-- ## SECTION 1 — the table
-- ###########################################################################
-- Every content column is NULLABLE (an assessment with only a title is valid,
-- exactly like LessonAssessment where "every field optional"). `unit_id` and
-- `display_order` are the two structural NOT NULLs.
--
-- `on delete cascade` on unit_id matches the sibling convention for every child
-- of units: master_core_lesson_events.unit_id (M1:396),
-- personal_core_lesson_event_copies.unit_id (M1:434), unit_start_records.unit_id
-- (M1:873) are all `references units(id) on delete cascade`. (The one exception,
-- personal_authored_lessons.unit_id `on delete set null`, is deliberately
-- different: an authored lesson survives its unit. An assessment OF a unit does
-- not — a unit-less unit assessment is meaningless, so it cascades.)
create table if not exists public.unit_assessments (
  id            uuid primary key default gen_random_uuid(),
  -- The owning unit. GRADE SCOPING rides this FK: units carries grade_level_id +
  -- subject_id (M1:344-348), and the RLS below resolves both THROUGH it, so this
  -- table is multi-grade by construction and never assumes a single grade
  -- (CLAUDE.md §1/§6).
  unit_id       uuid not null references public.units(id) on delete cascade,
  -- 'formative' | 'summative' — OPEN text, NO CHECK (the F1 ruling above).
  kind          text,
  title         text,
  purpose       text,
  notes         text,
  -- Stable ordering WITHIN a unit (0-based). Not unique, and SPARSE AFTER A
  -- DELETE by design: deleting the middle of 0,1,2 leaves 0,2 and nothing
  -- renumbers. The seam appends at MAX+1 (never at COUNT, which would collide
  -- with a survivor), and reorder_unit_assessments() below rewrites a dense
  -- 0…n-1 sequence — so gaps never accumulate visibly and no compaction pass is
  -- needed. Uniqueness is deliberately NOT enforced: a reorder necessarily
  -- passes through transient duplicates, which a unique index would abort.
  display_order integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- The only read shape the seam issues: "this unit's assessments, in order".
create index if not exists idx_unit_assessments_unit
  on public.unit_assessments (unit_id, display_order);

-- updated_at maintenance — the shared BEFORE UPDATE trigger (M1:166).
drop trigger if exists trg_unit_assessments_updated_at on public.unit_assessments;
create trigger trg_unit_assessments_updated_at
  before update on public.unit_assessments
  for each row execute function set_updated_at();


-- ###########################################################################
-- ## SECTION 2 — Row-Level Security
-- ###########################################################################
-- RLS IS THE REAL GATE. Postgres' public default ACLs grant `authenticated`
-- (and `anon`) SELECT on every new table in this schema, so without RLS this
-- table would be world-readable to any signed-in user of any school. Enabled +
-- policied + regranted below.
--
-- TENANCY PREDICATE — IDENTICAL to `units` (M1:1306-1311), resolved through the
-- parent unit:
--   units_read  : can_read_grade(grade_level_id)
--   units_write : can_edit_subject_master(subject_id) or is_grade_lead(grade_level_id)
-- An assessment is team curriculum content ABOUT a unit, so exactly the people
-- who may read/edit the unit may read/edit its assessments — no wider, no
-- narrower.
--
-- WHY THROUGH THE PARENT (not denormalized grade_level_id/subject_id columns +
-- a derive trigger, the MSC doctrine): denormalizing would make the predicate
-- textually identical but introduce a DRIFT HAZARD — if a unit ever moves
-- subject or grade, every child row's copy goes stale and the write policy would
-- then authorize the WRONG subject master, with no trigger on `units` to
-- re-derive it. MSC accepted that trade for the two multi-thousand-row lesson
-- tables where the units JOIN was the #1 scale cost; unit_assessments holds a
-- handful of rows per unit and is read one unit at a time, so the JOIN is free
-- and correct-by-construction wins. This is the pre-denormalization shape of
-- master_events_read (M1:1333) and the shape completion_read_public still uses
-- (M1:1357).
--
-- CONSEQUENCE, stated explicitly: because the policy body SELECTs from `units`,
-- units' OWN RLS also applies inside it — so the effective write gate is
-- (units_read AND units_write). A subject master with `can_edit_master` but NO
-- grade assignment (so `can_read_grade` false) is denied. That is FAIL-CLOSED and
-- already the status quo for units themselves: the seam's patchUnit does
-- `.update(...).select("id")`, which such a teacher could not read back either.
alter table public.unit_assessments enable row level security;

drop policy if exists unit_assessments_read on public.unit_assessments;
create policy unit_assessments_read on public.unit_assessments for select using (
  exists (
    select 1 from public.units u
    where u.id = unit_assessments.unit_id
      and can_read_grade(u.grade_level_id)
  )
);

drop policy if exists unit_assessments_write on public.unit_assessments;
create policy unit_assessments_write on public.unit_assessments for all using (
  exists (
    select 1 from public.units u
    where u.id = unit_assessments.unit_id
      and (can_edit_subject_master(u.subject_id) or is_grade_lead(u.grade_level_id))
  )
) with check (
  exists (
    select 1 from public.units u
    where u.id = unit_assessments.unit_id
      and (can_edit_subject_master(u.subject_id) or is_grade_lead(u.grade_level_id))
  )
);

-- Owner/admin escape hatch, identical to the `claude_admin_all` FOR ALL gate
-- every data/config table carries (MCA). PERMISSIVE — OR'd with the policies
-- above — and widens access ONLY for the single account-owner identity
-- is_claude_admin() returns true for; false (grants nothing) for everyone else.
drop policy if exists "claude_admin_all" on public.unit_assessments;
create policy "claude_admin_all"
  on public.unit_assessments
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- ── Privilege grants ───────────────────────────────────────────────────────
-- The policies above are the real gate; grants scope which roles may attempt an
-- operation at all. `authenticated` gets the DML the policies permit; `anon` is
-- explicitly revoked (the schema's default ACL would otherwise leave it SELECT).
-- REVOKE-then-GRANT is idempotent. Mirrors planner_settings (MTB).
revoke all on public.unit_assessments from anon;
grant select, insert, update, delete on public.unit_assessments to authenticated;


-- ###########################################################################
-- ## SECTION 3 — reorder_unit_assessments (atomic, SECURITY INVOKER)
-- ###########################################################################
-- Reordering is inherently multi-row. Issuing N separate PostgREST UPDATEs would
-- be NON-ATOMIC: a failure partway leaves the unit's assessments in a mixed,
-- half-applied order with no way to tell how far it got. Same class of bug the
-- MH2 `replace_lesson_sections` RPC was created to close — so this mirrors it.
--
-- SECURITY INVOKER (stated explicitly, as MH2 does): RLS and
-- `unit_assessments_write` still evaluate against the CALLER. This is sugar for
-- an atomic multi-row UPDATE, NOT a privilege escalation — an unauthorized
-- caller simply updates zero rows and the returned count tells the seam so (it
-- throws rather than reporting a false success).
--
-- search_path is pinned to `public, pg_temp`. pg_temp is named LAST and
-- EXPLICITLY: with a bare `set search_path = public`, pg_temp is still searched
-- IMPLICITLY FIRST, so a caller-created temp table could shadow `public.units` /
-- `public.unit_assessments` inside the body (the repo's known Critical, cb83e46).
-- Naming it last pins it to lowest priority.
--
-- Returns the number of rows actually reordered, so the caller can compare it to
-- the ids it sent and surface a partial/denied reorder instead of assuming
-- success. Ids not belonging to p_unit_id are ignored (the `a.unit_id =
-- p_unit_id` guard) — a client cannot reorder another unit's rows by smuggling
-- their ids into the array.
create or replace function public.reorder_unit_assessments(
  p_unit_id uuid,
  p_ids     uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  -- `with ordinality` yields the array position (1-based bigint) alongside each
  -- id; display_order is stored 0-based to match the seam's array index, so
  -- subtract one. A NULL/empty p_ids updates nothing and returns 0.
  update public.unit_assessments a
     set display_order = (x.ord - 1)::integer
    from unnest(coalesce(p_ids, '{}'::uuid[])) with ordinality as x(id, ord)
   where a.id = x.id
     and a.unit_id = p_unit_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.reorder_unit_assessments(uuid, uuid[]) from public;
grant execute on function public.reorder_unit_assessments(uuid, uuid[]) to authenticated;


-- ###########################################################################
-- End of unit_assessments.
--
-- DELIBERATELY LEFT OUT (documented, not built here):
--   * A `check (kind in ('formative','summative'))` CONSTRAINT — the F1
--     enum-trap ruling inherited verbatim from 20260728120000: a DB enum makes a
--     rejected write fail SILENTLY at the sync boundary. Validity is the TS
--     union + isAssessmentKind, enforced on BOTH the write and the read side of
--     lib/planner/unit-assessments.ts.
--   * DENORMALIZED grade_level_id / subject_id + a derive trigger (the MSC
--     doctrine) — rejected for the drift hazard spelled out in SECTION 2. Add
--     them only if this table ever becomes a hot multi-thousand-row read, and
--     only together with a re-derive path on `units` writes.
--   * A SOFT-DELETE tier (`deleted_at` / `archived_at`). An assessment is team
--     content with no personal fork, so there is no per-teacher hide to model
--     (contrast personal_core_lesson_event_copies.archived_at, which exists
--     precisely because a teacher hides a MASTER lesson for themselves only).
--     Deletion is a REAL, WHOLE-ROW DELETE gated by the same write policy as
--     editing the unit — never a soft-null of `kind`, which is exactly how the
--     prototype stranded orphaned purpose/notes text behind a cleared kind and
--     resurfaced it later. Deleting the row takes every field with it. A
--     soft-delete column can be added additively later if the product wants
--     undo — no rewrite needed, and it would then need its own read filter.
--   * A COMPACTION pass on delete (renumbering survivors to close the gap).
--     Positions stay SPARSE; see the display_order comment in SECTION 1.
--     Compaction costs an extra multi-row write with its own atomicity story and
--     buys nothing the total-ordered sort + the reorder RPC don't already give.
--   * A UNIQUE constraint on (unit_id, display_order) — a reorder necessarily
--     passes through transient duplicates; uniqueness would abort mid-sequence.
--     The RPC above writes a complete gap-free sequence in ONE statement instead.
--   * PER-LESSON linkage (which lessons feed which unit assessment). B2's
--     `lessons.builds` free text already carries that intent ("Unit assessment —
--     Fractions"); a real FK join table is a product decision this tranche does
--     not pre-commit.
--   * Any change to the LESSON assessment columns. B2's four
--     `assessment_*` columns on the three fork tables are untouched.
--
-- APPLY-DAY RUNBOOK (hand-apply — ORCHESTRATOR + USER ONLY; agents never apply):
--   # from the project dir (the supabase link lives here):
--   supabase db query --linked -f supabase/migrations/20260729120000_unit_assessments.sql
--   supabase migration repair --status applied 20260729120000   # keep history in sync
--   # verify the table, its RLS, and the RPC:
--   supabase db query --linked "select relrowsecurity from pg_class
--     where oid = 'public.unit_assessments'::regclass;"
--   supabase db query --linked "select polname from pg_policy
--     where polrelid = 'public.unit_assessments'::regclass order by polname;"
--   supabase db query --linked "select has_function_privilege('authenticated',
--     'public.reorder_unit_assessments(uuid,uuid[])', 'execute');"
--   # and confirm anon really lost SELECT (grants, not just policies):
--   supabase db query --linked "select grantee, privilege_type
--     from information_schema.role_table_grants
--     where table_schema='public' and table_name='unit_assessments';"
--
-- ⚠ APPLY COUPLING (§4c): lib/planner/supabase-source.ts NAMES this table. Under
-- the planner Supabase flag, any B3 call into the unit-assessment seam BEFORE
-- this file is applied fails with `relation "unit_assessments" does not exist` —
-- surfaced as an error (never a silent empty list). Apply first, then ship the
-- panel. The flag-OFF mock path is unaffected.
-- ###########################################################################
