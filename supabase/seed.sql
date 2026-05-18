-- =============================================================================
-- MyCurricula — local development seed
-- =============================================================================
-- Applied by `supabase db reset` after the migrations. Gives a freshly-reset
-- local database a usable baseline: one beta school, an active Grade 5, an
-- active 2025–2026 school year, and the 8 locked Grade 5 team subjects
-- (math, reading, writing, grammar, spelling, ufli, explorers, sel — see
-- lib/types.ts SubjectId / lib/mock/subjects.ts).
--
-- NO teachers are seeded here: `teachers.id` references `auth.users(id)`, and
-- auth users are created through Supabase Auth (the CLI / Studio), not raw
-- SQL inserts. Create a test teacher via Studio, then insert a matching
-- `teachers` row keyed to that auth user id.
--
-- Fixed UUIDs are used so the seed is idempotent-friendly and easy to
-- reference from other fixtures.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- School (multi-tenant root) — the beta school in Qatar. Sun–Thu week.
-- ---------------------------------------------------------------------------
insert into schools (id, name, school_week, ramadan_timetable_enabled, resource_hosting_mode)
values (
  '00000000-0000-0000-0000-0000000000a1',
  'Beta School (Qatar)',
  array['sun','mon','tue','wed','thu']::weekday[],
  true,
  'links_only'
);

-- ---------------------------------------------------------------------------
-- Grade levels — only Grade 5 is active at launch (§4.2 GradeLevel).
-- ---------------------------------------------------------------------------
insert into grade_levels (id, school_id, name, display_order, is_active)
values
  ('00000000-0000-0000-0000-0000000000b5',
   '00000000-0000-0000-0000-0000000000a1', 'Grade 5', 5, true);

-- ---------------------------------------------------------------------------
-- School year — one active 2025–2026 year, one-week cycle (§4.8 default).
-- ---------------------------------------------------------------------------
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
);

-- ---------------------------------------------------------------------------
-- Subjects — the 8 locked Grade 5 team subjects. `color` carries the stable
-- palette slug the frontend resolves through .cp-subj.<x> / useSubjectColor.
-- The four literacy subjects mirror lib/mock/subjects.ts `parent: "literacy"`;
-- since `subjects.parent_id` is a self-FK, the parent linkage is left null
-- here (no Literacy umbrella subject row exists) — the grouping is cosmetic
-- in the current frontend and can be wired later if a Literacy subject is
-- introduced.
-- ---------------------------------------------------------------------------
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
   '00000000-0000-0000-0000-0000000000b5', 'SEL',       'sel',       7, 'team', 'synchronized');

-- =============================================================================
-- End of seed.
-- =============================================================================
