-- 20260801120000_standards_band_facets.sql — DISTINCT band facets for the
-- standards tagging picker's Stage / Subject / Strand dropdowns.
--
-- WHY (task #51, measured on production 2026-08-01).
--   `GET /api/standards/facets` used to SELECT `band_label` for the whole
--   framework scope with `.limit(12_000)` and dedupe in JS. PostgREST caps every
--   response at this project's `db-max-rows` (1000), silently — HTTP 200, a
--   partial body, and a content-range header nothing read. So the route asked
--   for 12,000 rows and received 1000, and since the query carried no ORDER BY,
--   the 1000 it received were an arbitrary slice.
--
--   Measured on the beta school's default scope (4 configured frameworks, 2508
--   banded rows): the Stage dropdown offered 17 of the 29 values that exist.
--
--   Paginating is not the answer: the read exists only to produce a few dozen
--   DISTINCT labels, and a single framework in this catalog holds 76,968 banded
--   rows — 77 round-trips to fill a dropdown. Push the DISTINCT into Postgres.
--
-- WHY IT IS CEILING-IMMUNE.
--   The function returns exactly ONE row whose columns are text[]. `db-max-rows`
--   caps ROWS, so a one-row result cannot be truncated by it however many
--   distinct labels the scope contains. That is a stronger guarantee than
--   "returns fewer than 1000 rows" — it does not depend on the data.
--
-- SECURITY.
--   SECURITY INVOKER: `standards` RLS still applies to the caller exactly as it
--   did to the direct SELECT this replaces. No privilege is added. `search_path`
--   is pinned with pg_temp LAST so a session-local shadow object cannot hijack
--   an unqualified name (see 20260730120000_security_definer_search_path_backfill).
--
--   Scope is NOT checked here: the route intersects the caller's requested
--   frameworks with `teacher_effective_framework_ids()` before calling, and the
--   catalog is public-read, so band labels leak nothing. Keeping the function
--   scope-agnostic keeps it reusable and keeps the authorisation decision in one
--   place rather than duplicated in SQL.

create or replace function public.standards_band_facets(p_framework_ids uuid[])
returns table (stages text[], subjects text[], strands text[])
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
  with bands as (
    -- DISTINCT first: collapses ~77k rows to a few dozen before any splitting.
    select distinct s.band_label
      from public.standards s
     where s.framework_id = any(p_framework_ids)
       and s.band_label is not null
  ), parts as (
    -- band_label is 'Stage · Subject · Strand' (U+00B7 MIDDLE DOT, space-padded;
    -- Strand optional). This delimiter must stay in lockstep with BAND_SEP in
    -- app/api/standards/facets/route.ts.
    select nullif(btrim(split_part(b.band_label, ' · ', 1)), '') as stage,
           nullif(btrim(split_part(b.band_label, ' · ', 2)), '') as subject,
           nullif(btrim(split_part(b.band_label, ' · ', 3)), '') as strand
      from bands b
  )
  select
    coalesce((select array_agg(distinct p.stage   order by p.stage)   from parts p where p.stage   is not null), '{}'::text[]),
    coalesce((select array_agg(distinct p.subject order by p.subject) from parts p where p.subject is not null), '{}'::text[]),
    coalesce((select array_agg(distinct p.strand  order by p.strand)  from parts p where p.strand  is not null), '{}'::text[]);
$function$;

comment on function public.standards_band_facets(uuid[]) is
  'Distinct Stage/Subject/Strand facet lists for a framework scope. Returns ONE row of text[] columns so the PostgREST db-max-rows ceiling cannot truncate it (task #51).';

revoke all on function public.standards_band_facets(uuid[]) from public, anon;
grant execute on function public.standards_band_facets(uuid[]) to authenticated;
