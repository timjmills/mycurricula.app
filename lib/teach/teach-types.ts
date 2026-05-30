// lib/teach/teach-types.ts — Teach View domain types (Wave 0, types only).
//
// Mirrors the spec §10 "Data model additions" and §9 "Persistence" shapes
// from the Teach View handoff
// (Documents/Claude Design/5.29.2026 Teach View Handoff …/uploads/
//  5.24.26 mycurricula-teach-view-spec.md) and plan §1 "State & persistence"
// (docs/teach-view-plan.md). These are the wire shapes the Phase-1B Supabase
// tables back; later waves add the queries/hooks that read & write them.
//
// ── Naming ─────────────────────────────────────────────────────────────
// Fields that map to DB columns use snake_case per CLAUDE.md §3 (DB columns
// are snake_case; the backend lands in Phase 1B). TypeScript identifiers
// that are NOT row columns (union member strings, discriminants) stay in the
// convention that reads best at the callsite.
//
// ── Grade scoping ──────────────────────────────────────────────────────
// CLAUDE.md is explicit: never assume a single grade. A Board ties to a
// Lesson, which already carries subject/day/week; the lesson's owning unit
// carries the grade. We therefore scope every board through `lesson_id`
// rather than duplicating a grade field on the board, but the standalone
// `BoardTemplate` carries `grade_scope` directly because it is not anchored
// to a lesson. This keeps grade-scoping derivable everywhere a board renders.
//
// NOTE (Wave 0): types only — no logic, no functions, no default values.

import type { SubjectId } from "@/lib/types";

// ── Boards ─────────────────────────────────────────────────────────────

/** The grid shape a board's widgets snap into. Mirrors the layout toolbar
 *  in spec §4.2 (1-up … 3×3). The string values double as the persisted
 *  column value, so they stay stable. */
export type BoardLayout = "1up" | "2up" | "3up" | "2x2" | "2x3" | "3x3";

/** A Teaching Board — one tab in the center panel's board strip. Each
 *  Subject's Lesson has one or many boards (default set: Warm-Up, Mini
 *  Lesson, Guided Practice, Centers, Exit Ticket — spec §4.1). Grade is
 *  derived through the owning lesson (see file header). Spec §10 `Board`. */
export interface Board {
  id: string;
  /** Owning lesson — anchors the board to subject/day/week/grade. */
  lesson_id: string;
  title: string;
  /** Ordering within the lesson's board tab strip (0-based). */
  position: number;
  /** The grid layout the board's widgets snap into. */
  layout: BoardLayout;
  /** Set when the board was instantiated from a saved template. */
  template_id: string | null;
}

// ── Widgets ────────────────────────────────────────────────────────────

/** The Classroomscreen-style widget catalog (spec §4.3), grouped by the
 *  picker's five categories: Display, Timing, Engagement, Content embed,
 *  Utilities. Wave 4 builds the bodies; this union is the registry key. */
export type WidgetType =
  // Display
  | "objective"
  | "model_it"
  | "teacher_notes"
  // Timing
  | "timer"
  | "stopwatch"
  | "countdown"
  // Engagement
  | "student_groups"
  | "agenda"
  | "poll"
  | "draw"
  | "randomizer"
  | "dice"
  | "scoreboard"
  // Content embed
  | "embed"
  // Utilities
  | "sound_level"
  | "qr_code"
  | "calendar"
  | "event_countdown"
  | "hyperlink";

/** A widget's cell footprint inside the board grid (spec §10 Widget
 *  `grid_position {row, col, rowspan, colspan}`). Rows/cols are 0-based. */
export interface WidgetGridPosition {
  row: number;
  col: number;
  rowspan: number;
  colspan: number;
}

/** How a widget's instance state survives between sessions (spec §9 / §10
 *  `persistence_override`). Each widget type has a sensible default (timer
 *  resets, drawn ink persists, poll results persist); the teacher may
 *  override per widget. `"default"` defers to the widget type's default. */
export type WidgetPersistence = "default" | "persist" | "reset";

/** A widget instance placed on a board. `config` holds the widget-specific
 *  settings; `state` holds its live runtime state (timer remaining, drawn
 *  ink, poll tallies). Both are opaque JSON here — each widget narrows them
 *  in Wave 4. Spec §10 `Widget`. */
export interface Widget {
  id: string;
  /** Owning board. */
  board_id: string;
  type: WidgetType;
  grid_position: WidgetGridPosition;
  /** Widget-specific configuration (settings). Opaque at this layer. */
  config: Record<string, unknown>;
  /** Locked to position so it survives a layout change (spec §4.4 pin). */
  pinned: boolean;
  /** Live runtime state (opaque). Persisted per `persistence_override`. */
  state: Record<string, unknown>;
  /** Per-instance override of the type's default persistence. */
  persistence_override: WidgetPersistence;
}

// ── Resources ──────────────────────────────────────────────────────────

/** The coarse resource kind stored on the row (spec §10 `Resource.kind`).
 *  Distinct from `lib/types` `LessonResource.type`/`ResourceProvider`: this
 *  is the Teach-table column; the embed renderer narrows further at runtime
 *  from the URL. */
export type ResourceKind =
  | "pdf"
  | "link"
  | "video"
  | "doc"
  | "image"
  | "slides"
  | "tool";

/** Where a resource renders when surfaced on a board (spec §10
 *  `default_render_target`). `"embed"` = inline iframe/native; `"magnify"`
 *  = expand overlay; `"external"` = open in a new tab. */
export type ResourceRenderTarget = "embed" | "magnify" | "external";

/** A resource attached to a lesson, surfaced in the Resources module and
 *  embeddable onto a board (spec §10 `Resource`). Grade is derived through
 *  the owning lesson. */
export interface Resource {
  id: string;
  /** Owning lesson. */
  lesson_id: string;
  kind: ResourceKind;
  title: string;
  /** Either a literal URL or an R2/Storage file reference. */
  url_or_file_ref: string;
  /** Optional preview thumbnail. */
  thumbnail_url: string | null;
  /** Default render behavior when surfaced on a board. */
  default_render_target: ResourceRenderTarget;
  /** Free-form tags for filtering. */
  tags: string[];
}

// ── Modules, rails, panels ───────────────────────────────────────────────

/** The dockable Teach modules (spec §3 module set). A module appears as an
 *  icon on a rail and as a tab inside a panel. Several modules surface
 *  existing Daily data and get no new tables (Chat, To-do, Notes, Groups,
 *  Class — spec §10 footnote). */
export type ModuleId =
  | "lessons"
  | "lesson"
  | "boards"
  | "notes"
  | "groups"
  | "class"
  | "tools"
  | "resources"
  | "chat"
  | "todo";

/** Which side rail a module's icon lives on (spec §3.1). Rails start
 *  context-scoped but any icon can be dragged to the other side. */
export type RailSide = "left" | "right";

/** Where a module is docked (spec §9 `panel_dock`). `"float"` is reserved
 *  for the v2 floating-window system (plan §0 "Explicitly deferred"); v1
 *  uses only `left` / `right` / `collapsed`, but the column is modeled now
 *  so the schema doesn't churn when floating lands. */
export type PanelDock = "left" | "right" | "float" | "collapsed";

/** A floating window's geometry (spec §9 `floating_windows`). Reserved for
 *  v2; modeled now so the persisted layout shape is forward-compatible. */
export interface FloatingWindow {
  module: ModuleId;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Per-user Teach workspace layout — the teacher's arrangement of rails,
 *  panels, tabs, and per-lesson board memory (spec §9 / §10
 *  `TeachWorkspaceLayout`). Owned by the user; persisted per user. */
export interface TeachWorkspaceLayout {
  id: string;
  /** Owning teacher. */
  user_id: string;
  /** Where each in-use module is docked. */
  panel_dock: Record<ModuleId, PanelDock>;
  /** Tab order within each panel. */
  tab_order: Record<RailSide, ModuleId[]>;
  /** Resizable panel widths (px). */
  panel_widths: Record<RailSide, number>;
  /** v2 floating windows — empty in v1. */
  floating_windows: FloatingWindow[];
  /** Far-left rail icon order. */
  icon_rail_left_order: ModuleId[];
  /** Far-right rail icon order. */
  icon_rail_right_order: ModuleId[];
  /** Remembers which board the teacher last viewed per lesson. */
  last_used_board_per_lesson: Record<string, string>;
  /** Teacher's layout-preset preferences (spec §5.5). */
  layout_preset_preferences: Record<string, unknown>;
}

// ── Board templates ──────────────────────────────────────────────────────

/** A widget configuration captured inside a board template — the widget's
 *  type, footprint, and config without a live id/state (those are minted
 *  when the template is applied). */
export interface BoardTemplateWidget {
  type: WidgetType;
  grid_position: WidgetGridPosition;
  config: Record<string, unknown>;
}

/** A reusable board template (spec §10 `BoardTemplate`). Used by "Save board
 *  as template" for reuse across lessons. Standalone — not anchored to a
 *  lesson — so it carries its own grade + subject scope. NOTE: "Save board
 *  as template" is deferred to v2 (plan §0); the type is defined now so the
 *  schema is forward-compatible. */
export interface BoardTemplate {
  id: string;
  title: string;
  /** Subject this template is scoped to, or null for any subject. */
  subject_scope: SubjectId | null;
  /** Grade this template is scoped to — keeps templates grade-aware even
   *  though they are not anchored to a lesson (see file header). */
  grade_scope: number;
  layout: BoardLayout;
  /** The widget configs the template instantiates. */
  widgets: BoardTemplateWidget[];
}
