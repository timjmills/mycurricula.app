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

/** A resource attached to a lesson or task. */
export interface LessonResource {
  type: "slides" | "pdf" | "doc" | "image" | "youtube" | "website" | "link";
  label: string;
}

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
