-- ============================================================================
-- PROMOTED (2026-06-12): this proposal is now the real migration
--   supabase/migrations/20260613120000_standards_catalog.sql
-- with generated seed supabase/seed-standards-catalog.sql
--   (regenerate: npx tsx scripts/gen-standards-catalog-sql.mjs).
-- Kept as the annotated design rationale. Companions:
--   docs/research-k12-standards-frameworks-2026-06-12.md  (the research report)
--   lib/standards/frameworks-catalog.json                 (catalog seed data)
--
-- Extends the live standards tables (supabase/migrations/20260518102823
-- _initial_schema.sql §5 — standards_frameworks / grade_framework_assignments
-- / standards) with the catalog metadata needed to hold every major K-12
-- standards framework worldwide. Promote to supabase/migrations/ when the
-- Phase 1B standards-catalog wave lands. No existing column changes; all
-- additions are nullable or defaulted, so this is backward-compatible with
-- rows already created through the school_uploaded path.
--
-- Design notes (from the 2026-06-12 worldwide research):
--  1. "Framework" must span more than coded standards: national curricula
--     (prose objectives), international programmes (IB/Cambridge), proprietary
--     curricula (Abeka, IPC), and accreditation bodies (ACSI, ACCS) that
--     schools still want to reference. framework_type captures this.
--  2. Licensing is the gating fact for ingestion. IB prohibits unlicensed app
--     use; NZ + N. Ireland are non-commercial; CCSS/England/France/Australia/
--     Sweden/Norway are open. licence + commercial_use make this queryable so
--     the import UI can refuse / warn before a school uploads protected text.
--  3. Lineage matters: state CCSS derivatives, Victorian Curriculum <- AC v9,
--     diocesan <- state standards. parent_framework_id models it.
--  4. Many frameworks have no granular codes (prose competence goals). The
--     standards table requires `code`; prose frameworks get synthetic codes at
--     import time (e.g. "FR.C3.MATHS.07") — has_item_codes records whether
--     codes are native or synthetic so the UI can de-emphasize synthetic ones.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Catalog metadata on standards_frameworks
-- ---------------------------------------------------------------------------

-- What kind of thing this framework is.
create type framework_type as enum (
  'standards',                -- coded, taggable standards (CCSS, NGSS, AC v9, TEKS)
  'national_curriculum',      -- government curriculum, often prose objectives (England NC, France programmes)
  'international_programme',  -- cross-border programme (IB PYP/MYP/DP, Cambridge, IPC)
  'proprietary_curriculum',   -- publisher scope-and-sequence (Abeka, BJU, Memoria, SABIS)
  'subject_framework',        -- single-subject national framework (NGSS, C3, CASEL, WIDA)
  'accreditation',            -- school-quality standards, not lesson-taggable (ACSI Inspire, NSBECS, ACCS)
  'assessment_framework'      -- exam-board specs / assessment layers (GCSE specs, AP CEDs, NCEA)
);

-- The single fact a commercial product needs before ingesting text.
create type framework_commercial_use as enum (
  'open',                 -- public domain / CC0 / open-government — ingest freely (attribute anyway)
  'open_attribution',     -- CC-BY / OGL / Licence Ouverte / NLOD — commercial OK with attribution
  'non_commercial',       -- CC-BY-NC(-SA/-ND) or NC terms — commercial app needs permission
  'permission_required',  -- copyrighted; written permission / licence required (Cambridge, Pearson, IB)
  'member_only',          -- distributed only to member/registered schools (IPC, AMI albums, MyIB)
  'unverified'            -- not yet confirmed against a primary source
);

alter table standards_frameworks
  -- Identity + provenance of the framework itself
  add column authority          text,                       -- issuing body ("ACARA", "DfE", "IBO", "MOEHE")
  add column country_code       text,                       -- ISO 3166-1 alpha-2; null = multi-country/global
  add column subdivision_code   text,                       -- ISO 3166-2 suffix for states/provinces ("US-TX", "CA-ON")
  add column region             text,                       -- 'north_america' | 'europe' | 'mena' | 'asia_pacific' | 'africa' | 'latin_america' | 'global'
  add column framework_kind     framework_type not null default 'standards',
  add column parent_framework_id uuid references standards_frameworks(id) on delete set null,

  -- Shape of the content
  add column grade_range        text,                       -- human-readable ("K–12", "Stages 1–9 (ages 5–14)")
  add column subject_scope      text[] not null default '{}', -- normalized slugs: ela, math, science, social_studies, arts, pe_health, languages, computing, religious_values, sel, vocational, cross_curricular
  add column has_item_codes     boolean not null default false, -- native granular codes exist (AC9M5N01, 3Nc.01, EF05MA01)
  add column coding_scheme      text,                       -- anatomy + example ("AC9 + learning area + year + strand + seq, e.g. AC9M5N01")

  -- Currency
  add column current_version    text,                       -- "v9.0", "Lgr22", "2022 revision"
  add column version_year       integer,                    -- year the current version took effect
  add column reform_status      text,                       -- short note when a replacement is in flight ("revised NC spring 2027, first teaching 2028")

  -- Licensing / ingestion (the gating columns)
  add column licence            text,                       -- verbatim licence name ("CC BY 4.0", "OGL v3", "NLOD 2.0", "Crown copyright", "© IBO")
  add column commercial_use     framework_commercial_use not null default 'unverified',
  add column licence_notes      text,                       -- attribution requirements, exceptions, who to contact

  -- Where the data lives
  add column machine_readable   text[] not null default '{}', -- 'api' | 'sparql' | 'case' | 'rdf' | 'json' | 'xml' | 'csv' | 'excel' | 'html' | 'pdf'
  add column source_links       jsonb not null default '[]',  -- [{ "label": "...", "url": "..." }]
  add column catalog_notes      text;                       -- caveats (e.g. Qatar: mandatory Arabic/Islamic/Qatar-history for private schools)

-- Catalog lookups the picker + import UI will run.
create index idx_frameworks_country  on standards_frameworks (country_code);
create index idx_frameworks_region   on standards_frameworks (region);
create index idx_frameworks_kind     on standards_frameworks (framework_kind);
create index idx_frameworks_parent   on standards_frameworks (parent_framework_id);

-- ---------------------------------------------------------------------------
-- 2. Standards rows: keep grade-scoping flexible for non-US shapes
-- ---------------------------------------------------------------------------
-- The standards table already supports arbitrary depth (parent_standard_id)
-- and per-framework unique codes. Two gaps for worldwide content:
--   a. Frameworks that band by stage/phase/cycle rather than grade
--      (CfE levels, Cambridge stages, France cycles, IB phases). grade_level_id
--      stays nullable; band labels live on the standard itself.
--   b. Original-language text alongside English (Qatar Arabic, BNCC
--      Portuguese). description_translations already covers this — no change.

alter table standards
  add column band_label  text,        -- "Stage 3", "Cycle 2", "Phase 4", "Second Level" — display label when grade_level_id is null
  add column item_kind   text;        -- optional: 'strand' | 'domain' | 'cluster' | 'standard' | 'objective' | 'benchmark' | 'indicator' — names the hierarchy level for breadcrumbs

-- ---------------------------------------------------------------------------
-- 3. RLS — catalog rows readable by every authenticated teacher
-- ---------------------------------------------------------------------------
-- standards_frameworks / standards already carry RLS from
-- 20260607130000_codify_claude_admin_rls.sql. Catalog rows (provenance =
-- 'catalog', owner_school_id is null) must be readable app-wide; writes stay
-- admin-only. Example policies (adjust names to the live policy scheme):
--
--   create policy "catalog_frameworks_readable" on standards_frameworks
--     for select to authenticated
--     using (provenance = 'catalog' or owner_school_id = public.current_school_id());
--
--   create policy "catalog_standards_readable" on standards
--     for select to authenticated
--     using (exists (
--       select 1 from standards_frameworks f
--       where f.id = framework_id
--         and (f.provenance = 'catalog' or f.owner_school_id = public.current_school_id())
--     ));

-- ---------------------------------------------------------------------------
-- 4. Seeding
-- ---------------------------------------------------------------------------
-- lib/standards/frameworks-catalog.json (also the data behind the in-app
-- standards menu) holds one object per framework with keys matching the
-- columns above. Load it with a one-off script (or a generated insert
-- migration) AFTER this migration is applied.
--
-- ORDERING REQUIREMENT (review M-2): the bundled item sets in
-- lib/standards/items.ts (CCSS ELA/Math + MP1–MP8, NGSS, IB ATL categories)
-- must be inserted as `standards` rows BEFORE
-- NEXT_PUBLIC_PLANNER_USE_SUPABASE is enabled. The flag-ON write path maps
-- codes → uuids against the standards table and the read path DROPS uuids
-- with no row — un-seeded picker-tagged codes would silently disappear on
-- the first save/reload.
--   short_code is the stable conflict key:  on conflict (short_code) where provenance='catalog' do update ...
-- Note: short_code currently has no unique constraint; add a partial unique
-- index for catalog rows before relying on upsert:
create unique index if not exists uq_catalog_framework_short_code
  on standards_frameworks (short_code) where provenance = 'catalog';
