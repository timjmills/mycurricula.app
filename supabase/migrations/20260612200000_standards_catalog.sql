-- 20260612200000_standards_catalog.sql — worldwide standards-catalog metadata.
--
-- Promotes docs/standards-catalog-schema-proposal.sql to a real migration:
-- extends standards_frameworks with the catalog columns the 2026-06-12
-- worldwide research produced (lib/standards/frameworks-catalog.json — 174
-- frameworks), and standards with band/level labels for non-US grade shapes.
-- Pure DDL; RLS is already correct from the initial schema (catalog rows
-- world-readable via frameworks_read / standards_read; school-uploaded rows
-- school-scoped; writes admin-gated).
--
-- Apply order (IMPORTANT — review M-2): this migration, then the generated
-- seed (supabase/seed-standards-catalog.sql), and only then enable
-- NEXT_PUBLIC_PLANNER_USE_SUPABASE for tagging — the planner source maps
-- lesson standards codes → uuids against the seeded `standards` rows, so
-- codes tagged before the seed exists would be dropped on write.

-- ── Enumerated kinds (idempotent — migration may rerun on shadow DBs) ───────

do $$ begin
  create type framework_type as enum (
    'standards',                -- coded, taggable standards (CCSS, NGSS, AC v9, TEKS)
    'national_curriculum',      -- government curriculum, often prose objectives
    'international_programme',  -- cross-border programme (IB, Cambridge, IPC)
    'proprietary_curriculum',   -- publisher scope-and-sequence (Abeka, SABIS)
    'subject_framework',        -- single-subject framework (NGSS, C3, CASEL, WIDA)
    'accreditation',            -- school-quality standards, not lesson-taggable
    'assessment_framework'      -- exam-board specs / assessment layers (GCSE, AP)
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type framework_commercial_use as enum (
    'open',                 -- public domain / CC0 / open-government
    'open_attribution',     -- CC-BY / OGL / Licence Ouverte / NLOD
    'non_commercial',       -- CC-BY-NC(-SA/-ND) — commercial app needs permission
    'permission_required',  -- copyrighted; written permission / licence required
    'member_only',          -- distributed only to member/registered schools
    'unverified'            -- not yet confirmed against a primary source
  );
exception when duplicate_object then null; end $$;

-- ── standards_frameworks: catalog metadata ──────────────────────────────────

alter table standards_frameworks
  add column if not exists authority           text,
  add column if not exists country_code        text,
  add column if not exists subdivision_code    text,
  add column if not exists region              text,
  add column if not exists framework_kind      framework_type not null default 'standards',
  add column if not exists parent_framework_id uuid references standards_frameworks(id) on delete set null,
  add column if not exists grade_range         text,
  add column if not exists subject_scope       text[] not null default '{}',
  add column if not exists has_item_codes      boolean not null default false,
  add column if not exists coding_scheme       text,
  add column if not exists current_version     text,
  add column if not exists version_year        integer,
  add column if not exists reform_status       text,
  add column if not exists licence             text,
  add column if not exists commercial_use      framework_commercial_use not null default 'unverified',
  add column if not exists licence_notes       text,
  add column if not exists machine_readable    text[] not null default '{}',
  add column if not exists source_links        jsonb not null default '[]',
  add column if not exists catalog_notes       text;

comment on column standards_frameworks.commercial_use is
  'Ingestion gate: whether a commercial deployment may store/display this framework''s text. The import UI must warn/refuse on non_commercial / permission_required / member_only / unverified.';

create index if not exists idx_frameworks_country on standards_frameworks (country_code);
create index if not exists idx_frameworks_region  on standards_frameworks (region);
create index if not exists idx_frameworks_kind    on standards_frameworks (framework_kind);
create index if not exists idx_frameworks_parent  on standards_frameworks (parent_framework_id);

-- Catalog rows upsert on short_code (the stable conflict key for the seed).
create unique index if not exists uq_catalog_framework_short_code
  on standards_frameworks (short_code) where provenance = 'catalog';

-- ── standards: band/level labels for non-US grade shapes ───────────────────
-- grade_level_id stays nullable (cross-grade rows); band_label carries the
-- display band when no grade row applies ("Stage 3", "Cycle 2", "Grades 3–5").
-- item_kind names the hierarchy level for breadcrumbs ("standard", "practice",
-- "category", "domain", …).

alter table standards
  add column if not exists band_label text,
  add column if not exists item_kind  text;
