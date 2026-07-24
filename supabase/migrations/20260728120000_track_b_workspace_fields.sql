-- ###########################################################################
-- ## Track-B workspace fields — editable units, lesson taught_at + rich fields,
-- ## and a per-teacher planner_settings table (7.21 Unified Unit/Lesson Workspace)
-- ###########################################################################
-- THE DATA-LAYER WAVE FOR TRACK B (docs/7.23.26-unified-v2-plan.md §5.2; the
-- canonical column list is docs/7.21.26-v2-cutover-and-workspace-plan.md L274-291).
-- Units are READ-ONLY in the planner seam today (B0 MODEL-GAP ASSESSMENT,
-- agent_shared_log.md: "UNITS ARE READ-ONLY BY DESIGN" — no unit mutation
-- anywhere), so making the unit workspace (B1.7) and the Lessons editor (B2)
-- editable needs the columns to write INTO. This migration adds them. It is PURELY
-- ADDITIVE, IDEMPOTENT, and INERT until hand-applied AND until B1.7/B2 wire the
-- seam:
--   * every new column is NULLABLE (one carries a CONSTANT default — standards
--     '{}' — which is metadata-only on PG 11+,
--     no table rewrite, so it is instant on the live tables: units 57 rows, master
--     events ~1k+). No backfill UPDATE anywhere → no advisory lock needed.
--   * the planner read path names columns EXPLICITLY (lib/planner/supabase-source.ts
--     MASTER_COLS/COPY_COLS/AUTHORED_COLS/UNIT_COLS) and this tranche does NOT add
--     the new columns to those selects — exactly the color/tint_scope launch-coupling
--     precedent (supabase-source.ts:509). So current reads never name a column that
--     may not exist yet: applying (or NOT applying) this file changes nothing that
--     renders today. B2 adds the columns to the selects coupled to this apply.
--
-- CANONICAL COLUMN SET (the plan L274-291, reconciled against B0 + the team's
-- rulings). Every reviewer-flagged column is INCLUDED; the plan is the post-B0
-- spec and already reconciled the derived/stored line. The one thing NOT added is
-- the instructional-arc-phase table (see the DEFERRED note at the end) — it is
-- DERIVED per B0 and the plan itself omits it.
--
-- B0 VERDICTS HONORED (agent_shared_log.md "B0 MODEL-GAP ASSESSMENT"):
--   * taught_at is THE load-bearing field — "l.forceTaught → taught_at timestamptz …
--     the only durable 'actually taught' signal; everything else infers taught from
--     slot < today, which is a fiction." WRITE it when taught; never infer.
--   * DERIVED, NOT STORED — B0 "Do NOT create columns for: slot, date, status,
--     startSlot, endSlot, resN, or any stat/ring/insight aggregate. Only the INPUTS
--     (pad, stack, array order, u.anchor) are real." Those named inputs belong to
--     the PROTOTYPE's linear-slot engine; the live app already stores its real
--     scheduling inputs (week_number / day_of_week / display_order_within_day,
--     units.start_week/end_week/pacing_override). Porting pad/stack/anchor/
--     position/target now would run two scheduling vocabularies in parallel and
--     pre-commit B6's timeline-authoring design — so they are DEFERRED to B6
--     (see the end-note), and NO computed slot/date/status/aggregate is stored.
--   * Lesson.time has NO column ON PURPOSE — B0 "a time-only write would spuriously
--     fork a personal lesson." No `time` column is added.
--   * EQ modelling — B0 "big_idea text + essential_questions text[] as two distinct
--     concepts." Modelled exactly.
--   * K/U/D — B0 "two parallel models; pick one." Collapsed to units.kud jsonb
--     {know,understand,doGoal} (readable-key arrays). Supersedes both prototype forms.
--   * Frameworks ⇒ JSONB — units.fw_data / lessons.fw_data / *.carried jsonb,
--     framework text (+ lessons.fw_id text override), custom_fields jsonb, and the
--     planner_settings table (SECTION 3). B0: "fixed columns are impossible."
--
-- PER-TEACHER STATE ON THE FORK TABLES (taught_at): these are
-- per-teacher SIGNALS, but the plan adds them to ALL THREE fork tables for
-- STRUCTURAL PARITY — the personal copy mirrors every column the master has (else a
-- fork drops the field), exactly as `differentiation` was added (MD). On read the
-- effective value is the personal copy over master (an unforked teacher sees
-- master's value, like every other content field). If B2 wants taught_at to be
-- strictly personal, it forks on write — a B2 WRITE decision, not a
-- schema one. This migration only provides the columns.
--
-- ASSESSMENT — OPEN TEXT, NO CHECK (team ruling, overrides the plan's
-- `check null|formative|summative`): a DB CHECK enum on assessment_kind is the
-- silent-write trap — a value the client accepts and the DB rejects fails the write
-- SILENTLY at the sync boundary (the client treats its own value as authoritative
-- and swallows the remote error). So the column is UNCONSTRAINED text; the NARROW
-- union lives in the TS seam type (lib/types.ts LessonAssessment.kind =
-- 'formative' | 'summative') and B2's WRITE PATH MUST VALIDATE against it before
-- writing. Contract mirrored in lib/types.ts. (Column names carry the full
-- `assessment_` prefix — assessment_kind/_title/_purpose/_notes — the accepted
-- deviation from the plan's `assessment`/`assess_*` shorthand.)
--
-- DISCRETE-vs-JSONB (mission brief: prefer DISCRETE where B0/the plan name a type):
--   * DISCRETE scalars / flat lists per the plan: notes/big_idea/framework/
--     default_flow/fw_id/builds/prep/assessment_* text; essential_questions text[];
--     standards uuid[]; default_dur/duration_minutes int; taught_at/
--     archived_at timestamptz.
--   * JSONB where the shape is an open map/nested config or a term+companion:
--     fw_data/custom_fields/subject_fw/subject_cf/carried (open, per-scope
--     config), kud (three arrays), vocab
--     (accepted deviation: UnitVocabItem[] — a term commonly pairs a definition).
--   Every jsonb column carries a lightweight typeof-guard CHECK (defense in depth,
--   as is_valid_differentiation MD did) — it passes on NULL and only rejects a
--   scalar/garbage write; it does NOT over-fit a shape B1.7/B2 have not settled.
--
-- RLS: the three fork tables' policies key on can_read_grade(grade_level_id) /
-- can_edit_subject_master(subject_id) / teacher_id = auth.uid() / owner_id =
-- auth.uid() (M1 + MS) — NONE enumerate columns, so the new columns inherit the
-- existing gates with no policy change. units has no column-level policy either.
-- planner_settings is a NEW table and gets a full owner-only policy + the
-- claude_admin_all escape hatch + REVOKE/GRANT posture, mirroring teacher_preferences
-- (MT) one-for-one.
--
-- MIGRATION BASE: timestamp AFTER 20260717120000 (B0 base warning) and after the
-- cutover-bundle files (…724/725/726/727). All prior migrations are applied on prod,
-- so the hand-apply is a standalone `db query --linked -f` of this file, then
-- `migration repair --status applied 20260728120000`. RE-RUN SEMANTICS (precise,
-- not "purely additive"): column/table adds are strictly guarded no-ops, but the
-- constraint/trigger/policy blocks use the repo's drop-then-recreate idiom — a
-- re-run RESTORES this file's definitions. That is safe under the repo's
-- convention that live objects are amended only by NEW migrations, never
-- hand-edits; if that convention is ever broken, a re-run reverts the hand-edit.
-- End-of-file runbook.
--
-- Cross-references:
--   M1  = 20260518102823_initial_schema.sql        (units, master_core_lesson_events,
--         personal_core_lesson_event_copies; set_updated_at() :166; fork RLS.)
--   MP  = 20260601120000_planner_sections_personal.sql (personal_authored_lessons +
--         its owner-only RLS — the THIRD fork table.)
--   MS  = 20260604120000_planner_scale_hardening.sql (the live fork-table RLS keyed on
--         the denormalized grade_level_id — proves the policies don't enumerate cols.)
--   MD  = 20260612200000_daily_redesign_persistence.sql (differentiation jsonb added
--         to all three fork tables — the additive-across-forks precedent mirrored here.)
--   MT  = 20260612120000_teacher_preferences.sql   (the per-teacher owner-only table +
--         claude_admin_all + REVOKE/GRANT template planner_settings mirrors.)
-- ###########################################################################


-- ###########################################################################
-- ## SECTION 1 — UNITS: editable workspace fields (all nullable; no backfill)
-- ###########################################################################
-- Units are a thin scheduling stub today (id, grade, subject, year, name, summary,
-- start_week, end_week, pacing_override). The plan L274-279 enumerates every field
-- the unit workspace edits.
alter table public.units add column if not exists notes                text;
alter table public.units add column if not exists big_idea             text;
alter table public.units add column if not exists essential_questions  text[];
alter table public.units add column if not exists vocab                jsonb;
alter table public.units add column if not exists kud                  jsonb;
-- Real unit↔standards link (USER DECISION 2: build a unit-standards editor). uuid[]
-- of standards.id, mirroring the lesson tables' inline-array convention. `default
-- '{}'` per the plan (constant default → metadata-only; existing rows read empty).
alter table public.units add column if not exists standards            uuid[] default '{}';
-- Unit-default lesson flow + duration (plan). OPEN text/int — no flow-template FK
-- (parity with `framework` being open text; avoids coupling to a template table).
alter table public.units add column if not exists default_flow         text;
alter table public.units add column if not exists default_dur          integer;
-- Scheduling INPUTS (B0: "only the INPUTS are real"): position = manual unit order;
-- Framework resolution chain (B0: model `framework`, never the unassigned `u.fw`):
-- an OPEN text value (preset id / 'custom' / user framework id) — no CHECK (a
-- preset allowlist would reject legitimate user-defined frameworks).
alter table public.units add column if not exists framework            text;
alter table public.units add column if not exists fw_data              jsonb;
alter table public.units add column if not exists custom_fields        jsonb;
-- Conversion orphans carried across a framework switch (plan).
alter table public.units add column if not exists carried              jsonb;
-- Soft-archive marker (B0 MISSING: archived). NULL = live; a stamp = archived-at.
alter table public.units add column if not exists archived_at          timestamptz;

-- Lightweight jsonb shape guards (defense-in-depth; pass on NULL, reject scalars).
-- DROP/ADD IF EXISTS keeps them idempotent (the policy-idempotency idiom from MT).
alter table public.units drop constraint if exists units_vocab_shape;
alter table public.units add  constraint units_vocab_shape
  check (vocab is null or jsonb_typeof(vocab) = 'array');
alter table public.units drop constraint if exists units_kud_shape;
alter table public.units add  constraint units_kud_shape
  check (kud is null or jsonb_typeof(kud) = 'object');
alter table public.units drop constraint if exists units_fw_data_shape;
alter table public.units add  constraint units_fw_data_shape
  check (fw_data is null or jsonb_typeof(fw_data) = 'object');
alter table public.units drop constraint if exists units_custom_fields_shape;
alter table public.units add  constraint units_custom_fields_shape
  check (custom_fields is null or jsonb_typeof(custom_fields) in ('object', 'array'));
alter table public.units drop constraint if exists units_carried_shape;
alter table public.units add  constraint units_carried_shape
  check (carried is null or jsonb_typeof(carried) in ('object', 'array'));


-- ###########################################################################
-- ## SECTION 2 — LESSONS: taught_at + rich fields on ALL THREE fork tables
-- ###########################################################################
-- The plan's #1 hazard: "Every lesson column must be added to all THREE fork
-- tables." They are written out per-table (not a loop) so the coverage is visually
-- verifiable in review and trivially static-testable. `differentiation`, `notes`,
-- `resources`, `standards` already exist and are NOT re-added.

-- --- master_core_lesson_events (the shared source of truth) -----------------
alter table public.master_core_lesson_events add column if not exists taught_at          timestamptz;
alter table public.master_core_lesson_events add column if not exists duration_minutes   integer;
alter table public.master_core_lesson_events add column if not exists assessment_kind    text;
alter table public.master_core_lesson_events add column if not exists assessment_title   text;
alter table public.master_core_lesson_events add column if not exists assessment_purpose text;
alter table public.master_core_lesson_events add column if not exists assessment_notes   text;
alter table public.master_core_lesson_events add column if not exists builds             text;
alter table public.master_core_lesson_events add column if not exists prep               text;
alter table public.master_core_lesson_events add column if not exists fw_data            jsonb;
alter table public.master_core_lesson_events add column if not exists fw_id              text;
alter table public.master_core_lesson_events add column if not exists carried            jsonb;

-- --- personal_core_lesson_event_copies (the per-teacher lazy fork) ----------
alter table public.personal_core_lesson_event_copies add column if not exists taught_at          timestamptz;
alter table public.personal_core_lesson_event_copies add column if not exists duration_minutes   integer;
alter table public.personal_core_lesson_event_copies add column if not exists assessment_kind    text;
alter table public.personal_core_lesson_event_copies add column if not exists assessment_title   text;
alter table public.personal_core_lesson_event_copies add column if not exists assessment_purpose text;
alter table public.personal_core_lesson_event_copies add column if not exists assessment_notes   text;
alter table public.personal_core_lesson_event_copies add column if not exists builds             text;
alter table public.personal_core_lesson_event_copies add column if not exists prep               text;
alter table public.personal_core_lesson_event_copies add column if not exists fw_data            jsonb;
alter table public.personal_core_lesson_event_copies add column if not exists fw_id              text;
alter table public.personal_core_lesson_event_copies add column if not exists carried            jsonb;

-- --- personal_authored_lessons (a teacher's OWN lesson, no master) ----------
alter table public.personal_authored_lessons add column if not exists taught_at          timestamptz;
alter table public.personal_authored_lessons add column if not exists duration_minutes   integer;
alter table public.personal_authored_lessons add column if not exists assessment_kind    text;
alter table public.personal_authored_lessons add column if not exists assessment_title   text;
alter table public.personal_authored_lessons add column if not exists assessment_purpose text;
alter table public.personal_authored_lessons add column if not exists assessment_notes   text;
alter table public.personal_authored_lessons add column if not exists builds             text;
alter table public.personal_authored_lessons add column if not exists prep               text;
alter table public.personal_authored_lessons add column if not exists fw_data            jsonb;
alter table public.personal_authored_lessons add column if not exists fw_id              text;
alter table public.personal_authored_lessons add column if not exists carried            jsonb;

-- jsonb shape guards (fw_data object; carried object-or-array) on each
-- fork table. Pass on NULL; reject scalars. Idempotent DROP/ADD.
alter table public.master_core_lesson_events drop constraint if exists master_events_fw_data_shape;
alter table public.master_core_lesson_events add  constraint master_events_fw_data_shape
  check (fw_data is null or jsonb_typeof(fw_data) = 'object');
alter table public.master_core_lesson_events drop constraint if exists master_events_carried_shape;
alter table public.master_core_lesson_events add  constraint master_events_carried_shape
  check (carried is null or jsonb_typeof(carried) in ('object', 'array'));

alter table public.personal_core_lesson_event_copies drop constraint if exists personal_copies_fw_data_shape;
alter table public.personal_core_lesson_event_copies add  constraint personal_copies_fw_data_shape
  check (fw_data is null or jsonb_typeof(fw_data) = 'object');
alter table public.personal_core_lesson_event_copies drop constraint if exists personal_copies_carried_shape;
alter table public.personal_core_lesson_event_copies add  constraint personal_copies_carried_shape
  check (carried is null or jsonb_typeof(carried) in ('object', 'array'));

alter table public.personal_authored_lessons drop constraint if exists personal_authored_fw_data_shape;
alter table public.personal_authored_lessons add  constraint personal_authored_fw_data_shape
  check (fw_data is null or jsonb_typeof(fw_data) = 'object');
alter table public.personal_authored_lessons drop constraint if exists personal_authored_carried_shape;
alter table public.personal_authored_lessons add  constraint personal_authored_carried_shape
  check (carried is null or jsonb_typeof(carried) in ('object', 'array'));


-- ###########################################################################
-- ## SECTION 3 — planner_settings (per-teacher, owner-only) — NEW TABLE
-- ###########################################################################
-- B0 / plan L289-291: framework / subject_fw / custom_fields / subject_cf are DATA,
-- not UI prefs — "the framework resolution chain reads them every render" and they
-- live only in window.__phSettings in the prototype. A framework switch's FW.convert
-- reads these to remap every unit/lesson in scope, so they must persist. Per-teacher
-- (teacher_id PK == auth uid) mirroring teacher_preferences: each teacher configures
-- their own planner's framework + custom-field DEFINITIONS. (Distinct from the
-- standards-framework SELECTION model of 20260615120000 — that chooses WHICH
-- frameworks are enabled; this holds the workspace's framework-FIELD configuration.)
-- IDEMPOTENT: CREATE TABLE IF NOT EXISTS · DROP/CREATE POLICY · DROP/CREATE TRIGGER ·
-- REVOKE/GRANT — creates one table and touches no existing row.
create table if not exists public.planner_settings (
  teacher_id    uuid primary key references public.teachers(id) on delete cascade,
  -- Planner-default framework preset id / 'custom' / a user framework id. Open text
  -- (no CHECK — same rationale as units.framework).
  framework     text,
  -- Per-subject framework overrides, keyed by subject id → framework.
  subject_fw    jsonb,
  -- Planner-scope custom field DEFINITIONS (array of defs, or an object map).
  custom_fields jsonb,
  -- Per-subject custom field definitions, keyed by subject id.
  subject_cf    jsonb,
  updated_at    timestamptz not null default now()
);

-- jsonb shape guards (pass on NULL; reject scalars). Idempotent DROP/ADD.
alter table public.planner_settings drop constraint if exists planner_settings_subject_fw_shape;
alter table public.planner_settings add  constraint planner_settings_subject_fw_shape
  check (subject_fw is null or jsonb_typeof(subject_fw) = 'object');
alter table public.planner_settings drop constraint if exists planner_settings_custom_fields_shape;
alter table public.planner_settings add  constraint planner_settings_custom_fields_shape
  check (custom_fields is null or jsonb_typeof(custom_fields) in ('object', 'array'));
alter table public.planner_settings drop constraint if exists planner_settings_subject_cf_shape;
alter table public.planner_settings add  constraint planner_settings_subject_cf_shape
  check (subject_cf is null or jsonb_typeof(subject_cf) = 'object');

-- updated_at maintenance — the shared BEFORE UPDATE trigger (M1:166).
drop trigger if exists trg_planner_settings_updated_at on public.planner_settings;
create trigger trg_planner_settings_updated_at
  before update on public.planner_settings
  for each row execute function set_updated_at();

-- ── Row-Level Security ─────────────────────────────────────────────────────
-- Strictly the owning teacher's row (teacher_id IS the auth uid; teachers.id =
-- auth.uid()), mirroring teacher_preferences_owner verbatim. A teacher may
-- read/insert/update/delete ONLY their own planner settings row. No anon access.
alter table public.planner_settings enable row level security;

drop policy if exists planner_settings_owner on public.planner_settings;
create policy planner_settings_owner on public.planner_settings for all using (
  teacher_id = auth.uid()
) with check (
  teacher_id = auth.uid()
);

-- Owner/admin escape hatch, identical to the claude_admin_all FOR ALL gate every
-- data/config table carries (20260607130000). PERMISSIVE — OR'd with the owner
-- policy — and widens access ONLY for the single account-owner identity
-- is_claude_admin() returns true for; false (grants nothing) for everyone else.
drop policy if exists "claude_admin_all" on public.planner_settings;
create policy "claude_admin_all"
  on public.planner_settings
  for all
  to authenticated
  using (public.is_claude_admin())
  with check (public.is_claude_admin());

-- ── Privilege grants ───────────────────────────────────────────────────────
-- The owner RLS policy is the real gate; grants scope which roles may attempt an
-- operation at all. `authenticated` gets the DML the owner policy permits on the
-- caller's own row; `anon` is explicitly revoked. REVOKE-then-GRANT is idempotent.
revoke all on public.planner_settings from anon;
grant select, insert, update, delete on public.planner_settings to authenticated;


-- ###########################################################################
-- End of Track-B workspace fields.
--
-- DEFERRED (documented, not built here):
--   * Instructional arc PHASES as first-class rows — B0: the arc is DERIVED (a pure
--     function of the lesson set), and reusing lesson_sections.owner_kind for unit
--     phases would need an enum member + trigger change ("NOT a free nullable-column
--     add"). The plan L274-291 also omits it. If a stored arc is ever wanted, model
--     it deliberately in its own migration.
--   * A unit-level ASSESSMENTS table — USER DECISION 1: ship the 4 LESSON assessment
--     fields now (done above), keep them nullable/additive so a unit-level
--     assessments table can land later without a rewrite. Not built here by design.
-- Everything the completeness review flagged (units default_flow/default_dur/position/
-- default_flow/default_dur; lessons duration_minutes/builds/prep/fw_id/carried) is
-- INCLUDED above. ADJUDICATED OUT of this migration (independent §4a review,
-- 2026-07-24 — add back only when their owning tranche designs them):
--   * lessons pad/stack + units position/anchor_slot/target_slot → B6 timeline
--     authoring (prototype linear-slot inputs; the live app schedules by
--     week/day/order — two vocabularies would drift).
--   * lessons done jsonb + cu_handled → B3 Insights (done is content-derived
--     except done.assess; cu_handled likely redundant with status/reason_not_done).
--   * lessons flow_name → design-gated (scalar vs lesson_sections — a B2 call).
--   * lessons tags → superseded by standards uuid[].
--   * units reflect/udl_on/hidden_groups → the framework-designer sub-tab.
--
-- APPLY-DAY RUNBOOK (hand-apply, coupled with the B2 seam-select change):
--   # from the project dir (supabase link lives here):
--   supabase db query --linked -f supabase/migrations/20260728120000_track_b_workspace_fields.sql
--   supabase migration repair --status applied 20260728120000   # keep history in sync
--   # verify:
--   supabase db query --linked "select column_name from information_schema.columns
--     where table_schema='public' and table_name='units' and column_name='big_idea';"
-- (A bare `db push` also applies it since all prior migrations are applied, but the
--  standalone query -f is the surgical, re-runnable path per the project gotcha.)
-- ###########################################################################
