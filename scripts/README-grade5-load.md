# Grade 5 — real 2026–2027 curriculum: production load (replicable)

Loads the real Grade 5 curriculum into a linked Supabase project and archives any
prior mock/demo curriculum. **Every step is idempotent — safe to re-run**, and
nothing is ever deleted (archiving is done via `is_active=false`, fully
reversible).

Source of truth for the data is the Grade 5 Curriculum folder; the SQL is
generated, not hand-written.

## 0. (Optional) regenerate the data SQL

```bash
python scripts/gen-grade5-real-data.py
# → rewrites scripts/_grade5-real-data.sql (35 units, 185 lessons, 108 standards)
```

## 1. Load (linked project — no psql / DB password needed)

Run in order with the Supabase CLI against the **linked** project:

```bash
supabase db query --linked -f supabase/seed-cloud.sql        # baseline: school, Grade 5, 8 subjects, 2025–2026 year
supabase db query --linked -f scripts/_grade5-real-data.sql  # real 2026–2027 curriculum (idempotent upserts)
supabase db query --linked -f scripts/grade5-finalize.sql    # make 2026–2027 the ONLY active year; archive prior year(s)
```

For an **atomic** load, concatenate the three files inside a single
`BEGIN; … COMMIT;` block and run once via `--file`.

## 2. Verify

```sql
select label, is_active from school_years order by is_active desc;  -- 1 active row: 2026–2027
select count(*) from units where school_year_id
  = '00000000-0000-0000-0000-0000000000c2';                         -- 35
select count(*) from master_core_lesson_events m
  join units u on u.id = m.unit_id
  where u.school_year_id = '00000000-0000-0000-0000-0000000000c2'
  and m.deleted_at is null;                                         -- 185
```

## Notes

- **Archived curriculum:** the prior 2025–2026 year is left **intact but
  inactive** — its units/lessons remain so it can be viewed as an archived
  curriculum once the app reads from Supabase
  (`NEXT_PUBLIC_PLANNER_USE_SUPABASE=1`).
- **Reset / re-run:** because every insert is `on conflict do nothing/update`,
  re-running the three files is a no-op on already-loaded rows.
- **Backup:** before the first prod load a JSON snapshot of the affected tables
  was taken; `supabase db dump` needs Docker (unavailable on the Windows box), so
  a logical `db query` snapshot was used instead.
