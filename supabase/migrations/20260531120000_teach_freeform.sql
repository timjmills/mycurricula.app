-- ###########################################################################
-- ## 5.31 Teach redesign — free-form canvas, pages, themes, repeat, library
-- ###########################################################################
-- The 20260530090000_teach_view migration shipped the GRID-era schema:
-- `boards`/`widgets` carry `tint` + grid anchors (grid_row/col/span) but none
-- of the 5.31 free-form domain fields. This migration adds them, additively, so
-- the Supabase TeachDataSource (lib/teach/supabase-source.ts) can persist the
-- free-form canvas, multi-page boards, per-widget + board themes, real-link
-- repeat schedules, board tags, and the board-library model.
--
-- Every change here is ADDITIVE (new nullable columns / columns with safe
-- defaults). No column is dropped or retyped, so existing rows + the grid-era
-- code path keep working unchanged. RLS is untouched: the new columns live on
-- the already-policied `boards`/`widgets` tables (widgets inherit their board's
-- policy), so they need no new policies. JSONB shapes mirror the domain types
-- in lib/types.ts exactly (CanvasPosition, ThemeOverride, BoardPage[],
-- RepeatRule[], BoardTag[]).
--
-- PRIVACY (plan §11.4): none of these columns hold student names. `config`,
-- `state`, `appearance`, `canvas`, `pages`, `board_theme`, `repeat`, `tags` are
-- all STRUCTURE ONLY. Names live solely in the client-local groups store.

-- ---------------------------------------------------------------------------
-- SECTION 1 — widgets: free-form canvas + per-widget appearance override
-- ---------------------------------------------------------------------------
-- `canvas` is the absolute free-form position {x, y, w} that replaces the grid
-- anchor for the 5.31 editor (the grid_* columns stay for backward-compat /
-- migration via ensureCanvas). `appearance` is the per-widget ThemeOverride
-- ({bg?, accent?, text?, size?, radius?, font?}); null/empty = inherit board.
alter table widgets
  add column if not exists canvas     jsonb,
  add column if not exists appearance jsonb;

-- ---------------------------------------------------------------------------
-- SECTION 2 — boards: pages, themes, repeat, tags, background, library model
-- ---------------------------------------------------------------------------
alter table boards
  -- Multi-page boards: BoardPage[] = [{ id, order, title?, widgets: Widget[] }].
  -- When null/empty the board is single-page (its flat widgets are page 0).
  add column if not exists pages       jsonb,
  -- Board-wide ThemeOverride applied under each widget's own override.
  add column if not exists board_theme jsonb,
  -- Real-link RepeatSchedule = RepeatRule[] (weekday/subject/week/lesson/slot
  -- references) or null when the board does not repeat. One board, many live
  -- contexts — editing it changes every occurrence.
  add column if not exists repeat      jsonb,
  -- BoardTag[] — context tags (subject/week/weekday/lesson/label) the library
  -- filters + the repeat resolver read.
  add column if not exists tags        jsonb,
  -- Free-form canvas background (token slug or preset id; no hex).
  add column if not exists background  text,
  -- Ephemeral whiteboards (plan §4a): kept out of the 50-board cap until the
  -- teacher explicitly keeps them. A blank scratch board starts ephemeral.
  add column if not exists whiteboard  boolean not null default false,
  add column if not exists ephemeral   boolean not null default false,
  -- Board-library visibility: 'private' (My Boards) | 'team' (Team Library).
  -- Drives the library Personal/Team split independent of board `scope`.
  add column if not exists library_visibility text not null default 'private',
  -- Provenance for a Team-Library publish + a pulled copy (additive, nullable).
  add column if not exists published_by   uuid references teachers(id) on delete set null,
  add column if not exists source_board_id uuid references boards(id) on delete set null;

-- A board's library visibility is a small closed set — guard it.
alter table boards
  drop constraint if exists board_library_visibility_chk;
alter table boards
  add constraint board_library_visibility_chk
  check (library_visibility in ('private', 'team'));

-- ---------------------------------------------------------------------------
-- SECTION 3 — indexes for the new hot paths
-- ---------------------------------------------------------------------------
-- The board library lists by visibility; the cap counts non-ephemeral personal
-- boards; pulled copies are traced by source.
create index if not exists idx_boards_library_visibility on boards (library_visibility);
create index if not exists idx_boards_ephemeral          on boards (ephemeral);
create index if not exists idx_boards_source             on boards (source_board_id);

-- ###########################################################################
-- ## END 5.31 free-form / pages / themes / repeat / library
-- ###########################################################################
