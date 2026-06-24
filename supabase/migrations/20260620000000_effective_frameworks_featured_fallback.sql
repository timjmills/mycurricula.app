-- ###########################################################################
-- ## Effective frameworks — fall back to the FEATURED set when none configured
-- ###########################################################################
-- WHY
-- 20260615120000_framework_selection.sql gave every teacher a scoped effective
-- framework set: (school default − my removals) ∪ (my additions). But when a
-- school has set no default AND the teacher has added nothing, that set is EMPTY —
-- and the /daily "Tag standards" picker (which scopes search/facets to the
-- effective set) dead-ends on "No frameworks selected yet" with no way forward.
--
-- The product intent (CLAUDE.md / the standards UX brief) is "major standards
-- UPFRONT, then scope to theirs once set." So: when nothing is configured, fall
-- back to the curated MAJOR set (standards_frameworks.is_featured) instead of
-- returning empty. As soon as a teacher or admin picks ANY framework, the
-- configured set wins and the fallback goes dormant.
--
-- IDEMPOTENT + ADDITIVE — `create or replace function` only; same signature,
-- SECURITY DEFINER, STABLE, pinned search_path, same grants (unchanged here).
-- Safe to run live and safe to re-run.
--
-- SAFETY — this function is used ONLY as an app-layer scoping filter by the
-- standards API routes (frameworks/facets/search) and lib/standards/code-lookup;
-- it is referenced by NO RLS policy and NO other DB function (verified against
-- live prod). The fallback returns only featured catalog frameworks, which every
-- authenticated teacher can already read (provenance='catalog'). So this changes
-- no privilege boundary — it only widens the DEFAULT scope from "nothing" to
-- "the major frameworks" for teachers who haven't configured a set yet.

create or replace function public.teacher_effective_framework_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with configured as (
    -- (school default for MY school − frameworks I disabled)
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
    -- ∪ (frameworks I enabled)
    select tf.framework_id
      from public.teacher_frameworks tf
     where tf.teacher_id = auth.uid()
       and tf.enabled = true
  )
  select framework_id from configured
  union all
  -- Fallback: nothing configured → the curated MAJOR (featured) frameworks, so
  -- tagging works out of the box. Contributes ONLY when `configured` is empty.
  select f.id
    from public.standards_frameworks f
   where f.is_featured = true
     and f.is_active = true
     and not exists (select 1 from configured);
$$;

revoke all on function public.teacher_effective_framework_ids() from public, anon;
grant execute on function public.teacher_effective_framework_ids() to authenticated;
