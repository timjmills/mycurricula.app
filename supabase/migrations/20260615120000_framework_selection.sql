-- ###########################################################################
-- ## Framework selection — featured catalog + school-default & per-teacher sets
-- ###########################################################################
-- WHAT THIS ADDS
-- The teacher-facing standards UX needs three things the catalog can't express yet:
--   1. A curated set of MAJOR global frameworks to surface upfront (the rest of the
--      176-framework catalog stays behind search). → standards_frameworks.is_featured.
--   2. A SCHOOL-level default framework set an admin picks once. → school_frameworks.
--   3. A PER-TEACHER override on top of that default (add/remove for myself only, so a
--      teacher never sees other people's standards). → teacher_frameworks.
-- Plus a single SQL function that encodes the effective-set rule
--   (school default − my removals) ∪ (my additions)
-- so the search API and any RPC share one definition, and indexes so scoped
-- standards search over the 1.11M-row `standards` table stays fast.
--
-- IDEMPOTENT + ADDITIVE — safe to run live and safe to re-run:
--   column → ADD COLUMN IF NOT EXISTS · table → CREATE TABLE IF NOT EXISTS
--   policy → DROP POLICY IF EXISTS … CREATE POLICY · trigger → DROP … CREATE
--   index  → CREATE INDEX IF NOT EXISTS · grant → REVOKE/GRANT (idempotent)
-- It adds one column + two tables + one function + indexes; touches no existing row
-- except the is_featured seed UPDATE (sets the flag on ~14 catalog frameworks).
--
-- SCHEMA-DRIFT NOTE: the live `standards_frameworks` is AHEAD of the committed
-- initial migration (it has region, framework_kind, subject_scope, country_code,
-- has_item_codes, source_links, … plus `standards.band_label`/`item_kind` — all
-- added out-of-band during the worldwide catalog ingest). The LIVE DB is the source
-- of truth; this additive migration is the canonical forward step. Do NOT rewrite
-- the initial migration to "catch up".
--
-- Cross-references for the schema/posture this depends on (all sort before this file):
--   M1 = 20260518102823_initial_schema.sql  (schools, teachers, school_admins,
--        standards_frameworks, standards, set_updated_at()).
--   20260607130000_codify_claude_admin_rls.sql — the `claude_admin_all` FOR ALL gate
--        every config table carries; reproduced here to match the live posture.
--   20260612120000_teacher_preferences.sql — the per-teacher owner-only RLS template
--        (teacher_id = auth.uid()) this file mirrors for teacher_frameworks.
--   Auth helpers used below (defined in earlier migrations):
--     auth_teacher_school_id()  → the caller's school_id (teachers.id = auth.uid())
--     is_school_admin(uuid)     → EXISTS in school_admins for auth.uid()+school
--     is_claude_admin()         → account-owner escape hatch (JWT email == owner)
-- ###########################################################################

-- ── 1. Featured flag + browse-ordering indexes ─────────────────────────────
-- is_featured marks the major GLOBAL frameworks shown upfront in the browser.
-- Everything else is reached via region grouping + full-catalog search.
alter table public.standards_frameworks
  add column if not exists is_featured boolean not null default false;

-- Seed the featured shortlist: globally-recognised major frameworks that actually
-- have standards rows. EXCLUDES the mena region by rule (the beta school follows
-- AERO + CCSS; MENA/MOEHE/ADEK are reached via region browse, never featured).
-- Uses the split CCSS codes (the generic `CCSS` entry is near-empty). The
-- `region is distinct from 'mena'` guard enforces the product rule defensively.
update public.standards_frameworks
   set is_featured = true
 where short_code in (
         'AERO','CCSS-MATH','CCSS-ELA','CCSS-SMP','NGSS',
         'IB-PYP','IB-MYP','IB-DP','CAM-IGCSE','CAM-PRI',
         'ENG-NC','C3-SS','CASEL','WIDA-ELD'
       )
   and region is distinct from 'mena'
   and is_featured is distinct from true;

create index if not exists idx_frameworks_featured
  on public.standards_frameworks (is_featured) where is_featured;
create index if not exists idx_frameworks_region_name
  on public.standards_frameworks (region, name) where is_active;

-- ── 2. school_frameworks — the admin-set school default ─────────────────────
create table if not exists public.school_frameworks (
  school_id     uuid not null references public.schools(id) on delete cascade,
  framework_id  uuid not null references public.standards_frameworks(id) on delete cascade,
  display_order int  not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (school_id, framework_id)
);
create index if not exists idx_school_frameworks_school on public.school_frameworks (school_id);

drop trigger if exists trg_school_frameworks_updated_at on public.school_frameworks;
create trigger trg_school_frameworks_updated_at
  before update on public.school_frameworks
  for each row execute function set_updated_at();

alter table public.school_frameworks enable row level security;

-- READ: any member of the school (auth_teacher_school_id() = this row's school) OR
-- an admin of it. So every teacher can see the school default that scopes them.
drop policy if exists school_frameworks_read on public.school_frameworks;
create policy school_frameworks_read on public.school_frameworks for select using (
  school_id = public.auth_teacher_school_id() or public.is_school_admin(school_id)
);

-- WRITE (insert/update/delete): only that school's admins. Mirrors the
-- school_admins posture used elsewhere; the consequence is team-wide.
drop policy if exists school_frameworks_admin_write on public.school_frameworks;
create policy school_frameworks_admin_write on public.school_frameworks for all using (
  public.is_school_admin(school_id)
) with check (
  public.is_school_admin(school_id)
);

drop policy if exists "claude_admin_all" on public.school_frameworks;
create policy "claude_admin_all" on public.school_frameworks for all to authenticated
  using (public.is_claude_admin()) with check (public.is_claude_admin());

revoke all on public.school_frameworks from anon;
grant select, insert, update, delete on public.school_frameworks to authenticated;

-- ── 3. teacher_frameworks — per-teacher override on the school default ──────
-- enabled=true  → a framework the teacher personally ADDED (on top of school default)
-- enabled=false → a school-default framework the teacher personally REMOVED for self
-- (returning to the default = delete the override row). Owner-only, like
-- teacher_preferences — a teacher only ever reads/writes their own rows, so one
-- teacher can never see or affect another's selection.
create table if not exists public.teacher_frameworks (
  teacher_id    uuid not null references public.teachers(id) on delete cascade,
  framework_id  uuid not null references public.standards_frameworks(id) on delete cascade,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (teacher_id, framework_id)
);
create index if not exists idx_teacher_frameworks_teacher on public.teacher_frameworks (teacher_id);

drop trigger if exists trg_teacher_frameworks_updated_at on public.teacher_frameworks;
create trigger trg_teacher_frameworks_updated_at
  before update on public.teacher_frameworks
  for each row execute function set_updated_at();

alter table public.teacher_frameworks enable row level security;

drop policy if exists teacher_frameworks_owner on public.teacher_frameworks;
create policy teacher_frameworks_owner on public.teacher_frameworks for all using (
  teacher_id = auth.uid()
) with check (
  teacher_id = auth.uid()
);

drop policy if exists "claude_admin_all" on public.teacher_frameworks;
create policy "claude_admin_all" on public.teacher_frameworks for all to authenticated
  using (public.is_claude_admin()) with check (public.is_claude_admin());

revoke all on public.teacher_frameworks from anon;
grant select, insert, update, delete on public.teacher_frameworks to authenticated;

-- ── 4. Effective-set function — single source of the scoping rule ──────────
-- (school default for MY school − frameworks I disabled) ∪ (frameworks I enabled).
-- SECURITY DEFINER so the search route can call it to constrain results to the
-- caller's chosen frameworks even though RLS would otherwise let them read any
-- catalog standard. STABLE; pinned search_path. Returns the set for auth.uid().
create or replace function public.teacher_effective_framework_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select sf.framework_id
    from public.school_frameworks sf
   where sf.school_id = public.auth_teacher_school_id()
     and not exists (
           select 1 from public.teacher_frameworks tf
            where tf.teacher_id = auth.uid()
              and tf.framework_id = sf.framework_id
              and tf.enabled = false
         )
  union
  select tf.framework_id
    from public.teacher_frameworks tf
   where tf.teacher_id = auth.uid()
     and tf.enabled = true;
$$;

revoke all on function public.teacher_effective_framework_ids() from public, anon;
grant execute on function public.teacher_effective_framework_ids() to authenticated;

-- ── 5. Search indexes for scoped standards search over `standards` (1.11M) ──
-- Search is ALWAYS intersected with framework_id IN (effective set) — typically a
-- handful of frameworks → tens of thousands of rows — so this composite btree does
-- the heavy pruning + accelerates the band_label (stage·subject·strand) prefix
-- filters. (Existing idx_standards_framework already prunes by framework alone.)
create index if not exists idx_standards_framework_band
  on public.standards (framework_id, band_label);

-- Trigram GIN for code/description ILIKE search WITHIN the pruned framework set.
-- pg_trgm lives in the `extensions` schema on Supabase. These GIN builds over
-- 1.11M rows take a few minutes and briefly lock this read-mostly catalog table;
-- acceptable for a one-time apply. If apply times out on the pooled connection,
-- create these two CONCURRENTLY out-of-band — the rest of the migration is
-- independent of them (framework-scoping alone keeps scoped search fast).
create extension if not exists pg_trgm with schema extensions;
create index if not exists idx_standards_code_trgm
  on public.standards using gin (code extensions.gin_trgm_ops);
create index if not exists idx_standards_desc_trgm
  on public.standards using gin (description extensions.gin_trgm_ops);

-- ###########################################################################
-- End of framework selection.
-- ###########################################################################
