-- ###########################################################################
-- ## unit_assessments — split the write policy; harden the reorder RPC (B3)
-- ###########################################################################
-- Both fixes come from the §4a adversarial review of the applied migration.
-- A NEW file, not an edit of `20260729120000`, because that one has already run
-- on prod and this repo amends live objects only through new migrations.
--
-- ---------------------------------------------------------------------------
-- FIX 1 (HIGH) — `FOR ALL ... USING (...)` IS ALSO A SELECT POLICY.
-- ---------------------------------------------------------------------------
-- `20260729120000` created:
--     create policy unit_assessments_read  ... for select using (can_read_grade(...))
--     create policy unit_assessments_write ... for all    using (can_edit_subject_master(...) or is_grade_lead(...))
-- and documented the read boundary as "readable within the grade". That is NOT
-- what those two policies compose to. `FOR ALL` covers SELECT as well, and RLS
-- policies are PERMISSIVE — they OR together. So the effective read gate became
--     can_read_grade(...) OR can_edit_subject_master(...) OR is_grade_lead(...)
-- and a subject master with no grade assignment could read the unit's
-- assessments despite failing `can_read_grade`.
--
-- The practical exposure is narrow — those are legitimate curriculum roles for
-- that very subject, not a cross-tenant leak — which is why this is a boundary
-- correction rather than an incident. But the comment claimed a boundary the SQL
-- did not enforce, and the next person to reason about who can read this data
-- would have believed the comment.
--
-- HEAD's own `units_write` has the identical pattern (initial_schema.sql:1307).
-- It is deliberately NOT changed here: `units` is read by far more code paths,
-- and tightening it belongs in a reviewed security pass, not as a side effect of
-- a feature tranche. This table ends up STRICTER than its parent, which is the
-- safe direction to be inconsistent in.
--
-- FIX: keep SELECT gated solely by `unit_assessments_read`, and express writes as
-- command-specific INSERT / UPDATE / DELETE policies so none of them can leak
-- into the read path.
-- ---------------------------------------------------------------------------

drop policy if exists unit_assessments_write on public.unit_assessments;

-- INSERT: only WITH CHECK applies (there is no pre-existing row to test).
drop policy if exists unit_assessments_insert on public.unit_assessments;
create policy unit_assessments_insert on public.unit_assessments for insert
with check (
  exists (
    select 1 from public.units u
    where u.id = unit_assessments.unit_id
      and (can_edit_subject_master(u.subject_id) or is_grade_lead(u.grade_level_id))
  )
);

-- UPDATE: USING gates which rows may be targeted, WITH CHECK gates the result —
-- both are required, or a writer could move a row to a unit they cannot edit.
drop policy if exists unit_assessments_update on public.unit_assessments;
create policy unit_assessments_update on public.unit_assessments for update
using (
  exists (
    select 1 from public.units u
    where u.id = unit_assessments.unit_id
      and (can_edit_subject_master(u.subject_id) or is_grade_lead(u.grade_level_id))
  )
)
with check (
  exists (
    select 1 from public.units u
    where u.id = unit_assessments.unit_id
      and (can_edit_subject_master(u.subject_id) or is_grade_lead(u.grade_level_id))
  )
);

drop policy if exists unit_assessments_delete on public.unit_assessments;
create policy unit_assessments_delete on public.unit_assessments for delete
using (
  exists (
    select 1 from public.units u
    where u.id = unit_assessments.unit_id
      and (can_edit_subject_master(u.subject_id) or is_grade_lead(u.grade_level_id))
  )
);

-- `claude_admin_all` (FOR ALL) is intentionally left as-is: it is the
-- account-owner escape hatch and is meant to cover reads too.

-- ---------------------------------------------------------------------------
-- FIX 2 (MEDIUM) — the reorder RPC accepted malformed input and still reported
-- success.
-- ---------------------------------------------------------------------------
-- The original body joined `unnest(p_ids) with ordinality` straight onto the
-- table. Two holes:
--   * DUPLICATE ids produced multiple join matches for one row, and Postgres may
--     pick among them nondeterministically — the same request could yield
--     different orderings.
--   * Ids belonging to another unit were silently skipped, so the seam could see
--     `moved === orderedIds.length` and report a clean success for a request that
--     was partly nonsense.
-- Both now raise, which surfaces as a thrown error in the seam rather than a
-- false success.
--
-- COMPLETENESS is deliberately NOT required. Demanding a full permutation of the
-- unit's rows would make a teammate's concurrent insert fail an otherwise valid
-- drag. Rows omitted from `p_ids` simply keep their positions; `sortUnitAssessments`
-- is total-ordered and breaks ties by id, so a sparse or briefly-colliding
-- `display_order` still renders deterministically.
--
-- Still SECURITY INVOKER with `search_path = public, pg_temp` (pg_temp named LAST
-- — a bare `= public` leaves it implicitly first, this repo's known Critical).
-- The ownership check runs as the caller, so it sees only rows RLS lets it see:
-- an unauthorized caller gets the "not in this unit" error rather than a
-- confirmation that some other unit's id exists.
-- ---------------------------------------------------------------------------

create or replace function public.reorder_unit_assessments(
  p_unit_id uuid,
  p_ids     uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_ids      uuid[] := coalesce(p_ids, '{}'::uuid[]);
  v_len      integer := coalesce(array_length(v_ids, 1), 0);
  v_distinct integer;
  v_owned    integer;
  v_count    integer;
begin
  if v_len = 0 then
    return 0;
  end if;

  select count(distinct x) into v_distinct from unnest(v_ids) as x;
  if v_distinct <> v_len then
    raise exception
      'reorder_unit_assessments: p_ids contains duplicate ids (% supplied, % distinct)',
      v_len, v_distinct;
  end if;

  -- Visible-to-caller rows of THIS unit. A foreign or stale id fails here.
  select count(*) into v_owned
    from public.unit_assessments a
   where a.id = any(v_ids)
     and a.unit_id = p_unit_id;
  if v_owned <> v_len then
    raise exception
      'reorder_unit_assessments: % of % ids are not assessments of unit % (stale, foreign, or not visible)',
      v_len - v_owned, v_len, p_unit_id;
  end if;

  update public.unit_assessments a
     set display_order = (x.ord - 1)::integer
    from unnest(v_ids) with ordinality as x(id, ord)
   where a.id = x.id
     and a.unit_id = p_unit_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.reorder_unit_assessments(uuid, uuid[]) from public;
revoke execute on function public.reorder_unit_assessments(uuid, uuid[]) from anon;
grant  execute on function public.reorder_unit_assessments(uuid, uuid[]) to authenticated;

-- ###########################################################################
-- ACCEPTED AND NOT FIXED HERE (recorded so the next reader knows it was weighed):
--
--   * `authenticated` holds table-level INSERT/UPDATE, so an authorized writer
--     can change `unit_id` or `display_order` directly via PostgREST instead of
--     going through the seam. This is true of EVERY table in this application —
--     the client talks to PostgREST and RLS is the boundary — so a trigger here
--     would be a local exception to an app-wide architecture rather than a fix.
--     It is also not a privilege escalation: the UPDATE policy's WITH CHECK means
--     a row can only be moved to a unit the same person may already edit. Revisit
--     with column-level privileges in a whole-schema security pass.
--
--   * The security assertions in tests/unit-assessments.test.ts are `it.todo`
--     and the shipped tests regex-match migration text rather than executing
--     policies. Proving "subject master without grade read cannot SELECT" needs a
--     disposable Postgres with real anon / teacher / writer sessions — worth
--     building, but it is test INFRASTRUCTURE this project does not have yet, not
--     something this tranche can bolt on credibly. The todos record exactly which
--     behaviours remain unproven.
-- ###########################################################################
