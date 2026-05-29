// modules-meta.ts — display metadata for the LEFT-side Teach modules
// (docs/teach-view-plan.md §3.1). The canonical module id set lives in
// `lib/use-teach-workspace.ts` (TEACH_MODULE_IDS); this file maps the
// LEFT subset to a human label, a keyboard shortcut hint, and the contextual
// onboarding-tooltip voice (CLAUDE.md §4 — tell the teacher what the module
// ACCOMPLISHES, not just its name).

import type { TeachModuleId } from "@/lib/use-teach-workspace";

/** The left-side module ids this zone renders, in default rail order. */
export const LEFT_MODULE_IDS = [
  "lessons",
  "lesson",
  "boards",
  "notes",
  "groups",
  "class",
  "tools",
] as const;

export type LeftModuleId = (typeof LEFT_MODULE_IDS)[number];

export function isLeftModuleId(id: TeachModuleId): id is LeftModuleId {
  return (LEFT_MODULE_IDS as readonly string[]).includes(id);
}

export interface LeftModuleMeta {
  label: string;
  /** Keyboard shortcut hint shown in the rail tooltip (Agent A owns wiring). */
  shortcut: string;
  /** Onboarding-tooltip voice — contextual, not a label restatement. */
  tooltip: string;
}

export const LEFT_MODULE_META: Record<LeftModuleId, LeftModuleMeta> = {
  lessons: {
    label: "Lessons",
    shortcut: "1",
    tooltip: "See the day's lessons and switch which one you're teaching",
  },
  lesson: {
    label: "Lesson",
    shortcut: "2",
    tooltip:
      "Read this lesson's objective and open it in Daily for the full plan",
  },
  boards: {
    label: "Boards",
    shortcut: "3",
    tooltip:
      "Switch teaching boards, add a board, or share your set with the team",
  },
  notes: {
    label: "Notes",
    shortcut: "4",
    tooltip: "Glance at the day's notes while you teach",
  },
  groups: {
    label: "Groups",
    shortcut: "5",
    tooltip: "Organise students into groups — kept only on this device",
  },
  class: {
    label: "Class",
    shortcut: "6",
    tooltip: "Your class roster — names stay on this device, never synced",
  },
  tools: {
    label: "Tools",
    shortcut: "7",
    tooltip: "Quick teaching tools (picker, dice, and more coming soon)",
  },
};
