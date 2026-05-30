// catalog.ts — the static metadata for every widget type: display label, icon,
// board tint, picker category, and the short kicker shown in the widget header.
// The WidgetPicker, WidgetLibrary, BoardEmptyState, and WidgetShell all read
// from this one source so labels/tints/categories never drift.
//
// 5.31 rebin: categories are now the six handoff families
// (lesson · management · assessment · language · wellbeing · utilities). The
// table covers ALL union members so `widgetMeta()` always resolves a header for
// a widget rendered from an existing board/fixture — even a RETIRED type. Only
// the `addable` survivors appear in the picker / widget library; retired
// generics (deduped into a named survivor per Ultraplan §4.2) keep their
// metadata + body for backward-compatible rendering but are not offered.

import type { WidgetType } from "@/lib/types";
import type { TeachIconName } from "./icons";
import type { BoardTint } from "./types";

/** The six handoff widget families (Ultraplan §4). */
export type WidgetCategory =
  | "lesson"
  | "management"
  | "assessment"
  | "language"
  | "wellbeing"
  | "utilities";

export interface WidgetMeta {
  type: WidgetType;
  /** Human label shown in the picker / pills. */
  label: string;
  /** Short uppercase kicker shown in the widget header (e.g. "VISUAL TIMER"). */
  kicker: string;
  icon: TeachIconName;
  tint: BoardTint;
  category: WidgetCategory;
  /** Whether this type is offered in the picker / widget library. Retired
   *  generics (deduped per §4.2) set this `false`: still renderable from an
   *  existing board, just not addable. Defaults to `true` when omitted. */
  addable?: boolean;
}

/** Complete metadata for every widget type. Ordered so the picker mirrors the
 *  handoff: the addable survivors lead each category; retired generics trail at
 *  the end (they never reach the picker — `addable: false`). */
const ALL_WIDGETS: readonly WidgetMeta[] = [
  // ── Lesson Essentials ─────────────────────────────────────────────────────
  {
    type: "learning-target",
    label: "Learning Target",
    kicker: "LEARNING TARGET",
    icon: "target",
    tint: "sky",
    category: "lesson",
  },
  {
    type: "now-next-then",
    label: "Now / Next / Then",
    kicker: "NOW · NEXT · THEN",
    icon: "rotate",
    tint: "lavender",
    category: "lesson",
  },
  {
    type: "directions",
    label: "Directions",
    kicker: "DIRECTIONS",
    icon: "check",
    tint: "mint",
    category: "lesson",
  },
  {
    type: "materials-needed",
    label: "Materials",
    kicker: "MATERIALS NEEDED",
    icon: "grid",
    tint: "peach",
    category: "lesson",
  },
  {
    type: "work-completed",
    label: "Work Completed",
    kicker: "WORK COMPLETED",
    icon: "check",
    tint: "mint",
    category: "lesson",
  },
  {
    type: "lesson-flow",
    label: "Lesson Flow",
    kicker: "LESSON FLOW",
    icon: "notes",
    tint: "pink",
    category: "lesson",
  },
  // ── Routines & Management ─────────────────────────────────────────────────
  {
    type: "transition",
    label: "Transition",
    kicker: "TRANSITION",
    icon: "rotate",
    tint: "mint",
    category: "management",
  },
  {
    type: "attention-signal",
    label: "Attention Signal",
    kicker: "ATTENTION SIGNAL",
    icon: "bell",
    tint: "sky",
    category: "management",
  },
  {
    type: "voice-movement",
    label: "Voice & Movement",
    kicker: "VOICE + MOVEMENT",
    icon: "mic",
    tint: "lavender",
    category: "management",
  },
  {
    type: "when-done",
    label: "When You're Done",
    kicker: "WHEN DONE",
    icon: "flag",
    tint: "peach",
    category: "management",
  },
  {
    type: "student-jobs",
    label: "Student Jobs",
    kicker: "STUDENT JOBS",
    icon: "users",
    tint: "yellow",
    category: "management",
  },
  {
    type: "traffic",
    label: "Traffic Light",
    kicker: "TRAFFIC LIGHT",
    icon: "traffic",
    tint: "none",
    category: "management",
  },
  {
    type: "work-sound",
    label: "Work Sound",
    kicker: "WORK SOUND",
    icon: "mic",
    tint: "sky",
    category: "management",
  },
  // ── Assessment & Support ──────────────────────────────────────────────────
  {
    type: "exit-ticket",
    label: "Exit Ticket",
    kicker: "EXIT TICKET",
    icon: "check",
    tint: "lavender",
    category: "assessment",
  },
  {
    type: "understanding-check",
    label: "Understanding Check",
    kicker: "UNDERSTANDING CHECK",
    icon: "poll",
    tint: "mint",
    category: "assessment",
  },
  {
    type: "help-queue",
    label: "Help Queue",
    kicker: "HELP QUEUE",
    icon: "users",
    tint: "peach",
    category: "assessment",
  },
  {
    type: "participation-tracker",
    label: "Participation",
    kicker: "PARTICIPATION",
    icon: "users",
    tint: "sky",
    category: "assessment",
  },
  {
    type: "question-parking-lot",
    label: "Parking Lot",
    kicker: "QUESTION PARKING LOT",
    icon: "pin",
    tint: "pink",
    category: "assessment",
  },
  // ── Small Groups & Language ───────────────────────────────────────────────
  {
    type: "center-rotation",
    label: "Center Rotation",
    kicker: "CENTER ROTATION",
    icon: "rotate",
    tint: "sky",
    category: "language",
  },
  {
    type: "teacher-table",
    label: "Teacher Table",
    kicker: "TEACHER TABLE",
    icon: "users",
    tint: "mint",
    category: "language",
  },
  {
    type: "vocabulary",
    label: "Vocabulary",
    kicker: "KEY WORDS",
    icon: "text",
    tint: "sky",
    category: "language",
  },
  {
    type: "sentence-frames",
    label: "Sentence Frames",
    kicker: "SENTENCE FRAMES",
    icon: "text",
    tint: "peach",
    category: "language",
  },
  {
    type: "discussion-protocol",
    label: "Discussion",
    kicker: "DISCUSSION PROTOCOL",
    icon: "users",
    tint: "sky",
    category: "language",
  },
  // ── Regulation & Teacher Tools (Well-Being) ───────────────────────────────
  {
    type: "brain-break",
    label: "Brain Break",
    kicker: "BRAIN BREAK",
    icon: "star",
    tint: "lavender",
    category: "wellbeing",
  },
  {
    type: "calm-corner",
    label: "Calm Corner",
    kicker: "CALM CORNER",
    icon: "star",
    tint: "mint",
    category: "wellbeing",
  },
  {
    type: "class-points",
    label: "Class Points",
    kicker: "CLASS POINTS",
    icon: "trophy",
    tint: "mint",
    category: "wellbeing",
  },
  {
    type: "teacher-notes",
    label: "Teacher Notes",
    kicker: "PRIVATE NOTES",
    icon: "notes",
    tint: "peach",
    category: "wellbeing",
  },
  {
    type: "mini-whiteboard",
    label: "Mini Whiteboard",
    kicker: "MINI WHITEBOARD",
    icon: "model",
    tint: "sky",
    category: "wellbeing",
  },
  // ── Utilities ─────────────────────────────────────────────────────────────
  {
    type: "timer",
    label: "Timer",
    kicker: "VISUAL TIMER",
    icon: "timer",
    tint: "yellow",
    category: "utilities",
  },
  {
    type: "clock",
    label: "Clock",
    kicker: "CLOCK",
    icon: "timer",
    tint: "sky",
    category: "utilities",
  },
  {
    type: "countdown",
    label: "Countdown",
    kicker: "COUNTDOWN",
    icon: "calendar",
    tint: "pink",
    category: "utilities",
  },
  {
    type: "dice",
    label: "Dice",
    kicker: "DICE",
    icon: "dice",
    tint: "peach",
    category: "utilities",
  },
  {
    type: "scoreboard",
    label: "Scoreboard",
    kicker: "SCOREBOARD",
    icon: "trophy",
    tint: "lavender",
    category: "utilities",
  },
  {
    type: "poll",
    label: "Poll",
    kicker: "QUICK POLL",
    icon: "poll",
    tint: "lavender",
    category: "utilities",
  },
  {
    type: "text",
    label: "Text",
    kicker: "TEXT",
    icon: "text",
    tint: "yellow",
    category: "utilities",
  },
  {
    type: "namepick",
    label: "Name Picker",
    kicker: "NAME PICKER",
    icon: "shuffle",
    tint: "peach",
    category: "utilities",
  },
  {
    type: "sound",
    label: "Sound Level",
    kicker: "SOUND LEVEL",
    icon: "mic",
    tint: "yellow",
    category: "utilities",
  },
  {
    type: "groups",
    label: "Groups",
    kicker: "STUDENT GROUPS",
    icon: "users",
    tint: "mint",
    category: "utilities",
  },
  {
    type: "note-view",
    label: "Resource Slides",
    kicker: "RESOURCE VIEW",
    icon: "slides",
    tint: "sky",
    category: "utilities",
  },
  {
    type: "resource",
    label: "Resource",
    kicker: "RESOURCE",
    icon: "embed",
    tint: "none",
    category: "utilities",
  },
  // ── Retired generics (deduped per §4.2; metadata kept for header rendering,
  //    body kept in the dispatch, but NOT offered in the picker) ─────────────
  {
    type: "objective",
    label: "I Can",
    kicker: "OBJECTIVE",
    icon: "target",
    tint: "sky",
    category: "lesson",
    addable: false,
  },
  {
    type: "notes",
    label: "Notes",
    kicker: "TEACHER NOTES",
    icon: "notes",
    tint: "yellow",
    category: "wellbeing",
    addable: false,
  },
  {
    type: "agenda",
    label: "Agenda",
    kicker: "AGENDA",
    icon: "check",
    tint: "pink",
    category: "lesson",
    addable: false,
  },
  {
    type: "stopwatch",
    label: "Stopwatch",
    kicker: "STOPWATCH",
    icon: "timer",
    tint: "mint",
    category: "utilities",
    addable: false,
  },
  {
    type: "model",
    label: "Model It",
    kicker: "MODEL IT",
    icon: "model",
    tint: "mint",
    category: "lesson",
    addable: false,
  },
  {
    type: "manipulatives",
    label: "Manipulatives",
    kicker: "MANIPULATIVES",
    icon: "grid",
    tint: "mint",
    category: "lesson",
    addable: false,
  },
  {
    type: "slides",
    label: "Slides",
    kicker: "SLIDES",
    icon: "slides",
    tint: "sky",
    category: "utilities",
    addable: false,
  },
  {
    type: "youtube",
    label: "YouTube",
    kicker: "VIDEO",
    icon: "youtube",
    tint: "none",
    category: "utilities",
    addable: false,
  },
  {
    type: "embed",
    label: "Embed",
    kicker: "EMBED",
    icon: "embed",
    tint: "none",
    category: "utilities",
    addable: false,
  },
  {
    type: "names",
    label: "Names",
    kicker: "NAME PICKER",
    icon: "star",
    tint: "peach",
    category: "utilities",
    addable: false,
  },
  {
    type: "soundlevel",
    label: "Sound Level",
    kicker: "SOUND LEVEL",
    icon: "mic",
    tint: "yellow",
    category: "utilities",
    addable: false,
  },
  {
    type: "work_symbols",
    label: "Work Mode",
    kicker: "WORK SYMBOLS",
    icon: "users",
    tint: "sky",
    category: "management",
    addable: false,
  },
];

/** The addable widgets, in picker order (retired generics filtered out). */
export const WIDGET_CATALOG: readonly WidgetMeta[] = ALL_WIDGETS.filter(
  (m) => m.addable !== false,
);

const BY_TYPE: Record<WidgetType, WidgetMeta> = ALL_WIDGETS.reduce(
  (acc, meta) => {
    acc[meta.type] = meta;
    return acc;
  },
  {} as Record<WidgetType, WidgetMeta>,
);

/** Look up a widget type's metadata. Defined for every union member (including
 *  retired types), so a header always resolves. */
export function widgetMeta(type: WidgetType): WidgetMeta {
  return BY_TYPE[type];
}

/** Human label for a picker category (used as a section header). */
export const CATEGORY_LABEL: Record<WidgetCategory, string> = {
  lesson: "Lesson",
  management: "Management",
  assessment: "Assessment",
  language: "Language",
  wellbeing: "Well-Being",
  utilities: "Utilities",
};

/** Category order in the picker. */
export const CATEGORY_ORDER: readonly WidgetCategory[] = [
  "lesson",
  "management",
  "assessment",
  "language",
  "wellbeing",
  "utilities",
];
