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
  type:
    | "slides"
    | "pdf"
    | "doc"
    | "image"
    | "youtube"
    | "website"
    | "link"
    | "notecard";
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
  /** Rich-text HTML notes attached to ANY resource (sanitized before render).
   *  This is the "add formatted text + links to a card" capability; a
   *  `type:"notecard"` resource uses it as its primary written content. */
  body?: string;
  /** Ordered flip-through media for a stack or notecard. Each item is itself a
   *  LessonResource (image / video / pdf / embed / link), so a gallery can mix
   *  any resource type. `gallery[0]` is the poster. Flat by convention —
   *  gallery items never carry their own `gallery`. */
  gallery?: LessonResource[];
  /** Teacher's per-card color override (6.12.26 redesign §0 "card color").
   *  Absent = subject tint (the vivid default). `"paper"` = white body. A
   *  number selects that `--subj-<n>-tint` pastel. Only the card BODY is
   *  washed — the header band + left stripe stay subject-locked. Additive
   *  and JSONB-safe like `body`/`gallery`. */
  wash?: "paper" | number;
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

/** Tiered differentiation plan for a lesson (6.11.26 daily handoff §6 —
 *  the Differentiation planning tab). Each tier is rich-text HTML,
 *  sanitized before render like every other rich-text lesson field. */
export interface LessonDifferentiation {
  support: string;
  onLevel: string;
  extension: string;
}

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

/**
 * PROTOTYPE seam — UX roadmap item 01 (fork diff view).
 *
 * A frozen copy of the Master / Team-Curriculum values a personally-forked
 * lesson diverged FROM, captured at fork time. The fork-diff panel
 * (components/lesson-card/fork-diff) diffs the live lesson against this to
 * show "what's different from the Team Curriculum".
 *
 * Phase 1B replaces this field with persisted fork lineage from Supabase
 * (the master row IS the snapshot once the backend stores both sides of a
 * fork); until then a handful of mock fixtures carry it so the diff UI can
 * be designed and exercised. Deliberately JSONB-safe: plain strings,
 * numbers, and string arrays only — no Dates, functions, or class
 * instances — so the shape can persist as a JSONB column unchanged if
 * Phase 1B chooses to keep it.
 *
 * The captured fields mirror the diffable surface of the item-01 spec
 * (title / objective / preview / standards / scheduling / sections). It is
 * intentionally PARTIAL — directions, notes, resources, and tasks are not
 * captured — which is why per-field reverts can never cheaply prove "full
 * reconvergence" with the master (see lib/fork-diff.ts).
 */
export interface LessonMasterSnapshot {
  /** Master lesson title (may contain rich-text HTML, like Lesson.title). */
  title: string;
  /** Master "I Can" objective statement. */
  objective: string;
  /** Master weekly-card summary. */
  preview: string;
  /** Master standards codes. */
  standards: string[];
  /** Master placement — day index into the CONFIGURED school week. */
  day: number;
  /** Master placement — week number. */
  week: number;
  /** Master lesson-flow sections flattened to plain text, when captured.
   *  Optional: live sections are store-owned (not on Lesson), so the diff
   *  only renders a sections row when both sides are supplied. */
  sections?: string;
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
  /** Tiered differentiation plan (Support / On level / Extension) —
   *  edited in the Daily planning tabs. Absent on lessons that have not
   *  planned differentiation yet. */
  differentiation?: LessonDifferentiation;
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
  /**
   * PROTOTYPE seam (UX roadmap item 01) — the pre-fork Master values this
   * personally-forked lesson diverged from. Present only on a few mock
   * fixtures today; Phase 1B replaces it with persisted fork lineage.
   * Additive + optional so every existing consumer is untouched, and
   * JSONB-safe (see LessonMasterSnapshot).
   */
  masterSnapshot?: LessonMasterSnapshot;
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

/** The widget kinds a board cell can host (plan §4.4). The original twelve are
 *  the content/display set; the `// interactive` block is the Phase 3 widget
 *  library — live classroom tools (timer/dice/traffic-light/…) modelled after
 *  classroomscreen. Body renderers switch on this in `WidgetBody`. */
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
  | "embed"
  // ── Phase 3 interactive library ──────────────────────────────────────────
  | "stopwatch" // count-up timer + laps
  | "clock" // live analog + digital clock
  | "countdown" // count down to a date/event
  | "dice" // roll 1–4 dice
  | "scoreboard" // team points +/−
  | "traffic" // red/amber/green light
  | "work_symbols" // silent / whisper / partner / group work mode
  | "soundlevel" // live microphone level meter
  | "text" // large editable display text
  // ── 5.31 named pedagogical widgets (handoff §2; superset, see Ultraplan §4) ─
  // Lesson Essentials
  | "learning-target" // I-can + success criteria (restyles `objective`)
  | "now-next-then" // current → next → then activity sequence
  | "directions" // numbered step instructions
  | "materials-needed" // supply list with icons
  | "work-completed" // student × subject progress grid
  // Routines & Management
  | "transition" // movement guide: timer + voice level + steps
  | "attention-signal" // attention call + readiness count
  | "voice-movement" // voice/movement/help/work expectations
  | "when-done" // Must Do / May Do early-finisher options
  | "student-jobs" // rotating classroom roles
  // Assessment & Support
  | "exit-ticket" // end-of-lesson check (restyles inline)
  | "understanding-check" // emoji/face mood + class summary
  | "help-queue" // students waiting for help
  | "participation-tracker" // shared / not-yet-shared tally
  | "question-parking-lot" // collected questions + status
  // Small Groups & Language
  | "center-rotation" // now/next center assignments
  | "teacher-table" // small-group mastery grid
  | "vocabulary" // key words + definitions
  | "sentence-frames" // language stems with blanks
  | "discussion-protocol" // partner discussion structure
  // Regulation & Teacher Tools
  | "brain-break" // movement activity + timer
  | "calm-corner" // breathing + mood check-in
  | "class-points" // class reward progress
  | "teacher-notes" // private reminders (restyles `notes`)
  | "mini-whiteboard" // worked example + pen tools
  // Helpers surfaced in the editor/library
  | "namepick" // name picker (restyles `names`)
  | "sound" // microphone level (restyles `soundlevel`)
  | "work-sound" // voice-level selector
  | "lesson-flow" // activity agenda (replaces `agenda`)
  | "note-view" // multi-page resource slideshow
  | "resource"; // embedded resource card on the canvas

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

/** Where a board lives in the Boards Library (the reusable-board catalog, NOT the
 *  per-lesson team set). `private` = the owning teacher's own library ("My
 *  Boards", counts toward the 50-board cap). `team` = a COPY the owner published
 *  to the shared Team Library; teammates pull a private copy from it. Absent on a
 *  per-lesson team board (those use `scope: "team"` keyed to a lesson). */
export type BoardLibraryVisibility = "private" | "team";

/** The dimension a board tag binds to. Tags drive BOTH library filtering AND
 *  auto-surfacing — the tag IS the assignment (the user's "auto-surface + filter"
 *  decision). A board tagged `weekday:1` + `subject:math` appears automatically
 *  when the teacher opens Monday's Math context, and is filterable by either tag
 *  in the library. `label` tags are free text and library-only (they never
 *  auto-surface). Values are kind-dependent and stored as strings:
 *  - `subject`  → a `SubjectId`
 *  - `lesson`   → a master lesson id
 *  - `phase`    → a lesson-phase slug (e.g. "warm-up")
 *  - `weekday`  → a weekday index "0".."6" into the configured school week
 *  - `week`     → a week id / number
 *  - `slot`     → a schedule time-slot id
 *  - `label`    → arbitrary free text */
export type BoardTagKind =
  | "subject"
  | "lesson"
  | "phase"
  | "weekday"
  | "week"
  | "slot"
  | "label";

/** One typed tag on a board (see `BoardTagKind`). Display-only structure — safe
 *  to persist; carries no student names. */
export interface BoardTag {
  kind: BoardTagKind;
  /** Kind-dependent value, always a string (see `BoardTagKind`). */
  value: string;
  /** Optional display override; falls back to a derived label (board-tags.ts). */
  label?: string;
}

/** A widget's anchor + span within the board's CSS grid. Coordinates are
 *  0-based column/row; `colSpan`/`rowSpan` default to 1 (a single cell).
 *
 *  LEGACY (pre-5.31): the original Teach board used a fixed CSS grid. The 5.31
 *  redesign moves to a free-form canvas (`CanvasPosition`). This type is kept
 *  for the migration mapper + any board still on the grid model; new boards use
 *  `CanvasPosition`. */
export interface WidgetGridPosition {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

// ── Teach widget appearance system (5.31 Boards & Widgets redesign) ──────────

/** A background family key — one of the six pastel families plus the three
 *  neutrals offered in the appearance editor. Maps to the `--wf-<key>-*` tokens
 *  in app/tokens.css. */
export type WidgetBgKey =
  | "yellow"
  | "green"
  | "pink"
  | "purple"
  | "orange"
  | "blue"
  | "slate"
  | "cloud"
  | "dark";

/** An accent key — the eight accent dots in the appearance editor. `ink` maps
 *  to the neutral ink accent; the rest reuse the family accents. */
export type WidgetAccentKey =
  | "blue"
  | "green"
  | "purple"
  | "orange"
  | "pink"
  | "yellow"
  | "slate"
  | "ink";

/** Text-colour key (Dark / Slate / White). */
export type WidgetTextKey = "ink" | "slate" | "white";

/** Font key for the appearance editor's five options. */
export type WidgetFontKey = "jakarta" | "rounded" | "serif" | "hand" | "mono";

/** A partial appearance override. Every field is optional; an empty object
 *  means "inherit". The effective theme is
 *  `merge(widgetDefault, boardTheme, widgetOverride)` (see
 *  lib/teach/widget-theme.ts), so a board theme overrides each widget's default
 *  and a per-widget override beats the board theme. Display-only structure —
 *  safe to persist; carries no student data. */
export interface ThemeOverride {
  bg?: WidgetBgKey;
  accent?: WidgetAccentKey;
  text?: WidgetTextKey;
  /** Text-size scale, 0.8–1.4 (drives `--w-scale`; widgets size in `em`). */
  size?: number;
  /** Corner radius in px, 6–30 (drives `--w-radius`). */
  radius?: number;
  font?: WidgetFontKey;
}

/** A widget's absolute placement on the free-form board canvas (5.31). `x`/`y`
 *  are px from the canvas top-left; `w` is the px width (height flows from
 *  content). The editor clamps `w` to 230–640 and keeps `x`/`y` ≥ 0. */
export interface CanvasPosition {
  x: number;
  y: number;
  w: number;
}

// ── Board Repeat — REAL schedule/lesson/day/week/subject links (5.31) ────────

/** The dimension a single repeat rule binds to. A repeat makes ONE board
 *  surface in many real contexts (it is not independent copies — editing the
 *  board changes every occurrence). */
export type RepeatKind =
  | "weekday"
  | "time"
  | "daily"
  | "weekly"
  | "subject"
  | "slot"
  | "lesson"
  | "week";

/** One repeat rule. Carries REAL planner-entity references (not cosmetic
 *  labels), resolved through the planner's own selectors so the link is live:
 *  - `weekdays` → 0-based indices into the CONFIGURED school week
 *  - `slotId`   → a real schedule-slot / period id (e.g. "mon-1");
 *                 NOTE: slots are per-weekday templates today (no week binding /
 *                 rotation), so a slot repeat surfaces by weekday+time until the
 *                 per-teacher schedule backend lands (documented gap).
 *  - `lessonId` → a real master lesson id (the same id boards already key on)
 *  - `subjectId`→ one of the eight locked subjects
 *  - `week`     → a real curriculum week number
 *  `label` is the derived display string (e.g. "Mon/Wed/Fri", "Daily"). */
export interface RepeatRule {
  kind: RepeatKind;
  weekdays?: number[];
  slotId?: string;
  lessonId?: string;
  subjectId?: SubjectId;
  week?: number;
  label: string;
}

/** A board's repeat schedule: one or more real-link rules, or null when the
 *  board does not repeat. */
export type RepeatSchedule = RepeatRule[] | null;

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
  /** LEGACY grid placement (pre-5.31). Retained for migration + grid boards;
   *  free-form boards use `canvas` instead. */
  position: WidgetGridPosition;
  /** Free-form canvas placement (5.31). When present, the widget is positioned
   *  absolutely on the board canvas and `position` (grid) is ignored. */
  canvas?: CanvasPosition;
  /** Per-widget appearance override (5.31). Empty/absent → inherit the board
   *  theme. Beats the board theme; the board theme beats the widget default. */
  appearance?: ThemeOverride;
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

/** One page of a board (5.31 multi-page boards). A board holds one or more
 *  pages; the editor page-tab bar and the fullscreen `‹ N ›` nav cycle these.
 *  Pages share the board's `boardTheme`; each owns its own widget set. */
export interface BoardPage {
  id: string;
  /** Page order within the board (0-based). */
  order: number;
  /** Optional page label (defaults to "Page N" when absent). */
  title?: string;
  /** Widgets placed on this page (free-form canvas). */
  widgets: Widget[];
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
  /** Board background id from the Teach background catalog
   *  (`lib/teach/backgrounds.ts`), e.g. "pattern-3". Null/absent → the default
   *  paper surface. Display-only structure — safe to persist to the DB. */
  background?: string | null;
  /** Library/auto-surface tags. Absent/empty → an untagged board (it never
   *  auto-surfaces; it's reachable only via its lesson or the library list).
   *  See `lib/teach/board-tags.ts` for the matching + display helpers. */
  tags?: BoardTag[];
  /** True for a free-form whiteboard (opened via "New whiteboard") — a blank
   *  canvas with no lesson-phase structure. */
  whiteboard?: boolean;
  /** True while a quick whiteboard is unsaved. An ephemeral board does NOT count
   *  against the 50-board cap and is discarded on "keep? → No". `keepBoard()`
   *  clears this (and enforces the cap at that point). */
  ephemeral?: boolean;
  /** Library placement (see `BoardLibraryVisibility`). Absent on a per-lesson
   *  team board. `private` for a teacher's own library board; `team` for a
   *  published copy in the shared Team Library. */
  libraryVisibility?: BoardLibraryVisibility;
  /** For a Team-Library copy: the teacher who published it (provenance only). */
  publishedBy?: string | null;
  /** For a duplicated / pulled / published copy: the board it was copied from
   *  (provenance only; null for an original). */
  sourceBoardId?: string | null;
  /** Multi-page boards (5.31). When present, `pages` is the authoritative widget
   *  container and `widgets` mirrors page-0 for backward compatibility. A board
   *  with no `pages` is treated as a single implicit page built from `widgets`. */
  pages?: BoardPage[];
  /** Board-wide appearance theme (5.31). Each widget's effective theme is
   *  merge(widgetDefault, boardTheme, widget.appearance). Empty/absent → every
   *  widget uses its own default. */
  boardTheme?: ThemeOverride;
  /** Repeat schedule — REAL schedule/lesson/day/week/subject links (5.31). One
   *  board surfacing in many contexts; editing it changes every occurrence.
   *  Null/absent → the board does not repeat. */
  repeat?: RepeatSchedule;
  /** LEGACY flat widget list (pre-5.31, and the page-0 mirror for new boards).
   *  Free-form multi-page boards read from `pages`; this stays populated for
   *  back-compat with grid-era consumers. */
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
