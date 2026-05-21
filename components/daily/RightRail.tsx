"use client";

// RightRail.tsx — the Daily / Weekly view's right-most content column.
//
// MED-5: converted from a stacked+resizable panel trio to a TABBED rail.
// A tab strip at the top shows three tabs:
//   • Resources — the selected lesson's (or week's) combined resources.
//   • To-do     — today's to-dos: checkable rows + quick-add.
//   • Chat      — the day's flat team chat thread + composer.
//
// Exactly one widget is shown at full height at a time. The active tab
// persists to localStorage so the rail remembers where the teacher left off.
//
// Preserved from the original stacked-panel design:
//   • ResourcesPanel lesson-scoping (mode="day" / "week", onClearLesson).
//   • Hide-rail toggle and responsive collapse — both are owned by the
//     consuming shell (DailyView / WeeklyShell), not by this component;
//     nothing here changes that contract.
//   • The rail's cp-subj cascade for subject colors in ResourcesPanel.
//   • The aria-label region differentiation (day vs. week mode).
//
// The dnd-kit panel-reorder, per-panel collapse, and PaneSplitter resize
// machinery have been removed — they are no longer meaningful when only one
// panel is visible at a time (MED-5 intent).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import type { Lesson } from "@/lib/types";
import { ResourcesPanel } from "./ResourcesPanel";
import { TodayTodos } from "./TodayTodos";
import { Shoutbox } from "./Shoutbox";
import styles from "./RightRail.module.css";

// ── PanelDragHandleProps — kept as a re-export for the three panel
// components (ResourcesPanel, TodayTodos, Shoutbox) that import the type
// from this file. The tabbed rail no longer uses drag-to-reorder, but
// the type must stay exported so those components continue to compile.
// Their `dragHandleProps` prop is optional — they render cleanly without it.
export interface PanelDragHandleProps {
  /** setActivatorNodeRef from useSortable — the grip is the SOLE activator. */
  ref?: (el: HTMLElement | null) => void;
  /** dnd-kit synthetic listeners (pointer + keyboard activation). */
  listeners?: SyntheticListenerMap;
  /** dnd-kit a11y attributes (role, aria-roledescription, etc.). */
  attributes?: DraggableAttributes;
  /** Human-readable label for the grip's aria-label. */
  label?: string;
}

// ── Tab definitions ───────────────────────────────────────────────────────

const TAB_IDS = ["resources", "todos", "chat"] as const;
type TabId = (typeof TAB_IDS)[number];

const TAB_LABEL: Record<TabId, string> = {
  resources: "Resources",
  todos: "To-do",
  chat: "Chat",
};

const DEFAULT_TAB: TabId = "resources";
const TAB_STORAGE_KEY = "mycurricula:daily-right-rail-tab";

function isTabId(v: unknown): v is TabId {
  return typeof v === "string" && (TAB_IDS as readonly string[]).includes(v);
}

function readTab(): TabId {
  if (typeof window === "undefined") return DEFAULT_TAB;
  try {
    const raw = window.localStorage.getItem(TAB_STORAGE_KEY);
    if (raw && isTabId(raw)) return raw;
  } catch {
    // localStorage unavailable — use default.
  }
  return DEFAULT_TAB;
}

function writeTab(tab: TabId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TAB_STORAGE_KEY, tab);
  } catch {
    // Storage full / unavailable — preference simply won't persist; non-fatal.
  }
}

// ── RightRail ────────────────────────────────────────────────────────────

interface RightRailProps {
  /** The currently-selected lesson, or null. Drives the Resources panel in
   *  day mode. Ignored in week mode (the panel aggregates across `lessons`
   *  instead). */
  lesson: Lesson | null;
  /** Active week — scopes the shoutbox thread and the Resources headline. */
  week: number;
  /** Active day index, 0 = Sunday. */
  day: number;
  /**
   * Optional rail scope.
   *   • "day"  (default) — existing Daily-view behavior: Resources reflects
   *                        the selected `lesson`.
   *   • "week"           — Weekly-view behavior: Resources aggregates across
   *                        every lesson in `lessons`. To-dos and Chat keep
   *                        their existing day-scoped behavior.
   */
  mode?: "day" | "week";
  /**
   * Optional list of lessons to aggregate across in week mode. Required
   * only when `mode === "week"`; ignored otherwise.
   */
  lessons?: Lesson[];
  /**
   * When the rail is in lesson-scoped day mode (a card is selected on
   * /weekly), this callback is wired to the Resources panel's "Back to
   * week" affordance. Omit in pure day mode.
   */
  onClearLesson?: () => void;
}

export function RightRail({
  lesson,
  week,
  day,
  mode = "day",
  lessons,
  onClearLesson,
}: RightRailProps): ReactNode {
  // The `cp-subj` wrapper on the rail forwards the selected lesson's subject
  // color into ResourcesPanel via the cascading --c / --cl / --cd properties.
  // In week mode (no single "current" subject) the class chain drops back to
  // the neutral defaults defined in tokens.css.
  const subjectClass = mode === "day" && lesson ? lesson.subject : "";

  // Stable identity for the lessons array forwarded to ResourcesPanel in week
  // mode. Falling back to an empty array keeps the prop's TS type narrow
  // (Lesson[]) and avoids "new array per render" cascades inside the panel.
  const weekLessons = useMemo<Lesson[]>(() => lessons ?? [], [lessons]);

  // ── Active tab — SSR-safe hydration ────────────────────────────────────
  // Initialise to the default so server-rendered HTML and the first client
  // render match. The post-mount effect loads the persisted value. Same
  // hydration-safe pattern used throughout this codebase.
  const [activeTab, setActiveTab] = useState<TabId>(DEFAULT_TAB);
  const hydratedRef = useRef(false);

  useEffect(() => {
    setActiveTab(readTab());
    hydratedRef.current = true;
  }, []);

  const selectTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    if (hydratedRef.current) writeTab(tab);
  }, []);

  const railAriaLabel =
    mode === "week"
      ? "Week resources and day planning"
      : "Lesson resources and day planning";

  return (
    <aside
      className={`${styles.rail} cp-subj ${subjectClass}`}
      aria-label={railAriaLabel}
    >
      {/* ── Tab strip ──────────────────────────────────────────────────────
          Three compact tabs pinned to the rail top. The active tab uses an
          ink-900 underline indicator; inactive tabs are muted. Full keyboard
          navigation: arrow keys move between tabs (roving-tabindex pattern);
          Enter / Space selects; only the active tab is in the document's tab
          order. WCAG AA contrast maintained at all sizes. */}
      <div
        className={styles.tabStrip}
        role="tablist"
        aria-label="Rail panels"
        onKeyDown={(e) => {
          const idx = TAB_IDS.indexOf(activeTab);
          if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            selectTab(TAB_IDS[(idx + 1) % TAB_IDS.length]!);
          } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault();
            selectTab(TAB_IDS[(idx + TAB_IDS.length - 1) % TAB_IDS.length]!);
          }
        }}
      >
        {TAB_IDS.map((id) => {
          const isActive = id === activeTab;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`rail-tab-${id}`}
              aria-selected={isActive}
              aria-controls={`rail-panel-${id}`}
              // Roving tabindex: only the active tab is keyboard-reachable
              // from outside the strip; within the strip, arrow keys navigate.
              tabIndex={isActive ? 0 : -1}
              className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
              onClick={() => selectTab(id)}
            >
              {TAB_LABEL[id]}
            </button>
          );
        })}
      </div>

      {/* ── Panel area — one widget at full height ───────────────────────
          Each panel div carries role="tabpanel", aria-labelledby, and
          hidden so assistive technology only reads the active panel.
          CSS shows only the active panel via display:flex; the rest are
          hidden via [hidden] { display:none }. This avoids unmounting /
          remounting panel state on every tab switch (e.g. ResourcesPanel's
          category selection, the Shoutbox's draft message). */}
      <div className={styles.panelArea}>
        <div
          id="rail-panel-resources"
          role="tabpanel"
          aria-labelledby="rail-tab-resources"
          className={styles.panel}
          hidden={activeTab !== "resources"}
        >
          <ResourcesPanel
            lesson={lesson}
            collapsed={false}
            onToggleCollapsed={() => {
              /* no-op — panels no longer collapse inside the tabbed rail;
                 the tab strip is the visibility control */
            }}
            mode={mode}
            lessons={mode === "week" ? weekLessons : undefined}
            week={week}
            onClearLesson={onClearLesson}
          />
        </div>
        <div
          id="rail-panel-todos"
          role="tabpanel"
          aria-labelledby="rail-tab-todos"
          className={styles.panel}
          hidden={activeTab !== "todos"}
        >
          <TodayTodos
            collapsed={false}
            onToggleCollapsed={() => {
              /* no-op */
            }}
          />
        </div>
        <div
          id="rail-panel-chat"
          role="tabpanel"
          aria-labelledby="rail-tab-chat"
          className={styles.panel}
          hidden={activeTab !== "chat"}
        >
          <Shoutbox
            week={week}
            day={day}
            collapsed={false}
            onToggleCollapsed={() => {
              /* no-op */
            }}
          />
        </div>
      </div>
    </aside>
  );
}
