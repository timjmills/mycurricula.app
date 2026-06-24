-- ###########################################################################
-- ## v2 appearance-engine theme axes (additive on teacher_preferences)
-- ###########################################################################
-- WHAT THIS ADDS
-- Wave 2 of the mycurricula.app v2 appearance engine introduces a new, wider
-- axis vocabulary set on <html> by lib/theme.tsx. This migration extends the
-- existing public.teacher_preferences row (created in
-- 20260612120000_teacher_preferences.sql) with the FOUR new persisted v2 axes
-- and re-points the persisted `theme` value space onto the canonical v2 theme
-- set — WITHOUT deleting or breaking the v1 axes (additive / back-compatible).
--
--   NEW v2 axes (all nullable text + CHECK):
--     frame  ∈ glass | paper | color           — layout character + material
--     glass  ∈ dark  | light                   — Frame A frosted register
--     bg     ∈ photo | wash                     — what lives behind the glass
--     dim    ∈ dim   | normal | bright          — Photo prominence + text treatment
--
--   data-tone (light|dark) is DERIVED at paint time (Night → dark; Photo-Dim →
--   dark; Photo-Normal → AUTO [samples photo luminance, >0.6 → light else dark];
--   Photo-Bright / Wash / any light theme → light); it is
--   NEVER persisted, so there is no `tone` column. Likewise the supporting
--   data-canvas / data-veil / data-zoom axes are runtime/presentation state,
--   not teacher preferences, and are not stored here.
--
-- WHY NULLABLE (not NOT NULL + default)
-- The v1 row predates these axes; existing rows must keep working flag-OFF.
-- A NULL means "the teacher has not chosen a v2 value" — the client falls back
-- to its own DEFAULT_FRAME='glass' / DEFAULT_GLASS='dark' / DEFAULT_BG='photo'
-- / DEFAULT_DIM='normal'. Adding a NOT NULL column with a default would
-- back-fill every existing row with a value the teacher never picked and would
-- make the column non-additive. Nullable + client default keeps this purely
-- additive and lets the appearance engine roll out per-wave.
--
-- WHY KEEP THE v1 COLUMNS (theme/theme_style/theme_palette)
-- Flag-OFF v1 must keep working: data-style (theme_style) and data-palette
-- (theme_palette) are KEPT as DEPRECATED compat columns — the v2 path drops
-- data-style from the DOM but the persisted value is preserved so a rollback
-- to v1 still finds the teacher's old card style / saturation. We DO NOT drop
-- them. `theme` is RE-POINTED: the persisted theme value migrates from the v1
-- set (paper|cloud|night|mint|sky|blossom|system) to the v2 canonical set
-- (clear|night|honey|blossom|mint|sky|off|system) via the data UPDATE below
-- and a widened CHECK that accepts BOTH sets during the transition so no
-- in-flight write is rejected.
--
-- LOCKED DECISIONS (Wave 2 / Stage 1)
--   * theme paper + cloud  → clear   (the resting theme; night/mint/sky/blossom
--     keep their names; honey/off are new v2 values)
--   * data-style dropped from the v2 DOM path, kept as a deprecated compat column
--   * subject→slot map is handled in a LATER stage (NOT here)
--
-- IDEMPOTENT + ADDITIVE — safe on a live database and safe to re-run:
--   * columns     → ADD COLUMN IF NOT EXISTS
--   * constraints → DROP CONSTRAINT IF EXISTS … then ADD CONSTRAINT
--   * data UPDATE → guarded by WHERE so a second run is a no-op
-- It touches one existing table, adds four nullable columns, and re-maps two
-- legacy theme values. RLS, the owner policy, the claude_admin_all gate, the
-- updated_at trigger, and the privilege grants are ALL UNCHANGED — inherited
-- from 20260612120000_teacher_preferences.sql.
--
-- ── ALLOWLIST LOCKSTEP (READ BEFORE EDITING) ───────────────────────────────
-- The CHECK lists below are part of the FROZEN value matrix and MUST stay in
-- lockstep with the four other surfaces (docs/v2-rebuild/WAVE-2-VALUE-MATRIX.md
-- is the source of truth):
--   1. lib/theme.tsx              — exported guard arrays
--   2. lib/theme-init.tsx         — no-FOUC boot script inline arrays
--   3. THIS migration             — the CHECK constraints
--   4. app/layout.tsx             — the SSR root attributes
--   5. scripts/probe-theme-wave.mjs — the per-wave probe
-- If any drifts, a value one surface accepts and another rejects fails a write
-- SILENTLY at the sync boundary (the client treats localStorage as
-- authoritative and swallows remote errors). Keep the lists identical.
--
--   FROZEN v2 axis values (this stage):
--     frame  : glass, paper, color
--     glass  : dark, light
--     bg     : photo, wash
--     dim    : dim, normal, bright
--     theme  : clear, night, honey, blossom, mint, sky, off, system   (v2)
--              + paper, cloud  (v1 legacy, accepted during transition)
--     theme_style   (DEPRECATED compat): quiet, calm, vivid
--     theme_palette (DEPRECATED compat): normal, highlight
--   'system' is a STORED sentinel (resolved to night/clear at runtime) and a
--   legal persisted value, so it stays in the allowlist.
-- ###########################################################################

-- ── 1 · NEW v2 axis columns (nullable, additive) ───────────────────────────
-- Each is nullable: a NULL means "no v2 choice yet → client default applies".
alter table public.teacher_preferences
  add column if not exists frame text,
  add column if not exists glass text,
  add column if not exists bg    text,
  add column if not exists dim   text;

-- ── 2 · CHECK constraints for the new axes (exactly the frozen matrix) ──────
-- NULL passes every CHECK (SQL CHECK is satisfied when the predicate is NULL),
-- so the nullable columns above remain valid for legacy rows that never set
-- a v2 value. DROP-then-ADD keeps this re-runnable.
alter table public.teacher_preferences
  drop constraint if exists teacher_preferences_frame_chk;
alter table public.teacher_preferences
  add constraint teacher_preferences_frame_chk
  check (frame is null or frame in ('glass', 'paper', 'color'));

alter table public.teacher_preferences
  drop constraint if exists teacher_preferences_glass_chk;
alter table public.teacher_preferences
  add constraint teacher_preferences_glass_chk
  check (glass is null or glass in ('dark', 'light'));

alter table public.teacher_preferences
  drop constraint if exists teacher_preferences_bg_chk;
alter table public.teacher_preferences
  add constraint teacher_preferences_bg_chk
  check (bg is null or bg in ('photo', 'wash'));

alter table public.teacher_preferences
  drop constraint if exists teacher_preferences_dim_chk;
alter table public.teacher_preferences
  add constraint teacher_preferences_dim_chk
  check (dim is null or dim in ('dim', 'normal', 'bright'));

-- ── 3 · Widen the legacy `theme` CHECK to the v2 ∪ v1 value space ───────────
-- The original constraint (named inline at table-create time as
-- teacher_preferences_theme_check) only accepts the v1 set. We must replace it
-- so the v2 values (clear, honey, off) are writable, while STILL accepting the
-- v1 values (paper, cloud) until every persisted row + client has migrated —
-- this prevents an in-flight v1 write from being rejected mid-rollout.
-- Postgres auto-names a column-inline `check` constraint
-- '<table>_<column>_check'; drop that, then add an explicitly-named one.
alter table public.teacher_preferences
  drop constraint if exists teacher_preferences_theme_check;
alter table public.teacher_preferences
  drop constraint if exists teacher_preferences_theme_chk;
alter table public.teacher_preferences
  add constraint teacher_preferences_theme_chk
  check (theme in (
    -- v2 canonical set
    'clear', 'night', 'honey', 'blossom', 'mint', 'sky', 'off',
    -- v1 legacy set (accepted during the transition; remapped by step 4)
    'paper', 'cloud',
    -- stored sentinel (resolved to night/clear at paint time)
    'system'
  ));

-- ── 4 · Data migration — remap persisted theme + seed frame ─────────────────
-- 4a · paper|cloud → clear. night / mint / sky / blossom keep their names
--      (they already exist in both sets). honey / off are new and only ever
--      arrive from a fresh v2 write, so there is nothing to remap for them.
--      WHERE-guarded so a second run finds no paper/cloud rows and no-ops.
update public.teacher_preferences
set theme = 'clear'
where theme in ('paper', 'cloud');

-- 4b · Seed `frame` from the deprecated `theme_style` for rows that have not
--      yet chosen a v2 frame (frame IS NULL). The v1 card-style axis maps onto
--      the v2 layout character:
--        calm  → glass   (Frame A · Calm Glass)
--        quiet → paper   (Frame B · Bright workspace)
--        vivid → color   (Frame C · Color-forward)
--      Only fills NULLs, so it never clobbers a teacher's explicit v2 choice
--      and is a no-op on re-run.
update public.teacher_preferences
set frame = case theme_style
              when 'calm'  then 'glass'
              when 'quiet' then 'paper'
              when 'vivid' then 'color'
            end
where frame is null
  and theme_style in ('calm', 'quiet', 'vivid');

-- ###########################################################################
-- End of v2 theme axes. RLS / policies / grants / trigger are UNCHANGED.
-- ###########################################################################
