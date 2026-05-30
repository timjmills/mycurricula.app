// catalog.ts — the static metadata for the 12 widget types: display label,
// icon, board tint, picker category, and the short kicker shown in the widget
// header (docs/teach-view-plan.md §4.4). The WidgetPicker, BoardEmptyState, and
// WidgetShell all read from this one source so labels/tints never drift.

import type { WidgetType } from "@/lib/types";
import type { TeachIconName } from "./icons";
import type { BoardTint } from "./types";

/** The picker's grouping buckets (plan §4.4). `classroom` holds the Phase 3
 *  live management tools (traffic light, work symbols, sound level). */
export type WidgetCategory =
  | "display"
  | "timing"
  | "engagement"
  | "classroom"
  | "content"
  | "utility";

export interface WidgetMeta {
  type: WidgetType;
  /** Human label shown in the picker / pills. */
  label: string;
  /** Short uppercase kicker shown in the widget header (e.g. "VISUAL TIMER"). */
  kicker: string;
  icon: TeachIconName;
  tint: BoardTint;
  category: WidgetCategory;
}

/** Ordered to mirror the prototype picker (T5). */
export const WIDGET_CATALOG: readonly WidgetMeta[] = [
  {
    type: "objective",
    label: "I Can",
    kicker: "OBJECTIVE",
    icon: "target",
    tint: "sky",
    category: "display",
  },
  {
    type: "agenda",
    label: "Agenda",
    kicker: "AGENDA",
    icon: "check",
    tint: "pink",
    category: "display",
  },
  {
    type: "groups",
    label: "Groups",
    kicker: "STUDENT GROUPS",
    icon: "users",
    tint: "mint",
    category: "display",
  },
  {
    type: "timer",
    label: "Timer",
    kicker: "VISUAL TIMER",
    icon: "timer",
    tint: "yellow",
    category: "timing",
  },
  {
    type: "poll",
    label: "Poll",
    kicker: "QUICK POLL",
    icon: "poll",
    tint: "lavender",
    category: "engagement",
  },
  {
    type: "names",
    label: "Names",
    kicker: "NAME PICKER",
    icon: "star",
    tint: "peach",
    category: "engagement",
  },
  {
    type: "notes",
    label: "Notes",
    kicker: "TEACHER NOTES",
    icon: "notes",
    tint: "yellow",
    category: "display",
  },
  {
    type: "model",
    label: "Model It",
    kicker: "MODEL IT",
    icon: "model",
    tint: "mint",
    category: "display",
  },
  {
    type: "manipulatives",
    label: "Manipulatives",
    kicker: "MANIPULATIVES",
    icon: "grid",
    tint: "mint",
    category: "content",
  },
  {
    type: "slides",
    label: "Slides",
    kicker: "SLIDES",
    icon: "slides",
    tint: "sky",
    category: "content",
  },
  {
    type: "youtube",
    label: "YouTube",
    kicker: "VIDEO",
    icon: "youtube",
    tint: "none",
    category: "content",
  },
  {
    type: "embed",
    label: "Embed",
    kicker: "EMBED",
    icon: "embed",
    tint: "none",
    category: "content",
  },
  // ── Phase 3 interactive library ───────────────────────────────────────────
  {
    type: "stopwatch",
    label: "Stopwatch",
    kicker: "STOPWATCH",
    icon: "timer",
    tint: "mint",
    category: "timing",
  },
  {
    type: "clock",
    label: "Clock",
    kicker: "CLOCK",
    icon: "timer",
    tint: "sky",
    category: "timing",
  },
  {
    type: "countdown",
    label: "Countdown",
    kicker: "COUNTDOWN",
    icon: "calendar",
    tint: "pink",
    category: "timing",
  },
  {
    type: "dice",
    label: "Dice",
    kicker: "DICE",
    icon: "dice",
    tint: "peach",
    category: "engagement",
  },
  {
    type: "scoreboard",
    label: "Scoreboard",
    kicker: "SCOREBOARD",
    icon: "trophy",
    tint: "lavender",
    category: "engagement",
  },
  {
    type: "traffic",
    label: "Traffic Light",
    kicker: "TRAFFIC LIGHT",
    icon: "traffic",
    tint: "none",
    category: "classroom",
  },
  {
    type: "work_symbols",
    label: "Work Mode",
    kicker: "WORK SYMBOLS",
    icon: "users",
    tint: "sky",
    category: "classroom",
  },
  {
    type: "soundlevel",
    label: "Sound Level",
    kicker: "SOUND LEVEL",
    icon: "mic",
    tint: "yellow",
    category: "classroom",
  },
  {
    type: "text",
    label: "Text",
    kicker: "TEXT",
    icon: "text",
    tint: "yellow",
    category: "display",
  },
];

const BY_TYPE: Record<WidgetType, WidgetMeta> = WIDGET_CATALOG.reduce(
  (acc, meta) => {
    acc[meta.type] = meta;
    return acc;
  },
  {} as Record<WidgetType, WidgetMeta>,
);

/** Look up a widget type's metadata. */
export function widgetMeta(type: WidgetType): WidgetMeta {
  return BY_TYPE[type];
}

/** Human label for a picker category (used as a section header). */
export const CATEGORY_LABEL: Record<WidgetCategory, string> = {
  display: "Display",
  timing: "Timing",
  engagement: "Engagement",
  classroom: "Classroom tools",
  content: "Content embed",
  utility: "Utilities",
};

/** Category order in the picker. */
export const CATEGORY_ORDER: readonly WidgetCategory[] = [
  "display",
  "timing",
  "engagement",
  "classroom",
  "content",
  "utility",
];
