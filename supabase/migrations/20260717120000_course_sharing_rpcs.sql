-- ###########################################################################
-- ## Per-course sharing RPCs (Wave 12b-1 phase i — the server/DB seam)
-- ###########################################################################
-- PRODUCT MODEL (user decisions, 7.17.26): inside a team workspace, sharing is
-- per-COURSE (a `subjects` row). A PERSONAL course is invisible to teammates
-- (subjects_read: personal → owner only). Sharing is controlled by the course's
-- CREATOR (its contributor) + a SCHOOL ADMIN. This wave adds the two write-path
-- RPCs that toggle a course between personal and team:
--   * share_course(subject_id)   — personal → team (scope='team', owner_id=null)
--   * unshare_course(subject_id) — team → personal, returned to its CONTRIBUTOR
--
-- Both MIRROR the workspace/notebook admin RPC suite
-- (20260606160000_workspace_notebook_admin.sql) EXACTLY in posture: SECURITY
-- DEFINER, a server-side capability re-check off auth.uid() (UI gating is
-- cosmetic), pinned to the CALLER'S OWN workspace via auth_teacher_school_id(),
-- audited via log_audit_event, and granted to `authenticated` only (never anon).
--
-- ── CONTRIBUTOR PROVENANCE (shared_by_teacher_id) ──────────────────────────
-- The constraint subject_owner_scope_chk forces a team subject to have
-- owner_id NULL, so sharing must drop owner_id — which would ERASE who brought
-- the course. To keep the creator half of "creator + admin control sharing"
-- alive across a share (team-lead ruling B), share_course records the CONTRIBUTOR
-- in `subjects.shared_by_teacher_id`. The contributor is the course's OWNER AT
-- SHARE TIME (the teacher whose personal course it was) — NOT necessarily the
-- caller who triggered share: when a school admin shares another teacher's
-- personal course, the contributor is that teacher, so an admin can never steal a
-- course by sharing-then-unsharing it. (In the common flow the owner shares their
-- own course, so contributor == caller.)
--
-- ── AUTHORIZATION (per subject's grade's school) ───────────────────────────
-- share:   subjects.owner_id = auth.uid()  OR  is_school_admin(<grade's school>)
--          (owner = the personal contributor; admin may share on their behalf)
-- unshare: shared_by_teacher_id = auth.uid()  OR  is_school_admin(<grade's school>)
--          (the CONTRIBUTOR may reclaim their own shared course, OR an admin)
-- unshare RETURNS the course to its contributor regardless of who triggers it:
-- owner_id := shared_by_teacher_id (an admin unshare returns it to whoever brought
-- it, never to the admin). Only if the contributor's account is gone
-- (shared_by_teacher_id nulled by the on-delete-set-null FK) does it fall back to
-- the caller — otherwise the course would be permanently un-reclaimable.
--
-- ── ACCEPTED TRADEOFF: delete-contributor-then-claim ───────────────────────
-- The coalesce(shared_by, caller) fallback above means a workspace admin who first
-- DELETES the contributor's account (nulling shared_by via the FK) can then unshare
-- the course to owner = themselves. This is a deliberate, accepted tradeoff, not an
-- oversight (reviewer R1 INFO): the alternative — leaving owner NULL — violates
-- subject_owner_scope_chk and strands the course as permanently un-reclaimable.
-- Deleting a teammate's account is already a destructive, high-privilege act; the
-- resulting reclaim is audit-trailed (course_unshared with returned_to=caller), so
-- it is visible, not silent. Preserving the contributor across account deletion is
-- out of scope for this seam.
--
-- ── FOUNDING-SUBJECT LOCK (the 8 locked team subjects) ─────────────────────
-- The 8 per-grade founding subjects (Math…SEL), and any team-native course (e.g.
-- one an admin creates directly as team), must NEVER be unshared — they have no
-- contributor to return to. There is no is_founding/is_locked marker in the
-- schema, and inferring "founding" from the color slug is fragile. This migration
-- adds the INVERSE positive marker `subjects.shared_from_personal`: set true ONLY
-- by share_course. unshare_course refuses any team course whose flag is false, so
-- founding + team-native courses are permanently unshareable. This needs NO
-- backfill (every existing team subject is founding → flag correctly stays false)
-- and NO create_notebook change (its 8 seeds default false, correctly protected).
--
-- ── SELF-STM ON SHARE (contributor keeps master-edit) ──────────────────────
-- A team subject's lesson master-edit is gated per-teacher by
-- subject_team_memberships.can_edit_master (can_edit_subject_master()). When a
-- personal course becomes team, share_course inserts a self-STM
-- can_edit_master=true FOR THE CONTRIBUTOR (mirrors provisioning / the WB
-- create_notebook self-STM), so the teacher who brought the course keeps edit
-- rights on their own contribution instead of losing them the instant it is
-- team-gated. (Approved, team-lead ruling B.)
--
-- ── UNSHARE-WITH-CONTENT (orphan guard) ────────────────────────────────────
-- Reclaiming a team course to personal makes the subject invisible to every
-- teammate (subjects_read). Any teammate who built on it — a personal fork
-- (personal_core_lesson_event_copies), an authored lesson
-- (personal_authored_lessons), or a completion (completion_status → master
-- event → subject) — would be ORPHANED. unshare_course BLOCKS when any teacher
-- OTHER THAN THE RECLAIM TARGET (v_target_owner — the contributor the course
-- returns to) has such content, and NAMES the blocking teachers in the error so
-- it is classroom-actionable (team-lead ruling C). The exclusion is the reclaim
-- TARGET, not the caller: the target keeps visibility (they become the owner) so
-- their rows never orphan, while an ADMIN caller who reclaims to someone else DOES
-- lose visibility and their own content would orphan → it must block (Codex R1 C).
-- Reversible: teammates reset their copies, then unshare succeeds.
--
-- ── CONCURRENCY / TOCTOU (row lock + accepted residual race) ───────────────
-- Both RPCs `SELECT ... FOR UPDATE OF s` the subject row FIRST, before any authz
-- or state read, so concurrent share_course / unshare_course on the SAME course
-- serialize and every scope/provenance decision (and the offender check, which
-- runs immediately before the write) is made from a non-stale, locked read.
-- RESIDUAL WINDOW (accepted, not closed this wave): a teammate WRITING dependent
-- content (a fork / authored lesson / completion) does not lock the subject row,
-- so one committed in the gap between the offender check and this transaction's
-- commit is not seen and would orphan. Closing it would require locking through
-- every content-write path (out of scope). It is a ~second-scale, self-healing
-- race: the orphaned fork simply becomes invisible until the course is re-shared;
-- no data is lost. Do NOT build a content-write trigger protocol for this.
--
-- ── CONTRIBUTOR-IDENTITY VISIBILITY (defense in depth) ─────────────────────
-- shared_by_teacher_id records who contributed a shared course. Codex R1 flagged
-- exposing it to every grade reader as a leak; the independent reviewer read it as
-- legitimate WITHIN-grade provenance with no cross-tenant exposure (subjects_read
-- already scopes reads to the grade). Adjudicated split (team-lead): APPLY the
-- projection fix but SKIP a column-level REVOKE. So the ordinary grade course list
-- never projects it (lib/subjects/source.ts SUBJECT_ROW_COLUMNS excludes it —
-- cheap defense in depth), and the contributor id/name + can-manage affordance is
-- surfaced through the gated list_course_sharing (SECTION 3), which returns a row
-- exclusively for courses the caller may manage (own personal / own contributed /
-- any-if-admin). A column-level `REVOKE SELECT (shared_by_teacher_id)` was
-- deliberately NOT added: within-grade provenance is legitimate, so the hard
-- enforcement is not worth the client-library breakage risk.
--
-- ADDITIVE + IDEMPOTENT-FRIENDLY (safe to run on a live DB, safe to re-run):
--   * enum   → ALTER TYPE ... ADD VALUE IF NOT EXISTS.
--   * column → ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
--   * function → CREATE OR REPLACE FUNCTION.
--   * grants → REVOKE-then-GRANT.
-- No RLS policy is added or changed (SECURITY DEFINER RPCs bypass RLS). No seed
-- change. The audit_action values are only REFERENCED at RPC CALL time (never in
-- this migration's transaction), so ADD VALUE + later use is safe (PG 17, same
-- precedent as the admin migration).
--
-- Cross-references:
--   M1  = 20260518102823_initial_schema.sql   (subjects [scope/owner_id/
--         subject_owner_scope_chk], subject_team_memberships [STM, unique
--         (subject_id, teacher_id)], teachers [display_name], grade_levels,
--         master_core_lesson_events, personal_core_lesson_event_copies,
--         completion_status, audit enums, is_school_admin(), can_read_grade(),
--         auth_teacher_school_id(), log_audit_event()).
--   M8  = 20260601120000_planner_sections_personal.sql (personal_authored_lessons).
--   WB  = 20260606160000_workspace_notebook_admin.sql (the mirrored RPC pattern).
-- ###########################################################################


-- ###########################################################################
-- ## SECTION 0a — AUDIT ENUM EXTENSION (course share / unshare actions)
-- ###########################################################################
-- Reuse the existing 'subject' audit_entity value (M1) for entity_type. Only the
-- two action verbs are new. IF NOT EXISTS makes each ADD idempotent. These values
-- are resolved at RPC CALL time (committed later), never in this transaction.
alter type audit_action add value if not exists 'course_shared';
alter type audit_action add value if not exists 'course_unshared';


-- ###########################################################################
-- ## SECTION 0b — SCHEMA: the founding-lock marker + contributor provenance
-- ###########################################################################
-- `shared_from_personal` = "this team course originated from a personal share and
-- is therefore reclaimable". Founding + team-native courses keep the default
-- false → unshare_course refuses them. No backfill: every existing team subject
-- is founding, so false is already correct.
alter table subjects
  add column if not exists shared_from_personal boolean not null default false;

comment on column subjects.shared_from_personal is
  'True only for a team course created by share_course (personal→team); gates '
  'unshare_course. Founding/team-native subjects stay false and can never be '
  'unshared. See 20260717120000_course_sharing_rpcs.sql.';

-- `shared_by_teacher_id` = the CONTRIBUTOR (the personal owner at share time) a
-- shared course is returned to on unshare. NULL for founding/team-native courses.
-- on delete set null: if the contributor's account is removed, provenance clears
-- (unshare then falls back to the caller so the course is not un-reclaimable).
alter table subjects
  add column if not exists shared_by_teacher_id uuid
    references teachers(id) on delete set null;

comment on column subjects.shared_by_teacher_id is
  'The contributor (personal owner at share time) a shared course reclaims to on '
  'unshare_course — NOT necessarily the caller who triggered share (an admin '
  'sharing another teacher''s course records that teacher). See '
  '20260717120000_course_sharing_rpcs.sql.';


-- ###########################################################################
-- ## SECTION 1 — share_course RPC (contributor OR workspace admin)
-- ###########################################################################
-- Share a PERSONAL course with the whole team: scope personal→team, drop the
-- owner (constraint: team ⇒ owner_id NULL), mark shared_from_personal=true, and
-- record the contributor in shared_by_teacher_id so unshare can return it to them.
create or replace function share_course(
  p_subject_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_school_id uuid;
  v_grade_id  uuid;
  v_scope     subject_scope;
  v_owner     uuid;   -- the personal course's owner = the CONTRIBUTOR
begin
  if v_uid is null then
    raise exception 'share_course: requires an authenticated caller';
  end if;

  -- ── RESOLVE + LOCK the course, PINNED to the caller's own workspace ────────
  -- FOR UPDATE OF s locks the subject row for the whole transaction (before any
  -- authz / state read), so concurrent share_course / unshare_course on the SAME
  -- course serialize and every provenance / scope decision is made from a
  -- non-stale read (TOCTOU). Cross-tenant isolation: a foreign / non-existent
  -- subject resolves to NULL and is rejected below.
  select s.scope, s.owner_id, s.grade_level_id, g.school_id
    into v_scope, v_owner, v_grade_id, v_school_id
  from subjects s
  join grade_levels g on g.id = s.grade_level_id
  where s.id = p_subject_id
    and g.school_id = auth_teacher_school_id()
  for update of s;

  if v_school_id is null then
    raise exception 'share_course: course % not found in caller''s workspace', p_subject_id;
  end if;

  -- Must currently be personal (an already-team course is an explicit error, not
  -- a silent no-op). A personal course always has a non-null owner (constraint).
  if v_scope <> 'personal' then
    raise exception 'share_course: course % is already shared with the team', p_subject_id;
  end if;

  -- ── CAPABILITY RE-CHECK: the course's owner (contributor) OR a workspace admin.
  -- coalesce the comparison to false for null-safety: v_owner is non-null here (a
  -- personal course has a non-null owner and the scope check above already fired),
  -- but this keeps the guard fail-closed if that invariant is ever refactored — a
  -- NULL owner must never bypass the IF via three-valued logic (see unshare_course).
  if not (coalesce(v_owner = v_uid, false) or is_school_admin(v_school_id)) then
    raise exception 'share_course: caller is not the course owner or a workspace admin';
  end if;

  -- Cannot share into a grade the caller cannot read (defensive; owner + admin
  -- both satisfy this on the legit paths).
  if not can_read_grade(v_grade_id) then
    raise exception 'share_course: caller cannot read grade %', v_grade_id;
  end if;

  -- ── PERSONAL → TEAM ───────────────────────────────────────────────────────
  -- Record the CONTRIBUTOR (v_owner, the owner at share time), NOT the caller, so
  -- an admin sharing another teacher's course cannot later reclaim it themselves.
  update subjects
     set scope                = 'team',
         owner_id             = null,     -- constraint: team ⇒ owner_id NULL
         shared_from_personal = true,     -- reclaimable (founding-lock inverse)
         shared_by_teacher_id = v_owner,  -- contributor provenance
         updated_at           = now()
   where id = p_subject_id;

  -- ── PRESERVE THE CONTRIBUTOR'S MASTER-EDIT via self-STM (can_edit=true) ─────
  -- STM goes to the CONTRIBUTOR (v_owner), so the teacher who brought the course
  -- keeps lesson master-edit even when an admin performed the share.
  insert into subject_team_memberships (subject_id, teacher_id, can_edit_master)
  values (p_subject_id, v_owner, true)
  on conflict on constraint subject_team_memberships_subject_id_teacher_id_key
    do update set can_edit_master = true, updated_at = now();

  -- ── AUDIT ──────────────────────────────────────────────────────────────────
  perform log_audit_event(
    'course_shared',
    'subject',
    p_subject_id,
    v_grade_id,
    v_school_id,
    jsonb_build_object('shared_by', v_uid, 'contributor', v_owner)
  );
end;
$$;


-- ###########################################################################
-- ## SECTION 2 — unshare_course RPC (contributor OR workspace admin)
-- ###########################################################################
-- Reclaim a shared course back to personal and RETURN IT TO ITS CONTRIBUTOR.
-- Refuses a founding/team-native subject (shared_from_personal=false) and refuses
-- when other teachers have dependent content (orphan guard). See header.
create or replace function unshare_course(
  p_subject_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid            uuid := auth.uid();
  v_school_id      uuid;
  v_grade_id       uuid;
  v_scope          subject_scope;
  v_shared         boolean;  -- shared_from_personal
  v_shared_by      uuid;     -- the contributor (owner at share time)
  v_target_owner   uuid;     -- who the course reclaims to
  v_offender_count integer;
  v_offender_names text;
begin
  if v_uid is null then
    raise exception 'unshare_course: requires an authenticated caller';
  end if;

  -- ── RESOLVE + LOCK the course, PINNED to the caller's own workspace ────────
  -- FOR UPDATE OF s locks the subject row for the whole transaction (before any
  -- authz / state read), so concurrent share/unshare on the SAME course serialize
  -- and the offender check below reads a stable roster (TOCTOU). Cross-tenant
  -- isolation: a foreign / non-existent subject resolves to NULL, rejected below.
  select s.scope, s.shared_from_personal, s.shared_by_teacher_id,
         s.grade_level_id, g.school_id
    into v_scope, v_shared, v_shared_by, v_grade_id, v_school_id
  from subjects s
  join grade_levels g on g.id = s.grade_level_id
  where s.id = p_subject_id
    and g.school_id = auth_teacher_school_id()
  for update of s;

  if v_school_id is null then
    raise exception 'unshare_course: course % not found in caller''s workspace', p_subject_id;
  end if;

  -- Must currently be a team course.
  if v_scope <> 'team' then
    raise exception 'unshare_course: course % is not a team course', p_subject_id;
  end if;

  -- ── FOUNDING-LOCK GUARD ─────────────────────────────────────────────────────
  -- Only a course that originated from a personal share is reclaimable. The 8
  -- founding subjects + any team-native course carry shared_from_personal=false.
  if not v_shared then
    raise exception
      'unshare_course: course % is a founding team subject and cannot be unshared',
      p_subject_id
      using errcode = 'check_violation';
  end if;

  -- ── CAPABILITY RE-CHECK: the CONTRIBUTOR OR a workspace admin. ─────────────
  -- The contributor (shared_by_teacher_id) may reclaim their own shared course;
  -- an admin may also reclaim it (but it still returns to the contributor below).
  -- NULL-SAFETY (three-valued logic): when the contributor's account was deleted,
  -- v_shared_by is NULL, so `v_shared_by = v_uid` is NULL. For a non-admin caller
  -- the whole OR is `NULL or false` = NULL, and PL/pgSQL treats a NULL IF-condition
  -- as FALSE — `if not (NULL) then` would NOT fire, silently BYPASSING the guard
  -- and letting any grade teacher claim an orphaned-contributor course. coalesce
  -- the comparison to false so a NULL contributor never satisfies the caller
  -- branch; only a real admin passes (the documented delete-then-claim path).
  if not (coalesce(v_shared_by = v_uid, false) or is_school_admin(v_school_id)) then
    raise exception 'unshare_course: caller is not the course contributor or a workspace admin';
  end if;

  -- ── GRADE-READ GUARD (fail early + cleanly) ─────────────────────────────────
  -- Parallels share_course's can_read_grade check. Without it, a contributor who
  -- was later removed from the grade still passes the capability check (they are
  -- still shared_by_teacher_id), mutates the row, and only trips log_audit_event's
  -- grade gate at the END — an opaque late rollback. Fail up front instead. Admins
  -- pass (is_school_admin ⇒ can_read_grade); an in-grade contributor passes via
  -- their TGA; a removed contributor is cleanly rejected here.
  if not can_read_grade(v_grade_id) then
    raise exception 'unshare_course: caller cannot read grade %', v_grade_id;
  end if;

  -- ── RECLAIM TARGET ──────────────────────────────────────────────────────────
  -- The course returns to its CONTRIBUTOR (constraint: personal ⇒ owner_id NOT
  -- NULL). Fall back to the caller ONLY if the contributor's account is gone
  -- (shared_by nulled by the FK) — otherwise the course would be un-reclaimable.
  -- Computed BEFORE the orphan guard because the guard's "whose content orphans?"
  -- question is answered relative to the TARGET, not the caller (see below).
  v_target_owner := coalesce(v_shared_by, v_uid);

  -- ── ORPHAN GUARD (block + name the blockers) ────────────────────────────────
  -- The course reclaims to v_target_owner, who KEEPS visibility of it (they become
  -- its owner). So their dependent rows never orphan and must NOT block. EVERY
  -- OTHER teacher — including the admin CALLER when they reclaim to someone else —
  -- loses visibility, so their fork / authored lesson / completion would orphan and
  -- MUST block. Hence the exclusion is `<> v_target_owner`, NOT `<> v_uid`. The
  -- error names the blocking teachers so it is classroom-actionable.
  with offenders as (
    select p.teacher_id as tid
      from personal_core_lesson_event_copies p
      where p.subject_id = p_subject_id and p.teacher_id <> v_target_owner
    union
    select pa.owner_id
      from personal_authored_lessons pa
      where pa.subject_id = p_subject_id and pa.owner_id <> v_target_owner
    union
    select c.teacher_id
      from completion_status c
      join master_core_lesson_events m on m.id = c.core_lesson_event_id
      where m.subject_id = p_subject_id and c.teacher_id <> v_target_owner
  )
  select count(*),
         string_agg(coalesce(t.display_name, o.tid::text), ', ' order by t.display_name)
    into v_offender_count, v_offender_names
  from offenders o
  left join teachers t on t.id = o.tid;

  if coalesce(v_offender_count, 0) > 0 then
    raise exception
      'unshare_course: % other teacher(s) have work in this course (%). Ask them to reset their copies before unsharing.',
      v_offender_count, v_offender_names
      using errcode = 'check_violation';
  end if;

  -- ── TEAM → PERSONAL, RETURNED TO THE CONTRIBUTOR ───────────────────────────
  -- Keep shared_from_personal + shared_by_teacher_id as provenance (a re-share
  -- overwrites shared_by). owner_id is the reclaim target computed above.
  update subjects
     set scope      = 'personal',
         owner_id   = v_target_owner,
         updated_at = now()
   where id = p_subject_id;

  -- ── STM CLEANUP ─────────────────────────────────────────────────────────────
  -- STM (team master-edit membership) is inert on a personal subject; drop every
  -- STM row for this now-personal course so a later re-share does not resurrect
  -- stale grants. (Mirrors remove_member's STM deletion.) The reclaiming owner
  -- edits it via the personal owner path, not STM, so nothing is lost.
  delete from subject_team_memberships stm
  where stm.subject_id = p_subject_id;

  -- ── AUDIT ──────────────────────────────────────────────────────────────────
  perform log_audit_event(
    'course_unshared',
    'subject',
    p_subject_id,
    v_grade_id,
    v_school_id,
    jsonb_build_object('reclaimed_by', v_uid, 'returned_to', v_target_owner)
  );
end;
$$;


-- ###########################################################################
-- ## SECTION 3 — list_course_sharing RPC (manage-sharing affordance; gated)
-- ###########################################################################
-- The ordinary grade course list (lib/subjects/source.ts listSubjectsForGrade)
-- deliberately does NOT project the contributor identity, so a plain teammate
-- never learns who contributed a shared course (contributor-identity leak, Codex
-- R1 M). Provenance is exposed ONLY here, to callers who may MANAGE a course's
-- sharing: this SECURITY DEFINER RPC returns a row per manageable course —
--   * a personal course the caller OWNS (shareable), OR
--   * a team course the caller CONTRIBUTED (reclaimable), OR
--   * every course, when the caller is a WORKSPACE ADMIN.
-- Non-manageable courses are omitted entirely, so a teammate's contributor id is
-- never returned to anyone but the contributor themselves or an admin. `can_share`
-- / `can_unshare` are the affordance flags the manage-sharing UI consumes;
-- can_unshare here reflects scope + founding-lock + capability only (the content
-- orphan-block is evaluated at unshare time and surfaced as its error).
create or replace function list_course_sharing(
  p_grade_level_id uuid
)
returns table (
  subject_id           uuid,
  scope                subject_scope,
  shared_from_personal boolean,
  shared_by_teacher_id uuid,
  shared_by_name       text,
  can_share            boolean,
  can_unshare          boolean
)
language plpgsql
security definer
set search_path = public
as $$
-- RETURNS TABLE column names become OUT params; every column reference in the
-- body is table-qualified (s./t.) so none is ambiguous, but pin the resolution to
-- COLUMN so a future unqualified edit can never silently shadow a column with an
-- OUT param (a CALL-time-only failure this repo's no-DB-harness tests would miss).
#variable_conflict use_column
declare
  v_uid       uuid := auth.uid();
  v_school_id uuid;
  v_is_admin  boolean;
begin
  if v_uid is null then
    raise exception 'list_course_sharing: requires an authenticated caller';
  end if;

  -- Pin the grade to the caller's own workspace (cross-tenant isolation).
  select g.school_id into v_school_id
  from grade_levels g
  where g.id = p_grade_level_id
    and g.school_id = auth_teacher_school_id();

  if v_school_id is null then
    raise exception 'list_course_sharing: grade % not found in caller''s workspace', p_grade_level_id;
  end if;
  if not can_read_grade(p_grade_level_id) then
    raise exception 'list_course_sharing: caller cannot read grade %', p_grade_level_id;
  end if;

  v_is_admin := is_school_admin(v_school_id);

  -- NULL-SAFETY: s.owner_id (null for team) and s.shared_by_teacher_id (null for
  -- founding/deleted-contributor) are nullable, so every comparison against them is
  -- coalesce'd to false. In the WHERE a NULL branch would fail-CLOSED (exclude the
  -- row) already, but the computed can_share / can_unshare flags must not surface a
  -- NULL where the client's `boolean` type expects false — coalesce the whole flag.
  return query
  select s.id,
         s.scope,
         s.shared_from_personal,
         s.shared_by_teacher_id,
         t.display_name,
         coalesce(
           s.scope = 'personal' and (v_is_admin or s.owner_id = v_uid),
           false
         ) as can_share,
         coalesce(
           s.scope = 'team' and s.shared_from_personal
             and (v_is_admin or s.shared_by_teacher_id = v_uid),
           false
         ) as can_unshare
  from subjects s
  left join teachers t on t.id = s.shared_by_teacher_id
  where s.grade_level_id = p_grade_level_id
    and (
      v_is_admin
      or coalesce(s.scope = 'personal' and s.owner_id = v_uid, false)  -- own personal
      or coalesce(s.scope = 'team' and s.shared_by_teacher_id = v_uid, false)  -- own contributed
    )
  order by s.display_order;
end;
$$;


-- ###########################################################################
-- ## SECTION 4 — RPC EXECUTE GRANTS (authenticated only; never anon)
-- ###########################################################################
-- Each RPC runs its own server-side capability re-check off auth.uid() and guards
-- a null uid, so each is granted to `authenticated` and revoked from public/anon.
-- REVOKE-then-GRANT is idempotent.
revoke execute on function share_course(uuid)   from public;
revoke execute on function share_course(uuid)   from anon;
grant  execute on function share_course(uuid)   to authenticated;

revoke execute on function unshare_course(uuid) from public;
revoke execute on function unshare_course(uuid) from anon;
grant  execute on function unshare_course(uuid) to authenticated;

revoke execute on function list_course_sharing(uuid) from public;
revoke execute on function list_course_sharing(uuid) from anon;
grant  execute on function list_course_sharing(uuid) to authenticated;


-- ###########################################################################
-- End of per-course sharing RPCs.
-- ###########################################################################
