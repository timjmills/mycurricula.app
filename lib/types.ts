// Shared domain types for the curriculum planner.
// Mirrors the design-handoff data model (project/data.jsx) with explicit
// typing so every view consumes the same shapes.

/** The eight Grade 5 subjects. */
export type SubjectId =
  | "math"
  | "reading"
  | "writing"
  | "grammar"
  | "spelling"
  | "ufli"
  | "explorers"
  | "sel";

export interface Subject {
  id: SubjectId;
  name: string;
  /** CSS class suffix used by `.cp-subj.<cls>` (equals `id`). */
  cls: SubjectId;
  /** Short monogram / emoji shown in the calm-style header tile. */
  icon: string;
  /** Optional grouping (e.g. literacy block). */
  parent?: string;
}

export type TeacherRole = "lead" | "teacher";

export interface Teacher {
  id: string;
  name: string;
  initials: string;
  role: TeacherRole;
}

export interface Unit {
  id: string;
  subject: SubjectId;
  name: string;
  /** Human label for the week span, e.g. "Wk 9–14". */
  weeks: string;
  /** Shade level (1–3) for unit color cycling. */
  shade: number;
}

/** A resource attached to a lesson or task.
 *
 *  Two shapes coexist in the document today: the legacy `{ type, label }`
 *  fixture rows (synthesized labels, no real URL) and the post-Phase-1B
 *  shape with `url` + provider metadata. Everything beyond `type`/`label`
 *  is optional so the existing mock fixtures stay valid; views fall back
 *  to the synthetic glyph render when `url` is absent. */
export interface LessonResource {
  type: "slides" | "pdf" | "doc" | "image" | "youtube" | "website" | "link";
  label: string;
  /** Real URL — embed source, link target, or R2 signed-GET endpoint. When
   *  absent, this is a legacy/placeholder fixture row. */
  url?: string;
  /** Fine-grained provider detected from the URL — drives the renderer's
   *  embed switch. Computed by `parseResourceUrl` at link-creation time. */
  provider?: ResourceProvider;
  /** How a LINK resource (provider in {"website","link"}) is rendered in
   *  the lesson body. Files always render as their native embed (image →
   *  <img>, pdf → iframe, etc.); this is link-only. Default: thumbnail. */
  displayMode?: "literal" | "hyperlink" | "thumbnail";
  /** Visible anchor text when `displayMode === "hyperlink"`. */
  linkText?: string;
  /** Mime type for hosted files. */
  mimeType?: string;
  /** Hosted file size in bytes — informs the limits UI. */
  sizeBytes?: number;
  /** Intrinsic image/video dimensions, when known. */
  width?: number;
  height?: number;
  /** Thumbnail URL — OG image, YouTube poster, generated WebP, etc. */
  thumbnailUrl?: string;
  /** OG-fetched title/description for `provider="website"` rows. */
  previewTitle?: string;
  previewDescription?: string;
  /** Server-side row id — present after the row has been persisted. */
  resourceId?: string;
}

/** Provider tag computed from the resource URL — narrows the renderer's
 *  embed strategy without touching the DB's coarse `resource_kind` enum. */
export type ResourceProvider =
  | "youtube"
  | "vimeo"
  | "gslides"
  | "gdocs"
  | "gsheets"
  | "gdrive"
  | "pdf"
  | "image"
  | "video"
  | "audio"
  | "website";

/** Per-lesson completion / catch-up state. */
export type LessonStatus =
  | "not_done"
  | "done"
  | "carried"
  | "skipped"
  | "partial";

/** How a lesson was moved from its originally planned slot. */
export type LessonMoved = "same-week" | "across-weeks" | null;

/** A sub-event inside a multi-task lesson (e.g. a center rotation). */
export interface LessonTask {
  id: string;
  title: string;
  status: LessonStatus;
  resources: LessonResource[];
  standards: string[];
  isPersonal: boolean;
  /** Optional sub-subject hint so a station can stripe in its own color. */
  subjectHint: SubjectId | null;
}

/** The core lesson model — one per academic block in the weekly grid. */
export interface Lesson {
  id: string;
  subject: SubjectId;
  /** Time-slot label, e.g. "8:00–8:45". Optional — falls back to the
   *  subject's typical block when absent. */
  time?: string;
  /** Unit id this lesson belongs to. */
  unit: string;
  title: string;
  /** "I Can" objective statement shown beneath the title. */
  objective: string;
  /** Short summary shown on the weekly card. */
  preview: string;
  /** Full directions shown in the daily/detail view. */
  directions: string;
  /** Teacher notes surfaced on hover. */
  notes: string;
  resources: LessonResource[];
  standards: string[];
  /** Week number (e.g. 11, 12, 13). */
  week: number;
  /** Day index, 0 = Sunday … 4 = Thursday. */
  day: number;
  /** Teacher's own lesson, not from the core curriculum. */
  isPersonal: boolean;
  /** Local edit awaiting push to the core master. */
  pendingMaster: boolean;
  /** Reason a lesson did not go as planned (catch-up surfaces). */
  reasonNotDone: string;
  /** Local content edit relative to the core master. */
  modified: boolean;
  /** Whether/how the lesson was moved from its planned slot. */
  moved: LessonMoved;
  status: LessonStatus;
  commentCount: number;
  unreadComments: number;
  /** Sub-events; empty for a single-event lesson. */
  tasks: LessonTask[];
  /**
   * Soft-deleted flag. When true the lesson is hidden from all visible
   * surfaces (weekly grid, daily list, subject view, year view). Views must
   * filter `lesson.archived === true` out of every rendered collection.
   * Falsy by default — the field is absent on fixture lessons.
   */
  archived?: boolean;
}

export type NoteScope = "shared" | "personal";
export type NotePriority = "urgent" | "important" | "fyi";

export interface DailyNote {
  /** Day index, 0 = Sunday. */
  day: number;
  scope: NoteScope;
  priority: NotePriority;
  /** Teacher id of the author. */
  author: string;
  body: string;
}

export interface Tag {
  id: string;
  name: string;
  label: string;
  /** Token name, e.g. "tag-blue". */
  color: string;
  /** CSS background expression. */
  bg: string;
  /** CSS foreground expression. */
  fg: string;
}

export type TodoScope = "personal" | "team";
export type TodoDue = "today" | "tomorrow" | "thisweek" | "thismonth" | null;

export interface Todo {
  id: string;
  scope: TodoScope;
  title: string;
  tags: string[];
  due: TodoDue;
  done: boolean;
  /** Linked resource path, e.g. "spelling/u-s4". */
  linked?: string;
  assignee?: string;
  author?: string;
  completedBy?: string;
}

export type ScheduleBlockType = "academic" | "non_academic";

export interface ScheduleBlock {
  /** 24h time, e.g. "08:10". */
  start: string;
  end: string;
  type: ScheduleBlockType;
  /** Label for non-academic blocks. */
  label?: string;
  /** Subject for academic blocks. */
  subject?: SubjectId;
  /** Linked lesson id, or null if unplanned. */
  lesson?: string | null;
}

/** A CCSS standard: code → description. */
export type StandardsMap = Record<string, string>;

/** Pager state handed to a Weekly lesson card when it represents one lesson
 *  of a multi-lesson day. The card renders an in-card flip-through footer
 *  (‹ {index+1} of {total} ›) instead of the cell hosting a separate pager. */
export interface WeeklyCardDeck {
  /** 0-based index of the visible lesson within the cell. */
  index: number;
  /** Total lessons in the cell — the pager footer shows only when > 1. */
  total: number;
  /** Step to the previous lesson in the cell. */
  onPrev: () => void;
  /** Step to the next lesson in the cell. */
  onNext: () => void;
}

// ── Teach view domain types ─────────────────────────────────────────────────
// The live, in-class delivery surface (see docs/teach-view-plan.md §11.2).
// These are the *domain* shapes — what a board / widget / template / workspace
// IS — and map 1:1 to the designed-but-unwired Supabase migration
// (`20260530090000_teach_view.sql`). TS is camelCase; the repository adapter
// translates to/from the DB's snake_case + uuid↔slug at the seam
// (`lib/teach/queries.ts`). Grade-scoping is carried on every Teach entity —
// the app launches Grade 5-only but never assumes a single grade.

/** The twelve core widget kinds a board cell can host (plan §4.4). The body
 *  renderers (Wave 1, Agent C) switch on this; v1 bodies are display-only. */
export type WidgetType =
  | "timer"
  | "objective" // "I Can" + standard chips
  | "groups"
  | "agenda"
  | "notes"
  | "model" // bar model / fractions ("Model It")
  | "slides"
  | "youtube"
  | "poll"
  | "names" // randomizer / name picker
  | "manipulatives"
  | "embed";

/** Whether a widget's interactive `state` survives across teaching sessions.
 *  Maps to the DB `widget_persistence` enum. `inherit` defers to the board's
 *  default; `persist` keeps state; `reset_each_session` clears it on open. */
export type WidgetPersistence = "inherit" | "persist" | "reset_each_session";

/** How a resource is presented when surfaced in the center canvas. Maps to the
 *  DB `resource_render_target` enum. `embed` = full-bleed iframe/img/video,
 *  `magnify` = open-large overlay, `external` = open in a new tab only. */
export type ResourceRenderTarget = "embed" | "magnify" | "external";

/** A board (and its widgets) is either the teacher's own copy or the single
 *  team-shared set for the lesson. Maps to the DB `board_scope` enum. A teacher
 *  sees their personal set where one exists, otherwise the team set (plan §13.1). */
export type BoardScope = "personal" | "team";

/** A widget's anchor + span within the board's CSS grid. Coordinates are
 *  0-based column/row; `colSpan`/`rowSpan` default to 1 (a single cell). */
export interface WidgetGridPosition {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

/** One widget tile on a board.
 *
 *  PRIVACY (plan §11.4): `config`/`state` carry only STRUCTURE — e.g. a group
 *  count or slot ids — never student names. Name-bearing data (Groups, Names)
 *  lives exclusively in the USER-scoped local store
 *  (`mycurricula:user:teach-groups`) and is stripped before any DB write. */
export interface Widget {
  id: string;
  boardId: string;
  type: WidgetType;
  /** Display title shown in the widget header (e.g. "Today's Objective"). */
  title: string;
  position: WidgetGridPosition;
  /** Order within the board, independent of grid anchor — used to keep a
   *  stable sequence when the layout reflows. */
  displayOrder: number;
  /** Pinned widgets stay anchored when the layout switches. */
  pinned: boolean;
  /** Static configuration the body renders from (structure only — no names). */
  config: Record<string, unknown>;
  /** Live interactive state (Phase 3). Structure only — no names. */
  state: Record<string, unknown>;
  persistence: WidgetPersistence;
  /** Grade this widget's board belongs to (denormalized for query speed). */
  gradeLevelId: string;
}

/** A teaching board — one phase of a lesson (Warm-Up, Mini Lesson, …). Keyed
 *  to the lesson via its MASTER lesson id (the stable identity completion uses),
 *  per plan §13.1. */
export interface Board {
  id: string;
  /** Master lesson id this board hangs off (null while sandbox/lesson-less). */
  masterLessonId: string | null;
  /** Owning teacher for a personal board; null for the team set. */
  ownerId: string | null;
  scope: BoardScope;
  title: string;
  /** Position in the lesson's board strip (the numbered pill order). */
  displayOrderWithinLesson: number;
  /** The template this board was instantiated from, if any. */
  templateId: string | null;
  widgets: Widget[];
  gradeLevelId: string;
  createdAt: string;
  updatedAt: string;
}

/** A reusable board shape — a named set of widget placeholders a teacher can
 *  drop onto a lesson. Team-scoped templates are shared across the grade. */
export interface BoardTemplate {
  id: string;
  title: string;
  scope: BoardScope;
  /** Owning teacher for a personal template; null for a team template. */
  ownerId: string | null;
  /** Widget skeletons (no live state) that materialize when applied. */
  widgets: Omit<Widget, "boardId">[];
  gradeLevelId: string;
  createdAt: string;
  updatedAt: string;
}

/** A lesson resource as the Teach surface consumes it. Extends the existing
 *  `LessonResource` (resources are NOT re-modelled — plan §11.1) with the two
 *  Teach-only fields the migration adds to the `resources` table, plus a
 *  derived `kind` the canvas renderer branches on. */
export interface TeachResource extends LessonResource {
  /** Effective presentation kind, derived from `provider`/`type` via the
   *  `lib/resource-embed.ts` taxonomy by `toTeachResource()`. */
  kind: "pdf" | "link" | "video" | "doc" | "image" | "slides" | "tool";
  /** Default surface when this resource is dropped onto / opened in the board. */
  defaultRenderTarget: ResourceRenderTarget;
  /** Free-form classifying tags (the migration's `tags text[]` column). */
  tags: string[];
}

/** Which side rail a panel module currently docks to. The default split lives
 *  in `lib/use-teach-workspace.ts` (plan §3.1). */
export type TeachPanelDock = "left" | "right";

/** A detached panel rendered as a floating window (Phase 2 — defined now so the
 *  persisted layout shape is stable). */
export interface TeachFloatingWindow {
  /** Module id this window hosts. */
  moduleId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

/** USER-scoped persisted workspace layout — the analogue of `RailLayout`.
 *  Persisted to `localStorage` under `mycurricula:user:teach-workspace`
 *  (plan §8); migrates to the `teach_workspace_layouts` row in Phase 1B. Board
 *  /widget CONTENT flows through the repository seam, not this shape. */
export interface TeachWorkspaceLayout {
  /** Which side each module currently docks to. */
  panelDock: Record<string, TeachPanelDock>;
  /** Tab order within each panel, keyed by dock side. */
  tabOrder: Record<TeachPanelDock, string[]>;
  /** Pixel widths of the left/right panels. */
  panelWidths: Record<TeachPanelDock, number>;
  /** Detached floating windows (Phase 2). */
  floatingWindows: TeachFloatingWindow[];
  /** Icon order within the left icon rail. */
  iconRailLeftOrder: string[];
  /** Icon order within the right icon rail. */
  iconRailRightOrder: string[];
  /** Whether each side panel is collapsed to its rail. */
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  /** Last board opened per lesson, so re-entry restores the teacher's place. */
  lastUsedBoardPerLesson: Record<string, string>;
}
