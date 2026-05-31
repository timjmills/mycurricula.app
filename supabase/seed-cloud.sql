-- =============================================================================
-- MyCurricula — CLOUD seed (idempotent / safe to re-run)
-- =============================================================================
-- Same baseline graph as supabase/seed.sql (one beta school, active Grade 5,
-- active 2025–2026 year, the 8 locked subjects), but every insert carries
-- `on conflict do nothing`, so running it against a project that ALREADY has
-- some of these rows is a no-op instead of a duplicate-key error.
--
-- Use this for a real/shared/production project where `db push` already ran and
-- you can't guarantee the DB is empty. For a fresh LOCAL stack, `supabase db
-- reset` runs the plain seed.sql automatically — you don't need this file there.
--
-- Apply: psql "YOUR-DB-CONNECTION-STRING" -f supabase/seed-cloud.sql
-- =============================================================================

insert into schools (id, name, school_week, ramadan_timetable_enabled, resource_hosting_mode)
values (
  '00000000-0000-0000-0000-0000000000a1',
  'Beta School (Qatar)',
  array['sun','mon','tue','wed','thu']::weekday[],
  true,
  'links_only'
)
on conflict (id) do nothing;

insert into grade_levels (id, school_id, name, display_order, is_active)
values
  ('00000000-0000-0000-0000-0000000000b5',
   '00000000-0000-0000-0000-0000000000a1', 'Grade 5', 5, true)
on conflict (id) do nothing;

insert into school_years (
  id, school_id, label, start_date, end_date, weeks, is_active, active_cycle_pattern
)
values (
  '00000000-0000-0000-0000-0000000000c1',
  '00000000-0000-0000-0000-0000000000a1',
  '2025–2026',
  '2025-08-24',
  '2026-06-18',
  40,
  true,
  'one_week'
)
on conflict (id) do nothing;

insert into subjects (id, grade_level_id, name, color, display_order, scope, default_pacing)
values
  ('00000000-0000-0000-0000-0000000005d1',
   '00000000-0000-0000-0000-0000000000b5', 'Math',      'math',      0, 'team', 'synchronized'),
  ('00000000-0000-0000-0000-0000000005d2',
   '00000000-0000-0000-0000-0000000000b5', 'Reading',   'reading',   1, 'team', 'synchronized'),
  ('00000000-0000-0000-0000-0000000005d3',
   '00000000-0000-0000-0000-0000000000b5', 'Writing',   'writing',   2, 'team', 'synchronized'),
  ('00000000-0000-0000-0000-0000000005d4',
   '00000000-0000-0000-0000-0000000000b5', 'Grammar',   'grammar',   3, 'team', 'synchronized'),
  ('00000000-0000-0000-0000-0000000005d5',
   '00000000-0000-0000-0000-0000000000b5', 'Spelling',  'spelling',  4, 'team', 'synchronized'),
  ('00000000-0000-0000-0000-0000000005d6',
   '00000000-0000-0000-0000-0000000000b5', 'UFLI',      'ufli',      5, 'team', 'synchronized'),
  ('00000000-0000-0000-0000-0000000005d7',
   '00000000-0000-0000-0000-0000000000b5', 'Explorers', 'explorers', 6, 'team', 'synchronized'),
  ('00000000-0000-0000-0000-0000000005d8',
   '00000000-0000-0000-0000-0000000000b5', 'SEL',       'sel',       7, 'team', 'synchronized')
on conflict (id) do nothing;

-- =============================================================================
-- End of cloud seed.
-- =============================================================================
