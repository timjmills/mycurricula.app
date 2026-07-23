-- ###########################################################################
-- ## Workspace roster read (follow-up to 20260724120000_multi_workspace.sql)
-- ###########################################################################
-- workspace_members RLS is deliberately SELF-ONLY, so no client/server-action
-- read can enumerate a workspace's roster. This RPC is the sanctioned read
-- path: SECURITY DEFINER, membership re-checked server-side (any MEMBER may
-- read their workspace's roster). Mirrors the CS RPC posture. Read-only → no
-- audit row (parity with list_my_workspaces).

create or replace function list_workspace_members(
  p_school_id uuid
)
returns table (
  teacher_id   uuid,
  display_name text,
  email        text,
  is_owner     boolean,
  is_admin     boolean,
  joined_at    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'list_workspace_members: requires an authenticated caller';
  end if;
  if p_school_id is null then
    raise exception 'list_workspace_members: workspace is required';
  end if;

  if not is_workspace_member(p_school_id) then
    raise exception 'list_workspace_members: caller is not a member of workspace %', p_school_id;
  end if;

  return query
  select wm.teacher_id,
         coalesce(t.display_name, '')::text as display_name,
         coalesce(t.email, '')::text        as email,
         wm.is_owner,
         exists (
           select 1 from school_admins sa
           where sa.school_id = wm.school_id
             and sa.teacher_id = wm.teacher_id
         ) as is_admin,
         wm.created_at as joined_at
  from workspace_members wm
  join teachers t on t.id = wm.teacher_id
  where wm.school_id = p_school_id
  order by coalesce(t.display_name, ''), t.email;
end;
$$;

-- teachers self-read (DECIDED: include). Under the redefined funnel, a teacher
-- whose ACTIVE workspace is not their home (and who is not home school_admin)
-- cannot read their OWN teachers row. Additive, own-row-only, zero effect
-- pre-flag.
drop policy if exists teachers_read_self on teachers;
create policy teachers_read_self on teachers
  for select using (id = auth.uid());

revoke execute on function list_workspace_members(uuid) from public;
revoke execute on function list_workspace_members(uuid) from anon;
grant  execute on function list_workspace_members(uuid) to authenticated;
