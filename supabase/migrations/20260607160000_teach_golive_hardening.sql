-- =============================================================================
-- MyCurricula — Teach go-live hardening (Supabase-persistence flip blockers)
-- =============================================================================
-- The Teach view's Supabase persistence (lib/teach/supabase-source.ts) is wired
-- but DORMANT in production (NEXT_PUBLIC_TEACH_USE_SUPABASE unset → the mock
-- source drives every surface). An end-to-end audit of the about-to-go-live flag
-- path surfaced schema-level blockers that only bite once the flag flips. This
-- migration closes them so the flip is safe. Every change is backward-compatible
-- with the dormant state (the boards/widgets tables are empty in prod today, so
-- the type conversions touch zero rows).
--
-- BLOCKERS CLOSED
--   1. widgets.type was a 12-value enum (`widget_type`) declared when the widget
--      catalog was small; the WidgetType union in lib/types.ts has since grown to
--      ~50 kinds (traffic, scoreboard, dice, text, the 5.31 pedagogical set, …).
--      Seeding a default board under Supabase inserts those kinds → enum
--      violation on first open. FIX: convert widgets.type → text. The header of
--      20260530090000 itself prescribes "text (not enum) where a value set may
--      grow without a migration (cf. resources.provider)"; the catalog's growth
--      proved widget kinds are exactly that case. The TS WidgetType union remains
--      the source of truth (widgetToRow only ever writes a WidgetType); a light
--      CHECK guards against empty/oversized garbage.
--   2. widgets.id was `uuid default gen_random_uuid()`, but the editor mints
--      STRING ids (`w-embed-…`, `w-<kind>-…`, `w-new-…`) and writes them through
--      widgetToRow / commitPages / upsertWidget → "invalid input syntax for type
--      uuid" insert failure. The copy paths (copyWidgetsOnto) instead OMIT id to
--      lean on the default. FIX: widgets.id → text with a `(gen_random_uuid())
--      ::text` default, so the editor's string ids persist verbatim AND the copy
--      paths still receive a minted id. Nothing references widgets.id (it is a
--      leaf PK — board_annotations/widgets both FK to boards.id), so this is safe.
--   3. boards.grade_level_id was accepted independently of the board's lesson;
--      RLS checks the STAMPED grade, not that the lesson belongs to that grade, so
--      a mismatched (lesson, grade) pair could be written. FIX: a BEFORE
--      INSERT/UPDATE trigger enforces grade == the lesson's grade, resolved via
--      unit→grade (the same path auth_can_read_lesson uses). The app derives the
--      grade server-side from the lesson via the new `teach_grade_for_lesson()`
--      helper — which also fixes a LATENT bug: the app read a non-existent
--      `master_core_lesson_events.grade_level_id` column (grade lives on units),
--      so default-team-set seeding would have errored under Supabase.
--   4. pushBoardsToTeam's team-set displacement (plan §13.1: delete the lesson's
--      team set, then re-insert the pushed set) ran as SEPARATE PostgREST calls —
--      a failure after the delete left the team with NO boards. FIX:
--      `teach_replace_team_set()`, a SECURITY INVOKER function (so the caller's
--      RLS still gates every row — this only adds atomicity, never privilege)
--      that does the delete + bulk insert of boards and their page-0 widget
--      mirror in ONE transaction.
--
-- PRIVACY (plan §11.4) is untouched: names are stripped at the app boundary
-- (widgetToRow / stripNames) before any payload reaches these functions; the RPC
-- below persists STRUCTURE-ONLY jsonb exactly as the per-call path already does.
-- =============================================================================


-- #############################################################################
-- ## SECTION 1 — widgets.type: enum (`widget_type`) → text  (Blocker 1)
-- #############################################################################
-- Convert the column off the stale 12-value enum, then retire the now-unused
-- type. A light CHECK keeps the column honest (non-empty, bounded) without
-- pinning it to a value set that demonstrably grows. New widget kinds now land
-- with NO migration — exactly the "may grow" doctrine 20260530090000 cited.

alter table widgets
  alter column type type text using type::text;

-- The enum is no longer referenced by any column (widgets.type was its sole use;
-- board_templates.widgets is jsonb, not the enum). Retire it so it can't drift
-- back into use as a stale 12-value gate.
drop type if exists widget_type;

alter table widgets
  drop constraint if exists widget_type_nonempty_chk;
alter table widgets
  add constraint widget_type_nonempty_chk
  check (type <> '' and char_length(type) <= 64);


-- #############################################################################
-- ## SECTION 2 — widgets.id: uuid → text (keep a minted default)  (Blocker 2)
-- #############################################################################
-- The editor's optimistic string ids (`w-…`) become the persisted ids, matching
-- the domain's opaque-string Widget.id convention. The cast default preserves the
-- copy paths that OMIT id (copyWidgetsOnto deletes id to lean on the default).
-- Drop the uuid default before retyping, then install the text default.

alter table widgets alter column id drop default;
alter table widgets alter column id type text using id::text;
alter table widgets alter column id set default (gen_random_uuid())::text;


-- #############################################################################
-- ## SECTION 3 — lesson→grade helper + integrity trigger  (Blocker 3)
-- #############################################################################

-- ---------------------------------------------------------------------------
-- teach_grade_for_lesson — resolve a master lesson's grade via unit→grade (the
-- canonical path auth_can_read_lesson uses). The app calls this to STAMP a
-- board's grade from its lesson instead of trusting a caller-supplied grade (and
-- instead of reading a non-existent master_core_lesson_events.grade_level_id).
-- SECURITY INVOKER: a teacher seeding/creating a board for a lesson can already
-- read that lesson under RLS, so the lookup runs with their own privileges (least
-- privilege; not used inside an RLS policy, so no recursion concern).
-- ---------------------------------------------------------------------------
create or replace function teach_grade_for_lesson(p_lesson uuid)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select u.grade_level_id
    from master_core_lesson_events m
    join units u on u.id = m.unit_id
   where m.id = p_lesson;
$$;

grant execute on function teach_grade_for_lesson(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- teach_enforce_board_lesson_grade — a board attached to a lesson MUST carry that
-- lesson's grade. RLS only proves the caller can read the stamped grade; this
-- closes the gap where a readable-but-WRONG grade is stamped on a lesson board.
-- Lesson-less boards (sandbox / library copies, master_core_lesson_event_id null)
-- are unconstrained. SECURITY DEFINER so the lesson→grade lookup is never blocked
-- by the caller's row visibility; it reads only a grade id (no data leak) and
-- raises on mismatch.
-- ---------------------------------------------------------------------------
create or replace function teach_enforce_board_lesson_grade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lesson_grade uuid;
begin
  if new.master_core_lesson_event_id is null then
    return new;  -- lesson-less board: nothing to enforce against
  end if;
  select u.grade_level_id
    into v_lesson_grade
    from master_core_lesson_events m
    join units u on u.id = m.unit_id
   where m.id = new.master_core_lesson_event_id;
  if v_lesson_grade is null then
    raise exception
      'Teach: lesson % has no resolvable grade (unit→grade)', new.master_core_lesson_event_id;
  end if;
  if new.grade_level_id is distinct from v_lesson_grade then
    raise exception
      'Teach: board grade % does not match lesson % grade % (stamp the lesson''s grade)',
      new.grade_level_id, new.master_core_lesson_event_id, v_lesson_grade;
  end if;
  return new;
end;
$$;

-- Fire only when the grade or the lesson link is set/changed (no overhead on
-- cosmetic board updates that touch neither column).
create trigger trg_boards_lesson_grade
  before insert or update of grade_level_id, master_core_lesson_event_id on boards
  for each row execute function teach_enforce_board_lesson_grade();


-- #############################################################################
-- ## SECTION 4 — teach_replace_lesson_set: validated atomic displacement
-- #############################################################################
-- The §13.1 "push to team" repository op (and the sandbox-pin "replace my
-- personal set" op) DELETE a lesson's existing set for a (scope, owner) and
-- re-insert the new set. Done as separate client calls, a mid-sequence failure
-- wiped the set with no replacement. This wraps the whole displacement in ONE
-- transaction (a plpgsql function body IS the transaction boundary) and serves
-- BOTH the team set (scope='team', owner=null) and a teacher's personal set
-- (scope='personal', owner=auth.uid()).
--
-- VALIDATE-BEFORE-DELETE (audit F2). This RPC is a `'use server'`-reachable +
-- directly-PostgREST-callable endpoint. RLS gates each row, but RLS PERMITS a
-- team member to delete the team set, so a direct call with p_boards=[] would
-- delete the set and insert nothing — wiping it. And a crafted payload could
-- target a different lesson/scope/owner than intended. So we VALIDATE the whole
-- payload first and RAISE (rolling back, before any delete) unless it is a
-- well-formed replacement for exactly (p_lesson, p_scope, p_owner):
--   * p_boards is a non-empty array;
--   * (p_scope, p_owner) is a legal pair (team⇒null owner, personal⇒non-null);
--   * every board targets (p_lesson, p_scope, p_owner);
--   * every widget's board_id is one of the boards in this set (no smuggling a
--     widget onto a board outside the replacement).
--
-- CONTRACT (the app prepares the payloads so all id-minting + name-stripping +
-- page/widget mapping stays in TS, where it is unit-tested; this is the atomic
-- writer):
--   p_lesson  uuid        — the master lesson whose (scope,owner) set is replaced.
--   p_scope   board_scope — 'team' or 'personal'.
--   p_owner   uuid        — null for team; the owning teacher (auth.uid()) for
--                           personal.
--   p_boards  jsonb       — array of board row objects (snake_case keys = boards
--                           columns); every NOT NULL column must be present.
--   p_widgets jsonb       — array of widget row objects (snake_case) for the
--                           page-0 mirror, board_id ∈ p_boards ids, id supplied so
--                           the flat mirror matches each board's `pages` jsonb.
--
-- SECURITY INVOKER: every statement is gated by the caller's RLS (boards_delete /
-- boards_insert require can_read_grade / owner=auth.uid(); widgets inherit the
-- board policy). The function adds atomicity + payload validation ONLY — never
-- service-role privilege. The boards insert also fires trg_boards_lesson_grade,
-- so a mis-stamped grade rolls the whole transaction back (delete included).
--
-- jsonb_populate_recordset(null::<table>, …) types each object against the table
-- rowtype (coercing uuids / jsonb / booleans / ints); the explicit INSERT column
-- lists OMIT created_at/updated_at so their column defaults apply.
-- ---------------------------------------------------------------------------
create or replace function teach_replace_lesson_set(
  p_lesson  uuid,
  p_scope   board_scope,
  p_owner   uuid,
  p_boards  jsonb,
  p_widgets jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_board_ids uuid[];
begin
  -- ── Validate the payload BEFORE any delete (audit F2) ─────────────────────
  if p_boards is null
     or jsonb_typeof(p_boards) <> 'array'
     or jsonb_array_length(p_boards) = 0 then
    raise exception 'teach_replace_lesson_set: p_boards must be a non-empty array';
  end if;
  if p_scope = 'team' and p_owner is not null then
    raise exception 'teach_replace_lesson_set: team scope must have a null owner';
  end if;
  if p_scope = 'personal' and p_owner is null then
    raise exception 'teach_replace_lesson_set: personal scope requires an owner';
  end if;
  -- Every board must target exactly (p_lesson, p_scope, p_owner).
  if exists (
    select 1
      from jsonb_populate_recordset(null::boards, p_boards) b
     where b.master_core_lesson_event_id is distinct from p_lesson
        or b.scope is distinct from p_scope
        or b.owner_id is distinct from p_owner
  ) then
    raise exception
      'teach_replace_lesson_set: every board must match (lesson=%, scope=%, owner=%)',
      p_lesson, p_scope, p_owner;
  end if;
  -- Collect the set's board ids; every widget must belong to one of them.
  select array_agg(b.id)
    into v_board_ids
    from jsonb_populate_recordset(null::boards, p_boards) b;
  if p_widgets is not null
     and jsonb_typeof(p_widgets) = 'array'
     and exists (
       select 1
         from jsonb_populate_recordset(null::widgets, p_widgets) w
        where w.board_id is null
           or not (w.board_id = any (v_board_ids))
     ) then
    raise exception
      'teach_replace_lesson_set: every widget board_id must be one of the inserted boards';
  end if;

  -- ── Atomic displacement ───────────────────────────────────────────────────
  delete from boards
   where master_core_lesson_event_id = p_lesson
     and scope = p_scope
     and owner_id is not distinct from p_owner;

  insert into boards (
    id, grade_level_id, subject_id, master_core_lesson_event_id, owner_id, scope,
    title, tint, display_order_within_lesson, template_id,
    pages, board_theme, repeat, tags, background, whiteboard, ephemeral,
    library_visibility, published_by, source_board_id
  )
  select
    b.id, b.grade_level_id, b.subject_id, b.master_core_lesson_event_id,
    b.owner_id, b.scope, b.title, b.tint, b.display_order_within_lesson,
    b.template_id, b.pages, b.board_theme, b.repeat, b.tags, b.background,
    b.whiteboard, b.ephemeral, b.library_visibility, b.published_by,
    b.source_board_id
  from jsonb_populate_recordset(null::boards, p_boards) b;

  insert into widgets (
    id, board_id, type, title, grid_row, grid_col, grid_rowspan, grid_colspan,
    display_order_within_board, pinned, config, state, persistence_override,
    canvas, appearance
  )
  select
    w.id, w.board_id, w.type, w.title, w.grid_row, w.grid_col, w.grid_rowspan,
    w.grid_colspan, w.display_order_within_board, w.pinned, w.config, w.state,
    w.persistence_override, w.canvas, w.appearance
  from jsonb_populate_recordset(null::widgets, p_widgets) w;
end;
$$;

grant execute on function teach_replace_lesson_set(uuid, board_scope, uuid, jsonb, jsonb) to authenticated;


-- =============================================================================
-- End of Teach go-live hardening migration.
-- =============================================================================
