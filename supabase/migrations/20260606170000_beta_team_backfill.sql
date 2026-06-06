-- ###########################################################################
-- ## Wave 6 — beta / pre-teams account backfill (idempotent, all-states safe)
-- ###########################################################################
-- Source: docs/6.6.26 Teacher-First Individual + Invite Ultraplan.md (§5 backfill),
--         docs/6.6.26 Workspace-Notebook-Team Build Ultraplan.md.
--
-- WHY ─────────────────────────────────────────────────────────────────────
-- New signups get a full workspace (school + grade + team + owner membership +
-- school_admins + self-STM) from provision_individual_workspace (M11).
-- provision_individual_workspace FAILS CLOSED for a teachers row that already
-- exists WITHOUT an owned team (an account created by an older path — domain
-- provisioning / the Claude bypass — before the teams tables existed). So those
-- pre-teams accounts can never invite or administer until their school is given
-- a team. This migration is that one-time, retroactive fix.
--
-- IDEMPOTENT + SAFE FOR EVERY STATE (this is the whole point) ───────────────
--   * No teacher/school rows at all (pure auth + in-code mock) → there are no
--     teamless schools → this migration is a NO-OP. The account gets its
--     workspace from provisioning on its next verified sign-in.
--   * School already has a team (already provisioned the new way) → teams.school_id
--     is UNIQUE, the "teamless" CTE excludes it → SKIPPED, untouched.
--   * School + teachers but NO team (the pre-teams case) → a complete team is
--     created (owner + memberships + workspace-admin + master-edit STM).
--   Re-running changes nothing: every INSERT is guarded by the teams-existence
--   filter or an ON CONFLICT / NOT EXISTS guard. Safe to apply repeatedly.
--
-- ORDERING — this runs AFTER M-WB (20260606160000), whose SECTION 0b seeds
-- school_admins for teams that ALREADY existed at that point. A team created
-- HERE did not exist then, so Step 3 below re-seeds school_admins for the new
-- owners (also idempotent / harmless for owners M-WB already covered).
--
-- NO log_audit_event ── it requires auth.uid(), which is NULL at migration time
-- (this runs as the migration role, bypassing RLS — a privileged one-time data
-- fix, exactly like M-WB SECTION 0b). The migration itself + git history are the
-- audit trail.
--
-- DETERMINISTIC OWNER PICK per teamless school: a teacher who holds a
-- lead/grade_admin TGA in that school, else the earliest-created teacher. A
-- school with NO teachers yields no owner row and is left as-is (owner_teacher_id
-- is NOT NULL — we never fabricate a team without a real owner).
-- ###########################################################################


-- ── STEP 1 — create one team per TEAMLESS school ───────────────────────────
-- seat_cap = max(5, current member count) so the backfilled members always fit
-- (the 5-seat default is the "1 paid + 4 invited" rule for NEW teams; an existing
-- school with more standing members must not be born already over its own cap).
with teamless as (
  select s.id as school_id
  from schools s
  where not exists (select 1 from teams t where t.school_id = s.id)
),
owner_pick as (
  -- one owner per teamless school: lead/grade_admin first, then earliest teacher
  select distinct on (te.school_id)
    te.school_id,
    te.id            as owner_teacher_id,
    te.display_name  as owner_name
  from teachers te
  where te.school_id in (select school_id from teamless)
  order by
    te.school_id,
    (exists (
      select 1
      from teacher_grade_assignments tga
      join grade_levels g on g.id = tga.grade_level_id
      where tga.teacher_id = te.id
        and g.school_id = te.school_id
        and tga.role in ('lead', 'grade_admin')
    )) desc,                 -- TRUE (a lead) sorts before FALSE under DESC
    te.created_at asc,
    te.id asc                -- final tiebreaker for determinism
),
member_counts as (
  select te.school_id, count(*) as n
  from teachers te
  where te.school_id in (select school_id from teamless)
  group by te.school_id
)
insert into teams (school_id, name, owner_teacher_id, seat_cap)
select
  op.school_id,
  coalesce(nullif(btrim(op.owner_name), ''), 'My') || '''s Team',
  op.owner_teacher_id,
  greatest(5, coalesce(mc.n, 1))
from owner_pick op
left join member_counts mc on mc.school_id = op.school_id;
-- (Teamless schools with zero teachers produce no owner_pick row → no team.)


-- ── STEP 2 — every teacher is a member of their school's team ───────────────
-- Role: the owner is always 'lead'; any other teacher holding a lead/grade_admin
-- TGA in the school is 'lead'; everyone else 'teacher'. ON CONFLICT DO NOTHING
-- preserves existing memberships' roles (idempotent — never demotes a live team).
insert into team_memberships (team_id, teacher_id, role)
select
  t.id,
  te.id,
  case
    when te.id = t.owner_teacher_id then 'lead'::grade_role
    when exists (
      select 1
      from teacher_grade_assignments tga
      join grade_levels g on g.id = tga.grade_level_id
      where tga.teacher_id = te.id
        and g.school_id = t.school_id
        and tga.role in ('lead', 'grade_admin')
    ) then 'lead'::grade_role
    else 'teacher'::grade_role
  end
from teams t
join teachers te on te.school_id = t.school_id
on conflict on constraint team_memberships_team_id_teacher_id_key do nothing;


-- ── STEP 3 — the team owner is the workspace admin (decision #2) ────────────
-- school_admins has no unique key (M-WB header note), so guard with NOT EXISTS.
-- Covers owners of teams created in Step 1 (M-WB SECTION 0b ran before them);
-- harmless / no-op for owners M-WB already seeded.
insert into school_admins (school_id, teacher_id, granted_by_teacher_id)
select t.school_id, t.owner_teacher_id, t.owner_teacher_id
from teams t
where not exists (
  select 1 from school_admins sa
  where sa.school_id = t.school_id
    and sa.teacher_id = t.owner_teacher_id
);


-- ── STEP 4 — lead members can edit Master (self-STM, can_edit_master) ───────
-- Mirrors provisioning + redeem's role→STM rule: lead/grade_admin members get
-- master-edit on the school's TEAM-scoped subjects; plain teachers get none (they
-- read + fork). ON CONFLICT DO NOTHING never flips an existing row's
-- can_edit_master (no privilege escalation of already-provisioned members).
insert into subject_team_memberships (subject_id, teacher_id, can_edit_master)
select s.id, m.teacher_id, true
from team_memberships m
join teams t        on t.id = m.team_id
join grade_levels g on g.school_id = t.school_id
join subjects s     on s.grade_level_id = g.id and s.scope = 'team'
where m.role in ('lead', 'grade_admin')
on conflict on constraint subject_team_memberships_subject_id_teacher_id_key do nothing;
