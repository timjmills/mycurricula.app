-- ###########################################################################
-- ## Boards: stage-size persistence (Wave 6 Supabase parity)
-- ###########################################################################
-- The 5.31 free-form board model (20260531120000_teach_freeform) added every
-- board domain column the Supabase TeachDataSource needs EXCEPT one: the canvas
-- stage-size preset `Board.size` ∈ "wide" (16∶9, default) | "a4" | "a3"
-- (lib/types.ts). lib/teach/supabase-source.ts therefore dropped `size` on every
-- write ("Board.size persistence lands with Wave 5 Supabase parity"), so a board
-- saved as A4/A3 on the (flag-OFF) Supabase path silently reverted to "wide".
-- The mock source (the live path today) keeps `size` via its in-memory clone, so
-- this is a parity GAP, not a behaviour change for any current user.
--
-- This migration closes that gap, additively:
--   1. `boards.size` — a nullable text column (NULL ≡ absent ≡ "wide", matching
--      `rowToBoard`'s `row.size ?? undefined`). A CHECK pins it to the closed set.
--   2. `teach_replace_lesson_set` — the push-to-team / pin-personal-set RPC copies
--      a board set via an EXPLICIT insert column list (security: it hard-codes the
--      per-set invariants ephemeral=false / library_visibility='private' /
--      published_by=null so a direct caller can't spoof them — audit H1). That
--      explicit list omitted `size`, so size would not survive a push/replace even
--      after the column exists. We re-declare the function with `size` threaded
--      through the column list + SELECT, leaving every other clause (validation,
--      advisory lock, audit-H1 invariants, widget mirror, SECURITY INVOKER, pinned
--      search_path) unchanged from the hardened original.
--
-- Every change is ADDITIVE and IDEMPOTENT (add column if not exists; drop+add the
-- check; create or replace the function). No column is dropped or retyped and no
-- RLS policy changes — `size` lives on the already-policied `boards` table. The
-- Supabase teach path is still flag-gated OFF (NEXT_PUBLIC_TEACH_USE_SUPABASE), so
-- the RPC is dormant in production today; this prepares it for the cutover.
--
-- PRIVACY (plan §11.4): `size` is a 3-value layout enum — STRUCTURE ONLY, never a
-- student name.

-- ---------------------------------------------------------------------------
-- SECTION 1 — boards.size column
-- ---------------------------------------------------------------------------
-- Canvas stage-size preset captured per board. NULL ≡ "wide" (the default 16∶9
-- stage) so a board that never set a size reads back as undefined → "wide",
-- exactly as the mock leaves it. "a4"/"a3" are the print-landscape stages.
alter table boards
  add column if not exists size text;

-- A board's stage size is a small closed set — guard it (mirrors
-- board_library_visibility_chk). NULL is allowed (≡ "wide").
alter table boards
  drop constraint if exists board_size_chk;
alter table boards
  add constraint board_size_chk
  check (size is null or size in ('wide', 'a4', 'a3'));

-- ---------------------------------------------------------------------------
-- SECTION 2 — teach_replace_lesson_set: carry `size` through the set-copy
-- ---------------------------------------------------------------------------
-- Re-declares the existing function with `size` added to the INSERT column list
-- (after `background`) and `b.size` added to the matching SELECT position. Every
-- other line is identical to the live definition (validation, advisory lock,
-- audit-H1 hard-coded invariants, widget mirror). SECURITY INVOKER + the pinned
-- search_path are preserved.
create or replace function public.teach_replace_lesson_set(
  p_lesson uuid,
  p_scope board_scope,
  p_owner uuid,
  p_boards jsonb,
  p_widgets jsonb
)
  returns void
  language plpgsql
  security invoker
  set search_path to 'public'
as $function$
declare
  v_board_ids uuid[];
begin
  -- Serialize concurrent replacements of the SAME (lesson, scope, owner) set
  -- (audit M4). Without it two concurrent replaces can MERGE into a union: under
  -- READ COMMITTED a DELETE that blocked on the other txn's row locks re-checks
  -- only the rows it ORIGINALLY scanned, so it won't remove the rows the other txn
  -- inserted after this one's snapshot — leaving both sets. A transaction-scoped
  -- advisory lock makes the 2nd caller wait for the 1st to fully commit (it then
  -- deletes the 1st's inserts → clean last-writer-wins). Auto-released at tx end.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'teach_replace_lesson_set:' || p_lesson::text || ':' || p_scope::text
        || ':' || coalesce(p_owner::text, ''),
      0
    )
  );
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
  -- Every board's `pages` jsonb must be a well-formed BoardPage[] (audit M5), so a
  -- malformed shared-board payload can't crash other teachers' reads.
  if exists (
    select 1
      from jsonb_populate_recordset(null::boards, p_boards) b
     where not teach_valid_pages(b.pages)
  ) then
    raise exception
      'teach_replace_lesson_set: a board has a malformed pages payload (expected a BoardPage[])';
  end if;
  -- p_widgets MUST be an array (possibly empty). A SQL null would SKIP the
  -- membership check below AND insert zero mirror rows after the delete, leaving a
  -- board with widgets in its pages jsonb but an empty flat mirror (audit M5).
  if p_widgets is null or jsonb_typeof(p_widgets) <> 'array' then
    raise exception 'teach_replace_lesson_set: p_widgets must be an array';
  end if;
  -- Collect the set's board ids; every widget must belong to one of them.
  select array_agg(b.id)
    into v_board_ids
    from jsonb_populate_recordset(null::boards, p_boards) b;
  if exists (
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
    pages, board_theme, repeat, tags, background, size, whiteboard, ephemeral,
    library_visibility, published_by, source_board_id
  )
  select
    b.id, b.grade_level_id, b.subject_id, b.master_core_lesson_event_id,
    b.owner_id, b.scope, b.title, b.tint, b.display_order_within_lesson,
    b.template_id, b.pages, b.board_theme, b.repeat, b.tags, b.background, b.size,
    b.whiteboard,
    -- ENFORCE per-lesson-set invariants regardless of the payload (audit H1): a
    -- board in a lesson's team/personal set is NEVER ephemeral, NEVER a Team
    -- Library entry, and carries no publish provenance. Hard-coding these (instead
    -- of selecting b.ephemeral / b.library_visibility / b.published_by) blocks a
    -- direct authenticated RPC caller from spoofing library_visibility='team' or
    -- published_by, or smuggling an ephemeral board, through this path — publishing
    -- to the Team Library only ever happens via the guarded
    -- publishBoardToTeamLibrary. (source_board_id stays caller-set: a benign,
    -- nullable provenance pointer.)
    false, 'private', null,
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
$function$;
