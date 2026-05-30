-- =============================================================================
-- MyCurricula — Teach View data model (Phase 1B-designed, wired in Phase 4)
-- =============================================================================
-- Authoritative source: docs/teach-view-plan.md §11.1 (Supabase data model),
-- §13.1 (board scope: personal-default + one team set, ANY team member writes),
-- §13.3 / §11.4 (groups & student names are NEVER persisted here).
--
-- This migration adds the durable backing for the live teaching surface:
-- configurable widget boards (one phase of a lesson each), their widgets, reusable
-- board templates, a per-teacher workspace-layout row, and per-teacher annotation
-- markup. v1 of the Teach view runs entirely on mock + localStorage (plan §8);
-- this schema is designed-but-unwired so `supabase db reset` stays green and the
-- backend is a localized switch (`lib/teach/supabase-source.ts`) when Phase 4 lands.
--
-- Conventions matched against 20260518102823_initial_schema.sql:
--   * Native enums declared up front (SECTION 0 here mirrors that file's §0).
--   * `set_updated_at()` trigger + a per-table BEFORE UPDATE trigger.
--   * Grade-scoping: every Teach entity carries `grade_level_id`. The product
--     launches Grade 5-only but the model NEVER assumes a single grade.
--   * `display_order_within_*` integers for ordered collections.
--   * RLS `security definer stable set search_path = public` helper functions.
--   * The `(scope='team' and owner_id is null) or (scope='personal' and
--     owner_id is not null)` owner/scope check-constraint idiom (cf. `subjects`).
--   * `text + check` (not enum) where a value set may grow without a migration
--     (cf. the resources `provider` column in 20260527120000).
--
-- FORKING-AWARE BOARD SCOPE (plan §13.1)
--   A `Board` hangs off a lesson via the MASTER lesson id
--   (`master_core_lesson_event_id`) — the same stable identity `completion_status`
--   uses, so a board follows the lesson, not a personal fork. `scope` is either
--   `personal` (owner-scoped, owner_id set) or `team` (owner_id null, shared
--   across the grade). Per lesson there are AT MOST two board sets: one team set
--   plus one personal set per teacher (enforced by the partial unique indexes
--   below). A teacher sees their personal set where it exists, otherwise the team
--   set. There is NO lazy master→personal fork for boards — sharing is an
--   explicit "push to team" repository operation that DELETES the existing team
--   set for the lesson and re-inserts the pushed set in one transaction (the
--   destructive displacement in §13.1), gated by a UI warning. The WRITE GATE on
--   team boards is `can_read_grade(grade_level_id)` — ANY team member may
--   push/edit team boards (NOT lead-only); `is_grade_lead` is deliberately NOT a
--   board write gate.
--
-- PRIVACY — GROUPS & STUDENT NAMES ARE NEVER PERSISTED HERE (plan §11.4 / §13.3)
--   Group definitions and student names live ONLY in a USER-scoped local store
--   on the teacher's own device (`mycurricula:user:teach-groups`) — never in this
--   database, never synced across computers. The widget `config`/`state` jsonb
--   carries STRUCTURE ONLY (group count, slot ids), never names; the repository
--   adapter (`boardToRow()`) strips any name-bearing field before a write. There
--   is no roster entity and no students table anywhere in the Teach surface — the
--   "students are out of product scope" rule (CLAUDE.md §1) made concrete.
-- =============================================================================


-- #############################################################################
-- ## SECTION 0 — ENUM TYPES
-- #############################################################################

-- The twelve core widget kinds a board cell can host (plan §4.4). Mirrors the
-- `WidgetType` union in lib/types.ts. New kinds are rare and team-wide, so a
-- native enum (not text+check) is appropriate here.
create type widget_type        as enum (
  'timer', 'objective', 'groups', 'agenda', 'notes', 'model',
  'slides', 'youtube', 'poll', 'names', 'manipulatives', 'embed'
);

-- Whether a widget's interactive state survives across teaching sessions.
-- `inherit` defers to the board's default; `persist` keeps state; `reset_each_session`
-- clears it on open. Mirrors `WidgetPersistence` in lib/types.ts.
create type widget_persistence as enum ('inherit', 'persist', 'reset_each_session');

-- How a resource is presented when surfaced in the center canvas (plan §11.1).
-- `embed` = full-bleed iframe/img/video; `magnify` = open-large overlay;
-- `external` = open in a new tab only. Mirrors `ResourceRenderTarget`.
create type resource_render_target as enum ('embed', 'magnify', 'external');

-- A board (and its widgets) is either the teacher's own copy or the single
-- team-shared set for the lesson. Mirrors `BoardScope` in lib/types.ts.
create type board_scope        as enum ('personal', 'team');


-- #############################################################################
-- ## SECTION 1 — RESOURCES: TEACH PRESENTATION COLUMNS
-- #############################################################################
-- Resources are NOT re-modelled (plan §11.1): the Teach "Resource" IS the
-- existing `resources` row; its presentation `kind` is derived from
-- `provider`/`file_type` via the lib/resource-embed.ts taxonomy, not a new enum.
-- Two columns are added so the canvas renderer knows the default surface and so
-- resources can be classified/filtered in the right-panel Resources module.
-- Idempotent (`if not exists`) to match the resources-embed migration's style.

alter table resources
  add column if not exists default_render_target resource_render_target not null default 'embed',
  add column if not exists tags                   text[] not null default '{}';


-- #############################################################################
-- ## SECTION 2 — BOARDS & WIDGETS
-- #############################################################################

-- ---------------------------------------------------------------------------
-- boards — one teaching board (a single phase of a lesson: Warm-Up, Mini
-- Lesson, Guided Practice, Centers, Exit Ticket). Keyed to its lesson via the
-- MASTER lesson id (the stable identity completion uses), per plan §13.1.
--
-- NOTE on `template_id`: there is a soft FK cycle boards.template_id →
-- board_templates.id. It is broken by creating `boards` first WITHOUT the
-- constraint, creating `board_templates`, then adding the FK in SECTION 5.
-- ---------------------------------------------------------------------------
create table boards (
  id                          uuid primary key default gen_random_uuid(),
  grade_level_id              uuid not null references grade_levels(id) on delete cascade,
  subject_id                  uuid references subjects(id) on delete set null,
  -- The lesson this board hangs off (null while sandbox / lesson-less, §4a).
  master_core_lesson_event_id uuid references master_core_lesson_events(id) on delete cascade,
  -- Owning teacher for a personal board; null for the single team set.
  owner_id                    uuid references teachers(id) on delete cascade,
  scope                       board_scope not null default 'personal',
  title                       text not null,
  -- Board-tint slug from the --board-tint-* token family (plan §9); no hex.
  tint                        text,
  display_order_within_lesson integer not null default 0,
  -- The template this board was instantiated from, if any. FK added in §5.
  template_id                 uuid,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  -- A team board has no owner; a personal board must have one (cf. `subjects`).
  constraint board_owner_scope_chk check (
    (scope = 'team'     and owner_id is null) or
    (scope = 'personal' and owner_id is not null)
  )
);

-- Per lesson there are AT MOST two board sets per board title: one team set, and
-- one personal set per teacher (plan §13.1). Two partial unique indexes enforce
-- this. For personal boards, `owner_id` is part of the key so each teacher gets
-- their own set; for team boards, `owner_id` is null, so the team key omits it.
create unique index uniq_boards_personal_lesson_title
  on boards (master_core_lesson_event_id, owner_id, title)
  where scope = 'personal' and master_core_lesson_event_id is not null;
create unique index uniq_boards_team_lesson_title
  on boards (master_core_lesson_event_id, title)
  where scope = 'team' and master_core_lesson_event_id is not null;

-- ---------------------------------------------------------------------------
-- widgets — one widget tile on a board. The `config`/`state` jsonb carry
-- STRUCTURE ONLY (plan §11.4) — never student names. Inherits its board's RLS.
-- ---------------------------------------------------------------------------
create table widgets (
  id                  uuid primary key default gen_random_uuid(),
  board_id            uuid not null references boards(id) on delete cascade,
  type                widget_type not null,
  title               text not null default '',
  -- Anchor + span within the board's CSS grid (0-based col/row; spans >= 1).
  grid_row            integer not null default 0,
  grid_col            integer not null default 0,
  grid_rowspan        integer not null default 1,
  grid_colspan        integer not null default 1,
  -- Order within the board, independent of grid anchor (stable on reflow).
  display_order_within_board integer not null default 0,
  -- Pinned widgets stay anchored when the layout switches.
  pinned              boolean not null default false,
  -- Static configuration the body renders from (structure only — NO names).
  config              jsonb not null default '{}',
  -- Live interactive state (Phase 3) — structure only — NO names.
  state               jsonb not null default '{}',
  -- `inherit` defers to the board default; otherwise overrides it.
  persistence_override widget_persistence not null default 'inherit',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint widget_rowspan_chk check (grid_rowspan >= 1),
  constraint widget_colspan_chk check (grid_colspan >= 1)
);


-- #############################################################################
-- ## SECTION 3 — BOARD TEMPLATES
-- #############################################################################

-- ---------------------------------------------------------------------------
-- board_templates — a reusable board shape (a named set of widget placeholders
-- a teacher drops onto a lesson). Team-scoped templates are shared across the
-- grade; personal templates are owner-only. `subject_id` is nullable
-- (subject-agnostic templates are allowed). `widgets` jsonb holds the widget
-- skeletons (no live state) that materialize when the template is applied.
-- ---------------------------------------------------------------------------
create table board_templates (
  id              uuid primary key default gen_random_uuid(),
  grade_level_id  uuid not null references grade_levels(id) on delete cascade,
  subject_id      uuid references subjects(id) on delete set null,
  scope           board_scope not null default 'personal',
  -- Owning teacher for a personal template; null for the team set.
  owner_id        uuid references teachers(id) on delete cascade,
  title           text not null,
  -- Default grid layout slug (e.g. "2x2", "3up") the template applies.
  layout          text,
  -- Array of widget skeletons (type + grid position + config), no live state.
  widgets         jsonb not null default '[]',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint board_template_owner_scope_chk check (
    (scope = 'team'     and owner_id is null) or
    (scope = 'personal' and owner_id is not null)
  )
);


-- #############################################################################
-- ## SECTION 4 — PER-TEACHER STATE (workspace layout + annotations)
-- #############################################################################

-- ---------------------------------------------------------------------------
-- teach_workspace_layouts — USER-scoped Teach UI state (plan §8). The DB
-- destination for the `mycurricula:user:teach-workspace` localStorage layout;
-- the local store stays as the offline cache so the swap is additive. One row
-- per teacher. Mirrors the `TeachWorkspaceLayout` shape in lib/types.ts.
-- Defaults are documented so a fresh row is immediately usable.
-- ---------------------------------------------------------------------------
create table teach_workspace_layouts (
  teacher_id                uuid primary key references teachers(id) on delete cascade,
  -- Which side each module currently docks to: { moduleId: 'left'|'right' }.
  panel_dock                jsonb not null default '{}',
  -- Tab order within each panel, keyed by dock side: { left: [...], right: [...] }.
  tab_order                 jsonb not null default '{"left": [], "right": []}',
  -- Pixel widths of the left/right panels.
  panel_widths              jsonb not null default '{"left": 320, "right": 320}',
  -- Detached floating windows (Phase 2).
  floating_windows          jsonb not null default '[]',
  -- Icon order within each rail.
  icon_rail_left_order       jsonb not null default '[]',
  icon_rail_right_order      jsonb not null default '[]',
  -- Whether each side panel is collapsed to its rail.
  left_collapsed            boolean not null default false,
  right_collapsed           boolean not null default false,
  -- Last board opened per lesson: { masterLessonId: boardId }.
  last_used_board_per_lesson jsonb not null default '{}',
  -- Saved layout-preset preferences (spec §9; Phase 2).
  layout_preset_preferences jsonb not null default '{}',
  updated_at                timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- board_annotations — a teacher's PERSONAL ink markup over a board or a
-- resource-in-canvas (plan §13.5 / §11.1). Always owner-keyed even over a team
-- board: annotations are a teacher's private markup, never shared. `resource_id`
-- null = annotations over the board grid itself; set = over a specific
-- resource-in-canvas (text id, mirroring the localStorage key
-- `lessonId:boardId:resourceId`). The `annotations` jsonb is the
-- `BoardAnnotations` stroke model (lib/board-annotations.ts). v1 persists the
-- same JSON to localStorage; this table is the Phase-4 destination.
-- ---------------------------------------------------------------------------
create table board_annotations (
  id             uuid primary key default gen_random_uuid(),
  board_id       uuid not null references boards(id) on delete cascade,
  -- Text (not uuid / not a hard FK): a resource may be a derived/embed id, and
  -- null means "the board grid itself".
  resource_id    text,
  owner_id       uuid not null references teachers(id) on delete cascade,
  -- The BoardAnnotations stroke model: { version, strokes[] }.
  annotations    jsonb not null default '{"version": 1, "strokes": []}',
  -- Denormalized grade for query speed + owner-scoped RLS symmetry.
  grade_level_id uuid not null references grade_levels(id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- One annotation row per (teacher, board, resource surface).
  unique (owner_id, board_id, resource_id)
);


-- #############################################################################
-- ## SECTION 5 — DEFERRED FOREIGN KEY (boards.template_id soft cycle)
-- #############################################################################
-- `boards` was created before `board_templates` to break the FK cycle; wire it
-- up now. on delete set null so deleting a template never cascades to a board.

alter table boards
  add constraint boards_template_id_fkey
  foreign key (template_id) references board_templates(id) on delete set null;


-- #############################################################################
-- ## SECTION 6 — RLS HELPER FUNCTION
-- #############################################################################
-- Mirrors the `security definer stable set search_path = public` helpers in the
-- initial schema's §10 (e.g. auth_can_access_event in the resources-embed
-- migration). Resolves a master lesson id to whether the current auth.uid() can
-- read its grade. Used by the boards read/write policies.

create or replace function auth_can_read_lesson(p_master_lesson_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
      from master_core_lesson_events m
      join units u on u.id = m.unit_id
     where m.id = p_master_lesson_id
       and can_read_grade(u.grade_level_id)
  );
$$;


-- #############################################################################
-- ## SECTION 7 — TRIGGERS  (updated_at maintenance)
-- #############################################################################

create trigger trg_boards_updated_at                  before update on boards                 for each row execute function set_updated_at();
create trigger trg_widgets_updated_at                 before update on widgets                for each row execute function set_updated_at();
create trigger trg_board_templates_updated_at         before update on board_templates        for each row execute function set_updated_at();
create trigger trg_teach_workspace_layouts_updated_at before update on teach_workspace_layouts for each row execute function set_updated_at();
create trigger trg_board_annotations_updated_at       before update on board_annotations      for each row execute function set_updated_at();


-- #############################################################################
-- ## SECTION 8 — INDEXES
-- #############################################################################
-- FK + hot-path indexes (Postgres does NOT auto-index FK columns). The
-- (master_core_lesson_event_id, owner_id, display_order_within_lesson) index
-- backs the primary lookup: "the board strip for this lesson, this teacher,
-- in order" (personal-set + team-set fallback resolution, plan §13.1).

create index idx_boards_lesson_owner_order on boards (master_core_lesson_event_id, owner_id, display_order_within_lesson);
create index idx_boards_grade              on boards (grade_level_id);
create index idx_boards_subject            on boards (subject_id);
create index idx_boards_owner              on boards (owner_id);
create index idx_boards_template           on boards (template_id);

create index idx_widgets_board             on widgets (board_id);

create index idx_board_templates_grade     on board_templates (grade_level_id);
create index idx_board_templates_subject   on board_templates (subject_id);
create index idx_board_templates_owner     on board_templates (owner_id);

create index idx_board_annotations_owner   on board_annotations (owner_id);
create index idx_board_annotations_board   on board_annotations (board_id);
create index idx_board_annotations_grade   on board_annotations (grade_level_id);


-- #############################################################################
-- ## SECTION 9 — ROW-LEVEL SECURITY
-- #############################################################################
-- Scope doctrine (plan §13.1):
--   * Personal boards/templates/annotations — owner-only.
--   * TEAM boards/templates — readable AND writable by ANY teacher who can read
--     the grade (`can_read_grade(grade_level_id)` for BOTH select and the write
--     `with check`). Per §13.1 ANY team member may push/edit team boards; team
--     writes are NOT gated on `is_grade_lead`.
--   * widgets inherit their board's policy (resolved via the board row).
--   * teach_workspace_layouts + board_annotations — strictly the owning teacher.

alter table boards                  enable row level security;
alter table widgets                 enable row level security;
alter table board_templates         enable row level security;
alter table teach_workspace_layouts enable row level security;
alter table board_annotations       enable row level security;

-- ---------------------------------------------------------------------------
-- boards — a teacher reads their personal set + the grade's team set; writes
-- their own personal boards, and ANY team board for a grade they can read.
-- ---------------------------------------------------------------------------
create policy boards_read on boards for select using (
  (scope = 'personal' and owner_id = auth.uid())
  or (scope = 'team' and can_read_grade(grade_level_id))
);
create policy boards_insert on boards for insert with check (
  (scope = 'personal' and owner_id = auth.uid() and can_read_grade(grade_level_id))
  or (scope = 'team' and can_read_grade(grade_level_id))
);
create policy boards_update on boards for update using (
  (scope = 'personal' and owner_id = auth.uid())
  or (scope = 'team' and can_read_grade(grade_level_id))
) with check (
  (scope = 'personal' and owner_id = auth.uid() and can_read_grade(grade_level_id))
  or (scope = 'team' and can_read_grade(grade_level_id))
);
create policy boards_delete on boards for delete using (
  (scope = 'personal' and owner_id = auth.uid())
  or (scope = 'team' and can_read_grade(grade_level_id))
);

-- ---------------------------------------------------------------------------
-- widgets — inherit the parent board's policy. A widget is readable/writable
-- exactly when its board is. Resolved via an EXISTS against `boards`, which is
-- itself RLS-protected, so the check composes the board policy above.
-- ---------------------------------------------------------------------------
create policy widgets_read on widgets for select using (
  exists (
    select 1 from boards b
     where b.id = board_id
       and ((b.scope = 'personal' and b.owner_id = auth.uid())
            or (b.scope = 'team' and can_read_grade(b.grade_level_id)))
  )
);
create policy widgets_write on widgets for all using (
  exists (
    select 1 from boards b
     where b.id = board_id
       and ((b.scope = 'personal' and b.owner_id = auth.uid())
            or (b.scope = 'team' and can_read_grade(b.grade_level_id)))
  )
) with check (
  exists (
    select 1 from boards b
     where b.id = board_id
       and ((b.scope = 'personal' and b.owner_id = auth.uid())
            or (b.scope = 'team' and can_read_grade(b.grade_level_id)))
  )
);

-- ---------------------------------------------------------------------------
-- board_templates — personal templates owner-only; team templates readable AND
-- writable by any teacher who can read the grade (same gate as team boards).
-- ---------------------------------------------------------------------------
create policy board_templates_read on board_templates for select using (
  (scope = 'personal' and owner_id = auth.uid())
  or (scope = 'team' and can_read_grade(grade_level_id))
);
create policy board_templates_insert on board_templates for insert with check (
  (scope = 'personal' and owner_id = auth.uid() and can_read_grade(grade_level_id))
  or (scope = 'team' and can_read_grade(grade_level_id))
);
create policy board_templates_update on board_templates for update using (
  (scope = 'personal' and owner_id = auth.uid())
  or (scope = 'team' and can_read_grade(grade_level_id))
) with check (
  (scope = 'personal' and owner_id = auth.uid() and can_read_grade(grade_level_id))
  or (scope = 'team' and can_read_grade(grade_level_id))
);
create policy board_templates_delete on board_templates for delete using (
  (scope = 'personal' and owner_id = auth.uid())
  or (scope = 'team' and can_read_grade(grade_level_id))
);

-- ---------------------------------------------------------------------------
-- teach_workspace_layouts — strictly the owning teacher's row (identical to
-- teacher_ui_state_owner in the initial schema).
-- ---------------------------------------------------------------------------
create policy teach_workspace_layouts_owner on teach_workspace_layouts for all using (
  teacher_id = auth.uid()
) with check (
  teacher_id = auth.uid()
);

-- ---------------------------------------------------------------------------
-- board_annotations — strictly the owning teacher's rows, even over a team
-- board (annotations are personal markup; plan §13.5). grade_level_id is also
-- gated so a teacher can only attach annotations within a grade they can read.
-- ---------------------------------------------------------------------------
create policy board_annotations_owner on board_annotations for all using (
  owner_id = auth.uid()
) with check (
  owner_id = auth.uid() and can_read_grade(grade_level_id)
);


-- =============================================================================
-- End of Teach View migration.
-- =============================================================================
