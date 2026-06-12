-- =============================================================================
-- Grade 5 — prod finalize. Run AFTER supabase/seed-cloud.sql and
-- scripts/_grade5-real-data.sql. Idempotent / safe to re-run.
-- =============================================================================
-- Makes the real 2026–2027 school year (id …c2) the ONLY active year. Any prior
-- year (the seed's 2025–2026, a stray duplicate, etc.) is ARCHIVED by being
-- deactivated — its units/lessons are LEFT INTACT so the old plan stays
-- viewable as an archived curriculum (this is exactly how a finished year should
-- read once the new one is active). Nothing is deleted; fully reversible:
--   • years → is_active = false   (undo: set is_active = true)
--
-- NOTE: we deliberately do NOT soft-delete the old lessons (deleted_at). A past
-- year is "archived" by virtue of being inactive, not by deleting its content —
-- the whole point is to be able to look back at it.
--
-- Apply: supabase db query --linked -f scripts/grade5-finalize.sql
-- =============================================================================

-- Exactly one active school year: 2026–2027 (…c2). Deactivates (archives) the
-- seed's 2025–2026 year AND any stray duplicate years, content preserved.
update school_years
   set is_active = false, updated_at = now()
 where id <> '00000000-0000-0000-0000-0000000000c2'
   and is_active;

-- =============================================================================
-- End of finalize. Verify with:
--   select label, is_active from school_years order by is_active desc; -- 1 active: 2026–2027
--   select count(*) from units where school_year_id = '…c2';           -- 35
--   select count(*) from master_core_lesson_events m join units u
--     on u.id = m.unit_id where u.school_year_id = '…c2'
--     and m.deleted_at is null;                                        -- 185
-- =============================================================================
