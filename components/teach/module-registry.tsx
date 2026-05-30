"use client";

// module-registry.tsx — the Teach view's module catalog.
//
// Every dockable Teach module (a `ModuleId` from lib/teach/teach-types.ts) has
// exactly one entry here: its label, its rail/tab icon, and a `render` that
// produces the module's body given the current lesson context. The registry is
// TOTAL — every ModuleId has an entry — so the panels-ui half (TeachTabStrip /
// TeachIconRail / the "+" picker) can look up any id without a missing-key
// guard.
//
// Wave 1 wires THREE real modules (Resources / Chat / To-do) to the thin
// adapters in ./modules that reuse the existing Daily panels. The other seven
// (Lessons / Lesson / Boards / Notes / Groups / Class / Tools) land in later
// waves; for now they render a calm "coming in a later wave" placeholder so the
// registry stays total and the panel system can host them as tabs/icons today.
//
// ── Icons ──────────────────────────────────────────────────────────────────
// The shell's rail icons (components/shell/rail-icons.tsx) are coupled to
// `RailIconId` + the GlobalRail click behaviors (navigate, toggle a slide-out),
// so they can't be reused as plain glyphs here without dragging that wiring in.
// Instead we define small Teach-scoped glyphs in the SAME stroked, 20px,
// currentColor, Lucide-style idiom the rest of the app uses (matching
// rail-icons.tsx and the Daily panel headers) — no new icon dependency, just a
// few inline SVGs that read consistently alongside the shipped icon set.

import type { ReactNode } from "react";
import type { Lesson } from "@/lib/types";
import type { ModuleId } from "@/lib/teach/teach-types";
import { ResourcesModule } from "./modules/ResourcesModule";
import { ChatModule } from "./modules/ChatModule";
import { TodoModule } from "./modules/TodoModule";
import styles from "./module-registry.module.css";

// ── Module render context ────────────────────────────────────────────────
// What a module needs to paint its body. Wave 1 only carries the active
// lesson; later waves widen this (week/day are read from app-state inside the
// adapters that need them, e.g. ChatModule, so they stay out of the context).

export interface TeachModuleContext {
  /** The lesson the teacher is currently delivering, or null/undefined when
   *  none is selected. Accepts `null` as well as `undefined` so a caller
   *  holding a `Lesson | null` selection (the common shape — see DailyView's
   *  `selectedLesson`) can pass it straight through without coercing. */
  lesson?: Lesson | null;
}

// ── Module definition ──────────────────────────────────────────────────────

export interface TeachModuleDef {
  id: ModuleId;
  /** Human label for the tab + rail tooltip. */
  label: string;
  /** The rail/tab glyph (20px, currentColor, stroked). */
  icon: ReactNode;
  /** Produce the module body for the given lesson context. */
  render(ctx: TeachModuleContext): ReactNode;
}

// ── Glyphs ───────────────────────────────────────────────────────────────
// 20px stroked outline icons matching rail-icons.tsx. aria-hidden — the tab /
// rail button carries the accessible label.

const svgProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function LessonsIcon(): ReactNode {
  return (
    <svg {...svgProps}>
      <line x1="8" y1="6" x2="20" y2="6" />
      <line x1="8" y1="12" x2="20" y2="12" />
      <line x1="8" y1="18" x2="20" y2="18" />
      <line x1="4" y1="6" x2="4.01" y2="6" />
      <line x1="4" y1="12" x2="4.01" y2="12" />
      <line x1="4" y1="18" x2="4.01" y2="18" />
    </svg>
  );
}

function LessonIcon(): ReactNode {
  return (
    <svg {...svgProps}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8.5" y1="13" x2="15.5" y2="13" />
      <line x1="8.5" y1="17" x2="13" y2="17" />
    </svg>
  );
}

function BoardsIcon(): ReactNode {
  return (
    <svg {...svgProps}>
      <rect x="3.5" y="4" width="7" height="7" rx="1" />
      <rect x="13.5" y="4" width="7" height="7" rx="1" />
      <rect x="3.5" y="13" width="7" height="7" rx="1" />
      <rect x="13.5" y="13" width="7" height="7" rx="1" />
    </svg>
  );
}

function NotesIcon(): ReactNode {
  return (
    <svg {...svgProps}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function GroupsIcon(): ReactNode {
  return (
    <svg {...svgProps}>
      <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
      <circle cx="10" cy="8" r="3.2" />
      <path d="M20 19v-1.5a3.5 3.5 0 0 0-2.6-3.38" />
      <path d="M15.5 5.2a3.2 3.2 0 0 1 0 5.6" />
    </svg>
  );
}

function ClassIcon(): ReactNode {
  return (
    <svg {...svgProps}>
      <path d="M3 6.5 12 3l9 3.5L12 10z" />
      <path d="M6 8.5V14c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V8.5" />
      <line x1="21" y1="6.5" x2="21" y2="12" />
    </svg>
  );
}

function ToolsIcon(): ReactNode {
  return (
    <svg {...svgProps}>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4l-6 6 3 3 6-6a4 4 0 0 0 5.4-5.4l-2.5 2.5-2-2z" />
    </svg>
  );
}

function ResourcesIcon(): ReactNode {
  return (
    <svg {...svgProps}>
      <path d="M3 6.5a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-11.5z" />
      <path d="M10 13.5l1.5 1.5 3-3" />
    </svg>
  );
}

function ChatIcon(): ReactNode {
  return (
    <svg {...svgProps}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function TodoIcon(): ReactNode {
  return (
    <svg {...svgProps}>
      <path d="M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1z" />
      <path d="M16 4.5h2a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1h2" />
      <polyline points="8.5 12 10.5 14 14 10.5" />
      <line x1="8.5" y1="17" x2="15.5" y2="17" />
    </svg>
  );
}

// ── Placeholder body for not-yet-built modules ─────────────────────────────
// A calm centered note. Kept token-only (no hard-coded color/size) so it reads
// as part of the system rather than a debug stub. Each placeholder names the
// wave it arrives in so the structure is legible.

function ComingSoon({ label, wave }: { label: string; wave: string }): ReactNode {
  return (
    <div className={styles.comingSoon}>
      <span className={styles.comingSoonLabel}>{label}</span>
      <span>Coming in {wave}.</span>
    </div>
  );
}

// ── The registry ───────────────────────────────────────────────────────────
// Total over ModuleId. Real adapters for Resources / Chat / To-do; the rest
// render a labeled placeholder until their wave lands. Resources is the only
// module that consumes the render context (the lesson); Chat reads week/day
// from app-state inside its own adapter; To-do needs no context.

export const MODULE_REGISTRY: Record<ModuleId, TeachModuleDef> = {
  lessons: {
    id: "lessons",
    label: "Lessons",
    icon: <LessonsIcon />,
    render: () => <ComingSoon label="Lessons" wave="Wave 2" />,
  },
  lesson: {
    id: "lesson",
    label: "Lesson",
    icon: <LessonIcon />,
    render: () => <ComingSoon label="Lesson" wave="Wave 2" />,
  },
  boards: {
    id: "boards",
    label: "Boards",
    icon: <BoardsIcon />,
    render: () => <ComingSoon label="Boards" wave="Wave 2" />,
  },
  notes: {
    id: "notes",
    label: "Notes",
    icon: <NotesIcon />,
    render: () => <ComingSoon label="Notes" wave="Wave 2" />,
  },
  groups: {
    id: "groups",
    label: "Groups",
    icon: <GroupsIcon />,
    render: () => <ComingSoon label="Groups" wave="Wave 2" />,
  },
  class: {
    id: "class",
    label: "Class",
    icon: <ClassIcon />,
    render: () => <ComingSoon label="Class" wave="Wave 2" />,
  },
  tools: {
    id: "tools",
    label: "Tools",
    icon: <ToolsIcon />,
    render: () => <ComingSoon label="Tools" wave="Wave 2" />,
  },
  resources: {
    id: "resources",
    label: "Resources",
    icon: <ResourcesIcon />,
    render: (ctx) => <ResourcesModule lesson={ctx.lesson ?? null} />,
  },
  chat: {
    id: "chat",
    label: "Chat",
    icon: <ChatIcon />,
    render: () => <ChatModule />,
  },
  todo: {
    id: "todo",
    label: "To-do",
    icon: <TodoIcon />,
    render: () => <TodoModule />,
  },
};
